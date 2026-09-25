/**
 * GEN-04 — what the Generate screen is asking, as data and pure functions.
 *
 * `src/app/Generate.tsx` renders this and owns nothing else about it. The split
 * is what makes the requirement's two interesting sentences testable without a
 * browser: "selecting a goal clamps the intensity slider to its valid range" is
 * `withGoal`, and "the payload validates against the CORE-03 request schema
 * before send" is `requestFrom` — one function from the draft to the thing the
 * generation client receives, which refuses rather than sends.
 *
 * Three decisions this module makes, none of them obvious:
 *
 *   * **The goal is asked first and has no default.** The v3 delta (Part 2 §2.1)
 *     says so explicitly, and the reason is the cascade: a goal fixes the
 *     intensity range and which anchors are offered, so a prefilled goal would
 *     be a range and an anchor set the user never chose. The profile's stored
 *     `goal_preset` is a setup preference — "what I generally train for" — and
 *     this screen asks "what is today", which is a different question. The
 *     default *place* does prefill, because that one is the same question.
 *   * **Intensity is a value the goal constrains, not one the goal owns.** It
 *     starts absent; the first goal chosen supplies its default position; every
 *     later goal change keeps the number the user set and snaps it into the new
 *     range (§2.2). Resetting to the new goal's default instead would discard a
 *     deliberate choice every time somebody compared two goals.
 *   * **A draft is never partially valid.** `requestFrom` either answers a
 *     parsed `GenerationRequest` or an `AppError` carrying the field paths
 *     CORE-03 named. There is no third answer where a screen sends something it
 *     has not parsed, which is the acceptance criterion the whole module exists
 *     for.
 *
 * The vocabularies come from `state/onboarding.ts` and the generated enums
 * rather than from a list here: one goal vocabulary, asked in three places
 * (onboarding, settings, generation), plus the fifth preset this screen is the
 * only one to offer.
 *
 * Spec: `docs/specs/generation/generation-prompt-v3-notes.md` Part 2.
 */
import type { Database } from '../data/database.types'
import type { GenerationInput } from '../data/generation'
import type { AppError, Result } from './errors'
import { ErrorCode } from './errors'
import { GOALS, type Option } from './onboarding'
import {
  generationRequestSchema,
  parseBoundary,
  type GenerationRequest,
  type SchemaIssue,
} from './schemas'

type GoalPreset = Database['public']['Enums']['goal_preset']
type SessionFocus = Database['public']['Enums']['session_focus']

// ─────────────────────────────────────────────────────────────────────────────
// Vocabularies
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The five goals, in the delta's order. The first four are onboarding's, so a
 * label edited there is edited here; `active_recovery` is added because this is
 * the screen where it is a way to train today rather than a default to store.
 * "Recovery" is the delta's display label for it.
 */
export const GENERATION_GOALS: readonly Option<GoalPreset>[] = [
  ...GOALS,
  {
    value: 'active_recovery',
    label: 'Recovery',
    description: 'Gentle movement and mobility',
  },
] as const

/** The anchors, with the name a person would use. */
export const ANCHORS: readonly Option<SessionFocus>[] = [
  { value: 'upper_body', label: 'Upper body' },
  { value: 'lower_body', label: 'Lower body' },
  { value: 'full_body', label: 'Full body' },
  { value: 'power', label: 'Power' },
] as const

export interface IntensityRange {
  readonly min: number
  readonly max: number
  /** Where the slider lands the first time this goal is chosen. */
  readonly start: number
}

/**
 * §2.2's table. Every range sits inside `requested_intensity between 1 and 10`,
 * which is the database's own bound and the schema's — these narrow it, and
 * nothing here may widen it.
 */
export const INTENSITY_BY_GOAL: Record<GoalPreset, IntensityRange> = {
  strength: { min: 3, max: 10, start: 6 },
  hypertrophy: { min: 3, max: 9, start: 6 },
  conditioning: { min: 4, max: 10, start: 7 },
  balanced: { min: 1, max: 10, start: 5 },
  active_recovery: { min: 1, max: 3, start: 2 },
}

