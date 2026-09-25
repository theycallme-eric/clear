/**
 * REV-02 — single-slot regeneration, on GEN-02's contract.
 *
 * A swap is generation with a narrower scope, and the value of this requirement
 * is in how much of it is *not* new: the same candidate query, the same system
 * prompt, the same output contract, the same hard checks, the same hydration,
 * the same envelope. What this module adds is three things and no more.
 *
 *   1. **Scope.** Which slot is being replaced, which block it belongs to, and
 *      what is staying — all read back from the session rather than sent by the
 *      client. A request that carried its own section, equipment or exclusions
 *      could ask for a replacement the user's own constraints forbid; reading
 *      them here is what makes "the same candidate query as generation" true
 *      rather than claimed (`GENERATION_CONTRACT.md` §3, §11).
 *   2. **A directive and the checks that hold it to its word.**
 *      `exercise-swap.md` §"Prompt Strategy" tells the model exactly what is
 *      being replaced and what it must not duplicate; `checkSwapShape` rejects
 *      a response that came back wider than the slot — a second section, a
 *      second block, a different structure type, a different clock. A rejection
 *      costs one corrected retry, counted by `claude.ts`, because §6's retry
 *      budget is the contract's and a swap does not get its own.
 *   3. **Persistence as a revision.** `swap_session_exercise` for one slot and
 *      `swap_session_block` for a unit: append a row carrying the same
 *      `slot_id`, supersede its predecessor, never write the prescription in
 *      place. That is defect D6, and the reason the database owns the write is
 *      that a unit swap must be one transaction — three of four members revised
 *      is a block composed for a pair that is gone.
 *
 * What the model is *not* asked for: the block's structure. `structure_type`,
 * `rounds`, the timer and the rest are copied into the directive as facts and
 * checked on the way back, and no code here writes `workout_blocks` at all —
 * "preserving the block's structure and timer" is a table nothing touches.
 *
 * One limitation, recorded rather than hidden: the prompt's TRAINING HISTORY
 * block is built empty for a swap. OVR-02's anchors are read by the generation
 * handler that composes a whole session; one replacement slot is composed
 * against the block it has to fit, and re-deriving the session's directive here
 * would be a second answer to a question the session already answered.
 */

import {
  CANDIDATE_FLOOR,
  sectionFromRow,
  type SectionCandidates,
  type SectionType,
  type SessionFocus,
} from '../../../src/data/candidates.ts'
import { deprioritized } from '../../../src/data/constraint-selectors.ts'
import { fromRow as constraintFromRow, type UserConstraint } from '../../../src/data/constraints.ts'
import type { Enums, FunctionReturns } from '../../../src/data/database.types.ts'
import {
  ErrorCode,
  createError,
  err,
  ok,
  type AppError,
  type Result,
} from '../../../src/state/errors.ts'
import type { Logger } from '../../../src/state/logger.ts'
import {
  blockSwapResultSchema,
  parseBoundary,
  sessionSnapshotSchema,
  sessionTransitionSchema,
  userConstraintRowSchema,
  type BlockSwapResult,
  type GenerationOutput,
  type Prescription,
  type SessionSnapshot,
  type SessionTransition,
  type SwapMode,
  type SwapRequest,
  type SwapRevision,
  type SwapSuccess,
  type WorkoutBlockRow,
  type WorkoutExerciseRow,
  type WorkoutSectionRow,
  type WorkoutSessionRow,
} from '../../../src/state/schemas.ts'
import {
  GenerationFailure,
  createComposer,
  type AttemptFailure,
  type Composer,
  type ComposerConfig,
  type CompositionValidator,
} from './claude.ts'
import { hydrate, type CatalogReader, type HydratedExercise } from './hydrate.ts'
import {
  SYSTEM_PROMPT,
  assemblePrompt,
  measurePrompt,
  type AssembledPrompt,
  type EffectiveRequest,
  type PromptInput,
} from './prompt.ts'
import { buildTrainingHistory } from './training-history.ts'
import { validateComposition, type Validated } from './validate.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Scope — what is being replaced, and what is staying
// ─────────────────────────────────────────────────────────────────────────────

/** The two session states a prescription may still be revised in. */
const REVISABLE_STATES: readonly Enums<'session_state'>[] = ['prescribed', 'active']

/**
 * One swap, resolved against the session it belongs to. Everything here was
 * read from `session_snapshot`; nothing was taken from the request but the ids.
 */
