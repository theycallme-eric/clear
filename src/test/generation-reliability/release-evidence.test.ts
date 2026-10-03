/**
 * GR-07 / REQ-028 — the deployed UAT matrix's plan, verdict and record.
 *
 * `npx playwright test e2e/generation-deployed-matrix.spec.ts --project=mobile`
 * needs the deployed application and the hosted project; this suite does not.
 * It holds the parts of that run with no browser in them: that the plan names
 * the nine entries and gives each the configuration it is named for, that an
 * entry is judged section by section, that the record is refused when it lacks
 * an entry or carries anything outside its closed vocabulary, and that the
 * deployed target is resolved by reading only.
 *
 * The committed record is held to the same rules, so the release evidence
 * cannot be absent, partial, failing or hand-edited into carrying an address.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { REPO_ROOT } from '../../../scripts/gen-types/schema.mjs'
import {
  ENTRY_IDS,
  EVIDENCE_COMMAND,
  EVIDENCE_RECORD_PATH,
  REPAIRED_OPTIONAL_SECTIONS,
  STEPS,
  buildEntryResult,
  buildRecord,
  buildUatPlan,
  isUatEmail,
  productionAlias,
  recordFailures,
  recordProblems,
  resolveDeployedTarget,
  serializeRecord,
  uatEmail,
} from '../../../scripts/generation-reliability/release-evidence.mjs'
import {
  CHECKLIST_PATH,
  EXIT_CRITERIA,
  EXIT_RECORD_PATH,
  OWNER_STEPS,
  exitFailures,
  exitRecordProblems,
  lastChecklistRun,
  main as runExitCommand,
  recordOwnerResult,
  serializeExitRecord,
  unrecordedOwnerUat,
  type ExitRecord,
} from '../../../scripts/generation-reliability/release-exit.mjs'
import { loadRetrievalRules } from '../../../scripts/generation-reliability/rules.mjs'
import { isHarnessEmail } from '../../../scripts/e2e/namespace.mjs'
import { EQUIPMENT_BY_TIER, SECTIONS_BY_GOAL } from '../../state/onboarding'
import { seededCatalog } from '../seed-catalog'

import mirror from './owner-mirror.json'

const { enums } = loadRetrievalRules()

const VOCABULARY = {
  sections: enums.section_type,
  goals: enums.goal_preset,
  tiers: enums.equipment_tier,
  focuses: enums.session_focus,
}

const plan = buildUatPlan({
  sectionsByGoal: SECTIONS_BY_GOAL,
  equipmentByTier: EQUIPMENT_BY_TIER,
  sectionOrder: enums.section_type,
  mirror,
})

const entryOf = (id: string) => {
  const entry = plan.find((candidate) => candidate.id === id)
  if (entry === undefined) throw new Error(`the plan has no ${id}`)
  return entry
}

/** An observation in which every saved section resolved, composed and showed. */
const observed = (id: string) => ({
  failedStep: null,
  sections: entryOf(id).sections.map((section) => ({
    section,
    candidates: 3,
    composed: true,
    reviewed: true,
  })),
  cleanup: { usersLeft: 0, rowsLeft: 0 },
})

const TARGET = {
  source: 'newest ready production deployment',
  commit: '0123456789abcdef0123456789abcdef01234567',
}
const CLEAN = { usersLeft: 0, rowsLeft: 0 }
const NOW = new Date('2026-10-02T12:00:00Z')

const passingRecord = () =>
  buildRecord({
    plan,
    results: plan.map((entry) => buildEntryResult(entry, observed(entry.id))),
    target: TARGET,
    cleanup: CLEAN,
    now: NOW,
  })

/** A passing record with one change made to its parsed form. */
const edited = (edit: (record: ReturnType<typeof passingRecord>) => void) => {
  const record = passingRecord()
  edit(record)
  return JSON.stringify(record)
}

// ─────────────────────────────────────────────────────────────────────────────

