/**
 * HIST-01's detail derivation. Two acceptance criteria are checked here rather
 * than through the screen, because they are statements about the reading and
 * not about the markup: *all six structure types with their logged outcomes*,
 * and *weight/reps/RPE per set*.
 *
 * Every fixture is a `session_as_performed` payload built by
 * `reconstructionFixture`, so what these tests read is the shape the database
 * answers with — never a snapshot filtered into a fourth reconstruction.
 */
import { describe, expect, it } from 'vitest'

import type { Enums } from '../data/database.types'
import { reconstructionFixture, type BlockFixture } from '../test/workout-double'
import {
  blockOutcome,
  loggedSet,
  prescriptionLineage,
  sessionDetail,
} from './session-detail'
import {
  sessionReconstructionSchema,
  type ExerciseSetLogRow,
  type WorkoutExerciseRow,
} from './schemas'

/** One block, one section: the shortest fixture a structure can be read from. */
function oneBlock(block: BlockFixture) {
  return reconstructionFixture({ sections: [{ title: 'Work', blocks: [block] }] })
}

/** The first block of the first section, as the view derives it. */
function firstBlock(payload: ReturnType<typeof reconstructionFixture>) {
  return sessionDetail(payload).sections[0].blocks[0]
}

describe('the payload it reads', () => {
  it('is one the boundary schema accepts, so the fixture is not a fourth shape', () => {
    const parsed = sessionReconstructionSchema.safeParse(
      reconstructionFixture({
        // The shared fixture user id is a readable stand-in rather than a uuid,
        // and `workout_sessions.user_id` is `z.uuid()`. Supplied here because
        // what this test is about is the payload's *shape*.
        session: { user_id: '22222222-2222-4222-8222-222222222222' },
        sections: [{ title: 'Work', blocks: [{ result: { perceived_effort: 7 } }] }],
      }),
    )

    expect(parsed.success ? [] : parsed.error.issues).toEqual([])
    expect(parsed.success).toBe(true)
  })

  it('states which question it answers, and when it resolves', () => {
    const view = sessionDetail(
      reconstructionFixture({ asOf: '2026-09-24T09:00:00+00:00' }),
    )

    expect(view.provenance.kind).toBe('performed')
    expect(view.provenance.label).toBe('As performed')
    expect(view.provenance.asOf).not.toBeNull()
    expect(view.provenance.asOf).toContain('2026')
  })

  it('keeps a null as_of as a null rather than inventing an instant', () => {
    const view = sessionDetail(
      reconstructionFixture({ reconstruction: 'intended_at_start', asOf: null }),
    )

    expect(view.provenance.label).toBe('As intended at start')
    expect(view.provenance.asOf).toBeNull()
  })
})

describe('the session it describes', () => {
  it('reads the debrief off the session row', () => {
    const view = sessionDetail(
      reconstructionFixture({
        session: { mood: 4, session_notes: 'Legs heavy, moved well after set two.' },
      }),
    )

    expect(view.mood?.value).toBe(4)
    expect(view.mood?.label).toBe('Ready')
    expect(view.notes).toBe('Legs heavy, moved well after set two.')
  })

  it('reports an unanswered debrief as unanswered, not as a neutral rating', () => {
    const view = sessionDetail(reconstructionFixture())

    expect(view.mood).toBeNull()
    expect(view.notes).toBeNull()
  })

  it('treats a whitespace note as no note', () => {
    const view = sessionDetail(reconstructionFixture({ session: { session_notes: '   ' } }))

    expect(view.notes).toBeNull()
  })

  it('prefers the measured duration over the generator’s estimate', () => {
    const measured = sessionDetail(
      reconstructionFixture({
        session: { actual_duration_mins: 47, computed_duration_mins: 45 },
      }),
    )
    const estimated = sessionDetail(
      reconstructionFixture({
        session: { actual_duration_mins: null, computed_duration_mins: 45 },
      }),
    )
    const neither = sessionDetail(reconstructionFixture())

    expect(measured.duration).toBe('47 min')
    expect(estimated.duration).toBe('45 min')
    // A session that was never timed has no duration. `0 min` would be a claim.
    expect(neither.duration).toBeNull()
  })

  it('names the state in words and carries the session’s own day and focus', () => {
    const view = sessionDetail(
      reconstructionFixture({
        state: 'completed',
        session: { date: '2026-09-24', session_focus: 'lower_body' },
      }),
    )

    expect(view.stateLabel).toBe('Completed')
    expect(view.day).toContain('Sep')
    expect(view.focus).toBe('Lower body')
  })

  it('counts every logged set in the session', () => {
    const view = sessionDetail(
      reconstructionFixture({
        sections: [
          {
            title: 'Primary lift',
            blocks: [
              {
                exercises: [
                  { setLogs: [{ actual_reps: 8 }, { actual_reps: 6 }] },
                  { setLogs: [{ actual_reps: 10 }] },
                ],
              },
            ],
          },
        ],
      }),
    )

    expect(view.loggedSetCount).toBe(3)
  })
})

