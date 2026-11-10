/**
 * TASK-005 (issue #525) acceptance: REQ-006 and REQ-007 on the pre-start
 * Review screen — required equipment before Start, Start pinned, Regenerate at
 * the end of the scrolling content, and supersets/circuits as numbered
 * one-round sequences with their rest beside them and no trailing divider.
 *
 * One block per criterion, AC-019 … AC-024, over the same two-route harness
 * `Review.test.tsx` uses, so Start is asserted by arriving at `/workout`.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { MemoryRouter, Route, Routes } from 'react-router-dom'

import type { SessionsClient } from '../data/sessions'
import { PREPARATION_NAMES, preparationAcceptance } from '../dev/gallery-refinement-preparation-data'
import { GalleryRefinements } from '../dev/gallery-refinements'
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
 * The sections' static headings, in order. TASK-002 (AC-R002-02, R37): a
 * section's header is a semantic heading on its first card, never an expanded
 * toggle, so the sections are found by their headings.
 */
function sectionHeadings(): HTMLElement[] {
  return screen
    .getAllByRole('heading', { level: 2 })
    // TASK-022: a Warm-up or Cooldown is headed by its concise guide's card.
    .filter((heading) => heading.closest('[data-workout-card="review"], [data-preparation-guide]') !== null)
}

/**
 * A block's card header: the section identity and the structure badge
 * (TASK-002, AC-C07-01 — the live cards' header vocabulary).
 */
function cardHeader(group: HTMLElement): HTMLElement {
  return group.closest<HTMLElement>('[data-workout-card="review"]')!.querySelector<HTMLElement>('[data-movement-group-header]')!
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
    const firstSection = sectionHeadings()[0]
    expect(precedes(list, firstSection)).toBe(true)
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
 * section and every Cooldown movement comes before it.
 */
function expectRegenerateLast(region: HTMLElement, regenerate: HTMLElement) {
  const row = regenerate.closest<HTMLElement>('.clr-actions')!
  expect(row).not.toBeNull()
  expect(row.parentElement!.lastElementChild, 'Regenerate is the last item of the list').toBe(row)
  expect(row.contains(lastReadable(region)), 'nothing readable follows Regenerate').toBe(true)
  for (const section of region.querySelectorAll('[data-review-section]')) {
    expect(precedes(section, regenerate)).toBe(true)
  }
  const cooldown = region.querySelector<HTMLElement>('[data-preparation-guide="cooldown"]')
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
    expect(sectionHeadings()).toHaveLength(SPECTRUM.sections.length)
    for (const section of sectionHeadings()) {
      expect(precedes(section, regenerate)).toBe(true)
    }
    // TASK-023 (C50, R05): the spectrum ends with its Cooldown guide, and
    // Regenerate follows it — the last item, with nothing readable below it.
    expect(SPECTRUM.sections.at(-1)!.section_type).toBe('cooldown')
    expect(sectionHeadings().at(-1)!.closest('[data-preparation-guide="cooldown"]')).not.toBeNull()
    expectRegenerateLast(region, regenerate)
  })

  it('AC-C50-01 follows the whole workout — Warm-up, the work and the Cooldown guide down to its last movement — and nothing readable follows it', async () => {
    for (const acceptance of [
      preparationAcceptance(),
      // The same placement when the composition has no Cooldown: still after all of it.
      preparationAcceptance({ sections: preparationAcceptance().workout.sections.slice(0, 2) }),
    ]) {
      const view = renderReview(acceptance)
      await screen.findByRole('heading', { level: 1, name: acceptance.workout.title })

      const region = screen.getByRole('region', { name: SCROLL_REGION })
      const regenerate = within(region).getByRole('button', { name: REGENERATE_LABEL })
      const order = [...region.querySelectorAll<HTMLElement>('[data-review-section]')].map((node) => node.dataset.reviewSection)
      expect(order).toEqual(acceptance.workout.sections.map((section) => section.section_type))
      expectRegenerateLast(region, regenerate)
      expect(within(region).getAllByRole('button').at(-1)).toBe(regenerate)

      const cooldown = region.querySelector<HTMLElement>('[data-preparation-guide="cooldown"]')
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
    expect(document.querySelector('[data-preparation-guide="cooldown"]')).not.toBeNull()

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

  it('AC-C50-01 the accepted gallery state ?state=preparation draws Review’s own Regenerate after the Cooldown, and it only asks', { timeout: 30_000 }, async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/gallery/refinements?state=preparation']}>
        <GalleryRefinements />
      </MemoryRouter>,
    )
    const state = document.querySelector<HTMLElement>('[data-refinement-state="preparation"]')!
    expect(state).not.toBeNull()
    const review = state.querySelector<HTMLElement>('[data-gallery-context="review"]')!
    const regenerate = within(review).getByRole('button', { name: REGENERATE_LABEL })
    expect(regenerate).not.toHaveClass('clr-btn--primary')
    expect(regenerate).not.toHaveClass('clr-text-action')
    const cooldown = review.querySelector<HTMLElement>('[data-preparation-guide="cooldown"]')!
    expect(precedes(cooldown, regenerate)).toBe(true)
    expect(within(cooldown).getAllByRole('listitem').map((item) => item.textContent)).toEqual([...PREPARATION_NAMES.cooldown])
    const row = regenerate.closest<HTMLElement>('.clr-actions')!
    expect(review.lastElementChild).toBe(row)
    expect(within(review).getAllByRole('button').at(-1)).toBe(regenerate)

    await user.click(regenerate)
    const dialog = await screen.findByRole('dialog', { name: 'Discard this workout?' })
    await user.click(within(dialog).getByRole('button', { name: 'Discard and regenerate' }))
    await waitFor(() => expect(closed(dialog)).toBe(true))
    // The gallery discards nothing: the same guides and Regenerate are still there.
    expect(review.querySelector('[data-preparation-guide="cooldown"]')).toBe(cooldown)
    expect(within(review).getByRole('button', { name: REGENERATE_LABEL })).toBe(regenerate)
  })
})

