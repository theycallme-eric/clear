#!/usr/bin/env node
// One-time staging of the A3 body record (TASK-115, A3 task 15b) for the body
// `clear-gallery-adoption-20261113`. Not part of verification: the shared
// verifier (verify-delivery-evidence.mjs, TASK-039's provider, unchanged) only
// reads what this wrote.
//
//   node scripts/refinement/stage-a3-body.mjs --approved-run <round-07 requirements run dir>
//
// It follows stage-references.mjs (TASK-039) and the owner decisions of
// 2026-11-09: staged reference OBJECTS stay outside Git, in the project-level
// reference object store (<store>/<body>/references/<id>/objects/<sha256>);
// only the small hash manifests (BODY.json, references/<id>/REFERENCE.json)
// are committed. Every staged byte string is first checked against the
// approved run's SOURCE_MANIFEST.json (inventory b86b6eb8…, the round-07 run
// whose TASK-115 this is). No absolute path is written.
//
// The record names the integration base a6cd01c9 (the task 2 review fixes on
// 2f023b9), the accepted gallery bec4454 and Foundation 0.14.3, and keeps
// effects-delivered main 03087f7, gallery eded158 and the old build 181e580 as
// historical comparisons only. Their commits are checked in Git by the
// verifier's baseline mode; no SOURCE.json is staged for them.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { OBJECT_STORE_ENV, resolveObjectStore } from './lib/references.mjs'
import { sha256 } from './lib/required-check.mjs'

export const A3_BODY = 'clear-gallery-adoption-20261113'
export const A3_INTEGRATION_BASE = 'a6cd01c926d516b3c72770b32443ea0dadfe47a9'
export const A3_GALLERY = 'bec44545eb982f6dc136a583400f7e314c306d1d'
const GALLERY_ROOT = 'sources/source-08-adopted-gallery-reference'
const AUTHORITY_ROOT = 'sources/source-07-a3-gallery-adoption-authority'
const SUPPORT_ROOT = 'sources/source-09-a3-supporting-evidence'

/** The accepted gallery's guides, by logical path inside the gallery commit. */
const GALLERY_FILES = [
  'PINNED-SOURCE.json',
  'src/dev/gallery-refinement-coverage.json',
  'src/dev/gallery-refinement-states.ts',
  'src/dev/gallery-refinement-data.ts',
  'docs/design/library/refinements-2026-11-04/REUSE.md',
  'docs/design/library/refinements-2026-11-04/LOGGING-FIELDS.md',
  'docs/design/library/refinements-2026-11-04/SOURCE-MANIFEST.json',
  'src/ui/refinements/tokens.css',
]

/** The A3 adoption authority and the corrected task 2 groundwork ledger. */
const AUTHORITY_FILES = [
  [`a3/A3-GALLERY-ADOPTION-AUTHORITY.md`, `${AUTHORITY_ROOT}/A3-GALLERY-ADOPTION-AUTHORITY.md`],
  [`a3/A3-CRITERION-CHANGES.json`, `${AUTHORITY_ROOT}/A3-CRITERION-CHANGES.json`],
  [`a3/OWNER-DECISIONS-2026-11-13-14.md`, `${SUPPORT_ROOT}/OWNER-DECISIONS-2026-11-13-14.md`],
  [`a3/2026-11-14-a3-task2-groundwork-ledger.json`, `${SUPPORT_ROOT}/2026-11-14-a3-task2-groundwork-ledger.json`],
  [`a3/2026-11-14-a3-task2-groundwork-ledger.md`, `${SUPPORT_ROOT}/2026-11-14-a3-task2-groundwork-ledger.md`],
]

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