describe('all six structure types, with their logged outcomes', () => {
  it('reads a standard block through its sets rather than a structural score', () => {
    const block = firstBlock(
      oneBlock({
        structureType: 'standard',
        result: { perceived_effort: 8 },
        exercises: [{ setLogs: [{ actual_reps: 5, weight: 100 }] }],
      }),
    )

    expect(block.identity.label).toBe('STANDARD')
    expect(block.scored).toBe(true)
    expect(block.outcome).toEqual([])
    expect(block.perceivedEffort).toBe('8 of 10')
    expect(block.exercises[0].sets).toHaveLength(1)
  })

  it('reads a superset the same way, and says who scored it', () => {
    const block = firstBlock(
      oneBlock({
        structureType: 'superset',
        result: { perceived_effort: 6, notes: 'Second pair was the hard one.' },
        exercises: ['completed', 'completed'],
      }),
    )

    expect(block.identity.label).toBe('SUPERSET')
    expect(block.outcome).toEqual([])
    expect(block.perceivedEffort).toBe('6 of 10')
    expect(block.notes).toBe('Second pair was the hard one.')
  })

  it('reads a circuit for its rounds, against the rounds it prescribed', () => {
    const block = firstBlock(
      oneBlock({
        structureType: 'circuit',
        rounds: 5,
        result: { rounds_completed: 4, elapsed_seconds: 432, perceived_effort: 9 },
      }),
    )

    expect(block.outcome).toEqual([
      { label: 'Rounds', value: '4 of 5' },
      { label: 'Elapsed', value: '07:12' },
    ])
  })

  it('reads an EMOM for its minutes, against the window it prescribed', () => {
    const block = firstBlock(
      oneBlock({
        structureType: 'emom',
        timerSeconds: 600,
        result: { minutes_completed: 9 },
      }),
    )

    expect(block.identity.label).toBe('EMOM')
    expect(block.outcome).toEqual([{ label: 'Minutes', value: '9 of 10' }])
  })

  it('reads an AMRAP for its rounds and the part of the last one', () => {
    const block = firstBlock(
      oneBlock({
        structureType: 'amrap',
        timerSeconds: 720,
        result: { rounds_completed: 6, partial_round_reps: 4 },
      }),
    )

    expect(block.outcome).toEqual([
      { label: 'Rounds', value: '6' },
      { label: 'Partial round', value: '4 reps' },
    ])
  })

  it('reads a For Time block for its time and whether the cap stopped it', () => {
    const under = firstBlock(
      oneBlock({
        structureType: 'for_time',
        timerSeconds: 600,
        result: { elapsed_seconds: 512, completed_under_cap: true },
      }),
    )
    const capped = firstBlock(
      oneBlock({
        structureType: 'for_time',
        timerSeconds: 600,
        result: { elapsed_seconds: 600, completed_under_cap: false },
      }),
    )

    expect(under.outcome).toEqual([
      { label: 'Elapsed', value: '08:32' },
      { label: 'Cap', value: 'Finished under the cap' },
    ])
    // The words carry it, not a colour.
    expect(capped.outcome[1]).toEqual({ label: 'Cap', value: 'Stopped at the cap' })
  })

  it('reads a ladder’s rung, which is its rep scheme rather than a seventh structure', () => {
    const block = firstBlock(
      oneBlock({
        structureType: 'for_time',
        repScheme: 'ladder_down',
        timerSeconds: 600,
        result: { highest_rung: 5, elapsed_seconds: 600, completed_under_cap: false },
      }),
    )

    expect(block.identity.repScheme).toBe('LADDER DOWN')
    expect(block.outcome[0]).toEqual({ label: 'Highest rung', value: '5' })
    expect(block.outcome).toHaveLength(3)
  })

  it('covers every structure type the enum has', () => {
    const types: Enums<'structure_type'>[] = [
      'standard',
      'superset',
      'circuit',
      'emom',
      'amrap',
      'for_time',
    ]

    for (const structureType of types) {
      const payload = oneBlock({ structureType, result: { perceived_effort: 5 } })
      const block = firstBlock(payload)

      // Total over the enum: every type derives an identity and an outcome
      // list, and none of them throws on a result with nothing but effort in it.
      expect(block.identity.label.length, structureType).toBeGreaterThan(0)
      expect(Array.isArray(block.outcome), structureType).toBe(true)
      expect(block.perceivedEffort, structureType).toBe('5 of 10')
    }
  })

  it('says a block was never scored rather than scoring it zero', () => {
    const block = firstBlock(oneBlock({ structureType: 'circuit', rounds: 5 }))

    expect(block.scored).toBe(false)
    expect(block.outcome).toEqual([])
    expect(block.perceivedEffort).toBeNull()
    expect(block.notes).toBeNull()
  })

  it('distinguishes a round nobody got from a structure with no rounds', () => {
    const none = blockOutcome(
      { ...blockRow('circuit'), rounds: 5 },
      { ...resultRow(), rounds_completed: 0 },
    )
    const notMeasured = blockOutcome(
      { ...blockRow('circuit'), rounds: 5 },
      { ...resultRow(), rounds_completed: null },
    )

    expect(none).toEqual([{ label: 'Rounds', value: '0 of 5' }])
    expect(notMeasured).toEqual([])
  })
})

