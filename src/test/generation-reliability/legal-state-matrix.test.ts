/**
 * GR-01 / REQ-001 — the legal-state matrix.
 *
 * `npm run gr:matrix` writes `docs/process/generation-reliability/
 * legal-state-matrix.json`; this suite is what keeps that file true. It builds
 * the matrix again from the same inputs the command reads — the schema's enums
 * and retrieval rules, the committed seed, the onboarding presets — and holds
 * the committed bytes to the result, so an enum value, a preset or a catalog
 * row that changes without a regeneration fails here as well as under
 * `--check`.
 *
 * It also records what the matrix says about the catalog *as it is today*:
 * three selectable sections with no exercises at any tier, and no primary lift
 * at the Minimal tier. Those assertions are the unrepaired baseline GR-02
 * starts from, and they are expected to be rewritten by the task that repairs
 * the catalog — not relaxed to make a red build green.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../../../scripts/gen-types/schema.mjs'
import {
  MATRIX_PATH,
  checkMatrix,
} from '../../../scripts/generation-reliability/legal-state-matrix.mjs'
import {
  CLASSIFICATIONS,
  buildMatrix,
  serializeMatrix,
  validateMatrix,
} from '../../../scripts/generation-reliability/matrix.mjs'
import { loadRetrievalRules } from '../../../scripts/generation-reliability/rules.mjs'
import { CANDIDATE_FLOOR } from '../../data/candidates'
import { Constants } from '../../data/database.types'
import { EQUIPMENT, EQUIPMENT_BY_TIER, SECTIONS_BY_GOAL } from '../../state/onboarding'
import { createCandidatesDouble } from '../candidates-double'
import { seededCatalog } from '../seed-catalog'

const rules = loadRetrievalRules()

const inputs = {
  rules,
  catalog: seededCatalog(),
  equipmentByTier: EQUIPMENT_BY_TIER,
  sectionsByGoal: SECTIONS_BY_GOAL,
  equipment: EQUIPMENT.map((item) => item.value),
}

const matrix = buildMatrix(inputs)
const contents = serializeMatrix(matrix)
const committed = readFileSync(join(REPO_ROOT, MATRIX_PATH), 'utf8')

const ENUMS = Constants.public.Enums

describe('the committed matrix', () => {
  it('is byte-identical to what the seed and schema produce', () => {
    // Compared as a boolean: a failed string comparison of a file this size
    // prints a diff nobody can read.
    expect(committed === contents, 'stale — run `npm run gr:matrix`').toBe(true)
    expect(checkMatrix(committed, contents, rules.enums)).toEqual([])
  })

  it('is deterministic', () => {
    expect(serializeMatrix(buildMatrix(inputs))).toBe(contents)
  })
})

describe('check mode', () => {
  it('fails when the committed file is missing or stale', () => {
    expect(checkMatrix(null, contents, rules.enums)).toHaveLength(1)

    const stale = contents.replace(`"floor": ${matrix.floor}`, `"floor": ${matrix.floor + 1}`)
    expect(stale).not.toBe(contents)
    expect(checkMatrix(stale, contents, rules.enums).join('\n')).toMatch(/stale/)
  })

  it.each(['"other"', '""', 'null'])('fails when a row is classified %s', (value) => {
    const unclassified = contents.replace(
      /"classification":"[a-z-]+"\}/,
      `"classification":${value}}`,
    )
    expect(unclassified).not.toBe(contents)

    expect(checkMatrix(unclassified, contents, rules.enums).join('\n')).toMatch(/unclassified/)
    // And it is the row that fails, not only the byte comparison.
    expect(validateMatrix(JSON.parse(unclassified), rules.enums).join('\n')).toMatch(
      /unclassified/,
    )
  })

  it('fails when a constraint tally leaves a state out', () => {
    const tampered = structuredClone(matrix)
    tampered.constraints[0].statesEvaluated += 1

    expect(validateMatrix(tampered, rules.enums).join('\n')).toMatch(/leaves a state unclassified/)
  })

  it('fails when the schema declares an enum value the matrix does not carry', () => {
    for (const name of ['section_type', 'goal_preset', 'session_focus', 'equipment_tier']) {
      const grown = { ...rules.enums, [name]: [...rules.enums[name], 'not_in_the_matrix'] }

      expect(validateMatrix(JSON.parse(committed), grown).join('\n')).toMatch(
        new RegExp(`${name} "not_in_the_matrix"`),
      )
    }
  })
})

describe('where the enums come from', () => {
  it('is the schema, and agrees with the generated types', () => {
    expect(rules.enums.section_type).toEqual([...ENUMS.section_type])
    expect(rules.enums.goal_preset).toEqual([...ENUMS.goal_preset])
    expect(rules.enums.session_focus).toEqual([...ENUMS.session_focus])
    expect(rules.enums.equipment_tier).toEqual([...ENUMS.equipment_tier])
    expect(rules.enums.constraint_scope).toEqual([...ENUMS.constraint_scope])
  })

  it('reads the floor and the recovery override out of the migrations', () => {
    expect(rules.floor).toBe(CANDIDATE_FLOOR)
    expect(rules.goalSectionOverrides).toEqual({
      active_recovery: [...SECTIONS_BY_GOAL.active_recovery],
    })
  })

  it('a new enum value appears in the matrix without a code change', () => {
    const grown = buildMatrix({
      ...inputs,
      rules: {
        ...rules,
        enums: { ...rules.enums, section_type: [...rules.enums.section_type, 'breathwork'] },
      },
    })

    expect(grown.cells.filter((cell) => cell.section === 'breathwork')).toHaveLength(
      ENUMS.equipment_tier.length * ENUMS.session_focus.length,
    )
    expect(serializeMatrix(grown)).not.toBe(contents)
  })

  it('refuses a tier or goal with no preset rather than omitting it', () => {
    const grow = (name: string) => ({
      ...inputs,
      rules: { ...rules, enums: { ...rules.enums, [name]: [...rules.enums[name], 'new_value'] } },
    })

    expect(() => buildMatrix(grow('equipment_tier'))).toThrow(/no preset equipment/)
    expect(() => buildMatrix(grow('goal_preset'))).toThrow(/no section preset/)
    expect(() => buildMatrix(grow('session_focus'))).toThrow(/focus_pattern_map/)
    expect(() => buildMatrix(grow('constraint_scope'))).toThrow(/no retrieval predicate/)
  })
})

describe('coverage', () => {
  it('has a cell for every section × tier × focus', () => {
    expect(matrix.cells).toHaveLength(
      ENUMS.section_type.length * ENUMS.equipment_tier.length * ENUMS.session_focus.length,
    )
  })

  it('has every goal × focus × tier, including per-request active recovery', () => {
    for (const goal of ENUMS.goal_preset) {
      for (const focus of ENUMS.session_focus) {
        for (const tier of ENUMS.equipment_tier) {
          const rows = matrix.states.filter(
            (state) =>
              state.goal === goal &&
              state.focus === focus &&
              state.tier === tier &&
              state.constraint === null,
          )
          expect(rows.length, `${goal}/${focus}/${tier}`).toBeGreaterThan(0)
        }
      }
    }

    const recovery = matrix.states.filter((state) => state.goal === 'active_recovery')
    expect(new Set(recovery.map((state) => state.profile))).toEqual(new Set(['goal-override']))
    expect(recovery[0].sections.map((section) => section.section)).toEqual([
      'warmup',
      'mobility',
      'cooldown',
    ])
  })

  it('carries the preset, each single-section customization, and every section at once', () => {
    const profiles = new Set(
      matrix.states.filter((state) => state.goal === 'strength').map((state) => state.profile),
    )

    expect(profiles).toEqual(
      new Set([
        'preset',
        ...ENUMS.section_type
          .filter((section) => !SECTIONS_BY_GOAL.strength.includes(section))
          .map((section) => `preset+${section}`),
        'all-sections',
      ]),
    )
  })

  it('evaluates every target of every constraint scope', () => {
    expect(matrix.dimensions.constraintScopes).toEqual([
      { scope: 'exercise', targets: inputs.catalog.length },
      { scope: 'movement_pattern', targets: ENUMS.movement_pattern.length },
      { scope: 'equipment', targets: EQUIPMENT.length },
    ])
    expect(matrix.constraints).toHaveLength(
      inputs.catalog.length + ENUMS.movement_pattern.length + EQUIPMENT.length,
    )

    // A constrained state is listed exactly where the tally says it changed.
    const listed = matrix.states.filter((state) => state.constraint !== null)
    expect(listed).toHaveLength(
      matrix.constraints.reduce((sum, row) => sum + row.statesChanged, 0),
    )
  })

  it('classifies every row from the closed set', () => {
    expect(validateMatrix(matrix, rules.enums)).toEqual([])
    expect([...CLASSIFICATIONS]).toEqual([
      'supported',
      'supported-with-recorded-relaxation',
      'legitimate-constraint-refusal',
      'unsupported-product-state',
    ])
  })
})

describe('strict and relaxed counts', () => {
  it('records the floor wherever strict is under it, and nowhere else', () => {
    for (const cell of matrix.cells) {
      expect(cell.floorApplied, cell.id).toBe(cell.strict < matrix.floor)
      expect(cell.relaxed, cell.id).toBeGreaterThanOrEqual(cell.strict)
    }
    expect(matrix.cells.some((cell) => cell.floorApplied && cell.relaxed > cell.strict)).toBe(true)
    expect(matrix.cells.some((cell) => !cell.floorApplied)).toBe(true)
  })

  it('counts what candidate retrieval returns', async () => {
    // The double transcribes `generation_candidates` independently of the
    // matrix; `generation-candidates-migration.test.ts` holds it to the SQL.
    for (const tier of ENUMS.equipment_tier) {
      const double = createCandidatesDouble({
        url: 'https://clear.test',
        anonKey: 'anon',
        users: { token: 'user' },
        profiles: {
          user: {
            goalPreset: 'balanced',
            enabledSections: [...ENUMS.section_type],
            locations: [{ id: 'location', isDefault: true, equipment: EQUIPMENT_BY_TIER[tier] }],
          },
        },
      })

      for (const focus of ENUMS.session_focus) {
        const response = await double.fetch(
          'https://clear.test/rest/v1/rpc/generation_candidate_sets',
          {
            method: 'POST',
            headers: { apikey: 'anon', Authorization: 'Bearer token' },
            body: JSON.stringify({
              p_user_id: 'user',
              p_focus: focus,
              p_location_id: null,
              p_session_id: null,
              p_floor: matrix.floor,
            }),
          },
        )
        const sets = (await response.json()) as {
          section: string
          relaxed: boolean
          candidates: unknown[]
        }[]

        expect(sets).toHaveLength(ENUMS.section_type.length)
        for (const set of sets) {
          const cell = matrix.cells.find(
            (candidate) =>
              candidate.tier === tier &&
              candidate.focus === focus &&
              candidate.section === set.section,
          )
          expect(cell, `${tier}/${focus}/${set.section}`).toBeDefined()
          expect(set.relaxed).toBe(cell?.floorApplied)
          expect(set.candidates).toHaveLength(
            cell?.floorApplied ? (cell?.relaxed ?? -1) : (cell?.strict ?? -1),
          )
        }
      }
    }
  })
})

describe('the unrepaired catalog', () => {
  it.each(['skill_power', 'carries', 'stability_balance'])(
    'has no %s candidate at any tier',
    (section) => {
      const rows = matrix.sectionTiers.filter((row) => row.section === section)
      expect(rows).toHaveLength(ENUMS.equipment_tier.length)
      for (const row of rows) {
        expect(row.candidates, row.id).toBe(0)
        expect(row.classification, row.id).toBe('unsupported-product-state')
      }

      for (const cell of matrix.cells.filter((candidate) => candidate.section === section)) {
        expect([cell.strict, cell.relaxed], cell.id).toEqual([0, 0])
      }
    },
  )

  it.each(['strength', 'hypertrophy', 'balanced'])(
    'has no Minimal primary_lift candidate for %s',
    (goal) => {
      const rows = matrix.states.filter(
        (state) => state.goal === goal && state.tier === 'minimal' && state.profile === 'preset',
      )
      expect(rows).toHaveLength(ENUMS.session_focus.length)

      for (const row of rows) {
        const primary = row.sections.find((section) => section.section === 'primary_lift')
        expect(primary, row.id).toMatchObject({ strict: 0, relaxed: 0, floorApplied: true })
        expect(row.emptySections, row.id).toContain('primary_lift')
        expect(row.failsBeforeComposition, row.id).toBe(true)
        expect(row.classification, row.id).toBe('unsupported-product-state')
      }
    },
  )

  it('separates a refusal a constraint caused from a state the product cannot serve', () => {
    const refusals = matrix.states.filter(
      (state) => state.classification === 'legitimate-constraint-refusal',
    )

    for (const refusal of refusals) {
      expect(refusal.constraint, refusal.id).not.toBeNull()
      const baseline = matrix.states.find(
        (state) => state.id === `${refusal.goal}/${refusal.focus}/${refusal.tier}/preset`,
      )
      expect(baseline?.failsBeforeComposition, refusal.id).toBe(false)
    }

    for (const state of matrix.states.filter((row) => row.constraint === null)) {
      expect(state.classification, state.id).not.toBe('legitimate-constraint-refusal')
    }
  })
})
