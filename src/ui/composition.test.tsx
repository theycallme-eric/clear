import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../test/render'
import {
  ActionRow,
  ListFrame,
  ListMessage,
  ListRow,
  PhoneFooter,
  TabBand,
} from './composition'

describe('0.9.7 composition wrappers', () => {
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

  it('puts factual empty copy in the same one-row list frame', () => {
    renderWithProviders(<ListMessage title="No workouts yet" message="Generate one first." />)

    const message = screen.getByText('No workouts yet')
    expect(message.closest('.clr-list')).toHaveClass('clr-list', 'clr-chamfer')
    expect(message.closest('.clr-list__row')).toBeInTheDocument()
    expect(screen.getByText('Generate one first.')).toBeInTheDocument()
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
