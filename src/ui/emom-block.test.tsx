/**
 * EXE-03 acceptance for the EMOM renderer, read off the screen:
 *
 *   · timer type and seconds come from `workout_blocks`, and the minute
 *     boundary visibly changes which movement is active work;
 *   · an alternating EMOM labels `ODD MIN` / `EVEN MIN` per
 *     `emom-clarity.md` §3;
 *   · the timed state survives a refresh, and completion supplies no
 *     outcome the clock alone produced.
 *
 * And REQ-014's hands-off contract: no set-entry form, no `Minute done`, no
 * exertion prompt; fixed, rising and rotating targets read off the scheduled
 * minute across boundaries, rotations, expiry, a background and a refresh;
 * and a scheduled minute is never reported as work the athlete performed.
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
    expect(screen.getByText('WORK')).toBeInTheDocument()
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

  it('offers nothing to press once the clock runs: the minute is never marked done', async () => {
    const user = setup()
    const mounted = mount()

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    mounted.advance(20)

    // Still work, and nothing on the screen claims the minute is finished.
    expect(screen.getByText('WORK')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /minute done/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/minute done/i)).not.toBeInTheDocument()

    // And the next boundary moves the work on without anything being pressed.
    mounted.advance(40)

    expect(screen.getByText('MIN 2 OF 10')).toBeInTheDocument()
    expect(marked('Now')).toEqual(['2. v up'])
  })

  it('names what is coming during the rest window rather than telling the user to start', async () => {
    const user = setup()
    const mounted = mount({ block: { roundRestSeconds: 15 } })

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    mounted.advance(50)

    expect(screen.getByText('REST')).toBeInTheDocument()
    expect(marked('Next')).toEqual(['2. v up'])
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
    // The schedule is over; nothing says the work was performed.
    expect(screen.getByText(/The clock has run every prescribed minute/)).toBeInTheDocument()
    expect(screen.queryByText(/minutes? (is |are )?done/i)).not.toBeInTheDocument()
    expect(marked('Now')).toEqual([])
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
    // `EMOM · 10 MIN`, which is the window rather than an assignment, and the
    // target line names the scheduled minute rather than a pattern.
    expect(movement('1. hollow body hold').queryByText(/^(ODD|EVEN) MIN$|^MIN \d+, /)).not.toBeInTheDocument()
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

  it('drops a minute marked done by an earlier build: the restored minute is the clock’s', () => {
    mount({
      stored: {
        startedAt: new Date(NOW - 190_000).toISOString(),
        workDoneMinute: 4,
      },
    })

    expect(screen.getByText('MIN 4 OF 10')).toBeInTheDocument()
    expect(screen.getByText('WORK')).toBeInTheDocument()
    expect(timer()).toHaveTextContent('00:50')
  })

  it('restores the countdown and its end-of-minute cue after a background and a refresh', async () => {
    reduceMotion(false)
    const user = setup()
    const mounted = mount()

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    // Backgrounded across two boundaries, into the last ten seconds of minute 3.
    mounted.advance(172)
    expect(screen.getByText('MIN 3 OF 10')).toBeInTheDocument()
    expect(timer()).toHaveTextContent('00:08')
    expect(countdown()).toHaveAttribute('data-urgent', 'true')

    mounted.refresh()

    expect(screen.getByText('MIN 3 OF 10')).toBeInTheDocument()
    expect(timer()).toHaveTextContent('00:08')
    expect(timer()).toHaveClass('clr-chamfer--timer-low')
    expect(countdown()).toHaveAttribute('data-urgent', 'true')
    expect(marked('Now')).toEqual(['1. hollow body hold'])
  })

  it('comes back finished when the window expired while the tab was away', () => {
    const mounted = mount({
      block: { timerSeconds: 240 },
      stored: { startedAt: new Date(NOW - 600_000).toISOString(), workDoneMinute: null },
    })

    expect(screen.getByText('COMPLETE')).toBeInTheDocument()
    expect(timer()).toHaveTextContent('00:00')
    // Expiry is the schedule ending, not four minutes of reported work.
    expect(mounted.reportOutcome).toHaveBeenLastCalledWith(mounted.block.blockId, {})
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

describe('completion never records a scheduled minute as performed work', () => {
  it('reports no minutes while the clock runs', async () => {
    const user = setup()
    const mounted = mount()

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    mounted.advance(185)

    await waitFor(() =>
      expect(mounted.reportOutcome).toHaveBeenLastCalledWith(mounted.block.blockId, {}),
    )
  })

  it('reports no minutes once every prescribed minute has elapsed', async () => {
    const user = setup()
    const mounted = mount({ block: { timerSeconds: 120 } })

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    mounted.advance(500)

    expect(screen.getByText('COMPLETE')).toBeInTheDocument()
    for (const [, outcome] of mounted.reportOutcome.mock.calls) {
      expect(outcome).not.toHaveProperty('minutesCompleted')
    }
    expect(mounted.reportOutcome).toHaveBeenLastCalledWith(mounted.block.blockId, {})
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
    expect(inside.queryByRole('button', { name: /minute done/i })).not.toBeInTheDocument()
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

  it('reads every movement whichever one the minute is on, with nothing to enter', async () => {
    const user = setup()
    mount()

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))

    // The movement the minute is not on is neither hidden nor a form.
    for (const name of ['1. hollow body hold', '2. v up']) {
      expect(movement(name).getByText(/^MIN \d+ · 8 reps$/)).toBeInTheDocument()
    }
  })
})

/**
 * Entry fields outside the on-demand coaching panel, whose collapsed notes are
 * the athlete's own words about the movement rather than an entry the minute
 * asks for (EXE-05).
 */
