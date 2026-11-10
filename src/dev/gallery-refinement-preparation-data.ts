/**
 * TASK-022 / JOURNEY-022 — one synthetic composition with an authoritative
 * Warm-up and Cooldown around a worked section, shared by the accepted gallery
 * state (`/gallery/refinements?state=preparation`), the focused check
 * (`src/ui/preparation-guide.test.tsx`) and the real-route proof
 * (`e2e/refinement/task-022.spec.ts`), so Review and Workout read identical
 * prescribed data.
 *
 * It deliberately carries everything the concise guide must never show — a
 * generated custom section title, explanatory section notes, and per-movement
 * sets, reps, holds, rest and load — and counts that are not the illustrated
 * three rows (four warm-up movements, two cooldown movements). The guide's
 * approximate times are read from these prescriptions by TASK-034's reading;
 * nothing here states a duration.
 *
 * Synthetic and in memory only: no account, no catalog read, no write.
 */
import {
  CONTRACT_VERSION,
  type Prescription,
  type SessionAcceptance,
  type SessionSnapshot,
} from '../state/schemas'

type Section = SessionAcceptance['workout']['sections'][number]
type Block = Section['blocks'][number]
type SnapshotSection = SessionSnapshot['sections'][number]

function prescription(overrides: Partial<Prescription> & Pick<Prescription, 'exercise_id'>): Prescription {
  return {
    equipment: 'bodyweight',
    session_function: 'prep',
    anchor_relationship: 'complementary',
    modality: 'reps',
    sets: 2,
    target_kind: 'fixed',
    target_value: 10,
    target_min: null,
    target_max: null,
    target_sequence: null,
    per_side: false,
    distance_unit: null,
    rest_seconds: 30,
    tempo: null,
    load_type: 'bodyweight',
    load_value: null,
    is_interval_exercise: false,
    ...overrides,
  } as Prescription
}

function standard(exercises: Prescription[]): Block {
  return {
    structure_type: 'standard',
    rounds: null,
    timer_type: 'none',
    timer_seconds: null,
    round_rest_seconds: null,
    rep_scheme: 'fixed',
    block_notes: null,
    exercises,
  }
}

/** The generated words the guide never shows (R01): a custom title and prose. */
export const WARM_UP_GENERATED_TITLE = 'Prepare for the press'
export const WARM_UP_GENERATED_NOTES =
  'Open the shoulders and groove the pressing pattern before the working sets, moving through each drill with control.'
export const COOLDOWN_GENERATED_TITLE = 'Unwind the upper body'
export const COOLDOWN_GENERATED_NOTES =
  'Breathe slowly and let each stretch settle before moving on to the next one.'

export const PREPARATION_SECTIONS: Readonly<Record<'warmup' | 'main' | 'cooldown', Section>> = {
  warmup: {
    section_type: 'warmup',
    section_title: WARM_UP_GENERATED_TITLE,
    section_notes: WARM_UP_GENERATED_NOTES,
    blocks: [
      standard([
        prescription({ exercise_id: 'arm-circles', sets: 1, target_value: 10 }),
        prescription({ exercise_id: 'scapular-push-up', sets: 2, target_value: 8 }),
        prescription({
          exercise_id: 'kettlebell-halo', equipment: 'kettlebell', sets: 2, target_value: 6,
          load_type: 'absolute', load_value: 8,
        }),
        prescription({
          exercise_id: 'dead-hang', modality: 'time', sets: 1, target_value: 30, rest_seconds: null,
        }),
      ]),
    ],
  },
  main: {
    section_type: 'primary_lift',
    section_title: 'Press',
    section_notes: null,
    blocks: [
      standard([
        prescription({
          exercise_id: 'bench-press', equipment: 'barbell', session_function: 'primary',
          sets: 4, target_value: 6, rest_seconds: 120, load_type: 'absolute', load_value: 60,
        }),
      ]),
    ],
  },
  cooldown: {
    section_type: 'cooldown',
    section_title: COOLDOWN_GENERATED_TITLE,
    section_notes: COOLDOWN_GENERATED_NOTES,
    blocks: [
      standard([
        prescription({
          exercise_id: 'doorway-chest-stretch', session_function: 'recovery', modality: 'time',
          sets: 2, target_value: 40, per_side: true, rest_seconds: null,
        }),
        prescription({
          exercise_id: 'childs-pose', session_function: 'recovery', modality: 'time',
          sets: 1, target_value: 60, rest_seconds: null,
        }),
      ]),
    ],
  },
}

