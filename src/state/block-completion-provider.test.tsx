/**
 * EXE-01 / REQ-013 acceptance — one completion path, with a renderer on one
 * end and the section's forward action on the other.
 *
 * `Workout.test.tsx` proves the shell mounts this provider and that its footer
 * saves through it. What that cannot show is the contract itself: a *renderer*
 * reporting the fields its structure observed, and the forward action — not
 * the renderer, not a tap — turning the latest report into the block's row,
 * once, with no effort and no invented count.
 *
 * Six structure types, one path, one row shape.
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState } from 'react'
import { describe, expect, it } from 'vitest'

import type { BlockCompletion } from './block-completion'
import { Constants, type Enums } from '../data/database.types'
import { AppProviders } from '../test/render'
import {
  createWorkoutDouble,
  reconstructionFixture,
  snapshotFixture,
  type WorkoutDouble,
} from '../test/workout-double'
import {
  useBlockCompletion,
  useSectionCompletion,
  type BlockOutcome,
} from './block-completion'
import { BlockCompletionProvider } from './block-completion-provider'
import { createError, err, ErrorCode, ok, type Result } from './errors'
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

/** A renderer, reduced to the one thing every renderer must do: report. */
function FakeRenderer({ block, outcome }: { block: BlockProgress; outcome?: BlockOutcome }) {
  const { reportOutcome, isBlockRecorded } = useBlockCompletion()
  if (outcome !== undefined) reportOutcome(block.blockId, outcome)

  return <p>{isBlockRecorded(block.blockId) ? `${block.identity.label} saved` : block.identity.label}</p>
}

/** The shell's forward action, reduced to the save it makes. */
function Forward({
  blockIds,
  onResult,
}: {
  blockIds: readonly string[]
  onResult: (result: Result<undefined>) => void
}) {
  const { completeSection, saving } = useSectionCompletion()
  return (
    <button
      type="button"
      disabled={saving}
      onClick={() => {
        void completeSection(blockIds).then(onResult)
      }}
    >
      Save and continue
    </button>
  )
}

interface Mounted {
  workout: WorkoutDouble
  blocks: readonly BlockProgress[]
  results: Result<undefined>[]
}

function mount(
  structureTypes: Enums<'structure_type'>[],
  options: { double?: WorkoutDouble; report?: boolean } = {},
): Mounted {
  const snapshot = snapshotFixture({
    sections: [
      {
        title: 'Conditioning',
        sectionType: 'conditioning',
        blocks: structureTypes.map((structureType) => ({ structureType, timerSeconds: 600 })),
      },
    ],
  })
  const workout = options.double ?? createWorkoutDouble({ session: snapshot })
  const blocks = sessionProgress(snapshot).sections.flatMap((section) => section.blocks)
  const results: Result<undefined>[] = []

  render(
    <AppProviders workout={workout.clients}>
      <BlockCompletionProvider sessionId={snapshot.session.id} blocks={blocks}>
        {blocks.map((block, index) => (
          <FakeRenderer
            key={block.blockId}
            block={block}
            outcome={options.report === false ? undefined : OUTCOMES[structureTypes[index]]}
          />
        ))}
        <Forward
          blockIds={blocks.map((block) => block.blockId)}
          onResult={(result) => results.push(result)}
        />
      </BlockCompletionProvider>
    </AppProviders>,
  )

  return { workout, blocks, results }
}

const failing = (): Promise<Result<never>> =>
  Promise.resolve(err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED)))

