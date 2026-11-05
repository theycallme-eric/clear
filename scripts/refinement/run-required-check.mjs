/**
 * REQ-040 / TASK-039 — the shared required-check guard for the
 * clear-refinement-20261103 body.
 *
 *   node scripts/refinement/run-required-check.mjs --task TASK-0NN --check <id> -- <command>
 *
 * A task declares, in its own `evidence/refinement/task-0nn/required-cases.json`,
 * the files each check runs and the exact cases that must pass in them. The
 * guard runs the command with the runner's own reporter added, reads that
 * native report, and passes only when:
 *
 *  * every declared file exists and is named by the command, and every path
 *    the command names exists (no mixed existing/missing targets);
 *  * the command is an installed repository executable — `node`, or a tool in
 *    `node_modules/.bin` — never a package fetched on demand;
 *  * the runner exited 0 and wrote a fresh report for this run (not one left
 *    by an earlier run);
 *  * the report executed at least one case and not every case skipped;
 *  * each declared required case is present and passed. Cases the command
 *    filtered out, and cases the task did not declare, are not required.
 *
 * The verdict is the process exit status, the same terminal proof the GR-06
 * lanes use; the result file beside the manifest records what was checked.
 * Nothing here adds a Runner schema or protocol.
 *
 * @typedef {'node-test' | 'vitest' | 'playwright'} RunnerKind
 *
 * @typedef {object} RequiredCase
 * @property {string} file
 * @property {string} name ancestor titles and title, joined by ' > '
 * @property {string} [project] Playwright project, when the case must pass in one
 *
 * @typedef {object} CheckDeclaration
 * @property {RunnerKind} runner
 * @property {string[]} files
 * @property {RequiredCase[]} requiredCases
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { parseNativeReport } from './native-results.mjs'

export const RESULT_SCHEMA = 'clear-refinement-required-check-result-v1'
export const MANIFEST_SCHEMA = 'clear-refinement-required-cases-v1'
export const RUNNERS = /** @type {const} */ (['node-test', 'vitest', 'playwright'])

/** A report may claim a start a little before the guard's clock read. */
const CLOCK_SLACK_MS = 2000

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** @param {string} path */
const toPosix = (path) => path.split(sep).join('/')

/** @param {Buffer | string} bytes */
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** @param {string} task e.g. TASK-039 */
export const taskSlug = (task) => task.toLowerCase()

/** @param {string} root @param {string} task */
export const defaultManifestPath = (root, task) =>
  join(root, 'evidence', 'refinement', taskSlug(task), 'required-cases.json')

/** @param {string} root @param {string} task */
export const defaultResultsDir = (root, task) =>
  join(root, 'evidence', 'refinement', taskSlug(task), 'results')

/** A declared path: repository-relative, forward slashes, never escaping the root. */
const isSafeRelative = (/** @type {unknown} */ path) =>
  typeof path === 'string' &&
  path !== '' &&
  !isAbsolute(path) &&
  !path.includes('\\') &&
  normalize(path).split(sep)[0] !== '..'

/**
 * Why a manifest's declaration of one check cannot be used, or the check.
 *
 * @param {unknown} manifest
 * @param {string} task
 * @param {string} check
 * @returns {{ check: CheckDeclaration, problems: [] } | { check: null, problems: string[] }}
 */
