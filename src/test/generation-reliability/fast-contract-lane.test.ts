/**
 * GR-06 / REQ-020, REQ-025 — the fast contract lane.
 *
 * Every state the committed legal-state matrix lists is retrieved against the
 * committed seed and asserted section by section: `fast-contract-lane.ts` does
 * the driving, this suite holds the result. The inputs are the matrix's rows,
 * not a list written here, and a row the lane did not assert fails it.
 *
 * Beside the matrix it retrieves for the owner-mirror fixture — the saved,
 * customized configuration `npm run gr:matrix -- --deployed` recorded — and for
 * the constraint edge cases, and then proves the lane bites: a tag removed, a
 * preset widened and a tier narrowed each fail it with the combination named.
 *
 * No database, network or model is involved. Retrieval is
 * `candidates-double.ts`, which `generation-candidates-migration.test.ts` holds
 * to the SQL; what this lane proves is that the seed and the presets answer the
 * matrix, not that Postgres agrees with the transcription. That is the database
 * lane's.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { REPO_ROOT } from '../../../scripts/gen-types/schema.mjs'
import {
  OWNER_MIRROR_PATH,
  ownerMirrorProblems,
} from '../../../scripts/generation-reliability/deployed.mjs'
import { MATRIX_PATH } from '../../../scripts/generation-reliability/legal-state-matrix.mjs'
import { loadRetrievalRules } from '../../../scripts/generation-reliability/rules.mjs'
import { Constants } from '../../data/database.types'
import { EQUIPMENT, EQUIPMENT_BY_TIER, SECTIONS, SECTIONS_BY_GOAL } from '../../state/onboarding'
import { seededCatalog } from '../seed-catalog'
import {
  combination,
  createRetrieval,
  runLane,
  unassertedRows,
  type CandidateSet,
  type LaneCoverage,
  type LaneInputs,
  type LaneMatrix,
  type LaneUser,
} from './fast-contract-lane'

const ENUMS = Constants.public.Enums

const rules = loadRetrievalRules()
const matrix = JSON.parse(readFileSync(join(REPO_ROOT, MATRIX_PATH), 'utf8')) as LaneMatrix

const inputs: LaneInputs = {
  catalog: seededCatalog(),
  equipmentByTier: EQUIPMENT_BY_TIER,
  sectionsByGoal: SECTIONS_BY_GOAL,
}

const coverage: LaneCoverage = {
  tiers: ENUMS.equipment_tier,
  goals: ENUMS.goal_preset,
  focuses: ENUMS.session_focus,
  selectableSections: SECTIONS.map((section) => section.value),
  goalSectionOverrides: rules.goalSectionOverrides,
}

const result = await runLane(matrix, inputs)

const SUPPORTED = ['supported', 'supported-with-recorded-relaxation']

/** A saved configuration with every section on, at a tier's preset equipment. */
const everySection = (tier: keyof typeof EQUIPMENT_BY_TIER): LaneUser => ({
  goal: 'balanced',
  enabledSections: ENUMS.section_type,
  equipment: EQUIPMENT_BY_TIER[tier],
})

