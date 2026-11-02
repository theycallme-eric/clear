/**
 * Effects TASK-006 (REQ-006) — the CRT Glass field composed over the live app
 * shell, in a real browser: the measured basis for the sourced gap.
 *
 * Self-contained and test-only. This spec starts its own Vite server from this
 * workspace with synthetic, intercepted data (no write, no model call, nothing
 * external). The preserved checkpoint is served read-only by route
 * interception from `$CLEAR_EFFECTS_REFERENCE_DIR`, and the settings come from
 * `$CLEAR_EFFECTS_CURRENT_SETTINGS` (SHA-256 checked). Viewport and
 * device-pixel ratio are set per comparison. No shared Playwright
 * configuration is read for them or changed.
 *
 *   1. Matched pairs, actual `/generate`, 390 × 844, CLEAR, Signal, Vapour and
 *      Mono. Echo-only first: Visual effects on against off with no CRT field
 *      (none is mounted) and the ground held still, so the workout card's rear
 *      image is exposed left and below only and nothing leaks above, right or
 *      through the card. Then the composed treatment: the preserved host's own
 *      pass (`glass-effect.mjs` on the vendored PixiJS 8.22.0 / pixi-filters
 *      6.1.5, phase 0.5, seed 0.57) applied *test-side* to that Echo-only
 *      capture, written beside it for the owner's visual comparison.
 *   2. The gap, measured on those pairs. Two probes on the same capture show
 *      the pass reads the pixels beneath it: one output pixel moves when only
 *      its neighbour changes (edge softness), and one channel moves when only
 *      another channel changes (peak-relative colour protection and RGB
 *      scaling). No layer composited over live DOM can do either without the
 *      DOM's pixels, and the owner excludes a DOM-to-texture capture. That is
 *      why the product integration stopped (TASK-006.md, "Sourced gap").
 *   3. The live shell as it ships during the stop, all four skins: one
 *      atmosphere node across in-app navigation, blobs moving, scrolling, a
 *      loading sweep, a dialog backdrop, Visual effects off, reduced motion and
 *      a hidden tab; the shipped scanline owners paint once, no field and no
 *      capture exist, and input reaches its target.
 *
 * The test-side composed images are a reference rendering of what the
 * preserved pass would do to these pixels. They are not a product path, and
 * they are not an approval: the owner's visual approval is recorded only by the
 * owner. Earlier-settings historical images are not used as targets. Emulated
 * mobile Chromium with software GL is not phone evidence.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import type { Page, Route } from '@playwright/test'

import { bundledEffectsInput } from './reference-inputs'
import { parseEnvFile } from '../../scripts/dev-preflight/env.mjs'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { expect, test as base } from '../fixtures'
import { diff, encodePng, type DiffStats, type Frame } from './crt-glass-fidelity/pixels'

const OUT = resolve(process.cwd(), 'test-results/crt-composition-fidelity')
const WIDTH = 390
const HEIGHT = 844
const SETTINGS_SHA256 = '3169d4608c8babe17a20670bd59f53e3110c7ce917641786d33c2713943ca033'
const REFERENCE_ORIGIN = 'http://crt-composition-reference.localhost'
const HOST_FILES = [
  'crt-glass-motion/index.html', 'crt-glass-motion/study.mjs', 'crt-glass-motion/study.css',
  'crt-glass-motion/glass-effect.mjs', 'crt-glass-motion/motion-clock.mjs',
] as const
const VENDOR_FILES = ['crt-glass-motion/vendor/pixi.min.js', 'crt-glass-motion/vendor/filters.js'] as const
/** Earlier-settings renders: listed for provenance, never compared. */
const HISTORICAL = ['crt-glass-motion-study-02.jpg', 'crt-animation-controls-fixed.jpg', 'crt-grain-softness.jpg'] as const
/** The host's still state: `initialClock()` and `grainSeed()` of `motion-clock.mjs`. */
const STILL = { phase: 0.5, seed: 0.57 }
const SKINS = ['clear', 'signal', 'vapour', 'mono'] as const
type Skin = (typeof SKINS)[number]
type Settings = Record<string, number | boolean | string>

