/**
 * REQ-040 / TASK-039 — focused self-tests for the shared refinement checkers.
 *
 *   node scripts/refinement/run-required-check.mjs --task TASK-039 --check bootstrap -- node --test scripts/refinement/required-check.test.mjs
 *
 * The guard is rehearsed against the reports the installed runners actually
 * write — Node's TAP, Vitest's JSON and Playwright's JSON — with synthetic
 * fixtures that pass, fail, skip and go missing. Each rehearsal uses its own
 * temporary manifest and results directory; nothing here writes into a task's
 * evidence directory.
 */

import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { parseNodeTap } from './native-results.mjs'
import {
  BODY,
  indexPath,
  PINNED_SOURCE,
  readIndex,
  referenceExposure,
  resolveReferenceRoot,
  stagedFilePath,
} from './reference.mjs'
import { evaluateRun, planCommand, readCheckDeclaration, runRequiredCheck } from './run-required-check.mjs'
import { stagedReferenceCheck, verifyDeliveryEvidence } from './verify-delivery-evidence.mjs'
import {
  definitionRecordProblems,
  progressRecordProblems,
  verifyDefinitionRecord,
} from './verify-definition-record.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FIXTURES = 'scripts/refinement/fixtures'
const NODE_A = `${FIXTURES}/node-test/sample-a.fixture.mjs`
const NODE_B = `${FIXTURES}/node-test/sample-b.fixture.mjs`
const NODE_SKIPPED = `${FIXTURES}/node-test/all-skipped.fixture.mjs`
const VITEST_CONFIG = `${FIXTURES}/vitest/vitest.fixture.config.mjs`
const VITEST_SAMPLE = `${FIXTURES}/vitest/sample.fixture.test.mjs`
const VITEST_SKIPPED = `${FIXTURES}/vitest/all-skipped.fixture.test.mjs`
const PLAYWRIGHT_CONFIG = `${FIXTURES}/playwright/playwright.fixture.config.mjs`
const PLAYWRIGHT_SAMPLE = `${FIXTURES}/playwright/sample.fixture.spec.mjs`

const scratch = mkdtempSync(join(tmpdir(), 'required-check-'))
after(() => rmSync(scratch, { recursive: true, force: true }))
let runs = 0

/**
 * Run the guard in-process on a temporary manifest declaring one check.
 *
 * @param {object} check the declaration
 * @param {string[]} argv
 * @param {Record<string, string>} [env]
 */
function rehearse(check, argv, env = {}) {
  const dir = join(scratch, `run-${++runs}`)
  const manifestPath = join(dir, 'required-cases.json')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    manifestPath,
    JSON.stringify({ schema: 'clear-refinement-required-cases-v1', task: 'TASK-900', checks: { rehearsal: check } }),
  )
  return runRequiredCheck({
    task: 'TASK-900',
    check: 'rehearsal',
    argv,
    root: ROOT,
    manifestPath,
    resultsDir: join(dir, 'results'),
    stdio: 'pipe',
    log: () => {},
    env: { REQUIRED_CHECK_FIXTURE_OUTPUT: dir, ...env },
  })
}

/** @param {{ problems: string[] }} result @param {RegExp} pattern */
const assertRefused = (result, pattern) => {
  assert.equal(/** @type {any} */ (result).status, 'failed')
  assert.ok(result.problems.some((problem) => pattern.test(problem)), result.problems.join('\n'))
}

