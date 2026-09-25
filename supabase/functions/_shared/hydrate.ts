/**
 * GEN-02c — the deterministic half after the model, part two: hydration.
 *
 * GENERATION_CONTRACT §8 is two sentences and the second one is the reason
 * this module exists: hydration saves output tokens, but *more importantly* a
 * model reproducing facts it cannot verify is how facts drift. So the display
 * name, the equipment-resolved name, the coaching cues, the regression
 * reference and the muscle coverage are read from the catalog by id and
 * nowhere else. Contract v4.1 already removed `name` and `regression` from
 * what Claude returns and `generationOutputSchema` is strict, so a response
 * carrying either is rejected before it reaches here — drift is structurally
 * impossible rather than something a check has to catch.
 *
 * Three properties this module is built to keep, each one a test rather than a
 * paragraph (`src/test/generation-hydration.test.ts`):
 *
 *   * **After validation, provably.** `hydrateWorkout` takes a `Validated`,
 *     which only `validateComposition` constructs. An unvalidated
 *     `GenerationOutput` does not type-check, so "hydrated only after
 *     validation" is the compiler's answer and not a convention. It matters
 *     more than it looks: hydrating first would mean reading the catalog for
 *     an id the candidate set never contained, and answering with a name for
 *     an exercise this user was never offered.
 *   * **The model's estimate is diagnostic and stays there.** `HydratedWorkout`
 *     has no duration field at all. `estimated_duration_mins` is carried once,
 *     as `diagnostics.modelEstimateMins`, beside the soft record it belongs
 *     with. Defect D5 was a validator comparing a number Claude was told to a
 *     number Claude wrote; the structural answer is that there is no
 *     authoritative minutes field here for it to leak into. The session's
 *     duration columns are the request's (`effective_duration_target_mins`)
 *     and GEN-06's (`computed_duration_mins`), and neither is written here.
 *   * **The versions ride with the result.** `promptVersion` and
 *     `contractVersion` are stamped on the hydrated workout, so persistence
 *     stamps the session from the thing it is persisting rather than by
 *     re-reading two constants that may have moved since the prompt was sent.
 *
 * Nothing here persists, and nothing here decides anything about the workout:
 * hydration adds facts and changes no prescription. The prescription each
 * hydrated exercise carries is the model's own object, untouched.
 */

import {
  ErrorCode,
  createError,
  err,
  ok,
  type AppError,
  type Result,
} from '../../../src/state/errors.ts'
import type { Enums } from '../../../src/data/database.types.ts'
import type { Logger } from '../../../src/state/logger.ts'
import {
  exerciseCatalogRowSchema,
  parseBoundary,
  type ExerciseCatalogRow,
  type GenerationOutput,
  type Prescription,
  type WorkoutBlock,
  type WorkoutSection,
} from '../../../src/state/schemas.ts'
import { CONTRACT_VERSION, PROMPT_VERSION } from './prompt.ts'
import type { QualityRecord, Validated } from './validate.ts'

// ─────────────────────────────────────────────────────────────────────────────
// The facts
// ─────────────────────────────────────────────────────────────────────────────

/** One muscle an exercise trains, and in what role. `exercise_muscle_groups`. */
export interface MuscleCoverage {
  readonly muscle: string
  readonly role: Enums<'muscle_role'>
}

/**
 * The easier variant, by id and by name. The id is the fact
 * `exercise_definitions.regression` stores; the name is resolved from the
 * catalog too, because a screen offering "try the regression" has to be able
 * to say which movement that is.
 *
 * `name` is null when the referenced row could not be read — an authored
 * reference the catalog no longer resolves. That is worth showing as "no
 * easier variant" and is never worth failing a generated workout over, so it
 * is a null rather than an error.
 */
export interface RegressionReference {
  readonly exerciseId: string
  readonly name: string | null
}

/** Everything §8 says is hydrated, for one exercise id. */
export interface CatalogFacts {
  readonly exerciseId: string
  readonly name: string
  /** Equipment slug → what this exercise is called with it. Often empty. */
  readonly equipmentDisplayNames: Readonly<Record<string, string>>
  readonly coachingCues: readonly string[]
  readonly regression: RegressionReference | null
  readonly muscles: readonly MuscleCoverage[]
}