// ---------------------------------------------------------------------------
// Inputs. A missing one fails with its exact name; nothing is skipped.
// ---------------------------------------------------------------------------

function envValue(name: string): string {
  const exported = process.env[name]?.trim()
  if (exported) return exported
  for (const file of ['.env.runner.local', '.env.audit.local', '.env.local']) {
    const path = resolve(process.cwd(), file)
    if (!existsSync(path)) continue
    const value = parseEnvFile(readFileSync(path, 'utf8'))[name]?.trim()
    if (value) return value
  }
  const bundled = bundledEffectsInput(name)
  if (bundled) return bundled
  throw new Error(`TASK-006 blocker: ${name} is not set (execution prerequisite)`)
}

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

function loadInputs() {
  const root = resolve(envValue('CLEAR_EFFECTS_REFERENCE_DIR'))
  const files = Object.fromEntries([...HOST_FILES, ...VENDOR_FILES].map((name) => {
    const path = resolve(root, name)
    if (!existsSync(path)) throw new Error(`TASK-006 blocker: reference file ${name} is missing from CLEAR_EFFECTS_REFERENCE_DIR`)
    return [name, sha256(readFileSync(path))]
  }))
  const settingsBytes = readFileSync(envValue('CLEAR_EFFECTS_CURRENT_SETTINGS'))
  const settingsHash = sha256(settingsBytes)
  if (settingsHash !== SETTINGS_SHA256) throw new Error(`TASK-006 blocker: current settings SHA-256 is ${settingsHash}, expected ${SETTINGS_SHA256}`)
  const exported = JSON.parse(settingsBytes.toString('utf8')) as { settings: Settings }
  return { root, files, settings: exported.settings, settingsHash }
}

// ---------------------------------------------------------------------------
// This workspace's own app origin, with synthetic data.
// ---------------------------------------------------------------------------

const OWNER = '00000000-0000-4000-8000-000000000061'
const HOME_ID = '00000000-0000-4000-8000-000000000062'
const GYM_ID = '00000000-0000-4000-8000-000000000063'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}

