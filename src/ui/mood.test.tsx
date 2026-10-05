import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import {
  ChoiceGroup,
  Frown,
  Meh,
  Smile,
  SmilePlus,
  ThumbsDown,
} from '../design-system/index'
import { MOOD_MAX, MOOD_SCALE, moodStep, type MoodStep } from '../state/mood'
import { MOOD_ICONS, MoodReading } from './mood'

/**
 * The mood glyphs, owned once. Summary captures with them and Session Detail
 * reports with them, so what is pinned here is what both screens draw: the
 * public set's round line faces, and a selection that never rests on the face.
 */

const SOURCE = readFileSync(resolve(process.cwd(), 'src/ui/mood.tsx'), 'utf-8')

/** The four faces 0.14.3 redrew. `ThumbsDown` is the fifth step's and is not a face. */
const FACES = ['Frown', 'Meh', 'Smile', 'SmilePlus'] as const

function step(value: number): MoodStep {
  const found = moodStep(value)
  if (found === null) throw new Error(`No mood step ${value}`)
  return found
}

/** A step as the debrief's choice draws it: the face from the map, then the word. */
function ChoiceLabel({ step: scaleStep }: { step: MoodStep }) {
  const Icon = MOOD_ICONS[scaleStep.glyph]
  return (
    <span className="clr-row">
      <Icon size={20} />
      {scaleStep.label}
    </span>
  )
}

function glyphOf(container: HTMLElement): SVGElement {
  const svg = container.querySelector('svg')
  if (svg === null) throw new Error('No glyph was drawn')
  return svg
}

