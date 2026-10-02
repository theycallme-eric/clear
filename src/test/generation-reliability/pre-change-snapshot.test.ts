/**
 * GR-07 / REQ-027 — the pre-change snapshot and its manifest.
 *
 * `npm run gr:snapshot` needs the hosted project; this suite does not. The
 * first half drives the same `captureSnapshot` the command runs, with a `fetch`
 * double standing where the hosted project and the deployment provider would
 * be, and holds: every request is a GET, the rows land outside the repository,
 * the manifest carries the deployed commit with a count and a hash per
 * relation and nothing a row contained, the pre-change matrix is recorded, and
 * the committed migration followed by the committed rollback gives the
 * captured section tags back. Nothing is written when any of that fails.
 *
 * The second half holds the committed manifest to its shape and to the
 * committed migration and rollback script. It fails until the capture has been
 * run against the hosted project and its manifest committed — which is the
 * point: no manifest, no release.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { REPO_ROOT, loadSnapshot } from '../../../scripts/catalog-seed/sources.mjs'
import {
  MIGRATION_PATH,
  ROLLBACK_SQL_PATH,
  parseMigration,
} from '../../../scripts/generation-reliability/catalog-repair.mjs'
import { buildMatrix } from '../../../scripts/generation-reliability/matrix.mjs'
import {
  CAPTURED_RELATIONS,
  MANIFEST_PATH,
  MATRIX_CAPTURE_FILE,
  captureSnapshot,
  manifestProblems,
  rehearseRollback,
  sha256,
} from '../../../scripts/generation-reliability/pre-change-snapshot.mjs'
import { loadRetrievalRules } from '../../../scripts/generation-reliability/rules.mjs'
import { EQUIPMENT, EQUIPMENT_BY_TIER, SECTIONS_BY_GOAL } from '../../state/onboarding'
import { seededCatalog } from '../seed-catalog'

const read = (path: string) => readFileSync(join(REPO_ROOT, path), 'utf8')
const readIfPresent = (path: string) => {
  try {
    return read(path)
  } catch {
    return null
  }
}

const rules = loadRetrievalRules()
const inputs = {
  rules,
  catalog: seededCatalog(),
  equipmentByTier: EQUIPMENT_BY_TIER,
  sectionsByGoal: SECTIONS_BY_GOAL,
  equipment: EQUIPMENT.map((item) => item.value),
}
const matrix = buildMatrix(inputs)

const migrationSql = read(MIGRATION_PATH)
const rollbackSql = read(ROLLBACK_SQL_PATH)
const repairedExercises = parseMigration(migrationSql).length

// ── The hosted project and the deployment provider, as a double ──────────────

const URL = 'https://hosted.invalid'
const KEY = 'service-role-key-that-must-never-be-printed'
const TOKEN = 'deployment-token-that-must-never-be-printed'
const USER_ID = '11111111-2222-4333-8444-555555555555'
const DISPLAY_NAME = 'Owner Person'
const DEPLOYED_SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const OUT = '/somewhere/outside/the-repository/capture'
const NOW = new Date('2026-10-02T12:00:00.000Z')

const env = { SUPABASE_URL: URL, SUPABASE_SERVICE_ROLE_KEY: KEY, VERCEL_TOKEN: TOKEN }

/** The pre-change catalog is the committed capture: no repair applied. */
const captured = new Map(loadSnapshot().definitions.map((row) => [row.id, row]))

type DefinitionRow = { id: string; name: string; sections: string[]; can_be_primary: boolean }

const preChangeDefinitions = (): DefinitionRow[] =>
  [...captured.values()].map((row) => ({
    id: row.id,
    name: `Exercise ${row.id}`,
    sections: [...row.sections],
    can_be_primary: row.canBePrimary,
  }))

/** The migration's own `update`, as the database would have applied it. */
const repairedDefinitions = (): DefinitionRow[] => {
  const changes = new Map(parseMigration(migrationSql).map((change) => [change.id, change]))
  return preChangeDefinitions().map((row) => {
    const change = changes.get(row.id)
    if (change === undefined) return row
    return {
      ...row,
      sections: [...row.sections, ...change.add.filter((s) => !row.sections.includes(s))],
      can_be_primary: row.can_be_primary || change.makePrimary,
    }
  })
}