const ids = (set: CandidateSet) => set.candidates.map((candidate) => candidate.exercise_id)
const sectionOf = (sets: CandidateSet[], section: string) => {
  const set = sets.find((candidate) => candidate.section === section)
  if (set === undefined) throw new Error(`section "${section}" was not retrieved`)
  return set
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('the matrix against the committed seed', () => {
  it('resolves every section of every state to what the matrix records', () => {
    expect(result.failures).toEqual([])
  })

  it('resolves a non-empty candidate set per required section for every supported state', () => {
    const supported = matrix.states.filter((row) => SUPPORTED.includes(row.classification))
    expect(supported.length).toBeGreaterThan(0)

    for (const row of supported) {
      expect(row.emptySections, row.id).toEqual([])
      for (const { section } of row.sections) {
        const assertion = result.assertions.find(
          (candidate) => candidate.row === row.id && candidate.section === section,
        )
        expect(assertion?.candidates, `${combination(row)} [${row.id}]: ${section}`).toBeGreaterThan(0)
      }
    }
  })

  it('resolves nothing for exactly the sections an unsupported or refused state names', () => {
    const failing = matrix.states.filter((row) => !SUPPORTED.includes(row.classification))
    expect(failing.length).toBeGreaterThan(0)

    for (const row of failing) {
      const empty = result.assertions
        .filter((candidate) => candidate.row === row.id && candidate.candidates === 0)
        .map((candidate) => candidate.section)
      expect(empty, row.id).toEqual(row.emptySections)
      expect(empty.length, row.id).toBeGreaterThan(0)
    }
  })
})

describe('inputs come from the matrix', () => {
  it('asserts every section of every matrix row, and nothing the matrix does not list', () => {
    expect(unassertedRows(matrix, result, coverage)).toEqual([])
    expect(result.assertions).toHaveLength(
      matrix.states.reduce((sum, row) => sum + row.sections.length, 0),
    )
  })

  it('reaches every tier × Goal × Focus × selectable section', () => {
    // Counted from the enums, independently of the rows the lane was handed.
    const unconstrained = new Set(
      matrix.states.filter((row) => row.constraint === null).map((row) => row.id),
    )
    const reached = new Set(
      result.assertions
        .filter((assertion) => unconstrained.has(assertion.row))
        .map(({ tier, goal, focus, section }) => `${tier}/${goal}/${focus}/${section}`),
    )
    const sectionsPerGoal = ENUMS.goal_preset.reduce(
      (sum, goal) =>
        sum + (rules.goalSectionOverrides[goal]?.length ?? coverage.selectableSections.length),
      0,
    )

    expect(coverage.selectableSections).toEqual([...ENUMS.section_type])
    expect(reached.size).toBe(
      ENUMS.equipment_tier.length * ENUMS.session_focus.length * sectionsPerGoal,
    )
  })

  it('fails when a matrix row has no corresponding assertion', () => {
    const [dropped] = matrix.states
    const without = {
      ...result,
      assertions: result.assertions.filter((assertion) => assertion.row !== dropped.id),
    }
    const problems = unassertedRows(matrix, without, coverage)

    expect(problems).toHaveLength(dropped.sections.length)
    expect(problems[0]).toBe(
      `matrix row ${dropped.id} has no assertion for section "${dropped.sections[0].section}"`,
    )
  })

  it('fails when a row is added to the matrix and the lane was not run for it', () => {
    const added = { ...matrix.states[0], id: 'a/new/matrix/row' }
    const problems = unassertedRows({ ...matrix, states: [...matrix.states, added] }, result, coverage)

    expect(problems).toHaveLength(added.sections.length)
    expect(problems.join('\n')).toContain('matrix row a/new/matrix/row has no assertion')
  })

  it('fails when a tier, Goal, Focus or selectable section is in no matrix row', () => {
    const grown = (change: Partial<LaneCoverage>) =>
      unassertedRows(matrix, result, { ...coverage, ...change }).join('\n')

    expect(grown({ tiers: [...coverage.tiers, 'garage'] })).toContain(
      'tier "garage" × Goal "strength" × Focus "upper_body": section "warmup" has no assertion',
    )
    expect(grown({ goals: [...coverage.goals, 'endurance'] })).toContain('Goal "endurance"')
    expect(grown({ focuses: [...coverage.focuses, 'core'] })).toContain('Focus "core"')
    expect(grown({ selectableSections: [...coverage.selectableSections, 'grip'] })).toContain(
      'section "grip" has no assertion',
    )
  })
})

describe('the owner-mirror fixture', () => {
  const committed = readFileSync(join(REPO_ROOT, OWNER_MIRROR_PATH), 'utf8')
  const mirror = JSON.parse(committed) as {
    goal: string
    enabledSections: string[]
    tier: string
    equipment: string[]
    exclusions: { scope: string; action: string; persistence: string; count: number }[]
  }

  it('is the committed fixture, and a customized user rather than a fresh default', () => {
    expect(
      ownerMirrorProblems(
        committed,
        rules.enums,
        EQUIPMENT.map((item) => item.value),
      ),
    ).toEqual([])
    expect([...mirror.enabledSections].sort()).not.toEqual([...SECTIONS_BY_GOAL[mirror.goal as never]].sort())
  })

  it('carries no exclusion the lane would have to invent a target for', () => {
    // The fixture records exclusion scopes and counts, never a target. With
    // none saved there is nothing to apply; once it records one, this lane has
    // to be told what a targetless exclusion means rather than pass without it.
    expect(mirror.exclusions).toEqual([])
  })

  it.each([...ENUMS.session_focus])(
    'resolves non-empty candidates in every enabled section for %s',
    async (focus) => {
      const { retrieve } = createRetrieval(
        {
          owner: {
            goal: mirror.goal,
            enabledSections: mirror.enabledSections,
            equipment: mirror.equipment,
          },
        },
        inputs.catalog,
        matrix.floor,
      )
      const sets = await retrieve('owner', focus)

      expect(sets.map((set) => set.section)).toEqual(mirror.enabledSections)
      for (const set of sets) {
        expect(
          set.candidates.length,
          `owner mirror, tier "${mirror.tier}" × Goal "${mirror.goal}" × Focus "${focus}": ${set.section}`,
        ).toBeGreaterThan(0)
      }
    },
  )
})

describe('constraint edge cases', () => {
  const focus = 'full_body'

  /** Baseline and constrained retrievals of the same configuration. */
  const pair = async (constraint: { scope: string; target: string; action?: string }) => {
    const { retrieve } = createRetrieval(
      {
        baseline: everySection('full'),
        constrained: { ...everySection('full'), constraints: [constraint] },
      },
      inputs.catalog,
      matrix.floor,
    )

    return { baseline: await retrieve('baseline', focus), constrained: await retrieve('constrained', focus) }
  }

  it('an exercise exclusion removes that exercise from every section and nothing else', async () => {
    const { retrieve } = createRetrieval({ baseline: everySection('full') }, inputs.catalog, matrix.floor)
    const [target] = ids(sectionOf(await retrieve('baseline', focus), 'primary_lift'))
    const { baseline, constrained } = await pair({ scope: 'exercise', target })

    for (const before of baseline) {
      const after = sectionOf(constrained, before.section)
      expect(ids(after), before.section).not.toContain(target)
      // The floor can widen a section that fell under it, never narrow it.
      for (const id of ids(before).filter((candidate) => candidate !== target)) {
        expect(ids(after), before.section).toContain(id)
      }
      expect(after.candidates.length, before.section).toBeGreaterThan(0)
    }
    expect(ids(sectionOf(baseline, 'primary_lift'))).toContain(target)
  })

  it.each([...ENUMS.movement_pattern])(
    'a %s pattern exclusion removes every exercise that carries the pattern',
    async (pattern) => {
      const { baseline, constrained } = await pair({ scope: 'movement_pattern', target: pattern })

      let removed = 0
      for (const before of baseline) {
        const after = sectionOf(constrained, before.section)
        for (const candidate of after.candidates) {
          expect(candidate.movement_patterns, `${before.section}: ${candidate.exercise_id}`).not.toContain(
            pattern,
          )
        }
        const carrying = before.candidates.filter((candidate) =>
          candidate.movement_patterns.includes(pattern),
        )
        removed += carrying.length
        for (const candidate of before.candidates) {
          if (!carrying.includes(candidate)) {
            expect(ids(after), before.section).toContain(candidate.exercise_id)
          }
        }
      }
      expect(removed, pattern).toBeGreaterThan(0)
    },
  )

  it('an equipment exclusion narrows an exercise that has another usable option', async () => {
    const { retrieve } = createRetrieval({ baseline: everySection('full') }, inputs.catalog, matrix.floor)
    const candidates = (await retrieve('baseline', focus)).flatMap((set) => set.candidates)
    // An item that is the only way to do one exercise and one of several ways
    // to do another, found in the seed rather than named here.
    const target = EQUIPMENT.map((item) => item.value).find(
      (item) =>
        candidates.some((candidate) => candidate.usable_equipment.join() === item) &&
        candidates.some(
          (candidate) =>
            candidate.usable_equipment.includes(item) && candidate.usable_equipment.length > 1,
        ),
    )
    expect(target).toBeDefined()
    if (target === undefined) return

    const { baseline, constrained } = await pair({ scope: 'equipment', target })
    let narrowed = 0
    let removed = 0

    for (const before of baseline) {
      const after = sectionOf(constrained, before.section)
      for (const candidate of after.candidates) {
        expect(candidate.usable_equipment, candidate.exercise_id).not.toContain(target)
        expect(candidate.usable_equipment.length, candidate.exercise_id).toBeGreaterThan(0)
      }
      for (const candidate of before.candidates) {
        const kept = after.candidates.find((other) => other.exercise_id === candidate.exercise_id)
        const others = candidate.usable_equipment.filter((item) => item !== target)

        if (others.length === 0) {
          expect(kept, `${before.section}: ${candidate.exercise_id}`).toBeUndefined()
          removed += 1
        } else {
          expect(kept?.usable_equipment, `${before.section}: ${candidate.exercise_id}`).toEqual(others)
          if (others.length < candidate.usable_equipment.length) narrowed += 1
        }
      }
    }

    expect(narrowed).toBeGreaterThan(0)
    expect(removed).toBeGreaterThan(0)
  })

  it('only an exclude filters retrieval', async () => {
    const [refusal] = matrix.states.filter((row) => row.constraint !== null)

    for (const action of ENUMS.constraint_action.filter((value) => value !== 'exclude')) {
      const { baseline, constrained } = await pair({
        scope: refusal.constraint?.scope ?? '',
        target: refusal.constraint?.target ?? '',
        action,
      })
      expect(constrained, action).toEqual(baseline)
    }
  })

  describe('an exclusion that empties a section', () => {
    // The matrix lists a constrained state only where the constraint changes
    // the classification, so each of these is a refusal the constraint caused.
    const refusals = matrix.states.filter(
      (row) => row.classification === 'legitimate-constraint-refusal',
    )

    const configuration = (row: (typeof refusals)[number]): LaneUser => ({
      goal: row.goal,
      enabledSections: SECTIONS_BY_GOAL[row.goal as never],
      equipment: EQUIPMENT_BY_TIER[row.tier as never],
    })

    it('is in the matrix, and the lane asserted the emptied sections', () => {
      expect(refusals.length).toBeGreaterThan(0)

      for (const row of refusals) {
        expect(row.constraint?.action, row.id).toBe('exclude')
        expect(row.emptySections.length, row.id).toBeGreaterThan(0)
        for (const section of row.emptySections) {
          expect(
            result.assertions.find(
              (assertion) => assertion.row === row.id && assertion.section === section,
            )?.candidates,
            `${row.id}: ${section}`,
          ).toBe(0)
        }
      }
    })

    it('empties the sections the matrix names, which resolve without it', async () => {
      for (const row of refusals) {
        const constraint = { scope: row.constraint?.scope ?? '', target: row.constraint?.target ?? '' }
        const { retrieve } = createRetrieval(
          {
            baseline: configuration(row),
            constrained: { ...configuration(row), constraints: [constraint] },
          },
          inputs.catalog,
          matrix.floor,
        )
        const empty = (sets: CandidateSet[]) =>
          sets.filter((set) => set.candidates.length === 0).map((set) => set.section)

        expect(empty(await retrieve('baseline', row.focus)), row.id).toEqual([])
        expect(empty(await retrieve('constrained', row.focus)), row.id).toEqual(row.emptySections)
      }
    })

    it('session-scoped, empties them in that session and in no other', async () => {
      const [row] = refusals
      const { retrieve } = createRetrieval(
        {
          athlete: {
            ...configuration(row),
            constraints: [
              {
                scope: row.constraint?.scope ?? '',
                target: row.constraint?.target ?? '',
                sessionId: 'this-session',
              },
            ],
          },
        },
        inputs.catalog,
        matrix.floor,
      )
      const empty = async (sessionId: string | null) =>
        (await retrieve('athlete', row.focus, sessionId))
          .filter((set) => set.candidates.length === 0)
          .map((set) => set.section)

      expect(await empty('this-session')).toEqual(row.emptySections)
      expect(await empty('another-session')).toEqual([])
      expect(await empty(null)).toEqual([])
    })
  })

  it('a session-scoped exercise exclusion applies to its session only', async () => {
    const { retrieve } = createRetrieval({ baseline: everySection('full') }, inputs.catalog, matrix.floor)
    const [target] = ids(sectionOf(await retrieve('baseline', focus), 'accessory'))
    const session = createRetrieval(
      {
        athlete: {
          ...everySection('full'),
          constraints: [{ scope: 'exercise', target, sessionId: 'this-session' }],
        },
      },
      inputs.catalog,
      matrix.floor,
    )

    const inSession = await session.retrieve('athlete', focus, 'this-session')
    const outside = await session.retrieve('athlete', focus, 'another-session')
    const noSession = await session.retrieve('athlete', focus)

    expect(ids(sectionOf(inSession, 'accessory'))).not.toContain(target)
    expect(sectionOf(inSession, 'accessory').candidates.length).toBeGreaterThan(0)
    expect(ids(sectionOf(outside, 'accessory'))).toContain(target)
    expect(noSession).toEqual(await retrieve('baseline', focus))
  })
})

describe('a change that empties a section fails the lane with the combination named', () => {
  it('a section tag removed from the catalog', async () => {
    const stripped = inputs.catalog.map((exercise) => ({
      ...exercise,
      sections: exercise.sections.filter((section) => section !== 'skill_power'),
    }))

    const { failures } = await runLane(matrix, { ...inputs, catalog: stripped })
    const emptied = failures.filter((failure) => failure.endsWith('resolved no candidates'))

    expect(emptied).toContain(
      'tier "building" × Goal "balanced" × Focus "full_body" ' +
        '[balanced/full_body/building/preset+skill_power]: ' +
        'section "skill_power" resolved no candidates',
    )
    // Every state that asks for the section is named, and no other section is.
    expect(emptied).toHaveLength(
      matrix.states.filter(
        (row) =>
          row.sections.some((section) => section.section === 'skill_power') &&
          !row.emptySections.includes('skill_power'),
      ).length,
    )
    expect(failures.every((failure) => failure.includes('section "skill_power"'))).toBe(true)
  })

  it('a Goal preset given a section its tier cannot fill', async () => {
    const { failures } = await runLane(matrix, {
      ...inputs,
      sectionsByGoal: {
        ...SECTIONS_BY_GOAL,
        strength: [...SECTIONS_BY_GOAL.strength, 'carries'],
      },
    })
    const emptied = failures.filter((failure) => failure.endsWith('resolved no candidates'))

    // Minimal is the one tier with no carry, so it is the only one named empty.
    expect(emptied.length).toBeGreaterThan(0)
    expect(
      emptied.every(
        (failure) =>
          failure.startsWith('tier "minimal" × Goal "strength"') &&
          failure.includes('section "carries"'),
      ),
    ).toBe(true)
    for (const focus of ENUMS.session_focus) {
      expect(emptied).toContain(
        `tier "minimal" × Goal "strength" × Focus "${focus}" ` +
          `[strength/${focus}/minimal/preset]: section "carries" resolved no candidates`,
      )
    }
    // The tiers that can fill it are still held to the matrix, which has no
    // assertion for a section the preset did not have.
    expect(failures).toContain(
      'tier "home" × Goal "strength" × Focus "upper_body" [strength/upper_body/home/preset]: ' +
        'section "carries" is retrieved and the matrix row has no assertion for it',
    )
    expect(failures.every((failure) => failure.includes('Goal "strength"'))).toBe(true)
  })

  it('a Goal preset that loses a section the matrix asserts', async () => {
    const { failures } = await runLane(matrix, {
      ...inputs,
      sectionsByGoal: {
        ...SECTIONS_BY_GOAL,
        conditioning: SECTIONS_BY_GOAL.conditioning.filter((section) => section !== 'core'),
      },
    })

    expect(failures).toContain(
      'tier "full" × Goal "conditioning" × Focus "power" [conditioning/power/full/preset]: ' +
        'the matrix asserts section "core" and retrieval did not return it',
    )
    expect(failures.every((failure) => failure.includes('Goal "conditioning"'))).toBe(true)
  })

  it('a tier that loses the equipment a section needs', async () => {
    const { failures } = await runLane(matrix, {
      ...inputs,
      equipmentByTier: {
        ...EQUIPMENT_BY_TIER,
        home: EQUIPMENT_BY_TIER.home.filter(
          (item) => item !== 'dumbbells' && item !== 'kettlebells',
        ),
      },
    })
    const emptied = failures.filter((failure) => failure.endsWith('resolved no candidates'))

    expect(emptied).toContain(
      'tier "home" × Goal "strength" × Focus "lower_body" ' +
        '[strength/lower_body/home/preset+carries]: section "carries" resolved no candidates',
    )
    expect(emptied.length).toBeGreaterThan(0)
    expect(failures.every((failure) => failure.startsWith('tier "home"'))).toBe(true)
  })
})

describe('the lane needs nothing but the repository', () => {
  it('opens no connection and reads no credential', async () => {
    const fetched = vi.fn(() => {
      throw new Error('the fast contract lane must not use the network')
    })
    vi.stubGlobal('fetch', fetched)
    vi.stubEnv('SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    vi.stubEnv('ANTHROPIC_API_KEY', '')

    const offline = await runLane(matrix, inputs)

    expect(offline).toEqual(result)
    expect(fetched).not.toHaveBeenCalled()
  })

  it('answers every retrieval from the in-memory double', async () => {
    const { retrieve, double } = createRetrieval(
      { athlete: everySection('minimal') },
      inputs.catalog,
      matrix.floor,
    )
    await retrieve('athlete', 'full_body')

    expect(double.requests()).toEqual([{ method: 'POST', path: '/rpc/generation_candidate_sets' }])
  })

  it('imports no database, HTTP or model client', () => {
    for (const path of [
      'src/test/generation-reliability/fast-contract-lane.ts',
      'src/test/candidates-double.ts',
      'src/test/seed-catalog.ts',
    ]) {
      const source = readFileSync(join(REPO_ROOT, path), 'utf8')
      expect(source, path).not.toMatch(/supabase-js|@anthropic-ai|process\.env|globalThis\.fetch\(/)
      expect(source, path).not.toMatch(/(?<![.\w])fetch\(/)
    }
  })
})
