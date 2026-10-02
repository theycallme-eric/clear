/**
 * A PostgREST stand-in for REQ-011's `complete_onboarding`.
 *
 * The honesty note the viability double carries applies here unchanged: the
 * migration cannot be executed in this suite, so this double holds the commit's
 * rules in the one place a test can run them — the body of
 * `supabase/migrations/20261002000022_onboarding_viability.sql` transcribed
 * below in its own order, which
 * `src/test/generation-reliability/onboarding-viability.test.ts` holds to the
 * migration's text. What a test using it proves is that the commit *as
 * written* refuses before it writes. It does not prove Postgres agrees with
 * the transcription.
 *
 * The four tables the function writes are four fields of one store, so "nothing
 * was persisted" is a comparison a test can make rather than a claim it takes
 * on trust.
 */
import type { FunctionArgs } from '../data/database.types'
import type { Location, Profile } from '../state/schemas'
import { fixtureLocation, notOnboardedProfile } from './user-data-double'
import { viabilityRows, type ViabilityArgs } from './viability-double'

export type OnboardingArgs = FunctionArgs<'complete_onboarding'>

/** The SQLSTATE the function raises for a configuration that cannot generate. */
const NOT_VIABLE = 'CLR11'

const TIMESTAMP = '2026-10-02T09:00:00.000Z'

export interface StoredConstraint {
  readonly scope: 'movement_pattern'
  readonly action: 'exclude'
  readonly persistence: 'persistent'
  readonly target_pattern: string
  readonly note: string | null
}

/** `profiles`, `locations`, `location_equipment` and `user_constraints`, for one user. */
export interface OnboardingStore {
  readonly profile: Profile
  readonly locations: readonly Location[]
  /** Location id → the equipment ids it holds. */
  readonly equipment: Readonly<Record<string, readonly string[]>>
  readonly constraints: readonly StoredConstraint[]
}

export interface OnboardingDoubleOptions {
  readonly url: string
  readonly anonKey: string
  /** Access token → the user id it authenticates. Anything else is anonymous. */
  readonly users: Record<string, string>
}

export interface OnboardingDouble {
  fetch: typeof globalThis.fetch
  /** A copy of everything stored, as it stands. */
  store(): OnboardingStore
  requests(): { method: string; path: string }[]
}

/** A signed-up user who has answered nothing: the row the signup trigger made. */
export function emptyStore(): OnboardingStore {
  return { profile: notOnboardedProfile(), locations: [], equipment: {}, constraints: [] }
}

type Outcome =
  | { readonly ok: true; readonly store: OnboardingStore; readonly body: unknown }
  | { readonly ok: false; readonly status: number; readonly code: string; readonly message: string; readonly details?: string }

/**
 * `complete_onboarding`, as a function of the store. Pure: a refusal answers
 * without a store, because the exception rolled back whatever was written.
 */
export function completeOnboarding(before: OnboardingStore, args: OnboardingArgs): Outcome {
  const name = args.p_location_name.trim()
  const note = (args.p_note ?? '').trim() === '' ? null : (args.p_note ?? '').trim()
  const patterns = args.p_avoid_patterns ?? []
  const items = (args.p_equipment ?? []).map((item) => item.trim()).filter((item) => item !== '')

  if (name === '') {
    return { ok: false, status: 400, code: '23514', message: 'a location needs a name' }
  }
  if ((args.p_sections ?? []).length === 0) {
    return { ok: false, status: 400, code: '23514', message: 'at least one section must be enabled' }
  }

  // REQ-011: the proposal, before any write.
  const failures = viabilityRows({
    p_goal: args.p_goal_preset,
    p_enabled_sections: args.p_sections,
    p_available_equipment: items,
    p_excluded_exercises: [],
    p_excluded_patterns: patterns,
    p_excluded_equipment: [],
  } as ViabilityArgs)

  if (failures.length > 0) {
    return {
      ok: false,
      status: 400,
      code: NOT_VIABLE,
      message: 'this onboarding configuration cannot generate a workout',
      details: JSON.stringify(failures),
    }
  }

  // locations: demote the default, then upsert on (user_id, name).
  const existing = before.locations.find((location) => location.name === name)
  const location: Location = {
    ...(existing ??
      fixtureLocation({
        id: `00000000-0000-4000-8000-${String(before.locations.length + 16).padStart(12, '0')}`,
        created_at: TIMESTAMP,
      })),
    name,
    tier: args.p_location_tier,
    is_default: true,
  }
  const locations = [
    ...before.locations
      .filter((other) => other.id !== location.id)
      .map((other) => ({ ...other, is_default: false })),
    location,
  ]

  // location_equipment: replaced, de-duplicated by the primary key.
  const equipment = { ...before.equipment, [location.id]: [...new Set(items)] }

  // profiles: `onboarded_at` keeps its first value.
  const profile: Profile = {
    ...before.profile,
    experience_level: args.p_experience_level,
    goal_preset: args.p_goal_preset,
    enabled_sections: args.p_sections,
    onboarded_at: before.profile.onboarded_at ?? TIMESTAMP,
  }

  // user_constraints: the persistent pattern exclusions, replaced.
  const constraints: StoredConstraint[] = patterns.map((pattern) => ({
    scope: 'movement_pattern',
    action: 'exclude',
    persistence: 'persistent',
    target_pattern: pattern,
    note,
  }))

  return {
    ok: true,
    store: { profile, locations, equipment, constraints },
    body: { profile, location },
  }
}

export function createOnboardingDouble(
  options: OnboardingDoubleOptions,
  initial: OnboardingStore = emptyStore(),
): OnboardingDouble {
  const base = new URL(`${options.url.replace(/\/+$/, '')}/rest/v1`)
  const seen: { method: string; path: string }[] = []
  let stored = initial

  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : String(input))
    const method = init?.method ?? 'GET'
    const path = url.pathname.slice(base.pathname.length)

    seen.push({ method, path })

    const headers = new Headers(init?.headers)
    if (headers.get('apikey') !== options.anonKey) {
      return problem(401, '42501', 'invalid api key')
    }

    if (path !== '/rpc/complete_onboarding' || method !== 'POST') {
      return problem(404, '42883', `no function matches ${path}`)
    }

    // EXECUTE is revoked from `anon` and granted to `authenticated`.
    const token = headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''
    if (options.users[token] === undefined) {
      return problem(401, '42501', 'permission denied for function complete_onboarding')
    }

    const outcome = completeOnboarding(
      stored,
      JSON.parse(String(init?.body ?? '{}')) as OnboardingArgs,
    )
    if (!outcome.ok) {
      return problem(outcome.status, outcome.code, outcome.message, outcome.details)
    }

    stored = outcome.store

    return new Response(JSON.stringify(outcome.body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return {
    fetch: fetchImpl,
    store: () => structuredClone(stored),
    requests: () => [...seen],
  }
}

function problem(status: number, code: string, message: string, details?: string): Response {
  return new Response(JSON.stringify({ code, message, details: details ?? null, hint: null }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
