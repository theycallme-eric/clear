/**
 * TASK-018 (REQ-018; C44, C57, C58, C59; P01, P02, P03; R16, R128, R129,
 * R140; AC-C44-01, AC-C57-01, AC-C58-01, AC-C59-01, AC-R018-01–04;
 * TASK-AC-D97C3E420929, TASK-AC-15110DB92C86, TASK-AC-932FEEF54F21) — the
 * shared focused logging frame's contained viewport, continuous frame,
 * scrolling and focus/chrome contract, at the shared-component boundary
 * (`LoggingOverlay`, `src/ui/refinements/logging-overlay.tsx`).
 *
 * Representative consumers: the shared `TimedResultLog` in its two extremes —
 * the twelve-round ladder's log (rounds, per-movement entries and effort)
 * followed by a consumer's Notes and Save, long enough on any phone to
 * scroll, and the EMOM's end log with a Save, short enough not to — plus the
 * gallery's accepted `?state=ladder-long`. They are mounted here, not on a
 * route: no actual logging entry point has adopted the frame yet (TASK-043–046
 * move them; TASK-041 owns full-route geometry and JOURNEY-018 closure), and
 * nothing here claims one has.
 *
 * jsdom has no layout, so geometry is proved where it is declared: the shared
 * stylesheets are applied to the document and read from the cascade, and the
 * recipe is parsed with PostCSS. The automatic outline's owners were diagnosed
 * in Chromium (TASK-018 progress note): `showModal()` focuses the
 * keyboard-focusable scroller (or, on a tap on blank space, the dialog) and
 * the browser paints its default blue rounded ring there, which no Foundation
 * rule covers; and, wherever `FocusBrackets` is not mounted, Foundation's
 * fallback chamfer ring would light the whole frame. Here the opening focus
 * order is recorded, the containers' rules are read, and Foundation's rule is
 * read from the vendored file with the override's specificity computed
 * against it.
 *
 * Every case name carries "scroll", "outline" or "viewport": check-01 selects
 * them with `--testNamePattern "scroll|outline|viewport"`.
 *
 * Synthetic data only: memory controllers, no account, no network, no writer.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { parse, type Rule } from 'postcss'
import { useState, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { GalleryRefinements } from '../dev/gallery-refinements'
import { galleryLadderProgress } from '../dev/gallery-refinement-flow-data'
import { Button, Input } from '../design-system/index'
import { ladderRungs, ladderUnit } from '../state/ladder'
import { ladderPartialRound } from '../state/ladder-recovery'
import {
  LOGGING_OVERLAY_CLOSE_LABEL,
  LOGGING_VISIBLE_HEIGHT,
  LOGGING_VISIBLE_TOP,
  LoggingOverlay,
} from './refinements/logging-overlay'
import {
  TIMED_NOTES_LABEL,
  TimedResultLog,
  type CompletionResult,
  type EmomResult,
  type MovementEntryLog,
} from './refinements/timed-result-log'

const ROOT = resolve(import.meta.dirname, '../..')
const PRESENTATION_CSS = readFileSync(resolve(ROOT, 'src/ui/refinements/presentation.css'), 'utf8')
const TOKENS_CSS = readFileSync(resolve(ROOT, 'src/ui/refinements/tokens.css'), 'utf8')
const FOUNDATION_CSS = readFileSync(resolve(ROOT, 'src/design-system/css/foundation.css'), 'utf8')
const OVERLAY_SOURCE = readFileSync(resolve(ROOT, 'src/ui/refinements/logging-overlay.tsx'), 'utf8')

/** Generous: the twelve-round log mounts a few hundred controls on a slow CI runner. */
const HEAVY = 20_000

beforeAll(() => {
  for (const [name, css] of [['tokens', TOKENS_CSS], ['presentation', PRESENTATION_CSS]] as const) {
    const style = document.createElement('style')
    style.dataset.task018 = name
    style.textContent = css
    document.head.append(style)
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  // jsdom has no visual viewport; a case that stands one in removes it again.
  Reflect.deleteProperty(window, 'visualViewport')
})

/** Stands in a visual viewport (or its absence) for one case. */
function standInVisualViewport(viewport: FakeVisualViewport | null) {
  Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => viewport })
}

