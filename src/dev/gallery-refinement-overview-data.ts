/**
 * TASK-004 / JOURNEY-004 — the synthetic workouts the accepted Overview state
 * (`/gallery/refinements?state=overview`), the focused check
 * (`src/ui/summary-facts.test.tsx`) and the real-route proof
 * (`e2e/refinement/task-004.spec.ts`) all read, so the three show the same
 * prescribed and recorded values.
 *
 *   · A planned workout reaches `/review` as a `SessionAcceptance`: loaded
 *     (barbell, dumbbell and kettlebell work beside bodyweight movements), all
 *     bodyweight, or the widest real facts (120 min, full body, active
 *     recovery, intensity 10).
 *   · The same composition, completed, is a `session_as_performed`
 *     reconstruction for `/history/:id` and the completed session `/summary`
 *     debriefs: recorded rows whose `equipment_used` is the prescription's
 *     equipment, and the session's own recorded duration and intensity.
 *
 * Synthetic and in memory only: no account, no catalog read, no write. Values
 * are this task's own; nothing here restates the accepted reference's demo row.
 */
import {
  CONTRACT_VERSION,
  type Prescription,
  type SessionAcceptance,
  type SessionReconstruction,
  type WorkoutSessionRow,
} from '../state/schemas'

type Section = SessionAcceptance['workout']['sections'][number]
type Block = Section['blocks'][number]

/** Which composition: real equipment, nothing but the body, or the widest facts. */
export type OverviewComposition = 'loaded' | 'bodyweight' | 'widest'

const PROMPT_VERSION = 'gallery-task-004'

/** A version-4 UUID in this task's own range, so no two synthetic rows collide. */
export function overviewId(n: number): string {
  return `00000000-0000-4000-8000-${String(4000 + n).padStart(12, '0')}`
}

function prescription(overrides: Partial<Prescription> & Pick<Prescription, 'exercise_id' | 'equipment'>): Prescription {
  return {
    session_function: 'accessory',
    anchor_relationship: 'complementary',
    modality: 'reps',
    sets: 3,
    target_kind: 'fixed',
    target_value: 10,
    target_min: null,
    target_max: null,
    target_sequence: null,
    per_side: false,
    distance_unit: null,
    rest_seconds: 90,
    tempo: null,
    load_type: 'absolute',
    load_value: 20,
    is_interval_exercise: false,
    ...overrides,
  } as Prescription
}

function block(overrides: Partial<Block> & Pick<Block, 'exercises'>): Block {
  return {
    structure_type: 'standard',
    rounds: null,
    timer_type: 'none',
    timer_seconds: null,
    round_rest_seconds: null,
    rep_scheme: 'fixed',
    block_notes: null,
    ...overrides,
  }
}

const bodyweight = { equipment: 'bodyweight', load_type: 'bodyweight' as const, load_value: null }

function loadedSections(): Section[] {
  return [
    {
      section_type: 'primary_lift',
      section_title: 'Main lift',
      section_notes: null,
      blocks: [block({
        exercises: [
          prescription({ exercise_id: 'bench-press', equipment: 'barbell', session_function: 'primary', sets: 3, target_value: 5, load_value: 60, rest_seconds: 120 }),
        ],
      })],
    },
    {
      section_type: 'accessory',
      section_title: 'Accessory',
      section_notes: null,
      blocks: [block({
        structure_type: 'superset',
        rounds: 3,
        round_rest_seconds: 90,
        exercises: [
          prescription({ exercise_id: 'dumbbell-row', equipment: 'dumbbell', sets: 3, target_value: 10, load_value: 22, rest_seconds: 0 }),
          prescription({ exercise_id: 'push-up', ...bodyweight, sets: 3, target_value: 12, rest_seconds: 0 }),
        ],
      })],
    },
    {
      section_type: 'conditioning',
      section_title: 'Finisher',
      section_notes: null,
      blocks: [block({
        structure_type: 'circuit',
        rounds: 2,
        round_rest_seconds: 60,
        exercises: [
          prescription({ exercise_id: 'kb-swing', equipment: 'kettlebell', session_function: 'conditioning', sets: 2, target_value: 15, load_value: 24, rest_seconds: null }),
          prescription({ exercise_id: 'burpee', ...bodyweight, session_function: 'conditioning', sets: 2, target_value: 10, rest_seconds: null }),
          prescription({ exercise_id: 'plank', ...bodyweight, session_function: 'conditioning', modality: 'time', sets: 2, target_value: 30, rest_seconds: null }),
        ],
      })],
    },
  ]
}

