import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { join, relative, resolve } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { resolveObjectStore, verifyReferences } from '../../scripts/refinement/lib/references.mjs'
import { sessionSnapshotSchema, type SessionSnapshot } from '../../src/state/schemas'
import { timerFramesAcceptance, timerFramesSnapshot } from '../../src/test/timer-frames-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { CRT_FIELD_CONFIG } from '../../src/ui/crt-field/config'
import { PHOSPHOR_ECHO_PRESET } from '../../src/ui/phosphor-echo-preset'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-033 (REQ-033; AC-R033-01, AC-R033-02, AC-R033-03; JOURNEY-033) — the
 * final CRT / Phosphor Echo composition, through the current effects owners,
 * with the readable focused log, TASK-016's Balanced backdrop and TASK-008's
 * meaningful deadline warning. Contract: `docs/specs/EFFECTS_COMPOSITION_CONTRACT.md`.
 *
 * Owners (re-verified, not copied): the comfort policy `src/state/visual-effects.ts`
 * and the root effects host in `src/app/RootLayout.tsx`; the one Echo kernel
 * `src/ui/phosphor-echo.tsx` (preset `phosphor-echo-preset.ts`, eligibility
 * `foreground-echo.tsx`); the one live CRT front glass `src/ui/crt-field/`
 * (preset `config.ts`); the warning `src/ui/refinements/deadline-timer.tsx` +
 * `countdown-warning.ts`; the focused dialog `src/ui/refinements/logging-overlay.tsx`.
 *
 * Entry (ENTRY-033): `/workout` on a running synthetic session whose Warm-up
 * hold and rest approach their deadlines (TASK-007's read-only timer-frames
 * fixture), with its open log and a native dialog; and the accepted gallery
 * states `/gallery/refinements?state=urgency` and `?state=ladder-long`
 * (reference eded158cfd928d382c9a9409e2c372270312741d). Action: run into the
 * warning, open the log and a native dialog, switch Visual effects off and on,
 * switch to reduced motion, change skin. Result, read from the browser: one
 * pointer-transparent front glass painted over the readable, unfiltered
 * foreground in the browser top layer, the Echo rear beneath the frame in its
 * own role colour, the Balanced backdrop on the native backdrop only, and one
 * in-phase warning edge in the topmost dialog — with off, reduced-motion and
 * cleanup behaviour preserved and nothing written.
 *
 * The Playwright clock drives the app's functional clocks; the warning's
 * breathe and the glass's two clocks run on the browser's real timelines.
 * Synthetic and contained: an intercepted session for a fictional user; no
 * set, block result or session call is made.
 */
const OWNER = '00000000-0000-4000-8000-000000003301'
const PLACE = '00000000-0000-4000-8000-000000003311'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const ENTRY = Date.parse('2026-11-10T09:00:00.000Z')

const e2e = readE2eEnv()
const SYNTHETIC_ORIGIN_NEEDED = !e2e.usesExternalTarget && (e2e.url === null || e2e.anonKey === null)
const REPO_ROOT = resolve(import.meta.dirname, '..', '..')

function freePort() {
  return new Promise<number>((settle, fail) => {
    const probe = createServer()
    probe.once('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => settle(port))
    })
  })
}

/** Ready only when the server answering is this checkout's own. */
async function waitForOrigin(origin: string, deadline: number, exited: () => number | null) {
  const own = `${origin}/@fs${resolve(REPO_ROOT, 'package.json')}`
  while (Date.now() < deadline) {
    const code = exited()
    if (code !== null) throw new Error(`Synthetic TASK-033 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-033 origin ${origin} did not start`)
}

const test = scanned.extend<object, { syntheticOrigin: string | null }>({
  syntheticOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      if (!SYNTHETIC_ORIGIN_NEEDED) return use(null)
      const port = await freePort()
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [
        resolve(REPO_ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort',
      ], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          VITE_SUPABASE_URL: 'https://synthetic-task-033.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-033-public-placeholder',
        },
        stdio: 'ignore',
      })
      let exitCode: number | null = null
      server.once('exit', (code) => { exitCode = code ?? -1 })
      try {
        await waitForOrigin(origin, Date.now() + 90_000, () => exitCode)
        await use(origin)
      } finally {
        server.kill()
      }
    },
    { scope: 'worker', timeout: 120_000 },
  ],
  baseURL: async ({ baseURL, syntheticOrigin }, use) => use(syntheticOrigin ?? baseURL),
})

test.describe.configure({ mode: 'default' })

const PHONE_390 = { width: 390, height: 844 }
const PHONE_320 = { width: 320, height: 568 }
const SKINS = ['clear', 'signal', 'vapour', 'mono'] as const
/** The glass's two clock ids (`CRT_FIELD_ANIMATIONS` in crt-field.tsx, which imports its stylesheet and so is read as text here). */
const CRT_FIELD_ANIMATIONS = { lines: 'clr-crt-line-drift', grain: 'clr-crt-grain-refresh' } as const
type Skin = (typeof SKINS)[number]

// ─────────────────────────────────────────────────────────────────────────────
// AC-R033-01: the owners, their sources and their one kernel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The current effects owners, re-verified on 2026-11-10 against the accepted
 * gallery reference (eded158c…, whose PINNED-SOURCE resolves each of these from
 * the integration base 03087f7 unchanged, and whose SOURCE-MANIFEST names the
 * two preset owners "unchanged preset owners") and the integration head. The
 * accepted reference states: "Presets remain single-owned and unchanged."
 * A change here is a change of effects owner and needs its own approval.
 */
const EFFECTS_OWNERS: Readonly<Record<string, string>> = {
  'src/ui/crt-field/crt-field.tsx': '551817b6f2702c0b0255e42262442237830c0bccee625240cb609d8a6c410f7f',
  'src/ui/crt-field/config.ts': '3b496b905467ecf0ee014dce56a057ebb6941e61c40a74f08127593c172cf0fe',
  'src/ui/crt-field/crt-field.css': '47754035619fc6c2a7260b43348a2076d078d8ab516f33cbce54a5204bb47695',
  'src/ui/phosphor-echo.tsx': 'd82e4e0541355e9f22b94f999ef016a834490ad7be88fd9e159fc32e195fd741',
  'src/ui/phosphor-echo.css': '1c47dda923cab0a023570656adc3af4ea0033c709622b4e4a9745a36c7b0cc11',
  'src/ui/phosphor-echo-preset.ts': 'e69d5e61d2e2624a9ef2c89310f8037b896872289c74c77db5c82a7dd68384a8',
  'src/ui/foreground-echo.tsx': 'efb249fab62690626138365c1029d7f26e9c6244acca7f3d2f0267ac1e64093c',
  'src/state/visual-effects.ts': '2c02ad5a0555a81d4dcf04394ece84f76143426048b2d4872cf0e90a47763e15',
  'src/app/RootLayout.tsx': 'aae7480981a85e611db84cb55a84d2fcb0a87e3d08c7ce59dd830e437613c2f6',
  'src/styles/atmosphere.css': 'dfe2d7071f029743ad176f40f2c47e7af8348452f0ffa2ee0c2417e08d5dcf7b',
}

