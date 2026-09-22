/**
 * CORE-03 — the boundary schemas, checked against the two things they claim to
 * mirror: contract 4.1.0 §5, and the CHECK constraints in
 * `supabase/migrations/`.
 *
 * The acceptance criterion is "rejects malformed output", so most of this file
 * is rejections. A schema that accepts the happy sample proves very little —
 * the old app's `validateWorkout` accepted everything it was given, which is
 * exactly how defect D2 shipped. What matters is which payloads are refused,
 * and that the refusal names the field.
 *
 * The sample in §1 is not hand-written: it is read out of
 * `docs/specs/generation/WORKED_EXAMPLE.md`, so the spec's own worked output is
 * what the schema is tested against and a contract change that skips this file
 * fails here.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

import type { Tables } from '../data/database.types'
import { ErrorCode, isErr, isOk } from './errors'
import {
  CONTRACT_VERSION,
  errorResponseSchema,
  generationOutputSchema,
  generationRequestSchema,
  generationResponseSchema,
  isErrorResponse,
  locationSchema,
  parseBoundary,
  prescriptionSchema,
  profileSchema,
  schemaIssues,
  userConstraintRowSchema,
  workoutBlockSchema,
  type GenerationOutput,
  type Location,
  type Profile,
  type UserConstraintRow,
} from './schemas'

const REPO_ROOT = join(import.meta.dirname, '..', '..')
const read = (path: string) => readFileSync(join(REPO_ROOT, path), 'utf8')

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** The composition result in `WORKED_EXAMPLE.md` §2 — the real v4.1 sample. */
function workedExample(): unknown {
  const blocks = [...read('docs/specs/generation/WORKED_EXAMPLE.md').matchAll(/```json\n([\s\S]*?)```/g)]
    .map((match) => match[1])
    .filter((block) => block.includes('"sections"'))

  expect(blocks, 'WORKED_EXAMPLE.md no longer contains a composition result').toHaveLength(1)

  return JSON.parse(blocks[0]) as unknown
}

/** Every field of a prescription, so a test can change exactly one of them. */
function prescription(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    exercise_id: 'kb-swing',
    equipment: 'kettlebell',
    session_function: 'conditioning',
    anchor_relationship: 'complementary',
    modality: 'reps',
    sets: null,
    target_kind: 'fixed',
    target_value: 15,
    target_min: null,
    target_max: null,
    target_sequence: null,
    per_side: false,
    distance_unit: null,
    rest_seconds: null,
    tempo: null,
    load_type: 'absolute',
    load_value: 24,
    is_interval_exercise: false,
    ...overrides,
  }
}

function block(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    structure_type: 'standard',
    rounds: null,
    timer_type: 'none',
    timer_seconds: null,
    round_rest_seconds: null,
    rep_scheme: 'fixed',
    block_notes: null,
    exercises: [prescription()],
    ...overrides,
  }
}

function output(...blocks: Record<string, unknown>[]): Record<string, unknown> {
  return {
    title: 'Lower-body strength',
    overview: null,
    sections: [
      {
        section_type: 'conditioning',
        section_title: 'Finish',
        section_notes: null,
        blocks: blocks.length > 0 ? blocks : [block()],
      },
    ],
    estimated_duration_mins: 46,
  }
}

/** The four shapes the requirement names, in one section that has to parse. */
const everyPrescriptionShape = output(
  // A ladder: 15-12-9-6-3 arrives as a sequence, not as prose.
  block({
    structure_type: 'for_time',
    timer_type: 'countdown',
    timer_seconds: 720,
    rep_scheme: 'ladder_down',
    exercises: [
      prescription({
        exercise_id: 'thruster',
        target_kind: 'sequence',
        target_value: null,
        target_sequence: [15, 12, 9, 6, 3],
      }),
    ],
  }),
  // A rep range, a per-side prescription, and a distance prescription.
  block({
    exercises: [
      prescription({
        exercise_id: 'db-split-squat',
        sets: 3,
        target_kind: 'range',
        target_value: null,
        target_min: 8,
        target_max: 10,
        per_side: true,
        load_type: 'rir',
        load_value: 3,
      }),
      prescription({
        exercise_id: 'row-erg',
        equipment: 'rower',
        modality: 'distance',
        sets: 3,
        target_value: 400,
        distance_unit: 'm',
        load_type: 'none',
        load_value: null,
      }),
    ],
  }),
)

// ─────────────────────────────────────────────────────────────────────────────