describe('the plan', () => {
  it('names the nine entries the release must show, in order', () => {
    expect(plan.map((entry) => entry.id)).toEqual([
      'new_user',
      'returning_user',
      'default_preset',
      'customized_profile',
      'minimal_tier',
      'building_tier',
      'skill_power',
      'carries',
      'stability_balance',
    ])
    expect(plan.map((entry) => entry.id)).toEqual(ENTRY_IDS)
  })

  it('sends the new user through sign-up, the returning user through sign-in', () => {
    expect(entryOf('new_user').door).toBe('sign_up')
    expect(plan.filter((entry) => entry.door === 'sign_up')).toHaveLength(1)
    expect(entryOf('returning_user').door).toBe('sign_in')
  })

  it('gives the default preset exactly its Goal’s sections', () => {
    const entry = entryOf('default_preset')

    expect([...entry.sections].sort()).toEqual([...SECTIONS_BY_GOAL[entry.goal as 'balanced']].sort())
  })

  it('gives the customized profile the owner mirror, which goes beyond its preset', () => {
    const entry = entryOf('customized_profile')

    expect(entry.goal).toBe(mirror.goal)
    expect(entry.tier).toBe(mirror.tier)
    expect(entry.equipment).toEqual(mirror.equipment)
    expect(entry.sections).toEqual(mirror.enabledSections)
    expect(
      entry.sections.filter(
        (section) => !SECTIONS_BY_GOAL[mirror.goal as 'balanced'].includes(section as never),
      ),
    ).not.toEqual([])
  })

  it.each(['minimal', 'building'] as const)('runs the %s tier with that tier’s own equipment', (tier) => {
    const entry = entryOf(`${tier}_tier`)

    expect(entry.tier).toBe(tier)
    expect(entry.equipment).toEqual(EQUIPMENT_BY_TIER[tier])
  })

  it.each(REPAIRED_OPTIONAL_SECTIONS)('saves %s for the entry named for it', (section) => {
    const entry = entryOf(section)

    expect(entry.sections).toContain(section)
    expect(SECTIONS_BY_GOAL[entry.goal as 'strength']).not.toContain(section)
  })

  it.each(ENTRY_IDS)('%s: every saved section has a seeded candidate for its equipment', (id) => {
    const entry = entryOf(id)
    const owned = new Set(entry.equipment)
    const empty = entry.sections.filter(
      (section) =>
        !seededCatalog().some(
          (exercise) =>
            exercise.sections.includes(section) &&
            exercise.equipmentOptions.some((item) => owned.has(item)),
        ),
    )

    expect(entry.sections.length).toBeGreaterThan(0)
    expect(empty).toEqual([])
  })

  it('keeps every value inside the closed vocabulary', () => {
    for (const entry of plan) {
      expect(VOCABULARY.goals).toContain(entry.goal)
      expect(VOCABULARY.tiers).toContain(entry.tier)
      expect(VOCABULARY.focuses).toContain(entry.focus)
      for (const section of entry.sections) expect(VOCABULARY.sections).toContain(section)
    }
  })

  it('addresses every user inside the harness namespace, one per entry', () => {
    const emails = plan.map((entry) => uatEmail('local', entry.id))

    expect(new Set(emails).size).toBe(ENTRY_IDS.length)
    for (const email of emails) {
      expect(isHarnessEmail(email)).toBe(true)
      expect(isUatEmail(email, 'local')).toBe(true)
      expect(isUatEmail(email, 'other')).toBe(false)
    }
    expect(isUatEmail('clear-e2e-local-a@example.com', 'local')).toBe(false)
    expect(isUatEmail('owner.person@mail.invalid', 'local')).toBe(false)
  })
})

describe('an entry’s verdict', () => {
  it('has one row for every saved section, and passes when each one does', () => {
    for (const entry of plan) {
      const result = buildEntryResult(entry, observed(entry.id))

      expect(result.sections.map((row) => row.section)).toEqual(entry.sections)
      expect(result.sections.every((row) => row.result === 'pass')).toBe(true)
      expect(result).toMatchObject({ result: 'pass', failedStep: null, requestIds: [] })
    }
  })

  it.each([
    ['resolved no candidate', { candidates: 0 }],
    ['was not composed', { composed: false }],
    ['was not shown on Review', { reviewed: false }],
  ])('fails the entry when one section %s, whatever the others did', (_, change) => {
    const entry = entryOf('customized_profile')
    const observation = observed(entry.id)
    observation.sections[2] = { ...observation.sections[2], ...change }
    const result = buildEntryResult(entry, observation)

    expect(result.result).toBe('fail')
    expect(result.failedStep).toBe('sections')
    expect(result.sections.filter((row) => row.result === 'fail').map((row) => row.section)).toEqual([
      entry.sections[2],
    ])
  })

  it('records a walk that stopped early as a failing row per section, not a shorter entry', () => {
    const entry = entryOf('carries')
    const result = buildEntryResult(entry, {
      failedStep: 'home',
      sections: [],
      requestIds: ['req-1', 'req-1'],
      cleanup: CLEAN,
    })

    expect(result.result).toBe('fail')
    expect(result.failedStep).toBe('home')
    expect(result.requestIds).toEqual(['req-1'])
    expect(result.sections.map((row) => row.section)).toEqual(entry.sections)
    expect(result.sections.every((row) => row.result === 'fail')).toBe(true)
  })

  it('fails an entry whose user or rows outlived it, or whose cleanup was never observed', () => {
    const entry = entryOf('new_user')

    for (const cleanup of [{ usersLeft: 1, rowsLeft: 0 }, { usersLeft: 0, rowsLeft: 2 }, null]) {
      const result = buildEntryResult(entry, { ...observed(entry.id), cleanup })

      expect(result.result).toBe('fail')
      expect(result.failedStep).toBe('cleanup')
    }
  })

  it('names only steps the walk has', () => {
    expect(STEPS).toContain('candidate_resolution')
    expect(STEPS).toContain('review')
    expect(STEPS).toContain('cleanup')
  })
})

