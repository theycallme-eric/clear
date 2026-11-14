/**
 * TASK-034 (REQ-034; AC-R034-01, AC-R034-02) — the authoritative Warm-up and
 * Cooldown guide content and approximate duration.
 *
 * Every reading below is derived from a real composition: the edge parser's
 * own parse of the recorded generation response, the app's factories, and the
 * persisted session the sessions client reads back from the session double.
 * No case asserts the illustrated "~4 minutes" or three rows (R01 "Bounds");
 * one case proves the module cannot carry them.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseCompletion } from '../../supabase/functions/_shared/claude.ts'
import {
  TRANSITION_SECONDS,
  WORK_PER_SET_SECONDS,
  estimateDuration,
} from '../../supabase/functions/_shared/duration.ts'
import { createSessionsClient } from '../data/sessions'
import { makeAppError, makeGenerationOutput, makePrescription, makeSessionAcceptance, makeWorkoutBlock } from '../test/factories'
import { VALID_RESPONSE } from '../test/generation-response-fixtures'
import { createSessionDouble } from '../test/session-double'
import { ErrorCode, isErr } from './errors'
import {
  PREPARATION_GUIDE_SOURCES,
  approximateDurationText,
  composedPreparationGuide,
  persistedPreparationGuide,
  preparationGuideReading,
  type PreparationGuide,
  type PreparationSource,
} from './preparation-guide'
import type { QueryState } from './query'
import { reviewBriefing } from './review'
import type { GenerationOutput, Prescription, SessionSnapshot, WorkoutSection } from './schemas'
import { sessionProgress } from './workout-progress'

const repoRoot = resolve(import.meta.dirname, '../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf-8')

const URL_ = 'https://project.supabase.co'
const ANON_KEY = 'anon-key'
const TOKEN = 'user-token'
const USER = 'a0000001-0000-4000-8000-000000000000'

/** The recorded generation response, through the edge function's own parser. */
function recordedWorkout(): GenerationOutput {
  const parsed = parseCompletion(VALID_RESPONSE)
  if (!parsed.ok) throw new Error('the recorded response no longer parses')
  return structuredClone(parsed.value)
}

/** A bodyweight preparation movement, by name only where the test cares. */
function prep(exerciseId: string, overrides: Partial<Prescription> = {}): Prescription {
  return makePrescription({
    exercise_id: exerciseId,
    equipment: 'bodyweight',
    session_function: 'prep',
    anchor_relationship: 'neutral',
    load_type: 'bodyweight',
    load_value: null,
    ...overrides,
  })
}

function section(
  type: WorkoutSection['section_type'],
  exercises: readonly Prescription[],
  overrides: Partial<WorkoutSection> = {},
): WorkoutSection {
  return {
    section_type: type,
    section_title: type === 'warmup' ? 'Prepare for the press' : 'Bring it down',
    section_notes: 'Move slowly through each position and breathe; this paragraph is never shown.',
    blocks: [makeWorkoutBlock({ exercises: [...exercises] })],
    ...overrides,
  }
}

function guide(value: PreparationGuide | null): PreparationGuide {
  if (value === null) throw new Error('expected a guide')
  return value
}

/** Accept a workout through the real client and read the session back. */
async function persisted(workout: GenerationOutput) {
  const double = createSessionDouble({ url: URL_, anonKey: ANON_KEY, users: { [TOKEN]: USER } })
  const client = createSessionsClient({ url: URL_, anonKey: ANON_KEY, accessToken: TOKEN, fetch: double.fetch })
  const accepted = await client.accept(USER, makeSessionAcceptance({ workout }))
  if (!accepted.ok) throw new Error(`acceptance failed: ${JSON.stringify(accepted)}`)
  return { client, snapshot: accepted.value }
}

const ready = <T,>(data: T): QueryState<T> => ({ status: 'ready', data })

