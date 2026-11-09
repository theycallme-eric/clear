// Shared required-case guard (TASK-039).
//
// A check is proof only when:
//   - the task's required-cases manifest declares the check, its target files
//     and at least one exact required case per target;
//   - the command names exactly those targets and every one exists;
//   - the command resolves to an installed repository executable (never a
//     package download) of a supported runner;
//   - the runner exits 0 and writes a fresh native report during this run;
//   - the report shows executed cases, every requested target produced
//     results, and every declared required case passed.
// Cases outside the declared set (for example ones a name filter skipped) are
// counted but are not required.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'

import { NAME_SEPARATOR, parseNodeTap, parsePlaywrightJson, parseVitestJson } from './native-results.mjs'

export const MANIFEST_SCHEMA = 'clear-refinement-required-cases/v1'
export const RECEIPT_SCHEMA = 'clear-refinement-required-check-result/v1'
export const RUNNERS = ['vitest', 'playwright', 'node-test']
// Allowed clock skew between this process and a runner's own start time.
const CLOCK_SKEW_MS = 2000

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export function taskDirName(task) {
  if (!/^TASK-\d{3}$/.test(task)) throw new Error(`Task id must look like TASK-001, got "${task}"`)
  return task.toLowerCase()
}

export function manifestPathFor(evidenceRoot, task) {
  return join(evidenceRoot, taskDirName(task), 'required-cases.json')
}

export function receiptPathFor(evidenceRoot, task, check) {
  return join(evidenceRoot, taskDirName(task), 'results', `${check}.json`)
}

// ---------------------------------------------------------------- manifest

/** Validate a parsed manifest. Returns a list of problems (empty when valid). */
export function validateManifest(manifest, { task } = {}) {
  const problems = []
  if (!manifest || typeof manifest !== 'object') return ['manifest is not an object']
  if (manifest.schema !== MANIFEST_SCHEMA) problems.push(`schema must be "${MANIFEST_SCHEMA}"`)
  if (task && manifest.task !== task) problems.push(`manifest task "${manifest.task}" is not ${task}`)
  if (!manifest.checks || typeof manifest.checks !== 'object' || Object.keys(manifest.checks).length === 0) {
    problems.push('manifest declares no checks')
    return problems
  }
  for (const [checkId, check] of Object.entries(manifest.checks)) {
    const where = `check "${checkId}"`
    if (!/^[a-z0-9][a-z0-9-]*$/.test(checkId)) problems.push(`${where}: id must be lower-case words and digits`)
    if (!RUNNERS.includes(check?.runner)) problems.push(`${where}: runner must be one of ${RUNNERS.join(', ')}`)
    if (check?.purpose !== undefined && !['setup', 'delivery'].includes(check.purpose)) {
      problems.push(`${where}: purpose must be "setup" or "delivery"`)
    }
    if (!Array.isArray(check?.files) || check.files.length === 0) {
      problems.push(`${where}: declares no target files`)
      continue
    }
    for (const file of check.files) {
      if (typeof file !== 'string' || file.startsWith('/') || file.includes('..') || file.includes('\\')) {
        problems.push(`${where}: target "${file}" must be a repository-relative path`)
      }
    }
    if (new Set(check.files).size !== check.files.length) problems.push(`${where}: duplicate target files`)
    if (!Array.isArray(check.cases) || check.cases.length === 0) {
      problems.push(`${where}: declares no required cases`)
      continue
    }
    const seen = new Set()
    for (const testCase of check.cases) {
      if (typeof testCase?.name !== 'string' || testCase.name.trim() === '') {
        problems.push(`${where}: a required case has no name`)
        continue
      }
      if (!check.files.includes(testCase.file)) {
        problems.push(`${where}: case "${testCase.name}" names file "${testCase.file}" that is not a declared target`)
      }
      if (testCase.project !== undefined && check.runner !== 'playwright') {
        problems.push(`${where}: case "${testCase.name}" sets project but runner is ${check.runner}`)
      }
      const key = caseKey(testCase)
      if (seen.has(key)) problems.push(`${where}: duplicate required case "${testCase.name}"`)
      seen.add(key)
    }
    for (const file of check.files) {
      if (!check.cases.some((testCase) => testCase.file === file)) {
        problems.push(`${where}: target "${file}" has no declared required case`)
      }
    }
  }
  return problems
}

