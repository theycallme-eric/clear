import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { namespaceId } from '../../scripts/e2e/namespace.mjs'
import { makeSessionRow } from '../../src/test/factories'
import { suggestionDay } from '../../src/state/session-suggestion'
import { test as authenticatedTest, expect } from '../support/authenticated-session'
import { backend } from '../support/backend'
import { captureIdentity, capturePairId } from './capture'
import { installDeterministicCapture, playwrightCaptureDriver } from './fixtures'
import {
  baselineEntry, BASELINE_INVENTORY_PATH, CAPTURE_SKINS, CAPTURE_VIEWPORTS,
  isProtectedPath, readBaselineInventory, VIEWPORT_OF_PROJECT,
  type CaptureSkin, type CaptureViewportId,
} from './state-inventory'

/**
 * REQ-007/008/015/016/017/021/029/030 / TASK-034 — the entry and form group's
 * AFTER evidence: boot, Welcome, sign-in, onboarding, Generate and its loading
 * screen, on the installed 0.14.3 package.
 *
 * Every picture is of the real app on its real route, taken only after the
 * route, heading and state were asserted. Each is bound to the TASK-001 state
 * it shows and to TASK-040's BEFORE picture of the same state where one exists.
 * Auth is genuine; model POSTs are held and answered locally, never forwarded,
 * so nothing here is live generation or deployed proof.
 *
 * A case's record and pictures are written under `EVIDENCE_DIR` the first time
 * it passes and left alone afterwards: a committed record names the tree it was
 * taken from and is never rebound to a later run.
 */
const EVIDENCE_DIR = 'docs/design/evidence-0143/entry-forms'
const BEFORE_MANIFEST = 'docs/design/0143-intake-baseline/manifest.json'
const BEFORE_DIR = 'docs/design/0143-intake-baseline/screenshots'
const SOURCE_FILE = 'e2e/design-0143/entry-forms.spec.ts'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}
const REST = '**/rest/v1/**'
const SKIN_KEY = 'clear.skin'
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const heading = (page: Page, name: string) =>
  expect(page.locator('main h1')).toHaveAccessibleName(name, { timeout: 30_000 })
const pathname = (page: Page) => new URL(page.url()).pathname
const visibleText = (page: Page, text: string | RegExp) =>
  expect(page.getByText(text, { exact: typeof text === 'string' }).first()).toBeVisible()

async function answer(route: Route, status: number, body: unknown) {
  await route.fulfill({ status, headers: CORS, json: body })
}
const serverFailure = { code: 'PGRST000', message: 'Controlled capture failure', details: null }
function deferred() {
  let release!: () => void
  const wait = new Promise<void>((done) => { release = done })
  return { wait, release }
}
function dayAgo(days: number) {
  const [year, month, date] = suggestionDay().split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date - days)).toISOString().slice(0, 10)
}

interface BeforeCapture {
  screen: string
  route: string | null
  state: string
  variant: string | null
  screenshot: { name: string; sha256: string }
}
const beforeCaptures = (JSON.parse(readFileSync(resolve(process.cwd(), BEFORE_MANIFEST), 'utf8')) as {
  supplemental: { captures: BeforeCapture[] }
}).supplemental.captures

/** TASK-040's picture of the same state; a like-named variant first, else the state's first. */
function beforeOf(screen: string, route: string | null, state: string, variant: string) {
  const same = beforeCaptures.filter((c) => c.screen === screen && c.route === route && c.state === state)
  const match = same.find((c) => (c.variant ?? '') === variant) ?? same[0]
  return match
    ? { directory: BEFORE_DIR, screenshot: match.screenshot.name, sha256: match.screenshot.sha256,
        variant: match.variant }
    : null
}

type Assertion = () => Promise<void>
interface ShotOptions {
  /** A discriminator when one state is pictured more than once. */
  readonly variant?: string
  /** Also picture the state in the other three skins (phone project only). */
  readonly skins?: boolean
  /** Also picture it at 390x320 with this action still reachable (phone project only). */
  readonly short?: Locator
}
interface Evidence {
  /** Assert, then picture, the state the browser is in at `at`. */
  shot(screen: string, route: string | null, state: string, at: string, title: string,
    assertState: Assertion, options?: ShotOptions): Promise<void>
  note(kind: 'keyboard' | 'motion' | 'contract' | 'discrepancy' | 'fixture', text: string,
    data?: unknown): void
  disposition(screen: string, route: string | null, state: string, reason: string,
    sources: string[]): void
  readonly phone: boolean
  modelAttempts(): number
}

const test = authenticatedTest.extend<{ evidence: Evidence }>({
  evidence: async ({ page }, use, testInfo) => {
    const projectViewport = VIEWPORT_OF_PROJECT[testInfo.project.name]
    if (!projectViewport) throw new Error('TASK-034 expects an existing named viewport project')
    const phone = projectViewport === 'phone'
    let viewport: CaptureViewportId = projectViewport
    let skin: CaptureSkin = 'clear'
    const guard = await installDeterministicCapture(page, { skin })
    const identity = captureIdentity()
    expect(identity.packageVersion, 'after evidence is taken on the imported package').toBe('0.14.3')
    const inventory = readBaselineInventory()
    const driver = playwrightCaptureDriver(page, testInfo)
    const caseKey = slug(testInfo.title.split(':')[0])

    let modelAttempts = 0
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/functions\/v1\/generate-/.test(new URL(request.url()).pathname)) {
        modelAttempts += 1
      }
    })

    const captures: unknown[] = []
    const observations: unknown[] = []
    const dispositions: unknown[] = []
    const pictures = new Map<string, Uint8Array>()

    const ref = (screen: string, route: string | null, state: string) => {
      if (!baselineEntry(inventory, screen, route)?.states.includes(state)) {
        throw new Error(`No recorded baseline state: ${screen} ${route} ${state}`)
      }
      return { task: inventory.task, inventory: BASELINE_INVENTORY_PATH, mainSha: inventory.mainSha,
        screen, route, state }
    }
    const setSkin = async (next: CaptureSkin) => {
      // What the package's own `setSkin` does: the stored key and the attribute.
      await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value),
        { key: SKIN_KEY, value: next })
      await page.evaluate(({ key, value }) => {
        window.localStorage.setItem(key, value)
        document.documentElement.setAttribute('data-skin', value)
      }, { key: SKIN_KEY, value: next })
      skin = next
    }
    const setViewport = async (next: CaptureViewportId) => {
      const size = CAPTURE_VIEWPORTS.find((candidate) => candidate.id === next)!
      await page.setViewportSize({ width: size.width, height: size.height })
      viewport = next
    }
    const take = async (screen: string, route: string | null, state: string, at: string,
      title: string, assertState: Assertion, variant: string) => {
      const baseline = ref(screen, route, state)
      expect(pathname(page), `${screen} "${state}" is pictured at ${at}`).toBe(at)
      await heading(page, title)
      if (isProtectedPath(at)) {
        // A protected route that fell back to Welcome is a failure, not a picture.
        await expect(page.getByRole('button', { name: 'Get started', exact: true })).toHaveCount(0)
      }
      await assertState()
      const size = CAPTURE_VIEWPORTS.find((candidate) => candidate.id === viewport)!
      expect(page.viewportSize()).toEqual({ width: size.width, height: size.height })
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        `${screen} "${state}" overflows the ${viewport} viewport sideways`).toBe(true)
      // A picture of a half-entered step is evidence of nothing. Entrances and
      // state changes end; only a loader's endless loop may still be running.
      await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) =>
        animation.playState === 'running' &&
        Number.isFinite(Number(animation.effect?.getComputedTiming().endTime))).length),
      { message: `${screen} "${state}" never came to rest` }).toBe(0)
      const motion = await driver.motion()
      const name = [caseKey, slug(screen), slug(state), variant ? slug(variant) : null, viewport, skin]
        .filter(Boolean).join('--') + '.png'
      if (pictures.has(name)) throw new Error(`${name} was pictured twice`)
      const bytes = await page.screenshot({ caret: 'hide', scale: 'css' })
      pictures.set(name, bytes)
      captures.push({
        phase: 'after', kind: route === null ? 'non-route-surface' : 'route-state',
        pairId: capturePairId({ screen, route: route ?? 'surface', state }, viewport, skin),
        screen, route, state, variant: variant || null, baseline,
        before: beforeOf(screen, route, state, variant),
        viewport: size, skin, reached: { pathname: at, heading: title, stateVisible: true }, motion,
        screenshot: { name, sha256: createHash('sha256').update(bytes).digest('hex'),
          bytes: bytes.byteLength, explicit: true },
        deterministic: true, liveGeneration: false,
      })
    }

    const evidence: Evidence = {
      phone,
      async shot(screen, route, state, at, title, assertState, options = {}) {
        const variant = options.variant ?? ''
        await take(screen, route, state, at, title, assertState, variant)
        if (!phone) return
        if (options.skins) {
          for (const next of CAPTURE_SKINS.filter((candidate) => candidate !== 'clear')) {
            await setSkin(next)
            await take(screen, route, state, at, title, assertState, variant)
          }
          await setSkin('clear')
        }
        if (options.short) {
          const action = options.short
          await setViewport('short')
          await take(screen, route, state, at, title, async () => {
            await assertState()
            await action.scrollIntoViewIfNeeded()
            await expect(action).toBeInViewport()
            // The page itself never scrolls; the screen's own region does.
            expect(await page.evaluate(() =>
              document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true)
          }, variant)
          await setViewport('phone')
        }
      },
      note(kind, text, data) {
        // A state re-asserted per skin or viewport says the same thing once.
        if (observations.some((seen) => (seen as { text: string }).text === text)) return
        observations.push({ kind, text, ...(data === undefined ? {} : { data }) })
      },
      disposition(screen, route, state, reason, sources) {
        dispositions.push({ kind: 'source-branch-disposition', baseline: ref(screen, route, state),
          reason, sources, renderedClaim: false })
      },
      modelAttempts: () => modelAttempts,
    }

    await use(evidence)

    const record = {
      version: 1, task: 'TASK-034', issue: 380, consumer: 'entry-forms', phase: 'after',
      caseTitle: testInfo.title, project: testInfo.project.name, sourceFile: SOURCE_FILE,
      identity, status: testInfo.status, captures, observations, dispositions,
      generation: { requests: modelAttempts, forwardedToProvider: 0,
        blockedUnexpected: guard.blockedGenerations() },
      deterministic: true, liveGeneration: false, deployedProof: false,
    }
    const attached = testInfo.outputPath('entry-forms-record.json')
    writeFileSync(attached, JSON.stringify(record, null, 2))
    await testInfo.attach('entry-forms-record', { path: attached, contentType: 'application/json' })
    expect(guard.blockedGenerations(), 'a model POST escaped its local answer').toBe(0)

    const committed = resolve(process.cwd(), EVIDENCE_DIR, 'records', `${testInfo.project.name}--${caseKey}.json`)
    if (testInfo.status === 'passed' && !existsSync(committed)) {
      mkdirSync(resolve(process.cwd(), EVIDENCE_DIR, 'records'), { recursive: true })
      mkdirSync(resolve(process.cwd(), EVIDENCE_DIR, 'screenshots'), { recursive: true })
      for (const [name, bytes] of pictures) {
        writeFileSync(resolve(process.cwd(), EVIDENCE_DIR, 'screenshots', name), bytes)
      }
      writeFileSync(committed, `${JSON.stringify(record, null, 2)}\n`)
      await indexRecords()
    }
  },
})

