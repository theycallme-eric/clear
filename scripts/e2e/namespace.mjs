/**
 * ENV-07 — the E2E test namespace: who the test users are, and which rows
 * belong to them.
 *
 * Everything here is derived from one string. Within a namespace every address
 * and every primary key is fixed, which is what makes the lifecycle idempotent:
 * the second run addresses exactly the same users and the same keys as the
 * first, so "create" is "create if missing" and "delete" is "delete if
 * present". Nothing accumulates, and a run that dies halfway leaves rows the
 * next `reset` already knows the ids of.
 *
 * The namespace itself exists because the standing RLS check now runs on every
 * pull request, against one shared Supabase project. Two pull requests testing
 * at the same time would otherwise seed over each other — and "seed resets
 * first" means the second one would delete the first one's users mid-run, which
 * reports as an RLS failure and is not one. `E2E_NAMESPACE` keeps them apart:
 * CI passes the pull request number, a laptop gets `local`.
 *
 * The addresses use `example.com` (RFC 2606, reserved and undeliverable) so a
 * mis-wired test can never mail a real person, and the `clear-e2e-` prefix
 * makes every row this harness owns greppable in the dashboard — and sweepable
 * by `reset --stale`, whatever namespace abandoned it.
 */

import { standingMatrix } from './dispositions.mjs'

/**
 * The two sides of every RLS assertion: A is the actor, B owns the rows.
 * @type {['a', 'b']}
 */
export const SLOTS = ['a', 'b']

/** Every address this harness may ever own starts here. */
export const NAMESPACE_PREFIX = 'clear-e2e'

/** Addresses are undeliverable by construction (RFC 2606). */
const EMAIL_DOMAIN = 'example.com'

/**
 * The namespace this process works in.
 *
 * Anything outside `[a-z0-9-]` is folded away, because the value reaches an
 * email address and a uuid, and a branch name is allowed characters neither of
 * them is.
 *
 * @param {Record<string, string | undefined>} [env]
 */
export function namespaceId(env = process.env) {
  const raw = (env.E2E_NAMESPACE ?? '').trim().toLowerCase()
  const cleaned = raw.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned === '' ? 'local' : cleaned.slice(0, 32)
}

/** Resolved once: a process tests one namespace for its whole life. */
export const NAMESPACE = namespaceId()

/**
 * @param {'a' | 'b'} slot
 * @param {string} [namespace]
 */
export const emailForSlot = (slot, namespace = NAMESPACE) =>
  `${NAMESPACE_PREFIX}-${namespace}-${slot}@${EMAIL_DOMAIN}`

/** Whether an address belongs to this harness — in any namespace. */
export const isHarnessEmail = (email) =>
  typeof email === 'string' &&
  email.startsWith(`${NAMESPACE_PREFIX}-`) &&
  email.endsWith(`@${EMAIL_DOMAIN}`)

/**
 * FNV-1a, for one purpose: turning a namespace into hex that fits a uuid.
 *
 * Not a security primitive and not trying to be. It has to be stable across
 * processes and machines — the reset that cleans up must compute the same ids
 * the seed wrote — and `crypto.createHash` would do just as well at four times
 * the ceremony.
 *
 * @param {string} value
 */
function hashHex(value) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * Deterministic primary keys: one block per table, one row per slot, all of
 * them carrying the namespace so two concurrent runs never collide.
 *
 * `e2e0000N` stays the leading group, which makes these valid v4-shaped uuids
 * that are also obvious on sight — nobody mistakes one for production data.
 *
 * @param {number} table 1-based table block
 * @param {'a' | 'b'} slot
 * @param {string} namespace
 */
const id = (table, slot, namespace) => {
  const hash = hashHex(namespace)
  return `e2e0000${table}-${hash.slice(0, 4)}-4000-8000-${hash}000${
    slot === 'a' ? '1' : '2'
  }`
}

/**
 * Every fixture key for a namespace. Exported as a function because reset for
 * *another* namespace — the stale sweep — needs the same arithmetic.
 *
 * @param {string} [namespace]
 */
export function fixtureIds(namespace = NAMESPACE) {
  return {
    location: { a: id(1, 'a', namespace), b: id(1, 'b', namespace) },
    userConstraint: { a: id(2, 'a', namespace), b: id(2, 'b', namespace) },
    workoutSession: { a: id(3, 'a', namespace), b: id(3, 'b', namespace) },
    workoutSection: { a: id(4, 'a', namespace), b: id(4, 'b', namespace) },
    workoutBlock: { a: id(5, 'a', namespace), b: id(5, 'b', namespace) },
    blockResult: { a: id(6, 'a', namespace), b: id(6, 'b', namespace) },
  }
}

/** This process's keys. */
export const FIXTURE_IDS = fixtureIds()

/** The one equipment id the seeded location owns, and the constraint's target. */
export const FIXTURE_EQUIPMENT_ID = 'barbell'

