/**
 * DS-04a acceptance: the Card wrapper composes the export's `.clr-card` CSS
 * (closed body + optional accent bar), selects bar width by class — never a
 * hardcoded width — spreads native attributes, and imposes no heading level.
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../test/render'
import { Card, CardActions } from './card'

describe('Card composition', () => {
  it('renders a closed chamfered body, with children inside it', () => {
    renderWithProviders(<Card data-testid="card">Session summary</Card>)

    const card = screen.getByTestId('card')
    expect(card).toHaveClass('clr-card')

    const [body] = Array.from(card.children)
    expect(body).toHaveClass('clr-card__body')
    expect(body).toHaveClass('clr-chamfer', 'clr-chamfer--md')
    expect(body).not.toHaveClass('clr-chamfer--open-left')
    expect(body).toHaveTextContent('Session summary')
    expect(card.querySelector('.clr-card__bar')).toBeNull()
  })

  it('the bar is decorative — hidden from assistive tech and empty', () => {
    renderWithProviders(<Card data-testid="card" barWidth="md">Content</Card>)

    const bar = screen.getByTestId('card').firstElementChild
    expect(bar).toHaveAttribute('aria-hidden', 'true')
    expect(bar).toBeEmptyDOMElement()
  })
})

describe('Card barWidth', () => {
  it('omits the optional accent by default', () => {
    renderWithProviders(<Card data-testid="card">Content</Card>)

    expect(screen.getByTestId('card').querySelector('.clr-card__bar')).toBeNull()
  })

  it('barWidth="md" selects the supported 8px variant without an inline width', () => {
    renderWithProviders(<Card data-testid="card" barWidth="md">Content</Card>)

    const bar = screen.getByTestId('card').firstElementChild as HTMLElement
    expect(bar).toHaveClass('clr-card__bar')
    expect(bar).not.toHaveClass('clr-card__bar--lg')
    expect(bar.getAttribute('style')).toBeNull()
  })

  it('barWidth="lg" selects the 12px variant via the --lg modifier class', () => {
    renderWithProviders(
      <Card data-testid="card" barWidth="lg">
        Content
      </Card>,
    )

    const bar = screen.getByTestId('card').firstElementChild as HTMLElement
    expect(bar).toHaveClass('clr-card__bar', 'clr-card__bar--lg')
    // The token owns the width; the component never hardcodes one.
    expect(bar.getAttribute('style')).toBeNull()
  })
})

describe('Card native attributes', () => {
  it('merges className with clr-card and spreads native attributes on the root', async () => {
    const onClick = vi.fn()
    renderWithProviders(
      <Card
        data-testid="card"
        className="history-card"
        id="session-1"
        onClick={onClick}
      >
        Content
      </Card>,
    )

    const card = screen.getByTestId('card')
    expect(card).toHaveClass('clr-card', 'history-card')
    expect(card).toHaveAttribute('id', 'session-1')
    await userEvent.click(card)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('CardActions', () => {
  it('uses the 0.9.7 responsive action-row pattern', () => {
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

describe('Card heading neutrality (CORE-05)', () => {
  it('renders no heading of its own', () => {
    renderWithProviders(<Card>Just text</Card>)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('renders whatever heading level the screen chooses', () => {
    renderWithProviders(
      <Card>
        <h4>Pull Day</h4>
      </Card>,
    )
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent(
      'Pull Day',
    )
  })
})