describe('BlockCompletionProvider — the forward action saves what was observed', () => {
  it.each(Object.keys(OUTCOMES) as Enums<'structure_type'>[])(
    'writes %s’s own outcome fields, with no effort',
    async (structureType) => {
      const user = userEvent.setup()
      const { workout, blocks, results } = mount([structureType])

      await user.click(screen.getByRole('button', { name: 'Save and continue' }))

      await waitFor(() => expect(results).toEqual([ok(undefined)]))
      expect(workout.recorded()).toEqual([
        { blockId: blocks[0].blockId, outcome: OUTCOMES[structureType], perceivedEffort: null },
      ])
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    },
  )

  it('covers every structure type the database admits', () => {
    // A seventh structure type arrives with an outcome, or this table says so.
    expect(Object.keys(OUTCOMES).sort()).toEqual(
      [...Constants.public.Enums.structure_type].sort(),
    )
  })

  it('saves every block of a multi-block section in one action, each once', async () => {
    const user = userEvent.setup()
    const { workout, blocks } = mount(['emom', 'amrap', 'for_time'])

    await user.click(screen.getByRole('button', { name: 'Save and continue' }))

    await waitFor(() => expect(workout.recorded()).toHaveLength(3))
    expect(workout.recorded().map((completion) => completion.blockId)).toEqual(
      blocks.map((block) => block.blockId),
    )
    expect(await screen.findByText('EMOM saved')).toBeInTheDocument()
    expect(screen.getByText('AMRAP saved')).toBeInTheDocument()
    expect(screen.getByText('FOR TIME saved')).toBeInTheDocument()
  })

  it('does not block on missing counts, and invents none', async () => {
    const user = userEvent.setup()
    const { workout, blocks, results } = mount(['amrap', 'circuit'], { report: false })

    await user.click(screen.getByRole('button', { name: 'Save and continue' }))

    await waitFor(() => expect(results).toEqual([ok(undefined)]))
    // Nothing reported is nothing observed: every outcome column null.
    expect(workout.recorded()).toEqual(
      blocks.map((block) => ({ blockId: block.blockId, outcome: {}, perceivedEffort: null })),
    )
  })

  it('saves the latest report, not the first', async () => {
    const snapshot = snapshotFixture({ sections: [{ title: 'Conditioning' }] })
    const workout = createWorkoutDouble({ session: snapshot })
    const blocks = sessionProgress(snapshot).sections.flatMap((section) => section.blocks)
    const user = userEvent.setup()

    function Counting() {
      const [rounds, setRounds] = useState(0)
      return (
        <>
          <FakeRenderer block={blocks[0]} outcome={{ roundsCompleted: rounds }} />
          <button type="button" onClick={() => setRounds((value) => value + 1)}>
            Add a round
          </button>
        </>
      )
    }

    render(
      <AppProviders workout={workout.clients}>
        <BlockCompletionProvider sessionId={snapshot.session.id} blocks={blocks}>
          <Counting />
          <Forward blockIds={[blocks[0].blockId]} onResult={() => undefined} />
        </BlockCompletionProvider>
      </AppProviders>,
    )

    await user.click(screen.getByRole('button', { name: 'Add a round' }))
    await user.click(screen.getByRole('button', { name: 'Add a round' }))
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))

    await waitFor(() => expect(workout.recorded()).toHaveLength(1))
    expect(workout.recorded()[0]?.outcome).toEqual({ roundsCompleted: 2 })
  })

  it('skips a block that is not in this session', async () => {
    const snapshot = snapshotFixture({ sections: [{ title: 'Conditioning' }] })
    const workout = createWorkoutDouble({ session: snapshot })
    const blocks = sessionProgress(snapshot).sections.flatMap((section) => section.blocks)
    const results: Result<undefined>[] = []
    const user = userEvent.setup()

    render(
      <AppProviders workout={workout.clients}>
        <BlockCompletionProvider sessionId={snapshot.session.id} blocks={blocks}>
          <Forward
            blockIds={['70000099-0000-4000-8000-000000000000']}
            onResult={(result) => results.push(result)}
          />
        </BlockCompletionProvider>
      </AppProviders>,
    )

    await user.click(screen.getByRole('button', { name: 'Save and continue' }))

    await waitFor(() => expect(results).toEqual([ok(undefined)]))
    expect(workout.recorded()).toEqual([])
  })
})

