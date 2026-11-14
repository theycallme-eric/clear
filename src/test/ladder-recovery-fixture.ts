/**
 * TASK-048 / JOURNEY-032: one composition for the visible ladder recovery
 * proof (`e2e/refinement/task-048.spec.ts`), shared by its contained synthetic
 * lane and its authorized disposable backend lane so both perform identical
 * work.
 *
 * Two sections:
 *
 *   · **Conditioning** — two true timed ladders, shaped unlike each other:
 *       - `MAIN` — four rungs (2 → 4 → 6 → 8) of a loaded movement (a
 *         dumbbell movement with a planned 16 kg) and a bodyweight movement,
 *         inside one 06:00 cap on the whole ladder (`capped_window`);
 *       - `SECOND` — three rungs (3 → 6 → 9) of the bodyweight movement alone,
 *         raced For Time under the block's 10:00 cap; it is the later block
 *         whose save can fail after the first ladder's has succeeded.
 *   · **Cooldown** — one bodyweight movement, the destination of the timed
 *     section's forward action.
 *
 * The planned load (16 kg) and every rung target differ from every value the
 * proof enters, so no entered value can be mistaken for the plan.
 *
 * The exercise ids are parameters: the synthetic lane uses catalog-shaped
 * slugs, and the backend lane passes rows it read from the disposable
 * project's own catalog, so nothing assumes a catalog row exists.
 */
import type { LadderTiming, SessionAcceptance } from '../state/schemas'
import { CONTRACT_VERSION } from '../state/schemas'
import { makePrescription, makeWorkoutBlock } from './factories'
import type { ReadbackCatalog } from './timed-readback-fixture'

export { READBACK_SYNTHETIC_CATALOG as RECOVERY_SYNTHETIC_CATALOG, readbackName as recoveryName } from './timed-readback-fixture'
export type { ReadbackCatalog as RecoveryCatalog } from './timed-readback-fixture'

export const RECOVERY_TITLE = 'TASK-048 ladder recovery'
export const RECOVERY_PLANNED_LOAD = 16

export const MAIN_RUNGS: readonly number[] = [2, 4, 6, 8]
export const MAIN_CAP_SECONDS = 360
export const MAIN_TIMING: LadderTiming = { mode: 'capped_window', rounds: MAIN_RUNGS.length, interval_seconds: null, cap_seconds: MAIN_CAP_SECONDS }
export const MAIN_TIMING_LINE = '4 rounds · 06:00 cap on the whole ladder'

export const SECOND_RUNGS: readonly number[] = [3, 6, 9]
export const SECOND_CAP_SECONDS = 600
export const SECOND_TIMING: LadderTiming = { mode: 'for_time', rounds: SECOND_RUNGS.length, interval_seconds: null, cap_seconds: null }
export const SECOND_TIMING_LINE = '3 rounds · for time, at your pace · 10:00 cap'

export const RECOVERY_SECTION_TITLE = 'Conditioning'
export const RECOVERY_COOLDOWN_TITLE = 'Cooldown'

const timed = { sets: null, rest_seconds: null, session_function: 'conditioning' as const, anchor_relationship: 'neutral' as const }

/** JOURNEY-032's entry: the two ladders ready in the first section, a cooldown after. */
export function ladderRecoveryAcceptance(
  catalog: ReadbackCatalog,
  { locationId = null, date = '2026-11-11' }: { locationId?: string | null; date?: string } = {},
): SessionAcceptance {
  const sequence = (rungs: readonly number[]) => ({ target_kind: 'sequence' as const, target_value: null, target_sequence: [...rungs] })
  const loaded = makePrescription({
    exercise_id: catalog.loaded.id,
    equipment: catalog.loaded.equipment,
    ...timed,
    ...sequence(MAIN_RUNGS),
    load_type: 'absolute',
    load_value: RECOVERY_PLANNED_LOAD,
  })
  const bodyweight = (rungs: readonly number[]) =>
    makePrescription({
      exercise_id: catalog.bodyweight.id,
      equipment: catalog.bodyweight.equipment,
      ...timed,
      ...sequence(rungs),
      load_type: 'none',
      load_value: null,
    })

  return {
    date,
    location_id: locationId,
    session_focus: 'full_body',
    goal_preset: 'balanced',
    requested_duration_mins: 30,
    effective_duration_target_mins: 30,
    computed_duration_mins: null,
    requested_intensity: 5,
    effective_intensity: 5,
    adjustment_reason: null,
    generation_notes: null,
    prompt_version: 'e2e',
    contract_version: CONTRACT_VERSION,
    is_deload: false,
    workout: {
      title: RECOVERY_TITLE,
      overview: null,
      estimated_duration_mins: 30,
      sections: [
        {
          section_type: 'conditioning',
          section_title: 'Ladders',
          section_notes: null,
          blocks: [
            makeWorkoutBlock({
              structure_type: 'for_time',
              timer_type: 'countdown',
              timer_seconds: MAIN_CAP_SECONDS,
              rep_scheme: 'ladder_up',
              ladder_timing: MAIN_TIMING,
              exercises: [loaded, bodyweight(MAIN_RUNGS)],
            }),
            makeWorkoutBlock({
              structure_type: 'for_time',
              timer_type: 'countdown',
              timer_seconds: SECOND_CAP_SECONDS,
              rep_scheme: 'ladder_up',
              ladder_timing: SECOND_TIMING,
              exercises: [bodyweight(SECOND_RUNGS)],
            }),
          ],
        },
        {
          section_type: 'cooldown',
          section_title: RECOVERY_COOLDOWN_TITLE,
          section_notes: null,
          blocks: [
            makeWorkoutBlock({
              exercises: [
                makePrescription({
                  exercise_id: catalog.bodyweight.id,
                  equipment: catalog.bodyweight.equipment,
                  ...timed,
                  session_function: 'recovery',
                  sets: 1,
                  target_value: 1,
                  load_type: 'none',
                  load_value: null,
                }),
              ],
            }),
          ],
        },
      ],
    },
  }
}
