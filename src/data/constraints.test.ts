import { describe, expect, it } from 'vitest'

import { ErrorCode } from '../state/errors'
import { createPostgrestDouble } from '../test/postgrest-double'
import { deprioritized, exclusions } from './constraint-selectors'
import {
  CONSTRAINT_ACTIONS,
  CONSTRAINT_SCOPES,
  USER_SETTABLE_ACTIONS,
  createUserConstraintsClient,
  fromRow,
  toRow,
  type NewUserConstraint,
  type UserConstraint,
} from './constraints'

// DATA-05. The acceptance criterion is that a constraint persists and comes
// back through the typed client, so these tests exercise the client against a
// PostgREST double that holds the table's own rules (src/test/postgrest-double).
// What that can prove is the round trip: the domain type maps to the three
// target columns and back without loss, the session filter is the one the
// eligibility query uses, and a refusal arrives as a typed error rather than a
// thrown string. What it cannot prove is that Postgres agrees — the schema is
// asserted in src/test/user-constraints-migration.test.ts and executed against
// a database by ENV-07.

const URL_ = 'https://project.supabase.co'
const ANON_KEY = 'anon-key'
const TOKEN = 'user-token'
const USER = 'user-1'
const OTHER_USER = 'user-2'
const SESSION = 'session-1'
const LATER_SESSION = 'session-2'

const setup = (options: { exerciseIds?: readonly string[] } = {}) => {
  const double = createPostgrestDouble({
    url: URL_,
    anonKey: ANON_KEY,
    users: { [TOKEN]: USER },
    exerciseIds: options.exerciseIds,
  })

  const client = createUserConstraintsClient({
    url: URL_,
    anonKey: ANON_KEY,
    accessToken: TOKEN,
    fetch: double.fetch,
  })

  return { client, double }
}

const excludeBarbell: NewUserConstraint = {
  userId: USER,
  action: 'exclude',
  target: { scope: 'equipment', equipmentId: 'barbell' },
  appliesTo: { persistence: 'persistent' },
  note: null,
}

/** Unwraps a result the test asserts is a success, keeping the value typed. */
function expectOk<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  expect(result.ok, JSON.stringify('error' in result ? result.error : null)).toBe(
    true,
  )
  if (!result.ok) throw new Error('unreachable')

  return result.value
}

describe('user constraints — round trip (DATA-05)', () => {
  it('persists a constraint and reads back what was written', async () => {
    const { client } = setup()

    const stored = expectOk(await client.add(excludeBarbell))

    expect(stored).toMatchObject({
      userId: USER,
      action: 'exclude',
      target: { scope: 'equipment', equipmentId: 'barbell' },
      appliesTo: { persistence: 'persistent' },
      note: null,
    })
    expect(stored.id).toBeTruthy()
    expect(stored.createdAt).toBeTruthy()

    const listed = expectOk(await client.list(USER))

    expect(listed).toEqual([stored])
  })

  it('round-trips every scope, each through its own target column', async () => {
    const { client, double } = setup({ exerciseIds: ['back-squat'] })

    const inputs: NewUserConstraint[] = [
      {
        userId: USER,
        action: 'exclude',
        target: { scope: 'exercise', exerciseId: 'back-squat' },
        appliesTo: { persistence: 'persistent' },
        note: null,
      },
      {
        userId: USER,
        action: 'exclude',
        target: { scope: 'movement_pattern', pattern: 'hinge' },
        appliesTo: { persistence: 'persistent' },
        note: null,
      },
      excludeBarbell,
    ]

    for (const input of inputs) expectOk(await client.add(input))

    const listed = expectOk(await client.list(USER))
    expect(listed.map((constraint) => constraint.target)).toEqual(
      inputs.map((input) => input.target),
    )

    // Three scopes, three columns, exactly one populated per row — which is
    // what the schema's two target CHECKs enforce.
    for (const row of double.rows()) {
      const targets = [
        row.target_exercise_id,
        row.target_pattern,
        row.target_equipment,
      ]

      expect(targets.filter((target) => target !== null)).toHaveLength(1)
    }

    expect(new Set(double.rows().map((row) => row.scope))).toEqual(
      new Set(CONSTRAINT_SCOPES),
    )
  })

  it('has no impact scope to write', () => {
    // CLEAR does not model injuries, and the catalog carries no impact tagging
    // to enforce an impact exclusion against.
    expect(CONSTRAINT_SCOPES).not.toContain('impact')
    expect(CONSTRAINT_SCOPES).toHaveLength(3)
  })

  it('persists all three actions while exposing only exclude to the UI', async () => {
    const { client } = setup()

    for (const action of CONSTRAINT_ACTIONS) {
      expectOk(
        await client.add({
          ...excludeBarbell,
          action,
          target: { scope: 'equipment', equipmentId: `${action}-machine` },
        }),
      )
    }

    const listed = expectOk(await client.list(USER))

    expect(listed.map((constraint) => constraint.action)).toEqual([
      ...CONSTRAINT_ACTIONS,
    ])
    // avoid and prefer_not persist and travel as context; nothing filters on
    // them, and no control offers them until a ranking layer consumes them.
    expect(deprioritized(listed).map((constraint) => constraint.action)).toEqual([
      'avoid',
      'prefer_not',
    ])
    expect(exclusions(listed).equipment).toEqual(['exclude-machine'])
    expect([...USER_SETTABLE_ACTIONS]).toEqual(['exclude'])
  })

  it('removes a constraint the user has changed their mind about', async () => {
    const { client, double } = setup()
    const stored = expectOk(await client.add(excludeBarbell))

    expectOk(await client.remove(stored.id))

    expect(double.rows()).toEqual([])
    expect(expectOk(await client.list(USER))).toEqual([])
  })
})

