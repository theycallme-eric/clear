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

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

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
    const { block, reportOutcome } = mount()

    await declare(user, 'Hit the time cap')
    await user.click(screen.getByRole('radio', { name: '9 reps' }))

    // The rung *number*, which is what `block_results.highest_rung` means —
    // rung 3 of the ladder, whose target happens to be 9.
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {
      highestRung: 3,
    })
  })

  it('records the top rung when the ladder was finished', async () => {
    const user = userEvent.setup()
    const { block, reportOutcome } = mount()

    await declare(user, 'Finished the ladder')

    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {
      highestRung: 5,
    })
    // Finishing fills the pattern without turning it into a control.
    expect(screen.getByText('Reached rung 5 of 5 — 3 reps')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Ladder' })).toBeInTheDocument()
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

    await declare(user, 'Hit the time cap')

    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})
  })

  it('forgets the rung when the user changes the ending to finished', async () => {
    const user = userEvent.setup()
    const { block, reportOutcome } = mount()

    await declare(user, 'Hit the time cap')
    await user.click(screen.getByRole('radio', { name: '6 reps' }))
    await declare(user, 'Finished the ladder')

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
    expect(screen.getByRole('heading', { name: 'burpee' })).toBeInTheDocument()
    expect(screen.queryByText('How did this block end?')).not.toBeInTheDocument()

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

    await declare(user, 'Hit the time cap')
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

    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByRole('heading', { name: 'thruster' })).toBeInTheDocument()
    expect(within(rows[1]).getByRole('heading', { name: 'pull up' })).toBeInTheDocument()
    // A ladder tracks no position among its movements, so none is marked live.
    expect(list.querySelector('[aria-current]')).toBeNull()
  })

  it('captions the rungs and the movements with the same group label', () => {
    mount({
      exercises: [
        sequence('thruster', [21, 15, 9]),
        sequence('pull-up', [21, 15, 9]),
      ],
    })

    // The block's own group label carries the frame's label style inline; the
    // rung row's caption carries the same tokens from its co-located CSS.
    const eachRung = screen.getByText('Each rung')
    expect(eachRung.style.color).toBe('var(--text-card-label)')
    expect(eachRung.style.fontSize).toBe('var(--label-xs-size)')

    expect(screen.getByText('Ladder')).toHaveClass('clr-rungs__legend')
    const legend = /\.clr-rungs__legend\s*\{([^}]*)\}/.exec(declarations)?.[1] ?? ''
    expect(legend).toContain('color: var(--text-card-label)')
    expect(legend).toContain('font-size: var(--label-xs-size)')
    expect(legend).toContain('font-family: var(--font-data)')
  })

  it('says it is saved inside the card, below the ending it asks for', () => {
    const { container } = mount({}, { recorded: true })

    const card = container.querySelector('.clr-card') as HTMLElement
    const saved = within(card).getAllByText('Block saved')
    expect(saved).toHaveLength(1)

    const ending = screen.getByRole('group', { name: 'How did this block end?' })
    expect(card).toContainElement(ending)
    expect(
      ending.compareDocumentPosition(saved[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('keeps the rung choice live after the cap is declared, and reports it', async () => {
    const user = userEvent.setup()
    const { block, reportOutcome } = mount()

    await declare(user, 'Hit the time cap')
    await user.click(screen.getByRole('radio', { name: '9 reps' }))

    expect(screen.getByText('Reached rung 3 of 5 — 9 reps')).toBeInTheDocument()

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
        expect(round.getByRole('heading', { name: `Round ${index + 1}` })).toBeInTheDocument()
        expect(round.getByText(`Starts at ${formatClock(index * schedule.interval)}`)).toBeInTheDocument()
        // The rung target for *this* round, already looked up.
        expect(round.getByText(`${schedule.sequence[index]} reps thruster`)).toBeInTheDocument()
        // The fixed companion work, stated in full on every round.
        expect(round.getByText(`${schedule.companion} reps burpee — same every round`)).toBeInTheDocument()
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

    expect(within(roundRows()[1]).getByText('6 reps each side lunge')).toBeInTheDocument()
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
    moveClockTo(setWall, SCHEDULE_START + (schedule.rounds * schedule.interval + 5) * 1000)
    expect(screen.getByText('COMPLETE')).toBeInTheDocument()
    for (const row of roundRows()) expect(row).not.toHaveAttribute('aria-current')
    expect(second.reportOutcome).toHaveBeenLastCalledWith(second.block.blockId, {})

    // Falling behind is the athlete's to say, and is what records a rung.
    await declare(user, 'Fell behind the schedule')
    await user.click(screen.getByRole('radio', { name: `${schedule.sequence[2]} reps` }))
    expect(second.reportOutcome).toHaveBeenLastCalledWith(second.block.blockId, { highestRung: 3 })
  })
})

describe('free-paced For Time never infers progress from elapsed time', () => {
  it.each([
    { rounds: 3, rungs: [21, 15, 9], cap: 600 },
    { rounds: 6, rungs: [2, 4, 6, 8, 10, 12], cap: 1500 },
  ])('$rounds rounds: no live round and no schedule, however long passes', ({ rounds, rungs, cap }) => {
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
      expect(within(row).getByText(`${rungs[index]} reps wall ball`)).toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: /start/i })).not.toBeInTheDocument()
    expect(storage.getItem('clear.workout-for-time')).toBeNull()
    expect(mounted.reportOutcome).toHaveBeenLastCalledWith(mounted.block.blockId, {})
    expectNoSetEntry()
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
    await declare(user, 'Finished the ladder')
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
    expect(last.getByText(`${rungs[rounds - 1]} reps kettlebell swing`)).toBeInTheDocument()
    expect(last.getByText('5 reps push up — same every round')).toBeInTheDocument()
    for (const row of rows) expect(row).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('radio', { name: 'Hit the time cap' })).toBeInTheDocument()
    expectNoSetEntry()
  })
})

describe('legacy ladders are unchanged by explicit timing', () => {
  it('a ladder with no timing keeps its movement list and draws no rounds', () => {
    mount()

    expect(screen.getByRole('list', { name: 'Movements in this ladder' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Rounds in this ladder' })).not.toBeInTheDocument()
  })
})
