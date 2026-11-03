/**
 * Effects TASK-006 (REQ-006) — the live CRT Glass field composed over the
 * actual app, in a real browser, at 390 × 844 CSS px.
 *
 *   1. Per skin (CLEAR, Signal, Vapour, Mono), on `/generate`: Echo-only first
 *      (the field held off, Visual effects otherwise on) against effects off —
 *      left/bottom exposure, nothing above or right, interiors identical — then
 *      the composed treatment: the field mounted once, the same Echo geometry,
 *      filter, colours and card ground, lines painted as periodic curved rows
 *      over the page, the old decorative scans not painted, input reaching the
 *      real controls. Each skin writes a matched reference/new-app capture
 *      record (preserved motion host + the app) with full provenance for the
 *      owner's final UAT. Pixel identity with the raster reference is not a
 *      pass condition, and no perceptual threshold is used.
 *   2. Live: line drift and grain refresh change independently at the
 *      shipping cadence while the atmosphere blobs move, during scrolling and
 *      navigation; a dialog, generation loading (its busy sweep kept), reduced
 *      motion, a hidden tab and Visual effects off and on again.
 *   3. The real-component gallery example, off and on.
 *
 * The reference checkpoint is served read-only from inside this spec, in its
 * own context with service workers blocked. No shared configuration changes.
 */
import type { Page } from '@playwright/test'

import { CRT_FIELD_CONFIG } from '../../src/ui/crt-field/config'
import {
  REFERENCE_HOST, REFERENCE_ORIGIN, SKINS, appIdentity, expect, keepJson, keepPng, openGenerate,
  referenceIdentity, referenceInputs, serveReference, setEffects, setTabVisibility, settle,
  shippingConfiguration, syntheticApp, test,
} from './crt-live/harness'

const VIEWPORT = { width: 390, height: 844 }
const HIDE_FIELD = '.clr-crt-field { display: none !important; }'

// ---------------------------------------------------------------------------
// Pixels: decoded by the browser's canvas in the test page, compared here.
// ---------------------------------------------------------------------------

interface Rect { x: number; y: number; width: number; height: number }
interface Image { width: number; height: number; data: Buffer; dpr: number }

async function capture(page: Page): Promise<{ png: Buffer; image: Image }> {
  const png = await page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'device' })
  const dpr = await page.evaluate(() => devicePixelRatio)
  const decoded = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), {
      colorSpaceConversion: 'none', premultiplyAlpha: 'none',
    })
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d', { colorSpace: 'srgb' })!
    context.drawImage(bitmap, 0, 0)
    const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data
    let binary = ''
    for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000))
    return { width: bitmap.width, height: bitmap.height, data: btoa(binary) }
  }, png.toString('base64'))
  expect({ width: decoded.width, height: decoded.height }).toEqual({
    width: Math.round(VIEWPORT.width * dpr), height: Math.round(VIEWPORT.height * dpr),
  })
  return { png, image: { width: decoded.width, height: decoded.height, data: Buffer.from(decoded.data, 'base64'), dpr } }
}

function regionDiff(a: Image, b: Image, region: Rect, keep: (x: number, y: number) => boolean = () => true) {
  const { dpr } = a
  let max = 0
  let changed = 0
  for (let y = Math.max(0, Math.ceil(region.y * dpr)); y < Math.min(a.height, Math.floor((region.y + region.height) * dpr)); y++) {
    for (let x = Math.max(0, Math.ceil(region.x * dpr)); x < Math.min(a.width, Math.floor((region.x + region.width) * dpr)); x++) {
      if (!keep(x / dpr, y / dpr)) continue
      const i = (y * a.width + x) * 4
      const d = Math.max(Math.abs(a.data[i]! - b.data[i]!), Math.abs(a.data[i + 1]! - b.data[i + 1]!), Math.abs(a.data[i + 2]! - b.data[i + 2]!))
      if (d > 0) changed += 1
      if (d > max) max = d
    }
  }
  return { max, changed }
}

