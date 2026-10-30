/**
 * EXE-02's standard block, through the renderer the shell actually dispatches
 * to and the real set-logging provider behind it.
 *
 * Two kinds of claim, kept apart:
 *
 *   · **the frame** is a claim about the screen — one card, the movements as
 *     rows of one list, one completion at the foot, no card in a card — and is
 *     read off the document;
 *   · **progression and persistence** are claims about what the shell is
 *     handed and what the screen says next, so they are read off the client and
 *     off the set list: the set that was written, the set offered after it, and
 *     where a set the database refused has got to.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  BlockCompletionContext,
  type BlockCompletionApi,
  type BlockOutcome,
} from '../state/block-completion'
import { createError, err, ErrorCode } from '../state/errors'
import { SetLoggingProvider } from '../state/set-logging-provider'
import { useSetLogging, type SetLogEntry } from '../state/set-logging'
import { sessionProgress, type BlockProgress } from '../state/workout-progress'
import { AppProviders } from '../test/render'
import {
  createWorkoutDouble,
  FIXTURE_SESSION_ID,
  snapshotFixture,
  type BlockFixture,
  type ExerciseFixture,
  type WorkoutDouble,
} from '../test/workout-double'
import { BlockSlot } from './block-renderers'

/** The ids the provider mints, one per set logged, in order. */
const MINTED = [
  'a0000001-0000-4000-8000-000000000000',
  'a0000002-0000-4000-8000-000000000000',
  'a0000003-0000-4000-8000-000000000000',
]

const TWO_MOVEMENTS: ExerciseFixture[] = [
  { prescription: { exercise_id: 'back-squat', order_index: 0 } },
  { prescription: { exercise_id: 'romanian-deadlift', order_index: 1 } },
]

interface MountOptions {
  block?: BlockFixture
  /** Refuses a set-log write, by attempt number; null lets it through. */
  refuse?: (attempt: number) => boolean
  recorded?: boolean
}

interface Mounted {
  container: HTMLElement
  workout: WorkoutDouble
  block: BlockProgress
  attempts: SetLogEntry[]
  reportOutcome: ReturnType<typeof vi.fn<(blockId: string, outcome: BlockOutcome) => void>>
}

/** The shell's one recovery action, reachable without the shell's notice. */
function RetryProbe() {
  const { retrySync } = useSetLogging()
  return (
    <button type="button" onClick={retrySync}>
      Retry sync
    </button>
  )
}

function mount(options: MountOptions = {}): Mounted {
  const snapshot = snapshotFixture({
    sections: [
      {
        title: 'Primary lift',
        sectionType: 'primary_lift',
        blocks: [{ structureType: 'standard', exercises: TWO_MOVEMENTS, ...options.block }],
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
          return options.refuse?.(attempts.length)
            ? err(createError(ErrorCode.NETWORK_OFFLINE))
            : base.clients.setLogs.log(entry)
        },
      },
    },
  }
  const block = sessionProgress(snapshot).sections[0].blocks[0]

  const reportOutcome = vi.fn<(blockId: string, outcome: BlockOutcome) => void>()
  const completion: BlockCompletionApi = {
    reportOutcome,
    isBlockRecorded: () => options.recorded ?? false,
  }

  let minted = 0
  const { container } = render(
    <AppProviders workout={workout.clients}>
      <BlockCompletionContext value={completion}>
        <SetLoggingProvider
          sessionId={FIXTURE_SESSION_ID}
          storage={null}
          exercises={block.exercises}
          weightUnit="kg"
          onFailure={() => {}}
          newId={() => MINTED[minted++] ?? MINTED[MINTED.length - 1]}
        >
          {/* Dispatched rather than named: the registry decides the renderer. */}
          <BlockSlot block={block} />
          <RetryProbe />
        </SetLoggingProvider>
      </BlockCompletionContext>
    </AppProviders>,
  )

  return { container, workout, block, attempts, reportOutcome }
}

/** The movement's entry, in its half-sheet — opened from the card's Log set. */
function formFor(name: string, setNumber = 1) {
  if (screen.queryByRole('form', { name: new RegExp(`^Log set \\d+ of ${name}$`) }) === null) {
    const movement = screen.getByRole('heading', { name: new RegExp(`${name}$`) }).closest('section')!
    fireEvent.click(within(movement).getByRole('button', { name: 'Rest' }))
  }
  return within(screen.getByRole('form', { name: `Log set ${setNumber} of ${name}` }))
}

