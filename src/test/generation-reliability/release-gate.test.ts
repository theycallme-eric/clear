/**
 * GR-06 / REQ-024, REQ-026 — the release gate, the release evidence and the
 * policy that keeps the paid call out of everything routine.
 *
 * The release journey (`e2e/core-loop.spec.ts`) is the one place a generation
 * is paid for, so it cannot be run to find out whether it works. This suite
 * holds what surrounds it, without a browser, a database or a model:
 *
 *  * the gate refuses, naming the lane, unless the fast contract, composition
 *    and critical browser lanes each left a passing record for the exact
 *    commit — and the journey asks it before provisioning anything;
 *  * the evidence artifact is written for a pass and for every kind of failure
 *    and carries only its allow-listed fields, whatever it is handed;
 *  * no routine command — a package script, a CI job, a deterministic lane —
 *    sets the live-model opt-in or lets a generation request through.
 *
 * The journey itself is collected and never executed here.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../../../scripts/gen-types/schema.mjs'
import {
  EVIDENCE_DIR,
  EVIDENCE_FIELDS,
  EVIDENCE_FILE,
  JOURNEY_FAILURE_CLASSES,
  RELEASE_LANES,
  assertReleaseGate,
  browserLaneProblem,
  buildReleaseEvidence,
  classifyJourney,
  evaluateReleaseGate,
  laneRecordPath,
  readCommit,
  readLaneRecords,
  recordLanePass,
  writeReleaseEvidence,
} from '../../../scripts/generation-reliability/release-gate.mjs'

const COMMIT = 'a'.repeat(40)
const OTHER_COMMIT = 'b'.repeat(40)
const NOW = new Date('2026-10-02T12:00:00.000Z')

const read = (path: string) => readFileSync(join(REPO_ROOT, path), 'utf8')

let root = ''
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'clear-release-gate-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Record every lane as passed for a commit, except the ones named. */
function recordAll(commit: string, except: string[] = []) {
  for (const lane of RELEASE_LANES) {
    if (!except.includes(lane.id)) recordLanePass({ root, lane: lane.id, commit, now: NOW })
  }
}

const gateFor = (commit: string, dirty = false) =>
  evaluateReleaseGate({ commit, dirty, records: readLaneRecords(root, commit) })

