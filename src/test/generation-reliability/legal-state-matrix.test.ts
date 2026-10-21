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
 * It also records what the matrix says about the catalog *as it is today*,
 * with GR-02's section-mapping ledger applied to the seed: the three sections
 * the capture left empty have candidates, and the Minimal tier resolves main
 * work. The one gap left — no carry without dumbbells or kettlebells — is
 * asserted as a gap.
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
import {
  buildUserMessage,
  resolveEffectiveRequest,
} from '../../../supabase/functions/_shared/prompt.ts'
import { ACTIVE_RECOVERY_SECTIONS, CANDIDATE_FLOOR, type SectionType } from '../../data/candidates'
import { Constants } from '../../data/database.types'
import { ErrorCode, isErr, isOk } from '../../state/errors'
import {
  initialDraft,
  requestFrom,
  withIntensity,
  withRecovery,
  type FocusHistory,
  type GenerationContext,
} from '../../state/generation-form'
import { INTENSITY_BY_GOAL } from '../../state/intensity'
import { EQUIPMENT, EQUIPMENT_BY_TIER, SECTIONS_BY_GOAL } from '../../state/onboarding'
import { createCandidatesDouble } from '../candidates-double'
import { promptInput } from '../generation-prompt-fixtures'
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
  }, 20_000)
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

