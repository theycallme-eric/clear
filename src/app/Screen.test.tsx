import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../test/render'
import { Heading, HeadingSection } from '../ui/Heading'
import { Screen } from './Screen'

describe('Screen (CORE-05)', () => {
  it('puts a custom artwork name on the heading itself without changing its title announcement', () => {
    renderWithProviders(<Screen title="Welcome" heading={<span role="img" aria-label="CLEAR"><svg aria-hidden="true" /></span>} />)
    expect(screen.getByRole('heading', { level: 1, name: 'CLEAR' })).toHaveAttribute('aria-label', 'CLEAR')
    expect(document.title).toBe('Welcome · CLEAR')
  })
  it('renders exactly one main landmark and one h1', () => {
    renderWithProviders(
      <Screen title="Sample">
        <p>Body</p>
      </Screen>,
    )

    expect(screen.getAllByRole('main')).toHaveLength(1)
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Sample')
  })

  it('makes the main landmark and h1 programmatically focusable', () => {
    renderWithProviders(<Screen title="Sample" />)

    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute(
      'tabindex',
      '-1',
    )
  })

  it('gives the screen one named, keyboard-reachable vertical scroll owner', () => {
    const { container } = renderWithProviders(<Screen title="Sample">Body</Screen>)

    const region = container.querySelector('.clr-scroll-region')
    const scroller = screen.getByRole('region', { name: 'Sample content' })
    expect(region).not.toBeNull()
    expect(container.querySelectorAll('.clr-scroll-region__scroller')).toHaveLength(1)
    expect(scroller).toHaveClass('clr-scroll-region__scroller')
    expect(scroller).toHaveAttribute('tabindex', '0')
    expect(scroller).toContainElement(screen.getByRole('heading', { level: 1 }))
  })

  it('keeps optional pinned layers outside the scrolling content', () => {
    renderWithProviders(
      <Screen
        title="Sample"
        pinnedHead={<nav aria-label="Views">Recent</nav>}
        pinnedFoot={<button type="button">Save</button>}
      >
        Body
      </Screen>,
    )

    const scroller = screen.getByRole('region', { name: 'Sample content' })
    expect(scroller).not.toContainElement(screen.getByRole('navigation', { name: 'Views' }))
    expect(scroller).not.toContainElement(screen.getByRole('button', { name: 'Save' }))
    expect(
      screen.getByRole('navigation', { name: 'Views' }).closest('.clr-scroll-region__head'),
    ).not.toBeNull()
    expect(
      screen.getByRole('button', { name: 'Save' }).closest('.clr-scroll-region__foot'),
    ).not.toBeNull()
    expect(document.querySelectorAll('.clr-scroll-region__streak')).toHaveLength(2)
  })

  it('sets a per-screen document title suffixed with the app name', () => {
    renderWithProviders(<Screen title="Sample" />)

    expect(document.title).toBe('Sample · CLEAR')
  })

  it('uses the bare app name for the app-named screen', () => {
    renderWithProviders(<Screen title="CLEAR" />)

    expect(document.title).toBe('CLEAR')
  })

  it('renders custom heading content while announcing by title', () => {
    renderWithProviders(
      <Screen title="Sample" heading={<span>Wordmark</span>} />,
    )

    expect(
      screen.getByRole('heading', { level: 1, name: 'Wordmark' }),
    ).toBeInTheDocument()
    expect(document.title).toBe('Sample · CLEAR')
  })

  it('starts child headings at level 2 and never lets sections skip levels', () => {
    renderWithProviders(
      <Screen title="Sample">
        <Heading>Section</Heading>
        <HeadingSection>
          <Heading>Subsection</Heading>
          <HeadingSection>
            <Heading>Deep</Heading>
          </HeadingSection>
        </HeadingSection>
      </Screen>,
    )

    expect(
      screen.getByRole('heading', { level: 2, name: 'Section' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 3, name: 'Subsection' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 4, name: 'Deep' }),
    ).toBeInTheDocument()
  })
})

/**
 * B05 REQ-003: the sibling header is connected to the public region's pinned
 * head, and a footerless screen that overflows gets a bare lower edge layer.
 * jsdom has no layout, so the scroller's overflow is stated explicitly.
 */
