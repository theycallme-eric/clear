/**
 * DATA-02 — `npm run seed`.
 *
 *     npm run seed              transform, verify, write the artifacts
 *     npm run seed -- --dev     …and the dev-only owner baseline
 *     npm run seed -- --check   verify and prove the artifacts are current,
 *                               writing nothing (for CI)
 *
 * The command reads two committed inputs and writes four files. It opens no
 * connection, reads no environment variable and needs no credential. Applying
 * the generated SQL belongs to the reviewed deployment/cutover path.
 *
 * GR-03: beside equivalence it holds the catalog to the viability invariants
 * in `viability.mjs`, against the tier and Goal presets onboarding renders.
 * Those are TypeScript, so the command loads `src/state/onboarding.ts` through
 * Vite's module runner, as `npm run gr:matrix` does; no dev server is started.
 *
 * Idempotent in both directions. Running it twice writes byte-identical
 * artifacts — every collection is sorted and no timestamp is emitted — and the
 * SQL it writes updates zero rows on a second apply.
 *
 * Exit codes: 0 if every check passed and (under `--check`) nothing had
 * drifted; 1 otherwise. There is no partial success — an artifact is not
 * written when verification fails, because a seed that cannot prove
 * equivalence has nothing to offer TASK-072.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { loadRetrievalRules } from '../generation-reliability/rules.mjs'
import { renderReport } from './report.mjs'
import * as reviewed from './reviewed.mjs'
import { REPO_ROOT } from './sources.mjs'
import { emitDefinitions, emitDevBaseline, emitMuscles, emitWeights } from './sql.mjs'
import { transform } from './transform.mjs'
import { verify } from './verify.mjs'
import { catalogOf, checkViability } from './viability.mjs'

const SEED_DIR = join(REPO_ROOT, 'supabase/seed')
const REPORT_PATH = join(REPO_ROOT, 'docs/backend/taxonomy-equivalence.md')
const ONBOARDING_MODULE = 'src/state/onboarding.ts'
const SELECTABILITY_MODULE = 'src/state/section-selectability.ts'

/**
 * @typedef {object} Artifact
 * @property {string} path     Absolute.
 * @property {string} label    Repository-relative, for the report.
 * @property {string} contents
 */

/**
 * Everything `npm run seed` would write, as strings. Separated from writing so
 * the tests can assert on the artifacts without touching the working tree.
 *
 * @param {object} [options]
 * @param {boolean} [options.dev] Include the dev-only owner baseline.
 * @returns {{
 *   transformed: import('./transform.mjs').Transformed,
 *   verification: import('./verify.mjs').Verification,
 *   artifacts: Artifact[],
 * }}
 */
export function build({ dev = false } = {}) {
  const transformed = transform()
  const verification = verify(transformed)

  /** @type {Artifact[]} */
  const artifacts = [
    artifact('supabase/seed/010_exercise_definitions.sql', emitDefinitions(transformed)),
    artifact('supabase/seed/020_exercise_muscle_groups.sql', emitMuscles(transformed)),
    artifact('supabase/seed/030_exercise_pattern_weights.sql', emitWeights(transformed)),
    artifact('docs/backend/taxonomy-equivalence.md', renderReport(transformed, verification)),
  ]

  if (dev) {
    artifacts.push(
      artifact('supabase/seed/090_dev_baseline.sql', emitDevBaseline(transformed.snapshotId)),
    )
  }

  return { transformed, verification, artifacts }
}

/**
 * The presets the viability invariants are held against, as the onboarding
 * screen's own modules export them.
 *
 * @param {any} onboarding     `src/state/onboarding.ts`.
 * @param {any} selectability  `src/state/section-selectability.ts`.
 * @returns {import('./viability.mjs').Presets}
 */
export function presetsFrom(onboarding, selectability) {
  const values = (/** @type {{ value: string }[]} */ options) =>
    options.map((option) => option.value)

  return {
    equipmentByTier: onboarding.EQUIPMENT_BY_TIER,
    sectionsByGoal: onboarding.SECTIONS_BY_GOAL,
    equipment: values(onboarding.EQUIPMENT),
    tiers: values(onboarding.TIERS),
    goals: values(onboarding.GOALS),
    nonSelectableSections: selectability.NON_SELECTABLE_SECTIONS,
  }
}

/** @returns {Promise<import('./viability.mjs').Presets>} */
export async function loadPresets() {
  const { runnerImport } = await import('vite')
  const load = async (/** @type {string} */ path) =>
    (
      await runnerImport(join(REPO_ROOT, path), {
        configFile: false,
        root: REPO_ROOT,
        logLevel: 'silent',
      })
    ).module

  return presetsFrom(await load(ONBOARDING_MODULE), await load(SELECTABILITY_MODULE))
}

/**
 * `verify`'s checks and the viability invariants as one verification, so the
 * command reports and fails on them the same way.
 *
 * @param {import('./transform.mjs').Transformed} transformed
 * @param {import('./verify.mjs').Verification} verification
 * @param {import('./viability.mjs').Presets} presets
 * @returns {import('./verify.mjs').Verification}
 */
export function withViability(transformed, verification, presets) {
  const checks = [
    ...verification.checks,
    ...checkViability({
      rules: loadRetrievalRules(),
      catalog: catalogOf(transformed),
      presets,
      recorded: reviewed.FOCUS_RETRIEVAL,
    }),
  ]

  return { ...verification, checks, failures: checks.filter((entry) => !entry.ok) }
}

