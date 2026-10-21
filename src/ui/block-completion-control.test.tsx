/**
 * EXE-01's completion control — the one place every structure reports what it
 * observed, asserted on its own rather than through a renderer.
 *
 * What is pinned is the contract a renderer inherits by composing it: the
 * shell's seam is told the block and exactly the outcome handed in, every time
 * it changes; the control is no action of its own (REQ-013 — the section's
 * forward action completes the block); and a saved block says so in words,
 * with no frame of its own, so the card it sits in stays the only card.
 */
import { render, screen } from '@testing-library/react'
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
  const reportOutcome = vi.fn<(blockId: string, outcome: BlockOutcome) => void>()
  const api: BlockCompletionApi = {
    reportOutcome,
    isBlockRecorded: (blockId) => recorded.includes(blockId),
  }
  return { api, reportOutcome }
}

function mount(ui: ReactElement, api: BlockCompletionApi) {
  return render(<BlockCompletionContext value={api}>{ui}</BlockCompletionContext>)
}

describe('reporting a block to the shell', () => {
  it('reports the empty outcome of a structure that observed nothing', () => {
    const { api, reportOutcome } = completionDouble()
    mount(<BlockCompletionControl blockId={BLOCK_ID} outcome={{}} />, api)

    expect(reportOutcome).toHaveBeenLastCalledWith(BLOCK_ID, {})
  })

  it('reports each new observation, so the latest is what gets saved', () => {
    const { api, reportOutcome } = completionDouble()
    const { rerender } = mount(
      <BlockCompletionControl blockId={BLOCK_ID} outcome={{ roundsCompleted: 1 }} />,
      api,
    )

    rerender(
      <BlockCompletionContext value={api}>
        <BlockCompletionControl blockId={BLOCK_ID} outcome={{ roundsCompleted: 3 }} />
      </BlockCompletionContext>,
    )

    expect(reportOutcome).toHaveBeenLastCalledWith(BLOCK_ID, { roundsCompleted: 3 })
  })

  it('offers no action of its own: completion is the section’s forward action', () => {
    const { api } = completionDouble()
    mount(<BlockCompletionControl blockId={BLOCK_ID} outcome={{ roundsCompleted: 3 }} />, api)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText('Block saved')).not.toBeInTheDocument()
  })

  it('says a saved block is saved, in words and not by colour', () => {
    const { api } = completionDouble([BLOCK_ID])
    mount(<BlockCompletionControl blockId={BLOCK_ID} outcome={{}} />, api)

    expect(screen.getByText('Block saved')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('reads the saved state for its own block only', () => {
    const { api } = completionDouble(['70000002-0000-4000-8000-000000000000'])
    mount(<BlockCompletionControl blockId={BLOCK_ID} outcome={{}} />, api)

    expect(screen.queryByText('Block saved')).not.toBeInTheDocument()
  })
})

describe('the control’s frame', () => {
  it('leaves the block’s card the only card it is drawn in', () => {
    const { api } = completionDouble([BLOCK_ID])
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
