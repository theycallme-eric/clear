import { createHash, randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import type { Page, Route } from '@playwright/test'

import { namespaceId } from '../../scripts/e2e/namespace.mjs'
import { makeSessionRow } from '../../src/test/factories'
import { suggestionDay } from '../../src/state/session-suggestion'
import { test as authenticatedTest, expect } from '../support/authenticated-session'
import { backend } from '../support/backend'
import {
  captureIdentity, capturePairId, captureTarget,
  type CaptureRecord,
} from './capture'
import { installDeterministicCapture, playwrightCaptureDriver } from './fixtures'
import {
  baselineEntry, BASELINE_INVENTORY_PATH, CAPTURE_SKINS, CAPTURE_VIEWPORTS,
  readBaselineInventory, VIEWPORT_OF_PROJECT,
  type CaptureSkin, type CaptureTarget, type CaptureViewportId,
} from './state-inventory'

/**
 * TASK-040's artifact consumer; source alone is not executed evidence.
 * No runtime/shared-harness edits.
 * All model POSTs are locally fulfilled or aborted. Auth is genuine; scoped
 * deterministic domain-read/failure fixtures are explicitly named in evidence.
 * Non-route and source-only dispositions are not canonical CaptureRecords.
 */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}
const REST = '**/rest/v1/**'
const SESSION_KEY = 'clear.auth.session'
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const heading = (page: Page, name: string) => expect(page.locator('main h1')).toHaveAccessibleName(name, { timeout: 30_000 })
const pathname = (page: Page) => new URL(page.url()).pathname
const visibleText = (page: Page, text: string | RegExp) =>
  expect(page.getByText(text, { exact: typeof text === 'string' }).first()).toBeVisible()

async function answer(route: Route, status: number, body: unknown) {
  await route.fulfill({ status, headers: CORS, json: body })
}
const serverFailure = { code: 'PGRST000', message: 'Controlled capture failure', details: null }
function deferred() {
  let release!: () => void
  const wait = new Promise<void>((resolve) => { release = resolve })
  return { wait, release }
}
function dayAgo(days: number) {
  const [year, month, date] = suggestionDay().split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date - days)).toISOString().slice(0, 10)
}

interface Evidence {
  route(screen: string, route: string, state: string, title: string,
    assertState: () => Promise<void>, variant?: string): Promise<void>
  surface(screen: string, route: string | null, state: string, title: string,
    assertState: () => Promise<void>, variant?: string): Promise<void>
  transition(screen: string, route: string | null, state: string, requested: string,
    destination: string, title: string, assertState: () => Promise<void>): Promise<void>
  disposition(screen: string, route: string | null, state: string, reason: string,
    sources: string[]): void
  fixture(name: string): void
  geometry(viewport: CaptureViewportId): Promise<void>
  skin(skin: CaptureSkin): void
  modelAttempts(): number
}

/** One test owns one safe attachment; browser case count is not PNG count. */
const test = authenticatedTest.extend<{ evidence: Evidence }>({
  evidence: async ({ page }, use, testInfo) => {
    let viewport = VIEWPORT_OF_PROJECT[testInfo.project.name]
    if (!viewport) throw new Error('TASK-040 expects an existing named viewport project')
    let skin: CaptureSkin = 'clear'
    const guard = await installDeterministicCapture(page, { skin })
    const identity = captureIdentity()
    expect(identity.packageVersion, 'before evidence must precede package import').toBe('0.9.7')
    const inventory = readBaselineInventory()
    const nativeDriver = playwrightCaptureDriver(page, testInfo)
    const driver = { ...nativeDriver, async screenshot(name: string) {
      const path = testInfo.outputPath(name)
      const bytes = await page.screenshot({ path, caret: 'hide', mask: [
        page.getByLabel('Email'), page.getByLabel('Code'),
        page.getByText(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
        page.locator('main p').filter({ hasText: /[^\s@]+@[^\s@]+\.[^\s@]+/ }),
      ] })
      await testInfo.attach(name, { path, contentType: 'image/png' })
      return bytes
    } }
    const captures: CaptureRecord[] = []
    const supplements: unknown[] = []
    const dispositions: unknown[] = []
    const fixtures: string[] = []
    const pairs = new Set<string>()
    let imageSequence = 0
    let modelAttempts = 0
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/functions\/v1\/generate-/.test(new URL(request.url()).pathname)) {
        modelAttempts += 1
      }
    })
    const ref = (screen: string, route: string | null, state: string) => {
      if (!baselineEntry(inventory, screen, route)?.states.includes(state)) {
        throw new Error(`No recorded baseline state: ${screen} ${route} ${state}`)
      }
      return { task: inventory.task, inventory: BASELINE_INVENTORY_PATH,
        mainSha: inventory.mainSha, screen, route, state }
    }
    const dimensions = async () => {
      const size = CAPTURE_VIEWPORTS.find((candidate) => candidate.id === viewport)!
      expect(page.viewportSize()).toEqual({ width: size.width, height: size.height })
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
      return size
    }
    const surface: Evidence['surface'] = async (screen, route, state, title, assertion, variant = '') => {
      const baseline = ref(screen, route, state)
      await heading(page, title)
      await assertion()
      const size = await dimensions()
      const motion = await driver.motion()
      const name = `entry-${slug(testInfo.title)}-${++imageSequence}-${slug(screen)}-${slug(state)}-${viewport}-${skin}${variant ? `-${slug(variant)}` : ''}.png`
      const bytes = await driver.screenshot(name)
      supplements.push({ phase: 'before', kind: route === null ? 'non-route-surface' : 'route-variant',
        screen, route, state, baseline, identity, viewport: size, skin,
        reached: { pathname: pathname(page), heading: title, stateVisible: true }, motion,
        variant: variant || null, screenshot: { name, sha256: createHash('sha256').update(bytes).digest('hex'),
          bytes: bytes.byteLength, explicit: true }, deterministic: true, liveGeneration: false })
    }
    const evidence: Evidence = {
      async route(screen, route, state, title, assertion, variant) {
        ref(screen, route, state)
        const target: CaptureTarget = { screen, route, state, path: pathname(page),
          heading: title, stateText: '' }
        const pair = capturePairId(target, viewport, skin)
        if (variant || pairs.has(pair)) {
          await surface(screen, route, state, title, assertion, variant ?? 'additional-observation')
          return
        }
        // A concrete route may be a declared wildcard or gallery sub-path only.
        const actual = pathname(page)
        const matches = route === '*' || actual === route ||
          (route === '/dev/gallery' && actual.startsWith('/dev/gallery/'))
        expect(matches, 'the actual path must match the recorded route').toBe(true)
        await heading(page, title)
        await assertion()
        await dimensions()
        const strictDriver = { ...driver, async observe() {
          await heading(page, title)
          await assertion()
          return { pathname: pathname(page), heading: title, stateVisible: true }
        } }
        const record = await captureTarget(strictDriver, { target, viewport, skin, identity })
        expect(record.phase).toBe('before')
        captures.push(record)
        pairs.add(pair)
      },
      surface,
      async transition(screen, route, state, requested, destination, title, assertion) {
        const baseline = ref(screen, route, state)
        await expect(page).toHaveURL((url) => url.pathname === destination)
        await surface(screen, route, state, title, assertion, 'transition-destination')
        supplements.push({ kind: 'transition', baseline, requestedPath: requested,
          actualDestination: destination, actualHeading: title })
      },
      disposition(screen, route, state, reason, sources) {
        dispositions.push({ kind: 'source-branch-disposition', baseline: ref(screen, route, state),
          reason, sources, renderedClaim: false, status: 'pending-acceptance-review' })
      },
      fixture(name) { if (!fixtures.includes(name)) fixtures.push(name) },
      async geometry(next) {
        viewport = next
        const size = CAPTURE_VIEWPORTS.find((candidate) => candidate.id === next)!
        await page.setViewportSize({ width: size.width, height: size.height })
      },
      skin(next) { skin = next },
      modelAttempts: () => modelAttempts,
    }
    try { await use(evidence) } finally {
      const records = [...captures, ...supplements.filter((record) =>
        typeof record === 'object' && record !== null && 'screenshot' in record)]
      const transitions = supplements.filter((record) =>
        typeof record === 'object' && record !== null && 'kind' in record && record.kind === 'transition')
      const output = testInfo.outputPath('task040-states.json')
      writeFileSync(output, JSON.stringify({ version: 1, task: 'TASK-040', consumer: 'entry-settings',
        caseTitle: testInfo.title, project: testInfo.project.name,
        sourceFile: 'e2e/design-0143/task-040-entry-settings.spec.ts',
        identity, status: testInfo.status, records, transitions, dispositions, fixtures,
        generation: { requests: modelAttempts, forwarded: 0,
          blockedUnexpected: guard.blockedGenerations() }, liveGeneration: false }, null, 2))
      await testInfo.attach('task040-states', { path: output, contentType: 'application/json' })
      expect(guard.blockedGenerations(), 'unexpected model POST was blocked, not evidence of success').toBe(0)
    }
  },
})

