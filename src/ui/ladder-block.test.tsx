/**
 * EXE-04a acceptance, through the renderer the shell actually dispatches to.
 *
 * Five criteria, and each is asserted as the kind of thing it is:
 *
 *   · **rungs come from `target_sequence`** — the fixture sets the `int[]`
 *     column and nothing else, so a renderer that wanted a pattern string would
 *     have nothing to read;
 *   · **the scheme is shown once** — counted on the screen, not assumed;
 *   · **a rung is identified by its target** — read off the accessible names,
 *     which is what a screen-reader user is given to choose between;
 *   · **cap-hit prompts selection and supplies `highest_rung`** — read off the
 *     shell's seam, the only place a renderer may put an outcome;
 *   · **read-only and interactive are visually distinct** — asserted as the
 *     difference that produces the appearance (a list versus a set of radios,
 *     and the co-located CSS that draws them), because jsdom loads no
 *     stylesheets.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  BlockCompletionContext,
  type BlockCompletionApi,
  type BlockOutcome,
} from '../state/block-completion'
import { sessionProgress, type BlockProgress } from '../state/workout-progress'
import type { Enums } from '../data/database.types'
import {
  snapshotFixture,
  type BlockFixture,
  type ExerciseFixture,
} from '../test/workout-double'
import { BlockSlot } from './block-renderers'

const css = readFileSync(join(process.cwd(), 'src/ui/ladder-rungs.css'), 'utf8')

/** The declarations alone — a comment may say `48px`; a rule may not. */
const declarations = css.replaceAll(/\/\*[\s\S]*?\*\//g, '')

/** A movement whose target is a sequence: rungs in an int array, never a string. */
function sequence(
  exerciseId: string,
  rungs: number[],
  overrides: ExerciseFixture['prescription'] = {},
): ExerciseFixture {
  return {
    prescription: {
      exercise_id: exerciseId,
      target_kind: 'sequence',
      target_value: null,
      target_sequence: rungs,
      ...overrides,
    },
  }
}

interface Mounted {
  block: BlockProgress
  completeBlock: ReturnType<typeof vi.fn<(id: string, outcome: BlockOutcome) => void>>
}

function mount(
  block: BlockFixture = {},
  options: { recorded?: boolean } = {},
): Mounted {
  const snapshot = snapshotFixture({
    sections: [
      {
        title: 'Conditioning',
        sectionType: 'conditioning',
        blocks: [
          {
            structureType: 'for_time',
            repScheme: 'ladder_down',
            timerSeconds: 480,
            timerType: 'countdown',
            exercises: [sequence('kettlebell-swing', [15, 12, 9, 6, 3])],
            ...block,
          },
        ],
      },
    ],
  })

  const progress = sessionProgress(snapshot)
  const blockProgress = progress.sections[0].blocks[0]

  const completeBlock = vi.fn<(id: string, outcome: BlockOutcome) => void>()
  const completion: BlockCompletionApi = {
    completeBlock,
    isBlockRecorded: () => options.recorded === true,
  }

  render(
    <BlockCompletionContext value={completion}>
      {/* Dispatched rather than named: the registry decides the renderer. */}
      <BlockSlot block={blockProgress} />
    </BlockCompletionContext>,
  )

  return { block: blockProgress, completeBlock }
}

/** The rungs, as the row presents them to someone who cannot see it. */
function rungNames(): string[] {
  const items = screen
    .getByRole('list', { name: 'Ladder' })
    .querySelectorAll('[role="listitem"] .a11y-hidden')

  return Array.from(items, (item) => item.textContent ?? '')
}

/** Says the block ended the way the user says it did. */
async function declare(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole('radio', { name: label }))
}