function bodyweightSections(): Section[] {
  return [
    {
      section_type: 'primary_lift',
      section_title: 'Main lift',
      section_notes: null,
      blocks: [block({
        exercises: [
          prescription({ exercise_id: 'air-squat', ...bodyweight, session_function: 'primary', sets: 3, target_value: 20, rest_seconds: 90 }),
        ],
      })],
    },
    {
      section_type: 'accessory',
      section_title: 'Accessory',
      section_notes: null,
      blocks: [block({
        structure_type: 'superset',
        rounds: 3,
        round_rest_seconds: 60,
        exercises: [
          prescription({ exercise_id: 'reverse-lunge', ...bodyweight, sets: 3, target_value: 10, per_side: true, rest_seconds: 0 }),
          prescription({ exercise_id: 'push-up', ...bodyweight, sets: 3, target_value: 12, rest_seconds: 0 }),
        ],
      })],
    },
    {
      section_type: 'conditioning',
      section_title: 'Finisher',
      section_notes: null,
      blocks: [block({
        structure_type: 'circuit',
        rounds: 2,
        round_rest_seconds: 60,
        exercises: [
          prescription({ exercise_id: 'mountain-climber', ...bodyweight, session_function: 'conditioning', sets: 2, target_value: 20, rest_seconds: null }),
          prescription({ exercise_id: 'burpee', ...bodyweight, session_function: 'conditioning', sets: 2, target_value: 10, rest_seconds: null }),
          prescription({ exercise_id: 'plank', ...bodyweight, session_function: 'conditioning', modality: 'time', sets: 2, target_value: 30, rest_seconds: null }),
        ],
      })],
    },
  ]
}

export const OVERVIEW_TITLES: Readonly<Record<OverviewComposition, string>> = {
  loaded: 'Upper-body strength',
  bodyweight: 'Bodyweight conditioning',
  widest: 'Full body active recovery and conditioning',
}

/** What each planned composition's Review overview states (`reviewBriefing`'s own words). */
export const OVERVIEW_PLANNED = {
  loaded: { duration: '45 min', focus: 'Upper body', intensity: '7', goal: 'Strength', movements: '6', equipment: ['barbell', 'dumbbell', 'kettlebell'] },
  bodyweight: { duration: '30 min', focus: 'Lower body', intensity: '6', goal: 'Conditioning', movements: '6', equipment: [] },
  widest: { duration: '120 min', focus: 'Full body', intensity: '10', goal: 'Active recovery', movements: '6', equipment: ['barbell', 'dumbbell', 'kettlebell'] },
} as const satisfies Record<OverviewComposition, {
  duration: string; focus: string; intensity: string; goal: string; movements: string; equipment: readonly string[]
}>

