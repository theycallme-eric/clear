/**
 * TASK-047 / JOURNEY-031: one composition for the visible timed-result save,
 * retry and readback proof (`e2e/refinement/task-047.spec.ts`), shared by its
 * contained synthetic lane and its authorized disposable backend lane so both
 * perform identical work.
 *
 * Two sections:
 *
 *   · **Conditioning** — the four timed families in order, each with one
 *     loaded movement (`loaded`, a dumbbell movement with a planned 16 kg) and
 *     one bodyweight movement (`bodyweight`):
 *       - EMOM, two minutes, 15 s rest at the foot of each minute;
 *       - AMRAP, a five-minute window;
 *       - a single-pass For Time under a 10:00 cap;
 *       - a three-rung ladder (2 → 4 → 6) raced For Time under a 07:00 cap.
 *   · **Cooldown** — one bodyweight movement, the destination of the timed
 *     section's forward action and where "Finish workout" lives.
 *
 * The planned loads and targets are chosen so no entered value can be mistaken
 * for one: every entered amount and load in the proof differs from them.
 *
 * The exercise ids are parameters: the synthetic lane uses catalog-shaped
 * slugs, and the backend lane passes rows it read from the disposable
 * project's own catalog, so nothing assumes a catalog row exists.
 */
import type { LadderTiming, SessionAcceptance } from '../state/schemas'
import { CONTRACT_VERSION } from '../state/schemas'
import { makePrescription, makeWorkoutBlock } from './factories'

/** One catalog movement: its id and the equipment it is prescribed on. */
export interface ReadbackMovement {
  readonly id: string
  readonly equipment: string
}

/** The two movements every timed block uses. */
export interface ReadbackCatalog {
  /** Loaded (`loadApplies`): it takes a "Weight used" field in every family. */
  readonly loaded: ReadbackMovement
  /** Unloaded: an amount where a partial applies, never a load. */
  readonly bodyweight: ReadbackMovement
}

/** The synthetic lane's catalog (seeded catalog slugs; no read is made). */
export const READBACK_SYNTHETIC_CATALOG: ReadbackCatalog = {
  loaded: { id: 'goblet-squat', equipment: 'dumbbells' },
  bodyweight: { id: 'burpee', equipment: 'bodyweight' },
}

export const READBACK_TITLE = 'TASK-047 timed readback'
/** The planned load of every loaded movement, in kg: a value no field may be filled from. */
export const READBACK_PLANNED_LOAD = 16
export const READBACK_EMOM_SECONDS = 120
export const READBACK_EMOM_REST_SECONDS = 15
export const READBACK_AMRAP_SECONDS = 300
export const READBACK_FOR_TIME_CAP_SECONDS = 600
export const READBACK_LADDER_CAP_SECONDS = 420
export const READBACK_LADDER_RUNGS: readonly number[] = [2, 4, 6]

/** The lists each live card names its work by (the renderers' own names). */
export const READBACK_WORK_LISTS = {
  emom: 'Movements in this EMOM',
  amrap: 'Movements in this AMRAP',
  forTime: 'Movements in this block',
  ladder: 'Rounds in this ladder',
} as const

export const READBACK_LADDER_TIMING: LadderTiming = {
  mode: 'for_time',
  rounds: READBACK_LADDER_RUNGS.length,
  interval_seconds: null,
  cap_seconds: null,
}

/** The movement's name as the app humanises a catalog slug. */
export function readbackName(id: string): string {
  return id.replaceAll('-', ' ').replaceAll('_', ' ')
}

const timed = { sets: null, rest_seconds: null, session_function: 'conditioning' as const, anchor_relationship: 'neutral' as const }

/** The session the journey performs: the four timed blocks, then a cooldown. */
export function timedReadbackAcceptance(
  catalog: ReadbackCatalog = READBACK_SYNTHETIC_CATALOG,
  { locationId = null, date = '2026-11-11' }: { locationId?: string | null; date?: string } = {},
): SessionAcceptance {
  const loaded = (overrides: Record<string, unknown> = {}) =>
    makePrescription({
      exercise_id: catalog.loaded.id,
      equipment: catalog.loaded.equipment,
      ...timed,
      target_value: 10,
      load_type: 'absolute',
      load_value: READBACK_PLANNED_LOAD,
      ...overrides,
    })
  const bodyweight = (overrides: Record<string, unknown> = {}) =>
    makePrescription({
      exercise_id: catalog.bodyweight.id,
      equipment: catalog.bodyweight.equipment,
      ...timed,
      target_value: 12,
      load_type: 'none',
      load_value: null,
      ...overrides,
    })
  const sequence = { target_kind: 'sequence', target_value: null, target_sequence: [...READBACK_LADDER_RUNGS] }

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
      title: READBACK_TITLE,
      overview: null,
      estimated_duration_mins: 30,
      sections: [
        {
          section_type: 'conditioning',
          section_title: 'Timed results',
          section_notes: null,
          blocks: [
            makeWorkoutBlock({
              structure_type: 'emom',
              timer_type: 'per_minute',
              timer_seconds: READBACK_EMOM_SECONDS,
              round_rest_seconds: READBACK_EMOM_REST_SECONDS,
              exercises: [loaded({ target_value: 8 }), bodyweight({ target_value: 10 })],
            }),
            makeWorkoutBlock({
              structure_type: 'amrap',
              timer_type: 'countdown',
              timer_seconds: READBACK_AMRAP_SECONDS,
              exercises: [loaded(), bodyweight()],
            }),
            makeWorkoutBlock({
              structure_type: 'for_time',
              timer_type: 'count_up',
              timer_seconds: READBACK_FOR_TIME_CAP_SECONDS,
              exercises: [loaded({ target_value: 30 }), bodyweight({ target_value: 20 })],
            }),
            makeWorkoutBlock({
              structure_type: 'for_time',
              timer_type: 'countdown',
              timer_seconds: READBACK_LADDER_CAP_SECONDS,
              rep_scheme: 'ladder_up',
              ladder_timing: READBACK_LADDER_TIMING,
              exercises: [loaded(sequence), bodyweight(sequence)],
            }),
          ],
        },
        {
          section_type: 'cooldown',
          section_title: 'Cooldown',
          section_notes: null,
          blocks: [
            makeWorkoutBlock({
              exercises: [
                bodyweight({ session_function: 'recovery', sets: 1, target_value: 1 }),
              ],
            }),
          ],
        },
      ],
    },
  }
}