describe('the ladder is rendered from the int array, and shown once', () => {
  it('renders one rung per entry of target_sequence, in order', () => {
    mount()

    // `15-12-9-6-3` as five rungs, each named by the target it asks for.
    expect(rungNames()).toEqual(['15 reps', '12 reps', '9 reps', '6 reps', '3 reps'])
  })

  it('states the rep scheme at the block, never on a movement line', () => {
    mount({
      structureType: 'for_time',
      repScheme: 'pyramid',
      exercises: [
        sequence('push-up', [2, 4, 6, 4, 2], { order_index: 0 }),
        sequence('sit-up', [2, 4, 6, 4, 2], { order_index: 1 }),
      ],
    })

    // One row of rungs for two movements — not one row each.
    expect(screen.getAllByRole('list', { name: 'Ladder' })).toHaveLength(1)
    expect(screen.getByText('Ladder')).toBeInTheDocument()
    // And no movement line repeats the pattern the way the old card did.
    expect(screen.queryByText(/2-4-6-4-2/)).not.toBeInTheDocument()
    expect(screen.queryByText(/5 rungs/)).not.toBeInTheDocument()
    expect(
      screen.getAllByRole('heading').map((heading) => heading.textContent),
    ).toEqual(['push up', 'sit up'])
  })

  it('says what is performed at each rung when the movements share it', () => {
    mount({
      structureType: 'for_time',
      repScheme: 'ladder_down',
      exercises: [
        sequence('push-up', [10, 8, 6], { order_index: 0 }),
        sequence('sit-up', [10, 8, 6], { order_index: 1 }),
      ],
    })

    expect(screen.getByText('Each rung')).toBeInTheDocument()
  })

  it('omits the each-rung line for a single movement, which implies it', () => {
    mount()

    expect(screen.queryByText('Each rung')).not.toBeInTheDocument()
  })

  it('shows an inverse pair’s two numbers on the rung they share', () => {
    mount({
      structureType: 'for_time',
      repScheme: 'inverse',
      exercises: [
        sequence('pull-up', [10, 9, 8], { order_index: 0 }),
        sequence('burpee', [1, 2, 3], { order_index: 1 }),
      ],
    })

    expect(rungNames()).toEqual(['10 / 1 reps', '9 / 2 reps', '8 / 3 reps'])
  })

  it('states a fixed-interval companion as an annotation, not as a movement', () => {
    mount({
      structureType: 'for_time',
      repScheme: 'ladder_fixed_interval',
      exercises: [
        sequence('push-up', [2, 4, 6, 8], { order_index: 0 }),
        {
          prescription: {
            exercise_id: 'burpee',
            order_index: 1,
            target_kind: 'fixed',
            target_value: 4,
          },
        },
      ],
    })

    expect(screen.getByText('4 reps burpee between each rung')).toBeInTheDocument()
    // The companion is an annotation under the ladder's movement, not a card
    // of its own — one heading, not two.
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['push up'])
  })
})

describe('read-only and interactive rungs are different things', () => {
  it('offers nothing to tap while the block is being performed', () => {
    mount()

    expect(screen.getByRole('list', { name: 'Ladder' })).toBeInTheDocument()
    // The only radios on the screen are the two endings; no rung is a control.
    expect(screen.getAllByRole('radio').map((radio) => radio.textContent)).toEqual([
      'Finished the ladder',
      'Hit the time cap',
    ])
  })

  it('turns the same rungs into a choice once the cap is declared', async () => {
    const user = userEvent.setup()
    mount()
    await declare(user, 'Hit the time cap')

    const group = screen.getByRole('group', { name: 'How far did you get?' })
    expect(
      within(group)
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('aria-label')),
    ).toEqual(['15 reps', '12 reps', '9 reps', '6 reps', '3 reps'])

    // One row, two modes: the read-only display is not left behind it.
    expect(screen.queryByRole('list', { name: 'Ladder' })).not.toBeInTheDocument()
  })

  it('draws the two states differently, and a chosen rung with more than colour', () => {
    // jsdom loads no stylesheets, so the appearance is asserted on the source.
    expect(css).toMatch(/\.clr-rung--selectable/)
    // The touch target is the card, not the glyph inside it: 48px each way.
    expect(css).toMatch(/min-width: var\(--spacing-1000\)/)
    expect(css).toMatch(/\.clr-rung\[data-state='reached'\]/)
    expect(css).toMatch(/\.clr-rung\[data-state='selected'\]/)
    // Tokens only — no hex, no raw px, no font name.
    expect(declarations).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(declarations).not.toMatch(/:\s*-?\d+px/)
  })

  it('marks the chosen rung and the rungs climbed below it', async () => {
    const user = userEvent.setup()
    mount()
    await declare(user, 'Hit the time cap')
    await user.click(screen.getByRole('radio', { name: '9 reps' }))

    const states = Array.from(
      screen
        .getByRole('group', { name: 'How far did you get?' })
        .querySelectorAll('.clr-rung'),
      (rung) => rung.getAttribute('data-state'),
    )

    expect(states).toEqual(['reached', 'reached', 'selected', 'unreached', 'unreached'])
    // And the choice is stated in words, so the fill is never the only cue.
    expect(screen.getByText('Reached rung 3 of 5 — 9 reps')).toBeInTheDocument()
  })

  it('reselects cleanly when the user changes their mind', async () => {
    const user = userEvent.setup()
    mount()
    await declare(user, 'Hit the time cap')

    await user.click(screen.getByRole('radio', { name: '12 reps' }))
    expect(screen.getByRole('radio', { name: '12 reps' })).toBeChecked()

    await user.click(screen.getByRole('radio', { name: '3 reps' }))
    expect(screen.getByRole('radio', { name: '3 reps' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '12 reps' })).not.toBeChecked()
    expect(screen.getByText('Reached rung 5 of 5 — 3 reps')).toBeInTheDocument()
  })

  it('tells two rungs with the same target apart by position, not by name', async () => {
    const user = userEvent.setup()
    mount({
      structureType: 'for_time',
      repScheme: 'pyramid',
      exercises: [sequence('push-up', [2, 4, 6, 4, 2])],
    })
    await declare(user, 'Hit the time cap')

    // A pyramid climbs past 4 twice. The two are different rungs, and the
    // second one is the one further up.
    const fours = screen.getAllByRole('radio', { name: '4 reps' })
    expect(fours).toHaveLength(2)

    await user.click(fours[1])
    expect(screen.getByText('Reached rung 4 of 5 — 4 reps')).toBeInTheDocument()
  })
})