describe('a contract 4.1.0 sample round-trips (CORE-03)', () => {
  it('parses the worked example unchanged', () => {
    const sample = workedExample()
    const parsed = generationOutputSchema.safeParse(sample)

    expect(parsed.success ? null : schemaIssues(parsed.error)).toBeNull()
    // Round-trip: nothing coerced, nothing defaulted, nothing dropped.
    expect(parsed.success && parsed.data).toEqual(sample)
  })

  it('parses a ladder, a rep range, a per-side and a distance prescription', () => {
    const parsed = generationOutputSchema.safeParse(everyPrescriptionShape)

    expect(parsed.success ? null : schemaIssues(parsed.error)).toBeNull()
    expect(parsed.success && parsed.data).toEqual(everyPrescriptionShape)
  })

  it('names the version it parses', () => {
    expect(CONTRACT_VERSION).toBe('4.1.0')
  })
})

describe('the discriminated target rejects the wrong fields (check 4)', () => {
  const rejected = (overrides: Record<string, unknown>) =>
    prescriptionSchema.safeParse(prescription(overrides))

  it('refuses a fixed target carrying a range', () => {
    const parsed = rejected({ target_min: 8, target_max: 10 })

    expect(parsed.success).toBe(false)
    expect(parsed.success ? [] : schemaIssues(parsed.error).map((issue) => issue.path)).toEqual(
      expect.arrayContaining(['target_min', 'target_max']),
    )
  })

  it('refuses a range with no bounds', () => {
    expect(rejected({ target_kind: 'range', target_value: null }).success).toBe(false)
  })

  it('refuses a range whose maximum is not above its minimum', () => {
    const parsed = rejected({
      target_kind: 'range',
      target_value: null,
      target_min: 10,
      target_max: 10,
    })

    expect(parsed.success).toBe(false)
    expect(parsed.success ? [] : schemaIssues(parsed.error)).toContainEqual({
      path: 'target_max',
      message: 'target_max must be greater than target_min',
    })
  })

  it('refuses a sequence of one rung — that is a fixed target, written expensively', () => {
    const parsed = rejected({
      target_kind: 'sequence',
      target_value: null,
      target_sequence: [15],
    })

    expect(parsed.success).toBe(false)
    expect(parsed.success ? [] : schemaIssues(parsed.error).map((issue) => issue.path)).toContain(
      'target_sequence',
    )
  })

  it('refuses a sequence that also names a fixed value', () => {
    expect(rejected({ target_kind: 'sequence', target_sequence: [15, 12, 9] }).success).toBe(false)
  })

  it('keeps a range and a two-rung ladder distinguishable', () => {
    const range = prescriptionSchema.parse(
      prescription({ target_kind: 'range', target_value: null, target_min: 8, target_max: 10 }),
    )
    const ladder = prescriptionSchema.parse(
      prescription({ target_kind: 'sequence', target_value: null, target_sequence: [8, 10] }),
    )

    expect(range.target_kind).toBe('range')
    expect(ladder.target_kind).toBe('sequence')
  })
})

describe('modality is reps, time or distance — never rounds (contract §5)', () => {
  it.each(['reps', 'time', 'distance'])('accepts %s', (modality) => {
    const parsed = prescriptionSchema.safeParse(
      prescription({ modality, distance_unit: modality === 'distance' ? 'm' : null }),
    )

    expect(parsed.success).toBe(true)
  })

  it('rejects rounds, which belongs to the block', () => {
    const parsed = prescriptionSchema.safeParse(prescription({ modality: 'rounds' }))

    expect(parsed.success).toBe(false)
    expect(parsed.success ? [] : schemaIssues(parsed.error).map((issue) => issue.path)).toContain(
      'modality',
    )
  })

  it('rejects an exercise that carries the block-owned clock at all', () => {
    // Not a bad enum value — a key that does not exist in the contract. The
    // block level exists so members of a circuit cannot disagree about it.
    const parsed = prescriptionSchema.safeParse(prescription({ rounds: 3, timer_seconds: 600 }))

    expect(parsed.success).toBe(false)
  })

  it('requires distance_unit when the modality is distance (check 5)', () => {
    const parsed = prescriptionSchema.safeParse(prescription({ modality: 'distance' }))

    expect(parsed.success ? [] : schemaIssues(parsed.error)).toContainEqual({
      path: 'distance_unit',
      message: 'distance_unit is required when modality is distance',
    })
  })
})

