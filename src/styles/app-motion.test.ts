/**
 * DS-05 acceptance, the timing half. jsdom parses no stylesheet, so the
 * guarantees that live in CSS are asserted against the source: the dialog
 * entrance composes the three shipped channels, every duration and easing is
 * a token, the entrance is nothing a toast does, and reduced motion silences
 * all of it so the end state renders immediately.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(import.meta.dirname, 'app-motion.css'), 'utf-8')

/** Everything inside the reduced-motion at-rule, or '' if there is none. */
function reducedMotionBlock(source: string): string {
  const start = source.indexOf('@media (prefers-reduced-motion: reduce)')
  if (start === -1) return ''
  const open = source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  return ''
}

/** Every animation the stylesheet runs — the reduced-motion `none` is not one. */
const animations = [...css.matchAll(/animation:\s*([^;]+);/g)]
  .map((match) => match[1].trim())
  .filter((animation) => !animation.startsWith('none'))

describe('the entrance composes the shipped vocabulary', () => {
  it('hard-cuts the backdrop rather than fading it', () => {
    expect(css).toMatch(/\.clr-app-dialog-enter::backdrop\s*\{[^}]*animation:\s*clr-cut-in/)
  })

  it('traces the chamfer border layer, not the element that owns the notch', () => {
    expect(css).toMatch(
      /\.clr-app-dialog-enter\s*>\s*\.clr-chamfer::after\s*\{[^}]*animation:\s*clr-trace/,
    )
    expect(css).not.toMatch(/\.clr-app-dialog-enter\s*>\s*\.clr-chamfer\s*\{/)
  })

  it('materializes the panel contents', () => {
    expect(css).toMatch(
      /\.clr-app-dialog-enter\s*>\s*\.clr-chamfer\s*>\s*\*\s*\{[^}]*animation:\s*clr-materialize/,
    )
  })

  it('is visibly distinct from a toast arrival — no phosphor anywhere in it', () => {
    // The shipped Toast bakes `.clr-phosphor-in` into its own class list; a
    // dialog constructs itself instead.
    expect(css).not.toMatch(/clr-phosphor-in/)
  })
})

describe('timings are tokens', () => {
  it('declares three entrance animations and no others', () => {
    expect(animations).toHaveLength(3)
  })

  it('reads every duration and easing from a token', () => {
    for (const animation of animations) {
      expect(animation).toMatch(/var\(--dur-[a-z-]+\)/)
      expect(animation).toMatch(/var\(--(step-\d+|ease-[a-z]+)\)/)
    }
  })

  it('hardcodes no duration or timing function', () => {
    expect(css).not.toMatch(/\b\d+(\.\d+)?m?s\b/)
    expect(css).not.toMatch(/\b(ease|ease-in|ease-out|ease-in-out|linear|cubic-bezier|steps)\s*\(?/)
  })

  it('pairs each channel with the token pairing of its shipped class', () => {
    // Tuned against the export's Motion Lab card: the trace is the slow
    // 24-step sweep, the materialize the 3-step base, the cut the 2-step cut.
    expect(css).toMatch(/clr-trace var\(--dur-slow\) var\(--step-24\)/)
    expect(css).toMatch(/clr-materialize var\(--dur-base\) var\(--step-3\)/)
    expect(css).toMatch(/clr-cut-in var\(--dur-cut\) var\(--step-2\)/)
  })
})

describe('reduced motion renders the end state immediately', () => {
  const reduced = reducedMotionBlock(css)

  it('silences every entrance channel the stylesheet animates', () => {
    expect(reduced).toMatch(/animation:\s*none\s*!important/)
    expect(reduced).toContain('.clr-app-dialog-enter::backdrop')
    expect(reduced).toContain('.clr-app-dialog-enter > .clr-chamfer::after')
    expect(reduced).toContain('.clr-app-dialog-enter > .clr-chamfer > *')
  })

  it('removes the animation rather than shortening or delaying it', () => {
    expect(reduced).not.toMatch(/animation-duration|animation-delay|transition/)
  })
})

describe('the stylesheet ships with the app', () => {
  it('is imported by the entry point after the skins', () => {
    const main = readFileSync(resolve(import.meta.dirname, '../main.tsx'), 'utf-8')
    expect(main.indexOf("./styles/app-motion.css")).toBeGreaterThan(
      main.indexOf('./design-system/css/skins.css'),
    )
  })
})
