/**
 * A PostgREST stand-in for REQ-010's `generation_viability`.
 *
 * The honesty note the candidates double carries applies here unchanged: the
 * migration cannot be executed in this suite, so this double holds the
 * evaluation's rules in the one place a test can run them — each CTE of
 * `supabase/migrations/20261001000020_generation_viability.sql` transcribed
 * below under its own name, which
 * `src/test/generation-reliability/viability-evaluation.test.ts` asserts
 * against clause by clause. What a test using it proves is that the evaluation
 * *as written* agrees with candidate retrieval over the seeded library. It does
 * not prove Postgres agrees with the transcription.
 *
 * It is written independently of `candidates-double.ts` and of the matrix
 * builder on purpose: agreement between three transcriptions is the evidence,
 * and a shared helper would make it one.
 */

import { Constants, type FunctionArgs, type FunctionReturns } from '../data/database.types'
import { focusPatternMap, seededCatalog, type SeededExercise } from './seed-catalog'

export type ViabilityArgs = FunctionArgs<'generation_viability'>
export type ViabilityRows = FunctionReturns<'generation_viability'>

export interface ViabilityDoubleOptions {
  readonly url: string
  readonly anonKey: string
  /** Access token → the user id it authenticates. Anything else is anonymous. */
  readonly users: Record<string, string>
  /** Defaults to the committed seed. */
  readonly catalog?: readonly SeededExercise[]
}

export interface ViabilityDouble {
  fetch: typeof globalThis.fetch
  requests(): { method: string; path: string }[]
}

const ENUMS = Constants.public.Enums

/** The focus-exempt roles, verbatim from the function's `judged`. */
const FOCUS_EXEMPT_ROLES = ['conditioning', 'mobility', 'activation', 'cardio', 'stability']

/** `goal_sections`: active recovery overrides the proposed toggles. */
const ACTIVE_RECOVERY_SECTIONS = ['warmup', 'mobility', 'cooldown']

/** `collate "C"`: byte order, which for these ASCII ids is code-unit order. */
const byteOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

const enumOrder = (values: readonly string[]) => (a: string, b: string) =>
  values.indexOf(a) - values.indexOf(b)

/**
 * `generation_viability`, as rows. Pure: the same proposal and catalog answer
 * the same rows in the same order.
 */
