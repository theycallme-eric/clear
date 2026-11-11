/**
 * TASK-002 (REQ-002; C03, C06, C07; JOURNEY-002) — context-specific actions
 * with compact equipment, through the consumers the routes render.
 *
 * Review is the actual `/review` route (router, guard, handoff and briefing);
 * Workout is the actual `/workout` route the Start handoff navigates to, with
 * the same composition persisted and started through the session client seam.
 * The shared stylesheets are applied to the document so the declared face and
 * wrapping contract are read from the cascade, not from inline styles. Browser
 * geometry is `e2e/refinement/task-002.spec.ts`.
 *
 * Synthetic data only: in-memory doubles, no account and no network.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, it } from 'vitest'

import type { CandidatesClient } from '../data/candidates'
import type { SessionsClient } from '../data/sessions'
import { routes } from '../app/router'
import { REVIEW_PATH } from '../app/ReviewRoute'
import { GalleryRefinements } from '../dev/gallery-refinements'
import { createError, ErrorCode, err, ok, type Result } from '../state/errors'
import { reviewHandoff } from '../state/review-handoff'
import type { SessionAcceptance, SessionSnapshot } from '../state/schemas'
import {
  CONTEXT_EXPECTED,
  CONTEXT_LISTS,
  CONTEXT_SECTION,
  CONTEXT_STRUCTURES,
  contextActionsAcceptance,
  timedContextAcceptance,
  TIMED_EQUIPMENT,
  TIMED_LISTS,
  type ContextStructure,
} from '../test/context-actions-fixture'
import { peerGroupingSnapshot } from '../test/peer-grouping-fixture'
import { AppProviders, signedIn } from '../test/render'
import { FIXTURE_USER_ID } from '../test/user-data-double'
import { createWorkoutDouble } from '../test/workout-double'
import { prescribedLoadReading } from './refinements/movement-readings'
import { LiveMovement, ReviewMovement, WorkoutCard } from './refinements/workout-card'
import * as PublicEntry from '../design-system/index'
import { ASSET_BLOCKS, ASSET_EQUIPMENT_LABELS } from '../dev/gallery-refinement-assets-data'
import { peerGroupingAcceptance } from '../dev/gallery-refinement-cards-data'
import { renderToStaticMarkup } from 'react-dom/server'
import { EQUIPMENT, STEP_TITLES } from '../state/onboarding'
import { QueryClient } from '../state/query'
import { renderApp } from '../test/render'
import { createFakeUserDataClient, notOnboardedProfile } from '../test/user-data-double'
import {
  EFFORT_FACES,
  EQUIPMENT_ASSETS,
  equipmentGlyph,
  ROUND_FACE_EXCEPTION,
  SHIPPED_EQUIPMENT_ICONS,
  SHIPPED_ICON_COUNT,
  WANTED_REVIEW_LABELS,
} from './refinements/equipment-assets'
import { EQUIPMENT_LABEL } from './refinements/overview'
import { SET_EFFORT_CHOICES } from './set-effort'

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
    style.dataset.task002 = file
    style.textContent = readFileSync(resolve(ROOT, file), 'utf8')
    document.head.append(style)
  }
})

function declared(element: Element, property: string): string {
  return getComputedStyle(element).getPropertyValue(property).trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// The compositions (shared with the browser proof)
// ─────────────────────────────────────────────────────────────────────────────

const contextAcceptance = () => contextActionsAcceptance()
const SECTION = CONTEXT_SECTION
const LISTS = CONTEXT_LISTS
type Context = keyof typeof LISTS
type Structure = ContextStructure
const STRUCTURES = CONTEXT_STRUCTURES
const EXPECTED = CONTEXT_EXPECTED

// ─────────────────────────────────────────────────────────────────────────────
// The route harness
// ─────────────────────────────────────────────────────────────────────────────

interface JourneyOptions {
  acceptFails?: boolean
  candidates?: Partial<CandidatesClient>
}

function journeyDouble(acceptance: SessionAcceptance, options: JourneyOptions = {}) {
  const startedAt = new Date(Date.now() - 60_000).toISOString()
  const prescribed = peerGroupingSnapshot(acceptance, { userId: FIXTURE_USER_ID })
  const running = peerGroupingSnapshot(acceptance, { userId: FIXTURE_USER_ID, startedAt })
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
  const double = createWorkoutDouble({ session: null, sessions, candidates: options.candidates })
  return { double, calls }
}

/** JOURNEY-002's entry: the real router at `/review`, handed this composition. */
async function openReview(acceptance: SessionAcceptance, options: JourneyOptions = {}) {
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
  return { router, calls, double }
}

/** The action: Start, then the `/workout` route the handoff lands on. */
async function startWorkout(router: ReturnType<typeof createMemoryRouter>, firstList: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Start workout' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/workout'))
  await screen.findByRole('list', { name: firstList })
}

function list(context: Context, structure: Structure): HTMLElement {
  return screen.getByRole('list', { name: LISTS[context][structure] })
}

function identities(scope: HTMLElement): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(':scope > li [data-movement-identity]')]
}

function readings(scope: HTMLElement) {
  return identities(scope).map((identity) => ({
    name: identity.querySelector('[data-movement-name]')!.textContent,
    equipment: identity.querySelector('[data-movement-context]')!.textContent,
    load: identity.querySelector('[data-movement-load]')?.textContent ?? null,
  }))
}

function cards(context: Context): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(`[data-workout-card="${context}"]`)]
}

function headerOf(card: HTMLElement) {
  const header = card.querySelector<HTMLElement>(':scope > [data-movement-group-header]')!
  return {
    header,
    title: header.querySelector<HTMLElement>('.clr-movement-group-header__title'),
    badge: header.querySelector<HTMLElement>('.clr-movement-group-header__badge'),
  }
}

