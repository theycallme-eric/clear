/**
 * REQ-040 / TASK-039 — the body-level evidence check for
 * clear-refinement-20261103, in separate modes.
 *
 *   node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode <mode>
 *
 *  * `baseline` — before implementation. Verifies the staged reference against
 *    its pinned hashes, the live integration base against effects-delivered
 *    main, Foundation 0.14.3 and the shipped effect presets and ErrorView
 *    against the gallery's own pin, and TASK-039's definition record. Needs no
 *    delivery receipt, no localhost server and no unpublished Git object.
 *    `--require-current-source` makes the live Git checks mandatory.
 *  * `reference` — exposes the exact gallery commit, state map, shared owners,
 *    source delta and token/field guides to coding workers; with a full staged
 *    source root (found by identity), verifies every file it holds against the
 *    pin and the source manifest.
 *  * `final` — the aggregate mode TASK-042 consumes: every task's declared
 *    checks have a passing result for the current commit and unchanged files,
 *    and every definition record holds. It is not part of baseline.
 *  * `stage` — copies the staged files from a root resolved by identity and
 *    writes the index. Run once by the reference owner; never by dependents.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  BODY,
  compareFiles,
  FOUNDATION_VERSION,
  GALLERY_COMMIT,
  HISTORICAL_SOURCES,
  INDEX_SCHEMA,
  PINNED_SOURCE,
  readIndex,
  referenceExposure,
  referenceRootCandidates,
  resolveReferenceRoot,
  SELECTED_BASELINE,
  SOURCE_MANIFEST,
  sha256,
  stagedFilePath,
  stageReference,
} from './reference.mjs'
import { RESULT_SCHEMA } from './run-required-check.mjs'
import { verifyDefinitionRecord } from './verify-definition-record.mjs'

export const MODES = /** @type {const} */ (['baseline', 'reference', 'final', 'stage'])
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * @typedef {{ id: string, ok: boolean, required: boolean, detail: string }} CheckOutcome
 */

