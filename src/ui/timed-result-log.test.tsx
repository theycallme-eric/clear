/**
 * TASK-009 (REQ-009; C25, C26, C27, C28; G08; R52, R54, R55, R56, R57, R79,
 * R83, R85, R90; AC-C25-01, AC-C26-01, AC-C27-01, AC-C28-01, AC-R009-01,
 * AC-R009-02; JOURNEY-009) — the AMRAP's prescription and concise scoring
 * controls, and TASK-010 (REQ-010; C29, C30; R63, R76, R78, R80, R86, R87,
 * R116, R124; AC-C29-01, AC-C30-01, AC-R010-01, AC-R010-02; JOURNEY-010) —
 * completion choices and the existing effort faces.
 *
 * A3 TASK-116 (F3, #739) carries the old build's two describe blocks
 * (`build/clear-refinement-2026-11-04`, 181e580; source material only) onto
 * Round 7's owners, the ones `/workout` draws: `TimedWorkoutFlow`
 * (`src/ui/timed-workout-flow.tsx`) holding each timed block's attempt and its
 * one "Log results" `LoggingOverlay`, with `TimedResultLog`
 * (`src/ui/timed-result-log.tsx`), `QuantitySelector`
 * (`src/ui/quantity-selector.tsx`) and `SetEffortChoice`
 * (`src/ui/set-effort.tsx`) inside it. The build's own owners
 * (`src/ui/refinements/{quantity,timed-result-dialog,timed-result-log}.tsx`)
 * are not carried. Every case keeps the build's name and its asserted
 * behaviour, read from Round 7's controls, words and recipes; the test ledger
 * (`evidence/refinement/task-116/test-ledger.json`) says what each read
 * changed and why. A3 TASK-116 adds one case to each block for its own save
 * authority (TASK-AC-8FF68F3F5241) and the draft that survives close, reopen
 * and a failed save (TASK-AC-ABFEF4069683).
 *
 * JOURNEY-009's entry is the actual `/workout` route: the real router, guard
 * and shell over a running session whose first section holds the accepted
 * AMRAP and whose second is a cooldown (`amrap-result-fixture.ts`), so the
 * section's own forward action saves the AMRAP's result. JOURNEY-010's is the
 * same route over its own fixture (`completion-effort-fixture.ts`): the
 * accepted For Time and the accepted four-round ladder. The wall clock is
 * injected (`Date.now`). Round 7's timed stylesheet is applied to the
 * document, so its recipes are read from the cascade; browser geometry is
 * `e2e/refinement/task-009.spec.ts` and `task-010.spec.ts`, and the look
 * against the accepted gallery is `e2e/refinement/task-116-parity.spec.ts`.
 *
 * Each describe title starts with its task ID and a space, so the checks
 * select them with anchored patterns (`^TASK-009 `, `^TASK-010 `). TASK-117
 * adds this file's TASK-015 block and then owns the whole file.
 *
 * Synthetic data only: in-memory doubles, no account and no network.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { routes } from '../app/router'
import { GalleryRefinements } from '../dev/gallery-refinements'
import { Frown, Meh, Smile } from '../design-system/index'
import { amrapOutcome, amrapShape, amrapView, clampAmrapState, type AmrapState } from '../state/amrap'
import {
  blockResultInsert,
  BlockCompletionContext,
  type BlockCompletion,
  type BlockCompletionApi,
  type BlockOutcome,
  type BlockRecordedSource,
  type RecordedBlockResult,
} from '../state/block-completion'
import { createError, err, ErrorCode, ok } from '../state/errors'
import { clampForTimeState, forTimeOutcome, forTimeShape, forTimeView, type ForTimeState } from '../state/for-time'
import { MOOD_SCALE } from '../state/mood'
import type { BlockResultRow, LadderTiming } from '../state/schemas'
import {
  readAmrapState,
  readForTimeState,
  WORKOUT_AMRAP_STORAGE_KEY,
  WORKOUT_FOR_TIME_STORAGE_KEY,
  WORKOUT_LADDER_STORAGE_KEY,
} from '../state/workout-persistence'
import { sessionProgress, type BlockProgress } from '../state/workout-progress'
import {
  AMRAP_COUNTS,
  AMRAP_SECTION_TITLE,
  AMRAP_WINDOW_SECONDS,
  COOLDOWN_SECTION_TITLE,
  amrapResultAcceptance,
  amrapResultBlock,
  amrapResultSnapshot,
} from '../test/amrap-result-fixture'
import {
  COMPLETION_ANSWERS,
  COOLDOWN_SECTION_TITLE as RESULTS_COOLDOWN_TITLE,
  EFFORT_LEGEND,
  EFFORT_WORDS,
  FOR_TIME_CAP_SECONDS,
  LADDER_CAP,
  LADDER_ROUNDS,
  RESULTS_SECTION_TITLE,
  WORK_COMPLETED,
  completionEffortAcceptance,
  completionEffortBlocks,
  completionEffortSnapshot,
} from '../test/completion-effort-fixture'
import { AppProviders, signedIn } from '../test/render'
import { FIXTURE_USER_ID } from '../test/user-data-double'
import { createWorkoutDouble, snapshotFixture, type BlockFixture, type WorkoutDoubleOptions } from '../test/workout-double'
import { BlockSlot } from './block-renderers'
import { PRODUCT_PRESENTATION } from './product-presentation'
import { SET_EFFORT_CHOICES } from './set-effort'
import { WorkoutExperiencePresentationProvider } from './workout-experience-presentation'

const ROOT = resolve(import.meta.dirname, '../..')
/** Round 7's timed stylesheet: the one file that declares the log, the counts and the completion row. */
const TIMED_CSS = readFileSync(resolve(ROOT, 'src/styles/timed-workout.css'), 'utf8')

beforeAll(() => {
  if (document.head.querySelector('style[data-task116="src/styles/timed-workout.css"]') !== null) return
  const style = document.createElement('style')
  style.dataset.task116 = 'src/styles/timed-workout.css'
  style.textContent = TIMED_CSS
  document.head.append(style)
})

const ENTRY = Date.parse('2026-11-09T09:00:00.000Z')
let clock = ENTRY

beforeEach(() => {
  localStorage.clear()
  clock = ENTRY
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
})