describe('the record', () => {
  it('has a result for each of the nine entries, each asserted per section', () => {
    const record = passingRecord()

    expect(record.entries.map((entry) => entry.entry)).toEqual(ENTRY_IDS)
    for (const entry of record.entries) {
      expect(entry.sections.map((row) => row.section)).toEqual(entryOf(entry.entry).sections)
    }
    expect(record.result).toBe('pass')
    expect(recordProblems(serializeRecord(record), VOCABULARY)).toEqual([])
    expect(recordFailures(record)).toEqual([])
  })

  it('records an entry the run never produced as a failure, never an absence', () => {
    const record = buildRecord({
      plan,
      results: plan
        .filter((entry) => entry.id !== 'carries')
        .map((entry) => buildEntryResult(entry, observed(entry.id))),
      target: TARGET,
      cleanup: CLEAN,
      now: NOW,
    })

    expect(record.entries.map((entry) => entry.entry)).toEqual(ENTRY_IDS)
    expect(record.result).toBe('fail')
    expect(recordProblems(serializeRecord(record), VOCABULARY)).toEqual([])
    expect(recordFailures(record)).toContain('carries: failed at provision')
    expect(recordFailures(record)).toContain('carries carries: failed')
  })

  it('fails on a leftover the namespace sweep found, and says how many', () => {
    const record = buildRecord({
      plan,
      results: plan.map((entry) => buildEntryResult(entry, observed(entry.id))),
      target: TARGET,
      cleanup: { usersLeft: 2, rowsLeft: 0 },
      now: NOW,
    })

    expect(record.result).toBe('fail')
    expect(recordFailures(record)).toEqual(['cleanup: 2 disposable user(s) remain'])
  })

  it('is the same bytes for the same run on the same day', () => {
    expect(serializeRecord(passingRecord())).toBe(serializeRecord(passingRecord()))
    expect(passingRecord().recordedOn).toBe('2026-10-02')
    expect(passingRecord().generatedBy).toBe(EVIDENCE_COMMAND)
  })

  it('is refused when absent or unreadable', () => {
    expect(recordProblems(null, VOCABULARY)).toEqual([`${EVIDENCE_RECORD_PATH} does not exist.`])
    expect(recordProblems('{', VOCABULARY)).toHaveLength(1)
  })

  it('is refused when an entry is missing, repeated or out of order', () => {
    const missing = edited((record) => void record.entries.splice(3, 1))
    const reordered = edited((record) => void record.entries.reverse())

    for (const contents of [missing, reordered]) {
      expect(recordProblems(contents, VOCABULARY).join('\n')).toContain('entries are not exactly')
    }
  })

  it('is refused when an entry is an aggregate with no section rows', () => {
    const aggregate = edited((record) => {
      record.entries[0].sections = []
    })

    expect(recordProblems(aggregate, VOCABULARY)).toContain('new_user: no section is asserted')
  })

  it('is refused when a result disagrees with what its rows observed', () => {
    const row = edited((record) => {
      record.entries[1].sections[0].candidates = 0
    })
    const entry = edited((record) => {
      record.entries[1].sections[0].candidates = 0
      record.entries[1].sections[0].result = 'fail'
    })
    const overall = edited((record) => {
      record.cleanup.usersLeft = 1
    })

    expect(recordProblems(row, VOCABULARY).join('\n')).toContain(
      'returning_user warmup: result disagrees with what was observed',
    )
    expect(recordProblems(entry, VOCABULARY)).toContain(
      'returning_user: result disagrees with its sections, step and cleanup',
    )
    expect(recordProblems(overall, VOCABULARY)).toContain(
      'result disagrees with the entries and the cleanup',
    )
  })

  it('is refused when a named optional section is not among its entry’s rows', () => {
    const dropped = edited((record) => {
      const entry = record.entries.find((candidate) => candidate.entry === 'skill_power')
      if (entry) entry.sections = entry.sections.filter((row) => row.section !== 'skill_power')
    })

    expect(recordProblems(dropped, VOCABULARY)).toContain(
      'skill_power: the section the entry is named for is not asserted',
    )
  })

  it('is refused when it carries a credential, a code, an address or a field it has no place for', () => {
    const withEmail = edited((record) => {
      record.notes.push('run for owner.person@mail.invalid')
    })
    const withToken = edited((record) => {
      record.notes.push('eyJhbGciOiJIUzI1NiJ9')
    })
    const withOrigin = edited((record) => {
      record.target.source = 'https://hosted.invalid'
    })
    const withField = edited((record) => {
      Object.assign(record.entries[0], { email: 'someone' })
    })
    const withCode = edited((record) => {
      Object.assign(record, { code: '123456' })
    })
    const withProse = edited((record) => {
      record.entries[0].requestIds = ['the email said hello']
    })
    const withUnknown = edited((record) => {
      record.entries[0].goal = 'left shoulder is sore'
    })

    for (const contents of [
      withEmail,
      withToken,
      withOrigin,
      withField,
      withCode,
      withProse,
      withUnknown,
    ]) {
      expect(recordProblems(contents, VOCABULARY).length).toBeGreaterThan(0)
    }
  })

  it('keeps request ids for a failure and only for a failure', () => {
    const entry = entryOf('building_tier')
    const failed = buildEntryResult(entry, {
      ...observed(entry.id),
      failedStep: 'review',
      requestIds: ['3f0c9a52-7d1e-4b8a-9c53-0a1b2c3d4e5f'],
    })
    const record = buildRecord({
      plan,
      results: plan.map((planned) =>
        planned.id === entry.id ? failed : buildEntryResult(planned, observed(planned.id)),
      ),
      target: TARGET,
      cleanup: CLEAN,
      now: NOW,
    })

    expect(failed.requestIds).toHaveLength(1)
    expect(recordProblems(serializeRecord(record), VOCABULARY)).toEqual([])
    expect(recordFailures(record)).toEqual(['building_tier: failed at review'])
    expect(
      recordProblems(
        edited((passing) => {
          passing.entries[0].requestIds = ['req-1']
        }),
        VOCABULARY,
      ),
    ).toContain('new_user: a passing entry carries request ids')
  })
})

