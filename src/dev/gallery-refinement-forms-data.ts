/**
 * TASK-009 — the accepted `/gallery/refinements?state=amrap` composition
 * (accepted gallery reference eded158cfd928d382c9a9409e2c372270312741d,
 * "AMRAP results"), as the live shell hands each block to its renderer, and
 * the two ended attempts the state shows: the route fixture's AMRAP — a loaded
 * kettlebell swing and a bodyweight burpee as one round, eight minutes
 * (`AMRAP_BLOCK`) — and the accepted reference's own sample, the kettlebell
 * swing alone. Two distinct blocks, so each card's own landmarks (its Coaching
 * and notes) keep distinct names on one page.
 *
 * Synthetic and in memory only: no account, no catalog read, no write. Each
 * attempt is the record the route's own AMRAP keeps (`amrap.ts`), seeded into
 * the gallery mount's memory storage — never the route's.
 *
 * TASK-010 adds the accepted `for_time` and `ladder` states' attempts (below):
 * the race clock each block's own renderer keeps (`for-time.ts`), seeded the
 * same way.
 *
 * TASK-011 adds the accepted `emom` state's attempts (below): the minute grid
 * the route's own EMOM keeps (`emom.ts`), seeded the same way.
 */
import type { AmrapState } from '../state/amrap'
import type { EmomState } from '../state/emom'
import type { ForTimeState } from '../state/for-time'
import type { SessionAcceptance } from '../state/schemas'
import { structureIdentity, type BlockProgress } from '../state/workout-progress'
import { AMRAP_BLOCK, EMOM_BLOCK, FOR_TIME_BLOCK } from './gallery-refinement-cards-data'
import { galleryExerciseProgress } from './gallery-refinement-coaching-data'
import { LADDER_CAP_SECONDS, timedLadderBlock } from './gallery-refinement-flow-data'

type Block = SessionAcceptance['workout']['sections'][number]['blocks'][number]

/** The accepted reference's sample AMRAP: the kettlebell swing alone, twelve a round, eight minutes. */
export const ACCEPTED_SAMPLE_AMRAP: Block = { ...AMRAP_BLOCK, exercises: [AMRAP_BLOCK.exercises[0]] }

/** An AMRAP as the live shell hands it to its renderer, under one of the gallery's ids. */
export function galleryAmrapProgress(block: Block, blockIndex: number): BlockProgress {
  const exercises = galleryExerciseProgress(block, blockIndex)
  return {
    blockId: exercises[0].blockId,
    structureType: block.structure_type,
    repScheme: block.rep_scheme,
    identity: structureIdentity(block),
    status: 'not_started',
    exerciseCount: exercises.length,
    exercises,
    timerType: block.timer_type,
    rounds: block.rounds,
    roundRestSeconds: block.round_rest_seconds,
    timerSeconds: block.timer_seconds,
    ladderTiming: null,
  }
}

export type GalleryAmrapAttempt = 'cap' | 'early'

export interface GalleryAmrapAttemptSpec {
  readonly id: GalleryAmrapAttempt
  readonly title: string
  /** The AMRAP the attempt performed. */
  readonly block: Block
  /** The gallery block index the attempt's ids are drawn from. */
  readonly blockIndex: number
  /** The AMRAP's own stored record for this attempt, read against `now`. */
  record(now: number): AmrapState
}

const WINDOW_SECONDS = AMRAP_BLOCK.timer_seconds ?? 0

/**
 * The JOURNEY-009 entry's two ended attempts: the two-movement AMRAP's window
 * closed by its cap with nothing entered (both counts blank), and the sample
 * ended early with three rounds and an observed zero partial round entered —
 * so blank and an explicit zero sit side by side.
 */
