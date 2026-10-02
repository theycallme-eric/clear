/**
 * REQ-010 — the save-time viability evaluation.
 *
 * `supabase/migrations/20261001000021_generation_viability.sql` adds one
 * function that answers, for a proposed Goal, enabled sections, exclusions and
 * location equipment, whether candidate retrieval is already known to be unable
 * to generate. This suite holds it to four things:
 *
 *   * for every row of the legal-state matrix, its answer is the outcome of
 *     candidate retrieval for the same inputs;
 *   * a not-viable answer names each failing section, its class, and the
 *     incompatible choice;
 *   * it is invoker-rights on a pinned search_path, and not callable
 *     anonymously;
 *   * the generated types carry it with no drift.
 *
 * The limit every migration test here states applies: no SQL is executed. The
 * evaluation runs through `src/test/viability-double.ts`, a transcription of
 * the function, and retrieval through `src/test/candidates-double.ts`, a
 * separate transcription of `generation_candidates`; the matrix builder is a
 * third. The first block below holds the function's text to the retrieval
 * function's, clause by clause, so the SQL and what the doubles agree on are
 * the same rules.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { TYPES_PATH, build } from '../../../scripts/gen-types/gen-types.mjs'
import { REPO_ROOT, migrationFiles, readSchema } from '../../../scripts/gen-types/schema.mjs'
import { buildMatrix } from '../../../scripts/generation-reliability/matrix.mjs'
import { loadRetrievalRules } from '../../../scripts/generation-reliability/rules.mjs'
import { CANDIDATE_FLOOR } from '../../data/candidates'
import type { UserConstraintRow } from '../../data/constraints'
import { Constants } from '../../data/database.types'
import {
  VIABILITY_FAILURE_CLASSES,
  createViabilityClient,
  failureFromRow,
} from '../../data/viability'
import { ErrorCode } from '../../state/errors'
import { GENERATION_GOALS } from '../../state/generation-form'
import { EQUIPMENT, EQUIPMENT_BY_TIER, SECTIONS_BY_GOAL } from '../../state/onboarding'
import { createCandidatesDouble } from '../candidates-double'
import { focusPatternMap, seededCatalog } from '../seed-catalog'
import { createViabilityDouble, viabilityRows, type ViabilityArgs } from '../viability-double'

const MIGRATION = '20261001000021_generation_viability.sql'
const CANDIDATES_MIGRATION = '20260921000005_generation_candidates.sql'
const GOAL_SCOPE_MIGRATION = '20260927000018_generation_goal_scope.sql'

const read = (file: string) => readFileSync(join(REPO_ROOT, 'supabase/migrations', file), 'utf8')

/** SQL with comments removed and whitespace collapsed. */
const statementsOf = (file: string) =>
  read(file)
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .replace(/\s+/g, ' ')

const statements = statementsOf(MIGRATION)
const declaration = statements.slice(
  statements.indexOf('create or replace function public.generation_viability('),
  statements.indexOf('$$;'),
)

const ENUMS = Constants.public.Enums
const rules = loadRetrievalRules()
const catalog = seededCatalog()
const focusPatterns = focusPatternMap()

const matrix = buildMatrix({
  rules,
  catalog,
  equipmentByTier: EQUIPMENT_BY_TIER,
  sectionsByGoal: SECTIONS_BY_GOAL,
  equipment: EQUIPMENT.map((item) => item.value),
})

type State = (typeof matrix.states)[number]
type Constraint = { scope: string; target: string } | null

/** The proposal a matrix row describes, as the function's arguments. */
function proposal(
  goal: string,
  sections: readonly string[],
  tier: string,
  constraint: Constraint,
): ViabilityArgs {
  const targets = (scope: string) =>
    constraint !== null && constraint.scope === scope ? [constraint.target] : []

  return {
    p_goal: goal,
    p_enabled_sections: [...sections],
    p_available_equipment: [...EQUIPMENT_BY_TIER[tier as keyof typeof EQUIPMENT_BY_TIER]],
    p_excluded_exercises: targets('exercise'),
    p_excluded_patterns: targets('movement_pattern'),
    p_excluded_equipment: targets('equipment'),
    p_floor: matrix.floor,
  } as ViabilityArgs
}

