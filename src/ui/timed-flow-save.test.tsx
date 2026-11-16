/**
 * A3 TASK-103 (F1; REQ-031; AC-R031-01, AC-R031-03; TASK-AC-F0CF2CC7BC18,
 * TASK-AC-9971E7A16F92, TASK-AC-6B9598D96180) — Round 7's timed flow saves for
 * real.
 *
 * `/workout`'s timed blocks are drawn by Round 7's `TimedWorkoutFlow` and its
 * `TimedResultLog`, and their Save log goes through the product presentation's
 * `timedWorkflows.saveResult`, bound to the shell's one completion path
 * (`BlockCompletionProvider.saveTimedLog` → `saveTimedResult`): the block row,
 * corrected in place on 23505, then each movement's row under the id minted
 * once per block. Proved here over the real provider, the real flow and the
 * product presentation, against an in-memory pair of tables that answer as
 * PostgREST does (unique keys, 23505, restating a row by its key):
 *
 *   · the product mounts no sample adapter, and every timed format is drawn by
 *     `TimedWorkoutFlow`;
 *   · each format's entries land on the right block, round and movement, the
 *     effort as its category and never a number, blank unrecorded and 0 kept;
 *   · a refused write keeps the draft and the dialog and says the log did not
 *     save; the retry converges on the same rows, never a duplicate;
 *   · the saved row is read back as the saved log, and a correction restates
 *     it in place;
 *   · the forward action still saves what was entered without Save log;
 *   · the attempt and the AMRAP's counts survive the block being drawn again,
 *     as the shipped renderers' did; outside the shell nothing is stored.
 *
 * The route-level proof is `e2e/refinement/task-047.spec.ts` (rewritten for
 * Round 7 by this task).
 */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { MovementResultWrite, BlockCompletion } from '../state/block-completion'
import { blockResultInsert, useSectionCompletion } from '../state/block-completion'
import { BlockCompletionProvider, PreviewBlockCompletion } from '../state/block-completion-provider'
import { createError, err, ErrorCode, ok, type Result } from '../state/errors'
import { sessionSnapshotSchema, type BlockMovementResultRow, type BlockResultRow, type SessionSnapshot } from '../state/schemas'
import { sessionProgress, type BlockProgress } from '../state/workout-progress'
import { formatBadgesSnapshot } from '../test/format-badges-fixture'
import { AppProviders } from '../test/render'
import { readbackName, timedReadbackAcceptance, READBACK_SYNTHETIC_CATALOG } from '../test/timed-readback-fixture'
import { createWorkoutDouble } from '../test/workout-double'
import { BlockSlot } from './block-renderers'
import { PRODUCT_PRESENTATION } from './product-presentation'
import { TimedWorkoutFlow } from './timed-workout-flow'
import { saveLogThroughShell } from './timed-result-shell'
import { WorkoutExperiencePresentationProvider } from './workout-experience-presentation'

const OWNER = '00000000-0000-4000-8000-000000010301'
const LOADED = readbackName(READBACK_SYNTHETIC_CATALOG.loaded.id)
const BODYWEIGHT = readbackName(READBACK_SYNTHETIC_CATALOG.bodyweight.id)
const AT = '2026-11-16T09:00:00.000Z'

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

// ─────────────────────────────────────────────────────────────────────────────
// The two tables, answered as PostgREST answers them
// ─────────────────────────────────────────────────────────────────────────────

type Fault = { op: 'record' | 'correct' | 'movements'; kind: 'refuse' | 'lose' }

