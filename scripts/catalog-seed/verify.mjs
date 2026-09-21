/**
 * DATA-02 — taxonomy equivalence verification.
 *
 * Four words from REQ-013 shape every check in this file: the seed must fail
 * loudly on references that are **orphaned**, **duplicated**, **dropped** or
 * **invented**. They are not synonyms.
 *
 *   * *orphaned* — a row points at something that is not there.
 *   * *duplicated* — one fact stated twice, where the schema expects it once.
 *   * *dropped* — a fact in the capture with nothing to account for it.
 *   * *invented* — a fact in the output with nothing behind it.
 *
 * Counting proves none of them on its own. 140 rows in and 140 rows out is also
 * what a transform that swapped two exercises' muscle mappings would report, so
 * every check below walks the actual references and names the rows it is
 * unhappy about.
 *
 * Nothing here talks to a database. The checks run against the transform, which
 * runs against committed files, so `npm run seed` proves equivalence on any
 * machine with no credentials — live application is TASK-072's, behind the
 * off-machine-backup gate.
 */
import * as reviewed from './reviewed.mjs'
import {
  FOCUS_LEGACY_ANCHORS,
  LEGACY_ANCHORS,
  LEGACY_CONTRASTING_ANCHORS,
  NON_PATTERN_SECTIONS,
  ROLE_EXEMPT_FROM_FOCUS,
  loadSchemaTaxonomy,
} from './taxonomy.mjs'
import { loadAnatomyTags, loadSnapshot } from './sources.mjs'

/**
 * @typedef {object} Check
 * @property {string} group    Which of the five acceptance surfaces it serves.
 * @property {string} name
 * @property {boolean} ok
 * @property {string} detail   What was expected and what was found — readable
 *   without the code open, because this is what a failure prints.
 */

/**
 * @typedef {object} Verification
 * @property {Check[]} checks
 * @property {Check[]} failures
 * @property {FocusComparison[]} focusComparisons
 * @property {string[]} weightsOutsideDerivation
 */

/**
 * @typedef {object} FocusComparison
 * @property {string} focus
 * @property {string[]} patterns
 * @property {string[]} legacyAnchors
 * @property {number} legacy
 * @property {number} legacyWithContrast
 * @property {number} derived
 * @property {string[]} lost
 * @property {string[]} gained
 */

/**
 * @param {import('./transform.mjs').Transformed} transformed
 * @returns {Verification}
 */
