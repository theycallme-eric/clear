/**
 * OVR-01c — the suggestion a briefing states, and the override that replaces it
 * for one session.
 *
 * OVR-01b answered *what should this weigh* as pure arithmetic and nothing
 * called it. This module is the Review screen's caller: it takes the composed
 * workout, the user's stored anchors and the working sets behind them, and
 * answers one `LoadSuggestionView` per prescription that has an anchor — the
 * number, the confidence that qualifies it, the rule that produced it and the
 * session it was read from, so the "why this number" dialog is rendering a
 * record rather than re-deriving a sentence.
 *
 * Five decisions are stated once here because each is an acceptance criterion:
 *
 *   * **No anchor, no entry.** A prescription the user has never logged a
 *     working set for is absent from the map, and the row renders nothing at
 *     all. An absent suggestion is a state; a suggestion of zero is a claim
 *     about capacity, and §5's contamination principle is that the second one
 *     is worse than silence.
 *   * **An anchored prescription that cannot produce an honest number is still
 *     an entry**, with `weight: null` and the reason why — an anchor last
 *     logged four months ago, a bodyweight implement that progresses by reps.
 *     That is the difference between "we have nothing to say" and "we have
 *     something to say and it is not a number".
 *   * **Confidence travels with the number or not at all.** `suggestLoad`
 *     refuses to answer without it, and this module refuses to summarise a
 *     suggestion without saying how many sessions are behind it.
 *   * **One unit, from the first arithmetic to the stored override.** The
 *     anchor's unit is the evidence's (OVR-01a) and the briefing's is the
 *     profile's, so the anchor is converted *before* `suggestLoad` inverts it.
 *     Every snap, clamp and increment therefore happens in the unit the user
 *     reads and types, and `load_value` — a column with no unit of its own — is
 *     written in the unit the screen was showing.
 *   * **An override is a revision of this session's prescription and of nothing
 *     else.** `applyLoadOverrides` returns a new acceptance payload whose
 *     prescription carries `load_type: 'absolute'` and the user's number, which
 *     is what `accept` persists onto `workout_exercises`. No anchor is rewritten
 *     — `load_anchors` is a function of logged set history, this screen writes no
 *     set logs, and the next recomputation reads the same evidence it would
 *     have read.
 *
 * Three facts this module decides are also decided by OVR-02's post-generation
 * fill (`supabase/functions/_shared/weight-fill.ts`): which session functions are
 * working sets, which rep target a load is inverted at, and the reps in reserve
 * an intensity implies. They are restated rather than imported because nothing
 * under `src/` may reach into the edge function's directory — that is the rule
 * that keeps prompts out of the browser bundle — and they are held to each other
 * by `src/state/load-suggestions.test.ts`, which runs both implementations over
 * the same workout and fails when they disagree. A duplicate with a test is a
 * duplicate that cannot drift; the alternative, on this side of the boundary, is
 * a duplicate nobody compares.
 *
 * Pure and React-free, like `review.ts` beside it. The reads are
 * `anchor-queries.ts`'s and the markup is `src/ui/load-suggestion.tsx`'s.
 *
 * Spec: `docs/specs/OVR-01_progressive-overload.md` §§1, 2, 5 and UI touchpoints
 * 2 and 3.
 */
import { convertWeight, type WeightUnit } from './anchors'
import { exerciseName } from './prescription'
import {
  sessionRead,
  suggestLoad,
  type LoadSuggestion,
  type ProgressionRuleId,
  type SessionRead,
  type SuggestionConfidence,
} from './progression'
import type {
  AnchorEvidenceRow,
  LoadAnchorRow,
  Prescription,
  SessionAcceptance,
  SessionFunction,
} from './schemas'

// ─────────────────────────────────────────────────────────────────────────────
// What OVR-02 also decides
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The session functions that are working sets — the same four `weight-fill.ts`
 * fills. A prep drill and a cooldown stretch are prescribed by shape, not at a
 * fraction of a maximum, so a suggestion on one would be a number nobody asked
 * for; a conditioning round progresses by density, which is OVR-03's.
 */
export const LOADED_SESSION_FUNCTIONS: readonly SessionFunction[] = [
  'primary',
  'accessory',
  'balance',
  'core',
]

/**
 * The target RPE each intensity band is composed at, and so the reps in reserve
 * a load is inverted at: `RIR = 10 − target RPE`. Index 0 is unused — intensity
 * is 1–10 and the database constrains it to that.
 */
export const SUGGESTION_TARGET_RPE: readonly number[] = [0, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9]