async function waitForOrigin(origin: string, deadline: number) {
  while (Date.now() < deadline) {
    try {
      if ((await fetch(origin)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`TASK-006 blocker: the app origin ${origin} did not start`)
}

const test = base.extend<object, { appOrigin: string }>({
  appOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      const port = 5830 + workerInfo.parallelIndex
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [resolve(import.meta.dirname, '../../node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'], {
        env: { ...process.env, VITE_SUPABASE_URL: 'https://synthetic-crt-composition.supabase.invalid', VITE_SUPABASE_ANON_KEY: 'synthetic-crt-composition-public-placeholder' },
        stdio: 'ignore',
      })
      const closed = new Promise<void>((settle) => { server.once('exit', () => settle()); server.once('error', () => settle()) })
      try {
        await waitForOrigin(origin, Date.now() + 90_000)
        await use(origin)
      } finally {
        server.kill()
        await closed
      }
    },
    { scope: 'worker', timeout: 120_000 },
  ],
  baseURL: async ({ appOrigin }, use) => use(appOrigin),
})

async function syntheticApp(page: Page, origin: string, skin: Skin, effects: 'on' | 'off') {
  const writes: string[] = []
  const outbound: string[] = []
  const held: string[] = []
  await page.route('**/*', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === origin && ['GET', 'HEAD'].includes(request.method())) return route.continue()
    outbound.push(`${request.method()} ${url.origin}${url.pathname}`)
    return route.abort('blockedbyclient')
  })
  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/')) {
      // Held unanswered: the Loading host stays the screen. Nothing reaches a model.
      if (request.method() === 'POST') {
        held.push(url.pathname)
        return new Promise<void>(() => {})
      }
      writes.push(`${request.method()} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (request.method() === 'GET') {
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'balanced' })])
      if (name === 'locations') {
        return reply([
          fixtureLocation({ id: HOME_ID, user_id: OWNER, tier: 'full', name: 'Home gym', is_default: true }),
          fixtureLocation({ id: GYM_ID, user_id: OWNER, tier: 'full', name: 'Building gym', is_default: false }),
        ])
      }
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) return reply(name === 'resume_session' ? null : [])
    writes.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic write.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner, skin, effects }) => {
    if (sessionStorage.getItem('crt-composition-seeded')) return
    sessionStorage.setItem('crt-composition-seeded', '1')
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-crt-session', refreshToken: 'synthetic-crt-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-crt@example.invalid' },
    }))
    localStorage.setItem('clear.skin', skin)
    localStorage.setItem('clear.visual-effects', effects)
  }, { owner: OWNER, skin, effects })
  return {
    held,
    assertReadOnly() {
      expect(writes, 'no write and no model call').toEqual([])
      expect(outbound, 'nothing leaves the local origin').toEqual([])
    },
  }
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  })
}

async function openGenerate(page: Page) {
  await page.goto('/generate')
  await expect(page.getByRole('heading', { level: 1, name: 'Generate', exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Anchor' })).toBeVisible()
  await settle(page)
}

// ---------------------------------------------------------------------------
// Pixels.
// ---------------------------------------------------------------------------

/** A device-scale screenshot decoded by the browser, never resized. */
async function capture(page: Page): Promise<{ png: Buffer; frame: Frame }> {
  const png = await page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'device' })
  const out = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d', { colorSpace: 'srgb' })!
    context.drawImage(bitmap, 0, 0)
    const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data
    let binary = ''
    for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000))
    return { width: bitmap.width, height: bitmap.height, rgba: btoa(binary) }
  }, png.toString('base64'))
  return { png, frame: { width: out.width, height: out.height, rgba: Buffer.from(out.rgba, 'base64') } }
}

interface Rect { x: number; y: number; width: number; height: number }

function regionMask(frame: Frame, rect: Rect) {
  const x0 = Math.max(0, Math.round(rect.x))
  const y0 = Math.max(0, Math.round(rect.y))
  const x1 = Math.min(frame.width, Math.round(rect.x + rect.width))
  const y1 = Math.min(frame.height, Math.round(rect.y + rect.height))
  return (index: number) => {
    const x = index % frame.width
    const y = Math.floor(index / frame.width)
    return x >= x0 && x < x1 && y >= y0 && y < y1
  }
}

const maxOf = (stats: DiffStats) => Math.max(stats.maxDelta[0], stats.maxDelta[1], stats.maxDelta[2])

function meanAbs(a: Frame, b: Frame, mask: (index: number) => boolean) {
  let sum = 0
  let count = 0
  for (let i = 0; i < a.width * a.height; i += 1) {
    if (!mask(i)) continue
    for (let c = 0; c < 3; c += 1) sum += Math.abs(a.rgba[i * 4 + c] - b.rgba[i * 4 + c])
    count += 3
  }
  return count ? sum / count : 0
}

function copyFrame(frame: Frame, edit: (rgba: Buffer, index: number, x: number) => void): Frame {
  const rgba = Buffer.from(frame.rgba)
  for (let i = 0; i < frame.width * frame.height; i += 1) edit(rgba, i, i % frame.width)
  return { width: frame.width, height: frame.height, rgba }
}

// ---------------------------------------------------------------------------
// The preserved pass, run test-side over a capture.
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = { html: 'text/html', mjs: 'text/javascript', js: 'text/javascript', css: 'text/css', jpg: 'image/jpeg', png: 'image/png', json: 'application/json' }

/** `createGlassEffect` on the vendored PixiJS, initialised as `study.mjs` does, fed a named source. */
const REFERENCE_HARNESS = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:black}</style></head><body>
<script src="/crt-glass-motion/vendor/pixi.min.js"></script><script src="/crt-glass-motion/vendor/filters.js"></script>
<script type="module">
import {createGlassEffect} from '/crt-glass-motion/glass-effect.mjs';
const W=${WIDTH},H=${HEIGHT};
const app=new PIXI.Application();
await app.init({width:W,height:H,resolution:1,antialias:false,autoStart:false,preference:'webgl',background:'#000000',preserveDrawingBuffer:true});
app.canvas.id='frame';document.body.append(app.canvas);
let sprite=null,glass=null;
window.__crt={
 async render(url,values,phase,seed){
  const texture=await PIXI.Assets.load(url);
  if(!sprite){sprite=new PIXI.Sprite(texture);app.stage.addChild(sprite);glass=createGlassEffect(PIXI,{texture,width:W,height:H,values});sprite.filterArea=new PIXI.Rectangle(0,0,W,H);sprite.filters=glass.filters}
  else sprite.texture=texture;
  sprite.width=W;sprite.height=H;
  glass.update(values,texture);glass.setMotion(phase,seed);app.render();
 },
 info(){const gl=app.renderer.gl;const d=gl.getExtension('WEBGL_debug_renderer_info');return {pixi:PIXI.VERSION,renderer:String(gl.getParameter(d?d.UNMASKED_RENDERER_WEBGL:gl.RENDERER))}}
};
window.__crtReady=true;
</script></body></html>`

type CrtWindow = { __crt: { render: (url: string, v: Settings, p: number, s: number) => Promise<void>; info: () => { pixi: string; renderer: string } } }

async function referenceHost(page: Page, root: string, sources: Map<string, Buffer>) {
  await page.route(`${REFERENCE_ORIGIN}/**`, async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname)
    if (path === '/__harness.html') return route.fulfill({ status: 200, contentType: 'text/html', body: REFERENCE_HARNESS })
    if (path.startsWith('/__source/')) {
      const body = sources.get(path.slice('/__source/'.length))
      return body ? route.fulfill({ status: 200, contentType: 'image/png', body }) : route.fulfill({ status: 404, body: '' })
    }
    const file = resolve(root, `.${path}`)
    if (!file.startsWith(root + sep) || !existsSync(file)) return route.fulfill({ status: 404, body: '' })
    return route.fulfill({ status: 200, contentType: MIME[file.split('.').at(-1) ?? ''] ?? 'application/octet-stream', body: readFileSync(file) })
  })
  await page.goto(`${REFERENCE_ORIGIN}/__harness.html`)
  await page.waitForFunction(() => (window as unknown as { __crtReady?: boolean }).__crtReady === true, undefined, { timeout: 60_000 })
  return {
    info: () => page.evaluate(() => (window as unknown as CrtWindow).__crt.info()),
    async render(name: string, values: Settings): Promise<Frame> {
      await page.evaluate(({ url, values, phase, seed }) => (window as unknown as CrtWindow).__crt.render(url, values, phase, seed), {
        url: `/__source/${name}`, values, phase: STILL.phase, seed: STILL.seed,
      })
      const out = await page.evaluate(() => {
        const source = document.querySelector('#frame') as HTMLCanvasElement
        const copy = document.createElement('canvas')
        copy.width = source.width
        copy.height = source.height
        const context = copy.getContext('2d', { willReadFrequently: true })!
        context.drawImage(source, 0, 0)
        const data = context.getImageData(0, 0, copy.width, copy.height).data
        let binary = ''
        for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000))
        return { rgba: btoa(binary), width: copy.width, height: copy.height }
      })
      return { width: out.width, height: out.height, rgba: Buffer.from(out.rgba, 'base64') }
    },
  }
}

