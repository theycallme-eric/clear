/**
 * FAV-01 — what a favorite is made of, and what it becomes again.
 *
 * Three pure functions, and each one is an acceptance criterion:
 *
 *   · **`snapshotOf`** turns a reconstruction of a finished session into the
 *     document a favorite stores. It reads SES-01b's *intended at start*
 *     answer, which is what the user set out to do after any swap and before
 *     anything was logged — the workout a person means when they say "this
 *     one again". Every prescription is rebuilt through `prescriptionFor`,
 *     the same function a swap writes with, so the snapshot cannot describe a
 *     prescription the app would refuse to perform.
 *   · **`restore`** turns it back, and it is the only way a favorite reaches
 *     Review. It parses `workout_snapshot` against the schema for the version
 *     **the row states** (DATA_MODEL §11) and answers a `SessionAcceptance`
 *     dated today. No generation call, no model, nothing hydrated: the same
 *     payload the original acceptance sent, on a different day.
 *   · **`favoriteEntry`** is the list line: anchor, intensity, duration, and
 *     what has happened to it since.
 *
 * The version gate is the part worth being explicit about. A favorite saved
 * under a contract this build no longer reads is not an error to be logged and
 * shrugged at — it is a card the user is looking at, so `restore` answers a
 * typed refusal that names the version, and `isOutdatedSnapshot` lets the
 * screen say the one sentence that is actually true about it.
 *
 * React-free and fetch-free, like `review.ts` beside it.
 */
import type { Enums } from '../data/database.types'
import {
  createError,
  ErrorCode,
  err,
  isErr,
  ok,
  type AppError,
  type Result,
} from './errors'
import { formatDay, formatFocus } from './history'
import {
  CONTRACT_VERSION,
  parseBoundary,
  savedWorkoutDraftSchema,
  snapshotSchemaFor,
  SNAPSHOT_SCHEMAS,
  workoutSnapshotSchema,
  type Prescription,
  type SavedWorkoutDraft,
  type SavedWorkoutRow,
  type SessionAcceptance,
  type SessionReconstruction,
  type WorkoutBlock,
  type WorkoutSection,
  type WorkoutSnapshot,
} from './schemas'
import { localDayIn, type LocalDay } from './streak'
import { prescriptionFor } from './swap'

/** What a screen says about a favorite it cannot restore. */
export const OUTDATED_SNAPSHOT_MESSAGE =
  'This favorite was saved before a change to how workouts are stored, so it can’t be restarted. Generate a new workout instead.'

/** The `details.reason` a refused restore carries. */
export const OUTDATED_SNAPSHOT_REASON = 'unsupported_snapshot_version'

// ─────────────────────────────────────────────────────────────────────────────
// Saving
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The snapshot a finished session would be saved as.
 *
 * The session row supplies every fact the workout was composed under, so the
 * favorite restarts under the same ones rather than under whatever the user's
 * current preferences happen to be. Two details are decisions rather than
 * transcription:
 *
 *   · **`estimated_duration_mins` is GEN-06's computed number**, falling back
 *     to the effective target. The model's own estimate is not stored on the
 *     session (it is diagnostic, DATA-01c), and inventing one would be
 *     stating a measurement of a workout nobody has performed.
 *   · **An empty block or section is dropped**, because the contract has no
 *     shape for one. If dropping leaves nothing, this answers a typed error:
 *     a favorite of a workout with no exercises is not a favorite.
 */
export function snapshotOf(reconstruction: SessionReconstruction): Result<WorkoutSnapshot> {
  const { session } = reconstruction

  const sections: WorkoutSection[] = []
  for (const entry of reconstruction.sections) {
    const blocks: WorkoutBlock[] = []

    for (const held of entry.blocks) {
      const exercises: Prescription[] = []

      for (const { exercise } of held.exercises) {
        const prescription = prescriptionFor(
          exercise,
          { exerciseId: exercise.exercise_id, equipment: exercise.equipment_used },
          entry.section.section_type,
        )
        // `null` means the row's target columns contradict its `target_kind`,
        // which `CONSTRAINT target_shape` makes impossible — so the rows in
        // hand are not what the database holds, and a snapshot built from
        // them would prescribe work nobody asked for.
        if (prescription === null) {
          return err(
            createError(ErrorCode.PERSISTENCE_READ_FAILED, {
              details: { workout_exercise_id: exercise.id, reason: 'target_shape' },
            }),
          )
        }
        exercises.push(prescription)
      }

      if (exercises.length === 0) continue

      blocks.push({
        structure_type: held.block.structure_type,
        rounds: held.block.rounds,
        timer_type: held.block.timer_type,
        timer_seconds: held.block.timer_seconds,
        round_rest_seconds: held.block.round_rest_seconds,
        rep_scheme: held.block.rep_scheme,
        block_notes: held.block.block_notes,
        exercises,
      })
    }

    if (blocks.length === 0) continue

    sections.push({
      section_type: entry.section.section_type,
      section_title: entry.section.section_title,
      section_notes: entry.section.section_notes,
      blocks,
    })
  }

  const snapshot = {
    location_id: session.location_id,
    session_focus: session.session_focus,
    goal_preset: session.goal_preset,
    requested_duration_mins: session.requested_duration_mins,
    effective_duration_target_mins: session.effective_duration_target_mins,
    computed_duration_mins: session.computed_duration_mins,
    requested_intensity: session.requested_intensity,
    effective_intensity: session.effective_intensity,
    adjustment_reason: session.adjustment_reason,
    generation_notes: session.generation_notes,
    prompt_version: session.prompt_version,
    contract_version: session.contract_version,
    workout: {
      title: session.title,
      overview: session.overview,
      sections,
      estimated_duration_mins:
        session.computed_duration_mins ?? session.effective_duration_target_mins,
    },
  }

  // Parsed rather than asserted: a snapshot that does not validate now is one
  // that could not be restored later, and the favorite is better refused at
  // the moment the user asks for it than at the moment they rely on it.
  return parseBoundary(workoutSnapshotSchema, snapshot)
}

