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
 * SET-02's location writes live here for the same reason `updatePreferences`
 * does: they write the rows `locations` reads, and they need the same live token
 * per call. Two of the four are database functions rather than table calls, and
 * `20260921000008_location_writes.sql` explains why in the only terms that
 * matter — PostgREST cannot put two statements in one transaction, and both the
 * default move and the equipment replacement need exactly that.
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
  locationDraftSchema,
  locationEquipmentListSchema,
  locationListSchema,
  locationSchema,
  locationSetupSchema,
  onboardingAnswersSchema,
  onboardingCommitSchema,
  parseBoundary,
  profilePreferencesSchema,
  profileSchema,
  type Location,
  type LocationDraft,
  type LocationSetup,
  type OnboardingAnswers,
  type OnboardingCommit,
  type Profile,
  type ProfilePreferences,
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
  /**
   * SET-01's edit: the three preferences the settings hub owns, written as one
   * patch and answered with the row as it now stands. Nothing here can create
   * a profile — a settings change is a correction to an answered question, and
   * onboarding is the only thing that answers one first (IA.md §6).
   */
  updatePreferences(
    userId: string,
    preferences: ProfilePreferences,
  ): Promise<Result<Profile>>
  /**
   * SET-02's read: what one location holds, as the ids generation joins on
   * (DATA-01b §5). Kept off `locations` deliberately — the list of places is one
   * query and each place's contents is another, so opening a location's editor
   * does not re-read every other one.
   */
  locationEquipment(locationId: string): Promise<Result<string[]>>
  /**
   * SET-02's write: one place and everything in it, created when the draft has
   * no id and updated when it has one. One call because it is one transaction
   * (`save_location`) — a location that exists carrying equipment nobody chose
   * is the partial write an optimistic screen cannot roll back.
   */
  saveLocation(draft: LocationDraft): Promise<Result<LocationSetup>>
  /**
   * Moves the default, which is the location generation reads when a request
   * names none. A function rather than a PATCH because "exactly one default" is
   * an immediate unique index plus a deferred trigger (DATA-01b §4), so the two
   * UPDATEs have to be in one transaction.
   */
  setDefaultLocation(locationId: string): Promise<Result<Location>>
  /**
   * Deletes one location; its equipment goes with it (`on delete cascade`).
   * Nothing here reassigns the default — REQ-063 asks that deleting the default
   * force reassignment *first*, so that is a decision the screen makes the user
   * take, and this is only ever called on a row that is safe to remove.
   */
  deleteLocation(locationId: string): Promise<Result<void>>
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

    async updatePreferences(userId, preferences) {
      // Parsed on the way out, like the commit above: an edit the database
      // would refuse — an empty section set is the one a user can actually
      // make — never becomes a request, and the screen gets the field back
      // rather than a constraint violation phrased in Postgres' vocabulary.
      const patch = parseBoundary(profilePreferencesSchema, preferences)
      if (isErr(patch)) return patch

      const supa = await client()
      if (isErr(supa)) return supa

      const rows = await supa.value.from('profiles').update(patch.value, { id: userId })
      if (isErr(rows)) return rows

      const [row] = rows.value
      // No row means the patch matched nothing: RLS refused it, or the profile
      // is gone. Either way the read that follows would be a second guess, so
      // this answers with the failure rather than inventing a profile.
      if (row === undefined) {
        return err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED, {
          details: { table: 'profiles', userId },
        }))
      }

      return parseBoundary(profileSchema, row)
    },

    async locationEquipment(locationId) {
      const supa = await client()
      if (isErr(supa)) return supa

      // Ordered by the id, so the list reads the same twice and a test about
      // the set is not a test about insertion order.
      const rows = await supa.value.from('location_equipment').select({
        where: { location_id: locationId },
        order: [{ column: 'equipment_id' }],
      })
      if (isErr(rows)) return rows

      const parsed = parseBoundary(locationEquipmentListSchema, rows.value)
      if (isErr(parsed)) return parsed

      return ok(parsed.value.map((row) => row.equipment_id))
    },

    async saveLocation(draft) {
      // Parsed on the way out as well as back, like the onboarding commit: a
      // draft the transaction would abort halfway through — a blank name is the
      // one a user can actually produce — never opens one.
      const payload = parseBoundary(locationDraftSchema, draft)
      if (isErr(payload)) return payload

      const supa = await client()
      if (isErr(supa)) return supa

      // No `p_user_id`: the function reads `auth.uid()`, so the token this
      // client presents is the only thing that names the owner.
      const saved = await supa.value.rpc('save_location', {
        p_name: payload.value.name,
        p_tier: payload.value.tier,
        p_equipment: [...payload.value.equipment],
        p_location_id: payload.value.id,
      })
      if (isErr(saved)) return saved

      return parseBoundary(locationSetupSchema, saved.value)
    },

    async setDefaultLocation(locationId) {
      const supa = await client()
      if (isErr(supa)) return supa

      const moved = await supa.value.rpc('set_default_location', {
        p_location_id: locationId,
      })
      if (isErr(moved)) return moved

      return parseBoundary(locationSchema, moved.value)
    },

    async deleteLocation(locationId) {
      const supa = await client()
      if (isErr(supa)) return supa

      // No owner in the predicate and none needed: `locations_delete_own` is
      // the policy, and a row that is not the caller's matches nothing. The
      // delete asks for no representation, so a location already gone is not an
      // error — the screen's optimistic removal was right either way.
      return supa.value.from('locations').delete({ id: locationId })
    },
  }
}
