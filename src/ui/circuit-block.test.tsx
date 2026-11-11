/**
 * EXE-03 / REQ-014 (U40) acceptance, as the athlete meets it:
 *
 *   · the complete ordered circuit — every movement with its per-round
 *     target, the total rounds and the shared rest — is on the card from the
 *     start, and no movement is singled out as the one to do now;
 *   · nothing is compulsory: there is no per-movement step, and the round
 *     clock — Start round 1, then Finish round, which starts the shared rest —
 *     is optional (REQ-017; its own journey is `circuit-rounds.test.tsx`);
 *   · optional load entry is compact — one quiet action per movement, the set
 *     form only for the movement opened — and still saves, refuses and retries
 *     through the shell's one set path;
 *   · rounds are observations: an untouched circuit, a rest that ran out, or a
 *     circuit left alone long past its prescription supplies no round count,
 *     and a recorded round can be taken back to that same nothing;
 *   · the shared rest is read from the wall clock and survives a refresh.
 *
 * It draws with the shared `BlockPanel` frame (REQ-023): one card, the
 * movements as rows of one list, the rest countdown beside the card rather
 * than inside it, and exactly one completion.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BlockCompletionContext,
  type BlockCompletionApi,
  type BlockOutcome,
} from '../state/block-completion'
import { createError, err, ErrorCode } from '../state/errors'
import {
  SetLoggingContext,
  type SetLogEntry,
  type SetLoggingApi,
} from '../state/set-logging'
import { SetLoggingProvider } from '../state/set-logging-provider'
import type { BlockProgress } from '../state/workout-progress'
import { sessionProgress } from '../state/workout-progress'
import {
  readCircuitState,
  WORKOUT_CIRCUIT_STORAGE_KEY,
  type ShellStorage,
} from '../state/workout-persistence'
import { AppProviders } from '../test/render'
import {
  createWorkoutDouble,
  FIXTURE_SESSION_ID,
  snapshotFixture,
  type BlockFixture,
  type WorkoutDouble,
} from '../test/workout-double'
import { CircuitBlock } from './circuit-block'
import { circuitShape, finishRound as finishCircuitRound, takeBackRound } from '../state/circuit'

/** A moment the rest can be measured from, and a clock the test moves. */
const START = Date.parse('2026-09-24T10:00:00.000Z')
let clock = START
const now = () => clock

/** `localStorage`, in memory, so one test cannot see another's rounds. */
function fakeStorage(): ShellStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  }
}

/** Three named movements, so order and per-round targets can be read off. */
const ORDERED = [
  { prescription: { exercise_id: 'kettlebell-swing', order_index: 0, target_value: 15, tempo: null } },
  { prescription: { exercise_id: 'push-up', order_index: 1, target_value: 10, tempo: '2-0-1-0' } },
  { prescription: { exercise_id: 'goblet-squat', order_index: 2, target_value: 12, tempo: null } },
]

