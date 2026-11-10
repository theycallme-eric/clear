/**
 * TASK-004 (REQ-004; C12, C13, C14, C15; AC-R004-01…03; JOURNEY-004) —
 * accepted Overview facts, the Required equipment group and the Summary
 * frames, through the shared owners (`SummaryFacts`, `OverviewFacts`,
 * `EquipmentSummary`, `SummaryMetric` in a `MetricGrid`) and the consumers the
 * routes render.
 *
 * Each route is the real one behind the real auth guard: `/review` handed a
 * composed workout through the existing Review hand-off, `/history/:id` read
 * through the session client's `asPerformed`, and `/summary` through the
 * summary client's completed session and streak. The shared stylesheets are
 * applied to the document, so each declared layout contract is read from the
 * cascade. Rendered geometry (wrapping rows, equal bottom edges) is proved in
 * the browser by `e2e/refinement/task-004.spec.ts`.
 *
 * Synthetic data only (`src/dev/gallery-refinement-overview-data.ts`):
 * in-memory doubles, no account and no network.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, it } from 'vitest'

import type { CompletedSession } from '../data/summary'
import type { SessionsClient } from '../data/sessions'
import { routes } from '../app/router'
import { REVIEW_PATH } from '../app/ReviewRoute'
import { SESSION_DETAIL_ERROR_TITLE, SESSION_DETAIL_FACTS_LABEL } from '../app/SessionDetail'
import { STREAK_EMPTY, STREAK_THROUGH_YESTERDAY } from '../app/Summary'
import {
  OVERVIEW_PLANNED,
  overviewAcceptance,
  savedOverviewRecord,
  savedSessionRow,
  SAVED_DEFAULTS,
  type OverviewComposition,
  type SavedOverviewOptions,
} from '../dev/gallery-refinement-overview-data'
import { GalleryRefinements } from '../dev/gallery-refinements'
import { createError, err, ErrorCode, ok, type Result } from '../state/errors'
import { formatDay } from '../state/history'
import { briefingIntensity } from '../state/review'
import { reviewHandoff } from '../state/review-handoff'
import type { SessionAcceptance, SessionReconstruction } from '../state/schemas'
import type { Streak } from '../state/streak'
import { AppProviders, renderApp, renderWithProviders, signedIn } from '../test/render'
import { createFakeRestDayClient } from '../test/rest-day-double'
import { createFakeSummaryClient, fixtureStreak } from '../test/summary-double'
import { createWorkoutDouble } from '../test/workout-double'
import { EQUIPMENT_LABEL, NO_EQUIPMENT_LABEL } from './refinements/overview'

const ROOT = resolve(import.meta.dirname, '../..')
const FACTS_LABEL = 'Workout facts'

beforeAll(() => {
  // The shared owners' stylesheets as the browser receives them: the facts row
  // and metric grid (shell.css), the echoed cell's pass-through, the shared
  // text role, and the refinement recipes. jsdom reports declared values.
  for (const file of [
    'src/styles/shell.css',
    'src/ui/foreground-echo.css',
    'src/styles/text-roles.css',
    'src/ui/refinements/tokens.css',
    'src/ui/refinements/presentation.css',
  ]) {
    const style = document.createElement('style')
    style.dataset.task004 = file
    style.textContent = readFileSync(resolve(ROOT, file), 'utf8')
    document.head.append(style)
  }
})

function declared(element: Element, property: string): string {
  return getComputedStyle(element).getPropertyValue(property).trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// The routes
// ─────────────────────────────────────────────────────────────────────────────

/** JOURNEY-004's planned entry: the real router at `/review`, handed this composition. */
async function openReview(composition: OverviewComposition = 'loaded') {
  const acceptance = overviewAcceptance({ composition })
  const accepted: SessionAcceptance[] = []
  const sessions: Partial<SessionsClient> = {
    // Start's write is refused, so nothing is persisted and Review stays.
    async accept(_userId, payload) {
      accepted.push(payload)
      return err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))
    },
  }
  const double = createWorkoutDouble({ session: null, sessions })
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
  return { acceptance, accepted }
}

