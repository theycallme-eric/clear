/**
 * GR-02 / REQ-006 — one disposition for every legal configuration.
 *
 * The legal-state matrix (`matrix.mjs`) says what the seed can serve today. This
 * module answers the question the repair has to settle before anything is
 * applied: with the section-mapping ledger in force, is each configuration
 * supported by catalog content, or prevented at the preference boundary — and
 * if prevented, by which choice.
 *
 * `buildDispositions` is a pure function of the *projected* matrix: the matrix
 * built from the seed with every ledger row applied (`projectCatalog`). It
 * reads no file, so the command and the test hand it the same inputs and must
 * get the same bytes. Nothing here changes the seed, the ledger or a migration.
 *
 * A configuration is a matrix state. Its disposition is:
 *
 *   * `supported` — every required section has a candidate, strictly or
 *     through the recorded relaxation;
 *   * `prevented` — a required section has none, and for each such section the
 *     row names the choice that empties it. There are two kinds. The section
 *     itself, where nothing tagged with it can be done with the equipment (the
 *     reason lists what it would take). Or an `exclude` constraint, where the
 *     section has candidates until the constraint removes them.
 *
 * A section with no catalog rows at all is neither: no choice of the athlete's
 * caused it and no equipment would fix it. That row is left `unresolved`, which
 * `validateDispositions` refuses — the finding is a catalog defect, and it must
 * not be written down as a preference the athlete got wrong.
 */
import { MATRIX_VERSION } from './matrix.mjs'
import { LEDGER_PATH } from './section-ledger.mjs'

export const DISPOSITIONS_PATH = 'docs/process/generation-reliability/configuration-dispositions.json'

/** The closed set. A row outside it fails `validateDispositions`. */
export const DISPOSITIONS = Object.freeze(['supported', 'prevented'])

const [SUPPORTED, PREVENTED] = DISPOSITIONS

/** What `buildDispositions` writes when it cannot name a cause. Never valid. */
export const UNRESOLVED = 'unresolved'

export const DISPOSITIONS_VERSION = 1

/**
 * @typedef {object} Cause
 * @property {string} section             The required section left empty.
 * @property {string} incompatibleChoice  The choice that empties it.
 * @property {string} reason
 * @property {string[]} [requiresOneOf]   Equipment that would make it possible.
 */

/**
 * @typedef {object} DispositionInputs
 * @property {ReturnType<typeof import('./matrix.mjs').buildMatrix>} matrix
 *   The projected matrix: seed plus ledger.
 * @property {readonly { id: string, sections: readonly string[], equipmentOptions: readonly string[] }[]} catalog
 *   The projected catalog that matrix was built from.
 * @property {number} ledgerRows
 */

/**
 * @param {DispositionInputs} inputs
 */