function tables() {
  const blocks = new Map<string, BlockResultRow>()
  const movements = new Map<string, BlockMovementResultRow>()
  /** Every write, in order: `record <block>`, `correct <block>`, `insert <exercise> <id>`, `delete <exercise>`. */
  const calls: string[] = []
  const faults: Fault[] = []
  let minted = 0
  const failure = (op: Fault['op']): 'refuse' | 'lose' | null => {
    const index = faults.findIndex((fault) => fault.op === op)
    return index < 0 ? null : faults.splice(index, 1)[0].kind
  }
  const refused = () => err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))

  const record = async (completion: BlockCompletion): Promise<Result<BlockResultRow>> => {
    calls.push(`record ${completion.blockId}`)
    const fault = failure('record')
    if (fault === 'refuse') return refused()
    if (blocks.has(completion.blockId)) {
      return err(createError(ErrorCode.PERSISTENCE_CONFLICT, { details: { pgCode: '23505' } }))
    }
    const insert = blockResultInsert(completion)
    const stored: BlockResultRow = {
      id: `00000000-0000-4000-8000-${String(10300 + (minted += 1)).padStart(12, '0')}`,
      block_id: completion.blockId,
      elapsed_seconds: insert.elapsed_seconds ?? null,
      completed_under_cap: insert.completed_under_cap ?? null,
      rounds_completed: insert.rounds_completed ?? null,
      partial_round_reps: insert.partial_round_reps ?? null,
      minutes_completed: insert.minutes_completed ?? null,
      highest_rung: insert.highest_rung ?? null,
      perceived_effort: insert.perceived_effort ?? null,
      notes: insert.notes ?? null,
      effort: insert.effort ?? null,
      created_at: AT,
    }
    blocks.set(completion.blockId, stored)
    if (fault === 'lose') return refused()
    return ok(stored)
  }
  const correct = async (completion: BlockCompletion): Promise<Result<BlockResultRow>> => {
    calls.push(`correct ${completion.blockId}`)
    if (failure('correct') === 'refuse') return refused()
    const previous = blocks.get(completion.blockId)
    if (previous === undefined) return err(createError(ErrorCode.PERSISTENCE_NOT_FOUND))
    const insert = blockResultInsert(completion)
    const corrected: BlockResultRow = {
      ...previous,
      elapsed_seconds: insert.elapsed_seconds ?? null,
      completed_under_cap: insert.completed_under_cap ?? null,
      rounds_completed: insert.rounds_completed ?? null,
      partial_round_reps: insert.partial_round_reps ?? null,
      minutes_completed: insert.minutes_completed ?? null,
      highest_rung: insert.highest_rung ?? null,
      perceived_effort: null,
      notes: insert.notes ?? null,
      effort: insert.effort ?? null,
    }
    blocks.set(completion.blockId, corrected)
    return ok(corrected)
  }
  const recordMovements = async (writes: readonly MovementResultWrite[]): Promise<Result<BlockMovementResultRow[]>> => {
    const fault = failure('movements')
    if (fault === 'refuse') {
      calls.push('movements refused')
      return refused()
    }
    const saved: BlockMovementResultRow[] = []
    for (const write of writes) {
      if (write.row === null) {
        calls.push(`delete ${write.workoutExerciseId}`)
        movements.delete(write.workoutExerciseId)
        continue
      }
      const previous = movements.get(write.workoutExerciseId)
      calls.push(`${previous === undefined ? 'insert' : 'restate'} ${write.workoutExerciseId} ${write.row.id}`)
      const stored: BlockMovementResultRow = {
        id: previous?.id ?? String(write.row.id),
        workout_exercise_id: write.workoutExerciseId,
        prescription_revision_status: 'active',
        round_number: write.row.round_number ?? null,
        actual_reps: write.row.actual_reps ?? null,
        actual_duration_seconds: write.row.actual_duration_seconds ?? null,
        actual_distance: write.row.actual_distance ?? null,
        actual_distance_unit: write.row.actual_distance_unit ?? null,
        weight: write.row.weight ?? null,
        weight_unit: write.row.weight_unit ?? 'kg',
        created_at: previous?.created_at ?? AT,
        updated_at: AT,
      }
      movements.set(write.workoutExerciseId, stored)
      saved.push(stored)
    }
    if (fault === 'lose') return refused()
    return ok(saved)
  }
  return { blocks, movements, calls, faults, writer: { record, correct, recordMovements } }
}

type Tables = ReturnType<typeof tables>

// ─────────────────────────────────────────────────────────────────────────────
// The session and its shell
// ─────────────────────────────────────────────────────────────────────────────

