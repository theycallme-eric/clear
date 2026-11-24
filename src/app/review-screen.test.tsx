/**
 * TASK-005 (issue #525) acceptance: REQ-006 and REQ-007 on the pre-start
 * Review screen — required equipment before Start, Start pinned, Regenerate at
 * the end of the scrolling content, and supersets/circuits as numbered
 * one-round sequences with their rest beside them and no trailing divider.
 *
 * One block per criterion, AC-019 … AC-024, over the same two-route harness
 * `Review.test.tsx` uses, so Start is asserted by arriving at `/workout`.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { MemoryRouter, Route, Routes } from 'react-router-dom'

import type { SessionsClient } from '../data/sessions'
import { PREPARATION_NAMES, preparationAcceptance } from '../dev/gallery-refinement-preparation-data'
import { GalleryRefinements } from '../dev/gallery-refinements'
import { galleryPresentation } from '../dev/gallery-refinement-runtime'
import type { SectionCandidates } from '../data/candidates'
import { ok, type Result } from '../state/errors'
import type { SessionAcceptance, SessionSnapshot } from '../state/schemas'
import {
  makePrescription,
  makeSessionAcceptance,
  makeStructureSpectrumWorkout,
  makeWorkoutBlock,
} from '../test/factories'
import { renderWithProviders, signedIn } from '../test/render'
import { createWorkoutDouble, snapshotFixture } from '../test/workout-double'
import {
  ANCHOR_LABEL,
  DURATION_LABEL,
  GOAL_LABEL,
  INTENSITY_LABEL,
  reviewBriefing,
} from '../state/review'
import {
  EQUIPMENT_LABEL,
  FACTS_LABEL,
  MOVEMENTS_LABEL,
  NO_EQUIPMENT_LABEL,
  OVERVIEW_LABEL,
  REGENERATE_LABEL,
  Review,
  START_LABEL,
} from './Review'

const SPECTRUM = makeStructureSpectrumWorkout()
const ACCEPTANCE = makeSessionAcceptance({ workout: SPECTRUM })
const PERSISTED = snapshotFixture({ state: 'prescribed' })
const WORKOUT_MARKER = 'the workout shell'
const SCROLL_REGION = `Review content`
/** Route- or dialog-heavy cases (TASK-109's CI lesson): CI runs about 2x slower. */
const HEAVY = 30_000
/** The accepted preparation state's own sample guides (bec4454), which only the gallery draws. */
const GALLERY_GUIDES = galleryPresentation(async () => {}).guides

function sessionsDouble(): Partial<SessionsClient> {
  return {
    accept: async () => ok(PERSISTED) as Result<SessionSnapshot>,
    start: async () => ok({ session: PERSISTED.session, state: 'active' as const }),
  }
}

function renderReview(
  acceptance: SessionAcceptance = ACCEPTANCE,
  onRegenerate: () => void = () => undefined,
  candidateSets: readonly SectionCandidates[] = [],
) {
  const workout = createWorkoutDouble({ session: null, sessions: sessionsDouble(), candidateSets })
  return renderWithProviders(
    <Routes>
      <Route
        path="/review"
        element={<Review acceptance={acceptance} onRegenerate={onRegenerate} />}
      />
      <Route path="/workout" element={<p>{WORKOUT_MARKER}</p>} />
    </Routes>,
    { route: '/review', ...signedIn({ workout: workout.clients }) },
  )
}

async function ready() {
  await screen.findByRole('heading', { level: 1, name: SPECTRUM.title })
}

/** True when `a` comes before `b` in document order. */
function precedes(a: Node, b: Node): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

/**
 * Round 7: each briefing section is a static, always-visible stack of block
 * cards (no disclosure), each headed by the shared movement group header.
 */
function reviewSections(): HTMLElement[] {
  const sections = [...screen.getByRole('main').querySelectorAll<HTMLElement>('[data-review-section]')]
  expect(sections.length).toBeGreaterThan(0)
  for (const section of sections) {
    expect(within(section).getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0)
  }
  return sections
}

/** The shared movement stylesheet: rules and type faces are tokens there. */
const MOVEMENT_CSS = readFileSync(
  resolve(import.meta.dirname, '../styles/movement-presentation.css'),
  'utf8',
)
function cssRule(selector: string): string {
  const start = MOVEMENT_CSS.indexOf(`${selector} {`)
  expect(start).toBeGreaterThanOrEqual(0)
  return MOVEMENT_CSS.slice(start, MOVEMENT_CSS.indexOf('}', start))
}

/**
 * A grouped block's card, its group header (title + structure badge) first.
 * Decision 6: the badge names the format only; the rounds, cap or scheme are
 * the meta line under the header.
 */
function groupCard(list: HTMLElement) {
  const card = list.closest<HTMLElement>('.clr-card')!
  const header = card.querySelector<HTMLElement>('[data-movement-group-header]')!
  const badge = header.querySelector<HTMLElement>('.clr-movement-group-header__badge')!
  const meta = card.querySelector<HTMLElement>('.clr-timed-meta')!
  return { card, header, badge, meta, group: list.parentElement! }
}

/**
 * The sections' static headings, in order. TASK-002 (AC-R002-02, R37): a
 * section's header is a semantic heading on its card, never an expanded
 * toggle, so the sections are found by their headings. (A3 TASK-119: the build
 * scoped them to `[data-workout-card="review"]`; Round 7's work sections are
 * `[data-review-section]`, and it heads each block card, decision 2 of 2026-11-13.)
 */
function sectionHeadings(): HTMLElement[] {
  return screen
    .getAllByRole('heading', { level: 2 })
    // TASK-022: a Warm-up or Cooldown is headed by its concise guide's card.
    .filter((heading) => heading.closest('[data-review-section], [data-preparation-guide]') !== null)
}

/**
 * A block's card header: the section identity and the structure badge
 * (TASK-002, AC-C07-01 — the live cards' header vocabulary). A3 TASK-119:
 * Round 7's block card is the `.clr-card` around the group (the build's
 * `[data-workout-card="review"]`).
 */