/**
 * The whole payload `save_favorite` takes, from a reconstruction.
 *
 * The version stamped on the row is this build's contract version, because
 * that is the shape it just wrote — never the session's own
 * `contract_version`, which records what generation answered under and can be
 * older than the snapshot format.
 */
export function favoriteDraft(
  reconstruction: SessionReconstruction,
): Result<SavedWorkoutDraft> {
  const snapshot = snapshotOf(reconstruction)
  if (isErr(snapshot)) return snapshot

  const { session } = reconstruction

  return parseBoundary(savedWorkoutDraftSchema, {
    original_session_id: session.id,
    workout_snapshot: snapshot.value,
    snapshot_contract_version: CONTRACT_VERSION,
    title: session.title,
    session_focus: session.session_focus,
    intensity: session.effective_intensity,
    duration_mins: session.effective_duration_target_mins,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Restarting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The favorite, as an acceptance payload for today.
 *
 * `today` is passed in rather than read from a clock here for the reason every
 * other day boundary in this app is: the day a session belongs to is the
 * user's local day, and a module that resolved it itself would draw it in a
 * different place than SES-01c does.
 */
export function restore(row: SavedWorkoutRow, today: LocalDay): Result<SessionAcceptance> {
  const schema = snapshotSchemaFor(row.snapshot_contract_version)
  if (schema === null) {
    return err(
      createError(ErrorCode.VALIDATION_CONSTRAINT, {
        details: {
          reason: OUTDATED_SNAPSHOT_REASON,
          snapshot_contract_version: row.snapshot_contract_version,
          supported: Object.keys(SNAPSHOT_SCHEMAS),
        },
      }),
    )
  }

  const snapshot = parseBoundary(schema, row.workout_snapshot)
  if (isErr(snapshot)) return snapshot

  return ok({ ...snapshot.value, date: today })
}

/** Whether a refused restore is the "saved under an older contract" one. */
export function isOutdatedSnapshot(error: AppError): boolean {
  return error.details?.reason === OUTDATED_SNAPSHOT_REASON
}

/** Today, in the zone the user is in — the same resolution the streak uses. */
export function todayLocal(timeZone?: string): LocalDay {
  const zone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  return localDayIn(zone)(new Date())
}

// ─────────────────────────────────────────────────────────────────────────────
// The list
// ─────────────────────────────────────────────────────────────────────────────

/** One line of the favorites tab. */
export interface FavoriteEntry {
  readonly key: string
  readonly id: string
  readonly title: string
  readonly focus: Enums<'session_focus'>
  /** `Full body · 45 min · Intensity 7/10` — the metadata the IA asks for. */
  readonly meta: string
  readonly timesCompleted: number
  /** `Last done Fri 12 Sep 2026`, or null when it has never been completed. */
  readonly lastCompleted: string | null
  /** Whether this build can still restore it (DATA_MODEL §11). */
  readonly restorable: boolean
}

export function favoriteEntry(row: SavedWorkoutRow, timeZone?: string): FavoriteEntry {
  const zone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone

  return {
    key: row.id,
    id: row.id,
    title: row.title,
    focus: row.session_focus,
    meta: [
      formatFocus(row.session_focus),
      `${row.duration_mins} min`,
      `Intensity ${row.intensity}/10`,
    ].join(' · '),
    timesCompleted: row.times_completed,
    lastCompleted:
      row.last_completed_at === null
        ? null
        : formatDay(localDayIn(zone)(new Date(row.last_completed_at))),
    restorable: snapshotSchemaFor(row.snapshot_contract_version) !== null,
  }
}

/** The favorites tab's list, newest first — the order the read already has. */
export function favoriteEntries(
  rows: readonly SavedWorkoutRow[],
  timeZone?: string,
): FavoriteEntry[] {
  return rows.map((row) => favoriteEntry(row, timeZone))
}

/** `3 times · Last done Fri 12 Sep 2026`, or the honest absence of both. */
export function completionSummary(entry: FavoriteEntry): string {
  if (entry.timesCompleted === 0) return 'Not completed yet'

  const times = entry.timesCompleted === 1 ? '1 time' : `${entry.timesCompleted} times`

  return entry.lastCompleted === null
    ? times
    : `${times} · Last done ${entry.lastCompleted}`
}
