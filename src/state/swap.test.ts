/**
 * EXE-06 — the swap's arithmetic, and the acceptance criteria it carries.
 *
 * Four of the five criteria are decided in this module, so the file is
 * arranged as they are: what may replace a slot, what the replacement
 * prescribes, what the session looks like afterwards, and what an undo goes
 * back to. The fifth — the anchor exclusion — is a predicate in SQL and is
 * asserted in `src/test/swap-anchor-migration.test.ts`.
 */
import { describe, expect, it } from 'vitest'

import type { Candidate, SectionCandidates } from '../data/candidates'
import type { SwapResult } from '../data/sessions'
import {
  applySwap,
  equipmentFor,
  exercisesInUse,
  locateSlot,
  prescriptionFor,
  swapOptions,
  undoTarget,
} from './swap'
import type { SessionSnapshot, WorkoutExerciseRow } from './schemas'
import { snapshotFixture } from '../test/workout-double'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const SLOT_ID = '44444444-4444-4444-8444-444444444444'

/** One block, one movement, three sets of it already logged. */
function sessionWithLoggedSets(): SessionSnapshot {
  return snapshotFixture({
    sections: [
      {
        title: 'Primary lift',
        sectionType: 'primary_lift',
        blocks: [
          {
            exercises: [
              {
                status: 'not_started',
                prescription: {
                  exercise_id: 'deadlift',
                  equipment_used: 'barbell',
                  slot_id: SLOT_ID,
                  sets: 5,
                  target_kind: 'fixed',
                  target_value: 8,
                  rest_seconds: 120,
                },
                setLogs: [{ actual_reps: 8 }, { actual_reps: 8 }, { actual_reps: 8 }],
              },
            ],
          },
        ],
      },
    ],
  })
}

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    exerciseId: 'romanian-deadlift',
    name: 'Romanian deadlift',
    patterns: ['hinge'],
    primaryPatterns: ['hinge'],
    role: 'compound_lift',
    components: ['hip-hinge'],
    muscles: [],
    canBePrimary: true,
    usableEquipment: ['barbell', 'dumbbell'],
    ...overrides,
  }
}

function sets(candidates: readonly Candidate[]): readonly SectionCandidates[] {
  return [{ section: 'primary_lift', relaxed: false, candidates }]
}

function activeRow(snapshot: SessionSnapshot): WorkoutExerciseRow {
  const row = snapshot.sections[0]?.blocks[0]?.exercises[0]?.exercise
  if (row === undefined) throw new Error('the fixture has no prescription')
  return row
}

// ─────────────────────────────────────────────────────────────────────────────
// What may replace a slot
// ─────────────────────────────────────────────────────────────────────────────

