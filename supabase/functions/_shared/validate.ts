/**
 * GEN-02c — the deterministic half after the model, part one: validation.
 *
 * `claude.ts` returns a workout the CORE-03 schema accepted. That is a
 * statement about its *shape*; it says nothing about whether the exercises in
 * it were ones this user could have been offered. This module is where that is
 * decided, and the division it keeps is GENERATION_CONTRACT §6's, which is the
 * only division in generation that matters at three in the morning:
 *
 *   * **Hard checks reject.** Every one of them corresponds to something the
 *     database would refuse at the INSERT, and the correspondence is listed
 *     rather than asserted — `HARD_CHECKS` names the constraint per check and
 *     `src/test/generation-validation.test.ts` reads those names back out of
 *     `supabase/migrations/`. A hard check with no matching constraint is a bug
 *     in one of the two, and it now fails a test instead of being a paragraph.
 *   * **Soft checks record.** Ratios, warmup coverage, variety and repetition
 *     are observations with a number attached, returned beside the workout and
 *     logged. Nothing here can turn one into a rejection: `validateComposition`
 *     computes the record *after* it has already decided to return `ok`, which
 *     is a structural answer to "a soft rule that rejects is a hard rule with a
 *     soft name" rather than a promise not to.
 *
 * Checks 4–7 are not re-implemented here and that is the point of listing them:
 * they are `src/state/schemas.ts`'s discriminated target, its distance-unit and
 * load-value refinements and its block clock, which ran before this module was
 * reached. Restating them would put two answers in the codebase and the second
 * one would drift. Check 8 — duration plausibility — is GEN-06's, and it is
 * absent from `HARD_CHECKS` for the same reason a stub would be worse than
 * nothing: an entry listed as enforced that enforces nothing is exactly the
 * defect `HARD_CHECKS` exists to make impossible.
 *
 * Nothing here parses, hydrates or persists. It lives in `_shared/` beside the
 * prompt and the model client because nothing in the browser bundle may reach
 * any of the three, and it is pure — a workout and the prompt input it was
 * composed from in, a verdict out — so every rule is a unit test rather than a
 * deployment.
 */

import type { Candidate, SectionType } from '../../../src/data/candidates.ts'
import type { Enums } from '../../../src/data/database.types.ts'
import type { Logger } from '../../../src/state/logger.ts'
import { err, ok, type Result } from '../../../src/state/errors.ts'
import {
  CONTRACT_VERSION,
  type GenerationOutput,
  type Prescription,
} from '../../../src/state/schemas.ts'
import { GenerationFailure, type AttemptFailure } from './claude.ts'
import type { PromptInput } from './prompt.ts'

type GoalPreset = Enums<'goal_preset'>

// ─────────────────────────────────────────────────────────────────────────────
// The correspondence — §6's hard checks and what the database refuses them with
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One declaration in `20260921000002_workout_domain.sql`, as the migration
 * writes it with its whitespace collapsed. It is the text rather than a
 * constraint name alone because two of the seven correspond to a column
 * declaration — a foreign key and an enum type — which Postgres names
 * implicitly and a test cannot look up by a name nobody wrote down.
 */
export interface DatabaseConstraint {
  readonly table: string
  readonly kind: 'check' | 'foreign_key' | 'column'
  /** Exactly what the table body declares, single-spaced. */
  readonly declaration: string
}

/**
 * How a check relates to its constraint. Two of them are deliberately
 * *stricter* than the database: Postgres can refuse an exercise that is not in
 * the catalog, but it cannot know which forty rows this request retrieved. That
 * is the whole reason check 1 exists, and calling it a mirror would be a lie
 * the table should not tell.
 */
export type CheckCorrespondence = 'mirrors' | 'stricter'

/** Where a check runs before anything reaches an INSERT. */
export type CheckGate = 'schema' | 'validator'

export interface HardCheck {
  /** GENERATION_CONTRACT §6's own numbering, unchanged. */
  readonly number: number
  /** §6's own words for the rule. */
  readonly rule: string
  readonly gate: CheckGate
  readonly correspondence: CheckCorrespondence
  /** The §9 code a failure carries into the retry addendum. */
  readonly failure: AttemptFailure['code']
  /** What the database would refuse the row with. Never empty. */
  readonly constraints: readonly DatabaseConstraint[]
  /** Why these two are the same rule, in one sentence. */
  readonly note: string
}

