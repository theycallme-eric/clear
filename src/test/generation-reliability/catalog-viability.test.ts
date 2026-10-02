/**
 * GR-03 / REQ-007 — catalog viability invariants.
 *
 * `npm run seed` holds the catalog to `scripts/catalog-seed/viability.mjs`;
 * this suite is what proves those checks bite. It runs them against the
 * transform as committed, where every one passes, and then recreates the two
 * defects the recovery started from — a selectable section with nothing tagged
 * for it, and a Minimal tier with no main work — and requires each to fail
 * with the cause in the message.
 *
 * Two modules are stood in for, because the conditions they produce cannot be
 * committed: `rules.mjs` gains a `section_type` no migration declares, and
 * `section-selectability.ts` marks a real section non-selectable so the screens
 * can be rendered without it. Everything else is the repository's own.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as reviewed from '../../../scripts/catalog-seed/reviewed.mjs'
import { build, main, presetsFrom, withViability } from '../../../scripts/catalog-seed/seed.mjs'
import { catalogOf, checkViability } from '../../../scripts/catalog-seed/viability.mjs'
import { REPO_ROOT } from '../../../scripts/gen-types/schema.mjs'
import { MATRIX_PATH } from '../../../scripts/generation-reliability/legal-state-matrix.mjs'
import { loadRetrievalRules } from '../../../scripts/generation-reliability/rules.mjs'
import { Constants } from '../../data/database.types'
import { ok } from '../../state/errors'
import * as onboarding from '../../state/onboarding'
import { QueryClient } from '../../state/query'
import { NON_SELECTABLE_SECTIONS } from '../../state/section-selectability'
import { locationsQueryKey, profileQueryKey } from '../../state/user-queries'
import { constraintsQueryKey } from '../../state/constraint-queries'
import { createFakeConstraintsClient } from '../constraints-double'
import { renderApp, signedIn } from '../render'
import {
  createFakeUserDataClient,
  fixtureLocation,
  FIXTURE_USER_ID,
  notOnboardedProfile,
  onboardedProfile,
} from '../user-data-double'

/** A section the screens must not offer, and one the enum does not have. */
const HIDDEN_SECTION = 'carries'
const NEW_SECTION = 'grip'

const added = vi.hoisted(() => ({ sections: [] as string[] }))

vi.mock('../../../scripts/generation-reliability/rules.mjs', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../scripts/generation-reliability/rules.mjs')>()

  return {
    ...actual,
    loadRetrievalRules: () => {
      const rules = actual.loadRetrievalRules()
      return {
        ...rules,
        enums: { ...rules.enums, section_type: [...rules.enums.section_type, ...added.sections] },
      }
    },
  }
})

vi.mock('../../state/section-selectability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../state/section-selectability')>()
  return { NON_SELECTABLE_SECTIONS: [...actual.NON_SELECTABLE_SECTIONS, 'carries'] }
})

const committedSelectability =
  await vi.importActual<typeof import('../../state/section-selectability')>(
    '../../state/section-selectability',
  )

/** The presets `npm run seed` loads, with the marker as it is committed. */
const presets = presetsFrom(onboarding, committedSelectability)

const { transformed, verification } = build()

type Transformed = typeof transformed
type Presets = typeof presets

/** The viability checks that fail for this catalog and these presets. */
function failures(catalog: Transformed = transformed, against: Presets = presets) {
  return withViability(catalog, verification, against).failures.filter(
    (entry) => entry.group === 'viability',
  )
}

/** The transform, with one change made to a copy of its definitions. */
function altered(
  change: (row: Transformed['definitions'][number]) => Partial<Transformed['definitions'][number]>,
): Transformed {
  return {
    ...transformed,
    definitions: transformed.definitions.map((row) => ({ ...row, ...change(row) })),
  }
}

/** Run the CLI without letting its report reach the test output. */
function run(argv: string[], against: Presets = presets): { code: number; output: string } {
  const lines: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    lines.push(String(chunk))
    return true
  })
  try {
    return { code: main(argv, against), output: lines.join('') }
  } finally {
    spy.mockRestore()
  }
}

afterEach(() => {
  added.sections = []
  vi.unstubAllGlobals()
})

