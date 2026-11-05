/**
 * REQ-040 / TASK-039 — read the reports the installed runners write natively.
 *
 * Three formats, one shape. Each parser takes the report exactly as the runner
 * wrote it and returns the cases it names, so the guard in
 * `run-required-check.mjs` can ask the same questions of any of them: did the
 * run execute anything, did every case skip, and did each declared required
 * case pass. No parser invents a case the report does not contain, and none
 * reads a report written by anything other than the runner itself.
 *
 *  * Node's test runner — the TAP reporter (`--test-reporter=tap`).
 *  * Vitest — the JSON reporter (`--reporter=json`).
 *  * Playwright — the JSON reporter (`--reporter=json`).
 *
 * @typedef {'passed' | 'failed' | 'skipped' | 'todo'} CaseStatus
 *
 * @typedef {object} NativeCase
 * @property {string | null} file repository-relative; null when the format
 *   does not attribute a case to a file (Node TAP does not, for a pass)
 * @property {string} name ancestor titles and the case title, joined by ' > '
 * @property {CaseStatus} status
 * @property {string} [project] the Playwright project the case ran under
 *
 * @typedef {object} NativeReport
 * @property {NativeCase[]} cases leaf cases only; suites are not cases
 * @property {number | null} startedAt epoch ms the runner says it started, if it says
 * @property {string[]} problems what makes the report itself unusable
 */

import { isAbsolute, relative, resolve, sep } from 'node:path'

export const NAME_SEPARATOR = ' > '

/** @param {string} path */
const toPosix = (path) => path.split(sep).join('/')

/**
 * @param {string} root
 * @param {string} file absolute, or relative to `base`
 * @param {string} [base]
 */
const repoRelative = (root, file, base = root) =>
  toPosix(relative(root, isAbsolute(file) ? file : resolve(base, file)))

