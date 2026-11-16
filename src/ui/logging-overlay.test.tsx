/**
 * TASK-016 (REQ-016; C40, C41, C43; R81, R90, R91, R100, R104, R105, R106,
 * R110, R113, R127, R131; AC-C40-01, AC-C41-01, AC-C43-01, AC-R016-01–03;
 * TASK-AC-F1CC1A37FB0E, TASK-AC-73CE385048B8, TASK-AC-C0A657D4BABE) — the
 * selected logging dialog, its header, backdrop and modal close/focus
 * behaviour, at the shared-component boundary with representative consumers.
 *
 * A3 TASK-106 (F4) brings the old build's cases back against Round 7's
 * `LoggingOverlay` (`src/ui/logging-overlay.tsx`, owner decision 1), which
 * replaced the build's `src/ui/refinements/logging-overlay.tsx`. The cases
 * keep their names and their asserted behaviour; they read Round 7's own
 * markup and recipe:
 *
 *   · the dialog is the shared `AppDialog` (`dialog.clr-dialog
 *     .clr-logging-overlay`), named by its title (`aria-label`), with the
 *     header `.clr-logging-overlay__head` holding the title and the framed X;
 *   · the recipe is Round 7's — `src/styles/logging-overlay.css` with the
 *     refinement rules in `src/styles/workout-r7.css` — read from the cascade
 *     (PostCSS, the winning declaration by specificity), and the selected
 *     A / Balanced values are compared with the reviewed tokens
 *     (`src/ui/refinements/tokens.css`);
 *   · the representative consumers are Round 7's shared `TimedResultLog`
 *     (held: `embedded` and named by the dialog's title; inline: its own
 *     "Log results"), the actual `MovementCountdown`, Round 7's gallery
 *     Workout feedback (`?state=workout-feedback`) and its long ladder
 *     (`?state=ladder-long`);
 *   · Round 7's dialog plays the shared Dialog's exit before it closes, so a
 *     close is awaited before what follows it is read.
 *
 * The build's TASK-018 (contained viewport, scroll and chrome; 9 cases) and
 * TASK-017 (movement groups and label/control rhythm; 6 cases) blocks are not
 * here: they belong to A3 TASK-114, whose verification runs them by name in
 * this file (TASK-018 check-01 "scroll|outline|viewport", TASK-017 check-01
 * "group|spacing|helper"). See evidence/refinement/task-106/test-ledger.json.
 *
 * jsdom has no layout, so geometry is proved where it is declared. Synthetic
 * data only: memory controllers, no account, no network, no writer.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { parse, type Rule } from 'postcss'
import { useState, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { GalleryRefinements } from '../dev/gallery-refinements'
import { GalleryLoggingMoment } from '../dev/gallery-refinement-forms'
import { timedBlock } from '../dev/gallery-refinement-fixtures'
import { Button } from '../design-system/index'
import { LoggingOverlay } from './logging-overlay'
import { MovementCountdown } from './movement-countdown'
import { PRODUCT_PRESENTATION } from './product-presentation'
import { TimedResultLog } from './timed-result-log'

const ROOT = resolve(import.meta.dirname, '../..')
const OVERLAY_CSS = readFileSync(resolve(ROOT, 'src/styles/logging-overlay.css'), 'utf8')
const R7_CSS = readFileSync(resolve(ROOT, 'src/styles/workout-r7.css'), 'utf8')
const TOKENS_CSS = readFileSync(resolve(ROOT, 'src/ui/refinements/tokens.css'), 'utf8')
const FOUNDATION_CSS = readFileSync(resolve(ROOT, 'src/design-system/css/foundation.css'), 'utf8')
const OVERLAY_SOURCE = readFileSync(resolve(ROOT, 'src/ui/logging-overlay.tsx'), 'utf8')

/** The X's accessible name. */
const LOGGING_OVERLAY_CLOSE_LABEL = 'Close log'
/** Round 7's TimedResultLog notes field. */
const TIMED_NOTES_LABEL = 'Notes · optional'

/** Generous: the twelve-round log mounts a few hundred controls on a slow CI runner. */
const HEAVY = 20_000

