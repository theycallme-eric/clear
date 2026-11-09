#!/usr/bin/env node
// Shared definition-record checker for the clear-refinement-20261103 body (TASK-039).
//
// Definition tasks (TASK-035, TASK-037, TASK-038) each own one namespaced
// Markdown record; this checker owns only the structure and source checks.
//
//   node scripts/refinement/verify-definition-record.mjs --task TASK-035 \
//     [--record docs/definitions/clear-refinement-20261103/TASK-035.md] \
//     [--require-section "Future targets"] [--body clear-refinement-20261103]
//
// A record passes only when:
//   - its header lines identify the task, its requirement(s), the body,
//     `Status: definition-only` and `Implementation claim: none`;
//   - every required section exists with substantive content:
//     Scope, Sources, Current observations, Options, Open owner decisions,
//     Limitations, Traceability (plus any --require-section);
//   - every Sources bullet names a locator and sha256 that verify:
//       repo:<path>              current working-tree file
//       base:<path>              blob at the body's integration base
//       ref:<referenceId>/<path> verified staged reference file
//   - Open owner decisions has at least one entry naming `Owner:` and `Decision:`;
//   - Traceability names the task id and a source or criterion id;
//   - it contains no placeholder text (TODO, TBD, lorem ipsum, FIXME, XXX).

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { loadBody, readBaseBlobs, verifyReferences } from './lib/references.mjs'
import { sha256, taskDirName } from './lib/required-check.mjs'