const WORKOUT_EXERCISES = 'workout_exercises'
const WORKOUT_SECTIONS = 'workout_sections'
const WORKOUT_BLOCKS = 'workout_blocks'

/**
 * §6's table, with the constraint each row corresponds to. Read it as a claim
 * that can be falsified: every declaration below is looked for in the migration
 * by `src/test/generation-validation.test.ts`, and every check whose gate is
 * `schema` is driven through `generationOutputSchema` there with a payload that
 * breaks it. Adding a check without a constraint, or renaming a constraint
 * without touching this list, fails that test rather than this comment.
 */
export const HARD_CHECKS: readonly HardCheck[] = [
  {
    number: 1,
    rule: 'Every exercise_id is in that section\'s candidate set — stricter than "in the library"',
    gate: 'validator',
    correspondence: 'stricter',
    failure: GenerationFailure.INVALID_REFERENCE,
    constraints: [
      {
        table: WORKOUT_EXERCISES,
        kind: 'foreign_key',
        declaration: 'exercise_id text not null references public.exercise_definitions (id)',
      },
    ],
    note:
      'The foreign key refuses an exercise the catalog does not have; only this module knows ' +
      'which of those rows this request actually retrieved for this section.',
  },
  {
    number: 2,
    rule: "Every equipment is in that candidate's usable_equipment",
    gate: 'validator',
    correspondence: 'stricter',
    failure: GenerationFailure.INVALID_REFERENCE,
    constraints: [
      { table: WORKOUT_EXERCISES, kind: 'column', declaration: 'equipment_used text not null' },
      {
        table: WORKOUT_EXERCISES,
        kind: 'check',
        declaration: "constraint workout_exercises_equipment_not_blank check (btrim(equipment_used) <> '')",
      },
    ],
    note:
      'The column refuses a missing or blank value; usable_equipment is the location, the ' +
      "candidate's own options and the user's equipment exclusions already intersected (DATA-05).",
  },
  {
    number: 3,
    rule: 'Every section_type is enabled for the user',
    gate: 'validator',
    correspondence: 'stricter',
    failure: GenerationFailure.INVALID_REFERENCE,
    constraints: [
      {
        table: WORKOUT_SECTIONS,
        kind: 'column',
        declaration: 'section_type public.section_type not null',
      },
    ],
    note:
      'The enum refuses a section that does not exist; which of the ten this profile enabled is ' +
      'a fact about the request, and active recovery overrides it entirely (GEN-02a).',
  },
  {
    number: 4,
    rule: 'Target shape matches target_kind — exactly the right fields populated',
    gate: 'schema',
    correspondence: 'mirrors',
    failure: GenerationFailure.MALFORMED,
    constraints: [
      { table: WORKOUT_EXERCISES, kind: 'check', declaration: 'constraint target_shape check (' },
    ],
    note:
      "CORE-03's discriminated target is this constraint written in zod: {8,10} as a rep range " +
      'and {8,10} as a two-rung ladder cannot be the same payload read two ways.',
  },
  {
    number: 5,
    rule: "distance_unit present when modality = 'distance'",
    gate: 'schema',
    correspondence: 'mirrors',
    failure: GenerationFailure.MALFORMED,
    constraints: [
      {
        table: WORKOUT_EXERCISES,
        kind: 'check',
        declaration: 'constraint distance_has_unit check (',
      },
    ],
    note: '"400" is not a distance. The schema refine and the constraint say the same sentence.',
  },
  {
    number: 6,
    rule: 'Blocks of type emom/amrap/for_time carry timer_seconds; circuit carries rounds',
    gate: 'schema',
    correspondence: 'mirrors',
    failure: GenerationFailure.MALFORMED,
    constraints: [
      {
        table: WORKOUT_BLOCKS,
        kind: 'check',
        declaration: 'constraint timed_structures_have_a_clock check (',
      },
      {
        table: WORKOUT_BLOCKS,
        kind: 'check',
        declaration: 'constraint fixed_round_structures_have_rounds check (',
      },
    ],
    note:
      'Both halves are block-level in the schema and in the table, which is the normalization ' +
      'fix doing its work: members of a circuit cannot disagree about the clock.',
  },
  {
    number: 7,
    rule: 'load_value present unless load_type ∈ {bodyweight, prior_session, none}',
    gate: 'schema',
    correspondence: 'mirrors',
    failure: GenerationFailure.MALFORMED,
    constraints: [
      {
        table: WORKOUT_EXERCISES,
        kind: 'check',
        declaration: 'constraint load_value_matches_type check (',
      },
    ],
    note: 'The three self-describing load types are the same three in both places.',
  },
]

