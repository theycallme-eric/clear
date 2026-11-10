/**
 * TASK-003 (REQ-003; C08, C09, C10, C11; AC-R003-01…04; JOURNEY-003) —
 * consistent format badges and truthful prescribed load, through the shared
 * block header (`WorkoutCard` / `MovementGroupHeader` / `StructureBadge`), the
 * existing `loadText` formatter and the consumers the routes render.
 *
 * Review is the actual `/review` route (router, guard, handoff and briefing);
 * Workout is the actual `/workout` route the Start handoff navigates to, with
 * the same composition persisted and started through the session client seam.
 * The shared stylesheets are applied to the document, so the declared header
 * contract is read from the cascade. Browser geometry is
 * `e2e/refinement/task-003.spec.ts`.
 *
 * Synthetic data only: in-memory doubles, no account and no network.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, it } from 'vitest'

import { Constants } from '../data/database.types'
import type { SessionsClient } from '../data/sessions'
import { routes } from '../app/router'
import { REVIEW_PATH } from '../app/ReviewRoute'
import { GalleryRefinements } from '../dev/gallery-refinements'
import { createError, ErrorCode, err, ok, type Result } from '../state/errors'
import { loadText } from '../state/review'
import { reviewHandoff } from '../state/review-handoff'
import type { AnchorEvidenceRow, LoadAnchorRow, SessionAcceptance, SessionSnapshot } from '../state/schemas'
import { structureDetailText, structureIdentity } from '../state/workout-progress'
import {
  circuitAnchorEvidence,
  circuitAnchors,
  FORMAT_BADGES,
  FORMAT_DETAILS,
  FORMAT_KEYS,
  FORMAT_LADDER_TIMING,
  FORMAT_LISTS,
  FORMAT_LOADS,
  FORMAT_SECTION,
  formatBadgesAcceptance,
  formatBadgesSnapshot,
  type FormatKey,
  type FormatReading,
} from '../test/format-badges-fixture'
import { AppProviders, signedIn } from '../test/render'
import { FIXTURE_USER_ID } from '../test/user-data-double'
import { createWorkoutDouble } from '../test/workout-double'
import { BlockCompletionContext, type BlockCompletionApi } from '../state/block-completion'
import { sessionProgress } from '../state/workout-progress'
import { blockRendererFor, BlockSlot } from './block-renderers'
import { LadderBlock } from './ladder-block'
import { liveMovementReadings } from './refinements/movement-readings'
import { WorkoutCard } from './refinements/workout-card'
import { StructureBadge } from './workout-chrome'
import { snapshotFixture } from '../test/workout-double'

const ROOT = resolve(import.meta.dirname, '../..')

beforeAll(() => {
  // The shared owners' stylesheets and the shared text role, as the browser
  // receives them. jsdom reports each declared value from the cascade.
  for (const file of [
    'src/styles/text-roles.css',
    'src/ui/refinements/tokens.css',
    'src/ui/refinements/presentation.css',
  ]) {
    const style = document.createElement('style')
    style.dataset.task003 = file
    style.textContent = readFileSync(resolve(ROOT, file), 'utf8')
    document.head.append(style)
  }
})

function declared(element: Element, property: string): string {
  return getComputedStyle(element).getPropertyValue(property).trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// The route harness
// ─────────────────────────────────────────────────────────────────────────────

interface JourneyOptions {
  acceptFails?: boolean
  anchorRows?: readonly LoadAnchorRow[]
  anchorEvidence?: readonly AnchorEvidenceRow[]
}

function journeyDouble(acceptance: SessionAcceptance, options: JourneyOptions = {}) {
  const startedAt = new Date(Date.now() - 60_000).toISOString()
  const prescribed = formatBadgesSnapshot(acceptance, { userId: FIXTURE_USER_ID })
  const running = formatBadgesSnapshot(acceptance, { userId: FIXTURE_USER_ID, startedAt })
  const calls = { accepted: [] as SessionAcceptance[], started: [] as string[] }
  let started = false
  const sessions: Partial<SessionsClient> = {
    async accept(_userId, payload) {
      calls.accepted.push(payload)
      return options.acceptFails === true
        ? err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))
        : (ok(prescribed) as Result<SessionSnapshot>)
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
  const double = createWorkoutDouble({
    session: null,
    sessions,
    anchorRows: options.anchorRows,
    anchorEvidence: options.anchorEvidence,
  })
  return { double, calls }
}

/** JOURNEY-003's entry: the real router at `/review`, handed this composition. */
async function openReview(options: JourneyOptions = {}) {
  const acceptance = formatBadgesAcceptance()
  const { double, calls } = journeyDouble(acceptance, options)
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
  return { router, calls, double, acceptance }
}

