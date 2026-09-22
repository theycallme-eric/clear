import { describe, expect, it } from 'vitest'

import { ErrorCode } from '../state/errors'
import { createCandidatesDouble } from '../test/candidates-double'
import { seededCatalog } from '../test/seed-catalog'
import {
  ACTIVE_RECOVERY_SECTIONS,
  CANDIDATE_FLOOR,
  SESSION_FOCUSES,
  createCandidatesClient,
  type SectionCandidates,
  type SessionFocus,
} from './candidates'
import type { UserConstraintRow } from './constraints'

// GEN-02a. "Retrieval tests pass against seeded data, no model calls" is the
// acceptance criterion, so the library these tests run against is the committed
// seed — 140 exercises, read out of `supabase/seed/` by src/test/seed-catalog —
// and not a fixture chosen to make the assertions true. The retrieval itself is
// the migration's, transcribed into src/test/candidates-double, which says
// plainly what it can and cannot prove.
//
// Nothing here calls a model, and the last test in the file is the one that
// checks it: one HTTP request leaves the client, and it goes to PostgREST.

const URL_ = 'https://project.supabase.co'
const ANON_KEY = 'anon-key'
const TOKEN = 'user-token'
const USER = 'user-1'
const OTHER_USER = 'user-2'
const SESSION = 'session-1'

/** The six a profile enables by default (DATA-01b §3). */
const DEFAULT_SECTIONS = [
  'warmup',
  'primary_lift',
  'accessory',
  'core',
  'conditioning',
  'cooldown',
]

/**
 * A realistically-equipped location, in the requirement's words. Every item is
 * one the seeded catalog actually names, and `bodyweight` is among them because
 * the previous schema defaulted a location's equipment to exactly that
 * (00003_create_locations.sql) — a location without it is not a location a user
 * can reach.
 */
const HOME_GYM = [
  'bodyweight',
  'barbell',
  'dumbbells',
  'kettlebells',
  'pullup_bar',
  'resistance_bands',
  'box',
]

const GOAL_PRESETS = [
  'strength',
  'hypertrophy',
  'conditioning',
  'balanced',
  'active_recovery',
]

interface SetupOptions {
  goalPreset?: string | null
  enabledSections?: readonly string[]
  equipment?: readonly string[]
  locationId?: string
  constraints?: readonly UserConstraintRow[]
  catalogFilter?: (exercise: ReturnType<typeof seededCatalog>[number]) => boolean
}

const setup = (options: SetupOptions = {}) => {
  const double = createCandidatesDouble({
    url: URL_,
    anonKey: ANON_KEY,
    users: { [TOKEN]: USER },
    profiles: {
      [USER]: {
        goalPreset: options.goalPreset ?? 'strength',
        enabledSections: options.enabledSections ?? DEFAULT_SECTIONS,
        locations: [
          {
            id: options.locationId ?? 'location-home',
            isDefault: true,
            equipment: options.equipment ?? HOME_GYM,
          },
        ],
      },
    },
    constraints: options.constraints,
    catalog:
      options.catalogFilter === undefined
        ? undefined
        : seededCatalog().filter(options.catalogFilter),
  })

  const client = createCandidatesClient({
    url: URL_,
    anonKey: ANON_KEY,
    accessToken: TOKEN,
    fetch: double.fetch,
  })

  return { client, double }
}

/** A constraint row as the table stores one. */
const constraint = (
  overrides: Partial<UserConstraintRow> & Pick<UserConstraintRow, 'scope'>,
): UserConstraintRow => ({
  id: `constraint-${overrides.scope}-${overrides.target_exercise_id ?? overrides.target_pattern ?? overrides.target_equipment ?? ''}`,
  user_id: USER,
  action: 'exclude',
  persistence: 'persistent',
  applies_to_session_id: null,
  target_exercise_id: null,
  target_pattern: null,
  target_equipment: null,
  note: null,
  created_at: '2026-09-21T00:00:00.000Z',
  ...overrides,
})

const sectionsOf = (sections: readonly SectionCandidates[]) =>
  sections.map((section) => section.section)

