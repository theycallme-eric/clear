/**
 * REQ-040 / TASK-039 — the staged accepted-gallery reference, resolved by
 * identity.
 *
 * The accepted gallery is commit eded158 on an unpublished branch. Workers
 * cannot fetch that object, and an owner-machine path or a localhost address
 * is not an identity. What every worker can rely on is:
 *
 *  * the body's reference index, committed at
 *    `evidence/refinement/clear-refinement-20261103/reference/`, which pins the
 *    gallery commit, the selected implementation baseline and the sha-256 of
 *    the gallery's own `PINNED-SOURCE.json`; and
 *  * a small set of staged files copied byte for byte beside the index — the
 *    pin, the source manifest, the reuse and logging-field guides, the
 *    criterion/state coverage map and the canonical token file.
 *
 * Anything larger (the full copied source, the visual references) is resolved
 * by identity: a candidate root counts only when its `PINNED-SOURCE.json`
 * hashes to the pinned value, wherever it happens to live.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

export const BODY = 'clear-refinement-20261103'
export const GALLERY_COMMIT = 'eded158cfd928d382c9a9409e2c372270312741d'
/** Effects-delivered main: the selected implementation baseline. */
export const SELECTED_BASELINE = '03087f7488bee8d7e927534b1b5e656378fe9cb3'
/** Comparison sources only. Neither is required to exist locally. */
export const HISTORICAL_SOURCES = Object.freeze({
  verifiedMain: '94f2c2f3bf7e4d0eeb856d3716fd843f188e6fc2',
  reviewedR7Runtime: '2d48f13',
})
export const FOUNDATION_VERSION = '0.14.3'
/** How the approved evidence names the copied gallery source. */
export const SOURCE_IDENTITY = 'sources/source-06-accepted-gallery-reference'
export const INDEX_SCHEMA = 'clear-refinement-reference-index-v1'

export const PINNED_SOURCE = 'PINNED-SOURCE.json'
export const REFERENCE_ROOT = 'docs/design/library/refinements-2026-11-04'
export const SOURCE_MANIFEST = `${REFERENCE_ROOT}/SOURCE-MANIFEST.json`

/**
 * Guides a coding worker reads; each is staged beside the index. Data and
 * prose only — staged TypeScript would join the repository's lint and build.
 */
export const GUIDES = Object.freeze({
  reuse: `${REFERENCE_ROOT}/REUSE.md`,
  loggingFields: `${REFERENCE_ROOT}/LOGGING-FIELDS.md`,
  provenance: `${REFERENCE_ROOT}/PROVENANCE.json`,
  coverage: 'src/dev/gallery-refinement-coverage.json',
  canonicalTokens: 'src/ui/refinements/tokens.css',
})

/** Staged byte for byte: the pin itself, the source manifest and the guides. */
export const STAGED_PATHS = Object.freeze([PINNED_SOURCE, SOURCE_MANIFEST, ...Object.values(GUIDES)])

/** Preserved visual references, resolved by identity rather than copied. */
export const VISUAL_REFERENCE_PREFIX = `${REFERENCE_ROOT}/references/`

/** @param {string} root */
export const bodyEvidenceDir = (root) => join(root, 'evidence', 'refinement', BODY)
/** @param {string} root */
export const referenceDir = (root) => join(bodyEvidenceDir(root), 'reference')
/** @param {string} root */
export const indexPath = (root) => join(referenceDir(root), 'REFERENCE-INDEX.json')
/** @param {string} root @param {string} path gallery-relative */
export const stagedFilePath = (root, path) => join(referenceDir(root), 'files', path)

