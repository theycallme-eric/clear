import { it as test } from 'vitest'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertCaptureSourceLineage, type ExpectedCaptureGroup, type CaptureInputProvenance } from './capture-source-lineage'

type FixtureOptions = { wrongParent?: boolean; direct?: boolean }
type MutableProvenance = CaptureInputProvenance & Record<string, unknown>

// Disposable synthetic Git repos only: these bytes are NOT screenshots or product evidence.
const group = 'docs/design/evidence-0143/task034-format-preview-mobile'
const run = '4b51f5c5-9389-430e-9df1-8339cbd089b8'
const branch = 'agent-runner/task-036-a1-4b51f5c5'
const digest = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex')
function fixture(options: FixtureOptions = {}) {
  const root = mkdtempSync(join(tmpdir(), 'clear-lineage-fixture-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const write = (path: string, text: string) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text) }
  const commit = (message: string) => { git('add', '.'); git('commit', '-qm', message); return git('rev-parse', 'HEAD') }
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Synthetic fixture')
  git('config', 'user.email', 'fixture@example.invalid')
  write('runtime.txt', 'base\n')
  const base = commit('base')
  git('checkout', '-qb', branch)
  write('runtime.txt', 'captured source\n')
  const captured = commit('source')
  const payload: [string, string][] = [
    [`${group}/manifest.json`, '{"fixture":true}\n'],
    [`${group}/records/mobile-clear.json`, '{"fixture":"not real proof"}\n'],
    [`${group}/screenshots/fixture.png`, 'NOT A PNG — LINEAGE UNIT FIXTURE\n'],
  ]
  for (const [path, bytes] of payload) write(path, bytes)
  const payloadSha256 = digest(JSON.stringify(payload.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, bytes]) => ({ path, sha256: digest(bytes) }))))
  const expected: ExpectedCaptureGroup = {
    repository: 'theycallme-eric/clear', taskId: 'TASK-036', taskRevision: `${'a'.repeat(64)}:TASK-036`,
    runId: run, attempt: 1, testedBase: options.wrongParent ? captured : base, groupPath: group,
    capturedSourceCommits: [captured],
  }
  const provenance: MutableProvenance = { version: 1, kind: 'capture-input-provenance', ...expected, capturedSourceCommits: [...expected.capturedSourceCommits], retainedBranch: branch, payloadSha256 }
  write(`${group}/lineage-provenance.json`, `${JSON.stringify(provenance)}\n`)
  const input = commit('evidence and provenance')
  if (!options.direct) {
    git('checkout', '-q', 'main')
    git('merge', '--squash', branch)
    commit('synthetic incorporation')
  }
  const incorporated = git('rev-parse', 'HEAD')
  return {
    root, git, write, commit, expected, provenance, base, captured, input, incorporated,
    prove: (patch: Partial<ExpectedCaptureGroup> = {}) => assertCaptureSourceLineage(root, { ...expected, ...patch }),
    changeProvenance: (change: (p: MutableProvenance) => void) => { const p = structuredClone(provenance); change(p); write(`${group}/lineage-provenance.json`, `${JSON.stringify(p)}\n`) },
    dispose: () => rmSync(root, { recursive: true, force: true }),
  }
}
function withFixture(name: string, action: (f: ReturnType<typeof fixture>) => void, options?: FixtureOptions) {
  test(name, () => { const f = fixture(options); try { action(f) } finally { f.dispose() } })
}

