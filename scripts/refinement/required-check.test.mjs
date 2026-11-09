// Bootstrap self-tests for the shared refinement checkers (TASK-039).
//
// Run through the guard itself:
//   node scripts/refinement/run-required-check.mjs --task TASK-039 --check bootstrap -- \
//     node --test scripts/refinement/required-check.test.mjs
//
// Every runner case below executes the actually installed runner (Vitest
// JSON, Playwright JSON, Node TAP) on fixtures under fixtures/, with positive
// and negative outcomes. Synthetic manifests live in temporary evidence roots
// so no task's real evidence is touched.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, describe, test } from 'node:test'

import { parseNodeTap, parsePlaywrightJson, parseVitestJson } from './lib/native-results.mjs'
import { resolveObjectStore, verifyReference } from './lib/references.mjs'
import {
  analyseCommand,
  evaluateResults,
  readFreshReport,
  runRequiredCheck,
  sha256,
  validateManifest,
} from './lib/required-check.mjs'
import { verifyDefinitionRecord } from './verify-definition-record.mjs'
import { verifyDeliveryEvidence } from './verify-delivery-evidence.mjs'

const repo = resolve(import.meta.dirname, '../..')
const BODY = 'clear-refinement-20261103'
const VITEST_CONFIG = 'scripts/refinement/fixtures/vitest/vitest.config.mjs'
const PW_CONFIG = 'scripts/refinement/fixtures/playwright/playwright.config.mjs'
const fx = (runner, name) => `scripts/refinement/fixtures/${runner}/${name}`

const scratch = mkdtempSync(join(tmpdir(), 'required-check-selftest-'))
after(() => rmSync(scratch, { recursive: true, force: true }))
let counter = 0

/** A fresh evidence root holding one synthetic manifest for TASK-9NN. */
function synthetic(check, { task = 'TASK-901', checkId = 'check-01' } = {}) {
  counter += 1
  const evidenceRoot = join(scratch, `evidence-${counter}`)
  const manifest = { schema: 'clear-refinement-required-cases/v1', task, checks: { [checkId]: check } }
  mkdirSync(join(evidenceRoot, task.toLowerCase()), { recursive: true })
  writeFileSync(join(evidenceRoot, task.toLowerCase(), 'required-cases.json'), JSON.stringify(manifest, null, 2))
  return { evidenceRoot, task, checkId }
}

function guard(check, command, options = {}) {
  const { evidenceRoot, task, checkId } = synthetic(check, options)
  const result = runRequiredCheck({ cwd: repo, evidenceRoot, task, check: checkId, command, stdio: 'pipe' })
  return { ...result, evidenceRoot, task, checkId }
}

function assertRejected(result, pattern) {
  assert.equal(result.ok, false, 'guard must reject')
  assert.equal(result.receipt.verdict, 'rejected')
  assert.ok(
    result.problems.some((problem) => pattern.test(problem)),
    `expected a problem matching ${pattern}, got:\n${result.problems.join('\n')}`,
  )
}

const vitestCheck = (files, cases) => ({ runner: 'vitest', files, cases })
const vitestRun = (...args) => ['npx', 'vitest', 'run', '--config', VITEST_CONFIG, ...args, '--passWithNoTests=false']

