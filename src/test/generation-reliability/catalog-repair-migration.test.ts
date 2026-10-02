/**
 * GR-02 / REQ-004, REQ-005 — the section-mapping ledger, applied.
 *
 * The ledger's rows are the one source for three committed things: the repair
 * migration, the seed, and the rollback. This file holds each of them to the
 * ledger, so none can be edited on its own:
 *
 *   * the migration is byte-identical to what the ledger renders, and read back
 *     from its own text it says what the ledger's rows say;
 *   * run over the pre-change capture it lands every row on its `after`, leaves
 *     every other exercise alone, and a second run changes nothing;
 *   * it holds no statement that takes catalog data away;
 *   * the seed is the capture with the same changes applied, 140 rows;
 *   * the rollback puts the capture back.
 *
 * There is no database here. `applyChanges` is the migration's `update` in
 * JavaScript, and what it is run with is parsed out of the committed SQL, not
 * taken from the ledger — so the proof is of the file that will be applied.
 * That the SQL means what the model says is a reading of one statement, which
 * the file is written to make short.
 *
 * The last blocks are REQ-005 and the regenerated matrix: the three sections
 * have rows, and Minimal main work resolves from equipment the tier has.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { REPO_ROOT, loadSnapshot } from '../../../scripts/catalog-seed/sources.mjs'
import { buildRepair } from '../../../scripts/generation-reliability/catalog-repair-migration.mjs'
import {
  MIGRATION_PATH,
  ROLLBACK_SQL_PATH,
  applyChanges,
  destructiveStatements,
  ledgerChanges,
  parseMigration,
  parseRollback,
  renderMigration,
} from '../../../scripts/generation-reliability/catalog-repair.mjs'
import { MATRIX_PATH } from '../../../scripts/generation-reliability/legal-state-matrix.mjs'
import {
  LEDGER_SECTIONS,
  MAIN_WORK_SECTION,
  loadLedger,
} from '../../../scripts/generation-reliability/section-ledger.mjs'
import { Constants } from '../../data/database.types'
import { EQUIPMENT_BY_TIER } from '../../state/onboarding'
import { seededCatalog } from '../seed-catalog'

const ROLLBACK_DOC_PATH = 'docs/backend/catalog-section-repair-rollback.md'

const read = (path: string) => readFileSync(join(REPO_ROOT, path), 'utf8')

interface Membership {
  sections: string[]
  canBePrimary: boolean
}

const ledger = loadLedger(REPO_ROOT)
const migration = read(MIGRATION_PATH)
const rollback = read(ROLLBACK_SQL_PATH)
const catalog = seededCatalog()

const capture = new Map<string, Membership>(
  loadSnapshot().definitions.map((row) => [
    row.id,
    { sections: row.sections, canBePrimary: row.canBePrimary },
  ]),
)
const seed = new Map<string, Membership>(
  catalog.map((row) => [row.id, { sections: [...row.sections], canBePrimary: row.canBePrimary }]),
)

/** What the committed SQL says, as opposed to what the ledger would render. */
const committedChanges = parseMigration(migration)
const once = applyChanges(capture, committedChanges)
const twice = applyChanges(once.catalog, committedChanges)

const sorted = (values: readonly string[]) => [...values].sort()

