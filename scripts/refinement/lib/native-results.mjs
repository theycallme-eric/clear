// Parsers for the native result formats of the three installed runners.
//
// Each parser turns one runner's own report into the same small shape:
//   { cases: [{ file, name, project, status }], startTime }
// where `status` is one of passed | failed | skipped | todo, `file` is
// repository-relative (or null when the format cannot attribute it), and
// `name` joins the describe/suite titles and the case title with " > ".
//
// Formats were rehearsed against the installed versions (Vitest 4.1 JSON,
// Playwright 1.63 JSON, Node 24 node:test TAP). Points that matter for
// strictness are noted inline; they are the reason a naive check passes.

import { isAbsolute, relative, resolve } from 'node:path'

export const NAME_SEPARATOR = ' > '

function toRepoPath(cwd, file) {
  const absolute = isAbsolute(file) ? file : resolve(cwd, file)
  return relative(cwd, absolute).split('\\').join('/')
}

/**
 * Vitest `--reporter=json`. `testResults[].name` is the absolute file path.
 * Filtered-out cases (`--testNamePattern`) appear with status `skipped`, and
 * `it.todo` appears as `todo`; neither is an executed pass.
 */
export function parseVitestJson(text, { cwd }) {
  const report = JSON.parse(text)
  if (!report || !Array.isArray(report.testResults)) {
    throw new Error('Vitest report has no testResults array')
  }
  const cases = []
  const fileErrors = []
  for (const fileResult of report.testResults) {
    const file = toRepoPath(cwd, fileResult.name)
    // A file that fails to import has status failed and no assertions.
    if (fileResult.status === 'failed' && (fileResult.assertionResults ?? []).length === 0) {
      fileErrors.push(`${file}: file failed before any case ran`)
    }
    for (const assertion of fileResult.assertionResults ?? []) {
      const titles = [...(assertion.ancestorTitles ?? []), assertion.title]
      cases.push({
        file,
        name: titles.join(NAME_SEPARATOR),
        project: null,
        status: normaliseVitestStatus(assertion.status),
      })
    }
  }
  return {
    format: 'vitest-json',
    cases,
    fileErrors,
    startTime: typeof report.startTime === 'number' ? report.startTime : null,
  }
}

function normaliseVitestStatus(status) {
  if (status === 'passed') return 'passed'
  if (status === 'failed') return 'failed'
  if (status === 'todo') return 'todo'
  // skipped, pending, disabled and anything new are not executed passes.
  return 'skipped'
}

/**
 * Playwright `--reporter=json`. Top-level suites are files; `spec.file` is
 * relative to `config.rootDir`. A skipped spec still has `ok: true`, so `ok`
 * is never used as proof. A case passes only when the test's outcome is
 * `expected`, its expected status is `passed`, and its final result passed.
 * `flaky` (failed, then passed on retry) is reported as failed.
 */
export function parsePlaywrightJson(text, { cwd }) {
  const report = JSON.parse(text)
  if (!report || !Array.isArray(report.suites)) {
    throw new Error('Playwright report has no suites array')
  }
  const rootDir = report.config?.rootDir ?? cwd
  const cases = []
  const visit = (suite, titles, isFileSuite) => {
    const nextTitles = isFileSuite ? titles : [...titles, suite.title]
    for (const spec of suite.specs ?? []) {
      const file = toRepoPath(cwd, resolve(rootDir, spec.file ?? suite.file))
      for (const test of spec.tests ?? []) {
        cases.push({
          file,
          name: [...nextTitles, spec.title].join(NAME_SEPARATOR),
          project: test.projectName ?? null,
          status: playwrightStatus(test),
        })
      }
    }
    for (const child of suite.suites ?? []) visit(child, nextTitles, false)
  }
  for (const suite of report.suites) visit(suite, [], true)
  const errors = Array.isArray(report.errors) ? report.errors : []
  const startTime = report.stats?.startTime ? Date.parse(report.stats.startTime) : null
  return {
    format: 'playwright-json',
    cases,
    fileErrors: errors.map((error) => `runner error: ${String(error?.message ?? error).split('\n')[0]}`),
    startTime: Number.isFinite(startTime) ? startTime : null,
  }
}

function playwrightStatus(test) {
  const results = test.results ?? []
  const last = results[results.length - 1]
  if (test.status === 'skipped' || test.expectedStatus === 'skipped') return 'skipped'
  if (
    test.status === 'expected' &&
    test.expectedStatus === 'passed' &&
    last?.status === 'passed'
  ) {
    return 'passed'
  }
  if (!last) return 'skipped'
  return 'failed'
}

