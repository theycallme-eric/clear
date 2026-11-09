// Staged source/visual reference resolver and integration-baseline checks
// for the clear-refinement-20261103 body (TASK-039).
//
// References are resolved by identity, never by an owner-machine path:
//   - the repository commits only small hash manifests (BODY.json and
//     references/<id>/REFERENCE.json);
//   - staged object bytes live OUTSIDE Git in the body evidence object store
//     (owner decision 2026-11-09: no reference objects in the product repo),
//     at <store>/<body>/references/<id>/objects/<sha256>;
//   - a pinned gallery file whose bytes equal the verified integration base
//     is resolved from the base commit's git blob instead of being staged.
// Every resolved byte string is hashed and compared with the pinned hash.
// A missing store, a missing object or a hash mismatch always fails closed.
//
// Store location: $CLEAR_REFINEMENT_EVIDENCE_DIR when set, otherwise the
// Runner V2 layout: the git worktree root is <runner body>/worktrees/<task>,
// so the store is <runner body>/evidence (two levels above the worktree).

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { sha256 } from './required-check.mjs'

export const BODY_SCHEMA = 'clear-refinement-body/v1'
export const REFERENCE_SCHEMA = 'clear-refinement-staged-reference/v1'
const HEX40 = /^[0-9a-f]{40}$/
const HEX64 = /^[0-9a-f]{64}$/
const OWNER_PATH = /(^|["'\s])(\/Users\/|\/home\/|[A-Za-z]:\\\\)/

export const OBJECT_STORE_ENV = 'CLEAR_REFINEMENT_EVIDENCE_DIR'
const STORE_LAYOUT = '<runner body>/worktrees/<task> -> <runner body>/evidence'

/**
 * Locate the out-of-Git reference object store. Returns { dir, source } and,
 * when it cannot be located or does not exist, a `problem` explaining where
 * it was expected. Never falls back to any other location.
 */
export function resolveObjectStore({ cwd = process.cwd(), env = process.env } = {}) {
  const override = env[OBJECT_STORE_ENV]
  let dir
  let source
  if (override) {
    dir = resolve(cwd, override)
    source = `${OBJECT_STORE_ENV} override`
  } else {
    let top
    try {
      top = git(cwd, ['rev-parse', '--show-toplevel'])
    } catch {
      return {
        dir: null,
        source: 'layout',
        problem: `reference object store cannot be located: ${cwd} is not inside a git worktree (layout ${STORE_LAYOUT}); set ${OBJECT_STORE_ENV}`,
      }
    }
    dir = resolve(top, '..', '..', 'evidence')
    source = `layout ${STORE_LAYOUT}`
  }
  if (!existsSync(dir)) {
    return {
      dir,
      source,
      problem: `reference object store is absent: expected ${dir} (${override ? source : `${source}; or set ${OBJECT_STORE_ENV}`}). Staged objects are not committed to the repository, so references cannot verify without it`,
    }
  }
  return { dir, source }
}

export function bodyDir(evidenceRoot, body) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(body)) throw new Error(`invalid body id "${body}"`)
  return join(evidenceRoot, body)
}

function git(cwd, args, options = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim()
}

function gitOk(cwd, args) {
  return spawnSync('git', args, { cwd, stdio: 'ignore' }).status === 0
}

/** Read many blobs at `<commit>:<path>` with one git process. Missing → null. */
export function readBaseBlobs(cwd, commit, paths) {
  const result = new Map()
  if (paths.length === 0) return result
  const input = paths.map((path) => `${commit}:${path}`).join('\n') + '\n'
  const output = execFileSync('git', ['cat-file', '--batch'], { cwd, input, maxBuffer: 1024 * 1024 * 1024 })
  let offset = 0
  for (const path of paths) {
    const newline = output.indexOf(0x0a, offset)
    const header = output.subarray(offset, newline).toString('utf8')
    offset = newline + 1
    const match = /^[0-9a-f]+ (\w+) (\d+)$/.exec(header)
    if (!match) {
      result.set(path, null)
      continue
    }
    const size = Number(match[2])
    result.set(path, match[1] === 'blob' ? output.subarray(offset, offset + size) : null)
    offset += size + 1
  }
  return result
}