describe('Screen scroll boundaries (B05 REQ-003)', () => {
  function overflowBy(scrollHeight: number, clientHeight: number) {
    const proto = HTMLElement.prototype
    const scroll = Object.getOwnPropertyDescriptor(proto, 'scrollHeight')
    const client = Object.getOwnPropertyDescriptor(proto, 'clientHeight')
    Object.defineProperty(proto, 'scrollHeight', { configurable: true, get: () => scrollHeight })
    Object.defineProperty(proto, 'clientHeight', { configurable: true, get: () => clientHeight })
    return () => {
      if (scroll) Object.defineProperty(proto, 'scrollHeight', scroll)
      else Reflect.deleteProperty(proto, 'scrollHeight')
      if (client) Object.defineProperty(proto, 'clientHeight', client)
      else Reflect.deleteProperty(proto, 'clientHeight')
    }
  }

  it('places the header in the region’s pinned head, so the top streak is emitted on its rule', () => {
    const { container } = renderWithProviders(
      <Screen title="Titled" header={{}}>
        <p>Body</p>
      </Screen>,
    )

    const region = container.querySelector('main > .clr-scroll-region')!
    const head = region.querySelector(':scope > .clr-scroll-region__head')
    expect(head?.querySelector(':scope > header h1')).toHaveTextContent('Titled')
    // The header draws its own closing rule; the region adds no second one.
    expect(head).not.toHaveAttribute('data-rule')
    expect(region.querySelectorAll(':scope > .clr-scroll-region__streak')).toHaveLength(2)
    expect(region.querySelector('.clr-scroll-region__scroller header')).toBeNull()
  })

  it('TASK-025 pins a header and a pinned layer together as one head closed by one divider', () => {
    const { container } = renderWithProviders(
      <Screen title="Titled" header={{}} pinnedHead={<p>Step 1 of 5</p>}>
        <p>Body</p>
      </Screen>,
    )

    const region = container.querySelector('main > .clr-scroll-region')!
    const head = region.querySelector(':scope > .clr-scroll-region__head')!
    const header = head.querySelector(':scope > header')!
    const pinned = head.querySelector<HTMLElement>(':scope > .clr-screen__pinned')!
    expect(header.querySelector('h1')).toHaveTextContent('Titled')
    expect(pinned).toHaveTextContent('Step 1 of 5')
    expect(header.nextElementSibling).toBe(pinned)
    // One divider: the head's own rule, under the layer; the header gives up its rule.
    expect(head).toHaveAttribute('data-rule')
    const shell = readFileSync(resolve(import.meta.dirname, '../styles/shell.css'), 'utf8')
    expect(shell).toMatch(
      /\.clr-scroll-region__head > header:has\(\+ \.clr-screen__pinned\) \{\s*border-bottom: 0;\s*\}/,
    )
    expect(region.querySelector('.clr-scroll-region__scroller')).not.toContainElement(pinned)
    expect(region.querySelectorAll(':scope > .clr-scroll-region__streak')).toHaveLength(2)
  })

  it('TASK-025 lets a pinned layer that draws its own rule close the shared head instead', () => {
    const { container } = renderWithProviders(
      <Screen title="Titled" header={{}} pinnedHead={<nav aria-label="Views">Recent</nav>} pinnedHeadRule={false}>
        <p>Body</p>
      </Screen>,
    )
    const head = container.querySelector('main > .clr-scroll-region > .clr-scroll-region__head')!
    expect(head).not.toHaveAttribute('data-rule')
    expect(head.querySelector(':scope > .clr-screen__pinned > nav')).not.toBeNull()
  })

  it('emits no top streak for a screen without a header or pinned head', () => {
    const { container } = renderWithProviders(<Screen title="Plain">Body</Screen>)

    const region = container.querySelector('main > .clr-scroll-region')!
    expect(region.querySelector(':scope > .clr-scroll-region__head')).toBeNull()
    expect(region.querySelectorAll(':scope > .clr-scroll-region__streak')).toHaveLength(1)
  })

  it.each([undefined, null, false])('gives an overflowing screen a bare lower edge when its footer is %s', (footer) => {
    const restore = overflowBy(2000, 600)
    try {
      const { container } = renderWithProviders(
        <Screen title="Settings" header={{}} pinnedFoot={footer}>
          <p>Long</p>
        </Screen>,
      )
      const foot = container.querySelector('main > .clr-scroll-region > .clr-scroll-region__foot')
      expect(foot?.querySelector(':scope > [data-screen-edge]')).not.toBeNull()
      expect(foot?.querySelector('button, a, .clr-footer')).toBeNull()
    } finally {
      restore()
    }
  })

  it.each([undefined, null, false])('adds no lower edge when the content fits and its footer is %s', (footer) => {
    const restore = overflowBy(600, 600)
    try {
      const { container } = renderWithProviders(
        <Screen title="Short" header={{}} pinnedFoot={footer}>
          <p>Short</p>
        </Screen>,
      )
      expect(container.querySelector('.clr-scroll-region__foot')).toBeNull()
    } finally {
      restore()
    }
  })

  it('keeps a screen’s own footer as its lower layer', () => {
    const restore = overflowBy(2000, 600)
    try {
      const { container } = renderWithProviders(
        <Screen title="Footed" header={{}} pinnedFoot={<div className="clr-footer">Action</div>}>
          <p>Long</p>
        </Screen>,
      )
      expect(container.querySelector('[data-screen-edge]')).toBeNull()
      expect(container.querySelector('.clr-scroll-region__foot > .clr-footer')).not.toBeNull()
    } finally {
      restore()
    }
  })
})
