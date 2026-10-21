/**
 * EXE-03 acceptance for the EMOM renderer, read off the screen:
 *
 *   · timer type and seconds come from `workout_blocks`, and the minute
 *     boundary visibly changes which movement is active work;
 *   · an alternating EMOM labels `ODD MIN` / `EVEN MIN` per
 *     `emom-clarity.md` §3;
 *   · the timed state survives a refresh, and completion supplies
 *     `minutes_completed` to the shell.
 *
 * The clock is injected and time is moved by hand rather than waited for, which
 * is the same property `emom.test.ts` asserts on the arithmetic: the tab is
 * *backgrounded* between two readings, so a renderer that counted ticks would
 * fail here as it does in the wild. A refresh is a fresh mount over the same
 * storage, because that is what a refresh is.
 *
 * And the 0.14.3 composition of the same block: it draws with the shared
 * `BlockPanel` frame, the countdown is its own card beside the block's and never
 * inside it, and a minute running out is the shipped low state — the stepped
 * `--dur-alert` crossing and the 80% pulse, as the view's one loop, still under
 * reduced motion with nothing it was saying lost.
 *
 * `EmomBlock` is mounted directly rather than through `BlockSlot` — the
 * dispatch is `block-renderers.test.tsx`'s subject, and the injected clock and
 * storage are what these assertions are about.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { ReactNode } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'

import {
  BlockCompletionContext,
  type BlockCompletionApi,
  type BlockOutcome,
} from '../state/block-completion'
import { EMOM_START, type EmomState } from '../state/emom'
import { SetLoggingProvider } from '../state/set-logging-provider'
import { writeEmomState, type ShellStorage } from '../state/workout-persistence'
import { sessionProgress, type BlockProgress } from '../state/workout-progress'
import { AppProviders } from '../test/render'
import {
  createWorkoutDouble,
  FIXTURE_SESSION_ID,
  snapshotFixture,
  type BlockFixture,
  type ExerciseFixture,
} from '../test/workout-double'
import { EmomBlock } from './emom-block'
import { LoadingView } from './view-state'

// jsdom applies no stylesheet, so motion is proved as classes, attributes and
// the rule text the classes resolve to.
const MOTION_CSS = readFileSync(
  resolve(import.meta.dirname, '../design-system/css/motion.css'),
  'utf-8',
)
const APP_MOTION_CSS = readFileSync(
  resolve(import.meta.dirname, '../styles/app-motion.css'),
  'utf-8',
)

afterEach(() => vi.restoreAllMocks())

function reduceMotion(reduced: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: reduced && query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  )
}

/** The id the double would mint for a logged set; no test here logs one. */
const MINTED = 'a0000001-0000-4000-8000-000000000000'

/** The moment every mount below starts from. */
const NOW = Date.parse('2026-09-24T09:00:00.000Z')


/** An in-memory `Storage` that holds whatever key it is given. */
function mapStorage(): ShellStorage {
  const entries = new Map<string, string>()
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value)
    },
    removeItem: (key) => {
      entries.delete(key)
    },
  }
}

/** The alternating pair of `emom-clarity.md`: odd minutes hollow, even V-ups. */
const PAIR: ExerciseFixture[] = [
  { prescription: { exercise_id: 'hollow-body-hold', order_index: 0 } },
  { prescription: { exercise_id: 'v-up', order_index: 1 } },
]

interface Mounted {
  readonly block: BlockProgress
  readonly storage: ShellStorage
  readonly reportOutcome: Mock<(blockId: string, outcome: BlockOutcome) => void>
  /** Time passes without the tab being watched, then one repaint happens. */
  advance(seconds: number): void
  /** A refresh: the same storage, a new mount, the clock where it now is. */
  refresh(): void
}