describe('the onboarding preview’s pool (REQ-004)', () => {
  // Onboarding shows `SECTIONS_BY_GOAL[goal]` as a read-only preview and
  // commits it unchanged, so the preview is the enabled pool. Composition may
  // leave a section out; nothing outside the pool is ever a candidate.
  const ONBOARDING_GOALS = ['strength', 'hypertrophy', 'conditioning', 'balanced'] as const

  it.each(ONBOARDING_GOALS)('evaluates only the previewed sections for %s', (goal) => {
    const rows = matrix.states.filter(
      (state) => state.goal === goal && state.profile === 'preset' && state.constraint === null,
    )
    expect(rows.length).toBeGreaterThan(0)

    for (const row of rows) {
      const sections = row.sections.map((section) => section.section)
      expect(sections, row.id).toEqual(
        ENUMS.section_type.filter((section) => SECTIONS_BY_GOAL[goal].includes(section)),
      )
    }
  })

  it.each(ONBOARDING_GOALS)('retrieves candidates for no section outside the %s pool', async (goal) => {
    const double = createCandidatesDouble({
      url: 'https://clear.test',
      anonKey: 'anon',
      users: { token: 'user' },
      profiles: {
        user: {
          goalPreset: goal,
          enabledSections: [...SECTIONS_BY_GOAL[goal]],
          locations: [{ id: 'location', isDefault: true, equipment: EQUIPMENT_BY_TIER.full }],
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
      const sets = (await response.json()) as { section: string }[]

      expect(sets.map((set) => set.section).sort(), `${goal}/${focus}`).toEqual(
        [...SECTIONS_BY_GOAL[goal]].sort(),
      )
    }
  })
})

describe('the repaired catalog', () => {
  it.each(['skill_power', 'carries', 'stability_balance'])(
    'has %s candidates at every tier that has the equipment',
    (section) => {
      const rows = matrix.sectionTiers.filter((row) => row.section === section)
      expect(rows).toHaveLength(ENUMS.equipment_tier.length)
      expect(rows.find((row) => row.tier === 'full')?.candidates).toBeGreaterThan(0)

      // The one gap left is recorded, not hidden: every carry needs dumbbells
      // or kettlebells, so `carries` is empty at Minimal and nowhere else.
      const empty = rows.filter((row) => row.candidates === 0).map((row) => row.id)
      expect(empty).toEqual(section === 'carries' ? ['carries/minimal'] : [])
    },
  )

  it.each(['strength', 'hypertrophy', 'conditioning', 'balanced'])(
    'resolves every default section, primary_lift included, for %s at Minimal',
    (goal) => {
      const rows = matrix.states.filter(
        (state) =>
          state.goal === goal &&
          state.tier === 'minimal' &&
          state.profile === 'preset' &&
          state.constraint === null,
      )
      expect(rows).toHaveLength(ENUMS.session_focus.length)

      for (const row of rows) {
        const primary = row.sections.find((section) => section.section === 'primary_lift')
        if (primary !== undefined) expect(primary.relaxed, row.id).toBeGreaterThan(0)
        expect(row.emptySections, row.id).toEqual([])
        expect(row.failsBeforeComposition, row.id).toBe(false)
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

describe('requested intensity across the legal states (REQ-009, U27)', () => {
  it('is no dimension of eligibility: no legal state is keyed or classified by it', () => {
    for (const state of matrix.states) {
      expect(Object.keys(state).some((key) => /intensity/i.test(key)), state.id).toBe(false)
    }
  })

  it('interprets every requested 1–10 for every enumerated goal inside that goal’s range', () => {
    for (const goal of ENUMS.goal_preset) {
      const { min, max } = INTENSITY_BY_GOAL[goal]
      for (let requested = 1; requested <= 10; requested += 1) {
        const request = resolveEffectiveRequest({
          requestId: 'req_matrix_intensity',
          goal,
          focus: null,
          requestedIntensity: requested,
          durationTargetMins: 45,
          enabledSections: ['warmup', 'cooldown'],
        })

        expect(request.requestedIntensity).toBe(requested)
        expect(request.effectiveIntensity).toBe(Math.min(max, Math.max(min, requested)))
      }
    }
  })

  it('carries one customized returning profile’s choice unchanged, with eligibility and refusal intact', async () => {
    const USER = 'returning-user'
    const LOCATION = '00000000-0000-4000-8000-0000000000aa'
    // Customized rather than preset: no core, and a dumbbell-only home.
    const ENABLED: SectionType[] = ['warmup', 'primary_lift', 'accessory', 'cooldown']
    const OWNED = ['bodyweight', 'dumbbells']
    const double = createCandidatesDouble({
      url: 'https://clear.test',
      anonKey: 'anon',
      users: { token: USER },
      profiles: {
        [USER]: {
          goalPreset: 'hypertrophy',
          enabledSections: ENABLED,
          locations: [{ id: LOCATION, isDefault: true, equipment: OWNED }],
        },
      },
    })
    const due = (focus: 'lower_body' | 'power'): FocusHistory => ({
      status: 'recommended',
      focus,
      intensity: 9,
      reason: 'No hinge in 11 days.',
    })
    const context: GenerationContext = { goalPreset: 'hypertrophy', history: due('lower_body') }

    // Visit one: history's 9 stands. Visit two: the athlete asks for 10.
    // Visit three: the same 10 on a Recovery day.
    const hard = withIntensity(initialDraft(LOCATION), 10)
    const visits = [
      { draft: initialDraft(LOCATION), requested: 9, goal: 'hypertrophy', effective: 9 },
      { draft: hard, requested: 10, goal: 'hypertrophy', effective: 9 },
      { draft: withRecovery(hard, true), requested: 10, goal: 'active_recovery', effective: 3 },
    ] as const

    for (const [index, visit] of visits.entries()) {
      const sent = requestFrom(visit.draft, context, `req_returning_${index}`)
      if (!isOk(sent)) throw new Error(`visit ${index} was refused`)
      expect(sent.value.requested_intensity, `visit ${index}`).toBe(visit.requested)
      expect(sent.value.goal, `visit ${index}`).toBe(visit.goal)

      const request = resolveEffectiveRequest({
        requestId: sent.value.request_id,
        goal: sent.value.goal,
        focus: sent.value.focus,
        requestedIntensity: sent.value.requested_intensity,
        durationTargetMins: sent.value.requested_duration_mins,
        enabledSections: ENABLED,
      })
      expect(request.effectiveIntensity, `visit ${index}`).toBe(visit.effective)
      const message = buildUserMessage(promptInput({ request }))
      expect(message).toContain(`requested_intensity: ${visit.requested}\n`)
      expect(message).toContain(`effective_intensity: ${visit.effective}\n`)
      if (visit.goal === 'active_recovery') {
        // Recovery's gentle constraints hold whatever was requested.
        expect(request.effectiveSections).toEqual(ACTIVE_RECOVERY_SECTIONS)
      }
    }

    // Hard eligibility takes no intensity: the customized pool and the owned
    // equipment bound every candidate, whatever number was asked for.
    const response = await double.fetch('https://clear.test/rest/v1/rpc/generation_candidate_sets', {
      method: 'POST',
      headers: { apikey: 'anon', Authorization: 'Bearer token' },
      body: JSON.stringify({
        p_user_id: USER,
        p_focus: 'lower_body',
        p_location_id: LOCATION,
        p_session_id: null,
        p_floor: matrix.floor,
      }),
    })
    const sets = (await response.json()) as {
      section: string
      candidates: { usable_equipment: string[] }[]
    }[]
    expect(sets.map((set) => set.section).sort()).toEqual([...ENABLED].sort())
    for (const set of sets) {
      expect(set.candidates.length, set.section).toBeGreaterThan(0)
      for (const candidate of set.candidates) {
        expect(candidate.usable_equipment.every((item) => OWNED.includes(item)), set.section).toBe(
          true,
        )
      }
    }

    // A Power recommendation on a Recovery day is still a typed refusal, not a
    // substitution and not something a requested number can buy back.
    const refused = requestFrom(
      withRecovery(hard, true),
      { goalPreset: 'hypertrophy', history: due('power') },
      'req_returning_power',
    )
    expect(isErr(refused) && refused.error.code).toBe(ErrorCode.GENERATION_INVALID_PARAMS)
  })
})