export interface SwapScope {
  readonly mode: SwapMode
  readonly session: WorkoutSessionRow
  readonly section: WorkoutSectionRow
  readonly block: WorkoutBlockRow
  /** Every active member of the block, in the order the block holds them. */
  readonly members: readonly WorkoutExerciseRow[]
  /** The members this swap replaces: one for `single`, all of them for `unit`. */
  readonly outgoing: readonly WorkoutExerciseRow[]
  /** Members of the same block that are staying — empty for a unit swap. */
  readonly keptInBlock: readonly WorkoutExerciseRow[]
  /** Everything else active in the session. Context, never replaced. */
  readonly keptInSession: readonly WorkoutExerciseRow[]
}

/**
 * The slot the request names, or a typed refusal.
 *
 * "Not in this session" and "not a session you can see" are one answer —
 * `session_snapshot` returns null for both, and RLS is why the second one is
 * indistinguishable from the first on purpose.
 */
export function resolveSwapScope(
  snapshot: SessionSnapshot,
  request: SwapRequest,
): Result<SwapScope, AppError> {
  const located = locate(snapshot, request)
  if (!located.ok) return located

  const { section, block, members } = located.value

  if (!REVISABLE_STATES.includes(snapshot.state)) {
    // A completed or abandoned session is a record of what happened, and what
    // happened does not get revised (DATA_MODEL §7). The database refuses this
    // too; refusing here is what turns it into a typed 409 instead of a write
    // that answers `invalid_transition` after a model call has been paid for.
    return err(
      createError(ErrorCode.SESSION_INVALID_TRANSITION, {
        details: { event: 'swap', state: snapshot.state },
      }),
    )
  }

  const outgoing =
    request.mode === 'single'
      ? members.filter((member) => member.id === request.workout_exercise_id)
      : members

  if (outgoing.length === 0) {
    return err(
      createError(ErrorCode.PERSISTENCE_NOT_FOUND, {
        details: { swap: request.mode, block: block.id },
      }),
    )
  }

  const replaced = new Set(outgoing.map((member) => member.id))

  return ok({
    mode: request.mode,
    session: snapshot.session,
    section,
    block,
    members,
    outgoing,
    keptInBlock: members.filter((member) => !replaced.has(member.id)),
    keptInSession: activeExercises(snapshot).filter(
      (member) => !replaced.has(member.id) && member.block_id !== block.id,
    ),
  })
}

interface Located {
  readonly section: WorkoutSectionRow
  readonly block: WorkoutBlockRow
  readonly members: readonly WorkoutExerciseRow[]
}

function locate(snapshot: SessionSnapshot, request: SwapRequest): Result<Located, AppError> {
  for (const section of snapshot.sections) {
    for (const block of section.blocks) {
      const members = block.exercises.map((entry) => entry.exercise)
      const found =
        request.mode === 'single'
          ? members.some((member) => member.id === request.workout_exercise_id)
          : block.block.id === request.block_id

      if (found) return ok({ section: section.section, block: block.block, members })
    }
  }

  return err(
    createError(ErrorCode.PERSISTENCE_NOT_FOUND, {
      details: {
        swap: request.mode,
        // The id that was not found, which is the caller's own and safe to
        // echo. Never the session's contents.
        target:
          request.mode === 'single' ? request.workout_exercise_id : request.block_id,
      },
    }),
  )
}

