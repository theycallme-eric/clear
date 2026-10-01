/**
 * GR-02 / REQ-002 — the deployed catalog against the committed seed.
 *
 * `npm run gr:matrix -- --deployed --check` needs the hosted project; this
 * suite does not. It drives the same `compareDeployed` the command runs, with
 * a `fetch` double standing where the hosted project would be, and holds four
 * things: identical catalogs pass, a differing one fails naming its rows, a
 * missing credential is a named failure rather than a pass, and nothing the
 * double knows about a person — id, address, key, note — reaches the output or
 * the fixture.
 *
 * The committed `owner-mirror.json` is held to its closed vocabulary here too,
 * so a hand edit that adds a field fails without a credential in sight.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../../../scripts/gen-types/schema.mjs'
import {
  OWNER_MIRROR_PATH,
  buildOwnerMirror,
  createHostedReader,
  diffMatrices,
  missingPrerequisites,
  ownerMirrorProblems,
  readDeployedCatalog,
  serializeOwnerMirror,
} from '../../../scripts/generation-reliability/deployed.mjs'
import { compareDeployed } from '../../../scripts/generation-reliability/legal-state-matrix.mjs'
import { buildMatrix } from '../../../scripts/generation-reliability/matrix.mjs'
import { loadRetrievalRules } from '../../../scripts/generation-reliability/rules.mjs'
import { EQUIPMENT, EQUIPMENT_BY_TIER, SECTIONS_BY_GOAL } from '../../state/onboarding'
import { seededCatalog } from '../seed-catalog'

const rules = loadRetrievalRules()
const equipment = EQUIPMENT.map((item) => item.value)

const inputs = {
  rules,
  catalog: seededCatalog(),
  equipmentByTier: EQUIPMENT_BY_TIER,
  sectionsByGoal: SECTIONS_BY_GOAL,
  equipment,
}

const matrix = buildMatrix(inputs)

// ── The hosted project, as a double ──────────────────────────────────────────

const URL = 'https://hosted.invalid'
const KEY = 'service-role-key-that-must-never-be-printed'
const OWNER_ID = '11111111-2222-4333-8444-555555555555'
const HARNESS_ID = '99999999-2222-4333-8444-555555555555'
const OWNER_EMAIL = 'owner.person@mail.invalid'
const NOTE = 'left shoulder is sore after the move'

const env = { SUPABASE_URL: URL, SUPABASE_SERVICE_ROLE_KEY: KEY }

type CatalogRow = {
  id: string
  equipment_options: readonly string[]
  sections: readonly string[]
  exercise_role: string
  movement_patterns: readonly string[]
}

const seedRows = (): CatalogRow[] =>
  seededCatalog().map((exercise) => ({
    id: exercise.id,
    equipment_options: exercise.equipmentOptions,
    sections: exercise.sections,
    exercise_role: exercise.exerciseRole,
    movement_patterns: exercise.movementPatterns,
  }))

/** A hosted project serving `catalog`, recording every request made of it. */
function hosted(catalog: CatalogRow[]) {
  const requests: { method: string; url: string }[] = []

  const respond = (path: string): unknown => {
    if (path.startsWith('/rest/v1/exercise_catalog')) return catalog
    if (path.startsWith('/auth/v1/admin/users')) {
      return {
        users: [
          { id: OWNER_ID, email: OWNER_EMAIL },
          { id: HARNESS_ID, email: 'clear-e2e-local-a@example.com' },
        ],
      }
    }
    if (path.startsWith('/rest/v1/profiles')) {
      return [
        { id: OWNER_ID, goal_preset: 'balanced', enabled_sections: ['warmup', 'skill_power'] },
        { id: HARNESS_ID, goal_preset: 'strength', enabled_sections: ['warmup'] },
      ]
    }
    if (path.startsWith('/rest/v1/locations')) {
      return [
        {
          tier: 'home',
          is_default: true,
          name: 'Garage',
          location_equipment: [{ equipment_id: 'dumbbells' }, { equipment_id: 'bodyweight' }],
        },
      ]
    }
    if (path.startsWith('/rest/v1/user_constraints')) {
      return [
        { scope: 'movement_pattern', action: 'exclude', persistence: 'persistent', note: NOTE },
        { scope: 'movement_pattern', action: 'exclude', persistence: 'persistent', note: NOTE },
      ]
    }
    throw new Error(`the double has no ${path}`)
  }

  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    requests.push({ method: init?.method ?? 'GET', url })
    return new Response(JSON.stringify(respond(url.slice(URL.length))), { status: 200 })
  }) as typeof globalThis.fetch

  return { fetch, requests }
}

