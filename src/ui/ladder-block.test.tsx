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
 *
 * TASK-012 (C35; R70, R71, R72, R94, R95, R117) supersedes how the pattern is
 * *shown*: every ladder now states it through the compact prescription — one
 * concise line per movement, then each rung as a round tile with every
 * movement's work in it, the fixed companion included — instead of the
 * read-only rung row, the "Each rung" caption, the movement rows with their
 * "between each rung" note and the timed list's "— same every round" suffix.
 * The rung row is drawn only once answered. Each superseded assertion below
 * says so where it changed; its focused proof is `src/ui/ladder-rungs.test.tsx`.
 *
 * TASK-013 (C33, C34, C36; AC-R013-01; R77, R88, R89, R92, R99, R118)
 * supersedes how the rung reached is *asked and read*: the "How far did you
 * get?" radio row and the "Ladder" reached row are gone, and the result log's
 * "Rounds completed" asks it instead — rep-first tiles, one toggle per rung,
 * named `Round 3: 9 reps` (position and target both said), the selected prefix
 * pressed and counted (`3 of 5 rounds completed`), with no tick. Selecting the
 * top rung is Complete. The ladder's answer now lives in TASK-032's durable
 * attempt (`localStorage`), so each case starts from empty storage. Its focused
 * proof is TASK-013's in `src/ui/timed-workout-flow.test.tsx`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  BlockCompletionContext,
  type BlockCompletionApi,
  type BlockOutcome,
} from '../state/block-completion'
import type { LadderTiming } from '../state/schemas'
import type { ShellStorage } from '../state/workout-persistence'
import { sessionProgress, type BlockProgress } from '../state/workout-progress'
import type { Enums } from '../data/database.types'
import {
  snapshotFixture,
  type BlockFixture,
  type ExerciseFixture,
} from '../test/workout-double'
import { BlockSlot } from './block-renderers'
import { LadderBlock } from './ladder-block'

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
  reportOutcome: ReturnType<typeof vi.fn<(id: string, outcome: BlockOutcome) => void>>
  container: HTMLElement
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

  const reportOutcome = vi.fn<(id: string, outcome: BlockOutcome) => void>()
  const completion: BlockCompletionApi = {
    reportOutcome,
    isBlockRecorded: () => options.recorded === true,
  }

  const { container } = render(
    <BlockCompletionContext value={completion}>
      {/* Dispatched rather than named: the registry decides the renderer. */}
      <BlockSlot block={blockProgress} />
    </BlockCompletionContext>,
  )

  return { block: blockProgress, reportOutcome, container }
}

/**
 * TASK-012 (C35): each round of the compact prescription, as it reads on
 * screen — every movement's work in that round, in prescribed order.
 */
function roundWork(): string[][] {
  return Array.from(
    screen.getByRole('list', { name: 'Rounds in this ladder' }).querySelectorAll(':scope > li'),
    (tile) => Array.from(tile.querySelectorAll('[data-ladder-entry] > [aria-hidden="true"]'), (entry) => entry.textContent ?? ''),
  )
}

/** TASK-012 (C35): the concise summary, one line per movement. */
function movementLines(): string[] {
  return within(screen.getByRole('list', { name: 'Movements in this ladder' }))
    .getAllByRole('listitem')
    .map((line) => (line.textContent ?? '').replace(/\s+/g, ' ').trim())
}

/**
 * Says the block ended the way the user says it did. TASK-010 (C29; R78, R87):
 * the answers are now the shared log's Complete and Incomplete, in one row,
 * replacing "Finished the ladder" and "Hit the time cap" / "Fell behind the
 * schedule"; what each records is unchanged.
 */
async function declare(user: ReturnType<typeof userEvent.setup>, label: 'Complete' | 'Incomplete') {
  await user.click(screen.getByRole('radio', { name: label }))
}

/**
 * TASK-013 (C33, C34; R88, R99): the result log's rounds completed — the
 * rep-first tiles that replaced the "How far did you get?" radios, each named
 * by its round and its target.
 */
function roundsCompleted(): HTMLElement {
  return screen.getByRole('group', { name: 'Rounds completed' })
}

function roundTile(name: string): HTMLElement {
  return within(roundsCompleted()).getByRole('button', { name })
}