export function loadManifest(path, { task } = {}) {
  if (!existsSync(path)) throw new GuardError([`required-case manifest is absent: ${path}`])
  let manifest
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new GuardError([`required-case manifest is not valid JSON: ${error.message}`])
  }
  const problems = validateManifest(manifest, { task })
  if (problems.length) throw new GuardError(problems.map((problem) => `manifest: ${problem}`))
  return manifest
}

function caseKey(testCase) {
  return JSON.stringify([testCase.file ?? null, testCase.name, testCase.project ?? null])
}

export class GuardError extends Error {
  constructor(problems) {
    super(problems.join('\n'))
    this.problems = problems
  }
}

// ---------------------------------------------------------------- command

const VALUE_FLAGS = {
  vitest: new Set([
    '-t', '--testNamePattern', '-c', '--config', '-r', '--root', '--dir', '--project',
    '--environment', '--pool', '--shard', '--maxWorkers', '--minWorkers', '--exclude',
    '--mode', '--retry', '--testTimeout', '--hookTimeout', '--bail', '--sequence.seed',
  ]),
  playwright: new Set([
    '-c', '--config', '--project', '-g', '--grep', '--grep-invert', '-j', '--workers',
    '--retries', '--repeat-each', '--timeout', '--max-failures', '--shard', '--output',
    '--global-timeout', '--trace', '--tsconfig',
  ]),
  'node-test': new Set([
    '--import', '--require', '-r', '--test-name-pattern', '--test-skip-pattern',
    '--test-concurrency', '--test-timeout', '--test-shard', '--loader', '--experimental-loader',
  ]),
}

// Flags the guard owns (report destination) or that change what a run proves.
const FORBIDDEN_FLAGS = {
  vitest: [/^--reporter\b/, /^--outputFile\b/, /^--watch\b/, /^-w$/, /^-u$/, /^--update\b/, /^--standalone\b/],
  playwright: [/^--reporter\b/, /^--list\b/, /^--ui\b/, /^-u$/, /^--update-snapshots\b/, /^--pass-with-no-tests\b/, /^--last-failed\b/, /^--only-changed\b/, /^--debug\b/],
  'node-test': [/^--test-reporter\b/, /^--test-reporter-destination\b/, /^--watch\b/, /^--test-update-snapshots\b/],
}

const NPX_DOWNLOAD_FLAGS = new Set(['-y', '--yes', '-p', '--package', '-c', '--call'])

/**
 * Resolve the command to an installed executable and classify its runner.
 * Never allows `npx` to fetch a package: `npx <bin>` is rewritten to the
 * repository's own `node_modules/.bin/<bin>`, which must already exist.
 */