function readJson(path, problems, label) {
  if (!existsSync(path)) {
    problems.push(`${label} is absent: ${path}`)
    return null
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    problems.push(`${label} is not valid JSON: ${error.message}`)
    return null
  }
}

export function loadBody({ evidenceRoot, body }) {
  const problems = []
  const dir = bodyDir(evidenceRoot, body)
  const path = join(dir, 'BODY.json')
  const record = readJson(path, problems, 'body record')
  if (record) {
    if (record.schema !== BODY_SCHEMA) problems.push(`body record schema must be ${BODY_SCHEMA}`)
    if (record.body !== body) problems.push(`body record identifies "${record.body}", not "${body}"`)
    if (!HEX40.test(record.integrationBase?.commit ?? '')) problems.push('body record has no 40-hex integration base commit')
    if (!Array.isArray(record.references) || record.references.length === 0) problems.push('body record lists no staged references')
    if (OWNER_PATH.test(readFileSync(path, 'utf8'))) problems.push('body record contains an owner-machine absolute path')
  }
  return { dir, path, record, problems }
}

// ---------------------------------------------------------------- baseline

/**
 * Verify the live integration base: the selected base commit exists and is
 * an ancestor of HEAD, the immutable Foundation import is unchanged from that
 * base in the working tree, and historical comparison commits are recorded as
 * history (an available historical commit must be an ancestor of the base).
 */
export function verifyBaseline({ cwd, record }) {
  const problems = []
  const facts = {}
  const base = record.integrationBase.commit
  if (!gitOk(cwd, ['cat-file', '-e', `${base}^{commit}`])) {
    problems.push(`integration base ${base} is not available in this repository`)
    return { problems, facts }
  }
  facts.head = git(cwd, ['rev-parse', 'HEAD'])
  facts.integrationBase = base
  if (!gitOk(cwd, ['merge-base', '--is-ancestor', base, 'HEAD'])) {
    problems.push(`HEAD ${facts.head} does not descend from integration base ${base}`)
  }
  const foundation = record.foundation
  if (foundation?.path) {
    const changed = spawnSync('git', ['diff', '--quiet', base, '--', foundation.path], { cwd }).status !== 0
    const untracked = git(cwd, ['ls-files', '--others', '--exclude-standard', '--', foundation.path])
    if (changed || untracked) problems.push(`immutable Foundation ${foundation.path} differs from the integration base`)
    const pkgPath = resolve(cwd, foundation.path, 'package.json')
    const version = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')).version : null
    if (version !== foundation.version) problems.push(`Foundation version is ${version}, expected ${foundation.version}`)
    facts.foundation = { path: foundation.path, version, unchangedFromBase: !changed && !untracked }
  }
  facts.historicalComparisons = []
  for (const historical of record.historicalComparisons ?? []) {
    if (historical.role !== 'historical-comparison') {
      problems.push(`historical source ${historical.id} must have role historical-comparison, not baseline`)
    }
    if (historical.commit === base) problems.push(`historical source ${historical.id} must not be the selected integration base`)
    const available = HEX40.test(historical.commit ?? '') && gitOk(cwd, ['cat-file', '-e', `${historical.commit}^{commit}`])
    let relation = 'not available in this repository (historical evidence only; not required)'
    if (available) {
      relation = gitOk(cwd, ['merge-base', '--is-ancestor', historical.commit, base])
        ? 'ancestor of the integration base'
        : 'not an ancestor of the integration base'
      if (historical.expectAncestorOfBase && relation !== 'ancestor of the integration base') {
        problems.push(`historical source ${historical.id} ${historical.commit} is expected to be an ancestor of ${base}`)
      }
    }
    facts.historicalComparisons.push({ id: historical.id, commit: historical.commit, relation })
  }
  return { problems, facts }
}

// ---------------------------------------------------------------- references