describe('TASK-AC-BB6BBF630DDC vitest JSON', () => {
  test('accepts when every requested file exists and every required case passes', () => {
    const file = fx('vitest', 'pass.case.mjs')
    const result = guard(vitestCheck([file], [
      { file, name: 'guard fixture > required case passes' },
      { file, name: 'guard fixture > nested > deep case passes' },
    ]), vitestRun(file))
    assert.equal(result.ok, true, result.problems.join('\n'))
    assert.equal(result.receipt.verdict, 'passed')
    assert.equal(result.receipt.totals.executed, 3)
    assert.deepEqual(result.receipt.requiredCases.map((c) => c.status), ['passed', 'passed'])
  })

  test('ignores unrelated cases filtered out by --testNamePattern', () => {
    const file = fx('vitest', 'mixed.case.mjs')
    const result = guard(vitestCheck([file], [{ file, name: 'mixed fixture > passing case' }]),
      vitestRun(file, '--testNamePattern', 'passing case'))
    assert.equal(result.ok, true, result.problems.join('\n'))
    assert.ok(result.receipt.totals.skipped >= 2, 'filtered-out cases are reported as skipped, not required')
  })

  test('rejects a failing required case', () => {
    const file = fx('vitest', 'mixed.case.mjs')
    const result = guard(vitestCheck([file], [{ file, name: 'mixed fixture > failing case' }]), vitestRun(file))
    assertRejected(result, /required case was failed: .*failing case/)
    assertRejected(result, /runner exited with code 1/)
  })

  test('rejects skipped and todo required cases', () => {
    const file = fx('vitest', 'mixed.case.mjs')
    const result = guard(vitestCheck([file], [
      { file, name: 'mixed fixture > passing case' },
      { file, name: 'mixed fixture > skipped case' },
      { file, name: 'mixed fixture > todo case' },
    ]), vitestRun(file, '--testNamePattern', 'passing|skipped|todo'))
    assertRejected(result, /required case was skipped: .*skipped case/)
    assertRejected(result, /required case was todo: .*todo case/)
  })

  test('rejects an all-skipped run even when the runner exits 0', () => {
    const file = fx('vitest', 'skipped.case.mjs')
    const result = guard(vitestCheck([file], [{ file, name: 'only skipped case' }]),
      ['npx', 'vitest', 'run', '--config', VITEST_CONFIG, file])
    assertRejected(result, /all skipped: no case executed/)
  })

  test('rejects zero execution when a name filter matches nothing', () => {
    const file = fx('vitest', 'pass.case.mjs')
    const result = guard(vitestCheck([file], [{ file, name: 'guard fixture > required case passes' }]),
      ['npx', 'vitest', 'run', '--config', VITEST_CONFIG, file, '--testNamePattern', 'no such case', '--passWithNoTests'])
    assert.equal(result.ok, false)
    assert.ok(result.problems.some((p) => /all skipped|zero execution/.test(p)), result.problems.join('\n'))
    assertRejected(result, /required case was skipped/)
  })

  test('rejects mixed existing and missing targets before running', () => {
    const file = fx('vitest', 'pass.case.mjs')
    const missing = fx('vitest', 'missing.case.mjs')
    const result = guard(vitestCheck([file, missing], [
      { file, name: 'guard fixture > required case passes' },
      { file: missing, name: 'never runs' },
    ]), vitestRun(file, missing))
    assertRejected(result, /mixed existing\/missing targets: requested file does not exist: .*missing\.case\.mjs/)
    assert.equal(result.receipt.totals, null, 'no runner result is accepted for a mixed request')
  })

  test('rejects an existing target that the runner never collected', () => {
    const file = fx('vitest', 'pass.case.mjs')
    const outside = fx('vitest', 'not-collected.mjs')
    const result = guard(vitestCheck([file, outside], [
      { file, name: 'guard fixture > required case passes' },
      { file: outside, name: 'outside include passes' },
    ]), vitestRun(file, outside))
    assertRejected(result, /requested target produced no native results: .*not-collected\.mjs/)
  })

  test('rejects an absent native report', () => {
    const file = fx('vitest', 'pass.case.mjs')
    const result = guard(vitestCheck([file], [{ file, name: 'guard fixture > required case passes' }]),
      ['npx', 'vitest', 'run', '--config=scripts/refinement/fixtures/vitest/absent.config.mjs', file])
    assertRejected(result, /absent native report/)
  })

  test('rejects stale native reports by path, file time and runner start time', () => {
    const path = join(scratch, 'stale.json')
    writeFileSync(path, '{}')
    assert.throws(() => readFreshReport(path, { startedAt: Date.now(), existedBefore: true }), /stale native report/)
    const old = new Date(Date.now() - 60_000)
    utimesSync(path, old, old)
    assert.throws(() => readFreshReport(path, { startedAt: Date.now() }), /stale native report: the result file predates/)
    const parsed = { format: 'vitest-json', cases: [{ file: 'a', name: 'x', project: null, status: 'passed' }], fileErrors: [], startTime: Date.now() - 60_000 }
    const verdict = evaluateResults({ check: { cases: [{ file: 'a', name: 'x' }] }, parsed, targets: ['a'], exitCode: 0, startedAt: Date.now() })
    assert.equal(verdict.ok, false)
    assert.ok(verdict.problems.some((p) => /stale native report: the runner start time/.test(p)))
  })

  test('parses the installed Vitest JSON shape with nested titles and todo status', () => {
    const text = JSON.stringify({ startTime: 5, testResults: [{ name: join(repo, 'a.test.ts'), status: 'passed', assertionResults: [
      { ancestorTitles: ['outer', 'inner'], title: 't', status: 'passed' },
      { ancestorTitles: [], title: 'later', status: 'todo' },
      { ancestorTitles: [], title: 'pending', status: 'pending' },
    ] }] })
    const parsed = parseVitestJson(text, { cwd: repo })
    assert.deepEqual(parsed.cases.map((c) => [c.file, c.name, c.status]), [
      ['a.test.ts', 'outer > inner > t', 'passed'], ['a.test.ts', 'later', 'todo'], ['a.test.ts', 'pending', 'skipped'],
    ])
  })
})

const pwCheck = (files, cases) => ({ runner: 'playwright', files, cases })
const pwRun = (...args) => ['npx', 'playwright', 'test', '--config', PW_CONFIG, ...args, '--project=mobile']

describe('TASK-AC-BB6BBF630DDC playwright JSON', () => {
  test('accepts required cases that pass in the selected project', () => {
    const file = fx('playwright', 'pass.case.mjs')
    const result = guard(pwCheck([file], [{ file, name: 'guard fixture > required case passes', project: 'mobile' }]), pwRun(file))
    assert.equal(result.ok, true, result.problems.join('\n'))
    assert.equal(result.receipt.totals.executed, 2, 'the unselected project is filtered out entirely')
  })

  test('rejects a runtime-skipped required case even though Playwright marks it ok', () => {
    const file = fx('playwright', 'mixed.case.mjs')
    const result = guard(pwCheck([file], [
      { file, name: 'mixed fixture > passing case' },
      { file, name: 'mixed fixture > runtime skipped case' },
    ]), pwRun(file, '--grep', 'passing|runtime'))
    assertRejected(result, /required case was skipped: .*runtime skipped case/)
  })

  test('rejects a failing required case', () => {
    const file = fx('playwright', 'mixed.case.mjs')
    const result = guard(pwCheck([file], [{ file, name: 'mixed fixture > failing case' }]), pwRun(file, '--grep', 'failing'))
    assertRejected(result, /required case was failed/)
  })

  test('rejects a required case declared for a project that did not run', () => {
    const file = fx('playwright', 'pass.case.mjs')
    const result = guard(pwCheck([file], [{ file, name: 'guard fixture > required case passes', project: 'other' }]), pwRun(file))
    assertRejected(result, /required case did not run: .*\[other\]/)
  })

  test('rejects an existing target that Playwright never collected', () => {
    const file = fx('playwright', 'pass.case.mjs')
    const outside = fx('playwright', 'not-collected.mjs')
    const result = guard(pwCheck([file, outside], [
      { file, name: 'guard fixture > required case passes' },
      { file: outside, name: 'outside testMatch passes' },
    ]), pwRun(file, outside))
    assertRejected(result, /requested target produced no native results: .*not-collected\.mjs/)
  })

  test('parses flaky and expected-failure outcomes as failures', () => {
    const spec = (title, test) => ({ title, file: 'x.spec.ts', tests: [test] })
    const text = JSON.stringify({ config: { rootDir: join(repo, 'e2e') }, stats: { startTime: new Date().toISOString() }, suites: [{ title: 'x.spec.ts', file: 'x.spec.ts', specs: [
      spec('flaky', { projectName: 'mobile', status: 'flaky', expectedStatus: 'passed', results: [{ status: 'failed' }, { status: 'passed' }] }),
      spec('expected failure', { projectName: 'mobile', status: 'expected', expectedStatus: 'failed', results: [{ status: 'failed' }] }),
      spec('clean', { projectName: 'mobile', status: 'expected', expectedStatus: 'passed', results: [{ status: 'passed' }] }),
    ] }] })
    const parsed = parsePlaywrightJson(text, { cwd: repo })
    assert.deepEqual(parsed.cases.map((c) => [c.file, c.name, c.status]), [
      ['e2e/x.spec.ts', 'flaky', 'failed'], ['e2e/x.spec.ts', 'expected failure', 'failed'], ['e2e/x.spec.ts', 'clean', 'passed'],
    ])
  })
})

