/**
 * DATA-02 — the transform itself: capture + reviewed tags → rows in DATA-01a's
 * schema.
 *
 * Every output row records where it came from. That is not bookkeeping for its
 * own sake — `verify.mjs` proves "nothing orphaned, duplicated, dropped or
 * invented" by walking these links, and a transform that threw its provenance
 * away could only be checked by counting, which is exactly the kind of proof
 * that passes while being wrong.
 *
 * The transform decides nothing on its own. The vocabulary comes from the
 * migration, the content comes from the capture and migration `00031`, and the
 * three dispositions below are the ones `sources/source-24-LIVE_BACKEND_AUDIT_2026-09-18.md`
 * §3 approved.
 */
import { loadAnatomyTags, loadSnapshot } from './sources.mjs'
import { LEGACY_ANCHORS, loadSchemaTaxonomy } from './taxonomy.mjs'

/**
 * What became of one of the 150 anchor links. Exactly one applies to each, and
 * `verify.mjs` fails if any link matches none.
 *
 * @typedef {'weighted' | 'dropped_region' | 'dropped_non_pattern'} AnchorDisposition
 */

/**
 * @typedef {object} SeedDefinition
 * @property {string} id
 * @property {string} name
 * @property {string[]} equipmentOptions
 * @property {string} defaultEquipment
 * @property {Record<string, string>} equipmentDisplayNames
 * @property {string | null} regression
 * @property {string | null} progression
 * @property {string[]} coachingCues
 * @property {string[]} sections
 * @property {boolean} canBePrimary
 * @property {string[]} componentMovements  From the reviewed `00031` tags.
 * @property {string} exerciseRole          From the reviewed `00031` tags.
 * @property {string[]} derivedPatterns     What `exercise_patterns` will yield.
 * @property {string} legacyPatternId       Retired; kept for the equivalence proof.
 */

/**
 * @typedef {object} SeedWeight
 * @property {string} exerciseId
 * @property {string} movementPattern
 * @property {boolean} isPrimary
 * @property {boolean} derived  Whether `exercise_patterns` also yields this
 *   pair. A weight on a pattern the components do not imply is preserved but
 *   invisible to `exercise_pattern_ranked`; see `verify.mjs`.
 */

/**
 * @typedef {object} AnchorRecord
 * @property {string} exerciseId
 * @property {string} anchor
 * @property {boolean} isPrimary
 * @property {AnchorDisposition} disposition
 * @property {string} reason
 */

/**
 * @typedef {object} LegacyPatternRecord
 * @property {string} id
 * @property {string} name
 * @property {string} category
 * @property {string} anchor
 * @property {number} exerciseCount
 * @property {AnchorDisposition} anchorDisposition
 * @property {string | null} sessionFocus  The `session_focus` its `category`
 *   became, or null for `core`, which is a section and not a focus.
 */

/**
 * @typedef {object} Transformed
 * @property {string} snapshotId
 * @property {SeedDefinition[]} definitions
 * @property {import('./sources.mjs').SnapshotMuscle[]} muscles
 * @property {SeedWeight[]} weights
 * @property {AnchorRecord[]} anchors
 * @property {LegacyPatternRecord[]} legacyPatterns
 */

/**
 * @returns {Transformed}
 */
