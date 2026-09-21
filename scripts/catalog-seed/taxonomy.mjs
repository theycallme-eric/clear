/**
 * DATA-02 — the taxonomy the transform is measured against.
 *
 * Two kinds of constant live here, and the difference matters.
 *
 * **Read from the schema, never retyped.** The new vocabulary —
 * `movement_pattern`, `exercise_role`, `section_type`, `component_pattern_map`,
 * `focus_pattern_map` — is defined by DATA-01a's migration. This file parses it
 * out of `supabase/migrations/20260921000000_catalog_domain.sql` rather than
 * declaring a second copy. A seed that derives patterns from a private table
 * would agree with itself and disagree with the database, which is the exact
 * failure this task is supposed to make impossible.
 *
 * **Retyped from read-only evidence, deliberately.** The *old* vocabulary is
 * `anchor_type` and the previous Edge Function's filter constants. Those are
 * frozen — the old app is being retired — so they are stated here as the
 * baseline the equivalence comparison runs against, with their provenance on
 * each one.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { REPO_ROOT } from './sources.mjs'

const CATALOG_MIGRATION = join(
  REPO_ROOT,
  'supabase/migrations/20260921000000_catalog_domain.sql',
)

/**
 * @typedef {object} SchemaTaxonomy
 * @property {string[]} movementPatterns   `movement_pattern` enum values.
 * @property {string[]} sessionFocuses     `session_focus` enum values.
 * @property {string[]} exerciseRoles      `exercise_role` enum values.
 * @property {string[]} muscleRoles        `muscle_role` enum values.
 * @property {string[]} sectionTypes       `section_type` enum values.
 * @property {Map<string, string>} componentPatternMap Seeded component → pattern.
 * @property {Map<string, string[]>} focusPatternMap   Seeded focus → patterns.
 */

/** @type {SchemaTaxonomy | null} */
let cached = null

/**
 * Parse DATA-01a's migration. Cached: it is read many times per run and the
 * file cannot change mid-run.
 *
 * @returns {SchemaTaxonomy}
 */
export function loadSchemaTaxonomy() {
  if (cached !== null) return cached

  const sql = readFileSync(CATALOG_MIGRATION, 'utf8')

  cached = {
    movementPatterns: parseEnum(sql, 'movement_pattern'),
    sessionFocuses: parseEnum(sql, 'session_focus'),
    exerciseRoles: parseEnum(sql, 'exercise_role'),
    muscleRoles: parseEnum(sql, 'muscle_role'),
    sectionTypes: parseEnum(sql, 'section_type'),
    componentPatternMap: parseComponentPatternMap(sql),
    focusPatternMap: parseFocusPatternMap(sql),
  }
  return cached
}

/**
 * @param {string} sql
 * @param {string} name
 * @returns {string[]}
 */
