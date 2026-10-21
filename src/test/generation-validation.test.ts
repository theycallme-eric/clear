import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import {
  GenerationFailure,
  MAX_ATTEMPTS,
  createComposer,
  parseCompletion,
} from '../../supabase/functions/_shared/claude.ts'
import {
  resolveEffectiveRequest,
  type PromptInput,
} from '../../supabase/functions/_shared/prompt.ts'
import {
  DURATION_CHECK_OWNER,
  HARD_CHECKS,
  LADDER_TIMING_GENERATION_ACTIVE,
  SoftCheck,
  VALIDATOR_CHECKS,
  checkReferences,
  observeQuality,
  qualityFields,
  validateComposition,
  type QualityRecord,
} from '../../supabase/functions/_shared/validate.ts'
import { createLogger, type LogLevel, type LogSink } from '../state/logger'
import { ErrorCode } from '../state/errors'
import { CONTRACT_VERSION, generationOutputSchema, type GenerationOutput } from '../state/schemas'
import { buildTrainingHistory } from '../../supabase/functions/_shared/training-history.ts'
import { TODAY, TRAINING_ANCHORS, promptInput, sectionFixture } from './generation-prompt-fixtures'
import {
  INTRODUCTION_PROSE,
  NULL_PROSE_RESPONSE,
  VALID_RESPONSE,
  claudeResponse,
} from './generation-response-fixtures'

// GEN-02c, the validation half. Three questions, and they are not the same
// question asked three ways:
//
//   1. Does every hard check correspond to something the database would refuse?
//      `HARD_CHECKS` claims it does, and this file reads the claim back out of
//      `supabase/migrations/` and out of GENERATION_CONTRACT §6's own table. A
//      check nobody can point at a constraint for, or a constraint renamed
//      under a check, fails here rather than at somebody's INSERT.
//   2. Can Claude reference an exercise or a piece of equipment it was never
//      offered? Every test below that answers "no" does it by handing the
//      validator a workout that parsed perfectly — the schema is not the thing
//      that catches these, which is the entire reason this module exists.
//   3. Can a soft observation reject anything? The strongest form of that
//      assertion is a workout that is outside on all four and still validates,
//      so that is the one written.

const repoRoot = resolve(import.meta.dirname, '../..')
const read = (relativePath: string) => readFileSync(resolve(repoRoot, relativePath), 'utf-8')

const CONTRACT = 'docs/specs/generation/GENERATION_CONTRACT.md'
const MIGRATION = 'supabase/migrations/20260921000003_workout_domain.sql'

/** A parsed contract-4.1.0 workout, fresh each time so a test may mutate it. */
function composed(): GenerationOutput {
  const parsed = parseCompletion(VALID_RESPONSE)
  if (!parsed.ok) throw new Error('the valid fixture no longer parses')

  return structuredClone(parsed.value)
}

const INPUT = promptInput()

