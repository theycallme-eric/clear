/**
 * A PostgREST stand-in for REQ-012's Settings viability guard.
 *
 * The honesty note `viability-double.ts` carries applies here unchanged: the
 * migration cannot be executed in this suite, so this double holds
 * `supabase/migrations/20261002000022_settings_viability_guard.sql` in the one
 * place a test can run it — `settings_viability_failures` and
 * `refuse_non_viable_settings` transcribed below under their own names, which
 * `src/test/generation-reliability/settings-viability.test.ts` asserts against
 * clause by clause. The evaluation each location is given is
 * `viability-double.ts`'s, over the seeded catalog. What a test using it proves
 * is that the guard *as written* refuses what it should and stores what it
 * should; it does not prove Postgres agrees with the transcription.
 *
 * It serves the two tables Settings writes — `profiles` and `user_constraints`
 * — as the real clients call them, and nothing else.
 */

import type { Tables } from '../data/database.types'
import { viabilityRows, type ViabilityArgs, type ViabilityRows } from './viability-double'

type ProfileRow = Tables<'profiles'>
type ConstraintRow = Tables<'user_constraints'>

export interface SettingsServerLocation {
  readonly id: string
  readonly name: string
  readonly is_default: boolean
  readonly equipment: readonly string[]
}

export interface SettingsServerOptions {
  readonly url: string
  readonly anonKey: string
  /** The one access token this server accepts; it authenticates `profile.id`. */
  readonly accessToken: string
  readonly profile: ProfileRow
  readonly locations: readonly SettingsServerLocation[]
  readonly constraints?: readonly ConstraintRow[]
  /** `now()` for the transaction — `complete_onboarding`'s stamp, when a test needs it. */
  readonly now?: string
}

export interface SettingsServer {
  fetch: typeof globalThis.fetch
  /** The stored profile row, as the last committed statement left it. */
  profile(): ProfileRow
  /** The stored constraint rows, as the last committed statement left them. */
  constraints(): readonly ConstraintRow[]
  /** `settings_viability_failures` for the stored configuration. */
  failures(): LocatedRow[]
  requests(): { method: string; path: string }[]
}

export type LocatedRow = ViabilityRows[number] & {
  location_id: string
  location_name: string
}

const byteOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export function createSettingsServer(options: SettingsServerOptions): SettingsServer {
  const base = new URL(`${options.url.replace(/\/+$/, '')}/rest/v1`)
  const now = options.now ?? '2026-10-02T09:00:00.000Z'
  const seen: { method: string; path: string }[] = []

  let profile: ProfileRow = { ...options.profile }
  let constraints: ConstraintRow[] = [...(options.constraints ?? [])]
  let created = 0

  /** `settings_viability_failures`, against the rows as they currently stand. */
  const settingsViabilityFailures = (
    goal: ProfileRow['goal_preset'],
    enabledSections: ProfileRow['enabled_sections'],
    withoutConstraint: string | null = null,
  ): LocatedRow[] => {
    // exclusions: `constraints_in_force(p_user_id)` — persistent only, since no
    // session is named — where action = 'exclude'.
    const exclusions = constraints.filter(
      (row) =>
        row.user_id === profile.id &&
        row.persistence === 'persistent' &&
        row.action === 'exclude' &&
        row.id !== withoutConstraint,
    )
    const targets = <K extends 'target_exercise_id' | 'target_pattern' | 'target_equipment'>(
      scope: ConstraintRow['scope'],
      column: K,
    ) => exclusions.filter((row) => row.scope === scope).map((row) => row[column])

    // `order by l.is_default desc, l.name, l.id, …`
    return [...options.locations]
      .sort(
        (a, b) =>
          Number(b.is_default) - Number(a.is_default) ||
          byteOrder(a.name, b.name) ||
          byteOrder(a.id, b.id),
      )
      .flatMap((location) =>
        viabilityRows({
          p_goal: goal,
          p_enabled_sections: enabledSections,
          // `generation_equipment(p_user_id, l.id)`
          p_available_equipment: [...new Set(location.equipment)].sort(byteOrder),
          p_excluded_exercises: targets('exercise', 'target_exercise_id'),
          p_excluded_patterns: targets('movement_pattern', 'target_pattern'),
          p_excluded_equipment: targets('equipment', 'target_equipment'),
        } as ViabilityArgs).map((row) => ({
          ...row,
          location_id: location.id,
          location_name: location.name,
        })),
      )
  }

  /**
   * `refuse_non_viable_settings`' comparison: the failures the new
   * configuration has that the old one did not, or `null` when there are none.
   */
  const introduced = (
    before: readonly LocatedRow[],
    after: readonly LocatedRow[],
  ): LocatedRow[] | null => {
    const rows = after.filter(
      (a) =>
        !before.some(
          (b) =>
            b.location_id === a.location_id &&
            b.section === a.section &&
            b.failure_class === a.failure_class &&
            (b.blocks_proposed_goal || !a.blocks_proposed_goal),
        ),
    )

    return rows.length === 0 ? null : rows
  }

  const refusal = (rows: readonly LocatedRow[]) =>
    json(400, {
      code: 'P0001',
      message: 'settings_not_viable',
      details: JSON.stringify(rows),
      hint: 'The change cannot generate at a saved location; nothing was saved.',
    })

  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : String(input))
    const method = init?.method ?? 'GET'
    const path = url.pathname.slice(base.pathname.length)

    seen.push({ method, path })

    const headers = new Headers(init?.headers)
    if (
      headers.get('apikey') !== options.anonKey ||
      headers.get('Authorization') !== `Bearer ${options.accessToken}`
    ) {
      return json(401, { code: '42501', message: 'permission denied' })
    }

    if (path === '/profiles' && method === 'GET') {
      return json(200, url.searchParams.get('id') === `eq.${profile.id}` ? [profile] : [])
    }

    if (path === '/profiles' && method === 'PATCH') {
      // `profiles_update_own`: another user's row matches nothing.
      if (url.searchParams.get('id') !== `eq.${profile.id}`) return json(200, [])

      const patch = JSON.parse(String(init?.body ?? '{}')) as Partial<ProfileRow>
      const next: ProfileRow = { ...profile, ...patch, updated_at: now }

      // The trigger's WHEN, then its onboarding skip.
      const changed =
        profile.goal_preset !== next.goal_preset ||
        JSON.stringify(profile.enabled_sections) !== JSON.stringify(next.enabled_sections)
      if (changed && profile.onboarded_at !== null) {
        const refused = introduced(
          settingsViabilityFailures(profile.goal_preset, profile.enabled_sections),
          settingsViabilityFailures(next.goal_preset, next.enabled_sections),
        )
        // The raise aborts the statement: `profile` is not assigned.
        if (refused !== null) return refusal(refused)
      }

      profile = next
      return json(200, [profile])
    }

    if (path === '/user_constraints' && method === 'POST') {
      const [insert] = JSON.parse(String(init?.body ?? '[]')) as Partial<ConstraintRow>[]
      const row = {
        applies_to_session_id: null,
        target_exercise_id: null,
        target_pattern: null,
        target_equipment: null,
        note: null,
        persistence: 'persistent',
        ...insert,
        id: `00000000-0000-4000-8000-0000000001${String((created += 1)).padStart(2, '0')}`,
        created_at: now,
      } as ConstraintRow

      const guarded =
        row.action === 'exclude' &&
        row.persistence === 'persistent' &&
        profile.onboarded_at !== null &&
        profile.onboarded_at !== now

      // AFTER INSERT: the row is in the table while the trigger evaluates.
      constraints = [...constraints, row]
      if (guarded) {
        const refused = introduced(
          settingsViabilityFailures(profile.goal_preset, profile.enabled_sections, row.id),
          settingsViabilityFailures(profile.goal_preset, profile.enabled_sections),
        )
        if (refused !== null) {
          // The raise aborts the statement, and the insert with it.
          constraints = constraints.filter((stored) => stored.id !== row.id)
          return refusal(refused)
        }
      }

      return json(201, [row])
    }

    if (path === '/user_constraints' && method === 'DELETE') {
      // Not guarded: removing an exclusion can only widen what is eligible.
      const id = url.searchParams.get('id')?.replace(/^eq\./, '')
      constraints = constraints.filter((row) => row.id !== id)
      return new Response(null, { status: 204 })
    }

    return json(404, { code: '42P01', message: `nothing is served at ${method} ${path}` })
  }

  return {
    fetch: fetchImpl,
    profile: () => ({ ...profile }),
    constraints: () => [...constraints],
    failures: () => settingsViabilityFailures(profile.goal_preset, profile.enabled_sections),
    requests: () => [...seen],
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
