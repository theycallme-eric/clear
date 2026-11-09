/**
 * TASK-001 (REQ-001; C01, C02, C04; JOURNEY-001) — the shared movement
 * hierarchy and peer grouping, through the consumers the routes render.
 *
 * Review is the actual `/review` route (router, guard, handoff and briefing);
 * Workout is the actual `/workout` route the Start handoff navigates to, with
 * the same composition persisted and started through the session client seam.
 * The shared stylesheet is applied to the document so the separator and rail
 * contract is read from the declared cascade, not from inline styles. Browser
 * geometry on phone, tablet and desktop is `e2e/refinement/task-001.spec.ts`.
 *
 * Synthetic data only: in-memory doubles, no account and no network.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, it } from 'vitest'

import { routes } from '../app/router'
import { REVIEW_PATH } from '../app/ReviewRoute'
import { reviewHandoff } from '../state/review-handoff'
import { ok, type Result } from '../state/errors'
import type { SessionAcceptance, SessionSnapshot } from '../state/schemas'
import { GalleryRefinements } from '../dev/gallery-refinements'
import {
  peerGroupingAcceptance,
  SUPERSET_BLOCK,
  TEN_STATION_CIRCUIT_BLOCK,
} from '../dev/gallery-refinement-cards-data'
import { anchorRow, evidenceRows } from '../test/load-suggestion-fixtures'
import { peerGroupingSnapshot } from '../test/peer-grouping-fixture'
import { AppProviders, signedIn } from '../test/render'
import { createWorkoutDouble } from '../test/workout-double'
import { FIXTURE_USER_ID } from '../test/user-data-double'

const ROOT = resolve(import.meta.dirname, '../..')

beforeAll(() => {
  // The shared owner's stylesheet, as the browser receives it. jsdom reports
  // each declared value, so the peer/rail contract is the cascade's.
  for (const file of ['src/ui/refinements/tokens.css', 'src/ui/refinements/presentation.css']) {
    const style = document.createElement('style')
    style.dataset.task001 = file
    style.textContent = readFileSync(resolve(ROOT, file), 'utf8')
    document.head.append(style)
  }
})

const LIST_NAMES = {
  review: { standard: 'Movements in this block', superset: 'superset, 3 rounds', circuit: 'circuit, 2 rounds' },
  workout: { standard: 'Movements in this block', superset: 'Movements in this superset', circuit: 'Movements in this circuit' },
} as const

type Context = keyof typeof LIST_NAMES
type Structure = keyof (typeof LIST_NAMES)['review']

function declared(element: Element, property: string): string {
  return getComputedStyle(element).getPropertyValue(property).trim()
}

const DRAWN = /\b(solid|dashed|dotted|double|groove|ridge|inset|outset)\b/

/** No inline-start rail on this element, from the cascade or inline. */
function expectNoRail(element: HTMLElement) {
  for (const property of ['border-inline-start', 'border-inline-start-style', 'border-left', 'border-left-style']) {
    expect(declared(element, property), property).not.toMatch(DRAWN)
    expect(element.style.getPropertyValue(property), property).toBe('')
  }
}

/**
 * C04: a separator after every peer but the last, none after the last, and no
 * rail on the list, its items or the group that holds it.
 */
function expectPeerSeparators(list: HTMLElement) {
  expect(list).toHaveClass('clr-movement-list')
  const items = [...list.children] as HTMLElement[]
  items.forEach((item, index) => {
    expect(item.tagName).toBe('LI')
    const rule = declared(item, 'border-block-end')
    if (index < items.length - 1) {
      expect(rule).toBe('var(--border-width) solid var(--border-region-rule)')
    } else {
      expect(rule).toBe('')
      expect(item.style.borderBlockEnd).toBe('')
      expect(item.style.borderBottom).toBe('')
    }
    expectNoRail(item)
  })
  expectNoRail(list)
  expectNoRail(list.parentElement as HTMLElement)
  expect(declared(list, 'gap')).toBe('var(--movement-peer-gap)')
}

/** The movement identities a list holds, in order. */
function identities(list: HTMLElement): HTMLElement[] {
  return [...list.querySelectorAll<HTMLElement>(':scope > li [data-movement-identity]')]
}

