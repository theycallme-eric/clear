/**
 * GR-02 / REQ-004 — the section-mapping ledger, applied.
 *
 * The ledger's rows are the one source. Three things are derived from them and
 * nothing else, so they cannot disagree:
 *
 *   * the committed seed — `scripts/catalog-seed/transform.mjs` passes every
 *     captured exercise through `applyChange`;
 *   * the migration — `renderMigration`, one `values` line per ledger row;
 *   * the rollback — `renderRollback`, the same rows put back to what the
 *     pre-change capture holds.
 *
 * The repair is additive. A row is reduced to what it adds (`ledgerChanges`):
 * the sections it appends and whether it makes the exercise primary. A row that
 * removes a tag, or withdraws primary eligibility, has no such form and is
 * refused here rather than written as a rewrite.
 *
 * `applyChange` is the migration's `update`, in JavaScript: append the sections
 * the exercise does not have yet, in the row's order, and OR the flag. The seed
 * is built with it, and the test reads the committed migration back
 * (`parseMigration`) and runs it over the capture with the same function — once
 * and twice — to hold the SQL to the ledger without a database.
 *
 * This module reads nothing and writes nothing. `catalog-repair-migration.mjs`
 * is the command.
 */
import { addedSections } from './section-ledger.mjs'

export const MIGRATION_PATH = 'supabase/migrations/20261001000019_catalog_section_repair.sql'
export const ROLLBACK_SQL_PATH = 'docs/backend/rollback/catalog-section-repair.sql'

/**
 * What one ledger row adds.
 *
 * @typedef {object} Change
 * @property {string} id
 * @property {string[]} add          Sections appended, in the row's order.
 * @property {boolean} makePrimary   Whether `can_be_primary` becomes true.
 */

/**
 * @typedef {import('./section-ledger.mjs').Membership} Membership
 */

/**
 * @param {Pick<import('./section-ledger.mjs').Ledger, 'rows'>} ledger
 * @returns {Change[]} One per row, in the ledger's order.
 */
export function ledgerChanges(ledger) {
  return ledger.rows.map((row) => {
    const removed = row.before.sections.filter((section) => !row.after.sections.includes(section))
    if (removed.length > 0) {
      throw new Error(
        `ledger row "${row.id}" removes ${removed.join(', ')}; the repair is additive and cannot apply it`,
      )
    }
    if (row.before.canBePrimary && !row.after.canBePrimary) {
      throw new Error(
        `ledger row "${row.id}" withdraws can_be_primary; the repair is additive and cannot apply it`,
      )
    }

    return {
      id: row.id,
      add: addedSections(row),
      makePrimary: row.after.canBePrimary && !row.before.canBePrimary,
    }
  })
}

/**
 * The migration's `update`, for one exercise.
 *
 * @param {Membership} membership
 * @param {Pick<Change, 'add' | 'makePrimary'>} change
 * @returns {Membership}
 */
export function applyChange(membership, change) {
  return {
    sections: [
      ...membership.sections,
      ...change.add.filter((section) => !membership.sections.includes(section)),
    ],
    canBePrimary: membership.canBePrimary || change.makePrimary,
  }
}

/**
 * Whether the migration's `where` selects the exercise — false once the change
 * has landed, which is what makes a second apply touch nothing.
 *
 * @param {Membership} membership
 * @param {Pick<Change, 'add' | 'makePrimary'>} change
 */
export function wouldChange(membership, change) {
  return (
    change.add.some((section) => !membership.sections.includes(section)) ||
    (change.makePrimary && !membership.canBePrimary)
  )
}

/**
 * Every change applied to a catalog. Rows the changes do not name are returned
 * as they came.
 *
 * @param {ReadonlyMap<string, Membership>} catalog
 * @param {readonly Change[]} changes
 * @returns {{ catalog: Map<string, Membership>, updated: string[] }}
 */
export function applyChanges(catalog, changes) {
  const next = new Map(catalog)
  /** @type {string[]} */
  const updated = []

  for (const change of changes) {
    const membership = next.get(change.id)
    if (membership === undefined || !wouldChange(membership, change)) continue
    next.set(change.id, applyChange(membership, change))
    updated.push(change.id)
  }

  return { catalog: next, updated }
}

/** @param {string} value */
const literal = (value) => `'${value.replaceAll("'", "''")}'`

/** @param {readonly string[]} sections */
const sectionArray = (sections) =>
  `array[${sections.map(literal).join(', ')}]::public.section_type[]`

/**
 * @param {readonly string[]} cells
 * @returns {string}
 */
const valuesRow = (cells) => `  (${cells.join(', ')})`

/**
 * @param {Pick<import('./section-ledger.mjs').Ledger, 'rows'>} ledger
 * @returns {string} The migration, byte for byte.
 */
