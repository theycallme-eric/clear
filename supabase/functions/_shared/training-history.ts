/**
 * OVR-02 — the TRAINING HISTORY block, as data.
 *
 * `prompt.ts` serializes this; nothing here knows what the text looks like, and
 * nothing here reads a row it was not handed. The module exists because the
 * block is a set of decisions rather than a formatting exercise: which anchors
 * travel, in what order, how many of them, what each one is allowed to say, and
 * which session directive the whole thing is composed under.
 *
 * **Open question 6 is decided here, and the decision is labels-only.** The spec
 * asks whether the model needs the anchor number or only `progressing /
 * stalled / re_entry` labels, and leans toward withholding the number. That is
 * what this module does: an entry carries confidence, how long since the
 * exercise was trained, and one label — never `anchor_value`, and never a
 * weight in any unit. Two reasons, and the second is the load-bearing one:
 *
 *   * A number in the prompt is a number in the coaching cues. §"Generation
 *     Impact" is explicit that the model will helpfully narrate a weight it was
 *     shown, and a narrated weight conflicts with the one `weight-fill.ts`
 *     computes — the user then reads two different numbers for the same set and
 *     has no way to tell which one the app believes.
 *   * The model cannot use the number for anything it is allowed to do. It
 *     selects and structures; loads are filled afterwards by code. A field that
 *     cannot change the output can only corrupt it.
 *
 * What the labels *are* is deliberately narrow. `progressing` and `stalled` are
 * read off the session anchors behind the stored row, and a stale anchor's label
 * is its staleness rather than its trend — §5's bands are the actionable fact
 * about an exercise nobody has trained in a month, and its trend from before the
 * gap is not.
 *
 * Spec: `docs/specs/OVR-01_progressive-overload.md` §"Generation Impact" (slice
 * b), with the staleness bands from §5 and the deload prescription from §4. The
 * arithmetic on an anchor is `src/state/anchors.ts`'s; the rules that turn one
 * into a weight are `src/state/progression.ts`'s; this module only decides what
 * the model is told.
 */

import type { ConditioningTrend } from '../../../src/state/conditioning.ts'
import { stalenessOf, weeksBetween, type StalenessTier } from '../../../src/state/progression.ts'
import type { LoadAnchorInput } from '../../../src/state/schemas.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §"Generation Impact": one row per exercise with a live anchor, "capped at the
 * 40 most recently trained". The cap is what keeps the block a few hundred
 * tokens as the catalog grows, and it is applied after sorting by recency so the
 * rows that fall off are the ones the model is least likely to be offered.
 */
export const TRAINING_HISTORY_LIMIT = 40

/**
 * §4: working sets "reduced by ~40% (round down, minimum 2)". The multiplier is
 * stated to the model as a multiplier rather than as prose, because "reduce by
 * about 40%" is an instruction a model rounds in whichever direction suits the
 * session it already wanted to write.
 */
export const DELOAD_SET_FACTOR = 0.6
export const DELOAD_MIN_SETS = 2

/** §4: a deload holds a hard RPE ceiling, and says so in the cues. */
export const DELOAD_RPE_CAP = 7

/** §5: a re-entry session's ceiling, one point milder than a deload's. */
export const RE_ENTRY_RPE_CAP = 8

/** §4: conditioning is capped rather than removed. */
export const DELOAD_CONDITIONING_INTENSITY_MAX = 6

/**
 * §5: how many sessions without an increase reads as a stall. D1 needs three
 * consecutive sessions *and* an RPE median ≥9 to trigger a deload — that whole
 * rule is OVR-04's. This is the weaker, label-only half: two sessions that did
 * not move is enough to tell the model an exercise has gone flat, which it may
 * answer by swapping in a close variation.
 */
export const STALL_SESSIONS = 2

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §"Generation Impact"'s `SESSION DIRECTIVE`. One value for the whole session:
 * a deload is a session-level decision (§4) and so is a re-entry (§5), and a
 * prompt carrying two of them at once would be asking the model to choose.
 */
export type SessionDirective = 'normal' | 'deload' | 're_entry'

/** What an exercise's recent anchors say, as a label rather than as a number. */
export type AnchorTrend = 'progressing' | 'stalled' | null

/**
 * One anchored exercise, as the prompt is allowed to see it: the labels and the
 * confidence, and no value in any unit.
 */
export interface AnchoredExercise {
  readonly exerciseId: string
  readonly equipment: string
  readonly confidence: LoadAnchorInput['confidence']
  readonly sessionCount: number
  /** Whole days since the last session behind the anchor. Never negative. */
  readonly daysSinceLastSession: number
  readonly staleness: StalenessTier
  readonly trend: AnchorTrend
  /** The one thing the row says in prose, or `null` when it has nothing to add. */
  readonly note: string | null
}

/** The whole block, before it is text. */
export interface TrainingHistory {
  /** Most recently trained first, capped at `TRAINING_HISTORY_LIMIT`. */
  readonly anchors: readonly AnchoredExercise[]
  readonly directive: SessionDirective
  readonly conditioningTrend: ConditioningTrend
}

/**
 * One stored `load_anchors` row and, where the caller has it, the per-session
 * values behind it (`sessionAnchors(...)` in `anchors.ts`, most recent first).
 *
 * The series is optional because the trend is a label and an absent label is
 * honest: a caller that reads only the cached table still gets confidence and
 * recency, which is most of what the block is for. `anchor_value` is accepted
 * here and deliberately never carried out — see the module comment.
 */
export interface AnchorHistory {
  readonly anchor: LoadAnchorInput
  readonly recentValues?: readonly number[]
}