describe('required-check guard with installed Node test TAP', () => {
  const declare = (/** @type {object[]} */ requiredCases, files = [NODE_A, NODE_B]) => ({
    runner: 'node-test',
    files,
    requiredCases,
  })

  test('passes when every declared required case passes across files', () => {
    const result = rehearse(
      declare([
        { file: NODE_A, name: 'fixture suite > passes required case' },
        { file: NODE_A, name: 'top level case' },
        { file: NODE_B, name: 'second file case' },
      ]),
      ['node', '--test', NODE_A, NODE_B],
    )
    assert.deepEqual(result.problems, [])
    assert.equal(result.status, 'passed')
    assert.ok(/** @type {any} */ (result.totals).skipped >= 1, 'the fixture skip is reported, not hidden')
  })

  test('rejects a required case that fails', () => {
    const result = rehearse(
      declare([{ file: NODE_A, name: 'fixture suite > failing case' }], [NODE_A]),
      ['node', '--test', NODE_A],
      { REQUIRED_CHECK_FIXTURE_FAIL: '1' },
    )
    assertRefused(result, /did not pass \(failed\)/)
  })

  test('rejects a required case that only skipped', () => {
    const result = rehearse(declare([{ file: NODE_A, name: 'fixture suite > skipped case' }], [NODE_A]), [
      'node',
      '--test',
      NODE_A,
    ])
    assertRefused(result, /did not pass \(skipped\)/)
  })

  test('rejects an all-skipped result', () => {
    const result = rehearse(declare([{ file: NODE_SKIPPED, name: 'only skipped' }], [NODE_SKIPPED]), [
      'node',
      '--test',
      NODE_SKIPPED,
    ])
    assertRefused(result, /all-skipped/)
  })

  test('rejects a required case absent from the report', () => {
    const result = rehearse(declare([{ file: NODE_A, name: 'fixture suite > never written' }], [NODE_A]), [
      'node',
      '--test',
      NODE_A,
    ])
    assertRefused(result, /absent from the native report/)
  })

  test('rejects a passing case its declared file does not contain', () => {
    // The case passes in NODE_B, which the command also runs, but is declared in NODE_A.
    const result = rehearse(declare([{ file: NODE_A, name: 'second file case' }], [NODE_A]), [
      'node',
      '--test',
      NODE_A,
      NODE_B,
    ])
    assertRefused(result, /absent from the native report/)
  })

  test('rejects a matching title in another file comment', () => {
    const name = 'fixture suite > passes required case'
    const result = rehearse(declare([{ file: NODE_A, name }, { file: NODE_B, name }]), ['node', '--test', NODE_A, NODE_B])
    assertRefused(result, /required case .* in .*sample-b.* is absent/)
  })

  test('passes equal case names only from each executing file', () => {
    const result = rehearse(declare([{ file: NODE_A, name: 'shared name' }, { file: NODE_B, name: 'shared name' }]), ['node', '--test', NODE_A, NODE_B])
    assert.deepEqual(result.problems, [])
    assert.equal(result.requiredCases.length, 2)
    assert.ok(result.requiredCases.every((c) => c.occurrences === 1))
  })

  test('refuses a loader operand as a test target before automatic discovery', () => {
    const root = mkdtempSync(join(scratch, 'loader-target-'))
    writeFileSync(join(root, 'a.test.mjs'), "import { test } from 'node:test'; test('required result', () => {});\n")
    writeFileSync(join(root, 'loader.mjs'), '// required result\n')
    const manifestPath = join(root, 'manifest.json')
    writeFileSync(manifestPath, JSON.stringify({ schema: 'clear-refinement-required-cases-v1', task: 'TASK-900', checks: { c: { runner: 'node-test', files: ['loader.mjs'], requiredCases: [{ file: 'loader.mjs', name: 'required result' }] } } }))
    const result = runRequiredCheck({ root, task: 'TASK-900', check: 'c', argv: ['node', '--test', '--import', './loader.mjs'], manifestPath, resultsDir: join(root, 'results'), stdio: 'pipe', log: () => {} })
    assertRefused(result, /unsupported Node test option "--import"/)
    assert.equal(result.exitCode, null, 'the unhandled option cannot launch automatic discovery')
  })

  test('keeps file-like filter operands separate from positional targets', () => {
    const result = rehearse(declare([{ file: NODE_A, name: 'name.like-file.mjs' }], [NODE_A]), ['node', '--test', '--test-name-pattern', 'name.like-file.mjs', NODE_A])
    assert.deepEqual(result.problems, [])
    assert.equal(result.status, 'passed')
  })

  test('rejects mixed existing and missing targets', () => {
    const missing = `${FIXTURES}/node-test/missing.fixture.mjs`
    const result = rehearse(
      declare([
        { file: NODE_A, name: 'top level case' },
        { file: missing, name: 'anything' },
      ], [NODE_A, missing]),
      ['node', '--test', NODE_A, missing],
    )
    assertRefused(result, /declared file ".*missing\.fixture\.mjs" does not exist/)
    assert.equal(result.exitCode, null, 'nothing runs when a target is missing')
  })

  test('ignores unrelated filtered-out cases', () => {
    const result = rehearse(declare([{ file: NODE_A, name: 'top level case' }], [NODE_A]), [
      'node',
      '--test',
      '--test-name-pattern=top level case',
      NODE_A,
    ], { REQUIRED_CHECK_FIXTURE_FAIL: '1' })
    assert.deepEqual(result.problems, [])
    assert.equal(result.status, 'passed')
  })
})