/**
 * C03, R132: the compact equipment is readable text beside the name — a
 * sibling of the name in the one wrapping name column, never inside the name's
 * own element, never a line of its own and never an icon alone.
 */
function expectCompactEquipment(identity: HTMLElement, equipment: string) {
  const nameRow = identity.querySelector<HTMLElement>(':scope > [data-movement-name-row]')!
  const column = nameRow.querySelector<HTMLElement>(':scope > .clr-movement-identity__title')!
  const name = column.querySelector<HTMLElement>(':scope > .clr-movement-identity__name')!
  const context = column.querySelector<HTMLElement>(':scope > [data-movement-context]')!
  expect(context, 'equipment beside the name').not.toBeNull()
  expect(name.nextElementSibling).toBe(context)
  expect(name).not.toContainElement(context)
  expect(context.textContent).toBe(equipment)
  // Text fallback: a readable word, not a glyph standing in for it.
  expect(context.querySelector('svg, img')).toBeNull()
  // Only one equipment reading on the movement, and none below the prescription.
  expect(identity.querySelectorAll('[data-movement-context]')).toHaveLength(1)
  // Readable wrapping: the name and its equipment share one wrapping column,
  // and the equipment moves under the name as a unit inside it.
  expect(declared(column, 'flex-wrap')).toBe('wrap')
  expect(declared(column, 'overflow-wrap')).toBe('anywhere')
  expect(declared(column, 'min-width')).toMatch(/^0(px)?$/)
  expect(declared(context, 'max-width')).toBe('100%')
  expect(declared(context, 'font-size')).toBe('var(--label-xs-size)')
  expect(declared(context, 'color')).toBe('var(--text-secondary)')
}

const LIVE_ACTION = /^Rest( for .+)?$/
const LIVE_PROGRESS = /^(Set \d+\/\d+|Extra set \d+)$/

// ─────────────────────────────────────────────────────────────────────────────

