/**
 * EXE-01 — the one effort capture, and the summary it shows above the scale.
 *
 * The dialog is structure-agnostic by design: it names what was finished and
 * echoes whatever fields the renderer observed, so an EMOM and an AMRAP are
 * answered through the same control rather than through six of them.
 */
import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../test/render'
import { snapshotFixture } from '../test/workout-double'
import { sessionProgress } from '../state/workout-progress'
import {
  BlockEffortDialog,
  DEFAULT_PERCEIVED_EFFORT,
  effortValueText,
  outcomeSummary,
} from './block-effort'

function identityOf(structureType: 'emom' | 'amrap', timerSeconds: number) {
  return sessionProgress(
    snapshotFixture({ sections: [{ blocks: [{ structureType, timerSeconds }] }] }),
  ).sections[0].blocks[0].identity
}

describe('effortValueText', () => {
  it('speaks an anchor word, because "7" on its own is a number', () => {
    expect(effortValueText(1)).toBe('1 of 10, very easy')
    expect(effortValueText(DEFAULT_PERCEIVED_EFFORT)).toBe('5 of 10, moderate')
    expect(effortValueText(10)).toBe('10 of 10, maximal')
  })
})

describe('outcomeSummary', () => {
  it('says nothing about fields the structure did not observe', () => {
    expect(outcomeSummary({ minutesCompleted: 10 })).toBe('Recorded: 10 minutes.')
    expect(outcomeSummary({ roundsCompleted: 6, partialRoundReps: 4 })).toBe(
      'Recorded: 6 rounds · +4 reps.',
    )
    expect(outcomeSummary({ elapsedSeconds: 412, completedUnderCap: false })).toBe(
      'Recorded: 412 seconds · cap reached.',
    )
    expect(outcomeSummary({ highestRung: 5 })).toBe('Recorded: rung 5.')
  })

  it('asks the plain question when there is nothing to echo', () => {
    expect(outcomeSummary(null)).toBe('Rate the effort of the block you just finished.')
    expect(outcomeSummary({})).toBe('Rate the effort of the block you just finished.')
  })

  it('keeps a zero, which is an observation rather than an absence', () => {
    expect(outcomeSummary({ roundsCompleted: 0 })).toBe('Recorded: 0 rounds.')
  })
})