function entryFields(): HTMLElement[] {
  return screen
    .queryAllByRole('textbox')
    .filter((field) => field.closest('.clr-collapsible__region') === null)
}

describe('execution is hands-off (REQ-014)', () => {
  it('draws no set-entry form, no Minute done and no exertion prompt, in any phase', async () => {
    const user = setup()
    const mounted = mount({ block: { roundRestSeconds: 15 } })

    const expectHandsOff = () => {
      expect(entryFields()).toEqual([])
      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
      expect(screen.queryByRole('slider')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /log set|minute done/i })).not.toBeInTheDocument()
      expect(screen.queryByText(/RPE|exertion|effort/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/No sets logged/)).not.toBeInTheDocument()
    }

    expectHandsOff()
    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    expectHandsOff()
    mounted.advance(50)
    expect(screen.getByText('REST')).toBeInTheDocument()
    expectHandsOff()
    mounted.advance(600)
    expect(screen.getByText('COMPLETE')).toBeInTheDocument()
    expectHandsOff()
  })

  it('draws no entry form for a block that prescribes no clock either', () => {
    mount({ block: { timerType: 'none' } })

    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(entryFields()).toEqual([])
    expect(movement('1. hollow body hold').getByText('3 × 8 reps')).toBeInTheDocument()
  })
})

describe('targets follow the scheduled minute', () => {
  /** A rising EMOM: hollow holds climb 6-8-10 on odd minutes, V-ups hold 12. */
  const RISING: ExerciseFixture[] = [
    {
      prescription: {
        exercise_id: 'hollow-body-hold',
        order_index: 0,
        sets: null,
        target_kind: 'sequence',
        target_value: null,
        target_sequence: [6, 8, 10],
      },
    },
    { prescription: { exercise_id: 'v-up', order_index: 1, target_value: 12 } },
  ]

  it('states a fixed target for the minute each movement is scheduled', async () => {
    const user = setup()
    const mounted = mount()

    expect(movement('1. hollow body hold').getByText('MIN 1 · 8 reps')).toBeInTheDocument()
    expect(movement('2. v up').getByText('MIN 2 · 8 reps')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    mounted.advance(60)

    // Minute 2 is V-ups' now; hollow holds' next turn is minute 3.
    expect(movement('2. v up').getByText('MIN 2 · 8 reps')).toBeInTheDocument()
    expect(movement('1. hollow body hold').getByText('MIN 3 · 8 reps')).toBeInTheDocument()
  })

  it('raises a rising target on each of its own turns, with no tap', async () => {
    const user = setup()
    const mounted = mount({ block: { timerSeconds: 360, exercises: RISING } })

    expect(movement('1. hollow body hold').getByText('Each turn: 6-8-10')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    expect(movement('1. hollow body hold').getByText('MIN 1 · 6 reps')).toBeInTheDocument()
    expect(movement('2. v up').getByText('MIN 2 · 12 reps')).toBeInTheDocument()

    mounted.advance(120)
    expect(screen.getByText('MIN 3 OF 6')).toBeInTheDocument()
    expect(movement('1. hollow body hold').getByText('MIN 3 · 8 reps')).toBeInTheDocument()
    expect(movement('2. v up').getByText('MIN 4 · 12 reps')).toBeInTheDocument()

    // Refreshed inside minute 5: the rung is the clock's, not where it was left.
    mounted.advance(130)
    mounted.refresh()
    expect(screen.getByText('MIN 5 OF 6')).toBeInTheDocument()
    expect(marked('Now')).toEqual(['1. hollow body hold'])
    expect(movement('1. hollow body hold').getByText('MIN 5 · 10 reps')).toBeInTheDocument()

    // Expired: no minute is scheduled, so the row states the prescription.
    mounted.advance(120)
    expect(screen.getByText('COMPLETE')).toBeInTheDocument()
    expect(movement('1. hollow body hold').getByText('6-8-10 reps')).toBeInTheDocument()
    expect(movement('2. v up').getByText('12 reps')).toBeInTheDocument()
  })

  it('rotates three movements and their targets across the boundaries', async () => {
    const user = setup()
    const mounted = mount({
      block: {
        timerSeconds: 360,
        exercises: [
          ...PAIR,
          { prescription: { exercise_id: 'plank', order_index: 2, modality: 'time', target_value: 30 } },
        ],
      },
    })

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    mounted.advance(120)
    expect(marked('Now')).toEqual(['3. plank'])
    expect(movement('3. plank').getByText('MIN 3 · 30 sec')).toBeInTheDocument()
    expect(movement('1. hollow body hold').getByText('MIN 4 · 8 reps')).toBeInTheDocument()
    expect(movement('2. v up').getByText('MIN 5 · 8 reps')).toBeInTheDocument()

    mounted.advance(60)
    expect(marked('Now')).toEqual(['1. hollow body hold'])
    expect(movement('3. plank').getByText('MIN 6 · 30 sec')).toBeInTheDocument()
  })

  it('says a sequence is spent rather than inventing a rung past its end', async () => {
    const user = setup()
    const mounted = mount({ block: { timerSeconds: 600, exercises: RISING } })

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    mounted.advance(360)

    expect(screen.getByText('MIN 7 OF 10')).toBeInTheDocument()
    expect(movement('1. hollow body hold').getByText('MIN 7 · No target')).toBeInTheDocument()
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
    const mounted = mount({ block: { roundRestSeconds: 15 } })

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    mounted.advance(52)

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
    expect(movement('1. hollow body hold').getByText('MIN 1 · 8 reps')).toBeInTheDocument()

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