describe('the deployed target', () => {
  const TOKEN = 'vercel-token-that-must-never-be-printed'
  const SHA = 'a'.repeat(40)

  /** Vercel, as a double, recording every request made of it. */
  function vercel(aliases: unknown = ['clear-git-main-team.vercel.app', 'clear-example.vercel.app']) {
    const requests: { method: string; url: string }[] = []
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ method: init?.method ?? 'GET', url })
      const body = url.includes('/v6/deployments')
        ? {
            deployments: [
              {
                uid: 'dpl_old',
                created: 1,
                meta: { githubOrg: 'theycallme-eric', githubRepo: 'clear', githubCommitSha: 'b'.repeat(40) },
              },
              {
                uid: 'dpl_new',
                created: 2,
                meta: { githubOrg: 'theycallme-eric', githubRepo: 'clear', githubCommitSha: SHA },
              },
              {
                uid: 'dpl_other',
                created: 3,
                meta: { githubOrg: 'someone', githubRepo: 'else', githubCommitSha: 'c'.repeat(40) },
              },
            ],
          }
        : { alias: aliases }
      return new Response(JSON.stringify(body), { status: 200 })
    }) as typeof globalThis.fetch

    return { fetch, requests }
  }

  it('is the newest ready production deployment of this repository, by its public alias', async () => {
    const { fetch, requests } = vercel()
    const target = await resolveDeployedTarget({ env: { VERCEL_TOKEN: TOKEN }, fetch })

    expect(target).toEqual({
      origin: 'https://clear-example.vercel.app',
      source: 'newest ready production deployment',
      commit: SHA,
    })
    expect(requests.map((request) => request.method)).toEqual(['GET', 'GET'])
    expect(requests[1].url).toContain('/v13/deployments/dpl_new')
  })

  it('is E2E_BASE_URL when that is supplied, with or without a commit', async () => {
    const { fetch, requests } = vercel()
    const withToken = await resolveDeployedTarget({
      env: { E2E_BASE_URL: 'https://preview.invalid/', VERCEL_TOKEN: TOKEN },
      fetch,
    })
    const without = await resolveDeployedTarget({
      env: { E2E_BASE_URL: 'https://preview.invalid' },
      fetch,
    })

    expect(withToken).toEqual({ origin: 'https://preview.invalid', source: 'E2E_BASE_URL', commit: SHA })
    expect(without).toEqual({ origin: 'https://preview.invalid', source: 'E2E_BASE_URL', commit: null })
    expect(requests).toHaveLength(1)
  })

  it('prefers a custom domain, then the shortest alias, and never a branch alias', () => {
    expect(productionAlias(['clear-git-main-team.vercel.app', 'clear-team.vercel.app', 'clear.vercel.app'])).toBe(
      'clear.vercel.app',
    )
    expect(productionAlias(['clear.vercel.app', 'app.example.org'])).toBe('app.example.org')
    expect(productionAlias(['clear-git-main-team.vercel.app'])).toBeNull()
    expect(productionAlias(['not a host', 7])).toBeNull()
    expect(productionAlias(undefined)).toBeNull()
  })

  it('fails by name, without the token, when nothing can be resolved', async () => {
    const refused = (async () => new Response(JSON.stringify({ message: TOKEN }), { status: 403 })) as typeof fetch

    await expect(resolveDeployedTarget({ env: {} })).rejects.toThrow(
      'neither E2E_BASE_URL nor VERCEL_TOKEN is set',
    )
    await expect(
      resolveDeployedTarget({ env: { VERCEL_TOKEN: TOKEN }, fetch: vercel([]).fetch }),
    ).rejects.toThrow('the production deployment has no alias')

    const error = await resolveDeployedTarget({ env: { VERCEL_TOKEN: TOKEN }, fetch: refused }).catch(
      (thrown: unknown) => thrown as Error,
    )
    expect((error as Error).message).toContain('listing production deployments: HTTP 403')
    expect((error as Error).message).not.toContain(TOKEN)
  })
})

