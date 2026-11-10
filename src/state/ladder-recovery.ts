/**
 * TASK-032 (REQ-032; TASK-AC-381E586395ED, TASK-AC-406D2CE971AA,
 * TASK-AC-A168ED4B8418) — one live ladder attempt as durable state: its
 * ordered progress, the current result draft, the accidental-Finish checkpoint
 * Undo returns to, and the original cap and paused/elapsed clock it is read
 * against.
 *
 * Why it exists. The ladder's race clock already survives a reload (EXE-04b's
 * For Time record, `clear.workout-for-time`), but nothing else about the
 * attempt did: the rungs checked off, the answer and entries in its log, and
 * the state an accidental Finish should be undone to were renderer memory. This
 * module is that state as pure arithmetic over one record, and
 * `workout-persistence.ts` (`usePersistedLadder`) is where it is kept. The
 * visible adoption — live check-off (TASK-013), quiet Undo (TASK-014), the
 * shared timed log (TASK-046) and complete reload/reconnect/save recovery
 * (TASK-048) — belongs to those tasks; this is the contract they build on.
 *
 * The rules, each from an approved source rather than chosen here:
 *
 *   · **The clock is the existing owner's.** The record's `clock` is a
 *     `ForTimeState`, moved only by `for-time.ts` (`startForTime`,
 *     `finishForTime`) and `timed-lifecycle.ts` (`pauseClock`, `resumeClock`)
 *     and read through `forTimeView` against the wall clock
 *     (`workout-clock.ts`'s `elapsedSeconds`). So a reload counts the time the
 *     tab was closed while the clock ran and none while it was paused — the
 *     confirmed pause semantics (TASK-006, R98) — and expiry is derived, never
 *     written: a cap that passed while the phone was locked comes back capped.
 *   · **The original cap.** The cap is stamped once, when the attempt is
 *     created, and every later reading uses it. Nothing re-reads the block to
 *     extend it (R124: "do not resume past it or add an unrequested deadline
 *     extension").
 *   · **Ordered progress** is one number, the rungs completed through
 *     (0…rungs), as the accepted owner's `completedThrough` is; `null` is
 *     "never tracked", which is not the same as zero. Checking off is live
 *     only while the clock runs or is paused.
 *   · **Finish is a checkpoint, not a verdict** (C36, C38, R69, R124). It stops
 *     the clock where it is (at the pause, for a paused clock), carries tracked
 *     progress into the editable draft, and remembers the pause state and the
 *     pre-Finish answer. Undo restores "as though it had not occurred": a
 *     running clock resumes with the time spent finished counted as elapsed
 *     (no hidden extension), a paused one is paused again, live progress comes
 *     back from the draft's rung, and the draft's entries stay. Undo is not
 *     offered once the original cap has passed, nor after a save.
 *   · **A saved result is authoritative.** A successful save, or the server's
 *     word that the block's row exists (the provider's `isBlockRecorded`),
 *     closes the attempt: no Undo, no clock action, no draft edit. A local draft
 *     is never offered over a row this device did not see saved. A failed save
 *     changes nothing but the save state, so the retry sends the same draft.
 *   · **Only what the ladder writes today is an outcome.** `ladderDraftOutcome`
 *     yields `highest_rung` alone. Effort, notes and per-movement entries are
 *     kept durably for their owners (TASK-015, TASK-031, TASK-046) and never
 *     written from here; no category becomes a number.
 *
 * Nothing here touches storage or React. Every function is total: an action
 * that does not apply returns the same record, so a caller can tell a refusal
 * from a change by identity.
 */
import { Constants, type Enums } from '../data/database.types'
import type { MovementActualDraft } from '../data/refinement-logging-contract'
import type { BlockOutcome } from './block-completion'
import {
  clampForTimeState,
  finishForTime,
  forTimeLifecycle,
  forTimeTicking,
  forTimeView,
  FOR_TIME_START,
  startForTime,
  type ForTimePhase,
  type ForTimeState,
  type ForTimeView,
} from './for-time'
import { explicitLadderTiming, ladderCapSeconds } from './ladder'
import {
  isClockPaused,
  pauseClock,
  resumeClock,
  type TimedLifecyclePhase,
} from './timed-lifecycle'
import { elapsedSeconds } from './workout-clock'
import type { BlockProgress } from './workout-progress'

