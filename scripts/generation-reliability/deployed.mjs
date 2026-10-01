/**
 * GR-02 / REQ-002 — the deployed half of `npm run gr:matrix -- --deployed`.
 *
 * Two read-only questions are asked of the hosted project, and nothing else:
 *
 * 1. What does `exercise_catalog` contain? The answer goes through the same
 *    `buildMatrix` as the committed seed, and `diffMatrices` names every row
 *    on which the two disagree.
 * 2. What has the owner saved? Goal, enabled sections, equipment ids and
 *    exclusion scopes are reduced to `owner-mirror.json`, a fixture later
 *    lanes replay. Nothing that identifies a person survives the reduction:
 *    no id, address, location name, constraint target or note.
 *
 * Read-only is enforced rather than promised: `createHostedReader` exposes one
 * operation, a GET, and has no way to issue anything else. It never returns or
 * throws a response body, a key or an address — a failure is a status code and
 * the name of what was being read.
 *
 * Everything here is a function of its arguments. The command
 * (`legal-state-matrix.mjs`) supplies the environment and the real `fetch`;
 * the test supplies a double.
 */

import { isHarnessEmail } from '../e2e/namespace.mjs'

export const OWNER_MIRROR_PATH = 'src/test/generation-reliability/owner-mirror.json'

/** Local-only files the Agent Runner supplies; the process environment wins. */
export const ENV_FILES = ['.env.runner.local', '.env.audit.local']