/** The action: Start, then the `/workout` route the handoff lands on. */
async function startWorkout(router: ReturnType<typeof createMemoryRouter>) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Start workout' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/workout'))
  await screen.findByRole('list', { name: FORMAT_LISTS.workout[1] })
}

type Context = 'review' | 'workout'

function cards(context: Context): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(`[data-workout-card="${context}"]`)]
}

function headerOf(card: HTMLElement) {
  const header = card.querySelector<HTMLElement>(':scope > [data-movement-group-header]')!
  const badge = header.querySelector<HTMLElement>(':scope > .clr-movement-group-header__badge')
  return {
    header,
    title: header.querySelector<HTMLElement>(':scope > .clr-movement-group-header__title'),
    badge,
    badgeText: badge?.textContent ?? null,
    meta: header.querySelector<HTMLElement>(':scope > [data-structure-meta]'),
  }
}

/** The block's movement list, by its index in the section. */
function blockList(context: Context, index: number): HTMLElement {
  const card = cards(context)[index]
  return within(card).getByRole('list', { name: FORMAT_LISTS[context][index] })
}

/** `1. kb clean` → `kb clean`: a timed renderer still states the position in its title. */
const bareName = (name: string) => name.replace(/^\d+\.\s+/, '')

function readings(list: HTMLElement): FormatReading[] {
  return [...list.querySelectorAll<HTMLElement>(':scope > li [data-movement-identity]')].map((identity) => ({
    name: bareName(identity.querySelector('[data-movement-name]')!.textContent ?? ''),
    load: identity.querySelector('[data-movement-load]')?.textContent ?? null,
  }))
}

/**
 * The live ladder states each movement's prescribed load once, in its line of
 * the compact prescription's summary (TASK-012: C35, R70, R72) — no longer
 * repeated in every round's target line, which now reads `2 × dumbbell
 * thruster` in the ×/· notation.
 */
function ladderSummaryReadings(list: HTMLElement): FormatReading[] {
  const card = list.closest<HTMLElement>('[data-workout-card]')!
  // The rounds themselves state no load.
  expect(list.querySelector('[data-movement-load]'), 'no round repeats the load').toBeNull()
  return [...card.querySelectorAll<HTMLElement>('[data-ladder-movement]')].map((line) => ({
    name: line.querySelector('[data-movement-name]')?.textContent ?? '',
    load: line.querySelector('[data-movement-load]')?.textContent ?? null,
  }))
}

function contextReadings(context: Context): Record<FormatKey, FormatReading[]> {
  return Object.fromEntries(FORMAT_KEYS.map((key, index) => {
    const list = blockList(context, index)
    // One reading per movement, as Review states it.
    if (context === 'workout' && key === 'ladder') return [key, ladderSummaryReadings(list)]
    return [key, readings(list)]
  })) as Record<FormatKey, FormatReading[]>
}

/** C08: a badge names the format or shape — never a number, a unit, a cap or a count. */
const FORMAT_ONLY = /^(STANDARD|SUPERSET|CIRCUIT|EMOM|AMRAP|FOR TIME|LADDER)$/

// ─────────────────────────────────────────────────────────────────────────────

