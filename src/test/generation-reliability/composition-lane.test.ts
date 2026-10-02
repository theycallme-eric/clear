/**
 * GR-06 / REQ-022 — the composition lane.
 *
 * Recorded model responses, played back through the mounted `generate-workout`
 * pipeline, prove the five things between a resolved candidate set and a stored
 * session: the prompt is built from this request's per-section candidates, the
 * response is validated against those same sets, a rejection costs exactly one
 * retry and then a typed error, a valid workout is hydrated from the catalog by
 * id, and what is persisted carries the prompt and contract versions.
 *
 * `composition-lane.ts` does the mounting; `composition-recordings.json` holds
 * the recordings — a customized profile with each repaired optional section
 * (`skill_power`, `carries`, `stability_balance`) and a Minimal-tier request
 * whose main work has no barbell to anchor on. Candidates are not part of a
 * recording: they are retrieved from the committed seed on every run, so a
 * recording that names an exercise the seed stops resolving fails here.
 *
 * No provider is contacted. The provider is a list of recorded replies handed
 * to `claude.ts` as its `fetch`, and the global `fetch` is replaced for every
 * test with one that fails the test if anything reaches it.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { REPO_ROOT } from '../../../scripts/gen-types/schema.mjs'
import { GenerationFailure, MAX_ATTEMPTS } from '../../../supabase/functions/_shared/claude.ts'
import { PROMPT_VERSION } from '../../../supabase/functions/_shared/prompt.ts'
import { ErrorCode } from '../../state/errors'
import { EQUIPMENT_BY_TIER, SECTIONS_BY_GOAL } from '../../state/onboarding'
import {
  CONTRACT_VERSION,
  errorResponseSchema,
  generationOutputSchema,
  generationSuccessSchema,
  type GenerationOutput,
  type GenerationRequest,
  type Prescription,
} from '../../state/schemas'
import { seededCatalog } from '../seed-catalog'
import {
  LANE_API_KEY,
  LANE_LOCATION_ID,
  LANE_USER_ID,
  completion,
  createCompositionLane,
  loadRecordings,
  promptCandidates,
  providerError,
  type LaneConfiguration,
  type ProviderReply,
  type RecordedProfile,
} from './composition-lane'

const file = loadRecordings()

const CUSTOMIZED = 'customized-repaired-sections'
const MINIMAL = 'minimal-main-work'
const RECORDED = [CUSTOMIZED, MINIMAL] as const

/** GR-02's repair: the three optional sections that resolved nothing before it. */
const REPAIRED = ['skill_power', 'carries', 'stability_balance'] as const

const profileOf = (name: string): RecordedProfile => file.recordings[name].profile

/** The recorded answer, held to the contract on the way in. */
const workoutOf = (name: string): GenerationOutput =>
  generationOutputSchema.parse(file.recordings[name].response)

function configurationOf(profile: RecordedProfile): LaneConfiguration {
  return {
    enabledSections: [...SECTIONS_BY_GOAL[profile.goal], ...profile.addedSections],
    equipment: EQUIPMENT_BY_TIER[profile.tier as keyof typeof EQUIPMENT_BY_TIER],
  }
}

const REQUEST_ID = 'req_lane0001_composition'

function requestOf(profile: RecordedProfile): GenerationRequest {
  return {
    request_id: REQUEST_ID,
    goal: profile.goal,
    date: '2026-10-01',
    focus: profile.focus,
    requested_intensity: profile.requestedIntensity,
    requested_duration_mins: profile.requestedDurationMins,
    location_id: LANE_LOCATION_ID,
    notes: null,
    deload: false,
  }
}

/** Mount the function for a recording's profile and play `replies` to it. */
function laneFor(name: string, replies: readonly ProviderReply[]) {
  const profile = profileOf(name)
  const lane = createCompositionLane(configurationOf(profile), replies)

  return { lane, run: () => lane.generate(requestOf(profile)) }
}

const prescriptionsOf = (workout: GenerationOutput): Prescription[] =>
  workout.sections.flatMap((section) => section.blocks.flatMap((block) => block.exercises))

const idsOf = (workout: GenerationOutput): string[] => [
  ...new Set(prescriptionsOf(workout).map((exercise) => exercise.exercise_id)),
]

