// Staged source/visual reference resolver and integration-baseline checks
// for the clear-refinement-20261103 body (TASK-039).
//
// References are resolved by identity, never by an owner-machine path:
//   - a staged object is stored once under references/<id>/objects/<sha256>;
//   - a pinned gallery file whose bytes equal the verified integration base
//     is resolved from the base commit's git blob instead of being copied.
// Every resolved byte string is hashed and compared with the pinned hash.

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { sha256 } from './required-check.mjs'

export const BODY_SCHEMA = 'clear-refinement-body/v1'
export const REFERENCE_SCHEMA = 'clear-refinement-staged-reference/v1'
const HEX40 = /^[0-9a-f]{40}$/
const HEX64 = /^[0-9a-f]{64}$/
const OWNER_PATH = /(^|["'\s])(\/Users\/|\/home\/|[A-Za-z]:\\\\)/

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
 * repository-relative object path or `git:<base>:<path>`.
 */
export function verifyReference({ cwd, dir, record: body, entry }) {
  const problems = []
  const where = `reference ${entry.id}`
  const recordPath = join(dir, entry.record)
  if (!existsSync(recordPath)) return { problems: [`${where}: record is absent (${entry.record})`], files: new Map(), guides: {} }
  const recordBytes = readFileSync(recordPath)
  if (sha256(recordBytes) !== entry.sha256) problems.push(`${where}: record bytes do not match the body record hash`)
  if (OWNER_PATH.test(recordBytes.toString('utf8'))) problems.push(`${where}: record contains an owner-machine absolute path`)
  const record = JSON.parse(recordBytes.toString('utf8'))
  if (record.schema !== REFERENCE_SCHEMA) problems.push(`${where}: schema must be ${REFERENCE_SCHEMA}`)
  if (record.id !== entry.id) problems.push(`${where}: record identifies ${record.id}`)
  const refDir = join(dir, 'references', entry.id)
  const objectPath = (hash) => join(refDir, 'objects', hash)
  const base = body.integrationBase.commit

  // Expected files: [{ path, sha256, bytes?, allowBase }]
  let expected = []
  let pinned = null
  if (record.manifest?.format === 'pinned-source') {
    const manifestPath = join(refDir, record.manifest.file)
    if (!existsSync(manifestPath)) {
      problems.push(`${where}: pinned manifest ${record.manifest.file} is absent`)
    } else {
      const manifestBytes = readFileSync(manifestPath)
      if (sha256(manifestBytes) !== record.manifest.sha256) {
        problems.push(`${where}: ${record.manifest.file} bytes do not match the approved hash ${record.manifest.sha256}`)
      }
      pinned = JSON.parse(manifestBytes.toString('utf8'))
      if (pinned.galleryCommit !== record.identity?.commit) problems.push(`${where}: pinned gallery commit ${pinned.galleryCommit} is not ${record.identity?.commit}`)
      if (pinned.productBase !== base) problems.push(`${where}: pinned product base ${pinned.productBase} is not the integration base ${base}`)
      expected = (pinned.files ?? []).map((file) => ({ ...file, allowBase: true }))
      for (const excluded of pinned.excludedArchivedTemplates ?? []) {
        expected.push({ ...excluded, allowBase: true, baseOnly: true })
      }
      if (expected.length === 0) problems.push(`${where}: pinned manifest lists no files`)
    }
  } else if (record.manifest?.format === 'inline') {
    expected = (record.files ?? []).map((file) => ({ ...file, allowBase: false }))
    if (expected.length === 0) problems.push(`${where}: inline reference lists no files`)
  } else {
    problems.push(`${where}: unknown manifest format ${record.manifest?.format}`)
  }

  const files = new Map()
  const needBase = expected.filter((file) => file.baseOnly || (file.allowBase && !existsSync(objectPath(file.sha256))))
  let blobs = new Map()
  try {
    blobs = readBaseBlobs(cwd, base, needBase.map((file) => file.path))
  } catch (error) {
    problems.push(`${where}: cannot read integration base blobs: ${error.message}`)
  }
  for (const file of expected) {
    if (!HEX64.test(file.sha256 ?? '')) {
      problems.push(`${where}: ${file.path} has no sha256 pin`)
      continue
    }
    let bytes = null
    let location = null
    if (!file.baseOnly && existsSync(objectPath(file.sha256))) {
      bytes = readFileSync(objectPath(file.sha256))
      location = relative(cwd, objectPath(file.sha256)).split('\\').join('/')
    } else if (file.allowBase) {
      bytes = blobs.get(file.path) ?? null
      location = `git:${base}:${file.path}`
    }
    if (bytes === null) {
      problems.push(`${where}: ${file.path} is not staged and not resolvable from the integration base`)
      continue
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
export function verifyReferences({ cwd, evidenceRoot, body, only }) {
  const loaded = loadBody({ evidenceRoot, body })
  const problems = [...loaded.problems]
  const references = []
  if (!loaded.record) return { problems, references, body: loaded }
  const entries = loaded.record.references ?? []
  const selected = only ? entries.filter((entry) => entry.id === only) : entries
  if (only && selected.length === 0) problems.push(`body ${body} has no staged reference "${only}"`)
  for (const entry of selected) {
    const result = verifyReference({ cwd, dir: loaded.dir, record: loaded.record, entry })
    problems.push(...result.problems)
    references.push({ id: entry.id, result })
  }
  return { problems, references, body: loaded }
}