/** Per device row, the mean darkening the field adds over a strip (Echo-only − composed). */
function rowDarkening(echoOnly: Image, composed: Image, strip: Rect): number[] {
  const { dpr } = echoOnly
  const rows: number[] = []
  for (let y = Math.ceil(strip.y * dpr); y < Math.floor((strip.y + strip.height) * dpr); y++) {
    let sum = 0
    let n = 0
    for (let x = Math.ceil(strip.x * dpr); x < Math.floor((strip.x + strip.width) * dpr); x++) {
      const i = (y * echoOnly.width + x) * 4
      for (let c = 0; c < 3; c++) sum += echoOnly.data[i + c]! - composed.data[i + c]!
      n += 3
    }
    rows.push(sum / n)
  }
  return rows
}

/** Remove what varies slower than one period (vignette, content under the strip). */
function detrend(values: number[], period: number): number[] {
  return values.map((value, i) => {
    const window = values.slice(Math.max(0, i - Math.floor(period / 2)), i + Math.ceil(period / 2))
    return value - window.reduce((s, v) => s + v, 0) / window.length
  })
}

function correlation(values: number[], lag: number): number {
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  let num = 0
  let den = 0
  for (let i = 0; i < values.length; i++) {
    den += (values[i]! - mean) ** 2
    if (i + lag < values.length) num += (values[i]! - mean) * (values[i + lag]! - mean)
  }
  return den === 0 ? 0 : num / den
}

/** The vertical shift, in device rows within one period, that best aligns two strips. */
function bestPhase(a: number[], b: number[], period: number): number {
  let best = 0
  let bestScore = -Infinity
  for (let lag = 0; lag < period; lag++) {
    let score = 0
    for (let i = 0; i + lag < a.length && i < b.length; i++) score += a[i + lag]! * b[i]!
    if (score > bestScore) [best, bestScore] = [lag, score]
  }
  return best
}

// ---------------------------------------------------------------------------
// The DOM, read in the page.
// ---------------------------------------------------------------------------

interface Owner { name: string; rect: Rect; cut: number; ink: string; ground: string; rears: number }

async function readOwners(page: Page): Promise<Owner[]> {
  return page.evaluate(() => {
    const rect = (element: Element) => {
      const { x, y, width, height } = element.getBoundingClientRect()
      return { x, y, width, height }
    }
    const frameOf = (element: Element) => {
      const wrapper = element.closest('[data-echo="frame"]')
      const chamfer = element.matches('.clr-chamfer') ? element : element.querySelector('.clr-chamfer')!
      const outline = chamfer.closest('.clr-card') ?? chamfer
      const size = ['sm', 'md', 'lg'].find((name) => chamfer.classList.contains(`clr-chamfer--${name}`))!
      const before = getComputedStyle(chamfer, '::before')
      return {
        rect: rect(outline),
        cut: Number.parseFloat(getComputedStyle(chamfer).getPropertyValue(`--chamfer-${size}`)),
        ink: getComputedStyle(chamfer, '::after').backgroundColor,
        ground: `${before.backgroundColor} | ${before.boxShadow} | ${before.backgroundImage}`,
        rears: wrapper?.querySelectorAll('.clr-echo__source').length ?? 0,
      }
    }
    const heading = document.querySelector('h1 .clr-echo-text__foreground') ?? document.querySelector('h1')!
    const back = document.querySelector('button[aria-label="Home"]')!
    const card = document.querySelector('main .clr-card__body')!
    const cta = [...document.querySelectorAll('button')].find((b) => /generate workout/i.test(b.textContent ?? ''))!
    return [
      { name: 'heading', rect: rect(heading), cut: 0, ink: getComputedStyle(heading).color, ground: '', rears: document.querySelectorAll('h1 .clr-echo__source').length },
      { name: 'back', ...frameOf(back) },
      { name: 'card', ...frameOf(card) },
      { name: 'cta', ...frameOf(cta) },
    ]
  })
}

function insideFootprint(rect: Rect, cut: number, margin: number) {
  return (x: number, y: number) => {
    const right = rect.x + rect.width - x
    const bottom = rect.y + rect.height - y
    return x - rect.x >= margin && y - rect.y >= margin && right >= margin && bottom >= margin && right + bottom >= cut + margin * 2
  }
}

