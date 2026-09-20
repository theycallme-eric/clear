import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../test/render'
import { Heading, HeadingSection } from '../ui/Heading'
import { Screen } from './Screen'

describe('Screen (CORE-05)', () => {
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
