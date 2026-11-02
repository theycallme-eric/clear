/**
 * Effects TASK-003 (REQ-003) — Phosphor Echo standalone fidelity, in a real browser.
 *
 * Three proofs, each from actual pixels and never from a resized screenshot:
 *
 *   1. Kernel fidelity. The app module (`src/ui/phosphor-echo.tsx`, mounted by
 *      the gallery) and the preserved round-3 kernel (`round-3/phosphor-echo.mjs`
 *      in its own host, `round-3/screen.html` + `screen.css` + `screen.mjs`,
 *      served read-only from `$CLEAR_EFFECTS_REFERENCE_DIR`) draw the same
 *      filled chamfer silhouette and heading text — same role colour, CSS
 *      size and position, viewport, render scale, device-pixel ratio, skin and
 *      font file. Their exposed rear-image pixels must be byte-identical.
 *   2. Masking. Gallery captures with Visual effects on and off, at 320 and 375
 *      CSS px and a desktop viewport, keep the card, CTA, top-inside and
 *      right-inside interiors pixel-identical while the exposed left and
 *      bottom regions change, with no horizontal overflow. The round-3
 *      VERIFICATION.json and echo-on/echo-off.jpg results were taken at the
 *      earlier 0.34 / 1.4 / −5.5 / +6.6 preset; they define this method, not
 *      golden images for the preferred preset.
 *   3. CSS-pixel units. Apparent offset and softness, measured from the rear
 *      image alone, agree in CSS px at device-pixel ratio 1 and at the mobile
 *      project's ratio, across differently sized targets and viewBoxes.
 *
 * The reference is served from inside this spec by route interception and is
 * only ever read. Viewport and device-pixel ratio are set per comparison here;
 * no shared Playwright configuration is changed.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'

import AxeBuilder from '@axe-core/playwright'
import type { Browser, Page, TestInfo } from '@playwright/test'

import { parseEnvFile } from '../../scripts/dev-preflight/env.mjs'
import {
  PHOSPHOR_ECHO_PRESET,
  PHOSPHOR_ECHO_PRESET_PROVENANCE,
} from '../../src/ui/phosphor-echo-preset'
import { expect, test } from '../fixtures'

// ---------------------------------------------------------------------------
// The preserved reference, read-only.
// ---------------------------------------------------------------------------

const REFERENCE_ENV = 'CLEAR_EFFECTS_REFERENCE_DIR'
const REFERENCE_PREFIX = '/__echo-reference/'
const REFERENCE_HOST = 'round-3/screen.html'
const REFERENCE_FILES = [
  'round-3/phosphor-echo.mjs',
  'round-3/preferred-preset.json',
  'round-3/screen.html',
  'round-3/screen.css',
  'round-3/screen.mjs',
  'round-3/VERIFICATION.json',
] as const

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
}

/**
 * The exported variable wins; otherwise the same git-ignored local files the
 * e2e harness already reads for runner-supplied values (`scripts/e2e/env.mjs`).
 */
const REFERENCE_ENV_FILES = ['.env.runner.local', '.env.audit.local', '.env.local'] as const

function referenceDir(): string | undefined {
  const exported = process.env[REFERENCE_ENV]?.trim()
  if (exported) return exported
  for (const file of REFERENCE_ENV_FILES) {
    const path = resolve(process.cwd(), file)
    if (!existsSync(path)) continue
    const value = parseEnvFile(readFileSync(path, 'utf8'))[REFERENCE_ENV]?.trim()
    if (value) return value
  }
  return undefined
}

function referenceRoot(): string {
  const dir = referenceDir()
  if (!dir) {
    throw new Error(
      `${REFERENCE_ENV} must name the preserved effects checkpoint (PRE-001), ` +
        `exported or set in ${REFERENCE_ENV_FILES.join(' / ')}`,
    )
  }
  const root = resolve(dir)
  for (const file of REFERENCE_FILES) {
    if (!existsSync(resolve(root, file))) throw new Error(`reference checkpoint is missing ${file}`)
  }
  return root
}

/** Serve the checkpoint under the app's own origin, read-only. */
async function serveReference(page: Page, root: string) {
  await page.route(`**${REFERENCE_PREFIX}**`, async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname.slice(REFERENCE_PREFIX.length))
    const file = resolve(root, path)
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
      await route.fulfill({ status: 404, body: '' })
      return
    }
    await route.fulfill({
      status: 200,
      body: readFileSync(file),
      contentType: MIME[extname(file)] ?? 'application/octet-stream',
    })
  })
}

