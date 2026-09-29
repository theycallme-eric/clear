/**
 * REQ-011 — focus belongs to the control, not to its chamfered ancestor.
 *
 * jsdom paints nothing, so this reads the shipped stylesheets in the order
 * `main.tsx` loads them and resolves the cascade itself: for an element (or one
 * of its ::before / ::after layers) it finds every matching rule, orders by
 * specificity then source order, and reports the winning focus-relevant
 * declarations. `:focus-visible` is modelled as an attribute the test sets, so
 * the same comparison can be made with focus on and off.
 *
 * The regression frame is the gallery's own Card-to-Input specimen, rendered
 * under every skin in `SKINS`, once with the default cascade and once with the
 * `(forced-colors: active)` block in force. In-browser proof belongs to the
 * release gate; this is the foundation's contract.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { GALLERY_ENTRIES } from '../dev/gallery-registry'
import { SKINS } from '../design-system/skin'

const SRC = resolve(import.meta.dirname, '..')

// main.tsx's import order, then the component and gallery sheets that load
// after it. Order matters: equal specificity resolves by source order.
const CASCADE = [
  'design-system/css/foundation.css',
  'design-system/css/motion.css',
  'styles/skin-clear.css',
  'design-system/css/skins.css',
  'styles/app-motion.css',
  'styles/atmosphere.css',
  'styles/a11y.css',
  'ui/collapsible-section.css',
  'ui/ladder-rungs.css',
  'ui/rest-timer-bar.css',
  'dev/gallery.css',
]

const FOCUS_ATTR = 'data-test-focus-visible'
const FORCED_COLORS = /\(\s*forced-colors\s*:\s*active\s*\)/

type Pseudo = '' | '::before' | '::after'
type Mode = 'default' | 'forced-colors'

interface Rule {
  selector: string
  pseudo: string
  specificity: [number, number, number]
  order: number
  media: string | null
  file: string
  declarations: Map<string, string>
}

// ─────────────────────────────────────────────────────────────────────────────
// A small CSS reader — enough for flat rules and @media blocks.
// ─────────────────────────────────────────────────────────────────────────────

function closingBrace(css: string, open: number): number {
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return i
  }
  throw new Error('unbalanced braces')
}

function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (ch === separator && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts.map((part) => part.trim()).filter(Boolean)
}

function declarations(block: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const declaration of splitTopLevel(block, ';')) {
    const colon = declaration.indexOf(':')
    if (colon < 0) continue
    found.set(
      declaration.slice(0, colon).trim().toLowerCase(),
      declaration.slice(colon + 1).replace(/\s+/g, ' ').trim(),
    )
  }
  return found
}

function specificity(selector: string): [number, number, number] {
  let a = 0
  let b = 0
  let c = 0
  let rest = selector
  // Functional pseudo-classes take their argument's specificity (:where none).
  for (;;) {
    const match = /:(not|is|has|where)\(/.exec(rest)
    if (!match) break
    const open = match.index + match[0].length - 1
    let depth = 0
    let close = open
    for (; close < rest.length; close++) {
      if (rest[close] === '(') depth++
      else if (rest[close] === ')' && --depth === 0) break
    }
    if (match[1] !== 'where') {
      const inner = splitTopLevel(rest.slice(open + 1, close), ',').map(specificity)
      const max = inner.sort((x, y) => y[0] - x[0] || y[1] - x[1] || y[2] - x[2])[0]
      if (max) {
        a += max[0]
        b += max[1]
        c += max[2]
      }
    }
    rest = rest.slice(0, match.index) + ' ' + rest.slice(close + 1)
  }
  rest = rest.replace(/\[[^\]]*\]/g, () => {
    b++
    return ' '
  })
  rest = rest.replace(/::[\w-]+(\([^)]*\))?/g, () => {
    c++
    return ' '
  })
  rest = rest.replace(/#[\w-]+/g, () => {
    a++
    return ' '
  })
  rest = rest.replace(/[.:][\w-]+(\([^)]*\))?/g, () => {
    b++
    return ' '
  })
  c += (rest.match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) ?? []).length
  return [a, b, c]
}

function parse(css: string, file: string, media: string | null, rules: Rule[]) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  let cursor = 0
  while (cursor < text.length) {
    const open = text.indexOf('{', cursor)
    if (open < 0) break
    const prelude = text.slice(cursor, open).trim()
    const close = closingBrace(text, open)
    const body = text.slice(open + 1, close)
    cursor = close + 1

    // A statement at-rule (@import …;) can sit in front of the prelude.
    const head = prelude.slice(prelude.lastIndexOf(';') + 1).trim()
    if (head.startsWith('@media')) {
      parse(body, file, head.slice('@media'.length).trim(), rules)
      continue
    }
    if (head.startsWith('@')) continue // keyframes, font-face, supports, layer

    const decls = declarations(body)
    for (const selector of splitTopLevel(head, ',')) {
      const pseudo = /::[\w-]+$/.exec(selector)?.[0] ?? ''
      rules.push({
        selector,
        pseudo,
        specificity: specificity(selector),
        order: rules.length,
        media,
        file,
        declarations: decls,
      })
    }
  }
  return rules
}

const RULES: Rule[] = (() => {
  const rules: Rule[] = []
  for (const file of CASCADE) parse(readFileSync(resolve(SRC, file), 'utf-8'), file, null, rules)
  return rules
})()

// ─────────────────────────────────────────────────────────────────────────────
// Matching and the cascade.
// ─────────────────────────────────────────────────────────────────────────────

function toTestable(selector: string, pseudo: string): string {
  return selector
    .slice(0, selector.length - pseudo.length)
    .replaceAll(':focus-visible', `[${FOCUS_ATTR}]`)
}

/** Element.matches, with a terminal `:has()` evaluated here — jsdom's is partial. */
function matches(el: Element, selector: string): boolean {
  const has = /^(.*):has\((.*)\)$/.exec(selector)
  if (has && !has[1].includes(':has(')) {
    return el.matches(has[1] || '*') && el.querySelector(has[2]) !== null
  }
  return el.matches(selector)
}

