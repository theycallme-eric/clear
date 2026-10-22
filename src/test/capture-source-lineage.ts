/** Test-only Git continuity proof. It never proves GitHub delivery or native ACK. */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'

const SHA = /^[a-f0-9]{40}$/
const DIGEST = /^[a-f0-9]{64}$/
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const PROVENANCE = 'lineage-provenance.json'
const MAX_HISTORY = 4096
const MAX_FILE_BYTES = 16 * 1024 * 1024
const MAX_TOTAL_BYTES = 64 * 1024 * 1024
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
function requireProof(ok: unknown, reason: string): asserts ok {
  if (!ok) throw new Error(`Capture lineage: ${reason}`)
}

export interface ExpectedCaptureGroup {
  repository: 'theycallme-eric/clear'
  taskId: string
  taskRevision: string
  runId: string
  attempt: 1 | 2
  testedBase: string
  groupPath: string
  /** Taken from the already validated real capture records, never inferred. */
  capturedSourceCommits: readonly string[]
}

export interface CaptureInputProvenance {
  version: 1
  kind: 'capture-input-provenance'
  repository: string
  taskId: string
  taskRevision: string
  runId: string
  attempt: number
  groupPath: string
  retainedBranch: string
  testedBase: string
  capturedSourceCommits: string[]
  payloadSha256: string
}

export type CaptureLineage = {
  mode: 'direct-ancestry' | 'structural-incorporation'
  capturedSourceCommits: readonly string[]
  deliveryProven: false
  inputCommit?: string
  incorporationCommit?: string
  treeSha?: string
}

function payload(root: string, group: string) {
  requireProof(/^docs\/design\/evidence-0143\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(group), 'unsafe evidence group')
  let path = root
  for (const part of group.split('/')) {
    path = resolve(path, part)
    requireProof(lstatSync(path).isDirectory() && !lstatSync(path).isSymbolicLink(), 'group directory is not regular')
  }
  const files = new Map<string, Buffer>()
  let total = 0
  const add = (relative: string) => {
    const stat = lstatSync(resolve(root, relative))
    requireProof(stat.isFile() && !stat.isSymbolicLink() && stat.size <= MAX_FILE_BYTES, 'payload file is not regular or exceeds bound')
    total += stat.size
    requireProof(total <= MAX_TOTAL_BYTES && files.size < 64, 'payload exceeds bound')
    files.set(relative, readFileSync(resolve(root, relative)))
  }
  requireProof(JSON.stringify(readdirSync(path).filter((name) => name !== PROVENANCE).sort()) === JSON.stringify(['manifest.json', 'records', 'screenshots']), 'unexpected or missing group member')
  add(`${group}/manifest.json`)
  for (const [folder, extension] of [['records', 'json'], ['screenshots', 'png']]) {
    const directory = resolve(root, group, folder)
    requireProof(lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink(), 'payload directory is not regular')
    const names = readdirSync(directory).sort()
    requireProof(names.length > 0, 'empty payload directory')
    for (const name of names) {
      requireProof(new RegExp(`^[a-z0-9][a-z0-9-]*\\.${extension}$`).test(name), 'unsafe payload filename')
      add(`${group}/${folder}/${name}`)
    }
  }
  const rows = [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, bytes]) => ({ path, sha256: hash(bytes) }))
  return { files, sha256: hash(JSON.stringify(rows)) }
}

/** Digest excludes only the provenance file itself; existing pixel/content validation remains mandatory. */
export function capturePayloadSha256(root: string, groupPath: string): string {
  return payload(realpathSync(root), groupPath).sha256
}

