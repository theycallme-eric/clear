import type { CDPSession, Locator, Page, Route } from '@playwright/test'

import { reviewHandoff } from '../src/state/review-handoff'
import { makeSessionAcceptance } from '../src/test/factories'
import { fixtureLocation, onboardedProfile } from '../src/test/user-data-double'
import { reconstructionFixture, snapshotFixture, type SnapshotFixture } from '../src/test/workout-double'
import { installDeterministicCapture } from './design-0143/fixtures'
import { expect, test } from './fixtures'

/**
 * TASK-018 / JOURNEY-017 — one bounded local smoke over the integrated
 * set-logging sheet, effort, correction/clear, paired section navigation, the
 * movement and rest clocks, the top menu and the long-list swap return.
 *
 * Production `/workout` and `/review` routes on synthetic, non-personal state.
 * Every Auth/PostgREST/function request is answered in this file; any other
 * request leaving the local dev server is refused and fails the case. No model
 * request, real account, service-role credential or forwarded write exists.
 * Viewport resizing is a local layout exercise only: it is not an iOS
 * keyboard, status-bar, installation or physical-iPhone result, and installed
 * device outcomes stay pending in post-launch manual UAT outside this suite.
 */
const OWNER = '00000000-0000-4000-8000-000000000018'
const AUTH_KEY = 'clear.auth.session'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const SQUAT_REST = 45
const SESSION_SHAPE: SnapshotFixture = {
  userId: OWNER,
  title: 'Synthetic integrated smoke',
  startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  sections: [
    {
      title: 'Strength',
      sectionType: 'primary_lift',
      blocks: [{ exercises: [{ prescription: {
        exercise_id: 'back-squat', sets: 3, target_value: 8, rest_seconds: SQUAT_REST,
      } }] }],
    },
    {
      title: 'Core',
      sectionType: 'accessory',
      blocks: [{ exercises: [{ prescription: {
        exercise_id: 'hollow-body-hold', equipment_used: 'bodyweight', load_type: 'bodyweight',
        load_value: null, modality: 'time', target_value: 30, sets: 2, rest_seconds: 30,
      } }] }],
    },
  ],
}
const SESSION = snapshotFixture(SESSION_SHAPE)
/** What the performed-session read answers: the same synthetic structure. */
const PERFORMED = reconstructionFixture({ ...SESSION_SHAPE, reconstruction: 'performed' })
const ACCEPTANCE = makeSessionAcceptance({
  date: new Date().toISOString().slice(0, 10),
  goal_preset: 'strength',
})
const SWAP_LENGTH = 24
const SWAP_LAST = 'Synthetic integrated hinge 24'
const CANDIDATES = [{
  section: 'primary_lift',
  relaxed: false,
  candidates: Array.from({ length: SWAP_LENGTH }, (_, index) => {
    const suffix = String(index + 1).padStart(2, '0')
    return {
      exercise_id: `synthetic-integrated-hinge-${suffix}`,
      name: `Synthetic integrated hinge ${suffix}`,
      exercise_role: 'compound_lift', can_be_primary: true,
      movement_patterns: ['hinge'], primary_patterns: ['hinge'],
      component_movements: [], muscles: [], usable_equipment: ['barbell'],
    }
  }),
}]
/**
 * Normal phone, then the narrow/short phone. No tablet or desktop size.
 * `keyboard` is a local keyboard-like height reduction where it is locally
 * meaningful. At 320 wide any further reduction leaves the vendored foot's
 * 45% cap shorter than the paired navigation; that is recorded in
 * docs/progress/ui-polish-2026-10-26-text-final/TASK-018.md, not asserted.
 */
const VIEWPORTS = [
  { width: 390, height: 844, keyboard: { width: 390, height: 600 } },
  { width: 320, height: 568, keyboard: null },
] as const

type Viewport = { width: number; height: number }
type Mutation = { operation: string; set_number: number; exercise_id: string; values: Record<string, unknown> }

/**
 * The synthetic API. Reads answer fixtures; the two writes the journey makes
 * (set observations and a section's block result) are answered here and never
 * forwarded. `failNextMutation` refuses the next observation write once.
 */
