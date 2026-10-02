/**
 * GR-05 / REQ-021 — the database lane, as a function of a client.
 *
 * The fast lane (`matrix.mjs`) says what retrieval returns for every legal
 * state, from the committed seed and a transcription of the SQL. This lane asks
 * Postgres the same questions: it provisions disposable users, calls the real
 * `generation_candidate_sets_for_goal` as each of them, holds every section of
 * every answer to the matrix, accepts one workout through `persist_session`,
 * forces one acceptance to fail, and deletes everything it made.
 *
 * What it compares. The matrix carries, per section, the strict count, the
 * relaxed count and whether the floor applied; so the lane holds the RPC's
 * `relaxed` flag and the length of its candidate list to those, section by
 * section. A row passes only when every one of its sections was asserted —
 * "the goal returned something" is not a result this file can produce.
 *
 * Whom it touches. Every address is `clear-e2e-<namespace>-gr-db-<slot>`, which
 * `isHarnessEmail` claims: the stale sweep removes one a cancelled run left
 * behind, and `readOwnerMirror` never mistakes one for the owner. GoTrue's user
 * index is read only to find those addresses. Every table read is filtered to
 * the ids this run created, and every RPC is called with the disposable user's
 * own token, so RLS is exercised rather than bypassed.
 *
 * What it never does: invoke an Edge Function. The client's helper for that is
 * not referenced anywhere in this file, so the lane cannot reach the model.
 *
 * The client is injected (`scripts/e2e/client.mjs`), which is what lets
 * `src/test/generation-reliability/database-lane-harness.test.ts` prove the
 * lifecycle against the Supabase double with no credential.
 */

import { NAMESPACE_PREFIX, isHarnessEmail } from '../e2e/namespace.mjs'
import { buildMatrix } from './matrix.mjs'

/** The segment that separates this lane's users from every other harness user. */
export const LANE_SLUG = 'gr-db'

/** The slot of the user that mirrors the owner's saved configuration. */
export const OWNER_MIRROR_SLOT = 'owner-mirror'

/** The matrix profiles a freshly onboarded user is in. */
const PRESET_PROFILES = ['preset', 'goal-override']

/** The only constraint action that filters retrieval. */
const FILTERING_ACTION = 'exclude'

/** An exercise id no catalog holds, so the last insert of the forced failure is refused. */
export const FORCED_FAILURE_EXERCISE_ID = 'gr-db-forced-failure'

/** The tables a persisted workout occupies, parent first, with the column pointing up. */
const WORKOUT_TABLES = [
  ['workout_sessions', 'user_id'],
  ['workout_sections', 'session_id'],
  ['workout_blocks', 'section_id'],
  ['workout_exercises', 'block_id'],
]

/**
 * @param {string} namespace
 * @param {string} slot
 */
export const laneEmail = (namespace, slot) =>
  `${NAMESPACE_PREFIX}-${namespace}-${LANE_SLUG}-${slot.replaceAll('_', '-')}@example.com`

/** Whether an address is one this lane, in this namespace, may create or delete. */
export const isLaneEmail = (/** @type {unknown} */ email, /** @type {string} */ namespace) =>
  isHarnessEmail(email) &&
  String(email).startsWith(`${NAMESPACE_PREFIX}-${namespace}-${LANE_SLUG}-`)

/**
 * @typedef {object} ExpectedSection
 * @property {string} section
 * @property {boolean} relaxed  Whether the floor applied, so the relaxed list is served.
 * @property {number} count     How many candidates the served list holds.
 */

/**
 * @typedef {object} LaneRow
 * @property {string} id      The matrix state id, or the mirror's own.
 * @property {string} slot    The disposable user that asks.
 * @property {string} goal
 * @property {string} focus
 * @property {string} tier
 * @property {ExpectedSection[]} sections
 */

/**
 * @typedef {object} LaneUser
 * @property {string} slot
 * @property {'owner-mirror' | 'preset'} kind
 * @property {string} tier
 * @property {string} goal
 * @property {string[]} equipment
 * @property {string[]} sections  The profile's saved sections.
 */

/**
 * The matrix rows a freshly onboarded user stands in: one per goal × focus ×
 * tier, at the goal's own section preset, with no constraint.
 *
 * @template {{ constraint: unknown, profile: string }} T
 * @param {{ states: T[] }} matrix
 * @returns {T[]}
 */
