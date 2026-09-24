/**
 * EXE-01 — block completion, which the shell owns and the renderers do not.
 *
 * The requirement is explicit about why this is one path rather than six: the
 * `block_results` write and the perceived-effort capture belong to the shell,
 * and each renderer (EXE-03, EXE-04a…c) supplies only the fields its structure
 * actually observed. An EMOM knows `minutes_completed`, an AMRAP knows
 * `rounds_completed` and `partial_round_reps`, a For Time knows
 * `elapsed_seconds` and `completed_under_cap`, a ladder knows `highest_rung`.
 * None of them knows how hard it felt, none of them writes a row, and OVR-03
 * can therefore read every structure type through one column that is collected
 * the same way from day one.
 *
 * `BlockOutcome` is deliberately a sparse record rather than a union over
 * structure types. An outcome's *columns* are structure-specific; what the
 * shell does with them is not, and a union would make the shell branch on the
 * structure it exists to be indifferent to. An absent field is `null` — "not
 * observed" — and every field admits zero, because an AMRAP with no completed
 * rounds and an AMRAP nobody recorded are different facts (DATA_MODEL §8).
 */
import { createContext, use } from 'react'

import type { TablesInsert } from '../data/database.types'

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/** `block_results_perceived_effort_range`, mirrored. OVR-03's input. */
export const PERCEIVED_EFFORT_MIN = 1
export const PERCEIVED_EFFORT_MAX = 10

/**
 * The outcome a renderer supplies. Every field is optional, and omitting one
 * records `null` rather than a zero the structure never observed.
 */
export interface BlockOutcome {
  /** How long the block took, for every timed structure. */
  readonly elapsedSeconds?: number
  /** For Time: finished before the cap, or stopped at it. */
  readonly completedUnderCap?: boolean
  /** Circuits and AMRAPs. */
  readonly roundsCompleted?: number
  /** AMRAP: reps into the round the clock ended on. */
  readonly partialRoundReps?: number
  /** EMOM. */
  readonly minutesCompleted?: number
  /** Ladders: the rung reached, as a rung number rather than a rep target. */
  readonly highestRung?: number
  /** The user's own words, when a renderer collected any. */
  readonly notes?: string
}

/** An outcome plus the one thing the shell adds to every structure type. */
export interface BlockCompletion {
  readonly blockId: string
  readonly outcome: BlockOutcome
  /** 1–10, captured once, at completion, by the shell. */
  readonly perceivedEffort: number
}

// ─────────────────────────────────────────────────────────────────────────────
// The row
// ─────────────────────────────────────────────────────────────────────────────

/** `undefined` is not a value the database can hold; `null` is the observation. */
function recorded<T>(value: T | undefined): T | null {
  return value ?? null
}

/**
 * The `block_results` insert, from a completion. Pure, so the mapping is
 * testable without a transport, and typed by the generated `Insert` shape so a
 * renamed column fails to compile here rather than 400ing at PostgREST.
 */
export function blockResultInsert(
  completion: BlockCompletion,
): TablesInsert<'block_results'> {
  const { outcome } = completion

  return {
    block_id: completion.blockId,
    elapsed_seconds: recorded(outcome.elapsedSeconds),
    completed_under_cap: recorded(outcome.completedUnderCap),
    rounds_completed: recorded(outcome.roundsCompleted),
    partial_round_reps: recorded(outcome.partialRoundReps),
    minutes_completed: recorded(outcome.minutesCompleted),
    highest_rung: recorded(outcome.highestRung),
    perceived_effort: completion.perceivedEffort,
    notes: recorded(outcome.notes),
  }
}

/** True for an effort the CHECK constraint would accept. */
export function isPerceivedEffort(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= PERCEIVED_EFFORT_MIN &&
    value <= PERCEIVED_EFFORT_MAX
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The seam the renderers use
// ─────────────────────────────────────────────────────────────────────────────

export interface BlockCompletionApi {
  /**
   * Hands a block's outcome to the shell. The shell asks for perceived effort
   * and writes the row; a renderer never sees either step, which is what keeps
   * the capture to one path. Calling it twice for the same block is the shell's
   * problem to refuse, not the renderer's to remember.
   */
  completeBlock(blockId: string, outcome: BlockOutcome): void
  /** Blocks the shell has already written a result for, this session. */
  isBlockRecorded(blockId: string): boolean
}

export const BlockCompletionContext = createContext<BlockCompletionApi | null>(null)

/**
 * The renderers' half of the contract. Throwing outside the shell is the
 * point: a renderer that has escaped the shell would otherwise silently drop
 * the one write OVR-03 depends on.
 */
export function useBlockCompletion(): BlockCompletionApi {
  const api = use(BlockCompletionContext)
  if (api === null) {
    throw new Error('useBlockCompletion was called outside the workout shell')
  }
  return api
}