const evaluate = (args: ViabilityArgs) => viabilityRows(args, catalog, focusPatterns)

/** The sections the evaluation fails for one goal and focus, in section order. */
const failingFor = (rows: ReturnType<typeof evaluate>, goal: string, focus: string) =>
  rows
    .filter(
      (row) =>
        (row.goals as string[]).includes(goal) && (row.focuses as string[]).includes(focus),
    )
    .map((row) => row.section as string | null)

/** The sections a matrix row saves: its own, or a preset where the goal overrides them. */
const savedSections = (state: State) =>
  rules.goalSectionOverrides[state.goal] === undefined
    ? state.sections.map((section) => section.section)
    : [...SECTIONS_BY_GOAL.strength]

/** Candidate retrieval for a matrix row, through the retrieval double. */
async function retrievedEmptySections(state: State): Promise<string[]> {
  const constraints: UserConstraintRow[] =
    state.constraint === null
      ? []
      : [
          {
            id: 'constraint',
            user_id: 'user',
            scope: state.constraint.scope,
            action: 'exclude',
            persistence: 'persistent',
            applies_to_session_id: null,
            target_exercise_id:
              state.constraint.scope === 'exercise' ? state.constraint.target : null,
            target_pattern:
              state.constraint.scope === 'movement_pattern' ? state.constraint.target : null,
            target_equipment:
              state.constraint.scope === 'equipment' ? state.constraint.target : null,
            note: null,
            created_at: '2026-10-01T00:00:00Z',
          } as UserConstraintRow,
        ]

  const double = createCandidatesDouble({
    url: 'https://clear.test',
    anonKey: 'anon',
    users: { token: 'user' },
    catalog,
    constraints,
    profiles: {
      user: {
        goalPreset: state.goal,
        enabledSections: savedSections(state),
        locations: [
          {
            id: 'location',
            isDefault: true,
            equipment: EQUIPMENT_BY_TIER[state.tier as keyof typeof EQUIPMENT_BY_TIER],
          },
        ],
      },
    },
  })

  const response = await double.fetch('https://clear.test/rest/v1/rpc/generation_candidate_sets', {
    method: 'POST',
    headers: { apikey: 'anon', Authorization: 'Bearer token' },
    body: JSON.stringify({
      p_user_id: 'user',
      p_focus: state.focus,
      p_location_id: null,
      p_session_id: null,
      p_floor: matrix.floor,
    }),
  })
  const sets = (await response.json()) as { section: string; candidates: unknown[] }[]

  return sets.filter((set) => set.candidates.length === 0).map((set) => set.section)
}

