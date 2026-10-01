/**
 * GR-02 / REQ-003 — the section-mapping ledger's rules.
 *
 * `docs/process/generation-reliability/section-mapping-ledger.json` is written
 * by review, not generated: each row proposes one exercise's added section
 * membership and says why. `validateLedger` is what keeps a reviewed file
 * honest. It takes the ledger, the pre-change capture, the committed seed and a
 * way to read a cited file, and returns one message per broken rule — no file
 * access of its own, so a test can hand it a tampered copy of any input.
 *
 * What it holds:
 *
 *   * a row names an exercise the catalog has, once, with `before` equal to the
 *     capture and an `after` that differs from it;
 *   * a row carries evidence and a rationale, and every piece of evidence
 *     resolves — a cited tag is on the exercise, a cited quote is in the file;
 *   * a tag leaves an exercise only where the row says why;
 *   * the seed differs from the capture only where a row says so, and then only
 *     by landing on that row's `after`;
 *   * an ambiguous exercise is listed apart from the rows, with the same
 *     evidence rule and a recommendation from a closed set;
 *   * a row that makes an exercise primary also puts it in `primary_lift`, so
 *     the flag and the section cannot be proposed apart.
 *
 * `projectCatalog` is the catalog as it would be with every row applied — the
 * input the dispositions (`dispositions.mjs`) are computed from.
 *
 * This module changes nothing. Applying the ledger to the seed is a later task.
 */
import { readFileSync } from 'node:fs'

export const LEDGER_PATH = 'docs/process/generation-reliability/section-mapping-ledger.json'

/** The three sections the preserved catalog left empty. */
export const LEDGER_SECTIONS = Object.freeze(['skill_power', 'carries', 'stability_balance'])

/**
 * REQ-005: the section Minimal-tier main work is proposed for. Not empty in the
 * catalog — empty at the Minimal tier, which is a different finding.
 */
export const MAIN_WORK_SECTION = 'primary_lift'

/** Every section a row may add to. */
export const PROPOSED_SECTIONS = Object.freeze([...LEDGER_SECTIONS, MAIN_WORK_SECTION])

/** The closed set. `add` carries the proposed `after`; `leave` proposes nothing. */
export const RECOMMENDATIONS = Object.freeze(['add', 'leave'])

/**
 * @typedef {object} Membership
 * @property {string[]} sections
 * @property {boolean} canBePrimary
 */

/**
 * @typedef {object} LedgerRow
 * @property {string} id
 * @property {string} change
 * @property {Membership} before
 * @property {Membership} after
 * @property {string[]} evidence
 * @property {string} rationale
 * @property {string} [removalRationale]  Required when `after` drops a tag.
 */

/**
 * @typedef {object} AmbiguousRow
 * @property {string} id
 * @property {string} section
 * @property {string[]} evidence
 * @property {string} recommendation
 * @property {string} rationale
 */

/**
 * @typedef {object} Ledger
 * @property {number} version
 * @property {string[]} notes
 * @property {string} capture
 * @property {Record<string, { path: string, quote: string }>} references
 * @property {LedgerRow[]} rows
 * @property {AmbiguousRow[]} ambiguous
 */

/**
 * What the catalog already says about one exercise — the facts a row may cite.
 *
 * @typedef {object} ExerciseFacts
 * @property {string} name
 * @property {readonly string[]} components     Reviewed `component_movements`.
 * @property {string} role                      Reviewed `exercise_role`.
 * @property {readonly string[]} legacyAnchors  Captured `exercise_anchors`.
 * @property {readonly string[]} cues           Captured `coaching_cues`.
 * @property {readonly string[]} equipment      Seeded `equipment_options`.
 */

/**
 * @typedef {object} LedgerContext
 * @property {ReadonlyMap<string, Membership>} capture  The pre-change capture.
 * @property {ReadonlyMap<string, Membership>} seed     The committed seed.
 * @property {ReadonlyMap<string, ExerciseFacts>} facts
 * @property {readonly string[]} sectionTypes           `section_type`.
 * @property {(path: string) => string | null} readSource  A cited file, or null.
 */

/**
 * @param {string} root
 * @returns {Ledger}
 */
export function loadLedger(root) {
  return JSON.parse(readFileSync(`${root}/${LEDGER_PATH}`, 'utf8'))
}