/** Target only the named authenticated user's shared read, never all REST. */
async function transformProfile(page: Page, userId: string, goal: null | 'active_recovery') {
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
function recentRows(userId: string) {
  return [1, 3, 16].map((days, index) => {
    const date = dayAgo(days)
    return makeSessionRow({ id: randomUUID(), user_id: userId, date,
      title: index === 2 ? 'Lower body baseline' : 'Upper body baseline',
      session_focus: index === 2 ? 'lower_body' : 'upper_body',
      created_at: `${date}T08:00:00.000Z`, updated_at: `${date}T10:00:00.000Z`,
      started_at: `${date}T09:00:00.000Z`, completed_at: `${date}T10:00:00.000Z` })
  })
}

test('entry: Welcome and OTP validation, busy, typed failure and cooldown', async ({ page, visit, evidence }) => {
  test.setTimeout(90_000)
  let otpPosts = 0
  let verifyPosts = 0
  let otpStatus = 500
  let verifyExpired = false
  let otpHold = deferred()
  const verifyHold = deferred()
  evidence.fixture('OTP delivery locally held/answered; verify negatives are explicit typed boundary fixtures')
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
    await evidence.route('Welcome', '/welcome', 'anonymous-ready', 'CLEAR', async () => {
      await visibleText(page, 'Strength training, simplified.')
      await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled()
      await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeEnabled()
    })
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    const email = page.getByLabel('Email')
    const send = page.getByRole('button', { name: 'Send code', exact: true })
    await evidence.route('OTP Login', '/login', 'email-step', 'Sign in', () => expect(email).toBeVisible())
    await email.fill('wrong')
    await send.click()
    await evidence.route('OTP Login', '/login', 'email-invalid', 'Sign in', async () => {
      await expect(page.getByRole('alert')).toContainText('That is not an email address.')
      await expect(email).toHaveAttribute('aria-invalid', 'true')
      await expect(email).toBeFocused()
      expect(otpPosts).toBe(0)
    })
    await email.fill('clear-e2e-task040-form@example.com')
    await send.click()
    await evidence.route('OTP Login', '/login', 'send-busy', 'Sign in', () => expect(send).toHaveAttribute('aria-busy', 'true'))
    otpHold.release()
    await evidence.route('OTP Login', '/login', 'send-error', 'Sign in', async () => {
      await expect(page.getByRole('alert')).toContainText('Sign-in is unavailable right now.')
      // A provider outage does not invalidate the address. CORE-05 focuses
      // controls the form marks invalid; preserve the valid value and retry.
      await expect(email).toHaveValue('clear-e2e-task040-form@example.com')
      await expect(email).not.toHaveAttribute('aria-invalid', 'true')
      await expect(send).toBeEnabled()
    })
    otpStatus = 200
    otpHold = deferred()
    otpHold.release()
    await send.click()
    const code = page.getByLabel('Code')
    await evidence.route('OTP Login', '/login', 'code-step', 'Sign in', () => expect(code).toBeFocused())
    const resend = page.getByRole('button', { name: /^Resend in \d+s$/ })
    const before = await resend.innerText()
    await evidence.route('OTP Login', '/login', 'resend-cooldown', 'Sign in', async () => {
      await expect(resend).toBeDisabled()
      await expect.poll(() => page.getByRole('button', { name: /^Resend in \d+s$/ }).innerText()).not.toBe(before)
    })
    await code.fill('12')
    const verify = page.getByRole('button', { name: 'Verify', exact: true })
    await verify.click()
    await evidence.route('OTP Login', '/login', 'code-invalid', 'Sign in', async () => {
      await expect(code).toHaveAttribute('aria-invalid', 'true')
      await expect(code).toBeFocused()
      expect(verifyPosts).toBe(0)
    })
    await code.fill('123456')
    await verify.click()
    await evidence.route('OTP Login', '/login', 'verify-busy', 'Sign in', () => expect(verify).toHaveAttribute('aria-busy', 'true'))
    verifyHold.release()
    await evidence.route('OTP Login', '/login', 'wrong-code', 'Sign in', async () => {
      await expect(page.getByRole('alert')).toContainText('That code is not right.')
      await expect(code).toBeFocused()
    })
    verifyExpired = true
    await verify.click()
    await evidence.route('OTP Login', '/login', 'expired-code', 'Sign in', async () => {
      await expect(page.getByRole('alert')).toContainText('That code has expired.')
      await expect(code).toBeFocused()
    })
    expect(evidence.modelAttempts()).toBe(0)
  } finally { otpHold.release(); verifyHold.release() }
})