function collectLogs() {
  const lines: { level: LogLevel; line: string }[] = []
  const sink: LogSink = { write: (level, line) => void lines.push({ level, line }) }

  return { logger: createLogger({ scope: 'generate-workout', sink }), lines }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. The correspondence
// ─────────────────────────────────────────────────────────────────────────────

/** The migration without its prose, single-spaced — prose names dropped columns. */
const migration = read(MIGRATION)
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

/** Everything between `create table public.<name> (` and the closing `);`. */
function tableBody(table: string): string {
  const start = migration.search(
    new RegExp(`create table if not exists public\\.${table}\\s*\\(`, 'i'),
  )
  expect(start, `${table} is not created`).toBeGreaterThan(-1)

  const rest = migration.slice(start)
  const end = rest.indexOf('\n);')
  expect(end, `${table} has no terminator`).toBeGreaterThan(-1)

  return rest.slice(rest.indexOf('(') + 1, end).replace(/\s+/g, ' ')
}

/** §6's hard table, as rows of `[number, rule]`, with markdown taken back off. */
function specHardChecks(): { number: number; rule: string }[] {
  const section = read(CONTRACT).split('### Hard')[1]?.split('### Soft')[0]
  if (!section) throw new Error(`${CONTRACT} no longer has a hard-check table`)

  return [...section.matchAll(/^\|\s*(\d+)\s*\|\s*(.+?)\s*\|$/gm)].map((row) => ({
    number: Number(row[1]),
    rule: row[2].replace(/\*\*/g, '').replace(/`/g, '').replace(/\s+/g, ' ').trim(),
  }))
}

describe('every hard check maps to an enforced database constraint', () => {
  it('names at least one constraint per check, and none of them is empty', () => {
    for (const check of HARD_CHECKS) {
      expect(check.constraints.length, `check ${check.number} names no constraint`).toBeGreaterThan(
        0,
      )
      expect(check.note.trim()).not.toBe('')
    }
  })

  it.each(HARD_CHECKS)('check $number is declared in the migration', (check) => {
    for (const constraint of check.constraints) {
      expect(
        tableBody(constraint.table),
        `${constraint.table} does not declare: ${constraint.declaration}`,
      ).toContain(constraint.declaration)
    }
  })

  it('is GENERATION_CONTRACT §6’s own list, in §6’s own words', () => {
    const spec = specHardChecks()

    // Eight rows in the spec, seven here: the eighth is duration plausibility,
    // which is GEN-06's and has no constraint to correspond to. It is named
    // rather than silently dropped.
    expect(spec.map((row) => row.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(HARD_CHECKS.map((check) => check.number)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(spec[7].rule).toContain('Computed duration within tolerance')
    expect(DURATION_CHECK_OWNER).toBe('GEN-06')

    for (const check of HARD_CHECKS) {
      const row = spec.find((entry) => entry.number === check.number)
      expect(row?.rule).toBe(check.rule)
    }
  })

  it('runs checks 1–3 here and leaves 4–7 to the schema that already ran', () => {
    expect(VALIDATOR_CHECKS.map((check) => check.number)).toEqual([1, 2, 3])
    expect(
      HARD_CHECKS.filter((check) => check.gate === 'schema').map((check) => check.number),
    ).toEqual([4, 5, 6, 7])
  })

  it('calls the two candidate-set checks stricter than their constraints, not mirrors', () => {
    const stricter = HARD_CHECKS.filter((check) => check.correspondence === 'stricter')

    // A foreign key cannot know which forty rows this request retrieved, and an
    // enum cannot know which sections this profile enabled. Saying "mirrors"
    // there would be the table telling a lie about its own strength.
    expect(stricter.map((check) => check.number)).toEqual([1, 2, 3])
  })
})

describe('the checks the schema gates, gated', () => {
  /** A workout with one field broken, as an unparsed object. */
  const broken = (mutate: (workout: GenerationOutput) => void): unknown => {
    const workout = composed()
    mutate(workout)
    return workout
  }

  const firstExercise = (workout: GenerationOutput) => workout.sections[0].blocks[0].exercises[0]

  it('check 4 — a target whose fields disagree with its kind', () => {
    const parsed = generationOutputSchema.safeParse(
      broken((workout) => {
        const exercise = firstExercise(workout) as Record<string, unknown>
        exercise.target_value = null
        exercise.target_min = 8
        exercise.target_max = 12
      }),
    )

    expect(parsed.success).toBe(false)
  })

  it('check 5 — a distance with no unit', () => {
    const parsed = generationOutputSchema.safeParse(
      broken((workout) => {
        const exercise = firstExercise(workout) as Record<string, unknown>
        exercise.modality = 'distance'
        exercise.distance_unit = null
      }),
    )

    expect(parsed.success).toBe(false)
  })

  it('check 6 — a timed block with no clock, and a circuit with no rounds', () => {
    const noClock = generationOutputSchema.safeParse(
      broken((workout) => {
        const block = workout.sections[0].blocks[0] as Record<string, unknown>
        block.structure_type = 'amrap'
        block.timer_seconds = null
      }),
    )
    const noRounds = generationOutputSchema.safeParse(
      broken((workout) => {
        const block = workout.sections[0].blocks[0] as Record<string, unknown>
        block.structure_type = 'circuit'
        block.rounds = null
      }),
    )

    expect(noClock.success).toBe(false)
    expect(noRounds.success).toBe(false)
  })

  it('check 7 — a load type that needs a value and has none', () => {
    const parsed = generationOutputSchema.safeParse(
      broken((workout) => {
        const exercise = firstExercise(workout) as Record<string, unknown>
        exercise.load_type = 'percent_1rm'
        exercise.load_value = null
      }),
    )

    expect(parsed.success).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Checks 1–3 — the candidate boundary
// ─────────────────────────────────────────────────────────────────────────────

describe('a generated timed protocol must execute its declared clock', () => {
  it.each(['emom', 'amrap', 'for_time'] as const)('rejects %s with a disabled clock despite valid storage shape', (structure) => {
    const workout = composed()
    const block = workout.sections[2].blocks[0]
    block.structure_type = structure
    block.timer_seconds = 600
    block.timer_type = 'none'
    expect(generationOutputSchema.safeParse(workout).success).toBe(true)

    const result = validateComposition(workout, INPUT)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(GenerationFailure.MALFORMED)
    expect(result.error.detail).toContain('sections[2].blocks[0].timer_type')
  })

  it.each(['emom', 'amrap', 'for_time'] as const)('accepts %s with an executable clock', (structure) => {
    const workout = composed()
    const block = workout.sections[2].blocks[0]
    block.structure_type = structure
    block.timer_seconds = 600
    block.timer_type = structure === 'emom' ? 'per_minute' : 'countdown'
    expect(validateComposition(workout, INPUT).ok).toBe(true)
  })
})

describe('generated superset rest must use the field execution honors', () => {
  it('rejects the live field-shape defect without relocating rest or changing the workout', () => {
    const workout = composed()
    const block = workout.sections[2].blocks[0]
    block.rounds = null
    block.round_rest_seconds = null
    block.block_notes = 'Shared rest after the pair.'
    block.exercises.forEach((exercise) => { exercise.sets = 3; exercise.rest_seconds = 0 })
    block.exercises[1].rest_seconds = 90
    const before = structuredClone(workout)
    expect(generationOutputSchema.safeParse(workout).success).toBe(true)

    const { logger, lines } = collectLogs()
    const result = validateComposition(workout, INPUT, { logger, requestId: 'req_superset_rest' })
    expect(result).toEqual({
      ok: false,
      error: {
        code: GenerationFailure.MALFORMED,
        detail: 'sections[2].blocks[0].exercises[1].rest_seconds: ' +
          'superset member rest is not executed; move shared rest to ' +
          'sections[2].blocks[0].round_rest_seconds and set member rest_seconds to 0 or null',
      },
    })
    expect(workout).toEqual(before)
    const rejection = JSON.stringify(result)
    for (const value of [workout.title, workout.overview, block.block_notes, block.exercises[1].exercise_id]) {
      expect(rejection).not.toContain(value)
      expect(lines.map(({ line }) => line).join('\n')).not.toContain(value)
    }
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0].line)).toMatchObject({
      level: 'warn', msg: 'composition rejected', checks: [6], violations: 1,
    })
  })

  it.each([0, 1])('rejects positive rest on member %s even with valid block shared rest', (index) => {
    const workout = composed()
    const block = workout.sections[2].blocks[0]
    block.round_rest_seconds = 90
    block.exercises[index].rest_seconds = 1
    const result = validateComposition(workout, INPUT)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(GenerationFailure.MALFORMED)
    expect(result.error.detail).toContain(`sections[2].blocks[0].exercises[${index}].rest_seconds`)
  })

  it.each([null, 0, 90])('allows block shared rest %s with zero/null members', (rest) => {
    const workout = composed()
    const block = workout.sections[2].blocks[0]
    block.rounds = null
    block.round_rest_seconds = rest
    block.exercises[0].rest_seconds = 0
    block.exercises[1].rest_seconds = null
    const before = structuredClone(workout)
    expect(generationOutputSchema.safeParse(workout).success).toBe(true)
    expect(validateComposition(workout, INPUT).ok).toBe(true)
    expect(workout).toEqual(before)
  })

  it.each(['standard', 'circuit', 'emom', 'amrap', 'for_time'] as const)(
    'does not apply the superset-only member-rest rule to %s', (structure) => {
      const workout = composed()
      const block = workout.sections[2].blocks[0]
      block.structure_type = structure
      block.rounds = structure === 'circuit' ? 3 : null
      block.round_rest_seconds = null
      block.timer_type = structure === 'emom' ? 'per_minute' :
        structure === 'amrap' || structure === 'for_time' ? 'countdown' : 'none'
      block.timer_seconds = ['emom', 'amrap', 'for_time'].includes(structure) ? 600 : null
      block.exercises[1].rest_seconds = 90
      expect(generationOutputSchema.safeParse(workout).success).toBe(true)
      expect(validateComposition(workout, INPUT).ok).toBe(true)
    },
  )
})

describe('ladder timing at the edge boundary (REQ-018, TASK-038)', () => {
  // The edge parses with the same `generationOutputSchema` the client does, so
  // shape and consistency are one answer in both places. What only the edge
  // adds is the generation gate: valid timing is still refused in *generated*
  // output until persistence and the integrated contract can carry it.

  /** sections[2].blocks[0] reshaped into a ladder, keeping its offered exercises. */
  function ladderWorkout(timing: Record<string, unknown> | null | undefined, rounds = 4): unknown {
    const workout = composed() as unknown as {
      sections: { blocks: Record<string, unknown>[] }[]
    }
    const block = workout.sections[2].blocks[0]
    const exercises = block.exercises as Record<string, unknown>[]
    const scheduled = timing?.mode === 'scheduled_starts'
    Object.assign(block, {
      structure_type: scheduled ? 'emom' : 'for_time',
      rounds: null,
      timer_type: scheduled ? 'interval' : 'countdown',
      timer_seconds: scheduled ? rounds * Number(timing.interval_seconds) : timing?.mode === 'capped_window' ? Number(timing.cap_seconds) : 600,
      round_rest_seconds: null,
      rep_scheme: 'ladder_fixed_interval',
    })
    exercises.forEach((exercise) => Object.assign(exercise, { sets: null, rest_seconds: null }))
    Object.assign(exercises[0], {
      target_kind: 'sequence',
      target_value: null,
      target_min: null,
      target_max: null,
      target_sequence: Array.from({ length: rounds }, (_, index) => index + 1),
    })
    if (timing !== undefined) block.ladder_timing = timing
    return workout
  }

  const completion = (payload: unknown) => parseCompletion(JSON.stringify(payload))

  const VALID = [
    ['scheduled_starts', 3, { mode: 'scheduled_starts', rounds: 3, interval_seconds: 150, cap_seconds: null }],
    ['scheduled_starts', 8, { mode: 'scheduled_starts', rounds: 8, interval_seconds: 45, cap_seconds: null }],
    ['for_time', 6, { mode: 'for_time', rounds: 6, interval_seconds: null, cap_seconds: null }],
    ['capped_window', 4, { mode: 'capped_window', rounds: 4, interval_seconds: null, cap_seconds: 120 }],
  ] as const

  it.each(VALID)('client and edge both accept a %s timing with %i rounds', (_, rounds, timing) => {
    const payload = ladderWorkout(timing, rounds)
    expect(generationOutputSchema.safeParse(payload).success).toBe(true)
    expect(completion(payload).ok).toBe(true)
  })

  it.each(VALID)('the generation gate still refuses a %s timing (%i rounds) until TASK-032', (_, rounds, timing) => {
    const parsed = completion(ladderWorkout(timing, rounds))
    if (!parsed.ok) throw new Error('the valid ladder fixture no longer parses')

    expect(LADDER_TIMING_GENERATION_ACTIVE).toBe(false)
    expect(validateComposition(parsed.value, INPUT)).toEqual({
      ok: false,
      error: {
        code: GenerationFailure.MALFORMED,
        detail: 'sections[2].blocks[0].ladder_timing: ' +
          'ladder_timing is not yet supported in generated workouts; omit it',
      },
    })
  })

  it('legacy ladder with timing absent validates exactly as before', () => {
    const parsed = completion(ladderWorkout(undefined))
    if (!parsed.ok) throw new Error(parsed.error.detail ?? 'the legacy ladder no longer parses')

    expect(validateComposition(parsed.value, INPUT).ok).toBe(true)
    expect('ladder_timing' in parsed.value.sections[2].blocks[0]).toBe(false)
  })

  it('refuses an explicit null in generated output because old strict clients reject that new key', () => {
    const parsed = completion(ladderWorkout(null))
    if (!parsed.ok) throw new Error('the additive schema must still accept an explicit null')
    expect(validateComposition(parsed.value, INPUT)).toEqual({
      ok: false,
      error: {
        code: GenerationFailure.MALFORMED,
        detail: 'sections[2].blocks[0].ladder_timing: ' +
          'ladder_timing is not yet supported in generated workouts; omit it',
      },
    })
  })

  it('keeps accepted generated blocks inside the pre-TASK038 strict 4.1.0 wire key space', () => {
    // An independent closed-key contract: deriving these keys from the new
    // schema would silently bless the very compatibility drift being tested.
    const oldBlockKeys = new Set([
      'structure_type', 'rounds', 'timer_type', 'timer_seconds',
      'round_rest_seconds', 'rep_scheme', 'block_notes', 'exercises',
    ])
    expect(CONTRACT_VERSION).toBe('4.1.0')
    for (const payload of [composed(), ladderWorkout(undefined), ladderWorkout(null)]) {
      const parsed = completion(payload)
      if (!parsed.ok) throw new Error('wire compatibility fixture no longer parses')
      const unknownKeys = parsed.value.sections.flatMap((section) => section.blocks.flatMap((block) =>
        Object.keys(block).filter((key) => !oldBlockKeys.has(key)),
      ))
      const validated = validateComposition(parsed.value, INPUT)
      if (validated.ok) expect(unknownKeys).toEqual([])
      else expect(unknownKeys).toContain('ladder_timing')
    }
  })

  it.each([
    ['a mode the contract does not name', { mode: 'every_minute', rounds: 4, interval_seconds: 60, cap_seconds: null }],
    ['scheduled starts with no interval', { mode: 'scheduled_starts', rounds: 4, interval_seconds: null, cap_seconds: null }],
    ['free-paced For Time with a cap', { mode: 'for_time', rounds: 4, interval_seconds: null, cap_seconds: 90 }],
    ['rounds the sequence does not have', { mode: 'for_time', rounds: 5, interval_seconds: null, cap_seconds: null }],
  ])('client and edge both reject %s', (_, timing) => {
    const payload = ladderWorkout(timing)
    expect(generationOutputSchema.safeParse(payload).success).toBe(false)

    const parsed = completion(payload)
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.error.code).toBe(GenerationFailure.MALFORMED)
    expect(parsed.error.detail).toContain('sections[2].blocks[0]')
  })

  it('a scheduled clock that disagrees with rounds × interval is refused at both', () => {
    const payload = ladderWorkout({ mode: 'scheduled_starts', rounds: 4, interval_seconds: 90, cap_seconds: null }) as {
      sections: { blocks: Record<string, unknown>[] }[]
    }
    payload.sections[2].blocks[0].timer_seconds = 400
    expect(generationOutputSchema.safeParse(payload).success).toBe(false)
    const parsed = completion(payload)
    expect(!parsed.ok && parsed.error.detail).toContain('sections[2].blocks[0].timer_seconds')
  })

  it.each([60, 360])('rejects a capped window with a different block clock (%i seconds) at both boundaries', (seconds) => {
    const payload = ladderWorkout({ mode: 'capped_window', rounds: 4, interval_seconds: null, cap_seconds: 120 }) as {
      sections: { blocks: Record<string, unknown>[] }[]
    }
    payload.sections[2].blocks[0].timer_seconds = seconds
    expect(generationOutputSchema.safeParse(payload).success).toBe(false)
    const parsed = completion(payload)
    expect(!parsed.ok && parsed.error.detail).toContain('sections[2].blocks[0].ladder_timing.cap_seconds')
  })

  it('generation instructions do not ask for the new field', () => {
    expect(read('supabase/functions/_shared/prompt.ts')).not.toContain('ladder_timing')
  })

  it('the contract states the old/new compatibility matrix', () => {
    const contract = read(CONTRACT)
    expect(contract).toContain('### 5.1 Ladder timing')
    for (const mode of ['scheduled_starts', 'for_time', 'capped_window']) {
      expect(contract).toContain(`\`${mode}\``)
    }
    expect(contract).toMatch(/Old reader.*New payload/s)
  })
})