function applies(rule: Rule, mode: Mode): boolean {
  if (rule.media === null) return true
  return mode === 'forced-colors' && FORCED_COLORS.test(rule.media)
}

const PROPERTIES: Record<Pseudo, readonly string[]> = {
  '': ['outline', 'outline-width', 'outline-style', 'outline-color', 'outline-offset'],
  '::before': ['inset', 'background', 'background-color'],
  '::after': ['inset', 'background', 'background-color'],
}

/** The winning focus-relevant declarations for one element layer. */
function resolved(el: Element, pseudo: Pseudo, mode: Mode): Record<string, string> {
  const winners = RULES.filter(
    (rule) => rule.pseudo === pseudo && applies(rule, mode) && safeMatch(el, rule),
  ).sort(
    (x, y) =>
      x.specificity[0] - y.specificity[0] ||
      x.specificity[1] - y.specificity[1] ||
      x.specificity[2] - y.specificity[2] ||
      x.order - y.order,
  )
  const out: Record<string, string> = {}
  for (const rule of winners) {
    for (const property of PROPERTIES[pseudo]) {
      const value = rule.declarations.get(property)
      if (value !== undefined) out[property] = value
    }
  }
  return out
}

const unmatchable = new Set<string>()
function safeMatch(el: Element, rule: Rule): boolean {
  try {
    return matches(el, toTestable(rule.selector, rule.pseudo))
  } catch {
    unmatchable.add(rule.selector)
    return false
  }
}