const unwrapSections = async (
  client: ReturnType<typeof setup>['client'],
  focus: SessionFocus = 'full_body',
  extra: { sessionId?: string } = {},
) => {
  const result = await client.retrieve({ userId: USER, focus, ...extra })
  if (!result.ok) throw new Error(`retrieval failed: ${result.error.code}`)

  return result.value
}

describe('retrieval against the seeded library (GEN-02a)', () => {
  it('reads the committed seed, not a fixture written for this test', () => {
    // If this number moves, the library moved: every count below is about the
    // catalog DATA-02 actually seeds.
    expect(seededCatalog()).toHaveLength(140)
  })

  it('gives every goal preset a non-empty set for every section it resolves', async () => {
    for (const goalPreset of GOAL_PRESETS) {
      for (const focus of SESSION_FOCUSES) {
        const { client } = setup({ goalPreset })
        const sections = await unwrapSections(client, focus)

        expect(sections.length).toBeGreaterThan(0)
        for (const section of sections) {
          expect(
            section.candidates.length,
            `${goalPreset}/${focus}/${section.section} resolved to nothing`,
          ).toBeGreaterThan(0)
        }
      }
    }
  })

  it('resolves active recovery to warmup, mobility and cooldown only', async () => {
    const { client } = setup({
      goalPreset: 'active_recovery',
      // The toggles say otherwise, and the goal overrides them: a recovery
      // session with a primary lift in it is not a recovery session.
      enabledSections: ['warmup', 'primary_lift', 'accessory', 'conditioning'],
    })

    const sections = await unwrapSections(client, 'full_body')

    expect(sectionsOf(sections)).toEqual([...ACTIVE_RECOVERY_SECTIONS])
  })

  it('retrieves each section in the order the profile enables them', async () => {
    const { client } = setup({ enabledSections: ['warmup', 'primary_lift', 'cooldown'] })

    expect(sectionsOf(await unwrapSections(client))).toEqual([
      'warmup',
      'primary_lift',
      'cooldown',
    ])
  })

  it('admits only exercises the section itself is tagged for', async () => {
    const { client } = setup()
    const catalog = new Map(seededCatalog().map((exercise) => [exercise.id, exercise]))

    for (const section of await unwrapSections(client)) {
      for (const candidate of section.candidates) {
        expect(catalog.get(candidate.exerciseId)?.sections).toContain(section.section)
      }
    }
  })

  it('admits only exercises the focus reaches, or a role the focus does not bind', async () => {
    // upper_body → press, pull (focus_pattern_map, seeded by the migration).
    const exempt = ['conditioning', 'mobility', 'activation', 'cardio', 'stability']
    const { client } = setup()

    for (const section of await unwrapSections(client, 'upper_body')) {
      // A relaxed section dropped the predicate on purpose; it is tested below.
      if (section.relaxed) continue
      for (const candidate of section.candidates) {
        const thematic =
          candidate.patterns.includes('press') || candidate.patterns.includes('pull')

        expect(
          thematic || exempt.includes(candidate.role),
          `${candidate.exerciseId} is neither a press/pull nor focus-exempt`,
        ).toBe(true)
      }
    }
  })
})