/**
 * Verify one staged reference. Returns { problems, files, guides } where
 * `files` maps logical path → { sha256, location } and location is either a
 * `store:<body>/references/<id>/objects/<sha256>` (out-of-Git object store)
 * or `git:<base>:<path>` (integration base blob).
 */
export function verifyReference({ cwd, dir, record: body, entry, store }) {
  const problems = []
  const where = `reference ${entry.id}`
  const empty = (found) => ({ problems: found, files: new Map(), guides: {} })
  const recordPath = join(dir, entry.record)
  if (!existsSync(recordPath)) return empty([`${where}: record is absent (${entry.record})`])
  const recordBytes = readFileSync(recordPath)
  if (sha256(recordBytes) !== entry.sha256) problems.push(`${where}: record bytes do not match the body record hash`)
  if (OWNER_PATH.test(recordBytes.toString('utf8'))) problems.push(`${where}: record contains an owner-machine absolute path`)
  const record = JSON.parse(recordBytes.toString('utf8'))
  if (record.schema !== REFERENCE_SCHEMA) problems.push(`${where}: schema must be ${REFERENCE_SCHEMA}`)
  if (record.id !== entry.id) problems.push(`${where}: record identifies ${record.id}`)

  // Fail closed: no store, no verification.
  const objectStore = store ?? resolveObjectStore({ cwd })
  if (objectStore.problem) return empty([...problems, `${where}: ${objectStore.problem}`])
  const objectsRel = `${body.body}/references/${entry.id}/objects`
  const objectsDir = join(objectStore.dir, objectsRel)
  if (!existsSync(objectsDir)) {
    return empty([...problems, `${where}: staged objects are absent from the reference object store: expected ${objectsDir} (${objectStore.source})`])
  }
  const objectPath = (hash) => join(objectsDir, hash)
  const objectLocation = (hash) => `store:${objectsRel}/${hash}`
  /** Read one staged object by hash; null (with a problem) when absent. */
  const readObject = (path, hash) => {
    if (!existsSync(objectPath(hash))) {
      problems.push(`${where}: staged object for ${path} is missing from the reference object store: expected ${objectPath(hash)}`)
      return null
    }
    return readFileSync(objectPath(hash))
  }
  const base = body.integrationBase.commit

  // Expected files: [{ path, sha256, bytes?, staged }]
  let expected = []
  let pinned = null
  if (record.manifest?.format === 'pinned-source') {
    const manifestName = record.manifest.name ?? 'pinned manifest'
    const manifestBytes = HEX64.test(record.manifest.sha256 ?? '') ? readObject(manifestName, record.manifest.sha256) : null
    if (!HEX64.test(record.manifest.sha256 ?? '')) problems.push(`${where}: pinned manifest has no sha256 identity`)
    if (manifestBytes) {
      if (sha256(manifestBytes) !== record.manifest.sha256) {
        problems.push(`${where}: ${manifestName} bytes do not match the approved hash ${record.manifest.sha256} (${objectLocation(record.manifest.sha256)})`)
      } else {
        pinned = JSON.parse(manifestBytes.toString('utf8'))
      }
    }
    if (pinned) {
      if (pinned.galleryCommit !== record.identity?.commit) problems.push(`${where}: pinned gallery commit ${pinned.galleryCommit} is not ${record.identity?.commit}`)
      if (pinned.productBase !== base) problems.push(`${where}: pinned product base ${pinned.productBase} is not the integration base ${base}`)
      const staged = new Map((record.stagedObjects ?? []).map((object) => [object.path, object.sha256]))
      const pinnedByPath = new Map((pinned.files ?? []).map((file) => [file.path, file.sha256]))
      for (const [path, hash] of staged) {
        if (pinnedByPath.get(path) !== hash) problems.push(`${where}: staged object ${path} is not pinned with hash ${hash}`)
      }
      expected = (pinned.files ?? []).map((file) => ({ ...file, staged: staged.has(file.path) }))
      for (const excluded of pinned.excludedArchivedTemplates ?? []) expected.push({ ...excluded, staged: false })
      if (expected.length === 0) problems.push(`${where}: pinned manifest lists no files`)
    }
  } else if (record.manifest?.format === 'inline') {
    expected = (record.files ?? []).map((file) => ({ ...file, staged: true }))
    if (expected.length === 0) problems.push(`${where}: inline reference lists no files`)
  } else {
    problems.push(`${where}: unknown manifest format ${record.manifest?.format}`)
  }

  const files = new Map()
  let blobs = new Map()
  try {
    blobs = readBaseBlobs(cwd, base, expected.filter((file) => !file.staged).map((file) => file.path))
  } catch (error) {
    problems.push(`${where}: cannot read integration base blobs: ${error.message}`)
  }
  for (const file of expected) {
    if (!HEX64.test(file.sha256 ?? '')) {
      problems.push(`${where}: ${file.path} has no sha256 pin`)
      continue
    }
    let bytes
    let location
    if (file.staged) {
      bytes = readObject(file.path, file.sha256)
      location = objectLocation(file.sha256)
      if (bytes === null) continue
    } else {
      bytes = blobs.get(file.path) ?? null
      location = `git:${base}:${file.path}`
      if (bytes === null) {
        problems.push(`${where}: ${file.path} is not resolvable from the integration base`)
        continue
      }
    }
    const actual = sha256(bytes)
    if (actual !== file.sha256 || (file.bytes !== undefined && bytes.length !== file.bytes)) {
      problems.push(`${where}: ${file.path} bytes do not match the pinned hash (${location})`)
      continue
    }
    files.set(file.path, { sha256: actual, location, bytes })
  }

  // Cross-check the gallery's own SOURCE-MANIFEST against the pinned files.
  if (record.sourceManifest) {
    const resolved = files.get(record.sourceManifest)
    if (!resolved) {
      problems.push(`${where}: source manifest ${record.sourceManifest} did not resolve`)
    } else {
      const sourceManifest = JSON.parse(resolved.bytes.toString('utf8'))
      if (sourceManifest.baseCommit !== base) problems.push(`${where}: source manifest base ${sourceManifest.baseCommit} is not ${base}`)
      for (const group of ['code', 'evidence']) {
        for (const item of sourceManifest[group] ?? []) {
          if (files.get(item.path)?.sha256 !== item.sha256) problems.push(`${where}: source manifest ${group} entry ${item.path} does not match the pinned bytes`)
        }
      }
      const owners = sourceManifest.unchangedPresetOwners ?? []
      const ownerBlobs = readBaseBlobs(cwd, base, owners.map((owner) => owner.path))
      for (const owner of owners) {
        const bytes = ownerBlobs.get(owner.path)
        if (!bytes || sha256(bytes) !== owner.sha256) problems.push(`${where}: unchanged preset owner ${owner.path} differs at the integration base`)
      }
    }
  }

  const guides = {}
  for (const [name, path] of Object.entries(record.guides ?? {})) {
    const resolved = files.get(path)
    if (!resolved) problems.push(`${where}: guide ${name} (${path}) did not resolve`)
    else guides[name] = { path, sha256: resolved.sha256, location: resolved.location }
  }
  return { problems, files, guides, record, pinned }
}

/** Verify every (or the selected) staged reference of a body. */
export function verifyReferences({ cwd, evidenceRoot, body, only, store }) {
  const loaded = loadBody({ evidenceRoot, body })
  const problems = [...loaded.problems]
  const references = []
  if (!loaded.record) return { problems, references, body: loaded }
  const entries = loaded.record.references ?? []
  const selected = only ? entries.filter((entry) => entry.id === only) : entries
  const objectStore = store ?? resolveObjectStore({ cwd })
  if (only && selected.length === 0) problems.push(`body ${body} has no staged reference "${only}"`)
  if (objectStore.problem) {
    problems.push(objectStore.problem)
    return { problems, references, body: loaded, store: objectStore }
  }
  for (const entry of selected) {
    const result = verifyReference({ cwd, dir: loaded.dir, record: loaded.record, entry, store: objectStore })
    problems.push(...result.problems)
    references.push({ id: entry.id, result })
  }
  return { problems, references, body: loaded, store: objectStore }
}