type Deployment = { created: number; meta: Record<string, string> }

const deployments = (): Deployment[] => [
  {
    created: Date.parse('2026-10-01T09:00:00.000Z'),
    meta: { githubOrg: 'theycallme-eric', githubRepo: 'clear', githubCommitSha: DEPLOYED_SHA },
  },
  {
    // Newer, but another repository's: not the deployed commit.
    created: Date.parse('2026-10-02T09:00:00.000Z'),
    meta: {
      githubOrg: 'theycallme-eric',
      githubRepo: 'another',
      githubCommitSha: 'f'.repeat(40),
    },
  },
]

function hosted(options: {
  definitions?: DefinitionRow[]
  deployments?: Deployment[]
  deploymentStatus?: number
}) {
  const requests: { method: string; url: string }[] = []
  const definitions = options.definitions ?? preChangeDefinitions()
  const sections = new Map(definitions.map((row) => [row.id, row.sections]))

  const respond = (url: string): unknown => {
    if (url.startsWith('https://api.vercel.com/')) {
      return { deployments: options.deployments ?? deployments() }
    }
    const path = url.slice(URL.length)
    if (path.startsWith('/rest/v1/exercise_definitions')) return definitions
    if (path.startsWith('/rest/v1/exercise_muscle_groups')) {
      return [{ exercise_id: 'push-ups', muscle_group: 'chest', role: 'primary' }]
    }
    if (path.startsWith('/rest/v1/exercise_pattern_weights')) {
      return [{ exercise_id: 'push-ups', movement_pattern: 'horizontal_push', weight: 1 }]
    }
    if (path.startsWith('/rest/v1/profiles')) {
      return [{ id: USER_ID, display_name: DISPLAY_NAME, goal_preset: 'balanced' }]
    }
    if (path.startsWith('/rest/v1/exercise_catalog')) {
      return seededCatalog().map((exercise) => ({
        id: exercise.id,
        equipment_options: exercise.equipmentOptions,
        sections: sections.get(exercise.id) ?? exercise.sections,
        exercise_role: exercise.exerciseRole,
        movement_patterns: exercise.movementPatterns,
      }))
    }
    throw new Error(`the double has no ${path}`)
  }

  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    requests.push({ method: init?.method ?? 'GET', url })
    const failed = url.startsWith('https://api.vercel.com/') && options.deploymentStatus
    if (failed) return new Response(JSON.stringify({ error: TOKEN }), { status: failed })
    return new Response(JSON.stringify(respond(url)), { status: 200 })
  }) as typeof globalThis.fetch

  return { fetch, requests }
}

/** One run of the capture against a double, with nothing touching the disk. */
async function run(
  options: Parameters<typeof hosted>[0] & {
    env?: Record<string, string | undefined>
    outDir?: string
    existing?: string[]
    rollbackSql?: string
  } = {},
) {
  const project = hosted(options)
  const lines: string[] = []
  const captureFiles: { path: string; contents: string }[] = []
  const manifests: { path: string; contents: string }[] = []

  const code = await captureSnapshot({
    env: options.env ?? env,
    outDir: 'outDir' in options ? options.outDir : OUT,
    inputs,
    matrix,
    migrationSql,
    rollbackSql: options.rollbackSql ?? rollbackSql,
    fetch: project.fetch,
    writeCapture: (path, contents) => captureFiles.push({ path, contents }),
    writeManifest: (path, contents) => manifests.push({ path, contents }),
    makeDirectory: () => {},
    exists: () => options.existing !== undefined,
    list: () => options.existing ?? [],
    now: () => NOW,
    print: (line) => lines.push(line),
  })

  return {
    code,
    output: lines.join('\n'),
    captureFiles,
    manifests,
    requests: project.requests,
    manifest: manifests[0] === undefined ? null : JSON.parse(manifests[0].contents),
  }
}

const wroteNothing = (result: Awaited<ReturnType<typeof run>>) =>
  result.captureFiles.length === 0 && result.manifests.length === 0