// ─────────────────────────────────────────────────────────────────────────────
// Stylesheet reading
// ─────────────────────────────────────────────────────────────────────────────

/** Every rule in a stylesheet, with its own selector list. */
function rulesOf(css: string): Rule[] {
  const rules: Rule[] = []
  parse(css).walkRules((rule) => void rules.push(rule))
  return rules
}

const normalise = (value: string) => value.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim()

/** The declarations of the one rule whose selector is exactly `selector`. */
function declarations(css: string, selector: string): Map<string, string> {
  const matching = rulesOf(css).filter((rule) => rule.selectors.map(normalise).includes(normalise(selector)))
  expect(matching, `one rule for ${selector}`).toHaveLength(1)
  const result = new Map<string, string>()
  matching[0].walkDecls((decl) => void result.set(decl.prop, normalise(decl.value)))
  return result
}

/** Every rule in the overlay's recipe: any selector naming `.clr-accepted-log`. */
function overlayRules(): Rule[] {
  return rulesOf(PRESENTATION_CSS).filter((rule) => rule.selector.includes('clr-accepted-log'))
}

/** Splits a selector list on its top-level commas (or another top-level separator). */
function splitTopLevel(list: string, separator = ','): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of list) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === separator && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else current += char
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

type Specificity = [number, number, number]

const add = (a: Specificity, b: Specificity): Specificity => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const compare = (a: Specificity, b: Specificity) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

/**
 * Selectors Level 4 specificity for the subset these rules use: ids,
 * classes, attributes, pseudo-classes (`:is`/`:has`/`:not` take their most
 * specific argument), type selectors and pseudo-elements.
 */
function specificity(selector: string): Specificity {
  let total: Specificity = [0, 0, 0]
  let index = 0
  while (index < selector.length) {
    const char = selector[index]
    if (char === '#') {
      total = add(total, [1, 0, 0])
      index += 1
      while (index < selector.length && /[\w-]/.test(selector[index])) index += 1
    } else if (char === '.') {
      total = add(total, [0, 1, 0])
      index += 1
      while (index < selector.length && /[\w-]/.test(selector[index])) index += 1
    } else if (char === '[') {
      total = add(total, [0, 1, 0])
      index = selector.indexOf(']', index) + 1
    } else if (char === ':' && selector[index + 1] === ':') {
      total = add(total, [0, 0, 1])
      index += 2
      while (index < selector.length && /[\w-]/.test(selector[index])) index += 1
    } else if (char === ':') {
      index += 1
      let name = ''
      while (index < selector.length && /[\w-]/.test(selector[index])) name += selector[index++]
      if (selector[index] === '(') {
        let depth = 0
        const start = index + 1
        for (; index < selector.length; index += 1) {
          if (selector[index] === '(') depth += 1
          if (selector[index] === ')' && --depth === 0) break
        }
        const argument = selector.slice(start, index)
        index += 1
        if (['is', 'has', 'not'].includes(name)) {
          const most = splitTopLevel(argument).map(specificity).sort(compare).at(-1) ?? [0, 0, 0]
          total = add(total, most as Specificity)
        } else if (name !== 'where') total = add(total, [0, 1, 0])
      } else total = add(total, [0, 1, 0])
    } else if (/[a-zA-Z]/.test(char)) {
      total = add(total, [0, 0, 1])
      while (index < selector.length && /[\w-]/.test(selector[index])) index += 1
    } else index += 1
  }
  return total
}

// ─────────────────────────────────────────────────────────────────────────────
// Representative consumers
// ─────────────────────────────────────────────────────────────────────────────

const NOTES_LABEL = 'Notes · optional'

