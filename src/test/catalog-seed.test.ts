/**
 * DATA-02 — the catalog seed and its taxonomy verification.
 *
 * The seed's own report is not evidence about the seed: a transform that
 * counted its output and compared it to a constant it also produced would
 * report 140 while being wrong in every row. So these tests come at it from
 * outside — they read the committed capture directly, they break the transform
 * on purpose to confirm each failure mode is actually detected, and they check
 * the artifacts in the tree rather than the ones held in memory.
 *
 * Nothing here needs a database, because neither does the seed.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { parseCsv, parsePgArray } from '../../scripts/catalog-seed/csv.mjs'
import * as reviewed from '../../scripts/catalog-seed/reviewed.mjs'
import { build, main } from '../../scripts/catalog-seed/seed.mjs'
import { loadAnatomyTags, loadSnapshot } from '../../scripts/catalog-seed/sources.mjs'
import { transform } from '../../scripts/catalog-seed/transform.mjs'
import { verify } from '../../scripts/catalog-seed/verify.mjs'

const root = resolve(__dirname, '../..')
const capture = resolve(root, 'docs/backend/snapshot/2026-09-18T162821Z/catalog')

/** Read a capture file without going through the seed's own reader. */
function captureRows(name: string): string[] {
  return readFileSync(resolve(capture, name), 'utf8').trim().split('\n').slice(1)
}

/** Run the CLI without letting its report reach the test output. */
function run(argv: string[]): { code: number; output: string } {
  const lines: string[] = []
  const spy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: unknown) => {
      lines.push(String(chunk))
      return true
    })
  try {
    return { code: main(argv), output: lines.join('') }
  } finally {
    spy.mockRestore()
  }
}

describe('the audited preservation set', () => {
  it('is what the capture actually contains', () => {
    // Counted off the files, not off the seed. If these four lines disagree
    // with REQ-013 the capture is wrong, and no amount of transform is a fix.
    expect(captureRows('exercise_definitions.csv')).toHaveLength(140)
    expect(captureRows('exercise_anchors.csv')).toHaveLength(150)
    expect(captureRows('exercise_muscle_groups.csv')).toHaveLength(488)
    expect(captureRows('movement_patterns.csv')).toHaveLength(27)
  })

  it('is read without loss', () => {
    const snapshot = loadSnapshot()

    expect(snapshot.definitions).toHaveLength(140)
    expect(snapshot.anchors).toHaveLength(150)
    expect(snapshot.muscles).toHaveLength(488)
    expect(snapshot.patterns).toHaveLength(27)
    expect(loadAnatomyTags()).toHaveLength(140)
  })

  it('never regenerates the 173-row expectation the audit retired', () => {
    const { transformed } = build()

    expect(reviewed.RETIRED_EXERCISE_COUNT).toBe(173)
    for (const rows of [
      transformed.definitions,
      transformed.muscles,
      transformed.weights,
      transformed.anchors,
      transformed.legacyPatterns,
    ]) {
      expect(rows.length).not.toBe(173)
    }
  })
})

describe('npm run seed', () => {
  it('reports exactly 140 exercise definitions', () => {
    const { code, output } = run(['--check'])

    expect(code).toBe(0)
    expect(output).toContain('140 exercise definitions')
  })

  it('passes every taxonomy check', () => {
    const { verification } = build()

    // Named rather than counted: a check that silently stopped running would
    // keep a bare `failures.length === 0` green forever.
    const groups = new Set(verification.checks.map((check) => check.group))
    expect([...groups].sort()).toEqual([
      'anatomy',
      'counts',
      'dropped',
      'duplicated',
      'equivalence',
      'invented',
      'orphaned',
    ])
    expect(verification.failures).toEqual([])
  })

  it('is idempotent — a second run produces byte-identical artifacts', () => {
    const first = build()
    const second = build()

    expect(second.artifacts.map((entry) => entry.label)).toEqual(
      first.artifacts.map((entry) => entry.label),
    )
    for (const [index, entry] of second.artifacts.entries()) {
      expect(entry.contents).toBe(first.artifacts[index].contents)
    }
  })

  it('has left the committed artifacts current', () => {
    // `--check` writes nothing and fails if any artifact in the tree differs
    // from what the transform produces. This is the test that catches a
    // hand-edited seed file.
    const { code, output } = run(['--check'])

    expect(output).not.toContain('FAILED')
    expect(code).toBe(0)
  })

  it('rejects an option it does not understand rather than ignoring it', () => {
    const { code, output } = run(['--apply'])

    expect(code).toBe(1)
    expect(output).toContain('unknown option')
  })
})

