/**
 * EXE-01 — the registry that decides which renderer performs a block.
 *
 * Two things are asserted, and they are the two halves of "every structure
 * completes through one shell-owned path": the map is total over
 * `structure_type`, so no structure can be rendered by nothing; and whatever is
 * in it completes through `useBlockCompletion`, so no structure can be recorded
 * by a renderer's own write.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Constants, type Enums } from '../data/database.types'
import {
  BlockCompletionContext,
  type BlockCompletionApi,
  type BlockOutcome,
} from '../state/block-completion'
import type { BlockProgress } from '../state/workout-progress'
import { BLOCK_RENDERERS, BlockSlot, blockRendererFor } from './block-renderers'
import { BlockPanel } from './block-renderers-frame'
import { HeadingLevelProvider } from './Heading'
import { LadderBlock } from './ladder-block'

function blockFixture(
  structureType: Enums<'structure_type'>,
  overrides: Partial<BlockProgress> = {},
): BlockProgress {
  return {
    blockId: `7000000${Constants.public.Enums.structure_type.indexOf(structureType) + 1}-0000-4000-8000-000000000000`,
    structureType,
    repScheme: 'fixed',
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
    timerType: 'none',
    timerSeconds: null,
    rounds: null,
    roundRestSeconds: null,
    ...overrides,
  }
}

/**
 * The verb a structure completes with, where it is not "Complete block".
 * Circuit, EMOM, AMRAP, and For Time name what they finish or record; each
 * concrete outcome is covered by its dedicated renderer test.
 */
const COMPLETION_LABELS: Partial<Record<Enums<'structure_type'>, string>> = {
  circuit: 'Complete circuit',
  emom: 'Complete EMOM',
  amrap: 'Complete AMRAP',
  for_time: 'Record For Time',
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
  return render(
    <BlockCompletionContext value={api}>
      <BlockSlot block={block} />
    </BlockCompletionContext>,
  )
}