function circuitBlock(fixture: BlockFixture = {}): BlockProgress {
  const snapshot = snapshotFixture({
    sections: [
      {
        blocks: [
          {
            structureType: 'circuit',
            rounds: 3,
            roundRestSeconds: 60,
            exercises: ORDERED,
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

/** EXE-02's seam, stubbed: these tests are about rounds, not about sets. */
const setLogging: SetLoggingApi = {
  logSet: vi.fn(),
  loggedSets: () => [],
  isSaving: () => false,
  weightUnit: 'kg',
  sync: { unsyncedCount: 0, sustainedFailure: false, syncing: false },
  retrySync: vi.fn(),
}

function renderCircuit(
  block: BlockProgress,
  storage: ShellStorage,
  api: BlockCompletionApi,
) {
  return render(
    <BlockCompletionContext value={api}>
      <SetLoggingContext value={setLogging}>
        <CircuitBlock block={block} storage={storage} now={now} />
      </SetLoggingContext>
    </BlockCompletionContext>,
  )
}

/** Every card frame in the document, and the ones that sit inside another. */
function cards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.clr-card'))
}

function nestedCards(): HTMLElement[] {
  return cards().filter((card) => card.parentElement?.closest('.clr-card') != null)
}

function movementList(): HTMLElement {
  return screen.getByRole('list', { name: 'Movements in this circuit' })
}

/** The circuit's rows, in the order the list lays them out. */
function movementRows(): HTMLElement[] {
  return Array.from(movementList().children) as HTMLElement[]
}

/** The block's own card: the one the movement list is drawn in. */
function blockCard(): HTMLElement {
  const card = movementList().closest<HTMLElement>('.clr-card')
  if (card === null) throw new Error('the movement list is in no card')
  return card
}

/**
 * One movement's set form, so two movements' fields never collide. It is in
 * the movement's half-sheet, opened from its opened entry's Rest action.
 */
function formFor(name: string, setNumber = 1) {
  if (screen.queryByRole('form', { name: new RegExp(`^Log set \\d+ of ${name}$`) }) === null) {
    const log = screen
      .getAllByRole('heading', { name: new RegExp(`${name}$`) })
      .map((heading) => heading.closest('section'))
      .map((section) => (section === null ? null : within(section).queryByRole('button', { name: 'Rest' })))
      .find((button) => button !== null)
    if (log === null || log === undefined) throw new Error(`no Rest entry for ${name}`)
    fireEvent.click(log)
  }
  return within(screen.getByRole('form', { name: `Log set ${setNumber} of ${name}` }))
}

/** The live line that says how many rounds the athlete has recorded. */
function roundRecord(): HTMLElement {
  return within(blockCard()).getByText(/rounds? recorded$/)
}

const finishRound = (round: number) =>
  screen.getByRole('button', { name: `Finish round ${round}` })

/** The circuit's initial Start: the first round's clock (REQ-017). */
const startRound1 = () => screen.getByRole('button', { name: 'Start round 1' })

/** The shared rest's countdown — not a round's elapsed clock. */
const restTimer = () => screen.queryByRole('timer', { name: 'Time remaining' })

/** The nth set id minted: no two sets share one. */
function mintedId(index: number): string {
  return `a000000${index + 1}-0000-4000-8000-000000000000`
}

/** No pass the test did not ask for: a retry here is something the user did. */
const NO_AUTOMATIC_RETRY = () => 1_000_000

interface Logging {
  workout: WorkoutDouble
  block: BlockProgress
  /** Every write the transport was asked for, refused or not, in order. */
  attempts: SetLogEntry[]
  storage: ShellStorage
  reportOutcome: ReturnType<typeof completionDouble>['reportOutcome']
}

/**
 * The circuit under the shell's real set-logging provider: two movements with
 * names of their own, so a set can be followed to the row it was written for.
 */
function renderLoggingCircuit(
  options: {
    /** Whether to refuse a write as offline. */
    refuse?: () => boolean
    /** Hold every write unanswered until this settles. */
    held?: Promise<void>
  } = {},
): Logging {
  const snapshot = snapshotFixture({
    sections: [
      {
        blocks: [
          {
            structureType: 'circuit',
            rounds: 3,
            roundRestSeconds: 60,
            exercises: [
              { prescription: { exercise_id: 'back-squat', order_index: 0 } },
              { prescription: { exercise_id: 'romanian-deadlift', order_index: 1 } },
            ],
          },
        ],
      },
    ],
  })
  const base = createWorkoutDouble({ session: snapshot })
  const attempts: SetLogEntry[] = []
  const workout: WorkoutDouble = {
    ...base,
    clients: {
      ...base.clients,
      setLogs: {
        ...base.clients.setLogs,
        async log(entry) {
          attempts.push(entry)
          await options.held
          return options.refuse?.()
            ? err(createError(ErrorCode.NETWORK_OFFLINE))
            : base.clients.setLogs.log(entry)
        },
      },
    },
  }
  const block = sessionProgress(snapshot).sections[0]!.blocks[0]!
  const storage = fakeStorage()
  const completion = completionDouble()
  let minted = 0

  render(
    <AppProviders workout={workout.clients}>
      <BlockCompletionContext value={completion.api}>
        <SetLoggingProvider
          sessionId={FIXTURE_SESSION_ID}
          storage={null}
          exercises={block.exercises}
          weightUnit="kg"
          onFailure={vi.fn()}
          newId={() => mintedId(minted++)}
          retryDelay={NO_AUTOMATIC_RETRY}
        >
          <CircuitBlock block={block} storage={storage} now={now} />
        </SetLoggingProvider>
      </BlockCompletionContext>
    </AppProviders>,
  )

  return { workout, block, attempts, storage, reportOutcome: completion.reportOutcome }
}

/** Opens one movement's optional entry and logs 60 kg for 8 through it. */
async function logSet(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  setNumber: number,
) {
  const open = screen.queryByRole('button', { name: `Rest for ${name}` })
  if (open !== null) await user.click(open)
  const form = formFor(name, setNumber)
  const weight = form.getByLabelText('Weight')
  const reps = form.getByLabelText('Reps')
  await user.clear(weight)
  await user.type(weight, '60')
  await user.clear(reps)
  await user.type(reps, '8')
  await user.click(form.getByRole('button', { name: `Log set ${setNumber}` }))
}

beforeEach(() => {
  clock = START
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the complete ordered circuit', () => {
  it('shows every movement in prescribed order with its per-round target', () => {
    renderCircuit(circuitBlock(), fakeStorage(), completionDouble().api)

    expect(screen.getByText('Each round:')).toBeInTheDocument()
    const rows = movementRows()
    expect(rows).toHaveLength(3)

    const headings = rows.map((row) => within(row).getByRole('heading').textContent)
    expect(headings).toEqual(['1. kettlebell swing', '2. push up', '3. goblet squat'])
    expect(within(rows[0]!).getByText('15 reps')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('10 reps')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('Tempo 2-0-1-0')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('12 reps')).toBeInTheDocument()
  })

  it('orders by the prescription, whatever order the rows arrived in', () => {
    renderCircuit(
      circuitBlock({ exercises: [ORDERED[2]!, ORDERED[0]!, ORDERED[1]!] }),
      fakeStorage(),
      completionDouble().api,
    )

    expect(movementRows().map((row) => within(row).getByRole('heading').textContent)).toEqual([
      '1. kettlebell swing',
      '2. push up',
      '3. goblet squat',
    ])
  })

  it('states the total rounds and the shared rest the block prescribes, once each', () => {
    renderCircuit(circuitBlock(), fakeStorage(), completionDouble().api)

    // TASK-003 (AC-C08-01, AC-R003-01): the badge names the format; the total
    // rounds are read once, on the header's line below it.
    expect(screen.getByText('CIRCUIT')).toBeInTheDocument()
    expect(screen.getAllByText('3 ROUNDS')).toHaveLength(1)
    expect(screen.queryByText('CIRCUIT · 3 ROUNDS')).toBeNull()
    expect(screen.getAllByText('60s rest between rounds')).toHaveLength(1)
    // Rest is the block's: no movement states one of its own.
    for (const row of movementRows()) expect(within(row).queryByText(/^Rest \d|\d+s rest/i)).toBeNull()
  })

  it('never says a rest the block does not prescribe', () => {
    renderCircuit(
      circuitBlock({ roundRestSeconds: 0 }),
      fakeStorage(),
      completionDouble().api,
    )

    expect(screen.queryByText(/rest between rounds/i)).not.toBeInTheDocument()
  })

  it('says so when every movement in it was swapped out', () => {
    renderCircuit(circuitBlock({ exercises: [] }), fakeStorage(), completionDouble().api)

    expect(screen.getByText(/every movement in it was swapped out/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /finish round/i })).not.toBeInTheDocument()
  })
})

describe('nothing is compulsory', () => {
  it('has no per-movement step and singles out no movement', () => {
    renderCircuit(circuitBlock(), fakeStorage(), completionDouble().api)

    expect(screen.queryByRole('button', { name: /next movement/i })).toBeNull()
    expect(screen.queryByRole('listitem', { current: 'step' })).toBeNull()
    for (const row of movementRows()) {
      expect(within(row).queryByText(/^(Now|Next)$/)).toBeNull()
    }
    expect(screen.queryByText(/Movement \d of \d/)).toBeNull()
  })

  it('draws no set form until the athlete asks for one', () => {
    renderCircuit(circuitBlock(), fakeStorage(), completionDouble().api)

    expect(screen.queryByRole('form', { name: /^Log set/ })).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    // One quiet action per movement, and nothing else to fill in.
    for (const name of ['kettlebell swing', 'push up', 'goblet squat']) {
      expect(
        screen.getByRole('button', { name: `Rest for ${name}` }),
      ).toHaveAttribute('aria-expanded', 'false')
    }
  })

  it('offers the round clock as optional, secondary taps: Start, then Finish', async () => {
    const user = userEvent.setup()
    renderCircuit(circuitBlock(), fakeStorage(), completionDouble().api)

    expect(roundRecord()).toHaveTextContent('No rounds recorded')
    expect(startRound1()).toBeEnabled()
    expect(startRound1()).not.toHaveClass('clr-btn--primary')
    expect(screen.queryByRole('button', { name: /finish round/i })).toBeNull()

    await user.click(startRound1())
    expect(finishRound(1)).toBeEnabled()
    expect(finishRound(1)).not.toHaveClass('clr-btn--primary')
  })

  it('offers no completion of its own: the section’s forward action saves it (REQ-013)', () => {
    renderCircuit(circuitBlock(), fakeStorage(), completionDouble().api)

    expect(screen.queryByRole('button', { name: /^Complete/ })).not.toBeInTheDocument()
  })
})

describe('rounds are observations, never inferred', () => {
  it('reports no count when no round was recorded', () => {
    const { api, reportOutcome } = completionDouble()
    const block = circuitBlock()
    renderCircuit(block, fakeStorage(), api)

    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})
  })

  it('infers nothing from time: an untouched circuit long past its prescription has no count', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { api, reportOutcome } = completionDouble()
    const block = circuitBlock()
    renderCircuit(block, fakeStorage(), api)

    clock = START + 60 * 60_000
    await vi.advanceTimersByTimeAsync(2000)

    expect(roundRecord()).toHaveTextContent('No rounds recorded')
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})
  })

  it('infers nothing from a rest that ran out: only the recorded round counts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { api, reportOutcome } = completionDouble()
    const block = circuitBlock({ roundRestSeconds: 30 })
    renderCircuit(block, fakeStorage(), api)

    await user.click(startRound1())
    await user.click(finishRound(1))
    clock = START + 10 * 60_000
    await vi.advanceTimersByTimeAsync(2000)

    expect(restTimer()).toBeNull()
    expect(roundRecord()).toHaveTextContent('1 of 3 rounds recorded')
    expect(finishRound(2)).toBeInTheDocument()
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, { roundsCompleted: 1 })
  })

  it('reports the rounds the athlete recorded, and stops at the prescription', async () => {
    const user = userEvent.setup()
    const { api, reportOutcome } = completionDouble()
    const block = circuitBlock({ roundRestSeconds: 0 })
    renderCircuit(block, fakeStorage(), api)

    await user.click(startRound1())
    await user.click(finishRound(1))
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, { roundsCompleted: 1 })
    await user.click(finishRound(2))
    await user.click(finishRound(3))

    expect(roundRecord()).toHaveTextContent('3 of 3 rounds recorded')
    expect(screen.getByText('Every prescribed round is recorded.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /finish round/i })).toBeNull()
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, { roundsCompleted: 3 })
  })

  it('takes a mistaken round back to no count at all, never an observed zero', async () => {
    const user = userEvent.setup()
    const { api, reportOutcome } = completionDouble()
    const block = circuitBlock()
    renderCircuit(block, fakeStorage(), api)

    await user.click(startRound1())
    await user.click(finishRound(1))
    expect(screen.getByRole('timer', { name: 'Time remaining' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Take back a round' }))

    // The rest the tap started goes with it.
    expect(restTimer()).toBeNull()
    expect(roundRecord()).toHaveTextContent('No rounds recorded')
    expect(finishRound(1)).toBeInTheDocument()
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})
  })

  it('counts recorded rounds without a prescribed total', async () => {
    const user = userEvent.setup()
    const { api, reportOutcome } = completionDouble()
    const block = circuitBlock({ rounds: null, roundRestSeconds: 0 })
    renderCircuit(block, fakeStorage(), api)

    await user.click(startRound1())
    await user.click(finishRound(1))
    expect(roundRecord()).toHaveTextContent('1 round recorded')
    await user.click(finishRound(2))
    expect(roundRecord()).toHaveTextContent('2 rounds recorded')
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, { roundsCompleted: 2 })
  })

  it('reports no count at all for a circuit with nothing to perform', () => {
    const { api, reportOutcome } = completionDouble()
    const block = circuitBlock({ exercises: [] })
    renderCircuit(block, fakeStorage(), api)

    // Zero rounds of nothing is not an observation (DATA_MODEL §8).
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})
  })
})

