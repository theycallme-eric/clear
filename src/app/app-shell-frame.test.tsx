/**
 * REQ-001: the shared mobile frame. 16px symmetric content gutters that reach
 * the header controls' outer edge, the page title in the header in place of
 * the repeated CLEAR logo, page rules kept apart from card-internal rules, and
 * the 0.14.3 type, chamfers, atmosphere and scanlines left to the package.
 */
import { readdirSync, readFileSync } from 'node:fs'

import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderApp, renderWithProviders, signedIn } from '../test/render'
import { createWorkoutDouble } from '../test/workout-double'
import { HOME_HEADING } from './Home'
import { Screen } from './Screen'

const shell = readFileSync('src/styles/shell.css', 'utf8')
const foundation = readFileSync('src/design-system/css/foundation.css', 'utf8')

/** The declarations of the first rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return shell.match(new RegExp(`(^|\\n)${escaped} \\{([^}]*)\\}`))?.[2] ?? ''
}

function signedInHome() {
  return signedIn({ workout: createWorkoutDouble({ session: null }).clients })
}

function fixedHeader(container: HTMLElement): HTMLElement {
  const header = container.querySelector<HTMLElement>('.clr-shell__content > header')
  expect(header).not.toBeNull()
  return header as HTMLElement
}

describe('REQ-001 16px symmetric content gutters', () => {
  it('makes the page gutter the shell inset, so content reaches the header controls’ edge', () => {
    const frame = rule('.clr-shell--contained > .clr-shell__content')

    expect(foundation).toContain('--spacing-400: 16px;')
    expect(frame).toContain('--shell-inset-left: max(var(--spacing-400), env(safe-area-inset-left));')
    expect(frame).toContain('--shell-inset-right: max(var(--spacing-400), env(safe-area-inset-right));')
    expect(frame).toContain('--page-gutter-left: var(--shell-inset-left);')
    expect(frame).toContain('--page-gutter-right: var(--shell-inset-right);')
    // No breakpoint pulls content back inside the header's edge.
    expect(shell).not.toMatch(/--page-gutter-(left|right):\s*calc/)
  })

  it('leaves the header — and the Settings control in it — on its existing outer edge', () => {
    const header = rule('.clr-shell--contained > .clr-shell__content > header')

    expect(header).toContain(
      'padding: 0 var(--shell-inset-right) var(--spacing-300) var(--shell-inset-left);',
    )
  })

  it('applies the same gutter on both sides of content and the pinned layers', () => {
    expect(rule('.clr-screen__content')).toContain(
      'padding: var(--spacing-100) var(--page-gutter-right) var(--spacing-300) var(--page-gutter-left);',
    )
    expect(
      rule('.clr-screen > .clr-scroll-region > :is(.clr-scroll-region__head, .clr-scroll-region__foot)'),
    ).toMatch(/padding-right: var\(--page-gutter-right\);\s*padding-left: var\(--page-gutter-left\);/)
  })

  it('renders Home’s cards and its Settings control inside the one gutter-owning frame', () => {
    const { container } = renderApp(['/'], signedInHome())
    const header = fixedHeader(container)
    const content = container.querySelector('.clr-screen__content')

    expect(within(header).getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    expect(content).not.toBeNull()
    expect(content?.querySelector('.clr-card')).not.toBeNull()
    // Gutters come from the frame alone; no card or action sets its own.
    for (const element of content?.querySelectorAll<HTMLElement>('.clr-card, .clr-bleed') ?? []) {
      expect(element.style.marginLeft).toBe('')
      expect(element.style.marginRight).toBe('')
    }
  })
})

describe('REQ-001 page title in the header', () => {
  it.each([
    { path: '/', options: signedInHome, title: HOME_HEADING },
    { path: '/settings', options: signedInHome, title: 'Settings' },
    { path: '/history', options: signedInHome, title: 'History' },
    { path: '/generate', options: signedInHome, title: 'Generate workout' },
    { path: '/review', options: signedInHome, title: 'Nothing to review' },
    { path: '/login', options: () => ({}), title: 'Get started' },
  ])('shows $title in $path’s header instead of the CLEAR logo', async ({ path, options, title }) => {
    const { container } = renderApp([path], options())
    const heading = await screen.findByRole('heading', { level: 1, name: title })
    const header = fixedHeader(container)

    expect(header.contains(heading)).toBe(true)
    expect(heading).toHaveClass('clr-screen__title')
    expect(within(header).queryByText('CLEAR')).toBeNull()
    // One h1 per screen: the content does not repeat the title.
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    expect(container.querySelector('main h1')).toBeNull()
  })

  it('keeps the h1 in the content for a screen without a fixed header', () => {
    const { container } = renderWithProviders(<Screen title="Plain">Body</Screen>)

    expect(container.querySelector('header')).toBeNull()
    expect(container.querySelector('main .clr-screen__content > h1')).toHaveTextContent('Plain')
  })

  it('opens the first card a group gap below the header rule', () => {
    const { container } = renderWithProviders(
      <Screen title="Titled" header={{}}>
        Body
      </Screen>,
    )

    expect(container.querySelector('.clr-screen__content')).toHaveClass(
      'clr-screen__content--titled-head',
    )
    expect(rule('.clr-screen__content--titled-head')).toContain('padding-top: var(--spacing-400);')
  })
})

describe('B05 shared header clearance and bottom edge', () => {
  const frame = rule('.clr-shell--contained > .clr-shell__content')

  it('starts the page gap below the top inset instead of absorbing it', () => {
    expect(frame).toContain('--shell-gap-top: var(--spacing-500);')
    expect(frame).toContain('--shell-inset-top: calc(env(safe-area-inset-top) + var(--shell-gap-top));')
    expect(frame).toContain('padding-top: var(--shell-inset-top);')
    expect(frame).not.toMatch(/padding-top:\s*max\(/)
  })

  it('reserves nothing below the shell; the last layer carries the bottom inset', () => {
    expect(frame).toContain('--shell-gap-bottom: var(--spacing-300);')
    expect(frame).toContain(
      '--shell-inset-bottom: max(var(--shell-gap-bottom), env(safe-area-inset-bottom));',
    )
    expect(frame).toContain('padding-bottom: 0;')
    expect(rule('.clr-scroll-region__foot > .clr-footer')).toContain(
      'padding: var(--spacing-300) 0 var(--shell-inset-bottom, var(--spacing-300));',
    )
    expect(
      rule('.clr-screen > .clr-scroll-region:not(:has(> .clr-scroll-region__foot)) .clr-screen__content'),
    ).toContain('padding-bottom: var(--shell-inset-bottom, var(--spacing-300));')
  })

  it('states no route offset, fixed height or zeroed inset anywhere in the app styles', () => {
    for (const name of readdirSync('src/styles').filter((file) => file.endsWith('.css'))) {
      const css = readFileSync(`src/styles/${name}`, 'utf8')
      expect(css, name).not.toMatch(/calc\(100d?vh\s*-/)
      expect(css, name).not.toMatch(/env\(safe-area-inset-\w+\)\s*\*\s*0|safe-area-inset-\w+:\s*0/)
    }
    // The workout's short-window rule narrows the gaps, never the insets.
    const workout = readFileSync('src/ui/workout-navigation.css', 'utf8')
    expect(workout).toContain('--shell-gap-top: var(--spacing-200);')
    expect(workout).toContain('--shell-gap-bottom: var(--spacing-200);')
    expect(workout).not.toMatch(/padding-(top|bottom):\s*max\(var\(--spacing-200\), env/)
  })

  it('routes, boot and the crash fallback render the one ContainedShell', () => {
    for (const file of ['src/app/RootLayout.tsx', 'src/app/BootSequence.tsx', 'src/app/ErrorBoundary.tsx']) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).toContain('<ContainedShell')
    }
    const root = readFileSync('src/app/RootLayout.tsx', 'utf8')
    expect(root.match(/clr-shell clr-shell--fixed clr-shell--contained/g)).toHaveLength(1)
    for (const file of ['src/app/BootSequence.tsx', 'src/app/ErrorBoundary.tsx']) {
      expect(readFileSync(file, 'utf8'), file).not.toContain('clr-shell--contained')
    }
  })
})

describe('REQ-001 page rules stay distinct from card-internal rules', () => {
  it('runs header, band and footer rules edge to edge on the page gutter', () => {
    expect(rule('.clr-shell--contained > .clr-shell__content')).toMatch(/padding-right: 0;[\s\S]*padding-left: 0;/)
    expect(rule('.clr-shell--contained > .clr-shell__content > header')).toContain(
      'border-bottom: var(--border-width) solid var(--border-region-rule);',
    )
    expect(rule('.clr-screen__content .clr-band')).toContain(
      'margin-left: calc(var(--page-gutter-left) * -1);',
    )
  })

  it('keeps card-internal row rules on the card’s own padding, never the page gutter', () => {
    const inCard = rule('.clr-list--in-card > .clr-list__row + .clr-list__row::before')

    expect(inCard).toContain('left: calc(var(--border-width) - var(--spacing-300));')
    expect(inCard).toContain('right: calc(var(--border-width) - var(--spacing-300));')
    expect(inCard).not.toContain('gutter')
    expect(rule('.clr-list__row + .clr-list__row::before')).not.toContain('gutter')
  })
})

describe('REQ-001 preserves the 0.14.3 type, chamfers, atmosphere and scanlines', () => {
  it('sets the header title in the package’s own h1 display type', () => {
    const title = rule('.clr-shell__content > header .clr-screen__title')

    expect(foundation).toMatch(/h1, \.h1, h2[^{]*\{ font-family: var\(--font-display\);/)
    expect(title).not.toMatch(/font|letter-spacing|text-transform|color/)
  })

  it('leaves chamfers, scanlines and atmosphere to the package and RootLayout', () => {
    const { container } = renderApp(['/'], signedInHome())

    expect(container.querySelector('[data-atmosphere]')).not.toBeNull()
    expect(container.querySelector('.clr-chamfer')).not.toBeNull()
    for (const name of readdirSync('src/styles').filter((file) => file.endsWith('.css'))) {
      const css = readFileSync(`src/styles/${name}`, 'utf8')
      expect(css, name).not.toMatch(/border-radius:\s*(?!0)/)
    }
    expect(shell).not.toMatch(/clip-path|scanline|--chamfer-/)
  })

  it('stays on the vendored clear-design-system 0.14.3', () => {
    const pkg = JSON.parse(readFileSync('src/design-system/package.json', 'utf8')) as {
      version: string
    }

    expect(pkg.version).toBe('0.14.3')
  })
})