export function verify(transformed) {
  /** @type {Check[]} */
  const checks = []
  /**
   * @param {string} group
   * @param {string} name
   * @param {boolean} ok
   * @param {string} detail
   */
  const check = (group, name, ok, detail) => {
    checks.push({ group, name, ok, detail })
  }

  const snapshot = loadSnapshot()
  const tags = loadAnatomyTags()
  const schema = loadSchemaTaxonomy()

  const { definitions, muscles, weights, anchors, legacyPatterns } = transformed
  const ids = new Set(definitions.map((row) => row.id))

  // =========================================================================
  // 1. Counts — the acceptance numbers, and the one that must never return
  // =========================================================================

  check(
    'counts',
    'exercise definitions',
    definitions.length === reviewed.COUNTS.definitions,
    `expected ${reviewed.COUNTS.definitions}, seeded ${definitions.length}`,
  )
  check(
    'counts',
    'exercise-anchor links read',
    anchors.length === reviewed.COUNTS.anchors,
    `expected ${reviewed.COUNTS.anchors}, read ${anchors.length}`,
  )
  check(
    'counts',
    'exercise-muscle mappings',
    muscles.length === reviewed.COUNTS.muscles,
    `expected ${reviewed.COUNTS.muscles}, seeded ${muscles.length}`,
  )
  check(
    'counts',
    'legacy movement patterns',
    legacyPatterns.length === reviewed.COUNTS.legacyPatterns,
    `expected ${reviewed.COUNTS.legacyPatterns}, read ${legacyPatterns.length}`,
  )
  check(
    'counts',
    'reviewed workout-anatomy tags',
    tags.length === reviewed.COUNTS.anatomyTags,
    `expected ${reviewed.COUNTS.anatomyTags}, read ${tags.length}`,
  )

  // The audit retired 173 as unsupported. A seed that produces it has found a
  // source no live capture backs, so say so in those words.
  const regenerated = [definitions.length, anchors.length, muscles.length].filter(
    (count) => count === reviewed.RETIRED_EXERCISE_COUNT,
  )
  check(
    'counts',
    'retired 173-row expectation not regenerated',
    regenerated.length === 0,
    regenerated.length === 0
      ? `no count equals the retired ${reviewed.RETIRED_EXERCISE_COUNT}`
      : `a seeded count equals the retired ${reviewed.RETIRED_EXERCISE_COUNT}-row expectation`,
  )

  // =========================================================================
  // 2. Duplicated
  // =========================================================================

  check(
    'duplicated',
    'exercise ids unique',
    ...uniqueness(definitions, (row) => row.id, 'exercise id'),
  )
  check(
    'duplicated',
    'muscle mappings unique',
    ...uniqueness(
      muscles,
      (row) => `${row.exerciseId}/${row.muscleGroup}/${row.role}`,
      'muscle mapping',
    ),
  )
  check(
    'duplicated',
    'pattern weights unique',
    ...uniqueness(
      weights,
      (row) => `${row.exerciseId}/${row.movementPattern}`,
      'pattern weight',
    ),
  )
  check(
    'duplicated',
    'anchor links unique',
    ...uniqueness(anchors, (row) => `${row.exerciseId}/${row.anchor}`, 'anchor link'),
  )
  // `exercise_pattern_weights_one_primary_idx` is a partial unique index. A
  // second primary would abort the apply in TASK-072 rather than here, which is
  // far too late.
  check(
    'duplicated',
    'at most one primary pattern per exercise',
    ...uniqueness(
      weights.filter((row) => row.isPrimary),
      (row) => row.exerciseId,
      'primary pattern weight',
    ),
  )

  // =========================================================================
  // 3. Orphaned
  // =========================================================================

  check('orphaned', 'muscle mappings resolve', ...resolves(muscles, (row) => row.exerciseId, ids))
  check('orphaned', 'pattern weights resolve', ...resolves(weights, (row) => row.exerciseId, ids))
  check('orphaned', 'anchor links resolve', ...resolves(anchors, (row) => row.exerciseId, ids))

  const brokenProgressions = definitions.flatMap((row) =>
    [
      row.regression === null || ids.has(row.regression) ? null : `${row.id}→${row.regression}`,
      row.progression === null || ids.has(row.progression) ? null : `${row.id}→${row.progression}`,
    ].filter((entry) => entry !== null),
  )
  check(
    'orphaned',
    'regression/progression targets resolve',
    brokenProgressions.length === 0,
    brokenProgressions.length === 0
      ? `${definitions.filter((row) => row.regression !== null || row.progression !== null).length} exercises link to a variant, all resolving`
      : `unresolved: ${brokenProgressions.join(', ')}`,
  )

  // A valid null is a fact, not a gap. `CATALOG_MIGRATION_SCOPE.md` requires it
  // preserved rather than flattened, so check the shape rather than trusting it.
  const flattened = snapshot.definitions.filter(
    (row) => row.regression === '' || row.progression === '',
  )
  check(
    'orphaned',
    'absent variants stay null',
    flattened.length === 0,
    flattened.length === 0
      ? 'no empty-string variant survived the capture read'
      : `read as empty string rather than null: ${flattened.map((row) => row.id).join(', ')}`,
  )

  const badDefaults = definitions.filter(
    (row) => !row.equipmentOptions.includes(row.defaultEquipment),
  )
  check(
    'orphaned',
    'default equipment is an option',
    badDefaults.length === 0,
    badDefaults.length === 0
      ? 'every default_equipment appears in its equipment_options'
      : `violating exercise_definitions_default_equipment_is_an_option: ${badDefaults.map((row) => row.id).join(', ')}`,
  )

  const strayDisplayNames = definitions.flatMap((row) =>
    Object.keys(row.equipmentDisplayNames)
      .filter((equipment) => !row.equipmentOptions.includes(equipment))
      .map((equipment) => `${row.id}/${equipment}`),
  )
  check(
    'orphaned',
    'equipment display names resolve',
    strayDisplayNames.length === 0,
    strayDisplayNames.length === 0
      ? 'every display-name key is one of that exercise’s equipment options'
      : `naming absent equipment: ${strayDisplayNames.join(', ')}`,
  )

  const legacyPatternIds = new Set(legacyPatterns.map((row) => row.id))
  check(
    'orphaned',
    'legacy pattern references resolve',
    ...resolves(definitions, (row) => row.legacyPatternId, legacyPatternIds),
  )

  // =========================================================================
  // 4. Dropped
  // =========================================================================

  const capturedIds = new Set(snapshot.definitions.map((row) => row.id))
  const missing = [...capturedIds].filter((id) => !ids.has(id))
  check(
    'dropped',
    'every captured exercise is seeded',
    missing.length === 0,
    missing.length === 0
      ? `all ${capturedIds.size} captured ids present`
      : `not seeded: ${missing.join(', ')}`,
  )

  const capturedMuscles = new Set(
    snapshot.muscles.map((row) => `${row.exerciseId}/${row.muscleGroup}/${row.role}`),
  )
  const seededMuscles = new Set(
    muscles.map((row) => `${row.exerciseId}/${row.muscleGroup}/${row.role}`),
  )
  check(
    'dropped',
    'every captured muscle mapping is seeded',
    ...setEquality(capturedMuscles, seededMuscles, 'muscle mapping'),
  )

  // Every link must land in exactly one disposition bucket, and the buckets
  // must total the capture. This is where a silently discarded anchor surfaces.
  const dispositionCounts = tally(anchors.map((row) => row.disposition))
  const dispositionOk =
    Object.entries(reviewed.ANCHOR_DISPOSITIONS).every(
      ([disposition, expected]) => (dispositionCounts.get(disposition) ?? 0) === expected,
    ) &&
    [...dispositionCounts.keys()].every((key) => key in reviewed.ANCHOR_DISPOSITIONS) &&
    anchors.length ===
      Object.values(reviewed.ANCHOR_DISPOSITIONS).reduce((sum, value) => sum + value, 0)
  check(
    'dropped',
    'every anchor link has a reviewed disposition',
    dispositionOk,
    `expected ${format(reviewed.ANCHOR_DISPOSITIONS)}; found ${format(Object.fromEntries(dispositionCounts))}`,
  )

  // The dropped `surprise` links are the only real loss, so prove it is not one:
  // every exercise that had nothing but `surprise` must still be reachable
  // through a column this seed preserves verbatim.
  const surpriseOnly = [...ids].filter((id) => {
    const links = anchors.filter((row) => row.exerciseId === id)
    return links.length > 0 && links.every((row) => row.disposition === 'dropped_non_pattern')
  })
  const byId = new Map(definitions.map((row) => [row.id, row]))
  const unaccounted = surpriseOnly.filter((id) => {
    const row = byId.get(id)
    if (row === undefined) return true
    return (
      !ROLE_EXEMPT_FROM_FOCUS.includes(row.exerciseRole) &&
      !row.sections.some((section) => NON_PATTERN_SECTIONS.includes(section))
    )
  })
  check(
    'dropped',
    'dropped non-pattern anchors are carried by role or section',
    unaccounted.length === 0,
    unaccounted.length === 0
      ? `all ${surpriseOnly.length} "surprise"-only exercises remain reachable by exercise_role or sections`
      : `no longer reachable: ${unaccounted.join(', ')}`,
  )

  // Legacy patterns: the table is retired, so each of the 27 has to be shown to
  // carry nothing the new model cannot say.
  const unreferenced = legacyPatterns
    .filter((row) => row.exerciseCount === 0)
    .map((row) => row.id)
    .sort()
  check(
    'dropped',
    'unreferenced legacy patterns are the reviewed ones',
    same(unreferenced, [...reviewed.UNREFERENCED_LEGACY_PATTERNS].sort()),
    `expected [${reviewed.UNREFERENCED_LEGACY_PATTERNS.join(', ')}], found [${unreferenced.join(', ')}]`,
  )

  // 00016 built every primary anchor from the pattern join. If that chain is
  // intact, retiring `pattern_id` costs nothing: the pattern's anchor is
  // exactly the exercise's primary anchor, and that anchor is now a weight.
  const primaryByExercise = new Map(
    anchors.filter((row) => row.isPrimary).map((row) => [row.exerciseId, row.anchor]),
  )
  const patternAnchorById = new Map(legacyPatterns.map((row) => [row.id, row.anchor]))
  const chainBroken = definitions.filter(
    (row) => primaryByExercise.get(row.id) !== patternAnchorById.get(row.legacyPatternId),
  )
  check(
    'dropped',
    'legacy pattern anchor survives as the primary link',
    chainBroken.length === 0,
    chainBroken.length === 0
      ? 'every exercise’s primary anchor equals its legacy pattern’s anchor'
      : `broken chain: ${chainBroken.map((row) => `${row.id} (pattern ${row.legacyPatternId})`).join(', ')}`,
  )

  const categoriesWithoutFocus = [
    ...new Set(legacyPatterns.filter((row) => row.sessionFocus === null).map((row) => row.category)),
  ].sort()
  check(
    'dropped',
    'legacy pattern categories map to a session focus',
    same(categoriesWithoutFocus, [...reviewed.LEGACY_CATEGORIES_WITHOUT_FOCUS].sort()),
    `without a session_focus counterpart: expected [${reviewed.LEGACY_CATEGORIES_WITHOUT_FOCUS.join(', ')}], found [${categoriesWithoutFocus.join(', ')}]`,
  )

  // =========================================================================
  // 5. Invented
  // =========================================================================

  const sourceLinks = new Set(
    anchors
      .filter((row) => row.disposition === 'weighted')
      .map((row) => `${row.exerciseId}/${row.anchor}/${row.isPrimary}`),
  )
  const producedWeights = new Set(
    weights.map((row) => `${row.exerciseId}/${row.movementPattern}/${row.isPrimary}`),
  )
  check(
    'invented',
    'every pattern weight traces to one anchor link',
    ...setEquality(sourceLinks, producedWeights, 'pattern weight'),
  )

  const rankingCounts = {
    primary: weights.filter((row) => row.isPrimary).length,
    secondary: weights.filter((row) => !row.isPrimary).length,
  }
  check(
    'invented',
    'authored ranking preserved verbatim',
    rankingCounts.primary === reviewed.WEIGHT_RANKING.primary &&
      rankingCounts.secondary === reviewed.WEIGHT_RANKING.secondary,
    `expected ${format(reviewed.WEIGHT_RANKING)}; found ${format(rankingCounts)}`,
  )

  const seededIds = new Set(definitions.map((row) => row.id))
  check(
    'invented',
    'no exercise exists that the capture does not',
    ...setEquality(capturedIds, seededIds, 'exercise'),
  )

  // Vocabulary closure. Every value the seed writes into an enum column has to
  // be a value of that enum, or the apply fails in TASK-072 on a live project.
  check(
    'invented',
    'exercise roles are enum values',
    ...within(definitions, (row) => [row.exerciseRole], schema.exerciseRoles, 'exercise_role'),
  )
  check(
    'invented',
    'sections are enum values',
    ...within(definitions, (row) => row.sections, schema.sectionTypes, 'section_type'),
  )
  check(
    'invented',
    'muscle roles are enum values',
    ...within(muscles, (row) => [row.role], schema.muscleRoles, 'muscle_role'),
  )
  check(
    'invented',
    'weight patterns are enum values',
    ...within(weights, (row) => [row.movementPattern], schema.movementPatterns, 'movement_pattern'),
  )
  // The five shared names are the only anchors that may become a pattern. This
  // catches a mapping that quietly promotes `surprise` to `conditioning`.
  check(
    'invented',
    'only shared anchor names become patterns',
    ...within(
      anchors.filter((row) => row.disposition === 'weighted'),
      (row) => [row.anchor],
      LEGACY_ANCHORS.PATTERN,
      'weighted anchor',
    ),
  )

  // =========================================================================
  // 6. The reviewed workout-anatomy tags
  // =========================================================================

  const taggedIds = new Set(tags.map((row) => row.exerciseId))
  check(
    'anatomy',
    'tags and definitions are one-to-one',
    ...setEquality(capturedIds, taggedIds, 'tagged exercise'),
  )

  const componentFrequency = tally(definitions.flatMap((row) => row.componentMovements))
  check(
    'anatomy',
    'component vocabulary and frequency',
    sameTally(componentFrequency, reviewed.COMPONENT_FREQUENCY),
    describeTally(componentFrequency, reviewed.COMPONENT_FREQUENCY),
  )
  check(
    'anatomy',
    'exercise role distribution',
    sameTally(tally(definitions.map((row) => row.exerciseRole)), reviewed.ROLE_FREQUENCY),
    describeTally(tally(definitions.map((row) => row.exerciseRole)), reviewed.ROLE_FREQUENCY),
  )
  check(
    'anatomy',
    'muscle role distribution',
    sameTally(tally(muscles.map((row) => row.role)), reviewed.MUSCLE_ROLE_FREQUENCY),
    describeTally(tally(muscles.map((row) => row.role)), reviewed.MUSCLE_ROLE_FREQUENCY),
  )

  const muscleGroups = new Set(muscles.map((row) => row.muscleGroup))
  check(
    'anatomy',
    'muscle group vocabulary',
    muscleGroups.size === reviewed.MUSCLE_GROUP_COUNT,
    `expected ${reviewed.MUSCLE_GROUP_COUNT} distinct muscle groups, found ${muscleGroups.size}`,
  )

  const uncovered = definitions.filter(
    (row) => !muscles.some((mapping) => mapping.exerciseId === row.id),
  )
  check(
    'anatomy',
    'every exercise has muscle coverage',
    uncovered.length === 0,
    uncovered.length === 0
      ? 'all 140 exercises carry at least one muscle mapping'
      : `no muscle mapping: ${uncovered.map((row) => row.id).join(', ')}`,
  )

  // A component that is neither mapped to a pattern nor a known quality
  // component is a vocabulary the schema has never heard of.
  const unknownComponents = [...componentFrequency.keys()]
    .filter((component) => !(component in reviewed.COMPONENT_FREQUENCY))
    .sort()
  check(
    'anatomy',
    'no component outside the reviewed vocabulary',
    unknownComponents.length === 0,
    unknownComponents.length === 0
      ? `${componentFrequency.size} components, all reviewed`
      : `unreviewed: ${unknownComponents.join(', ')}`,
  )

  const mappedComponents = [...schema.componentPatternMap.keys()].sort()
  const presentMapped = mappedComponents.filter((component) => componentFrequency.has(component))
  check(
    'anatomy',
    'every mapped component is actually used',
    same(mappedComponents, presentMapped),
    same(mappedComponents, presentMapped)
      ? `all ${mappedComponents.length} components in component_pattern_map appear on a tagged exercise`
      : `mapped but unused: ${mappedComponents.filter((component) => !componentFrequency.has(component)).join(', ')}`,
  )

  // =========================================================================
  // 7. Candidate-set equivalence — DATA_MODEL §3 steps 3 and 4
  // =========================================================================

  const focusComparisons = compareFocuses(definitions, anchors, schema)
  for (const comparison of focusComparisons) {
    const expected = reviewed.FOCUS_EQUIVALENCE[comparison.focus]
    const ok =
      expected !== undefined &&
      comparison.legacy === expected.legacy &&
      comparison.legacyWithContrast === expected.legacyWithContrast &&
      comparison.derived === expected.derived &&
      same(comparison.lost, [...expected.lost]) &&
      same(comparison.gained, [...expected.gained])
    check(
      'equivalence',
      `candidate set — ${comparison.focus}`,
      ok,
      expected === undefined
        ? `focus "${comparison.focus}" has no reviewed expectation`
        : `legacy ${comparison.legacy} (${expected.legacy}), derived ${comparison.derived} (${expected.derived}); ` +
          `lost ${comparison.lost.length} (${expected.lost.length}), gained ${comparison.gained.length} (${expected.gained.length})` +
          (ok
            ? ''
            : `\n      lost:   ${comparison.lost.join(', ') || '—'}` +
              `\n      gained: ${comparison.gained.join(', ') || '—'}`),
    )
  }
  check(
    'equivalence',
    'every session focus compared',
    focusComparisons.length === schema.sessionFocuses.length,
    `expected ${schema.sessionFocuses.length} focuses (${schema.sessionFocuses.join(', ')}), compared ${focusComparisons.length}`,
  )

  const outside = weights
    .filter((row) => !row.derived)
    .map((row) => `${row.exerciseId}:${row.movementPattern}`)
    .sort()
  check(
    'equivalence',
    'weights outside the derivation are the reviewed ones',
    same(outside, [...reviewed.WEIGHTS_OUTSIDE_DERIVATION].sort()),
    same(outside, [...reviewed.WEIGHTS_OUTSIDE_DERIVATION].sort())
      ? `${outside.length} preserved weights that exercise_pattern_ranked cannot surface, all reviewed`
      : `expected ${reviewed.WEIGHTS_OUTSIDE_DERIVATION.length}: [${reviewed.WEIGHTS_OUTSIDE_DERIVATION.join(', ')}]\n      found ${outside.length}: [${outside.join(', ')}]`,
  )

  return {
    checks,
    failures: checks.filter((entry) => !entry.ok),
    focusComparisons,
    weightsOutsideDerivation: outside,
  }
}