/** Where #596's preserved intake moved to, and its public fixture copy. */
const INTAKE_DIR = 'docs/design/library/intake/phosphor-echo'
const FIXTURE_DIR = 'e2e/fixtures/effects-reference/round-3'
const INTAKE_REFERENCE = 'evidence/refinement/clear-refinement-20261103/references/phosphor-echo/REFERENCE.json'

const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
const fileHash = (path: string) => sha256(readFileSync(resolve(REPO_ROOT, path)))

/** Every application source file, repository-relative. */
function sourceFiles(dir = 'src'): string[] {
  const out: string[] = []
  for (const name of readdirSync(resolve(REPO_ROOT, dir))) {
    const path = join(dir, name)
    if (statSync(resolve(REPO_ROOT, path)).isDirectory()) {
      // The immutable 0.14.3 import and the test-only helpers are not application runtime owners.
      if (path === join('src', 'design-system') || path === join('src', 'test')) continue
      out.push(...sourceFiles(path))
    } else if (/\.(tsx?|css|mjs|js)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(path)
    }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic /workout
// ─────────────────────────────────────────────────────────────────────────────

async function syntheticApp(page: Page, options: { reducedMotion?: boolean } = {}) {
  const acceptance = timerFramesAcceptance({ locationId: PLACE })
  const running: SessionSnapshot = sessionSnapshotSchema.parse(timerFramesSnapshot(acceptance, {
    userId: OWNER,
    startedAt: new Date(ENTRY - 60_000).toISOString(),
  }))
  const writes: string[] = []
  const unexpected: string[] = []
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: options.reducedMotion ?? false })
  await page.clock.install({ time: ENTRY })

  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/')) {
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (request.method() === 'GET') {
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'balanced' })])
      if (name === 'locations') return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full', is_default: true })])
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session' || name === 'session_snapshot') return reply(running)
      if (name === 'session_as_performed') return reply(null)
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history',
        'generation_refusal_diagnostics', 'generation_candidate_sets_for_goal', 'generation_candidate_sets'].includes(name)) return reply([])
    }
    writes.push(`${request.method()} ${url.pathname}`)
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-033 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-033-session', refreshToken: 'synthetic-task-033-refresh',
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-033@example.invalid' },
    }))
  }, { owner: OWNER })

  return {
    assertContained() {
      expect(unexpected, 'Every API request has an explicit synthetic disposition').toEqual([])
      expect(writes, 'No set, block result or session call is written').toEqual([])
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

/** A gallery visit with no account: the reviewer's skin, effects and motion choices. */
async function galleryVisit(page: Page, options: { skin?: Skin; reducedMotion?: boolean; appReduceMotion?: boolean } = {}) {
  await installDeterministicCapture(page, { skin: options.skin ?? 'clear', reducedMotion: options.reducedMotion ?? false })
  await page.addInitScript(({ reduce }) => {
    if (reduce) localStorage.setItem('clear.reduce-motion', 'on')
  }, { reduce: options.appReduceMotion ?? false })
  const requests: string[] = []
  page.on('request', (request) => {
    if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
  })
  return { requests }
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    void document.body.offsetHeight
    await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)))
    await document.fonts.ready
  })
}

async function pass(page: Page, seconds: number) {
  await page.clock.runFor(seconds * 1000)
}

async function tap(control: Locator) {
  await control.evaluate((node) => node.scrollIntoView({ block: 'center' }))
  await control.tap()
}

/** Visual effects changed live, as the Settings checkbox in another tab would. */
async function setEffects(page: Page, value: 'on' | 'off') {
  await page.evaluate((next) => {
    localStorage.setItem('clear.visual-effects', next)
    window.dispatchEvent(new StorageEvent('storage', { key: 'clear.visual-effects' }))
  }, value)
}

async function storageSnapshot(page: Page): Promise<Record<string, string | null>> {
  return page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort()
    .filter((key) => key !== 'clear.visual-effects')
    .map((key) => [key, localStorage.getItem(key)])))
}

async function attach(page: Page, name: string) {
  await settle(page)
  const body = await page.screenshot({ caret: 'hide', animations: 'allow' })
  await test.info().attach(`${name}.png`, { body, contentType: 'image/png' })
}

async function attachJson(name: string, value: unknown) {
  await test.info().attach(`${name}.json`, { body: JSON.stringify(value, null, 2), contentType: 'application/json' })
}

// ─────────────────────────────────────────────────────────────────────────────
// The composition, read from the browser
// ─────────────────────────────────────────────────────────────────────────────

interface Composition {
  viewport: { width: number; height: number }
  host: { effects: string | null; motion: string | null }
  fields: { open: boolean; config: string | null; ariaHidden: string | null; pointerEvents: string; motion: string | null; rect: { width: number; height: number }; clocks: { id: string; playState: string }[] }[]
  echoFilters: { blur: string | null; dx: string | null; dy: string | null; slope: string | null }[]
  openDialogs: { name: string; modal: boolean; backdropFilter: string; backdropImage: string; backdropAnimation: string; backdropDuration: string }[]
  edges: { host: string; loop: string | null; opacity: number; animation: string; rect: { width: number; height: number }; pointerEvents: string; startTimes: (number | null)[] }[]
  urgentTimers: { label: string; loop: string | null; opacity: number; startTimes: (number | null)[] }[]
  /**
   * The open dialog's foreground: any filter or backdrop filter on it or inside
   * it (the Echo's decorative rear excepted), and any opacity below 1 on the
   * path from the dialog to its title and its frame (the warning's own breathe
   * on an urgent timer is the warning, not a veil).
   */
  foregroundEffects: string[]
  scanLayers: number
}