function activeExercises(snapshot: SessionSnapshot): readonly WorkoutExerciseRow[] {
  return snapshot.sections.flatMap((section) =>
    section.blocks.flatMap((block) => block.exercises.map((entry) => entry.exercise)),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The prompt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §4's effective request, for one slot. Both intensities and the duration
 * target are the session's *stored* ones rather than re-derived: the clamp
 * happened when the session was composed, and a swap that re-resolved it could
 * quietly compose against a different request than the workout around it.
 *
 * `enabledSections` is the slot's section and nothing else. That is the whole
 * of "scoped to the slot's section" — the candidate set is retrieved for it,
 * and GEN-02c's check 3 rejects any other section on the way back.
 */
export function swapEffectiveRequest(scope: SwapScope, requestId: string): EffectiveRequest {
  const sections: readonly SectionType[] = [scope.section.section_type]

  return {
    requestId,
    // A session composed before a goal was stored reads as `balanced`, which is
    // the ratio set the review screen shows it under. Only the soft
    // relationship observation depends on it.
    goal: scope.session.goal_preset ?? 'balanced',
    focus: scope.session.session_focus,
    requestedIntensity: scope.session.requested_intensity,
    durationTargetMins: scope.session.effective_duration_target_mins,
    enabledSections: sections,
    effectiveIntensity: scope.session.effective_intensity,
    effectiveSections: sections,
  }
}

/** Everything the swap's user message is assembled from. */
export function swapPromptInput(
  scope: SwapScope,
  candidates: SectionCandidates,
  constraints: readonly UserConstraint[],
  today: string,
): PromptInput {
  return {
    request: swapEffectiveRequest(scope, scope.session.id),
    sections: [candidates],
    history: {
      focuses: [],
      patterns: [],
      // "Avoid repeating" is this session's own actives for a swap: the one
      // thing a replacement must not be is something already in the workout.
      exerciseIds: [...scope.keptInBlock, ...scope.keptInSession].map(
        (member) => member.exercise_id,
      ),
    },
    preferences: {
      constraints: deprioritized(constraints),
      notes: scope.session.generation_notes,
    },
    training: buildTrainingHistory({ anchors: [], today }),
  }
}

const names = (members: readonly WorkoutExerciseRow[]) =>
  members.length === 0 ? 'none' : members.map((member) => member.exercise_id).join(', ')

/** The block's own clock and shape, as the replacement must return them. */
export function blockContract(block: WorkoutBlockRow): string {
  return [
    `structure_type: ${block.structure_type}`,
    `rounds: ${block.rounds ?? 'null'}`,
    `timer_type: ${block.timer_type}`,
    `timer_seconds: ${block.timer_seconds ?? 'null'}`,
    `round_rest_seconds: ${block.round_rest_seconds ?? 'null'}`,
    `rep_scheme: ${block.rep_scheme}`,
  ].join(' | ')
}

/**
 * `exercise-swap.md` §"Prompt Strategy", on contract 4.1's block-nested shape.
 *
 * The two modes differ in one sentence and one count, and they are written as
 * one function so they cannot drift: a unit swap replaces the whole block
 * because the pair was composed to work together, and a single swap replaces
 * one member while the rest of the block is named as context it has to fit.
 */
export function swapDirective(scope: SwapScope): string {
  const { block, section, outgoing } = scope
  const unit = scope.mode === 'unit'

  return [
    `SWAP MODE: ${scope.mode}`,
    unit
      ? `Replace the entire ${block.structure_type} block as a unit: ${names(outgoing)}.`
      : `Replace ONLY ${outgoing[0].exercise_id} in the ${section.section_type} section's ` +
        `${block.structure_type} block.`,
    `Staying in this block (do not duplicate): ${names(scope.keptInBlock)}`,
    `Elsewhere in this workout (do not duplicate): ${names(scope.keptInSession)}`,
    '',
    'The replacement must:',
    unit
      ? '- serve the same training purpose as the group it replaces'
      : '- fit the same role in the block, and complement the exercises staying in it',
    `- keep the block's timing: ${blockContract(block)}`,
    '- be chosen from the candidates above, with equipment from that candidate',
    `- suit intensity ${scope.session.effective_intensity}/10`,
    '',
    'RETURN SHAPE',
    `Return the contract object with exactly one section — ${section.section_type} — holding`,
    'exactly one block, whose structure, rounds, timer and rest are the values above,',
    `unchanged, and holding exactly ${outgoing.length} ` +
      `exercise${outgoing.length === 1 ? '' : 's'}: the replacement` +
      `${unit ? 's, in the order they are performed' : ''}.`,
    'Return no other section, no other block, and no exercise that is staying.',
    `title: name the replacement${unit ? ' group' : ''}. It is recorded nowhere and`,
    'the session keeps its own.',
  ].join('\n')
}

/**
 * The generation prompt with the directive appended, measured the same way.
 *
 * The directive goes last, after the output contract, for the reason the retry
 * addendum does: everything above it is what a composition is always told, and
 * the last thing read is the one instruction this call does not share with any
 * other. `createComposer` reuses this exact string for the retry, so a
 * corrected attempt is still scoped to the slot.
 */
export function assembleSwapPrompt(input: PromptInput, scope: SwapScope): AssembledPrompt {
  const user = [assemblePrompt(input).user, swapDirective(scope)].join('\n\n')

  return { system: SYSTEM_PROMPT, user, measurement: measurePrompt(user, input) }
}

// ─────────────────────────────────────────────────────────────────────────────
// The narrower checks
// ─────────────────────────────────────────────────────────────────────────────

/** One way a response came back wider than the slot it was asked about. */
export interface SwapViolation {
  readonly path: string
  readonly message: string
}

const BLOCK_SHAPE = [
  'structure_type',
  'rounds',
  'timer_type',
  'timer_seconds',
  'round_rest_seconds',
  'rep_scheme',
] as const

/**
 * REV-02's own checks, beside GEN-02c's: one section, one block, that block's
 * structure and clock unchanged, and exactly as many exercises as there are
 * slots being replaced.
 *
 * The count is a hard check rather than a preference because persistence is
 * slot by slot — `swap_session_exercise` appends one revision in one
 * `slot_id`. A block that came back with three exercises where two were
 * replaced has no slot for the third, and inventing one would be this function
 * composing rather than the model.
 */
export function checkSwapShape(
  workout: GenerationOutput,
  scope: SwapScope,
): readonly SwapViolation[] {
  const violations: SwapViolation[] = []

  if (workout.sections.length !== 1) {
    return [
      {
        path: 'sections',
        message:
          `a ${scope.mode} swap returns exactly one section ` +
          `(${scope.section.section_type}); this returned ${workout.sections.length}`,
      },
    ]
  }

  const section = workout.sections[0]
  if (section.blocks.length !== 1) {
    return [
      {
        path: 'sections[0].blocks',
        message: `a swap returns exactly one block; this returned ${section.blocks.length}`,
      },
    ]
  }

  const block = section.blocks[0]

  for (const field of BLOCK_SHAPE) {
    if (block[field] !== scope.block[field]) {
      violations.push({
        path: `sections[0].blocks[0].${field}`,
        message:
          `${field} must stay ${String(scope.block[field])} — the block's structure and ` +
          `timer are not what is being replaced; this returned ${String(block[field])}`,
      })
    }
  }

  if (block.exercises.length !== scope.outgoing.length) {
    violations.push({
      path: 'sections[0].blocks[0].exercises',
      message:
        `a ${scope.mode} swap replaces ${scope.outgoing.length} slot` +
        `${scope.outgoing.length === 1 ? '' : 's'}; this returned ` +
        `${block.exercises.length} exercises`,
    })
  }

  const kept = new Set(scope.keptInBlock.map((member) => member.exercise_id))
  block.exercises.forEach((exercise, index) => {
    if (kept.has(exercise.exercise_id)) {
      violations.push({
        path: `sections[0].blocks[0].exercises[${index}].exercise_id`,
        message: `${exercise.exercise_id} is staying in this block and cannot be the replacement`,
      })
    }
  })

  return violations
}

/** Enough to correct, few enough that the retry addendum stays an addendum. */
const MAX_REPORTED_VIOLATIONS = 10

/**
 * The swap's verdict: REV-02's scope checks, then GEN-02c's hard checks 1–3.
 *
 * Scope first on purpose. A response carrying a second section fails check 3 as
 * well, and "that section is not enabled" describes the symptom of a model that
 * regenerated the workout rather than the slot.
 */
export function swapValidator(
  scope: SwapScope,
  options: { readonly logger?: Logger; readonly requestId?: string } = {},
): CompositionValidator<Validated> {
  return (workout, input) => {
    const violations = checkSwapShape(workout, scope)

    if (violations.length > 0) {
      options.logger?.warn('swap rejected', {
        requestId: options.requestId,
        mode: scope.mode,
        violations: violations.length,
      })

      return err<AttemptFailure>({
        code: GenerationFailure.MALFORMED,
        detail: violations
          .slice(0, MAX_REPORTED_VIOLATIONS)
          .map((violation) => `${violation.path}: ${violation.message}`)
          .join('\n'),
      })
    }

    return validateComposition(workout, input, options)
  }
}

/**
 * The replacements, paired to the slots they replace: position for position,
 * in the order the block holds its members.
 *
 * `checkSwapShape` has already proved the counts match, so this cannot mis-pair
 * — and it is a separate function because the pairing is the one decision
 * between a validated composition and a row in the database.
 */
export function pairReplacements(
  hydrated: readonly HydratedExercise[],
  scope: SwapScope,
): readonly { readonly outgoing: WorkoutExerciseRow; readonly replacement: HydratedExercise }[] {
  return scope.outgoing.map((outgoing, index) => ({ outgoing, replacement: hydrated[index] }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Transport
// ─────────────────────────────────────────────────────────────────────────────

export interface SwapDatabaseConfig {
  /** `SUPABASE_URL`, injected into every edge function. */
  readonly url: string
  /** `SUPABASE_ANON_KEY`, also injected. Never the service-role key. */
  readonly anonKey: string
  /**
   * The caller's access token. Every function reached here is
   * `security invoker`, so the reads and the write happen as the user whose
   * session it is — a swap needs no privilege the caller does not already hold,
   * and RLS is what makes somebody else's session "not found".
   */
  readonly accessToken: string
  /** Injected in tests; the global `fetch` otherwise. */
  readonly fetch?: typeof globalThis.fetch
}

/** One revision a unit swap asks the database to make. */
export interface BlockRevisionRequest {
  readonly workout_exercise_id: string
  readonly prescription: Prescription
}

/**
 * The four calls a swap makes. An interface rather than four functions so a
 * test drives the pipeline without a network, and so the module that decides
 * *what* to swap never learns where the database is.
 */
export interface SwapDatabase {
  /** `session_snapshot` — null when there is no such session, or it is not yours. */
  snapshot(sessionId: string): Promise<Result<SessionSnapshot | null, AppError>>
  /** `constraints_in_force` — the soft half reaches the prompt; the hard half already filtered. */
  constraints(userId: string, sessionId: string): Promise<Result<readonly UserConstraint[], AppError>>
  /** `generation_candidate_sets` — generation's own retrieval, unmodified. */
  candidates(request: {
    readonly userId: string
    readonly focus: SessionFocus
    readonly locationId: string | null
    readonly sessionId: string
  }): Promise<Result<readonly SectionCandidates[], AppError>>
  swapExercise(
    workoutExerciseId: string,
    prescription: Prescription,
  ): Promise<Result<SessionTransition, AppError>>
  swapBlock(
    blockId: string,
    revisions: readonly BlockRevisionRequest[],
  ): Promise<Result<BlockSwapResult, AppError>>
}

export function createSwapDatabase(config: SwapDatabaseConfig): SwapDatabase {
  const endpoint = `${config.url.replace(/\/+$/, '')}/rest/v1/rpc`
  const fetchImpl = config.fetch ?? globalThis.fetch

  async function call(
    name: string,
    args: Record<string, unknown>,
    code: ErrorCode,
  ): Promise<Result<unknown, AppError>> {
    let response: Response
    try {
      response = await fetchImpl(`${endpoint}/${name}`, {
        method: 'POST',
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(args),
      })
    } catch {
      // Not the thrown error's message: a transport error can quote the request
      // it failed on, headers and all (defect D3).
      return err(createError(ErrorCode.NETWORK_SERVER_ERROR, { details: { rpc: name } }))
    }

    if (!response.ok) {
      return err(createError(code, { details: { rpc: name, status: response.status } }))
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return err(createError(code, { details: { rpc: name } }))
    }

    return ok(payload)
  }

  return {
    async snapshot(sessionId) {
      const payload = await call(
        'session_snapshot',
        { p_session_id: sessionId },
        ErrorCode.PERSISTENCE_READ_FAILED,
      )
      if (!payload.ok) return payload

      return parseBoundary(sessionSnapshotSchema.nullable(), payload.value, {
        code: ErrorCode.PERSISTENCE_READ_FAILED,
      })
    },

    async constraints(userId, sessionId) {
      const payload = await call(
        'constraints_in_force',
        { p_user_id: userId, p_session_id: sessionId },
        ErrorCode.PERSISTENCE_READ_FAILED,
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

    async candidates(request) {
      const payload = await call(
        'generation_candidate_sets',
        {
          p_user_id: request.userId,
          p_focus: request.focus,
          p_location_id: request.locationId,
          p_session_id: request.sessionId,
          p_floor: CANDIDATE_FLOOR,
        },
        ErrorCode.PERSISTENCE_READ_FAILED,
      )
      if (!payload.ok) return payload

      // `sectionFromRow` is GEN-02a's mapping of exactly this row, and it
      // validates the `jsonb` candidate by candidate. A second schema for the
      // same payload would be a second opinion about eligibility this module
      // has no business holding, so the only check here is that rows arrived.
      if (!Array.isArray(payload.value)) {
        return err(
          createError(ErrorCode.PERSISTENCE_READ_FAILED, {
            details: { rpc: 'generation_candidate_sets' },
          }),
        )
      }

      const sections: SectionCandidates[] = []
      for (const row of payload.value as CandidateSetRow[]) {
        const section = sectionFromRow(row)
        if (!section.ok) return section
        sections.push(section.value)
      }

      return ok(sections)
    },

    async swapExercise(workoutExerciseId, prescription) {
      const payload = await call(
        'swap_session_exercise',
        { p_workout_exercise_id: workoutExerciseId, p_prescription: prescription },
        ErrorCode.PERSISTENCE_WRITE_FAILED,
      )
      if (!payload.ok) return payload

      return parseBoundary(sessionTransitionSchema, payload.value, {
        code: ErrorCode.PERSISTENCE_WRITE_FAILED,
      })
    },

    async swapBlock(blockId, revisions) {
      const payload = await call(
        'swap_session_block',
        { p_block_id: blockId, p_revisions: revisions },
        ErrorCode.PERSISTENCE_WRITE_FAILED,
      )
      if (!payload.ok) return payload

      return parseBoundary(blockSwapResultSchema, payload.value, {
        code: ErrorCode.PERSISTENCE_WRITE_FAILED,
      })
    },
  }
}

/** `generation_candidate_sets`' row, as GEN-02a's mapper reads it. */
type CandidateSetRow = FunctionReturns<'generation_candidate_sets'>[number]

// ─────────────────────────────────────────────────────────────────────────────
// The pipeline
// ─────────────────────────────────────────────────────────────────────────────

/** How the composer is built once the scope — and so the directive — is known. */
export type SwapComposerFactory = (options: {
  readonly assemble: (input: PromptInput) => AssembledPrompt
  readonly validate: CompositionValidator<Validated>
}) => Composer<Validated>

/** The production factory: `claude.ts`'s composer, with the swap's two arguments. */
export function createSwapComposer(
  config: Omit<ComposerConfig<Validated>, 'validate' | 'assemble'>,
): SwapComposerFactory {
  return (options) => createComposer<Validated>({ ...config, ...options })
}

export interface SwapDependencies {
  readonly db: SwapDatabase
  readonly catalog: CatalogReader
  readonly composer: SwapComposerFactory
  /** `YYYY-MM-DD`; injected so a test's prompt is the same string twice. */
  readonly today?: () => string
}

export interface SwapContext {
  readonly userId: string
  readonly requestId: string
  readonly logger?: Logger
}

const isoDate = () => new Date().toISOString().slice(0, 10)

/**
 * A swap, end to end: read the session, retrieve the section's candidates,
 * compose one slot, validate it, hydrate it, and persist it as a revision.
 *
 * The order is GENERATION_CONTRACT §1's, and the only step that is not
 * generation's is the last one.
 */
export async function performSwap(
  request: SwapRequest,
  context: SwapContext,
  deps: SwapDependencies,
): Promise<Result<Omit<SwapSuccess, 'requestId'>, AppError>> {
  const { logger, requestId } = context

  const snapshot = await deps.db.snapshot(request.session_id)
  if (!snapshot.ok) return snapshot
  if (snapshot.value === null) {
    return err(
      createError(ErrorCode.PERSISTENCE_NOT_FOUND, {
        requestId,
        details: { session: request.session_id },
      }),
    )
  }

  const scope = resolveSwapScope(snapshot.value, request)
  if (!scope.ok) return err({ ...scope.error, requestId })

  const constraints = await deps.db.constraints(context.userId, request.session_id)
  if (!constraints.ok) return constraints

  const retrieved = await deps.db.candidates({
    userId: context.userId,
    focus: scope.value.session.session_focus,
    locationId: scope.value.session.location_id,
    sessionId: request.session_id,
  })
  if (!retrieved.ok) return retrieved

  const section = retrieved.value.find(
    (candidates) => candidates.section === scope.value.section.section_type,
  )

  // An over-constrained request, reported as one rather than composed around:
  // the section the slot lives in is no longer eligible for anything.
  if (!section || section.candidates.length === 0) {
    return err(
      createError(ErrorCode.GENERATION_NO_CANDIDATES, {
        requestId,
        details: { section: scope.value.section.section_type },
      }),
    )
  }

  const input = swapPromptInput(
    scope.value,
    section,
    constraints.value,
    (deps.today ?? isoDate)(),
  )

  logger?.info('composing swap', {
    requestId,
    mode: scope.value.mode,
    // Counts and the section, never an exercise: what a user was prescribed is
    // not a log line.
    slots: scope.value.outgoing.length,
    section: scope.value.section.section_type,
    candidates: section.candidates.length,
    relaxed: section.relaxed,
  })

  const composed = await deps
    .composer({
      assemble: (promptInput) => assembleSwapPrompt(promptInput, scope.value),
      validate: swapValidator(scope.value, { logger, requestId }),
    })
    .compose(input, requestId)
  if (!composed.ok) return composed

  // Unreachable with the validator above: `compose` only succeeds when the
  // validator did, and this one returns a `Validated`. Checked rather than
  // asserted, because `validation: null` means nobody checked (`claude.ts`).
  const validated = composed.value.validation
  if (validated === null) {
    return err(createError(ErrorCode.GENERATION_FAILED, { requestId }))
  }

  const hydrated = await hydrate(validated, deps.catalog, { logger, requestId })
  if (!hydrated.ok) return hydrated

  const pairs = pairReplacements(hydrated.value.sections[0].blocks[0].exercises, scope.value)

  return persist(pairs, scope.value, context, deps)
}

type Pairing = ReturnType<typeof pairReplacements>

/**
 * The write, and the whole of D6: one RPC per swap mode, both of which append a
 * revision in the slot's own `slot_id` and supersede its predecessor. Nothing
 * in this module issues an UPDATE, and nothing here can: the two functions are
 * the only write surface it knows.
 */
async function persist(
  pairs: Pairing,
  scope: SwapScope,
  context: SwapContext,
  deps: SwapDependencies,
): Promise<Result<Omit<SwapSuccess, 'requestId'>, AppError>> {
  const { logger, requestId } = context

  const revisions: SwapRevision[] = []

  if (scope.mode === 'single') {
    const [pair] = pairs
    const result = await deps.db.swapExercise(pair.outgoing.id, pair.replacement.prescription)
    if (!result.ok) return result

    const revision = revisionOf(result.value, pair.replacement, requestId)
    if (!revision.ok) return revision
    revisions.push(revision.value)
  } else {
    const result = await deps.db.swapBlock(
      scope.block.id,
      pairs.map((pair) => ({
        workout_exercise_id: pair.outgoing.id,
        prescription: pair.replacement.prescription,
      })),
    )
    if (!result.ok) return result

    const outcomes = result.value.revisions ?? []
    if (result.value.outcome !== 'swapped' || outcomes.length !== pairs.length) {
      return err(refused(result.value.outcome, requestId, { block: scope.block.id }))
    }

    for (const [index, outcome] of outcomes.entries()) {
      const revision = revisionOf(outcome, pairs[index].replacement, requestId)
      if (!revision.ok) return revision
      revisions.push(revision.value)
    }
  }

  logger?.info('swap persisted', {
    requestId,
    mode: scope.mode,
    revisions: revisions.length,
  })

  return ok({
    mode: scope.mode,
    section_type: scope.section.section_type,
    block_id: scope.block.id,
    revisions,
  })
}

/**
 * One persisted revision, as the client receives it. The rows are the
 * database's answer rather than an echo of what was sent — a client that
 * rendered the prescription it asked for would not know whether it was stored.
 */
function revisionOf(
  outcome: SessionTransition,
  replacement: HydratedExercise,
  requestId: string,
): Result<SwapRevision, AppError> {
  if (outcome.outcome !== 'swapped' || !outcome.exercise || !outcome.superseded) {
    return err(refused(outcome.outcome, requestId, { state: outcome.state ?? null }))
  }

  return ok({
    superseded: outcome.superseded,
    exercise: outcome.exercise,
    name: replacement.name,
    display_name: replacement.displayName,
  })
}

/**
 * A refusal the database returned, as the taxonomy spells it. `not_found` and
 * an invalid transition are different answers to the user — the first is a
 * session that is gone, the second one that has moved on — and they stay
 * different here.
 */
function refused(
  outcome: string,
  requestId: string,
  details: Record<string, unknown>,
): AppError {
  const code =
    outcome === 'not_found'
      ? ErrorCode.PERSISTENCE_NOT_FOUND
      : outcome === 'invalid_transition'
        ? ErrorCode.SESSION_INVALID_TRANSITION
        : ErrorCode.PERSISTENCE_WRITE_FAILED

  return createError(code, { requestId, details: { ...details, outcome } })
}
