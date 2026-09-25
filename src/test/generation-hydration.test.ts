import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { parseCompletion } from '../../supabase/functions/_shared/claude.ts'
import {
  CATALOG_COLUMNS,
  CATALOG_VIEW,
  CURRENT_VERSIONS,
  createCatalogReader,
  factsFromRows,
  hydrate,
  hydrateWorkout,
  prescribedExerciseIds,
  resolveDisplayName,
  type CatalogFactsById,
  type HydratedWorkout,
} from '../../supabase/functions/_shared/hydrate.ts'
import { PROMPT_VERSION } from '../../supabase/functions/_shared/prompt.ts'
import { validateComposition, type Validated } from '../../supabase/functions/_shared/validate.ts'
import { ErrorCode, createError, err, ok } from '../state/errors'
import { createLogger, type LogSink } from '../state/logger'
import {
  CONTRACT_VERSION,
  generationOutputSchema,
  type ExerciseCatalogRow,
  type GenerationOutput,
} from '../state/schemas'
import { catalogRowFixtures, promptInput } from './generation-prompt-fixtures'
import { VALID_RESPONSE } from './generation-response-fixtures'

// GEN-02c, the hydration half. Three questions, and each acceptance criterion
// is one of them:
//
//   1. Do the facts come from the catalog, by id, and only after validation?
//      The type system answers the ordering — `hydrateWorkout` takes a
//      `Validated` and nothing else constructs one — and the capture answers
//      the facts: every name, cue, display name and regression asserted below
//      is a real row of `docs/backend/snapshot/`, so a hydration that invented
//      one would have to invent it identically.
//   2. Can Claude's duration estimate become a number the application acts on?
//      Answered three ways, because one of them alone is a convention: the
//      hydrated shape carries no minutes field outside `diagnostics`, changing
//      the estimate changes nothing else in the result, and no runtime module
//      reads `estimated_duration_mins` into anything but a diagnostic.
//   3. Do `prompt_version` and `contract_version` survive hydration? They are
//      what a session is stamped with (§10), and a result that lost them would
//      leave persistence stamping from a constant rather than from the
//      workout it is storing.

const REPO_ROOT = resolve(import.meta.dirname, '../..')
const read = (relativePath: string) => readFileSync(resolve(REPO_ROOT, relativePath), 'utf-8')

const INPUT = promptInput()

/** The five exercises `VALID_RESPONSE` prescribes, in the order it does. */
const PRESCRIBED = [
  'cat-cow',
  'worlds-greatest-stretch',
  'back-squat',
  'bulgarian-split-squat',
  'glute-bridge',
] as const

/** A parsed contract-4.1.0 workout, fresh each time so a test may mutate it. */
function composed(): GenerationOutput {
  const parsed = parseCompletion(VALID_RESPONSE)
  if (!parsed.ok) throw new Error('the valid fixture no longer parses')

  return structuredClone(parsed.value)
}

/**
 * The only way to hold a `Validated`: run the workout through §6. A test that
 * built one by hand would be testing a shape rather than the pipeline.
 */
function validated(mutate?: (workout: GenerationOutput) => void): Validated {
  const workout = composed()
  mutate?.(workout)

  const verdict = validateComposition(workout, INPUT)
  if (!verdict.ok) throw new Error(`the valid fixture no longer validates: ${verdict.error.code}`)

  return verdict.value
}

/** Captured rows for those ids, with every regression they name resolved. */
function catalogFacts(ids: readonly string[] = PRESCRIBED): CatalogFactsById {
  const rows = catalogRowFixtures(ids)
  const referenced = rows
    .map((row) => row.regression)
    .filter((id): id is string => id !== null)
  const names = new Map(
    catalogRowFixtures([...new Set([...ids, ...referenced])]).map((row) => [row.id, row.name]),
  )

  return factsFromRows(rows, names)
}

function hydrated(facts: CatalogFactsById = catalogFacts()): HydratedWorkout {
  const result = hydrateWorkout(validated(), facts)
  if (!result.ok) throw new Error(`hydration failed: ${result.error.code}`)

  return result.value
}

const exercisesOf = (workout: HydratedWorkout) =>
  workout.sections.flatMap((section) => section.blocks.flatMap((block) => block.exercises))

