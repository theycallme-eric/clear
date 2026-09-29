/**
 * OVR-03 acceptance — the score a timed block earned, and the comparison only
 * on an identical repeat.
 *
 * Two halves. `likeForLike` is the read the completion path takes: the
 * normalized score per format, the comparison against an identical attempt,
 * and — when there is none — the reason, or silence when the history was never
 * in hand. `ConditioningScoreLine` is what the dialog renders from it.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { BlockOutcome } from '../state/block-completion'
import {
  conditioningSections,
  likeForLike,
  type ConditioningSectionRead,
} from '../state/conditioning'
import type { ConditioningHistoryRow } from '../state/schemas'
import { sessionProgress, type BlockProgress } from '../state/workout-progress'
import {
  fixtureId,
  snapshotFixture,
  type BlockFixture,
} from '../test/workout-double'
import { ABSENCE_WORDS, ConditioningScoreLine } from './conditioning-score'

const EARLIER_BLOCK = fixtureId('9', 3)

/** One block of the given shape, as the shell derives it. */
function blockOf(fixture: BlockFixture): BlockProgress {
  const snapshot = snapshotFixture({ sections: [{ blocks: [fixture] }] })
  const block = sessionProgress(snapshot).sections[0]?.blocks[0]
  if (block === undefined) throw new Error('the fixture has no block')
  return block
}

/** The same block's earlier attempt, as `conditioning_history` answers it. */
function attemptAt(
  block: BlockProgress,
  overrides: Partial<ConditioningHistoryRow> = {},
): ConditioningHistoryRow {
  return {
    session_id: fixtureId('9', 1),
    session_date: '2026-09-20',
    effective_intensity: 7,
    goal_preset: null,
    section_id: fixtureId('9', 2),
    section_order: 0,
    block_id: EARLIER_BLOCK,
    block_order: 0,
    structure_type: block.structureType,
    rep_scheme: block.repScheme,
    timer_type: block.timerType,
    timer_seconds: block.timerSeconds,
    rounds: block.rounds,
    round_rest_seconds: block.roundRestSeconds,
    elapsed_seconds: null,
    completed_under_cap: null,
    rounds_completed: null,
    partial_round_reps: null,
    minutes_completed: null,
    highest_rung: null,
    perceived_effort: 6,
    scored_at: '2026-09-20T10:30:00.000Z',
    prescriptions: block.exercises.map((exercise) => exercise.prescription),
    ...overrides,
  }
}

function history(...rows: ConditioningHistoryRow[]): readonly ConditioningSectionRead[] {
  return conditioningSections(rows)
}

/** An 8-minute AMRAP of 3 × 8 back squats: 24 reps a round. */
const AMRAP = blockOf({ structureType: 'amrap', timerSeconds: 480 })
const TWO_ROUNDS: BlockOutcome = { roundsCompleted: 2, elapsedSeconds: 480 }

// ─────────────────────────────────────────────────────────────────────────────
// The normalized score, per format
// ─────────────────────────────────────────────────────────────────────────────