describe('the committed catalog', () => {
  it('passes every viability invariant', () => {
    expect(failures()).toEqual([])
    expect(run(['--check']).code).toBe(0)
  })

  it('is checked for every section, advertised tier × Goal, and focus', () => {
    const names = withViability(transformed, verification, presets)
      .checks.filter((entry) => entry.group === 'viability')
      .map((entry) => entry.name)

    for (const section of Constants.public.Enums.section_type) {
      expect(names).toContain(`section — ${section}`)
    }
    for (const tier of onboarding.TIERS) {
      for (const goal of onboarding.GOALS) {
        expect(names).toContain(`preset — ${tier.value} × ${goal.value}`)
      }
    }
    for (const focus of Constants.public.Enums.session_focus) {
      expect(names).toContain(`retrieval — ${focus}`)
    }
  })

  it('marks nothing non-selectable, because every section has rows', () => {
    expect(committedSelectability.NON_SELECTABLE_SECTIONS).toEqual([])
  })

  it('records the strict and relaxed results the legal-state matrix holds', () => {
    // A second, independently produced source: the matrix is built from the
    // committed seed files, the record is held against the transform.
    const matrix = JSON.parse(readFileSync(join(REPO_ROOT, MATRIX_PATH), 'utf8')) as {
      cells: { tier: string; focus: string; section: string; strict: number; relaxed: number }[]
    }
    const recorded = reviewed.FOCUS_RETRIEVAL as Record<
      string,
      Record<string, Record<string, number[]>>
    >

    expect(matrix.cells).toHaveLength(
      Constants.public.Enums.session_focus.length *
        Constants.public.Enums.equipment_tier.length *
        Constants.public.Enums.section_type.length,
    )
    for (const cell of matrix.cells) {
      expect(recorded[cell.focus][cell.tier][cell.section], `${cell.focus}/${cell.tier}/${cell.section}`).toEqual([
        cell.strict,
        cell.relaxed,
      ])
    }
  })
})

describe('a selectable section with no catalog rows', () => {
  it('fails, naming the section, when a repaired section loses its tags', () => {
    // The condition the capture was in: `skill_power` in the enum and offered,
    // and no exercise tagged for it.
    const stripped = altered((row) => ({
      sections: row.sections.filter((section) => section !== 'skill_power'),
    }))

    const failed = failures(stripped)
    const section = failed.find((entry) => entry.name === 'section — skill_power')

    expect(section?.detail).toContain(
      'section_type "skill_power" is user-selectable and has zero catalog rows',
    )
    // Only that section is named as empty; the others still have their rows.
    expect(failed.filter((entry) => entry.name.startsWith('section — '))).toHaveLength(1)
  })

  it('fails every focus whose recorded result the change moved', () => {
    const stripped = altered((row) => ({
      sections: row.sections.filter((section) => section !== 'skill_power'),
    }))

    for (const focus of Constants.public.Enums.session_focus) {
      const retrieval = failures(stripped).find((entry) => entry.name === `retrieval — ${focus}`)
      expect(retrieval?.detail).toContain(`focus "${focus}", tier "full", section "skill_power"`)
      expect(retrieval?.detail).toContain('relaxed 0 (recorded 12)')
    }
  })
})

describe('an advertised tier × Goal preset with an empty required section', () => {
  it('fails, naming the cause, when Minimal loses its main-work eligibility', () => {
    // The other original defect: nothing usable with Minimal equipment is
    // main work. The ledger's eight rows are put back as the capture had them.
    const minimal = onboarding.EQUIPMENT_BY_TIER.minimal
    const stripped = altered((row) =>
      row.equipmentOptions.some((item) => minimal.includes(item))
        ? {
            sections: row.sections.filter((section) => section !== 'primary_lift'),
            canBePrimary: false,
          }
        : {},
    )

    const failed = failures(stripped)
    const preset = failed.find((entry) => entry.name === 'preset — minimal × strength')
    const mainWork = failed.find((entry) => entry.name === 'main work — minimal')

    expect(preset?.detail).toContain(
      'tier "minimal", Goal "strength": required section "primary_lift" has no candidate',
    )
    expect(mainWork?.detail).toContain('tier "minimal": no primary_lift exercise usable with')
    expect(mainWork?.detail).toContain('is marked can_be_primary')
    // Conditioning's preset never asked for main work, so it is not blamed.
    expect(failed.map((entry) => entry.name)).not.toContain('preset — minimal × conditioning')
  })

  it('fails when Minimal main work exists but none of it can anchor a session', () => {
    const minimal = onboarding.EQUIPMENT_BY_TIER.minimal
    const stripped = altered((row) =>
      row.equipmentOptions.some((item) => minimal.includes(item)) ? { canBePrimary: false } : {},
    )

    const failed = failures(stripped)

    expect(failed.map((entry) => entry.name)).toEqual(['main work — minimal'])
    expect(failed[0].detail).toContain('Goal "strength", "hypertrophy", "balanced"')
  })

  it('makes `npm run seed` exit 1 naming tier, Goal and section', () => {
    // No carry can be done with Minimal equipment, so a preset that requires
    // carries advertises a combination the catalog cannot serve.
    const { code, output } = run(['--check'], {
      ...presets,
      sectionsByGoal: {
        ...presets.sectionsByGoal,
        strength: [...presets.sectionsByGoal.strength, 'carries'],
      },
    })

    expect(code).toBe(1)
    expect(output).toContain('✗ [viability] preset — minimal × strength')
    expect(output).toContain('tier "minimal", Goal "strength": required section "carries" has no candidate')
    expect(output).toContain('Nothing was written.')
    expect(output).not.toContain('preset — home × strength')
  })
})

