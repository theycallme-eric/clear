/**
 * GEN-02c — the deterministic half after the model, part three: persistence.
 *
 * GENERATION_CONTRACT §6 ends with a sentence this module is the other side of:
 * "a workout that validates is a workout that can be persisted. Failing at the
 * boundary beats failing at the INSERT." Validation and hydration have run, so
 * what is left is writing it down — and the requirement states how, in two
 * clauses that turn out to be one design:
 *
 *   * **Sessions → sections → blocks → exercises in one transaction; a failure
 *     leaves no partial workout.** The transaction is not assembled here.
 *     `persist_session(p_user_id, p_session)` (SES-01a,
 *     `supabase/migrations/20260921000005_session_lifecycle.sql` §5) writes all
 *     four levels in one function, and PostgREST runs one request in one
 *     transaction — so this module's whole contribution to atomicity is that it
 *     makes **exactly one request** and never takes a second look at a failure.
 *     Four inserts issued from here could not be made atomic by any amount of
 *     care, which is why the function exists; a retry could not be made safe
 *     either, because the session id is minted server-side and a retried
 *     acceptance would persist the same workout twice rather than the same
 *     workout once.
 *   * **`prompt_version` and `contract_version` stamped on every session.**
 *     They are read from the `HydratedWorkout` rather than from `prompt.ts`'s
 *     constants, so the session records the versions this workout was composed
 *     under even if a deployment moved on between the model call and the write.
 *     Both columns are NOT NULL and `sessionAcceptanceSchema` requires them
 *     non-blank, so an unstamped session cannot be built, let alone written.
 *
 * Two shapes it deliberately does not have. It declares no schema —
 * `sessionAcceptanceSchema` and `sessionSnapshotSchema` are CORE-03's, in
 * `src/state/schemas.ts` with every other one — and it does not reach the
 * database through `src/data/sessions.ts`, which is the browser's client and
 * whose extensionless imports do not resolve in Deno. The payload it sends is
 * byte-for-byte the payload that client sends, because both parse it with the
 * same schema before sending it.
 *
 * What of hydration reaches the row, and what does not: the catalog facts do
 * not. A name, a cue and a muscle are `exercise_catalog`'s and stay there —
 * `workout_exercises` stores the prescription and the exercise id it points at
 * (DATA_MODEL §6). Hydration's facts are for the answer the caller receives,
 * and re-writing them into the session would be the drift §8 exists to prevent.
 */

import {
  ErrorCode,
  createError,
  err,
  type AppError,
  type Result,
} from '../../../src/state/errors.ts'
import type { Logger } from '../../../src/state/logger.ts'
import {
  parseBoundary,
  sessionAcceptanceSchema,
  sessionSnapshotSchema,
  type GenerationOutput,
  type SessionAcceptance,
  type SessionSnapshot,
} from '../../../src/state/schemas.ts'
import type { HydratedWorkout } from './hydrate.ts'
import type { EffectiveRequest, PromptInput } from './prompt.ts'

// ─────────────────────────────────────────────────────────────────────────────
// The payload
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The facts about a session that no part of composition knows.
 *
 * Everything else the session records is read from the `PromptInput` the
 * workout was composed from, because a session should record what it was
 * actually composed against rather than what a second caller believed at write
 * time. These five cannot come from there:
 */
export interface SessionFacts {
  /**
   * The training day, as the user's own calendar sees it. Only the caller knows
   * which zone draws that boundary — the same reason SES-01c derives a streak in
   * the browser rather than in SQL — so it is an argument and never `now()`.
   */
  readonly date: string
  /** Null when the location was deleted between generating and accepting. */
  readonly locationId: string | null
  /**
   * What generation aimed at, when a clamp moved it. Omitted is the common case
   * and means the target was the request's own: GEN-04 owns the duration
   * cascade, and defaulting to the requested target here is what keeps this
   * module from inventing a second answer to it.
   */
  readonly effectiveDurationTargetMins?: number
  /** GEN-06's computed minutes. Null until GEN-06 exists to compute them. */
  readonly computedDurationMins: number | null
  /**
   * Why the requested and effective values differ. Omitted derives it from the
   * request; an explicit `null` records nothing, which is how a caller that
   * knows better says so.
   */
  readonly adjustmentReason?: string | null
}

