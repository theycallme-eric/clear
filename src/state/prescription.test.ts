/**
 * EXE-02 — the structured prescription, read from its columns.
 *
 * Every case here is a target kind or a modality the database can hold, and the
 * assertion is the same one each time: the screen's words come from the
 * columns, not from a string anybody parsed.
 */
import { describe, expect, it } from 'vitest'

import type { WorkoutExerciseRow } from './schemas'
import {
  modalityLabel,
  prescribedSetCount,
  prescribedTarget,
  prescriptionText,
  restText,
  targetForSet,
  targetText,
} from './prescription'
import { snapshotFixture } from '../test/workout-double'

/** One prescription row, with exactly the columns a case is about overridden. */
function exercise(overrides: Partial<WorkoutExerciseRow> = {}): WorkoutExerciseRow {
  const snapshot = snapshotFixture({
    sections: [{ blocks: [{ exercises: [{ prescription: overrides }] }] }],
  })
  const row = snapshot.sections[0]?.blocks[0]?.exercises[0]?.exercise
  if (row === undefined) throw new Error('the fixture built no prescription')
  return row
}

describe('each target kind, as the screen states it', () => {
  it('states a fixed target as one number', () => {
    const row = exercise({ target_kind: 'fixed', target_value: 8 })

    expect(prescribedTarget(row)).toEqual({ kind: 'fixed', value: 8 })
    expect(targetText(row)).toBe('8 reps')
    expect(prescriptionText(row)).toBe('3 × 8 reps')
  })

  it('states a range with an en dash, which the ladder separator is not', () => {
    const row = exercise({
      target_kind: 'range',
      target_value: null,
      target_min: 8,
      target_max: 10,
    })

    expect(targetText(row)).toBe('8–10 reps')
  })

  it('states a sequence as ordered rungs, and counts them as the sets', () => {
    const row = exercise({
      target_kind: 'sequence',
      target_value: null,
      target_sequence: [15, 12, 9, 6, 3],
      sets: null,
    })

    expect(targetText(row)).toBe('15-12-9-6-3 reps')
    expect(prescribedSetCount(row)).toBe(5)
    // Set 3 is its own rung — not "somewhere between 9 and 15".
    expect(targetForSet(row, 3)).toEqual({ kind: 'fixed', value: 9 })
    expect(prescriptionText(row)).toBe('5 rungs · 15-12-9-6-3 reps')
  })

  it('says per side rather than doubling the number', () => {
    const row = exercise({ target_kind: 'fixed', target_value: 8, per_side: true })

    expect(targetText(row)).toBe('8 reps each side')
  })

  it('states a distance in the unit the prescription names', () => {
    const row = exercise({
      modality: 'distance',
      target_kind: 'fixed',
      target_value: 400,
      distance_unit: 'm',
      sets: 2,
    })

    expect(targetText(row)).toBe('400 m')
    expect(prescriptionText(row)).toBe('2 × 400 m')
    expect(modalityLabel(row)).toBe('Distance (m)')
  })

  it('states a time target in seconds', () => {
    const row = exercise({ modality: 'time', target_kind: 'fixed', target_value: 40 })

    expect(targetText(row)).toBe('40 sec')
    expect(modalityLabel(row)).toBe('Seconds')
  })

  it('shows no target rather than an invented one for a malformed row', () => {
    // `CONSTRAINT target_shape` forbids this; a read that finds it anyway must
    // not take the whole session down over one row.
    const row = exercise({ target_kind: 'fixed', target_value: null })

    expect(prescribedTarget(row)).toBeNull()
    expect(targetText(row)).toBe('No target')
  })
})

describe('rest', () => {
  it('is a line when there is rest', () => {
    expect(restText(90)).toBe('Rest 90s')
  })

  it('is nothing at all when there is none — never “Rest: 0s”', () => {
    expect(restText(0)).toBeNull()
    expect(restText(null)).toBeNull()
  })
})