describe('the shared rest', () => {
  it('starts once, at a recorded round boundary, with the block’s seconds', async () => {
    const user = userEvent.setup()
    renderCircuit(circuitBlock(), fakeStorage(), completionDouble().api)

    expect(restTimer()).not.toBeInTheDocument()
    await user.click(startRound1())
    // Starting the round's clock is not a round boundary: no rest yet.
    expect(restTimer()).not.toBeInTheDocument()
    await user.click(finishRound(1))

    expect(screen.getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('01:00')
    expect(screen.getByText('Rest between rounds')).toBeInTheDocument()
  })

  it('ends on its own when the block’s seconds have passed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderCircuit(circuitBlock({ roundRestSeconds: 30 }), fakeStorage(), completionDouble().api)

    await user.click(startRound1())
    await user.click(finishRound(1))
    expect(screen.getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('00:30')

    clock = START + 30_000
    await vi.advanceTimersByTimeAsync(1000)

    // No tap ended it: the clock did.
    expect(restTimer()).not.toBeInTheDocument()
    expect(finishRound(2)).toBeInTheDocument()
  })

  it('can be ended early with its one control, inside the card', async () => {
    const user = userEvent.setup()
    renderCircuit(circuitBlock(), fakeStorage(), completionDouble().api)

    await user.click(startRound1())
    await user.click(finishRound(1))
    const inside = within(blockCard())
    expect(inside.getAllByRole('button', { name: 'Start round 2' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /finish round/i })).toBeNull()

    await user.click(inside.getByRole('button', { name: 'Start round 2' }))
    expect(restTimer()).toBeNull()
    expect(finishRound(2)).toBeInTheDocument()
  })

  it('records the first round after an expired rest on the first tap, including a remount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    for (const restoreAfterExpiry of [false, true]) {
      clock = START
      const storage = fakeStorage()
      const block = circuitBlock({ roundRestSeconds: 30 })
      let mounted = renderCircuit(block, storage, completionDouble().api)

      await user.click(startRound1())
      await user.click(finishRound(1))

      if (restoreAfterExpiry) mounted.unmount()
      clock = START + 30_000
      if (restoreAfterExpiry) {
        mounted = renderCircuit(block, storage, completionDouble().api)
      } else {
        await vi.advanceTimersByTimeAsync(1000)
      }

      expect(restTimer()).not.toBeInTheDocument()
      await user.click(finishRound(2))

      expect(roundRecord()).toHaveTextContent('2 of 3 rounds recorded')
      expect(readCircuitState(storage, block.blockId)).toMatchObject({ round: 3 })
      mounted.unmount()
    }
  })
})