describe('capturing the pre-change snapshot', () => {
  it('reads the deployed commit, every relation and the deployed catalog', async () => {
    const result = await run()

    expect(result.output).toContain('No write was made to the hosted project.')
    expect(result.code).toBe(0)
    expect(result.requests.some(({ url }) => url.startsWith('https://api.vercel.com/'))).toBe(true)
    for (const { relation } of CAPTURED_RELATIONS) {
      expect(result.requests.some(({ url }) => url.includes(`/rest/v1/${relation}?`))).toBe(true)
    }
    expect(result.requests.some(({ url }) => url.includes('/rest/v1/exercise_catalog?'))).toBe(true)
  })

  it('makes no write to the hosted project: every request is a GET', async () => {
    const { requests } = await run()

    expect(requests.length).toBeGreaterThan(0)
    expect(requests.filter(({ method }) => method !== 'GET')).toEqual([])
  })

  it('writes every captured row outside the repository', async () => {
    const { captureFiles, manifests } = await run()

    expect(captureFiles.map(({ path }) => path)).toEqual([
      ...CAPTURED_RELATIONS.map(({ relation }) => join(OUT, `${relation}.jsonl`)),
      join(OUT, MATRIX_CAPTURE_FILE),
    ])
    for (const { path } of captureFiles) expect(path.startsWith(REPO_ROOT)).toBe(false)
    expect(captureFiles[0].contents.trimEnd().split('\n')).toHaveLength(captured.size)
    expect(captureFiles.find(({ path }) => path.endsWith('profiles.jsonl'))?.contents).toContain(
      USER_ID,
    )
    expect(manifests.map(({ path }) => path)).toEqual([join(REPO_ROOT, MANIFEST_PATH)])
  })

  it('records the deployed commit, and a row count and hash for every relation', async () => {
    const { manifest, captureFiles } = await run()

    expect(manifest.deployedCommit.sha).toBe(DEPLOYED_SHA)
    expect(manifest.capturedAt).toBe(NOW.toISOString())
    expect(manifest.capture.relations).toEqual(
      CAPTURED_RELATIONS.map(({ relation }, index) => ({
        relation,
        file: `${relation}.jsonl`,
        rows: captureFiles[index].contents.trimEnd().split('\n').length,
        sha256: sha256(captureFiles[index].contents),
      })),
    )
  })

  it('puts nothing a row contained, and no credential, in the manifest or the output', async () => {
    const { manifests, output } = await run()

    for (const text of [manifests[0].contents, output]) {
      for (const secret of [USER_ID, DISPLAY_NAME, KEY, TOKEN, URL, OUT, 'Exercise push-ups']) {
        expect(text).not.toContain(secret)
      }
    }
    expect(manifestProblems(manifests[0].contents, rules.enums)).toEqual([])
  })

  it('records the pre-change deployed matrix and how far it is from the committed seed', async () => {
    const { manifest, captureFiles } = await run()
    const recorded = manifest.deployedMatrix
    const written = captureFiles.find(({ path }) => path.endsWith(MATRIX_CAPTURE_FILE))

    expect(recorded.sha256).toBe(sha256(written?.contents ?? ''))
    expect(recorded.catalogRows).toBe(captured.size)
    expect(recorded.sectionTiers).toEqual(JSON.parse(written?.contents ?? '{}').sectionTiers)

    // Before the repair the three sections are empty, which is what the
    // committed seed's matrix no longer says.
    for (const section of ['skill_power', 'carries', 'stability_balance']) {
      const rows = recorded.sectionTiers.filter((row: { section: string }) => row.section === section)
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.every((row: { catalogRows: number }) => row.catalogRows === 0)).toBe(true)
    }
    expect(recorded.differencesFromCommittedSeed.sectionTiers).toBeGreaterThan(0)
    expect(recorded.differencesFromCommittedSeed.states).toBeGreaterThan(0)
  })

  it('records the rollback as verified: it restores the captured section tags', async () => {
    const { manifest } = await run()

    expect(manifest.rollback).toMatchObject({
      verified: true,
      migration: MIGRATION_PATH,
      migrationSha256: sha256(migrationSql),
      script: ROLLBACK_SQL_PATH,
      scriptSha256: sha256(rollbackSql),
      exercisesRepaired: repairedExercises,
      exercisesRestored: repairedExercises,
    })

    const rehearsal = rehearseRollback({
      definitions: preChangeDefinitions(),
      migrationSql,
      rollbackSql,
    })
    expect(rehearsal.problems).toEqual([])
    expect(manifest.rollback.sectionTagsSha256).toBe(rehearsal.sectionTagsSha256)
  })

  it.each(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VERCEL_TOKEN'])(
    'fails naming %s when it is missing, without a request',
    async (name) => {
      const result = await run({ env: { ...env, [name]: '' } })

      expect(result.code).toBe(1)
      expect(result.output).toContain(`${name} is not set`)
      expect(result.requests).toEqual([])
      expect(wroteNothing(result)).toBe(true)
    },
  )

  it('refuses a missing capture directory, and one inside the repository', async () => {
    for (const outDir of [undefined, REPO_ROOT, join(REPO_ROOT, 'backups', 'capture')]) {
      const result = await run({ outDir })

      expect(result.code).toBe(1)
      expect(result.requests).toEqual([])
      expect(wroteNothing(result)).toBe(true)
    }
  })

  it('refuses to write over an existing capture', async () => {
    const result = await run({ existing: ['profiles.jsonl'] })

    expect(result.code).toBe(1)
    expect(result.output).toContain('never written over')
    expect(result.requests).toEqual([])
    expect(wroteNothing(result)).toBe(true)
  })

  it('fails on a catalog that already carries the repair, writing nothing', async () => {
    const result = await run({ definitions: repairedDefinitions() })

    expect(result.code).toBe(1)
    expect(result.output).toContain('the capture is not pre-change')
    expect(wroteNothing(result)).toBe(true)
  })

  it('fails when the rollback does not give the capture back, naming the exercise', async () => {
    // A rollback script that restores one exercise to the wrong tags.
    const wrong = rollbackSql.replace(
      "('push-ups', array['accessory', 'conditioning', 'warmup']",
      "('push-ups', array['accessory', 'conditioning']",
    )
    expect(wrong).not.toBe(rollbackSql)

    const result = await run({ rollbackSql: wrong })

    expect(result.code).toBe(1)
    expect(result.output).toContain('the rollback does not give the capture back for "push-ups"')
    expect(wroteNothing(result)).toBe(true)
  })

  it('reports a refused deployment read as a status, writing nothing', async () => {
    const result = await run({ deploymentStatus: 403 })

    expect(result.code).toBe(1)
    expect(result.output).toContain('HTTP 403')
    expect(result.output).not.toContain(TOKEN)
    expect(wroteNothing(result)).toBe(true)
  })

  it('refuses a deployment list that names no full commit of this repository', async () => {
    const result = await run({ deployments: deployments().slice(1) })

    expect(result.code).toBe(1)
    expect(result.output).toContain('no ready production deployment names a full commit')
    expect(wroteNothing(result)).toBe(true)
  })
})