describe('the normalized score per timed section', () => {
  it('scores an AMRAP in reps per minute', () => {
    const { score } = likeForLike(AMRAP, TWO_ROUNDS, [])
    expect(score).toMatchObject({ unit: 'reps_per_minute', value: 6, label: '6 reps/min' })
  })

  it('scores a finished For Time in reps per minute of its elapsed time', () => {
    const block = blockOf({ structureType: 'for_time', timerSeconds: 900, rounds: 2 })
    // 2 rounds × 24 reps in 4 minutes.
    const finished: BlockOutcome = { elapsedSeconds: 240, completedUnderCap: true }
    expect(likeForLike(block, finished, []).score).toMatchObject({
      unit: 'reps_per_minute',
      value: 12,
      completedUnderCap: true,
    })
  })

  it('scores an EMOM as the share of its minutes survived', () => {
    const block = blockOf({ structureType: 'emom', timerSeconds: 600 })
    const { score } = likeForLike(block, { minutesCompleted: 8 }, [])
    expect(score).toMatchObject({ unit: 'completion_ratio', value: 0.8, label: '8 of 10 min' })
  })

  it('scores a ladder by the rung it reached', () => {
    const block = blockOf({
      structureType: 'for_time',
      repScheme: 'ladder_up',
      exercises: [
        {
          status: 'not_started',
          prescription: {
            target_kind: 'sequence',
            target_value: null,
            target_sequence: [2, 4, 6],
          },
        },
      ],
    })
    const { score } = likeForLike(block, { highestRung: 3 }, [])
    expect(score).toMatchObject({ unit: 'rung', value: 3, label: 'Rung 3' })
  })

  it('scores nothing, and says nothing, for a block §3 does not score', () => {
    const block = blockOf({ structureType: 'standard' })
    expect(likeForLike(block, {}, [])).toEqual({ score: null, comparison: null, absence: null })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The comparison, and its absence
// ─────────────────────────────────────────────────────────────────────────────

describe('the like-for-like comparison', () => {
  it('compares an identical repeat against the best earlier attempt', () => {
    const earlier = attemptAt(AMRAP, { rounds_completed: 1 })
    const read = likeForLike(AMRAP, TWO_ROUNDS, history(earlier))
    expect(read.absence).toBeNull()
    expect(read.comparison).toMatchObject({
      direction: 'ahead',
      label: 'Previous best 3 reps/min',
      attempts: 1,
    })
  })

  it('never compares across a different composition, and says why', () => {
    const differs = [
      attemptAt(AMRAP, { rounds_completed: 1, timer_seconds: 600 }),
      attemptAt(AMRAP, {
        rounds_completed: 1,
        prescriptions: [
          { ...attemptAt(AMRAP).prescriptions[0]!, exercise_id: 'kettlebell-swing' },
        ],
      }),
    ]
    for (const row of differs) {
      expect(likeForLike(AMRAP, TWO_ROUNDS, history(row))).toMatchObject({
        comparison: null,
        absence: 'different_composition',
      })
    }
  })

  it('calls a first attempt a first attempt rather than comparing against nothing', () => {
    expect(likeForLike(AMRAP, TWO_ROUNDS, [])).toMatchObject({
      comparison: null,
      absence: 'first_attempt',
    })
  })

  it('does not compare an attempt with itself once it has been written', () => {
    const itself = attemptAt(AMRAP, { block_id: AMRAP.blockId, rounds_completed: 2 })
    expect(likeForLike(AMRAP, TWO_ROUNDS, history(itself))).toMatchObject({
      comparison: null,
      absence: 'first_attempt',
    })
  })

  it('claims nothing about history it does not have — loading, error or signed out', () => {
    expect(likeForLike(AMRAP, TWO_ROUNDS, null)).toMatchObject({
      comparison: null,
      absence: null,
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// What renders
// ─────────────────────────────────────────────────────────────────────────────

describe('ConditioningScoreLine', () => {
  it('renders the score and the comparison, in words', () => {
    const earlier = attemptAt(AMRAP, { rounds_completed: 1 })
    const read = likeForLike(AMRAP, TWO_ROUNDS, history(earlier))
    render(<ConditioningScoreLine {...read} />)

    expect(screen.getByText('Score: 6 reps/min')).toBeInTheDocument()
    expect(
      screen.getByText('Previous best 3 reps/min · Ahead of your previous best'),
    ).toBeInTheDocument()
  })

  it('states that there is nothing like-for-like to compare', () => {
    const other = attemptAt(AMRAP, { timer_seconds: 600, rounds_completed: 1 })
    render(<ConditioningScoreLine {...likeForLike(AMRAP, TWO_ROUNDS, history(other))} />)

    expect(screen.getByText(ABSENCE_WORDS.different_composition)).toBeInTheDocument()
    expect(screen.queryByText(/Previous best/)).not.toBeInTheDocument()
  })

  it('states a first attempt as one', () => {
    render(<ConditioningScoreLine {...likeForLike(AMRAP, TWO_ROUNDS, [])} />)

    expect(screen.getByText(ABSENCE_WORDS.first_attempt)).toBeInTheDocument()
    expect(screen.queryByText(/Previous best/)).not.toBeInTheDocument()
  })

  it('renders the score alone when the history is not in hand', () => {
    const { container } = render(
      <ConditioningScoreLine {...likeForLike(AMRAP, TWO_ROUNDS, null)} />,
    )

    expect(screen.getByText('Score: 6 reps/min')).toBeInTheDocument()
    expect(container.querySelectorAll('p')).toHaveLength(1)
  })

  it('renders nothing for a block with no score', () => {
    const { container } = render(<ConditioningScoreLine score={null} absence="first_attempt" />)
    expect(container).toBeEmptyDOMElement()
  })
})
