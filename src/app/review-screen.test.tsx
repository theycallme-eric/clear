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

import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Route, Routes } from 'react-router-dom'

import type { SessionsClient } from '../data/sessions'
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
    const sections = reviewSections()
    expect(sections).toHaveLength(SPECTRUM.sections.length)
    for (const section of sections) {
      expect(precedes(section, regenerate)).toBe(true)
      expect(section).not.toContainElement(regenerate)
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
})
