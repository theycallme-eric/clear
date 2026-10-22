/**
 * EXE-04a — "rungs render from `target_sequence` as ordered targets, and
 * nothing parses a string", asserted where the rungs are derived rather than
 * where they are drawn.
 *
 * The fixtures set `target_sequence` — the `int[]` column — and never a
 * pattern string, because there is no pattern string in this schema to set.
 * What is checked is that the order survives, that the rung *number* and the
 * rung *target* stay separate things, and that a malformed block degrades to a
 * shorter ladder instead of throwing the session away.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import type { Enums } from '../data/database.types'
import { Constants } from '../data/database.types'
import { snapshotFixture, type ExerciseFixture } from '../test/workout-double'
import {
  explicitLadderTiming,
  isLadderScheme,
  ladderCapSeconds,
  ladderMovements,
  ladderRoundPlan,
  ladderRungs,
  ladderUnit,
  rungLabel,
  rungNumbers,
  scheduledRoundAt,
} from './ladder'
import { LADDER_TIMING_MODES, workoutBlockRowSchema, type LadderTiming } from './schemas'
import { sessionProgress, type BlockProgress, type ExerciseProgress } from './workout-progress'

/** The block's active prescriptions, as the shell hands them to a renderer. */
function movements(
  exercises: ExerciseFixture[],
  repScheme: Enums<'rep_scheme'> = 'ladder_down',
): readonly ExerciseProgress[] {
  const snapshot = snapshotFixture({
    sections: [
      { blocks: [{ structureType: 'for_time', repScheme, timerSeconds: 480, exercises }] },
    ],
  })
  const block = sessionProgress(snapshot).sections[0]?.blocks[0]
  if (block === undefined) throw new Error('the fixture built no block')
  return block.exercises
}

/** A sequence-targeted prescription: the shape `CONSTRAINT target_shape` admits. */
function sequence(
  exerciseId: string,
  rungs: number[],
  overrides: ExerciseFixture['prescription'] = {},
): ExerciseFixture {
  return {
    prescription: {
      exercise_id: exerciseId,
      target_kind: 'sequence',
      target_value: null,
      target_sequence: rungs,
      ...overrides,
    },
  }
}

describe('which rep schemes are ladders', () => {
  it('names every scheme the quickfix spec applies the treatment to', () => {
    expect(isLadderScheme('ladder_up')).toBe(true)
    expect(isLadderScheme('ladder_down')).toBe(true)
    expect(isLadderScheme('pyramid')).toBe(true)
    expect(isLadderScheme('inverse')).toBe(true)
    // A ladder with a companion movement between its rungs is still a ladder.
    expect(isLadderScheme('ladder_fixed_interval')).toBe(true)
  })

  it('is not a ladder for fixed, nor for a scheme with no sequence to index', () => {
    expect(isLadderScheme('fixed')).toBe(false)
    // "Add one each round until failure" prescribes no sequence — its rungs are
    // discovered by performing it, so there is no int array to render.
    expect(isLadderScheme('n_plus_one')).toBe(false)
  })

  it('answers for every scheme the database admits', () => {
    for (const scheme of Constants.public.Enums.rep_scheme) {
      expect(typeof isLadderScheme(scheme)).toBe('boolean')
    }
  })
})

