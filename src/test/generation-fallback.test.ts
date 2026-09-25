/**
 * GEN-03's grep gate: **there is no mock workout in this codebase.**
 *
 * Defect D2 was a generation failure that fell back to a fabricated workout and
 * a toast, so the app looked like it worked while it was broken. Nothing a type
 * or a schema can say prevents that coming back — it is a value somebody adds
 * and a branch somebody writes — so the absence is asserted directly, across
 * every runtime file, in the two places a workout could be invented: a fixture
 * held in production source, and production source importing the test harness.
 *
 * Test files are exempt, and that is the whole point of the rule rather than a
 * hole in it: fixtures belong to tests. `src/test/` is the harness itself and
 * ships nowhere, which `src/dev/prod-exclusion.test.ts` proves against real
 * build output for the one dev surface a bundle could otherwise reach.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const REPO_ROOT = resolve(import.meta.dirname, '../..')

/** Every `.ts`/`.tsx` file under the two trees that become running code. */
function sources(): string[] {
  const found: string[] = []

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) {
        // Vendored, and it knows nothing about workouts.
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

/** A test, or the harness tests share. Everything else is runtime. */
const isRuntime = (file: string) =>
  !/\.test\.tsx?$/.test(file) && !file.startsWith(join('src', 'test'))

const read = (file: string) => readFileSync(join(REPO_ROOT, file), 'utf8')

/**
 * Comments are stripped before the scan, because prose *about* the defect is
 * how the reasoning stays in the tree — `schemas.ts` and `generate-workout`
 * both explain what D2 was. A sentence naming the mistake is not the mistake.
 * Only whole-line `//` comments go, so a `//` inside a url survives with the
 * code around it.
 */
export function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart()
      return !trimmed.startsWith('//') && !trimmed.startsWith('*')
    })
    .join('\n')
}

/** A name a fabricated workout would have to be called something like. */
const FIXTURE_NAME =
  /(mock|demo|sample|fake|stub|placeholder|dummy|fallback|canned)[_ -]?workout|workout[_ -]?(mock|fixture|sample|demo|fallback)/i

/** The harness, imported from somewhere it must never be imported from. */
const HARNESS_IMPORT = /from\s+'[^']*(?:\/|^)(?:test\/factories|test\/[a-z-]*(?:double|fixtures))'/

describe('there is no mock workout', () => {
  const runtime = sources().filter(isRuntime)

  it('has runtime files to check', () => {
    // Without this the two assertions below could pass by finding nothing at
    // all — a gate over an empty list is not a gate.
    expect(runtime.length).toBeGreaterThan(50)
    expect(runtime).toContain(join('src', 'data', 'generation.ts'))
  })

  it('names no workout fixture in runtime source', () => {
    const offenders = runtime.filter((file) => FIXTURE_NAME.test(withoutComments(read(file))))

    expect(offenders).toEqual([])
  })

  it('imports no test harness from runtime source', () => {
    const offenders = runtime.filter((file) => HARNESS_IMPORT.test(read(file)))

    expect(offenders).toEqual([])
  })

  it('would catch a fixture that was added', () => {
    // The gate proving itself: the same scan over a file that does have one.
    const planted = "export const mockWorkout = { title: 'Fabricated' }\n"

    expect(FIXTURE_NAME.test(withoutComments(planted))).toBe(true)
    expect(FIXTURE_NAME.test(withoutComments('// the old build fell back to a mock workout\n'))).toBe(
      false,
    )
    expect(HARNESS_IMPORT.test("import { makeGenerationOutput } from '../test/factories'")).toBe(
      true,
    )
  })
})
