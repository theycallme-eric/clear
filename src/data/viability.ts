/**
 * REQ-010 — the save-time viability evaluation, read back.
 *
 * The evaluation itself is SQL and lives in
 * `supabase/migrations/20261001000021_generation_viability.sql`. This module is
 * the one way `src/` asks for it, and — as `candidates.ts` does for retrieval —
 * it decides nothing about eligibility: which sections fail, why, and which
 * choice is to blame were all answered in the database, by the predicates
 * candidate retrieval itself runs.
 *
 * What it owns:
 *
 *   * the domain shape — `Viability`, `ViabilityFailure`, `IncompatibleChoice`
 *     — mapped from the row rather than passed through;
 *   * validation of the `jsonb` and `text` the function returns. The failure
 *     class is `text` and the incompatible choice is `jsonb`, so both are parsed
 *     rather than asserted, and a row that matches neither is a typed read
 *     failure;
 *   * the one place the generated types are wrong about a row: `section` is
 *     NULL for `no_sections`, and `RETURNS TABLE` columns are generated
 *     non-null.
 *
 * Nothing is saved and no model is called. REQ-011 adds the other direction:
 * `complete_onboarding` asks the same function inside its transaction and
 * refuses with the failing rows, and "A refused save" below reads those back
 * through the same mapping.
 */

import {
  ErrorCode,
  createError,
  err,
  ok,
  type AppError,
  type Result,
} from '../state/errors.ts'
import { CANDIDATE_FLOOR, type MovementPattern, type SectionType, type SessionFocus } from './candidates.ts'
import { Constants, type Enums, type FunctionReturns } from './database.types.ts'
import { createSupabaseClient, type SupabaseConfig } from './supabase.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary
// ─────────────────────────────────────────────────────────────────────────────

export type GoalPreset = Enums<'goal_preset'>
export type ExclusionScope = Enums<'constraint_scope'>

/**
 * Why a section cannot be generated. The function returns `text`; these are the
 * four values its SQL writes.
 */
export const VIABILITY_FAILURE_CLASSES = [
  'catalog_gap',
  'missing_equipment',
  'athlete_exclusion',
  'no_sections',
] as const
export type ViabilityFailureClass = (typeof VIABILITY_FAILURE_CLASSES)[number]

// ─────────────────────────────────────────────────────────────────────────────
// Domain
// ─────────────────────────────────────────────────────────────────────────────

/** One proposed `exclude` constraint, by the scope it filters on. */
export interface ProposedExclusion {
  readonly scope: ExclusionScope
  readonly target: string
}

/** The choice a failure is attributed to — what the user would have to change. */
export type IncompatibleChoice =
  /** The catalog has nothing for this section. */
  | { readonly kind: 'section'; readonly section: SectionType }
  /** Nothing in the section can be performed with this equipment. */
  | { readonly kind: 'equipment'; readonly equipment: readonly string[] }
  /** These exclusions removed everything the equipment could have performed. */
  | { readonly kind: 'exclusion'; readonly exclusions: readonly ProposedExclusion[] }
  /** The section toggles resolve to no sections at all. */
  | { readonly kind: 'sections'; readonly sections: readonly SectionType[] }

export interface ViabilityFailure {
  /** `null` only for `no_sections`, where no single section is at fault. */
  readonly section: SectionType | null
  readonly failureClass: ViabilityFailureClass
  readonly incompatibleChoice: IncompatibleChoice
  /** The goals selectable on Generate whose requests this fails. */
  readonly goals: readonly GoalPreset[]
  readonly focuses: readonly SessionFocus[]
  /** Whether the proposed goal is one of `goals`. */
  readonly blocksProposedGoal: boolean
}

export type Viability =
  | { readonly viable: true }
  | { readonly viable: false; readonly failures: readonly ViabilityFailure[] }

/** A configuration that has not been saved yet. */
export interface ViabilityProposal {
  readonly goal: GoalPreset
  readonly enabledSections: readonly SectionType[]
  /** The equipment of the one location being evaluated. */
  readonly equipment: readonly string[]
  /** Only `exclude` filters retrieval; `avoid` and `prefer_not` are not passed. */
  readonly exclusions?: readonly ProposedExclusion[]
  /** Defaults to `CANDIDATE_FLOOR`, as retrieval's does. */
  readonly floor?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapping
// ─────────────────────────────────────────────────────────────────────────────

type ViabilityRow = FunctionReturns<'generation_viability'>[number]

const ENUMS = Constants.public.Enums

export function failureFromRow(row: ViabilityRow): Result<ViabilityFailure> {
  // Generated as non-null; NULL for `no_sections`.
  const section: unknown = row.section

  if (!isOneOf(row.failure_class, VIABILITY_FAILURE_CLASSES)) {
    return err(malformed({ failureClass: row.failure_class }))
  }
  if (section !== null && !isOneOf(section, ENUMS.section_type)) {
    return err(malformed({ section }))
  }
  if ((section === null) !== (row.failure_class === 'no_sections')) {
    return err(malformed({ section, failureClass: row.failure_class }))
  }

  const incompatibleChoice = choiceFromJson(row.incompatible_choice)
  if (incompatibleChoice === null) {
    return err(malformed({ section, incompatibleChoice: typeof row.incompatible_choice }))
  }

  return ok({
    section,
    failureClass: row.failure_class,
    incompatibleChoice,
    goals: row.goals,
    focuses: row.focuses,
    blocksProposedGoal: row.blocks_proposed_goal,
  })
}

function choiceFromJson(value: unknown): IncompatibleChoice | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null

  const choice = value as Record<string, unknown>