describe('the release gate (REQ-026)', () => {
  it('waits on the fast contract, composition and critical browser lanes', () => {
    expect(RELEASE_LANES.map((lane) => lane.name)).toEqual([
      'fast contract lane',
      'composition lane',
      'critical browser lane',
    ])
  })

  it('opens when every lane has passed for the exact commit', () => {
    recordAll(COMMIT)

    expect(gateFor(COMMIT)).toMatchObject({ ok: true, commit: COMMIT, refusals: [] })
  })

  it.each(RELEASE_LANES)('refuses, naming the $name, when it has no record', (lane) => {
    recordAll(COMMIT, [lane.id])
    const gate = gateFor(COMMIT)

    expect(gate.ok).toBe(false)
    expect(gate.refusals.map((refusal) => refusal.lane)).toEqual([lane.id])
    expect(gate.message).toContain(`the ${lane.name} has no recorded run`)
    expect(gate.message).toContain(`npm run gr:lanes -- ${lane.id}`)
    expect(gate.message).toContain(COMMIT)
    // The lanes that did pass are not blamed.
    for (const other of RELEASE_LANES.filter((candidate) => candidate.id !== lane.id)) {
      expect(gate.message).not.toContain(other.name)
    }
  })

  it('refuses every lane when they passed for a different commit', () => {
    recordAll(OTHER_COMMIT)
    const gate = gateFor(COMMIT)

    expect(gate.ok).toBe(false)
    expect(gate.refusals.map((refusal) => refusal.lane)).toEqual(
      RELEASE_LANES.map((lane) => lane.id),
    )
  })

  it.each(RELEASE_LANES)(
    'refuses, naming the $name, when its record is for another commit',
    (lane) => {
      recordAll(COMMIT)
      // A record copied forward from an earlier commit's directory.
      writeFileSync(
        laneRecordPath(root, COMMIT, lane.id),
        JSON.stringify({ lane: lane.id, commit: OTHER_COMMIT, status: 'passed' }),
      )
      const gate = gateFor(COMMIT)

      expect(gate.refusals).toEqual([
        { lane: lane.id, name: lane.name, reason: expect.stringContaining('a different commit') },
      ])
      expect(gate.message).toContain(`the ${lane.name} last passed for bbbbbbbbbbbb`)
    },
  )

  it('refuses a record that is not a pass, is another lane’s, or does not parse', () => {
    recordAll(COMMIT)
    const [fast, composition, browser] = RELEASE_LANES
    writeFileSync(
      laneRecordPath(root, COMMIT, fast.id),
      JSON.stringify({ lane: fast.id, commit: COMMIT, status: 'failed' }),
    )
    writeFileSync(
      laneRecordPath(root, COMMIT, composition.id),
      JSON.stringify({ lane: fast.id, commit: COMMIT, status: 'passed' }),
    )
    writeFileSync(laneRecordPath(root, COMMIT, browser.id), '{not json')

    expect(gateFor(COMMIT).refusals).toEqual([
      { lane: fast.id, name: fast.name, reason: 'is recorded as failed' },
      { lane: composition.id, name: composition.name, reason: 'has an unreadable record' },
      { lane: browser.id, name: browser.name, reason: 'has an unreadable record' },
    ])
  })

  it('refuses when the working tree has changed since the lanes passed', () => {
    recordAll(COMMIT)
    const gate = gateFor(COMMIT, true)

    expect(gate.ok).toBe(false)
    expect(gate.refusals).toHaveLength(RELEASE_LANES.length)
    expect(gate.message).toContain('the working tree has changed since')
  })

  it('throws the refusal to the journey, and returns the commit once it opens', () => {
    const at = () => ({ commit: COMMIT, dirty: false })
    recordAll(COMMIT, ['composition'])

    expect(() => assertReleaseGate(root, at)).toThrow(
      /will not start[\s\S]*the composition lane has no recorded run/,
    )

    recordAll(COMMIT)
    expect(assertReleaseGate(root, at).commit).toBe(COMMIT)
  })

  it('reads the commit being released from the checkout itself', () => {
    expect(readCommit(REPO_ROOT).commit).toMatch(/^[0-9a-f]{40}$/)
  })

  it('records only a real lane against a full commit sha', () => {
    expect(() => recordLanePass({ root, lane: 'release', commit: COMMIT })).toThrow(
      'not a release lane',
    )
    expect(() => recordLanePass({ root, lane: 'composition', commit: 'main' })).toThrow(
      'not a full commit sha',
    )
  })

  it('does not count a browser run that skipped, retried, failed or ran nothing', () => {
    const stats = { expected: 3, skipped: 0, unexpected: 0, flaky: 0 }

    expect(browserLaneProblem(stats)).toBeNull()
    expect(browserLaneProblem({ ...stats, expected: 0, skipped: 3 })).toBe(
      '3 test(s) were skipped',
    )
    expect(browserLaneProblem({ ...stats, unexpected: 1 })).toBe('1 test(s) failed')
    expect(browserLaneProblem({ ...stats, flaky: 1 })).toBe('1 test(s) passed only on a retry')
    expect(browserLaneProblem({ ...stats, expected: 0 })).toBe('no test ran')
    expect(browserLaneProblem(undefined)).toBe('the run reported no result')
  })
})