describe('equipment, resolved per candidate (GEN-02a)', () => {
  it('carries the equipment the exercise may actually be performed with', async () => {
    const { client } = setup({ equipment: ['bodyweight', 'dumbbells'] })

    for (const section of await unwrapSections(client)) {
      for (const candidate of section.candidates) {
        expect(candidate.usableEquipment.length).toBeGreaterThan(0)
        for (const item of candidate.usableEquipment) {
          expect(['bodyweight', 'dumbbells']).toContain(item)
        }
      }
    }
  })

  it('narrows a candidate rather than removing it when one option is excluded', async () => {
    // Bench press is barbell or dumbbells; excluding the barbell leaves it
    // eligible, offered with dumbbells alone.
    const { client } = setup({
      constraints: [constraint({ scope: 'equipment', target_equipment: 'barbell' })],
    })

    const sections = await unwrapSections(client, 'upper_body')
    const benchPress = sections
      .flatMap((section) => section.candidates)
      .find((candidate) => candidate.exerciseId === 'bench-press')

    expect(benchPress?.usableEquipment).toEqual(['dumbbells'])
  })

  it('removes an exercise whose every option is excluded', async () => {
    const { client } = setup({
      constraints: [constraint({ scope: 'equipment', target_equipment: 'barbell' })],
    })

    // Back squat is barbell-only in the seed, so nothing about it survives.
    const ids = (await unwrapSections(client, 'lower_body'))
      .flatMap((section) => section.candidates)
      .map((candidate) => candidate.exerciseId)

    expect(ids).not.toContain('back-squat')
  })

  it('offers nothing the resolved location does not have', async () => {
    // Bodyweight alone, and the sections such a location can actually fill: a
    // primary lift is not one of them, which the next test is about.
    const travelling = setup({
      equipment: ['bodyweight'],
      enabledSections: ['warmup', 'accessory', 'core', 'cooldown'],
    })

    const ids = (await unwrapSections(travelling.client, 'lower_body'))
      .flatMap((section) => section.candidates)
      .map((candidate) => candidate.exerciseId)

    expect(ids).toContain('air-squat')
    expect(ids).not.toContain('back-squat')
  })
})

describe('user constraints, applied before the prompt exists (GEN-02a)', () => {
  it('excludes a named exercise', async () => {
    const { client } = setup({
      constraints: [
        constraint({ scope: 'exercise', target_exercise_id: 'back-squat' }),
      ],
    })

    const ids = (await unwrapSections(client, 'lower_body'))
      .flatMap((section) => section.candidates)
      .map((candidate) => candidate.exerciseId)

    expect(ids).not.toContain('back-squat')
    expect(ids).toContain('goblet-squat')
  })

  it('excludes every exercise carrying an excluded pattern', async () => {
    const { client } = setup({
      constraints: [constraint({ scope: 'movement_pattern', target_pattern: 'hinge' })],
    })

    for (const section of await unwrapSections(client, 'lower_body')) {
      for (const candidate of section.candidates) {
        expect(candidate.patterns).not.toContain('hinge')
      }
    }
  })

  it('applies a session-scoped exclusion to its own session and to no other', async () => {
    const { client } = setup({
      constraints: [
        constraint({
          scope: 'exercise',
          target_exercise_id: 'back-squat',
          persistence: 'session',
          applies_to_session_id: SESSION,
        }),
      ],
    })

    const inSession = (await unwrapSections(client, 'lower_body', { sessionId: SESSION }))
      .flatMap((section) => section.candidates)
      .map((candidate) => candidate.exerciseId)
    const withoutSession = (await unwrapSections(client, 'lower_body'))
      .flatMap((section) => section.candidates)
      .map((candidate) => candidate.exerciseId)

    expect(inSession).not.toContain('back-squat')
    expect(withoutSession).toContain('back-squat')
  })

  it('does not filter on avoid or prefer_not — they are ranking, not eligibility', async () => {
    const { client } = setup({
      constraints: [
        constraint({
          scope: 'exercise',
          target_exercise_id: 'back-squat',
          action: 'avoid',
        }),
      ],
    })

    const ids = (await unwrapSections(client, 'lower_body'))
      .flatMap((section) => section.candidates)
      .map((candidate) => candidate.exerciseId)

    expect(ids).toContain('back-squat')
  })
})