describe('AC-022: numbered one-round sequences under a heading with the round count', () => {
  it('heads a superset with its structure glyph and rounds, and its one-round sequence', async () => {
    renderReview()
    await ready()

    const list = screen.getByRole('list', { name: 'superset, 4 rounds' })
    const group = list.parentElement!
    // TASK-002 (AC-C07-01): the badge heads the block's card, in the shared
    // static header with the section's name, and the sequence leads the group.
    const badge = cardHeader(group)
    const [sequence] = [...group.children]
    // TASK-003 (AC-C08-01, AC-C09-01): the badge below the name says the
    // format alone; the round count is the header's line below the badge.
    expect(badge.querySelector('.clr-movement-group-header__badge')).toHaveTextContent(/^SUPERSET$/)
    expect(badge.querySelector('[data-structure-meta]')).toHaveTextContent(/^4 ROUNDS$/)
    expect(badge.querySelector('svg')).not.toBeNull()
    expect(precedes(badge, sequence)).toBe(true)
    expect(sequence).toHaveTextContent(/^One round: 01 → 02$/)
    expect(precedes(sequence, list)).toBe(true)

    const members = within(list).getAllByRole('listitem')
    expect(members.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^01 bench press/),
      expect.stringMatching(/^02 bent over row/),
    ])
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
    const group = list.parentElement!
    // TASK-002 (AC-C07-01): the badge is in the card's shared static header.
    // TASK-003 (AC-C08-01): format alone in the badge, the rounds beside it.
    expect(cardHeader(group).querySelector('.clr-movement-group-header__badge')).toHaveTextContent(/^CIRCUIT$/)
    expect(cardHeader(group).querySelector('[data-structure-meta]')).toHaveTextContent(/^5 ROUNDS$/)
    expect(cardHeader(group).querySelector('svg')).not.toBeNull()
    expect(within(group).getByText('One round: 01 → 02 → 03')).toBeInTheDocument()
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
    expect(within(list.parentElement!).getByText('One round: 01 → 02')).toBeInTheDocument()
    expect(list.textContent).toContain('4 × 8 reps')
    expect(list.textContent).toContain('3 × 10 reps')
  })
})