/** The shipped decorative owners, hidden test-locally so the composed source carries only the field's signal. */
const OLD_OWNERS_SUPPRESSED = `.clr-atmosphere__scan{display:none!important}
.clr-chamfer:not([aria-busy="true"])::before{background-image:none!important}`

// ---------------------------------------------------------------------------

test.describe('TASK-006 CRT Glass composition over the live shell', () => {
  test.describe.configure({ mode: 'serial' })

  test('Echo-only, then the preserved pass over the same capture, in four skins at 390 × 844; the pass reads source pixels', async ({ browser, appOrigin }) => {
    test.setTimeout(480_000)
    mkdirSync(OUT, { recursive: true })
    const inputs = loadInputs()
    const sources = new Map<string, Buffer>()
    const hostContext = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 })
    const host = await referenceHost(await hostContext.newPage(), inputs.root, sources)
    const records: Record<string, unknown>[] = []
    const keep = (name: string, png: Buffer) => {
      writeFileSync(resolve(OUT, name), png)
      return { file: name, sha256: sha256(png) }
    }

    for (const skin of SKINS) {
      const pair: Record<string, Frame> = {}
      const pngs: Record<string, Buffer> = {}
      let card: (Rect & { cut: number }) | null = null
      let devicePixelRatio = 0
      for (const effects of ['off', 'on'] as const) {
        const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
        const page = await context.newPage()
        const app = await syntheticApp(page, appOrigin, skin, effects)
        await openGenerate(page)
        // No CRT field exists to hold off: the stop leaves none mounted.
        expect(await page.locator('canvas, .clr-crt-glass').count()).toBe(0)
        devicePixelRatio = await page.evaluate(() => window.devicePixelRatio)
        card = await page.evaluate(() => {
          const outline = document.querySelector('main .clr-card')!
          const chamfer = outline.querySelector('.clr-chamfer') ?? outline
          const size = ['sm', 'md', 'lg'].find((name) => chamfer.classList.contains(`clr-chamfer--${name}`)) ?? 'md'
          const { x, y, width, height } = outline.getBoundingClientRect()
          return { x, y, width, height, cut: Number.parseFloat(getComputedStyle(chamfer).getPropertyValue(`--chamfer-${size}`)) || 0 }
        })
        const shot = await capture(page)
        pair[effects] = shot.frame
        pngs[effects] = shot.png
        if (effects === 'on') {
          await page.addStyleTag({ content: OLD_OWNERS_SUPPRESSED })
          await settle(page)
          const source = await capture(page)
          pair.source = source.frame
          pngs.source = source.png
        }
        app.assertReadOnly()
        await context.close()
      }
      expect(devicePixelRatio).toBe(1)
      expect([pair.on.width, pair.on.height]).toEqual([WIDTH, HEIGHT])
      const rect = card!

      // Echo-only: exposed left and below; nothing above, right or inside the card.
      const band = 8
      const inset = 10
      const echo = {
        left: diff(pair.on, pair.off, regionMask(pair.on, { x: rect.x - band, y: rect.y + inset, width: band, height: rect.height })),
        below: diff(pair.on, pair.off, regionMask(pair.on, { x: rect.x, y: rect.y + rect.height, width: rect.width - inset, height: band })),
        above: diff(pair.on, pair.off, regionMask(pair.on, { x: rect.x, y: rect.y - band, width: rect.width, height: band })),
        right: diff(pair.on, pair.off, regionMask(pair.on, { x: rect.x + rect.width, y: rect.y, width: band, height: rect.height })),
        // The painted footprint only: the bottom-right chamfer cut is open, and the rear shows through it by design.
        interior: diff(pair.on, pair.off, (i) => {
          const x = i % WIDTH
          const y = Math.floor(i / WIDTH)
          const right = rect.x + rect.width - x
          const bottom = rect.y + rect.height - y
          return x - rect.x >= inset && y - rect.y >= inset && right >= inset && bottom >= inset && right + bottom >= rect.cut + inset * 2
        }),
      }
      expect(echo.left.differingPixels, `${skin}: Echo exposed left`).toBeGreaterThan(0)
      expect(echo.below.differingPixels, `${skin}: Echo exposed below`).toBeGreaterThan(0)
      expect(maxOf(echo.above), `${skin}: nothing above the card`).toBeLessThanOrEqual(2)
      expect(maxOf(echo.right), `${skin}: nothing right of the card`).toBeLessThanOrEqual(2)
      expect(maxOf(echo.interior), `${skin}: no rear border through the card, nested content unchanged`).toBeLessThanOrEqual(2)

      // Composed: the preserved pass over the Echo-only source, test-side.
      sources.set(`${skin}-source.png`, pngs.source)
      const composed = await host.render(`${skin}-source.png`, inputs.settings)
      expect([composed.width, composed.height]).toEqual([WIDTH, HEIGHT])
      const reach = Number(inputs.settings.edgeWidth)
      const centre = regionMask(composed, { x: WIDTH * reach, y: HEIGHT * reach, width: WIDTH * (1 - 2 * reach), height: HEIGHT * (1 - 2 * reach) })
      const perimeter = (index: number) => !centre(index)
      const composedStats = {
        whole: diff(composed, pair.source),
        centre: { ...diff(composed, pair.source, centre), meanAbs: meanAbs(composed, pair.source, centre) },
        perimeter: { ...diff(composed, pair.source, perimeter), meanAbs: meanAbs(composed, pair.source, perimeter) },
        card: { ...diff(composed, pair.source, regionMask(composed, rect)), meanAbs: meanAbs(composed, pair.source, regionMask(composed, rect)) },
      }
      // The pass is applied: the frame changes, most of all at the perimeter.
      expect(composedStats.whole.differingPixels).toBeGreaterThan(0)
      expect(composedStats.perimeter.meanAbs).toBeGreaterThan(composedStats.centre.meanAbs)

      // The gap. (a) Change only one perimeter column: a per-pixel layer would
      // change only that column; the pass also changes its neighbours.
      const column = 3
      const neighbour = copyFrame(pair.source, (rgba, i, x) => { if (x === column) rgba.fill(255, i * 4, i * 4 + 3) })
      sources.set(`${skin}-probe-neighbour.png`, encodePng(neighbour))
      const neighbourOut = await host.render(`${skin}-probe-neighbour.png`, inputs.settings)
      const neighbourReach = diff(neighbourOut, composed, (i) => i % WIDTH !== column)
      // (b) Change only green: a per-channel layer would leave red and blue as
      // they were; the pass rescales them from the pixel's new peak.
      const channel = copyFrame(pair.source, (rgba, i) => { rgba[i * 4 + 1] = 255 })
      sources.set(`${skin}-probe-channel.png`, encodePng(channel))
      const channelOut = await host.render(`${skin}-probe-channel.png`, inputs.settings)
      let crossChannel = 0
      for (let i = 0; i < WIDTH * HEIGHT; i += 1) {
        if (Math.abs(channelOut.rgba[i * 4] - composed.rgba[i * 4]) > 1 || Math.abs(channelOut.rgba[i * 4 + 2] - composed.rgba[i * 4 + 2]) > 1) crossChannel += 1
      }
      expect(neighbourReach.differingPixels, `${skin}: output depends on neighbouring source pixels`).toBeGreaterThan(0)
      expect(crossChannel, `${skin}: output channels depend on the source pixel's other channels`).toBeGreaterThan(0)

      records.push({
        skin,
        route: '/generate',
        sourceState: 'populated form, no Anchor chosen, Visual effects on/off, reduced motion (ground held still), no CRT field mounted; composed source: Echo on with the shipped decorative owners hidden test-locally',
        viewport: { width: WIDTH, height: HEIGHT },
        devicePixelRatio,
        renderResolution: 1,
        phase: STILL.phase,
        grainSeed: STILL.seed,
        captures: {
          echoOff: keep(`${skin}-echo-off.png`, pngs.off),
          echoOnly: keep(`${skin}-echo-only.png`, pngs.on),
          composedSource: keep(`${skin}-composed-source.png`, pngs.source),
          composedReference: keep(`${skin}-composed-reference.png`, encodePng(composed)),
        },
        card: rect,
        echoOnly: Object.fromEntries(Object.entries(echo).map(([k, v]) => [k, { differingPixels: v.differingPixels, maxDelta: v.maxDelta }])),
        composed: Object.fromEntries(Object.entries(composedStats).map(([k, v]) => [k, { differingPixels: v.differingPixels, maxDelta: v.maxDelta, meanAbs: 'meanAbs' in v ? v.meanAbs : undefined }])),
        gap: { neighbourDependentPixels: neighbourReach.differingPixels, crossChannelDependentPixels: crossChannel },
      })
    }

    writeFileSync(resolve(OUT, 'pairs.json'), JSON.stringify({
      task: 'TASK-006',
      requirement: 'REQ-006',
      status: 'stopped-with-sourced-gap',
      approval: 'not claimed; the owner records visual approval',
      host: { directory: '$CLEAR_EFFECTS_REFERENCE_DIR (read-only)', files: inputs.files },
      settings: { file: '$CLEAR_EFFECTS_CURRENT_SETTINGS (crt-iab-current-settings.json)', sha256: inputs.settingsHash, values: inputs.settings },
      historicalNotTargets: HISTORICAL,
      browser: `${browser.browserType().name()} ${browser.version()}`,
      renderer: await host.info(),
      scope: 'Emulated mobile Chromium; composed images are a test-side reference rendering, not a product path; not phone evidence.',
      records,
    }, null, 2))
    await hostContext.close()
  })

  test('the live shell during the stop: one moving atmosphere, shipped owners once, sweeps kept, input unblocked, in four skins', async ({ browser, appOrigin }) => {
    test.setTimeout(480_000)
    mkdirSync(OUT, { recursive: true })
    const live: Record<string, unknown>[] = []

    for (const skin of SKINS) {
      const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' })
      const page = await context.newPage()
      const app = await syntheticApp(page, appOrigin, skin, 'on')
      const record: Record<string, unknown> = { skin, viewport: { width: WIDTH, height: HEIGHT }, devicePixelRatio: 3 }
      const sameLayer = () => page.evaluate(() => document.querySelector('.clr-atmosphere') === (window as unknown as { __layer?: Element }).__layer && document.querySelectorAll('.clr-atmosphere').length === 1)
      const shell = () => page.evaluate(() => {
        const scan = document.querySelector('.clr-atmosphere__scan')
        const frames = [...document.querySelectorAll('.clr-chamfer:not([aria-busy="true"])')]
        const blobs = [...document.querySelectorAll('.clr-atmosphere__blob')]
        const host = document.querySelector('.clr-effects-host')
        return {
          atmosphereScan: scan ? getComputedStyle(scan).backgroundImage.includes('repeating-linear-gradient') : false,
          framesWithScan: frames.filter((el) => getComputedStyle(el, '::before').backgroundImage.includes('repeating-linear-gradient')).length,
          frames: frames.length,
          field: document.querySelectorAll('canvas, .clr-crt-glass').length,
          overlays: document.querySelectorAll('.scanlines-overlay').length,
          runningBlobs: blobs.filter((blob) => blob.getAnimations().some((a) => a.playState === 'running')).length,
          transforms: blobs.map((blob) => getComputedStyle(blob).transform),
          effects: host?.getAttribute('data-effects') ?? null,
          motion: host?.getAttribute('data-motion') ?? null,
          static: document.querySelector('.clr-atmosphere')?.getAttribute('data-static') ?? null,
        }
      })

      await openGenerate(page)
      await page.evaluate(() => { (window as unknown as { __layer?: Element }).__layer = document.querySelector('.clr-atmosphere')! })
      const first = await shell()
      expect(first.field, 'no field mounted').toBe(0)
      expect(first.overlays, '.scanlines-overlay is not an active layer').toBe(0)
      expect(first.atmosphereScan, 'the shipped atmosphere scan paints').toBe(true)
      expect(first.framesWithScan, 'the shipped frame scan paints on framed surfaces').toBeGreaterThan(0)
      expect(first.runningBlobs, 'all three blobs move').toBe(3)
      await page.waitForTimeout(400)
      expect((await shell()).transforms, 'the blobs moved').not.toEqual(first.transforms)
      record.populated = first

      // Input reaches its target: nothing decorative sits over the controls.
      const chip = page.getByRole('group', { name: 'Anchor' }).getByRole('button').first()
      const hit = await chip.evaluate((el) => {
        const { x, y, width, height } = el.getBoundingClientRect()
        const target = document.elementFromPoint(x + width / 2, y + height / 2)
        return target === el || el.contains(target)
      })
      expect(hit, 'the chip is the hit target').toBe(true)
      await chip.click()

      // Scrolling: the content moves under the pinned ground.
      const scroller = page.getByRole('region', { name: 'Generate content' })
      await scroller.evaluate((el) => el.scrollBy(0, 160))
      await settle(page)
      expect(await sameLayer(), `${skin}: scroll`).toBe(true)
      expect((await shell()).runningBlobs).toBe(3)
      await scroller.evaluate((el) => el.scrollTo(0, 0))

      // Loading: the busy sweep stays as state feedback.
      await page.getByRole('button', { name: /generate workout/i }).click()
      await expect.poll(() => app.held.length).toBe(1)
      await expect(page.getByRole('group', { name: 'Anchor' })).toBeHidden()
      await settle(page)
      const sweeps = await page.evaluate(() => [
        ...[...document.querySelectorAll('[aria-busy="true"]')].map((el) => getComputedStyle(el, '::before').animationName),
        ...[...document.querySelectorAll('.clr-scan-band')].map((el) => getComputedStyle(el).animationName),
      ].filter((name) => name && name !== 'none'))
      expect(sweeps.length, `${skin}: a loading sweep runs`).toBeGreaterThan(0)
      expect(await sameLayer()).toBe(true)
      record.loadingSweeps = sweeps
      await page.getByRole('button', { name: /cancel/i }).first().click()
      await expect(page.getByRole('group', { name: 'Anchor' })).toBeVisible()

      // In-app navigation and back: the same layer node, never remounted.
      await page.getByRole('button', { name: 'Home' }).click()
      await expect(page).toHaveURL(/\/$/)
      await settle(page)
      expect(await sameLayer(), `${skin}: home`).toBe(true)
      await page.goBack()
      await expect(page.getByRole('group', { name: 'Anchor' })).toBeVisible()
      expect(await sameLayer(), `${skin}: back to generate`).toBe(true)

      // Reduced motion: the ground goes still in place and resumes.
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await settle(page)
      const reduced = await shell()
      expect(reduced.static).toBe('true')
      expect(reduced.runningBlobs).toBe(0)
      expect(await sameLayer(), `${skin}: reduced motion`).toBe(true)
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await settle(page)
      expect((await shell()).runningBlobs).toBe(3)
      record.reducedMotion = reduced

      // A hidden tab and back.
      const tab: Record<string, unknown> = {}
      for (const state of ['hidden', 'visible'] as const) {
        await page.evaluate((value) => {
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value })
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => value === 'hidden' })
          document.dispatchEvent(new Event('visibilitychange'))
        }, state)
        await settle(page)
        expect(await sameLayer(), `${skin}: tab ${state}`).toBe(true)
        tab[state] = (await shell()).motion
      }
      record.hiddenTab = tab

      // Visual effects off and on: the shipped owners stay exactly as they are.
      for (const effects of ['off', 'on'] as const) {
        await page.evaluate((value) => {
          localStorage.setItem('clear.visual-effects', value)
          window.dispatchEvent(new StorageEvent('storage', { key: 'clear.visual-effects' }))
        }, effects)
        await expect.poll(async () => (await shell()).effects).toBe(effects)
        const state = await shell()
        expect(state.atmosphereScan && state.field === 0, `${skin}: effects ${effects}`).toBe(true)
        expect(await sameLayer(), `${skin}: effects ${effects}`).toBe(true)
      }

      // A dialog: its backdrop keeps the shipped scan; nothing is added over it.
      await page.goto('/settings/locations')
      const remove = page.getByRole('button', { name: /^delete$/i }).last()
      await expect(remove).toBeVisible()
      await remove.click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      const backdrop = await page.evaluate(() => getComputedStyle(document.querySelector('dialog[open]')!, '::backdrop').backgroundImage)
      expect(backdrop).toContain('repeating-linear-gradient')
      expect(await page.locator('canvas, .clr-crt-glass').count()).toBe(0)
      writeFileSync(resolve(OUT, `${skin}-live-dialog.png`), await page.screenshot({ animations: 'disabled', caret: 'hide' }))
      await dialog.getByRole('button').first().click()
      await expect(dialog).toBeHidden()

      app.assertReadOnly()
      live.push(record)
      await context.close()
    }
    writeFileSync(resolve(OUT, 'live.json'), JSON.stringify({ task: 'TASK-006', status: 'stopped-with-sourced-gap', live }, null, 2))
  })
})