// ---------------------------------------------------------------------------
// Page set-up shared by both documents.
// ---------------------------------------------------------------------------

const SKIN = 'signal' // round-3/screen.html is `data-skin="signal"`
const GALLERY = '/gallery/app?component=PhosphorEchoFrame'
const MOBILE_DPR = 3 // playwright.config.ts, project "mobile"

/** Same skin, Visual effects choice and motion in every capture. */
async function prepare(page: Page, effects: 'on' | 'off') {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(
    ([skin, value]) => {
      localStorage.setItem('clear.skin', skin)
      localStorage.setItem('clear.visual-effects', value)
    },
    [SKIN, effects] as const,
  )
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  })
}

/** The same scroll position in every capture: the example's top at the top. */
async function scrollToExample(page: Page) {
  await page.locator('[data-echo-sample="header"]').evaluate((element) => element.scrollIntoView({ block: 'start' }))
  await settle(page)
}

/**
 * A page at an exact device-pixel ratio: its own browser context with the
 * mobile project's settings otherwise. (An in-place metrics override does not
 * survive Playwright's screenshot, so it cannot be trusted to capture DPR 1.)
 */
async function pageAt(browser: Browser, testInfo: TestInfo, dpr: number): Promise<Page> {
  const use = testInfo.project.use
  const context = await browser.newContext({
    viewport: use.viewport,
    userAgent: use.userAgent,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    baseURL: use.baseURL,
    extraHTTPHeaders: use.extraHTTPHeaders,
    deviceScaleFactor: dpr,
  })
  const page = await context.newPage()
  return page
}

/**
 * Navigate and scan, exactly as the shared `visit` fixture does (CORE-05), for
 * a page this spec opened at its own device-pixel ratio.
 */
async function visitScanned(page: Page, path: string) {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations.map((violation) => violation.id)).toEqual([])
}

/**
 * Leave only the marked elements painted, on an opaque black ground, so a
 * capture holds nothing but rear-image pixels. Applied identically in both
 * documents.
 */
async function isolate(page: Page) {
  await page.addStyleTag({
    content: `
      html, body { background: black !important; }
      body *:not([data-echo-keep], [data-echo-keep] *) { visibility: hidden !important; }
      [data-echo-keep], [data-echo-keep] * { visibility: visible !important; }
    `,
  })
  await settle(page)
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** An integer CSS-px clip, so every device-pixel ratio samples whole pixels. */
function clipAround(rects: Rect[], margin: number, viewport: { width: number; height: number }): Rect {
  const left = Math.max(0, Math.floor(Math.min(...rects.map((r) => r.x)) - margin))
  const top = Math.max(0, Math.floor(Math.min(...rects.map((r) => r.y)) - margin))
  const right = Math.min(viewport.width, Math.ceil(Math.max(...rects.map((r) => r.x + r.width)) + margin))
  const bottom = Math.min(viewport.height, Math.ceil(Math.max(...rects.map((r) => r.y + r.height)) + margin))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** PNG width and height from the IHDR chunk — what was captured, unscaled. */
function pngSize(png: Buffer) {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

async function capture(page: Page, clip?: Rect): Promise<Buffer> {
  const png = await page.screenshot({ clip, animations: 'disabled', caret: 'hide', scale: 'device' })
  const dpr = await page.evaluate(() => devicePixelRatio)
  const expected = clip ?? { ...page.viewportSize()!, x: 0, y: 0 }
  // Never resized: the image is exactly the CSS area times the device-pixel ratio.
  expect(pngSize(png)).toEqual({
    width: Math.round(expected.width * dpr),
    height: Math.round(expected.height * dpr),
  })
  return png
}

/** Decode PNGs in the browser and return RGBA rows — no image library needed. */
async function decode(page: Page, png: Buffer): Promise<{ width: number; height: number; data: Uint8Array }> {
  const result = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    })
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d', { colorSpace: 'srgb' })!
    context.drawImage(bitmap, 0, 0)
    const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data
    let binary = ''
    for (let i = 0; i < data.length; i += 0x8000) {
      binary += String.fromCharCode(...data.subarray(i, i + 0x8000))
    }
    return { width: bitmap.width, height: bitmap.height, data: btoa(binary) }
  }, png.toString('base64'))
  return { width: result.width, height: result.height, data: Buffer.from(result.data, 'base64') }
}

