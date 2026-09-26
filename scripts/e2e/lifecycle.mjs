/**
 * ENV-07 — seed and reset, one function each.
 *
 * The requirement that shapes both: *a failed run never leaves the next one
 * poisoned.* Two properties get that, and neither is a retry loop.
 *
 *   1. **Seed resets first.** Whatever half-written state a killed run left,
 *      the next seed removes it before writing, so seeding is a jump to a known
 *      state rather than an edit of an unknown one.
 *   2. **Every key is a literal** (`namespace.mjs`). Re-running writes the same
 *      rows, not more rows, and reset knows what to delete without a search.
 *
 * Reset is a single delete per test user. `auth.users` cascades to `profiles`,
 * which cascades to locations, sessions and constraints, which cascade onward —
 * so the whole namespace goes in two requests and cannot half-go. It is also
 * why the ordering problem that usually makes test teardown fragile does not
 * exist here: there is no ordering.
 */

import {
  FIXTURE_EQUIPMENT_ID,
  FIXTURE_IDS,
  SLOTS,
  emailForSlot,
  isHarnessEmail,
} from './namespace.mjs'

/**
 * How long an untouched harness user is assumed to belong to a run still in
 * progress. Two hours is longer than any CI job this repository allows, so
 * anything older was abandoned — a cancelled job, a laptop that slept, a
 * process killed between seed and reset.
 */
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000

/**
 * Remove the entire E2E namespace. Safe to call on a project that has never
 * been seeded, and safe to call twice.
 *
 * @param {ReturnType<import('./client.mjs').createAdminClient>} client
 * @returns {Promise<{ deleted: string[] }>}
 */
export async function reset(client) {
  const deleted = []

  for (const slot of SLOTS) {
    const email = emailForSlot(slot)
    const user = await client.findUserByEmail(email)
    if (user === null) continue
    await client.deleteUser(user.id)
    deleted.push(email)
  }

  return { deleted }
}

/**
 * Remove harness users left behind by *other* namespaces that are long gone.
 *
 * Per-pull-request namespaces mean a cancelled job can leave two users nobody
 * will ever address again: its namespace is derived from a pull request number
 * that will not come round twice. Reset cannot find them, because reset only
 * knows its own namespace's addresses — so the sweep works by prefix instead,
 * and uses age to avoid deleting a run that is still going.
 *
 * It is deliberately narrow. Only `clear-e2e-…@example.com` is eligible, only
 * when older than the cutoff, and the deletion is the same cascading one reset
 * performs. An address this harness never created cannot match.
 *
 * @param {ReturnType<import('./client.mjs').createAdminClient>} client
 * @param {{ olderThanMs?: number, now?: number }} [options]
 * @returns {Promise<{ swept: string[] }>}
 */
export async function sweepStale(client, options = {}) {
  const { olderThanMs = STALE_AFTER_MS, now = Date.now() } = options
  const cutoff = now - olderThanMs
  const swept = []

  for (const user of await client.listUsers()) {
    if (!isHarnessEmail(user.email)) continue

    const createdAt = Date.parse(user.created_at ?? '')
    // An address with no readable timestamp is left alone: a sweep that
    // guesses is a sweep that eventually deletes a live run.
    if (!Number.isFinite(createdAt) || createdAt >= cutoff) continue

    await client.deleteUser(user.id)
    swept.push(user.email)
  }

  return { swept }
}

/**
 * Put the project into the known state the suite asserts against: two
 * confirmed users, each owning one row in every table the schema lets the
 * harness construct.
 *
 * Both users are seeded identically and symmetrically. The RLS spec needs B to
 * own rows so that "A sees zero" is a real answer rather than an empty table,
 * and it needs A to own rows so that A's *own* reads still work — a policy that
 * denies everyone is not the policy being tested.
 *
 * @param {ReturnType<import('./client.mjs').createAdminClient>} client
 * @returns {Promise<{ users: Record<'a' | 'b', { id: string, email: string }> }>}
 */
export async function seed(client) {
  await reset(client)

  /** @type {Record<string, { id: string, email: string }>} */
  const users = {}

  for (const slot of SLOTS) {
    const email = emailForSlot(slot)
    const user = await client.ensureConfirmedUser(email)
    users[slot] = { id: user.id, email }

    // `profiles` is created by the signup trigger; naming it anyway keeps the
    // seed a complete statement of the state it guarantees, and the insert is
    // a no-op when the trigger already ran.
    await client.insertRows('profiles', [{ id: user.id }])

    await client.insertRows('locations', [
      {
        id: FIXTURE_IDS.location[slot],
        user_id: user.id,
        name: 'E2E fixture location',
        tier: 'home',
        is_default: true,
      },
    ])

    await client.insertRows('location_equipment', [
      {
        location_id: FIXTURE_IDS.location[slot],
        equipment_id: FIXTURE_EQUIPMENT_ID,
      },
    ])

    await client.insertRows('user_constraints', [
      {
        id: FIXTURE_IDS.userConstraint[slot],
        user_id: user.id,
        scope: 'equipment',
        action: 'exclude',
        target_equipment: FIXTURE_EQUIPMENT_ID,
      },
    ])

    // HOME-02's marked rest day. Dated away from the session's own day so the
    // fixture never has to say which of the two a single date meant.
    await client.insertRows('rest_days', [
      {
        id: FIXTURE_IDS.restDay[slot],
        user_id: user.id,
        day: '2026-01-02',
        reason: 'rest',
      },
    ])

    await client.insertRows('workout_sessions', [
      {
        id: FIXTURE_IDS.workoutSession[slot],
        user_id: user.id,
        location_id: FIXTURE_IDS.location[slot],
        date: '2026-01-01',
        title: 'E2E fixture session',
        session_focus: 'full_body',
        requested_duration_mins: 45,
        effective_duration_target_mins: 45,
        requested_intensity: 5,
        effective_intensity: 5,
        prompt_version: 'e2e-fixture',
        contract_version: 'e2e-fixture',
      },
    ])

    await client.insertRows('workout_sections', [
      {
        id: FIXTURE_IDS.workoutSection[slot],
        session_id: FIXTURE_IDS.workoutSession[slot],
        section_type: 'warmup',
        order_index: 0,
        section_title: 'E2E fixture section',
      },
    ])

    await client.insertRows('workout_blocks', [
      {
        id: FIXTURE_IDS.workoutBlock[slot],
        section_id: FIXTURE_IDS.workoutSection[slot],
        order_index: 0,
        structure_type: 'standard',
      },
    ])

    await client.insertRows('block_results', [
      {
        id: FIXTURE_IDS.blockResult[slot],
        block_id: FIXTURE_IDS.workoutBlock[slot],
        notes: 'E2E fixture result',
      },
    ])
  }

  return { users: /** @type {any} */ (users) }
}
