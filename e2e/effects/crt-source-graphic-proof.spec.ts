/**
 * TASK-201 (clear-effects-2026-10-30-live-source-proof) — can a live
 * SourceGraphic filter represent the preserved CRT Glass shader?
 *
 * A bounded, test-only investigation. It ships nothing and adopts nothing.
 *
 *   1. Still pair. The exact reference (the preserved `glass-effect.mjs` pass in
 *      the vendored PixiJS, on `assets/echo-clean.jpg`, 390 × 844, resolution 1,
 *      still phase and seed from `motion-clock.mjs`) against the candidate SVG
 *      filter on an element showing the same image at DPR 1. Numbers per channel
 *      and region, with no pass tolerance, plus one isolated sub-test per
 *      preserved operation, from which each operation is classified.
 *   2. Live app. The candidate on the actual running `/generate` screen (this
 *      workspace's Vite build, synthetic intercepted data), with live
 *      atmosphere blobs, the preferred Echo, input, scroll, loading and
 *      navigation: matched off/on captures and a test-only exact reference of
 *      the off capture, controlled line-only and grain-only motion, pauses,
 *      cleanup and a bounded on/off timing observation.
 *
 * Every CRT number comes from `crt-source-graphic-proof/fixture.ts`. The
 * preserved checkpoint is served read-only. A missing input or observation
 * fails the spec with its exact name; nothing is skipped. Emulated mobile
 * Chromium on a desktop host is not phone proof, and nothing here claims it.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { BrowserContext, Page, Route } from '@playwright/test'

import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { expect, test as base } from '../fixtures'
import { installCandidate, type CandidateConfig, type CandidateHandle, type CandidateOp } from './crt-source-graphic-proof/candidate'
import { loadProof, type Proof } from './crt-source-graphic-proof/fixture'
import {
  changeCorrelation, decodePng, diffStats, fromBase64, identical, intervalStats, invert, meanAbs, meanPeak,
  projectPhase, rectMask, stillRegions, type DiffStats, type Rgba,
} from './crt-source-graphic-proof/measure'
import { CLOCK_URL, PREFIX, renderReference, serveProof, SPECIMEN_URL, type ReferenceVariant } from './crt-source-graphic-proof/reference'

const OUT = resolve(process.cwd(), 'test-results/crt-source-graphic-proof')
const SUPPRESSION_STYLE = 'crt-proof-off-suppressed'

// ---------------------------------------------------------------------------
// This workspace's own app origin, with synthetic data (as the Echo specs do).
// ---------------------------------------------------------------------------

const OWNER = '00000000-0000-4000-8000-000000000201'
const HOME_ID = '00000000-0000-4000-8000-000000000202'
const GYM_ID = '00000000-0000-4000-8000-000000000203'
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS' }

async function waitForOrigin(origin: string, deadline: number) {
  while (Date.now() < deadline) {
    try {
      if ((await fetch(origin)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`TASK-201 blocker: the app origin ${origin} did not start`)
}

const test = base.extend<object, { proofOrigin: string }>({
  proofOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      const port = 5690 + workerInfo.parallelIndex
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [resolve(import.meta.dirname, '../../node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'], {
        env: { ...process.env, VITE_SUPABASE_URL: 'https://synthetic-crt-proof.supabase.invalid', VITE_SUPABASE_ANON_KEY: 'synthetic-crt-proof-public-placeholder' },
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
})

async function syntheticApp(page: Page, origin: string) {
  const writes: string[] = []
  const outbound: string[] = []
  const held: string[] = []
  await page.route('**/*', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === origin && ['GET', 'HEAD'].includes(request.method())) return route.continue()
    if (url.protocol === 'blob:' || url.protocol === 'data:') return route.continue()
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
      if (request.method() === 'POST') { held.push(url.pathname); return new Promise<void>(() => {}) }
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
  await page.addInitScript(({ owner }) => {
    if (sessionStorage.getItem('crt-proof-seeded')) return
    sessionStorage.setItem('crt-proof-seeded', '1')
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-crt-session', refreshToken: 'synthetic-crt-refresh', expiresAt: Date.now() + 3_600_000,
      user: { id: owner, email: 'synthetic-crt@example.invalid' },
    }))
    localStorage.setItem('clear.visual-effects', 'on')
  }, { owner: OWNER })
  return { held, writes, outbound }
}

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const captures: Record<string, { path: string; sha256: string }> = {}
function keep(name: string, png: Buffer) {
  const path = resolve(OUT, name)
  writeFileSync(path, png)
  captures[name] = { path: `test-results/crt-source-graphic-proof/${name}`, sha256: sha(png) }
}
const settle = (page: Page) => page.evaluate(async () => {
  await document.fonts.ready
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
})
const handle = (page: Page) => ({
  call: <T>(fn: (c: CandidateHandle, arg: never) => T | Promise<T>, arg?: unknown) =>
    page.evaluate(({ source, arg }) => {
      const c = (window as unknown as { __crtSourceGraphic: CandidateHandle }).__crtSourceGraphic
      return new Function('c', 'arg', `return (${source})(c, arg)`)(c, arg)
    }, { source: fn.toString(), arg }) as Promise<T>,
})
async function shot(page: Page) {
  const png = await page.screenshot({ caret: 'hide', scale: 'device' })
  return png
}

function candidateConfig(proof: Proof, geometry: { inputSize: number[]; inputClamp: number[] } | null, size: { width: number; height: number }, live: boolean): CandidateConfig {
  return {
    id: 'crt-source-graphic-proof',
    width: size.width,
    height: size.height,
    targetSelector: live ? '#root' : '#specimen',
    hostSelector: live ? '.clr-effects-host' : null,
    pinTarget: live,
    suppressScans: live,
    settings: proof.settings,
    shader: proof.shader,
    still: proof.still,
    hostLoop: proof.hostLoop,
    clockUrl: CLOCK_URL,
    inputSize: (geometry?.inputSize.slice(0, 2) ?? [size.width, size.height]) as [number, number],
    inputClamp: (geometry?.inputClamp ?? [0, 0, 1, 1]) as [number, number, number, number],
  }
}