describe('BlockCompletionProvider — idempotent saves and retries', () => {
  it('restores only actual saved block rows and does not write those blocks again', async () => {
    const fixture = { sections: [{ sectionType: 'conditioning' as const,
      blocks: [{ structureType: 'emom' as const, result: {} }] }] }
    const snapshot = snapshotFixture(fixture)
    const performed = reconstructionFixture(fixture)
    const workout = createWorkoutDouble({ session: snapshot,
      sessions: { asPerformed: async () => ok(performed) } })
    const blocks = sessionProgress(snapshot).sections.flatMap((section) => section.blocks)
    const remembered: string[] = []
    const user = userEvent.setup()
    render(<AppProviders workout={workout.clients}>
      <BlockCompletionProvider sessionId={snapshot.session.id} blocks={blocks}
        onRecorded={(id) => remembered.push(id)}>
        <FakeRenderer block={blocks[0]} />
        <Forward blockIds={[blocks[0].blockId]} onResult={() => undefined} />
      </BlockCompletionProvider>
    </AppProviders>)
    await screen.findByText('EMOM saved')
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(remembered).toEqual([blocks[0].blockId])
    expect(workout.recorded()).toEqual([])
  })

  it('claims no completion on a failed read, and still permits an explicit save', async () => {
    const workout = createWorkoutDouble({ sessions: {
      asPerformed: async () => err(createError(ErrorCode.PERSISTENCE_READ_FAILED)),
    } })
    const { results } = mount(['emom'], { double: workout, report: false })
    expect(screen.queryByText('EMOM saved')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save and continue' }))
    await waitFor(() => expect(results).toEqual([ok(undefined)]))
    expect(workout.recorded()).toHaveLength(1)
    expect(workout.recorded()[0]?.outcome).toEqual({})
  })

  it('writes a block once, however often the forward action is pressed', async () => {
    const user = userEvent.setup()
    const { workout } = mount(['emom'])

    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    await screen.findByText('EMOM saved')
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))

    expect(workout.recorded()).toHaveLength(1)
  })

  it('answers a second call during a save with that same save', async () => {
    const snapshot = snapshotFixture({ sections: [{ title: 'Conditioning' }] })
    const writes: BlockCompletion[] = []
    let release: () => void = () => undefined
    const workout = createWorkoutDouble({
      session: snapshot,
      blockResults: {
        record: (completion) => {
          writes.push(completion)
          return new Promise((resolve) => {
            release = () => resolve(ok({} as never))
          })
        },
      },
    })
    const blocks = sessionProgress(snapshot).sections.flatMap((section) => section.blocks)
    const calls: Promise<Result<undefined>>[] = []

    /** Two forward presses inside one event, before any render between them. */
    function DoubleTap() {
      const { completeSection } = useSectionCompletion()
      const ids = [blocks[0].blockId]
      return (
        <button
          type="button"
          onClick={() => {
            calls.push(completeSection(ids), completeSection(ids))
          }}
        >
          Tap twice
        </button>
      )
    }

    render(
      <AppProviders workout={workout.clients}>
        <BlockCompletionProvider sessionId={snapshot.session.id} blocks={blocks}>
          <DoubleTap />
        </BlockCompletionProvider>
      </AppProviders>,
    )

    act(() => {
      screen.getByRole('button', { name: 'Tap twice' }).click()
    })
    const [first, second] = calls

    expect(second).toBe(first)
    await act(async () => {
      release()
      await first
    })
    expect(writes).toHaveLength(1)
  })

  it('answers a failed save with its error, and records nothing', async () => {
    const user = userEvent.setup()
    const { workout, results } = mount(
      ['emom'],
      { double: createWorkoutDouble({ blockResults: { record: failing } }) },
    )

    await user.click(screen.getByRole('button', { name: 'Save and continue' }))

    await waitFor(() => expect(results).toHaveLength(1))
    expect(results[0]).toMatchObject({
      ok: false,
      error: { code: ErrorCode.PERSISTENCE_WRITE_FAILED },
    })
    expect(screen.getByText('EMOM')).toBeInTheDocument()
    expect(workout.recorded()).toEqual([])
  })

  it('retries only what an earlier attempt did not write', async () => {
    const user = userEvent.setup()
    const writes: string[] = []
    let failSecond = true
    const snapshot = snapshotFixture({
      sections: [
        {
          title: 'Conditioning',
          sectionType: 'conditioning',
          blocks: [{ structureType: 'emom', timerSeconds: 600 }, { structureType: 'amrap', timerSeconds: 600 }],
        },
      ],
    })
    const blocks = sessionProgress(snapshot).sections.flatMap((section) => section.blocks)
    const double = createWorkoutDouble({
      session: snapshot,
      blockResults: {
        record: async (completion) => {
          if (completion.blockId === blocks[1].blockId && failSecond) {
            failSecond = false
            return err(createError(ErrorCode.NETWORK_TIMEOUT))
          }
          writes.push(completion.blockId)
          return ok({} as never)
        },
      },
    })
    const { results } = mount(['emom', 'amrap'], { double })

    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    await waitFor(() => expect(results).toHaveLength(1))
    expect(results[0]?.ok).toBe(false)
    expect(writes).toEqual([blocks[0].blockId])

    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    await waitFor(() => expect(results).toHaveLength(2))
    expect(results[1]).toEqual(ok(undefined))
    // The EMOM was not written a second time; the AMRAP was written once.
    expect(writes).toEqual([blocks[0].blockId, blocks[1].blockId])
  })

  it('treats a row that already exists as saved, never as a duplicate to write', async () => {
    // A save whose answer was lost, or one made before a reload: the unique
    // index on `block_id` refuses the second row, and the block is complete.
    const user = userEvent.setup()
    const double = createWorkoutDouble({
      blockResults: {
        record: async () =>
          err(createError(ErrorCode.PERSISTENCE_CONFLICT, { details: { pgCode: '23505' } })),
      },
    })
    const { results } = mount(['emom'], { double })

    await user.click(screen.getByRole('button', { name: 'Save and continue' }))

    await waitFor(() => expect(results).toEqual([ok(undefined)]))
    expect(await screen.findByText('EMOM saved')).toBeInTheDocument()
  })

  it('does not mistake another conflict for a saved block', async () => {
    const user = userEvent.setup()
    const double = createWorkoutDouble({
      blockResults: {
        record: async () =>
          err(createError(ErrorCode.PERSISTENCE_CONFLICT, { details: { pgCode: '23503' } })),
      },
    })
    const { results } = mount(['emom'], { double })

    await user.click(screen.getByRole('button', { name: 'Save and continue' }))

    await waitFor(() => expect(results).toHaveLength(1))
    expect(results[0]?.ok).toBe(false)
    expect(screen.getByText('EMOM')).toBeInTheDocument()
  })
})