export const GALLERY_AMRAP_ATTEMPTS: readonly GalleryAmrapAttemptSpec[] = [
  {
    id: 'cap',
    title: 'Cap reached · nothing entered yet',
    block: AMRAP_BLOCK,
    blockIndex: 60,
    record: (now) => ({
      startedAt: new Date(now - (WINDOW_SECONDS + 60) * 1000).toISOString(),
      endedAtSeconds: null,
      roundsCompleted: null,
      partialRoundReps: null,
    }),
  },
  {
    id: 'early',
    title: 'Finished early · 3 rounds and an observed zero',
    block: ACCEPTED_SAMPLE_AMRAP,
    blockIndex: 61,
    record: (now) => ({
      startedAt: new Date(now - 400 * 1000).toISOString(),
      endedAtSeconds: 323,
      roundsCompleted: 3,
      partialRoundReps: 0,
    }),
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// TASK-010 — `?state=for_time` and `?state=ladder` (C29, C30)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The accepted reference's For Time results sample is the route fixture's For
 * Time (`FOR_TIME_BLOCK`: forty wall balls with a 9 kg medicine ball under a
 * 15:00 cap). Its capped companion here adds a bodyweight burpee under a
 * 10:00 cap, so the two cards' own landmarks keep distinct names on one page.
 */
export const CAPPED_SAMPLE_FOR_TIME: Block = {
  ...FOR_TIME_BLOCK,
  timer_seconds: 600,
  exercises: [...FOR_TIME_BLOCK.exercises, AMRAP_BLOCK.exercises[1]],
}

/**
 * The accepted ladder results sample (`gallery-refinement-flow-data.ts`): the
 * push up rising two reps a round with its fixed burpee, four rounds under one
 * 07:00 cap. Its capped companion is the push up alone, for distinct landmarks.
 */
export const ACCEPTED_SAMPLE_LADDER: Block = timedLadderBlock(4)
export const CAPPED_SAMPLE_LADDER: Block = { ...ACCEPTED_SAMPLE_LADDER, exercises: [ACCEPTED_SAMPLE_LADDER.exercises[0]] }

/** A For Time block or a timed ladder as the live shell hands it to its renderer. */
export function galleryTimedProgress(block: Block, blockIndex: number): BlockProgress {
  return { ...galleryAmrapProgress(block, blockIndex), ladderTiming: block.ladder_timing ?? null }
}

export interface GalleryRaceAttemptSpec {
  readonly id: 'finish' | 'cap'
  readonly title: string
  readonly block: Block
  readonly blockIndex: number
  /** The race's own stored clock (`for-time.ts`) for this attempt, read against `now`. */
  record(now: number): ForTimeState
}

/**
 * JOURNEY-010's For Time entries: finished under the cap at 06:23 — the
 * completion starts at Complete — and run into its cap — it starts at
 * Incomplete. Neither has been answered, so each shows its starting point,
 * and the effort is unanswered.
 */
export const GALLERY_FOR_TIME_ATTEMPTS: readonly GalleryRaceAttemptSpec[] = [
  {
    id: 'finish',
    title: 'Finished under the cap · completion starts at Complete',
    block: FOR_TIME_BLOCK,
    blockIndex: 70,
    record: (now) => ({
      startedAt: new Date(now - 420 * 1000).toISOString(),
      finishedAt: new Date(now - 37 * 1000).toISOString(),
    }),
  },
  {
    id: 'cap',
    title: 'Cap reached · completion starts at Incomplete',
    block: CAPPED_SAMPLE_FOR_TIME,
    blockIndex: 71,
    record: (now) => ({
      startedAt: new Date(now - ((CAPPED_SAMPLE_FOR_TIME.timer_seconds ?? 0) + 60) * 1000).toISOString(),
      finishedAt: null,
    }),
  },
]

/**
 * JOURNEY-010's ladder entries: Finish pressed at 03:20 and the cap run out,
 * both with nothing tracked rung by rung — so both start at Incomplete with
 * no rung, never at every rung.
 */
export const GALLERY_LADDER_ATTEMPTS: readonly GalleryRaceAttemptSpec[] = [
  {
    id: 'finish',
    title: 'Finished at 03:20 · nothing tracked, so Incomplete',
    block: ACCEPTED_SAMPLE_LADDER,
    blockIndex: 80,
    record: (now) => ({
      startedAt: new Date(now - 260 * 1000).toISOString(),
      finishedAt: new Date(now - 60 * 1000).toISOString(),
    }),
  },
  {
    id: 'cap',
    title: 'Cap reached · Incomplete until the athlete says otherwise',
    block: CAPPED_SAMPLE_LADDER,
    blockIndex: 81,
    record: (now) => ({
      startedAt: new Date(now - (LADDER_CAP_SECONDS + 30) * 1000).toISOString(),
      finishedAt: null,
    }),
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// TASK-011 — `?state=emom` (C31, C32)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The accepted reference's EMOM results sample (`sampleBlock('emom')`): the
 * loaded kettlebell swing alone, twelve a minute, eight minutes. Its companion
 * is the route fixture's two-movement EMOM (`EMOM_BLOCK`), so the two cards'
 * own landmarks keep distinct names on one page.
 */
export const ACCEPTED_SAMPLE_EMOM: Block = { ...EMOM_BLOCK, timer_seconds: 480, exercises: [EMOM_BLOCK.exercises[0]] }

export interface GalleryEmomAttemptSpec {
  readonly id: 'complete' | 'early'
  readonly title: string
  readonly block: Block
  readonly blockIndex: number
  /** The EMOM's own stored grid (`emom.ts`) for this attempt, read against `now`. */
  record(now: number): EmomState
}

const EMOM_SECONDS = EMOM_BLOCK.timer_seconds ?? 0

/**
 * JOURNEY-011's two ends: the ten-minute EMOM run to its last minute — the
 * schedule as specified, assumed done, with only notes for an exception — and
 * the sample ended early, 3:20 into its eight minutes, so it says FINISHED
 * EARLY in minute 4 of 8 and is never a completed schedule.
 */
export const GALLERY_EMOM_ATTEMPTS: readonly GalleryEmomAttemptSpec[] = [
  {
    id: 'complete',
    title: 'Every prescribed minute run · notes for an exception',
    block: EMOM_BLOCK,
    blockIndex: 90,
    record: (now) => ({
      startedAt: new Date(now - (EMOM_SECONDS + 30) * 1000).toISOString(),
      workDoneMinute: null,
    }),
  },
  {
    id: 'early',
    title: 'Finished early in minute 4 of 8 · the actual stop kept',
    block: ACCEPTED_SAMPLE_EMOM,
    blockIndex: 91,
    record: (now) => ({
      startedAt: new Date(now - 400 * 1000).toISOString(),
      workDoneMinute: null,
      finishedAt: new Date(now - 200 * 1000).toISOString(),
    }),
  },
]
