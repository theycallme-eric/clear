/**
 * GR-01 — the legal-state matrix, as a pure function of its inputs.
 *
 * `buildMatrix` takes the retrieval rules (`rules.mjs`), the seeded catalog and
 * the onboarding vocabularies, and returns every state the product permits with
 * its per-section candidate counts and one classification. It reads no file and
 * opens no connection, so the command and the test hand it the same inputs and
 * must get the same bytes.
 *
 * What a state is. Retrieval answers one question per section — how many
 * exercises survive focus, section, equipment and exclusions — so a state is
 * whatever changes that answer or changes which sections are asked for:
 *
 *   goal × focus × equipment tier (its preset equipment) × saved section
 *   profile × at most one `exclude` constraint.
 *
 * The saved section profiles are the goal's onboarding preset, that preset with
 * each remaining section switched on, and every section at once. A goal with a
 * section override (active recovery) ignores the profile, so it has one. Counts
 * do not depend on the goal beyond that, so a profile saved under one goal and
 * requested under another has the counts of the row carrying its sections.
 *
 * Constraints are evaluated for every target of every scope against every
 * goal × focus × tier at the preset profile. Each target gets a tally row in
 * `constraints`; a constrained state is written out in `states` only where the
 * constraint changes the classification, because 163 targets × 80 states of
 * unchanged rows would bury the ones that matter.
 *
 * The predicates in `eligible` are `generation_candidates`'
 * (supabase/migrations/20260921000005_generation_candidates.sql §3), in its
 * order. `src/test/generation-reliability/legal-state-matrix.test.ts` holds the
 * counts against the retrieval double, which transcribes the same function.
 */

/** The closed set. A row outside it fails `validateMatrix`. */
export const CLASSIFICATIONS = Object.freeze([
  'supported',
  'supported-with-recorded-relaxation',
  'legitimate-constraint-refusal',
  'unsupported-product-state',
])

const [SUPPORTED, RELAXED, CONSTRAINT_REFUSAL, UNSUPPORTED] = CLASSIFICATIONS

/** The only action that filters; `avoid` and `prefer_not` reach the model as a list. */
const FILTERING_ACTION = 'exclude'

export const MATRIX_VERSION = 1

/** Where the catalog and the presets are committed, beside the migrations. */
const CONTENT_SOURCES = Object.freeze([
  'supabase/seed/010_exercise_definitions.sql',
  'supabase/seed/030_exercise_pattern_weights.sql',
  'src/state/onboarding.ts',
])

/**
 * @typedef {object} CatalogExercise
 * @property {string} id
 * @property {readonly string[]} equipmentOptions
 * @property {readonly string[]} sections
 * @property {string} exerciseRole
 * @property {readonly string[]} movementPatterns
 */

/**
 * @typedef {object} MatrixInputs
 * @property {import('./rules.mjs').RetrievalRules} rules
 * @property {readonly CatalogExercise[]} catalog
 * @property {Readonly<Record<string, readonly string[]>>} equipmentByTier
 * @property {Readonly<Record<string, readonly string[]>>} sectionsByGoal
 * @property {readonly string[]} equipment  Every equipment id the product offers.
 */

/** @typedef {{ scope: string, target: string }} Constraint */

/**
 * @param {MatrixInputs} inputs
 */