/** The catalog, indexed the way hydration asks about it. */
export type CatalogFactsById = ReadonlyMap<string, CatalogFacts>

/**
 * `equipment_display_names` resolution, §8's second listed fact: the name for
 * the equipment actually prescribed, falling back to the exercise's own name.
 * The fallback is the common case — most exercises are called one thing however
 * they are loaded — and an exercise that has entries for other equipment but
 * not this one is the same case, not a defect.
 */
export function resolveDisplayName(facts: CatalogFacts, equipment: string): string {
  return facts.equipmentDisplayNames[equipment] ?? facts.name
}

// ─────────────────────────────────────────────────────────────────────────────
// The hydrated workout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One prescription and the catalog's facts about it. The prescription is the
 * model's object exactly as it was validated — hydration adds, and never
 * edits, because a hydration that could change a target would be a second
 * composer nobody audited.
 */
export interface HydratedExercise {
  readonly prescription: Prescription
  /** The catalog's name for the movement, whatever it is performed with. */
  readonly name: string
  /** `resolveDisplayName` — the name for the equipment prescribed. */
  readonly displayName: string
  readonly coachingCues: readonly string[]
  readonly regression: RegressionReference | null
  readonly muscles: readonly MuscleCoverage[]
}

export interface HydratedBlock extends Omit<WorkoutBlock, 'exercises'> {
  readonly exercises: readonly HydratedExercise[]
}

export interface HydratedSection extends Omit<WorkoutSection, 'blocks'> {
  readonly blocks: readonly HydratedBlock[]
}

/**
 * What the model said about a workout that is not a fact about it. Both
 * members are observations: the soft record §6 asks to be stored and surfaced,
 * and the estimate §5 calls diagnostic in the same breath as it defines it.
 *
 * Nothing in the application reads `modelEstimateMins` as a duration. It is
 * here to be compared against GEN-06's computed minutes — a free signal about
 * whether the model understands the time cost of what it composed — and the
 * comparison is the point of keeping it.
 */
export interface GenerationDiagnostics {
  /** `estimated_duration_mins`, as returned. Diagnostic only (D5). */
  readonly modelEstimateMins: number
  readonly quality: QualityRecord
}

/**
 * The workout as everything downstream sees it. Deliberately not a
 * `GenerationOutput` with extra keys: this shape has no
 * `estimated_duration_mins`, so a persister or a screen cannot read the
 * model's estimate by reaching for the field it used to be in.
 */
export interface HydratedWorkout {
  readonly title: string
  readonly overview: string | null
  readonly sections: readonly HydratedSection[]
  /** `PROMPT_v4.md`'s version, stamped on the session (§10). */
  readonly promptVersion: string
  /** The output contract's version, stamped beside it (§10). */
  readonly contractVersion: string
  readonly diagnostics: GenerationDiagnostics
}

/**
 * The two versions §10 keeps independent, carried together because a session
 * records both. Passed in rather than read from the constants here so the
 * result records the versions the workout was *composed* under.
 */
export interface GenerationVersions {
  readonly promptVersion: string
  readonly contractVersion: string
}

/** What this deployment composes with now. */
export const CURRENT_VERSIONS: GenerationVersions = {
  promptVersion: PROMPT_VERSION,
  contractVersion: CONTRACT_VERSION,
}