/**
 * A long form: the shared ladder log over the gallery's twelve-round ladder,
 * Incomplete through round 7 (its twelve tiles, each movement's round-8
 * amount and load, the effort faces), then the consumer's own Notes and Save.
 */
function LongLadderConsumer({ onSave }: { onSave: () => void }) {
  const [block] = useState(() => galleryLadderProgress(12))
  const rungs = ladderRungs(block.exercises)
  const [value, setValue] = useState<CompletionResult>({ completed: false, effort: null })
  const [through, setThrough] = useState<number | null>(7)
  const [entries, setEntries] = useState<MovementEntryLog['values']>({})
  const [notes, setNotes] = useState('')
  const partialRound = ladderPartialRound(through, rungs.length)
  return (
    <>
      <TimedResultLog
        format="ladder"
        value={value}
        onChange={setValue}
        rounds={{ rungs, unit: ladderUnit(block.exercises), completedThrough: through, partialRound, onChange: setThrough }}
        movements={{
          exercises: block.exercises,
          partialRound,
          weightUnit: 'kg',
          values: entries,
          onChange: (exerciseId, next) => setEntries((current) => ({ ...current, [exerciseId]: next })),
        }}
      />
      <Input label={NOTES_LABEL} multiline rows={2} value={notes} onChange={setNotes} />
      <Button onClick={onSave}>Save</Button>
    </>
  )
}

/** A short form: the EMOM's end log and the consumer's Save. */
function ShortEmomConsumer({ onSave }: { onSave: () => void }) {
  const [value, setValue] = useState<EmomResult>({ notes: '' })
  return (
    <>
      <TimedResultLog format="emom" value={value} onChange={setValue} />
      <Button onClick={onSave}>Save</Button>
    </>
  )
}

/** A consumer that owns `open`, as every logging entry point will. */
function Harness({ title, initiallyOpen = true, children }: { title: string; initiallyOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initiallyOpen)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Log
      </button>
      <LoggingOverlay open={open} title={title} onClose={() => setOpen(false)}>
        {children}
      </LoggingOverlay>
    </>
  )
}

function parts() {
  const dialog = document.querySelector<HTMLDialogElement>('dialog.clr-accepted-log')!
  const frame = dialog.querySelector<HTMLElement>('[data-logging-frame]')!
  const scroll = dialog.querySelector<HTMLElement>('[data-logging-scroll]')!
  const body = scroll.querySelector<HTMLElement>('.clr-accepted-log__body')!
  return { dialog, frame, scroll, body }
}

const closeButton = () => screen.getByRole('button', { name: LOGGING_OVERLAY_CLOSE_LABEL })

/** A stand-in visual viewport: the part of the screen above an on-screen keyboard. */
class FakeVisualViewport extends EventTarget {
  height = 844
  offsetTop = 0
  move(height: number, offsetTop: number, type: 'resize' | 'scroll') {
    this.height = height
    this.offsetTop = offsetTop
    this.dispatchEvent(new Event(type))
  }
}

