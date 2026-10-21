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

import { Constants, type Tables } from '../data/database.types'
import { ErrorCode, isErr, isOk } from './errors'
import { isLadderScheme } from './ladder'
import {
  makeLadderTimingBlock,
  makeSessionAcceptance,
  makeStructureSpectrumWorkout,
  makeWorkoutBlock,
} from '../test/factories'
import {
  LADDER_TIMING_REP_SCHEMES,
  blockResultRowSchema,
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

describe('overview and section_notes stay required and nullable (REQ-010)', () => {
  const sectionOf = (payload: Record<string, unknown>) =>
    (payload.sections as Record<string, unknown>[])[0]

  it('parses the null introductions prompt 5.2.0 asks for', () => {
    expect(generationOutputSchema.safeParse(output()).success).toBe(true)
  })

  it('still parses a legacy overview and section note, unchanged', () => {
    const legacy = output()
    legacy.overview = 'Squat-led session with unilateral accessory work.'
    sectionOf(legacy).section_notes = 'Build to a heavy set of five.'

    const parsed = generationOutputSchema.safeParse(legacy)
    expect(parsed.success && parsed.data).toEqual(legacy)
  })

  it('refuses a response that omits either key', () => {
    const noOverview = output()
    delete noOverview.overview
    const noNotes = output()
    delete sectionOf(noNotes).section_notes

    const issues = (payload: Record<string, unknown>) => {
      const parsed = generationOutputSchema.safeParse(payload)
      return parsed.success ? null : schemaIssues(parsed.error).map((issue) => issue.path)
    }
    expect(issues(noOverview)).toContain('overview')
    expect(issues(noNotes)).toContain('sections[0].section_notes')
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

describe('ladder timing is explicit, variable and additive (REQ-018, TASK-038)', () => {
  const issuesOf = (candidate: unknown) => {
    const parsed = workoutBlockSchema.safeParse(candidate)
    return parsed.success ? [] : schemaIssues(parsed.error)
  }

  describe('valid: every mode, with variable round count and interval length', () => {
    it.each([
      ['scheduled_starts', { rounds: 2, intervalSeconds: 45 }],
      ['scheduled_starts', { rounds: 7, intervalSeconds: 150 }],
      ['scheduled_starts', { rounds: 10, intervalSeconds: 240 }],
      ['for_time', { rounds: 3 }],
      ['for_time', { rounds: 9 }],
      ['capped_window', { rounds: 4, capSeconds: 60 }],
      ['capped_window', { rounds: 6, capSeconds: 200 }],
    ] as const)('%s %o round-trips unchanged', (mode, shape) => {
      const fixture = makeLadderTimingBlock(mode, shape)
      const parsed = workoutBlockSchema.safeParse(fixture)

      expect(parsed.success ? null : schemaIssues(parsed.error)).toBeNull()
      expect(parsed.success && parsed.data).toEqual(fixture)
    })

    it('accepts a capped window inside an AMRAP and scheduled starts inside For Time', () => {
      expect(issuesOf(makeLadderTimingBlock('capped_window', {}, { structure_type: 'amrap' }))).toEqual([])
      expect(
        issuesOf(makeLadderTimingBlock('scheduled_starts', {}, { structure_type: 'for_time' })),
      ).toEqual([])
    })

    it('accepts a scheduled block without its own timer_seconds only where the structure allows it', () => {
      // emom/for_time still need a clock (check 6); the timing does not replace it.
      expect(issuesOf(makeLadderTimingBlock('scheduled_starts', {}, { timer_seconds: null }))).toContainEqual({
        path: 'timer_seconds',
        message: 'emom, amrap and for_time blocks require timer_seconds',
      })
    })
  })

  describe('legacy: payloads written before REQ-018', () => {
    it('parses a block without the key and does not add one', () => {
      const legacy = makeWorkoutBlock()
      const parsed = workoutBlockSchema.safeParse(legacy)

      expect(parsed.success && parsed.data).toEqual(legacy)
      expect(parsed.success && 'ladder_timing' in parsed.data).toBe(false)
    })

    it('parses an explicit null as "no explicit timing"', () => {
      expect(issuesOf(makeWorkoutBlock({ ladder_timing: null }))).toEqual([])
    })

    it('still parses the existing ladder shapes with no timing', () => {
      const parsed = generationOutputSchema.safeParse(everyPrescriptionShape)
      expect(parsed.success).toBe(true)
      expect(makeStructureSpectrumWorkout()).toEqual(
        generationOutputSchema.parse(makeStructureSpectrumWorkout()),
      )
    })
  })

  describe('invalid: malformed timing objects', () => {
    const scheduled = { mode: 'scheduled_starts', rounds: 4, interval_seconds: 120, cap_seconds: null }

    it.each([
      ['an unknown mode', { ...scheduled, mode: 'every_minute' }],
      ['scheduled_starts without an interval', { ...scheduled, interval_seconds: null }],
      ['scheduled_starts with a cap', { ...scheduled, cap_seconds: 90 }],
      ['for_time with an interval', { mode: 'for_time', rounds: 4, interval_seconds: 120, cap_seconds: null }],
      ['for_time with a cap', { mode: 'for_time', rounds: 4, interval_seconds: null, cap_seconds: 90 }],
      ['capped_window without a cap', { mode: 'capped_window', rounds: 4, interval_seconds: null, cap_seconds: null }],
      ['capped_window with an interval', { mode: 'capped_window', rounds: 4, interval_seconds: 60, cap_seconds: 90 }],
      ['a zero interval', { ...scheduled, interval_seconds: 0 }],
      ['a fractional interval', { ...scheduled, interval_seconds: 90.5 }],
      ['one round', { ...scheduled, rounds: 1 }],
      ['a missing field', { mode: 'for_time', rounds: 4, interval_seconds: null }],
      ['an unknown key', { ...scheduled, rest_seconds: 30 }],
      ['a string', 'every 3 minutes for 5 rounds'],
    ])('rejects %s', (_, timing) => {
      expect(issuesOf({ ...makeLadderTimingBlock('scheduled_starts'), ladder_timing: timing })).not.toEqual([])
    })
  })

  describe('invalid: timing inconsistent with the block it describes', () => {
    it('rejects a timing on a rep scheme that is not a ladder', () => {
      expect(issuesOf(makeLadderTimingBlock('for_time', {}, { rep_scheme: 'n_plus_one' }))).toContainEqual({
        path: 'ladder_timing',
        message: "ladder_timing requires a ladder rep_scheme, not 'n_plus_one'",
      })
    })

    it.each([
      ['scheduled_starts', 'amrap'],
      ['scheduled_starts', 'circuit'],
      ['for_time', 'emom'],
      ['for_time', 'amrap'],
      ['capped_window', 'emom'],
      ['capped_window', 'standard'],
    ] as const)('rejects %s inside a %s block', (mode, structure) => {
      expect(
        issuesOf(makeLadderTimingBlock(mode, {}, { structure_type: structure, rounds: 4 })),
      ).toContainEqual({
        path: 'ladder_timing.mode',
        message: `${mode} cannot run inside a ${structure} block`,
      })
    })

    it('rejects a timing with no sequence member to give it rungs', () => {
      const fixture = makeLadderTimingBlock('for_time')
      expect(issuesOf({ ...fixture, exercises: [fixture.exercises[1]] })).toContainEqual({
        path: 'ladder_timing',
        message: 'ladder_timing requires a member with a target_sequence',
      })
    })

    it('rejects a round count the sequence does not have, rather than inferring either', () => {
      const fixture = makeLadderTimingBlock('for_time', { rounds: 5 })
      expect(issuesOf({ ...fixture, ladder_timing: { ...fixture.ladder_timing!, rounds: 6 } })).toContainEqual({
        path: 'exercises[0].target_sequence',
        message: 'target_sequence has 5 rungs but ladder_timing.rounds is 6',
      })
    })

    it('rejects block rounds that disagree with the timing', () => {
      expect(issuesOf(makeLadderTimingBlock('for_time', { rounds: 3 }, { rounds: 4 }))).toContainEqual({
        path: 'rounds',
        message: 'rounds must be null or equal ladder_timing.rounds (3)',
      })
      expect(issuesOf(makeLadderTimingBlock('for_time', { rounds: 3 }, { rounds: 3 }))).toEqual([])
    })

    it('rejects a scheduled clock that is not rounds × interval', () => {
      expect(
        issuesOf(makeLadderTimingBlock('scheduled_starts', { rounds: 6, intervalSeconds: 90 }, { timer_seconds: 600 })),
      ).toContainEqual({
        path: 'timer_seconds',
        message: 'timer_seconds must equal rounds × interval_seconds (540) for scheduled_starts',
      })
    })

    it('rejects separate round rest on a scheduled ladder', () => {
      expect(issuesOf(makeLadderTimingBlock('scheduled_starts', {}, { round_rest_seconds: 30 }))).toContainEqual({
        path: 'round_rest_seconds',
        message: 'scheduled_starts rest is the interval remainder; round_rest_seconds must be null',
      })
    })

    it('rejects a window cap longer than the block clock', () => {
      expect(issuesOf(makeLadderTimingBlock('capped_window', { capSeconds: 400 }, { timer_seconds: 300 }))).toContainEqual({
        path: 'ladder_timing.cap_seconds',
        message: 'cap_seconds cannot exceed the block timer_seconds',
      })
    })
  })

  it('names the same ladder schemes the renderer does', () => {
    for (const scheme of Constants.public.Enums.rep_scheme) {
      expect((LADDER_TIMING_REP_SCHEMES as readonly string[]).includes(scheme), scheme).toBe(
        isLadderScheme(scheme),
      )
    }
  })

  it('hardcodes no illustrative five rounds or three minutes', () => {
    const source = read('src/state/schemas.ts')
    // Code only: the comments are allowed to name the illustration they refuse.
    const code = source
      .slice(source.indexOf('// Ladder timing'), source.indexOf('export const workoutSectionSchema'))
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\/\*\*|\*)/.test(line))
      .join('\n')
    expect(code).toContain('ladder_timing')
    expect(code).not.toMatch(/\b(5|180)\b/)
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
    goal: 'strength',
    date: '2026-09-27',
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
      acceptance: makeSessionAcceptance({
        workout: generationOutputSchema.parse(everyPrescriptionShape),
      }),
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

  it('accepts an optional boolean retry restriction but no provider diagnostics', () => {
    const body = {
      code: ErrorCode.GENERATION_MODEL_ERROR,
      message: 'Generation is unavailable right now.',
      requestId: 'req_lxyz123_a1b2c3',
      failure: 'generation.upstream',
    }
    expect(errorResponseSchema.safeParse(body).success).toBe(true)
    expect(errorResponseSchema.safeParse({ ...body, retryable: false }).success).toBe(true)
    expect(errorResponseSchema.safeParse({ ...body, retryable: 'false' }).success).toBe(false)
    expect(errorResponseSchema.safeParse({ ...body, provider: { reason: 'schema_complexity' } }).success).toBe(false)
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
        acceptance: {
          ...makeSessionAcceptance(),
          workout: output(block({ structure_type: 'emom' })),
        },
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

  it('reads a block result with no effort, and range-checks one that is present', () => {
    // `block_results_perceived_effort_range` admits null: effort is optional
    // feedback (E04), and a historical row that carries one stays readable.
    const blockResult = {
      id: '90000001-0000-4000-8000-000000000000',
      block_id: '70000001-0000-4000-8000-000000000000',
      elapsed_seconds: null,
      completed_under_cap: null,
      rounds_completed: 0,
      partial_round_reps: null,
      minutes_completed: null,
      highest_rung: null,
      perceived_effort: null,
      notes: null,
      created_at: '2026-09-24T09:30:00+00:00',
    }

    const parsed = blockResultRowSchema.safeParse(blockResult)
    expect(parsed.success && parsed.data).toMatchObject({
      rounds_completed: 0,
      perceived_effort: null,
    })
    expect(
      blockResultRowSchema.safeParse({ ...blockResult, perceived_effort: 7 }).success,
    ).toBe(true)
    for (const outOfRange of [0, 11, 6.5]) {
      expect(
        blockResultRowSchema.safeParse({ ...blockResult, perceived_effort: outOfRange }).success,
      ).toBe(false)
    }
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

    expect(imports).toEqual(['zod', '../data/database.types.ts', './errors.ts'])
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