/** The checks this module runs itself, in §6's order. */
export const VALIDATOR_CHECKS = HARD_CHECKS.filter((check) => check.gate === 'validator')

/**
 * §7's duration plausibility, and the one row that is not in `HARD_CHECKS`.
 * GEN-06 owns it — constants, per-structure formula, the retry that names the
 * overrunning block — and `computed_duration_mins` is the column it lands in.
 * Stated here because a reader counting to eight deserves to be told where the
 * eighth went rather than left to conclude it was forgotten.
 */
export const DURATION_CHECK_OWNER = 'GEN-06'

// ─────────────────────────────────────────────────────────────────────────────
// Hard checks 1–3
// ─────────────────────────────────────────────────────────────────────────────

/** Where in the returned object a violation is, in the path a retry is told. */
export interface PrescriptionSite {
  readonly sectionIndex: number
  readonly blockIndex: number
  readonly exerciseIndex: number
  readonly sectionType: SectionType
}

/** One rejection: which check, where, and what to say about it. */
export interface HardViolation {
  readonly check: number
  readonly code: AttemptFailure['code']
  /** `sections[1].blocks[0].exercises[2].exercise_id` — the field, not the payload. */
  readonly path: string
  readonly message: string
}

const sectionPath = (index: number) => `sections[${index}]`

function prescriptionPath(site: PrescriptionSite, field: string): string {
  return (
    `${sectionPath(site.sectionIndex)}.blocks[${site.blockIndex}]` +
    `.exercises[${site.exerciseIndex}].${field}`
  )
}

/**
 * The candidate sets, indexed the way validation asks about them: per section,
 * by id. A section retrieved twice would be a retrieval defect, so the later
 * one does not silently win — `candidateIndex` keeps the first and the sections
 * are what GEN-02a returned, which is one entry per enabled section.
 */
function candidateIndex(
  input: PromptInput,
): ReadonlyMap<SectionType, ReadonlyMap<string, Candidate>> {
  const index = new Map<SectionType, Map<string, Candidate>>()

  for (const section of input.sections) {
    const existing = index.get(section.section) ?? new Map<string, Candidate>()
    for (const candidate of section.candidates) {
      if (!existing.has(candidate.exerciseId)) existing.set(candidate.exerciseId, candidate)
    }
    index.set(section.section, existing)
  }

  return index
}

/**
 * Checks 1–3, over every prescription in the workout. Every violation is
 * collected rather than the first one thrown, because the retry addendum is
 * more use naming three wrong ids than naming one of them three times.
 */
export function checkReferences(
  workout: GenerationOutput,
  input: PromptInput,
): readonly HardViolation[] {
  const violations: HardViolation[] = []
  const index = candidateIndex(input)
  const enabled = new Set(input.request.effectiveSections)

  workout.sections.forEach((section, sectionIndex) => {
    // Check 3. A section nobody enabled has no candidate set, so it is asked
    // first: every id under it would otherwise be reported as unknown, which
    // describes the symptom instead of the cause.
    if (!enabled.has(section.section_type)) {
      violations.push({
        check: 3,
        code: GenerationFailure.INVALID_REFERENCE,
        path: `${sectionPath(sectionIndex)}.section_type`,
        message:
          `'${section.section_type}' is not an enabled section ` +
          `(enabled: ${[...enabled].join(', ')})`,
      })
      return
    }

    const candidates = index.get(section.section_type)

    section.blocks.forEach((block, blockIndex) => {
      block.exercises.forEach((exercise, exerciseIndex) => {
        const site: PrescriptionSite = {
          sectionIndex,
          blockIndex,
          exerciseIndex,
          sectionType: section.section_type,
        }
        const candidate = candidates?.get(exercise.exercise_id)

        // Check 1. "In that section's candidate set", which is stricter than
        // "in the library" on purpose: a mobility drill eligible for the warmup
        // is not thereby eligible for the primary lift.
        if (!candidate) {
          violations.push({
            check: 1,
            code: GenerationFailure.INVALID_REFERENCE,
            path: prescriptionPath(site, 'exercise_id'),
            message:
              `'${exercise.exercise_id}' is not in the ${section.section_type} candidate set`,
          })
          return
        }

        // Check 2. The candidate's own usable equipment, not the catalog's
        // options: the intersection is what the user can actually pick up.
        if (!candidate.usableEquipment.includes(exercise.equipment)) {
          violations.push({
            check: 2,
            code: GenerationFailure.INVALID_REFERENCE,
            path: prescriptionPath(site, 'equipment'),
            message:
              `'${exercise.equipment}' is not usable equipment for ${exercise.exercise_id} ` +
              `(usable: ${candidate.usableEquipment.join(', ')})`,
          })
        }
      })
    })
  })

  return violations
}