interface CaseRecord {
  project: string
  caseTitle: string
  status: string
  identity: unknown
  captures: Array<{ screen: string; route: string | null; state: string; skin: string
    viewport: { id: string }; before: { screenshot: string } | null
    motion: { settled: boolean; running: string[] }; screenshot: { name: string } }>
  observations: Array<{ kind: string; text: string; data?: unknown }>
  dispositions: unknown[]
  generation: { requests: number; forwardedToProvider: number; blockedUnexpected: number }
}

/**
 * `manifest.json` is derived from every record present, never written by hand.
 * Workers finish in parallel, so the read-and-write is taken one at a time.
 */
async function indexRecords() {
  const root = resolve(process.cwd(), EVIDENCE_DIR)
  const lock = resolve(root, '.indexing')
  for (let attempt = 0; ; attempt += 1) {
    try { mkdirSync(lock); break } catch (error) {
      if (attempt > 200) throw error
      await new Promise((retry) => setTimeout(retry, 50))
    }
  }
  try {
    const records = readdirSync(resolve(root, 'records')).filter((name) => name.endsWith('.json')).sort()
      .map((name) => JSON.parse(readFileSync(resolve(root, 'records', name), 'utf8')) as CaseRecord)
    const all = records.flatMap((entry) => entry.captures)
    const unique = <T>(values: T[]) => [...new Set(values.map((value) => JSON.stringify(value)))].sort()
      .map((value) => JSON.parse(value) as T)
    const tally = (key: (capture: CaseRecord['captures'][number]) => string) =>
      Object.fromEntries(unique(all.map(key)).map((id) => [id, all.filter((capture) => key(capture) === id).length]))
    const sum = (key: keyof CaseRecord['generation']) =>
      records.reduce((total, entry) => total + entry.generation[key], 0)
    const stateKey = (capture: CaseRecord['captures'][number]) =>
      ({ screen: capture.screen, route: capture.route, state: capture.state })
    writeFileSync(resolve(root, 'manifest.json'), `${JSON.stringify({
      version: 1, task: 'TASK-034', issue: 380, consumer: 'entry-forms', phase: 'after',
      sourceFile: SOURCE_FILE, identity: unique(records.map((entry) => entry.identity)),
      deterministic: true, liveGeneration: false, deployedProof: false,
      screenshotDirectory: `${EVIDENCE_DIR}/screenshots`, beforeDirectory: BEFORE_DIR,
      run: {
        cases: records.map((entry) => ({ project: entry.project, caseTitle: entry.caseTitle,
          status: entry.status, captures: entry.captures.length })),
        generation: { requests: sum('requests'), forwardedToProvider: sum('forwardedToProvider'),
          blockedUnexpected: sum('blockedUnexpected') },
      },
      matrix: {
        captures: all.length,
        withBeforePicture: all.filter((capture) => capture.before !== null).length,
        withoutBeforePicture: unique(all.filter((capture) => capture.before === null).map(stateKey)),
        byViewport: tally((capture) => capture.viewport.id),
        bySkin: tally((capture) => capture.skin),
        byScreen: tally((capture) => capture.screen),
        stillMovingAtCapture: all.filter((capture) => !capture.motion.settled)
          .map((capture) => ({ screenshot: capture.screenshot.name, running: capture.motion.running })),
      },
      states: unique(all.map(stateKey)).map((state) => {
        const same = all.filter((capture) => JSON.stringify(stateKey(capture)) === JSON.stringify(state))
        return { ...state, before: unique(same.flatMap((capture) => capture.before ? [capture.before.screenshot] : [])),
          after: same.map((capture) => capture.screenshot.name).sort() }
      }),
      dispositions: unique(records.flatMap((entry) => entry.dispositions)),
      observations: unique(records.flatMap((entry) => entry.observations.map(({ kind, text }) => ({ kind, text }))))
        .map((seen) => {
          const cases = records.filter((entry) => entry.observations.some((own) => own.text === seen.text))
          return { ...seen, projects: unique(cases.map((entry) => entry.project)),
            data: cases[0].observations.find((own) => own.text === seen.text)?.data ?? null }
        }),
    }, null, 2)}\n`)
  } finally { rmSync(lock, { recursive: true }) }
}

// ── What the browser actually rendered ─────────────────────────────────────

/** A field's frame, label, glyph and unit, measured rather than assumed. */
function fieldProbe(control: Locator) {
  return control.evaluate((element) => {
    const el = element as HTMLInputElement | HTMLTextAreaElement
    const frame = el.closest<HTMLElement>('.clr-field')
    const label = el.labels?.[0] ?? null
    const box = frame?.getBoundingClientRect()
    const labelBox = label?.getBoundingClientRect()
    const glyph = frame?.querySelector<HTMLElement>('.clr-field__glyph') ?? null
    const unit = frame?.querySelector<HTMLElement>('.clr-field__unit') ?? null
    const style = getComputedStyle(el)
    return {
      framed: frame !== null && frame !== undefined && frame.classList.contains('clr-chamfer') &&
        frame.parentElement?.classList.contains('clr-bleed') === true,
      radius: frame ? getComputedStyle(frame).borderRadius : null,
      labelAbove: !!box && !!labelBox && labelBox.height > 0 && labelBox.bottom <= box.top + 1,
      inViewport: !!box && box.left >= 0 && box.right <= window.innerWidth + 1,
      rawOverride: !!frame && (frame.style.width !== '' || frame.style.minWidth !== '' || el.style.minWidth !== '0px'),
      glyph: glyph !== null && glyph.getBoundingClientRect().width > 0 &&
        glyph.getAttribute('aria-hidden') === 'true',
      unit: unit === null ? null : {
        text: unit.textContent,
        insideFrame: !!box && unit.getBoundingClientRect().right <= box.right + 1 &&
          unit.getBoundingClientRect().left >= box.left,
        selectable: getComputedStyle(unit).userSelect !== 'none',
        editable: unit.isContentEditable || unit.matches('input, textarea'),
        describes: (el.getAttribute('aria-describedby') ?? '').split(' ').includes(unit.id),
      },
      resize: style.resize,
      fieldSizing: style.getPropertyValue('field-sizing'),
      clipped: el.scrollHeight > el.clientHeight + 1,
      height: el.getBoundingClientRect().height,
    }
  })
}