/** @param {string} root @param {string[]} args */
const git = (root, args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' })

/**
 * The staged files still hash to the index, and the index still names the
 * accepted gallery and the selected baseline.
 *
 * @param {string} root
 * @returns {CheckOutcome}
 */
export function stagedReferenceCheck(root) {
  const id = 'staged-reference'
  let index
  try {
    index = readIndex(root)
  } catch {
    return { id, ok: false, required: true, detail: 'no readable reference index' }
  }
  /** @type {string[]} */
  const problems = []
  if (index.schema !== INDEX_SCHEMA) problems.push('index schema')
  if (index.body !== BODY) problems.push(`index body ${index.body}`)
  if (index.galleryCommit !== GALLERY_COMMIT) problems.push(`index gallery ${index.galleryCommit}`)
  if (index.selectedBaseline !== SELECTED_BASELINE) problems.push(`index baseline ${index.selectedBaseline}`)
  if (Object.values(HISTORICAL_SOURCES).includes(index.selectedBaseline)) {
    problems.push('a historical comparison source is selected as the baseline')
  }
  const staged = compareFiles(join(root, 'evidence', 'refinement', BODY, 'reference', 'files'), index.staged ?? [])
  for (const path of staged.missing) problems.push(`staged ${path} is missing`)
  for (const path of staged.mismatched) problems.push(`staged ${path} does not match its pinned hash`)

  if (staged.missing.length === 0 && staged.mismatched.length === 0) {
    const pinBytes = readFileSync(stagedFilePath(root, PINNED_SOURCE))
    if (sha256(pinBytes) !== index.pinnedSource?.sha256) problems.push('staged pin differs from the indexed pin')
    const pinned = JSON.parse(pinBytes.toString('utf8'))
    if (pinned.galleryCommit !== GALLERY_COMMIT) problems.push(`pin names gallery ${pinned.galleryCommit}`)
    if (pinned.productBase !== SELECTED_BASELINE) problems.push(`pin names base ${pinned.productBase}`)
    const byPath = new Map(pinned.files.map((/** @type {any} */ file) => [file.path, file.sha256]))
    for (const file of index.staged) {
      if (file.path !== PINNED_SOURCE && byPath.get(file.path) !== file.sha256) {
        problems.push(`staged ${file.path} is not the pinned gallery file`)
      }
    }
    for (const visual of index.visualReferences ?? []) {
      if (byPath.get(visual.path) !== visual.sha256) problems.push(`visual reference ${visual.path} is not pinned`)
    }
    const manifest = JSON.parse(readFileSync(stagedFilePath(root, SOURCE_MANIFEST), 'utf8'))
    if (manifest.baseCommit !== SELECTED_BASELINE) problems.push(`source manifest base ${manifest.baseCommit}`)
  }
  return {
    id,
    ok: problems.length === 0,
    required: true,
    detail:
      problems.length === 0
        ? `${staged.matched} staged file(s) and ${index.visualReferences.length} visual reference identities match gallery ${GALLERY_COMMIT.slice(0, 7)}`
        : problems.join('; '),
  }
}

/**
 * HEAD descends from effects-delivered main. Historical sources are reported,
 * never required.
 *
 * @param {string} root
 * @param {boolean} requireCurrentSource
 * @returns {CheckOutcome[]}
 */
export function integrationBaseChecks(root, requireCurrentSource) {
  const head = git(root, ['rev-parse', 'HEAD'])
  if (head.status !== 0) {
    return [{
      id: 'integration-base',
      ok: false,
      required: requireCurrentSource,
      detail: 'no Git checkout to read the live integration base from',
    }]
  }
  const commit = head.stdout.trim()
  const ancestor = git(root, ['merge-base', '--is-ancestor', SELECTED_BASELINE, commit])
  const historical = Object.entries(HISTORICAL_SOURCES).map(([name, sha]) => {
    const present = git(root, ['cat-file', '-e', `${sha}^{commit}`]).status === 0
    return `${name} ${sha.slice(0, 7)} ${present ? 'available' : 'not available locally (not required)'}`
  })
  return [
    {
      id: 'integration-base',
      ok: ancestor.status === 0,
      required: true,
      detail:
        ancestor.status === 0
          ? `HEAD ${commit} descends from effects-delivered main ${SELECTED_BASELINE}`
          : `HEAD ${commit} does not contain effects-delivered main ${SELECTED_BASELINE}`,
    },
    { id: 'historical-comparison', ok: true, required: false, detail: historical.join('; ') },
  ]
}

/**
 * Foundation, the shipped effect presets and the released ErrorView are what
 * the gallery pinned at the selected baseline, byte for byte.
 *
 * @param {string} root
 * @returns {CheckOutcome[]}
 */
export function preservedOwnerChecks(root) {
  const pinned = JSON.parse(readFileSync(stagedFilePath(root, PINNED_SOURCE), 'utf8'))
  const manifest = JSON.parse(readFileSync(stagedFilePath(root, SOURCE_MANIFEST), 'utf8'))

  const changelog = readFileSync(join(root, 'src/design-system/CHANGELOG.md'), 'utf8')
  const version = /^## (\d+\.\d+\.\d+)/m.exec(changelog)?.[1] ?? null
  const foundation = pinned.files.filter((/** @type {any} */ file) => file.path.startsWith('src/design-system/'))
  const foundationDiff = compareFiles(root, foundation)
  const foundationProblems = [
    ...(version === FOUNDATION_VERSION ? [] : [`CHANGELOG names ${String(version)}`]),
    ...foundationDiff.missing.map((path) => `${path} missing`),
    ...foundationDiff.mismatched.map((path) => `${path} changed`),
  ]

  const presets = compareFiles(root, manifest.unchangedPresetOwners ?? [])
  const viewState = existsSync(join(root, 'src/ui/view-state.tsx'))
    ? readFileSync(join(root, 'src/ui/view-state.tsx'), 'utf8')
    : ''
  const errorView = /export (function|const) ErrorView\b/.test(viewState)
  const effectsProblems = [
    ...presets.missing.map((path) => `${path} missing`),
    ...presets.mismatched.map((path) => `${path} changed`),
    ...(errorView ? [] : ['src/ui/view-state.tsx no longer exports ErrorView']),
  ]
  return [
    {
      id: 'foundation',
      ok: foundationProblems.length === 0,
      required: true,
      detail:
        foundationProblems.length === 0
          ? `Foundation ${FOUNDATION_VERSION} unchanged: ${foundationDiff.matched} file(s) match the gallery pin`
          : foundationProblems.slice(0, 10).join('; '),
    },
    {
      id: 'shipped-effects',
      ok: effectsProblems.length === 0,
      required: true,
      detail:
        effectsProblems.length === 0
          ? `effect presets (${presets.matched}) unchanged and released ErrorView present`
          : effectsProblems.join('; '),
    },
  ]
}

/**
 * The gallery's change against the current tree, so implementation tasks take
 * the selected source delta rather than merging the whole preview branch.
 *
 * @param {string} root
 */
export function sourceDelta(root) {
  const pinned = JSON.parse(readFileSync(stagedFilePath(root, PINNED_SOURCE), 'utf8'))
  /** @type {string[]} */
  const added = []
  /** @type {string[]} */
  const changed = []
  for (const file of pinned.files) {
    if (!file.path.startsWith('src/')) continue
    const path = join(root, file.path)
    if (!existsSync(path)) added.push(file.path)
    else if (sha256(readFileSync(path)) !== file.sha256) changed.push(file.path)
  }
  return { added, changed }
}

/**
 * The full staged source, when one can be resolved by identity, against the
 * pin and the source manifest.
 *
 * @param {string} root
 * @param {string | undefined} explicit
 * @param {boolean} required
 * @returns {CheckOutcome}
 */
export function fullSourceCheck(root, explicit, required) {
  const index = readIndex(root)
  const sourceRoot = resolveReferenceRoot(referenceRootCandidates({ root, explicit }), index.pinnedSource.sha256)
  if (!sourceRoot) {
    return {
      id: 'full-staged-source',
      ok: !required,
      required,
      detail: 'no full staged source with the pinned identity is reachable; staged files suffice for baseline',
    }
  }
  const pinned = JSON.parse(readFileSync(join(sourceRoot, PINNED_SOURCE), 'utf8'))
  const manifest = JSON.parse(readFileSync(join(sourceRoot, SOURCE_MANIFEST), 'utf8'))
  const pin = compareFiles(sourceRoot, pinned.files)
  const listed = [...(manifest.code ?? []), ...(manifest.unchangedPresetOwners ?? []), ...(manifest.evidence ?? [])]
  const named = compareFiles(sourceRoot, listed)
  const visuals = compareFiles(sourceRoot, index.visualReferences)
  const problems = [
    ...pin.mismatched.map((path) => `${path} differs from the pin`),
    ...named.missing.map((path) => `${path} named by the source manifest is missing`),
    ...named.mismatched.map((path) => `${path} differs from the source manifest`),
    ...visuals.missing.map((path) => `visual reference ${path} is missing`),
  ]
  return {
    id: 'full-staged-source',
    ok: problems.length === 0,
    required: true,
    detail:
      problems.length === 0
        ? `${pin.matched} pinned file(s) present and matching (${pin.missing.length} not copied); ${named.matched} source-manifest file(s) and ${visuals.matched} visual references match`
        : problems.slice(0, 10).join('; '),
  }
}

/**
 * Every declared check of every task has a passing, current result.
 *
 * @param {string} root
 * @returns {CheckOutcome[]}
 */
export function aggregateChecks(root) {
  const base = join(root, 'evidence', 'refinement')
  const head = git(root, ['rev-parse', 'HEAD']).stdout.trim()
  const tasks = existsSync(base) ? readdirSync(base).filter((name) => /^task-\d{3}$/.test(name)).sort() : []
  /** @type {CheckOutcome[]} */
  const outcomes = []
  for (const slug of tasks) {
    const task = slug.toUpperCase()
    const manifestPath = join(base, slug, 'required-cases.json')
    if (existsSync(manifestPath)) {
      const manifestBytes = readFileSync(manifestPath)
      const manifest = JSON.parse(manifestBytes.toString('utf8'))
      for (const check of Object.keys(manifest.checks ?? {})) {
        const resultPath = join(base, slug, 'results', `${check}.json`)
        /** @type {string[]} */
        const problems = []
        if (!existsSync(resultPath)) problems.push('no result')
        else {
          const result = JSON.parse(readFileSync(resultPath, 'utf8'))
          if (result.schema !== RESULT_SCHEMA) problems.push('result schema')
          if (result.status !== 'passed') problems.push(`result ${String(result.status)}`)
          if (result.commit !== head) problems.push(`result is for ${String(result.commit)}, not HEAD`)
          if (result.manifestSha256 !== sha256(manifestBytes)) problems.push('manifest changed since the run')
          for (const file of result.files ?? []) {
            const path = join(root, file.path)
            if (!existsSync(path) || sha256(readFileSync(path)) !== file.sha256) problems.push(`${file.path} changed since the run`)
          }
        }
        outcomes.push({ id: `${task}/${check}`, ok: problems.length === 0, required: true, detail: problems.join('; ') || 'passed for HEAD' })
      }
    }
    if (existsSync(join(base, slug, 'definition-record.json'))) {
      const problems = verifyDefinitionRecord({ task, root })
      outcomes.push({ id: `${task}/definition`, ok: problems.length === 0, required: true, detail: problems.join('; ') || 'holds' })
    }
  }
  if (outcomes.length === 0) outcomes.push({ id: 'aggregate', ok: false, required: true, detail: 'no task evidence to aggregate' })
  return outcomes
}

/**
 * @param {object} options
 * @param {typeof MODES[number]} options.mode
 * @param {string} [options.root]
 * @param {boolean} [options.requireCurrentSource]
 * @param {string} [options.referenceRoot]
 * @returns {{ outcomes: CheckOutcome[], exposure: unknown }}
 */
export function verifyDeliveryEvidence({ mode, root = REPO_ROOT, requireCurrentSource = false, referenceRoot }) {
  const staged = stagedReferenceCheck(root)
  /** @type {CheckOutcome[]} */
  const outcomes = [staged]
  if (!staged.ok) return { outcomes, exposure: null }

  if (mode === 'baseline' || mode === 'final') {
    outcomes.push(...integrationBaseChecks(root, requireCurrentSource || mode === 'final'))
    outcomes.push(...preservedOwnerChecks(root))
    const task039 = verifyDefinitionRecord({ task: 'TASK-039', root })
    outcomes.push({
      id: 'baseline-definition',
      ok: task039.length === 0,
      required: true,
      detail: task039.join('; ') || 'TASK-039 definition record and progress record hold',
    })
    outcomes.push(fullSourceCheck(root, referenceRoot, false))
  }
  if (mode === 'reference') outcomes.push(fullSourceCheck(root, referenceRoot, Boolean(referenceRoot)))
  if (mode === 'final') outcomes.push(...aggregateChecks(root))

  const exposure = referenceExposure(root)
  const delta = sourceDelta(root)
  const overlapping = Object.entries(exposure.sharedOwners)
    .filter(([, requirements]) => requirements.length > 1)
    .map(([owner, requirements]) => ({ owner, requirements }))
  return {
    outcomes,
    exposure: { ...exposure, sourceDelta: delta, overlappingSharedOwners: overlapping },
  }
}

/** @param {string[]} argv */
export function main(argv) {
  /** @type {Record<string, string | boolean>} */
  const options = {}
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--require-current-source' || arg === '--json') options[arg.slice(2)] = true
    else if (/^--(body|mode|root|reference-root)$/.test(arg) && argv[index + 1] !== undefined) {
      options[arg.slice(2)] = argv[++index]
    } else {
      process.stderr.write(`unexpected argument "${arg}"\n`)
      return 2
    }
  }
  if (options.body !== BODY) {
    process.stderr.write(`--body must be ${BODY}\n`)
    return 2
  }
  const mode = /** @type {typeof MODES[number]} */ (options.mode)
  if (!MODES.includes(mode)) {
    process.stderr.write(`--mode must be one of ${MODES.join(', ')}\n`)
    return 2
  }
  const root = typeof options.root === 'string' ? resolve(options.root) : REPO_ROOT
  const referenceRoot = typeof options['reference-root'] === 'string' ? options['reference-root'] : undefined

  if (mode === 'stage') {
    let pinnedSha = null
    try {
      pinnedSha = readIndex(root).pinnedSource.sha256
    } catch {
      pinnedSha = null
    }
    const candidates = referenceRootCandidates({ root, explicit: referenceRoot })
    // First staging has no index yet: only an explicit root may seed it.
    const sourceRoot = pinnedSha ? resolveReferenceRoot(candidates, pinnedSha) : referenceRoot ? resolve(referenceRoot) : null
    if (!sourceRoot) {
      process.stderr.write('no reference root with the pinned identity; pass --reference-root\n')
      return 1
    }
    const index = stageReference({ root, sourceRoot })
    process.stdout.write(`staged ${index.staged.length} file(s) for gallery ${index.galleryCommit}\n`)
    return 0
  }

  const { outcomes, exposure } = verifyDeliveryEvidence({
    mode,
    root,
    requireCurrentSource: options['require-current-source'] === true,
    referenceRoot,
  })
  const failed = outcomes.filter((outcome) => outcome.required && !outcome.ok)
  for (const outcome of outcomes) {
    const mark = outcome.ok ? 'ok  ' : outcome.required ? 'FAIL' : 'warn'
    process.stdout.write(`${mark} ${outcome.id}: ${outcome.detail}\n`)
  }
  if (exposure) {
    const e = /** @type {any} */ (exposure)
    if (options.json === true || mode === 'reference') {
      process.stdout.write(`${JSON.stringify(exposure, null, 2)}\n`)
    } else {
      process.stdout.write(
        [
          `gallery ${e.galleryCommit} (${e.galleryReferenceVersion}); baseline ${e.selectedBaseline}`,
          `states ${Object.keys(e.stateMap).length}; shared owners ${Object.keys(e.sharedOwners).length} (${e.overlappingSharedOwners.length} shared by more than one requirement — serialize edits to those)`,
          `source delta vs current tree: ${e.sourceDelta.changed.length} changed, ${e.sourceDelta.added.length} added under src/`,
          `guides: ${e.guides.reuse}, ${e.guides.loggingFields}; canonical tokens ${e.guides.canonicalTokens.application}`,
          '(--mode reference prints the full state map, owners and delta)',
        ].join('\n') + '\n',
      )
    }
  }
  process.stdout.write(`verify-delivery-evidence ${mode}: ${failed.length === 0 ? 'PASSED' : 'FAILED'}\n`)
  return failed.length === 0 ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2))
}