describe('taxonomy verification fails loudly', () => {
  /** Verify a deliberately damaged transform and return the failing checks. */
  function breaking(damage: (input: ReturnType<typeof transform>) => void) {
    const transformed = transform()
    damage(transformed)
    return verify(transformed).failures
  }

  it('on an orphaned reference', () => {
    const failures = breaking((transformed) => {
      transformed.muscles = [
        ...transformed.muscles,
        { exerciseId: 'not-an-exercise', muscleGroup: 'glutes', role: 'primary' },
      ]
    })

    expect(failures.map((failure) => failure.group)).toContain('orphaned')
    expect(failures.some((failure) => failure.detail.includes('not-an-exercise'))).toBe(true)
  })

  it('on a duplicated reference', () => {
    const failures = breaking((transformed) => {
      transformed.weights = [...transformed.weights, transformed.weights[0]]
    })

    const duplicated = failures.filter((failure) => failure.group === 'duplicated')
    expect(duplicated).not.toHaveLength(0)
    expect(duplicated[0].detail).toContain(transform().weights[0].exerciseId)
  })

  it('on a dropped reference', () => {
    const failures = breaking((transformed) => {
      transformed.definitions = transformed.definitions.slice(1)
    })

    expect(failures.map((failure) => failure.group)).toContain('dropped')
    expect(failures.map((failure) => failure.group)).toContain('counts')
  })

  it('on an invented reference', () => {
    const failures = breaking((transformed) => {
      transformed.weights = [
        ...transformed.weights,
        {
          exerciseId: transformed.definitions[0].id,
          movementPattern: 'conditioning',
          isPrimary: false,
          derived: true,
        },
      ]
    })

    const invented = failures.filter((failure) => failure.group === 'invented')
    expect(invented).not.toHaveLength(0)
    expect(invented.some((failure) => failure.detail.includes('invented'))).toBe(true)
  })

  it('on a second primary pattern for one exercise', () => {
    // `exercise_pattern_weights_one_primary_idx` would abort the apply. Catching
    // it here rather than in TASK-072 is the point of verifying offline.
    const failures = breaking((transformed) => {
      const primary = transformed.weights.find((weight) => weight.isPrimary)!
      transformed.weights = [
        ...transformed.weights,
        { ...primary, movementPattern: 'conditioning' },
      ]
    })

    expect(
      failures.some((failure) => failure.name === 'at most one primary pattern per exercise'),
    ).toBe(true)
  })

  it('on a value outside the schema’s vocabulary', () => {
    const failures = breaking((transformed) => {
      transformed.definitions[0].exerciseRole = 'strongman'
    })

    expect(
      failures.some(
        (failure) =>
          failure.group === 'invented' && failure.detail.includes('strongman'),
      ),
    ).toBe(true)
  })

  it('on a candidate set that has silently changed', () => {
    const failures = breaking((transformed) => {
      // Re-tagging one exercise is exactly the kind of well-meaning edit that
      // moves a candidate set without anyone noticing.
      const squat = transformed.definitions.find((row) => row.id === 'back-squat')!
      squat.derivedPatterns = ['squat', 'press']
    })

    expect(
      failures.some((failure) => failure.group === 'equivalence'),
    ).toBe(true)
  })
})

describe('the transformation of the 150 anchor links', () => {
  const { transformed, verification } = build()

  it('gives every link exactly one reviewed disposition', () => {
    const counts = transformed.anchors.reduce<Record<string, number>>((tally, link) => {
      tally[link.disposition] = (tally[link.disposition] ?? 0) + 1
      return tally
    }, {})

    expect(counts).toEqual({ ...reviewed.ANCHOR_DISPOSITIONS, dropped_region: undefined })
    expect(transformed.anchors).toHaveLength(150)
  })

  it('preserves every pattern-bearing link as a weight, ranking included', () => {
    const weighted = transformed.anchors.filter((link) => link.disposition === 'weighted')

    expect(transformed.weights).toHaveLength(weighted.length)
    expect(transformed.weights.filter((weight) => weight.isPrimary)).toHaveLength(
      weighted.filter((link) => link.isPrimary).length,
    )
    for (const weight of transformed.weights) {
      expect(
        weighted.some(
          (link) =>
            link.exerciseId === weight.exerciseId &&
            link.anchor === weight.movementPattern &&
            link.isPrimary === weight.isPrimary,
        ),
      ).toBe(true)
    }
  })

  it('drops only "surprise", and only where role or section still carries it', () => {
    const dropped = transformed.anchors.filter((link) => link.disposition !== 'weighted')

    expect(new Set(dropped.map((link) => link.anchor))).toEqual(new Set(['surprise']))
    expect(
      verification.checks.find(
        (check) => check.name === 'dropped non-pattern anchors are carried by role or section',
      )?.ok,
    ).toBe(true)
  })

  it('records the weights the derivation cannot reach instead of hiding them', () => {
    // These are real losses in candidate retrieval, and the report exists so
    // they are read rather than counted. The seed keeps the rows regardless.
    expect(verification.weightsOutsideDerivation).toEqual(
      [...reviewed.WEIGHTS_OUTSIDE_DERIVATION].sort(),
    )
    for (const entry of verification.weightsOutsideDerivation) {
      const [exerciseId, pattern] = entry.split(':')
      expect(
        transformed.weights.some(
          (weight) => weight.exerciseId === exerciseId && weight.movementPattern === pattern,
        ),
      ).toBe(true)
    }
  })
})