/**
 * The comparison DATA_MODEL §3 step 3 asks for, run for every `session_focus`
 * the schema declares rather than a list written here — a focus added to the
 * enum and forgotten by the review fails the count check above.
 *
 * @param {import('./transform.mjs').SeedDefinition[]} definitions
 * @param {import('./transform.mjs').AnchorRecord[]} anchors
 * @param {import('./taxonomy.mjs').SchemaTaxonomy} schema
 * @returns {FocusComparison[]}
 */
export function compareFocuses(definitions, anchors, schema) {
  /** @type {Map<string, Set<string>>} */
  const anchorsByExercise = new Map()
  for (const link of anchors) {
    const set = anchorsByExercise.get(link.exerciseId) ?? new Set()
    set.add(link.anchor)
    anchorsByExercise.set(link.exerciseId, set)
  }

  return schema.sessionFocuses.map((focus) => {
    const patterns = schema.focusPatternMap.get(focus) ?? []
    const legacyAnchors = FOCUS_LEGACY_ANCHORS[focus] ?? []
    const contrasting = new Set(
      legacyAnchors.flatMap((anchor) => LEGACY_CONTRASTING_ANCHORS[anchor] ?? []),
    )

    /** @type {Set<string>} */
    const legacy = new Set()
    /** @type {Set<string>} */
    const legacyWithContrast = new Set()
    /** @type {Set<string>} */
    const derived = new Set()

    for (const row of definitions) {
      const links = anchorsByExercise.get(row.id) ?? new Set()
      const exempt = ROLE_EXEMPT_FROM_FOCUS.includes(row.exerciseRole)

      if (legacyAnchors.some((anchor) => links.has(anchor)) || exempt) {
        legacy.add(row.id)
        legacyWithContrast.add(row.id)
      } else if ([...contrasting].some((anchor) => links.has(anchor))) {
        legacyWithContrast.add(row.id)
      }

      if (patterns.some((pattern) => row.derivedPatterns.includes(pattern)) || exempt) {
        derived.add(row.id)
      }
    }

    return {
      focus,
      patterns: [...patterns].sort(),
      legacyAnchors: [...legacyAnchors],
      legacy: legacy.size,
      legacyWithContrast: legacyWithContrast.size,
      derived: derived.size,
      lost: [...legacy].filter((id) => !derived.has(id)).sort(),
      gained: [...derived].filter((id) => !legacy.has(id)).sort(),
    }
  })
}