withFixture('direct captured-source ancestry remains sufficient and makes no delivery claim', (f) => {
  rmSync(join(f.root, group, 'lineage-provenance.json'))
  assert.deepEqual(f.prove(), { mode: 'direct-ancestry', capturedSourceCommits: [f.captured], deliveryProven: false })
}, { direct: true })
withFixture('actual identical-tree single-parent first-parent incorporation succeeds', (f) => {
  f.write('docs-only.txt', 'later docs\n'); f.commit('descendant docs')
  const result = f.prove()
  assert.equal(result.mode, 'structural-incorporation')
  assert.equal(result.inputCommit, f.input)
  assert.equal(result.incorporationCommit, f.incorporated)
  assert.equal(result.treeSha, f.git('rev-parse', `${f.input}^{tree}`))
  assert.equal(result.deliveryProven, false)
})
withFixture('matching exact local and origin refs succeed', (f) => {
  f.git('update-ref', `refs/remotes/origin/${branch}`, f.input)
  assert.equal(f.prove().mode, 'structural-incorporation')
})
withFixture('the exact origin run ref alone is supported', (f) => {
  f.git('update-ref', `refs/remotes/origin/${branch}`, f.input); f.git('branch', '-D', branch)
  assert.equal(f.prove().inputCommit, f.input)
})
withFixture('disagreeing local and origin refs fail closed', (f) => {
  f.git('update-ref', `refs/remotes/origin/${branch}`, f.base)
  assert.throws(() => f.prove(), /refs disagree/)
})
withFixture('a convenient unrelated retained ref cannot replace the exact run ref', (f) => {
  f.git('branch', 'unrelated-equal-tree-witness', f.input); f.git('branch', '-D', branch)
  assert.throws(() => f.prove(), /missing or invalid exact retained ref/)
})
withFixture('an arbitrary equal-tree commit outside the declared input is not searched', (f) => {
  const forged = f.git('commit-tree', f.git('rev-parse', `${f.input}^{tree}`), '-p', f.captured, '-m', 'unbound witness')
  f.git('branch', 'unbound-witness', forged); f.git('update-ref', `refs/heads/${branch}`, f.base)
  assert.throws(() => f.prove(), /not input ancestry/)
})
withFixture('an equal-tree declared input without captured-source ancestry is rejected', (f) => {
  const forged = f.git('commit-tree', f.git('rev-parse', `${f.input}^{tree}`), '-p', f.base, '-m', 'wrong ancestry')
  f.git('update-ref', `refs/heads/${branch}`, forged)
  assert.throws(() => f.prove(), /not input ancestry/)
})
withFixture('a Git replacement object cannot forge captured-source ancestry', (f) => {
  const forged = f.git('commit-tree', f.git('rev-parse', `${f.input}^{tree}`), '-p', f.base, '-m', 'wrong raw ancestry')
  f.git('update-ref', `refs/heads/${branch}`, forged)
  f.git('replace', forged, f.input)
  assert.throws(() => f.prove(), /not input ancestry/)
})
withFixture('missing captured commit objects cause a bounded Git error, not a bypass', (f) => {
  assert.throws(() => f.prove({ capturedSourceCommits: ['f'.repeat(40)] }), /Git inspection failed/)
})
withFixture('same input tree with a wrong tested-base parent is rejected', (f) => {
  assert.throws(() => f.prove(), /missing or ambiguous exact structural incorporation/)
}, { wrongParent: true })
withFixture('an identical-tree merge commit with two parents is not an incorporation', (f) => {
  const tree = f.git('rev-parse', `${f.input}^{tree}`)
  const merge = f.git('commit-tree', tree, '-p', f.base, '-p', f.captured, '-m', 'two-parent merge')
  // Captured source is then an ancestor, so use a separate unrelated parent instead.
  const unrelated = f.git('commit-tree', f.git('rev-parse', `${f.base}^{tree}`), '-m', 'unrelated root')
  const noCaptureMerge = f.git('commit-tree', tree, '-p', f.base, '-p', unrelated, '-m', 'two-parent no capture')
  f.git('update-ref', 'refs/heads/main', noCaptureMerge)
  assert.notEqual(merge, noCaptureMerge)
  assert.throws(() => f.prove(), /missing or ambiguous exact structural incorporation/)
})
withFixture('equivalent incorporation on a side branch does not satisfy first-parent history', (f) => {
  const unrelated = f.git('commit-tree', f.git('rev-parse', `${f.base}^{tree}`), '-p', f.base, '-m', 'other first parent')
  const merge = f.git('commit-tree', f.git('rev-parse', `${f.input}^{tree}`), '-p', unrelated, '-p', f.incorporated, '-m', 'side incorporation')
  f.git('update-ref', 'refs/heads/main', merge)
  assert.throws(() => f.prove(), /missing or ambiguous exact structural incorporation/)
})
withFixture('a separate equal-tree side witness is not selected or counted as first-parent history', (f) => {
  const second = f.git('commit-tree', f.git('rev-parse', `${f.input}^{tree}`), '-p', f.base, '-m', 'second witness')
  // A single-parent chain cannot contain siblings with the same exact base;
  // the side witness must not count as a second valid witness either.
  f.git('branch', 'second-witness', second)
  assert.equal(f.prove().incorporationCommit, f.incorporated)
})
const mutations: [string, (p: MutableProvenance) => void, RegExp][] = [
  ['wrong group', (p) => { p.groupPath = 'docs/design/evidence-0143/other' }, /groupPath mismatch/],
  ['wrong run', (p) => { p.runId = '0'.repeat(36) }, /runId mismatch/],
  ['wrong revision', (p) => { p.taskRevision = `${'b'.repeat(64)}:TASK-036` }, /taskRevision mismatch/],
  ['wrong repository', (p) => { p.repository = 'other/repo' }, /repository mismatch/],
  ['wrong branch', (p) => { p.retainedBranch = 'HEAD' }, /retained run branch/],
  ['wrong captured set', (p) => { p.capturedSourceCommits = [p.testedBase] }, /captured source set mismatch/],
  ['duplicate captured set', (p) => { p.capturedSourceCommits.push(...p.capturedSourceCommits) }, /captured source set mismatch/],
  ['unknown provenance field', (p) => { p.waiver = true }, /unknown or missing provenance/],
  ['false payload digest', (p) => { p.payloadSha256 = '0'.repeat(64) }, /payload digest mismatch/],
]
for (const [name, mutate, pattern] of mutations) withFixture(`${name} fails closed`, (f) => { f.changeProvenance(mutate); assert.throws(() => f.prove(), pattern) })
withFixture('altered current PNG bytes cannot reuse the original provenance', (f) => {
  f.write(`${group}/screenshots/fixture.png`, 'changed fixture\n')
  assert.throws(() => f.prove(), /payload digest mismatch/)
})
withFixture('current provenance bytes must match the input commit, even with valid JSON', (f) => {
  f.write(`${group}/lineage-provenance.json`, JSON.stringify(f.provenance, null, 2))
  assert.throws(() => f.prove(), /input provenance bytes differ/)
})
withFixture('input payload bytes must match the actual current evidence payload', (f) => {
  f.git('checkout', '-q', branch)
  f.write(`${group}/screenshots/fixture.png`, 'changed input bytes\n'); f.commit('altered retained input')
  f.git('checkout', '-q', 'main')
  assert.throws(() => f.prove(), /input payload bytes differ/)
})
withFixture('symlink payload files are refused', (f) => {
  rmSync(join(f.root, group, 'screenshots/fixture.png'))
  symlinkSync(join(f.root, 'runtime.txt'), join(f.root, group, 'screenshots/fixture.png'))
  assert.throws(() => f.prove(), /not regular/)
})
withFixture('unknown payload members and path traversal are refused', (f) => {
  f.write(`${group}/extra.json`, '{}')
  assert.throws(() => f.prove(), /unexpected or missing group member/)
  assert.throws(() => f.prove({ groupPath: '../outside' }), /unsafe evidence group/)
})
withFixture('a nonzero Git command fails without exposing its diagnostic text', (f) => {
  const original = process.env.PATH
  const bin = join(f.root, 'fake-bin'); mkdirSync(bin)
  writeFileSync(join(bin, 'git'), `#!${process.execPath}\nprocess.stderr.write('PRIVATE_DIAGNOSTIC');process.exit(17)\n`, { mode: 0o700 })
  try { process.env.PATH = `${bin}:${original}`; assert.throws(() => f.prove(), (e: unknown) => e instanceof Error && /status 17/.test(e.message) && !e.message.includes('PRIVATE_DIAGNOSTIC')) }
  finally { process.env.PATH = original }
})
