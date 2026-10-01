/**
 * GEN-04 — what the Generate screen is asking, as data and pure functions.
 *
 * `src/app/Generate.tsx` renders this and owns nothing else about it. The split
 * is what makes the requirement's two interesting sentences testable without a
 * browser: "Generate uses the standing Goal and the recommended Focus" is
 * `resolveGeneration`, and "the payload validates against the CORE-03 request
 * schema before send" is `requestFrom` — one function from the draft to the
 * thing the generation client receives, which refuses rather than sends.
 *
 * Three decisions this module makes, none of them obvious:
 *
 *   * **Goal and Focus are resolved, not asked.** The Goal is the profile's
 *     standing `goal_preset` — chosen in onboarding, changed in Settings — and
 *     the Focus is the one recent history recommends. `resolveGeneration` is the
 *     only place either is decided: it reads the standing Goal, the shared
 *     eligibility rule's answer and the draft's own choices, and says what would
 *     be sent. A Focus is asked for only when history cannot recommend one, and
 *     a missing or legacy standing Goal is `needs-settings` — corrected in
 *     Settings, never guessed here. The draft holds no Goal at all, only whether
 *     this one workout is a Recovery session.
 *   * **Intensity is a value the goal constrains, not one the goal owns.** It
 *     starts where recent history averaged, or at the Goal's own start when
 *     there is no recommendation, and is always clamped to the effective Goal's
 *     range (§2.2). A number the athlete set is kept and snapped into the range
 *     rather than reset, so switching Recovery on and off discards nothing.
 *   * **A draft is never partially valid.** `requestFrom` either answers a
 *     parsed `GenerationRequest` or an `AppError` carrying the field paths
 *     CORE-03 named. There is no third answer where a screen sends something it
 *     has not parsed, which is the acceptance criterion the whole module exists
 *     for.
 *
 * The vocabularies come from `state/onboarding.ts` and the generated enums
 * rather than from a list here: one goal vocabulary, used in three places
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
  sessionFocusSchema,
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

/** The slider's bounds while no goal is resolved: the schema's own. */
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
// Prefilling (HOME-03)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What another screen may open this one *with*: an anchor and an intensity.
 *
 * Deliberately a pair and not a draft. A prefill is a suggestion about what to
 * train, so it carries the two things history can support — HOME-03's
 * least-recently-trained focus and the intensity recent sessions averaged — and
 * nothing about the goal, the place, the time or the notes, each of which is
 * either the user's standing preference or a question only today can answer.
 */
export interface GenerationPrefill {
  readonly focus: SessionFocus
  readonly intensity: number
}

/** GEN-04's route, owned here so a prefilled link is built where prefill is defined. */
export const GENERATE_PATH = '/generate'

export const PREFILL_FOCUS_PARAM = 'focus'
export const PREFILL_INTENSITY_PARAM = 'intensity'

/**
 * Where a prefilled Generate screen lives.
 *
 * The prefill travels in the URL rather than in router state or a provider, and
 * that is a decision rather than a convenience: a query string survives a
 * reload and a shared link, it is legible in a bug report, and it makes the
 * hand-off one path plus one parser instead of a context two screens have to
 * agree about. It also means the values are user-editable, which is why
 * `prefillFrom` parses rather than trusts.
 */
export function generatePath(prefill: GenerationPrefill | null = null): string {
  if (prefill === null) return GENERATE_PATH

  const params = new URLSearchParams({
    [PREFILL_FOCUS_PARAM]: prefill.focus,
    [PREFILL_INTENSITY_PARAM]: String(prefill.intensity),
  })

  return `${GENERATE_PATH}?${params.toString()}`
}

/**
 * The prefill a URL carries, or `null` — for absent, unknown and out-of-range
 * alike, which is exactly what "dismissing it leaves defaults" needs: a Generate
 * screen with no usable prefill is a Generate screen with its defaults.
 *
 * Both fields or neither. A focus with no intensity would be a draft half
 * composed by a suggestion and half by this module, and no reader of the URL
 * could tell which number was whose.
 */