/** The recording with one section's first prescription changed, and nothing else. */
function withPrescription(
  name: string,
  section: string,
  change: Partial<Prescription>,
): GenerationOutput {
  const workout = structuredClone(workoutOf(name))
  const target = workout.sections.find((candidate) => candidate.section_type === section)
  if (target === undefined) throw new Error(`${name} records no "${section}" section`)

  Object.assign(target.blocks[0].exercises[0], change)

  return workout
}

const VALID_REPLY = (name: string) => completion(file.recordings[name].response)
const PROSE_REPLY = completion(file.prose)

// The lane's own guarantee, held for every test in this file: the only `fetch`
// that exists outside the doubles is one that records being reached.
const network = vi.fn(async (input: unknown) => {
  throw new Error(`a network call was attempted: ${String(input)}`)
})

beforeEach(() => {
  network.mockClear()
  vi.stubGlobal('fetch', network)
})

afterEach(() => {
  expect(network).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

// ─────────────────────────────────────────────────────────────────────────────
// 1. The recordings
// ─────────────────────────────────────────────────────────────────────────────

describe('the recorded fixtures', () => {
  it('records a customized profile with every repaired section switched on', () => {
    const profile = profileOf(CUSTOMIZED)
    const preset = SECTIONS_BY_GOAL[profile.goal] as readonly string[]

    expect([...profile.addedSections].sort()).toEqual([...REPAIRED].sort())
    // Customized, not a preset under another name: each is outside the Goal's.
    for (const section of REPAIRED) expect(preset, section).not.toContain(section)
  })

  it.each(REPAIRED)('records a prescription in the repaired section %s', (section) => {
    const recorded = workoutOf(CUSTOMIZED).sections.find(
      (candidate) => candidate.section_type === section,
    )

    expect(recorded?.blocks.flatMap((block) => block.exercises).length).toBeGreaterThan(0)
  })

  it('records a Minimal-tier request whose main work needs no barbell', () => {
    const profile = profileOf(MINIMAL)
    expect(profile.tier).toBe('minimal')
    expect(EQUIPMENT_BY_TIER.minimal).not.toContain('barbell')

    const main = workoutOf(MINIMAL).sections.find(
      (section) => section.section_type === 'primary_lift',
    )
    const prescribed = main?.blocks.flatMap((block) => block.exercises) ?? []

    expect(prescribed.length).toBeGreaterThan(0)
    for (const exercise of prescribed) {
      expect(EQUIPMENT_BY_TIER.minimal, exercise.exercise_id).toContain(exercise.equipment)
    }
  })

  it.each(RECORDED)('%s is a contract workout with a section per enabled section', (name) => {
    const parsed = generationOutputSchema.safeParse(file.recordings[name].response)
    expect(parsed.success).toBe(true)

    expect(workoutOf(name).sections.map((section) => section.section_type).sort()).toEqual(
      [...configurationOf(profileOf(name)).enabledSections].sort(),
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Prompt construction
// ─────────────────────────────────────────────────────────────────────────────

describe('the prompt is built from this request’s per-section candidates', () => {
  const catalog = new Map(seededCatalog().map((exercise) => [exercise.id, exercise]))

  async function promptFor(name: string) {
    const { lane, run } = laneFor(name, [VALID_REPLY(name)])
    await run()

    const [call] = lane.providerCalls()
    return { user: call.user, sections: promptCandidates(call.user) }
  }

  it.each(RECORDED)('%s offers a candidate set for each enabled section and no other', async (name) => {
    const { sections } = await promptFor(name)

    expect(Object.keys(sections).sort()).toEqual(
      [...configurationOf(profileOf(name)).enabledSections].sort(),
    )
    for (const [section, ids] of Object.entries(sections)) {
      expect(ids.length, section).toBeGreaterThan(0)
    }
  })

  it.each(RECORDED)('%s offers only exercises the seed tags for that section and tier', async (name) => {
    const { sections } = await promptFor(name)
    const { equipment } = configurationOf(profileOf(name))

    // Read from the seed directly rather than from retrieval, so the prompt is
    // held to the catalog and not to the double that fed it.
    for (const [section, ids] of Object.entries(sections)) {
      for (const id of ids) {
        const exercise = catalog.get(id)
        expect(exercise?.sections, `${section}: ${id}`).toContain(section)
        expect(
          exercise?.equipmentOptions.some((item) => equipment.includes(item)),
          `${section}: ${id}`,
        ).toBe(true)
      }
    }
  })

  it.each(RECORDED)('%s offers every exercise its recorded response prescribes', async (name) => {
    const { sections } = await promptFor(name)

    for (const section of workoutOf(name).sections) {
      for (const exercise of section.blocks.flatMap((block) => block.exercises)) {
        expect(sections[section.section_type], section.section_type).toContain(exercise.exercise_id)
      }
    }
  })

  it.each(REPAIRED)('the customized prompt carries candidates for %s', async (section) => {
    const { user, sections } = await promptFor(CUSTOMIZED)

    expect(sections[section].length).toBeGreaterThan(0)
    expect(user).toMatch(new RegExp(`^enabled_sections: \\[.*\\b${section}\\b.*\\]$`, 'm'))
  })

  it('the Minimal prompt carries primary-capable main work and nothing that needs a barbell', async () => {
    const { user, sections } = await promptFor(MINIMAL)

    expect(sections.primary_lift.length).toBeGreaterThan(0)
    for (const id of sections.primary_lift) {
      expect(catalog.get(id)?.canBePrimary, id).toBe(true)
    }

    const rows = user.split('\n').filter((line) => line.startsWith('  '))
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row).not.toMatch(/equipment:\[[^\]]*barbell/)
  })

  it('keeps one request’s candidates out of another’s prompt', async () => {
    const customized = await promptFor(CUSTOMIZED)
    const minimal = await promptFor(MINIMAL)

    // The customized request's barbell lift is a real catalog row the Minimal
    // request never resolved, and the repaired sections were never asked for.
    expect(customized.sections.primary_lift).toContain('back-squat')
    expect(minimal.user).not.toContain('back-squat')
    for (const section of REPAIRED) expect(minimal.sections[section]).toBeUndefined()
  })

  it('reads the candidates through the goal-scoped retrieval, once', async () => {
    const { lane, run } = laneFor(CUSTOMIZED, [VALID_REPLY(CUSTOMIZED)])
    await run()

    expect(
      lane.databaseRequests().filter((request) => request.path.includes('generation_candidate')),
    ).toEqual([{ method: 'POST', path: '/rpc/generation_candidate_sets_for_goal' }])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. A valid response: hydrated by id, persisted with versions
// ─────────────────────────────────────────────────────────────────────────────

describe('a recorded valid response', () => {
  async function accepted(name: string) {
    const { lane, run } = laneFor(name, [VALID_REPLY(name)])
    const response = await run()

    return { lane, response, success: generationSuccessSchema.parse(response.body) }
  }

  it.each(RECORDED)('%s answers 200 after one provider call', async (name) => {
    const { lane, response } = await accepted(name)

    expect(response.status).toBe(200)
    expect(lane.providerCalls()).toHaveLength(1)
    expect(lane.providerOverruns()).toBe(0)
  })

  it.each(RECORDED)('%s is hydrated from the catalog by the ids it prescribes', async (name) => {
    const { lane } = await accepted(name)

    expect(lane.catalogReads()).toHaveLength(1)
    expect([...lane.catalogReads()[0]].sort()).toEqual(idsOf(workoutOf(name)).sort())
  })

  it('refuses a workout whose prescribed id the catalog cannot hydrate', async () => {
    const profile = profileOf(MINIMAL)
    const lane = createCompositionLane(
      { ...configurationOf(profile), missingFromCatalog: ['bulgarian-split-squat'] },
      [VALID_REPLY(MINIMAL)],
    )
    const response = await lane.generate(requestOf(profile))

    expect(response.status).toBe(500)
    expect(errorResponseSchema.parse(response.body).code).toBe(ErrorCode.PERSISTENCE_READ_FAILED)
    expect(response.body).not.toHaveProperty('acceptance')
  })

  it.each(RECORDED)('%s carries the prompt and contract versions into acceptance', async (name) => {
    const { success } = await accepted(name)
    const profile = profileOf(name)

    expect(success.requestId).toBe(REQUEST_ID)
    expect(success.acceptance).toMatchObject({
      goal_preset: profile.goal,
      session_focus: profile.focus,
      location_id: LANE_LOCATION_ID,
      requested_duration_mins: profile.requestedDurationMins,
      prompt_version: PROMPT_VERSION,
      contract_version: CONTRACT_VERSION,
    })
    // The model's prescriptions, exactly as recorded: hydration adds beside a
    // prescription and edits nothing inside one.
    expect(success.acceptance.workout).toEqual(workoutOf(name))
    expect(success.acceptance.computed_duration_mins).toBeGreaterThan(0)
  })

  it.each(RECORDED)('%s is persisted whole, with both versions on the session', async (name) => {
    const { lane, success } = await accepted(name)

    const stored = await lane.writer(LANE_USER_ID, success.acceptance)
    expect(stored.ok).toBe(true)
    if (!stored.ok) return

    expect(stored.value.session).toMatchObject({
      user_id: LANE_USER_ID,
      prompt_version: PROMPT_VERSION,
      contract_version: CONTRACT_VERSION,
    })

    const rows = lane.sessions.store()
    const recorded = workoutOf(name)
    expect(rows.sessions).toHaveLength(1)
    expect(rows.sections.map((section) => section.section_type)).toEqual(
      recorded.sections.map((section) => section.section_type),
    )
    expect(rows.exercises.map((exercise) => exercise.exercise_id)).toEqual(
      prescriptionsOf(recorded).map((exercise) => exercise.exercise_id),
    )
  })

  it.each(REPAIRED)('the customized session stores its %s section', async (section) => {
    const { lane, success } = await accepted(CUSTOMIZED)
    await lane.writer(LANE_USER_ID, success.acceptance)

    expect(lane.sessions.store().sections.map((row) => row.section_type)).toContain(section)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Invalid and out-of-candidate responses: one retry, then a typed error
// ─────────────────────────────────────────────────────────────────────────────

/** Every way a response is rejected, as [what, recording, rejected reply, §9 code, detail]. */
const REJECTED: readonly (readonly [string, string, ProviderReply, string, RegExp])[] = [
  [
    'prose instead of a workout',
    CUSTOMIZED,
    PROSE_REPLY,
    GenerationFailure.MALFORMED,
    /not valid JSON/,
  ],
  [
    'a workout that breaks the contract',
    MINIMAL,
    completion({ ...workoutOf(MINIMAL), sections: 'none' }),
    GenerationFailure.MALFORMED,
    /sections/,
  ],
  ...REPAIRED.map(
    (section) =>
      [
        `an exercise outside the ${section} candidates`,
        CUSTOMIZED,
        // A real catalog row, and a candidate of this very request's warmup:
        // eligible somewhere is not eligible here.
        completion(
          withPrescription(CUSTOMIZED, section, { exercise_id: 'cat-cow', equipment: 'bodyweight' }),
        ),
        GenerationFailure.INVALID_REFERENCE,
        new RegExp(`'cat-cow' is not in the ${section} candidate set`),
      ] as const,
  ),
  [
    'a barbell lift as Minimal main work',
    MINIMAL,
    completion(
      withPrescription(MINIMAL, 'primary_lift', { exercise_id: 'back-squat', equipment: 'barbell' }),
    ),
    GenerationFailure.INVALID_REFERENCE,
    /'back-squat' is not in the primary_lift candidate set/,
  ],
  [
    'equipment outside the candidate’s usable equipment',
    MINIMAL,
    completion(withPrescription(MINIMAL, 'primary_lift', { equipment: 'dumbbells' })),
    GenerationFailure.INVALID_REFERENCE,
    /'dumbbells' is not usable equipment for bulgarian-split-squat/,
  ],
  [
    'a section the request never enabled',
    MINIMAL,
    completion({
      ...workoutOf(MINIMAL),
      sections: [
        ...workoutOf(MINIMAL).sections,
        workoutOf(CUSTOMIZED).sections.find((section) => section.section_type === 'carries'),
      ],
    }),
    GenerationFailure.INVALID_REFERENCE,
    /'carries' is not an enabled section/,
  ],
]

describe('a rejected response costs exactly one retry', () => {
  it('covers every repaired section and Minimal main work', () => {
    const names = REJECTED.map(([what]) => what)

    for (const section of REPAIRED) {
      expect(names).toContain(`an exercise outside the ${section} candidates`)
    }
    expect(names).toContain('a barbell lift as Minimal main work')
  })

  it.each(REJECTED)(
    '%s, twice: two calls and a typed error with no workout',
    async (_what, name, rejected, code) => {
      // A valid reply is recorded third. It is never asked for.
      const { lane, run } = laneFor(name, [rejected, rejected, VALID_REPLY(name)])
      const response = await run()

      expect(lane.providerCalls()).toHaveLength(MAX_ATTEMPTS)
      expect(MAX_ATTEMPTS).toBe(2)
      expect(lane.providerOverruns()).toBe(0)

      expect(response.status).toBe(500)
      const error = errorResponseSchema.parse(response.body)
      expect(error.code).toBe(ErrorCode.GENERATION_FAILED)
      expect(error.requestId).toBe(REQUEST_ID)

      // Never a partial or mock workout: the body is the error and nothing else,
      // nothing was hydrated, and nothing was stored.
      expect(response.body).not.toHaveProperty('acceptance')
      expect(response.body).not.toHaveProperty('workout')
      expect(JSON.stringify(response.body)).not.toContain('exercise_id')
      expect(lane.catalogReads()).toEqual([])
      expect(lane.sessions.store().sessions).toEqual([])

      expect(lane.logs().filter(({ line }) => line.includes(`"code":"${code}"`))).toHaveLength(2)
    },
  )

  it.each(REJECTED)(
    '%s: the retry is the same prompt plus the typed correction',
    async (_what, name, rejected, code, detail) => {
      const { lane, run } = laneFor(name, [rejected, rejected])
      await run()

      const [first, second] = lane.providerCalls()
      expect(first.user).not.toContain('RETRY CORRECTION')
      expect(second.system).toBe(first.system)
      expect(second.user.startsWith(first.user)).toBe(true)

      const correction = second.user.slice(first.user.length)
      expect(correction).toContain('RETRY CORRECTION')
      expect(correction).toContain(`The prior response failed: ${code}.`)
      expect(correction).toMatch(detail)
      // The candidates are not offered again differently: same sets, same order.
      expect(promptCandidates(second.user)).toEqual(promptCandidates(first.user))
    },
  )

  it.each(REJECTED)('%s, then a valid response: the one retry succeeds', async (_what, name, rejected) => {
    const { lane, run } = laneFor(name, [rejected, VALID_REPLY(name)])
    const response = await run()

    expect(response.status).toBe(200)
    expect(lane.providerCalls()).toHaveLength(2)
    expect(generationSuccessSchema.parse(response.body).acceptance.workout).toEqual(workoutOf(name))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Provider failures: deterministic ones stop, retryable ones get one retry
// ─────────────────────────────────────────────────────────────────────────────

describe('provider failures', () => {
  const DETERMINISTIC: readonly (readonly [number, string, string])[] = [
    [400, 'invalid_request_error', 'max_tokens: field required'],
    [401, 'authentication_error', 'invalid x-api-key'],
    [403, 'permission_error', 'this key may not use the resource'],
    [404, 'not_found_error', 'model: not found'],
  ]

  const RETRYABLE: readonly (readonly [string, ProviderReply])[] = [
    ['408', providerError(408, 'timeout_error', 'request timed out')],
    ['429', providerError(429, 'rate_limit_error', 'rate limited')],
    ['500', providerError(500, 'api_error', 'internal server error')],
    ['529', providerError(529, 'overloaded_error', 'overloaded')],
    ['a request that never completes', { throws: 'fetch failed' }],
    ['a 200 with no content', { status: 200, body: JSON.stringify({ content: [] }) }],
  ]

  it.each(DETERMINISTIC)(
    'a %i stops after one attempt with a typed error',
    async (status, type, message) => {
      // A valid reply is recorded second. Asking again could not change a
      // deterministic answer, so it is never asked for.
      const { lane, run } = laneFor(MINIMAL, [
        providerError(status, type, message),
        VALID_REPLY(MINIMAL),
      ])
      const response = await run()

      expect(lane.providerCalls()).toHaveLength(1)
      expect(response.status).toBe(502)
      expect(errorResponseSchema.parse(response.body).code).toBe(ErrorCode.GENERATION_MODEL_ERROR)
      expect(errorResponseSchema.parse(response.body).failure).toBe('generation.upstream')
      expect(errorResponseSchema.parse(response.body).retryable).toBe(false)
      expect(response.body).not.toHaveProperty('acceptance')
      expect(lane.sessions.store().sessions).toEqual([])
    },
  )

  it.each(RETRYABLE)('%s is attempted twice and no more', async (_what, failure) => {
    const { lane, run } = laneFor(MINIMAL, [failure, failure, VALID_REPLY(MINIMAL)])
    const response = await run()

    expect(lane.providerCalls()).toHaveLength(2)
    expect(lane.providerOverruns()).toBe(0)
    expect(response.status).toBe(502)
    expect(errorResponseSchema.parse(response.body).code).toBe(ErrorCode.GENERATION_MODEL_ERROR)
    expect(errorResponseSchema.parse(response.body).failure).toBe('generation.exhausted')
    expect(response.body).not.toHaveProperty('acceptance')
    expect(lane.sessions.store().sessions).toEqual([])
  })

  it.each(RETRYABLE)('%s is retried with the prompt unchanged', async (_what, failure) => {
    const { lane, run } = laneFor(MINIMAL, [failure, VALID_REPLY(MINIMAL)])
    const response = await run()

    // There was no response to correct, so there is no correction to append.
    const [first, second] = lane.providerCalls()
    expect(second).toEqual(first)
    expect(response.status).toBe(200)
  })

  it('a retryable failure followed by a deterministic one stops there', async () => {
    const { lane, run } = laneFor(MINIMAL, [
      providerError(529, 'overloaded_error', 'overloaded'),
      providerError(401, 'authentication_error', 'invalid x-api-key'),
      VALID_REPLY(MINIMAL),
    ])
    const response = await run()

    expect(lane.providerCalls()).toHaveLength(2)
    expect(response.status).toBe(502)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. The envelope, and what stays out of it
// ─────────────────────────────────────────────────────────────────────────────

describe('the generation envelope', () => {
  it('is mounted here the way generate-workout mounts it', () => {
    // `index.ts` cannot be imported under Vitest (it reads `Deno.env` and calls
    // `Deno.serve`), so the lane restates its handler. These are the lines the
    // restatement depends on: a change to any of them is a change to make in
    // `composition-lane.ts` as well, and this is what says so.
    const mounted = readFileSync(
      join(REPO_ROOT, 'supabase/functions/generate-workout/index.ts'),
      'utf8',
    )

    for (const line of [
      "route: 'generate-workout',",
      'schema: generationRequestSchema,',
      'const credentials = { url, anonKey, accessToken }',
      '{ userId: user.id, requestId, logger },',
      'db: createGenerationDatabase(credentials),',
      'catalog: createCatalogReader(credentials),',
      'composer: createGenerationComposer({ apiKey: apiKey.value, logger }),',
    ]) {
      expect(mounted).toContain(line)
    }
  })

  it('answers success as exactly the acceptance payload and the request id', async () => {
    const { run } = laneFor(MINIMAL, [VALID_REPLY(MINIMAL)])
    const response = await run()

    expect(Object.keys(response.body).sort()).toEqual(['acceptance', 'requestId'])
    expect(generationSuccessSchema.safeParse(response.body).success).toBe(true)
  })

  it('refuses a request the schema rejects before anything is retrieved or composed', async () => {
    const profile = profileOf(MINIMAL)
    const lane = createCompositionLane(configurationOf(profile), [VALID_REPLY(MINIMAL)])
    const response = await lane.generate({
      ...requestOf(profile),
      requested_intensity: 11,
    })

    expect(response.status).toBe(400)
    expect(lane.databaseRequests()).toEqual([])
    expect(lane.providerCalls()).toEqual([])
  })

  it('logs neither the key, the prompt nor a prescribed exercise', async () => {
    const { lane, run } = laneFor(CUSTOMIZED, [PROSE_REPLY, VALID_REPLY(CUSTOMIZED)])
    await run()

    const lines = lane.logs().map(({ line }) => line).join('\n')
    expect(lines).toContain('"msg":"generation complete"')
    expect(lines).not.toContain(LANE_API_KEY)
    expect(lines).not.toContain('CANDIDATES')
    expect(lines).not.toContain('back-squat')
  })
})
