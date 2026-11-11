/**
 * TASK-048 (REQ-032; AC-R032-02, AC-R032-03; JOURNEY-032) — the seams the
 * ladder's visible recovery reads, at the provider and the read model:
 *
 *   · the shell says *how* a block's row is known — `saved` when this
 *     device's own save was answered, `known` when the row was already there
 *     (a bare 23505) or the performed read found it — and keeps the row it
 *     wrote or read (`recordedResult`), the authority a saved ladder reads
 *     back;
 *   · a failed save is told to the block's renderer (`onBlockSaveFailed`),
 *     never a row already there;
 *   · a renderer told `known` whose own richer save failed may reopen the
 *     block in the same act (`reopenBlock`): it stays outstanding, the
 *     shell's progress is not told, and the next forward action restates the
 *     row (23505 → correction) once;
 *   · `ladderDraftFromRow` reads a saved ladder row back: the top rung is
 *     Complete, a lower rung (zero included) Incomplete through it, no rung
 *     no answer; the category and the notes as saved; each movement's amount
 *     and load as recorded, a zero kept and an absent movement absent.
 *
 * Task-owned, beside the route proof (`e2e/refinement/task-048.spec.ts`).
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppProviders } from '../test/render'
import { createWorkoutDouble, reconstructionFixture, snapshotFixture, type WorkoutDouble } from '../test/workout-double'
import {
  useBlockCompletion,
  useSectionCompletion,
  type BlockCompletion,
  type BlockRecordedSource,
  type RecordedBlockResult,
  type TimedResultReport,
} from './block-completion'
import { BlockCompletionProvider } from './block-completion-provider'
import { createError, err, ErrorCode, isErr, ok, type Result } from './errors'
import { ladderDraftFromRow } from './ladder-recovery'
import type { BlockMovementResultRow, BlockResultRow } from './schemas'
import { sessionProgress, type BlockProgress } from './workout-progress'

afterEach(cleanup)

const AT = '2026-11-11T09:00:00.000Z'

function row(blockId: string, overrides: Partial<BlockResultRow> = {}): BlockResultRow {
  return {
    id: '00000000-0000-4000-8000-000000004801',
    block_id: blockId,
    elapsed_seconds: null,
    completed_under_cap: null,
    rounds_completed: null,
    partial_round_reps: null,
    minutes_completed: null,
    highest_rung: null,
    perceived_effort: null,
    notes: null,
    created_at: AT,
    effort: null,
    ...overrides,
  }
}

function movementRow(exerciseId: string, overrides: Partial<BlockMovementResultRow> = {}): BlockMovementResultRow {
  return {
    id: '00000000-0000-4000-8000-000000004811',
    workout_exercise_id: exerciseId,
    prescription_revision_status: 'active',
    round_number: null,
    actual_reps: null,
    actual_duration_seconds: null,
    actual_distance: null,
    actual_distance_unit: null,
    weight: null,
    weight_unit: 'kg',
    created_at: AT,
    updated_at: AT,
    ...overrides,
  }
}

interface Heard {
  readonly told: { blockId: string; source: BlockRecordedSource }[]
  readonly failed: string[]
  readonly rows: Map<string, RecordedBlockResult | null>
}

/** A renderer that keeps a durable record: what it was told, and what the shell holds. */
function Listening({
  block,
  heard,
  report,
  reopenWhenKnown = false,
}: {
  block: BlockProgress
  heard: Heard
  report?: TimedResultReport
  reopenWhenKnown?: boolean
}) {
  const { onBlockRecorded, onBlockSaveFailed, isBlockRecorded, recordedResult, reopenBlock, reportOutcome, reportTimedResult } = useBlockCompletion()
  useEffect(() => onBlockRecorded?.(block.blockId, (source) => {
    heard.told.push({ blockId: block.blockId, source })
    if (source === 'known' && reopenWhenKnown) reopenBlock?.(block.blockId)
  }), [block.blockId, heard, onBlockRecorded, reopenBlock, reopenWhenKnown])
  useEffect(() => onBlockSaveFailed?.(block.blockId, () => heard.failed.push(block.blockId)), [block.blockId, heard, onBlockSaveFailed])
  useEffect(() => {
    reportOutcome(block.blockId, { highestRung: 3 })
    if (report !== undefined) reportTimedResult?.(block.blockId, report)
  }, [block.blockId, report, reportOutcome, reportTimedResult])
  const recorded = isBlockRecorded(block.blockId)
  heard.rows.set(block.blockId, recordedResult?.(block.blockId) ?? null)
  return <p data-listening={block.blockId}>{recorded ? 'recorded' : 'open'}</p>
}

function Forward({ blockIds, onResult }: { blockIds: readonly string[]; onResult: (result: Result<undefined>) => void }) {
  const { completeSection } = useSectionCompletion()
  return <button type="button" onClick={() => void completeSection(blockIds).then(onResult)}>Save and continue</button>
}