export const presetStates = (matrix) =>
  matrix.states.filter(
    (state) => state.constraint === null && PRESET_PROFILES.includes(state.profile),
  )

/**
 * The lane's inputs, generated from the legal-state matrix and the owner-mirror
 * fixture. Nothing here is a hand-picked list: a tier, goal or focus added to
 * the schema arrives as a row because the matrix has one.
 *
 * @param {import('./matrix.mjs').MatrixInputs} inputs
 * @param {{ goal: string, tier: string, enabledSections: string[], equipment: string[],
 *           exclusions: { scope: string, action: string }[] }} mirror
 */
export function buildLanePlan(inputs, mirror) {
  const matrix = buildMatrix(inputs)
  const { enums } = inputs.rules

  /** @type {LaneUser[]} */
  const users = []
  /** @type {LaneRow[]} */
  const rows = []

  // ── The owner's saved configuration ───────────────────────────────────────

  // The fixture records an exclusion's scope and never its target, so a
  // filtering one cannot be reproduced. Refusing is the honest answer: a
  // mirror that silently drops the constraint is a fresh default user.
  const filtering = mirror.exclusions.filter((entry) => entry.action === FILTERING_ACTION)
  if (filtering.length > 0) {
    throw new Error(
      `the owner-mirror fixture carries ${filtering.length} filtering exclusion(s) ` +
        'whose targets it does not record, so the database lane cannot reproduce it',
    )
  }

  // The mirror's equipment is the owner's, not a tier preset. Rebuilding the
  // matrix with that one tier replaced gives the same per-section cells for it.
  const mirrored = buildMatrix({
    ...inputs,
    equipmentByTier: { ...inputs.equipmentByTier, [mirror.tier]: mirror.equipment },
  })
  const mirrorCell = new Map(
    mirrored.cells
      .filter((cell) => cell.tier === mirror.tier)
      .map((cell) => [`${cell.focus}/${cell.section}`, cell]),
  )
  const mirrorSections = inputs.rules.goalSectionOverrides[mirror.goal] ?? mirror.enabledSections

  users.push({
    slot: OWNER_MIRROR_SLOT,
    kind: 'owner-mirror',
    tier: mirror.tier,
    goal: mirror.goal,
    equipment: [...mirror.equipment],
    sections: [...mirror.enabledSections],
  })
  for (const focus of enums.session_focus) {
    rows.push({
      id: `${OWNER_MIRROR_SLOT}/${mirror.goal}/${focus}`,
      slot: OWNER_MIRROR_SLOT,
      goal: mirror.goal,
      focus,
      tier: mirror.tier,
      sections: mirrorSections.map((section) => {
        const cell = mirrorCell.get(`${focus}/${section}`)
        if (cell === undefined) {
          throw new Error(`the matrix has no cell for ${mirror.tier}/${focus}/${section}`)
        }
        return expectedSection(cell)
      }),
    })
  }

  // ── Each advertised tier × Goal preset ────────────────────────────────────

  for (const tier of enums.equipment_tier) {
    for (const goal of enums.goal_preset) {
      users.push({
        slot: `${tier}-${goal}`,
        kind: 'preset',
        tier,
        goal,
        equipment: [...inputs.equipmentByTier[tier]],
        sections: [...inputs.sectionsByGoal[goal]],
      })
    }
  }
  for (const state of presetStates(matrix)) {
    rows.push({
      id: state.id,
      slot: `${state.tier}-${state.goal}`,
      goal: state.goal,
      focus: state.focus,
      tier: state.tier,
      sections: state.sections.map(expectedSection),
    })
  }

  return { floor: matrix.floor, matrixRows: presetStates(matrix).map((state) => state.id), users, rows }
}

/** @param {{ section: string, strict: number, relaxed: number, floorApplied: boolean }} cell */
function expectedSection({ section, strict, relaxed, floorApplied }) {
  return { section, relaxed: floorApplied, count: floorApplied ? relaxed : strict }
}

/**
 * One RPC answer held to one matrix row, a verdict per section.
 *
 * @param {LaneRow} row
 * @param {unknown} answer  The RPC's body: `{ section, relaxed, candidates }[]`.
 */