function mount(
  options: {
    block?: BlockFixture
    /** What a previous visit left behind for this block. */
    stored?: EmomState
    /** Something else in view with the block — a wait that owns a loop. */
    beside?: ReactNode
  } = {},
): Mounted {
  const snapshot = snapshotFixture({
    sections: [
      {
        title: 'Conditioning',
        sectionType: 'conditioning',
        blocks: [
          {
            structureType: 'emom',
            timerType: 'per_minute',
            timerSeconds: 600,
            exercises: PAIR,
            ...options.block,
          },
        ],
      },
    ],
  })
  const workout = createWorkoutDouble({ session: snapshot })
  const block = sessionProgress(snapshot).sections[0].blocks[0]

  const storage = mapStorage()
  if (options.stored !== undefined) {
    writeEmomState(storage, block.blockId, options.stored)
  }

  const reportOutcome = vi.fn<(blockId: string, outcome: BlockOutcome) => void>()
  const completion: BlockCompletionApi = {
    reportOutcome,
    isBlockRecorded: () => false,
  }

  let current = NOW
  const tree = (
    <AppProviders workout={workout.clients}>
      <BlockCompletionContext value={completion}>
        <SetLoggingProvider
          sessionId={FIXTURE_SESSION_ID}
          storage={null}
          exercises={block.exercises}
          weightUnit="kg"
          onFailure={() => {}}
          newId={() => MINTED}
        >
          {options.beside}
          <EmomBlock block={block} storage={storage} now={() => current} />
        </SetLoggingProvider>
      </BlockCompletionContext>
    </AppProviders>
  )

  let view = render(tree)

  return {
    block,
    storage,
    reportOutcome,
    advance: (seconds) => {
      current += seconds * 1000
      // The tab comes back to the foreground, which is one of the three events
      // `useElapsedSeconds` recomputes on — and recomputing is all a repaint
      // does, because nothing was accumulated while the tab was away.
      act(() => {
        window.dispatchEvent(new Event('focus'))
      })
    },
    refresh: () => {
      // The tab really goes away and comes back: nothing in React survives it,
      // and the only thing carried over is the storage and the wall clock.
      view.unmount()
      view = render(tree)
    },
  }
}

function setup() {
  return userEvent.setup()
}

/** The list item for one movement, so two movements' labels never collide. */
function movement(name: string) {
  const heading = screen.getByRole('heading', { name })
  const item = heading.closest('li')
  if (item === null) throw new Error(`${name} is not in the movement list`)
  return within(item)
}

/**
 * Every movement carrying the live marker, by the word it carries — the shared
 * frame's `Now` / `Next`, which the label style sets in capitals.
 */
function marked(word: string): string[] {
  return screen
    .getAllByRole('listitem')
    .filter((item) => item.textContent?.includes(word) === true)
    .map((item) => item.querySelector('h1, h2, h3, h4, h5, h6')?.textContent ?? '')
}

/** The countdown's readout: the shipped timer's own labelled frame. */
function timer(): HTMLElement {
  return screen.getByRole('timer')
}

/** The decorative digits: the timer's first child. */
function digits(): HTMLElement {
  return timer().firstElementChild as HTMLElement
}

/** What owns the countdown's loop, and says whether the minute is running out. */
function countdown(): HTMLElement {
  return timer().closest('[data-loop]') as HTMLElement
}

/** Every card frame in the document, and the ones that sit inside another. */
function cards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.clr-card'))
}

function nestedCards(): HTMLElement[] {
  return cards().filter((card) => card.parentElement?.closest('.clr-card') != null)
}

