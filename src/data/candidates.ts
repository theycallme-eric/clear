/**
 * GEN-02a — candidate resolution and retrieval, read back.
 *
 * The retrieval itself is SQL and lives in
 * `supabase/migrations/20260921000004_generation_candidates.sql`. This module
 * is the one way `src/` asks for it, and it deliberately decides nothing about
 * eligibility: every predicate — focus→pattern, section, equipment, exclusions
 * — ran in the database before a row reached here. A filter written here would
 * be a second opinion the database never gave, and GEN-02b would then compose
 * from a candidate set nobody can reproduce with a query.
 *
 * What it does own, and the reason it exists at all:
 *
 *   * the domain shape — `Candidate`, `SectionCandidates` — mapped from the
 *     row rather than passed through, so GEN-02b reads names it chose;
 *   * validation of the `jsonb` the set function returns. The candidate list
 *     arrives as JSON, which is `Json` to TypeScript, so it is parsed rather
 *     than asserted (CORE-03 will replace the hand-rolled parse with a schema);
 *   * the typed empty-set failure. A section that resolved to nothing is
 *     `GENERATION_NO_CANDIDATES` — an over-constrained request, reported as one
 *     — and never a section that quietly generates nothing
 *     (GENERATION_CONTRACT §9).
 *
 * No model is called from here, and none can be: the only I/O is one PostgREST
 * RPC through `supabase.ts`.
 */

import {
  ErrorCode,
  createError,
  err,
  ok,
  type AppError,
  type Result,
} from '../state/errors'
import { Constants, type Enums, type FunctionReturns } from './database.types'
import { createSupabaseClient, type SupabaseConfig } from './supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary
// ─────────────────────────────────────────────────────────────────────────────
//
// Generated enums again (DATA-03), so the vocabulary cannot drift from the
// database's own.

/** `session_focus`. What the day is about, before any pattern is resolved. */
export type SessionFocus = Enums<'session_focus'>
export const SESSION_FOCUSES = [
  'upper_body',
  'lower_body',
  'full_body',
  'power',
] as const satisfies readonly SessionFocus[]

/** `section_type`. The ten the live catalog already tags against. */
export type SectionType = Enums<'section_type'>

/** `movement_pattern`, derived per exercise by the catalog's views. */
export type MovementPattern = Enums<'movement_pattern'>

/** `exercise_role`. Five of the seven are focus-exempt in §3's query. */
export type ExerciseRole = Enums<'exercise_role'>

/** `muscle_role`. Carried through to the prompt as coverage, not as a filter. */
export type MuscleRole = Enums<'muscle_role'>

/** The sections active recovery resolves to, whatever the toggles say. */
export const ACTIVE_RECOVERY_SECTIONS = [
  'warmup',
  'mobility',
  'cooldown',
] as const satisfies readonly SectionType[]

/**
 * GENERATION_CONTRACT §3's suggested per-section floor. Below it, the pattern
 * predicate is relaxed for that section and the relaxation is recorded. §12
 * calls 8 a guess to be tuned against the real library, which is why it is a
 * default a caller may override rather than a constant in the SQL.
 */
export const CANDIDATE_FLOOR = 8

// ─────────────────────────────────────────────────────────────────────────────
// Domain
// ─────────────────────────────────────────────────────────────────────────────

/** One muscle this exercise trains, and in what role. */
export interface CandidateMuscle {
  readonly muscle: string
  readonly role: MuscleRole
}

/**
 * One eligible exercise, as composition needs it. No coaching cues and no
 * regression: those are facts hydrated by id after validation (§8), and a model
 * reproducing them is how facts drift.
 */
export interface Candidate {
  readonly exerciseId: string
  readonly name: string
  readonly patterns: readonly MovementPattern[]
  /** The authored ranking, where one exists. Often empty, never wrong. */
  readonly primaryPatterns: readonly MovementPattern[]
  readonly role: ExerciseRole
  readonly components: readonly string[]
  readonly muscles: readonly CandidateMuscle[]
  readonly canBePrimary: boolean
  /**
   * The equipment this exercise may actually be performed with here: its own
   * options, intersected with the resolved location, minus the user's equipment
   * exclusions. Never empty — an exercise with nothing usable is not eligible.
   */
  readonly usableEquipment: readonly string[]
}

/** One section's candidates, and whether the floor forced a relaxation. */
export interface SectionCandidates {
  readonly section: SectionType
  /**
   * True when this section came in under the floor and was retrieved again
   * without the focus→pattern predicate. A diagnostic, not a defect: it is how
   * a thin library shows up instead of silently widening (§3).
   */
  readonly relaxed: boolean
  readonly candidates: readonly Candidate[]
}

