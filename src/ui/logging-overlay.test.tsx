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
 * TASK-016 (REQ-016; C40, C41, C43; R81, R90, R91, R100, R104, R105, R106,
 * R110, R113, R127, R131; AC-C40-01, AC-C41-01, AC-C43-01, AC-R016-01–03;
 * TASK-AC-F1CC1A37FB0E, TASK-AC-73CE385048B8, TASK-AC-C0A657D4BABE) shares
 * this file: the selected dialog, header, backdrop and modal close/focus
 * behaviour, at the same boundary with representative consumers. Its cases
 * sit in their own describe block; each name carries "header", "focus",
 * "close" or "backdrop" and none of TASK-018's words, so TASK-016's check-01
 * (`--testNamePattern "header|focus|close|backdrop"`) selects them and
 * TASK-018's does not. (Some TASK-018 names carry "focus" or "close" too; they
 * run under TASK-016's pattern as counted, not required, cases.) The header's
 * top alignment and the backdrop were also measured in Chromium (TASK-016
 * progress note); jsdom proves the declared recipe and the behaviour.
 *
 * TASK-017 (REQ-017; C05, C42, C47; R108, R109, R111, R112, R131; AC-C05-01,
 * AC-C42-01, AC-C47-01, AC-R017-01–03; TASK-AC-0C1431FDDA19,
 * TASK-AC-9B1E8E32EE3B, TASK-AC-582934B08D11) shares this file too: the
 * shared movement-group and label/control rhythm contracts (tokens.css
 * `--logging-label-gap`, `--logging-count-gap`, `--logging-movement-gap`,
 * `--logging-movement-field-gap`; presentation.css `.clr-logging-movement`
 * and the legend rhythm of `.clr-timed-log`, `.clr-accepted-log` and
 * `.clr-logging-movement`) and the removal of the superset's added helper
 * paragraph, at the shared-component boundary with representative consumers
 * (the shared `TimedResultLog`'s For Time and ladder logs inline and in the
 * frame, the superset's `SupersetRoundSheet`, the frame's Workout feedback
 * specimen) and the accepted `?state=for_time`. Its cases sit in their own
 * describe block, whose name carries "group", and each case name carries
 * "group", "spacing" or "helper" and none of TASK-018's or TASK-016's words,
 * so TASK-017's check-01 (`--testNamePattern "group|spacing|helper"`) selects
 * them and neither of the other checks does. jsdom has no layout, so the
 * spacing is read from the cascade: every rule of the stylesheets that reach
 * these elements (Foundation, the effort row's and the presentation recipe) is
 * matched against the rendered element, the winner taken by specificity and
 * order, and its variable resolved through tokens.css to Foundation's spacing
 * step. Provider acceptance only: TASK-043–046 move the routes' logging
 * moments into the frame, and TASK-041 owns JOURNEY-017's full-route closure.
 *
 * Synthetic data only: memory controllers, no account, no network, no writer.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { parse, type Declaration, type Rule } from 'postcss'
import { useMemo, useState, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { GalleryRefinements } from '../dev/gallery-refinements'
import { SUPERSET_BLOCK } from '../dev/gallery-refinement-cards-data'
import { galleryLadderProgress } from '../dev/gallery-refinement-flow-data'
import { CAPPED_SAMPLE_FOR_TIME, galleryAmrapProgress, galleryTimedProgress } from '../dev/gallery-refinement-forms-data'
import { LoggingOverlayWorkoutFeedback } from '../dev/gallery-refinement-forms'
import { Button, Input } from '../design-system/index'
import { ladderRungs, ladderUnit } from '../state/ladder'
import { ladderPartialRound } from '../state/ladder-recovery'
import { SetLoggingContext, type SetLoggingApi } from '../state/set-logging'
import { MovementCountdown } from './movement-countdown'
import { SupersetRoundSheet, type RoundDraft } from './set-logger'
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

// ─────────────────────────────────────────────────────────────────────────────
// TASK-016 — the selected dialog, header, backdrop and close (C40, C41, C43)
// ─────────────────────────────────────────────────────────────────────────────

/** The one header of the open dialog, and its two parts in order. */
function header() {
  const { dialog } = parts()
  const head = dialog.querySelector<HTMLElement>('[data-logging-head]')!
  return { dialog, head, title: head.children[0] as HTMLElement, xFrame: head.children[1] as HTMLElement }
}

/** The selected A / Balanced backdrop, as the accepted reference declares it. */
const BALANCED_BACKDROP =
  'radial-gradient(ellipse at center, transparent 35%, color-mix(in srgb, var(--base) var(--logging-backdrop-edge-tint), transparent) 100%), color-mix(in srgb, var(--base) var(--logging-backdrop-tint), transparent)'

/** Moves the wall clock and lets the clocks read it, as a phone returning to the foreground does. */
function passSeconds(now: { value: number }, seconds: number) {
  now.value += seconds * 1000
  act(() => {
    window.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
  })
}

describe('TASK-016 LoggingOverlay — selected dialog, header, backdrop and close', () => {
  it(
    'AC-C41-01 AC-R016-02 TASK-AC-F1CC1A37FB0E header: every title — one line, wrapped, a superset’s Log round 1 and Workout feedback — is followed by the framed icon-only X named “Close log”, with no visible Close word',
    async () => {
      const user = userEvent.setup()
      for (const title of ['EMOM · 10 minutes', 'Log round 1', 'Ladder · 12 rounds · Incomplete through round 7 of 12']) {
        const { unmount } = render(
          <Harness title={title}>
            <ShortEmomConsumer onSave={() => {}} />
          </Harness>,
        )
        const { dialog, head, title: heading, xFrame } = header()
        // Title first, then the X: nothing else in the header.
        expect(head.children).toHaveLength(2)
        expect(heading).toBe(screen.getByRole('heading', { level: 2, name: title }))
        expect(dialog).toHaveAttribute('aria-labelledby', heading.id)

        // The framed X: the shared secondary icon button inside its emitting
        // bleed, chamfered, with the shared hit area, named and wordless.
        const x = within(xFrame).getByRole('button', { name: LOGGING_OVERLAY_CLOSE_LABEL })
        expect(x).toBe(closeButton())
        expect(xFrame).toHaveClass('clr-bleed')
        expect(xFrame.style.getPropertyValue('--bleed')).toBe('var(--border-cta-primary)')
        expect(x).toHaveClass('clr-chamfer', 'clr-btn', 'clr-hit')
        expect(x).not.toHaveClass('clr-btn--quiet')
        expect(x.querySelector('svg')).not.toBeNull()
        expect(x.textContent?.trim()).toBe('')
        // No visible Close word anywhere in the dialog.
        expect(dialog.textContent).not.toMatch(/close/i)
        expect(within(dialog).queryAllByRole('button', { name: /close/i })).toEqual([x])
        unmount()
      }

      // The owner's wrapped-title example (R106): the gallery's Workout feedback dialog.
      render(<LoggingOverlayWorkoutFeedback />)
      await user.click(screen.getByRole('button', { name: 'Open workout feedback' }))
      const { dialog, head, title } = header()
      expect(title).toHaveTextContent('Workout feedback')
      expect(screen.getByRole('dialog', { name: 'Workout feedback' })).toBe(dialog)
      expect(within(head).getByRole('button', { name: LOGGING_OVERLAY_CLOSE_LABEL }).textContent?.trim()).toBe('')
      expect(document.activeElement).toBe(closeButton())
    },
    HEAVY,
  )

  it(
    'AC-C41-01 AC-R016-02 TASK-AC-73CE385048B8 header: the X’s frame starts on the title’s visible top — the header aligns to its start and the title’s line box is trimmed to its capitals, so a wrapped title grows downwards beside the X',
    () => {
      render(
        <Harness title="Ladder · 12 rounds · Incomplete through round 7 of 12">
          <ShortEmomConsumer onSave={() => {}} />
        </Harness>,
      )
      const { head, title, xFrame } = header()
      expect(title).toHaveClass('clr-accepted-log__title')
      expect(head).toHaveClass('clr-accepted-log__head')

      // Both parts start at the header's top; the X never centres on the lines.
      const row = declarations(PRESENTATION_CSS, '.clr-accepted-log__head')
      expect(row.get('display')).toBe('flex')
      expect(row.get('align-items')).toBe('flex-start')
      expect(row.get('justify-content')).toBe('space-between')
      expect(declarations(PRESENTATION_CSS, '.clr-accepted-log__head > .clr-bleed').get('flex')).toBe('none')
      expect(getComputedStyle(head).alignItems).toBe('flex-start')

      // The title's box top is its letters' top: no margin, a line box of the
      // font size, trimmed at the start to the capitals (it is set in
      // capitals). In Chromium the ink top and the X's frame top measured the
      // same at 320, 390 and 1280 wide, one line or two; untrimmed, the
      // letters sat 4 px lower.
      const recipe = declarations(PRESENTATION_CSS, '.clr-accepted-log__title')
      expect(recipe.get('margin')).toBe('0')
      expect(recipe.get('line-height')).toBe('1')
      expect(recipe.get('text-box')).toBe('trim-start cap alphabetic')
      expect(recipe.get('text-transform')).toBe('uppercase')
      // A long title wraps inside its column instead of pushing the X out.
      expect(recipe.get('min-width')).toBe('0')
      expect(recipe.get('overflow-wrap')).toBe('anywhere')

      // Nothing offsets either part from the top it shares.
      for (const rule of overlayRules()) {
        if (!/__head|__title/.test(rule.selector)) continue
        rule.walkDecls(/^(align-self|margin-block-start|margin-top|padding-block-start|padding-top|top|inset-block-start|transform|translate|vertical-align)$/, (decl) => {
          throw new Error(`${rule.selector} offsets the header: ${decl.prop}: ${decl.value}`)
        })
      }
      expect(xFrame.getAttribute('style') ?? '').not.toMatch(/margin|top|translate/)
    },
  )

  it(
    'AC-C40-01 AC-R016-01 TASK-AC-F1CC1A37FB0E header: the dialog’s title is the simple form’s one title — the held TimedResultLog drops its own “Log results” heading and is named by the dialog, while inline it keeps its own',
    () => {
      render(
        <Harness title="Ladder · 12 rounds">
          <LongLadderConsumer onSave={() => {}} />
        </Harness>,
      )
      const { dialog, title } = header()
      // One level-2 heading in the dialog: its title. The log's groups sit under it.
      expect(within(dialog).getAllByRole('heading', { level: 2 })).toEqual([title])
      expect(within(dialog).queryByRole('heading', { name: 'Log results' })).toBeNull()
      const form = within(dialog).getByRole('form', { name: 'Ladder · 12 rounds' })
      expect(form).toHaveClass('clr-timed-log')
      expect(form).toHaveAttribute('aria-labelledby', title.id)
      for (const group of within(form).getAllByRole('heading')) expect(group.tagName).toBe('H3')
      // The simple hierarchy: no Result / Movements / Feedback group titles.
      expect(within(form).queryByRole('heading', { name: /^(result|movements|feedback)$/i })).toBeNull()
    },
    HEAVY,
  )

  it(
    'AC-C40-01 header: inline in a card the same log keeps its own “Log results” title and stays an unnamed form',
    () => {
      const { container } = render(<ShortEmomConsumer onSave={() => {}} />)
      const form = container.querySelector<HTMLFormElement>('form.clr-timed-log')!
      expect(within(form).getByRole('heading', { name: 'Log results' })).toHaveClass('clr-timed-log__title')
      expect(form).not.toHaveAttribute('aria-labelledby')
      expect(screen.queryByRole('form')).toBeNull()
    },
  )

  it(
    'AC-C43-01 AC-R016-01 TASK-AC-F1CC1A37FB0E backdrop: the selected A / Balanced dim, corner vignette and blur sit on the native backdrop only — the foreground stays sharp, nothing darkens further, and there is no rising sheet',
    () => {
      // The owner's selected values, once, in the canonical variable file.
      expect(TOKENS_CSS).toMatch(/--logging-backdrop-blur:\s*var\(--spacing-100\);/)
      expect(TOKENS_CSS).toMatch(/--logging-backdrop-tint:\s*55%;/)
      expect(TOKENS_CSS).toMatch(/--logging-backdrop-edge-tint:\s*85%;/)
      expect(TOKENS_CSS.match(/--logging-backdrop-[\w-]+:/g)).toHaveLength(3)

      // Drawn on the native backdrop, replacing Foundation's paint for this
      // dialog only, by specificity rather than stylesheet order.
      const selector = '.clr-dialog.clr-accepted-log::backdrop'
      const backdrop = declarations(PRESENTATION_CSS, selector)
      expect(backdrop.get('background')).toBe(BALANCED_BACKDROP)
      expect(backdrop.get('backdrop-filter')).toBe('blur(var(--logging-backdrop-blur))')
      expect(backdrop.get('-webkit-backdrop-filter')).toBe('blur(var(--logging-backdrop-blur))')
      expect(compare(specificity(selector), specificity('.clr-dialog::backdrop'))).toBeGreaterThan(0)
      expect(declarations(FOUNDATION_CSS, '.clr-dialog::backdrop').has('backdrop-filter')).toBe(true)
      // Foundation's backdrop fade and its reduced-motion closure are kept: only the paint changes.
      expect(backdrop.has('animation')).toBe(false)
      expect(FOUNDATION_CSS).toContain('.clr-dialog[open]:not(.clr-dialog--closing)::backdrop { animation: clr-fade-in')

      // The foreground: one backdrop rule; nothing in the recipe filters,
      // fades, shadows or blends the dialog or its frame, and the frame keeps
      // the card's opaque surface.
      const backdrops = overlayRules().filter((rule) => rule.selector.includes('::backdrop'))
      expect(backdrops.map((rule) => rule.selector)).toEqual([selector])
      for (const rule of overlayRules()) {
        if (rule.selector === selector) continue
        rule.walkDecls(/^(filter|backdrop-filter|-webkit-backdrop-filter|opacity|box-shadow|mix-blend-mode|text-shadow)$/, (decl) => {
          throw new Error(`${rule.selector} touches the foreground: ${decl.prop}: ${decl.value}`)
        })
      }
      expect(declarations(PRESENTATION_CSS, '.clr-accepted-log__frame').get('--surface')).toBe('var(--surface-card)')
      expect(declarations(PRESENTATION_CSS, '.clr-accepted-log').get('background')).toBe('transparent')

      // A centred native modal, not the rejected rising sheet: no motion of
      // its own and none of the sheet's parts.
      for (const rule of overlayRules()) {
        rule.walkDecls(/^(animation|animation-name|transform|translate|transition)$/, (decl) => {
          throw new Error(`${rule.selector} moves the dialog: ${decl.prop}: ${decl.value}`)
        })
      }
      const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
      // Only ever opened modally: never the non-modal `show()`.
      expect(OVERLAY_SOURCE).not.toMatch(/\.show\(/)
      render(
        <Harness title="EMOM · 10 minutes">
          <ShortEmomConsumer onSave={() => {}} />
        </Harness>,
      )
      const { dialog } = header()
      expect(showModal).toHaveBeenCalledTimes(1)
      expect(dialog).toHaveClass('clr-dialog', 'clr-accepted-log')
      expect(document.querySelector('.clr-set-sheet, .clr-set-sheet-layer')).toBeNull()
    },
  )

  it(
    'AC-R016-03 TASK-AC-73CE385048B8 close: the X and Escape each close the log once through its consumer, focus returns to the control that opened it, and a typed draft is still there on reopen',
    async () => {
      const user = userEvent.setup()
      const closes = vi.fn()
      function Consumer() {
        const [open, setOpen] = useState(false)
        const [value, setValue] = useState<EmomResult>({ notes: '' })
        return (
          <>
            <button type="button" onClick={() => setOpen(true)}>
              Log
            </button>
            <LoggingOverlay
              open={open}
              title="EMOM · 10 minutes"
              onClose={() => {
                closes()
                setOpen(false)
              }}
            >
              <TimedResultLog format="emom" value={value} onChange={setValue} />
            </LoggingOverlay>
          </>
        )
      }
      render(<Consumer />)
      const opener = screen.getByRole('button', { name: 'Log' })
      const { dialog } = parts()
      expect(dialog.open).toBe(false)

      // Opened from the keyboard; type a draft.
      act(() => opener.focus())
      await user.keyboard('{Enter}')
      expect(dialog.open).toBe(true)
      expect(document.activeElement).toBe(closeButton())
      const notes = screen.getByRole('textbox', { name: TIMED_NOTES_LABEL })
      await user.type(notes, 'Dropped to 10 swings')

      // The X: one close, focus back on the opener.
      await user.click(closeButton())
      expect(closes).toHaveBeenCalledTimes(1)
      expect(dialog.open).toBe(false)
      expect(document.activeElement).toBe(opener)

      // Reopen: the draft is there.
      await user.click(opener)
      expect(dialog.open).toBe(true)
      expect(screen.getByRole('textbox', { name: TIMED_NOTES_LABEL })).toHaveValue('Dropped to 10 swings')

      // Escape: the native cancel. The overlay keeps the browser from closing
      // it on its own and asks the consumer, once; focus returns again.
      const cancel = new Event('cancel', { cancelable: true })
      act(() => void fireEvent(dialog, cancel))
      expect(cancel.defaultPrevented).toBe(true)
      expect(closes).toHaveBeenCalledTimes(2)
      expect(dialog.open).toBe(false)
      expect(document.activeElement).toBe(opener)

      // A dialog the browser closes itself (a `method="dialog"` form, say) is
      // reported once too, and focus still comes back.
      await user.click(opener)
      act(() => dialog.close())
      expect(closes).toHaveBeenCalledTimes(3)
      expect(document.activeElement).toBe(opener)
      await user.click(opener)
      expect(screen.getByRole('textbox', { name: TIMED_NOTES_LABEL })).toHaveValue('Dropped to 10 swings')
    },
    HEAVY,
  )

  it(
    'AC-R016-03 TASK-AC-73CE385048B8 focus: while the modal is open the workout behind is a native modal’s inert background and its running clock keeps counting, as does the rest inside the log — the overlay neither pauses nor resets either',
    async () => {
      const now = { value: Date.now() }
      vi.spyOn(Date, 'now').mockImplementation(() => now.value)
      const user = userEvent.setup()
      const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
      function Workout() {
        const [open, setOpen] = useState(false)
        return (
          <>
            <MovementCountdown seconds={30} movement="hollow body hold" />
            <button type="button" onClick={() => setOpen(true)}>
              Log
            </button>
            <LoggingOverlay open={open} title="Log set 1" onClose={() => setOpen(false)}>
              <MovementCountdown seconds={90} movement="rest" />
            </LoggingOverlay>
          </>
        )
      }
      render(<Workout />)
      const work = () => screen.getByRole('region', { name: 'hollow body hold countdown' })
      const rest = () => screen.getByRole('region', { name: 'rest countdown', hidden: true })

      // The workout's own clock runs; the log opens over it as a native modal
      // (`showModal`, which makes everything outside the dialog inert — in
      // Chromium no background control could take focus and a tap behind it
      // landed on the dialog's backdrop; jsdom's shim does not model inertness).
      await user.click(within(work()).getByRole('button', { name: 'Start' }))
      await user.click(screen.getByRole('button', { name: 'Log' }))
      expect(showModal).toHaveBeenCalledTimes(1)
      const { dialog } = parts()
      expect(dialog.open).toBe(true)
      expect(dialog).not.toContainElement(work())
      await user.click(within(rest()).getByRole('button', { name: 'Start' }))

      // Time passes with the log open: both clocks count.
      passSeconds(now, 10)
      expect(within(work()).getByRole('timer')).toHaveTextContent('00:20')
      expect(within(rest()).getByRole('timer')).toHaveTextContent('01:20')

      // Closed: the rest inside keeps counting, unmounted by nothing.
      await user.click(closeButton())
      passSeconds(now, 5)
      expect(within(work()).getByRole('timer')).toHaveTextContent('00:15')
      expect(within(work()).getByRole('button', { name: 'Pause' })).toBeEnabled()

      // Reopened: the rest is where time put it, not reset.
      await user.click(screen.getByRole('button', { name: 'Log' }))
      expect(within(rest()).getByRole('timer')).toHaveTextContent('01:15')
      expect(within(rest()).getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    },
    HEAVY,
  )

  it(
    'TASK-AC-C0A657D4BABE JOURNEY-016 header: gallery ladder-long draws the selected header and backdrop on the shared frame — the contract consumers adopt; Escape closes it and focus returns to its opener',
    async () => {
      const fetch = vi.spyOn(globalThis, 'fetch')
      const user = userEvent.setup()
      render(
        <MemoryRouter initialEntries={['/gallery/refinements?state=ladder-long']}>
          <GalleryRefinements />
        </MemoryRouter>,
      )
      const state = document.querySelector<HTMLElement>('[data-refinement-state="ladder-long"]')!
      const opener = within(state).getByRole('button', { name: 'Open long ladder results' })
      await user.click(opener)
      const { dialog, head, title } = header()
      expect(state).toContainElement(dialog)
      expect(dialog).toHaveClass('clr-dialog', 'clr-accepted-log')
      expect(title).toHaveTextContent('Ladder · 12 rounds')
      expect(within(head).getByRole('button', { name: LOGGING_OVERLAY_CLOSE_LABEL }).textContent?.trim()).toBe('')
      // The held log is named by the dialog and draws no second title.
      expect(within(dialog).getByRole('form', { name: 'Ladder · 12 rounds' })).toHaveAttribute('data-timed-format', 'ladder')
      expect(within(dialog).queryByRole('heading', { name: 'Log results' })).toBeNull()

      act(() => void fireEvent(dialog, new Event('cancel', { cancelable: true })))
      expect(dialog.open).toBe(false)
      expect(document.activeElement).toBe(opener)
      expect(fetch).not.toHaveBeenCalled()
    },
    HEAVY,
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// TASK-017 — movement groups and label/control rhythm
// ─────────────────────────────────────────────────────────────────────────────

const SET_EFFORT_CSS = readFileSync(resolve(ROOT, 'src/ui/set-effort.css'), 'utf8')

/** Every top-level rule that can reach a logging form's elements, in load order. */
const CASCADE: readonly Rule[] = [FOUNDATION_CSS, SET_EFFORT_CSS, PRESENTATION_CSS]
  .flatMap((css) => rulesOf(css))
  .filter((rule) => rule.parent?.type === 'root')

type Longhand = 'margin-block-start' | 'margin-block-end' | 'row-gap'

/** The value one declaration gives a longhand, shorthands included (horizontal writing mode). */
function longhandOf(decl: { prop: string; value: string }, property: Longhand): string | undefined {
  const value = normalise(decl.value)
  const parts = splitTopLevel(value, ' ')
  if (decl.prop === property) return value
  switch (decl.prop) {
    case 'margin':
      if (property === 'margin-block-start') return parts[0]
      if (property === 'margin-block-end') return parts[2] ?? parts[0]
      return undefined
    case 'margin-block':
      if (property === 'margin-block-start') return parts[0]
      if (property === 'margin-block-end') return parts[1] ?? parts[0]
      return undefined
    case 'margin-top':
      return property === 'margin-block-start' ? value : undefined
    case 'margin-bottom':
      return property === 'margin-block-end' ? value : undefined
    case 'gap':
      return property === 'row-gap' ? parts[0] : undefined
    default:
      return undefined
  }
}

/**
 * The cascaded value of one longhand on a rendered element: the inline style,
 * else the most specific matching rule, the later one on a tie. `null` when
 * nothing declares it (the initial value: no margin, no gap).
 */
function cascaded(element: Element, property: Longhand): string | null {
  const inline = element.getAttribute('style')
  if (inline) {
    let found: string | undefined
    parse(`x{${inline}}`).walkDecls((decl: Declaration) => {
      found = longhandOf(decl, property) ?? found
    })
    if (found !== undefined) return found
  }
  let best: { value: string; specificity: Specificity; order: number } | null = null
  CASCADE.forEach((rule, order) => {
    let value: string | undefined
    rule.walkDecls((decl) => {
      value = longhandOf(decl, property) ?? value
    })
    if (value === undefined) return
    for (const selector of rule.selectors) {
      if (selector.includes('::')) continue
      let matches = false
      try {
        matches = element.matches(selector)
      } catch {
        continue
      }
      if (!matches) continue
      const weight = specificity(selector)
      if (best === null || compare(weight, best.specificity) > 0 || (compare(weight, best.specificity) === 0 && order >= best.order)) {
        best = { value, specificity: weight, order }
      }
    }
  })
  return best === null ? null : (best as { value: string }).value
}

/** The custom properties declared on `:root` by Foundation and then the refinement tokens. */
const ROOT_VARIABLES = (() => {
  const variables = new Map<string, string>()
  for (const css of [FOUNDATION_CSS, TOKENS_CSS]) {
    for (const rule of rulesOf(css)) {
      if (rule.parent?.type !== 'root' || !rule.selectors.includes(':root')) continue
      rule.walkDecls((decl) => {
        if (decl.prop.startsWith('--')) variables.set(decl.prop, normalise(decl.value))
      })
    }
  }
  return variables
})()

/** A spacing value resolved through tokens.css to Foundation's step, then to CSS px. */
function px(value: string | null): number {
  if (value === null || value === '0' || value === '0px') return 0
  const variable = /^var\((--[\w-]+)\)$/.exec(value)
  if (variable) {
    const next = ROOT_VARIABLES.get(variable[1])
    if (next === undefined) throw new Error(`${variable[1]} is not declared on :root`)
    return px(next)
  }
  const length = /^(\d+(?:\.\d+)?)px$/.exec(value)
  if (length) return Number(length[1])
  throw new Error(`not a spacing token: ${value}`)
}

/** The Foundation spacing step a refinement variable resolves to. */
function foundationStep(name: string): string | undefined {
  let value = ROOT_VARIABLES.get(name)
  for (let hop = 0; value !== undefined && hop < 4; hop += 1) {
    const variable = /^var\((--[\w-]+)\)$/.exec(value)
    if (variable === null) return undefined
    if (/^--spacing-\d+$/.test(variable[1])) return variable[1]
    value = ROOT_VARIABLES.get(variable[1])
  }
  return undefined
}

/** The space a label leaves above its control, as a field or a choice draws it. */
function labelGap(legend: HTMLElement): number {
  return px(cascaded(legend, 'margin-block-end'))
}

/** The distance a flex column puts between two adjacent items: its gap plus the second's own margin. */
function spaceBefore(item: HTMLElement): number {
  return px(cascaded(item.parentElement!, 'row-gap')) + px(cascaded(item, 'margin-block-start'))
}

/** The For Time race run into its cap, answered Incomplete: each movement's round-1 amount and the wall ball's load. */
function IncompleteForTimeConsumer() {
  const [block] = useState(() => galleryTimedProgress(CAPPED_SAMPLE_FOR_TIME, 171))
  const [value, setValue] = useState<CompletionResult>({ completed: false, effort: null })
  const [entries, setEntries] = useState<MovementEntryLog['values']>({})
  return (
    <TimedResultLog
      format="for_time"
      value={value}
      onChange={setValue}
      movements={{
        exercises: block.exercises,
        partialRound: 1,
        weightUnit: 'kg',
        values: entries,
        onChange: (exerciseId, next) => setEntries((current) => ({ ...current, [exerciseId]: next })),
      }}
    />
  )
}

/** The ladder's result log, Incomplete through `through`, with its rung tiles and count. */
function LadderResultConsumer({ rounds, through }: { rounds: 4 | 12; through: number | null }) {
  const [block] = useState(() => galleryLadderProgress(rounds))
  const rungs = ladderRungs(block.exercises)
  const [value, setValue] = useState<CompletionResult>({ completed: false, effort: null })
  const [completedThrough, setThrough] = useState<number | null>(through)
  return (
    <TimedResultLog
      format="ladder"
      value={value}
      onChange={setValue}
      rounds={{
        rungs,
        unit: ladderUnit(block.exercises),
        completedThrough,
        partialRound: ladderPartialRound(completedThrough, rungs.length),
        onChange: setThrough,
      }}
    />
  )
}

/** The superset's one Log round over a memory set-logging seam: the loaded long-named lift and the bodyweight push up. */
function SupersetRoundConsumer({ logSet }: { logSet: SetLoggingApi['logSet'] }) {
  const [block] = useState(() => galleryAmrapProgress(SUPERSET_BLOCK, 172))
  const [held, setHeld] = useState<RoundDraft | null>(null)
  const api = useMemo<SetLoggingApi>(
    () => ({
      weightUnit: 'kg',
      logSet,
      loggedSets: () => [],
      isSaving: () => false,
      sync: { unsyncedCount: 0, sustainedFailure: false, syncing: false },
      retrySync() {},
    }),
    [logSet],
  )
  return (
    <SetLoggingContext value={api}>
      <SupersetRoundSheet
        movements={block.exercises.map((exercise) => ({ exercise, ordinal: `A${exercise.position}` }))}
        round={1}
        held={held}
        onHeld={setHeld}
        onCollapse={() => {}}
      />
    </SetLoggingContext>
  )
}

const SUPERSET_FORM = /^Log round 1 of /
const LIFT_GROUP = 'A1 single arm kettlebell overhead reverse lunge to knee drive, set 1'
const PARTNER_GROUP = 'A2 push up, set 1'

/** The removed R112 paragraph, sentence by sentence. */
const REMOVED_HELPER = ['Tick each movement you performed', 'A blank field is saved as not recorded']

const movementGroupsOf = (form: Element) => [...form.querySelectorAll<HTMLElement>('.clr-timed-log__group--movement')]

describe('TASK-017 movement groups and label/control rhythm', () => {
  it(
    'AC-C05-01 AC-R017-02 TASK-AC-9B1E8E32EE3B group: a timed log keeps each complete movement group together — its name, amount and load at the inner field gap — and sets two complete groups slightly further apart than any other section, inline and in the logging frame',
    () => {
      // The variables: the reference's movement gap is the extra space between
      // two complete groups; inside one, the fields sit at the field gap.
      expect(foundationStep('--logging-movement-gap')).toBe('--spacing-300')
      expect(foundationStep('--logging-movement-field-gap')).toBe('--spacing-300')
      expect(foundationStep('--logging-section-gap')).toBe('--spacing-600')

      for (const framed of [false, true]) {
        render(framed ? <Harness title="Log results"><IncompleteForTimeConsumer /></Harness> : <IncompleteForTimeConsumer />)
        const form = document.querySelector<HTMLFormElement>('form.clr-timed-log')!
        const groups = movementGroupsOf(form)
        expect(groups.map((group) => within(group).getByRole('heading').textContent)).toEqual(['wall ball', 'burpee'])

        for (const group of groups) {
          // One complete group: the movement's name heads it and every field it owns is inside it.
          expect(group).toHaveClass('clr-logging-movement')
          const name = within(group).getByRole('heading').textContent!
          for (const field of within(group).getAllByRole('spinbutton')) {
            expect(field.getAttribute('aria-label')).toContain(name)
          }
          expect(px(cascaded(group, 'row-gap'))).toBe(12)
        }
        expect(within(groups[0]).getAllByRole('spinbutton').map((field) => field.getAttribute('aria-label'))).toEqual(['Completed · wall ball', 'Weight · wall ball'])
        expect(within(groups[1]).getAllByRole('spinbutton').map((field) => field.getAttribute('aria-label'))).toEqual(['Completed · burpee'])

        // Between sections: the log's section gap. Between two complete
        // movement groups: that and the movement gap — slightly more, never
        // a field-by-field spreading.
        const sections = [...form.children] as HTMLElement[]
        const result = sections[0]
        const effort = sections.at(-1)!
        expect(result).not.toHaveClass('clr-logging-movement')
        expect(spaceBefore(groups[0])).toBe(24)
        expect(spaceBefore(groups[1])).toBe(36)
        expect(spaceBefore(effort)).toBe(24)
        expect(within(effort).getByRole('radiogroup')).toBeInTheDocument()
        const inside = px(cascaded(groups[0], 'row-gap'))
        expect(inside).toBeLessThan(spaceBefore(groups[0]))
        expect(spaceBefore(groups[1]) - spaceBefore(groups[0])).toBe(12)
        cleanup()
      }
    },
    HEAVY,
  )

  it(
    'AC-C05-01 AC-R017-02 group: the superset round’s complete movement-entry groups — name and prescription, Performed, weight/unit/reps and effort — each stay one group, and the second sits the shared movement gap further from the first',
    () => {
      render(<SupersetRoundConsumer logSet={vi.fn()} />)
      const form = screen.getByRole('form', { name: SUPERSET_FORM })
      const lift = within(form).getByRole('group', { name: LIFT_GROUP })
      const partner = within(form).getByRole('group', { name: PARTNER_GROUP })

      // Each group holds its own identity line, Performed, measures and effort.
      expect(within(lift).getByText(/^A1 single arm kettlebell overhead reverse lunge to knee drive · /)).toBeInTheDocument()
      expect(within(lift).getByRole('checkbox', { name: 'Performed' })).toBeInTheDocument()
      expect(within(lift).getByLabelText('Weight')).toBeInTheDocument()
      expect(within(lift).getByLabelText('Reps')).toBeInTheDocument()
      expect(within(lift).getByRole('group', { name: 'Effort' })).toBeInTheDocument()
      expect(within(partner).getByText(/^A2 push up · /)).toBeInTheDocument()
      expect(within(partner).getByRole('checkbox', { name: 'Performed' })).toBeInTheDocument()
      expect(within(partner).getByLabelText('Reps')).toBeInTheDocument()
      expect(within(partner).getByRole('group', { name: 'Effort' })).toBeInTheDocument()

      // Siblings in the form, each a complete movement group.
      expect(lift.parentElement).toBe(form)
      expect(partner.previousElementSibling).toBe(lift)
      for (const group of [lift, partner]) expect(group).toHaveClass('clr-logging-movement')

      const inside = px(cascaded(lift, 'row-gap'))
      expect(inside).toBe(8)
      expect(px(cascaded(lift, 'margin-block-start'))).toBe(0)
      expect(cascaded(partner, 'margin-block-start')).toBe('var(--logging-movement-gap)')
      expect(spaceBefore(partner)).toBe(20)
      expect(spaceBefore(partner)).toBeGreaterThan(inside)
    },
    HEAVY,
  )

  it(
    'AC-C47-01 AC-R017-03 helper: the superset round no longer draws the “Tick each movement you performed. A blank field is saved as not recorded.” paragraph or any replacement prose, and Performed still decides what is logged — unticked logs nothing, ticked with a blank field logs it unmeasured',
    async () => {
      const user = userEvent.setup()
      const logSet = vi.fn<SetLoggingApi['logSet']>()
      render(<SupersetRoundConsumer logSet={logSet} />)
      const sheet = screen.getByRole('heading', { name: 'Log round 1' }).closest('section')!
      const form = within(sheet).getByRole('form', { name: SUPERSET_FORM })

      for (const sentence of REMOVED_HELPER) expect(sheet).not.toHaveTextContent(sentence)
      expect(sheet).not.toHaveTextContent(/\btick\b|\bblank\b|not recorded/i)
      // The only paragraphs left are each movement's own identity line: no
      // instruction took the helper's place, above the form or inside it.
      expect([...sheet.querySelectorAll('p')].map((paragraph) => paragraph.textContent)).toEqual([
        expect.stringMatching(/^A1 single arm kettlebell overhead reverse lunge to knee drive · /),
        expect.stringMatching(/^A2 push up · /),
      ])
      const submit = within(form).getByRole('button', { name: 'Log round 1' })
      expect(submit).toBeDisabled()

      // Ticked with its suggested reps cleared: performed, and unmeasured.
      const partner = within(within(form).getByRole('group', { name: PARTNER_GROUP }))
      await user.click(partner.getByRole('checkbox', { name: 'Performed' }))
      await user.clear(partner.getByLabelText('Reps'))
      expect(submit).toBeEnabled()
      await user.click(submit)

      expect(logSet).toHaveBeenCalledTimes(1)
      const block = galleryAmrapProgress(SUPERSET_BLOCK, 172)
      const [exerciseId, performed] = logSet.mock.calls[0]
      expect(exerciseId).toBe(block.exercises[1].exerciseId)
      // Blank is not recorded: no measurement at all, never a zero. The
      // unticked lift, with its suggestion still in its fields, logs nothing.
      expect(performed).toEqual({ setNumber: 1 })
      expect(logSet.mock.calls.some(([id]) => id === block.exercises[0].exerciseId)).toBe(false)
    },
    HEAVY,
  )

  it(
    'AC-C47-01 AC-R017-03 helper: the removed sentence is gone from every shipped source — no component, gallery state, register entry or spec draws or expects it',
    () => {
      const offenders: string[] = []
      const walk = (directory: string) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const path = join(directory, entry.name)
          if (entry.isDirectory()) {
            if (entry.name !== 'node_modules') walk(path)
            continue
          }
          if (!/\.(tsx?|css|json|md)$/.test(entry.name)) continue
          if (path === resolve(ROOT, 'src/ui/logging-overlay.test.tsx')) continue
          const text = readFileSync(path, 'utf8')
          if (REMOVED_HELPER.some((sentence) => text.includes(sentence))) offenders.push(relative(ROOT, path))
        }
      }
      for (const directory of ['src', 'e2e']) walk(resolve(ROOT, directory))
      expect(offenders).toEqual([])
      // The superset still offers its own words: the Performed tick and the per-movement fields.
      expect(readFileSync(resolve(ROOT, 'src/ui/set-logger.tsx'), 'utf8')).toMatch(/label="Performed"/)
    },
    HEAVY,
  )

  it(
    'AC-C42-01 AC-R017-01 TASK-AC-0C1431FDDA19 spacing: every choice legend — Work completed, Effort · optional, a superset movement’s Effort and Workout feedback’s feeling — takes the label gap, the same space the log’s labelled count field leaves between its label and control',
    async () => {
      // One label gap, the accepted field rhythm: the same Foundation step the
      // log's own labelled field (the framed count) keeps between its label
      // and its control.
      expect(foundationStep('--logging-label-gap')).toBe('--spacing-200')
      const fieldGap = px(declarations(PRESENTATION_CSS, '.clr-timed-field').get('gap') ?? null)
      expect(declarations(PRESENTATION_CSS, '.clr-timed-field').get('gap')).toBe('var(--spacing-200)')
      expect(fieldGap).toBe(8)
      expect(px('var(--logging-label-gap)')).toBe(fieldGap)

      // Inline in a card and held in the frame alike.
      for (const framed of [false, true]) {
        render(framed ? <Harness title="Log results"><IncompleteForTimeConsumer /></Harness> : <IncompleteForTimeConsumer />)
        const form = document.querySelector<HTMLFormElement>('form.clr-timed-log')!
        const legends = [...form.querySelectorAll<HTMLElement>('fieldset > legend')]
        expect(legends.map((legend) => legend.textContent)).toEqual(['Work completed', 'Effort · optional'])
        for (const legend of legends) {
          expect(cascaded(legend, 'margin-block-end')).toBe('var(--logging-label-gap)')
          expect(labelGap(legend)).toBe(fieldGap)
        }
        cleanup()
      }

      // A superset movement's effort, in its complete movement group.
      render(<SupersetRoundConsumer logSet={vi.fn()} />)
      for (const legend of document.querySelectorAll<HTMLElement>('.clr-logging-movement fieldset > legend')) {
        expect(legend).toHaveTextContent('Effort')
        expect(labelGap(legend)).toBe(fieldGap)
      }
      expect(document.querySelectorAll('.clr-logging-movement fieldset > legend')).toHaveLength(2)
      cleanup()

      // Any form the logging frame holds: the Workout feedback specimen's feeling.
      const user = userEvent.setup()
      render(<LoggingOverlayWorkoutFeedback />)
      await user.click(screen.getByRole('button', { name: 'Open workout feedback' }))
      const dialog = document.querySelector<HTMLDialogElement>('dialog.clr-accepted-log')!
      const feeling = [...dialog.querySelectorAll<HTMLElement>('fieldset > legend')]
      expect(feeling).toHaveLength(1)
      expect(labelGap(feeling[0])).toBe(fieldGap)
    },
    HEAVY,
  )

  it(
    'AC-C42-01 AC-R017-01 spacing: the ladder log keeps its good Rounds completed heading gap and gives the dynamic count its own breathing room after the last row of tiles, for four and twelve rounds',
    () => {
      expect(foundationStep('--logging-count-gap')).toBe('--spacing-400')
      for (const [rounds, through, count] of [[4, null, 'No rounds marked yet'], [12, 7, '7 of 12 rounds completed']] as const) {
        render(<LadderResultConsumer rounds={rounds} through={through} />)
        const group = screen.getByRole('group', { name: 'Rounds completed' })
        const legend = group.querySelector<HTMLElement>(':scope > legend')!
        const tiles = group.querySelector<HTMLElement>('.clr-ladder-completion__tiles')!
        const status = within(group).getByRole('status')

        // The heading gap the owner called good is the ladder's own, unchanged.
        expect(cascaded(legend, 'margin-block-end')).toBe('var(--spacing-200)')
        expect(labelGap(legend)).toBe(8)
        expect(within(group).getAllByRole('button')).toHaveLength(rounds)

        // The count: its own, wider gap after the tiles' last row, distinct
        // from the label gap, and still the truthful count.
        expect(status).toHaveTextContent(count)
        expect(status.previousElementSibling).toBe(tiles)
        expect(cascaded(status, 'margin-block-start')).toBe('var(--logging-count-gap)')
        expect(spaceBefore(status)).toBe(16)
        expect(spaceBefore(status)).toBeGreaterThan(labelGap(legend))
        // The partial round's line stays where it was under the count.
        const partial = group.querySelector<HTMLElement>('.clr-ladder-completion__partial')
        if (partial !== null) expect(spaceBefore(partial)).toBe(8)
        expect(partial !== null).toBe(through !== null)

        // The completion question in the same log takes the label gap.
        const completion = screen.getByRole('group', { name: 'Work completed' }).querySelector<HTMLElement>(':scope > legend')!
        expect(labelGap(completion)).toBe(8)
        cleanup()
      }
    },
    HEAVY,
  )

  it(
    'TASK-AC-582934B08D11 JOURNEY-017 group: gallery for_time draws the route’s own For Time logs with the shared contract — the capped race’s two movement groups apart and its legends at the label gap — while no route claims the logging frame yet',
    () => {
      const fetch = vi.spyOn(globalThis, 'fetch')
      render(
        <MemoryRouter initialEntries={['/gallery/refinements?state=for_time']}>
          <GalleryRefinements />
        </MemoryRouter>,
      )
      const cap = document.querySelector<HTMLElement>('[data-gallery-race="for-time-cap"]')!
      const form = cap.querySelector<HTMLFormElement>('form.clr-timed-log')!
      const groups = movementGroupsOf(form)
      expect(groups.map((group) => within(group).getByRole('heading').textContent)).toEqual(['wall ball', 'burpee'])
      for (const group of groups) expect(group).toHaveClass('clr-logging-movement')
      expect(spaceBefore(groups[1])).toBeGreaterThan(spaceBefore(groups[0]))
      expect(spaceBefore(groups[1])).toBe(36)
      for (const legend of form.querySelectorAll<HTMLElement>('fieldset > legend')) expect(labelGap(legend)).toBe(8)

      // The finished race: one movement group, so no extra gap is drawn.
      const finish = document.querySelector<HTMLElement>('[data-gallery-race="for-time-finish"]')!
      const finished = movementGroupsOf(finish.querySelector('form.clr-timed-log')!)
      expect(finished).toHaveLength(1)
      expect(px(cascaded(finished[0], 'margin-block-start'))).toBe(0)

      // Provider acceptance only: the route's logs are still inline in their cards.
      expect(document.querySelector('dialog.clr-accepted-log')).toBeNull()
      expect(fetch).not.toHaveBeenCalled()
    },
    HEAVY,
  )
})