describe('TASK-002 context-specific actions with compact equipment', () => {
  it('AC-C03-01 shows the compact equipment beside each movement name in Review and Workout, as readable wrapping text', async () => {
    const { router } = await openReview(contextAcceptance())
    for (const structure of STRUCTURES) {
      identities(list('review', structure)).forEach((identity, index) =>
        expectCompactEquipment(identity, EXPECTED[structure][index].equipment))
    }

    await startWorkout(router, LISTS.workout.superset)
    for (const structure of STRUCTURES) {
      identities(list('workout', structure)).forEach((identity, index) =>
        expectCompactEquipment(identity, EXPECTED[structure][index].equipment))
    }
    // The live heading names the movement alone; its equipment is beside it.
    expect(screen.getByRole('heading', { name: 'back squat' })).toBeInTheDocument()
  })

  it('AC-C06-01 offers Swap in Review’s movement slot and set progress, Rest and logging in Workout’s, never the other way round', async () => {
    const user = userEvent.setup()
    const { router } = await openReview(contextAcceptance())
    for (const structure of STRUCTURES) {
      for (const identity of identities(list('review', structure))) {
        const nameRow = identity.querySelector(':scope > [data-movement-name-row]')!
        const slots = [...nameRow.children].slice(1)
        expect(slots.map((slot) => slot.className)).toEqual(['clr-movement-identity__action'])
        const name = identity.querySelector('[data-movement-name]')!.textContent
        expect(within(slots[0] as HTMLElement).getByRole('button', { name: `Swap ${name}` })).toBeInTheDocument()
      }
    }
    const main = within(screen.getByRole('main'))
    expect(main.queryAllByRole('button', { name: LIVE_ACTION })).toEqual([])
    expect(main.queryAllByText(LIVE_PROGRESS)).toEqual([])

    await startWorkout(router, LISTS.workout.superset)
    for (const structure of ['standard', 'superset'] as const) {
      for (const identity of identities(list('workout', structure))) {
        const nameRow = identity.querySelector(':scope > [data-movement-name-row]')!
        const slots = [...nameRow.children].slice(1)
        expect(slots.map((slot) => slot.className)).toEqual(['clr-movement-identity__counter'])
        expect(slots[0]).toHaveTextContent(LIVE_PROGRESS)
      }
    }
    // Rest and set logging: the standard movements' own, the superset's one,
    // and each circuit station's entry.
    const live = within(screen.getByRole('main'))
    expect(live.getAllByRole('button', { name: 'Rest' })).toHaveLength(EXPECTED.standard.length + 1)
    expect(live.getAllByRole('button', { name: /^Rest for / })).toHaveLength(EXPECTED.circuit.length)
    expect(live.queryAllByRole('button', { name: /^Swap / })).toEqual([])
    expect(document.querySelectorAll('.clr-movement-identity__action')).toHaveLength(0)

    // The live action is real: Rest opens the set-logging sheet for that set.
    const [squatRest] = within(list('workout', 'standard')).getAllByRole('button', { name: 'Rest' })
    await user.click(squatRest)
    expect(await screen.findByRole('form', { name: 'Log set 1 of back squat' })).toBeInTheDocument()
  })

  it('AC-C07-01 heads Review’s block cards with the live cards’ static header: the section identity and the badge, in the same face', async () => {
    const { router } = await openReview(contextAcceptance())
    const review = cards('review')
    expect(review).toHaveLength(3)
    const reviewHeaders = review.map(headerOf)
    for (const { title, header } of reviewHeaders) {
      expect(title).toHaveTextContent(SECTION)
      expect(header.querySelector('button, [aria-expanded], .clr-collapsible__glyph')).toBeNull()
    }
    // The grouped blocks are named by their badge. TASK-003 (AC-C08-01,
    // AC-C09-01) supersedes the right-hand, rounds-in-badge reading: the badge
    // names the format below the title, and the rounds are read below it.
    expect(reviewHeaders[1].badge).toHaveTextContent(/^SUPERSET$/)
    expect(reviewHeaders[2].badge).toHaveTextContent(/^CIRCUIT$/)
    expect(reviewHeaders[1].header.querySelector('[data-structure-meta]')).toHaveTextContent(/^3 ROUNDS$/)
    expect(reviewHeaders[2].header.querySelector('[data-structure-meta]')).toHaveTextContent(/^2 ROUNDS$/)
    const reviewTitle = reviewHeaders[0].title!
    expect(reviewTitle.tagName).toBe('H2')

    await startWorkout(router, LISTS.workout.superset)
    const live = cards('workout').map(headerOf)
    expect(live).toHaveLength(3)
    const liveTitle = live[0].title!
    expect(liveTitle).toHaveTextContent(SECTION)
    expect(live[1].badge).toHaveTextContent(/^SUPERSET/)
    // One header vocabulary: the same owner, classes and declared face.
    expect([...liveTitle.classList]).toEqual([...reviewTitle.classList])
    for (const property of ['font-family', 'font-size', 'letter-spacing', 'text-transform', 'color', 'font-weight', 'line-height', 'margin']) {
      expect(declared(reviewTitle, property), property).toBe(declared(liveTitle, property))
    }
    expect(declared(liveTitle, 'font-size')).toBe('var(--label-xs-size)')
    expect(declared(liveTitle, 'text-transform')).toBe('uppercase')
    // The heading keeps its header's weight and line height, as the label does,
    // rather than the heading element's own bold display face.
    for (const property of ['font-weight', 'line-height']) {
      expect(declared(reviewTitle, property), property).toBe(declared(reviewTitle.parentElement!, property))
    }
  })

  it('AC-R002-01 says a duplicate Bodyweight once, by the equipment, in both contexts and never hides an actual prescribed load', async () => {
    expect(prescribedLoadReading('Bodyweight', 'bodyweight')).toBeNull()
    expect(prescribedLoadReading('Bodyweight', 'pull up bar')).toBe('Bodyweight')
    expect(prescribedLoadReading('24 kg', 'kettlebell')).toBe('24 kg')
    expect(prescribedLoadReading('75% 1RM', 'barbell')).toBe('75% 1RM')
    expect(prescribedLoadReading(null, 'bodyweight')).toBeNull()

    const { router } = await openReview(contextAcceptance())
    const review = STRUCTURES.map((structure) => readings(list('review', structure)))
    expect(review).toEqual(STRUCTURES.map((structure) => EXPECTED[structure]))
    for (const structure of STRUCTURES) {
      for (const identity of identities(list('review', structure))) {
        expect(identity.textContent?.match(/bodyweight/gi)?.length ?? 0).toBeLessThanOrEqual(1)
      }
    }

    await startWorkout(router, LISTS.workout.superset)
    expect(STRUCTURES.map((structure) => readings(list('workout', structure)))).toEqual(review)
    const [, airSquat] = identities(list('workout', 'standard'))
    expect(airSquat.querySelector(':scope > [data-movement-detail]')!.textContent).not.toMatch(/bodyweight/i)
  })

  it('AC-R002-02 keeps Review’s sections open under static semantic headings, with no toggle, chevron or hit area, and keeps the separate disclosures', async () => {
    const user = userEvent.setup()
    const { router } = await openReview(contextAcceptance())
    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .filter((heading) => heading.closest('[data-workout-card="review"]') !== null)
    // The section is named once, on its first card's header.
    expect(headings.map((heading) => heading.textContent)).toEqual([SECTION])
    expect(headings[0]).toHaveClass('clr-movement-group-header__title')
    expect(headings[0].closest('button')).toBeNull()
    expect(headings[0]).not.toHaveAttribute('tabindex')
    expect(screen.queryByRole('button', { name: new RegExp(SECTION) })).toBeNull()
    // Pressing the header changes nothing: there is no state to change.
    await user.click(headings[0])
    for (const block of document.querySelectorAll('[data-review-block]')) {
      expect(block.closest('.clr-collapsible')).toBeNull()
      expect(block.closest('[data-expanded]')).toBeNull()
    }
    expect(within(list('review', 'standard')).getByText('back squat')).toBeVisible()

    // The section's optional tempo detail is its own disclosure and stays one.
    const tempo = screen.getByRole('button', { name: 'Tempo' })
    expect(tempo).toHaveAttribute('aria-expanded', 'false')
    await user.click(tempo)
    expect(tempo).toHaveAttribute('aria-expanded', 'true')
    expect(within(screen.getByRole('region', { name: 'Tempo' })).getByText('3-1-1-0')).toBeInTheDocument()

    // The Coaching and notes disclosure remains, separate, on the live cards.
    await startWorkout(router, LISTS.workout.superset)
    const coaching = screen.getByRole('button', { name: 'Coaching and notes — back squat' })
    expect(coaching).toHaveAttribute('aria-expanded', 'false')
    await user.click(coaching)
    expect(coaching).toHaveAttribute('aria-expanded', 'true')
    await user.click(coaching)
    expect(coaching).toHaveAttribute('aria-expanded', 'false')
  })

  it('AC-R002-03 keeps planned sets, reps, rounds and rest in Review, keeps live counters and Rest or log controls out of it, and keeps Swap out of Workout', async () => {
    const { router } = await openReview(contextAcceptance())
    const main = screen.getByRole('main')
    const text = main.textContent ?? ''
    // Planned work stays: sets × reps, the movement's own rest, the rounds,
    // the one-round sequence and the group's rest. TASK-003 (AC-C08-01): the
    // rounds are read beside the format badge rather than inside it.
    for (const planned of ['3 × 5 reps', 'Rest 120s', '2 × 15 reps', 'Rest 45s', '3 ROUNDS', 'One round: 01 → 02', 'Rest 90s between rounds', '2 ROUNDS', 'Rest 60s between rounds', '15 reps']) {
      expect(text, planned).toContain(planned)
    }
    expect([...main.querySelectorAll('[data-structure-meta]')].map((meta) => meta.textContent)).toEqual(['3 ROUNDS', '2 ROUNDS'])
    // Nothing live leaks in.
    expect(main.querySelectorAll('.clr-movement-identity__counter')).toHaveLength(0)
    expect(within(main).queryAllByText(LIVE_PROGRESS)).toEqual([])
    expect(within(main).queryAllByRole('button', { name: LIVE_ACTION })).toEqual([])
    expect(within(main).queryAllByRole('button', { name: /^Log\b/ })).toEqual([])
    expect(within(main).queryAllByRole('timer')).toEqual([])
    expect(within(main).getAllByRole('button', { name: /^Swap / })).toHaveLength(7)

    await startWorkout(router, LISTS.workout.superset)
    const live = screen.getByRole('main')
    expect(within(live).queryAllByRole('button', { name: /^Swap / })).toEqual([])
    expect(within(live).queryAllByRole('button', { name: /^Undo swap/ })).toEqual([])
    expect(live.querySelectorAll('.clr-movement-identity__counter').length).toBeGreaterThan(0)
  })

  it('JOURNEY-002 opens Review, uses Swap, starts that same workout and uses Rest on Workout without recording work', async () => {
    const user = userEvent.setup()
    const { router, calls } = await openReview(contextAcceptance())
    const before = STRUCTURES.map((structure) => readings(list('review', structure)))

    // Review's contextual action: Swap opens the alternatives for that slot.
    await user.click(screen.getByRole('button', { name: 'Swap back squat' }))
    const keep = await screen.findByRole('button', { name: 'Keep back squat' })
    expect(await screen.findByText('Nothing else fits this slot')).toBeInTheDocument()
    await user.click(keep)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Keep back squat' })).toBeNull())
    expect(STRUCTURES.map((structure) => readings(list('review', structure)))).toEqual(before)

    await startWorkout(router, LISTS.workout.superset)
    expect(calls.accepted).toHaveLength(1)
    expect(calls.started).toHaveLength(1)
    expect(STRUCTURES.map((structure) => readings(list('workout', structure)))).toEqual(before)

    // Workout's contextual action: Rest opens the set entry; nothing is logged
    // until Log set, and collapsing keeps the session as it was.
    await user.click(within(list('workout', 'standard')).getAllByRole('button', { name: 'Rest' })[0])
    const form = await screen.findByRole('form', { name: 'Log set 1 of back squat' })
    expect(form).toBeInTheDocument()
    const [squat] = identities(list('workout', 'standard'))
    expect(squat.querySelector('.clr-movement-identity__counter')).toHaveTextContent('Set 1/3')
    expect(screen.queryByRole('button', { name: /^Swap / })).toBeNull()
  })

  it('JOURNEY-002 timed formats show the same equipment beside each name in Review and in the live EMOM, AMRAP and For Time blocks', async () => {
    const { router } = await openReview(timedContextAcceptance())
    const reviewLists = TIMED_LISTS.review.map((name) => screen.getByRole('list', { name }))
    const equipment = (scope: HTMLElement) =>
      identities(scope).map((identity) => identity.querySelector('[data-movement-context]')?.textContent ?? null)
    const expected = TIMED_EQUIPMENT
    expect(reviewLists.map(equipment)).toEqual(expected)
    for (const scope of reviewLists) {
      for (const identity of identities(scope)) expectCompactEquipment(identity, identity.querySelector('[data-movement-context]')!.textContent!)
    }
    for (const card of cards('review')) expect(headerOf(card).title).toHaveTextContent(SECTION)

    await startWorkout(router, TIMED_LISTS.workout[0])
    const liveLists = TIMED_LISTS.workout.map((name) => screen.getByRole('list', { name }))
    expect(liveLists.map(equipment)).toEqual(expected)
    for (const scope of liveLists) {
      for (const identity of identities(scope)) expectCompactEquipment(identity, identity.querySelector('[data-movement-context]')!.textContent!)
    }
    expect(screen.queryAllByRole('button', { name: /^Swap / })).toEqual([])
  })

  it('JOURNEY-002 recovery: a failed alternatives read or a failed Start keeps Review as planned and records no work', async () => {
    const user = userEvent.setup()
    let reads = 0
    const { router, calls } = await openReview(contextAcceptance(), {
      acceptFails: true,
      candidates: {
        async retrieve() {
          reads += 1
          return err(createError(ErrorCode.NETWORK_OFFLINE))
        },
      },
    })
    const before = STRUCTURES.map((structure) => readings(list('review', structure)))

    await user.click(screen.getByRole('button', { name: 'Swap push up' }))
    expect(await screen.findByText('Alternatives didn’t load')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(reads).toBe(2))
    await user.click(await screen.findByRole('button', { name: 'Keep push up' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Keep push up' })).toBeNull())
    expect(STRUCTURES.map((structure) => readings(list('review', structure)))).toEqual(before)

    await user.click(screen.getByRole('button', { name: 'Start workout' }))
    expect(await screen.findByText('Couldn’t start this workout')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(REVIEW_PATH)
    expect(calls.accepted).toHaveLength(1)
    expect(calls.started).toEqual([])
    // Review is unchanged behind the error: same static headers, same Swap.
    expect(STRUCTURES.map((structure) => readings(list('review', structure)))).toEqual(before)
    expect(cards('review')).toHaveLength(3)
    expect(screen.getAllByRole('button', { name: /^Swap / }).length).toBeGreaterThan(0)
  })

  it('renders the shared owners with each context’s own slot', () => {
    render(
      <>
        <WorkoutCard context="review" heading title="Conditioning">
          <ReviewMovement name="kb swing" equipment="kettlebell" prescription="15 reps" swap={<button type="button">Swap kb swing</button>} />
        </WorkoutCard>
        <WorkoutCard context="workout" title="Conditioning">
          <LiveMovement name="kb swing" equipment="kettlebell" prescription="15 reps" progress="Set 1/2" />
        </WorkoutCard>
      </>,
    )
    const [review, live] = cards('review').concat(cards('workout'))
    expect(review.querySelector('.clr-movement-identity__action')).toHaveTextContent('Swap kb swing')
    expect(review.querySelector('.clr-movement-identity__counter')).toBeNull()
    expect(review.querySelector('.clr-movement-identity__name')!.tagName).toBe('P')
    expect(live.querySelector('.clr-movement-identity__counter')).toHaveTextContent('Set 1/2')
    expect(live.querySelector('.clr-movement-identity__action')).toBeNull()
    expect(within(live).getByRole('heading', { name: 'kb swing' })).toBeInTheDocument()
    expect(within(review).getByRole('heading', { name: 'Conditioning' })).toBeInTheDocument()
    expect(within(live).queryByRole('heading', { name: 'Conditioning' })).toBeNull()
  })

  it('renders the accepted gallery state cards through WorkoutCard with static headers and each context’s slot', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/gallery/refinements?state=cards']}>
        <GalleryRefinements />
      </MemoryRouter>,
    )
    const state = document.querySelector<HTMLElement>('[data-refinement-state="cards"]')!
    const review = state.querySelector<HTMLElement>('[data-gallery-context="review"]')!
    const workout = state.querySelector<HTMLElement>('[data-gallery-context="workout"]')!
    const check = () => {
      const reviewCards = [...review.querySelectorAll<HTMLElement>('[data-workout-card="review"]')]
      const liveCards = [...workout.querySelectorAll<HTMLElement>('[data-workout-card="workout"]')]
      expect(reviewCards.length).toBeGreaterThan(0)
      expect(liveCards).toHaveLength(reviewCards.length)
      expect(headerOf(reviewCards[0]).title!.tagName).toMatch(/^H\d$/)
      expect(headerOf(liveCards[0]).title!.tagName).toBe('SPAN')
      for (const identity of review.querySelectorAll<HTMLElement>('[data-movement-identity]')) {
        expect(identity.querySelector('.clr-movement-identity__action button')).not.toBeNull()
        expect(identity.querySelector('.clr-movement-identity__counter')).toBeNull()
        expectCompactEquipment(identity, identity.querySelector('[data-movement-context]')!.textContent!)
      }
      for (const identity of workout.querySelectorAll<HTMLElement>('[data-movement-identity]')) {
        expect(identity.querySelector('.clr-movement-identity__action')).toBeNull()
        expectCompactEquipment(identity, identity.querySelector('[data-movement-context]')!.textContent!)
      }
      expect(review.querySelector('.clr-collapsible__glyph, [data-movement-group-header] button')).toBeNull()
    }
    check()
    await user.click(within(state).getByRole('radio', { name: /EMOM, AMRAP and For Time/ }))
    check()
    expect(within(review).getByRole('list', { name: 'emom' })).toBeInTheDocument()
    expect(within(workout).getByRole('list', { name: 'Movements in this EMOM' })).toBeInTheDocument()

    // The gallery draws the owners the routes draw (GAL-02, GAL-06).
    const gallery = readFileSync(resolve(ROOT, 'src/dev/gallery-refinement-cards.tsx'), 'utf8')
    expect(gallery).toMatch(/from '\.\.\/ui\/refinements\/workout-card'/)
    expect(gallery).toMatch(/import \{ ReviewSection \} from '\.\.\/ui\/review-block'/)
    for (const consumer of ['src/ui/review-block.tsx', 'src/ui/block-renderers-frame.tsx']) {
      expect(readFileSync(resolve(ROOT, consumer), 'utf8')).toMatch(/from '\.\/refinements\/workout-card'/)
    }
    expect(readFileSync(resolve(ROOT, 'src/ui/review-exercise-row.tsx'), 'utf8')).toMatch(/<ReviewMovement\b/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TASK-029 (REQ-029; C56; R122, R132; JOURNEY-029) — the verified equipment
// asset inventory and the readable fallback, on the real /review, /workout and
// Setup equipment surfaces. Composition: `gallery-refinement-assets-data.ts`,
// every Setup equipment id once and the Wall ball review's medicine ball.
// Browser geometry is `e2e/refinement/task-029.spec.ts`.
// ─────────────────────────────────────────────────────────────────────────────

/** The 75 shipped icons, by name, in source order (R122's verified inventory). */
const SHIPPED_ICON_NAMES = [
  'ChevronRight', 'ChevronLeft', 'ChevronDown', 'ChevronUp', 'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown',
  'SortAsc', 'SortDesc', 'Menu', 'X', 'Plus', 'Minus', 'Check', 'Search', 'Filter', 'Sliders', 'Trash', 'Copy',
  'Download', 'Upload', 'Share', 'Play', 'Pause', 'Stop', 'Skip', 'Pencil', 'Maximize2', 'Lock', 'Unlock', 'Key',
  'LogIn', 'LogOut', 'Calendar', 'CalendarCheck', 'Clock', 'Stopwatch', 'Rest', 'RefreshCw', 'Loader2',
  'CircleCheck', 'CircleX', 'CircleAlert', 'AlertCircle', 'AlertTriangle', 'HelpCircle', 'Info', 'Eye', 'EyeOff',
  'Bell', 'BellOff', 'Zap', 'Flame', 'Star', 'Trophy', 'Dumbbell', 'WeightPlate', 'Pulse', 'Streak', 'Circuit',
  'Ladder', 'Superset', 'Log', 'FileText', 'Gauge', 'Target', 'Crosshair', 'User', 'Frown', 'Meh', 'Smile',
  'SmilePlus', 'ThumbsDown', 'ThumbsUp',
] as const

/**
 * sha256 of `src/design-system/assets/icons.tsx` at the accepted gallery
 * reference eded158 (identical on this integration base). Adopting a new
 * glyph is the recorded follow-up: it changes this pin, `SHIPPED_ICON_NAMES`,
 * `equipment-assets.ts` and the wanted list together, deliberately.
 */
const SHIPPED_ICONS_SHA256 = '8368e49bce23ce890c195736e22c28f68b2ce5a18be7a689696285caf8c1224d'

const WANTED_LIST = 'docs/design/library/refinements-2026-11-04/authority/EQUIPMENT-ICON-WANTED-LIST.md'

const assetAcceptance = () => peerGroupingAcceptance({ blocks: ASSET_BLOCKS })

/** Each structure's equipment labels, in order, read from a context's lists. */
function equipmentLabels(context: Context): string[][] {
  return STRUCTURES.map((structure) =>
    identities(list(context, structure)).map((identity) => identity.querySelector('[data-movement-context]')!.textContent ?? ''))
}

/** AC-R029-02: every movement's equipment is the readable label beside its name, glyph or none. */
function expectEveryLabelReadable(context: Context) {
  expect(equipmentLabels(context)).toEqual(ASSET_EQUIPMENT_LABELS)
  for (const structure of STRUCTURES) {
    for (const identity of identities(list(context, structure))) {
      const label = identity.querySelector('[data-movement-context]')!.textContent!
      expect(label.trim().length, 'a readable word, never an empty slot').toBeGreaterThan(0)
      expectCompactEquipment(identity, label)
    }
  }
}

/** Review's Required equipment group: the label beside the one shipped category glyph, then words. */
function expectRequiredEquipmentReadable() {
  const summary = document.querySelector<HTMLElement>('[data-equipment-summary]')!
  expect(summary).not.toBeNull()
  const label = summary.querySelector<HTMLElement>('.clr-equipment-summary__label')!
  expect(label.textContent).toBe(EQUIPMENT_LABEL)
  const glyphs = summary.querySelectorAll('svg')
  expect(glyphs, 'one category glyph, beside its label').toHaveLength(1)
  expect(glyphs[0].closest('[aria-hidden="true"]')).not.toBeNull()
  expect(glyphs[0].outerHTML).toBe(renderToStaticMarkup(<PublicEntry.Dumbbell size={16} />))
  const names = within(summary).getByRole('list', { name: EQUIPMENT_LABEL })
  const items = within(names).getAllByRole('listitem')
  expect(items.map((item) => item.textContent)).toEqual(ASSET_EQUIPMENT_LABELS.flat().filter((name) => name !== 'bodyweight'))
  for (const item of items) expect(item.querySelector('svg, img')).toBeNull()
}

/** Setup's own equipment step, through the real route and its guard. */
async function openSetupEquipment() {
  const userData = createFakeUserDataClient({
    profile: async () => ok(notOnboardedProfile()),
    locations: async () => ok([]),
  })
  const user = userEvent.setup()
  // A cold cache, so the guard reads this athlete's profile rather than a warm onboarded one.
  renderApp(['/onboarding'], signedIn({ userData, queryClient: new QueryClient() }))
  await screen.findByRole('heading', { level: 2, name: STEP_TITLES.location })
  await user.click(screen.getByRole('radio', { name: 'Home gym' }))
  return { user, group: screen.getByRole('group', { name: 'Equipment' }) }
}

describe('TASK-029 equipment asset inventory and readable fallback', () => {
  it('AC-C56-01 preserves the verified equipment inventory: the 75 shipped icons unchanged, Dumbbell and WeightPlate the only equipment glyphs, and Setup’s 16 equipment ids', () => {
    // The icon family: 75 named icons, byte-identical to the accepted reference.
    const source = readFileSync(resolve(ROOT, 'src/design-system/assets/icons.tsx'), 'utf8')
    expect(createHash('sha256').update(source).digest('hex')).toBe(SHIPPED_ICONS_SHA256)
    const exported = [...source.matchAll(/^export const (\w+)/gm)].map((match) => match[1])
    expect(exported).toEqual([...SHIPPED_ICON_NAMES])
    expect(exported).toHaveLength(SHIPPED_ICON_COUNT)
    // The public entry re-exports every one of them (`index.js` from `./assets/icons`).
    expect(readFileSync(resolve(ROOT, 'src/design-system/index.js'), 'utf8')).toMatch(/\} from '\.\/assets\/icons';/)
    for (const name of SHIPPED_ICON_NAMES) {
      expect(typeof (PublicEntry as Record<string, unknown>)[name], `${name} from the public entry`).toBe('function')
    }
    // No equipment glyph beyond the two verified ones exists or is assumed.
    expect(exported.filter((name) => /kettle|barbell|medicine|band|roller|rope|bike|rower|bench|box/i.test(name))).toEqual([])
    expect(SHIPPED_EQUIPMENT_ICONS.map(({ glyph }) => glyph)).toEqual(['Dumbbell', 'WeightPlate'])

    // The taxonomy is Setup's own, read, not redefined: 16 ids in Setup's order.
    expect(EQUIPMENT_ASSETS.map(({ id, label }) => ({ value: id, label }))).toEqual(EQUIPMENT.map(({ value, label }) => ({ value, label })))
    expect(EQUIPMENT_ASSETS).toHaveLength(16)
    expect(EQUIPMENT_ASSETS.filter(({ glyph }) => glyph !== null).map(({ id, glyph }) => [id, glyph])).toEqual([['dumbbells', 'Dumbbell']])
    expect(EQUIPMENT_ASSETS.filter(({ status }) => status === 'wanted')).toHaveLength(15)
    // WeightPlate is plates only: never a stand-in for barbell or any other missing kind.
    expect(EQUIPMENT.map(({ value }) => equipmentGlyph(value)).filter((glyph) => glyph === 'WeightPlate')).toEqual([])
    expect(equipmentGlyph('barbell')).toBeNull()
    expect(equipmentGlyph('bodyweight'), 'User is not assumed to mean bodyweight').toBeNull()
  })

  it('AC-C56-01 keeps the equipment wanted list in step with the inventory: every Setup id’s glyph status and next step, the medicine ball as a review label', () => {
    const doc = readFileSync(resolve(ROOT, WANTED_LIST), 'utf8')
    const rows = new Map(
      [...doc.matchAll(/^\| ([^|]+) \/ ([^|]+?) \| ([^|]+) \| ([^|]+) \|$/gm)]
        .map(([, label, id, status, next]) => [id.trim(), { label: label.trim(), status: status.trim(), next: next.trim() }]),
    )
    const nextWords = { 'reuse': /^Reuse the actual shared icon/, 'first-batch': /^First[ -]batch/, 'text-decision': /^Decide whether a compact text label is sufficient/, 'catalog-backlog': /^Catalog coverage backlog/ }
    for (const asset of EQUIPMENT_ASSETS) {
      const row = rows.get(asset.id)
      expect(row, `${asset.id} is on the wanted list`).toBeDefined()
      expect(row!.status, asset.id).toMatch(asset.glyph === null ? /^(Missing|No dedicated)/ : new RegExp(`^${asset.glyph} exists`))
      expect(row!.next, asset.id).toMatch(nextWords[asset.next])
    }
    const [medicine] = WANTED_REVIEW_LABELS
    expect(rows.get('review label')).toMatchObject({ label: medicine.label, status: expect.stringMatching(/^Missing; not a current 16-item setup option/) })
    expect(rows.get('review label')!.next).toMatch(nextWords[medicine.next])
    expect(rows.get('supplementary glyph')?.status).toBe('WeightPlate exists')
    // The selected placement and the explicit follow-up are both recorded.
    expect(doc).toMatch(/icon-only equipment is not selected/)
    expect(doc).toMatch(/## Follow-up \(explicit, not scheduled by TASK-029\)/)
    expect(doc).toMatch(/\*\*75\*\* named icons/)
  })

  it('AC-R029-01 preserves the approved round effort faces: only Frown, Meh, Smile and SmilePlus are round, and Effort still reuses Frown, Meh and Smile', () => {
    const round = SHIPPED_ICON_NAMES.filter((name) => {
      const Icon = (PublicEntry as unknown as Record<string, (props: { size?: number }) => React.ReactElement>)[name]
      return renderToStaticMarkup(<Icon />).includes('<circle')
    })
    expect(round).toEqual([...ROUND_FACE_EXCEPTION])
    for (const face of ROUND_FACE_EXCEPTION) {
      const Icon = (PublicEntry as unknown as Record<string, () => React.ReactElement>)[face]
      // Line-drawn: an unfilled, stroked round outline, as approved.
      expect(renderToStaticMarkup(<Icon />)).toMatch(/<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor"/)
    }
    // The Effort control keeps its faces: the shipped components themselves.
    expect(SET_EFFORT_CHOICES.map(({ Glyph }) => Glyph)).toEqual(EFFORT_FACES.map((face) => (PublicEntry as Record<string, unknown>)[face]))
  })

  it('AC-R029-01 reads the Wall ball’s medicine ball as composed equipment without inventing a medicine-ball setup id', async () => {
    expect(EQUIPMENT.filter(({ value, label }) => /medicine/i.test(`${value} ${label}`))).toEqual([])
    expect(WANTED_REVIEW_LABELS).toEqual([expect.objectContaining({ label: 'Medicine ball', equipment: 'medicine-ball', setupId: null })])

    // Review and Workout say "medicine ball" beside Wall ball, in words.
    const { router } = await openReview(assetAcceptance())
    const [wallBall] = identities(list('review', 'circuit'))
    expect(wallBall.querySelector('[data-movement-name]')!.textContent).toBe('wall ball')
    expectCompactEquipment(wallBall, 'medicine ball')
    await startWorkout(router, LISTS.workout.superset)
    expectCompactEquipment(identities(list('workout', 'circuit'))[0], 'medicine ball')
  })

  it('AC-R029-01 Setup equipment offers exactly the 16 Setup equipment choices, each named in words, and no medicine ball', async () => {
    const { user, group } = await openSetupEquipment()
    const choices = within(group).getAllByRole('checkbox')
    expect(choices.map((choice) => choice.getAttribute('aria-label') ?? (choice as HTMLInputElement).labels?.[0]?.textContent?.trim())).toEqual(EQUIPMENT.map(({ label }) => label))
    for (const { label } of EQUIPMENT) {
      expect(within(group).getByRole('checkbox', { name: label })).toBeInTheDocument()
      expect(within(group).getByText(label)).toBeVisible()
    }
    expect(within(group).queryByRole('checkbox', { name: /medicine/i })).toBeNull()
    for (const choice of choices) {
      const row = choice.closest('label') ?? choice.parentElement!
      expect(row.textContent!.trim().length, 'each choice carries its readable label').toBeGreaterThan(0)
    }
    // The choices remain controls: a label answers, and nothing is committed by reading.
    const barbell = within(group).getByRole('checkbox', { name: 'Barbell' })
    expect(barbell).not.toBeChecked()
    await user.click(within(group).getByText('Barbell'))
    expect(barbell).toBeChecked()
  })

  it('AC-R029-02 JOURNEY-029 reads every equipment kind as a readable label beside its name in Review and Workout, glyph or none, and Review’s Required equipment in words', async () => {
    const { router, calls } = await openReview(assetAcceptance())
    expectEveryLabelReadable('review')
    expectRequiredEquipmentReadable()
    // Lack of glyphs does not block the placement: the kinds with no shipped
    // glyph are labelled exactly as the one kind that has one.
    const kinds = new Set(ASSET_EQUIPMENT_LABELS.flat())
    expect(kinds.size).toBe(17)

    await startWorkout(router, LISTS.workout.superset)
    expectEveryLabelReadable('workout')
    expect(calls.started).toHaveLength(1)
    // The live heading names the movement alone; its equipment is beside it.
    expect(screen.getByRole('heading', { name: 'dumbbell bench press' })).toBeInTheDocument()
  })

  it('JOURNEY-029 recovery: a failed Start keeps Review’s equipment labels and Required equipment as they were and records no work', async () => {
    const { router, calls } = await openReview(assetAcceptance(), { acceptFails: true })
    const before = equipmentLabels('review')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Start workout' }))
    expect(await screen.findByText('Couldn’t start this workout')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(REVIEW_PATH)
    expect(calls.started).toEqual([])
    expect(equipmentLabels('review')).toEqual(before)
    expectEveryLabelReadable('review')
    expectRequiredEquipmentReadable()
  })

  it('renders the accepted gallery state assets: the shared equipment inventory, then the routes’ own Review, Workout and Setup equipment as readable labels', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/gallery/refinements?state=assets']}>
        <GalleryRefinements />
      </MemoryRouter>,
    )
    const state = document.querySelector<HTMLElement>('[data-refinement-state="assets"]')!
    expect(state).not.toBeNull()
    const inventory = within(state).getByRole('list', { name: 'Setup equipment glyph status' })
    const rows = within(inventory).getAllByRole('listitem')
    expect(rows.map((row) => row.dataset.equipmentAsset)).toEqual(EQUIPMENT.map(({ value }) => value))
    expect(rows.map((row) => row.dataset.equipmentStatus)).toEqual(EQUIPMENT_ASSETS.map(({ status }) => status))
    for (const [index, row] of rows.entries()) expect(row.textContent).toContain(EQUIPMENT[index].label)
    const shipped = within(state).getByRole('list', { name: 'Shipped equipment glyphs' })
    expect([...shipped.querySelectorAll<HTMLElement>('[data-shipped-glyph]')].map((item) => item.dataset.shippedGlyph)).toEqual(['Dumbbell', 'WeightPlate'])
    expect(shipped.querySelectorAll('svg')).toHaveLength(2)
    expect(state.querySelector('[data-equipment-wanted="medicine-ball"]')).toHaveTextContent(/not a current Setup equipment ID/)

    // Review: the route's Required equipment group and cards.
    const review = state.querySelector<HTMLElement>('[data-gallery-context="review"]')!
    expect(within(review).getAllByRole('list', { name: EQUIPMENT_LABEL })).toHaveLength(1)
    const reviewLabels = [...review.querySelectorAll<HTMLElement>('[data-movement-identity]')]
    expect(reviewLabels.map((identity) => identity.querySelector('[data-movement-context]')!.textContent)).toEqual(ASSET_EQUIPMENT_LABELS.flat())
    for (const identity of reviewLabels) expectCompactEquipment(identity, identity.querySelector('[data-movement-context]')!.textContent!)

    // Workout: the live cards over the same composition.
    await user.click(within(state).getByRole('radio', { name: 'Workout' }))
    const workout = state.querySelector<HTMLElement>('[data-gallery-context="workout"]')!
    const liveLabels = [...workout.querySelectorAll<HTMLElement>('[data-movement-identity]')]
    expect(liveLabels.map((identity) => identity.querySelector('[data-movement-context]')!.textContent)).toEqual(ASSET_EQUIPMENT_LABELS.flat())
    for (const identity of liveLabels) expectCompactEquipment(identity, identity.querySelector('[data-movement-context]')!.textContent!)

    // Setup: the route's own equipment step, every id a labelled choice.
    const setup = state.querySelector<HTMLElement>('[data-gallery-setup-equipment]')!
    const choices = within(setup).getAllByRole('checkbox')
    expect(choices).toHaveLength(EQUIPMENT.length)
    for (const { label } of EQUIPMENT) expect(within(setup).getByRole('checkbox', { name: label })).toBeInTheDocument()

    // The gallery draws the owners the routes draw (GAL-02, GAL-06).
    const scenes = readFileSync(resolve(ROOT, 'src/dev/gallery-refinement-scenes.tsx'), 'utf8')
    expect(scenes).toMatch(/from '\.\.\/ui\/refinements\/equipment-assets'/)
    expect(scenes).toMatch(/import \{ ReviewContextCards, WorkoutContextCards \} from '\.\/gallery-refinement-cards'/)
    expect(scenes).toMatch(/<SetupStepView step="location"/)
    expect(scenes).toMatch(/<EquipmentSummary equipment=/)
  })
})