/** The slider's bounds while no goal has been chosen: the schema's own. */
export const FULL_INTENSITY_RANGE: IntensityRange = { min: 1, max: 10, start: 5 }

/** The time target the screen opens on, in minutes. */
export const DEFAULT_DURATION_MINS = 45

/** `generationRequestSchema` holds notes to this; the field says so first. */
export const NOTES_MAX_LENGTH = 2000

/**
 * §2.3: Active Recovery composes mobility, so Power is not one of its anchors.
 * Stated as a refusal with a reason rather than a hidden button — a control
 * that vanishes has not explained anything.
 */
export const POWER_REFUSAL =
  'Recovery sessions are gentle movement, so Power isn’t one of their anchors.'

// ─────────────────────────────────────────────────────────────────────────────
// The draft
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What the screen holds while it is being filled in. Duration is the text the
 * user typed rather than a number: "" and "4o" are things a person can type
 * into a field, and a draft that could not hold them would have to invent a
 * number for them instead.
 */
export interface GenerationDraft {
  readonly goal: GoalPreset | null
  readonly anchor: SessionFocus | null
  /** Absent until a goal supplies its first position. */
  readonly intensity: number | null
  readonly locationId: string | null
  readonly durationMins: string
  readonly notes: string
}

/** The screen's opening state: the profile's default place, nothing else. */
export function initialDraft(defaultLocationId: string | null): GenerationDraft {
  return {
    goal: null,
    anchor: null,
    intensity: null,
    locationId: defaultLocationId,
    durationMins: String(DEFAULT_DURATION_MINS),
    notes: '',
  }
}

/** The range the slider offers right now. Full while no goal is chosen. */
export function intensityRange(goal: GoalPreset | null): IntensityRange {
  return goal === null ? FULL_INTENSITY_RANGE : INTENSITY_BY_GOAL[goal]
}

/** §2.2: outside the range snaps to the nearest valid value, never to the end. */
export function clampIntensity(goal: GoalPreset, value: number): number {
  const { min, max } = INTENSITY_BY_GOAL[goal]
  return Math.min(max, Math.max(min, value))
}

/** §2.3: which anchors a goal offers. Power is Active Recovery's only exclusion. */
export function anchorAllowed(goal: GoalPreset | null, anchor: SessionFocus): boolean {
  return !(goal === 'active_recovery' && anchor === 'power')
}

// ─────────────────────────────────────────────────────────────────────────────
// Edits
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The cascade, in one function: the new goal's range clamps the intensity, and
 * an anchor the new goal does not offer is deselected rather than sent. §2.3 is
 * explicit that the anchor is left blank rather than substituted — the user
 * chooses again, because no other anchor is the one they meant.
 */
export function withGoal(draft: GenerationDraft, goal: GoalPreset): GenerationDraft {
  return {
    ...draft,
    goal,
    intensity:
      draft.intensity === null
        ? INTENSITY_BY_GOAL[goal].start
        : clampIntensity(goal, draft.intensity),
    anchor:
      draft.anchor !== null && anchorAllowed(goal, draft.anchor) ? draft.anchor : null,
  }
}

/** Selecting the chosen anchor again clears it; an unoffered one is refused. */
export function withAnchor(
  draft: GenerationDraft,
  anchor: SessionFocus,
): GenerationDraft {
  if (!anchorAllowed(draft.goal, anchor)) return draft
  return { ...draft, anchor: draft.anchor === anchor ? null : anchor }
}

/** The slider cannot leave its goal's range, whatever it is handed. */
export function withIntensity(draft: GenerationDraft, value: number): GenerationDraft {
  const { min, max } = intensityRange(draft.goal)
  return { ...draft, intensity: Math.min(max, Math.max(min, Math.round(value))) }
}

export function withLocation(
  draft: GenerationDraft,
  locationId: string,
): GenerationDraft {
  return { ...draft, locationId }
}

export function withDuration(draft: GenerationDraft, minutes: string): GenerationDraft {
  return { ...draft, durationMins: minutes }
}

export function withNotes(draft: GenerationDraft, notes: string): GenerationDraft {
  return { ...draft, notes }
}

