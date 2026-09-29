/**
 * OVR-01c fixtures: one composed workout with an anchored lift and an
 * unanchored one, the anchor, and the working sets it was read from. Shared by
 * the suggestion surface's own test and Review's.
 */
import type { AnchorEvidenceRow, LoadAnchorRow, SessionAcceptance } from '../state/schemas'
import {
  makeGenerationOutput,
  makePrescription,
  makeSessionAcceptance,
  makeWorkoutBlock,
} from './factories'

const USER_ID = 'a0000001-0000-4000-8000-000000000000'
const LAST_SESSION_ID = 'b0000001-0000-4000-8000-000000000000'

/** One anchored primary lift (back squat) and one never logged (bench press). */
export function suggestionAcceptance(): SessionAcceptance {
  return makeSessionAcceptance({
    date: '2026-09-22',
    workout: makeGenerationOutput({
      title: 'Squat day',
      sections: [
        {
          section_type: 'primary_lift',
          section_title: 'Primary',
          section_notes: null,
          blocks: [
            makeWorkoutBlock({
              exercises: [
                makePrescription({
                  exercise_id: 'back-squat',
                  equipment: 'barbell',
                  session_function: 'primary',
                  target_value: 8,
                  load_type: 'rir',
                  load_value: 2,
                }),
                makePrescription({
                  exercise_id: 'bench-press',
                  equipment: 'barbell',
                  session_function: 'primary',
                  target_value: 8,
                  load_type: 'rir',
                  load_value: 2,
                }),
              ],
            }),
          ],
        },
      ],
    }),
  })
}

export function anchorRow(overrides: Partial<LoadAnchorRow> = {}): LoadAnchorRow {
  return {
    user_id: USER_ID,
    exercise_id: 'back-squat',
    equipment_used: 'barbell',
    anchor_value: 110,
    unit: 'kg',
    confidence: 'high',
    session_count: 4,
    last_session_date: '2026-09-15',
    updated_at: '2026-09-15T18:00:00.000Z',
    ...overrides,
  }
}

/**
 * Three sets of 8 at 85 kg, all at RPE 7.5 — §2's "+1 increment" row.
 * Kilograms throughout because the test profile's unit is kilograms, so no
 * number on screen is a conversion.
 */
export function evidenceRows(): AnchorEvidenceRow[] {
  return [1, 2, 3].map((setNumber) => ({
    session_id: LAST_SESSION_ID,
    session_date: '2026-09-15',
    logged_at: `2026-09-15T17:0${setNumber}:00.000Z`,
    exercise_id: 'back-squat',
    equipment_used: 'barbell',
    set_number: setNumber,
    actual_reps: 8,
    prescribed_reps: 8,
    weight: 85,
    weight_unit: 'kg' as const,
    rpe: 7.5,
  }))
}