describe('the release journey is gated, single and retained (REQ-024)', () => {
  const spec = read('e2e/core-loop.spec.ts')

  it('is skipped without the explicit live-model opt-in', () => {
    expect(read('e2e/support/live-model.ts')).toContain(
      "export const liveModelEnabled = process.env.LIVE_MODEL_TESTS === '1'",
    )
    expect(spec).toContain('test.skip(!liveModelEnabled, liveModelReason)')
  })

  it('asks the gate after the opt-in and before it provisions a user', () => {
    const skip = spec.indexOf('test.skip(!liveModelEnabled, liveModelReason)')
    const gate = spec.indexOf('assertReleaseGate()')
    const provision = spec.indexOf('client.ensureConfirmedUser(email)')

    expect(skip).toBeGreaterThan(-1)
    expect(gate).toBeGreaterThan(skip)
    expect(provision).toBeGreaterThan(gate)
    // Nothing touches the backend between the hook opening and the gate.
    const hook = spec.slice(spec.indexOf('test.beforeAll('), gate)
    expect(hook).not.toMatch(/client|backend\./)
  })

  it('disables retries and expects exactly one generation', () => {
    expect(spec).toContain("test.describe.configure({ mode: 'serial', retries: 0 })")
    expect(spec).toContain(
      "expect(generationRequests, 'generation was retried or repeated').toHaveLength(1)",
    )
    expect(spec).not.toMatch(/route\.fulfill\([^)]*generate|functions\/v1\/generate-\*/)
    expect(spec).toContain("test.use({ serviceWorkers: 'block' })")
    expect(spec).toContain('maxRedirects: 0')
    expect(spec).toContain('maxRetries: 0')
    expect(spec).toContain("await route.abort('blockedbyclient')")
    expect(spec).toContain('await route.fulfill({ response })')
    expect(spec).toContain('assertSingleAttemptDeployment(backend.generationEndpoint())')
  })

  it('waits for onboarding commit navigation before unchanged authenticated context checks', () => {
    const finish = spec.indexOf("await page.getByRole('button', { name: 'Finish setup', exact: true }).click()")
    const home = spec.indexOf("await expectScreen('Home', routeOf('Home'), 'Today')", finish)
    const experience = spec.indexOf("expect(await contextReader.experience?.(contextUser.id)).toEqual({ ok: true, value: 'some' })")
    const history = spec.indexOf('expect(await contextReader.recentHistory(contextUser.id)).toEqual({')
    const generate = spec.indexOf("await page.getByRole('button', { name: 'Generate workout', exact: true }).click()", home)

    expect(finish).toBeGreaterThan(-1)
    expect(home).toBeGreaterThan(finish)
    expect(experience).toBeGreaterThan(home)
    expect(history).toBeGreaterThan(experience)
    expect(generate).toBeGreaterThan(history)
  })

  it('writes the evidence after the walk whatever its outcome, and deletes its user', () => {
    const after = spec.slice(spec.indexOf('test.afterEach('), spec.indexOf("test('walks"))

    expect(after).toContain("passed: testInfo.status === 'passed'")
    expect(after).toContain('writeReleaseEvidence(process.cwd(), evidence)')
    expect(spec).toContain('await client.deleteUser(provisioned.id)')
    expect(read('.gitignore')).toMatch(new RegExp(`^${EVIDENCE_DIR}/$`, 'm'))
  })

  it('retains only a non-personal canonical workout after the successful storage checks', () => {
    const start = spec.indexOf("await testInfo.attach('non-personal-generated-workout'")
    const attachment = spec.slice(start, spec.indexOf('\n  })', start))
    expect(start).toBeGreaterThan(spec.indexOf('expect(ordered).toEqual(['))
    expect(start).toBeGreaterThan(spec.indexOf("'the disposable canary has no athlete notes'"))
    for (const field of ['goal_preset', 'session_focus', 'effective_duration_target_mins',
      'effective_intensity', 'prompt_version', 'contract_version']) {
      expect(attachment).toContain(`body.acceptance.${field}`)
    }
    expect(attachment).toContain('workout,')
    expect(attachment).not.toMatch(/accessToken|publicKey|headers|email|user_id|location_id|generation_notes/)
    expect(attachment).not.toMatch(/JSON\.stringify\(body(?:\.acceptance)?[,)]|\.\.\.body/)
  })
})