describe('the 27 legacy movement patterns', () => {
  const { transformed } = build()

  it('are all accounted for', () => {
    expect(transformed.legacyPatterns).toHaveLength(27)

    for (const pattern of transformed.legacyPatterns) {
      // Either the pattern's anchor became a weight, or it was "surprise" and
      // the exercise carries it through role and section. Nothing else.
      expect(['weighted', 'dropped_non_pattern']).toContain(pattern.anchorDisposition)
      // Every category is a session_focus name except `core`, which is a section.
      if (pattern.sessionFocus === null) {
        expect(reviewed.LEGACY_CATEGORIES_WITHOUT_FOCUS).toContain(pattern.category)
      }
    }
  })

  it('leave nothing behind when the pattern_id column is retired', () => {
    // The old primary anchors were built from this join (migration 00016). If
    // it still holds, `pattern_id` carries no information the weights do not.
    const anchorOf = new Map(transformed.legacyPatterns.map((row) => [row.id, row.anchor]))
    const primaryOf = new Map(
      transformed.anchors
        .filter((link) => link.isPrimary)
        .map((link) => [link.exerciseId, link.anchor]),
    )

    for (const definition of transformed.definitions) {
      expect(primaryOf.get(definition.id)).toBe(anchorOf.get(definition.legacyPatternId))
    }
  })
})

describe('the reviewed workout-anatomy tags', () => {
  it('cover all 140 exercises, one each', () => {
    const { transformed } = build()
    const tagged = new Set(loadAnatomyTags().map((tag) => tag.exerciseId))

    expect(tagged.size).toBe(140)
    for (const definition of transformed.definitions) {
      expect(tagged.has(definition.id)).toBe(true)
      expect(definition.componentMovements.length).toBeGreaterThan(0)
    }
  })

  it('match the component frequencies DATA_MODEL.md recorded independently', () => {
    // §3's table was written from the live catalog before this seed existed. It
    // is the only external check on a migration that was never deployed.
    const { transformed } = build()
    const frequency = new Map<string, number>()
    for (const definition of transformed.definitions) {
      for (const component of definition.componentMovements) {
        frequency.set(component, (frequency.get(component) ?? 0) + 1)
      }
    }

    expect(Object.fromEntries([...frequency].sort())).toEqual(
      Object.fromEntries(Object.entries(reviewed.COMPONENT_FREQUENCY).sort()),
    )
  })
})

describe('the emitted SQL', () => {
  const { artifacts } = build({ dev: true })
  const sql = (label: string) =>
    artifacts.find((artifact) => artifact.label.endsWith(label))!.contents

  it('re-applies without touching a row', () => {
    // Idempotence that stops at "does not error" would still bump 140
    // updated_at values on every apply.
    expect(sql('010_exercise_definitions.sql')).toContain('is distinct from')
    expect(sql('020_exercise_muscle_groups.sql')).toContain('on conflict (exercise_id, muscle_group, role) do nothing')
    expect(sql('030_exercise_pattern_weights.sql')).toContain(
      'where w.is_primary is distinct from excluded.is_primary',
    )
  })

  it('asserts its own counts at apply time', () => {
    expect(sql('010_exercise_definitions.sql')).toContain('expected 140')
    expect(sql('020_exercise_muscle_groups.sql')).toContain('expected 488')
    expect(sql('030_exercise_pattern_weights.sql')).toContain('expected 102')
  })

  it('links progressions in a second pass, because the pairs are mutually recursive', () => {
    const definitions = sql('010_exercise_definitions.sql')
    const insertAt = definitions.indexOf('insert into public.exercise_definitions')
    const updateAt = definitions.indexOf('update public.exercise_definitions')

    expect(insertAt).toBeGreaterThan(-1)
    expect(updateAt).toBeGreaterThan(insertAt)
    // `air-squat` progresses to `split-squat`, which regresses to `air-squat`.
    expect(definitions).toContain("('air-squat'::text, null::text, 'split-squat'::text)")
  })

  it('preserves a null variant rather than flattening it to an empty string', () => {
    expect(sql('010_exercise_definitions.sql')).not.toContain(", '', ")
  })

  it('escapes an apostrophe in catalog copy', () => {
    // Two exercises are named with one — `Child's Pose` and `World's Greatest
    // Stretch`. Unescaped, each ends its string literal early and the file will
    // not parse, which is a failure worth catching before TASK-072.
    const { transformed } = build()
    const apostrophed = transformed.definitions.filter((definition) =>
      [definition.name, ...definition.coachingCues].some((text) => text.includes("'")),
    )

    expect(apostrophed.map((definition) => definition.id)).toEqual([
      'childs-pose',
      'worlds-greatest-stretch',
    ])
    expect(sql('010_exercise_definitions.sql')).toContain("'Child''s Pose'")
    expect(sql('010_exercise_definitions.sql')).toContain("'World''s Greatest Stretch'")
  })
})