/** What a retrieval is asked for. Everything else is resolved in SQL. */
export interface CandidateRequest {
  readonly userId: string
  readonly focus: SessionFocus
  /** Omitted means the user's default location (DATA-01b §4). */
  readonly locationId?: string | null
  /** The session a session-scoped constraint may belong to, if there is one. */
  readonly sessionId?: string | null
  /** Defaults to `CANDIDATE_FLOOR`. */
  readonly floor?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapping
// ─────────────────────────────────────────────────────────────────────────────

type CandidateSetRow = FunctionReturns<'generation_candidate_sets'>[number]

/**
 * One row of the set function → the domain. The `candidates` column is `jsonb`,
 * so it is `Json` here: validated shape by shape, and the first row that does
 * not match the schema's own output is a typed read failure rather than a cast
 * nobody checked.
 */
export function sectionFromRow(row: CandidateSetRow): Result<SectionCandidates> {
  if (!Array.isArray(row.candidates)) {
    return err(malformed({ section: row.section, candidates: typeof row.candidates }))
  }

  const candidates: Candidate[] = []
  for (const entry of row.candidates) {
    const candidate = candidateFromJson(entry)
    if (!candidate.ok) return candidate
    candidates.push(candidate.value)
  }

  return ok({ section: row.section, relaxed: row.relaxed, candidates })
}

function candidateFromJson(value: unknown): Result<Candidate> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return err(malformed({ candidate: typeof value }))
  }

  const row = value as Record<string, unknown>
  const {
    exercise_id: exerciseId,
    name,
    exercise_role: role,
    can_be_primary: canBePrimary,
  } = row

  if (
    typeof exerciseId !== 'string' ||
    typeof name !== 'string' ||
    typeof canBePrimary !== 'boolean' ||
    !isOneOf(role, Constants.public.Enums.exercise_role)
  ) {
    return err(malformed({ candidate: exerciseId }))
  }

  const patterns = enumArray(row.movement_patterns, Constants.public.Enums.movement_pattern)
  const primaryPatterns = enumArray(
    row.primary_patterns,
    Constants.public.Enums.movement_pattern,
  )
  const components = stringArray(row.component_movements)
  const usableEquipment = stringArray(row.usable_equipment)
  const muscles = muscleArray(row.muscles)

  if (
    patterns === null ||
    primaryPatterns === null ||
    components === null ||
    usableEquipment === null ||
    muscles === null
  ) {
    return err(malformed({ candidate: exerciseId }))
  }

  // The query's own `cardinality(...) > 0` makes this unreachable from this
  // schema. It is checked because the type promises it to GEN-02b: a candidate
  // carrying no usable equipment would be one Claude could select and nobody
  // could perform.
  if (usableEquipment.length === 0) {
    return err(malformed({ candidate: exerciseId, usableEquipment: 0 }))
  }

  return ok({
    exerciseId,
    name,
    patterns,
    primaryPatterns,
    role,
    components,
    muscles,
    canBePrimary,
    usableEquipment,
  })
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null

  return value.every((entry) => typeof entry === 'string') ? (value as string[]) : null
}

/** A text array whose every member is a value of that enum, or nothing. */
function enumArray<T extends string>(value: unknown, allowed: readonly T[]): T[] | null {
  const strings = stringArray(value)
  if (strings === null) return null

  return strings.every((entry) => isOneOf(entry, allowed)) ? (strings as T[]) : null
}

function muscleArray(value: unknown): CandidateMuscle[] | null {
  if (!Array.isArray(value)) return null

  const muscles: CandidateMuscle[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return null
    const { muscle, role } = entry as Record<string, unknown>
    if (typeof muscle !== 'string' || !isOneOf(role, Constants.public.Enums.muscle_role)) {
      return null
    }
    muscles.push({ muscle, role })
  }

  return muscles
}

function malformed(details: Record<string, unknown>): AppError {
  return createError(ErrorCode.PERSISTENCE_READ_FAILED, { details })
}

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

/** The shared client's configuration; this module adds nothing to it. */
export type CandidatesClientConfig = SupabaseConfig

export interface CandidatesClient {
  /**
   * Every resolved section's candidates, in the order the sections are
   * generated. One RPC, no model call.
   *
   * Fails with `GENERATION_NO_CANDIDATES` when the request resolves to no
   * sections at all, or when any resolved section is empty after the floor has
   * been applied — both are over-constrained input, and both are worth saying
   * out loud rather than composing around.
   */
  retrieve(request: CandidateRequest): Promise<Result<SectionCandidates[]>>
}

const CANDIDATE_SETS_RPC = 'generation_candidate_sets'

export function createCandidatesClient(config: CandidatesClientConfig): CandidatesClient {
  const db = createSupabaseClient(config)

  return {
    async retrieve(request) {
      const result = await db.rpc(CANDIDATE_SETS_RPC, {
        p_user_id: request.userId,
        p_focus: request.focus,
        p_location_id: request.locationId ?? null,
        p_session_id: request.sessionId ?? null,
        p_floor: request.floor ?? CANDIDATE_FLOOR,
      })

      if (!result.ok) return result

      const sections: SectionCandidates[] = []
      for (const row of result.value) {
        const section = sectionFromRow(row)
        if (!section.ok) return section
        sections.push(section.value)
      }

      const empty = sections
        .filter((section) => section.candidates.length === 0)
        .map((section) => section.section)

      if (sections.length === 0 || empty.length > 0) {
        return err(
          createError(ErrorCode.GENERATION_NO_CANDIDATES, {
            details: {
              focus: request.focus,
              // Named, because "which section" is the whole of what a user has
              // to change to make the request answerable.
              sections: sections.length === 0 ? 'none resolved' : empty,
            },
          }),
        )
      }

      return ok(sections)
    },
  }
}