export function prefillFrom(search: string | URLSearchParams): GenerationPrefill | null {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search

  const focus = sessionFocusSchema.safeParse(params.get(PREFILL_FOCUS_PARAM))
  if (!focus.success) return null

  const raw = params.get(PREFILL_INTENSITY_PARAM) ?? ''
  if (!/^\d+$/.test(raw.trim())) return null

  const intensity = Number(raw.trim())
  const { min, max } = FULL_INTENSITY_RANGE
  if (intensity < min || intensity > max) return null

  return { focus: focus.data, intensity }
}

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
  /** Whether this one workout is a Recovery session. Never the standing Goal. */
  readonly recovery: boolean
  /** The Focus the athlete chose by hand. Null leaves it to the recommendation. */
  readonly anchor: SessionFocus | null
  /** The intensity the athlete set. Null leaves it to history or the Goal's start. */
  readonly intensity: number | null
  readonly locationId: string | null
  readonly durationMins: string
  readonly notes: string
}

/**
 * The screen's opening state: the profile's default place, plus whatever
 * HOME-03's suggestion prefilled and nothing else.
 *
 * It carries no Goal and no recommended Focus — those are `resolveGeneration`'s
 * to supply from the profile and from history, so a draft nobody has touched
 * resolves to whatever they say today rather than to a copy taken at open.
 */
export function initialDraft(
  defaultLocationId: string | null,
  prefill: GenerationPrefill | null = null,
): GenerationDraft {
  return {
    recovery: false,
    anchor: prefill?.focus ?? null,
    intensity: prefill?.intensity ?? null,
    locationId: defaultLocationId,
    durationMins: String(DEFAULT_DURATION_MINS),
    notes: '',
  }
}

/** The range the slider offers right now. Full while no goal is resolved. */
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
// Resolving
// ─────────────────────────────────────────────────────────────────────────────

/** A Goal a profile may stand on: onboarding's four, never Recovery. */
export type StandingGoal = Exclude<GoalPreset, 'active_recovery'>

/**
 * The profile's `goal_preset` as a standing Goal, or `null` when it cannot be
 * one: absent, or a legacy `active_recovery`. Recovery is a way to train one
 * workout, not a preference to store, so a profile holding it is corrected in
 * Settings rather than generated from.
 */
export function standingGoalFrom(
  goalPreset: GoalPreset | null | undefined,
): StandingGoal | null {
  if (goalPreset == null || goalPreset === 'active_recovery') return null
  return GOALS.some((goal) => goal.value === goalPreset) ? goalPreset : null
}

/**
 * What history says about a Focus, as this module needs it. The first three are
 * `suggestionEligibility`'s own answers — its result is passed straight in —
 * and `history-error` is the query layer's: a read that failed is not a
 * first-workout state, though it asks for a Focus the same way.
 */
export type FocusHistory =
  | {
      readonly status: 'recommended'
      readonly focus: SessionFocus
      readonly intensity: number
      readonly reason: string
    }
  | { readonly status: 'no-completed-history' }
  | { readonly status: 'stale-history' }
  | { readonly status: 'history-error' }

/** What the resolver is given besides the draft: the profile and the history. */
export interface GenerationContext {
  /** The loaded profile's `goal_preset`, exactly as stored. */
  readonly goalPreset: GoalPreset | null
  readonly history: FocusHistory
}

/**
 * What a draft resolves to.
 *
 *   * `ready` — a Goal and a Focus, so a request can be built.
 *   * `needs-focus` — a Goal, and no Focus until the athlete chooses one. `why`
 *     is the reason there is none to offer, so a screen can say it truthfully.
 *   * `needs-settings` — no usable standing Goal. Nothing can be sent.
 */
export type GenerationResolution =
  | {
      readonly status: 'ready'
      readonly goal: GoalPreset
      readonly focus: SessionFocus
      /** Whether history recommended the Focus or the athlete chose it. */
      readonly focusSource: 'recommended' | 'manual'
      /** The recommendation's history-backed reason. Null for a manual Focus. */
      readonly reason: string | null
      readonly intensity: number
    }
  | {
      readonly status: 'needs-focus'
      readonly goal: GoalPreset
      readonly focus: null
      readonly why: FocusHistory['status'] | 'power-refused'
      readonly intensity: number
    }
  | {
      readonly status: 'needs-settings'
      readonly goal: null
      readonly focus: null
      readonly intensity: null
    }

/**
 * The one place Goal, Focus and intensity are decided.
 *
 * The Goal is the standing one, or Recovery when the draft asks for it for this
 * workout. The Focus is the athlete's own choice when they made one and the
 * recommendation otherwise; Power under Recovery is refused rather than
 * swapped for another Focus (§2.3). The intensity is the athlete's number, else
 * the history-derived one, else the Goal's start — clamped to the Goal's range
 * whichever it was.
 */