/** Segments are lit or not; a determinate bar has no overlaid fill. */
function progressProbe(bar: Locator) {
  return bar.evaluate((el) => {
    const segments = Array.from(el.children).filter((child) => !child.hasAttribute('aria-hidden')) as HTMLElement[]
    return {
      segments: segments.length,
      lit: segments.filter((segment) => segment.style.background === 'var(--surface-thumb)').length,
      unlit: segments.filter((segment) => segment.style.background === 'var(--surface-track)').length,
      sized: segments.some((segment) => segment.style.width !== ''),
      overlay: el.querySelectorAll(':scope > [aria-hidden="true"]').length,
      now: el.getAttribute('aria-valuenow'), max: el.getAttribute('aria-valuemax'),
    }
  })
}

/** A chip's second cue (tick) and where its label sits. */
function chipProbe(chip: Locator) {
  return chip.evaluate((el) => {
    const tick = el.querySelector('svg')
    const tickBox = tick?.getBoundingClientRect()
    const range = document.createRange()
    const text = Array.from(el.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE || node.nodeName !== 'svg').pop()!
    range.selectNodeContents(text)
    const label = range.getBoundingClientRect()
    const box = el.getBoundingClientRect()
    return {
      chamfered: el.classList.contains('clr-chamfer') && el.classList.contains('clr-chip'),
      tickWidth: tickBox?.width ?? 0,
      tickOpacity: tick ? Number(getComputedStyle(tick).opacity) : 0,
      labelOffCentre: Math.abs((label.left + label.right) / 2 - (box.left + box.right) / 2),
      height: box.height,
    }
  })
}

/** The checked mark is a solid 10px square, never a glyph or a rounded dot. */
function checkProbe(checkbox: Locator) {
  return checkbox.evaluate((el) => {
    const box = el.parentElement?.querySelector('.clr-check__box')
    const mark = box ? getComputedStyle(box, '::after') : null
    const frame = box ? getComputedStyle(box) : null
    return {
      content: mark?.content ?? null, width: mark?.width ?? null, height: mark?.height ?? null,
      markRadius: mark?.borderRadius ?? null, boxRadius: frame?.borderRadius ?? null,
      solid: !!mark && mark.backgroundColor !== 'rgba(0, 0, 0, 0)' && mark.backgroundImage === 'none',
      target: el.getBoundingClientRect().width,
    }
  })
}

/** The installed stylesheet's slider thumb: a pseudo-element cannot be measured directly. */
function sliderProbe(slider: Locator) {
  return slider.evaluate((element) => {
    const el = element as HTMLInputElement
    const label = el.labels?.[0] ?? null
    const thumbs: Array<{ width: string; height: string; radius: string }> = []
    const walk = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule && rule.selectorText === '.clr-slider::-webkit-slider-thumb') {
          thumbs.push({ width: rule.style.width, height: rule.style.height, radius: rule.style.borderRadius })
        } else if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules)
      }
    }
    for (const sheet of Array.from(document.styleSheets)) {
      try { walk(sheet.cssRules) } catch { /* a foreign sheet has no thumb rule of ours */ }
    }
    return {
      labelAbove: !!label && label.getBoundingClientRect().bottom <= el.getBoundingClientRect().top + 1,
      readoutInLabel: !!label?.querySelector('output'),
      thumbs,
      radius: getComputedStyle(el).borderRadius,
    }
  })
}

/** Which focus treatment the focused control got: its own border, or the bracket layer. */
function focusProbe(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null
    const bracket = document.querySelector('.clr-focus-brackets')
    return {
      mode: document.documentElement.getAttribute('data-clr-focus'),
      tag: active?.tagName.toLowerCase() ?? null,
      role: active?.getAttribute('role') ?? null,
      name: active?.getAttribute('aria-label') ?? active?.textContent?.trim().slice(0, 40) ?? null,
      layers: document.querySelectorAll('.clr-focus-brackets').length,
      bracketOpacity: bracket ? Number(getComputedStyle(bracket).opacity) : 0,
    }
  })
}

const expectFramedField = async (control: Locator, where: string) => {
  const probe = await fieldProbe(control)
  expect(probe, where).toMatchObject({ framed: true, radius: '0px', labelAbove: true,
    inViewport: true, rawOverride: false })
  return probe
}

// ENV-07: the Preview lane has no privileged backend credentials. Register only
// these backend-dependent cases as ineligible there, before their fixtures run.
// The original credentialed task verification still runs all 24 cases unchanged.
const backendTest = backend.available ? test : test.skip

// ── Welcome and sign-in ────────────────────────────────────────────────────

test('welcome-auth: Welcome, credentials, code errors, busy and disabled states', async ({ page, visit, evidence }) => {
  test.setTimeout(150_000)
  let otpPosts = 0
  let verifyPosts = 0
  let otpStatus = 500
  let verifyExpired = false
  let otpHold = deferred()
  const verifyHold = deferred()
  let authenticatedReads = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.includes('/rest/v1/')) authenticatedReads += 1
  })
  evidence.note('fixture', 'OTP delivery is held and answered locally; verify negatives are typed boundary answers. No sample auth screen is involved.')
  await page.route('**/auth/v1/otp', async (route) => {
    if (route.request().method() !== 'POST') return answer(route, 204, null)
    otpPosts += 1
    await otpHold.wait
    await answer(route, otpStatus, otpStatus === 200 ? {} : { message: 'Controlled send failure' })
  })
  await page.route('**/auth/v1/verify', async (route) => {
    if (route.request().method() !== 'POST') return answer(route, 204, null)
    verifyPosts += 1
    await verifyHold.wait
    await answer(route, 400, verifyExpired ? { error_code: 'otp_expired' } : { message: 'Controlled invalid code' })
  })
  try {
    await visit('/welcome')
    // U14: one Get started entry serves new and returning accounts.
    const getStarted = page.getByRole('button', { name: 'Get started', exact: true })
    await evidence.shot('Welcome', '/welcome', 'anonymous-ready', '/welcome', 'CLEAR', async () => {
      const tagline = page.getByText('Strength training, simplified.', { exact: true })
      await expect(tagline).toBeVisible()
      await expect(getStarted).toBeEnabled()
      // The line sits in the current card, below the logo that names the screen.
      const placed = await tagline.evaluate((el) => ({
        carded: el.closest('.clr-card') !== null,
        belowLogo: el.getBoundingClientRect().top >=
          document.querySelector('main h1')!.getBoundingClientRect().bottom - 1,
      }))
      expect(placed).toEqual({ carded: true, belowLogo: true })
      // No kit placeholder health checks, and no progress for a ready anonymous boot.
      await expect(page.getByRole('progressbar')).toHaveCount(0)
      await expect(page.getByText(/System check/)).toHaveCount(0)
    }, { skins: true, short: getStarted })
    expect(authenticatedReads, 'an anonymous boot made an authenticated initialization read').toBe(0)
    evidence.note('contract', 'Anonymous boot reached Welcome with zero /rest/v1 initialization reads.',
      { restRequests: authenticatedReads })

    if (evidence.phone) {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await visit('/welcome')
      await expect(getStarted).toBeEnabled()
      const running = await page.evaluate(() =>
        document.getAnimations().filter((animation) => animation.playState === 'running').length)
      expect(running, 'reduced motion left Welcome animating').toBe(0)
      await evidence.shot('Welcome', '/welcome', 'anonymous-ready', '/welcome', 'CLEAR',
        () => expect(getStarted).toBeEnabled(), { variant: 'reduced-motion' })
      evidence.note('motion', 'Under prefers-reduced-motion the anonymous boot hands off to Welcome with no running animation or transition.',
        { running })
      await page.emulateMedia({ reducedMotion: 'no-preference' })
    }

    await page.locator('main .clr-scroll-region__scroller').focus()
    await page.keyboard.press('Tab')
    await expect(getStarted).toBeFocused()
    const welcomeFocus = await focusProbe(page)
    expect(welcomeFocus.layers, 'one bracket layer').toBe(1)
    evidence.note('keyboard', 'Tab from the Welcome content region moves to Get started; the root bracket layer follows it.', welcomeFocus)

    await getStarted.click()
    const email = page.getByLabel('Email')
    const send = page.getByRole('button', { name: 'Send code', exact: true })
    await evidence.shot('OTP Login', '/login', 'email-step', '/login', 'Get started', async () => {
      await expect(email).toBeVisible()
      const probe = await expectFramedField(email, 'the Email field')
      expect(probe.glyph, 'a valid field shows no warning glyph').toBe(false)
    }, { short: send })
    await email.focus()
    const emailFocus = await focusProbe(page)
    expect(emailFocus.bracketOpacity, 'a text field summoned the bracket layer').toBe(0)
    evidence.note('keyboard', 'The Email field owns its focus: its frame lights and the bracket layer stays hidden.', emailFocus)

    await email.fill('wrong')
    await send.click()
    await evidence.shot('OTP Login', '/login', 'email-invalid', '/login', 'Get started', async () => {
      await expect(page.getByRole('alert')).toContainText('That is not an email address.')
      await expect(email).toHaveAttribute('aria-invalid', 'true')
      await expect(email).toBeFocused()
      expect(otpPosts).toBe(0)
      // Severity is not colour alone: the glyph is in the field, in every skin.
      expect((await expectFramedField(email, 'the invalid Email field')).glyph).toBe(true)
    }, { skins: true, short: send })

    await email.fill('clear-e2e-entry-forms@example.com')
    await send.click()
    await evidence.shot('OTP Login', '/login', 'send-busy', '/login', 'Get started', () =>
      expect(send).toHaveAttribute('aria-busy', 'true'))
    otpHold.release()
    await evidence.shot('OTP Login', '/login', 'send-error', '/login', 'Get started', async () => {
      await expect(page.getByRole('alert')).toContainText('Sign-in is unavailable right now.')
      await expect(email).toHaveValue('clear-e2e-entry-forms@example.com')
      await expect(email).not.toHaveAttribute('aria-invalid', 'true')
      await expect(send).toBeEnabled()
    })
    otpStatus = 200
    otpHold = deferred()
    otpHold.release()
    await send.click()
    const code = page.getByLabel('Code')
    await evidence.shot('OTP Login', '/login', 'code-step', '/login', 'Get started', async () => {
      await expect(code).toBeFocused()
      await expectFramedField(code, 'the Code field')
    })
    const resend = page.getByRole('button', { name: /^Resend in \d+s$/ })
    await evidence.shot('OTP Login', '/login', 'resend-cooldown', '/login', 'Get started', () =>
      expect(resend).toBeDisabled(), { skins: true })
    await code.fill('12')
    const verify = page.getByRole('button', { name: 'Verify', exact: true })
    await verify.click()
    await evidence.shot('OTP Login', '/login', 'code-invalid', '/login', 'Get started', async () => {
      await expect(code).toHaveAttribute('aria-invalid', 'true')
      await expect(code).toBeFocused()
      expect(verifyPosts).toBe(0)
      expect((await expectFramedField(code, 'the invalid Code field')).glyph).toBe(true)
    })
    await code.fill('123456')
    await verify.click()
    await evidence.shot('OTP Login', '/login', 'verify-busy', '/login', 'Get started', () =>
      expect(verify).toHaveAttribute('aria-busy', 'true'))
    verifyHold.release()
    await evidence.shot('OTP Login', '/login', 'wrong-code', '/login', 'Get started', async () => {
      await expect(page.getByRole('alert')).toContainText('That code is not right.')
      await expect(code).toBeFocused()
      // The failed attempt keeps its context and its way out.
      await expect(code).toHaveValue('123456')
      await visibleText(page, /clear-e2e-entry-forms@example\.com/)
    }, { short: verify })
    verifyExpired = true
    await verify.click()
    await evidence.shot('OTP Login', '/login', 'expired-code', '/login', 'Get started', async () => {
      await expect(page.getByRole('alert')).toContainText('That code has expired.')
      await expect(code).toBeFocused()
    })
    expect(evidence.modelAttempts()).toBe(0)
  } finally { otpHold.release(); verifyHold.release() }
})