export function buildDispositions({ matrix, catalog, ledgerRows }) {
  const equipmentOf = (/** @type {string} */ tier) =>
    matrix.dimensions.tiers.find((row) => row.tier === tier)?.equipment ?? []

  /**
   * Why `section` is empty for this state, or null when no choice explains it.
   *
   * @param {string} section
   * @param {(typeof matrix.states)[number]} state
   * @returns {Cause | null}
   */
  const cause = (section, state) => {
    const offered = matrix.sectionTiers.find(
      (row) => row.section === section && row.tier === state.tier,
    )
    if (offered === undefined || offered.catalogRows === 0) return null

    if (offered.candidates === 0) {
      const requiresOneOf = [
        ...new Set(
          catalog
            .filter((exercise) => exercise.sections.includes(section))
            .flatMap((exercise) => exercise.equipmentOptions),
        ),
      ].sort()

      return {
        section,
        incompatibleChoice: `section ${section} with ${state.tier} equipment`,
        requiresOneOf,
        reason: `No ${section} exercise can be done with ${equipmentOf(state.tier).join(', ')}; every one needs ${requiresOneOf.join(' or ')}.`,
      }
    }

    // The tier can fill the section, so only the constraint can have emptied it.
    if (state.constraint === null) return null
    const { action, scope, target } = state.constraint

    return {
      section,
      incompatibleChoice: `${action} ${scope} ${target}`,
      reason: `Excluding ${scope} ${target} removes every ${section} candidate the ${state.tier} equipment has.`,
    }
  }

  const configurations = matrix.states.map((state) => {
    const causes = state.emptySections.map((section) => cause(section, state))
    const preventedBy = causes.flatMap((entry) => (entry === null ? [] : [entry]))

    let disposition = SUPPORTED
    if (causes.length > 0) disposition = causes.includes(null) ? UNRESOLVED : PREVENTED

    return {
      id: state.id,
      goal: state.goal,
      focus: state.focus,
      tier: state.tier,
      profile: state.profile,
      constraint: state.constraint,
      disposition,
      relaxedSections: state.relaxedSections,
      emptySections: state.emptySections,
      preventedBy,
    }
  })

  // ── The onboarding combinations: tier × Goal at the Goal's own preset ──────

  const presets = matrix.dimensions.tiers.flatMap(({ tier }) =>
    matrix.dimensions.goals.map(({ goal }) => {
      const rows = configurations.filter(
        (row) =>
          row.tier === tier &&
          row.goal === goal &&
          row.constraint === null &&
          (row.profile === 'preset' || row.profile === 'goal-override'),
      )
      const all = (/** @type {string} */ name) =>
        rows.length > 0 && rows.every((row) => row.disposition === name)

      return {
        id: `${tier}/${goal}`,
        tier,
        goal,
        focuses: rows.map((row) => row.focus),
        // A Goal is not half-offered: one focus that cannot generate is the
        // whole combination's disposition.
        disposition: all(SUPPORTED) ? SUPPORTED : all(PREVENTED) ? PREVENTED : UNRESOLVED,
        preventedBy: uniqueCauses(rows.flatMap((row) => row.preventedBy)),
      }
    }),
  )

  // ── What a save has to refuse: the section × tier pairs with no candidate ──

  const preventions = matrix.sectionTiers
    .filter((row) => row.candidates === 0 && row.catalogRows > 0)
    .map((row) => {
      const affected = configurations.filter(
        (configuration) =>
          configuration.tier === row.tier && configuration.emptySections.includes(row.section),
      )
      const [first] = affected.flatMap((configuration) =>
        configuration.preventedBy.filter((entry) => entry.section === row.section),
      )

      return {
        id: row.id,
        section: row.section,
        tier: row.tier,
        equipment: equipmentOf(row.tier),
        incompatibleChoice: first?.incompatibleChoice ?? '',
        requiresOneOf: first?.requiresOneOf ?? [],
        reason: first?.reason ?? '',
        configurations: affected.length,
      }
    })

  const count = (/** @type {{ disposition: string }[]} */ rows, /** @type {string} */ name) =>
    rows.filter((row) => row.disposition === name).length
  const tally = (/** @type {{ disposition: string }[]} */ rows) =>
    Object.fromEntries([...DISPOSITIONS, UNRESOLVED].map((name) => [name, count(rows, name)]))

  return {
    version: DISPOSITIONS_VERSION,
    generatedBy: 'npm run gr:dispositions',
    notes: [
      'Generated. Do not edit; run `npm run gr:dispositions` and commit the result.',
      'Computed from the committed seed with every row of the section-mapping ledger applied. The seed carries those rows since the catalog repair, so this is the seeded catalog; no database is read or changed by it.',
      'A configuration is a legal-state matrix state: goal × focus × tier × saved section profile × at most one exclude constraint. Constrained states are listed where the constraint changes the outcome, as in the matrix.',
      'supported means every required section has a candidate, strictly or through the recorded relaxation (relaxedSections).',
      'prevented means a required section has none. preventedBy names, per empty section, the choice that causes it: the section itself where the equipment cannot serve it, or the exclude constraint where it removes the candidates the equipment had.',
      'presets is the onboarding view: each equipment tier × Goal at the Goal’s own sections, over every Focus.',
      'preventions is what a preference save has to refuse, whichever Goal or Focus it is saved under.',
    ],
    sources: [LEDGER_PATH, ...matrix.sources],
    matrixVersion: MATRIX_VERSION,
    catalogRows: matrix.catalogRows,
    ledgerRows,
    dispositions: [...DISPOSITIONS],
    summary: {
      presets: tally(presets),
      unconstrainedConfigurations: tally(configurations.filter((row) => row.constraint === null)),
      constrainedConfigurationsListed: tally(
        configurations.filter((row) => row.constraint !== null),
      ),
    },
    preventions,
    presets,
    configurations,
  }
}

/**
 * @param {Cause[]} causes
 * @returns {Cause[]}
 */
function uniqueCauses(causes) {
  const seen = new Map()
  for (const entry of causes) seen.set(`${entry.section}|${entry.incompatibleChoice}`, entry)
  return [...seen.values()]
}

