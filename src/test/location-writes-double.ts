/**
 * A PostgREST stand-in for REQ-013's location writes.
 *
 * The honesty note the viability double carries applies here unchanged: the
 * migration cannot be executed in this suite, so this double holds
 * `supabase/migrations/20261002000022_location_viability.sql` in the one place a
 * test can run it — each function transcribed below under its own name, with the
 * evaluation delegated to `viabilityRows`, the transcription of the function the
 * SQL itself calls. What a test using it proves is that the writes *as written*
 * refuse and restore as REQ-013 asks. It does not prove Postgres agrees with the
 * transcription.
 *
 * A raise inside a function rolls its transaction back. Here that is a write
 * made to a copy of the rows, which replaces them only when nothing raised.
 */
import type { Enums } from '../data/database.types'
import type { Location } from '../state/schemas'
import { seededCatalog, type SeededExercise } from './seed-catalog'
import { viabilityRows, type ViabilityRows } from './viability-double'

export interface SavedConfiguration {
  readonly goalPreset: Enums<'goal_preset'> | null
  readonly enabledSections: readonly Enums<'section_type'>[]
  /** Persistent `exclude` constraints, as `constraints_in_force` answers them. */
  readonly exclusions?: readonly { scope: Enums<'constraint_scope'>; target: string }[]
}

export interface LocationWritesDoubleOptions {
  readonly url: string
  readonly anonKey: string
  /** Access token → the user id it authenticates. Anything else is anonymous. */
  readonly users: Record<string, string>
  /** User id → their `profiles` row and constraints. Absent is no profile. */
  readonly profiles: Record<string, SavedConfiguration>
  readonly locations: readonly Location[]
  /** Location id → `location_equipment`. */
  readonly equipment: Readonly<Record<string, readonly string[]>>
  /** Defaults to the committed seed. */
  readonly catalog?: readonly SeededExercise[]
}

export interface LocationWritesDouble {
  fetch: typeof globalThis.fetch
  requests(): { method: string; path: string }[]
  /** The `locations` rows as stored, default first then by name. */
  locations(): Location[]
  /** One location's `location_equipment`, ordered. */
  equipment(locationId: string): string[]
}

interface Rows {
  locations: Location[]
  equipment: Map<string, string[]>
}

/** What a `raise exception` becomes: PostgREST's status and error body. */
class Raised extends Error {
  readonly status: number
  readonly code: string
  readonly detail: string | null

  constructor(status: number, code: string, message: string, detail: string | null = null) {
    super(message)
    this.status = status
    this.code = code
    this.detail = detail
  }
}

const TIMESTAMP = '2026-10-02T09:00:00.000Z'

const byteOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export function createLocationWritesDouble(
  options: LocationWritesDoubleOptions,
): LocationWritesDouble {
  const base = new URL(`${options.url.replace(/\/+$/, '')}/rest/v1`)
  const catalog = options.catalog ?? seededCatalog()
  const seen: { method: string; path: string }[] = []
  let created = 0

  let stored: Rows = {
    locations: options.locations.map((location) => ({ ...location })),
    equipment: new Map(
      Object.entries(options.equipment).map(([id, items]) => [id, [...items].sort(byteOrder)]),
    ),
  }

  const ordered = (locations: readonly Location[]) =>
    [...locations].sort(
      (a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name),
    )

  // location_viability_failures
  const failures = (userId: string, equipment: readonly string[]): ViabilityRows => {
    const profile = options.profiles[userId]
    if (profile === undefined) return []

    const targets = (scope: string) =>
      (profile.exclusions ?? [])
        .filter((exclusion) => exclusion.scope === scope)
        .map((exclusion) => exclusion.target)

    return viabilityRows(
      {
        p_goal: profile.goalPreset as Enums<'goal_preset'>,
        p_enabled_sections: [...profile.enabledSections],
        p_available_equipment: [...equipment],
        p_excluded_exercises: targets('exercise'),
        p_excluded_patterns: targets('movement_pattern') as Enums<'movement_pattern'>[],
        p_excluded_equipment: targets('equipment'),
      },
      catalog,
    ).filter((row) => row.failure_class !== 'no_sections')
  }

  const notViable = (
    kind: string,
    location: Location,
    removed: readonly string[],
    added: readonly string[],
    rows: ViabilityRows,
  ) =>
    new Raised(
      400,
      '23514',
      'location_not_viable',
      JSON.stringify({
        change: { kind, location: location.name, removed, added },
        failures: rows,
      }),
    )

  // save_location
  const saveLocation = (rows: Rows, userId: string, args: Record<string, unknown>) => {
    const name = String(args.p_name ?? '').trim()
    const id = (args.p_location_id ?? null) as string | null
    if (name === '') throw new Raised(400, '23514', 'a location needs a name')

    let location: Location
    let previous: string[] = []

    if (id === null) {
      created += 1
      location = {
        id: `00000000-0000-4000-8000-0000000001${String(created).padStart(2, '0')}`,
        user_id: userId,
        created_at: TIMESTAMP,
        updated_at: TIMESTAMP,
        name,
        tier: args.p_tier as Location['tier'],
        is_default: !rows.locations.some((existing) => existing.user_id === userId),
      }
      rows.locations.push(location)
    } else {
      const index = rows.locations.findIndex(
        (existing) => existing.id === id && existing.user_id === userId,
      )
      if (index === -1) {
        throw new Raised(400, 'P0002', 'no such location for the authenticated caller')
      }
      location = { ...rows.locations[index], name, tier: args.p_tier as Location['tier'] }
      rows.locations[index] = location
      previous = rows.equipment.get(id) ?? []
    }

    const equipment = [
      ...new Set(
        ((args.p_equipment ?? []) as string[])
          .map((item) => item.trim())
          .filter((item) => item !== ''),
      ),
    ].sort(byteOrder)
    rows.equipment.set(location.id, equipment)

    if (id === null || equipment.join('\n') !== previous.join('\n')) {
      const failing = failures(userId, equipment)
      if (failing.length > 0) {
        throw notViable(
          id === null ? 'add' : 'edit',
          location,
          previous.filter((item) => !equipment.includes(item)),
          equipment.filter((item) => !previous.includes(item)),
          failing,
        )
      }
    }

    return { location, equipment }
  }

  // set_default_location
  const setDefaultLocation = (rows: Rows, userId: string, args: Record<string, unknown>) => {
    const target = rows.locations.find(
      (existing) => existing.id === args.p_location_id && existing.user_id === userId,
    )
    if (target === undefined) {
      throw new Raised(400, 'P0002', 'no such location for the authenticated caller')
    }

    rows.locations = rows.locations.map((existing) =>
      existing.user_id === userId
        ? { ...existing, is_default: existing.id === target.id }
        : existing,
    )

    const failing = failures(userId, rows.equipment.get(target.id) ?? [])
    if (failing.length > 0) throw notViable('default', target, [], [], failing)

    return { ...target, is_default: true }
  }

  // delete_location
  const deleteLocation = (rows: Rows, userId: string, args: Record<string, unknown>) => {
    const target = rows.locations.find(
      (existing) => existing.id === args.p_location_id && existing.user_id === userId,
    )
    if (target === undefined) return null

    rows.locations = rows.locations.filter((existing) => existing.id !== target.id)
    // `location_equipment.location_id ... on delete cascade`.
    rows.equipment.delete(target.id)

    if (!rows.locations.some((existing) => existing.user_id === userId)) {
      const failing = failures(userId, [])
      if (failing.length > 0) throw notViable('delete', target, [], [], failing)
    }

    return target.id
  }

  const functions: Record<
    string,
    (rows: Rows, userId: string, args: Record<string, unknown>) => unknown
  > = {
    save_location: saveLocation,
    set_default_location: setDefaultLocation,
    delete_location: deleteLocation,
    location_viability_failures: (_rows, userId, args) =>
      failures(userId, (args.p_equipment ?? []) as string[]),
  }

  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : String(input))
    const method = init?.method ?? 'GET'
    const path = url.pathname.slice(base.pathname.length)

    seen.push({ method, path })

    const headers = new Headers(init?.headers)
    if (headers.get('apikey') !== options.anonKey) {
      return problem(401, '42501', 'invalid api key')
    }

    // EXECUTE is revoked from `anon`, and every policy on both tables is
    // owner-only: without a user's token nothing below is reachable.
    const token = headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''
    const userId = options.users[token]
    if (userId === undefined) return problem(401, '42501', 'permission denied')

    const eq = (column: string) => url.searchParams.get(column)?.replace(/^eq\./, '')

    if (method === 'GET' && path === '/locations') {
      const owner = eq('user_id')
      return json(
        ordered(stored.locations).filter(
          (location) =>
            location.user_id === userId && (owner === undefined || location.user_id === owner),
        ),
      )
    }

    if (method === 'GET' && path === '/location_equipment') {
      const locationId = eq('location_id') ?? ''
      const owned = stored.locations.some(
        (location) => location.id === locationId && location.user_id === userId,
      )
      return json(
        (owned ? (stored.equipment.get(locationId) ?? []) : []).map((equipment_id) => ({
          location_id: locationId,
          equipment_id,
          created_at: TIMESTAMP,
        })),
      )
    }

    const fn = method === 'POST' && path.startsWith('/rpc/') ? functions[path.slice(5)] : undefined
    if (fn === undefined) return problem(404, '42883', `nothing matches ${method} ${path}`)

    // One transaction: the function writes to a copy, which is kept only when
    // it returns.
    const working: Rows = {
      locations: stored.locations.map((location) => ({ ...location })),
      equipment: new Map([...stored.equipment].map(([id, items]) => [id, [...items]])),
    }

    try {
      const answer = fn(
        working,
        userId,
        JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
      )
      stored = working
      return json(answer)
    } catch (error) {
      if (!(error instanceof Raised)) throw error
      return problem(error.status, error.code, error.message, error.detail)
    }
  }

  return {
    fetch: fetchImpl,
    requests: () => [...seen],
    locations: () => ordered(stored.locations).map((location) => ({ ...location })),
    equipment: (locationId) => [...(stored.equipment.get(locationId) ?? [])],
  }
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function problem(
  status: number,
  code: string,
  message: string,
  details: string | null = null,
): Response {
  return new Response(JSON.stringify({ code, message, details, hint: null }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
