/**
 * EXE-04c and REQ-014 (E02) acceptance, as the user meets it:
 *
 *   · the window comes from `workout_blocks.timer_seconds`, and it counts down
 *     with nothing to enter and no round goal while it runs;
 *   · once the window closes the athlete may record rounds and a partial round,
 *     or leave both blank — blank is not a zero, and an entered zero is a zero;
 *   · `rounds_completed`, `partial_round_reps` and the elapsed time reach the
 *     shell's completion write only when entered, including after the clock
 *     ended the block, and a blank result still completes;
 *   · a recorded result is compared like-for-like only where history is
 *     comparable;
 *   · the window and the result survive a refresh and a walk to another
 *     section and back.
 *
 * A3 TASK-116 (F3; TASK-009, C27, C28): TASK-009 supersedes how the result is
 * entered, not what it means. The build replaced four of the cases below with
 * TASK-009 cases (their names cite TASK-009); A3 TASK-116 carries those four
 * here, in place of the base cases they superseded (recorded as superseded in
 * `evidence/refinement/task-116/test-ledger.json`). On Round 7 the AMRAP that
 * `/workout` draws is `TimedWorkoutFlow` (`BlockSlot` under the product
 * presentation), its result in the "Log results" dialog as two framed
 * `QuantitySelector` counts, so the four cases mount the AMRAP that way
 * (`renderRouteAmrap`); every other case here is the base's, over
 * `AmrapBlock`, and is TASK-110's. Blank is still `null`, an entered zero still
 * `0`; tapping down stops at zero and nothing clears a count back to blank.
 */
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import {
  BlockCompletionContext,
  type BlockCompletionApi,
  type BlockOutcome,
} from '../state/block-completion'
import { conditioningSections, type ConditioningSectionRead } from '../state/conditioning'
import type { ConditioningHistoryRow } from '../state/schemas'
import type { BlockProgress } from '../state/workout-progress'
import { sessionProgress } from '../state/workout-progress'
import {
  readAmrapState,
  WORKOUT_AMRAP_STORAGE_KEY,
  type ShellStorage,
} from '../state/workout-persistence'
import { fixtureId, snapshotFixture, type BlockFixture } from '../test/workout-double'
import { AmrapBlock } from './amrap-block'
import { BlockSlot } from './block-renderers'
import { PRODUCT_PRESENTATION } from './product-presentation'
import { WorkoutExperiencePresentationProvider } from './workout-experience-presentation'

/** A moment the window can be measured from, and a clock the test moves. */
const START = Date.parse('2026-09-24T10:00:00.000Z')
let clock = START
const now = () => clock

/** `localStorage`, in memory, so one test cannot see another's score. */
function fakeStorage(): ShellStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  }
}

function amrapBlock(fixture: BlockFixture = {}): BlockProgress {
  const snapshot = snapshotFixture({
    sections: [
      {
        blocks: [
          {
            structureType: 'amrap',
            timerSeconds: 480,
            exercises: ['not_started', 'not_started'],
            ...fixture,
          },
        ],
      },
    ],
  })

  return sessionProgress(snapshot).sections[0]!.blocks[0]!
}

function completionDouble() {
  const reportOutcome = vi.fn<(blockId: string, outcome: BlockOutcome) => void>()
  const api: BlockCompletionApi = { reportOutcome, isBlockRecorded: () => false }
  return { api, reportOutcome }
}

function renderAmrap(
  block: BlockProgress,
  storage: ShellStorage,
  api: BlockCompletionApi,
  conditioningHistory?: readonly ConditioningSectionRead[] | null,
) {
  return render(
    <BlockCompletionContext value={api}>
      <AmrapBlock
        block={block}
        storage={storage}
        now={now}
        conditioningHistory={conditioningHistory}
      />
    </BlockCompletionContext>,
  )
}

/**
 * A3 TASK-116 (TASK-009): the AMRAP as `/workout` draws it — `BlockSlot` under
 * the product presentation, so Round 7's `TimedWorkoutFlow` with its "Log
 * results" dialog — over the same completion seam and the test's clock. A
 * seam that names no session keeps nothing in storage.
 */
function renderRouteAmrap(block: BlockProgress, api: BlockCompletionApi) {
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
  onTestFinished(() => {
    vi.restoreAllMocks()
  })
  return render(
    <WorkoutExperiencePresentationProvider value={PRODUCT_PRESENTATION}>
      <BlockCompletionContext value={api}>
        <BlockSlot block={block} />
      </BlockCompletionContext>
    </WorkoutExperiencePresentationProvider>,
  )
}