// ─────────────────────────────────────────────────────────────────────────────
// The record
// ─────────────────────────────────────────────────────────────────────────────

/** The stored shape's version. A record of any other version is not restored. */
export const LADDER_ATTEMPT_VERSION = 1

/**
 * Which attempt a record is. All three must match before anything is restored
 * or replaced: a record from another workout (session), another block, or
 * another attempt at this block never attaches to this one.
 */
export interface LadderAttemptIdentity {
  readonly sessionId: string
  readonly blockId: string
  /** Minted once, when the attempt is first created; never changes. */
  readonly attemptId: string
}

/**
 * The ladder's result draft, as the accepted log holds it
 * (`TimedResultDraft`): the answer, the rung, the optional effort and notes,
 * and each movement's entry as typed.
 */
export interface LadderDraft {
  /** Complete (true), Incomplete (false), or unanswered (null). */
  readonly completed: boolean | null
  /** Rungs completed through, 0…rungs; null when none is stated. Zero is a measurement. */
  readonly highestRung: number | null
  /** One of the existing three faces, or unanswered. Never a number. */
  readonly effort: Enums<'set_effort'> | null
  readonly notes: string
  /** By `workout_exercises.id`: the TASK-030 contract's movement entry, as typed. */
  readonly movements: Readonly<Record<string, MovementActualDraft>>
}

export const EMPTY_LADDER_DRAFT: LadderDraft = {
  completed: null,
  highestRung: null,
  effort: null,
  notes: '',
  movements: {},
}

/** What an accidental Finish is undone to (C38): the pause, progress and answer before it. */
export interface LadderFinishCheckpoint {
  /** The pause stamp the clock carried at Finish; null when it was running. */
  readonly pausedAt: string | null
  /** Live progress at Finish. */
  readonly progress: number | null
  /** The draft's answer before Finish carried progress into it. */
  readonly completed: boolean | null
}

/**
 * Where the result's save stands. `saved` is a one-way latch: `save` when this
 * device's save was answered, `server` when the server reported a row this
 * device never saw saved (another device, or an answer lost in transit).
 */
export type LadderSaveState =
  | { readonly status: 'unsaved' }
  | { readonly status: 'failed'; readonly at: string }
  | { readonly status: 'saved'; readonly at: string; readonly source: 'save' | 'server' }

export interface LadderAttempt {
  readonly version: typeof LADDER_ATTEMPT_VERSION
  readonly identity: LadderAttemptIdentity
  /** The cap the attempt is raced against, stamped at creation; null for none. */
  readonly originalCapSeconds: number | null
  /** The race clock, in the existing For Time owner's shape. */
  readonly clock: ForTimeState
  /** Rungs completed through, live; null when never tracked. */
  readonly progress: number | null
  /** The result draft; null until something is answered or the attempt ends. */
  readonly draft: LadderDraft | null
  /**
   * Whether the end of the attempt has carried tracked progress into the draft.
   * Finish carries it at once; a cap reached while away is carried lazily, by
   * the first edit or save after it, so a later edit is never overwritten.
   */
  readonly endCarried: boolean
  /** Set by Finish; cleared by Undo and by a save. */
  readonly checkpoint: LadderFinishCheckpoint | null
  readonly save: LadderSaveState
}

// ─────────────────────────────────────────────────────────────────────────────
// Creating and restoring
// ─────────────────────────────────────────────────────────────────────────────

/** A cap as the clock reads one: whole seconds, at least one; null for none or nonsense. */
export function normalizedCapSeconds(cap: number | null | undefined): number | null {
  if (cap === null || cap === undefined || !Number.isFinite(cap)) return null
  return Math.max(1, Math.trunc(cap))
}