/**
 * `adjustment_reason`, from the clamp that can be seen in the request itself.
 * The column exists because "a session that was clamped should say so rather
 * than look like a request nobody made" (`prompt.ts`), and the numbers are the
 * request's own rather than a rule restated: whichever clamp moved the
 * intensity, this sentence is true of it.
 */
export function adjustmentReasonFor(request: EffectiveRequest): string | null {
  if (request.effectiveIntensity === request.requestedIntensity) return null

  return (
    `Intensity clamped from ${request.requestedIntensity} to ` +
    `${request.effectiveIntensity} for the ${request.goal} preset.`
  )
}

/**
 * A hydrated workout, back in the contract's own §5 shape — which is what
 * `persist_session` reads, because the session's rows are the prescription and
 * not the catalog's facts about it.
 *
 * `estimated_duration_mins` is carried here, and it is the one place in the
 * write path that reads it: `generationOutputSchema` requires it, and sending a
 * number the model did not write would be worse than sending the one it did.
 * What matters for D5 is what happens to it next, and the answer is nothing —
 * `persist_session` never mentions the field, so no column receives it. The
 * session's minutes are the request's (`effective_duration_target_mins`) and
 * GEN-06's (`computed_duration_mins`).
 */
export function composedWorkout(hydrated: HydratedWorkout): GenerationOutput {
  return {
    title: hydrated.title,
    overview: hydrated.overview,
    sections: hydrated.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) => ({
        ...block,
        // The model's own object, as validated. Hydration added facts beside a
        // prescription and changed nothing inside one, which is what makes
        // this projection lossless in the direction that matters.
        exercises: block.exercises.map((exercise) => exercise.prescription),
      })),
    })),
    estimated_duration_mins: hydrated.diagnostics.modelEstimateMins,
  }
}

/**
 * The acceptance payload, parsed.
 *
 * Parsed rather than trusted, for the reason `src/data/sessions.ts` gives: the
 * alternative is a CHECK constraint aborting a transaction that has already
 * written half a workout. That is still atomic, and it still says nothing a log
 * or a caller can act on. `sessionAcceptanceSchema` is strict, so a key this
 * function invented would be refused here rather than silently dropped by a
 * function that does not read it.
 *
 * The one field composition cannot guarantee is `session_focus`: the column is
 * NOT NULL while `RequestedSession.focus` admits null, since a session with no
 * focus of the day is a legitimate request to *compose*. It is not a session
 * that can be stored, and the schema is what says so — with the path, rather
 * than a hand-written branch that would drift from the column.
 */