const nodeCheck = (files, cases) => ({ runner: 'node-test', files, cases })

describe('TASK-AC-BB6BBF630DDC node-test TAP', () => {
  test('accepts nested and hash-escaped required cases', () => {
    const file = fx('node-test', 'pass.case.mjs')
    const result = guard(nodeCheck([file], [
      { file, name: 'guard fixture > required case passes' },
      { file, name: 'guard fixture > name with # hash passes' },
      { file, name: 'top level case passes' },
    ]), ['node', '--test', file])
    assert.equal(result.ok, true, result.problems.join('\n'))
    assert.equal(result.receipt.totals.executed, 3)
  })

  test('rejects skipped, todo and failing required cases', () => {
    const file = fx('node-test', 'mixed.case.mjs')
    const result = guard(nodeCheck([file], [
      { file, name: 'mixed fixture > passing case' },
      { file, name: 'mixed fixture > skipped case' },
      { file, name: 'mixed fixture > todo case' },
      { file, name: 'mixed fixture > failing case' },
    ]), ['node', '--test', file])
    assertRejected(result, /required case was skipped/)
    assertRejected(result, /required case was todo/)
    assertRejected(result, /required case was failed/)
  })

  test('rejects the synthetic pass node reports for a file with no tests', () => {
    const file = fx('node-test', 'empty.case.mjs')
    const result = guard(nodeCheck([file], [{ file, name: 'anything' }]), ['node', '--test', file])
    assertRejected(result, /zero execution: .*empty\.case\.mjs declared no tests/)
  })

  test('rejects a missing file that node --test would silently ignore', () => {
    const file = fx('node-test', 'pass.case.mjs')
    const missing = fx('node-test', 'missing.case.mjs')
    const result = guard(nodeCheck([file, missing], [
      { file, name: 'top level case passes' },
      { file: missing, name: 'never runs' },
    ]), ['node', '--test', file, missing])
    assertRejected(result, /mixed existing\/missing targets/)
  })

  // Reviewer reproduction (repair round 1): t/a.test.mjs runs only 'a only';
  // t/b.test.mjs runs 'b case' and 'claimed for a'. A required case declared
  // for t/a.test.mjs must never pass because a same-named case ran in b.
  function twoFileProject() {
    const cwd = join(scratch, `two-file-${++counter}`)
    mkdirSync(join(cwd, 't'), { recursive: true })
    writeFileSync(join(cwd, 't/a.test.mjs'), "import { test } from 'node:test'\ntest('a only', () => {})\n")
    writeFileSync(join(cwd, 't/b.test.mjs'), "import { test } from 'node:test'\ntest('b case', () => {})\ntest('claimed for a', () => {})\n")
    return cwd
  }
  function twoFileGuard(cases) {
    const cwd = twoFileProject()
    const evidenceRoot = join(cwd, 'evidence')
    const manifest = {
      schema: 'clear-refinement-required-cases/v1',
      task: 'TASK-901',
      checks: { 'check-01': nodeCheck(['t/a.test.mjs', 't/b.test.mjs'], cases) },
    }
    mkdirSync(join(evidenceRoot, 'task-901'), { recursive: true })
    writeFileSync(join(evidenceRoot, 'task-901/required-cases.json'), JSON.stringify(manifest, null, 2))
    return runRequiredCheck({
      cwd, evidenceRoot, task: 'TASK-901', check: 'check-01',
      command: ['node', '--test', 't/a.test.mjs', 't/b.test.mjs'], stdio: 'pipe',
    })
  }

  test('rejects a required case claimed for one file that only ran in another file', () => {
    const result = twoFileGuard([
      { file: 't/a.test.mjs', name: 'claimed for a' },
      { file: 't/b.test.mjs', name: 'b case' },
    ])
    assertRejected(result, /required case did not run: t\/a\.test\.mjs > claimed for a/)
    const byKey = Object.fromEntries(result.receipt.requiredCases.map((c) => [`${c.file} > ${c.name}`, c.status]))
    assert.equal(byKey['t/a.test.mjs > claimed for a'], 'missing', 'the receipt never records it as passed for a')
    assert.equal(byKey['t/b.test.mjs > b case'], 'passed')
  })

  test('attributes node:test cases per file when several targets are requested', () => {
    const result = twoFileGuard([
      { file: 't/a.test.mjs', name: 'a only' },
      { file: 't/b.test.mjs', name: 'b case' },
      { file: 't/b.test.mjs', name: 'claimed for a' },
    ])
    assert.equal(result.ok, true, result.problems.join('\n'))
    assert.equal(result.receipt.totals.executed, 3)
    assert.deepEqual(result.receipt.targets.map((t) => t.path), ['t/a.test.mjs', 't/b.test.mjs'])
  })

  test('rejects a multi-target TAP report that cannot attribute cases to files', () => {
    const tap = ['TAP version 13', '# Subtest: claimed for a', 'ok 1 - claimed for a', '1..1'].join('\n')
    const targets = ['t/a.test.mjs', 't/b.test.mjs']
    const parsed = parseNodeTap(tap, { targets })
    const check = nodeCheck(targets, [{ file: 't/a.test.mjs', name: 'claimed for a' }, { file: 't/b.test.mjs', name: 'claimed for a' }])
    const verdict = evaluateResults({ check, parsed, targets, exitCode: 0 })
    assert.equal(verdict.ok, false)
    assert.ok(verdict.problems.some((p) => /cannot be attributed to a file/.test(p)), verdict.problems.join('\n'))
    assert.ok(verdict.requiredCases.every((c) => c.status === 'missing'))
  })

  test('parses TAP directives, escapes and suite types', () => {
    const tap = [
      'TAP version 13',
      '# Subtest: suite',
      '    # Subtest: a \\# b',
      '    ok 1 - a \\# b',
      '      ---',
      "      type: 'test'",
      '      ...',
      '    # Subtest: s',
      '    ok 2 - s # SKIP reason',
      '    # Subtest: t',
      '    ok 3 - t # TODO',
      '    1..3',
      'ok 1 - suite',
      '  ---',
      "  type: 'suite'",
      '  ...',
      '1..1',
    ].join('\n')
    const parsed = parseNodeTap(tap, { targets: ['f.test.mjs'] })
    assert.deepEqual(parsed.cases.map((c) => [c.name, c.status]), [
      ['suite > a # b', 'passed'], ['suite > s', 'skipped'], ['suite > t', 'todo'],
    ])
  })
})