function session(): SessionSnapshot {
  return sessionSnapshotSchema.parse(formatBadgesSnapshot(timedReadbackAcceptance(), {
    userId: OWNER,
    startedAt: new Date(Date.now() - 60_000).toISOString(),
  }))
}

/** The performed read as the tables now hold it, as `session_as_performed` answers. */
function performed(snapshot: SessionSnapshot, store: Tables) {
  return {
    reconstruction: 'performed' as const,
    as_of: snapshot.session.started_at ?? AT,
    session: snapshot.session,
    state: snapshot.state,
    sections: snapshot.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((entry) => ({
        ...entry,
        block_result: store.blocks.get(entry.block.id) ?? null,
        exercises: entry.exercises.map((exercise) => ({ ...exercise, movement_result: store.movements.get(exercise.exercise.id) ?? null })),
      })),
    })),
  }
}

/** The forward action's save, reduced to the section save it makes. */
function Forward({ blockIds, onResult }: { blockIds: readonly string[]; onResult: (result: Result<undefined>) => void }) {
  const { completeSection } = useSectionCompletion()
  return <button type="button" onClick={() => { void completeSection(blockIds).then(onResult) }}>Next section</button>
}

function mountShell(store: Tables, snapshot = session()) {
  const double = createWorkoutDouble({
    session: snapshot,
    blockResults: store.writer,
    sessions: { asPerformed: async () => ok(performed(snapshot, store)) },
  })
  const progress = sessionProgress(snapshot)
  const blocks = progress.sections.flatMap((section) => section.blocks)
  const timed = progress.sections[0].blocks
  const results: Result<undefined>[] = []
  const view = render(
    <AppProviders workout={double.clients}>
      <BlockCompletionProvider sessionId={snapshot.session.id} blocks={blocks}>
        {timed.map((block) => <BlockSlot key={block.blockId} block={block} />)}
        <Forward blockIds={timed.map((block) => block.blockId)} onResult={(result) => results.push(result)} />
      </BlockCompletionProvider>
    </AppProviders>,
  )
  const [emom, amrap, forTime, ladder] = timed
  return { view, snapshot, results, blocks: { emom, amrap, forTime, ladder } }
}

function flow(format: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`.clr-timed-flow[data-timed-format="${format}"]`)
  if (found === null) throw new Error(`no ${format} flow`)
  return found
}

function openLog(): HTMLDialogElement {
  const open = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')]
  if (open.length !== 1) throw new Error(`${open.length} open dialogs`)
  return open[0]
}

async function run(user: ReturnType<typeof userEvent.setup>, format: string, start: string, finish: string) {
  const card = within(flow(format))
  await user.click(card.getByRole('button', { name: start }))
  await user.click(card.getByRole('button', { name: finish }))
  return within(openLog())
}

async function closeLog(user: ReturnType<typeof userEvent.setup>) {
  const dialog = openLog()
  await user.click(within(dialog).getByRole('button', { name: 'Close log' }))
  await waitFor(() => expect(dialog.open).toBe(false))
}

const exerciseIds = (block: BlockProgress) => block.exercises.map((exercise) => exercise.exerciseId)

// ─────────────────────────────────────────────────────────────────────────────