/**
 * @param {string} label
 * @param {string} contents
 * @returns {Artifact}
 */
function artifact(label, contents) {
  return { path: join(REPO_ROOT, label), label, contents }
}

/**
 * @param {string[]} argv
 * @param {import('./viability.mjs').Presets} presets  `loadPresets()`'s.
 * @returns {number} Process exit code.
 */
export function main(argv, presets) {
  const dev = argv.includes('--dev')
  const checkOnly = argv.includes('--check')

  const unknown = argv.filter((argument) => !['--dev', '--check'].includes(argument))
  if (unknown.length > 0) {
    write(`clear seed: unknown option ${unknown.join(', ')}`)
    write('usage: npm run seed [-- --dev] [-- --check]')
    return 1
  }

  const { transformed, verification: equivalence, artifacts } = build({ dev })
  const verification = withViability(transformed, equivalence, presets)

  report(transformed, verification)

  if (verification.failures.length > 0) {
    write('')
    write(`FAILED — ${verification.failures.length} of ${verification.checks.length} checks:`)
    for (const failure of verification.failures) {
      write(`  ✗ [${failure.group}] ${failure.name}`)
      write(`      ${failure.detail}`)
    }
    write('')
    write('Nothing was written. The capture, the reviewed tags and the recorded')
    write('review in scripts/catalog-seed/reviewed.mjs disagree; read')
    write('docs/backend/taxonomy-equivalence.md from the last good run before')
    write('changing any of them. A [viability] failure names a section, tier or')
    write('Goal the catalog cannot serve: repair the catalog or the preset.')
    return 1
  }

  if (checkOnly) {
    const drifted = artifacts.filter((entry) => readIfPresent(entry.path) !== entry.contents)
    write('')
    if (drifted.length > 0) {
      write(`FAILED — ${drifted.length} artifact(s) differ from what the transform produces:`)
      for (const entry of drifted) write(`  ✗ ${entry.label}`)
      write('')
      write('Run `npm run seed` and commit the result.')
      return 1
    }
    write(`--check: ${artifacts.length} artifacts are current. Nothing written.`)
    return 0
  }

  mkdirSync(SEED_DIR, { recursive: true })
  for (const entry of artifacts) writeFileSync(entry.path, entry.contents)

  write('')
  write('Wrote:')
  for (const entry of artifacts) {
    write(`  ${entry.label}  (${entry.contents.split('\n').length - 1} lines)`)
  }
  if (!dev) {
    write('')
    write('  --dev also writes supabase/seed/090_dev_baseline.sql: one dev-only')
    write('  profile and default location, built from constants. It copies no')
    write('  prior personal row and is not part of [db.seed].')
  }
  write('')
  write('Not applied. This command only prepares reviewed SQL; database changes')
  write('belong to the deployment/cutover path documented under docs/backend/.')

  return 0
}

/**
 * @param {import('./transform.mjs').Transformed} transformed
 * @param {import('./verify.mjs').Verification} verification
 */
function report(transformed, verification) {
  const { definitions, muscles, weights, anchors, legacyPatterns, snapshotId } = transformed

  write(`CLEAR catalog seed — capture ${snapshotId}`)
  write('')
  write(`  ${pad(definitions.length)} exercise definitions`)
  write(`  ${pad(muscles.length)} exercise-muscle mappings`)
  write(
    `  ${pad(anchors.length)} exercise-anchor links → ${weights.length} pattern weights, ` +
      `${anchors.length - weights.length} dropped with a reviewed reason`,
  )
  write(`  ${pad(legacyPatterns.length)} legacy movement patterns, all accounted for`)
  write(`  ${pad(definitions.length)} reviewed workout-anatomy tags`)
  write('')

  write('Taxonomy equivalence:')
  for (const comparison of verification.focusComparisons) {
    write(
      `  ${comparison.focus.padEnd(11)} ${pad(comparison.legacy)} → ${pad(comparison.derived)} candidates` +
        `   −${comparison.lost.length} +${comparison.gained.length}`,
    )
  }
  write(
    `  ${verification.weightsOutsideDerivation.length} preserved weights rank a pattern the components do not derive`,
  )
  write('')

  const groups = [...new Set(verification.checks.map((entry) => entry.group))]
  for (const group of groups) {
    const inGroup = verification.checks.filter((entry) => entry.group === group)
    const failed = inGroup.filter((entry) => !entry.ok).length
    write(
      `  ${failed === 0 ? '✓' : '✗'} ${group.padEnd(12)} ${inGroup.length - failed}/${inGroup.length} checks`,
    )
  }
}

/**
 * @param {number} value
 * @returns {string}
 */
function pad(value) {
  return String(value).padStart(3)
}

/**
 * @param {string} path
 * @returns {string | null}
 */
function readIfPresent(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/**
 * The one place this command writes to stdout. `eslint.config.js` bans
 * `console` inside `src/` so app logging goes through CORE-02's redacting sink;
 * this is a CLI, its report *is* its output, and it lives outside `src/` for
 * that reason.
 *
 * @param {string} line
 */
function write(line) {
  process.stdout.write(`${line}\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2), await loadPresets())
}
