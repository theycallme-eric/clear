/**
 * GR-06 / REQ-026 — run the deterministic lanes and record each pass against
 * the commit it ran on: `npm run gr:lanes`, or `npm run gr:lanes -- <lane>`.
 *
 * The records are what `e2e/core-loop.spec.ts` asks `release-gate.mjs` for
 * before it starts. A lane is recorded only when its own command passed on a
 * clean tree; the run stops at the first lane that did not, under that lane's
 * name, so the failing boundary is the last line printed.
 *
 * No lane here calls the provider, and the live-model opt-in is removed from
 * the environment each one runs in.
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { REPO_ROOT } from '../gen-types/schema.mjs'
import { RELEASE_LANES, browserLaneProblem, readCommit, recordLanePass } from './release-gate.mjs'

/**
 * Run one lane. Returns why it did not pass, or null.
 *
 * @param {import('./release-gate.mjs').ReleaseLane} lane
 */
function runLane(lane) {
  const env = { ...process.env }
  delete env.LIVE_MODEL_TESTS

  const scratch = lane.runner === 'playwright' ? mkdtempSync(join(tmpdir(), 'clear-lane-')) : null
  const report = scratch === null ? null : join(scratch, 'report.json')
  const [command, ...args] = lane.command
  if (report !== null) {
    args.push('--reporter=list,json')
    env.PLAYWRIGHT_JSON_OUTPUT_NAME = report
  }

  try {
    const run = spawnSync(command, args, { cwd: REPO_ROOT, env, stdio: 'inherit' })
    if (run.status !== 0) return `exited ${String(run.status ?? run.signal)}`
    if (report === null) return null
    try {
      return browserLaneProblem(JSON.parse(readFileSync(report, 'utf8')).stats)
    } catch {
      return 'the run reported no result'
    }
  } finally {
    if (scratch !== null) rmSync(scratch, { recursive: true, force: true })
  }
}

const requested = process.argv.slice(2).filter((argument) => !argument.startsWith('-'))
const unknown = requested.filter((id) => !RELEASE_LANES.some((lane) => lane.id === id))
if (unknown.length > 0) {
  console.error(
    `Unknown lane: ${unknown.join(', ')}. Lanes: ${RELEASE_LANES.map((lane) => lane.id).join(', ')}.`,
  )
  process.exit(2)
}

const { commit, dirty } = readCommit(REPO_ROOT)
if (dirty) {
  console.error(
    `The working tree has uncommitted changes, so a lane run here would not be a run of ${commit}. Commit or discard them first.`,
  )
  process.exit(1)
}

const lanes = RELEASE_LANES.filter((lane) => requested.length === 0 || requested.includes(lane.id))
for (const lane of lanes) {
  console.log(`\n── ${lane.name} (${commit.slice(0, 12)}) ──`)
  const problem = runLane(lane)
  if (problem !== null) {
    console.error(`\nThe ${lane.name} did not pass for ${commit}: ${problem}. Nothing was recorded for it.`)
    process.exit(1)
  }
  console.log(`The ${lane.name} passed: ${recordLanePass({ root: REPO_ROOT, lane: lane.id, commit })}`)
}