function mount(double: WorkoutDouble, snapshot: ReturnType<typeof snapshotFixture>, options: { report?: TimedResultReport; reopenWhenKnown?: boolean; onRecorded?: (blockId: string) => void } = {}) {
  const blocks = sessionProgress(snapshot).sections.flatMap((section) => section.blocks)
  const heard: Heard = { told: [], failed: [], rows: new Map() }
  const results: Result<undefined>[] = []
  render(
    <AppProviders workout={double.clients}>
      <BlockCompletionProvider sessionId={snapshot.session.id} blocks={blocks} onRecorded={options.onRecorded}>
        {blocks.map((block) => (
          <Listening key={block.blockId} block={block} heard={heard} report={options.report} reopenWhenKnown={options.reopenWhenKnown} />
        ))}
        <Forward blockIds={blocks.map((block) => block.blockId)} onResult={(result) => results.push(result)} />
      </BlockCompletionProvider>
    </AppProviders>,
  )
  return { blocks, heard, results }
}

const TWO_BLOCKS = { sections: [{ sectionType: 'conditioning' as const, blocks: [{ structureType: 'for_time' as const, timerSeconds: 600 }, { structureType: 'for_time' as const, timerSeconds: 420 }] }] }

describe('TASK-048 the shell says how a saved row is known, keeps it, and tells a failed save', () => {
  it('AC-R032-02 saved for this device’s answered insert with the row kept; known for a row already there, with none kept; a failed save told to its block only', async () => {
    const user = userEvent.setup()
    const snapshot = snapshotFixture(TWO_BLOCKS)
    let refuseSecond: 'refuse' | 'exists' = 'refuse'
    const record = vi.fn(async (completion: BlockCompletion) => {
      if (completion.blockId === secondId()) {
        return refuseSecond === 'refuse'
          ? err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))
          : err(createError(ErrorCode.PERSISTENCE_CONFLICT, { details: { pgCode: '23505' } }))
      }
      return ok(row(completion.blockId, { highest_rung: completion.outcome.highestRung ?? null }))
    })
    const double = createWorkoutDouble({ session: snapshot, blockResults: { record } })
    const { blocks, heard, results } = mount(double, snapshot)
    const secondId = () => blocks[1].blockId

    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    await waitFor(() => expect(results).toHaveLength(1))
    expect(isErr(results[0])).toBe(true)
    expect(heard.told).toEqual([{ blockId: blocks[0].blockId, source: 'saved' }])
    expect(heard.failed).toEqual([blocks[1].blockId])
    await waitFor(() => expect(heard.rows.get(blocks[0].blockId)?.row).toMatchObject({ block_id: blocks[0].blockId, highest_rung: 3 }))
    expect(heard.rows.get(blocks[0].blockId)?.movements).toEqual({})
    expect(heard.rows.get(blocks[1].blockId)).toBeNull()

    // The retry: the second block's row was already there (23505) — known,
    // not saved here, and no row is kept for it; nothing failed again.
    refuseSecond = 'exists'
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    await waitFor(() => expect(results).toHaveLength(2))
    expect(results[1]).toEqual(ok(undefined))
    expect(heard.told).toEqual([
      { blockId: blocks[0].blockId, source: 'saved' },
      { blockId: blocks[1].blockId, source: 'known' },
    ])
    expect(heard.failed).toEqual([blocks[1].blockId])
    await waitFor(() => expect(document.querySelector(`[data-listening="${blocks[1].blockId}"]`)?.textContent).toBe('recorded'))
    expect(heard.rows.get(blocks[1].blockId)).toBeNull()
    expect(record).toHaveBeenCalledTimes(3)
  })

  it('AC-R032-02 the performed read is known, with the row and each recorded movement kept by its workout exercise; a movement with no row is absent', async () => {
    const fixture = { sections: [{ sectionType: 'conditioning' as const, blocks: [{ structureType: 'for_time' as const, timerSeconds: 600, result: { highest_rung: 2, effort: 'too_hard' as const, notes: 'grip went' } }] }] }
    const snapshot = snapshotFixture(fixture)
    const read = reconstructionFixture(fixture)
    const [first] = read.sections[0].blocks[0].exercises
    const recordedMovement = movementRow(first.exercise.id, { round_number: 3, actual_reps: 0, weight: 18 })
    const withMovement = {
      ...read,
      sections: read.sections.map((section) => ({
        ...section,
        blocks: section.blocks.map((block) => ({
          ...block,
          exercises: block.exercises.map((entry, index) => ({ ...entry, movement_result: index === 0 ? recordedMovement : null })),
        })),
      })),
    }
    const double = createWorkoutDouble({ session: snapshot, sessions: { asPerformed: async () => ok(withMovement) } })
    const { blocks, heard } = mount(double, snapshot)

    await screen.findByText('recorded')
    expect(heard.told).toEqual([{ blockId: blocks[0].blockId, source: 'known' }])
    const kept = heard.rows.get(blocks[0].blockId)
    expect(kept?.row).toMatchObject({ block_id: blocks[0].blockId, highest_rung: 2, effort: 'too_hard', notes: 'grip went' })
    expect(kept?.movements).toEqual({ [first.exercise.id]: recordedMovement })
  })

  it('AC-R032-03 a renderer whose own richer save failed reopens a known block in the same act: it stays outstanding, the shell’s progress is not told, and the retry restates the row once', async () => {
    const user = userEvent.setup()
    const fixture = { sections: [{ sectionType: 'conditioning' as const, blocks: [{ structureType: 'for_time' as const, timerSeconds: 600, result: { highest_rung: 3 } }] }] }
    const snapshot = snapshotFixture(fixture)
    const record = vi.fn(async () => err(createError(ErrorCode.PERSISTENCE_CONFLICT, { details: { pgCode: '23505' } })))
    const correct = vi.fn(async (completion: BlockCompletion) => ok(row(completion.blockId, { highest_rung: 3, effort: completion.outcome.effort ?? null })))
    const recordMovements = vi.fn(async () => ok([] as BlockMovementResultRow[]))
    const onRecorded = vi.fn()
    const double = createWorkoutDouble({
      session: snapshot,
      sessions: { asPerformed: async () => ok(reconstructionFixture(fixture)) },
      blockResults: { record, correct, recordMovements },
    })
    const report: TimedResultReport = { family: 'for_time', effort: 'too_hard', movements: {}, weightUnit: 'kg' }
    const { blocks, heard, results } = mount(double, snapshot, { report, reopenWhenKnown: true, onRecorded })

    // The performed read finds the row; the renderer reopens it at once.
    await waitFor(() => expect(heard.told).toEqual([{ blockId: blocks[0].blockId, source: 'known' }]))
    expect(screen.getByText('open')).toBeInTheDocument()
    expect(onRecorded).not.toHaveBeenCalled()
    expect(heard.rows.get(blocks[0].blockId)).toBeNull()

    // The forward action saves it again through the richer path: the insert's
    // 23505, then one correction carrying the category; told as saved.
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    await waitFor(() => expect(results).toEqual([ok(undefined)]))
    expect(record).toHaveBeenCalledTimes(1)
    expect(correct).toHaveBeenCalledTimes(1)
    expect(correct.mock.calls[0][0].outcome).toMatchObject({ highestRung: 3, effort: 'too_hard' })
    expect(heard.told.at(-1)).toEqual({ blockId: blocks[0].blockId, source: 'saved' })
    await screen.findByText('recorded')
    expect(onRecorded).toHaveBeenCalledTimes(1)
    expect(heard.rows.get(blocks[0].blockId)?.row).toMatchObject({ effort: 'too_hard' })

    // Nothing left to write.
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    await waitFor(() => expect(results).toHaveLength(2))
    expect(record).toHaveBeenCalledTimes(1)
    expect(correct).toHaveBeenCalledTimes(1)
  })
})

