/**
 * Effects TASK-004 (REQ-004) — Phosphor Echo applied to the actual app, in a real browser.
 *
 * The four outer owners on `/generate` — the Screen heading, the framed back
 * action, the workout-selection card and the primary CTA — are captured with
 * Visual effects on and off at the same viewport, render scale, device-pixel
 * ratio, skin, fonts, scroll and UI/focus state, with motion reduced so the
 * atmosphere is still (no CRT field is mounted by this build; the ground is
 * held identical). Every claim is read from those pixel pairs:
 *
 *   - left and bottom of each owner change (a rear image exists), with a
 *     translucent alpha no higher than the shared preset allows (no solid
 *     extrusion) and a colour that is the owner's own painted role colour;
 *   - the whole interior of each frame — card text, labels, inputs, chips,
 *     the back arrow and the CTA label — is pixel-identical (no rear top or
 *     right border through a transparent card, no independent nested echo, a
 *     sharp foreground);
 *   - above and right of each owner nothing changes (no added or doubled glow:
 *     the foundation bleed and glow are left exactly as shipped).
 *
 * Each skin's pair is written to the test output with a record of the
 * preserved round-3 host paths, the preferred-preset identity, viewport,
 * device-pixel ratio, skin and state, beside a capture of the round-3 host at
 * the same viewport and ratio. They are for the owner's comparison; nothing
 * here claims final visual approval, and the historical rendered images
 * (echo-on.jpg / echo-off.jpg / phosphor-echo-round-3.jpg, earlier preset)
 * are diagnostic references only, never compared as golden images.
 *
 * Then the live checks: moving atmosphere, scrolling, navigation, a dialog, a
 * loading state, and Visual effects off, reduced motion and a hidden tab.
 *
 * Data is synthetic and intercepted on this spec's own Vite origin, started
 * from this workspace: no writes, no model calls, no external request. The
 * reference checkpoint is served read-only by route interception. No shared
 * Playwright configuration is changed.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'

import type { Page, Route, TestInfo } from '@playwright/test'

import { parseEnvFile } from '../../scripts/dev-preflight/env.mjs'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import {
  PHOSPHOR_ECHO_PRESET,
  PHOSPHOR_ECHO_PRESET_PROVENANCE,
} from '../../src/ui/phosphor-echo-preset'
import { expect, test as base } from '../fixtures'

// ---------------------------------------------------------------------------
// The preserved reference, read-only.
// ---------------------------------------------------------------------------

const REFERENCE_ENV = 'CLEAR_EFFECTS_REFERENCE_DIR'
const REFERENCE_PREFIX = '/__echo-reference/'
const REFERENCE_HOST = ['round-3/screen.html', 'round-3/screen.css', 'round-3/screen.mjs'] as const
const REFERENCE_PRESET = 'round-3/preferred-preset.json'
const REFERENCE_FILES = [...REFERENCE_HOST, REFERENCE_PRESET, 'round-3/phosphor-echo.mjs'] as const
/** Earlier-preset masking references: listed, never compared. */
const DIAGNOSTIC_ONLY = ['echo-on.jpg', 'echo-off.jpg', 'phosphor-echo-round-3.jpg'] as const
const REFERENCE_ENV_FILES = ['.env.runner.local', '.env.audit.local', '.env.local'] as const

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

function referenceRoot(): string {
  let dir = process.env[REFERENCE_ENV]?.trim()
  for (const file of REFERENCE_ENV_FILES) {
    if (dir) break
    const path = resolve(process.cwd(), file)
    if (existsSync(path)) dir = parseEnvFile(readFileSync(path, 'utf8'))[REFERENCE_ENV]?.trim()
  }
  if (!dir) throw new Error(`${REFERENCE_ENV} must name the preserved effects checkpoint (PRE-001)`)
  const root = resolve(dir)
  for (const file of REFERENCE_FILES) {
    if (!existsSync(resolve(root, file))) throw new Error(`reference checkpoint is missing ${file}`)
  }
  return root
}

function presetIdentity(root: string) {
  const bytes = readFileSync(resolve(root, REFERENCE_PRESET))
  return {
    file: REFERENCE_PRESET,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    provenance: PHOSPHOR_ECHO_PRESET_PROVENANCE,
    values: PHOSPHOR_ECHO_PRESET,
  }
}