/** Keep a capture, byte for byte, in the test's output directory and the report. */
function keepPng(testInfo: TestInfo, name: string, png: Buffer) {
  const path = testInfo.outputPath(name)
  writeFileSync(path, png)
  return testInfo.attach(name, { path, contentType: 'image/png' })
}

function attachJson(testInfo: TestInfo, name: string, body: unknown) {
  return testInfo.attach(name, { body: JSON.stringify(body, null, 2), contentType: 'application/json' })
}

const PRESET_IDENTITY = {
  ...PHOSPHOR_ECHO_PRESET_PROVENANCE,
  values: PHOSPHOR_ECHO_PRESET,
}

// ---------------------------------------------------------------------------
// 1. Kernel fidelity against the preserved round-3 host.
// ---------------------------------------------------------------------------

interface AppProbe {
  frame: Rect & { cut: number; color: string }
  text: Rect & { content: string; color: string; style: Record<string, string> }
  fontFaces: string[]
}

/** Read the app's CTA silhouette and heading rear source, and mark them kept. */
async function readAppProbe(page: Page): Promise<AppProbe> {
  return page.evaluate(() => {
    const rect = (element: Element) => {
      const { x, y, width, height } = element.getBoundingClientRect()
      return { x, y, width, height }
    }
    const cta = document.querySelector('[data-echo-sample="cta"] .clr-echo__rear')!
    const ctaFrame = document.querySelector<HTMLElement>('[data-echo-sample="cta"] .clr-chamfer')!
    const size = ['sm', 'md', 'lg'].find((name) => ctaFrame.classList.contains(`clr-chamfer--${name}`))!
    const cut = Number.parseFloat(getComputedStyle(ctaFrame).getPropertyValue(`--chamfer-${size}`))
    const text = document.querySelector<HTMLElement>('[data-echo-sample="header"] .clr-echo-text__rear')!
    const textStyle = getComputedStyle(text)
    const properties = [
      'font-size', 'font-weight', 'font-style', 'font-stretch', 'font-variant', 'font-kerning',
      'font-feature-settings', 'font-variation-settings', 'font-synthesis', 'letter-spacing',
      'word-spacing', 'line-height', 'text-transform', 'text-rendering', '-webkit-font-smoothing',
    ]
    const style = Object.fromEntries(properties.map((name) => [name, textStyle.getPropertyValue(name)]))
    const family = textStyle.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '')

    // The heading's actual font file(s), with URLs made absolute for the other document.
    const fontFaces: string[] = []
    for (const sheet of document.styleSheets) {
      let rules: CSSRuleList
      try {
        rules = sheet.cssRules
      } catch {
        continue
      }
      for (const rule of rules) {
        if (!(rule instanceof CSSFontFaceRule)) continue
        const declared = rule.style.getPropertyValue('font-family').trim().replace(/^["']|["']$/g, '')
        if (declared !== family) continue
        const base = sheet.href ?? location.href
        fontFaces.push(
          rule.cssText
            .replace(/url\((["']?)([^)"']+)\1\)/g, (_, quote, url) => `url(${quote}${new URL(url, base).href}${quote})`)
            .replace(/font-family:[^;]+;/, 'font-family: "echo-fidelity";'),
        )
      }
    }

    cta.setAttribute('data-echo-keep', '')
    text.setAttribute('data-echo-keep', '')
    return {
      frame: { ...rect(cta), cut, color: getComputedStyle(cta).color },
      text: { ...rect(text), content: text.dataset.echoText ?? '', color: textStyle.color, style },
      fontFaces,
    }
  })
}

/** Rebuild the same two sources in the round-3 host, exactly as its own code draws them. */
async function stageReference(page: Page, probe: AppProbe) {
  await page.evaluate(async ({ frame, text, fontFaces }) => {
    const fonts = document.createElement('style')
    fonts.textContent = fontFaces.join('\n')
    document.head.append(fonts)

    const screen = document.querySelector<HTMLElement>('#screen')!
    const svgNS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(svgNS, 'svg')
    const { width: w, height: h, cut } = frame
    // round-3/screen.mjs paintFrame: viewBox at the CSS size, full filled silhouette.
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    svg.setAttribute('aria-hidden', 'true')
    svg.style.cssText = `position:fixed;left:${frame.x}px;top:${frame.y}px;width:${w}px;height:${h}px;overflow:visible;color:${frame.color}`
    const path = document.createElementNS(svgNS, 'path')
    path.setAttribute('class', 'echo-source')
    path.setAttribute('data-part', 'cta')
    path.setAttribute('data-active', 'true')
    path.setAttribute('d', `M0 0H${w}V${h - cut}L${w - cut} ${h}H0Z`)
    path.setAttribute('fill', 'currentColor')
    svg.append(path)
    svg.setAttribute('data-echo-keep', '')
    screen.append(svg)

    // round-3/screen.html: the heading's echo source is a duplicate text span.
    const span = document.createElement('span')
    span.className = 'echo-source'
    span.dataset.part = 'heading'
    span.dataset.active = 'true'
    span.setAttribute('aria-hidden', 'true')
    span.textContent = text.content
    span.style.cssText = `position:fixed;left:${text.x}px;top:${text.y}px;width:${text.width}px;height:${text.height}px;margin:0;padding:0;white-space:nowrap;text-align:start;color:${text.color};font-family:"echo-fidelity"`
    for (const [name, value] of Object.entries(text.style)) span.style.setProperty(name, value)
    span.setAttribute('data-echo-keep', '')
    screen.append(span)

    await document.fonts.load(`${text.style['font-weight']} ${text.style['font-size']} "echo-fidelity"`, text.content)
  }, probe)
  await settle(page)
}

test.describe('Phosphor Echo — app module against the preserved round-3 kernel', () => {
  test('exposed rear-image pixels are identical at device-pixel ratio 1 and the mobile ratio', async ({
    browser,
  }, testInfo) => {
    const root = referenceRoot()
    const records: unknown[] = []

    for (const dpr of [1, MOBILE_DPR]) {
      const page = await pageAt(browser, testInfo, dpr)
      await serveReference(page, root)
      await prepare(page, 'on')
      const viewport = page.viewportSize()!

      // The app module, in the gallery's real-component example.
      await visitScanned(page, GALLERY)
      expect(await page.evaluate(() => devicePixelRatio)).toBe(dpr)
      await scrollToExample(page)
      expect(await page.evaluate(() => document.querySelectorAll('filter').length)).toBe(1)
      const probe = await readAppProbe(page)
      expect(probe.fontFaces.length, 'the heading font is a loaded @font-face').toBeGreaterThan(0)
      await isolate(page)
      const clip = clipAround([probe.frame, probe.text], 24, viewport)
      const appShot = await capture(page, clip)

      // The preserved kernel, in its own host, on the same silhouette and text.
      await visitScanned(page, `${REFERENCE_PREFIX}${REFERENCE_HOST}`)
      await settle(page)
      expect(await page.evaluate(() => devicePixelRatio)).toBe(dpr)
      const host = await page.evaluate(() => ({
        skin: document.documentElement.dataset.skin,
        mode: document.querySelector<HTMLElement>('#screen')?.dataset.mode,
        filters: document.querySelectorAll('filter').length,
        stdDeviation: document.querySelector('#screen-echo feGaussianBlur')?.getAttribute('stdDeviation'),
        dx: document.querySelector('#screen-echo feOffset')?.getAttribute('dx'),
        dy: document.querySelector('#screen-echo feOffset')?.getAttribute('dy'),
        slope: document.querySelector('#screen-echo feFuncA')?.getAttribute('slope'),
      }))
      // The round-3 host installs its own defaults, which are the preferred preset.
      expect(host).toEqual({
        skin: SKIN,
        mode: 'echo',
        filters: 1,
        stdDeviation: String(PHOSPHOR_ECHO_PRESET.blur),
        dx: String(PHOSPHOR_ECHO_PRESET.x),
        dy: String(PHOSPHOR_ECHO_PRESET.y),
        slope: String(PHOSPHOR_ECHO_PRESET.opacity),
      })
      await stageReference(page, probe)
      await isolate(page)
      const referenceShot = await capture(page, clip)

      await keepPng(testInfo, `app-dpr${dpr}.png`, appShot)
      await keepPng(testInfo, `reference-dpr${dpr}.png`, referenceShot)

      const app = await decode(page, appShot)
      const reference = await decode(page, referenceShot)
      let differing = 0
      let lit = 0
      for (let i = 0; i < app.data.length; i += 4) {
        if (app.data[i] + app.data[i + 1] + app.data[i + 2] > 0) lit += 1
        if (
          app.data[i] !== reference.data[i] ||
          app.data[i + 1] !== reference.data[i + 1] ||
          app.data[i + 2] !== reference.data[i + 2]
        ) {
          differing += 1
        }
      }
      records.push({
        dpr,
        viewport,
        clip,
        image: pngSize(appShot),
        silhouette: probe.frame,
        heading: { ...probe.text, style: undefined },
        litPixels: lit,
        differingPixels: differing,
      })
      // There is a rear image to compare, and it is the same pixel for pixel.
      expect(lit, 'the rear image painted').toBeGreaterThan(100)
      expect(differing, `app vs round-3 kernel at DPR ${dpr}`).toBe(0)
      await page.context().close()
    }

    await attachJson(testInfo, 'kernel-fidelity.json', {
      reference: { env: REFERENCE_ENV, root, host: REFERENCE_HOST, files: REFERENCE_FILES },
      preset: PRESET_IDENTITY,
      skin: SKIN,
      records,
    })
  })
})

// ---------------------------------------------------------------------------
// 2. Masking: on versus off on real components.
// ---------------------------------------------------------------------------

const MASKING_VIEWPORTS = [
  { name: '320', width: 320, height: 844 },
  { name: '375', width: 375, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
] as const

interface Region extends Rect {
  name: string
}

/** CSS-px regions from the real Card and CTA geometry, as round 3 sampled them. */
async function maskingRegions(page: Page): Promise<{ regions: Region[]; overflow: boolean }> {
  return page.evaluate(() => {
    const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
    const card = box('[data-echo-sample="card"] .clr-card')
    const cta = box('[data-echo-sample="cta"] .clr-chamfer')
    const cut = Number.parseFloat(
      getComputedStyle(document.querySelector('[data-echo-sample="card"] .clr-chamfer')!).getPropertyValue('--chamfer-lg'),
    )
    const region = (name: string, x: number, y: number, width: number, height: number) => ({ name, x, y, width, height })
    return {
      regions: [
        region('card_interior', card.left + 24, card.top + 12, card.width - 48, card.height - 24 - cut),
        region('top_inside', card.left + 24, card.top + 3, card.width - 36, 6),
        region('right_inside', card.right - 9, card.top + 12, 6, card.height - 24 - cut),
        region('cta_interior', cta.left + 6, cta.top + 4, cta.width - 20, cta.height - 8),
        region('left_echo', card.left - 9, card.top + 12, 7, card.height - 24),
        region('bottom_echo', card.left + 12, card.bottom + 2, card.width - 48, 7),
      ],
      overflow:
        document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth,
    }
  })
}

function regionStats(
  on: { width: number; data: Uint8Array },
  off: { width: number; data: Uint8Array },
  region: Region,
  dpr: number,
) {
  const x0 = Math.round(region.x * dpr)
  const y0 = Math.round(region.y * dpr)
  const x1 = Math.round((region.x + region.width) * dpr)
  const y1 = Math.round((region.y + region.height) * dpr)
  let total = 0
  let max = 0
  let count = 0
  let differing = 0
  let at: { x: number; y: number } | null = null
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * on.width + x) * 4
      let pixel = 0
      for (let c = 0; c < 3; c += 1) {
        const difference = Math.abs(on.data[i + c] - off.data[i + c])
        total += difference
        pixel = Math.max(pixel, difference)
        count += 1
      }
      if (pixel > 0) differing += 1
      if (pixel > max) {
        max = pixel
        // Where the largest difference is, in CSS px, for a failure to name.
        at = { x: x / dpr, y: y / dpr }
      }
    }
  }
  return { mean: count ? total / count : 0, max, samples: count, differing, at }
}

test.describe('Phosphor Echo — gallery on versus off', () => {
  for (const viewport of MASKING_VIEWPORTS) {
    test(`interiors stay identical and exposed left and bottom change at ${viewport.name} (${viewport.width}×${viewport.height})`, async ({
      page,
      visit,
    }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      const dpr = await page.evaluate(() => devicePixelRatio)
      const shots: Record<'on' | 'off', Buffer> = {} as never
      const layouts: Record<string, Region[]> = {}

      for (const effects of ['on', 'off'] as const) {
        // Init scripts run in order, so this capture's choice is the last one written.
        await prepare(page, effects)
        await visit(GALLERY)
        await scrollToExample(page)
        const sources = await page.locator('.clr-echo__source').count()
        if (effects === 'on') expect(sources, 'every rear source renders').toBeGreaterThanOrEqual(4)
        else expect(sources, 'no rear source and no solid shape left in place').toBe(0)

        const { regions, overflow } = await maskingRegions(page)
        expect(overflow, 'no horizontal overflow').toBe(false)
        layouts[effects] = regions
        // The same UI state: nothing focused in either capture.
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
        shots[effects] = await capture(page)
        await keepPng(testInfo, `gallery-${viewport.name}-${effects}.png`, shots[effects])
      }

      // Identical geometry, so the same CSS regions sample the same content.
      expect(layouts.off).toEqual(layouts.on)
      const on = await decode(page, shots.on)
      const off = await decode(page, shots.off)
      const results = Object.fromEntries(
        layouts.on.map((region) => [region.name, regionStats(on, off, region, dpr)]),
      )
      await attachJson(testInfo, `masking-${viewport.name}.json`, {
        preset: PRESET_IDENTITY,
        viewport,
        dpr,
        skin: SKIN,
        method:
          'aligned on/off captures at the same dimensions; absolute RGB channel differences (round-3/VERIFICATION.json method; its 0.34/1.4/−5.5/+6.6 results are not golden images for this preset)',
        regions: layouts.on,
        results,
      })

      for (const name of ['card_interior', 'top_inside', 'right_inside', 'cta_interior']) {
        expect(results[name].samples, name).toBeGreaterThan(0)
        expect(results[name].max, `${name} is pixel-identical: ${JSON.stringify({ regions: layouts.on, results })}`).toBe(0)
      }
      for (const name of ['left_echo', 'bottom_echo']) {
        expect(results[name].mean, `${name} changes`).toBeGreaterThan(2)
      }
    })
  }
})

// ---------------------------------------------------------------------------
// 3. CSS-pixel units: offset and softness at two device-pixel ratios.
// ---------------------------------------------------------------------------

interface Target extends Rect {
  name: string
  /** The rear image's full alpha in the captured channel: opacity × the role colour. */
  peak: number
}

/** Mark every rear source kept and read each target's box and colour. */
async function measurementTargets(page: Page, opacity: number): Promise<Target[]> {
  return page.evaluate((slope) => {
    const targets: { name: string; element: Element; outline: Element }[] = []
    for (const sample of document.querySelectorAll<HTMLElement>('[data-echo-sample]')) {
      const name = sample.dataset.echoSample!
      if (name === 'header') continue
      const rear = sample.querySelector('.clr-echo__rear')
      if (!rear) continue
      const outline =
        sample.querySelector('.clr-card') ??
        sample.querySelector('.clr-chamfer') ??
        sample.querySelector('.clr-echo')!.lastElementChild!
      targets.push({ name, element: rear, outline })
    }
    // Resolve any colour syntax, alpha included, to 8-bit sRGB through a canvas.
    const context = new OffscreenCanvas(1, 1).getContext('2d')!
    const strength = (color: string) => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
      return Math.max(r, g, b) * (a / 255)
    }
    return targets.map(({ name, element, outline }) => {
      element.setAttribute('data-echo-keep', '')
      const { x, y, width, height } = outline.getBoundingClientRect()
      return { name, x, y, width, height, peak: slope * strength(getComputedStyle(element).color) }
    })
  }, opacity)
}

function crossing(samples: { at: number; value: number }[], level: number): number {
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1]
    const b = samples[i]
    if (a.value < level && b.value >= level) return a.at + ((level - a.value) / (b.value - a.value)) * (b.at - a.at)
  }
  return Number.NaN
}

