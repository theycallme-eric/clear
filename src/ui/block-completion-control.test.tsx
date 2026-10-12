/**
 * EXE-01's completion control — the one button every structure completes
 * through, asserted on its own rather than through a renderer.
 *
 * What is pinned is the contract a renderer inherits by composing it: the
 * shell's seam is called with the block and exactly the outcome handed in, a
 * recorded block says so and offers no second completion, and the control is a
 * current button with no frame of its own — so the card it sits in stays the
 * only card.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  BlockCompletionContext,
  type BlockCompletionApi,
  type BlockOutcome,
} from '../state/block-completion'
import { BlockCompletionControl } from './block-completion-control'
import { Card } from './card'

const BLOCK_ID = '70000001-0000-4000-8000-000000000000'

/** The shell's half of the seam, as a spy. */
function completionDouble(recorded: readonly string[] = []) {
  const completeBlock = vi.fn<(blockId: string, outcome: BlockOutcome) => void>()
  const api: BlockCompletionApi = {
    completeBlock,
    isBlockRecorded: (blockId) => recorded.includes(blockId),
  }
  return { api, completeBlock }
}

function mount(ui: ReactElement, api: BlockCompletionApi) {
  return render(<BlockCompletionContext value={api}>{ui}</BlockCompletionContext>)
}

describe('completing a block through the shell', () => {
  it('hands the shell the block and the empty outcome of a structure that observed nothing', async () => {
    const user = userEvent.setup()
    const { api, completeBlock } = completionDouble()
    mount(<BlockCompletionControl blockId={BLOCK_ID} outcome={{}} />, api)

    await user.click(screen.getByRole('button', { name: 'Complete block' }))

    expect(completeBlock).toHaveBeenCalledExactlyOnceWith(BLOCK_ID, {})
  })

  it('hands on the outcome a structure did observe, under that structure’s verb', async () => {
    const user = userEvent.setup()
    const { api, completeBlock } = completionDouble()
    const outcome: BlockOutcome = { roundsCompleted: 3 }
    mount(
      <BlockCompletionControl blockId={BLOCK_ID} outcome={outcome} label="Complete circuit" />,
      api,
    )

    expect(screen.queryByRole('button', { name: 'Complete block' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Complete circuit' }))

    expect(completeBlock).toHaveBeenCalledExactlyOnceWith(BLOCK_ID, outcome)
  })

  it('says a recorded block is recorded, and offers no second completion', async () => {
    const user = userEvent.setup()
    const { api, completeBlock } = completionDouble([BLOCK_ID])
    mount(
      <BlockCompletionControl blockId={BLOCK_ID} outcome={{}} label="Complete circuit" />,
      api,
    )

    // The words change with the state: disabled is never the only cue.
    const recorded = screen.getByRole('button', { name: 'Block recorded' })
    expect(recorded).toBeDisabled()
    await user.click(recorded)

    expect(completeBlock).not.toHaveBeenCalled()
  })

  it('reads the recorded state for its own block only', () => {
    const { api } = completionDouble(['70000002-0000-4000-8000-000000000000'])
    mount(<BlockCompletionControl blockId={BLOCK_ID} outcome={{}} />, api)

    expect(screen.getByRole('button', { name: 'Complete block' })).toBeEnabled()
  })
})

describe('the control’s frame', () => {
  it('is one current secondary button and no card of its own', () => {
    const { api } = completionDouble()
    const { container } = mount(<BlockCompletionControl blockId={BLOCK_ID} outcome={{}} />, api)

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveClass('clr-btn', 'clr-chamfer--lg')
    // Secondary: the block's primary action is logging the next set, not this.
    expect(buttons[0]).not.toHaveClass('clr-btn--primary')
    expect(container.querySelector('.clr-card')).toBeNull()
  })

  it('leaves the block’s card the only card it is drawn in', () => {
    const { api } = completionDouble()
    const { container } = mount(
      <Card>
        <BlockCompletionControl blockId={BLOCK_ID} outcome={{}} />
      </Card>,
      api,
    )

    expect(container.querySelectorAll('.clr-card')).toHaveLength(1)
    expect(container.querySelector('.clr-card .clr-card')).toBeNull()
  })
})