describe('user constraints — session scope (DATA-05)', () => {
  const sessionScoped: NewUserConstraint = {
    userId: USER,
    action: 'exclude',
    target: { scope: 'movement_pattern', pattern: 'press' },
    appliesTo: { persistence: 'session', sessionId: SESSION },
    note: null,
  }

  it('applies a session-scoped exclusion to its session and to no later one', async () => {
    const { client } = setup()

    expectOk(await client.add(excludeBarbell))
    expectOk(await client.add(sessionScoped))

    const thisSession = expectOk(await client.listInForce(USER, SESSION))
    expect(exclusions(thisSession)).toMatchObject({
      patterns: ['press'],
      equipment: ['barbell'],
    })

    // The leak this closes: without applies_to_session_id, this exclusion
    // would still be filtering next week.
    const nextSession = expectOk(await client.listInForce(USER, LATER_SESSION))
    expect(exclusions(nextSession)).toMatchObject({
      patterns: [],
      equipment: ['barbell'],
    })

    // And with no session at all — nothing session-scoped is in force.
    const noSession = expectOk(await client.listInForce(USER))
    expect(exclusions(noSession).patterns).toEqual([])
  })

  it('keeps the session-scoped row visible to the list that shows everything', async () => {
    const { client } = setup()
    expectOk(await client.add(sessionScoped))

    // In force is a narrowing of what is stored, not a deletion: the row is
    // still the user's, and a settings screen still shows it.
    expect(expectOk(await client.list(USER))).toHaveLength(1)
    expect(expectOk(await client.listInForce(USER, LATER_SESSION))).toHaveLength(0)
  })

  it('names the session it belongs to, in the row and in the type', async () => {
    const { client, double } = setup()
    const stored = expectOk(await client.add(sessionScoped))

    expect(stored.appliesTo).toEqual({
      persistence: 'session',
      sessionId: SESSION,
    })
    expect(double.rows()[0]).toMatchObject({
      persistence: 'session',
      applies_to_session_id: SESSION,
    })
  })
})

describe('user constraints — free text (DATA-05)', () => {
  it('stores a note verbatim and infers no constraint from it', async () => {
    const { client } = setup()
    const note = 'Barbell squats hurt; dumbbells are fine.'

    const stored = expectOk(
      await client.add({
        userId: USER,
        action: 'avoid',
        target: { scope: 'movement_pattern', pattern: 'squat' },
        appliesTo: { persistence: 'persistent' },
        note,
      }),
    )

    expect(stored.note).toBe(note)
    expect(expectOk(await client.list(USER))[0]?.note).toBe(note)

    // The note names a barbell and an exercise. Neither becomes an exclusion:
    // the row's action is `avoid`, so nothing is excluded at all, and no text
    // is parsed on either side of the wire.
    const inForce = expectOk(await client.listInForce(USER, SESSION))
    expect(exclusions(inForce)).toEqual({
      exerciseIds: [],
      patterns: [],
      equipment: [],
    })
  })

  it('defaults an absent note to null rather than inventing one', () => {
    const row = toRow({
      userId: USER,
      action: 'exclude',
      target: { scope: 'equipment', equipmentId: 'barbell' },
      appliesTo: { persistence: 'persistent' },
    })

    expect(row.note).toBeNull()
  })
})