/**
 * Apparent offset: how far outside the footprint the rear image reaches half
 * its full strength. Softness: the 25%–75% rise distance. Both in CSS px.
 */
function measure(image: { width: number; data: Uint8Array }, target: Target, dpr: number) {
  const value = (x: number, y: number) => {
    const i = (y * image.width + x) * 4
    return Math.max(image.data[i], image.data[i + 1], image.data[i + 2])
  }
  // Left edge, along the middle row, travelling right towards the footprint.
  const row = Math.floor((target.y + target.height / 2) * dpr)
  const left: { at: number; value: number }[] = []
  for (let x = Math.floor((target.x - 20) * dpr); x < Math.floor(target.x * dpr); x += 1) {
    left.push({ at: (x + 0.5) / dpr - target.x, value: value(x, row) })
  }
  // Bottom edge, along a column inside both the footprint and its shifted copy, travelling up.
  const column = Math.floor((target.x + Math.min(target.width / 2, 12)) * dpr)
  const bottom: { at: number; value: number }[] = []
  for (let y = Math.ceil((target.y + target.height + 20) * dpr); y >= Math.ceil((target.y + target.height) * dpr); y -= 1) {
    bottom.push({ at: target.y + target.height - (y + 0.5) / dpr, value: value(column, y) })
  }
  const at = (samples: typeof left, fraction: number) => crossing(samples, target.peak * fraction)
  return {
    offsetX: -at(left, 0.5),
    softnessX: at(left, 0.75) - at(left, 0.25),
    offsetY: -at(bottom, 0.5),
    softnessY: at(bottom, 0.75) - at(bottom, 0.25),
  }
}

