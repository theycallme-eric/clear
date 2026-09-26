/**
 * FAV-02 — what a favorite has become across the runs of it.
 *
 * FAV-01 answers *what this workout is*: a snapshot, restored exactly, with no
 * model call on the path. This module answers the other half —  *what has
 * happened to it* — and it is pure, React-free and fetch-free for the same
 * reason `progression.ts` is: a comparison between two training sessions is a
 * rule, and a rule that can only be exercised by completing two workouts is a
 * rule nobody re-checks.
 *
 * Four things are derived here, from one input: the completed attempts at a
 * favorite, each as the `session_as_performed` reconstruction of that session
 * (SES-01b). No fourth reconstruction, no snapshot filtered by hand.
 *
 *   · **Comparable readings** (`runMeasures`) — the readings of a run that can
 *     be set beside another run's: a For Time clock, an AMRAP's rounds, and the
 *     top set per movement. Everything else a session records is *what
 *     happened*, not a comparison, and HIST-01's detail already shows it.
 *   · **Personal bests** (`personalBests`) — MIN completion time for For Time,
 *     MAX rounds for AMRAP (favorites-v2 §Progression Tracking), each carrying
 *     the run it was set on.
 *   · **Last time** (`lastWeights`, `completionHistory`) — the most recent
 *     completion's top set per movement, and the date-plus-headline line per
 *     run that the favorites detail lists.
 *   · **The thread** (`compareRuns`) — one run against another, with the delta
 *     stated in words: faster or slower, rounds up or down, weight moved.
 *
 * Five decisions are stated once here because each is load-bearing:
 *
 *   * **A figure never appears without the run it came from.** Every best,
 *     delta and last-time reading carries the day it was measured on. A number
 *     with no source is a claim the user cannot check, and "your best is 6:23"
 *     is a different statement from "6:23, on Fri 12 Sep".
 *   * **Blocks are matched by position, never by id.** Restoring a favorite
 *     writes fresh `workout_blocks` rows every time, so the block ids of two
 *     runs of the same favorite never agree. What does agree is where the block
 *     sits — section `order_index`, then block `order_index` — because the
 *     snapshot restored is byte-for-byte the same document. A reading whose
 *     position has no counterpart in the other run is dropped rather than
 *     guessed at.
 *   * **A For Time that stopped at the cap is not a time.** The clock says the
 *     cap, not how long the work took, so it is not admitted to the best pool
 *     and not compared (`completed_under_cap`). Recording it as a slow finish
 *     would be inventing a measurement of work that was not finished.
 *   * **A best is only beaten strictly.** Equalling it leaves the earlier run
 *     holding it, which is the acceptance criterion in one line: *PB updates
 *     only when the new result beats the stored best.*
 *   * **A deload drops the competitive framing, not the history** (REQ-059, per
 *     OVR-04). The numbers and the dates stay; the verdict does not. Nothing
 *     here decides *whether* a deload is in force — OVR-04 owns that signal,
 *     and `deloadInEffect` below reads the only two facts a restored favorite
 *     has to go on until it lands.
 */
import type { WeightUnit } from './anchors'
import { convertWeight } from './anchors'
import { formatDay } from './history'
import { exerciseName } from './prescription'
import type {
  ExerciseSetLogRow,
  SessionAcceptance,
  SessionReconstruction,
} from './schemas'
import { formatElapsed } from './workout-clock'
import { structureIdentity } from './workout-progress'

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/** One completed attempt at a favorite: the stamp, and what was performed. */
export interface FavoriteRun {
  readonly sessionId: string
  /** `saved_workout_completions.completed_at` — what makes this a completion. */
  readonly completedAt: string
  /** `session_as_performed` for that session, and nothing else. */
  readonly performed: SessionReconstruction
}

/** What kind of reading a comparison is drawn on. */
export type MeasureKind = 'time' | 'rounds' | 'weight'

/**
 * Which way a change went. `level` is a real answer — the same time twice is
 * information — and `unjudged` is the deload: the change is stated, the verdict
 * is withheld.
 */
export type ProgressionDirection = 'better' | 'worse' | 'level' | 'unjudged'

/** How the surface talks about the numbers. */
export type ProgressionFraming = 'competitive' | 'deload'

/**
 * One comparable reading off one run.
 *
 * `value` is the number a comparison is drawn on and `display` is what a screen
 * shows, because the two differ: 8 rounds and 4 partial reps compares on 8
 * (favorites-v2 §Progression Tracking: MAX(rounds_completed)) and reads as
 * `8 rounds + 4 reps`.
 */