export function resolveGeneration(
  draft: GenerationDraft,
  context: GenerationContext,
): GenerationResolution {
  const standing = standingGoalFrom(context.goalPreset)
  if (standing === null) {
    return { status: 'needs-settings', goal: null, focus: null, intensity: null }
  }

  const { history } = context
  const goal: GoalPreset = draft.recovery ? 'active_recovery' : standing
  const recommended = history.status === 'recommended' ? history : null
  const intensity = clampIntensity(
    goal,
    draft.intensity ?? recommended?.intensity ?? INTENSITY_BY_GOAL[goal].start,
  )

  const focus = draft.anchor ?? recommended?.focus ?? null
  if (focus === null) {
    return { status: 'needs-focus', goal, focus: null, why: history.status, intensity }
  }
  if (!anchorAllowed(goal, focus)) {
    return { status: 'needs-focus', goal, focus: null, why: 'power-refused', intensity }
  }

  const manual = draft.anchor !== null
  return {
    status: 'ready',
    goal,
    focus,
    focusSource: manual ? 'manual' : 'recommended',
    reason: manual ? null : (recommended?.reason ?? null),
    intensity,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Edits
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recovery for this one workout, on or off. An anchor Recovery does not offer
 * is deselected rather than sent: §2.3 is explicit that the anchor is left
 * blank rather than substituted — the user chooses again, because no other
 * anchor is the one they meant. The intensity is left alone; the resolver
 * clamps it to whichever range is in force.
 */
export function withRecovery(draft: GenerationDraft, recovery: boolean): GenerationDraft {
  const goal = recovery ? 'active_recovery' : null
  return {
    ...draft,
    recovery,
    anchor:
      draft.anchor !== null && anchorAllowed(goal, draft.anchor) ? draft.anchor : null,
  }
}

/** Selecting the chosen anchor again clears it; an unoffered one is refused. */
export function withAnchor(
  draft: GenerationDraft,
  anchor: SessionFocus,
): GenerationDraft {
  if (!anchorAllowed(draft.recovery ? 'active_recovery' : null, anchor)) return draft
  return { ...draft, anchor: draft.anchor === anchor ? null : anchor }
}

/**
 * The number the athlete set, held inside the schema's own bounds. The Goal's
 * narrower range is the resolver's to apply, so the number survives a change of
 * Goal instead of being rewritten by it.
 */
export function withIntensity(draft: GenerationDraft, value: number): GenerationDraft {
  const { min, max } = FULL_INTENSITY_RANGE
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
 * The CTA's enabled state: a valid standing Goal and an effective Focus, both
 * as the resolver sees them. The time target opens on 45; the place prefills.
 * Anything else wrong with the draft is a refusal with a sentence, not a
 * disabled button — a control that is disabled for an unexplained reason is the
 * failure mode this avoids.
 */
export function canGenerate(draft: GenerationDraft, context: GenerationContext): boolean {
  return resolveGeneration(draft, context).status === 'ready'
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
 * the row. Goal, focus and intensity are the resolver's and nothing else's, so
 * a draft that resolved to `needs-settings` or `needs-focus` hands the schema
 * the nulls it resolved to. A missing Goal, an unchosen anchor, a blank time
 * target and a note over its ceiling therefore all refuse the same way — with
 * the field path the schema named — and the screen shows that path rather than
 * a sentence of its own invention.
 *
 * `requestId` is the caller's, so the id a screen validated with is the id it
 * can put beside a refusal.
 */
export function requestFrom(
  draft: GenerationDraft,
  context: GenerationContext,
  requestId: string,
  /** OVR-04: whether the user applied the suggested deload. Never inferred. */
  deload = false,
  /** The user's calendar day. The server cannot infer the browser's zone. */
  date = new Date().toISOString().slice(0, 10),
): Result<GenerationRequest, AppError> {
  const resolved = resolveGeneration(draft, context)

  return parseBoundary<GenerationRequest>(
    generationRequestSchema,
    {
      request_id: requestId,
      goal: resolved.goal,
      // `GenerationClient` replaces this from its own local-day clock at send
      // time; carrying it here keeps this preflight on the exact wire schema.
      date,
      focus: resolved.focus,
      requested_intensity: resolved.intensity,
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
  goal: 'Set your goal in Settings.',
  focus: 'Choose an anchor.',
  requested_intensity: 'Set your goal in Settings — it sets the intensity.',
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
    goal: request.goal,
    focus: request.focus,
    requested_intensity: request.requested_intensity,
    requested_duration_mins: request.requested_duration_mins,
    location_id: request.location_id,
    notes: request.notes,
    deload: request.deload,
  }
}