// ── Onboarding ─────────────────────────────────────────────────────────────

/** A new user through the real public verification, as the critical lane does it. */
async function enterNewUser(page: Page, visit: (path: string) => Promise<void>, email: string,
  client: ReturnType<typeof backend.client>) {
  await page.route('**/auth/v1/otp', (route) => answer(route, 200, {}))
  await visit('/welcome')
  await page.getByRole('button', { name: 'Get started', exact: true }).click()
  await heading(page, 'Get started')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Send code', exact: true }).click()
  await expect(page.getByLabel('Code')).toBeFocused()
  const { emailOtp } = await client.generateOneTimeCode(email)
  // A boolean only; a code or an auth response never reaches the report.
  expect(/^\d{6,10}$/.test(emailOtp ?? ''), 'no numeric project-issued code').toBe(true)
  await page.getByLabel('Code').fill(emailOtp)
  const verified = page.waitForResponse((response) => response.request().method() === 'POST' &&
    new URL(response.url()).pathname.endsWith('/auth/v1/verify'))
  await page.getByRole('button', { name: 'Verify', exact: true }).click()
  expect((await verified).status()).toBe(200)
  await heading(page, 'Set up CLEAR')
  await expect(page).toHaveURL((url) => url.pathname === '/onboarding')
}

async function newUser(project: string, purpose: string) {
  expect(backend.available, backend.reason).toBe(true)
  const client = backend.client()
  const email = `clear-e2e-${namespaceId()}-${project}-task034-${purpose}@example.com`
  const prior = await client.findUserByEmail(email)
  if (prior) await client.deleteUser(prior.id)
  await client.ensureConfirmedUser(email)
  return { client, email, async remove() {
    const user = await client.findUserByEmail(email)
    if (user) await client.deleteUser(user.id)
  } }
}