/**
 * A3 TASK-108: the route's clock moves to `at`, and the flow re-reads it as a
 * resumed tab does (`useElapsedSeconds` recomputes on focus).
 */
function routeClockAt(at: number) {
  clock = at
  act(() => {
    window.dispatchEvent(new Event('focus'))
  })
}

/** A3 TASK-108: the route's AMRAP window clock — Round 7's TimerFrame, named by its block. */
function routeAmrapTimer(): HTMLElement {
  return screen.getByRole('timer', { name: 'AMRAP time' })
}

/** Its frame: the timer card's body, whose role moves bar, body and emission. */
function routeAmrapFrame(): HTMLElement {
  return routeAmrapTimer().closest('.clr-card__body') as HTMLElement
}

/**
 * TASK-046 (C45; R100): once the window has closed, the card offers one "Log
 * results" action and the result is entered in the shared focused dialog it
 * opens. Opens it, when it is not already open, so the counts can be read.
 */
function openRouteLog() {
  const open = [...document.querySelectorAll('dialog[open]')].some((dialog) => dialog.querySelector('form.clr-timed-log') !== null)
  if (!open) within(document.querySelector<HTMLElement>('.clr-timed-actions')!).getByRole('button', { name: 'Log results' }).click()
}

/** The count a framed selector is showing: `blank` (a dash, not recorded), or its number (TASK-009, C27, C28). */
function routeShown(label: string): string {
  openRouteLog()
  const value = screen.getByRole('group', { name: label }).querySelector('output')!
  if (value.hasAttribute('data-empty')) {
    expect(value).toHaveTextContent(/^—$/)
    expect(value).toHaveAccessibleName(`${label}: not recorded`)
    return 'blank'
  }
  return value.textContent ?? ''
}

/**
 * Records `count` rounds on the framed selector. TASK-009 (C28): there is no
 * Record rounds toggle — the count takes the first tap from blank — so an
 * explicit zero is one round up and one back down.
 */
async function recordRouteRounds(user: ReturnType<typeof userEvent.setup>, count: number) {
  openRouteLog()
  if (count === 0) {
    await user.click(screen.getByRole('button', { name: 'Increase rounds completed' }))
    await user.click(screen.getByRole('button', { name: 'Decrease rounds completed' }))
    return
  }
  for (let round = 0; round < count; round += 1) {
    await user.click(screen.getByRole('button', { name: 'Increase rounds completed' }))
  }
}

/** Records an observed partial round of zero reps (TASK-009, C28: no Partial round toggle). */
async function recordRouteZeroPartial(user: ReturnType<typeof userEvent.setup>) {
  openRouteLog()
  await user.click(screen.getByRole('button', { name: 'Increase reps into the next round' }))
  await user.click(screen.getByRole('button', { name: 'Decrease reps into the next round' }))
}

/** The count the rounds stepper is showing. */
function rounds(): string {
  return within(screen.getByRole('group', { name: 'Rounds completed' }))
    .getByRole('status')
    .textContent ?? ''
}

async function start(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Start AMRAP' }))
}

async function finish(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Finish early' }))
}

/** Opens the optional rounds entry and adds `count` rounds to it. */
async function recordRounds(user: ReturnType<typeof userEvent.setup>, count: number) {
  await user.click(screen.getByRole('button', { name: 'Record rounds' }))
  for (let round = 0; round < count; round += 1) {
    await user.click(screen.getByRole('button', { name: 'Add a completed round' }))
  }
}

