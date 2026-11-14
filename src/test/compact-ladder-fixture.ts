/**
 * TASK-012 / JOURNEY-012: one synthetic composition for the compact truthful
 * ladder prescription, shared by the focused check
 * (`src/ui/ladder-rungs.test.tsx`) and the real-route browser proof
 * (`e2e/refinement/task-012.spec.ts`), so both read identical prescriptions on
 * `/review` and `/workout`.
 *
 * One conditioning section holds three ladders shaped as differently as the
 * data allows, so a renderer that reproduced the accepted screenshot's
 * constants — push up, burpee, `+2 per round`, twelve rounds, a 07:00 cap —
 * would fail every ladder but the first (AC-R012-01):
 *
 *   · `ACCEPTED_LADDER` — the accepted long ladder (R117, V11): the push up
 *     rising two reps a round to 24 with a fixed 4-rep burpee, twelve rounds in
 *     one 07:00 capped window, bodyweight (`timedLadderBlock(12)`, the gallery's
 *     `ladder-12` data);
 *   · `LOADED_LADDER` — a loaded descending ladder raced For Time: a 24 kg
 *     kettlebell swing falling three reps a round from 15, with a fixed 250 m
 *     row on a rower, five rounds under the block's 10:00 cap;
 *   · `SCHEDULED_LADDER` — a timed pyramid on a schedule with no cap: a plank
 *     held 20 → 50 → 20 seconds, which no constant step describes, with a fixed
 *     8-rep walking lunge each side carrying a 12 kg dumbbell pair, seven
 *     rounds starting every 01:15.
 *
 * Synthetic and in memory only: no account, no catalog read, no write.
 */
import { peerGroupingAcceptance } from '../dev/gallery-refinement-cards-data'
import { loadedLadderBlock, timedLadderBlock } from '../dev/gallery-refinement-flow-data'
import type { LadderTiming, SessionAcceptance, SessionSnapshot } from '../state/schemas'
import { sessionProgress, type BlockProgress } from '../state/workout-progress'
import { makePrescription, makeWorkoutBlock } from './factories'
import { formatBadgesSnapshot } from './format-badges-fixture'

type Block = SessionAcceptance['workout']['sections'][number]['blocks'][number]

const timed = { sets: null, rest_seconds: null, session_function: 'conditioning' as const }

/** The accepted long ladder: twelve rounds, push up 2…24 and a fixed burpee, 07:00 cap. */
export const ACCEPTED_ROUNDS = 12
export const ACCEPTED_LADDER: Block = timedLadderBlock(ACCEPTED_ROUNDS)

/**
 * The loaded descending ladder: kettlebell swing 15…3 at 24 kg, a fixed 250 m
 * row, 10:00 cap — the gallery register's own sample (`loadedLadderBlock`), so
 * the specimen and the route proof read one composition.
 */
export const LOADED_ROUNDS = 5
export const LOADED_LADDER: Block = loadedLadderBlock()

/** The scheduled pyramid: plank 20/30/40/50/40/30/20 s, a fixed 8-each-side lunge at 12 kg, every 01:15. */
export const SCHEDULED_ROUNDS = 7
export const SCHEDULED_INTERVAL = 75
export const SCHEDULED_TIMING: LadderTiming = {
  mode: 'scheduled_starts', rounds: SCHEDULED_ROUNDS, interval_seconds: SCHEDULED_INTERVAL, cap_seconds: null,
}
export const SCHEDULED_LADDER: Block = makeWorkoutBlock({
  structure_type: 'emom',
  timer_type: 'per_minute',
  timer_seconds: SCHEDULED_ROUNDS * SCHEDULED_INTERVAL,
  rep_scheme: 'pyramid',
  ladder_timing: SCHEDULED_TIMING,
  exercises: [
    makePrescription({
      exercise_id: 'plank', equipment: 'bodyweight', ...timed,
      modality: 'time', target_kind: 'sequence', target_value: null, target_sequence: [20, 30, 40, 50, 40, 30, 20],
      load_type: 'bodyweight', load_value: null,
    }),
    makePrescription({
      exercise_id: 'walking-lunge', equipment: 'dumbbell-pair', ...timed,
      per_side: true, target_value: 8,
      load_type: 'absolute', load_value: 12,
    }),
  ],
})