/** The names the guides list, in composed order, as `exerciseName` reads each slug. */
export const PREPARATION_NAMES: Readonly<Record<'warmup' | 'cooldown', readonly string[]>> = {
  warmup: ['arm circles', 'scapular push up', 'kettlebell halo', 'dead hang'],
  cooldown: ['doorway chest stretch', 'childs pose'],
}

export const PREPARATION_TITLE = 'Synthetic preparation workout'

/** JOURNEY-022's entry: a workout with an authoritative Warm-up and Cooldown. */
export function preparationAcceptance({
  date = '2026-11-10',
  locationId = null,
  sections = [PREPARATION_SECTIONS.warmup, PREPARATION_SECTIONS.main, PREPARATION_SECTIONS.cooldown],
}: { date?: string; locationId?: string | null; sections?: readonly Section[] } = {}): SessionAcceptance {
  return {
    date,
    location_id: locationId,
    session_focus: 'upper_body',
    goal_preset: 'balanced',
    requested_duration_mins: 45,
    effective_duration_target_mins: 45,
    computed_duration_mins: null,
    requested_intensity: 7,
    effective_intensity: 7,
    adjustment_reason: null,
    generation_notes: null,
    prompt_version: 'gallery-task-022',
    contract_version: CONTRACT_VERSION,
    is_deload: false,
    workout: {
      title: PREPARATION_TITLE,
      overview: null,
      estimated_duration_mins: 45,
      sections: [...sections],
    },
  }
}

const STAMP = '2026-11-10T09:00:00+00:00'

/** A stable synthetic id: `0000…-4000-8000-` with a kind digit and a counter. */
function galleryId(kind: number, n: number): string {
  return `00000000-0000-4000-8000-${String(kind).padStart(2, '0')}${String(n).padStart(10, '0')}`
}

/**
 * One composed section as the persisted session holds it — the rows
 * `persist_session` writes, every movement active and not started — so the
 * live guide is read from rows exactly as `/workout` reads them.
 */
export function persistedPreparationSection(section: Section, index = 0): SnapshotSection {
  const sectionId = galleryId(61, index + 1)
  let exerciseCounter = 0
  return {
    section: {
      id: sectionId,
      session_id: galleryId(60, 1),
      created_at: STAMP,
      updated_at: STAMP,
      section_type: section.section_type,
      order_index: index,
      section_title: section.section_title,
      section_notes: section.section_notes,
    },
    blocks: section.blocks.map((block, blockIndex) => {
      const blockId = galleryId(71, index * 10 + blockIndex + 1)
      return {
        block: {
          id: blockId,
          section_id: sectionId,
          created_at: STAMP,
          order_index: blockIndex,
          structure_type: block.structure_type,
          rounds: block.rounds,
          timer_type: block.timer_type,
          timer_seconds: block.timer_seconds,
          round_rest_seconds: block.round_rest_seconds,
          rep_scheme: block.rep_scheme,
          block_notes: block.block_notes,
        },
        exercises: block.exercises.map((exercise, order) => {
          exerciseCounter += 1
          const id = galleryId(81, index * 100 + exerciseCounter)
          return {
            exercise: {
              id,
              block_id: blockId,
              exercise_id: exercise.exercise_id,
              order_index: order,
              modality: exercise.modality,
              sets: exercise.sets,
              target_kind: exercise.target_kind,
              target_value: exercise.target_value,
              target_min: exercise.target_min,
              target_max: exercise.target_max,
              target_sequence: exercise.target_sequence,
              per_side: exercise.per_side,
              distance_unit: exercise.distance_unit,
              rest_seconds: exercise.rest_seconds,
              tempo: exercise.tempo,
              load_type: exercise.load_type,
              load_value: exercise.load_value,
              equipment_used: exercise.equipment,
              is_interval_exercise: exercise.is_interval_exercise,
              slot_id: galleryId(91, index * 100 + exerciseCounter),
              replaces_id: null,
              origin: 'generated' as const,
              created_at: STAMP,
              superseded_at: null,
              revision_status: 'active' as const,
              execution_status: 'not_started' as const,
              exercise_notes: null,
            },
            set_logs: [],
          }
        }),
      }
    }),
  }
}
