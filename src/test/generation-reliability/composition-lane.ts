/**
 * GR-06 / REQ-022 — the composition lane, as a function of its inputs.
 *
 * `createCompositionLane` mounts `generate-workout` the way its `index.ts`
 * does — the same envelope, the same request schema, the same three
 * dependencies of `performGeneration` — with the two things outside the
 * process replaced:
 *
 *   * **the provider** is a list of recorded replies, played back in order.
 *     Each is an HTTP status and a body; a reply asked for after the list ran
 *     out is recorded as an overrun rather than answered, so "exactly one
 *     retry" is a count the lane holds and not a property of the fixture.
 *   * **the database** is PostgREST in memory: candidate retrieval is
 *     `candidates-double.ts` over the committed seed, hydration reads
 *     `exercise_catalog` rows built from the same seed, and `persist_session`
 *     is `session-double.ts`.
 *
 * Everything between the two is the code that ships. The prompt the provider
 * is sent is the one `prompt.ts` assembled from what retrieval returned, the
 * verdict is `validate.ts`'s against those same candidate sets, and the retry
 * budget is `claude.ts`'s — so a change to any of them changes what this lane
 * observes.
 *
 * `index.ts` itself cannot be imported: it reads `Deno.env` and calls
 * `Deno.serve` at module scope. The mount below is its handler restated, and
 * `composition-lane.test.ts` holds the two to each other.
 *
 * Nothing here opens a connection. Both doubles are handed to the modules as
 * their `fetch`, and neither is installed globally.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { REPO_ROOT } from '../../../scripts/gen-types/schema.mjs'
import type { VerifyToken } from '../../../supabase/functions/_shared/envelope.ts'
import { ANTHROPIC_MESSAGES_URL } from '../../../supabase/functions/_shared/claude.ts'
import { createEdgeFunction } from '../../../supabase/functions/_shared/envelope.ts'
import {
  createGenerationComposer,
  createGenerationDatabase,
  performGeneration,
} from '../../../supabase/functions/_shared/generate.ts'
import { CATALOG_VIEW, createCatalogReader } from '../../../supabase/functions/_shared/hydrate.ts'
import {
  PERSIST_FUNCTION,
  createSessionWriter,
  type SessionWriter,
} from '../../../supabase/functions/_shared/persist.ts'
import { ok } from '../../state/errors'
import type { LogLevel, LogSink } from '../../state/logger'
import {
  generationRequestSchema,
  GENERATION_ERROR_ACCEPT,
  GENERATION_SINGLE_ATTEMPT_ACCEPT,
  type ExerciseCatalogRow,
  type GenerationRequest,
} from '../../state/schemas'
import { createCandidatesDouble } from '../candidates-double'
import { seededCatalog } from '../seed-catalog'
import { createSessionDouble, type SessionDouble } from '../session-double'

export const RECORDINGS_PATH = 'src/test/generation-reliability/composition-recordings.json'

const PROJECT_URL = 'https://clear.test'
const ANON_KEY = 'anon'
const ACCESS_TOKEN = 'lane-access-token'
export const LANE_API_KEY ='sk-ant-api03-ThisIsNotARealKeyItIsAFixture'

export const LANE_USER_ID = '00000000-0000-4000-8000-0000000000aa'
export const LANE_LOCATION_ID = '00000000-0000-4000-8000-0000000000bb'

// ─────────────────────────────────────────────────────────────────────────────
// Recordings
// ─────────────────────────────────────────────────────────────────────────────

/** The saved configuration a recording was made for. */
export interface RecordedProfile {
  readonly tier: string
  readonly goal: GenerationRequest['goal']
  readonly focus: GenerationRequest['focus']
  /** Sections switched on beside the Goal's preset. */
  readonly addedSections: readonly string[]
  readonly requestedIntensity: number
  readonly requestedDurationMins: number
}

/** One recorded model response and the request it answers. */
export interface Recording {
  readonly description: string
  readonly profile: RecordedProfile
  /** The model's text: a contract workout as an object, or prose as a string. */
  readonly response: unknown
}

export interface RecordingsFile {
  readonly version: number
  readonly notes: readonly string[]
  /** A recorded answer that is not a workout at all. */
  readonly prose: string
  readonly recordings: Readonly<Record<string, Recording>>
}

export function loadRecordings(): RecordingsFile {
  return JSON.parse(readFileSync(join(REPO_ROOT, RECORDINGS_PATH), 'utf8')) as RecordingsFile
}

/** One reply the provider double plays back. */
export type ProviderReply =
  | { readonly status: number; readonly body: string }
  /** The request never completed: `fetch` itself rejects. */
  | { readonly throws: string }