describe('rungs come from the int array, in the order it holds them', () => {
  it('indexes target_sequence and keeps its order', () => {
    const rungs = ladderRungs(movements([sequence('burpee', [15, 12, 9, 6, 3])]))

    expect(rungs).toEqual([
      { number: 1, targets: [15] },
      { number: 2, targets: [12] },
      { number: 3, targets: [9] },
      { number: 4, targets: [6] },
      { number: 5, targets: [3] },
    ])
  })

  it('keeps a pyramid’s repeated targets as separate rungs', () => {
    // 6 appears twice, and the two are different rungs: `highest_rung` 3 and 5
    // are different facts about how far the user got.
    const rungs = ladderRungs(movements([sequence('push-up', [2, 4, 6, 8, 6, 4, 2])], 'pyramid'))

    expect(rungs.map((rung) => rung.number)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(rungs.map(rungNumbers)).toEqual(['2', '4', '6', '8', '6', '4', '2'])
  })

  it('states one number when the movements share the sequence', () => {
    const rungs = ladderRungs(
      movements([
        sequence('kettlebell-swing', [10, 8, 6], { order_index: 0 }),
        sequence('push-up', [10, 8, 6], { order_index: 1 }),
      ]),
    )

    // Two movements, one ladder: the rung is `10`, not `10 / 10`.
    expect(rungs.map(rungNumbers)).toEqual(['10', '8', '6'])
  })

  it('states both numbers for an inverse pair climbing opposite ways', () => {
    const rungs = ladderRungs(
      movements(
        [
          sequence('pull-up', [10, 9, 8], { order_index: 0 }),
          sequence('burpee', [1, 2, 3], { order_index: 1 }),
        ],
        'inverse',
      ),
    )

    expect(rungs.map(rungNumbers)).toEqual(['10 / 1', '9 / 2', '8 / 3'])
  })

  it('has no rungs for a block that prescribes no sequence at all', () => {
    expect(
      ladderRungs(movements([{ prescription: { exercise_id: 'back-squat' } }])),
    ).toEqual([])
  })

  it('degrades to the longer ladder when two sequences disagree in length', () => {
    const rungs = ladderRungs(
      movements([
        sequence('pull-up', [5, 4, 3], { order_index: 0 }),
        sequence('dip', [5, 4], { order_index: 1 }),
      ]),
    )

    // The third rung is still a rung; the movement that ran out contributes
    // nothing to it. A malformed block is a shorter ladder, never a throw.
    expect(rungs.map(rungNumbers)).toEqual(['5', '4', '3'])
  })
})

describe('a rung is identified by its target, not by its index', () => {
  it('labels the rung with the number the user is looking at', () => {
    const rungs = ladderRungs(movements([sequence('burpee', [15, 12, 9])]))

    expect(rungLabel(rungs[1], 'reps')).toBe('12 reps')
    // The rung *number* is what the row records, and it is not the label.
    expect(rungs[1].number).toBe(2)
  })

  it('labels in the modality’s own unit, never reps by default', () => {
    const held = movements([
      sequence('plank', [60, 45, 30], { modality: 'time' }),
    ])

    expect(ladderUnit(held)).toBe('sec')
    expect(rungLabel(ladderRungs(held)[0], ladderUnit(held))).toBe('60 sec')
  })

  it('claims no unit when the block’s movements disagree about one', () => {
    const mixed = movements([
      sequence('row', [400, 300], { modality: 'distance', distance_unit: 'm', order_index: 0 }),
      sequence('burpee', [10, 8], { order_index: 1 }),
    ])

    expect(ladderUnit(mixed)).toBe('')
    expect(rungLabel(ladderRungs(mixed)[0], ladderUnit(mixed))).toBe('400 / 10')
  })
})

describe('a fixed-interval ladder divides into the ladder and its companion', () => {
  it('separates the sequence movement from the movement done between rungs', () => {
    const exercises = movements(
      [
        sequence('push-up', [2, 4, 6, 8], { order_index: 0 }),
        {
          prescription: {
            exercise_id: 'burpee',
            order_index: 1,
            target_kind: 'fixed',
            target_value: 4,
          },
        },
      ],
      'ladder_fixed_interval',
    )

    const { laddered, interval } = ladderMovements(exercises)

    expect(laddered.map((entry) => entry.prescription.exercise_id)).toEqual(['push-up'])
    expect(interval.map((entry) => entry.prescription.exercise_id)).toEqual(['burpee'])
    // The companion's fixed target is not a rung: the ladder is 2-4-6-8.
    expect(ladderRungs(exercises).map(rungNumbers)).toEqual(['2', '4', '6', '8'])
  })
})

describe('explicit ladder timing, as execution state reads it (REQ-018, E03)', () => {
  /** A rung sequence of `rounds` length, with a fixed companion every round. */
  function timedBlock(
    timing: LadderTiming | null | undefined,
    structureType: Enums<'structure_type'>,
    rounds: number,
    timerSeconds: number,
  ): BlockProgress {
    const snapshot = snapshotFixture({
      sections: [
        {
          blocks: [
            {
              structureType,
              repScheme: 'ladder_fixed_interval',
              timerSeconds,
              exercises: [
                sequence(
                  'push-up',
                  Array.from({ length: rounds }, (_, index) => 3 * (index + 1)),
                  { order_index: 0 },
                ),
                {
                  prescription: {
                    exercise_id: 'burpee',
                    order_index: 1,
                    target_kind: 'fixed',
                    target_value: 4,
                  },
                },
              ],
            },
          ],
        },
      ],
    })
    const stored = snapshot.sections[0]?.blocks[0]
    if (stored === undefined) throw new Error('the fixture built no stored block')
    // Task-local timing fixture: keep the shared workout factory unchanged.
    if (timing !== undefined) stored.block.ladder_timing = timing
    const block = sessionProgress(snapshot).sections[0]?.blocks[0]
    if (block === undefined) throw new Error('the fixture built no block')
    return block
  }

  const scheduled = (rounds: number, interval: number): LadderTiming => ({
    mode: 'scheduled_starts',
    rounds,
    interval_seconds: interval,
    cap_seconds: null,
  })
  const freePaced = (rounds: number): LadderTiming => ({
    mode: 'for_time',
    rounds,
    interval_seconds: null,
    cap_seconds: null,
  })
  const capped = (rounds: number, cap: number): LadderTiming => ({
    mode: 'capped_window',
    rounds,
    interval_seconds: null,
    cap_seconds: cap,
  })

  it('carries the stored timing onto the block, and nothing onto a legacy one', () => {
    const timing = scheduled(4, 75)
    expect(timedBlock(timing, 'emom', 4, 300).ladderTiming).toEqual(timing)
    expect(explicitLadderTiming(timedBlock(timing, 'emom', 4, 300))).toEqual(timing)

    for (const legacy of [undefined, null]) {
      const block = timedBlock(legacy, 'for_time', 4, 600)
      expect(block.ladderTiming).toBeNull()
      expect(explicitLadderTiming(block)).toBeNull()
    }
  })

  it('reads every mode the stored-row schema admits', () => {
    expect([...LADDER_TIMING_MODES].sort()).toEqual(['capped_window', 'for_time', 'scheduled_starts'])
    for (const timing of [scheduled(3, 90), freePaced(3), capped(3, 240)]) {
      expect(workoutBlockRowSchema.shape.ladder_timing.safeParse(timing).success).toBe(true)
    }
  })

  it.each([
    [2, 45],
    [4, 75],
    [6, 150],
    [9, 240],
  ])('precomputes %i scheduled rounds every %is: start, target and companion work', (rounds, interval) => {
    const block = timedBlock(scheduled(rounds, interval), 'emom', rounds, rounds * interval)
    const timing = explicitLadderTiming(block)
    if (timing === null) throw new Error('the scheduled fixture lost its timing')

    const plan = ladderRoundPlan(block.exercises, timing)

    expect(plan).toHaveLength(rounds)
    plan.forEach((round, index) => {
      expect(round.number).toBe(index + 1)
      expect(round.startSeconds).toBe(index * interval)
      expect(round.rung?.targets).toEqual([3 * (index + 1)])
      // The fixed companion is stated with every round — never left out.
      expect(round.companions.map((entry) => entry.prescription.exercise_id)).toEqual(['burpee'])
    })
  })

  it.each([3, 5, 8])('reads a scheduled round from the block clock alone (%i rounds)', (rounds) => {
    const interval = 70
    const timing = scheduled(rounds, interval)

    expect(scheduledRoundAt(timing, 0)).toBe(1)
    expect(scheduledRoundAt(timing, interval - 1)).toBe(1)
    expect(scheduledRoundAt(timing, interval)).toBe(2)
    expect(scheduledRoundAt(timing, rounds * interval - 1)).toBe(rounds)
    // Past the schedule there is no round, rather than a clamped last one.
    expect(scheduledRoundAt(timing, rounds * interval)).toBeNull()
    expect(scheduledRoundAt(timing, -1)).toBeNull()
  })

  it.each([2, 6, 12])('never infers free-paced For Time progress from elapsed time (%i rounds)', (rounds) => {
    const timing = freePaced(rounds)
    for (const elapsed of [0, 30, 600, 10_000]) {
      expect(scheduledRoundAt(timing, elapsed)).toBeNull()
    }
    const plan = ladderRoundPlan(timedBlock(timing, 'for_time', rounds, 900).exercises, timing)
    expect(plan).toHaveLength(rounds)
    expect(plan.every((round) => round.startSeconds === null)).toBe(true)
    expect(ladderCapSeconds(timing)).toBeNull()
  })

  it.each([
    [3, 150],
    [7, 600],
  ])('keeps a capped window of %i rounds unscheduled under its one %is cap', (rounds, cap) => {
    const timing = capped(rounds, cap)
    const plan = ladderRoundPlan(timedBlock(timing, 'amrap', rounds, cap).exercises, timing)

    expect(ladderCapSeconds(timing)).toBe(cap)
    expect(plan).toHaveLength(rounds)
    expect(plan.every((round) => round.startSeconds === null)).toBe(true)
    expect(scheduledRoundAt(timing, cap - 1)).toBeNull()
  })

  it('hardcodes no round count or interval, and never touches the global session clock', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'ladder.ts'), 'utf-8')
    const code = source
      .split('\n')
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join('\n')

    expect(code).not.toMatch(/\b(5|180)\b/)
    expect(code).not.toMatch(/workout-clock|Date\.now|performance\.now|setInterval|setTimeout/)
  })
})