describe('BlockEffortDialog', () => {
  it('names what was finished and answers with one gesture', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    renderWithProviders(
      <BlockEffortDialog
        open
        identity={identityOf('emom', 600)}
        outcome={{ minutesCompleted: 10 }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    const dialog = screen.getByRole('heading', { name: 'EMOM complete' }).closest('dialog')
    expect(dialog).not.toBeNull()
    expect(within(dialog as HTMLElement).getByText('Recorded: 10 minutes.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Record effort' }))

    expect(onConfirm).toHaveBeenCalledWith(DEFAULT_PERCEIVED_EFFORT)
  })

  it('serves a different structure with the same control', () => {
    renderWithProviders(
      <BlockEffortDialog
        open
        identity={identityOf('amrap', 480)}
        outcome={{ roundsCompleted: 6 }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'AMRAP complete' })).toBeInTheDocument()
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '5 of 10, moderate')
  })

  it('asks the question without a subject when it has none', () => {
    renderWithProviders(
      <BlockEffortDialog
        open
        identity={null}
        outcome={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'How hard was that?' })).toBeInTheDocument()
  })

  it('leaves the block unrecorded when the question is declined', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    renderWithProviders(
      <BlockEffortDialog
        open
        identity={identityOf('emom', 600)}
        outcome={{}}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Not now' }))

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('stops taking answers while the row is being written', () => {
    renderWithProviders(
      <BlockEffortDialog
        open
        saving
        identity={identityOf('emom', 600)}
        outcome={{}}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Not now' })).toBeDisabled()
  })

  it('takes no second answer while the row is being written', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    renderWithProviders(
      <BlockEffortDialog
        open
        saving
        identity={identityOf('emom', 600)}
        outcome={{}}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    const record = screen.getByRole('button', { name: 'Record effort' })
    expect(record).toBeDisabled()
    expect(record).toHaveAttribute('aria-busy', 'true')
    await user.click(record)

    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('records the effort the slider was moved to, once', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    renderWithProviders(
      <BlockEffortDialog
        open
        identity={identityOf('amrap', 480)}
        outcome={{ roundsCompleted: 6 }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    const slider = screen.getByRole('slider')
    expect(slider).toHaveFocus()
    // jsdom does not step a range from the keyboard; the change is the input's.
    fireEvent.change(slider, { target: { value: '7' } })
    expect(slider).toHaveAttribute('aria-valuetext', '7 of 10, hard')
    await user.click(screen.getByRole('button', { name: 'Record effort' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith(7)
  })

  it('asks each block afresh rather than pre-answering with the last one', () => {
    const props = {
      identity: identityOf('emom', 600),
      outcome: {},
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    }
    const { rerender } = renderWithProviders(<BlockEffortDialog open {...props} />)

    fireEvent.change(screen.getByRole('slider'), { target: { value: '10' } })
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '10 of 10, maximal')

    rerender(<BlockEffortDialog open={false} {...props} />)
    rerender(<BlockEffortDialog open {...props} />)

    expect(screen.getByRole('slider', { hidden: true })).toHaveAttribute(
      'aria-valuetext',
      '5 of 10, moderate',
    )
  })

  it('puts the safe action first and makes exactly one action primary', () => {
    renderWithProviders(
      <BlockEffortDialog
        open
        identity={identityOf('emom', 600)}
        outcome={{}}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const dialog = screen.getByRole('heading', { name: 'EMOM complete' }).closest('dialog')
    const actions = within(dialog as HTMLElement).getAllByRole('button')
    expect(actions.map((action) => action.textContent)).toEqual(['Not now', 'Record effort'])
    expect(actions[0]).not.toHaveClass('clr-btn--primary')
    expect(actions[1]).toHaveClass('clr-btn--primary')
  })

  it('groups the summary, the score readout and the one field without a card', () => {
    renderWithProviders(
      <BlockEffortDialog
        open
        identity={identityOf('amrap', 480)}
        outcome={{ roundsCompleted: 2 }}
        score={{
          format: 'amrap',
          unit: 'reps_per_minute',
          value: 6,
          label: '6 reps/min',
          completedUnderCap: null,
        }}
        absence="first_attempt"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const dialog = screen.getByRole('heading', { name: 'AMRAP complete' }).closest('dialog')
    const summary = within(dialog as HTMLElement).getByText('Recorded: 2 rounds.')
    const group = summary.parentElement as HTMLElement
    expect(group).toHaveClass('clr-stack')
    expect(group).not.toHaveClass('clr-stack--tight')

    // One element frame for the score, holding the score and its context.
    const readouts = group.querySelectorAll('.clr-metric-frame')
    expect(readouts).toHaveLength(1)
    expect(readouts[0]).toHaveClass('clr-chamfer')
    expect(readouts[0]).toHaveTextContent('Score: 6 reps/min')
    expect(readouts[0]).toHaveTextContent('First attempt at this piece')
    expect(group).toContainElement(screen.getByRole('slider'))
    expect((dialog as HTMLElement).querySelector('.clr-card')).toBeNull()
  })

  it('draws no score readout for a block that is not scored', () => {
    renderWithProviders(
      <BlockEffortDialog
        open
        identity={identityOf('emom', 600)}
        outcome={{ minutesCompleted: 10 }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const dialog = screen.getByRole('heading', { name: 'EMOM complete' }).closest('dialog')
    expect((dialog as HTMLElement).querySelector('.clr-metric-frame')).toBeNull()
  })
})