describe('AC-024: no trailing divider, the rest beside its group, no repeat description', () => {
  it('rules between movements and never after the final one', async () => {
    renderReview(withBlocks([THREE_STATION_CIRCUIT]))
    await ready()

    const items = within(screen.getByRole('list', { name: 'circuit, 5 rounds' })).getAllByRole(
      'listitem',
    )
    // TASK-001: the separator is the shared peer list's (`MovementList`), drawn
    // only between two peers by its stylesheet — proved with the stylesheet
    // applied in `src/ui/movement-list.test.tsx` and on the route in
    // `e2e/refinement/task-001.spec.ts`. No row draws a rule of its own.
    const list = screen.getByRole('list', { name: 'circuit, 5 rounds' })
    expect(list).toHaveClass('clr-movement-list')
    for (const item of items) {
      expect(item.style.borderBlockEnd).toBe('')
      expect(item.style.borderBottom).toBe('')
    }
    // C04: no inner grouping rail on the group either.
    expect(list.parentElement!.style.borderInlineStart).toBe('')
  })

  it('keeps the blue rest reading, with its glyph, inside the group it follows', async () => {
    renderReview()
    await ready()

    const list = screen.getByRole('list', { name: 'superset, 4 rounds' })
    const group = list.parentElement!
    const rest = within(group).getByText('Rest 90s between rounds')
    expect(rest.style.color).toBe('var(--text-card-header)')
    expect(rest.querySelector('svg')).not.toBeNull()
    expect(group.lastElementChild).toBe(rest)
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
  ] as const)('%s: name row with equipment beside the name and Swap at its end, then prescription', async (name, block) => {
    renderReview(block === undefined ? ACCEPTANCE : withBlocks([block]))
    await ready()

    for (const item of within(screen.getByRole('list', { name })).getAllByRole('listitem')) {
      // TASK-001: the shared MovementIdentity; R132 places equipment beside the name.
      const [row, prescription] = [...item.firstElementChild!.children] as HTMLElement[]
      const [title, swapSlot] = [...row.children] as HTMLElement[]
      const nameText = title.querySelector('.clr-movement-identity__name')!
      const equipment = title.querySelector('[data-movement-context]')!
      expect(nameText.textContent).toMatch(/^\d\d [a-z ]+$/)
      expect(nameText).toHaveClass('clr-movement-identity__name')
      expect(equipment).toHaveClass('clr-movement-identity__equipment')
      expect(within(swapSlot).getByRole('button', { name: /^Swap / })).toBeInTheDocument()
      expect(prescription.tagName).toBe('P')
      expect(prescription).toHaveClass('clr-movement-identity__prescription')
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
    const [nameRow, prescription] = [...first.firstElementChild!.children]
    const equipment = nameRow.querySelector('[data-movement-context]')!
    await user.click(within(first).getByRole('button', { name: 'Swap mountain climber' }))
    await user.click(await screen.findByRole('button', { name: /Synthetic replacement\s*BODYWEIGHT/ }))

    const swap = within(first).getByRole('button', {
      name: 'Swap synthetic lateral cross body mountain climber with shoulder reach',
    })
    const undo = within(first).getByRole('button', { name: 'Undo swap — back to mountain climber' })
    expect(nameRow).toContainElement(swap)
    expect(nameRow).not.toContainElement(undo)
    expect(precedes(equipment, prescription)).toBe(true)
    expect(precedes(prescription, undo)).toBe(true)
    expect(undo).toHaveTextContent('Undo swap')
    await user.click(undo)
    expect(within(first).getByRole('button', { name: 'Swap mountain climber' })).toBeInTheDocument()
    expect(within(first).queryByRole('button', { name: /Undo swap/ })).not.toBeInTheDocument()
  })

  // TASK-002 (AC-R002-01): with the compact equipment beside the name, a
  // standard movement's `Bodyweight` beside its `bodyweight` equipment is said
  // once, by the equipment, as it already was in a round. Its own rest stays.
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
    const [row] = within(screen.getByRole('list', { name: 'Movements in this block' })).getAllByRole('listitem')
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

    const [row] = within(screen.getByRole('list', { name: 'Movements in this block' })).getAllByRole('listitem')
    expect(within(row).getByText('Bodyweight')).toHaveAttribute('data-movement-load')
    expect(within(row).getByText('pull up bar')).toHaveAttribute('data-movement-context')
  })
})