backendTest('onboarding: real new user, every step, selection, kept draft, held commit and retry', async ({ page, visit, evidence }, testInfo) => {
  test.setTimeout(240_000)
  const user = await newUser(testInfo.project.name, 'onboarding')
  const hold = deferred()
  let commitPosts = 0
  let failCommit = true
  evidence.note('fixture', 'A namespaced real new user verified through the public endpoint; the first onboarding commit is held then answered 500, the retry is the genuine RPC.')
  await page.route(REST, async (route) => {
    if (route.request().method() !== 'POST' ||
      !new URL(route.request().url()).pathname.endsWith('/rpc/complete_onboarding')) return route.fallback()
    commitPosts += 1
    if (!failCommit) return route.continue()
    await hold.wait
    await answer(route, 500, serverFailure)
  })
  const at = '/onboarding'
  const step = (name: string) => expect(page.getByRole('heading', { name })).toBeVisible()
  const bar = page.getByRole('progressbar')
  const expectStep = async (n: number) => {
    await expect(bar).toHaveAttribute('aria-valuenow', String(n))
    const probe = await progressProbe(bar)
    // Twenty discrete segments, four per real step, and nothing drawn over them.
    expect(probe).toMatchObject({ segments: 20, lit: n * 4, unlit: 20 - n * 4, sized: false, overlay: 0, max: '5' })
    await visibleText(page, `Step ${n} of 5`)
    return probe
  }
  try {
    await enterNewUser(page, visit, user.email, user.client)
    evidence.note('contract', 'Successful new-user verification landed on /onboarding (existing guard), not Home.')
    const next = page.getByRole('button', { name: 'Next', exact: true })
    const back = page.getByRole('button', { name: 'Back', exact: true })
    await evidence.shot('Onboarding', '/onboarding', 'selection-incomplete-disabled', at, 'Set up CLEAR', async () => {
      await step('What’s your gym setup?')
      await expect(next).toBeDisabled()
      await visibleText(page, 'Choose the setup closest to yours.')
      await expect(page.getByRole('radiogroup')).toHaveCount(1)
      const unselected = await chipProbe(page.getByRole('radio', { name: /^Home gym/ }))
      expect(unselected.chamfered).toBe(true)
      expect(unselected.tickOpacity, 'an unselected chip shows a tick').toBe(0)
      expect(unselected.labelOffCentre, 'an unselected chip label is off centre').toBeLessThanOrEqual(1.5)
      evidence.note('contract', 'Onboarding step 1 of 5 lights 4 of 20 discrete progress segments.', await expectStep(1))
    }, { short: next })

    const homeGym = page.getByRole('radio', { name: /^Home gym/ })
    // The interlace flick is momentary; watch for it rather than race it.
    await homeGym.evaluate((el) => {
      const seen = window as unknown as { __flick?: boolean }
      new MutationObserver(() => { if (el.classList.contains('clr-interlace')) seen.__flick = true })
        .observe(el, { attributes: true, attributeFilter: ['class'] })
    })
    await homeGym.click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __flick?: boolean }).__flick === true),
      { message: 'the chosen chip never took the interlace flick' }).toBe(true)
    await evidence.shot('Onboarding', '/onboarding', 'five-step-draft', at, 'Set up CLEAR', async () => {
      await expect(homeGym).toHaveAttribute('aria-checked', 'true')
      await expect(next).toBeEnabled()
      // Selection is a tick as well as a tint, in every skin.
      await expect.poll(async () => (await chipProbe(homeGym)).tickOpacity).toBe(1)
      expect((await chipProbe(homeGym)).tickWidth).toBeGreaterThan(8)
      // The legend says what is being chosen; the role says one of them.
      await expect(page.getByRole('group', { name: 'Setup' }).or(page.locator('fieldset', { has: page.locator('legend', { hasText: 'Setup' }) })).first()).toBeVisible()
    }, { variant: 'setup-selected', skins: true })

    await homeGym.focus()
    await page.keyboard.press('ArrowRight')
    await expect.poll(async () => (await focusProbe(page)).bracketOpacity,
      { message: 'a selectable control has no brackets' }).toBe(1)
    const roving = await focusProbe(page)
    expect(roving.role, 'arrow keys move within the radio group').toBe('radio')
    evidence.note('keyboard', 'The setup radiogroup is one tab stop; ArrowRight moves focus and selection, and the static bracket layer frames the focused chip.', roving)
    await homeGym.click()
    await expect(homeGym).toHaveAttribute('aria-checked', 'true')

    await next.click()
    await evidence.shot('Onboarding', '/onboarding', 'five-step-draft', at, 'Set up CLEAR', async () => {
      await step('How familiar are you with the gym?')
      await expectStep(2)
    }, { variant: 'experience' })
    await page.getByRole('radio', { name: /^Some experience/ }).click()
    await next.click()
    await page.getByRole('radio', { name: /^Balanced/ }).click()
    const section = page.getByRole('checkbox').first()
    await evidence.shot('Onboarding', '/onboarding', 'five-step-draft', at, 'Set up CLEAR', async () => {
      await step('What are you going for?')
      await expectStep(3)
      await expect(page.getByRole('radio', { name: /^Balanced/ })).toHaveAttribute('aria-checked', 'true')
      const checked = page.getByRole('checkbox', { checked: true }).first()
      await expect(checked).toBeVisible()
      const mark = await checkProbe(checked)
      expect(mark).toMatchObject({ width: '10px', height: '10px', markRadius: '0px', boxRadius: '0px', solid: true })
      expect(mark.content).not.toBe('none')
      expect(mark.target, 'the checkbox target is under 40px').toBeGreaterThanOrEqual(40)
    }, { variant: 'goal', skins: true, short: next })
    const wasChecked = await section.isChecked()
    await section.focus()
    await page.keyboard.press('Space')
    await expect(section).toBeChecked({ checked: !wasChecked })
    const unchecked = await checkProbe(page.getByRole('checkbox', { checked: false }).first())
    expect(unchecked.content, 'an unchecked box shows a mark').toBe('none')
    evidence.note('keyboard', 'Space toggles a focused section checkbox; the checked state is a solid 10px square, the unchecked state has no mark.',
      { focus: await focusProbe(page), unchecked })
    await page.keyboard.press('Space')
    await expect(section).toBeChecked({ checked: wasChecked })
    evidence.note('discrepancy', 'The owned routes render no native RadioButton: every single choice is a ChoiceGroup of Chips with radio semantics. The solid-square mark is therefore proved on the real Checkbox, whose .clr-check__box rule the package RadioButton shares.',
      { source: 'src/design-system/components/Selection/RadioButton.jsx' })

    await next.click()
    const note = page.getByLabel(/Note/)
    await evidence.shot('Onboarding', '/onboarding', 'five-step-draft', at, 'Set up CLEAR', async () => {
      await step('Anything we should work around?')
      await expectStep(4)
      const probe = await expectFramedField(note, 'the limitations note')
      expect(probe).toMatchObject({ resize: 'none', fieldSizing: 'content', clipped: false })
    }, { variant: 'limitations' })
    const emptyHeight = (await fieldProbe(note)).height
    await note.fill(Array.from({ length: 9 }, (_, line) => `Disposable fixture note line ${line + 1}`).join('\n'))
    await evidence.shot('Onboarding', '/onboarding', 'five-step-draft', at, 'Set up CLEAR', async () => {
      const grown = await fieldProbe(note)
      expect(grown.height, 'the textarea did not grow with its content').toBeGreaterThan(emptyHeight + 20)
      expect(grown).toMatchObject({ resize: 'none', clipped: false, inViewport: true })
      await expect(note).toBeFocused()
    }, { variant: 'limitations-multiline-focus', short: page.getByRole('button', { name: /^(Next|Skip)$/ }) })
    await note.fill('Disposable fixture note')
    await page.getByRole('button', { name: /^(Next|Skip)$/ }).click()
    await evidence.shot('Onboarding', '/onboarding', 'five-step-draft', at, 'Set up CLEAR', async () => {
      await step('Here’s your setup')
      await expectStep(5)
      // One card per step: a card is never drawn inside another.
      expect(await page.locator('main .clr-card .clr-card').count()).toBe(0)
    }, { variant: 'confirmation', short: page.getByRole('button', { name: 'Finish setup', exact: true }) })
    await back.click()
    await evidence.shot('Onboarding', '/onboarding', 'back-preserves-draft', at, 'Set up CLEAR', () =>
      expect(note).toHaveValue('Disposable fixture note'))
    await back.click()
    await expect(page.getByRole('radio', { name: /^Balanced/ })).toHaveAttribute('aria-checked', 'true')
    await back.click()
    await expect(page.getByRole('radio', { name: /^Some experience/ })).toHaveAttribute('aria-checked', 'true')
    await back.click()
    await expect(homeGym).toHaveAttribute('aria-checked', 'true')
    await next.click(); await next.click(); await next.click()
    await page.getByRole('button', { name: /^(Next|Skip)$/ }).click()
    await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
    await evidence.shot('Onboarding', '/onboarding', 'committing', at, 'Set up CLEAR', async () => {
      expect(commitPosts).toBe(1)
      await expect(page.locator('main').getByRole('status')).toContainText(/Saving your setup|Taking longer than usual/)
    })
    hold.release()
    await evidence.shot('Onboarding', '/onboarding', 'commit-error-retry', at, 'Set up CLEAR', async () => {
      await visibleText(page, 'Your setup didn’t save')
      await visibleText(page, 'Nothing was stored, and your answers are still here. Try again when you’re ready.')
      await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeEnabled()
    }, { skins: true })
    failCommit = false
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(page).toHaveURL((url) => url.pathname === '/')
    await evidence.shot('Onboarding', '/onboarding', 'success-home', '/', 'Today', () =>
      expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeEnabled(),
      { variant: 'transition-destination' })
    expect(commitPosts).toBe(2)
    expect(evidence.modelAttempts()).toBe(0)
  } finally {
    hold.release()
    await user.remove()
  }
})

backendTest('onboarding-refusal: an impossible saved preference is refused and the draft is kept', async ({ page, visit, evidence }, testInfo) => {
  test.setTimeout(180_000)
  const user = await newUser(testInfo.project.name, 'refusal')
  evidence.note('fixture', 'A namespaced real new user; the impossible Minimal + Carries proposal is refused by the genuine onboarding RPC.')
  try {
    await enterNewUser(page, visit, user.email, user.client)
    const next = page.getByRole('button', { name: 'Next', exact: true })
    const back = page.getByRole('button', { name: 'Back', exact: true })
    await page.getByRole('radio', { name: /^Minimal/ }).click(); await next.click()
    await page.getByRole('radio', { name: /^Some experience/ }).click(); await next.click()
    await page.getByRole('radio', { name: /^Strength/ }).click()
    await page.getByRole('checkbox', { name: 'Carries', exact: true }).check()
    await next.click()
    await page.getByRole('checkbox', { name: 'Hard conditioning', exact: true }).check()
    await page.getByLabel(/Note/).fill('Disposable fixture note')
    await next.click()
    const finish = page.getByRole('button', { name: 'Finish setup', exact: true })
    await finish.click()
    await evidence.shot('Onboarding', '/onboarding', 'typed-viability-refusal', '/onboarding', 'Set up CLEAR', async () => {
      await expect(page.getByRole('alert')).toContainText('Nothing in Carries')
      await expect(page.getByRole('alert')).toContainText('turn off Carries')
      await expect(page.getByRole('heading', { name: 'Here’s your setup' })).toBeVisible()
      expect(await page.locator('main .clr-card .clr-card').count()).toBe(0)
    }, { skins: true, short: finish })
    // Refused, not saved: the guard still holds the user on onboarding with every answer.
    const profiles = await user.client.selectAsService('profiles', { select: 'onboarded_at', limit: '5',
      id: `eq.${(await user.client.findUserByEmail(user.email))!.id}` })
    expect(profiles.ok).toBe(true)
    expect((profiles.body as Array<{ onboarded_at: string | null }>).every((row) => row.onboarded_at === null)).toBe(true)
    await back.click()
    await expect(page.getByLabel(/Note/)).toHaveValue('Disposable fixture note')
    await expect(page.getByRole('checkbox', { name: 'Hard conditioning', exact: true })).toBeChecked()
    await back.click()
    await expect(page.getByRole('radio', { name: /^Strength/ })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('checkbox', { name: 'Carries', exact: true })).toBeChecked()
    evidence.note('contract', 'After the typed refusal no profile was onboarded, and Back shows the note, limitation, goal and section exactly as chosen.')
    expect(evidence.modelAttempts()).toBe(0)
  } finally { await user.remove() }
})