async function syntheticApi(page: Page, baseURL: string) {
  const origin = new URL(baseURL).origin
  const unexpected: string[] = []
  const external: string[] = []
  const mutations: Mutation[] = []
  const blockResults: unknown[] = []
  let failNextMutation = false
  let functionPosts = 0
  let candidateReads = 0
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })

  // Registered first, so the API handlers below take precedence. Anything else
  // that is not the local dev server is stopped before it is sent.
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === origin) return route.continue()
    external.push(`${route.request().method()} ${url.origin}${url.pathname}`)
    return route.abort('blockedbyclient')
  })
  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: CORS, json: body })
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/')) {
      if (request.method() === 'POST') functionPosts += 1
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (request.method() === 'GET') {
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'strength' })])
      if (name === 'locations') return reply([fixtureLocation({
        id: ACCEPTANCE.location_id!, user_id: OWNER, tier: 'full',
      })])
      if (['workout_sessions', 'load_anchors', 'location_equipment', 'saved_workout_attempts',
        'saved_workouts', 'saved_workout_completions', 'rest_days', 'user_constraints'].includes(name)) {
        return reply([])
      }
    }
    if (request.method() === 'POST' && name === 'block_results') {
      const body = request.postDataJSON() as Record<string, unknown> | Record<string, unknown>[]
      const row = { ...(Array.isArray(body) ? body[0] : body),
        id: `00000000-0000-4000-8000-1000000000${String(blockResults.length + 1).padStart(2, '0')}`,
        created_at: new Date().toISOString() }
      blockResults.push(row)
      return reply([row], 201)
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session' || name === 'session_snapshot') {
        return reply(page.url().endsWith('/workout') ? SESSION : null)
      }
      if (name === 'session_as_performed') return reply(PERFORMED)
      if (name === 'mutate_set_observation') {
        const p = request.postDataJSON() as Record<string, unknown> & { p_values: Record<string, unknown> }
        if (failNextMutation) {
          failNextMutation = false
          return reply({ code: 'PGRST000', message: 'Synthetic refused write.' }, 503)
        }
        const mutation = {
          observation_id: p.p_observation_id, mutation_id: p.p_mutation_id, revision: p.p_revision,
          expected_revision: p.p_expected_revision, operation: p.p_operation,
          exercise_id: p.p_exercise_id, set_number: p.p_set_number, values: p.p_values,
        }
        mutations.push(mutation as Mutation)
        const cleared = p.p_operation === 'clear'
        const row = cleared ? null : {
          id: p.p_observation_id, workout_exercise_id: p.p_exercise_id,
          prescription_revision_status: 'active', set_number: p.p_set_number,
          actual_reps: null, actual_duration_seconds: null, actual_distance: null,
          actual_distance_unit: null, weight: null, weight_unit: 'kg', rpe: null,
          is_warmup_set: false, created_at: new Date().toISOString(), effort: null,
          ...p.p_values, mutation_revision: p.p_revision, last_mutation_id: p.p_mutation_id,
        }
        return reply({ outcome: 'applied', mutation,
          head: { revision: p.p_revision, mutation_id: p.p_mutation_id, cleared, row } })
      }
      if (name === 'generation_candidate_sets_for_goal') {
        candidateReads += 1
        return reply(CANDIDATES)
      }
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history'].includes(name)) {
        return reply([])
      }
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic integrated-smoke request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ authKey, owner, handoff }) => {
    localStorage.setItem(authKey, JSON.stringify({
      accessToken: 'synthetic-integrated-session', refreshToken: 'synthetic-integrated-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-integrated@example.invalid' },
    }))
    if (location.pathname === '/review') {
      history.replaceState({ usr: handoff, key: 'synthetic-integrated-proof', idx: 0 }, '', location.href)
    }
  }, { authKey: AUTH_KEY, owner: OWNER, handoff: reviewHandoff(ACCEPTANCE) })

  return {
    mutations,
    blockResults,
    failNextMutation() { failNextMutation = true },
    assertContained(expected: { candidateReads: number }) {
      expect(external).toEqual([])
      expect(unexpected).toEqual([])
      expect(functionPosts).toBe(0)
      expect(candidateReads).toBe(expected.candidateReads)
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

/** Fully inside the viewport, and nothing in it clipped horizontally. */
async function unclipped(target: Locator, viewport: Viewport) {
  await expect(target).toBeVisible()
  const box = await target.boundingBox()
  if (box === null) throw new Error('Integrated smoke could not read a rendered target')
  expect(box.x).toBeGreaterThanOrEqual(-1)
  expect(box.y).toBeGreaterThanOrEqual(-1)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1)
  // A clipping box must not hide content, and nothing drawn inside the target
  // may run past the viewport's sides.
  expect(await target.evaluate((element, width) => {
    const clips = getComputedStyle(element).overflowX !== 'visible'
    if (clips && element.scrollWidth > element.clientWidth + 1) return false
    return [element, ...element.querySelectorAll('*')].every((node) => {
      const rect = node.getBoundingClientRect()
      return rect.width === 0 || (rect.left >= -1 && rect.right <= width + 1)
    })
  }, viewport.width)).toBe(true)
  return box
}

/** The nearest ancestor that actually scrolls vertically, or null. */
function scrollerOf(target: Locator) {
  return target.evaluateHandle((element) => {
    for (let node = element.parentElement; node !== null; node = node.parentElement) {
      const overflow = getComputedStyle(node).overflowY
      if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node
    }
    return null
  })
}

/**
 * Brings a target fully on screen with Chromium touch swipes on its own
 * scroller — never by assigning scroll position. The swipe runs only through
 * points that hit-test inside that scroller, so an overlapping footer cannot
 * stand in for it.
 */
async function touchReach(page: Page, cdp: CDPSession, target: Locator, viewport: Viewport) {
  await expect(target).toHaveCount(1)
  await expect(target).toBeVisible()
  let slop = 15
  for (let swipe = 0; ; swipe += 1) {
    const box = await target.boundingBox()
    if (box === null) throw new Error('Touch target disappeared')
    const scroller = await scrollerOf(target)
    // The scroller's visible, unobscured span along its centre line.
    const area = await scroller.evaluate((node) => {
      if (node === null) return null
      const rect = (node as Element).getBoundingClientRect()
      const x = rect.left + rect.width / 2
      let top: number | null = null
      let bottom: number | null = null
      for (let y = Math.max(0, rect.top) + 2; y < Math.min(innerHeight, rect.bottom) - 1; y += 2) {
        const hit = document.elementFromPoint(x, y)
        if (hit !== null && (node as Element).contains(hit)) {
          top ??= y
          bottom = y
        }
      }
      return top === null || bottom === null ? null : { x, top, bottom }
    })
    const top = area?.top ?? 0
    const bottom = area?.bottom ?? viewport.height
    // Shown inside its scroller: wholly, or within 12px where the visible
    // window is barely taller than the control itself.
    const shown = Math.min(box.y + box.height, bottom) - Math.max(box.y, top)
    if (shown >= Math.min(box.height, bottom - top) - 12 && shown > 0) break
    if (area === null) throw new Error('Target is off screen with no visible scroller to reach it')
    expect(swipe, `touch reach did not settle: ${JSON.stringify({ box, area })}`).toBeLessThan(48)
    const span = bottom - top
    // A control taller than its visible scroller can never be wholly shown.
    expect(box.height, 'control is taller than its visible scroller').toBeLessThanOrEqual(span + 6)
    const up = box.y + box.height > bottom
    const x = area.x
    const from = up ? bottom - 1 : top + 1
    // The exact offset plus the touch slop Chromium actually consumed last time.
    const offset = up ? box.y + box.height - bottom : top - box.y
    const distance = Math.min(span - 2, offset + slop + 1)
    const before = await scroller.evaluate((node) => (node as Element).scrollTop)
    const point = (y: number) => [{ x, y, id: 1, radiusX: 1, radiusY: 1, force: 1 }]
    let touching = false
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from) })
      touching = true
      for (let step = 1; step <= 10; step += 1) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove', touchPoints: point(from + (up ? -1 : 1) * distance * step / 10),
        })
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      touching = false
    } finally {
      if (touching) await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
    }
    // A move shorter than the touch slop scrolls nothing: grow it and retry.
    // Larger moves must scroll, or the scroller has swallowed the gesture.
    if (distance <= slop + 2) {
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
      if (await scroller.evaluate((node) => (node as Element).scrollTop) === before) {
        slop += 6
        continue
      }
    }
    await expect.poll(() => scroller.evaluate((node) => (node as Element).scrollTop), {
      message: `touch swipe moved no scroller: ${JSON.stringify(await target.evaluate((element, at) => {
        const chain = []
        for (let node = element.parentElement; node !== null; node = node.parentElement) {
          const style = getComputedStyle(node)
          if (style.overflowY !== 'visible') chain.push({ cls: node.className, top: node.scrollTop,
            sh: node.scrollHeight, ch: node.clientHeight, ov: style.overflowY, ob: style.overscrollBehaviorY })
        }
        return { from: at, hit: document.elementFromPoint(at.x, at.y)?.className, chain }
      }, { x, y: from }))}`,
    }).not.toBe(before)
    // A tap during fling momentum only stops the fling, as on a phone.
    let last = Number.NaN
    let still = 0
    await expect.poll(async () => {
      const now = await scroller.evaluate((node) => (node as Element).scrollTop)
      still = now === last ? still + 1 : 0
      last = now
      return still >= 3
    }, { intervals: [120] }).toBe(true)
    slop = Math.max(8, Math.min(span / 2, distance - Math.abs(last - before)))
  }
  return unclipped(target, viewport)
}

