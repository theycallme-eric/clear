/**
 * A PostgREST stand-in for GEN-02a's `generation_candidate_sets`.
 *
 * The same honesty note the constraints double carries applies here, and it is
 * worth repeating rather than cross-referencing. The migration cannot be
 * executed in this suite: the off-machine-backup gate in
 * `docs/backend/live-inventory.md` holds any push to the reused project until
 * TASK-072, and ENV-04 keeps Docker out of the loop, so there is no Postgres to
 * round-trip against. The behavioural proof against a real database is ENV-07's
 * continuous job.
 *
 * So this double holds the retrieval's rules in the one place a test can
 * execute them — each predicate transcribed from
 * `supabase/migrations/20260921000004_generation_candidates.sql`, which
 * `src/test/generation-candidates-migration.test.ts` asserts against clause by
 * clause. What a test using it proves is that the *seeded library* answers the
 * requirement — every goal preset resolves to candidates, active recovery
 * resolves to three sections, an excluded piece of equipment narrows a
 * candidate rather than removing it — and that `src/data/candidates.ts` speaks
 * PostgREST and maps the payload without loss. It does not prove Postgres
 * agrees with the transcription, and nothing here should be read as claiming
 * that.
 *
 * Row-level security is modelled too, because it changes the answer: every
 * table the retrieval reads below the catalog is owner-only, so a caller asking
 * about somebody else's user id resolves to no sections at all.
 */

import type { UserConstraintRow } from '../data/constraints'
import { seededCatalog, focusPatternMap, type SeededExercise } from './seed-catalog'

/** A location and what it holds, in place of `locations`/`location_equipment`. */
export interface DoubleLocation {
  readonly id: string
  readonly isDefault?: boolean
  readonly equipment: readonly string[]
}

export interface DoubleProfile {
  /** `null` is a profile that has not answered onboarding. */
  readonly goalPreset: string | null
  readonly enabledSections: readonly string[]
  readonly locations?: readonly DoubleLocation[]
}

export interface CandidatesDoubleOptions {
  readonly url: string
  readonly anonKey: string
  /** Access token → the user id it authenticates. */
  readonly users: Record<string, string>
  /** User id → profile. A user with no entry has no profile row. */
  readonly profiles: Record<string, DoubleProfile>
  readonly constraints?: readonly UserConstraintRow[]
  /** Defaults to the committed seed; a test may narrow it to prove a floor. */
  readonly catalog?: readonly SeededExercise[]
}

export interface CandidatesDouble {
  fetch: typeof globalThis.fetch
  /** Every request the double answered, in order. */
  requests(): { method: string; path: string }[]
}

/** §3's focus-exempt roles, verbatim. */
const FOCUS_EXEMPT_ROLES = ['conditioning', 'mobility', 'activation', 'cardio', 'stability']

/** §1 of the migration: active recovery overrides the section toggles. */
const ACTIVE_RECOVERY_SECTIONS = ['warmup', 'mobility', 'cooldown']

