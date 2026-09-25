/**
 * GEN-02b — the composition prompt, assembled. `PROMPT_v4.md` version `5.0.0`.
 *
 * This module is pure: candidates and an effective request in, two strings and
 * a measurement out. It opens no connection, reads no environment, and calls no
 * model — `claude.ts` beside it does that — which is what makes every clause of
 * the prompt a unit test rather than something you can only observe by spending
 * tokens on it.
 *
 * Three things it deliberately does *not* put in the prompt, each because
 * something else already owns it:
 *
 *   * **the exercise library.** GEN-02a resolved eligibility in SQL, so the
 *     prompt carries the candidate set and nothing else. Claude cannot select
 *     an ineligible exercise because it never sees one — structurally, rather
 *     than because a sentence told it not to (GENERATION_CONTRACT §2).
 *   * **rules already enforced upstream.** Equipment availability, enabled
 *     sections, exclusions and the focus→pattern map are `WHERE` clauses. A
 *     rule a query enforces cannot be forgotten by a model, and restating it
 *     costs input tokens to say something twice.
 *   * **facts.** No names, no equipment display strings, no coaching cues, no
 *     regressions. Those are hydrated by id after validation (§8); a model
 *     reproducing a fact it cannot verify is how facts drift.
 *
 * It lives beside the envelope rather than under `src/` for the same reason the
 * envelope does: nothing in the browser bundle may reach a prompt or the client
 * that sends it. It is still ordinary TypeScript with no runtime global in it,
 * so Vitest drives it directly from `src/test/generation-prompt.test.ts`.
 */

import { Constants, type Enums } from '../../../src/data/database.types.ts'
import {
  ACTIVE_RECOVERY_SECTIONS,
  type Candidate,
  type SectionCandidates,
  type SectionType,
  type SessionFocus,
} from '../../../src/data/candidates.ts'
import type { UserConstraint } from '../../../src/data/constraints.ts'
import { ANCHOR_RELATIONSHIPS, CONTRACT_VERSION, SESSION_FUNCTIONS } from '../../../src/state/schemas.ts'
import {
  DELOAD_CONDITIONING_INTENSITY_MAX,
  DELOAD_MIN_SETS,
  DELOAD_RPE_CAP,
  DELOAD_SET_FACTOR,
  type AnchoredExercise,
  type SessionDirective,
  type TrainingHistory,
} from './training-history.ts'

/**
 * `PROMPT_v4.md`'s own version, and it is 5 rather than 4.1 on purpose:
 * removing the library dump and moving eligibility into code is a major prompt
 * change. It is stamped on every session beside `CONTRACT_VERSION`, which moves
 * independently because the two change for different reasons (§10).
 *
 * 5.1.0 is OVR-02: the TRAINING HISTORY block, the directive handling it carries
 * and the instruction never to compute a load. A minor bump rather than a major
 * one because nothing was removed and no output field moved — `CONTRACT_VERSION`
 * is untouched, which is the requirement's own condition for leaving it alone.
 */
export const PROMPT_VERSION = '5.1.0'

export { CONTRACT_VERSION }

type GoalPreset = Enums<'goal_preset'>

// ─────────────────────────────────────────────────────────────────────────────
// The effective request
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Active recovery's ceiling. The system prompt states the clamp as an
 * accomplished fact — *"Intensity is already clamped to 1–3"* — so it has to be
 * true before the prompt is assembled and not checked afterwards. A prompt that
 * says the number is clamped while carrying an unclamped one is worse than no
 * clamp at all: it is a false premise the model will compose against.
 */
export const ACTIVE_RECOVERY_INTENSITY_MAX = 3

/** The goal whose intensity and section set the generator fixes. */
const ACTIVE_RECOVERY: GoalPreset = 'active_recovery'

/**
 * The intensity the session is actually composed at. Only active recovery
 * clamps here, because it is the only goal `PROMPT_v4.md` gives a range to —
 * the per-goal slider cascade is GEN-04's, and inventing the other four ranges
 * in this module would put two different answers in the codebase.
 */
export function effectiveIntensity(goal: GoalPreset, requested: number): number {
  return goal === ACTIVE_RECOVERY
    ? Math.min(requested, ACTIVE_RECOVERY_INTENSITY_MAX)
    : requested
}