export function analyseCommand(argv, { cwd }) {
  if (!Array.isArray(argv) || argv.length === 0) throw new GuardError(['no command given after --'])
  let args = [...argv]
  let executable
  let binName
  if (args[0] === 'npx') {
    args.shift()
    while (args[0]?.startsWith('-')) {
      const flag = args.shift()
      if (NPX_DOWNLOAD_FLAGS.has(flag.split('=')[0])) {
        throw new GuardError([`npx flag ${flag} can download a package; use the installed repository executable`])
      }
    }
    binName = args.shift()
    if (!binName) throw new GuardError(['npx names no executable'])
  } else if (args[0] === 'node' || args[0] === process.execPath) {
    executable = process.execPath
    args.shift()
  } else {
    binName = args.shift()
  }
  if (binName !== undefined) {
    const base = binName.split('/').pop()
    if (binName.includes('/') && resolve(cwd, binName) !== resolve(cwd, 'node_modules/.bin', base)) {
      throw new GuardError([`executable ${binName} is not a repository node_modules/.bin executable`])
    }
    const candidate = resolve(cwd, 'node_modules/.bin', base)
    if (!existsSync(candidate)) {
      throw new GuardError([`${base} is not installed in node_modules/.bin; run npm ci (no automatic package download)`])
    }
    executable = candidate
    binName = base
  }

  let runner
  let runnerArgs
  if (binName === 'vitest') {
    if (args[0] !== 'run') throw new GuardError(['vitest must be invoked as "vitest run" (single run, no watch)'])
    runner = 'vitest'
    runnerArgs = args.slice(1)
  } else if (binName === 'playwright') {
    if (args[0] !== 'test') throw new GuardError(['playwright must be invoked as "playwright test"'])
    runner = 'playwright'
    runnerArgs = args.slice(1)
  } else if (binName === undefined) {
    if (!args.includes('--test')) throw new GuardError(['node commands must use the node:test runner (--test)'])
    runner = 'node-test'
    runnerArgs = args
  } else {
    throw new GuardError([`unsupported runner "${binName}"; expected vitest, playwright or node --test`])
  }

  const problems = []
  const targets = []
  // Index of each target inside runnerArgs (for node:test, runnerArgs is
  // `args`), so the guard can run one node:test target per invocation.
  const targetIndices = []
  const valueFlags = VALUE_FLAGS[runner]
  for (let index = 0; index < runnerArgs.length; index += 1) {
    const arg = runnerArgs[index]
    if (arg === '--') {
      problems.push('a nested "--" is not supported')
      continue
    }
    if (arg.startsWith('-')) {
      if (FORBIDDEN_FLAGS[runner].some((pattern) => pattern.test(arg))) {
        problems.push(`flag ${arg} is not allowed: the guard owns reporting and a proof run must not watch or update`)
      }
      if (!arg.includes('=') && valueFlags.has(arg)) index += 1
      continue
    }
    if (runner === 'node-test' && arg === '--test') continue
    targets.push(arg)
    targetIndices.push(index)
  }
  if (targets.length === 0) problems.push('the command names no target files; name every required file explicitly')
  if (problems.length) throw new GuardError(problems)
  return { runner, executable, args: args, runnerArgs, targets, targetIndices }
}

/** Repository-relative form of a command target (drops a Playwright :line suffix). */
export function normaliseTarget(target, cwd) {
  const withoutLine = target.replace(/:\d+(?::\d+)?$/, '')
  return relative(cwd, resolve(cwd, withoutLine)).split('\\').join('/')
}

function instrument(analysis, reportPath) {
  const { runner, args } = analysis
  if (runner === 'vitest') {
    return {
      args: [...args, '--reporter=default', '--reporter=json', `--outputFile.json=${reportPath}`],
      env: {},
    }
  }
  if (runner === 'playwright') {
    return { args: [...args, '--reporter=list,json'], env: { PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath, PLAYWRIGHT_JSON_OUTPUT_NAME: undefined } }
  }
  return {
    args: [
      '--test-reporter=tap', `--test-reporter-destination=${reportPath}`,
      '--test-reporter=spec', '--test-reporter-destination=stdout',
      ...args,
    ],
    env: {},
  }
}