describe('facts are hydrated by id, from the catalog, after validation', () => {
  it('cannot be reached with a workout nobody validated', () => {
    // The ordering rule, as the compiler enforces it: hydration takes the
    // verdict, not the response. Hydrating first would mean reading the
    // catalog for an id the candidate set never contained, and answering with
    // a name for an exercise this user was never offered.
    expect(() =>
      // @ts-expect-error a GenerationOutput is not a Validated
      hydrateWorkout(composed(), catalogFacts()),
    ).toThrow()

    // And the verdict is not handed out for a workout that fails §6, so there
    // is nothing for hydration to be given.
    const outside = composed()
    outside.sections[1].blocks[0].exercises[0].exercise_id = 'bench-press'
    expect(validateComposition(outside, INPUT).ok).toBe(false)
  })

  it('reads one row per prescribed exercise, however often it is prescribed', () => {
    const workout = composed()
    // The same movement twice: one row answers both.
    workout.sections[0].blocks[0].exercises.push(
      structuredClone(workout.sections[0].blocks[0].exercises[0]),
    )

    expect(prescribedExerciseIds(workout)).toEqual([...PRESCRIBED])
  })

  it('fills in the catalog name for every prescription', () => {
    const names = exercisesOf(hydrated()).map((exercise) => exercise.name)

    expect(names).toEqual([
      'Cat-Cow',
      "World's Greatest Stretch",
      'Back Squat',
      'Bulgarian Split Squat',
      'Glute Bridge',
    ])
  })

  it('resolves the display name against the equipment that was prescribed', () => {
    const exercises = exercisesOf(hydrated())
    const bridge = exercises.find((exercise) => exercise.prescription.exercise_id === 'glute-bridge')
    const squat = exercises.find((exercise) => exercise.prescription.exercise_id === 'back-squat')

    // `glute-bridge` authors three display names and the response prescribed
    // it with bodyweight, so the workout says which glute bridge it means.
    expect(bridge?.prescription.equipment).toBe('bodyweight')
    expect(bridge?.displayName).toBe('Bodyweight Glute Bridge')

    // `back-squat` authors none. The fallback is the exercise's own name, not
    // a name assembled from the equipment slug.
    expect(squat?.displayName).toBe('Back Squat')
    expect(squat?.name).toBe('Back Squat')
  })

  it('keeps the exercise name when the map has no entry for this equipment', () => {
    const [bridge] = catalogRowFixtures(['glute-bridge'])
    const facts = catalogFacts(['glute-bridge']).get('glute-bridge')!

    expect(bridge.equipment_display_names).toHaveProperty('barbell')
    expect(resolveDisplayName(facts, 'kettlebells')).toBe('Glute Bridge')
  })

  it('fills in the coaching cues the catalog authored', () => {
    const [squat] = exercisesOf(hydrated()).filter(
      (exercise) => exercise.prescription.exercise_id === 'back-squat',
    )

    expect(squat.coachingCues).toEqual([
      'Chest up, core braced',
      'Knees track over toes',
      'Hip crease below knee',
    ])
  })

  it('resolves the regression reference by id, and says so by name', () => {
    const exercises = exercisesOf(hydrated())
    const squat = exercises.find((exercise) => exercise.prescription.exercise_id === 'back-squat')
    const catCow = exercises.find((exercise) => exercise.prescription.exercise_id === 'cat-cow')

    expect(squat?.regression).toEqual({ exerciseId: 'goblet-squat', name: 'Goblet Squat' })
    // No easier variant authored is a real answer, and never a blank one.
    expect(catCow?.regression).toBeNull()
  })

  it('shows a regression whose row could not be read as a reference without a name', () => {
    const rows = catalogRowFixtures(['back-squat'])
    const facts = factsFromRows(rows, new Map())

    expect(facts.get('back-squat')?.regression).toEqual({
      exerciseId: 'goblet-squat',
      name: null,
    })
  })

  it('carries the muscle coverage the catalog maps', () => {
    const [squat] = exercisesOf(hydrated()).filter(
      (exercise) => exercise.prescription.exercise_id === 'back-squat',
    )

    expect(squat.muscles.length).toBeGreaterThan(0)
    expect(squat.muscles).toContainEqual({ muscle: 'quads', role: 'primary' })
  })

  it('changes no prescription — the model composed it and hydration adds to it', () => {
    const before = validated()
    const after = hydrateWorkout(before, catalogFacts())
    if (!after.ok) throw new Error('hydration failed')

    expect(exercisesOf(after.value).map((exercise) => exercise.prescription)).toEqual(
      before.workout.sections.flatMap((section) =>
        section.blocks.flatMap((block) => block.exercises),
      ),
    )
    expect(after.value.title).toBe(before.workout.title)
    expect(after.value.overview).toBe(before.workout.overview)
  })

  it('refuses a workout whose prescribed id the catalog cannot answer for', () => {
    const facts = catalogFacts(PRESCRIBED.filter((id) => id !== 'glute-bridge'))
    const sink: LogSink = { write: vi.fn() }
    const result = hydrateWorkout(validated(), facts, {
      logger: createLogger({ sink, level: 'debug' }),
      requestId: 'req_abc123_def456',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return

    // A read failure, not a generation failure: the composition was sound and
    // the catalog changed underneath it. Half a workout would hide that.
    expect(result.error.code).toBe(ErrorCode.PERSISTENCE_READ_FAILED)
    expect(result.error.details).toEqual({ view: CATALOG_VIEW, missing: ['glute-bridge'] })
    expect(sink.write).toHaveBeenCalled()
  })

  it('is the only source of a name, because the model may not return one', () => {
    const payload = structuredClone(composed()) as unknown as Record<string, unknown>
    const sections = payload.sections as Record<string, unknown>[]
    const blocks = sections[0].blocks as Record<string, unknown>[]
    const exercises = blocks[0].exercises as Record<string, unknown>[]
    exercises[0].name = 'Cat-Cow'

    // Contract v4.1 removed `name` and `regression` from what Claude returns,
    // and the schema is strict — so a response that reproduces a catalog fact
    // is rejected before hydration is reached. Drift is impossible rather than
    // unlikely (§8).
    expect(generationOutputSchema.safeParse(payload).success).toBe(false)
  })
})

describe("Claude's duration estimate is diagnostic and stays diagnostic", () => {
  /** Every numeric leaf whose key claims to be minutes, with its path. */
  function minuteFields(value: unknown, path = ''): string[] {
    if (Array.isArray(value)) {
      return value.flatMap((entry, index) => minuteFields(entry, `${path}[${index}]`))
    }
    if (typeof value !== 'object' || value === null) return []

    return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
      const here = path === '' ? key : `${path}.${key}`
      const named = /mins|duration|estimate/i.test(key) ? [here] : []

      return [...named, ...minuteFields(entry, here)]
    })
  }

  it('is the only thing in the hydrated result that claims to be minutes', () => {
    expect(minuteFields(hydrated())).toEqual([
      'diagnostics.modelEstimateMins',
      'diagnostics.quality.modelEstimateMins',
    ])
  })

  it('is absent from the hydrated shape everywhere the old field used to be', () => {
    const workout = hydrated()

    expect(Object.keys(workout).sort()).toEqual([
      'contractVersion',
      'diagnostics',
      'overview',
      'promptVersion',
      'sections',
      'title',
    ])
    expect(workout).not.toHaveProperty('estimated_duration_mins')
  })

  it('changes nothing about the workout when the model estimates absurdly', () => {
    const honest = hydrateWorkout(validated(), catalogFacts())
    const absurd = hydrateWorkout(
      validated((workout) => {
        workout.estimated_duration_mins = 999
      }),
      catalogFacts(),
    )
    if (!honest.ok || !absurd.ok) throw new Error('hydration failed')

    const { diagnostics: honestDiagnostics, ...honestWorkout } = honest.value
    const { diagnostics: absurdDiagnostics, ...absurdWorkout } = absurd.value

    // The workout is identical — nothing was trimmed, scaled or rejected on
    // the strength of a number Claude wrote (D5).
    expect(absurdWorkout).toEqual(honestWorkout)
    expect(honestDiagnostics.modelEstimateMins).toBe(46)
    expect(absurdDiagnostics.modelEstimateMins).toBe(999)
    expect(absurdDiagnostics.quality.observations).toEqual(honestDiagnostics.quality.observations)
  })

  it('is read by no runtime module into anything but a diagnostic', () => {
    const readers = sources()
      .filter(isRuntime)
      .filter((file) => /\.estimated_duration_mins\b/.test(read(file)))

    // Two: the quality record's observation of it, and the hydrated result's
    // diagnostics. A third reader is how it becomes authoritative again.
    expect(readers.sort()).toEqual([
      'supabase/functions/_shared/hydrate.ts',
      'supabase/functions/_shared/validate.ts',
    ])

    for (const file of readers) {
      for (const line of read(file).split('\n')) {
        if (!/\.estimated_duration_mins\b/.test(line)) continue
        expect(line).toContain('modelEstimateMins')
      }
    }
  })

  it('reaches the log as an observation, beside the versions', () => {
    const lines: string[] = []
    const sink: LogSink = {
      write: (_level, line) => {
        lines.push(line)
      },
    }

    return hydrate(validated(), () => Promise.resolve(ok(catalogFacts())), {
      logger: createLogger({ sink, level: 'debug' }),
      requestId: 'req_abc123_def456',
    }).then((result) => {
      expect(result.ok).toBe(true)

      const entry = JSON.parse(lines.at(-1) ?? '{}') as Record<string, unknown>
      expect(entry).toMatchObject({
        modelEstimateMins: 46,
        exercises: PRESCRIBED.length,
        promptVersion: PROMPT_VERSION,
        contractVersion: CONTRACT_VERSION,
      })
      // Counts and versions, never what the user was prescribed.
      expect(lines.join('\n')).not.toContain('back-squat')
    })
  })
})