export const DEFAULT_BODY = 'clear-refinement-20261103'
export const REQUIRED_SECTIONS = [
  'Scope',
  'Sources',
  'Current observations',
  'Options',
  'Open owner decisions',
  'Limitations',
  'Traceability',
]
const PLACEHOLDER = /\b(TODO|TBD|FIXME|XXX)\b|lorem ipsum/i
const SOURCE_LINE = /^[-*]\s+`(repo|base|ref):([^`]+)`\s+sha256\s+`([0-9a-f]{64})`/

export function defaultRecordPath(task, body = DEFAULT_BODY) {
  taskDirName(task)
  return `docs/definitions/${body}/${task}.md`
}

export function parseRecord(text) {
  const lines = text.split(/\r?\n/)
  const header = {}
  const sections = new Map()
  let current = null
  for (const line of lines) {
    const heading = /^##\s+(.+?)\s*$/.exec(line)
    if (heading) {
      current = heading[1]
      if (!sections.has(current)) sections.set(current, [])
      continue
    }
    if (current === null) {
      const field = /^([A-Z][A-Za-z ]+):\s*(.+?)\s*$/.exec(line)
      if (field) header[field[1].toLowerCase()] = field[2]
      continue
    }
    sections.get(current).push(line)
  }
  return { header, sections }
}

function substantive(lines) {
  return lines.map((line) => line.replace(/^[-*>\s]+/, '').trim()).filter((line) => line.length >= 12)
}

export function verifyDefinitionRecord({ cwd = process.cwd(), task, record, requireSections = [], body = DEFAULT_BODY, evidenceRoot }) {
  const problems = []
  const recordPath = record ?? defaultRecordPath(task, body)
  const absolute = resolve(cwd, recordPath)
  if (!existsSync(absolute)) return { ok: false, problems: [`definition record is absent: ${recordPath}`], sources: [] }
  const text = readFileSync(absolute, 'utf8')
  const { header, sections } = parseRecord(text)

  if (header.task !== task) problems.push(`header "Task:" must be ${task}`)
  if (!/^REQ-\d{3}(\s*,\s*REQ-\d{3})*$/.test(header.requirement ?? '')) problems.push('header "Requirement:" must list REQ-NNN ids')
  if (header.body !== body) problems.push(`header "Body:" must be ${body}`)
  if (header.status !== 'definition-only') problems.push('header "Status:" must be definition-only')
  if (header['implementation claim'] !== 'none') {
    problems.push('header "Implementation claim:" must be none; a definition record cannot claim an implemented feature')
  }
  const placeholder = text.split(/\r?\n/).find((line) => PLACEHOLDER.test(line))
  if (placeholder) problems.push(`placeholder text is not a definition: "${placeholder.trim()}"`)

  for (const name of [...REQUIRED_SECTIONS, ...requireSections]) {
    const lines = sections.get(name)
    if (!lines) problems.push(`section "## ${name}" is missing`)
    else if (substantive(lines).length === 0) problems.push(`section "## ${name}" has no substantive content`)
  }

  const decisions = sections.get('Open owner decisions') ?? []
  const decisionText = decisions.join('\n')
  if (decisions.length && (!/Owner:\s*\S/.test(decisionText) || !/Decision:\s*\S/.test(decisionText))) {
    problems.push('section "Open owner decisions" must name an Owner: and the exact Decision:')
  }
  const trace = (sections.get('Traceability') ?? []).join('\n')
  if (sections.has('Traceability') && (!trace.includes(task) || !/\b(R\d{2,3}|REQ-\d{3}|AC-[A-Z0-9-]+|EVID-[0-9A-F]+)\b/.test(trace))) {
    problems.push('section "Traceability" must name the task and at least one source or criterion id')
  }

  // Sources: every bullet must be a verifiable locator + sha256.
  const sourceLines = (sections.get('Sources') ?? []).filter((line) => /^[-*]\s+/.test(line))
  if (sections.has('Sources') && sourceLines.length === 0) problems.push('section "Sources" lists no sources')
  const sources = []
  let baseRecord = null
  let references = null
  for (const line of sourceLines) {
    const match = SOURCE_LINE.exec(line)
    if (!match) {
      problems.push(`source line is not "- \`repo|base|ref:<path>\` sha256 \`<hex>\`": ${line.trim()}`)
      continue
    }
    const [, kind, path, expected] = match
    let bytes = null
    if (kind === 'repo') {
      const file = resolve(cwd, path)
      if (path.startsWith('/') || path.includes('..')) problems.push(`repo source must be repository-relative: ${path}`)
      else if (existsSync(file)) bytes = readFileSync(file)
    } else {
      const root = evidenceRoot ?? resolve(cwd, 'evidence/refinement')
      if (kind === 'base') {
        baseRecord ??= loadBody({ evidenceRoot: root, body }).record
        if (baseRecord) bytes = readBaseBlobs(cwd, baseRecord.integrationBase.commit, [path]).get(path) ?? null
      } else {
        references ??= verifyReferences({ cwd, evidenceRoot: root, body })
        const [id, ...rest] = path.split('/')
        const ref = references.references.find((candidate) => candidate.id === id)
        if (ref && ref.result.problems.length === 0) bytes = ref.result.files.get(rest.join('/'))?.bytes ?? null
      }
    }
    if (bytes === null) {
      problems.push(`source does not resolve: ${kind}:${path}`)
      continue
    }
    if (sha256(bytes) !== expected) problems.push(`source hash mismatch: ${kind}:${path}`)
    sources.push({ locator: `${kind}:${path}`, sha256: expected })
  }
  return { ok: problems.length === 0, problems, sources, recordPath }
}

function main() {
  const argv = process.argv.slice(2)
  const options = { requireSections: [] }
  try {
    for (let index = 0; index < argv.length; index += 1) {
      const arg = argv[index]
      if (arg === '--task') options.task = argv[++index]
      else if (arg === '--record') options.record = argv[++index]
      else if (arg === '--require-section') options.requireSections.push(argv[++index])
      else if (arg === '--body') options.body = argv[++index]
      else if (arg === '--evidence-root') options.evidenceRoot = resolve(argv[++index])
      else throw new Error(`unknown option ${arg}`)
    }
    if (!options.task) throw new Error('--task is required')
    taskDirName(options.task)
  } catch (error) {
    process.stderr.write(`verify-definition-record: ${error.message}\n`)
    process.exit(2)
  }
  const result = verifyDefinitionRecord(options)
  const lines = [`definition record ${options.task}: ${result.ok ? 'PASSED' : 'REJECTED'} (${result.recordPath ?? ''})`]
  for (const source of result.sources) lines.push(`  source ${source.locator} sha256 ${source.sha256}`)
  for (const problem of result.problems) lines.push(`  problem: ${problem}`)
  process.stdout.write(`${lines.join('\n')}\n`)
  process.exit(result.ok ? 0 : 1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
