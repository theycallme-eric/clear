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
 * `EmomBlock` is mounted directly rather than through `BlockSlot` — the
 * dispatch is `block-renderers.test.tsx`'s subject, and the injected clock and
 * storage are what these assertions are about.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, type Mock } from 'vitest'

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
  snapshotFixture,
  type BlockFixture,
  type ExerciseFixture,
} from '../test/workout-double'
import { EmomBlock } from './emom-block'

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
  readonly completeBlock: Mock<(blockId: string, outcome: BlockOutcome) => void>
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

  const completeBlock = vi.fn<(blockId: string, outcome: BlockOutcome) => void>()
  const completion: BlockCompletionApi = {
    completeBlock,
    isBlockRecorded: () => false,
  }

  let current = NOW
  const tree = (
    <AppProviders workout={workout.clients}>
      <BlockCompletionContext value={completion}>
        <SetLoggingProvider
          exercises={block.exercises}
          weightUnit="kg"
          onFailure={() => {}}
          newId={() => MINTED}
        >
          <EmomBlock block={block} storage={storage} now={() => current} />
        </SetLoggingProvider>
      </BlockCompletionContext>
    </AppProviders>
  )

  let view = render(tree)

  return {
    block,
    storage,
    completeBlock,
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

/** Every movement carrying the live marker, by the word it carries. */
function marked(word: string): string[] {
  return screen
    .getAllByRole('listitem')
    .filter((item) => item.textContent?.includes(word) === true)
    .map((item) => item.querySelector('h1, h2, h3, h4, h5, h6')?.textContent ?? '')
}

describe('the EMOM runs the clock the block prescribes', () => {
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
    expect(marked('NOW')).toEqual(['1. hollow body hold'])
    expect(movement('1. hollow body hold').getByText('NOW')).toBeInTheDocument()

    // The phone was in a pocket for the rest of minute one.
    mounted.advance(60)

    expect(screen.getByText('MIN 2 OF 10')).toBeInTheDocument()
    expect(marked('NOW')).toEqual(['2. v up'])
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
    expect(marked('NEXT')).toEqual(['2. v up'])
    expect(screen.queryByRole('button', { name: 'Minute done' })).not.toBeInTheDocument()

    // And the next boundary puts the work back without anything being pressed.
    mounted.advance(40)

    expect(screen.getByText('WORK')).toBeInTheDocument()
    expect(marked('NOW')).toEqual(['2. v up'])
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
    expect(marked('NOW')).toEqual([])
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
    expect(marked('NOW')).toEqual(['2. v up'])
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
  it('hands the shell minutes_completed and nothing it did not watch', async () => {
    const user = setup()
    const mounted = mount()

    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    mounted.advance(185)
    await user.click(screen.getByRole('button', { name: 'Complete EMOM' }))

    await waitFor(() =>
      expect(mounted.completeBlock).toHaveBeenCalledExactlyOnceWith(mounted.block.blockId, {
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
    await user.click(screen.getByRole('button', { name: 'Complete EMOM' }))

    // Minute one elapsed and minute two's work is done: two, not one.
    expect(mounted.completeBlock).toHaveBeenCalledExactlyOnceWith(mounted.block.blockId, {
      minutesCompleted: 2,
    })
  })

  it('supplies nothing at all when the clock never ran', async () => {
    const user = setup()
    const mounted = mount()

    await user.click(screen.getByRole('button', { name: 'Complete EMOM' }))

    // An unobserved zero would be a measurement (DATA_MODEL §8).
    expect(mounted.completeBlock).toHaveBeenCalledExactlyOnceWith(mounted.block.blockId, {})
  })

  it('supplies nothing for a block that prescribes no clock', async () => {
    const user = setup()
    const mounted = mount({ block: { timerType: 'none' } })

    await user.click(screen.getByRole('button', { name: 'Complete EMOM' }))

    expect(mounted.completeBlock).toHaveBeenCalledExactlyOnceWith(mounted.block.blockId, {})
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
