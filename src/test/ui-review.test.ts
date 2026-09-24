/**
 * CORE-05 — the half of the accessibility contract that is a habit rather
 * than a mechanism.
 *
 * Automated checks catch roughly a third of real problems, so the requirement
 * asks DEVELOPMENT.md to document the keyboard-only pass and the screen-reader
 * pass as part of reviewing a UI issue. A documented habit quietly disappears
 * in an edit nobody meant as a policy change, which is what this catches.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '../..')
const development = readFileSync(resolve(repoRoot, 'DEVELOPMENT.md'), 'utf-8')

/** The body of the 'Reviewing a UI issue' section, up to the next `## `. */
function reviewSection(): string {
  const start = development.indexOf('## Reviewing a UI issue')
  expect(start).toBeGreaterThan(-1)
  const end = development.indexOf('\n## ', start + 1)
  return development.slice(start, end === -1 ? undefined : end)
}

describe('DEVELOPMENT.md requires the two manual passes (CORE-05)', () => {
  const section = reviewSection()

  it('names the keyboard-only pass and says what it covers', () => {
    expect(section).toContain('### The keyboard-only pass')
    // The things a keyboard user loses first if nobody looks.
    expect(section).toMatch(/skip link/i)
    expect(section).toMatch(/focus is \*\*visible on every stop\*\*/i)
    expect(section).toMatch(/first invalid control/i)
  })

  it('names the screen-reader pass and says what it covers', () => {
    expect(section).toContain('### The screen-reader pass')
    expect(section).toMatch(/landmark/i)
    expect(section).toMatch(/heading list|outline/i)
    expect(section).toMatch(/announce/i)
  })

  it('asks for the reduced-motion preference to be turned on', () => {
    expect(section).toMatch(/prefers-reduced-motion|reduce motion/i)
  })

  it('states that automated checks are the floor, not the review', () => {
    expect(section).toMatch(/floor/i)
    expect(section).toMatch(/axe-core/)
    // ENV-07 has landed: the suite runs axe today, and the document must not
    // still be promising it.
    expect(section).not.toMatch(/once ENV-07/)
  })

  it('makes the passes a condition of review rather than a suggestion', () => {
    expect(section).toMatch(/not reviewed until/i)
  })
})