describe('surviving a refresh', () => {
  it('comes back to the rounds the athlete recorded', async () => {
    const user = userEvent.setup()
    const storage = fakeStorage()
    const block = circuitBlock({ roundRestSeconds: 0 })
    const first = renderCircuit(block, storage, completionDouble().api)

    await user.click(startRound1())
    await user.click(finishRound(1))
    await user.click(finishRound(2))
    first.unmount()

    const { api, reportOutcome } = completionDouble()
    renderCircuit(block, storage, api)

    expect(roundRecord()).toHaveTextContent('2 of 3 rounds recorded')
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, { roundsCompleted: 2 })
  })

  it('comes back into the rest it was in, with the time that is left', async () => {
    const user = userEvent.setup()
    const storage = fakeStorage()
    const block = circuitBlock()
    const first = renderCircuit(block, storage, completionDouble().api)

    await user.click(startRound1())
    await user.click(finishRound(1))
    first.unmount()
    clock = START + 20_000
    renderCircuit(block, storage, completionDouble().api)

    // Forty of the sixty seconds are left: the rest was measured from when it
    // started, not from when the page came back.
    expect(screen.getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('00:40')
  })

  it('starts with nothing recorded when the stored record cannot be used', () => {
    const storage = fakeStorage()
    storage.setItem(WORKOUT_CIRCUIT_STORAGE_KEY, 'not json')
    const { api, reportOutcome } = completionDouble()
    const block = circuitBlock()

    renderCircuit(block, storage, api)

    expect(roundRecord()).toHaveTextContent('No rounds recorded')
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})
  })

  it('still shows the whole circuit after a movement was swapped out', async () => {
    const user = userEvent.setup()
    const storage = fakeStorage()
    const block = circuitBlock({ roundRestSeconds: 0 })
    const first = renderCircuit(block, storage, completionDouble().api)

    await user.click(startRound1())
    await user.click(finishRound(1))
    first.unmount()

    const shortened: BlockProgress = {
      ...block,
      exercises: block.exercises.slice(0, 1),
      exerciseCount: 1,
    }
    renderCircuit(shortened, storage, completionDouble().api)

    expect(movementRows()).toHaveLength(1)
    expect(roundRecord()).toHaveTextContent('1 of 3 rounds recorded')
  })
})