describe('the EMOM runs the clock the block prescribes', () => {
  it('keeps the timer in its own single frame without remounting the movement list', async () => {
    const user = setup()
    const mounted = mount()
    const movementList = screen.getByRole('list', { name: 'Movements in this EMOM' })

    expect(screen.queryByRole('timer')).not.toBeInTheDocument()

    const expectSingleTimerFrame = (seconds: string) => {
      const timer = screen.getByRole('timer')
      const frame = timer.closest('.clr-card')
      expect(frame).not.toBeNull()
      expect(frame?.parentElement?.closest('.clr-card')).toBeNull()
      expect(within(timer).getByText(seconds)).toBeInTheDocument()
      expect(screen.getByRole('list', { name: 'Movements in this EMOM' })).toBe(movementList)
    }

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    expectSingleTimerFrame('01:00')

    mounted.advance(20)
    await user.click(screen.getByRole('button', { name: 'Minute done' }))
    expect(screen.getByText('REST')).toBeInTheDocument()
    expectSingleTimerFrame('00:40')

    mounted.advance(580)
    expect(screen.getByText('COMPLETE')).toBeInTheDocument()
    expectSingleTimerFrame('00:00')
  })

  it('states the window from timer_seconds once the clock is started', async () => {
    const user = setup()
    mount()

    // Not started: the block says what it is, and offers the one way in.
    expect(screen.getByText('NOT STARTED')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))

    expect(screen.getByText('MIN 1 OF 10')).toBeInTheDocument()
    expect(screen.getByText('WORK')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toBeInTheDocument()
  })

  it('counts the minutes off a block whose window is a different length', async () => {
    const user = setup()
    const mounted = mount({ block: { timerSeconds: 240 } })

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    mounted.advance(120)

    expect(screen.getByText('MIN 3 OF 4')).toBeInTheDocument()
  })

  it('runs no grid at all for a block whose timer type is none', () => {
    mount({ block: { timerType: 'none' } })

    expect(
      screen.getByText(/This block prescribes no clock/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.queryByText(/^MIN /)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start EMOM' })).not.toBeInTheDocument()
  })

  it('counts on without a last minute when the block carries no window', async () => {
    const user = setup()
    const mounted = mount({ block: { timerSeconds: null } })

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    mounted.advance(180)

    expect(screen.getByText('MIN 4')).toBeInTheDocument()
  })
})

describe('the minute boundary flips the active work', () => {
  it('moves the live movement on the boundary, with no tap', async () => {
    const user = setup()
    const mounted = mount()

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    expect(marked('Now')).toEqual(['1. hollow body hold'])
    expect(movement('1. hollow body hold').getByText('Now')).toBeInTheDocument()

    // The phone was in a pocket for the rest of minute one.
    mounted.advance(60)

    expect(screen.getByText('MIN 2 OF 10')).toBeInTheDocument()
    expect(marked('Now')).toEqual(['2. v up'])
    expect(screen.getByText('WORK')).toBeInTheDocument()
  })

  it('reads the remainder of the minute as rest once the work is done', async () => {
    const user = setup()
    const mounted = mount()

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    mounted.advance(20)
    await user.click(screen.getByRole('button', { name: 'Minute done' }))

    expect(screen.getByText('REST')).toBeInTheDocument()
    // Resting, so the card names what is coming rather than telling the user to
    // start: colour is never the only cue, and neither is the word.
    expect(marked('Next')).toEqual(['2. v up'])
    expect(screen.queryByRole('button', { name: 'Minute done' })).not.toBeInTheDocument()

    // And the next boundary puts the work back without anything being pressed.
    mounted.advance(40)

    expect(screen.getByText('WORK')).toBeInTheDocument()
    expect(marked('Now')).toEqual(['2. v up'])
  })

  it('rests for the window the block prescribes at the end of every minute', async () => {
    const user = setup()
    const mounted = mount({ block: { roundRestSeconds: 15 } })

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    // Stated once, as the block's rest rather than each movement's.
    expect(screen.getByText('15s rest at the end of each minute')).toBeInTheDocument()

    mounted.advance(44)
    expect(screen.getByText('WORK')).toBeInTheDocument()

    mounted.advance(1)
    expect(screen.getByText('REST')).toBeInTheDocument()

    mounted.advance(15)
    expect(screen.getByText('WORK')).toBeInTheDocument()
    expect(screen.getByText('MIN 2 OF 10')).toBeInTheDocument()
  })

  it('says the block is done once its last minute has elapsed', async () => {
    const user = setup()
    const mounted = mount({ block: { timerSeconds: 120 } })

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    mounted.advance(120)

    expect(screen.getByText('COMPLETE')).toBeInTheDocument()
    expect(screen.getByText(/Every prescribed minute is done/)).toBeInTheDocument()
    expect(marked('Now')).toEqual([])
    expect(screen.queryByRole('button', { name: 'Minute done' })).not.toBeInTheDocument()
  })

  it('marks the live movement for a screen reader, not only in colour', async () => {
    const user = setup()
    mount()

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))

    const items = screen.getAllByRole('listitem')
    expect(items.map((item) => item.getAttribute('aria-current'))).toEqual(['step', null])
  })
})