describe('the alternatives for a slot (EXE-06)', () => {
  const snapshot = sessionWithLoggedSets()
  const outgoing = activeRow(snapshot)

  it('offers the candidates the section resolved to', () => {
    const options = swapOptions(sets([candidate()]), 'primary_lift', outgoing, new Set())

    expect(options).toEqual([
      { exerciseId: 'romanian-deadlift', name: 'Romanian deadlift', equipment: 'barbell' },
    ])
  })

  it('keeps the equipment the user is already holding when it fits', () => {
    expect(equipmentFor('barbell', candidate())).toBe('barbell')
  })

  it('falls back to what the location has when it does not', () => {
    expect(equipmentFor('kettlebell', candidate({ usableEquipment: ['dumbbell'] }))).toBe(
      'dumbbell',
    )
  })

  it('drops a candidate this location cannot equip at all', () => {
    // `equipment_used` is NOT NULL and non-blank: a candidate with nothing to
    // perform it with cannot be prescribed, so it is not offered.
    const options = swapOptions(
      sets([candidate({ usableEquipment: [] })]),
      'primary_lift',
      outgoing,
      new Set(),
    )

    expect(options).toEqual([])
  })

  it('does not offer an exercise the session already prescribes', () => {
    const options = swapOptions(
      sets([candidate(), candidate({ exerciseId: 'deadlift', name: 'Deadlift' })]),
      'primary_lift',
      outgoing,
      exercisesInUse(snapshot),
    )

    expect(options.map((option) => option.exerciseId)).toEqual(['romanian-deadlift'])
  })

  it('answers nothing for a section the retrieval did not resolve', () => {
    // An empty list, not a throw: "this location has nothing else that fits
    // here" is an answer the panel renders, and it is not a failed read.
    expect(swapOptions(sets([candidate()]), 'conditioning', outgoing, new Set())).toEqual([])
  })

  it('counts superseded rows as in use, so a swap does not re-offer them', () => {
    const swapped = applySwap(snapshot, revisionOf(snapshot, 'romanian-deadlift'))

    expect([...exercisesInUse(swapped)].sort()).toEqual(['deadlift', 'romanian-deadlift'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// What the replacement prescribes
// ─────────────────────────────────────────────────────────────────────────────

describe('the prescription a swap writes (EXE-06)', () => {
  const snapshot = sessionWithLoggedSets()
  const outgoing = activeRow(snapshot)

  it('changes the movement and nothing about the work', () => {
    const prescription = prescriptionFor(
      outgoing,
      { exerciseId: 'romanian-deadlift', equipment: 'barbell' },
      'primary_lift',
    )

    expect(prescription).toMatchObject({
      exercise_id: 'romanian-deadlift',
      equipment: 'barbell',
      sets: 5,
      target_kind: 'fixed',
      target_value: 8,
      rest_seconds: 120,
      modality: 'reps',
    })
  })

  it('carries a rep range across as a range', () => {
    const ranged: WorkoutExerciseRow = {
      ...outgoing,
      target_kind: 'range',
      target_value: null,
      target_min: 8,
      target_max: 10,
    }

    expect(
      prescriptionFor(ranged, { exerciseId: 'x', equipment: 'barbell' }, 'accessory'),
    ).toMatchObject({ target_kind: 'range', target_min: 8, target_max: 10, target_value: null })
  })

  it('carries a ladder across as its sequence', () => {
    const ladder: WorkoutExerciseRow = {
      ...outgoing,
      target_kind: 'sequence',
      target_value: null,
      target_sequence: [15, 12, 9],
    }

    expect(
      prescriptionFor(ladder, { exerciseId: 'x', equipment: 'barbell' }, 'accessory'),
    ).toMatchObject({ target_kind: 'sequence', target_sequence: [15, 12, 9] })
  })

  it('refuses a row whose target columns contradict its kind', () => {
    // `CONSTRAINT target_shape` forbids this row, so meeting one means the
    // snapshot is not what the database holds. Inventing a rep count to make
    // the payload well-formed would prescribe work nobody asked for.
    const impossible: WorkoutExerciseRow = { ...outgoing, target_value: null }

    expect(
      prescriptionFor(impossible, { exerciseId: 'x', equipment: 'barbell' }, 'accessory'),
    ).toBeNull()
  })

  it('says `none` where the row carries no load guidance', () => {
    expect(
      prescriptionFor(
        { ...outgoing, load_type: null },
        { exerciseId: 'x', equipment: 'barbell' },
        'accessory',
      ),
    ).toMatchObject({ load_type: 'none', load_value: null })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The session afterwards
// ─────────────────────────────────────────────────────────────────────────────

/** The two rows `swap_session_exercise` answers, for a fixture's one slot. */
function revisionOf(snapshot: SessionSnapshot, exerciseId: string): SwapResult {
  const outgoing = activeRow(snapshot)

  return {
    superseded: {
      ...outgoing,
      revision_status: 'superseded',
      superseded_at: '2026-09-24T09:15:00+00:00',
    },
    exercise: {
      ...outgoing,
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      exercise_id: exerciseId,
      slot_id: outgoing.slot_id,
      replaces_id: outgoing.id,
      origin: 'revised',
      revision_status: 'active',
      superseded_at: null,
      execution_status: 'not_started',
    },
  }
}

describe('the session a swap produces (EXE-06)', () => {
  const snapshot = sessionWithLoggedSets()
  const revision = revisionOf(snapshot, 'romanian-deadlift')
  const swapped = applySwap(snapshot, revision)
  const members = swapped.sections[0]?.blocks[0]?.exercises ?? []

  it('supersedes the outgoing row and appends the replacement in its slot', () => {
    expect(members.map((entry) => entry.exercise.revision_status)).toEqual([
      'superseded',
      'active',
    ])
    expect(members[1]?.exercise.slot_id).toBe(members[0]?.exercise.slot_id)
    expect(members[1]?.exercise.replaces_id).toBe(members[0]?.exercise.id)
    expect(members[1]?.exercise.origin).toBe('revised')
  })

  it('leaves the sets already logged attached to the row that was performed', () => {
    expect(members[0]?.set_logs).toHaveLength(3)
    expect(members[0]?.exercise.execution_status).toBe(
      activeRow(snapshot).execution_status,
    )
    // And the replacement arrives with none, so the next set logged in this
    // slot is attributed to it rather than to the movement that was dropped.
    expect(members[1]?.set_logs).toEqual([])
  })

  it('touches no other block', () => {
    const two = snapshotFixture({ sections: [{ title: 'A' }, { title: 'B' }] })
    const after = applySwap(two, revisionOf(two, 'romanian-deadlift'))

    // Identity, not equality: a block that was not revised is the same block.
    expect(after.sections[1]?.blocks[0]).toBe(two.sections[1]?.blocks[0])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Undo
// ─────────────────────────────────────────────────────────────────────────────

describe('undo (EXE-06)', () => {
  const snapshot = sessionWithLoggedSets()
  const swapped = applySwap(snapshot, revisionOf(snapshot, 'romanian-deadlift'))
  const replacement = swapped.sections[0]?.blocks[0]?.exercises[1]?.exercise

  it('names the exercise the slot would go back to', () => {
    expect(undoTarget(swapped, replacement?.id ?? '')?.exercise_id).toBe('deadlift')
  })

  it('offers nothing for a slot that has never been swapped', () => {
    expect(undoTarget(snapshot, activeRow(snapshot).id)).toBeNull()
  })

  it('restores the prior exercise as the prescription it was', () => {
    const previous = undoTarget(swapped, replacement?.id ?? '')
    if (previous === null) throw new Error('the fixture has no predecessor')

    expect(
      prescriptionFor(
        previous,
        { exerciseId: previous.exercise_id, equipment: previous.equipment_used },
        'primary_lift',
      ),
    ).toMatchObject({ exercise_id: 'deadlift', equipment: 'barbell', target_value: 8, sets: 5 })
  })

  it('locates a slot by the section it is performed in', () => {
    expect(locateSlot(swapped, replacement?.id ?? '')?.sectionType).toBe('primary_lift')
    expect(locateSlot(swapped, 'not-a-row')).toBeNull()
  })
})