describe('set logs', () => {
  it('displays weight, reps and RPE per set', () => {
    const block = firstBlock(
      oneBlock({
        exercises: [
          {
            setLogs: [
              { set_number: 1, actual_reps: 8, weight: 60, weight_unit: 'kg', rpe: 7 },
              { set_number: 2, actual_reps: 6, weight: 67.5, weight_unit: 'kg', rpe: 8.5 },
            ],
          },
        ],
      }),
    )

    expect(block.exercises[0].sets).toEqual([
      expect.objectContaining({
        setNumber: 1,
        reps: '8 reps',
        weight: '60 kg',
        rpe: 'RPE 7',
      }),
      expect.objectContaining({
        setNumber: 2,
        reps: '6 reps',
        weight: '67.5 kg',
        rpe: 'RPE 8.5',
      }),
    ])
  })

  it('leaves a column that was not logged empty instead of zero', () => {
    const view = loggedSet(setLogRow({ actual_reps: null, weight: null, rpe: null }))

    expect(view.reps).toBeNull()
    expect(view.weight).toBeNull()
    expect(view.rpe).toBeNull()
  })

  it('reads a bodyweight set as reps with no load', () => {
    const view = loggedSet(setLogRow({ actual_reps: 12, weight: null, rpe: 6 }))

    expect(view.reps).toBe('12 reps')
    expect(view.weight).toBeNull()
    expect(view.rpe).toBe('RPE 6')
  })

  it('reads the time and distance modalities off their own columns', () => {
    const view = loggedSet(
      setLogRow({
        actual_reps: null,
        actual_duration_seconds: 45,
        actual_distance: 400,
        actual_distance_unit: 'm',
      }),
    )

    expect(view.duration).toBe('45s')
    expect(view.distance).toBe('400 m')
  })

  it('keeps the unit the row was logged in', () => {
    const view = loggedSet(setLogRow({ weight: 135, weight_unit: 'lb' }))

    expect(view.weight).toBe('135 lb')
  })

  it('marks a warmup set as one', () => {
    expect(loggedSet(setLogRow({ is_warmup_set: true })).isWarmup).toBe(true)
    expect(loggedSet(setLogRow({})).isWarmup).toBe(false)
  })

  it('names the singular set honestly', () => {
    expect(loggedSet(setLogRow({ actual_reps: 1 })).reps).toBe('1 rep')
  })
})