/** Every layer, focus off and on, so a test can ask what focus changed. */
function focusDelta(owner: Element, focused: Element, mode: Mode) {
  const layers: Pseudo[] = ['', '::before', '::after']
  focused.removeAttribute(FOCUS_ATTR)
  const before = layers.map((layer) => resolved(owner, layer, mode))
  focused.setAttribute(FOCUS_ATTR, '')
  const after = layers.map((layer) => resolved(owner, layer, mode))
  focused.removeAttribute(FOCUS_ATTR)
  return {
    changed: JSON.stringify(before) !== JSON.stringify(after),
    unfocused: { element: before[0], before: before[1], after: before[2] },
    focused: { element: after[0], before: after[1], after: after[2] },
  }
}

/** Outline geometry: width + style, ignoring colour. "none" means no ring. */
function outlineGeometry(style: Record<string, string>): string {
  const shorthand = style.outline
  if (!shorthand || shorthand === 'none' || shorthand.startsWith('none ')) return 'none'
  return shorthand
    .split(' ')
    .filter((token) => /width|^\d|solid|dashed|double|dotted/.test(token))
    .join(' ')
}

function outlineColour(style: Record<string, string>): string {
  return (style.outline ?? '').split(' ').at(-1) ?? ''
}

// ─────────────────────────────────────────────────────────────────────────────
// The regression frame, taken from the review gallery.
// ─────────────────────────────────────────────────────────────────────────────

const cardEntry = GALLERY_ENTRIES.find((entry) => entry.component === 'Card')
const specimen = cardEntry?.specimens.find(
  (candidate) => candidate.state === 'wrapping a focused input',
)

function renderSpecimen() {
  if (!specimen) throw new Error('Card-to-Input specimen missing from the gallery')
  const { container } = render(createElement(specimen.Render))
  const card = container.querySelector('.clr-card__body.clr-chamfer')
  const input = card?.querySelector('input')
  if (!card || !input) throw new Error('specimen does not nest an input in a chamfered card')
  return { card, input }
}

const MODES: readonly Mode[] = ['default', 'forced-colors']

afterEach(() => {
  document.documentElement.removeAttribute('data-skin')
})

describe('the Card-to-Input regression specimen', () => {
  it('is registered in the review gallery under Card', () => {
    expect(specimen).toBeDefined()
  })

  it('renders the focused state: the nested input holds focus', () => {
    const { card, input } = renderSpecimen()

    expect(document.activeElement).toBe(input)
    expect(card.contains(document.activeElement)).toBe(true)
    expect(card.classList.contains('clr-chamfer--focus-owner')).toBe(false)
  })
})

describe('the stylesheet model', () => {
  it('reads the focus rules it is meant to be judging', () => {
    const focusRules = RULES.filter((rule) => rule.selector.includes(':focus-visible'))

    expect(focusRules.some((rule) => rule.selector === '.clr-chamfer:focus-visible::after')).toBe(true)
    expect(
      focusRules.some((rule) => rule.media !== null && FORCED_COLORS.test(rule.media)),
    ).toBe(true)
  })

  it('can evaluate every focus rule, and puts none in a media block it does not model', () => {
    const { input } = renderSpecimen()
    for (const rule of RULES) safeMatch(input, rule)

    const focusRules = RULES.filter((rule) => rule.selector.includes('focus'))
    expect(focusRules.filter((rule) => unmatchable.has(rule.selector))).toEqual([])
    expect(
      focusRules.filter((rule) => rule.media !== null && !FORCED_COLORS.test(rule.media)),
    ).toEqual([])
  })
})

