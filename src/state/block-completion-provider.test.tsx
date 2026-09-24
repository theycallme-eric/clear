/**
 * EXE-01 acceptance — one completion path, with a renderer on the other end.
 *
 * `Workout.test.tsx` proves the shell mounts this provider and that the block
 * panel completes through it. What that cannot show is the half the requirement
 * is actually about: a *renderer* supplying the fields its structure observed,
 * and the shell — not the renderer — asking for effort and writing the row. So
 * the renderer here is the one EXE-03 and EXE-04a…c will be, reduced to the
 * only thing this contract asks of them: call `completeBlock` with an outcome.
 *
 * Six structure types, one path, one row shape.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Constants, type Enums } from '../data/database.types'
import { AppProviders } from '../test/render'
import {
  createWorkoutDouble,
  snapshotFixture,
  type WorkoutDouble,
} from '../test/workout-double'
import { useBlockCompletion, type BlockOutcome } from './block-completion'
import { BlockCompletionProvider } from './block-completion-provider'
import { createError, err, ErrorCode } from './errors'
import { sessionProgress, type BlockProgress } from './workout-progress'

/**
 * What each structure type actually observes (DATA_MODEL §8). This table is the
 * test's whole point: every one of these travels the same path, and the path
 * never branches on which of them it is carrying.
 */
const OUTCOMES: Readonly<Record<Enums<'structure_type'>, BlockOutcome>> = {
  standard: { notes: 'felt strong' },
  superset: { roundsCompleted: 3 },
  circuit: { roundsCompleted: 4, elapsedSeconds: 372 },
  emom: { minutesCompleted: 9 },
  amrap: { roundsCompleted: 6, partialRoundReps: 4 },
  for_time: { elapsedSeconds: 412, completedUnderCap: true },
}

const DEFAULT_EFFORT = 5

/** A renderer, reduced to the one thing every renderer must do. */
function FakeRenderer({
  block,
  outcome,
}: {
  block: BlockProgress
  outcome: BlockOutcome
}) {
  const { completeBlock, isBlockRecorded } = useBlockCompletion()

  return (
    <button type="button" onClick={() => completeBlock(block.blockId, outcome)}>
      {isBlockRecorded(block.blockId)
        ? `${block.identity.label} recorded`
        : block.identity.label}
    </button>
  )
}

interface Mounted {
  workout: WorkoutDouble
  blocks: readonly BlockProgress[]
  failures: string[]
}

function mount(
  structureTypes: Enums<'structure_type'>[],
  double?: WorkoutDouble,
): Mounted {
  const snapshot = snapshotFixture({
    sections: [
      {
        title: 'Conditioning',
        sectionType: 'conditioning',
        blocks: structureTypes.map((structureType) => ({
          structureType,
          timerSeconds: 600,
        })),
      },
    ],
  })
  const workout = double ?? createWorkoutDouble({ session: snapshot })
  const blocks = sessionProgress(snapshot).sections.flatMap((section) => section.blocks)
  const failures: string[] = []

  render(
    <AppProviders workout={workout.clients}>
      <BlockCompletionProvider
        blocks={blocks}
        onFailure={(error) => failures.push(error.code)}
      >
        {blocks.map((block, index) => (
          <FakeRenderer
            key={block.blockId}
            block={block}
            outcome={OUTCOMES[structureTypes[index]]}
          />
        ))}
      </BlockCompletionProvider>
    </AppProviders>,
  )

  return { workout, blocks, failures }
}

/** Completes the named block and answers the one question the shell asks. */
async function completeThrough(label: string, effort?: number): Promise<void> {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: label }))

  const dialog = await screen.findByRole('dialog')
  if (effort !== undefined) {
    // A real `<input type="range">`; jsdom does not implement its key
    // behaviour, so the change event the platform would fire is fired here.
    fireEvent.change(within(dialog).getByRole('slider'), {
      target: { value: String(effort) },
    })
  }
  await user.click(within(dialog).getByRole('button', { name: 'Record effort' }))
}

