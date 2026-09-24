/**
 * EXE-02 — the set vocabulary, which is where "persists reps, load/time, unit"
 * is decided.
 *
 * Everything here is pure: the row a performed set maps to, the measurements
 * the table would refuse, and what the next set starts prefilled from. It is
 * worth its own file because `setLogInsert` is the only mapping in the app that
 * builds an `exercise_set_logs` row, so a column that quietly stops being
 * written stops being written for every structure at once.
 *
 * The distinction the assertions keep returning to is DATA_MODEL §8's: an
 * omitted measurement is `null`, a performed one is its number, and `0` is the
 * second of those. A test that only checked `8 reps` round-trips would pass on
 * an implementation that turned every absence into a zero nobody performed.
 */
import { describe, expect, it } from 'vitest'

import type { ExerciseSetLogRow } from './schemas'
import {
  loggedSetFromEntry,
  loggedSetFromRow,
  prefillFrom,
  RPE_MAX,
  RPE_MIN,
  setLogInsert,
  setLogViolation,
  type LoggedSet,
  type PerformedSet,
  type SetLogEntry,
} from './set-logging'

const SET_LOG_ID = 'a0000001-0000-4000-8000-000000000000'
const EXERCISE_ID = '80000001-0000-4000-8000-000000000000'
const BLOCK_ID = '70000001-0000-4000-8000-000000000000'

/** An entry carrying exactly the measurements a case is about. */
function entry(performed: PerformedSet, overrides: Partial<SetLogEntry> = {}): SetLogEntry {
  return {
    id: SET_LOG_ID,
    exerciseId: EXERCISE_ID,
    blockId: BLOCK_ID,
    distanceUnit: null,
    weightUnit: 'kg',
    performed,
    ...overrides,
  }
}

/** A stored row, defaulting to the all-null set nothing was recorded against. */
function row(overrides: Partial<ExerciseSetLogRow> = {}): ExerciseSetLogRow {
  return {
    id: SET_LOG_ID,
    workout_exercise_id: EXERCISE_ID,
    prescription_revision_status: 'active',
    set_number: 1,
    actual_reps: null,
    actual_duration_seconds: null,
    actual_distance: null,
    actual_distance_unit: null,
    weight: null,
    weight_unit: 'kg',
    rpe: null,
    is_warmup_set: false,
    created_at: '2026-09-24T09:10:00+00:00',
    ...overrides,
  }
}

/** A logged set, for the prefill cases, which care about four fields. */
function logged(overrides: Partial<LoggedSet> = {}): LoggedSet {
  return { ...loggedSetFromRow(row()), ...overrides }
}