describe('the rung reached is what the block’s row records', () => {
  it('supplies the chosen rung as highest_rung when the cap was hit', async () => {
    const user = userEvent.setup()
    const { block, completeBlock } = mount()

    await declare(user, 'Hit the time cap')
    await user.click(screen.getByRole('radio', { name: '9 reps' }))
    await user.click(screen.getByRole('button', { name: 'Complete block' }))

    // The rung *number*, which is what `block_results.highest_rung` means —
    // rung 3 of the ladder, whose target happens to be 9.
    expect(completeBlock).toHaveBeenCalledExactlyOnceWith(block.blockId, {
      highestRung: 3,
    })
  })

  it('records the top rung when the ladder was finished', async () => {
    const user = userEvent.setup()
    const { block, completeBlock } = mount()

    await declare(user, 'Finished the ladder')
    await user.click(screen.getByRole('button', { name: 'Complete block' }))

    expect(completeBlock).toHaveBeenCalledExactlyOnceWith(block.blockId, {
      highestRung: 5,
    })
    // Finishing fills the pattern without turning it into a control.
    expect(screen.getByText('Reached rung 5 of 5 — 3 reps')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Ladder' })).toBeInTheDocument()
  })

  it('records no rung at all when the user says nothing', async () => {
    const user = userEvent.setup()
    const { block, completeBlock } = mount()

    await user.click(screen.getByRole('button', { name: 'Complete block' }))

    // Advancing without answering is allowed, and a rung nobody stated would
    // be a guess (DATA_MODEL §8).
    expect(completeBlock).toHaveBeenCalledExactlyOnceWith(block.blockId, {})
  })

  it('records no rung when the cap was hit and no rung was chosen', async () => {
    const user = userEvent.setup()
    const { block, completeBlock } = mount()

    await declare(user, 'Hit the time cap')
    await user.click(screen.getByRole('button', { name: 'Complete block' }))

    expect(completeBlock).toHaveBeenCalledExactlyOnceWith(block.blockId, {})
  })

  it('forgets the rung when the user changes the ending to finished', async () => {
    const user = userEvent.setup()
    const { block, completeBlock } = mount()

    await declare(user, 'Hit the time cap')
    await user.click(screen.getByRole('radio', { name: '6 reps' }))
    await declare(user, 'Finished the ladder')
    await user.click(screen.getByRole('button', { name: 'Complete block' }))

    expect(completeBlock).toHaveBeenCalledExactlyOnceWith(block.blockId, {
      highestRung: 5,
    })
  })

  it('offers no second completion for a block already recorded', () => {
    mount({}, { recorded: true })

    expect(screen.getByRole('button', { name: 'Block recorded' })).toBeDisabled()
  })
})

describe('a ladder block the rows do not describe as one', () => {
  it('says so rather than drawing an empty rail, and still completes', async () => {
    const user = userEvent.setup()
    const { block, completeBlock } = mount({
      structureType: 'for_time',
      repScheme: 'ladder_down',
      exercises: [{ prescription: { exercise_id: 'burpee' } }],
    })

    expect(
      screen.getByText(
        'This ladder prescribes no rungs — perform the movements as written.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Ladder' })).not.toBeInTheDocument()
    // The movement is still named, and the block still completes — with no
    // ending to declare, because there are no rungs to have reached.
    expect(screen.getByRole('heading', { name: 'burpee' })).toBeInTheDocument()
    expect(screen.queryByText('How did this block end?')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Complete block' }))
    expect(completeBlock).toHaveBeenCalledExactlyOnceWith(block.blockId, {})
  })

  it('says the block has nothing left when every movement was swapped out', () => {
    mount({
      structureType: 'for_time',
      repScheme: 'ladder_down',
      exercises: [
        sequence('kettlebell-swing', [15, 12, 9], { revision_status: 'superseded' }),
      ],
    })

    expect(
      screen.getByText(/every movement in it was swapped\s+out/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })
})

describe('the ladder states its structure identity like every other block', () => {
  it('names the structure, its cap and its scheme, and the block’s size', () => {
    mount({
      structureType: 'for_time',
      repScheme: 'ladder_down',
      timerSeconds: 480,
      exercises: [sequence('kettlebell-swing', [15, 12, 9])],
    })

    expect(screen.getByText('FOR TIME · 8 MIN CAP · LADDER DOWN')).toBeInTheDocument()
    expect(screen.getByText('1 movement')).toBeInTheDocument()
  })

  it('counts rungs in the modality prescribed, not in reps by default', () => {
    const modality: Enums<'prescription_modality'> = 'time'
    mount({
      structureType: 'for_time',
      repScheme: 'ladder_down',
      exercises: [sequence('plank', [60, 45, 30], { modality })],
    })

    expect(rungNames()).toEqual(['60 sec', '45 sec', '30 sec'])
  })
})