describe('the circuit draws with the shared block frame', () => {
  it('is one card, with the movements as rows of one list and never a card inside it', () => {
    renderCircuit(circuitBlock(), fakeStorage(), completionDouble().api)

    const rows = movementRows()
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(row.tagName).toBe('LI')
      expect(row.closest('.clr-card')).toBe(blockCard())
    }
    expect(nestedCards()).toEqual([])
  })

  it('carries the identity row, the work, the rest line and the round record inside the card', () => {
    renderCircuit(circuitBlock(), fakeStorage(), completionDouble().api)

    const inside = within(blockCard())
    // TASK-003 (AC-C08-01): the format badge, and the rounds beside it.
    expect(inside.getByText('CIRCUIT')).toBeInTheDocument()
    expect(inside.getByText('3 ROUNDS')).toBeInTheDocument()
    expect(inside.getByText('3 movements')).toBeInTheDocument()
    expect(inside.getByText('Each round:')).toBeInTheDocument()
    expect(inside.getByText('60s rest between rounds')).toBeInTheDocument()
    // Announced as it changes: the count is a live status line.
    expect(roundRecord()).toHaveAttribute('role', 'status')
    expect(roundRecord()).toHaveTextContent('No rounds recorded')
    expect(inside.getByRole('button', { name: 'Start round 1' })).toBeInTheDocument()
  })

  it('draws the rest countdown beside the card, never inside it', async () => {
    const user = userEvent.setup()
    renderCircuit(circuitBlock(), fakeStorage(), completionDouble().api)

    await user.click(startRound1())
    await user.click(finishRound(1))

    const timer = screen.getByRole('timer', { name: 'Time remaining' })
    expect(blockCard().contains(timer)).toBe(false)
    expect(nestedCards()).toEqual([])
  })

  it('is still one card when nothing is left to perform', () => {
    renderCircuit(circuitBlock({ exercises: [] }), fakeStorage(), completionDouble().api)

    expect(cards()).toHaveLength(1)
    expect(screen.queryByRole('list', { name: 'Movements in this circuit' })).toBeNull()
    expect(screen.queryByText('Each round:')).not.toBeInTheDocument()
  })
})