/** A stateful consumer whose entry must survive a timer appearing or disappearing. */
function StatefulPanelField() {
  const [value, setValue] = useState('')
  return (
    <input
      aria-label="Retained set entry"
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
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
      expect(blockRendererFor(blockFixture(structureType))).toBe(
        BLOCK_RENDERERS[structureType],
      )
    }
  })

  it('dispatches a For Time ladder to the ladder renderer, by its rep scheme', () => {
    // EXE-04a is claimed on `rep_scheme`, which is not what the map is keyed
    // by: the same structure type takes a different renderer depending on it.
    const ladder = blockFixture('for_time', { repScheme: 'ladder_down' })

    expect(blockRendererFor(ladder)).toBe(LadderBlock)
    expect(blockRendererFor(blockFixture('for_time'))).toBe(BLOCK_RENDERERS.for_time)
  })

  it('leaves a ladder under another structure to that structure’s renderer', () => {
    // Ladders appear under circuits and standard blocks too, and those
    // renderers are EXE-02's and EXE-03's. This ticket claims For Time only.
    for (const structureType of Constants.public.Enums.structure_type) {
      if (structureType === 'for_time') continue
      expect(blockRendererFor(blockFixture(structureType, { repScheme: 'pyramid' }))).toBe(
        BLOCK_RENDERERS[structureType],
      )
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

  it.each([...Constants.public.Enums.structure_type])(
    'draws a %s block as one card, with one completion inside it',
    (structureType) => {
      const { container } = renderSlot(blockFixture(structureType), completionDouble().api)

      const cards = container.querySelectorAll('.clr-card')
      expect(cards).toHaveLength(1)
      expect(container.querySelector('.clr-card .clr-card')).toBeNull()

      const label = COMPLETION_LABELS[structureType] ?? 'Complete block'
      expect(within(cards[0] as HTMLElement).getAllByRole('button', { name: label })).toHaveLength(1)
    },
  )
})

/**
 * The grammar the renderers are drawn with. What is asserted is containment
 * and count — one card, one completion, groups that are rules rather than
 * frames — because those are what a renderer inherits by composing these and
 * cannot then get wrong.
 */
describe('the shared block frame', () => {
  function renderFrame(ui: ReactElement, api = completionDouble().api) {
    return render(<BlockCompletionContext value={api}>{ui}</BlockCompletionContext>)
  }

  it('is what the default panel is made of', () => {
    const block = blockFixture('standard')
    const { container } = renderFrame(<BlockPanel block={block} />)

    expect(container.querySelectorAll('.clr-card')).toHaveLength(1)
    expect(screen.getByText('STANDARD')).toBeInTheDocument()
    expect(screen.getByText('2 movements')).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('hands the structure’s outcome and verb to the one completion control', async () => {
    const user = userEvent.setup()
    const block = blockFixture('circuit')
    const { api, completeBlock } = completionDouble()
    renderFrame(
      <BlockPanel
        block={block}
        completion={{ outcome: { roundsCompleted: 2 }, label: 'Complete circuit' }}
      >
        <BlockPanel.Note>Every prescribed round is done.</BlockPanel.Note>
      </BlockPanel>,
      api,
    )

    expect(screen.getAllByRole('button')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Complete circuit' }))

    expect(completeBlock).toHaveBeenCalledExactlyOnceWith(block.blockId, { roundsCompleted: 2 })
  })

  it('disables that control once the block is recorded', () => {
    const block = blockFixture('standard')
    renderFrame(
      <BlockPanel block={block} completion={{ outcome: {} }} />,
      completionDouble([block.blockId]).api,
    )

    expect(screen.getByRole('button', { name: 'Block recorded' })).toBeDisabled()
  })

  it('draws a countdown beside the card, never inside it', () => {
    const { container } = renderFrame(
      <BlockPanel
        block={blockFixture('emom')}
        timer={<div data-testid="countdown" />}
        completion={{ outcome: {} }}
      />,
    )

    const countdown = screen.getByTestId('countdown')
    const card = container.querySelector('.clr-card')
    expect(countdown.closest('.clr-card')).toBeNull()
    expect(countdown.compareDocumentPosition(card as Element)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('preserves child state, identity and focus across absent and present timer states', async () => {
    const user = userEvent.setup()
    const block = blockFixture('standard')
    const { api } = completionDouble()
    const frame = (timer?: ReactElement | null | false) => (
      <BlockCompletionContext value={api}>
        <BlockPanel block={block} timer={timer}>
          <StatefulPanelField />
        </BlockPanel>
      </BlockCompletionContext>
    )
    const { container, rerender } = render(frame())
    const entry = screen.getByRole('textbox', { name: 'Retained set entry' })
    await user.type(entry, '12')
    expect(entry).toHaveFocus()

    for (const timer of [
      <div data-testid="countdown" key="first">Rest countdown</div>,
      false,
      <div data-testid="countdown" key="second">Rest countdown</div>,
      null,
      undefined,
    ] as const) {
      rerender(frame(timer))
      expect(screen.getByRole('textbox', { name: 'Retained set entry' })).toBe(entry)
      expect(entry).toHaveValue('12')
      expect(entry).toHaveFocus()
      expect(container.querySelectorAll('.clr-card')).toHaveLength(1)
      expect(container.querySelector('.clr-card .clr-card')).toBeNull()
    }
  })

  it('keeps a headed group a ruled sub-group, inside a card and outside one', () => {
    const group = (
      <BlockPanel.Group heading="Each round" meta="3 rounds">
        <BlockPanel.Note>Rest when the round is done.</BlockPanel.Note>
      </BlockPanel.Group>
    )

    const inside = renderFrame(
      <HeadingLevelProvider level={2}>
        <BlockPanel block={blockFixture('circuit')} completion={{ outcome: {} }}>
          {group}
        </BlockPanel>
      </HeadingLevelProvider>,
    )
    expect(inside.container.querySelectorAll('.clr-card')).toHaveLength(1)
    // One level below the block's surroundings, and inside the card's body
    // rather than in the public card's heading span.
    const heading = screen.getByRole('heading', { level: 3, name: 'Each round' })
    expect(heading.closest('.clr-card')).not.toBeNull()
    expect(heading.closest('span')).toBeNull()
    expect(screen.getByText('3 rounds')).toBeInTheDocument()
    inside.unmount()

    const outside = renderFrame(group)
    expect(outside.container.querySelector('.clr-card')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Each round' })).toBeInTheDocument()
  })

  it('lists movements as rows, marking the live one in words', () => {
    const { container } = renderFrame(
      <HeadingLevelProvider level={2}>
        <BlockPanel block={blockFixture('circuit')} completion={{ outcome: {} }}>
          <BlockPanel.MovementList label="Movements in this circuit">
            <BlockPanel.MovementItem marker="now">
              <BlockPanel.Movement title="1. Goblet Squat" detail="3 × 8 reps" />
            </BlockPanel.MovementItem>
            <BlockPanel.MovementItem marker="next">
              <BlockPanel.Movement title="2. Push-Up" />
            </BlockPanel.MovementItem>
            <BlockPanel.MovementItem>
              <BlockPanel.Movement title="3. Plank" detail="30 s" />
            </BlockPanel.MovementItem>
          </BlockPanel.MovementList>
        </BlockPanel>
      </HeadingLevelProvider>,
    )

    const list = screen.getByRole('list', { name: 'Movements in this circuit' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(3)

    expect(rows[0]).toHaveAttribute('aria-current', 'step')
    expect(within(rows[0]).getByText('Now')).toBeInTheDocument()
    expect(rows[1]).not.toHaveAttribute('aria-current')
    expect(within(rows[1]).getByText('Next')).toBeInTheDocument()
    expect(rows[2]).not.toHaveAttribute('aria-current')
    expect(within(rows[2]).queryByText(/^(Now|Next)$/)).toBeNull()

    expect(screen.getByRole('heading', { level: 3, name: '1. Goblet Squat' })).toBeInTheDocument()
    expect(within(rows[0]).getByText('3 × 8 reps')).toBeInTheDocument()

    // Rows, not cards and not frames of their own.
    expect(container.querySelectorAll('.clr-card')).toHaveLength(1)
    expect(list.querySelector('.clr-chamfer')).toBeNull()
  })

  it('sets fields in a wrapping row that adds no frame, and says an emptied block is empty', () => {
    const { container } = renderFrame(
      <BlockPanel block={blockFixture('amrap')} completion={{ outcome: {} }}>
        <BlockPanel.EmptyNote />
        <BlockPanel.Label>Score</BlockPanel.Label>
        <BlockPanel.FieldRow data-testid="fields">
          <label>
            Rounds <input type="number" />
          </label>
        </BlockPanel.FieldRow>
      </BlockPanel>,
    )

    expect(screen.getByText(/every movement in it was swapped out/)).toBeInTheDocument()
    expect(screen.getByText('Score').tagName).toBe('P')

    const fields = screen.getByTestId('fields')
    expect(fields).toHaveClass('clr-row')
    expect(fields).not.toHaveClass('clr-chamfer')
    expect(within(fields).getByLabelText('Rounds')).toBeInTheDocument()
    expect(container.querySelectorAll('.clr-card')).toHaveLength(1)
  })
})