// ---------------------------------------------------------------------------
// The proof.
// ---------------------------------------------------------------------------

test('TASK-201 SourceGraphic candidate against the preserved CRT Glass pass: still pair, operations and live app', async ({ browser, proofOrigin }, testInfo) => {
  test.setTimeout(900_000)
  mkdirSync(OUT, { recursive: true })
  const summary: Record<string, unknown> = {
    task: 'TASK-201', body: 'clear-effects-2026-10-30-live-source-proof',
    scope: 'Test-only investigation report. No shipping treatment, no adoption, no product-fidelity claim, no real-phone claim.',
    status: 'not-proven',
  }
  const write = () => writeFileSync(resolve(OUT, 'summary.json'), JSON.stringify({ ...summary, captures }, null, 2))
  const contexts: BrowserContext[] = []
  const missing: string[] = []
  const required = (label: string, ok: boolean) => { if (!ok) missing.push(label) }
  try {
    // Fails with the exact missing input: never a skip.
    const proof = await loadProof()
    const use = testInfo.project.use
    const size = { width: use.viewport!.width, height: use.viewport!.height }
    const captured = new Map<string, Buffer>()
    const newContext = async (options: Parameters<typeof browser.newContext>[0] = {}) => {
      const context = await browser.newContext({
        viewport: size, deviceScaleFactor: 1, isMobile: use.isMobile, hasTouch: use.hasTouch, userAgent: use.userAgent,
        baseURL: proofOrigin, reducedMotion: 'no-preference', ...options,
      })
      contexts.push(context)
      return context
    }
    summary.identity = {
      files: Object.fromEntries(Object.entries(proof.files).map(([key, f]) => [key, { sha256: f.sha256, bytes: f.bytes }])),
      settingsSource: 'CLEAR_EFFECTS_CURRENT_SETTINGS (crt-iab-current-settings.json); not working-session.mjs, PRESETS.selected, default-preset.json or a stored study draft',
      settings: proof.settings,
      still: proof.still,
      hostLoop: proof.hostLoop,
      shaderConstants: proof.shader.constants,
      vignetteSlots: proof.shader.vignetteSlots,
      crtVignetteCall: proof.shader.crtVignetteCall,
      browser: { name: browser.browserType().name(), version: browser.version() },
      project: testInfo.project.name,
    }

    // ---------------------------------------------------------------- Step 1
    const refContext = await newContext()
    const refPage = await refContext.newPage()
    await serveProof(refPage, proof, captured, size)
    await refPage.goto(`${PREFIX}harness.html`)
    const candContext = await newContext()
    const candPage = await candContext.newPage()
    await serveProof(candPage, proof, captured, size)

    const variants: { variant: ReferenceVariant; ops: CandidateOp[] }[] = [
      { variant: 'source', ops: [] },
      { variant: 'vignette', ops: ['vignette'] },
      { variant: 'blur', ops: ['blur'] },
      { variant: 'protect', ops: ['vignette', 'protect'] },
      { variant: 'grain', ops: ['grain'] },
      { variant: 'line', ops: ['line'] },
      { variant: 'scaling', ops: ['grain', 'line'] },
      { variant: 'full', ops: ['vignette', 'blur', 'protect', 'grain', 'line'] },
    ]
    const full = await renderReference(refPage, proof, SPECIMEN_URL, 'full', size)
    const geometry = full.info.filterGeometry
    const ref: Partial<Record<ReferenceVariant, Rgba>> = {}
    const cand: Partial<Record<ReferenceVariant, Rgba>> = {}
    const filterInfo: Record<string, unknown> = {}
    for (const { variant, ops } of variants) {
      const rendered = variant === 'full' ? full : await renderReference(refPage, proof, SPECIMEN_URL, variant, size)
      ref[variant] = fromBase64(size.width, size.height, rendered.rgba)
      keep(`still-reference-${variant}.png`, Buffer.from(rendered.png, 'base64'))
      await candPage.goto(`${PREFIX}specimen.html`)
      await candPage.locator('#specimen img').evaluate((img: HTMLImageElement) => img.decode())
      if (ops.length) {
        await candPage.evaluate(installCandidate, candidateConfig(proof, geometry, size, false))
        filterInfo[variant] = await handle(candPage).call((c, ops: CandidateOp[]) => c.mount(ops), ops)
        await candPage.waitForTimeout(300)
      }
      await settle(candPage)
      const png = await shot(candPage)
      keep(`still-candidate-${variant}.png`, png)
      cand[variant] = await decodePng(candPage, png)
      expect({ w: cand[variant]!.width, h: cand[variant]!.height }, 'candidate capture is the CSS size at DPR 1').toEqual({ w: size.width, h: size.height })
    }
    const imageSize = await candPage.locator('#specimen img').evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])
    const sourceRef = ref.source!
    const regions = stillRegions(cand.source!, proof.settings.edgeWidth, proof.shader.constants.protectLow, proof.shader.constants.protectHigh)
    const regionStats = (a: Rgba, b: Rgba) => Object.fromEntries(Object.entries(regions).map(([name, mask]) => [name, diffStats(a, b, mask)])) as Record<keyof typeof regions, DiffStats>

    const stillPair = regionStats(cand.full!, ref.full!)
    const stillIdentical = identical(stillPair.wholeFrame)
    const sourceIdentity = diffStats(cand.source!, sourceRef)

    const baselineOf: Record<string, ReferenceVariant> = { vignette: 'source', blur: 'source', protect: 'vignette', grain: 'source', line: 'source', scaling: 'source' }
    const primitives: Record<string, string> = {
      vignette: 'feImage (vignette field drawn from the CRTFilter vignette() GLSL) + feComposite arithmetic multiply on SourceGraphic',
      blur: 'feImage (edge-reach field from the preserved amount lines) + 8 feColorMatrix offset maps + 8 feDisplacementMap taps + feComposite arithmetic weighted sums + feColorMatrix renormalise + feComponentTransfer discrete reach mask + feComposite in/over',
      protect: 'feColorMatrix channel splits + feBlend lighten (brightest channel of SourceGraphic) + feComponentTransfer table (smoothstep) + feImage ratio field (clamped vignette ratio) + feComposite arithmetic/in/over; the Rec. 709 brightness division and 1/peak limit have no SVG primitive and are not computed',
      grain: 'feImage (grain field drawn from the preserved grainAt() GLSL at the clock seed) + feComposite arithmetic into the brightest-channel light target',
      line: 'feImage cos/sin bases from the preserved curved-wave lines + feComposite arithmetic phase rotation + feComponentTransfer table (0.65 light floor) + feComposite arithmetic',
      scaling: 'feColorMatrix channel splits + feBlend lighten (brightest channel) + premultiplied-alpha division (feComposite arithmetic into alpha, feColorMatrix un-premultiply) + feComposite arithmetic multiply by clamped target',
    }
    const names: Record<string, string> = {
      vignette: 'CRTFilter vignette (vignetting, vignettingAlpha, vignettingBlur)',
      blur: 'nine-tap perimeter edge softness (edgeBlur, edgeWidth)',
      protect: 'colour protection (brightest channel, Rec. 709 ratio clamped and limited by 1/peak, smoothstep blend)',
      grain: 'feathered grain (noise, noiseSize, grainSoftness, seed)',
      line: 'curved line wave with the dark-ground light floor (curvature, lineWidth, lineContrast, phase)',
      scaling: 'final brightest-channel RGB scaling',
    }
    const operations = Object.entries(baselineOf).map(([variant, baseline]) => {
      const v = variant as ReferenceVariant
      const stats = diffStats(cand[v]!, ref[v]!)
      const effect = meanAbs(ref[v]!, ref[baseline]!)
      const residual = meanAbs(cand[v]!, ref[v]!)
      const correlation = changeCorrelation(cand[v]!, ref[v]!, ref[baseline]!)
      const classification = identical(stats) ? 'represented-exactly'
        : effect === 0 ? 'not-determined'
          : residual < effect ? 'represented-with-measured-differences'
            : 'not-represented'
      return {
        operation: names[variant], subTest: `reference variant "${variant}" vs candidate ops [${variants.find((x) => x.variant === v)!.ops.join(', ')}]`,
        browserPrimitives: primitives[variant], baselineVariant: baseline,
        measured: { candidateVsReference: stats, operationEffectMeanAbs: effect, residualMeanAbs: residual, residualToEffect: effect ? Number((residual / effect).toFixed(6)) : null, changeCorrelation: correlation },
        classification,
      }
    })
    const rule = 'represented-exactly: every pixel and channel of the isolated sub-test equal. Otherwise, with E = mean |reference op − reference without op| and R = mean |candidate − reference|: E = 0 not-determined; R < E represented-with-measured-differences; R ≥ E not-represented. A classification rule, not an adoption tolerance.'
    summary.still = {
      specimen: { file: 'assets/echo-clean.jpg', naturalSize: imageSize, referenceTexture: full.info.textureSize, referenceSourcePixels: full.info.sourcePixels },
      reference: { renderer: `PixiJS ${full.info.pixiVersion} ${full.info.renderer} (${full.info.glRenderer})`, viewport: size, devicePixelRatio: 1, renderResolution: 1, phase: proof.still.phase, seed: proof.still.seed, filterGeometry: geometry },
      candidate: { technique: 'CSS filter: url(#…) SVG filter on the element’s SourceGraphic', viewport: size, devicePixelRatio: 1, renderResolution: 'device pixels at DPR 1', phase: proof.still.phase, seed: proof.still.seed, filter: filterInfo.full },
      sourceDecodeIdentity: { note: 'Pixi texture of echo-clean.jpg with no filter vs the <img> element with no filter', stats: sourceIdentity },
      pair: stillPair,
      pairIdentical: stillIdentical,
      noPassTolerance: true,
      classificationRule: rule,
      operations,
      neutralTextureHypothesis: 'not included in this run',
    }
    const allRepresented = operations.every((o) => o.classification === 'represented-exactly' || o.classification === 'represented-with-measured-differences')
    const verdict = stillIdentical ? 'represented-exactly' : allRepresented ? 'represented-with-measured-differences' : 'inconclusive'
    summary.verdict = {
      overall: verdict,
      supportingObservations: stillIdentical
        ? ['every pixel of the still pair matched']
        : operations.filter((o) => o.classification !== 'represented-exactly').map((o) => `${o.operation}: ${o.classification} (R/E ${o.measured.residualToEffect})`),
      notAClaimOf: ['product fidelity', 'adoption', 'real-phone behaviour', 'equivalence to the reference unless every still pixel matched'],
    }
    write()

    // ---------------------------------------------------------------- Step 2
    const liveContext = await newContext()
    const page = await liveContext.newPage()
    const app = await syntheticApp(page, proofOrigin)
    await serveProof(page, proof, captured, size)
    await page.goto('/generate')
    await expect(page.getByRole('heading', { level: 1, name: 'Generate', exact: true })).toBeVisible()
    const anchors = page.getByRole('group', { name: 'Anchor' }).getByRole('button')
    await expect(anchors.first()).toBeVisible()
    await anchors.first().tap()
    await expect(anchors.first()).toHaveAttribute('aria-pressed', 'true')
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.waitForFunction(() => document.getAnimations().every((a) => !(a instanceof CSSTransition)), undefined, { timeout: 30_000 })
    await settle(page)

    const snapshot = () => page.evaluate(() => {
      const rect = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }
      const echo = document.querySelectorAll('filter#clr-phosphor-echo')
      const host = document.querySelector<HTMLElement>('.clr-effects-host')
      const scan = document.querySelector('.clr-atmosphere__scan')
      const frame = document.querySelector('.clr-chamfer:not([aria-busy="true"])')
      return {
        route: location.pathname,
        skin: document.documentElement.dataset.skin ?? localStorage.getItem('clear.skin') ?? 'default (no stored skin)',
        fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight} ${f.style}`),
        devicePixelRatio: devicePixelRatio,
        host: { effects: host?.dataset.effects, motion: host?.dataset.motion },
        echo: {
          definitions: echo.length,
          definition: echo[0]?.outerHTML ?? null,
          sources: document.querySelectorAll('.clr-echo__source').length,
          nested: document.querySelectorAll('[data-echo] [data-echo]').length,
        },
        blobs: document.querySelectorAll('.clr-atmosphere__blob').length,
        runningAnimations: document.getAnimations().filter((a) => a.playState === 'running').length,
        scan: scan ? getComputedStyle(scan).visibility : 'absent',
        frameScan: frame ? getComputedStyle(frame, '::before').backgroundImage.slice(0, 40) : 'absent',
        layout: [...document.querySelectorAll('h1, main button, main input, .clr-card')].map(rect),
        rootStyle: (document.querySelector('#root') as HTMLElement).style.cssText,
        proofNodes: document.querySelectorAll('[data-crt-source-graphic-proof]').length,
      }
    })
    const masks = () => page.evaluate(() => {
      const rect = (r: DOMRect) => ({ x: r.x, y: r.y, width: r.width, height: r.height })
      const text: ReturnType<typeof rect>[] = []
      const walker = document.createTreeWalker(document.querySelector('.clr-shell__content')!, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const r of range.getClientRects()) text.push(rect(r))
      }
      const controls = [...document.querySelectorAll('button, input, select, textarea, [role="checkbox"]')].map((el) => rect(el.getBoundingClientRect()))
      const frames = [...document.querySelectorAll('.clr-chamfer')].map((el) => rect(el.getBoundingClientRect()))
      return { text, controls, frames }
    })
    const before = await snapshot()
    const gpu = await page.evaluate(() => {
      const gl = new OffscreenCanvas(1, 1).getContext('webgl2')
      const info = gl?.getExtension('WEBGL_debug_renderer_info')
      return gl && info ? { vendor: gl.getParameter(info.UNMASKED_VENDOR_WEBGL), renderer: gl.getParameter(info.UNMASKED_RENDERER_WEBGL) } : null
    })
    expect(before.echo.definitions, 'the preferred Phosphor Echo is installed once').toBe(1)
    expect(before.echo.sources, 'the Echo has rear sources on /generate').toBeGreaterThan(0)
    expect(before.blobs, 'live atmosphere blobs are present').toBeGreaterThan(0)
    expect(before.runningAnimations, 'the atmosphere is moving').toBeGreaterThan(0)
    expect(before.host).toEqual({ effects: 'on', motion: 'allowed' })

    // Timing, candidate off: the same short interaction is repeated with it on.
    const scroller = page.getByRole('region', { name: 'Generate content' })
    const timed = async () => {
      await page.evaluate(() => {
        const w = window as unknown as { __timing: { frames: number[]; longTasks: number; stop: boolean; observer: PerformanceObserver } }
        const t = { frames: [] as number[], longTasks: 0, stop: false, observer: new PerformanceObserver((list) => { t.longTasks += list.getEntries().length }) }
        t.observer.observe({ type: 'longtask' })
        let last = 0
        const loop = (now: number) => { if (last) t.frames.push(now - last); last = now; if (!t.stop) requestAnimationFrame(loop) }
        requestAnimationFrame(loop)
        w.__timing = t
      })
      const box = await scroller.boundingBox({ timeout: 10_000 })
      if (!box) throw new Error('TASK-201 blocker: the Generate content region is not on screen for the timing interaction')
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      for (const dy of [120, 120, -120, -120]) { await page.mouse.wheel(0, dy); await page.waitForTimeout(150) }
      await anchors.nth(1).tap()
      await anchors.first().tap()
      await page.waitForTimeout(300)
      return page.evaluate(() => {
        const t = (window as unknown as { __timing: { frames: number[]; longTasks: number; stop: boolean; observer: PerformanceObserver } }).__timing
        t.stop = true
        t.observer.disconnect()
        return { frames: t.frames, longTasks: t.longTasks }
      })
    }
    const timingOff = await timed()
    await scroller.evaluate((el) => el.scrollTo(0, 0))
    await settle(page)

    // Matched still captures. The test (never the candidate) holds the CSS
    // animations at one time for this pair only, then lets them run again.
    await page.evaluate(() => { for (const a of document.getAnimations()) a.pause() })
    const pngOff = await shot(page)
    keep('live-off.png', pngOff)
    const liveRegions = await masks()
    await page.addStyleTag({ content: '.clr-atmosphere__scan{visibility:hidden !important}.clr-chamfer:not([aria-busy="true"])::before{background-image:none !important}' })
    await page.evaluate((id) => { const s = document.head.lastElementChild as HTMLStyleElement; s.id = id }, SUPPRESSION_STYLE)
    await settle(page)
    const pngOffSuppressed = await shot(page)
    keep('live-off-scan-suppressed.png', pngOffSuppressed)
    await page.evaluate((id) => document.getElementById(id)?.remove(), SUPPRESSION_STYLE)
    await page.evaluate(installCandidate, candidateConfig(proof, geometry, size, true))
    const live = handle(page)
    const mounted = await live.call((c) => c.mount(['vignette', 'blur', 'protect', 'grain', 'line']))
    await page.waitForTimeout(400)
    await settle(page)
    const pngOn = await shot(page)
    keep('live-on.png', pngOn)
    const onState = await snapshot()
    await page.evaluate(() => { for (const a of document.getAnimations()) a.play() })

    captured.set('live-off-scan-suppressed.png', pngOffSuppressed)
    const liveRef = await renderReference(refPage, proof, `${PREFIX}capture/live-off-scan-suppressed.png`, 'full', size)
    keep('live-reference.png', Buffer.from(liveRef.png, 'base64'))
    const off = await decodePng(page, pngOff)
    const offSup = await decodePng(page, pngOffSuppressed)
    const on = await decodePng(page, pngOn)
    const liveReference = fromBase64(size.width, size.height, liveRef.rgba)
    const W = size.width, H = size.height
    const textMask = rectMask(W, H, liveRegions.text)
    const controlMask = rectMask(W, H, liveRegions.controls)
    const frameMask = rectMask(W, H, liveRegions.frames)
    const foreground = rectMask(W, H, [...liveRegions.text, ...liveRegions.controls, ...liveRegions.frames])
    const role = foreground.map((v, p) => {
      if (!v) return 0
      const r = offSup.data[p * 4]!, g = offSup.data[p * 4 + 1]!, b = offSup.data[p * 4 + 2]!
      const max = Math.max(r, g, b)
      return max / 255 >= proof.shader.constants.protectLow && (max - Math.min(r, g, b)) / 255 >= 0.25 ? 1 : 0
    })
    const masksLive: Record<string, Uint8Array> = { wholeFrame: new Uint8Array(W * H).fill(1), foregroundText: textMask, controls: controlMask, frames: frameMask, roleColouredPixels: role, atmosphereBackground: invert(foreground) }
    const per = (a: Rgba, b: Rgba) => Object.fromEntries(Object.entries(masksLive).map(([n, m]) => [n, diffStats(a, b, m)]))
    expect(onState.echo, 'exactly one Echo, unchanged, while the candidate renders').toEqual(before.echo)
    expect(onState.layout, 'the candidate moved no layout').toEqual(before.layout)
    expect(onState.scan, 'no candidate line over the atmosphere scan: it is suppressed test-locally').toBe('hidden')
    expect(onState.frameScan.startsWith('none'), 'no candidate line over a decorative frame scan').toBe(true)

    // Motion: line only (grain seed fixed), then grain only (line phase fixed).
    const cos = (await live.call((c) => c.field('cos')))!
    const sin = (await live.call((c) => c.field('sin')))!
    const bg = masksLive.atmosphereBackground!
    /** Frames until `done` holds (at least `frames`), bounded by `maxMs` of wall time. */
    type Shot = { png: Buffer; t0: number; t1: number }
    const run = async (label: string, overrides: { animate?: boolean; grainAnimate?: boolean }, frames: number, gapMs: number, maxMs: number, done: (shots: Shot[]) => Promise<boolean> = async () => true) => {
      await live.call((c, o: object) => c.start(o), overrides)
      await page.waitForTimeout(150)
      const shots: Shot[] = []
      const startedAt = Date.now()
      while (shots.length < frames || (!(await done(shots)) && Date.now() - startedAt < maxMs)) {
        const t0 = await page.evaluate(() => performance.now())
        const png = await shot(page)
        const t1 = await page.evaluate(() => performance.now())
        shots.push({ png, t0, t1 })
        if (gapMs) await page.waitForTimeout(gapMs)
      }
      await live.call((c) => c.stop())
      const log = await live.call((c) => c.log.slice())
      const shown = await live.call((c) => c.grainShown.slice())
      const images = await Promise.all(shots.map((s) => decodePng(page, s.png)))
      shots.forEach((s, i) => keep(`motion-${label}-${String(i).padStart(2, '0')}.png`, s.png))
      return { shots, log, shown, images }
    }
    const lineRun = await run('line-only', { grainAnimate: false }, 12, 0, 0)
    const lineWindow = lineRun.log.filter((e) => e.t >= lineRun.shots[0]!.t0 && e.t <= lineRun.shots.at(-1)!.t1)
    const unwrap = (values: number[]) => values.reduce<number[]>((acc, v) => {
      if (!acc.length) return [v]
      let next = v
      while (next - acc.at(-1)! > Math.PI) next -= 2 * Math.PI
      while (next - acc.at(-1)! < -Math.PI) next += 2 * Math.PI
      return [...acc, next]
    }, [])
    const slope = (ts: number[], ys: number[]) => {
      const n = ts.length, mt = ts.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n
      const num = ts.reduce((s, t, i) => s + (t - mt) * (ys[i]! - my), 0), den = ts.reduce((s, t) => s + (t - mt) ** 2, 0)
      return den ? num / den : 0
    }
    const logSlope = slope(lineWindow.map((e) => e.t / 1000), unwrap(lineWindow.map((e) => e.phase)))
    const lineBase = meanPeak(lineRun.images)
    const pixelPhases = lineRun.images.map((img) => projectPhase(img, lineBase, cos, sin, bg))
    const matched = pixelPhases.map((p, i) => {
      const candidates = lineRun.log.filter((e) => e.t <= lineRun.shots[i]!.t1 && e.t >= lineRun.shots[i]!.t0 - 100)
      const dist = (e: { phase: number }) => Math.abs(Math.atan2(Math.sin(p.phase - e.phase), Math.cos(p.phase - e.phase)))
      const best = candidates.sort((a, b) => dist(a) - dist(b))[0]
      return { pixelPhase: Number(p.phase.toFixed(4)), amplitude: Number(p.amplitude.toFixed(5)), nearestRenderedPhase: best ? Number(best.phase.toFixed(4)) : null, residual: best ? Number(dist(best).toFixed(4)) : null }
    })
    const lineDiffs = lineRun.images.slice(1).map((img, i) => diffStats(img, lineRun.images[i]!, bg))
    const lineSeeds = [...new Set(lineWindow.map((e) => e.seed))]

    // A frame's grain index counts only when no swap landed inside its capture
    // window. Run until two such consecutive frames straddle a refresh and two
    // swaps (one full interval) were shown, bounded.
    const swapsBefore = (await live.call((c) => c.grainShown.length))
    const certainIndex = (shown: { t: number; grainIndex: number }[], s: Shot) => {
      const at = (t: number) => shown.filter((e) => e.t <= t).at(-1)?.grainIndex ?? 0
      return at(s.t0) === at(s.t1) ? at(s.t0) : null
    }
    const straddles = (shown: { t: number; grainIndex: number }[], shots: Shot[]) => shots.slice(1).some((s, i) => {
      const a = certainIndex(shown, shots[i]!), b = certainIndex(shown, s)
      return a !== null && b !== null && a !== b
    })
    const grainRun = await run('grain-only', { animate: false }, 6, 2_500, 240_000, async (shots) => {
      const shown = await live.call((c) => c.grainShown.slice())
      return shown.length >= swapsBefore + 2 && straddles(shown, shots)
    })
    const grainWindow = grainRun.log.filter((e) => e.t >= grainRun.shots[0]!.t0 && e.t <= grainRun.shots.at(-1)!.t1)
    const grainPhases = [...new Set(grainWindow.map((e) => e.phase))]
    const swaps = grainRun.shown.slice(swapsBefore)
    const swapIntervals = swaps.slice(1).map((s, i) => (s.t - swaps[i]!.t) / 1000)
    const grainPairs = grainRun.images.slice(1).map((img, i) => {
      const a = certainIndex(grainRun.shown, grainRun.shots[i]!), b = certainIndex(grainRun.shown, grainRun.shots[i + 1]!)
      return { grainIndices: [a, b], grainChanged: a === null || b === null ? null : a !== b, stats: diffStats(img, grainRun.images[i]!, bg) }
    })
    const changedPairs = grainPairs.filter((p) => p.grainChanged === true)
    const unchangedPairs = grainPairs.filter((p) => p.grainChanged === false)
    const meanOf = (pairs: typeof grainPairs) => pairs.length ? Number((pairs.reduce((s, p) => s + p.stats.anyChannel.fraction, 0) / pairs.length).toFixed(6)) : null

    required('line-only motion frames were captured', lineRun.images.length === 12 && lineWindow.length > 1)
    required('line-only run kept the grain seed fixed', lineSeeds.length === 1 && lineSeeds[0] === proof.still.seed)
    required('line-only frames differ on the composited screen', lineDiffs.some((d) => d.anyChannel.differing > 0))
    required('grain-only run kept the line phase fixed', grainPhases.length === 1)
    required('a grain refresh fell between two grain-only frames', changedPairs.length > 0)

    // Input, scroll, loading and navigation with the candidate on and moving.
    await live.call((c) => c.start())
    const inputs: Record<string, unknown> = {}
    const failures: string[] = []
    const attempt = async (name: string, fn: () => Promise<unknown>) => {
      try {
        inputs[name] = { ok: true, observed: await fn() }
      } catch (error) {
        keep(`input-failure-${name}.png`, await shot(page))
        inputs[name] = { ok: false, error: String(error).slice(0, 600), url: page.url() }
        failures.push(name)
      }
      summary.liveInputs = inputs
      write()
    }
    await attempt('tapControlBeneathCandidate', async () => {
      await anchors.nth(1).tap({ timeout: 30_000 })
      await expect(anchors.nth(1)).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 })
      return 'second Anchor chip pressed by a tap through the filtered root'
    })
    await attempt('scrollMovesContent', async () => {
      // At 390 × 844 the populated form may fit; then the scroll is observed on a
      // shorter viewport (recorded), and the matched viewport is restored after.
      const extent = () => scroller.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }))
      const atMatched = await extent()
      const viewport = atMatched.scrollHeight > atMatched.clientHeight ? size : { width: size.width, height: 560 }
      if (viewport !== size) await page.setViewportSize(viewport)
      await expect.poll(async () => { const e = await extent(); return e.scrollHeight > e.clientHeight }, { timeout: 20_000 }).toBe(true)
      const box = (await scroller.boundingBox({ timeout: 30_000 }))!
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Input.synthesizeScrollGesture', { x: box.x + box.width / 2, y: box.y + box.height * 0.7, yDistance: -240, gestureSourceType: 'touch', speed: 800 })
      await expect.poll(() => scroller.evaluate((el) => el.scrollTop), { timeout: 20_000 }).toBeGreaterThan(0)
      const top = await scroller.evaluate((el) => el.scrollTop)
      await cdp.detach()
      await scroller.evaluate((el) => el.scrollTo(0, 0))
      if (viewport !== size) await page.setViewportSize(size)
      return { method: 'touch scroll gesture (CDP Input.synthesizeScrollGesture) over the Generate content region', atMatchedViewport: atMatched, viewport, scrollTop: top }
    })
    await attempt('loadingStateVisible', async () => {
      await page.getByRole('button', { name: /generate workout/i }).tap({ timeout: 30_000 })
      await expect.poll(() => app.held.length, { timeout: 30_000 }).toBeGreaterThan(0)
      const busy = page.locator('[aria-busy="true"]').first()
      await expect(busy).toBeVisible({ timeout: 30_000 })
      await page.waitForTimeout(300)
      const sweep = await page.evaluate(() => {
        const el = document.querySelector('[aria-busy="true"]')!
        const band = el.querySelector('.clr-scan-band')
        return {
          busyBefore: getComputedStyle(el, '::before').backgroundImage.slice(0, 60),
          band: band ? { visibility: getComputedStyle(band).visibility, display: getComputedStyle(band).display, animations: band.getAnimations().length } : null,
          rootFilter: (document.querySelector('#root') as HTMLElement).style.filter,
        }
      })
      keep('live-on-loading.png', await shot(page))
      expect(sweep.busyBefore.startsWith('none'), 'the busy sweep was suppressed').toBe(false)
      await page.getByRole('button', { name: /cancel/i }).first().tap()
      await expect(page.getByRole('group', { name: 'Anchor' })).toBeVisible({ timeout: 30_000 })
      return sweep
    })
    await attempt('navigationCompletes', async () => {
      await page.getByRole('button', { name: 'Home' }).tap({ timeout: 30_000 })
      await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
      const home = await page.evaluate(() => (document.querySelector('#root') as HTMLElement).style.filter)
      await page.goBack()
      await expect(page.getByRole('group', { name: 'Anchor' })).toBeVisible({ timeout: 30_000 })
      await settle(page)
      return { home: '/', back: '/generate', rootFilterOnHome: home }
    })
    for (const name of ['tapControlBeneathCandidate', 'scrollMovesContent', 'loadingStateVisible', 'navigationCompletes']) {
      expect(inputs[name], `input observation ${name} was recorded`).toBeDefined()
    }
    const timingOn = await timed()
    await scroller.evaluate((el) => el.scrollTo(0, 0))

    // Pauses and resume.
    const frames = () => live.call((c) => c.state())
    const hostState = () => page.evaluate(() => ({ ...(document.querySelector('.clr-effects-host') as HTMLElement).dataset }))
    const logLengthNow = () => live.call((c) => c.log.length)
    const pause = async (label: string, expected: { effects?: string; motion?: string }, enter: () => Promise<unknown>, leave: () => Promise<unknown>) => {
      // Moving first: a fresh rendered frame, so the pause starts from motion.
      const startLength = await logLengthNow()
      await expect.poll(logLengthNow, { timeout: 30_000 }).toBeGreaterThan(startLength)
      await enter()
      await expect.poll(async () => { const h = await hostState(); return (!expected.effects || h.effects === expected.effects) && (!expected.motion || h.motion === expected.motion) }, { timeout: 30_000 }).toBe(true)
      const host = await hostState()
      // Let any frame already in flight land, then watch a window.
      await page.waitForTimeout(2_000)
      const lastBefore = (await live.call((c) => c.log.at(-1)))!
      const a = await frames()
      await page.waitForTimeout(3_000)
      const b = await frames()
      const offPng = label === 'visual-effects-off' ? await shot(page) : null
      if (offPng) keep('live-effects-off.png', offPng)
      const rootFilter = await page.evaluate(() => (document.querySelector('#root') as HTMLElement).style.filter)
      await leave()
      await expect.poll(() => live.call((c, t: number) => c.log.filter((e) => e.t > t).length, lastBefore.t), { timeout: 30_000 }).toBeGreaterThan(1).catch(() => undefined)
      const after = await live.call((c, t: number) => c.log.filter((e) => e.t > t), lastBefore.t)
      const firstAfter = after[0]
      return {
        host, rootFilterWhilePaused: rootFilter, rendering: a.rendering, rafPending: b.rafPending,
        scheduledDuringPause: b.scheduledTotal - a.scheduledTotal, rendersDuringPause: b.rendersTotal - a.rendersTotal,
        resumed: Boolean(firstAfter),
        resumeJump: firstAfter ? { phaseBefore: lastBefore.phase, phaseAfter: firstAfter.phase, delta: Number((firstAfter.phase - lastBefore.phase).toFixed(6)), gapSeconds: Number(((firstAfter.t - lastBefore.t) / 1000).toFixed(3)), framesAfter: after.length } : null,
      }
    }
    const setEffects = (value: 'on' | 'off') => page.evaluate((v) => {
      localStorage.setItem('clear.visual-effects', v)
      window.dispatchEvent(new StorageEvent('storage', { key: 'clear.visual-effects' }))
    }, value)
    const setVisibility = (value: 'hidden' | 'visible') => page.evaluate((v) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v })
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => v === 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    }, value)
    const pauses = {
      visualEffectsOff: await pause('visual-effects-off', { effects: 'off' }, () => setEffects('off'), () => setEffects('on')),
      reducedMotion: await pause('reduced-motion', { motion: 'still' }, () => page.emulateMedia({ reducedMotion: 'reduce' }), () => page.emulateMedia({ reducedMotion: 'no-preference' })),
      hiddenDocument: await pause('hidden', { motion: 'still' }, () => setVisibility('hidden'), () => setVisibility('visible')),
    }
    required('Visual effects off reached the effects host', pauses.visualEffectsOff.host.effects === 'off')
    required('Visual effects off: the candidate renders nothing', !pauses.visualEffectsOff.rendering && pauses.visualEffectsOff.rootFilterWhilePaused === '')
    required('reduced motion reached the effects host', pauses.reducedMotion.host.motion === 'still')
    required('a hidden document reached the effects host', pauses.hiddenDocument.host.motion === 'still')
    for (const [name, p] of Object.entries(pauses)) {
      required(`${name}: no frame updates scheduled while paused`, p.scheduledDuringPause === 0 && !p.rafPending)
      required(`${name}: motion resumed`, p.resumed)
    }

    // Cleanup: the candidate leaves nothing behind and the app is unchanged.
    await live.call((c) => c.destroy())
    const released = await frames()
    const logLength = (await live.call((c) => c.log.length))
    await page.waitForTimeout(600)
    const afterRemoval = await snapshot()
    const cleanup = {
      state: released,
      logGrewAfterRemoval: (await live.call((c) => c.log.length)) - logLength,
      snapshot: afterRemoval,
    }
    expect(released).toMatchObject({ mounted: false, rendering: false, rafPending: false, observers: 0, blobUrls: 0 })
    expect(cleanup.logGrewAfterRemoval).toBe(0)
    expect(afterRemoval.proofNodes, 'no candidate node remains').toBe(0)
    expect(afterRemoval.rootStyle, '#root inline style restored').toBe(before.rootStyle)
    expect(afterRemoval.echo, 'Echo unchanged after removal').toEqual(before.echo)
    expect(afterRemoval.scan, 'atmosphere scan visible again').toBe(before.scan)
    expect(afterRemoval.layout).toEqual(before.layout)
    await anchors.nth(1).tap()
    await expect(anchors.nth(1)).toHaveAttribute('aria-pressed', 'true')
    expect(app.writes, 'no write and no model call').toEqual([])
    expect(app.outbound, 'nothing leaves the local origin').toEqual([])

    summary.live = {
      route: '/generate',
      uiState: 'populated Generate form (synthetic onboarded profile, two places, no history), first Anchor chosen, CTA enabled, nothing focused, content scrolled to top',
      skin: before.skin,
      fonts: before.fonts,
      viewport: size,
      devicePixelRatio: before.devicePixelRatio,
      renderResolution: 'device pixels at DPR 1 (candidate); Pixi resolution 1 (test-only reference)',
      echoPresent: before.echo.definitions === 1 && before.echo.sources > 0,
      echo: { before: before.echo, whileCandidateOn: onState.echo, afterRemoval: afterRemoval.echo },
      candidate: { target: '#root (test-locally pinned position: fixed; inset: 0 while filtered)', filter: mounted },
      decorativeScans: {
        policy: 'Test-local only while the candidate renders: .clr-atmosphere__scan hidden and non-busy .clr-chamfer::before frame-scan texture removed. Busy sweeps ([aria-busy]) and .clr-scan-band are untouched.',
        whileOn: { atmosphereScan: onState.scan, frameScan: onState.frameScan },
        afterRemoval: { atmosphereScan: afterRemoval.scan, frameScan: afterRemoval.frameScan },
      },
      matchedCaptures: {
        heldAnimationTime: 'For this pair only the test paused every CSS animation at one moment, then resumed them; the candidate never freezes anything.',
        files: ['live-off.png', 'live-off-scan-suppressed.png', 'live-on.png', 'live-reference.png'],
        reference: 'preserved pass (full) applied by the test to live-off-scan-suppressed.png at the same settings, phase and seed',
        roleColouredDefinition: `foreground pixels whose off brightest channel ≥ ${proof.shader.constants.protectLow} and channel spread ≥ 0.25`,
        candidateOnVsOffAsShipped: per(on, off),
        candidateOnVsOffScanSuppressed: per(on, offSup),
        candidateOnVsTestOnlyReference: per(on, liveReference),
        testOnlyReferenceVsOffScanSuppressed: per(liveReference, offSup),
      },
      motion: {
        lineOnly: {
          frames: lineRun.images.length, grainSeedsInRun: lineSeeds,
          configuredCycleSeconds: proof.settings.cycleSeconds,
          observedCycleSecondsFromRenderedFrames: logSlope ? Number((2 * Math.PI / logSlope).toFixed(4)) : null,
          renderedFramesInWindow: lineWindow.length,
          pixelPhaseEstimates: matched,
          consecutiveFrameDiffsBackground: lineDiffs,
        },
        grainOnly: {
          frames: grainRun.images.length, linePhasesInRun: grainPhases,
          configuredRefreshHz: proof.settings.grainRate,
          grainSwapIntervalsSeconds: swapIntervals,
          observedRefreshHz: swapIntervals.length ? Number((1 / (swapIntervals.reduce((s, v) => s + v, 0) / swapIntervals.length)).toFixed(4)) : null,
          grainIndicesRendered: [...new Set(grainRun.log.map((e) => e.grainIndex))],
          grainSwapsShown: grainRun.shown.length,
          candidateErrors: await live.call((c) => c.errors.slice()),
          pairsAcrossRefresh: changedPairs.length, pairsWithinRefresh: unchangedPairs.length,
          meanDifferingFractionAcrossRefresh: meanOf(changedPairs), meanDifferingFractionWithinRefresh: meanOf(unchangedPairs),
          consecutiveFrameDiffsBackground: grainPairs,
        },
        note: 'Composited live screen screenshots while the atmosphere blobs move; the per-frame background includes blob drift. Still captures are not used as motion evidence.',
      },
      input: { observations: inputs, observedFailures: failures },
      pauses,
      cleanup: { state: released, logGrewAfterRemoval: cleanup.logGrewAfterRemoval, proofNodes: afterRemoval.proofNodes, rootStyleRestored: afterRemoval.rootStyle === before.rootStyle, tapAfterRemoval: 'second Anchor chip pressed' },
      timing: {
        label: 'Emulated mobile Chromium (Playwright Pixel 5 profile, DPR 1) on a desktop host. Not real-phone proof. No pass/fail threshold.',
        unmaskedWebGl: gpu,
        interaction: 'four 120px wheel scrolls over the Generate content and two Anchor taps',
        candidateOff: { longTasks: timingOff.longTasks, frameIntervalsMs: intervalStats(timingOff.frames) },
        candidateOn: { longTasks: timingOn.longTasks, frameIntervalsMs: intervalStats(timingOn.frames) },
      },
    }
    summary.missingObservations = missing
    summary.status = missing.length ? 'not-proven' : 'all required observations captured'
    write()
    expect(missing, 'every required observation was captured').toEqual([])
  } catch (error) {
    summary.status = 'not-proven'
    summary.failure = String(error instanceof Error ? error.message : error).slice(0, 2_000)
    write()
    throw error
  } finally {
    for (const context of contexts) await context.close().catch(() => undefined)
  }
})