/**
 * Every owner-scoped table the standing check asserts against, with the two
 * things an RLS assertion needs: how a row of it is addressed as belonging to
 * user B, and how an attempt to write one for user B is spelled.
 *
 * **This list is not written here.** It is every table whose disposition in
 * `dispositions.mjs` is `cross-user`, and that register is checked against the
 * migrations on every pull request — so a new user-owned table either joins
 * this matrix or fails the build. A matrix maintained by hand is one that
 * quietly stops covering the schema.
 *
 * `ownerColumn` is `null` for the tables that inherit ownership through a
 * parent chain rather than carrying `user_id` themselves. Those are addressed
 * by the seeded row's own primary key, which is exact and — unlike "select
 * everything and expect nothing" — unaffected by whatever else lives in the
 * reused project.
 *
 * `seeded: false` marks the two tables whose rows cannot be constructed from
 * the schema alone: both require an `exercise_definitions` id, and the catalog
 * is applied by its own task. They are still proved — a write for user B must
 * be refused, and a read of user B's rows must return none — they simply have
 * no seeded row to read. When the catalog is applied, they gain one here and
 * nothing else changes.
 */
export const USER_TABLES = standingMatrix()

/**
 * How a seeded row of `table` belonging to `slot` is addressed in PostgREST.
 * For an owner-scoped table that is its owner column; for a child table it is
 * the deterministic key the seed used.
 *
 * @param {string} table
 * @param {'a' | 'b'} slot
 * @param {string} userId
 * @returns {Record<string, string>} PostgREST query parameters
 */
export function rowSelector(table, slot, userId) {
  switch (table) {
    case 'profiles':
      return { id: `eq.${userId}` }
    case 'locations':
      return { id: `eq.${FIXTURE_IDS.location[slot]}` }
    case 'location_equipment':
      return { location_id: `eq.${FIXTURE_IDS.location[slot]}` }
    case 'user_constraints':
      return { id: `eq.${FIXTURE_IDS.userConstraint[slot]}` }
    case 'workout_sessions':
      return { id: `eq.${FIXTURE_IDS.workoutSession[slot]}` }
    case 'workout_sections':
      return { id: `eq.${FIXTURE_IDS.workoutSection[slot]}` }
    case 'workout_blocks':
      return { id: `eq.${FIXTURE_IDS.workoutBlock[slot]}` }
    case 'block_results':
      return { id: `eq.${FIXTURE_IDS.blockResult[slot]}` }
    case 'workout_exercises':
      return { block_id: `eq.${FIXTURE_IDS.workoutBlock[slot]}` }
    case 'exercise_set_logs':
      return { workout_exercise_id: `eq.${FIXTURE_IDS.workoutBlock[slot]}` }
    case 'load_anchors':
      return { user_id: `eq.${userId}` }
    default:
      throw new Error(`No row selector for ${table}`)
  }
}

/**
 * A row that would belong to `slot` if the database allowed it to be written.
 *
 * These are only ever sent by the *wrong* user, so they never have to satisfy
 * every check constraint — the policy is evaluated before the row is. They do
 * have to name the ownership honestly, which is what makes the refusal mean
 * "not yours" rather than "malformed".
 *
 * @param {string} table
 * @param {'a' | 'b'} slot
 * @param {string} userId owner the forged row claims
 */
export function forgedRow(table, slot, userId) {
  const base = {
    profiles: { id: userId },
    locations: {
      user_id: userId,
      name: 'Forged by the other user',
      tier: 'minimal',
    },
    location_equipment: {
      location_id: FIXTURE_IDS.location[slot],
      equipment_id: 'forged-equipment',
    },
    user_constraints: {
      user_id: userId,
      scope: 'equipment',
      action: 'exclude',
      target_equipment: 'forged-equipment',
    },
    workout_sessions: {
      user_id: userId,
      date: '2026-01-01',
      title: 'Forged by the other user',
      session_focus: 'full_body',
      requested_duration_mins: 30,
      effective_duration_target_mins: 30,
      requested_intensity: 5,
      effective_intensity: 5,
      prompt_version: 'e2e',
      contract_version: 'e2e',
    },
    workout_sections: {
      session_id: FIXTURE_IDS.workoutSession[slot],
      section_type: 'warmup',
      order_index: 99,
      section_title: 'Forged by the other user',
    },
    workout_blocks: {
      section_id: FIXTURE_IDS.workoutSection[slot],
      order_index: 99,
      structure_type: 'standard',
    },
    block_results: {
      block_id: FIXTURE_IDS.workoutBlock[slot],
      notes: 'Forged by the other user',
    },
    workout_exercises: {
      block_id: FIXTURE_IDS.workoutBlock[slot],
      exercise_id: 'forged-exercise',
      order_index: 99,
      modality: 'reps',
      target_kind: 'fixed',
      target_value: 5,
      equipment_used: 'barbell',
      slot_id: FIXTURE_IDS.workoutBlock[slot],
    },
    exercise_set_logs: {
      id: FIXTURE_IDS.blockResult[slot],
      workout_exercise_id: FIXTURE_IDS.workoutBlock[slot],
      set_number: 1,
      weight_unit: 'lb',
    },
    load_anchors: {
      user_id: userId,
      exercise_id: 'forged-exercise',
      equipment_used: 'barbell',
      anchor_value: 315,
      unit: 'lb',
      confidence: 'high',
      session_count: 1,
      last_session_date: '2026-01-01',
    },
  }[table]

  if (base === undefined) throw new Error(`No forged row for ${table}`)
  return base
}