export function buildMatrix(inputs) {
  const { rules, catalog, equipmentByTier, sectionsByGoal, equipment } = inputs
  const { enums, floor } = rules
  const sectionTypes = enums.section_type

  for (const tier of enums.equipment_tier) {
    if (equipmentByTier[tier] === undefined) {
      throw new Error(`equipment_tier "${tier}" has no preset equipment`)
    }
  }
  for (const goal of enums.goal_preset) {
    if (sectionsByGoal[goal] === undefined) {
      throw new Error(`goal_preset "${goal}" has no section preset`)
    }
  }
  for (const focus of enums.session_focus) {
    if (rules.focusPatterns[focus] === undefined) {
      throw new Error(`session_focus "${focus}" has no focus_pattern_map rows`)
    }
  }

  /**
   * `generation_candidates`, one section, as a count.
   *
   * @param {string} section
   * @param {string} focus
   * @param {readonly string[]} available
   * @param {Constraint | null} constraint
   * @param {boolean} relax
   */
  const count = (section, focus, available, constraint, relax) => {
    const admitted = rules.focusPatterns[focus]
    const excluded = (/** @type {string} */ scope) =>
      constraint !== null && constraint.scope === scope ? constraint.target : null
    const excludedExercise = excluded('exercise')
    const excludedPattern = excluded('movement_pattern')
    const excludedEquipment = excluded('equipment')

    return catalog.filter((exercise) => {
      // `usable_equipment`: a narrowing, not a rejection.
      const usable = exercise.equipmentOptions.filter(
        (item) => available.includes(item) && item !== excludedEquipment,
      )

      return (
        (relax ||
          exercise.movementPatterns.some((pattern) => admitted.includes(pattern)) ||
          rules.focusExemptRoles.includes(exercise.exerciseRole)) &&
        exercise.sections.includes(section) &&
        exercise.equipmentOptions.some((item) => available.includes(item)) &&
        usable.length > 0 &&
        exercise.id !== excludedExercise &&
        !exercise.movementPatterns.some((pattern) => pattern === excludedPattern)
      )
    }).length
  }

  /** `generation_candidate_sets`' floor: under it, the section is retrieved relaxed. */
  const retrieve = (
    /** @type {string} */ section,
    /** @type {string} */ focus,
    /** @type {string} */ tier,
    /** @type {Constraint | null} */ constraint,
  ) => {
    const available = equipmentByTier[tier]
    const strict = count(section, focus, available, constraint, false)
    const floorApplied = strict < floor
    const relaxed = count(section, focus, available, constraint, true)

    return { section, strict, relaxed, floorApplied, served: floorApplied ? relaxed : strict }
  }

  // ── Section × tier: is there anything in the catalog at all ───────────────

  const sectionTiers = sectionTypes.flatMap((section) => {
    const catalogRows = catalog.filter((exercise) => exercise.sections.includes(section)).length

    return enums.equipment_tier.map((tier) => {
      // Relaxed, so no focus is involved: the most this tier can ever offer.
      const candidates = count(
        section,
        enums.session_focus[0],
        equipmentByTier[tier],
        null,
        true,
      )

      return {
        id: `${section}/${tier}`,
        section,
        tier,
        catalogRows,
        candidates,
        classification: candidates === 0 ? UNSUPPORTED : SUPPORTED,
      }
    })
  })

  // ── Section × tier × focus: what one retrieval returns ────────────────────

  const cells = enums.equipment_tier.flatMap((tier) =>
    enums.session_focus.flatMap((focus) =>
      sectionTypes.map((section) => {
        const { strict, relaxed, floorApplied } = retrieve(section, focus, tier, null)

        return {
          id: `${tier}/${focus}/${section}`,
          tier,
          focus,
          section,
          strict,
          relaxed,
          floorApplied,
          classification: relaxed === 0 ? UNSUPPORTED : floorApplied ? RELAXED : SUPPORTED,
        }
      }),
    ),
  )

  // ── Saved section profiles ────────────────────────────────────────────────

  const inEnumOrder = (/** @type {readonly string[]} */ chosen) =>
    sectionTypes.filter((section) => chosen.includes(section))

  /** @param {string} goal */
  const profilesFor = (goal) => {
    const override = rules.goalSectionOverrides[goal]
    if (override !== undefined) {
      return [{ profile: 'goal-override', customization: null, sections: [...override] }]
    }

    const preset = inEnumOrder(sectionsByGoal[goal])

    return [
      { profile: 'preset', customization: null, sections: preset },
      ...sectionTypes
        .filter((section) => !preset.includes(section))
        .map((section) => ({
          profile: `preset+${section}`,
          customization: { added: [section] },
          sections: inEnumOrder([...preset, section]),
        })),
      {
        profile: 'all-sections',
        customization: { added: sectionTypes.filter((section) => !preset.includes(section)) },
        sections: [...sectionTypes],
      },
    ]
  }

  /**
   * One state. `baseline` is the same state without the constraint, which is
   * what separates a refusal the constraint caused from one it merely met.
   */
  const state = (
    /** @type {string} */ goal,
    /** @type {string} */ focus,
    /** @type {string} */ tier,
    /** @type {ReturnType<typeof profilesFor>[number]} */ profile,
    /** @type {Constraint | null} */ constraint,
    /** @type {{ failsBeforeComposition: boolean } | null} */ baseline,
  ) => {
    const sections = profile.sections.map((section) => {
      const { strict, relaxed, floorApplied } = retrieve(section, focus, tier, constraint)
      return { section, strict, relaxed, floorApplied }
    })
    const emptySections = sections
      .filter((section) => section.relaxed === 0)
      .map((section) => section.section)
    const failsBeforeComposition = emptySections.length > 0

    let classification = SUPPORTED
    if (failsBeforeComposition) {
      classification =
        baseline !== null && !baseline.failsBeforeComposition ? CONSTRAINT_REFUSAL : UNSUPPORTED
    } else if (sections.some((section) => section.floorApplied)) {
      classification = RELAXED
    }

    const base = `${goal}/${focus}/${tier}/${profile.profile}`

    return {
      id:
        constraint === null
          ? base
          : `${base}/${FILTERING_ACTION}:${constraint.scope}:${constraint.target}`,
      goal,
      focus,
      tier,
      profile: profile.profile,
      customization: profile.customization,
      constraint:
        constraint === null ? null : { action: FILTERING_ACTION, ...constraint },
      sections,
      relaxedSections: sections
        .filter((section) => section.floorApplied)
        .map((section) => section.section),
      emptySections,
      failsBeforeComposition,
      classification,
    }
  }

  const combinations = enums.goal_preset.flatMap((goal) =>
    enums.session_focus.flatMap((focus) =>
      enums.equipment_tier.map((tier) => ({ goal, focus, tier })),
    ),
  )

  const states = combinations.flatMap(({ goal, focus, tier }) =>
    profilesFor(goal).map((profile) => state(goal, focus, tier, profile, null, null)),
  )

  // ── Constraints ───────────────────────────────────────────────────────────

  /** @type {Record<string, readonly string[]>} */
  const targetsByScope = {
    exercise: catalog.map((exercise) => exercise.id).sort(),
    movement_pattern: enums.movement_pattern,
    equipment,
  }

  const constrainedStates = []
  const constraints = []

  for (const scope of enums.constraint_scope) {
    const targets = targetsByScope[scope]
    if (targets === undefined) {
      throw new Error(`constraint_scope "${scope}" has no retrieval predicate in the matrix`)
    }

    for (const target of targets) {
      /** @type {Record<string, number>} */
      const classifications = Object.fromEntries(CLASSIFICATIONS.map((name) => [name, 0]))
      let statesChanged = 0

      for (const { goal, focus, tier } of combinations) {
        const [preset] = profilesFor(goal)
        const baseline = state(goal, focus, tier, preset, null, null)
        const constrained = state(goal, focus, tier, preset, { scope, target }, baseline)

        classifications[constrained.classification] += 1
        if (constrained.classification !== baseline.classification) {
          statesChanged += 1
          constrainedStates.push(constrained)
        }
      }

      constraints.push({
        id: `${FILTERING_ACTION}:${scope}:${target}`,
        scope,
        target,
        statesEvaluated: combinations.length,
        statesChanged,
        classifications,
      })
    }
  }

  const allStates = [...states, ...constrainedStates]
  const tally = (/** @type {{ classification: string }[]} */ rows) =>
    Object.fromEntries(
      CLASSIFICATIONS.map((name) => [
        name,
        rows.filter((row) => row.classification === name).length,
      ]),
    )

  return {
    version: MATRIX_VERSION,
    generatedBy: 'npm run gr:matrix',
    notes: [
      'Generated. Do not edit; run `npm run gr:matrix` and commit the result.',
      'strict is the count with the focus pattern predicate; relaxed is the count without it.',
      'floorApplied is true where strict is under the floor, which is where retrieval serves the relaxed list and records it.',
      'A state fails before composition when any required section has no candidate even relaxed.',
      'Constrained states are evaluated at the preset profile and listed only where the constraint changes the classification; `constraints` tallies every one evaluated.',
    ],
    sources: [...rules.sources, ...CONTENT_SOURCES],
    catalogRows: catalog.length,
    floor,
    classifications: [...CLASSIFICATIONS],
    dimensions: {
      sectionTypes: [...sectionTypes],
      goals: enums.goal_preset.map((goal) => ({
        goal,
        sectionPreset: inEnumOrder(sectionsByGoal[goal]),
        overridesProfileSections: rules.goalSectionOverrides[goal] !== undefined,
      })),
      focuses: enums.session_focus.map((focus) => ({
        focus,
        patterns: [...rules.focusPatterns[focus]],
      })),
      tiers: enums.equipment_tier.map((tier) => ({
        tier,
        equipment: [...equipmentByTier[tier]],
      })),
      focusExemptRoles: [...rules.focusExemptRoles],
      constraintScopes: enums.constraint_scope.map((scope) => ({
        scope,
        targets: targetsByScope[scope].length,
      })),
      constraintActions: enums.constraint_action.map((action) => ({
        action,
        filtersRetrieval: action === FILTERING_ACTION,
      })),
      constraintPersistences: [...enums.constraint_persistence],
    },
    summary: {
      sectionTiers: tally(sectionTiers),
      cells: tally(cells),
      unconstrainedStates: tally(states),
      constrainedStatesListed: tally(constrainedStates),
      statesFailingBeforeComposition: allStates.filter((row) => row.failsBeforeComposition)
        .length,
    },
    sectionTiers,
    cells,
    states: allStates,
    constraints,
  }
}