describe('the migration and the ledger', () => {
  it('is byte-identical to what the ledger renders', () => {
    expect(migration).toBe(renderMigration(ledger))
  })

  it('and the rollback are both current', () => {
    for (const artifact of buildRepair()) {
      expect(read(artifact.label) === artifact.contents, `${artifact.label} is stale`).toBe(true)
    }
  })

  it('names, in its own text, exactly the changes the ledger rows make', () => {
    expect(committedChanges).toEqual(ledgerChanges(ledger))
    expect(committedChanges).toHaveLength(ledger.rows.length)
  })

  it('fails when the ledger gains, loses or changes a row', () => {
    const [first, ...rest] = ledger.rows
    expect(renderMigration({ rows: rest })).not.toBe(migration)
    expect(
      renderMigration({
        rows: [
          { ...first, after: { ...first.after, sections: [...first.after.sections, 'core'] } },
          ...rest,
        ],
      }),
    ).not.toBe(migration)
  })

  it('lands every ledger row on its after, from the pre-change capture', () => {
    for (const row of ledger.rows) {
      const result = once.catalog.get(row.id)
      expect(sorted(result?.sections ?? []), row.id).toEqual(sorted(row.after.sections))
      expect(result?.canBePrimary, row.id).toBe(row.after.canBePrimary)
    }
  })

  it('changes only rows named in the ledger', () => {
    const named = new Set(ledger.rows.map((row) => row.id))
    expect(sorted(once.updated)).toEqual(sorted([...named]))

    expect(once.catalog.size).toBe(capture.size)
    for (const [id, captured] of capture) {
      if (!named.has(id)) expect(once.catalog.get(id), id).toEqual(captured)
    }
  })

  it('only adds: no captured tag or primary eligibility is taken away', () => {
    for (const [id, captured] of capture) {
      const result = once.catalog.get(id)
      for (const section of captured.sections) expect(result?.sections, id).toContain(section)
      if (captured.canBePrimary) expect(result?.canBePrimary, id).toBe(true)
    }
  })

  it('refuses to render a row that removes a tag or withdraws primary eligibility', () => {
    const [first] = ledger.rows
    expect(() =>
      ledgerChanges({ rows: [{ ...first, after: { ...first.after, sections: [] } }] }),
    ).toThrow(/additive/)
    expect(() =>
      ledgerChanges({
        rows: [
          {
            ...first,
            before: { ...first.before, canBePrimary: true },
            after: { ...first.after, canBePrimary: false },
          },
        ],
      }),
    ).toThrow(/additive/)
  })
})

describe('the migration, applied twice', () => {
  it('updates no row the second time', () => {
    expect(once.updated).toHaveLength(ledger.rows.length)
    expect(twice.updated).toEqual([])
  })

  it('produces the same catalog as applying it once', () => {
    expect([...twice.catalog]).toEqual([...once.catalog])
  })

  it('finishes a half-applied catalog without repeating a tag', () => {
    const half = applyChanges(capture, committedChanges.slice(0, 10))
    const finished = applyChanges(half.catalog, committedChanges)

    expect(finished.updated).toHaveLength(ledger.rows.length - 10)
    expect([...finished.catalog]).toEqual([...once.catalog])
    for (const [id, membership] of finished.catalog) {
      expect(new Set(membership.sections).size, id).toBe(membership.sections.length)
    }
  })

  it('updates nothing on a catalog the seed has already repaired', () => {
    expect(applyChanges(seed, committedChanges).updated).toEqual([])
  })
})

describe('the migration, as SQL', () => {
  it('contains no DELETE, TRUNCATE or DROP', () => {
    expect(destructiveStatements(migration)).toEqual([])
    expect(destructiveStatements('delete from public.exercise_definitions;')).toEqual(['delete'])
    expect(destructiveStatements('-- nothing to drop\nselect 1;')).toEqual([])
  })

  it('is one update of exercise_definitions and nothing else', () => {
    const code = migration
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n')
    const statements = code
      .split(';')
      .map((statement) => statement.trim())
      .filter((statement) => statement !== '')

    expect(statements).toHaveLength(1)
    expect(statements[0]).toMatch(/^update public\.exercise_definitions as d\b/)
    expect(code).not.toMatch(/\b(insert|alter|create|grant|revoke)\b/i)
  })

  it('guards the update so a repaired row is not selected again', () => {
    expect(migration).toMatch(/not \(d\.sections @> r\.add_sections\)/)
    expect(migration).toMatch(/r\.make_primary and not d\.can_be_primary/)
  })

  it('only writes section_type values', () => {
    for (const change of committedChanges) {
      for (const section of change.add) {
        expect(Constants.public.Enums.section_type, change.id).toContain(section)
      }
    }
  })
})

describe('the seed and the ledger', () => {
  it('still seeds 140 exercises', () => {
    expect(catalog).toHaveLength(140)
    expect(sorted([...seed.keys()])).toEqual(sorted([...capture.keys()]))
  })

  it('is the capture with the ledger applied — the catalog the migration produces', () => {
    for (const [id, membership] of once.catalog) expect(seed.get(id), id).toEqual(membership)
  })

  it('carries every ledger row as its after and nothing else changed', () => {
    const rows = new Map(ledger.rows.map((row) => [row.id, row]))
    for (const [id, seeded] of seed) {
      const row = rows.get(id)
      if (row === undefined) {
        expect(seeded, id).toEqual(capture.get(id))
      } else {
        expect(sorted(seeded.sections), id).toEqual(sorted(row.after.sections))
        expect(seeded.canBePrimary, id).toBe(row.after.canBePrimary)
      }
    }
  })
})

