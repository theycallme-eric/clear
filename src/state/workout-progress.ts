/**
 * EXE-01 — what the shell knows about where the user is, derived from the
 * session snapshot and from nothing else.
 *
 * Every function here is total and pure over `SessionSnapshot`. That is the
 * same posture `session-machine.ts` takes for the lifecycle, and for the same
 * reason: a progress bar that remembered its own state would disagree with the
 * rows after a refresh, a second tab, or a set logged on another device. A
 * section is complete because every prescription in it has been completed or
 * skipped, not because the user pressed Next.
 *
 * The structure identity is the other half. The master clarity spec's premise
 * is that a timed structure has to say what it is before it says what to do —
 * an EMOM and an AMRAP are the same list of movements under two completely
 * different contracts, and the header is where that contract is stated. So
 * `structureIdentity` reads the block's own columns (`structure_type`,
 * `rounds`, `timer_seconds`, `rep_scheme`) and produces the terse, uppercase
 * label the operational screen wants: `EMOM · 10 MIN`, `AMRAP · 8 MIN`,
 * `FOR TIME · 10 MIN CAP`, `CIRCUIT · 3 ROUNDS`. Nothing parses a string, and
 * nothing invents a number the block does not carry.
 */
import type { Enums } from '../data/database.types'
import type { SessionSnapshot, WorkoutBlockRow } from './schemas'

// ─────────────────────────────────────────────────────────────────────────────
// Section progress
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Three statuses, and the middle one is the reason there are not two: a
 * section somebody has started and left is not the same as one they have not
 * reached, and the progress bar is where that difference is visible.
 */
export type SectionStatus = 'not_started' | 'in_progress' | 'complete'

export interface BlockProgress {
  readonly blockId: string
  readonly structureType: Enums<'structure_type'>
  /** Terse identity for the block's header — see `structureIdentity`. */
  readonly identity: StructureIdentity
  readonly status: SectionStatus
  /** Prescriptions still active in this block, in order. */
  readonly exerciseCount: number
}

export interface SectionProgress {
  readonly sectionId: string
  readonly title: string
  readonly sectionType: Enums<'section_type'>
  /** Position in the session, which is also this section's `order_index`. */
  readonly index: number
  readonly status: SectionStatus
  readonly blocks: readonly BlockProgress[]
}

export interface SessionProgress {
  readonly sections: readonly SectionProgress[]
  /** Sections whose every prescription is completed or skipped. */
  readonly completed: number
  readonly total: number
}

/**
 * A superseded prescription is not work: a swap leaves the old row in place so
 * its logs keep their meaning (DATA_MODEL §7), and counting it would make a
 * swapped block impossible to finish.
 */
function activeExercises(block: SessionSnapshot['sections'][number]['blocks'][number]) {
  return block.exercises.filter(({ exercise }) => exercise.revision_status === 'active')
}

/**
 * `not_started` when nothing has been touched, `complete` when nothing is
 * outstanding, `in_progress` otherwise.
 *
 * A skipped exercise counts as resolved rather than as outstanding — skipping
 * is a decision the user already made, and a section that could never read
 * complete because one movement was skipped would trap them (DATA_MODEL §8).
 * A block with no active prescriptions left is complete: there is nothing in
 * it to do.
 */
function statusOf(statuses: readonly Enums<'execution_status'>[]): SectionStatus {
  if (statuses.length === 0) return 'complete'
  if (statuses.every((status) => status === 'not_started')) return 'not_started'
  if (statuses.some((status) => status === 'not_started')) return 'in_progress'
  return 'complete'
}

/** Every section, in order, with the status its rows currently derive to. */
export function sessionProgress(snapshot: SessionSnapshot): SessionProgress {
  const sections = snapshot.sections.map((entry, index): SectionProgress => {
    const blocks = entry.blocks.map((blockEntry): BlockProgress => {
      const exercises = activeExercises(blockEntry)

      return {
        blockId: blockEntry.block.id,
        structureType: blockEntry.block.structure_type,
        identity: structureIdentity(blockEntry.block),
        status: statusOf(exercises.map(({ exercise }) => exercise.execution_status)),
        exerciseCount: exercises.length,
      }
    })

    return {
      sectionId: entry.section.id,
      title: entry.section.section_title,
      sectionType: entry.section.section_type,
      index,
      status: statusOf(
        entry.blocks.flatMap((blockEntry) =>
          activeExercises(blockEntry).map(({ exercise }) => exercise.execution_status),
        ),
      ),
      blocks,
    }
  })

  return {
    sections,
    completed: sections.filter((section) => section.status === 'complete').length,
    total: sections.length,
  }
}

/**
 * The section the user should land on: the first one that is not finished.
 *
 * Zero for a session with nothing outstanding — every section is complete, the
 * shell offers completion, and there is no sensible "next" to point at.
 */