export interface HydrationOptions {
  readonly versions?: GenerationVersions
  /** The envelope's per-request logger, where there is one. */
  readonly logger?: Logger
  readonly requestId?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Hydration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every exercise id the workout prescribes, once each, in the order they are
 * prescribed. The read is one request for the set, not one per exercise: a
 * circuit that names the same movement in two blocks is one row either way.
 */
export function prescribedExerciseIds(workout: GenerationOutput): readonly string[] {
  const ids: string[] = []
  const seen = new Set<string>()

  for (const section of workout.sections) {
    for (const block of section.blocks) {
      for (const exercise of block.exercises) {
        if (seen.has(exercise.exercise_id)) continue
        seen.add(exercise.exercise_id)
        ids.push(exercise.exercise_id)
      }
    }
  }

  return ids
}

/**
 * §8, over a workout that has already passed §6.
 *
 * The `Validated` argument is the ordering rule: this function cannot be
 * called on a workout nobody checked, because nothing else produces one.
 *
 * A prescribed id with no catalog row is a typed read failure rather than a
 * workout with a blank name. It should be unreachable — validation proved the
 * id came from that section's candidate set, and the candidate set is a query
 * against this same catalog — so reaching it means the catalog changed between
 * the two reads, and answering with half a workout would hide that.
 */
export function hydrateWorkout(
  validated: Validated,
  facts: CatalogFactsById,
  options: HydrationOptions = {},
): Result<HydratedWorkout, AppError> {
  const { workout, quality } = validated
  const versions = options.versions ?? CURRENT_VERSIONS

  const missing = prescribedExerciseIds(workout).filter((id) => !facts.has(id))
  if (missing.length > 0) {
    options.logger?.error('hydration incomplete', {
      requestId: options.requestId,
      missing: missing.length,
    })

    return err(
      createError(ErrorCode.PERSISTENCE_READ_FAILED, {
        requestId: options.requestId,
        details: { view: CATALOG_VIEW, missing },
      }),
    )
  }

  const sections = workout.sections.map((section) => ({
    ...section,
    blocks: section.blocks.map((block) => ({
      ...block,
      exercises: block.exercises.map((prescription) =>
        // Non-null: `missing` is empty, so every prescribed id is indexed.
        hydrateExercise(prescription, facts.get(prescription.exercise_id)!),
      ),
    })),
  }))

  return ok({
    title: workout.title,
    overview: workout.overview,
    sections,
    promptVersion: versions.promptVersion,
    contractVersion: versions.contractVersion,
    diagnostics: {
      // The one place `estimated_duration_mins` is read, and it is read into a
      // field whose name says what it is worth.
      modelEstimateMins: workout.estimated_duration_mins,
      quality,
    },
  })
}

function hydrateExercise(prescription: Prescription, facts: CatalogFacts): HydratedExercise {
  return {
    prescription,
    name: facts.name,
    displayName: resolveDisplayName(facts, prescription.equipment),
    coachingCues: facts.coachingCues,
    regression: facts.regression,
    muscles: facts.muscles,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The catalog read
// ─────────────────────────────────────────────────────────────────────────────

/** The hydration surface DATA-01a built for exactly this (DATA_MODEL §4). */
export const CATALOG_VIEW = 'exercise_catalog'

/**
 * §8's facts, as columns. Nothing else is read: hydration is not a browse.
 * `progression` is on the list without being a §8 fact because
 * `exerciseCatalogRowSchema` is the definition row's and requires it — a
 * column the shared contract declares is cheaper to select than to make
 * optional for one reader.
 */
export const CATALOG_COLUMNS = [
  'id',
  'name',
  'equipment_display_names',
  'coaching_cues',
  'regression',
  'progression',
  'muscles',
] as const

export interface CatalogReaderConfig {
  /** The project URL — `SUPABASE_URL`, injected into every edge function. */
  readonly url: string
  /** The public anon key — `SUPABASE_ANON_KEY`, also injected. */
  readonly anonKey: string
  /**
   * The caller's access token. `exercise_catalog` is `security_invoker` and
   * readable by `authenticated` alone, so the read happens as the user who
   * asked for the workout. The service-role key is never used here: a catalog
   * read needs no privilege the caller does not already hold.
   */
  readonly accessToken: string
  /** Injected in tests; the global `fetch` otherwise. */
  readonly fetch?: typeof globalThis.fetch
}

/** Ids in, facts out. The one shape `hydrate` depends on. */
export type CatalogReader = (ids: readonly string[]) => Promise<Result<CatalogFactsById, AppError>>

/**
 * PostgREST, by hand and over `fetch`, for the same reason `auth.ts` verifies
 * a token that way: `src/data/supabase.ts` is the browser's client and its
 * extensionless imports do not resolve in Deno. What is not done by hand is
 * the row — `exerciseCatalogRowSchema` is CORE-03's, imported rather than
 * restated, so this module declares no schema of its own.
 *
 * Two round trips, at most. The first reads the prescribed ids; the second
 * reads the regression ids the first one named and did not already contain,
 * because a regression is usually not itself prescribed. A workout whose
 * exercises author no regressions makes one request.
 */
export function createCatalogReader(config: CatalogReaderConfig): CatalogReader {
  const endpoint = `${config.url.replace(/\/+$/, '')}/rest/v1/${CATALOG_VIEW}`
  const fetchImpl = config.fetch ?? globalThis.fetch

  async function readRows(ids: readonly string[]): Promise<Result<ExerciseCatalogRow[], AppError>> {
    if (ids.length === 0) return ok([])

    const query = new URLSearchParams({
      select: CATALOG_COLUMNS.join(','),
      // PostgREST's `in` takes a quoted list; a slug needs no quoting, and
      // quoting it anyway is what keeps that true of the next id format.
      id: `in.(${ids.map((id) => `"${id.replaceAll('"', '""')}"`).join(',')})`,
    })

    let response: Response
    try {
      response = await fetchImpl(`${endpoint}?${query.toString()}`, {
        method: 'GET',
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${config.accessToken}`,
          Accept: 'application/json',
        },
      })
    } catch {
      // Not the thrown error's message: a transport error can quote the
      // request it failed on, headers and all.
      return err(createError(ErrorCode.NETWORK_SERVER_ERROR))
    }

    if (!response.ok) {
      return err(
        createError(ErrorCode.PERSISTENCE_READ_FAILED, {
          details: { view: CATALOG_VIEW, status: response.status },
        }),
      )
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return err(createError(ErrorCode.PERSISTENCE_READ_FAILED, { details: { view: CATALOG_VIEW } }))
    }

    if (!Array.isArray(payload)) {
      return err(createError(ErrorCode.PERSISTENCE_READ_FAILED, { details: { view: CATALOG_VIEW } }))
    }

    const rows: ExerciseCatalogRow[] = []
    for (const entry of payload) {
      const row = parseBoundary(exerciseCatalogRowSchema, entry, {
        code: ErrorCode.PERSISTENCE_READ_FAILED,
      })
      if (!row.ok) return row
      rows.push(row.value)
    }

    return ok(rows)
  }

  return async function read(ids) {
    const rows = await readRows([...new Set(ids)])
    if (!rows.ok) return rows

    const names = new Map(rows.value.map((row) => [row.id, row.name]))
    const unresolved = rows.value
      .map((row) => row.regression)
      .filter((id): id is string => id !== null && !names.has(id))

    if (unresolved.length > 0) {
      const referenced = await readRows([...new Set(unresolved)])
      if (!referenced.ok) return referenced
      for (const row of referenced.value) names.set(row.id, row.name)
    }

    return ok(factsFromRows(rows.value, names))
  }
}

/**
 * Rows → facts, with the regression reference resolved against every name the
 * read saw. Exported because it is the mapping, and a test that builds rows is
 * a better test of it than one that builds facts.
 */
export function factsFromRows(
  rows: readonly ExerciseCatalogRow[],
  names: ReadonlyMap<string, string>,
): CatalogFactsById {
  const facts = new Map<string, CatalogFacts>()

  for (const row of rows) {
    facts.set(row.id, {
      exerciseId: row.id,
      name: row.name,
      equipmentDisplayNames: row.equipment_display_names,
      coachingCues: row.coaching_cues,
      regression:
        row.regression === null
          ? null
          : { exerciseId: row.regression, name: names.get(row.regression) ?? null },
      muscles: row.muscles,
    })
  }

  return facts
}

/**
 * §8 end to end: read the facts for what was validated, then fill them in.
 *
 * The reader is a parameter rather than an import for the reason validation is
 * one in `claude.ts` — this module then has no transport to stub, and the
 * function that mounts it decides where the catalog lives.
 */
export async function hydrate(
  validated: Validated,
  read: CatalogReader,
  options: HydrationOptions = {},
): Promise<Result<HydratedWorkout, AppError>> {
  const facts = await read(prescribedExerciseIds(validated.workout))
  if (!facts.ok) return facts

  const hydrated = hydrateWorkout(validated, facts.value, options)
  if (hydrated.ok) {
    options.logger?.info('workout hydrated', {
      requestId: options.requestId,
      // Counts and versions. Never a name or an id: what a user was
      // prescribed is not a log line.
      exercises: prescribedExerciseIds(validated.workout).length,
      promptVersion: hydrated.value.promptVersion,
      contractVersion: hydrated.value.contractVersion,
      modelEstimateMins: hydrated.value.diagnostics.modelEstimateMins,
    })
  }

  return hydrated
}
