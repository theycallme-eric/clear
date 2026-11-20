/**
 * TASK-046 (REQ-019, C45; G07; R43, R100): the timed families' entry into the
 * shared focused dialog, read in isolation over a completion seam the test
 * holds. The route adoption, its writers, clocks and the four skins are
 * proved in the browser by `e2e/refinement/task-046.spec.ts`.
 *
 * A3 TASK-117 (F3, #743) carries the build's four cases whole, rewritten
 * against Round 7's owners, the ones `/workout` draws: `TimedWorkoutFlow`
 * (`src/ui/timed-workout-flow.tsx`) holding each timed block's attempt, its
 * one "Log results" action and its one `LoggingOverlay`
 * (`src/ui/logging-overlay.tsx`), with `TimedResultLog`
 * (`src/ui/timed-result-log.tsx`) inside it — mounted as the route mounts a
 * timed block (`BlockSlot` under the product presentation). The build's own
 * `src/ui/refinements/timed-result-dialog.tsx` is source material only and is
 * not carried. Each case keeps the build's name and its asserted behaviour,
 * read from Round 7's words and owners; `evidence/refinement/task-117/
 * test-ledger.json` says what each read changed and why:
 *
 *   · Round 7 offers the log once the attempt has ended and opens it itself
 *     as it ends (R43), so "no log until it is opened" is read before the end,
 *     and the action reopens it after a close;
 *   · Round 7 draws the dialog inside the block's flow as a native modal (the
 *     browser lifts it into the top layer), not portalled to the body;
 *   · the form keeps Round 7's accepted name "Log section results" (round-07
 *     decision R7-3), where the build named it by the dialog's title;
 *   · Round 7's log has its own Save log, which the product binds to the
 *     shell's one completion path (A3 TASK-103), so the dialog adds no second
 *     writer;
 *   · the ladder's log opens only after its attempt ends (owner decision 3,
 *     2026-11-16), so no log is drawn before then and its secondary action is
 *     Round 7's Resume ladder.
 *
 * Synthetic data only: in-memory seams, no account and no network.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BlockCompletionContext,
  type BlockCompletionApi,
  type BlockOutcome,
  type BlockRecordedSource,
} from '../state/block-completion'
import { ok } from '../state/errors'
import { WORKOUT_EMOM_STORAGE_KEY, WORKOUT_LADDER_STORAGE_KEY } from '../state/workout-persistence'
import { sessionProgress, type BlockProgress } from '../state/workout-progress'
import { emomEndLogAcceptance, emomEndLogBlock, emomEndLogSnapshot } from '../test/emom-end-log-fixture'
import { FIXTURE_USER_ID } from '../test/user-data-double'
import { snapshotFixture, type BlockFixture } from '../test/workout-double'
import { BlockSlot } from './block-renderers'
import { PRODUCT_PRESENTATION } from './product-presentation'
import { saveLogThroughShell } from './timed-result-shell'
import { WorkoutExperiencePresentationProvider } from './workout-experience-presentation'

/** The opener's words and the dialog's title (accepted reference). */
const TIMED_LOG_OPEN_LABEL = 'Log results'
const TIMED_LOG_TITLE = 'Log results'

const ENTRY = Date.parse('2026-11-11T09:00:00.000Z')
let clock = ENTRY

