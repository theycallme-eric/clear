import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import {
  GenerationFailure,
  MAX_ATTEMPTS,
  createComposer,
  parseCompletion,
} from '../../supabase/functions/_shared/claude.ts'
import type { PromptInput } from '../../supabase/functions/_shared/prompt.ts'
import {
  DURATION_CHECK_OWNER,
  HARD_CHECKS,
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
import { promptInput, sectionFixture } from './generation-prompt-fixtures'
import { VALID_RESPONSE, claudeResponse } from './generation-response-fixtures'

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
const MIGRATION = 'supabase/migrations/20260921000002_workout_domain.sql'

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

    expect(violations).toHaveLength(1)
    expect(violations[0].check).toBe(3)
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
 * A workout composed to be outside on all four observations at once: no warmup
 * section, a primary lift that is a fifth of the session, three accessory
 * movements sharing components, and an exercise the history already saw.
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

  // Drop the warmup; the request still enables it.
  workout.sections = [workout.sections[1], accessory]

  return workout
}

const observationFor = (record: QualityRecord, check: SoftCheck) =>
  record.observations.find((observation) => observation.check === check)

describe('the soft record', () => {
  it('is §6’s four checks, in §6’s order', () => {
    const record = observeQuality(composed(), INPUT)

    expect(record.observations.map((observation) => observation.check)).toEqual([
      SoftCheck.RATIOS,
      SoftCheck.WARMUP_COVERAGE,
      SoftCheck.VARIETY,
      SoftCheck.REPETITION,
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
    expect(statuses).toEqual(['outside', 'outside', 'outside', 'outside'])
    expect(validated.value.violations).toEqual([])
  })

  it('records ratios against the goal’s dominant section', () => {
    const record = observeQuality(composed(), INPUT)
    const ratios = observationFor(record, SoftCheck.RATIOS)

    // The fixture request is `strength`, whose dominant section is the primary
    // lift at 40–50% — one prescribed exercise of five is not that, and the
    // number says so rather than a verdict.
    expect(ratios?.summary).toContain('primary_lift')
    expect(ratios?.metrics.min).toBe(0.4)
    expect(ratios?.metrics.max).toBe(0.5)
    expect(ratios?.metrics.exercises).toBe(5)
    expect(ratios?.metrics.observed).toBe(0.2)
    expect(ratios?.status).toBe('outside')
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
    expect(fields[SoftCheck.RATIOS]).toBe('outside')
    expect(fields.noted).toBe(
      observeQuality(composed(), INPUT).observations.filter(
        (observation) => observation.status === 'outside',
      ).length,
    )
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
    expect(composition.value.validation?.quality.observations).toHaveLength(4)
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
