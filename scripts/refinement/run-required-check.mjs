#!/usr/bin/env node
// Shared required-case guard for the clear-refinement-20261103 body (TASK-039).
//
//   node scripts/refinement/run-required-check.mjs --task TASK-001 --check check-01 -- \
//     npx vitest run src/ui/movement-list.test.tsx --passWithNoTests=false
//
// Reads evidence/refinement/<task>/required-cases.json, runs the command
// through the installed repository runner with a native JSON/TAP reporter,
// and exits 0 only when every requested file exists and every declared
// required case actually executed and passed. Writes the deterministic
// receipt evidence/refinement/<task>/results/<check>.json either way.
//
// Options (before --):
//   --task TASK-NNN       task id (required)
//   --check <id>          check id declared in the manifest (required)
//   --evidence-root <dir> default evidence/refinement (used by self-tests)
//   --no-receipt          do not write the receipt

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { runRequiredCheck } from './lib/required-check.mjs'

export function parseArgs(argv) {
  const separator = argv.indexOf('--')
  const own = separator === -1 ? argv : argv.slice(0, separator)
  const command = separator === -1 ? [] : argv.slice(separator + 1)
  const options = { command, writeReceipt: true }
  for (let index = 0; index < own.length; index += 1) {
    const arg = own[index]
    if (arg === '--task') options.task = own[++index]
    else if (arg === '--check') options.check = own[++index]
    else if (arg === '--evidence-root') options.evidenceRoot = own[++index]
    else if (arg === '--no-receipt') options.writeReceipt = false
    else throw new Error(`unknown option ${arg}`)
  }
  if (!options.task || !options.check) throw new Error('--task and --check are required')
  if (command.length === 0) throw new Error('give the test command after --')
  return options
}

function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`run-required-check: ${error.message}\n`)
    process.exit(2)
  }
  const cwd = process.cwd()
  const result = runRequiredCheck({
    cwd,
    evidenceRoot: options.evidenceRoot ? resolve(cwd, options.evidenceRoot) : undefined,
    task: options.task,
    check: options.check,
    command: options.command,
    writeReceipt: options.writeReceipt,
  })
  const { receipt } = result
  const lines = [`\nrequired-check ${options.task} ${options.check}: ${result.ok ? 'PASSED' : 'REJECTED'}`]
  if (receipt.totals) {
    const t = receipt.totals
    lines.push(`  native cases: ${t.total} total, ${t.executed} executed, ${t.passed} passed, ${t.failed} failed, ${t.skipped} skipped, ${t.todo} todo`)
  }
  for (const testCase of receipt.requiredCases) lines.push(`  [${testCase.status}] ${testCase.file} > ${testCase.name}`)
  for (const problem of result.problems) lines.push(`  problem: ${problem}`)
  if (result.receiptPath) lines.push(`  receipt: ${result.receiptPath}`)
  process.stdout.write(`${lines.join('\n')}\n`)
  process.exit(result.ok ? 0 : 1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