describe('the migration — shape', () => {
  it('is additive: one function, and nothing altered, dropped or written', () => {
    expect(migrationFiles().at(-1)).toBe(MIGRATION)
    expect(MIGRATION > GOAL_SCOPE_MIGRATION).toBe(true)

    expect(statements.match(/create (or replace )?function/gi)).toHaveLength(1)
    expect(statements).toContain('create or replace function public.generation_viability(')
    for (const forbidden of [
      /create table/i,
      /create type/i,
      /create policy/i,
      /alter /i,
      /\bdrop /i,
      /insert into/i,
      /\bupdate /i,
      /delete from/i,
    ]) {
      expect(statements, String(forbidden)).not.toMatch(forbidden)
    }
  })

  it('is invoker-rights, stable, and on a pinned search_path', () => {
    expect(declaration).toMatch(/\blanguage sql\b/)
    expect(declaration).toMatch(/\bstable\b/)
    expect(declaration).toMatch(/security invoker/)
    expect(declaration).toMatch(/set search_path = ''/)
    expect(statements).not.toMatch(/security definer/i)
  })

  it('is revoked from public and anon, and granted to authenticated and service_role', () => {
    const signature =
      'public\\.generation_viability\\( public\\.goal_preset, public\\.section_type\\[\\], text\\[\\], text\\[\\], public\\.movement_pattern\\[\\], text\\[\\], integer\\)'

    expect(statements).toMatch(
      new RegExp(`revoke all on function ${signature} from public, anon;`),
    )
    expect(statements).toMatch(
      new RegExp(`grant execute on function ${signature} to authenticated, service_role;`),
    )
    expect(statements.match(/\bgrant /g)).toHaveLength(1)
    expect(statements.match(/\brevoke /g)).toHaveLength(1)
  })

  it('makes no model call and reaches nothing outside this database', () => {
    for (const forbidden of [/anthropic/i, /\bhttp[s]?:/i, /\bnet\./i, /pg_net/i, /extension/i]) {
      expect(statements).not.toMatch(forbidden)
    }
  })

  it('reads the catalog and the focus map, and no row a user owns', () => {
    const relations = [...declaration.matchAll(/(?:from|join) public\.([a-z_]+)/g)].map(
      (match) => match[1],
    )

    expect(new Set(relations)).toEqual(new Set(['exercise_catalog', 'focus_pattern_map']))
    // The proposal is the arguments. A saved profile, location or constraint
    // would be the configuration being replaced, not the one being proposed.
    expect(declaration).not.toMatch(
      /profiles|locations|location_equipment|user_constraints|constraints_in_force|auth\./,
    )
  })

  it('never raises: a non-viable proposal is rows, not an error', () => {
    expect(declaration).not.toMatch(/\braise\b/i)
  })
})

describe('the same eligibility rules as generation', () => {
  const retrieval = statementsOf(CANDIDATES_MIGRATION)
  const goalScope = statementsOf(GOAL_SCOPE_MIGRATION)

  /** Each clause is present in retrieval's text and in the evaluation's. */
  const shared = (clause: string) => {
    expect(retrieval, `retrieval: ${clause}`).toContain(clause)
    expect(declaration, `evaluation: ${clause}`).toContain(clause)
  }

  it('admits a focus through focus_pattern_map, and exempts the same roles', () => {
    expect(declaration).toMatch(
      /ec\.movement_patterns && array\( select f\.movement_pattern from public\.focus_pattern_map f where f\.session_focus = r\.focus \)/,
    )
    shared(
      "or ec.exercise_role = any (array[ 'conditioning', 'mobility', 'activation', 'cardio', 'stability' ]::public.exercise_role[])",
    )
    // `rules.mjs` reads the latest migration to state the list, which is now
    // this one; the matrix is built from it.
    expect(rules.focusExemptRoles).toEqual([
      'conditioning',
      'mobility',
      'activation',
      'cardio',
      'stability',
    ])
  })

  it('tests section and equipment eligibility with the same operators', () => {
    expect(retrieval).toContain('ec.sections @> array[p_section]')
    expect(declaration).toContain('ec.sections @> array[r.section]')

    expect(retrieval).toContain('ec.equipment_options && p_available_equipment')
    expect(declaration).toContain('ec.equipment_options && p.equipment')

    shared('cardinality(ue.equipment) > 0')
  })

  it('narrows equipment as usable_equipment does, against the proposed exclusions', () => {
    const usable = statementsOf('20260921000002_user_constraints.sql')
    const aggregate = "coalesce(array_agg(o.equipment_id order by o.equipment_id), '{}')"

    expect(usable).toContain(aggregate)
    expect(declaration).toContain(aggregate)
    expect(usable).toContain('where o.equipment_id = any (p_available)')
    expect(declaration).toContain(
      'where o.equipment_id = any (p.equipment) and o.equipment_id <> all (p.excluded_equipment)',
    )
  })

  it('applies exercise and pattern exclusions with the same predicates', () => {
    expect(retrieval).toContain('and ec.id <> all (array(')
    expect(declaration).toContain('and ec.id <> all (p.excluded_exercises)')

    expect(retrieval).toContain('and not (ec.movement_patterns && array(')
    expect(declaration).toContain('and not (ec.movement_patterns && p.excluded_patterns)')

    // Only `exclude` filters, and the arguments carry nothing else.
    expect(declaration).not.toMatch(/'avoid'|'prefer_not'/)
  })

  it('resolves active recovery to the same fixed sections, overriding the toggles', () => {
    const override = "then array['warmup', 'mobility', 'cooldown']::public.section_type[]"

    expect(goalScope).toContain(`when p_goal = 'active_recovery' ${override}`)
    expect(declaration).toContain(`when g.goal = 'active_recovery' ${override}`)
    expect(rules.goalSectionOverrides).toEqual({
      active_recovery: ['warmup', 'mobility', 'cooldown'],
    })
  })

  it('applies the same floor, per section, with the same default', () => {
    expect(declaration).toMatch(new RegExp(`p_floor integer default ${rules.floor}\\b`))
    expect(rules.floor).toBe(CANDIDATE_FLOOR)
    expect(goalScope).toContain('strict_set.found < p_floor')
    expect(declaration).toContain('c.strict_found < p_floor')
  })

  it('covers every goal and focus the schema has, which is what Generate offers', () => {
    expect(declaration).toContain('unnest(enum_range(null::public.goal_preset))')
    expect(declaration).toContain('unnest(enum_range(null::public.session_focus))')

    expect(GENERATION_GOALS.map((goal) => goal.value).sort()).toEqual([...ENUMS.goal_preset].sort())
    expect([...focusPatterns.keys()].sort()).toEqual([...ENUMS.session_focus].sort())
  })
})