/**
 * The sections the prompt announces. Active recovery's are fixed at
 * warmup/mobility/cooldown by `generation_candidates` whatever the profile
 * stores (GEN-02a), so announcing the profile's list would describe a candidate
 * set the caller was never given.
 */
export function effectiveSections(
  goal: GoalPreset,
  enabled: readonly SectionType[],
): readonly SectionType[] {
  return goal === ACTIVE_RECOVERY ? ACTIVE_RECOVERY_SECTIONS : enabled
}

/** What the caller asked for, before any clamp has been applied. */
export interface RequestedSession {
  readonly requestId: string
  readonly goal: GoalPreset
  /** Null is a legitimate answer: a session with no focus of the day. */
  readonly focus: SessionFocus | null
  readonly requestedIntensity: number
  readonly durationTargetMins: number
  readonly enabledSections: readonly SectionType[]
}

/**
 * The request as composed against — §1's "effective request". It keeps both
 * intensities rather than overwriting one, because the prompt states both and
 * a session that was clamped should say so rather than look like a request
 * nobody made.
 */
export interface EffectiveRequest extends RequestedSession {
  readonly effectiveIntensity: number
  readonly effectiveSections: readonly SectionType[]
}

export function resolveEffectiveRequest(requested: RequestedSession): EffectiveRequest {
  return {
    ...requested,
    effectiveIntensity: effectiveIntensity(requested.goal, requested.requestedIntensity),
    effectiveSections: effectiveSections(requested.goal, requested.enabledSections),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// History and soft preferences
// ─────────────────────────────────────────────────────────────────────────────

/** One movement pattern and how often it has been trained lately. */
export interface PatternFrequency {
  readonly pattern: Enums<'movement_pattern'>
  readonly count: number
}

/**
 * §3's "compact pattern-frequency and recent-ID summary". Every part of it is
 * optional in the sense that it can be empty — a first session has no history,
 * and the prompt says `none` rather than printing three empty headings.
 */
export interface RecentHistory {
  /** Most recent first, the way the summary reads. */
  readonly focuses: readonly SessionFocus[]
  readonly patterns: readonly PatternFrequency[]
  readonly exerciseIds: readonly string[]
}

/**
 * The soft half of DATA-05, and the free text from the request. Neither
 * filters anything: eligibility already ran, so these can only reorder valid
 * options, never make a workout unsafe (GENERATION_CONTRACT §3).
 */
export interface SoftPreferences {
  /** `avoid` and `prefer_not` — `deprioritized(...)` in `constraint-selectors`. */
  readonly constraints: readonly UserConstraint[]
  /** The request's own notes. Context for composition, never a constraint. */
  readonly notes: string | null
}

/** Everything the user message is assembled from. */
export interface PromptInput {
  readonly request: EffectiveRequest
  readonly sections: readonly SectionCandidates[]
  readonly history: RecentHistory
  readonly preferences: SoftPreferences
  /**
   * OVR-02's block: the anchored exercises, the session directive and the
   * conditioning trend. Required rather than optional, and required even when
   * there are no anchors at all — a first session has an empty block and a
   * `normal` directive, which is a fact worth stating, where a missing field is
   * a caller that forgot. `buildTrainingHistory(...)` produces it.
   */
  readonly training: TrainingHistory
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `PROMPT_v4.md` §2, verbatim. The spec is the source and this is a copy of it,
 * which is a duplication worth naming: `src/test/generation-prompt.test.ts`
 * reads the fenced block out of the markdown and compares the two byte for
 * byte, so the copy cannot drift — editing the prompt means editing the spec.
 */
export const SYSTEM_PROMPT = `You compose personalized workouts for CLEAR from a pre-resolved candidate set.

Return one JSON object matching the supplied schema and no other text. Select only exercise_id
values present in the candidate group for that section. Select equipment only from that
candidate's usable_equipment. Return structure and prescription fields only; do not return exercise
names, equipment display strings, coaching cues, regressions, or factual catalog content.

PRIORITY
1. Safety and the supplied hard boundary
2. Explicit user notes and exclusions represented in the input
3. Goal shape and requested duration
4. Intensity scaling and focus relevance
5. Variety and recent-history balance

GOAL SHAPES
- strength: warmup → primary_lift → accessory → core → cooldown. Give primary work 40–50% of
  the session. No conditioning. Primary rest 120–180s; accessory rest 90–120s. Prefer lower reps,
  more primary sets, and controlled eccentric / forceful concentric tempo.
- hypertrophy: warmup → primary_lift → accessory → core → cooldown. Give accessory work 40–50%.
  Supersets are the default accessory structure when candidates pair cleanly. Primary rest about
  90s; accessory 45–75s; core 45–60s. Prefer 8–12 reps and controlled 3–4s eccentrics.
- conditioning: warmup → conditioning → core → cooldown; accessory is optional only when time
  remains. Give conditioning 50–60%, potentially across multiple blocks. No primary_lift. Prefer
  circuit, emom, amrap, or for_time; keep transitions practical and inter-block rest 60–90s.
- balanced: warmup → primary_lift → accessory → core → conditioning → cooldown. No section
  dominates. Use strength-style primary rest, moderate accessory rest, and conditioning structures.
- active_recovery: warmup → mobility → cooldown only. Intensity is already clamped to 1–3.
  Choose gentle, non-loaded, non-explosive movement and make the sections one continuous flow.

STRUCTURES
- standard: independent sets; normal for warmup, primary, accessory, core, and cooldown.
- superset: exactly two compatible movements back-to-back, with shared rest after both. Prefer
  antagonist or non-competing pairs. Avoid pairs competing for the same stabilizers or requiring
  awkward equipment changes.
- circuit: at least three movements, fixed rounds, shared rest after a round. Arrange smooth
  transitions; keep repeated equipment adjacent and avoid repeated floor/standing changes.
- emom: one movement per minute or two alternating movements; never cram three into a minute.
- amrap: two to four movements per round.
- for_time: fixed work with a timer cap.

REP AND SET GUIDANCE
- Standard reps by intensity: 1–2 → 10–15 light; 3–4 → 8–12; 5–7 → 6–10;
  8–10 → 3–6 heavy.
- Conditioning reps by intensity: 1–2 → 5–8 per round; 3–4 → 6–10; 5–7 → 8–12;
  8–10 → 10–15, adjusted down when work is technically demanding.
- Primary sets: intensity 1–3 → 3; 4–6 → 4; 7–8 → 4–5; 9–10 → 5–6.
- Accessory sets: intensity 1–3 → 2; 4–8 → 3; 9–10 → 3–4.
- Core sets: 2 at low intensity, 2–3 at moderate intensity, 3 at high intensity.
- Sequence targets are allowed for ladders/pyramids; represent them with target_kind=sequence and
  target_sequence. A range uses target_kind=range. Rounds always belong to the block.

LOAD GUIDANCE
- 1–2: bodyweight or very light, roughly 0–40% when percent guidance is appropriate.
- 3–4: light, roughly 40–60%.
- 5–6: moderate, roughly 60–70%.
- 7–8: challenging, roughly 70–80%.
- 9–10: heavy, roughly 80–90%+, only where the goal and candidate role support it.
Use only the contract's load_type/load_value representation. Never invent a prior-session number.
Never compute, state or narrate a weight, anywhere, including section_notes, block_notes, tempo and
the overview. The app fills every suggested load after generation from the user's own logged history;
a number you write conflicts with the one it computes, and the user is left reading two answers for
the same set.

TRAINING HISTORY AND DIRECTIVES
The user message carries a TRAINING HISTORY block: one line per exercise the user has recent capacity
for, with its confidence, how long since it was trained, and a label. It carries labels and never
loads, because the loads are filled afterwards by code.
- SESSION DIRECTIVE normal: compose as the goal shape asks.
- SESSION DIRECTIVE deload: the same movements rather than novelty. Apply the stated working-set
  multiplier, hold rep targets where they are, keep conditioning at or below the stated intensity, and
  state the RPE ceiling in section_notes.
- SESSION DIRECTIVE re_entry: one fewer working set on every exercise the block notes as re-entry,
  conservative cues, and the exercise's RPE ceiling stated in section_notes.
- CONDITIONING TREND ready: add a round, add reps per round, or shorten a time cap by about 10%.
  hold: keep the density where it was. backing_off: drop a round or lengthen the cap by about 15%.
An exercise noted stalled may be swapped for a close variation, which is often the right answer to a
plateau. An exercise noted progressing under a hypertrophy goal is better kept in the same rep band,
so there is something for added reps to progress against. Both are preferences; goal shape and
thematic coherence still win.

SECTION COMPOSITION
- Warmup progresses general movement → dynamic range → activation → specific movement prep.
  Cover the day's focus components. At intensity 1–3 omit loaded movement prep; at 7–10 include
  a specific preparation candidate when available.
- Primary chooses one \`can_be_primary\` compound candidate relevant to the focus. Equipment quality
  may break ties, but availability is already resolved.
- Accessory supports the primary or fills a meaningful pattern gap. Avoid redundant candidates
  that duplicate the same components without purpose.
- Core uses two or three complementary candidates; superset only when transitions are simple.
- Conditioning uses two to four movements per block with sustainable flow and no needless setup.
- Cooldown uses three to five recovery candidates relevant to the work just performed.

HISTORY AND VARIETY
Balance movement patterns across recent sessions within the chosen focus. Prefer an eligible pattern
that has been underrepresented; do not force novelty at the cost of fit. Avoid repeating the exact
same candidate in one workout unless the structure explicitly requires it. Treat avoid/prefer-not
entries as soft ranking signals, never as permission to violate the hard candidate boundary.

DURATION
Compose to the effective duration target. Protect the goal's dominant section; shorten or remove
lower-priority work first. Your estimated_duration_mins is diagnostic only. Independent code will
compute plausibility and may retry with a named overrunning block.

Before returning, verify internally that every ID and equipment value came from the correct section,
section order matches the goal shape, target fields match target_kind, timed structures have clocks,
circuits have rounds, and the JSON matches the schema. Return JSON only.`

// ─────────────────────────────────────────────────────────────────────────────
// Output contract
// ─────────────────────────────────────────────────────────────────────────────

const enums = Constants.public.Enums

/** `a|b|c`, from the generated enum rather than a list typed out again here. */
const alternatives = (values: readonly string[]) => values.join('|')

/**
 * GENERATION_CONTRACT §5, with every enumeration read from the generated types.
 * The vocabulary Claude is offered is therefore the database's own: a value
 * added to a Postgres enum reaches the prompt with no edit here, and a value
 * that never existed cannot be offered by a list nobody kept in step.
 *
 * It is prose around a shape rather than JSON Schema on purpose — the schema's
 * own conditional rules (a target's fields, a timed block's clock) are what
 * CORE-03 rejects on, and spelling them out as `oneOf` branches would cost
 * several hundred tokens to say something the validator says anyway.
 */
export const OUTPUT_CONTRACT = `Return exactly this JSON object. Every key is present on every
object; a key with no value is null.

{
  "title": "string",
  "overview": "string | null",
  "sections": [{
    "section_type": "${alternatives(enums.section_type)} — only an enabled section",
    "section_title": "string",
    "section_notes": "string | null",
    "blocks": [{
      "structure_type": "${alternatives(enums.structure_type)}",
      "rounds": "int > 0 | null — required for circuit, null when open-ended",
      "timer_type": "${alternatives(enums.timer_contract)}",
      "timer_seconds": "int > 0 | null — required for emom, amrap, for_time",
      "round_rest_seconds": "int >= 0 | null — shared rest, counted once per round",
      "rep_scheme": "${alternatives(enums.rep_scheme)}",
      "block_notes": "string | null",
      "exercises": [{
        "exercise_id": "an id from this section's candidate group",
        "equipment": "a value from that candidate's usable_equipment",
        "session_function": "${alternatives(SESSION_FUNCTIONS)}",
        "anchor_relationship": "${alternatives(ANCHOR_RELATIONSHIPS)}",
        "modality": "${alternatives(enums.prescription_modality)} — never rounds",
        "sets": "int > 0 | null — null inside an open-ended block",
        "target_kind": "${alternatives(enums.target_kind)}",
        "target_value": "int > 0 when target_kind is fixed, else null",
        "target_min": "int > 0 when target_kind is range, else null",
        "target_max": "int > target_min when target_kind is range, else null",
        "target_sequence": "[int > 0, …] of two or more when target_kind is sequence, else null",
        "per_side": "boolean",
        "distance_unit": "${alternatives(enums.distance_unit)} | null — required when modality is distance",
        "rest_seconds": "int >= 0 | null",
        "tempo": "string | null",
        "load_type": "${alternatives(enums.load_guidance)}",
        "load_value": "number | null — required unless load_type is bodyweight, prior_session or none",
        "is_interval_exercise": "boolean"
      }]
    }]
  }],
  "estimated_duration_mins": "int > 0 — diagnostic only, never authoritative"
}`

// ─────────────────────────────────────────────────────────────────────────────
// Candidate serialization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sections in the database enum's order — which is the arc's order, warmup
 * first and cooldown last — and candidates by id within each. §3 asks for a
 * deterministic serializer so recordings can be diffed and prompt-size
 * comparisons mean something; a retrieval that returns its rows in a different
 * order on a different day must not produce a different prompt.
 */
const SECTION_ORDER: readonly SectionType[] = enums.section_type

function bySectionOrder(a: SectionCandidates, b: SectionCandidates): number {
  return SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section)
}

/** Code-unit order, so the same input sorts the same way in every locale. */
function byExerciseId(a: Candidate, b: Candidate): number {
  return a.exerciseId < b.exerciseId ? -1 : a.exerciseId > b.exerciseId ? 1 : 0
}

const list = (values: readonly string[]) => `[${values.join(',')}]`

/**
 * One candidate, one line, in GENERATION_CONTRACT §4's shape. What is here is
 * §1's list exactly — id, patterns, role, components, muscles, usable equipment
 * and `can_be_primary` where relevant.
 *
 * What is *not* here is the candidate's name. It is the field the old prompt
 * spent the most bytes on and the one Claude is forbidden to return, because
 * hydration fills it in by id afterwards. An empty field is omitted rather than
 * printed as `[]`: the absence is the same information for a third of the cost.
 */
export function serializeCandidate(candidate: Candidate): string {
  const parts = [candidate.exerciseId]

  if (candidate.patterns.length > 0) parts.push(`patterns:${list(candidate.patterns)}`)
  parts.push(`role:${candidate.role}`)
  if (candidate.components.length > 0) parts.push(`components:${list(candidate.components)}`)
  if (candidate.muscles.length > 0) {
    parts.push(
      `muscles:${list(candidate.muscles.map((muscle) => `${muscle.muscle}:${muscle.role}`))}`,
    )
  }
  parts.push(`equipment:${list(candidate.usableEquipment)}`)
  if (candidate.canBePrimary) parts.push('can_be_primary')

  return `  ${parts.join(' | ')}`
}

/** One section's heading and its candidates, sorted. */
function serializeSection(section: SectionCandidates): string {
  const lines = [...section.candidates].sort(byExerciseId).map(serializeCandidate)

  // The relaxation is stated rather than hidden: the model is being shown a set
  // that reached past the day's focus to make the floor, and that is a fact
  // about the candidates it is choosing from (§3).
  const heading = section.relaxed
    ? `CANDIDATES — ${section.section} (pattern predicate relaxed to reach the floor)`
    : `CANDIDATES — ${section.section}`

  return [heading, ...lines].join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// User message
// ─────────────────────────────────────────────────────────────────────────────

const NONE = 'none'

function serializeRequest(request: EffectiveRequest): string {
  return [
    'REQUEST',
    `request_id: ${request.requestId}`,
    `goal: ${request.goal}`,
    `focus: ${request.focus ?? NONE}`,
    `requested_intensity: ${request.requestedIntensity}`,
    `effective_intensity: ${request.effectiveIntensity}`,
    `effective_duration_target_mins: ${request.durationTargetMins}`,
    `enabled_sections: ${list(request.effectiveSections)}`,
  ].join('\n')
}

function serializeHistory(history: RecentHistory): string {
  const lines: string[] = []

  if (history.focuses.length > 0) lines.push(`recent_focuses: ${history.focuses.join(', ')}`)
  if (history.patterns.length > 0) {
    lines.push(
      `patterns: ${history.patterns
        .map((entry) => `${entry.pattern}(${entry.count})`)
        .join(' ')}`,
    )
  }
  if (history.exerciseIds.length > 0) {
    lines.push(`recent_exercise_ids: ${history.exerciseIds.join(', ')}`)
  }

  return ['RECENT HISTORY', ...(lines.length > 0 ? lines : [NONE])].join('\n')
}

/**
 * §"Generation Impact"'s heading, and the sentence that makes the decision on
 * open question 6 visible to the thing the decision is about: labels only, and
 * the loads are the app's.
 */
const TRAINING_HISTORY_HEADING =
  'TRAINING HISTORY (labels and confidence only — the app fills every load after generation)'

/** The columns, named once so the rows below need no keys of their own. */
const TRAINING_HISTORY_COLUMNS = 'exercise_id | equipment | confidence | sessions | last trained | note'

/** `4d ago`, and `today` for a session logged the same day. */
function lastTrained(days: number): string {
  return days === 0 ? 'today' : `${days}d ago`
}

/**
 * One anchored exercise. Unpadded, because column alignment is whitespace the
 * request pays for per generation and the header already names the fields.
 */
function serializeAnchor(anchor: AnchoredExercise): string {
  return [
    anchor.exerciseId,
    anchor.equipment,
    anchor.confidence,
    `${anchor.sessionCount}`,
    lastTrained(anchor.daysSinceLastSession),
    anchor.note ?? '',
  ].join(' | ')
}

/**
 * What the directive asks for, as numbers rather than as an adjective.
 *
 * §4's "reduced by ~40%" is a multiplier here for the same reason the anchor
 * itself is withheld: arithmetic is code's. A model told to reduce sets "by about
 * 40%" rounds in whichever direction suits the session it already meant to
 * write; a model told to multiply by 0.6 and floor at 2 has been given the answer
 * and only has to apply it.
 */
function directiveRules(directive: SessionDirective): readonly string[] {
  switch (directive) {
    case 'deload':
      return [
        `working sets × ${DELOAD_SET_FACTOR} rounded down, never below ${DELOAD_MIN_SETS}`,
        'rep targets unchanged',
        `conditioning at intensity ${DELOAD_CONDITIONING_INTENSITY_MAX} or lower`,
        `state the RPE ${DELOAD_RPE_CAP} ceiling in section_notes`,
      ]
    case 're_entry':
      return [
        'one fewer working set on every exercise noted re-entry',
        'conservative coaching cues',
        'state that exercise’s RPE ceiling in section_notes',
      ]
    case 'normal':
      return []
  }
}

/**
 * §"Generation Impact"'s block: the anchored exercises, then the two directive
 * lines. The directive and the trend are printed whether or not there are
 * anchors — a first session composes under `normal` and `hold`, and saying so is
 * cheaper than leaving the model to infer which it is.
 */
function serializeTrainingHistory(training: TrainingHistory): string {
  const rows =
    training.anchors.length > 0
      ? [TRAINING_HISTORY_COLUMNS, ...training.anchors.map(serializeAnchor)]
      : [NONE]

  const rules = directiveRules(training.directive)

  return [
    TRAINING_HISTORY_HEADING,
    ...rows,
    `SESSION DIRECTIVE: ${training.directive}`,
    ...(rules.length > 0 ? [`DIRECTIVE RULES: ${rules.join(' · ')}`] : []),
    `CONDITIONING TREND: ${training.conditioningTrend}`,
  ].join('\n')
}

/** A constraint's target, in the one line the prompt gives it. */
function serializeTarget(constraint: UserConstraint): string {
  const { target } = constraint

  switch (target.scope) {
    case 'exercise':
      return `exercise:${target.exerciseId}`
    case 'movement_pattern':
      return `movement_pattern:${target.pattern}`
    case 'equipment':
      return `equipment:${target.equipmentId}`
  }
}

function serializePreferences(preferences: SoftPreferences): string {
  const lines = preferences.constraints.map(
    (constraint) => `${constraint.action}: ${serializeTarget(constraint)}`,
  )

  // Notes travel verbatim and quoted. There is no parse anywhere in this
  // codebase that turns prose into a constraint — a deterministic exclusion is
  // a `user_constraints` row (DATA_MODEL §5) — so the quotes are the whole of
  // what marks it as the user's words rather than an instruction.
  const notes = preferences.notes?.trim()
  if (notes) lines.push(`notes: "${notes}"`)

  return ['SOFT PREFERENCES', ...(lines.length > 0 ? lines : [NONE])].join('\n')
}

/**
 * §3's assembly, in §3's order: request, history, training history, preferences,
 * candidates by section, output contract. The order is stable so two recordings
 * of the same request differ only where the request did.
 *
 * TRAINING HISTORY sits directly after RECENT HISTORY because the two answer the
 * same question at different resolutions — what has been trained, and what the
 * training produced — and because everything below it is either a preference or a
 * set to choose from. It is above the candidates for the reason §"Prompt changes
 * required" gives: the directive changes how the candidates are used, so it has
 * to be read before them.
 */
export function buildUserMessage(input: PromptInput): string {
  return [
    serializeRequest(input.request),
    serializeHistory(input.history),
    serializeTrainingHistory(input.training),
    serializePreferences(input.preferences),
    ...[...input.sections].sort(bySectionOrder).map(serializeSection),
    ['OUTPUT CONTRACT', OUTPUT_CONTRACT].join('\n'),
  ].join('\n\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry addendum
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §4. The original prompt is reused and only the typed failure is appended —
 * there is no "fix this field" request and no partial object handed back,
 * because a model asked to patch what it already got wrong returns the same
 * shape with a different defect in it.
 */
export function withRetryCorrection(userMessage: string, failure: RetryFailure): string {
  const detail = failure.detail?.trim()

  return [
    userMessage,
    [
      'RETRY CORRECTION',
      `The prior response failed: ${failure.code}.`,
      ...(detail ? [detail] : []),
      'Return a complete corrected JSON object. Do not explain the correction.',
    ].join('\n'),
  ].join('\n\n')
}

/**
 * The failure a retry is told about: the contract's §9 code, and the specific
 * invalid id, field or overrunning block where there is one. Nothing else — a
 * stack trace or a raw response would be the model's own mistake read back to
 * it as instruction.
 */
export interface RetryFailure {
  readonly code: string
  readonly detail?: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Measurement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §5's record: which prompt composed a session, which contract its output is
 * parsed against, and how large the prompt actually was. Bytes rather than an
 * estimated token count, because bytes are a fact this process can measure and
 * tokens are the API's answer — which `claude.ts` records separately, from the
 * response, rather than guessing here.
 */
export interface PromptMeasurement {
  readonly promptVersion: string
  readonly contractVersion: string
  readonly systemBytes: number
  readonly userBytes: number
  readonly totalBytes: number
  readonly sectionCount: number
  readonly candidateCount: number
  /** How many anchored exercises the TRAINING HISTORY block carried (OVR-02). */
  readonly anchoredExerciseCount: number
  /** Which directive the session was composed under, recorded beside the version. */
  readonly sessionDirective: SessionDirective
}

const encoder = new TextEncoder()

export const byteLength = (value: string): number => encoder.encode(value).length

export function measurePrompt(
  userMessage: string,
  input: Pick<PromptInput, 'sections' | 'training'>,
  systemPrompt: string = SYSTEM_PROMPT,
): PromptMeasurement {
  const systemBytes = byteLength(systemPrompt)
  const userBytes = byteLength(userMessage)
  const { sections, training } = input

  return {
    promptVersion: PROMPT_VERSION,
    contractVersion: CONTRACT_VERSION,
    systemBytes,
    userBytes,
    totalBytes: systemBytes + userBytes,
    sectionCount: sections.length,
    candidateCount: sections.reduce((total, section) => total + section.candidates.length, 0),
    anchoredExerciseCount: training.anchors.length,
    sessionDirective: training.directive,
  }
}

/** The assembled prompt, and what it measured. */
export interface AssembledPrompt {
  readonly system: string
  readonly user: string
  readonly measurement: PromptMeasurement
}

export function assemblePrompt(input: PromptInput): AssembledPrompt {
  const user = buildUserMessage(input)

  return {
    system: SYSTEM_PROMPT,
    user,
    measurement: measurePrompt(user, input),
  }
}