// ─────────────────────────────────────────────────────────────────────────────
// Soft observations — recorded, surfaced, never gating
// ─────────────────────────────────────────────────────────────────────────────

/** §6's four soft checks, by the names the record stores them under. */
export const SoftCheck = {
  RATIOS: 'ratios',
  WARMUP_COVERAGE: 'warmup_coverage',
  VARIETY: 'variety',
  REPETITION: 'repetition',
} as const

export type SoftCheck = (typeof SoftCheck)[keyof typeof SoftCheck]

/**
 * `within` and `outside`, never `pass` and `fail`. The vocabulary is part of
 * the requirement: an observation outside its band is a signal about whether
 * the prompt is working, and a word that reads like a verdict is how it starts
 * being treated as one.
 */
export type SoftStatus = 'within' | 'outside'

export interface SoftObservation {
  readonly check: SoftCheck
  readonly status: SoftStatus
  /** One line, meant to be read by a person looking at a log or a session. */
  readonly summary: string
  /** The numbers behind the line, so the record can be aggregated later. */
  readonly metrics: Readonly<Record<string, number>>
  /** What the numbers are about — ids, components, sections. Never the payload. */
  readonly detail: readonly string[]
}

/**
 * The quality record §6 asks to be stored on the session. It is returned from
 * validation rather than written here: where it lands is GEN-02c's persistence
 * half, and contract §12 leaves column-or-table open.
 */
export interface QualityRecord {
  readonly contractVersion: string
  /**
   * Claude's own `estimated_duration_mins`, carried as a diagnostic and nothing
   * else (D5). Nothing in this module reads it, compares it, or branches on it
   * — `src/test/generation-validation.test.ts` proves that by validating the
   * same workout twice with two absurdly different estimates and asserting the
   * verdict and every observation are identical.
   */
  readonly modelEstimateMins: number
  readonly observations: readonly SoftObservation[]
}

/**
 * The goal's dominant section and the share the system prompt gives it —
 * `PROMPT_v4.md` §2's GOAL SHAPES, as numbers. `balanced` has no dominant
 * section and says so ("No section dominates"), which is a ceiling rather than
 * a band; `active_recovery` states no share at all, so there is nothing to
 * observe against and the record says that rather than inventing a band.
 *
 * Total over `goal_preset`, so a sixth goal fails to compile here instead of
 * quietly having no ratio recorded.
 */
const GOAL_SHAPES: Record<
  GoalPreset,
  { readonly dominant: SectionType | null; readonly min: number; readonly max: number } | null
> = {
  strength: { dominant: 'primary_lift', min: 0.4, max: 0.5 },
  hypertrophy: { dominant: 'accessory', min: 0.4, max: 0.5 },
  conditioning: { dominant: 'conditioning', min: 0.5, max: 0.6 },
  // No dominant section: the observation is that nothing took more than half.
  balanced: { dominant: null, min: 0, max: 0.5 },
  active_recovery: null,
}

/** Warmup is expected to cover at least this much of the day's components. */
export const WARMUP_COVERAGE_TARGET = 0.5

/** Above this share of a section's components repeating, variety is noted. */
export const VARIETY_OVERLAP_MAX = 0.5

const round = (value: number) => Math.round(value * 100) / 100