describe('TASK-003 consistent format badges and truthful prescribed load', () => {
  it('AC-C08-01 names only the format or shape in every Review and Workout badge, with duration, cap, rounds and prescription outside it', async () => {
    const { router } = await openReview()
    const review = cards('review').map(headerOf)
    expect(review.map((header) => header.badgeText)).toEqual(FORMAT_BADGES.review)
    for (const header of review) {
      if (header.badgeText === null) continue
      expect(header.badgeText).toMatch(FORMAT_ONLY)
      expect(header.badge!.querySelector('svg'), 'the glyph stays a second cue').not.toBeNull()
    }
    // What left the badge is still on the card, beside it.
    expect(review.map((header) => header.meta?.textContent ?? null)).toEqual(FORMAT_DETAILS.review)

    await startWorkout(router)
    const live = cards('workout').map(headerOf)
    expect(live.map((header) => header.badgeText)).toEqual(FORMAT_BADGES.workout)
    for (const header of live) expect(header.badgeText).toMatch(FORMAT_ONLY)
    expect(live.map((header) => header.meta?.textContent ?? null)).toEqual(FORMAT_DETAILS.workout)
    // The live superset still states its count as each movement's set progress and prescription.
    expect(within(blockList('workout', 1)).getAllByText('Set 1/3')).toHaveLength(2)
    expect(within(blockList('workout', 1)).getByText('3 × 10 reps')).toBeInTheDocument()
    // The live section's structure summary uses the same format-only words.
    const structures = within(screen.getByRole('list', { name: 'Structures in this section' }))
    expect(structures.getAllByRole('listitem').map((item) => item.textContent)).toEqual(FORMAT_BADGES.workout)
    // No format badge on the workout carries a number, a unit or a count.
    const allBadges = document.querySelectorAll('.clr-movement-group-header__badge, [aria-label="Structures in this section"] li')
    expect(allBadges.length).toBe(FORMAT_KEYS.length * 2)
    for (const badge of allBadges) expect(badge.textContent).not.toMatch(/\d|MIN|CAP|ROUND|·/)
  })

  it('AC-C09-01 places every badge the same way, directly below its title, and never truncates it by label length', async () => {
    const { router } = await openReview()
    const check = (context: Context) => {
      const headers = cards(context).map(headerOf)
      expect(headers.length).toBe(FORMAT_KEYS.length)
      for (const { header, title, badge, meta } of headers) {
        // One stacked column: title, then badge, then the details — whatever the label's length.
        expect(declared(header, 'flex-direction')).toBe('column')
        expect(declared(header, 'align-items')).toBe('flex-start')
        expect(declared(header, 'flex-wrap')).not.toBe('wrap')
        const order = [...header.children]
        expect(order[0]).toBe(title)
        if (badge === null) continue
        expect(order[1]).toBe(badge)
        if (meta !== null) expect(order[2]).toBe(meta)
        // Not truncated: nothing clips, ellipses or forbids wrapping the label.
        for (const node of [badge, ...badge.querySelectorAll<HTMLElement>('*')]) {
          expect(node.style.textOverflow).not.toBe('ellipsis')
          expect(node.style.whiteSpace).not.toBe('nowrap')
          expect(node.style.overflow).not.toBe('hidden')
        }
        const frame = badge.querySelector<HTMLElement>('.clr-bleed')!
        expect(frame.style.maxWidth).toBe('100%')
        expect(frame.style.minWidth).toBe('min-content')
        expect(declared(badge, 'max-width')).toBe('100%')
      }
      // The same arrangement for EMOM and FOR TIME, SUPERSET and LADDER alike.
      const shapes = headers.filter((header) => header.badge !== null).map(({ header }) =>
        [...header.children].map((child) => child.className.split(' ')[0]).join('/'))
      expect(new Set(shapes.map((shape) => shape.replace(/\/clr-movement-group-header__meta$/, ''))).size).toBe(1)
    }
    check('review')
    await startWorkout(router)
    check('workout')
  })

  it('AC-C10-01 shows each live movement’s prescribed load with the existing formatter, unit and per-hand equipment, and keeps it apart from the weight performed', async () => {
    const user = userEvent.setup()
    const { router, double } = await openReview()
    const review = contextReadings('review')
    expect(review).toEqual(FORMAT_LOADS)
    // Per-hand meaning is the equipment's, beside the name, in both contexts.
    const perHand = (context: Context) => {
      const [row] = [...blockList(context, 1).querySelectorAll<HTMLElement>('[data-movement-identity]')]
      expect(row.querySelector('[data-movement-context]')).toHaveTextContent('dumbbell pair')
      expect(row.querySelector('[data-movement-load]')).toHaveTextContent('22 kg')
    }
    perHand('review')

    await startWorkout(router)
    // EMOM, AMRAP, For Time and the timed ladder now state the same load Review does.
    expect(contextReadings('workout')).toEqual(review)
    perHand('workout')

    // An actual weight is entered in the circuit's own optional logger, and is
    // shown as a logged set — the prescribed target beside the name is unchanged.
    const circuit = blockList('workout', 2)
    await user.click(within(circuit).getByRole('button', { name: 'Rest for kb swing' }))
    const form = within(await screen.findByRole('form', { name: 'Log set 1 of kb swing' }))
    await user.clear(form.getByLabelText('Weight'))
    await user.type(form.getByLabelText('Weight'), '22')
    await user.clear(form.getByLabelText('Reps'))
    await user.type(form.getByLabelText('Reps'), '15')
    await user.click(form.getByRole('button', { name: 'Log set 1' }))
    await waitFor(() => expect(double.loggedSets()).toHaveLength(1))
    expect(double.loggedSets()[0].performed).toMatchObject({ weight: 22 })
    // TASK-020 (C46): the saved set is confirmed, not replaced by set 2's form.
    await screen.findByRole('region', { name: 'Set 1 logged' })
    expect(within(screen.getByRole('list', { name: 'Logged sets' })).getByText(/22 kg/)).toBeInTheDocument()
    const swing = () => blockList('workout', 2).querySelector<HTMLElement>('[data-movement-identity]')!
    expect(swing().querySelector('[data-movement-load]')).toHaveTextContent('24 kg')
    expect(swing().querySelector('[data-movement-detail]')!.textContent).not.toContain('22 kg')

    await user.click(screen.getByRole('button', { name: 'Hide load entry for kb swing' }))
    expect(within(swing()).getByText('1 set logged')).toBeInTheDocument()
    expect(swing().querySelector('[data-movement-load]')).toHaveTextContent('24 kg')
    expect(readings(blockList('workout', 2))).toEqual(FORMAT_LOADS.circuit)
  })

  it('AC-C11-01 drops the generic Rest 60s line from EMOM, AMRAP and For Time movements in Review', async () => {
    const { acceptance } = await openReview()
    // The source prescriptions do carry it…
    const timed = acceptance.workout.sections[0].blocks.slice(3)
    for (const block of timed) for (const exercise of block.exercises) expect(exercise.rest_seconds).toBe(60)
    // …and no timed movement in Review states it.
    for (let index = 3; index < FORMAT_KEYS.length; index += 1) {
      const list = blockList('review', index)
      expect(list.textContent, FORMAT_KEYS[index]).not.toMatch(/Rest \d+s/)
      for (const detail of list.querySelectorAll('[data-movement-detail]')) {
        expect(detail.textContent).not.toMatch(/\bRest\b/)
      }
    }
    expect(screen.getByRole('main').textContent).not.toMatch(/Rest 60s(?! between rounds)/)
  })

  it('AC-R003-01 keeps duration, cap, rounds and the target schedule readable outside the badge in both contexts', async () => {
    const { router } = await openReview()
    const read = (context: Context) => cards(context).map(headerOf).map(({ badge, meta }) => {
      if (meta === null) return null
      // Outside the badge, readable text in the header's data face.
      expect(badge?.contains(meta) ?? false).toBe(false)
      expect(meta.tagName).toBe('P')
      expect(meta).toHaveClass('clr-text-data-xs')
      expect(declared(meta, 'font-size')).toBe('var(--label-xs-size)')
      return meta.textContent
    })
    expect(read('review')).toEqual(FORMAT_DETAILS.review)
    // The planned schedule also stays where it was: the superset's and circuit's
    // one-round sequence and the movements' targets.
    expect(within(cards('review')[1]).getByText('One round: 01 → 02')).toBeInTheDocument()
    expect(within(cards('review')[6]).getByText(/4 rungs · 2-4-6-8 reps/)).toBeInTheDocument()

    await startWorkout(router)
    expect(read('workout')).toEqual(FORMAT_DETAILS.workout)
    // The live target schedule is readable beside the timed work.
    expect(within(cards('workout')[3]).getByText('MIN 1 OF 10')).toBeInTheDocument()
    expect(within(cards('workout')[3]).getByText('15s rest at the end of each minute')).toBeInTheDocument()
    expect(within(cards('workout')[6]).getByText('4 rounds · 10:00 cap on the whole ladder')).toBeInTheDocument()
  })

  it('AC-R003-02 reads every load meaning through loadText and the profile unit, and never a performed weight, an inferred unit or a range', async () => {
    // The existing formatter is the one source of each meaning.
    expect(loadText('absolute', 100, 'kg')).toBe('100 kg')
    expect(loadText('percent_1rm', 75, 'kg')).toBe('75% 1RM')
    expect(loadText('rir', 2, 'kg')).toBe('2 RIR')
    expect(loadText('prior_session', null, 'kg')).toBe('Match last session')
    // No unit known: the number alone, never a guessed kilogram or pound.
    const unread = liveMovementReadings({ exercise_id: 'kb-clean', equipment_used: 'kettlebell', load_type: 'absolute', load_value: 20 }, null)
    expect(unread.load).toBe('20')
    const pounds = liveMovementReadings({ exercise_id: 'kb-clean', equipment_used: 'kettlebell', load_type: 'absolute', load_value: 20 }, 'lb')
    expect(pounds.load).toBe('20 lb')

    const { router } = await openReview()
    const review = contextReadings('review')
    await startWorkout(router)
    const live = contextReadings('workout')
    expect(live).toEqual(review)
    expect(live.standard.map((movement) => movement.load)).toEqual(['100 kg', '75% 1RM', '2 RIR', 'Match last session'])
    // Nothing reads as a range or a guess.
    for (const movement of Object.values(live).flat()) {
      expect(movement.load ?? '').not.toMatch(/[–-]\s*\d|~|approx/i)
    }

    // Outside the shell no unit has been read: a live timed movement states the bare number.
    cleanup()
    const block = sessionProgress(snapshotFixture({ sections: [{ blocks: [{
      structureType: 'emom', timerSeconds: 600, timerType: 'per_minute',
      exercises: [{ prescription: { exercise_id: 'kb-clean', equipment_used: 'kettlebell', load_type: 'absolute', load_value: 20, sets: null } }],
    }] }] })).sections[0].blocks[0]
    render(
      <AppProviders {...signedIn({ workout: createWorkoutDouble().clients })}>
        <BlockCompletionContext value={NO_COMPLETION}><BlockSlot block={block} /></BlockCompletionContext>
      </AppProviders>,
    )
    expect(await screen.findByRole('list', { name: 'Movements in this EMOM' })).toBeInTheDocument()
    expect(document.querySelector('[data-movement-load]')).toHaveTextContent(/^20$/)
  })

  it('AC-R003-03 removes only the generic rest: planned rest in standard and grouped blocks, the EMOM rest window and every timed clock stay', async () => {
    const { router, calls } = await openReview()
    const main = screen.getByRole('main')
    // Planned rest outside the timed formats stays exactly as it was.
    expect(within(blockList('review', 0)).getByText('Rest 120s')).toBeInTheDocument()
    expect(within(blockList('review', 0)).getAllByText('Rest 90s')).toHaveLength(3)
    expect(within(cards('review')[1]).getByText('Rest 90s between rounds')).toBeInTheDocument()
    expect(within(cards('review')[2]).getByText('Rest 60s between rounds')).toBeInTheDocument()
    // The EMOM's own rest window is the block's, and Review still states it.
    expect(within(cards('review')[3]).getByText('Rest 15s between rounds')).toBeInTheDocument()
    expect(main.textContent).toContain('10 MIN')
    expect(main.textContent).toContain('15 MIN CAP')

    // Only the reading changed: Start persists every movement's rest as prescribed.
    await startWorkout(router)
    const persisted = calls.accepted[0].workout.sections[0].blocks
    expect(persisted.slice(3).flatMap((block) => block.exercises.map((exercise) => exercise.rest_seconds)))
      .toEqual([60, 60, 60, 60, 60, 60])
    expect(persisted[3].round_rest_seconds).toBe(15)
    // The clocks keep their own owners and readings on Workout.
    expect(within(cards('workout')[3]).getByText('15s rest at the end of each minute')).toBeInTheDocument()
    expect(within(cards('workout')[3]).getByRole('button', { name: 'Start EMOM' })).toBeInTheDocument()
    expect(within(cards('workout')[4]).getByText('As many rounds as possible in 08:00.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start For Time' })).toBeInTheDocument()
    expect(screen.getByText('15:00 cap')).toBeInTheDocument()
  })

  it('AC-R003-04 offers no Review Change weight control on the verified circuit and keeps its actual weight entry in the optional logger', async () => {
    const user = userEvent.setup()
    const { router } = await openReview({ anchorRows: circuitAnchors(), anchorEvidence: circuitAnchorEvidence() })
    const suggestion = (index: number) =>
      within(cards('review')[index]).findByRole('button', { name: /^(Suggested|No suggested weight)/ })

    // The circuit's suggestion still explains its number…
    await user.click(await suggestion(2))
    let dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Why this number · kb swing')).toBeInTheDocument()
    // …but offers no way to change the weight in Review.
    expect(dialog.queryByRole('spinbutton')).toBeNull()
    expect(dialog.queryByLabelText(/Your weight/)).toBeNull()
    expect(dialog.queryByRole('button', { name: 'Use this weight' })).toBeNull()
    expect(dialog.queryByRole('button', { name: 'Use the suggestion' })).toBeNull()
    await user.click(dialog.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // No other weight control anywhere on the circuit card.
    const circuitCard = cards('review')[2]
    expect(within(circuitCard).queryByRole('spinbutton')).toBeNull()
    expect(within(circuitCard).queryAllByRole('button').map((button) => button.textContent))
      .not.toContain('Change weight')

    // The storage proof is the circuit's alone: a standard lift keeps its override.
    await user.click(await suggestion(0))
    dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByRole('spinbutton')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Use this weight' })).toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // Workout: the circuit's existing optional logger is where its actual weight goes.
    await startWorkout(router)
    await user.click(within(blockList('workout', 2)).getByRole('button', { name: 'Rest for kb swing' }))
    const form = within(await screen.findByRole('form', { name: 'Log set 1 of kb swing' }))
    expect(form.getByLabelText('Weight')).toBeInTheDocument()
    expect(form.getByRole('button', { name: 'Log set 1' })).toBeInTheDocument()
  })

  it('JOURNEY-003 opens Review, starts that same workout and shows format-only badges below each title and the prescribed load in each target row', async () => {
    const { router, calls, double } = await openReview()
    const reviewHeaders = cards('review').map(headerOf)
    expect(reviewHeaders.map((header) => header.title?.textContent)).toEqual(Array(FORMAT_KEYS.length).fill(FORMAT_SECTION))
    expect(reviewHeaders.map((header) => header.badgeText)).toEqual(FORMAT_BADGES.review)
    const before = contextReadings('review')

    await startWorkout(router)
    expect(calls.accepted).toHaveLength(1)
    expect(calls.started).toHaveLength(1)
    // The same source prescriptions in each view.
    expect(calls.accepted[0].workout.sections[0].blocks.map((block) => block.structure_type))
      .toEqual(['standard', 'superset', 'circuit', 'emom', 'amrap', 'for_time', 'for_time'])
    expect(calls.accepted[0].workout.sections[0].blocks[6].ladder_timing).toEqual(FORMAT_LADDER_TIMING)
    const liveHeaders = cards('workout').map(headerOf)
    expect(liveHeaders.map((header) => header.title?.textContent)).toEqual(Array(FORMAT_KEYS.length).fill(FORMAT_SECTION))
    expect(liveHeaders.map((header) => header.badgeText)).toEqual(FORMAT_BADGES.workout)
    expect(liveHeaders.map((header) => header.meta?.textContent ?? null)).toEqual(FORMAT_DETAILS.workout)
    expect(contextReadings('workout')).toEqual(before)
    // The load sits in the target row with the prescription, not on a row of its own.
    // (TASK-012: a ladder's load sits in its movement's summary line, beside
    // the movement's whole progression.)
    const loads = [...document.querySelectorAll<HTMLElement>('[data-workout-card="workout"] [data-movement-load]')]
    expect(loads.length).toBeGreaterThan(0)
    for (const load of loads) {
      const row = load.closest('[data-movement-detail]') ?? load.parentElement!
      expect(row.textContent, load.textContent ?? '').toMatch(/\d+ (reps|sec|m)/)
      expect(row.closest('[data-movement-group-header]')).toBeNull()
    }
    // Reading the workout recorded nothing.
    expect(screen.queryByRole('list', { name: 'Logged sets' })).toBeNull()

    // Running and finished, the For Time block keeps its badge, cap and load:
    // the clock owns its phase, and the header and target row do not change.
    const user = userEvent.setup()
    const forTime = () => headerOf(cards('workout')[5])
    await user.click(screen.getByRole('button', { name: 'Start For Time' }))
    expect(await screen.findByRole('button', { name: 'Finish' })).toBeInTheDocument()
    expect([forTime().badgeText, forTime().meta?.textContent]).toEqual(['FOR TIME', '15 MIN CAP'])
    expect(readings(blockList('workout', 5))).toEqual(FORMAT_LOADS.for_time)
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    expect(await screen.findByText('Finished under cap')).toBeInTheDocument()
    expect([forTime().badgeText, forTime().meta?.textContent]).toEqual(['FOR TIME', '15 MIN CAP'])
    expect(readings(blockList('workout', 5))).toEqual(FORMAT_LOADS.for_time)
    expect(double.loggedSets()).toEqual([])
  })

  it('JOURNEY-003 recovery: a failed Start keeps Review as planned and records no work', async () => {
    const user = userEvent.setup()
    const { router, calls, double } = await openReview({ acceptFails: true })
    const before = contextReadings('review')
    const badges = cards('review').map(headerOf).map((header) => header.badgeText)

    await user.click(screen.getByRole('button', { name: 'Start workout' }))
    expect(await screen.findByText('Couldn’t start this workout')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(REVIEW_PATH)
    expect(calls.accepted).toHaveLength(1)
    expect(calls.started).toEqual([])
    expect(double.loggedSets()).toEqual([])
    // Review is unchanged behind the error: same badges, details and loads.
    expect(contextReadings('review')).toEqual(before)
    expect(cards('review').map(headerOf).map((header) => header.badgeText)).toEqual(badges)
    expect(cards('review').map(headerOf).map((header) => header.meta?.textContent ?? null)).toEqual(FORMAT_DETAILS.review)
  })

  it('names a block LADDER exactly when the ladder renderer performs it, and states its scheme outside the badge', () => {
    for (const structure of Constants.public.Enums.structure_type) {
      for (const scheme of Constants.public.Enums.rep_scheme) {
        for (const timing of [null, FORMAT_LADDER_TIMING]) {
          const identity = structureIdentity({ structure_type: structure, rounds: 3, timer_seconds: 600, rep_scheme: scheme, ladder_timing: timing })
          const block = sessionProgress(snapshotFixture({ sections: [{ blocks: [{ structureType: structure, repScheme: scheme, rounds: 3, timerSeconds: 600 }] }] })).sections[0].blocks[0]
          const performed = blockRendererFor({ ...block, ladderTiming: timing }) === LadderBlock
          expect(identity.format === 'LADDER', `${structure} / ${scheme} / ${timing?.mode ?? 'legacy'}`).toBe(performed)
          if (!performed) expect(identity.format).toBe(identity.label)
          // Everything the badge leaves out is read beside it, and nothing else is.
          const detail = structureDetailText(identity)
          expect(detail, `${structure} / ${scheme}`).toBe(
            [identity.detail, identity.repScheme].filter((part) => part !== null).join(' · ') || null,
          )
          expect(identity.format).not.toMatch(/\d|MIN|CAP|ROUND|·/)
        }
      }
    }
    // Opt-in: the badge outside the shared block header keeps its whole reading.
    const identity = structureIdentity({ structure_type: 'emom', rounds: null, timer_seconds: 600, rep_scheme: 'fixed' })
    render(<><StructureBadge identity={identity} /><StructureBadge identity={identity} formatOnly /></>)
    expect(screen.getByText('EMOM · 10 MIN')).toBeInTheDocument()
    expect(screen.getByText('EMOM')).toBeInTheDocument()
    // The shared card draws the format-only badge and the details for its consumers.
    render(<WorkoutCard context="workout" title="Conditioning" structure={identity} />)
    const card = headerOf(cards('workout')[0])
    expect(card.badgeText).toBe('EMOM')
    expect(card.meta).toHaveTextContent('10 MIN')
  })

  it('renders the accepted gallery state cards with format-only badges, the details beside them and the live prescribed load', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/gallery/refinements?state=cards']}>
        <GalleryRefinements />
      </MemoryRouter>,
    )
    const state = document.querySelector<HTMLElement>('[data-refinement-state="cards"]')!
    const review = state.querySelector<HTMLElement>('[data-gallery-context="review"]')!
    const workout = state.querySelector<HTMLElement>('[data-gallery-context="workout"]')!
    const badges = (scope: HTMLElement) =>
      [...scope.querySelectorAll<HTMLElement>('[data-workout-card]')].map((card) => headerOf(card).badgeText)
    const metas = (scope: HTMLElement) =>
      [...scope.querySelectorAll<HTMLElement>('[data-workout-card]')].map((card) => headerOf(card).meta?.textContent ?? null)

    expect(badges(review)).toEqual([null, 'SUPERSET', 'CIRCUIT'])
    expect(badges(workout)).toEqual(['STANDARD', 'SUPERSET', 'CIRCUIT'])
    expect(metas(review)).toEqual([null, '3 ROUNDS', '2 ROUNDS'])
    expect(metas(workout)).toEqual([null, null, '2 ROUNDS'])

    await user.click(within(state).getByRole('radio', { name: /EMOM, AMRAP and For Time/ }))
    expect(badges(review)).toEqual(['EMOM', 'AMRAP', 'FOR TIME'])
    expect(badges(workout)).toEqual(['EMOM', 'AMRAP', 'FOR TIME'])
    expect(metas(workout)).toEqual(['10 MIN', '8 MIN', '15 MIN CAP'])
    // The live timed movements state the same prescribed load as Review.
    const loads = (scope: HTMLElement) =>
      [...scope.querySelectorAll<HTMLElement>('[data-movement-identity]')].map((identity) =>
        identity.querySelector('[data-movement-load]')?.textContent ?? null)
    expect(loads(workout)).toEqual(loads(review))
    expect(loads(workout)).toEqual(['24 kg', null, '24 kg', null, '9 kg'])

    // The gallery and the routes draw the one shared header owner (GAL-02, GAL-06).
    const gallery = readFileSync(resolve(ROOT, 'src/dev/gallery-refinement-cards.tsx'), 'utf8')
    expect(gallery).toMatch(/structure=\{structureIdentity\(block\)\}/)
    for (const consumer of ['src/ui/review-block.tsx', 'src/ui/block-renderers-frame.tsx', 'src/ui/amrap-block.tsx']) {
      const source = readFileSync(resolve(ROOT, consumer), 'utf8')
      expect(source, consumer).toMatch(/from '\.\/refinements\/workout-card'/)
      expect(source, consumer).toMatch(/<WorkoutCard\b[^>]*\bstructure=/s)
    }
    // TASK-012 (C35): the ladder reads its movements through the shared
    // compact prescription, which reads them through liveMovementReadings.
    for (const consumer of ['src/ui/emom-block.tsx', 'src/ui/amrap-block.tsx', 'src/ui/for-time-block.tsx', 'src/ui/refinements/ladder.tsx']) {
      expect(readFileSync(resolve(ROOT, consumer), 'utf8'), consumer).toMatch(/liveMovementReadings\(/)
    }
    expect(readFileSync(resolve(ROOT, 'src/ui/ladder-block.tsx'), 'utf8')).toMatch(/<LadderPrescription\b/)
  })
})

const NO_COMPLETION: BlockCompletionApi = { reportOutcome: () => undefined, isBlockRecorded: () => false }