describe('an alternating EMOM says which minutes each movement covers', () => {
  it('labels two movements ODD MIN and EVEN MIN', () => {
    mount()

    expect(movement('1. hollow body hold').getByText('ODD MIN')).toBeInTheDocument()
    expect(movement('2. v up').getByText('EVEN MIN')).toBeInTheDocument()
  })

  it('keeps the labels while the clock runs, in every phase', async () => {
    const user = setup()
    const mounted = mount()

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    mounted.advance(90)

    expect(movement('1. hollow body hold').getByText('ODD MIN')).toBeInTheDocument()
    expect(movement('2. v up').getByText('EVEN MIN')).toBeInTheDocument()
  })

  it('names the minutes of a rotation of three or more', () => {
    mount({
      block: {
        timerSeconds: 720,
        exercises: [
          ...PAIR,
          { prescription: { exercise_id: 'plank', order_index: 2 } },
        ],
      },
    })

    expect(movement('1. hollow body hold').getByText('MIN 1, 4, 7…')).toBeInTheDocument()
    expect(movement('2. v up').getByText('MIN 2, 5, 8…')).toBeInTheDocument()
    expect(movement('3. plank').getByText('MIN 3, 6, 9…')).toBeInTheDocument()
  })

  it('labels nothing on a single-movement EMOM', () => {
    // Every minute is the same movement; a label would say nothing.
    mount({ block: { exercises: [PAIR[0]] } })

    // Looked for inside the movement's own row: the structure badge above says
    // `EMOM · 10 MIN`, which is the window rather than an assignment.
    expect(movement('1. hollow body hold').queryByText(/MIN/)).not.toBeInTheDocument()
    expect(screen.queryByText('ODD MIN')).not.toBeInTheDocument()
  })

  it('assigns no minutes when the block prescribes no clock', () => {
    mount({ block: { timerType: 'none' } })

    expect(screen.queryByText('ODD MIN')).not.toBeInTheDocument()
  })
})

describe('the timed state survives a refresh', () => {
  it('comes back to the minute the clock is actually in', async () => {
    const user = setup()
    const mounted = mount()

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    mounted.advance(220)
    expect(screen.getByText('MIN 4 OF 10')).toBeInTheDocument()

    mounted.refresh()

    // Not minute one, and not a clock that restarted: the stored timestamp is
    // read against the wall clock exactly as it was before.
    expect(screen.getByText('MIN 4 OF 10')).toBeInTheDocument()
    expect(marked('Now')).toEqual(['2. v up'])
  })

  it('restores a record written by an earlier visit', () => {
    mount({
      stored: {
        startedAt: new Date(NOW - 225_000).toISOString(),
        workDoneMinute: null,
      },
    })

    expect(screen.getByText('MIN 4 OF 10')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start EMOM' })).not.toBeInTheDocument()
  })

  it('remembers that this minute’s work was already done', async () => {
    const user = setup()
    const mounted = mount()

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    mounted.advance(10)
    await user.click(screen.getByRole('button', { name: 'Minute done' }))

    mounted.refresh()

    expect(screen.getByText('REST')).toBeInTheDocument()
  })

  it('ignores a record no clock can be read against', () => {
    mount({ stored: { startedAt: 'some time on Tuesday', workDoneMinute: 4 } })

    // Repaired to "not started" rather than frozen at minute one for ever.
    expect(screen.getByRole('button', { name: 'Start EMOM' })).toBeInTheDocument()
    expect(screen.getByText('NOT STARTED')).toBeInTheDocument()
  })

  it('starts at the top when there is nothing stored, and stores what it starts', async () => {
    const user = setup()
    const mounted = mount({ stored: EMOM_START })

    expect(screen.getByText('NOT STARTED')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))

    expect(mounted.storage.getItem('clear.workout-emom')).toContain(mounted.block.blockId)
  })
})