const share = (part: number, whole: number) => (whole === 0 ? 0 : round(part / whole))

interface PrescriptionEntry {
  readonly sectionType: SectionType
  readonly exercise: Prescription
  readonly candidate: Candidate | undefined
}

function entries(
  workout: GenerationOutput,
  index: ReadonlyMap<SectionType, ReadonlyMap<string, Candidate>>,
): readonly PrescriptionEntry[] {
  return workout.sections.flatMap((section) =>
    section.blocks.flatMap((block) =>
      block.exercises.map((exercise) => ({
        sectionType: section.section_type,
        exercise,
        candidate: index.get(section.section_type)?.get(exercise.exercise_id),
      })),
    ),
  )
}

/**
 * Relationship ratios against the goal (§6), measured as each section's share
 * of the prescribed exercises.
 *
 * The count is a proxy for the session's shape and is named as one: the honest
 * denominator is GEN-06's computed duration, which does not exist yet. When it
 * does, this observation's `metrics` gain a second share computed from minutes
 * and the record's shape does not change — which is the reason to record a
 * number rather than a verdict.
 */
function observeRatios(
  goal: GoalPreset,
  prescriptions: readonly PrescriptionEntry[],
): SoftObservation {
  const shape = GOAL_SHAPES[goal]
  const total = prescriptions.length

  const perSection = new Map<SectionType, number>()
  for (const entry of prescriptions) {
    perSection.set(entry.sectionType, (perSection.get(entry.sectionType) ?? 0) + 1)
  }

  const detail = [...perSection.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([section, count]) => `${section}:${share(count, total)}`)

  // Relationship mix travels with the ratios rather than as a fifth check:
  // `anchor_relationship` is the other half of what v4.0 crammed into one
  // field, and reading the two apart is how you tell an accessory that is
  // thematically neutral from one that is not (§5).
  const direct = prescriptions.filter(
    (entry) => entry.exercise.anchor_relationship === 'direct',
  ).length

  if (!shape) {
    return {
      check: SoftCheck.RATIOS,
      status: 'within',
      summary: `${goal} states no section share; recorded without a band`,
      metrics: { exercises: total, directShare: share(direct, total) },
      detail,
    }
  }

  const dominantCount = shape.dominant ? (perSection.get(shape.dominant) ?? 0) : 0
  const largest = Math.max(0, ...perSection.values())
  const observed = shape.dominant ? share(dominantCount, total) : share(largest, total)
  const within = observed >= shape.min && observed <= shape.max

  const subject = shape.dominant ?? 'the largest section'

  return {
    check: SoftCheck.RATIOS,
    status: within ? 'within' : 'outside',
    summary:
      `${subject} is ${observed} of ${total} prescribed exercises ` +
      `(${goal} expects ${shape.min}–${shape.max})`,
    metrics: {
      observed,
      min: shape.min,
      max: shape.max,
      exercises: total,
      directShare: share(direct, total),
    },
    detail,
  }
}

/** The sections whose components the warmup is supposed to have prepared. */
const PREPARED_SECTIONS: readonly SectionType[] = [
  'primary_lift',
  'accessory',
  'skill_power',
  'carries',
  'core',
  'stability_balance',
  'conditioning',
]

/**
 * Warmup component coverage (§6): how much of what the session goes on to do
 * the warmup actually prepared, in `component_movements` — the catalog's own
 * vocabulary, read from the candidate rather than from the model's output,
 * because the model never sees or returns a component.
 */