/** New user uses the same real public verification as the existing critical lane. */
async function enterNewUser(page: Page, visit: (path: string) => Promise<void>, email: string,
  client: ReturnType<typeof backend.client>) {
  await page.route('**/auth/v1/otp', (route) => answer(route, 200, {}))
  await visit('/welcome')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await heading(page, 'Create account')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Send code', exact: true }).click()
  await expect(page.getByLabel('Code')).toBeFocused()
  const { emailOtp } = await client.generateOneTimeCode(email)
  // Assert only a boolean; never attach a numeric code or an auth response.
  expect(/^\d{6,10}$/.test(emailOtp ?? ''), 'no numeric project-issued code').toBe(true)
  await page.getByLabel('Code').fill(emailOtp)
  const verified = page.waitForResponse((response) => response.request().method() === 'POST' &&
    new URL(response.url()).pathname.endsWith('/auth/v1/verify'))
  await page.getByRole('button', { name: 'Verify', exact: true }).click()
  expect((await verified).status()).toBe(200)
  await heading(page, 'Set up CLEAR')
}

test('entry: real new user, all onboarding steps, retained draft and actual commit', async ({ page, visit, evidence }, testInfo) => {
  test.setTimeout(150_000)
  expect(backend.available, 'TASK-040 requires the named E2E fixture prerequisites; no skipped proof').toBe(true)
  const client = backend.client()
  const email = `clear-e2e-${namespaceId()}-${testInfo.project.name}-task040-entry@example.com`
  const prior = await client.findUserByEmail(email)
  if (prior) await client.deleteUser(prior.id)
  await client.ensureConfirmedUser(email)
  const hold = deferred()
  let commitPosts = 0
  let failCommit = true
  evidence.fixture('separate namespaced real new user; first onboarding response is held/500, retry is genuine RPC')
  await page.route(REST, async (route) => {
    if (route.request().method() !== 'POST' || !new URL(route.request().url()).pathname.endsWith('/rpc/complete_onboarding')) {
      return route.fallback()
    }
    commitPosts += 1
    if (!failCommit) return route.continue()
    await hold.wait
    await answer(route, 500, serverFailure)
  })
  try {
    await enterNewUser(page, visit, email, client)
    const next = page.getByRole('button', { name: 'Next', exact: true })
    await evidence.route('Onboarding', '/onboarding', 'selection-incomplete-disabled', 'Set up CLEAR', async () => {
      await expect(next).toBeDisabled()
      await visibleText(page, 'Choose the setup closest to yours.')
    })
    await evidence.route('Onboarding', '/onboarding', 'five-step-draft', 'Set up CLEAR', () =>
      expect(page.getByRole('heading', { name: 'What’s your gym setup?' })).toBeVisible())
    await page.getByRole('radio', { name: /^Home gym/ }).click()
    await next.click()
    await evidence.surface('Onboarding', '/onboarding', 'five-step-draft', 'Set up CLEAR', () =>
      expect(page.getByRole('heading', { name: 'How familiar are you with the gym?' })).toBeVisible(), 'experience')
    await page.getByRole('radio', { name: /^Some experience/ }).click()
    await next.click()
    await evidence.surface('Onboarding', '/onboarding', 'five-step-draft', 'Set up CLEAR', () =>
      expect(page.getByRole('heading', { name: 'What are you going for?' })).toBeVisible(), 'goal')
    await page.getByRole('radio', { name: /^Balanced/ }).click()
    await next.click()
    await evidence.surface('Onboarding', '/onboarding', 'five-step-draft', 'Set up CLEAR', () =>
      expect(page.getByRole('heading', { name: 'Anything we should work around?' })).toBeVisible(), 'limitations')
    await page.getByLabel(/Note/).fill('Disposable fixture note')
    await page.getByRole('button', { name: /^(Next|Skip)$/ }).click()
    await evidence.surface('Onboarding', '/onboarding', 'five-step-draft', 'Set up CLEAR', () =>
      expect(page.getByRole('heading', { name: 'Here’s your setup' })).toBeVisible(), 'confirmation')
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await evidence.route('Onboarding', '/onboarding', 'back-preserves-draft', 'Set up CLEAR', () =>
      expect(page.getByLabel(/Note/)).toHaveValue('Disposable fixture note'))
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page.getByRole('radio', { name: /^Balanced/ })).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page.getByRole('radio', { name: /^Some experience/ })).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page.getByRole('radio', { name: /^Home gym/ })).toHaveAttribute('aria-checked', 'true')
    await next.click(); await next.click(); await next.click()
    await page.getByRole('button', { name: /^(Next|Skip)$/ }).click()
    await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
    await evidence.route('Onboarding', '/onboarding', 'committing', 'Set up CLEAR', async () => {
      expect(commitPosts).toBe(1)
      await expect(page.locator('main').getByRole('status')).toContainText(/Saving your setup|Taking longer than usual/)
    })
    hold.release()
    await evidence.route('Onboarding', '/onboarding', 'commit-error-retry', 'Set up CLEAR', async () => {
      await visibleText(page, 'Your setup didn’t save')
      await visibleText(page, 'Nothing was stored, and your answers are still here. Try again when you’re ready.')
    })
    failCommit = false
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await evidence.transition('Onboarding', '/onboarding', 'success-home', '/onboarding', '/', 'Today', () =>
      expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeEnabled())
    expect(commitPosts).toBe(2)
    expect(evidence.modelAttempts()).toBe(0)
  } finally {
    hold.release()
    const user = await client.findUserByEmail(email)
    if (user) await client.deleteUser(user.id)
  }
})