describe('the --dev baseline', () => {
  it('is written only when asked for, and is not part of [db.seed]', () => {
    const withoutDev = build().artifacts.map((artifact) => artifact.label)
    const withDev = build({ dev: true }).artifacts.map((artifact) => artifact.label)

    expect(withoutDev).not.toContain('supabase/seed/090_dev_baseline.sql')
    expect(withDev).toContain('supabase/seed/090_dev_baseline.sql')

    // Not in `sql_paths`, so `supabase db reset` never applies it. The comment
    // above that key does name the file, which is the point of the comment.
    const config = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8')
    const sqlPaths = config.slice(config.indexOf('sql_paths'))
    expect(sqlPaths).not.toContain('090_dev_baseline.sql')
    for (const label of withoutDev.filter((entry) => entry.startsWith('supabase/seed/'))) {
      expect(sqlPaths).toContain(label.replace('supabase/', ''))
    }
  })

  it('seeds an owner profile and a default location', () => {
    const dev = build({ dev: true }).artifacts.find((artifact) =>
      artifact.label.endsWith('090_dev_baseline.sql'),
    )!.contents

    expect(dev).toContain('insert into public.locations')
    expect(dev).toContain('is_default')
    expect(dev).toContain('insert into public.profiles')
    expect(dev).toContain('default_location_id')
    // Exactly one default, asserted rather than assumed.
    expect(dev).toContain('has no single default location')
  })

  it('creates data rather than preserving a prior personal row', () => {
    const dev = build({ dev: true }).artifacts.find((artifact) =>
      artifact.label.endsWith('090_dev_baseline.sql'),
    )!.contents

    // It reads no user-owned table, and the capture it is generated alongside
    // contains none to read (docs/process/CATALOG_MIGRATION_SCOPE.md, Exclude).
    expect(dev).not.toMatch(/from (public\.)?(auth\.)?(workout|saved|exercise_set_logs)/)
    expect(dev).not.toContain('insert into auth.users')
    // The owner id is supplied at apply time; a seed must not invent one that
    // profiles' foreign key would then reject.
    expect(dev).toContain("current_setting('clear.dev_owner_id', true)")
    expect(dev).toMatch(/raise exception[\s\S]*no auth user/)
  })

  it('names the issue it is waiting for instead of silently doing nothing', () => {
    const dev = build({ dev: true }).artifacts.find((artifact) =>
      artifact.label.endsWith('090_dev_baseline.sql'),
    )!.contents

    expect(dev).toContain("to_regclass('public.profiles') is null")
    expect(dev).toContain('DATA-01b')
  })
})

describe('the capture readers', () => {
  it('tell a NULL apart from an empty string', () => {
    // `regression` is legitimately null on 124 of the 140 exercises, and
    // CATALOG_MIGRATION_SCOPE.md requires that preserved rather than flattened.
    const rows = parseCsv('id,regression\na,\nb,""\n')

    expect(rows[0].regression).toBeNull()
    expect(rows[1].regression).toBe('')
  })

  it('read a quoted comma and a doubled quote', () => {
    const rows = parseCsv('id,cue\na,"Chest up, core braced"\nb,"say ""go"""\n')

    expect(rows[0].cue).toBe('Chest up, core braced')
    expect(rows[1].cue).toBe('say "go"')
  })

  it('refuse a row whose field count disagrees with the header', () => {
    expect(() => parseCsv('a,b\n1,2,3\n')).toThrow(/expected 2/)
  })

  it('read Postgres array literals, empty included', () => {
    expect(parsePgArray('{}')).toEqual([])
    expect(parsePgArray(null)).toEqual([])
    expect(parsePgArray('{warmup,mobility}')).toEqual(['warmup', 'mobility'])
    expect(parsePgArray('{"Chest up, core braced","Knees out"}')).toEqual([
      'Chest up, core braced',
      'Knees out',
    ])
  })
})