function observeWarmupCoverage(
  prescriptions: readonly PrescriptionEntry[],
  enabled: ReadonlySet<SectionType>,
): SoftObservation {
  const componentsOf = (sections: readonly SectionType[]) => {
    const set = new Set<string>()
    for (const entry of prescriptions) {
      if (!sections.includes(entry.sectionType)) continue
      for (const component of entry.candidate?.components ?? []) set.add(component)
    }
    return set
  }

  const prepared = componentsOf(['warmup'])
  const worked = componentsOf(PREPARED_SECTIONS)
  const uncovered = [...worked].filter((component) => !prepared.has(component))
  const coverage = worked.size === 0 ? 1 : share(worked.size - uncovered.length, worked.size)

  const composedWarmup = prescriptions.some((entry) => entry.sectionType === 'warmup')
  if (!composedWarmup) {
    return {
      check: SoftCheck.WARMUP_COVERAGE,
      // A warmup the user switched off is not a coverage gap; one that was
      // enabled and then not composed is the observation worth having.
      status: enabled.has('warmup') ? 'outside' : 'within',
      summary: enabled.has('warmup')
        ? 'warmup is enabled and no warmup section was composed'
        : 'warmup is not an enabled section; no coverage expected',
      metrics: { coverage: 0, workedComponents: worked.size },
      detail: [],
    }
  }

  return {
    check: SoftCheck.WARMUP_COVERAGE,
    status: coverage >= WARMUP_COVERAGE_TARGET ? 'within' : 'outside',
    summary:
      `warmup covers ${coverage} of ${worked.size} worked components ` +
      `(target ${WARMUP_COVERAGE_TARGET})`,
    metrics: { coverage, workedComponents: worked.size, uncovered: uncovered.length },
    detail: uncovered.sort(),
  }
}

/**
 * Variety, as §6 defines it: component overlap *within* a section. Two rows and
 * a good-morning in one accessory section are three exercises training one
 * component list, and the number that says so is how many of the section's
 * components appear in more than one of its exercises.
 */
function observeVariety(prescriptions: readonly PrescriptionEntry[]): SoftObservation {
  const overlaps: { section: SectionType; overlap: number; repeated: string[] }[] = []

  const sections = new Set(prescriptions.map((entry) => entry.sectionType))

  for (const section of sections) {
    const counts = new Map<string, number>()
    for (const entry of prescriptions) {
      if (entry.sectionType !== section) continue
      // Per exercise, not per occurrence: a component listed twice by one
      // candidate is the catalog repeating itself, not the section doing so.
      for (const component of new Set(entry.candidate?.components ?? [])) {
        counts.set(component, (counts.get(component) ?? 0) + 1)
      }
    }

    if (counts.size === 0) continue

    const repeated = [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([component]) => component)
      .sort()

    overlaps.push({ section, overlap: share(repeated.length, counts.size), repeated })
  }

  const worst = overlaps.reduce<(typeof overlaps)[number] | null>(
    (highest, entry) => (highest === null || entry.overlap > highest.overlap ? entry : highest),
    null,
  )

  if (!worst) {
    return {
      check: SoftCheck.VARIETY,
      status: 'within',
      summary: 'no candidate components to compare',
      metrics: { overlap: 0, sections: 0 },
      detail: [],
    }
  }

  return {
    check: SoftCheck.VARIETY,
    status: worst.overlap > VARIETY_OVERLAP_MAX ? 'outside' : 'within',
    summary:
      `${worst.section} repeats ${worst.overlap} of its components ` +
      `(noted above ${VARIETY_OVERLAP_MAX})`,
    metrics: { overlap: worst.overlap, sections: overlaps.length },
    detail: worst.repeated.map((component) => `${worst.section}:${component}`),
  }
}

/**
 * Pattern repetition against recent history (§6), plus the one repetition that
 * is visible without any history at all: the same candidate twice in one
 * workout, which the system prompt asks the model to avoid unless the structure
 * requires it. Both are recorded; neither rejects, because "unless the
 * structure requires it" is a judgment and a validator has no business making
 * it.
 */
