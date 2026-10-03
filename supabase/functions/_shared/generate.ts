/**
 * The mounted whole-workout generation pipeline.
 *
 * Earlier tasks delivered retrieval, prompting, model transport, validation,
 * hydration and acceptance as independently tested modules. This module owns
 * the seam between them: every read happens as the authenticated caller, the
 * goal chosen for this request scopes the candidate set, and success is the
 * exact acceptance payload Review may persist when the user presses Start.
 */

import {
  CANDIDATE_FLOOR,
  REFUSAL_DIAGNOSTICS_RPC,
  emptySections,
  failuresOf,
  noCandidatesError,
  sectionFromRow,
  supportFromRows,
  type SectionCandidates,
} from '../../../src/data/candidates.ts'
import { deprioritized } from '../../../src/data/constraint-selectors.ts'
import { fromRow as constraintFromRow, type UserConstraint } from '../../../src/data/constraints.ts'
import { Constants, type Enums, type FunctionReturns } from '../../../src/data/database.types.ts'
import {
  ErrorCode,
  createError,
  err,
  ok,
  type AppError,
  type Result,
} from '../../../src/state/errors.ts'
import type { Logger } from '../../../src/state/logger.ts'
import { conditioningDirectiveOf } from '../../../src/state/conditioning.ts'
import {
  conditioningHistorySchema,
  exerciseSetLogRowSchema,
  executionStatusSchema,
  experienceLevelSchema,
  loadAnchorListSchema,
  movementPatternSchema,
  parseBoundary,
  sessionFocusSchema,
  userConstraintRowSchema,
  workoutExerciseRowSchema,
  workoutSessionRowSchema,
  type ConditioningHistoryRow,
  type GenerationRequest,
  type GenerationSuccess,
} from '../../../src/state/schemas.ts'
import {
  createComposer,
  type Composer,
  type ComposerConfig,
} from './claude.ts'
import { hydrate, type CatalogReader } from './hydrate.ts'
import { acceptanceFor } from './persist.ts'
import {
  resolveEffectiveRequest,
  type PromptInput,
  type RecentHistory,
} from './prompt.ts'
import {
  buildTrainingHistory,
  type AnchorHistory,
} from './training-history.ts'
import { validateComposition, type Validated } from './validate.ts'

type CandidateSetRow = FunctionReturns<'generation_candidate_sets_for_goal'>[number]

// A bounded observed snapshot, not an exhaustive weekly training ledger. Sets
// never multiply the pattern count: each observed session contributes at most
// one count for a pattern. The compact ID list remains soft variety context.
const RECENT_SESSION_LIMIT = 8
const RECENT_PRESCRIPTION_LIMIT = 256
const RECENT_EXERCISE_LIMIT = 40

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const inList = (ids: readonly string[]): string =>
  `in.(${ids.map((id) => `"${id.replaceAll('"', '""')}"`).join(',')})`

/** Only transport failures and explicit server failures make soft context unknown. */
function transientContextRead(error: AppError): boolean {
  const status = error.details?.status
  if (status !== undefined) {
    return error.code === ErrorCode.PERSISTENCE_READ_FAILED && typeof status === 'number' &&
      Number.isInteger(status) && status >= 500 && status <= 599
  }
  return error.code === ErrorCode.NETWORK_SERVER_ERROR ||
    error.code === ErrorCode.NETWORK_OFFLINE || error.code === ErrorCode.NETWORK_TIMEOUT
}

export interface GenerationDatabaseConfig {
  readonly url: string
  readonly anonKey: string
  readonly accessToken: string
  readonly fetch?: typeof globalThis.fetch
  readonly logger?: Logger
}

export interface GenerationDatabase {
  candidates(
    request: GenerationRequest,
    userId: string,
  ): Promise<Result<readonly SectionCandidates[], AppError>>
  constraints(userId: string): Promise<Result<readonly UserConstraint[], AppError>>
  recentHistory(userId: string): Promise<Result<RecentHistory, AppError>>
  /** Optional for older injected doubles; the live reader always supplies it. */
  experience?(userId: string): Promise<Result<Enums<'experience_level'> | null, AppError>>
  anchors(userId: string): Promise<Result<readonly AnchorHistory[], AppError>>
  /** OVR-03: the scored conditioning blocks the density directive is read over. */
  conditioning(userId: string): Promise<Result<readonly ConditioningHistoryRow[], AppError>>
}

