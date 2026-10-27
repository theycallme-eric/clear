/**
 * EXE-03 / REQ-014 (U40) acceptance, as the athlete meets it:
 *
 *   · the complete ordered circuit — every movement with its per-round
 *     target, the total rounds and the shared rest — is on the card from the
 *     start, and no movement is singled out as the one to do now;
 *   · nothing is compulsory: there is no per-movement step, and recording a
 *     round is one optional tap that starts the shared rest;
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
 * the movement's half-sheet, opened from its opened entry's Log set.
 */
function formFor(name: string, setNumber = 1) {
  if (screen.queryByRole('form', { name: new RegExp(`^Log set \\d+ of ${name}$`) }) === null) {
    const log = screen
      .getAllByRole('heading', { name: new RegExp(`${name}$`) })
      .map((heading) => heading.closest('section'))
      .map((section) => (section === null ? null : within(section).queryByRole('button', { name: 'Log set' })))
      .find((button) => button !== null)
    if (log === null || log === undefined) throw new Error(`no Log set for ${name}`)
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
  const open = screen.queryByRole('button', { name: `Log load and reps for ${name}` })
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

    expect(screen.getByText('CIRCUIT · 3 ROUNDS')).toBeInTheDocument()
    expect(screen.getAllByText('60s rest between rounds')).toHaveLength(1)
    // Rest is the block's: no movement states one of its own.
    for (const row of movementRows()) expect(within(row).queryByText(/rest/i)).toBeNull()
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
        screen.getByRole('button', { name: `Log load and reps for ${name}` }),
      ).toHaveAttribute('aria-expanded', 'false')
    }
  })

  it('offers round recording as one optional, secondary tap', () => {
    renderCircuit(circuitBlock(), fakeStorage(), completionDouble().api)

    expect(roundRecord()).toHaveTextContent('No rounds recorded')
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

    await user.click(finishRound(1))
    clock = START + 10 * 60_000
    await vi.advanceTimersByTimeAsync(2000)

    expect(screen.queryByRole('timer')).toBeNull()
    expect(roundRecord()).toHaveTextContent('1 of 3 rounds recorded')
    expect(finishRound(2)).toBeInTheDocument()
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, { roundsCompleted: 1 })
  })

  it('reports the rounds the athlete recorded, and stops at the prescription', async () => {
    const user = userEvent.setup()
    const { api, reportOutcome } = completionDouble()
    const block = circuitBlock({ roundRestSeconds: 0 })
    renderCircuit(block, fakeStorage(), api)

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

    await user.click(finishRound(1))
    expect(screen.getByRole('timer', { name: 'Time remaining' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Take back a round' }))

    // The rest the tap started goes with it.
    expect(screen.queryByRole('timer')).toBeNull()
    expect(roundRecord()).toHaveTextContent('No rounds recorded')
    expect(finishRound(1)).toBeInTheDocument()
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})
  })

  it('counts recorded rounds without a prescribed total', async () => {
    const user = userEvent.setup()
    const { api, reportOutcome } = completionDouble()
    const block = circuitBlock({ rounds: null, roundRestSeconds: 0 })
    renderCircuit(block, fakeStorage(), api)

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

    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    await user.click(finishRound(1))

    expect(screen.getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('01:00')
    expect(screen.getByText('Rest between rounds')).toBeInTheDocument()
  })

  it('ends on its own when the block’s seconds have passed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderCircuit(circuitBlock({ roundRestSeconds: 30 }), fakeStorage(), completionDouble().api)

    await user.click(finishRound(1))
    expect(screen.getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('00:30')

    clock = START + 30_000
    await vi.advanceTimersByTimeAsync(1000)

    // No tap ended it: the clock did.
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(finishRound(2)).toBeInTheDocument()
  })

  it('can be ended early with its one control, inside the card', async () => {
    const user = userEvent.setup()
    renderCircuit(circuitBlock(), fakeStorage(), completionDouble().api)

    await user.click(finishRound(1))
    const inside = within(blockCard())
    expect(inside.getAllByRole('button', { name: 'Start round 2' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /finish round/i })).toBeNull()

    await user.click(inside.getByRole('button', { name: 'Start round 2' }))
    expect(screen.queryByRole('timer')).toBeNull()
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

      await user.click(finishRound(1))

      if (restoreAfterExpiry) mounted.unmount()
      clock = START + 30_000
      if (restoreAfterExpiry) {
        mounted = renderCircuit(block, storage, completionDouble().api)
      } else {
        await vi.advanceTimersByTimeAsync(1000)
      }

      expect(screen.queryByRole('timer')).not.toBeInTheDocument()
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
    expect(inside.getByText('CIRCUIT · 3 ROUNDS')).toBeInTheDocument()
    expect(inside.getByText('3 movements')).toBeInTheDocument()
    expect(inside.getByText('Each round:')).toBeInTheDocument()
    expect(inside.getByText('60s rest between rounds')).toBeInTheDocument()
    // Announced as it changes: the count is a live status line.
    expect(roundRecord()).toHaveAttribute('role', 'status')
    expect(roundRecord()).toHaveTextContent('No rounds recorded')
    expect(inside.getByRole('button', { name: 'Finish round 1' })).toBeInTheDocument()
  })

  it('draws the rest countdown beside the card, never inside it', async () => {
    const user = userEvent.setup()
    renderCircuit(circuitBlock(), fakeStorage(), completionDouble().api)

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

    await user.click(screen.getByRole('button', { name: 'Log load and reps for back squat' }))

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
    expect(
      await screen.findByRole('form', { name: 'Log set 2 of back squat' }),
    ).toBeInTheDocument()

    // A set is not a round: nothing was recorded for it, and no rest raised.
    expect(roundRecord()).toHaveTextContent('No rounds recorded')
    expect(readCircuitState(storage, block.blockId)).toBeNull()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})

    // Closed again, the row still says a set is behind it.
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

    await screen.findByRole('form', { name: 'Log set 2 of back squat' })
    const busy = formFor('back squat', 2).getByRole('button')
    await waitFor(() => expect(busy).toBeDisabled())
    expect(busy).toHaveAttribute('aria-busy', 'true')

    // The other movement and the round stay the athlete's to press.
    await user.click(screen.getByRole('button', { name: 'Log load and reps for romanian deadlift' }))
    expect(formFor('romanian deadlift').getByRole('button', { name: 'Log set 1' })).toBeEnabled()
    expect(finishRound(1)).toBeEnabled()

    await user.click(busy)
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

    const first = within(movementRows()[0]!)
    expect(await first.findByText('On this device only')).toBeInTheDocument()
    expect(workout.loggedSets()).toEqual([])

    // Offline does not hold the circuit: the round still records and persists.
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