  switch (choice.kind) {
    case 'section':
      return isOneOf(choice.section, ENUMS.section_type)
        ? { kind: 'section', section: choice.section }
        : null
    case 'equipment': {
      const equipment = stringArray(choice.equipment)
      return equipment === null ? null : { kind: 'equipment', equipment }
    }
    case 'sections': {
      const sections = stringArray(choice.sections)
      return sections !== null && sections.every((entry) => isOneOf(entry, ENUMS.section_type))
        ? { kind: 'sections', sections: sections as SectionType[] }
        : null
    }
    case 'exclusion': {
      if (!Array.isArray(choice.exclusions)) return null

      const exclusions: ProposedExclusion[] = []
      for (const entry of choice.exclusions) {
        if (typeof entry !== 'object' || entry === null) return null
        const { scope, target } = entry as Record<string, unknown>
        if (!isOneOf(scope, ENUMS.constraint_scope) || typeof target !== 'string') return null
        exclusions.push({ scope, target })
      }

      return { kind: 'exclusion', exclusions }
    }
    default:
      return null
  }
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null

  return value.every((entry) => typeof entry === 'string') ? (value as string[]) : null
}

function malformed(details: Record<string, unknown>): AppError {
  return createError(ErrorCode.PERSISTENCE_READ_FAILED, { details })
}

// ─────────────────────────────────────────────────────────────────────────────
// A refused save
// ─────────────────────────────────────────────────────────────────────────────

/**
 * REQ-011. The SQLSTATE `complete_onboarding` raises when the answers fail the
 * evaluation (`supabase/migrations/20261002000022_onboarding_viability.sql`).
 * Its DETAIL is the failing rows as JSON, in the function's own column names.
 */
export const NOT_VIABLE_PG_CODE = 'CLR11'

/**
 * The failures a refused save names, from the transport error it arrived as —
 * or `null` when the error is not that refusal, or its detail is not rows this
 * module can read. Null rather than an empty list: a refusal that names nothing
 * is not one a screen can present as a choice to correct.
 */
export function failuresFromRefusal(error: AppError): readonly ViabilityFailure[] | null {
  if (error.details?.pgCode !== NOT_VIABLE_PG_CODE) return null
  if (typeof error.details.pgDetails !== 'string') return null

  let rows: unknown
  try {
    rows = JSON.parse(error.details.pgDetails)
  } catch {
    return null
  }
  if (!Array.isArray(rows) || rows.length === 0) return null

  const failures: ViabilityFailure[] = []
  for (const row of rows as unknown[]) {
    if (typeof row !== 'object' || row === null) return null

    const { goals, focuses, blocks_proposed_goal: blocks } = row as Record<string, unknown>
    const goalList = stringArray(goals)
    const focusList = stringArray(focuses)
    if (
      goalList === null ||
      focusList === null ||
      typeof blocks !== 'boolean' ||
      !goalList.every((goal) => isOneOf(goal, ENUMS.goal_preset)) ||
      !focusList.every((focus) => isOneOf(focus, ENUMS.session_focus))
    ) {
      return null
    }

    const failure = failureFromRow(row as ViabilityRow)
    if (!failure.ok) return null
    failures.push(failure.value)
  }

  return failures
}

/**
 * The typed refusal a save answers with. A validation failure, because that is
 * what it is to the person: an answer they gave that has to change. The
 * failures ride in `details`, as `noCandidatesError`'s do, and `message` is the
 * sentence the caller built from them.
 */
export function notViableError(
  failures: readonly ViabilityFailure[],
  message: string,
): AppError {
  return createError(ErrorCode.VALIDATION_CONSTRAINT, {
    message,
    details: { pgCode: NOT_VIABLE_PG_CODE, viability: failures },
  })
}

/** The failures a refused save carries, or none if the error is not one. */
export function viabilityFailuresOf(error: AppError): readonly ViabilityFailure[] {
  const failures = error.details?.viability

  return error.code === ErrorCode.VALIDATION_CONSTRAINT && Array.isArray(failures)
    ? (failures as ViabilityFailure[])
    : []
}

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

export type ViabilityClientConfig = SupabaseConfig

export interface ViabilityClient {
  /**
   * Whether candidate retrieval is already known to be unable to generate for
   * this proposal, at this location, for any goal and focus Generate offers.
   * One RPC, no model call, nothing written.
   */
  evaluate(proposal: ViabilityProposal): Promise<Result<Viability>>
}

const VIABILITY_RPC = 'generation_viability'

export function createViabilityClient(config: ViabilityClientConfig): ViabilityClient {
  const db = createSupabaseClient(config)

  return {
    async evaluate(proposal) {
      const targets = (scope: ExclusionScope) =>
        (proposal.exclusions ?? [])
          .filter((exclusion) => exclusion.scope === scope)
          .map((exclusion) => exclusion.target)

      const result = await db.rpc(VIABILITY_RPC, {
        p_goal: proposal.goal,
        p_enabled_sections: [...proposal.enabledSections],
        p_available_equipment: [...proposal.equipment],
        p_excluded_exercises: targets('exercise'),
        // A pattern the enum does not have is refused by Postgres, not here.
        p_excluded_patterns: targets('movement_pattern') as MovementPattern[],
        p_excluded_equipment: targets('equipment'),
        p_floor: proposal.floor ?? CANDIDATE_FLOOR,
      })

      if (!result.ok) return result

      const failures: ViabilityFailure[] = []
      for (const row of result.value) {
        const failure = failureFromRow(row)
        if (!failure.ok) return failure
        failures.push(failure.value)
      }

      return ok(failures.length === 0 ? { viable: true } : { viable: false, failures })
    },
  }
}