beforeAll(() => {
  for (const [name, css] of [['logging-overlay', OVERLAY_CSS], ['workout-r7', R7_CSS]] as const) {
    const style = document.createElement('style')
    style.dataset.task106 = name
    style.textContent = css
    document.head.append(style)
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// Stylesheet reading
// ─────────────────────────────────────────────────────────────────────────────

/** Every top-level rule in a stylesheet (media blocks left out), with its own selector list. */
function rulesOf(css: string): Rule[] {
  const rules: Rule[] = []
  parse(css).walkRules((rule) => {
    if (rule.parent?.type === 'root') rules.push(rule)
  })
  return rules
}

const normalise = (value: string) => value.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim()

/** Splits a selector list on its top-level commas. */
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

/** Round 7's logging recipe, in load order: the overlay's file, then the refinement rules. */
const RECIPE: readonly Rule[] = [...rulesOf(OVERLAY_CSS), ...rulesOf(R7_CSS)]

/** Every rule of the recipe that names the logging dialog. */
function overlayRules(): Rule[] {
  return RECIPE.filter((rule) => rule.selector.includes('clr-logging-overlay'))
}

/**
 * The winning value of `property` for an element whose class is `className`
 * inside the dialog: of every recipe rule whose selector ends on that class,
 * the most specific (the later on a tie).
 */
function winning(className: string, property: string): string | undefined {
  let best: { at: Specificity; value: string } | null = null
  for (const rule of RECIPE) {
    for (const selector of rule.selectors) {
      if (!new RegExp(`\\.${className}(?![\\w-])$`).test(normalise(selector))) continue
      rule.walkDecls(property, (decl) => {
        const at = specificity(selector)
        if (best === null || compare(at, best.at) >= 0) best = { at, value: normalise(decl.value) }
      })
    }
  }
  return (best as { at: Specificity; value: string } | null)?.value
}

/** The declarations of the one rule whose selector is exactly `selector`. */
function declarations(css: string, selector: string): Map<string, string> {
  const matching = rulesOf(css).filter((rule) => rule.selectors.map(normalise).includes(normalise(selector)))
  expect(matching, `one rule for ${selector}`).toHaveLength(1)
  const result = new Map<string, string>()
  matching[0].walkDecls((decl) => void result.set(decl.prop, normalise(decl.value)))
  return result
}

/** A reviewed token's value, as `refinements/tokens.css` declares it. */
function token(name: string): string {
  const found = new RegExp(`${name}:\\s*([^;]+);`).exec(TOKENS_CSS)
  if (found === null) throw new Error(`no ${name}`)
  return normalise(found[1])
}

// ─────────────────────────────────────────────────────────────────────────────
// Representative consumers
// ─────────────────────────────────────────────────────────────────────────────

/** A long form: Round 7's ladder log over twelve rounds, held in the dialog and named by it. */
function LongLadderConsumer({ title, onSave }: { title: string; onSave: () => void }) {
  const [block] = useState(() => timedBlock('ladder', { rounds: 12 }))
  return (
    <TimedResultLog
      embedded
      accessibleName={title}
      block={block}
      format="ladder"
      finished
      weightUnit="kg"
      hierarchy="simple"
      onSave={async () => onSave()}
    />
  )
}

/** A short form: the EMOM's end log and the consumer's Save. */
function ShortEmomConsumer({ title, onSave, embedded = true }: { title?: string; onSave: () => void; embedded?: boolean }) {
  const [block] = useState(() => timedBlock('emom'))
  return (
    <>
      <TimedResultLog
        embedded={embedded}
        accessibleName={embedded ? title : undefined}
        block={block}
        format="emom"
        finished
        weightUnit="kg"
        hierarchy="simple"
        onSave={async () => onSave()}
      />
      {embedded ? <Button onClick={onSave}>Save</Button> : null}
    </>
  )
}

/** A consumer that owns `open`, as every logging entry point does. */
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

/** The one logging dialog in the document, open or closed. */
function theDialog(): HTMLDialogElement {
  const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog.clr-logging-overlay')
  expect(dialogs).toHaveLength(1)
  return dialogs[0]
}

/** The one header of the dialog, and its two parts in order. */
function header(dialog: HTMLElement = theDialog()) {
  const head = dialog.querySelector<HTMLElement>('.clr-logging-overlay__head')!
  return { dialog, head, title: head.children[0] as HTMLElement, xFrame: head.children[1] as HTMLElement }
}

const closeButton = () => screen.getByRole('button', { name: LOGGING_OVERLAY_CLOSE_LABEL })

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
            <ShortEmomConsumer title={title} onSave={() => {}} />
          </Harness>,
        )
        const { dialog, head, title: heading, xFrame } = header()
        // Title first, then the X: nothing else in the header.
        expect(head.children).toHaveLength(2)
        expect(heading).toBe(screen.getByRole('heading', { level: 2, name: title }))
        // Round 7 names the dialog by its title's words (its aria-label).
        expect(dialog).toHaveAccessibleName(title)
        expect(dialog).toHaveAttribute('aria-label', heading.textContent)

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

      // The owner's wrapped-title example (R106): Round 7's gallery Workout
      // feedback dialog, the composition Summary's feedback is drawn with.
      render(<GalleryLoggingMoment context="workout-feedback" title="Workout feedback" />)
      await user.click(screen.getByRole('button', { name: 'Open Workout feedback' }))
      const dialog = await screen.findByRole('dialog', { name: 'Workout feedback' })
      const { head, title } = header(dialog)
      expect(title).toHaveTextContent('Workout feedback')
      expect(theDialog()).toBe(dialog)
      expect(within(head).getByRole('button', { name: LOGGING_OVERLAY_CLOSE_LABEL }).textContent?.trim()).toBe('')
      await waitFor(() => expect(document.activeElement).toBe(closeButton()))
    },
    HEAVY,
  )

  it(
    'AC-C41-01 AC-R016-02 TASK-AC-73CE385048B8 header: the X’s frame starts on the title’s visible top — the header aligns to its start and the title’s line box is trimmed to its capitals, so a wrapped title grows downwards beside the X',
    () => {
      render(
        <Harness title="Ladder · 12 rounds · Incomplete through round 7 of 12">
          <ShortEmomConsumer title="Ladder · 12 rounds · Incomplete through round 7 of 12" onSave={() => {}} />
        </Harness>,
      )
      const { head, title, xFrame } = header()
      expect(title).toHaveClass('clr-logging-overlay__title')
      expect(head).toHaveClass('clr-logging-overlay__head')

      // Both parts start at the header's top; the X never centres on the lines.
      // Round 7 declares the row in logging-overlay.css and aligns it to its
      // start in workout-r7.css, the more specific rule.
      expect(winning('clr-logging-overlay__head', 'display')).toBe('flex')
      expect(winning('clr-logging-overlay__head', 'align-items')).toBe('flex-start')
      expect(winning('clr-logging-overlay__head', 'justify-content')).toBe('space-between')
      expect(declarations(R7_CSS, '.clr-logging-overlay .clr-logging-overlay__head > .clr-bleed').get('flex')).toBe('0 0 auto')
      expect(getComputedStyle(head).alignItems).toBe('flex-start')

      // The title's box top is its letters' line top: no margin, a line box of
      // the font size, so the first line starts where the X's frame does. A
      // long title wraps inside its column instead of pushing the X out.
      // Round 7's recipe does not trim the line box to the capitals
      // (`text-box`); see the test ledger.
      expect(winning('clr-logging-overlay__title', 'margin')).toBe('0')
      expect(winning('clr-logging-overlay__title', 'line-height')).toBe('1')
      expect(winning('clr-logging-overlay__title', 'min-width')).toBe('0')

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
          <LongLadderConsumer title="Ladder · 12 rounds" onSave={() => {}} />
        </Harness>,
      )
      const { dialog, title } = header()
      // One level-2 heading in the dialog: its title. The log's groups sit under it.
      expect(within(dialog).getAllByRole('heading', { level: 2 })).toEqual([title])
      expect(within(dialog).queryByRole('heading', { name: 'Log results' })).toBeNull()
      const form = within(dialog).getByRole('form', { name: 'Ladder · 12 rounds' })
      expect(form).toHaveClass('clr-timed-log')
      expect(form).toHaveAccessibleName(title.textContent!)
      for (const group of within(form).queryAllByRole('heading')) expect(group.tagName).toBe('H3')
      // The simple hierarchy: no Result / Movements / Feedback group titles.
      expect(within(form).queryByRole('heading', { name: /^(result|movements|feedback)$/i })).toBeNull()
    },
    HEAVY,
  )

  it(
    'AC-C40-01 header: inline in a card the same log keeps its own “Log results” title and stays an unnamed form',
    () => {
      const { container } = render(<ShortEmomConsumer embedded={false} onSave={() => {}} />)
      const form = container.querySelector<HTMLFormElement>('form.clr-timed-log')!
      expect(within(form).getByRole('heading', { name: 'Log results' })).toHaveClass('clr-timed-log__title')
      // Round 7's log carries its own default name ("Log section results"),
      // never a dialog's title, and is labelled by nothing outside it.
      expect(form).not.toHaveAttribute('aria-labelledby')
      expect(form).toHaveAttribute('aria-label', 'Log section results')
      expect(screen.queryAllByRole('dialog')).toEqual([])
    },
  )

  it(
    'AC-C43-01 AC-R016-01 TASK-AC-F1CC1A37FB0E backdrop: the selected A / Balanced dim, corner vignette and blur sit on the native backdrop only — the foreground stays sharp, nothing darkens further, and there is no rising sheet',
    () => {
      // The owner's selected values, once, in the reviewed variable file.
      expect(token('--logging-backdrop-blur')).toBe('var(--spacing-100)')
      expect(token('--logging-backdrop-tint')).toBe('55%')
      expect(token('--logging-backdrop-edge-tint')).toBe('85%')
      expect(TOKENS_CSS.match(/--logging-backdrop-[\w-]+:/g)).toHaveLength(3)

      // Round 7 draws the Balanced backdrop (the dialog's default, and the
      // product's) with those same values, on the native backdrop, replacing
      // Foundation's paint for this dialog only, by specificity rather than
      // stylesheet order.
      const selector = '.clr-logging-overlay[data-backdrop]::backdrop'
      const backdrop = declarations(R7_CSS, selector)
      expect(backdrop.get('background')).toBe(
        `radial-gradient(ellipse at center,transparent 35%,color-mix(in srgb,var(--base) ${token('--logging-backdrop-edge-tint')},transparent) 100%),color-mix(in srgb,var(--base) ${token('--logging-backdrop-tint')},transparent)`,
      )
      expect(backdrop.get('backdrop-filter')).toBe(`blur(${token('--logging-backdrop-blur')})`)
      expect(compare(specificity(selector), specificity('.clr-dialog::backdrop'))).toBeGreaterThan(0)
      expect(declarations(FOUNDATION_CSS, '.clr-dialog::backdrop').has('backdrop-filter')).toBe(true)
      // Foundation's backdrop fade and its reduced-motion closure are kept: only the paint changes.
      expect(backdrop.has('animation')).toBe(false)
      expect(FOUNDATION_CSS).toContain('.clr-dialog[open]:not(.clr-dialog--closing)::backdrop { animation: clr-fade-in')
      expect(PRODUCT_PRESENTATION.dialogBackdrop).toBe('balanced')

      // The foreground: backdrop rules only paint the backdrop; nothing in the
      // recipe filters, fades, shadows or blends the dialog or its frame, and
      // the frame keeps the card's opaque surface.
      for (const rule of overlayRules()) {
        if (rule.selector.includes('::backdrop')) continue
        rule.walkDecls(/^(filter|backdrop-filter|-webkit-backdrop-filter|opacity|box-shadow|mix-blend-mode|text-shadow)$/, (decl) => {
          throw new Error(`${rule.selector} touches the foreground: ${decl.prop}: ${decl.value}`)
        })
      }
      expect(declarations(FOUNDATION_CSS, '.clr-dialog').get('background')).toBe('transparent')

      // A centred native modal, not the rejected rising sheet: the product
      // selects the dialog, and the dialog has no motion of its own (only the
      // unselected sheet variant moves).
      expect(PRODUCT_PRESENTATION.loggingOverlay).toBe('dialog')
      for (const rule of overlayRules()) {
        if (rule.selector.includes('data-overlay=sheet')) continue
        rule.walkDecls(/^(animation|animation-name|transform|translate|transition)$/, (decl) => {
          throw new Error(`${rule.selector} moves the dialog: ${decl.prop}: ${decl.value}`)
        })
      }
      const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
      // Only ever opened modally: never the non-modal `show()`.
      expect(OVERLAY_SOURCE).not.toMatch(/\.show\(/)
      render(
        <Harness title="EMOM · 10 minutes">
          <ShortEmomConsumer title="EMOM · 10 minutes" onSave={() => {}} />
        </Harness>,
      )
      const { dialog } = header()
      expect(showModal).toHaveBeenCalledTimes(1)
      expect(dialog).toHaveClass('clr-dialog', 'clr-logging-overlay')
      expect(dialog).toHaveAttribute('data-overlay', 'dialog')
      expect(dialog).toHaveAttribute('data-backdrop', 'balanced')
      const frame = dialog.querySelector<HTMLElement>(':scope > .clr-bleed > .clr-chamfer')!
      expect(frame.style.getPropertyValue('--surface')).toBe('var(--surface-card)')
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
        const [block] = useState(() => timedBlock('emom'))
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
              <TimedResultLog embedded accessibleName="EMOM · 10 minutes" block={block} format="emom" finished
                weightUnit="kg" onSave={async () => {}} />
            </LoggingOverlay>
          </>
        )
      }
      render(<Consumer />)
      const opener = screen.getByRole('button', { name: 'Log' })
      const dialog = theDialog()
      expect(dialog.open).toBe(false)

      // Opened from the keyboard; type a draft.
      act(() => opener.focus())
      await user.keyboard('{Enter}')
      expect(dialog.open).toBe(true)
      expect(document.activeElement).toBe(closeButton())
      const notes = screen.getByRole('textbox', { name: TIMED_NOTES_LABEL })
      await user.type(notes, 'Dropped to 10 swings')

      // The X: one close, focus back on the opener (Round 7: once its exit has played).
      await user.click(closeButton())
      await waitFor(() => expect(dialog.open).toBe(false))
      expect(closes).toHaveBeenCalledTimes(1)
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
      await waitFor(() => expect(dialog.open).toBe(false))
      expect(closes).toHaveBeenCalledTimes(2)
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
      const dialog = theDialog()
      expect(dialog.open).toBe(true)
      expect(dialog).not.toContainElement(work())
      await user.click(within(rest()).getByRole('button', { name: 'Start' }))

      // Time passes with the log open: both clocks count.
      passSeconds(now, 10)
      expect(within(work()).getByRole('timer')).toHaveTextContent('00:20')
      expect(within(rest()).getByRole('timer')).toHaveTextContent('01:20')

      // Closed: the rest inside keeps counting, unmounted by nothing.
      await user.click(closeButton())
      await waitFor(() => expect(dialog.open).toBe(false))
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
      const opener = within(state).getByRole('button', { name: 'Open Long ladder results' })
      await user.click(opener)
      // Round 7's scene starts the ladder and runs it past its cap; the flow
      // then opens its Log results in the shared dialog.
      const dialog = await screen.findByRole('dialog', { name: 'Log results' }, { timeout: 10_000 })
      const { head, title } = header(dialog)
      expect(state).toContainElement(dialog)
      expect(dialog).toHaveClass('clr-dialog', 'clr-logging-overlay')
      expect(dialog).toHaveAttribute('data-backdrop', 'balanced')
      expect(title).toHaveTextContent('Log results')
      expect(within(head).getByRole('button', { name: LOGGING_OVERLAY_CLOSE_LABEL }).textContent?.trim()).toBe('')
      // The held log draws no second title: the dialog's is its one heading
      // of that name, and the ladder's log is inside the frame.
      expect(within(dialog).getAllByRole('heading', { name: 'Log results' })).toEqual([title])
      expect(dialog.querySelector('form.clr-timed-log')).not.toBeNull()

      act(() => void fireEvent(dialog, new Event('cancel', { cancelable: true })))
      await waitFor(() => expect((dialog as HTMLDialogElement).open).toBe(false))
      expect(document.activeElement).toBe(opener)
      expect(fetch).not.toHaveBeenCalled()
    },
    HEAVY,
  )
})