/**
 * C01: the prominent name (with its equipment beside it) in its own column,
 * the readable prescription with its load in the next row, and an action or
 * progress slot that is a sibling of the name column, never inside it.
 */
function expectHierarchy(identity: HTMLElement, context: Context) {
  const nameRow = identity.querySelector<HTMLElement>(':scope > [data-movement-name-row]')!
  const [column, ...slots] = [...nameRow.children] as HTMLElement[]
  expect(column).toHaveClass('clr-movement-identity__title')
  const name = column.querySelector('.clr-movement-identity__name')!
  expect(name).toBeTruthy()
  expect(declared(name, 'font-size')).toBe('var(--heading-h5-size)')
  expect(declared(name, 'font-weight')).toBe('var(--font-weight-bold)')
  expect(declared(name, 'color')).toBe('var(--ink)')
  const equipment = column.querySelector('[data-movement-context]')!
  expect(equipment).toHaveClass('clr-movement-identity__equipment')
  expect(declared(equipment, 'color')).toBe('var(--text-secondary)')
  expect(declared(equipment, 'font-size')).toBe('var(--label-xs-size)')
  expect(declared(column, 'overflow-wrap')).toBe('anywhere')
  expect(declared(column, 'min-width')).toMatch(/^0(px)?$/)

  const prescription = identity.querySelector<HTMLElement>(':scope > [data-movement-detail]')!
  expect(prescription).toBeTruthy()
  expect(declared(prescription, 'font-size')).toBe('var(--label-md-size)')
  expect(nameRow.compareDocumentPosition(prescription) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

  if (context === 'review') {
    expect(slots.map((slot) => slot.className)).toEqual(['clr-movement-identity__action'])
    expect(within(slots[0]).getByRole('button', { name: /^Swap / })).toBeInTheDocument()
    expect(within(identity).queryByText(/^(Extra set|Set \d)/)).toBeNull()
  } else {
    expect(slots.map((slot) => slot.className)).toEqual(['clr-movement-identity__counter'])
    expect(slots[0]).toHaveTextContent(/^Set 1\/\d+$/)
    expect(within(identity).queryByRole('button', { name: /^Swap / })).toBeNull()
  }
}

/** What each movement reads, so both contexts can be compared. */
function readings(list: HTMLElement) {
  return identities(list).map((identity) => ({
    name: identity.querySelector('[data-movement-name]')!.textContent,
    equipment: identity.querySelector('[data-movement-context]')!.textContent,
    load: identity.querySelector('[data-movement-load]')?.textContent ?? null,
  }))
}

/** The prescribed readings every peer must show in both contexts. */
const EXPECTED: Readonly<Record<Structure, ReturnType<typeof readings>>> = {
  standard: [
    { name: 'back squat', equipment: 'barbell', load: '100 kg' },
    { name: 'romanian deadlift', equipment: 'barbell', load: '70 kg' },
  ],
  superset: [
    { name: 'single arm kettlebell overhead reverse lunge to knee drive', equipment: 'kettlebell', load: '16 kg' },
    // Bodyweight inside a round is said once, by the equipment (G02).
    { name: 'push up', equipment: 'bodyweight', load: null },
  ],
  circuit: [
    { name: 'kb swing', equipment: 'kettlebell', load: '24 kg' },
    { name: 'mountain climber', equipment: 'bodyweight', load: null },
    { name: 'plank', equipment: 'bodyweight', load: null },
  ],
}

const LAST_PERFORMANCE = /\bLast\b\s*(:|session|time|performed|performance)/i

function journeyDouble(acceptance: SessionAcceptance, { anchors = false } = {}) {
  const startedAt = new Date(Date.now() - 60_000).toISOString()
  const prescribed = peerGroupingSnapshot(acceptance, { userId: FIXTURE_USER_ID })
  const running = peerGroupingSnapshot(acceptance, { userId: FIXTURE_USER_ID, startedAt })
  const calls = { accepted: [] as SessionAcceptance[], started: [] as string[] }
  let started = false
  const double = createWorkoutDouble({
    session: null,
    anchorRows: anchors ? [anchorRow()] : [],
    anchorEvidence: anchors ? evidenceRows() : [],
    sessions: {
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
    },
  })
  return { double, calls }
}

/** JOURNEY-001's entry: the real router at `/review`, handed this composition. */
async function openReview(acceptance: SessionAcceptance, options: { anchors?: boolean } = {}) {
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
  return { router, calls }
}

/** The action: Start, then the `/workout` route the handoff lands on. */
async function startWorkout(router: ReturnType<typeof createMemoryRouter>) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Start workout' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/workout'))
  await screen.findByRole('list', { name: LIST_NAMES.workout.superset })
}