const json = (value) => `${JSON.stringify(value, null, 2)}\n`

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
  const store = resolveObjectStore({ cwd })
  if (!store.dir) throw new Error(store.problem)
  const bodyDir = resolve(cwd, options.evidenceRoot, A3_BODY)
  const references = []
  let objectCount = 0

  const inline = (id, role, identity, pairs, guides = {}) => {
    const objectsDir = join(store.dir, A3_BODY, 'references', id, 'objects')
    mkdirSync(objectsDir, { recursive: true })
    const files = pairs.map(([logical, approvedPath]) => {
      const { bytes, entry } = approvedBytes(approvedPath)
      const target = join(objectsDir, entry.sha256)
      if (existsSync(target) && sha256(readFileSync(target)) !== entry.sha256) throw new Error(`store object ${target} is corrupt; remove it and restage`)
      if (!existsSync(target)) writeFileSync(target, bytes)
      objectCount += 1
      return { path: logical, bytes: entry.sizeBytes, sha256: entry.sha256, approvedPath }
    })
    const record = {
      schema: 'clear-refinement-staged-reference/v1',
      id,
      role,
      identity,
      approvedSource: { inventorySha256: approved.inventorySha256 },
      manifest: { format: 'inline' },
      guides,
      files,
    }
    const dir = join(bodyDir, 'references', id)
    mkdirSync(dir, { recursive: true })
    const text = json(record)
    writeFileSync(join(dir, 'REFERENCE.json'), text)
    references.push({ id, record: `references/${id}/REFERENCE.json`, sha256: sha256(Buffer.from(text)) })
  }

  const pinned = JSON.parse(approvedBytes(`${GALLERY_ROOT}/PINNED-SOURCE.json`).bytes.toString('utf8'))
  if (pinned.galleryCommit !== A3_GALLERY) throw new Error(`pinned gallery ${pinned.galleryCommit} is not ${A3_GALLERY}`)
  if (pinned.integrationBranch?.tipAtIntake !== A3_INTEGRATION_BASE) throw new Error('pinned intake tip is not the A3 integration base')

  inline(
    'accepted-gallery',
    'accepted gallery reference bec4454 (A2, 2026-11-13): presentation authority only; not application adoption or backend proof',
    {
      kind: 'git-commit',
      commit: A3_GALLERY,
      branch: pinned.branch,
      supersedes: pinned.supersedes,
      availability: 'an ancestor of the integration base; its guides are staged here by hash from the approved round-07 run',
    },
    GALLERY_FILES.map((path) => [path, `${GALLERY_ROOT}/${path}`]),
    {
      stateMap: 'src/dev/gallery-refinement-coverage.json',
      stateIds: 'src/dev/gallery-refinement-states.ts',
      loggingContexts: 'src/dev/gallery-refinement-data.ts',
      sharedOwners: 'docs/design/library/refinements-2026-11-04/REUSE.md',
      fieldOwnership: 'docs/design/library/refinements-2026-11-04/LOGGING-FIELDS.md',
      semanticTokens: 'src/ui/refinements/tokens.css',
      sourceManifest: 'docs/design/library/refinements-2026-11-04/SOURCE-MANIFEST.json',
    },
  )
  inline(
    'a3-authority',
    'A3 gallery adoption authority, owner decisions of 2026-11-13/14 and the corrected task 2 groundwork ledger (the body-ledger rerun input)',
    { kind: 'approved-source', roots: [AUTHORITY_ROOT, SUPPORT_ROOT] },
    AUTHORITY_FILES,
    {
      adoptionAuthority: 'a3/A3-GALLERY-ADOPTION-AUTHORITY.md',
      criterionChanges: 'a3/A3-CRITERION-CHANGES.json',
      groundworkLedger: 'a3/2026-11-14-a3-task2-groundwork-ledger.json',
    },
  )

  const body = {
    schema: 'clear-refinement-body/v1',
    body: A3_BODY,
    requirementsSet: approved.inventorySha256,
    integrationBase: {
      commit: A3_INTEGRATION_BASE,
      role: 'selected implementation baseline: A3 tasks 1–2 with the task 2 review fixes (a6cd01c9 on 2f023b9), cut from the accepted gallery bec4454',
    },
    acceptedGallery: { commit: A3_GALLERY, reference: 'accepted-gallery' },
    foundation: { path: 'src/design-system', version: '0.14.3' },
    historicalComparisons: [
      {
        id: 'effects-delivered-main',
        commit: '03087f7488bee8d7e927534b1b5e656378fe9cb3',
        role: 'historical-comparison',
        expectAncestorOfBase: true,
        note: 'effects-delivered main; the old body’s baseline, history here',
      },
      {
        id: 'superseded-gallery',
        commit: 'eded158cfd928d382c9a9409e2c372270312741d',
        role: 'historical-comparison',
        expectAncestorOfBase: true,
        note: 'gallery eded158, superseded by bec4454',
      },
      {
        id: 'old-build',
        commit: '181e5808e5264ab3041a186ca16a8d9f845fe072',
        role: 'historical-comparison',
        note: 'build/clear-refinement-2026-11-04: source material only, never merged',
      },
    ],
    notesDir: 'docs/journal/clear-gallery-adoption-20261116',
    taskEvidence: 'evidence/refinement/task-NNN',
    objectStore: {
      policy: 'staged reference objects are kept outside Git in one project-level store shared by all CLEAR bodies (owner decisions 2026-11-09); only these hash manifests are committed; no body-level fallback',
      layout: '<project>/runner-v2/<runner body>/worktrees/<task> -> <project>/evidence-store/<body>/references/<id>/objects/<sha256>',
      override: OBJECT_STORE_ENV,
    },
    references,
  }
  writeFileSync(join(bodyDir, 'BODY.json'), json(body))
  process.stdout.write(`staged ${references.length} reference manifests into ${options.evidenceRoot}/${A3_BODY} and ${objectCount} objects into the object store (${store.source})\n`)
}

main()