export function readCheckDeclaration(manifest, task, check) {
  const m = /** @type {any} */ (manifest)
  /** @type {string[]} */
  const problems = []
  if (!m || typeof m !== 'object') return { check: null, problems: ['the manifest is not an object'] }
  if (m.schema !== MANIFEST_SCHEMA) problems.push(`the manifest schema is not "${MANIFEST_SCHEMA}"`)
  if (m.task !== task) problems.push(`the manifest belongs to "${String(m.task)}", not "${task}"`)
  const declared = m.checks?.[check]
  if (!declared) {
    problems.push(`the manifest declares no check "${check}"`)
    return { check: null, problems }
  }
  if (!RUNNERS.includes(declared.runner)) problems.push(`check "${check}" names no known runner`)
  const files = Array.isArray(declared.files) ? declared.files : []
  if (files.length === 0) problems.push(`check "${check}" declares no files`)
  for (const file of files) {
    if (!isSafeRelative(file)) problems.push(`declared file "${String(file)}" is not a repository-relative path`)
  }
  const cases = Array.isArray(declared.requiredCases) ? declared.requiredCases : []
  if (cases.length === 0) problems.push(`check "${check}" declares no required cases`)
  const seen = new Set()
  for (const required of cases) {
    if (typeof required?.name !== 'string' || required.name === '') {
      problems.push('a required case has no name')
      continue
    }
    if (!files.includes(required.file)) {
      problems.push(`required case "${required.name}" names "${String(required.file)}", which the check does not declare`)
    }
    const identity = `${required.file}\u0000${required.project ?? ''}\u0000${required.name}`
    if (seen.has(identity)) problems.push(`required case "${required.name}" is declared twice`)
    seen.add(identity)
  }
  for (const file of files) {
    if (!cases.some((/** @type {any} */ required) => required?.file === file)) {
      problems.push(`declared file "${file}" has no required case`)
    }
  }
  if (problems.length > 0) return { check: null, problems }
  return { check: declared, problems: [] }
}

/** Launchers that may download a package when the tool is absent. */
const DOWNLOADERS = new Set(['npx', 'pnpx', 'bunx', 'yarn', 'pnpm', 'npm'])
const NODE_REPORTER_FLAG = /^--test-reporter(-destination)?(=|$)/
const VITEST_REPORTER_FLAG = /^--(reporter|outputFile)(\.|=|$)/
const PLAYWRIGHT_REPORTER_FLAG = /^--reporter(=|$)/

/**
 * The command as it will be spawned, with the runner's native reporter added,
 * or why it will not be spawned.
 *
 * @param {object} options
 * @param {string[]} options.argv everything after `--`
 * @param {RunnerKind} options.runner
 * @param {string} options.root
 * @param {string} options.reportPath absolute
 * @param {(path: string) => boolean} [options.exists]
 * @returns {{ executable: string, args: string[], env: Record<string, string>, problems: [] } | { problems: string[] }}
 */
export function planCommand({ argv, runner, root, reportPath, exists = existsSync }) {
  if (argv.length === 0) return { problems: ['no command follows "--"'] }
  let [head, ...rest] = argv
  /** @type {string[]} */
  const problems = []

  if (DOWNLOADERS.has(head)) {
    // `npx vitest` is accepted only as a spelling of the installed binary.
    if (head === 'npm' && rest[0] === 'exec') rest = rest.slice(1)
    else if (head === 'yarn' || head === 'pnpm' || head === 'npm') {
      return { problems: [`"${head}" may run something other than an installed test runner; name the runner`] }
    }
    rest = rest.filter((arg) => arg !== '--no-install' && arg !== '--offline' && arg !== '--')
    if (rest.some((arg) => arg === '-y' || arg === '--yes' || arg.startsWith('--package'))) {
      return { problems: [`"${head}" was asked to fetch a package; only installed executables run`] }
    }
    ;[head, ...rest] = rest
    if (!head) return { problems: [`"${argv[0]}" names no tool`] }
  }

  let executable
  if (head === 'node' || head === process.execPath) executable = process.execPath
  else if (head === 'vitest' || head === 'playwright') {
    executable = join(root, 'node_modules', '.bin', head)
    if (!exists(executable)) {
      return { problems: [`${head} is not installed in node_modules/.bin; refusing to fetch it`] }
    }
  } else {
    return { problems: [`"${head}" is not an installed test runner this guard reads (node, vitest, playwright)`] }
  }

  const detected =
    executable === process.execPath
      ? rest.includes('--test') ? 'node-test' : null
      : head === 'vitest' ? 'vitest'
      : rest[0] === 'test' ? 'playwright' : null
  if (detected !== runner) {
    problems.push(`the command runs ${detected ?? 'no recognised test runner'}, but the check declares ${runner}`)
  }

  const flag = runner === 'node-test' ? NODE_REPORTER_FLAG : runner === 'vitest' ? VITEST_REPORTER_FLAG : PLAYWRIGHT_REPORTER_FLAG
  if (rest.some((arg) => flag.test(arg))) {
    problems.push('the command chooses its own reporter; the guard adds the native one it reads')
  }
  if (problems.length > 0) return { problems }

  /** @type {Record<string, string>} */
  const env = {}
  let args
  if (runner === 'node-test') {
    args = [
      '--test-reporter=spec',
      '--test-reporter-destination=stdout',
      '--test-reporter=tap',
      `--test-reporter-destination=${reportPath}`,
      ...rest,
    ]
  } else if (runner === 'vitest') {
    const run = rest[0] === 'run' ? rest : ['run', ...rest]
    args = [...run, '--reporter=default', '--reporter=json', `--outputFile.json=${reportPath}`]
  } else {
    args = [...rest, '--reporter=list,json']
    env.PLAYWRIGHT_JSON_OUTPUT_FILE = reportPath
    env.PLAYWRIGHT_JSON_OUTPUT_NAME = reportPath
  }
  return { executable, args, env, problems: [] }
}