describe('the row a performed set maps to', () => {
  it('carries the identity the set was performed under', () => {
    const insert = setLogInsert(entry({ setNumber: 2, reps: 8 }))

    // The id is minted by the caller (EXE-07's retry) and the row is attributed
    // to the prescription, which is the only exercise column the table has.
    expect(insert.id).toBe(SET_LOG_ID)
    expect(insert.workout_exercise_id).toBe(EXERCISE_ID)
    expect(insert.set_number).toBe(2)
  })

  it('stamps the unit in force at write time on the row itself', () => {
    expect(setLogInsert(entry({ setNumber: 1, weight: 60 })).weight_unit).toBe('kg')
    expect(
      setLogInsert(entry({ setNumber: 1, weight: 135 }, { weightUnit: 'lb' })).weight_unit,
    ).toBe('lb')
  })

  it('writes the unit even for a set that carried no weight', () => {
    // `weight_unit` is NOT NULL: a bodyweight set still says which unit the
    // session was recorded in, so a later preference change cannot reinterpret
    // the sets around it.
    const insert = setLogInsert(entry({ setNumber: 1, reps: 12 }))

    expect(insert.weight).toBeNull()
    expect(insert.weight_unit).toBe('kg')
  })

  it.each([
    ['reps', { setNumber: 1, reps: 8 }, 'actual_reps' as const, 8],
    ['time', { setNumber: 1, durationSeconds: 45 }, 'actual_duration_seconds' as const, 45],
    ['distance', { setNumber: 1, distance: 400 }, 'actual_distance' as const, 400],
  ])(
    'puts a %s measurement in its own column and leaves the other two unrecorded',
    (_modality, performed: PerformedSet, column, value) => {
      const insert = setLogInsert(
        entry(performed, { distanceUnit: performed.distance === undefined ? null : 'm' }),
      )

      expect(insert[column]).toBe(value)

      const others = (
        ['actual_reps', 'actual_duration_seconds', 'actual_distance'] as const
      ).filter((other) => other !== column)
      for (const other of others) expect(insert[other]).toBeNull()
    },
  )

  it('records an omitted measurement as null rather than zero', () => {
    const insert = setLogInsert(entry({ setNumber: 1 }))

    expect(insert.actual_reps).toBeNull()
    expect(insert.actual_duration_seconds).toBeNull()
    expect(insert.actual_distance).toBeNull()
    expect(insert.weight).toBeNull()
    expect(insert.rpe).toBeNull()
  })

  it('records a performed zero as zero, because a failed attempt is a result', () => {
    const insert = setLogInsert(entry({ setNumber: 1, reps: 0, weight: 0 }))

    expect(insert.actual_reps).toBe(0)
    expect(insert.weight).toBe(0)
  })

  it('writes the distance unit only when there is a distance to measure', () => {
    expect(
      setLogInsert(entry({ setNumber: 1, distance: 400 }, { distanceUnit: 'm' }))
        .actual_distance_unit,
    ).toBe('m')

    // A prescription can name a unit for a set that logged reps instead; a unit
    // with nothing to measure is not a measurement.
    expect(
      setLogInsert(entry({ setNumber: 1, reps: 10 }, { distanceUnit: 'm' }))
        .actual_distance_unit,
    ).toBeNull()
  })

  it('defaults the warmup flag to false rather than leaving it absent', () => {
    expect(setLogInsert(entry({ setNumber: 1, reps: 5 })).is_warmup_set).toBe(false)
    expect(
      setLogInsert(entry({ setNumber: 1, reps: 5, isWarmup: true })).is_warmup_set,
    ).toBe(true)
  })

  it('never sets the revision status the database defends the row with', () => {
    // Not client-settable (DATA-01d §6): its default is what makes the composite
    // foreign key refuse a prescription that has already been swapped out.
    expect(setLogInsert(entry({ setNumber: 1, reps: 5 }))).not.toHaveProperty(
      'prescription_revision_status',
    )
  })
})

describe('measurements the table would refuse', () => {
  it('accepts a set with nothing recorded against it', () => {
    expect(setLogViolation(entry({ setNumber: 1 }))).toBeNull()
  })

  it('accepts zero for every measurement', () => {
    expect(
      setLogViolation(
        entry(
          { setNumber: 1, reps: 0, durationSeconds: 0, distance: 0, weight: 0 },
          { distanceUnit: 'm' },
        ),
      ),
    ).toBeNull()
  })

  it.each([
    ['a set number below one', { setNumber: 0 }, 'set_number'],
    ['a fractional set number', { setNumber: 1.5 }, 'set_number'],
    ['negative reps', { setNumber: 1, reps: -1 }, 'actual_reps'],
    ['fractional reps', { setNumber: 1, reps: 8.5 }, 'actual_reps'],
    ['a negative duration', { setNumber: 1, durationSeconds: -30 }, 'actual_duration_seconds'],
    ['a negative distance', { setNumber: 1, distance: -5 }, 'actual_distance'],
    ['a negative weight', { setNumber: 1, weight: -20 }, 'weight'],
  ])('refuses %s in the caller’s vocabulary', (_case, performed: PerformedSet, field) => {
    const violation = setLogViolation(
      entry(performed, { distanceUnit: performed.distance === undefined ? null : 'm' }),
    )

    expect(violation?.field).toBe(field)
  })

  it('refuses a distance with no unit to measure it with', () => {
    expect(setLogViolation(entry({ setNumber: 1, distance: 400 }))).toEqual({
      field: 'actual_distance_unit',
    })
  })

  it.each([RPE_MIN - 1, RPE_MAX + 1])('refuses an RPE of %s', (rpe) => {
    expect(setLogViolation(entry({ setNumber: 1, rpe }))).toEqual({
      field: 'rpe',
      min: RPE_MIN,
      max: RPE_MAX,
    })
  })

  it.each([RPE_MIN, 7.5, RPE_MAX])('accepts an RPE of %s', (rpe) => {
    expect(setLogViolation(entry({ setNumber: 1, rpe }))).toBeNull()
  })
})

