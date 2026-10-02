/**
 * GR-03 / REQ-007 — catalog viability invariants.
 *
 * `verify.mjs` proves the seed says what the capture said. That was true on the
 * day three sections had no exercise in them and no Minimal-compatible exercise
 * could anchor a session, so equivalence is not viability. These checks ask the
 * other question — can the product's own choices be served from this catalog —
 * and they ask it of the transform, before an artifact is written:
 *
 *   * every `section_type` a person can select has catalog rows, and one that
 *     has none is explicitly marked non-selectable or the seed fails;
 *   * every onboarding tier × Goal preset has a candidate in each section the
 *     preset requires, and main work it can be anchored on;
 *   * for every `session_focus`, each section's strict and relaxed candidate
 *     counts are the ones recorded in `reviewed.mjs`.
 *
 * The counts are `buildMatrix`'s, so there is one transcription of
 * `generation_candidates` and this file does not hold a second. Nothing here
 * reads a database, a credential or a model: the rules come from the
 * migrations, the catalog from the transform, the presets from the caller.
 */
import { buildMatrix } from '../generation-reliability/matrix.mjs'
import { MAIN_WORK_SECTION } from '../generation-reliability/section-ledger.mjs'

const GROUP = 'viability'

/**
 * The onboarding vocabularies, as `src/state/onboarding.ts` exports them.
 *
 * @typedef {object} Presets
 * @property {Readonly<Record<string, readonly string[]>>} equipmentByTier
 * @property {Readonly<Record<string, readonly string[]>>} sectionsByGoal
 * @property {readonly string[]} equipment            Every equipment id offered.
 * @property {readonly string[]} tiers                The tiers onboarding advertises.
 * @property {readonly string[]} goals                The Goals onboarding advertises.
 * @property {readonly string[]} nonSelectableSections
 */

/**
 * @typedef {import('../generation-reliability/matrix.mjs').CatalogExercise
 *   & { canBePrimary: boolean }} ViabilityExercise
 */

/**
 * `{ focus: { tier: { section: [strict, relaxed] } } }`.
 *
 * @typedef {Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, readonly number[]>>>>>>} RecordedRetrieval
 */

/**
 * @typedef {object} ViabilityInputs
 * @property {import('../generation-reliability/rules.mjs').RetrievalRules} rules
 * @property {readonly ViabilityExercise[]} catalog
 * @property {Presets} presets
 * @property {RecordedRetrieval} recorded
 */

/**
 * The transform's rows in the shape retrieval reads them. `derivedPatterns` is
 * what `exercise_catalog.movement_patterns` holds once the seed is applied.
 *
 * @param {import('./transform.mjs').Transformed} transformed
 * @returns {ViabilityExercise[]}
 */
export function catalogOf(transformed) {
  return transformed.definitions.map((row) => ({
    id: row.id,
    equipmentOptions: row.equipmentOptions,
    sections: row.sections,
    exerciseRole: row.exerciseRole,
    movementPatterns: row.derivedPatterns,
    canBePrimary: row.canBePrimary,
  }))
}

/**
 * Each tier × focus × section's `[strict, relaxed]`, in the shape
 * `reviewed.FOCUS_RETRIEVAL` records it.
 *
 * @param {Pick<ViabilityInputs, 'rules' | 'catalog' | 'presets'>} inputs
 * @returns {Record<string, Record<string, Record<string, number[]>>>}
 */
export function focusRetrieval({ rules, catalog, presets }) {
  /** @type {Record<string, Record<string, Record<string, number[]>>>} */
  const retrieval = {}
  for (const cell of matrixOf({ rules, catalog, presets }).cells) {
    const byTier = (retrieval[cell.focus] ??= {})
    const bySection = (byTier[cell.tier] ??= {})
    bySection[cell.section] = [cell.strict, cell.relaxed]
  }
  return retrieval
}

/**
 * @param {Pick<ViabilityInputs, 'rules' | 'catalog' | 'presets'>} inputs
 */
function matrixOf({ rules, catalog, presets }) {
  return buildMatrix({
    rules,
    catalog,
    equipmentByTier: presets.equipmentByTier,
    sectionsByGoal: presets.sectionsByGoal,
    equipment: presets.equipment,
  })
}

/**
 * @param {ViabilityInputs} inputs
 * @returns {import('./verify.mjs').Check[]}
 */
