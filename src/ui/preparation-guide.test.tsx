/**
 * TASK-022 (REQ-022; C49, AC-C49-01, AC-R022-01, AC-R022-02; G06, G14; R01,
 * R13, R14, R15, R36; JOURNEY-022) — the accepted concise Warm-up and
 * Cooldown, and their separate preparation clock, on the real `/review` and
 * `/workout` routes and in the accepted gallery state.
 *
 * JOURNEY-022's entry is the actual route: the real router and guards over a
 * workout with an authoritative Warm-up (four movements) and Cooldown (two)
 * around a worked section (`src/dev/gallery-refinement-preparation-data.ts`,
 * shared with the browser proof). That composition carries everything the
 * guide must never show — a generated custom title, prose notes and every
 * per-movement sets, reps, hold, rest and load — and counts that are not the
 * illustrated three rows. The expected readings are TASK-034's own
 * (`src/state/preparation-guide.ts`), never constants of this file.
 *
 * The wall clock is injected (`Date.now`), so the preparation clock's
 * arithmetic, its pause and its warning thresholds are crossed exactly.
 * Synthetic data only: in-memory doubles, no account and no network.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { routes } from '../app/router'
import { GalleryRefinements } from '../dev/gallery-refinements'
import {
  COOLDOWN_GENERATED_NOTES,
  COOLDOWN_GENERATED_TITLE,
  PREPARATION_NAMES,
  PREPARATION_SECTIONS,
  WARM_UP_GENERATED_NOTES,
  WARM_UP_GENERATED_TITLE,
  preparationAcceptance,
} from '../dev/gallery-refinement-preparation-data'
import { createError, ErrorCode, ok, type Result } from '../state/errors'
import { composedPreparationGuide, type PreparationGuide as GuideData } from '../state/preparation-guide'
import { reviewHandoff } from '../state/review-handoff'
import type { SessionAcceptance, SessionSnapshot } from '../state/schemas'
import { formatElapsed } from '../state/workout-clock'
import type { SessionsClient } from '../data/sessions'
import { peerGroupingSnapshot } from '../test/peer-grouping-fixture'
import { AppProviders, signedIn } from '../test/render'
import { FIXTURE_USER_ID } from '../test/user-data-double'
import { createWorkoutDouble } from '../test/workout-double'
import { LivePreparation, PreparationGuide } from './preparation-guide'

/** The accessible names the routes give a guide's list and its clock. */
const preparationListLabel = (title: string) => `${title} movements`
const preparationTimerLabel = (title: string) => `${title} timer`

const ROOT = resolve(import.meta.dirname, '../..')
const read = (file: string) => readFileSync(resolve(ROOT, file), 'utf8')

const HEAVY = 30_000

beforeAll(() => {
  for (const file of ['src/ui/refinements/tokens.css', 'src/ui/refinements/presentation.css']) {
    const style = document.createElement('style')
    style.dataset.task022 = file
    style.textContent = read(file)
    document.head.append(style)
  }
})

afterAll(() => {
  document.querySelectorAll('style[data-task022]').forEach((style) => style.remove())
})

let clock = Date.parse('2026-11-10T09:00:00.000Z')