describe('TASK-AC-BB6BBF630DDC command and manifest rules', () => {
  test('rejects commands that could download a package or bypass the guard reporter', () => {
    assert.throws(() => analyseCommand(['npx', 'not-an-installed-runner', 'run', 'a.test.ts'], { cwd: repo }), /not installed .*no automatic package download/)
    assert.throws(() => analyseCommand(['npx', '--yes', 'vitest', 'run', 'a'], { cwd: repo }), /can download a package/)
    assert.throws(() => analyseCommand(['npx', 'vitest', 'run', 'a', '--reporter=dot'], { cwd: repo }), /flag --reporter=dot is not allowed/)
    assert.throws(() => analyseCommand(['npx', 'vitest', 'a'], { cwd: repo }), /vitest run/)
    assert.throws(() => analyseCommand(['node', 'script.mjs'], { cwd: repo }), /--test/)
    assert.throws(() => analyseCommand(['npx', 'vitest', 'run', '--passWithNoTests=false'], { cwd: repo }), /names no target files/)
    const resolved = analyseCommand(['npx', 'vitest', 'run', 'src/a.test.tsx', '--testNamePattern', 'x|y', '--passWithNoTests=false'], { cwd: repo })
    assert.equal(resolved.executable, join(repo, 'node_modules/.bin/vitest'))
    assert.deepEqual(resolved.targets, ['src/a.test.tsx'])
  })

  test('rejects manifests without exact required case identities', () => {
    const base = { schema: 'clear-refinement-required-cases/v1', task: 'TASK-901' }
    assert.match(validateManifest({ ...base, checks: {} }).join('\n'), /declares no checks/)
    assert.match(validateManifest({ ...base, checks: { c: { runner: 'vitest', files: ['a'], cases: [] } } }).join('\n'), /declares no required cases/)
    assert.match(validateManifest({ ...base, checks: { c: { runner: 'vitest', files: ['a', 'b'], cases: [{ file: 'a', name: 'x' }] } } }).join('\n'), /target "b" has no declared required case/)
    assert.match(validateManifest({ ...base, checks: { c: { runner: 'vitest', files: ['a'], cases: [{ file: 'z', name: 'x' }] } } }).join('\n'), /not a declared target/)
    assert.match(validateManifest({ ...base, checks: { c: { runner: 'mocha', files: ['a'], cases: [{ file: 'a', name: 'x' }] } } }).join('\n'), /runner must be one of/)
    const file = fx('vitest', 'pass.case.mjs')
    const undeclared = guard(vitestCheck([file], [{ file, name: 'guard fixture > required case passes' }]), vitestRun(file, fx('vitest', 'mixed.case.mjs')))
    assertRejected(undeclared, /command target .*mixed\.case\.mjs is not declared/)
    const wrongRunner = guard(nodeCheck([file], [{ file, name: 'x' }]), vitestRun(file))
    assertRejected(wrongRunner, /command runs vitest but check "check-01" declares node-test/)
  })

  test('writes identical deterministic receipts for identical runs and exits by verdict', () => {
    const file = fx('node-test', 'pass.case.mjs')
    const check = nodeCheck([file], [{ file, name: 'top level case passes' }])
    const { evidenceRoot, task, checkId } = synthetic(check)
    const cli = () => spawnSync(process.execPath, [
      'scripts/refinement/run-required-check.mjs', '--evidence-root', evidenceRoot, '--task', task, '--check', checkId,
      '--', 'node', '--test', file,
    ], { cwd: repo, encoding: 'utf8' })
    const first = cli()
    assert.equal(first.status, 0, first.stdout + first.stderr)
    const receiptPath = join(evidenceRoot, 'task-901', 'results', 'check-01.json')
    const receiptA = readFileSync(receiptPath, 'utf8')
    assert.equal(cli().status, 0)
    assert.equal(readFileSync(receiptPath, 'utf8'), receiptA, 'receipt bytes are deterministic')
    assert.doesNotMatch(receiptA, /\/Users\/|\/home\/|"startTime"|"duration/, 'receipt carries no machine path or time')
    const rejected = spawnSync(process.execPath, [
      'scripts/refinement/run-required-check.mjs', '--evidence-root', evidenceRoot, '--task', task, '--check', 'check-99',
      '--', 'node', '--test', file,
    ], { cwd: repo, encoding: 'utf8' })
    assert.equal(rejected.status, 1)
    assert.match(rejected.stdout, /REJECTED[\s\S]*manifest declares no check "check-99"/)
  })
})

describe('TASK-AC-A50DB04A159A bootstrap self-check', () => {
  const manifestPath = join(repo, 'evidence/refinement/task-039/required-cases.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const bootstrap = manifest.checks.bootstrap
  const target = 'scripts/refinement/required-check.test.mjs'

  test('declares exact bootstrap cases for this self-test file and only setup purpose', () => {
    assert.deepEqual(validateManifest(manifest, { task: 'TASK-039' }), [])
    assert.equal(bootstrap.runner, 'node-test')
    assert.equal(bootstrap.purpose, 'setup')
    assert.deepEqual(bootstrap.files, [target])
    assert.ok(bootstrap.cases.length >= 20, 'every self-test case is declared')
    const source = readFileSync(join(repo, target), 'utf8')
    for (const testCase of bootstrap.cases) {
      const leaf = testCase.name.split(' > ').pop()
      assert.ok(source.includes(`'${leaf}'`), `declared case "${leaf}" exists in the self-test source`)
    }
  })

  test('rejects an empty or all-skipped bootstrap result', () => {
    const empty = parseNodeTap(`TAP version 13\n# Subtest: ${target}\nok 1 - ${target}\n  ---\n  type: 'test'\n  ...\n1..1\n`, { targets: [target] })
    const emptyVerdict = evaluateResults({ check: bootstrap, parsed: empty, targets: [target], exitCode: 0 })
    assert.equal(emptyVerdict.ok, false)
    assert.ok(emptyVerdict.problems.some((p) => /zero execution/.test(p)))
    const skippedTap = ['TAP version 13', ...bootstrap.cases.map((c, i) => `ok ${i + 1} - ${c.name.replace(/#/g, '\\#')} # SKIP`), '1..1'].join('\n')
    const skipped = evaluateResults({ check: bootstrap, parsed: parseNodeTap(skippedTap, { targets: [target] }), targets: [target], exitCode: 0 })
    assert.equal(skipped.ok, false)
    assert.ok(skipped.problems.some((p) => /all skipped/.test(p)))
  })

  test('accepts a synthetic bootstrap result only when every declared case passed', () => {
    const lines = ['TAP version 13']
    const parents = new Map()
    for (const testCase of bootstrap.cases) {
      const [parent, ...rest] = testCase.name.split(' > ')
      if (!parents.has(parent)) parents.set(parent, [])
      parents.get(parent).push(rest.join(' > '))
    }
    let n = 0
    for (const [parent, children] of parents) {
      lines.push(`# Subtest: ${parent}`)
      children.forEach((child, i) => lines.push(`    # Subtest: ${child}`, `    ok ${i + 1} - ${child.replace(/#/g, '\\#')}`, '      ---', "      type: 'test'", '      ...'))
      lines.push(`ok ${++n} - ${parent}`, '  ---', "  type: 'suite'", '  ...')
    }
    const parsed = parseNodeTap(lines.join('\n'), { targets: [target] })
    const verdict = evaluateResults({ check: bootstrap, parsed, targets: [target], exitCode: 0 })
    assert.equal(verdict.ok, true, verdict.problems.join('\n'))
    const missingOne = { ...parsed, cases: parsed.cases.slice(1) }
    assert.equal(evaluateResults({ check: bootstrap, parsed: missingOne, targets: [target], exitCode: 0 }).ok, false)
  })
})

describe('TASK-AC-9E8B5D3DDA20 staged references', () => {
  test('resolves the accepted gallery by identity with every pinned hash verified', () => {
    const result = verifyDeliveryEvidence({ cwd: repo, body: BODY, mode: 'references', reference: 'accepted-gallery' })
    assert.equal(result.ok, true, result.problems.join('\n'))
    const [gallery] = result.report.references
    assert.equal(gallery.identity.commit, 'eded158cfd928d382c9a9409e2c372270312741d')
    assert.equal(gallery.files, 1193)
    for (const guide of ['stateMap', 'sharedOwners', 'fieldOwnership', 'semanticTokens', 'sourceManifest']) {
      assert.ok(gallery.guides[guide], `guide ${guide} is exposed`)
      assert.match(gallery.guides[guide].location, /^(store:|git:)/, 'locations are store or git identities')
      assert.doesNotMatch(gallery.guides[guide].location, /\/Users\//, 'no owner-machine path')
    }
  })

  test('resolves the phosphor-echo intake reference used by PRE-002', () => {
    const result = verifyDeliveryEvidence({ cwd: repo, body: BODY, mode: 'references', reference: 'phosphor-echo' })
    assert.equal(result.ok, true, result.problems.join('\n'))
    assert.equal(result.report.references[0].files, 5)
  })

  // Owner decisions 2026-11-09: staged objects live outside Git in the
  // project-level reference object store. These cases copy the real store so the real one
  // is never modified.
  const TOKENS_SHA = 'c09e5f7c2f728eb6052eb4f1e83386e59d2d7abc50d3380d818e5e258427811d'
  function storeCopy(name) {
    const live = resolveObjectStore({ cwd: repo, env: {} })
    assert.equal(live.problem, undefined, live.problem)
    const dir = join(scratch, name)
    cpSync(join(live.dir, BODY), join(dir, BODY), { recursive: true })
    return dir
  }
  const tokensObject = (dir) => join(dir, BODY, 'references/accepted-gallery/objects', TOKENS_SHA)

  test('finds the project-level object store through the V2 worktree layout', () => {
    const live = resolveObjectStore({ cwd: repo, env: {} })
    const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: repo, encoding: 'utf8' }).stdout.trim()
    assert.equal(live.dir, resolve(top, '../../../../evidence-store'))
    assert.match(live.source, /^layout /)
    // A synthetic project: <project>/runner-v2/<body>/worktrees/<task> is a git worktree root.
    const project = realpathSync(mkdtempSync(join(scratch, 'v2-project-')))
    const runnerBody = join(project, 'runner-v2', 'some-body')
    const worktree = join(runnerBody, 'worktrees', 'TASK-999-a1')
    mkdirSync(join(worktree, 'nested'), { recursive: true })
    assert.equal(spawnSync('git', ['init', '-q'], { cwd: worktree }).status, 0)
    assert.match(resolveObjectStore({ cwd: join(worktree, 'nested'), env: {} }).problem, /object store is absent: expected .*v2-project-[^/]*\/evidence-store /)
    // No body-level fallback: a body evidence/ folder is never used.
    mkdirSync(join(runnerBody, 'evidence'))
    assert.match(resolveObjectStore({ cwd: worktree, env: {} }).problem, /object store is absent: expected .*\/evidence-store /)
    mkdirSync(join(project, 'evidence-store'))
    const found = resolveObjectStore({ cwd: join(worktree, 'nested'), env: {} })
    assert.equal(found.problem, undefined)
    assert.equal(found.dir, join(project, 'evidence-store'))
  })

  test('fails closed for a worktree outside the runner-v2 layout without the override', () => {
    // Right depth, wrong shape: <x>/not-runner-v2/<body>/worktrees/<task>.
    const project = realpathSync(mkdtempSync(join(scratch, 'flat-project-')))
    mkdirSync(join(project, 'evidence-store'))
    const worktree = join(project, 'not-runner-v2', 'some-body', 'worktrees', 'TASK-999-a1')
    mkdirSync(worktree, { recursive: true })
    assert.equal(spawnSync('git', ['init', '-q'], { cwd: worktree }).status, 0)
    const located = resolveObjectStore({ cwd: worktree, env: {} })
    assert.equal(located.dir, null)
    assert.match(located.problem, /is not in the Runner V2 layout \(<project>\/runner-v2\/<runner body>\/worktrees\/<task> -> <project>\/evidence-store\); set CLEAR_REFINEMENT_EVIDENCE_DIR/)
    // A plain checkout (not under worktrees/) also fails closed.
    const plain = join(project, 'plain-checkout')
    mkdirSync(plain)
    assert.equal(spawnSync('git', ['init', '-q'], { cwd: plain }).status, 0)
    assert.match(resolveObjectStore({ cwd: plain, env: {} }).problem, /is not in the Runner V2 layout/)
    // The override still works from such a worktree.
    const overridden = resolveObjectStore({ cwd: worktree, env: { CLEAR_REFINEMENT_EVIDENCE_DIR: join(project, 'evidence-store') } })
    assert.equal(overridden.problem, undefined)
    assert.equal(overridden.dir, join(project, 'evidence-store'))
  })

  test('uses the CLEAR_REFINEMENT_EVIDENCE_DIR override', () => {
    const dir = storeCopy('store-override')
    const env = { CLEAR_REFINEMENT_EVIDENCE_DIR: dir }
    assert.equal(resolveObjectStore({ cwd: repo, env }).dir, dir)
    const result = verifyDeliveryEvidence({ cwd: repo, body: BODY, mode: 'baseline', requireCurrentSource: true, env })
    assert.equal(result.ok, true, result.problems.join('\n'))
    assert.equal(result.report.objectStore.dir, dir)
    assert.match(result.report.objectStore.source, /CLEAR_REFINEMENT_EVIDENCE_DIR override/)
  })

  test('fails closed when the object store is absent', () => {
    const absent = join(scratch, 'no-such-store')
    const env = { CLEAR_REFINEMENT_EVIDENCE_DIR: absent }
    for (const options of [
      { mode: 'baseline', requireCurrentSource: true },
      { mode: 'references', reference: 'accepted-gallery' },
    ]) {
      const result = verifyDeliveryEvidence({ cwd: repo, body: BODY, env, ...options })
      assert.equal(result.ok, false, 'never passes without the store')
      assert.ok(result.problems.some((p) => p.includes(`object store is absent: expected ${absent}`)), result.problems.join('\n'))
    }
    // An existing store without this body's objects also fails closed.
    const emptyStore = join(scratch, 'empty-store')
    mkdirSync(emptyStore, { recursive: true })
    const empty = verifyDeliveryEvidence({ cwd: repo, body: BODY, mode: 'references', env: { CLEAR_REFINEMENT_EVIDENCE_DIR: emptyStore } })
    assert.equal(empty.ok, false)
    assert.ok(empty.problems.some((p) => /staged objects are absent from the reference object store: expected/.test(p)), empty.problems.join('\n'))
  })

  test('fails closed on a missing staged object', () => {
    const dir = storeCopy('store-missing')
    rmSync(tokensObject(dir))
    const result = verifyDeliveryEvidence({ cwd: repo, body: BODY, mode: 'references', reference: 'accepted-gallery', env: { CLEAR_REFINEMENT_EVIDENCE_DIR: dir } })
    assert.equal(result.ok, false)
    assert.ok(result.problems.some((p) => p.includes(`staged object for src/ui/refinements/tokens.css is missing from the reference object store: expected ${tokensObject(dir)}`)), result.problems.join('\n'))
    // The pinned manifest is itself a store object.
    const manifestDir = storeCopy('store-missing-manifest')
    rmSync(join(manifestDir, BODY, 'references/accepted-gallery/objects/a1b1f93bda420ba88f5647f9d78e66e0d9b05b16cab7026f9fecd033858f0a18'))
    const noManifest = verifyDeliveryEvidence({ cwd: repo, body: BODY, mode: 'references', reference: 'accepted-gallery', env: { CLEAR_REFINEMENT_EVIDENCE_DIR: manifestDir } })
    assert.equal(noManifest.ok, false)
    assert.ok(noManifest.problems.some((p) => /PINNED-SOURCE\.json is missing from the reference object store/.test(p)), noManifest.problems.join('\n'))
  })

  test('fails closed on a tampered staged object', () => {
    const dir = storeCopy('store-tampered')
    const path = tokensObject(dir)
    writeFileSync(path, Buffer.concat([readFileSync(path), Buffer.from('\n')]))
    const result = verifyDeliveryEvidence({ cwd: repo, body: BODY, mode: 'baseline', requireCurrentSource: true, env: { CLEAR_REFINEMENT_EVIDENCE_DIR: dir } })
    assert.equal(result.ok, false)
    assert.ok(result.problems.some((p) => /src\/ui\/refinements\/tokens\.css bytes do not match the pinned hash \(store:/.test(p)), result.problems.join('\n'))
  })

  test('rejects unknown references and drifted reference records', () => {
    const root = join(scratch, 'drift')
    cpSync(join(repo, 'evidence/refinement', BODY), join(root, BODY), { recursive: true })
    const body = JSON.parse(readFileSync(join(root, BODY, 'BODY.json'), 'utf8'))
    const entry = body.references.find((ref) => ref.id === 'accepted-gallery')
    const unknown = verifyDeliveryEvidence({ cwd: repo, evidenceRoot: root, body: BODY, mode: 'references', reference: 'no-such-ref' })
    assert.equal(unknown.ok, false)
    writeFileSync(join(root, BODY, 'references/accepted-gallery/REFERENCE.json'), '{"schema":"x"}')
    const result = verifyReference({ cwd: repo, dir: join(root, BODY), record: body, entry })
    assert.ok(result.problems.some((p) => /record bytes do not match the body record hash/.test(p)))
  })

  test('keeps staged reference objects out of the repository', () => {
    const tracked = spawnSync('git', ['ls-files', '-z', 'evidence/refinement'], { cwd: repo, encoding: 'utf8' }).stdout.split('\0').filter(Boolean)
    assert.ok(tracked.includes(`evidence/refinement/${BODY}/BODY.json`), 'the hash manifests are committed')
    const objects = tracked.filter((path) => /\/objects\/|PINNED-SOURCE\.json$|GALLERY-DELIVERY\.json$/.test(path))
    assert.deepEqual(objects, [], 'no staged object is tracked by Git')
    for (const path of tracked) {
      assert.doesNotMatch(readFileSync(join(repo, path), 'utf8'), /\/Users\//, `${path} carries no owner-machine path`)
    }
  })

  test('rejects an owner-machine absolute path in the body record', () => {
    const root = join(scratch, 'owner-path')
    mkdirSync(join(root, BODY), { recursive: true })
    const body = JSON.parse(readFileSync(join(repo, 'evidence/refinement', BODY, 'BODY.json'), 'utf8'))
    body.notesDir = '/Users/someone/clear/docs'
    writeFileSync(join(root, BODY, 'BODY.json'), JSON.stringify(body))
    const result = verifyDeliveryEvidence({ cwd: repo, evidenceRoot: root, body: BODY, mode: 'baseline' })
    assert.ok(result.problems.some((p) => /owner-machine absolute path/.test(p)))
  })
})

describe('AC-GAL-BASE-01 integration baseline', () => {
  test('baseline mode passes against the live integration base without any delivery receipt', () => {
    const result = verifyDeliveryEvidence({ cwd: repo, body: BODY, mode: 'baseline', requireCurrentSource: true })
    assert.equal(result.ok, true, result.problems.join('\n'))
    assert.equal(result.report.baseline.integrationBase, '03087f7488bee8d7e927534b1b5e656378fe9cb3')
    assert.equal(result.report.baseline.foundation.version, '0.14.3')
    assert.equal(result.report.baseline.foundation.unchangedFromBase, true)
  })

  test('records 94f2c2f and R7 2d48f13 as historical comparisons, never the baseline', () => {
    const result = verifyDeliveryEvidence({ cwd: repo, body: BODY, mode: 'baseline', requireCurrentSource: true })
    const history = Object.fromEntries(result.report.baseline.historicalComparisons.map((h) => [h.id, h]))
    assert.equal(history['verified-main'].commit, '94f2c2f3bf7e4d0eeb856d3716fd843f188e6fc2')
    assert.equal(history['verified-main'].relation, 'ancestor of the integration base')
    assert.equal(history['reviewed-r7'].commit, '2d48f130ef1d508e032d0bf2ae045601d9d21f26')
    const root = join(scratch, 'historical-as-base')
    mkdirSync(join(root, BODY), { recursive: true })
    const body = JSON.parse(readFileSync(join(repo, 'evidence/refinement', BODY, 'BODY.json'), 'utf8'))
    body.integrationBase.commit = '94f2c2f3bf7e4d0eeb856d3716fd843f188e6fc2'
    writeFileSync(join(root, BODY, 'BODY.json'), JSON.stringify(body))
    const wrong = verifyDeliveryEvidence({ cwd: repo, evidenceRoot: root, body: BODY, mode: 'baseline' })
    assert.ok(wrong.problems.some((p) => /must not be the selected integration base/.test(p)), wrong.problems.join('\n'))
  })

  test('rejects an integration base that is not available', () => {
    const root = join(scratch, 'unavailable-base')
    mkdirSync(join(root, BODY), { recursive: true })
    const body = JSON.parse(readFileSync(join(repo, 'evidence/refinement', BODY, 'BODY.json'), 'utf8'))
    body.integrationBase.commit = 'eded158cfd928d382c9a9409e2c372270312741d'
    writeFileSync(join(root, BODY, 'BODY.json'), JSON.stringify(body))
    const result = verifyDeliveryEvidence({ cwd: repo, evidenceRoot: root, body: BODY, mode: 'baseline' })
    assert.ok(result.problems.some((p) => /integration base .* is not available/.test(p)))
  })
})

describe('TASK-AC-6E9AFC30F960 final aggregate mode', () => {
  function finalRoot(name, check) {
    const root = join(scratch, name)
    cpSync(join(repo, 'evidence/refinement', BODY), join(root, BODY), { recursive: true })
    const { evidenceRoot } = synthetic(check)
    cpSync(join(evidenceRoot, 'task-901'), join(root, 'task-901'), { recursive: true })
    return root
  }
  const file = fx('node-test', 'pass.case.mjs')
  const check = nodeCheck([file], [{ file, name: 'top level case passes' }])

  test('accepts a current passing receipt and rejects a missing one', () => {
    const root = finalRoot('final-ok', check)
    const missing = verifyDeliveryEvidence({ cwd: repo, evidenceRoot: root, body: BODY, mode: 'final', tasks: ['TASK-901'] })
    assert.ok(missing.problems.some((p) => /absent result receipt/.test(p)), missing.problems.join('\n'))
    const run = runRequiredCheck({ cwd: repo, evidenceRoot: root, task: 'TASK-901', check: 'check-01', command: ['node', '--test', file], stdio: 'pipe' })
    assert.equal(run.ok, true, run.problems.join('\n'))
    const result = verifyDeliveryEvidence({ cwd: repo, evidenceRoot: root, body: BODY, mode: 'final', tasks: ['TASK-901'] })
    assert.equal(result.ok, true, result.problems.join('\n'))
  })

  test('rejects stale receipts after the manifest or a target changes', () => {
    const root = finalRoot('final-stale', check)
    const run = runRequiredCheck({ cwd: repo, evidenceRoot: root, task: 'TASK-901', check: 'check-01', command: ['node', '--test', file], stdio: 'pipe' })
    assert.equal(run.ok, true, run.problems.join('\n'))
    assert.equal(verifyDeliveryEvidence({ cwd: repo, evidenceRoot: root, body: BODY, mode: 'final', tasks: ['TASK-901'] }).ok, true)
    const receiptPath = join(root, 'task-901/results/check-01.json')
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
    receipt.targets[0].sha256 = sha256('older bytes')
    writeFileSync(receiptPath, JSON.stringify(receipt))
    let result = verifyDeliveryEvidence({ cwd: repo, evidenceRoot: root, body: BODY, mode: 'final', tasks: ['TASK-901'] })
    assert.ok(result.problems.some((p) => /stale receipt: target .* changed after the run/.test(p)), result.problems.join('\n'))
    const manifestPath = join(root, 'task-901/required-cases.json')
    writeFileSync(manifestPath, readFileSync(manifestPath, 'utf8') + '\n')
    result = verifyDeliveryEvidence({ cwd: repo, evidenceRoot: root, body: BODY, mode: 'final', tasks: ['TASK-901'] })
    assert.ok(result.problems.some((p) => /stale receipt: required-case manifest changed/.test(p)))
  })

  test('does not accept a setup receipt as delivery evidence', () => {
    const root = finalRoot('final-setup', { ...check, purpose: 'setup' })
    const run = runRequiredCheck({ cwd: repo, evidenceRoot: root, task: 'TASK-901', check: 'check-01', command: ['node', '--test', file], stdio: 'pipe' })
    assert.equal(run.ok, true, run.problems.join('\n'))
    const result = verifyDeliveryEvidence({ cwd: repo, evidenceRoot: root, body: BODY, mode: 'final', tasks: ['TASK-901'] })
    assert.ok(result.problems.some((p) => /setup receipt is not delivery evidence/.test(p)), result.problems.join('\n'))
  })
})

describe('TASK-AC-6E9AFC30F960 definition records', () => {
  const sourceFile = 'scripts/refinement/fixtures/vitest/pass.case.mjs'
  const sourceSha = sha256(readFileSync(join(repo, sourceFile)))
  const reuse = 'docs/design/library/refinements-2026-11-04/REUSE.md'
  const reuseSha = '9f6b702c6daa40626c2ca3c47740be1862b538c72b0edfec18834aac36f8ce46'
  const record = (overrides = {}) => {
    const header = { Task: 'TASK-935', Requirement: 'REQ-035', Body: BODY, Status: 'definition-only', 'Implementation claim': 'none', ...overrides.header }
    const sections = {
      Scope: 'Definition of the adaptive report follow-up; no route or metric is implemented.',
      Sources: `- \`repo:${sourceFile}\` sha256 \`${overrides.sha ?? sourceSha}\`\n- \`ref:accepted-gallery/${reuse}\` sha256 \`${reuseSha}\``,
      'Current observations': 'Completed sessions record authoritative performed values only.',
      Options: 'Option A places the report in History; option B keeps it in Summary.',
      'Open owner decisions': '- Owner: Eric\n  Decision: choose the report placement and metric set.',
      Limitations: 'No chart, cadence or editable profile is defined by this record.',
      Traceability: 'R03 -> REQ-035 -> TASK-935 (definition only).',
      ...overrides.sections,
    }
    const text = [
      '# Definition record',
      ...Object.entries(header).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`),
      ...Object.entries(sections).filter(([, v]) => v !== null).flatMap(([k, v]) => ['', `## ${k}`, '', v]),
    ].join('\n')
    const path = join(scratch, `definition-${++counter}.md`)
    writeFileSync(path, text)
    return verifyDefinitionRecord({ cwd: repo, task: 'TASK-935', record: path })
  }

  test('accepts a sourced definition-only record', () => {
    const result = record()
    assert.equal(result.ok, true, result.problems.join('\n'))
    assert.equal(result.sources.length, 2)
  })

  test('rejects implementation claims, placeholders, missing decisions and unverified sources', () => {
    assert.match(record({ header: { 'Implementation claim': 'report shipped' } }).problems.join('\n'), /Implementation claim/)
    assert.match(record({ sections: { Options: 'TBD after review of the options' } }).problems.join('\n'), /placeholder/)
    assert.match(record({ sections: { 'Open owner decisions': 'Someone will decide this later on.' } }).problems.join('\n'), /Owner: and the exact Decision:/)
    assert.match(record({ sections: { Limitations: null } }).problems.join('\n'), /"## Limitations" is missing/)
    assert.match(record({ sha: sha256('other') }).problems.join('\n'), /source hash mismatch/)
    assert.match(record({ sections: { Sources: '- /Users/someone/file.md' } }).problems.join('\n'), /source line is not/)
    const absent = verifyDefinitionRecord({ cwd: repo, task: 'TASK-935', record: join(scratch, 'none.md') })
    assert.match(absent.problems.join('\n'), /definition record is absent/)
  })
})
