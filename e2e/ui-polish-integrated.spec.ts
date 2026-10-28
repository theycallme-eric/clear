import type { CDPSession, Locator, Page, Route } from '@playwright/test'

import { reviewHandoff } from '../src/state/review-handoff'
import { blockResultRowSchema, exerciseSetLogRowSchema, type BlockResultRow } from '../src/state/schemas'
import { isSetObservationMutation, sameSetMutation, type SetObservationAck, type SetObservationMutation } from '../src/state/set-observation-mutation'
import { makeSessionAcceptance } from '../src/test/factories'
import { fixtureLocation, onboardedProfile } from '../src/test/user-data-double'
import { definitionFixture, reconstructionFixture, snapshotFixture, type SnapshotFixture } from '../src/test/workout-double'
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
/** One representative combined round, then the optional-entry circuit seam. */
const GROUPED_SHAPE: SnapshotFixture = {
  userId: OWNER,
  title: 'Synthetic grouped integration',
  startedAt: SESSION_SHAPE.startedAt,
  sections: [
    { sectionType: 'accessory', blocks: [{
      structureType: 'superset', rounds: 2, roundRestSeconds: 15,
      exercises: [
        { prescription: { exercise_id: 'bench-press', order_index: 0, modality: 'reps', target_value: 8, sets: 2 } },
        { prescription: { exercise_id: 'plank', order_index: 1, equipment_used: 'bodyweight',
          load_type: 'bodyweight', load_value: null, modality: 'time', target_value: 30, sets: 2 } },
      ],
    }] },
    { sectionType: 'conditioning', blocks: [{
      structureType: 'circuit', rounds: 3, roundRestSeconds: 10,
      exercises: [
        { prescription: { exercise_id: 'hollow-body-hold', order_index: 0,
          equipment_used: 'bodyweight', load_type: 'bodyweight', load_value: null,
          modality: 'time', target_value: 120, sets: 3, rest_seconds: null } },
        { prescription: { exercise_id: 'goblet-squat', order_index: 1, target_value: 6, sets: 3, rest_seconds: null } },
      ],
    }] },
    { sectionType: 'cooldown', blocks: [{ exercises: [{ prescription: {
      exercise_id: 'bodyweight-squat', equipment_used: 'bodyweight', load_type: 'bodyweight',
      load_value: null, sets: 1, target_value: 5, rest_seconds: null,
    } }] }] },
  ],
}
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
 * Each phone also exercises the short window previously found to clip its
 * footer. Resizing is local geometry proof, never an installed iOS keyboard.
 */
const VIEWPORTS = [
  { width: 390, height: 844, keyboard: { width: 390, height: 465 } },
  { width: 320, height: 568, keyboard: { width: 320, height: 312 } },
] as const

type Viewport = { width: number; height: number }

/**
 * The synthetic API. Reads answer fixtures; the two writes the journey makes
 * (set observations and a section's block result) are answered here and never
 * forwarded. `failNextMutation` refuses the next observation write once.
 */