describe('completion supplies the minutes the EMOM observed', () => {
  it('reports minutes_completed and nothing it did not watch', async () => {
    const user = setup()
    const mounted = mount()

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    mounted.advance(185)

    await waitFor(() =>
      expect(mounted.reportOutcome).toHaveBeenLastCalledWith(mounted.block.blockId, {
        minutesCompleted: 3,
      }),
    )
  })

  it('counts a minute the user finished early', async () => {
    const user = setup()
    const mounted = mount()

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    mounted.advance(70)
    await user.click(screen.getByRole('button', { name: 'Minute done' }))

    // Minute one elapsed and minute two's work is done: two, not one.
    expect(mounted.reportOutcome).toHaveBeenLastCalledWith(mounted.block.blockId, {
      minutesCompleted: 2,
    })
  })

  it('reports nothing at all when the clock never ran', () => {
    const mounted = mount()

    // An unobserved zero would be a measurement (DATA_MODEL §8).
    expect(mounted.reportOutcome).toHaveBeenLastCalledWith(mounted.block.blockId, {})
  })

  it('reports nothing for a block that prescribes no clock', () => {
    const mounted = mount({ block: { timerType: 'none' } })

    expect(mounted.reportOutcome).toHaveBeenLastCalledWith(mounted.block.blockId, {})
  })

  it('offers no completion of its own: the section’s forward action saves it (REQ-013)', () => {
    mount()

    expect(screen.queryByRole('button', { name: /^Complete/ })).not.toBeInTheDocument()
  })
})

describe('the EMOM draws with the shared block frame', () => {
  it('is one block card beside one timer card, with neither inside the other', async () => {
    const user = setup()
    mount()

    // Before the clock: the block's card and nothing else.
    expect(cards()).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))

    expect(cards()).toHaveLength(2)
    expect(nestedCards()).toEqual([])

    // The timer's card is the shipped one, and it holds the readout alone: the
    // minute, the phase, the movements and the controls are the block card's.
    const timerCard = timer().closest('.clr-card') as HTMLElement
    const blockCard = screen
      .getByRole('list', { name: 'Movements in this EMOM' })
      .closest('.clr-card') as HTMLElement
    expect(blockCard).not.toBe(timerCard)
    expect(within(timerCard).queryByRole('button')).not.toBeInTheDocument()
    const inside = within(blockCard)
    expect(inside.getByText('MIN 1 OF 10')).toBeInTheDocument()
    expect(inside.getByText('WORK')).toBeInTheDocument()
    expect(inside.getByRole('button', { name: 'Minute done' })).toBeInTheDocument()
  })

  it('carries the identity row and the movement rows', () => {
    mount()

    const blockCard = cards()[0]
    const inside = within(blockCard)
    expect(inside.getByText('EMOM · 10 MIN')).toBeInTheDocument()
    expect(inside.getByText('2 movements')).toBeInTheDocument()

    // Rows of one list, each headed by its movement — never cards of their own.
    const rows = within(
      inside.getByRole('list', { name: 'Movements in this EMOM' }),
    ).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(within(row).getByRole('heading')).toBeInTheDocument()
      expect(row.querySelector('.clr-card')).toBeNull()
    }
  })

  it('keeps every movement loggable whichever one the minute is on', async () => {
    const user = setup()
    mount()

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))

    // The movement the minute is not on is neither disabled nor hidden.
    for (const name of ['1. hollow body hold', '2. v up']) {
      const controls = movement(name).getAllByRole('button')
      expect(controls.length).toBeGreaterThan(0)
      for (const control of controls) expect(control).toBeEnabled()
    }
  })
})

