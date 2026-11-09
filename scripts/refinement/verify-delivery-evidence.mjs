#!/usr/bin/env node
// Shared delivery-evidence checker for the clear-refinement-20261103 body (TASK-039).
//
// Modes (each separate; baseline and references never need a delivery receipt):
//
//   --mode baseline [--require-current-source]
//       Verify the live integration base (selected base commit present and an
//       ancestor of HEAD, Foundation 0.14.3 unchanged, historical comparison
//       commits recorded as history) and validate any task required-case
//       manifests. With --require-current-source, also verify every staged
//       source/visual reference byte-for-byte against its pinned hashes.
//
//   --mode references [--reference <id>] [--show <path>]
//       Verify staged references (all, or one) and print the gallery commit,
//       state map, shared owners and token/field guides with their resolved
//       locations. --show writes one resolved reference file to stdout.
//
//   --mode final [--tasks TASK-001,TASK-002 | --all-tasks]
//       Aggregate closure: baseline + every reference, then for each task
//       every declared check needs a current passing receipt (manifest and
//       target hashes unchanged since the run; all required cases passed).
//       Setup-purpose checks never count as delivery.
//
// Common options: --body <id> (required), --evidence-root <dir>, --json.
//
// Staged reference objects are not in Git (owner decision 2026-11-09). They
// are read from the project-level reference object store:
// $CLEAR_REFINEMENT_EVIDENCE_DIR, or <project>/evidence-store for a worktree at
// <project>/runner-v2/<runner body>/worktrees/<task> (no body-level fallback).
// Without the store every mode that verifies references fails closed.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { loadBody, OBJECT_STORE_ENV, resolveObjectStore, verifyBaseline, verifyReferences } from './lib/references.mjs'
import { manifestPathFor, validateManifest, verifyReceipt } from './lib/required-check.mjs'

export function parseArgs(argv) {
  const options = { requireCurrentSource: false, json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--body') options.body = argv[++index]
    else if (arg === '--mode') options.mode = argv[++index]
    else if (arg === '--require-current-source') options.requireCurrentSource = true
    else if (arg === '--reference') options.reference = argv[++index]
    else if (arg === '--show') options.show = argv[++index]
    else if (arg === '--tasks') options.tasks = argv[++index].split(',').map((task) => task.trim()).filter(Boolean)
    else if (arg === '--all-tasks') options.allTasks = true
    else if (arg === '--evidence-root') options.evidenceRoot = argv[++index]
    else if (arg === '--json') options.json = true
    else throw new Error(`unknown option ${arg}`)
  }
  if (!options.body) throw new Error('--body is required')
  if (!['baseline', 'references', 'final'].includes(options.mode)) throw new Error('--mode must be baseline, references or final')
  if (options.mode === 'final' && !options.tasks && !options.allTasks) throw new Error('final mode needs --tasks or --all-tasks')
  return options
}

function taskManifests(cwd, evidenceRoot) {
  if (!existsSync(evidenceRoot)) return []
  return readdirSync(evidenceRoot)
    .filter((name) => /^task-\d{3}$/.test(name) && existsSync(join(evidenceRoot, name, 'required-cases.json')))
    .map((name) => name.toUpperCase())
    .sort()
}

function checkManifest(evidenceRoot, task) {
  const path = manifestPathFor(evidenceRoot, task)
  if (!existsSync(path)) return { path, manifest: null, problems: [`${task}: required-case manifest is absent`] }
  let manifest
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    return { path, manifest: null, problems: [`${task}: manifest is not valid JSON: ${error.message}`] }
  }
  return { path, manifest, problems: validateManifest(manifest, { task }).map((problem) => `${task}: ${problem}`) }
}