/** What the deployed read needs, and where each is expected locally. */
export const PREREQUISITES = Object.freeze([
  { name: 'SUPABASE_URL', file: '.env.runner.local' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', file: '.env.audit.local' },
])

/**
 * The prerequisites `env` does not supply, as sentences naming them.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function missingPrerequisites(env) {
  return PREREQUISITES.filter(({ name }) => (env[name] ?? '').trim() === '').map(
    ({ name, file }) => `${name} is not set (the process environment or ${file}).`,
  )
}

/** A hosted read that did not succeed. Carries no body, key or address. */
export class HostedReadError extends Error {
  /**
   * @param {string} what
   * @param {string} detail
   */
  constructor(what, detail) {
    super(`reading ${what} from the hosted project failed: ${detail}`)
    this.name = 'HostedReadError'
  }
}

const PAGE_SIZE = 1000
const MAX_PAGES = 20

/**
 * The only access this lane has to the hosted project: GET, paged to the end.
 *
 * @param {{ url: string, serviceRoleKey: string, fetch?: typeof fetch }} options
 */
export function createHostedReader({ url, serviceRoleKey, fetch: doFetch = fetch }) {
  const base = url.replace(/\/+$/, '')

  /**
   * @param {string} what
   * @param {string} path
   */
  async function get(what, path) {
    let response
    try {
      response = await doFetch(`${base}${path}`, {
        method: 'GET',
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      })
    } catch {
      throw new HostedReadError(what, 'the request did not complete')
    }
    if (!response.ok) throw new HostedReadError(what, `HTTP ${response.status}`)

    try {
      return await response.json()
    } catch {
      throw new HostedReadError(what, 'the response was not JSON')
    }
  }

  return {
    /**
     * Every row of a PostgREST relation. A ceiling rather than `while (true)`:
     * a paging bug should stop, not spin against a live project.
     *
     * @param {string} what
     * @param {string} relation
     * @param {string} query  `select=…&order=…`, without paging.
     * @returns {Promise<any[]>}
     */
    async rows(what, relation, query) {
      const found = []
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const body = await get(
          what,
          `/rest/v1/${relation}?${query}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
        )
        if (!Array.isArray(body)) throw new HostedReadError(what, 'the response was not a list')
        found.push(...body)
        if (body.length < PAGE_SIZE) break
      }
      return found
    },

    /** @returns {Promise<any[]>} Every auth user, paged to the end. */
    async users() {
      const found = []
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const body = await get(
          'the user list',
          `/auth/v1/admin/users?page=${page}&per_page=${PAGE_SIZE}`,
        )
        const users = Array.isArray(body) ? body : (body?.users ?? [])
        found.push(...users)
        if (users.length < PAGE_SIZE) break
      }
      return found
    },
  }
}

/** @typedef {ReturnType<typeof createHostedReader>} HostedReader */

// ── The deployed catalog ─────────────────────────────────────────────────────

const strings = (/** @type {unknown} */ value) =>
  Array.isArray(value) ? value.map((entry) => String(entry)) : []

/**
 * `exercise_catalog` rows as `buildMatrix` reads them.
 *
 * @param {HostedReader} reader
 * @returns {Promise<import('./matrix.mjs').CatalogExercise[]>}
 */
export async function readDeployedCatalog(reader) {
  const rows = await reader.rows(
    'exercise_catalog',
    'exercise_catalog',
    'select=id,equipment_options,sections,exercise_role,movement_patterns&order=id',
  )

  return rows.map((row) => ({
    id: String(row.id),
    equipmentOptions: strings(row.equipment_options),
    sections: strings(row.sections),
    exerciseRole: String(row.exercise_role),
    movementPatterns: strings(row.movement_patterns),
  }))
}

/** The row arrays compared, in the order they are reported. */
const COMPARED_ROWS = ['sectionTiers', 'cells', 'states', 'constraints']

/**
 * Every row on which two matrices disagree, by identifier.
 *
 * @param {Record<string, any>} seed
 * @param {Record<string, any>} deployed
 * @returns {{ kind: string, id: string, reason: 'differs' | 'only in committed seed' | 'only in deployed catalog' }[]}
 */
export function diffMatrices(seed, deployed) {
  /** @type {ReturnType<typeof diffMatrices>} */
  const differences = []

  for (const kind of COMPARED_ROWS) {
    /** @type {Map<string, string>} */
    const seedRows = new Map(seed[kind].map((/** @type {any} */ row) => [row.id, JSON.stringify(row)]))
    /** @type {Map<string, string>} */
    const deployedRows = new Map(
      deployed[kind].map((/** @type {any} */ row) => [row.id, JSON.stringify(row)]),
    )

    for (const [id, row] of seedRows) {
      const other = deployedRows.get(id)
      if (other === undefined) differences.push({ kind, id, reason: 'only in committed seed' })
      else if (other !== row) differences.push({ kind, id, reason: 'differs' })
    }
    for (const id of deployedRows.keys()) {
      if (!seedRows.has(id)) differences.push({ kind, id, reason: 'only in deployed catalog' })
    }
  }

  return differences
}

// ── The owner's saved configuration ──────────────────────────────────────────

export const OWNER_MIRROR_VERSION = 1

/**
 * Read the owner's saved configuration and reduce it to the fixture.
 *
 * The owner is the one onboarded profile that is not a harness user; any other
 * number is a refusal, because a fixture named for the owner that mirrors
 * somebody else is worse than none.
 *
 * @param {HostedReader} reader
 */
export async function readOwnerMirror(reader) {
  const harness = new Set(
    (await reader.users()).filter((user) => isHarnessEmail(user?.email)).map((user) => user.id),
  )
  const profiles = (
    await reader.rows(
      'profiles',
      'profiles',
      'select=id,goal_preset,enabled_sections,onboarded_at&onboarded_at=not.is.null&order=created_at',
    )
  ).filter((profile) => !harness.has(profile.id))

  if (profiles.length !== 1) {
    throw new Error(
      `expected exactly one onboarded non-harness profile to mirror, found ${profiles.length}`,
    )
  }
  const [profile] = profiles
  const owner = encodeURIComponent(profile.id)

  const locations = await reader.rows(
    'locations',
    'locations',
    `select=tier,is_default,location_equipment(equipment_id)&user_id=eq.${owner}&order=created_at`,
  )
  const constraints = await reader.rows(
    'user_constraints',
    'user_constraints',
    `select=scope,action,persistence&user_id=eq.${owner}&order=created_at`,
  )

  return buildOwnerMirror({ profile, locations, constraints })
}

/**
 * The fixture, from rows. Only enumerated values and equipment ids are copied
 * across; everything else on the rows is dropped by not being named here.
 *
 * @param {{ profile: any, locations: any[], constraints: any[] }} rows
 */
export function buildOwnerMirror({ profile, locations, constraints }) {
  const location = locations.find((candidate) => candidate.is_default) ?? locations[0]
  if (location === undefined) throw new Error('the mirrored profile has no location')

  const tally = new Map()
  for (const { scope, action, persistence } of constraints) {
    const key = JSON.stringify([scope, action, persistence])
    tally.set(key, (tally.get(key) ?? 0) + 1)
  }

  return {
    version: OWNER_MIRROR_VERSION,
    generatedBy: 'npm run gr:matrix -- --deployed',
    notes: [
      'Generated from one read-only pass over the hosted project. Do not edit.',
      'The owner’s saved configuration, reduced to enumerated values and equipment ids.',
      'equipment is the default location’s. exclusions lists scopes only: no target and no note is recorded.',
    ],
    goal: profile.goal_preset,
    enabledSections: strings(profile.enabled_sections),
    tier: location.tier,
    equipment: strings(
      (location.location_equipment ?? []).map((/** @type {any} */ row) => row.equipment_id),
    ).sort(),
    exclusions: [...tally]
      .map(([key, count]) => {
        const [scope, action, persistence] = JSON.parse(key)
        return { scope, action, persistence, count }
      })
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  }
}

/** @param {ReturnType<typeof buildOwnerMirror>} mirror */
export function serializeOwnerMirror(mirror) {
  return `${JSON.stringify(mirror, null, 2)}\n`
}

const MIRROR_KEYS = [
  'version',
  'generatedBy',
  'notes',
  'goal',
  'enabledSections',
  'tier',
  'equipment',
  'exclusions',
]
const EXCLUSION_KEYS = ['scope', 'action', 'persistence', 'count']

/** What must never reach the fixture, whatever field it arrived in. */
const SENSITIVE = [
  [/[^\s"@]+@[^\s"@]+\.[a-z]{2,}/i, 'an email address'],
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, 'a user id'],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'a token'],
  [/\bsb_(secret|publishable)_[A-Za-z0-9_-]+|\bsbp_[A-Za-z0-9]+/, 'a key'],
  [/"(note|name|email|id|user_id)"\s*:/i, 'a free-text or identifying field'],
]

/**
 * Why the committed fixture is not acceptable, one sentence each. Every value
 * must come from a closed vocabulary, which is what makes "no free text" a
 * property that can be checked rather than asserted.
 *
 * @param {string | null} committed
 * @param {Record<string, string[]>} enums
 * @param {readonly string[]} equipment  Every equipment id the product offers.
 * @returns {string[]}
 */
export function ownerMirrorProblems(committed, enums, equipment) {
  if (committed === null) return [`${OWNER_MIRROR_PATH} does not exist.`]

  /** @type {any} */
  let mirror
  try {
    mirror = JSON.parse(committed)
  } catch {
    return [`${OWNER_MIRROR_PATH} is not valid JSON.`]
  }

  const problems = []
  const outside = (/** @type {unknown} */ values, /** @type {readonly string[]} */ allowed) =>
    !Array.isArray(values) || values.some((value) => !allowed.includes(value))

  for (const [pattern, label] of SENSITIVE) {
    // The notes are this module's own constants; only the data is searched.
    if (pattern.test(JSON.stringify({ ...mirror, notes: [] }))) {
      problems.push(`${OWNER_MIRROR_PATH} contains ${label}.`)
    }
  }
  if (Object.keys(mirror ?? {}).some((key) => !MIRROR_KEYS.includes(key))) {
    problems.push(`${OWNER_MIRROR_PATH} carries a field the fixture does not define.`)
  }
  if (!enums.goal_preset.includes(mirror?.goal)) {
    problems.push(`${OWNER_MIRROR_PATH} goal is not a goal_preset value.`)
  }
  if (outside(mirror?.enabledSections, enums.section_type) || mirror.enabledSections.length === 0) {
    problems.push(`${OWNER_MIRROR_PATH} enabledSections is not a list of section_type values.`)
  }
  if (!enums.equipment_tier.includes(mirror?.tier)) {
    problems.push(`${OWNER_MIRROR_PATH} tier is not an equipment_tier value.`)
  }
  if (outside(mirror?.equipment, equipment)) {
    problems.push(`${OWNER_MIRROR_PATH} equipment is not a list of known equipment ids.`)
  }
  if (
    !Array.isArray(mirror?.exclusions) ||
    mirror.exclusions.some(
      (/** @type {any} */ row) =>
        Object.keys(row ?? {}).some((key) => !EXCLUSION_KEYS.includes(key)) ||
        !enums.constraint_scope.includes(row?.scope) ||
        !enums.constraint_action.includes(row?.action) ||
        !enums.constraint_persistence.includes(row?.persistence) ||
        !Number.isInteger(row?.count),
    )
  ) {
    problems.push(`${OWNER_MIRROR_PATH} exclusions is not a list of enumerated scopes.`)
  }

  return problems
}