describe('an exercise outside the retrieved candidate set', () => {
  it('is accepted when it is in that section’s set', () => {
    const validated = validateComposition(composed(), INPUT)

    expect(validated.ok).toBe(true)
  })

  it('is rejected when the catalog has never heard of it', () => {
    const workout = composed()
    workout.sections[1].blocks[0].exercises[0].exercise_id = 'trap-bar-deadlift'

    const violations = checkReferences(workout, INPUT)

    expect(violations).toHaveLength(1)
    expect(violations[0].check).toBe(1)
    expect(violations[0].code).toBe(GenerationFailure.INVALID_REFERENCE)
    expect(violations[0].path).toBe('sections[1].blocks[0].exercises[0].exercise_id')
    expect(violations[0].message).toContain('trap-bar-deadlift')
    expect(violations[0].message).toContain('primary_lift')
  })

  it('is rejected when it is eligible for a different section — the strictness that is the point', () => {
    const workout = composed()
    // `deadlift` is a real candidate of this very request. It is not a warmup
    // one, and "in the library" would have let it through.
    workout.sections[0].blocks[0].exercises[0].exercise_id = 'deadlift'

    const violations = checkReferences(workout, INPUT)

    expect(violations.map((violation) => violation.check)).toEqual([1])
    expect(violations[0].message).toContain('warmup candidate set')
  })

  it('is rejected explicitly rather than left to the prompt to discourage', () => {
    const workout = composed()
    workout.sections[1].blocks[0].exercises[0].exercise_id = 'trap-bar-deadlift'

    // The schema is perfectly happy with it: a non-blank string is a non-blank
    // string. Nothing but this module stands between it and a foreign key.
    expect(generationOutputSchema.safeParse(workout).success).toBe(true)
    expect(validateComposition(workout, INPUT).ok).toBe(false)
  })
})