// ===========================================================================
// Small comparison helpers. Each returns [ok, detail] for `check(...)`.
// ===========================================================================

/**
 * @template T
 * @param {T[]} rows
 * @param {(row: T) => string} key
 * @param {string} label
 * @returns {[boolean, string]}
 */
function uniqueness(rows, key, label) {
  const counts = tally(rows.map(key))
  const repeated = [...counts].filter(([, count]) => count > 1).map(([value]) => value)
  return [
    repeated.length === 0,
    repeated.length === 0
      ? `${rows.length} ${label}s, no repeats`
      : `repeated ${label}s: ${repeated.join(', ')}`,
  ]
}

/**
 * @template T
 * @param {T[]} rows
 * @param {(row: T) => string} key
 * @param {Set<string>} universe
 * @returns {[boolean, string]}
 */
function resolves(rows, key, universe) {
  const missing = [...new Set(rows.map(key).filter((value) => !universe.has(value)))].sort()
  return [
    missing.length === 0,
    missing.length === 0
      ? `all ${rows.length} references resolve`
      : `unresolved: ${missing.join(', ')}`,
  ]
}

/**
 * @param {Set<string>} expected
 * @param {Set<string>} actual
 * @param {string} label
 * @returns {[boolean, string]}
 */
function setEquality(expected, actual, label) {
  const dropped = [...expected].filter((value) => !actual.has(value)).sort()
  const invented = [...actual].filter((value) => !expected.has(value)).sort()
  const ok = dropped.length === 0 && invented.length === 0
  return [
    ok,
    ok
      ? `${expected.size} ${label}s, exactly`
      : [
          dropped.length > 0 ? `dropped: ${dropped.join(', ')}` : null,
          invented.length > 0 ? `invented: ${invented.join(', ')}` : null,
        ]
          .filter((part) => part !== null)
          .join('; '),
  ]
}

