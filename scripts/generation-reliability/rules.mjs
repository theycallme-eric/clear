/**
 * GR-01 — the retrieval rules and the enums, read from the migrations.
 *
 * The matrix has to count candidates "with the same predicates as candidate
 * retrieval", and a second hand-written copy of a floor, an exempt-role list or
 * an enum would be exactly the kind of list that drifts. So every value below
 * is read out of `supabase/migrations/`: the enums through DATA-03's reader
 * (the one `npm run gen:types` is built on), the taxonomy maps through
 * DATA-02's, and the three literals the generation functions carry — the
 * floor, the focus-exempt roles, the per-goal section override — out of the
 * function text itself. The latest migration to declare one wins, as it does in
 * the database.
 *
 * Offline: files only. Anything it cannot find raises rather than defaulting.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { loadSchemaTaxonomy } from '../catalog-seed/taxonomy.mjs'
import { MIGRATIONS_DIR, migrationFiles, readSchema } from '../gen-types/schema.mjs'

/** The enums a legal state is made of. Each must be declared by the schema. */
const STATE_ENUMS = [
  'section_type',
  'goal_preset',
  'session_focus',
  'equipment_tier',
  'movement_pattern',
  'constraint_scope',
  'constraint_action',
  'constraint_persistence',
]

/** `p_floor integer default 8`, in the request-level retrieval function. */
const FLOOR =
  /function public\.generation_candidate_sets_for_goal\([^)]*?p_floor\s+integer default (\d+)/i

/** `ec.exercise_role = any (array[…]::public.exercise_role[])`. */
const FOCUS_EXEMPT_ROLES =
  /ec\.exercise_role = any \(array\[([^\]]*)\]::public\.exercise_role\[\]\)/i

/** `when p_goal = 'active_recovery' then array[…]::public.section_type[]`. */
const GOAL_SECTION_OVERRIDE =
  /when p_goal = '([a-z_]+)'\s+then array\[([^\]]*)\]::public\.section_type\[\]/gi

/**
 * @typedef {object} RetrievalRules
 * @property {Record<string, string[]>} enums          Schema enum → values, in declared order.
 * @property {number} floor                            The per-section relaxation floor.
 * @property {string[]} focusExemptRoles               Roles the focus predicate never filters.
 * @property {Record<string, string[]>} goalSectionOverrides  Goals whose sections ignore the profile.
 * @property {Record<string, string[]>} focusPatterns  `focus_pattern_map`.
 * @property {string[]} sources                        Repository paths read.
 */

/** @returns {RetrievalRules} */
export function loadRetrievalRules() {
  const schema = readSchema()
  /** @type {Record<string, string[]>} */
  const enums = {}
  for (const name of STATE_ENUMS) {
    const declared = schema.enums.find((candidate) => candidate.name === name)
    if (declared === undefined) throw new Error(`The schema declares no enum "${name}"`)
    enums[name] = [...declared.values]
  }

  /** @type {number | null} */
  let floor = null
  /** @type {string[] | null} */
  let focusExemptRoles = null
  /** @type {Record<string, string[]> | null} */
  let goalSectionOverrides = null
  const files = migrationFiles()

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')

    const floorMatch = FLOOR.exec(sql)
    if (floorMatch !== null) floor = Number(floorMatch[1])

    const rolesMatch = FOCUS_EXEMPT_ROLES.exec(sql)
    if (rolesMatch !== null) focusExemptRoles = quoted(rolesMatch[1])

    const overrides = [...sql.matchAll(GOAL_SECTION_OVERRIDE)]
    if (overrides.length > 0) {
      goalSectionOverrides = Object.fromEntries(
        overrides.map((match) => [match[1], quoted(match[2])]),
      )
    }
  }

  if (floor === null) throw new Error('No migration declares the candidate floor (p_floor)')
  if (focusExemptRoles === null) {
    throw new Error('No migration declares the focus-exempt exercise roles')
  }
  if (goalSectionOverrides === null) {
    throw new Error('No migration declares a goal-scoped section override')
  }

  const taxonomy = loadSchemaTaxonomy()

  return {
    enums,
    floor,
    focusExemptRoles,
    goalSectionOverrides,
    focusPatterns: Object.fromEntries(taxonomy.focusPatternMap),
    sources: files.map((file) => `supabase/migrations/${file}`),
  }
}

/** @param {string} list  `'a', 'b'` @returns {string[]} */
function quoted(list) {
  return [...list.matchAll(/'([^']+)'/g)].map((match) => match[1])
}
