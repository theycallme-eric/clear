/**
 * 0.14.3 Card adapter: a thin semantic composition over the public Card. One
 * mandatory accent bar, role-paired state, automatic corner size, diagonal
 * clearance, real headings as children, and no card inside a card.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../test/render'
import { Card, CardActions, type CardProps } from './card'
import { HeadingLevelProvider, HeadingSection } from './Heading'

const FOUNDATION = readFileSync(
  join(process.cwd(), 'src/design-system/css/foundation.css'),
  'utf-8',
)

function cardOf(testId: string) {
  const body = screen.getByTestId(testId)
  const card = body.parentElement as HTMLElement
  return { body, card, bleed: card.parentElement as HTMLElement }
}

describe('Card composition', () => {
  it('renders the public card: emission wrapper, one bar, closed chamfered body', () => {
    renderWithProviders(<Card data-testid="card">Session summary</Card>)

    const { body, card, bleed } = cardOf('card')
    expect(bleed).toHaveClass('clr-bleed', 'clr-bleed--block')
    expect(card).toHaveClass('clr-card')
    expect(body).toHaveClass('clr-card__body', 'clr-chamfer')
    expect(body).not.toHaveClass('clr-chamfer--open-left')
    expect(body).toHaveTextContent('Session summary')
  })

  it('always carries exactly one decorative bar, sized by the token alone', () => {
    renderWithProviders(<Card data-testid="card">Content</Card>)

    const { card } = cardOf('card')
    const bars = card.querySelectorAll('.clr-card__bar')
    expect(bars).toHaveLength(1)
    expect(card.firstElementChild).toBe(bars[0])
    expect(bars[0]).toHaveAttribute('aria-hidden', 'true')
    expect(bars[0]).toBeEmptyDOMElement()
    expect(bars[0].className).toBe('clr-card__bar')
    expect(bars[0].getAttribute('style')).toBeNull()
    // The shipped token owns the single 12px width.
    expect(FOUNDATION).toMatch(/--accent-bar-width:\s*12px/)
    expect(FOUNDATION).toMatch(/\.clr-card__bar\s*\{[^}]*var\(--accent-bar-width\)/)
  })

  it('offers no way to drop or widen the bar', () => {
    // @ts-expect-error the optional/two-width bar API is retired
    const retired: CardProps = { barWidth: 'lg' }
    expect(retired).toBeDefined()

    renderWithProviders(
      <Card data-testid="card" padding="sm">
        Content
      </Card>,
    )

    const { card } = cardOf('card')
    expect(card.querySelectorAll('.clr-card__bar')).toHaveLength(1)
    expect(card.querySelector('.clr-card__bar--lg')).toBeNull()
  })

  it('merges className and spreads native attributes onto the card body', async () => {
    const onClick = vi.fn()
    renderWithProviders(
      <Card data-testid="card" className="history-card" id="session-1" onClick={onClick}>
        Content
      </Card>,
    )

    const { body } = cardOf('card')
    expect(body).toHaveClass('clr-card__body', 'history-card')
    expect(body).toHaveAttribute('id', 'session-1')
    await userEvent.click(body)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('Card role, ground and emission', () => {
  it('defaults to the structure card border for body, bar and emission', () => {
    renderWithProviders(<Card data-testid="card">Content</Card>)

    const { body, bleed } = cardOf('card')
    expect(bleed.style.getPropertyValue('--bleed')).toBe('var(--border-card)')
    expect(body.className).not.toMatch(/clr-chamfer--(interaction|selection|urgency|info|timer)/)
  })

  it.each([
    ['interaction', 'var(--border-frame-interaction)'],
    ['selection', 'var(--border-frame-selection)'],
    ['urgency', 'var(--border-frame-urgency)'],
    ['info', 'var(--border-frame-info)'],
    ['timer', 'var(--border-timer)'],
    ['timer-low', 'var(--border-timer-low)'],
  ] as const)('pairs body, bar and emission on the %s role', (role, bleedColor) => {
    renderWithProviders(
      <Card data-testid="card" role={role}>
        Content
      </Card>,
    )

    const { body, bleed } = cardOf('card')
    expect(body).toHaveClass(`clr-chamfer--${role}`)
    expect(bleed.style.getPropertyValue('--bleed')).toBe(bleedColor)
    // The bar has no colour of its own: the shipped CSS derives it from the body role.
    expect(FOUNDATION).toContain(
      `.clr-card:has(> .clr-card__body.clr-chamfer--${role}) > .clr-card__bar`,
    )
  })

  it('sits on the shipped 70% card ground without a fill of its own', () => {
    renderWithProviders(<Card data-testid="card">Content</Card>)

    const { body } = cardOf('card')
    expect(body.style.background).toBe('')
    expect(body.style.backgroundColor).toBe('')
    expect(FOUNDATION).toMatch(/--card-ground-alpha:\s*0\.7\b/)
    expect(FOUNDATION).toMatch(
      /\.clr-card__body::before\s*\{[^}]*var\(--card-ground-alpha\)/,
    )
  })
})

describe('Card automatic corner and diagonal clearance', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('has no fixed-corner escape hatch', () => {
    renderWithProviders(
      // @ts-expect-error corner size is always automatic through the adapter
      <Card data-testid="card" cornerSize="lg">
        Content
      </Card>,
    )

    expect(cardOf('card').body).not.toHaveClass('clr-chamfer--lg')
  })

  it.each([
    [60, 'sm'],
    [120, 'md'],
    [320, 'lg'],
  ] as const)('a %ipx-tall card takes the %s cut and matching clearance', (height, size) => {
    const observers: Array<() => void> = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          observers.push(callback)
        }
        observe() {}
        disconnect() {}
      },
    )
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height,
    } as DOMRect)

    renderWithProviders(<Card data-testid="card">Content</Card>)
    act(() => observers.forEach((notify) => notify()))

    const { body } = cardOf('card')
    expect(body).toHaveClass(`clr-chamfer--${size}`)
    for (const other of ['sm', 'md', 'lg'].filter((candidate) => candidate !== size)) {
      expect(body).not.toHaveClass(`clr-chamfer--${other}`)
    }
    // Bottom padding ≥ cut + side × (√2 − 1) keeps content clear of the diagonal.
    expect(body.getAttribute('style')).toContain(
      `calc(var(--chamfer-${size}) + var(--spacing-300) * 0.414)`,
    )
  })
})

describe('Card headings', () => {
  it('renders no heading of its own when none is given', () => {
    renderWithProviders(<Card>Just text</Card>)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('renders its heading inside the card at the surrounding outline level', () => {
    renderWithProviders(
      <HeadingLevelProvider level={2}>
        <Card data-testid="card" heading="This week" meta="Week 4">
          Content
        </Card>
      </HeadingLevelProvider>,
    )

    const heading = screen.getByRole('heading', { level: 2, name: 'This week' })
    expect(heading).toHaveClass('label')
    expect(cardOf('card').body).toContainElement(heading)
    expect(heading.closest('.clr-card')).toBe(cardOf('card').card)
    expect(screen.getByText('Week 4')).toHaveClass('label')
    expect(heading).not.toContainElement(screen.getByText('Week 4'))
  })

  it('never places a block heading inside an inline span', () => {
    renderWithProviders(
      <Card heading="Train today">
        <h4>Pull Day</h4>
      </Card>,
    )

    for (const heading of screen.getAllByRole('heading')) {
      expect(heading.closest('span')).toBeNull()
    }
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Pull Day')
  })
})

describe('Card containment', () => {
  it('turns a card inside a card into a ruled sub-group, not a second card', () => {
    renderWithProviders(
      <Card data-testid="outer" heading="Session">
        <Card data-testid="inner" heading="Warm-up" role="urgency" className="warm-up">
          Five minutes easy
        </Card>
      </Card>,
    )

    expect(document.querySelectorAll('.clr-card')).toHaveLength(1)
    expect(document.querySelectorAll('.clr-card__bar')).toHaveLength(1)
    expect(document.querySelectorAll('.clr-bleed')).toHaveLength(1)

    const inner = screen.getByTestId('inner')
    expect(cardOf('outer').body).toContainElement(inner)
    expect(inner).toHaveClass('warm-up')
    expect(inner.className).not.toMatch(/clr-chamfer|clr-card/)
    expect(inner).toHaveTextContent('Five minutes easy')
    expect(screen.getByRole('heading', { name: 'Warm-up' })).toHaveClass('label')
  })

  it('a sub-group heads one level deeper under a rule, without a frame', () => {
    renderWithProviders(
      <HeadingLevelProvider level={2}>
        <Card heading="Session">
          <HeadingSection>
            <Card heading="Main work" data-testid="group">
              Three rounds
            </Card>
          </HeadingSection>
        </Card>
      </HeadingLevelProvider>,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Session' })).toBeInTheDocument()
    const heading = screen.getByRole('heading', { level: 3, name: 'Main work' })
    const group = screen.getByTestId('group')
    expect(group).toContainElement(heading)
    expect(group.className).not.toMatch(/clr-chamfer|clr-card/)
    expect(heading.parentElement?.style.borderBottom).toContain('var(--border-region-rule)')
    expect(document.querySelectorAll('.clr-card')).toHaveLength(1)
  })
})

describe('CardActions', () => {
  it('uses the responsive action-row pattern', () => {
    renderWithProviders(
      <CardActions data-testid="actions">
        <button type="button">Back</button>
        <button type="submit">Continue</button>
      </CardActions>,
    )

    expect(screen.getByTestId('actions')).toHaveClass('clr-actions')
    expect(screen.getByTestId('actions')).not.toHaveClass('clr-row')
  })
})
