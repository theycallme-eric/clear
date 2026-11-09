#!/usr/bin/env node
// One-time staging of approved source/visual references into the body
// evidence location (TASK-039). Not part of verification: workers and the
// controller only read what this wrote, through verify-delivery-evidence.mjs.
//
//   node scripts/refinement/stage-references.mjs --approved-run <requirements run dir>
//
// Owner decision 2026-11-09: staged reference OBJECTS are never committed to
// the product repository. Their bytes are written outside Git to the body
// evidence object store ($CLEAR_REFINEMENT_EVIDENCE_DIR, or <runner body>/evidence
// for a worktree at <runner body>/worktrees/<task>) as
// <store>/<body>/references/<id>/objects/<sha256>. Only the small hash
// manifests (BODY.json, references/<id>/REFERENCE.json) go into the repository.
//
// The approved run directory holds SOURCE_MANIFEST.json (whose
// inventorySha256 is the approved requirements set) and sources/. Every
// staged byte string is checked against that approved manifest first. Pinned
// gallery files whose bytes equal the integration base are not copied; they
// resolve from the base commit's git blob. No absolute path is written.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { OBJECT_STORE_ENV, readBaseBlobs, resolveObjectStore } from './lib/references.mjs'
import { sha256 } from './lib/required-check.mjs'

const BODY = 'clear-refinement-20261103'
const BASE = '03087f7488bee8d7e927534b1b5e656378fe9cb3'
const GALLERY_COMMIT = 'eded158cfd928d382c9a9409e2c372270312741d'
const GALLERY_ROOT = 'sources/source-06-accepted-gallery-reference'
const PHOSPHOR_ROOT = 'sources/source-02-source-02-supporting-evidence/consolidated-fallback/intake/phosphor-echo'
const CODE_ROOT = 'sources/source-02-source-02-supporting-evidence/code'

