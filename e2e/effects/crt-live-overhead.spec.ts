/**
 * Effects TASK-006 (REQ-006) — overhead of the live CRT Glass field, in a real
 * browser, on one matched app flow with Visual effects off and then on.
 *
 * The flow: open /generate, idle, choose an Anchor, scroll the form, go Home
 * and back. Each side records frame pacing (rAF intervals), long tasks, tap-to-
 * next-frame latency, scroll pacing, JS heap where Chromium exposes it, the
 * requests made and the renderer the browser reports. The profile is written
 * to the test output; no performance threshold is enforced (none was set).
 *
 * What does fail the spec: the field performing whole-screen capture, pixel
 * readback or per-frame encoding (canvas/WebGL readbacks, data-URL or blob
 * encoding, image bitmaps, stream capture or encoders, counted from before the
 * app loads), loading any resource of its own, or holding a canvas, image or
 * video element.
 */
import type { Page } from '@playwright/test'

import { CRT_FIELD_CONFIG } from '../../src/ui/crt-field/config'
import { appIdentity, expect, keepJson, openGenerate, settle, shippingConfiguration, syntheticApp, test } from './crt-live/harness'

/** Counts every capture, readback or encoding call, installed before the app runs. */
function instrument() {
  const counts: Record<string, number> = {}
  ;(window as unknown as { __captureCalls: Record<string, number> }).__captureCalls = counts
  const wrap = (owner: object | undefined, name: string, label: string) => {
    if (!owner) return
    const original = (owner as Record<string, unknown>)[name]
    if (typeof original !== 'function') return
    ;(owner as Record<string, unknown>)[name] = function (this: unknown, ...args: unknown[]) {
      counts[label] = (counts[label] ?? 0) + 1
      return (original as (...a: unknown[]) => unknown).apply(this, args)
    }
  }
  wrap(HTMLCanvasElement.prototype, 'toDataURL', 'canvas.toDataURL')
  wrap(HTMLCanvasElement.prototype, 'toBlob', 'canvas.toBlob')
  wrap(HTMLCanvasElement.prototype, 'captureStream', 'canvas.captureStream')
  wrap(HTMLCanvasElement.prototype, 'getContext', 'canvas.getContext')
  wrap(CanvasRenderingContext2D.prototype, 'getImageData', '2d.getImageData')
  wrap(CanvasRenderingContext2D.prototype, 'drawImage', '2d.drawImage')
  wrap(globalThis.OffscreenCanvas?.prototype, 'convertToBlob', 'offscreen.convertToBlob')
  wrap(globalThis.WebGLRenderingContext?.prototype, 'readPixels', 'webgl.readPixels')
  wrap(globalThis.WebGL2RenderingContext?.prototype, 'readPixels', 'webgl2.readPixels')
  wrap(globalThis, 'createImageBitmap', 'createImageBitmap')
  wrap(navigator.mediaDevices, 'getDisplayMedia', 'getDisplayMedia')
  for (const name of ['MediaRecorder', 'VideoEncoder', 'ImageEncoder', 'ImageCapture']) {
    const Original = (globalThis as Record<string, unknown>)[name]
    if (typeof Original !== 'function') continue
    ;(globalThis as Record<string, unknown>)[name] = new Proxy(Original as object, {
      construct(target, args) {
        counts[`new ${name}`] = (counts[`new ${name}`] ?? 0) + 1
        return Reflect.construct(target as new (...a: unknown[]) => object, args)
      },
    })
  }
  const longTasks: number[] = []
  ;(window as unknown as { __longTasks: number[] }).__longTasks = longTasks
  try {
    new PerformanceObserver((list) => list.getEntries().forEach((entry) => longTasks.push(entry.duration)))
      .observe({ type: 'longtask', buffered: true })
  } catch {
    // Not supported: recorded as an empty list.
  }
}

/** rAF intervals over `ms`, optionally scrolling the form each frame. */
async function pacing(page: Page, ms: number, scroll: boolean) {
  return page.evaluate(async ({ ms, scroll }) => {
    const region = document.querySelector('main [role="region"], .clr-scroll-region') as HTMLElement | null
    const intervals: number[] = []
    let last = performance.now()
    const end = last + ms
    await new Promise<void>((done) => {
      const frame = (now: number) => {
        intervals.push(now - last)
        last = now
        if (scroll && region) region.scrollBy(0, Math.sin(now / 200) * 12)
        if (now < end) requestAnimationFrame(frame)
        else done()
      }
      requestAnimationFrame(frame)
    })
    const sorted = [...intervals].sort((a, b) => a - b)
    const pick = (q: number) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]! * 100) / 100
    return { frames: intervals.length, fps: Math.round((intervals.length / ms) * 1000 * 10) / 10, p50: pick(0.5), p95: pick(0.95), max: pick(1), over50ms: intervals.filter((i) => i > 50).length }
  }, { ms, scroll })
}