/** A `messages` 200 carrying `content` as the model's text. */
export function completion(content: unknown): ProviderReply {
  return {
    status: 200,
    body: JSON.stringify({
      id: 'msg_01FixtureNotARealMessageId',
      type: 'message',
      role: 'assistant',
      content: [
        { type: 'text', text: typeof content === 'string' ? content : JSON.stringify(content) },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 3900, output_tokens: 850 },
    }),
  }
}

/** The provider's own error envelope, at `status`. */
export function providerError(status: number, type: string, message: string): ProviderReply {
  return { status, body: JSON.stringify({ type: 'error', error: { type, message } }) }
}

// ─────────────────────────────────────────────────────────────────────────────
// The lane
// ─────────────────────────────────────────────────────────────────────────────

/** What retrieval is configured with: the saved profile, resolved. */
export interface LaneConfiguration {
  readonly enabledSections: readonly string[]
  readonly equipment: readonly string[]
  /** Ids `exercise_catalog` no longer answers for, to prove hydration reads it. */
  readonly missingFromCatalog?: readonly string[]
}

export interface ProviderCall {
  readonly system: string
  /** The user message: the request, the candidates and any retry correction. */
  readonly user: string
}

/** One emitted log line, as CORE-02 wrote it: JSON, already redacted. */
export interface LogLine {
  readonly level: LogLevel
  readonly line: string
}

export interface CompositionLane {
  /** POST the request to the mounted function, as the client does. */
  generate(request: GenerationRequest, attemptLimit?: 1): Promise<{ status: number; body: Record<string, unknown> }>
  /** Every request the provider double was sent, in order. */
  providerCalls(): readonly ProviderCall[]
  /** Requests made after the recorded replies ran out. Always zero when the budget holds. */
  providerOverruns(): number
  /** Every database request the pipeline made, in order. */
  databaseRequests(): readonly { method: string; path: string }[]
  /** The ids each `exercise_catalog` read asked for, in order. */
  catalogReads(): readonly (readonly string[])[]
  /** `persist.ts`'s writer over the lane's session store. */
  writer: SessionWriter
  sessions: SessionDouble
  logs(): readonly LogLine[]
}

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/** `exercise_catalog`, for hydration: the seed's row for an id. */
function catalogRows(ids: readonly string[]): ExerciseCatalogRow[] {
  return seededCatalog()
    .filter((exercise) => ids.includes(exercise.id))
    .map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      equipment_display_names: { ...exercise.equipmentDisplayNames },
      coaching_cues: [...exercise.coachingCues],
      // The seed authors neither; the columns are nullable and null is "none".
      regression: null,
      progression: null,
      muscles: exercise.muscles as ExerciseCatalogRow['muscles'],
    }))
}

/** `id=in.("a","b")` → the ids. */
function idsOf(filter: string | null): string[] {
  return [...(filter ?? '').matchAll(/"((?:[^"]|"")*)"/g)].map((match) =>
    match[1].replaceAll('""', '"'),
  )
}