describe('the release evidence artifact (REQ-024)', () => {
  /** Everything a careless caller could hand over, sensitive values included. */
  const SENSITIVE = {
    email: 'clear-e2e-local-mobile-core-loop@example.com',
    accessToken: 'eyJhbGciOiJIUzI1NiJ9.sensitive.signature',
    message: 'No exercises fit the athlete’s knee restriction',
    payload: { acceptance: { workout: { title: 'Private Session Title' } } },
    userId: '5ba06cb6-ff92-4940-a752-5c9d714d69ec',
    headers: { authorization: 'Bearer sensitive-bearer', apikey: 'sensitive-anon-key' },
  }

  const stored = (observation: Record<string, unknown>) => {
    const path = writeReleaseEvidence(root, buildReleaseEvidence(observation, NOW))
    expect(path).toBe(join(root, EVIDENCE_DIR, COMMIT, EVIDENCE_FILE))
    return readFileSync(path, 'utf8')
  }

  it('is written on success with the request id, status, code and failure class', () => {
    const text = stored({
      ...SENSITIVE,
      commit: COMMIT,
      passed: true,
      generationRequests: 1,
      requestId: 'req_lxyz_a1b2c3',
      status: 200,
      code: null,
      accepted: true,
    })

    expect(JSON.parse(text)).toEqual({
      lane: 'release',
      commit: COMMIT,
      outcome: 'passed',
      requestId: 'req_lxyz_a1b2c3',
      status: 200,
      code: null,
      failureClass: 'none',
      generationRequests: 1,
      recordedAt: NOW.toISOString(),
    })
  })

  it('is written on failure with the typed code the function answered', () => {
    const text = stored({
      ...SENSITIVE,
      commit: COMMIT,
      passed: false,
      generationRequests: 1,
      requestId: 'req_lxyz_a1b2c3',
      status: 422,
      code: 'GENERATION_NO_CANDIDATES',
      accepted: false,
    })

    expect(JSON.parse(text)).toMatchObject({
      outcome: 'failed',
      requestId: 'req_lxyz_a1b2c3',
      status: 422,
      code: 'GENERATION_NO_CANDIDATES',
      failureClass: 'refused',
    })
  })

  it('carries only its allow-listed fields and none of what it was handed', () => {
    const text = stored({
      ...SENSITIVE,
      commit: COMMIT,
      passed: false,
      generationRequests: 1,
      // Values in the wrong shape for their field are dropped, not copied.
      requestId: `Bearer ${SENSITIVE.accessToken}`,
      status: '500 — see message',
      code: SENSITIVE.message,
      accepted: false,
    })
    const evidence = JSON.parse(text) as Record<string, unknown>

    expect(Object.keys(evidence)).toEqual(EVIDENCE_FIELDS)
    expect(evidence).toMatchObject({ requestId: null, status: null, code: null })
    for (const secret of [
      SENSITIVE.email,
      'example.com',
      SENSITIVE.accessToken,
      'Bearer',
      'knee',
      'Private Session Title',
      SENSITIVE.userId,
      'sensitive',
    ]) {
      expect(text, secret).not.toContain(secret)
    }
  })

  it('names the boundary a failed journey stopped at', () => {
    const base = { passed: false, requested: true, status: 200, accepted: true }

    expect(classifyJourney({ ...base, passed: true })).toBe('none')
    expect(classifyJourney({ ...base, requested: false, status: null })).toBe('before_request')
    expect(classifyJourney({ ...base, status: null })).toBe('no_response')
    expect(classifyJourney({ ...base, status: 401 })).toBe('refused')
    expect(classifyJourney({ ...base, status: 502 })).toBe('server_error')
    expect(classifyJourney({ ...base, accepted: false })).toBe('invalid_response')
    expect(classifyJourney(base)).toBe('after_response')
    expect(JOURNEY_FAILURE_CLASSES).toEqual([
      'none',
      'before_request',
      'no_response',
      'refused',
      'server_error',
      'invalid_response',
      'after_response',
    ])
  })

  it('still writes an artifact when the journey failed before any request', () => {
    const text = stored({ commit: COMMIT, passed: false, generationRequests: 0 })

    expect(JSON.parse(text)).toMatchObject({
      outcome: 'failed',
      requestId: null,
      status: null,
      code: null,
      failureClass: 'before_request',
      generationRequests: 0,
    })
  })
})