describe('the rollback', () => {
  const restored = parseRollback(rollback)

  it('restores, for every ledger row, exactly what the pre-change capture holds', () => {
    expect(sorted([...restored.keys()])).toEqual(sorted(ledger.rows.map((row) => row.id)))
    for (const [id, membership] of restored) expect(membership, id).toEqual(capture.get(id))
  })

  it('takes the repaired catalog back to the capture', () => {
    const rolledBack = new Map([...seed].map(([id, seeded]) => [id, restored.get(id) ?? seeded]))
    expect([...rolledBack]).toEqual([...capture])
  })

  it('removes no row', () => {
    expect(destructiveStatements(rollback)).toEqual([])
  })

  it('has a committed procedure that names the script, the capture and the migration', () => {
    const procedure = read(ROLLBACK_DOC_PATH)
    expect(procedure).toContain(ROLLBACK_SQL_PATH)
    expect(procedure).toContain(ledger.capture)
    expect(procedure).toContain(MIGRATION_PATH)
  })
})

describe('the repaired catalog', () => {
  const matrix = JSON.parse(read(MATRIX_PATH)) as {
    sectionTiers: { id: string; section: string; tier: string; candidates: number }[]
    states: {
      id: string
      goal: string
      tier: string
      profile: string
      constraint: unknown
      emptySections: string[]
      failsBeforeComposition: boolean
    }[]
  }

  it.each(LEDGER_SECTIONS)('has %s exercises in the seed', (section) => {
    expect(catalog.filter((row) => row.sections.includes(section)).length).toBeGreaterThan(0)
  })

  it.each(LEDGER_SECTIONS)('has %s candidates in the regenerated matrix', (section) => {
    const rows = matrix.sectionTiers.filter((row) => row.section === section)
    expect(rows.some((row) => row.candidates > 0)).toBe(true)
    expect(rows.find((row) => row.tier === 'full')?.candidates).toBeGreaterThan(0)
  })

  it.each(['strength', 'hypertrophy', 'conditioning', 'balanced'])(
    'resolves every default section for %s at the Minimal preset',
    (goal) => {
      const rows = matrix.states.filter(
        (state) =>
          state.goal === goal &&
          state.tier === 'minimal' &&
          state.profile === 'preset' &&
          state.constraint === null,
      )
      expect(rows).toHaveLength(Constants.public.Enums.session_focus.length)

      for (const row of rows) {
        expect(row.emptySections, row.id).toEqual([])
        expect(row.failsBeforeComposition, row.id).toBe(false)
      }
    },
  )

  it('offers Minimal main work that needs nothing but Minimal equipment', () => {
    const minimal: readonly string[] = EQUIPMENT_BY_TIER.minimal
    const offered = catalog.filter(
      (row) =>
        row.sections.includes(MAIN_WORK_SECTION) &&
        row.equipmentOptions.some((item) => minimal.includes(item)),
    )

    expect(offered.length).toBeGreaterThan(0)
    // Each is there because a ledger row put it there, and the row's evidence
    // is that it can be done with bodyweight.
    const rows = new Map(ledger.rows.map((row) => [row.id, row]))
    for (const exercise of offered) {
      expect(rows.get(exercise.id)?.evidence, exercise.id).toContain('equipment:bodyweight')
      expect(exercise.equipmentOptions, exercise.id).toContain('bodyweight')
      expect(exercise.canBePrimary, exercise.id).toBe(true)
    }
  })

  it('leaves every tier with every candidate it had before the repair', () => {
    for (const [tier, equipment] of Object.entries(EQUIPMENT_BY_TIER)) {
      const available: readonly string[] = equipment
      for (const exercise of catalog) {
        if (!exercise.equipmentOptions.some((item) => available.includes(item))) continue
        for (const section of capture.get(exercise.id)?.sections ?? []) {
          expect(exercise.sections, `${tier}/${section}/${exercise.id}`).toContain(section)
        }
      }
    }
  })
})