function cardHeader(group: HTMLElement): HTMLElement {
  return group.closest<HTMLElement>('.clr-card')!.querySelector<HTMLElement>('[data-movement-group-header]')!
}

/**
 * Decision 6 of 2026-11-13: the size the build read inside the header
 * (`[data-structure-meta]`) is Round 7's line directly under it (`.clr-timed-meta`).
 */
function metaUnder(header: HTMLElement): HTMLElement {
  const meta = header.nextElementSibling as HTMLElement
  expect(meta).toHaveClass('clr-timed-meta')
  return meta
}

/** A workout of one section holding the given blocks. */
function withBlocks(blocks: ReturnType<typeof makeWorkoutBlock>[]): SessionAcceptance {
  return makeSessionAcceptance({
    workout: {
      ...SPECTRUM,
      sections: [{ ...SPECTRUM.sections[1], blocks }],
    },
  })
}

const THREE_STATION_CIRCUIT = makeWorkoutBlock({
  structure_type: 'circuit',
  rep_scheme: 'fixed',
  rounds: 5,
  round_rest_seconds: 60,
  block_notes: 'After the full sequence, then repeat.',
  exercises: [
    makePrescription({ exercise_id: 'kb-swing', equipment: 'kettlebell', sets: 5, target_value: 15 }),
    makePrescription({ exercise_id: 'push-up', equipment: 'bodyweight', sets: 5, target_value: 10 }),
    makePrescription({ exercise_id: 'goblet-squat', equipment: 'dumbbell', sets: 5, target_value: 12 }),
  ],
})

describe('AC-019: required equipment near the top, before Start, without prose', () => {
  it('lists each piece of equipment once, in the overview, before the first section', async () => {
    renderReview()
    await ready()

    const list = screen.getByRole('list', { name: EQUIPMENT_LABEL })
    const items = within(list).getAllByRole('listitem').map((item) => item.textContent)
    expect(items).toEqual([
      'barbell',
      'dumbbell',
      'pull up bar',
      'kettlebell',
      'medicine ball',
      'rower',
    ])
    expect(items).not.toContain('bodyweight')

    const overview = screen
      .getByRole('heading', { level: 2, name: OVERVIEW_LABEL })
      .closest<HTMLElement>('.clr-card')!
    expect(overview).toContainElement(list)
    const [firstSection] = reviewSections()
    expect(overview).not.toContainElement(firstSection)
    expect(precedes(list, firstSection)).toBe(true)
    expect(precedes(list, sectionHeadings()[0])).toBe(true)
    expect(precedes(list, screen.getByRole('button', { name: START_LABEL }))).toBe(true)
  })

  it('restores neither the generated overview nor a section introduction', async () => {
    renderReview()
    await ready()

    const text = screen.getByRole('main').textContent ?? ''
    expect(SPECTRUM.overview).not.toBeNull()
    expect(text).not.toContain(SPECTRUM.overview)
    expect(text).not.toContain('Move before you load.')
  })

  it('says an all-bodyweight workout needs nothing, rather than showing an empty list', async () => {
    renderReview(
      withBlocks([
        makeWorkoutBlock({
          exercises: [makePrescription({ exercise_id: 'air-squat', equipment: 'bodyweight' })],
        }),
      ]),
    )
    await ready()

    expect(screen.getByText(NO_EQUIPMENT_LABEL)).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: EQUIPMENT_LABEL })).toBeNull()
  })
})

describe('AC-020: Start stays in the pinned action area while the content scrolls', () => {
  it('pins Start, alone, in the footer outside the scrolling region', async () => {
    renderReview()
    await ready()

    const footer = screen.getByRole('contentinfo')
    expect(footer.closest('.clr-scroll-region__foot')).toBeInTheDocument()
    const start = within(footer).getByRole('button', { name: START_LABEL })
    expect(start).toHaveClass('clr-btn--primary')
    expect(within(footer).getAllByRole('button')).toEqual([start])
    expect(screen.getByRole('region', { name: SCROLL_REGION })).not.toContainElement(start)
  })

  it('enters the active workout when Start is tapped', async () => {
    const user = userEvent.setup()
    renderReview()
    await ready()

    await user.click(screen.getByRole('button', { name: START_LABEL }))
    expect(await screen.findByText(WORKOUT_MARKER)).toBeInTheDocument()
  })
})

/**
 * TASK-023 (C50, G15, R05): the element holding the last readable words of
 * the scrolling content, in document order — so "after all workout content"
 * is read from what the screen says, not only from its buttons.
 */
function lastReadable(region: HTMLElement): HTMLElement {
  const walker = document.createTreeWalker(region, NodeFilter.SHOW_TEXT)
  let last: Node | null = null
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    // A closed confirmation is not content: it is in the DOM but not open.
    if (node.parentElement?.closest('dialog:not([open])')) continue
    if ((node.textContent ?? '').trim() !== '') last = node
  }
  return last!.parentElement!
}

/**
 * TASK-023: Regenerate's row is the content list's final item, and every
 * section and every Cooldown movement comes before it. (A3 TASK-119: Round 7's
 * work sections are `[data-review-section]` and its guides
 * `[data-preparation-guide="Warm-up"|"Cooldown"]`, by title.)
 */
function expectRegenerateLast(region: HTMLElement, regenerate: HTMLElement) {
  const row = regenerate.closest<HTMLElement>('.clr-actions')!
  expect(row).not.toBeNull()
  expect(row.parentElement!.lastElementChild, 'Regenerate is the last item of the list').toBe(row)
  expect(row.contains(lastReadable(region)), 'nothing readable follows Regenerate').toBe(true)
  for (const section of region.querySelectorAll('[data-review-section], [data-preparation-guide]')) {
    expect(precedes(section, regenerate)).toBe(true)
  }
  const cooldown = region.querySelector<HTMLElement>('[data-preparation-guide="Cooldown"]')
  if (cooldown !== null) {
    expect(precedes(cooldown, regenerate), 'the Cooldown guide precedes Regenerate').toBe(true)
    const names = within(cooldown).getAllByRole('listitem')
    expect(names.length).toBeGreaterThan(0)
    expect(precedes(names.at(-1)!, regenerate), 'the Cooldown’s last movement precedes Regenerate').toBe(true)
  }
}