describe('the countdown takes the shipped low state and nothing more', () => {
  it('is not low, and claims no loop, while the minute has time left', async () => {
    reduceMotion(false)
    const user = setup()
    const mounted = mount()

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    mounted.advance(49)

    expect(timer()).toHaveTextContent('00:11')
    expect(timer()).toHaveClass('clr-chamfer--timer')
    expect(timer()).not.toHaveClass('clr-chamfer--timer-low')
    expect(document.querySelector('.clr-pulse-micro')).toBeNull()
    expect(countdown()).toHaveAttribute('data-urgent', 'false')
    expect(countdown()).toHaveAttribute('data-loop', 'still')
  })

  it('goes low in the last ten seconds: stepped over --dur-alert, pulsing to 80%, no glow', async () => {
    reduceMotion(false)
    const user = setup()
    const mounted = mount()

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    mounted.advance(50)

    // One role change moves bar, body and emission together.
    expect(timer()).toHaveTextContent('00:10')
    expect(timer()).toHaveClass('clr-chamfer--timer-low')
    expect(timer()).not.toHaveClass('clr-chamfer--timer')
    expect(nestedCards()).toEqual([])

    // The digits cross over on the frame's schedule, and each one tumbles.
    expect(digits().style.color).toBe('var(--text-timer-low)')
    expect(digits().style.transition).toBe('color var(--dur-alert) var(--step-4)')
    expect(digits().querySelectorAll('.clr-tumble')).toHaveLength(4)

    // The pulse is on the whole timer card and is the view's running loop.
    expect(timer().closest('.clr-pulse-micro')).not.toBeNull()
    expect(document.querySelectorAll('.clr-pulse-micro')).toHaveLength(1)
    expect(countdown()).toHaveAttribute('data-urgent', 'true')
    expect(countdown()).toHaveAttribute('data-loop', 'run')

    // No glow of the timer's own: the extra glow is the primary action's.
    expect(countdown().querySelector('.clr-glow')).toBeNull()

    // What those classes resolve to in the shipped package.
    expect(MOTION_CSS).toMatch(/--dur-slow:\s*400ms/)
    expect(MOTION_CSS).toMatch(/--dur-alert:\s*var\(--dur-slow\)/)
    expect(MOTION_CSS).toMatch(/--step-4:\s*steps\(4, end\)/)
    expect(
      MOTION_CSS.includes(
        '@keyframes clr-micro-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.8; } }',
      ),
    ).toBe(true)
  })

  it('leaves the low state on the minute boundary, and comes back to it every minute', async () => {
    reduceMotion(false)
    const user = setup()
    const mounted = mount()

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    mounted.advance(55)
    expect(countdown()).toHaveAttribute('data-loop', 'run')

    mounted.advance(5)
    expect(screen.getByText('MIN 2 OF 10')).toBeInTheDocument()
    expect(timer()).toHaveTextContent('01:00')
    expect(timer()).toHaveClass('clr-chamfer--timer')
    expect(countdown()).toHaveAttribute('data-loop', 'still')

    mounted.advance(52)
    expect(timer()).toHaveTextContent('00:08')
    expect(timer()).toHaveClass('clr-chamfer--timer-low')
    expect(countdown()).toHaveAttribute('data-loop', 'run')
  })

  it('stays low through the rest remainder, with the phase still in words', async () => {
    reduceMotion(false)
    const user = setup()
    const mounted = mount()

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    mounted.advance(52)
    await user.click(screen.getByRole('button', { name: 'Minute done' }))

    expect(screen.getByText('REST')).toBeInTheDocument()
    expect(timer()).toHaveTextContent('00:08')
    expect(timer()).toHaveClass('clr-chamfer--timer-low')
    expect(countdown()).toHaveAttribute('data-loop', 'run')
  })

  it('gives the loop up once the last minute has elapsed', async () => {
    reduceMotion(false)
    const user = setup()
    const mounted = mount({ block: { timerSeconds: 120 } })

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    mounted.advance(115)
    expect(countdown()).toHaveAttribute('data-loop', 'run')

    mounted.advance(5)

    // A finished clock holds the low colours at zero and does not pulse on.
    expect(screen.getByText('COMPLETE')).toBeInTheDocument()
    expect(timer()).toHaveTextContent('00:00')
    expect(timer()).toHaveClass('clr-chamfer--timer-low')
    expect(countdown()).toHaveAttribute('data-loop', 'still')
    expect(document.querySelector('[data-loop="run"]')).toBeNull()
    expect(APP_MOTION_CSS).toMatch(
      /\[data-loop='still'\] \.clr-pulse-micro,[\s\S]*?\{[^}]*animation: none/,
    )
  })

  it('stays a labelled timer that is not a live region', async () => {
    const user = setup()
    const mounted = mount()

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    mounted.advance(52)

    expect(screen.getByRole('timer', { name: 'Time remaining' })).toBe(timer())
    expect(timer()).not.toHaveAttribute('aria-live')
    expect(digits()).toHaveAttribute('aria-hidden', 'true')
    expect(countdown().querySelector('[aria-live], [role="status"]')).toBeNull()
  })

  it('takes the one loop from a loading region beside it, and gives it back', async () => {
    reduceMotion(false)
    const user = setup()
    const mounted = mount({
      beside: <LoadingView label="Reading coaching for hollow body hold" />,
    })
    const wait = screen
      .getByText('Reading coaching for hollow body hold')
      .closest('[data-loop]') as HTMLElement

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))

    // A minute that is not low has no loop, so the wait keeps its own.
    expect(wait).toHaveAttribute('data-loop', 'run')
    expect(countdown()).toHaveAttribute('data-loop', 'still')

    mounted.advance(52)

    // Low: the pulse carries more state, so it runs and the wait is stilled —
    // still on screen, still busy, still saying what it is waiting for.
    expect(countdown()).toHaveAttribute('data-loop', 'run')
    expect(wait).toHaveAttribute('data-loop', 'still')
    expect(wait).toHaveAttribute('aria-busy', 'true')
    expect(wait).toHaveTextContent('Reading coaching for hollow body hold')
    expect(document.querySelectorAll('[data-loop="run"]')).toHaveLength(1)

    mounted.advance(8)
    expect(wait).toHaveAttribute('data-loop', 'run')
    expect(document.querySelectorAll('[data-loop="run"]')).toHaveLength(1)
  })

  it('is still under reduced motion and loses nothing it was saying', async () => {
    reduceMotion(true)
    const user = setup()
    const mounted = mount()

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    mounted.advance(52)

    expect(countdown()).toHaveAttribute('data-loop', 'still')
    expect(document.querySelector('[data-loop="run"]')).toBeNull()

    // The reading, the words, the colour role and the controls are all there.
    expect(countdown()).toHaveAttribute('data-urgent', 'true')
    expect(timer()).toHaveClass('clr-chamfer--timer-low')
    expect(digits().style.color).toBe('var(--text-timer-low)')
    expect(timer()).toHaveTextContent('00:08')
    expect(screen.getByText('MIN 1 OF 10')).toBeInTheDocument()
    expect(screen.getByText('WORK')).toBeInTheDocument()
    expect(marked('Now')).toEqual(['1. hollow body hold'])
    expect(screen.getByRole('button', { name: 'Minute done' })).toBeEnabled()

    // The shipped rule that makes a reduced pulse static.
    expect(MOTION_CSS).toMatch(
      /prefers-reduced-motion: reduce\) \{[\s\S]*\.clr-pulse-micro[\s\S]*animation: none/,
    )
  })
})

describe('an EMOM whose movements were swapped out', () => {
  it('says the block has nothing left to perform rather than running a clock', () => {
    mount({
      block: {
        exercises: PAIR.map((exercise) => ({
          prescription: { ...exercise.prescription, revision_status: 'superseded' as const },
        })),
      },
    })

    expect(screen.getByText(/every movement in it was swapped\s+out/)).toBeInTheDocument()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })
})