describe('load guidance carries a value unless it is its own answer (check 7)', () => {
  it.each(['bodyweight', 'prior_session', 'none'])('accepts a null load_value for %s', (load) => {
    expect(prescriptionSchema.safeParse(prescription({ load_type: load, load_value: null })).success).toBe(
      true,
    )
  })

  it.each(['percent_1rm', 'rir', 'absolute'])('rejects a null load_value for %s', (load) => {
    const parsed = prescriptionSchema.safeParse(prescription({ load_type: load, load_value: null }))

    expect(parsed.success ? [] : schemaIssues(parsed.error).map((issue) => issue.path)).toContain(
      'load_value',
    )
  })
})

describe('a block carries the clock its structure needs (check 6)', () => {
  it.each(['emom', 'amrap', 'for_time'])('rejects %s without timer_seconds', (structure) => {
    const parsed = workoutBlockSchema.safeParse(block({ structure_type: structure }))

    expect(parsed.success ? [] : schemaIssues(parsed.error)).toContainEqual({
      path: 'timer_seconds',
      message: 'emom, amrap and for_time blocks require timer_seconds',
    })
  })

  it('accepts them once the clock is there', () => {
    expect(
      workoutBlockSchema.safeParse(
        block({ structure_type: 'amrap', timer_type: 'countdown', timer_seconds: 720 }),
      ).success,
    ).toBe(true)
  })

  it('rejects a circuit without rounds', () => {
    const parsed = workoutBlockSchema.safeParse(block({ structure_type: 'circuit' }))

    expect(parsed.success ? [] : schemaIssues(parsed.error)).toContainEqual({
      path: 'rounds',
      message: 'circuit blocks require rounds',
    })
  })

  it('rejects zero rounds and a zero-length clock, as the database does', () => {
    expect(workoutBlockSchema.safeParse(block({ structure_type: 'circuit', rounds: 0 })).success).toBe(
      false,
    )
    expect(
      workoutBlockSchema.safeParse(block({ structure_type: 'amrap', timer_seconds: 0 })).success,
    ).toBe(false)
  })

  it('rejects a block with no exercises', () => {
    expect(workoutBlockSchema.safeParse(block({ exercises: [] })).success).toBe(false)
  })
})

describe('an invalid sample fails with path-level issues (CORE-03)', () => {
  it('says which field, and why, at its position in the workout', () => {
    const malformed = output(
      block(),
      block({
        structure_type: 'amrap',
        timer_type: 'countdown',
        timer_seconds: 720,
        exercises: [prescription({ modality: 'distance' })],
      }),
    )

    const parsed = generationOutputSchema.safeParse(malformed)

    expect(parsed.success).toBe(false)
    expect(parsed.success ? [] : schemaIssues(parsed.error)).toContainEqual({
      path: 'sections[0].blocks[1].exercises[0].distance_unit',
      message: 'distance_unit is required when modality is distance',
    })
  })

  it('reports a blank title against the title, not against the workout', () => {
    const parsed = generationOutputSchema.safeParse({ ...output(), title: '   ' })

    expect(parsed.success ? [] : schemaIssues(parsed.error).map((issue) => issue.path)).toContain(
      'title',
    )
  })

  it('rejects a workout with no sections at all', () => {
    expect(generationOutputSchema.safeParse({ ...output(), sections: [] }).success).toBe(false)
  })

  it('rejects an unknown key rather than silently dropping it', () => {
    expect(
      generationOutputSchema.safeParse({ ...output(), mock: true }).success,
      'an unrecognised key is a model that answered a different contract',
    ).toBe(false)
  })
})

describe('parseBoundary returns a typed failure, never a throw (CORE-01)', () => {
  it('carries every issue path in the error details', () => {
    const result = parseBoundary(generationOutputSchema, output(block({ structure_type: 'circuit' })), {
      code: ErrorCode.GENERATION_FAILED,
      requestId: 'req_abc_123',
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error.code).toBe(ErrorCode.GENERATION_FAILED)
      expect(result.error.requestId).toBe('req_abc_123')
      expect(result.error.details?.issues).toContainEqual({
        path: 'sections[0].blocks[0].rounds',
        message: 'circuit blocks require rounds',
      })
    }
  })

  it('defaults to a validation code and returns the parsed value on success', () => {
    const failure = parseBoundary(generationOutputSchema, { title: 'nope' })
    const success = parseBoundary(generationOutputSchema, everyPrescriptionShape)

    expect(isErr(failure) && failure.error.code).toBe(ErrorCode.VALIDATION_CONSTRAINT)
    expect(isOk(success) && success.value.sections).toHaveLength(1)
  })

  it('names the root when the payload is not an object at all', () => {
    const result = parseBoundary(generationOutputSchema, 'a workout, honest')

    expect(isErr(result) && result.error.details?.issues).toEqual([
      { path: '(root)', message: expect.any(String) },
    ])
  })
})