async function compose(page: Page): Promise<Composition> {
  return page.evaluate(() => {
    const breathes = (element: Element) => element.getAnimations()
      .filter((animation) => (animation as CSSAnimation).animationName === 'clr-deadline-breathe')
      .map((animation) => (animation.startTime === null ? null : Number(animation.startTime)))
    const host = document.querySelector<HTMLElement>('.clr-effects-host')
    const dialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')]
    const top = dialogs.at(-1)
    const foregroundEffects: string[] = []
    if (top) {
      const describe = (node: Element, style: CSSStyleDeclaration) =>
        `${node.tagName.toLowerCase()}.${[...node.classList].join('.')} filter=${style.filter} backdrop=${style.backdropFilter} opacity=${style.opacity}`
      for (const node of [top, ...top.querySelectorAll<HTMLElement>('*')]) {
        if (node.closest('.clr-echo__rear') || node.classList.contains('clr-echo__source')) continue
        if (node.hasAttribute('data-countdown-edge')) continue
        const style = getComputedStyle(node)
        // A filter at its identity (Foundation's phosphor entry, held at its
        // final brightness(1) saturate(1)) changes no pixel; anything else would.
        const identity = (value: string) => value === 'none' ||
          value.replace(/(?:brightness|saturate|contrast|opacity)\(1\)|(?:blur)\(0px\)|(?:grayscale|sepia|invert)\(0\)|hue-rotate\(0deg\)/g, '').trim() === ''
        if (!identity(style.filter) || style.backdropFilter !== 'none') foregroundEffects.push(describe(node, style))
      }
      const labelled = top.getAttribute('aria-labelledby')
      const title = (labelled ? document.getElementById(labelled) : null) ?? top.querySelector('h2')
      const frame = top.querySelector('[data-logging-frame]') ?? top.querySelector('.clr-chamfer')
      for (const leaf of [title, frame]) {
        for (let node: Element | null = leaf; node && node !== top.parentElement; node = node.parentElement) {
          const style = getComputedStyle(node)
          if (Number(style.opacity) < 1) foregroundEffects.push(describe(node, style))
        }
      }
    }
    return {
      viewport: { width: innerWidth, height: innerHeight },
      host: { effects: host?.dataset.effects ?? null, motion: host?.dataset.motion ?? null },
      fields: [...document.querySelectorAll<HTMLElement>('.clr-crt-field')].map((field) => {
        const rect = field.getBoundingClientRect()
        return {
          open: field.matches(':popover-open'),
          config: field.getAttribute('data-crt-config'),
          ariaHidden: field.getAttribute('aria-hidden'),
          pointerEvents: getComputedStyle(field).pointerEvents,
          motion: field.getAttribute('data-motion'),
          rect: { width: rect.width, height: rect.height },
          clocks: field.getAnimations({ subtree: true }).filter((animation) => animation.id)
            .map((animation) => ({ id: animation.id, playState: animation.playState })),
        }
      }),
      echoFilters: [...document.querySelectorAll('filter#clr-phosphor-echo')].map((filter) => ({
        blur: filter.querySelector('feGaussianBlur')?.getAttribute('stdDeviation') ?? null,
        dx: filter.querySelector('feOffset')?.getAttribute('dx') ?? null,
        dy: filter.querySelector('feOffset')?.getAttribute('dy') ?? null,
        slope: filter.querySelector('feFuncA')?.getAttribute('slope') ?? null,
      })),
      openDialogs: dialogs.map((dialog) => {
        const backdrop = getComputedStyle(dialog, '::backdrop')
        const labelled = dialog.getAttribute('aria-labelledby')
        return {
          name: (labelled ? document.getElementById(labelled)?.textContent : dialog.querySelector('h2')?.textContent) ?? '',
          modal: dialog.matches(':modal'),
          backdropFilter: backdrop.backdropFilter,
          backdropImage: backdrop.backgroundImage,
          backdropAnimation: backdrop.animationName,
          backdropDuration: backdrop.animationDuration,
        }
      }),
      edges: [...document.querySelectorAll<HTMLElement>('[data-countdown-edge]')].map((edge) => {
        const style = getComputedStyle(edge)
        const rect = edge.getBoundingClientRect()
        const parent = edge.parentElement
        return {
          host: parent === document.body ? 'body' : parent instanceof HTMLDialogElement ? `dialog:${parent.open ? 'open' : 'closed'}` : parent?.tagName.toLowerCase() ?? 'none',
          loop: edge.getAttribute('data-loop'),
          opacity: Number(style.opacity),
          animation: style.animationName,
          rect: { width: rect.width, height: rect.height },
          pointerEvents: style.pointerEvents,
          startTimes: breathes(edge),
        }
      }),
      urgentTimers: [...document.querySelectorAll<HTMLElement>('[role="timer"][data-urgent="true"]')]
        .filter((timer) => timer.getClientRects().length > 0)
        .map((timer) => ({
          label: timer.getAttribute('aria-label') ?? '',
          loop: timer.getAttribute('data-loop'),
          opacity: Number(getComputedStyle(timer).opacity),
          startTimes: breathes(timer),
        })),
      foregroundEffects,
      // Retired decorative scans (effects TASK-006) must not come back over a dialog.
      scanLayers: [...document.querySelectorAll('.clr-atmosphere__scan, .scanlines-overlay')]
        .filter((node) => getComputedStyle(node).display !== 'none').length,
    }
  })
}

/** The one selected glass: the shipping preset, in the top layer, never taking input. */
function expectOneGlass(frame: Composition, label: string, motion: 'running' | 'paused') {
  expect(frame.host, `${label}: the root effects host`).toEqual({ effects: 'on', motion: motion === 'running' ? 'allowed' : 'still' })
  expect(frame.fields, `${label}: exactly one CRT front glass`).toHaveLength(1)
  const [field] = frame.fields
  expect(field, `${label}: the selected preset in the top layer`).toMatchObject({
    open: true, config: CRT_FIELD_CONFIG.id, ariaHidden: 'true', pointerEvents: 'none', motion,
    rect: frame.viewport,
  })
  const clocks = Object.fromEntries(field.clocks.map((clock) => [clock.id, clock.playState]))
  const state = motion === 'running' ? 'running' : 'paused'
  expect(clocks, `${label}: the two glass clocks`).toEqual({ [CRT_FIELD_ANIMATIONS.lines]: state, [CRT_FIELD_ANIMATIONS.grain]: state })
  expect(frame.echoFilters, `${label}: one Echo kernel, the selected preset`).toEqual([{
    blur: String(PHOSPHOR_ECHO_PRESET.blur), dx: String(PHOSPHOR_ECHO_PRESET.x), dy: String(PHOSPHOR_ECHO_PRESET.y), slope: String(PHOSPHOR_ECHO_PRESET.opacity),
  }])
  expect(frame.scanLayers, `${label}: no retired scan layer`).toBe(0)
}

