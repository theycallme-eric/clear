/**
 * GR-06 / REQ-020 — the fast contract lane, as a function of its inputs.
 *
 * `runLane` takes the committed legal-state matrix and drives candidate
 * retrieval once per state the matrix lists: every goal × focus × tier × saved
 * section profile, and every constrained state. The matrix says what each
 * section of each state should resolve to; retrieval — `candidates-double.ts`,
 * the transcription of `generation_candidates` — says what the seed resolves it
 * to today. A disagreement is a failure naming tier, Goal, Focus and section.
 *
 * The two sides are deliberately read from different places. The expectation is
 * the committed file; the sections asked for and the equipment offered come
 * from the presets handed in, and the rows from the catalog handed in. So a
 * test can hand it a catalog with a tag removed, a preset with a section added
 * or a tier with equipment taken away, and the lane fails the way it would if
 * that change had been committed.
 *
 * Nothing here opens a connection: the double is an in-memory `fetch`, and it
 * is called directly rather than installed globally.
 */
import type { UserConstraintRow } from '../../data/constraints'
import { createCandidatesDouble, type CandidatesDouble } from '../candidates-double'
import type { SeededExercise } from '../seed-catalog'

const BASE_URL = 'https://clear.test'
const ANON_KEY = 'anon'

/** One section of one matrix state: what retrieval is expected to return. */
export interface MatrixSection {
  readonly section: string
  readonly strict: number
  readonly relaxed: number
  readonly floorApplied: boolean
}

export interface MatrixConstraint {
  readonly action: string
  readonly scope: string
  readonly target: string
}

/** A row of the matrix's `states`. */
export interface MatrixState {
  readonly id: string
  readonly goal: string
  readonly focus: string
  readonly tier: string
  readonly profile: string
  readonly customization: { readonly added: readonly string[] } | null
  readonly constraint: MatrixConstraint | null
  readonly sections: readonly MatrixSection[]
  readonly emptySections: readonly string[]
  readonly classification: string
}

/** The parts of `legal-state-matrix.json` the lane reads. */
export interface LaneMatrix {
  readonly floor: number
  readonly states: readonly MatrixState[]
}

export interface LaneInputs {
  readonly catalog: readonly SeededExercise[]
  readonly equipmentByTier: Readonly<Record<string, readonly string[]>>
  readonly sectionsByGoal: Readonly<Record<string, readonly string[]>>
}

/** One per-section comparison the lane made. */
export interface LaneAssertion {
  readonly row: string
  readonly tier: string
  readonly goal: string
  readonly focus: string
  readonly section: string
  readonly candidates: number
}

export interface LaneResult {
  readonly assertions: readonly LaneAssertion[]
  /** One sentence each, naming the combination. Empty when the lane passes. */
  readonly failures: readonly string[]
}

/** A section as `generation_candidate_sets` returns it. */
export interface CandidateSet {
  readonly section: string
  readonly relaxed: boolean
  readonly candidates: readonly {
    readonly exercise_id: string
    readonly movement_patterns: readonly string[]
    readonly usable_equipment: readonly string[]
  }[]
}

/** A saved configuration to retrieve for. */
export interface LaneUser {
  readonly goal: string
  readonly enabledSections: readonly string[]
  readonly equipment: readonly string[]
  readonly constraints?: readonly LaneConstraint[]
}

export interface LaneConstraint {
  readonly scope: string
  readonly target: string
  readonly action?: string
  /** Set for a session-scoped constraint; absent for a persistent one. */
  readonly sessionId?: string
}

/** The combination a failure names. */
export function combination(row: Pick<MatrixState, 'tier' | 'goal' | 'focus'>): string {
  return `tier "${row.tier}" × Goal "${row.goal}" × Focus "${row.focus}"`
}

function constraintRow(userId: string, constraint: LaneConstraint, index: number): UserConstraintRow {
  const target = (scope: string) => (constraint.scope === scope ? constraint.target : null)

  return {
    id: `${userId}#${index}`,
    user_id: userId,
    scope: constraint.scope,
    action: constraint.action ?? 'exclude',
    persistence: constraint.sessionId === undefined ? 'persistent' : 'session',
    applies_to_session_id: constraint.sessionId ?? null,
    target_exercise_id: target('exercise'),
    target_pattern: target('movement_pattern'),
    target_equipment: target('equipment'),
    note: null,
    created_at: '2026-10-01T00:00:00.000Z',
  } as UserConstraintRow
}

/**
 * Retrieval for a set of saved configurations, keyed by a name of the caller's
 * choosing. One double serves them all; each is its own user.
 */
