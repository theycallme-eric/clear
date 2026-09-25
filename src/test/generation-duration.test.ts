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
  DURATION_TOLERANCE,
  TRANSITION_SECONDS,
  WORK_PER_SET_SECONDS,
  checkDuration,
  estimateBlock,
  estimateDuration,
} from '../../supabase/functions/_shared/duration.ts'
import type { PromptInput } from '../../supabase/functions/_shared/prompt.ts'
import {
  DURATION_CHECK,
  validateComposition,
} from '../../supabase/functions/_shared/validate.ts'
import { ErrorCode } from '../state/errors'
import { createLogger, type LogLevel, type LogSink } from '../state/logger'
import type { GenerationOutput, WorkoutBlock } from '../state/schemas'
import { promptInput } from './generation-prompt-fixtures'
import { VALID_RESPONSE, claudeResponse } from './generation-response-fixtures'

// GEN-06, and the question it exists to answer is narrower than it looks: can
// this workout's prescribed work and required rest fit the time the user asked
// for? Not "how long will this take" — §7 says so twice, and every assertion
// below is about rejection rather than about accuracy.
//
// Four things are tested, and the first is the one D5 was:
//
//   1. The estimate is computed from blocks and prescriptions, and Claude's
//      `estimated_duration_mins` is never consulted. The strongest form of that
//      is an overrunning workout whose estimate claims it fits: it is rejected
//      anyway, which the old tautological check could not do.
//   2. §7's formula, per structure. The circuit case is the normalization fix
//      earning itself — shared rest once per round, not once per member per
//      round, which under the old shape could be summed three times.
//   3. A workout that cannot fit is rejected, not trimmed, and the failure names
//      the block and by how much.
//   4. The rejection costs exactly one targeted retry through the same counter
//      every other hard check uses, and the addendum carries the block.

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

/** The fixture request: a 45-minute strength session. */
const INPUT = promptInput()
const TARGET_MINS = INPUT.request.durationTargetMins

function collectLogs() {
  const lines: { level: LogLevel; line: string }[] = []
  const sink: LogSink = { write: (level, line) => void lines.push({ level, line }) }

  return { logger: createLogger({ scope: 'generate-workout', sink }), lines }
}

/**
 * The fixture with its primary lift blown up: twelve sets at four minutes' rest
 * is 52 minutes in one block, which no 45-minute session can hold whatever else
 * is composed around it.
 */
function overrunning(): GenerationOutput {
  const workout = composed()
  const lift = workout.sections[1].blocks[0].exercises[0]
  lift.sets = 12
  lift.rest_seconds = 240

  return workout
}

const supersetBlock = (): WorkoutBlock => composed().sections[2].blocks[0]

// ─────────────────────────────────────────────────────────────────────────────
// 1. Computed here, independently of the model
// ─────────────────────────────────────────────────────────────────────────────

describe('the estimate is the code’s own (D5)', () => {
  it('is identical whatever Claude claimed the duration was', () => {
    const optimistic = composed()
    optimistic.estimated_duration_mins = 1
    const absurd = composed()
    absurd.estimated_duration_mins = 9_999

    expect(estimateDuration(optimistic)).toEqual(estimateDuration(absurd))
    expect(checkDuration(optimistic, TARGET_MINS).duration.minutes).toBe(
      checkDuration(absurd, TARGET_MINS).duration.minutes,
    )
  })

  it('rejects a workout that cannot fit even when the model’s estimate says it does', () => {
    const workout = overrunning()
    // The exact shape of the defect: the prompt told Claude 45, Claude wrote 45,
    // and the old check confirmed 45 ≈ 45. This one reads the blocks.
    workout.estimated_duration_mins = TARGET_MINS

    const verdict = checkDuration(workout, TARGET_MINS)

    expect(verdict.fits).toBe(false)
    expect(verdict.duration.minutes).toBeGreaterThan(TARGET_MINS)
  })

  it('takes the target from the request rather than from anything the model wrote', () => {
    const workout = overrunning()

    // The same workout against a session twice as long fits. Nothing about the
    // workout changed; the request did.
    expect(checkDuration(workout, TARGET_MINS).fits).toBe(false)
    expect(checkDuration(workout, 90).fits).toBe(true)
  })
})