/** Call only after the unchanged capture-record/runtime/driver/PNG validator. No writes or network. */
export function assertCaptureSourceLineage(rootPath: string, expected: ExpectedCaptureGroup): CaptureLineage {
  const root = realpathSync(rootPath)
  requireProof(expected.repository === 'theycallme-eric/clear' && /^TASK-\d{3}$/.test(expected.taskId), 'wrong repository/task')
  requireProof(UUID.test(expected.runId) && [1, 2].includes(expected.attempt), 'wrong run/attempt')
  requireProof(new RegExp(`^[a-f0-9]{64}:${expected.taskId}$`).test(expected.taskRevision) && SHA.test(expected.testedBase), 'wrong revision/base')
  requireProof(/^docs\/design\/evidence-0143\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(expected.groupPath), 'unsafe evidence group')
  const captures = [...new Set(expected.capturedSourceCommits)].sort()
  requireProof(captures.length > 0 && captures.length <= 16 && captures.every((sha) => SHA.test(sha)), 'missing or invalid captured source')
  const deadline = Date.now() + 10_000
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')))
  env.GIT_TERMINAL_PROMPT = '0'
  env.GIT_GRAFT_FILE = '/dev/null'
  const git = (args: string[], ancestor = false): Buffer | false => {
    const remaining = deadline - Date.now()
    requireProof(remaining > 0, 'Git inspection deadline exceeded')
    const result = spawnSync('git', ['--no-optional-locks', '--no-replace-objects', ...args], {
      cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], timeout: Math.min(2000, remaining), maxBuffer: MAX_FILE_BYTES,
    })
    requireProof(!result.error && result.signal === null, 'Git inspection failed or exceeded command bound')
    if (ancestor && result.status === 1) return false
    requireProof(result.status === 0, `Git inspection failed (status ${result.status})`)
    return result.stdout
  }
  const text = (args: string[]) => (git(args) as Buffer).toString('utf8').trim()
  requireProof(realpathSync(text(['rev-parse', '--show-toplevel'])) === root, 'wrong Git root')
  const head = text(['rev-parse', '--verify', 'HEAD^{commit}'])
  requireProof(SHA.test(head), 'invalid HEAD')
  if (captures.every((sha) => git(['merge-base', '--is-ancestor', sha, head], true) !== false)) {
    requireProof(text(['rev-parse', '--verify', 'HEAD^{commit}']) === head, 'HEAD changed during inspection')
    return { mode: 'direct-ancestry', capturedSourceCommits: captures, deliveryProven: false }
  }

  const currentPayload = payload(root, expected.groupPath)
  const relativeProvenance = `${expected.groupPath}/${PROVENANCE}`
  const provenancePath = resolve(root, relativeProvenance)
  const stat = lstatSync(provenancePath)
  requireProof(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 16_384, 'missing or unsafe provenance')
  const raw = readFileSync(provenancePath)
  const p = JSON.parse(raw.toString('utf8')) as CaptureInputProvenance
  requireProof(p !== null && typeof p === 'object' && !Array.isArray(p), 'invalid provenance object')
  const keys = ['version', 'kind', 'repository', 'taskId', 'taskRevision', 'runId', 'attempt', 'groupPath', 'retainedBranch', 'testedBase', 'capturedSourceCommits', 'payloadSha256']
  requireProof(JSON.stringify(Object.keys(p).sort()) === JSON.stringify(keys.sort()), 'unknown or missing provenance fields')
  const branch = `agent-runner/${expected.taskId.toLowerCase()}-a${expected.attempt}-${expected.runId.slice(0, 8)}`
  requireProof(p.version === 1 && p.kind === 'capture-input-provenance' && p.retainedBranch === branch, 'wrong provenance kind/retained run branch')
  for (const key of ['repository', 'taskId', 'taskRevision', 'runId', 'attempt', 'groupPath', 'testedBase'] as const) {
    requireProof(p[key] === expected[key], `provenance ${key} mismatch`)
  }
  requireProof(Array.isArray(p.capturedSourceCommits) && JSON.stringify(p.capturedSourceCommits) === JSON.stringify(captures), 'captured source set mismatch')
  requireProof(typeof p.payloadSha256 === 'string' && DIGEST.test(p.payloadSha256) && p.payloadSha256 === currentPayload.sha256, 'payload digest mismatch')

  const refs = [`refs/heads/${branch}`, `refs/remotes/origin/${branch}`]
  const retainedInput = () => {
    const rows = text(['for-each-ref', '--format=%(refname) %(objecttype) %(objectname)', ...refs]).split('\n').filter(Boolean)
      .map((row) => row.split(' ')).filter(([ref]) => refs.includes(ref))
    requireProof(rows.length > 0 && rows.length <= 2 && rows.every(([, kind, sha]) => kind === 'commit' && SHA.test(sha)), 'missing or invalid exact retained ref')
    requireProof(new Set(rows.map(([, , sha]) => sha)).size === 1, 'local/origin retained refs disagree')
    return rows[0][2]
  }
  const input = retainedInput()
  for (const sha of [...captures, expected.testedBase]) {
    requireProof(git(['merge-base', '--is-ancestor', sha, input], true) !== false, 'captured source/base is not input ancestry')
  }
  requireProof((git(['show', `${input}:${relativeProvenance}`]) as Buffer).equals(raw), 'input provenance bytes differ')
  const entries = (git(['ls-tree', '-rz', input, '--', expected.groupPath]) as Buffer).toString('utf8').split('\0').filter(Boolean)
  const inputPaths = entries.map((row) => {
    const [metadata, path] = row.split('\t')
    requireProof(/^(100644|100755) blob [a-f0-9]{40}$/.test(metadata), 'input group contains a nonregular blob')
    return path
  }).sort()
  const expectedPaths = [...currentPayload.files.keys(), relativeProvenance].sort()
  requireProof(JSON.stringify(inputPaths) === JSON.stringify(expectedPaths), 'input group inventory differs')
  for (const [path, bytes] of currentPayload.files) {
    requireProof((git(['show', `${input}:${path}`]) as Buffer).equals(bytes), 'input payload bytes differ')
  }
  const tree = text(['rev-parse', '--verify', `${input}^{tree}`])
  requireProof(SHA.test(tree), 'invalid input tree')
  const history = text(['log', '--first-parent', `--max-count=${MAX_HISTORY + 1}`, '--format=%H %T %P', head]).split('\n').filter(Boolean)
  requireProof(history.length <= MAX_HISTORY, 'first-parent history exceeds bound')
  const matches = history.map((row) => row.split(' ')).filter(([, candidateTree, ...parents]) => candidateTree === tree && parents.length === 1 && parents[0] === expected.testedBase)
  requireProof(matches.length === 1 && SHA.test(matches[0][0]), 'missing or ambiguous exact structural incorporation')
  requireProof(text(['rev-parse', '--verify', 'HEAD^{commit}']) === head && retainedInput() === input, 'HEAD/retained input changed during inspection')
  requireProof(readFileSync(provenancePath).equals(raw) && payload(root, expected.groupPath).sha256 === currentPayload.sha256, 'current group changed during inspection')
  return { mode: 'structural-incorporation', capturedSourceCommits: captures, inputCommit: input, incorporationCommit: matches[0][0], treeSha: tree, deliveryProven: false }
}