/** JOURNEY-004's saved entry: `/history/:id`, answered by `asPerformed`. */
async function openSaved(
  answer: SavedOverviewOptions | ((call: number) => Promise<Result<SessionReconstruction>>) = {},
) {
  const asked: string[] = []
  const sessions: Partial<SessionsClient> = {
    asPerformed: (sessionId) => {
      asked.push(sessionId)
      return typeof answer === 'function' ? answer(asked.length) : Promise.resolve(ok(savedOverviewRecord(answer)))
    },
  }
  const double = createWorkoutDouble({ session: null, sessions })
  renderApp([`/history/${SAVED_DEFAULTS.sessionId}`], signedIn({ workout: double.clients }))
  return { asked }
}

/** The completed Summary's pair: 42 measured minutes beside a two-day run through yesterday. */
const THROUGH_YESTERDAY: Streak = fixtureStreak({
  days: 2,
  trainingDays: ['2026-11-08', '2026-11-07'],
  today: '2026-11-09',
  includesToday: false,
  lastTrainingDay: '2026-11-08',
})

function completed(): CompletedSession {
  return { session: savedSessionRow(), durationMins: SAVED_DEFAULTS.actualDurationMins }
}

/** JOURNEY-004's completed entry: `/summary`, with the given streak read. */
function openSummary(streak: () => Promise<Result<Streak>> = async () => ok(THROUGH_YESTERDAY)) {
  const summary = createFakeSummaryClient({ latest: async () => ok(completed()), streak })
  const double = createWorkoutDouble({ session: null })
  const router = createMemoryRouter(routes, { initialEntries: ['/', '/summary'], initialIndex: 1 })
  render(
    <AppProviders {...signedIn({ summary, workout: double.clients, restDays: createFakeRestDayClient() })}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the screen
// ─────────────────────────────────────────────────────────────────────────────

function overviewCard(): HTMLElement {
  return screen.getByRole('heading', { level: 2, name: 'Overview' }).closest<HTMLElement>('.clr-card')!
}

function factsIn(scope: HTMLElement, label = FACTS_LABEL): HTMLElement {
  const facts = scope.querySelector<HTMLElement>(`dl[aria-label="${label}"]`)
  if (facts === null) throw new Error(`No facts list named ${label}`)
  return facts
}

interface Reading {
  term: string
  value: string
  termShown: boolean
  glyph: string | null
}

function readings(facts: HTMLElement): Reading[] {
  return [...facts.querySelectorAll<HTMLElement>(':scope > .clr-summary-fact')].map((fact) => {
    const term = fact.querySelector('dt')!
    const termText = term.lastElementChild as HTMLElement
    const glyph = term.querySelector('.clr-summary-fact__glyph')
    return {
      term: term.textContent ?? '',
      value: fact.querySelector('dd')?.textContent ?? '',
      termShown: !termText.classList.contains('a11y-hidden'),
      glyph: glyph === null ? null : glyph.innerHTML,
    }
  })
}

function precedes(a: Element, b: Element): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
}

/** No carousel: no rail, scroller, cue, control or tab stop in or around the facts. */
function expectNoCarousel(card: HTMLElement, facts: HTMLElement) {
  expect(facts.parentElement, 'the facts are the card body’s own content').toHaveClass('clr-card__body')
  expect(card.querySelectorAll('.clr-rail, .clr-rail__scroller, .clr-rail__cue, .clr-summary-facts-rail')).toHaveLength(0)
  expect(facts.querySelectorAll('button, a, input, [tabindex], [role="group"]')).toHaveLength(0)
  expect(facts).not.toHaveAttribute('tabindex')
  expect(declared(facts, 'display')).toBe('flex')
  expect(declared(facts, 'flex-wrap')).toBe('wrap')
  // Nothing hides or scrolls overflow: the browser proof measures the row.
  expect(['', 'visible']).toContain(declared(facts, 'overflow'))
  for (const fact of facts.querySelectorAll(':scope > .clr-summary-fact')) {
    // Each reading stays whole: it never shrinks and never leaves the row.
    expect(declared(fact, 'flex')).toMatch(/^(none|0 0 auto)$/)
    expect(declared(fact, 'max-width')).toBe('100%')
    expect(declared(fact.querySelector('dt')!, 'white-space')).toBe('nowrap')
  }
}

/**
 * A metric cell's bleed frame: the cell itself, or — with the foreground echo
 * on, as the routes render it — the echo wrapper's own (non-rear) child.
 */
function bleedOf(cell: Element): HTMLElement {
  const bleed = cell.matches('.clr-bleed--block')
    ? cell
    : cell.matches('.clr-echo') ? cell.querySelector(':scope > .clr-bleed--block') : null
  if (bleed === null) throw new Error(`A metric cell is neither a bleed frame nor its echo: ${cell.className}`)
  return bleed as HTMLElement
}

/** The cards that are metric cells' own frames, in cell order. */
function metricCards(grid: HTMLElement): HTMLElement[] {
  return [...grid.children].map((cell) => bleedOf(cell).querySelector<HTMLElement>(':scope > .clr-card')!)
}

/**
 * C15: the cell's bleed lays its one card out as a stretched grid item, so the
 * card fills the cell. The card itself is never restyled by app CSS.
 */
function expectCardFillsCell(card: HTMLElement, label: string) {
  const bleed = card.parentElement!
  expect(bleed, label).toHaveClass('clr-bleed--block')
  expect(declared(bleed, 'display'), label).toBe('grid')
  expect(bleed.children, label).toHaveLength(1)
  expect(declared(card, 'align-self'), label).toMatch(/^(|auto|normal|stretch)$/)
  expect(declared(card, 'height'), label).toMatch(/^(|auto)$/)
}

function equipmentNames(scope: HTMLElement): string[] {
  return within(scope).getAllByRole('listitem').map((item) => item.textContent ?? '')
}

// ─────────────────────────────────────────────────────────────────────────────

describe('TASK-004 accepted Overview facts, equipment and summary frames', () => {
  it('AC-C12-01 /review: every useful fact is a whole glyph-led reading in one wrapping description list, with no carousel, rail or tab stop', async () => {
    await openReview('loaded')
    const card = overviewCard()
    const facts = factsIn(card)
    expect(facts).toHaveClass('clr-summary-facts')
    expectNoCarousel(card, facts)

    const planned = OVERVIEW_PLANNED.loaded
    expect(readings(facts).map(({ term, value }) => [term, value])).toEqual([
      ['Duration', planned.duration],
      ['Anchor', planned.focus],
      ['Intensity', planned.intensity],
      ['Goal', planned.goal],
      ['Movements', planned.movements],
    ])
    // Every reading keeps its system glyph (the movement count's too, R33),
    // decorative to a reader; the term carries the meaning either way.
    for (const fact of facts.querySelectorAll(':scope > .clr-summary-fact')) {
      const glyph = fact.querySelector('dt > .clr-summary-fact__glyph')
      expect(glyph).toHaveAttribute('aria-hidden', 'true')
      expect(glyph?.querySelector('svg')).not.toBeNull()
      expect([...fact.children].map((child) => child.tagName)).toEqual(['DT', 'DD'])
    }
    // Self-describing readings keep their term for assistive technology only.
    expect(readings(facts).map(({ term, termShown }) => [term, termShown])).toEqual([
      ['Duration', false], ['Anchor', false], ['Intensity', true], ['Goal', true], ['Movements', true],
    ])
    cleanup()

    // The widest real facts: still every one, still whole readings.
    await openReview('widest')
    const widest = OVERVIEW_PLANNED.widest
    const wide = factsIn(overviewCard())
    expectNoCarousel(overviewCard(), wide)
    expect(readings(wide).map(({ value }) => value)).toEqual([
      widest.duration, widest.focus, widest.intensity, widest.goal, widest.movements,
    ])
  })

  it('AC-R004-01 /review: intensity reads its value without "of 10", on the unchanged ten-point scale Start persists', async () => {
    const user = userEvent.setup()
    const { acceptance, accepted } = await openReview('loaded')
    const card = overviewCard()
    const intensity = readings(factsIn(card)).find(({ term }) => term === 'Intensity')!
    expect(intensity).toMatchObject({ value: '7', termShown: true })
    expect(intensity.glyph).not.toBeNull()
    expect(card.textContent).not.toMatch(/of\s*10|\/\s*10/)

    // The scale is unchanged: the reading is the value itself at every step,
    // and Start persists the same effective intensity it was composed under.
    for (let value = 1; value <= 10; value += 1) expect(briefingIntensity(value)).toBe(String(value))
    await user.click(screen.getByRole('button', { name: 'Start workout' }))
    await screen.findByText('Couldn’t start this workout')
    expect(accepted).toHaveLength(1)
    expect(accepted[0].effective_intensity).toBe(acceptance.effective_intensity)
    expect(accepted[0].requested_intensity).toBe(acceptance.requested_intensity)
    // Recovery: the failed Start leaves the Overview exactly as planned.
    expect(readings(factsIn(overviewCard())).find(({ term }) => term === 'Intensity')?.value).toBe('7')
    cleanup()

    await openReview('widest')
    expect(readings(factsIn(overviewCard())).find(({ term }) => term === 'Intensity')?.value).toBe('10')
    expect(overviewCard().textContent).not.toMatch(/of\s*10|\/\s*10/)
  })

  it('AC-C13-01 /review: Required equipment is one group under a rule, with the glyph-led label and each actual name once as an uppercase element', async () => {
    await openReview('loaded')
    const card = overviewCard()
    const facts = factsIn(card)
    const group = card.querySelector<HTMLElement>('[data-equipment-summary]')!
    expect(group).not.toBeNull()
    expect(precedes(facts, group)).toBe(true)
    expect(group.parentElement).toHaveClass('clr-card__body')

    // The separator, and the group's own rhythm: one column under a rule.
    expect(declared(group, 'display')).toBe('flex')
    expect(declared(group, 'flex-direction')).toBe('column')
    expect(declared(group, 'border-block-start')).toBe('var(--border-width) solid var(--border-region-rule)')
    expect(declared(group, 'padding-block-start')).toBe('var(--spacing-300)')

    // The label: the facts' data-label face, uppercase, beside the one shipped
    // equipment glyph (never one glyph per kind of equipment).
    const label = group.querySelector<HTMLElement>('.clr-equipment-summary__label')!
    expect(label.textContent).toBe(EQUIPMENT_LABEL)
    expect(label).toHaveClass('clr-text-data-xs', 'clr-text-data-xs--upper')
    expect(declared(label, 'text-transform')).toBe('uppercase')
    expect(label.querySelectorAll('svg')).toHaveLength(1)
    expect(label.querySelector('.clr-equipment-summary__glyph')).toHaveAttribute('aria-hidden', 'true')

    // The names: the workout's own equipment, once each, in order of need, one
    // wrapping group of uppercase elements. Bodyweight is not equipment.
    const list = within(card).getByRole('list', { name: EQUIPMENT_LABEL })
    expect(equipmentNames(list)).toEqual([...OVERVIEW_PLANNED.loaded.equipment])
    expect(declared(list, 'flex-wrap')).toBe('wrap')
    for (const item of within(list).getAllByRole('listitem')) {
      expect(declared(item, 'text-transform')).toBe('uppercase')
      expect(item.querySelectorAll('svg')).toHaveLength(0)
    }
    expect(group.querySelectorAll('button, a, input, [tabindex], .clr-card, .clr-chamfer')).toHaveLength(0)
    expect(card.textContent).not.toContain(NO_EQUIPMENT_LABEL)
    // REQ-010 stays binding: the Overview is readings, never a paragraph.
    expect(card.querySelector('p')).toBeNull()
    // Before the first section and before Start (REQ-006).
    expect(precedes(group, screen.getAllByRole('heading', { level: 2 }).find((heading) => heading !== card.querySelector('h2'))!)).toBe(true)
  })

  it('AC-R004-02 None — bodyweight only appears for an all-bodyweight workout and never beside real equipment', async () => {
    await openReview('bodyweight')
    let group = overviewCard().querySelector<HTMLElement>('[data-equipment-summary]')!
    expect(within(group).getByText(NO_EQUIPMENT_LABEL)).toHaveAttribute('data-equipment-none')
    expect(within(group).queryByRole('list')).toBeNull()
    expect(group.querySelector('.clr-equipment-summary__label')?.textContent).toBe(EQUIPMENT_LABEL)
    expect(overviewCard().querySelector('p')).toBeNull()
    cleanup()

    await openReview('loaded')
    expect(overviewCard().textContent).not.toContain(NO_EQUIPMENT_LABEL)
    cleanup()

    // The saved Overview says it only of a record whose rows name no equipment.
    await openSaved({ composition: 'bodyweight' })
    await screen.findByRole('heading', { level: 1, name: savedSessionRow({ composition: 'bodyweight' }).title })
    group = overviewCard().querySelector<HTMLElement>('[data-equipment-summary]')!
    expect(within(group).getByText(NO_EQUIPMENT_LABEL)).toBeInTheDocument()
    expect(within(group).queryByRole('list')).toBeNull()
    cleanup()

    // One recorded row with equipment is enough to make it untrue.
    await openSaved({ composition: 'bodyweight', recordedEquipment: { 1: 'dumbbell' } })
    await screen.findByRole('heading', { level: 1, name: savedSessionRow({ composition: 'bodyweight' }).title })
    group = overviewCard().querySelector<HTMLElement>('[data-equipment-summary]')!
    expect(within(group).queryByText(NO_EQUIPMENT_LABEL)).toBeNull()
    expect(equipmentNames(within(group).getByRole('list', { name: EQUIPMENT_LABEL }))).toEqual(['dumbbell'])
  })

  it('AC-C14-01 /history/:id: the saved Overview draws the same fact composition and equipment group as Review', async () => {
    await openReview('loaded')
    const review = readings(factsIn(overviewCard()))
    const reviewGlyphs = new Map(review.map(({ term, glyph }) => [term === 'Anchor' ? 'Focus' : term, glyph]))
    cleanup()

    await openSaved()
    await screen.findByRole('heading', { level: 1, name: savedSessionRow().title })
    const card = overviewCard()
    const facts = factsIn(card, SESSION_DETAIL_FACTS_LABEL)
    // The same object Review draws, not a second version: the compact row,
    // bare inside the one card, no metric grid or framed readout.
    expect(facts).toHaveClass('clr-summary-facts')
    expect(facts).toHaveAttribute('data-overview-facts')
    expectNoCarousel(card, facts)
    expect(card.querySelectorAll('.clr-metric-grid, .clr-metric-frame')).toHaveLength(0)

    const saved = readings(facts)
    // The shared order: the readings the plan has, then the record's own.
    expect(saved.map(({ term }) => term)).toEqual(['Duration', 'Focus', 'Intensity', 'Date', 'Status'])
    // The shared readings wear the same glyph and the same term visibility.
    for (const term of ['Duration', 'Focus', 'Intensity']) {
      const reading = saved.find((candidate) => candidate.term === term)!
      expect(reading.glyph, term).toBe(reviewGlyphs.get(term))
      expect(reading.termShown, term).toBe(review.find((candidate) => (candidate.term === 'Anchor' ? 'Focus' : candidate.term) === term)!.termShown)
    }
    // The record's own: its day beside a calendar, its state named in words.
    expect(saved.find(({ term }) => term === 'Date')).toMatchObject({ termShown: false })
    expect(saved.find(({ term }) => term === 'Date')?.glyph).not.toBeNull()
    expect(saved.find(({ term }) => term === 'Status')).toMatchObject({ termShown: true, glyph: null })

    // The same Required equipment group, from the record's own rows.
    const group = card.querySelector<HTMLElement>('[data-equipment-summary]')!
    expect(precedes(facts, group)).toBe(true)
    expect(equipmentNames(within(group).getByRole('list', { name: EQUIPMENT_LABEL }))).toEqual([
      ...OVERVIEW_PLANNED.loaded.equipment,
    ])
    // Provenance and the debrief's answers stay in the card, below.
    expect(precedes(group, within(card).getByText(/^As performed/))).toBe(true)
  })

  it('AC-R004-03 /history/:id: saved facts are the record’s own values and meanings, never the planned request', async () => {
    await openSaved({
      date: '2026-11-08',
      actualDurationMins: 42,
      requestedIntensity: 9,
      effectiveIntensity: 6,
      // The recorded row says kettlebell where the plan said dumbbell.
      recordedEquipment: { 1: 'kettlebell' },
    })
    await screen.findByRole('heading', { level: 1, name: savedSessionRow().title })
    const card = overviewCard()
    expect(readings(factsIn(card, SESSION_DETAIL_FACTS_LABEL)).map(({ term, value }) => [term, value])).toEqual([
      // Measured minutes, not the 45-minute target the plan was composed to.
      ['Duration', '42 min'],
      ['Focus', 'Upper body'],
      // The recorded effective intensity, not the requested 9, on the same scale.
      ['Intensity', '6'],
      ['Date', formatDay('2026-11-08')],
      ['Status', 'Completed'],
    ])
    expect(card.textContent).not.toMatch(/of\s*10|\/\s*10/)
    expect(equipmentNames(within(card).getByRole('list', { name: EQUIPMENT_LABEL }))).toEqual(['barbell', 'kettlebell'])
    cleanup()

    // Nothing measured: the composed length, as the record's duration rule says.
    await openSaved({ actualDurationMins: null, computedDurationMins: 40 })
    await screen.findByRole('heading', { level: 1, name: savedSessionRow().title })
    expect(readings(factsIn(overviewCard(), SESSION_DETAIL_FACTS_LABEL)).find(({ term }) => term === 'Duration')?.value).toBe('40 min')
    cleanup()

    // Neither: no duration at all — absent stays absent, never `0 min`.
    await openSaved({ actualDurationMins: null, computedDurationMins: null })
    await screen.findByRole('heading', { level: 1, name: savedSessionRow().title })
    expect(readings(factsIn(overviewCard(), SESSION_DETAIL_FACTS_LABEL)).map(({ term }) => term)).toEqual([
      'Focus', 'Intensity', 'Date', 'Status',
    ])
  })

  it('AC-C15-01 /summary: Duration and Streak are each the one frame of an equal-height metric cell and fill it', async () => {
    openSummary()
    await screen.findByText('2 days')
    const grid = document.querySelector<HTMLElement>('main .clr-metric-grid')!
    const cells = [...grid.children] as HTMLElement[]
    expect(cells).toHaveLength(2)
    expect(declared(grid, 'display')).toBe('grid')

    for (const [index, label] of ['Duration', 'Streak'].entries()) {
      const cell = cells[index]
      // The cell is the card's own bleed frame (inside its echo wrapper when
      // the effect is on); the card is its one frame.
      const bleed = bleedOf(cell)
      expect(bleed).toHaveClass('clr-bleed', 'clr-bleed--block')
      const cardsInCell = bleed.querySelectorAll(':scope > .clr-card')
      expect(cardsInCell, label).toHaveLength(1)
      const card = cardsInCell[0] as HTMLElement
      expect(within(card).getByRole('heading', { name: label })).toBeInTheDocument()
      // C15: the card fills its cell, so its bottom edge is the cell's.
      expectCardFillsCell(card, label)
      // No short nested frame: one chamfered body, and the readout inside it
      // is unframed (a bare MetricFrame, never a second chamfer or card).
      expect(card.querySelectorAll('.clr-chamfer'), label).toHaveLength(1)
      expect(card.querySelector(':scope > .clr-card__body')).toHaveClass('clr-chamfer')
      expect(card.querySelectorAll('.clr-card__body .clr-chamfer, .clr-card .clr-card'), label).toHaveLength(0)
      expect(card.querySelector('.clr-metric-frame')).not.toHaveClass('clr-chamfer')
    }
    // V12's case: Duration's content is the shorter of the two.
    expect(within(cells[0]).getByText('42 min')).toHaveAttribute('data-metric-value')
    expect(within(cells[0]).queryByText(STREAK_THROUGH_YESTERDAY)).toBeNull()
    expect(within(cells[1]).getByText('2 days')).toHaveAttribute('data-metric-value')
    expect(within(cells[1]).getByText(STREAK_THROUGH_YESTERDAY)).toBeInTheDocument()

    // Both shapes of a cell carry the fill: the bleed as the cell, and — with
    // the foreground echo on — the bleed inside the echo wrapper that is the
    // cell (foreground-echo.css), so the effect never shortens a frame.
    for (const markup of [
      '<div class="clr-bleed clr-bleed--block"><div class="clr-card"></div></div>',
      '<div class="clr-echo"><div class="clr-bleed clr-bleed--block"><div class="clr-card"></div></div></div>',
    ]) {
      const probe = document.createElement('div')
      probe.className = 'clr-metric-grid'
      probe.innerHTML = markup
      document.body.append(probe)
      expectCardFillsCell(probe.querySelector<HTMLElement>('.clr-card')!, markup)
      probe.remove()
    }
  })

  it('AC-C15-01 /summary recovery: a loading, failed or empty streak keeps its card filling the cell beside the recorded duration', async () => {
    const user = userEvent.setup()
    let calls = 0
    openSummary(async () => {
      calls += 1
      return calls === 1 ? err(createError(ErrorCode.PERSISTENCE_READ_FAILED)) : ok(THROUGH_YESTERDAY)
    })
    await screen.findByText('Your streak didn’t load')
    const grid = () => document.querySelector<HTMLElement>('main .clr-metric-grid')!
    const cards = () => metricCards(grid())
    expect(cards()).toHaveLength(2)
    for (const card of cards()) expectCardFillsCell(card, 'streak failure')
    // The failure is the streak's alone: the recorded duration stands.
    expect(within(cards()[0]).getByText('42 min')).toBeInTheDocument()
    await user.click(within(cards()[1]).getByRole('button', { name: 'Retry' }))
    await screen.findByText('2 days')
    expect(cards()).toHaveLength(2)
    for (const card of cards()) expectCardFillsCell(card, 'after retry')
    cleanup()

    // Loading holds the same card in the same cell.
    openSummary(() => new Promise<never>(() => {}))
    await screen.findByText('42 min')
    expect(cards()).toHaveLength(2)
    expect(within(cards()[1]).getByRole('heading', { name: 'Streak' })).toBeInTheDocument()
    for (const card of cards()) expectCardFillsCell(card, 'streak loading')
    cleanup()

    // An empty streak says so in its card, which still fills the cell.
    openSummary(async () => ok(fixtureStreak({ days: 0, trainingDays: [], includesToday: false, lastTrainingDay: null })))
    await screen.findByText(STREAK_EMPTY)
    expect(cards()).toHaveLength(2)
    for (const card of cards()) expectCardFillsCell(card, 'streak empty')
  })

  it('JOURNEY-004 recovery: a failed saved read keeps its error and retry, and shows no invented facts', async () => {
    const user = userEvent.setup()
    await openSaved(async (call) =>
      call === 1 ? err(createError(ErrorCode.PERSISTENCE_READ_FAILED)) : ok(savedOverviewRecord()))
    await screen.findByText(SESSION_DETAIL_ERROR_TITLE)
    expect(document.querySelector('dl.clr-summary-facts')).toBeNull()
    expect(document.querySelector('[data-equipment-summary]')).toBeNull()
    expect(screen.queryByText(NO_EQUIPMENT_LABEL)).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByRole('heading', { level: 1, name: savedSessionRow().title })
    await waitFor(() => expect(document.querySelector('dl.clr-summary-facts')).not.toBeNull())
    expect(readings(factsIn(overviewCard(), SESSION_DETAIL_FACTS_LABEL)).find(({ term }) => term === 'Duration')?.value).toBe('42 min')
  })

  it('JOURNEY-004 gallery overview: the accepted state draws the Review, Session Detail and Summary consumers', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GalleryRefinements />, { route: '/gallery/refinements?state=overview' })
    const state = document.querySelector<HTMLElement>('[data-refinement-state="overview"]')!
    expect(state).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Overview and Summary frames' })).toHaveAttribute('aria-current', 'page')

    // Planned: Review's own Overview card.
    const planned = within(state).getByRole('heading', { name: 'Overview' }).closest<HTMLElement>('.clr-card')!
    expect(readings(factsIn(planned)).map(({ term, value }) => [term, value])).toEqual([
      ['Duration', '45 min'], ['Anchor', 'Upper body'], ['Intensity', '7'], ['Goal', 'Strength'], ['Movements', '6'],
    ])
    expect(equipmentNames(within(planned).getByRole('list', { name: EQUIPMENT_LABEL }))).toEqual([
      ...OVERVIEW_PLANNED.loaded.equipment,
    ])

    // Saved: Session Detail's own Overview card, the record's values.
    await user.click(within(state).getByRole('radio', { name: /Saved workout/ }))
    const saved = within(state).getByRole('heading', { name: 'Overview' }).closest<HTMLElement>('.clr-card')!
    expect(readings(factsIn(saved, SESSION_DETAIL_FACTS_LABEL)).map(({ term }) => term)).toEqual([
      'Duration', 'Focus', 'Intensity', 'Date', 'Status',
    ])
    expect(readings(factsIn(saved, SESSION_DETAIL_FACTS_LABEL))[0].value).toBe('42 min')

    // Bodyweight only: said in both contexts, and only there.
    await user.click(within(state).getByRole('radio', { name: /Bodyweight only/ }))
    expect(within(state).getByText(NO_EQUIPMENT_LABEL)).toBeInTheDocument()
    await user.click(within(state).getByRole('radio', { name: /Planned workout/ }))
    expect(within(state).getByText(NO_EQUIPMENT_LABEL)).toBeInTheDocument()
    await user.click(within(state).getByRole('radio', { name: /Loaded/ }))
    expect(within(state).queryByText(NO_EQUIPMENT_LABEL)).toBeNull()

    // Summary frames: the completed Summary's own pair in its metric row.
    const grid = state.querySelector<HTMLElement>('[data-gallery-summary-metrics]')!
    expect(grid).toHaveClass('clr-metric-grid')
    const cards = [...grid.querySelectorAll<HTMLElement>(':scope > .clr-bleed--block > .clr-card')]
    expect(cards.map((card) => card.querySelector('[data-metric-value]')?.textContent)).toEqual(['42 min', '2 days'])
    expect(within(cards[1]).getByText(STREAK_THROUGH_YESTERDAY)).toBeInTheDocument()
    for (const card of cards) expectCardFillsCell(card, 'gallery')
  })
})
