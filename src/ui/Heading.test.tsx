import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Heading, HeadingLevelProvider, HeadingSection } from './Heading'

describe('Heading (CORE-05)', () => {
  it('renders at the level supplied by context', () => {
    render(
      <HeadingLevelProvider level={3}>
        <Heading>Pinned</Heading>
      </HeadingLevelProvider>,
    )

    expect(
      screen.getByRole('heading', { level: 3, name: 'Pinned' }),
    ).toBeInTheDocument()
  })

  it('increments by exactly one per section so no level can be skipped', () => {
    render(
      <HeadingLevelProvider level={2}>
        <Heading>Outer</Heading>
        <HeadingSection>
          <Heading>Inner</Heading>
        </HeadingSection>
      </HeadingLevelProvider>,
    )

    expect(
      screen.getByRole('heading', { level: 2, name: 'Outer' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 3, name: 'Inner' }),
    ).toBeInTheDocument()
  })

  it('renders a real section element around nested content', () => {
    const { container } = render(
      <HeadingSection aria-label="Details">
        <Heading>Nested</Heading>
      </HeadingSection>,
    )

    const section = container.querySelector('section')
    expect(section).not.toBeNull()
    expect(section).toContainElement(screen.getByRole('heading'))
  })

  it('never renders past h6 no matter how deep the nesting', () => {
    render(
      <HeadingLevelProvider level={6}>
        <HeadingSection>
          <HeadingSection>
            <Heading>Deep</Heading>
          </HeadingSection>
        </HeadingSection>
      </HeadingLevelProvider>,
    )

    expect(
      screen.getByRole('heading', { level: 6, name: 'Deep' }),
    ).toBeInTheDocument()
  })
})