describe('the request and response envelopes (GEN-01)', () => {
  const request = {
    request_id: 'req_lxyz123_a1b2c3',
    focus: 'lower_body',
    requested_intensity: 7,
    requested_duration_mins: 45,
    location_id: '6a0d2f4c-6f1a-4a58-9d2f-2f0c8f5a1b33',
    notes: 'left shoulder has been a bit cranky',
  }

  it('accepts a well-formed request', () => {
    expect(generationRequestSchema.safeParse(request)).toMatchObject({ success: true })
  })

  it.each([
    ['requested_intensity', 11],
    ['requested_intensity', 0],
    ['requested_duration_mins', 0],
    ['location_id', 'home-gym'],
    ['request_id', '1042'],
    ['focus', 'arms'],
  ])('rejects %s = %s, which the session row could not hold either', (field, value) => {
    const parsed = generationRequestSchema.safeParse({ ...request, [field]: value })

    expect(parsed.success).toBe(false)
    expect(parsed.success ? [] : schemaIssues(parsed.error).map((issue) => issue.path)).toContain(
      field,
    )
  })

  it('reads either half of a response with one schema', () => {
    const success = generationResponseSchema.parse({
      requestId: 'req_lxyz123_a1b2c3',
      workout: everyPrescriptionShape,
    })
    const failure = generationResponseSchema.parse({
      code: ErrorCode.GENERATION_FAILED,
      message: 'Could not generate workout. Try again.',
      requestId: 'req_lxyz123_a1b2c3',
    })

    expect(isErrorResponse(success)).toBe(false)
    expect(isErrorResponse(failure)).toBe(true)
    expect(isErrorResponse(failure) && failure.code).toBe(ErrorCode.GENERATION_FAILED)
  })

  it('rejects an error response that invents a code or drops the request id', () => {
    expect(
      errorResponseSchema.safeParse({
        code: 'generation.malformed_prescription',
        message: 'no',
        requestId: 'req_lxyz123_a1b2c3',
      }).success,
    ).toBe(false)

    expect(
      errorResponseSchema.safeParse({
        code: ErrorCode.GENERATION_FAILED,
        message: 'no',
      }).success,
    ).toBe(false)
  })

  it('refuses a response whose workout is malformed rather than passing it through', () => {
    expect(
      generationResponseSchema.safeParse({
        requestId: 'req_lxyz123_a1b2c3',
        workout: output(block({ structure_type: 'emom' })),
      }).success,
    ).toBe(false)
  })
})

describe('persisted payloads mirror their CHECK constraints', () => {
  const profile = {
    id: '6a0d2f4c-6f1a-4a58-9d2f-2f0c8f5a1b33',
    created_at: '2026-09-21T16:28:21.123456+00:00',
    updated_at: '2026-09-21T16:28:21.123456+00:00',
    experience_level: null,
    goal_preset: null,
    enabled_sections: ['warmup', 'primary_lift'],
    weight_unit: 'lb',
    onboarded_at: null,
  }

  const location = {
    id: '0f3f2a9e-1d6b-4f39-8a1c-9d3d4a5b6c7d',
    user_id: '6a0d2f4c-6f1a-4a58-9d2f-2f0c8f5a1b33',
    created_at: '2026-09-21T16:28:21+00:00',
    updated_at: '2026-09-21T16:28:21+00:00',
    name: 'Home Gym',
    tier: 'home',
    is_default: true,
  }

  const constraint = {
    id: '2b6b1f5e-5f8a-4d22-9d0a-7a3b2c1d0e9f',
    user_id: '6a0d2f4c-6f1a-4a58-9d2f-2f0c8f5a1b33',
    scope: 'equipment',
    action: 'exclude',
    persistence: 'persistent',
    applies_to_session_id: null,
    target_exercise_id: null,
    target_pattern: null,
    target_equipment: 'barbell',
    note: null,
    created_at: '2026-09-21T16:28:21+00:00',
  }

  it('parses a profile, a location and a constraint row', () => {
    expect(profileSchema.safeParse(profile)).toMatchObject({ success: true })
    expect(locationSchema.safeParse(location)).toMatchObject({ success: true })
    expect(userConstraintRowSchema.safeParse(constraint)).toMatchObject({ success: true })
  })

  it('rejects a profile with no enabled sections', () => {
    // `CONSTRAINT profiles_enabled_sections_not_empty`: a profile that has
    // answered nothing still has to generate something.
    expect(profileSchema.safeParse({ ...profile, enabled_sections: [] }).success).toBe(false)
  })

  it('rejects a location whose name is blank', () => {
    expect(locationSchema.safeParse({ ...location, name: '  ' }).success).toBe(false)
  })

  it('rejects a constraint whose target does not match its scope', () => {
    const parsed = userConstraintRowSchema.safeParse({
      ...constraint,
      scope: 'exercise',
      target_equipment: 'barbell',
      target_exercise_id: null,
    })

    expect(parsed.success).toBe(false)
  })

  it('rejects a session-scoped constraint with no session', () => {
    const parsed = userConstraintRowSchema.safeParse({ ...constraint, persistence: 'session' })

    expect(parsed.success ? [] : schemaIssues(parsed.error)).toContainEqual({
      path: 'applies_to_session_id',
      message: 'a session-scoped constraint must name its session',
    })
  })

  it('ignores a column a later migration adds, rather than failing a read', () => {
    expect(profileSchema.safeParse({ ...profile, streak_days: 4 }).success).toBe(true)
  })

  it('infers row types the generated ones accept', () => {
    // Compile-time, and the point of the exercise: what validates here is what
    // `src/data/supabase.ts` can write. `npx tsc --noEmit` is the assertion.
    const parsedProfile: Tables<'profiles'> = profileSchema.parse(profile) satisfies Profile
    const parsedLocation: Tables<'locations'> = locationSchema.parse(location) satisfies Location
    const parsedConstraint: Tables<'user_constraints'> = userConstraintRowSchema.parse(
      constraint,
    ) satisfies UserConstraintRow

    expect([parsedProfile.id, parsedLocation.id, parsedConstraint.id]).toHaveLength(3)
  })
})