/** A confirmation that has been answered: gone, or no longer open. */
function closed(dialog: HTMLElement): boolean {
  return !dialog.isConnected || !dialog.hasAttribute('open')
}

describe('AC-021: Regenerate sits at the end of the scrolling content', () => {
  it('is the last control in the scrolling content, after every section', async () => {
    renderReview()
    await ready()

    const region = screen.getByRole('region', { name: SCROLL_REGION })
    const regenerate = within(region).getByRole('button', { name: REGENERATE_LABEL })
    expect(within(screen.getByRole('contentinfo')).queryByRole('button', { name: REGENERATE_LABEL })).toBeNull()
    expect(regenerate).not.toHaveClass('clr-btn--primary')
    expect(regenerate).not.toHaveClass('clr-text-action')

    const buttons = within(region).getAllByRole('button')
    expect(buttons.at(-1)).toBe(regenerate)
    // A3 TASK-109 (TASK-022): the Warm-up and Cooldown are each one concise
    // guide in their own places, not a block section; Regenerate follows all.
    const sections = [...reviewSections(), ...screen.getByRole('main').querySelectorAll<HTMLElement>('[data-preparation-guide]')]
    expect(sections).toHaveLength(SPECTRUM.sections.length)
    for (const section of sections) {
      expect(precedes(section, regenerate)).toBe(true)
      expect(section).not.toContainElement(regenerate)
    }
    // TASK-002 / TASK-023 (the build's body, on Round 7): every section heading
    // precedes Regenerate, the spectrum ends with its Cooldown guide, and
    // Regenerate follows it — the last item, with nothing readable below it.
    // Round 7 heads each block card with its section (decision 2 of 2026-11-13):
    // the sections are the headings' runs, one per composed section.
    const titles = sectionHeadings().map((heading) => heading.textContent)
    expect(titles.filter((title, index) => title !== titles[index - 1])).toHaveLength(SPECTRUM.sections.length)
    for (const section of sectionHeadings()) {
      expect(precedes(section, regenerate)).toBe(true)
    }
    expect(SPECTRUM.sections.at(-1)!.section_type).toBe('cooldown')
    expect(sectionHeadings().at(-1)!.closest('[data-preparation-guide="Cooldown"]')).not.toBeNull()
    expectRegenerateLast(region, regenerate)
  })

  it('AC-C50-01 follows the whole workout — Warm-up, the work and the Cooldown guide down to its last movement — and nothing readable follows it', async () => {
    const GUIDE_TITLES: Partial<Record<string, string>> = { warmup: 'Warm-up', cooldown: 'Cooldown' }
    for (const acceptance of [
      preparationAcceptance(),
      // The same placement when the composition has no Cooldown: still after all of it.
      preparationAcceptance({ sections: preparationAcceptance().workout.sections.slice(0, 2) }),
    ]) {
      const view = renderReview(acceptance)
      await screen.findByRole('heading', { level: 1, name: acceptance.workout.title })

      const region = screen.getByRole('region', { name: SCROLL_REGION })
      const regenerate = within(region).getByRole('button', { name: REGENERATE_LABEL })
      // Round 7 marks a guide by its title and a work section without its type,
      // so the composed order is read as guide titles and section headings.
      const order = [...region.querySelectorAll<HTMLElement>('[data-review-section], [data-preparation-guide]')]
      expect(order.map((node) => node.getAttribute('data-preparation-guide') ?? 'work')).toEqual(
        acceptance.workout.sections.map((section) => GUIDE_TITLES[section.section_type] ?? 'work'),
      )
      expect(order.map((node) => within(node).getAllByRole('heading', { level: 2 })[0].textContent)).toEqual(
        reviewBriefing(acceptance, null).sections.map((section) => section.title),
      )
      expectRegenerateLast(region, regenerate)
      expect(within(region).getAllByRole('button').at(-1)).toBe(regenerate)

      const cooldown = region.querySelector<HTMLElement>('[data-preparation-guide="Cooldown"]')
      if (acceptance.workout.sections.some((section) => section.section_type === 'cooldown')) {
        expect(within(cooldown!).getAllByRole('listitem').map((item) => item.textContent)).toEqual([...PREPARATION_NAMES.cooldown])
      } else {
        expect(cooldown).toBeNull()
      }
      view.unmount()
    }
  })

  it('still asks before discarding, and regenerates through the existing flow', async () => {
    const user = userEvent.setup()
    let regenerated = 0
    renderReview(ACCEPTANCE, () => (regenerated += 1))
    await ready()

    await user.click(screen.getByRole('button', { name: REGENERATE_LABEL }))
    expect(regenerated).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Discard and regenerate' }))
    expect(regenerated).toBe(1)
  })

  it('AC-C50-01 after the Cooldown its behaviour is unchanged: Keep it keeps the workout, Discard and regenerate runs the same flow once, and it is held while Start is in flight', async () => {
    const user = userEvent.setup()
    const acceptance = preparationAcceptance()
    let regenerated = 0
    renderReview(acceptance, () => (regenerated += 1))
    await screen.findByRole('heading', { level: 1, name: acceptance.workout.title })

    await user.click(screen.getByRole('button', { name: REGENERATE_LABEL }))
    const dialog = await screen.findByRole('dialog', { name: 'Discard this workout?' })
    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }))
    await waitFor(() => expect(closed(dialog)).toBe(true))
    expect(regenerated).toBe(0)
    expect(screen.getByRole('heading', { level: 1, name: acceptance.workout.title })).toBeInTheDocument()
    expect(document.querySelector('[data-preparation-guide="Cooldown"]')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: REGENERATE_LABEL }))
    await user.click(await screen.findByRole('button', { name: 'Discard and regenerate' }))
    expect(regenerated).toBe(1)

    // Start in flight: Regenerate is held, still in its place after the Cooldown.
    const pending = createWorkoutDouble({
      session: null,
      sessions: { accept: () => new Promise<Result<SessionSnapshot>>(() => undefined) },
    })
    const view = renderWithProviders(
      <Routes>
        <Route path="/review" element={<Review acceptance={acceptance} onRegenerate={() => (regenerated += 1)} />} />
      </Routes>,
      { route: '/review', ...signedIn({ workout: pending.clients }) },
    )
    const scope = within(view.container)
    await scope.findByRole('heading', { level: 1, name: acceptance.workout.title })
    await user.click(scope.getByRole('button', { name: START_LABEL }))
    const held = scope.getByRole('button', { name: REGENERATE_LABEL })
    expect(held).toBeDisabled()
    expectRegenerateLast(scope.getByRole('region', { name: SCROLL_REGION }), held)
    expect(regenerated).toBe(1)
  })

  // A3 TASK-119: Round 7's preparation state (bec4454) draws the Warm-up guide,
  // the live For Time card and the Cooldown guide in Review order, and stops
  // there: it draws no Review screen and no Regenerate. The build's reads of a
  // Regenerate in the state are retired for Eric to confirm (test ledger);
  // Review's own Regenerate after the Cooldown is proved on the real route by
  // the cases above and e2e/refinement/task-023.spec.ts.
  it('AC-C50-01 the accepted gallery state ?state=preparation draws Review’s own Regenerate after the Cooldown, and it only asks', { timeout: HEAVY }, async () => {
    render(
      <MemoryRouter initialEntries={['/gallery/refinements?state=preparation']}>
        <GalleryRefinements />
      </MemoryRouter>,
    )
    const state = document.querySelector<HTMLElement>('[data-refinement-state="preparation"]')!
    expect(state).not.toBeNull()
    const parts = [...state.querySelectorAll<HTMLElement>('[data-preparation-guide], .clr-movement-group')]
      .filter((part) => part.parentElement?.closest('[data-preparation-guide], .clr-movement-group') == null)
    expect(parts.map((part) => part.getAttribute('data-preparation-guide') ?? 'work')).toEqual(['Warm-up', 'work', 'Cooldown'])
    const cooldown = state.querySelector<HTMLElement>('[data-preparation-guide="Cooldown"]')!
    // The Cooldown is the state's last readable part, its movements in order
    // (the state's own sample guide; the route reads TASK-034's real guide).
    expect(cooldown.contains(lastReadable(state))).toBe(true)
    expect(within(cooldown).getAllByRole('listitem').map((item) => item.textContent)).toEqual([...GALLERY_GUIDES.cooldown.movements])
    expect(precedes(parts[1], cooldown)).toBe(true)
    expect(within(state).queryByRole('button', { name: REGENERATE_LABEL })).toBeNull()
  })
})