function bands({ x, y, width, height }: Rect) {
  return {
    left: { x: x - 12, y: y + 8, width: 10, height: Math.max(1, height - 8) },
    bottom: { x: x + 4, y: y + height + 2, width: Math.max(1, width - 16), height: 8 },
    above: { x: x + 12, y: y - 16, width: Math.max(1, width - 12), height: 8 },
    right: { x: x + width + 8, y: y - 4, width: 8, height: Math.max(1, height - 8) },
  }
}

/** The one field and its composition, as the page renders it now. */
async function readField(page: Page) {
  return page.evaluate(() => {
    const fields = document.querySelectorAll('.clr-crt-field')
    const field = fields[0] as HTMLElement | undefined
    const layer = (name: string) => field?.querySelector(`.clr-crt-field__${name}`) ?? null
    const style = (element: Element | null) => (element ? getComputedStyle(element) : null)
    const chamfers = [...document.querySelectorAll('.clr-chamfer')]
    const idleChamfers = chamfers.filter((el) => el.closest('[aria-busy="true"]') === null)
    return {
      count: fields.length,
      inRootHost: field?.parentElement?.classList.contains('clr-effects-host') ?? false,
      config: field?.dataset.crtConfig ?? null,
      motion: field?.dataset.motion ?? null,
      pointerEvents: style(field ?? null)?.pointerEvents ?? null,
      zIndex: style(field ?? null)?.zIndex ?? null,
      layers: field ? [...field.children].map((child) => child.getAttribute('class')) : [],
      perimeter: [...(layer('perimeter')?.children ?? [])].map((edge) => ({
        edge: edge.className,
        backdrop: getComputedStyle(edge).backdropFilter,
        mask: getComputedStyle(edge).maskImage,
        box: (({ x, y, width, height }) => ({ x, y, width, height }))(edge.getBoundingClientRect()),
      })),
      linesFilter: style(layer('lines'))?.filter ?? null,
      linesPath: layer('lines')?.querySelector('path')?.getAttribute('d')?.length ?? 0,
      grainImage: style(layer('grain'))?.backgroundImage.includes('feGaussianBlur') ?? false,
      vignette: style(layer('vignette'))?.backgroundImage ?? null,
      captureElements: field?.querySelectorAll('canvas, img, video, iframe').length ?? 0,
      shellFilter: style(document.querySelector('.clr-shell'))?.filter ?? null,
      atmosphereScans: document.querySelectorAll('.clr-atmosphere__scan').length,
      unusedOverlays: document.querySelectorAll('.scanlines-overlay').length,
      paintedFrameScans: idleChamfers.filter((el) => getComputedStyle(el, '::before').backgroundImage !== 'none').length,
      idleFrames: idleChamfers.length,
      echoFilter: document.querySelector('#clr-phosphor-echo')?.outerHTML ?? null,
      palette: ['--interaction', '--structure', '--info', '--brd', '--surface'].map((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()),
    }
  })
}

/** Input reaches the real control at its centre, never the field. */
async function hitsControls(page: Page) {
  return page.evaluate(() => {
    const targets = {
      heading: document.querySelector('h1'),
      back: document.querySelector('button[aria-label="Home"]'),
      cta: [...document.querySelectorAll('button')].find((b) => /generate workout/i.test(b.textContent ?? '')) ?? null,
      nested: document.querySelector('main .clr-card [role="group"] button'),
    }
    return Object.fromEntries(Object.entries(targets).map(([name, el]) => {
      if (!el) return [name, false]
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return [name, hit !== null && (el === hit || el.contains(hit)) && hit.closest('.clr-crt-field') === null]
    }))
  })
}

// ---------------------------------------------------------------------------
// 1. Echo-only, then composed, every skin, with matched reference captures.
// ---------------------------------------------------------------------------

test.describe('CRT Glass field composed on the actual /generate — every skin', () => {
  for (const skin of SKINS) {
    test(`${skin}: Echo-only first, then the composed field, with a matched reference capture`, async ({ browser, crtOrigin }, testInfo) => {
      test.setTimeout(120_000)
      const inputs = referenceInputs()
      const use = testInfo.project.use
      const contextOptions = {
        viewport: VIEWPORT, deviceScaleFactor: use.deviceScaleFactor, isMobile: use.isMobile, hasTouch: use.hasTouch,
        userAgent: use.userAgent, reducedMotion: 'reduce' as const,
      }
      const context = await browser.newContext({ ...contextOptions, baseURL: crtOrigin })
      const page = await context.newPage()
      const app = await syntheticApp(page, crtOrigin, { skin, effects: 'on' })
      await openGenerate(page)
      await page.getByRole('group', { name: 'Anchor' }).getByRole('button').first().click()
      await expect(page.getByRole('button', { name: /generate workout/i })).toBeEnabled()
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
      await page.waitForFunction(() => document.getAnimations().every((a) => !(a instanceof CSSTransition)), undefined, { timeout: 5_000 })
      await settle(page)

      // The composed treatment, as shipped.
      const composedField = await readField(page)
      const composedOwners = await readOwners(page)
      const controls = await hitsControls(page)
      const composed = await capture(page)

      // Echo-only: the same page with the field held off.
      const hold = await page.addStyleTag({ content: HIDE_FIELD })
      await settle(page)
      const echoOnlyField = await readField(page)
      const echoOnlyOwners = await readOwners(page)
      const echoOnly = await capture(page)
      await hold.evaluate((node) => (node as Element).remove())

      // Effects off: no Echo, no field.
      await setEffects(page, 'off')
      await expect(page.locator('.clr-crt-field, .clr-echo__source')).toHaveCount(0)
      await page.waitForFunction(() => document.getAnimations().every((a) => !(a instanceof CSSTransition)), undefined, { timeout: 5_000 })
      await settle(page)
      const offField = await readField(page)
      const off = await capture(page)
      await setEffects(page, 'on')
      await expect(page.locator('.clr-crt-field')).toHaveCount(1)
      app.assertReadOnly()
      await context.close()

      // ---- Echo-only (field held off) against effects off.
      const findings: Record<string, unknown> = {}
      for (const owner of echoOnlyOwners) {
        const b = bands(owner.rect)
        const left = regionDiff(echoOnly.image, off.image, b.left)
        const lower = owner.name === 'heading' ? regionDiff(echoOnly.image, off.image, owner.rect) : regionDiff(echoOnly.image, off.image, b.bottom)
        const above = regionDiff(echoOnly.image, off.image, b.above)
        const right = regionDiff(echoOnly.image, off.image, b.right)
        findings[`echo-only:${owner.name}`] = { left, lower, above, right }
        expect(owner.rears, `${owner.name}: one rear source`).toBe(1)
        expect(left.changed, `${owner.name}: Echo exposed to the left`).toBeGreaterThan(0)
        expect(lower.changed, `${owner.name}: Echo exposed below`).toBeGreaterThan(0)
        expect(above.max, `${owner.name}: no top leak`).toBeLessThanOrEqual(2)
        expect(right.max, `${owner.name}: no right leak`).toBeLessThanOrEqual(2)
        if (owner.name !== 'heading') {
          const interior = regionDiff(echoOnly.image, off.image, owner.rect, insideFootprint(owner.rect, owner.cut, 2))
          findings[`echo-only:${owner.name}-interior`] = interior
          expect(interior.max, `${owner.name}: full-footprint occlusion`).toBeLessThanOrEqual(2)
        }
      }

      // ---- Composed: one field over the same Echo.
      expect(composedField.count, 'the live field is mounted once').toBe(1)
      expect(composedField.inRootHost).toBe(true)
      expect(composedField.config).toBe(CRT_FIELD_CONFIG.id)
      expect(composedField.pointerEvents).toBe('none')
      expect(composedField.layers).toEqual(['clr-crt-field__perimeter', 'clr-crt-field__lines', 'clr-crt-field__grain', 'clr-crt-field__vignette'])
      // Four blurred edge strips, faded toward the centre; none reaches the centre.
      expect(composedField.perimeter).toHaveLength(4)
      for (const edge of composedField.perimeter) {
        expect(edge.backdrop, edge.edge).toMatch(/^blur\(/)
        expect(edge.mask, edge.edge).toMatch(/^linear-gradient\(/)
        const centre = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 }
        const reaches = (Math.abs(edge.box.x + edge.box.width / 2 - centre.x) < edge.box.width / 2 + 40) &&
          (Math.abs(edge.box.y + edge.box.height / 2 - centre.y) < edge.box.height / 2 + 40)
        expect(reaches, `${edge.edge} reaches the screen centre`).toBe(false)
      }
      expect(composedField.linesFilter, 'feathering is the grain’s alone').toBe('none')
      expect(composedField.linesPath).toBeGreaterThan(0)
      expect(composedField.grainImage, 'the grain carries its own feathering').toBe(true)
      expect(composedField.vignette).toContain('radial-gradient')
      expect(composedField.captureElements, 'no raster of the page').toBe(0)
      expect(composedField.shellFilter, 'no subtree is filtered by the field').toBe('none')
      for (const state of [composedField, echoOnlyField, offField]) {
        expect(state.atmosphereScans, 'atmosphere scan not painted').toBe(0)
        expect(state.unusedOverlays).toBe(0)
        expect(state.idleFrames).toBeGreaterThan(0)
        expect(state.paintedFrameScans, 'frame scan not painted').toBe(0)
      }
      // No second Echo, the same Echo filter (CSS-px offset and softness), the
      // same geometry, role colours, card ground and palette under the glass.
      expect(composedField.echoFilter).toBe(echoOnlyField.echoFilter)
      expect(composedField.palette).toEqual(echoOnlyField.palette)
      expect(composedOwners).toEqual(echoOnlyOwners)
      expect(Object.values(controls).every(Boolean), `input reaches the real controls: ${JSON.stringify(controls)}`).toBe(true)

      // The lines are painted: a periodic row structure over the centre, and
      // curved — the phase at the left differs from the centre near the top.
      const period = CRT_FIELD_CONFIG.lines.periodPx * echoOnly.image.dpr
      const centre = detrend(rowDarkening(echoOnly.image, composed.image, { x: 175, y: 380, width: 40, height: 60 }), period)
      const periodic = { atPeriod: correlation(centre, period), atHalf: correlation(centre, Math.round(period / 2)) }
      findings.lines = periodic
      expect(periodic.atPeriod, 'scanlines repeat at the configured period').toBeGreaterThan(periodic.atHalf)
      const strip = (x: number, y: number) => detrend(rowDarkening(echoOnly.image, composed.image, { x, y, width: 20, height: 45 }), period)
      const [topCentre, topLeft, midCentre, midLeft] = [strip(185, 80), strip(70, 80), strip(185, 400), strip(70, 400)]
      const curvature = { topPhase: bestPhase(topLeft, topCentre, period), middlePhase: bestPhase(midLeft, midCentre, period) }
      findings.curvature = curvature
      expect(curvature.topPhase, 'lines bow near the top edge').not.toBe(curvature.middlePhase)

      // ---- The preserved motion host at the same viewport and ratio.
      const hostContext = await browser.newContext({ ...contextOptions, serviceWorkers: 'block' })
      await serveReference(hostContext, inputs.root)
      const host = await hostContext.newPage()
      await host.addInitScript((value) => {
        localStorage.setItem('clear-crt-study-draft-v1', value)
        localStorage.setItem('clear-crt-study-comfort-v1', JSON.stringify({ reduceMotion: false, effectsOff: false }))
      }, JSON.stringify({ settings: inputs.settings, compare: false }))
      await host.goto(`${REFERENCE_ORIGIN}/${REFERENCE_HOST}`)
      await host.locator('#surface canvas').waitFor({ state: 'attached', timeout: 60_000 })
      const hostPng = await host.screenshot({ animations: 'disabled', caret: 'hide', scale: 'device' })
      const hostDpr = await host.evaluate(() => devicePixelRatio)
      await hostContext.close()

      await keepPng(testInfo, `crt-reference-host-${skin}.png`, hostPng)
      await keepPng(testInfo, `crt-app-${skin}-off.png`, off.png)
      await keepPng(testInfo, `crt-app-${skin}-echo-only.png`, echoOnly.png)
      await keepPng(testInfo, `crt-app-${skin}-composed.png`, composed.png)
      await keepJson(testInfo, `crt-capture-pair-${skin}.json`, {
        purpose: 'Matched reference/new-app capture pair for the owner’s final UAT on the working browser preview. Not a visual approval.',
        approval: 'pending owner review at final UAT',
        passCondition: 'structural, lifecycle and interaction assertions only; no raster pixel identity, no perceptual threshold',
        pair: { reference: `crt-reference-host-${skin}.png`, app: `crt-app-${skin}-composed.png` },
        appStates: { off: `crt-app-${skin}-off.png`, echoOnly: `crt-app-${skin}-echo-only.png`, composed: `crt-app-${skin}-composed.png` },
        reference: { ...referenceIdentity(inputs), skinOfHost: 'the host renders its own fixed specimen; it has no skin choice', devicePixelRatio: hostDpr },
        shippingConfiguration: shippingConfiguration(),
        app: appIdentity(),
        route: '/generate',
        skin,
        viewport: VIEWPORT,
        renderScale: 'device',
        devicePixelRatio: composed.image.dpr,
        sourceState: 'populated, first Anchor chosen, CTA enabled (primary), nothing focused, scrolled to top',
        motionState: 'reduced motion on both sides: atmosphere still, field clocks paused; Playwright screenshot animations disabled',
        knownDiscrepancies: [
          'The reference is a raster shader over a fixed specimen image; the app field is browser-native layers over live HTML, so pixels are not expected to match.',
          'Dialogs and sheets open in the browser top layer above the field; the field reads through their backdrop rather than over their content.',
        ],
        findings,
      })
    })
  }
})

// ---------------------------------------------------------------------------
// 2. Live motion and transitions.
// ---------------------------------------------------------------------------

interface Samples { lines: string[]; grain: string[]; blob: string[] }

/** Transforms of the line layer, the grain layer and one blob, every 100 ms. */
async function sample(page: Page, ms: number, scroll = false): Promise<Samples> {
  return page.evaluate(async ({ ms, scroll }) => {
    const read = (selector: string) => {
      const el = document.querySelector(selector)
      return el ? getComputedStyle(el).transform : 'missing'
    }
    const region = document.querySelector('main [role="region"], .clr-scroll-region') as HTMLElement | null
    const out = { lines: [] as string[], grain: [] as string[], blob: [] as string[] }
    for (let t = 0; t < ms; t += 100) {
      out.lines.push(read('.clr-crt-field__lines'))
      out.grain.push(read('.clr-crt-field__grain'))
      out.blob.push(read('.clr-atmosphere__blob--interaction'))
      if (scroll && region) region.scrollBy(0, t % 600 < 300 ? 24 : -24)
      await new Promise((done) => setTimeout(done, 100))
    }
    return out
  }, { ms, scroll })
}

const changes = (values: string[]) => values.slice(1).filter((value, i) => value !== values[i]).length

function expectIndependentMotion(s: Samples, label: string) {
  const lineChanges = changes(s.lines)
  const grainChanges = changes(s.grain)
  expect(s.lines.includes('missing') || s.grain.includes('missing'), `${label}: field layers present`).toBe(false)
  expect(lineChanges, `${label}: lines drift`).toBeGreaterThan(s.lines.length / 2)
  expect(grainChanges, `${label}: grain refreshes`).toBeGreaterThan(0)
  // At most one refresh per 1/refreshHz s, plus one boundary: the grain is not on the line clock.
  expect(grainChanges, `${label}: grain on its own clock`).toBeLessThanOrEqual(Math.ceil((s.grain.length / 10) * CRT_FIELD_CONFIG.grain.refreshHz) + 1)
  expect(changes(s.blob), `${label}: the atmosphere blobs move`).toBeGreaterThan(0)
  return { lineChanges, grainChanges, blobChanges: changes(s.blob) }
}

test.describe('CRT Glass field on the actual app — live motion and transitions', () => {
  test('drift and grain run independently while the blobs move, through scroll, navigation, a dialog, loading, reduced motion, a hidden tab and effects off', async ({ page, crtOrigin }, testInfo) => {
    test.setTimeout(150_000)
    const app = await syntheticApp(page, crtOrigin, { skin: 'vapour', effects: 'on', holdGeneration: true })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await openGenerate(page)
    const record: Record<string, unknown> = { shippingConfiguration: shippingConfiguration(), app: appIdentity(), viewport: page.viewportSize() }

    // The shipping cadence, read from the running animations.
    const timing = await page.evaluate(() => Object.fromEntries(document.getAnimations()
      .filter((a) => a.id.startsWith('clr-crt-'))
      .map((a) => [a.id, { duration: a.effect?.getTiming().duration, state: a.playState }])))
    record.timing = timing
    expect(timing['clr-crt-line-drift']).toEqual({ duration: CRT_FIELD_CONFIG.lines.driftSecondsPerPeriod * 1000, state: 'running' })
    expect(timing['clr-crt-grain-refresh']).toEqual({
      duration: (CRT_FIELD_CONFIG.grain.frames / CRT_FIELD_CONFIG.grain.refreshHz) * 1000, state: 'running',
    })
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>
      w.__crtField = document.querySelector('.clr-crt-field')
      w.__atmosphere = document.querySelector('.clr-atmosphere')
    })
    const sameNodes = () => page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>
      return w.__crtField === document.querySelector('.clr-crt-field') && w.__atmosphere === document.querySelector('.clr-atmosphere')
    })

    record.idle = expectIndependentMotion(await sample(page, 4_500), 'idle')

    // Input is not blocked: a real chip takes the tap through the field.
    const chip = page.getByRole('group', { name: 'Anchor' }).getByRole('button').first()
    await chip.click()
    await expect(page.getByRole('button', { name: /generate workout/i })).toBeEnabled()
    expect(Object.values(await hitsControls(page)).every(Boolean)).toBe(true)

    record.scrolling = expectIndependentMotion(await sample(page, 4_500, true), 'scrolling')
    expect(await sameNodes()).toBe(true)

    // Loading: the busy sweep stays as a state signal under the field.
    await page.getByRole('button', { name: /generate workout/i }).click()
    await expect.poll(() => app.held.length).toBe(1)
    await expect(page.getByRole('group', { name: 'Anchor' })).toBeHidden()
    await settle(page)
    const busy = await page.evaluate(() => [...document.querySelectorAll('[aria-busy="true"]')].map((el) => {
      const band = el.querySelector('.clr-scan-band')
      const before = getComputedStyle(el, '::before')
      return {
        band: band ? getComputedStyle(band).animationName : null,
        before: before.animationName,
        beforeImage: before.backgroundImage.includes('gradient'),
      }
    }))
    record.loading = busy
    expect(busy.length, 'a loading region is busy').toBeGreaterThan(0)
    expect(busy.some((b) => b.band === 'clr-scan-sweep' || (b.before.startsWith('clr-btn-scan') && b.beforeImage)), 'the busy sweep is kept').toBe(true)
    expect((await readField(page)).count).toBe(1)
    await keepPng(testInfo, 'crt-live-generation-loading.png', await page.screenshot({ scale: 'device' }))
    await page.getByRole('button', { name: /cancel/i }).first().click()
    await expect(page.getByRole('group', { name: 'Anchor' })).toBeVisible()

    // Navigation: the same field and atmosphere, still moving.
    await page.getByRole('button', { name: 'Home' }).click()
    await expect(page).toHaveURL(/\/$/)
    record.navigated = expectIndependentMotion(await sample(page, 4_500), 'after navigation')
    expect(await sameNodes()).toBe(true)

    // A dialog: its backdrop scan retired, its noise and tint kept; the field stays.
    await page.goto('/settings/locations')
    await page.getByRole('button', { name: /^delete$/i }).last().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const backdrop = await page.evaluate(() => getComputedStyle(document.querySelector('dialog[open]')!, '::backdrop').backgroundImage)
    record.dialogBackdrop = backdrop
    expect(backdrop).not.toContain('repeating-linear-gradient')
    expect(backdrop).toContain('url(')
    expect((await readField(page)).count).toBe(1)
    await keepPng(testInfo, 'crt-live-dialog.png', await page.screenshot({ scale: 'device' }))
    await dialog.getByRole('button').first().click()
    await expect(dialog).toBeHidden()

    // Reduced motion, live: both clocks and the blobs hold; the field stays.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.locator('.clr-crt-field')).toHaveAttribute('data-motion', 'paused')
    const still = await sample(page, 1_000)
    expect(changes(still.lines), 'lines held under reduced motion').toBe(0)
    expect(changes(still.grain), 'grain held under reduced motion').toBe(0)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expect(page.locator('.clr-crt-field')).toHaveAttribute('data-motion', 'running')

    // A hidden tab pauses, visible resumes.
    await setTabVisibility(page, 'hidden')
    await expect(page.locator('.clr-crt-field')).toHaveAttribute('data-motion', 'paused')
    await expect(page.locator('.clr-atmosphere')).toHaveAttribute('data-static', 'true')
    await setTabVisibility(page, 'visible')
    await expect(page.locator('.clr-crt-field')).toHaveAttribute('data-motion', 'running')
    expect(changes((await sample(page, 1_000)).lines)).toBeGreaterThan(0)

    // Visual effects off through the real Settings checkbox, then on again.
    await page.goto('/settings')
    const box = page.getByRole('checkbox', { name: 'Visual effects' })
    await expect(box).toBeChecked()
    await box.uncheck()
    await expect(page.locator('.clr-crt-field')).toHaveCount(0)
    const offState = await readField(page)
    expect(offState.atmosphereScans + offState.paintedFrameScans, 'no old scan restored').toBe(0)
    await box.check()
    await expect(page.locator('.clr-crt-field')).toHaveCount(1)
    await expect(page.locator('.clr-crt-field')).toHaveAttribute('data-motion', 'running')

    keepJson(testInfo, 'crt-live-motion.json', record)
    app.assertReadOnly()
  })
})