describe('the versions stay attached to what they describe', () => {
  it('stamps the versions this deployment composes with', () => {
    const workout = hydrated()

    expect(CURRENT_VERSIONS).toEqual({
      promptVersion: PROMPT_VERSION,
      contractVersion: CONTRACT_VERSION,
    })
    expect(workout.promptVersion).toBe(PROMPT_VERSION)
    expect(workout.contractVersion).toBe(CONTRACT_VERSION)
    // The two are independent (§10) and the result records both.
    expect(workout.promptVersion).not.toBe(workout.contractVersion)
  })

  it('records the versions the workout was composed under, not today’s', () => {
    const result = hydrateWorkout(validated(), catalogFacts(), {
      versions: { promptVersion: '4.9.0', contractVersion: '4.0.0' },
    })
    if (!result.ok) throw new Error('hydration failed')

    expect(result.value.promptVersion).toBe('4.9.0')
    expect(result.value.contractVersion).toBe('4.0.0')
  })

  it('carries the quality record validation produced, unchanged', () => {
    const before = validated()
    const after = hydrateWorkout(before, catalogFacts())
    if (!after.ok) throw new Error('hydration failed')

    expect(after.value.diagnostics.quality).toEqual(before.quality)
    expect(after.value.diagnostics.quality.contractVersion).toBe(CONTRACT_VERSION)
  })

  it('is what a session would be stamped from — the result, not a constant', () => {
    const module = read('supabase/functions/_shared/hydrate.ts')

    // `PROMPT_VERSION` and `CONTRACT_VERSION` are read once each, into
    // `CURRENT_VERSIONS`. Everything else takes them from the result.
    expect(module.match(/\bPROMPT_VERSION\b/g)).toHaveLength(2)
    expect(module.match(/\bCONTRACT_VERSION\b/g)).toHaveLength(2)
  })
})