afterEach(() => {
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

// ─────────────────────────────────────────────────────────────────────────────
// Round 7's timed log: the flow, its "Log results" action and its dialog
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The words each Round 7 card names its work by (`TimedWorkoutFlow`):
 * `Movements in this <format label>`, and the ladder's compact prescription
 * (`LadderPrescription`). The build named them `Movements in this block` and
 * `Rounds in this ladder` (`completion-effort-fixture.ts`, carried unchanged).
 */
const AMRAP_WORK = 'Movements in this AMRAP'
const FOR_TIME_WORK = 'Movements in this FOR TIME'
const LADDER_WORK = 'Prescribed ladder rounds'

/** The timed block's Round 7 flow — its card, its actions and its log dialog — around a work list. */
function flowAround(listName: string, scope: HTMLElement = document.body): HTMLElement {
  const found = within(scope).getByRole('list', { name: listName }).closest<HTMLElement>('.clr-timed-flow')
  if (found === null) throw new Error(`${listName} has no timed flow`)
  return found
}

/** The AMRAP's live flow. */
function card(): HTMLElement {
  return flowAround(AMRAP_WORK)
}

/** Every timed log dialog open within `scope`: Round 7's one "Log results" `LoggingOverlay`. */
function openLogDialogs(scope: ParentNode = document): HTMLDialogElement[] {
  return [...scope.querySelectorAll<HTMLDialogElement>('dialog[open]')].filter(
    (dialog) => dialog.querySelector('form.clr-timed-log') !== null,
  )
}

/** The flow's "Log results" action: the one place its log is offered on the card. Null when it offers none. */
function timedLogOpener(scope: HTMLElement): HTMLButtonElement | null {
  const openers = [...scope.querySelectorAll<HTMLButtonElement>('.clr-timed-actions button')].filter(
    (button) => button.textContent === 'Log results',
  )
  if (openers.length > 1) throw new Error(`expected at most one timed log in scope, found ${openers.length}`)
  return openers[0] ?? null
}

/** Closes every open timed log with its framed X, as an athlete would before the forward action. */
async function closeTimedLogs() {
  for (const dialog of openLogDialogs()) fireEvent.click(within(dialog).getByRole('button', { name: 'Close log' }))
  await waitFor(() => expect(openLogDialogs()).toEqual([]))
}

/**
 * The block's log. TASK-046 (C45; R100): the card holds one "Log results"
 * action, and the form — Round 7's `TimedResultLog` — is in the shared focused
 * dialog, whose title "Log results" is the form's one title. Opening it is
 * the athlete's step (a log already open in `scope` is read as it is); null
 * when the card offers no log. Round 7 draws the dialog inside the flow (the
 * browser lifts it into the top layer), so the form is never drawn anywhere
 * but in an open modal dialog.
 */
function queryLog(scope: HTMLElement = card()): HTMLElement | null {
  for (const form of scope.querySelectorAll('form.clr-timed-log')) {
    expect(form.closest('dialog'), 'the log is never inline on the card').not.toBeNull()
  }
  if (openLogDialogs(scope).length === 0) {
    const opener = timedLogOpener(scope)
    if (opener === null) return null
    for (const other of openLogDialogs()) fireEvent.click(within(other).getByRole('button', { name: 'Close log' }))
    fireEvent.click(opener)
  }
  const open = openLogDialogs(scope)
  expect(open, 'one open log').toHaveLength(1)
  return open[0].querySelector<HTMLElement>('form.clr-timed-log')
}

function log(scope: HTMLElement = card()): HTMLElement {
  const found = queryLog(scope)
  if (found === null) throw new Error('the block offers no log')
  const dialog = found.closest('dialog')!
  expect(dialog).toHaveAttribute('aria-label', 'Log results')
  const title = within(dialog).getByRole('heading', { name: 'Log results' })
  expect(title).toHaveClass('clr-logging-overlay__title')
  return found
}

/** The log a lookup reads: `scope` itself when it is (or is inside) the open log, else the log opened from it. */
function logScope(scope?: HTMLElement): HTMLElement {
  if (scope === undefined) return log()
  return scope.closest('form.clr-timed-log') !== null || scope.matches('dialog') ? scope : log(scope)
}

/** One count's parts, by its label, read in the open log (Round 7's `QuantitySelector`). */
function count(label: string, scope?: HTMLElement) {
  const group = within(logScope(scope)).getByRole('group', { name: label })
  const name = label.toLowerCase()
  const value = group.querySelector<HTMLOutputElement>('output')
  if (value === null) throw new Error(`${label} has no value`)
  return {
    group,
    value,
    minus: within(group).getByRole('button', { name: `Decrease ${name}` }),
    plus: within(group).getByRole('button', { name: `Increase ${name}` }),
  }
}

/** What a count shows: `blank` (Round 7 draws a dash, "not recorded"), or its number. */
function shown(label: string, scope?: HTMLElement): string {
  const { value } = count(label, scope)
  if (value.hasAttribute('data-empty')) {
    expect(value).toHaveTextContent(/^—$/)
    expect(value).toHaveAccessibleName(`${label}: not recorded`)
    return 'blank'
  }
  return value.textContent ?? ''
}

async function tap(user: ReturnType<typeof userEvent.setup>, button: HTMLElement, times = 1) {
  for (let index = 0; index < times; index += 1) await user.click(button)
}

/** `a` comes after `b` in the document. */
function follows(a: Node, b: Node): boolean {
  return (b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

function stored(blockId: string): AmrapState | null {
  return readAmrapState(localStorage, blockId)
}

/** The declared body of one rule in Round 7's timed stylesheet. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(TIMED_CSS.replaceAll(/\/\*[\s\S]*?\*\//g, ''))?.[1] ?? ''
}

/** Every control or sentence the rejected reset/toggle design offered (C28, R57). */
const RETIRED = /^(clear rounds|no partial round|record rounds|partial round|reset|clear|clear all)\b/i

function expectNoResetControls(scope: HTMLElement) {
  expect(within(scope).queryAllByRole('button', { name: RETIRED })).toEqual([])
  expect(within(scope).queryByText(/No rounds recorded|No partial round recorded|leave it blank/i)).toBeNull()
  expect(scope.querySelectorAll('.clr-text-action')).toHaveLength(0)
}

async function startAndFinishEarly(user: ReturnType<typeof userEvent.setup>, seconds: number) {
  await user.click(within(card()).getByRole('button', { name: 'Start AMRAP' }))
  advance(seconds)
  await user.click(within(card()).getByRole('button', { name: 'Finish early' }))
}

/** The block's clock as Round 7 draws it: its caption and its reading, from the timer's spoken words. */
function timerWords(scope: HTMLElement, name: string): string {
  return within(scope).getByRole('timer', { name }).querySelector('.a11y-hidden')?.textContent ?? ''
}

// ─────────────────────────────────────────────────────────────────────────────
// The route harness
// ─────────────────────────────────────────────────────────────────────────────

const running = () =>
  amrapResultSnapshot(amrapResultAcceptance(), {
    userId: FIXTURE_USER_ID,
    startedAt: new Date(ENTRY - 60_000).toISOString(),
  })

/** JOURNEY-009's entry: `/workout`, the session running for one minute, the AMRAP ready. */
async function openWorkout(options: Omit<WorkoutDoubleOptions, 'session'> = {}, path = '/workout') {
  const snapshot = running()
  const double = createWorkoutDouble({ session: snapshot, ...options })
  const router = createMemoryRouter(routes, { initialEntries: ['/', path], initialIndex: 1 })
  const view = render(
    <AppProviders {...signedIn({ workout: double.clients })}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  if (path === '/workout') {
    await screen.findByRole('navigation', { name: 'Workout sections' })
    await screen.findByRole('list', { name: AMRAP_WORK })
  }
  return { double, router, view, snapshot, block: amrapResultBlock(snapshot) }
}

/** History's reading for one saved block: its label and its value, by the label's exact words. */
function historyReading(label: string, scope: HTMLElement = document.body): string {
  return within(scope).getByText(label, { exact: true }).parentElement?.textContent ?? ''
}

async function openHistory(sessionId: string, clients: ReturnType<typeof createWorkoutDouble>['clients']) {
  const history = createMemoryRouter(routes, { initialEntries: ['/', `/history/${sessionId}`], initialIndex: 1 })
  render(
    <AppProviders {...signedIn({ workout: clients })}>
      <RouterProvider router={history} />
    </AppProviders>,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// A direct mount, as the route draws one block
// ─────────────────────────────────────────────────────────────────────────────

/** A block the route fixture does not hold, as the live shell hands it to its renderer. */
function fixtureBlock(fixture: BlockFixture, timing: LadderTiming | null = null): BlockProgress {
  const snapshot = snapshotFixture({
    sections: [{ title: 'Conditioning', sectionType: 'conditioning', blocks: [fixture] }],
  })
  return { ...sessionProgress(snapshot).sections[0].blocks[0], ladderTiming: timing }
}

function rungs(exerciseId: string, sequence: number[]) {
  return { prescription: { exercise_id: exerciseId, target_kind: 'sequence' as const, target_value: null, target_sequence: sequence } }
}

/**
 * A completion seam the test holds: the outcome the block reports, the
 * listeners it registers (`onBlockRecorded`, `onBlockSaveFailed`) so the test
 * can speak as the shell, and `reopenBlock`. Its session id lets the block
 * keep its attempt in the route's own storage (`localStorage`), as the shell's
 * provider does.
 */
function completionSeam(options: { saveTimedLog?: BlockCompletionApi['saveTimedLog']; recorded?: RecordedBlockResult | null } = {}) {
  const reportOutcome = vi.fn<(id: string, outcome: BlockOutcome) => void>()
  const reopenBlock = vi.fn<(id: string) => void>()
  const recordedListeners = new Set<(source: BlockRecordedSource) => void>()
  const failedListeners = new Set<() => void>()
  const api: BlockCompletionApi = {
    reportOutcome,
    reportTimedResult: () => undefined,
    isBlockRecorded: () => false,
    sessionId: 'session-task-116',
    onBlockRecorded: (_id, listener) => {
      recordedListeners.add(listener)
      return () => recordedListeners.delete(listener)
    },
    onBlockSaveFailed: (_id, listener) => {
      failedListeners.add(listener)
      return () => failedListeners.delete(listener)
    },
    recordedResult: () => options.recorded ?? null,
    reopenBlock,
    ...(options.saveTimedLog === undefined ? {} : { saveTimedLog: options.saveTimedLog }),
  }
  return {
    api,
    reportOutcome,
    reopenBlock,
    last: () => reportOutcome.mock.lastCall?.[1],
    /** The shell's word that the block's row exists. */
    recorded: (source: BlockRecordedSource) => act(() => { for (const listener of [...recordedListeners]) listener(source) }),
    /** The shell's word that the forward action's save of the block failed. */
    failed: () => act(() => { for (const listener of [...failedListeners]) listener() }),
  }
}

/** A direct mount of one timed block as the route draws it: `BlockSlot` under the product presentation. */
function mountDirect(block: BlockProgress, seam = completionSeam()) {
  const view = render(
    <WorkoutExperiencePresentationProvider value={PRODUCT_PRESENTATION}>
      <BlockCompletionContext value={seam.api}>
        <BlockSlot block={block} />
      </BlockCompletionContext>
    </WorkoutExperiencePresentationProvider>,
  )
  return { ...seam, view }
}

/** The one timed flow a direct mount draws. */
function directFlow(): HTMLElement {
  const flows = document.querySelectorAll<HTMLElement>('.clr-timed-flow')
  expect(flows).toHaveLength(1)
  return flows[0]
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK-009 — the AMRAP's prescription and concise scoring controls (C25–C28)
// ─────────────────────────────────────────────────────────────────────────────

describe('TASK-009 AMRAP prescription and concise scoring controls', () => {
  it('AC-C25-01 AMRAP work and its prescription precede the scoring on the real /workout route: ready, running and paused ask for no score, and once the window closes the log follows every movement', async () => {
    const user = userEvent.setup()
    await openWorkout()

    // Ready: the prescription is there to read, and nothing is scored yet.
    // Round 7 states the window on the card's meta line (`8 MIN`) beside the
    // format badge, where the build wrote a sentence.
    const list = within(card()).getByRole('list', { name: AMRAP_WORK })
    const movements = within(list).getAllByRole('listitem')
    expect(movements).toHaveLength(2)
    expect(movements[0].textContent).toMatch(/kb swing/i)
    expect(movements[0].textContent).toContain('12 reps')
    expect(movements[0].textContent).toContain('24 kg')
    expect(movements[1].textContent).toMatch(/burpee/i)
    expect(movements[1].textContent).toContain('10 reps')
    expect(within(card()).getByText('8 MIN')).toHaveClass('clr-timed-meta')
    expect(follows(list, within(card()).getByText('8 MIN'))).toBe(true)
    expect(queryLog()).toBeNull()
    expect(within(card()).queryAllByRole('group', { name: /Rounds completed|Reps into the next round/ })).toEqual([])

    // Running and paused: still nothing to enter.
    await user.click(within(card()).getByRole('button', { name: 'Start AMRAP' }))
    advance(30)
    expect(queryLog()).toBeNull()
    await user.click(within(card()).getByRole('button', { name: 'Pause' }))
    expect(timerWords(card(), 'AMRAP time')).toMatch(/^Paused\. /)
    expect(queryLog()).toBeNull()
    await user.click(within(card()).getByRole('button', { name: 'Resume' }))

    // Ended early: the work first, then the log — every movement and every one
    // of its readings before the log's place on the card (TASK-046: its
    // "Log results" action) and the log's title and both counts. Round 7's
    // clock settles on the window left (06:25 of 08:00, after 01:35 of work).
    advance(65)
    await user.click(within(card()).getByRole('button', { name: 'Finish early' }))
    expect(timerWords(card(), 'AMRAP time')).toBe('Finished. 6 minutes 25 seconds')
    const opener = timedLogOpener(card())!
    const form = log()
    const title = within(form.closest('dialog')!).getByRole('heading', { name: 'Log results' })
    expect(follows(opener, list)).toBe(true)
    expect(list.contains(opener)).toBe(false)
    expect(follows(form, list)).toBe(true)
    expect(list.contains(form)).toBe(false)
    const readings = card().querySelectorAll('.clr-movement-identity')
    expect(readings).toHaveLength(2)
    for (const reading of readings) {
      expect(follows(opener, reading), 'every prescription before the scoring').toBe(true)
      expect(follows(title, reading), 'every prescription before the scoring').toBe(true)
    }
    for (const label of AMRAP_COUNTS) {
      expect(follows(count(label).group, list), `${label} after the work`).toBe(true)
    }
    // The section's completion state comes after the result, never between.
    const roundsFirst = count(AMRAP_COUNTS[0]).group
    expect(follows(count(AMRAP_COUNTS[1]).group, roundsFirst)).toBe(true)

    // The cap ends it the same way: a fresh mount long after the window.
    // Round 7's AMRAP clock says its window ran out as `Time complete`.
    cleanup()
    localStorage.clear()
    clock = ENTRY
    await openWorkout()
    await user.click(within(card()).getByRole('button', { name: 'Start AMRAP' }))
    advance(AMRAP_WINDOW_SECONDS + 5)
    await waitFor(() => expect(timerWords(card(), 'AMRAP time')).toMatch(/^Time complete\. /))
    expect(follows(timedLogOpener(card())!, within(card()).getByRole('list', { name: AMRAP_WORK }))).toBe(true)
    const capped = log()
    expect(follows(capped, within(card()).getByRole('list', { name: AMRAP_WORK }))).toBe(true)
  })

  it('AC-C26-01 AMRAP rounds and the partial round are one result group under the simple log hierarchy: one Log results title, labels before their counts, no Result, Movements or Feedback group titles', async () => {
    const user = userEvent.setup()
    await openWorkout()
    await startAndFinishEarly(user, 95)

    const form = log()
    expect(form.tagName).toBe('FORM')
    // TASK-046: never inline any more — the one form is the open dialog's,
    // and the card draws no form of its own.
    const dialog = form.closest('dialog')!
    expect(dialog.open).toBe(true)
    expect(dialog.querySelectorAll('form')).toHaveLength(1)
    expect([...card().querySelectorAll('form')].filter((each) => each.closest('dialog') === null)).toEqual([])
    expect(form.dataset.logHierarchy).toBe('simple')
    expect(card().dataset.timedFormat).toBe('amrap')

    // One title — TASK-046: the dialog's, "Log results", at the level of the
    // card's own group heading, and none drawn by the form itself. TASK-015
    // (C37) adds per-movement groups after the counts, each titled by its
    // movement's name; those are the only other headings, and no Result /
    // Movements / Feedback title joins them. (Which movements get a group is
    // TASK-015's own assertion, carried by TASK-117.)
    const groupTitles = within(dialog).getAllByRole('heading').filter((heading) => heading.classList.contains('clr-timed-log__group-title'))
    const headings = within(dialog).getAllByRole('heading').filter((heading) => !heading.classList.contains('clr-timed-log__group-title'))
    expect(headings.map((heading) => heading.textContent)).toEqual(['Log results'])
    expect(groupTitles.length).toBeGreaterThan(0)
    for (const heading of groupTitles) expect(['kb swing', 'burpee']).toContain(heading.textContent)
    expect(within(form).queryByRole('heading', { name: 'Log results' })).toBeNull()
    const title = headings[0]
    expect(title).toHaveClass('clr-logging-overlay__title')
    const section = within(card()).getByRole('heading', { name: AMRAP_SECTION_TITLE })
    expect(title.tagName).toBe(section.tagName)
    for (const retired of ['Result', 'Movements', 'Feedback', 'Your score']) {
      expect(within(form).queryByText(retired, { exact: true })).toBeNull()
    }

    // One group holds both counts, rounds first; each label precedes its frame.
    // (TASK-015's per-movement groups follow it and are not result groups: each
    // is titled by its movement.) TASK-047 (REQ-031; R80) adds the closing
    // feedback group — the effort faces and the notes — after them, so the
    // counts' group is the first of two untitled groups and the only one
    // holding a count.
    const groups = [...form.querySelectorAll<HTMLElement>('.clr-timed-log__group')].filter(
      (group) => group.querySelector(':scope > .clr-timed-log__group-title') === null,
    )
    expect(groups).toHaveLength(2)
    expect(groups[1].querySelector('.clr-quantity')).toBeNull()
    expect(within(groups[1]).getByRole('group', { name: 'Effort · optional' })).toBeInTheDocument()
    expect(within(groups[1]).getByRole('textbox', { name: 'Notes · optional' })).toBeInTheDocument()
    const fields = [...groups[0].querySelectorAll<HTMLElement>('.clr-timed-field')]
    expect(fields.map((field) => field.querySelector('.label')?.textContent)).toEqual([...AMRAP_COUNTS])
    for (const field of fields) {
      const [label, frame] = [...field.children]
      expect(label).toHaveClass('label')
      expect(frame).toHaveClass('clr-quantity')
      // The label names the count it introduces, and the frame carries the same words.
      expect(label.getAttribute('for')).toBe(frame.querySelector('output')!.id)
      expect(frame).toHaveAccessibleName(label.textContent!)
    }
    expect(fields[0].closest('.clr-timed-log__group')).toBe(fields[1].closest('.clr-timed-log__group'))

    // The accepted rhythm: the log under one rule, wider gaps between groups
    // than between the fields of one group, label close to its control.
    expect(rule('.clr-timed-log')).toMatch(/border-block-start:\s*var\(--border-width\) solid var\(--border-region-rule\)/)
    expect(TIMED_CSS).toMatch(/\.clr-timed-log\s*\{\s*gap:\s*var\(--spacing-600\);?\s*\}/)
    expect(rule('.clr-timed-log__group')).toMatch(/gap:\s*var\(--spacing-400\)/)
    expect(rule('.clr-timed-field')).toMatch(/gap:\s*var\(--spacing-200\)/)
    expect(getComputedStyle(groups[0]).flexDirection).toBe('column')

    // Enter in the log navigates nowhere: the submit is the form's own.
    const submitted = new Event('submit', { bubbles: true, cancelable: true })
    act(() => {
      form.dispatchEvent(submitted)
    })
    expect(submitted.defaultPrevented).toBe(true)
  })

  it('AC-C27-01 AMRAP each count is one wide frame holding framed minus and plus actions around a distinct value, in the selected roomier geometry (AC-R009-01)', async () => {
    const user = userEvent.setup()
    await openWorkout()
    await startAndFinishEarly(user, 95)
    await tap(user, count('Rounds completed').plus, 2)

    for (const label of AMRAP_COUNTS) {
      const { group, value, minus, plus } = count(label)
      // One frame: the soft small-corner structure chamfer, holding exactly
      // minus, value and plus — nothing else inside, nothing outside.
      expect(group).toHaveClass('clr-quantity', 'clr-chamfer', 'clr-chamfer--sm', 'clr-chamfer--structure')
      const cells = [...group.children]
      expect(cells).toHaveLength(3)
      expect(cells[0].contains(minus)).toBe(true)
      expect(cells[1]).toBe(value)
      expect(cells[2].contains(plus)).toBe(true)

      // Framed actions: the shared secondary icon button, in its own chamfer,
      // emitting through the interaction role (pink in Signal) — or the
      // disabled role, which is the minus's real state at blank or zero.
      for (const action of [minus, plus]) {
        expect(action).toHaveClass('clr-btn', 'clr-chamfer', 'clr-chamfer--sm', 'clr-hit')
        expect(action).not.toHaveClass('clr-btn--primary')
        expect(action).not.toHaveClass('clr-btn--quiet')
        expect(action.querySelector('svg')).not.toBeNull()
        const bleed = action.parentElement as HTMLElement
        expect(bleed).toHaveClass('clr-bleed')
        expect(bleed.style.getPropertyValue('--bleed')).toBe(
          (action as HTMLButtonElement).disabled ? 'var(--border-disabled)' : 'var(--border-cta-primary)',
        )
      }

      // A distinct value: Round 7's output in the timer role and data face, centred.
      expect(value.tagName).toBe('OUTPUT')
    }
    expect(count('Rounds completed').plus.parentElement!.style.getPropertyValue('--bleed')).toBe('var(--border-cta-primary)')
    expect(count('Rounds completed').minus.parentElement!.style.getPropertyValue('--bleed')).toBe('var(--border-cta-primary)')
    expect(count('Reps into the next round').minus.parentElement!.style.getPropertyValue('--bleed')).toBe('var(--border-disabled)')

    // The selected roomier recipe (R83): control-height action columns, the
    // value filling the middle, the frame's roomier padding around all three —
    // Round 7's `wide` counter, the one the product presentation selects.
    expect(card().dataset.counterStyle).toBe('wide')
    const frame = rule('.clr-quantity')
    expect(frame).toMatch(/display:\s*grid/)
    expect(frame).toMatch(/grid-template-columns:\s*var\(--control-height\) minmax\(0,\s*1fr\) var\(--control-height\)/)
    const wide = rule('[data-counter-style=wide] .clr-quantity')
    expect(wide).toMatch(/grid-template-columns:\s*var\(--control-height\) minmax\(0,\s*1fr\) var\(--control-height\)/)
    expect(wide).toMatch(/padding:\s*var\(--spacing-300\)/)
    const valueRule = rule('.clr-quantity output')
    expect(valueRule).toMatch(/color:\s*var\(--text-timer\)/)
    expect(valueRule).toMatch(/var\(--font-data\)/)
    expect(valueRule).toMatch(/text-align:\s*center/)
    expect(rule('[data-counter-style=wide] .clr-quantity output')).toMatch(/font-size:\s*var\(--heading-h2-size\)/)
    const applied = getComputedStyle(count('Rounds completed').group)
    expect(applied.display).toBe('grid')
  })

  it('AC-C28-01 AMRAP Clear rounds and No partial round are gone with nothing in their place: blank reads as not recorded, the minus taps down to an explicit zero and stops, and no tap ever clears a value', async () => {
    const user = userEvent.setup()
    const { block } = await openWorkout()
    await startAndFinishEarly(user, 95)

    expectNoResetControls(card())
    expectNoResetControls(log())
    // Blank on arrival: a dash, "not recorded" to assistive technology.
    for (const label of AMRAP_COUNTS) {
      const { value, minus } = count(label)
      expect(shown(label)).toBe('blank')
      expect(value).toHaveTextContent('—')
      expect(value).toHaveAccessibleName(`${label}: not recorded`)
      expect(minus).toBeDisabled()
    }
    expect(stored(block.blockId)).toMatchObject({ roundsCompleted: null, partialRoundReps: null })

    // Up three, down three: an explicit zero, and the minus stops there.
    const rounds = count('Rounds completed')
    await tap(user, rounds.plus, 3)
    expect(shown('Rounds completed')).toBe('3')
    await tap(user, count('Rounds completed').minus, 3)
    expect(shown('Rounds completed')).toBe('0')
    expect(count('Rounds completed').value).toHaveTextContent(/^0$/)
    expect(count('Rounds completed').minus).toBeDisabled()
    await tap(user, count('Rounds completed').minus, 2)
    expect(shown('Rounds completed')).toBe('0')
    expect(stored(block.blockId)).toMatchObject({ roundsCompleted: 0, partialRoundReps: null })

    // The other count is untouched by the first: still blank, not zero.
    expect(shown('Reps into the next round')).toBe('blank')

    // A partial round of one, back to zero: an observed zero.
    await tap(user, count('Reps into the next round').plus)
    await tap(user, count('Reps into the next round').minus)
    expect(shown('Reps into the next round')).toBe('0')
    expect(stored(block.blockId)).toMatchObject({ roundsCompleted: 0, partialRoundReps: 0 })
    expectNoResetControls(card())
    expectNoResetControls(log())
  })

  it('AC-R009-02 AMRAP blank and an explicit zero stay apart end to end: stopping records no work, then the stored record, a reload, the saved block result and History all read blank as absent and zero as zero', async () => {
    const user = userEvent.setup()
    const first = await openWorkout()
    await startAndFinishEarly(user, 95)

    // Stopping is not scoring: the time, and no rounds or partial round.
    expect(stored(first.block.blockId)).toEqual({
      startedAt: new Date(ENTRY).toISOString(),
      endedAtSeconds: 95,
      roundsCompleted: null,
      partialRoundReps: null,
    })

    // Rounds left blank; the partial round an explicit zero.
    await tap(user, count('Reps into the next round').plus)
    await tap(user, count('Reps into the next round').minus)
    expect(stored(first.block.blockId)).toMatchObject({ roundsCompleted: null, partialRoundReps: 0 })

    // The reload: the tree goes, the storage stays, and both read as before.
    first.view.unmount()
    const second = await openWorkout()
    expect(shown('Rounds completed')).toBe('blank')
    expect(shown('Reps into the next round')).toBe('0')
    expect(timerWords(card(), 'AMRAP time')).toBe('Finished. 6 minutes 25 seconds')

    // The save: the section's one forward action writes the block's row.
    await closeTimedLogs()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    expect(await screen.findByRole('heading', { name: COOLDOWN_SECTION_TITLE })).toBeInTheDocument()
    const recorded = second.double.recorded()
    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toEqual({
      blockId: second.block.blockId,
      outcome: { elapsedSeconds: 95, partialRoundReps: 0 },
      perceivedEffort: null,
    })
    const row = blockResultInsert(recorded[0])
    expect(row).toMatchObject({ rounds_completed: null, partial_round_reps: 0, elapsed_seconds: 95, completed_under_cap: null })

    // Back to the saved section: the values are still the values. Round 7
    // reads a saved log back as "Log saved", and its correction ("Edit log")
    // opens the log over the saved row.
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(await screen.findByRole('heading', { name: AMRAP_SECTION_TITLE })).toBeInTheDocument()
    const saved = card().querySelector<HTMLElement>('[data-timed-saved]')!
    expect(within(saved).getByRole('status')).toHaveTextContent('Log saved')
    expect(saved).not.toHaveTextContent(/rounds/)
    expect(timedLogOpener(card())).toBeNull()
    await user.click(within(saved).getByRole('button', { name: 'Edit log' }))
    expect(shown('Rounds completed')).toBe('blank')
    expect(shown('Reps into the next round')).toBe('0')

    // History reads the saved row back — the record a later visit opens,
    // through the same clients: a partial round of zero reps, and no rounds
    // reading at all. Absence, not a zero.
    second.view.unmount()
    await openHistory(second.snapshot.session.id, second.double.clients)
    const partial = await screen.findByText('Partial round')
    const reading = partial.parentElement as HTMLElement
    expect(reading).toHaveTextContent(/^Partial round0 reps$/)
    const result = reading.parentElement as HTMLElement
    expect(result).toHaveTextContent(/^AMRAP · 8 MINPartial round0 reps$/)
    expect(within(result).queryByText('Rounds')).toBeNull()
    expect(within(result).queryByText('Not scored')).toBeNull()
  })

  it('AC-R009-02 AMRAP a failed save keeps the entered result on screen and the retry writes it once, unchanged', async () => {
    const user = userEvent.setup()
    const rows: BlockCompletion[] = []
    let refusing = true
    const record = vi.fn(async (completion: BlockCompletion) => {
      if (refusing) return err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))
      rows.push(completion)
      return ok({} as BlockResultRow)
    })
    const { block } = await openWorkout({ blockResults: { record } })
    await startAndFinishEarly(user, 120)
    await tap(user, count('Rounds completed').plus, 2)

    // TASK-046: the log is closed (its X) before the section's forward action.
    await closeTimedLogs()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    const failed = await screen.findByRole('dialog', { name: /didn’t save/ })
    expect(failed).toHaveTextContent('That didn’t save')
    expect(rows).toEqual([])
    // Nothing discarded and nothing filled in while the save failed.
    expect(shown('Rounds completed')).toBe('2')
    expect(shown('Reps into the next round')).toBe('blank')
    expect(stored(block.blockId)).toMatchObject({ roundsCompleted: 2, partialRoundReps: null })
    await closeTimedLogs()

    refusing = false
    await user.click(within(failed).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: COOLDOWN_SECTION_TITLE })).toBeInTheDocument()
    expect(rows).toEqual([{ blockId: block.blockId, outcome: { elapsedSeconds: 120, roundsCompleted: 2 }, perceivedEffort: null }])
  })

  it('AC-R009-02 AMRAP records written before this change load and read exactly as before: rounds, an observed zero and a blank partial round each keep their meaning', async () => {
    const block = amrapResultBlock(running())
    const shape = amrapShape(block)
    const startedAt = new Date(ENTRY - 400_000).toISOString()
    const records: { stored: AmrapState; shown: [string, string] }[] = [
      // Before rounds became optional or Pause existed (the shape EXE-04c wrote).
      { stored: { startedAt, endedAtSeconds: 300, roundsCompleted: 2, partialRoundReps: null }, shown: ['2', 'blank'] },
      // Both observed zeros, entered through the retired Record rounds / Partial round toggles.
      { stored: { startedAt, endedAtSeconds: 300, roundsCompleted: 0, partialRoundReps: 0 }, shown: ['0', '0'] },
      // Rounds cleared back to blank with the retired Clear rounds, a partial round kept.
      { stored: { startedAt, endedAtSeconds: 300, roundsCompleted: null, partialRoundReps: 7 }, shown: ['blank', '7'] },
      // Closed by the cap while away, nothing entered.
      { stored: { startedAt: new Date(ENTRY - 900_000).toISOString(), endedAtSeconds: null, roundsCompleted: null, partialRoundReps: null }, shown: ['blank', 'blank'] },
    ]

    for (const { stored: record, shown: expected } of records) {
      localStorage.clear()
      localStorage.setItem(WORKOUT_AMRAP_STORAGE_KEY, JSON.stringify({ [block.blockId]: record }))
      const { double } = await openWorkout()
      expect(AMRAP_COUNTS.map((label) => shown(label))).toEqual(expected)
      // Read exactly as the unchanged state module reads it — and nothing rewritten.
      const sinceStart = Math.floor((ENTRY - Date.parse(record.startedAt!)) / 1000)
      const before = amrapOutcome(amrapView(clampAmrapState(record, shape), shape, sinceStart))
      await closeTimedLogs()
      await act(async () => {
        await userEvent.setup().click(screen.getByRole('button', { name: 'Next section' }))
      })
      await screen.findByRole('heading', { name: COOLDOWN_SECTION_TITLE })
      expect(double.recorded()[0]?.outcome).toEqual(before)
      expect(JSON.parse(localStorage.getItem(WORKOUT_AMRAP_STORAGE_KEY) ?? '{}')[block.blockId]).toEqual(record)
      cleanup()
    }
  })

  it('JOURNEY-009 AMRAP the accepted gallery state draws the route’s own AMRAP: work first, the grouped log and framed counts, blank beside an explicit zero, memory only', async () => {
    const user = userEvent.setup()
    const fetch = vi.spyOn(globalThis, 'fetch')
    render(
      <MemoryRouter initialEntries={['/gallery/refinements?state=amrap&open=1']}>
        <GalleryRefinements />
      </MemoryRouter>,
    )
    const state = document.querySelector<HTMLElement>('[data-refinement-state="amrap"]')!
    expect(state).not.toBeNull()
    expect(screen.getByRole('link', { name: 'AMRAP results' })).toHaveAttribute('aria-current', 'page')

    // Round 7's accepted state is one attempt, driven past its cap by the
    // gallery's own "Open …" drive: the route's `TimedWorkoutFlow` over the
    // gallery's AMRAP, its log opened by the flow as the window closes.
    await waitFor(() => expect(openLogDialogs(state)).toHaveLength(1), { timeout: 3000 })
    const live = flowAround(AMRAP_WORK, state)
    expect(live.dataset.timedFormat).toBe('amrap')
    const list = within(live).getByRole('list', { name: AMRAP_WORK })
    // TASK-046: the log's place is the card's "Log results" action, after the work.
    expect(follows(timedLogOpener(live)!, list)).toBe(true)
    const form = log(live)
    expect(follows(form, list)).toBe(true)
    expect(form.dataset.logHierarchy).toBe('simple')
    expect(form.querySelectorAll('.clr-quantity')).toHaveLength(2)
    expectNoResetControls(live)
    expectNoResetControls(form)
    expect(timerWords(live, 'AMRAP time')).toMatch(/^Time complete\. /)
    expect(AMRAP_COUNTS.map((label) => shown(label, form))).toEqual(['blank', 'blank'])

    // The controls are live, over the gallery's memory only: the partial round
    // tapped to an explicit zero beside the blank rounds, then a round up.
    await tap(user, count('Reps into the next round', form).plus)
    await tap(user, count('Reps into the next round', form).minus)
    expect(AMRAP_COUNTS.map((label) => shown(label, form))).toEqual(['blank', '0'])
    expect(count('Reps into the next round', form).minus).toBeDisabled()
    await tap(user, count('Rounds completed', form).plus)
    expect(shown('Rounds completed', form)).toBe('1')
    expect(localStorage.getItem(WORKOUT_AMRAP_STORAGE_KEY)).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('TASK-AC-8FF68F3F5241 AMRAP save authority: a refused Save log keeps the draft through close and reopen and says it did not save, the words survive a reload until a save lands, the saved row then wins over the local echo, and a known row whose richer save failed reopens the block (TASK-AC-ABFEF4069683)', async () => {
    const user = userEvent.setup()
    const block = fixtureBlock({ structureType: 'amrap', timerSeconds: 480, exercises: ['not_started', 'not_started'] })
    let refusing = true
    const sent: BlockOutcome[] = []
    const saveTimedLog = vi.fn<NonNullable<BlockCompletionApi['saveTimedLog']>>(async (_id, outcome) => {
      if (refusing) return err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))
      sent.push(outcome)
      return ok(null)
    })
    const first = mountDirect(block, completionSeam({ saveTimedLog }))
    await user.click(screen.getByRole('button', { name: 'Start AMRAP' }))
    advance(200)
    await user.click(screen.getByRole('button', { name: 'Finish early' }))

    // A draft: two rounds, a partial round of zero, a face and a note.
    await tap(user, count('Rounds completed', directFlow()).plus, 2)
    await tap(user, count('Reps into the next round', directFlow()).plus)
    await tap(user, count('Reps into the next round', directFlow()).minus)
    await user.click(within(log(directFlow())).getByRole('radio', { name: 'Too hard' }))
    await user.type(within(log(directFlow())).getByRole('textbox', { name: 'Notes · optional' }), 'Grip went')

    // Closed and reopened, the draft is the draft (TASK-AC-ABFEF4069683).
    await closeTimedLogs()
    expect(shown('Rounds completed', directFlow())).toBe('2')
    expect(shown('Reps into the next round', directFlow())).toBe('0')
    expect(within(log(directFlow())).getByRole('radio', { name: 'Too hard' })).toHaveAttribute('aria-checked', 'true')
    expect(within(log(directFlow())).getByRole('textbox', { name: 'Notes · optional' })).toHaveValue('Grip went')

    // Refused: the log keeps every entry and says so, once.
    await user.click(within(log(directFlow())).getByRole('button', { name: 'Save log' }))
    expect(await within(log(directFlow())).findByRole('alert')).toHaveTextContent('Your log didn’t save. Try again.')
    expect(within(log(directFlow())).getAllByRole('alert')).toHaveLength(1)
    expect(shown('Rounds completed', directFlow())).toBe('2')
    expect(within(log(directFlow())).getByRole('radio', { name: 'Too hard' })).toHaveAttribute('aria-checked', 'true')
    expect(within(directFlow()).queryByText('Log saved')).toBeNull()
    expect(stored(block.blockId)).toMatchObject({ roundsCompleted: 2, partialRoundReps: 0, saveFailed: true })

    // A reload: the failure is still said, beside the counts the record kept.
    first.view.unmount()
    const second = mountDirect(block, completionSeam({ saveTimedLog }))
    expect(openLogDialogs()).toEqual([])
    expect(within(log(directFlow())).getByRole('alert')).toHaveTextContent('Your log didn’t save. Try again.')
    expect(shown('Rounds completed', directFlow())).toBe('2')
    expect(shown('Reps into the next round', directFlow())).toBe('0')
    // The shell's own forward-action failure is kept the same way.
    second.failed()
    expect(stored(block.blockId)).toMatchObject({ saveFailed: true })

    // The retry lands: the words go, from the record too, and the log is saved.
    refusing = false
    await user.click(within(log(directFlow())).getByRole('button', { name: 'Save log' }))
    await waitFor(() => expect(within(directFlow()).getByText('Log saved')).toBeInTheDocument())
    expect(sent).toEqual([{ elapsedSeconds: 200, roundsCompleted: 2, partialRoundReps: 0 }])
    expect(stored(block.blockId)).not.toHaveProperty('saveFailed')
    second.view.unmount()

    // The saved row is the authority: read back ahead of this device's echo.
    const row = { rounds_completed: 5, partial_round_reps: 3, elapsed_seconds: 200, effort: 'about_right', notes: null } as unknown as BlockResultRow
    mountDirect(block, completionSeam({ saveTimedLog, recorded: { row, movements: {} } }))
    const saved = directFlow().querySelector<HTMLElement>('[data-timed-saved]')!
    expect(saved).toHaveTextContent('03:20 active time · 5 rounds')
    expect(saved).toHaveTextContent('Effort: About right')
    cleanup()

    // The row landed but this attempt's own richer save did not: the known row
    // reopens the block, so the section's forward action restates it.
    localStorage.clear()
    refusing = true
    const third = mountDirect(block, completionSeam({ saveTimedLog }))
    await user.click(screen.getByRole('button', { name: 'Start AMRAP' }))
    advance(60)
    await user.click(screen.getByRole('button', { name: 'Finish early' }))
    await user.click(within(log(directFlow())).getByRole('radio', { name: 'About right' }))
    await user.click(within(log(directFlow())).getByRole('button', { name: 'Save log' }))
    expect(await within(log(directFlow())).findByRole('alert')).toHaveTextContent('Your log didn’t save. Try again.')
    third.recorded('known')
    expect(third.reopenBlock).toHaveBeenCalledWith(block.blockId)
    expect(stored(block.blockId)).toMatchObject({ saveFailed: true })
    // Nothing richer to restate: a known row is the block's result.
    third.view.unmount()
    const fourth = mountDirect(block, completionSeam({ saveTimedLog }))
    fourth.recorded('known')
    expect(fourth.reopenBlock).not.toHaveBeenCalled()
    expect(stored(block.blockId)).not.toHaveProperty('saveFailed')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TASK-010 — completion choices and the existing effort faces (C29, C30)
// ─────────────────────────────────────────────────────────────────────────────

const runningResults = () =>
  completionEffortSnapshot(completionEffortAcceptance(), {
    userId: FIXTURE_USER_ID,
    startedAt: new Date(ENTRY - 60_000).toISOString(),
  })

/** JOURNEY-010's entry: `/workout`, the session running for one minute, the For Time and the ladder ready. */
async function openResults(options: Omit<WorkoutDoubleOptions, 'session'> = {}) {
  const snapshot = runningResults()
  const double = createWorkoutDouble({ session: snapshot, ...options })
  const router = createMemoryRouter(routes, { initialEntries: ['/', '/workout'], initialIndex: 1 })
  const view = render(
    <AppProviders {...signedIn({ workout: double.clients })}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  await screen.findByRole('navigation', { name: 'Workout sections' })
  await screen.findByRole('list', { name: FOR_TIME_WORK })
  await screen.findByRole('list', { name: LADDER_WORK })
  return { double, view, snapshot, ...completionEffortBlocks(snapshot) }
}

/** A fresh visit at the entry clock, with nothing stored. */
function freshVisit() {
  cleanup()
  localStorage.clear()
  clock = ENTRY
}

const forTimeCard = (scope?: HTMLElement) => flowAround(FOR_TIME_WORK, scope)
const ladderCard = (scope?: HTMLElement) => flowAround(LADDER_WORK, scope)

/** The log's completion question: the one group the accepted legend names. */
function completionOf(scope: HTMLElement): HTMLElement {
  return within(scope).getByRole('group', { name: WORK_COMPLETED })
}

/** The log's effort question: the existing faces under the accepted section-log legend. */
function effortOf(scope: HTMLElement): HTMLElement {
  return within(scope).getByRole('group', { name: EFFORT_LEGEND })
}

/** The words of a question's checked answers — none, or one. */
function chosen(group: HTMLElement): string[] {
  return within(group).queryAllByRole('radio', { checked: true }).map((radio) => radio.textContent ?? '')
}

async function answer(user: ReturnType<typeof userEvent.setup>, group: HTMLElement, word: string) {
  await user.click(within(group).getByRole('radio', { name: word }))
}

function storedRace(blockId: string): ForTimeState | null {
  return readForTimeState(localStorage, blockId)
}

async function finishForTimeAfter(user: ReturnType<typeof userEvent.setup>, seconds: number, scope = forTimeCard()) {
  await user.click(within(scope).getByRole('button', { name: 'Start FOR TIME' }))
  advance(seconds)
  await user.click(within(forTimeCard()).getByRole('button', { name: 'Finish' }))
}

async function finishLadderAfter(user: ReturnType<typeof userEvent.setup>, seconds: number) {
  await user.click(within(ladderCard()).getByRole('button', { name: 'Start ladder' }))
  advance(seconds)
  await user.click(within(ladderCard()).getByRole('button', { name: 'Finish' }))
}

/** Every wording the completion row replaced (C29; R78, R87). */
const RETIRED_COMPLETION = ['All completed', 'Stopped short', 'Finished the ladder', 'Hit the time cap', 'Fell behind the schedule', 'How did this block end?']

function recordedOutcome(double: { recorded(): BlockCompletion[] }, blockId: string): BlockCompletion {
  const rows = double.recorded().filter((row) => row.blockId === blockId)
  expect(rows, `one row for ${blockId}`).toHaveLength(1)
  return rows[0]
}

/** The ladder's result tiles in its log (`LadderCompletion`, "Rounds completed"). */
function howFar(scope: HTMLElement): HTMLElement {
  return within(log(scope)).getByRole('group', { name: 'Rounds completed' })
}

function pressedRounds(scope: HTMLElement): HTMLElement[] {
  return within(howFar(scope)).getAllByRole('button').filter((tile) => tile.getAttribute('aria-pressed') === 'true')
}

describe('TASK-010 completion choices and existing effort faces', () => {
  it('AC-C29-01 Complete and Incomplete share one row in the For Time and ladder logs on the real /workout route: one Work completed question, two equal answers side by side under the accepted recipe, after the work', async () => {
    const user = userEvent.setup()
    await openResults()

    // For Time ready, running and paused: no log, nothing to judge yet.
    expect(queryLog(forTimeCard())).toBeNull()
    await user.click(within(forTimeCard()).getByRole('button', { name: 'Start FOR TIME' }))
    advance(30)
    expect(queryLog(forTimeCard())).toBeNull()
    await user.click(within(forTimeCard()).getByRole('button', { name: 'Pause' }))
    expect(queryLog(forTimeCard())).toBeNull()
    await user.click(within(forTimeCard()).getByRole('button', { name: 'Resume' }))
    advance(60)
    await user.click(within(forTimeCard()).getByRole('button', { name: 'Finish' }))
    // Owner decision 3 (2026-11-16): a ladder's log exists once its attempt has ended.
    expect(queryLog(ladderCard())).toBeNull()
    await finishLadderAfter(user, 100)

    for (const [format, scope, list] of [
      ['for_time', forTimeCard(), FOR_TIME_WORK],
      ['ladder', ladderCard(), LADDER_WORK],
    ] as const) {
      const form = log(scope)
      expect(scope.dataset.timedFormat).toBe(format)
      expect(form.dataset.logHierarchy).toBe('simple')
      expect(follows(form, within(scope).getByRole('list', { name: list }))).toBe(true)
      // TASK-046: the log's place on the card, its "Log results" action, after the work.
      expect(follows(timedLogOpener(scope)!, within(scope).getByRole('list', { name: list }))).toBe(true)
      // One title and no group titles; the question and the effort in two
      // untitled groups. TASK-015 (C37) adds the accepted per-movement groups
      // between them, each titled by its movement's name (the loaded wall
      // ball's load field for the For Time; none for the bodyweight ladder
      // with no rung stated); they are not result groups and carry no Result /
      // Movements / Feedback title.
      // TASK-046: the one title is the focused dialog's.
      expect(within(form.closest('dialog')!).getAllByRole('heading').filter((heading) => !heading.classList.contains('clr-timed-log__group-title')).map((heading) => heading.textContent)).toEqual(['Log results'])
      const groups = [...form.querySelectorAll<HTMLElement>('.clr-timed-log__group')].filter(
        (group) => group.querySelector(':scope > .clr-timed-log__group-title') === null,
      )
      expect(groups).toHaveLength(2)
      const question = completionOf(form)
      expect(groups[0]).toContainElement(question)
      expect(groups[1]).toContainElement(effortOf(form))

      // One question, one row: exactly two answers, Complete then Incomplete,
      // each a direct chip of the one radiogroup, no other control beside them.
      expect(question).toHaveClass('clr-timed-completion')
      expect(question.tagName).toBe('FIELDSET')
      const rows = question.querySelectorAll<HTMLElement>('[role="radiogroup"]')
      expect(rows).toHaveLength(1)
      const answers = within(rows[0]).getAllByRole('radio')
      expect(answers.map((radio) => radio.textContent)).toEqual([...COMPLETION_ANSWERS])
      for (const radio of answers) {
        expect(radio.parentElement).toHaveClass('clr-bleed')
        expect(radio.parentElement!.parentElement).toBe(rows[0])
      }
      expect(rows[0].children).toHaveLength(2)
      for (const retired of RETIRED_COMPLETION) expect(within(scope).queryByText(retired)).toBeNull()
      for (const retired of RETIRED_COMPLETION) expect(within(form).queryByText(retired)).toBeNull()
    }

    // The accepted recipe: the row never wraps, the two answers share it
    // evenly, each centred in its chip.
    expect(rule('.clr-timed-completion [role=radiogroup]')).toMatch(/flex-wrap:\s*nowrap !important/)
    expect(rule('.clr-timed-completion [role=radiogroup] > .clr-bleed')).toMatch(/flex:\s*1 1 0/)
    expect(rule('.clr-timed-completion [role=radiogroup] > .clr-bleed')).toMatch(/min-width:\s*0/)
    expect(rule('.clr-timed-completion [role=radio]')).toMatch(/width:\s*100%/)
    expect(rule('.clr-timed-completion [role=radio]')).toMatch(/justify-content:\s*center/)
  })

  it('AC-R010-01 For Time completion starts where the race ended — Finish under the cap at Complete, the cap at Incomplete — stopping mid-race or with no cap claims nothing, and the athlete corrects either way', async () => {
    const user = userEvent.setup()
    const first = await openResults()

    // Finish under the cap: the athlete's own report that the work is done.
    await finishForTimeAfter(user, 90)
    const finished = completionOf(log(forTimeCard()))
    expect(chosen(finished)).toEqual(['Complete'])
    // A starting point, not an answer: nothing is stored until they answer.
    expect(storedRace(first.forTime.blockId)).not.toHaveProperty('workCompleted')
    // Finish proves nothing: one tap corrects it, and back again.
    await answer(user, finished, 'Incomplete')
    expect(chosen(completionOf(log(forTimeCard())))).toEqual(['Incomplete'])
    expect(storedRace(first.forTime.blockId)).toMatchObject({ workCompleted: false })
    await answer(user, completionOf(log(forTimeCard())), 'Complete')
    expect(storedRace(first.forTime.blockId)).toMatchObject({ workCompleted: true })
    await answer(user, completionOf(log(forTimeCard())), 'Incomplete')
    await closeTimedLogs()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await screen.findByRole('heading', { name: RESULTS_COOLDOWN_TITLE })
    expect(recordedOutcome(first.double, first.forTime.blockId).outcome).toEqual({ elapsedSeconds: 90, completedUnderCap: false })

    // The cap: the clock cannot know the work was done, so Incomplete — and
    // Complete stays one tap away for someone who could not stop it in time.
    freshVisit()
    const second = await openResults()
    await user.click(within(forTimeCard()).getByRole('button', { name: 'Start FOR TIME' }))
    advance(FOR_TIME_CAP_SECONDS + 5)
    await waitFor(() => expect(timerWords(forTimeCard(), 'FOR TIME time')).toMatch(/^Cap reached\. /))
    expect(chosen(completionOf(log(forTimeCard())))).toEqual(['Incomplete'])
    await answer(user, completionOf(log(forTimeCard())), 'Complete')
    expect(storedRace(second.forTime.blockId)).toMatchObject({ workCompleted: true })
    await closeTimedLogs()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await screen.findByRole('heading', { name: RESULTS_COOLDOWN_TITLE })
    expect(recordedOutcome(second.double, second.forTime.blockId).outcome).toEqual({ elapsedSeconds: FOR_TIME_CAP_SECONDS, completedUnderCap: true })

    // Stopping to record mid-race claims no completion — only the seconds.
    freshVisit()
    const third = await openResults()
    await user.click(within(forTimeCard()).getByRole('button', { name: 'Start FOR TIME' }))
    advance(200)
    expect(queryLog(forTimeCard())).toBeNull()
    await closeTimedLogs()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await screen.findByRole('heading', { name: RESULTS_COOLDOWN_TITLE })
    expect(recordedOutcome(third.double, third.forTime.blockId).outcome).toEqual({ elapsedSeconds: 200 })
    expect(blockResultInsert(recordedOutcome(third.double, third.forTime.blockId))).toMatchObject({ elapsed_seconds: 200, completed_under_cap: null })

    // No cap, no claim: the question is not asked; the effort still is.
    freshVisit()
    const uncapped = mountDirect(fixtureBlock({ structureType: 'for_time', timerSeconds: null, exercises: ['not_started'] }))
    await user.click(screen.getByRole('button', { name: /^Start / }))
    advance(120)
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    const open = log(directFlow())
    expect(within(open).queryByRole('group', { name: WORK_COMPLETED })).toBeNull()
    expect(chosen(effortOf(open))).toEqual([])
    expect(uncapped.last()).toEqual({ elapsedSeconds: 120 })
  })

  it('AC-R010-01 ladder completion follows the work it tracked: nothing is chosen before the attempt ends; Finish, the cap and a schedule run out, with nothing tracked, start at Incomplete with no rung — never every rung — and only the athlete’s Complete records the top rung', async () => {
    const user = userEvent.setup()
    const first = await openResults()

    // Before the attempt ends: nothing is chosen — owner decision 3
    // (2026-11-16): Round 7 offers the ladder's log once the attempt has ended.
    expect(queryLog(ladderCard())).toBeNull()
    // TASK-012 (C35, R95): the pattern is the compact prescription's rounds;
    // no read-only rung row repeats it before the attempt is answered.
    expect(within(ladderCard()).getByRole('list', { name: LADDER_WORK })).toBeInTheDocument()
    expect(within(ladderCard()).queryByRole('list', { name: 'Ladder' })).toBeNull()

    // Finish with nothing tracked rung by rung: Incomplete, and how far is asked.
    // TASK-013 (C33, C34): how far is the log's "Rounds completed" — rep-first
    // tiles, the pressed prefix and its count — in place of the rung radios.
    await finishLadderAfter(user, 200)
    expect(chosen(completionOf(log(ladderCard())))).toEqual(['Incomplete'])
    expect(pressedRounds(ladderCard())).toEqual([])
    expect(within(howFar(ladderCard())).getByRole('status')).toHaveTextContent('No rounds marked yet')
    await user.click(within(howFar(ladderCard())).getByRole('button', { name: 'Round 3: 6 reps' }))
    expect(within(howFar(ladderCard())).getByRole('status')).toHaveTextContent(`3 of ${LADDER_ROUNDS} rounds completed`)

    // Complete is the athlete's to say, and only then is every rung reached.
    await answer(user, completionOf(log(ladderCard())), 'Complete')
    expect(pressedRounds(ladderCard())).toHaveLength(LADDER_ROUNDS)
    expect(within(howFar(ladderCard())).getByRole('status')).toHaveTextContent(`${LADDER_ROUNDS} of ${LADDER_ROUNDS} rounds completed`)
    // Back to Incomplete: the rung starts over rather than keeping a guess.
    await answer(user, completionOf(log(ladderCard())), 'Incomplete')
    expect(pressedRounds(ladderCard())).toEqual([])
    await closeTimedLogs()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await screen.findByRole('heading', { name: RESULTS_COOLDOWN_TITLE })
    expect(recordedOutcome(first.double, first.ladder.blockId).outcome).toEqual({})

    // The cap with nothing tracked: Incomplete, no rung.
    freshVisit()
    const second = await openResults()
    await user.click(within(ladderCard()).getByRole('button', { name: 'Start ladder' }))
    advance(LADDER_CAP + 5)
    await waitFor(() => expect(chosen(completionOf(log(ladderCard())))).toEqual(['Incomplete']))
    await closeTimedLogs()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await screen.findByRole('heading', { name: RESULTS_COOLDOWN_TITLE })
    expect(recordedOutcome(second.double, second.ladder.blockId).outcome).toEqual({})

    // A schedule run out is not work performed: Incomplete, no rung.
    freshVisit()
    const schedule = mountDirect(
      fixtureBlock(
        { structureType: 'emom', timerType: 'per_minute', repScheme: 'ladder_up', timerSeconds: 180, exercises: [rungs('thruster', [3, 5, 7])] },
        { mode: 'scheduled_starts', rounds: 3, interval_seconds: 60, cap_seconds: null },
      ),
    )
    expect(queryLog(directFlow())).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Start schedule' }))
    advance(185)
    expect(screen.getByText('COMPLETE')).toBeInTheDocument()
    expect(chosen(completionOf(log(directFlow())))).toEqual(['Incomplete'])
    expect(schedule.last()).toEqual({})

    // An answer the athlete gives is theirs and stays so — owner decision 3
    // (2026-11-16): given once the attempt has ended, the only moment Round 7
    // offers the log; closing and reopening the log keeps it.
    freshVisit()
    const legacy = mountDirect(
      fixtureBlock({ structureType: 'for_time', repScheme: 'ladder_down', timerSeconds: 480, timerType: 'countdown', exercises: [rungs('kettlebell-swing', [15, 12, 9, 6, 3])] }),
    )
    await user.click(screen.getByRole('button', { name: 'Start ladder' }))
    advance(100)
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    expect(chosen(completionOf(log(directFlow())))).toEqual(['Incomplete'])
    await answer(user, completionOf(log(directFlow())), 'Complete')
    expect(legacy.last()).toEqual({ highestRung: 5 })
    await closeTimedLogs()
    expect(chosen(completionOf(log(directFlow())))).toEqual(['Complete'])
    expect(legacy.last()).toEqual({ highestRung: 5 })
  })

  it('AC-R010-01 completion end to end: the stored answer, a reload, the saved block results, a return to the saved section and History keep Complete and Incomplete apart', async () => {
    const user = userEvent.setup()
    const first = await openResults()
    await finishForTimeAfter(user, 90)
    await answer(user, completionOf(log(forTimeCard())), 'Incomplete')
    await finishLadderAfter(user, 100)
    await answer(user, completionOf(log(ladderCard())), 'Complete')
    expect(storedRace(first.forTime.blockId)).toMatchObject({ workCompleted: false })

    // The reload: the tree goes, the storage stays. The For Time keeps the
    // athlete's Incomplete — never the clock's Complete. TASK-013 (C36; its
    // adoption of TASK-032's durable attempt) supersedes the ladder's: its
    // answer is no longer the renderer's memory, so the athlete's Complete
    // comes back as given rather than starting again at Incomplete.
    first.view.unmount()
    const second = await openResults()
    expect(within(forTimeCard()).getByRole('timer', { name: 'FOR TIME time' })).toHaveTextContent('01:30')
    expect(chosen(completionOf(log(forTimeCard())))).toEqual(['Incomplete'])
    expect(chosen(completionOf(log(ladderCard())))).toEqual(['Complete'])

    // The save: one forward action writes both rows.
    await closeTimedLogs()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await screen.findByRole('heading', { name: RESULTS_COOLDOWN_TITLE })
    const forTimeRow = recordedOutcome(second.double, second.forTime.blockId)
    const ladderRow = recordedOutcome(second.double, second.ladder.blockId)
    expect(forTimeRow).toEqual({ blockId: second.forTime.blockId, outcome: { elapsedSeconds: 90, completedUnderCap: false }, perceivedEffort: null })
    expect(ladderRow).toEqual({ blockId: second.ladder.blockId, outcome: { highestRung: LADDER_ROUNDS }, perceivedEffort: null })
    expect(blockResultInsert(forTimeRow)).toMatchObject({ elapsed_seconds: 90, completed_under_cap: false, highest_rung: null, perceived_effort: null })
    expect(blockResultInsert(ladderRow)).toMatchObject({ elapsed_seconds: null, completed_under_cap: null, highest_rung: LADDER_ROUNDS, perceived_effort: null })

    // Back to the saved section. TASK-048 (AC-R032-02): the saved row is the
    // authority each block reads back. Round 7 draws a saved log as "Log
    // saved", not as a choice — the build's disabled form is Round 7's read-back
    // — and its correction ("Edit log", A3 TASK-103) opens the log over the
    // saved row: the For Time's Incomplete and the ladder's Complete, apart.
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    // Round 7 heads each block's card with its section's name as well.
    expect((await screen.findAllByRole('heading', { name: RESULTS_SECTION_TITLE })).length).toBeGreaterThan(0)
    await screen.findByRole('list', { name: FOR_TIME_WORK })
    // The ladder's read-back states the rung its row holds: the top one.
    expect(ladderCard().querySelector('[data-timed-saved]')).toHaveTextContent(`· ${LADDER_ROUNDS} rungs`)
    for (const [scope, shownAnswer] of [[forTimeCard(), ['Incomplete']], [ladderCard(), ['Complete']]] as const) {
      const saved = scope.querySelector<HTMLElement>('[data-timed-saved]')!
      expect(within(saved).getByRole('status')).toHaveTextContent('Log saved')
      expect(timedLogOpener(scope)).toBeNull()
      await user.click(within(saved).getByRole('button', { name: 'Edit log' }))
      expect(chosen(completionOf(log(scope)))).toEqual(shownAnswer)
      await closeTimedLogs()
    }
    expect(second.double.recorded()).toHaveLength(2)

    // History reads the saved rows back: the For Time stopped before its cap
    // as Incomplete — not "Stopped at the cap" — and the ladder's top rung.
    second.view.unmount()
    await openHistory(second.snapshot.session.id, second.double.clients)
    await screen.findByText('Cap')
    expect(historyReading('Cap')).toBe('CapIncomplete')
    expect(historyReading('Elapsed')).toBe('Elapsed01:30')
    expect(historyReading('Highest rung')).toBe(`Highest rung${LADDER_ROUNDS}`)
    expect(screen.queryByText('Effort', { exact: true })).toBeNull()
    expect(screen.queryByText('Stopped at the cap')).toBeNull()
    expect(screen.queryByText('Finished under the cap')).toBeNull()
  })

  it('AC-C30-01 effort is optional and unanswered stays null: the existing three faces with no default, Clear back to null, and never a numeric block effort or a session mood', async () => {
    const user = userEvent.setup()
    const { double, forTime, ladder } = await openResults()
    await finishForTimeAfter(user, 75)
    await user.click(within(ladderCard()).getByRole('button', { name: 'Start ladder' }))
    advance(LADDER_CAP + 5)

    for (const scope of [forTimeCard(), ladderCard()]) {
      const effort = effortOf(log(scope))
      // Optional: three faces, none chosen — not the middle, not a guess — and
      // no Clear until something is chosen. Ending the attempt chose nothing.
      expect(within(effort).getAllByRole('radio').map((radio) => radio.textContent)).toEqual([...EFFORT_WORDS])
      expect(chosen(effort)).toEqual([])
      expect(within(log(scope)).queryByRole('button', { name: /^Clear effort/ })).toBeNull()
      // Three categories, not the session's five-choice feeling.
      expect(within(effort).getAllByRole('radio')).toHaveLength(SET_EFFORT_CHOICES.length)
      expect(within(effort).getAllByRole('radio')).not.toHaveLength(MOOD_SCALE.length)
      expect(within(log(scope)).queryByRole('group', { name: 'How do you feel?' })).toBeNull()
      // No number anywhere in the effort: no slider, no spin button, no digit
      // in the question. (TASK-015's per-movement amount and load fields are
      // number fields of their own groups, never of the effort's.)
      expect(within(log(scope)).queryByRole('slider')).toBeNull()
      expect(within(effort).queryByRole('spinbutton')).toBeNull()
      for (const spin of within(log(scope)).queryAllByRole('spinbutton')) expect(effort).not.toContainElement(spin)
      expect(effort.textContent).not.toMatch(/\d/)
    }

    // Answered, then cleared back to unanswered — and focus stays in the
    // question. The Clear is named for its scope: Round 7's accepted
    // `this section` (the build said `this block`).
    await answer(user, effortOf(log(forTimeCard())), 'Too hard')
    expect(chosen(effortOf(log(forTimeCard())))).toEqual(['Too hard'])
    await user.click(within(log(forTimeCard())).getByRole('button', { name: 'Clear effort for this section' }))
    expect(chosen(effortOf(log(forTimeCard())))).toEqual([])
    expect(within(effortOf(log(forTimeCard()))).getAllByRole('radio')[0]).toHaveFocus()
    // Each block's effort is its own.
    await answer(user, effortOf(log(forTimeCard())), 'About right')
    await answer(user, effortOf(log(ladderCard())), 'Too easy')
    expect(chosen(effortOf(log(forTimeCard())))).toEqual(['About right'])
    expect(chosen(effortOf(log(ladderCard())))).toEqual(['Too easy'])

    // Saved: a category is never converted into the numeric 1–10 block effort,
    // and nothing is written as the session's mood. TASK-015 (AC-R015-02;
    // MIG-A applied by the owner's LIVE-PRE-1): the chosen face now travels as
    // the block's categorical `effort` — the category word itself, beside a
    // numeric effort that stays unasked and null.
    expect(storedRace(forTime.blockId)).not.toHaveProperty('effort')
    await closeTimedLogs()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await screen.findByRole('heading', { name: RESULTS_COOLDOWN_TITLE })
    for (const [blockId, category] of [[forTime.blockId, 'about_right'], [ladder.blockId, 'too_easy']] as const) {
      const row = recordedOutcome(double, blockId)
      expect(row.perceivedEffort).toBeNull()
      expect(row.outcome.effort).toBe(category)
      expect(blockResultInsert(row)).toMatchObject({ perceived_effort: null, effort: category })
    }
    expect(double.completed()).toEqual([])
    // TASK-048 (AC-R032-01, superseding "no category in storage"): the
    // ladder's effort is part of its durable draft, kept as the category word
    // in its attempt's draft and nowhere else — never a number, never the
    // session's mood. The For Time's stays its log's memory.
    const ladders = JSON.parse(localStorage.getItem(WORKOUT_LADDER_STORAGE_KEY) ?? '{}') as Record<string, { draft: { effort: unknown } | null }>
    expect(ladders[ladder.blockId]?.draft?.effort).toBe('too_easy')
    const elsewhere = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)!)
      .filter((key) => key !== WORKOUT_LADDER_STORAGE_KEY)
      .map((key) => localStorage.getItem(key))
    expect(JSON.stringify(elsewhere)).not.toMatch(/too_hard|about_right|too_easy/)
    expect(localStorage.getItem(WORKOUT_LADDER_STORAGE_KEY)).not.toMatch(/too_hard|about_right|"effort":\d/)
  })

  it('AC-R010-02 effort reuses Frown, Meh and Smile with their established words, order, categories, selected tick, focus and keyboard behaviour: no new icon, scale or wording', async () => {
    const user = userEvent.setup()
    await openResults()
    await finishForTimeAfter(user, 75)
    const form = log(forTimeCard())
    const effort = effortOf(form)

    // The same owner the set sheet uses, not a look-alike.
    expect(effort.closest('.clr-set-effort')).not.toBeNull()
    expect(effort).toHaveClass('clr-set-effort__choices')

    // Frown, Meh, Smile left to right; each chip draws its own face beside the
    // chip's tick and no other; the word is the hidden accessible name.
    const markup = (Glyph: typeof Frown) => {
      const { container, unmount } = render(<Glyph size={20} />)
      const inner = container.querySelector('svg')!.innerHTML
      unmount()
      return inner
    }
    const faces = [Frown, Meh, Smile].map(markup)
    const radios = within(effort).getAllByRole('radio')
    expect(radios).toHaveLength(3)
    radios.forEach((radio, index) => {
      const drawn = [...radio.querySelectorAll('svg')].map((svg) => svg.innerHTML).filter((inner) => faces.includes(inner))
      expect(drawn).toEqual([faces[index]])
      expect(within(radio).getByText(EFFORT_WORDS[index])).toHaveClass('a11y-hidden')
      for (const svg of radio.querySelectorAll('svg')) expect(svg).toHaveAttribute('aria-hidden', 'true')
    })
    expect(SET_EFFORT_CHOICES.map(({ value, label, Glyph }) => [value, label, Glyph])).toEqual([
      ['too_hard', 'Too hard', Frown], ['about_right', 'About right', Meh], ['too_easy', 'Too easy', Smile],
    ])

    // Selected: checked, with the chip's tick as well as its selected role.
    await answer(user, effort, 'About right')
    const [hard, right, easy] = within(effortOf(log(forTimeCard()))).getAllByRole('radio')
    expect(right).toHaveAttribute('aria-checked', 'true')
    expect((right.querySelector('svg') as SVGElement).style.opacity).toBe('1')
    expect(right.parentElement!.style.getPropertyValue('--bleed')).toBe('var(--border-selected)')
    for (const other of [hard, easy]) {
      expect(other).toHaveAttribute('aria-checked', 'false')
      expect((other.querySelector('svg') as SVGElement).style.opacity).toBe('0')
      expect(other.parentElement!.style.getPropertyValue('--bleed')).toBe('var(--border-unselected)')
    }
    // An optional answer is never locked: no face is disabled.
    for (const radio of [hard, right, easy]) expect(radio).toBeEnabled()

    // Focus: one tab stop on the chosen face; arrows move and choose; Home/End jump.
    expect([hard, right, easy].map((radio) => radio.tabIndex)).toEqual([-1, 0, -1])
    right.focus()
    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(within(effortOf(log(forTimeCard()))).getByRole('radio', { name: 'Too easy' })).toHaveFocus())
    expect(chosen(effortOf(log(forTimeCard())))).toEqual(['Too easy'])
    await user.keyboard('{Home}')
    await waitFor(() => expect(within(effortOf(log(forTimeCard()))).getByRole('radio', { name: 'Too hard' })).toHaveFocus())
    expect(chosen(effortOf(log(forTimeCard())))).toEqual(['Too hard'])
    await user.keyboard('{End}')
    await waitFor(() => expect(chosen(effortOf(log(forTimeCard())))).toEqual(['Too easy']))

    // The completion row is the same chip pattern: one stop, arrows choose.
    const complete = within(completionOf(log(forTimeCard()))).getByRole('radio', { name: 'Complete' })
    expect(complete.tabIndex).toBe(0)
    complete.focus()
    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(chosen(completionOf(log(forTimeCard())))).toEqual(['Incomplete']))
    await waitFor(() => expect(within(completionOf(log(forTimeCard()))).getByRole('radio', { name: 'Incomplete' })).toHaveFocus())

    // The set sheet keeps its own legend and Clear name; only the block's log
    // names its scope (the accepted owner's one adaptation: Round 7's
    // `this section`).
    expect(within(form).getByText(EFFORT_LEGEND)).toBeInTheDocument()
    expect(within(log(forTimeCard())).getByRole('button', { name: 'Clear effort for this section' })).toHaveClass('clr-btn--quiet')
  })

  it('AC-R010-01 a failed save keeps the completion answer and the effort on screen, and the retry writes the same completion once with no effort', async () => {
    const user = userEvent.setup()
    const rows: BlockCompletion[] = []
    let refusing = true
    const record = vi.fn(async (completion: BlockCompletion) => {
      if (refusing) return err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))
      rows.push(completion)
      return ok({} as BlockResultRow)
    })
    const { forTime, ladder } = await openResults({ blockResults: { record } })
    await finishForTimeAfter(user, 150)
    await answer(user, completionOf(log(forTimeCard())), 'Incomplete')
    await answer(user, effortOf(log(forTimeCard())), 'Too hard')
    await finishLadderAfter(user, 120)
    await answer(user, completionOf(log(ladderCard())), 'Complete')

    await closeTimedLogs()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    const failed = await screen.findByRole('dialog', { name: /didn’t save/ })
    expect(failed).toHaveTextContent('That didn’t save')
    expect(rows).toEqual([])
    // Nothing discarded and nothing filled in while the save failed.
    expect(chosen(completionOf(log(forTimeCard())))).toEqual(['Incomplete'])
    expect(chosen(effortOf(log(forTimeCard())))).toEqual(['Too hard'])
    expect(chosen(completionOf(log(ladderCard())))).toEqual(['Complete'])
    expect(storedRace(forTime.blockId)).toMatchObject({ workCompleted: false })
    await closeTimedLogs()

    refusing = false
    await user.click(within(failed).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: RESULTS_COOLDOWN_TITLE })).toBeInTheDocument()
    // TASK-015 (AC-R015-02; MIG-A applied by the owner's LIVE-PRE-1): the
    // chosen face now travels with the completion as the block's categorical
    // `effort` — the same completion both times, written once — while the
    // numeric effort stays unasked and null: no category ever becomes a number.
    expect(rows).toEqual([
      { blockId: forTime.blockId, outcome: { elapsedSeconds: 150, completedUnderCap: false, effort: 'too_hard' }, perceivedEffort: null },
      { blockId: ladder.blockId, outcome: { highestRung: LADDER_ROUNDS }, perceivedEffort: null },
    ])
    expect(rows.map((row) => blockResultInsert(row).perceived_effort)).toEqual([null, null])
  })

  it('AC-R010-01 For Time records written before the completion question load and read as before: a finish reads Complete and a cap Incomplete, the same completed_under_cap they always saved, and nothing is rewritten', async () => {
    const block = completionEffortBlocks(runningResults()).forTime
    const shape = forTimeShape(block)
    const at = (seconds: number) => new Date(ENTRY + seconds * 1000).toISOString()
    const records: { stored: ForTimeState; shown: string[]; saved: BlockOutcome }[] = [
      // Finished under the cap, before Pause existed (the shape EXE-04b wrote).
      { stored: { startedAt: at(-400), finishedAt: at(-17) }, shown: ['Complete'], saved: { elapsedSeconds: 383, completedUnderCap: true } },
      // Run into the cap while away: no stamp of its own.
      { stored: { startedAt: at(-1000), finishedAt: null }, shown: ['Incomplete'], saved: { elapsedSeconds: FOR_TIME_CAP_SECONDS, completedUnderCap: false } },
      // A finish stamped past the cap is the cap it reached.
      { stored: { startedAt: at(-1000), finishedAt: at(-40) }, shown: ['Incomplete'], saved: { elapsedSeconds: FOR_TIME_CAP_SECONDS, completedUnderCap: false } },
    ]

    for (const { stored: record, shown: expected, saved } of records) {
      freshVisit()
      localStorage.setItem(WORKOUT_FOR_TIME_STORAGE_KEY, JSON.stringify({ [block.blockId]: record }))
      const { double } = await openResults()
      expect(chosen(completionOf(log(forTimeCard())))).toEqual(expected)
      // The unchanged clock reads it exactly as it did; the answer is its starting point.
      const view = forTimeView(clampForTimeState(record), shape, Math.floor((ENTRY - Date.parse(record.startedAt!)) / 1000))
      expect(forTimeOutcome(view)).toEqual(saved)
      await closeTimedLogs()
      await act(async () => {
        await userEvent.setup().click(screen.getByRole('button', { name: 'Next section' }))
      })
      await screen.findByRole('heading', { name: RESULTS_COOLDOWN_TITLE })
      expect(recordedOutcome(double, block.blockId).outcome).toEqual(saved)
      expect(JSON.parse(localStorage.getItem(WORKOUT_FOR_TIME_STORAGE_KEY) ?? '{}')[block.blockId]).toEqual(record)
    }
  })

  it('JOURNEY-010 the accepted for_time and ladder gallery states draw the route’s own logs: completion at the route’s starting point, the existing effort faces unanswered, live over memory only', async () => {
    const user = userEvent.setup()
    const fetch = vi.spyOn(globalThis, 'fetch')
    const states = [
      { id: 'for_time', title: 'For Time results', list: FOR_TIME_WORK, finish: 'Finish', start: 'Start FOR TIME' },
      { id: 'ladder', title: 'Ladder results', list: LADDER_WORK, finish: 'Finish', start: 'Start ladder' },
    ] as const

    for (const state of states) {
      // The accepted state's own drive: the route's flow over the gallery's
      // block, run past its cap — the clock's ending, so Incomplete.
      cleanup()
      render(
        <MemoryRouter initialEntries={[`/gallery/refinements?state=${state.id}&open=1`]}>
          <GalleryRefinements />
        </MemoryRouter>,
      )
      const root = document.querySelector<HTMLElement>(`[data-refinement-state="${state.id}"]`)!
      expect(root).not.toBeNull()
      expect(screen.getByRole('link', { name: state.title })).toHaveAttribute('aria-current', 'page')
      await waitFor(() => expect(openLogDialogs(root)).toHaveLength(1), { timeout: 3000 })
      const capped = flowAround(state.list, root)
      // TASK-046: the log's place on the card, its "Log results" action, after the work.
      expect(follows(timedLogOpener(capped)!, within(capped).getByRole('list', { name: state.list }))).toBe(true)
      const form = log(capped)
      expect(follows(form, within(capped).getByRole('list', { name: state.list }))).toBe(true)
      expect(timerWords(capped, `${state.id === 'ladder' ? 'Ladder' : 'FOR TIME'} time`)).toMatch(/^Cap reached\. /)
      expect(chosen(completionOf(form))).toEqual(['Incomplete'])
      expect(chosen(effortOf(form))).toEqual([])
      if (state.id === 'ladder') {
        // Nothing tracked: how far is asked, and no rung is claimed.
        // TASK-013 (C33, C34): as the log's rep-first "Rounds completed".
        const rounds = within(form).getByRole('group', { name: 'Rounds completed' })
        expect(within(rounds).getByRole('status')).toHaveTextContent('No rounds marked yet')
        expect(within(rounds).getAllByRole('button').filter((tile) => tile.getAttribute('aria-pressed') === 'true')).toEqual([])
        // Live over memory: the athlete's Complete reaches every round.
        await answer(user, completionOf(log(capped)), 'Complete')
        expect(within(within(log(capped)).getByRole('group', { name: 'Rounds completed' })).getByRole('status'))
          .toHaveTextContent('4 of 4 rounds completed')
      } else {
        // Live over memory: corrected and answered.
        await answer(user, completionOf(log(capped)), 'Complete')
        expect(chosen(completionOf(log(capped)))).toEqual(['Complete'])
        await answer(user, effortOf(log(capped)), 'About right')
        expect(chosen(effortOf(log(capped)))).toEqual(['About right'])
      }

      // The same state, finished under its cap by the athlete's own Finish (the
      // controls the gallery draws before its drive): For Time starts at
      // Complete; the ladder, with nothing tracked, at Incomplete.
      cleanup()
      render(
        <MemoryRouter initialEntries={[`/gallery/refinements?state=${state.id}`]}>
          <GalleryRefinements />
        </MemoryRouter>,
      )
      const finishRoot = document.querySelector<HTMLElement>(`[data-refinement-state="${state.id}"]`)!
      const finished = flowAround(state.list, finishRoot)
      await user.click(within(finished).getByRole('button', { name: state.start }))
      await user.click(within(flowAround(state.list, finishRoot)).getByRole('button', { name: state.finish }))
      expect(chosen(completionOf(log(flowAround(state.list, finishRoot))))).toEqual([state.id === 'for_time' ? 'Complete' : 'Incomplete'])
      expect(chosen(effortOf(log(flowAround(state.list, finishRoot))))).toEqual([])
    }
    expect(localStorage.getItem(WORKOUT_FOR_TIME_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem('clear.workout-ladders')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('TASK-AC-8FF68F3F5241 For Time save authority: Work completed is asked only with a cap (TASK-AC-85F76FF493AB), the answer and a refused save survive close, reopen and a reload until a save lands, the saved row wins over the local echo, and a known row whose richer save failed reopens the block (TASK-AC-ABFEF4069683)', async () => {
    const user = userEvent.setup()
    const block = fixtureBlock({ structureType: 'for_time', timerSeconds: 600, exercises: ['not_started'] })
    let refusing = true
    const sent: BlockOutcome[] = []
    const saveTimedLog = vi.fn<NonNullable<BlockCompletionApi['saveTimedLog']>>(async (_id, outcome) => {
      if (refusing) return err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))
      sent.push(outcome)
      return ok(null)
    })
    const first = mountDirect(block, completionSeam({ saveTimedLog }))
    await user.click(screen.getByRole('button', { name: /^Start / }))
    advance(240)
    await user.click(screen.getByRole('button', { name: 'Finish' }))

    // A capped race asks; Finish starts it at Complete, and the athlete corrects it.
    expect(chosen(completionOf(log(directFlow())))).toEqual(['Complete'])
    await answer(user, completionOf(log(directFlow())), 'Incomplete')
    await answer(user, effortOf(log(directFlow())), 'Too easy')
    await closeTimedLogs()
    expect(chosen(completionOf(log(directFlow())))).toEqual(['Incomplete'])
    expect(chosen(effortOf(log(directFlow())))).toEqual(['Too easy'])

    // Refused: kept, and said once.
    await user.click(within(log(directFlow())).getByRole('button', { name: 'Save log' }))
    expect(await within(log(directFlow())).findByRole('alert')).toHaveTextContent('Your log didn’t save. Try again.')
    expect(storedRace(block.blockId)).toMatchObject({ workCompleted: false, saveFailed: true })

    // A reload keeps the answer and the words; the face was the log's memory.
    first.view.unmount()
    mountDirect(block, completionSeam({ saveTimedLog }))
    expect(within(log(directFlow())).getByRole('alert')).toHaveTextContent('Your log didn’t save. Try again.')
    expect(chosen(completionOf(log(directFlow())))).toEqual(['Incomplete'])
    refusing = false
    await user.click(within(log(directFlow())).getByRole('button', { name: 'Save log' }))
    await waitFor(() => expect(within(directFlow()).getByText('Log saved')).toBeInTheDocument())
    expect(sent).toEqual([{ elapsedSeconds: 240, completedUnderCap: false }])
    expect(storedRace(block.blockId)).not.toHaveProperty('saveFailed')
    cleanup()

    // The saved row wins over this device's echo: corrected elsewhere to Complete.
    const row = { elapsed_seconds: 240, completed_under_cap: true, effort: null, notes: null } as unknown as BlockResultRow
    mountDirect(block, completionSeam({ saveTimedLog, recorded: { row, movements: {} } }))
    const saved = directFlow().querySelector<HTMLElement>('[data-timed-saved]')!
    await user.click(within(saved).getByRole('button', { name: 'Edit log' }))
    expect(chosen(completionOf(log(directFlow())))).toEqual(['Complete'])
    cleanup()

    // A known row while this attempt's own richer save (its face) had failed: reopened.
    localStorage.clear()
    refusing = true
    const again = mountDirect(block, completionSeam({ saveTimedLog }))
    await user.click(screen.getByRole('button', { name: /^Start / }))
    advance(100)
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await answer(user, effortOf(log(directFlow())), 'Too hard')
    await user.click(within(log(directFlow())).getByRole('button', { name: 'Save log' }))
    expect(await within(log(directFlow())).findByRole('alert')).toHaveTextContent('Your log didn’t save. Try again.')
    again.recorded('known')
    expect(again.reopenBlock).toHaveBeenCalledWith(block.blockId)
    cleanup()

    // No cap, no question: nothing is claimed, and nothing asks.
    localStorage.clear()
    const uncapped = mountDirect(fixtureBlock({ structureType: 'for_time', timerSeconds: null, exercises: ['not_started'] }))
    await user.click(screen.getByRole('button', { name: /^Start / }))
    advance(90)
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    expect(within(log(directFlow())).queryByRole('group', { name: WORK_COMPLETED })).toBeNull()
    expect(within(log(directFlow())).queryByRole('radio', { name: /^(Complete|Incomplete)$/ })).toBeNull()
    expect(uncapped.last()).toEqual({ elapsedSeconds: 90 })
  })
})