/**
 * Node `--test-reporter=tap` (TAP version 13 as written by node:test).
 * Nesting is four spaces per level. `# Subtest: <name>` opens a case and
 * `ok N - <name>` / `not ok N - <name>` closes it, followed by an indented
 * YAML block carrying `type: 'suite'|'test'`. Directives are ` # SKIP` and
 * ` # TODO`; a TODO case reports `ok` but is not an executed pass. Names
 * escape `#` as `\#` and `\` as `\\`.
 *
 * Node gives a passing case no file location, so a single-target run
 * attributes every case to that target. With several targets `file` is null.
 *
 * Node also turns a target file with no tests into one passing case named
 * after the file; callers must treat that synthetic entry as zero execution.
 */
export function parseNodeTap(text, { targets = [] } = {}) {
  const lines = text.split(/\r?\n/)
  if (!lines.some((line) => /^TAP version \d+/.test(line))) {
    throw new Error('Node test report is not TAP output')
  }
  const subtests = []
  const entries = []
  let bailedOut = false
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const indent = line.length - line.trimStart().length
    const level = Math.floor(indent / 4)
    const body = line.trimStart()
    if (/^Bail out!/.test(body)) bailedOut = true
    const subtest = /^# Subtest: (.*)$/.exec(body)
    if (subtest && indent % 4 === 0) {
      subtests.length = level
      subtests[level] = unescapeTapName(subtest[1])
      continue
    }
    const result = /^(not ok|ok) \d+(?: - (.*))?$/.exec(body)
    if (!result || indent % 4 !== 0) continue
    const { name, directive } = splitTapDescription(result[2] ?? '')
    // Read the YAML block for `type`.
    let type = 'test'
    if (lines[index + 1]?.trim() === '---') {
      for (let cursor = index + 2; cursor < lines.length; cursor += 1) {
        const yaml = lines[cursor].trim()
        if (yaml === '...') break
        const typeMatch = /^type: '(suite|test)'$/.exec(yaml)
        if (typeMatch) type = typeMatch[1]
      }
    }
    const ancestors = subtests.slice(0, level)
    const hasChildren = entries.some((entry) => entry.level === level + 1 && entry.parentKey === keyOf(ancestors, name))
    entries.push({
      level,
      parentKey: keyOf(ancestors.slice(0, -1), ancestors[ancestors.length - 1]),
      titles: [...ancestors, name],
      ok: result[1] === 'ok',
      directive,
      type,
      hasChildren,
    })
    subtests.length = level
  }
  const singleTarget = targets.length === 1 ? targets[0] : null
  const targetNames = new Set(targets.flatMap((target) => [target, target.split('/').pop()]))
  const cases = []
  for (const entry of entries) {
    if (entry.type === 'suite' || entry.hasChildren) continue
    const name = entry.titles.join(NAME_SEPARATOR)
    // Synthetic entry for a target file that declared no tests.
    const synthetic = entry.level === 0 && targetNames.has(name)
    let status
    if (!entry.ok) status = 'failed'
    else if (entry.directive === 'SKIP') status = 'skipped'
    else if (entry.directive === 'TODO') status = 'todo'
    else status = 'passed'
    cases.push({ file: singleTarget, name, project: null, status, synthetic })
  }
  return {
    format: 'node-tap',
    cases: cases.filter((testCase) => !testCase.synthetic).map(({ synthetic, ...rest }) => rest),
    syntheticFileCases: cases.filter((testCase) => testCase.synthetic).map((testCase) => testCase.name),
    fileErrors: bailedOut ? ['TAP stream bailed out'] : [],
    startTime: null,
  }
}

function keyOf(ancestors, name) {
  return JSON.stringify([...ancestors, name])
}

function unescapeTapName(raw) {
  let out = ''
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]
    if (char === '\\' && index + 1 < raw.length) {
      const next = raw[index + 1]
      if (next === 'n') out += '\n'
      else if (next === 'r') out += '\r'
      else if (next === 't') out += '\t'
      else out += next
      index += 1
    } else {
      out += char
    }
  }
  return out
}

function splitTapDescription(description) {
  // Find the first unescaped " # " that introduces a directive.
  for (let index = 0; index < description.length; index += 1) {
    if (description[index] === '\\') {
      index += 1
      continue
    }
    if (description[index] === '#' && description[index - 1] === ' ') {
      const rest = description.slice(index + 1).trim()
      const directive = /^(SKIP|TODO)\b/i.exec(rest)
      if (directive) {
        return {
          name: unescapeTapName(description.slice(0, index - 1)),
          directive: directive[1].toUpperCase(),
        }
      }
    }
  }
  return { name: unescapeTapName(description), directive: null }
}