export function renderMigration(ledger) {
  const changes = ledgerChanges(ledger)
  const rows = changes
    .map((change) =>
      valuesRow([literal(change.id), sectionArray(change.add), change.makePrimary ? 'true' : 'false']),
    )
    .join(',\n')

  return `-- =============================================================================
-- GENERATED by \`npm run gr:repair\` — do not edit.
-- Source: docs/process/generation-reliability/section-mapping-ledger.json
-- =============================================================================
--
-- GR-02 / REQ-004 — catalog section repair.
--
-- The preserved catalog tagged no exercise skill_power, carries or
-- stability_balance, and no exercise that can be done without an implement was
-- primary_lift. The section-mapping ledger records, row by row with evidence,
-- which exercises belong there. This migration applies those ${changes.length} rows to
-- public.exercise_definitions and nothing else. supabase/seed/ is generated from
-- the same rows, so a database seeded after this migration and one migrated
-- after its seed hold the same catalog.
--
-- Additive. Each line below names one exercise, the sections it gains and
-- whether it becomes eligible as a primary lift. A section is appended only
-- where the exercise does not already carry it; can_be_primary is only ever
-- raised. No tag is taken away, no row is inserted or removed, and an
-- exercise the ledger does not name is not touched.
--
-- Idempotent. The WHERE clause selects a row only while something is still
-- missing from it, so a second apply updates zero rows and the updated_at
-- trigger does not fire. On a project with no catalog rows yet it updates
-- nothing, and the seed supplies the same values.
--
-- Rollback: docs/backend/catalog-section-repair-rollback.md.

update public.exercise_definitions as d
set
  sections = d.sections || array(
    select added.tag
    from unnest(r.add_sections) with ordinality as added(tag, ord)
    where added.tag <> all (d.sections)
    order by added.ord
  ),
  can_be_primary = d.can_be_primary or r.make_primary
from (values
${rows}
) as r(id, add_sections, make_primary)
where d.id = r.id
  and (
    not (d.sections @> r.add_sections)
    or (r.make_primary and not d.can_be_primary)
  );
`
}

const VALUES_ROW = /^ {2}\('((?:[^']|'')+)', array\[(.*)\]::public\.section_type\[\], (true|false)\),?$/

/**
 * The `values` lines of a rendered migration or rollback, read back.
 *
 * @param {string} sql
 * @returns {{ id: string, sections: string[], flag: boolean }[]}
 */
function parseValues(sql) {
  return sql
    .split('\n')
    .map((line) => VALUES_ROW.exec(line))
    .filter((match) => match !== null)
    .map((match) => ({
      id: match[1].replaceAll("''", "'"),
      sections:
        match[2].trim() === ''
          ? []
          : match[2].split(',').map((entry) => entry.trim().slice(1, -1).replaceAll("''", "'")),
      flag: match[3] === 'true',
    }))
}

/**
 * The changes a migration file makes, read from its text — what the committed
 * SQL says, as opposed to what the ledger would render.
 *
 * @param {string} sql
 * @returns {Change[]}
 */
export function parseMigration(sql) {
  return parseValues(sql).map((row) => ({ id: row.id, add: row.sections, makePrimary: row.flag }))
}

/**
 * The memberships a rollback file restores, read from its text.
 *
 * @param {string} sql
 * @returns {Map<string, Membership>}
 */
export function parseRollback(sql) {
  return new Map(
    parseValues(sql).map((row) => [row.id, { sections: row.sections, canBePrimary: row.flag }]),
  )
}

/**
 * Statements that take catalog data away. An `update` is not one of them: the
 * rendered `set` can only append and raise, which `applyChange` models and the
 * test proves against the capture.
 *
 * @param {string} sql
 * @returns {string[]} The keywords found outside comments; empty when none.
 */
export function destructiveStatements(sql) {
  const code = sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')

  return ['delete', 'truncate', 'drop'].filter((keyword) =>
    new RegExp(`\\b${keyword}\\b`, 'i').test(code),
  )
}

/**
 * The rollback: every ledger row's exercise put back to what the pre-change
 * capture holds for it. Not the ledger's `before` — the capture itself, with
 * its own section order, so the restored rows are the captured rows.
 *
 * @param {Pick<import('./section-ledger.mjs').Ledger, 'rows' | 'capture'>} ledger
 * @param {ReadonlyMap<string, Membership>} capture
 * @returns {string}
 */
export function renderRollback(ledger, capture) {
  const rows = ledger.rows
    .map((row) => {
      const captured = capture.get(row.id)
      if (captured === undefined) {
        throw new Error(`ledger row "${row.id}" names an exercise the capture does not have`)
      }
      return valuesRow([
        literal(row.id),
        sectionArray(captured.sections),
        captured.canBePrimary ? 'true' : 'false',
      ])
    })
    .join(',\n')

  return `-- =============================================================================
-- GENERATED by \`npm run gr:repair\` — do not edit.
-- Source: docs/process/generation-reliability/section-mapping-ledger.json
--         ${ledger.capture}
-- =============================================================================
--
-- GR-02 / REQ-004 — rollback of the catalog section repair
-- (${MIGRATION_PATH}).
--
-- Restores sections and can_be_primary, for the ${ledger.rows.length} exercises the ledger names,
-- to the values in the pre-change capture. No other row and no other column is
-- touched. Running it twice changes nothing the second time.
--
-- NOT a migration and not applied by any command. Read
-- docs/backend/catalog-section-repair-rollback.md before running it: the
-- repository has to be rolled back with it, or the next seed re-applies the
-- repair.

begin;

update public.exercise_definitions as d
set
  sections = r.sections,
  can_be_primary = r.can_be_primary
from (values
${rows}
) as r(id, sections, can_be_primary)
where d.id = r.id
  and (
    d.sections is distinct from r.sections
    or d.can_be_primary is distinct from r.can_be_primary
  );

commit;
`
}