test('entry: onboarding keeps the actual typed impossible-choice refusal', async ({ page, visit, evidence }, testInfo) => {
  test.setTimeout(120_000)
  expect(backend.available).toBe(true)
  const client = backend.client()
  const email = `clear-e2e-${namespaceId()}-${testInfo.project.name}-task040-refusal@example.com`
  const prior = await client.findUserByEmail(email)
  if (prior) await client.deleteUser(prior.id)
  await client.ensureConfirmedUser(email)
  evidence.fixture('namespaced real new user; impossible Minimal + Carries proposal refused by genuine onboarding RPC')
  try {
    await enterNewUser(page, visit, email, client)
    const next = page.getByRole('button', { name: 'Next', exact: true })
    await page.getByRole('radio', { name: /^Minimal/ }).click(); await next.click()
    await page.getByRole('radio', { name: /^Some experience/ }).click(); await next.click()
    await page.getByRole('radio', { name: /^Strength/ }).click()
    await page.getByRole('checkbox', { name: 'Carries', exact: true }).check()
    await next.click()
    await page.getByRole('checkbox', { name: 'Hard conditioning', exact: true }).check()
    await page.getByLabel(/Note/).fill('Disposable fixture note')
    await next.click()
    await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
    await evidence.route('Onboarding', '/onboarding', 'typed-viability-refusal', 'Set up CLEAR', async () => {
      await expect(page.getByRole('alert')).toContainText('Nothing in Carries')
      await expect(page.getByRole('alert')).toContainText('turn off Carries')
      await expect(page.getByRole('heading', { name: 'Here’s your setup' })).toBeVisible()
    })
    expect(evidence.modelAttempts()).toBe(0)
  } finally {
    const user = await client.findUserByEmail(email)
    if (user) await client.deleteUser(user.id)
  }
})