/** The rungs pressed, by number: the completed prefix. */
function pressedRungs(): number[] {
  return within(roundsCompleted())
    .getAllByRole('button')
    .filter((tile) => tile.getAttribute('aria-pressed') === 'true')
    .map((tile) => Number(tile.dataset.ladderRung))
}

function roundsCount(): string {
  return within(roundsCompleted()).getByRole('status').textContent ?? ''
}

// TASK-013: the ladder's answer is durable (TASK-032's attempt in
// `localStorage`), so no case may inherit another's.
afterEach(() => {
  localStorage.clear()
})

describe('the ladder is rendered from the int array, and shown once', () => {
  it('renders one rung per entry of target_sequence, in order', () => {
    mount()

    // `15-12-9-6-3` as five rungs. TASK-012 (C35, R72): each is a round of the
    // compact prescription, its target in the ×/· notation.
    expect(roundWork()).toEqual([
      ['15 × kettlebell swing'], ['12 × kettlebell swing'], ['9 × kettlebell swing'],
      ['6 × kettlebell swing'], ['3 × kettlebell swing'],
    ])
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

    // One set of rounds for two movements — not one each. TASK-012 (C35,
    // R94): each movement states its own concise progression once, beside its
    // name — here a pyramid, which is its actual sequence, not a step it does
    // not have — and the rounds carry both movements; no read-only rung row
    // repeats the pattern while the ladder is performed.
    expect(screen.getAllByRole('list', { name: 'Rounds in this ladder' })).toHaveLength(1)
    expect(screen.queryByRole('list', { name: 'Ladder' })).not.toBeInTheDocument()
    expect(movementLines()).toEqual(['push up barbell · 2-4-6-4-2 reps', 'sit up barbell · 2-4-6-4-2 reps'])
    expect(roundWork()[2]).toEqual(['6 × push up', '6 × sit up'])
    expect(screen.queryByText(/5 rungs/)).not.toBeInTheDocument()
    // TASK-010 (C29, C30): the shared result log's one title. TASK-012: the
    // movements are named in the summary's lines, not as headings of rows.
    expect(
      screen.getAllByRole('heading').map((heading) => heading.textContent),
    ).toEqual(['Log results'])
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

    // TASK-012 (C35, R95): each round's tile says it — both movements at that
    // rung — so the "Each rung" caption is no longer drawn.
    expect(roundWork()).toEqual([['10 × push up', '10 × sit up'], ['8 × push up', '8 × sit up'], ['6 × push up', '6 × sit up']])
    expect(screen.queryByText('Each rung')).not.toBeInTheDocument()
  })

  it('omits the each-rung line for a single movement, which implies it', () => {
    mount()

    expect(screen.queryByText('Each rung')).not.toBeInTheDocument()
    // TASK-012 (C35): one movement, one entry in each round.
    expect(roundWork().every((round) => round.length === 1)).toBe(true)
  })

  it('shows an inverse pair’s two numbers on the rung they share', async () => {
    mount({
      structureType: 'for_time',
      repScheme: 'inverse',
      exercises: [
        sequence('pull-up', [10, 9, 8], { order_index: 0 }),
        sequence('burpee', [1, 2, 3], { order_index: 1 }),
      ],
    })

    // TASK-012 (C35): each round names both movements at their own target.
    expect(roundWork()).toEqual([['10 × pull up', '1 × burpee'], ['9 × pull up', '2 × burpee'], ['8 × pull up', '3 × burpee']])
    // The rung the athlete is asked about still carries both numbers.
    // TASK-013 (C33, R88): as a rep-first tile, named by round and target.
    await declare(userEvent.setup(), 'Incomplete')
    expect(
      within(roundsCompleted())
        .getAllByRole('button')
        .map((tile) => tile.getAttribute('aria-label')),
    ).toEqual(['Round 1: 10 / 1 reps', 'Round 2: 9 / 2 reps', 'Round 3: 8 / 3 reps'])
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

    // TASK-012 (C35, R70, R72): the companion's fixed target is said once in
    // its summary line and in every round beside the rung's work — replacing
    // "4 reps burpee between each rung". Still no card of its own: the only
    // heading is the result log's (TASK-010).
    expect(movementLines()).toEqual(['push up barbell · 2 → 8 reps · +2 per round', 'burpee barbell · 4 reps'])
    expect(roundWork()).toEqual([
      ['2 × push up', '4 × burpee'], ['4 × push up', '4 × burpee'],
      ['6 × push up', '4 × burpee'], ['8 × push up', '4 × burpee'],
    ])
    expect(screen.queryByText(/between each rung/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['Log results'])
  })
})

describe('read-only and interactive rungs are different things', () => {
  it('offers nothing to tap while the block is being performed', () => {
    mount()

    // TASK-012 (C35, R95): the pattern is the compact prescription's, and the
    // read-only rung row is not drawn beside it until the ladder is answered.
    expect(screen.getByRole('list', { name: 'Rounds in this ladder' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Ladder' })).not.toBeInTheDocument()
    // The only radios on the screen are the result log's (TASK-010: C29, C30):
    // the two answers and the three effort faces, none chosen. No rung is a control.
    expect(screen.getAllByRole('radio').map((radio) => radio.textContent)).toEqual([
      'Complete',
      'Incomplete',
      'Too hard',
      'About right',
      'Too easy',
    ])
    expect(screen.queryAllByRole('radio', { checked: true })).toEqual([])
  })

  it('turns the same rungs into a choice once the cap is declared', async () => {
    const user = userEvent.setup()
    mount()
    await declare(user, 'Incomplete')

    // TASK-013 (C33, C34; R88): the result log's rep-first tiles, each a
    // toggle named by its round and its target.
    expect(
      within(roundsCompleted())
        .getAllByRole('button')
        .map((tile) => tile.getAttribute('aria-label')),
    ).toEqual(['Round 1: 15 reps', 'Round 2: 12 reps', 'Round 3: 9 reps', 'Round 4: 6 reps', 'Round 5: 3 reps'])
    expect(pressedRungs()).toEqual([])

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
    await declare(user, 'Incomplete')
    await user.click(roundTile('Round 3: 9 reps'))

    // TASK-013 (C34, AC-R013-01): the chosen rung and every rung before it
    // are the pressed prefix; the rest are not.
    expect(within(roundsCompleted()).getAllByRole('button').map((tile) => tile.getAttribute('aria-pressed')))
      .toEqual(['true', 'true', 'true', 'false', 'false'])
    // And the choice is stated in words, so the fill is never the only cue.
    expect(roundsCount()).toBe('3 of 5 rounds completed')
  })

  it('reselects cleanly when the user changes their mind', async () => {
    const user = userEvent.setup()
    mount()
    await declare(user, 'Incomplete')

    // TASK-013 (C34, AC-R013-01): a tile states the prefix through it.
    await user.click(roundTile('Round 2: 12 reps'))
    expect(pressedRungs()).toEqual([1, 2])

    // The top rung is every rung: the ladder is Complete.
    await user.click(roundTile('Round 5: 3 reps'))
    expect(pressedRungs()).toEqual([1, 2, 3, 4, 5])
    expect(screen.getByRole('radio', { name: 'Complete' })).toHaveAttribute('aria-checked', 'true')
    expect(roundsCount()).toBe('5 of 5 rounds completed')
  })

  it('tells two rungs with the same target apart by position, not by name', async () => {
    const user = userEvent.setup()
    mount({
      structureType: 'for_time',
      repScheme: 'pyramid',
      exercises: [sequence('push-up', [2, 4, 6, 4, 2])],
    })
    await declare(user, 'Incomplete')

    // A pyramid climbs past 4 twice. The two are different rungs, and the
    // second one is the one further up. TASK-013 (R88): each tile's name says
    // its round as well as its target, so the two never share a name.
    const fours = within(roundsCompleted()).getAllByRole('button', { name: /: 4 reps$/ })
    expect(fours.map((tile) => tile.getAttribute('aria-label'))).toEqual(['Round 2: 4 reps', 'Round 4: 4 reps'])

    await user.click(fours[1])
    expect(roundsCount()).toBe('4 of 5 rounds completed')
  })
})

describe('the rung reached is what the block’s row records', () => {
  it('supplies the chosen rung as highest_rung when the cap was hit', async () => {
    const user = userEvent.setup()
    const { block, reportOutcome } = mount()

    await declare(user, 'Incomplete')
    await user.click(roundTile('Round 3: 9 reps'))

    // The rung *number*, which is what `block_results.highest_rung` means —
    // rung 3 of the ladder, whose target happens to be 9.
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {
      highestRung: 3,
    })
  })

  it('records the top rung when the ladder was finished', async () => {
    const user = userEvent.setup()
    const { block, reportOutcome } = mount()

    await declare(user, 'Complete')

    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {
      highestRung: 5,
    })
    // Every rung reads as climbed. TASK-013 (C36; R69): in the editable log,
    // so the athlete can still correct it — the reached reading is the count.
    expect(pressedRungs()).toEqual([1, 2, 3, 4, 5])
    expect(roundsCount()).toBe('5 of 5 rounds completed')
    expect(screen.queryByRole('list', { name: 'Ladder' })).not.toBeInTheDocument()
  })

  it('records no rung at all when the user says nothing', () => {
    const { block, reportOutcome } = mount()

    // Advancing without answering is allowed, and a rung nobody stated would
    // be a guess (DATA_MODEL §8).
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})
  })

  it('records no rung when the cap was hit and no rung was chosen', async () => {
    const user = userEvent.setup()
    const { block, reportOutcome } = mount()

    await declare(user, 'Incomplete')

    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})
  })

  it('forgets the rung when the user changes the ending to finished', async () => {
    const user = userEvent.setup()
    const { block, reportOutcome } = mount()

    await declare(user, 'Incomplete')
    await user.click(roundTile('Round 4: 6 reps'))
    await declare(user, 'Complete')

    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {
      highestRung: 5,
    })
  })

  it('says a saved block is saved, and offers no completion of its own (REQ-013)', () => {
    mount({}, { recorded: true })

    expect(screen.getByText('Block saved')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Complete/ })).not.toBeInTheDocument()
  })
})

