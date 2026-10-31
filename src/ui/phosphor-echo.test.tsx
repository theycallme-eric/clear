/**
 * Effects TASK-003 (REQ-003) — the shared Phosphor Echo module.
 *
 * The filter graph is checked primitive by primitive against the round-3
 * kernel (`round-3/phosphor-echo.mjs`); the pixels are proven in a real
 * browser by `e2e/effects/echo-standalone-fidelity.spec.ts`.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Button, Card as PublicCard, IconButton, ArrowLeft } from '../design-system/index'
import { VisualEffectsProvider } from '../state/visual-effects'
import { Heading } from './Heading'
import {
  chamferSilhouette,
  PHOSPHOR_ECHO_FILTER_ID,
  PhosphorEchoDefinition,
  PhosphorEchoFrame,
  PhosphorEchoGlyph,
  PhosphorEchoText,
} from './phosphor-echo'
import {
  PHOSPHOR_ECHO_PRESET,
  PHOSPHOR_ECHO_PRESET_DISPLAY,
  PHOSPHOR_ECHO_PRESET_PROVENANCE,
} from './phosphor-echo-preset'

const UI_DIR = import.meta.dirname
const read = (name: string) => readFileSync(resolve(UI_DIR, name), 'utf8')

const KEY = 'clear.visual-effects'

function withPolicy(ui: React.ReactNode) {
  return render(<VisualEffectsProvider>{ui}</VisualEffectsProvider>)
}

/** jsdom lays nothing out: give every target a box, and each wrapper the origin. */
function layOut() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: Element,
  ) {
    const origin = this.classList.contains('clr-echo')
    return DOMRect.fromRect(origin ? { x: 0, y: 0, width: 0, height: 0 } : { x: 4, y: 6, width: 120, height: 48 })
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.removeItem(KEY)
})

describe('the preset owner', () => {
  it('holds the owner-preferred round-3 preset and nothing else', () => {
    expect(PHOSPHOR_ECHO_PRESET).toEqual({ opacity: 0.29, blur: 3.2, x: -4.7, y: 5.64 })
    expect(Object.isFrozen(PHOSPHOR_ECHO_PRESET)).toBe(true)
    expect(PHOSPHOR_ECHO_PRESET_DISPLAY).toBe('4.7 left / 5.6 down')
    expect(PHOSPHOR_ECHO_PRESET_PROVENANCE.source).toBe('round-3/preferred-preset.json')
  })

  it('is not the earlier geometry-check values', () => {
    expect(PHOSPHOR_ECHO_PRESET).not.toEqual({ opacity: 0.34, blur: 1.4, x: -5.5, y: 6.6 })
  })

  it('is separate from geometry, compositing and lifecycle: the module states no number of its own', () => {
    const preset = read('phosphor-echo-preset.ts')
    const module = read('phosphor-echo.tsx')

    expect(preset).not.toMatch(/useLayoutEffect|ResizeObserver|<fe|chamferSilhouette|getComputedStyle|^import /m)
    expect(module).toContain("from './phosphor-echo-preset'")
    for (const value of ['0.29', '.29', '3.2', '4.7', '5.64', '0.34', '1.4', '5.5', '6.6']) {
      expect(module).not.toContain(value)
    }
  })

  it('offers no per-target blur, strength, offset or colour override', () => {
    const module = read('phosphor-echo.tsx')
    const props = [...module.matchAll(/export function \w+\(([^)]*)\)/g)].map((m) => m[1]).join(' ')

    expect(props).not.toMatch(/blur|opacity|strength|offset|color|colour|\bx\b|\by\b/i)
  })
})