describe('A3 TASK-103 Round 7’s timed flow saves through the shell’s one completion path', () => {
  it('TASK-AC-F0CF2CC7BC18 the product binds Round 7’s saveResult to the shell’s save, mounts no sample adapter, and draws every timed format with TimedWorkoutFlow', () => {
    expect(PRODUCT_PRESENTATION.timedWorkflows?.saveResult).toBe(saveLogThroughShell)
    mountShell(tables())
    for (const format of ['emom', 'amrap', 'for_time', 'ladder']) expect(flow(format)).toBeInTheDocument()
  })

  it('AC-R031-01 AMRAP: Save log writes the counts, the category as effort and never a number, the notes, and each movement’s partial in the round after the count, a typed 0 kept', async () => {
    const user = userEvent.setup()
    const store = tables()
    const { blocks } = mountShell(store)
    const log = await run(user, 'amrap', 'Start AMRAP', 'Finish early')
    await user.click(log.getByRole('button', { name: 'Increase rounds completed' }))
    await user.click(log.getByRole('button', { name: 'Increase rounds completed' }))
    for (let rep = 0; rep < 3; rep += 1) await user.click(log.getByRole('button', { name: 'Increase reps into the next round' }))
    await user.type(log.getByRole('spinbutton', { name: `Next round · ${LOADED}` }), '5')
    await user.type(log.getByRole('spinbutton', { name: `Weight · ${LOADED}` }), '18')
    await user.type(log.getByRole('spinbutton', { name: `Next round · ${BODYWEIGHT}` }), '0')
    await user.click(log.getByRole('radio', { name: 'About right' }))
    await user.type(log.getByRole('textbox', { name: 'Notes · optional' }), 'Grip went in round 3.')
    await user.click(log.getByRole('button', { name: 'Save log' }))

    await waitFor(() => expect(within(flow('amrap')).getByText('Log saved')).toBeInTheDocument())
    const row = store.blocks.get(blocks.amrap.blockId)
    expect(row).toMatchObject({
      rounds_completed: 2, partial_round_reps: 3, perceived_effort: null, effort: 'about_right', notes: 'Grip went in round 3.',
      highest_rung: null, minutes_completed: null,
    })
    expect(row?.elapsed_seconds).not.toBeNull()
    const [loaded, bodyweight] = exerciseIds(blocks.amrap)
    expect(store.movements.get(loaded)).toMatchObject({ round_number: 3, actual_reps: 5, weight: 18, weight_unit: 'kg' })
    expect(store.movements.get(bodyweight)).toMatchObject({ round_number: 3, actual_reps: 0, weight: null })
    // The dialog closed on the answer, and the block is recorded by the shell.
    expect(document.querySelectorAll('dialog[open]')).toHaveLength(0)
    expect(within(flow('amrap')).getByText('Block saved')).toBeInTheDocument()
  })

  it('TASK-AC-9971E7A16F92 a refused movement write keeps the draft and the dialog and says the log did not save; the retry restates the row and writes each movement once under the same id', async () => {
    const user = userEvent.setup()
    const store = tables()
    const { blocks } = mountShell(store)
    const log = await run(user, 'for_time', 'Start FOR TIME', 'Finish')
    await user.click(log.getByRole('radio', { name: 'Incomplete' }))
    await user.type(log.getByRole('spinbutton', { name: `Completed · ${LOADED}` }), '22')
    await user.type(log.getByRole('spinbutton', { name: `Weight · ${LOADED}` }), '20')
    await user.click(log.getByRole('radio', { name: 'Too hard' }))

    store.faults.push({ op: 'movements', kind: 'refuse' })
    await user.click(log.getByRole('button', { name: 'Save log' }))
    expect(await log.findByRole('alert')).toHaveTextContent('Your log didn’t save. Try again.')
    // Still open, still holding every entry; nothing claims a save.
    expect(openLog()).toBeInTheDocument()
    expect(log.getByRole('spinbutton', { name: `Completed · ${LOADED}` })).toHaveValue(22)
    expect(log.getByRole('spinbutton', { name: `Weight · ${LOADED}` })).toHaveValue(20)
    expect(log.getByRole('radio', { name: 'Too hard' })).toHaveAttribute('aria-checked', 'true')
    expect(within(flow('for_time')).queryByText('Log saved')).toBeNull()
    expect(store.movements.size).toBe(0)

    await user.click(log.getByRole('button', { name: 'Save log' }))
    await waitFor(() => expect(within(flow('for_time')).getByText('Log saved')).toBeInTheDocument())
    const [loaded, bodyweight] = exerciseIds(blocks.forTime)
    const inserts = store.calls.filter((call) => call.startsWith('insert'))
    expect(store.calls).toEqual([
      `record ${blocks.forTime.blockId}`,
      'movements refused',
      `record ${blocks.forTime.blockId}`,
      `correct ${blocks.forTime.blockId}`,
      inserts[0],
    ])
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatch(new RegExp(`^insert ${loaded} `))
    expect(store.blocks.size).toBe(1)
    expect(store.blocks.get(blocks.forTime.blockId)).toMatchObject({ completed_under_cap: false, effort: 'too_hard', perceived_effort: null })
    expect(store.movements.get(loaded)).toMatchObject({ round_number: 1, actual_reps: 22, weight: 20 })
    // Blank is not recorded: the bodyweight movement has no row and no write.
    expect(store.movements.has(bodyweight)).toBe(false)
    expect(store.calls.some((call) => call.includes(bodyweight))).toBe(false)
  })

  it('AC-R031-01 EMOM and ladder keep their own contracts: the EMOM a load with no round and no measured outcome; the ladder its highest rung and a partial in the rung after it', async () => {
    const user = userEvent.setup()
    const store = tables()
    const { blocks } = mountShell(store)

    let log = await run(user, 'emom', 'Start EMOM', 'Finish early')
    expect(log.queryByRole('spinbutton', { name: new RegExp(`· ${BODYWEIGHT}$`) })).toBeNull()
    await user.type(log.getByRole('spinbutton', { name: `Weight · ${LOADED}` }), '14')
    await user.click(log.getByRole('radio', { name: 'Too easy' }))
    await user.click(log.getByRole('button', { name: 'Save log' }))
    await waitFor(() => expect(within(flow('emom')).getByText('Log saved')).toBeInTheDocument())
    expect(store.blocks.get(blocks.emom.blockId)).toMatchObject({
      elapsed_seconds: null, minutes_completed: null, rounds_completed: null, effort: 'too_easy', perceived_effort: null, notes: null,
    })
    expect(store.movements.get(exerciseIds(blocks.emom)[0])).toMatchObject({ round_number: null, actual_reps: null, weight: 14 })

    log = await run(user, 'ladder', 'Start ladder', 'Finish')
    await user.click(log.getByRole('button', { name: /^Round 1: / }))
    await user.type(log.getByRole('spinbutton', { name: `Round 2 · ${LOADED}` }), '3')
    await user.type(log.getByRole('textbox', { name: 'Notes · optional' }), 'Third rung untouched.')
    await user.click(log.getByRole('button', { name: 'Save log' }))
    await waitFor(() => expect(within(flow('ladder')).getByText('Log saved')).toBeInTheDocument())
    expect(store.blocks.get(blocks.ladder.blockId)).toMatchObject({
      highest_rung: 1, elapsed_seconds: null, effort: null, perceived_effort: null, notes: 'Third rung untouched.',
    })
    expect(store.movements.get(exerciseIds(blocks.ladder)[0])).toMatchObject({ round_number: 2, actual_reps: 3, weight: null })
    expect(store.movements.has(exerciseIds(blocks.ladder)[1])).toBe(false)
  })

  it('TASK-048 the saved row is read back as the saved log when the block is drawn again, and Edit log corrects it in place', async () => {
    const user = userEvent.setup()
    const store = tables()
    const snapshot = session()
    const first = mountShell(store, snapshot)
    const log = await run(user, 'amrap', 'Start AMRAP', 'Finish early')
    await user.click(log.getByRole('button', { name: 'Increase rounds completed' }))
    await user.type(log.getByRole('spinbutton', { name: `Next round · ${LOADED}` }), '7')
    await user.click(log.getByRole('button', { name: 'Save log' }))
    await waitFor(() => expect(within(flow('amrap')).getByText('Log saved')).toBeInTheDocument())

    // Drawn again from nothing held in memory: the performed read is the authority.
    first.view.unmount()
    const again = mountShell(store, snapshot)
    const saved = await waitFor(() => {
      const readout = flow('amrap').querySelector<HTMLElement>('[data-timed-saved]')
      expect(readout).not.toBeNull()
      return readout!
    })
    expect(saved).toHaveTextContent('1 rounds')
    expect(saved).toHaveTextContent(`${LOADED} · 7 reps`)
    expect(document.querySelectorAll('dialog[open]')).toHaveLength(0)

    await user.click(within(saved).getByRole('button', { name: 'Edit log' }))
    const edit = within(openLog())
    await user.clear(edit.getByRole('spinbutton', { name: `Next round · ${LOADED}` }))
    await user.type(edit.getByRole('spinbutton', { name: `Next round · ${LOADED}` }), '6')
    await user.click(edit.getByRole('button', { name: 'Save log' }))
    await waitFor(() => expect(flow('amrap').querySelector('[data-timed-saved]')).toHaveTextContent(`${LOADED} · 6 reps`))
    const [loaded] = exerciseIds(again.blocks.amrap)
    expect(store.blocks.size).toBe(1)
    expect(store.movements.get(loaded)).toMatchObject({ round_number: 2, actual_reps: 6 })
    expect(store.calls.filter((call) => call.startsWith(`correct ${again.blocks.amrap.blockId}`))).toHaveLength(1)
    expect(store.calls.filter((call) => call.startsWith(`insert ${loaded}`))).toHaveLength(1)
  })

  it('TASK-015 the forward action saves an unsaved log through the same richer save: BlockPanel hands the shell the timed report', async () => {
    const user = userEvent.setup()
    const store = tables()
    const { blocks, results } = mountShell(store)
    const log = await run(user, 'amrap', 'Start AMRAP', 'Finish early')
    await user.click(log.getByRole('button', { name: 'Increase rounds completed' }))
    await user.click(log.getByRole('radio', { name: 'Too hard' }))
    await closeLog(user)

    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await waitFor(() => expect(results).toHaveLength(1))
    expect(results[0]).toEqual(ok(undefined))
    expect(store.blocks.get(blocks.amrap.blockId)).toMatchObject({ rounds_completed: 1, effort: 'too_hard', perceived_effort: null })
    // Never started, never measured: the other timed blocks save no invented count.
    expect(store.blocks.get(blocks.forTime.blockId)).toMatchObject({ elapsed_seconds: null, completed_under_cap: null })
    expect(store.blocks.get(blocks.ladder.blockId)).toMatchObject({ highest_rung: null })
  })

  it('TASK-AC-6B9598D96180 the attempt and the AMRAP’s counts survive the block being drawn again, as the shipped renderers’ did; outside the shell nothing is stored', async () => {
    const user = userEvent.setup()
    const store = tables()
    const snapshot = session()
    const first = mountShell(store, snapshot)
    await user.click(within(flow('for_time')).getByRole('button', { name: 'Start FOR TIME' }))
    const log = await run(user, 'amrap', 'Start AMRAP', 'Finish early')
    await user.click(log.getByRole('button', { name: 'Increase rounds completed' }))
    await user.click(log.getByRole('button', { name: 'Increase rounds completed' }))
    await user.click(log.getByRole('button', { name: 'Increase rounds completed' }))
    await closeLog(user)
    first.view.unmount()

    mountShell(store, snapshot)
    // The race is still running; the AMRAP is still ended, its log not reopened, its count kept.
    expect(within(flow('for_time')).getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(flow('amrap')).toHaveAttribute('data-phase', 'finished')
    expect(document.querySelectorAll('dialog[open]')).toHaveLength(0)
    await user.click(within(flow('amrap')).getByRole('button', { name: 'Log results' }))
    expect(within(within(openLog()).getByRole('group', { name: 'Rounds completed' })).getByRole('status')).toHaveTextContent('3')
    cleanup()

    // The gallery's runtime: no shell session, so nothing reaches storage.
    window.localStorage.clear()
    const block = sessionProgress(snapshot).sections[0].blocks[1]
    render(
      <WorkoutExperiencePresentationProvider value={{ ...PRODUCT_PRESENTATION, timedWorkflows: { logPresentation: 'sheet', counterStyle: 'wide', saveResult: async () => {} } }}>
        <PreviewBlockCompletion><TimedWorkoutFlow block={block} format="amrap" /></PreviewBlockCompletion>
      </WorkoutExperiencePresentationProvider>,
    )
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Start AMRAP' })) })
    expect(Object.keys(window.localStorage)).toEqual([])
  })
})
