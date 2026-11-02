/**
 * Effects TASK-005 (REQ-005) — the app's CRT Glass module against the
 * preserved motion host, in a real browser.
 *
 * Self-contained and test-only. The preserved checkpoint is served read-only
 * by route interception from `$CLEAR_EFFECTS_REFERENCE_DIR`, and the settings
 * come from `$CLEAR_EFFECTS_CURRENT_SETTINGS` (SHA-256 checked). The app's
 * module is served by a Vite server this spec starts. Viewport and device-pixel
 * ratio are set per comparison. No shared Playwright configuration is read
 * for them or changed.
 *
 *   1. Still: the live preserved host (`crt-glass-motion/index.html`, with
 *      `study.mjs`, `study.css`, `glass-effect.mjs`, `motion-clock.mjs` and the
 *      vendored PixiJS 8.22.0 / pixi-filters 6.1.5), at its fixed initial phase
 *      0.5 and seed 0.57, against the app's renderer fed the same
 *      `assets/echo-clean.jpg` texture: 390 × 844, resolution 1, at DPR 1 and
 *      DPR 3. The frames must be pixel-identical. Any difference fails, and
 *      the differing regions and images are written for owner review.
 *   2. Motion: frames from the preserved pass and clock (the host's own
 *      modules, initialised as `study.mjs` does) against the app's module at
 *      matched clock states. Line-only and grain-only frame differences,
 *      drift period, grain refresh, Still, feathering and colour protection,
 *      line shape, orientation, curvature, phase direction and grain scale.
 *   3. Live cadence: the running host drifts and refreshes grain, and the
 *      app's scheduler renders at most 30 times a second, schedules nothing
 *      while paused and resumes with no catch-up.
 *
 * The texture-fed specimen is a test harness. It is not a product DOM-capture
 * path: the product module draws only from textures the app owns. Grain frame
 * differences are grain, never evidence about the Echo mask. Emulated mobile
 * Chromium is not phone evidence, and nothing here claims it is.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import type { Browser, BrowserContext, Page } from '@playwright/test'

import { parseEnvFile } from '../../scripts/dev-preflight/env.mjs'
import { expect, test as base } from '../fixtures'
import {
  curvatureLag, diff, diffImage, encodePng, gradients, grainScale, luminance, phaseDirection, subtract,
  type DiffStats, type Frame,
} from './crt-glass-fidelity/pixels'

const OUT = resolve(process.cwd(), 'test-results/crt-glass-fidelity')
const WIDTH = 390
const HEIGHT = 844
const SETTINGS_SHA256 = '3169d4608c8babe17a20670bd59f53e3110c7ce917641786d33c2713943ca033'
const REFERENCE_ORIGIN = 'http://crt-glass-reference.localhost'
const REFERENCE_FILES = [
  'crt-glass-motion/index.html', 'crt-glass-motion/study.mjs', 'crt-glass-motion/study.css',
  'crt-glass-motion/glass-effect.mjs', 'crt-glass-motion/motion-clock.mjs',
  'crt-glass-motion/assets/echo-clean.jpg', 'crt-glass-motion/vendor/pixi.min.js', 'crt-glass-motion/vendor/filters.js',
] as const
/** The host's still state: `initialClock()` and `grainSeed()` of `motion-clock.mjs`. */
const STILL = { phase: 0.5, seed: 0.57 }
const STEP = 1 / 30

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
  throw new Error(`TASK-005 blocker: ${name} is not set (execution prerequisite)`)
}

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

function loadInputs() {
  const root = resolve(envValue('CLEAR_EFFECTS_REFERENCE_DIR'))
  const files = Object.fromEntries(REFERENCE_FILES.map((name) => {
    const path = resolve(root, name)
    if (!existsSync(path)) throw new Error(`TASK-005 blocker: reference file ${name} is missing from CLEAR_EFFECTS_REFERENCE_DIR`)
    const bytes = readFileSync(path)
    return [name, { sha256: sha256(bytes), bytes: bytes.length }]
  }))
  const settingsPath = envValue('CLEAR_EFFECTS_CURRENT_SETTINGS')
  const settingsBytes = readFileSync(settingsPath)
  const settingsHash = sha256(settingsBytes)
  if (settingsHash !== SETTINGS_SHA256) throw new Error(`TASK-005 blocker: current settings SHA-256 is ${settingsHash}, expected ${SETTINGS_SHA256}`)
  const exported = JSON.parse(settingsBytes.toString('utf8')) as { settings: Settings }
  return { root, files, settings: exported.settings, settingsHash }
}