/** TAP escapes `#` and `\` inside a description. */
const unescapeTap = (/** @type {string} */ text) => text.replace(/\\([\\#])/g, '$1')

const TAP_RESULT = /^(not ok|ok) \d+(?: - (.*))?$/
const TAP_DIRECTIVE = /\s#\s(SKIP|TODO)\b.*$/i

/**
 * Node's TAP: `# Subtest: <name>` opens a test at an indent of four spaces per
 * level, `ok`/`not ok` closes it, and the YAML block after the result says
 * whether it was a `suite` or a `test`.
 *
 * @param {string} text
 * @returns {NativeReport}
 */
export function parseNodeTap(text) {
  /** @type {NativeCase[]} */
  const cases = []
  /** @type {string[]} */
  const problems = []
  /** @type {string[]} */
  const open = []
  const lines = text.split(/\r?\n/)
  if (!lines.some((line) => line.trim() === 'TAP version 13')) {
    return { cases, startedAt: null, problems: ['not a TAP report (no "TAP version 13" line)'] }
  }
  let summarised = false

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const indent = line.length - line.trimStart().length
    const level = Math.floor(indent / 4)
    const body = line.trim()

    if (body.startsWith('# Subtest: ')) {
      open.length = level
      open[level] = unescapeTap(body.slice('# Subtest: '.length))
      continue
    }
    if (level === 0 && /^# tests \d+$/.test(body)) summarised = true

    const result = TAP_RESULT.exec(body)
    if (!result) continue
    const raw = result[2] ?? ''
    const directive = TAP_DIRECTIVE.exec(raw)
    const title = unescapeTap(directive ? raw.slice(0, directive.index) : raw)

    let type = null
    if (lines[index + 1]?.trim() === '---') {
      for (let yaml = index + 2; yaml < lines.length && lines[yaml].trim() !== '...'; yaml++) {
        const match = /^type: '(\w+)'$/.exec(lines[yaml].trim())
        if (match) type = match[1]
      }
    }
    // A suite is reported after its children; it is a grouping, not a case.
    if (type === 'suite') continue

    /** @type {CaseStatus} */
    let status = result[1] === 'ok' ? 'passed' : 'failed'
    if (directive?.[1].toUpperCase() === 'SKIP') status = 'skipped'
    if (directive?.[1].toUpperCase() === 'TODO') status = 'todo'
    cases.push({ file: null, name: [...open.slice(0, level), title].join(NAME_SEPARATOR), status })
  }

  if (!summarised) problems.push('TAP report has no "# tests" summary; the run did not finish')
  return { cases, startedAt: null, problems }
}

/** @type {Record<string, CaseStatus>} */
const VITEST_STATUS = {
  passed: 'passed',
  failed: 'failed',
  skipped: 'skipped',
  pending: 'skipped',
  disabled: 'skipped',
  todo: 'todo',
}

/**
 * Vitest's JSON reporter (the Jest-compatible shape): one `testResults` entry
 * per file, named by absolute path, each with its `assertionResults`.
 *
 * @param {string} text
 * @param {string} root repository root
 * @returns {NativeReport}
 */
export function parseVitestJson(text, root) {
  /** @type {NativeCase[]} */
  const cases = []
  /** @type {string[]} */
  const problems = []
  let report
  try {
    report = JSON.parse(text)
  } catch {
    return { cases, startedAt: null, problems: ['Vitest report is not JSON'] }
  }
  if (!report || !Array.isArray(report.testResults)) {
    return { cases, startedAt: null, problems: ['Vitest report has no testResults'] }
  }
  for (const fileResult of report.testResults) {
    const file = repoRelative(root, String(fileResult.name))
    const assertions = Array.isArray(fileResult.assertionResults) ? fileResult.assertionResults : []
    // A file that failed to load reports no assertions, only its own failure.
    if (assertions.length === 0 && fileResult.status === 'failed') {
      cases.push({ file, name: file, status: 'failed' })
    }
    for (const assertion of assertions) {
      const titles = [...(assertion.ancestorTitles ?? []), assertion.title]
      cases.push({
        file,
        name: titles.join(NAME_SEPARATOR),
        status: VITEST_STATUS[assertion.status] ?? 'failed',
      })
    }
  }
  const startedAt = typeof report.startTime === 'number' ? report.startTime : null
  return { cases, startedAt, problems }
}

/**
 * Playwright's JSON reporter: suites nest from the file down through each
 * `describe`; a spec holds one test per project. A flaky result passed only on
 * a retry and is held as a failure, as the GR-06 browser lane holds it.
 *
 * @param {string} text
 * @param {string} root repository root
 * @returns {NativeReport}
 */
export function parsePlaywrightJson(text, root) {
  /** @type {NativeCase[]} */
  const cases = []
  /** @type {string[]} */
  const problems = []
  let report
  try {
    report = JSON.parse(text)
  } catch {
    return { cases, startedAt: null, problems: ['Playwright report is not JSON'] }
  }
  if (!report || !Array.isArray(report.suites) || !report.stats) {
    return { cases, startedAt: null, problems: ['Playwright report has no suites or stats'] }
  }
  const base = typeof report.config?.rootDir === 'string' ? report.config.rootDir : root
  for (const error of report.errors ?? []) {
    problems.push(`Playwright reported an error outside any test: ${String(error?.message ?? error).split('\n')[0]}`)
  }

  /**
   * @param {any} suite
   * @param {string[]} titles describe titles below the file
   * @param {boolean} isFile
   */
  const walk = (suite, titles, isFile) => {
    const own = isFile ? titles : [...titles, suite.title]
    for (const spec of suite.specs ?? []) {
      const file = repoRelative(root, String(spec.file ?? suite.file), base)
      for (const test of spec.tests ?? []) {
        /** @type {CaseStatus} */
        let status = 'failed'
        const results = Array.isArray(test.results) ? test.results : []
        if (test.status === 'expected' && test.expectedStatus === 'passed' &&
            results.length > 0 && results.every((result) => result.status === 'passed')) status = 'passed'
        else if (test.status === 'skipped' || test.expectedStatus === 'skipped') status = 'skipped'
        cases.push({
          file,
          name: [...own, spec.title].join(NAME_SEPARATOR),
          status,
          ...(test.projectName ? { project: String(test.projectName) } : {}),
        })
      }
    }
    for (const child of suite.suites ?? []) walk(child, own, false)
  }
  for (const suite of report.suites) walk(suite, [], true)

  const parsed = Date.parse(String(report.stats.startTime))
  return { cases, startedAt: Number.isNaN(parsed) ? null : parsed, problems }
}

/**
 * @param {'node-test' | 'vitest' | 'playwright'} runner
 * @param {string} text
 * @param {string} root
 * @returns {NativeReport}
 */
export function parseNativeReport(runner, text, root) {
  if (runner === 'node-test') return parseNodeTap(text)
  if (runner === 'vitest') return parseVitestJson(text, root)
  if (runner === 'playwright') return parsePlaywrightJson(text, root)
  return { cases: [], startedAt: null, problems: [`unknown runner "${String(runner)}"`] }
}
