import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MouseEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { TextAction } from '../design-system/index'

const foundation = readFileSync(
  resolve(import.meta.dirname, '../design-system/css/foundation.css'),
  'utf-8',
)

describe('TextAction public contract', () => {
  it('is a native button when it has no destination', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<TextAction onClick={onClick}>Skip for now</TextAction>)

    const action = screen.getByRole('button', { name: 'Skip for now' })
    expect(action).toHaveAttribute('type', 'button')
    expect(action).toHaveClass('clr-text-action')
    expect(action).not.toHaveAttribute('href')

    await user.click(action)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('is the public anchor for an external href', () => {
    render(<TextAction href="https://example.com/guide">Read the guide</TextAction>)

    const action = screen.getByRole('link', { name: 'Read the guide' })
    expect(action).toHaveAttribute('href', 'https://example.com/guide')
    expect(action).toHaveClass('clr-text-action')
  })

  it('activates the public anchor and retains its destination', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn((event: MouseEvent) => event.preventDefault())
    render(
      <TextAction href="https://example.com/guide" onClick={onClick}>
        Read the guide
      </TextAction>,
    )

    const action = screen.getByRole('link', { name: 'Read the guide' })
    expect(action).toHaveAttribute('href', 'https://example.com/guide')
    expect(action.className).toBe('clr-text-action')

    await user.click(action)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(action).toHaveAttribute('href', 'https://example.com/guide')
  })

  it('carries block and a consumer class on the public anchor', () => {
    render(
      <TextAction href="/history" block className="extra">
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
    const onLinkClick = vi.fn((event: MouseEvent) => event.preventDefault())
    render(
      <>
        <TextAction onClick={onClick}>Skip for now</TextAction>
        <TextAction href="/history" onClick={onLinkClick}>
          View history
        </TextAction>
      </>,
    )

    await user.tab()
    expect(screen.getByRole('button', { name: 'Skip for now' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledTimes(1)

    await user.tab()
    expect(screen.getByRole('link', { name: 'View history' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onLinkClick).toHaveBeenCalledTimes(1)
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