/** Everything the block is built from. Today included, because staleness needs it. */
export interface TrainingHistoryInput {
  readonly anchors: readonly AnchorHistory[]
  /** `YYYY-MM-DD`. */
  readonly today: string
  /**
   * Whether OVR-04's banner was applied to this session. Until that requirement
   * lands, callers pass `false` — which is the truth rather than a placeholder:
   * no deload has been suggested, so none was accepted.
   */
  readonly deload?: boolean
  /** OVR-03's `conditioningDirective(...).conditioning_trend`. */
  readonly conditioningTrend?: ConditioningTrend
}

// ─────────────────────────────────────────────────────────────────────────────
// The labels
// ─────────────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000

/** Whole days between two `YYYY-MM-DD` dates, floored at zero. */
export function daysBetween(from: string, to: string): number {
  const days = Math.floor((Date.parse(to) - Date.parse(from)) / MS_PER_DAY)
  return Number.isFinite(days) ? Math.max(days, 0) : 0
}

/**
 * The trend in a series of session anchors, most recent first.
 *
 * An increase at the top of the series is `progressing`. `STALL_SESSIONS`
 * consecutive sessions that did not increase is `stalled`. Anything else —
 * including a single session, which cannot have a direction — is `null`, and
 * `null` prints nothing rather than printing a guess.
 */
export function anchorTrend(values: readonly number[] | undefined): AnchorTrend {
  if (!values || values.length < 2) return null
  if (values[0] > values[1]) return 'progressing'

  let flat = 0
  for (let index = 0; index + 1 < values.length; index += 1) {
    if (values[index] > values[index + 1]) break
    flat += 1
  }

  return flat >= STALL_SESSIONS ? 'stalled' : null
}

/**
 * The note column. Staleness outranks trend: §5's bands change what this
 * session may ask for, and a trend measured before a five-week gap describes an
 * athlete who is no longer in the room.
 *
 * `flat` is how many of the most recent sessions did not move, so "stalled 2
 * sessions" says what it says in the spec's own example rather than being a bare
 * adjective.
 */
export function anchorNote(
  staleness: StalenessTier,
  trend: AnchorTrend,
  flatSessions: number,
): string | null {
  if (staleness === 'recalibration') return 're-entry — confirm this number, cap RPE 7'
  if (staleness === 're_entry') return 're-entry — cap RPE 8'
  if (trend === 'stalled') return `stalled ${flatSessions} sessions`
  if (trend === 'progressing') return 'progressing'
  return null
}

/** How many of the most recent sessions failed to increase. */
function flatSessions(values: readonly number[] | undefined): number {
  if (!values) return 0

  let flat = 0
  for (let index = 0; index + 1 < values.length; index += 1) {
    if (values[index] > values[index + 1]) break
    flat += 1
  }

  return flat
}

// ─────────────────────────────────────────────────────────────────────────────
// The block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §5's directive for the session as a whole.
 *
 * A deload wins: it is a decision the user made on the Generate screen, and a
 * re-entry it happens to coincide with is a milder version of the same
 * instruction. Otherwise the most recently trained anchor decides — a user whose
 * freshest anchor is three weeks old has not trained in three weeks, whatever
 * the older rows say.
 */
export function sessionDirective(input: TrainingHistoryInput): SessionDirective {
  if (input.deload) return 'deload'

  const latest = input.anchors
    .map((entry) => entry.anchor.last_session_date)
    .sort()
    .at(-1)

  if (latest === undefined) return 'normal'

  const tier = stalenessOf(weeksBetween(latest, input.today)).tier

  return tier === 're_entry' || tier === 'recalibration' ? 're_entry' : 'normal'
}

/**
 * The block, sorted and capped.
 *
 * Ordering is recency first and then the key, so two runs against the same
 * history produce the same block byte for byte — the same property the candidate
 * serializer has, and for the same reason: a prompt that reorders on its own
 * makes every size and quality comparison meaningless. A discarded anchor (§5's
 * twelve-week rule) is left out entirely rather than shown with a caveat: the
 * app has decided the number is contaminated, and an exercise the model is told
 * about is an exercise it thinks it knows something about.
 */
export function buildTrainingHistory(input: TrainingHistoryInput): TrainingHistory {
  const entries = input.anchors
    .map((entry) => describe(entry, input.today))
    .filter((entry): entry is AnchoredExercise => entry !== null)
    .sort(byRecencyThenKey)
    .slice(0, TRAINING_HISTORY_LIMIT)

  return {
    anchors: entries,
    directive: sessionDirective(input),
    conditioningTrend: input.conditioningTrend ?? 'hold',
  }
}

function describe(entry: AnchorHistory, today: string): AnchoredExercise | null {
  const { anchor } = entry
  const staleness = stalenessOf(weeksBetween(anchor.last_session_date, today)).tier

  if (staleness === 'discarded') return null

  const trend = anchorTrend(entry.recentValues)

  return {
    exerciseId: anchor.exercise_id,
    equipment: anchor.equipment_used,
    confidence: anchor.confidence,
    sessionCount: anchor.session_count,
    daysSinceLastSession: daysBetween(anchor.last_session_date, today),
    staleness,
    trend,
    note: anchorNote(staleness, trend, flatSessions(entry.recentValues)),
  }
}

function byRecencyThenKey(left: AnchoredExercise, right: AnchoredExercise): number {
  return (
    left.daysSinceLastSession - right.daysSinceLastSession ||
    left.exerciseId.localeCompare(right.exerciseId) ||
    left.equipment.localeCompare(right.equipment)
  )
}
