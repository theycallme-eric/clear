/**
 * DS-06: "a grep for easing curves outside `src/design-system/` finds only
 * `linear` and `steps()`."
 *
 * ATOMIC.md §8 — motion is mechanical, stepped, linear. The one documented
 * exception is the atmosphere blob drift, and it lives inside the vendored
 * export, which this guard deliberately does not scan. App-owned source reads
 * the semantic tokens (`var(--ease-mech)`) instead of naming a curve.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

const APP_SOURCE = 'src'
const VENDORED = join('src', 'design-system')
const SELF = join('src', 'test', 'easing-vocabulary.test.ts')
const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.css']

/** Anything that is not `linear`, `steps()` or a token that resolves to them. */
const NAMED_CURVE = /cubic-bezier\(|(?<![\w-])ease(-in-out|-in|-out)?(?![\w-])/g

function appOwnedFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)

    if (path === VENDORED || path === SELF) {
      return []
    }

    if (entry.isDirectory()) {
      return appOwnedFiles(path)
    }

    return SCANNED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))
      ? [path]
      : []
  })
}

describe('motion vocabulary outside the design system', () => {
  it('names no easing curve of its own', () => {
    const offenders = appOwnedFiles(APP_SOURCE)
      .map((path) => ({
        file: relative(APP_SOURCE, path),
        matches: readFileSync(path, 'utf8').match(NAMED_CURVE) ?? [],
      }))
      .filter((result) => result.matches.length > 0)

    expect(offenders).toEqual([])
  })

  it('scans app-owned source and not the vendored export', () => {
    const scanned = appOwnedFiles(APP_SOURCE)

    expect(scanned).toContain(join('src', 'styles', 'atmosphere.css'))
    expect(scanned).toContain(join('src', 'ui', 'atmosphere.tsx'))
    expect(scanned.some((path) => path.startsWith(VENDORED))).toBe(false)
  })
})
