/**
 * TASK-012 (REQ-012; C35; R65, R70, R71, R72, R94, R95, R117; V11;
 * AC-C35-01, AC-R012-01, AC-R012-02; JOURNEY-012) — the compact truthful
 * ladder prescription, through its shared owner (`LadderPrescription` /
 * `LadderRounds` in `src/ui/refinements/ladder.tsx`, over `ladderRungs` and
 * the readings in `src/state/ladder.ts`) on the routes that draw it.
 *
 * Review is the actual `/review` route (router, guard, handoff and briefing);
 * Workout is the actual `/workout` route its Start lands on, with the same
 * composition persisted and started through the session client seam
 * (`src/test/compact-ladder-fixture.ts`: the accepted twelve-round push up and
 * burpee ladder, a loaded descending ladder with a distance companion, and a
 * timed pyramid on a schedule with no cap). The shared stylesheets are applied
 * to the document, so the declared grid and wrapping recipe is read from the
 * cascade. Browser geometry is `e2e/refinement/task-012.spec.ts`.
 *
 * Synthetic data only: in-memory doubles, no account and no network.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import type { SessionsClient } from '../data/sessions'
import { routes } from '../app/router'
import { REVIEW_PATH } from '../app/ReviewRoute'
import { GalleryRefinements } from '../dev/gallery-refinements'
import { LADDER_CAP_SECONDS, pushUpRungs } from '../dev/gallery-refinement-flow-data'
import { BlockCompletionContext, type BlockCompletionApi, type BlockOutcome } from '../state/block-completion'
import { ok, type Result } from '../state/errors'
import { ladderProgressionText, ladderRoundReadings, ladderRungs } from '../state/ladder'
import { makePrescription } from '../test/factories'
import { reviewHandoff } from '../state/review-handoff'
import type { LadderTiming, SessionAcceptance, SessionSnapshot } from '../state/schemas'
import type { ShellStorage } from '../state/workout-persistence'
import { sessionProgress, type BlockProgress } from '../state/workout-progress'
import {
  COMPACT_LADDER_KEYS,
  EXPECTED,
  SCHEDULED_INTERVAL,
  SCHEDULED_ROUNDS,
  compactLadderAcceptance,
  compactLadderSnapshot,
  type CompactLadderKey,
} from '../test/compact-ladder-fixture'
import { AppProviders, signedIn } from '../test/render'
import { FIXTURE_USER_ID } from '../test/user-data-double'
import { createWorkoutDouble, snapshotFixture, type BlockFixture, type ExerciseFixture } from '../test/workout-double'
import { BlockSlot } from './block-renderers'
import { LadderBlock } from './ladder-block'
import { LADDER_MOVEMENTS_LABEL, LADDER_ROUNDS_LABEL } from './refinements/ladder'

const ROOT = resolve(import.meta.dirname, '../..')
/** Explicit per-case time: route journeys mount the whole app; generous on a slower CI runner. */
const ROUTE_TIMEOUT = 30_000