/** Effects off: no glass, no Echo rear; the meaningful warning and the backdrop stay. */
function expectEffectsOff(frame: Composition, label: string) {
  expect(frame.host.effects, `${label}: host`).toBe('off')
  expect(frame.fields, `${label}: no glass`).toEqual([])
  expect(frame.scanLayers, `${label}: no retired scan layer comes back`).toBe(0)
}

/** TASK-016's selected A / Balanced backdrop on the native backdrop only. */
function expectBalancedBackdrop(frame: Composition, name: string, label: string, reduced = false) {
  const dialog = frame.openDialogs.at(-1)
  expect(dialog?.name, `${label}: the top dialog`).toBe(name)
  expect(dialog?.modal, `${label}: native modal`).toBe(true)
  expect(dialog?.backdropFilter, `${label}: Balanced blur`).toBe('blur(4px)')
  expect(dialog?.backdropImage, `${label}: Balanced vignette`).toMatch(/^radial-gradient\(/)
  expect(dialog?.backdropImage, `${label}: no dialog-own scan`).not.toMatch(/repeating-linear-gradient/)
  if (reduced) {
    // The app's end-state guarantee (a11y.css): no fade, or one collapsed to at most 0.01 ms.
    const seconds = dialog?.backdropAnimation === 'none' ? 0 : Number.parseFloat(dialog?.backdropDuration ?? '1')
    expect(seconds, `${label}: no backdrop fade under reduced motion`).toBeLessThanOrEqual(0.00001)
  }
  expect(frame.foregroundEffects, `${label}: the foreground stays sharp and opaque`).toEqual([])
}

/** The one warning edge, covering the viewport from its host, in phase with every urgent timer. */
function expectOneEdge(frame: Composition, host: string, label: string, still = false) {
  expect(frame.edges, `${label}: one edge`).toHaveLength(1)
  const [edge] = frame.edges
  expect(edge.host, `${label}: edge host`).toBe(host)
  expect(edge.rect, `${label}: edge covers the viewport`).toEqual(frame.viewport)
  expect(edge.pointerEvents, `${label}: edge never takes input`).toBe('none')
  expect(frame.urgentTimers.length, `${label}: an urgent timer`).toBeGreaterThan(0)
  if (still) {
    expect(edge, `${label}: still`).toMatchObject({ loop: 'still', opacity: 0.5, animation: 'none', startTimes: [] })
    for (const timer of frame.urgentTimers) expect(timer, `${label}: ${timer.label} still`).toMatchObject({ opacity: 0.5, startTimes: [] })
  } else {
    expect(edge, `${label}: breathing`).toMatchObject({ loop: 'run', animation: 'clr-deadline-breathe', startTimes: [0] })
    for (const timer of frame.urgentTimers) {
      expect(timer, `${label}: ${timer.label} in phase`).toMatchObject({ loop: 'run', startTimes: [0] })
      expect(Math.abs(timer.opacity - edge.opacity), `${label}: ${timer.label} same brightness`).toBeLessThanOrEqual(0.001)
    }
  }
}

/** The edge is painted above everything inside its (non-inert) host. */
async function edgeIsTopmost(page: Page): Promise<boolean[]> {
  return page.evaluate(() => {
    const node = document.querySelector<HTMLElement>('[data-countdown-edge]')
    if (node === null) return []
    const { innerWidth: w, innerHeight: h } = window
    const points = [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3], [w / 2, h / 2], [w / 2, h * 0.8]]
    node.style.pointerEvents = 'auto'
    try {
      return points.map(([x, y]) => document.elementFromPoint(x, y) === node)
    } finally {
      node.style.pointerEvents = ''
    }
  })
}

interface GlassReading {
  clip: { x: number; y: number; width: number; height: number }
  changedPixels: number
  pixels: number
  meanDelta: number
}

/**
 * Whether the one glass is painted over a real foreground surface: the same
 * interior patch with the glass shown and hidden (nothing else changes; every
 * animation held for both shots). A glass behind the opaque surface would leave
 * the patch unchanged. A modal dialog makes the glass inert to hit testing, so
 * paint is the only honest measure of top-layer order.
 */
async function glassOver(page: Page, surface: Locator): Promise<GlassReading> {
  await settle(page)
  const clip = await surface.evaluate((node) => {
    const r = node.getBoundingClientRect()
    const left = Math.max(0, r.left + 12), right = Math.min(innerWidth, r.right - 12)
    const top = Math.max(0, r.top + 12), bottom = Math.min(innerHeight, r.bottom - 12)
    const width = Math.floor(Math.min(160, right - left))
    const height = Math.floor(Math.min(48, bottom - top))
    return { x: Math.floor((left + right - width) / 2), y: Math.floor((top + bottom - height) / 2), width, height }
  })
  expect(clip.width).toBeGreaterThan(0)
  expect(clip.height).toBeGreaterThan(0)
  const field = page.locator('.clr-crt-field')
  // Hold every running animation where it is for both shots, then put each back
  // on its own start time — so the warning's shared phase (startTime 0) and the
  // glass's clocks are exactly as they were. (Playwright's `animations:
  // 'disabled'` would cancel and restart them, breaking the phase it measures.)
  await page.evaluate(() => {
    const running = document.getAnimations().filter((animation) => animation.playState === 'running')
    const held = running.map((animation) => ({ animation, startTime: animation.startTime }))
    for (const { animation } of held) animation.pause()
    ;(window as unknown as { task033Held?: typeof held }).task033Held = held
  })
  let withGlass: Buffer
  let withoutGlass: Buffer
  try {
    withGlass = await page.screenshot({ clip, animations: 'allow', caret: 'hide' })
    // Hidden at once: reduced motion collapses every transition to 0.01 ms
    // (a11y.css), which would otherwise hold the discrete visibility change.
    await field.evaluate((node) => {
      node.style.setProperty('transition', 'none', 'important')
      node.style.setProperty('visibility', 'hidden', 'important')
    })
    withoutGlass = await page.screenshot({ clip, animations: 'allow', caret: 'hide' })
  } finally {
    await field.evaluate((node) => {
      node.style.removeProperty('visibility')
      node.style.removeProperty('transition')
    })
    await page.evaluate(() => {
      const store = window as unknown as { task033Held?: { animation: Animation; startTime: CSSNumberish | null }[] }
      for (const { animation, startTime } of store.task033Held ?? []) {
        // A play still pending has no start time yet: let it start as it would have.
        if (startTime === null) animation.play()
        else animation.startTime = startTime
      }
      delete store.task033Held
    })
  }
  const measured = await page.evaluate(async (images) => {
    const pixels = await Promise.all(images.map(async (base64) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = canvas.getContext('2d')!
      context.drawImage(bitmap, 0, 0)
      return context.getImageData(0, 0, bitmap.width, bitmap.height).data
    }))
    const [a, b] = pixels
    let changed = 0
    let delta = 0
    for (let index = 0; index < a.length; index += 4) {
      const d = Math.abs(a[index] - b[index]) + Math.abs(a[index + 1] - b[index + 1]) + Math.abs(a[index + 2] - b[index + 2])
      if (d > 0) changed += 1
      delta += d / 3
    }
    return { changedPixels: changed, pixels: a.length / 4, meanDelta: delta / (a.length / 4) }
  }, [withGlass.toString('base64'), withoutGlass.toString('base64')])
  return { clip, ...measured }
}

