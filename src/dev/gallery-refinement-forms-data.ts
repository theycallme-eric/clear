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
 */
import type { AmrapState } from '../state/amrap'
import type { SessionAcceptance } from '../state/schemas'
import { structureIdentity, type BlockProgress } from '../state/workout-progress'
import { AMRAP_BLOCK } from './gallery-refinement-cards-data'
import { galleryExerciseProgress } from './gallery-refinement-coaching-data'

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