type Inputs = ReturnType<typeof loadInputs>

// ---------------------------------------------------------------------------
// The app's module, from this workspace, through its own Vite server.
// ---------------------------------------------------------------------------

async function waitForOrigin(origin: string, deadline: number) {
  while (Date.now() < deadline) {
    try {
      if ((await fetch(origin)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`TASK-005 blocker: the module origin ${origin} did not start`)
}

const test = base.extend<object, { moduleOrigin: string }>({
  moduleOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      const port = 5790 + workerInfo.parallelIndex
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [resolve(import.meta.dirname, '../../node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'], {
        env: { ...process.env, VITE_SUPABASE_URL: 'https://synthetic-crt-glass.supabase.invalid', VITE_SUPABASE_ANON_KEY: 'synthetic-crt-glass-public-placeholder' },
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

// ---------------------------------------------------------------------------
// Harness pages.
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = { html: 'text/html', mjs: 'text/javascript', js: 'text/javascript', css: 'text/css', jpg: 'image/jpeg', png: 'image/png', json: 'application/json', woff2: 'font/woff2', woff: 'font/woff' }
const mime = (path: string) => MIME[path.split('.').at(-1) ?? ''] ?? 'application/octet-stream'

/** The preserved pass and clock in the vendored PixiJS, initialised exactly as `study.mjs` does. */
const REFERENCE_HARNESS = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:black}</style></head><body>
<script src="/crt-glass-motion/vendor/pixi.min.js"></script><script src="/crt-glass-motion/vendor/filters.js"></script>
<script type="module">
import {createGlassEffect} from '/crt-glass-motion/glass-effect.mjs';
import {initialClock,advanceClock,grainSeed} from '/crt-glass-motion/motion-clock.mjs';
const W=${WIDTH},H=${HEIGHT};
const app=new PIXI.Application();
await app.init({width:W,height:H,resolution:1,antialias:false,autoStart:false,preference:'webgl',background:'#150a12',preserveDrawingBuffer:true});
const texture=await PIXI.Assets.load('/crt-glass-motion/assets/echo-clean.jpg');
const sprite=new PIXI.Sprite(texture);sprite.width=W;sprite.height=H;app.stage.addChild(sprite);
app.canvas.id='frame';document.body.append(app.canvas);
let glass=null;
window.__crt={
 render(values,phase,seed){
  if(!glass){glass=createGlassEffect(PIXI,{texture,width:W,height:H,values});sprite.filterArea=new PIXI.Rectangle(0,0,W,H);sprite.filters=glass.filters}
  glass.update(values,texture);glass.setMotion(phase,seed);app.render();
 },
 clock(dts,settings){let c=initialClock();return dts.map(dt=>{c=advanceClock(c,dt,settings);return [c.phase,c.grainIndex,grainSeed(c)]})},
 info(){const gl=app.renderer.gl;const d=gl.getExtension('WEBGL_debug_renderer_info');return {pixi:PIXI.VERSION,renderer:String(gl.getParameter(d?d.UNMASKED_RENDERER_WEBGL:gl.RENDERER)),textureSize:[texture.width,texture.height],sourcePixels:[texture.source.pixelWidth,texture.source.pixelHeight]}}
};
window.__crtReady=true;
</script></body></html>`

/** The app's module, fed the same texture. */
const CANDIDATE_HARNESS = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:black}</style></head><body><canvas id="frame"></canvas>
<script type="module">
import {createCrtGlassRenderer} from '/src/ui/crt-glass/renderer.ts';
import {advanceClock,createMotionDriver,grainSeed,initialClock} from '/src/ui/crt-glass/motion-clock.ts';
import {CRT_GLASS_PRESET} from '/src/ui/crt-glass/preset.ts';
const W=${WIDTH},H=${HEIGHT};
const bitmap=await createImageBitmap(await (await fetch('/__crt-glass/echo-clean.jpg')).blob());
const canvas=document.getElementById('frame');
const renderer=createCrtGlassRenderer({canvas,source:bitmap,width:W,height:H,values:CRT_GLASS_PRESET,preserveDrawingBuffer:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
window.__crt={
 preset:{...CRT_GLASS_PRESET},
 render(values,phase,seed){renderer.update(values);renderer.render(phase,seed)},
 clock(dts,settings){let c=initialClock();return dts.map(dt=>{c=advanceClock(c,dt,settings);return [c.phase,c.grainIndex,grainSeed(c)]})},
 info(){return {renderer:renderer.glRenderer,sourcePixels:[bitmap.width,bitmap.height]}},
 async drive(settings){
  let requests=0;const realRequest=window.requestAnimationFrame.bind(window);const realCancel=window.cancelAnimationFrame.bind(window);
  const frames={requestAnimationFrame:cb=>{requests+=1;return realRequest(cb)},cancelAnimationFrame:h=>realCancel(h)};
  const renders=[];
  renderer.update(settings);
  const driver=createMotionDriver({settings,frames,render:(phase,seed)=>{renders.push({t:performance.now(),phase,seed});renderer.render(phase,seed)}});
  const start=performance.now();driver.sync(true);await wait(1500);
  const runSeconds=(performance.now()-start)/1000;const ran=renders.length;const runningAfter=driver.running;
  driver.sync(false);const pausedPhase=driver.clock.phase;const pausedRunning=driver.running;
  const requestsAtPause=requests;const rendersAtPause=renders.length;await wait(400);
  const pausedRequests=requests-requestsAtPause;const pausedRenders=renders.length-rendersAtPause;
  driver.sync(true);await wait(120);
  const resumed=renders[rendersAtPause]||null;
  driver.dispose();const disposedRunning=driver.running;const requestsAtDispose=requests;await wait(150);
  return {runSeconds,renders:ran,runningAfter,first:renders[0]||null,last:renders[ran-1]||null,pausedPhase,pausedRunning,pausedRequests,pausedRenders,resumedPhase:resumed?resumed.phase:null,disposedRunning,requestsAfterDispose:requests-requestsAtDispose};
 }
};
window.__crtReady=true;
</script></body></html>`

async function serveReference(page: Page, inputs: Inputs) {
  await page.route(`${REFERENCE_ORIGIN}/**`, async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname)
    if (path === '/__harness.html') return route.fulfill({ status: 200, contentType: 'text/html', body: REFERENCE_HARNESS })
    const file = resolve(inputs.root, `.${path}`)
    if (!file.startsWith(inputs.root + sep) || !existsSync(file)) return route.fulfill({ status: 404, body: '' })
    return route.fulfill({ status: 200, contentType: mime(file), body: readFileSync(file) })
  })
}

async function serveCandidate(page: Page, inputs: Inputs, origin: string) {
  await page.route(`${origin}/__crt-glass/**`, async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/__crt-glass/harness.html') return route.fulfill({ status: 200, contentType: 'text/html', body: CANDIDATE_HARNESS })
    if (path === '/__crt-glass/echo-clean.jpg') {
      return route.fulfill({ status: 200, contentType: 'image/jpeg', body: readFileSync(resolve(inputs.root, 'crt-glass-motion/assets/echo-clean.jpg')) })
    }
    return route.fulfill({ status: 404, body: '' })
  })
}

interface Readback { rgba: string; width: number; height: number; cssScale: number; devicePixelRatio: number }

async function readCanvas(page: Page, selector: string): Promise<Frame & { cssScale: number; devicePixelRatio: number }> {
  const out = await page.evaluate((sel): Readback => {
    const source = document.querySelector(sel) as HTMLCanvasElement | null
    if (!source) throw new Error(`no canvas at ${sel}`)
    const copy = document.createElement('canvas')
    copy.width = source.width
    copy.height = source.height
    const context = copy.getContext('2d', { willReadFrequently: true })!
    context.drawImage(source, 0, 0)
    const data = context.getImageData(0, 0, copy.width, copy.height).data
    let binary = ''
    for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000))
    return { rgba: btoa(binary), width: copy.width, height: copy.height, cssScale: source.getBoundingClientRect().width / source.width, devicePixelRatio: window.devicePixelRatio }
  }, selector)
  return { width: out.width, height: out.height, rgba: Buffer.from(out.rgba, 'base64'), cssScale: out.cssScale, devicePixelRatio: out.devicePixelRatio }
}

interface Harness {
  page: Page
  render: (values: Settings, phase: number, seed: number) => Promise<Frame & { cssScale: number; devicePixelRatio: number }>
  clock: (dts: number[], settings: Settings) => Promise<[number, number, number][]>
}

type CrtWindow = { __crt: { render: (v: Settings, p: number, s: number) => void; clock: (d: number[], s: Settings) => [number, number, number][] } }

async function harness(page: Page): Promise<Harness> {
  await page.waitForFunction(() => (window as unknown as { __crtReady?: boolean }).__crtReady === true, undefined, { timeout: 60_000 })
  return {
    page,
    async render(values, phase, seed) {
      await page.evaluate(({ values, phase, seed }) => (window as unknown as CrtWindow).__crt.render(values, phase, seed), { values, phase, seed })
      return readCanvas(page, '#frame')
    },
    clock: (dts, settings) => page.evaluate(({ dts, settings }) => (window as unknown as CrtWindow).__crt.clock(dts, settings), { dts, settings }),
  }
}

// ---------------------------------------------------------------------------

test('TASK-005 CRT Glass module against the preserved motion host: still, motion and cadence', async ({ browser, moduleOrigin }, testInfo) => {
  test.setTimeout(600_000)
  mkdirSync(OUT, { recursive: true })
  const failures: string[] = []
  const summary: Record<string, unknown> = { task: 'TASK-005', requirement: 'REQ-005', scope: 'Test-only specimen harness; emulated Chromium, not phone evidence.' }
  const contexts: BrowserContext[] = []
  const write = () => writeFileSync(resolve(OUT, 'summary.json'), JSON.stringify(summary, null, 2))
  const check = (label: string, ok: boolean) => { if (!ok) failures.push(label) }
  const savePair = (name: string, a: Frame, b: Frame) => {
    writeFileSync(resolve(OUT, `${name}-reference.png`), encodePng(a))
    writeFileSync(resolve(OUT, `${name}-app.png`), encodePng(b))
    writeFileSync(resolve(OUT, `${name}-diff.png`), encodePng(diffImage(a, b)))
  }

  try {
    const inputs = loadInputs()
    const settings = inputs.settings
    const use = testInfo.project.use
    summary.identity = {
      referenceDirectory: '$CLEAR_EFFECTS_REFERENCE_DIR (read-only)',
      referenceFiles: inputs.files,
      settingsFile: '$CLEAR_EFFECTS_CURRENT_SETTINGS (crt-iab-current-settings.json)',
      settingsSha256: inputs.settingsHash,
      settings,
      still: STILL,
      viewport: { width: WIDTH, height: HEIGHT },
      pixiResolution: 1,
      browser: `${browser.browserType().name()} ${browser.version()}`,
    }

    const newContext = async (b: Browser, deviceScaleFactor: number, reducedMotion: 'reduce' | 'no-preference') => {
      const context = await b.newContext({
        viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor, isMobile: use.isMobile, hasTouch: use.hasTouch, userAgent: use.userAgent, reducedMotion,
      })
      contexts.push(context)
      return context
    }
    const draft = JSON.stringify({ settings, compare: false })

    // ------------------------------------------------------------------ 1
    const stills: Record<string, unknown> = {}
    for (const dpr of [1, 3]) {
      const context = await newContext(browser, dpr, 'reduce')
      const host = await context.newPage()
      await serveReference(host, inputs)
      await host.addInitScript((value) => {
        localStorage.setItem('clear-crt-study-draft-v1', value)
        localStorage.setItem('clear-crt-study-comfort-v1', JSON.stringify({ reduceMotion: false, effectsOff: false }))
      }, draft)
      await host.goto(`${REFERENCE_ORIGIN}/crt-glass-motion/index.html`)
      await host.locator('#surface canvas').waitFor({ state: 'attached', timeout: 60_000 })
      await expect(host.locator('#renderer-status')).toContainText('PixiJS CRTFilter', { timeout: 60_000 })
      const hostState = await host.evaluate(() => {
        const surface = document.querySelector('#surface') as HTMLElement
        return { state: JSON.parse(surface.dataset.state ?? '{}'), motion: JSON.parse(surface.dataset.motion ?? '{}') }
      })
      const hostFrame = await readCanvas(host, '#surface canvas')

      const candidatePage = await context.newPage()
      await serveCandidate(candidatePage, inputs, moduleOrigin)
      await candidatePage.goto(`${moduleOrigin}/__crt-glass/harness.html`)
      const candidate = await harness(candidatePage)
      const appFrame = await candidate.render(settings, STILL.phase, STILL.seed)
      const appInfo = await candidatePage.evaluate(() => (window as unknown as { __crt: { info: () => unknown } }).__crt.info())

      const settingsMatch = Object.keys(settings).filter((key) => !['reduceMotion', 'effectsOff'].includes(key)).every((key) => hostState.state[key] === settings[key])
      check(`DPR ${dpr}: the host loaded the current settings`, settingsMatch)
      check(`DPR ${dpr}: the host is at phase 0.5 and seed 0.57`, hostState.motion.phase === STILL.phase && hostState.motion.grainSeed === STILL.seed && hostState.motion.running === false)
      const stats = diff(hostFrame, appFrame)
      if (!stats.identical) savePair(`still-dpr${dpr}`, hostFrame, appFrame)
      check(`DPR ${dpr}: still frame pixel-identical to the preserved host (${stats.differingPixels} pixels differ; regions in summary.json)`, stats.identical)
      stills[`dpr${dpr}`] = {
        devicePixelRatio: { host: hostFrame.devicePixelRatio, app: appFrame.devicePixelRatio },
        cssRenderScale: { host: hostFrame.cssScale, app: appFrame.cssScale },
        canvasPixels: { host: [hostFrame.width, hostFrame.height], app: [appFrame.width, appFrame.height] },
        hostMotion: hostState.motion,
        app: appInfo,
        diff: stats,
      }
      summary.still = stills
      write()
      await context.close()
    }

    // ------------------------------------------------------------------ 2
    const context = await newContext(browser, 1, 'no-preference')
    const refPage = await context.newPage()
    await serveReference(refPage, inputs)
    await refPage.goto(`${REFERENCE_ORIGIN}/__harness.html`)
    const reference = await harness(refPage)
    const candidatePage = await context.newPage()
    await serveCandidate(candidatePage, inputs, moduleOrigin)
    await candidatePage.goto(`${moduleOrigin}/__crt-glass/harness.html`)
    const candidate = await harness(candidatePage)
    summary.motionRenderers = {
      reference: await refPage.evaluate(() => (window as unknown as { __crt: { info: () => unknown } }).__crt.info()),
      app: await candidatePage.evaluate(() => (window as unknown as { __crt: { info: () => unknown } }).__crt.info()),
    }

    // The clocks, step for step, including uneven and clamped steps.
    const dts = [...Array.from({ length: 150 }, () => STEP), 0.1, 0.0123, 0.05, ...Array.from({ length: 30 }, () => STEP)]
    const still = { ...settings, animate: false }
    const clocks = {
      reference: await reference.clock(dts, settings),
      app: await candidate.clock(dts, settings),
      referenceStill: await reference.clock(dts, still),
      appStill: await candidate.clock(dts, still),
    }
    check('the app clock equals motion-clock.mjs at every step', JSON.stringify(clocks.reference) === JSON.stringify(clocks.app))
    check('the app clock equals motion-clock.mjs at every step under Still', JSON.stringify(clocks.referenceStill) === JSON.stringify(clocks.appStill))
    const at = (steps: number, s: Settings = settings) => reference.clock(Array.from({ length: steps }, () => STEP), s).then((list) => list.at(-1)!)

    const pairs: Record<string, DiffStats> = {}
    const frames = new Map<string, { reference: Frame; app: Frame }>()
    const both = async (name: string, values: Settings, phase: number, seed: number) => {
      const pair = { reference: await reference.render(values, phase, seed), app: await candidate.render(values, phase, seed) }
      const stats = diff(pair.reference, pair.app)
      pairs[name] = stats
      if (!stats.identical) savePair(`motion-${name}`, pair.reference, pair.app)
      check(`motion frame ${name}: app pixel-identical to the preserved pass (${stats.differingPixels} pixels differ)`, stats.identical)
      frames.set(name, pair)
      return pair
    }

    // Drift at the configured cycle, grain seed fixed (grainIndex 0 below 2 s).
    const t5 = await at(5)
    const t9 = await at(9)
    const t18 = await at(18)
    const t57 = await at(57)
    const t60 = await at(60)
    const t120 = await at(120)
    const f0 = await both('t0', settings, STILL.phase, STILL.seed)
    const f5 = await both('t5of30', settings, t5[0], t5[2])
    const f9 = await both('t9of30', settings, t9[0], t9[2])
    const f18 = await both('t18of30', settings, t18[0], t18[2])
    // Grain refresh at the configured rate, line phase fixed.
    const g1 = await both('grain-index-1', settings, STILL.phase, t60[2])
    // Still: lines frozen, enabled grain still refreshing.
    const s60 = await at(60, still)
    const stillFrame = await both('still-t60of30', still, s60[0], s60[2])
    // Feathering: with grain on, and with grain amount 0.
    const feather = await both('feathering-0.80', { ...settings, grainSoftness: 0.8 }, STILL.phase, STILL.seed)
    const noGrain = { ...settings, noise: 0 }
    const noGrainSoft = await both('no-grain-feathering-0.40', noGrain, STILL.phase, STILL.seed)
    const noGrainSofter = await both('no-grain-feathering-0.80', { ...noGrain, grainSoftness: 0.8 }, STILL.phase, STILL.seed)
    // Phase direction: the line wave alone, at phase φ and φ + 0.3.
    const opposite = await both('phase-0.5+pi', settings, STILL.phase + Math.PI, STILL.seed)
    const later = await both('phase-0.8', settings, STILL.phase + 0.3, STILL.seed)
    const laterOpposite = await both('phase-0.8+pi', settings, STILL.phase + 0.3 + Math.PI, STILL.seed)

    // Protected pixels: the source's brightest channel at or above 0.65.
    const source = await reference.render({ ...settings, edgeBlur: 0, vignetting: 0, noise: 0, lineContrast: 0, colorProtect: false }, STILL.phase, STILL.seed)
    const protectedPixel = (i: number) => Math.max(source.rgba[i * 4]!, source.rgba[i * 4 + 1]!, source.rgba[i * 4 + 2]!) >= 0.65 * 255

    const motion: Record<string, unknown> = {}
    for (const side of ['reference', 'app'] as const) {
      const lineOnly = diff(f0[side], f5[side])
      const lineHalf = diff(f0[side], f9[side])
      const lineCycle = diff(f0[side], f18[side])
      const grainOnly = diff(f0[side], g1[side])
      const stillVsStart = diff(f0[side], stillFrame[side])
      const stillVsGrain = diff(g1[side], stillFrame[side])
      const featherOn = diff(f0[side], feather[side])
      const featherOff = diff(noGrainSoft[side], noGrainSofter[side])
      const lineProtected = diff(f0[side], f5[side], protectedPixel)
      const grainProtected = diff(f0[side], g1[side], protectedPixel)
      const L = (f: Frame) => luminance(f)
      const lineField = subtract(L(f5[side]), L(f0[side]))
      const grainField = subtract(L(g1[side]), L(f0[side]))
      const wave = subtract(L(f0[side]), L(opposite[side]))
      const waveLater = subtract(L(later[side]), L(laterOpposite[side]))
      motion[side] = {
        lineOnlyPixels: lineOnly.differingPixels,
        lineQuarterCyclePixels: lineHalf.differingPixels,
        lineFullCyclePixels: lineCycle.differingPixels,
        grainOnlyPixels: grainOnly.differingPixels,
        stillVsStartPixels: stillVsStart.differingPixels,
        stillVsGrainOnlyFramePixels: stillVsGrain.differingPixels,
        featheringWithGrainPixels: featherOn.differingPixels,
        featheringWithoutGrainPixels: featherOff.differingPixels,
        colorProtectedLineOnlyPixels: lineProtected.differingPixels,
        colorProtectedGrainOnlyPixels: grainProtected.differingPixels,
        shape: {
          lineGradients: gradients(lineField, WIDTH, HEIGHT),
          curvatureLagAtEdge: curvatureLag(wave, WIDTH, HEIGHT, 8),
          phaseDirection: phaseDirection(wave, waveLater, WIDTH, HEIGHT),
          grainScale: grainScale(grainField, WIDTH, HEIGHT),
        },
      }
      const m = motion[side] as Record<string, number> & { shape: { lineGradients: { alongX: number; alongY: number } } }
      check(`${side}: lines drift (line-only frames differ)`, m.lineOnlyPixels > 0 && m.lineQuarterCyclePixels > 0)
      check(`${side}: the drift repeats at the 0.60 s cycle`, m.lineFullCyclePixels * 100 <= m.lineQuarterCyclePixels)
      check(`${side}: grain refreshes independently (grain-only frames differ)`, m.grainOnlyPixels > 0)
      check(`${side}: Still freezes lines but not enabled grain`, m.stillVsStartPixels > 0 && m.stillVsGrainOnlyFramePixels === 0)
      check(`${side}: feathering changes output with grain on`, m.featheringWithGrainPixels > 0)
      check(`${side}: feathering changes nothing with grain amount 0`, m.featheringWithoutGrainPixels === 0)
      check(`${side}: colour protection keeps line-only differences`, m.lineOnlyPixels > 0 && m.colorProtectedLineOnlyPixels > 0)
      check(`${side}: colour protection keeps grain-only differences`, m.grainOnlyPixels > 0 && m.colorProtectedGrainOnlyPixels > 0)
      check(`${side}: lines are horizontal`, m.shape.lineGradients.alongY > 4 * m.shape.lineGradients.alongX)
    }
    const shapes = { reference: (motion.reference as { shape: unknown }).shape, app: (motion.app as { shape: unknown }).shape }
    check('line shape, orientation, curvature, phase direction and grain scale match the preserved pass', JSON.stringify(shapes.reference) === JSON.stringify(shapes.app))
    check('grain refreshes at 0.50 Hz: index 0 at 1.9 s, 1 at 2.0 s, 2 at 4.0 s', t57[1] === 0 && t60[1] === 1 && t120[1] === 2)
    check('Still keeps phase 0.5 while grain advances', s60[0] === STILL.phase && s60[1] === 1)
    summary.motion = {
      note: 'Grain-only differences are grain refresh; they are never used as evidence about the Echo mask.',
      clockStates: { t5of30: t5, t9of30: t9, t18of30: t18, t57of30: t57, t60of30: t60, t120of30: t120, stillT60of30: s60 },
      appVsReference: pairs,
      measures: motion,
    }
    write()

    // ------------------------------------------------------------------ 3
    const live = await newContext(browser, 1, 'no-preference')
    const host = await live.newPage()
    await serveReference(host, inputs)
    await host.addInitScript((value) => {
      localStorage.setItem('clear-crt-study-draft-v1', value)
      localStorage.setItem('clear-crt-study-comfort-v1', JSON.stringify({ reduceMotion: false, effectsOff: false }))
    }, draft)
    await host.goto(`${REFERENCE_ORIGIN}/crt-glass-motion/index.html`)
    await host.locator('#surface canvas').waitFor({ state: 'attached', timeout: 60_000 })
    const hostA = await readCanvas(host, '#surface canvas')
    await host.waitForTimeout(400)
    const hostB = await readCanvas(host, '#surface canvas')
    await host.waitForFunction(() => {
      const motion = JSON.parse((document.querySelector('#surface') as HTMLElement).dataset.motion ?? '{}')
      return motion.grainIndex >= 1
    }, undefined, { timeout: 30_000 })
    const hostMotion = await host.evaluate(() => JSON.parse((document.querySelector('#surface') as HTMLElement).dataset.motion ?? '{}'))
    const hostLive = diff(hostA, hostB)
    check('the live host drifts', hostLive.differingPixels > 0)
    check('the live host refreshes grain while running', hostMotion.running === true && hostMotion.grainIndex >= 1)

    const driven = await candidatePage.evaluate((s) => (window as unknown as { __crt: { drive: (s: Settings) => Promise<Record<string, number | boolean | null | { t: number; phase: number }>> } }).__crt.drive(s), settings)
    const runSeconds = driven.runSeconds as number
    check('the app scheduler renders at most 30 times a second', (driven.renders as number) <= Math.ceil(runSeconds * 30) + 1)
    check('the app scheduler renders while motion is allowed', (driven.renders as number) > 1 && driven.runningAfter === true)
    check('the app phase drifts', (driven.first as { phase: number }).phase !== (driven.last as { phase: number }).phase)
    check('the app schedules nothing while paused', driven.pausedRunning === false && driven.pausedRequests === 0 && driven.pausedRenders === 0)
    check('the app resumes with no catch-up jump', driven.resumedPhase === driven.pausedPhase)
    check('the app schedules nothing after dispose', driven.disposedRunning === false && driven.requestsAfterDispose === 0)
    summary.live = { host: { framesDiffer: hostLive.differingPixels, motion: hostMotion }, app: driven }
  } catch (error) {
    failures.push(`error: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    summary.failures = failures
    summary.status = failures.length === 0 ? 'matched' : 'differs — see failures and regions for owner review'
    write()
    await testInfo.attach('crt-glass-fidelity-summary.json', { path: resolve(OUT, 'summary.json'), contentType: 'application/json' })
    for (const context of contexts) await context.close().catch(() => undefined)
  }
  expect(failures).toEqual([])
})