/** Nothing on the card asks for a score or names a round goal. */
function expectNoScoreEntry() {
  expect(screen.queryByRole('group', { name: 'Rounds completed' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Record rounds' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Add a completed round' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Partial round' })).not.toBeInTheDocument()
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
  expect(screen.queryByText(/goal|target rounds|expected|predicted/i)).not.toBeInTheDocument()
}

beforeEach(() => {
  clock = START
})

afterEach(() => {
  vi.useRealTimers()
})

describe('what the AMRAP reads from the block', () => {
  it('states the window it prescribes, before it is opened, with no round goal', () => {
    renderAmrap(amrapBlock(), fakeStorage(), completionDouble().api)

    expect(screen.getByText('AMRAP · 8 MIN')).toBeInTheDocument()
    expect(
      screen.getByText('As many rounds as possible in 08:00.'),
    ).toBeInTheDocument()
    // Nothing is counting yet, and nothing is being scored yet either.
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expectNoScoreEntry()
  })

  it('shows no round goal even when the block carries a round count', () => {
    renderAmrap(amrapBlock({ rounds: 5 }), fakeStorage(), completionDouble().api)

    expect(screen.getByText('As many rounds as possible in 08:00.')).toBeInTheDocument()
    expect(screen.queryByText(/\b5 rounds\b/i)).not.toBeInTheDocument()
    expectNoScoreEntry()
  })

  it('names the round when two or more movements make one, per the quickfix', () => {
    renderAmrap(amrapBlock(), fakeStorage(), completionDouble().api)

    expect(screen.getByText('Each round:')).toBeInTheDocument()

    const movements = within(
      screen.getByRole('list', { name: 'Movements in this AMRAP' }),
    ).getAllByRole('listitem')
    expect(movements).toHaveLength(2)
    expect(movements[0]?.textContent).toContain('1. back squat')
  })

  it('leaves the label off a single-movement AMRAP, where the round is obvious', () => {
    renderAmrap(
      amrapBlock({ exercises: ['not_started'] }),
      fakeStorage(),
      completionDouble().api,
    )

    expect(screen.queryByText('Each round:')).not.toBeInTheDocument()
    expect(screen.getByText('1. back squat')).toBeInTheDocument()
  })

  it('says so when every movement in it was swapped out', () => {
    renderAmrap(amrapBlock({ exercises: [] }), fakeStorage(), completionDouble().api)

    expect(screen.getByText(/every movement in it was swapped out/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start AMRAP' })).not.toBeInTheDocument()
  })
})

describe('the window, hands-off', () => {
  it('runs with nothing to enter and no round goal — only the countdown and a way to stop', async () => {
    const user = userEvent.setup()
    renderAmrap(amrapBlock(), fakeStorage(), completionDouble().api)
    await start(user)

    expect(screen.getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('08:00')
    expect(screen.getByRole('button', { name: 'Finish early' })).toBeInTheDocument()
    expect(
      screen.getByText('Nothing to enter now. Record your rounds afterwards if you like.'),
    ).toBeInTheDocument()
    expectNoScoreEntry()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('stays hands-off through the low-time cue', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderAmrap(amrapBlock(), fakeStorage(), completionDouble().api)
    await start(user)

    clock = START + 472_000
    await vi.advanceTimersByTimeAsync(1000)

    expect(screen.getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('00:08')
    expectNoScoreEntry()
  })

  it('reports the running window with no rounds, so nothing is claimed in-window', async () => {
    const user = userEvent.setup()
    const { api, reportOutcome } = completionDouble()
    const block = amrapBlock()
    renderAmrap(block, fakeStorage(), api)
    await start(user)

    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, { elapsedSeconds: 0 })
  })
})

describe('the window closing', () => {
  it('ends on its own when the block’s seconds have passed, and only then offers the result', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderAmrap(amrapBlock(), fakeStorage(), completionDouble().api)

    await start(user)
    expect(screen.getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('08:00')

    // No tap ended it: the clock did, and the card now offers the optional result.
    clock = START + 480_000
    await vi.advanceTimersByTimeAsync(1000)

    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.getByText('AMRAP complete')).toBeInTheDocument()
    expect(screen.getByText('08:00 on the clock')).toBeInTheDocument()
    expect(
      screen.getByText('No rounds recorded. Optional — leave it blank if you like.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record rounds' })).toBeInTheDocument()
  })

  it('shows the elapsed time when the user finishes early, not the cap', async () => {
    const user = userEvent.setup()
    renderAmrap(amrapBlock(), fakeStorage(), completionDouble().api)

    await start(user)
    clock = START + 323_000
    await finish(user)

    expect(screen.getByText('AMRAP complete')).toBeInTheDocument()
    expect(screen.getByText('05:23 on the clock')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record rounds' })).toBeInTheDocument()
  })

  it('never expires on its own when the block prescribes no window', async () => {
    const user = userEvent.setup()
    renderAmrap(
      amrapBlock({ timerSeconds: null }),
      fakeStorage(),
      completionDouble().api,
    )

    expect(screen.getByText(/prescribes no window/i)).toBeInTheDocument()
    await start(user)

    // No countdown to show and no cap to be early of; the user ends it.
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument()
    expectNoScoreEntry()
  })
})

describe('recording rounds afterwards', () => {
  it('counts rounds on the card, with no dialog and no other screen', async () => {
    const user = userEvent.setup()
    renderAmrap(amrapBlock(), fakeStorage(), completionDouble().api)
    await start(user)
    await finish(user)

    await recordRounds(user, 3)

    expect(rounds()).toBe('3')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('takes a round back, and never counts below zero', async () => {
    const user = userEvent.setup()
    renderAmrap(amrapBlock(), fakeStorage(), completionDouble().api)
    await start(user)
    await finish(user)
    await recordRounds(user, 1)

    expect(rounds()).toBe('1')
    await user.click(screen.getByRole('button', { name: 'Take back a round' }))
    expect(rounds()).toBe('0')
    expect(screen.getByRole('button', { name: 'Take back a round' })).toBeDisabled()
  })

  // TASK-009 (C28, R57) supersedes "clearing it goes back to blank": Clear
  // rounds is removed with nothing in its place. Tapping down stops at an
  // explicit zero, which stays a zero — never a blank.
  it('holds an entered zero as a zero, and no control clears it back to blank (TASK-009, C28)', async () => {
    const user = userEvent.setup()
    renderRouteAmrap(amrapBlock(), completionDouble().api)
    await start(user)
    await finish(user)

    await recordRouteRounds(user, 0)
    expect(routeShown('Rounds completed')).toBe('0')
    expect(screen.queryByRole('button', { name: /clear|reset|no partial round/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Decrease rounds completed' }))
    expect(routeShown('Rounds completed')).toBe('0')
  })
})

describe('the partial round', () => {
  it('is asked for after the window and nowhere before it', async () => {
    const user = userEvent.setup()
    renderAmrap(amrapBlock(), fakeStorage(), completionDouble().api)
    await start(user)

    expect(screen.queryByRole('button', { name: 'Partial round' })).not.toBeInTheDocument()

    clock = START + 480_000
    await finish(user)

    expect(screen.getByText('No partial round recorded.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Partial round' })).toBeInTheDocument()
  })

  // TASK-009 (C28, R57) supersedes "it can be given up again": No partial
  // round is removed with nothing in its place. Blank and zero stay distinct.
  it('distinguishes a partial round of zero reps from no partial round at all (TASK-009, C28)', async () => {
    const user = userEvent.setup()
    renderRouteAmrap(amrapBlock(), completionDouble().api)
    await start(user)
    await finish(user)

    // Blank first: nobody has said how far into the next round they were.
    expect(routeShown('Reps into the next round')).toBe('blank')

    // A real zero — the buzzer landed on the boundary (DATA-01d).
    await recordRouteZeroPartial(user)
    expect(routeShown('Reps into the next round')).toBe('0')
    expect(screen.queryByRole('button', { name: 'No partial round' })).not.toBeInTheDocument()
  })

  it('counts the reps up and down without leaving the card', async () => {
    const user = userEvent.setup()
    renderAmrap(amrapBlock(), fakeStorage(), completionDouble().api)
    await start(user)
    await finish(user)
    await user.click(screen.getByRole('button', { name: 'Partial round' }))

    await user.click(screen.getByRole('button', { name: 'One more rep in the partial round' }))
    await user.click(screen.getByRole('button', { name: 'One more rep in the partial round' }))
    await user.click(screen.getByRole('button', { name: 'One rep fewer in the partial round' }))

    const reps = screen.getByRole('group', { name: 'Reps into the next round' })
    expect(within(reps).getByRole('status')).toHaveTextContent('1')
  })
})

describe('what it supplies to the shell', () => {
  it('sends the result, partial round included, entered after the clock ended the block', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { api, reportOutcome } = completionDouble()
    const block = amrapBlock()
    renderAmrap(block, fakeStorage(), api)

    await start(user)
    clock = START + 480_000
    await vi.advanceTimersByTimeAsync(1000)

    await recordRounds(user, 5)
    await user.click(screen.getByRole('button', { name: 'Partial round' }))
    for (let rep = 0; rep < 8; rep += 1) {
      await user.click(
        screen.getByRole('button', { name: 'One more rep in the partial round' }),
      )
    }

    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {
      elapsedSeconds: 480,
      roundsCompleted: 5,
      partialRoundReps: 8,
    })
  })

  it('supplies blank rounds and partial round as absent, so the row holds null', async () => {
    const user = userEvent.setup()
    const { api, reportOutcome } = completionDouble()
    const block = amrapBlock()
    renderAmrap(block, fakeStorage(), api)

    await start(user)
    clock = START + 300_000
    await finish(user)

    // No `roundsCompleted` and no `partialRoundReps`: the columns hold null,
    // never a zero nobody entered — and completion is not blocked by it.
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, { elapsedSeconds: 300 })
  })

  it('supplies an entered zero as a zero', async () => {
    const user = userEvent.setup()
    const { api, reportOutcome } = completionDouble()
    const block = amrapBlock()
    renderAmrap(block, fakeStorage(), api)

    await start(user)
    clock = START + 300_000
    await finish(user)
    await recordRounds(user, 0)
    await user.click(screen.getByRole('button', { name: 'Partial round' }))

    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {
      elapsedSeconds: 300,
      roundsCompleted: 0,
      partialRoundReps: 0,
    })
  })

  // TASK-009 (C28, R57) supersedes "reports a cleared result as blank again":
  // nothing clears a count now. A result tapped back down reports the zero it
  // shows, and the untouched partial round is still reported as absent.
  it('reports a result tapped back down as an explicit zero, never as blank again (TASK-009, C28)', async () => {
    const user = userEvent.setup()
    const { api, reportOutcome } = completionDouble()
    const block = amrapBlock()
    renderRouteAmrap(block, api)

    await start(user)
    clock = START + 300_000
    await finish(user)
    await recordRouteRounds(user, 2)
    await user.click(screen.getByRole('button', { name: 'Decrease rounds completed' }))
    await user.click(screen.getByRole('button', { name: 'Decrease rounds completed' }))

    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {
      elapsedSeconds: 300,
      roundsCompleted: 0,
    })
  })

  it('supplies nothing at all for an AMRAP that was never started', () => {
    const { api, reportOutcome } = completionDouble()
    const block = amrapBlock()
    renderAmrap(block, fakeStorage(), api)

    // Nothing ran, so nothing was observed — not even a zero (DATA_MODEL §8).
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})
  })

  it('supplies no score at all for an AMRAP with nothing to perform', () => {
    const { api, reportOutcome } = completionDouble()
    const block = amrapBlock({ exercises: [] })
    renderAmrap(block, fakeStorage(), api)

    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})
  })
})

describe('the like-for-like comparison after the window', () => {
  /** An earlier attempt at the same block, as `conditioning_history` answers it. */
  function earlier(
    block: BlockProgress,
    overrides: Partial<ConditioningHistoryRow> = {},
  ): ConditioningHistoryRow {
    return {
      session_id: fixtureId('9', 1),
      session_date: '2026-09-20',
      effective_intensity: 7,
      goal_preset: null,
      section_id: fixtureId('9', 2),
      section_order: 0,
      block_id: fixtureId('9', 3),
      block_order: 0,
      structure_type: block.structureType,
      rep_scheme: block.repScheme,
      timer_type: block.timerType,
      timer_seconds: block.timerSeconds,
      rounds: block.rounds,
      round_rest_seconds: block.roundRestSeconds,
      elapsed_seconds: 480,
      completed_under_cap: null,
      rounds_completed: 2,
      partial_round_reps: null,
      minutes_completed: null,
      highest_rung: null,
      perceived_effort: null,
      scored_at: '2026-09-20T10:30:00.000Z',
      prescriptions: block.exercises.map((exercise) => exercise.prescription),
      ...overrides,
    }
  }

  async function closedWith(
    history: readonly ConditioningSectionRead[] | null,
    entered: number | null,
  ) {
    const user = userEvent.setup()
    const block = amrapBlock()
    renderAmrap(block, fakeStorage(), completionDouble().api, history)
    await start(user)
    clock = START + 480_000
    await finish(user)
    if (entered !== null) await recordRounds(user, entered)
    return block
  }

  it('compares an entered result against an identical earlier attempt', async () => {
    const block = amrapBlock()
    // 48 reps a round: 3 rounds in 8 minutes is 18 reps/min; 2 rounds was 12.
    await closedWith(conditioningSections([earlier(block)]), 3)

    expect(screen.getByText('Score: 18 reps/min')).toBeInTheDocument()
    expect(
      screen.getByText('Previous best 12 reps/min · Ahead of your previous best'),
    ).toBeInTheDocument()
  })

  it('shows no score and no comparison while the result is blank', async () => {
    const block = amrapBlock()
    await closedWith(conditioningSections([earlier(block)]), null)

    expect(screen.queryByText(/^Score:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/previous best/i)).not.toBeInTheDocument()
  })

  it('never compares against a different piece, and says so', async () => {
    const block = amrapBlock()
    await closedWith(conditioningSections([earlier(block, { timer_seconds: 720 })]), 3)

    expect(screen.getByText('Score: 18 reps/min')).toBeInTheDocument()
    expect(screen.queryByText(/previous best/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Nothing like-for-like to compare/)).toBeInTheDocument()
  })

  it('claims nothing about history it does not have', async () => {
    await closedWith(null, 3)

    expect(screen.getByText('Score: 18 reps/min')).toBeInTheDocument()
    expect(screen.queryByText(/previous best|first attempt|like-for-like/i)).not.toBeInTheDocument()
  })

  it('renders the score alone outside a signed-in shell', async () => {
    const user = userEvent.setup()
    renderAmrap(amrapBlock(), fakeStorage(), completionDouble().api)
    await start(user)
    await finish(user)
    await recordRounds(user, 3)

    expect(screen.getByText(/^Score:/)).toBeInTheDocument()
    expect(screen.queryByText(/previous best|first attempt|like-for-like/i)).not.toBeInTheDocument()
  })
})

describe('the 0.14.3 card, timer and group grammar', () => {
  /** An AMRAP already `elapsedMs` into its window, as a refresh would find it. */
  async function resumeAt(elapsedMs: number, api = completionDouble().api) {
    const user = userEvent.setup()
    const storage = fakeStorage()
    const block = amrapBlock()
    clock = START
    const first = renderAmrap(block, storage, api)
    await start(user)
    first.unmount()

    clock = START + elapsedMs
    return { user, block, ...renderAmrap(block, storage, api) }
  }

  // A3 TASK-108 (round-07 R7-2; TASK-007: C19, R49): ported onto the AMRAP
  // `/workout` draws (`renderRouteAmrap`), whose countdown is one whole Round 7
  // TimerFrame — the app's Card in the timer role — beside the block's card.
  it('stands the countdown beside the block’s card, never inside one', async () => {
    const user = userEvent.setup()
    const { container } = renderRouteAmrap(amrapBlock(), completionDouble().api)
    await start(user)
    routeClockAt(START + 60_000)

    const timer = routeAmrapTimer()
    const timerCard = timer.closest('.clr-card')
    expect(timerCard).not.toBeNull()
    expect(timerCard?.parentElement?.closest('.clr-card')).toBeNull()
    expect(timerCard?.querySelectorAll('.clr-card__bar')).toHaveLength(1)
    expect(timer.querySelectorAll('.clr-chamfer, .clr-card__bar')).toHaveLength(0)

    // One timer card and one block card, and no card within either.
    expect(container.querySelectorAll('.clr-card')).toHaveLength(2)
    expect(container.querySelector('.clr-card .clr-card')).toBeNull()

    // The controls stay with the block, in its card rather than the timer's frame.
    const finishButton = screen.getByRole('button', { name: 'Finish early' })
    expect(finishButton.closest('.clr-card')).not.toBe(timerCard)
    expect(timerCard).not.toContainElement(finishButton)
  })

  it('keeps the countdown a labelled timer that is not a live region', async () => {
    await resumeAt(60_000)

    const timer = screen.getByRole('timer', { name: 'Time remaining' })
    expect(timer).toHaveTextContent('07:00')
    for (let node: Element | null = timer; node !== null; node = node.parentElement) {
      expect(node).not.toHaveAttribute('aria-live')
    }
  })

  // TASK-008 (C22, C23, C61) supersedes "the timer's own low state": the
  // colour at ten seconds, the breathe and one edge in the last five, and no
  // stepped micro-pulse. A3 TASK-108 (round-07 R7-2): ported onto the AMRAP
  // `/workout` draws (`renderRouteAmrap`).
  it('leaves urgency to the timer’s own shared warning, with nothing added around it', async () => {
    const user = userEvent.setup()
    const { container } = renderRouteAmrap(amrapBlock(), completionDouble().api)
    await start(user)

    routeClockAt(START + 60_000)
    expect(routeAmrapFrame()).toHaveClass('clr-chamfer--timer')
    expect(routeAmrapTimer()).not.toHaveAttribute('data-urgent')

    routeClockAt(START + 472_000)
    expect(routeAmrapTimer()).toHaveTextContent('00:08')
    expect(routeAmrapFrame()).toHaveClass('clr-chamfer--timer-low')
    // The colour alone at eight seconds: no stepped pulse, nothing breathing.
    expect(container.querySelectorAll('.clr-pulse-micro')).toHaveLength(0)
    expect(container.querySelector('.clr-countdown-breathe, [data-loop="run"]')).toBeNull()
    expect(document.querySelectorAll('[data-countdown-edge]')).toHaveLength(0)

    routeClockAt(START + 476_000)
    const urgent = routeAmrapTimer()
    expect(urgent).toHaveTextContent('00:04')
    // The timer is the only thing that breathes on the block, with one aura.
    expect(urgent).toHaveAttribute('data-urgent', 'true')
    expect([...container.querySelectorAll('.clr-countdown-breathe')]).toEqual([urgent])
    expect([...container.querySelectorAll('[data-loop="run"]')]).toEqual([urgent])
    expect(container.querySelectorAll('.clr-pulse-micro')).toHaveLength(0)
    expect(document.querySelectorAll('[data-countdown-edge]')).toHaveLength(1)

    // Urgent, and still nothing to enter.
    expectNoScoreEntry()
  })

  it('labels each group inside the card it belongs to', async () => {
    const { user } = await resumeAt(60_000)
    await finish(user)
    await recordRounds(user, 1)
    await user.click(screen.getByRole('button', { name: 'Partial round' }))

    const card = screen.getByRole('button', { name: 'Take back a round' }).closest('.clr-card')
    expect(card).not.toBeNull()

    for (const label of ['Rounds completed', 'Reps into the next round', 'Each round:']) {
      const heading = screen.getByRole('heading', { name: label })
      expect(heading.closest('.clr-card')).toBe(card)
    }
    for (const name of ['Rounds completed', 'Reps into the next round']) {
      expect(screen.getByRole('group', { name }).closest('.clr-card')).toBe(card)
    }
    expect(
      screen.getByRole('list', { name: 'Movements in this AMRAP' }).closest('.clr-card'),
    ).toBe(card)
  })

  it('draws the settled time as the shared bare readout, and says when the cap ended it', async () => {
    await resumeAt(600_000)

    const readout = screen.getByText('AMRAP complete').closest('.clr-metric-frame')
    expect(readout).not.toBeNull()
    // Inside a card the readout takes no frame of its own.
    expect(readout).not.toHaveClass('clr-chamfer')
    expect(within(readout as HTMLElement).getByText('08:00 on the clock')).toBeInTheDocument()
    expect(within(readout as HTMLElement).getByText('Cap reached')).toBeInTheDocument()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })

  it('does not call an early finish a cap', async () => {
    const { user } = await resumeAt(323_000)
    await finish(user)

    expect(screen.getByText('05:23 on the clock')).toBeInTheDocument()
    expect(screen.queryByText('Cap reached')).not.toBeInTheDocument()
  })

  // TASK-009 (C27, C28; R56, R57, R79) supersedes the optional result's
  // frameless text-action toggles: each count is one framed selector with
  // framed minus and plus actions, and no text action remains.
  it('draws the optional result as framed counts with framed actions, and no text action remains (TASK-009, C27, C28)', async () => {
    const user = userEvent.setup()
    clock = START
    const { container } = renderRouteAmrap(amrapBlock(), completionDouble().api)
    await start(user)
    clock = START + 60_000
    await finish(user)
    openRouteLog()

    for (const name of ['Rounds completed', 'Reps into the next round']) {
      const frame = screen.getByRole('group', { name })
      expect(frame).toHaveClass('clr-quantity', 'clr-chamfer')
      for (const action of within(frame).getAllByRole('button')) {
        expect(action).toHaveClass('clr-btn', 'clr-chamfer')
        expect(action).not.toHaveClass('clr-text-action')
      }
    }
    expect(container.querySelectorAll('.clr-text-action')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /record rounds|partial round|clear rounds/i })).not.toBeInTheDocument()
  })

  it('says a saved block is saved, and still shows the result for editing', async () => {
    const reportOutcome = vi.fn<(blockId: string, outcome: BlockOutcome) => void>()
    const { user } = await resumeAt(600_000, { reportOutcome, isBlockRecorded: () => true })

    expect(screen.getByText('Block saved')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Complete/ })).not.toBeInTheDocument()
    expect(screen.getByText('08:00 on the clock')).toBeInTheDocument()

    await recordRounds(user, 1)
    expect(rounds()).toBe('1')
  })

  it('says a block with nothing to perform in plain copy inside the one card', () => {
    const { container } = renderAmrap(
      amrapBlock({ exercises: [] }),
      fakeStorage(),
      completionDouble().api,
    )

    const message = screen.getByText(/every movement in it was swapped out/i)
    expect(container.querySelectorAll('.clr-card')).toHaveLength(1)
    expect(message.closest('.clr-card')).not.toBeNull()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })

  it('recovers from an unusable stored record without a timer or a score', () => {
    const storage = fakeStorage()
    storage.setItem(WORKOUT_AMRAP_STORAGE_KEY, 'not json')
    const { container } = renderAmrap(amrapBlock(), storage, completionDouble().api)

    expect(screen.getByRole('button', { name: 'Start AMRAP' })).toBeEnabled()
    expect(container.querySelectorAll('.clr-card')).toHaveLength(1)
    expect(screen.queryByText('AMRAP complete')).not.toBeInTheDocument()
  })
})

