/**
 * TASK-007 / JOURNEY-007: one synthetic composition that puts every distinct
 * functional clock of the live workout on the real `/workout` route, shared by
 * the focused check (`src/ui/timer-frame-layout.test.tsx`) and the real-route
 * browser proof (`e2e/refinement/task-007.spec.ts`), so both read identical
 * prescribed data.
 *
 * Two sections, in the order the shell opens them:
 *
 *   · **Warm-up** — the preparation section the workout opens on: a timed
 *     hold (its own movement countdown) with a prescribed rest, so a
 *     preparation clock and the session's one rest are both reachable from
 *     the entry state.
 *   · **Strength and conditioning** — a standard lift whose card's Rest
 *     opens the logging sheet with the rest running (the journey's "open a
 *     log while rest is running"), a circuit with a timed station, a round
 *     rest and its round clock, and every format clock: an EMOM with a rest
 *     window in each minute, an AMRAP window, a capped For Time race, the
 *     accepted raced ladder (TASK-006's For Time clock) and a scheduled ladder
 *     (its interval countdown).
 *
 * Synthetic and in memory only: no account, no catalog read, no write.
 */
import { AMRAP_BLOCK, CIRCUIT_BLOCK, FOR_TIME_BLOCK, STANDARD_BLOCK, peerGroupingAcceptance } from '../dev/gallery-refinement-cards-data'
import { timedLadderBlock } from '../dev/gallery-refinement-flow-data'
import type { SessionAcceptance, SessionSnapshot } from '../state/schemas'
import { formatBadgesSnapshot } from './format-badges-fixture'
import { TIMED_BLOCKS } from './timed-actions-fixture'

type Block = SessionAcceptance['workout']['sections'][number]['blocks'][number]

/** The preparation hold: thirty seconds, twice, with a twenty-second rest. */
export const PREPARATION_HOLD_SECONDS = 30
export const PREPARATION_REST_SECONDS = 20

const WARM_UP_BLOCK: Block = {
  structure_type: 'standard',
  rounds: null,
  timer_type: 'none',
  timer_seconds: null,
  round_rest_seconds: null,
  rep_scheme: 'fixed',
  block_notes: null,
  exercises: [{
    exercise_id: 'plank',
    equipment: 'bodyweight',
    session_function: 'prep',
    anchor_relationship: 'complementary',
    modality: 'time',
    sets: 2,
    target_kind: 'fixed',
    target_value: PREPARATION_HOLD_SECONDS,
    target_min: null,
    target_max: null,
    target_sequence: null,
    per_side: false,
    distance_unit: null,
    rest_seconds: PREPARATION_REST_SECONDS,
    tempo: null,
    load_type: 'bodyweight',
    load_value: null,
    is_interval_exercise: false,
  }],
}

/**
 * The scheduled ladder: four rounds, a new one every minute — its own
 * movements, so its coaching group is named apart from the raced ladder's.
 */
const SCHEDULED_LADDER_BLOCK: Block = (() => {
  const ladder = timedLadderBlock(4)
  const [rising, companion] = ladder.exercises
  return {
    ...ladder,
    structure_type: 'emom',
    timer_type: 'per_minute',
    timer_seconds: 240,
    ladder_timing: { mode: 'scheduled_starts', rounds: 4, interval_seconds: 60, cap_seconds: null },
    exercises: [{ ...rising, exercise_id: 'air-squat' }, { ...companion, exercise_id: 'sit-up' }],
  }
})()

/** The standard lift's rest: the one the journey opens a log over. */
export const LIFT_REST_SECONDS = 120

/** The main section's blocks, in the order it performs them. */
export const TIMER_FRAME_BLOCKS = {
  standard: STANDARD_BLOCK,
  circuit: CIRCUIT_BLOCK,
  emom: TIMED_BLOCKS.emom,
  amrap: AMRAP_BLOCK,
  for_time: FOR_TIME_BLOCK,
  ladder: timedLadderBlock(4),
  scheduled: SCHEDULED_LADDER_BLOCK,
} as const

export type TimerFrameBlock = keyof typeof TIMER_FRAME_BLOCKS

/** The list each live card names its work by. */
export const TIMER_FRAME_LISTS: Readonly<Record<'emom' | 'amrap' | 'for_time' | 'ladder', string>> = {
  emom: 'Movements in this EMOM',
  amrap: 'Movements in this AMRAP',
  for_time: 'Movements in this block',
  ladder: 'Rounds in this ladder',
}

export const PREPARATION_SECTION = 'Warm-up'
export const MAIN_SECTION = 'Strength and conditioning'

/** JOURNEY-007's entry: the preparation section first, then every other clock. */
export function timerFramesAcceptance({ locationId = null }: { locationId?: string | null } = {}): SessionAcceptance {
  const main = peerGroupingAcceptance({ locationId, blocks: Object.values(TIMER_FRAME_BLOCKS) })
  return {
    ...main,
    prompt_version: 'gallery-task-007',
    workout: {
      ...main.workout,
      title: 'Synthetic timer frames workout',
      sections: [
        { section_type: 'warmup', section_title: PREPARATION_SECTION, section_notes: null, blocks: [WARM_UP_BLOCK] },
        { ...main.workout.sections[0], section_title: MAIN_SECTION },
      ],
    },
  }
}

/** The snapshot the session reads answer: running since `startedAt`. */
export function timerFramesSnapshot(
  acceptance: SessionAcceptance,
  options: { userId?: string; startedAt?: string | null } = {},
): SessionSnapshot {
  return formatBadgesSnapshot(acceptance, options)
}