export function createRetrieval(
  users: Readonly<Record<string, LaneUser>>,
  catalog: readonly SeededExercise[],
  floor: number,
): {
  retrieve(user: string, focus: string, sessionId?: string | null): Promise<CandidateSet[]>
  double: CandidatesDouble
} {
  const names = Object.keys(users)
  const double = createCandidatesDouble({
    url: BASE_URL,
    anonKey: ANON_KEY,
    catalog,
    users: Object.fromEntries(names.map((name) => [name, name])),
    profiles: Object.fromEntries(
      names.map((name) => [
        name,
        {
          goalPreset: users[name].goal,
          enabledSections: users[name].enabledSections,
          locations: [{ id: 'location', isDefault: true, equipment: users[name].equipment }],
        },
      ]),
    ),
    constraints: names.flatMap((name) =>
      (users[name].constraints ?? []).map((constraint, index) =>
        constraintRow(name, constraint, index),
      ),
    ),
  })

  return {
    double,
    retrieve: async (user, focus, sessionId = null) => {
      const response = await double.fetch(`${BASE_URL}/rest/v1/rpc/generation_candidate_sets`, {
        method: 'POST',
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${user}` },
        body: JSON.stringify({
          p_user_id: user,
          p_focus: focus,
          p_location_id: null,
          p_session_id: sessionId,
          p_floor: floor,
        }),
      })
      if (!response.ok) throw new Error(`retrieval answered ${response.status} for ${user}`)

      return (await response.json()) as CandidateSet[]
    },
  }
}

/**
 * The sections a state's profile has saved, from the presets as they are now:
 * the Goal's preset plus whatever the profile switched on. A Goal that overrides
 * the profile is resolved by retrieval itself, as it is in the database.
 */
function savedSections(row: MatrixState, inputs: LaneInputs): readonly string[] {
  const preset = inputs.sectionsByGoal[row.goal] ?? []
  const added = (row.customization?.added ?? []).filter((section) => !preset.includes(section))

  return [...preset, ...added]
}

/**
 * Drive retrieval for every state of `matrix` and compare each section.
 */
export async function runLane(matrix: LaneMatrix, inputs: LaneInputs): Promise<LaneResult> {
  const assertions: LaneAssertion[] = []
  const failures: string[] = []

  const retrieval = createRetrieval(
    Object.fromEntries(
      matrix.states.map((row) => [
        row.id,
        {
          goal: row.goal,
          enabledSections: savedSections(row, inputs),
          equipment: inputs.equipmentByTier[row.tier] ?? [],
          constraints:
            row.constraint === null
              ? []
              : [
                  {
                    scope: row.constraint.scope,
                    target: row.constraint.target,
                    action: row.constraint.action,
                  },
                ],
        },
      ]),
    ),
    inputs.catalog,
    matrix.floor,
  )

  for (const row of matrix.states) {
    const sets = await retrieval.retrieve(row.id, row.focus)
    const where = `${combination(row)} [${row.id}]`

    for (const set of sets) {
      const expected = row.sections.find((section) => section.section === set.section)
      const count = set.candidates.length

      if (count === 0 && !row.emptySections.includes(set.section)) {
        failures.push(`${where}: section "${set.section}" resolved no candidates`)
      }
      if (expected === undefined) {
        failures.push(
          `${where}: section "${set.section}" is retrieved and the matrix row has no assertion for it`,
        )
        continue
      }

      const served = expected.floorApplied ? expected.relaxed : expected.strict
      if (count !== served || set.relaxed !== expected.floorApplied) {
        failures.push(
          `${where}: section "${set.section}" resolved ${count} candidates` +
            `${set.relaxed ? ' relaxed' : ''}, the matrix records ${served}` +
            `${expected.floorApplied ? ' relaxed' : ''}`,
        )
      }

      assertions.push({
        row: row.id,
        tier: row.tier,
        goal: row.goal,
        focus: row.focus,
        section: set.section,
        candidates: count,
      })
    }

    for (const expected of row.sections) {
      if (!sets.some((set) => set.section === expected.section)) {
        failures.push(
          `${where}: the matrix asserts section "${expected.section}" and retrieval did not return it`,
        )
      }
    }
  }

  return { assertions, failures }
}

/** What the lane must have asserted, beyond the rows it was handed. */
export interface LaneCoverage {
  readonly tiers: readonly string[]
  readonly goals: readonly string[]
  readonly focuses: readonly string[]
  /** The sections a person can switch on. */
  readonly selectableSections: readonly string[]
  /** Goals whose sections ignore the profile, and the sections they use. */
  readonly goalSectionOverrides: Readonly<Record<string, readonly string[]>>
}

/**
 * Why `result` does not cover `matrix`, one sentence each: a matrix row with a
 * section nothing asserted, or a tier × Goal × Focus × selectable section no
 * unconstrained row reached. Empty when every row has its assertions.
 */
export function unassertedRows(
  matrix: LaneMatrix,
  result: LaneResult,
  coverage: LaneCoverage,
): string[] {
  const problems: string[] = []
  const asserted = new Set(result.assertions.map(({ row, section }) => `${row}|${section}`))

  for (const row of matrix.states) {
    for (const { section } of row.sections) {
      if (!asserted.has(`${row.id}|${section}`)) {
        problems.push(`matrix row ${row.id} has no assertion for section "${section}"`)
      }
    }
  }

  const unconstrained = new Set(matrix.states.filter((row) => row.constraint === null).map((row) => row.id))
  const reached = new Set(
    result.assertions
      .filter(({ row }) => unconstrained.has(row))
      .map(({ tier, goal, focus, section }) => `${tier}|${goal}|${focus}|${section}`),
  )
  for (const tier of coverage.tiers) {
    for (const goal of coverage.goals) {
      for (const focus of coverage.focuses) {
        const sections = coverage.goalSectionOverrides[goal] ?? coverage.selectableSections
        for (const section of sections) {
          if (!reached.has(`${tier}|${goal}|${focus}|${section}`)) {
            problems.push(
              `${combination({ tier, goal, focus })}: section "${section}" has no assertion`,
            )
          }
        }
      }
    }
  }

  return problems
}
