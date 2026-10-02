/**
 * GR-02 / REQ-005, REQ-006 — the configuration dispositions.
 *
 * `npm run gr:dispositions` writes `docs/process/generation-reliability/
 * configuration-dispositions.json`: for every legal configuration, whether the
 * seed *plus the section-mapping ledger* supports it or whether it is prevented
 * at the preference boundary, and by which choice. This suite builds the same
 * projection from the same inputs and holds the committed bytes to it, so a
 * ledger row, a preset or a seed row that changes without a regeneration fails
 * here as well as under `--check`.
 *
 * It is a projection, and since the ledger was applied to the seed it projects
 * nothing new: the committed seed already carries every row. The unrepaired
 * baseline it is compared with is rebuilt here from the pre-change capture.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadSnapshot } from '../../../scripts/catalog-seed/sources.mjs'
import { REPO_ROOT } from '../../../scripts/gen-types/schema.mjs'
import {
  DISPOSITIONS,
  DISPOSITIONS_PATH,
  buildDispositions,
  checkDispositions,
  validateDispositions,
} from '../../../scripts/generation-reliability/dispositions.mjs'
import { buildMatrix, serializeMatrix } from '../../../scripts/generation-reliability/matrix.mjs'
import { loadRetrievalRules } from '../../../scripts/generation-reliability/rules.mjs'
import {
  loadLedger,
  projectCatalog,
} from '../../../scripts/generation-reliability/section-ledger.mjs'
import { Constants } from '../../data/database.types'
import { EQUIPMENT, EQUIPMENT_BY_TIER, GOALS, SECTIONS_BY_GOAL, TIERS } from '../../state/onboarding'
import { seededCatalog } from '../seed-catalog'

const ENUMS = Constants.public.Enums

const rules = loadRetrievalRules()
const ledger = loadLedger(REPO_ROOT)
const seeded = seededCatalog()
const catalog = projectCatalog(seeded, ledger)

/**
 * The catalog before the ledger was applied: the seed's rows with the
 * pre-change capture's tags. The committed seed now carries the ledger, so the
 * unrepaired baseline is rebuilt from the capture rather than read from it.
 */
const captured = new Map(loadSnapshot().definitions.map((row) => [row.id, row]))
const seed = seeded.map((row) => ({
  ...row,
  sections: captured.get(row.id)?.sections ?? [],
  canBePrimary: captured.get(row.id)?.canBePrimary ?? false,
}))

const vocabularies = {
  rules,
  equipmentByTier: EQUIPMENT_BY_TIER,
  sectionsByGoal: SECTIONS_BY_GOAL,
  equipment: EQUIPMENT.map((item) => item.value),
}

/** What the catalog served before the repair, and what it serves with the ledger applied. */
const current = buildMatrix({ ...vocabularies, catalog: seed })
const matrix = buildMatrix({ ...vocabularies, catalog })

const dispositions = buildDispositions({ matrix, catalog, ledgerRows: ledger.rows.length })
const contents = serializeMatrix(dispositions)
const committed = readFileSync(join(REPO_ROOT, DISPOSITIONS_PATH), 'utf8')

const unconstrained = dispositions.configurations.filter((row) => row.constraint === null)

describe('the committed dispositions', () => {
  it('are byte-identical to what the seed and the ledger produce', () => {
    // Compared as a boolean: a failed string comparison of a file this size
    // prints a diff nobody can read.
    expect(committed === contents, 'stale — run `npm run gr:dispositions`').toBe(true)
    expect(checkDispositions(committed, contents, matrix, rules.enums)).toEqual([])
  })

  it('are deterministic', () => {
    expect(
      serializeMatrix(buildDispositions({ matrix, catalog, ledgerRows: ledger.rows.length })),
    ).toBe(contents)
  })

  it('are a projection: the ledger changes the catalog they are computed from', () => {
    expect(catalog).toHaveLength(seed.length)
    expect(catalog).not.toEqual(seed)
    expect(dispositions.ledgerRows).toBe(ledger.rows.length)
    expect(dispositions.sources).toContain(
      'docs/process/generation-reliability/section-mapping-ledger.json',
    )
  })
})