/** PostgREST reads through the caller's JWT, so RLS remains the authority. */
export function createGenerationDatabase(config: GenerationDatabaseConfig): GenerationDatabase {
  const base = `${config.url.replace(/\/+$/, '')}/rest/v1`
  const fetchImpl = config.fetch ?? globalThis.fetch
  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${config.accessToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }

  async function requestJson(
    path: string,
    init: RequestInit,
    source: string,
  ): Promise<Result<unknown, AppError>> {
    let response: Response
    try {
      response = await fetchImpl(`${base}${path}`, { ...init, headers })
    } catch {
      return err(createError(ErrorCode.NETWORK_SERVER_ERROR, { details: { source } }))
    }

    if (!response.ok) {
      return err(
        createError(ErrorCode.PERSISTENCE_READ_FAILED, {
          details: { source, status: response.status },
        }),
      )
    }

    try {
      return ok(await response.json())
    } catch {
      return err(createError(ErrorCode.PERSISTENCE_READ_FAILED, { details: { source } }))
    }
  }

  return {
    async candidates(request, userId) {
      const source = 'generation_candidate_sets_for_goal'
      const payload = await requestJson(
        `/rpc/${source}`,
        {
          method: 'POST',
          body: JSON.stringify({
            p_user_id: userId,
            p_goal: request.goal,
            p_focus: request.focus,
            p_location_id: request.location_id,
            p_session_id: null,
            p_floor: CANDIDATE_FLOOR,
          }),
        },
        source,
      )
      if (!payload.ok) return payload
      if (!Array.isArray(payload.value)) {
        return err(createError(ErrorCode.PERSISTENCE_READ_FAILED, { details: { source } }))
      }

      const sections: SectionCandidates[] = []
      for (const row of payload.value as CandidateSetRow[]) {
        const section = sectionFromRow(row)
        if (!section.ok) return section
        sections.push(section.value)
      }

      if (sections.length === 0) return err(noCandidatesError(sections, null))

      const empty = emptySections(sections)
      if (empty.length > 0) {
        // GR-04: the refusal says whose it is to fix. One more read, made only
        // for the sections that came back empty; if it cannot be made the
        // refusal stands, typed, with the class left `undetermined`.
        const support = await requestJson(
          `/rpc/${REFUSAL_DIAGNOSTICS_RPC}`,
          {
            method: 'POST',
            body: JSON.stringify({
              p_user_id: userId,
              p_sections: empty,
              p_location_id: request.location_id,
            }),
          },
          REFUSAL_DIAGNOSTICS_RPC,
        )

        return err(noCandidatesError(sections, support.ok ? supportFromRows(support.value) : null))
      }

      return ok(sections)
    },

    async constraints(userId) {
      const source = 'constraints_in_force'
      const payload = await requestJson(
        `/rpc/${source}`,
        {
          method: 'POST',
          body: JSON.stringify({ p_user_id: userId, p_session_id: null }),
        },
        source,
      )
      if (!payload.ok) return payload

      const rows = parseBoundary(userConstraintRowSchema.array(), payload.value, {
        code: ErrorCode.PERSISTENCE_READ_FAILED,
      })
      if (!rows.ok) return rows

      const constraints: UserConstraint[] = []
      for (const row of rows.value) {
        const constraint = constraintFromRow(row)
        if (!constraint.ok) return constraint
        constraints.push(constraint.value)
      }
      return ok(constraints)
    },

    async recentHistory(userId) {
      const source = 'workout_sessions'
      const query = new URLSearchParams({
        user_id: `eq.${userId}`,
        completed_at: 'not.is.null',
        select: 'id,session_focus',
        order: 'completed_at.desc,id.asc',
        limit: String(RECENT_SESSION_LIMIT),
      })
      const payload = await requestJson(`/${source}?${query}`, { method: 'GET' }, source)
      if (!payload.ok) return payload
      if (!Array.isArray(payload.value) || payload.value.length > RECENT_SESSION_LIMIT) {
        return err(createError(ErrorCode.PERSISTENCE_READ_FAILED, { details: { source } }))
      }

      const focuses: RecentHistory['focuses'][number][] = []
      const sessions = new Map<string, Set<string>>()
      for (const row of payload.value) {
        if (!record(row)) {
          return err(createError(ErrorCode.PERSISTENCE_READ_FAILED, { details: { source } }))
        }
        const id = workoutSessionRowSchema.shape.id.safeParse(row.id)
        const focus = sessionFocusSchema.safeParse(row.session_focus)
        if (!id.success || !focus.success || sessions.has(id.data)) {
          return err(createError(ErrorCode.PERSISTENCE_READ_FAILED, { details: { source } }))
        }
        sessions.set(id.data, new Set())
        focuses.push(focus.data)
      }

      if (sessions.size === 0) return ok({ focuses, patterns: [], exerciseIds: [] })

      // Read only actual set engagement. `session_performed` also includes
      // unlogged active prescriptions and drops superseded ones, so it cannot
      // answer this question reliably. The log FK retains the exact historical
      // prescription after a swap. No measurements, weights or notes are read.
      // A timer-only block score does not prove which members were performed;
      // without an exercise log those members intentionally remain unobserved.
      const performedSource = 'workout_exercises'
      const performedQuery = new URLSearchParams({
        select: 'id,exercise_id,execution_status,workout_blocks!inner(workout_sections!inner(session_id)),exercise_set_logs!inner(id)',
        'workout_blocks.workout_sections.session_id': inList([...sessions.keys()]),
        execution_status: 'neq.skipped',
        'exercise_set_logs.limit': '1',
        'exercise_set_logs.order': 'id.asc',
        order: 'id.asc',
        limit: String(RECENT_PRESCRIPTION_LIMIT),
      })
      const performed = await requestJson(
        `/${performedSource}?${performedQuery}`, { method: 'GET' }, performedSource,
      )
      if (!performed.ok) {
        if (!transientContextRead(performed.error)) return performed
        config.logger?.warn('generation soft history unavailable; using known focuses only', {
          source: performedSource, code: performed.error.code,
        })
        return ok({ focuses, patterns: [], exerciseIds: [] })
      }
      const failedPerformed = () => err(createError(ErrorCode.PERSISTENCE_READ_FAILED, {
        details: { source: performedSource },
      }))
      if (!Array.isArray(performed.value) || performed.value.length > RECENT_PRESCRIPTION_LIMIT) {
        return failedPerformed()
      }
      for (const row of performed.value) {
        if (!record(row) || !record(row.workout_blocks) ||
          !record(row.workout_blocks.workout_sections) || !Array.isArray(row.exercise_set_logs) ||
          row.exercise_set_logs.length > 1) return failedPerformed()
        const id = workoutExerciseRowSchema.shape.id.safeParse(row.id)
        const exercise = workoutExerciseRowSchema.shape.exercise_id.safeParse(row.exercise_id)
        const status = executionStatusSchema.safeParse(row.execution_status)
        const session = workoutSessionRowSchema.shape.id.safeParse(
          row.workout_blocks.workout_sections.session_id,
        )
        if (!id.success || !exercise.success || !status.success || !session.success ||
          !sessions.has(session.data)) return failedPerformed()
        for (const log of row.exercise_set_logs) {
          if (!record(log) || !exerciseSetLogRowSchema.shape.id.safeParse(log.id).success) {
            return failedPerformed()
          }
        }
        // Defend the projection as well as asking SQL to filter it. Absence of
        // logs is not evidence of training, and an explicit skip is not a set.
        if (status.data !== 'skipped' && row.exercise_set_logs.length > 0) {
          sessions.get(session.data)?.add(exercise.data)
        }
      }

      const ids = [...new Set([...sessions.values()].flatMap((set) => [...set]))]
      if (ids.length === 0) return ok({ focuses, patterns: [], exerciseIds: [] })
      const patternSource = 'exercise_catalog'
      const patternQuery = new URLSearchParams({
        select: 'id,movement_patterns',
        id: inList(ids),
        order: 'id.asc',
        limit: String(RECENT_PRESCRIPTION_LIMIT),
      })
      const catalog = await requestJson(`/${patternSource}?${patternQuery}`, { method: 'GET' }, patternSource)
      if (!catalog.ok) {
        if (!transientContextRead(catalog.error)) return catalog
        config.logger?.warn('generation soft history unavailable; using known focuses only', {
          source: patternSource, code: catalog.error.code,
        })
        return ok({ focuses, patterns: [], exerciseIds: [] })
      }
      const failedCatalog = () => err(createError(ErrorCode.PERSISTENCE_READ_FAILED, {
        details: { source: patternSource },
      }))
      if (!Array.isArray(catalog.value) || catalog.value.length > ids.length) return failedCatalog()
      const patternsById = new Map<string, Enums<'movement_pattern'>[]>()
      for (const row of catalog.value) {
        if (!record(row)) return failedCatalog()
        const id = workoutExerciseRowSchema.shape.exercise_id.safeParse(row.id)
        const patterns = movementPatternSchema.array().max(Constants.public.Enums.movement_pattern.length)
          .safeParse(row.movement_patterns)
        if (!id.success || !patterns.success || !ids.includes(id.data) || patternsById.has(id.data)) {
          return failedCatalog()
        }
        patternsById.set(id.data, patterns.data)
      }
      if (patternsById.size !== ids.length) return failedCatalog()

      const counts = new Map<Enums<'movement_pattern'>, number>()
      const exerciseIds = new Set<string>()
      for (const exercises of sessions.values()) {
        const sessionPatterns = new Set<Enums<'movement_pattern'>>()
        for (const id of [...exercises].sort()) {
          if (exerciseIds.size < RECENT_EXERCISE_LIMIT) exerciseIds.add(id)
          for (const pattern of patternsById.get(id) ?? []) sessionPatterns.add(pattern)
        }
        for (const pattern of sessionPatterns) counts.set(pattern, (counts.get(pattern) ?? 0) + 1)
      }
      return ok({
        focuses,
        patterns: Constants.public.Enums.movement_pattern
          .filter((pattern) => counts.has(pattern))
          .map((pattern) => ({ pattern, count: counts.get(pattern) ?? 0 })),
        exerciseIds: [...exerciseIds],
      })
    },

    async experience(userId) {
      const source = 'profiles'
      const query = new URLSearchParams({
        id: `eq.${userId}`,
        select: 'experience_level',
        limit: '1',
      })
      const payload = await requestJson(`/${source}?${query}`, { method: 'GET' }, source)
      if (!payload.ok) return payload
      if (!Array.isArray(payload.value) || payload.value.length > 1 ||
        (payload.value.length === 1 && !record(payload.value[0]))) {
        return err(createError(ErrorCode.PERSISTENCE_READ_FAILED, { details: { source } }))
      }
      if (payload.value.length === 0) return ok(null)
      const experience = experienceLevelSchema.nullable().safeParse(payload.value[0].experience_level)
      return experience.success
        ? ok(experience.data)
        : err(createError(ErrorCode.PERSISTENCE_READ_FAILED, { details: { source } }))
    },

    async anchors(userId) {
      const source = 'load_anchors'
      const query = new URLSearchParams({
        user_id: `eq.${userId}`,
        select: '*',
        order: 'last_session_date.desc',
        limit: '40',
      })
      const payload = await requestJson(`/${source}?${query}`, { method: 'GET' }, source)
      if (!payload.ok) return payload

      const rows = parseBoundary(loadAnchorListSchema, payload.value, {
        code: ErrorCode.PERSISTENCE_READ_FAILED,
      })
      if (!rows.ok) return rows

      return ok(rows.value.map((anchor) => ({ anchor })))
    },

    async conditioning(userId) {
      const source = 'conditioning_history'
      const payload = await requestJson(
        `/rpc/${source}`,
        {
          method: 'POST',
          // The function's own default window, as the client's read leaves it:
          // one bound for both consumers, documented where it is declared.
          body: JSON.stringify({ p_user_id: userId }),
        },
        source,
      )
      if (!payload.ok) return payload

      return parseBoundary(conditioningHistorySchema, payload.value, {
        code: ErrorCode.PERSISTENCE_READ_FAILED,
      })
    },
  }
}