beforeEach(() => {
  localStorage.clear()
  clock = Date.parse('2026-11-10T09:00:00.000Z')
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

/** Time passes; the page re-reads its clocks, as a resumed tab does. */
function advance(seconds: number) {
  clock += seconds * 1000
  act(() => {
    window.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// The reading each route must draw (TASK-034's, not this file's)
// ─────────────────────────────────────────────────────────────────────────────

function guideOf(acceptance: SessionAcceptance, type: 'warmup' | 'cooldown'): GuideData {
  const section = acceptance.workout.sections.find((candidate) => candidate.section_type === type)!
  return composedPreparationGuide(section)!
}

/** Everything a concise guide's card may say, in order: title, time, names. */
function conciseText(guide: GuideData): string {
  return [guide.title, guide.durationText, ...guide.movements.map(({ name }) => name)].join('')
}

/** Words and figures the guide must never show (R01, C49). */
const PRESCRIPTION_WORDS = /×|\breps?\b|\bsec\b|\bRest\b|\bkg\b|\blb\b|each side|Log set|Swap|Set \d/

function guideCard(type: 'warmup' | 'cooldown'): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-preparation-guide="${type}"]`)!
}

function expectConcise(card: HTMLElement, guide: GuideData) {
  // Exactly the title, the approximate time and the names — nothing else.
  expect(card.textContent).toBe(conciseText(guide))
  expect(card.textContent).not.toMatch(PRESCRIPTION_WORDS)
  const list = within(card).getByRole('list', { name: preparationListLabel(guide.title) })
  const items = within(list).getAllByRole('listitem')
  // One name per line, in composed order.
  expect(items.map((item) => item.textContent)).toEqual(guide.movements.map(({ name }) => name))
  expect(list).toHaveClass('clr-preparation-guide__list')
  expect(getComputedStyle(list).flexDirection).toBe('column')
  expect(card.querySelector('button, input, [role="timer"]')).toBeNull()
}

// ─────────────────────────────────────────────────────────────────────────────
// The route harness
// ─────────────────────────────────────────────────────────────────────────────

function journeyDouble(acceptance: SessionAcceptance, edit: (snapshot: SessionSnapshot) => SessionSnapshot = (snapshot) => snapshot) {
  const startedAt = new Date(clock - 60_000).toISOString()
  const prescribed = peerGroupingSnapshot(acceptance, { userId: FIXTURE_USER_ID })
  const running = edit(peerGroupingSnapshot(acceptance, { userId: FIXTURE_USER_ID, startedAt }))
  let started = false
  const sessions: Partial<SessionsClient> = {
    async accept() {
      return ok(prescribed) as Result<SessionSnapshot>
    },
    async start() {
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
  return { double: createWorkoutDouble({ session: null, sessions }), running }
}

/** JOURNEY-022's entry on `/review`: the real router, handed this composition. */
async function openReview(acceptance: SessionAcceptance) {
  const { double } = journeyDouble(acceptance)
  const router = createMemoryRouter(routes, {
    initialEntries: ['/', { pathname: '/review', state: reviewHandoff(acceptance) }],
    initialIndex: 1,
  })
  render(
    <AppProviders {...signedIn({ workout: double.clients })}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  await screen.findByRole('heading', { level: 1, name: acceptance.workout.title })
  return { router, double }
}

/** JOURNEY-022's entry on `/workout`: the running session, on its Warm-up. */
async function openWorkout(acceptance: SessionAcceptance, edit?: (snapshot: SessionSnapshot) => SessionSnapshot) {
  const startedAt = new Date(clock - 60_000).toISOString()
  const running = (edit ?? ((snapshot: SessionSnapshot) => snapshot))(
    peerGroupingSnapshot(acceptance, { userId: FIXTURE_USER_ID, startedAt }),
  )
  const double = createWorkoutDouble({ session: running })
  const router = createMemoryRouter(routes, { initialEntries: ['/', '/workout'], initialIndex: 1 })
  render(
    <AppProviders {...signedIn({ workout: double.clients })}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  await screen.findByRole('navigation', { name: 'Workout sections' })
  return { double, router, running, user: userEvent.setup({ advanceTimers: (ms) => void (clock += ms) }) }
}

function timerRegion(title: string): HTMLElement {
  return screen.getByRole('region', { name: preparationTimerLabel(title) })
}

function timerOf(title: string): HTMLElement {
  return within(timerRegion(title)).getByRole('timer')
}

function digits(title: string): string {
  return timerOf(title).querySelector('[aria-hidden="true"]')?.textContent ?? timerOf(title).textContent ?? ''
}

async function jumpTo(user: ReturnType<typeof userEvent.setup>, label: RegExp) {
  await user.click(screen.getByRole('button', { name: 'All sections' }))
  await user.click(screen.getByRole('button', { name: label }))
}

/** Every button the open preparation section offers, by its visible words. */
function contentButtons(): string[] {
  const section = document.querySelector<HTMLElement>('[data-preparation-section]')!
  return within(section).queryAllByRole('button').map((button) => button.textContent?.trim() ?? '')
}

/** Which functional clock a timer frame reads (`DeadlineTimer`'s frame). */
function clockOf(timer: HTMLElement): string | null {
  return timer.closest('[data-clock]')?.getAttribute('data-clock') ?? null
}

// ─────────────────────────────────────────────────────────────────────────────

describe('TASK-022 accepted concise Warm-up and Cooldown with separate preparation timer', () => {
  it('AC-C49-01 on the real /review route the Warm-up and Cooldown are each one concise card: the stable title, the approximate total time and the movement names on separate lines, with no generated title, prose, per-movement prescription or Swap', { timeout: HEAVY }, async () => {
    const acceptance = preparationAcceptance()
    await openReview(acceptance)

    const warm = guideOf(acceptance, 'warmup')
    const cool = guideOf(acceptance, 'cooldown')
    for (const [type, guide] of [['warmup', warm], ['cooldown', cool]] as const) {
      const card = guideCard(type)
      expectConcise(card, guide)
      // Review: the title is the section's semantic heading.
      expect(within(card).getByRole('heading', { level: 2, name: guide.title })).toBeInTheDocument()
    }
    expect(warm.title).toBe('Warm-up')
    expect(cool.title).toBe('Cooldown')

    const main = screen.getByRole('main')
    for (const words of [WARM_UP_GENERATED_TITLE, WARM_UP_GENERATED_NOTES, COOLDOWN_GENERATED_TITLE, COOLDOWN_GENERATED_NOTES]) {
      expect(main.textContent).not.toContain(words)
    }
    // The worked section between them keeps its prescriptions and its Swap.
    expect(within(main).getByRole('button', { name: 'Swap bench press' })).toBeEnabled()
    expect(main.textContent).toContain('4 × 6 reps')
    for (const name of [...PREPARATION_NAMES.warmup, ...PREPARATION_NAMES.cooldown]) {
      expect(within(main).queryByRole('button', { name: `Swap ${name}` })).toBeNull()
    }
    // Order: Warm-up, the work, then Cooldown — and no preparation clock before Start.
    const order = [...main.querySelectorAll<HTMLElement>('[data-preparation-guide], [data-workout-card="review"]')]
      .map((node) => node.dataset.preparationGuide ?? 'work')
    expect(order).toEqual(['warmup', 'work', 'cooldown'])
    expect(within(main).queryByRole('timer')).toBeNull()
  })

  it('AC-R022-01 the titles, names, counts and times are TASK-034’s reading of the actual prescriptions on /review and /workout alike — four and two movements, never the illustrated four minutes or three rows — and change with the data', { timeout: HEAVY }, async () => {
    const acceptance = preparationAcceptance()
    const warm = guideOf(acceptance, 'warmup')
    const cool = guideOf(acceptance, 'cooldown')
    // The fixture's own counts and times, not the illustration.
    expect(warm.movements.map(({ name }) => name)).toEqual(PREPARATION_NAMES.warmup)
    expect(cool.movements.map(({ name }) => name)).toEqual(PREPARATION_NAMES.cooldown)
    expect([warm.movementCount, cool.movementCount]).toEqual([4, 2])
    expect(warm.durationText).not.toBe('~4 minutes')
    expect(warm.durationText).not.toBe(cool.durationText)

    // The same reading on /workout, from the persisted rows.
    const { user } = await openWorkout(acceptance)
    expectConcise(guideCard('warmup'), { ...warm, origin: 'persisted' })
    expect(digits('Warm-up')).toBe(formatElapsed(warm.approximateMinutes * 60))
    await jumpTo(user, /^Cooldown, /)
    await waitFor(() => expect(guideCard('cooldown')).not.toBeNull())
    expectConcise(guideCard('cooldown'), cool)
    expect(digits('Cooldown')).toBe(formatElapsed(cool.approximateMinutes * 60))

    // Change the data and the reading follows: one warm-up movement, five cooldown ones.
    const changed = preparationAcceptance({
      sections: [
        { ...PREPARATION_SECTIONS.warmup, blocks: [{ ...PREPARATION_SECTIONS.warmup.blocks[0], exercises: PREPARATION_SECTIONS.warmup.blocks[0].exercises.slice(0, 1) }] },
        PREPARATION_SECTIONS.main,
        { ...PREPARATION_SECTIONS.cooldown, blocks: [{ ...PREPARATION_SECTIONS.cooldown.blocks[0], exercises: [
          ...PREPARATION_SECTIONS.cooldown.blocks[0].exercises,
          ...PREPARATION_SECTIONS.cooldown.blocks[0].exercises.map((exercise) => ({ ...exercise, exercise_id: `${exercise.exercise_id}-again` })),
          { ...PREPARATION_SECTIONS.cooldown.blocks[0].exercises[0], exercise_id: 'cat-cow' },
        ] }] },
      ],
    })
    const one = guideOf(changed, 'warmup')
    const five = guideOf(changed, 'cooldown')
    expect([one.movementCount, five.movementCount]).toEqual([1, 5])
    expect(one.durationText).not.toBe(warm.durationText)
    expect(five.durationText).not.toBe(cool.durationText)

    // The presentation owner states no duration, count or sample movement.
    const owner = read('src/ui/preparation-guide.tsx').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(owner).not.toMatch(/minutes\s*=\s*\{?\d|~\d|\b[2-9]\b|Arm circles|Scapular/)
    expect(owner).not.toMatch(/Dismiss|Hide|Skip|Close/)
    // One name per line with no marker: the shared refinement stylesheet's rule.
    expect(read('src/ui/refinements/presentation.css')).toMatch(/\.clr-preparation-guide__list \{[^}]*list-style: none;/)
  })

  it('AC-C49-01 on the real /workout route the open Warm-up is its concise guide under the section header, read from the session’s active rows (a swap in place), with no set logging, rest or Dismiss substitute; Next section completes it as before', { timeout: HEAVY }, async () => {
    const acceptance = preparationAcceptance()
    // A swap made before this session: the halo's row superseded by a band pull-apart in its place.
    const swapped = (snapshot: SessionSnapshot): SessionSnapshot => ({
      ...snapshot,
      sections: snapshot.sections.map((entry, index) => index !== 0 ? entry : {
        ...entry,
        blocks: entry.blocks.map((block) => ({
          ...block,
          exercises: block.exercises.flatMap((held) => held.exercise.exercise_id !== 'kettlebell-halo' ? [held] : [
            { ...held, exercise: { ...held.exercise, revision_status: 'superseded' as const, superseded_at: '2026-11-10T08:59:30+00:00' } },
            { set_logs: [], exercise: { ...held.exercise, id: 'e0000022-0000-4000-8000-000000000001', exercise_id: 'band-pull-apart', replaces_id: held.exercise.id, origin: 'revised' as const } },
          ]),
        })),
      }),
    })
    const { double, user } = await openWorkout(acceptance, swapped)

    // The section header heads the section once; the guide's title is its label.
    expect(screen.getAllByRole('heading', { name: 'Warm-up' })).toHaveLength(1)
    const card = guideCard('warmup')
    expect(within(card).queryByRole('heading')).toBeNull()
    const names = within(within(card).getByRole('list', { name: 'Warm-up movements' })).getAllByRole('listitem')
      .map((item) => item.textContent)
    expect(names).toEqual(['arm circles', 'scapular push up', 'band pull apart', 'dead hang'])
    expect(card.textContent).not.toMatch(PRESCRIPTION_WORDS)
    expect(screen.getByRole('main').textContent).not.toContain(WARM_UP_GENERATED_NOTES)

    // No set-by-set movement card, logger or rest; only the clock's own actions.
    expect(document.querySelector('[data-workout-card="workout"], [data-movement-identity]')).toBeNull()
    expect(screen.queryByRole('button', { name: /^(Log set|Rest|Dismiss|Hide|Skip|Close)/ })).toBeNull()
    expect(contentButtons().sort()).toEqual(['Add 30s', 'Start'])

    // Next section completes the Warm-up's block as every section is completed.
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await screen.findByRole('heading', { name: 'Primary lift' })
    expect(double.recorded()).toHaveLength(1)
    expect(double.loggedSets()).toEqual([])
    expect(document.querySelector('[data-workout-card="workout"]')).not.toBeNull()
  })

  it('AC-R022-02 the separate preparation clock counts the guide’s own time down with Start, Pause and Add 30s, keeps the session clock and the rest distinct, records nothing and offers no Dismiss or other hide action', { timeout: HEAVY }, async () => {
    const acceptance = preparationAcceptance()
    const warm = guideOf(acceptance, 'warmup')
    const total = warm.approximateMinutes * 60
    const { double, user } = await openWorkout(acceptance)

    const region = timerRegion('Warm-up')
    // The rest timer's own pattern: a timer-role card with its glyph-led label, fill and one action row.
    expect(region).toHaveClass('clr-rest-bar')
    expect(region.querySelector('.clr-card__body.clr-chamfer--timer, .clr-chamfer--timer')).not.toBeNull()
    expect(region.querySelector('.clr-rest-bar__fill')).not.toBeNull()
    expect(clockOf(timerOf('Warm-up'))).toBe('preparation')
    expect(digits('Warm-up')).toBe(formatElapsed(total))
    const session = screen.getByRole('timer', { name: /^Session time/ })
    const sessionBefore = session.textContent

    // No Dismiss and no substitute: Start (or Pause) and Add 30s are all it offers.
    const actions = () => within(timerRegion('Warm-up')).getAllByRole('button').map((button) => button.textContent?.trim())
    expect(actions()).toEqual(['Start', 'Add 30s'])

    await user.click(within(region).getByRole('button', { name: 'Start' }))
    expect(actions()).toEqual(['Pause', 'Add 30s'])
    advance(20)
    expect(digits('Warm-up')).toBe(formatElapsed(total - 20))
    // The session clock ran on beside it, and is its own.
    expect(session.textContent).not.toBe(sessionBefore)
    expect(screen.queryByRole('region', { name: 'Rest' })).toBeNull()

    await user.click(within(timerRegion('Warm-up')).getByRole('button', { name: 'Pause' }))
    expect(actions()).toEqual(['Start', 'Add 30s'])
    advance(45)
    expect(digits('Warm-up')).toBe(formatElapsed(total - 20))

    // Add 30s while paused holds the longer reading; while running it runs on from it.
    await user.click(within(timerRegion('Warm-up')).getByRole('button', { name: 'Add 30s' }))
    expect(digits('Warm-up')).toBe(formatElapsed(total + 10))
    await user.click(within(timerRegion('Warm-up')).getByRole('button', { name: 'Start' }))
    advance(10)
    await user.click(within(timerRegion('Warm-up')).getByRole('button', { name: 'Add 30s' }))
    expect(digits('Warm-up')).toBe(formatElapsed(total + 30))
    advance(5)
    expect(digits('Warm-up')).toBe(formatElapsed(total + 25))

    // Keyboard reaches both actions.
    within(timerRegion('Warm-up')).getByRole('button', { name: 'Pause' }).focus()
    await user.keyboard('{Enter}')
    expect(actions()).toEqual(['Start', 'Add 30s'])

    // Nothing was written by the clock: no set, no block result, no session end.
    expect(double.loggedSets()).toEqual([])
    expect(double.recorded()).toEqual([])
    expect(double.completed()).toEqual([])
    expect(screen.queryByRole('button', { name: /Dismiss|Hide|Close|Skip/ })).toBeNull()
  })

  it('AC-R022-02 leaving the section and coming back finds the same clock, and its warning is the shared one: colour at 10 seconds, the edge at 5 while running, none when paused or run out; Add 30s after it runs out waits for Start', { timeout: HEAVY }, async () => {
    const acceptance = preparationAcceptance()
    const cool = guideOf(acceptance, 'cooldown')
    const total = cool.approximateMinutes * 60
    const { user } = await openWorkout(acceptance)

    await jumpTo(user, /^Cooldown, /)
    await waitFor(() => expect(guideCard('cooldown')).not.toBeNull())
    await user.click(within(timerRegion('Cooldown')).getByRole('button', { name: 'Start' }))
    advance(30)
    // Away to the Warm-up — its own clock, untouched — and back.
    await jumpTo(user, /^Warm-up, /)
    await waitFor(() => expect(guideCard('warmup')).not.toBeNull())
    expect(within(timerRegion('Warm-up')).getByRole('button', { name: 'Start' })).toBeEnabled()
    advance(10)
    await jumpTo(user, /^Cooldown, /)
    await waitFor(() => expect(guideCard('cooldown')).not.toBeNull())
    expect(digits('Cooldown')).toBe(formatElapsed(total - 40))
    expect(within(timerRegion('Cooldown')).getByRole('button', { name: 'Pause' })).toBeInTheDocument()

    // Colour at ten seconds left.
    advance(total - 40 - 10)
    expect(timerRegion('Cooldown')).toHaveAttribute('data-urgent', 'true')
    expect(within(timerRegion('Cooldown')).getByRole('status')).toHaveTextContent('Final 10 seconds')
    expect(document.querySelector('[data-countdown-edge]')).toBeNull()
    // The one edge at five, while running.
    advance(5)
    await waitFor(() => expect(document.querySelectorAll('[data-countdown-edge]')).toHaveLength(1))
    // Paused: the colour stays, the edge goes.
    await user.click(within(timerRegion('Cooldown')).getByRole('button', { name: 'Pause' }))
    await waitFor(() => expect(document.querySelector('[data-countdown-edge]')).toBeNull())
    expect(timerRegion('Cooldown')).toHaveAttribute('data-urgent', 'true')
    // Run out: 00:00, nothing to start, no edge.
    await user.click(within(timerRegion('Cooldown')).getByRole('button', { name: 'Start' }))
    advance(6)
    expect(digits('Cooldown')).toBe('00:00')
    expect(within(timerRegion('Cooldown')).getByRole('button', { name: 'Start' })).toBeDisabled()
    expect(document.querySelector('[data-countdown-edge]')).toBeNull()
    // Add 30s after it ran out: thirty seconds, waiting for Start.
    await user.click(within(timerRegion('Cooldown')).getByRole('button', { name: 'Add 30s' }))
    expect(digits('Cooldown')).toBe('00:30')
    advance(10)
    expect(digits('Cooldown')).toBe('00:30')
    expect(within(timerRegion('Cooldown')).getByRole('button', { name: 'Start' })).toBeEnabled()
  })

  it('AC-R022-01 loading, a failed read, a section with no movement left and an absent section keep their meanings; a malformed persisted row is an error, never a guessed guide or clock', { timeout: HEAVY }, async () => {
    const retry = vi.fn()
    const { rerender } = render(
      <MemoryRouter>
        <PreparationGuide reading={{ status: 'loading' }} type="warmup" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('heading', { name: 'Warm-up' })).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()

    rerender(
      <MemoryRouter>
        <PreparationGuide reading={{ status: 'error', error: createError(ErrorCode.PERSISTENCE_READ_FAILED) }} type="warmup" onRetry={retry} />
      </MemoryRouter>,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('The warm-up didn’t load')
    await userEvent.setup().click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)

    rerender(
      <MemoryRouter>
        <PreparationGuide reading={{ status: 'missing', type: 'cooldown', reason: 'no-movements' }} type="cooldown" />
      </MemoryRouter>,
    )
    expect(screen.getByText('No movements are left in this cooldown.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()

    for (const reason of ['not-composed', 'no-workout'] as const) {
      rerender(
        <MemoryRouter>
          <PreparationGuide reading={{ status: 'missing', type: 'cooldown', reason }} type="cooldown" />
        </MemoryRouter>,
      )
      expect(document.querySelector('[data-preparation-guide]')).toBeNull()
    }

    // A persisted row whose target contradicts its kind: an error, no guide and no clock.
    const acceptance = preparationAcceptance()
    const running = peerGroupingSnapshot(acceptance, { userId: FIXTURE_USER_ID, startedAt: new Date(clock).toISOString() })
    const entry = running.sections[0]
    const malformed = {
      ...entry,
      blocks: entry.blocks.map((block) => ({
        ...block,
        exercises: block.exercises.map((held, index) => index !== 0 ? held : {
          ...held, exercise: { ...held.exercise, target_kind: 'range' as const, target_value: 10, target_min: null, target_max: null },
        }),
      })),
    }
    rerender(
      <MemoryRouter>
        <LivePreparation entry={malformed} type="warmup" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('The warm-up didn’t load')
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByRole('timer')).toBeNull()

    // Every active row superseded: no movement left, and no clock.
    const emptied = {
      ...entry,
      blocks: entry.blocks.map((block) => ({
        ...block,
        exercises: block.exercises.map((held) => ({ ...held, exercise: { ...held.exercise, revision_status: 'superseded' as const } })),
      })),
    }
    rerender(
      <MemoryRouter>
        <LivePreparation entry={emptied} type="warmup" />
      </MemoryRouter>,
    )
    expect(screen.getByText('No movements are left in this warm-up.')).toBeInTheDocument()
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('AC-C49-01 the accepted gallery state ?state=preparation draws the routes’ own consumers from the actual reading, each with its own clock and no Dismiss', { timeout: HEAVY }, async () => {
    const user = userEvent.setup({ advanceTimers: (ms) => void (clock += ms) })
    render(
      <MemoryRouter initialEntries={['/gallery/refinements?state=preparation']}>
        <GalleryRefinements />
      </MemoryRouter>,
    )
    const state = document.querySelector<HTMLElement>('[data-refinement-state="preparation"]')!
    expect(state).not.toBeNull()
    const acceptance = preparationAcceptance()
    const warm = guideOf(acceptance, 'warmup')
    const cool = guideOf(acceptance, 'cooldown')

    const review = state.querySelector<HTMLElement>('[data-gallery-context="review"]')!
    expectConcise(review.querySelector<HTMLElement>('[data-preparation-guide="warmup"]')!, warm)
    expectConcise(review.querySelector<HTMLElement>('[data-preparation-guide="cooldown"]')!, cool)
    expect(review.querySelector('[data-workout-card="review"]')).not.toBeNull()
    expect(within(review).queryByRole('timer')).toBeNull()
    expect(state.textContent).not.toContain('~5 minutes')

    await user.click(within(state).getByRole('radio', { name: 'Workout' }))
    const workout = state.querySelector<HTMLElement>('[data-gallery-context="workout"]')!
    for (const guide of [warm, cool]) {
      const region = within(workout).getByRole('region', { name: preparationTimerLabel(guide.title) })
      expect(within(region).getAllByRole('button').map((button) => button.textContent?.trim())).toEqual(['Start', 'Add 30s'])
      expect(clockOf(within(region).getByRole('timer'))).toBe('preparation')
    }
    expect(within(workout).queryByRole('button', { name: /Dismiss|Hide|Close|Skip/ })).toBeNull()
    // Each clock is its own: starting the Warm-up's leaves the Cooldown's ready.
    await user.click(within(within(workout).getByRole('region', { name: 'Warm-up timer' })).getByRole('button', { name: 'Start' }))
    expect(within(within(workout).getByRole('region', { name: 'Warm-up timer' })).getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(within(within(workout).getByRole('region', { name: 'Cooldown timer' })).getByRole('button', { name: 'Start' })).toBeEnabled()
  })
})
