/**
 * AUTH-03 — the two reads the guards are built on: the signed-in user's
 * profile, and their locations. ONB-01 adds the one write that creates both.
 *
 * They are one module because they share exactly one thing — the access token
 * has to come from the live session on every call, since `auth.ts` rotates it
 * — and *nothing else*. There is no combined call, no shared promise and no
 * ordering between them: `profile` and `locations` each open their own request
 * and answer their own `Result`. "One failing does not block the other" is
 * therefore a property of the shape, not a rule someone has to remember.
 *
 * `profile` answers `Profile | null`, and the distinction it does **not** make
 * is the point. `null` means the query succeeded and there is no row. A read
 * that failed answers `err`, and a caller that cannot tell those apart is
 * defect D1 — routing a user to onboarding because their profile 500'd.
 *
 * `completeOnboarding` joins them rather than living in a module of its own
 * because it writes exactly what they read, and because it has to answer them:
 * the RPC hands back the committed profile and location so the two queries can
 * be seeded instead of refetched. Atomicity is not this file's to arrange —
 * `complete_onboarding` is one transaction (ONB-01's migration), so there is no
 * partial-write path here to clean up after.
 */
import { createError, err, ErrorCode, isErr, ok, type Result } from '../state/errors'
import {
  locationListSchema,
  onboardingAnswersSchema,
  onboardingCommitSchema,
  parseBoundary,
  profileSchema,
  type Location,
  type OnboardingAnswers,
  type OnboardingCommit,
  type Profile,
} from '../state/schemas'
import type { AuthClient } from './auth'
import { createSupabaseClient, type SupabaseClient, type SupabaseConfig } from './supabase'

export interface UserDataClient {
  /** The user's row, or `null` when they have none yet. */
  profile(userId: string): Promise<Result<Profile | null>>
  /** Every location the user owns, default first then by name. */
  locations(userId: string): Promise<Result<Location[]>>
  /**
   * ONB-01's atomic commit: every first-run answer, or none of them. Answers
   * with the rows as the transaction left them.
   */
  completeOnboarding(answers: OnboardingAnswers): Promise<Result<OnboardingCommit>>
}

export interface UserDataConfig {
  /** Asked for the access token per call, so a rotated token is never stale. */
  readonly auth: Pick<AuthClient, 'getSession'>
  /** The project, minus the token this module supplies per call. */
  readonly supabase: Omit<SupabaseConfig, 'accessToken'>
}

export function createUserDataClient({ auth, supabase }: UserDataConfig): UserDataClient {
  /**
   * A PostgREST client carrying the current token. Built per call rather than
   * held: `supabase.ts` binds the token at construction, and a client built
   * once at sign-in would keep presenting a token that has since rotated.
   */
  const client = async (): Promise<Result<SupabaseClient>> => {
    const session = await auth.getSession()
    if (isErr(session)) return session
    if (session.value === null) {
      // Every policy on these tables refuses an anonymous request, so the
      // client says so rather than spending a round trip to be told.
      return err(createError(ErrorCode.AUTH_UNAUTHENTICATED))
    }
    return ok(createSupabaseClient({ ...supabase, accessToken: session.value.accessToken }))
  }

  return {
    async profile(userId) {
      const supa = await client()
      if (isErr(supa)) return supa

      // `profiles.id` *is* the auth user id (DATA-01b §3); there is no
      // `user_id` column and there can be at most one row.
      const rows = await supa.value.from('profiles').select({
        where: { id: userId },
        limit: 1,
      })
      if (isErr(rows)) return rows

      const [row] = rows.value
      if (row === undefined) return ok(null)

      return parseBoundary(profileSchema, row)
    },

    async locations(userId) {
      const supa = await client()
      if (isErr(supa)) return supa

      const rows = await supa.value.from('locations').select({
        where: { user_id: userId },
        order: [{ column: 'is_default', ascending: false }, { column: 'name' }],
      })
      if (isErr(rows)) return rows

      return parseBoundary(locationListSchema, rows.value)
    },

    async completeOnboarding(answers) {
      // Parsed on the way out as well as back. CORE-03's rule is that anything
      // which validates can be persisted, so an answer set the transaction
      // would have aborted halfway through never opens one.
      const payload = parseBoundary(onboardingAnswersSchema, answers)
      if (isErr(payload)) return payload

      const supa = await client()
      if (isErr(supa)) return supa

      // No `p_user_id`: the function reads `auth.uid()`, so the token this
      // client is already presenting is the only thing that names the owner.
      const committed = await supa.value.rpc('complete_onboarding', {
        p_location_name: payload.value.location_name,
        p_location_tier: payload.value.location_tier,
        p_equipment: payload.value.equipment,
        p_experience_level: payload.value.experience_level,
        p_goal_preset: payload.value.goal_preset,
        p_sections: payload.value.enabled_sections,
        p_avoid_patterns: payload.value.avoid_patterns,
        p_note: payload.value.note,
      })
      if (isErr(committed)) return committed

      return parseBoundary(onboardingCommitSchema, committed.value)
    },
  }
}