/** @param {unknown} value */
const filled = (value) => typeof value === 'string' && value.trim() !== ''

/** Quotes are matched across the line breaks a wrapped source puts in them. */
const squash = (/** @type {string} */ text) => text.replace(/\s+/g, ' ')

/**
 * @param {readonly string[]} left
 * @param {readonly string[]} right
 */
const sameSet = (left, right) =>
  left.length === right.length && left.every((value) => right.includes(value))

/**
 * @param {Membership} left
 * @param {Membership} right
 */
const sameMembership = (left, right) =>
  left.canBePrimary === right.canBePrimary && sameSet(left.sections, right.sections)

/**
 * One piece of evidence, as `kind:value`. Returns why it does not resolve, or
 * null when it does.
 *
 * @param {string} evidence
 * @param {ExerciseFacts} facts
 * @param {Ledger} ledger
 * @param {LedgerContext} context
 * @returns {string | null}
 */
function unresolved(evidence, facts, ledger, context) {
  if (!filled(evidence)) return 'is empty'

  const split = evidence.indexOf(':')
  const kind = evidence.slice(0, split)
  const value = evidence.slice(split + 1)
  if (split === -1 || value === '') return `"${evidence}" is not kind:value`

  switch (kind) {
    case 'component':
      return facts.components.includes(value) ? null : `cites component "${value}" it does not carry`
    case 'role':
      return facts.role === value ? null : `cites role "${value}" but its role is "${facts.role}"`
    case 'legacy-anchor':
      return facts.legacyAnchors.includes(value)
        ? null
        : `cites legacy anchor "${value}" the capture does not hold`
    case 'name':
      return facts.name.toLowerCase().includes(value.toLowerCase())
        ? null
        : `cites "${value}" in a name that is "${facts.name}"`
    case 'cue':
      return facts.cues.includes(value) ? null : `cites coaching cue "${value}" it does not carry`
    case 'equipment':
      return facts.equipment.includes(value)
        ? null
        : `cites equipment "${value}" it cannot be done with`
    case 'ref': {
      const reference = ledger.references?.[value]
      if (reference === undefined) return `cites reference "${value}" the ledger does not define`
      const source = context.readSource(reference.path)
      if (source === null) return `cites "${reference.path}", which does not exist`
      return squash(source).includes(squash(reference.quote))
        ? null
        : `cites a quote "${reference.path}" does not contain`
    }
    default:
      return `"${evidence}" has an unknown evidence kind`
  }
}

/**
 * @param {{ id: string, evidence: string[], rationale: string }} entry
 * @param {string} label
 * @param {Ledger} ledger
 * @param {LedgerContext} context
 * @returns {string[]}
 */
function unsupported(entry, label, ledger, context) {
  /** @type {string[]} */
  const errors = []
  const facts = context.facts.get(entry.id)

  if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) {
    errors.push(`${label} has no evidence`)
  } else if (facts !== undefined) {
    for (const evidence of entry.evidence) {
      const reason = unresolved(evidence, facts, ledger, context)
      if (reason !== null) errors.push(`${label} evidence ${reason}`)
    }
  }
  if (!filled(entry.rationale)) errors.push(`${label} has no rationale`)

  return errors
}

/**
 * @param {Ledger} ledger
 * @param {LedgerContext} context
 * @returns {string[]} One message per broken rule; empty when the ledger holds.
 */