describe('what happened to a prescription', () => {
  it('reads a generated row as prescribed, with no label to add', () => {
    const view = prescriptionLineage(exerciseRow({}))

    expect(view).toBe('prescribed')
  })

  it('reads the row that replaced one as swapped in', () => {
    expect(
      prescriptionLineage(
        exerciseRow({ origin: 'revised', replaces_id: '11111111-1111-4111-8111-111111111111' }),
      ),
    ).toBe('substituted')
  })

  it('keeps a superseded prescription that carries logged work, marked as swapped out', () => {
    const block = firstBlock(
      oneBlock({
        exercises: [
          { prescription: { revision_status: 'active', origin: 'revised' } },
          {
            prescription: { revision_status: 'superseded', superseded_at: '2026-09-24T09:15:00+00:00' },
            setLogs: [{ actual_reps: 8, weight: 50, rpe: 7 }],
          },
        ],
      }),
    )

    expect(block.exercises.map((exercise) => exercise.lineageLabel)).toEqual([
      'Swapped in',
      'Swapped out',
    ])
    // The work under the swapped-out row is the D6 case: it stays readable.
    expect(block.exercises[1].sets).toHaveLength(1)
  })

  it('states each prescription’s execution in words', () => {
    const block = firstBlock(
      oneBlock({ exercises: ['completed', 'skipped', 'not_started'] }),
    )

    expect(block.exercises.map((exercise) => exercise.statusLabel)).toEqual([
      'Done',
      'Skipped',
      'Not logged',
    ])
  })

  it('reads the prescription it was asked for off the row', () => {
    const block = firstBlock(
      oneBlock({ exercises: [{ prescription: { sets: 4, target_value: 6 } }] }),
    )

    expect(block.exercises[0].prescription).toBe('4 × 6 reps')
    expect(block.exercises[0].name).toBe('back squat')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Rows, for the three functions that take one directly
// ─────────────────────────────────────────────────────────────────────────────

function blockRow(structureType: Enums<'structure_type'>) {
  return reconstructionFixture({
    sections: [{ blocks: [{ structureType }] }],
  }).sections[0].blocks[0].block
}

function resultRow() {
  return {
    ...reconstructionFixture({
      sections: [{ blocks: [{ result: {} }] }],
    }).sections[0].blocks[0].block_result!,
  }
}

function setLogRow(overrides: Partial<ExerciseSetLogRow>): ExerciseSetLogRow {
  const payload = reconstructionFixture({
    sections: [{ blocks: [{ exercises: [{ setLogs: [overrides] }] }] }],
  })

  return payload.sections[0].blocks[0].exercises[0].set_logs[0]
}

function exerciseRow(overrides: Partial<WorkoutExerciseRow>) {
  const payload = reconstructionFixture({
    sections: [{ blocks: [{ exercises: [{ prescription: overrides }] }] }],
  })

  return payload.sections[0].blocks[0].exercises[0].exercise
}