describe('agreement with candidate retrieval across the legal-state matrix', () => {
  it('fails exactly the sections retrieval returns empty, for every listed state', async () => {
    expect(matrix.states.length).toBeGreaterThan(0)

    for (const state of matrix.states) {
      const rows = evaluate(
        proposal(state.goal, savedSections(state), state.tier, state.constraint),
      )
      const failing = failingFor(rows, state.goal, state.focus)

      expect(failing, state.id).toEqual(await retrievedEmptySections(state))
      // And the committed matrix records the same outcome.
      expect(failing, state.id).toEqual(state.emptySections)
      expect(failing.length > 0, state.id).toBe(state.failsBeforeComposition)
    }
  }, 60_000)

  it('covers the states that fail and the states a constraint refuses', () => {
    // The loop above is only evidence if the matrix exercises both answers.
    const classes = new Set(matrix.states.map((state) => state.classification))

    expect(classes.has('unsupported-product-state')).toBe(true)
    expect(classes.has('legitimate-constraint-refusal')).toBe(true)
    expect(matrix.states.some((state) => !state.failsBeforeComposition)).toBe(true)
  })

  it('agrees for every constraint target the matrix evaluates, listed or not', () => {
    const [REFUSAL, UNSUPPORTED] = ['legitimate-constraint-refusal', 'unsupported-product-state']
    const standing = ENUMS.goal_preset.filter(
      (goal) => rules.goalSectionOverrides[goal] === undefined,
    )

    for (const row of matrix.constraints) {
      let failingStates = 0

      for (const tier of ENUMS.equipment_tier) {
        for (const goal of standing) {
          const rows = evaluate(proposal(goal, SECTIONS_BY_GOAL[goal], tier, row))
          const goals = goal === standing[0] ? [goal, ...Object.keys(rules.goalSectionOverrides)] : [goal]

          for (const evaluated of goals) {
            for (const focus of ENUMS.session_focus) {
              if (failingFor(rows, evaluated, focus).length > 0) failingStates += 1
            }
          }
        }
      }

      expect(row.statesEvaluated, row.id).toBe(
        ENUMS.goal_preset.length * ENUMS.session_focus.length * ENUMS.equipment_tier.length,
      )
      expect(failingStates, row.id).toBe(
        row.classifications[REFUSAL] + row.classifications[UNSUPPORTED],
      )
    }
  }, 60_000)

  it('is viable only when every goal and focus resolves, active recovery included', () => {
    const unconstrained = matrix.states.filter((state) => state.constraint === null)
    const recovery = unconstrained.filter(
      (state) => rules.goalSectionOverrides[state.goal] !== undefined,
    )
    let viable = 0
    let notViable = 0

    for (const state of unconstrained) {
      if (rules.goalSectionOverrides[state.goal] !== undefined) continue

      const rows = evaluate(proposal(state.goal, savedSections(state), state.tier, null))
      // Every focus of this saved profile, and every recovery request here.
      const requests = [
        ...unconstrained.filter(
          (other) =>
            other.goal === state.goal &&
            other.tier === state.tier &&
            other.profile === state.profile,
        ),
        ...recovery.filter((other) => other.tier === state.tier),
      ]

      expect(requests, state.id).toHaveLength(ENUMS.session_focus.length * 2)
      expect(rows.length === 0, state.id).toBe(
        requests.every((request) => !request.failsBeforeComposition),
      )
      if (rows.length === 0) viable += 1
      else notViable += 1
    }

    expect(viable).toBeGreaterThan(0)
    expect(notViable).toBeGreaterThan(0)
  })

  it('fails a location that cannot serve active recovery, whatever the toggles say', () => {
    // A location with no equipment: recovery's three sections fail beside the
    // one enabled section, though no toggle asked for them.
    const rows = evaluate({
      ...proposal('strength', ['primary_lift'], 'full', null),
      p_available_equipment: [],
    })

    expect(rows.map((row) => row.section)).toEqual(
      ENUMS.section_type.filter((section) =>
        ['warmup', 'mobility', 'cooldown', 'primary_lift'].includes(section),
      ),
    )
    for (const row of rows) {
      expect(row.failure_class).toBe('missing_equipment')
      expect((row.goals as string[]).includes('active_recovery')).toBe(
        row.section !== 'primary_lift',
      )
    }
  })
})