/** One run of the command's deployed half against a double. */
async function run(options: {
  catalog?: CatalogRow[]
  checkOnly?: boolean
  committed?: string | null
  env?: Record<string, string | undefined>
}) {
  const project = hosted(options.catalog ?? seedRows())
  const lines: string[] = []
  const written: { path: string; contents: string }[] = []

  const code = await compareDeployed({
    checkOnly: options.checkOnly ?? true,
    matrix,
    inputs,
    env: options.env ?? env,
    fetch: project.fetch,
    readFile: () => options.committed ?? null,
    writeFile: (path, contents) => written.push({ path, contents }),
    print: (line) => lines.push(line),
  })

  return { code, output: lines.join('\n'), written, requests: project.requests }
}

const acceptable = serializeOwnerMirror(
  buildOwnerMirror({
    profile: { goal_preset: 'balanced', enabled_sections: ['warmup', 'core'] },
    locations: [{ tier: 'minimal', is_default: true, location_equipment: [] }],
    constraints: [],
  }),
)

// Building and comparing the complete legal-state matrix is intentionally
// exhaustive. GitHub's shared runners can take longer than Vitest's five-second
// default while the full suite is running, so this file gets a bounded timeout
// without weakening any assertion or skipping any matrix case.
const matrixIt = (name: string, test: () => void | Promise<void>) =>
  it(name, test, 20_000)

// ─────────────────────────────────────────────────────────────────────────────

describe('the deployed comparison', () => {
  matrixIt('passes when the deployed catalog produces the committed-seed matrix', async () => {
    const { code, output, written } = await run({ committed: acceptable })

    expect(code).toBe(0)
    expect(output).toContain('The deployed and committed-seed matrices are identical.')
    expect(written).toEqual([])
  })

  matrixIt('reads the catalog in the shape the seed reader produces', async () => {
    const reader = createHostedReader({
      url: URL,
      serviceRoleKey: KEY,
      fetch: hosted(seedRows()).fetch,
    })
    const deployed = buildMatrix({ ...inputs, catalog: await readDeployedCatalog(reader) })

    expect(diffMatrices(matrix, deployed)).toEqual([])
  })

  matrixIt('fails and names each differing row when a deployed exercise has drifted', async () => {
    const [first, ...rest] = seedRows()
    const { code, output } = await run({
      catalog: [{ ...first, sections: [] }, ...rest],
      committed: acceptable,
    })

    expect(code).toBe(1)
    expect(output).toMatch(/matrices differ on \d+ rows/)
    // Rows are named by identifier: `section/tier`, `tier/focus/section`, and
    // `goal/focus/tier/profile`. Matched as booleans — the listing is long.
    for (const section of first.sections) {
      expect(output.includes(`  sectionTiers  ${section}/minimal  (differs)`)).toBe(true)
    }
    expect(/^ {2}cells {2}[a-z_]+\/[a-z_]+\/[a-z_]+ {2}\(differs\)$/m.test(output)).toBe(true)
    expect(/^ {2}states {2}[a-z_]+\/[a-z_]+\/[a-z_]+\/\S+ {2}\(differs\)$/m.test(output)).toBe(true)
  })

  matrixIt('fails when the deployed catalog is missing or has gained an exercise', async () => {
    const rows = seedRows()
    const missing = await run({ catalog: rows.slice(1), committed: acceptable })
    const extra = await run({
      catalog: [...rows, { ...rows[0], id: 'zz_not_in_the_seed' }],
      committed: acceptable,
    })

    expect(missing.code).toBe(1)
    expect(missing.output).toContain(
      `constraints  exclude:exercise:${rows[0].id}  (only in committed seed)`,
    )
    expect(extra.code).toBe(1)
    expect(extra.output).toContain(
      'constraints  exclude:exercise:zz_not_in_the_seed  (only in deployed catalog)',
    )
  })

  matrixIt('names every row kind it compares', () => {
    const drifted = buildMatrix({ ...inputs, catalog: seededCatalog().slice(0, 40) })
    const kinds = new Set(diffMatrices(matrix, drifted).map((difference) => difference.kind))

    expect([...kinds].sort()).toEqual(['cells', 'constraints', 'sectionTiers', 'states'])
  })
})

describe('missing prerequisites', () => {
  it.each(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])(
    'fails naming %s and makes no request',
    async (name) => {
      const { code, output, requests } = await run({
        env: { ...env, [name]: '' },
        committed: acceptable,
      })

      expect(code).toBe(1)
      expect(output).toContain('a prerequisite is missing')
      expect(output).toContain(`${name} is not set`)
      expect(output).not.toContain('identical')
      expect(requests).toEqual([])
    },
  )

  matrixIt('names both when neither is supplied', () => {
    expect(missingPrerequisites({})).toHaveLength(2)
  })

  matrixIt('fails rather than passing when the hosted project refuses the read', async () => {
    const lines: string[] = []
    const code = await compareDeployed({
      checkOnly: true,
      matrix,
      inputs,
      env,
      fetch: (async () =>
        new Response(JSON.stringify({ message: KEY }), { status: 401 })) as typeof fetch,
      readFile: () => acceptable,
      print: (line) => lines.push(line),
    })

    expect(code).toBe(1)
    expect(lines.join('\n')).toContain('exercise_catalog from the hosted project failed: HTTP 401')
    expect(lines.join('\n')).not.toContain(KEY)
  })
})