describe('the catalog read', () => {
  const CONFIG = {
    url: 'https://project.supabase.co',
    anonKey: 'anon-key',
    accessToken: 'caller-token',
  }

  function respond(rows: ExerciseCatalogRow[], init: ResponseInit = {}) {
    return new Response(JSON.stringify(rows), { status: 200, ...init })
  }

  it('asks the hydration view for exactly the columns §8 names', async () => {
    const calls: string[] = []
    const fetchImpl = vi.fn((url: string | URL | Request) => {
      calls.push(String(url))
      return Promise.resolve(respond(catalogRowFixtures(['cat-cow'])))
    })

    const result = await createCatalogReader({ ...CONFIG, fetch: fetchImpl as typeof fetch })([
      'cat-cow',
    ])

    expect(result.ok).toBe(true)
    const requested = new URL(calls[0])
    expect(requested.pathname).toBe(`/rest/v1/${CATALOG_VIEW}`)
    expect(requested.searchParams.get('select')).toBe(CATALOG_COLUMNS.join(','))
    expect(requested.searchParams.get('id')).toBe('in.("cat-cow")')
  })

  it('reads as the caller, with the anon key and no other credential', async () => {
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>
      expect(headers.apikey).toBe('anon-key')
      expect(headers.Authorization).toBe('Bearer caller-token')
      expect(Object.keys(headers)).not.toContain('service_role')

      return Promise.resolve(respond(catalogRowFixtures(['cat-cow'])))
    })

    await createCatalogReader({ ...CONFIG, fetch: fetchImpl as typeof fetch })(['cat-cow'])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('asks once when nothing references a regression it has not already read', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(respond(catalogRowFixtures(['cat-cow', 'worlds-greatest-stretch']))),
    )

    const result = await createCatalogReader({ ...CONFIG, fetch: fetchImpl as typeof fetch })([
      'cat-cow',
      'worlds-greatest-stretch',
    ])

    expect(result.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('asks a second time for the regressions the first read named', async () => {
    const requested: string[] = []
    const fetchImpl = vi.fn((url: string | URL | Request) => {
      const ids = new URL(String(url)).searchParams.get('id') ?? ''
      requested.push(ids)

      return Promise.resolve(
        respond(catalogRowFixtures(ids.includes('goblet-squat') ? ['goblet-squat'] : ['back-squat'])),
      )
    })

    const result = await createCatalogReader({ ...CONFIG, fetch: fetchImpl as typeof fetch })([
      'back-squat',
    ])

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(requested[1]).toBe('in.("goblet-squat")')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.get('back-squat')?.regression).toEqual({
      exerciseId: 'goblet-squat',
      name: 'Goblet Squat',
    })
  })

  it('asks for nothing when there is nothing to ask about', async () => {
    const fetchImpl = vi.fn()
    const result = await createCatalogReader({ ...CONFIG, fetch: fetchImpl as typeof fetch })([])

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.ok && result.value.size).toBe(0)
  })

  it('reports a refused read as a read failure', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response('{}', { status: 403 })))
    const result = await createCatalogReader({ ...CONFIG, fetch: fetchImpl as typeof fetch })([
      'cat-cow',
    ])

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(ErrorCode.PERSISTENCE_READ_FAILED)
    expect(result.error.details).toEqual({ view: CATALOG_VIEW, status: 403 })
  })

  it('reports an unreachable database as a transport failure, not a read failure', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error('getaddrinfo ENOTFOUND project')))
    const result = await createCatalogReader({ ...CONFIG, fetch: fetchImpl as typeof fetch })([
      'cat-cow',
    ])

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(ErrorCode.NETWORK_SERVER_ERROR)
    // Never the thrown message: a transport error can quote the request it
    // failed on, headers and all.
    expect(JSON.stringify(result.error)).not.toContain('ENOTFOUND')
  })

  it('refuses a row that is not the shape the contract declares', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify([{ id: 'cat-cow', name: '' }]), { status: 200 })),
    )
    const result = await createCatalogReader({ ...CONFIG, fetch: fetchImpl as typeof fetch })([
      'cat-cow',
    ])

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(ErrorCode.PERSISTENCE_READ_FAILED)
  })

  it('selects columns the catalog actually has', () => {
    const migration = read('supabase/migrations/20260921000000_catalog_domain.sql')
    const table = migration.slice(
      migration.indexOf('create table if not exists public.exercise_definitions'),
      migration.indexOf('comment on table public.exercise_definitions'),
    )
    const view = migration.slice(
      migration.indexOf('create or replace view public.exercise_catalog'),
      migration.indexOf('comment on view public.exercise_catalog'),
    )

    // Six of the seven arrive through the view's `ed.*`, so the table body is
    // where they are declared; `muscles` is the one the view assembles. A
    // column renamed under this reader fails here rather than at a 400.
    for (const column of CATALOG_COLUMNS) {
      if (column === 'muscles') continue
      expect(table).toContain(column)
    }
    expect(view).toContain('as muscles')
  })

  it('hydrates end to end from what the reader answered', async () => {
    const fetchImpl = vi.fn((url: string | URL | Request) => {
      const ids = new URL(String(url)).searchParams.get('id') ?? ''
      const wanted = [...ids.matchAll(/"([^"]+)"/g)].map((match) => match[1])

      return Promise.resolve(respond(catalogRowFixtures(wanted)))
    })

    const result = await hydrate(
      validated(),
      createCatalogReader({ ...CONFIG, fetch: fetchImpl as typeof fetch }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(exercisesOf(result.value).map((exercise) => exercise.displayName)).toEqual([
      'Cat-Cow',
      "World's Greatest Stretch",
      'Back Squat',
      'Bulgarian Split Squat',
      'Bodyweight Glute Bridge',
    ])
    expect(result.value.contractVersion).toBe(CONTRACT_VERSION)
  })

  it('does not hydrate when the catalog could not be read', async () => {
    const result = await hydrate(validated(), () =>
      Promise.resolve(err(createError(ErrorCode.PERSISTENCE_READ_FAILED))),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(ErrorCode.PERSISTENCE_READ_FAILED)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Source enumeration, shared with `schemas.test.ts`'s own gates
// ─────────────────────────────────────────────────────────────────────────────

function sources(): string[] {
  const found: string[] = []

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) {
        if (entry !== 'design-system' && entry !== 'node_modules') walk(path)
        continue
      }
      if (/\.tsx?$/.test(entry)) found.push(relative(REPO_ROOT, path))
    }
  }

  walk(join(REPO_ROOT, 'src'))
  walk(join(REPO_ROOT, 'supabase', 'functions'))

  return found
}

const isRuntime = (file: string) => !/\.test\.tsx?$/.test(file) && !file.startsWith('src/test/')