async function serveReference(page: Page, root: string) {
  await page.route(`**${REFERENCE_PREFIX}**`, async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname.slice(REFERENCE_PREFIX.length))
    const file = resolve(root, path)
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
      await route.fulfill({ status: 404, body: '' })
      return
    }
    await route.fulfill({ status: 200, body: readFileSync(file), contentType: MIME[extname(file)] ?? 'application/octet-stream' })
  })
}

// ---------------------------------------------------------------------------
// This workspace's own app origin, with synthetic data.
// ---------------------------------------------------------------------------

const OWNER = '00000000-0000-4000-8000-000000000041'
const HOME_ID = '00000000-0000-4000-8000-000000000042'
const GYM_ID = '00000000-0000-4000-8000-000000000043'
const AUTH_KEY = 'clear.auth.session'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const SKINS = ['clear', 'signal', 'vapour', 'mono'] as const
type Skin = (typeof SKINS)[number]

async function waitForOrigin(origin: string, deadline: number) {
  while (Date.now() < deadline) {
    try {
      if ((await fetch(origin)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Echo fidelity origin ${origin} did not start`)
}

const test = base.extend<object, { echoOrigin: string }>({
  echoOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      const port = 5660 + workerInfo.parallelIndex
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [
        resolve(import.meta.dirname, '../../node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort',
      ], {
        env: {
          ...process.env,
          VITE_SUPABASE_URL: 'https://synthetic-echo-fidelity.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-echo-fidelity-public-placeholder',
        },
        stdio: 'ignore',
      })
      const closed = new Promise<void>((settle) => {
        server.once('exit', () => settle())
        server.once('error', () => settle())
      })
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
  baseURL: async ({ echoOrigin }, use) => use(echoOrigin),
})

interface AppOptions {
  skin: Skin
  effects: 'on' | 'off'
  /**
   * Hold a generation request unanswered, so the Loading host is the screen.
   * It is intercepted here: nothing reaches a function or a model.
   */
  holdGeneration?: boolean
}

async function syntheticApp(page: Page, origin: string, { skin, effects, holdGeneration }: AppOptions) {
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
      if (holdGeneration && request.method() === 'POST') {
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
      // Everything else reads empty: no history, so the form asks for the Anchor.
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) return reply(name === 'resume_session' ? null : [])
    writes.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic write.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ authKey, owner, skin, effects }) => {
    if (sessionStorage.getItem('echo-fidelity-seeded')) return
    sessionStorage.setItem('echo-fidelity-seeded', '1')
    localStorage.setItem(authKey, JSON.stringify({
      accessToken: 'synthetic-echo-session', refreshToken: 'synthetic-echo-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-echo@example.invalid' },
    }))
    localStorage.setItem('clear.skin', skin)
    localStorage.setItem('clear.visual-effects', effects)
  }, { authKey: AUTH_KEY, owner: OWNER, skin, effects })

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
// The four owners, as the DOM places them.
// ---------------------------------------------------------------------------

interface Rect { x: number; y: number; width: number; height: number }
interface Owner { name: string; rect: Rect; cut: number; ink: string; rearInk: string | null; rears: number }

/** Every owner's footprint, cut, painted role colour and its rear source's colour. */
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
      const rear = wrapper?.querySelector(':scope > .clr-echo__rear') ?? null
      return {
        rect: rect(outline),
        cut: Number.parseFloat(getComputedStyle(chamfer).getPropertyValue(`--chamfer-${size}`)),
        ink: getComputedStyle(chamfer, '::after').backgroundColor,
        rearInk: rear ? getComputedStyle(rear).color : null,
        rears: wrapper?.querySelectorAll('.clr-echo__source').length ?? 0,
      }
    }
    const heading = document.querySelector('h1 .clr-echo-text__foreground') ?? document.querySelector('h1')!
    const rearText = document.querySelector('h1 .clr-echo-text__rear')
    const back = document.querySelector('button[aria-label="Home"]')!
    const card = document.querySelector('main .clr-card__body')!
    const cta = [...document.querySelectorAll('button')].find((b) => /generate workout/i.test(b.textContent ?? ''))!
    return [
      {
        name: 'heading', rect: rect(heading), cut: 0, ink: getComputedStyle(heading).color,
        rearInk: rearText ? getComputedStyle(rearText).color : null,
        rears: document.querySelectorAll('h1 .clr-echo__source').length,
      },
      { name: 'back', ...frameOf(back) },
      { name: 'card', ...frameOf(card) },
      { name: 'cta', ...frameOf(cta) },
    ]
  })
}

// ---------------------------------------------------------------------------
// Pixels: decoded by the browser's canvas, compared here.
// ---------------------------------------------------------------------------

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
  const viewport = page.viewportSize()!
  // Never resized: exactly the CSS viewport times the device-pixel ratio.
  expect({ width: decoded.width, height: decoded.height }).toEqual({
    width: Math.round(viewport.width * dpr), height: Math.round(viewport.height * dpr),
  })
  return { png, image: { width: decoded.width, height: decoded.height, data: Buffer.from(decoded.data, 'base64'), dpr } }
}

type Rgb = [number, number, number]

function parseRgb(css: string): Rgb {
  const parts = css.match(/[\d.]+/g)?.map(Number) ?? []
  if (css.startsWith('color(srgb')) return [parts[0]! * 255, parts[1]! * 255, parts[2]! * 255]
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

/** Visit every device pixel of a CSS-px region that `keep` admits. */
function eachPixel(
  image: Image,
  region: Rect,
  visit: (index: number) => void,
  keep: (x: number, y: number) => boolean = () => true,
) {
  const { dpr } = image
  const x0 = Math.max(0, Math.ceil(region.x * dpr))
  const y0 = Math.max(0, Math.ceil(region.y * dpr))
  const x1 = Math.min(image.width, Math.floor((region.x + region.width) * dpr))
  const y1 = Math.min(image.height, Math.floor((region.y + region.height) * dpr))
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) if (keep(x / dpr, y / dpr)) visit((y * image.width + x) * 4)
  }
}

/** Largest channel difference over a region, and how many pixels differ at all. */
function regionDiff(on: Image, off: Image, region: Rect, keep?: (x: number, y: number) => boolean) {
  let max = 0
  let changed = 0
  let pixels = 0
  eachPixel(on, region, (i) => {
    pixels += 1
    const d = Math.max(Math.abs(on.data[i]! - off.data[i]!), Math.abs(on.data[i + 1]! - off.data[i + 1]!), Math.abs(on.data[i + 2]! - off.data[i + 2]!))
    if (d > 0) changed += 1
    if (d > max) max = d
  }, keep)
  return { max, changed, pixels }
}

/**
 * How well the change in a region is "this ink, at some alpha, over what was
 * there": per changed pixel the best alpha along (ink − off), and the residual
 * left after it. A rear image in the owner's own colour leaves a small residual
 * at a translucent alpha; another colour leaves a large one.
 */
function inkFit(on: Image, off: Image, region: Rect, ink: Rgb) {
  const alphas: number[] = []
  const residuals: number[] = []
  eachPixel(on, region, (i) => {
    const o: Rgb = [off.data[i]!, off.data[i + 1]!, off.data[i + 2]!]
    const d: Rgb = [on.data[i]! - o[0], on.data[i + 1]! - o[1], on.data[i + 2]! - o[2]]
    if (Math.hypot(...d) < 8) return
    const toward: Rgb = [ink[0] - o[0], ink[1] - o[1], ink[2] - o[2]]
    const length = toward[0] ** 2 + toward[1] ** 2 + toward[2] ** 2
    if (length < 400) return
    const alpha = (d[0] * toward[0] + d[1] * toward[1] + d[2] * toward[2]) / length
    alphas.push(alpha)
    residuals.push(Math.hypot(d[0] - alpha * toward[0], d[1] - alpha * toward[1], d[2] - alpha * toward[2]))
  })
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? NaN
  return { samples: alphas.length, maxAlpha: Math.max(...alphas), medianAlpha: median(alphas), residual: median(residuals) }
}

/** Inside a chamfered footprint, `margin` CSS px clear of every edge and of the cut. */
function insideFootprint(rect: Rect, cut: number, margin: number) {
  return (x: number, y: number) => {
    const right = rect.x + rect.width - x
    const bottom = rect.y + rect.height - y
    return x - rect.x >= margin && y - rect.y >= margin && right >= margin && bottom >= margin &&
      right + bottom >= cut + margin * 2
  }
}

/** The bands the echo may and may not touch, in CSS px around an owner. */
function bands(rect: Rect) {
  const { x, y, width, height } = rect
  return {
    left: { x: x - 12, y: y + 8, width: 10, height: Math.max(1, height - 8) },
    bottom: { x: x + 4, y: y + height + 2, width: Math.max(1, width - 16), height: 8 },
    // The rear copy sits 5.64 down and 4.7 left; its blur reaches about three
    // deviations. Past that, above and to the right, nothing may change.
    above: { x: x + 12, y: y - 16, width: Math.max(1, width - 12), height: 8 },
    right: { x: x + width + 8, y: y - 4, width: 8, height: Math.max(1, height - 8) },
  }
}

function hue([r, g, b]: Rgb): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return NaN
  const h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4
  return (h * 60 + 360) % 360
}

function keep(testInfo: TestInfo, name: string, png: Buffer) {
  const path = testInfo.outputPath(name)
  writeFileSync(path, png)
  return testInfo.attach(name, { path, contentType: 'image/png' })
}

function keepJson(testInfo: TestInfo, name: string, body: unknown) {
  writeFileSync(testInfo.outputPath(name), JSON.stringify(body, null, 2))
  return testInfo.attach(name, { body: JSON.stringify(body, null, 2), contentType: 'application/json' })
}

// ---------------------------------------------------------------------------
// 1. Echo-only matched pairs, every skin.
// ---------------------------------------------------------------------------

test.describe('Phosphor Echo on the actual /generate owners — Echo-only pairs', () => {
  for (const skin of SKINS) {
    test(`${skin}: one translucent rear image left and down per owner, interiors sharp, role colour`, async ({ browser, echoOrigin }, testInfo) => {
      const root = referenceRoot()
      const use = testInfo.project.use
      const shots: Record<'on' | 'off', { png: Buffer; image: Image; owners: Owner[] }> = {} as never

      for (const effects of ['off', 'on'] as const) {
        // A fresh context per side: the same viewport, ratio, fonts and motion.
        const context = await browser.newContext({
          viewport: use.viewport, deviceScaleFactor: use.deviceScaleFactor, isMobile: use.isMobile,
          hasTouch: use.hasTouch, userAgent: use.userAgent, baseURL: echoOrigin, reducedMotion: 'reduce',
        })
        const page = await context.newPage()
        const app = await syntheticApp(page, echoOrigin, { skin, effects })
        await openGenerate(page)
        // The same UI state on both sides: the first Anchor chosen (so the CTA
        // is in its primary state), nothing focused, the region at its top.
        await page.getByRole('group', { name: 'Anchor' }).getByRole('button').first().click()
        await expect(page.getByRole('button', { name: /generate workout/i })).toBeEnabled()
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
        await settle(page)
        // The same settled state on both sides: every state transition the
        // chosen Anchor started has ended. The rear follows within its
        // settling window; a stale colour would fail the ink check below.
        await page.waitForFunction(
          () => document.getAnimations().every((animation) => !(animation instanceof CSSTransition)),
          undefined,
          { timeout: 5_000 },
        )
        await settle(page)
        const owners = await readOwners(page)
        shots[effects] = { ...(await capture(page)), owners }
        app.assertReadOnly()
        await context.close()
      }

      const { on, off } = shots
      // Same layout on both sides: the effect moved nothing.
      for (const [index, owner] of on.owners.entries()) {
        expect(owner.rect, `${owner.name} moved with the effect`).toEqual(off.owners[index]!.rect)
      }

      const findings: Record<string, unknown> = {}
      for (const owner of on.owners) {
        const b = bands(owner.rect)
        const ink = parseRgb(owner.ink)
        // Exactly one rear source per owner, painted in the owner's own colour.
        expect(owner.rears, `${owner.name} rear sources`).toBe(1)
        expect(owner.rearInk, `${owner.name} has no rear`).not.toBeNull()
        expect(parseRgb(owner.rearInk!).map(Math.round), `${owner.name} rear ink ${owner.rearInk} vs ${owner.ink}`).toEqual(ink.map(Math.round))
        expect(off.owners.find((o) => o.name === owner.name)!.rears, `${owner.name} off`).toBe(0)

        const left = regionDiff(on.image, off.image, b.left)
        const bottom = regionDiff(on.image, off.image, b.bottom)
        const above = regionDiff(on.image, off.image, b.above)
        const right = regionDiff(on.image, off.image, b.right)
        const fit = inkFit(on.image, off.image, { ...b.left, height: b.left.height + 10 }, ink)
        findings[owner.name] = { ink: owner.ink, left, bottom, above, right, fit }

        // A rear image exists, to the left and below. A text box ends below
        // its glyphs, so the heading's lower echo lies inside its own box.
        expect(left.changed, `${owner.name}: nothing changed to the left`).toBeGreaterThan(0)
        const lower = owner.name === 'heading' ? regionDiff(on.image, off.image, owner.rect) : bottom
        expect(lower.changed, `${owner.name}: nothing changed below`).toBeGreaterThan(0)
        // Nothing added above or to the right: no leak, no second glow.
        expect(above.max, `${owner.name}: changed above`).toBeLessThanOrEqual(2)
        expect(right.max, `${owner.name}: changed to the right`).toBeLessThanOrEqual(2)
        // Translucent, in the owner's own colour: never a solid wall.
        expect(fit.samples, `${owner.name}: no echo pixels to fit`).toBeGreaterThan(10)
        expect(fit.maxAlpha, `${owner.name}: echo is solid`).toBeLessThanOrEqual(PHOSPHOR_ECHO_PRESET.opacity + 0.06)
        expect(fit.residual, `${owner.name}: echo is not its own ink`).toBeLessThan(10)

        // Frames: the whole interior identical — top and right of a transparent
        // card, its text, labels, fields and chips, the arrow and the label.
        if (owner.name !== 'heading') {
          const interior = regionDiff(on.image, off.image, owner.rect, insideFootprint(owner.rect, owner.cut, 2))
          findings[`${owner.name}-interior`] = interior
          expect(interior.max, `${owner.name}: interior changed`).toBeLessThanOrEqual(2)
        }
      }

      // Each rear follows its own source colour, not one shared glow colour.
      const byName = Object.fromEntries(on.owners.map((owner) => [owner.name, owner]))
      if (skin === 'signal') {
        for (const name of ['heading', 'back', 'cta']) {
          const h = hue(parseRgb(byName[name]!.ink))
          expect(h >= 290 || h <= 20, `${name} ink ${byName[name]!.ink} is not pink (hue ${h})`).toBe(true)
        }
        const cardHue = hue(parseRgb(byName.card!.ink))
        expect(cardHue >= 55 && cardHue <= 110, `card ink ${byName.card!.ink} is not yellow-green (hue ${cardHue})`).toBe(true)
        // And the card's echo fits its own ink better than the heading's.
        const card = bands(byName.card!.rect).left
        expect(inkFit(on.image, off.image, card, parseRgb(byName.card!.ink)).residual)
          .toBeLessThan(inkFit(on.image, off.image, card, parseRgb(byName.heading!.ink)).residual)
      }

      // The round-3 host at the same viewport and ratio, for the owner's eye.
      const hostContext = await browser.newContext({
        viewport: use.viewport, deviceScaleFactor: use.deviceScaleFactor, isMobile: use.isMobile,
        hasTouch: use.hasTouch, userAgent: use.userAgent, baseURL: echoOrigin, reducedMotion: 'reduce',
      })
      const host = await hostContext.newPage()
      await serveReference(host, root)
      await host.goto(`${REFERENCE_PREFIX}${REFERENCE_HOST[0]}`)
      await settle(host)
      const hostPng = await host.screenshot({ animations: 'disabled', caret: 'hide', scale: 'device' })
      await hostContext.close()

      const state = 'populated, first Anchor chosen, CTA enabled (primary), nothing focused, scrolled to top, motion reduced'
      await keep(testInfo, `echo-applied-${skin}-off.png`, off.png)
      await keep(testInfo, `echo-applied-${skin}-on.png`, on.png)
      await keep(testInfo, `echo-reference-round-3-host-${skin}-run.png`, hostPng)
      await keepJson(testInfo, `echo-applied-${skin}.json`, {
        purpose: 'Matched Echo-only capture pair for the owner’s visual comparison. Not a visual approval.',
        approval: 'pending owner review',
        route: '/generate',
        pair: [`echo-applied-${skin}-off.png`, `echo-applied-${skin}-on.png`],
        referenceHost: { paths: REFERENCE_HOST, capture: `echo-reference-round-3-host-${skin}-run.png`, skinOfHost: 'signal' },
        preset: presetIdentity(root),
        diagnosticOnly: { files: DIAGNOSTIC_ONLY, note: 'earlier preset 0.34 / 1.4 / −5.5 / +6.6; masking references, not golden images' },
        viewport: use.viewport,
        devicePixelRatio: on.image.dpr,
        renderScale: 'device',
        skin,
        state,
        crt: 'no CRT field is mounted by this build; atmosphere held still by reduced motion on both sides',
        owners: on.owners,
        findings,
      })
    })
  }
})

// ---------------------------------------------------------------------------
// 2. Narrow phones and the affected states.
// ---------------------------------------------------------------------------

test.describe('Phosphor Echo on /generate — narrow widths and states', () => {
  test('320 and 375 CSS px: no horizontal overflow; focus, chosen, disabled and error stay readable', async ({ page, echoOrigin }, testInfo) => {
    const app = await syntheticApp(page, echoOrigin, { skin: 'signal', effects: 'on' })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 700 })
      await openGenerate(page)

      const overflow = await page.evaluate(() => ({
        body: document.body.scrollWidth - document.body.clientWidth,
        root: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }))
      expect(overflow, `${width}px horizontal overflow`).toEqual({ body: 0, root: 0 })

      const cta = page.getByRole('button', { name: /generate workout/i })
      const card = page.locator('main .clr-card')
      const rearOf = (owner: ReturnType<typeof page.locator>) =>
        owner.locator('xpath=ancestor::*[@data-echo="frame"][1]/*[contains(@class, "clr-echo__rear")]')

      // Disabled: the CTA keeps its echo and its disabled reading.
      await expect(cta).toBeDisabled()
      await expect(rearOf(cta)).toHaveCount(1)
      await keep(testInfo, `echo-state-${width}-disabled.png`, (await capture(page)).png)

      // Focus: keyboard focus lands on the back action, ring visible, echo intact.
      const back = page.getByRole('button', { name: 'Home' })
      await back.focus()
      await expect(back).toBeFocused()
      expect(await back.evaluate((el) => el.matches(':focus-visible'))).toBe(true)
      await expect(rearOf(back)).toHaveCount(1)
      await keep(testInfo, `echo-state-${width}-focus-back.png`, (await capture(page)).png)

      // Chosen: an Anchor chip is selected, carries no echo, and the CTA enables.
      const chip = page.getByRole('group', { name: 'Anchor' }).getByRole('button').first()
      await chip.click()
      await expect(chip).toHaveAttribute('aria-pressed', 'true')
      await expect(chip.locator('xpath=ancestor::*[@data-echo][1]//*[contains(@class,"clr-echo__rear")]')).toHaveCount(1)
      expect(await chip.evaluate((el) => el.closest('[data-echo]')?.querySelector('.clr-card') !== null)).toBe(true)
      await expect(cta).toBeEnabled()
      await keep(testInfo, `echo-state-${width}-chosen.png`, (await capture(page)).png)

      // Error: a blank time refuses at submit; the card takes urgency and its echo follows.
      const before = await card.evaluate((el) => getComputedStyle(el.closest('[data-echo]')!.querySelector('.clr-echo__rear')!).color)
      await page.getByLabel('Time available', { exact: true }).fill('')
      await cta.click()
      await expect(page.getByRole('alert').first()).toBeVisible()
      await expect(async () => {
        const after = await card.evaluate((el) => ({
          rear: getComputedStyle(el.closest('[data-echo]')!.querySelector('.clr-echo__rear')!).color,
          frame: getComputedStyle(el.querySelector('.clr-card__body')!, '::after').backgroundColor,
        }))
        expect(after.rear).not.toBe(before)
        expect(parseRgb(after.rear).map(Math.round)).toEqual(parseRgb(after.frame).map(Math.round))
      }).toPass({ timeout: 3_000 })
      await keep(testInfo, `echo-state-${width}-error.png`, (await capture(page)).png)

      const after = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(after, `${width}px overflow after states`).toBe(0)
    }
    app.assertReadOnly()
    await keepJson(testInfo, 'echo-states.json', {
      purpose: 'State captures for the owner’s review; not a visual approval.',
      skin: 'signal', widths: [320, 375], height: 700,
      devicePixelRatio: await page.evaluate(() => devicePixelRatio),
      states: ['disabled', 'focus-back', 'chosen', 'error'],
      preset: { provenance: PHOSPHOR_ECHO_PRESET_PROVENANCE, values: PHOSPHOR_ECHO_PRESET },
    })
  })
})

// ---------------------------------------------------------------------------
// 3. Live: motion, scroll, navigation, dialog, loading, off, reduced, hidden.
// ---------------------------------------------------------------------------

/**
 * Every rear layer sits exactly on its owner's outline, and nothing nested has
 * one. A rear re-measures in the frame after its owner resizes, so a page
 * still laying out is read again until it settles.
 */
async function assertMasked(page: Page, label: string) {
  let rears = 0
  await expect(async () => {
    rears = await readMasked(page, label)
  }).toPass({ timeout: 3_000 })
  return rears
}

async function readMasked(page: Page, label: string) {
  const report = await page.evaluate(() => {
    const misaligned: string[] = []
    const frames = [...document.querySelectorAll<HTMLElement>('[data-echo="frame"]')]
    for (const wrapper of frames) {
      const rear = wrapper.querySelector(':scope > .clr-echo__rear')
      if (!rear) continue
      const chamfer = wrapper.querySelector('.clr-chamfer')!
      const outline = (chamfer.closest('.clr-card') && wrapper.contains(chamfer.closest('.clr-card'))) ? chamfer.closest('.clr-card')! : chamfer
      const a = rear.getBoundingClientRect()
      const b = outline.getBoundingClientRect()
      if (Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5 || Math.abs(a.width - b.width) > 0.5 || Math.abs(a.height - b.height) > 0.5) {
        misaligned.push(wrapper.textContent?.slice(0, 40) ?? '?')
      }
    }
    return {
      misaligned,
      rears: document.querySelectorAll('.clr-echo__source').length,
      nested: document.querySelectorAll('[data-echo] [data-echo], .clr-card__body .clr-echo__source, dialog .clr-echo__source').length,
      filterDefs: document.querySelectorAll('filter#clr-phosphor-echo').length,
    }
  })
  expect(report.misaligned, `${label}: rear off its owner`).toEqual([])
  expect(report.nested, `${label}: nested echo`).toBe(0)
  expect(report.filterDefs, `${label}: filter definitions`).toBe(1)
  return report.rears
}

test.describe('Phosphor Echo on the actual app — live transitions', () => {
  test('stays masked while the atmosphere moves, on scroll, across navigation, a dialog, loading, off, reduced motion and a hidden tab', async ({ page, echoOrigin }, testInfo) => {
    const app = await syntheticApp(page, echoOrigin, { skin: 'vapour', effects: 'on', holdGeneration: true })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.setViewportSize({ width: 375, height: 640 })

    await openGenerate(page)
    expect(await assertMasked(page, 'populated')).toBe(4)

    // Moving atmosphere: the ground changes between frames, the echo stays on its owners.
    const motion = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)
    expect(motion, 'the atmosphere is not moving').toBeGreaterThan(0)
    for (let frame = 0; frame < 4; frame++) {
      await page.waitForTimeout(250)
      expect(await assertMasked(page, `moving frame ${frame}`)).toBe(4)
    }

    // Scrolling: the content scrolls under the pinned layers; the echo moves with its owner.
    const scroller = page.getByRole('region', { name: 'Generate content' })
    await scroller.evaluate((el) => el.scrollBy(0, 160))
    await settle(page)
    expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    expect(await assertMasked(page, 'scrolled')).toBe(4)
    await keep(testInfo, 'echo-live-scrolled.png', (await capture(page)).png)

    // Reduced motion, live: decorative motion stops, the echo stays.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await settle(page)
    expect(await assertMasked(page, 'reduced motion')).toBe(4)
    await page.emulateMedia({ reducedMotion: 'no-preference' })

    // A hidden tab and back: the policy re-resolves; the echo is unchanged.
    for (const state of ['hidden', 'visible'] as const) {
      await page.evaluate((value) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value })
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => value === 'hidden' })
        document.dispatchEvent(new Event('visibilitychange'))
      }, state)
      await settle(page)
      expect(await assertMasked(page, `tab ${state}`)).toBe(4)
    }

    // Loading: Generate hands the screen to the Loading host while the held
    // request is unanswered; its owners echo by the same rule, and Cancel
    // puts the form — and its four echoes — back.
    await scroller.evaluate((el) => el.scrollTo(0, 0))
    await page.getByRole('group', { name: 'Anchor' }).getByRole('button').first().click()
    await page.getByRole('button', { name: /generate workout/i }).click()
    await expect.poll(() => app.held.length).toBe(1)
    await expect(page.getByRole('group', { name: 'Anchor' })).toBeHidden()
    await settle(page)
    expect(await assertMasked(page, 'generation loading')).toBeGreaterThan(0)
    await keep(testInfo, 'echo-live-generation-loading.png', (await capture(page)).png)
    await page.getByRole('button', { name: /cancel/i }).first().click()
    await expect(page.getByRole('group', { name: 'Anchor' })).toBeVisible()
    await settle(page)
    expect(await assertMasked(page, 'loading cancelled')).toBe(4)

    // Navigation: Home's owners echo by the same rule.
    await page.getByRole('button', { name: 'Home' }).click()
    await expect(page).toHaveURL(/\/$/)
    await settle(page)
    expect(await assertMasked(page, 'home')).toBeGreaterThan(0)

    // Settings, then a dialog over Places: nothing inside the dialog echoes.
    await page.goto('/settings/locations')
    const remove = page.getByRole('button', { name: /^delete$/i }).last()
    await expect(remove).toBeVisible()
    await settle(page)
    const places = await assertMasked(page, 'places')
    expect(places).toBeGreaterThan(0)
    await remove.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await settle(page)
    // The screen's owners keep their echo under the dialog; nothing in it has one.
    expect(await assertMasked(page, 'dialog open')).toBe(places)
    expect(await dialog.locator('[data-echo], .clr-echo__source').count()).toBe(0)
    await keep(testInfo, 'echo-live-dialog.png', (await capture(page)).png)
    await dialog.getByRole('button').first().click()
    await expect(dialog).toBeHidden()
    expect(await assertMasked(page, 'dialog closed')).toBe(places)

    // Visual effects off through the real Settings checkbox: every rear source goes.
    await page.goto('/settings')
    const box = page.getByRole('checkbox', { name: 'Visual effects' })
    await expect(box).toBeChecked()
    await box.uncheck()
    await expect(page.locator('.clr-echo__source')).toHaveCount(0)
    await page.goto('/generate')
    await expect(page.getByRole('group', { name: 'Anchor' })).toBeVisible()
    await expect(page.locator('.clr-echo__source, .clr-echo__rear')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /generate workout/i })).toBeVisible()
    await keep(testInfo, 'echo-live-effects-off.png', (await capture(page)).png)

    // And on again: every owner's echo returns, masked.
    await page.evaluate(() => {
      localStorage.setItem('clear.visual-effects', 'on')
      window.dispatchEvent(new StorageEvent('storage', { key: 'clear.visual-effects' }))
    })
    await expect(page.locator('.clr-echo__source')).toHaveCount(4)
    expect(await assertMasked(page, 'effects back on')).toBe(4)
    app.assertReadOnly()
  })
})