export type GenerationComposerFactory = (options: {
  readonly validate: ComposerConfig<Validated>['validate']
}) => Composer<Validated>

export function createGenerationComposer(
  config: Omit<ComposerConfig<Validated>, 'validate'>,
): GenerationComposerFactory {
  return ({ validate }) => createComposer({ ...config, validate })
}

export interface GenerationDependencies {
  readonly db: GenerationDatabase
  readonly catalog: CatalogReader
  readonly composer: GenerationComposerFactory
}

export interface GenerationContext {
  readonly userId: string
  readonly requestId: string
  readonly logger?: Logger
  /** Injected in tests; `Date.now` otherwise. Only the elapsed time is logged. */
  readonly now?: () => number
}

/** Candidates → context → prompt → model → validation → hydration → Review. */
export async function performGeneration(
  request: GenerationRequest,
  context: GenerationContext,
  deps: GenerationDependencies,
): Promise<Result<Omit<GenerationSuccess, 'requestId'>, AppError>> {
  const { requestId, logger, userId } = context
  const now = context.now ?? (() => Date.now())
  const startedAt = now()

  const [candidateResult, constraintResult, historyResult, anchorResult, conditioningResult, experienceResult] =
    await Promise.all([
      deps.db.candidates(request, userId),
      deps.db.constraints(userId),
      deps.db.recentHistory(userId),
      deps.db.anchors(userId),
      deps.db.conditioning(userId),
      deps.db.experience?.(userId) ?? Promise.resolve(ok(null)),
    ])

  // Eligibility is settled before anything is composed (GR-04 / REQ-008): a
  // refusal returns here, above the prompt and above the composer.
  if (!candidateResult.ok) {
    if (candidateResult.error.code === ErrorCode.GENERATION_NO_CANDIDATES) {
      // The whole of the diagnostic: section names and class names. Nothing of
      // the request's notes, the caller, or the credentials it arrived with.
      logger?.warn('generation refused: eligibility', {
        requestId,
        code: candidateResult.error.code,
        failures: failuresOf(candidateResult.error),
      })
    }
    return err({ ...candidateResult.error, requestId })
  }
  if (!constraintResult.ok) return err({ ...constraintResult.error, requestId })
  if (!historyResult.ok) return err({ ...historyResult.error, requestId })
  if (!anchorResult.ok) return err({ ...anchorResult.error, requestId })
  if (!experienceResult.ok) {
    if (!transientContextRead(experienceResult.error)) {
      return err({ ...experienceResult.error, requestId })
    }
    logger?.warn('generation saved experience unavailable; omitting unknown context', {
      source: 'profiles', code: experienceResult.error.code,
    })
  }

  // OVR-03's density directive, decided here in code and never by the model. A
  // failed read resolves to no directive rather than failing the workout: the
  // nudge is a refinement, and an unread history is not a `hold`.
  if (!conditioningResult.ok) {
    logger?.warn('conditioning history unavailable; no density directive', {
      requestId,
      code: conditioningResult.error.code,
    })
  }
  const conditioning = conditioningResult.ok
    ? conditioningDirectiveOf(conditioningResult.value)
    : null

  const effective = resolveEffectiveRequest({
    requestId,
    goal: request.goal,
    focus: request.focus,
    requestedIntensity: request.requested_intensity,
    durationTargetMins: request.requested_duration_mins,
    // The goal-scoped RPC is the database's answer to enabled/effective
    // sections. Using those rows keeps the prompt and candidate boundary exact.
    enabledSections: candidateResult.value.map((section) => section.section),
  })

  const input: PromptInput = {
    request: effective,
    sections: candidateResult.value,
    history: historyResult.value,
    ...(experienceResult.ok ? { experience: experienceResult.value } : {}),
    preferences: {
      constraints: deprioritized(constraintResult.value),
      notes: request.notes,
    },
    training: buildTrainingHistory({
      anchors: anchorResult.value,
      today: request.date,
      deload: request.deload,
      conditioningTrend: conditioning?.conditioning_trend ?? null,
    }),
  }

  logger?.info('generation context resolved', {
    requestId,
    // The request's own values, beside the counts they scoped: a retrieval that
    // answered for another goal or focus is diagnosable from this one line. The
    // notes are deliberately absent — they are the athlete's prose (CORE-02).
    goal: request.goal,
    focus: request.focus,
    sections: input.sections.length,
    candidates: input.sections.reduce((total, section) => total + section.candidates.length, 0),
    history: input.history.focuses.length,
    anchors: input.training.anchors.length,
    conditioningTrend: conditioning?.conditioning_trend ?? null,
    conditioningReason: conditioning?.reason ?? null,
    elapsedMs: now() - startedAt,
  })

  const composed = await deps
    .composer({
      validate: (workout, promptInput) =>
        validateComposition(workout, promptInput, { logger, requestId }),
    })
    .compose(input, requestId)
  if (!composed.ok) return composed

  if (composed.value.validation === null) {
    return err(createError(ErrorCode.GENERATION_FAILED, { requestId }))
  }

  const hydrated = await hydrate(composed.value.validation, deps.catalog, {
    logger,
    requestId,
  })
  if (!hydrated.ok) return hydrated

  const acceptance = acceptanceFor(hydrated.value, input, {
    date: request.date,
    locationId: request.location_id,
    computedDurationMins: composed.value.validation.duration.minutes,
    isDeload: request.deload,
  })
  if (!acceptance.ok) return err({ ...acceptance.error, requestId })

  logger?.info('generation complete', {
    requestId,
    goal: acceptance.value.goal_preset,
    focus: acceptance.value.session_focus,
    attempts: composed.value.attempts,
    promptBytes: composed.value.measurement.totalBytes,
    // Not `inputTokens`/`outputTokens`: CORE-02's denylist masks any key
    // containing `token`, and a masked count diagnoses nothing.
    usage: {
      input: composed.value.usage.inputTokens,
      output: composed.value.usage.outputTokens,
    },
    elapsedMs: now() - startedAt,
  })

  return ok({ acceptance: acceptance.value })
}