function list(context: Context, structure: Structure): HTMLElement {
  return screen.getByRole('list', { name: LIST_NAMES[context][structure] })
}

const STRUCTURES: readonly Structure[] = ['standard', 'superset', 'circuit']

describe('TASK-001 shared movement hierarchy and peer grouping', () => {
  it('AC-C01-01 Review and Workout lead with the prominent name, readable prescription and load, quiet equipment and their own action or progress slot', async () => {
    const { router } = await openReview(peerGroupingAcceptance())
    for (const structure of STRUCTURES) {
      for (const identity of identities(list('review', structure))) expectHierarchy(identity, 'review')
    }

    await startWorkout(router)
    for (const structure of STRUCTURES.filter((name) => name !== 'circuit')) {
      for (const identity of identities(list('workout', structure))) expectHierarchy(identity, 'workout')
    }
    // A closed circuit row carries no set counter; its own entry action stays
    // below the readings rather than in the name row.
    for (const identity of identities(list('workout', 'circuit'))) {
      const nameRow = identity.querySelector(':scope > [data-movement-name-row]')!
      expect(nameRow.children).toHaveLength(1)
      expect(within(identity).getByRole('button', { name: /^Rest for / })).toBeInTheDocument()
    }
  })

  it('AC-C02-01 shows no Last-performance row in either context while the prescribed load stays visible', async () => {
    const { router } = await openReview(peerGroupingAcceptance())
    const review = STRUCTURES.map((structure) => readings(list('review', structure)))
    for (const structure of STRUCTURES) {
      expect(list('review', structure).textContent).not.toMatch(LAST_PERFORMANCE)
    }
    expect(screen.getByRole('main').textContent).not.toMatch(LAST_PERFORMANCE)

    await startWorkout(router)
    const workout = STRUCTURES.map((structure) => readings(list('workout', structure)))
    for (const structure of STRUCTURES) {
      expect(list('workout', structure).textContent).not.toMatch(LAST_PERFORMANCE)
    }
    expect(screen.getByRole('main').textContent).not.toMatch(LAST_PERFORMANCE)
    // The prescribed load is the same reading in both contexts.
    expect(review).toEqual(STRUCTURES.map((structure) => EXPECTED[structure]))
    expect(workout).toEqual(review)
  })

  it('AC-C04-01 separates peers only between two movements, never after the last, with no inner grouping rail', async () => {
    const { router } = await openReview(peerGroupingAcceptance())
    for (const structure of STRUCTURES) expectPeerSeparators(list('review', structure))
    // Review's grouped blocks: the group container draws no frame of its own.
    for (const group of document.querySelectorAll<HTMLElement>('[data-review-block]')) expectNoRail(group)

    await startWorkout(router)
    for (const structure of STRUCTURES) expectPeerSeparators(list('workout', structure))
    for (const header of document.querySelectorAll<HTMLElement>('[data-movement-group-header]')) {
      expectNoRail(header)
      expect(declared(header, 'border-block-end')).toBe('')
    }
  })

  it('AC-R001-01 standard, superset and circuit cards keep peer-only separators in both contexts and retain history data', async () => {
    // Anchored history for the back squat: the Review suggestion read from it
    // still renders, so removing the Last-performance row removed no data.
    const { router, calls } = await openReview(peerGroupingAcceptance(), { anchors: true })
    for (const structure of STRUCTURES) {
      const peers = list('review', structure)
      expect(identities(peers)).toHaveLength(EXPECTED[structure].length)
      expectPeerSeparators(peers)
    }
    const [squat] = identities(list('review', 'standard'))
    expect(await within(squat).findByRole('button', { name: /^Suggested/ })).toBeInTheDocument()
    expect(within(squat).getByText('100 kg')).toBeInTheDocument()

    await startWorkout(router)
    // Start persisted the composition as given: no load was replaced by history.
    expect(calls.accepted).toHaveLength(1)
    expect(calls.accepted[0].workout.sections[0].blocks[0].exercises[0]).toMatchObject({
      exercise_id: 'back-squat', load_type: 'absolute', load_value: 100,
    })
    for (const structure of STRUCTURES) {
      const peers = list('workout', structure)
      expect(identities(peers)).toHaveLength(EXPECTED[structure].length)
      expectPeerSeparators(peers)
      expect(readings(peers)).toEqual(EXPECTED[structure])
    }
  })

  it('AC-R001-02 long names and multi-digit ordinals wrap inside the name column without covering the action or progress slot', async () => {
    const acceptance = peerGroupingAcceptance({ blocks: [SUPERSET_BLOCK, TEN_STATION_CIRCUIT_BLOCK] })
    const { router } = await openReview(acceptance)

    const ten = identities(screen.getByRole('list', { name: 'circuit, 2 rounds' }))
    expect(ten).toHaveLength(10)
    const last = ten[9]
    expect(last.querySelector('[data-movement-ordinal]')).toHaveTextContent(/^10$/)
    for (const identity of [...ten, ...identities(list('review', 'superset'))]) {
      const nameRow = identity.querySelector<HTMLElement>(':scope > [data-movement-name-row]')!
      const column = nameRow.querySelector<HTMLElement>('.clr-movement-identity__title')!
      // Ordinal and name share the wrapping column; the action is its sibling.
      expect(column).toContainElement(identity.querySelector('[data-movement-ordinal]'))
      expect(column).toContainElement(identity.querySelector('[data-movement-name]'))
      const action = nameRow.querySelector<HTMLElement>('.clr-movement-identity__action')!
      expect(column).not.toContainElement(action)
      expect(declared(nameRow, 'display')).toBe('flex')
      expect(declared(column, 'flex-grow')).toBe('1')
      expect(declared(column, 'flex-basis')).toBe('0%')
      expect(declared(column, 'overflow-wrap')).toBe('anywhere')
      expect(declared(action, 'max-width')).toBe('45%')
      expectNoRail(nameRow)
    }

    await startWorkout(router)
    const live = identities(screen.getByRole('list', { name: LIST_NAMES.workout.circuit }))
    expect(live).toHaveLength(10)
    expect(live[9].querySelector('[data-movement-ordinal]')).toHaveTextContent(/^10\.$/)
    for (const identity of identities(list('workout', 'superset'))) {
      const nameRow = identity.querySelector<HTMLElement>(':scope > [data-movement-name-row]')!
      const column = nameRow.querySelector<HTMLElement>('.clr-movement-identity__title')!
      const counter = nameRow.querySelector<HTMLElement>('.clr-movement-identity__counter')!
      expect(column).not.toContainElement(counter)
      expect(declared(counter, 'flex-shrink')).toBe('0')
      expect(declared(counter, 'flex-grow')).toBe('0')
    }
    // Neither header nor surrounding group layout draws a rail.
    for (const header of document.querySelectorAll<HTMLElement>('[data-movement-group-header]')) expectNoRail(header)
  })

  it('JOURNEY-001 opens Review, starts that same workout and shows the same hierarchy on Workout', async () => {
    const { router, calls } = await openReview(peerGroupingAcceptance())
    const before = STRUCTURES.map((structure) => readings(list('review', structure)))
    await startWorkout(router)
    expect(calls.started).toHaveLength(1)
    expect(STRUCTURES.map((structure) => readings(list('workout', structure)))).toEqual(before)
    expect(screen.queryByRole('button', { name: /^Swap / })).toBeNull()
  })

  it('renders the accepted gallery state cards through the Review and Workout consumers', () => {
    render(
      <MemoryRouter initialEntries={['/gallery/refinements?state=cards']}>
        <GalleryRefinements />
      </MemoryRouter>,
    )
    const state = document.querySelector<HTMLElement>('[data-refinement-state="cards"]')!
    expect(state).toBeTruthy()
    for (const context of ['review', 'workout'] as const) {
      const scope = within(state.querySelector<HTMLElement>(`[data-gallery-context="${context}"]`)!)
      for (const structure of STRUCTURES) {
        const peers = scope.getByRole('list', { name: LIST_NAMES[context][structure] })
        expectPeerSeparators(peers)
        expect(readings(peers)).toEqual(EXPECTED[structure])
      }
    }
  })
})