/** Reaches a target by touch, hit-tests it, then taps where it is drawn. */
async function touchTap(page: Page, cdp: CDPSession, target: Locator, viewport: Viewport) {
  await expect(target).toBeEnabled()
  // Layout must have stopped moving (a sheet minimising, say) before a tap.
  let previous = ''
  let steady = 0
  await expect.poll(async () => {
    const now = JSON.stringify(await target.boundingBox())
    steady = now === previous ? steady + 1 : 0
    previous = now
    return steady >= 2
  }, { intervals: [100] }).toBe(true)
  const box = await touchReach(page, cdp, target, viewport)
  // The first sampled point inside the box that hit-tests to the control.
  const point = await target.evaluate((element, rect) => {
    for (const fy of [0.5, 0.3, 0.7]) {
      for (const fx of [0.5, 0.25, 0.75, 0.1, 0.9]) {
        const at = { x: rect.x + rect.width * fx, y: rect.y + rect.height * fy }
        const hit = document.elementFromPoint(at.x, at.y)
        if (hit !== null && element.contains(hit)) return at
      }
    }
    return null
  }, box)
  if (point === null) {
    const cover = await target.evaluate((element, rect) => {
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      return { target: element.outerHTML.slice(0, 160), hit: hit?.outerHTML.slice(0, 160) ?? null }
    }, box)
    throw new Error(`Touch target is covered at every sampled point: ${JSON.stringify({ box, cover })}`)
  }
  await page.touchscreen.tap(point.x, point.y)
}

