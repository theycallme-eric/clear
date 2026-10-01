import { readFileSync } from 'node:fs'

import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderApp, renderWithProviders } from '../test/render'
import { Screen } from './Screen'

afterEach(() => {
  vi.useRealTimers()
})

describe('CLEAR 0.9.7 contained shell', () => {
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

  it('keeps one owner even when screen content is long', () => {
    const rows = Array.from({ length: 30 }, (_, index) => <p key={index}>Row {index + 1}</p>)
    const { container } = renderWithProviders(<Screen title="Long screen">{rows}</Screen>)

    expect(container.querySelectorAll('.clr-scroll-region__scroller')).toHaveLength(1)
    expect(screen.getByText('Row 30')).toBeInTheDocument()
  })
})