async function logSquat(setNumber: number, weight?: string, reps?: string) {
  const user = userEvent.setup()
  const form = formFor('back squat', setNumber)
  if (weight !== undefined) await user.type(form.getByLabelText('Weight'), weight)
  // The prescribed reps are a suggestion; an entered number replaces it.
  if (reps !== undefined) await user.clear(form.getByLabelText('Reps'))
  if (reps !== undefined) await user.type(form.getByLabelText('Reps'), reps)
  await user.click(form.getByRole('button', { name: `Log set ${setNumber}` }))
}

describe('a standard block is one card of the shared frame', () => {
  it('draws one card, with no card inside it, however many movements it holds', () => {
    const { container } = mount()

    expect(container.querySelectorAll('.clr-card')).toHaveLength(1)
    expect(container.querySelector('.clr-card .clr-card')).toBeNull()
  })

  it('states the structure and the size of the block once, at the head of the card', () => {
    const { container } = mount()

    const card = within(container.querySelector('.clr-card') as HTMLElement)
    expect(card.getAllByText('2 movements')).toHaveLength(1)
  })

  it('lists its movements as rows in prescribed order, each with its own set form', () => {
    mount()

    const list = screen.getByRole('list', { name: 'Movements in this block' })
    const rows = Array.from(list.children) as HTMLElement[]
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => within(row).getByRole('heading').textContent)).toEqual([
      'back squat',
      'romanian deadlift',
    ])
    for (const row of rows) {
      // Each movement has its own explicit Log set; the fields are in the sheet.
      expect(within(row).getAllByRole('button', { name: 'Rest' })).toHaveLength(1)
      expect(within(row).queryByRole('form')).toBeNull()
      // A row, not a frame: no movement is a card or a chamfered panel.
      expect(row).not.toHaveClass('clr-card', 'clr-chamfer')
    }
  })

  it('states each movement’s own rest, and no block-level rest', () => {
    mount({ block: { structureType: 'standard', exercises: TWO_MOVEMENTS, roundRestSeconds: 120 } })

    expect(screen.getAllByText('Rest 90s')).toHaveLength(2)
    expect(screen.queryByText(/after/)).not.toBeInTheDocument()
  })

  it('says it is saved inside the card, below the movements', () => {
    const { container } = mount({ recorded: true })

    const card = container.querySelector('.clr-card') as HTMLElement
    const saved = within(card).getAllByText('Block saved')
    expect(saved).toHaveLength(1)

    const list = screen.getByRole('list', { name: 'Movements in this block' })
    expect(
      list.compareDocumentPosition(saved[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('says an emptied block is empty, and still reports to the shell', () => {
    const mounted = mount({
      block: {
        structureType: 'standard',
        exercises: [
          { prescription: { exercise_id: 'back-squat', revision_status: 'superseded' } },
        ],
      },
    })

    expect(screen.getByText(/every movement in it was swapped\s+out/)).toBeInTheDocument()
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Movements in this block' })).not.toBeInTheDocument()
    expect(mounted.reportOutcome).toHaveBeenLastCalledWith(mounted.block.blockId, {})
  })
})

describe('completion is the shell’s, with nothing a standard block did not observe', () => {
  it('reports the empty outcome, and offers no completion of its own (REQ-013)', () => {
    const { block, reportOutcome } = mount()

    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})
    expect(screen.queryByRole('button', { name: /^Complete/ })).not.toBeInTheDocument()
  })

  it('says a saved block is saved, and still lets a set be logged', () => {
    mount({ recorded: true })

    expect(screen.getByText('Block saved')).toBeInTheDocument()
    expect(formFor('back squat').getByRole('button', { name: 'Log set 1' })).toBeEnabled()
  })
})

describe('set progression and persistence', () => {
  it('writes the set against the movement and block it was performed in, with the unit', async () => {
    const { workout, block } = mount()

    await logSquat(1, '60', '8')

    await waitFor(() =>
      expect(workout.loggedSets()).toEqual([
        {
          id: MINTED[0],
          exerciseId: block.exercises[0].exerciseId,
          blockId: block.blockId,
          distanceUnit: null,
          weightUnit: 'kg',
          performed: { setNumber: 1, reps: 8, weight: 60 },
        },
      ]),
    )
  })

  it('moves on to the next set, prefilled from the one just logged, and reads the last back', async () => {
    mount()

    await logSquat(1, '60', '8')

    const next = await waitFor(() => formFor('back squat', 2))
    expect(screen.getByText('Set 2/3')).toBeInTheDocument()
    expect(next.getByLabelText('Weight')).toHaveValue(60)
    expect(next.getByLabelText('Reps')).toHaveValue(8)

    const row = within(screen.getByRole('list', { name: 'Logged sets' })).getByRole('listitem')
    expect(within(row).getByText('Set 1 · 8 reps · 60 kg')).toBeInTheDocument()
    await waitFor(() => expect(within(row).getByText('Saved')).toBeInTheDocument())
  })

  it('advances one movement without moving the other', async () => {
    mount()

    await logSquat(1, '60', '8')
    await waitFor(() => formFor('back squat', 2))

    expect(formFor('romanian deadlift', 1).getByLabelText('Weight')).toHaveValue(null)
  })

  it('logs each set in turn under its own number', async () => {
    const { workout } = mount()

    await logSquat(1, '60', '8')
    await waitFor(() => formFor('back squat', 2))
    await logSquat(2)

    await waitFor(() => expect(workout.loggedSets()).toHaveLength(2))
    expect(workout.loggedSets().map((entry) => entry.performed)).toEqual([
      { setNumber: 1, reps: 8, weight: 60 },
      { setNumber: 2, reps: 8, weight: 60 },
    ])
    await waitFor(() => formFor('back squat', 3))
  })

  it('shows the sets a resumed session already carries, and offers the one after them', () => {
    mount({
      block: {
        structureType: 'standard',
        exercises: [
          {
            prescription: { exercise_id: 'back-squat' },
            setLogs: [
              { set_number: 1, actual_reps: 8, weight: 60 },
              { set_number: 2, actual_reps: 8, weight: 62.5 },
            ],
          },
        ],
      },
    })

    const rows = within(screen.getByRole('list', { name: 'Logged sets' })).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      'Set 1 · 8 reps · 60 kgSaved',
      'Set 2 · 8 reps · 62.5 kgSaved',
    ])
    expect(formFor('back squat', 3).getByLabelText('Weight')).toHaveValue(62.5)
    expect(formFor('back squat', 3).getByLabelText('Reps')).toHaveValue(8)
  })
})