describe('the allowances are code constants', () => {
  it('are a work-per-set and a transition, both inside §7’s stated ranges', () => {
    expect(WORK_PER_SET_SECONDS).toBeGreaterThanOrEqual(30)
    expect(WORK_PER_SET_SECONDS).toBeLessThanOrEqual(45)
    expect(TRANSITION_SECONDS).toBeGreaterThan(0)
    expect(TRANSITION_SECONDS).toBeLessThanOrEqual(60)
  })

  it('use §7’s tolerance, generous by design', () => {
    expect(DURATION_TOLERANCE).toBeGreaterThanOrEqual(0.15)
    expect(DURATION_TOLERANCE).toBeLessThanOrEqual(0.2)
  })

  it('never vary by exercise: two different movements cost the same set', () => {
    const workout = composed()
    const first = estimateDuration(workout).minutes

    // A different exercise entirely, same prescription. No metadata table, no
    // per-exercise override, no tempo parsing — so nothing moves.
    workout.sections[1].blocks[0].exercises[0].exercise_id = 'front-squat'
    workout.sections[1].blocks[0].exercises[0].tempo = '4040'

    expect(estimateDuration(workout).minutes).toBe(first)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. §7's formula, per structure
// ─────────────────────────────────────────────────────────────────────────────

describe('a standard block', () => {
  it('sums its members: sets × work, resting between sets and not after the last', () => {
    const block = composed().sections[0].blocks[0]
    const estimate = estimateBlock(block, 'sections[0].blocks[0]', 'warmup')

    // Two members, two sets each at 30s rest: 2×(2×40) work, 2×(1×30) rest.
    expect(estimate.workSeconds).toBe(2 * 2 * WORK_PER_SET_SECONDS)
    expect(estimate.restSeconds).toBe(2 * 30)
    expect(estimate.seconds).toBe(220)
    expect(estimate.declaredClock).toBe(false)
  })
})

describe('a superset and a circuit', () => {
  it('count shared rest once per round, not once per member per round', () => {
    const block = supersetBlock()
    block.structure_type = 'circuit'
    block.rounds = 4
    block.round_rest_seconds = 60
    block.exercises = [...block.exercises, structuredClone(block.exercises[0])]

    const estimate = estimateBlock(block, 'sections[2].blocks[0]', 'accessory')

    // 4 rounds × 3 members × 40s work; rest after rounds 1–3 only.
    expect(estimate.workSeconds).toBe(4 * 3 * WORK_PER_SET_SECONDS)
    expect(estimate.restSeconds).toBe(3 * 60)
    // What the un-normalized shape would have produced, with the same rest
    // duplicated on all three members: the number this check must not be.
    expect(estimate.restSeconds).not.toBe(3 * 3 * 60)
    expect(estimate.rounds).toBe(4)
  })

  it('multiply the members by the block’s rounds rather than by their own sets', () => {
    const block = supersetBlock()
    const before = estimateBlock(block, 'sections[2].blocks[0]', 'accessory').seconds

    // The block is what repeats (§5). A member that also states sets does not
    // thereby cost three times as much.
    block.exercises[0].sets = 3

    expect(estimateBlock(block, 'sections[2].blocks[0]', 'accessory').seconds).toBe(before)
  })

  it('infer rounds for a superset that declares none, and say that they were inferred', () => {
    const block = supersetBlock()
    block.rounds = null
    block.exercises.forEach((exercise) => void (exercise.sets = 3))

    const estimate = estimateBlock(block, 'sections[2].blocks[0]', 'accessory')

    // `fixed_round_structures_have_rounds` constrains circuits alone, so this
    // block is legal with no rounds at all (DATA-01c). The member sets answer,
    // and the estimate records that the number was not the block's own.
    expect(estimate.rounds).toBe(3)
    expect(estimate.assumedRounds).toBe(true)
  })
})

describe('a timed block', () => {
  it.each([
    ['emom', 600],
    ['amrap', 720],
  ] as const)('uses %s’s declared duration and nothing else', (structure, timer) => {
    const block = supersetBlock()
    block.structure_type = structure
    block.rounds = null
    block.timer_type = structure === 'emom' ? 'per_minute' : 'countdown'
    block.timer_seconds = timer
    block.round_rest_seconds = 180

    const estimate = estimateBlock(block, 'sections[2].blocks[0]', 'conditioning')

    expect(estimate.seconds).toBe(timer)
    expect(estimate.restSeconds).toBe(0)
    expect(estimate.declaredClock).toBe(true)
  })

  it('budgets for_time at the full cap — the user may need all of it', () => {
    const block = supersetBlock()
    block.structure_type = 'for_time'
    block.rounds = 5
    block.timer_type = 'countdown'
    block.timer_seconds = 900

    expect(estimateBlock(block, 'sections[2].blocks[0]', 'conditioning').seconds).toBe(900)
  })
})

describe('sections and the workout', () => {
  it('charge one transition per exercise, then one per section', () => {
    const duration = estimateDuration(composed())

    expect(duration.sections.map((section) => section.transitionSeconds)).toEqual([
      2 * TRANSITION_SECONDS,
      1 * TRANSITION_SECONDS,
      2 * TRANSITION_SECONDS,
    ])
    expect(duration.transitionSeconds).toBe(3 * TRANSITION_SECONDS)
  })

  it('total the fixture session at 28 minutes against its 45-minute request', () => {
    const duration = estimateDuration(composed())

    // 220 + 60 warmup, 800 + 30 primary, 420 + 60 accessory, 90 between.
    expect(duration.seconds).toBe(1_680)
    expect(duration.minutes).toBe(28)
    expect(checkDuration(composed(), TARGET_MINS).fits).toBe(true)
  })

  it('never computes a zero, because the column it lands in refuses one', () => {
    const workout = composed()
    workout.sections = [workout.sections[0]]
    workout.sections[0].blocks[0].exercises = [workout.sections[0].blocks[0].exercises[0]]
    workout.sections[0].blocks[0].exercises[0].sets = 1
    workout.sections[0].blocks[0].exercises[0].rest_seconds = 0
    workout.sections[0].blocks[0].timer_seconds = null

    expect(estimateDuration(workout).minutes).toBeGreaterThan(0)
  })
})

describe('the band is one-sided, deliberately', () => {
  it('passes a session the crude allowance under-counts', () => {
    const workout = composed()
    // Half the prescribed work of a 45-minute request. A fixed work-per-set
    // knows nothing about setup or cueing, so a shortfall is evidence about the
    // allowance rather than about the workout — rejecting on it would fail good
    // sessions, and §7 asks only whether the work fits.
    workout.sections = [workout.sections[0]]

    const verdict = checkDuration(workout, TARGET_MINS)

    expect(verdict.duration.minutes).toBeLessThan(TARGET_MINS / 2)
    expect(verdict.fits).toBe(true)
  })

  it('allows the tolerance above the target before it rejects', () => {
    const verdict = checkDuration(composed(), TARGET_MINS)

    expect(verdict.ceilingMins).toBe(Math.round(TARGET_MINS * (1 + DURATION_TOLERANCE)))
    expect(verdict.ceilingMins).toBeGreaterThan(TARGET_MINS)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Rejected, not trimmed
// ─────────────────────────────────────────────────────────────────────────────

describe('a workout that clearly cannot fit', () => {
  it('fails validation with the contract’s own code', () => {
    const validated = validateComposition(overrunning(), INPUT)

    expect(validated.ok).toBe(false)
    if (validated.ok) return

    expect(validated.error.code).toBe('generation.duration_implausible')
    expect(validated.error.code).toBe(GenerationFailure.DURATION_IMPLAUSIBLE)
  })

  it('names the block that overran, its structure, and by how much', () => {
    const validated = validateComposition(overrunning(), INPUT)

    expect(validated.ok).toBe(false)
    if (validated.ok) return

    const detail = validated.error.detail ?? ''
    // The block, not the workout: a retry that is told "too long" re-rolls, and
    // a retry that is told which block is 52 minutes composes.
    expect(detail).toContain('sections[1].blocks[0]')
    expect(detail).toContain('primary_lift')
    expect(detail).toContain('standard')
    expect(detail).toContain('52 min')
    expect(detail).toContain('67 min')
    expect(detail).toContain(`${TARGET_MINS} min target`)
    expect(detail).toContain('13 min over')
    // The addendum is a correction, not the model's own answer read back to it.
    expect(detail).not.toContain('Lower Body Strength')
    expect(detail).not.toContain('{')
  })

  it('leaves the workout exactly as composed — trimming is the model’s judgment', () => {
    const workout = overrunning()
    const before = structuredClone(workout)

    validateComposition(workout, INPUT)

    expect(workout).toEqual(before)
    expect(workout.sections[1].blocks[0].exercises[0].sets).toBe(12)
  })

  it('logs the block and the minutes, never an exercise id', () => {
    const { logger, lines } = collectLogs()

    validateComposition(overrunning(), INPUT, { logger, requestId: 'req_abc123_def456' })

    const rejected = lines.find((entry) => entry.line.includes('duration implausible'))
    expect(rejected?.level).toBe('warn')
    expect(rejected?.line).toContain('"computedDurationMins":67')
    expect(rejected?.line).toContain('"overrunMins":13')
    expect(rejected?.line).toContain('sections[1].blocks[0]')
    expect(rejected?.line).not.toContain('back-squat')
  })
})

describe('check 8 alongside the seven that have constraints', () => {
  it('is GENERATION_CONTRACT §6’s eighth row, in §6’s own words', () => {
    const section = read(CONTRACT).split('### Hard')[1]?.split('### Soft')[0] ?? ''
    const rows = [...section.matchAll(/^\|\s*(\d+)\s*\|\s*(.+?)\s*\|$/gm)].map((row) => ({
      number: Number(row[1]),
      rule: row[2].replace(/\*\*/g, '').replace(/`/g, '').replace(/\s+/g, ' ').trim(),
    }))

    const eighth = rows.find((row) => row.number === 8)

    expect(DURATION_CHECK.number).toBe(8)
    expect(DURATION_CHECK.rule).toBe(eighth?.rule)
    expect(DURATION_CHECK.gate).toBe('validator')
    expect(DURATION_CHECK.failure).toBe(GenerationFailure.DURATION_IMPLAUSIBLE)
    expect(DURATION_CHECK.owner).toBe('GEN-06')
  })

  it('persists its number beside Claude’s, in a column that exists', () => {
    const validated = validateComposition(composed(), INPUT)

    expect(validated.ok).toBe(true)
    if (!validated.ok) return

    expect(validated.value.quality.computedDurationMins).toBe(28)
    // Claude's own number, carried beside it and read by nothing (§5).
    expect(validated.value.quality.modelEstimateMins).toBe(46)
    expect(validated.value.duration.blocks).toHaveLength(3)

    // The column the pair lands in, on the table that holds the session.
    expect(read(MIGRATION)).toContain('computed_duration_mins')
  })

  it('surfaces both numbers in the quality log line', () => {
    const { logger, lines } = collectLogs()
    validateComposition(composed(), INPUT, { logger, requestId: 'req_abc123_def456' })

    const quality = lines.find((entry) => entry.line.includes('composition quality'))

    expect(quality?.line).toContain('"computedDurationMins":28')
    expect(quality?.line).toContain('"modelEstimateMins":46')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. One targeted retry
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

const userMessage = (calls: readonly { init: RequestInit }[], index: number) =>
  (JSON.parse(String(calls[index].init.body)) as { messages: { content: string }[] }).messages[0]
    .content

describe('the retry a duration failure buys', () => {
  const validate = (workout: GenerationOutput, input: PromptInput) =>
    validateComposition(workout, input)

  it('is exactly one, and its addendum names the code and the block', async () => {
    const fetch = stubFetch([
      claudeResponse(JSON.stringify(overrunning())),
      claudeResponse(VALID_RESPONSE),
    ])

    const composition = await createComposer({
      apiKey: API_KEY,
      fetch: fetch.send,
      validate,
    }).compose(INPUT, REQUEST_ID)

    expect(fetch.calls).toHaveLength(2)
    expect(composition.ok).toBe(true)
    if (!composition.ok) return

    expect(composition.value.attempts).toBe(2)
    expect(composition.value.retriedAfter?.code).toBe(GenerationFailure.DURATION_IMPLAUSIBLE)
    expect(composition.value.validation?.quality.computedDurationMins).toBe(28)

    const retry = userMessage(fetch.calls, 1)
    expect(retry).toContain('RETRY CORRECTION')
    expect(retry).toContain('generation.duration_implausible')
    expect(retry).toContain('sections[1].blocks[0]')
  })

  it('twice is the typed exhaustion, carrying no trimmed workout', async () => {
    const fetch = stubFetch([claudeResponse(JSON.stringify(overrunning()))])

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
      failures: [
        GenerationFailure.DURATION_IMPLAUSIBLE,
        GenerationFailure.DURATION_IMPLAUSIBLE,
      ],
    })
    expect(JSON.stringify(composition.error)).not.toContain('Lower Body Strength')
  })
})