describe('the kernel', () => {
  it('installs one filter matching round-3 phosphor-echo.mjs, primitive by primitive', () => {
    const { container } = render(<PhosphorEchoDefinition />)
    const filters = container.querySelectorAll('filter')
    expect(filters).toHaveLength(1)
    const filter = filters[0]

    expect(filter).toHaveAttribute('id', PHOSPHOR_ECHO_FILTER_ID)
    expect(filter).toHaveAttribute('x', '-80%')
    expect(filter).toHaveAttribute('y', '-80%')
    expect(filter).toHaveAttribute('width', '260%')
    expect(filter).toHaveAttribute('height', '260%')
    expect(filter).toHaveAttribute('primitiveUnits', 'userSpaceOnUse')
    expect(filter).toHaveAttribute('color-interpolation-filters', 'sRGB')

    const primitives = [...filter.children]
    expect(primitives.map((node) => node.tagName)).toEqual([
      'feGaussianBlur',
      'feOffset',
      'feComponentTransfer',
      'feComposite',
    ])
    const [blur, offset, transfer, composite] = primitives
    expect(blur).toHaveAttribute('in', 'SourceGraphic')
    expect(blur).toHaveAttribute('stdDeviation', '3.2')
    expect(offset).toHaveAttribute('in', blur.getAttribute('result'))
    expect(offset).toHaveAttribute('dx', '-4.7')
    expect(offset).toHaveAttribute('dy', '5.64')
    expect(transfer).toHaveAttribute('in', offset.getAttribute('result'))
    expect([...transfer.children].map((node) => node.tagName)).toEqual(['feFuncA'])
    expect(transfer.children[0]).toHaveAttribute('type', 'linear')
    expect(transfer.children[0]).toHaveAttribute('slope', '0.29')
    expect(transfer.children[0]).not.toHaveAttribute('intercept')
    expect(composite).toHaveAttribute('in', transfer.getAttribute('result'))
    expect(composite).toHaveAttribute('in2', 'SourceAlpha')
    expect(composite).toHaveAttribute('operator', 'out')
  })

  it('adds no drop shadow, glow or other primitive anywhere in the module', () => {
    const module = read('phosphor-echo.tsx')
    const css = read('phosphor-echo.css')

    expect(module).not.toMatch(/feDropShadow|feMorphology|feFlood|feMerge|feBlend|feColorMatrix/)
    expect(css).not.toMatch(/drop-shadow|box-shadow|text-shadow/)
  })

  it('keeps one definition per document even if a second host mounts', () => {
    render(
      <>
        <PhosphorEchoDefinition />
        <PhosphorEchoDefinition />
      </>,
    )
    expect(document.querySelectorAll(`#${PHOSPHOR_ECHO_FILTER_ID}`)).toHaveLength(1)
  })

  it('is what every rear source references, and only rear sources', () => {
    const css = read('phosphor-echo.css').replace(/\/\*[\s\S]*?\*\//g, '')
    const filtered = [...css.matchAll(/([^{}]+)\{[^}]*filter:\s*url\(#([\w-]+)\)/g)]

    expect(filtered.map(([, selector, id]) => [selector.trim(), id])).toEqual([
      ['.clr-echo__source', PHOSPHOR_ECHO_FILTER_ID],
    ])
  })
})

describe('silhouette geometry', () => {
  it('is the full filled chamfer footprint round 3 paints', () => {
    // round-3/screen.mjs: `M0 0H${w}V${h-cut}L${w-cut} ${h}H0Z`
    expect(chamferSilhouette(120, 48, 8)).toBe('M0 0H120V40L112 48H0Z')
  })
})

describe('rear sources', () => {
  beforeEach(layOut)

  it('draw a filled currentColor silhouette behind a framed component, hidden and inert', () => {
    const { container } = withPolicy(
      <PhosphorEchoFrame>
        <IconButton label="Back" icon={<ArrowLeft />} />
      </PhosphorEchoFrame>,
    )
    const rear = container.querySelector('.clr-echo__rear')
    const source = container.querySelector('.clr-echo__source')

    expect(rear).toHaveAttribute('aria-hidden', 'true')
    expect(rear).toHaveAttribute('focusable', 'false')
    expect(source).toHaveAttribute('fill', 'currentColor')
    expect(source?.getAttribute('d')).toMatch(/^M0 0H120V\S+L\S+ 48H0Z$/)
    expect(rear).toHaveStyle({ left: '4px', top: '6px', width: '120px', height: '48px' })
    // The real control keeps its name, focus and place, after the rear layer.
    const back = screen.getByRole('button', { name: 'Back' })
    expect(back.closest('.clr-echo')?.lastElementChild?.contains(back)).toBe(true)
    expect(rear?.contains(back)).toBe(false)
  })

  it('follow the whole card, accent bar included', () => {
    const { container } = withPolicy(
      <PhosphorEchoFrame>
        <PublicCard>Workout selections</PublicCard>
      </PhosphorEchoFrame>,
    )
    expect(container.querySelectorAll('.clr-echo__source')).toHaveLength(1)
    expect(container.querySelector('.clr-card .clr-echo__source')).toBeNull()
  })

  it('are pointer-inert and keep the exposed echo unclipped', () => {
    const css = read('phosphor-echo.css')
    const rule = (selector: string) => css.match(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? ''

    expect(rule('.clr-echo__rear')).toMatch(/pointer-events:\s*none/)
    expect(rule('.clr-echo__rear')).toMatch(/overflow:\s*visible/)
    expect(rule('.clr-echo-text__rear')).toMatch(/pointer-events:\s*none/)
  })

  it('duplicate heading text without changing its accessible name', () => {
    withPolicy(
      <Heading>
        <PhosphorEchoText>Generate</PhosphorEchoText>
      </Heading>,
    )
    const heading = screen.getByRole('heading', { name: 'Generate' })
    const rear = heading.querySelector('.clr-echo__source')

    expect(rear).toHaveAttribute('aria-hidden', 'true')
    expect(rear).toHaveTextContent('Generate')
    expect(heading.querySelectorAll('.clr-echo__source')).toHaveLength(1)
  })

  it('nest a glyph viewBox inside the filtered CSS-pixel space, never on it', () => {
    const { container } = withPolicy(
      <PhosphorEchoGlyph viewBox="0 0 240 240" d="M0 0H240V240H0Z">
        <svg viewBox="0 0 240 240" width={48} height={48} aria-hidden="true" />
      </PhosphorEchoGlyph>,
    )
    const rear = container.querySelector('.clr-echo__rear')
    const source = container.querySelector('.clr-echo__source')

    expect(rear).not.toHaveAttribute('viewBox')
    expect(source?.tagName).toBe('g')
    expect(source).not.toHaveAttribute('transform')
    expect(source?.querySelector('svg')).toHaveAttribute('viewBox', '0 0 240 240')
  })

  it('take no fixed hue: colour is the target’s own painted role colour', () => {
    const module = read('phosphor-echo.tsx')
    const css = read('phosphor-echo.css')

    expect(module).toContain("getComputedStyle(frame, '::after').backgroundColor")
    // Its hue at full alpha, so the footprint subtraction is complete.
    expect(module).toContain('rgb(from ${painted} r g b / 1)')
    expect(`${module}\n${css}`).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(\s*\d|hsla?\(\s*\d/i)
  })
})

describe('Visual effects off', () => {
  beforeEach(() => {
    layOut()
    localStorage.setItem(KEY, 'off')
  })

  it('leaves no rear source at all, and the real components untouched', () => {
    const { container } = withPolicy(
      <>
        <Heading>
          <PhosphorEchoText>Generate</PhosphorEchoText>
        </Heading>
        <PhosphorEchoFrame>
          <IconButton label="Back" icon={<ArrowLeft />} />
        </PhosphorEchoFrame>
        <PhosphorEchoFrame>
          <Button variant="primary">Generate Workout</Button>
        </PhosphorEchoFrame>
        <PhosphorEchoGlyph viewBox="0 0 24 24" d="M0 0H24V24H0Z">
          <svg viewBox="0 0 24 24" aria-hidden="true" />
        </PhosphorEchoGlyph>
      </>,
    )

    expect(container.querySelectorAll('.clr-echo__source, .clr-echo__rear')).toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'Generate' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate Workout' })).toBeInTheDocument()
  })
})
