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
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

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
