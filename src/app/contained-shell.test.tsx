import { readdirSync, readFileSync } from 'node:fs'

import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderApp, renderWithProviders } from '../test/render'
import { Screen } from './Screen'

afterEach(() => {
  vi.useRealTimers()
})

describe('CLEAR 0.14.3 contained shell', () => {
  it('makes the fixed shell and public ScrollRegion structural for a route', () => {
    const { container } = renderApp(['/welcome'])

    expect(container.querySelector('.clr-shell')).toHaveClass(
      'clr-shell--fixed',
      'clr-shell--contained',
    )
    expect(container.querySelectorAll('.clr-scroll-region')).toHaveLength(1)
    expect(container.querySelectorAll('.clr-scroll-region__scroller')).toHaveLength(1)
  })

  it('lights transient scroll feedback and removes it after the package settle time', () => {
    vi.useFakeTimers()
    const { container } = renderApp(['/welcome'])
    const region = container.querySelector('.clr-scroll-region')
    const scroller = screen.getByRole('region', { name: 'Welcome content' })

    fireEvent.scroll(scroller)
    expect(region).toHaveAttribute('data-scrolling')
    // With no pinned head, only the bottom hard edge needs a streak.
    expect(region?.querySelectorAll('.clr-scroll-region__streak')).toHaveLength(1)
    expect(region?.querySelector('.clr-scroll-region__bar')).not.toBeNull()

    act(() => vi.advanceTimersByTime(421))
    expect(region).not.toHaveAttribute('data-scrolling')
  })

  it('contains document scrolling and follows safe-area and dynamic viewport insets', () => {
    const css = readFileSync('src/styles/shell.css', 'utf8')
    const foundation = readFileSync('src/design-system/css/foundation.css', 'utf8')

    expect(css).toMatch(/html,\s*body,\s*#root\s*\{[^}]*overflow: hidden;/s)
    expect(css).toContain('env(safe-area-inset-top)')
    expect(css).toContain('env(safe-area-inset-right)')
    expect(css).toContain('env(safe-area-inset-bottom)')
    expect(css).toContain('env(safe-area-inset-left)')
    expect(foundation).toContain('height: 100dvh')
    expect(foundation).toMatch(
      /\.clr-scroll-region__scroller\s*\{[^}]*overflow-y: auto;/s,
    )
    expect(foundation).not.toMatch(/\.clr-scroll-region[^}]*mask-image/)
  })

  it('keeps reduced-motion scroll feedback static rather than removing its state cue', () => {
    const foundation = readFileSync('src/design-system/css/foundation.css', 'utf8')

    expect(foundation).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{ \.clr-scroll-region__bar \{ transition: none;/,
    )
    expect(foundation).toMatch(
      /\.clr-scroll-region\[data-scrolling\] > \.clr-scroll-region__streak \{ opacity: 0\.5; box-shadow: none;/,
    )
  })

  it('leaves pinned layers transparent and clips at a hard edge', () => {
    const css = readFileSync('src/styles/shell.css', 'utf8')
    const foundation = readFileSync('src/design-system/css/foundation.css', 'utf8')
    const layers = foundation.match(
      /\.clr-scroll-region__head, \.clr-scroll-region__foot \{[^}]*\}/s,
    )?.[0]

    // The scroller ends where the measured layers begin, so no layer needs a
    // surface to hide content and the app adds none.
    expect(foundation).toMatch(
      /\.clr-scroll-region__scroller \{[^}]*top: var\(--head-h, 0px\); bottom: var\(--foot-h, 0px\);/s,
    )
    expect(layers).toBeDefined()
    expect(layers).not.toMatch(/background/)
    expect(css).not.toMatch(/background/)
    expect(css).not.toMatch(/mask|linear-gradient/)
  })

  it('takes the action row from the package instead of restating it', () => {
    const css = readFileSync('src/styles/shell.css', 'utf8')
    const foundation = readFileSync('src/design-system/css/foundation.css', 'utf8')

    expect(foundation).toContain('.clr-actions > .clr-bleed { display: flex; }')
    expect(css).not.toMatch(/\.clr-actions[^{}`]*\{/)
  })

  it('keeps one owner even when screen content is long', () => {
    const rows = Array.from({ length: 30 }, (_, index) => <p key={index}>Row {index + 1}</p>)
    const { container } = renderWithProviders(<Screen title="Long screen">{rows}</Screen>)

    expect(container.querySelectorAll('.clr-scroll-region__scroller')).toHaveLength(1)
    expect(screen.getByText('Row 30')).toBeInTheDocument()
  })
})

describe('CLEAR 0.14.3 line strength, ground and type', () => {
  const foundation = readFileSync('src/design-system/css/foundation.css', 'utf8')
  const skins = readFileSync('src/design-system/css/skins.css', 'utf8')
  const appStyles = readdirSync('src/styles')
    .filter((name) => name.endsWith('.css'))
    .map((name) => ({ name, css: readFileSync(`src/styles/${name}`, 'utf8') }))

  /** Tokens whose value is the package's decision; no skin or app sheet may restate one. */
  const SHIPPED_TOKENS = [
    '--emit-near',
    '--emit-far',
    '--bleed-spread',
    '--glow-spread',
    '--card-ground-alpha',
    '--border-width',
    '--paragraph-xs-line-height',
    '--paragraph-sm-line-height',
    '--paragraph-md-line-height',
  ]

  it('emits every stroke through the tight 80% and wide 35% halo', () => {
    expect(foundation).toContain('--emit-near: 1.5px;')
    expect(foundation).toContain('--emit-far: 5px;')
    expect(foundation).toMatch(
      /filter: drop-shadow\(0 0 var\(--emit-near\) rgb\(from [^;]* \/ 0\.8\)\) drop-shadow\(0 0 var\(--emit-far\) rgb\(from [^;]* \/ 0\.35\)\);/,
    )
  })

  it('reserves the 6px glow for the primary action', () => {
    expect(foundation).toContain('--glow-spread: 6px;')
    expect(foundation).toContain(
      '.clr-bleed.clr-glow { filter: drop-shadow(0 0 var(--glow-spread) var(--glow-color)); }',
    )
  })

  it('grounds a card at 70% and never fills the emission ring', () => {
    expect(foundation).toContain('--card-ground-alpha: 0.7;')
    expect(foundation).toContain(
      '.clr-card__body::before { background-color: rgb(from var(--base) r g b / var(--card-ground-alpha)); }',
    )
  })

  it('sets body text at 1.25 with 15px and 17.5px small steps', () => {
    expect(foundation).toContain(
      '--paragraph-xs-size: 12px; --paragraph-xs-line-height: 15px;',
    )
    expect(foundation).toContain(
      '--paragraph-sm-size: 14px; --paragraph-sm-line-height: 17.5px;',
    )
    expect(foundation).toContain(
      '--paragraph-md-size: 16px; --paragraph-md-line-height: 20px;',
    )
  })

  it.each(['clear', 'vapour', 'signal', 'mono'])(
    'gives the %s skin the same emission, ground and density',
    (skin) => {
      expect(skins).toContain(`[data-skin="${skin}"] {`)
      const rules = [...skins.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, selector]) =>
        selector.includes(`[data-skin="${skin}"]`),
      )

      expect(rules.length).toBeGreaterThan(0)
      for (const [, , declarations] of rules) {
        for (const token of SHIPPED_TOKENS) {
          expect(declarations, token).not.toContain(`${token}:`)
        }
      }
    },
  )

  it('lets no app stylesheet restate a shipped value or keep a retired alias', () => {
    expect(appStyles.length).toBeGreaterThan(0)
    for (const { name, css } of appStyles) {
      for (const token of SHIPPED_TOKENS) {
        expect(css, `${name} ${token}`).not.toContain(`${token}:`)
      }
      expect(css, name).not.toMatch(/--font-(headings|label|paragraph)\b/)
      expect(css, name).not.toMatch(/--color-(orange|blue|green|red|purple|neutral)-/)
    }
  })
})