describe('TASK-018 LoggingOverlay — contained viewport, scroll and chrome', () => {
  it(
    'AC-C44-01 scroll: one stationary continuous frame holds the only scrolling region, and the long log’s Notes and Save are inside it',
    () => {
      const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
      render(
        <Harness title="Ladder · 12 rounds">
          <LongLadderConsumer onSave={() => {}} />
        </Harness>,
      )
      const { dialog, frame, scroll, body } = parts()

      // A native modal: showModal, named by its title, the page behind inert.
      expect(showModal).toHaveBeenCalledTimes(1)
      expect(dialog.open).toBe(true)
      expect(screen.getByRole('dialog', { name: 'Ladder · 12 rounds' })).toBe(dialog)

      // One continuous chamfered frame whose single child is the scroller: no
      // pinned header or foot outside it, no second surface.
      expect(frame).toHaveClass('clr-chamfer', 'clr-chamfer--lg')
      expect([...frame.children]).toEqual([scroll])
      expect(scroll.querySelector('header')).toContainElement(screen.getByRole('heading', { name: 'Ladder · 12 rounds' }))

      // The long form, all of it, scrolls inside: twelve rung tiles, the
      // per-movement entries, the effort faces, Notes and Save.
      const rounds = within(body).getByRole('group', { name: /Rounds completed/ })
      expect(within(rounds).getAllByRole('button')).toHaveLength(12)
      for (const control of [
        ...within(body).getAllByRole('textbox'),
        within(body).getByRole('textbox', { name: NOTES_LABEL }),
        within(body).getByRole('button', { name: 'Save' }),
      ]) {
        expect(scroll).toContainElement(control)
      }

      // Only the scroller scrolls; the frame clips and the dialog does not scroll.
      expect(getComputedStyle(scroll).overflowY).toBe('auto')
      expect(getComputedStyle(frame).overflow).toBe('hidden')
      expect(getComputedStyle(dialog).overflow).toBe('visible')
      for (const element of dialog.querySelectorAll<HTMLElement>('*')) {
        if (element === scroll) continue
        const style = getComputedStyle(element)
        expect(['auto', 'scroll'], `${element.className} must not scroll`).not.toContain(style.overflowY)
        // Nothing pinned: a sticky or fixed foot would cut across the form.
        expect(['sticky', 'fixed'], `${element.className} must not be pinned`).not.toContain(style.position)
      }
      for (const rule of overlayRules()) {
        rule.walkDecls(/^(overflow|overflow-y|overflow-block)$/, (decl) => {
          if (/auto|scroll/.test(decl.value)) expect(rule.selector).toBe('.clr-accepted-log__scroll')
        })
        rule.walkDecls('position', (decl) => expect(decl.value, rule.selector).not.toMatch(/sticky|fixed/))
      }
    },
    HEAVY,
  )

  it(
    'AC-C57-01 AC-R018-01 scroll: the scrolling region meets the inner lower border — no bottom inset, clipped on the inner chamfer, and no interior line crossing the form',
    () => {
      render(
        <Harness title="Ladder · 12 rounds">
          <LongLadderConsumer onSave={() => {}} />
        </Harness>,
      )
      const { frame, scroll, body } = parts()

      // The frame's only inset is its own border: the scroller sits on the ring's inner edge.
      const frameRecipe = declarations(PRESENTATION_CSS, '.clr-accepted-log__frame')
      expect(frameRecipe.get('padding')).toBe('var(--border-width)')
      expect(frameRecipe.get('overflow')).toBe('hidden')

      // No bottom inset on the scroller (P01's blank strip): inline padding only.
      const scrollRecipe = declarations(PRESENTATION_CSS, '.clr-accepted-log__scroll')
      expect(scrollRecipe.get('padding')).toBe('var(--logging-inline-padding) var(--logging-inline-padding) 0')
      expect(getComputedStyle(scroll).paddingBottom).toMatch(/^0(px)?$/)
      for (const rule of overlayRules()) {
        rule.walkDecls(/^(padding-bottom|padding-block|padding-block-end|margin-block-end|margin-bottom|border-bottom|border-block-end)$/, (decl) => {
          expect(rule.selector, `${decl.prop} inset on the scroller`).not.toMatch(/__scroll(?![-\w])/)
          expect(rule.selector, `${decl.prop} inset on the frame`).not.toMatch(/__frame(?![-\w])/)
        })
      }

      // The scroller's own clip is the ring's inner chamfer — exactly the
      // polygon Foundation's large chamfer gives its surface layer — so a
      // partly visible control is cut on the inner diagonal, not painted over it.
      const innerChamfer = declarations(FOUNDATION_CSS, '.clr-chamfer--lg::before').get('clip-path')
      expect(innerChamfer).toContain('var(--chamfer-lg)')
      expect(scrollRecipe.get('clip-path')).toBe(innerChamfer)

      // The space after the last control belongs to the scrolled content, so it
      // is reached only at the bottom and never shows as a strip mid-scroll.
      expect(declarations(PRESENTATION_CSS, '.clr-accepted-log__body').get('padding-block-end')).toBe('var(--logging-section-gap)')
      expect(scroll).toContainElement(body)

      // No interior line: no overlay part draws a border or divider, and the
      // timed log's own inline rule is dropped inside the frame.
      for (const rule of overlayRules()) {
        rule.walkDecls(/^border/, (decl) => expect(decl.value, `${rule.selector} { ${decl.prop} }`).toBe('0'))
      }
      expect(declarations(PRESENTATION_CSS, '.clr-accepted-log .clr-timed-log').get('border')).toBe('0')
      expect(frame.querySelectorAll('hr, [role="separator"]')).toHaveLength(0)
    },
    HEAVY,
  )

  it(
    'AC-C58-01 AC-R018-02 outline: opening and reopening never focus the frame or the scroller — the opening focus lands on the X control',
    async () => {
      const user = userEvent.setup()
      render(
        <Harness title="Ladder · 12 rounds">
          <LongLadderConsumer onSave={() => {}} />
        </Harness>,
      )
      const { dialog, frame, scroll, body } = parts()

      // First open: the X has focus; the containers are not focusable at all.
      expect(document.activeElement).toBe(closeButton())
      for (const container of [dialog, frame, scroll, body]) {
        expect(container).not.toHaveAttribute('tabindex')
        expect(container).not.toHaveFocus()
      }
      expect(OVERLAY_SOURCE).not.toMatch(/tabIndex/)

      // Close and reopen: the same, every time.
      for (let round = 0; round < 2; round += 1) {
        await user.click(closeButton())
        expect(dialog.open).toBe(false)
        await user.click(screen.getByRole('button', { name: 'Log' }))
        expect(dialog.open).toBe(true)
        expect(document.activeElement).toBe(closeButton())
        for (const container of [dialog, frame, scroll, body]) expect(container).not.toHaveFocus()
      }
    },
    HEAVY,
  )

  it(
    'AC-C58-01 AC-R018-02 outline: the diagnosed owners — the browser’s default ring on a focused scroller or dialog, and Foundation’s fallback chamfer ring on the frame — never reach the containers, and the opening focus moves to the X in the same commit as showModal',
    () => {
      // The browser's half: showModal() lands focus on the scroller (or the
      // dialog). The overlay moves it to the X in the same layout effect, so
      // no frame paints with the container focused.
      const order: string[] = []
      vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function showModal(this: HTMLDialogElement) {
        this.open = true
        order.push('showModal')
      })
      const onFocus = (event: FocusEvent) => order.push(`focus:${(event.target as Element).getAttribute('aria-label') ?? (event.target as Element).tagName}`)
      document.addEventListener('focusin', onFocus)
      try {
        render(
          <Harness title="EMOM · 10 minutes">
            <ShortEmomConsumer onSave={() => {}} />
          </Harness>,
        )
      } finally {
        document.removeEventListener('focusin', onFocus)
      }
      expect(order).toEqual(['showModal', `focus:${LOGGING_OVERLAY_CLOSE_LABEL}`])

      // The owner, as shipped: any chamfered element doubles its border in the
      // focus hue while a descendant is focus-visible. The dialog frame is a
      // chamfered element, so the X's opening focus or a focused text field lit
      // the whole frame.
      const owner = declarations(FOUNDATION_CSS, '.clr-chamfer:has(:focus-visible)::after')
      expect(owner.get('background')).toBe('var(--focus-ring)')
      expect(declarations(FOUNDATION_CSS, '.clr-chamfer:has(:focus-visible)::before').get('inset')).toBe(
        'calc(var(--border-width) * 2)',
      )

      // The override keeps the frame's own border and width, and outranks the
      // owner by specificity, whichever stylesheet loads last.
      const ring = '.clr-accepted-log .clr-accepted-log__frame:is(:focus-visible, :has(:focus-visible))::after'
      const surface = '.clr-accepted-log .clr-accepted-log__frame:is(:focus-visible, :has(:focus-visible))::before'
      expect(declarations(PRESENTATION_CSS, ring).get('background-color')).toBe('var(--brd)')
      expect(declarations(PRESENTATION_CSS, surface).get('inset')).toBe('var(--bw)')
      for (const [ours, theirs] of [
        [ring, '.clr-chamfer:has(:focus-visible)::after'],
        [ring, '.clr-chamfer:focus-visible::after'],
        [surface, '.clr-chamfer:has(:focus-visible)::before'],
      ]) {
        expect(compare(specificity(ours), specificity(theirs)), `${ours} over ${theirs}`).toBeGreaterThan(0)
      }

      // The dialog, frame, scroller and body never draw an outline if a browser focuses them.
      const quiet = rulesOf(PRESENTATION_CSS).find((rule) =>
        rule.selectors.map(normalise).includes('.clr-accepted-log:is(:focus, :focus-visible)'),
      )!
      expect(quiet.selectors.map(normalise)).toEqual([
        '.clr-accepted-log:is(:focus, :focus-visible)',
        '.clr-accepted-log .clr-accepted-log__frame:is(:focus, :focus-visible, :has(:focus-visible))',
        '.clr-accepted-log .clr-accepted-log__scroll:is(:focus, :focus-visible)',
        '.clr-accepted-log .clr-accepted-log__body:is(:focus, :focus-visible)',
      ])
      let outline = ''
      quiet.walkDecls('outline', (decl) => void (outline = decl.value))
      expect(outline).toBe('none')
    },
  )

  it(
    'AC-C58-01 AC-R018-02 outline: intentional keyboard focus is kept — Tab moves from the X through the controls to Notes and Save, and no control loses its focus indicator',
    async () => {
      const user = userEvent.setup()
      render(
        <Harness title="Ladder · 12 rounds">
          <LongLadderConsumer onSave={() => {}} />
        </Harness>,
      )
      const { dialog, scroll } = parts()
      expect(document.activeElement).toBe(closeButton())

      // Forward through the form: every stop is a control inside the scroller.
      const notes = screen.getByRole('textbox', { name: NOTES_LABEL })
      const save = screen.getByRole('button', { name: 'Save' })
      const visited: Element[] = []
      for (let step = 0; step < 80 && document.activeElement !== save; step += 1) {
        await user.tab()
        visited.push(document.activeElement!)
      }
      expect(visited).toContain(notes)
      expect(document.activeElement).toBe(save)
      for (const stop of visited) {
        expect(scroll).toContainElement(stop as HTMLElement)
        expect(stop.matches('button, input, textarea, select, a[href]')).toBe(true)
      }
      expect(dialog).toContainElement(save)

      // The overlay removes outlines only from its containers: no rule of its
      // recipe touches a control's focus or outline.
      for (const rule of overlayRules()) {
        for (const selector of rule.selectors) {
          if (!/outline|focus/.test(rule.toString())) continue
          const subject = splitTopLevel(normalise(selector), ' ').at(-1)!
          expect(subject, selector).toMatch(/^\.clr-accepted-log(__frame|__scroll|__body)?(:|$)/)
        }
      }
    },
    HEAVY,
  )

  it(
    'AC-C59-01 AC-R018-03 scroll: every scrollbar is hidden, overlay scrollbars included, while wheel, touch, keyboard and focus scrolling still work and nothing scrolls sideways',
    async () => {
      const user = userEvent.setup()
      render(
        <Harness title="Ladder · 12 rounds">
          <LongLadderConsumer onSave={() => {}} />
        </Harness>,
      )
      const { scroll } = parts()

      const recipe = declarations(PRESENTATION_CSS, '.clr-accepted-log__scroll')
      expect(recipe.get('scrollbar-width')).toBe('none')
      expect(recipe.get('overflow-y')).toBe('auto')
      // No sideways scroll by construction, not by clipping (the 0.14.3
      // contract forbids a horizontal workaround): the scroller and its body
      // shrink to the frame, and the declared region scrolls on one axis only.
      expect(recipe.get('min-width')).toBe('0')
      expect(declarations(PRESENTATION_CSS, '.clr-accepted-log__body').get('min-width')).toBe('0')
      expect([...recipe.keys()].filter((prop) => prop.startsWith('overflow'))).toEqual(['overflow-y'])
      expect(recipe.get('overscroll-behavior')).toBe('contain')
      const webkit = declarations(PRESENTATION_CSS, '.clr-accepted-log__scroll::-webkit-scrollbar')
      expect(webkit.get('display')).toBe('none')
      expect(webkit.get('width')).toBe('0')
      expect(webkit.get('height')).toBe('0')
      expect(getComputedStyle(scroll).overflowY).toBe('auto')
      // Nothing in the recipe disables scrolling or input.
      for (const rule of overlayRules()) {
        rule.walkDecls(/^(touch-action|pointer-events|overflow-y)$/, (decl) => expect(decl.value, rule.selector).not.toMatch(/^(none|hidden)$/))
      }

      // Wheel and touch reach the region untouched: the overlay never cancels them.
      const wheel = new WheelEvent('wheel', { deltaY: 240, bubbles: true, cancelable: true })
      scroll.dispatchEvent(wheel)
      expect(wheel.defaultPrevented).toBe(false)
      const touch = new Event('touchmove', { bubbles: true, cancelable: true })
      scroll.dispatchEvent(touch)
      expect(touch.defaultPrevented).toBe(false)
      scroll.scrollTop = 480
      expect(scroll.scrollTop).toBe(480)

      // Keyboard and focus scrolling: the keys reach the focused control's
      // scrolling ancestor, and a lower field takes focus where it is.
      const notes = screen.getByRole('textbox', { name: NOTES_LABEL })
      act(() => notes.focus())
      expect(notes).toHaveFocus()
      await user.keyboard('{PageDown}')
      expect(notes).toHaveFocus()
      act(() => screen.getByRole('button', { name: 'Save' }).focus())
      const pageDown = new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true })
      document.activeElement!.dispatchEvent(pageDown)
      expect(pageDown.defaultPrevented).toBe(false)
    },
    HEAVY,
  )

  it(
    'AC-C44-01 AC-R018-04 viewport: the frame’s height is the visible viewport less the gap and safe areas — it follows an on-screen keyboard and is never a half-height cap',
    () => {
      const visual = new FakeVisualViewport()
      standInVisualViewport(visual)
      const removed = vi.spyOn(visual, 'removeEventListener')
      render(
        <Harness title="Ladder · 12 rounds">
          <LongLadderConsumer onSave={() => {}} />
        </Harness>,
      )
      const { dialog } = parts()

      // Open: the dialog's box is the whole visible viewport.
      expect(dialog.style.getPropertyValue(LOGGING_VISIBLE_HEIGHT)).toBe('844px')
      expect(dialog.style.getPropertyValue(LOGGING_VISIBLE_TOP)).toBe('0px')
      // A keyboard comes up: the box shrinks to what is left above it.
      act(() => visual.move(452, 0, 'resize'))
      expect(dialog.style.getPropertyValue(LOGGING_VISIBLE_HEIGHT)).toBe('452px')
      // The browser pans the visual viewport: the box follows it.
      act(() => visual.move(452, 120, 'scroll'))
      expect(dialog.style.getPropertyValue(LOGGING_VISIBLE_TOP)).toBe('120px')

      // The recipe: the visible height (else the dynamic viewport) less the
      // accepted gap and both safe areas; no height of its own, so a short
      // form is as tall as its content.
      const frame = declarations(PRESENTATION_CSS, '.clr-accepted-log__frame')
      expect(frame.get('max-height')).toBe(
        'calc(min(100dvh, var(--logging-visible-height, 100dvh)) - var(--logging-viewport-gap) - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
      )
      expect(frame.has('height')).toBe(false)
      expect(frame.has('min-height')).toBe(false)
      const box = declarations(PRESENTATION_CSS, '.clr-accepted-log')
      expect(box.get('inset-block-start')).toBe('var(--logging-visible-top, var(--spacing-0))')
      expect(box.get('inset-block-end')).toBe(
        'calc(100% - var(--logging-visible-top, var(--spacing-0)) - var(--logging-visible-height, 100%))',
      )
      expect(box.get('width')).toBe('min(calc(100% - var(--spacing-400)), var(--logging-dialog-width))')
      expect(TOKENS_CSS).toMatch(/--logging-viewport-gap:\s*var\(--spacing-800\);/)
      expect(TOKENS_CSS).toMatch(/--logging-dialog-width:\s*32rem;/)
      // The rejected cap: no fraction of the screen anywhere in the recipe.
      for (const rule of overlayRules()) {
        rule.walkDecls(/height|inset/, (decl) => expect(decl.value, rule.selector).not.toMatch(/\b(50|60)(dvh|vh|svh|lvh|%)/))
      }

      // Closed: the listeners go and the variables are cleared.
      act(() => closeButton().click())
      expect(removed).toHaveBeenCalledWith('resize', expect.any(Function))
      expect(removed).toHaveBeenCalledWith('scroll', expect.any(Function))
      expect(dialog.style.getPropertyValue(LOGGING_VISIBLE_HEIGHT)).toBe('')
      act(() => visual.move(300, 0, 'resize'))
      expect(dialog.style.getPropertyValue(LOGGING_VISIBLE_HEIGHT)).toBe('')
    },
    HEAVY,
  )

  it(
    'AC-C44-01 AC-R018-04 viewport: a short form fits its content with Save in reach, and without a visual viewport the dynamic viewport is the fallback',
    async () => {
      standInVisualViewport(null)
      const save = vi.fn()
      const user = userEvent.setup()
      render(
        <Harness title="EMOM · 10 minutes">
          <ShortEmomConsumer onSave={save} />
        </Harness>,
      )
      const { dialog, scroll } = parts()
      expect(dialog.style.getPropertyValue(LOGGING_VISIBLE_HEIGHT)).toBe('')
      expect(scroll).toContainElement(screen.getByRole('textbox', { name: TIMED_NOTES_LABEL }))
      await user.click(within(scroll).getByRole('button', { name: 'Save' }))
      expect(save).toHaveBeenCalledTimes(1)
    },
    HEAVY,
  )

  it(
    'JOURNEY-018 viewport: gallery ladder-long draws the shared frame around the actual TimedResultLog — opened, closed and reopened, scrolling inside, nothing saved',
    async () => {
      const fetch = vi.spyOn(globalThis, 'fetch')
      const user = userEvent.setup()
      render(
        <MemoryRouter initialEntries={['/gallery/refinements?state=ladder-long']}>
          <GalleryRefinements />
        </MemoryRouter>,
      )
      const state = document.querySelector<HTMLElement>('[data-refinement-state="ladder-long"]')!
      expect(state).not.toBeNull()
      expect(screen.getByRole('link', { name: 'Long ladder results · final scrolling' })).toHaveAttribute('aria-current', 'page')

      // Closed on load: no modal opens by itself.
      const dialog = state.querySelector<HTMLDialogElement>('dialog.clr-accepted-log')!
      expect(dialog.open).toBe(false)

      for (let round = 0; round < 2; round += 1) {
        await user.click(within(state).getByRole('button', { name: 'Open long ladder results' }))
        expect(dialog.open).toBe(true)
        const { frame, scroll } = parts()
        expect([...frame.children]).toEqual([scroll])
        expect(document.activeElement).toBe(closeButton())
        const log = scroll.querySelector<HTMLFormElement>('form.clr-timed-log')!
        expect(log.dataset.timedFormat).toBe('ladder')
        expect(within(log).getAllByRole('button', { name: /^Round \d+:/ })).toHaveLength(12)
        await user.click(closeButton())
        expect(dialog.open).toBe(false)
      }
      expect(fetch).not.toHaveBeenCalled()
    },
    HEAVY,
  )
})