describe('the hosted project is only read', () => {
  matrixIt('issues nothing but GETs, with or without the owner read', async () => {
    const check = await run({ committed: acceptable })
    const record = await run({ checkOnly: false })

    expect(check.requests.length).toBeGreaterThan(0)
    expect(record.requests.length).toBeGreaterThan(check.requests.length)
    for (const request of [...check.requests, ...record.requests]) {
      expect(request.method).toBe('GET')
    }
  })

  matrixIt('does not read the owner profile when a fixture is already committed', async () => {
    const { requests } = await run({ committed: acceptable })

    expect(requests.every((request) => request.url.includes('/rest/v1/exercise_catalog'))).toBe(
      true,
    )
  })
})

describe('the owner-mirror fixture', () => {
  matrixIt('is recorded once: written when absent, left alone when committed', async () => {
    const absent = await run({ committed: null })
    const present = await run({ committed: acceptable })

    expect(absent.code).toBe(0)
    expect(absent.written).toHaveLength(1)
    expect(absent.written[0].path).toBe(join(REPO_ROOT, OWNER_MIRROR_PATH))
    expect(present.written).toEqual([])
  })

  matrixIt('mirrors the one onboarded non-harness profile and nothing that identifies it', async () => {
    const { written } = await run({ checkOnly: false })
    const mirror = JSON.parse(written[0].contents)

    expect(mirror).toMatchObject({
      goal: 'balanced',
      enabledSections: ['warmup', 'skill_power'],
      tier: 'home',
      equipment: ['bodyweight', 'dumbbells'],
      exclusions: [
        { scope: 'movement_pattern', action: 'exclude', persistence: 'persistent', count: 2 },
      ],
    })
    for (const secret of [OWNER_ID, HARNESS_ID, OWNER_EMAIL, NOTE, KEY, 'Garage']) {
      expect(written[0].contents).not.toContain(secret)
    }
    expect(ownerMirrorProblems(written[0].contents, rules.enums, equipment)).toEqual([])
  })

  matrixIt('is not written when the matrices differ', async () => {
    const { code, written } = await run({ catalog: seedRows().slice(1), checkOnly: false })

    expect(code).toBe(1)
    expect(written).toEqual([])
  })

  matrixIt('fails the check when it is absent and cannot be recorded, or is unacceptable', async () => {
    const mirror = JSON.parse(acceptable)
    const withNote = JSON.stringify({ ...mirror, note: NOTE })
    const withId = JSON.stringify({ ...mirror, equipment: [OWNER_ID] })
    const withEmail = JSON.stringify({ ...mirror, goal: OWNER_EMAIL })
    const withTarget = JSON.stringify({
      ...mirror,
      exclusions: [{ scope: 'equipment', action: 'exclude', persistence: 'persistent', count: 1, target: 'x' }],
    })

    expect(ownerMirrorProblems(null, rules.enums, equipment)).toEqual([
      `${OWNER_MIRROR_PATH} does not exist.`,
    ])
    expect(ownerMirrorProblems('{', rules.enums, equipment)).toHaveLength(1)
    for (const contents of [withNote, withId, withEmail, withTarget]) {
      expect(ownerMirrorProblems(contents, rules.enums, equipment).length).toBeGreaterThan(0)
      expect((await run({ committed: contents })).code).toBe(1)
    }
  })

  matrixIt('is committed, and holds only enumerated values and equipment ids', () => {
    const committed = readFileSync(join(REPO_ROOT, OWNER_MIRROR_PATH), 'utf8')
    const mirror = JSON.parse(committed)

    expect(ownerMirrorProblems(committed, rules.enums, equipment)).toEqual([])
    expect(Object.keys(mirror).sort()).toEqual(
      ['enabledSections', 'equipment', 'exclusions', 'generatedBy', 'goal', 'notes', 'tier', 'version'],
    )
    expect(committed).not.toMatch(/@|[0-9a-f]{8}-[0-9a-f]{4}-|eyJ/)
    // The audit's finding, which later lanes replay: the owner enables a
    // section the catalog cannot fill.
    expect(mirror.enabledSections).toContain('skill_power')
  })
})

describe('output', () => {
  matrixIt('carries only counts, section names and row identifiers', async () => {
    const rows = seedRows()
    const runs = [
      await run({ committed: acceptable }),
      await run({ checkOnly: false }),
      await run({ catalog: [{ ...rows[0], sections: [] }, ...rows.slice(1)], committed: acceptable }),
    ]

    for (const { output } of runs) {
      for (const secret of [KEY, URL, OWNER_ID, HARNESS_ID, OWNER_EMAIL, NOTE, 'Garage']) {
        expect(output).not.toContain(secret)
      }
      expect(output).not.toMatch(/@[a-z0-9-]+\.[a-z]+|[0-9a-f]{8}-[0-9a-f]{4}-|eyJ/i)
    }
  })
})
