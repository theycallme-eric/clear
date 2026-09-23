/**
 * CORE-05 — the reduced-motion end-state contract, asserted across every
 * app-owned stylesheet.
 *
 * The requirement is narrower than "turn the animation off". Under
 * `prefers-reduced-motion: reduce` an app-composed animation must render its
 * **final** state immediately: nothing may wait on an animation to become
 * interactive, and nothing may disappear because its animation was disabled.
 * Those are two distinct failure modes, and both are structural, so both are
 * checked against the source rather than trusted to review:
 *
 *   1. **Nothing hides.** No rule inside a reduced-motion block may blank an
 *      element (`display: none`, `visibility: hidden`, `opacity: 0`). Removing
 *      the animation from an element whose animation was what revealed it is
 *      how content vanishes for the people who asked for less motion.
 *   2. **Nothing starts hidden.** An animated rule may not set an invisible
 *      resting state and rely on the animation to reveal it, because that
 *      resting state is exactly what a silenced animation leaves behind.
 *
 * jsdom parses no stylesheet, so this reads the CSS as text — the same
 * technique `app-motion.test.ts` uses for the timing half of DS-05.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const srcDir = resolve(import.meta.dirname, '..')

/** Every stylesheet the app owns — the vendored export is not one of them. */
function appStylesheets(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'design-system') continue

    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      appStylesheets(full, found)
    } else if (entry.name.endsWith('.css')) {
      found.push(full)
    }
  }
  return found
}

const stylesheets = appStylesheets(srcDir).map((path) => ({
  name: path.slice(srcDir.length + 1),
  css: readFileSync(path, 'utf-8'),
}))

/** The bodies of every `prefers-reduced-motion: reduce` block in a stylesheet. */
function reducedMotionBlocks(css: string): string[] {
  const blocks: string[] = []
  const query = '@media (prefers-reduced-motion: reduce)'

  let from = 0
  for (;;) {
    const start = css.indexOf(query, from)
    if (start === -1) return blocks

    const open = css.indexOf('{', start)
    let depth = 0
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === '{') depth += 1
      if (css[i] === '}') {
        depth -= 1
        if (depth === 0) {
          blocks.push(css.slice(open + 1, i))
          from = i
          break
        }
      }
    }
    if (depth !== 0) return blocks
  }
}

/** Declaration blocks paired with the selector that introduces them. */
function rules(css: string): { selector: string; body: string }[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...withoutComments.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1].trim().replace(/\s+/g, ' '),
    body: match[2],
  }))
}

const HIDES = /(?:^|[;{\s])(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?!\.)\s*(?:!important)?\s*[;}]?)/

describe('reduced motion renders the end state, it does not hide it', () => {
  it('has stylesheets to check', () => {
    expect(stylesheets.map((sheet) => sheet.name)).toContain('styles/a11y.css')
    expect(stylesheets.length).toBeGreaterThan(2)
  })

  for (const sheet of stylesheets) {
    it(`${sheet.name} blanks nothing under reduced motion`, () => {
      const offenders = reducedMotionBlocks(sheet.css)
        .flatMap(rules)
        .filter((rule) => HIDES.test(rule.body))
        .map((rule) => rule.selector)

      expect(offenders).toEqual([])
    })

    it(`${sheet.name} animates nothing out of an invisible resting state`, () => {
      // An `animation`/`transition` shorthand in the same rule as an invisible
      // resting state is the pattern that breaks: silence the animation and
      // the resting state is all that is left.
      const offenders = rules(sheet.css)
        .filter(
          (rule) =>
            /(?:^|[;{\s])(?:animation|transition)\s*:/.test(rule.body) &&
            !/(?:animation|transition)\s*:\s*none/.test(rule.body) &&
            HIDES.test(rule.body),
        )
        .map((rule) => rule.selector)

      expect(offenders).toEqual([])
    })
  }
})

/**
 * The app's global fallback, for animation nobody named. It collapses
 * durations rather than deleting animations, because an animation deleted
 * mid-flight never applies its `forwards` fill and its end state never lands.
 */
describe('the global fallback in a11y.css completes animations', () => {
  const a11y = stylesheets.find((sheet) => sheet.name === 'styles/a11y.css')
  const reduced = reducedMotionBlocks(a11y?.css ?? '').join('\n')

  it('collapses every duration and delay to effectively nothing', () => {
    for (const property of [
      'animation-duration',
      'animation-delay',
      'transition-duration',
      'transition-delay',
    ]) {
      expect(reduced).toMatch(
        new RegExp(`${property}:\\s*0\\.01ms\\s*!important`),
      )
    }
  })

  it('lets a repeating animation finish rather than leaving it mid-cycle', () => {
    expect(reduced).toMatch(/animation-iteration-count:\s*1\s*!important/)
  })

  it('never deletes the animation wholesale, which would drop its fill', () => {
    expect(reduced).not.toMatch(/animation\s*:\s*none/)
    expect(reduced).not.toMatch(/animation-fill-mode/)
  })

  it('applies to every element, including generated content', () => {
    expect(reduced).toMatch(/\*,\s*\*::before,\s*\*::after/)
  })

  it('ships with the app', () => {
    const main = readFileSync(resolve(srcDir, 'main.tsx'), 'utf-8')
    expect(main).toContain('./styles/a11y.css')
  })
})