describe('equipment outside that candidate’s usable set', () => {
  it('is rejected, and the message names what was usable', () => {
    const workout = composed()
    workout.sections[1].blocks[0].exercises[0].equipment = 'kettlebell'

    const violations = checkReferences(workout, INPUT)

    expect(violations).toHaveLength(1)
    expect(violations[0].check).toBe(2)
    expect(violations[0].path).toBe('sections[1].blocks[0].exercises[0].equipment')
    expect(violations[0].message).toContain('kettlebell')
    expect(violations[0].message).toContain('barbell')
  })

  it('is rejected even when the equipment exists elsewhere in the request', () => {
    const workout = composed()
    // `dumbbells` is usable for the accessory candidate in this same workout.
    // Usable there is not usable here, which is what per-candidate means.
    workout.sections[0].blocks[0].exercises[0].equipment = 'dumbbells'

    expect(checkReferences(workout, INPUT).map((violation) => violation.check)).toEqual([2])
  })
})

describe('a section the user did not enable', () => {
  it('is rejected once, as the section rather than as every exercise under it', () => {
    const workout = composed()
    workout.sections[2].section_type = 'carries'

    const violations = checkReferences(workout, INPUT)

    // Available sections may be omitted; inventing a disabled section remains
    // one hard fault, regardless of how many exercises it contains.
    expect(violations.map((violation) => violation.check)).toEqual([3])
    expect(violations[0].path).toBe('sections[2].section_type')
    expect(violations[0].message).toContain('carries')
  })

  it('reads the effective sections, which active recovery fixes for itself', () => {
    const recovery = promptInput({
      request: {
        ...INPUT.request,
        goal: 'active_recovery',
        effectiveSections: ['warmup', 'mobility', 'cooldown'],
      },
      sections: [sectionFixture('warmup', ['cat-cow', 'worlds-greatest-stretch'])],
    })

    const workout = composed()
    // Warmup survives; the primary lift and the accessory section do not exist
    // for this goal whatever the profile's toggles say (GEN-02a).
    const violations = checkReferences(workout, recovery)

    expect(violations.map((violation) => violation.check)).toEqual([3, 3])
    expect(violations.map((violation) => violation.path)).toEqual([
      'sections[1].section_type',
      'sections[2].section_type',
    ])
  })
})

