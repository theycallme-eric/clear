/** Task035 retained-proof interpretation. Disposable Git fixtures only; no live lane. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  RELEASE_LANES,
  assertReleaseGate,
  assertTask035ReleaseBinding,
  buildReleaseEvidence,
  evidenceDir,
  laneRecordPath,
  recordLanePass,
  writeReleaseEvidence,
} from '../../../scripts/generation-reliability/release-gate.mjs'

const BINDING = 'docs/process/ui-ux-2026-10-20-release-proof.json'
const GUIDE = 'docs/process/ui-ux-2026-10-20-owner-uat.md'
const JOURNAL = 'docs/journal/2026-10-22.md'
const CASE = 'task035-recovery-intensity-9-mobile-v1'
const REQUEST_ID = 'task035-synthetic-request'
const NOW = new Date('2026-10-22T12:00:00.000Z')
const SOURCE = {
  'supabase/functions/_shared/prompt.ts': "export const PROMPT_VERSION = '5.3.0'\n",
  'src/state/schemas.ts': "export const CONTRACT_VERSION = '4.2.0'\n",
  'supabase/functions/_shared/validate.ts': 'export const accepted = true\n',
  'docs/specs/generation/GENERATION_CONTRACT.md': 'Contract `4.2.0` with prompt `5.3.0`\n',
  'src/consumer.ts': 'export const retained = true\n',
  '.gitignore': 'release-evidence/\n',
}
const scratch: string[] = []
afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true })
})

const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
const json = (root: string, path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(root, path), 'utf8'))
function write(root: string, path: string, contents: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), contents)
}
const writeJson = (root: string, path: string, value: unknown) =>
  write(root, path, `${JSON.stringify(value, null, 2)}\n`)
function git(root: string, ...args: string[]) {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
  }).trim()
}
function commit(root: string, message: string) {
  git(root, 'add', '--all')
  git(root, 'commit', '-m', message)
  return git(root, 'rev-parse', 'HEAD')
}
function fixture(source: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'clear-task035-binding-'))
  scratch.push(root)
  git(root, 'init', '-b', 'proof')
  git(root, 'config', 'user.name', 'Offline proof fixture')
  git(root, 'config', 'user.email', 'offline-fixture@example.com')
  for (const [path, contents] of Object.entries({ ...SOURCE, ...source })) write(root, path, contents)
  const runtime = commit(root, 'reviewed runtime R')
  for (const lane of RELEASE_LANES) recordLanePass({ root, lane: lane.id, commit: runtime, now: NOW })
  const journeyPath = writeReleaseEvidence(root, buildReleaseEvidence({
    commit: runtime, passed: true, accepted: true, requestId: REQUEST_ID,
    status: 200, code: null, generationRequests: 1,
  }, new Date(NOW.getTime() + 1000)))
  const assertionPath = `release-evidence/${runtime}/task035-release-observations.json`
  writeJson(root, assertionPath, {
    version: 1, proofCaseId: CASE, commit: runtime, requestId: REQUEST_ID,
    promptVersion: '5.3.0', contractVersion: '4.2.0',
    request: { goal: 'active_recovery', focus: 'full_body', requestedDurationMins: 15, requestedIntensity: 9 },
    accepted: {
      goal: 'active_recovery', focus: 'full_body', requestedDurationMins: 15, effectiveDurationMins: 15,
      requestedIntensity: 9, effectiveIntensity: 3, overview: null, sectionNotes: [null, null],
    },
    display: { overviewSuppressed: true, sectionNotesSuppressed: true, intensity: '3 of 10',
      goal: 'Active recovery', focus: 'Full body', duration: '15 min' },
    persisted: { sessionCount: 1, requestedIntensity: 9, effectiveIntensity: 3,
      overview: null, sectionNotes: [null, null], ladderTimingMatches: true,
      promptVersion: '5.3.0', contractVersion: '4.2.0' },
  })
  const binding: Record<string, unknown> = {
    version: 1, outcome: 'passed', runtimeCommit: runtime, frontendCommit: runtime,
    backendSourceTree: git(root, 'rev-parse', `${runtime}:supabase/functions`),
    requestId: REQUEST_ID,
    promptSha256: sha(readFileSync(join(root, 'supabase/functions/_shared/prompt.ts'))),
    contractSha256: sha(readFileSync(join(root, 'src/state/schemas.ts'))),
    backendValidatorSha256: sha(readFileSync(join(root, 'supabase/functions/_shared/validate.ts'))),
    contractDocumentSha256: sha(readFileSync(join(root, 'docs/specs/generation/GENERATION_CONTRACT.md'))),
    promptVersion: '5.3.0', contractVersion: '4.2.0',
    backendDeploymentReceipt: 'retained/backend-deployment.json',
    frontendDeploymentReceipt: 'retained/frontend-deployment.json',
    workflowRunId: '123', ownerAuthorizationRef: 'retained/action-time-authority.json',
    proofCaseId: CASE, introductionsObserved: true, intensityObserved: true,
    assertionArtifact: { path: assertionPath, sha256: sha(readFileSync(join(root, assertionPath))) },
    recordedAt: new Date(NOW.getTime() + 2000).toISOString(),
  }
  writeJson(root, BINDING, binding)
  write(root, GUIDE, '# Existing owner guide; owner acceptance pending\n')
  write(root, JOURNAL, '# Actual proof retained under R; not rebound to D\n')
  const document = commit(root, 'documentary binding D, not a new runtime')
  return { root, runtime, document, binding, journeyPath, assertionPath }
}
type Fixture = ReturnType<typeof fixture>
function saveBinding(f: Fixture) {
  writeJson(f.root, BINDING, f.binding)
  commit(f.root, 'retain changed documentary fixture')
}
function changeObservation(f: Fixture, edit: (value: Record<string, unknown>) => void) {
  const value = json(f.root, f.assertionPath)
  edit(value)
  writeJson(f.root, f.assertionPath, value)
  f.binding.assertionArtifact = { path: f.assertionPath, sha256: sha(readFileSync(join(f.root, f.assertionPath))) }
  saveBinding(f)
}
const refuses = (f: Fixture) => expect(() => assertTask035ReleaseBinding(f.root)).toThrow(
  'Missing, stale or inconclusive Task035 local release proof',
)

describe('Task035 actual runtime R and later documentary D', () => {
  it('accepts original R artifacts plus clean docs-only D without relabelling or changing the original gate', () => {
    const f = fixture()
    expect(f.runtime).not.toBe(f.document)
    expect(() => assertReleaseGate(f.root)).toThrow('has no recorded run')
    const bytes = readFileSync(f.journeyPath)
    expect(assertTask035ReleaseBinding(f.root)).toEqual({
      ok: true, localOnly: true, runtimeCommit: f.runtime, documentCommit: f.document,
      independentRemoteProofReviewRequired: true, ownerAcceptance: false,
    })
    expect(readFileSync(f.journeyPath)).toEqual(bytes)
    expect(json(f.root, BINDING)).not.toHaveProperty('documentaryCommit')
    expect(git(f.root, 'status', '--porcelain')).toBe('')
  })

  it.each(['src/consumer.ts', 'docs/adjacent-release-policy.md', '.github/workflows/new.yml'])(
    'refuses a tracked change outside the exact three documentary paths: %s', path => {
      const f = fixture()
      write(f.root, path, 'changed after the actual tested runtime\n')
      commit(f.root, 'non-equivalent source')
      refuses(f)
    },
  )

  it('checks tracked mode as well as bytes', () => {
    const f = fixture()
    chmodSync(join(f.root, 'src/consumer.ts'), 0o755)
    commit(f.root, 'mode-only source mutation')
    expect(git(f.root, 'diff', '--summary', f.runtime, 'HEAD')).toContain('mode change')
    refuses(f)
  })

  it('refuses a renamed or removed tracked runtime file', () => {
    const f = fixture()
    renameSync(join(f.root, 'src/consumer.ts'), join(f.root, 'src/renamed.ts'))
    commit(f.root, 'rename runtime source')
    refuses(f)
  })

  it.each(['tracked', 'untracked'])('refuses a %s dirty tree', kind => {
    const f = fixture()
    write(f.root, kind === 'tracked' ? GUIDE : 'unexpected-untracked.txt', 'not committed\n')
    refuses(f)
  })

  it('refuses a sibling runtime rather than accepting source similarity as ancestry', () => {
    const f = fixture()
    git(f.root, 'checkout', '-b', 'sibling', f.runtime)
    write(f.root, GUIDE, 'a sibling-only guide\n')
    const sibling = commit(f.root, 'sibling R is not in actual D history')
    git(f.root, 'checkout', 'proof')
    f.binding.runtimeCommit = sibling
    f.binding.frontendCommit = sibling
    saveBinding(f)
    refuses(f)
  })

  it('does not let Git replacement objects forge sibling ancestry', () => {
    const f = fixture()
    git(f.root, 'checkout', '-b', 'sibling', f.runtime)
    write(f.root, GUIDE, 'sibling\n')
    const sibling = commit(f.root, 'sibling')
    git(f.root, 'checkout', 'proof')
    git(f.root, 'replace', sibling, f.runtime)
    f.binding.runtimeCommit = sibling
    f.binding.frontendCommit = sibling
    saveBinding(f)
    refuses(f)
  })

  it('refuses unavailable runtime objects without leaking Git diagnostics', () => {
    const f = fixture()
    f.binding.runtimeCommit = 'a'.repeat(40)
    f.binding.frontendCommit = 'a'.repeat(40)
    saveBinding(f)
    refuses(f)
  })
})

describe('Task035 actual R lanes/journey and exact version binding', () => {
  it.each([
    ['version', 2], ['outcome', 'skipped'], ['promptVersion', '5.2.0'], ['contractVersion', '4.1.0'],
    ['backendSourceTree', 'a'.repeat(40)], ['promptSha256', 'a'.repeat(64)],
    ['contractSha256', 'a'.repeat(64)], ['backendValidatorSha256', 'a'.repeat(64)],
    ['contractDocumentSha256', 'a'.repeat(64)], ['requestId', 'a-different-request'],
    ['workflowRunId', 0], ['backendDeploymentReceipt', ''], ['frontendDeploymentReceipt', ''],
    ['ownerAuthorizationRef', ''], ['proofCaseId', 'some-other-case'],
    ['introductionsObserved', false], ['intensityObserved', false],
    ['recordedAt', 'not-a-date'], ['recordedAt', NOW.toISOString()],
  ])('refuses missing/wrong binding %s=%s', (field, value) => {
    const f = fixture()
    f.binding[field as string] = value
    saveBinding(f)
    refuses(f)
  })

  it('does not re-label frontend or live artifacts with D', () => {
    const f = fixture()
    f.binding.frontendCommit = f.document
    saveBinding(f)
    refuses(f)
    f.binding.frontendCommit = f.runtime
    saveBinding(f)
    const live = JSON.parse(readFileSync(f.journeyPath, 'utf8'))
    writeFileSync(f.journeyPath, JSON.stringify({ ...live, commit: f.document }))
    refuses(f)
  })

  it.each([
    ['supabase/functions/_shared/prompt.ts', "export const PROMPT_VERSION = '5.2.0'\n"],
    ['src/state/schemas.ts', "export const CONTRACT_VERSION = '4.1.0'\n"],
    ['docs/specs/generation/GENERATION_CONTRACT.md', 'Only a superseded contract\n'],
  ])('checks actual version-bearing source despite matching claimed hashes: %s', (path, source) => {
    refuses(fixture({ [path]: source }))
  })

  it.each(RELEASE_LANES)('refuses absent, skipped or stale actual $id lane records', lane => {
    const f = fixture(), path = laneRecordPath(f.root, f.runtime, lane.id)
    const original = readFileSync(path)
    rmSync(path)
    refuses(f)
    writeFileSync(path, JSON.stringify({ lane: lane.id, commit: f.runtime, status: 'skipped', recordedAt: NOW.toISOString() }))
    refuses(f)
    writeFileSync(path, JSON.stringify({ lane: lane.id, commit: f.document, status: 'passed', recordedAt: NOW.toISOString() }))
    refuses(f)
    writeFileSync(path, original)
    expect(assertTask035ReleaseBinding(f.root).ok).toBe(true)
  })

  it.each([
    ['failureClass', null], ['failureClass', 'after_response'], ['outcome', 'skipped'],
    ['status', 201], ['code', 'GENERATION_EXHAUSTED'], ['generationRequests', 0],
    ['generationRequests', 2], ['requestId', ''], ['recordedAt', 'invalid'],
    ['recordedAt', '2999-01-01T00:00:00Z'], ['privateResponse', 'never expose this'],
  ])('refuses wrong/skipped/inconclusive journey %s=%s', (field, value) => {
    const f = fixture(), live = JSON.parse(readFileSync(f.journeyPath, 'utf8'))
    live[field as string] = value
    writeFileSync(f.journeyPath, JSON.stringify(live))
    refuses(f)
  })

  it('requires actual retained journey bytes and assertion bytes, not observation booleans alone', () => {
    const f = fixture(), live = readFileSync(f.journeyPath)
    rmSync(f.journeyPath)
    refuses(f)
    writeFileSync(f.journeyPath, live)
    rmSync(join(f.root, f.assertionPath))
    refuses(f)
  })

  it('refuses ambiguous non-ISO timestamps even when every artifact has matching chronology', () => {
    const f = fixture()
    f.binding.recordedAt = '1'
    saveBinding(f)
    const live = JSON.parse(readFileSync(f.journeyPath, 'utf8'))
    writeFileSync(f.journeyPath, JSON.stringify({ ...live, recordedAt: '1' }))
    for (const lane of RELEASE_LANES) {
      writeFileSync(laneRecordPath(f.root, f.runtime, lane.id), JSON.stringify({
        lane: lane.id, commit: f.runtime, status: 'passed', recordedAt: '1',
      }))
    }
    refuses(f)
  })

  it('refuses a mutated adjunct or reference outside the exact runtime directory', () => {
    const f = fixture()
    write(f.root, f.assertionPath, '{}\n')
    refuses(f)
    f.binding.assertionArtifact = { path: `release-evidence/${f.document}/task035-release-observations.json`, sha256: sha('{}\n') }
    saveBinding(f)
    refuses(f)
  })

  it('refuses symlinked retained artifacts even when the bytes match', () => {
    const f = fixture(), bytes = readFileSync(join(f.root, f.assertionPath))
    write(f.root, `${evidenceDir(f.root, f.runtime).slice(f.root.length + 1)}/copy.json`, bytes.toString('utf8'))
    rmSync(join(f.root, f.assertionPath))
    symlinkSync('copy.json', join(f.root, f.assertionPath))
    refuses(f)
  })
})

describe('Task035 closed request/accepted/displayed/persisted observations', () => {
  it.each([
    ['version', 2], ['proofCaseId', 'unrelated'], ['requestId', 'other-request'],
    ['commit', 'a'.repeat(40)], ['promptVersion', '5.2.0'], ['contractVersion', '4.1.0'],
    ['userEmail', 'must-not-be-retained@example.com'],
  ])('refuses altered adjunct identity or unknown fields: %s', (field, value) => {
    const f = fixture()
    changeObservation(f, record => { record[field as string] = value })
    refuses(f)
  })

  it.each([
    ['request', 'requestedIntensity', 3], ['request', 'goal', 'strength'],
    ['request', 'focus', 'upper'], ['request', 'requestedDurationMins', 30],
    ['accepted', 'requestedIntensity', 3], ['accepted', 'effectiveIntensity', 9],
    ['accepted', 'effectiveDurationMins', 30], ['accepted', 'overview', 'invented introduction'],
    ['accepted', 'sectionNotes', []], ['accepted', 'sectionNotes', [null, 'a note']],
    ['display', 'overviewSuppressed', false], ['display', 'sectionNotesSuppressed', false],
    ['display', 'intensity', '9 of 10'], ['display', 'goal', 'Strength'],
    ['display', 'focus', 'Upper body'], ['display', 'duration', '30 min'],
    ['persisted', 'sessionCount', 2], ['persisted', 'requestedIntensity', 3],
    ['persisted', 'effectiveIntensity', 9], ['persisted', 'overview', 'an introduction'],
    ['persisted', 'sectionNotes', [null]], ['persisted', 'ladderTimingMatches', false],
    ['persisted', 'promptVersion', '5.2.0'], ['persisted', 'contractVersion', '4.1.0'],
  ])('refuses incorrect actual %s.%s', (part, field, value) => {
    const f = fixture()
    changeObservation(f, record => { (record[part as string] as Record<string, unknown>)[field as string] = value })
    refuses(f)
  })
})
