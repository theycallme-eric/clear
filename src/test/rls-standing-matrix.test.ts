import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  TABLE_DISPOSITIONS,
  auditSchema,
  readSchema,
  standingMatrix,
} from '../../scripts/e2e/dispositions.mjs'
import { forgedRow, rowSelector } from '../../scripts/e2e/namespace.mjs'

/**
 * ENV-07 — the matrix is data-driven, so adding a user-owned table requires an
 * explicit standing-test disposition.
 *
 * The live cross-user assertions live in `e2e/rls.spec.ts` and need a database.
 * *Coverage* does not, and coverage is the half that rots: a table added six
 * months from now with a wrong policy is caught by nobody if the matrix is a
 * hand-written list that nobody re-reads. So the register is compared against
 * the migrations here, on every pull request, with no credentials — and the
 * same comparison runs again inside the E2E suite.
 */

const repoRoot = resolve(import.meta.dirname, '../..')

describe('every table in the schema has a standing disposition (ENV-07)', () => {
  const schema = readSchema(repoRoot)

  it('reads the tables and their RLS state out of the migrations', () => {
    // A parser that silently matched nothing would make every assertion below
    // vacuously true, which is the failure mode this guards.
    expect(schema.tables.length).toBeGreaterThan(10)
    expect(schema.tables).toContain('profiles')
    expect(schema.rlsEnabled).toContain('profiles')
  })

  it('leaves no table undisposed, and no disposition without a table', () => {
    const audit = auditSchema(schema)

    expect(audit.undisposed, 'add a disposition in scripts/e2e/dispositions.mjs')
      .toEqual([])
    expect(audit.absentFromSchema, 'a disposition outlived its table').toEqual([])
    expect(audit.unprotected, 'called user-owned, never given RLS').toEqual([])
  })

  it('makes every disposition a decision, not a default', () => {
    for (const entry of TABLE_DISPOSITIONS) {
      expect(['cross-user', 'shared-reference'], entry.table).toContain(
        entry.standing,
      )
      expect(entry.why.length, `${entry.table}: needs a reason`).toBeGreaterThan(
        10,
      )
    }
  })

  it('fails loudly when a new table arrives with no disposition', () => {
    const audit = auditSchema(
      { tables: [...schema.tables, 'training_diaries'], rlsEnabled: schema.rlsEnabled },
      TABLE_DISPOSITIONS,
    )

    expect(audit.undisposed).toEqual(['training_diaries'])
  })

  it('fails when a table is called user-owned without row-level security', () => {
    const audit = auditSchema(
      { tables: ['diaries'], rlsEnabled: [] },
      [
        {
          table: 'diaries',
          standing: 'cross-user',
          ownerColumn: 'user_id',
          seeded: true,
          why: 'a fixture for this test',
        },
      ],
    )

    expect(audit.unprotected).toEqual(['diaries'])
  })
})

describe('the standing matrix is derived from the register (ENV-07)', () => {
  it('drives itself from the cross-user dispositions, in schema order', () => {
    const expected = TABLE_DISPOSITIONS.filter(
      (entry) => entry.standing === 'cross-user',
    ).map((entry) => entry.table)

    expect(standingMatrix().map((entry) => entry.table)).toEqual(expected)
  })

  it('gives the suite what an assertion needs for every one of them', () => {
    for (const { table, ownerColumn, seeded } of standingMatrix()) {
      expect(typeof seeded, table).toBe('boolean')
      expect(ownerColumn === null || typeof ownerColumn === 'string').toBe(true)
      // A table in the matrix that cannot be addressed or forged would skip
      // itself at runtime rather than fail; both throw instead.
      expect(Object.keys(rowSelector(table, 'b', 'user-b')), table).toHaveLength(
        1,
      )
      expect(forgedRow(table, 'b', 'user-b'), table).toBeTruthy()
    }
  })

  it('refuses to address or forge a table nobody disposed of', () => {
    expect(() => rowSelector('training_diaries', 'b', 'user-b')).toThrow(
      /training_diaries/,
    )
    expect(() => forgedRow('training_diaries', 'b', 'user-b')).toThrow(
      /training_diaries/,
    )
  })
})