describe('MOOD_ICONS', () => {
  it('names the public set’s own components, not copies of them', () => {
    expect(MOOD_ICONS).toEqual({ ThumbsDown, Frown, Meh, Smile, SmilePlus })
    expect(MOOD_ICONS.Frown).toBe(Frown)
    expect(MOOD_ICONS.Meh).toBe(Meh)
    expect(MOOD_ICONS.Smile).toBe(Smile)
    expect(MOOD_ICONS.SmilePlus).toBe(SmilePlus)
    expect(MOOD_ICONS.ThumbsDown).toBe(ThumbsDown)
  })

  it('has a glyph for every step the scale names', () => {
    for (const { glyph } of MOOD_SCALE) {
      expect(MOOD_ICONS[glyph]).toBeTypeOf('function')
    }
  })

  it.each(FACES)('draws %s as a round line face', (name) => {
    const Icon = MOOD_ICONS[name]
    const { container } = render(<Icon size={20} />)
    const svg = glyphOf(container)

    // One stroked outline circle, two eyes, one stroked mouth — and no fill.
    const circles = [...svg.querySelectorAll('circle')]
    expect(circles).toHaveLength(3)
    const outline = circles.find((circle) => circle.getAttribute('fill') === 'none')
    expect(outline).toHaveAttribute('stroke', 'currentColor')
    expect(outline).toHaveAttribute('r', '9.5')

    const paths = [...svg.querySelectorAll('path')]
    expect(paths).toHaveLength(1)
    expect(paths[0]).toHaveAttribute('fill', 'none')
    expect(paths[0]).toHaveAttribute('stroke-linecap', 'round')
  })

  it('draws SmilePlus without a plus mark', () => {
    const { container } = render(<SmilePlus size={20} />)
    const svg = glyphOf(container)

    // The mouth is the only path and it is one curve: no crossing strokes.
    expect(svg.querySelectorAll('path')).toHaveLength(1)
    expect(svg.querySelector('path')?.getAttribute('d')).toBe('M7.5 13 Q12 19 16.5 13')
    expect(svg.querySelectorAll('line, rect, polygon, polyline')).toHaveLength(0)
  })

  it('draws four different faces', () => {
    const mouths = FACES.map((name) => {
      const Icon = MOOD_ICONS[name]
      const { container, unmount } = render(<Icon />)
      const d = glyphOf(container).querySelector('path')?.getAttribute('d')
      unmount()
      return d
    })

    expect(new Set(mouths).size).toBe(FACES.length)
  })

  it('keeps no glyph dialect of its own', () => {
    expect(SOURCE).not.toMatch(/<svg|<path|<circle|createElement\(\s*['"]svg/)
    // The public entry, never an internal path of the design system.
    expect(SOURCE).toMatch(/from '\.\.\/design-system\/index'/)
    expect(SOURCE).not.toMatch(/design-system\/(assets|components|_source)/)
  })
})

describe('mood capture through MOOD_ICONS', () => {
  it.each(MOOD_SCALE)('reads step $value as its face then its word', (scaleStep) => {
    const { container } = render(<ChoiceLabel step={scaleStep} />)

    expect(screen.getByText(scaleStep.label)).toBeInTheDocument()
    // The face is decoration: the word is the only accessible name.
    expect(glyphOf(container)).toHaveAttribute('aria-hidden', 'true')
    expect(glyphOf(container)).toHaveAttribute('width', '20')
  })

  it('preserves selection semantics in a choice group', async () => {
    const user = userEvent.setup()
    const changes: number[] = []

    function Capture() {
      const [mood, setMood] = useState<number | null>(null)
      return (
        <ChoiceGroup
          legend="How do you feel?"
          options={MOOD_SCALE.map((scaleStep) => ({
            value: String(scaleStep.value),
            label: <ChoiceLabel step={scaleStep} />,
          }))}
          value={mood === null ? undefined : String(mood)}
          onChange={(next) => {
            const value = Number(Array.isArray(next) ? next[0] : next)
            changes.push(value)
            setMood(value)
          }}
        />
      )
    }

    render(<Capture />)

    // Five choices, worst to best, each named by its word and none answered
    // on the user's behalf.
    const choices = screen.getAllByRole('radio')
    expect(choices.map((choice) => choice.textContent)).toEqual([
      'Spent',
      'Worn',
      'Flat',
      'Ready',
      'Peak',
    ])
    for (const scaleStep of MOOD_SCALE) {
      expect(screen.getByRole('radio', { name: scaleStep.label })).not.toBeChecked()
    }

    await user.click(screen.getByRole('radio', { name: 'Ready' }))
    expect(screen.getByRole('radio', { name: 'Ready' })).toBeChecked()

    // One mood at a time: choosing another moves the selection.
    await user.click(screen.getByRole('radio', { name: 'Peak' }))
    expect(screen.getByRole('radio', { name: 'Peak' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Ready' })).not.toBeChecked()
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1)

    // What is stored is the column's 1–5, not a glyph name.
    expect(changes).toEqual([4, 5])
  })
})

describe('MoodReading', () => {
  it.each(MOOD_SCALE)('reports step $value as face, word and number', (scaleStep) => {
    const { container } = render(<MoodReading step={scaleStep} />)

    expect(glyphOf(container)).toHaveAttribute('aria-hidden', 'true')
    expect(container).toHaveTextContent(scaleStep.label)
    expect(container).toHaveTextContent(`${scaleStep.value} of ${MOOD_MAX}`)
  })

  it('draws the same face the capture drew for that step', () => {
    const reading = render(<MoodReading step={step(5)} />)
    const mouth = glyphOf(reading.container).querySelector('path')?.getAttribute('d')
    reading.unmount()

    const choice = render(<ChoiceLabel step={step(5)} />)
    expect(glyphOf(choice.container).querySelector('path')?.getAttribute('d')).toBe(mouth)
  })

  it('says an unanswered mood was not recorded rather than drawing a face', () => {
    const { container } = render(<MoodReading step={null} />)

    expect(screen.getByText('Not recorded')).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeNull()
  })

  it('lets the screen word the unanswered case', () => {
    render(<MoodReading step={null} unansweredLabel="No mood logged" />)

    expect(screen.getByText('No mood logged')).toBeInTheDocument()
    expect(screen.queryByText('Not recorded')).toBeNull()
  })

  it('reads an out-of-range stored mood as unanswered, not as a rounded face', () => {
    const { container } = render(<MoodReading step={moodStep(9)} />)

    expect(screen.getByText('Not recorded')).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeNull()
  })
})