test.use({ timezoneId: 'UTC' })

test.beforeEach(({ browserName }, testInfo) => {
  // Local synthetic proof only: a remote target would not be this suite.
  const hostname = new URL(String(testInfo.project.use.baseURL)).hostname
  expect(['localhost', '127.0.0.1']).toContain(hostname)
  expect(testInfo.project.name).toBe('mobile')
  expect(browserName).toBe('chromium')
  testInfo.annotations.push({ type: 'proof-mode', description:
    'Local synthetic intercepted API on production routes with Chromium touch input; not backend, device or installed-iPhone proof.' })
})

test.afterEach(({ browserName }, testInfo) => {
  // A skipped or fixme case is a missing proof, never a pass.
  expect(testInfo.expectedStatus).toBe('passed')
  expect(browserName).toBe('chromium')
})

for (const { keyboard, ...viewport } of VIEWPORTS) {
  const short: Viewport = keyboard ?? viewport

  test(`JOURNEY-017: integrated sheet, effort, correction, clocks and paired navigation at ${viewport.width}x${viewport.height}`, async ({ page, visit, checkA11y }, testInfo) => {
    test.setTimeout(180_000)
    await page.setViewportSize(viewport)
    const api = await syntheticApi(page, String(testInfo.project.use.baseURL))
    await page.clock.install()
    await visit('/workout')
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Workout')
    const cdp = await page.context().newCDPSession(page)
    try {
      const tap = (target: Locator, size: Viewport = viewport) => touchTap(page, cdp, target, size)
      const reach = (target: Locator, size: Viewport = viewport) => touchReach(page, cdp, target, size)
      const sessionTime = page.getByRole('timer', { name: 'Session time' })
      await expect(sessionTime).toBeVisible()
      const nav = page.getByRole('navigation', { name: 'Workout sections' })
      const previous = nav.getByRole('button', { name: 'Previous', exact: true })
      const next = nav.getByRole('button', { name: 'Next section', exact: true })
      await expect(nav.getByRole('progressbar', { name: 'Section 1 of 2' })).toBeVisible()
      await expect(previous).toBeDisabled()
      const [previousBox, nextBox] = [await unclipped(previous, viewport), await unclipped(next, viewport)]
      expect(Math.abs(previousBox.y - nextBox.y)).toBeLessThanOrEqual(1)
      expect(previousBox.x).toBeLessThan(nextBox.x)

      // The top menu holds Abandon and closes without abandoning.
      const header = page.locator('header').filter({ has: page.getByRole('heading', { level: 1 }) })
      const actions = header.getByRole('button', { name: 'Actions', exact: true })
      await tap(actions)
      await expect(actions).toHaveAttribute('aria-expanded', 'true')
      await unclipped(header.getByRole('group', { name: 'Actions' }).getByRole('button', { name: 'Abandon', exact: true }), viewport)
      await page.keyboard.press('Escape')
      await expect(actions).toHaveAttribute('aria-expanded', 'false')
      await expect(actions).toBeFocused()

      // New entry: the movement card's own Log set opens the half-sheet.
      const card = (name: RegExp) => page.locator('section')
        .filter({ has: page.getByRole('heading', { name }) })
        .filter({ has: page.getByRole('button', { name: 'Log set', exact: true }) }).last()
      const squat = card(/back squat$/)
      await tap(squat.getByRole('button', { name: 'Log set', exact: true }))
      const form = (verb: 'Log' | 'Edit', set: number, movement = 'back squat') =>
        page.getByRole('form', { name: `${verb} set ${set} of ${movement}` })
      const minimize = page.getByRole('button', { name: 'Minimize', exact: true })
      await expect(form('Log', 1)).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Log set 1', exact: true })).toBeVisible()
      await expect(minimize).toHaveCount(1)
      await expect(minimize).toHaveAttribute('aria-expanded', 'true')
      await reach(minimize)
      const reps = form('Log', 1).getByLabel('Reps', { exact: true })
      const weight = form('Log', 1).getByLabel('Weight', { exact: true })
      await expect(reps).toHaveValue('8')
      await expect(form('Log', 1).getByLabel('Unit', { exact: true })).toBeVisible()
      await expect(page.getByText('Reps performed')).toHaveCount(0)
      await expect(page.getByText('No sets logged yet')).toHaveCount(0)
      expect(api.mutations).toHaveLength(0)

      // Keyboard-like resize: a shorter window keeps the focused entry, its
      // value and the sheet's action reachable. Not an iOS keyboard result.
      await tap(weight)
      await page.keyboard.type('60')
      await expect(weight).toBeFocused()
      // The paired navigation stays wholly on screen once layout follows.
      const resize = async (size: Viewport) => {
        await page.setViewportSize(size)
        await expect(nav).toBeInViewport({ ratio: 1 })
        await unclipped(previous, size)
        await unclipped(next, size)
      }
      await resize(short)
      await expect(weight).toBeFocused()
      await expect(weight).toHaveValue('60')
      await reach(minimize, short)
      await expect(weight).toBeFocused()
      await reach(weight, short)
      const logOne = form('Log', 1).getByRole('button', { name: 'Log set 1', exact: true })
      const effort = form('Log', 1).getByRole('radiogroup')
      await tap(effort.getByRole('radio', { name: 'About right' }), short)
      await expect(effort.getByRole('radio', { name: 'About right' })).toHaveAttribute('aria-checked', 'true')
      await expect(form('Log', 1).getByRole('button', { name: 'Clear effort for set 1' })).toBeVisible()
      await reach(logOne, short)
      await expect(weight).toHaveValue('60')
      await resize(viewport)
      await expect(weight).toHaveValue('60')
      await checkA11y()

      // A refused save never reads as saved, and the entry is kept to retry.
      api.failNextMutation()
      await tap(logOne)
      const logged = squat.getByRole('list', { name: 'Logged sets' })
      const setOne = logged.getByRole('listitem').filter({ hasText: 'Set 1' })
      await expect(setOne).toContainText('On this device only')
      await expect(setOne).not.toContainText('Saved')
      expect(api.mutations).toHaveLength(0)
      await page.evaluate(() => window.dispatchEvent(new Event('online')))
      await expect(setOne).toContainText('Saved')
      await expect(setOne).toContainText('8 reps')
      await expect(setOne).toContainText('60 kg')
      await expect(setOne.getByRole('img', { name: 'Effort: about right' })).toBeVisible()
      expect(api.mutations).toMatchObject([{ operation: 'insert', set_number: 1,
        values: { actual_reps: 8, weight: 60, weight_unit: 'kg', effort: 'about_right' } }])

      // Rest runs; skipping it leaves logging reachable.
      const rest = page.getByRole('region', { name: 'Rest' })
      await expect(rest.getByRole('timer', { name: 'Time remaining' })).toBeVisible()
      await tap(rest.getByRole('button', { name: 'Skip rest', exact: true }))
      await expect(rest).toHaveCount(0)
      if (await form('Log', 2).count() === 0) await tap(squat.getByRole('button', { name: 'Log set', exact: true }))
      await expect(form('Log', 2)).toBeVisible()
      await tap(form('Log', 2).getByRole('button', { name: 'Log set 2', exact: true }))
      await expect(logged.getByRole('listitem').filter({ hasText: 'Set 2' })).toContainText('Saved')

      // Rest expiry, with the sheet minimised, also leaves logging reachable.
      await expect(rest).toBeVisible()
      await tap(minimize)
      await expect(form('Log', 3)).toHaveCount(0)
      await page.clock.fastForward((SQUAT_REST + 2) * 1000)
      await expect(rest).toHaveCount(0)
      await tap(squat.getByRole('button', { name: 'Log set', exact: true }))
      await expect(form('Log', 3)).toBeVisible()
      await tap(minimize)

      // Edit and clear the effort; Cancel / Save correction stay aligned.
      const editOne = squat.getByRole('button', { name: 'Edit set 1', exact: true })
      await tap(editOne)
      const edit = form('Edit', 1)
      await expect(edit).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Edit set 1', exact: true })).toBeVisible()
      await expect(edit.getByRole('radio', { name: 'About right' })).toHaveAttribute('aria-checked', 'true')
      await tap(edit.getByRole('button', { name: 'Clear effort for set 1', exact: true }))
      await expect(edit.getByRole('radio', { checked: true })).toHaveCount(0)
      const cancel = edit.getByRole('button', { name: 'Cancel', exact: true })
      const save = edit.getByRole('button', { name: 'Save correction', exact: true })
      await reach(cancel)
      await reach(save)
      // Read together, after the last swipe, so both share one scroll position.
      const [cancelBox, saveBox] = [await unclipped(cancel, viewport), await unclipped(save, viewport)]
      // One shipped paired group: a row (shared top) or, where it stacks, a
      // column of equal, edge-aligned actions. Cancel comes first either way.
      const paired = edit.locator('.clr-action-group--paired')
        .filter({ has: page.getByRole('button', { name: 'Cancel', exact: true }) })
        .filter({ has: page.getByRole('button', { name: 'Save correction', exact: true }) })
      await expect(paired).toHaveCount(1)
      const row = Math.abs(cancelBox.y - saveBox.y) <= 1
      const stack = Math.abs(cancelBox.x - saveBox.x) <= 1 && Math.abs(cancelBox.width - saveBox.width) <= 1
      expect(row || stack).toBe(true)
      expect(row ? cancelBox.x < saveBox.x : cancelBox.y < saveBox.y).toBe(true)
      await checkA11y()
      await tap(save)
      await expect(edit).toHaveCount(0)
      await expect(setOne.getByRole('img', { name: /^Effort:/ })).toHaveCount(0)
      await expect(setOne).toContainText('Saved')
      expect(api.mutations.at(-1)).toMatchObject({ operation: 'correct', set_number: 1, values: { effort: null } })

      // Paired navigation forward to the timed movement and its own clock.
      await tap(next)
      await expect(page.getByRole('heading', { level: 2, name: 'Accessory' })).toBeFocused()
      await expect(nav.getByRole('progressbar', { name: 'Section 2 of 2' })).toBeVisible()
      // The last section's right-hand action is the existing finish, not pressed.
      await unclipped(nav.getByRole('button', { name: 'Finish workout', exact: true }), viewport)
      expect(api.blockResults.length).toBeGreaterThan(0)
      const countdown = page.getByRole('region', { name: 'hollow body hold countdown' })
      const movementClock = countdown.getByRole('timer', { name: 'Countdown' })
      await expect(movementClock).toBeVisible()
      await expect(sessionTime).toBeVisible()
      const startText = await movementClock.textContent()
      await tap(countdown.getByRole('button', { name: 'Start', exact: true }))
      await page.clock.fastForward(4000)
      await expect(movementClock).not.toHaveText(startText ?? '')
      await tap(countdown.getByRole('button', { name: 'Pause', exact: true }))

      const hold = card(/hollow body hold$/)
      await tap(hold.getByRole('button', { name: 'Log set', exact: true }))
      const timed = form('Log', 1, 'hollow body hold')
      await expect(timed.getByLabel('Seconds', { exact: true })).toHaveValue('30')
      await expect(timed.getByLabel('Weight', { exact: true })).toHaveCount(0)
      await tap(timed.getByRole('button', { name: 'Log set 1', exact: true }))
      await expect(hold.getByRole('list', { name: 'Logged sets' }).getByRole('listitem')
        .filter({ hasText: 'Set 1' })).toContainText('Saved')
      await tap(minimize)

      // And back: Previous returns to the first section.
      await tap(previous)
      await expect(page.getByRole('heading', { level: 2, name: 'Primary lift' })).toBeFocused()
      await expect(nav.getByRole('progressbar', { name: 'Section 1 of 2' })).toBeVisible()
      await expect(page).toHaveURL((url) => url.pathname === '/workout')
      await checkA11y()
      api.assertContained({ candidateReads: 0 })
    } finally {
      await cdp.detach()
    }
  })

  test(`JOURNEY-017: long-list swap returns to Review by touch at ${viewport.width}x${viewport.height}`, async ({ page, visit, checkA11y }, testInfo) => {
    test.setTimeout(120_000)
    await page.setViewportSize(viewport)
    const api = await syntheticApi(page, String(testInfo.project.use.baseURL))
    await visit('/review')
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(ACCEPTANCE.workout.title)
    const cdp = await page.context().newCDPSession(page)
    try {
      const original = page.getByRole('button', { name: 'Swap back squat', exact: true })
      await touchTap(page, cdp, original, viewport)
      const dialog = page.getByRole('dialog', { name: 'Swap back squat', exact: true })
      const list = dialog.getByRole('list', { name: 'Alternatives', exact: true })
      await expect(list.getByRole('button')).toHaveCount(SWAP_LENGTH)
      await unclipped(dialog.getByRole('button', { name: 'Keep back squat', exact: true }), viewport)
      const last = list.getByRole('button', { name: new RegExp(`^${SWAP_LAST}\\s*BARBELL$`) })
      await expect(last).not.toBeInViewport()
      await checkA11y()
      await touchTap(page, cdp, last, viewport)
      await expect(page.locator('dialog[open]')).toHaveCount(0)
      await expect(page).toHaveURL((url) => url.pathname === '/review')
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(ACCEPTANCE.workout.title)
      const replacement = page.getByRole('button', { name: 'Swap synthetic integrated hinge 24', exact: true })
      await expect(replacement).toBeFocused()
      await expect(page.locator('[data-clear-toast-host]').getByRole('status')).toHaveText(`Swapped in ${SWAP_LAST}.`)
      await expect(page.getByRole('button', { name: 'Start workout', exact: true })).toBeEnabled()
      await checkA11y()
      api.assertContained({ candidateReads: 1 })
    } finally {
      await cdp.detach()
    }
  })
}