export function createCandidatesDouble(
  options: CandidatesDoubleOptions,
): CandidatesDouble {
  const base = new URL(`${options.url.replace(/\/+$/, '')}/rest/v1`)
  const catalog = options.catalog ?? seededCatalog()
  const focusPatterns = focusPatternMap()
  const seen: { method: string; path: string }[] = []

  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : String(input))
    const method = init?.method ?? 'GET'
    const path = url.pathname.slice(base.pathname.length)

    seen.push({ method, path })

    const headers = new Headers(init?.headers)
    if (headers.get('apikey') !== options.anonKey) {
      return problem(401, '42501', 'invalid api key')
    }

    const token = headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''
    const caller = options.users[token]
    if (caller === undefined) return problem(401, '42501', 'invalid claim')

    if (path !== '/rpc/generation_candidate_sets' || method !== 'POST') {
      return problem(404, '42883', `no function matches ${path}`)
    }

    const args = JSON.parse(String(init?.body ?? '{}')) as {
      p_user_id: string
      p_focus: string
      p_location_id: string | null
      p_session_id: string | null
      p_floor: number
    }

    return json(candidateSets(caller, args))
  }

  /** `constraints_in_force`, transcribed from DATA-05 §4. */
  const inForce = (caller: string, userId: string, sessionId: string | null) =>
    (options.constraints ?? []).filter(
      (row) =>
        // Owner-only RLS: the invoker sees their own rows and nobody else's.
        row.user_id === caller &&
        row.user_id === userId &&
        (row.persistence === 'persistent' || row.applies_to_session_id === sessionId),
    )

  /** `generation_sections`. */
  const sectionsFor = (caller: string, userId: string): string[] => {
    const profile = caller === userId ? options.profiles[userId] : undefined
    if (profile === undefined) return []

    return profile.goalPreset === 'active_recovery'
      ? [...ACTIVE_RECOVERY_SECTIONS]
      : [...profile.enabledSections]
  }

  /** `generation_equipment`. */
  const equipmentFor = (
    caller: string,
    userId: string,
    locationId: string | null,
  ): string[] => {
    const locations = (caller === userId ? options.profiles[userId]?.locations : undefined) ?? []
    const location =
      locationId === null
        ? locations.find((candidate) => candidate.isDefault === true)
        : locations.find((candidate) => candidate.id === locationId)

    return [...new Set(location?.equipment ?? [])].sort()
  }

  /** `generation_candidates`, one section. */
  const candidatesFor = (
    caller: string,
    args: { p_user_id: string; p_focus: string; p_session_id: string | null },
    section: string,
    available: readonly string[],
    relax: boolean,
  ) => {
    const constraints = inForce(caller, args.p_user_id, args.p_session_id).filter(
      (row) => row.action === 'exclude',
    )
    // The table's CHECKs make the target of a scope non-null, so the filter is
    // reading the column the scope names and not guessing which one is set.
    const targets = (scope: string, column: keyof typeof constraints[number]) =>
      new Set(
        constraints
          .filter((row) => row.scope === scope)
          .map((row) => String(row[column])),
      )

    const excludedExercises = targets('exercise', 'target_exercise_id')
    const excludedPatterns = targets('movement_pattern', 'target_pattern')
    const excludedEquipment = targets('equipment', 'target_equipment')
    const admitted = focusPatterns.get(args.p_focus) ?? []

    return catalog
      .map((exercise) => ({
        exercise,
        // `usable_equipment`, DATA-05 §4: a narrowing, not a rejection.
        usable: exercise.equipmentOptions
          .filter(
            (item) => available.includes(item) && !excludedEquipment.has(item),
          )
          .sort(),
      }))
      .filter(
        ({ exercise, usable }) =>
          (relax ||
            exercise.movementPatterns.some((pattern) => admitted.includes(pattern)) ||
            FOCUS_EXEMPT_ROLES.includes(exercise.exerciseRole)) &&
          exercise.sections.includes(section) &&
          exercise.equipmentOptions.some((item) => available.includes(item)) &&
          usable.length > 0 &&
          !excludedExercises.has(exercise.id) &&
          !exercise.movementPatterns.some((pattern) => excludedPatterns.has(pattern)),
      )
      .sort(
        (a, b) =>
          Number(b.exercise.canBePrimary) - Number(a.exercise.canBePrimary) ||
          a.exercise.id.localeCompare(b.exercise.id),
      )
      .map(({ exercise, usable }) => ({
        exercise_id: exercise.id,
        name: exercise.name,
        movement_patterns: exercise.movementPatterns,
        primary_patterns: exercise.primaryPatterns,
        exercise_role: exercise.exerciseRole,
        component_movements: exercise.componentMovements,
        muscles: exercise.muscles,
        can_be_primary: exercise.canBePrimary,
        usable_equipment: usable,
      }))
  }

  /** `generation_candidate_sets`: sections resolved, floor applied per section. */
  const candidateSets = (
    caller: string,
    args: {
      p_user_id: string
      p_focus: string
      p_location_id: string | null
      p_session_id: string | null
      p_floor: number
    },
  ) => {
    const available = equipmentFor(caller, args.p_user_id, args.p_location_id)

    return sectionsFor(caller, args.p_user_id).map((section) => {
      const strict = candidatesFor(caller, args, section, available, false)
      const relaxed = strict.length < args.p_floor

      return {
        section,
        relaxed,
        candidates: relaxed
          ? candidatesFor(caller, args, section, available, true)
          : strict,
      }
    })
  }

  return {
    fetch: fetchImpl,
    requests: () => [...seen],
  }
}

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function problem(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