describe('what a not-viable answer names', () => {
  it('names the equipment set when the section has rows this location cannot perform', () => {
    const args = proposal('strength', ENUMS.section_type, 'minimal', null)
    const rows = evaluate(args)

    expect(rows).toEqual([
      {
        section: 'carries',
        failure_class: 'missing_equipment',
        incompatible_choice: {
          kind: 'equipment',
          equipment: [...EQUIPMENT_BY_TIER.minimal].sort(),
        },
        goals: ENUMS.goal_preset.filter((goal) => goal !== 'active_recovery'),
        focuses: [...ENUMS.session_focus],
        blocks_proposed_goal: true,
      },
    ])
  })

  it('names the section when the catalog has nothing for it', () => {
    const without = catalog.filter((exercise) => !exercise.sections.includes('cooldown'))
    const rows = viabilityRows(
      proposal('active_recovery', SECTIONS_BY_GOAL.strength, 'full', null),
      without,
      focusPatterns,
    )
    const cooldown = rows.find((row) => row.section === 'cooldown')

    expect(cooldown).toMatchObject({
      failure_class: 'catalog_gap',
      incompatible_choice: { kind: 'section', section: 'cooldown' },
      blocks_proposed_goal: true,
    })
    expect(cooldown?.goals).toContain('active_recovery')
  })

  it('names the exclusion, and only the exclusion that removed something', () => {
    const refusals = matrix.states.filter(
      (state) => state.classification === 'legitimate-constraint-refusal',
    )
    expect(refusals.length).toBeGreaterThan(0)

    for (const refusal of refusals) {
      const constraint = refusal.constraint as { scope: string; target: string }
      const args = proposal(refusal.goal, savedSections(refusal), refusal.tier, constraint)
      // A second exclusion that touches nothing at this location: an exercise
      // id the catalog does not have.
      const rows = evaluate({
        ...args,
        p_excluded_exercises: [...(args.p_excluded_exercises ?? []), 'not_in_the_catalog'],
      })
      const failed = rows.filter(
        (row) =>
          (row.goals as string[]).includes(refusal.goal) &&
          (row.focuses as string[]).includes(refusal.focus),
      )

      expect(failed.map((row) => row.section), refusal.id).toEqual(refusal.emptySections)
      for (const row of failed) {
        expect(row.failure_class, refusal.id).toBe('athlete_exclusion')
        expect(row.incompatible_choice, refusal.id).toEqual({
          kind: 'exclusion',
          exclusions: [{ scope: constraint.scope, target: constraint.target }],
        })
      }
    }
  })

  it('names every exclusion that contributed when more than one did', () => {
    const tagged = catalog.filter((exercise) => exercise.sections.includes('cooldown'))
    const rows = evaluate({
      ...proposal('strength', ['cooldown'], 'full', null),
      p_excluded_exercises: tagged.map((exercise) => exercise.id),
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ section: 'cooldown', failure_class: 'athlete_exclusion' })
    expect(rows[0].incompatible_choice).toEqual({
      kind: 'exclusion',
      exclusions: tagged
        .map((exercise) => exercise.id)
        .sort()
        .map((target) => ({ scope: 'exercise', target })),
    })
    expect(rows[0].goals).toEqual([...ENUMS.goal_preset])
  })

  it('names the toggles when they resolve to no section at all', () => {
    const rows = evaluate(proposal('balanced', [], 'full', null))

    expect(rows).toEqual([
      {
        section: null,
        failure_class: 'no_sections',
        incompatible_choice: { kind: 'sections', sections: [] },
        goals: ENUMS.goal_preset.filter((goal) => goal !== 'active_recovery'),
        focuses: [...ENUMS.session_focus],
        blocks_proposed_goal: true,
      },
    ])
    expect(evaluate(proposal('active_recovery', [], 'full', null))[0].blocks_proposed_goal).toBe(
      false,
    )
  })

  it('writes only the declared classes, each with a choice the client can read', () => {
    for (const failureClass of VIABILITY_FAILURE_CLASSES) {
      expect(declaration).toContain(`'${failureClass}'`)
    }

    const seen = new Set<string>()
    for (const state of matrix.states) {
      for (const row of evaluate(
        proposal(state.goal, savedSections(state), state.tier, state.constraint),
      )) {
        const failure = failureFromRow(row)
        expect(failure.ok, state.id).toBe(true)
        if (failure.ok) {
          seen.add(failure.value.failureClass)
          expect(failure.value.section, state.id).not.toBeNull()
          expect(failure.value.goals.length, state.id).toBeGreaterThan(0)
          expect(failure.value.focuses.length, state.id).toBeGreaterThan(0)
        }
      }
    }
    expect([...seen].sort()).toEqual(['athlete_exclusion', 'missing_equipment'])
  })

  it('is deterministic', () => {
    const args = proposal('strength', ENUMS.section_type, 'minimal', {
      scope: 'equipment',
      target: 'bodyweight',
    })

    expect(JSON.stringify(evaluate(args))).toBe(JSON.stringify(evaluate(args)))
  })
})