/** The arrays of rows, each of which must carry a classification. */
const CLASSIFIED_ROWS = ['sectionTiers', 'cells', 'states']

/**
 * Why `matrix` is not an acceptable matrix for `enums`, one sentence each.
 * Empty when it is.
 *
 * @param {any} matrix  Parsed JSON, so nothing about its shape is assumed.
 * @param {Record<string, string[]>} enums
 * @returns {string[]}
 */
export function validateMatrix(matrix, enums) {
  const problems = []
  const rows = (/** @type {string} */ key) => (Array.isArray(matrix?.[key]) ? matrix[key] : [])

  for (const key of CLASSIFIED_ROWS) {
    if (rows(key).length === 0) problems.push(`${key} has no rows`)
    for (const row of rows(key)) {
      if (!CLASSIFICATIONS.includes(row?.classification)) {
        problems.push(
          `${key} row ${row?.id ?? '(no id)'} is unclassified: ${JSON.stringify(row?.classification)}`,
        )
      }
    }
  }

  for (const row of rows('constraints')) {
    const tallies = Object.entries(row?.classifications ?? {})
    const stray = tallies.filter(([name]) => !CLASSIFICATIONS.includes(name))
    const total = tallies.reduce((sum, [, value]) => sum + Number(value), 0)
    if (stray.length > 0 || total !== row?.statesEvaluated || total === 0) {
      problems.push(`constraints row ${row?.id ?? '(no id)'} leaves a state unclassified`)
    }
  }

  /** Every enum value must be a value some row actually carries. */
  const coverage = [
    ['section_type', 'cells', 'section'],
    ['session_focus', 'cells', 'focus'],
    ['equipment_tier', 'cells', 'tier'],
    ['section_type', 'sectionTiers', 'section'],
    ['equipment_tier', 'sectionTiers', 'tier'],
    ['goal_preset', 'states', 'goal'],
    ['session_focus', 'states', 'focus'],
    ['equipment_tier', 'states', 'tier'],
    ['constraint_scope', 'constraints', 'scope'],
  ]
  for (const [name, key, field] of coverage) {
    const seen = new Set(rows(key).map((/** @type {any} */ row) => row?.[field]))
    for (const value of enums[name] ?? []) {
      if (!seen.has(value)) problems.push(`${name} "${value}" appears in no ${key} row`)
    }
  }

  const required = new Set(
    rows('states').flatMap((/** @type {any} */ row) =>
      (row?.sections ?? []).map((/** @type {any} */ section) => section?.section),
    ),
  )
  for (const section of enums.section_type ?? []) {
    if (!required.has(section)) problems.push(`section_type "${section}" is required by no state`)
  }

  return problems
}

/**
 * The file's bytes. Top-level keys are indented; a row is one line, so a diff
 * of the committed matrix reads as the states that changed.
 *
 * @param {Record<string, unknown>} matrix
 * @returns {string}
 */
export function serializeMatrix(matrix) {
  const entries = Object.entries(matrix).map(([key, value]) => {
    const isRows =
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((row) => typeof row === 'object' && row !== null && 'id' in row)
    const body = isRows
      ? `[\n${value.map((row) => `    ${JSON.stringify(row)}`).join(',\n')}\n  ]`
      : JSON.stringify(value, null, 2).replaceAll('\n', '\n  ')

    return `  ${JSON.stringify(key)}: ${body}`
  })

  return `{\n${entries.join(',\n')}\n}\n`
}
