/**
 * EXE-01 — the registry that decides which renderer performs a block.
 *
 * Two things are asserted, and they are the two halves of "every structure
 * completes through one shell-owned path": the map is total over
 * `structure_type`, so no structure can be rendered by nothing; and whatever is
 * in it completes through `useBlockCompletion`, so no structure can be recorded
 * by a renderer's own write.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Constants, type Enums } from '../data/database.types'
import {
  BlockCompletionContext,
  type BlockCompletionApi,
  type BlockOutcome,
} from '../state/block-completion'
import type { BlockProgress } from '../state/workout-progress'
import { BLOCK_RENDERERS, BlockSlot, blockRendererFor } from './block-renderers'

function blockFixture(
  structureType: Enums<'structure_type'>,
  overrides: Partial<BlockProgress> = {},
): BlockProgress {
  return {
    blockId: `7000000${Constants.public.Enums.structure_type.indexOf(structureType) + 1}-0000-4000-8000-000000000000`,
    structureType,
    identity: {
      label: structureType.toUpperCase(),
      detail: null,
      repScheme: null,
      glyph: 'Stopwatch',
    },
    status: 'not_started',
    exerciseCount: 2,
    // The registry's own assertions are about dispatch and completion, which
    // are true of a block whose prescriptions this test does not describe.
    // What a renderer does with them is `standard-block.test.tsx`'s.
    exercises: [],
    rounds: null,
    roundRestSeconds: null,
    ...overrides,
  }
}

/**
 * The verb a structure completes with, where it is not "Complete block".
 * EXE-03's circuit says what it is finishing; what it *supplies* when it has
 * movements to count is `circuit-block.test.tsx`'s subject.
 */
const COMPLETION_LABELS: Partial<Record<Enums<'structure_type'>, string>> = {
  circuit: 'Complete circuit',
}

/** The shell's half of the seam, as a spy. */
function completionDouble(recorded: readonly string[] = []) {
  const completeBlock = vi.fn<(blockId: string, outcome: BlockOutcome) => void>()
  const api: BlockCompletionApi = {
    completeBlock,
    isBlockRecorded: (blockId) => recorded.includes(blockId),
  }
  return { api, completeBlock }
}

function renderSlot(block: BlockProgress, api: BlockCompletionApi) {
  render(
    <BlockCompletionContext value={api}>
      <BlockSlot block={block} />
    </BlockCompletionContext>,
  )
}

describe('the renderer registry', () => {
  it('has an entry for every structure type the database admits', () => {
    expect(Object.keys(BLOCK_RENDERERS).sort()).toEqual(
      [...Constants.public.Enums.structure_type].sort(),
    )
  })

  it('dispatches a block to the renderer for its structure', () => {
    for (const structureType of Constants.public.Enums.structure_type) {
      expect(blockRendererFor(structureType)).toBe(BLOCK_RENDERERS[structureType])
    }
  })

  it.each([...Constants.public.Enums.structure_type])(
    'completes a %s block through the shell, with no outcome it did not observe',
    async (structureType) => {
      const user = userEvent.setup()
      const block = blockFixture(structureType)
      const { api, completeBlock } = completionDouble()
      renderSlot(block, api)

      const label = COMPLETION_LABELS[structureType] ?? 'Complete block'
      await user.click(screen.getByRole('button', { name: label }))

      // The shell's seam, with the empty outcome of a panel that runs no clock
      // — an unobserved zero would be a measurement (DATA_MODEL §8).
      expect(completeBlock).toHaveBeenCalledExactlyOnceWith(block.blockId, {})
    },
  )

  it('says a recorded block is recorded, and offers no second completion', () => {
    const block = blockFixture('emom')
    const { api } = completionDouble([block.blockId])
    renderSlot(block, api)

    expect(screen.getByRole('button', { name: 'Block recorded' })).toBeDisabled()
  })

  it('states the structure identity and the size of the block', () => {
    renderSlot(blockFixture('amrap', { exerciseCount: 1 }), completionDouble().api)

    expect(screen.getByText('AMRAP')).toBeInTheDocument()
    expect(screen.getByText('1 movement')).toBeInTheDocument()
  })
})