/**
 * @template T
 * @param {T[]} rows
 * @param {(row: T) => string[]} values
 * @param {readonly string[]} allowed
 * @param {string} label
 * @returns {[boolean, string]}
 */
function within(rows, values, allowed, label) {
  const stray = [
    ...new Set(rows.flatMap(values).filter((value) => !allowed.includes(value))),
  ].sort()
  return [
    stray.length === 0,
    stray.length === 0
      ? `every ${label} is one of ${allowed.length} allowed values`
      : `outside ${label}: ${stray.join(', ')}`,
  ]
}

/**
 * @param {string[]} a
 * @param {string[]} b
 * @returns {boolean}
 */
function same(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/**
 * @param {string[]} values
 * @returns {Map<string, number>}
 */
function tally(values) {
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return counts
}

/**
 * @param {Map<string, number>} actual
 * @param {Readonly<Record<string, number>>} expected
 * @returns {boolean}
 */
function sameTally(actual, expected) {
  const keys = Object.keys(expected)
  return (
    actual.size === keys.length && keys.every((key) => actual.get(key) === expected[key])
  )
}

/**
 * @param {Map<string, number>} actual
 * @param {Readonly<Record<string, number>>} expected
 * @returns {string}
 */
function describeTally(actual, expected) {
  const keys = [...new Set([...Object.keys(expected), ...actual.keys()])].sort()
  const differences = keys
    .filter((key) => (actual.get(key) ?? 0) !== (expected[key] ?? 0))
    .map((key) => `${key} ${actual.get(key) ?? 0} (expected ${expected[key] ?? 0})`)
  return differences.length === 0
    ? `${actual.size} values, every count as reviewed`
    : differences.join(', ')
}

/**
 * @param {Readonly<Record<string, number>>} counts
 * @returns {string}
 */
function format(counts) {
  return Object.entries(counts)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')
}