beforeEach(() => {
  localStorage.clear()
  clock = ENTRY
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

/** Time passes; the page re-reads its clocks, as a resumed tab does. */
function advance(seconds: number) {
  clock += seconds * 1000
  act(() => {
    window.dispatchEvent(new Event('focus'))
  })
}

/**
 * The shell's completion seam, held by the test: what the block reports, the
 * listeners it registers, and the one save path (`saveTimedLog`, which the
 * product's Save log reaches through `saveLogThroughShell`). Its session id
 * lets the block keep its attempt in the route's own storage.
 */
function completionSeam() {
  const reportOutcome = vi.fn<(id: string, outcome: BlockOutcome) => void>()
  const saveTimedLog = vi.fn<NonNullable<BlockCompletionApi['saveTimedLog']>>(async () => ok(null))
  const recorded = new Set<(source: BlockRecordedSource) => void>()
  const api: BlockCompletionApi = {
    reportOutcome,
    reportTimedResult: () => undefined,
    isBlockRecorded: () => false,
    sessionId: 'session-task-046',
    onBlockRecorded: (_id, listener) => {
      recorded.add(listener)
      return () => recorded.delete(listener)
    },
    onBlockSaveFailed: () => () => undefined,
    recordedResult: () => null,
    reopenBlock: () => undefined,
    saveTimedLog,
  }
  return { api, reportOutcome, saveTimedLog }
}

/** A timed block as the route draws it: `BlockSlot` under the product presentation. */
function mountBlock(block: BlockProgress, seam = completionSeam()) {
  render(
    <WorkoutExperiencePresentationProvider value={PRODUCT_PRESENTATION}>
      <BlockCompletionContext value={seam.api}>
        <BlockSlot block={block} />
      </BlockCompletionContext>
    </WorkoutExperiencePresentationProvider>,
  )
  return seam
}

/** The EMOM of the route's own JOURNEY-011 fixture: a loaded kb swing and a bodyweight burpee, ten minutes. */
function emomBlock(): BlockProgress {
  return emomEndLogBlock(emomEndLogSnapshot(emomEndLogAcceptance(), { userId: FIXTURE_USER_ID, startedAt: new Date(ENTRY).toISOString() }))
}

/** A four-round ladder raced under a cap, as the shell hands it to its renderer. */
function ladderBlock(): BlockProgress {
  const fixture: BlockFixture = {
    structureType: 'for_time', repScheme: 'ladder_up', timerType: 'countdown', timerSeconds: 420,
    exercises: [{ prescription: { exercise_id: 'push-up', target_kind: 'sequence', target_value: null, target_sequence: [2, 4, 6, 8] } }],
  }
  const snapshot = snapshotFixture({ sections: [{ title: 'Ladder', sectionType: 'conditioning', blocks: [fixture] }] })
  return sessionProgress(snapshot).sections[0].blocks[0]
}

/** The one timed flow a mount draws. */
function flow(): HTMLElement {
  const flows = document.querySelectorAll<HTMLElement>('.clr-timed-flow')
  expect(flows).toHaveLength(1)
  return flows[0]
}

/** The card's one "Log results" action (Round 7's `.clr-timed-actions` row); null when it offers none. */
function opener(): HTMLButtonElement | null {
  const found = within(flow()).queryAllByRole('button', { name: TIMED_LOG_OPEN_LABEL }) as HTMLButtonElement[]
  expect(found.length).toBeLessThanOrEqual(1)
  return found[0] ?? null
}

/** The timed log dialogs that are open. */
function openDialogs(): HTMLDialogElement[] {
  return [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].filter((dialog) => dialog.querySelector('form.clr-timed-log') !== null)
}

async function endEmom(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
  advance(95)
  await user.click(screen.getByRole('button', { name: 'Finish early' }))
}

describe('TASK-046 TimedResultDialog', () => {
  it('draws one Log results action and no log until it is opened; the log opens in the shared modal titled Log results, named by it, with the framed Close log X focused', async () => {
    const user = userEvent.setup()
    const seam = mountBlock(emomBlock())

    // Ready and running: no action and no log — nothing to log yet.
    expect(opener()).toBeNull()
    expect(openDialogs()).toEqual([])
    expect(document.querySelector('form.clr-timed-log')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    advance(95)
    expect(opener()).toBeNull()
    expect(document.querySelector('form.clr-timed-log')).toBeNull()

    // Ended: Round 7 opens the one log as the schedule ends (R43); closed, the
    // card holds one primary "Log results" action in its full-width action
    // row, collapsed, and no log is open until the athlete opens it.
    await user.click(screen.getByRole('button', { name: 'Finish early' }))
    expect(openDialogs()).toHaveLength(1)
    await user.click(within(openDialogs()[0]).getByRole('button', { name: 'Close log' }))
    await waitFor(() => expect(openDialogs()).toEqual([]))
    const action = opener()!
    expect(action).toHaveClass('clr-btn--primary')
    expect(action.closest('.clr-timed-actions')).not.toBeNull()
    expect(action).toHaveAttribute('aria-expanded', 'false')

    await user.click(action)
    const dialog = screen.getByRole('dialog', { name: TIMED_LOG_TITLE })
    expect(dialog).toHaveClass('clr-logging-overlay')
    expect(dialog.tagName).toBe('DIALOG')
    expect(dialog).toHaveAttribute('open')
    // Round 7 draws the modal inside the block's flow; the browser lifts it into the top layer.
    expect(flow().contains(dialog)).toBe(true)
    expect(opener()).toHaveAttribute('aria-expanded', 'true')
    const form = dialog.querySelector<HTMLElement>('form.clr-timed-log')!
    expect(flow().dataset.timedFormat).toBe('emom')
    const title = within(dialog).getByRole('heading', { name: TIMED_LOG_TITLE })
    expect(title).toHaveClass('clr-logging-overlay__title')
    // Round 07 decision R7-3: the form keeps Round 7's accepted name; the dialog is named by its title.
    expect(form).toHaveAccessibleName('Log section results')
    expect(within(form).queryByRole('heading', { name: TIMED_LOG_TITLE })).toBeNull()
    for (const heading of within(form).queryAllByRole('heading')) expect(heading).toHaveClass('clr-timed-log__group-title')
    expect(within(dialog).getByRole('button', { name: 'Close log' })).toHaveFocus()
    // No second writer: the dialog's one Save is Round 7's Save log, which the
    // product binds to the shell's one completion path (the section's forward
    // action saves through the same path).
    expect(within(dialog).getAllByRole('button', { name: /save/i }).map((button) => button.textContent)).toEqual(['Save log'])
    expect(PRODUCT_PRESENTATION.timedWorkflows?.saveResult).toBe(saveLogThroughShell)
    await user.click(within(dialog).getByRole('button', { name: 'Save log' }))
    expect(seam.saveTimedLog).toHaveBeenCalledTimes(1)
    expect(seam.saveTimedLog.mock.calls[0][0]).toBe(emomBlock().blockId)
  })

  it('closes by the X or Escape without touching the consumer’s record, and a reopen shows the draft', async () => {
    const user = userEvent.setup()
    const seam = mountBlock(emomBlock())
    await endEmom(user)
    await user.type(within(openDialogs()[0]).getByRole('textbox', { name: 'Notes · optional' }), 'Dropped a rep')
    // The consumer's record: what the block reports to the shell (Round 7
    // reports it again on every render, so its value is read), and its stored attempt.
    const reported = () => seam.reportOutcome.mock.lastCall
    const before = reported()
    expect(before).toEqual([emomBlock().blockId, { notes: 'Dropped a rep' }])
    const record = localStorage.getItem(WORKOUT_EMOM_STORAGE_KEY)

    await user.click(within(openDialogs()[0]).getByRole('button', { name: 'Close log' }))
    await waitFor(() => expect(openDialogs()).toEqual([]))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(reported()).toEqual(before)
    expect(localStorage.getItem(WORKOUT_EMOM_STORAGE_KEY)).toBe(record)

    await user.click(opener()!)
    expect(screen.getByRole('textbox', { name: 'Notes · optional' })).toHaveValue('Dropped a rep')
    // Escape is the native cancel (jsdom sends none for the key itself).
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    await waitFor(() => expect(openDialogs()).toEqual([]))
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(opener()!)
    expect(screen.getByRole('textbox', { name: 'Notes · optional' })).toHaveValue('Dropped a rep')
    expect(reported()).toEqual(before)
    expect(localStorage.getItem(WORKOUT_EMOM_STORAGE_KEY)).toBe(record)
    expect(seam.saveTimedLog).not.toHaveBeenCalled()
  })

  it('the ladder’s quiet completion action closes the log in the same act and still runs the consumer’s own handler once', async () => {
    const user = userEvent.setup()
    const block = ladderBlock()
    mountBlock(block)
    await user.click(screen.getByRole('button', { name: 'Start ladder' }))
    advance(40)
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    const finished = JSON.parse(localStorage.getItem(WORKOUT_LADDER_STORAGE_KEY)!)[block.blockId]
    expect(finished.clock.finishedAt).not.toBeNull()
    expect(finished.checkpoint).not.toBeNull()

    await user.click(within(openDialogs()[0]).getByRole('button', { name: 'Undo finish · resume ladder' }))
    // Closed in the same act: no log is open or offered while the attempt runs again.
    expect(openDialogs()).toEqual([])
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener()).toBeNull()
    // The consumer's own handler ran once: the same attempt resumed from the
    // same start, its Finish checkpoint spent, and the focus on its lead control.
    const resumed = JSON.parse(localStorage.getItem(WORKOUT_LADDER_STORAGE_KEY)!)[block.blockId]
    expect(resumed.clock).toEqual({ startedAt: finished.clock.startedAt, finishedAt: null })
    expect(resumed.checkpoint).toBeNull()
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Undo finish · resume ladder' })).toBeNull()
  })

  it('a log drawn before its attempt ends takes the secondary action', async () => {
    const user = userEvent.setup()
    mountBlock(ladderBlock())
    // Owner decision 3 (2026-11-16): the ladder's log opens only after its
    // attempt ends, so none is drawn before then — not as a primary action,
    // not as a secondary one.
    expect(opener()).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Start ladder' }))
    advance(30)
    expect(opener()).toBeNull()
    expect(document.querySelector('form.clr-timed-log')).toBeNull()

    // Once the attempt has ended, the log is what is left to do: its action is
    // primary, and the attempt's own secondary action beside it is Round 7's
    // Resume ladder (while the Finish can still be undone).
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await user.click(within(openDialogs()[0]).getByRole('button', { name: 'Close log' }))
    await waitFor(() => expect(openDialogs()).toEqual([]))
    const row = opener()!.closest<HTMLElement>('.clr-timed-actions')!
    expect(within(row).getAllByRole('button').map((button) => [button.textContent, button.classList.contains('clr-btn--primary') ? 'primary' : 'secondary']))
      .toEqual([['Log results', 'primary'], ['Resume ladder', 'secondary']])
  })
})
