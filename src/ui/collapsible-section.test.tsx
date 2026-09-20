/**
 * DS-04c acceptance: a disclosure with `aria-expanded` on a keyboard-operable
 * trigger; collapsed content stays in the accessibility tree's document order
 * (collapse is CSS-only, never `hidden`/`aria-hidden`/unmount); the transition
 * reads the motion vocabulary's semantic tokens and is inert under
 * `prefers-reduced-motion`; nesting works without the inner trigger stealing
 * the outer one's toggle.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../test/render'
import { CollapsibleSection } from './collapsible-section'

// jsdom loads no stylesheets, so the motion contract is asserted against the
// co-located CSS source. Vitest runs from the repository root.
const css = readFileSync(
  join(process.cwd(), 'src/ui/collapsible-section.css'),
  'utf8',
)

describe('CollapsibleSection disclosure pattern', () => {
  it('renders a button trigger named by the label, wired to the region with aria-expanded and aria-controls', () => {
    renderWithProviders(
      <CollapsibleSection label="Warm-up">
        <p>Two rounds, easy pace.</p>
      </CollapsibleSection>,
    )

    const trigger = screen.getByRole('button', { name: 'Warm-up' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    const region = screen.getByRole('region', { name: 'Warm-up' })
    expect(trigger).toHaveAttribute('aria-controls', region.id)
    expect(region).toHaveAttribute('aria-labelledby', trigger.id)
  })

  it('toggles aria-expanded on click', async () => {
    renderWithProviders(
      <CollapsibleSection label="Warm-up">
        <p>Content</p>
      </CollapsibleSection>,
    )

    const trigger = screen.getByRole('button', { name: 'Warm-up' })
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('is keyboard-operable — reachable by Tab, toggled by Enter and Space', async () => {
    renderWithProviders(
      <CollapsibleSection label="Warm-up">
        <p>Content</p>
      </CollapsibleSection>,
    )

    const trigger = screen.getByRole('button', { name: 'Warm-up' })
    await userEvent.tab()
    expect(trigger).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await userEvent.keyboard(' ')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('starts expanded when defaultExpanded is set', () => {
    renderWithProviders(
      <CollapsibleSection label="Warm-up" defaultExpanded>
        <p>Content</p>
      </CollapsibleSection>,
    )
    expect(screen.getByRole('button', { name: 'Warm-up' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('supports controlled use — the prop owns the state and changes are reported', async () => {
    const onExpandedChange = vi.fn()
    renderWithProviders(
      <CollapsibleSection
        label="Warm-up"
        expanded={false}
        onExpandedChange={onExpandedChange}
      >
        <p>Content</p>
      </CollapsibleSection>,
    )

    const trigger = screen.getByRole('button', { name: 'Warm-up' })
    await userEvent.click(trigger)
    expect(onExpandedChange).toHaveBeenCalledWith(true)
    // Controlled: without the owner changing the prop, the state stands.
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('CollapsibleSection collapsed content stays in the accessibility tree', () => {
  it('keeps collapsed content in the document, never hidden from assistive tech', () => {
    renderWithProviders(
      <CollapsibleSection label="Warm-up">
        <p>Two rounds, easy pace.</p>
      </CollapsibleSection>,
    )

    // Collapsed is the initial state — the content is still findable.
    const content = screen.getByText('Two rounds, easy pace.')
    expect(content).toBeInTheDocument()

    // The region is still exposed by role: collapse is CSS-only, so nothing
    // between the content and the root carries hidden/aria-hidden/inert.
    const region = screen.getByRole('region', { name: 'Warm-up' })
    for (let el: HTMLElement | null = content; el; el = el.parentElement) {
      expect(el).not.toHaveAttribute('hidden')
      expect(el).not.toHaveAttribute('aria-hidden')
      expect(el).not.toHaveAttribute('inert')
    }
    expect(region).toHaveAttribute('data-expanded', 'false')
  })

  it('keeps the content in document order after its trigger', () => {
    renderWithProviders(
      <CollapsibleSection label="Warm-up">
        <p>Content</p>
      </CollapsibleSection>,
    )

    const trigger = screen.getByRole('button', { name: 'Warm-up' })
    const region = screen.getByRole('region', { name: 'Warm-up' })
    expect(
      trigger.compareDocumentPosition(region) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})

describe('CollapsibleSection motion', () => {
  it('the transition reads the semantic motion tokens, stepped — never a raw duration', () => {
    // ATOMIC §8: components read --dur-enter/--dur-exit and steps(), not
    // hardcoded times or eases.
    expect(css).toMatch(/transition:[^;]*grid-template-rows[^;]*var\(--dur-/)
    expect(css).toMatch(/transition:[^;]*var\(--step-/)
    expect(css).not.toMatch(/\d+ms/)
    expect(css).not.toMatch(/ease/)
  })

  it('the transition is inert under prefers-reduced-motion', () => {
    const reduced = css.split('prefers-reduced-motion: reduce')[1]
    expect(reduced).toBeDefined()
    expect(reduced).toContain('.clr-collapsible__region')
    expect(reduced).toContain('transition: none')
  })
})

describe('CollapsibleSection nesting', () => {
  function nested() {
    return (
      <CollapsibleSection label="Session" defaultExpanded>
        <CollapsibleSection label="Warm-up">
          <p>Inner content</p>
        </CollapsibleSection>
      </CollapsibleSection>
    )
  }

  it('toggling the inner trigger leaves the outer disclosure alone', async () => {
    renderWithProviders(nested())

    const outer = screen.getByRole('button', { name: 'Session' })
    const inner = screen.getByRole('button', { name: 'Warm-up' })

    await userEvent.click(inner)
    expect(inner).toHaveAttribute('aria-expanded', 'true')
    expect(outer).toHaveAttribute('aria-expanded', 'true')
  })

  it('toggling the outer trigger leaves the inner disclosure alone', async () => {
    renderWithProviders(nested())

    const outer = screen.getByRole('button', { name: 'Session' })
    const inner = screen.getByRole('button', { name: 'Warm-up' })

    await userEvent.click(inner)
    await userEvent.click(outer)
    expect(outer).toHaveAttribute('aria-expanded', 'false')
    // Collapse never unmounts: the inner disclosure keeps its own state.
    expect(inner).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Inner content')).toBeInTheDocument()
  })
})

describe('CollapsibleSection conventions', () => {
  it('merges className and spreads native attributes on the root, like the export components', () => {
    renderWithProviders(
      <CollapsibleSection
        label="Warm-up"
        className="workout-section"
        data-testid="section"
        id="warm-up"
      >
        <p>Content</p>
      </CollapsibleSection>,
    )

    const root = screen.getByTestId('section')
    expect(root).toHaveClass('clr-collapsible', 'workout-section')
    expect(root).toHaveAttribute('id', 'warm-up')
  })

  it('imposes no heading level (CORE-05) — the screen decides the outline', () => {
    renderWithProviders(
      <CollapsibleSection label="Warm-up">
        <p>Content</p>
      </CollapsibleSection>,
    )
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('carries a shape cue for state, not colour alone — the glyph is decorative for assistive tech', async () => {
    renderWithProviders(
      <CollapsibleSection label="Warm-up">
        <p>Content</p>
      </CollapsibleSection>,
    )

    const trigger = screen.getByRole('button', { name: 'Warm-up' })
    const collapsedGlyph = trigger.querySelector('svg')
    expect(collapsedGlyph).not.toBeNull()
    expect(collapsedGlyph).toHaveAttribute('aria-hidden', 'true')

    await userEvent.click(trigger)
    const expandedGlyph = trigger.querySelector('svg')
    expect(expandedGlyph).toHaveAttribute('aria-hidden', 'true')
    // The chevron changes shape with the state — a cue beyond colour.
    expect(expandedGlyph?.innerHTML).not.toEqual(collapsedGlyph?.innerHTML)
  })
})