// ---------------------------------------------------------------------------
// 3. The real-component gallery example.
// ---------------------------------------------------------------------------

test.describe('CRT Glass field — gallery example', () => {
  test('shows the live atmosphere, Echo and field together, with Visual effects off and on', async ({ page, crtOrigin }, testInfo) => {
    await syntheticApp(page, crtOrigin, { skin: 'clear', effects: 'on' })
    await page.goto('/dev/gallery/app')
    const sample = page.locator('[data-crt-sample="composition"]')
    await sample.scrollIntoViewIfNeeded()
    await expect(sample.locator('.clr-atmosphere')).toHaveCount(1)
    await expect(sample.locator('.clr-crt-field--contained')).toHaveCount(1)
    expect(await sample.locator('.clr-echo__source').count()).toBeGreaterThan(0)
    await keepPng(testInfo, 'crt-gallery-on.png', await sample.screenshot({ scale: 'device' }))

    const box = sample.locator('xpath=..').getByRole('checkbox', { name: 'Visual effects' })
    await box.uncheck()
    await expect(sample.locator('.clr-crt-field')).toHaveCount(0)
    await expect(sample.locator('.clr-echo__source')).toHaveCount(0)
    await expect(sample.locator('.clr-atmosphere')).toHaveCount(1)
    await keepPng(testInfo, 'crt-gallery-off.png', await sample.screenshot({ scale: 'device' }))
    await box.check()
    await expect(sample.locator('.clr-crt-field--contained')).toHaveCount(1)
  })
})