export function compareRow(row, answer) {
  /** @type {any[]} */
  const returned = Array.isArray(answer) ? answer : []
  const assertions = row.sections.map((expected) => {
    const actual = returned.find((entry) => entry?.section === expected.section)
    const candidates = Array.isArray(actual?.candidates) ? actual.candidates : null
    /** @type {string[]} */
    const problems = []

    if (actual === undefined) {
      problems.push('the RPC did not resolve the section')
    } else if (candidates === null || candidates.length === 0) {
      problems.push('the RPC returned no candidates')
    } else {
      if (candidates.length !== expected.count) {
        problems.push(
          `the RPC returned ${candidates.length} candidates, the fast lane ${expected.count}`,
        )
      }
      if (actual.relaxed !== expected.relaxed) {
        problems.push(
          `the RPC says relaxed=${String(actual.relaxed)}, the fast lane ${String(expected.relaxed)}`,
        )
      }
    }

    return { row: row.id, section: expected.section, problems }
  })

  const wanted = new Set(row.sections.map((expected) => expected.section))
  const extra = returned
    .map((entry) => String(entry?.section))
    .filter((section) => !wanted.has(section))

  return {
    assertions,
    problems: [
      ...assertions.flatMap((assertion) =>
        assertion.problems.map((problem) => `${row.id} ${assertion.section}: ${problem}`),
      ),
      ...extra.map((section) => `${row.id} ${section}: resolved by the RPC, not by the fast lane`),
    ],
  }
}

/**
 * Why the plan and what was asserted do not cover the matrix. Empty when every
 * matrix row, and every section of it, has an assertion.
 *
 * @param {ReturnType<typeof buildLanePlan>} plan
 * @param {{ row: string, section: string }[]} assertions
 */
export function coverageProblems(plan, assertions) {
  const asserted = new Set(assertions.map(({ row, section }) => `${row}|${section}`))
  const planned = new Map(plan.rows.map((row) => [row.id, row]))
  const problems = []

  for (const id of plan.matrixRows) {
    if (!planned.has(id)) problems.push(`matrix row ${id} has no lane row`)
  }
  for (const row of plan.rows) {
    if (row.sections.length === 0) problems.push(`${row.id} requires no section`)
    for (const { section } of row.sections) {
      if (!asserted.has(`${row.id}|${section}`)) {
        problems.push(`${row.id} ${section}: no assertion was made`)
      }
    }
  }

  return problems
}

/**
 * A contract-shaped acceptance payload built from what the RPC returned: one
 * section per resolved section, one block, up to two prescriptions.
 *
 * @param {LaneRow} row
 * @param {any[]} answer
 * @param {string} locationId
 */
export function acceptancePayload(row, answer, locationId) {
  return {
    date: '2026-01-02',
    location_id: locationId,
    session_focus: row.focus,
    goal_preset: row.goal,
    requested_duration_mins: 30,
    effective_duration_target_mins: 30,
    computed_duration_mins: null,
    requested_intensity: 5,
    effective_intensity: 5,
    adjustment_reason: null,
    generation_notes: null,
    prompt_version: LANE_SLUG,
    contract_version: LANE_SLUG,
    is_deload: false,
    workout: {
      title: 'GR-05 database lane',
      overview: null,
      estimated_duration_mins: 30,
      sections: answer.map((entry) => ({
        section_type: entry.section,
        section_title: entry.section,
        section_notes: null,
        blocks: [
          {
            structure_type: 'standard',
            rounds: null,
            timer_type: 'none',
            timer_seconds: null,
            round_rest_seconds: null,
            rep_scheme: 'fixed',
            block_notes: null,
            exercises: entry.candidates.slice(0, 2).map((/** @type {any} */ candidate) => ({
              exercise_id: candidate.exercise_id,
              equipment: candidate.usable_equipment[0],
              modality: 'reps',
              sets: 3,
              target_kind: 'fixed',
              target_value: 8,
              per_side: false,
              rest_seconds: 90,
              load_type: 'bodyweight',
              is_interval_exercise: false,
            })),
          },
        ],
      })),
    },
  }
}

/**
 * The same payload with its very last prescription pointing at no exercise, so
 * the session, every section, every block and every earlier prescription have
 * already been inserted when the statement is refused.
 *
 * @param {ReturnType<typeof acceptancePayload>} payload
 */