function args() {
  const argv = process.argv.slice(2)
  const options = { evidenceRoot: 'evidence/refinement' }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--approved-run') options.run = argv[++index]
    else if (argv[index] === '--evidence-root') options.evidenceRoot = argv[++index]
    else throw new Error(`unknown option ${argv[index]}`)
  }
  if (!options.run) throw new Error('--approved-run is required')
  return options
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function main() {
  const options = args()
  const cwd = process.cwd()
  const run = resolve(options.run)
  const approved = JSON.parse(readFileSync(join(run, 'SOURCE_MANIFEST.json'), 'utf8'))
  const approvedByPath = new Map(approved.files.map((file) => [file.path, file]))
  const approvedBytes = (path) => {
    const entry = approvedByPath.get(path)
    if (!entry) throw new Error(`not in the approved source manifest: ${path}`)
    const bytes = readFileSync(join(run, path))
    if (sha256(bytes) !== entry.sha256 || bytes.length !== entry.sizeBytes) {
      throw new Error(`supplied bytes differ from the approved source manifest: ${path}`)
    }
    return { bytes, entry }
  }
  const bodyDir = resolve(cwd, options.evidenceRoot, BODY)
  const store = resolveObjectStore({ cwd })
  if (!store.dir) throw new Error(`${store.problem}`)
  const references = []
  let objectCount = 0

  const writeReference = (id, record, objects) => {
    const dir = join(bodyDir, 'references', id)
    mkdirSync(dir, { recursive: true })
    const objectsDir = join(store.dir, BODY, 'references', id, 'objects')
    mkdirSync(objectsDir, { recursive: true })
    for (const [hash, bytes] of objects) {
      const target = join(objectsDir, hash)
      if (existsSync(target) && sha256(readFileSync(target)) !== hash) throw new Error(`store object ${target} is corrupt; remove it and restage`)
      if (!existsSync(target)) writeFileSync(target, bytes)
      objectCount += 1
    }
    const text = json(record)
    writeFileSync(join(dir, 'REFERENCE.json'), text)
    references.push({ id, record: `references/${id}/REFERENCE.json`, sha256: sha256(Buffer.from(text)) })
    return dir
  }

  // 1. Accepted gallery: PINNED-SOURCE.json verbatim + delta objects.
  {
    const { bytes: pinnedBytes, entry } = approvedBytes(`${GALLERY_ROOT}/PINNED-SOURCE.json`)
    const pinned = JSON.parse(pinnedBytes.toString('utf8'))
    if (pinned.galleryCommit !== GALLERY_COMMIT || pinned.productBase !== BASE) throw new Error('pinned gallery identity mismatch')
    const blobs = readBaseBlobs(cwd, BASE, pinned.files.map((file) => file.path))
    const objects = new Map([[entry.sha256, pinnedBytes]])
    const stagedObjects = []
    let fromBase = 0
    for (const file of pinned.files) {
      const { bytes } = approvedBytes(`${GALLERY_ROOT}/${file.path}`)
      if (sha256(bytes) !== file.sha256 || bytes.length !== file.bytes) throw new Error(`pinned hash mismatch ${file.path}`)
      const base = blobs.get(file.path)
      if (base && sha256(base) === file.sha256) {
        fromBase += 1
      } else {
        objects.set(file.sha256, bytes)
        stagedObjects.push({ path: file.path, bytes: file.bytes, sha256: file.sha256 })
      }
    }
    const record = {
      schema: 'clear-refinement-staged-reference/v1',
      id: 'accepted-gallery',
      role: 'accepted gallery reference: presentation authority only; not application adoption or backend proof',
      identity: {
        kind: 'git-commit',
        commit: GALLERY_COMMIT,
        branch: 'codex/gallery-final-refinements-20261104',
        base: BASE,
        availability: 'unpublished; resolved from staged bytes and the integration base, never from the commit object',
      },
      approvedSource: { inventorySha256: approved.inventorySha256, root: GALLERY_ROOT },
      // PINNED-SOURCE.json is itself a store object, identified by this hash.
      manifest: { format: 'pinned-source', name: 'PINNED-SOURCE.json', bytes: entry.sizeBytes, sha256: entry.sha256 },
      sourceManifest: 'docs/design/library/refinements-2026-11-04/SOURCE-MANIFEST.json',
      guides: {
        stateMap: 'src/dev/gallery-refinement-coverage.json',
        sharedOwners: 'docs/design/library/refinements-2026-11-04/REUSE.md',
        fieldOwnership: 'docs/design/library/refinements-2026-11-04/LOGGING-FIELDS.md',
        semanticTokens: 'src/ui/refinements/tokens.css',
        sourceManifest: 'docs/design/library/refinements-2026-11-04/SOURCE-MANIFEST.json',
        builderReconciliation: 'docs/design/library/refinements-2026-11-04/BUILDER-RECONCILIATION.md',
        deliveryCrosswalk: 'docs/design/library/refinements-2026-11-04/DELIVERY-CROSSWALK.md',
        galleryCrosswalk: 'docs/design/library/refinements-2026-11-04/gallery-crosswalk.json',
      },
      staging: { pinnedFiles: pinned.files.length, stagedObjects: stagedObjects.length, resolvedFromBase: fromBase },
      // Pinned files whose bytes differ from the integration base; each is a
      // store object. Every other pinned file resolves from the base blob.
      stagedObjects,
    }
    writeReference('accepted-gallery', record, objects)
  }

  // 2. Inline references: Phosphor Echo intake and historical comparisons.
  const inline = (id, role, identity, paths) => {
    const objects = new Map()
    const files = paths.map(([logical, approvedPath]) => {
      const { bytes, entry } = approvedBytes(approvedPath)
      objects.set(entry.sha256, bytes)
      return { path: logical, bytes: entry.sizeBytes, sha256: entry.sha256, approvedPath }
    })
    writeReference(id, {
      schema: 'clear-refinement-staged-reference/v1',
      id,
      role,
      identity,
      approvedSource: { inventorySha256: approved.inventorySha256 },
      manifest: { format: 'inline' },
      files,
    }, objects)
  }
  inline(
    'phosphor-echo',
    'pinned effects intake and selected preset: supporting input for TASK-033 branch/API reconciliation, not proof of adoption',
    { kind: 'approved-source', root: PHOSPHOR_ROOT },
    ['README.md', 'APPLICATION-RULES.md', 'VERIFICATION.json', 'phosphor-echo.mjs', 'preferred-preset.json']
      .map((name) => [`intake/phosphor-echo/${name}`, `${PHOSPHOR_ROOT}/${name}`]),
  )
  inline(
    'historical-comparisons',
    'historical comparison sources (verified main 94f2c2f and reviewed R7 2d48f13): not the implementation baseline',
    { kind: 'approved-source', root: CODE_ROOT },
    [
      ['verified-main/SOURCE.json', `${CODE_ROOT}/verified-main/SOURCE.json`],
      ['reviewed-r7/SOURCE.json', `${CODE_ROOT}/reviewed-r7/SOURCE.json`],
      ['reviewed-versus-main.diff', `${CODE_ROOT}/reviewed-versus-main.diff`],
    ],
  )

  const body = {
    schema: 'clear-refinement-body/v1',
    body: BODY,
    requirementsSet: approved.inventorySha256,
    integrationBase: {
      commit: BASE,
      role: 'selected implementation baseline (effects-delivered main)',
    },
    acceptedGallery: { commit: GALLERY_COMMIT, reference: 'accepted-gallery' },
    foundation: { path: 'src/design-system', version: '0.14.3' },
    historicalComparisons: [
      {
        id: 'verified-main',
        commit: '94f2c2f3bf7e4d0eeb856d3716fd843f188e6fc2',
        role: 'historical-comparison',
        expectAncestorOfBase: true,
        reference: 'historical-comparisons',
      },
      {
        id: 'reviewed-r7',
        commit: '2d48f130ef1d508e032d0bf2ae045601d9d21f26',
        role: 'historical-comparison',
        reference: 'historical-comparisons',
      },
    ],
    notesDir: 'docs/journal/clear-refinement-20261103',
    taskEvidence: 'evidence/refinement/task-NNN',
    objectStore: {
      policy: 'staged reference objects are kept outside Git (owner decision 2026-11-09); only these hash manifests are committed',
      layout: '<runner body>/worktrees/<task> -> <runner body>/evidence/<body>/references/<id>/objects/<sha256>',
      override: OBJECT_STORE_ENV,
    },
    references,
  }
  writeFileSync(join(bodyDir, 'BODY.json'), json(body))
  process.stdout.write(`staged ${references.length} reference manifests into ${options.evidenceRoot}/${BODY} and ${objectCount} objects into the object store ${store.dir} (${store.source})\n`)
}

main()