describe('surviving a refresh', () => {
  it('comes back to the window that is left, with nothing recorded in it', async () => {
    const user = userEvent.setup()
    const storage = fakeStorage()
    const block = amrapBlock()
    const first = renderAmrap(block, storage, completionDouble().api)

    await start(user)

    expect(readAmrapState(storage, block.blockId)).toEqual({
      startedAt: '2026-09-24T10:00:00.000Z',
      endedAtSeconds: null,
      roundsCompleted: null,
      partialRoundReps: null,
    })

    // The refresh: the tree is gone, the storage is not.
    first.unmount()
    clock = START + 180_000
    renderAmrap(block, storage, completionDouble().api)

    // Five of the eight minutes are left: the window was measured from when it
    // opened, not from when the page came back.
    expect(screen.getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('05:00')
    expectNoScoreEntry()
  })

  it('comes back into the completion state when the buzzer went while it was away', async () => {
    const user = userEvent.setup()
    const storage = fakeStorage()
    const block = amrapBlock()
    const first = renderAmrap(block, storage, completionDouble().api)

    await start(user)
    first.unmount()

    clock = START + 600_000
    renderAmrap(block, storage, completionDouble().api)

    // Expiry is derived from the clock, so nothing had to be running for it.
    expect(screen.getByText('AMRAP complete')).toBeInTheDocument()
    expect(screen.getByText('08:00 on the clock')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record rounds' })).toBeInTheDocument()
  })

  it('keeps the post-window result it was holding, zero included', async () => {
    const user = userEvent.setup()
    const storage = fakeStorage()
    const block = amrapBlock()
    const first = renderAmrap(block, storage, completionDouble().api)

    await start(user)
    await finish(user)
    await recordRounds(user, 0)
    await user.click(screen.getByRole('button', { name: 'Partial round' }))
    first.unmount()

    const { api, reportOutcome } = completionDouble()
    renderAmrap(block, storage, api)

    expect(rounds()).toBe('0')
    const reps = screen.getByRole('group', { name: 'Reps into the next round' })
    expect(within(reps).getByRole('status')).toHaveTextContent('0')
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {
      elapsedSeconds: 0,
      roundsCompleted: 0,
      partialRoundReps: 0,
    })
  })

  it('restores an edit made after the window as the edit, not the first entry', async () => {
    const user = userEvent.setup()
    const storage = fakeStorage()
    const block = amrapBlock()
    const first = renderAmrap(block, storage, completionDouble().api)

    await start(user)
    clock = START + 480_000
    await finish(user)
    await recordRounds(user, 4)
    await user.click(screen.getByRole('button', { name: 'Take back a round' }))
    first.unmount()

    renderAmrap(block, storage, completionDouble().api)
    expect(rounds()).toBe('3')
    expect(readAmrapState(storage, block.blockId)?.roundsCompleted).toBe(3)
  })

  it('restores a stored record from before rounds became optional', () => {
    const storage = fakeStorage()
    const block = amrapBlock()
    storage.setItem(
      WORKOUT_AMRAP_STORAGE_KEY,
      JSON.stringify({
        [block.blockId]: {
          startedAt: '2026-09-24T10:00:00.000Z',
          endedAtSeconds: 300,
          roundsCompleted: 2,
          partialRoundReps: null,
        },
      }),
    )

    renderAmrap(block, storage, completionDouble().api)
    expect(rounds()).toBe('2')
  })

  it('starts from the top when the stored record cannot be used', () => {
    const storage = fakeStorage()
    storage.setItem(WORKOUT_AMRAP_STORAGE_KEY, 'not json')

    renderAmrap(amrapBlock(), storage, completionDouble().api)

    expect(screen.getByRole('button', { name: 'Start AMRAP' })).toBeInTheDocument()
  })

  it('cannot log a window longer than a cap that has since been shortened', async () => {
    const user = userEvent.setup()
    const storage = fakeStorage()
    const block = amrapBlock()
    const first = renderAmrap(block, storage, completionDouble().api)

    await start(user)
    clock = START + 400_000
    await finish(user)
    first.unmount()

    const { api, reportOutcome } = completionDouble()
    const shortened: BlockProgress = { ...block, timerSeconds: 240 }
    renderAmrap(shortened, storage, api)

    expect(screen.getByText('04:00 on the clock')).toBeInTheDocument()
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, { elapsedSeconds: 240 })
  })
})