describe('a ladder block the rows do not describe as one', () => {
  it('says so rather than drawing an empty rail, and still completes', () => {
    const { block, reportOutcome } = mount({
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
    // TASK-012 (C35): named in the compact prescription's summary, no rounds.
    expect(movementLines()).toEqual(['burpee barbell · 8 reps'])
    expect(screen.queryByRole('list', { name: 'Rounds in this ladder' })).not.toBeInTheDocument()
    expect(screen.queryByText('Work completed')).not.toBeInTheDocument()

    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})
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

describe('a ladder block is one card of the shared frame', () => {
  it('draws one card, with no card inside it, whichever mode the rungs are in', async () => {
    const user = userEvent.setup()
    const { container } = mount({
      exercises: [
        sequence('thruster', [21, 15, 9]),
        sequence('pull-up', [21, 15, 9]),
      ],
    })

    expect(container.querySelectorAll('.clr-card')).toHaveLength(1)

    await declare(user, 'Incomplete')
    expect(container.querySelectorAll('.clr-card')).toHaveLength(1)
  })

  it('lists its movements as rows in prescribed order, each headed by its name', () => {
    mount({
      exercises: [
        sequence('thruster', [21, 15, 9]),
        sequence('pull-up', [21, 15, 9]),
      ],
    })

    const list = screen.getByRole('list', { name: 'Movements in this ladder' })
    const rows = within(list).getAllByRole('listitem')

    // TASK-012 (C35): one concise summary line per movement, in prescribed
    // order, led by its name — the compact prescription's, not a headed row.
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.querySelector('[data-movement-name]')?.textContent)).toEqual(['thruster', 'pull up'])
    // A ladder tracks no position among its movements, so none is marked live.
    expect(list.querySelector('[aria-current]')).toBeNull()
  })

  it('captions the rungs and the movements with the same group label', async () => {
    mount({
      exercises: [
        sequence('thruster', [21, 15, 9]),
        sequence('pull-up', [21, 15, 9]),
      ],
    })

    // TASK-012 (C35, R95): no "Each rung" caption — every round says what is
    // in it — and the rung row, with its caption, is drawn once answered.
    expect(screen.queryByText('Each rung')).not.toBeInTheDocument()
    await declare(userEvent.setup(), 'Complete')
    // TASK-013 (C33): the rungs are the result log's "Rounds completed", whose
    // legend wears the same DS label face as the log's other questions.
    const rounds = roundsCompleted().querySelector('legend')!
    expect(rounds).toHaveTextContent('Rounds completed')
    expect(rounds).toHaveClass('label')
    expect(screen.getByRole('group', { name: 'Work completed' }).querySelector('legend')).toHaveClass('label')
  })

  it('says it is saved inside the card, below the ending it asks for', () => {
    const { container } = mount({}, { recorded: true })

    const card = container.querySelector('.clr-card') as HTMLElement
    const saved = within(card).getAllByText('Block saved')
    expect(saved).toHaveLength(1)

    const ending = screen.getByRole('group', { name: 'Work completed' })
    expect(card).toContainElement(ending)
    expect(
      ending.compareDocumentPosition(saved[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('keeps the rung choice live after the cap is declared, and reports it', async () => {
    const user = userEvent.setup()
    const { block, reportOutcome } = mount()

    await declare(user, 'Incomplete')
    await user.click(roundTile('Round 3: 9 reps'))

    // TASK-013 (C34): the count says it.
    expect(roundsCount()).toBe('3 of 5 rounds completed')

    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {
      highestRung: 3,
    })
  })

  it('says an emptied block is empty, and still reports to the shell', () => {
    const { block, reportOutcome } = mount({
      exercises: [
        sequence('kettlebell-swing', [15, 12, 9], { revision_status: 'superseded' }),
      ],
    })

    expect(screen.getByText(/every movement in it was swapped\s+out/)).toBeInTheDocument()
    expect(
      screen.queryByRole('list', { name: 'Movements in this ladder' }),
    ).not.toBeInTheDocument()
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})
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

    // TASK-003 (AC-C08-01, G03): the badge names the shape the ladder renderer
    // performs, LADDER; its cap and scheme are read on the line below it.
    expect(screen.getByText('LADDER')).toBeInTheDocument()
    expect(screen.getByText('8 MIN CAP · LADDER DOWN')).toBeInTheDocument()
    expect(screen.getByText('1 movement')).toBeInTheDocument()
  })

  it('counts rungs in the modality prescribed, not in reps by default', () => {
    const modality: Enums<'prescription_modality'> = 'time'
    mount({
      structureType: 'for_time',
      repScheme: 'ladder_down',
      exercises: [sequence('plank', [60, 45, 30], { modality })],
    })

    // TASK-012 (C35, R72): the unit is the meaning of a timed rung, so the
    // round and the progression keep `sec`.
    expect(roundWork()).toEqual([['60 sec plank'], ['45 sec plank'], ['30 sec plank']])
    expect(movementLines()).toEqual(['plank barbell · 60 → 30 sec · \u221215 per round'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// REQ-018 / E03 (TASK-033) — explicit timing, drawn as precomputed rounds
// ─────────────────────────────────────────────────────────────────────────────

/** `localStorage`, in memory, so one test cannot see another's schedule. */
function memoryStorage(): ShellStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  }
}

const SCHEDULE_START = Date.parse('2026-10-22T10:00:00.000Z')

interface TimedMount extends Mounted {
  unmount: () => void
}

/**
 * A timed ladder, as the shell would hand it over. The shared snapshot double
 * carries no `ladder_timing` column, so the stored value is set on the block
 * the progress model reads — exactly the one fact the renderer keys on.
 */
function mountTimed(
  timing: LadderTiming,
  block: BlockFixture,
  options: { storage?: ShellStorage; now?: () => number } = {},
): TimedMount {
  const snapshot = snapshotFixture({
    sections: [{ title: 'Conditioning', sectionType: 'conditioning', blocks: [block] }],
  })
  const blockProgress: BlockProgress = {
    ...sessionProgress(snapshot).sections[0].blocks[0],
    ladderTiming: timing,
  }

  const reportOutcome = vi.fn<(id: string, outcome: BlockOutcome) => void>()
  const completion: BlockCompletionApi = { reportOutcome, isBlockRecorded: () => false }

  const { container, unmount } = render(
    <BlockCompletionContext value={completion}>
      {options.storage === undefined ? (
        // Dispatched rather than named: the registry decides the renderer.
        <BlockSlot block={blockProgress} />
      ) : (
        <LadderBlock
          block={blockProgress}
          storage={options.storage}
          now={options.now ?? (() => SCHEDULE_START)}
        />
      )}
    </BlockCompletionContext>,
  )

  return { block: blockProgress, reportOutcome, container, unmount }
}

/** Each round row of the timed ladder. */
function roundRows(): HTMLElement[] {
  return within(screen.getByRole('list', { name: 'Rounds in this ladder' })).getAllByRole('listitem')
}

/** Nothing on the screen asks for a set, a number or an exertion. */
function expectNoSetEntry() {
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
  expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.queryByText(/\bRPE\b|exertion/i)).not.toBeInTheDocument()
}

/** Move the wall clock and let the block re-read it, as a resumed page does. */
function moveClockTo(setNow: (value: number) => void, value: number) {
  act(() => {
    setNow(value)
    window.dispatchEvent(new Event('focus'))
  })
}

/**
 * Variable round counts and interval lengths: none of them five rounds or three
 * minutes, and no two the same, so a hardcoded template fails at least one.
 */
const SCHEDULES = [
  { rounds: 4, interval: 150, sequence: [6, 8, 10, 12], companion: 10 },
  { rounds: 7, interval: 45, sequence: [1, 2, 3, 4, 5, 6, 7], companion: 3 },
  { rounds: 3, interval: 240, sequence: [20, 15, 10], companion: 200 },
] as const

function scheduledBlock(schedule: (typeof SCHEDULES)[number]): BlockFixture {
  return {
    structureType: 'emom',
    timerType: 'per_minute',
    repScheme: 'ladder_fixed_interval',
    timerSeconds: schedule.rounds * schedule.interval,
    exercises: [
      sequence('thruster', [...schedule.sequence], { order_index: 0 }),
      {
        prescription: {
          exercise_id: 'burpee',
          target_kind: 'fixed',
          target_value: schedule.companion,
          order_index: 1,
        },
      },
    ],
  }
}

const formatClock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

describe('a scheduled ladder shows every round precomputed — no mental arithmetic', () => {
  it.each(SCHEDULES)(
    '$rounds rounds every $interval s: each round names its start, its rung target and the fixed companion work',
    (schedule) => {
      mountTimed(
        { mode: 'scheduled_starts', rounds: schedule.rounds, interval_seconds: schedule.interval, cap_seconds: null },
        scheduledBlock(schedule),
      )

      expect(
        screen.getByText(`${schedule.rounds} rounds · a new round every ${formatClock(schedule.interval)}`),
      ).toBeInTheDocument()

      const rows = roundRows()
      expect(rows).toHaveLength(schedule.rounds)
      rows.forEach((row, index) => {
        const round = within(row)
        // TASK-012 (C35, R95): each round is a compact tile, R1 onward.
        expect(round.getByText(`R${index + 1}`)).toBeInTheDocument()
        expect(round.getByText(`Round ${index + 1}`)).toHaveClass('a11y-hidden')
        expect(round.getByText(`Starts at ${formatClock(index * schedule.interval)}`)).toBeInTheDocument()
        // The rung target for *this* round, already looked up (R72: ×/·).
        expect(round.getByText(`${schedule.sequence[index]} × thruster`)).toBeInTheDocument()
        // The fixed companion work, stated in full on every round — without
        // the rejected "— same every round" suffix (R70, AC-R012-02).
        expect(round.getByText(`${schedule.companion} × burpee`)).toBeInTheDocument()
        expect(round.queryByText(/same every round/)).not.toBeInTheDocument()
      })
      expectNoSetEntry()
    },
  )

  it('states a per-side rung as per side, in the round it belongs to', () => {
    mountTimed(
      { mode: 'scheduled_starts', rounds: 3, interval_seconds: 90, cap_seconds: null },
      {
        structureType: 'emom',
        repScheme: 'ladder_up',
        timerSeconds: 270,
        exercises: [sequence('lunge', [4, 6, 8], { per_side: true })],
      },
    )

    // TASK-012 (R72): the ×/· notation keeps each side.
    expect(within(roundRows()[1]).getByText('6 × lunge each side')).toBeInTheDocument()
  })
})

describe('a scheduled ladder runs on its own clock, restored from wall-clock time', () => {
  it('marks the live round from the stored start, survives a remount, and records nothing the clock produced', async () => {
    const user = userEvent.setup()
    const storage = memoryStorage()
    let wall = SCHEDULE_START
    const now = () => wall
    const setWall = (value: number) => {
      wall = value
    }
    const schedule = SCHEDULES[0]
    const timing: LadderTiming = {
      mode: 'scheduled_starts',
      rounds: schedule.rounds,
      interval_seconds: schedule.interval,
      cap_seconds: null,
    }

    const first = mountTimed(timing, scheduledBlock(schedule), { storage, now })

    // Ready: the schedule is stated, round 1 is next, one control starts it.
    expect(screen.getByText('NOT STARTED')).toBeInTheDocument()
    expect(within(roundRows()[0]).getByText('Next')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start schedule' }))
    expect(screen.queryByRole('button', { name: 'Start schedule' })).not.toBeInTheDocument()

    // One and a half intervals in: round 2 is live, and the countdown is what
    // is left of its interval.
    moveClockTo(setWall, SCHEDULE_START + schedule.interval * 1500)
    expect(screen.getByText(`ROUND 2 OF ${schedule.rounds}`)).toBeInTheDocument()
    expect(roundRows()[1]).toHaveAttribute('aria-current', 'step')
    expect(roundRows()[0]).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('timer', { name: 'Time remaining' })).toHaveTextContent(
      formatClock(schedule.interval / 2),
    )
    expectNoSetEntry()
    first.unmount()

    // A refresh: the same storage, a later wall clock. The schedule is read
    // back from the stored start, not restarted.
    wall = SCHEDULE_START + (schedule.interval * 3 + 20) * 1000
    const second = mountTimed(timing, scheduledBlock(schedule), { storage, now })
    expect(screen.getByText(`ROUND 4 OF ${schedule.rounds}`)).toBeInTheDocument()
    expect(roundRows()[3]).toHaveAttribute('aria-current', 'step')
    expect(screen.queryByRole('button', { name: 'Start schedule' })).not.toBeInTheDocument()

    // Past the last interval: complete, nothing live, and no rung claimed.
    // TASK-010 (AC-R010-01): a schedule run out starts the log at Incomplete,
    // never at every rung — the clock is not work performed.
    moveClockTo(setWall, SCHEDULE_START + (schedule.rounds * schedule.interval + 5) * 1000)
    expect(screen.getByText('COMPLETE')).toBeInTheDocument()
    for (const row of roundRows()) expect(row).not.toHaveAttribute('aria-current')
    expect(second.reportOutcome).toHaveBeenLastCalledWith(second.block.blockId, {})
    expect(screen.getByRole('radio', { name: 'Incomplete' })).toHaveAttribute('aria-checked', 'true')

    // How far is the athlete's to say, and is what records a rung. TASK-013
    // (C33, C34): on the log's rep-first tile for that round.
    await declare(user, 'Incomplete')
    await user.click(roundTile(`Round 3: ${schedule.sequence[2]} reps`))
    expect(second.reportOutcome).toHaveBeenLastCalledWith(second.block.blockId, { highestRung: 3 })
  })
})

describe('free-paced For Time never infers progress from elapsed time', () => {
  it.each([
    { rounds: 3, rungs: [21, 15, 9], cap: 600 },
    { rounds: 6, rungs: [2, 4, 6, 8, 10, 12], cap: 1500 },
  ])('$rounds rounds: no live round and no schedule, however long passes', async ({ rounds, rungs, cap }) => {
    const storage = memoryStorage()
    let wall = SCHEDULE_START
    const mounted = mountTimed(
      { mode: 'for_time', rounds, interval_seconds: null, cap_seconds: null },
      {
        structureType: 'for_time',
        timerType: 'countdown',
        repScheme: 'ladder_up',
        timerSeconds: cap,
        exercises: [sequence('wall-ball', rungs)],
      },
      { storage, now: () => wall },
    )

    expect(
      screen.getByText(`${rounds} rounds · for time, at your pace · ${formatClock(cap)} cap`),
    ).toBeInTheDocument()
    expect(roundRows()).toHaveLength(rounds)
    roundRows().forEach((row, index) => {
      // TASK-012 (R72): the ×/· notation.
      expect(within(row).getByText(`${rungs[index]} × wall ball`)).toBeInTheDocument()
      expect(within(row).queryByText(/^Starts at/)).not.toBeInTheDocument()
    })

    moveClockTo((value) => {
      wall = value
    }, SCHEDULE_START + cap * 750)
    for (const row of roundRows()) {
      expect(row).not.toHaveAttribute('aria-current')
      expect(within(row).queryByText(/^(Now|Next)$/)).not.toBeInTheDocument()
    }
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    // TASK-006 (AC-R006-01, C18; R66, R67): a For Time ladder offers its own
    // Start in its top slot — superseding "no Start at all". Until it is
    // pressed no clock runs and nothing is stored.
    expect(screen.getAllByRole('button', { name: /start/i }).map((button) => button.textContent)).toEqual(['Start ladder'])
    // TASK-013: the ladder's attempt has its own durable record; nothing is
    // written under either key before Start.
    expect(storage.getItem('clear.workout-for-time')).toBeNull()
    expect(storage.getItem('clear.workout-ladders')).toBeNull()
    expect(mounted.reportOutcome).toHaveBeenLastCalledWith(mounted.block.blockId, {})
    expectNoSetEntry()

    // Once its clock runs, it is still never a schedule: elapsed time marks no
    // round live and records no progress.
    await userEvent.setup().click(screen.getByRole('button', { name: 'Start ladder' }))
    moveClockTo((value) => {
      wall = value
    }, SCHEDULE_START + cap * 1500)
    expect(screen.getByRole('timer', { name: 'Block time' })).toBeInTheDocument()
    for (const row of roundRows()) {
      expect(row).not.toHaveAttribute('aria-current')
      expect(within(row).queryByText(/^(Now|Next)$/)).not.toBeInTheDocument()
      // TASK-013 (C34): the round is the athlete's to check off; time checks none.
      expect(within(row).getByRole('button')).toHaveAttribute('aria-pressed', 'false')
    }
    expect(mounted.reportOutcome).toHaveBeenLastCalledWith(mounted.block.blockId, {})
  })

  it('records progress only once the athlete declares it', async () => {
    const user = userEvent.setup()
    const { block, reportOutcome } = mountTimed(
      { mode: 'for_time', rounds: 4, interval_seconds: null, cap_seconds: null },
      {
        structureType: 'for_time',
        repScheme: 'ladder_down',
        timerSeconds: 720,
        exercises: [sequence('wall-ball', [20, 15, 10, 5])],
      },
    )

    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})
    await declare(user, 'Complete')
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, { highestRung: 4 })
  })
})

describe('a capped window shows its one cap', () => {
  it.each([
    { structureType: 'amrap' as const, rounds: 9, cap: 720 },
    { structureType: 'for_time' as const, rounds: 3, cap: 420 },
  ])('$rounds rounds inside $structureType: the cap is stated, and no round runs on the clock', ({ structureType, rounds, cap }) => {
    const rungs = Array.from({ length: rounds }, (_, index) => (index + 1) * 2)
    mountTimed(
      { mode: 'capped_window', rounds, interval_seconds: null, cap_seconds: cap },
      {
        structureType,
        repScheme: 'ladder_fixed_interval',
        timerSeconds: cap,
        exercises: [
          sequence('kettlebell-swing', rungs, { order_index: 0 }),
          {
            prescription: {
              exercise_id: 'push-up',
              target_kind: 'fixed',
              target_value: 5,
              order_index: 1,
            },
          },
        ],
      },
    )

    expect(
      screen.getByText(`${rounds} rounds · ${formatClock(cap)} cap on the whole ladder`),
    ).toBeInTheDocument()
    const rows = roundRows()
    expect(rows).toHaveLength(rounds)
    const last = within(rows[rounds - 1])
    // TASK-012 (R70, R72; AC-R012-02): the ×/· notation, and the companion's
    // target in every round without "— same every round".
    expect(last.getByText(`${rungs[rounds - 1]} × kettlebell swing`)).toBeInTheDocument()
    expect(last.getByText('5 × push up')).toBeInTheDocument()
    expect(screen.queryByText(/same every round/)).not.toBeInTheDocument()
    // R71: the capped window's "Move through the rounds…" paragraph is gone.
    expect(screen.queryByText(/Move through the rounds/)).not.toBeInTheDocument()
    for (const row of rows) expect(row).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('radio', { name: 'Incomplete' })).toBeInTheDocument()
    expectNoSetEntry()
  })
})

describe('legacy ladders are unchanged by explicit timing', () => {
  it('a ladder with no timing keeps its movement list and draws no rounds', () => {
    mount()

    expect(screen.getByRole('list', { name: 'Movements in this ladder' })).toBeInTheDocument()
    // TASK-012 (C35): every ladder now states its rounds compactly — with no
    // timing, its rounds are its own rungs — but explicit timing still adds
    // nothing here: no timing line, no pacing note and no schedule.
    expect(roundWork()).toHaveLength(5)
    expect(screen.queryByText(/ rounds · /)).not.toBeInTheDocument()
    expect(screen.queryByText(/Start each round|Each round starts on the clock/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Starts at/)).not.toBeInTheDocument()
  })
})
