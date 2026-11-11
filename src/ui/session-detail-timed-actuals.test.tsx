/**
 * TASK-047 (REQ-031; AC-R031-02): History's detail reads back a timed
 * block's recorded categorical effort and each movement's recorded actual —
 * through the existing effort owner's face and under the movement it was
 * recorded for — from the read model only (`BlockDetailView.effort`,
 * `movementActuals`), never from the plan. Task-owned focused test; the
 * route-level proof is `e2e/refinement/task-047.spec.ts`.
 */
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { BlockDetailView, SectionDetailView } from '../state/session-detail'
import { SessionSectionCard, StructureResultBadge } from './session-detail'

const exercise = (id: string, name: string, prescription: string) => ({
  id,
  name,
  prescription,
  status: 'not_started' as const,
  statusLabel: 'Not logged',
  lineage: 'prescribed' as const,
  lineageLabel: null,
  sets: [],
})

const AMRAP: BlockDetailView = {
  id: 'amrap-block',
  identity: { label: 'AMRAP', format: 'AMRAP', detail: '5 MIN', repScheme: null, glyph: 'Stopwatch' },
  scored: true,
  outcome: [{ label: 'Rounds', value: '2' }],
  perceivedEffort: null,
  effort: 'about_right',
  notes: 'Grip went in round 3.',
  movementActuals: [
    { key: 'row-1', exerciseId: 'goblet', name: 'goblet squat', round: 3, roundLabel: 'Round 3', amount: '5 reps', weight: '18 kg' },
    { key: 'row-2', exerciseId: 'burpee', name: 'burpee', round: 3, roundLabel: 'Round 3', amount: '0 reps', weight: null },
  ],
  exercises: [
    exercise('goblet', 'goblet squat', '1 × 10 reps · 16 kg'),
    exercise('burpee', 'burpee', '1 × 12 reps'),
    exercise('row', 'row', '1 × 200 m'),
  ],
}

const EMOM_LOAD_ONLY: BlockDetailView = {
  ...AMRAP,
  id: 'emom-block',
  identity: { label: 'EMOM', format: 'EMOM', detail: '2 MIN', repScheme: null, glyph: 'Stopwatch' },
  outcome: [],
  effort: null,
  notes: null,
  movementActuals: [
    { key: 'row-3', exerciseId: 'goblet', name: 'goblet squat', round: null, roundLabel: null, amount: null, weight: '14 kg' },
  ],
  exercises: [exercise('goblet', 'goblet squat', '1 × 8 reps · 16 kg'), exercise('burpee', 'burpee', '1 × 10 reps')],
}

const section = (blocks: BlockDetailView[]): SectionDetailView => ({ id: 'section', title: 'Timed results', type: 'conditioning', blocks })

describe('TASK-047 History reads back recorded timed actuals and categorical effort', () => {
  it('draws the category through the existing effort face beside the block outcome, never on the 1–10 scale, and nothing when unanswered', () => {
    const { rerender } = render(<StructureResultBadge block={AMRAP} />)
    expect(screen.getByRole('img', { name: 'Effort: about right' })).toBeInTheDocument()
    expect(screen.queryByText(/of 10/)).toBeNull()
    rerender(<StructureResultBadge block={{ ...AMRAP, effort: null }} />)
    expect(screen.queryByRole('img', { name: /^Effort: / })).toBeNull()
    rerender(<StructureResultBadge block={{ ...AMRAP, effort: null, perceivedEffort: '7 of 10' }} />)
    expect(screen.getByText('7 of 10')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /^Effort: / })).toBeNull()
  })

  it('draws each recorded actual under the movement it belongs to, a recorded zero as zero, a load alone without a round, and nothing for an unrecorded movement or from the plan', () => {
    const { container } = render(<SessionSectionCard section={section([AMRAP, EMOM_LOAD_ONLY])} />)
    const [amrap, emom] = [...container.querySelectorAll<HTMLElement>('[data-detail-block]')]
    expect(within(amrap).getByText('Grip went in round 3.')).toBeInTheDocument()
    const actual = (scope: HTMLElement, id: string) => scope.querySelector(`[data-movement-actual="${id}"]`)
    expect(actual(amrap, 'goblet')).toHaveTextContent('ActualRound 3 · 5 reps · 18 kg')
    expect(actual(amrap, 'burpee')).toHaveTextContent('ActualRound 3 · 0 reps')
    expect(actual(amrap, 'row')).toBeNull()
    expect(actual(emom, 'goblet')).toHaveTextContent(/^Actual14 kg$/)
    expect(actual(emom, 'burpee')).toBeNull()
    // Each reading sits with its movement's own name, after it.
    const gobletName = within(amrap).getAllByText('goblet squat')[0]
    expect(gobletName.compareDocumentPosition(actual(amrap, 'goblet')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const burpeeName = within(amrap).getAllByText('burpee')[0]
    expect(actual(amrap, 'goblet')!.compareDocumentPosition(burpeeName) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // The plan's 16 kg is the prescription's words, never an actual.
    for (const reading of container.querySelectorAll('[data-movement-actual]')) expect(reading).not.toHaveTextContent('16 kg')
  })
})