export function forcedFailurePayload(payload) {
  const broken = structuredClone(payload)
  const exercises = broken.workout.sections.at(-1)?.blocks.at(-1)?.exercises
  if (exercises === undefined || exercises.length === 0) {
    throw new Error('the payload has no prescription to break')
  }
  exercises[exercises.length - 1].exercise_id = FORCED_FAILURE_EXERCISE_ID
  return broken
}

/** @param {unknown} error */
const messageOf = (error) => (error instanceof Error ? error.message : String(error))

/**
 * Run the lane. Never throws for something the run found: every finding is a
 * sentence in `problems`, and cleanup has run by the time this returns —
 * whether the run passed, failed an assertion or died on a request.
 *
 * @param {object} options
 * @param {ReturnType<import('../e2e/client.mjs').createAdminClient>} options.client
 * @param {ReturnType<typeof buildLanePlan>} options.plan
 * @param {string} options.namespace
 */
export async function runDatabaseLane({ client, plan, namespace }) {
  /** @type {Map<string, { id: string, email: string, token: string, locationId: string }>} */
  const provisioned = new Map()
  /** Every user id this run created, including one whose setup then failed. */
  /** @type {string[]} */
  const created = []
  /** @type {{ row: string, section: string, problems: string[] }[]} */
  const assertions = []
  /** @type {string[]} */
  const problems = []
  /** @type {Map<string, any[]>} */
  const answers = new Map()
  /** @type {{ sessions: number, sections: number, blocks: number, exercises: number } | null} */
  let persisted = null
  /** @type {{ refused: boolean, sessionsLeft: number } | null} */
  let forcedFailure = null

  /** @param {string} what @param {{ ok: boolean, status: number, body: any }} response */
  const must = (what, response) => {
    if (!response.ok) {
      const detail = typeof response.body?.message === 'string' ? `: ${response.body.message}` : ''
      throw new Error(`${what} failed with ${response.status}${detail}`)
    }
    return response.body
  }

  /** Rows of `table` whose `column` is one of `ids`, read past every policy. */
  const rowsFor = async (
    /** @type {string} */ table,
    /** @type {string} */ column,
    /** @type {string[]} */ ids,
  ) =>
    ids.length === 0
      ? []
      : /** @type {{ id: string }[]} */ (
          must(
            `reading ${table}`,
            await client.selectAsService(table, {
              select: 'id',
              [column]: `in.(${ids.join(',')})`,
            }),
          )
        )

  /** How many rows a user's workouts occupy, per table. */
  const workoutRows = async (/** @type {string[]} */ userIds) => {
    /** @type {Record<string, number>} */
    const counts = {}
    let parents = userIds
    for (const [table, column] of WORKOUT_TABLES) {
      const rows = await rowsFor(table, column, parents)
      counts[table] = rows.length
      parents = rows.map((row) => row.id)
    }
    return counts
  }

  /** Delete every user at one of this lane's addresses, and nobody else. */
  const deleteLaneUsers = async () => {
    const deleted = []
    for (const user of await client.listUsers()) {
      if (!isLaneEmail(user?.email, namespace)) continue
      await client.deleteUser(user.id)
      deleted.push(user.email)
    }
    return deleted
  }

  try {
    // A cancelled run may have left this namespace's users behind, already
    // onboarded. Start from none rather than inherit their state.
    await deleteLaneUsers()

    for (const user of plan.users) {
      const email = laneEmail(namespace, user.slot)
      const account = await client.ensureConfirmedUser(email)
      created.push(account.id)

      const token = (await client.mintSession(email)).accessToken
      const onboarded = must(
        `onboarding ${user.slot}`,
        await client.rpcAs(
          'complete_onboarding',
          {
            p_location_name: `GR-05 ${user.slot}`,
            p_location_tier: user.tier,
            p_equipment: user.equipment,
            p_experience_level: 'some',
            p_goal_preset: user.goal,
            p_sections: user.sections,
            p_avoid_patterns: [],
            p_note: null,
          },
          token,
        ),
      )

      provisioned.set(user.slot, {
        id: account.id,
        email,
        token,
        locationId: onboarded.location.id,
      })
    }

    // ── The candidate RPC, row by row ───────────────────────────────────────

    for (const row of plan.rows) {
      const user = provisioned.get(row.slot)
      if (user === undefined) {
        problems.push(`${row.id}: no disposable user was provisioned for ${row.slot}`)
        continue
      }

      const response = await client.rpcAs(
        'generation_candidate_sets_for_goal',
        {
          p_user_id: user.id,
          p_goal: row.goal,
          p_focus: row.focus,
          p_location_id: user.locationId,
          p_session_id: null,
          p_floor: plan.floor,
        },
        user.token,
      )
      if (!response.ok) {
        problems.push(`${row.id}: the candidate RPC failed with ${response.status}`)
        continue
      }

      const compared = compareRow(row, response.body)
      assertions.push(...compared.assertions)
      problems.push(...compared.problems)
      answers.set(row.id, response.body)
    }

    // ── The persistence contract, as the stateful, customized user ──────────

    const mirror = provisioned.get(OWNER_MIRROR_SLOT)
    const mirrorRow = plan.rows.find(
      (row) => row.slot === OWNER_MIRROR_SLOT && (answers.get(row.id) ?? []).length > 0,
    )
    if (mirror === undefined || mirrorRow === undefined) {
      problems.push('persistence: the owner-mirror user resolved no candidates to persist')
    } else {
      const answer = /** @type {any[]} */ (answers.get(mirrorRow.id)).filter(
        (entry) => Array.isArray(entry?.candidates) && entry.candidates.length > 0,
      )
      const payload = acceptancePayload(mirrorRow, answer, mirror.locationId)

      // The failure first, so "no partial workout" is "no workout rows at all".
      const refused = await client.rpcAs(
        'persist_session',
        { p_user_id: mirror.id, p_session: forcedFailurePayload(payload) },
        mirror.token,
      )
      const left = await workoutRows([mirror.id])
      forcedFailure = { refused: !refused.ok, sessionsLeft: left.workout_sessions }
      if (refused.ok) problems.push('persistence: the forced failure was accepted')
      for (const [table, count] of Object.entries(left)) {
        if (count > 0) {
          problems.push(`persistence: the forced failure left ${count} row(s) in ${table}`)
        }
      }

      must(
        'persisting the workout',
        await client.rpcAs(
          'persist_session',
          { p_user_id: mirror.id, p_session: payload },
          mirror.token,
        ),
      )
      const stored = await workoutRows([mirror.id])
      const sections = payload.workout.sections
      const wanted = {
        workout_sessions: 1,
        workout_sections: sections.length,
        workout_blocks: sections.flatMap((section) => section.blocks).length,
        workout_exercises: sections.flatMap((section) =>
          section.blocks.flatMap((block) => block.exercises),
        ).length,
      }
      for (const [table, count] of Object.entries(wanted)) {
        if (stored[table] !== count) {
          problems.push(`persistence: ${table} holds ${stored[table]} row(s), expected ${count}`)
        }
      }
      persisted = {
        sessions: stored.workout_sessions,
        sections: stored.workout_sections,
        blocks: stored.workout_blocks,
        exercises: stored.workout_exercises,
      }
    }

    problems.push(...coverageProblems(plan, assertions))
  } catch (error) {
    problems.push(`the run stopped: ${messageOf(error)}`)
  }

  // ── Cleanup, whatever happened above ──────────────────────────────────────

  /** @type {string[]} */
  let deleted = []
  /** @type {Record<string, number>} */
  const remaining = {}
  try {
    deleted = await deleteLaneUsers()

    // By address and by id: a user this run created must be gone under both.
    const survivors = (await client.listUsers()).filter(
      (user) => isLaneEmail(user?.email, namespace) || created.includes(user?.id),
    )
    remaining.users = survivors.length
    remaining.profiles = (await rowsFor('profiles', 'id', created)).length
    remaining.locations = (await rowsFor('locations', 'user_id', created)).length
    remaining.workout_sessions = (await rowsFor('workout_sessions', 'user_id', created)).length

    for (const [what, count] of Object.entries(remaining)) {
      if (count > 0) problems.push(`cleanup: ${count} row(s) of ${what} survived`)
    }
  } catch (error) {
    problems.push(`cleanup did not finish: ${messageOf(error)}`)
  }

  return {
    users: created.length,
    assertions,
    persisted,
    forcedFailure,
    cleanup: { deleted, remaining },
    problems,
  }
}