/** Tap on a real control to the next painted frame. */
async function tapLatency(page: Page) {
  const chip = page.getByRole('group', { name: 'Anchor' }).getByRole('button').first()
  const box = (await chip.boundingBox())!
  await page.evaluate(() => {
    const w = window as unknown as { __tap: number[] }
    w.__tap = []
    document.addEventListener('pointerdown', () => {
      const start = performance.now()
      requestAnimationFrame(() => requestAnimationFrame(() => w.__tap.push(performance.now() - start)))
    }, { once: true, capture: true })
  })
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.getByRole('button', { name: /generate workout/i })).toBeEnabled()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __tap: number[] }).__tap.length)).toBe(1)
  return page.evaluate(() => Math.round((window as unknown as { __tap: number[] }).__tap[0]! * 100) / 100)
}

async function rendererInfo(page: Page) {
  // A separate blank page, so this probe is never counted against the app.
  const probe = await page.context().newPage()
  const info = await probe.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl')
    if (!gl) return { webgl: false }
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return {
      webgl: true,
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    }
  })
  await probe.close()
  return info
}

test.describe('CRT Glass field overhead — matched flow, Visual effects off and on', () => {
  test('records the profile and finds no capture, readback, encoding or extra resource', async ({ browser, crtOrigin }, testInfo) => {
    test.setTimeout(150_000)
    const use = testInfo.project.use
    const profile: Record<string, unknown> = {}
    const counts: Record<string, Record<string, number>> = {}
    const requests: Record<string, string[]> = {}

    for (const effects of ['off', 'on'] as const) {
      const context = await browser.newContext({
        viewport: use.viewport, deviceScaleFactor: use.deviceScaleFactor, isMobile: use.isMobile,
        hasTouch: use.hasTouch, userAgent: use.userAgent, baseURL: crtOrigin, reducedMotion: 'no-preference',
      })
      const page = await context.newPage()
      await page.addInitScript(instrument)
      const app = await syntheticApp(page, crtOrigin, { skin: 'clear', effects })
      await openGenerate(page)
      await expect(page.locator('.clr-crt-field')).toHaveCount(effects === 'on' ? 1 : 0)
      if (effects === 'on') {
        expect(await page.locator('.clr-crt-field').locator('canvas, img, video, iframe').count(), 'no raster element').toBe(0)
      }
      const before = app.requested.length

      const idle = await pacing(page, 3_000, false)
      const tap = await tapLatency(page)
      const scroll = await pacing(page, 3_000, true)
      await page.getByRole('button', { name: 'Home' }).click()
      await expect(page).toHaveURL(/\/$/)
      await settle(page)
      const home = await pacing(page, 2_000, false)
      await openGenerate(page)

      const result = await page.evaluate(() => {
        const w = window as unknown as { __captureCalls: Record<string, number>; __longTasks: number[] }
        const memory = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory
        return {
          captureCalls: { ...w.__captureCalls },
          longTasks: { count: w.__longTasks.length, totalMs: Math.round(w.__longTasks.reduce((s, d) => s + d, 0)) },
          memory: memory ? { usedJSHeapBytes: memory.usedJSHeapSize, totalJSHeapBytes: memory.totalJSHeapSize } : 'not exposed',
          animations: document.getAnimations().filter((a) => a.playState === 'running').length,
        }
      })
      counts[effects] = result.captureCalls
      requests[effects] = [...new Set(app.requested.slice(before))].sort()
      profile[effects] = { idle, tapToNextFrameMs: tap, scroll, home, ...result, requestsDuringFlow: requests[effects].length }
      app.assertReadOnly()
      if (effects === 'on') profile.renderer = await rendererInfo(page)
      await context.close()
    }

    keepJson(testInfo, 'crt-live-overhead-profile.json', {
      purpose: 'Effects-off/on browser profile of one matched app flow. Recorded, not judged: no performance threshold was set.',
      flow: 'open /generate, idle 3 s, tap an Anchor, scroll the form 3 s, Home, idle 2 s, back to /generate',
      shippingConfiguration: shippingConfiguration(),
      app: appIdentity(),
      viewport: use.viewport,
      devicePixelRatio: use.deviceScaleFactor,
      environment: 'Playwright Chromium with mobile emulation; not physical-phone evidence',
      profile,
    })

    // No capture, readback or encoding with the field on beyond what the app does with it off.
    const capture = Object.entries(counts.on!).filter(([name, n]) => n > (counts.off![name] ?? 0))
    expect(capture, `the field captured, read back or encoded: ${JSON.stringify(capture)}`).toEqual([])
    // No resource of its own: the field loads nothing the app does not already load.
    expect(requests.on!.filter((path) => !requests.off!.includes(path)), 'extra resources with the field on').toEqual([])
    expect(CRT_FIELD_CONFIG.id).toBeTruthy()
  })
})
