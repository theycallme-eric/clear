/**
 * DS-06: "a grep for easing curves outside `src/design-system/` finds only
 * `linear` and `steps()`."
 *
 * ATOMIC.md §8 — motion is mechanical, stepped, linear. The one documented
 * exception is the atmosphere blob drift, and it lives inside the vendored
 * export, which this guard deliberately does not scan. App-owned source reads
 * the semantic tokens (`var(--ease-mech)`) instead of naming a curve.
 *
 * One owner-selected exception, ledger EXC-07 (clear-refinement-20261103
 * TASK-008: C22, C61; R133, R135, R144; P05): the recovered countdown warning's
 * exact smooth 1.5 s ease-in-out breathe, which the owner selected over the
 * shipped stepped pulse ("the four-second stepped micro-pulse is explicitly not
 * this effect", R135). It is stated once, as its semantic variable in
 * `src/ui/refinements/tokens.css`, and every other app-owned file still names
 * no curve. The pin is exact: a second curve, a second occurrence, the curve
 * anywhere else or the exception no longer needed all fail.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

const APP_SOURCE = 'src'
const VENDORED = join('src', 'design-system')
const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.css']

/** Anything that is not `linear`, `steps()` or a token that resolves to them. */
const NAMED_CURVE = /cubic-bezier\(|(?<![\w-])ease(-in-out|-in|-out)?(?![\w-])/g

function appOwnedFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)

    // Test assertions necessarily name the forbidden curves they guard against;
    // this check covers code and styles that ship to users.
    if (path === VENDORED || entry.name.includes('.test.')) {
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

/** EXC-07: the one owner-selected curve, its one file and its one declaration. */
const OWNER_SELECTED_CURVE = {
  file: join('ui', 'refinements', 'tokens.css'),
  matches: ['ease-in-out'],
  declaration: /^\s*--countdown-warning-easing: ease-in-out;$/m,
} as const

describe('motion vocabulary outside the design system', () => {
  it('names no easing curve of its own', () => {
    const offenders = appOwnedFiles(APP_SOURCE)
      .map((path) => ({
        file: relative(APP_SOURCE, path),
        text: readFileSync(path, 'utf8'),
      }))
      .map(({ file, text }) => ({ file, text, matches: text.match(NAMED_CURVE) ?? [] }))
      .filter((result) => result.matches.length > 0)
      .filter((result) => !(
        result.file === OWNER_SELECTED_CURVE.file &&
        result.matches.join() === OWNER_SELECTED_CURVE.matches.join() &&
        OWNER_SELECTED_CURVE.declaration.test(result.text)
      ))
      .map(({ file, matches }) => ({ file, matches }))

    expect(offenders).toEqual([])
  })

  it('states the one owner-selected curve exactly once, as the countdown warning’s semantic variable (EXC-07)', () => {
    const text = readFileSync(join(APP_SOURCE, OWNER_SELECTED_CURVE.file), 'utf8')

    expect(text.match(NAMED_CURVE)).toEqual([...OWNER_SELECTED_CURVE.matches])
    expect(text).toMatch(OWNER_SELECTED_CURVE.declaration)
  })

  it('scans app-owned source and not the vendored export', () => {
    const scanned = appOwnedFiles(APP_SOURCE)

    expect(scanned).toContain(join('src', 'styles', 'atmosphere.css'))
    expect(scanned).toContain(join('src', 'ui', 'atmosphere.tsx'))
    expect(scanned.some((path) => path.startsWith(VENDORED))).toBe(false)
  })
})
