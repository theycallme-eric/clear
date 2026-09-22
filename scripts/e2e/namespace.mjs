/**
 * ENV-07 — the E2E test namespace: who the test users are, and which rows
 * belong to them.
 *
 * Everything here is a literal. That is the point: the lifecycle is idempotent
 * because the second run addresses exactly the same users and exactly the same
 * primary keys as the first, so "create" is "create if missing" and "delete" is
 * "delete if present". Nothing is generated per run, so nothing accumulates,
 * and a run that dies halfway leaves rows the next `reset` already knows the
 * ids of.
 *
 * The addresses use `example.com` (RFC 2606, reserved and undeliverable) so a
 * mis-wired test can never mail a real person, and the `clear-e2e-` prefix
 * makes every row this harness owns greppable in the dashboard.
 */

/**
 * The two sides of every RLS assertion: A is the actor, B owns the rows.
 * @type {['a', 'b']}
 */
export const SLOTS = ['a', 'b']

/** @param {'a' | 'b'} slot */
export const emailForSlot = (slot) => `clear-e2e-${slot}@example.com`

/**
 * Deterministic primary keys, one block per table, one row per slot.
 *
 * `e2e0000N` is a valid hex group, which makes these real v4-shaped uuids that
 * are also obvious on sight — nobody mistakes one for production data.
 *
 * @param {number} table 1-based table block
 * @param {'a' | 'b'} slot
 */
const id = (table, slot) =>
  `e2e0000${table}-0000-4000-8000-00000000000${slot === 'a' ? '1' : '2'}`

export const FIXTURE_IDS = {
  location: { a: id(1, 'a'), b: id(1, 'b') },
  userConstraint: { a: id(2, 'a'), b: id(2, 'b') },
  workoutSession: { a: id(3, 'a'), b: id(3, 'b') },
  workoutSection: { a: id(4, 'a'), b: id(4, 'b') },
  workoutBlock: { a: id(5, 'a'), b: id(5, 'b') },
  blockResult: { a: id(6, 'a'), b: id(6, 'b') },
}

/** The one equipment id the seeded location owns, and the constraint's target. */
export const FIXTURE_EQUIPMENT_ID = 'barbell'

/**
 * Every owner-scoped table in the schema, in dependency order, with the two
 * things an RLS assertion needs: how a row of it is addressed as belonging to
 * user B, and how an attempt to write one for user B is spelled.
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
export const USER_TABLES = [
  { table: 'profiles', ownerColumn: 'id', seeded: true },
  { table: 'locations', ownerColumn: 'user_id', seeded: true },
  { table: 'location_equipment', ownerColumn: null, seeded: true },
  { table: 'user_constraints', ownerColumn: 'user_id', seeded: true },
  { table: 'workout_sessions', ownerColumn: 'user_id', seeded: true },
  { table: 'workout_sections', ownerColumn: null, seeded: true },
  { table: 'workout_blocks', ownerColumn: null, seeded: true },
  { table: 'block_results', ownerColumn: null, seeded: true },
  { table: 'workout_exercises', ownerColumn: null, seeded: false },
  { table: 'exercise_set_logs', ownerColumn: null, seeded: false },
]

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
  }[table]

  if (base === undefined) throw new Error(`No forged row for ${table}`)
  return base
}