/** In the order the section performs them. */
export const COMPACT_LADDERS = [ACCEPTED_LADDER, LOADED_LADDER, SCHEDULED_LADDER] as const
export const COMPACT_LADDER_KEYS = ['accepted', 'loaded', 'scheduled'] as const
export type CompactLadderKey = (typeof COMPACT_LADDER_KEYS)[number]

/**
 * What each ladder states, read independently of the renderer from the
 * fixture's own data: the summary line per movement, every round's tile in
 * the ×/· notation, and the timing line with its round count and cap.
 */
export interface ExpectedLadder {
  readonly timing: string
  readonly movements: readonly string[]
  readonly rounds: readonly (readonly string[])[]
  /** The round tiles' visible text, `R1` first, in order. */
  readonly labels: readonly string[]
}

const pushUps = Array.from({ length: ACCEPTED_ROUNDS }, (_, index) => (index + 1) * 2)
const swings = [15, 12, 9, 6, 3]
const holds = [20, 30, 40, 50, 40, 30, 20]

export const EXPECTED: Readonly<Record<CompactLadderKey, ExpectedLadder>> = {
  accepted: {
    timing: '12 rounds · 07:00 cap on the whole ladder',
    movements: ['push up bodyweight · 2 → 24 reps · +2 per round', 'burpee bodyweight · 4 reps'],
    rounds: pushUps.map((reps) => [`${reps} × push up`, '4 × burpee']),
    labels: pushUps.map((_, index) => `R${index + 1}`),
  },
  loaded: {
    timing: '5 rounds · for time, at your pace · 10:00 cap',
    movements: ['kettlebell swing kettlebell · 15 → 3 reps · −3 per round · 24 kg', 'row rower · 250 m'],
    rounds: swings.map((reps) => [`${reps} × kettlebell swing`, '250 m row']),
    labels: swings.map((_, index) => `R${index + 1}`),
  },
  scheduled: {
    timing: '7 rounds · a new round every 01:15',
    movements: [
      'plank bodyweight · 20-30-40-50-40-30-20 sec',
      'walking lunge dumbbell pair · 8 reps each side · 12 kg',
    ],
    rounds: holds.map((seconds) => [`${seconds} sec plank`, '8 × walking lunge each side']),
    labels: holds.map((_, index) => `R${index + 1}`),
  },
}

/** JOURNEY-012's entry: the three ladders, ready, in one conditioning section. */
export function compactLadderAcceptance({ locationId = null }: { locationId?: string | null } = {}): SessionAcceptance {
  const base = peerGroupingAcceptance({ locationId, blocks: [...COMPACT_LADDERS] })
  const [section] = base.workout.sections
  return {
    ...base,
    prompt_version: 'gallery-task-012',
    workout: {
      ...base.workout,
      title: 'Synthetic compact ladder workout',
      sections: [{ ...section, section_type: 'conditioning', section_title: 'Ladders' }],
    },
  }
}

/** The snapshot the session reads answer, with each ladder's explicit timing on its row. */
export function compactLadderSnapshot(
  acceptance: SessionAcceptance,
  options: { userId?: string; startedAt?: string | null } = {},
): SessionSnapshot {
  return formatBadgesSnapshot(acceptance, options)
}

/** The three ladders as the live shell hands them to their renderer. */
export function compactLadderBlocks(snapshot: SessionSnapshot): Readonly<Record<CompactLadderKey, BlockProgress>> {
  const [accepted, loaded, scheduled] = sessionProgress(snapshot).sections[0].blocks
  return { accepted, loaded, scheduled }
}