/**
 * The cap a raced ladder runs against: a capped window's own cap, else the
 * block's `timer_seconds` — the expression the route's ladder clock reads
 * (`useLadderRace` in `ladder-block.tsx`). A scheduled ladder has no cap here;
 * its end is its schedule's (`scheduledRoundAt`).
 */
export function ladderRaceCapSeconds(
  block: Pick<BlockProgress, 'repScheme' | 'ladderTiming' | 'timerSeconds'>,
): number | null {
  const timing = explicitLadderTiming(block)
  if (timing?.mode === 'scheduled_starts') return null
  return normalizedCapSeconds((timing === null ? null : ladderCapSeconds(timing)) ?? block.timerSeconds)
}

export interface LadderAttemptSeed {
  readonly sessionId: string
  readonly blockId: string
  /** The block's cap now; it becomes the attempt's original cap. */
  readonly capSeconds: number | null
  readonly mintId: () => string
}

/** A new, unstarted attempt. Nothing is stored until something happens to it. */
export function createLadderAttempt(seed: LadderAttemptSeed): LadderAttempt {
  return {
    version: LADDER_ATTEMPT_VERSION,
    identity: { sessionId: seed.sessionId, blockId: seed.blockId, attemptId: seed.mintId() },
    originalCapSeconds: normalizedCapSeconds(seed.capSeconds),
    clock: FOR_TIME_START,
    progress: null,
    draft: null,
    endCarried: false,
    checkpoint: null,
    save: { status: 'unsaved' },
  }
}

/**
 * Adopts a ladder clock written before this record existed — the For Time
 * record every raced ladder has kept under `clear.workout-for-time` — as a new
 * attempt. Only the clock is known: no progress was tracked, no draft was
 * kept, and an attempt already finished has no checkpoint, so it cannot be
 * undone (its pause state at Finish was never written). The cap is the block's,
 * which is what that clock was raced against.
 */
export function adoptLegacyLadderClock(seed: LadderAttemptSeed, clock: ForTimeState): LadderAttempt {
  const restored = clampForTimeState(clock)
  return {
    ...createLadderAttempt(seed),
    // The race clock only: a For Time answer (`workCompleted`) is not the ladder's.
    clock: {
      startedAt: restored.startedAt,
      finishedAt: restored.finishedAt,
      ...(restored.pausedAt === undefined ? {} : { pausedAt: restored.pausedAt }),
    },
  }
}

function rungOrNull(value: number | null, rungCount: number): number | null {
  return value !== null && value <= rungCount ? value : null
}

/**
 * A restored record, made safe for the block it is restored into: the clock
 * repaired as `clampForTimeState` repairs any race, and a rung that no longer
 * exists — progress, a draft's rung or a checkpoint's — dropped rather than
 * clamped, because a rung the ladder does not have is not one the athlete
 * reached.
 */