// ─────────────────────────────────────────────────────────────────────────────
// Submitting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The CTA's enabled state, and exactly what the requirement says it is: goal
 * *and* anchor. Intensity has a default per goal, so it is always chosen; the
 * time target opens on 45; the place prefills. Anything else wrong with the
 * draft is a refusal with a sentence, not a disabled button — a control that is
 * disabled for an unexplained reason is the failure mode this avoids.
 */
export function canGenerate(draft: GenerationDraft): boolean {
  return draft.goal !== null && draft.anchor !== null
}

/** A whole number of minutes, or null. The schema refuses everything else. */
function minutesFrom(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const minutes = Number(trimmed)
  return Number.isSafeInteger(minutes) ? minutes : null
}

/**
 * The draft as CORE-03's request, or the refusal that stops it being sent.
 *
 * Every value is handed to `generationRequestSchema` rather than checked here:
 * the bounds that matter are `workout_sessions`' CHECK constraints, and a
 * second copy of them in a screen is a second contract that can disagree with
 * the row. An unchosen anchor, a blank time target and a note over its ceiling
 * therefore all refuse the same way — with the field path the schema named —
 * and the screen shows that path rather than a sentence of its own invention.
 *
 * `requestId` is the caller's, so the id a screen validated with is the id it
 * can put beside a refusal.
 */
export function requestFrom(
  draft: GenerationDraft,
  requestId: string,
  /** OVR-04: whether the user applied the suggested deload. Never inferred. */
  deload = false,
): Result<GenerationRequest, AppError> {
  return parseBoundary<GenerationRequest>(
    generationRequestSchema,
    {
      request_id: requestId,
      focus: draft.anchor,
      requested_intensity: draft.intensity,
      requested_duration_mins: minutesFrom(draft.durationMins),
      location_id: draft.locationId,
      notes: draft.notes.trim() === '' ? null : draft.notes.trim(),
      deload,
    },
    { code: ErrorCode.GENERATION_INVALID_PARAMS, requestId },
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Refusals
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What each refused field says, by the path CORE-03 named it with.
 *
 * The schema's own messages are precise and unreadable — "Invalid input:
 * expected int, received NaN" is true and helps nobody — so the path is
 * translated and the sentence is the screen's. A path with no entry here keeps
 * the error's own message rather than being swallowed.
 */
const FIELD_REFUSALS: Record<string, string> = {
  focus: 'Choose an anchor.',
  requested_intensity: 'Choose a goal — it sets the intensity.',
  requested_duration_mins: 'Give the time available as a whole number of minutes.',
  location_id: 'Choose where you are training.',
  notes: `Keep notes under ${NOTES_MAX_LENGTH} characters.`,
}

/** The summary above the form when the payload was refused before send. */
export const REFUSAL_SUMMARY = 'This request can’t be sent yet.'

export interface DraftRefusal {
  /** The sentence the alert region carries. */
  readonly message: string
  /** Field path → the sentence that field shows beneath itself. */
  readonly fields: Readonly<Record<string, string>>
}

/**
 * A CORE-03 refusal as the screen shows it: one summary, and a sentence on
 * each field that was named. An error naming no field it recognises keeps its
 * own message, so a refusal is never rendered as silence.
 */
export function refusalFrom(error: AppError): DraftRefusal {
  const issues = error.details?.issues
  const fields: Record<string, string> = {}

  if (Array.isArray(issues)) {
    for (const issue of issues as readonly SchemaIssue[]) {
      const field = issue.path.replace(/\[\d+\]/g, '')
      fields[field] = FIELD_REFUSALS[field] ?? issue.message
    }
  }

  return {
    message: Object.keys(fields).length === 0 ? error.message : REFUSAL_SUMMARY,
    fields,
  }
}

/**
 * What the generation client is given: the request, minus the id it mints for
 * itself. Written out field by field rather than destructured with a rest, so
 * a field added to the contract fails to compile here instead of travelling
 * silently.
 */
export function inputFrom(request: GenerationRequest): GenerationInput {
  return {
    focus: request.focus,
    requested_intensity: request.requested_intensity,
    requested_duration_mins: request.requested_duration_mins,
    location_id: request.location_id,
    notes: request.notes,
    deload: request.deload,
  }
}