describe('a set the database has not confirmed', () => {
  it('is kept and drawn as held on this device, never as saved', async () => {
    const { workout, attempts } = mount({ refuse: () => true })

    await logSquat(1, '60', '8')
    await waitFor(() => expect(attempts.length).toBeGreaterThanOrEqual(1))

    const row = await waitFor(() =>
      within(screen.getByRole('list', { name: 'Logged sets' })).getByRole('listitem'),
    )
    expect(within(row).getByText('Set 1 · 8 reps · 60 kg')).toBeInTheDocument()
    await waitFor(() => expect(within(row).getByText('On this device only')).toBeInTheDocument())
    expect(within(row).queryByText('Saved')).not.toBeInTheDocument()
    expect(workout.loggedSets()).toEqual([])

    // The user performed it: the session moves on rather than asking again.
    expect(formFor('back squat', 2).getByRole('button', { name: 'Log set 2' })).toBeEnabled()
  })

  it('is written once, under the same id, when the sync is retried', async () => {
    const user = userEvent.setup()
    const { workout, attempts } = mount({ refuse: (attempt) => attempt === 1 })

    await logSquat(1, '60', '8')
    await waitFor(() => expect(attempts).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: 'Retry sync' }))

    await waitFor(() => expect(workout.loggedSets()).toHaveLength(1))
    expect(attempts.map((entry) => entry.id)).toEqual([MINTED[0], MINTED[0]])

    const rows = within(screen.getByRole('list', { name: 'Logged sets' })).getAllByRole('listitem')
    expect(rows).toHaveLength(1)
    await waitFor(() => expect(within(rows[0]).getByText('Saved')).toBeInTheDocument())
  })
})