/** @param {Buffer | string} bytes */
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** @param {string} path */
export const fileIdentity = (path) => {
  const bytes = readFileSync(path)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

/**
 * @typedef {{ path: string, bytes: number, sha256: string }} PinnedFile
 * @typedef {{ galleryCommit: string, productBase: string, files: PinnedFile[] }} PinnedSource
 */

/**
 * Where a full staged gallery source might be, in order: an explicit root, the
 * environment, then the approved evidence snapshot named for this workspace
 * (`../.evidence/<workspace>/sources/...`) and any sibling snapshot. Each is a
 * candidate only; `resolveReferenceRoot` keeps the first whose pin matches.
 *
 * @param {object} options
 * @param {string} options.root repository root
 * @param {string} [options.explicit]
 * @param {NodeJS.ProcessEnv} [options.env]
 */
export function referenceRootCandidates({ root, explicit, env = process.env }) {
  /** @type {string[]} */
  const candidates = []
  if (explicit) candidates.push(resolve(explicit))
  if (env.CLEAR_REFINEMENT_REFERENCE_ROOT) candidates.push(resolve(env.CLEAR_REFINEMENT_REFERENCE_ROOT))
  for (let dir = resolve(root), depth = 0; depth < 3; depth++, dir = dirname(dir)) {
    const evidence = join(dirname(dir), '.evidence')
    if (!existsSync(evidence)) continue
    const named = join(evidence, basename(dir), SOURCE_IDENTITY)
    candidates.push(named)
    let siblings = []
    try {
      siblings = readdirSync(evidence).sort()
    } catch {
      siblings = []
    }
    for (const sibling of siblings) candidates.push(join(evidence, sibling, SOURCE_IDENTITY))
  }
  return [...new Set(candidates)]
}

/**
 * The first candidate whose `PINNED-SOURCE.json` hashes to the pinned value.
 *
 * @param {string[]} candidates
 * @param {string} pinnedSha256
 */
export function resolveReferenceRoot(candidates, pinnedSha256) {
  for (const candidate of candidates) {
    const pin = join(candidate, PINNED_SOURCE)
    if (existsSync(pin) && sha256(readFileSync(pin)) === pinnedSha256) return candidate
  }
  return null
}

/**
 * Compare files under a root with the identities a pin or manifest names.
 *
 * @param {string} root
 * @param {{ path: string, sha256: string, bytes?: number }[]} expected
 */
export function compareFiles(root, expected) {
  /** @type {string[]} */
  const missing = []
  /** @type {string[]} */
  const mismatched = []
  let matched = 0
  for (const entry of expected) {
    const path = join(root, entry.path)
    if (!existsSync(path)) {
      missing.push(entry.path)
      continue
    }
    const actual = fileIdentity(path)
    if (actual.sha256 !== entry.sha256 || (entry.bytes !== undefined && actual.bytes !== entry.bytes)) {
      mismatched.push(entry.path)
    } else matched++
  }
  return { matched, missing, mismatched }
}

/**
 * The index for a verified reference root. Throws if the root is not the
 * accepted gallery or a staged file disagrees with the pin.
 *
 * @param {string} sourceRoot
 */
export function buildIndex(sourceRoot) {
  const pinBytes = readFileSync(join(sourceRoot, PINNED_SOURCE))
  /** @type {PinnedSource} */
  const pinned = JSON.parse(pinBytes.toString('utf8'))
  if (pinned.galleryCommit !== GALLERY_COMMIT) throw new Error(`pin names gallery ${pinned.galleryCommit}`)
  if (pinned.productBase !== SELECTED_BASELINE) throw new Error(`pin names base ${pinned.productBase}`)
  const byPath = new Map(pinned.files.map((file) => [file.path, file]))

  const staged = STAGED_PATHS.map((path) => {
    const identity = fileIdentity(join(sourceRoot, path))
    const pin = byPath.get(path)
    if (path !== PINNED_SOURCE && (!pin || pin.sha256 !== identity.sha256)) {
      throw new Error(`${path} does not match the gallery pin`)
    }
    return { path, ...identity }
  })
  const visualReferences = pinned.files
    .filter((file) => file.path.startsWith(VISUAL_REFERENCE_PREFIX))
    .map(({ path, bytes, sha256: hash }) => ({ path, bytes, sha256: hash }))
  const manifest = JSON.parse(readFileSync(join(sourceRoot, SOURCE_MANIFEST), 'utf8'))

  return {
    schema: INDEX_SCHEMA,
    body: BODY,
    galleryCommit: GALLERY_COMMIT,
    galleryReferenceVersion: manifest.version,
    selectedBaseline: SELECTED_BASELINE,
    historicalComparison: { ...HISTORICAL_SOURCES, role: 'comparison only; not the implementation baseline' },
    foundation: FOUNDATION_VERSION,
    sourceIdentity: SOURCE_IDENTITY,
    pinnedSource: { path: PINNED_SOURCE, ...fileIdentity(join(sourceRoot, PINNED_SOURCE)), files: pinned.files.length },
    sourceManifest: { path: SOURCE_MANIFEST, ...fileIdentity(join(sourceRoot, SOURCE_MANIFEST)) },
    guides: GUIDES,
    staged,
    visualReferences,
    boundary:
      'Reference appearance only. Preserved gallery proof cannot establish application adoption; ' +
      'real route adoption and persistence remain with each implementation task.',
  }
}

/**
 * Copy the staged files from a verified root and write the index.
 *
 * @param {object} options
 * @param {string} options.root repository root
 * @param {string} options.sourceRoot a root `resolveReferenceRoot` accepted
 */
export function stageReference({ root, sourceRoot }) {
  const index = buildIndex(sourceRoot)
  for (const file of index.staged) {
    const target = stagedFilePath(root, file.path)
    mkdirSync(dirname(target), { recursive: true })
    // Bytes only: the approved snapshot is read-only, and its mode must not
    // follow the copy into the repository.
    rmSync(target, { force: true })
    writeFileSync(target, readFileSync(join(sourceRoot, file.path)))
  }
  writeFileSync(indexPath(root), `${JSON.stringify(index, null, 2)}\n`)
  return index
}

/** @param {string} root */
export function readIndex(root) {
  return JSON.parse(readFileSync(indexPath(root), 'utf8'))
}

/**
 * What a coding worker needs from the reference: the commit, which states
 * carry which requirements, the shared owners and the token/field guides.
 * Read from the staged coverage map, so it needs no full source root.
 *
 * @param {string} root repository root
 */
export function referenceExposure(root) {
  const index = readIndex(root)
  const coverage = JSON.parse(readFileSync(stagedFilePath(root, GUIDES.coverage), 'utf8'))
  /** @type {Record<string, string[]>} */
  const stateMap = {}
  /** @type {Record<string, string[]>} */
  const sharedOwners = {}
  /** @type {Record<string, string[]>} */
  const semanticVariables = {}
  for (const requirement of coverage.requirements ?? []) {
    for (const state of requirement.states ?? []) (stateMap[state] ??= []).push(requirement.id)
    for (const owner of requirement.sharedOwners ?? []) (sharedOwners[owner] ??= []).push(requirement.id)
    for (const variable of requirement.semanticVariables ?? []) (semanticVariables[variable] ??= []).push(requirement.id)
  }
  const staged = (/** @type {string} */ path) =>
    `evidence/refinement/${BODY}/reference/files/${path}`
  return {
    galleryCommit: index.galleryCommit,
    galleryReferenceVersion: index.galleryReferenceVersion,
    selectedBaseline: index.selectedBaseline,
    stateUrl: '/gallery/refinements?state=<id>',
    stateMap,
    sharedOwners,
    semanticVariables,
    guides: {
      reuse: staged(GUIDES.reuse),
      loggingFields: staged(GUIDES.loggingFields),
      coverage: staged(GUIDES.coverage),
      canonicalTokens: { application: GUIDES.canonicalTokens, reference: staged(GUIDES.canonicalTokens) },
    },
    boundary: index.boundary,
  }
}