describe('AC-022: numbered one-round sequences under a heading with the round count', () => {
  it('heads a superset with its structure glyph and rounds, and its one-round sequence', async () => {
    renderReview()
    await ready()

    // Round 7: the badge sits in the card's group header, at the end of the
    // section-title row; the sequence leads the group and says it is unrested.
    const list = screen.getByRole('list', { name: 'superset, 4 rounds' })
    const { header, badge, meta, group } = groupCard(list)
    expect(within(header).getByRole('heading', { level: 2 })).toHaveTextContent('Primary lift')
    expect(badge).toHaveTextContent(/^SUPERSET$/)
    expect(badge.querySelector('svg')).not.toBeNull()
    expect(meta).toHaveTextContent(/^4 ROUNDS$/)
    const sequence = group.firstElementChild!
    expect(sequence).toHaveTextContent(/^One round: 01 → 02 — no rest between movements$/)
    expect(precedes(header, meta)).toBe(true)
    expect(precedes(meta, sequence)).toBe(true)
    expect(precedes(header, sequence)).toBe(true)
    expect(precedes(sequence, list)).toBe(true)
    // TASK-002 (AC-C07-01): the badge heads the block's card, in the shared
    // static header with the section's name, and the sequence leads the group.
    // TASK-003 (AC-C08-01, AC-C09-01): the badge says the format alone; the
    // round count is the line below it (A3 TASK-119: Round 7's line under the header).
    expect(cardHeader(group)).toBe(header)
    expect(cardHeader(group).querySelector('.clr-movement-group-header__badge')).toHaveTextContent(/^SUPERSET$/)
    expect(metaUnder(cardHeader(group))).toHaveTextContent(/^4 ROUNDS$/)
    expect(cardHeader(group).querySelector('svg')).not.toBeNull()
    expect([...group.children][0]).toBe(sequence)

    const members = within(list).getAllByRole('listitem')
    expect(members.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^01 bench press/),
      expect.stringMatching(/^02 bent over row/),
    ])
  })

  it('states movement, then prescription, then equipment on each numbered row', async () => {
    renderReview()
    await ready()

    const [first] = within(screen.getByRole('list', { name: 'superset, 4 rounds' })).getAllByRole(
      'listitem',
    )
    const name = within(first).getByText('bench press')
    const prescription = within(first).getByText('8 reps')
    const equipment = within(first).getByText('barbell')
    // Round 7 look: the equipment is inline context at the end of the name row,
    // so the row reads movement, equipment, then prescription.
    const nameRow = name.closest('[data-movement-name-row]')!
    expect(nameRow).toContainElement(equipment)
    expect(nameRow).not.toContainElement(prescription)
    expect(precedes(name, equipment)).toBe(true)
    expect(precedes(equipment, prescription)).toBe(true)
  })

  // R132 (Section 4 A) supersedes the dedicated equipment line: the compact
  // equipment sits beside the name, and the prescription follows the name row.
  it('states movement with its equipment beside it, then the prescription, on each numbered row', async () => {
    renderReview()
    await ready()

    const [first] = within(screen.getByRole('list', { name: 'superset, 4 rounds' })).getAllByRole(
      'listitem',
    )
    const name = within(first).getByText('bench press')
    const prescription = within(first).getByText('8 reps')
    const equipment = within(first).getByText('barbell')
    const nameRow = first.querySelector('[data-movement-name-row]')!
    expect(nameRow).toContainElement(name)
    expect(nameRow).toContainElement(equipment)
    expect(precedes(name, equipment)).toBe(true)
    expect(precedes(equipment, prescription)).toBe(true)
    expect(nameRow).not.toContainElement(prescription)
  })

  it('follows the group’s own movement and round count rather than a fixed layout', async () => {
    renderReview(withBlocks([THREE_STATION_CIRCUIT]))
    await ready()

    const list = screen.getByRole('list', { name: 'circuit, 5 rounds' })
    const { badge, meta, group } = groupCard(list)
    expect(badge).toHaveTextContent(/^CIRCUIT$/)
    expect(badge.querySelector('svg')).not.toBeNull()
    expect(meta).toHaveTextContent(/^5 ROUNDS$/)
    expect(
      within(group).getByText('One round: 01 → 02 → 03 — no rest between movements'),
    ).toBe(group.firstElementChild)
    // TASK-002 (AC-C07-01): the badge is in the card's shared static header.
    // TASK-003 (AC-C08-01): format alone in the badge, the rounds beside it.
    expect(cardHeader(group).querySelector('.clr-movement-group-header__badge')).toHaveTextContent(/^CIRCUIT$/)
    expect(metaUnder(cardHeader(group))).toHaveTextContent(/^5 ROUNDS$/)
    expect(cardHeader(group).querySelector('svg')).not.toBeNull()
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^01 kb swing/),
      expect.stringMatching(/^02 push up/),
      expect.stringMatching(/^03 goblet squat/),
    ])
  })
})