describe('typed client access', () => {
  const double = () =>
    createViabilityDouble({
      url: 'https://clear.test',
      anonKey: 'anon',
      users: { token: 'user' },
      catalog,
    })
  const client = (fetch: typeof globalThis.fetch, accessToken: string | null = 'token') =>
    createViabilityClient({ url: 'https://clear.test', anonKey: 'anon', accessToken, fetch })

  it('answers viable for a preset the matrix supports', async () => {
    const server = double()
    const result = await client(server.fetch).evaluate({
      goal: 'strength',
      enabledSections: SECTIONS_BY_GOAL.strength,
      equipment: EQUIPMENT_BY_TIER.full,
    })

    expect(result).toEqual({ ok: true, value: { viable: true } })
    // One RPC, and nothing else: no model, no write.
    expect(server.requests()).toEqual([{ method: 'POST', path: '/rpc/generation_viability' }])
  })

  it('maps a failing section, its class and the incompatible choice', async () => {
    const result = await client(double().fetch).evaluate({
      goal: 'active_recovery',
      enabledSections: [...ENUMS.section_type],
      equipment: EQUIPMENT_BY_TIER.minimal,
    })

    expect(result).toEqual({
      ok: true,
      value: {
        viable: false,
        failures: [
          {
            section: 'carries',
            failureClass: 'missing_equipment',
            incompatibleChoice: {
              kind: 'equipment',
              equipment: [...EQUIPMENT_BY_TIER.minimal].sort(),
            },
            goals: ENUMS.goal_preset.filter((goal) => goal !== 'active_recovery'),
            focuses: [...ENUMS.session_focus],
            blocksProposedGoal: false,
          },
        ],
      },
    })
  })

  it('sends each proposed exclusion in the argument its scope filters on', async () => {
    const exclusion = matrix.states.find(
      (state) => state.classification === 'legitimate-constraint-refusal',
    )
    if (exclusion === undefined || exclusion.constraint === null) throw new Error('no refusal')

    const result = await client(double().fetch).evaluate({
      goal: exclusion.goal as (typeof ENUMS.goal_preset)[number],
      enabledSections: savedSections(exclusion) as (typeof ENUMS.section_type)[number][],
      equipment: EQUIPMENT_BY_TIER[exclusion.tier as keyof typeof EQUIPMENT_BY_TIER],
      exclusions: [
        {
          scope: exclusion.constraint.scope as (typeof ENUMS.constraint_scope)[number],
          target: exclusion.constraint.target,
        },
      ],
    })

    expect(result.ok && !result.value.viable && result.value.failures[0].incompatibleChoice).toEqual({
      kind: 'exclusion',
      exclusions: [{ scope: exclusion.constraint.scope, target: exclusion.constraint.target }],
    })
  })

  it('is not callable without a signed-in user', async () => {
    const server = double()
    const request = {
      goal: 'strength',
      enabledSections: SECTIONS_BY_GOAL.strength,
      equipment: EQUIPMENT_BY_TIER.full,
    } as const

    const signedOut = await client(server.fetch, null).evaluate(request)
    expect(!signedOut.ok && signedOut.error.code).toBe(ErrorCode.AUTH_UNAUTHENTICATED)
    expect(server.requests()).toEqual([])

    // The anon key alone reaches PostgREST and is refused there.
    const anonymous = await client(server.fetch, 'anon').evaluate(request)
    expect(anonymous.ok).toBe(false)
  })

  it('refuses a row it cannot read rather than passing it through', () => {
    const [row] = evaluate(proposal('strength', ENUMS.section_type, 'minimal', null))

    expect(failureFromRow(row).ok).toBe(true)
    expect(failureFromRow({ ...row, failure_class: 'unknown' }).ok).toBe(false)
    expect(failureFromRow({ ...row, incompatible_choice: { kind: 'other' } }).ok).toBe(false)
    expect(failureFromRow({ ...row, incompatible_choice: null }).ok).toBe(false)
    expect(failureFromRow({ ...row, failure_class: 'no_sections' }).ok).toBe(false)
  })
})

