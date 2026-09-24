/**
 * EXE-01 — the one effort capture, and the summary it shows above the scale.
 *
 * The dialog is structure-agnostic by design: it names what was finished and
 * echoes whatever fields the renderer observed, so an EMOM and an AMRAP are
 * answered through the same control rather than through six of them.
 */
import { screen, within } from '@testing-library/react'
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
})
