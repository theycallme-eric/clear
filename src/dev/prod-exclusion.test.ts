/**
 * "`/dev/gallery` is dev-only and excluded from production bundles" — proved
 * against real build output rather than against the source that intends it.
 *
 * The test runs the project's own production build into a scratch directory and
 * reads every asset it emitted. Nothing may carry the gallery's `clr-dev-gallery`
 * prefix, its specimen URL prefix, or a specimen card's markup: the gallery is
 * reached only through the `import.meta.env.DEV` branch in `src/app/router.tsx`,
 * which folds to an empty route list in a build and takes the chunk, its
 * stylesheet and its inlined specimen text with it.
 *
 * A source-level assertion would not do: the claim is about what Rollup emits,
 * and the only way to know is to look.
 */
import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { build } from 'vite'
import { beforeAll, describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '../..')
const OUT_DIR = join(ROOT, 'node_modules/.tmp/ds07-prod-exclusion')

/** Every emitted file, with its text. */
const emitted = new Map<string, string>()

function collect(dir: string, prefix = '') {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const name = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) collect(join(dir, entry.name), name)
    else emitted.set(name, readFileSync(join(dir, entry.name), 'latin1'))
  }
}

beforeAll(async () => {
  rmSync(OUT_DIR, { recursive: true, force: true })

  // Vitest sets NODE_ENV=test for its own process. Vite uses NODE_ENV, not
  // merely `build()`'s default mode, to derive import.meta.env.DEV. Without
  // restoring the production value here this test asks Vite for a build while
  // simultaneously telling it that DEV is true, and reports gallery chunks
  // that the real `npm run build` never emits.
  const previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    await build({
      root: ROOT,
      configFile: join(ROOT, 'vite.config.ts'),
      mode: 'production',
      logLevel: 'silent',
      build: { outDir: OUT_DIR, emptyOutDir: true },
    })
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }

  collect(OUT_DIR)
}, 180_000)

describe('the production build', () => {
  it('emits the app', () => {
    expect(emitted.has('index.html')).toBe(true)
    expect([...emitted.keys()].some((name) => name.endsWith('.js'))).toBe(true)
  })

  it('emits no asset named for the gallery', () => {
    const named = [...emitted.keys()].filter((name) =>
      /gallery|specimen/i.test(name),
    )

    expect(named).toEqual([])
  })

  it('carries no gallery markup, style or specimen text', () => {
    // Each marker is real, load-bearing gallery source: the CSS/DOM prefix, the
    // specimen URL prefix, and a string only a served specimen card contains.
    for (const marker of [
      'clr-dev-gallery',
      '/dev/specimens/',
      '@dsCard',
      'Undescribed previews',
    ]) {
      const carriers = [...emitted]
        .filter(([, text]) => text.includes(marker))
        .map(([name]) => name)

      expect(carriers, marker).toEqual([])
    }
  })

  it('keeps the gallery reachable while developing', () => {
    // The same guard, from the other side: in dev the route table has it. If
    // this ever went false the exclusion above would be vacuously true.
    expect(import.meta.env.DEV).toBe(true)
  })
})