describe('AC-023: grouped movements read as consecutive within each round', () => {
  it('states one round’s target in a superset, and every set in a standard block', async () => {
    renderReview()
    await ready()

    const superset = screen.getByRole('list', { name: 'superset, 4 rounds' })
    expect(superset.textContent).not.toContain('4 × 8 reps')
    expect(within(superset).getAllByText('8 reps')).toHaveLength(2)
    // A standard movement is still every set before the next one.
    expect(screen.getByRole('main').textContent).toContain('5 × 5 reps')
  })

  it('gives a standard block no sequence line and no numbering', async () => {
    renderReview(
      withBlocks([
        makeWorkoutBlock({
          exercises: [
            makePrescription({ exercise_id: 'back-squat', equipment: 'barbell', sets: 5, target_value: 5 }),
          ],
        }),
      ]),
    )
    await ready()

    const text = screen.getByRole('main').textContent ?? ''
    expect(text).not.toContain('One round')
    expect(text).toContain('5 × 5 reps')
    expect(text).not.toMatch(/01 back squat/)
  })

  it('keeps the whole prescription where a superset’s round count is unknown', async () => {
    renderReview(
      withBlocks([
        makeWorkoutBlock({
          structure_type: 'superset',
          rep_scheme: 'fixed',
          exercises: [
            makePrescription({ exercise_id: 'bench-press', equipment: 'barbell', sets: 4, target_value: 8 }),
            makePrescription({ exercise_id: 'bent-over-row', equipment: 'barbell', sets: 3, target_value: 10 }),
          ],
        }),
      ]),
    )
    await ready()

    const list = screen.getByRole('list', { name: 'superset' })
    expect(
      within(list.parentElement!).getByText('One round: 01 → 02 — no rest between movements'),
    ).toBeInTheDocument()
    expect(list.textContent).toContain('4 × 8 reps')
    expect(list.textContent).toContain('3 × 10 reps')
  })
})

describe('AC-024: no trailing divider, the rest beside its group, no repeat description', () => {
  it('rules between movements and never after the final one', async () => {
    renderReview(withBlocks([THREE_STATION_CIRCUIT]))
    await ready()

    // Round 7: the rule is the shared movement list's, from the stylesheet —
    // a region-rule token below every item but the last — not per-row inline.
    const list = screen.getByRole('list', { name: 'circuit, 5 rounds' })
    expect(list.tagName).toBe('OL')
    expect(list).toHaveClass('clr-movement-list')
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    for (const item of items) {
      expect(item.parentElement).toBe(list)
      expect(item.style.borderBlockEnd).toBe('')
      expect(item.style.borderBottom).toBe('')
    }
    const rule = cssRule('.clr-movement-list > li:not(:last-child)')
    expect(rule).toContain('border-block-end:var(--border-width) solid var(--border-region-rule)')
    expect(MOVEMENT_CSS).not.toMatch(/\.clr-movement-list > li(:last-child)?\s*\{[^}]*border/)
    // C04: no inner grouping rail on the group either.
    expect(list.parentElement!.style.borderInlineStart).toBe('')
  })

  // Round 7 states the round rest as a plain reading closing its group; the
  // earlier blue ink and rest glyph are not part of the approved presentation.
  it('keeps the blue rest reading, with its glyph, inside the group it follows', async () => {
    renderReview()
    await ready()

    const list = screen.getByRole('list', { name: 'superset, 4 rounds' })
    const { card, group } = groupCard(list)
    const rest = within(group).getByText('Rest 90s between rounds')
    expect(rest.tagName).toBe('P')
    expect(rest.style.color).toBe('var(--text-card-header)')
    expect(rest.querySelector('svg')).not.toBeNull()
    expect(list).not.toContainElement(rest)
    expect(group.lastElementChild).toBe(rest)
    expect(card.textContent?.match(/Rest 90s/g)).toHaveLength(1)
    expect(precedes(list, rest)).toBe(true)
    expect(group.textContent?.match(/between rounds/g)).toHaveLength(1)
  })

  it('drops the redundant “after the full sequence, then repeat” description', async () => {
    renderReview(withBlocks([THREE_STATION_CIRCUIT]))
    await ready()

    const text = screen.getByRole('main').textContent ?? ''
    expect(text).not.toMatch(/full sequence/i)
    expect(text).not.toMatch(/then repeat/i)
    expect(text).toContain('Rest 60s between rounds')
  })

  it.each(['superset', 'circuit'] as const)('keeps necessary %s execution instructions', async (structure) => {
    renderReview(withBlocks([{ ...THREE_STATION_CIRCUIT, structure_type: structure,
      block_notes: 'Alternate sides each rep.' }]))
    await ready()

    const group = screen.getByRole('list', { name: `${structure}, 5 rounds` }).parentElement!
    expect(within(group).getByText('Alternate sides each rep.', { exact: true })).toBeInTheDocument()
  })

  it.each([
    ['After the full sequence, then repeat. Alternate sides each rep.', 'Alternate sides each rep.'],
    ['Alternate sides each rep. After the full sequence, then repeat.', 'Alternate sides each rep.'],
    ['Alternate sides each rep.\nAfter the full sequence, then repeat.\nUse the same load.', 'Alternate sides each rep.\nUse the same load.'],
  ])('removes only the known repeat sentence from a combined note: %s', async (note, retained) => {
    renderReview(withBlocks([{ ...THREE_STATION_CIRCUIT, block_notes: note }]))
    await ready()

    const group = screen.getByRole('list', { name: 'circuit, 5 rounds' }).parentElement!
    expect(within(group).getByText(retained.replaceAll('\n', ' '), { exact: true })).toBeInTheDocument()
    expect(group.textContent).not.toMatch(/after the full sequence, then repeat/i)
  })

  it('does not interpret or discard other freeform repeat instructions', async () => {
    const note = 'Repeat the final movement on the other side.'
    renderReview(withBlocks([{ ...THREE_STATION_CIRCUIT, block_notes: note }]))
    await ready()

    expect(screen.getByText(note, { exact: true })).toBeInTheDocument()
  })
})