export function transform() {
  const snapshot = loadSnapshot()
  const tags = loadAnatomyTags()
  const schema = loadSchemaTaxonomy()

  const tagById = new Map(tags.map((tag) => [tag.exerciseId, tag]))

  /** @type {SeedDefinition[]} */
  const definitions = snapshot.definitions.map((row) => {
    const tag = tagById.get(row.id)
    if (tag === undefined) {
      // A definition with no reviewed tag would reach the database with an
      // empty component vocabulary, which silently removes it from every
      // pattern. Refusing here is the loud failure, not a later count.
      throw new Error(`No reviewed workout-anatomy tag for exercise "${row.id}"`)
    }
    return {
      id: row.id,
      name: row.name,
      equipmentOptions: row.equipmentOptions,
      defaultEquipment: row.defaultEquipment,
      equipmentDisplayNames: row.equipmentDisplayNames,
      regression: row.regression,
      progression: row.progression,
      coachingCues: row.coachingCues,
      sections: row.sections,
      canBePrimary: row.canBePrimary,
      componentMovements: tag.componentMovements,
      exerciseRole: tag.exerciseRole,
      derivedPatterns: derivePatterns(tag.componentMovements, schema.componentPatternMap),
      legacyPatternId: row.patternId,
    }
  })

  const derivedById = new Map(definitions.map((row) => [row.id, new Set(row.derivedPatterns)]))

  /** @type {AnchorRecord[]} */
  const anchors = snapshot.anchors.map((link) => ({
    ...link,
    ...classifyAnchor(link.anchor),
  }))

  /** @type {SeedWeight[]} */
  const weights = anchors
    .filter((link) => link.disposition === 'weighted')
    .map((link) => ({
      exerciseId: link.exerciseId,
      movementPattern: link.anchor,
      isPrimary: link.isPrimary,
      derived: derivedById.get(link.exerciseId)?.has(link.anchor) ?? false,
    }))

  const exercisesPerPattern = countBy(snapshot.definitions, (row) => row.patternId)

  /** @type {LegacyPatternRecord[]} */
  const legacyPatterns = snapshot.patterns.map((pattern) => ({
    id: pattern.id,
    name: pattern.name,
    category: pattern.category,
    anchor: pattern.anchor,
    exerciseCount: exercisesPerPattern.get(pattern.id) ?? 0,
    anchorDisposition: classifyAnchor(pattern.anchor).disposition,
    // `movement_category` and `session_focus` share three of four names. The
    // fourth, `core`, is a section in the new model, never a focus.
    sessionFocus: schema.sessionFocuses.includes(pattern.category) ? pattern.category : null,
  }))

  return {
    snapshotId: snapshot.id,
    definitions,
    muscles: snapshot.muscles,
    weights,
    anchors,
    legacyPatterns,
  }
}

/**
 * What `exercise_patterns` will produce for these components, computed with the
 * migration's own `component_pattern_map`.
 *
 * @param {string[]} components
 * @param {Map<string, string>} componentPatternMap
 * @returns {string[]}
 */
export function derivePatterns(components, componentPatternMap) {
  /** @type {Set<string>} */
  const patterns = new Set()
  for (const component of components) {
    const pattern = componentPatternMap.get(component)
    if (pattern !== undefined) patterns.add(pattern)
  }
  return [...patterns].sort()
}

/**
 * @param {string} anchor
 * @returns {{ disposition: AnchorDisposition, reason: string }}
 */
function classifyAnchor(anchor) {
  if (LEGACY_ANCHORS.PATTERN.includes(anchor)) {
    return {
      disposition: 'weighted',
      reason: 'movement_pattern of the same name; the authored ranking is preserved',
    }
  }
  if (LEGACY_ANCHORS.REGION.includes(anchor)) {
    return {
      disposition: 'dropped_region',
      reason: 'a session_focus, not a movement pattern (catalog migration §6)',
    }
  }
  if (LEGACY_ANCHORS.NON_PATTERN.includes(anchor)) {
    return {
      disposition: 'dropped_non_pattern',
      reason: 'named the absence of a pattern; carried by exercise_role and sections',
    }
  }
  // Not "assume it is fine": an anchor value outside the retired enum means the
  // capture disagrees with the evidence it was captured from.
  throw new Error(`Anchor "${anchor}" is not a value of the retired anchor_type enum`)
}

/**
 * @template T
 * @param {T[]} rows
 * @param {(row: T) => string} key
 * @returns {Map<string, number>}
 */
function countBy(rows, key) {
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1)
  return counts
}