describe('required-check guard with installed Vitest JSON', () => {
  const declare = (/** @type {object[]} */ requiredCases, files = [VITEST_SAMPLE]) => ({
    runner: 'vitest',
    files,
    requiredCases,
  })

  test('passes when the declared Vitest case passes', () => {
    const result = rehearse(declare([{ file: VITEST_SAMPLE, name: 'fixture suite > passes required case' }]), [
      'npx',
      'vitest',
      'run',
      '--config',
      VITEST_CONFIG,
      VITEST_SAMPLE,
    ])
    assert.deepEqual(result.problems, [])
    assert.equal(result.status, 'passed')
  })

  test('rejects a failing Vitest required case', () => {
    const result = rehearse(
      declare([{ file: VITEST_SAMPLE, name: 'fixture suite > failing case' }]),
      ['vitest', 'run', '--config', VITEST_CONFIG, VITEST_SAMPLE],
      { REQUIRED_CHECK_FIXTURE_FAIL: '1' },
    )
    assertRefused(result, /did not pass \(failed\)/)
  })

  test('rejects an all-skipped Vitest result', () => {
    const result = rehearse(declare([{ file: VITEST_SKIPPED, name: 'only skipped' }], [VITEST_SKIPPED]), [
      'vitest',
      'run',
      '--config',
      VITEST_CONFIG,
      VITEST_SKIPPED,
    ])
    assertRefused(result, /all-skipped/)
  })
})

describe('required-check guard with installed Playwright JSON', () => {
  const declare = (/** @type {object[]} */ requiredCases) => ({
    runner: 'playwright',
    files: [PLAYWRIGHT_SAMPLE],
    requiredCases,
  })

  test('passes when the declared Playwright case passes', () => {
    const result = rehearse(
      declare([{ file: PLAYWRIGHT_SAMPLE, name: 'fixture suite > passes required case', project: 'fixture' }]),
      ['playwright', 'test', '--config', PLAYWRIGHT_CONFIG, PLAYWRIGHT_SAMPLE],
    )
    assert.deepEqual(result.problems, [])
    assert.equal(result.status, 'passed')
  })

  test('rejects a failing Playwright required case', () => {
    const result = rehearse(
      declare([{ file: PLAYWRIGHT_SAMPLE, name: 'fixture suite > failing case' }]),
      ['playwright', 'test', '--config', PLAYWRIGHT_CONFIG, PLAYWRIGHT_SAMPLE],
      { REQUIRED_CHECK_FIXTURE_FAIL: '1' },
    )
    assertRefused(result, /did not pass \(failed\)/)
  })
  test('rejects a Playwright expected failure as required passing proof', () => {
    const result = rehearse(declare([{ file: PLAYWRIGHT_SAMPLE, name: 'expected failure case' }]), ['playwright', 'test', '--config', PLAYWRIGHT_CONFIG, PLAYWRIGHT_SAMPLE])
    assert.equal(result.exitCode, 0, 'Playwright expected failure is a successful runner exit')
    assertRefused(result, /did not pass \(failed\)/)
  })

})

describe('required-check guard refusals and report freshness', () => {
  const check = /** @type {const} */ ({
    runner: 'node-test',
    files: [NODE_A],
    requiredCases: [{ file: NODE_A, name: 'top level case' }],
  })

  test('refuses a launcher asked to download a package', () => {
    const plan = planCommand({ argv: ['npx', '-y', 'vitest', 'run'], runner: 'vitest', root: ROOT, reportPath: '/x' })
    assert.match(plan.problems.join('\n'), /fetch a package/)
    const absent = planCommand({ argv: ['npx', 'vitest'], runner: 'vitest', root: ROOT, reportPath: '/x', exists: () => false })
    assert.match(absent.problems.join('\n'), /not installed/)
  })

  test('refuses a command that runs a different runner or its own reporter', () => {
    assert.match(
      planCommand({ argv: ['node', '--test', NODE_A], runner: 'vitest', root: ROOT, reportPath: '/x' }).problems.join('\n'),
      /declares vitest/,
    )
    assert.match(
      planCommand({ argv: ['node', '--test', '--test-reporter=dot', NODE_A], runner: 'node-test', root: ROOT, reportPath: '/x' }).problems.join('\n'),
      /own reporter/,
    )
  })

  test('rejects absent, stale and zero-execution reports', () => {
    const base = { check, exitCode: 0, runStartedAt: 1_000_000, root: ROOT }
    assert.match(evaluateRun({ ...base, reportText: null, reportWrittenAt: null }).problems.join('\n'), /absent result/)
    const passing = 'TAP version 13\n# Subtest: top level case\nok 1 - top level case\n1..1\n# tests 1\n'
    assert.match(evaluateRun({ ...base, reportText: passing, reportWrittenAt: 1 }).problems.join('\n'), /stale result/)
    const empty = 'TAP version 13\n1..0\n# tests 0\n'
    assert.match(
      evaluateRun({ ...base, reportText: empty, reportWrittenAt: 1_000_001 }).problems.join('\n'),
      /zero-execution result/,
    )
    assert.deepEqual(evaluateRun({ ...base, reportText: passing, reportWrittenAt: 1_000_001 }).problems, [])
  })

  test('reads suites, skips and todos from TAP without counting suites as cases', () => {
    const report = parseNodeTap(
      [
        'TAP version 13',
        '# Subtest: outer',
        '    # Subtest: inner \\# one',
        '    ok 1 - inner \\# one # SKIP later',
        '    1..1',
        'ok 1 - outer',
        '  ---',
        "  type: 'suite'",
        '  ...',
        '# Subtest: pending',
        'not ok 2 - pending # TODO soon',
        '1..2',
        '# tests 2',
      ].join('\n'),
    )
    assert.deepEqual(report.cases, [
      { file: null, name: 'outer > inner # one', status: 'skipped' },
      { file: null, name: 'pending', status: 'todo' },
    ])
  })

  test('refuses a manifest without exact required case identities', () => {
    const manifest = { schema: 'clear-refinement-required-cases-v1', task: 'TASK-900', checks: { c: { runner: 'node-test', files: [NODE_A], requiredCases: [] } } }
    assert.match(readCheckDeclaration(manifest, 'TASK-900', 'c').problems.join('\n'), /no required cases/)
    assert.match(readCheckDeclaration(manifest, 'TASK-901', 'c').problems.join('\n'), /belongs to/)
  })
})