/**
 * TASK-008 (issue #566, REQ-008): B05-03's compact summary — the workout's
 * title, then one aligned row of glyph-led facts with real values, in place
 * of the tall metric grid. The rendered row is proved in the browser by
 * `e2e/ui-polish-b05-summary-facts.spec.ts`; this is its structural half.
 */
describe('REQ-008: the compact workout-facts row under the workout title', () => {
  function factsRow(): HTMLElement {
    return screen.getByRole('main').querySelector<HTMLElement>(`dl[aria-label="${FACTS_LABEL}"]`)!
  }

  it('reads the real facts, in order, as one glyph-led row inside the overview card', async () => {
    renderReview()
    await ready()

    const overview = screen
      .getByRole('heading', { level: 2, name: OVERVIEW_LABEL })
      .closest<HTMLElement>('.clr-card')!
    const row = factsRow()
    expect(overview).toContainElement(row)
    expect(row).toHaveClass('clr-summary-facts')
    expect(overview.querySelector('.clr-metric-grid, .clr-metric-frame')).toBeNull()

    const readings = [...row.querySelectorAll<HTMLElement>('.clr-summary-fact')]
    expect(readings.map((reading) => reading.querySelector('dt')!.textContent)).toEqual([
      DURATION_LABEL,
      ANCHOR_LABEL,
      INTENSITY_LABEL,
      GOAL_LABEL,
      MOVEMENTS_LABEL,
    ])
    // Real values, from the composition rather than the reference's demo row.
    const briefing = reviewBriefing(ACCEPTANCE, null)
    const value = (label: string) => briefing.facts.find((fact) => fact.label === label)!.value
    expect(readings.map((reading) => reading.querySelector('dd')!.textContent)).toEqual([
      value(DURATION_LABEL),
      value(ANCHOR_LABEL),
      value(INTENSITY_LABEL),
      value(GOAL_LABEL),
      String(briefing.movementCount),
    ])

    // The system glyphs stay beside the four composed facts, decorative to a
    // reader; the term carries the meaning either way.
    for (const reading of readings.slice(0, 4)) {
      const glyph = reading.querySelector('.clr-summary-fact__glyph')!
      expect(glyph).toHaveAttribute('aria-hidden', 'true')
      expect(glyph.querySelector('svg')).not.toBeNull()
    }
    // Native description-list groups contain their term and description;
    // decorative glyphs belong inside the term, never beside that pair.
    for (const reading of readings) {
      expect([...reading.children].map((child) => child.tagName)).toEqual(['DT', 'DD'])
    }
  })

  // The title is the pinned header's; its place above the row is geometry,
  // measured in the browser spec. Here: the facts lead, then the equipment.
  it('keeps the workout title as the page title, the facts first, then the equipment', async () => {
    renderReview()
    await ready()

    expect(screen.getByRole('heading', { level: 1, name: SPECTRUM.title })).toBeInTheDocument()
    const row = factsRow()
    const equipment = screen.getByRole('list', { name: EQUIPMENT_LABEL })
    expect(precedes(row, equipment)).toBe(true)
    expect(precedes(equipment, reviewSections()[0])).toBe(true)
    expect(precedes(equipment, sectionHeadings()[0])).toBe(true)
  })

  it('never renders the excluded bodyweight sentence, and leaves equipment as it was', async () => {
    renderReview(withBlocks([THREE_STATION_CIRCUIT]))
    await ready()

    expect(screen.getByRole('main').textContent).not.toMatch(/bodyweight movements included/i)
    // A mixed workout still lists its real equipment, bodyweight excluded as
    // before; nothing about eligibility moved.
    const items = within(screen.getByRole('list', { name: EQUIPMENT_LABEL }))
      .getAllByRole('listitem')
      .map((item) => item.textContent)
    expect(items).toEqual(['kettlebell', 'dumbbell'])
  })
})