describe('user constraints — refusals arrive typed (DATA-05)', () => {
  it('refuses to call the project at all when nobody is signed in', async () => {
    const double = createPostgrestDouble({
      url: URL_,
      anonKey: ANON_KEY,
      users: { [TOKEN]: USER },
    })
    const client = createUserConstraintsClient({
      url: URL_,
      anonKey: ANON_KEY,
      accessToken: null,
      fetch: double.fetch,
    })

    const result = await client.add(excludeBarbell)

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error.code).toBe(
      ErrorCode.AUTH_UNAUTHENTICATED,
    )
    expect(double.requests()).toEqual([])
  })

  it('reports another user’s row as unauthorized, not as a write failure', async () => {
    const { client, double } = setup()

    const result = await client.add({ ...excludeBarbell, userId: OTHER_USER })

    expect(result.ok === false && result.error.code).toBe(
      ErrorCode.AUTH_UNAUTHORIZED,
    )
    expect(double.rows()).toEqual([])
  })

  it('reports a target the database refuses as a constraint violation', async () => {
    const { client } = setup()

    const result = await client.add({
      ...excludeBarbell,
      // A blank equipment id excludes nothing and would sit in the list
      // looking like it did. The table refuses it, and that refusal is a
      // validation error rather than a failed write.
      target: { scope: 'equipment', equipmentId: '   ' },
    })

    expect(result.ok === false && result.error.code).toBe(
      ErrorCode.VALIDATION_CONSTRAINT,
    )
  })

  it('reports a duplicate as a conflict', async () => {
    const { client } = setup()
    expectOk(await client.add(excludeBarbell))

    const again = await client.add(excludeBarbell)

    expect(again.ok === false && again.error.code).toBe(
      ErrorCode.PERSISTENCE_CONFLICT,
    )
  })

  it('reports an unreachable project as a network failure', async () => {
    const client = createUserConstraintsClient({
      url: URL_,
      anonKey: ANON_KEY,
      accessToken: TOKEN,
      fetch: () => Promise.reject(new TypeError('Failed to fetch')),
    })

    const result = await client.list(USER)

    expect(result.ok === false && result.error.code).toBe(
      ErrorCode.NETWORK_OFFLINE,
    )
  })
})

describe('user constraints — row mapping (DATA-05)', () => {
  it('rejects a row whose scope and target disagree instead of casting it', () => {
    const result = fromRow({
      id: 'constraint-1',
      user_id: USER,
      scope: 'equipment',
      action: 'exclude',
      persistence: 'persistent',
      applies_to_session_id: null,
      target_exercise_id: 'back-squat',
      target_pattern: null,
      target_equipment: null,
      note: null,
      created_at: '2026-09-21T00:00:01Z',
    })

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error.code).toBe(
      ErrorCode.PERSISTENCE_READ_FAILED,
    )
  })

  it('rejects a session-scoped row with no session', () => {
    const result = fromRow({
      id: 'constraint-1',
      user_id: USER,
      scope: 'movement_pattern',
      action: 'exclude',
      persistence: 'session',
      applies_to_session_id: null,
      target_exercise_id: null,
      target_pattern: 'press',
      target_equipment: null,
      note: null,
      created_at: '2026-09-21T00:00:01Z',
    })

    expect(result.ok).toBe(false)
  })

  it('maps a valid row to the domain type and back unchanged', () => {
    const row = {
      id: 'constraint-1',
      user_id: USER,
      scope: 'movement_pattern' as const,
      action: 'prefer_not' as const,
      persistence: 'session' as const,
      applies_to_session_id: SESSION,
      target_exercise_id: null,
      target_pattern: 'pull' as const,
      target_equipment: null,
      note: 'shoulder feels off today',
      created_at: '2026-09-21T00:00:01Z',
    }

    const constraint: UserConstraint = expectOk(fromRow(row))
    const { id, createdAt, ...rest } = constraint

    expect(id).toBe(row.id)
    expect(createdAt).toBe(row.created_at)
    expect(toRow(rest)).toEqual({
      user_id: row.user_id,
      scope: row.scope,
      action: row.action,
      persistence: row.persistence,
      applies_to_session_id: row.applies_to_session_id,
      target_exercise_id: null,
      target_pattern: row.target_pattern,
      target_equipment: null,
      note: row.note,
    })
  })
})