describe('BlockCompletionProvider — one path for every structure', () => {
  it.each(Object.keys(OUTCOMES) as Enums<'structure_type'>[])(
    'writes %s’s own outcome fields, with the effort the shell captured',
    async (structureType) => {
      const { workout, blocks } = mount([structureType])
      const block = blocks[0]

      await completeThrough(block.identity.label, 8)

      await waitFor(() =>
        expect(workout.recorded()).toEqual([
          {
            blockId: block.blockId,
            outcome: OUTCOMES[structureType],
            perceivedEffort: 8,
          },
        ]),
      )
    },
  )

  it('covers every structure type the database admits', () => {
    // A seventh structure type arrives with an outcome, or this table says so.
    expect(Object.keys(OUTCOMES).sort()).toEqual(
      [...Constants.public.Enums.structure_type].sort(),
    )
  })

  it('asks for effort once per block, and the renderer never asks at all', async () => {
    const { workout, blocks } = mount(['emom', 'amrap'])

    await completeThrough('EMOM')
    await waitFor(() => expect(workout.recorded()).toHaveLength(1))
    await completeThrough('AMRAP')
    await waitFor(() => expect(workout.recorded()).toHaveLength(2))

    expect(workout.recorded().map((completion) => completion.blockId)).toEqual(
      blocks.map((block) => block.blockId),
    )
    expect(workout.recorded().map((completion) => completion.perceivedEffort)).toEqual([
      DEFAULT_EFFORT,
      DEFAULT_EFFORT,
    ])
  })

  it('refuses a second completion of a block it has already written', async () => {
    const user = userEvent.setup()
    const { workout } = mount(['emom'])

    await completeThrough('EMOM')
    const recordedControl = await screen.findByRole('button', { name: 'EMOM recorded' })
    await user.click(recordedControl)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(workout.recorded()).toHaveLength(1)
  })

  it('ignores a completion naming a block that is not in this session', async () => {
    const user = userEvent.setup()
    const snapshot = snapshotFixture({ sections: [{ title: 'Conditioning' }] })
    const workout = createWorkoutDouble({ session: snapshot })
    const blocks = sessionProgress(snapshot).sections.flatMap((section) => section.blocks)

    render(
      <AppProviders workout={workout.clients}>
        <BlockCompletionProvider blocks={blocks} onFailure={() => undefined}>
          <FakeRenderer
            block={{ ...blocks[0], blockId: '70000099-0000-4000-8000-000000000000' }}
            outcome={{ roundsCompleted: 1 }}
          />
        </BlockCompletionProvider>
      </AppProviders>,
    )

    await user.click(screen.getByRole('button', { name: 'STANDARD' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(workout.recorded()).toEqual([])
  })

  it('hands a failed write up, and leaves the block completable', async () => {
    const { workout, failures } = mount(
      ['emom'],
      createWorkoutDouble({
        blockResults: {
          record: async () => err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED)),
        },
      }),
    )

    await completeThrough('EMOM')

    await waitFor(() => expect(failures).toEqual([ErrorCode.PERSISTENCE_WRITE_FAILED]))
    // A performed block must never be lost because one write failed.
    expect(screen.getByRole('button', { name: 'EMOM' })).toBeInTheDocument()
    expect(workout.recorded()).toEqual([])
  })

  it('writes nothing when the effort question is dismissed', async () => {
    const user = userEvent.setup()
    const { workout } = mount(['for_time'])

    await user.click(screen.getByRole('button', { name: 'FOR TIME' }))
    await user.click(await screen.findByRole('button', { name: 'Not now' }))

    expect(workout.recorded()).toEqual([])
    expect(screen.getByRole('button', { name: 'FOR TIME' })).toBeInTheDocument()
  })
})

describe('the seam outside the shell', () => {
  it('refuses to silently drop the write', () => {
    // A renderer that has escaped the provider would otherwise complete blocks
    // into nothing, which is the one failure OVR-03 could never detect.
    expect(() =>
      render(
        <FakeRenderer
          block={{
            blockId: '70000001-0000-4000-8000-000000000000',
            structureType: 'emom',
            identity: { label: 'EMOM', detail: null, repScheme: null, glyph: 'Stopwatch' },
            status: 'not_started',
            exerciseCount: 1,
            exercises: [],
            timerType: 'none',
            timerSeconds: null,
            roundRestSeconds: null,
          }}
          outcome={{}}
        />,
      ),
    ).toThrow('useBlockCompletion was called outside the workout shell')
  })
})
