/**
 * TASK-006 / JOURNEY-006: one synthetic composition for the timed
 * Start/Pause/Resume/Finish action hierarchy, shared by the focused check
 * (`src/ui/timed-workout-flow.test.tsx`) and the real-route browser proof
 * (`e2e/refinement/task-006.spec.ts`), so both perform identical data.
 *
 * One section — the last, so its forward action is Finish workout — holding
 * every timed family the journey names: an EMOM with a rest window inside each
 * minute (its rest is part of the prescription the Start follows), a
 * two-movement AMRAP, a plain For Time and the accepted long ladder (twelve
 * rungs and a fixed companion under one 07:00 cap, `gallery-refinement-flow-data.ts`).
 * Every block is performed as a group, so each card ends with its one Coaching
 * and notes disclosure (TASK-005): the slot the actions must precede.
 *
 * Synthetic and in memory only: no account, no catalog read, no write.
 */
import { AMRAP_BLOCK, FOR_TIME_BLOCK, peerGroupingAcceptance } from '../dev/gallery-refinement-cards-data'
import { timedLadderBlock } from '../dev/gallery-refinement-flow-data'
import type { SessionAcceptance, SessionSnapshot } from '../state/schemas'
import { formatBadgesSnapshot } from './format-badges-fixture'

type Block = SessionAcceptance['workout']['sections'][number]['blocks'][number]

/** EMOM: two movements alternating, ten minutes, the last 15 seconds of each minute rest. */
const EMOM_WITH_REST: Block = {
  structure_type: 'emom',
  rounds: null,
  timer_type: 'per_minute',
  timer_seconds: 600,
  round_rest_seconds: 15,
  rep_scheme: 'fixed',
  block_notes: null,
  exercises: AMRAP_BLOCK.exercises.map((exercise) => ({ ...exercise, is_interval_exercise: true })),
}

/** The long ladder: twelve rungs, the accepted `ladder-12` composition. */
export const LONG_LADDER_ROUNDS = 12

export const TIMED_FORMATS = ['emom', 'amrap', 'for_time', 'ladder'] as const
export type TimedFormat = (typeof TIMED_FORMATS)[number]

/** In the order the section performs them. */
export const TIMED_BLOCKS: Readonly<Record<TimedFormat, Block>> = {
  emom: EMOM_WITH_REST,
  amrap: AMRAP_BLOCK,
  for_time: FOR_TIME_BLOCK,
  ladder: timedLadderBlock(LONG_LADDER_ROUNDS),
}

/** The list each card names its work by — the work the actions follow. */
export const TIMED_LISTS: Readonly<Record<TimedFormat, string>> = {
  emom: 'Movements in this EMOM',
  amrap: 'Movements in this AMRAP',
  for_time: 'Movements in this block',
  ladder: 'Rounds in this ladder',
}

/** The format's own Start words, unchanged from the route's (C18: wording retained). */
export const TIMED_START: Readonly<Record<TimedFormat, string>> = {
  emom: 'Start EMOM',
  amrap: 'Start AMRAP',
  for_time: 'Start For Time',
  ladder: 'Start ladder',
}

/**
 * The format's primary end words (C18, R48, R68): a window that can still run
 * is ended early; a race or a ladder is finished.
 */
export const TIMED_FINISH: Readonly<Record<TimedFormat, string>> = {
  emom: 'Finish early',
  amrap: 'Finish early',
  for_time: 'Finish',
  ladder: 'Finish',
}

/** The section the composition is performed in. */
export const TIMED_SECTION = 'Accessory'

/** JOURNEY-006's entry state: every timed family ready in the workout's last section. */
export function timedActionsAcceptance({ locationId = null }: { locationId?: string | null } = {}): SessionAcceptance {
  return peerGroupingAcceptance({ locationId, blocks: TIMED_FORMATS.map((format) => TIMED_BLOCKS[format]) })
}

/**
 * The snapshot the session reads answer for the acceptance — prescribed, or
 * running with `startedAt` — with the ladder's explicit timing on its row.
 */
export function timedActionsSnapshot(
  acceptance: SessionAcceptance,
  options: { userId?: string; startedAt?: string | null } = {},
): SessionSnapshot {
  return formatBadgesSnapshot(acceptance, options)
}