describe('staged reference and definition providers', () => {
  test('baseline mode passes against the current source without a delivery receipt', () => {
    const { outcomes, exposure } = verifyDeliveryEvidence({ mode: 'baseline', root: ROOT, requireCurrentSource: true })
    const failed = outcomes.filter((outcome) => outcome.required && !outcome.ok)
    assert.deepEqual(failed, [])
    assert.ok(!outcomes.some((outcome) => /receipt/i.test(outcome.id)))
    assert.equal(/** @type {any} */ (exposure).galleryCommit, 'eded158cfd928d382c9a9409e2c372270312741d')
  })

  test('baseline mode rejects a staged file whose bytes changed', () => {
    const copy = mkdtempSync(join(scratch, 'tamper-'))
    cpSync(join(ROOT, 'evidence', 'refinement', BODY), join(copy, 'evidence', 'refinement', BODY), { recursive: true })
    writeFileSync(stagedFilePath(copy, 'docs/design/library/refinements-2026-11-04/REUSE.md'), 'edited\n', { flag: 'a' })
    const outcome = stagedReferenceCheck(copy)
    assert.equal(outcome.ok, false)
    assert.match(outcome.detail, /REUSE\.md does not match its pinned hash/)
  })

  test('reference root resolves by pinned identity, not by path', () => {
    const decoy = mkdtempSync(join(scratch, 'decoy-'))
    writeFileSync(join(decoy, PINNED_SOURCE), '{"galleryCommit":"other"}')
    const staged = dirname(stagedFilePath(ROOT, PINNED_SOURCE))
    const pinned = readIndex(ROOT).pinnedSource.sha256
    assert.equal(resolveReferenceRoot([decoy, staged], pinned), staged)
    assert.equal(resolveReferenceRoot([decoy], pinned), null)
    assert.ok(indexPath(ROOT).includes(join('evidence', 'refinement', BODY)))
  })

  test('reference exposure names states, shared owners and guides', () => {
    const exposure = referenceExposure(ROOT)
    assert.ok(Object.keys(exposure.stateMap).includes('ladder-12'))
    assert.ok(Object.keys(exposure.sharedOwners).length > 0)
    assert.equal(exposure.guides.canonicalTokens.application, 'src/ui/refinements/tokens.css')
  })

  test('TASK-039 definition and progress records hold', () => {
    assert.deepEqual(verifyDefinitionRecord({ task: 'TASK-039', root: ROOT }), [])
  })

  test('definition record rejects claimed authority and a missing disposition', () => {
    const problems = definitionRecordProblems({
      record: {
        schema: 'clear-refinement-definition-record-v1',
        body: BODY,
        task: 'TASK-900',
        galleryCommit: 'eded158cfd928d382c9a9409e2c372270312741d',
        requirements: ['REQ-040'],
        disposition: 'non-gallery',
        assumptions: ['one'],
        authority: { runner: true },
        progressRecord: `docs/journal/${BODY}/TASK-900.md`,
      },
      task: 'TASK-900',
      root: ROOT,
      exposure: referenceExposure(ROOT),
    })
    assert.ok(problems.some((problem) => /authority\.runner must be recorded as false/.test(problem)))
    assert.ok(problems.some((problem) => /must say why the gallery does not close it/.test(problem)))
    assert.ok(problems.some((problem) => /does not exist/.test(problem)))
  })

  test('progress record keeps every required part', () => {
    const problems = progressRecordProblems('# TASK-900\n\n## Outcome\n\n## Changes\n', 'TASK-900')
    assert.deepEqual(problems, [
      'the progress record has no "Failures and corrections" section',
      'the progress record has no "Verification" section',
      'the progress record has no "Unresolved assumptions" section',
      'the progress record has no "Next action" section',
    ])
  })
})