beforeAll(() => {
  // The shared owners' stylesheets, as the browser receives them. jsdom
  // reports each declared value from the cascade.
  for (const file of [
    'src/styles/a11y.css',
    'src/ui/refinements/tokens.css',
    'src/ui/refinements/presentation.css',
  ]) {
    const style = document.createElement('style')
    style.dataset.task012 = file
    style.textContent = readFileSync(resolve(ROOT, file), 'utf8')
    document.head.append(style)
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

function declared(element: Element, property: string): string {
  return getComputedStyle(element).getPropertyValue(property).trim()
}

/** Whether `later` comes after `earlier` in document order. */
function follows(later: Element, earlier: Element): boolean {
  return (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

// ─────────────────────────────────────────────────────────────────────────────
// The route harness: Review, then the Workout its Start lands on
// ─────────────────────────────────────────────────────────────────────────────

function journeyDouble(acceptance: SessionAcceptance) {
  const startedAt = new Date(Date.now() - 60_000).toISOString()
  const prescribed = compactLadderSnapshot(acceptance, { userId: FIXTURE_USER_ID })
  const running = compactLadderSnapshot(acceptance, { userId: FIXTURE_USER_ID, startedAt })
  const calls = { accepted: [] as SessionAcceptance[], started: [] as string[] }
  let started = false
  const sessions: Partial<SessionsClient> = {
    async accept(_userId, payload) {
      calls.accepted.push(payload)
      return ok(prescribed) as Result<SessionSnapshot>
    },
    async start(sessionId) {
      calls.started.push(sessionId)
      started = true
      return ok({ session: running.session, state: 'active' as const })
    },
    async resume() {
      return ok(started ? running : null)
    },
    async snapshot() {
      return ok(running)
    },
  }
  return { double: createWorkoutDouble({ session: null, sessions }), calls }
}

/** JOURNEY-012's entry: the real router at `/review`, handed the three ladders. */
async function openReview() {
  const acceptance = compactLadderAcceptance()
  const { double, calls } = journeyDouble(acceptance)
  const router = createMemoryRouter(routes, {
    initialEntries: ['/', { pathname: REVIEW_PATH, state: reviewHandoff(acceptance) }],
    initialIndex: 1,
  })
  render(
    <AppProviders {...signedIn({ workout: double.clients })}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  await screen.findByRole('heading', { level: 1, name: acceptance.workout.title })
  return { router, calls, acceptance }
}

/** The action: Start, then the `/workout` route the handoff lands on. */
async function startWorkout(router: ReturnType<typeof createMemoryRouter>) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Start workout' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/workout'))
  // Review states the rounds too, so wait for the live cards themselves.
  await waitFor(() => expect(document.querySelectorAll('[data-workout-card="workout"]')).toHaveLength(COMPACT_LADDER_KEYS.length))
  await screen.findByRole('button', { name: 'Start schedule' })
  return user
}

type Context = 'review' | 'workout'

/** The three ladders' cards in one context, in the order the section performs them. */
function ladderCards(context: Context): Record<CompactLadderKey, HTMLElement> {
  const cards = [...document.querySelectorAll<HTMLElement>(`[data-workout-card="${context}"]`)]
  expect(cards).toHaveLength(COMPACT_LADDER_KEYS.length)
  return Object.fromEntries(COMPACT_LADDER_KEYS.map((key, index) => [key, cards[index]])) as Record<CompactLadderKey, HTMLElement>
}

/** A card's round grid. */
function grid(card: HTMLElement): HTMLElement {
  return within(card).getByRole('list', { name: LADDER_ROUNDS_LABEL })
}

/** Each round's tile, as it reads on screen: its `R` label, then each movement's work. */
function tiles(card: HTMLElement): { label: string; entries: string[]; spoken: string[] }[] {
  return [...grid(card).querySelectorAll<HTMLElement>(':scope > li')].map((tile) => ({
    label: tile.querySelector('.clr-ladder-prescription__label > [aria-hidden="true"]')?.textContent ?? '',
    entries: [...tile.querySelectorAll('[data-ladder-entry] > [aria-hidden="true"]')].map((entry) => entry.textContent ?? ''),
    spoken: [...tile.querySelectorAll('.a11y-hidden')].map((entry) => entry.textContent ?? ''),
  }))
}

/** The live summary: one line per movement, in prescribed order. */
function summary(card: HTMLElement): string[] {
  return within(card)
    .getAllByRole('listitem')
    .filter((item) => item.closest('ol')?.getAttribute('aria-label') === LADDER_MOVEMENTS_LABEL)
    .map((item) => (item.textContent ?? '').replace(/\s+/g, ' ').trim())
}

/** The card's timing line: its round count, and its cap where it has one. */
function timingLine(card: HTMLElement, key: CompactLadderKey): HTMLElement {
  return within(card).getByText(EXPECTED[key].timing)
}

/** Every ladder in one context states exactly the fixture's own data. */
function expectStatedFromData(context: Context) {
  const cards = ladderCards(context)
  for (const key of COMPACT_LADDER_KEYS) {
    const card = cards[key]
    const read = tiles(card)
    expect(read.map((tile) => tile.label), `${context} ${key} rounds`).toEqual(EXPECTED[key].labels)
    expect(read.map((tile) => tile.entries), `${context} ${key} round work`).toEqual(EXPECTED[key].rounds)
    if (context === 'workout') {
      expect(summary(card), `${key} summary`).toEqual(EXPECTED[key].movements)
      expect(timingLine(card, key)).toBeInTheDocument()
    }
  }
  return cards
}

// ─────────────────────────────────────────────────────────────────────────────
// Direct mounts: one ladder, dispatched by the registry, outside the shell
// ─────────────────────────────────────────────────────────────────────────────

function memoryStorage(): ShellStorage & { keys: () => string[] } {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    keys: () => [...values.keys()],
  }
}

function sequence(exerciseId: string, rungs: number[], overrides: ExerciseFixture['prescription'] = {}): ExerciseFixture {
  return { prescription: { exercise_id: exerciseId, target_kind: 'sequence', target_value: null, target_sequence: rungs, ...overrides } }
}

function mountLadder(
  block: BlockFixture,
  options: { timing?: LadderTiming; storage?: ShellStorage; now?: () => number } = {},
) {
  const snapshot = snapshotFixture({ sections: [{ title: 'Conditioning', sectionType: 'conditioning', blocks: [block] }] })
  const progress: BlockProgress = { ...sessionProgress(snapshot).sections[0].blocks[0], ladderTiming: options.timing ?? null }
  const reportOutcome = vi.fn<(id: string, outcome: BlockOutcome) => void>()
  const completion: BlockCompletionApi = { reportOutcome, isBlockRecorded: () => false }
  const view = render(
    <BlockCompletionContext value={completion}>
      {options.storage === undefined ? (
        <BlockSlot block={progress} />
      ) : (
        <LadderBlock block={progress} storage={options.storage} now={options.now} />
      )}
    </BlockCompletionContext>,
  )
  return { ...view, block: progress, reportOutcome, card: view.container.querySelector<HTMLElement>('[data-workout-card="workout"]')! }
}

/** Move the wall clock and let the block re-read it, as a resumed page does. */
function moveClock(set: () => void) {
  act(() => {
    set()
    window.dispatchEvent(new Event('focus'))
  })
}

// ─────────────────────────────────────────────────────────────────────────────

describe('TASK-012 compact truthful ladder prescription', () => {
  it('AC-C35-01 the accepted twelve-round ladder on /workout states its concise progression once, then every round’s push up and fixed burpee as a compact tile after its Start — with no rung row repeating it', async () => {
    const { router } = await openReview()
    await startWorkout(router)
    const { accepted: card } = ladderCards('workout')

    // The concise overall progression: one line per movement, the push up's
    // whole climb and the burpee's fixed target, each said once.
    expect(summary(card)).toEqual(EXPECTED.accepted.movements)
    expect(timingLine(card, 'accepted')).toBeInTheDocument()
    // Every rung movement: twelve tiles, R1…R12, the push up's target for that
    // round and the fixed 4-rep burpee in each, in order.
    const read = tiles(card)
    expect(read).toHaveLength(12)
    expect(read.map((tile) => tile.label)).toEqual(EXPECTED.accepted.labels)
    expect(read.map((tile) => tile.entries)).toEqual(EXPECTED.accepted.rounds)
    // A screen reader is given the same round in words, never only `×`.
    expect(read[0].spoken).toEqual(['Round 1', 'push up, 2 reps', 'burpee, 4 reps'])
    expect(read[11].spoken).toEqual(['Round 12', 'push up, 24 reps', 'burpee, 4 reps'])

    // Said once (R95): no read-only rung row, no horizontal rail and no second
    // per-round list beside the grid while the ladder is performed.
    expect(within(card).queryByRole('list', { name: 'Ladder' })).toBeNull()
    expect(card.querySelector('.clr-rail, .clr-rungs')).toBeNull()
    expect(within(card).getAllByRole('list').map((list) => list.getAttribute('aria-label')))
      .toEqual([LADDER_MOVEMENTS_LABEL, LADDER_ROUNDS_LABEL])
    // Read-only presentation: nothing in the prescription is a control.
    const prescription = card.querySelector<HTMLElement>('[data-ladder-prescription]')!
    expect(prescription.querySelectorAll('button, input, a, select, textarea, [tabindex], [role="button"]')).toHaveLength(0)

    // Order on the card: the identity and cap, the top Start (TASK-006), the
    // prescription, then the result log (TASK-010).
    const actions = card.querySelector<HTMLElement>('[data-timed-actions="top"]')!
    expect(follows(actions, timingLine(card, 'accepted'))).toBe(true)
    expect(follows(prescription, actions)).toBe(true)
    expect(follows(within(card).getByRole('group', { name: 'Work completed' }), grid(card))).toBe(true)

    // The accepted recipe, from the cascade: a grid that wraps into as many
    // columns as fit, and lines that wrap inside their tile (readable wrapping).
    const list = grid(card)
    expect(declared(list, 'display')).toBe('grid')
    expect(declared(list, 'grid-template-columns')).toBe('repeat(auto-fit, minmax(calc(var(--control-height) * 2), 1fr))')
    expect(declared(list, 'list-style')).toBe('none')
    const tile = list.querySelector<HTMLElement>(':scope > li')!
    expect(['0', '0px']).toContain(declared(tile, 'min-width'))
    const frame = tile.querySelector<HTMLElement>('.clr-ladder-prescription__round')!
    expect(frame).toHaveClass('clr-chamfer', 'clr-chamfer--sm', 'clr-chamfer--structure')
    expect(['0', '0px']).toContain(declared(frame, 'min-width'))
    for (const entry of frame.querySelectorAll('[data-ladder-entry]')) expect(declared(entry, 'overflow-wrap')).toBe('anywhere')
    expect(declared(card.querySelector('[data-ladder-movement]')!, 'overflow-wrap')).toBe('anywhere')
  }, ROUTE_TIMEOUT)

  it('AC-R012-01 every name, sequence, load and unit, round count and cap is read from each ladder’s own data — a loaded descending ladder with a distance companion and a scheduled pyramid with no cap — never from the accepted screenshot', async () => {
    const { router, calls } = await openReview()
    await startWorkout(router)
    const cards = expectStatedFromData('workout')

    // Neither differently shaped ladder borrows anything of the accepted one.
    for (const key of ['loaded', 'scheduled'] as const) {
      const text = cards[key].textContent ?? ''
      for (const constant of ['push up', 'burpee', '07:00', '+2 per round', '12 rounds', 'R12']) {
        expect(text, `${key} borrows ${constant}`).not.toContain(constant)
      }
    }
    // No cap on the schedule: none is stated.
    expect(cards.scheduled.textContent).not.toMatch(/cap/i)

    // Loads: each prescribed load is said once, beside its movement's whole
    // prescription, through the existing formatter and the profile's unit —
    // never in a round, and never on a bodyweight or unloaded movement.
    const loads = (card: HTMLElement) =>
      [...card.querySelectorAll('[data-movement-load]')].map((load) => load.textContent)
    expect(loads(cards.accepted)).toEqual([])
    expect(loads(cards.loaded)).toEqual(['24 kg'])
    expect(loads(cards.scheduled)).toEqual(['12 kg'])
    for (const key of COMPACT_LADDER_KEYS) {
      expect(grid(cards[key]).querySelector('[data-movement-load]')).toBeNull()
      expect(grid(cards[key]).textContent).not.toMatch(/\bkg\b/)
    }
    // Compact equipment beside each name (R132), the per-hand pair included.
    expect([...cards.scheduled.querySelectorAll('[data-ladder-movement] [data-movement-context]')].map((node) => node.textContent))
      .toEqual(['bodyweight', 'dumbbell pair'])

    // The same source prescriptions were accepted: the rows hold the sequences
    // the screen indexed, and nothing else.
    const accepted = calls.accepted[0].workout.sections[0].blocks
    expect(accepted.map((block) => block.exercises.map((exercise) => exercise.target_sequence))).toEqual([
      [pushUpRungs(12), null], [[15, 12, 9, 6, 3], null], [[20, 30, 40, 50, 40, 30, 20], null],
    ])
    expect(accepted.map((block) => block.ladder_timing?.rounds)).toEqual([12, 5, SCHEDULED_ROUNDS])
  }, ROUTE_TIMEOUT)

  it('AC-R012-01 Review states every round of each ladder in the same words the workout performs, read-only, under its unchanged accepted movement rows', async () => {
    const { router } = await openReview()
    const review = expectStatedFromData('review')
    const reviewTiles = Object.fromEntries(COMPACT_LADDER_KEYS.map((key) => [key, tiles(review[key])]))

    for (const key of COMPACT_LADDER_KEYS) {
      const card = review[key]
      // R65, R72: the accepted Review rows keep their own prescription text.
      const rows = within(card).getAllByRole('list').find((list) => list.getAttribute('aria-label') !== LADDER_ROUNDS_LABEL)!
      expect(within(rows).getAllByRole('listitem')).toHaveLength(2)
      // The grid follows them; nothing in it is a control.
      expect(follows(grid(card), rows)).toBe(true)
      expect(grid(card).querySelectorAll('button, input, a, [tabindex]')).toHaveLength(0)
    }
    expect(within(review.accepted).getByText('12 rungs · 2-4-6-8-10-12-14-16-18-20-22-24 reps')).toBeInTheDocument()
    expect(within(review.loaded).getByText('5 rungs · 15-12-9-6-3 reps')).toBeInTheDocument()

    // Start: the workout reads each round exactly as Review stated it.
    await startWorkout(router)
    const live = ladderCards('workout')
    for (const key of COMPACT_LADDER_KEYS) expect(tiles(live[key]), key).toEqual(reviewTiles[key])
  }, ROUTE_TIMEOUT)

  it('AC-R012-02 no “same every round” suffix, no “Move through the rounds” paragraph and no “reps” between a quantity and its movement: the ×/· notation keeps the order, every target and each movement’s identity, the fixed companion in every round', async () => {
    const { router } = await openReview()
    const review = document.querySelector('main')!.textContent ?? ''
    await startWorkout(router)
    const cards = ladderCards('workout')
    const workout = document.querySelector('main')!.textContent ?? ''

    for (const [context, text] of [['review', review], ['workout', workout]] as const) {
      expect(text, context).not.toMatch(/same every round/i)
      expect(text, context).not.toMatch(/Move through the rounds/)
      expect(text, context).not.toMatch(/between each rung/)
    }
    for (const key of COMPACT_LADDER_KEYS) {
      for (const tile of tiles(cards[key])) {
        // Order and identity: every movement, in prescribed order, in every round.
        expect(tile.entries).toHaveLength(2)
        for (const entry of tile.entries) expect(entry).not.toMatch(/^\d+ reps /)
      }
    }
    // × for reps, the unit where it is the meaning, and per side kept.
    expect(tiles(cards.accepted)[0].entries).toEqual(['2 × push up', '4 × burpee'])
    expect(tiles(cards.loaded)[4].entries).toEqual(['3 × kettlebell swing', '250 m row'])
    expect(tiles(cards.scheduled)[3].entries).toEqual(['50 sec plank', '8 × walking lunge each side'])
    // · separates a movement's readings in its one summary line.
    expect(summary(cards.loaded)[0]).toBe('kettlebell swing kettlebell · 15 → 3 reps · −3 per round · 24 kg')

    // The capped window's paragraph is gone with nothing in its place; the
    // other modes keep their one pacing line, which was not removed.
    expect(within(cards.accepted).queryAllByText(/at your own pace|you say how far you got/)).toEqual([])
    expect(within(cards.loaded).getByText(/^Start each round when you finish the last\./)).toBeInTheDocument()
    expect(within(cards.scheduled).getByText(/^Each round starts on the clock\./)).toBeInTheDocument()
  }, ROUTE_TIMEOUT)

  it('JOURNEY-012 recovery: Start, Pause and the cap keep the prescription unchanged; the rung question and the reached reading appear only once answered; nothing is recorded but the declared answer', async () => {
    const storage = memoryStorage()
    let wall = Date.parse('2026-11-10T09:00:00.000Z')
    const accepted = compactLadderAcceptance().workout.sections[0].blocks[0]
    const mounted = mountLadder(
      {
        structureType: 'for_time', timerType: 'countdown', repScheme: 'ladder_up', timerSeconds: LADDER_CAP_SECONDS,
        exercises: accepted.exercises.map((exercise) => ({ prescription: { ...exercise, equipment_used: exercise.equipment } })),
      },
      { timing: accepted.ladder_timing!, storage, now: () => wall },
    )
    const user = userEvent.setup()
    const before = tiles(mounted.card)
    expect(before.map((tile) => tile.entries)).toEqual(EXPECTED.accepted.rounds)
    const stored = storage.keys()

    await user.click(screen.getByRole('button', { name: 'Start ladder' }))
    moveClock(() => { wall += 90_000 })
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(tiles(mounted.card)).toEqual(before)
    expect(within(mounted.card).queryByRole('list', { name: 'Ladder' })).toBeNull()
    // Reading the prescription stores nothing of its own: only the race.
    // TASK-013 (C36; scope: TASK-032's adoption): the race is the ladder's one
    // durable attempt — its clock and progress under the ladder's own key —
    // in place of the For Time clock record.
    expect(storage.keys().filter((key) => !stored.includes(key))).toEqual(['clear.workout-ladders'])

    await user.click(screen.getByRole('button', { name: 'Resume' }))
    moveClock(() => { wall += LADDER_CAP_SECONDS * 1000 })
    // The cap: Incomplete with no rung (TASK-010); how far is asked, and the
    // prescription is still every round as before. TASK-013 (C33, C34): how
    // far is the result log's "Rounds completed", rep-first, one tile a rung.
    const howFar = within(mounted.card).getByRole('group', { name: 'Rounds completed' })
    expect(within(howFar).getAllByRole('button')).toHaveLength(12)
    expect(tiles(mounted.card)).toEqual(before)
    expect(mounted.reportOutcome).toHaveBeenLastCalledWith(mounted.block.blockId, {})

    await user.click(within(howFar).getByRole('button', { name: 'Round 7: 14 reps' }))
    expect(mounted.reportOutcome).toHaveBeenLastCalledWith(mounted.block.blockId, { highestRung: 7 })
    await user.click(screen.getByRole('radio', { name: 'Complete' }))
    // The reached reading: TASK-013's completion count (C34).
    expect(within(howFar).getByRole('status')).toHaveTextContent('12 of 12 rounds completed')
    expect(mounted.reportOutcome).toHaveBeenLastCalledWith(mounted.block.blockId, { highestRung: 12 })
    expect(tiles(mounted.card)).toEqual(before)
  }, ROUTE_TIMEOUT)

  it('JOURNEY-012 a scheduled ladder’s tiles keep each start and mark the live round from its own clock through Start, a close and reopen and the end of the schedule', async () => {
    const storage = memoryStorage()
    const start = Date.parse('2026-11-10T09:00:00.000Z')
    let wall = start
    const scheduled = compactLadderAcceptance().workout.sections[0].blocks[2]
    const block: BlockFixture = {
      structureType: 'emom', timerType: 'per_minute', repScheme: 'pyramid', timerSeconds: scheduled.timer_seconds,
      exercises: scheduled.exercises.map((exercise) => ({ prescription: { ...exercise, equipment_used: exercise.equipment } })),
    }
    const marked = (card: HTMLElement) =>
      [...grid(card).querySelectorAll<HTMLElement>(':scope > li')].flatMap((tile) => {
        const marker = tile.querySelector('[data-ladder-marker]')?.textContent ?? null
        return marker === null ? [] : [{ round: Number(tile.dataset.ladderRound), marker, current: tile.getAttribute('aria-current') }]
      })
    const starts = (card: HTMLElement) =>
      [...grid(card).querySelectorAll('.clr-ladder-prescription__detail')].map((detail) => detail.textContent)

    const first = mountLadder(block, { timing: scheduled.ladder_timing!, storage, now: () => wall })
    expect(tiles(first.card).map((tile) => tile.entries)).toEqual(EXPECTED.scheduled.rounds)
    expect(starts(first.card)).toEqual(Array.from({ length: SCHEDULED_ROUNDS }, (_, index) => {
      const seconds = index * SCHEDULED_INTERVAL
      return `Starts at ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    }))
    expect(marked(first.card)).toEqual([{ round: 1, marker: 'Next', current: null }])

    await userEvent.setup().click(screen.getByRole('button', { name: 'Start schedule' }))
    moveClock(() => { wall = start + (SCHEDULED_INTERVAL + 10) * 1000 })
    expect(marked(first.card)).toEqual([{ round: 2, marker: 'Now', current: 'step' }])
    first.unmount()

    // Close and reopen: the same storage, a later wall clock. The live round is
    // read back from the stored start, not restarted.
    wall = start + (SCHEDULED_INTERVAL * 4 + 5) * 1000
    const second = mountLadder(block, { timing: scheduled.ladder_timing!, storage, now: () => wall })
    expect(marked(second.card)).toEqual([{ round: 5, marker: 'Now', current: 'step' }])
    expect(tiles(second.card).map((tile) => tile.entries)).toEqual(EXPECTED.scheduled.rounds)

    // The schedule runs out: nothing live, and no rung claimed (TASK-010).
    moveClock(() => { wall = start + (SCHEDULED_INTERVAL * SCHEDULED_ROUNDS + 5) * 1000 })
    expect(marked(second.card)).toEqual([])
    expect(second.reportOutcome).toHaveBeenLastCalledWith(second.block.blockId, {})
  }, ROUTE_TIMEOUT)

  it('JOURNEY-012 a ladder with no explicit timing, an inverse pair and a malformed ladder are stated through the same owner: their rounds are their rungs, and absent rungs keep their existing meaning', () => {
    // Legacy For Time ladder with a fixed companion: four rungs, four rounds.
    const legacy = mountLadder({
      structureType: 'for_time', timerType: 'countdown', repScheme: 'ladder_fixed_interval', timerSeconds: 480,
      exercises: [
        sequence('thruster', [3, 6, 9, 12], { order_index: 0, equipment_used: 'barbell', load_type: 'absolute', load_value: 40 }),
        { prescription: { exercise_id: 'pull-up', target_kind: 'fixed', target_value: 5, order_index: 1, equipment_used: 'pull-up-bar', load_type: 'bodyweight' } },
      ],
    })
    expect(summary(legacy.card)).toEqual(['thruster barbell · 3 → 12 reps · +3 per round · 40', 'pull up pull up bar · 5 reps · Bodyweight'])
    expect(tiles(legacy.card).map((tile) => [tile.label, ...tile.entries])).toEqual([
      ['R1', '3 × thruster', '5 × pull up'], ['R2', '6 × thruster', '5 × pull up'],
      ['R3', '9 × thruster', '5 × pull up'], ['R4', '12 × thruster', '5 × pull up'],
    ])
    expect(within(legacy.card).getByText('8 MIN CAP · LADDER · FIXED INTERVAL')).toBeInTheDocument()
    expect(within(legacy.card).queryByText('Each rung')).toBeNull()
    cleanup()

    // An inverse pair: two movements climbing opposite ways, each round both.
    const inverse = mountLadder({
      structureType: 'for_time', timerType: 'countdown', repScheme: 'inverse', timerSeconds: 600,
      exercises: [sequence('pull-up', [10, 9, 8], { order_index: 0 }), sequence('burpee', [1, 2, 3], { order_index: 1 })],
    })
    expect(tiles(inverse.card).map((tile) => tile.entries)).toEqual([
      ['10 × pull up', '1 × burpee'], ['9 × pull up', '2 × burpee'], ['8 × pull up', '3 × burpee'],
    ])
    expect(summary(inverse.card).map((line) => line.replace(/^.*? · /, ''))).toEqual([
      '10 → 8 reps · −1 per round', '1 → 3 reps · +1 per round',
    ])
    cleanup()

    // No movement carries a sequence: the existing note, the movements still
    // named with their own targets, and no rounds invented.
    const malformed = mountLadder({
      structureType: 'for_time', timerType: 'countdown', repScheme: 'ladder_down', timerSeconds: 480,
      exercises: [{ prescription: { exercise_id: 'burpee', target_value: 10 } }],
    })
    expect(within(malformed.card).getByText('This ladder prescribes no rungs — perform the movements as written.')).toBeInTheDocument()
    expect(summary(malformed.card)).toHaveLength(1)
    expect(summary(malformed.card)[0]).toMatch(/^burpee .* · 10 reps$/)
    expect(within(malformed.card).queryByRole('list', { name: LADDER_ROUNDS_LABEL })).toBeNull()
    cleanup()

    // Every movement swapped out: still the empty block's own words.
    const emptied = mountLadder({
      structureType: 'for_time', timerType: 'countdown', repScheme: 'ladder_down', timerSeconds: 480,
      exercises: [sequence('kettlebell-swing', [15, 12, 9], { revision_status: 'superseded' })],
    })
    expect(within(emptied.card).getByText(/every movement in it was swapped\s+out/)).toBeInTheDocument()
    expect(emptied.card.querySelector('[data-ladder-prescription]')).toBeNull()
  }, ROUTE_TIMEOUT)

  it('JOURNEY-012 the readings come from the columns: rising, falling, uneven, timed, distance, per-side and inverse ladders, and the round count the timing gives', () => {
    const reps = (rungs: number[], overrides = {}) =>
      makePrescription({ target_kind: 'sequence', target_value: null, target_sequence: rungs, ...overrides })
    expect(ladderProgressionText(reps([2, 4, 6, 8]))).toBe('2 → 8 reps · +2 per round')
    expect(ladderProgressionText(reps([21, 15, 9]))).toBe('21 → 9 reps · −6 per round')
    expect(ladderProgressionText(reps([2, 4, 6, 4, 2]))).toBe('2-4-6-4-2 reps')
    expect(ladderProgressionText(reps([5, 5, 5]))).toBe('5-5-5 reps')
    expect(ladderProgressionText(reps([30, 45, 60], { modality: 'time' }))).toBe('30 → 60 sec · +15 per round')
    expect(ladderProgressionText(reps([4, 6, 8], { per_side: true }))).toBe('4 → 8 reps each side · +2 per round')
    expect(ladderProgressionText(makePrescription({ modality: 'distance', distance_unit: 'km', target_value: 1 }))).toBe('1 km')
    expect(ladderProgressionText(makePrescription({ target_kind: 'range', target_value: null, target_min: 8, target_max: 10 }))).toBe('8–10 reps')

    const members = [
      { prescription: reps([10, 20, 30], { exercise_id: 'double-under', modality: 'reps' }) },
      { prescription: makePrescription({ exercise_id: 'run', modality: 'distance', distance_unit: 'm', target_value: 200 }) },
      { prescription: reps([12, 10, 8], { exercise_id: 'lunge', per_side: true }) },
    ]
    expect(ladderRungs(members).map((rung) => rung.targets)).toEqual([[10, 12], [20, 10], [30, 8]])
    const rounds = ladderRoundReadings(members)
    expect(rounds.map((round) => round.entries.map((entry) => entry.text))).toEqual([
      ['10 × double under', '200 m run', '12 × lunge each side'],
      ['20 × double under', '200 m run', '10 × lunge each side'],
      ['30 × double under', '200 m run', '8 × lunge each side'],
    ])
    expect(rounds[1].entries.map((entry) => entry.spoken)).toEqual(['double under, 20 reps', 'run, 200 m', 'lunge, 10 reps each side'])
    // The timing's own count; a movement whose sequence ran out adds nothing.
    expect(ladderRoundReadings(members, 2).map((round) => round.number)).toEqual([1, 2])
    expect(ladderRoundReadings([{ prescription: reps([3, 2]) }, members[1]], 3)[2].entries.map((entry) => entry.text)).toEqual(['200 m run'])
  }, ROUTE_TIMEOUT)

  it('JOURNEY-012 gallery ladder-4 and ladder-12 draw the actual consumer’s compact prescription, from the gallery’s own data, with no network and no route storage', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    for (const rounds of [4, 12] as const) {
      render(
        <MemoryRouter initialEntries={[`/gallery/refinements?state=ladder-${rounds}`]}>
          <GalleryRefinements />
        </MemoryRouter>,
      )
      const state = document.querySelector<HTMLElement>(`[data-refinement-state="ladder-${rounds}"]`)!
      const card = state.querySelector<HTMLElement>('[data-workout-card="workout"]')!
      const rungs = pushUpRungs(rounds)
      expect(summary(card)).toEqual([`push up bodyweight · 2 → ${rungs.at(-1)} reps · +2 per round`, 'burpee bodyweight · 4 reps'])
      expect(tiles(card).map((tile) => [tile.label, ...tile.entries]))
        .toEqual(rungs.map((reps, index) => [`R${index + 1}`, `${reps} × push up`, '4 × burpee']))
      expect(within(card).getByText(`${rounds} rounds · 07:00 cap on the whole ladder`)).toBeInTheDocument()
      expect(card.querySelector('.clr-rail')).toBeNull()
      expect(localStorage.length).toBe(0)
      cleanup()
    }
    expect(fetch).not.toHaveBeenCalled()
  }, ROUTE_TIMEOUT)
})