/** The glass visibly over the surface, and restrained: the foreground stays readable. */
function expectGlassOver(reading: GlassReading, label: string) {
  expect(reading.changedPixels, `${label}: the glass is painted over this foreground`).toBeGreaterThan(0)
  // The selected lines darken by at most 16% on half of each 4 px period and the
  // grain adds 7% light: a restrained mean change, never a veil over the text.
  expect(reading.meanDelta, `${label}: restrained, readable glass`).toBeLessThan(32)
}

/** The Echo rear of the dialog's outer frame: beneath it, its full footprint, in its own role colour. */
async function frameEcho(page: Page) {
  return page.evaluate(() => {
    const dialog = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].at(-1)
    const wrapper = dialog?.querySelector<HTMLElement>(':scope > .clr-echo')
    const rear = wrapper?.querySelector<SVGSVGElement>(':scope > .clr-echo__rear') ?? null
    const frame = dialog?.querySelector<HTMLElement>('[data-logging-frame]')
    if (!dialog || !frame) return null
    // A colour as the 8-bit sRGB channels it paints, alpha set to 1 (as the
    // silhouette is drawn): resolved by the browser, never by parsing text.
    const canvas = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true })!
    const probe = document.createElement('span')
    document.body.append(probe)
    const channels = (value: string) => {
      probe.style.color = `rgb(from ${value} r g b / 1)`
      canvas.clearRect(0, 0, 1, 1)
      canvas.fillStyle = getComputedStyle(probe).color
      canvas.fillRect(0, 0, 1, 1)
      return [...canvas.getImageData(0, 0, 1, 1).data.slice(0, 3)]
    }
    const box = (node: Element) => {
      const r = node.getBoundingClientRect()
      return [r.left, r.top, r.width, r.height].map(Math.round)
    }
    const reading = {
      rear: rear !== null,
      rearFirst: rear !== null && wrapper?.firstElementChild === rear,
      rearHidden: rear?.getAttribute('aria-hidden') ?? null,
      rearPointer: rear ? getComputedStyle(rear).pointerEvents : null,
      rearBox: rear ? box(rear) : null,
      frameBox: box(frame),
      rearInk: rear ? channels(getComputedStyle(rear).color) : null,
      frameInk: channels(getComputedStyle(frame, '::after').backgroundColor),
      filtered: rear?.querySelector('.clr-echo__source') ? getComputedStyle(rear.querySelector('.clr-echo__source')!).filter : null,
    }
    probe.remove()
    return reading
  })
}