export function acceptanceFor(
  hydrated: HydratedWorkout,
  input: PromptInput,
  facts: SessionFacts,
): Result<SessionAcceptance, AppError> {
  const { request } = input

  return parseBoundary(
    sessionAcceptanceSchema,
    {
      date: facts.date,
      location_id: facts.locationId,
      session_focus: request.focus,
      // Snapshotted: the user's goal is a preference and can change, and what
      // this workout was composed for cannot.
      goal_preset: request.goal,
      requested_duration_mins: request.durationTargetMins,
      effective_duration_target_mins:
        facts.effectiveDurationTargetMins ?? request.durationTargetMins,
      computed_duration_mins: facts.computedDurationMins,
      requested_intensity: request.requestedIntensity,
      effective_intensity: request.effectiveIntensity,
      adjustment_reason:
        facts.adjustmentReason === undefined
          ? adjustmentReasonFor(request)
          : facts.adjustmentReason,
      // The free text the user gave generation. Context only — a deterministic
      // exclusion is a `user_constraints` row and never prose (DATA-05).
      generation_notes: input.preferences.notes,
      // §10's two versions, from the workout rather than from the constants.
      prompt_version: hydrated.promptVersion,
      contract_version: hydrated.contractVersion,
      workout: composedWorkout(hydrated),
    },
    { code: ErrorCode.VALIDATION_CONSTRAINT, requestId: request.requestId },
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The write
// ─────────────────────────────────────────────────────────────────────────────

/** The one function that writes a generated workout (SES-01a §5). */
export const PERSIST_FUNCTION = 'persist_session'

export interface SessionWriterConfig {
  /** The project URL — `SUPABASE_URL`, injected into every edge function. */
  readonly url: string
  /** The public anon key — `SUPABASE_ANON_KEY`, also injected. */
  readonly anonKey: string
  /**
   * The caller's access token. `persist_session` is `security invoker` and
   * `workout_sessions_insert_own` refuses a row whose owner is not the caller,
   * so the write happens as the user who asked for the workout. The
   * service-role key is never used here: writing your own session needs no
   * privilege you do not already hold, and a key that can write anyone's row
   * would make `p_user_id` a way around RLS rather than a symmetry with
   * GEN-02a.
   */
  readonly accessToken: string
  /** Injected in tests; the global `fetch` otherwise. */
  readonly fetch?: typeof globalThis.fetch
}

/** An acceptance payload in, the persisted structure out. One round trip. */
export type SessionWriter = (
  userId: string,
  acceptance: SessionAcceptance,
) => Promise<Result<SessionSnapshot, AppError>>

/**
 * PostgREST by hand and over `fetch`, like `hydrate.ts`'s catalog read and for
 * the same reason. One POST to one function: there is no code path here that
 * writes a second time, which is how "one transaction" is a property of the
 * module rather than a comment in it.
 *
 * The answer is `session_snapshot`'s — the structure as the database now holds
 * it — so a caller renders what was written rather than what it hoped was.
 */
export function createSessionWriter(config: SessionWriterConfig): SessionWriter {
  const endpoint = `${config.url.replace(/\/+$/, '')}/rest/v1/rpc/${PERSIST_FUNCTION}`
  const fetchImpl = config.fetch ?? globalThis.fetch

  return async function write(userId, acceptance) {
    let response: Response
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ p_user_id: userId, p_session: acceptance }),
      })
    } catch {
      // Not the thrown error's message: a transport error can quote the
      // request it failed on, headers and all (D3).
      return err(createError(ErrorCode.NETWORK_SERVER_ERROR))
    }

    if (!response.ok) return err(await writeFailure(response))

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return err(readFailure({ reason: 'body' }))
    }

    // `persist_session` returns its own snapshot, so SQL NULL means the row it
    // just wrote cannot be read back. The workout is whole either way — this is
    // a failed read of a committed transaction, never a partial write — and
    // reporting it as a read failure is what keeps those two apart.
    if (payload === null) return err(readFailure({ reason: 'null' }))

    return parseBoundary(sessionSnapshotSchema, payload, {
      code: ErrorCode.PERSISTENCE_READ_FAILED,
    })
  }
}

function readFailure(details: Record<string, unknown>): AppError {
  return createError(ErrorCode.PERSISTENCE_READ_FAILED, {
    details: { fn: PERSIST_FUNCTION, ...details },
  })
}

/**
 * HTTP status → the error taxonomy, the same reading `src/data/supabase.ts`
 * gives it, because one refusal must not mean two things depending on which
 * runtime asked. A row refused by RLS is not a network problem, and a CHECK
 * constraint refusing a prescription is not a server error.
 */