describe('every legal configuration', () => {
  it('has exactly one disposition, from the closed set', () => {
    expect([...DISPOSITIONS]).toEqual(['supported', 'prevented'])
    expect(validateDispositions(dispositions, matrix, rules.enums)).toEqual([])

    expect(dispositions.configurations.map((row) => row.id)).toEqual(
      matrix.states.map((state) => state.id),
    )
    for (const row of dispositions.configurations) {
      expect(DISPOSITIONS, row.id).toContain(row.disposition)
    }
  })

  it('covers every goal × focus × tier × saved section profile', () => {
    for (const goal of ENUMS.goal_preset) {
      for (const focus of ENUMS.session_focus) {
        for (const tier of ENUMS.equipment_tier) {
          const rows = unconstrained.filter(
            (row) => row.goal === goal && row.focus === focus && row.tier === tier,
          )
          const profiles = current.states.filter(
            (state) =>
              state.goal === goal &&
              state.focus === focus &&
              state.tier === tier &&
              state.constraint === null,
          )

          expect(rows.map((row) => row.profile), `${goal}/${focus}/${tier}`).toEqual(
            profiles.map((state) => state.profile),
          )
        }
      }
    }
  })

  it('is supported exactly where every required section has a candidate', () => {
    for (const row of dispositions.configurations) {
      const state = matrix.states.find((candidate) => candidate.id === row.id)

      expect(row.disposition === 'supported', row.id).toBe(state?.failsBeforeComposition === false)
      if (row.disposition === 'supported') {
        expect(row.preventedBy, row.id).toEqual([])
        for (const section of state?.sections ?? []) {
          expect(section.relaxed, `${row.id} ${section.section}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('names the incompatible choice and the reason wherever it is prevented', () => {
    const prevented = dispositions.configurations.filter((row) => row.disposition === 'prevented')
    expect(prevented.length).toBeGreaterThan(0)

    for (const row of prevented) {
      // One cause per empty section, so no section's refusal goes unexplained.
      expect(row.preventedBy.map((cause) => cause.section), row.id).toEqual(row.emptySections)
      for (const cause of row.preventedBy) {
        expect(cause.incompatibleChoice, row.id).toMatch(/\S/)
        expect(cause.reason, row.id).toMatch(/\S/)
      }
    }
  })

  it('leaves no unconstrained configuration prevented by anything but a named section', () => {
    for (const row of unconstrained.filter((entry) => entry.disposition === 'prevented')) {
      for (const cause of row.preventedBy) {
        expect(cause.incompatibleChoice, row.id).toBe(
          `section ${cause.section} with ${row.tier} equipment`,
        )
        expect(dispositions.preventions.map((entry) => entry.id), row.id).toContain(
          `${cause.section}/${row.tier}`,
        )
      }
    }
  })
})

describe('the projected matrix', () => {
  it('has no unsupported section × tier that is not a recorded prevention', () => {
    const empty = matrix.sectionTiers.filter((row) => row.candidates === 0).map((row) => row.id)

    expect(dispositions.preventions.map((row) => row.id)).toEqual(empty)
    for (const row of matrix.sectionTiers) expect(row.catalogRows, row.id).toBeGreaterThan(0)
  })

  it('prevents carries with Minimal equipment, and nothing else', () => {
    expect(dispositions.preventions).toHaveLength(1)

    const [carries] = dispositions.preventions
    expect(carries).toMatchObject({
      id: 'carries/minimal',
      section: 'carries',
      tier: 'minimal',
      equipment: [...EQUIPMENT_BY_TIER.minimal],
      incompatibleChoice: 'section carries with minimal equipment',
      requiresOneOf: ['dumbbells', 'kettlebells'],
    })
    expect(carries.reason).toMatch(/dumbbells or kettlebells/)

    // Only a profile that switches carries on, and only at Minimal.
    const prevented = unconstrained.filter((row) => row.disposition === 'prevented')
    expect(prevented).toHaveLength(carries.configurations)
    for (const row of prevented) {
      expect(row.tier, row.id).toBe('minimal')
      expect(row.emptySections, row.id).toEqual(['carries'])
      expect(['preset+carries', 'all-sections'], row.id).toContain(row.profile)
    }
  })

  it.each(GOALS.map((goal) => goal.value))(
    'gives Minimal × %s a candidate in every required section at every Focus',
    (goal) => {
      const rows = matrix.states.filter(
        (state) =>
          state.goal === goal &&
          state.tier === 'minimal' &&
          state.profile === 'preset' &&
          state.constraint === null,
      )
      expect(rows.map((row) => row.focus)).toEqual([...ENUMS.session_focus])

      for (const row of rows) {
        expect(row.sections.map((section) => section.section), row.id).toEqual(
          ENUMS.section_type.filter((section) => SECTIONS_BY_GOAL[goal].includes(section)),
        )
        for (const section of row.sections) {
          expect(section.relaxed, `${row.id} ${section.section}`).toBeGreaterThan(0)
        }
        expect(row.emptySections, row.id).toEqual([])
        expect(row.classification, row.id).not.toBe('unsupported-product-state')
      }
    },
  )

  it('serves Minimal main work from Minimal equipment alone', () => {
    const minimal = EQUIPMENT_BY_TIER.minimal
    const mainWork = catalog.filter(
      (row) =>
        row.sections.includes('primary_lift') &&
        row.equipmentOptions.some((item) => minimal.includes(item)),
    )

    expect(mainWork.length).toBeGreaterThan(0)
    for (const cell of matrix.cells.filter(
      (row) => row.tier === 'minimal' && row.section === 'primary_lift',
    )) {
      expect(cell.relaxed, cell.id).toBe(mainWork.length)
    }
    // Each is there because a ledger row put it there, not because the seed did.
    for (const row of mainWork) {
      expect(ledger.rows.map((entry) => entry.id), row.id).toContain(row.id)
      expect(row.canBePrimary, row.id).toBe(true)
    }
  })

  it('supports every advertised tier × Goal at every Focus', () => {
    for (const { value: tier } of TIERS) {
      for (const { value: goal } of GOALS) {
        const preset = dispositions.presets.find((row) => row.id === `${tier}/${goal}`)

        expect(preset?.disposition, `${tier}/${goal}`).toBe('supported')
        expect(preset?.focuses, `${tier}/${goal}`).toEqual([...ENUMS.session_focus])
      }
    }
    expect(dispositions.summary.presets).toEqual({
      supported: ENUMS.equipment_tier.length * ENUMS.goal_preset.length,
      prevented: 0,
      unresolved: 0,
    })
  })

  it('repairs states and breaks none: nothing the seed supports is lost', () => {
    for (const before of current.states.filter((state) => state.constraint === null)) {
      const after = matrix.states.find((state) => state.id === before.id)

      if (!before.failsBeforeComposition) {
        expect(after?.failsBeforeComposition, before.id).toBe(false)
      }
      for (const section of before.sections) {
        const projected = after?.sections.find((entry) => entry.section === section.section)
        expect(projected?.relaxed, `${before.id} ${section.section}`).toBeGreaterThanOrEqual(
          section.relaxed,
        )
      }
    }
  })
})

describe('the check', () => {
  const parsed = () => JSON.parse(committed) as typeof dispositions

  it('fails when the committed file is missing or stale', () => {
    expect(checkDispositions(null, contents, matrix, rules.enums)).toHaveLength(1)

    const stale = contents.replace('"ledgerRows": ', '"ledgerRows": 1')
    expect(stale).not.toBe(contents)
    expect(checkDispositions(stale, contents, matrix, rules.enums).join('\n')).toMatch(/stale/)
  })

  it('fails when any legal configuration is missing', () => {
    for (const index of [0, Math.floor(matrix.states.length / 2), matrix.states.length - 1]) {
      const missing = parsed()
      const [removed] = missing.configurations.splice(index, 1)

      expect(validateDispositions(missing, matrix, rules.enums)).toEqual([
        `configuration ${removed.id} has no disposition`,
      ])
    }

    const none = parsed()
    none.configurations = []
    expect(validateDispositions(none, matrix, rules.enums)).toHaveLength(matrix.states.length)
  })

  it('fails when the projection gains a state the file does not record', () => {
    const grown = {
      states: [...matrix.states, { id: 'strength/power/minimal/new', failsBeforeComposition: false }],
    }

    expect(validateDispositions(parsed(), grown, rules.enums)).toEqual([
      'configuration strength/power/minimal/new has no disposition',
    ])
  })

  it.each(['other', 'unresolved', '', null])('fails when a disposition is %j', (value) => {
    const tampered = parsed()
    ;(tampered.configurations[0] as { disposition: unknown }).disposition = value

    expect(validateDispositions(tampered, matrix, rules.enums).join('\n')).toMatch(
      /is neither supported nor prevented/,
    )
  })

  it('fails when a prevented configuration does not name its choice or its reason', () => {
    const index = dispositions.configurations.findIndex((row) => row.disposition === 'prevented')
    expect(index).toBeGreaterThan(-1)

    const noCause = parsed()
    noCause.configurations[index].preventedBy = []
    expect(validateDispositions(noCause, matrix, rules.enums).join('\n')).toMatch(
      /is prevented without a reason/,
    )

    const noChoice = parsed()
    noChoice.configurations[index].preventedBy[0].incompatibleChoice = ' '
    expect(validateDispositions(noChoice, matrix, rules.enums).join('\n')).toMatch(
      /without naming the incompatible choice/,
    )

    const noReason = parsed()
    noReason.configurations[index].preventedBy[0].reason = ''
    expect(validateDispositions(noReason, matrix, rules.enums).join('\n')).toMatch(
      /is prevented without a reason/,
    )
  })

  it('fails when a disposition contradicts the projected matrix', () => {
    const index = dispositions.configurations.findIndex((row) => row.disposition === 'prevented')

    const wishful = parsed()
    wishful.configurations[index].disposition = 'supported'
    wishful.configurations[index].preventedBy = []
    expect(validateDispositions(wishful, matrix, rules.enums).join('\n')).toMatch(
      /recorded as supported but has an empty section/,
    )

    const needless = parsed()
    const supported = needless.configurations.find((row) => row.disposition === 'supported')
    expect(supported).toBeDefined()
    if (supported !== undefined) {
      supported.disposition = 'prevented'
      supported.preventedBy = [{ section: 'core', incompatibleChoice: 'a choice', reason: 'a reason' }]
    }
    expect(validateDispositions(needless, matrix, rules.enums).join('\n')).toMatch(
      /recorded as prevented but can generate/,
    )
  })

  it('fails when an advertised onboarding combination is neither supported nor prevented', () => {
    const missing = parsed()
    missing.presets = missing.presets.filter((row) => row.id !== 'minimal/strength')
    expect(validateDispositions(missing, matrix, rules.enums)).toEqual([
      'onboarding combination minimal/strength has no disposition',
    ])

    const undecided = parsed()
    const preset = undecided.presets.find((row) => row.id === 'minimal/strength')
    if (preset !== undefined) preset.disposition = 'unresolved'
    expect(validateDispositions(undecided, matrix, rules.enums).join('\n')).toMatch(
      /onboarding combination minimal\/strength is neither supported nor prevented/,
    )

    const grown = { ...rules.enums, equipment_tier: [...rules.enums.equipment_tier, 'garage'] }
    expect(validateDispositions(parsed(), matrix, grown).join('\n')).toMatch(
      /onboarding combination garage\/strength has no disposition/,
    )
  })

  it('refuses to call a section with no catalog rows a prevented preference', () => {
    // The catalog as it was before the repair: three sections are empty at
    // every tier, and no choice of the athlete's explains that.
    const unrepaired = buildDispositions({ matrix: current, catalog: seed, ledgerRows: 0 })
    const unresolved = unrepaired.configurations.filter((row) => row.disposition === 'unresolved')

    expect(unresolved.length).toBeGreaterThan(0)
    for (const row of unresolved) {
      expect(
        row.emptySections.some((section) =>
          ['skill_power', 'carries', 'stability_balance'].includes(section),
        ),
        row.id,
      ).toBe(true)
    }
    expect(validateDispositions(unrepaired, current, rules.enums).join('\n')).toMatch(
      /is neither supported nor prevented: "unresolved"/,
    )
  })
})