test.describe('Phosphor Echo — CSS-pixel units', () => {
  test('offset and softness agree at device-pixel ratio 1 and the mobile ratio, across sizes and viewBoxes', async ({
    browser,
  }, testInfo) => {
    const measured: Record<number, Record<string, ReturnType<typeof measure>>> = {}
    let viewport: { width: number; height: number } | null = null

    for (const dpr of [1, MOBILE_DPR]) {
      const page = await pageAt(browser, testInfo, dpr)
      await prepare(page, 'on')
      await visitScanned(page, GALLERY)
      expect(await page.evaluate(() => devicePixelRatio)).toBe(dpr)
      await scrollToExample(page)
      const targets = await measurementTargets(page, PHOSPHOR_ECHO_PRESET.opacity)
      expect(targets.map((target) => target.name)).toEqual(
        expect.arrayContaining(['card', 'cta', '24 in 0 0 24 24', '48 in 0 0 24 24', '48 in 0 0 240 240']),
      )
      await isolate(page)
      const shot = await capture(page)
      await keepPng(testInfo, `units-dpr${dpr}.png`, shot)
      const image = await decode(page, shot)
      viewport = page.viewportSize()!
      const height = viewport.height
      measured[dpr] = Object.fromEntries(
        targets
          .filter((target) => target.y + target.height + 24 < height && target.y > 0)
          .map((target) => [target.name, measure(image, target, dpr)]),
      )
      await page.context().close()
    }

    await attachJson(testInfo, 'css-pixel-units.json', {
      preset: PRESET_IDENTITY,
      viewport,
      dprs: [1, MOBILE_DPR],
      measured,
    })

    const glyphs = ['24 in 0 0 24 24', '48 in 0 0 24 24', '48 in 0 0 240 240']
    const all = [1, MOBILE_DPR].flatMap((dpr) =>
      Object.entries(measured[dpr]).map(([name, values]) => ({ dpr, name, ...values })),
    )
    for (const name of glyphs) {
      for (const dpr of [1, MOBILE_DPR]) expect(measured[dpr][name], `${name} at DPR ${dpr}`).toBeDefined()
    }
    for (const entry of all) {
      for (const value of [entry.offsetX, entry.softnessX, entry.offsetY, entry.softnessY]) {
        expect(Number.isFinite(value), `${entry.name} at DPR ${entry.dpr}: ${JSON.stringify(measured)}`).toBe(true)
      }
      // The preset's displacement, in CSS px, wherever it is measured.
      expect(Math.abs(entry.offsetX - -PHOSPHOR_ECHO_PRESET.x), `${entry.name} x offset at DPR ${entry.dpr}`).toBeLessThan(0.6)
      expect(Math.abs(entry.offsetY - PHOSPHOR_ECHO_PRESET.y), `${entry.name} y offset at DPR ${entry.dpr}`).toBeLessThan(0.6)
    }
    // And the same apparent offset and softness across ratios, sizes and viewBoxes.
    for (const key of ['offsetX', 'offsetY', 'softnessX', 'softnessY'] as const) {
      const values = all.map((entry) => entry[key])
      expect(Math.max(...values) - Math.min(...values), `${key} spread`).toBeLessThan(0.6)
    }
  })
})
