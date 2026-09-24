/**
 * EXE-01 — "no renderer implements its own competing completion persistence
 * path", asserted on the files rather than hoped for.
 *
 * The requirement's reason for centralising block completion is that six
 * renderers each growing their own effort capture and their own write is how
 * OVR-03's one input stops being one input. A behavioural test cannot prove
 * that: EXE-03's renderer does not exist yet, and a suite that passes today
 * passes just as loudly on the day one of them writes its own row.
 *
 * So the shape is checked here, the way `schemas.test.ts` checks that there is
 * one zod source and `e2e-harness.test.ts` checks that no test-only code is
 * reachable from the bundle. Each assertion below names the one file allowed to
 * do a thing; adding a second is the failure.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = resolve(import.meta.dirname, '../..')

const read = (file: string) => readFileSync(join(REPO_ROOT, file), 'utf-8')

const isDirectory = (path: string): boolean => {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** Every app-owned TypeScript file that ships, plus the edge functions. */
function runtimeSources(): string[] {
  const found: string[] = []

  const walk = (dir: string) => {
    if (!isDirectory(dir)) return

    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) {
        // Vendored, and it knows nothing about this app's tables.
        if (entry !== 'design-system' && entry !== 'node_modules') walk(path)
        continue
      }
      if (/\.tsx?$/.test(entry)) found.push(relative(REPO_ROOT, path))
    }
  }

  walk(join(REPO_ROOT, 'src'))
  walk(join(REPO_ROOT, 'supabase', 'functions'))

  return found.filter(
    (file) => !/\.test\.tsx?$/.test(file) && !file.startsWith('src/test/'),
  )
}

const sources = runtimeSources()

function filesMatching(pattern: RegExp): string[] {
  return sources.filter((file) => pattern.test(read(file))).sort()
}

describe('one writer for block_results (EXE-01)', () => {
  it('finds the sources it is meant to be checking', () => {
    // A walk that stopped finding files would pass every assertion below.
    expect(sources).toContain('src/data/workout.ts')
    expect(sources).toContain('src/state/block-completion-provider.tsx')
    expect(sources).toContain('src/ui/block-renderers.tsx')
    expect(sources.some((file) => file.startsWith('supabase/functions/'))).toBe(true)
  })

  it('names the table in exactly one place', () => {
    expect(filesMatching(/from\(\s*'block_results'\s*\)/)).toEqual(['src/data/workout.ts'])
  })

  it('builds the row from one mapping, called from that same place', () => {
    // The mapping is declared in `block-completion.ts`; it is *called* by the
    // writer and by nobody else.
    expect(filesMatching(/(?<!function )\bblockResultInsert\(/)).toEqual([
      'src/data/workout.ts',
    ])
  })

  it('records a completion from one path', () => {
    expect(filesMatching(/blockResults\.record\(/)).toEqual([
      'src/state/block-completion-provider.tsx',
    ])
  })
})

describe('one perceived-effort capture (EXE-01)', () => {
  it('asks the question in one component, mounted by the one path', () => {
    expect(filesMatching(/<BlockEffortDialog/)).toEqual([
      'src/state/block-completion-provider.tsx',
    ])
  })

  it('provides the renderers’ seam from that same path', () => {
    // Providing the context is what makes something the shell's completion
    // path. Two providers would be two paths, whatever they each wrote.
    expect(filesMatching(/<BlockCompletionContext/)).toEqual([
      'src/state/block-completion-provider.tsx',
    ])
  })
})

describe('a renderer supplies an outcome and nothing else (EXE-01)', () => {
  /** Where the renderers live: app-owned presentation, DS components composed. */
  const renderers = sources.filter((file) => file.startsWith('src/ui/'))

  it('gives no renderer a transport to write with', () => {
    const reaching = renderers.filter((file) =>
      /from '\.\.\/data\/(workout|supabase|sessions)'/.test(read(file)),
    )

    expect(reaching).toEqual([])
  })

  it('leaves every renderer taking completion from the seam', () => {
    // `block-renderers.tsx` is the registry plus the default panel today; when
    // EXE-03 and EXE-04a…c replace its entries they inherit this assertion.
    const completing = renderers.filter((file) => /completeBlock\(/.test(read(file)))

    expect(completing).toEqual(['src/ui/block-renderers.tsx'])
    for (const file of completing) {
      expect(read(file)).toContain('useBlockCompletion()')
    }
  })
})