/** @param {unknown} value */
const filled = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * Why `file` is not an acceptable record for `matrix`, one sentence each. Empty
 * when it is.
 *
 * @param {any} file  Parsed JSON, so nothing about its shape is assumed.
 * @param {{ states: { id: string, failsBeforeComposition: boolean }[] }} matrix
 *   The projected matrix the record must account for.
 * @param {Record<string, string[]>} enums
 * @returns {string[]}
 */
export function validateDispositions(file, matrix, enums) {
  const problems = []
  const rows = (/** @type {string} */ key) => (Array.isArray(file?.[key]) ? file[key] : [])

  /** @param {any} row @param {string} label */
  const check = (row, label) => {
    if (!DISPOSITIONS.includes(row?.disposition)) {
      problems.push(
        `${label} is neither supported nor prevented: ${JSON.stringify(row?.disposition)}`,
      )
      return
    }

    const causes = Array.isArray(row.preventedBy) ? row.preventedBy : []
    if (row.disposition === SUPPORTED && causes.length > 0) {
      problems.push(`${label} is supported and also names a cause`)
    }
    if (row.disposition === PREVENTED) {
      if (causes.length === 0) problems.push(`${label} is prevented without a reason`)
      for (const entry of causes) {
        if (!filled(entry?.incompatibleChoice)) {
          problems.push(`${label} is prevented without naming the incompatible choice`)
        }
        if (!filled(entry?.reason)) problems.push(`${label} is prevented without a reason`)
      }
    }
  }

  // Every legal configuration, once, and nothing the matrix does not have.
  const recorded = new Map()
  for (const row of rows('configurations')) {
    if (recorded.has(row?.id)) problems.push(`configuration ${row?.id} appears twice`)
    recorded.set(row?.id, row)
  }
  for (const state of matrix.states) {
    const row = recorded.get(state.id)
    if (row === undefined) {
      problems.push(`configuration ${state.id} has no disposition`)
      continue
    }

    check(row, `configuration ${state.id}`)
    if (row.disposition === SUPPORTED && state.failsBeforeComposition) {
      problems.push(`configuration ${state.id} is recorded as supported but has an empty section`)
    }
    if (row.disposition === PREVENTED && !state.failsBeforeComposition) {
      problems.push(`configuration ${state.id} is recorded as prevented but can generate`)
    }
  }
  const known = new Set(matrix.states.map((state) => state.id))
  for (const id of recorded.keys()) {
    if (!known.has(id)) problems.push(`configuration ${id} is not a legal state`)
  }

  // Every advertised onboarding combination.
  const presets = new Map(rows('presets').map((/** @type {any} */ row) => [row?.id, row]))
  for (const tier of enums.equipment_tier ?? []) {
    for (const goal of enums.goal_preset ?? []) {
      const row = presets.get(`${tier}/${goal}`)
      if (row === undefined) {
        problems.push(`onboarding combination ${tier}/${goal} has no disposition`)
        continue
      }

      check(row, `onboarding combination ${tier}/${goal}`)
      for (const focus of enums.session_focus ?? []) {
        if (!(row.focuses ?? []).includes(focus)) {
          problems.push(`onboarding combination ${tier}/${goal} does not cover focus ${focus}`)
        }
      }
    }
  }

  for (const row of rows('preventions')) {
    if (!filled(row?.incompatibleChoice) || !filled(row?.reason)) {
      problems.push(`prevention ${row?.id ?? '(no id)'} does not name its choice and reason`)
    }
  }

  return problems
}

/**
 * Why the committed text is not acceptable, one sentence each. Separated from
 * the command so the test can hand it a stale or incomplete file.
 *
 * @param {string | null} committed  The committed file, or null when absent.
 * @param {string} contents          What this run produces.
 * @param {Parameters<typeof validateDispositions>[1]} matrix
 * @param {Record<string, string[]>} enums
 * @returns {string[]}
 */
export function checkDispositions(committed, contents, matrix, enums) {
  if (committed === null) return [`${DISPOSITIONS_PATH} does not exist.`]

  const problems = []
  if (committed !== contents) {
    problems.push(`${DISPOSITIONS_PATH} is stale: it is not what the seed and ledger produce.`)
  }

  try {
    problems.push(...validateDispositions(JSON.parse(committed), matrix, enums))
  } catch {
    problems.push(`${DISPOSITIONS_PATH} is not valid JSON.`)
  }

  return problems
}