export function startingSectionIndex(progress: SessionProgress): number {
  const next = progress.sections.findIndex((section) => section.status !== 'complete')
  return next === -1 ? 0 : next
}

/** Keeps an index inside the session, for a restored one that no longer fits. */
export function clampSectionIndex(index: number, progress: SessionProgress): number {
  if (progress.total === 0) return 0
  return Math.min(Math.max(0, Math.trunc(index)), progress.total - 1)
}

/** True once every section is resolved — what turns Next into Finish. */
export function isSessionFinished(progress: SessionProgress): boolean {
  return progress.total > 0 && progress.completed === progress.total
}

// ─────────────────────────────────────────────────────────────────────────────
// Structure identity (master clarity spec)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A block's identity, as the header renders it.
 *
 * `label` is the structure's name and `detail` is the one number that changes
 * what the user is about to do — the minutes an EMOM runs for, the rounds a
 * circuit prescribes, the cap a For Time is racing. They are separate because
 * severity, rest and the rep scheme are all separate cues; a single string
 * would force the header to decide their typography for it.
 */
export interface StructureIdentity {
  /** `EMOM`, `AMRAP`, `FOR TIME`, `CIRCUIT`, `SUPERSET`, `STANDARD`. */
  readonly label: string
  /** `10 MIN`, `3 ROUNDS`, `10 MIN CAP` — null when the block has no number. */
  readonly detail: string | null
  /** `LADDER DOWN`, `PYRAMID` — null for the default `fixed` scheme. */
  readonly repScheme: string | null
  /** Which shipped glyph names this structure. Never the only cue. */
  readonly glyph: StructureGlyph
}

/**
 * The glyphs the export already ships for this vocabulary (IA.md §3): a
 * structure badge composes `Circuit`, `Ladder`, `Superset` and `Stopwatch`.
 * Named rather than imported here so this module stays free of React.
 */
export type StructureGlyph = 'Circuit' | 'Ladder' | 'Superset' | 'Stopwatch' | 'Dumbbell'

const STRUCTURE_LABELS: Readonly<Record<Enums<'structure_type'>, string>> = {
  standard: 'STANDARD',
  superset: 'SUPERSET',
  circuit: 'CIRCUIT',
  emom: 'EMOM',
  amrap: 'AMRAP',
  for_time: 'FOR TIME',
}

const STRUCTURE_GLYPHS: Readonly<Record<Enums<'structure_type'>, StructureGlyph>> = {
  standard: 'Dumbbell',
  superset: 'Superset',
  circuit: 'Circuit',
  emom: 'Stopwatch',
  amrap: 'Stopwatch',
  for_time: 'Stopwatch',
}

const REP_SCHEME_LABELS: Readonly<Record<Enums<'rep_scheme'>, string | null>> = {
  // The default carries no information: every standard block is `fixed`, and a
  // header that said so on all of them would say nothing on any of them.
  fixed: null,
  ladder_up: 'LADDER UP',
  ladder_down: 'LADDER DOWN',
  pyramid: 'PYRAMID',
  inverse: 'INVERSE',
  n_plus_one: 'N+1',
  ladder_fixed_interval: 'LADDER · FIXED INTERVAL',
}

const SECONDS_PER_MINUTE = 60

/** Whole minutes when the seconds divide evenly, seconds otherwise. */
function durationLabel(seconds: number): string {
  if (seconds % SECONDS_PER_MINUTE === 0) {
    return `${seconds / SECONDS_PER_MINUTE} MIN`
  }
  return `${seconds} SEC`
}

/**
 * The header's answer to "what is this block". Every number comes from the
 * block's own columns — `workout_blocks` is where the clock lives, once, so
 * members of a circuit cannot disagree about it (DATA-01c §5).
 */
export function structureIdentity(block: WorkoutBlockRow): StructureIdentity {
  return {
    label: STRUCTURE_LABELS[block.structure_type],
    detail: structureDetail(block),
    repScheme: REP_SCHEME_LABELS[block.rep_scheme],
    glyph: block.rep_scheme.startsWith('ladder')
      ? 'Ladder'
      : STRUCTURE_GLYPHS[block.structure_type],
  }
}

function structureDetail(block: WorkoutBlockRow): string | null {
  switch (block.structure_type) {
    case 'emom':
    case 'amrap':
      // The timer is the structure: an AMRAP without its window and an EMOM
      // without its minutes are not prescriptions, they are lists.
      return block.timer_seconds === null ? null : durationLabel(block.timer_seconds)

    case 'for_time':
      // For Time always has a cap (structure-types spec §6), and the cap is
      // the number that changes how the user paces it.
      return block.timer_seconds === null
        ? null
        : `${durationLabel(block.timer_seconds)} CAP`

    case 'circuit':
      return block.rounds === null ? null : `${block.rounds} ROUNDS`

    case 'superset':
    case 'standard':
      // Rounds on these is the set count, which the prescription already says
      // per exercise; repeating it in the header would be a second source.
      return null
  }
}