function observeRepetition(
  workout: GenerationOutput,
  input: PromptInput,
  prescriptions: readonly PrescriptionEntry[],
): SoftObservation {
  const recent = new Set(input.history.exerciseIds)
  const repeatedFromHistory = new Set<string>()
  const seen = new Set<string>()
  const repeatedWithin = new Set<string>()

  for (const entry of prescriptions) {
    const id = entry.exercise.exercise_id
    if (recent.has(id)) repeatedFromHistory.add(id)
    if (seen.has(id)) repeatedWithin.add(id)
    seen.add(id)
  }

  // Patterns the recent history already trained, reached through the candidate
  // rather than the prescription: a movement pattern is a catalog fact.
  const recentPatterns = new Set(input.history.patterns.map((entry) => entry.pattern))
  const repeatedPatterns = new Set<string>()
  for (const entry of prescriptions) {
    for (const pattern of entry.candidate?.patterns ?? []) {
      if (recentPatterns.has(pattern)) repeatedPatterns.add(pattern)
    }
  }

  const total = prescriptions.length
  const repeated = repeatedFromHistory.size + repeatedWithin.size

  return {
    check: SoftCheck.REPETITION,
    status: repeated === 0 ? 'within' : 'outside',
    summary:
      `${repeatedFromHistory.size} of ${total} prescribed exercises were trained recently; ` +
      `${repeatedWithin.size} appear twice in this workout`,
    metrics: {
      fromHistory: repeatedFromHistory.size,
      withinWorkout: repeatedWithin.size,
      recentPatterns: repeatedPatterns.size,
      exercises: total,
      // The denominator's other half: three repeats across two sections and
      // three across six are not the same session.
      sections: workout.sections.length,
    },
    detail: [
      ...[...repeatedFromHistory].sort().map((id) => `history:${id}`),
      ...[...repeatedWithin].sort().map((id) => `workout:${id}`),
      ...[...repeatedPatterns].sort().map((pattern) => `pattern:${pattern}`),
    ],
  }
}

/**
 * The four observations, together. Pure, and deliberately called only after the
 * hard verdict is already `ok`: nothing it returns can change that verdict
 * because the verdict was reached first.
 */
export function observeQuality(workout: GenerationOutput, input: PromptInput): QualityRecord {
  const index = candidateIndex(input)
  const prescriptions = entries(workout, index)
  const enabled = new Set(input.request.effectiveSections)

  return {
    contractVersion: CONTRACT_VERSION,
    modelEstimateMins: workout.estimated_duration_mins,
    observations: [
      observeRatios(input.request.goal, prescriptions),
      observeWarmupCoverage(prescriptions, enabled),
      observeVariety(prescriptions),
      observeRepetition(workout, input, prescriptions),
    ],
  }
}

/**
 * The record as a log line's fields — the surfacing half of "recorded and
 * surfaced". Counts and statuses, never an exercise id the user did not ask to
 * be logged and never the workout itself.
 */
export function qualityFields(record: QualityRecord): Record<string, unknown> {
  return {
    contractVersion: record.contractVersion,
    modelEstimateMins: record.modelEstimateMins,
    ...Object.fromEntries(
      record.observations.map((observation) => [observation.check, observation.status]),
    ),
    noted: record.observations.filter((observation) => observation.status === 'outside').length,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The verdict
// ─────────────────────────────────────────────────────────────────────────────

/** A workout that passed every hard check, and what was observed about it. */
export interface Validated {
  readonly workout: GenerationOutput
  readonly quality: QualityRecord
  /** Every violation, when there were none. Kept so a caller cannot ask twice. */
  readonly violations: readonly HardViolation[]
}

export interface ValidationOptions {
  /** The envelope's per-request logger, where there is one. */
  readonly logger?: Logger
  readonly requestId?: string
}

/** Enough to correct, few enough that the retry addendum stays an addendum. */
const MAX_REPORTED_VIOLATIONS = 10

/**
 * §6, in the order §6 states it: reject, then record.
 *
 * The rejection is one `AttemptFailure`, which is what `claude.ts` already
 * knows how to turn into exactly one corrected retry and then a typed error —
 * so the contract's "reject, retry once, then fail typed" is one retry counter
 * rather than a second one living here.
 */
export function validateComposition(
  workout: GenerationOutput,
  input: PromptInput,
  options: ValidationOptions = {},
): Result<Validated, AttemptFailure> {
  const violations = checkReferences(workout, input)

  if (violations.length > 0) {
    options.logger?.warn('composition rejected', {
      requestId: options.requestId,
      // The checks and how many, never the ids: the detail goes to the model,
      // and a log line is not where a user's session gets narrated.
      checks: [...new Set(violations.map((violation) => violation.check))].sort(),
      violations: violations.length,
    })

    return err({
      code: violations[0].code,
      detail: violations
        .slice(0, MAX_REPORTED_VIOLATIONS)
        .map((violation) => `${violation.path}: ${violation.message}`)
        .join('\n'),
    })
  }

  const quality = observeQuality(workout, input)

  options.logger?.info('composition quality', {
    requestId: options.requestId,
    ...qualityFields(quality),
  })

  return ok({ workout, quality, violations })
}