describe('TASK-034 authoritative preparation guide content and approximate duration', () => {
  it('AC-R034-01 a composed Warm-up and Cooldown read the stable title, every prescribed movement in order and their own count, never the generated title, notes or per-movement prescription', () => {
    const warmup = section('warmup', [
      prep('cat-cow', { sets: 2, target_value: 8, rest_seconds: 20 }),
      prep('glute-bridge', { sets: 2, target_value: 12, rest_seconds: 20 }),
      prep('band-pull-apart', { equipment: 'band', load_type: 'none', sets: 2, target_value: 15, rest_seconds: 20 }),
      prep('worlds-greatest-stretch', { sets: 1, target_value: 5, per_side: true, rest_seconds: 0 }),
      prep('cat-cow', { sets: 1, target_value: 6, rest_seconds: 0 }),
    ])
    const cooldown = section('cooldown', [
      prep('couch-stretch', { modality: 'time', sets: 1, target_value: 60, per_side: true, rest_seconds: null }),
      prep('childs-pose', { modality: 'time', sets: 1, target_value: 45, rest_seconds: null }),
    ])

    const warm = guide(composedPreparationGuide(warmup))
    const cool = guide(composedPreparationGuide(cooldown))

    expect(warm.title).toBe('Warm-up')
    expect(cool.title).toBe('Cooldown')
    expect(warm.origin).toBe('composed')
    // The original selection: all five rows, in order — the repeated movement
    // is kept, nothing is curated, merged or added.
    expect(warm.movements.map((movement) => movement.exerciseId)).toEqual([
      'cat-cow',
      'glute-bridge',
      'band-pull-apart',
      'worlds-greatest-stretch',
      'cat-cow',
    ])
    expect(warm.movements.map((movement) => movement.name)).toEqual([
      'cat cow',
      'glute bridge',
      'band pull apart',
      'worlds greatest stretch',
      'cat cow',
    ])
    expect(warm.movementCount).toBe(5)
    expect(cool.movements.map((movement) => movement.name)).toEqual(['couch stretch', 'childs pose'])
    expect(cool.movementCount).toBe(2)
    expect(new Set(warm.movements.map((movement) => movement.key)).size).toBe(5)

    // The concise format only: a movement is a key, a slug and a name.
    for (const movement of [...warm.movements, ...cool.movements]) {
      expect(Object.keys(movement).sort()).toEqual(['exerciseId', 'key', 'name'])
    }
    const text = JSON.stringify([warm, cool])
    expect(text).not.toContain('Prepare for the press')
    expect(text).not.toContain('Bring it down')
    expect(text).not.toContain('paragraph')
    expect(text).not.toMatch(/bodyweight|band"|\b60s\b|Rest|×/)

    // A section that is not preparation has no guide.
    expect(composedPreparationGuide(section('primary_lift', [makePrescription()]))).toBeNull()
  })

  it('AC-R034-01 the approximate time is GEN-06’s own section estimate from blocks and prescriptions, in whole minutes, never the model estimate, the computed session duration or the target', () => {
    const exercises = [
      prep('cat-cow', { sets: 2, rest_seconds: 30 }),
      prep('glute-bridge', { sets: 2, rest_seconds: 30 }),
      prep('dead-bug', { sets: 3, rest_seconds: 15 }),
    ]
    const warmup = section('warmup', exercises)
    const reading = guide(composedPreparationGuide(warmup))

    // §7 by hand: each set is one working set's allowance, rest between sets
    // as prescribed, a transition per movement.
    const expected =
      (2 + 2 + 3) * WORK_PER_SET_SECONDS + (30 + 30 + 2 * 15) + exercises.length * TRANSITION_SECONDS
    expect(reading.approximateSeconds).toBe(expected)
    expect(reading.approximateMinutes).toBe(Math.max(1, Math.round(expected / 60)))
    expect(reading.durationText).toBe(approximateDurationText(reading.approximateMinutes))

    // The same number GEN-06 gives that section inside a whole workout.
    const workout = makeGenerationOutput({ sections: [warmup, ...makeGenerationOutput().sections.slice(1)] })
    expect(estimateDuration(workout).sections[0].seconds).toBe(reading.approximateSeconds)

    // The model's estimate and the session's numbers are not inputs: moving
    // them moves nothing, and so does the generated prose.
    const absurd = { ...workout, estimated_duration_mins: 240 }
    const acceptance = makeSessionAcceptance({
      workout: absurd,
      computed_duration_mins: 3,
      effective_duration_target_mins: 90,
      requested_duration_mins: 15,
    })
    expect(guide(composedPreparationGuide(acceptance.workout.sections[0]))).toEqual(reading)
    expect(
      guide(composedPreparationGuide({ ...warmup, section_title: 'Anything', section_notes: null })),
    ).toEqual(reading)

    // A different prescription reads a different time: it is data.
    const longer = guide(
      composedPreparationGuide(section('warmup', exercises.map((exercise) => ({ ...exercise, sets: 4 })))),
    )
    expect(longer.approximateSeconds).toBeGreaterThan(reading.approximateSeconds)
  })

  it('AC-R034-01 a persisted session reads the same guide as the composed workout it was accepted from, and a swap shows its replacement in the same place', async () => {
    const workout = makeGenerationOutput({
      sections: [
        section('warmup', [
          prep('cat-cow', { sets: 2, rest_seconds: 20 }),
          prep('glute-bridge', { sets: 2, rest_seconds: 20 }),
          prep('dead-bug', { sets: 2, rest_seconds: 20 }),
          prep('bird-dog', { sets: 2, rest_seconds: 20 }),
        ]),
        ...makeGenerationOutput().sections.slice(1),
        section('cooldown', [prep('couch-stretch', { modality: 'time', sets: 1, target_value: 60, rest_seconds: null })]),
      ],
    })
    const { client, snapshot } = await persisted(workout)

    const composed = [guide(composedPreparationGuide(workout.sections[0])), guide(composedPreparationGuide(workout.sections[2]))]
    const fromRows = [snapshot.sections[0], snapshot.sections[2]].map((entry) => {
      const result = persistedPreparationGuide(entry)
      if (isErr(result)) throw new Error('unexpected read failure')
      return guide(result.value)
    })

    const comparable = (value: PreparationGuide) => ({
      type: value.type,
      title: value.title,
      names: value.movements.map((movement) => movement.name),
      count: value.movementCount,
      seconds: value.approximateSeconds,
      text: value.durationText,
    })
    expect(fromRows.map(comparable)).toEqual(composed.map(comparable))
    expect(fromRows.every((value) => value.origin === 'persisted')).toBe(true)

    // The swap supersedes the second warm-up row; the snapshot's active row
    // takes its place and the guide follows it.
    const outgoing = snapshot.sections[0].blocks[0].exercises[1].exercise
    const swapped = await client.swap(outgoing.id, prep('hip-airplane', { sets: 2, rest_seconds: 20 }))
    expect(swapped.ok).toBe(true)
    const after = await client.snapshot(snapshot.session.id)
    if (!after.ok) throw new Error('snapshot failed')
    const reread = persistedPreparationGuide(after.value.sections[0])
    if (isErr(reread)) throw new Error('unexpected read failure')
    expect(guide(reread.value).movements.map((movement) => movement.name)).toEqual([
      'cat cow',
      'hip airplane',
      'dead bug',
      'bird dog',
    ])
    expect(guide(reread.value).movementCount).toBe(4)
  })

  it('AC-R034-01 every owner the source record names resolves to a real export, and the contract states the same owners', async () => {
    const fields = new Set(PREPARATION_GUIDE_SOURCES.map((source) => source.field))
    expect([...fields].sort()).toEqual(['approximateTime', 'movementCount', 'movements', 'name', 'title'])

    const spec = read('docs/specs/PREPARATION_GUIDE_CONTRACT.md')
    for (const source of PREPARATION_GUIDE_SOURCES) {
      const module = (await import(/* @vite-ignore */ resolve(repoRoot, source.module))) as Record<string, unknown>
      expect(module[source.exportName], `${source.module} → ${source.exportName}`).toBeDefined()
      expect(spec, `${source.exportName} in the contract`).toContain(`\`${source.exportName}\``)
      expect(spec).toContain(`\`${source.module}\``)
      for (const column of source.neverReads) expect(spec, column).toContain(`\`${column}\``)
    }
    for (const reason of ['no-workout', 'not-composed', 'no-movements']) {
      expect(spec).toContain(`\`${reason}\``)
    }
    expect(spec).toContain('`~N minutes`')
  })

  it('AC-R034-02 missing: no workout, no Warm-up or Cooldown composed, and a section with no active movement read as missing with their reason, never as an empty guide', async () => {
    const noCooldown: PreparationSource = { origin: 'composed', workout: recordedWorkout() }
    expect(preparationGuideReading(ready(noCooldown), 'cooldown')).toEqual({
      status: 'missing',
      type: 'cooldown',
      reason: 'not-composed',
    })
    expect(preparationGuideReading(ready(null), 'warmup')).toEqual({
      status: 'missing',
      type: 'warmup',
      reason: 'no-workout',
    })

    // A workout whose user switched the warm-up off.
    const noWarmup = makeGenerationOutput({ sections: makeGenerationOutput().sections.slice(1) })
    expect(preparationGuideReading(ready<PreparationSource | null>({ origin: 'composed', workout: noWarmup }), 'warmup')).toMatchObject({
      status: 'missing',
      reason: 'not-composed',
    })

    // Persisted: a section whose rows are all superseded has nothing to list.
    const { snapshot } = await persisted(makeGenerationOutput())
    const emptied: SessionSnapshot = structuredClone(snapshot)
    for (const block of emptied.sections[0].blocks) {
      for (const { exercise } of block.exercises) exercise.revision_status = 'superseded'
    }
    expect(preparationGuideReading(ready<PreparationSource | null>({ origin: 'persisted', snapshot: emptied }), 'warmup')).toEqual({
      status: 'missing',
      type: 'warmup',
      reason: 'no-movements',
    })
    expect(persistedPreparationGuide(emptied.sections[0])).toEqual({ ok: true, value: null })
  })

  it('AC-R034-02 loading and error follow the source, and a persisted row whose target contradicts its kind is an error rather than a guess', async () => {
    expect(preparationGuideReading({ status: 'loading' }, 'warmup')).toEqual({ status: 'loading' })

    const failure = makeAppError({ code: ErrorCode.PERSISTENCE_READ_FAILED })
    expect(preparationGuideReading({ status: 'error', error: failure }, 'cooldown')).toEqual({
      status: 'error',
      error: failure,
    })

    const { snapshot } = await persisted(makeGenerationOutput())
    const broken: SessionSnapshot = structuredClone(snapshot)
    const row = broken.sections[0].blocks[0].exercises[0].exercise
    row.target_kind = 'fixed'
    row.target_value = null
    const reading = preparationGuideReading(ready<PreparationSource | null>({ origin: 'persisted', snapshot: broken }), 'warmup')
    expect(reading.status).toBe('error')
    if (reading.status !== 'error') return
    expect(reading.error.code).toBe(ErrorCode.PERSISTENCE_READ_FAILED)
    expect(reading.error.details).toMatchObject({ workout_exercise_id: row.id, reason: 'target_shape' })
  })

  it('AC-R034-02 content: the recorded generation reads its own Warm-up exactly as the Review briefing and the live workout name it, from the composed and the persisted source alike', async () => {
    const workout = recordedWorkout()
    const composed = preparationGuideReading(ready<PreparationSource | null>({ origin: 'composed', workout }), 'warmup')
    expect(composed.status).toBe('ready')
    if (composed.status !== 'ready') return

    // Review's own derivation of the same section.
    const briefing = reviewBriefing(makeSessionAcceptance({ workout }), 'kg')
    const reviewWarmup = briefing.sections.find((entry) => entry.type === 'warmup')
    expect(composed.guide.title).toBe(reviewWarmup?.title)
    expect(composed.guide.movements.map((movement) => movement.name)).toEqual(
      reviewWarmup?.blocks.flatMap((block) => block.exercises.map((exercise) => exercise.name)),
    )
    expect(composed.guide.movementCount).toBe(reviewWarmup?.movementCount)
    expect(composed.guide.approximateSeconds).toBe(estimateDuration(workout).sections[0].seconds)
    // The recorded Warm-up is two movements of 2 sets with 30 s rest (§4 of
    // the contract), so its reading is that, not the illustration.
    expect(composed.guide.approximateSeconds).toBe(2 * (2 * WORK_PER_SET_SECONDS + 30) + 2 * TRANSITION_SECONDS)
    expect(composed.guide.durationText).toBe('~5 minutes')
    expect(composed.guide.movementCount).toBe(2)

    // The live workout's own reading of the persisted session.
    const { snapshot } = await persisted(workout)
    const live = preparationGuideReading(ready<PreparationSource | null>({ origin: 'persisted', snapshot }), 'warmup')
    expect(live.status).toBe('ready')
    if (live.status !== 'ready') return
    expect(live.guide.title).toBe(sessionProgress(snapshot).sections[0].title)
    expect(live.guide.movements.map((movement) => movement.name)).toEqual(
      composed.guide.movements.map((movement) => movement.name),
    )
    expect(live.guide.durationText).toBe(composed.guide.durationText)
  })

  it('AC-R034-02 readings follow the data, keep the concise ~N minutes format and carry no hard-coded illustrated four minutes, three rows or sample movements', () => {
    const readings = [
      section('warmup', [prep('cat-cow', { sets: 1, rest_seconds: 0 })]),
      section('warmup', [prep('cat-cow', { sets: 2, rest_seconds: 20 }), prep('glute-bridge', { sets: 2, rest_seconds: 20 })]),
      section(
        'warmup',
        ['cat-cow', 'glute-bridge', 'dead-bug', 'bird-dog', 'hip-airplane', 'band-pull-apart'].map((id) =>
          prep(id, { sets: 2, rest_seconds: 30 }),
        ),
      ),
      section('cooldown', [prep('couch-stretch', { modality: 'time', sets: 2, target_value: 45, rest_seconds: 15 })]),
    ].map((value) => guide(composedPreparationGuide(value)))

    expect(readings.map((value) => value.movementCount)).toEqual([1, 2, 6, 1])
    // Distinct sections, distinct readings: nothing is a fixed duration.
    expect(new Set(readings.map((value) => value.approximateSeconds)).size).toBe(readings.length)
    for (const value of readings) {
      expect(value.durationText).toMatch(/^~\d+ minutes?$/)
      expect(value.durationText).toBe(`~${value.approximateMinutes} ${value.approximateMinutes === 1 ? 'minute' : 'minutes'}`)
    }
    expect(approximateDurationText(1)).toBe('~1 minute')
    expect(approximateDurationText(7)).toBe('~7 minutes')

    // The module's code — comments aside — holds no duration, count or
    // movement of its own: only the empty check, the one-minute floor and the
    // minute.
    const code = read('src/state/preparation-guide.ts')
      .split('\n')
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join('\n')
    const numbers = new Set(code.match(/\b\d+\b/g) ?? [])
    expect([...numbers].sort()).toEqual(['0', '1', '60'])
    for (const sample of ['Arm circles', 'Scapular', 'Bodyweight squat', 'Chest stretch', 'Lat stretch', '~4']) {
      expect(code).not.toContain(sample)
    }
  })
})