/** Test-file-like positional arguments a command names. */
const PATH_LIKE = /\.(m?[jt]sx?|cjs)$/

/**
 * Every declared file must exist and be named by the command; every path the
 * command names must exist.
 *
 * @param {object} options
 * @param {string[]} options.argv
 * @param {string[]} options.files declared
 * @param {string} options.root
 * @param {(path: string) => boolean} [options.exists]
 */
export function targetProblems({ argv, files, root, exists = existsSync }) {
  /** @type {string[]} */
  const problems = []
  const named = new Set()
  for (const arg of argv) {
    if (arg.startsWith('-') || !PATH_LIKE.test(arg)) continue
    const rel = toPosix(relative(root, resolve(root, arg)))
    named.add(rel)
    if (!exists(resolve(root, rel))) problems.push(`the command names "${rel}", which does not exist`)
  }
  for (const file of files) {
    if (!exists(resolve(root, file))) problems.push(`declared file "${file}" does not exist`)
    else if (!named.has(file)) problems.push(`declared file "${file}" is not named by the command`)
  }
  return problems
}

/**
 * The guard's verdict on one finished run. Never throws: each refusal is a
 * sentence naming what is missing.
 *
 * @param {object} options
 * @param {CheckDeclaration} options.check
 * @param {number | null} options.exitCode
 * @param {string | null} options.reportText null when no report was written
 * @param {number | null} options.reportWrittenAt epoch ms of the report file
 * @param {number} options.runStartedAt epoch ms the guard started the run
 * @param {string} options.root
 * @param {{ file: string, text: string | null, writtenAt: number | null, exitCode: number | null }[]} [options.nodeReports] independently executed, file-bound TAP reports
 */