export function createCompositionLane(
  configuration: LaneConfiguration,
  replies: readonly ProviderReply[],
): CompositionLane {
  const providerCalls: ProviderCall[] = []
  const databaseRequests: { method: string; path: string }[] = []
  const catalogReads: string[][] = []
  const logs: LogLine[] = []
  let overruns = 0

  const sessions = createSessionDouble({
    url: PROJECT_URL,
    anonKey: ANON_KEY,
    users: { [ACCESS_TOKEN]: LANE_USER_ID },
    exerciseIds: seededCatalog().map((exercise) => exercise.id),
  })

  const provider: typeof globalThis.fetch = async (input, init) => {
    if (String(input) !== ANTHROPIC_MESSAGES_URL) {
      throw new Error(`the provider double was asked for ${String(input)}`)
    }

    const sent = JSON.parse(String(init?.body ?? '{}')) as {
      system: string
      messages: { content: string }[]
    }
    const reply = replies[providerCalls.length]
    providerCalls.push({ system: sent.system, user: sent.messages[0].content })

    if (reply === undefined) {
      overruns += 1
      throw new Error('no recorded reply is left for this request')
    }
    if ('throws' in reply) throw new TypeError(reply.throws)

    return new Response(reply.body, {
      status: reply.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const rest = `${PROJECT_URL}/rest/v1`

  const database: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    if (!String(input).startsWith(rest)) {
      throw new Error(`the database double was asked for ${String(input)}`)
    }

    const path = url.pathname.slice(new URL(rest).pathname.length)
    const method = init?.method ?? 'GET'
    databaseRequests.push({ method, path })

    switch (path) {
      case '/rpc/generation_candidate_sets_for_goal': {
        // The goal-scoped set function is `generation_candidate_sets` with the
        // sections resolved for the request's goal instead of the profile's, so
        // the double is asked as a profile whose goal is the request's.
        const { p_goal: goal, ...args } = JSON.parse(String(init?.body)) as {
          p_goal: string
        } & Record<string, unknown>

        return retrieval(goal).fetch(`${rest}/rpc/generation_candidate_sets`, {
          ...init,
          body: JSON.stringify(args),
        })
      }
      case '/rpc/generation_refusal_diagnostics':
        return retrieval(null).fetch(input, init)
      // The athlete this lane composes for has no exclusions and no history:
      // each is another lane's subject, and an empty answer is a complete one.
      case '/rpc/constraints_in_force':
      case '/rpc/conditioning_history':
      case '/workout_sessions':
      case '/load_anchors':
        return json([])
      case `/${CATALOG_VIEW}`: {
        const ids = idsOf(url.searchParams.get('id'))
        catalogReads.push(ids)

        return json(
          catalogRows(ids.filter((id) => !(configuration.missingFromCatalog ?? []).includes(id))),
        )
      }
      case `/rpc/${PERSIST_FUNCTION}`:
        return sessions.fetch(input, init)
      default:
        return json({ code: '42883', message: `nothing answers ${path}` }, 404)
    }
  }

  const retrieval = (goal: string | null) =>
    createCandidatesDouble({
      url: PROJECT_URL,
      anonKey: ANON_KEY,
      users: { [ACCESS_TOKEN]: LANE_USER_ID },
      profiles: {
        [LANE_USER_ID]: {
          goalPreset: goal,
          enabledSections: configuration.enabledSections,
          locations: [
            { id: LANE_LOCATION_ID, isDefault: true, equipment: configuration.equipment },
          ],
        },
      },
    })

  const sink: LogSink = {
    write(level, line) {
      logs.push({ level, line })
    },
  }

  const verifyToken: VerifyToken = async () => ok({ id: LANE_USER_ID })

  // `supabase/functions/generate-workout/index.ts`, with its three globals —
  // the environment, `fetch` towards PostgREST and `fetch` towards the
  // provider — as arguments.
  const handleRequest = createEdgeFunction({
    route: 'generate-workout',
    schema: generationRequestSchema,
    verifyToken,
    sink,
    handle: async ({ requestId, user, body, accessToken, logger, generationAttemptLimit }) => {
      const credentials = { url: PROJECT_URL, anonKey: ANON_KEY, accessToken, fetch: database }

      return performGeneration(
        body,
        { userId: user.id, requestId, logger },
        {
          db: createGenerationDatabase(credentials),
          catalog: createCatalogReader(credentials),
          composer: createGenerationComposer({
            apiKey: LANE_API_KEY,
            logger,
            fetch: provider,
            attemptLimit: generationAttemptLimit,
          }),
        },
      )
    },
  })

  return {
    async generate(request, attemptLimit) {
      const response = await handleRequest(
        new Request(`${PROJECT_URL}/functions/v1/generate-workout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: attemptLimit === 1 ? GENERATION_SINGLE_ATTEMPT_ACCEPT : GENERATION_ERROR_ACCEPT,
            Authorization: `Bearer ${ACCESS_TOKEN}`,
            'x-request-id': request.request_id,
          },
          body: JSON.stringify(request),
        }),
      )

      return {
        status: response.status,
        body: (await response.json()) as Record<string, unknown>,
      }
    },
    providerCalls: () => [...providerCalls],
    providerOverruns: () => overruns,
    databaseRequests: () => [...databaseRequests],
    catalogReads: () => [...catalogReads],
    writer: createSessionWriter({
      url: PROJECT_URL,
      anonKey: ANON_KEY,
      accessToken: ACCESS_TOKEN,
      fetch: database,
    }),
    sessions,
    logs: () => [...logs],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the prompt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The candidate ids a user message offers, per section, as `prompt.ts` printed
 * them: a `CANDIDATES — <section>` heading and one indented row per candidate
 * whose first field is its id.
 */
export function promptCandidates(user: string): Record<string, string[]> {
  const sections: Record<string, string[]> = {}
  let current: string[] | null = null

  for (const line of user.split('\n')) {
    const heading = /^CANDIDATES — (\w+)/.exec(line)
    if (heading) {
      current = sections[heading[1]] = []
    } else if (current !== null && line.startsWith('  ')) {
      current.push(line.trim().split(' | ')[0])
    } else {
      current = null
    }
  }

  return sections
}