describe('TASK-048 a saved ladder row read back (ladderDraftFromRow)', () => {
  const BLOCK = '00000000-0000-4000-8000-000000004821'
  const LOADED = '00000000-0000-4000-8000-000000004822'
  const BODYWEIGHT = '00000000-0000-4000-8000-000000004823'
  const DISTANCE = '00000000-0000-4000-8000-000000004824'

  it('AC-R032-02 the top rung is Complete, a lower rung or zero Incomplete through it, and no rung no answer; the category, notes and each recorded movement as saved', () => {
    expect(ladderDraftFromRow({ row: row(BLOCK, { highest_rung: 4 }), movements: {} }, 4)).toEqual({
      completed: true, highestRung: 4, effort: null, notes: '', movements: {},
    })
    expect(ladderDraftFromRow({ row: row(BLOCK, { highest_rung: 0 }), movements: {} }, 4)).toMatchObject({ completed: false, highestRung: 0 })
    expect(ladderDraftFromRow({ row: row(BLOCK, { highest_rung: null }), movements: {} }, 4)).toMatchObject({ completed: null, highestRung: null })
    // A rung past the ladder's (a changed prescription) is its top rung.
    expect(ladderDraftFromRow({ row: row(BLOCK, { highest_rung: 9 }), movements: {} }, 4)).toMatchObject({ completed: true, highestRung: 4 })

    const read = ladderDraftFromRow({
      row: row(BLOCK, { highest_rung: 3, effort: 'too_hard', notes: 'grip went on round four' }),
      movements: {
        [LOADED]: movementRow(LOADED, { round_number: 4, actual_reps: 5, weight: 18 }),
        [BODYWEIGHT]: movementRow(BODYWEIGHT, { round_number: 4, actual_reps: 0 }),
        [DISTANCE]: movementRow(DISTANCE, { weight: 20 }),
      },
    }, 4)
    expect(read).toEqual({
      completed: false,
      highestRung: 3,
      effort: 'too_hard',
      notes: 'grip went on round four',
      movements: {
        [LOADED]: { amount: '5', weight: '18' },
        [BODYWEIGHT]: { amount: '0', weight: '' },
        [DISTANCE]: { amount: '', weight: '20' },
      },
    })
  })
})