describe('a stored row, read back', () => {
  it('keeps every field in the unit it was recorded in', () => {
    expect(
      loggedSetFromRow(
        row({
          set_number: 3,
          actual_reps: 8,
          actual_distance: 400,
          actual_distance_unit: 'm',
          weight: 135,
          weight_unit: 'lb',
          rpe: 8,
          is_warmup_set: true,
        }),
      ),
    ).toEqual({
      setNumber: 3,
      reps: 8,
      durationSeconds: null,
      distance: 400,
      distanceUnit: 'm',
      weight: 135,
      weightUnit: 'lb',
      rpe: 8,
      isWarmup: true,
      // A row exists, so the database has this set: `logged` and nothing else.
      status: 'logged',
    })
  })

  it('reads a queued set back as the user typed it, marked unsynced', () => {
    expect(
      loggedSetFromEntry(
        {
          id: 'a0000001-0000-4000-8000-000000000000',
          exerciseId: '80000001-0000-4000-8000-000000000000',
          blockId: '70000001-0000-4000-8000-000000000000',
          distanceUnit: 'm',
          weightUnit: 'kg',
          performed: { setNumber: 2, distance: 400, rpe: 7 },
        },
        'syncing',
      ),
    ).toEqual({
      setNumber: 2,
      reps: null,
      durationSeconds: null,
      distance: 400,
      distanceUnit: 'm',
      // Not recorded is null, never zero — the same rule the insert follows.
      weight: null,
      weightUnit: 'kg',
      rpe: 7,
      isWarmup: false,
      status: 'syncing',
    })
  })
})

describe('what the next set starts from', () => {
  it('has nothing to start from when nothing has been performed', () => {
    expect(prefillFrom([])).toBeNull()
  })

  it('starts from the highest set number, whatever order they arrive in', () => {
    const sets = [
      logged({ setNumber: 1, reps: 10, weight: 60 }),
      logged({ setNumber: 3, reps: 6, weight: 80 }),
      logged({ setNumber: 2, reps: 8, weight: 70 }),
    ]

    expect(prefillFrom(sets)).toEqual({
      weight: 80,
      reps: 6,
      durationSeconds: null,
      distance: null,
    })
  })

  it('skips warmups, which are not a reference point for a working set', () => {
    const sets = [
      logged({ setNumber: 1, reps: 10, weight: 60 }),
      logged({ setNumber: 2, reps: 5, weight: 20, isWarmup: true }),
    ]

    expect(prefillFrom(sets)?.weight).toBe(60)
  })

  it('falls back to a warmup when it is all that has been performed', () => {
    const sets = [logged({ setNumber: 1, reps: 5, weight: 20, isWarmup: true })]

    expect(prefillFrom(sets)?.weight).toBe(20)
  })

  it('carries the time and distance a prior set was measured in', () => {
    const sets = [logged({ setNumber: 1, durationSeconds: 45, distance: 400 })]

    expect(prefillFrom(sets)).toEqual({
      weight: null,
      reps: null,
      durationSeconds: 45,
      distance: 400,
    })
  })
})