export function viabilityRows(
  args: ViabilityArgs,
  catalog: readonly SeededExercise[] = seededCatalog(),
  focusPatterns: ReadonlyMap<string, readonly string[]> = focusPatternMap(),
): ViabilityRows {
  // proposal
  const sections: string[] = [...(args.p_enabled_sections ?? [])]
  const equipment = [...new Set(args.p_available_equipment ?? [])].sort(byteOrder)
  const excludedExercises: readonly string[] = args.p_excluded_exercises ?? []
  const excludedPatterns: readonly string[] = args.p_excluded_patterns ?? []
  const excludedEquipment: readonly string[] = args.p_excluded_equipment ?? []
  // `p_floor integer default 8`; an explicit NULL compares to NULL, which the
  // function coalesces to "not relaxed".
  const floor = args.p_floor === undefined ? 8 : args.p_floor

  // goal_sections
  const goalSections = ENUMS.goal_preset.map((goal) => ({
    goal,
    sections: goal === 'active_recovery' ? [...ACTIVE_RECOVERY_SECTIONS] : sections,
  }))

  // requested
  const requestedSections = [...new Set(goalSections.flatMap((entry) => entry.sections))]

  // judged
  const judge = (section: string, focus: string) => {
    const admitted = focusPatterns.get(focus) ?? []

    return catalog
      .filter((exercise) => exercise.sections.includes(section))
      .map((exercise) => {
        const usable = exercise.equipmentOptions.filter(
          (item) => equipment.includes(item) && !excludedEquipment.includes(item),
        )

        return {
          exercise,
          thematic:
            exercise.movementPatterns.some((pattern) => admitted.includes(pattern)) ||
            FOCUS_EXEMPT_ROLES.includes(exercise.exerciseRole),
          equipped: exercise.equipmentOptions.some((item) => equipment.includes(item)),
          permitted:
            usable.length > 0 &&
            !excludedExercises.includes(exercise.id) &&
            !exercise.movementPatterns.some((pattern) => excludedPatterns.includes(pattern)),
        }
      })
  }

  // counted → served → failing, with `blocking` gathered beside it
  const failing: { section: string; focus: string; failureClass: string }[] = []
  const blocking = new Map<string, Map<string, { scope: string; target: string }>>()

  for (const section of requestedSections) {
    for (const focus of ENUMS.session_focus) {
      const judged = judge(section, focus)
      const strictFound = judged.filter((row) => row.thematic && row.equipped && row.permitted)
      const relaxed = floor !== null && strictFound.length < floor
      const inMode = judged.filter((row) => relaxed || row.thematic)
      const equipped = inMode.filter((row) => row.equipped)

      if (equipped.filter((row) => row.permitted).length > 0) continue

      const failureClass =
        inMode.length === 0
          ? 'catalog_gap'
          : equipped.length === 0
            ? 'missing_equipment'
            : 'athlete_exclusion'
      failing.push({ section, focus, failureClass })

      if (failureClass !== 'athlete_exclusion') continue

      const found = blocking.get(section) ?? new Map<string, { scope: string; target: string }>()
      const add = (scope: string, target: string) => found.set(`${scope}:${target}`, { scope, target })
      for (const { exercise } of equipped) {
        if (excludedExercises.includes(exercise.id)) add('exercise', exercise.id)
        for (const pattern of exercise.movementPatterns) {
          if (excludedPatterns.includes(pattern)) add('movement_pattern', pattern)
        }
        for (const item of exercise.equipmentOptions) {
          if (equipment.includes(item) && excludedEquipment.includes(item)) add('equipment', item)
        }
      }
      blocking.set(section, found)
    }
  }

  // section_failures → reported
  const goalsFor = (included: (sections: readonly string[]) => boolean) =>
    goalSections.filter((entry) => included(entry.sections)).map((entry) => entry.goal)

  const reported: {
    section: string | null
    failure_class: string
    incompatible_choice: unknown
    goals: string[]
    focuses: string[]
  }[] = []

  for (const key of new Set(failing.map((row) => `${row.section}|${row.failureClass}`))) {
    const [section, failureClass] = key.split('|')

    reported.push({
      section,
      failure_class: failureClass,
      incompatible_choice:
        failureClass === 'catalog_gap'
          ? { kind: 'section', section }
          : failureClass === 'missing_equipment'
            ? { kind: 'equipment', equipment }
            : {
                kind: 'exclusion',
                exclusions: [...(blocking.get(section)?.values() ?? [])].sort(
                  (a, b) => byteOrder(a.scope, b.scope) || byteOrder(a.target, b.target),
                ),
              },
      goals: goalsFor((resolved) => resolved.includes(section)),
      focuses: failing
        .filter((row) => row.section === section && row.failureClass === failureClass)
        .map((row) => row.focus)
        .sort(enumOrder(ENUMS.session_focus)),
    })
  }

  const unresolved = goalsFor((resolved) => resolved.length === 0)
  if (unresolved.length > 0) {
    reported.push({
      section: null,
      failure_class: 'no_sections',
      incompatible_choice: { kind: 'sections', sections },
      goals: unresolved,
      focuses: [...ENUMS.session_focus],
    })
  }

  const sectionOrder = enumOrder(ENUMS.section_type)

  return reported
    .sort((a, b) => {
      // `order by rp.section nulls first, rp.failure_class`
      if (a.section === null || b.section === null) {
        return Number(b.section === null) - Number(a.section === null)
      }
      return sectionOrder(a.section, b.section) || byteOrder(a.failure_class, b.failure_class)
    })
    .map((row) => ({
      ...row,
      blocks_proposed_goal: row.goals.includes(args.p_goal),
    })) as unknown as ViabilityRows
}

export function createViabilityDouble(options: ViabilityDoubleOptions): ViabilityDouble {
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

    if (path !== '/rpc/generation_viability' || method !== 'POST') {
      return problem(404, '42883', `no function matches ${path}`)
    }

    // EXECUTE is revoked from `anon` and granted to `authenticated`: a request
    // without a user's token is refused before the function runs.
    const token = headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''
    if (options.users[token] === undefined) {
      return problem(401, '42501', 'permission denied for function generation_viability')
    }

    const args = JSON.parse(String(init?.body ?? '{}')) as ViabilityArgs

    return new Response(JSON.stringify(viabilityRows(args, catalog, focusPatterns)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return {
    fetch: fetchImpl,
    requests: () => [...seen],
  }
}

function problem(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