describe('one schema source, imported by client and edge alike (CORE-03)', () => {
  /** Every app-owned TypeScript file, plus any Deno function once one exists. */
  function sources(): string[] {
    const found: string[] = []

    const walk = (dir: string) => {
      if (!safeIsDirectory(dir)) return

      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) {
          // Vendored, and linted at source.
          if (entry !== 'design-system' && entry !== 'node_modules') walk(path)
          continue
        }
        if (/\.tsx?$/.test(entry)) found.push(relative(REPO_ROOT, path))
      }
    }

    walk(join(REPO_ROOT, 'src'))
    walk(join(REPO_ROOT, 'supabase', 'functions'))

    return found
  }

  const safeIsDirectory = (path: string) => {
    try {
      return statSync(path).isDirectory()
    } catch {
      return false
    }
  }

  const isRuntime = (file: string) => !/\.test\.tsx?$/.test(file) && !file.startsWith('src/test/')

  it('declares every schema in src/state/schemas.ts and nowhere else', () => {
    const offenders = sources()
      .filter(isRuntime)
      .filter((file) => file !== 'src/state/schemas.ts')
      .filter((file) => /z\.(strict)?[Oo]bject\(|z\.discriminatedUnion\(|from 'zod'/.test(read(file)))

    // A second schema is a second contract. The edge function imports this
    // file; it does not restate it in Deno.
    expect(offenders).toEqual([])
  })

  it('imports nothing an edge function cannot resolve', () => {
    const module = read('src/state/schemas.ts')
    const imports = [...module.matchAll(/^import .*? from '(.+?)'$/gm)].map((match) => match[1])

    expect(imports).toEqual(['zod', '../data/database.types', './errors'])
    expect(module).not.toContain('react')
    expect(module).not.toContain('document.')
  })

  it('is a dependency of the app, not of the toolchain', () => {
    // zod ships to the browser and runs in the function. A devDependency here
    // would build locally and fail in production.
    const packageJson = JSON.parse(read('package.json')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }

    expect(packageJson.dependencies.zod).toBeDefined()
    expect(packageJson.devDependencies.zod).toBeUndefined()
  })
})

describe('the vocabularies come from the generated enums, not from here', () => {
  it('accepts every section type the database has, and no other', () => {
    const sections: GenerationOutput['sections'][number]['section_type'][] = [
      'warmup',
      'mobility',
      'primary_lift',
      'accessory',
      'skill_power',
      'carries',
      'core',
      'stability_balance',
      'conditioning',
      'cooldown',
    ]

    for (const section_type of sections) {
      expect(generationOutputSchema.safeParse(withSection(section_type)).success).toBe(true)
    }

    expect(generationOutputSchema.safeParse(withSection('finisher')).success).toBe(false)
  })

  function withSection(section_type: string) {
    const workout = output()
    const sections = workout.sections as Record<string, unknown>[]

    return { ...workout, sections: [{ ...sections[0], section_type }] }
  }
})