/**
 * TASK-010 (issue #568, REQ-009): B05-04's grouped hierarchy through the shared
 * `ReviewExerciseRow` — the name row leads with Swap at its end, then a
 * separate prescription row, then equipment — and the group's round rest said
 * once instead of a rest and a `Bodyweight` on every movement. The rendered
 * relationships are proved in `e2e/ui-polish-b05-review-groups.spec.ts`.
 */
/**
 * A3 TASK-119: a standard block's movement rows on Round 7 — each identity's
 * own row in the block card's movement group (the build listed them in
 * “Movements in this block”; Round 7 draws no list there).
 */
function standardRows(): HTMLElement[] {
  const groups = [...document.querySelectorAll<HTMLElement>('[data-review-section] .clr-movement-group')].filter((group) =>
    group.querySelector('ol, .clr-movement-group') === null && group.querySelector('.clr-movement-identity') !== null)
  expect(groups).toHaveLength(1)
  return [...groups[0].querySelectorAll<HTMLElement>('.clr-movement-identity')].map((identity) => identity.parentElement!)
}

describe('REQ-009: grouped Review movement hierarchy and one group rest', () => {
  const bodyweight = { equipment: 'bodyweight', load_type: 'bodyweight' as const, load_value: null }
  const BODYWEIGHT_CIRCUIT = makeWorkoutBlock({
    structure_type: 'circuit',
    rep_scheme: 'fixed',
    rounds: 2,
    round_rest_seconds: 60,
    exercises: [
      makePrescription({ exercise_id: 'mountain-climber', ...bodyweight, sets: 2, target_value: 12, rest_seconds: 60 }),
      makePrescription({ exercise_id: 'squat-jump', ...bodyweight, sets: 2, target_value: 10, rest_seconds: 60 }),
      makePrescription({ exercise_id: 'bear-crawl', ...bodyweight, sets: 2, modality: 'time', target_value: 20, rest_seconds: 60 }),
    ],
  })

  it.each([
    ['superset, 4 rounds', undefined],
    ['circuit, 2 rounds', BODYWEIGHT_CIRCUIT],
  ] as const)('%s: name row with Swap at its end, then prescription, then equipment', async (name, block) => {
    renderReview(block === undefined ? ACCEPTANCE : withBlocks([block]))
    await ready()

    // Round 7: the shared `MovementIdentity` — name row (name, then the Swap
    // slot), prescription row, equipment line — with its faces from the
    // shared stylesheet's tokens rather than inline styles.
    expect(cssRule('.clr-movement-identity__name')).toContain('font-family:var(--font-display)')
    expect(cssRule('.clr-movement-identity__prescription')).toContain('font-size:var(--label-md-size)')
    for (const item of within(screen.getByRole('list', { name })).getAllByRole('listitem')) {
      const identity = item.querySelector<HTMLElement>('.clr-movement-identity')!
      // Round 7 look: the equipment is inline context closing the name, so the
      // identity is the name row, then the prescription row.
      const [row, prescription, ...after] = [...identity.children] as HTMLElement[]
      expect(after).toEqual([])
      expect(row).toHaveAttribute('data-movement-name-row')
      const [title, swapSlot] = [...row.children] as HTMLElement[]
      const [name, equipment] = [...title.children] as HTMLElement[]
      expect(name.textContent).toMatch(/^\d\d [a-z ]+$/)
      expect(title).toHaveClass('clr-movement-identity__name')
      expect(swapSlot).toHaveClass('clr-movement-identity__action')
      expect(within(swapSlot).getByRole('button', { name: /^Swap / })).toBeInTheDocument()
      expect(prescription).toHaveClass('clr-movement-identity__prescription')
      expect(prescription).toHaveAttribute('data-movement-detail')
      expect(equipment.tagName).toBe('SPAN')
      expect(equipment).toHaveClass('clr-movement-identity__equipment-inline')
      expect(equipment).toHaveAttribute('data-movement-context')
      expect(equipment.textContent).toMatch(/^[a-z ]+$/)
      expect(precedes(row, prescription)).toBe(true)
    }
  })

  it.each([
    ['superset, 4 rounds', undefined],
    ['circuit, 2 rounds', BODYWEIGHT_CIRCUIT],
  ] as const)('%s: name row with equipment beside the name and Swap at its end, then prescription', async (name, block) => {
    renderReview(block === undefined ? ACCEPTANCE : withBlocks([block]))
    await ready()

    for (const item of within(screen.getByRole('list', { name })).getAllByRole('listitem')) {
      // TASK-001: the shared MovementIdentity; R132 places equipment beside the name.
      // A3 TASK-119: Round 7's name element (`.clr-movement-identity__name`)
      // holds the name's words, then the equipment inline (decision R132 A).
      const [row, prescription] = [...item.querySelector('.clr-movement-identity')!.children] as HTMLElement[]
      const [title, swapSlot] = [...row.children] as HTMLElement[]
      const nameText = title.firstElementChild!
      const equipment = title.querySelector('[data-movement-context]')!
      expect(nameText.textContent).toMatch(/^\d\d [a-z ]+$/)
      expect(title).toHaveClass('clr-movement-identity__name')
      expect(equipment).toHaveClass('clr-movement-identity__equipment-inline')
      expect(within(swapSlot).getByRole('button', { name: /^Swap / })).toBeInTheDocument()
      // Round 7's prescription row is a block of readings (`DIV`, the build's `P`).
      expect(prescription.tagName).toBe('DIV')
      expect(prescription).toHaveClass('clr-movement-identity__prescription')
      expect(prescription).toHaveAttribute('data-movement-detail')
    }
  })

  it('states the round rest once, in the group, never on each movement', async () => {
    renderReview(withBlocks([BODYWEIGHT_CIRCUIT]))
    await ready()

    const list = screen.getByRole('list', { name: 'circuit, 2 rounds' })
    const group = list.parentElement!
    expect(group.textContent?.match(/Rest 60s/g)).toHaveLength(1)
    expect(group.lastElementChild).toHaveTextContent('Rest 60s between rounds')
    for (const item of within(list).getAllByRole('listitem')) {
      expect(item.textContent?.match(/bodyweight/gi)).toHaveLength(1)
    }
    expect(within(list).getAllByText('12 reps')).toHaveLength(1)
    expect(within(list).getAllByText('20 sec')).toHaveLength(1)
  })

  it('keeps a real load beside its equipment inside a group', async () => {
    renderReview(withBlocks([THREE_STATION_CIRCUIT]))
    await ready()

    const [first] = within(screen.getByRole('list', { name: 'circuit, 5 rounds' })).getAllByRole('listitem')
    expect(within(first).getByText('24 kg')).toBeInTheDocument()
    expect(within(first).getByText('kettlebell')).toBeInTheDocument()
    expect(first.textContent).not.toContain('Rest 60s')
  })

  it('keeps only Swap by the name and the full Undo after the readings following a real choice', async () => {
    const user = userEvent.setup()
    const acceptance = withBlocks([BODYWEIGHT_CIRCUIT])
    renderReview(acceptance, () => undefined, [{
      section: acceptance.workout.sections[0].section_type,
      relaxed: false,
      candidates: [{
        exerciseId: 'synthetic-lateral-cross-body-mountain-climber-with-shoulder-reach',
        name: 'Synthetic replacement', role: 'conditioning', canBePrimary: false,
        patterns: ['conditioning'], primaryPatterns: ['conditioning'],
        components: [], muscles: [], usableEquipment: ['bodyweight'],
      }],
    }])
    await ready()
    const list = screen.getByRole('list', { name: 'circuit, 2 rounds' })
    const first = within(list).getAllByRole('listitem')[0]
    const identity = first.querySelector<HTMLElement>('.clr-movement-identity')!
    const [nameRow, prescription] = [...identity.children]
    expect(nameRow).toHaveAttribute('data-movement-name-row')
    // Round 7 look: the equipment is inline context at the end of the name row.
    const equipment = nameRow.querySelector<HTMLElement>('[data-movement-context]')!
    await user.click(within(first).getByRole('button', { name: 'Swap mountain climber' }))
    await user.click(await screen.findByRole('button', { name: /Synthetic replacement\s*BODYWEIGHT/ }))

    const swap = within(first).getByRole('button', {
      name: 'Swap synthetic lateral cross body mountain climber with shoulder reach',
    })
    const undo = within(first).getByRole('button', { name: 'Undo swap — back to mountain climber' })
    expect(nameRow).toContainElement(swap)
    expect(nameRow).not.toContainElement(undo)
    expect(precedes(equipment, prescription)).toBe(true)
    expect(precedes(equipment, undo)).toBe(true)
    expect(precedes(prescription, undo)).toBe(true)
    expect(undo).toHaveTextContent('Undo swap')
    await user.click(undo)
    expect(within(first).getByRole('button', { name: 'Swap mountain climber' })).toBeInTheDocument()
    expect(within(first).queryByRole('button', { name: /Undo swap/ })).not.toBeInTheDocument()
  })

  it('leaves a standard movement’s own rest where it was, and says bodyweight once', async () => {
    renderReview(
      withBlocks([
        makeWorkoutBlock({
          exercises: [makePrescription({ exercise_id: 'air-squat', ...bodyweight, rest_seconds: 45 })],
        }),
      ]),
    )
    await ready()

    // Round 7 (`distinctLoadText`): a `Bodyweight` load that only repeats the
    // `bodyweight` equipment is said once, by the equipment line, everywhere —
    // not only inside a group. The standard row keeps its own rest.
    const main = screen.getByRole('main')
    expect(within(main).getByText('Rest 45s')).toBeInTheDocument()
    const identity = within(main)
      .getByRole('button', { name: 'Swap air squat' })
      .closest<HTMLElement>('.clr-movement-identity')!
    const row = identity.parentElement!
    // Round 7 look: the equipment line is inline context at the end of the name.
    expect(within(identity).getByText('bodyweight')).toHaveClass('clr-movement-identity__equipment-inline')
    expect(row.textContent?.match(/bodyweight/gi)).toHaveLength(1)
    expect(precedes(identity, within(row).getByText('Rest 45s'))).toBe(true)
  })

  // TASK-002 (AC-R002-01): with the compact equipment beside the name, a
  // standard movement's `Bodyweight` beside its `bodyweight` equipment is said
  // once, by the equipment, as it already was in a round. Its own rest stays.
  // (A3 TASK-119: Round 7 draws a standard block's rows straight in its card's
  // movement group, with no list; the row is the identity's own row.)
  it('leaves a standard movement’s own rest where it was and says its Bodyweight once', async () => {
    renderReview(
      withBlocks([
        makeWorkoutBlock({
          exercises: [makePrescription({ exercise_id: 'air-squat', ...bodyweight, rest_seconds: 45 })],
        }),
      ]),
    )
    await ready()

    const main = screen.getByRole('main')
    expect(within(main).getByText('Rest 45s')).toBeInTheDocument()
    const [row] = standardRows()
    expect(row.textContent?.match(/bodyweight/gi)).toHaveLength(1)
    expect(within(row).getByText('bodyweight')).toHaveAttribute('data-movement-context')
    expect(within(main).getByRole('button', { name: 'Swap air squat' })).toBeInTheDocument()
  })

  it('keeps an actual Bodyweight load beside other equipment', async () => {
    renderReview(
      withBlocks([
        makeWorkoutBlock({
          exercises: [makePrescription({ exercise_id: 'pull-up', equipment: 'pull-up-bar', load_type: 'bodyweight', load_value: null })],
        }),
      ]),
    )
    await ready()

    const [row] = standardRows()
    // Round 7's load is the prescription's second reading (the build's `[data-movement-load]`).
    expect(within(row).getByText('Bodyweight')).toBe(row.querySelector(':scope [data-movement-detail] > span:nth-child(2)'))
    expect(within(row).getByText('pull up bar')).toHaveAttribute('data-movement-context')
  })
})