describe('the committed release evidence record', () => {
  const path = join(REPO_ROOT, EVIDENCE_RECORD_PATH)
  const committed = existsSync(path) ? readFileSync(path, 'utf8') : null

  it('has a result for each of the nine entries, per section, and nothing left behind', () => {
    expect(recordProblems(committed, VOCABULARY)).toEqual([])

    const record = JSON.parse(committed as string) as ReturnType<typeof buildRecord>
    expect(recordFailures(record)).toEqual([])
    expect(record.result).toBe('pass')
    expect(record.cleanup).toEqual({ usersLeft: 0, rowsLeft: 0 })
    for (const entry of record.entries) {
      // What was asserted is what the plan saves: no section went unexamined.
      expect(entry.sections.map((row) => row.section)).toEqual(entryOf(entry.entry).sections)
      expect(entry.cleanup).toEqual({ usersLeft: 0, rowsLeft: 0 })
    }
  })

  it('names the deployed commit it was run against', () => {
    expect(committed).not.toBeNull()
    expect(JSON.parse(committed as string).target.commit).toMatch(/^[0-9a-f]{40}$/)
  })

  it('contains no credential, code, address or identifier', () => {
    expect(committed).not.toBeNull()
    expect(committed).not.toMatch(/@|eyJ|sb_secret|sbp_|https?:\/\//)
    expect(committed).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
    expect(committed).not.toMatch(/example\.com|clear-e2e/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GR-07 / REQ-018, REQ-028 — the owner's results and the exit checklist.

const read = (path: string) => {
  const absolute = join(REPO_ROOT, path)
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : null
}

const committedExit = read(EXIT_RECORD_PATH)

/** The committed checklist, with both owner steps recorded as passed. */
const exitedRecord = (): ExitRecord => {
  const record: ExitRecord = { ...JSON.parse(committedExit as string), ownerUat: unrecordedOwnerUat() }
  return OWNER_STEPS.reduce(
    (next, { step }) => recordOwnerResult(next, { step, result: 'pass', now: NOW }),
    record,
  )
}

const editedExit = (edit: (record: ExitRecord) => void) => {
  const record = exitedRecord()
  edit(record)
  return JSON.stringify(record)
}

describe('an owner result', () => {
  it('is a date and a pass, and nothing else', () => {
    const [inbox, generate] = exitedRecord().ownerUat
    expect(inbox).toEqual({
      step: 'inbox_check',
      checklist: '1.3',
      result: 'pass',
      recordedOn: '2026-10-02',
      failedSubStep: null,
      requestId: null,
    })
    expect(generate).toEqual({
      step: 'generate_review',
      checklist: '4.2',
      result: 'pass',
      recordedOn: '2026-10-02',
      failedSubStep: null,
      requestId: null,
    })
  })

  it('records a failed inbox check as its sub-step and a failed generation as its request id', () => {
    let record = recordOwnerResult(exitedRecord(), {
      step: 'inbox_check',
      result: 'fail',
      failedSubStep: 2,
      now: NOW,
    })
    record = recordOwnerResult(record, {
      step: 'generate_review',
      result: 'fail',
      requestId: 'req_abc123_def456',
      now: NOW,
    })

    expect(record.ownerUat.map((row) => [row.result, row.failedSubStep, row.requestId])).toEqual([
      ['fail', 2, null],
      ['fail', null, 'req_abc123_def456'],
    ])
    expect(exitRecordProblems(JSON.stringify(record))).toEqual([])
  })

  it.each([
    ['an unknown step', { step: 'sign_in', result: 'pass' }],
    ['a result that is neither pass nor fail', { step: 'inbox_check', result: 'not_recorded' }],
    ['a failed inbox check with no sub-step', { step: 'inbox_check', result: 'fail' }],
    ['a sub-step the check does not have', { step: 'inbox_check', result: 'fail', failedSubStep: 4 }],
    ['a sub-step on a pass', { step: 'inbox_check', result: 'pass', failedSubStep: 2 }],
    ['a failed generation with no request id', { step: 'generate_review', result: 'fail' }],
    [
      'a sentence where the request id goes',
      { step: 'generate_review', result: 'fail', requestId: 'the email said hello' },
    ],
    ['a request id on a pass', { step: 'generate_review', result: 'pass', requestId: 'req_a' }],
  ])('refuses %s', (_name, entry) => {
    expect(() => recordOwnerResult(exitedRecord(), entry)).toThrow()
  })
})

describe('the release exit record', () => {
  it('is accepted when both owner steps and every criterion are present', () => {
    expect(exitRecordProblems(JSON.stringify(exitedRecord()))).toEqual([])
    expect(exitFailures(exitedRecord(), read)).toEqual([])
  })

  it('is refused when it is absent or is not JSON', () => {
    expect(exitRecordProblems(null)).toEqual([`${EXIT_RECORD_PATH} does not exist.`])
    expect(exitRecordProblems('{')).toEqual([`${EXIT_RECORD_PATH} is not JSON.`])
  })

  it.each(OWNER_STEPS.map(({ step }) => step))('is refused without the %s row', (step) => {
    const contents = editedExit((record) => {
      record.ownerUat = record.ownerUat.filter((row) => row.step !== step)
    })
    expect(exitRecordProblems(contents)).not.toEqual([])
  })

  it.each(EXIT_CRITERIA.map(({ id }) => id))('is refused without the %s criterion', (id) => {
    const contents = editedExit((record) => {
      record.exitCriteria = record.exitCriteria.filter((row) => row.id !== id)
    })
    expect(exitRecordProblems(contents)).not.toEqual([])
    expect(exitFailures(JSON.parse(contents), read)).toContain(
      `${id}: the criterion is missing from the checklist`,
    )
  })

  it('is refused when a criterion is reworded or a note is added', () => {
    expect(
      exitRecordProblems(
        editedExit((record) => {
          record.exitCriteria[0].criterion = 'Most sections have coverage.'
        }),
      ),
    ).toEqual(['section_coverage: criterion is not the exit criterion’s own wording'])
    expect(
      exitRecordProblems(
        editedExit((record) => {
          record.notes.push('The owner said it looked fine.')
        }),
      ),
    ).toEqual(['notes are not the record’s own notes'])
  })

  it.each([
    ['an address', 'someone@example.com'],
    ['a token', 'eyJhbGciOiJIUzI1NiJ9'],
    ['an origin', 'https://clear.example'],
    ['a one-time code', '482913'],
    ['a user id', '3f2b8c1a-9d4e-4b7a-8c2d-1e5f6a7b8c9d'],
  ])('is refused when it carries %s', (_name, value) => {
    const anchored = editedExit((record) => {
      record.exitCriteria[0].evidence = [
        { kind: 'file', path: 'docs/journal/2026-10-02.md', anchor: value },
      ]
    })
    expect(exitRecordProblems(anchored)).not.toEqual([])

    // A field the record does not have is refused whatever it holds.
    const added = editedExit((record) => {
      Object.assign(record.ownerUat[0], { note: value })
    })
    expect(exitRecordProblems(added)).not.toEqual([])
  })

  it('is refused when an owner result is dated without being recorded, or recorded undated', () => {
    expect(
      exitRecordProblems(
        editedExit((record) => {
          record.ownerUat[0].result = 'not_recorded'
        }),
      ),
    ).toEqual(['inbox_check: recordedOn is not the date of a recorded result'])
    expect(
      exitRecordProblems(
        editedExit((record) => {
          record.ownerUat[1].recordedOn = null
        }),
      ),
    ).toEqual(['generate_review: recordedOn is not the date of a recorded result'])
  })

  it('is refused when a link leaves the repository or is not one of the three kinds', () => {
    for (const link of [
      { kind: 'file', path: '../outside.md', anchor: 'pass' },
      { kind: 'file', path: '/etc/hosts', anchor: 'pass' },
      { kind: 'file', path: 'docs/journal/2026-10-02.md', anchor: ' ' },
      { kind: 'checklist', section: 'four' },
      { kind: 'owner', step: 'sign_in' },
      { kind: 'said', by: 'someone' },
    ]) {
      const contents = editedExit((record) => {
        record.exitCriteria[0].evidence = [link as never]
      })
      expect(exitRecordProblems(contents)).toEqual([
        'section_coverage: evidence is not a list of file, checklist or owner links',
      ])
    }
  })
})

describe('the exit checklist’s links', () => {
  it.each(EXIT_CRITERIA.map(({ id }) => id))('fails %s when it links to nothing', (id) => {
    const record = exitedRecord()
    record.exitCriteria.find((row) => row.id === id)!.evidence = []
    expect(exitFailures(record, read)).toEqual([`${id}: no recorded result is linked`])
  })

  it('fails a link to a file that does not exist or does not hold the result', () => {
    const record = exitedRecord()
    record.exitCriteria[0].evidence = [
      { kind: 'file', path: 'docs/journal/1999-01-01.md', anchor: 'passed' },
      { kind: 'file', path: 'docs/journal/2026-10-02.md', anchor: 'a result nobody recorded' },
    ]
    expect(exitFailures(record, read)).toEqual([
      'section_coverage: docs/journal/1999-01-01.md does not exist',
      'section_coverage: docs/journal/2026-10-02.md does not contain the linked result',
    ])
  })

  it('reads a checklist step by its last recorded run', () => {
    const checklist = [
      '### 3.3 Deployed matrix',
      '',
      '| Date | Run by | Result (pass / fail) | Differing rows |',
      '| ---- | ------ | -------------------- | -------------- |',
      '| 2026-10-02 | Agent Runner | fail — not yet deployed | 631 |',
      '| 2026-10-02 | Recovery supervisor | pass | 0 |',
      '',
      '### 3.4 Database lane',
      '',
      '| Date | Run by | Result (pass / fail) |',
      '| ---- | ------ | -------------------- |',
      '| 2026-10-02 | Recovery supervisor | pass |',
      '| 2026-10-03 | Agent Runner | fail |',
      '',
      '### 3.5 Never run',
      '',
      '| Date | Run by | Result (pass / fail) |',
      '| ---- | ------ | -------------------- |',
      '|      |        |                      |',
    ].join('\n')

    expect(lastChecklistRun(checklist, '3.3')).toEqual([
      '2026-10-02',
      'Recovery supervisor',
      'pass',
      '0',
    ])
    expect(lastChecklistRun(checklist, '3.5')).toBeNull()
    expect(lastChecklistRun(checklist, '9.9')).toBeNull()

    const record = exitedRecord()
    record.exitCriteria[0].evidence = [
      { kind: 'checklist', section: '3.3' },
      { kind: 'checklist', section: '3.4' },
      { kind: 'checklist', section: '3.5' },
    ]
    expect(
      exitFailures(record, (path) => (path === CHECKLIST_PATH ? checklist : read(path))).filter(
        (failure) => failure.startsWith('section_coverage: '),
      ),
    ).toEqual([
      'section_coverage: the last recorded run of checklist step 3.4 did not pass',
      'section_coverage: checklist step 3.5 has no recorded run',
    ])
  })

  it.each([
    '| Date | Run by | Result (pass / fail) | Notes |\n| 2026-10-03 | pass | fail | pass |',
    '| Date | Run by | Notes |\n| 2026-10-03 | pass | pass |',
  ])('does not accept pass-like words outside an explicit Result column', (table) => {
    const record = exitedRecord()
    record.exitCriteria[0].evidence = [{ kind: 'checklist', section: '3.3' }]
    const checklist = `### 3.3 Deployed matrix\n\n${table}\n`
    expect(exitFailures(record, (path) => path === CHECKLIST_PATH ? checklist : read(path)))
      .toContain('section_coverage: the last recorded run of checklist step 3.3 did not pass')
  })

  it.each(['fail', 'pass'])('reads the latest table’s own reordered Result column (%s)', (result) => {
    const record = exitedRecord()
    record.exitCriteria[0].evidence = [{ kind: 'checklist', section: '3.3' }]
    const checklist = [
      '### 3.3 Deployed matrix',
      '',
      '| Date | Run by | Result | Notes |',
      '| 2026-10-02 | Operator | pass | first table |',
      '',
      '| Date | Run by | Notes | Result |',
      `| 2026-10-03 | Operator | pass previously | ${result} |`,
    ].join('\n')
    const failures = exitFailures(record, (path) => path === CHECKLIST_PATH ? checklist : read(path))
      .filter((failure) => failure.startsWith('section_coverage: '))
    expect(failures).toEqual(result === 'pass' ? [] : [
      'section_coverage: the last recorded run of checklist step 3.3 did not pass',
    ])
  })

  it('fails the criteria an owner step stands behind until the owner has recorded a pass', () => {
    const unrecorded = { ...exitedRecord(), ownerUat: unrecordedOwnerUat() }
    expect(exitFailures(unrecorded, read)).toEqual([
      'owner_profile_resolution: the owner’s generate_review result is not recorded',
      'owner_inbox_check: the owner’s inbox_check result is not recorded',
      'owner_generate_review: the owner’s generate_review result is not recorded',
    ])

    const failed = recordOwnerResult(exitedRecord(), {
      step: 'inbox_check',
      result: 'fail',
      failedSubStep: 2,
      now: NOW,
    })
    expect(exitFailures(failed, read)).toEqual(['owner_inbox_check: the owner’s inbox_check failed'])
  })
})

describe('the record command', () => {
  /** A directory holding only an unrecorded copy of the exit record. */
  const workspace = () => {
    const root = mkdtempSync(join(tmpdir(), 'release-exit-'))
    mkdirSync(dirname(join(root, EXIT_RECORD_PATH)), { recursive: true })
    writeFileSync(
      join(root, EXIT_RECORD_PATH),
      serializeExitRecord({ ...exitedRecord(), ownerUat: unrecordedOwnerUat() }),
    )
    return root
  }
  const ownerRows = (root: string): ExitRecord['ownerUat'] =>
    JSON.parse(readFileSync(join(root, EXIT_RECORD_PATH), 'utf8')).ownerUat

  it('writes the one step it was given and leaves the other unrecorded', () => {
    const root = workspace()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      expect(runExitCommand(['--record', 'inbox_check', 'pass'], root)).toBe(0)
      expect(ownerRows(root).map((row) => row.result)).toEqual(['pass', 'not_recorded'])
      expect(ownerRows(root)[0].recordedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    } finally {
      log.mockRestore()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it.each(['sb_secret_demo', '482913', 'eyJtest', '3f2b8c1a-9d4e-4b7a-8c2d-1e5f6a7b8c9d'])(
    'refuses a privacy-invalid request identifier before writing (%s)', (requestId) => {
      const root = workspace()
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        const before = readFileSync(join(root, EXIT_RECORD_PATH), 'utf8')
        expect(runExitCommand(['--record', 'generate_review', 'fail', '--request-id', requestId], root))
          .toBe(1)
        expect(readFileSync(join(root, EXIT_RECORD_PATH), 'utf8')).toBe(before)
      } finally {
        error.mockRestore()
        rmSync(root, { recursive: true, force: true })
      }
    },
  )

  it('writes nothing for a result it cannot hold, and fails the check while a step is owed', () => {
    const root = workspace()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const before = readFileSync(join(root, EXIT_RECORD_PATH), 'utf8')
      expect(runExitCommand(['--record', 'inbox_check', 'fail'], root)).toBe(1)
      expect(runExitCommand(['--record', 'generate_review', 'looked fine'], root)).toBe(1)
      expect(readFileSync(join(root, EXIT_RECORD_PATH), 'utf8')).toBe(before)
      expect(runExitCommand(['--check'], root)).toBe(1)
    } finally {
      error.mockRestore()
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('the committed release exit record', () => {
  const record = (): ExitRecord => JSON.parse(committedExit as string)

  it('names both owner steps and every exit criterion, inside the closed vocabulary', () => {
    expect(exitRecordProblems(committedExit)).toEqual([])
  })

  it('contains no code, email content, token or personal data', () => {
    expect(committedExit).not.toBeNull()
    expect(committedExit).not.toMatch(/@|eyJ|sb_secret|sbp_|https?:\/\//)
    expect(committedExit).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
    expect(committedExit).not.toMatch(/(?<![\w-])\d{6,10}(?![\w-])/)
    expect(committedExit).not.toMatch(/example\.com|clear-e2e/)
  })

  it('links every exit criterion that automation or the release operator proved to a recorded result', () => {
    const owed = exitFailures(record(), read).filter((failure) => !failure.includes('the owner’s'))
    expect(owed).toEqual([])
  })

  // These tests fail until the owner performs and reports the step, and the
  // owner or operator records that report. An operator cannot infer a pass.
  it('contains the owner’s result for the inbox check and for generate and review with the real profile', () => {
    expect(record().ownerUat.map((row) => [row.step, row.result])).toEqual([
      ['inbox_check', 'pass'],
      ['generate_review', 'pass'],
    ])
  })

  it('links every release exit criterion to a recorded, passing result', () => {
    expect(exitFailures(record(), read)).toEqual([])
  })
})