async function writeFailure(response: Response): Promise<AppError> {
  const details: Record<string, unknown> = {
    fn: PERSIST_FUNCTION,
    status: response.status,
  }

  // PostgREST names the constraint that refused a row. Useful in a log, never
  // in a user-facing message — `createError` supplies that from the code.
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'code' in body) {
      details.pgCode = (body as { code?: unknown }).code
    }
  } catch {
    // A body that is not JSON tells us nothing the status has not already.
  }

  if (response.status === 401 || response.status === 403) {
    return createError(ErrorCode.AUTH_UNAUTHORIZED, { details })
  }
  if (response.status === 409) {
    return createError(ErrorCode.PERSISTENCE_CONFLICT, { details })
  }
  if (response.status === 429) {
    return createError(ErrorCode.NETWORK_RATE_LIMITED, { details })
  }
  // 400 is a CHECK constraint refusing a row; 422 is `persist_session`'s own
  // `PT422`, raised for a payload with no workout in it. Both aborted the
  // transaction, and both left nothing behind.
  if (response.status === 400 || response.status === 422) {
    return createError(ErrorCode.VALIDATION_CONSTRAINT, { details })
  }
  if (response.status >= 500) {
    return createError(ErrorCode.NETWORK_SERVER_ERROR, { details })
  }

  return createError(ErrorCode.PERSISTENCE_WRITE_FAILED, { details })
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────────

/** Who the session belongs to, what it was composed from, and today. */
export interface SessionRequest {
  /**
   * The owner. This is the authenticated user the envelope resolved, never a
   * field from the request body: `persist_session` passes it to an INSERT that
   * `workout_sessions_insert_own` refuses unless it is the caller's own id, so
   * somebody else's id fails the write rather than writing to their history.
   */
  readonly userId: string
  /**
   * The input the workout was composed from — the effective request the session
   * records, and the notes the user gave generation. The same object validation
   * checked the composition against, so the row cannot describe a request the
   * model never saw.
   */
  readonly input: PromptInput
  readonly facts: SessionFacts
}

export interface PersistOptions {
  /** The envelope's per-request logger, where there is one. */
  readonly logger?: Logger
  readonly requestId?: string
}

/**
 * §6–§8's last step: the validated, hydrated workout as rows.
 *
 * The `HydratedWorkout` argument is the ordering rule, the same way
 * `hydrateWorkout` takes a `Validated`: only `hydrateWorkout` produces one, and
 * only `validateComposition` produces what that takes, so persisting a
 * parsed-but-unchecked response does not type-check. The chain is the
 * compiler's rather than a convention three modules agree to keep.
 *
 * Exactly one write, and no retry after a failure. A generation can be retried
 * — that is `claude.ts`'s one corrected attempt — but a *write* cannot: the
 * session id is minted by the database, so a second attempt after an ambiguous
 * failure cannot tell "not written" from "written and the answer was lost", and
 * would leave the user with two copies of one workout in the half of those
 * cases where it guessed wrong.
 */
export async function persist(
  hydrated: HydratedWorkout,
  session: SessionRequest,
  write: SessionWriter,
  options: PersistOptions = {},
): Promise<Result<SessionSnapshot, AppError>> {
  const acceptance = acceptanceFor(hydrated, session.input, session.facts)
  if (!acceptance.ok) {
    options.logger?.error('acceptance payload refused', {
      requestId: options.requestId,
      code: acceptance.error.code,
    })

    return acceptance
  }

  const stored = await write(session.userId, acceptance.value)
  if (!stored.ok) {
    options.logger?.error('session not persisted', {
      requestId: options.requestId,
      code: stored.error.code,
    })

    return stored
  }

  options.logger?.info('session persisted', {
    requestId: options.requestId,
    // Counts, versions and the state it was written in. Never a title, an
    // exercise id or an id of the row itself: what a user was prescribed is
    // not a log line (D3).
    state: stored.value.state,
    sections: stored.value.sections.length,
    blocks: stored.value.sections.reduce((total, section) => total + section.blocks.length, 0),
    exercises: stored.value.sections.reduce(
      (total, section) =>
        total +
        section.blocks.reduce((blockTotal, block) => blockTotal + block.exercises.length, 0),
      0,
    ),
    promptVersion: hydrated.promptVersion,
    contractVersion: hydrated.contractVersion,
  })

  return stored
}