// ── Generate ───────────────────────────────────────────────────────────────

backendTest('generate: the full real form, selection, disabled, validation and recovery states', async ({ authenticatedPage: page, authenticatedSession: session, visit, evidence }) => {
  test.setTimeout(150_000)
  // The worker's own journey is the returning-user proof: one real verification, then Home.
  expect(session.journey.screens).toEqual(['Welcome', 'OTP Login', 'Home', 'Generate'])
  expect(session.journey.verificationRequests).toBe(1)
  evidence.note('contract', 'Successful returning-user verification landed on Home (/) and reached Generate with the same session.',
    { screens: session.journey.screens, verificationRequests: session.journey.verificationRequests })
  await visit('/generate')
  const at = '/generate'
  const anchor = page.getByRole('group', { name: 'Anchor', exact: true })
  const cta = page.getByRole('button', { name: 'Generate workout', exact: true })
  const duration = page.getByLabel(/Time available/)
  const notes = page.getByLabel(/Notes/)
  const slider = page.getByRole('slider')
  await evidence.shot('Generate', '/generate', 'first-or-stale-history-manual-focus', at, 'Generate workout', async () => {
    await visibleText(page, 'CLEAR needs a starting workout. Choose the focus for this one.')
    await expect(cta).toBeDisabled()
    expect(await page.locator('main .clr-card .clr-card').count()).toBe(0)
    expect(await page.locator('main .clr-card').count()).toBeGreaterThan(0)
  }, { short: cta })
  await evidence.shot('Generate', '/generate', 'request-validation-disabled', at, 'Generate workout', async () => {
    await expect(cta).toBeDisabled()
    expect(evidence.modelAttempts()).toBe(0)
  })

  const unit = await expectFramedField(duration, 'Time available')
  expect(unit.unit, 'Time available has no in-field unit').toEqual({ text: 'min', insideFrame: true,
    selectable: false, editable: false, describes: true })
  evidence.note('contract', 'Time available carries a non-editable, non-selectable "min" unit inside its frame, tied to the input by aria-describedby.', unit)
  evidence.note('discrepancy', 'Before this task Time available stated its unit as helper text ("Minutes.") below the field; the route now passes the package unit prop instead, so the unit sits in the frame as the 0.14.3 Input specimen shows.',
    { source: 'src/app/Generate.tsx', specimen: 'src/design-system/components/Input/Input.jsx' })

  const sliderState = await sliderProbe(slider)
  expect(sliderState).toMatchObject({ labelAbove: true, readoutInLabel: true, radius: '0px' })
  expect(sliderState.thumbs.length).toBeGreaterThan(0)
  for (const thumb of sliderState.thumbs) expect(thumb).toEqual({ width: '16px', height: '16px', radius: '0px' })
  evidence.note('contract', 'Intensity: label and readout above the track; the installed thumb rule is a 16px square with radius 0.', sliderState)
  await slider.focus()
  const before = await slider.inputValue()
  await page.keyboard.press('ArrowRight')
  await expect(slider).not.toHaveValue(before)
  await page.keyboard.press('ArrowLeft')
  await expect(slider).toHaveValue(before)
  evidence.note('keyboard', 'Arrow keys step the focused Intensity slider and return it.', await focusProbe(page))

  const upper = anchor.getByRole('button', { name: 'Upper body', exact: true })
  const lower = anchor.getByRole('button', { name: 'Lower body', exact: true })
  await upper.click()
  await evidence.shot('Generate', '/generate', 'first-or-stale-history-manual-focus', at, 'Generate workout', async () => {
    await expect(upper).toHaveAttribute('aria-pressed', 'true')
    await expect(cta).toBeEnabled()
    await expect.poll(async () => (await chipProbe(upper)).tickOpacity).toBe(1)
    const other = await chipProbe(lower)
    expect(other.tickOpacity).toBe(0)
    expect(other.labelOffCentre).toBeLessThanOrEqual(1.5)
    expect(other.height, 'a chip target is under 40px').toBeGreaterThanOrEqual(40)
  }, { variant: 'anchor-selected', skins: true, short: cta })
  // Brackets follow keyboard focus, so arrive at the chip by keyboard.
  await upper.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(upper).toBeFocused()
  await expect.poll(async () => (await focusProbe(page)).bracketOpacity,
    { message: 'a focused chip has no brackets' }).toBe(1)
  const chipFocus = await focusProbe(page)
  evidence.note('keyboard', 'A focused Anchor chip is framed by the static bracket layer; Enter/Space toggle it as a pressed button.', chipFocus)

  await duration.fill('')
  await cta.click()
  await evidence.shot('Generate', '/generate', 'request-validation-disabled', at, 'Generate workout', async () => {
    await expect(page.getByRole('alert')).toContainText('This request can’t be sent yet.')
    await visibleText(page, 'Give the time available as a whole number of minutes.')
    await expect(duration).toHaveAttribute('aria-invalid', 'true')
    const invalid = await expectFramedField(duration, 'the refused Time available field')
    expect(invalid.glyph, 'the refused field has no warning glyph').toBe(true)
    expect(invalid.unit?.insideFrame, 'the unit left the frame beside the glyph').toBe(true)
    // The draft is refused in place: the chosen anchor is still chosen.
    await expect(upper).toHaveAttribute('aria-pressed', 'true')
    expect(evidence.modelAttempts()).toBe(0)
  }, { variant: 'invalid-duration', skins: true, short: cta })
  await duration.fill('30')

  const emptyNotes = await expectFramedField(notes, 'Notes')
  expect(emptyNotes).toMatchObject({ resize: 'none', fieldSizing: 'content', clipped: false })
  await notes.fill(Array.from({ length: 9 }, (_, line) => `Disposable capture draft line ${line + 1}`).join('\n'))
  await evidence.shot('Generate', '/generate', 'first-or-stale-history-manual-focus', at, 'Generate workout', async () => {
    const grown = await fieldProbe(notes)
    expect(grown.height, 'Notes did not grow with its content').toBeGreaterThan(emptyNotes.height + 20)
    expect(grown).toMatchObject({ resize: 'none', clipped: false, inViewport: true })
  }, { variant: 'notes-multiline', short: cta })
  await notes.fill('')

  const recovery = page.getByRole('button', { name: 'Recovery session', exact: true })
  await recovery.click()
  await evidence.shot('Generate', '/generate', 'recovery-override', at, 'Generate workout', async () => {
    await expect(recovery).toHaveAttribute('aria-pressed', 'true')
    await expect(slider).toHaveAttribute('min', '1')
    await expect(slider).toHaveAttribute('max', '3')
    const power = anchor.getByRole('button', { name: 'Power', exact: true })
    await expect(power).toBeDisabled()
    // Disabled is said by the control and its cursor, not by a tint alone.
    expect(await power.evaluate((el) => getComputedStyle(el).cursor)).toBe('not-allowed')
  }, { skins: true })
  evidence.disposition('Generate', '/generate', 'profile-or-places-loading',
    'BootGate follows the same shared query keys and withholds the route tree while they are pending; the native surface is Boot, pictured by the boot case.',
    ['src/state/boot-queries.ts', 'src/app/BootSequence.tsx', 'src/app/Generate.test.tsx'])
  for (const state of ['read-error-retry', 'history-loading', 'history-error-manual-or-retry']) {
    evidence.disposition('Generate', '/generate', state,
      'Masked by BootGate on a cold load, as recorded for the before state; the branch stays covered by the mounted component test.',
      ['src/state/boot-queries.ts', 'src/app/Generate.test.tsx'])
  }
  evidence.note('discrepancy', 'No field on the owned routes is disabled or read-only in a reachable state: disabled is carried by buttons and chips (pictured), and the package Input disabled/read-only frame remains covered by the focused component tests.',
    { sources: ['src/ui/formFocus.test.tsx', 'src/test/design-system-0.9.7.test.tsx'] })
  expect(evidence.modelAttempts()).toBe(0)
})