function parseEnum(sql, name) {
  const declaration = new RegExp(
    `create type public\\.${name} as enum \\(([^)]*)\\)`,
    'i',
  ).exec(sql)
  if (declaration === null) {
    throw new Error(`Catalog migration does not declare enum "${name}"`)
  }
  const values = [...declaration[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
  if (values.length === 0) throw new Error(`Enum "${name}" parsed as empty`)
  return values
}

/**
 * @param {string} sql
 * @returns {Map<string, string>}
 */
function parseComponentPatternMap(sql) {
  const block = sliceInsert(sql, 'component_pattern_map')
  /** @type {Map<string, string>} */
  const map = new Map()
  for (const [, component, pattern] of block.matchAll(/\('([^']+)',\s*'([^']+)'\)/g)) {
    if (map.has(component)) {
      throw new Error(`component_pattern_map seeds "${component}" twice`)
    }
    map.set(component, pattern)
  }
  if (map.size === 0) throw new Error('component_pattern_map parsed as empty')
  return map
}

/**
 * @param {string} sql
 * @returns {Map<string, string[]>}
 */
function parseFocusPatternMap(sql) {
  const block = sliceInsert(sql, 'focus_pattern_map')
  /** @type {Map<string, string[]>} */
  const map = new Map()
  for (const [, focus, pattern] of block.matchAll(/\('([^']+)',\s*'([^']+)'\)/g)) {
    const patterns = map.get(focus) ?? []
    if (patterns.includes(pattern)) {
      throw new Error(`focus_pattern_map seeds "${focus}"/"${pattern}" twice`)
    }
    patterns.push(pattern)
    map.set(focus, patterns)
  }
  if (map.size === 0) throw new Error('focus_pattern_map parsed as empty')
  return map
}

/**
 * @param {string} sql
 * @param {string} table
 * @returns {string} The `VALUES` list of that table's seed, comments included —
 *   harmless, since only `('a', 'b')` pairs are matched out of it.
 */
function sliceInsert(sql, table) {
  const start = sql.indexOf(`insert into public.${table} (`)
  if (start === -1) throw new Error(`Catalog migration has no seed for "${table}"`)
  const end = sql.indexOf(';', start)
  if (end === -1) throw new Error(`Unterminated insert for "${table}"`)
  return sql.slice(start, end)
}

// ===========================================================================
// The retired vocabulary — read-only evidence, restated
// ===========================================================================

/**
 * `anchor_type`, from `docs/backend/evidence/previous-migrations/00001_create_enums.sql`.
 * The enum held three concepts at once (DATA_MODEL §11) and splits three ways:
 */
export const LEGACY_ANCHORS = Object.freeze({
  /** Names `movement_pattern` also uses. These carry into the weights table. */
  PATTERN: Object.freeze(['squat', 'hinge', 'press', 'pull', 'power']),
  /**
   * Session-level regions. `session_focus` values, not patterns — the catalog
   * migration says so in `exercise_pattern_weights`' comment. The 2026-09-18
   * capture contains none of them on an exercise, which the verifier asserts
   * rather than assumes.
   */
  REGION: Object.freeze(['upper_body', 'lower_body', 'full_body']),
  /**
   * The old escape hatch. Every legacy pattern row whose work was core,
   * conditioning or mobility carried `surprise`, so it names an absence of a
   * pattern rather than a pattern. It is dropped — and `verify.mjs` proves the
   * drop is lossless by showing each affected exercise still says the same
   * thing through the preserved `exercise_role` and `sections`.
   */
  NON_PATTERN: Object.freeze(['surprise']),
})

/**
 * `CONTRASTING_ANCHORS` from the previous `generate-workout` Edge Function
 * (`docs/backend/evidence/previous-functions/generate-workout.index.ts`).
 * Recorded because the old candidate set is only reproducible with it.
 */
export const LEGACY_CONTRASTING_ANCHORS = Object.freeze({
  squat: Object.freeze(['pull']),
  hinge: Object.freeze(['press']),
  press: Object.freeze(['pull']),
  pull: Object.freeze(['press']),
  power: Object.freeze([]),
})

/**
 * `ANCHOR_EXEMPT_ROLES` from the same function: roles that were candidates for
 * every anchor. DATA_MODEL §3 cascade item 8 keeps them, so both sides of the
 * comparison apply them and the delta is purely the pattern change.
 */
export const ROLE_EXEMPT_FROM_FOCUS = Object.freeze([
  'activation',
  'mobility',
  'conditioning',
  'stability',
  'cardio',
])

/**
 * How a new `session_focus` is compared against the retired anchors. The five
 * shared names make this an identity, not a judgement: `upper_body` admits
 * press and pull in `focus_pattern_map`, so its old counterpart is the union of
 * the `press` and `pull` anchor days. `unilateral` has no old counterpart at
 * all — it is new information from `single-leg-stability`, and every exercise
 * it adds shows up as a *gain* in the equivalence report.
 */
export const FOCUS_LEGACY_ANCHORS = Object.freeze({
  upper_body: Object.freeze(['press', 'pull']),
  lower_body: Object.freeze(['squat', 'hinge']),
  full_body: Object.freeze(['squat', 'hinge', 'press', 'pull']),
  power: Object.freeze(['power']),
})

/**
 * Sections and roles that account for a dropped `surprise` anchor. An exercise
 * that was only ever "surprise" has to still be findable, and in the new model
 * it is found by role exemption or by its section eligibility rather than by a
 * pattern. Both columns are preserved verbatim by this seed.
 */
export const NON_PATTERN_SECTIONS = Object.freeze([
  'warmup',
  'mobility',
  'cooldown',
  'core',
  'conditioning',
  'stability_balance',
  'carries',
])