describe('BlockCompletionProvider — told the moment a row is known (TASK-014, AC-R014-03)', () => {
  /** A renderer that keeps a durable record: what it was told, and what the screen said when it was. */
  function Listening({ block, told }: { block: BlockProgress; told: (blockId: string) => void }) {
    const { onBlockRecorded, isBlockRecorded } = useBlockCompletion()
    useEffect(() => onBlockRecorded?.(block.blockId, () => told(block.blockId)), [block.blockId, onBlockRecorded, told])
    return <p data-listening={block.blockId}>{isBlockRecorded(block.blockId) ? 'recorded' : 'open'}</p>
  }

  function mountListening(double: WorkoutDouble, snapshot: ReturnType<typeof snapshotFixture>, listen = true) {
    const blocks = sessionProgress(snapshot).sections.flatMap((section) => section.blocks)
    const results: Result<undefined>[] = []
    const told: { blockId: string; screen: string | null; answered: number }[] = []
    const tell = (blockId: string) => told.push({
      blockId,
      screen: document.querySelector(`[data-listening="${blockId}"]`)?.textContent ?? null,
      answered: results.length,
    })
    function Harness() {
      const [listening, setListening] = useState(listen)
      return (
        <BlockCompletionProvider sessionId={snapshot.session.id} blocks={blocks}>
          {listening ? blocks.map((block) => <Listening key={block.blockId} block={block} told={tell} />) : null}
          <button type="button" onClick={() => setListening(false)}>Stop listening</button>
          <Forward blockIds={blocks.map((block) => block.blockId)} onResult={(result) => results.push(result)} />
        </BlockCompletionProvider>
      )
    }
    render(<AppProviders workout={double.clients}><Harness /></AppProviders>)
    return { blocks, results, told }
  }

  it('tells a block’s listener in the same act as its insert is answered: before isBlockRecorded renders and before the forward action hears the answer', async () => {
    const user = userEvent.setup()
    const snapshot = snapshotFixture({ sections: [{ sectionType: 'conditioning', blocks: [{ structureType: 'for_time', timerSeconds: 600 }, { structureType: 'emom', timerSeconds: 600 }] }] })
    const double = createWorkoutDouble({ session: snapshot })
    const { blocks, results, told } = mountListening(double, snapshot)

    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    await waitFor(() => expect(results).toEqual([ok(undefined)]))
    // Once per block, in the save's order, each while the screen still said
    // open and before the save's answer reached the forward action.
    expect(told).toEqual(blocks.map((block) => ({ blockId: block.blockId, screen: 'open', answered: 0 })))
    expect(document.querySelectorAll('[data-listening]')).toHaveLength(2)
    for (const node of document.querySelectorAll('[data-listening]')) expect(node.textContent).toBe('recorded')
    // Pressed again: nothing new to write, nothing new to tell.
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    await waitFor(() => expect(results).toHaveLength(2))
    expect(told).toHaveLength(2)
  })

  it('tells it for a row already there and for the performed read, never for a failed write, and never once unsubscribed', async () => {
    const user = userEvent.setup()
    const fixture = { sections: [{ sectionType: 'conditioning' as const, blocks: [{ structureType: 'emom' as const, result: {} }] }] }

    // The performed read finds the row.
    const read = snapshotFixture(fixture)
    const performed = createWorkoutDouble({ session: read, sessions: { asPerformed: async () => ok(reconstructionFixture(fixture)) } })
    const first = mountListening(performed, read)
    await screen.findByText('recorded')
    expect(first.told.map((entry) => entry.blockId)).toEqual([first.blocks[0].blockId])
    cleanup()

    // A failed write tells nothing; the retry's row exists (the unique index) and tells once.
    const snapshot = snapshotFixture({ sections: [{ sectionType: 'conditioning', blocks: [{ structureType: 'emom', timerSeconds: 600 }] }] })
    let answer: Result<never> = err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))
    const conflicted = createWorkoutDouble({ session: snapshot, blockResults: { record: async () => answer } })
    const second = mountListening(conflicted, snapshot)
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    await waitFor(() => expect(second.results).toHaveLength(1))
    expect(second.told).toEqual([])
    answer = err(createError(ErrorCode.PERSISTENCE_CONFLICT, { details: { pgCode: '23505' } }))
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    await waitFor(() => expect(second.results).toHaveLength(2))
    expect(second.results[1]).toEqual(ok(undefined))
    expect(second.told.map((entry) => entry.blockId)).toEqual([second.blocks[0].blockId])
    cleanup()

    // Unsubscribed (the renderer left): the save is not reported to it.
    const quiet = createWorkoutDouble({ session: snapshot })
    const third = mountListening(quiet, snapshot)
    await user.click(screen.getByRole('button', { name: 'Stop listening' }))
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    await waitFor(() => expect(third.results).toEqual([ok(undefined)]))
    expect(quiet.recorded()).toHaveLength(1)
    expect(third.told).toEqual([])
  })
})

describe('the seams outside the shell', () => {
  it('refuses to silently drop a renderer’s report', () => {
    // A renderer that has escaped the provider would otherwise report into
    // nothing, which is the one failure OVR-03 could never detect.
    expect(() =>
      render(
        <FakeRenderer
          block={{
            blockId: '70000001-0000-4000-8000-000000000000',
            structureType: 'emom',
            repScheme: 'fixed',
            identity: { label: 'EMOM', format: 'EMOM', detail: null, repScheme: null, glyph: 'Stopwatch' },
            status: 'not_started',
            exerciseCount: 1,
            exercises: [],
            timerType: 'none',
            timerSeconds: null,
            rounds: null,
            roundRestSeconds: null,
          }}
          outcome={{}}
        />,
      ),
    ).toThrow('useBlockCompletion was called outside the workout shell')
  })

  it('refuses to silently drop a section save', () => {
    expect(() => render(<Forward blockIds={[]} onResult={() => undefined} />)).toThrow(
      'useSectionCompletion was called outside the workout shell',
    )
  })
})