describe('a section_type value without catalog support', () => {
  it('makes `npm run seed` exit 1 naming the section', () => {
    added.sections = [NEW_SECTION]

    const { code, output } = run(['--check'])

    expect(code).toBe(1)
    expect(output).toContain(`✗ [viability] section — ${NEW_SECTION}`)
    expect(output).toContain(
      `section_type "${NEW_SECTION}" is user-selectable and has zero catalog rows`,
    )
  })

  it('passes once the value is explicitly marked non-selectable', () => {
    added.sections = [NEW_SECTION]
    const marked = { ...presets, nonSelectableSections: [NEW_SECTION] }

    expect(failures(transformed, marked)).toEqual([])
    expect(run(['--check'], marked).code).toBe(0)
  })

  it('refuses a marker on a section a Goal still presets, or on no section at all', () => {
    const failed = failures(transformed, {
      ...presets,
      nonSelectableSections: ['core', 'not_a_section'],
    })
    const markers = failed.find((entry) => entry.name === 'non-selectable markers')

    expect(markers?.detail).toContain(
      'Goal "strength" presets section "core", which is marked non-selectable',
    )
    expect(markers?.detail).toContain(
      '"not_a_section" is marked non-selectable and is not a section_type',
    )
  })
})

describe('a non-selectable section is not offered', () => {
  // This file stands in a marker naming `carries`; see the mock above.
  const offered = Constants.public.Enums.section_type.filter(
    (section) => section !== HIDDEN_SECTION,
  )
  const hiddenLabel = 'Carries'

  it('is left out of the one list both screens render', () => {
    expect(NON_SELECTABLE_SECTIONS).toContain(HIDDEN_SECTION)
    expect(onboarding.SECTIONS.map((section) => section.value)).toEqual(offered)
  })

  it('is not offered by onboarding', async () => {
    const user = userEvent.setup()
    renderApp(
      ['/onboarding'],
      signedIn({
        userData: createFakeUserDataClient({
          profile: async () => ok(notOnboardedProfile()),
          locations: async () => ok([]),
        }),
        queryClient: new QueryClient(),
      }),
    )
    const next = () => screen.getByRole('button', { name: /^(Next|Skip)$/ })

    await screen.findByRole('heading', { level: 2, name: onboarding.STEP_TITLES.location })
    await user.click(screen.getByRole('radio', { name: 'Home gym' }))
    await user.click(next())
    await screen.findByRole('heading', { level: 2, name: onboarding.STEP_TITLES.experience })
    await user.click(screen.getByRole('radio', { name: 'Some experience' }))
    await user.click(next())
    await screen.findByRole('heading', { level: 2, name: onboarding.STEP_TITLES.goals })
    await user.click(screen.getByRole('radio', { name: 'Strength' }))

    for (const section of onboarding.SECTIONS) {
      expect(screen.getByRole('checkbox', { name: section.label })).toBeVisible()
    }
    expect(screen.queryByRole('checkbox', { name: hiddenLabel })).toBeNull()
  })

  it('is not offered by Settings', async () => {
    const cache = new QueryClient()
    cache.setData(profileQueryKey(FIXTURE_USER_ID), onboardedProfile())
    cache.setData(locationsQueryKey(FIXTURE_USER_ID), [fixtureLocation()])
    cache.setData(constraintsQueryKey(FIXTURE_USER_ID), [])

    renderApp(
      ['/settings'],
      signedIn({
        queryClient: cache,
        userData: createFakeUserDataClient(),
        constraints: createFakeConstraintsClient({ stored: [] }),
      }),
    )

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeVisible()
    for (const section of onboarding.SECTIONS) {
      expect(screen.getByRole('checkbox', { name: section.label })).toBeVisible()
    }
    expect(screen.queryByRole('checkbox', { name: hiddenLabel })).toBeNull()
  })
})

describe('the invariants need nothing but the repository', () => {
  it('open no connection and read no credential', () => {
    const fetched = vi.fn(() => {
      throw new Error('the viability invariants must not use the network')
    })
    vi.stubGlobal('fetch', fetched)
    vi.stubEnv('SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    vi.stubEnv('ANTHROPIC_API_KEY', '')

    try {
      const checks = checkViability({
        rules: loadRetrievalRules(),
        catalog: catalogOf(transformed),
        presets,
        recorded: reviewed.FOCUS_RETRIEVAL,
      })

      expect(checks.every((entry) => entry.ok)).toBe(true)
      expect(run(['--check']).code).toBe(0)
      expect(fetched).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('import no database, HTTP or model client', () => {
    for (const path of ['scripts/catalog-seed/viability.mjs', 'scripts/catalog-seed/seed.mjs']) {
      const source = readFileSync(join(REPO_ROOT, path), 'utf8')
      expect(source).not.toMatch(/supabase-js|@anthropic-ai|process\.env|fetch\(/)
    }
  })
})