export interface RunMeasure {
  /** Stable across runs of the same favorite: position, or movement. */
  readonly key: string
  readonly kind: MeasureKind
  readonly label: string
  readonly value: number
  /** The unit `value` is in, for a weight. Null for a clock or a count. */
  readonly unit: WeightUnit | null
  readonly display: string
}

/** A best, and the run that set it. */
export interface PersonalBest {
  readonly key: string
  readonly kind: 'time' | 'rounds'
  readonly label: string
  readonly display: string
  readonly value: number
  /** The day it was set — `Fri 12 Sep 2026`. The source of the number. */
  readonly setOn: string
  /** How many runs held a comparable reading for this position. */
  readonly runCount: number
  /** Whether the most recent run is the one holding it. */
  readonly fromLastRun: boolean
}

/** What was lifted last time, per movement (favorites-v2 §"Last Time" v1). */
export interface LastWeight {
  readonly key: string
  readonly label: string
  /** `60 kg` — the heaviest working set of that run, in the unit it was logged. */
  readonly display: string
  readonly setOn: string
}

/** One line of the completion history: the date, and what the run came to. */
export interface CompletionEntry {
  readonly key: string
  readonly on: string
  readonly headline: string
}

/** One run against another, with the change made obvious. */
export interface ProgressionDelta {
  readonly key: string
  readonly kind: MeasureKind
  readonly label: string
  /** The later run's reading. */
  readonly current: string
  /** The earlier run's reading. */
  readonly previous: string
  readonly direction: ProgressionDirection
  /** `12s faster`, `1 round fewer`, `2.5 kg heavier`, `Same time`. */
  readonly change: string
  /** The day the earlier reading was taken — `vs Fri 12 Sep 2026`. */
  readonly against: string
}