describe('optional, compact load entry', () => {
  it('opens the set form for the one movement asked for, and closes it again', async () => {
    const user = userEvent.setup()
    renderLoggingCircuit()

    await user.click(screen.getByRole('button', { name: 'Rest for back squat' }))

    const form = formFor('back squat')
    expect(screen.getAllByRole('form', { name: /^Log set/ })).toHaveLength(1)
    for (const label of ['Weight', 'Reps']) {
      const field = form.getByLabelText(label)
      expect(field).toHaveClass('clr-input')
      expect(field.closest('.clr-set-sheet__measures')).not.toHaveClass('clr-chamfer')
    }
    // Still in the row for its movement, and the order is unchanged.
    expect(within(movementRows()[0]!).getByRole('form')).toBeInTheDocument()
    expect(within(movementRows()[1]!).queryByRole('form')).toBeNull()
    // Opened, the movement still states no rest of its own: the rest is the block's.
    expect(within(movementRows()[0]!).queryByText(/^Rest \d/)).toBeNull()
    expect(nestedCards()).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Hide load entry for back squat' }))
    expect(screen.queryByRole('form', { name: /^Log set/ })).toBeNull()
  })

  it('writes the set against its movement and block, and records no round for it', async () => {
    const user = userEvent.setup()
    const { workout, block, storage, reportOutcome } = renderLoggingCircuit()

    await logSet(user, 'back squat', 1)

    await waitFor(() => expect(workout.loggedSets()).toHaveLength(1))
    expect(workout.loggedSets()[0]).toMatchObject({
      exerciseId: block.exercises[0]!.exerciseId,
      blockId: block.blockId,
    })
    // TASK-020 (C46): the saved set is confirmed, not replaced by set 2's form.
    expect(
      await screen.findByRole('dialog', { name: 'Set 1 logged' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: /^Log set \d+ of back squat$/ })).toBeNull()

    // A set is not a round: nothing was recorded for it, and no rest raised.
    expect(roundRecord()).toHaveTextContent('No rounds recorded')
    expect(readCircuitState(storage, block.blockId)).toBeNull()
    expect(restTimer()).not.toBeInTheDocument()
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})

    // Closed again, the row still says a set is behind it. TASK-044: the
    // entry is the focused log, a modal over the card, closed with its X first.
    await user.click(screen.getByRole('button', { name: 'Close log' }))
    await user.click(screen.getByRole('button', { name: 'Hide load entry for back squat' }))
    expect(within(movementRows()[0]!).getByText('1 set logged')).toBeInTheDocument()
  })

  it('holds only the saving movement’s action busy while its set is in flight', async () => {
    const user = userEvent.setup()
    let release: (() => void) | null = null
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const { workout, attempts } = renderLoggingCircuit({ held })

    await logSet(user, 'back squat', 1)

    // TASK-020 (C46): set 1 is confirmed while it is in flight; set 2 is
    // opened deliberately from the movement's Rest.
    await screen.findByRole('dialog', { name: 'Set 1 logged' })
    const busy = formFor('back squat', 2).getByRole('button')
    await waitFor(() => expect(busy).toBeDisabled())
    expect(busy).toHaveAttribute('aria-busy', 'true')

    // The other movement and the round stay the athlete's to press. TASK-044:
    // each entry is the focused log, a modal, so one is closed with its X
    // before the card behind it is used.
    await user.click(screen.getByRole('button', { name: 'Close log' }))
    await user.click(screen.getByRole('button', { name: 'Rest for romanian deadlift' }))
    expect(formFor('romanian deadlift').getByRole('button', { name: 'Log set 1' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Close log' }))
    expect(startRound1()).toBeEnabled()

    const stillBusy = formFor('back squat', 2).getByRole('button')
    expect(stillBusy).toBeDisabled()
    await user.click(stillBusy)
    expect(attempts).toHaveLength(1)

    await act(async () => {
      release?.()
      await held
    })

    await waitFor(() =>
      expect(within(movementRows()[0]!).getByText('Saved')).toBeInTheDocument(),
    )
    expect(workout.loggedSets()).toHaveLength(1)
  })

  it('keeps a refused set as unsaved while a round is recorded, and resends it under the same id', async () => {
    const user = userEvent.setup()
    let online = false
    const { workout, attempts, block, storage } = renderLoggingCircuit({
      refuse: () => !online,
    })

    await logSet(user, 'back squat', 1)

    // The movement's saved rows (TASK-020: its sheet's confirmation, drawn in
    // place here, reads the same status back).
    const first = within(within(movementRows()[0]!).getByRole('list', { name: 'Logged sets' }))
    expect(await first.findByText('On this device only')).toBeInTheDocument()
    expect(workout.loggedSets()).toEqual([])

    // Offline does not hold the circuit: the round still records and persists.
    await user.click(startRound1())
    await user.click(finishRound(1))
    expect(readCircuitState(storage, block.blockId)).toMatchObject({ round: 2 })

    online = true
    await logSet(user, 'romanian deadlift', 1)

    await waitFor(() => expect(workout.loggedSets()).toHaveLength(2))
    expect(attempts.filter((entry) => entry.id === mintedId(0))).toHaveLength(2)
    await waitFor(() =>
      expect(first.queryByText('On this device only')).not.toBeInTheDocument(),
    )
    expect(first.getByText('Saved')).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TASK-021 (REQ-021; C48, G13; R18, R103, R104, R105; V13) — the recorded
// round in the shared focused logging dialog, over the one circuit controller.
// ─────────────────────────────────────────────────────────────────────────────

/** The recorded round's dialog element, open or not, by its title. */
function recordedLog(round: number): HTMLDialogElement {
  const title = screen.getAllByRole('heading', { name: `Round ${round} recorded`, hidden: true })[0]
  const dialog = title?.closest('dialog')
  if (dialog == null) throw new Error(`no Round ${round} recorded dialog`)
  return dialog
}

function openLogs(): HTMLDialogElement[] {
  return Array.from(document.querySelectorAll<HTMLDialogElement>('dialog.clr-accepted-log[open]'))
}

/** Every key the circuit wrote, so a write to anything else would show. */
function recordingStorage(): ShellStorage & { keys: Set<string> } {
  const inner = fakeStorage()
  const keys = new Set<string>()
  return {
    keys,
    getItem: (key) => inner.getItem(key),
    setItem: (key, value) => {
      keys.add(key)
      inner.setItem(key, value)
    },
    removeItem: (key) => {
      keys.add(key)
      inner.removeItem(key)
    },
  }
}

/** Start round 1, let `seconds` pass on the wall clock, and Finish round 1. */
async function recordFirstRound(
  user: ReturnType<typeof userEvent.setup>,
  seconds: number,
) {
  await user.click(startRound1())
  clock += seconds * 1000
  await act(() => vi.advanceTimersByTimeAsync(1000))
  await user.click(finishRound(1))
}

describe('TASK-021 the recorded round in the shared focused log', () => {
  it('AC-R021-02 Finish round N opens Round N recorded: the framed Close log X alone in the header, the round time read back, the circuit rest at the log’s full width and Take back this round', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { api, reportOutcome } = completionDouble()
    const block = circuitBlock()
    renderCircuit(block, fakeStorage(), api)

    await recordFirstRound(user, 32)

    const dialog = recordedLog(1)
    expect(dialog).toHaveAttribute('open')
    expect(dialog).toHaveClass('clr-accepted-log')
    expect(openLogs()).toEqual([dialog])
    // Not inside the card: portalled like every focused log.
    expect(blockCard().contains(dialog)).toBe(false)

    // The overlay's own header: the title, then the framed icon-only X.
    const head = dialog.querySelector<HTMLElement>('[data-logging-head]')!
    expect(within(head).getByRole('heading', { name: 'Round 1 recorded' })).toBeInTheDocument()
    const close = within(head).getByRole('button', { name: 'Close log' })
    expect(close).toHaveTextContent('')
    expect(within(dialog).getAllByRole('heading')).toHaveLength(1)
    expect(within(dialog).queryByText(/^close$/i)).toBeNull()
    expect(document.activeElement).toBe(close)

    // The recorded round time, read back from the stored history.
    const status = within(dialog).getByRole('status')
    expect(status).toHaveTextContent('00:32')
    expect(status).toHaveTextContent('32 seconds round time recorded')

    // The circuit's own rest, the shared whole timer body, drawn once: in the log.
    expect(within(dialog).getByText('Rest after round 1')).toBeInTheDocument()
    const timer = within(dialog).getByRole('timer', { name: 'Time remaining' })
    expect(timer).toHaveTextContent('01:00')
    expect(timer.closest('[data-timer-frame]')).toHaveAttribute('data-timer-frame', 'body')
    expect(screen.getAllByRole('timer', { name: 'Time remaining' })).toEqual([timer])

    // A secondary action (the reference's), never the screen's primary or a critical one.
    const takeBack = within(dialog).getByRole('button', { name: 'Take back this round' })
    expect(takeBack).toHaveClass('clr-btn')
    expect(takeBack).not.toHaveClass('clr-btn--primary', 'clr-btn--critical', 'clr-btn--quiet')
    expect(takeBack.closest('.clr-timed-actions')).not.toBeNull()
    // Nothing invented: no movement actuals, no extra rest controls.
    expect(within(dialog).queryByRole('textbox')).toBeNull()
    expect(within(dialog).queryByRole('spinbutton')).toBeNull()
    expect(within(dialog).queryByRole('button', { name: /add|skip/i })).toBeNull()

    // The card counts the round, and the block reports it.
    expect(roundRecord()).toHaveTextContent('1 of 3 rounds recorded')
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, { roundsCompleted: 1 })
  })

  it('AC-R021-02 Take back this round un-records the round, ends its rest, closes the log and resumes the round’s own clock, with focus on Finish round', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { api, reportOutcome } = completionDouble()
    const storage = fakeStorage()
    const block = circuitBlock()
    renderCircuit(block, storage, api)

    await recordFirstRound(user, 32)
    const dialog = recordedLog(1)
    clock += 5_000
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(within(dialog).getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('00:55')

    await user.click(within(dialog).getByRole('button', { name: 'Take back this round' }))

    expect(dialog).not.toHaveAttribute('open')
    expect(openLogs()).toEqual([])
    expect(restTimer()).toBeNull()
    expect(roundRecord()).toHaveTextContent('No rounds recorded')
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})
    // The round it re-opens resumes the clock it was finished on.
    expect(screen.getByRole('timer', { name: 'Round 1 time' })).toHaveTextContent('00:37')
    expect(readCircuitState(storage, block.blockId)).toMatchObject({ round: 1, restStartedAt: null, history: [] })
    expect(screen.queryByRole('list', { name: 'Round times' })).toBeNull()
    expect(document.activeElement).toBe(finishRound(1))
  })

  it('AC-R021-02 the rest runs on in the log and ends it: at rest end the log closes by itself, records nothing more and the next round’s clock runs; the card’s early Start round ends it too', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { api, reportOutcome } = completionDouble()
    const block = circuitBlock({ roundRestSeconds: 30 })
    renderCircuit(block, fakeStorage(), api)

    await recordFirstRound(user, 32)
    const dialog = recordedLog(1)
    clock += 20_000
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(within(dialog).getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('00:10')
    expect(dialog).toHaveAttribute('open')

    clock += 10_000
    await act(() => vi.advanceTimersByTimeAsync(1000))

    expect(dialog).not.toHaveAttribute('open')
    expect(restTimer()).toBeNull()
    expect(roundRecord()).toHaveTextContent('1 of 3 rounds recorded')
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, { roundsCompleted: 1 })
    expect(finishRound(2)).toBeInTheDocument()
    expect(document.activeElement).toBe(finishRound(2))
    // Never reopened by time passing.
    clock += 5 * 60_000
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(openLogs()).toEqual([])

    // Round 2 is recorded into its rest, then the card's Start round 3 —
    // the rest's existing early end — ends the rest and the log with it.
    await user.click(finishRound(2))
    const second = recordedLog(2)
    expect(second).toHaveAttribute('open')
    fireEvent.click(within(blockCard()).getByRole('button', { name: 'Start round 3' }))
    expect(second).not.toHaveAttribute('open')
    expect(finishRound(3)).toBeInTheDocument()
    expect(roundRecord()).toHaveTextContent('2 of 3 rounds recorded')
  })

  it('AC-R021-02 Close log and Escape close it without changing anything: the same rest goes on, back on the card, with Start round N and Take back a round', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { api, reportOutcome } = completionDouble()
    const storage = fakeStorage()
    const block = circuitBlock()
    renderCircuit(block, storage, api)

    await recordFirstRound(user, 32)
    const dialog = recordedLog(1)
    clock += 10_000
    await act(() => vi.advanceTimersByTimeAsync(1000))
    const stored = readCircuitState(storage, block.blockId)

    await user.click(within(dialog).getByRole('button', { name: 'Close log' }))

    expect(dialog).not.toHaveAttribute('open')
    expect(readCircuitState(storage, block.blockId)).toEqual(stored)
    const timer = screen.getByRole('timer', { name: 'Time remaining' })
    expect(timer).toHaveTextContent('00:50')
    expect(blockCard().contains(timer)).toBe(false)
    const startRound2 = within(blockCard()).getByRole('button', { name: 'Start round 2' })
    expect(document.activeElement).toBe(startRound2)
    expect(roundRecord()).toHaveTextContent('1 of 3 rounds recorded')
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, { roundsCompleted: 1 })

    // Round 2 from the card's early start, recorded, then dismissed by Escape.
    await user.click(startRound2)
    clock += 40_000
    await act(() => vi.advanceTimersByTimeAsync(1000))
    await user.click(finishRound(2))
    const second = recordedLog(2)
    expect(within(second).getByRole('status')).toHaveTextContent('00:40')
    fireEvent(second, new Event('cancel', { cancelable: true }))
    expect(second).not.toHaveAttribute('open')
    expect(roundRecord()).toHaveTextContent('2 of 3 rounds recorded')

    // The card's Take back a round is still the Undo once the log is closed.
    await user.click(screen.getByRole('button', { name: 'Take back a round' }))
    expect(roundRecord()).toHaveTextContent('1 of 3 rounds recorded')
    expect(restTimer()).toBeNull()
    expect(finishRound(2)).toBeInTheDocument()
    expect(openLogs()).toEqual([])
  })

  it('AC-R021-02 with no rest to run — none prescribed, or the last round — the log reads the round and Take back this round with no timer, and stays until closed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { api, reportOutcome } = completionDouble()
    const block = circuitBlock({ roundRestSeconds: 0 })
    renderCircuit(block, fakeStorage(), api)

    await recordFirstRound(user, 45)
    const dialog = recordedLog(1)
    expect(within(dialog).getByRole('status')).toHaveTextContent('00:45')
    expect(within(dialog).queryByRole('timer')).toBeNull()
    expect(within(dialog).queryByText(/^Rest after/)).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Take back this round' })).toBeInTheDocument()
    // The next round's clock starts at once, behind the log, as before.
    expect(finishRound(2)).toBeInTheDocument()
    clock += 2 * 60_000
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(dialog).toHaveAttribute('open')
    await user.click(within(dialog).getByRole('button', { name: 'Close log' }))
    expect(dialog).not.toHaveAttribute('open')

    await user.click(finishRound(2))
    await user.click(within(recordedLog(2)).getByRole('button', { name: 'Close log' }))
    await user.click(finishRound(3))
    const last = recordedLog(3)
    expect(last).toHaveAttribute('open')
    expect(within(last).queryByRole('timer')).toBeNull()
    expect(screen.getByText('Every prescribed round is recorded.')).toBeInTheDocument()
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, { roundsCompleted: 3 })

    // Taking the last round back from its log reopens round 3 on its clock.
    await user.click(within(last).getByRole('button', { name: 'Take back this round' }))
    expect(last).not.toHaveAttribute('open')
    expect(finishRound(3)).toBeInTheDocument()
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, { roundsCompleted: 2 })
  })

  it('AC-C48-01 round recording, active round time and the round-time history are kept through the log, and a refresh comes back to the card, never to the log', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const storage = fakeStorage()
    const block = circuitBlock({ roundRestSeconds: 30 })
    const first = renderCircuit(block, storage, completionDouble().api)

    await recordFirstRound(user, 32)
    clock += 30_000
    await act(() => vi.advanceTimersByTimeAsync(1000))
    // Round 2's clock started when the rest ended, without a tap.
    clock += 41_000
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(screen.getByRole('timer', { name: 'Round 2 time' })).toHaveTextContent('00:41')
    await user.click(finishRound(2))
    expect(within(recordedLog(2)).getByRole('status')).toHaveTextContent('00:41')

    const history = screen.getByRole('list', { name: 'Round times' })
    expect(within(history).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Round 100:3232 seconds',
      'Round 200:4141 seconds',
    ])

    // Refreshed mid-rest: the card, its rest and its history; no log.
    first.unmount()
    clock += 10_000
    const { api, reportOutcome } = completionDouble()
    renderCircuit(block, storage, api)
    expect(openLogs()).toEqual([])
    expect(screen.getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('00:20')
    expect(roundRecord()).toHaveTextContent('2 of 3 rounds recorded')
    expect(within(screen.getByRole('list', { name: 'Round times' })).getAllByRole('listitem')).toHaveLength(2)
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, { roundsCompleted: 2 })
  })

  it('AC-R021-01 one circuit controller: the log’s taps are the circuit’s own Finish round and Take back, written only to the circuit record, with the original scoring', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { api, reportOutcome } = completionDouble()
    const storage = recordingStorage()
    const block = circuitBlock()
    const shape = circuitShape(block)
    renderCircuit(block, storage, api)

    await user.click(startRound1())
    const running = readCircuitState(storage, block.blockId)!
    clock += 32_000
    await act(() => vi.advanceTimersByTimeAsync(1000))
    await user.click(finishRound(1))
    const finished = readCircuitState(storage, block.blockId)!
    expect(finished).toEqual(finishCircuitRound(running, shape, clock))

    await user.click(within(recordedLog(1)).getByRole('button', { name: 'Take back this round' }))
    expect(readCircuitState(storage, block.blockId)).toEqual(takeBackRound(finished, shape))

    // Only the circuit's own record: no ladder, timed-format or other state.
    expect([...storage.keys]).toEqual([WORKOUT_CIRCUIT_STORAGE_KEY])
    // The original scoring: a taken-back round leaves no count at all.
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})
    expect(reportOutcome.mock.calls.map(([, outcome]) => outcome)).toEqual(
      expect.arrayContaining([{ roundsCompleted: 1 }, {}]),
    )
  })
})
