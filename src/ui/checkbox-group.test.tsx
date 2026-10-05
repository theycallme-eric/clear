import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  AppHeader,
  ArrowLeft,
  Button,
  Checkbox,
  ChoiceGroup,
  IconButton,
  Progress,
  RadioButton,
  TextAction,
} from '../design-system/index'
import { CheckboxGroup } from './checkbox-group'

const foundation = readFileSync(
  resolve(import.meta.dirname, '../design-system/css/foundation.css'),
  'utf-8',
)

describe('CheckboxGroup', () => {
  it('keeps native group semantics without drawing a second frame', () => {
    render(
      <CheckboxGroup legend="Equipment">
        <Checkbox label="Dumbbells" checked={false} onChange={() => undefined} />
      </CheckboxGroup>,
    )

    const group = screen.getByRole('group', { name: 'Equipment' })
    expect(group.tagName).toBe('FIELDSET')
    expect(group.style.border).toBe('0px')
    expect(group.style.margin).toBe('0px')
    expect(group.style.padding).toBe('0px')
    expect(screen.getByRole('checkbox', { name: 'Dumbbells' })).toBeInTheDocument()
  })

  it('labels the group above its options and passes fieldset attributes through', () => {
    render(
      <CheckboxGroup legend="Equipment" disabled aria-describedby="hint" className="extra">
        <Checkbox label="Dumbbells" />
      </CheckboxGroup>,
    )

    const group = screen.getByRole('group', { name: 'Equipment' })
    expect(group.firstElementChild?.tagName).toBe('LEGEND')
    expect(group.firstElementChild).toHaveClass('label')
    expect(group).toHaveClass('clr-stack', 'clr-stack--tight', 'extra')
    expect(group).toHaveAttribute('aria-describedby', 'hint')
    expect(screen.getByRole('checkbox', { name: 'Dumbbells' })).toBeDisabled()
  })

  it('is a multiple choice: every option toggles on its own', async () => {
    const user = userEvent.setup()
    function Equipment() {
      const [owned, setOwned] = useState<string[]>([])
      const toggle = (item: string) => (on: boolean) =>
        setOwned((prev) => (on ? [...prev, item] : prev.filter((entry) => entry !== item)))
      return (
        <CheckboxGroup legend="Equipment">
          {['Dumbbells', 'Kettlebell'].map((item) => (
            <Checkbox key={item} label={item} checked={owned.includes(item)} onChange={toggle(item)} />
          ))}
        </CheckboxGroup>
      )
    }
    render(<Equipment />)

    await user.click(screen.getByRole('checkbox', { name: 'Dumbbells' }))
    await user.click(screen.getByRole('checkbox', { name: 'Kettlebell' }))

    expect(screen.getByRole('checkbox', { name: 'Dumbbells' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Kettlebell' })).toBeChecked()
  })
})

/**
 * The selectors, progress and header the app composes are the public 0.14.3
 * ones. These pin the parts of their contract the shared scaffolding relies
 * on, through the public entry only.
 */
describe('selector, progress and header integration through the public API', () => {
  it('checkbox and radio draw the public solid-square mark, not a local glyph', () => {
    render(
      <>
        <Checkbox label="Dumbbells" defaultChecked />
        <RadioButton label="Gym" name="place" value="gym" defaultChecked />
      </>,
    )

    for (const control of [screen.getByRole('checkbox'), screen.getByRole('radio')]) {
      const box = control.nextElementSibling
      expect(box).toHaveClass('clr-check__box')
      expect(box).toHaveAttribute('aria-hidden', 'true')
      expect(box?.querySelector('svg')).toBeNull()
    }
    // The radio's mark is the same square block, never a round dot.
    expect(foundation).not.toMatch(/\.clr-check--radio[^{]*\{[^}]*border-radius:\s*(50%|999)/)
  })

  it('a single choice is a radiogroup and a multiple choice is a group of toggles', async () => {
    const user = userEvent.setup()
    const onSingle = vi.fn()
    const onMultiple = vi.fn()
    render(
      <>
        <ChoiceGroup legend="Goal" options={['Strength', 'Power']} value="Strength" onChange={onSingle} />
        <ChoiceGroup
          legend="Days"
          multiple
          options={['Mon', 'Wed']}
          value={['Mon']}
          onChange={onMultiple}
        />
      </>,
    )

    const single = within(screen.getByRole('group', { name: 'Goal' }))
    expect(single.getByRole('radiogroup')).toBeInTheDocument()
    expect(single.getByRole('radio', { name: 'Strength' })).toBeChecked()
    await user.click(single.getByRole('radio', { name: 'Power' }))
    expect(onSingle).toHaveBeenCalledWith('Power')

    const multiple = within(screen.getByRole('group', { name: 'Days' }))
    expect(multiple.queryByRole('radiogroup')).toBeNull()
    expect(multiple.getByRole('button', { name: 'Mon' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(multiple.getByRole('button', { name: 'Wed' }))
    expect(onMultiple).toHaveBeenCalledWith(['Mon', 'Wed'])
  })

  it('each choice is a chip: selected carries a tick, unselected stays centred', () => {
    render(<ChoiceGroup legend="Goal" options={['Strength', 'Power']} value="Strength" />)

    const on = screen.getByRole('radio', { name: 'Strength' })
    const off = screen.getByRole('radio', { name: 'Power' })
    expect(on).toHaveClass('clr-chip', 'clr-chamfer--sm', 'clr-chamfer--selected')
    expect(off).toHaveClass('clr-chip')
    expect(off).not.toHaveClass('clr-chamfer--selected')

    const tick = (chip: HTMLElement) => chip.querySelector('svg') as SVGElement
    expect(tick(on).style.opacity).toBe('1')
    expect(tick(off).style.opacity).toBe('0')
    // The collapsed tick cancels its own gap, so the label sits centred.
    expect(tick(off).style.marginRight).toBe('calc(var(--spacing-200) * -1)')
  })

  it('progress lights discrete segments, never a continuous fill', () => {
    render(<Progress label="Session" value={50} />)

    const bar = screen.getByRole('progressbar', { name: 'Session' })
    expect(bar).toHaveAttribute('aria-valuenow', '50')
    const segments = Array.from(bar.children) as HTMLElement[]
    expect(segments).toHaveLength(20)
    const lit = segments.filter((segment) => segment.style.background === 'var(--surface-thumb)')
    expect(lit).toHaveLength(10)
    segments.forEach((segment) => expect(segment.style.width).toBe(''))
  })

  it('a header with a left slot centres its title and keeps the framed 40px icon target', () => {
    render(
      <AppHeader left={<IconButton label="Back" icon={<ArrowLeft />} />}>
        <h1>Session</h1>
      </AppHeader>,
    )

    const header = screen.getByRole('banner')
    expect(header.style.display).toBe('grid')
    // Equal outer tracks, each at least one control wide, centre the middle one.
    expect(header.style.gridTemplateColumns).toBe(
      'minmax(var(--control-height), auto) minmax(0, 1fr) minmax(var(--control-height), auto)',
    )
    const title = screen.getByRole('heading', { name: 'Session' }).parentElement as HTMLElement
    expect(title.style.justifyContent).toBe('center')

    const back = screen.getByRole('button', { name: 'Back' })
    expect(header.firstElementChild).toContainElement(back)
    expect(back).toHaveClass('clr-chamfer', 'clr-btn', 'clr-hit')
    expect(back.parentElement).toHaveClass('clr-bleed')
  })
})

describe('framed actions keep their hierarchy beside the quiet action', () => {
  it('primary, destructive and icon-only stay framed; only the quiet action is frameless', () => {
    render(
      <>
        <Button variant="primary">Start</Button>
        <Button variant="critical">Delete place</Button>
        <IconButton label="Back" icon={<ArrowLeft />} />
        <TextAction onClick={() => undefined}>Skip for now</TextAction>
        <TextAction href="/history">View history</TextAction>
      </>,
    )

    const primary = screen.getByRole('button', { name: 'Start' })
    const critical = screen.getByRole('button', { name: 'Delete place' })
    const icon = screen.getByRole('button', { name: 'Back' })
    expect(primary).toHaveClass('clr-chamfer', 'clr-btn', 'clr-btn--primary')
    expect(critical).toHaveClass('clr-chamfer', 'clr-btn', 'clr-btn--critical')
    for (const framed of [primary, critical, icon]) {
      expect(framed.parentElement).toHaveClass('clr-bleed')
      expect(framed).not.toHaveClass('clr-text-action')
    }
    // Only the primary glows; the destructive action is never dressed as one.
    expect(primary.parentElement).toHaveClass('clr-glow')
    expect(critical.parentElement).not.toHaveClass('clr-glow')

    const skip = screen.getByRole('button', { name: 'Skip for now' })
    const view = screen.getByRole('link', { name: 'View history' })
    for (const quiet of [skip, view]) {
      expect(quiet).toHaveClass('clr-text-action')
      expect(quiet).not.toHaveClass('clr-chamfer')
      expect(quiet).not.toHaveClass('clr-btn')
      expect(quiet.parentElement).not.toHaveClass('clr-bleed')
    }
    expect(skip).toHaveAttribute('type', 'button')
    expect(view).toHaveAttribute('href', '/history')
  })
})