describe('the floor, and the relaxation it forces (GEN-02a §3)', () => {
  it('records a section that came in under the floor', async () => {
    const { client } = setup()
    const sections = await unwrapSections(client, 'power')

    // Cooldown carries six exercises in the whole seeded library, so it is
    // under the floor of eight for every request — a thin library showing up in
    // diagnostics, which is what §3 asks the flag to do.
    expect(CANDIDATE_FLOOR).toBe(8)
    const cooldown = sections.find((section) => section.section === 'cooldown')
    expect(cooldown?.relaxed).toBe(true)
    expect(cooldown?.candidates.length).toBeGreaterThan(0)
  })

  it('relaxes the pattern predicate only, and only for that section', async () => {
    const { client } = setup()
    const sections = await unwrapSections(client, 'power')
    const relaxed = sections.filter((section) => section.relaxed)
    const strict = sections.filter((section) => !section.relaxed)

    expect(relaxed.length).toBeGreaterThan(0)
    expect(strict.length).toBeGreaterThan(0)

    // Equipment and section eligibility still hold in a relaxed section: only
    // the focus→pattern predicate was dropped.
    for (const section of relaxed) {
      for (const candidate of section.candidates) {
        expect(candidate.usableEquipment.length).toBeGreaterThan(0)
      }
    }
  })

  it('leaves a section alone once it clears the floor the caller set', async () => {
    const { client } = setup()
    const sections = await client.retrieve({
      userId: USER,
      focus: 'full_body',
      floor: 1,
    })

    expect(sections.ok).toBe(true)
    if (!sections.ok) return
    expect(sections.value.every((section) => !section.relaxed)).toBe(true)
  })
})

describe('an empty set is a typed error, never an empty workout (GEN-02a)', () => {
  it('fails when a section resolves to nothing', async () => {
    // A location holding one item nothing in the catalog names: eligibility is
    // over-constrained, and the honest answer is a refusal.
    const { client } = setup({ equipment: ['skipping_rope'] })

    const result = await client.retrieve({ userId: USER, focus: 'full_body' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(ErrorCode.GENERATION_NO_CANDIDATES)
    expect(result.error.message).toBe(
      'No exercises match these options. Change equipment or exclusions.',
    )
    expect(result.error.details?.sections).toEqual(DEFAULT_SECTIONS)
  })

  it('refuses a bodyweight-only location asked for a primary lift', async () => {
    // Not a defect and not a thin library: every primary lift in the seeded
    // catalog needs a barbell, a dumbbell, a kettlebell or a bar. The request
    // is over-constrained, and GEN-02b never sees a section it could fill with
    // nothing.
    const { client } = setup({ equipment: ['bodyweight'] })

    const result = await client.retrieve({ userId: USER, focus: 'lower_body' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(ErrorCode.GENERATION_NO_CANDIDATES)
    expect(result.error.details?.sections).toEqual(['primary_lift'])
  })

  it('names only the sections that came back empty', async () => {
    const { client } = setup({
      // Only the mobility rows survive. Three of the six sections still have
      // something — several of those exercises are tagged warmup, core or
      // cooldown as well — and the error names the three that do not.
      catalogFilter: (exercise) => exercise.sections.includes('mobility'),
    })

    const result = await client.retrieve({ userId: USER, focus: 'full_body' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.details?.sections).toEqual([
      'primary_lift',
      'accessory',
      'conditioning',
    ])
  })

  it('fails when the request resolves to no sections at all', async () => {
    const { client } = setup()

    // Another user's profile, and owner-only RLS means it is not readable, so
    // nothing resolves. An empty result is not a workout with nothing in it.
    const result = await client.retrieve({ userId: OTHER_USER, focus: 'full_body' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(ErrorCode.GENERATION_NO_CANDIDATES)
    expect(result.error.details?.sections).toBe('none resolved')
  })

  it('reports a transport refusal as itself, not as an empty candidate set', async () => {
    const { double } = setup()
    const anonymous = createCandidatesClient({
      url: URL_,
      anonKey: ANON_KEY,
      accessToken: null,
      fetch: double.fetch,
    })

    const result = await anonymous.retrieve({ userId: USER, focus: 'full_body' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(ErrorCode.AUTH_UNAUTHENTICATED)
  })
})

describe('no model call (GEN-02a)', () => {
  it('makes exactly one request, and it is the retrieval RPC', async () => {
    const { client, double } = setup()

    await client.retrieve({ userId: USER, focus: 'full_body' })

    expect(double.requests()).toEqual([
      { method: 'POST', path: '/rpc/generation_candidate_sets' },
    ])
  })

  it('asks for every section in that one round trip', async () => {
    const { client, double } = setup()

    const sections = await unwrapSections(client)

    expect(sections).toHaveLength(DEFAULT_SECTIONS.length)
    expect(double.requests()).toHaveLength(1)
  })
})