export function clampLadderAttempt(attempt: LadderAttempt, rungCount: number): LadderAttempt {
  const clock = clampForTimeState(attempt.clock)
  const draft = attempt.draft === null ? null : { ...attempt.draft, highestRung: rungOrNull(attempt.draft.highestRung, rungCount) }
  const checkpoint =
    attempt.checkpoint === null || clock.finishedAt === null
      ? null
      : { ...attempt.checkpoint, progress: rungOrNull(attempt.checkpoint.progress, rungCount) }
  return { ...attempt, clock, progress: rungOrNull(attempt.progress, rungCount), draft, checkpoint }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the clock
// ─────────────────────────────────────────────────────────────────────────────

function clockViewAt(clock: ForTimeState, capSeconds: number | null, now: number): ForTimeView {
  // `forTimeView` reads only the cap from its shape; the movement count is not
  // part of a clock reading.
  return forTimeView(clock, { capSeconds, size: 0 }, elapsedSeconds(forTimeTicking(clock), now))
}

/** The attempt's clock at `now`, against its original cap. */
export function ladderClockView(attempt: LadderAttempt, now: number): ForTimeView {
  return clockViewAt(attempt.clock, attempt.originalCapSeconds, now)
}

function isLive(phase: ForTimePhase): boolean {
  return phase === 'running' || phase === 'paused'
}

function isEnded(phase: ForTimePhase): boolean {
  return phase === 'finished' || phase === 'capped'
}

function isClosed(attempt: LadderAttempt): boolean {
  return attempt.save.status === 'saved'
}

/** The clock Undo would restore: the attempt before Finish, or null when there is no Finish to undo. */
function clockBeforeFinish(attempt: LadderAttempt): ForTimeState | null {
  const { checkpoint, clock } = attempt
  if (checkpoint === null || clock.startedAt === null || clock.finishedAt === null) return null
  return {
    startedAt: clock.startedAt,
    finishedAt: null,
    ...(checkpoint.pausedAt === null ? {} : { pausedAt: checkpoint.pausedAt }),
  }
}

export type LadderUndoAvailability =
  | { readonly available: true }
  | {
      readonly available: false
      /**
       * `saved` — the result is saved; `not-finished` — there is no athlete's
       * Finish to undo (running, paused, never started, ended by the cap, or
       * finished before this record existed); `expired` — undoing would resume
       * a clock already at its original cap.
       */
      readonly reason: 'saved' | 'not-finished' | 'expired'
    }

/**
 * Whether an accidental Finish can be undone at `now` (C38, R124). `recorded`
 * is the server's word that the block's row exists.
 */
export function ladderUndoAvailability(attempt: LadderAttempt, now: number, recorded = false): LadderUndoAvailability {
  if (isClosed(attempt) || recorded) return { available: false, reason: 'saved' }
  const before = clockBeforeFinish(attempt)
  if (before === null) return { available: false, reason: 'not-finished' }
  if (clockViewAt(before, attempt.originalCapSeconds, now).phase === 'capped') {
    return { available: false, reason: 'expired' }
  }
  return { available: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// The draft
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The block outcome the shell's one writer records for the draft: Complete is
 * the top rung, Incomplete the stated rung (zero included) or nothing, and an
 * unanswered draft nothing (the existing ladder mapping, `ladder-block.tsx`).
 * Effort, notes and movement entries are not part of it: no ladder writer for
 * them exists yet (TASK-015, TASK-031, TASK-046).
 */
export function ladderDraftOutcome(draft: LadderDraft | null, rungCount: number): BlockOutcome {
  if (draft === null || rungCount === 0 || draft.completed === null) return {}
  if (draft.completed) return { highestRung: rungCount }
  return draft.highestRung === null ? {} : { highestRung: draft.highestRung }
}

// The TASK-030 contract's two ladder rules, restated rather than imported: the
// contract module (`src/data/refinement-logging-contract.ts`) is mostly data
// tables, and a runtime import would ship them in the workout bundle. Both are
// pinned equal to the contract's own functions (`partialRoundFor`,
// `draftsAfterProgressChange`) by `refinement-ladder-recovery.test.ts`.

/** The contract's ladder partial round: the rung after the last completed one, while one is left. */
export function ladderPartialRound(highestRung: number | null, rungCount: number): number | null {
  if (highestRung === null) return null
  const next = highestRung + 1
  return next <= rungCount ? next : null
}

/**
 * The contract's rule for a change of round: an amount belongs to one round,
 * so when the round changes every amount is cleared and every load kept.
 */
export function movementsAfterRoundChange(
  movements: Readonly<Record<string, MovementActualDraft>>,
  fromRound: number | null,
  toRound: number | null,
): Readonly<Record<string, MovementActualDraft>> {
  if (fromRound === toRound) return movements
  return Object.fromEntries(Object.entries(movements).map(([id, entry]) => [id, { amount: '', weight: entry.weight }]))
}

/**
 * The round the draft's movement amounts belong to: the rung after the stated
 * one while one is left, none once Complete. It follows the stated rung even
 * while the answer is open — after an Undo the draft keeps its rung with no
 * ending answer — so undoing and finishing again at the same rung keeps the
 * athlete's entries.
 */
function partialRound(draft: LadderDraft, rungCount: number): number | null {
  if (draft.completed === true) return null
  return ladderPartialRound(draft.highestRung, rungCount)
}

/**
 * The draft with a new answer and rung. When that moves the round a partial
 * belongs to, every amount is cleared and every load kept — the accepted
 * owner's rule from the TASK-030 contract, restated as `movementsAfterRoundChange`.
 */
function withAnswer(
  draft: LadderDraft,
  answer: { completed: boolean | null; highestRung: number | null },
  rungCount: number,
): LadderDraft {
  const highestRung = answer.completed === true ? rungCount : answer.highestRung
  const next: LadderDraft = { ...draft, completed: answer.completed, highestRung }
  return {
    ...next,
    movements: movementsAfterRoundChange(draft.movements, partialRound(draft, rungCount), partialRound(next, rungCount)),
  }
}

/**
 * Tracked progress, carried into the log when the attempt ends (C36): every
 * rung checked is Complete with the top rung; fewer is Incomplete through the
 * last one checked. Nothing tracked leaves the athlete's own answer as it is.
 */
function carryProgress(draft: LadderDraft | null, progress: number | null, rungCount: number): LadderDraft | null {
  if (progress === null) return draft
  const completed = rungCount > 0 && progress >= rungCount
  return withAnswer(draft ?? EMPTY_LADDER_DRAFT, { completed, highestRung: progress }, rungCount)
}

function effectiveDraft(attempt: LadderAttempt, rungCount: number, ended: boolean): LadderDraft | null {
  return ended && !attempt.endCarried ? carryProgress(attempt.draft, attempt.progress, rungCount) : attempt.draft
}

/** A change to the draft. Absent fields are left as they are. */
export type LadderDraftPatch = Partial<LadderDraft>

const EFFORTS: readonly string[] = Constants.public.Enums.set_effort

function isMovementDraft(value: unknown): value is MovementActualDraft {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return typeof entry.amount === 'string' && typeof entry.weight === 'string'
}

/** Whether a patch states only values the draft can hold. */
function isValidPatch(patch: LadderDraftPatch, rungCount: number): boolean {
  const { completed, highestRung, effort, notes, movements } = patch
  return (
    (completed === undefined || completed === null || typeof completed === 'boolean') &&
    (highestRung === undefined ||
      highestRung === null ||
      (Number.isInteger(highestRung) && highestRung >= 0 && highestRung <= rungCount)) &&
    (effort === undefined || effort === null || EFFORTS.includes(effort)) &&
    (notes === undefined || typeof notes === 'string') &&
    (movements === undefined ||
      (typeof movements === 'object' && movements !== null && Object.values(movements).every(isMovementDraft)))
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────────

function stamp(now: number): string {
  return new Date(now).toISOString()
}

/** Start. A started, or saved, attempt is unchanged: a second Start is not a restart. */
export function startLadderAttempt(attempt: LadderAttempt, now: number): LadderAttempt {
  if (isClosed(attempt) || attempt.clock.startedAt !== null) return attempt
  return { ...attempt, clock: startForTime(attempt.clock, now) }
}

/** Pause a running clock under its cap. */
export function pauseLadderAttempt(attempt: LadderAttempt, now: number): LadderAttempt {
  if (isClosed(attempt) || ladderClockView(attempt, now).phase !== 'running') return attempt
  return { ...attempt, clock: pauseClock(attempt.clock, now) }
}

/** Resume a paused clock: the active time and the window left are what they were. */
export function resumeLadderAttempt(attempt: LadderAttempt, now: number): LadderAttempt {
  if (isClosed(attempt) || ladderClockView(attempt, now).phase !== 'paused') return attempt
  return { ...attempt, clock: resumeClock(attempt.clock, now) }
}

/**
 * Live check-off: the rungs completed through, in order (a tap on a checked
 * rung is `rung - 1`). Only while the clock runs or is paused; never after the
 * attempt ends, before it starts, or once saved.
 */
export function trackLadderProgress(attempt: LadderAttempt, through: number, rungCount: number, now: number): LadderAttempt {
  if (isClosed(attempt) || !isLive(ladderClockView(attempt, now).phase)) return attempt
  if (!Number.isInteger(through) || through < 0 || through > rungCount || through === attempt.progress) return attempt
  return { ...attempt, progress: through }
}

/**
 * The athlete's Finish: the clock stops (at the pause, for a paused clock),
 * tracked progress carries into the draft, and the checkpoint keeps what Undo
 * restores. Not after the cap: the cap has already ended the attempt.
 */
export function finishLadderAttempt(attempt: LadderAttempt, rungCount: number, now: number): LadderAttempt {
  if (isClosed(attempt) || !isLive(ladderClockView(attempt, now).phase)) return attempt
  return {
    ...attempt,
    clock: finishForTime(attempt.clock, now),
    checkpoint: {
      pausedAt: isClockPaused(attempt.clock) ? (attempt.clock.pausedAt ?? null) : null,
      progress: attempt.progress,
      completed: attempt.draft?.completed ?? null,
    },
    draft: carryProgress(attempt.draft, attempt.progress, rungCount),
    endCarried: true,
  }
}

/**
 * Undo an accidental Finish (C38, R124), while `ladderUndoAvailability` allows
 * it: the clock as it was before Finish — running from the same start, so the
 * time spent finished counts, or paused at the same moment — live progress
 * from the draft's rung (the log may have corrected it), the draft's entries
 * kept and its ending answer back to what it was before Finish.
 */
export function undoLadderFinish(attempt: LadderAttempt, rungCount: number, now: number): LadderAttempt {
  const before = clockBeforeFinish(attempt)
  if (before === null || attempt.checkpoint === null || !ladderUndoAvailability(attempt, now).available) return attempt
  const rung = attempt.draft?.highestRung ?? null
  return {
    ...attempt,
    clock: before,
    progress: rung !== null && rung <= rungCount ? rung : attempt.checkpoint.progress,
    draft: attempt.draft === null ? null : { ...attempt.draft, completed: attempt.checkpoint.completed },
    endCarried: false,
    checkpoint: null,
  }
}

/**
 * Edit the draft: the answer, rung, effort, notes or movement entries, at any
 * time before the result is saved. A value the draft cannot hold refuses the
 * whole patch. Choosing Complete records the top rung; a change of rung clears
 * the movement amounts it moved and keeps their loads.
 */
export function editLadderDraft(attempt: LadderAttempt, patch: LadderDraftPatch, rungCount: number, now: number): LadderAttempt {
  if (isClosed(attempt) || !isValidPatch(patch, rungCount)) return attempt
  const ended = isEnded(ladderClockView(attempt, now).phase)
  const base = effectiveDraft(attempt, rungCount, ended) ?? EMPTY_LADDER_DRAFT
  const answered = withAnswer(
    base,
    {
      completed: patch.completed === undefined ? base.completed : patch.completed,
      highestRung: patch.highestRung === undefined ? base.highestRung : patch.highestRung,
    },
    rungCount,
  )
  const draft: LadderDraft = {
    ...answered,
    ...(patch.effort === undefined ? {} : { effort: patch.effort }),
    ...(patch.notes === undefined ? {} : { notes: patch.notes }),
    ...(patch.movements === undefined ? {} : { movements: { ...answered.movements, ...patch.movements } }),
  }
  return { ...attempt, draft, endCarried: attempt.endCarried || ended }
}

/** Close the attempt: the clock stopped, the draft as it stands, no checkpoint. */
function closed(attempt: LadderAttempt, rungCount: number, now: number, source: 'save' | 'server'): LadderAttempt {
  const view = ladderClockView(attempt, now)
  const running = attempt.clock.startedAt !== null && attempt.clock.finishedAt === null
  return {
    ...attempt,
    clock: running ? finishForTime(attempt.clock, now) : attempt.clock,
    draft: effectiveDraft(attempt, rungCount, isEnded(view.phase)),
    endCarried: true,
    checkpoint: null,
    save: { status: 'saved', at: stamp(now), source },
  }
}

/**
 * This attempt's result was saved. Undo is gone, the draft is frozen as sent
 * and a clock still running stops: nothing can be recorded after the save. An
 * answer for another attempt changes nothing.
 */
export function ladderSaveSucceeded(attempt: LadderAttempt, attemptId: string, rungCount: number, now: number): LadderAttempt {
  if (attempt.identity.attemptId !== attemptId || isClosed(attempt)) return attempt
  return closed(attempt, rungCount, now, 'save')
}

/** The save failed: the draft, progress and checkpoint stay for the retry. */
export function ladderSaveFailed(attempt: LadderAttempt, attemptId: string, now: number): LadderAttempt {
  if (attempt.identity.attemptId !== attemptId || isClosed(attempt)) return attempt
  return { ...attempt, save: { status: 'failed', at: stamp(now) } }
}

/** The server reports the block's row: the saved (or corrected) result is the authority. */
export function ladderRecorded(attempt: LadderAttempt, rungCount: number, now: number): LadderAttempt {
  if (isClosed(attempt)) return attempt
  return closed(attempt, rungCount, now, 'server')
}

// ─────────────────────────────────────────────────────────────────────────────
// The read model
// ─────────────────────────────────────────────────────────────────────────────

export interface LadderAttemptView {
  /** The clock at `now`, against the original cap. */
  readonly clock: ForTimeView
  /** What the shared Start/Pause/Resume/Finish actions offer; `ended` once closed. */
  readonly lifecycle: TimedLifecyclePhase
  /** Finished by the athlete or ended by the cap. */
  readonly ended: boolean
  /**
   * `draft` — unsaved, the local draft is the result; `saved-here` — this
   * device's save was answered and the draft is what it sent; `saved-elsewhere`
   * — the server has a row this device never saw saved, so no local draft is
   * claimed and the row is read back (TASK-048).
   */
  readonly authority: 'draft' | 'saved-here' | 'saved-elsewhere'
  readonly progress: number | null
  /** Live check-off is accepted. */
  readonly canTrack: boolean
  /** The draft the log shows: tracked progress carried in once ended; null when none is claimed. */
  readonly draft: LadderDraft | null
  readonly editable: boolean
  /** What the shell's one block writer is given. */
  readonly outcome: BlockOutcome
  readonly undo: LadderUndoAvailability
  /** The last save attempt failed; the draft is kept for the retry. */
  readonly saveFailed: boolean
}

export interface LadderViewContext {
  readonly rungCount: number
  readonly now: number
  /** The server's word that the block's row exists (`isBlockRecorded`). */
  readonly recorded: boolean
}

/** Everything a consumer draws or reports, derived from the record and the wall clock. */
export function ladderAttemptView(attempt: LadderAttempt, { rungCount, now, recorded }: LadderViewContext): LadderAttemptView {
  const clock = ladderClockView(attempt, now)
  const ended = isEnded(clock.phase)
  const authority =
    attempt.save.status === 'saved'
      ? attempt.save.source === 'save'
        ? 'saved-here'
        : 'saved-elsewhere'
      : recorded
        ? 'saved-elsewhere'
        : 'draft'
  const closedNow = authority !== 'draft'
  const draft = authority === 'saved-elsewhere' ? null : effectiveDraft(attempt, rungCount, ended)
  return {
    clock,
    lifecycle: closedNow ? 'ended' : forTimeLifecycle(clock.phase),
    ended,
    authority,
    progress: attempt.progress,
    canTrack: !closedNow && isLive(clock.phase),
    draft,
    editable: !closedNow,
    outcome: ladderDraftOutcome(draft, rungCount),
    undo: ladderUndoAvailability(attempt, now, recorded),
    saveFailed: attempt.save.status === 'failed',
  }
}