/** The parts of a manifest the edits below reach, plus fields it must not have. */
type Draft = {
  owner?: string
  deployedCommit: { sha: string; source: string }
  capture: { directory?: string; relations: { sha256: string; sample?: unknown }[] }
  deployedMatrix: { sectionTiers: { candidates: number }[] }
  rollback: { verified: boolean; exercisesRestored: number }
}

describe('the manifest rules', () => {
  const acceptable = async () => (await run()).manifests[0].contents
  const edited = async (edit: (manifest: Draft) => void) => {
    const manifest = JSON.parse(await acceptable()) as Draft
    edit(manifest)
    return `${JSON.stringify(manifest, null, 2)}\n`
  }
  const files = { migrationSql, rollbackSql }

  it('refuses a missing or unreadable manifest', () => {
    expect(manifestProblems(null, rules.enums)).toEqual([`${MANIFEST_PATH} does not exist.`])
    expect(manifestProblems('{', rules.enums)).toEqual([`${MANIFEST_PATH} is not valid JSON.`])
  })

  it('refuses a field the manifest does not define', async () => {
    for (const edit of [
      (manifest: Draft) => (manifest.owner = 'someone'),
      (manifest: Draft) => (manifest.capture.directory = 'capture'),
      (manifest: Draft) => (manifest.capture.relations[3].sample = { goal_preset: 'balanced' }),
    ]) {
      expect(manifestProblems(await edited(edit), rules.enums)).not.toEqual([])
    }
  })

  it.each([
    ['an email address', 'owner.person@mail.invalid'],
    ['a user id', USER_ID],
    ['a token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6.eyJpc3MiOiJzdXBhYmFzZSIs'],
    ['a key', 'sb_secret_abcdefghijklmnop'],
    ['a connection string or address', 'postgresql://postgres:secret@db.invalid:5432/postgres'],
    ['a local path', '/Users/someone/backups/capture'],
  ])('refuses %s wherever it appears', async (label, value) => {
    const problems = manifestProblems(
      await edited((manifest) => (manifest.deployedCommit.source = value)),
      rules.enums,
    )

    expect(problems).toContain(`${MANIFEST_PATH} contains ${label}.`)
  })

  it('refuses a short commit, a missing relation, and an unverified rollback', async () => {
    for (const edit of [
      (manifest: Draft) => (manifest.deployedCommit.sha = DEPLOYED_SHA.slice(0, 7)),
      (manifest: Draft) => manifest.capture.relations.pop(),
      (manifest: Draft) => (manifest.capture.relations[0].sha256 = 'unknown'),
      (manifest: Draft) => (manifest.rollback.verified = false),
      (manifest: Draft) => (manifest.rollback.exercisesRestored -= 1),
      (manifest: Draft) => (manifest.deployedMatrix.sectionTiers[0].candidates += 1),
    ]) {
      expect(manifestProblems(await edited(edit), rules.enums)).not.toEqual([])
    }
  })

  it('ties the recorded verification to the exact committed files', async () => {
    const manifest = await acceptable()

    expect(manifestProblems(manifest, rules.enums, files)).toEqual([])
    expect(
      manifestProblems(manifest, rules.enums, { ...files, rollbackSql: `${rollbackSql}\n` }),
    ).toEqual([`${MANIFEST_PATH} rollback was verified against a different ${ROLLBACK_SQL_PATH}.`])
    expect(
      manifestProblems(manifest, rules.enums, { ...files, migrationSql: `${migrationSql}\n` }),
    ).toEqual([`${MANIFEST_PATH} rollback was verified against a different ${MIGRATION_PATH}.`])
  })
})