describe('generated types', () => {
  it('declare the function as the migration does', () => {
    const declared = readSchema().functions.find((fn) => fn.name === 'generation_viability')

    expect(declared?.args.map((arg) => [arg.name, arg.pgType, arg.optional])).toEqual([
      ['p_goal', 'public.goal_preset', false],
      ['p_enabled_sections', 'public.section_type[]', false],
      ['p_available_equipment', 'text[]', false],
      ['p_excluded_exercises', 'text[]', true],
      ['p_excluded_patterns', 'public.movement_pattern[]', true],
      ['p_excluded_equipment', 'text[]', true],
      ['p_floor', 'integer', true],
    ])
    expect(declared?.columns?.map((column) => [column.name, column.pgType])).toEqual([
      ['section', 'public.section_type'],
      ['failure_class', 'text'],
      ['incompatible_choice', 'jsonb'],
      ['goals', 'public.goal_preset[]'],
      ['focuses', 'public.session_focus[]'],
      ['blocks_proposed_goal', 'boolean'],
    ])
  })

  it('are committed with no drift', () => {
    const committed = readFileSync(join(REPO_ROOT, TYPES_PATH), 'utf8')

    expect(committed === build().contents, 'stale — run `npm run gen:types`').toBe(true)
    expect(committed).toContain('      generation_viability: {')
    expect(committed).toContain(` *   supabase/migrations/${MIGRATION}`)
  })
})