export function evaluateRun({ check, exitCode, reportText, reportWrittenAt, runStartedAt, root, nodeReports }) {
  /** @type {string[]} */
  const problems = []
  /** @type {{ file: string, name: string, project?: string, status: string, occurrences: number }[]} */
  const requiredResults = []
  const totals = { cases: 0, executed: 0, passed: 0, failed: 0, skipped: 0, todo: 0 }

  if (exitCode !== 0) problems.push(`the runner exited ${exitCode === null ? 'by signal' : String(exitCode)}`)
  if (reportText === null) {
    problems.push('the runner wrote no native report (absent result)')
    return { problems, totals, requiredResults }
  }
  if (reportWrittenAt === null || reportWrittenAt < runStartedAt - CLOCK_SLACK_MS) {
    problems.push('the native report predates this run (stale result)')
  }

  let report
  if (check.runner === 'node-test' && nodeReports) {
    report = { cases: [], problems: [], startedAt: null }
    for (const entry of nodeReports) {
      if (entry.exitCode !== 0) problems.push(`Node file "${entry.file}" exited ${String(entry.exitCode)}`)
      if (entry.text === null || entry.writtenAt === null) {
        problems.push(`Node file "${entry.file}" wrote no native report`)
        continue
      }
      if (entry.writtenAt < runStartedAt - CLOCK_SLACK_MS) problems.push(`Node file "${entry.file}" report is stale`)
      const parsed = parseNativeReport('node-test', entry.text, root)
      report.problems.push(...parsed.problems.map((problem) => `${entry.file}: ${problem}`))
      report.cases.push(...parsed.cases.map((c) => ({ ...c, file: entry.file })))
    }
  } else {
    report = parseNativeReport(check.runner, reportText, root)
    if (check.runner === 'node-test') {
      if (check.files.length !== 1) problems.push('Combined Node TAP cannot attribute cases to multiple files; separate file-bound reports are required')
      else report.cases = report.cases.map((c) => ({ ...c, file: check.files[0] }))
    }
  }
  problems.push(...report.problems)
  if (report.startedAt !== null && report.startedAt < runStartedAt - CLOCK_SLACK_MS) {
    problems.push('the native report says it started before this run (stale result)')
  }

  for (const c of report.cases) {
    totals.cases++
    totals[c.status]++
    if (c.status === 'passed' || c.status === 'failed') totals.executed++
  }
  if (totals.executed === 0) {
    problems.push(
      totals.cases === 0
        ? 'the run executed no case (zero-execution result)'
        : `every one of ${totals.cases} case(s) was skipped or todo (all-skipped result)`,
    )
  }

  // A passing Node TAP case is attributed only through its independent file run.
  // Source text, comments and equal titles in another file are never execution proof.
  for (const file of check.files) {
    if (!report.cases.some((c) => c.file === file)) {
      problems.push(`declared file "${file}" produced no result (missing target)`)
    }
  }

  for (const required of check.requiredCases) {
    const matches = report.cases.filter(
      (c) =>
        c.name === required.name &&
        c.file === required.file &&
        (required.project === undefined || c.project === required.project),
    )
    let status = 'absent'
    if (matches.length > 0) status = matches.every((c) => c.status === 'passed') ? 'passed' : matches.find((c) => c.status !== 'passed')?.status ?? 'failed'
    requiredResults.push({ ...required, status, occurrences: matches.length })
    const label = `required case "${required.name}" in ${required.file}`
    if (status === 'absent') problems.push(`${label} is absent from the native report`)
    else if (status !== 'passed') problems.push(`${label} did not pass (${status})`)

  }
  return { problems, totals, requiredResults }
}

/**
 * The commit the run is for, and whether the tree is still that commit.
 *
 * @param {string} root
 */