test('Generate: genuine first-workout, validation and workout-only recovery', async ({ authenticatedPage: page, visit, evidence }) => {
  await visit('/generate')
  const anchor = page.getByRole('group', { name: 'Anchor', exact: true })
  const cta = page.getByRole('button', { name: 'Generate workout', exact: true })
  await evidence.route('Generate', '/generate', 'first-or-stale-history-manual-focus', 'Generate workout', async () => {
    await visibleText(page, 'CLEAR needs a starting workout. Choose the focus for this one.')
    await expect(cta).toBeDisabled()
  })
  await evidence.route('Generate', '/generate', 'request-validation-disabled', 'Generate workout', async () => {
    await expect(cta).toBeDisabled(); expect(evidence.modelAttempts()).toBe(0)
  })
  await anchor.getByRole('button', { name: 'Upper body', exact: true }).click()
  await page.getByLabel(/Time available/).fill('')
  await cta.click()
  await evidence.surface('Generate', '/generate', 'request-validation-disabled', 'Generate workout', async () => {
    await expect(page.getByRole('alert')).toContainText('This request can’t be sent yet.')
    await visibleText(page, 'Give the time available as a whole number of minutes.')
    expect(evidence.modelAttempts()).toBe(0)
  }, 'invalid-duration-does-not-disable-cta')
  await page.getByLabel(/Time available/).fill('30')
  await page.getByRole('button', { name: 'Recovery session', exact: true }).click()
  await evidence.route('Generate', '/generate', 'recovery-override', 'Generate workout', async () => {
    await expect(page.getByRole('button', { name: 'Recovery session', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('slider')).toHaveAttribute('min', '1')
    await expect(page.getByRole('slider')).toHaveAttribute('max', '3')
    await expect(anchor.getByRole('button', { name: 'Power', exact: true })).toBeDisabled()
  })
  expect(evidence.modelAttempts()).toBe(0)
})

test('Generate: scoped valid missing goal and empty-place reads', async ({ authenticatedPage: page, authenticatedSession: session, visit, evidence }) => {
  evidence.fixture('scoped real onboarded profile with goal_preset null; then scoped valid empty locations read')
  await transformProfile(page, session.userId, null)
  await visit('/generate')
  await evidence.route('Generate', '/generate', 'goal-correction', 'Generate workout', async () => {
    await visibleText(page, 'Set your goal in Settings')
    await expect(page.getByRole('button', { name: 'Open Settings', exact: true })).toBeVisible()
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
  await evidence.route('Generate', '/generate', 'no-place', 'Generate workout', () => visibleText(page, 'No places yet'))
  await page.getByRole('button', { name: 'Add a place', exact: true }).click()
  await evidence.route('Settings', '/settings/locations', 'no-locations-empty', 'Places and equipment', () => visibleText(page, 'No places yet'))
  expect(evidence.modelAttempts()).toBe(0)
})

test('Generate: real session with named recent/stale history fixture and focus override', async ({ authenticatedPage: page, authenticatedSession: session, visit, evidence }) => {
  evidence.fixture('scoped parsed history rows from existing makeSessionRow, relative to actual suggestion day')
  await fixtureHistory(page, session.userId, recentRows(session.userId))
  await visit('/generate')
  await evidence.route('Generate', '/generate', 'history-recommended-focus', 'Generate workout', async () => {
    await visibleText(page, 'Focus: Lower body')
    await visibleText(page, /^No \w+ in 16 days\.$/)
    await expect(page.getByRole('slider')).toHaveValue('7')
  })
  await page.getByRole('button', { name: 'Change focus', exact: true }).click()
  await page.getByRole('group', { name: 'Focus for this workout', exact: true })
    .getByRole('button', { name: 'Upper body', exact: true }).click()
  await evidence.route('Generate', '/generate', 'focus-override', 'Generate workout', async () => {
    await expect(page.getByRole('button', { name: 'Change focus', exact: true })).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('group', { name: 'Focus for this workout', exact: true })
      .getByRole('button', { name: 'Upper body', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(new URL(page.url()).searchParams.get('override')).toBe('upper_body')
  })
  await page.reload()
  await expect(page.getByRole('group', { name: 'Focus for this workout', exact: true })
    .getByRole('button', { name: 'Upper body', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Use the recommended focus', exact: true }).click()
  await visibleText(page, 'Focus: Lower body')
  await page.unroute(REST)
  const date = dayAgo(30)
  await fixtureHistory(page, session.userId, [makeSessionRow({ id: randomUUID(), user_id: session.userId,
    date, created_at: `${date}T08:00:00.000Z`, updated_at: `${date}T10:00:00.000Z`,
    started_at: `${date}T09:00:00.000Z`, completed_at: `${date}T10:00:00.000Z` })])
  await visit('/generate')
  await evidence.surface('Generate', '/generate', 'first-or-stale-history-manual-focus', 'Generate workout', () =>
    visibleText(page, 'Choose the focus for this workout.'), 'stale-history-member')
  expect(evidence.modelAttempts()).toBe(0)
})

test('Generate: existing anchor evidence exposes a real deload confirmation', async ({ authenticatedPage: page, authenticatedSession: session, visit, evidence }) => {
  evidence.fixture('scoped anchor_evidence six existing-schema rows; no fabricated runtime state')
  const rows = [12, 8, 4].flatMap((days) => [1, 2].map((set) => ({
    session_id: randomUUID(), session_date: dayAgo(days), logged_at: `${dayAgo(days)}T10:0${set}:00.000Z`,
    exercise_id: 'back-squat', equipment_used: 'barbell', set_number: set,
    actual_reps: 5, prescribed_reps: 5, weight: 100, weight_unit: 'lb', rpe: 9,
  })))
  // Both sets from a session must share a session_id, as actual evidence does.
  for (let i = 0; i < rows.length; i += 2) rows[i + 1].session_id = rows[i].session_id
  await page.route(REST, async (route) => {
    if (route.request().method() === 'POST' && new URL(route.request().url()).pathname.endsWith('/rpc/anchor_evidence') &&
      route.request().postDataJSON().p_user_id === session.userId) return answer(route, 200, rows)
    return route.fallback()
  })
  await visit('/generate')
  await expect(page.getByRole('status', { name: 'Deload suggestion' })).toContainText('stalled at RPE 9+')
  const slider = page.getByRole('slider')
  await slider.focus()
  await slider.press('End')
  await evidence.route('Generate', '/generate', 'deload-confirmation', 'Generate workout', async () => {
    await expect(page.getByRole('dialog', { name: 'Train hard today?' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Keep it easier', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Go hard anyway', exact: true })).toBeVisible()
  })
  await page.getByRole('button', { name: 'Keep it easier', exact: true }).click()
  expect(evidence.modelAttempts()).toBe(0)
})

test('Loading: held client stages, actual slow threshold, retriable and terminal failures', async ({ authenticatedPage: page, visit, evidence }) => {
  test.setTimeout(90_000)
  evidence.fixture('generate-workout POST held and locally fulfilled; no provider dispatch')
  let held = deferred()
  let failure: 'generation.upstream' | 'generation.no_candidates' | 'generation.exhausted' = 'generation.upstream'
  let posts = 0
  await page.route('**/functions/v1/generate-workout', async (route) => {
    if (route.request().method() === 'OPTIONS') return answer(route, 204, null)
    if (route.request().method() !== 'POST') return route.fallback()
    posts += 1
    await held.wait
    const requestId = route.request().headers()['x-request-id']
    if (!requestId) throw new Error('The real client omitted its generation request ID')
    await answer(route, failure === 'generation.no_candidates' ? 422 : 502, {
      code: failure === 'generation.no_candidates' ? 'GENERATION_NO_CANDIDATES' : 'GENERATION_MODEL_ERROR',
      message: 'Controlled capture failure', requestId, failure,
    })
  })
  try {
    await visit('/generate')
    await page.getByRole('group', { name: 'Anchor', exact: true }).getByRole('button', { name: 'Upper body', exact: true }).click()
    await page.getByLabel(/Time available/).fill('30')
    await page.getByLabel(/Notes/).fill('Disposable capture draft')
    await page.getByRole('button', { name: 'Generate workout', exact: true }).click()
    await evidence.route('Generate', '/generate', 'generating', 'Generating session', () =>
      expect(page.locator('main').getByRole('button', { name: 'Cancel', exact: true })).toBeVisible())
    await evidence.surface('Loading', null, 'active-stage', 'Generating session', async () => {
      await expect(page.locator('main').getByRole('status')).toContainText('Composing session')
      await expect(page.locator('main').getByRole('status')).toHaveAttribute('aria-busy', 'true')
      await expect(page.getByRole('progressbar')).toHaveCount(0)
    })
    await evidence.surface('Loading', null, 'slow-still-working', 'Generating session', () =>
      expect(page.locator('main').getByRole('status')).toContainText('Taking longer than usual', { timeout: 10_000 }))
    held.release()
    await evidence.surface('Loading', null, 'typed-retriable-failure', 'Generating session', async () => {
      await expect(page.locator('main').getByRole('status')).toContainText('Generation failed')
      await expect(page.getByRole('alert')).toContainText('The generation service did not answer.')
      await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
    })
    failure = 'generation.no_candidates'
    held = deferred()
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await heading(page, 'Generating session')
    held.release()
    await evidence.surface('Loading', null, 'terminal-or-input-refusal', 'Generating session', async () => {
      await expect(page.getByRole('button', { name: 'Change options', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0)
    }, 'input-refusal')
    await page.getByRole('button', { name: 'Change options', exact: true }).click()
    await heading(page, 'Generate workout')
    failure = 'generation.exhausted'
    held = deferred()
    await page.getByRole('button', { name: 'Generate workout', exact: true }).click()
    await heading(page, 'Generating session')
    held.release()
    await evidence.surface('Loading', null, 'terminal-or-input-refusal', 'Generating session', async () => {
      await expect(page.locator('main').getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0)
    }, 'exhausted')
    await page.locator('main').getByRole('button', { name: 'Cancel', exact: true }).click()
    await heading(page, 'Generate workout')
    failure = 'generation.upstream'
    held = deferred()
    await page.getByRole('button', { name: 'Generate workout', exact: true }).click()
    await heading(page, 'Generating session')
    await page.locator('main').getByRole('button', { name: 'Cancel', exact: true }).click()
    await evidence.route('Generate', '/generate', 'cancel-preserves-draft', 'Generate workout', async () => {
      await expect(page.getByLabel(/Time available/)).toHaveValue('30')
      await expect(page.getByLabel(/Notes/)).toHaveValue('Disposable capture draft')
      await expect(page.getByRole('group', { name: 'Anchor', exact: true }).getByRole('button', { name: 'Upper body', exact: true }))
        .toHaveAttribute('aria-pressed', 'true')
    })
    await evidence.transition('Loading', null, 'cancel', '/generate', '/generate', 'Generate workout', () =>
      expect(page.getByLabel(/Notes/)).toHaveValue('Disposable capture draft'))
    held.release()
    expect(posts).toBe(4)
    evidence.disposition('Loading', null, 'pending-before-stage',
      'The browser client emits validating and authorizing synchronously before its first await; this stage-null component branch is not a stable native hold.',
      ['src/data/generation.ts', 'src/app/GenerationLoading.test.tsx', 'src/state/generation-loading.ts'])
  } finally { held.release() }
})

test('Boot: a genuine scoped shared-read hold/failure/retry and automatic continuation', async ({ authenticatedPage: page, authenticatedSession: session, visit, evidence }) => {
  const hold = deferred()
  let fail = true
  let profileReads = 0
  evidence.fixture('only current real user profile GET is held/failed; retry reads actual profile')
  await page.route(REST, async (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() !== 'GET' || !url.pathname.endsWith('/profiles') ||
      url.searchParams.get('id') !== `eq.${session.userId}`) return route.fallback()
    profileReads += 1
    if (!fail) return route.continue()
    await hold.wait
    await answer(route, 500, serverFailure)
  })
  try {
    await visit('/generate')
    await evidence.surface('BootSequence', null, 'checking', 'CLEAR', async () => {
      expect(profileReads).toBe(1)
      await expect(page.locator('main').getByRole('status')).toContainText(/System check|Taking longer than usual/)
      await expect(page.getByRole('group', { name: 'Anchor', exact: true })).toHaveCount(0)
    })
    hold.release()
    await evidence.surface('BootSequence', null, 'failed-retry', 'CLEAR', async () => {
      await expect(page.getByRole('alert')).toContainText('System check failed')
      await expect(page.getByRole('alert')).toContainText('Your data is intact.')
      await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled()
    })
    fail = false
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await evidence.transition('BootSequence', null, 'ready', '/generate', '/generate', 'Generate workout', () =>
      expect(page.getByRole('group', { name: 'Anchor', exact: true })).toBeVisible())
    expect(profileReads).toBe(2)
    for (const state of ['profile-or-places-loading', 'read-error-retry', 'history-loading', 'history-error-manual-or-retry']) {
      evidence.disposition('Generate', '/generate', state,
        'BootGate continuously follows the same shared query keys and removes the route tree while pending/failed; native evidence is Boot, component-only branch retained.',
        ['src/state/boot-queries.ts', 'src/app/BootSequence.tsx', 'src/app/Generate.test.tsx'])
    }
    for (const state of ['profile-loading', 'profile-error-retry']) evidence.disposition('Settings', '/settings', state,
      'Same shared profile read is masked by BootGate; no Settings heading appeared.',
      ['src/app/Settings.tsx', 'src/app/Settings.test.tsx', 'src/state/boot-queries.ts'])
    evidence.disposition('Settings', '/settings', 'missing-profile',
      'The protected guard sends a missing/un-onboarded profile to Onboarding; native Settings empty branch is not reachable through this guard.',
      ['src/app/Settings.tsx:94', 'src/app/guards.tsx', 'src/app/Settings.test.tsx'])
    for (const state of ['locations-loading', 'locations-error-retry']) evidence.disposition('Settings', '/settings/locations', state,
      'The same locations query is watched by BootGate, so pending/failed native surface is Boot, not Places.',
      ['src/app/LocationSettings.tsx', 'src/state/boot-queries.ts', 'src/app/LocationSettings.test.tsx'])
    evidence.disposition('Welcome', '/welcome', 'session-restoring',
      'Auth restoration is displayed by Boot checking before public guards; Welcome actions are not flashed.',
      ['src/state/boot-queries.ts', 'src/app/Welcome.test.tsx', 'src/app/guards.tsx'])
    expect(evidence.modelAttempts()).toBe(0)
  } finally { hold.release() }
})

test('Settings: actual populated preference, held save, typed refusal and rollback', async ({ authenticatedPage: page, authenticatedSession: session, visit, evidence }) => {
  const hold = deferred()
  let refuse = true
  evidence.fixture('scoped profile PATCH first answers typed settings_not_viable; next save reaches actual endpoint')
  await page.route(REST, async (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() !== 'PATCH' || !url.pathname.endsWith('/profiles') ||
      url.searchParams.get('id') !== `eq.${session.userId}`) return route.fallback()
    if (!refuse) return route.continue()
    await hold.wait
    await answer(route, 400, { code: 'P0001', message: 'settings_not_viable', details: '[]' })
  })
  try {
    await visit('/settings')
    await evidence.route('Settings', '/settings', 'preferences-populated', 'Settings', async () => {
      await expect(page.getByRole('heading', { name: 'Training', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Manage places', exact: true })).toBeVisible()
    })
    await evidence.route('Settings', '/settings', 'constraints-loading-empty-error-populated', 'Settings', () =>
      visibleText(page, 'Nothing recorded. Tick anything a workout should work around.'))
    await page.getByRole('radio', { name: /^Confident/ }).click()
    await evidence.route('Settings', '/settings', 'inline-save-pending-saved', 'Settings', () => visibleText(page, 'Saving…'))
    hold.release()
    await evidence.route('Settings', '/settings', 'save-refusal-rollback', 'Settings', async () => {
      await expect(page.getByRole('radio', { name: /^Some experience/ })).toHaveAttribute('aria-checked', 'true')
      await expect(page.getByRole('alert')).toContainText('Not saved. Your previous settings are kept.')
    })
    refuse = false
    await page.getByRole('radio', { name: /^Confident/ }).click()
    await evidence.surface('Settings', '/settings', 'inline-save-pending-saved', 'Settings', () => visibleText(page, 'Saved'), 'actual-saved')
    const limitations = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Limitations', exact: true }) })
    const hardConditioning = page.getByRole('checkbox', { name: 'Hard conditioning', exact: true })
    // The empty/ready editor branches remount after the real write. Verify
    // the current locator rather than .check()'s now-stale element handle.
    await expect(hardConditioning).not.toBeChecked()
    await hardConditioning.click()
    await expect(hardConditioning).toBeChecked()
    await expect(limitations.getByRole('status')).toHaveText('Saved')
    await evidence.surface('Settings', '/settings', 'constraints-loading-empty-error-populated', 'Settings', () =>
      expect(hardConditioning).toBeChecked(), 'actual-populated')
    await hardConditioning.click()
    await expect(hardConditioning).not.toBeChecked()
    await expect(limitations.getByRole('status')).toHaveText('Saved')
    await page.getByRole('radio', { name: /^Some experience/ }).click()
    await visibleText(page, 'Saved')
    evidence.disposition('Settings', '/settings', 'constraints-loading-empty-error-populated',
      'Empty/populated members are captured here. Loading/error members use the Boot-watched constraints key and cannot display Settings through current BootGate.',
      ['src/app/Settings.tsx:288', 'src/state/boot-queries.ts', 'src/app/Settings.test.tsx'])
    expect(evidence.modelAttempts()).toBe(0)
  } finally { hold.release() }
})

test('Settings: real four-skin selection, keyboard focus, system, short containment and reduced motion', async ({ authenticatedPage: page, visit, evidence }, testInfo) => {
  await visit('/settings')
  const skins: readonly CaptureSkin[] = testInfo.project.name === 'mobile' ? CAPTURE_SKINS : ['clear']
  for (const skin of skins) {
    const radio = page.getByRole('radio', { name: new RegExp(`^${skin}\\b`, 'i') })
    await radio.click()
    await expect(radio).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
    evidence.skin(skin)
    await evidence.route('Settings', '/settings', 'appearance-system-or-skin', 'Settings', () => expect(radio).toHaveAttribute('aria-checked', 'true'))
  }
  const system = page.getByRole('radio', { name: /^System\b/i })
  await page.emulateMedia({ contrast: 'more' })
  await system.click()
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'mono')
  evidence.skin('mono')
  await evidence.surface('Settings', '/settings', 'appearance-system-or-skin', 'Settings', async () => {
    await expect(system).toHaveAttribute('aria-checked', 'true')
    expect(await page.evaluate(() => localStorage.getItem('clear.skin'))).toBeNull()
  }, 'system-contrast')
  await page.emulateMedia({ contrast: 'no-preference' })
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'clear')
  evidence.skin('clear')
  const goal = page.getByRole('radio', { name: /^Balanced/ })
  await goal.focus()
  await evidence.surface('Settings', '/settings', 'preferences-populated', 'Settings', () => expect(goal).toBeFocused(), 'keyboard-focus')
  if (testInfo.project.name === 'mobile') {
    await evidence.geometry('short')
    await page.getByRole('button', { name: 'Manage places', exact: true }).scrollIntoViewIfNeeded()
    await evidence.surface('Settings', '/settings', 'preferences-populated', 'Settings', async () => {
      await expect(page.getByRole('button', { name: 'Manage places', exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true)
      await expect(page.locator('main .clr-scroll-region__scroller')).toHaveCSS('overflow-y', 'auto')
    }, 'short-phone-contained-scroll')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await evidence.surface('Settings', '/settings', 'preferences-populated', 'Settings', async () => {
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    }, 'short-phone-reduced-motion')
  }
  expect(evidence.modelAttempts()).toBe(0)
})

test('Places: real list/editor CRUD, equipment held failure and retry, default/delete', async ({ authenticatedPage: page, authenticatedSession: session, visit, evidence }) => {
  test.setTimeout(120_000)
  evidence.fixture('actual namespaced location writes; only original location equipment GET is held/500 once')
  const client = backend.client()
  const locations = await client.selectAsService('locations', { select: 'id,name', user_id: `eq.${session.userId}` })
  expect(locations.ok, 'reading the scoped fixture locations').toBe(true)
  const original = (locations.body as Array<{ id: string; name: string }>).find((row) => row.name === 'Session journey gym')
  if (!original) throw new Error('Expected the authenticated fixture place')
  const hold = deferred()
  let failEquipment = true
  await page.route(REST, async (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() !== 'GET' || !url.pathname.endsWith('/location_equipment') ||
      url.searchParams.get('location_id') !== `eq.${original.id}`) return route.fallback()
    if (!failEquipment) return route.continue()
    await hold.wait
    await answer(route, 500, serverFailure)
  })
  const card = (name: string) => page.locator('.clr-card').filter({ has: page.getByRole('heading', { name, exact: true }) })
  try {
    await visit('/settings/locations')
    await evidence.route('Settings', '/settings/locations', 'list-populated', 'Places and equipment', () =>
      expect(page.getByRole('heading', { name: original.name, exact: true })).toBeVisible())
    await card(original.name).getByRole('button', { name: 'Edit', exact: true }).click()
    await evidence.route('Settings', '/settings/locations', 'equipment-loading-error', 'Places and equipment', () =>
      visibleText(page, `Reading ${original.name} equipment…`))
    hold.release()
    await evidence.surface('Settings', '/settings/locations', 'equipment-loading-error', 'Places and equipment', () =>
      visibleText(page, 'This equipment list didn’t load'), 'error-member')
    failEquipment = false
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(original.name)
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByRole('button', { name: 'Add place', exact: true }).click()
    await evidence.route('Settings', '/settings/locations', 'new-location-editor', 'Places and equipment', () =>
      expect(page.getByRole('textbox', { name: 'Name' })).toBeVisible())
    const createdName = 'Disposable capture travel gym'
    const renamedName = 'Disposable capture hotel gym'
    await page.getByRole('textbox', { name: 'Name' }).fill(createdName)
    await page.getByRole('radio', { name: /^Home gym/ }).click()
    await page.getByRole('button', { name: 'Save place', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Save place', exact: true })).toHaveCount(0)
    await card(createdName).getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByRole('textbox', { name: 'Name' }).fill(renamedName)
    await page.getByRole('button', { name: 'Save place', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Save place', exact: true })).toHaveCount(0)
    await evidence.route('Settings', '/settings/locations', 'edit-inline-save', 'Places and equipment', async () => {
      await expect(page.getByRole('heading', { name: renamedName, exact: true })).toBeVisible()
      // A successful editor write closes its own Saved line. Prove the actual
      // persisted rename, not a list-level status owned by default/delete.
      await expect(page.getByRole('button', { name: 'Save place', exact: true })).toHaveCount(0)
      const persisted = await client.selectAsService('locations', {
        select: 'id,name', user_id: `eq.${session.userId}`, name: `eq.${renamedName}`,
      })
      expect(persisted.ok, 'reading the actual namespaced saved rename').toBe(true)
      expect(persisted.body).toEqual([{ id: expect.any(String), name: renamedName }])
    })
    const defaultHold = deferred()
    let refuseDefault = true
    await page.route('**/rest/v1/rpc/set_default_location', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      if (!refuseDefault) return route.continue()
      await defaultHold.wait
      await answer(route, 500, serverFailure)
    })
    await card(renamedName).getByRole('button', { name: 'Make default', exact: true }).click()
    defaultHold.release()
    await evidence.route('Settings', '/settings/locations', 'default-change-rollback', 'Places and equipment', () =>
      expect(card(original.name).getByText(/Default for generation/)).toBeVisible())
    refuseDefault = false
    await card(renamedName).getByRole('button', { name: 'Make default', exact: true }).click()
    await expect(card(renamedName).getByText(/Default for generation/)).toBeVisible()
    await card(renamedName).getByRole('button', { name: 'Delete', exact: true }).click()
    await evidence.route('Settings', '/settings/locations', 'default-delete-reassignment', 'Places and equipment', async () => {
      await expect(page.locator('main').getByRole('alert')).toHaveText(
        'Workouts are generated from this location. Make another one the default first.',
      )
      await expect(page.getByRole('dialog', { name: 'Delete this place?' })).toHaveCount(0)
    })
    // Existing policy requires reassignment before deletion; it does not silently
    // delete the default and choose another. Exercise that actual sequence.
    await card(original.name).getByRole('button', { name: 'Make default', exact: true }).click()
    await expect(card(original.name).getByText(/Default for generation/)).toBeVisible()
    await card(renamedName).getByRole('button', { name: 'Delete', exact: true }).click()
    await evidence.route('Settings', '/settings/locations', 'delete-confirmation', 'Places and equipment', () =>
      expect(page.getByRole('dialog', { name: 'Delete this place?' })).toBeVisible())
    await page.getByRole('dialog', { name: 'Delete this place?' }).getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByRole('heading', { name: renamedName, exact: true })).toHaveCount(0)
    await evidence.surface('Settings', '/settings/locations', 'list-populated', 'Places and equipment', async () => {
      await expect(card(original.name).getByText(/Default for generation/)).toBeVisible()
      await expect.poll(async () => {
        const persisted = await client.selectAsService('locations', {
          select: 'id', user_id: `eq.${session.userId}`, name: `eq.${renamedName}`,
        })
        return persisted.ok ? persisted.body : 'read-failed'
      }, { message: 'actual removal of the disposable namespaced place' }).toEqual([])
    }, 'after-default-reassignment-and-delete')
    expect(evidence.modelAttempts()).toBe(0)
  } finally { hold.release() }
})

test('Places: typed viability refusal retains the editor and rolls back the list', async ({ authenticatedPage: page, visit, evidence }) => {
  evidence.fixture('save_location locally answers the existing typed location_not_viable wire branch; no write forwarded')
  await page.route('**/rest/v1/rpc/save_location', (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    return answer(route, 400, { code: '23514', message: 'location_not_viable', details: JSON.stringify({
      change: { kind: 'edit', location: 'Session journey gym', removed: ['dumbbells'], added: [] },
      failures: [{ section: 'primary_lift', failure_class: 'missing_equipment',
        incompatible_choice: { kind: 'equipment', equipment: ['bodyweight'] },
        goals: ['balanced'], focuses: ['lower_body'], blocks_proposed_goal: true }],
    }) })
  })
  await visit('/settings/locations')
  const card = page.locator('.clr-card').filter({ has: page.getByRole('heading', { name: 'Session journey gym', exact: true }) })
  await card.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Session journey gym')
  await page.getByRole('checkbox', { name: 'Dumbbells', exact: true }).uncheck()
  await page.getByRole('button', { name: 'Save place', exact: true }).click()
  await evidence.route('Settings', '/settings/locations', 'typed-viability-refusal-rollback', 'Places and equipment', async () => {
    await expect(page.getByRole('alert')).toContainText('Primary lift')
    await expect(page.getByRole('alert')).toContainText('Nothing was changed.')
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Session journey gym')
    await expect(page.getByRole('heading', { name: 'Session journey gym', exact: true })).toBeVisible()
  })
  expect(evidence.modelAttempts()).toBe(0)
})

test('Gallery: actual dev routes, selected skin/atmosphere and triggered dialog/toast', async ({ authenticatedPage: page, visit, evidence }) => {
  await visit('/dev/gallery')
  await evidence.route('Component Gallery', '/dev/gallery', 'overview', 'Component Gallery', () =>
    expect(page.getByRole('heading', { name: 'Two sections', exact: true })).toBeVisible())
  await page.getByRole('link', { name: 'Design system', exact: true }).click()
  await evidence.route('Component Gallery', '/dev/gallery', 'design-system-specimens', 'Component Gallery', async () => {
    await expect(page).toHaveURL((url) => url.pathname === '/dev/gallery/ds')
    await expect(page.locator('.clr-dev-gallery__section')).toBeVisible()
  })
  await page.getByRole('link', { name: 'App-composed', exact: true }).click()
  if (pathname(page) !== '/dev/gallery/app') {
    // Record the real before-state navigation defect, rather than pretending
    // this click reached the specimens. Their actual direct dev route still
    // provides a baseline without changing gallery/runtime source.
    await expect(page).toHaveURL((url) => url.pathname === '/dev/gallery/ds/app')
    evidence.fixture('Before-state defect: App-composed link from /dev/gallery/ds resolves /dev/gallery/ds/app and renders Overview; direct /dev/gallery/app supplies actual specimens, not navigation success.')
    await evidence.surface('Component Gallery', '/dev/gallery', 'overview', 'Component Gallery', () =>
      expect(page.getByRole('heading', { name: 'Two sections', exact: true })).toBeVisible(),
    'app-link-wrong-route-observation')
    await visit('/dev/gallery/app')
  }
  await evidence.route('Component Gallery', '/dev/gallery', 'app-composed-specimens', 'Component Gallery', () =>
    expect(page.getByRole('button', { name: 'Open dialog', exact: true })).toBeVisible())
  const skinGroup = page.locator('fieldset').filter({ has: page.locator('legend').filter({ hasText: /^Skin$/ }) })
  await skinGroup.getByRole('radio', { name: 'vapour', exact: true }).click()
  evidence.skin('vapour')
  const atmosphereGroup = page.locator('fieldset').filter({ has: page.locator('legend').filter({ hasText: /^Atmosphere$/ }) })
  await atmosphereGroup.getByRole('radio', { name: /^quiet/ }).click()
  await evidence.route('Component Gallery', '/dev/gallery', 'skin-atmosphere-selection', 'Component Gallery', async () => {
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'vapour')
    await expect(page.locator('html')).toHaveAttribute('data-atmosphere', 'quiet')
    await expect(atmosphereGroup.getByRole('radio', { name: /^quiet/ })).toHaveAttribute('aria-checked', 'true')
  })
  await page.getByRole('button', { name: 'Open dialog', exact: true }).click()
  await evidence.route('Component Gallery', '/dev/gallery', 'triggered-dialog-toast-motion', 'Component Gallery', () =>
    expect(page.getByRole('dialog', { name: 'Swap exercise', exact: true })).toBeVisible())
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Swap exercise', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Show negative toast', exact: true }).click()
  await evidence.surface('Component Gallery', '/dev/gallery', 'triggered-dialog-toast-motion', 'Component Gallery', () =>
    expect(page.getByRole('alert').first()).toBeVisible(), 'toast')
  expect(evidence.modelAttempts()).toBe(0)
})

test('Entry: authentic public redirects, unmatched route and sign out', async ({ authenticatedPage: page, visit, evidence }) => {
  await visit('/welcome')
  await evidence.transition('Welcome', '/welcome', 'authenticated-redirect', '/welcome', '/', 'Today', () =>
    expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeEnabled())
  await visit('/login')
  await evidence.transition('OTP Login', '/login', 'authenticated-redirect', '/login', '/', 'Today', () =>
    expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeEnabled())
  await visit('/task-040-unmatched')
  await evidence.route('Not Found', '*', 'unmatched-route', 'Page not found', () =>
    expect(page.getByRole('link', { name: 'Return to CLEAR', exact: true })).toBeVisible())
  await page.getByRole('link', { name: 'Return to CLEAR', exact: true }).click()
  await evidence.transition('Not Found', '*', 'home-or-welcome-return', '/task-040-unmatched', '/', 'Today', () =>
    expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeEnabled())
  await visit('/settings')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await evidence.transition('Settings', '/settings', 'sign-out', '/settings', '/welcome', 'CLEAR', async () => {
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
    expect(await page.evaluate((key) => localStorage.getItem(key) === null, SESSION_KEY)).toBe(true)
  })
  // The authenticatedPage init script restores only if absent on fresh documents;
  // this native client-side sign-out transition does not reload that fixture.
  expect(evidence.modelAttempts()).toBe(0)
})