describe('the committed pre-change snapshot', () => {
  const committed = readIfPresent(MANIFEST_PATH)
  const manifest = () => JSON.parse(committed ?? 'null')

  it('has the manifest shape and holds no user data or secret', () => {
    expect(manifestProblems(committed, rules.enums)).toEqual([])
  })

  it('records the deployed commit, and a count and hash for the catalog and the profiles', () => {
    expect(committed).not.toBeNull()
    const { deployedCommit, capture } = manifest()

    expect(deployedCommit.sha).toMatch(/^[0-9a-f]{40}$/)
    for (const relation of ['exercise_definitions', 'profiles']) {
      const entry = capture.relations.find((row: { relation: string }) => row.relation === relation)
      expect(Number.isInteger(entry.rows)).toBe(true)
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  it('records the pre-change deployed matrix for comparison', () => {
    expect(committed).not.toBeNull()
    const { deployedMatrix } = manifest()

    expect(deployedMatrix.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(deployedMatrix.sectionTiers).toHaveLength(
      rules.enums.section_type.length * rules.enums.equipment_tier.length,
    )
  })

  it('records the rollback as verified against the committed migration and script', () => {
    expect(manifestProblems(committed, rules.enums, { migrationSql, rollbackSql })).toEqual([])
    expect(manifest().rollback.verified).toBe(true)
  })

  it('is the only thing the capture left in the repository', () => {
    // The capture files are named for their relations; none may be committed
    // beside the manifest.
    for (const { relation } of CAPTURED_RELATIONS) {
      expect(readIfPresent(`docs/process/generation-reliability/${relation}.jsonl`)).toBeNull()
    }
    expect(readIfPresent(`docs/process/generation-reliability/${MATRIX_CAPTURE_FILE}`)).toBeNull()
  })
})