/** Target only the named authenticated user's shared read, never all REST. */
async function transformProfile(page: Page, userId: string, goal: null) {
  await page.route(REST, async (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() !== 'GET' || !url.pathname.endsWith('/profiles') ||
      url.searchParams.get('id') !== `eq.${userId}`) return route.fallback()
    const response = await route.fetch()
    if (!response.ok()) throw new Error('The scoped real profile read failed')
    const rows = await response.json() as Array<Record<string, unknown>>
    if (rows.length !== 1 || rows[0].onboarded_at === null) throw new Error('Expected real onboarded profile')
    await route.fulfill({ response, json: [{ ...rows[0], goal_preset: goal }] })
  })
}
async function fixtureHistory(page: Page, userId: string, rows: ReturnType<typeof makeSessionRow>[]) {
  await page.route(REST, async (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() !== 'GET' || !url.pathname.endsWith('/workout_sessions') ||
      url.searchParams.get('user_id') !== `eq.${userId}` || url.searchParams.get('limit') !== '21') {
      return route.fallback()
    }
    await answer(route, 200, rows)
  })
}

backendTest('generate-reads: Goal and Focus ownership, missing goal, no place and deload confirmation', async ({ authenticatedPage: page, authenticatedSession: session, visit, evidence }) => {
  test.setTimeout(150_000)
  const at = '/generate'
  evidence.note('fixture', 'Scoped reads for the real session user only: profile with goal_preset null; an empty locations list; three parsed history rows; six anchor_evidence rows.')
  await transformProfile(page, session.userId, null)
  await visit('/generate')
  await evidence.shot('Generate', '/generate', 'goal-correction', at, 'Generate workout', async () => {
    await visibleText(page, 'Set your goal in Settings')
    await expect(page.getByRole('button', { name: 'Open Settings', exact: true })).toBeVisible()
    // Goal is Settings' to own: Generate offers no way to set it here.
    await expect(page.getByRole('group', { name: 'Anchor', exact: true })).toHaveCount(0)
  })
  await page.unroute(REST)
  await page.route(REST, async (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() === 'GET' && url.pathname.endsWith('/locations') &&
      url.searchParams.get('user_id') === `eq.${session.userId}`) return answer(route, 200, [])
    return route.fallback()
  })
  await page.reload()
  await evidence.shot('Generate', '/generate', 'no-place', at, 'Generate workout', async () => {
    await visibleText(page, 'No places yet')
    await expect(page.getByRole('button', { name: 'Add a place', exact: true })).toBeVisible()
  }, { skins: true })
  await page.unroute(REST)

  const rows = [1, 3, 16].map((days, index) => {
    const date = dayAgo(days)
    return makeSessionRow({ id: randomUUID(), user_id: session.userId, date,
      title: index === 2 ? 'Lower body baseline' : 'Upper body baseline',
      session_focus: index === 2 ? 'lower_body' : 'upper_body',
      created_at: `${date}T08:00:00.000Z`, updated_at: `${date}T10:00:00.000Z`,
      started_at: `${date}T09:00:00.000Z`, completed_at: `${date}T10:00:00.000Z` })
  })
  await fixtureHistory(page, session.userId, rows)
  await visit('/generate')
  await evidence.shot('Generate', '/generate', 'history-recommended-focus', at, 'Generate workout', async () => {
    await visibleText(page, 'Focus: Lower body')
    await visibleText(page, /^No \w+ in 16 days\.$/)
  })
  await page.getByRole('button', { name: 'Change focus', exact: true }).click()
  const focusGroup = page.getByRole('group', { name: 'Focus for this workout', exact: true })
  await focusGroup.getByRole('button', { name: 'Upper body', exact: true }).click()
  await evidence.shot('Generate', '/generate', 'focus-override', at, 'Generate workout', async () => {
    await expect(page.getByRole('button', { name: 'Change focus', exact: true })).toHaveAttribute('aria-expanded', 'true')
    await expect(focusGroup.getByRole('button', { name: 'Upper body', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(new URL(page.url()).searchParams.get('override')).toBe('upper_body')
  }, { skins: true })
  await page.getByRole('button', { name: 'Use the recommended focus', exact: true }).click()
  await visibleText(page, 'Focus: Lower body')
  evidence.note('contract', 'Focus stays Generate’s for this workout only: the override lives in the URL and "Use the recommended focus" returns to the history recommendation.')
  await page.unroute(REST)

  const evidenceRows = [12, 8, 4].flatMap((days) => {
    const sessionId = randomUUID()
    return [1, 2].map((set) => ({
      session_id: sessionId, session_date: dayAgo(days), logged_at: `${dayAgo(days)}T10:0${set}:00.000Z`,
      exercise_id: 'back-squat', equipment_used: 'barbell', set_number: set,
      actual_reps: 5, prescribed_reps: 5, weight: 100, weight_unit: 'lb', rpe: 9,
    }))
  })
  await page.route(REST, async (route) => {
    if (route.request().method() === 'POST' && new URL(route.request().url()).pathname.endsWith('/rpc/anchor_evidence') &&
      route.request().postDataJSON().p_user_id === session.userId) return answer(route, 200, evidenceRows)
    return route.fallback()
  })
  await visit('/generate')
  await expect(page.getByRole('status', { name: 'Deload suggestion' })).toContainText('stalled at RPE 9+')
  const slider = page.getByRole('slider')
  await slider.focus()
  await slider.press('End')
  const dialog = page.getByRole('dialog', { name: 'Train hard today?' })
  await evidence.shot('Generate', '/generate', 'deload-confirmation', at, 'Generate workout', async () => {
    await expect(dialog).toBeVisible()
    await expect(page.getByRole('button', { name: 'Keep it easier', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Go hard anyway', exact: true })).toBeVisible()
    // Native dialog safety: focus is inside it while it is open.
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  evidence.note('keyboard', 'The deload confirmation holds focus inside the native dialog and Escape dismisses it without raising intensity.',
    await focusProbe(page))
  expect(evidence.modelAttempts()).toBe(0)
})

// ── Loading ────────────────────────────────────────────────────────────────

backendTest('loading: a held request, the slow threshold, an actionable failure and a kept draft', async ({ authenticatedPage: page, visit, evidence }) => {
  test.setTimeout(180_000)
  evidence.note('fixture', 'The generate-workout POST is held and answered locally with typed failures; nothing is forwarded to a provider, so this is not generation proof.')
  let held = deferred()
  let failure: 'generation.upstream' | 'generation.no_candidates' = 'generation.upstream'
  let posts = 0
  const bodies: Array<Record<string, unknown>> = []
  await page.route('**/functions/v1/generate-workout', async (route) => {
    if (route.request().method() === 'OPTIONS') return answer(route, 204, null)
    if (route.request().method() !== 'POST') return route.fallback()
    posts += 1
    bodies.push(route.request().postDataJSON() as Record<string, unknown>)
    await held.wait
    const requestId = route.request().headers()['x-request-id']
    if (!requestId) throw new Error('The real client omitted its generation request ID')
    await answer(route, failure === 'generation.no_candidates' ? 422 : 502, {
      code: failure === 'generation.no_candidates' ? 'GENERATION_NO_CANDIDATES' : 'GENERATION_MODEL_ERROR',
      message: 'Controlled capture failure', requestId, failure,
    })
  })
  const at = '/generate'
  const status = page.locator('main').getByRole('status')
  const cancel = page.locator('main').getByRole('button', { name: 'Cancel', exact: true })
  try {
    await visit('/generate')
    const upper = page.getByRole('group', { name: 'Anchor', exact: true }).getByRole('button', { name: 'Upper body', exact: true })
    await upper.click()
    await page.getByLabel(/Time available/).fill('30')
    await page.getByLabel(/Notes/).fill('Disposable capture draft')
    await page.getByRole('button', { name: 'Generate workout', exact: true }).click()
    await evidence.shot('Generate', '/generate', 'generating', at, 'Generating session', () =>
      expect(cancel).toBeVisible())
    await evidence.shot('Loading', null, 'active-stage', at, 'Generating session', async () => {
      await expect(status).toHaveAttribute('aria-busy', 'true')
      // A held request is pending, and says so: no percentage is invented for it.
      await expect(page.getByRole('progressbar')).toHaveCount(0)
      expect(posts).toBe(1)
    }, { short: cancel })
    await evidence.shot('Loading', null, 'slow-still-working', at, 'Generating session', () =>
      expect(status).toContainText('Taking longer than usual', { timeout: 20_000 }), { skins: true })
    if (evidence.phone) {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await expect.poll(() => page.evaluate(() =>
        document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0)
      await evidence.shot('Loading', null, 'slow-still-working', at, 'Generating session', () =>
        expect(status).toContainText('Taking longer than usual'), { variant: 'reduced-motion' })
      evidence.note('motion', 'Under prefers-reduced-motion the held loading screen keeps its status text and runs no animation.')
      await page.emulateMedia({ reducedMotion: 'no-preference' })
    }
    held.release()
    const retry = page.getByRole('button', { name: 'Retry', exact: true })
    await evidence.shot('Loading', null, 'typed-retriable-failure', at, 'Generating session', async () => {
      await expect(status).toContainText('Generation failed')
      await expect(page.getByRole('alert')).toContainText('The generation service did not answer.')
      await expect(retry).toBeVisible()
    }, { skins: true, short: retry })
    failure = 'generation.no_candidates'
    held = deferred()
    await retry.click()
    await heading(page, 'Generating session')
    held.release()
    const change = page.getByRole('button', { name: 'Change options', exact: true })
    await evidence.shot('Loading', null, 'terminal-or-input-refusal', at, 'Generating session', async () => {
      await expect(change).toBeVisible()
      await expect(retry).toHaveCount(0)
    }, { variant: 'input-refusal' })
    await change.click()
    await heading(page, 'Generate workout')
    failure = 'generation.upstream'
    held = deferred()
    await page.getByRole('button', { name: 'Generate workout', exact: true }).click()
    await heading(page, 'Generating session')
    await cancel.click()
    await evidence.shot('Generate', '/generate', 'cancel-preserves-draft', at, 'Generate workout', async () => {
      await expect(page.getByLabel(/Time available/)).toHaveValue('30')
      await expect(page.getByLabel(/Notes/)).toHaveValue('Disposable capture draft')
      await expect(upper).toHaveAttribute('aria-pressed', 'true')
    })
    await evidence.shot('Loading', null, 'cancel', at, 'Generate workout', () =>
      expect(page.getByLabel(/Notes/)).toHaveValue('Disposable capture draft'), { variant: 'transition-destination' })
    held.release()
    expect(posts).toBe(3)
    // The request is the form: what was chosen and typed is what was sent, each time.
    const keys = Object.keys(bodies[0]).sort()
    for (const body of bodies) {
      expect(Object.keys(body).sort()).toEqual(keys)
      expect(JSON.stringify(body)).toContain('Disposable capture draft')
      expect(JSON.stringify(body)).toContain('upper_body')
      expect(Object.values(body)).toContain(30)
    }
    evidence.note('contract', 'All three held generation POSTs carried the same request keys, the chosen anchor, the 30-minute duration and the typed notes, each with an x-request-id.',
      { requestKeys: keys, posts })
    evidence.disposition('Loading', null, 'pending-before-stage',
      'The client emits its first stages synchronously before its first await; the stage-null branch is not a stable native hold.',
      ['src/data/generation.ts', 'src/app/GenerationLoading.test.tsx', 'src/state/generation-loading.ts'])
    evidence.disposition('Loading', null, 'success-review',
      'Success hands off to Review, whose after evidence belongs to the workout-lifecycle group; this deterministic lane asserts no provider success.',
      ['src/app/GenerationLoadingHost.tsx', 'e2e/core-loop.spec.ts'])
  } finally { held.release() }
})

// ── Boot and routing ───────────────────────────────────────────────────────

backendTest('boot: authenticated checking, failed read, retry and reduced-motion handoff', async ({ authenticatedPage: page, authenticatedSession: session, visit, evidence }) => {
  test.setTimeout(150_000)
  const hold = deferred()
  let fail = true
  let profileReads = 0
  const otherReads = new Set<string>()
  evidence.note('fixture', 'Only the real session user’s profile GET is held then failed; Retry reads the actual profile. Every other initialization read is genuine.')
  await page.route(REST, async (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() !== 'GET' || !url.pathname.endsWith('/profiles') ||
      url.searchParams.get('id') !== `eq.${session.userId}`) {
      if (route.request().method() === 'GET' && profileReads <= 1) otherReads.add(url.pathname.split('/').pop()!)
      return route.fallback()
    }
    profileReads += 1
    if (!fail) return route.continue()
    await hold.wait
    await answer(route, 500, serverFailure)
  })
  const at = '/generate'
  const retry = page.getByRole('button', { name: 'Retry', exact: true })
  try {
    await visit('/generate')
    await evidence.shot('BootSequence', null, 'checking', at, 'CLEAR', async () => {
      expect(profileReads).toBe(1)
      const status = page.locator('main').getByRole('status')
      await expect(status).toContainText(/System check|Taking longer than usual/)
      await expect(page.getByRole('group', { name: 'Anchor', exact: true })).toHaveCount(0)
      // Status sits below the logo that names the screen, inside the screen's own column.
      const placed = await status.first().evaluate((el) => {
        const box = el.getBoundingClientRect()
        const logo = document.querySelector('main h1')!.getBoundingClientRect()
        return { below: box.top >= logo.bottom - 1, contained: box.left >= 0 && box.right <= window.innerWidth + 1 }
      })
      expect(placed).toEqual({ below: true, contained: true })
      const bars = page.getByRole('progressbar')
      if (await bars.count() > 0) {
        const probe = await progressProbe(bars.first())
        expect(probe.segments).toBeGreaterThan(1)
        expect(probe.lit + probe.unlit, 'a boot segment is neither lit nor unlit').toBe(probe.segments)
        expect(probe.sized).toBe(false)
        evidence.note('contract', 'Boot progress is discrete segments, each lit or not.', probe)
      }
    }, { skins: true, short: page.locator('main h1') })
    hold.release()
    await evidence.shot('BootSequence', null, 'failed-retry', at, 'CLEAR', async () => {
      const alert = page.getByRole('alert')
      await expect(alert).toContainText('System check failed')
      await expect(alert).toContainText('Your data is intact.')
      await expect(retry).toBeEnabled()
      expect(await alert.first().evaluate((el) => el.closest('.clr-card') !== null &&
        el.getBoundingClientRect().top >= document.querySelector('main h1')!.getBoundingClientRect().bottom - 1),
      'the failure is not in a card below the logo').toBe(true)
      // The real lifecycle only: no kit sample action or placeholder health check.
      await expect(page.getByRole('button', { name: /enter|continue|skip/i })).toHaveCount(0)
    }, { skins: true, short: retry })
    await retry.focus()
    evidence.note('keyboard', 'Retry is reachable by keyboard on the failed boot and is the only action offered.', await focusProbe(page))
    const readsBeforeRetry = new Set(otherReads)
    fail = false
    await retry.click()
    await heading(page, 'Generate workout')
    await evidence.shot('BootSequence', null, 'ready', at, 'Generate workout', () =>
      expect(page.getByRole('group', { name: 'Anchor', exact: true })).toBeVisible(),
      { variant: 'transition-destination' })
    expect(profileReads, 'Retry did not rerun exactly the failed read').toBe(2)
    evidence.note('contract', 'Retry reran the failed profile read once and reached the requested protected route; the reads that had succeeded were kept.',
      { profileReads, readsSeenBeforeFailure: [...readsBeforeRetry].sort() })

    if (evidence.phone) {
      await page.unroute(REST)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await visit('/generate')
      await heading(page, 'Generate workout')
      await expect.poll(() => page.evaluate(() =>
        document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0)
      await evidence.shot('BootSequence', null, 'ready', at, 'Generate workout', () =>
        expect(page.getByRole('group', { name: 'Anchor', exact: true })).toBeVisible(),
        { variant: 'reduced-motion-handoff' })
      evidence.note('motion', 'Under prefers-reduced-motion an authenticated boot hands off to the requested route with nothing left animating.')
      await page.emulateMedia({ reducedMotion: 'no-preference' })
    }
    evidence.disposition('Welcome', '/welcome', 'session-restoring',
      'Auth restoration is shown by Boot checking before the public guards; Welcome’s actions are never flashed.',
      ['src/state/boot-queries.ts', 'src/app/Welcome.test.tsx', 'src/app/guards.tsx'])
    expect(evidence.modelAttempts()).toBe(0)
  } finally { hold.release() }
})

backendTest('routing: signed-in entry redirects, the unmatched route and its way back', async ({ authenticatedPage: page, visit, evidence }) => {
  test.setTimeout(120_000)
  const home = () => expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeEnabled()
  await visit('/welcome')
  await expect(page).toHaveURL((url) => url.pathname === '/')
  await evidence.shot('Welcome', '/welcome', 'authenticated-redirect', '/', 'Today', home,
    { variant: 'transition-destination' })
  await visit('/login')
  await expect(page).toHaveURL((url) => url.pathname === '/')
  await evidence.shot('OTP Login', '/login', 'authenticated-redirect', '/', 'Today', home,
    { variant: 'transition-destination' })
  await visit('/task-034-unmatched')
  const back = page.getByRole('link', { name: 'Return to CLEAR', exact: true })
  await evidence.shot('Not Found', '*', 'unmatched-route', '/task-034-unmatched', 'Page not found', () =>
    expect(back).toBeVisible(), { skins: true, short: back })
  await back.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL((url) => url.pathname === '/')
  await evidence.shot('Not Found', '*', 'home-or-welcome-return', '/', 'Today', home,
    { variant: 'transition-destination' })
  evidence.note('keyboard', 'Return to CLEAR is followed with Enter from the unmatched route and lands a signed-in user on Home.')
  expect(evidence.modelAttempts()).toBe(0)
})