export function checkViability({ rules, catalog, presets, recorded }) {
  /** @type {import('./verify.mjs').Check[]} */
  const checks = []
  const check = (
    /** @type {string} */ name,
    /** @type {string[]} */ problems,
    /** @type {string} */ passing,
  ) => {
    checks.push({
      group: GROUP,
      name,
      ok: problems.length === 0,
      detail: problems.length === 0 ? passing : problems.join('\n      '),
    })
  }

  const sectionTypes = rules.enums.section_type
  const { nonSelectableSections, tiers, goals, sectionsByGoal, equipmentByTier } = presets
  const selectable = sectionTypes.filter((section) => !nonSelectableSections.includes(section))

  const matrix = matrixOf({ rules, catalog, presets })

  // =========================================================================
  // 1. Every selectable section has catalog rows
  // =========================================================================

  for (const section of sectionTypes) {
    const rows = catalog.filter((exercise) => exercise.sections.includes(section)).length
    const marked = nonSelectableSections.includes(section)
    check(
      `section — ${section}`,
      rows > 0 || marked
        ? []
        : [
            `section_type "${section}" is user-selectable and has zero catalog rows; ` +
              'tag exercises for it or mark it non-selectable in src/state/section-selectability.ts',
          ],
      marked
        ? `marked non-selectable; ${rows} catalog rows, offered by neither onboarding nor Settings`
        : `selectable, ${rows} catalog rows`,
    )
  }

  // A marker is a claim about the enum and about the presets. One naming a
  // value the enum does not have guards nothing; one a preset still turns on
  // would hide a section the preset then requires.
  check(
    'non-selectable markers',
    [
      ...nonSelectableSections
        .filter((section) => !sectionTypes.includes(section))
        .map((section) => `"${section}" is marked non-selectable and is not a section_type`),
      ...goals.flatMap((goal) =>
        (sectionsByGoal[goal] ?? [])
          .filter((section) => nonSelectableSections.includes(section))
          .map(
            (section) =>
              `Goal "${goal}" presets section "${section}", which is marked non-selectable`,
          ),
      ),
    ],
    `${nonSelectableSections.length} marked non-selectable, none preset by an advertised Goal`,
  )

  // =========================================================================
  // 2. Every advertised tier × Goal preset
  // =========================================================================

  const candidatesAt = new Map(matrix.sectionTiers.map((row) => [row.id, row.candidates]))

  for (const tier of tiers) {
    for (const goal of goals) {
      const required = rules.goalSectionOverrides[goal] ?? sectionsByGoal[goal] ?? []
      check(
        `preset — ${tier} × ${goal}`,
        required
          .filter((section) => (candidatesAt.get(`${section}/${tier}`) ?? 0) === 0)
          .map(
            (section) =>
              `tier "${tier}", Goal "${goal}": required section "${section}" has no candidate ` +
              `with ${(equipmentByTier[tier] ?? []).join(', ') || 'no equipment'}`,
          ),
        `${required.length} required sections, each with a candidate`,
      )
    }

    // A session is anchored on one `can_be_primary` exercise. A main-work
    // section whose every row at this tier is an accessory lift has candidates
    // and still cannot be composed.
    const needsMainWork = goals.filter((goal) =>
      (rules.goalSectionOverrides[goal] ?? sectionsByGoal[goal] ?? []).includes(MAIN_WORK_SECTION),
    )
    if (needsMainWork.length === 0) continue

    const available = equipmentByTier[tier] ?? []
    const anchors = catalog.filter(
      (exercise) =>
        exercise.canBePrimary &&
        exercise.sections.includes(MAIN_WORK_SECTION) &&
        exercise.equipmentOptions.some((item) => available.includes(item)),
    ).length
    check(
      `main work — ${tier}`,
      anchors > 0
        ? []
        : [
            `tier "${tier}": no ${MAIN_WORK_SECTION} exercise usable with ${available.join(', ')} ` +
              `is marked can_be_primary, so Goal ${needsMainWork.map((goal) => `"${goal}"`).join(', ')} ` +
              'has no main work to anchor on',
          ],
      `${anchors} can_be_primary ${MAIN_WORK_SECTION} exercises usable at this tier`,
    )
  }

  // =========================================================================
  // 3. Strict and relaxed retrieval, for every focus
  // =========================================================================

  for (const focus of rules.enums.session_focus) {
    const expected = recorded[focus]
    const cells = matrix.cells.filter(
      (cell) => cell.focus === focus && selectable.includes(cell.section),
    )
    check(
      `retrieval — ${focus}`,
      expected === undefined
        ? [`session_focus "${focus}" has no recorded retrieval in reviewed.FOCUS_RETRIEVAL`]
        : cells.flatMap((cell) => {
            const pair = expected[cell.tier]?.[cell.section]
            if (pair === undefined) {
              return [
                `focus "${focus}", tier "${cell.tier}", section "${cell.section}": ` +
                  `strict ${cell.strict}, relaxed ${cell.relaxed}, and nothing recorded`,
              ]
            }
            const [strict, relaxed] = pair
            return cell.strict === strict && cell.relaxed === relaxed
              ? []
              : [
                  `focus "${focus}", tier "${cell.tier}", section "${cell.section}": ` +
                    `strict ${cell.strict} (recorded ${strict}), ` +
                    `relaxed ${cell.relaxed} (recorded ${relaxed})`,
                ]
          }),
      `${cells.length} tier × section results as recorded; ` +
        `${cells.filter((cell) => cell.floorApplied).length} served relaxed under the floor of ${rules.floor}`,
    )
  }

  const strayFocuses = Object.keys(recorded).filter(
    (focus) => !rules.enums.session_focus.includes(focus),
  )
  check(
    'every recorded focus is a session focus',
    strayFocuses.map((focus) => `recorded retrieval for "${focus}", which is not a session_focus`),
    `${rules.enums.session_focus.length} focuses, each recorded`,
  )

  return checks
}