/** Run one mode. Pure apart from reading files and git. */
export function verifyDeliveryEvidence({ cwd = process.cwd(), evidenceRoot, body, mode, requireCurrentSource = false, reference, tasks, allTasks, env = process.env, store }) {
  const root = evidenceRoot ?? resolve(cwd, 'evidence/refinement')
  const problems = []
  const report = { body, mode }
  const loaded = loadBody({ evidenceRoot: root, body })
  problems.push(...loaded.problems)
  if (!loaded.record) return { ok: false, problems, report }

  if (mode === 'baseline' || mode === 'final') {
    const baseline = verifyBaseline({ cwd, record: loaded.record })
    problems.push(...baseline.problems)
    report.baseline = baseline.facts
    const manifests = taskManifests(cwd, root)
    report.taskManifests = manifests
    for (const task of manifests) problems.push(...checkManifest(root, task).problems)
  }

  if (mode === 'references' || mode === 'final' || (mode === 'baseline' && requireCurrentSource)) {
    const objectStore = store ?? resolveObjectStore({ cwd, env })
    report.objectStore = { source: objectStore.source, dir: objectStore.dir, available: !objectStore.problem }
    const verified = verifyReferences({ cwd, evidenceRoot: root, body, only: mode === 'references' ? reference : undefined, store: objectStore })
    problems.push(...verified.problems.filter((problem) => !loaded.problems.includes(problem)))
    report.acceptedGallery = loaded.record.acceptedGallery
    report.references = verified.references.map(({ id, result }) => ({
      id,
      role: result.record?.role,
      identity: result.record?.identity,
      files: result.files.size,
      resolvedFromStagedObjects: [...result.files.values()].filter((file) => !file.location.startsWith('git:')).length,
      resolvedFromIntegrationBase: [...result.files.values()].filter((file) => file.location.startsWith('git:')).length,
      guides: result.guides,
    }))
    report._resolved = verified.references
    // Reconcile historical comparison identities with their staged SOURCE.json.
    for (const historical of loaded.record.historicalComparisons ?? []) {
      const ref = verified.references.find(({ id }) => id === historical.reference)
      if (!ref) continue
      const source = ref.result.files.get(`${historical.id}/SOURCE.json`)
      if (!source) {
        problems.push(`historical source ${historical.id} has no staged SOURCE.json`)
        continue
      }
      const commit = JSON.parse(source.bytes.toString('utf8')).commit
      if (commit !== historical.commit) problems.push(`historical source ${historical.id} staged commit ${commit} is not ${historical.commit}`)
    }
  }

  if (mode === 'final') {
    const selected = allTasks ? taskManifests(cwd, root) : tasks
    if (selected.length === 0) problems.push('final mode found no task evidence to aggregate')
    report.tasks = []
    for (const task of selected) {
      const { path, manifest, problems: manifestProblems } = checkManifest(root, task)
      if (manifestProblems.length) {
        problems.push(...manifestProblems)
        report.tasks.push({ task, ok: false })
        continue
      }
      const taskProblems = []
      let deliveryChecks = 0
      for (const [checkId, check] of Object.entries(manifest.checks)) {
        if (check.purpose === 'setup') continue
        deliveryChecks += 1
        taskProblems.push(...verifyReceipt({ cwd, evidenceRoot: root, task, checkId, check, manifestPath: path }))
      }
      if (deliveryChecks === 0) taskProblems.push(`${task}: declares only setup checks; a baseline/setup receipt is not delivery evidence`)
      problems.push(...taskProblems)
      report.tasks.push({ task, ok: taskProblems.length === 0, deliveryChecks })
    }
  }

  return { ok: problems.length === 0, problems, report }
}

function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`verify-delivery-evidence: ${error.message}\n`)
    process.exit(2)
  }
  const cwd = process.cwd()
  const result = verifyDeliveryEvidence({
    cwd,
    evidenceRoot: options.evidenceRoot ? resolve(cwd, options.evidenceRoot) : undefined,
    body: options.body,
    mode: options.mode,
    requireCurrentSource: options.requireCurrentSource,
    reference: options.reference,
    tasks: options.tasks,
    allTasks: options.allTasks,
  })
  const resolvedRefs = result.report._resolved ?? []
  delete result.report._resolved

  if (options.show) {
    for (const { result: ref } of resolvedRefs) {
      const file = ref.files.get(options.show)
      if (file) {
        process.stdout.write(file.bytes)
        process.exit(result.ok ? 0 : 1)
      }
    }
    process.stderr.write(`verify-delivery-evidence: ${options.show} is not a verified staged reference file\n`)
    process.exit(1)
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ ok: result.ok, problems: result.problems, ...result.report }, null, 2)}\n`)
  } else {
    const lines = [`delivery evidence ${options.body} --mode ${options.mode}: ${result.ok ? 'PASSED' : 'REJECTED'}`]
    const baseline = result.report.baseline
    if (baseline) {
      lines.push(`  HEAD ${baseline.head} descends from integration base ${baseline.integrationBase}`)
      if (baseline.foundation) lines.push(`  Foundation ${baseline.foundation.path} ${baseline.foundation.version}, unchanged from base: ${baseline.foundation.unchangedFromBase}`)
      for (const historical of baseline.historicalComparisons ?? []) lines.push(`  historical ${historical.id} ${historical.commit}: ${historical.relation}`)
      lines.push(`  task manifests: ${result.report.taskManifests.join(', ') || 'none'}`)
    }
    if (result.report.objectStore) {
      const store = result.report.objectStore
      lines.push(`  reference object store (${store.source}): ${store.dir ?? 'not located'}${store.available ? '' : ` [ABSENT; set ${OBJECT_STORE_ENV}]`}`)
    }
    if (result.report.acceptedGallery) lines.push(`  accepted gallery commit: ${result.report.acceptedGallery.commit}`)
    for (const ref of result.report.references ?? []) {
      lines.push(`  reference ${ref.id}: ${ref.files} files verified (${ref.resolvedFromStagedObjects} staged, ${ref.resolvedFromIntegrationBase} from integration base)`)
      for (const [name, guide] of Object.entries(ref.guides ?? {})) lines.push(`    ${name}: ${guide.path} -> ${guide.location}`)
    }
    for (const task of result.report.tasks ?? []) lines.push(`  ${task.task}: ${task.ok ? 'current passing receipts' : 'incomplete'}`)
    for (const problem of result.problems) lines.push(`  problem: ${problem}`)
    process.stdout.write(`${lines.join('\n')}\n`)
  }
  process.exit(result.ok ? 0 : 1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