describe.each(SKINS)('focus ownership in the %s skin', (skin) => {
  describe.each(MODES)('%s', (mode) => {
    it('the chamfered card paints no focus treatment for its focused input', () => {
      document.documentElement.setAttribute('data-skin', skin)
      const { card, input } = renderSpecimen()

      const delta = focusDelta(card, input, mode)

      expect(delta.changed).toBe(false)
      expect(delta.focused.after.background).not.toMatch(/focus-ring|Highlight/)
    })

    it('the focused input carries a ring that changes outline geometry', () => {
      document.documentElement.setAttribute('data-skin', skin)
      const { input } = renderSpecimen()

      const delta = focusDelta(input, input, mode)

      expect(outlineGeometry(delta.unfocused.element)).toBe('none')
      expect(outlineGeometry(delta.focused.element)).toBe('var(--focus-ring-width) solid')
      expect(outlineColour(delta.focused.element)).toBe(
        mode === 'forced-colors' ? 'Highlight' : 'var(--focus-ring)',
      )
    })

    it('a chamfered button inside the card owns its focus; the card still paints nothing', () => {
      document.documentElement.setAttribute('data-skin', skin)
      const { card } = renderSpecimen()
      const button = document.createElement('button')
      button.className = 'clr-chamfer clr-chamfer--sm'
      card.append(button)

      const own = focusDelta(button, button, mode)
      expect(own.unfocused.before.inset).not.toBe('calc(var(--border-width) * 2)')
      expect(own.focused.before.inset).toBe('calc(var(--border-width) * 2)')
      expect(own.focused.after.background).toBe(
        mode === 'forced-colors' ? 'Highlight' : 'var(--focus-ring)',
      )
      expect(outlineGeometry(own.focused.element)).toBe('none') // clipped away; the frame doubles instead

      expect(focusDelta(card, button, mode).changed).toBe(false)
    })

    it('an opted-in .clr-chamfer--focus-owner wrapper shows its control’s focus', () => {
      document.documentElement.setAttribute('data-skin', skin)
      const wrapper = document.createElement('label')
      wrapper.className = 'clr-chamfer clr-chamfer--sm clr-chamfer--focus-owner'
      const radio = document.createElement('input')
      radio.type = 'radio'
      wrapper.append(radio)
      document.body.append(wrapper)

      const delta = focusDelta(wrapper, radio, mode)
      wrapper.remove()

      expect(delta.focused.before.inset).toBe('calc(var(--border-width) * 2)')
      expect(delta.focused.after.background).toBe(
        mode === 'forced-colors' ? 'Highlight' : 'var(--focus-ring)',
      )
    })

    it('ownership is never inferred from a role', () => {
      document.documentElement.setAttribute('data-skin', skin)
      const group = document.createElement('div')
      group.className = 'clr-chamfer clr-chamfer--md'
      group.setAttribute('role', 'radiogroup')
      const option = document.createElement('button')
      option.setAttribute('role', 'radio')
      group.append(option)
      document.body.append(group)

      const delta = focusDelta(group, option, mode)
      group.remove()

      expect(delta.changed).toBe(false)
    })
  })
})

describe('the rule lives once, in the vendored foundation', () => {
  const OWNER = /clr-chamfer--focus-owner/
  const BROAD_HAS = /\.clr-chamfer(?![\w-])[^,{]*:has\([^)]*focus/

  function sources(dir: string): string[] {
    return readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(css|tsx?|jsx?)$/.test(entry.name))
      .filter((entry) => !/\.test\.tsx?$/.test(entry.name))
      .map((entry) => resolve(entry.parentPath, entry.name))
      .filter((file) => !file.includes('/design-system/_source/'))
      .filter((file) => !file.includes('/design-system/preview/'))
  }

  it('declares the focus-owner treatment in foundation.css and nowhere else', () => {
    const foundation = resolve(SRC, 'design-system/css/foundation.css')
    const defining = sources(SRC)
      .filter((file) => file.endsWith('.css'))
      .filter((file) => OWNER.test(readFileSync(file, 'utf-8')))

    expect(defining).toEqual([foundation])
  })

  it('leaves no chamfer claiming a descendant’s focus without opting in', () => {
    const offenders = sources(SRC).filter((file) =>
      BROAD_HAS.test(readFileSync(file, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '')),
    )

    expect(offenders).toEqual([])
  })
})