function readCommit(root) {
  const git = (/** @type {string[]} */ args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  const head = git(['rev-parse', 'HEAD'])
  const status = git(['status', '--porcelain'])
  return {
    commit: head.status === 0 ? head.stdout.trim() : null,
    dirty: status.status === 0 ? status.stdout.trim() !== '' : null,
  }
}

/**
 * Run one declared check end to end and write its result beside the manifest.
 *
 * @param {object} options
 * @param {string} options.task
 * @param {string} options.check
 * @param {string[]} options.argv
 * @param {string} [options.root]
 * @param {string} [options.manifestPath]
 * @param {string} [options.resultsDir]
 * @param {() => number} [options.clock]
 * @param {(line: string) => void} [options.log]
 * @param {'inherit' | 'pipe' | 'ignore'} [options.stdio] the runner's own output
 * @param {Record<string, string>} [options.env] added to the runner's environment
 */
export function runRequiredCheck({
  task,
  check: checkId,
  argv,
  root = REPO_ROOT,
  manifestPath = defaultManifestPath(root, task),
  resultsDir = defaultResultsDir(root, task),
  clock = Date.now,
  log = (line) => process.stderr.write(`${line}\n`),
  stdio = 'inherit',
  env: extraEnv = {},
}) {
  /** @type {string[]} */
  const problems = []
  const result = {
    schema: RESULT_SCHEMA,
    task,
    check: checkId,
    status: /** @type {'passed' | 'failed'} */ ('failed'),
    runner: /** @type {string | null} */ (null),
    ...readCommit(root),
    manifest: toPosix(relative(root, manifestPath)),
    manifestSha256: /** @type {string | null} */ (null),
    command: argv,
    exitCode: /** @type {number | null} */ (null),
    startedAt: /** @type {string | null} */ (null),
    finishedAt: /** @type {string | null} */ (null),
    files: /** @type {{ path: string, sha256: string | null }[]} */ ([]),
    totals: /** @type {Record<string, number> | null} */ (null),
    requiredCases: /** @type {unknown[]} */ ([]),
    nativeReport: /** @type {string | null} */ (null),
    problems,
  }
  const finish = () => {
    result.status = problems.length === 0 ? 'passed' : 'failed'
    mkdirSync(resultsDir, { recursive: true })
    writeFileSync(join(resultsDir, `${checkId}.json`), `${JSON.stringify(result, null, 2)}\n`)
    return result
  }

  let manifest
  try {
    const bytes = readFileSync(manifestPath)
    result.manifestSha256 = sha256(bytes)
    manifest = JSON.parse(bytes.toString('utf8'))
  } catch {
    problems.push(`no readable required-case manifest at ${result.manifest}`)
    return finish()
  }
  const declaration = readCheckDeclaration(manifest, task, checkId)
  if (!declaration.check) {
    problems.push(...declaration.problems)
    return finish()
  }
  const check = declaration.check
  result.runner = check.runner
  result.files = check.files.map((file) => {
    const path = resolve(root, file)
    return { path: file, sha256: existsSync(path) ? sha256(readFileSync(path)) : null }
  })

  problems.push(...targetProblems({ argv, files: check.files, root }))
  const extension = check.runner === 'node-test' ? 'tap' : 'json'
  const reportPath = join(resultsDir, `${checkId}.native.${extension}`)
  const plan = planCommand({ argv, runner: check.runner, root, reportPath })
  problems.push(...plan.problems)
  if (problems.length > 0 || !('executable' in plan)) return finish()

  mkdirSync(resultsDir, { recursive: true })
  rmSync(reportPath, { force: true })
  const runStartedAt = clock()
  result.startedAt = new Date(runStartedAt).toISOString()
  if (check.runner !== 'node-test') log(`required-check ${task}/${checkId}: ${[plan.executable, ...plan.args].join(' ')}`)
  const env = { ...process.env, ...extraEnv, ...plan.env }
  // A Node test run nested in another must report for itself, not to its parent.
  delete env.NODE_TEST_CONTEXT
  let nodeReports
  let exitCode = 0
  let paths = [reportPath]
  if (check.runner === 'node-test') {
    // Native TAP has no passing-case file identity. Execute each explicit target
    // separately so only that target can receive credit from its own report.
    const isTarget = (arg) => !arg.startsWith('-') && PATH_LIKE.test(arg)
    const targets = [...new Set(argv.filter(isTarget))]
    paths = targets.map((_, index) => `${reportPath}.${index}.tap`)
    nodeReports = []
    for (const [index, target] of targets.entries()) {
      const singleArgv = argv.filter((arg) => !isTarget(arg) || arg === target)
      const single = planCommand({ argv: singleArgv, runner: check.runner, root, reportPath: paths[index] })
      rmSync(paths[index], { force: true })
      if (!('executable' in single)) {
        problems.push(...single.problems)
        exitCode = 1
        continue
      }
      log(`required-check ${task}/${checkId} file ${target}: ${[single.executable, ...single.args].join(' ')}`)
      const child = spawnSync(single.executable, single.args, { cwd: root, env, stdio, maxBuffer: 64 * 1024 * 1024 })
      if (child.status !== 0) exitCode = child.status ?? 1
      if (child.error) problems.push(`the runner could not start: ${child.error.message}`)
      const written = existsSync(paths[index])
      nodeReports.push({ file: toPosix(relative(root, resolve(root, target))), text: written ? readFileSync(paths[index], 'utf8') : null, writtenAt: written ? statSync(paths[index]).mtimeMs : null, exitCode: child.status })
    }
  } else {
    const child = spawnSync(plan.executable, plan.args, { cwd: root, env, stdio, maxBuffer: 64 * 1024 * 1024 })
    exitCode = child.status
    if (child.error) problems.push(`the runner could not start: ${child.error.message}`)
  }
  result.exitCode = exitCode
  result.finishedAt = new Date(clock()).toISOString()
  result.nativeReports = paths.filter(existsSync).map((path) => toPosix(relative(root, path)))
  result.nativeReport = result.nativeReports[0] ?? null
  const written = existsSync(paths[0])
  const verdict = evaluateRun({
    check,
    exitCode,
    reportText: written ? readFileSync(paths[0], 'utf8') : null,
    reportWrittenAt: written ? statSync(paths[0]).mtimeMs : null,
    runStartedAt,
    root,
    nodeReports,
  })
  problems.push(...verdict.problems)
  result.totals = verdict.totals
  result.requiredCases = verdict.requiredResults
  return finish()
}

/** @param {string[]} argv */
export function parseArguments(argv) {
  const split = argv.indexOf('--')
  const own = split === -1 ? argv : argv.slice(0, split)
  const command = split === -1 ? [] : argv.slice(split + 1)
  /** @type {Record<string, string>} */
  const options = {}
  for (let index = 0; index < own.length; index++) {
    const match = /^--(task|check|manifest|results-dir|root)$/.exec(own[index])
    if (!match || own[index + 1] === undefined) throw new Error(`unexpected argument "${own[index]}"`)
    options[match[1]] = own[++index]
  }
  if (!options.task || !options.check) throw new Error('--task and --check are required')
  return { options, command }
}

/** @param {string[]} argv */
export function main(argv) {
  let parsed
  try {
    parsed = parseArguments(argv)
  } catch (error) {
    process.stderr.write(
      `${/** @type {Error} */ (error).message}\nusage: run-required-check.mjs --task TASK-0NN --check <id> [--manifest <path>] [--results-dir <dir>] -- <command>\n`,
    )
    return 2
  }
  const { options, command } = parsed
  const root = options.root ? resolve(options.root) : REPO_ROOT
  const result = runRequiredCheck({
    task: options.task,
    check: options.check,
    argv: command,
    root,
    manifestPath: options.manifest ? resolve(options.manifest) : undefined,
    resultsDir: options['results-dir'] ? resolve(options['results-dir']) : undefined,
  })
  const required = /** @type {{ status: string }[]} */ (result.requiredCases)
  const passed = required.filter((c) => c.status === 'passed').length
  if (result.status === 'passed') {
    process.stdout.write(
      `required-check ${result.task}/${result.check}: PASSED — ${passed}/${required.length} required case(s) passed; ${result.totals?.executed ?? 0} executed\n`,
    )
    return 0
  }
  process.stdout.write(`required-check ${result.task}/${result.check}: FAILED\n`)
  for (const problem of result.problems) process.stdout.write(`  - ${problem}\n`)
  return 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2))
}