function runnerVersion(runner, cwd) {
  if (runner === 'node-test') return null
  const packageName = runner === 'vitest' ? 'vitest' : '@playwright/test'
  try {
    return JSON.parse(readFileSync(resolve(cwd, 'node_modules', packageName, 'package.json'), 'utf8')).version
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- evaluate

/**
 * Read a native report and reject absent, empty or stale output. A report is
 * stale when it already existed before the run, was last written before the
 * run started, or carries a runner start time earlier than the run.
 */
export function readFreshReport(reportPath, { startedAt, existedBefore = false }) {
  if (existedBefore) throw new GuardError(['stale native report: the report path existed before this run'])
  if (!existsSync(reportPath)) throw new GuardError(['absent native report: the runner wrote no result file'])
  const stats = statSync(reportPath)
  if (stats.size === 0) throw new GuardError(['absent native report: the result file is empty'])
  if (stats.mtimeMs < startedAt - CLOCK_SKEW_MS) {
    throw new GuardError(['stale native report: the result file predates this run'])
  }
  return readFileSync(reportPath, 'utf8')
}

export function parseReport(runner, text, { cwd, targets }) {
  try {
    if (runner === 'vitest') return parseVitestJson(text, { cwd })
    if (runner === 'playwright') return parsePlaywrightJson(text, { cwd })
    return parseNodeTap(text, { targets })
  } catch (error) {
    throw new GuardError([`unreadable native report: ${error.message}`])
  }
}

function tally(cases) {
  const totals = { total: cases.length, passed: 0, failed: 0, skipped: 0, todo: 0 }
  for (const testCase of cases) totals[testCase.status] += 1
  totals.executed = totals.passed + totals.failed
  return totals
}

/**
 * Judge parsed native results against a declared check. Pure: no I/O.
 * Returns { ok, problems, requiredCases, totals }.
 */
export function evaluateResults({ check, parsed, targets, exitCode, startedAt }) {
  const problems = []
  const totals = tally(parsed.cases)
  if (exitCode !== 0) problems.push(`runner exited with code ${exitCode}`)
  for (const error of parsed.fileErrors ?? []) problems.push(error)
  if (parsed.startTime !== null && parsed.startTime !== undefined && startedAt !== undefined &&
      parsed.startTime < startedAt - CLOCK_SKEW_MS) {
    problems.push('stale native report: the runner start time predates this run')
  }
  if ((parsed.syntheticFileCases ?? []).length) {
    problems.push(`zero execution: ${parsed.syntheticFileCases.join(', ')} declared no tests (node reports a synthetic pass)`)
  }
  if (totals.total === 0) problems.push('zero execution: the native report contains no cases')
  else if (totals.executed === 0) problems.push('all skipped: no case executed')

  // A case without a file cannot prove anything about a declared target.
  // (node:test TAP carries no file for a passing case; the guard therefore
  // runs each node:test target separately and attributes its cases.)
  const unattributed = parsed.cases.filter((testCase) => testCase.file === null || testCase.file === undefined)
  if (unattributed.length) {
    problems.push(`${unattributed.length} native case(s) cannot be attributed to a file; required cases match only within their own file`)
  }

  // Every requested target must have produced native results.
  for (const target of targets) {
    const forTarget = parsed.cases.filter((testCase) => testCase.file === target)
    if (forTarget.length === 0) problems.push(`requested target produced no native results: ${target}`)
    else if (!forTarget.some((testCase) => testCase.status === 'passed')) {
      problems.push(`requested target executed no passing case: ${target}`)
    }
  }

  // Exact identity: name, file and (Playwright) project. Never by name alone.
  const requiredCases = check.cases.map((required) => {
    const matches = parsed.cases.filter((actual) =>
      actual.name === required.name &&
      actual.file === required.file &&
      (required.project === undefined || actual.project === required.project))
    let status
    if (matches.length === 0) status = 'missing'
    else if (matches.every((actual) => actual.status === 'passed')) status = 'passed'
    else if (matches.some((actual) => actual.status === 'failed')) status = 'failed'
    else status = matches.find((actual) => actual.status !== 'passed').status
    return {
      file: required.file,
      name: required.name,
      ...(required.project === undefined ? {} : { project: required.project }),
      status,
    }
  })
  for (const required of requiredCases) {
    if (required.status !== 'passed') {
      const label = `${required.file}${NAME_SEPARATOR}${required.name}${required.project ? ` [${required.project}]` : ''}`
      problems.push(`required case ${required.status === 'missing' ? 'did not run' : `was ${required.status}`}: ${label}`)
    }
  }
  return { ok: problems.length === 0, problems, requiredCases, totals }
}

// ---------------------------------------------------------------- run

/**
 * Run one declared check through its native runner and judge the result.
 * Writes a deterministic receipt (no timestamps or machine paths) unless
 * `writeReceipt` is false. Returns { ok, problems, receipt, receiptPath }.
 */
export function runRequiredCheck({
  cwd = process.cwd(),
  evidenceRoot = resolve(cwd, 'evidence/refinement'),
  manifestPath,
  task,
  check: checkId,
  command,
  writeReceipt = true,
  stdio = 'inherit',
  env = process.env,
}) {
  const problems = []
  let analysis
  let manifest
  let check
  const resolvedManifestPath = manifestPath ?? manifestPathFor(evidenceRoot, task)
  try {
    manifest = loadManifest(resolvedManifestPath, { task })
    check = manifest.checks[checkId]
    if (!check) throw new GuardError([`manifest declares no check "${checkId}"`])
    analysis = analyseCommand(command, { cwd })
    if (analysis.runner !== check.runner) {
      throw new GuardError([`command runs ${analysis.runner} but check "${checkId}" declares ${check.runner}`])
    }
  } catch (error) {
    if (error instanceof GuardError) return finish({ problems: error.problems })
    throw error
  }

  const targets = analysis.targets.map((target) => normaliseTarget(target, cwd))
  const declared = new Set(check.files)
  for (const target of targets) {
    if (!declared.has(target)) problems.push(`command target ${target} is not declared for check "${checkId}"`)
  }
  for (const file of check.files) {
    if (!targets.includes(file)) problems.push(`declared target ${file} is not requested by the command`)
  }
  const missing = targets.filter((target) => !existsSync(resolve(cwd, target)) || !statSync(resolve(cwd, target)).isFile())
  if (missing.length) {
    const present = targets.length - missing.length
    const kind = present > 0 ? 'mixed existing/missing targets' : 'missing targets'
    for (const target of missing) problems.push(`${kind}: requested file does not exist: ${target}`)
  }
  if (problems.length) return finish({ problems })

  let runStartedAt
  // node:test TAP gives no file for a passing case, so each node:test target
  // runs as its own invocation and its cases are attributed to that file.
  // Vitest and Playwright report files natively and run once.
  const runs = analysis.runner === 'node-test' && targets.length > 1
    ? targets.map((target, position) => ({
      args: analysis.args.filter((_, index) =>
        !analysis.targetIndices.some((targetIndex, other) => other !== position && targetIndex === index)),
      targets: [target],
    }))
    : [{ args: analysis.args, targets }]
  const merged = { format: null, cases: [], syntheticFileCases: [], fileErrors: [], startTime: null }
  const outputs = { stdout: '', stderr: '' }
  let exitCode = 0
  let parsedAll = true
  for (const run of runs) {
    const once = runOnce(run)
    outputs.stdout += once.stdout
    outputs.stderr += once.stderr
    if (once.exitCode !== 0 && exitCode === 0) exitCode = once.exitCode
    if (!once.parsed) {
      parsedAll = false
      continue
    }
    merged.format = once.parsed.format
    merged.cases.push(...once.parsed.cases)
    merged.syntheticFileCases.push(...(once.parsed.syntheticFileCases ?? []))
    merged.fileErrors.push(...(once.parsed.fileErrors ?? []))
    if (once.parsed.startTime !== null && once.parsed.startTime !== undefined) {
      merged.startTime = merged.startTime === null ? once.parsed.startTime : Math.min(merged.startTime, once.parsed.startTime)
    }
  }
  let evaluation = null
  if (parsedAll) {
    evaluation = evaluateResults({ check, parsed: merged, targets, exitCode, startedAt: runStartedAt })
    problems.push(...evaluation.problems)
  } else if (exitCode !== 0 && !problems.includes(`runner exited with code ${exitCode}`)) {
    problems.push(`runner exited with code ${exitCode}`)
  }
  const child = outputs
  return finish({ problems, evaluation, targets, child })

  function runOnce({ args: runArgs, targets: runTargets }) {
    const reportDir = mkdtempSync(join(tmpdir(), 'required-check-'))
    const reportPath = join(reportDir, analysis.runner === 'node-test' ? 'report.tap' : 'report.json')
    const existedBefore = existsSync(reportPath)
    const { args: instrumented, env: extraEnv } = instrument({ ...analysis, args: runArgs }, reportPath)
    const childEnv = { ...env }
    // A guard started inside a node:test process inherits NODE_TEST_CONTEXT,
    // which makes a nested `node --test` stream to the parent instead of
    // writing its own reporter output. Each guarded run is a top-level run.
    delete childEnv.NODE_TEST_CONTEXT
    for (const [key, value] of Object.entries(extraEnv)) {
      if (value === undefined) delete childEnv[key]
      else childEnv[key] = value
    }
    const startedAt = Date.now()
    runStartedAt ??= startedAt
    const spawned = spawnSync(analysis.executable, instrumented, { cwd, env: childEnv, stdio, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
    const code = spawned.error ? -1 : spawned.status ?? -1
    if (spawned.error) problems.push(`runner could not start: ${spawned.error.message}`)
    let parsed = null
    try {
      const text = readFreshReport(reportPath, { startedAt, existedBefore })
      parsed = parseReport(analysis.runner, text, { cwd, targets: runTargets })
    } catch (error) {
      if (!(error instanceof GuardError)) throw error
      problems.push(...error.problems.map((problem) => (runs.length > 1 ? `${problem} (${runTargets[0]})` : problem)))
    } finally {
      rmSync(reportDir, { recursive: true, force: true })
    }
    return { exitCode: code, parsed, stdout: spawned.stdout ?? '', stderr: spawned.stderr ?? '' }
  }

  function finish({ problems: found, evaluation: judged = null, targets: requested = [], child: spawned = null }) {
    const ok = found.length === 0
    const receipt = {
      schema: RECEIPT_SCHEMA,
      task,
      check: checkId,
      verdict: ok ? 'passed' : 'rejected',
      purpose: check?.purpose ?? 'delivery',
      runner: check?.runner ?? null,
      runnerVersion: check ? runnerVersion(check.runner, cwd) : null,
      command,
      manifest: existsSync(resolvedManifestPath)
        ? { path: repoRelative(cwd, resolvedManifestPath), sha256: sha256(readFileSync(resolvedManifestPath)) }
        : null,
      targets: requested.filter((target) => existsSync(resolve(cwd, target))).map((target) => ({
        path: target,
        sha256: sha256(readFileSync(resolve(cwd, target))),
      })),
      requiredCases: judged?.requiredCases ?? [],
      totals: judged?.totals ?? null,
      problems: found,
    }
    let receiptPath = null
    if (writeReceipt && manifest && check) {
      receiptPath = receiptPathFor(evidenceRoot, task, checkId)
      mkdirSync(dirname(receiptPath), { recursive: true })
      writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
    }
    return { ok, problems: found, receipt, receiptPath, stdout: spawned?.stdout ?? '', stderr: spawned?.stderr ?? '' }
  }
}

function repoRelative(cwd, path) {
  const rel = relative(cwd, path).split('\\').join('/')
  return rel.startsWith('..') ? path : rel
}

// ---------------------------------------------------------------- receipts

/**
 * Check a stored receipt against the current manifest and target bytes.
 * Used by final aggregate mode. Returns a list of problems.
 */
export function verifyReceipt({ cwd, evidenceRoot, task, checkId, check, manifestPath }) {
  const where = `${task} ${checkId}`
  const receiptPath = receiptPathFor(evidenceRoot, task, checkId)
  if (!existsSync(receiptPath)) return [`${where}: absent result receipt ${repoRelative(cwd, receiptPath)}`]
  let receipt
  try {
    receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  } catch {
    return [`${where}: result receipt is not valid JSON`]
  }
  const problems = []
  if (receipt.schema !== RECEIPT_SCHEMA) problems.push(`${where}: receipt schema is not ${RECEIPT_SCHEMA}`)
  if (receipt.task !== task || receipt.check !== checkId) problems.push(`${where}: receipt identifies ${receipt.task} ${receipt.check}`)
  if (receipt.verdict !== 'passed') problems.push(`${where}: receipt verdict is ${receipt.verdict}`)
  if (receipt.runner !== check.runner) problems.push(`${where}: receipt runner ${receipt.runner} is not ${check.runner}`)
  const manifestSha = sha256(readFileSync(manifestPath))
  if (receipt.manifest?.sha256 !== manifestSha) problems.push(`${where}: stale receipt: required-case manifest changed after the run`)
  const recordedTargets = new Map((receipt.targets ?? []).map((target) => [target.path, target.sha256]))
  for (const file of check.files) {
    const absolute = resolve(cwd, file)
    if (!existsSync(absolute)) {
      problems.push(`${where}: target ${file} no longer exists`)
      continue
    }
    if (!recordedTargets.has(file)) problems.push(`${where}: receipt does not cover target ${file}`)
    else if (recordedTargets.get(file) !== sha256(readFileSync(absolute))) {
      problems.push(`${where}: stale receipt: target ${file} changed after the run`)
    }
  }
  const recordedCases = new Map((receipt.requiredCases ?? []).map((testCase) => [caseKey(testCase), testCase.status]))
  for (const testCase of check.cases) {
    const status = recordedCases.get(caseKey(testCase))
    if (status !== 'passed') problems.push(`${where}: required case "${testCase.name}" is ${status ?? 'not recorded'} in the receipt`)
  }
  if (!receipt.totals || receipt.totals.executed < 1) problems.push(`${where}: receipt records zero executed cases`)
  if ((receipt.problems ?? []).length) problems.push(`${where}: receipt records problems`)
  return problems
}