export function validateLedger(ledger, context) {
  /** @type {string[]} */
  const errors = []
  /** @type {Map<string, LedgerRow>} */
  const rows = new Map()

  for (const [key, reference] of Object.entries(ledger.references ?? {})) {
    if (!filled(reference.path) || !filled(reference.quote)) {
      errors.push(`reference "${key}" needs a path and a quote`)
    }
  }

  for (const row of ledger.rows) {
    const label = `row "${row.id}"`
    const captured = context.capture.get(row.id)

    if (rows.has(row.id)) errors.push(`${label} appears twice`)
    rows.set(row.id, row)

    if (captured === undefined || !context.seed.has(row.id)) {
      errors.push(`${label} names an exercise the catalog does not have`)
      continue
    }

    errors.push(...unsupported(row, label, ledger, context))
    if (!filled(row.change)) errors.push(`${label} does not name its change`)

    if (!sameMembership(row.before, captured)) {
      errors.push(`${label} before does not match the pre-change capture`)
    }
    if (sameMembership(row.before, row.after)) errors.push(`${label} changes nothing`)

    for (const section of row.after.sections) {
      if (!context.sectionTypes.includes(section)) {
        errors.push(`${label} after has "${section}", which is not a section_type`)
      }
    }
    if (new Set(row.after.sections).size !== row.after.sections.length) {
      errors.push(`${label} after repeats a section`)
    }

    if (
      row.after.canBePrimary &&
      !row.before.canBePrimary &&
      !row.after.sections.includes(MAIN_WORK_SECTION)
    ) {
      errors.push(`${label} makes it primary without adding ${MAIN_WORK_SECTION}`)
    }

    const removed = row.before.sections.filter((section) => !row.after.sections.includes(section))
    if (removed.length > 0 && !filled(row.removalRationale)) {
      errors.push(`${label} removes ${removed.join(', ')} without a removalRationale`)
    }
  }

  // The seed may differ from the capture only where a row says so.
  for (const [id, captured] of context.capture) {
    const seeded = context.seed.get(id)
    if (seeded === undefined) {
      errors.push(`exercise "${id}" is in the capture and not in the seed`)
      continue
    }
    if (sameMembership(seeded, captured)) continue

    const row = rows.get(id)
    if (row === undefined) {
      errors.push(`exercise "${id}" differs from the pre-change capture and has no ledger row`)
    } else if (!sameMembership(seeded, row.after)) {
      errors.push(`exercise "${id}" differs from the capture and from its ledger row's after`)
    }
  }
  for (const id of context.seed.keys()) {
    if (!context.capture.has(id)) {
      errors.push(`exercise "${id}" is in the seed and not in the pre-change capture`)
    }
  }

  /** @type {Set<string>} */
  const listed = new Set()
  for (const entry of ledger.ambiguous) {
    const label = `ambiguous "${entry.id}"/${entry.section}`
    const captured = context.capture.get(entry.id)

    if (listed.has(label)) errors.push(`${label} appears twice`)
    listed.add(label)

    if (captured === undefined) {
      errors.push(`${label} names an exercise the catalog does not have`)
      continue
    }

    errors.push(...unsupported(entry, label, ledger, context))
    if (!context.sectionTypes.includes(entry.section)) {
      errors.push(`${label} is not a section_type`)
    }
    if (!RECOMMENDATIONS.includes(entry.recommendation)) {
      errors.push(`${label} has no recommendation from ${RECOMMENDATIONS.join(' | ')}`)
    }
    if (captured.sections.includes(entry.section)) {
      errors.push(`${label} is already tagged; there is nothing to decide`)
    }
    // Listed separately means separately: a row has already decided it.
    const row = rows.get(entry.id)
    if (
      row !== undefined &&
      row.after.sections.includes(entry.section) !== row.before.sections.includes(entry.section)
    ) {
      errors.push(`${label} is also changed by a ledger row`)
    }
  }

  return errors
}

/**
 * The sections a row adds — what it proposes, as opposed to what it preserves.
 *
 * @param {LedgerRow} row
 * @returns {string[]}
 */
export function addedSections(row) {
  return row.after.sections.filter((section) => !row.before.sections.includes(section))
}

/**
 * The catalog as it would be with every row applied: what the ledger proposes,
 * as the retrieval predicates would read it. The seed files are not touched.
 *
 * @template {{ id: string, sections: readonly string[], canBePrimary: boolean }} T
 * @param {readonly T[]} catalog
 * @param {Pick<Ledger, 'rows'>} ledger
 * @returns {T[]}
 */
export function projectCatalog(catalog, ledger) {
  const rows = new Map(ledger.rows.map((row) => [row.id, row]))
  for (const id of rows.keys()) {
    if (!catalog.some((exercise) => exercise.id === id)) {
      throw new Error(`ledger row "${id}" names an exercise the catalog does not have`)
    }
  }

  return catalog.map((exercise) => {
    const row = rows.get(exercise.id)
    if (row === undefined) return exercise

    return { ...exercise, sections: [...row.after.sections], canBePrimary: row.after.canBePrimary }
  })
}