describe('the rejection a retry is told about', () => {
  it('carries every violation’s path, and none of the payload', () => {
    const workout = composed()
    workout.sections[0].blocks[0].exercises[0].exercise_id = 'trap-bar-deadlift'
    workout.sections[1].blocks[0].exercises[0].equipment = 'kettlebell'

    const validated = validateComposition(workout, INPUT)

    expect(validated.ok).toBe(false)
    if (validated.ok) return

    expect(validated.error.code).toBe(GenerationFailure.INVALID_REFERENCE)
    expect(validated.error.detail).toContain('sections[0].blocks[0].exercises[0].exercise_id')
    expect(validated.error.detail).toContain('sections[1].blocks[0].exercises[0].equipment')
    // The model's own mistake read back to it as instruction is what the
    // addendum must not become: no title, no overview, no JSON.
    expect(validated.error.detail).not.toContain(workout.title)
    expect(validated.error.detail).not.toContain('{')
  })

  it('logs which checks failed and how many, never which exercises', () => {
    const { logger, lines } = collectLogs()
    const workout = composed()
    workout.sections[1].blocks[0].exercises[0].exercise_id = 'trap-bar-deadlift'

    validateComposition(workout, INPUT, { logger, requestId: 'req_abc123_def456' })

    const rejected = lines.find((entry) => entry.line.includes('composition rejected'))
    expect(rejected?.level).toBe('warn')
    expect(rejected?.line).toContain('"violations":1')
    expect(rejected?.line).not.toContain('trap-bar-deadlift')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. The soft record
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A workout composed to be outside on all four observations at once: a warmup
 * that prepares nothing the session does, a primary lift that is a fraction of
 * the session, three accessory movements sharing components, and an exercise
 * the history already saw.
 */
function noticeablyPoorWorkout(): GenerationOutput {
  const workout = composed()
  const accessory = workout.sections[2]
  const exercise = structuredClone(accessory.blocks[0].exercises[0])

  accessory.blocks[0].exercises = [
    { ...exercise, exercise_id: 'bulgarian-split-squat', equipment: 'dumbbells' },
    { ...exercise, exercise_id: 'walking-lunges', equipment: 'dumbbells' },
    { ...exercise, exercise_id: 'glute-bridge', equipment: 'bodyweight' },
  ]

  // This fixture retains its available sections to isolate coaching
  // observations; phase selection is composition judgment, not a count gate.
  return workout
}

const observationFor = (record: QualityRecord, check: SoftCheck) =>
  record.observations.find((observation) => observation.check === check)

describe('the soft record', () => {
  it('is §6’s four checks in §6’s order, then OVR-02’s two', () => {
    const record = observeQuality(composed(), INPUT)

    expect(record.observations.map((observation) => observation.check)).toEqual([
      SoftCheck.RATIOS,
      SoftCheck.WARMUP_COVERAGE,
      SoftCheck.VARIETY,
      SoftCheck.REPETITION,
      SoftCheck.NARRATED_LOAD,
      SoftCheck.DIRECTIVE_COMPLIANCE,
    ])
    expect(record.contractVersion).toBe(CONTRACT_VERSION)
  })

  it('never rejects, however far outside every one of them is', () => {
    const workout = noticeablyPoorWorkout()
    const validated = validateComposition(workout, INPUT)

    expect(validated.ok).toBe(true)
    if (!validated.ok) return

    const statuses = validated.value.quality.observations.map(
      (observation) => observation.status,
    )
    // The last two are OVR-02's, and this workout is poor rather than chatty:
    // it narrates no weight and was composed under no directive, so both are
    // honestly `within`. Ratios only record mix without retired fixed bands;
    // the remaining three composition observations are outside.
    expect(statuses).toEqual([
      'within',
      'outside',
      'outside',
      'outside',
      'within',
      'within',
    ])
    expect(validated.value.violations).toEqual([])
  })

  it('records section mix without fixed goal-share verdicts', () => {
    const record = observeQuality(composed(), INPUT)
    const ratios = observationFor(record, SoftCheck.RATIOS)

    // One primary exercise of five is recorded, not compared to a fixed band:
    // exercise counts do not prove the goal's time/dose or usefulness.
    expect(ratios?.summary).toContain('primary_lift')
    expect(ratios?.metrics.min).toBeUndefined()
    expect(ratios?.metrics.max).toBeUndefined()
    expect(ratios?.metrics.exercises).toBe(5)
    expect(ratios?.metrics.observed).toBe(0.2)
    expect(ratios?.status).toBe('within')
    expect(ratios?.summary).toContain('recorded without a band')
  })

  it('records a goal that states no share without inventing a band for it', () => {
    const recovery = promptInput({
      request: { ...INPUT.request, goal: 'active_recovery' },
    })
    const ratios = observationFor(observeQuality(composed(), recovery), SoftCheck.RATIOS)

    expect(ratios?.status).toBe('within')
    expect(ratios?.summary).toContain('no section share')
    expect(ratios?.metrics.min).toBeUndefined()
  })

  it('records warmup coverage in the catalog’s component vocabulary', () => {
    const coverage = observationFor(
      observeQuality(composed(), INPUT),
      SoftCheck.WARMUP_COVERAGE,
    )

    // The fixture's warmup is two mobility drills and the session squats: the
    // components do not meet, which is exactly the observation worth having.
    expect(coverage?.status).toBe('outside')
    expect(coverage?.detail).toContain('knee-flexion')
    expect(coverage?.metrics.coverage).toBe(0)
  })

  it('records variety as component overlap within a section', () => {
    const variety = observationFor(
      observeQuality(noticeablyPoorWorkout(), INPUT),
      SoftCheck.VARIETY,
    )

    expect(variety?.status).toBe('outside')
    expect(variety?.summary).toContain('accessory')
    expect(variety?.detail).toContain('accessory:single-leg-stance')
  })

  it('records repetition against recent history and within the workout', () => {
    const workout = composed()
    // The same candidate twice, in a session whose history already has it.
    workout.sections[2].blocks[0].exercises[1].exercise_id = 'back-squat'
    workout.sections[2].blocks[0].exercises[1].equipment = 'barbell'

    const repetition = observationFor(observeQuality(workout, INPUT), SoftCheck.REPETITION)

    expect(repetition?.status).toBe('outside')
    expect(repetition?.metrics.fromHistory).toBe(1)
    expect(repetition?.metrics.withinWorkout).toBe(1)
    expect(repetition?.detail).toContain('history:back-squat')
    expect(repetition?.detail).toContain('workout:back-squat')
  })

  it('is surfaced as one log line of statuses and counts', () => {
    const { logger, lines } = collectLogs()
    validateComposition(composed(), INPUT, { logger, requestId: 'req_abc123_def456' })

    const quality = lines.find((entry) => entry.line.includes('composition quality'))
    expect(quality?.level).toBe('info')
    for (const check of Object.values(SoftCheck)) expect(quality?.line).toContain(check)
    expect(quality?.line).not.toContain('back-squat')

    const fields = qualityFields(observeQuality(composed(), INPUT))
    expect(fields[SoftCheck.RATIOS]).toBe('within')
    expect(fields.noted).toBe(
      observeQuality(composed(), INPUT).observations.filter(
        (observation) => observation.status === 'outside',
      ).length,
    )
  })
})

/**
 * The valid fixture's main work under upper-body names. Each candidate keeps its
 * captured row — equipment included, so every hard check still passes — and
 * takes a press or a pull as its only pattern, which is the one fact Focus fit
 * reads.
 */
const UPPER_BODY_MAIN_WORK = {
  'back-squat': { exerciseId: 'bench-press', pattern: 'press' },
  'bulgarian-split-squat': { exerciseId: 'dumbbell-row', pattern: 'pull' },
  'glute-bridge': { exerciseId: 'push-up', pattern: 'press' },
} as const

/** A `lower_body` request whose composed main work only presses and pulls. */
function focusMismatch(): { workout: GenerationOutput; input: PromptInput } {
  const renamed = (exerciseId: string) =>
    Object.entries(UPPER_BODY_MAIN_WORK).find(([lower]) => lower === exerciseId)?.[1]

  const workout = composed()
  for (const section of workout.sections) {
    for (const block of section.blocks) {
      for (const exercise of block.exercises) {
        exercise.exercise_id = renamed(exercise.exercise_id)?.exerciseId ?? exercise.exercise_id
      }
    }
  }

  const input = promptInput({
    sections: INPUT.sections.map((section) => ({
      ...section,
      candidates: section.candidates.map((candidate) => {
        const upper = renamed(candidate.exerciseId)
        if (upper === undefined) return candidate

        return {
          ...candidate,
          exerciseId: upper.exerciseId,
          patterns: [upper.pattern],
          primaryPatterns: [upper.pattern],
        }
      }),
    })),
  })

  return { workout, input }
}

describe('Focus fit', () => {
  it('records one observation naming the Focus when the main work only presses and pulls', () => {
    const { workout, input } = focusMismatch()
    const record = observeQuality(workout, input)
    const focusFit = record.observations.filter(
      (observation) => observation.check === SoftCheck.FOCUS_FIT,
    )

    expect(focusFit).toHaveLength(1)
    expect(focusFit[0].status).toBe('outside')
    expect(focusFit[0].summary).toContain('lower_body')
    expect(focusFit[0].metrics).toEqual({ mainWork: 3, matching: 0 })
    expect(focusFit[0].detail).toEqual(['focus:lower_body', 'pattern:press', 'pattern:pull'])
    expect(qualityFields(record)[SoftCheck.FOCUS_FIT]).toBe('outside')
  })

  it('records nothing for a workout that matches its Focus', () => {
    const record = observeQuality(composed(), INPUT)

    expect(observationFor(record, SoftCheck.FOCUS_FIT)).toBeUndefined()
    expect(qualityFields(record)[SoftCheck.FOCUS_FIT]).toBe('within')
  })

  it('records nothing when the same main work is what the Focus asked for', () => {
    const { workout, input } = focusMismatch()
    const upper = { ...input, request: { ...input.request, focus: 'upper_body' as const } }

    expect(observationFor(observeQuality(workout, upper), SoftCheck.FOCUS_FIT)).toBeUndefined()
  })

  it('records nothing when one main-work exercise carries the Focus', () => {
    const { workout, input } = focusMismatch()
    const sections = input.sections.map((section) => ({
      ...section,
      candidates: section.candidates.map((candidate) =>
        candidate.exerciseId === 'bench-press'
          ? { ...candidate, patterns: ['squat' as const] }
          : candidate,
      ),
    }))

    expect(
      observationFor(observeQuality(workout, { ...input, sections }), SoftCheck.FOCUS_FIT),
    ).toBeUndefined()
  })

  it('records nothing when no Focus was requested', () => {
    const { workout, input } = focusMismatch()
    const unfocused = { ...input, request: { ...input.request, focus: null } }

    expect(observationFor(observeQuality(workout, unfocused), SoftCheck.FOCUS_FIT)).toBeUndefined()
  })

  it('never rejects: the mismatch validates with no violation', () => {
    const { workout, input } = focusMismatch()
    const validated = validateComposition(workout, input)

    expect(validated.ok).toBe(true)
    if (!validated.ok) return

    expect(validated.value.violations).toEqual([])
    expect(observationFor(validated.value.quality, SoftCheck.FOCUS_FIT)?.status).toBe('outside')
  })
})

describe('Claude’s duration estimate', () => {
  it('is recorded as a diagnostic and read by nothing (D5)', () => {
    const optimistic = composed()
    optimistic.estimated_duration_mins = 1
    const absurd = composed()
    absurd.estimated_duration_mins = 9_999

    const first = validateComposition(optimistic, INPUT)
    const second = validateComposition(absurd, INPUT)

    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    expect(first.value.quality.modelEstimateMins).toBe(1)
    expect(second.value.quality.modelEstimateMins).toBe(9_999)
    // Everything else about the two verdicts is identical: a number the model
    // was told the answer to decides nothing here, which is what D5 was.
    expect(first.value.quality.observations).toEqual(second.value.quality.observations)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. In the loop
// ─────────────────────────────────────────────────────────────────────────────

const API_KEY = 'sk-ant-api03-ThisIsNotARealKeyItIsAFixture'
const REQUEST_ID = 'req_abc123_def456'

/** A fetch that answers each call from the list, and records what it was sent. */
function stubFetch(bodies: readonly string[]) {
  const calls: { init: RequestInit }[] = []

  const send = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push({ init: init ?? {} })
    const body = bodies[Math.min(calls.length - 1, bodies.length - 1)]
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof globalThis.fetch

  return { send, calls }
}

/** The valid fixture with one exercise id swapped for one nobody offered. */
function unofferedResponse(): string {
  const workout = composed()
  workout.sections[1].blocks[0].exercises[0].exercise_id = 'trap-bar-deadlift'

  return JSON.stringify(workout)
}

const userMessage = (calls: readonly { init: RequestInit }[], index: number) =>
  (JSON.parse(String(calls[index].init.body)) as { messages: { content: string }[] }).messages[0]
    .content

describe('validation inside the composer’s one retry', () => {
  const validate = (workout: GenerationOutput, input: PromptInput) =>
    validateComposition(workout, input)

  it('returns the quality record beside the workout when it passes', async () => {
    const fetch = stubFetch([claudeResponse(VALID_RESPONSE)])

    const composition = await createComposer({
      apiKey: API_KEY,
      fetch: fetch.send,
      validate,
    }).compose(INPUT, REQUEST_ID)

    expect(composition.ok).toBe(true)
    if (!composition.ok) return

    expect(composition.value.attempts).toBe(1)
    expect(composition.value.validation?.quality.observations).toHaveLength(6)
  })

  it('does not spend the retry on a Focus mismatch', async () => {
    const { workout, input } = focusMismatch()
    const fetch = stubFetch([claudeResponse(JSON.stringify(workout))])

    const composition = await createComposer({
      apiKey: API_KEY,
      fetch: fetch.send,
      validate,
    }).compose(input, REQUEST_ID)

    expect(fetch.calls).toHaveLength(1)
    expect(composition.ok).toBe(true)
    if (!composition.ok) return

    expect(composition.value.attempts).toBe(1)
    expect(composition.value.retriedAfter).toBeNull()
    expect(
      composition.value.validation?.quality.observations.map((observation) => observation.check),
    ).toContain(SoftCheck.FOCUS_FIT)
  })

  it('costs one corrected retry, and the correction names the contract’s code', async () => {
    const fetch = stubFetch([claudeResponse(unofferedResponse()), claudeResponse(VALID_RESPONSE)])

    const composition = await createComposer({
      apiKey: API_KEY,
      fetch: fetch.send,
      validate,
    }).compose(INPUT, REQUEST_ID)

    expect(fetch.calls).toHaveLength(2)
    expect(composition.ok).toBe(true)
    if (!composition.ok) return

    expect(composition.value.attempts).toBe(2)
    expect(composition.value.retriedAfter?.code).toBe(GenerationFailure.INVALID_REFERENCE)

    const retry = userMessage(fetch.calls, 1)
    expect(retry).toContain('RETRY CORRECTION')
    expect(retry).toContain(GenerationFailure.INVALID_REFERENCE)
    expect(retry).toContain('sections[1].blocks[0].exercises[0].exercise_id')
  })

  it('twice is a typed failure carrying no workout at all', async () => {
    const fetch = stubFetch([claudeResponse(unofferedResponse())])

    const composition = await createComposer({
      apiKey: API_KEY,
      fetch: fetch.send,
      validate,
    }).compose(INPUT, REQUEST_ID)

    expect(fetch.calls).toHaveLength(MAX_ATTEMPTS)
    expect(composition.ok).toBe(false)
    if (composition.ok) return

    expect(composition.error.code).toBe(ErrorCode.GENERATION_FAILED)
    expect(composition.error.details).toMatchObject({
      generationCode: GenerationFailure.EXHAUSTED,
      failures: [GenerationFailure.INVALID_REFERENCE, GenerationFailure.INVALID_REFERENCE],
    })
    expect(JSON.stringify(composition.error)).not.toContain('Lower Body Strength')
  })

  it('without a validator says nobody checked rather than nothing was wrong', async () => {
    const fetch = stubFetch([claudeResponse(unofferedResponse())])

    const composition = await createComposer({ apiKey: API_KEY, fetch: fetch.send }).compose(
      INPUT,
      REQUEST_ID,
    )

    expect(composition.ok).toBe(true)
    if (!composition.ok) return

    expect(composition.value.validation).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. REQ-010 — introductions are requested as null and never cost a retry
// ─────────────────────────────────────────────────────────────────────────────

describe('introductory prose is accepted and never retried (REQ-010)', () => {
  const validate = (workout: GenerationOutput, input: PromptInput) =>
    validateComposition(workout, input)

  it('still requires both keys, and accepts null and a legacy string for each', () => {
    const asked = composed()
    asked.overview = null
    asked.sections.forEach((section) => (section.section_notes = null))
    expect(generationOutputSchema.safeParse(asked).success).toBe(true)

    const legacy = composed()
    expect(legacy.overview).toBe(INTRODUCTION_PROSE.overview)
    expect(generationOutputSchema.safeParse(legacy).success).toBe(true)

    const noOverview = composed() as unknown as Record<string, unknown>
    delete noOverview.overview
    expect(generationOutputSchema.safeParse(noOverview).success).toBe(false)

    const noNotes = composed() as unknown as { sections: Record<string, unknown>[] }
    delete noNotes.sections[0].section_notes
    expect(generationOutputSchema.safeParse(noNotes).success).toBe(false)
  })

  it('validates an otherwise valid response carrying introductions, with no retry', async () => {
    const fetch = stubFetch([claudeResponse(VALID_RESPONSE), claudeResponse(NULL_PROSE_RESPONSE)])

    const composition = await createComposer({
      apiKey: API_KEY,
      fetch: fetch.send,
      validate,
    }).compose(INPUT, REQUEST_ID)

    expect(fetch.calls).toHaveLength(1)
    expect(composition.ok).toBe(true)
    if (!composition.ok) return

    expect(composition.value.attempts).toBe(1)
    expect(composition.value.retriedAfter).toBeNull()
  })

  it('validates the null-prose response the prompt asks for, also with no retry', async () => {
    const fetch = stubFetch([claudeResponse(NULL_PROSE_RESPONSE)])

    const composition = await createComposer({
      apiKey: API_KEY,
      fetch: fetch.send,
      validate,
    }).compose(INPUT, REQUEST_ID)

    expect(fetch.calls).toHaveLength(1)
    expect(composition.ok).toBe(true)
  })

  it('does not let prose excuse a structural failure: an unoffered id still fails', () => {
    const workout = composed()
    expect(workout.overview).not.toBeNull()
    workout.sections[1].blocks[0].exercises[0].exercise_id = 'trap-bar-deadlift'

    const verdict = validateComposition(workout, INPUT)
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.error.code).toBe(GenerationFailure.INVALID_REFERENCE)
  })

  it('reads no weight out of suppressed prose, and still reads it from block notes', () => {
    const narrated = (record: QualityRecord) =>
      record.observations.find((observation) => observation.check === SoftCheck.NARRATED_LOAD)

    const inIntroductions = composed()
    inIntroductions.overview = 'Work up to 225 lb on the squat.'
    inIntroductions.sections[1].section_notes = 'Top set at 102.5kg.'
    expect(narrated(observeQuality(inIntroductions, INPUT))?.status).toBe('within')

    const inBlockNotes = composed()
    inBlockNotes.sections[1].blocks[0].block_notes = 'Work up to 225 lb.'
    const record = narrated(observeQuality(inBlockNotes, INPUT))
    expect(record?.status).toBe('outside')
    expect(record?.detail).toEqual(['sections[1].blocks[0].block_notes'])
  })

  it('keeps the deload set-count observation and asks no RPE narrative of section_notes', () => {
    const deload = promptInput({
      training: buildTrainingHistory({ anchors: TRAINING_ANCHORS, today: TODAY, deload: true }),
    })
    expect(deload.training.directive).toBe('deload')
    const compliance = (record: QualityRecord) =>
      record.observations.find((observation) => observation.check === SoftCheck.DIRECTIVE_COMPLIANCE)

    const heavy = composed()
    heavy.sections[1].blocks[0].exercises[0].sets = 6
    const over = compliance(observeQuality(heavy, deload))

    // Primary at intensity 8: ceiling 5 × 0.6 → 3, floor 2. Six sets is over.
    expect(over?.status).toBe('outside')
    expect(over?.detail).toEqual(['directive:deload', 'sets:back-squat:6'])
    expect(over?.metrics).not.toHaveProperty('capStated')

    const light = composed()
    light.sections.forEach((section) =>
      section.blocks.forEach((block) =>
        block.exercises.forEach((exercise) => {
          if (exercise.sets !== null) exercise.sets = Math.min(exercise.sets, 2)
        }),
      ),
    )
    const honoured = compliance(observeQuality(light, deload))

    // No section note states an RPE, and that is no longer a finding.
    expect(light.sections.some((section) => /rpe/i.test(section.section_notes ?? ''))).toBe(false)
    expect(honoured?.status).toBe('within')
    expect(honoured?.detail).toEqual(['directive:deload'])
  })

  it('validates at the effective intensity, so Recovery stays gentle whatever was requested (U27)', () => {
    const compliance = (record: QualityRecord) =>
      record.observations.find((observation) => observation.check === SoftCheck.DIRECTIVE_COMPLIANCE)
    const deloadFor = (goal: 'active_recovery' | 'strength', requested: number) =>
      promptInput({
        request: resolveEffectiveRequest({ ...INPUT.request, goal, requestedIntensity: requested }),
        training: buildTrainingHistory({ anchors: TRAINING_ANCHORS, today: TODAY, deload: true }),
      })
    const threeSets = composed()
    threeSets.sections[1].blocks[0].exercises[0].sets = 3

    for (const requested of [1, 3, 9, 10]) {
      const recovering = deloadFor('active_recovery', requested)
      // The requested number reaches validation unchanged; the ceiling is Recovery's.
      expect(recovering.request.requestedIntensity).toBe(requested)
      expect(recovering.request.effectiveIntensity).toBe(Math.min(requested, 3))
      // Primary at effective ≤3: ceiling 3 × 0.6 → 1, floor 2. Three sets is over.
      expect(compliance(observeQuality(threeSets, recovering))?.detail).toContain(
        'sets:back-squat:3',
      )
    }

    // The same 9 under Strength is composed at 9: ceiling 6 × 0.6 → 3, so three sets is within.
    const strength = deloadFor('strength', 9)
    expect(strength.request.effectiveIntensity).toBe(9)
    expect(compliance(observeQuality(threeSets, strength))?.detail).not.toContain(
      'sets:back-squat:3',
    )
  })
})