describe('no routine command performs a provider call (REQ-024, REQ-026)', () => {
  const OPT_IN = 'LIVE_MODEL_TESTS'
  const PROVIDER = /ANTHROPIC_API_KEY|api\.anthropic\.com/
  const workflows = readdirSync(join(REPO_ROOT, '.github/workflows')).filter((name) =>
    name.endsWith('.yml'),
  )
  const e2eWorkflow = read('.github/workflows/e2e.yml')
  const canaryStart = e2eWorkflow.indexOf('  live-model-canary:')

  it('keeps the opt-in and the provider out of every package script', () => {
    const { scripts } = JSON.parse(read('package.json')) as { scripts: Record<string, string> }

    for (const [name, command] of Object.entries(scripts)) {
      expect(command, name).not.toContain(OPT_IN)
      expect(command, name).not.toMatch(PROVIDER)
    }
  })

  it('sets the opt-in in exactly one job, and only on an explicit dispatch', () => {
    expect(canaryStart).toBeGreaterThan(-1)
    // The canary is the last job, so everything before it is routine.
    expect(e2eWorkflow.slice(0, canaryStart)).not.toContain(OPT_IN)
    for (const name of workflows.filter((candidate) => candidate !== 'e2e.yml')) {
      expect(read(`.github/workflows/${name}`), name).not.toContain(OPT_IN)
    }

    const canary = e2eWorkflow.slice(canaryStart)
    expect(canary).toContain("if: github.event_name == 'workflow_dispatch'")
    expect(canary.match(new RegExp(OPT_IN, 'g'))).toHaveLength(1)
  })

  it('gives no workflow the provider credential', () => {
    for (const name of workflows) {
      expect(read(`.github/workflows/${name}`), name).not.toMatch(PROVIDER)
    }
  })

  it('runs the deterministic lanes before the paid walk and retains the evidence', () => {
    const canary = e2eWorkflow.slice(canaryStart)
    const lanes = canary.indexOf('run: npm run gr:lanes')
    const walk = canary.indexOf('npx playwright test e2e/core-loop.spec.ts')

    expect(lanes).toBeGreaterThan(-1)
    expect(walk).toBeGreaterThan(lanes)
    expect(canary.slice(walk)).toContain(`${EVIDENCE_DIR}/`)
  })

  it('removes the opt-in from the environment the lanes run in', () => {
    const runner = read('scripts/generation-reliability/release-lanes.mjs')

    expect(runner).toContain(`delete env.${OPT_IN}`)
    for (const lane of RELEASE_LANES) {
      expect(lane.command.join(' ')).not.toContain('core-loop')
      expect(lane.command.join(' ')).not.toContain('generation-persistence')
    }
  })

  it('lets a generation request through only in the opt-in specs', () => {
    const specs = readdirSync(join(REPO_ROOT, 'e2e')).filter((name) => name.endsWith('.spec.ts'))
    const optIn = specs.filter((name) =>
      read(`e2e/${name}`).includes('test.skip(!liveModelEnabled, liveModelReason)'),
    )

    expect(optIn.sort()).toEqual(['core-loop.spec.ts', 'generation-persistence.spec.ts'])

    // The critical browser lane answers every generation itself and never
    // forwards one.
    for (const name of [
      'generation-browser-new-user.spec.ts',
      'generation-browser-returning-user.spec.ts',
    ]) {
      const source = read(`e2e/${name}`)
      expect(source, name).toContain("page.route('**/functions/v1/generate-*'")
      expect(source, name).not.toMatch(/route\.(continue|fallback)\(/)
      expect(source, name).not.toContain('liveModelEnabled')
    }
  })

  it('makes no request from the gate or the lane runner', () => {
    const lanes = ['release-gate.mjs', 'release-lanes.mjs']
    for (const name of lanes) {
      expect(read(`scripts/generation-reliability/${name}`), name).not.toMatch(
        /anthropic|fetch\(/i,
      )
    }
  })
})
