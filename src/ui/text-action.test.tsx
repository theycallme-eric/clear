import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { TextAction as PublicTextAction } from '../design-system/index'
import { TextAction } from './text-action'

const foundation = readFileSync(
  resolve(import.meta.dirname, '../design-system/css/foundation.css'),
  'utf-8',
)

function renderAt(ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={ui} />
        <Route path="/history" element={<h1>History</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('TextAction adapter', () => {
  it('is the public button when it has no destination', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    renderAt(
      <>
        <TextAction onClick={onClick}>Skip for now</TextAction>
        <PublicTextAction>Reference</PublicTextAction>
      </>,
    )

    const action = screen.getByRole('button', { name: 'Skip for now' })
    expect(action).toHaveAttribute('type', 'button')
    expect(action.className).toBe(screen.getByRole('button', { name: 'Reference' }).className)
    expect(action).not.toHaveAttribute('to')

    await user.click(action)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('is the public anchor for an external href', () => {
    renderAt(<TextAction href="https://example.com/guide">Read the guide</TextAction>)

    const action = screen.getByRole('link', { name: 'Read the guide' })
    expect(action).toHaveAttribute('href', 'https://example.com/guide')
    expect(action).toHaveClass('clr-text-action')
  })

  it('navigates in-app through the router, wearing the public class', async () => {
    const user = userEvent.setup()
    renderAt(<TextAction to="/history">View history</TextAction>)

    const action = screen.getByRole('link', { name: 'View history' })
    expect(action).toHaveAttribute('href', '/history')
    expect(action.className).toBe('clr-text-action')

    await user.click(action)
    expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument()
  })

  it('carries block and a consumer class on the routed link', () => {
    renderAt(
      <TextAction to="/history" block className="extra">
        View history
      </TextAction>,
    )

    expect(screen.getByRole('link', { name: 'View history' })).toHaveClass(
      'clr-text-action',
      'clr-text-action--block',
      'extra',
    )
  })

  it('takes keyboard focus and activates from the keyboard', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    renderAt(
      <>
        <TextAction onClick={onClick}>Skip for now</TextAction>
        <TextAction to="/history">View history</TextAction>
      </>,
    )

    await user.tab()
    expect(screen.getByRole('button', { name: 'Skip for now' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledTimes(1)

    await user.tab()
    expect(screen.getByRole('link', { name: 'View history' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument()
  })

  it('gets its chevron, 40px target and focus ring from the public stylesheet', () => {
    const base = foundation.match(/\.clr-text-action \{([^}]*)\}/)?.[1] ?? ''
    expect(base).toContain('min-height: var(--control-height)')
    // A frameless action: no border, and the global link underline is cleared.
    expect(base).toContain('border: 0')
    expect(base).toContain('background: transparent')
    expect(foundation).toMatch(/\.clr-text-action::after \{ content: '›'/)
    expect(foundation).toMatch(/--control-height:\s*40px/)
    expect(foundation).toMatch(
      /button:focus-visible, a:focus-visible[^{]*\{\s*outline: var\(--focus-ring-width\)/,
    )
  })
})