/** JOURNEY-004's planned entry: a composed workout, as the Generate → Review hand-off carries it. */
export function overviewAcceptance({
  composition = 'loaded',
  date = '2026-11-09',
  locationId = null,
}: { composition?: OverviewComposition; date?: string; locationId?: string | null } = {}): SessionAcceptance {
  const facts = {
    loaded: { focus: 'upper_body', goal: 'strength', minutes: 45, intensity: 7 },
    bodyweight: { focus: 'lower_body', goal: 'conditioning', minutes: 30, intensity: 6 },
    widest: { focus: 'full_body', goal: 'active_recovery', minutes: 120, intensity: 10 },
  } as const
  const chosen = facts[composition]
  return {
    date,
    location_id: locationId,
    session_focus: chosen.focus,
    goal_preset: chosen.goal,
    requested_duration_mins: chosen.minutes,
    effective_duration_target_mins: chosen.minutes,
    computed_duration_mins: null,
    requested_intensity: chosen.intensity,
    effective_intensity: chosen.intensity,
    adjustment_reason: null,
    generation_notes: null,
    prompt_version: PROMPT_VERSION,
    contract_version: CONTRACT_VERSION,
    is_deload: false,
    workout: {
      title: OVERVIEW_TITLES[composition],
      overview: null,
      estimated_duration_mins: chosen.minutes,
      sections: composition === 'bodyweight' ? bodyweightSections() : loadedSections(),
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The recorded side: a completed attempt of the same composition
// ─────────────────────────────────────────────────────────────────────────────

export interface SavedOverviewOptions {
  composition?: OverviewComposition
  sessionId?: string
  userId?: string
  /** The session's own local day. */
  date?: string
  completedAt?: string
  /** What was measured. `null` leaves the computed length, or no duration at all. */
  actualDurationMins?: number | null
  computedDurationMins?: number | null
  requestedIntensity?: number
  effectiveIntensity?: number
  /**
   * The recorded equipment of one movement, by position across the workout,
   * when it differs from the plan — a recorded row is read as recorded.
   */
  recordedEquipment?: Readonly<Record<number, string>>
}

/** The recorded defaults: the planned workout, finished in 42 measured minutes. */
export const SAVED_DEFAULTS = {
  sessionId: overviewId(1),
  userId: overviewId(2),
  date: '2026-11-08',
  completedAt: '2026-11-08T18:42:00.000Z',
  actualDurationMins: 42,
} as const

/** The `workout_sessions` row of a completed attempt. */
export function savedSessionRow(options: SavedOverviewOptions = {}): WorkoutSessionRow {
  const acceptance = overviewAcceptance({ composition: options.composition })
  const completedAt = options.completedAt ?? SAVED_DEFAULTS.completedAt
  const actual = options.actualDurationMins === undefined ? SAVED_DEFAULTS.actualDurationMins : options.actualDurationMins
  const startedAt = new Date(Date.parse(completedAt) - (actual ?? acceptance.effective_duration_target_mins) * 60_000).toISOString()
  return {
    id: options.sessionId ?? SAVED_DEFAULTS.sessionId,
    user_id: options.userId ?? SAVED_DEFAULTS.userId,
    location_id: null,
    created_at: startedAt,
    updated_at: completedAt,
    date: options.date ?? SAVED_DEFAULTS.date,
    title: acceptance.workout.title,
    overview: null,
    session_focus: acceptance.session_focus,
    goal_preset: acceptance.goal_preset,
    requested_duration_mins: acceptance.requested_duration_mins,
    effective_duration_target_mins: acceptance.effective_duration_target_mins,
    computed_duration_mins: options.computedDurationMins ?? null,
    actual_duration_mins: actual,
    requested_intensity: options.requestedIntensity ?? acceptance.requested_intensity,
    effective_intensity: options.effectiveIntensity ?? acceptance.effective_intensity,
    adjustment_reason: null,
    generation_notes: null,
    prompt_version: PROMPT_VERSION,
    contract_version: CONTRACT_VERSION,
    started_at: startedAt,
    completed_at: completedAt,
    abandoned_at: null,
    mood: null,
    session_notes: null,
    counts_for_streak: true,
  }
}

/** `session_as_performed` for that attempt: every row completed, as recorded. */
export function savedOverviewRecord(options: SavedOverviewOptions = {}): SessionReconstruction {
  const acceptance = overviewAcceptance({ composition: options.composition })
  const session = savedSessionRow(options)
  const at = session.started_at ?? session.created_at
  let movement = -1
  return {
    reconstruction: 'performed',
    as_of: session.completed_at,
    session,
    state: 'completed',
    sections: acceptance.workout.sections.map((section, sectionIndex) => {
      const sectionId = overviewId(100 + sectionIndex)
      return {
        section: {
          id: sectionId,
          session_id: session.id,
          created_at: at,
          updated_at: at,
          section_type: section.section_type,
          order_index: sectionIndex,
          section_title: section.section_title,
          section_notes: null,
        },
        blocks: section.blocks.map((planned, blockIndex) => {
          const blockId = overviewId(200 + sectionIndex * 10 + blockIndex)
          return {
            block: {
              id: blockId,
              section_id: sectionId,
              created_at: at,
              order_index: blockIndex,
              structure_type: planned.structure_type,
              rounds: planned.rounds,
              timer_type: planned.timer_type,
              timer_seconds: planned.timer_seconds,
              round_rest_seconds: planned.round_rest_seconds,
              rep_scheme: planned.rep_scheme,
              block_notes: null,
              ladder_timing: null,
            },
            block_result: null,
            exercises: planned.exercises.map((exercise, exerciseIndex) => {
              movement += 1
              return {
                exercise: {
                  id: overviewId(300 + movement),
                  block_id: blockId,
                  exercise_id: exercise.exercise_id,
                  order_index: exerciseIndex,
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
                  equipment_used: options.recordedEquipment?.[movement] ?? exercise.equipment,
                  is_interval_exercise: exercise.is_interval_exercise,
                  slot_id: overviewId(400 + movement),
                  replaces_id: null,
                  origin: 'generated' as const,
                  created_at: at,
                  superseded_at: null,
                  revision_status: 'active' as const,
                  execution_status: 'completed' as const,
                  exercise_notes: null,
                },
                set_logs: [],
              }
            }),
          }
        }),
      }
    }),
  }
}

/**
 * The completed Summary's pair (V12 / R107): a measured duration beside a
 * two-day streak that has not reached today, so the Streak cell carries the
 * extra `Through yesterday` line and the Duration cell's content is shorter.
 */
export const SUMMARY_PAIR = {
  durationMins: SAVED_DEFAULTS.actualDurationMins,
  streak: { days: 2, includesToday: false },
} as const