async function dialogA11y(page: Page) {
  const results = await new AxeBuilder({ page }).include('dialog[open]').analyze()
  expect(results.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target.join(' ')) }))).toEqual([])
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-033 final CRT and Phosphor Echo composition', () => {
  test('AC-R033-01 one shared kernel: the current effects owners, presets and moved intake paths are the accepted reference\'s, and no intake snapshot, second runtime owner or October 26 preview pattern is in the app', () => {
    // The current owners are byte-identical to the accepted reference's.
    const current = Object.fromEntries(Object.keys(EFFECTS_OWNERS).map((path) => [path, fileHash(path)]))
    expect(current).toEqual(EFFECTS_OWNERS)

    // Where the reference object store is present (the Runner V2 layout), the
    // same bytes are read back from the accepted reference by identity.
    const store = resolveObjectStore({ cwd: REPO_ROOT })
    if (!store.problem) {
      const verified = verifyReferences({ cwd: REPO_ROOT, evidenceRoot: resolve(REPO_ROOT, 'evidence/refinement'), body: 'clear-refinement-20261103', only: 'accepted-gallery', store })
      expect(verified.problems).toEqual([])
      const pinned = verified.references[0].result.files as Map<string, { sha256: string }>
      for (const [path, hash] of Object.entries(EFFECTS_OWNERS)) expect(pinned.get(path)?.sha256, `${path} at eded158c…`).toBe(hash)
      const manifest = JSON.parse((verified.references[0].result.files as Map<string, { bytes: Buffer }>)
        .get('docs/design/library/refinements-2026-11-04/SOURCE-MANIFEST.json')!.bytes.toString('utf8')) as { unchangedPresetOwners: { path: string; sha256: string }[] }
      expect(manifest.unchangedPresetOwners).toEqual([
        { path: 'src/ui/phosphor-echo-preset.ts', sha256: EFFECTS_OWNERS['src/ui/phosphor-echo-preset.ts'] },
        { path: 'src/ui/crt-field/config.ts', sha256: EFFECTS_OWNERS['src/ui/crt-field/config.ts'] },
      ])
    }
    test.info().annotations.push({ type: 'reference-store', description: store.problem ? `absent: in-repo pins only (${store.problem})` : `verified at ${store.source}` })

    expect(readFileSync(resolve(REPO_ROOT, 'src/ui/crt-field/crt-field.tsx'), 'utf8'))
      .toContain(`CRT_FIELD_ANIMATIONS = Object.freeze({ lines: '${CRT_FIELD_ANIMATIONS.lines}', grain: '${CRT_FIELD_ANIMATIONS.grain}' })`)

    // The selected presets: the owner-approved November 3 exports, in their one owner each.
    const echo = JSON.parse(readFileSync(resolve(REPO_ROOT, 'docs/effects/echo-selection-20261103.json'), 'utf8')) as Record<string, number>
    expect({ opacity: PHOSPHOR_ECHO_PRESET.opacity, blur: PHOSPHOR_ECHO_PRESET.blur, x: PHOSPHOR_ECHO_PRESET.x, y: PHOSPHOR_ECHO_PRESET.y })
      .toEqual({ opacity: echo.opacity, blur: echo.blur, x: echo.x, y: echo.y })
    const lines = JSON.parse(readFileSync(resolve(REPO_ROOT, 'docs/effects/scanline-selection-20261103.json'), 'utf8')) as Record<string, number>
    expect(CRT_FIELD_CONFIG.id).toBe('clr-crt-field/review-2026-11-03.1')
    expect(CRT_FIELD_CONFIG.lines).toEqual({
      periodPx: lines.periodPx, thicknessPx: lines.thicknessPx, opacity: lines.opacity,
      curvaturePx: lines.curvaturePx, driftSecondsPerPeriod: lines.driftSecondsPerPeriod,
    })

    // #596's preserved intake, at its moved path and in the public fixtures, is the pinned intake.
    const intake = JSON.parse(readFileSync(resolve(REPO_ROOT, INTAKE_REFERENCE), 'utf8')) as { files: { path: string; sha256: string }[] }
    const kernelFiles = intake.files.filter((file) => !file.path.endsWith('README.md'))
    expect(kernelFiles.map((file) => file.path.split('/').at(-1)).sort()).toEqual(['APPLICATION-RULES.md', 'VERIFICATION.json', 'phosphor-echo.mjs', 'preferred-preset.json'])
    for (const file of kernelFiles) {
      const name = file.path.split('/').at(-1)!
      expect(fileHash(`${INTAKE_DIR}/${name}`), `${INTAKE_DIR}/${name}`).toBe(file.sha256)
      if (existsSync(resolve(REPO_ROOT, FIXTURE_DIR, name))) expect(fileHash(`${FIXTURE_DIR}/${name}`), `${FIXTURE_DIR}/${name}`).toBe(file.sha256)
    }
    expect(fileHash(`${FIXTURE_DIR}/phosphor-echo.mjs`)).toBe(kernelFiles.find((file) => file.path.endsWith('phosphor-echo.mjs'))!.sha256)

    // One kernel, one glass, one warning: no second runtime owner in the application source.
    const files = sourceFiles()
    const read = (path: string) => readFileSync(resolve(REPO_ROOT, path), 'utf8')
    const containing = (pattern: RegExp) => files.filter((path) => pattern.test(read(path))).map((path) => relative('src', path)).sort()
    expect(containing(/<feComposite[\s\S]{0,200}operator="out"|operator: ?['"]out['"]/), 'the Echo compositing kernel').toEqual(['ui/phosphor-echo.tsx'])
    expect(containing(/\.showPopover\(/), 'the front-glass promotion').toEqual(['ui/crt-field/crt-field.tsx'])
    expect(containing(/<CrtField\b/), 'the one live glass mount (and its contained register specimen)').toEqual(['app/RootLayout.tsx', 'dev/gallery-registry.tsx'])
    expect(containing(/<PhosphorEchoDefinition\b/), 'the one filter definition').toEqual(['app/RootLayout.tsx'])
    const imports = (pattern: string) => new RegExp(`(?:from|import\\()\\s*['"][^'"]*(?:${pattern})[^'"]*['"]`)
    expect(containing(imports('crt-glass/')).filter((path) => !path.startsWith('ui/crt-glass/')), 'the raster reference port is never mounted').toEqual([])
    expect(containing(imports('intake/phosphor-echo|effects-reference|round-3|crt-glass-motion|\\.mjs')), 'no intake snapshot or reference host imported').toEqual([])
    expect(containing(/polish-comparison-2026-10-26|cue-edge/), 'no October 26 preview pattern').toEqual([])
    expect(containing(/@keyframes\s+clr-deadline-breathe/), 'the warning keyframes, once').toEqual(['ui/refinements/presentation.css'])
    expect(containing(/clr-crt-line|--clr-crt-/).filter((path) => !/^ui\/crt-(?:field|glass)\//.test(path)), 'no restated glass values').toEqual([])
  })

  test('JOURNEY-033 touch phone-390 /workout: one front glass over the open log and a native dialog, the warning edge above them in phase, Echo beneath; effects off keeps the warning and the draft, on restores the glass above the dialog; nothing written', async ({ page, visit }) => {
    test.setTimeout(180_000)
    await page.setViewportSize(PHONE_390)
    const app = await syntheticApp(page)
    await visit('/workout')
    await expect(page).toHaveURL(/\/workout$/)
    const hold = page.getByRole('region', { name: 'plank countdown' })
    await expect(hold).toBeVisible()
    await page.clock.pauseAt(ENTRY + 60_000)
    await settle(page)
    let frame = await compose(page)
    expectOneGlass(frame, '/workout entry', 'running')
    // Echo on the route's background owners (the header's framed controls), never inside a card or dialog.
    expect(await page.locator('main .clr-echo__rear, header .clr-echo__rear').count(), 'Echo rears on background owners').toBeGreaterThan(0)
    expect(await page.locator('.clr-card .clr-echo__rear').count(), 'no Echo inside a card').toBe(0)

    // The hold runs; Rest opens the log with its 20-second rest.
    await tap(hold.getByRole('button', { name: 'Start' }))
    await pass(page, 13)
    const holdCard = page.locator('[data-workout-card="workout"]').filter({ has: hold })
    await tap(holdCard.getByRole('button', { name: 'Rest', exact: true }))
    const log = page.getByRole('form', { name: /^Log set 1 of plank$/i })
    await expect(log).toBeVisible()
    // A draft typed into the open log.
    const draftField = log.locator('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"])').first()
    await draftField.fill('42')
    await pass(page, 15)

    // Both deadlines in their final five: one edge over the log, in phase; the glass over both.
    const before = await storageSnapshot(page)
    frame = await compose(page)
    expectOneGlass(frame, 'open log', 'running')
    expectOneEdge(frame, 'body', 'open log')
    expect(frame.urgentTimers.map((timer) => timer.label).sort()).toEqual(['Countdown', 'Time remaining'])
    expect(await edgeIsTopmost(page), 'the edge paints above the open log').toEqual([true, true, true, true, true, true])
    const overLog = await glassOver(page, log)
    expectGlassOver(overLog, 'open log')
    await attach(page, 'route-log-composed-phone-390')

    // A native dialog over everything: the edge follows it into the top layer and the glass stays in front.
    await tap(page.getByRole('button', { name: 'Actions' }))
    await tap(page.getByRole('button', { name: 'Abandon' }))
    const dialog = page.getByRole('dialog', { name: 'Abandon workout?' })
    await expect(dialog).toBeVisible()
    await expect.poll(async () => (await compose(page)).edges[0]?.host).toBe('dialog:open')
    // Foundation's 200 ms phosphor entry settles to the sharp, opaque frame.
    await expect.poll(async () => (await compose(page)).foregroundEffects).toEqual([])
    frame = await compose(page)
    expectOneGlass(frame, 'native dialog', 'running')
    expectOneEdge(frame, 'dialog:open', 'native dialog')
    expect(frame.openDialogs.map((open) => open.modal)).toEqual([true])
    expect(frame.foregroundEffects, 'the dialog foreground stays sharp and opaque').toEqual([])
    expect(await edgeIsTopmost(page), 'the edge paints above the native dialog').toEqual([true, true, true, true, true, true])
    const overDialog = await glassOver(page, dialog.locator('.clr-chamfer').first())
    expectGlassOver(overDialog, 'native dialog')
    expect(await dialog.evaluate((node) => node.contains(document.activeElement)), 'native modal focus').toBe(true)
    await attach(page, 'route-dialog-composed-phone-390')

    // Effects off, live: no glass and no Echo; the warning, the dialog and its focus are untouched.
    await setEffects(page, 'off')
    await expect(page.locator('.clr-crt-field')).toHaveCount(0)
    frame = await compose(page)
    expectEffectsOff(frame, 'effects off')
    expectOneEdge(frame, 'dialog:open', 'effects off')
    expect(await page.locator('.clr-echo__rear').count(), 'no Echo rear with effects off').toBe(0)
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true)
    await attach(page, 'route-dialog-effects-off-phone-390')

    // On again: the same one glass, promoted above the still-open dialog.
    await setEffects(page, 'on')
    await expect(page.locator('.clr-crt-field')).toHaveCount(1)
    frame = await compose(page)
    expectOneGlass(frame, 'effects on again', 'running')
    expectGlassOver(await glassOver(page, dialog.locator('.clr-chamfer').first()), 'effects on again')

    // Dismissed: the edge returns to the body; the glass stays one; the draft is intact.
    await tap(dialog.getByRole('button', { name: 'Keep going' }))
    await pass(page, 1)
    await expect(dialog).toBeHidden()
    await expect.poll(async () => (await compose(page)).edges[0]?.host).toBe('body')
    frame = await compose(page)
    expectOneGlass(frame, 'dialog closed', 'running')
    expectOneEdge(frame, 'body', 'dialog closed')
    await expect(draftField).toHaveValue('42')

    // Cleanup: the deadlines run out; nothing urgent is left, the glass is still one.
    await pass(page, 5)
    await expect(page.locator('[data-countdown-edge]')).toHaveCount(0)
    await expect(page.locator('[data-urgent]')).toHaveCount(0)
    frame = await compose(page)
    expectOneGlass(frame, 'after the deadlines', 'running')
    expect(await storageSnapshot(page)).toEqual(before)
    await attachJson('route-glass-readings', { overLog, overDialog })

    // The composed native dialog's accessibility, read with the clock running
    // (axe schedules its own timers): the glass never hides or renames anything.
    await page.clock.resume()
    await tap(page.getByRole('button', { name: 'Actions' }))
    await tap(page.getByRole('button', { name: 'Abandon' }))
    await expect(dialog).toBeVisible()
    await expect.poll(async () => (await compose(page)).foregroundEffects).toEqual([])
    expectGlassOver(await glassOver(page, dialog.locator('.clr-chamfer').first()), 'native dialog reopened')
    await dialogA11y(page)
    await tap(dialog.getByRole('button', { name: 'Keep going' }))
    await expect(dialog).toBeHidden()
    await expect(draftField).toHaveValue('42')
    app.assertContained()
  })

  test('JOURNEY-033 gallery urgency phone-390: the warning under the accepted Balanced LoggingOverlay — glass over the sharp readable frame, its Echo beneath, one in-phase edge in the dialog\'s top layer, X focus and return; effects off keeps the backdrop and the warning', async ({ page, visit }) => {
    test.setTimeout(120_000)
    await page.setViewportSize(PHONE_390)
    const gallery = await galleryVisit(page)
    await page.clock.install({ time: ENTRY })
    await visit('/gallery/refinements?state=urgency')
    const state = page.locator('[data-refinement-state="urgency"]')
    await expect(state.getByRole('heading', { name: /^Countdown warning and whole timer frames/ })).toBeVisible()
    const demo = state.locator('[data-gallery-deadline-warning]')
    const opener = demo.getByRole('button', { name: 'Open log over the warning' })
    const dialog = page.getByRole('dialog', { name: 'Log set' })

    // The composed dialog's accessibility first, while the clock still runs
    // (axe schedules its own timers): held at five, nothing urgent yet.
    await tap(demo.getByRole('button', { name: 'Inspect 5 seconds' }))
    await tap(opener)
    await expect(dialog).toBeVisible()
    await expect(page.locator('.clr-crt-field')).toHaveCount(1)
    await dialogA11y(page)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await page.clock.pauseAt(ENTRY + 10_000)

    await tap(demo.getByRole('button', { name: 'Inspect 5 seconds' }))
    await tap(demo.getByRole('button', { name: 'Run countdown' }))
    await expect(page.locator('[data-countdown-edge]')).toHaveCount(1)
    await opener.focus()
    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Close log' })).toBeFocused()
    await expect(dialog.getByText('Close log', { exact: true })).toHaveCount(0)
    await expect.poll(async () => (await compose(page)).edges[0]?.host).toBe('dialog:open')

    let frame = await compose(page)
    expectOneGlass(frame, 'log over the warning', 'running')
    expectBalancedBackdrop(frame, 'Log set', 'log over the warning')
    expectOneEdge(frame, 'dialog:open', 'log over the warning')
    expect(frame.urgentTimers, 'the warning in the log and behind it').toHaveLength(2)
    expect(await edgeIsTopmost(page), 'the edge paints above the frame').toEqual([true, true, true, true, true, true])
    const echo = await frameEcho(page)
    expect(echo).toMatchObject({ rear: true, rearFirst: true, rearHidden: 'true', rearPointer: 'none', filtered: 'url("#clr-phosphor-echo")' })
    expect(echo!.rearBox).toEqual(echo!.frameBox)
    expect(echo!.rearInk, 'the rear is the frame\'s own role colour').toEqual(echo!.frameInk)
    const overFrame = await glassOver(page, dialog.locator('[data-logging-frame] p').first())
    expectGlassOver(overFrame, 'log frame')
    await attach(page, 'gallery-urgency-log-composed-phone-390')

    // Effects off: the glass and the rear go; the Balanced backdrop and the warning stay.
    await setEffects(page, 'off')
    await expect(page.locator('.clr-crt-field')).toHaveCount(0)
    frame = await compose(page)
    expectEffectsOff(frame, 'gallery effects off')
    expectBalancedBackdrop(frame, 'Log set', 'gallery effects off')
    expectOneEdge(frame, 'dialog:open', 'gallery effects off')
    expect((await frameEcho(page))?.rear).toBe(false)
    await attach(page, 'gallery-urgency-log-effects-off-phone-390')
    await setEffects(page, 'on')
    await expect(page.locator('.clr-crt-field')).toHaveCount(1)
    expectGlassOver(await glassOver(page, dialog.locator('[data-logging-frame] p').first()), 'gallery effects on again')
    await expect.poll(async () => (await frameEcho(page))?.rear).toBe(true)

    // Escape closes the log: focus returns to its opener, the edge to the body, one glass remains.
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()
    await expect.poll(async () => (await compose(page)).edges[0]?.host).toBe('body')
    frame = await compose(page)
    expectOneGlass(frame, 'log closed', 'running')
    expectOneEdge(frame, 'body', 'log closed')
    expect(frame.urgentTimers, 'a closed log holds no second warning').toHaveLength(1)

    // Run out: the warning cleans up.
    await pass(page, 6)
    await expect(page.locator('[data-countdown-edge]')).toHaveCount(0)
    await attachJson('gallery-glass-reading', { overFrame })
    expect(gallery.requests, 'the gallery reads and writes nothing over the network').toEqual([])
  })

  test('JOURNEY-033 reduced motion phone-320: the app\'s Reduce motion and the device setting each hold the glass still in place, the edge at a steady .5 and the backdrop without its fade, over the long log and the warning', async ({ page, visit }) => {
    test.setTimeout(120_000)
    await page.setViewportSize(PHONE_320)
    const gallery = await galleryVisit(page, { appReduceMotion: true })
    await page.clock.install({ time: ENTRY })

    // The app's own Reduce motion: the long ladder log.
    await visit('/gallery/refinements?state=ladder-long')
    await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', '')
    await tap(page.getByRole('button', { name: 'Open long ladder results' }))
    const ladder = page.getByRole('dialog', { name: 'Ladder · 12 rounds' })
    await expect(ladder).toBeVisible()
    let frame = await compose(page)
    expectOneGlass(frame, 'app reduce motion', 'paused')
    expectBalancedBackdrop(frame, 'Ladder · 12 rounds', 'app reduce motion', true)
    expectGlassOver(await glassOver(page, ladder.locator('[data-logging-head]')), 'long log header')
    await attach(page, 'gallery-ladder-long-reduced-phone-320')
    await page.keyboard.press('Escape')
    await expect(ladder).toBeHidden()

    // The warning under the log: still, everywhere.
    await visit('/gallery/refinements?state=urgency')
    await page.clock.pauseAt(ENTRY + 10_000)
    const demo = page.locator('[data-gallery-deadline-warning]')
    await tap(demo.getByRole('button', { name: 'Inspect 5 seconds' }))
    await tap(demo.getByRole('button', { name: 'Run countdown' }))
    await tap(demo.getByRole('button', { name: 'Open log over the warning' }))
    await expect(page.getByRole('dialog', { name: 'Log set' })).toBeVisible()
    await expect.poll(async () => (await compose(page)).edges[0]?.host).toBe('dialog:open')
    frame = await compose(page)
    expectOneGlass(frame, 'reduced warning', 'paused')
    expectBalancedBackdrop(frame, 'Log set', 'reduced warning', true)
    expectOneEdge(frame, 'dialog:open', 'reduced warning', true)
    expect(await page.evaluate(() => document.getAnimations()
      .filter((animation) => (animation as CSSAnimation).animationName === 'clr-deadline-breathe').length)).toBe(0)
    await attach(page, 'gallery-urgency-reduced-phone-320')
    await page.keyboard.press('Escape')

    // The device setting alone (the app choice cleared): the same stillness.
    await page.evaluate(() => {
      localStorage.setItem('clear.reduce-motion', 'off')
      window.dispatchEvent(new StorageEvent('storage', { key: 'clear.reduce-motion' }))
    })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.locator('html')).not.toHaveAttribute('data-reduce-motion', '')
    await tap(demo.getByRole('button', { name: 'Open log over the warning' }))
    await expect.poll(async () => (await compose(page)).edges[0]?.host).toBe('dialog:open')
    frame = await compose(page)
    expectOneGlass(frame, 'device reduced motion', 'paused')
    expectBalancedBackdrop(frame, 'Log set', 'device reduced motion', true)
    expectOneEdge(frame, 'dialog:open', 'device reduced motion', true)

    // Motion allowed again: the same glass resumes in place and the warning breathes.
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expect.poll(async () => (await compose(page)).fields[0]?.motion).toBe('running')
    frame = await compose(page)
    expectOneGlass(frame, 'motion allowed', 'running')
    expectOneEdge(frame, 'dialog:open', 'motion allowed')
    expect(gallery.requests).toEqual([])
  })

  for (const skin of SKINS) {
    test(`JOURNEY-033 skin ${skin} phone-390: the long log composed — Balanced backdrop, Echo rear in the frame's own role colour, one glass over a readable foreground`, async ({ page, visit }) => {
      test.setTimeout(90_000)
      await page.setViewportSize(PHONE_390)
      const gallery = await galleryVisit(page, { skin })
      await visit('/gallery/refinements?state=ladder-long')
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
      await tap(page.getByRole('button', { name: 'Open long ladder results' }))
      const ladder = page.getByRole('dialog', { name: 'Ladder · 12 rounds' })
      await expect(ladder).toBeVisible()
      await expect(ladder.getByRole('button', { name: 'Close log' })).toBeFocused()
      const frame = await compose(page)
      expectOneGlass(frame, skin, 'running')
      expectBalancedBackdrop(frame, 'Ladder · 12 rounds', skin)
      await expect.poll(async () => (await frameEcho(page))?.rear).toBe(true)
      const echo = await frameEcho(page)
      expect(echo!.rearBox).toEqual(echo!.frameBox)
      expect(echo!.rearInk, `${skin}: the rear is the frame's own role colour`).toEqual(echo!.frameInk)
      const overHeader = await glassOver(page, ladder.locator('[data-logging-head]'))
      expectGlassOver(overHeader, `${skin} header`)
      await dialogA11y(page)
      await attach(page, `gallery-ladder-long-${skin}-phone-390`)
      await attachJson(`glass-${skin}`, { overHeader, echo })
      expect(gallery.requests).toEqual([])
    })
  }
})