async function syntheticApi(page: Page, baseURL: string, shape: SnapshotFixture = SESSION_SHAPE) {
  const origin = new URL(baseURL).origin
  const unexpected: string[] = []
  const external: string[] = []
  const mutations: SetObservationMutation[] = []
  const attempts: SetObservationMutation[] = []
  const acknowledgements: SetObservationAck[] = []
  const heads = new Map<string, SetObservationAck['head']>()
  const receipts = new Map<string, SetObservationAck>()
  const blockResults: BlockResultRow[] = []
  const initial = snapshotFixture(shape)
  const performed = reconstructionFixture({ ...shape, reconstruction: 'performed' })
  const exercises = new Map(initial.sections.flatMap((section) => section.blocks
    .flatMap((block) => block.exercises.map(({ exercise }) => [exercise.id, exercise] as const))))
  const blockIds = new Set(initial.sections.flatMap((section) => section.blocks.map(({ block }) => block.id)))
  const rowsFor = (exerciseId: string) => [...heads.values()]
    .flatMap((head) => head.row === null || head.row.workout_exercise_id !== exerciseId ? [] : [head.row])
  const snapshot = () => ({ ...initial, sections: initial.sections.map((section) => ({ ...section,
    blocks: section.blocks.map((block) => ({ ...block,
      exercises: block.exercises.map((exercise) => ({ ...exercise, set_logs: rowsFor(exercise.exercise.id) })),
    })),
  })) })
  const reconstruction = () => ({ ...performed, sections: performed.sections.map((section) => ({ ...section,
    blocks: section.blocks.map((block) => ({ ...block,
      block_result: blockResults.find((row) => row.block_id === block.block.id) ?? null,
      exercises: block.exercises.map((exercise) => ({ ...exercise, set_logs: rowsFor(exercise.exercise.id) })),
    })),
  })) })
  let failNextMutation = false
  let functionPosts = 0
  let candidateReads = 0
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })

  // Registered first, so the API handlers below take precedence. Anything else
  // that is not the local dev server is stopped before it is sent.
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === origin && ['GET', 'HEAD'].includes(route.request().method())) return route.continue()
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
      if (name === 'exercise_definitions') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        return reply([...exercises.values()].filter((exercise) => id === undefined || exercise.exercise_id === id)
          .map((exercise) => definitionFixture({ id: exercise.exercise_id })))
      }
      if (name === 'workout_exercises') return reply([...exercises.values()])
      if (['workout_sessions', 'load_anchors', 'location_equipment', 'saved_workout_attempts',
        'saved_workouts', 'saved_workout_completions', 'rest_days', 'user_constraints'].includes(name)) {
        return reply([])
      }
    }
    if (request.method() === 'POST' && name === 'block_results') {
      const body: unknown = request.postDataJSON()
      expect(Array.isArray(body) && body.length === 1).toBe(true)
      const insert = (body as Record<string, unknown>[])[0]
      expect(blockIds.has(String(insert.block_id))).toBe(true)
      expect(blockResults.some((row) => row.block_id === insert.block_id)).toBe(false)
      const row = blockResultRowSchema.parse({ elapsed_seconds: null, completed_under_cap: null,
        rounds_completed: null, partial_round_reps: null, minutes_completed: null, highest_rung: null,
        perceived_effort: null, notes: null, ...insert,
        id: `00000000-0000-4000-8000-1000000000${String(blockResults.length + 1).padStart(2, '0')}`,
        created_at: new Date().toISOString() })
      blockResults.push(row)
      return reply([row], 201)
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session' || name === 'session_snapshot') {
        return reply(new URL(page.url()).pathname === '/workout' ? snapshot() : null)
      }
      if (name === 'session_as_performed') return reply(reconstruction())
      if (name === 'mutate_set_observation') {
        const p = request.postDataJSON() as Record<string, unknown> & { p_values: Record<string, unknown> }
        const mutation = {
          observation_id: p.p_observation_id, mutation_id: p.p_mutation_id, revision: p.p_revision,
          expected_revision: p.p_expected_revision, operation: p.p_operation,
          exercise_id: p.p_exercise_id, set_number: p.p_set_number, values: p.p_values,
        }
        expect(isSetObservationMutation(mutation)).toBe(true)
        if (!isSetObservationMutation(mutation)) return reply({ outcome: 'invalid' }, 400)
        expect(exercises.has(mutation.exercise_id)).toBe(true)
        // A retry must carry the durable request exactly, even after a refusal.
        const priorAttempt = attempts.find((attempt) => attempt.mutation_id === mutation.mutation_id)
        if (priorAttempt !== undefined) expect(sameSetMutation(priorAttempt, mutation)).toBe(true)
        attempts.push(mutation)
        if (failNextMutation) {
          failNextMutation = false
          return reply({ code: 'PGRST000', message: 'Synthetic refused write.' }, 503)
        }
        const replay = receipts.get(mutation.mutation_id)
        if (replay !== undefined) {
          expect(sameSetMutation(replay.mutation, mutation)).toBe(true)
          return reply({ ...replay, outcome: 'replayed' })
        }
        const previous = heads.get(mutation.observation_id)
        expect(mutation.expected_revision).toBe(previous?.revision ?? 0)
        expect(mutation.revision).toBe((previous?.revision ?? 0) + 1)
        if (mutation.operation === 'insert') {
          expect(previous).toBeUndefined()
          expect(rowsFor(mutation.exercise_id).some((row) => row.set_number === mutation.set_number)).toBe(false)
        } else {
          expect(previous?.cleared).toBe(false)
          expect(previous?.row?.workout_exercise_id).toBe(mutation.exercise_id)
          expect(previous?.row?.set_number).toBe(mutation.set_number)
        }
        const cleared = mutation.operation === 'clear'
        if (cleared) expect(mutation.values).toEqual({})
        const row = cleared ? null : exerciseSetLogRowSchema.parse({
          id: mutation.observation_id, workout_exercise_id: mutation.exercise_id,
          prescription_revision_status: 'active', set_number: mutation.set_number,
          actual_reps: null, actual_duration_seconds: null, actual_distance: null,
          actual_distance_unit: null, weight: null, weight_unit: 'kg', rpe: null,
          is_warmup_set: false, created_at: new Date().toISOString(), effort: null,
          ...(previous?.row ?? {}), ...mutation.values,
          mutation_revision: mutation.revision, last_mutation_id: mutation.mutation_id,
        })
        const ack: SetObservationAck = { outcome: 'applied', mutation,
          head: { revision: mutation.revision, mutation_id: mutation.mutation_id, cleared, row } }
        mutations.push(mutation)
        heads.set(mutation.observation_id, ack.head)
        receipts.set(mutation.mutation_id, ack)
        acknowledgements.push(ack)
        return reply(ack)
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
    attempts,
    acknowledgements,
    blockResults,
    snapshot,
    head(id: string) { return heads.get(id) },
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

/** Observe all real rectangular clipping ancestors, stopping at a top-layer modal. */
function renderedGeometry(element: Element | null) {
  if (element === null) throw new Error('The observed element is missing')
  const rect = element.getBoundingClientRect()
  const client = {
    left: rect.left + element.clientLeft,
    top: rect.top + element.clientTop,
    right: rect.left + element.clientLeft + element.clientWidth,
    bottom: rect.top + element.clientTop + element.clientHeight,
  }
  const clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
  const modal = element.closest('dialog[open]')
  const ancestors: { className: string; left: number; top: number; right: number; bottom: number }[] = []
  for (let node = element === modal ? null : element.parentElement; node !== null; node = node.parentElement) {
    const style = getComputedStyle(node)
    const box = node.getBoundingClientRect()
    const left = box.left + node.clientLeft
    const top = box.top + node.clientTop
    const right = left + node.clientWidth
    const bottom = top + node.clientHeight
    const clippedShape = style.clipPath !== 'none' || style.contain.includes('paint')
    if (/^(auto|scroll|hidden|clip)$/.test(style.overflowX) || clippedShape) {
      clip.left = Math.max(clip.left, left)
      clip.right = Math.min(clip.right, right)
    }
    if (/^(auto|scroll|hidden|clip)$/.test(style.overflowY) || clippedShape) {
      clip.top = Math.max(clip.top, top)
      clip.bottom = Math.min(clip.bottom, bottom)
    }
    ancestors.push({ className: node.className, left, top, right, bottom })
    // Native top-layer dialogs escape background clipping ancestors.
    if (node === modal) break
  }
  return { box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, client, clip, ancestors }
}

/** The whole individual control must fit its actual visible clipping intersection. */
async function unclipped(target: Locator, viewport: Viewport) {
  await expect(target).toBeVisible()
  const { box, clip, ancestors } = await target.evaluate(renderedGeometry)
  expect(box.x, JSON.stringify({ box, clip, ancestors })).toBeGreaterThanOrEqual(Math.max(0, clip.left) - 1)
  expect(box.y, JSON.stringify({ box, clip, ancestors })).toBeGreaterThanOrEqual(Math.max(0, clip.top) - 1)
  expect(box.x + box.width).toBeLessThanOrEqual(Math.min(viewport.width, clip.right) + 1)
  expect(box.y + box.height).toBeLessThanOrEqual(Math.min(viewport.height, clip.bottom) + 1)
  expect(await target.evaluate((element) => {
    const style = getComputedStyle(element)
    if (style.overflowX !== 'visible' && element.scrollWidth > element.clientWidth + 1) return false
    const box = element.getBoundingClientRect()
    return [...element.querySelectorAll('*')].every((node) => {
      const rect = node.getBoundingClientRect()
      return rect.width === 0 || (rect.left >= box.left - 1 && rect.right <= box.right + 1)
    })
  })).toBe(true)
  return box
}

/** The nearest ancestor that actually scrolls vertically, or null. */
function scrollerOf(target: Locator) {
  return target.evaluateHandle((element) => {
    const modal = element.closest('dialog[open]')
    for (let node = element.parentElement; node !== null; node = node.parentElement) {
      const overflow = getComputedStyle(node).overflowY
      if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node
      if (node === modal) break
    }
    return null
  })
}

/** Real bounded swipes with observed progress; no assigned geometry or scroll offsets. */
async function touchReach(page: Page, cdp: CDPSession, target: Locator, viewport: Viewport) {
  await expect(target).toHaveCount(1)
  await expect(target).toBeVisible()
  let slop = 15
  let noProgress = 0
  for (let swipe = 0; swipe < 48; swipe += 1) {
    const geometry = await target.evaluate(renderedGeometry)
    const { box, clip } = geometry
    if (box.x >= clip.left - 1 && box.x + box.width <= clip.right + 1 &&
        box.y >= clip.top - 1 && box.y + box.height <= clip.bottom + 1) {
      return unclipped(target, viewport)
    }
    const scroller = await scrollerOf(target)
    try {
      // An off-screen field's own frame is also off screen. Capacity and the
      // swipe path therefore belong to the scroll owner's visible client
      // window, intersected only with ancestors ABOVE that owner. The final
      // assertion still includes every clipping ancestor of the control.
      const owner = await scroller.evaluate(renderedGeometry)
      const window = {
        left: Math.max(owner.client.left, owner.clip.left),
        top: Math.max(owner.client.top, owner.clip.top),
        right: Math.min(owner.client.right, owner.clip.right),
        bottom: Math.min(owner.client.bottom, owner.clip.bottom),
      }
      expect(window.bottom - window.top, 'scroll owner has no visible client window').toBeGreaterThan(0)
      expect(box.height, 'whole control must fit its scroll owner window').toBeLessThanOrEqual(window.bottom - window.top + 1)
      expect(box.width, 'whole control must fit its scroll owner width').toBeLessThanOrEqual(window.right - window.left + 1)
      if (box.x >= window.left - 1 && box.x + box.width <= window.right + 1 &&
          box.y >= window.top - 1 && box.y + box.height <= window.bottom + 1) {
        throw new Error(`A local frame clips a control already inside its scroll window: ${JSON.stringify({ geometry, window })}`)
      }
      const up = box.y + box.height > window.bottom
      // Prefer a hit-tested padding/gutter start so a sub-threshold gesture
      // cannot activate an action. Full-width option lists may have no gutter;
      // their fallback must still make a real pan before touchEnd.
      const area = await scroller.evaluate((node, { bounds, up }) => {
        if (node === null) return null
        const interactive = 'button,a,input,select,textarea,label,[role="button"],[role="radio"],[role="checkbox"],[role="tab"],[contenteditable="true"]'
        let fallback: { x: number; top: number; bottom: number; from: number; safeStart: boolean } | null = null
        for (const fraction of [0.04, 0.96, 0.08, 0.92, 0.5, 0.25, 0.75]) {
          const x = bounds.left + (bounds.right - bounds.left) * fraction
          const runs: { top: number; bottom: number }[] = []
          let run: { top: number; bottom: number } | null = null
          for (let y = bounds.top + 2; y < bounds.bottom - 1; y += 2) {
            const hit = document.elementFromPoint(x, y)
            if (hit !== null && node.contains(hit)) {
              if (run === null) { run = { top: y, bottom: y }; runs.push(run) }
              else run.bottom = y
            } else run = null
          }
          for (const visible of up ? [...runs].reverse() : runs) {
            if (visible.bottom - visible.top < 36) continue
            const edge = up ? visible.bottom - 1 : visible.top + 1
            const candidate = { x, ...visible, from: edge, safeStart: false }
            if (fallback === null || visible.bottom - visible.top > fallback.bottom - fallback.top) fallback = candidate
            for (let inset = 0; inset <= 12; inset += 2) {
              const from = edge + (up ? -inset : inset)
              const hit = document.elementFromPoint(x, from)
              const available = up ? from - visible.top : visible.bottom - from
              if (available >= 32 && hit !== null && node.contains(hit) && hit.closest(interactive) === null) {
                return { ...candidate, from, safeStart: true }
              }
            }
          }
        }
        return fallback
      }, { bounds: window, up })
      if (area === null) throw new Error(`No visible scroller can reach the whole target: ${JSON.stringify(geometry)}`)
      const span = area.bottom - area.top
      const from = area.from
      const offset = up ? box.y + box.height - window.bottom : window.top - box.y
      const available = up ? from - area.top : area.bottom - from
      const minimumPan = Math.min(area.safeStart ? 48 : 64, available - 1)
      expect(minimumPan, 'a safe real pan needs enough visible scroll window').toBeGreaterThanOrEqual(32)
      const distance = Math.min(available - 1, Math.max(minimumPan, offset + slop + 1))
      const before = await scroller.evaluate((node) => node!.scrollTop)
      const dialogsBefore = await page.locator('dialog[open]').count()
      const point = (y: number) => [{ x: area.x, y, id: 1, radiusX: 1, radiusY: 1, force: 1 }]
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
      if (await page.locator('dialog[open]').count() !== dialogsBefore) {
        throw new Error('A scroll gesture unexpectedly changed modal state; it was not accepted as reachability')
      }
      try {
        await expect.poll(() => scroller.evaluate((node) => node!.scrollTop), {
          timeout: 1500,
          message: `safe touch pan made no progress: ${JSON.stringify({ geometry, area, distance, slop })}`,
        }).not.toBe(before)
        noProgress = 0
      } catch (error) {
        // Bounded adjustment for observed touch slop; no unchanged position
        // counts as success, and an unexpected action is never dismissed.
        noProgress += 1
        if (noProgress >= 3) throw error
        slop += 12
        continue
      }
      // A tap during fling momentum stops the fling instead of activating.
      let last = Number.NaN
      let still = 0
      await expect.poll(async () => {
        const now = await scroller.evaluate((node) => node!.scrollTop)
        still = now === last ? still + 1 : 0
        last = now
        return still >= 3
      }, { intervals: [120] }).toBe(true)
      slop = Math.max(8, Math.min(span / 2, distance - Math.abs(last - before)))
    } finally {
      await scroller.dispose()
    }
  }
  throw new Error('Touch reach exceeded its bounded swipe count')
}

/** A complete visible, hit-tested control is tapped after layout settles. */
async function touchTap(page: Page, cdp: CDPSession, target: Locator, viewport: Viewport) {
  await expect(target).toBeEnabled()
  let previous = ''
  let steady = 0
  await expect.poll(async () => {
    const now = JSON.stringify(await target.boundingBox())
    steady = now === previous ? steady + 1 : 0
    previous = now
    return steady >= 2
  }, { intervals: [100] }).toBe(true)
  const box = await touchReach(page, cdp, target, viewport)
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  expect(await target.evaluate((element, at) => {
    const hit = document.elementFromPoint(at.x, at.y)
    return hit !== null && element.contains(hit)
  }, point)).toBe(true)
  await page.touchscreen.tap(point.x, point.y)
}

/** Read the visible digits, excluding the timer's separate spoken value. */
async function timerSeconds(timer: Locator) {
  const values = await timer.locator('[aria-hidden="true"]').allTextContents()
  const digits = values.join('').match(/\d{1,2}:\d{2}(?::\d{2})?/)
  if (digits === null) throw new Error('The owning timer has no rendered digits')
  return digits[0].split(':').reduce((seconds, value) => seconds * 60 + Number(value), 0)
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
      const sessionAtEntry = await timerSeconds(sessionTime)
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
      expect(api.attempts).toHaveLength(1)
      const refused = api.attempts[0]
      expect(refused).toMatchObject({ operation: 'insert', revision: 1, expected_revision: 0 })
      await page.evaluate(() => window.dispatchEvent(new Event('online')))
      await expect(setOne).toContainText('Saved')
      await expect(setOne).toContainText('8 reps')
      await expect(setOne).toContainText('60 kg')
      await expect(setOne.getByRole('img', { name: 'Effort: about right' })).toBeVisible()
      expect(api.mutations).toMatchObject([{ operation: 'insert', set_number: 1,
        values: { actual_reps: 8, weight: 60, weight_unit: 'kg', effort: 'about_right' } }])
      expect(api.attempts).toHaveLength(2)
      expect(sameSetMutation(refused, api.attempts[1])).toBe(true)
      const originalId = refused.observation_id
      expect(api.head(originalId)).toMatchObject({ revision: 1, cleared: false,
        mutation_id: refused.mutation_id, row: { id: originalId, actual_reps: 8, weight: 60 } })

      // Rest runs; skipping it leaves logging reachable.
      const rest = page.getByRole('region', { name: 'Rest' })
      await expect(rest.getByRole('timer', { name: 'Time remaining' })).toBeVisible()
      await tap(rest.getByRole('button', { name: 'Skip rest', exact: true }))
      await expect(rest).toHaveCount(0)
      expect(api.mutations).toHaveLength(1)
      if (await form('Log', 2).count() === 0) await tap(squat.getByRole('button', { name: 'Log set', exact: true }))
      await expect(form('Log', 2)).toBeVisible()
      await tap(form('Log', 2).getByRole('button', { name: 'Log set 2', exact: true }))
      await expect(logged.getByRole('listitem').filter({ hasText: 'Set 2' })).toContainText('Saved')
      expect(api.mutations).toHaveLength(2)
      const secondId = api.mutations[1].observation_id
      const secondHead = api.head(secondId)
      expect(secondId).not.toBe(originalId)

      // Rest expiry, with the sheet minimised, also leaves logging reachable.
      await expect(rest).toBeVisible()
      await tap(minimize)
      await expect(form('Log', 3)).toHaveCount(0)
      await page.clock.fastForward((SQUAT_REST + 2) * 1000)
      await expect(rest).toHaveCount(0)
      expect(api.mutations).toHaveLength(2)
      expect(await timerSeconds(sessionTime)).toBeGreaterThanOrEqual(sessionAtEntry + SQUAT_REST + 2)
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
      await unclipped(cancel, viewport)
      await reach(save)
      await unclipped(save, viewport)
      // Both actions must be wholly reachable individually. Their relative
      // alignment is read together; a stacked pair need not share one fold.
      const [cancelBox, saveBox] = await Promise.all([cancel.boundingBox(), save.boundingBox()])
      if (cancelBox === null || saveBox === null) throw new Error('The correction pair disappeared')
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
      const correction = api.mutations.at(-1)!
      expect(correction).toMatchObject({ observation_id: originalId, exercise_id: refused.exercise_id,
        expected_revision: 1, revision: 2 })
      expect(correction.mutation_id).not.toBe(refused.mutation_id)

      // Clearing a saved observation is distinct from clearing its effort.
      // Keep is safe; confirming removes just the intended observation.
      await tap(editOne)
      await tap(form('Edit', 1).getByRole('button', { name: 'Clear set 1', exact: true }))
      const clearDialog = page.getByRole('dialog', { name: 'Clear set 1 of back squat?', exact: true })
      await expect(clearDialog).toBeVisible()
      await tap(clearDialog.getByRole('button', { name: 'Keep set', exact: true }))
      await expect(clearDialog).toHaveCount(0)
      expect(api.mutations).toHaveLength(3)
      await expect(setOne).toContainText('Saved')
      await tap(form('Edit', 1).getByRole('button', { name: 'Clear set 1', exact: true }))
      await tap(clearDialog.getByRole('button', { name: 'Clear set', exact: true }))
      await expect(clearDialog).toHaveCount(0)
      await expect(setOne).toHaveCount(0)
      await expect(logged.getByRole('listitem').filter({ hasText: 'Set 2' })).toContainText('Saved')
      await expect.poll(() => api.mutations.length).toBe(4)
      const clear = api.mutations[3]
      expect(clear).toMatchObject({ operation: 'clear', observation_id: originalId,
        exercise_id: refused.exercise_id, set_number: 1, expected_revision: 2, revision: 3, values: {} })
      expect(clear.mutation_id).not.toBe(correction.mutation_id)
      expect(api.head(originalId)).toEqual({ revision: 3, mutation_id: clear.mutation_id, cleared: true, row: null })
      expect(api.head(secondId)).toEqual(secondHead)
      expect(api.acknowledgements.at(-1)?.head.row).toBeNull()
      await expect(squat.getByRole('button', { name: 'Log set', exact: true })).toBeFocused()

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
      expect(await timerSeconds(movementClock)).toBe(30)
      const beforeMovement = await timerSeconds(sessionTime)
      const beforeClockMutations = api.mutations.length
      await tap(countdown.getByRole('button', { name: 'Start', exact: true }))
      await page.clock.fastForward(4000)
      await expect(movementClock).not.toHaveText(startText ?? '')
      await tap(countdown.getByRole('button', { name: 'Pause', exact: true }))
      const pausedSeconds = await timerSeconds(movementClock)
      expect(pausedSeconds).toBeLessThanOrEqual(26)
      expect(pausedSeconds).toBeGreaterThan(0)
      await page.clock.fastForward(3000)
      expect(await timerSeconds(movementClock)).toBe(pausedSeconds)
      expect(await timerSeconds(sessionTime)).toBeGreaterThanOrEqual(beforeMovement + 7)
      expect(api.mutations).toHaveLength(beforeClockMutations)
      await tap(countdown.getByRole('button', { name: 'Start', exact: true }))
      await page.clock.fastForward(31_000)
      expect(await timerSeconds(movementClock)).toBe(0)
      expect(api.mutations).toHaveLength(beforeClockMutations)
      await expect(countdown.getByRole('button', { name: 'Start', exact: true })).toBeDisabled()

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
      expect(await timerSeconds(sessionTime)).toBeGreaterThanOrEqual(sessionAtEntry + SQUAT_REST + 40)
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

/** One grouped case, sharing the same bounded API and real-touch helpers. */
test('JOURNEY-017: a combined superset and optional circuit entry keep their observations and clocks independent', async ({ page, visit, checkA11y }, testInfo) => {
  test.setTimeout(240_000)
  const viewport = { width: 320, height: 568 }
  await page.setViewportSize(viewport)
  const api = await syntheticApi(page, String(testInfo.project.use.baseURL), GROUPED_SHAPE)
  await page.clock.install()
  await visit('/workout')
  const cdp = await page.context().newCDPSession(page)
  try {
    const tap = (target: Locator) => touchTap(page, cdp, target, viewport)
    const enter = async (target: Locator, value: string) => {
      await tap(target)
      await page.keyboard.press('ControlOrMeta+A')
      await page.keyboard.type(value)
      await expect(target).toHaveValue(value)
    }
    const sessionTime = page.getByRole('timer', { name: 'Session time', exact: true })
    const sessionAtEntry = await timerSeconds(sessionTime)
    const nav = page.getByRole('navigation', { name: 'Workout sections' })
    const next = nav.getByRole('button', { name: 'Next section', exact: true })
    await expect(nav.getByRole('progressbar', { name: 'Section 1 of 3' })).toBeVisible()

    await tap(page.getByRole('button', { name: 'Log round', exact: true }))
    const round = page.getByRole('form', { name: 'Log round 1 of bench press and plank', exact: true })
    await expect(round).toBeVisible()
    const bench = round.getByRole('group', { name: 'A1 bench press, set 1', exact: true })
    const plank = round.getByRole('group', { name: 'A2 plank, set 1', exact: true })
    await expect(bench.getByLabel('Reps', { exact: true })).toHaveValue('8')
    await expect(plank.getByLabel('Seconds', { exact: true })).toHaveValue('30')
    await expect(plank.getByLabel('Weight', { exact: true })).toHaveCount(0)
    const logRound = round.getByRole('button', { name: 'Log round 1', exact: true })
    await expect(logRound).toBeDisabled()
    expect(api.attempts).toHaveLength(0)

    await enter(bench.getByLabel('Reps', { exact: true }), '7')
    await enter(bench.getByLabel('Weight', { exact: true }), '60')
    await tap(bench.getByRole('radio', { name: 'About right', exact: true }))
    await enter(plank.getByLabel('Seconds', { exact: true }), '21')
    await tap(plank.getByRole('radio', { name: 'Too easy', exact: true }))
    await expect(bench.getByRole('checkbox', { name: 'Performed', exact: true })).toBeChecked()
    await expect(plank.getByRole('checkbox', { name: 'Performed', exact: true })).toBeChecked()
    await expect(bench.getByRole('radio', { name: 'About right', exact: true })).toHaveAttribute('aria-checked', 'true')
    await expect(plank.getByRole('radio', { name: 'Too easy', exact: true })).toHaveAttribute('aria-checked', 'true')
    expect(api.attempts).toHaveLength(0)
    await checkA11y()
    await tap(logRound)
    await expect.poll(() => api.mutations.length).toBe(2)
    const members = api.snapshot().sections[0].blocks[0].exercises
    expect(api.mutations).toMatchObject([
      { operation: 'insert', exercise_id: members[0].exercise.id, set_number: 1,
        expected_revision: 0, revision: 1,
        values: { actual_reps: 7, actual_duration_seconds: null, weight: 60, weight_unit: 'kg', effort: 'about_right' } },
      { operation: 'insert', exercise_id: members[1].exercise.id, set_number: 1,
        expected_revision: 0, revision: 1,
        values: { actual_reps: null, actual_duration_seconds: 21, weight: null, effort: 'too_easy' } },
    ])
    expect(api.mutations[0].observation_id).not.toBe(api.mutations[1].observation_id)
    expect(api.mutations[0].mutation_id).not.toBe(api.mutations[1].mutation_id)
    const movementList = page.getByRole('list', { name: 'Movements in this superset', exact: true })
    for (const name of [/bench press$/, /plank$/]) {
      const movement = movementList.locator(':scope > li').filter({ has: page.getByRole('heading', { name }) })
      await expect(movement.getByRole('list', { name: 'Logged sets', exact: true })).toContainText('Saved')
    }
    const sharedRest = page.getByRole('region', { name: 'Rest', exact: true })
    await expect(sharedRest).toHaveCount(1)
    const remaining = sharedRest.getByRole('timer', { name: 'Time remaining', exact: true })
    const beforeRest = await timerSeconds(remaining)
    const beforeRestGlobal = await timerSeconds(sessionTime)
    await page.clock.fastForward(2000)
    expect(await timerSeconds(remaining)).toBeLessThan(beforeRest)
    expect(await timerSeconds(sessionTime)).toBeGreaterThanOrEqual(beforeRestGlobal + 2)
    expect(api.mutations).toHaveLength(2)
    await expect(page.getByRole('form', { name: 'Log round 2 of bench press and plank', exact: true })).toBeVisible()
    await tap(page.getByRole('button', { name: 'Minimize', exact: true }))
    await tap(sharedRest.getByRole('button', { name: 'Skip rest', exact: true }))
    await expect(sharedRest).toHaveCount(0)
    expect(api.mutations).toHaveLength(2)

    await tap(next)
    await expect(page.getByRole('heading', { level: 2, name: 'Conditioning', exact: true })).toBeFocused()
    await expect(nav.getByRole('progressbar', { name: 'Section 2 of 3' })).toBeVisible()
    const roundClock = page.getByRole('group', { name: 'Round clock', exact: true })
    await expect(roundClock.getByRole('status')).toHaveText('No rounds recorded')
    const countdown = page.getByRole('region', { name: 'hollow body hold countdown', exact: true })
    const movementClock = countdown.getByRole('timer', { name: 'Countdown', exact: true })
    expect(await timerSeconds(movementClock)).toBe(120)
    const beforeOptionalEntry = await timerSeconds(sessionTime)
    await tap(countdown.getByRole('button', { name: 'Start', exact: true }))
    await page.clock.fastForward(2000)
    expect(await timerSeconds(movementClock)).toBeLessThanOrEqual(118)

    // Replay the actual circuit-to-sheet seam, without logging a result.
    const optional = page.getByRole('button', { name: 'Log load and reps for hollow body hold', exact: true })
    await tap(optional)
    const optionalForm = page.getByRole('form', { name: 'Log set 1 of hollow body hold', exact: true })
    await expect(optionalForm).toBeVisible()
    await expect(optionalForm.getByLabel('Seconds', { exact: true })).toHaveValue('120')
    await expect(optionalForm.getByLabel('Weight', { exact: true })).toHaveCount(0)
    await page.clock.fastForward(2000)
    expect(await timerSeconds(movementClock)).toBeLessThanOrEqual(116)
    expect(api.mutations).toHaveLength(2)
    await tap(page.getByRole('button', { name: 'Minimize', exact: true }))
    await tap(page.getByRole('button', { name: 'Hide load entry for hollow body hold', exact: true }))
    await expect(optionalForm).toHaveCount(0)
    await expect(countdown).toHaveCount(1)
    await tap(countdown.getByRole('button', { name: 'Pause', exact: true }))
    const paused = await timerSeconds(movementClock)
    await page.clock.fastForward(3000)
    expect(await timerSeconds(movementClock)).toBe(paused)
    expect(await timerSeconds(sessionTime)).toBeGreaterThanOrEqual(beforeOptionalEntry + 7)
    expect(api.mutations).toHaveLength(2)
    await tap(countdown.getByRole('button', { name: 'Reset', exact: true }))
    expect(await timerSeconds(movementClock)).toBe(120)
    await expect(roundClock.getByRole('status')).toHaveText('No rounds recorded')

    // Round time, movement time and global time are distinct owners. Time
    // passing starts no observation and records no circuit round by itself.
    await tap(roundClock.getByRole('button', { name: 'Start round 1', exact: true }))
    await page.clock.fastForward(4000)
    expect(await timerSeconds(roundClock.getByRole('timer', { name: 'Round 1 time', exact: true }))).toBeGreaterThanOrEqual(4)
    expect(await timerSeconds(movementClock)).toBe(120)
    await expect(roundClock.getByRole('status')).toHaveText('No rounds recorded')
    expect(api.mutations).toHaveLength(2)
    await tap(roundClock.getByRole('button', { name: 'Finish round 1', exact: true }))
    await expect(roundClock.getByRole('status')).toHaveText('1 of 3 rounds recorded')
    const history = page.getByRole('list', { name: 'Round times', exact: true })
    await expect(history.getByRole('listitem')).toHaveCount(1)
    const circuitRest = page.getByRole('timer', { name: 'Time remaining', exact: true })
    await expect(circuitRest).toHaveCount(1)
    await expect(sharedRest).toHaveCount(0)
    expect(api.mutations).toHaveLength(2)
    const beforeCircuitRest = await timerSeconds(sessionTime)
    await page.clock.fastForward(11_000)
    await expect(circuitRest).toHaveCount(0)
    await expect(roundClock.getByRole('button', { name: 'Finish round 2', exact: true })).toBeEnabled()
    await page.clock.fastForward(3000)
    expect(await timerSeconds(roundClock.getByRole('timer', { name: 'Round 2 time', exact: true }))).toBeGreaterThanOrEqual(4)
    await expect(roundClock.getByRole('status')).toHaveText('1 of 3 rounds recorded')
    await expect(history.getByRole('listitem')).toHaveCount(1)
    expect(await timerSeconds(movementClock)).toBe(120)
    expect(await timerSeconds(sessionTime)).toBeGreaterThanOrEqual(beforeCircuitRest + 14)
    expect(api.mutations).toHaveLength(2)
    await checkA11y()

    await tap(next)
    await expect(nav.getByRole('progressbar', { name: 'Section 3 of 3' })).toBeVisible()
    const circuitBlock = api.snapshot().sections[1].blocks[0].block.id
    expect(api.blockResults.find((row) => row.block_id === circuitBlock)).toMatchObject({ rounds_completed: 1 })
    expect(api.mutations).toHaveLength(2)
    expect(await timerSeconds(sessionTime)).toBeGreaterThan(sessionAtEntry)
    await unclipped(nav.getByRole('button', { name: 'Finish workout', exact: true }), viewport)
    api.assertContained({ candidateReads: 0 })
  } finally {
    await cdp.detach()
  }
})
