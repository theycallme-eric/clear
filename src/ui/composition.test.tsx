import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ScanLoader, TimerDisplay } from '../design-system/index'
import { renderWithProviders } from '../test/render'
import { Card } from './card'
import {
  ActionRow,
  ListFrame,
  ListMessage,
  ListRow,
  MetricFrame,
  MetricGrid,
  PhoneFooter,
  TabBand,
} from './composition'

describe('composition wrappers', () => {
  it('exposes the responsive action-row vocabulary without changing its children', () => {
    renderWithProviders(
      <ActionRow data-testid="actions">
        <button type="button">Back</button>
        <button type="submit">Continue</button>
      </ActionRow>,
    )

    expect(screen.getByTestId('actions')).toHaveClass('clr-actions')
    expect(screen.getByRole('button', { name: 'Back' })).toHaveAttribute('type', 'button')
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveAttribute('type', 'submit')
  })

  it('composes one closed list frame with system rows and preserves list semantics', () => {
    renderWithProviders(
      <ListFrame as="ul" aria-label="Sessions" data-testid="list">
        <ListRow as="li">Monday</ListRow>
        <ListRow as="li">Wednesday</ListRow>
      </ListFrame>,
    )

    const list = screen.getByRole('list', { name: 'Sessions' })
    expect(list).toHaveClass('clr-list', 'clr-chamfer', 'clr-chamfer--md')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getAllByRole('listitem')[0]).toHaveClass('clr-list__row')
  })

  it('exposes the full-width band and pinned footer without imposing content roles', () => {
    renderWithProviders(
      <>
        <TabBand data-testid="band">Tabs</TabBand>
        <PhoneFooter aria-label="Screen actions">Save</PhoneFooter>
      </>,
    )

    expect(screen.getByTestId('band')).toHaveClass('clr-band')
    expect(screen.getByRole('contentinfo', { name: 'Screen actions' })).toHaveClass('clr-footer')
  })

  it('composes compact facts as individual element frames in one responsive grid', () => {
    renderWithProviders(
      <MetricGrid as="dl" aria-label="Workout facts" data-testid="metrics">
        <MetricFrame>
          <dt>Goal</dt>
          <dd>Strength</dd>
        </MetricFrame>
        <MetricFrame>
          <dt>Duration</dt>
          <dd>45 min</dd>
        </MetricFrame>
      </MetricGrid>,
    )

    expect(screen.getByTestId('metrics')).toHaveClass('clr-metric-grid')
    expect(screen.getByText('Goal').closest('.clr-metric-frame')).toHaveClass(
      'clr-chamfer',
      'clr-chamfer--sm',
    )
  })

  it('merges caller classes and native attributes on the selected element', () => {
    renderWithProviders(
      <TabBand as="nav" className="history-tabs" aria-label="History views">
        Recent
      </TabBand>,
    )

    expect(screen.getByRole('navigation', { name: 'History views' })).toHaveClass(
      'clr-band',
      'history-tabs',
    )
  })
})

describe('containment inside a card', () => {
  it('a list in a card is rows under the card frame, not a second frame', () => {
    renderWithProviders(
      <Card data-testid="card" heading="Favorites">
        <ListFrame as="ul" aria-label="Favorites" className="fav-list">
          <ListRow as="li">Lower · Posterior</ListRow>
          <ListRow as="li">Push · Horizontal</ListRow>
        </ListFrame>
      </Card>,
    )

    const list = screen.getByRole('list', { name: 'Favorites' })
    expect(list).toHaveClass('clr-list', 'fav-list')
    expect(list.className).not.toMatch(/clr-chamfer/)
    expect(screen.getAllByRole('listitem')[1]).toHaveClass('clr-list__row')
    expect(screen.getByTestId('card').querySelectorAll('.clr-chamfer')).toHaveLength(0)
    expect(document.querySelectorAll('.clr-card')).toHaveLength(1)
  })

  it('metrics in a card are unframed readouts in the same grid', () => {
    renderWithProviders(
      <Card data-testid="card" heading="Workout facts">
        <MetricGrid as="dl">
          <MetricFrame>
            <dt>Goal</dt>
            <dd>Strength</dd>
          </MetricFrame>
        </MetricGrid>
      </Card>,
    )

    const metric = screen.getByText('Goal').closest('.clr-metric-frame') as HTMLElement
    expect(metric.parentElement).toHaveClass('clr-metric-grid')
    expect(metric.className).not.toMatch(/clr-chamfer/)
    expect(screen.getByTestId('card').querySelectorAll('.clr-chamfer')).toHaveLength(0)
  })

  it('empty copy in a card is plain text, never a card or frame of its own', () => {
    renderWithProviders(
      <Card data-testid="card" heading="Favorites">
        <ListMessage title="No favorites yet" message="Save one from a workout." />
      </Card>,
    )

    const card = screen.getByTestId('card')
    expect(card).toHaveTextContent('No favorites yet')
    expect(screen.getByText('Save one from a workout.')).toBeInTheDocument()
    expect(card.querySelectorAll('.clr-card, .clr-chamfer, .clr-bleed')).toHaveLength(0)
    expect(document.querySelectorAll('.clr-card__bar')).toHaveLength(1)
  })

  it('every adapter nested together still yields exactly one card', () => {
    renderWithProviders(
      <Card heading="Summary">
        <Card heading="Results">
          <MetricGrid>
            <MetricFrame>Duration</MetricFrame>
          </MetricGrid>
        </Card>
        <ListFrame>
          <ListRow>
            <ListMessage title="Nothing logged" />
          </ListRow>
        </ListFrame>
      </Card>,
    )

    expect(document.querySelectorAll('.clr-card')).toHaveLength(1)
    expect(document.querySelectorAll('.clr-card__bar')).toHaveLength(1)
    expect(document.querySelectorAll('.clr-chamfer')).toHaveLength(1)
  })
})

describe('standalone states are the public self-carded components', () => {
  it('standalone empty copy is the public EmptyState card, with no wrapper frame', () => {
    renderWithProviders(
      <div data-testid="host">
        <ListMessage title="No workouts yet" message="Generate one first." />
      </div>,
    )

    const host = screen.getByTestId('host')
    expect(screen.getByText('No workouts yet')).toBeInTheDocument()
    expect(screen.getByText('Generate one first.')).toBeInTheDocument()
    expect(host.querySelectorAll('.clr-card')).toHaveLength(1)
    expect(host.querySelectorAll('.clr-card__bar')).toHaveLength(1)
    expect(host.querySelectorAll('.clr-chamfer')).toHaveLength(1)
    expect(host.querySelector('.clr-list')).toBeNull()
  })

  it('list and metric wrappers add no card around a timer or loader', () => {
    renderWithProviders(
      <div data-testid="host">
        <ListFrame>
          <ListRow>
            <TimerDisplay seconds={90} />
          </ListRow>
        </ListFrame>
        <MetricGrid>
          <ScanLoader label="Reading history" />
        </MetricGrid>
      </div>,
    )

    // One card each, both supplied by the public components themselves.
    expect(screen.getByTestId('host').querySelectorAll('.clr-card')).toHaveLength(2)
    expect(screen.getByTestId('host').querySelectorAll('.clr-card__bar')).toHaveLength(2)
  })
})