/** The reps in reserve an intensity implies, through the table above. */
export function suggestionTargetRir(intensity: number): number {
  const clamped = Math.min(Math.max(Math.round(intensity), 1), SUGGESTION_TARGET_RPE.length - 1)
  return 10 - SUGGESTION_TARGET_RPE[clamped]
}

/**
 * The reps a load is inverted at, or `null` for a piece measured in time or
 * distance, which progresses by density rather than by weight.
 *
 * A range answers with its top and a ladder with its longest rung — both the
 * lighter of the two available answers, which is the whole argument: an
 * over-suggestion is the failure mode that hurts somebody.
 */
export function suggestionTargetReps(prescription: Prescription): number | null {
  if (prescription.modality !== 'reps') return null

  switch (prescription.target_kind) {
    case 'fixed':
      return prescription.target_value
    case 'range':
      return prescription.target_max
    case 'sequence':
      return prescription.target_sequence.length === 0
        ? null
        : Math.max(...prescription.target_sequence)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The view
// ─────────────────────────────────────────────────────────────────────────────

/** One set of the last session, as the dialog states it. */
export interface LastSessionSet {
  readonly setNumber: number
  /** Reps performed. `null` is not recorded, which is not zero. */
  readonly reps: number | null
  /** What that set asked for, from the prescription row it was logged against. */
  readonly prescribedReps: number | null
  /** The weight, converted into the suggestion's unit. */
  readonly weight: number | null
  readonly rpe: number | null
}

/** The session a rule was read from. Absent when the anchor predates any read. */
export interface LastSessionView {
  /** The training day, `YYYY-MM-DD`. */
  readonly date: string
  readonly sets: readonly LastSessionSet[]
  /** Median RPE of the sets that recorded one (§2 reads the median, not the mean). */
  readonly medianRpe: number | null
  /** The heaviest set of that session, in the suggestion's unit. */
  readonly topWeight: number | null
}

/** One prescription's suggestion, and everything that qualifies it. */
export interface LoadSuggestionView {
  /** The site key `review.ts` gives the same prescription. */
  readonly key: string
  readonly exerciseId: string
  /** The movement, in the words the briefing names it in. */
  readonly name: string
  readonly equipment: string
  /** `null` when no honest number exists — the reason says which case it is. */
  readonly weight: number | null
  /** The unit every number in this view is stated in. */
  readonly unit: WeightUnit
  readonly confidence: SuggestionConfidence
  /** Sessions of history behind the anchor. The confidence, as a count. */
  readonly sessionCount: number
  readonly rule: ProgressionRuleId | null
  /** `read → action`, from OVR-01b: "RPE 7.5–8.5, all reps completed → +1 increment". */
  readonly reason: string
  /** Whether §1's 110% clamp bound the answer. */
  readonly clamped: boolean
  /** The change from the heaviest set logged last time, in `unit`. */
  readonly delta: number | null
  readonly lastSession: LastSessionView | null
}

/** A weight the user typed in place of the suggestion, for this session only. */
export interface LoadOverride {
  readonly weight: number
  readonly unit: WeightUnit
}

/** Overrides by site key. Empty is the ordinary case. */
export type LoadOverrides = ReadonlyMap<string, LoadOverride>

/** Every suggestion of one briefing, by site key. */
export type LoadSuggestions = ReadonlyMap<string, LoadSuggestionView>

// ─────────────────────────────────────────────────────────────────────────────
// Keys
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The key one prescription is identified by within one briefing, and the only
 * definition of it: `review.ts` builds its `ReviewExerciseView` keys from this
 * function, so a suggestion and the row it belongs to cannot be keyed two ways.
 * Composed prescriptions have no ids until acceptance, so position is the only
 * identity available.
 */
export function prescriptionSiteKey(
  sectionIndex: number,
  blockIndex: number,
  exerciseIndex: number,
): string {
  return `section-${sectionIndex}-block-${blockIndex}-exercise-${exerciseIndex}`
}

/** One lift, one implement — the key `load_anchors` stores a row under. */
function anchorKey(exerciseId: string, equipment: string): string {
  return `${exerciseId} ${equipment}`
}

// ─────────────────────────────────────────────────────────────────────────────
// The derivation
// ─────────────────────────────────────────────────────────────────────────────

/** Everything the suggestions are derived from. No row is fetched here. */
export interface SuggestionSources {
  /** The composed workout and the facts it was composed under. */
  readonly acceptance: SessionAcceptance
  /** The user's stored anchors (OVR-01a). */
  readonly anchors: readonly LoadAnchorRow[]
  /** Every working set that may move an anchor (`anchor_evidence`). */
  readonly evidence: readonly AnchorEvidenceRow[]
  /**
   * The profile's unit. `null` while the profile has not answered: the anchor's
   * own unit is then used and stated, rather than a unit guessed from a default.
   */
  readonly weightUnit?: WeightUnit | null
}

/**
 * One suggestion per anchored working set of the composed workout.
 *
 * Staleness is measured against the session's own training day rather than
 * against a clock read here — the workout is for that day, and a pure function
 * that read the time would answer differently on two renders of one briefing.
 */
export function reviewLoadSuggestions(sources: SuggestionSources): LoadSuggestions {
  const { acceptance, evidence, weightUnit = null } = sources
  const anchors = new Map(
    sources.anchors.map((row) => [anchorKey(row.exercise_id, row.equipment_used), row]),
  )
  const sets = groupEvidence(evidence)
  const suggestions = new Map<string, LoadSuggestionView>()

  acceptance.workout.sections.forEach((section, sectionIndex) => {
    section.blocks.forEach((block, blockIndex) => {
      block.exercises.forEach((exercise, exerciseIndex) => {
        const key = anchorKey(exercise.exercise_id, exercise.equipment)
        const anchor = anchors.get(key)
        if (anchor === undefined) return
        if (!LOADED_SESSION_FUNCTIONS.includes(exercise.session_function)) return

        const targetReps = suggestionTargetReps(exercise)
        if (targetReps === null) return

        const unit = weightUnit ?? anchor.unit
        const history = sets.get(key) ?? []
        const lastSession = lastSessionView(history, unit)
        const site = prescriptionSiteKey(sectionIndex, blockIndex, exerciseIndex)

        suggestions.set(
          site,
          suggestionFor({
            key: site,
            acceptance,
            exercise,
            anchor,
            unit,
            targetReps,
            lastSession,
            read: lastSession === null ? null : readOf(history, lastSession.date),
            recentMax: recentMaxOf(history, acceptance.date, unit),
          }),
        )
      })
    })
  })

  return suggestions
}

interface SuggestionArgs {
  readonly key: string
  readonly acceptance: SessionAcceptance
  readonly exercise: Prescription
  readonly anchor: LoadAnchorRow
  readonly unit: WeightUnit
  readonly targetReps: number
  readonly lastSession: LastSessionView | null
  readonly read: SessionRead | null
  readonly recentMax: number | null
}

/**
 * One prescription's suggestion.
 *
 * `region` is `upper` for every movement, and that is a gap rather than a
 * decision: nothing in the catalog marks an exercise as upper or lower body
 * (OVR-01b recorded the same gap), and this screen holds no candidate rows to
 * read a movement pattern from. `upper` is the smaller percentage step, so an
 * unknown region produces the more conservative upward suggestion.
 */
function suggestionFor(args: SuggestionArgs): LoadSuggestionView {
  const { key, acceptance, exercise, anchor, unit, targetReps, lastSession, read, recentMax } =
    args

  const suggestion: LoadSuggestion = suggestLoad({
    anchor: {
      value: convertWeight(anchor.anchor_value, anchor.unit, unit),
      unit,
      sessionCount: anchor.session_count,
      lastSessionDate: anchor.last_session_date,
    },
    today: acceptance.date,
    equipment: exercise.equipment,
    targetReps,
    // A RIR the model stated is a prescription and not a weight, so it is
    // honoured; otherwise the effective intensity's band decides.
    targetRir:
      exercise.load_type === 'rir' && exercise.load_value !== null
        ? exercise.load_value
        : suggestionTargetRir(acceptance.effective_intensity),
    goal: acceptance.goal_preset ?? 'balanced',
    region: 'upper',
    role: exercise.session_function === 'primary' ? 'primary' : 'accessory',
    lastSession: read,
    recentMax: recentMax === null ? null : { value: recentMax, unit },
  })

  return {
    key,
    exerciseId: exercise.exercise_id,
    name: exerciseName(exercise.exercise_id),
    equipment: exercise.equipment,
    weight: suggestion.weight,
    unit,
    confidence: suggestion.confidence,
    sessionCount: suggestion.sessionCount,
    rule: suggestion.rule,
    reason: suggestion.reason,
    clamped: suggestion.clamped,
    delta: deltaOf(suggestion.weight, lastSession?.topWeight ?? null),
    lastSession,
  }
}

/** Working sets by exercise-and-implement, newest session first within a key. */
function groupEvidence(
  evidence: readonly AnchorEvidenceRow[],
): ReadonlyMap<string, readonly AnchorEvidenceRow[]> {
  const grouped = new Map<string, AnchorEvidenceRow[]>()

  for (const row of evidence) {
    const key = anchorKey(row.exercise_id, row.equipment_used)
    const existing = grouped.get(key)
    if (existing === undefined) grouped.set(key, [row])
    else existing.push(row)
  }

  return grouped
}

/**
 * The most recent session in `history`, its sets in the order they were
 * performed, every weight in `unit`.
 *
 * "Most recent" is the training day, and `logged_at` breaks a tie between two
 * sessions on one day — which is a thing people do (DATA-01c).
 */
function lastSessionView(
  history: readonly AnchorEvidenceRow[],
  unit: WeightUnit,
): LastSessionView | null {
  const newest = newestSession(history)
  if (newest === null) return null

  const sets = [...history.filter((row) => row.session_id === newest)]
    .sort((left, right) => left.set_number - right.set_number)

  if (sets.length === 0) return null

  const weights = sets
    .map((row) => (row.weight === null ? null : convertWeight(row.weight, row.weight_unit, unit)))
    .filter((weight): weight is number => weight !== null)

  return {
    date: sets[0].session_date,
    sets: sets.map((row) => ({
      setNumber: row.set_number,
      reps: row.actual_reps,
      prescribedReps: row.prescribed_reps,
      weight: row.weight === null ? null : round(convertWeight(row.weight, row.weight_unit, unit)),
      rpe: row.rpe,
    })),
    medianRpe: sessionRead(sets).medianRpe,
    topWeight: weights.length === 0 ? null : round(Math.max(...weights)),
  }
}

/** The session id of the newest training day in one key's history. */
function newestSession(history: readonly AnchorEvidenceRow[]): string | null {
  let newest: AnchorEvidenceRow | null = null

  for (const row of history) {
    if (newest === null) {
      newest = row
      continue
    }
    if (row.session_date > newest.session_date) newest = row
    else if (row.session_date === newest.session_date && row.logged_at > newest.logged_at) {
      newest = row
    }
  }

  return newest?.session_id ?? null
}

/** §2's read of the sets performed on one training day. */
function readOf(history: readonly AnchorEvidenceRow[], date: string): SessionRead {
  return sessionRead(history.filter((row) => row.session_date === date))
}

/**
 * §1's clamp maximum: the heaviest working set actually logged in the last eight
 * weeks, in `unit`. `null` when nothing in the window carried a weight — the
 * clamp then has no ceiling to impose rather than a ceiling of zero.
 */
function recentMaxOf(
  history: readonly AnchorEvidenceRow[],
  today: string,
  unit: WeightUnit,
): number | null {
  const cutoff = Date.parse(today) - CLAMP_WINDOW_DAYS * MS_PER_DAY
  let max: number | null = null

  for (const row of history) {
    if (row.weight === null || row.weight <= 0) continue
    if (Date.parse(row.session_date) < cutoff) continue

    const weight = convertWeight(row.weight, row.weight_unit, unit)
    if (max === null || weight > max) max = weight
  }

  return max
}

/** The change from last time, or `null` when either end is unknown. */
function deltaOf(weight: number | null, topWeight: number | null): number | null {
  if (weight === null || topWeight === null) return null
  return round(weight - topWeight)
}

const MS_PER_DAY = 86_400_000
/** §1's clamp window, in days: eight weeks. */
const CLAMP_WINDOW_DAYS = 56
/** Two decimals, so the same history twice produces the same text. */
const WEIGHT_PRECISION = 2

function round(value: number): number {
  const factor = 10 ** WEIGHT_PRECISION
  return Math.round(value * factor) / factor
}

// ─────────────────────────────────────────────────────────────────────────────
// Words
// ─────────────────────────────────────────────────────────────────────────────

/** The label the suggestion affordance carries, whatever state it is in. */
export const SUGGESTION_LABEL = 'Suggested'
/** What a suggestion with no honest number reads as. Never a zero. */
export const NO_SUGGESTION_LABEL = 'No suggested weight'
export const OVERRIDE_LABEL = 'Your weight'
/** §5's lowest tier, in words as well as in treatment. */
export const LOW_CONFIDENCE_LABEL = 'Low confidence'

/** `185 lb`. The unit is always stated: a bare number is two answers. */
export function weightText(weight: number, unit: WeightUnit): string {
  return `${weight} ${unit}`
}

/** `4 sessions` — §5's confidence, which is a count before it is a word. */
export function sessionCountText(sessionCount: number): string {
  return `${sessionCount} session${sessionCount === 1 ? '' : 's'}`
}

/** `+5 lb`, `−10 lb`, or null when there is nothing to compare against. */
export function deltaText(delta: number | null, unit: WeightUnit): string | null {
  if (delta === null || delta === 0) return null
  const sign = delta > 0 ? '+' : '−'
  return `${sign}${Math.abs(delta)} ${unit}`
}

/**
 * The affordance's own reading: the number, what it moved by, and how much
 * history is behind it — or, for a suggestion with no number, what is missing.
 *
 * Low confidence is in the words and not only in the treatment, which is the
 * criterion: a muted colour is a cue nobody can hear.
 */
export function suggestionSummary(
  view: LoadSuggestionView,
  override: LoadOverride | null = null,
): string {
  const parts: string[] = []

  if (override !== null) {
    parts.push(`${OVERRIDE_LABEL} ${weightText(override.weight, override.unit)}`)
    parts.push(
      view.weight === null
        ? NO_SUGGESTION_LABEL.toLowerCase()
        : `${SUGGESTION_LABEL.toLowerCase()} ${weightText(view.weight, view.unit)}`,
    )
    return parts.join(' · ')
  }

  if (view.weight === null) {
    parts.push(NO_SUGGESTION_LABEL)
  } else {
    parts.push(`${SUGGESTION_LABEL} ${weightText(view.weight, view.unit)}`)
    const delta = deltaText(view.delta, view.unit)
    if (delta !== null) parts.push(delta)
  }

  if (view.confidence === 'low') parts.push(LOW_CONFIDENCE_LABEL)
  parts.push(sessionCountText(view.sessionCount))

  return parts.join(' · ')
}

/** One set of the last session: `Set 1 · 8 of 8 reps · 180 lb · RPE 7.5`. */
export function lastSetText(set: LastSessionSet, unit: WeightUnit): string {
  const parts = [`Set ${set.setNumber}`]

  if (set.reps !== null) {
    parts.push(
      set.prescribedReps === null
        ? `${set.reps} reps`
        : `${set.reps} of ${set.prescribedReps} reps`,
    )
  }
  if (set.weight !== null) parts.push(weightText(set.weight, unit))
  parts.push(set.rpe === null ? 'RPE not recorded' : `RPE ${set.rpe}`)

  return parts.join(' · ')
}

/** `RPE 7.5 median across 3 sets`, or the honest absence of one. */
export function recordedRpeText(lastSession: LastSessionView): string {
  const count = lastSession.sets.length
  const sets = `${count} set${count === 1 ? '' : 's'}`

  return lastSession.medianRpe === null
    ? `No RPE recorded across ${sets}`
    : `RPE ${lastSession.medianRpe} median across ${sets}`
}

// ─────────────────────────────────────────────────────────────────────────────
// The override
// ─────────────────────────────────────────────────────────────────────────────

/** What the dialog says overriding does, and does not do. */
export const OVERRIDE_SCOPE_NOTE =
  'Changes this session only. Your load anchor is unchanged — it moves from the sets you log, not from this number.'

/**
 * `text` as a weight, or `null` when it is not one.
 *
 * Zero is refused rather than accepted as "unloaded": an unloaded movement is a
 * different prescription, and a set of a barbell lift at zero is a typo.
 */
export function parseOverride(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return null

  const value = Number(trimmed)
  if (!Number.isFinite(value) || value <= 0) return null

  return round(value)
}

/**
 * The acceptance payload with every override applied — what `accept` persists,
 * and therefore the only place an override exists.
 *
 * The override becomes the prescription's own load: `absolute` with the user's
 * number, which is the contract's way of saying "this weight", and which
 * `workout_exercises` holds in the column a suggestion has no column for. The
 * anchor is not touched, and could not be: this screen writes no set logs, and
 * `load_anchors` is a function of those.
 *
 * Returns the payload unchanged when there is nothing to override, so an
 * untouched briefing accepts exactly the object generation produced.
 */
export function applyLoadOverrides(
  acceptance: SessionAcceptance,
  overrides: LoadOverrides,
): SessionAcceptance {
  if (overrides.size === 0) return acceptance

  let changed = false

  const sections = acceptance.workout.sections.map((section, sectionIndex) => ({
    ...section,
    blocks: section.blocks.map((block, blockIndex) => ({
      ...block,
      exercises: block.exercises.map((exercise, exerciseIndex) => {
        const override = overrides.get(
          prescriptionSiteKey(sectionIndex, blockIndex, exerciseIndex),
        )
        if (override === undefined) return exercise

        changed = true
        return { ...exercise, load_type: 'absolute' as const, load_value: override.weight }
      }),
    })),
  }))

  if (!changed) return acceptance

  return { ...acceptance, workout: { ...acceptance.workout, sections } }
}