/** Everything the repeat surface says about a favorite's history. */
export interface FavoriteProgression {
  /** Completed runs this was derived from. Zero is the never-completed favorite. */
  readonly runCount: number
  readonly framing: ProgressionFraming
  /** The most recent completion's day, or null when there is none. */
  readonly lastRunOn: string | null
  /** What that run came to, in one line. */
  readonly lastRunHeadline: string | null
  readonly bests: readonly PersonalBest[]
  readonly lastWeights: readonly LastWeight[]
  /** Newest first, one line per completed run. */
  readonly history: readonly CompletionEntry[]
  /** The last run against the one before it. Empty when nothing is comparable. */
  readonly deltas: readonly ProgressionDelta[]
  /** The heading over the bests, framed. */
  readonly bestsLabel: string
  /** The heading over the deltas, or null when there are none. */
  readonly comparisonLabel: string | null
  /** The one sentence this surface owes the user, or null. */
  readonly note: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Words
// ─────────────────────────────────────────────────────────────────────────────

export const BESTS_LABEL_COMPETITIVE = 'Beat your best'
export const BESTS_LABEL_DELOAD = 'Bests so far'
export const COMPARISON_LABEL_COMPETITIVE = 'Your last run against the one before'
export const COMPARISON_LABEL_DELOAD = 'Your last two runs'

/** The deload sentence: the history stays, the competition does not (OVR-04). */
export const DELOAD_NOTE =
  'This one is a deload. The numbers are here for the record — not to beat.'

/** A favorite with one completion behind it: there is nothing to compare yet. */
export const FIRST_ATTEMPT_NOTE = 'First attempt recorded. Nothing to compare it against yet.'

/** A favorite saved and never started (favorites-v2 §Favorite Never Completed). */
export const NO_RUNS_NOTE = 'You have not completed this one yet, so there is nothing to compare.'

/** The headline for a run that recorded no comparable reading at all. */
export const COMPLETED_HEADLINE = 'Completed'

const SAME_TIME = 'Same time'
const SAME_ROUNDS = 'Same rounds'
const SAME_WEIGHT = 'Same weight'

// ─────────────────────────────────────────────────────────────────────────────
// Readings off one run
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The comparable readings of one performed session, in the order they were
 * performed.
 *
 * Three kinds, and the reason each is here:
 *
 *   * **For Time** — the completion time, which is the format's whole result,
 *     and only when the work was finished inside the cap.
 *   * **AMRAP** — rounds completed, which is the format's whole result. Partial
 *     reps ride along in the display and are deliberately not part of `value`:
 *     the spec's best is `MAX(rounds_completed)`, and a tie on rounds broken by
 *     partial reps would be this module inventing a rule.
 *   * **Top set per movement** — the heaviest working set logged against a
 *     movement, keyed by movement and implement rather than by row, because a
 *     restored favorite's `workout_exercises` ids are new every time. Warmups
 *     are excluded: they are not the work (OVR-01a excludes them too).
 *
 * EMOM, circuit, superset and standard blocks produce no reading of their own.
 * EMOM is binary completion and a circuit's elapsed clock is not a score
 * (favorites-v2 §"Beat Your Previous Best" names exactly the two formats
 * above); what those blocks contribute is their movements' top sets.
 */
export function runMeasures(performed: SessionReconstruction): readonly RunMeasure[] {
  const measures: RunMeasure[] = []

  for (const entry of performed.sections) {
    for (const held of entry.blocks) {
      const { block, block_result: result } = held
      const position = `${entry.section.order_index}.${block.order_index}`
      const label = `${entry.section.section_title} · ${structureIdentity(block).label}`

      if (result !== null && block.structure_type === 'for_time') {
        // A cap-stopped run is a different event from a finished one, and the
        // clock reads the cap either way. Comparing the two would report a
        // slower finish where there was no finish.
        if (result.elapsed_seconds !== null && result.completed_under_cap === true) {
          measures.push({
            key: `time:${position}`,
            kind: 'time',
            label,
            value: result.elapsed_seconds,
            unit: null,
            display: formatElapsed(result.elapsed_seconds),
          })
        }
      }

      if (result !== null && block.structure_type === 'amrap') {
        if (result.rounds_completed !== null) {
          measures.push({
            key: `rounds:${position}`,
            kind: 'rounds',
            label,
            value: result.rounds_completed,
            unit: null,
            display: roundsText(result.rounds_completed, result.partial_round_reps),
          })
        }
      }

      for (const { exercise, set_logs: setLogs } of held.exercises) {
        const top = topSet(setLogs)
        if (top === null) continue

        measures.push({
          key: `weight:${exercise.exercise_id}:${exercise.equipment_used}`,
          kind: 'weight',
          label: exerciseName(exercise.exercise_id),
          value: top.weight,
          unit: top.unit,
          display: weightText(top.weight, top.unit),
        })
      }
    }
  }

  return measures
}

/**
 * The heaviest working set of a prescription, or null when none was logged
 * with a weight.
 *
 * Null rather than zero, throughout: a bodyweight movement logs no weight and
 * a set logged at zero is a real observation of an unloaded bar (DATA_MODEL
 * §8). Only the first is absent.
 */
function topSet(
  setLogs: readonly ExerciseSetLogRow[],
): { weight: number; unit: WeightUnit } | null {
  let best: { weight: number; unit: WeightUnit } | null = null

  for (const log of setLogs) {
    if (log.is_warmup_set) continue
    if (log.weight === null) continue

    if (best === null) {
      best = { weight: log.weight, unit: log.weight_unit }
      continue
    }

    // Compared in the unit already held, because two sets of one session can
    // have been logged in different units and the numbers are not comparable.
    const converted: number = convertWeight(log.weight, log.weight_unit, best.unit)
    if (converted > best.weight) best = { weight: converted, unit: best.unit }
  }

  return best
}

// ─────────────────────────────────────────────────────────────────────────────
// Across runs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The bests across every run, one per timed position.
 *
 * Walked oldest first and replaced only on a strict improvement, so the run
 * that *set* the best is the one credited with it and equalling it does not
 * quietly move the date.
 */
export function personalBests(runs: readonly FavoriteRun[]): readonly PersonalBest[] {
  const ordered = oldestFirst(runs)
  const lastRun = ordered.at(-1)
  const bests = new Map<string, PersonalBest>()

  for (const run of ordered) {
    const day = formatDay(run.performed.session.date)

    for (const measure of runMeasures(run.performed)) {
      if (measure.kind === 'weight') continue

      const held = bests.get(measure.key)

      if (held === undefined) {
        bests.set(measure.key, {
          key: measure.key,
          kind: measure.kind,
          label: measure.label,
          display: measure.display,
          value: measure.value,
          setOn: day,
          runCount: 1,
          fromLastRun: run === lastRun,
        })
        continue
      }

      // Strictly: equalling a best leaves it where it was set.
      const improved =
        measure.kind === 'time' ? measure.value < held.value : measure.value > held.value

      bests.set(measure.key, {
        ...held,
        display: improved ? measure.display : held.display,
        value: improved ? measure.value : held.value,
        setOn: improved ? day : held.setOn,
        runCount: held.runCount + 1,
        fromLastRun: improved ? run === lastRun : held.fromLastRun,
      })
    }
  }

  return [...bests.values()]
}

/**
 * What was lifted last time, per movement.
 *
 * The most recent completion only, which is what favorites-v2's query says and
 * what the display means: "last time" is one session, not the best of several.
 * A movement absent from it is absent here rather than filled in from further
 * back, because a weight attributed to the wrong session is worse than none.
 */
export function lastWeights(runs: readonly FavoriteRun[]): readonly LastWeight[] {
  const last = oldestFirst(runs).at(-1)
  if (last === undefined) return []

  const day = formatDay(last.performed.session.date)

  return runMeasures(last.performed)
    .filter((measure) => measure.kind === 'weight')
    .map((measure) => ({
      key: measure.key,
      label: measure.label,
      display: measure.display,
      setOn: day,
    }))
}

/**
 * One line per completed run, newest first: the date, and the headline result.
 *
 * The headline is the run's timed readings, because those are what the formats
 * were scored on. A run with none says it was completed, with its measured
 * duration when one was recorded — never a top set dressed up as a score.
 */
export function completionHistory(runs: readonly FavoriteRun[]): readonly CompletionEntry[] {
  return [...oldestFirst(runs)].reverse().map((run) => ({
    key: run.sessionId,
    on: formatDay(run.performed.session.date),
    headline: headlineOf(run),
  }))
}

function headlineOf(run: FavoriteRun): string {
  const scored = runMeasures(run.performed).filter((measure) => measure.kind !== 'weight')
  if (scored.length > 0) {
    return scored.map((measure) => `${measureWord(measure)} ${measure.display}`).join(' · ')
  }

  const minutes = run.performed.session.actual_duration_mins
  return minutes === null ? COMPLETED_HEADLINE : `${COMPLETED_HEADLINE} · ${minutes} min`
}

/** `FOR TIME` / `AMRAP`, read back off the key rather than re-derived. */
function measureWord(measure: RunMeasure): string {
  return measure.kind === 'time' ? 'For time' : 'AMRAP'
}

/**
 * One run against another, reading by reading.
 *
 * Only readings present in both runs produce a delta: a position that was
 * scored once and skipped the next time has no comparison to draw, and a
 * movement that was logged once has nothing to have moved against. Both are
 * dropped rather than reported as a change from nothing.
 *
 * `deload` withholds the verdict and keeps the numbers (REQ-059, per OVR-04).
 */
export function compareRuns(
  current: FavoriteRun,
  previous: FavoriteRun,
  options: { deload?: boolean } = {},
): readonly ProgressionDelta[] {
  const deload = options.deload ?? false
  const against = `vs ${formatDay(previous.performed.session.date)}`
  const earlier = new Map(runMeasures(previous.performed).map((m) => [m.key, m]))

  const deltas: ProgressionDelta[] = []

  for (const measure of runMeasures(current.performed)) {
    const before = earlier.get(measure.key)
    if (before === undefined) continue

    const { direction, change } = changeBetween(measure, before)

    deltas.push({
      key: measure.key,
      kind: measure.kind,
      label: measure.label,
      current: measure.display,
      previous: before.display,
      direction: deload ? 'unjudged' : direction,
      change,
      against,
    })
  }

  return deltas
}

/**
 * The change between two readings of the same thing, in words.
 *
 * The words are the same in both framings; only `direction` is withheld on a
 * deload. "12s faster" is a measurement, and refusing to state it would be
 * hiding the history the requirement asks to keep showing.
 */
function changeBetween(
  current: RunMeasure,
  previous: RunMeasure,
): { direction: ProgressionDirection; change: string } {
  if (current.kind === 'time') {
    const saved = previous.value - current.value
    if (saved === 0) return { direction: 'level', change: SAME_TIME }
    return saved > 0
      ? { direction: 'better', change: `${gapText(saved)} faster` }
      : { direction: 'worse', change: `${gapText(-saved)} slower` }
  }

  if (current.kind === 'rounds') {
    const gained = current.value - previous.value
    if (gained === 0) return { direction: 'level', change: SAME_ROUNDS }
    const rounds = Math.abs(gained)
    const noun = rounds === 1 ? 'round' : 'rounds'
    return gained > 0
      ? { direction: 'better', change: `${rounds} ${noun} more` }
      : { direction: 'worse', change: `${rounds} ${noun} fewer` }
  }

  // Weight. The earlier reading is converted into the later one's unit, because
  // the unit a set was logged in is a fact about that set (DATA-01d) and the
  // number the user is looking at now is this run's.
  const unit = current.unit ?? 'kg'
  const before = convertWeight(previous.value, previous.unit ?? unit, unit)
  const moved = current.value - before

  // Below a tenth is a unit conversion's rounding, not a heavier set.
  if (Math.abs(moved) < WEIGHT_EPSILON) return { direction: 'level', change: SAME_WEIGHT }

  return moved > 0
    ? { direction: 'better', change: `${weightText(moved, unit)} heavier` }
    : { direction: 'worse', change: `${weightText(-moved, unit)} lighter` }
}

/** Smaller than this is conversion noise rather than load. */
const WEIGHT_EPSILON = 0.1

// ─────────────────────────────────────────────────────────────────────────────
// The surface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Everything the repeat surface says, from the runs and the framing.
 *
 * The last two runs are what the comparison is drawn between, because that is
 * the thread a person is standing in when they re-run something: what happened
 * last time, and what happened the time before. The bests are drawn over every
 * run, because a best is not a recent fact.
 */
export function favoriteProgression(
  runs: readonly FavoriteRun[],
  options: { deload?: boolean } = {},
): FavoriteProgression {
  const deload = options.deload ?? false
  const framing: ProgressionFraming = deload ? 'deload' : 'competitive'
  const ordered = oldestFirst(runs)
  const last = ordered.at(-1) ?? null
  const before = ordered.at(-2) ?? null

  const deltas =
    last === null || before === null ? [] : compareRuns(last, before, { deload })

  return {
    runCount: ordered.length,
    framing,
    lastRunOn: last === null ? null : formatDay(last.performed.session.date),
    lastRunHeadline: last === null ? null : headlineOf(last),
    bests: personalBests(ordered),
    lastWeights: lastWeights(ordered),
    history: completionHistory(ordered),
    deltas,
    bestsLabel: deload ? BESTS_LABEL_DELOAD : BESTS_LABEL_COMPETITIVE,
    comparisonLabel:
      deltas.length === 0
        ? null
        : deload
          ? COMPARISON_LABEL_DELOAD
          : COMPARISON_LABEL_COMPETITIVE,
    note: noteFor(ordered.length, deload, deltas.length),
  }
}

/**
 * The sentence the surface owes the user, in precedence order.
 *
 * The deload sentence wins: it is the reason the rest of the surface reads the
 * way it does, and a first attempt during a deload is still a deload.
 */
function noteFor(runCount: number, deload: boolean, deltaCount: number): string | null {
  if (deload) return DELOAD_NOTE
  if (runCount === 0) return NO_RUNS_NOTE
  if (deltaCount === 0 && runCount === 1) return FIRST_ATTEMPT_NOTE
  return null
}

/**
 * Whether a deload is in force for the workout about to be performed.
 *
 * OVR-04 is the requirement that decides this, and it is not built: the column
 * it will write is `workout_sessions.is_deload`, and a restored favorite has no
 * session row yet — Review's Start is what writes one. So the two facts the
 * acceptance payload actually carries are read instead: the goal the workout
 * was composed for, and the adjustment that moved it. Both are stated by
 * generation, neither is inferred from a screen, and when OVR-04 lands this
 * function is the single place that changes.
 */
export function deloadInEffect(
  acceptance: Pick<SessionAcceptance, 'goal_preset' | 'adjustment_reason'>,
): boolean {
  if (acceptance.goal_preset === 'active_recovery') return true
  return /deload/i.test(acceptance.adjustment_reason ?? '')
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────────────────────

/** Oldest first, by the attempt's own stamp. The input's order is not trusted. */
function oldestFirst(runs: readonly FavoriteRun[]): readonly FavoriteRun[] {
  return [...runs].sort((left, right) => left.completedAt.localeCompare(right.completedAt))
}

/** `8 rounds + 4 reps`, and `1 round` rather than `1 rounds`. */
function roundsText(rounds: number, partialReps: number | null): string {
  const base = `${rounds} ${rounds === 1 ? 'round' : 'rounds'}`
  if (partialReps === null || partialReps === 0) return base
  return `${base} + ${partialReps} ${partialReps === 1 ? 'rep' : 'reps'}`
}

/** `60 kg`, `62.5 kg` — trailing zeros dropped, never a rounded-away half. */
function weightText(weight: number, unit: WeightUnit): string {
  return `${trim(weight)} ${unit}`
}

/** `12s`, `1m 05s`, `2m` — a gap, not a clock reading. */
function gapText(seconds: number): string {
  const whole = Math.round(seconds)
  if (whole < SECONDS_PER_MINUTE) return `${whole}s`

  const minutes = Math.floor(whole / SECONDS_PER_MINUTE)
  const remainder = whole % SECONDS_PER_MINUTE
  return remainder === 0
    ? `${minutes}m`
    : `${minutes}m ${String(remainder).padStart(2, '0')}s`
}

const SECONDS_PER_MINUTE = 60

/** At most one decimal, and no `.0` — the same reading `session-detail` gives. */
function trim(value: number): string {
  return String(Math.round(value * 10) / 10)
}
