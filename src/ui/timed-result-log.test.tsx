/**
 * TASK-009 (REQ-009; C25, C26, C27, C28; G08; R52, R54, R55, R56, R57, R79,
 * R83, R85, R90; AC-C25-01, AC-C26-01, AC-C27-01, AC-C28-01, AC-R009-01,
 * AC-R009-02; JOURNEY-009) — the AMRAP's prescription and concise scoring
 * controls, through the shared owners `TimedResultLog`
 * (`src/ui/refinements/timed-result-log.tsx`) and `QuantitySelector`
 * (`src/ui/refinements/quantity.tsx`) and the consumer that composes them,
 * `AmrapBlock`.
 *
 * JOURNEY-009's entry is the actual `/workout` route: the real router, guard
 * and shell over a running session whose first section holds the accepted
 * AMRAP and whose second is a cooldown (`amrap-result-fixture.ts`), so the
 * section's own forward action saves the AMRAP's result. The wall clock is
 * injected (`Date.now`). The shared stylesheets are applied to the document,
 * so the recipes are read from the cascade; browser geometry is
 * `e2e/refinement/task-009.spec.ts`.
 *
 * Every case name carries "AMRAP": check-01 selects them with
 * `--testNamePattern AMRAP`. Later owners of this file (TASK-010's completion
 * and effort cases) select their own.
 *
 * TASK-010 (REQ-010; C29, C30; R63, R76, R78, R80, R86, R87, R116, R124;
 * AC-C29-01, AC-C30-01, AC-R010-01, AC-R010-02; JOURNEY-010) — completion
 * choices and the existing effort faces, through the same owner's For Time and
 * ladder families and the consumers that compose them, `ForTimeBlock` and
 * `LadderBlock`, on the same real `/workout` route over its own fixture
 * (`completion-effort-fixture.ts`). Its cases live in their own describe block,
 * whose title carries both "completion" and "effort" — TASK-010's check-01
 * selects them with `--testNamePattern "completion|effort"` — and none of them
 * carries "AMRAP", so neither check selects the other's cases.
 *
 * Synthetic data only: in-memory doubles, no account and no network.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { routes } from '../app/router'
import type { AuthSession } from '../data/auth'
import { createWorkoutClients } from '../data/workout'
import { GalleryRefinements } from '../dev/gallery-refinements'
import { Frown, Meh, Smile } from '../design-system/index'
import { amrapOutcome, amrapShape, amrapView, clampAmrapState, type AmrapState } from '../state/amrap'
import {
  blockResultInsert,
  BlockCompletionContext,
  type BlockCompletion,
  type BlockCompletionApi,
  type BlockOutcome,
} from '../state/block-completion'
import { createError, err, ErrorCode, isErr, ok, type Result } from '../state/errors'
import { clampForTimeState, forTimeOutcome, forTimeShape, forTimeView, type ForTimeState } from '../state/for-time'
import { MOOD_SCALE } from '../state/mood'
import type { BlockResultRow, LadderTiming } from '../state/schemas'
import { sessionDetail } from '../state/session-detail'
import {
  readAmrapState,
  readForTimeState,
  WORKOUT_AMRAP_STORAGE_KEY,
  WORKOUT_FOR_TIME_STORAGE_KEY,
  type ShellStorage,
} from '../state/workout-persistence'
import { sessionProgress, type BlockProgress } from '../state/workout-progress'
import {
  AMRAP_COUNTS,
  AMRAP_SECTION_TITLE,
  AMRAP_WINDOW_SECONDS,
  AMRAP_WORK_LIST,
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
  FOR_TIME_WORK_LIST,
  LADDER_CAP,
  LADDER_ROUNDS,
  LADDER_WORK_LIST,
  RESULTS_SECTION_TITLE,
  WORK_COMPLETED,
  completionEffortAcceptance,
  completionEffortBlocks,
  completionEffortSnapshot,
} from '../test/completion-effort-fixture'
import {
  LOGGING_DOUBLE_ANON_KEY,
  LOGGING_DOUBLE_TOKEN,
  LOGGING_DOUBLE_URL,
  createLoggingDouble,
  type LoggingDouble,
} from '../test/logging-contract-double'
import { AppProviders, signedIn } from '../test/render'
import {
  ACTUALS_AMRAP_WORK_LIST,
  ACTUALS_COOLDOWN_TITLE,
  ACTUALS_FOR_TIME_WORK_LIST,
  ACTUALS_LADDER_ROUNDS,
  ACTUALS_LADDER_TARGETS,
  ACTUALS_LADDER_WORK_LIST,
  ACTUALS_PLANNED_LOADS,
  ACTUALS_RACE_SECTION_TITLE,
  ACTUALS_SECTION_TITLE,
  timedActualsAcceptance,
  timedActualsBlocks,
  timedActualsSnapshot,
} from '../test/timed-actuals-fixture'
import { closeTimedLogs, queryTimedLog, timedLogOpener } from '../test/timed-log-dialog'
import { FIXTURE_USER_ID } from '../test/user-data-double'
import { createWorkoutDouble, snapshotFixture, type BlockFixture, type WorkoutDoubleOptions } from '../test/workout-double'
import { ForTimeBlock } from './for-time-block'
import { LadderBlock } from './ladder-block'
import { SET_EFFORT_CHOICES } from './set-effort'

const ROOT = resolve(import.meta.dirname, '../..')
const PRESENTATION_CSS = readFileSync(resolve(ROOT, 'src/ui/refinements/presentation.css'), 'utf8')

beforeAll(() => {
  for (const file of ['src/ui/refinements/tokens.css', 'src/ui/refinements/presentation.css']) {
    const style = document.createElement('style')
    style.dataset.task009 = file
    style.textContent = readFileSync(resolve(ROOT, file), 'utf8')
    document.head.append(style)
  }
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
    await screen.findByRole('list', { name: AMRAP_WORK_LIST })
  }
  return { double, router, view, snapshot, block: amrapResultBlock(snapshot) }
}

/** The AMRAP's live card. */
function card(): HTMLElement {
  const found = screen.getByRole('list', { name: AMRAP_WORK_LIST }).closest<HTMLElement>('[data-workout-card="workout"]')
  if (found === null) throw new Error('the AMRAP has no live card')
  return found
}

/**
 * The AMRAP's log. TASK-046 (C45; R100): the card holds one "Log results"
 * action where the log was, and the same form — the shared `TimedResultLog`
 * — opens in the shared focused dialog, whose title "Log results" is the
 * form's one title. Opening it is the athlete's step; null when the card
 * offers no log. The form is never drawn inline in the card any more.
 */
function queryLog(scope: HTMLElement = card()): HTMLElement | null {
  if (scope !== document.body) expect(scope.querySelectorAll('form.clr-timed-log')).toHaveLength(0)
  return queryTimedLog(scope)
}

function log(scope: HTMLElement = card()): HTMLElement {
  const found = queryLog(scope)
  if (found === null) throw new Error('the AMRAP has no log')
  const dialog = found.closest('dialog')!
  const title = within(dialog).getByRole('heading', { name: 'Log results' })
  expect(title).toHaveClass('clr-accepted-log__title')
  expect(found.getAttribute('aria-labelledby')).toBe(title.id)
  return found
}

/** The log a lookup reads: `scope` itself when it is (or is inside) the open log, else the log opened from it. */
function logScope(scope?: HTMLElement): HTMLElement {
  if (scope === undefined) return log()
  return scope.closest('form.clr-timed-log') !== null || scope.matches('dialog') ? scope : log(scope)
}

/** One count's parts, by its label, read in the open log. */
function count(label: string, scope?: HTMLElement) {
  const group = within(logScope(scope)).getByRole('group', { name: label })
  const name = label.toLowerCase()
  return {
    group,
    value: within(group).getByRole('status', { name: label }),
    minus: within(group).getByRole('button', { name: `Decrease ${name}` }),
    plus: within(group).getByRole('button', { name: `Increase ${name}` }),
  }
}

/** What a count shows: `blank`, or its number. */
function shown(label: string, scope?: HTMLElement): string {
  return count(label, scope).value.dataset.quantityValue ?? ''
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

/** The declared body of one rule in the shared presentation stylesheet. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(PRESENTATION_CSS.replaceAll(/\/\*[\s\S]*?\*\//g, ''))?.[1] ?? ''
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

// ─────────────────────────────────────────────────────────────────────────────

describe('TASK-009 AMRAP prescription and concise scoring controls', () => {
  it('AC-C25-01 AMRAP work and its prescription precede the scoring on the real /workout route: ready, running and paused ask for no score, and once the window closes the log follows every movement', async () => {
    const user = userEvent.setup()
    await openWorkout()

    // Ready: the prescription is there to read, and nothing is scored yet.
    const list = within(card()).getByRole('list', { name: AMRAP_WORK_LIST })
    const movements = within(list).getAllByRole('listitem')
    expect(movements).toHaveLength(2)
    expect(movements[0].textContent).toMatch(/kb swing/i)
    expect(movements[0].textContent).toContain('12 reps')
    expect(movements[0].textContent).toContain('24 kg')
    expect(movements[1].textContent).toMatch(/burpee/i)
    expect(movements[1].textContent).toContain('10 reps')
    expect(within(card()).getByText('As many rounds as possible in 08:00.')).toBeInTheDocument()
    expect(queryLog()).toBeNull()
    expect(within(card()).queryAllByRole('group', { name: /Rounds completed|Reps into the next round/ })).toEqual([])

    // Running and paused: still nothing to enter.
    await user.click(within(card()).getByRole('button', { name: 'Start AMRAP' }))
    advance(30)
    expect(queryLog()).toBeNull()
    await user.click(within(card()).getByRole('button', { name: 'Pause' }))
    expect(within(card()).getByText('Paused')).toBeInTheDocument()
    expect(queryLog()).toBeNull()
    await user.click(within(card()).getByRole('button', { name: 'Resume' }))

    // Ended early: the work first, then the log — every movement and every one
    // of its readings before the log's place on the card (TASK-046: its
    // "Log results" action) and the log's title and both counts.
    advance(65)
    await user.click(within(card()).getByRole('button', { name: 'Finish early' }))
    expect(within(card()).getByText('01:35 on the clock')).toBeInTheDocument()
    const opener = timedLogOpener(card())!
    const form = log()
    const title = within(form.closest('dialog')!).getByRole('heading', { name: 'Log results' })
    expect(follows(opener, list)).toBe(true)
    expect(list.contains(opener)).toBe(false)
    expect(follows(form, list)).toBe(true)
    expect(list.contains(form)).toBe(false)
    for (const reading of card().querySelectorAll('[data-movement-identity]')) {
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
    cleanup()
    localStorage.clear()
    clock = ENTRY
    await openWorkout()
    await user.click(within(card()).getByRole('button', { name: 'Start AMRAP' }))
    advance(AMRAP_WINDOW_SECONDS + 5)
    await waitFor(() => expect(within(card()).getByText('Cap reached')).toBeInTheDocument())
    expect(follows(timedLogOpener(card())!, within(card()).getByRole('list', { name: AMRAP_WORK_LIST }))).toBe(true)
    const capped = log()
    expect(follows(capped, within(card()).getByRole('list', { name: AMRAP_WORK_LIST }))).toBe(true)
  })

  it('AC-C26-01 AMRAP rounds and the partial round are one result group under the simple log hierarchy: one Log results title, labels before their counts, no Result, Movements or Feedback group titles', async () => {
    const user = userEvent.setup()
    await openWorkout()
    await startAndFinishEarly(user, 95)

    const form = log()
    expect(form.tagName).toBe('FORM')
    // TASK-046: never inline any more, so never a duplicate landmark in the
    // card; in the focused dialog the one form is named by the dialog's title.
    expect(form).not.toHaveAttribute('aria-label')
    expect(within(card()).queryByRole('form')).toBeNull()
    expect(form.dataset.logHierarchy).toBe('simple')
    expect(form.dataset.timedFormat).toBe('amrap')
    expect(card().querySelectorAll('form')).toHaveLength(0)
    expect(form.closest('dialog')!.querySelectorAll('form')).toHaveLength(1)

    // One title — TASK-046: the dialog's, "Log results", at the level of the
    // card's other group ("Each round:"), and none drawn by the form itself.
    // TASK-015 (C37) adds the accepted per-movement groups after the counts,
    // each titled by its movement's name (the kettlebell swing's load field
    // here); those are the only other headings, and no Result / Movements /
    // Feedback title joins them.
    const dialog = form.closest('dialog')!
    const headings = within(dialog).getAllByRole('heading').filter((heading) => !heading.classList.contains('clr-timed-log__group-title'))
    expect(headings.map((heading) => heading.textContent)).toEqual(['Log results'])
    expect(within(dialog).getAllByRole('heading').map((heading) => heading.textContent)).toEqual(['Log results', 'kb swing'])
    expect(within(form).queryByRole('heading', { name: 'Log results' })).toBeNull()
    const title = headings[0]
    expect(title).toHaveClass('clr-accepted-log__title')
    const round = within(card()).getByRole('heading', { name: 'Each round:' })
    expect(title.tagName).toBe(round.tagName)
    for (const retired of ['Result', 'Movements', 'Feedback', 'Your score']) {
      expect(within(form).queryByText(retired, { exact: true })).toBeNull()
    }

    // One group holds both counts, rounds first; each label precedes its frame.
    // (TASK-015's per-movement groups follow it and are not result groups.)
    const groups = form.querySelectorAll<HTMLElement>('.clr-timed-log__group:not(.clr-timed-log__group--movement)')
    expect(groups).toHaveLength(1)
    const fields = [...groups[0].querySelectorAll<HTMLElement>('[data-quantity-field]')]
    expect(fields.map((field) => field.querySelector('.label')?.textContent)).toEqual([...AMRAP_COUNTS])
    for (const field of fields) {
      const [label, frame] = [...field.children]
      expect(label).toHaveClass('label')
      expect(frame).toHaveClass('clr-quantity')
      expect(frame.getAttribute('aria-labelledby')).toBe(label.id)
    }
    expect(fields[0].closest('.clr-timed-log__group')).toBe(fields[1].closest('.clr-timed-log__group'))

    // The accepted rhythm: the log under one rule, wider gaps between groups
    // than between the fields of one group, label close to its control.
    expect(rule('.clr-timed-log')).toMatch(/border-block-start:\s*var\(--border-width\) solid var\(--border-region-rule\)/)
    expect(rule('.clr-timed-log')).toMatch(/gap:\s*var\(--spacing-600\)/)
    expect(rule('.clr-timed-log__group')).toMatch(/gap:\s*var\(--spacing-400\)/)
    expect(rule('.clr-timed-field')).toMatch(/gap:\s*var\(--spacing-200\)/)
    expect(getComputedStyle(groups[0]).flexDirection).toBe('column')

    // Nothing is submitted: Enter in the log navigates nowhere and writes nothing.
    const submitted = new Event('submit', { bubbles: true, cancelable: true })
    form.dispatchEvent(submitted)
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

      // A distinct value: the timer role in the data face, centred.
      expect(value.tagName).toBe('OUTPUT')
      expect(value).toHaveClass('clr-quantity__value')
    }
    expect(count('Rounds completed').plus.parentElement!.style.getPropertyValue('--bleed')).toBe('var(--border-cta-primary)')
    expect(count('Rounds completed').minus.parentElement!.style.getPropertyValue('--bleed')).toBe('var(--border-cta-primary)')
    expect(count('Reps into the next round').minus.parentElement!.style.getPropertyValue('--bleed')).toBe('var(--border-disabled)')

    // The selected roomier recipe (R83): control-height action columns, the
    // value filling the middle, the frame's roomier padding around all three.
    const frame = rule('.clr-quantity')
    expect(frame).toMatch(/display:\s*grid/)
    expect(frame).toMatch(/grid-template-columns:\s*var\(--control-height\) minmax\(0, 1fr\) var\(--control-height\)/)
    expect(frame).toMatch(/padding:\s*var\(--spacing-300\)/)
    const valueRule = rule('.clr-quantity__value')
    expect(valueRule).toMatch(/color:\s*var\(--text-timer\)/)
    expect(valueRule).toMatch(/font-size:\s*var\(--heading-h2-size\)/)
    expect(valueRule).toMatch(/font-family:\s*var\(--font-data\)/)
    expect(valueRule).toMatch(/text-align:\s*center/)
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
      expect(value.dataset.quantityValue).toBe('blank')
      expect(value).toHaveTextContent('—')
      expect(value).toHaveTextContent('Not recorded')
      expect(within(value).getByText('—')).toHaveAttribute('aria-hidden', 'true')
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
    expect(within(card()).getByText('01:35 on the clock')).toBeInTheDocument()

    // The save: the section's one forward action writes the block's row.
    closeTimedLogs()
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

    // Back to the saved section: the values are still the values.
    closeTimedLogs()
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(await screen.findByRole('heading', { name: AMRAP_SECTION_TITLE })).toBeInTheDocument()
    expect(shown('Rounds completed')).toBe('blank')
    expect(shown('Reps into the next round')).toBe('0')

    // History reads the saved row back — the record a later visit opens,
    // through the same clients: a partial round of zero reps, and no rounds
    // reading at all. Absence, not a zero.
    second.view.unmount()
    const history = createMemoryRouter(routes, {
      initialEntries: ['/', `/history/${second.snapshot.session.id}`],
      initialIndex: 1,
    })
    render(
      <AppProviders {...signedIn({ workout: second.double.clients })}>
        <RouterProvider router={history} />
      </AppProviders>,
    )
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
    closeTimedLogs()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    const failed = await screen.findByRole('dialog')
    expect(failed).toHaveTextContent('That didn’t save')
    expect(rows).toEqual([])
    // Nothing discarded and nothing filled in while the save failed.
    expect(shown('Rounds completed')).toBe('2')
    expect(shown('Reps into the next round')).toBe('blank')
    expect(stored(block.blockId)).toMatchObject({ roundsCompleted: 2, partialRoundReps: null })

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
      <MemoryRouter initialEntries={['/gallery/refinements?state=amrap']}>
        <GalleryRefinements />
      </MemoryRouter>,
    )
    const state = document.querySelector<HTMLElement>('[data-refinement-state="amrap"]')!
    expect(state).not.toBeNull()
    expect(screen.getByRole('link', { name: 'AMRAP results' })).toHaveAttribute('aria-current', 'page')

    const attempts = {
      cap: state.querySelector<HTMLElement>('[data-gallery-amrap="cap"]')!,
      early: state.querySelector<HTMLElement>('[data-gallery-amrap="early"]')!,
    }
    for (const attempt of Object.values(attempts)) {
      const live = attempt.querySelector<HTMLElement>('[data-workout-card="workout"]')!
      const list = within(live).getByRole('list', { name: AMRAP_WORK_LIST })
      // TASK-046: the log's place is the card's "Log results" action, after the work.
      expect(follows(timedLogOpener(live)!, list)).toBe(true)
      const form = log(live)
      expect(follows(form, list)).toBe(true)
      expect(form.dataset.logHierarchy).toBe('simple')
      expect(form.querySelectorAll('.clr-quantity')).toHaveLength(2)
      expectNoResetControls(live)
      expectNoResetControls(form)
    }
    expect(within(attempts.cap).getByText('Cap reached')).toBeInTheDocument()
    expect(AMRAP_COUNTS.map((label) => shown(label, attempts.cap))).toEqual(['blank', 'blank'])
    expect(within(attempts.early).getByText('05:23 on the clock')).toBeInTheDocument()
    expect(AMRAP_COUNTS.map((label) => shown(label, attempts.early))).toEqual(['3', '0'])

    // The controls are live, over the gallery's memory only.
    await tap(user, count('Rounds completed', attempts.cap).plus)
    expect(shown('Rounds completed', attempts.cap)).toBe('1')
    expect(count('Reps into the next round', attempts.early).minus).toBeDisabled()
    expect(localStorage.getItem(WORKOUT_AMRAP_STORAGE_KEY)).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
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
  await screen.findByRole('list', { name: FOR_TIME_WORK_LIST })
  await screen.findByRole('list', { name: LADDER_WORK_LIST })
  return { double, view, snapshot, ...completionEffortBlocks(snapshot) }
}

/** A fresh visit at the entry clock, with nothing stored. */
function freshVisit() {
  cleanup()
  localStorage.clear()
  clock = ENTRY
}

function liveCard(listName: string, scope: HTMLElement = document.body): HTMLElement {
  const found = within(scope).getByRole('list', { name: listName }).closest<HTMLElement>('[data-workout-card="workout"]')
  if (found === null) throw new Error(`${listName} has no live card`)
  return found
}
const forTimeCard = (scope?: HTMLElement) => liveCard(FOR_TIME_WORK_LIST, scope)
const ladderCard = (scope?: HTMLElement) => liveCard(LADDER_WORK_LIST, scope)

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

/** One History reading — its label and its value — by the label's exact words. */
function historyReading(label: string): string {
  return screen.getByText(label, { exact: true }).parentElement?.textContent ?? ''
}

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

/** A direct mount over the shell's completion seam, its own memory clock store and the test's wall clock. */
function mountDirect(block: BlockProgress, kind: 'for_time' | 'ladder') {
  const values = new Map<string, string>()
  const storage: ShellStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  }
  const reportOutcome = vi.fn<(id: string, outcome: BlockOutcome) => void>()
  const api: BlockCompletionApi = { reportOutcome, isBlockRecorded: () => false }
  const now = () => clock
  render(
    <BlockCompletionContext value={api}>
      {kind === 'for_time'
        ? <ForTimeBlock block={block} storage={storage} now={now} />
        : <LadderBlock block={block} storage={storage} now={now} />}
    </BlockCompletionContext>,
  )
  return { reportOutcome, last: () => reportOutcome.mock.lastCall?.[1] }
}

async function finishForTimeAfter(user: ReturnType<typeof userEvent.setup>, seconds: number, scope = forTimeCard()) {
  await user.click(within(scope).getByRole('button', { name: 'Start For Time' }))
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

describe('TASK-010 completion choices and existing effort faces', () => {
  it('AC-C29-01 Complete and Incomplete share one row in the For Time and ladder logs on the real /workout route: one Work completed question, two equal answers side by side under the accepted recipe, after the work', async () => {
    const user = userEvent.setup()
    await openResults()

    // For Time ready, running and paused: no log, nothing to judge yet.
    expect(queryLog(forTimeCard())).toBeNull()
    await user.click(within(forTimeCard()).getByRole('button', { name: 'Start For Time' }))
    advance(30)
    expect(queryLog(forTimeCard())).toBeNull()
    await user.click(within(forTimeCard()).getByRole('button', { name: 'Pause' }))
    expect(queryLog(forTimeCard())).toBeNull()
    await user.click(within(forTimeCard()).getByRole('button', { name: 'Resume' }))
    advance(60)
    await user.click(within(forTimeCard()).getByRole('button', { name: 'Finish' }))

    for (const [format, scope, list] of [
      ['for_time', forTimeCard(), FOR_TIME_WORK_LIST],
      ['ladder', ladderCard(), LADDER_WORK_LIST],
    ] as const) {
      const form = log(scope)
      expect(form.dataset.timedFormat).toBe(format)
      expect(form.dataset.logHierarchy).toBe('simple')
      expect(follows(form, within(scope).getByRole('list', { name: list }))).toBe(true)
      // TASK-046: the log's place on the card, its "Log results" action, after the work.
      expect(follows(timedLogOpener(scope)!, within(scope).getByRole('list', { name: list }))).toBe(true)
      // One title and no group titles; the question and the effort in two
      // groups. TASK-015 (C37) adds the accepted per-movement groups between
      // them, each titled by its movement's name (the loaded wall ball's load
      // field for the For Time; none for the bodyweight ladder with no rung
      // stated); they are not result groups and carry no Result / Movements /
      // Feedback title.
      // TASK-046: the one title is the focused dialog's.
      expect(within(form.closest('dialog')!).getAllByRole('heading').filter((heading) => !heading.classList.contains('clr-timed-log__group-title')).map((heading) => heading.textContent)).toEqual(['Log results'])
      const groups = form.querySelectorAll<HTMLElement>('.clr-timed-log__group:not(.clr-timed-log__group--movement)')
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
    expect(rule('.clr-timed-completion [role="radiogroup"]')).toMatch(/flex-wrap:\s*nowrap !important/)
    expect(rule('.clr-timed-completion [role="radiogroup"] > .clr-bleed')).toMatch(/flex:\s*1 1 0/)
    expect(rule('.clr-timed-completion [role="radiogroup"] > .clr-bleed')).toMatch(/min-width:\s*0/)
    expect(rule('.clr-timed-completion [role="radio"]')).toMatch(/width:\s*100%/)
    expect(rule('.clr-timed-completion [role="radio"]')).toMatch(/justify-content:\s*center/)
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
    closeTimedLogs()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await screen.findByRole('heading', { name: RESULTS_COOLDOWN_TITLE })
    expect(recordedOutcome(first.double, first.forTime.blockId).outcome).toEqual({ elapsedSeconds: 90, completedUnderCap: false })

    // The cap: the clock cannot know the work was done, so Incomplete — and
    // Complete stays one tap away for someone who could not stop it in time.
    freshVisit()
    const second = await openResults()
    await user.click(within(forTimeCard()).getByRole('button', { name: 'Start For Time' }))
    advance(FOR_TIME_CAP_SECONDS + 5)
    await waitFor(() => expect(within(forTimeCard().parentElement!.closest('.clr-stack')!).getByText('Cap reached')).toBeInTheDocument())
    expect(chosen(completionOf(log(forTimeCard())))).toEqual(['Incomplete'])
    await answer(user, completionOf(log(forTimeCard())), 'Complete')
    expect(storedRace(second.forTime.blockId)).toMatchObject({ workCompleted: true })
    closeTimedLogs()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await screen.findByRole('heading', { name: RESULTS_COOLDOWN_TITLE })
    expect(recordedOutcome(second.double, second.forTime.blockId).outcome).toEqual({ elapsedSeconds: FOR_TIME_CAP_SECONDS, completedUnderCap: true })

    // Stopping to record mid-race claims no completion — only the seconds.
    freshVisit()
    const third = await openResults()
    await user.click(within(forTimeCard()).getByRole('button', { name: 'Start For Time' }))
    advance(200)
    expect(queryLog(forTimeCard())).toBeNull()
    closeTimedLogs()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await screen.findByRole('heading', { name: RESULTS_COOLDOWN_TITLE })
    expect(recordedOutcome(third.double, third.forTime.blockId).outcome).toEqual({ elapsedSeconds: 200 })
    expect(blockResultInsert(recordedOutcome(third.double, third.forTime.blockId))).toMatchObject({ elapsed_seconds: 200, completed_under_cap: null })

    // No cap, no claim: the question is not asked; the effort still is.
    freshVisit()
    const uncapped = mountDirect(fixtureBlock({ structureType: 'for_time', timerSeconds: null, exercises: ['not_started'] }), 'for_time')
    await user.click(screen.getByRole('button', { name: 'Start For Time' }))
    advance(120)
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    const open = log(document.body)
    expect(within(open).queryByRole('group', { name: WORK_COMPLETED })).toBeNull()
    expect(chosen(effortOf(open))).toEqual([])
    expect(uncapped.last()).toEqual({ elapsedSeconds: 120 })
  })

  it('AC-R010-01 ladder completion follows the work it tracked: nothing is chosen before the attempt ends; Finish, the cap and a schedule run out, with nothing tracked, start at Incomplete with no rung — never every rung — and only the athlete’s Complete records the top rung', async () => {
    const user = userEvent.setup()
    const first = await openResults()

    // Before the attempt ends: the question is there to answer, unanswered.
    const before = completionOf(log(ladderCard()))
    expect(chosen(before)).toEqual([])
    // TASK-012 (C35, R95): the pattern is the compact prescription's rounds;
    // no read-only rung row repeats it before the attempt is answered.
    expect(within(ladderCard()).getByRole('list', { name: LADDER_WORK_LIST })).toBeInTheDocument()
    expect(within(ladderCard()).queryByRole('list', { name: 'Ladder' })).toBeNull()

    // Finish with nothing tracked rung by rung: Incomplete, and how far is asked.
    // TASK-013 (C33, C34): how far is the log's "Rounds completed" — rep-first
    // tiles, the pressed prefix and its count — in place of the rung radios.
    await finishLadderAfter(user, 200)
    expect(chosen(completionOf(log(ladderCard())))).toEqual(['Incomplete'])
    const howFar = () => within(log(ladderCard())).getByRole('group', { name: 'Rounds completed' })
    const pressedRounds = () => within(howFar()).getAllByRole('button').filter((tile) => tile.getAttribute('aria-pressed') === 'true')
    expect(pressedRounds()).toEqual([])
    expect(within(howFar()).getByRole('status')).toHaveTextContent('No rounds marked yet')
    await user.click(within(howFar()).getByRole('button', { name: 'Round 3: 6 reps' }))
    expect(within(howFar()).getByRole('status')).toHaveTextContent(`3 of ${LADDER_ROUNDS} rounds completed`)

    // Complete is the athlete's to say, and only then is every rung reached.
    await answer(user, completionOf(log(ladderCard())), 'Complete')
    expect(pressedRounds()).toHaveLength(LADDER_ROUNDS)
    expect(within(howFar()).getByRole('status')).toHaveTextContent(`${LADDER_ROUNDS} of ${LADDER_ROUNDS} rounds completed`)
    // Back to Incomplete: the rung starts over rather than keeping a guess.
    await answer(user, completionOf(log(ladderCard())), 'Incomplete')
    expect(pressedRounds()).toEqual([])
    closeTimedLogs()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await screen.findByRole('heading', { name: RESULTS_COOLDOWN_TITLE })
    expect(recordedOutcome(first.double, first.ladder.blockId).outcome).toEqual({})

    // The cap with nothing tracked: Incomplete, no rung.
    freshVisit()
    const second = await openResults()
    await user.click(within(ladderCard()).getByRole('button', { name: 'Start ladder' }))
    advance(LADDER_CAP + 5)
    await waitFor(() => expect(chosen(completionOf(log(ladderCard())))).toEqual(['Incomplete']))
    closeTimedLogs()
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
      'ladder',
    )
    expect(chosen(completionOf(log(document.body)))).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Start schedule' }))
    advance(185)
    expect(screen.getByText('COMPLETE')).toBeInTheDocument()
    expect(chosen(completionOf(log(document.body)))).toEqual(['Incomplete'])
    expect(schedule.last()).toEqual({})

    // An answer given before the attempt ends is the athlete's and stays so.
    freshVisit()
    const legacy = mountDirect(
      fixtureBlock({ structureType: 'for_time', repScheme: 'ladder_down', timerSeconds: 480, timerType: 'countdown', exercises: [rungs('kettlebell-swing', [15, 12, 9, 6, 3])] }),
      'ladder',
    )
    await answer(user, completionOf(log(document.body)), 'Complete')
    expect(legacy.last()).toEqual({ highestRung: 5 })
    await user.click(screen.getByRole('button', { name: 'Start ladder' }))
    advance(100)
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    expect(chosen(completionOf(log(document.body)))).toEqual(['Complete'])
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
    expect(within(forTimeCard().parentElement!.closest('.clr-stack')!).getByRole('timer', { name: 'Block time' })).toHaveTextContent('01:30')
    expect(chosen(completionOf(log(forTimeCard())))).toEqual(['Incomplete'])
    expect(chosen(completionOf(log(ladderCard())))).toEqual(['Complete'])

    // The save: one forward action writes both rows.
    closeTimedLogs()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await screen.findByRole('heading', { name: RESULTS_COOLDOWN_TITLE })
    const forTimeRow = recordedOutcome(second.double, second.forTime.blockId)
    const ladderRow = recordedOutcome(second.double, second.ladder.blockId)
    expect(forTimeRow).toEqual({ blockId: second.forTime.blockId, outcome: { elapsedSeconds: 90, completedUnderCap: false }, perceivedEffort: null })
    expect(ladderRow).toEqual({ blockId: second.ladder.blockId, outcome: { highestRung: LADDER_ROUNDS }, perceivedEffort: null })
    expect(blockResultInsert(forTimeRow)).toMatchObject({ elapsed_seconds: 90, completed_under_cap: false, highest_rung: null, perceived_effort: null })
    expect(blockResultInsert(ladderRow)).toMatchObject({ elapsed_seconds: null, completed_under_cap: null, highest_rung: LADDER_ROUNDS, perceived_effort: null })

    // Back to the saved section: no longer offered as a choice — there is no
    // correction writer for a saved result, so nothing on screen can drift
    // from the row. The For Time reads its saved answer from its own record.
    // The ladder claims no answer at all rather than a draft or starting point
    // the saved row may contradict: once the server reports its row, the
    // durable attempt is closed as saved elsewhere (TASK-032; reading the
    // saved ladder result back is TASK-048).
    closeTimedLogs()
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    await screen.findByRole('heading', { name: RESULTS_SECTION_TITLE })
    for (const [scope, shown] of [[forTimeCard(), ['Incomplete']], [ladderCard(), []]] as const) {
      const question = completionOf(log(scope))
      expect(chosen(question)).toEqual(shown)
      for (const radio of within(question).getAllByRole('radio')) {
        expect(radio).toBeDisabled()
        expect(radio.parentElement!.style.getPropertyValue('--bleed')).toBe('var(--border-disabled)')
      }
      expect(within(scope).getByText('Block saved')).toBeInTheDocument()
    }
    expect(second.double.recorded()).toHaveLength(2)

    // History reads the saved rows back: the For Time stopped before its cap
    // as Incomplete — not "Stopped at the cap" — and the ladder's top rung.
    second.view.unmount()
    const history = createMemoryRouter(routes, {
      initialEntries: ['/', `/history/${second.snapshot.session.id}`],
      initialIndex: 1,
    })
    render(
      <AppProviders {...signedIn({ workout: second.double.clients })}>
        <RouterProvider router={history} />
      </AppProviders>,
    )
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

    // Answered, then cleared back to unanswered — and focus stays in the question.
    await answer(user, effortOf(log(forTimeCard())), 'Too hard')
    expect(chosen(effortOf(log(forTimeCard())))).toEqual(['Too hard'])
    await user.click(within(log(forTimeCard())).getByRole('button', { name: 'Clear effort for this block' }))
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
    closeTimedLogs()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await screen.findByRole('heading', { name: RESULTS_COOLDOWN_TITLE })
    for (const [blockId, category] of [[forTime.blockId, 'about_right'], [ladder.blockId, 'too_easy']] as const) {
      const row = recordedOutcome(double, blockId)
      expect(row.perceivedEffort).toBeNull()
      expect(row.outcome.effort).toBe(category)
      expect(blockResultInsert(row)).toMatchObject({ perceived_effort: null, effort: category })
    }
    expect(double.completed()).toEqual([])
    expect(JSON.stringify(localStorage)).not.toMatch(/too_hard|about_right|too_easy/)
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
    // names its scope (the accepted owner's one adaptation).
    expect(within(form).getByText(EFFORT_LEGEND)).toBeInTheDocument()
    expect(within(log(forTimeCard())).getByRole('button', { name: 'Clear effort for this block' })).toHaveClass('clr-btn--quiet')
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

    closeTimedLogs()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    const failed = await screen.findByRole('dialog')
    expect(failed).toHaveTextContent('That didn’t save')
    expect(rows).toEqual([])
    // Nothing discarded and nothing filled in while the save failed.
    expect(chosen(completionOf(log(forTimeCard())))).toEqual(['Incomplete'])
    expect(chosen(effortOf(log(forTimeCard())))).toEqual(['Too hard'])
    expect(chosen(completionOf(log(ladderCard())))).toEqual(['Complete'])
    expect(storedRace(forTime.blockId)).toMatchObject({ workCompleted: false })

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
      { id: 'for_time', title: 'For Time results', list: FOR_TIME_WORK_LIST, attempts: { 'for-time-finish': 'Complete', 'for-time-cap': 'Incomplete' } },
      { id: 'ladder', title: 'Ladder results', list: LADDER_WORK_LIST, attempts: { 'ladder-finish': 'Incomplete', 'ladder-cap': 'Incomplete' } },
    ] as const

    for (const state of states) {
      cleanup()
      render(
        <MemoryRouter initialEntries={[`/gallery/refinements?state=${state.id}`]}>
          <GalleryRefinements />
        </MemoryRouter>,
      )
      const root = document.querySelector<HTMLElement>(`[data-refinement-state="${state.id}"]`)!
      expect(root).not.toBeNull()
      expect(screen.getByRole('link', { name: state.title })).toHaveAttribute('aria-current', 'page')
      for (const [attempt, starts] of Object.entries(state.attempts)) {
        const scope = root.querySelector<HTMLElement>(`[data-gallery-race="${attempt}"]`)!
        const live = liveCard(state.list, scope)
        // TASK-046: the log's place on the card, its "Log results" action, after the work.
        expect(follows(timedLogOpener(live)!, within(live).getByRole('list', { name: state.list }))).toBe(true)
        const form = log(live)
        expect(follows(form, within(live).getByRole('list', { name: state.list }))).toBe(true)
        expect(chosen(completionOf(form))).toEqual([starts])
        expect(chosen(effortOf(form))).toEqual([])
        if (state.id === 'ladder') {
          // Nothing tracked: how far is asked, and no rung is claimed.
          // TASK-013 (C33, C34): as the log's rep-first "Rounds completed".
          const rounds = within(form).getByRole('group', { name: 'Rounds completed' })
          expect(within(rounds).getByRole('status')).toHaveTextContent('No rounds marked yet')
          expect(within(rounds).getAllByRole('button').filter((tile) => tile.getAttribute('aria-pressed') === 'true')).toEqual([])
        }
      }
      if (state.id === 'for_time') {
        const finish = root.querySelector<HTMLElement>('[data-gallery-race="for-time-finish"]')!
        expect(within(finish).getByRole('timer', { name: 'Block time' })).toHaveTextContent('06:23')
        expect(within(root.querySelector<HTMLElement>('[data-gallery-race="for-time-cap"]')!).getByText('Cap reached')).toBeInTheDocument()
        // Live: corrected and answered over the gallery's memory only.
        await answer(user, completionOf(log(liveCard(state.list, finish))), 'Incomplete')
        expect(chosen(completionOf(log(liveCard(state.list, finish))))).toEqual(['Incomplete'])
        await answer(user, effortOf(log(liveCard(state.list, finish))), 'About right')
        expect(chosen(effortOf(log(liveCard(state.list, finish))))).toEqual(['About right'])
      } else {
        const finish = root.querySelector<HTMLElement>('[data-gallery-race="ladder-finish"]')!
        await answer(user, completionOf(log(liveCard(state.list, finish))), 'Complete')
        // TASK-013 (C34): the reached reading is the rounds' count.
        expect(within(within(log(liveCard(state.list, finish))).getByRole('group', { name: 'Rounds completed' })).getByRole('status'))
          .toHaveTextContent('4 of 4 rounds completed')
      }
    }
    expect(localStorage.getItem(WORKOUT_FOR_TIME_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem('clear.workout-ladders')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TASK-015 — truthful per-movement partial and actual-load entry (C37)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TASK-015 (REQ-015; C37; R62, R69, R116; AC-C37-01, AC-R015-01, AC-R015-02;
 * JOURNEY-015) — the per-movement partial and load entries of the same owner's
 * AMRAP, For Time and ladder families and the consumers that compose them, on
 * the same real `/workout` route over their own fixture
 * (`timed-actuals-fixture.ts`), saved through the shell's one completion path
 * (`BlockCompletionProvider` → TASK-031's `saveTimedResult`) over the
 * migration-transcribed in-memory PostgREST (`logging-contract-double.ts`).
 * Every case name carries "partial", "load" or "round": check-01 selects them
 * with `--testNamePattern "partial|load|round"`.
 */

const HEAVY_MS = 30_000

/** The session's owner: a real uuid, because the performed reconstruction's schema reads it as one. */
const ACTUALS_USER_ID = 'a0000015-0000-4000-8000-000000000000'

const runningActuals = () =>
  timedActualsSnapshot(timedActualsAcceptance(), {
    userId: ACTUALS_USER_ID,
    startedAt: new Date(ENTRY - 60_000).toISOString(),
  })

/** The app's own writers over the migration-transcribed PostgREST, for the session's owner. */
function realWritersOver(double: LoggingDouble) {
  const auth = {
    getSession: (): Promise<Result<AuthSession | null>> =>
      Promise.resolve(
        ok({ accessToken: LOGGING_DOUBLE_TOKEN, refreshToken: 'refresh', expiresAt: Date.now() + 60_000, user: { id: ACTUALS_USER_ID, email: null } }),
      ),
  }
  return createWorkoutClients({ auth, supabase: { url: LOGGING_DOUBLE_URL, anonKey: LOGGING_DOUBLE_ANON_KEY, fetch: double.fetch } })
}

/** JOURNEY-015's entry: `/workout`, the session running for one minute, the three timed blocks ready. */
async function openActuals(options: Omit<WorkoutDoubleOptions, 'session'> = {}) {
  const snapshot = runningActuals()
  const double = createWorkoutDouble({ session: snapshot, ...options })
  const router = createMemoryRouter(routes, { initialEntries: ['/', '/workout'], initialIndex: 1 })
  const view = render(
    <AppProviders {...signedIn({ workout: double.clients })}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  await screen.findByRole('navigation', { name: 'Workout sections' })
  await screen.findByRole('list', { name: ACTUALS_AMRAP_WORK_LIST })
  await screen.findByRole('list', { name: ACTUALS_LADDER_WORK_LIST })
  return { double, view, snapshot, ...timedActualsBlocks(snapshot) }
}

/** The same entry, with the block writers and the performed read answered by the real clients over the logging double. */
async function openActualsOverDouble() {
  const snapshot = runningActuals()
  const logging = createLoggingDouble({ snapshot })
  const real = realWritersOver(logging)
  const opened = await openActuals({ blockResults: real.blockResults, sessions: { asPerformed: real.sessions.asPerformed } })
  return { ...opened, logging, real }
}

const amrapCardOf = () => liveCard(ACTUALS_AMRAP_WORK_LIST)
const forTimeCardOf = () => liveCard(ACTUALS_FOR_TIME_WORK_LIST)
const ladderCardOf = () => liveCard(ACTUALS_LADDER_WORK_LIST)

/**
 * TASK-046: where a block's entries are read — the open log itself, or the
 * log opened from the block's "Log results" action; the card itself when it
 * offers no log (so a lookup there finds nothing, as before).
 */
function entryScope(scope: HTMLElement): HTMLElement {
  if (scope.closest('form.clr-timed-log') !== null || scope.matches('dialog')) return scope
  return queryLog(scope) ?? scope
}

/** One movement's group in a log, by its `workout_exercises.id`; null when the log draws none for it. */
function movementGroup(scope: HTMLElement, exerciseId: string): HTMLElement | null {
  return entryScope(scope).querySelector<HTMLElement>(`[data-timed-movement="${exerciseId}"]`)
}

/** Every movement group a log draws, in order: the movement's name and its fields' visible labels and units. */
function movementGroups(scope: HTMLElement) {
  return [...entryScope(scope).querySelectorAll<HTMLElement>('[data-timed-movement]')].map((group) => ({
    id: group.dataset.timedMovement,
    name: within(group).getByRole('heading').textContent,
    fields: [...group.querySelectorAll<HTMLElement>('label')].map((label) => label.textContent),
    units: [...group.querySelectorAll<HTMLElement>('.clr-field__unit')].map((unit) => unit.textContent),
  }))
}

const amountOf = (scope: HTMLElement, name: string) =>
  within(entryScope(scope)).queryByRole('spinbutton', { name: new RegExp(`^(?:Round \\d+|Completed) · ${name}$`) }) as HTMLInputElement | null
const weightOf = (scope: HTMLElement, name: string) =>
  within(entryScope(scope)).queryByRole('spinbutton', { name: `Weight · ${name}` }) as HTMLInputElement | null

async function type(user: ReturnType<typeof userEvent.setup>, field: HTMLElement | null, text: string) {
  if (field === null) throw new Error('no field to type into')
  await user.clear(field)
  if (text !== '') await user.type(field, text)
}

const storedAmrap = (blockId: string) => readAmrapState(localStorage, blockId)
const storedLadderDraft = (blockId: string): { movements?: Record<string, { amount: string; weight: string }> } | null =>
  (JSON.parse(localStorage.getItem('clear.workout-ladders') ?? '{}')[blockId]?.draft ?? null)

/** The ladder's live check-off tile for a round, while the clock runs (TASK-013). */
function liveRound(scope: HTMLElement, round: number): HTMLElement {
  return within(scope).getByRole('button', { name: new RegExp(`^Round ${round} `) })
}

/** A log's answer to Work completed. */
async function choose(user: ReturnType<typeof userEvent.setup>, scope: HTMLElement, word: 'Complete' | 'Incomplete') {
  await answer(user, completionOf(log(scope)), word)
}

const requestsTo = (double: LoggingDouble, path: string, method?: string) =>
  double.requests.filter((entry) => entry.path === path && (method === undefined || entry.method === method))

describe('TASK-015 truthful per-movement partial and actual-load entry', () => {
  it('AC-C37-01 AMRAP per-movement partial and load fields follow the recorded rounds on the real /workout route: no amount until a rounds count is recorded, an explicit 0 gives round 1, the label names the round after the count, each amount in its movement’s own unit, a load only on a loaded movement, blank unrecorded and 0 kept, the partial reps count kept beside them, and a changed count clears the amounts and keeps the loads', async () => {
    const user = userEvent.setup()
    const { amrap } = await openActuals()
    const [swing, burpee, row] = amrap.exercises.map((exercise) => exercise.exerciseId)
    await startAndFinishEarly(user, 200)
    const form = log(amrapCardOf())

    // Nothing counted: no round to attach a partial to, so no amount field
    // anywhere; the loaded kettlebell swing alone has its load field.
    expect(movementGroups(form)).toEqual([{ id: swing, name: 'kettlebell swing', fields: ['Weight used'], units: ['kg'] }])
    expect(amountOf(form, 'kettlebell swing')).toBeNull()
    expect(movementGroup(form, burpee)).toBeNull()
    expect(movementGroup(form, row)).toBeNull()

    // One round counted: each movement's round-2 amount, in its own unit —
    // reps, reps and metres — and still one load field.
    await tap(user, count('Rounds completed', amrapCardOf()).plus)
    expect(movementGroups(form)).toEqual([
      { id: swing, name: 'kettlebell swing', fields: ['Completed in round 2', 'Weight used'], units: ['reps', 'kg'] },
      { id: burpee, name: 'burpee', fields: ['Completed in round 2'], units: ['reps'] },
      { id: row, name: 'row', fields: ['Completed in round 2'], units: ['m'] },
    ])
    expect(amountOf(form, 'row')).toHaveAttribute('inputmode', 'decimal')
    expect(amountOf(form, 'burpee')).toHaveAttribute('inputmode', 'numeric')
    // An explicit zero rounds is a count: round 1.
    await tap(user, count('Rounds completed', amrapCardOf()).minus)
    expect(shown('Rounds completed', amrapCardOf())).toBe('0')
    expect(movementGroups(form).map((group) => group.fields[0])).toEqual(['Completed in round 1', 'Completed in round 1', 'Completed in round 1'])

    // Every field starts blank: nothing is filled from the plan's 12 reps,
    // 8 reps, 200 m or 24 kg.
    for (const field of [amountOf(form, 'kettlebell swing'), amountOf(form, 'burpee'), amountOf(form, 'row'), weightOf(form, 'kettlebell swing')]) {
      expect(field).toHaveValue(null)
    }
    expect(form.textContent).not.toContain(String(ACTUALS_PLANNED_LOADS.kettlebellSwing))

    // Typed as typed: an amount, a zero and a load; the row left blank is not recorded.
    await type(user, amountOf(form, 'kettlebell swing'), '7')
    await type(user, amountOf(form, 'burpee'), '0')
    await type(user, weightOf(form, 'kettlebell swing'), '20')
    expect(storedAmrap(amrap.blockId)?.movements).toEqual({ [swing]: { amount: '7', weight: '20' }, [burpee]: { amount: '0', weight: '' } })
    // The reps into the next round is its own count: neither derived from the other.
    await tap(user, count('Reps into the next round', amrapCardOf()).plus, 5)
    expect(shown('Reps into the next round', amrapCardOf())).toBe('5')
    expect(amountOf(form, 'kettlebell swing')).toHaveValue(7)
    expect(storedAmrap(amrap.blockId)).toMatchObject({ roundsCompleted: 0, partialRoundReps: 5 })
    await type(user, amountOf(form, 'kettlebell swing'), '9')
    expect(shown('Reps into the next round', amrapCardOf())).toBe('5')

    // A changed count moves the round: the amounts are cleared, never carried
    // to round 3, and the load is kept.
    await tap(user, count('Rounds completed', amrapCardOf()).plus, 2)
    expect(movementGroups(form).map((group) => group.fields[0])).toEqual(['Completed in round 3', 'Completed in round 3', 'Completed in round 3'])
    expect(amountOf(form, 'kettlebell swing')).toHaveValue(null)
    expect(amountOf(form, 'burpee')).toHaveValue(null)
    expect(weightOf(form, 'kettlebell swing')).toHaveValue(20)
    expect(storedAmrap(amrap.blockId)?.movements).toEqual({ [swing]: { amount: '', weight: '20' }, [burpee]: { amount: '', weight: '' } })
    // The accepted labels and the shared field: a real label for each, the
    // group titled by the movement, and no reset or clear control.
    expect(within(movementGroup(form, swing)!).getByRole('heading')).toHaveClass('clr-timed-log__group-title')
    expectNoResetControls(form)
  }, HEAVY_MS)

  it('AC-C37-01 For Time partial and load fields follow the race: a single pass answered Incomplete asks each movement’s completed amount for round 1 in its own unit and a load on the loaded movement, Complete asks loads only and clears the amounts, an invalid value is refused in the field by the row’s own rule, and a multi-round race asks loads only with no partial round and no rounds count', async () => {
    const user = userEvent.setup()
    const { forTime, race } = await openActualsOverDouble()
    const [wallBall, plank] = forTime.exercises.map((exercise) => exercise.exerciseId)
    await finishForTimeAfter(user, 90, forTimeCardOf())
    const form = log(forTimeCardOf())

    // Finished under the cap starts at Complete: the race's work is done, so
    // no partial; the loaded wall ball's load alone.
    expect(chosen(completionOf(form))).toEqual(['Complete'])
    expect(movementGroups(form)).toEqual([{ id: wallBall, name: 'wall ball', fields: ['Weight used'], units: ['kg'] }])
    expect(movementGroup(form, plank)).toBeNull()

    // Incomplete: the single pass is round 1, so each movement's completed
    // amount — reps for the wall ball, seconds for the plank — and the load.
    await choose(user, forTimeCardOf(), 'Incomplete')
    expect(movementGroups(form)).toEqual([
      { id: wallBall, name: 'wall ball', fields: ['Completed', 'Weight used'], units: ['reps', 'kg'] },
      { id: plank, name: 'plank', fields: ['Completed'], units: ['sec'] },
    ])
    expect(amountOf(form, 'wall ball')).toHaveAccessibleName('Completed · wall ball')
    expect(amountOf(form, 'wall ball')).toHaveValue(null)
    expect(weightOf(form, 'wall ball')).toHaveValue(null)
    await type(user, amountOf(form, 'wall ball'), '28')
    await type(user, amountOf(form, 'plank'), '45')
    await type(user, weightOf(form, 'wall ball'), '8')
    expect(readForTimeState(localStorage, forTime.blockId)?.movements).toEqual({ [wallBall]: { amount: '28', weight: '8' }, [plank]: { amount: '45', weight: '' } })

    // Refused in the field by the same rule that builds the row: a negative
    // load, a fractional rep count; a blank is never refused.
    await type(user, weightOf(form, 'wall ball'), '-2')
    expect(weightOf(form, 'wall ball')).toHaveAttribute('aria-invalid', 'true')
    expect(within(movementGroup(form, wallBall)!).getByText('Enter a weight of zero or more')).toBeInTheDocument()
    await type(user, weightOf(form, 'wall ball'), '8')
    expect(weightOf(form, 'wall ball')).not.toHaveAttribute('aria-invalid')
    await type(user, amountOf(form, 'plank'), '4.5')
    expect(amountOf(form, 'plank')).toHaveAttribute('aria-invalid', 'true')
    expect(within(movementGroup(form, plank)!).getByText('Enter sec as a whole number, 0 or more')).toBeInTheDocument()
    await type(user, amountOf(form, 'plank'), '')
    expect(amountOf(form, 'plank')).not.toHaveAttribute('aria-invalid')
    expect(readForTimeState(localStorage, forTime.blockId)?.movements).toEqual({ [wallBall]: { amount: '28', weight: '8' }, [plank]: { amount: '', weight: '' } })

    // Back to Complete: the round is gone, so the amounts are cleared and the load kept.
    await choose(user, forTimeCardOf(), 'Complete')
    expect(movementGroups(form)).toEqual([{ id: wallBall, name: 'wall ball', fields: ['Weight used'], units: ['kg'] }])
    expect(weightOf(form, 'wall ball')).toHaveValue(8)
    expect(readForTimeState(localStorage, forTime.blockId)?.movements).toEqual({ [wallBall]: { amount: '', weight: '8' }, [plank]: { amount: '', weight: '' } })
    // No rounds-completed control joins a For Time log.
    expect(within(form).queryByRole('group', { name: 'Rounds completed' })).toBeNull()

    // The three-round race in the next section: loads only — no partial round
    // is guessed for a multi-round race with no recorded count, and no rounds
    // count is asked (owner decision).
    closeTimedLogs()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await screen.findByRole('heading', { name: ACTUALS_RACE_SECTION_TITLE })
    const raceCard = liveCard(ACTUALS_FOR_TIME_WORK_LIST)
    await user.click(within(raceCard).getByRole('button', { name: 'Start For Time' }))
    advance(300)
    await user.click(within(raceCard).getByRole('button', { name: 'Finish' }))
    const raceLog = log(raceCard)
    await choose(user, raceCard, 'Incomplete')
    const [thruster, raceBurpee] = race.exercises.map((exercise) => exercise.exerciseId)
    expect(movementGroups(raceLog)).toEqual([{ id: thruster, name: 'thruster', fields: ['Weight used'], units: ['kg'] }])
    expect(movementGroup(raceLog, raceBurpee)).toBeNull()
    expect(within(raceLog).queryByRole('group', { name: 'Rounds completed' })).toBeNull()
    expect(within(raceLog).queryByRole('spinbutton', { name: /^(?:Round|Completed) · / })).toBeNull()
    await type(user, weightOf(raceLog, 'thruster'), '35')
    expect(readForTimeState(localStorage, race.blockId)?.movements).toEqual({ [thruster]: { amount: '', weight: '35' } })
  }, HEAVY_MS)

  it('AC-R015-01 ladder partial fields name the round after the stated prefix, are bounded by that rung’s target and never filled from it, a change of round clears the amounts and keeps the loads, Complete offers loads only, and the entries live on the durable draft', async () => {
    const user = userEvent.setup()
    const { ladder } = await openActuals()
    const [goblet, pushUp] = ladder.exercises.map((exercise) => exercise.exerciseId)
    const card = ladderCardOf()
    await user.click(within(card).getByRole('button', { name: 'Start ladder' }))
    await user.click(liveRound(card, 2))
    advance(100)
    await user.click(within(card).getByRole('button', { name: 'Finish' }))
    const form = log(card)

    // Finish carried the checked prefix: Incomplete through round 2, so the
    // partial belongs to round 3 — the round the log already names (TASK-013)
    // — bounded by each movement's target there (6), never filled with it.
    expect(chosen(completionOf(form))).toEqual(['Incomplete'])
    expect(within(form).getByText(`Any partial work belongs to round 3`)).toBeInTheDocument()
    expect(movementGroups(form)).toEqual([
      { id: goblet, name: 'goblet squat', fields: ['Completed in round 3', 'Weight used'], units: ['reps', 'kg'] },
      { id: pushUp, name: 'push up', fields: ['Completed in round 3'], units: ['reps'] },
    ])
    expect(amountOf(form, 'goblet squat')).toHaveAttribute('max', String(ACTUALS_LADDER_TARGETS[2]))
    expect(amountOf(form, 'goblet squat')).toHaveValue(null)
    expect(weightOf(form, 'goblet squat')).toHaveValue(null)
    expect(form.textContent).not.toContain(`${ACTUALS_PLANNED_LOADS.gobletSquat} kg`)

    // Above the rung's target: refused in the field; at it: taken.
    await type(user, amountOf(form, 'goblet squat'), '7')
    expect(amountOf(form, 'goblet squat')).toHaveAttribute('aria-invalid', 'true')
    expect(within(movementGroup(form, goblet)!).getByText('At most 6 reps in round 3')).toBeInTheDocument()
    await type(user, amountOf(form, 'goblet squat'), '4')
    expect(amountOf(form, 'goblet squat')).not.toHaveAttribute('aria-invalid')
    await type(user, amountOf(form, 'push up'), '6')
    await type(user, weightOf(form, 'goblet squat'), '16')
    expect(storedLadderDraft(ladder.blockId)?.movements).toEqual({ [goblet]: { amount: '4', weight: '16' }, [pushUp]: { amount: '6', weight: '' } })

    // The prefix corrected to round 3: the partial moves to round 4, the
    // amounts are cleared (never carried) and the load is kept.
    await user.click(within(within(form).getByRole('group', { name: 'Rounds completed' })).getByRole('button', { name: /^Round 3: / }))
    expect(movementGroups(form).map((group) => group.fields[0])).toEqual(['Completed in round 4', 'Completed in round 4'])
    expect(amountOf(form, 'goblet squat')).toHaveAttribute('max', String(ACTUALS_LADDER_TARGETS[3]))
    expect(amountOf(form, 'goblet squat')).toHaveValue(null)
    expect(amountOf(form, 'push up')).toHaveValue(null)
    expect(weightOf(form, 'goblet squat')).toHaveValue(16)
    expect(storedLadderDraft(ladder.blockId)?.movements).toEqual({ [goblet]: { amount: '', weight: '16' }, [pushUp]: { amount: '', weight: '' } })

    // Complete: every rung done, so no partial round; the load stays offered.
    await choose(user, card, 'Complete')
    expect(movementGroups(form)).toEqual([{ id: goblet, name: 'goblet squat', fields: ['Weight used'], units: ['kg'] }])
    expect(weightOf(form, 'goblet squat')).toHaveValue(16)
    // Incomplete again clears the round to be stated: no round, no amount field.
    await choose(user, card, 'Incomplete')
    expect(movementGroups(form)).toEqual([{ id: goblet, name: 'goblet squat', fields: ['Weight used'], units: ['kg'] }])
    expect(within(form).getByRole('group', { name: 'Rounds completed' }).querySelectorAll('[aria-pressed="true"]')).toHaveLength(0)
    expect(ACTUALS_LADDER_ROUNDS).toBe(4)
  }, HEAVY_MS)

  it('AC-R015-02 the partials, loads and effort save through the shell’s one completion path over the migration-transcribed PostgREST: one block row carrying the category as effort and never a number, one movement row per entered movement with its round, modality column and stamped unit, none for a blank movement, a refused movement write keeps every entry with the existing dialog, the retry restates the row and writes the movements once, saved fields read back disabled after a return and a reload, and History reads the entries', async () => {
    const user = userEvent.setup()
    const first = await openActualsOverDouble()
    const { amrap, forTime, ladder, logging } = first
    const [swing, burpee, row] = amrap.exercises.map((exercise) => exercise.exerciseId)
    const [wallBall, plank] = forTime.exercises.map((exercise) => exercise.exerciseId)
    const [goblet] = ladder.exercises.map((exercise) => exercise.exerciseId)

    // The AMRAP: two rounds and 5 reps into the third; the swing's round-3
    // amount and load, the burpee an explicit zero, the row blank.
    await startAndFinishEarly(user, 300)
    await tap(user, count('Rounds completed', amrapCardOf()).plus, 2)
    await tap(user, count('Reps into the next round', amrapCardOf()).plus, 5)
    const amrapLog = log(amrapCardOf())
    await type(user, amountOf(amrapLog, 'kettlebell swing'), '7')
    await type(user, weightOf(amrapLog, 'kettlebell swing'), '20')
    await type(user, amountOf(amrapLog, 'burpee'), '0')
    // The For Time: Incomplete, the wall ball's round-1 amount and load, the
    // plank's seconds, and an effort face.
    await finishForTimeAfter(user, 120, forTimeCardOf())
    await choose(user, forTimeCardOf(), 'Incomplete')
    const forTimeLog = log(forTimeCardOf())
    await type(user, amountOf(forTimeLog, 'wall ball'), '28')
    await type(user, weightOf(forTimeLog, 'wall ball'), '8')
    await type(user, amountOf(forTimeLog, 'plank'), '45')
    await answer(user, effortOf(forTimeLog), 'Too hard')
    // The ladder: nothing typed, Complete after its cap by the athlete's word.
    await user.click(within(ladderCardOf()).getByRole('button', { name: 'Start ladder' }))
    advance(60)
    await user.click(within(ladderCardOf()).getByRole('button', { name: 'Finish' }))
    await choose(user, ladderCardOf(), 'Complete')

    // The first forward action: the AMRAP's row lands and its movement write
    // is refused. The athlete stays, with every entry and the dialog.
    logging.refuseNext('/block_movement_results', 503, 'POST')
    closeTimedLogs()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    const failed = await screen.findByRole('dialog')
    expect(failed).toHaveTextContent('That didn’t save')
    // TASK-046: each log reopened from its card keeps every entry.
    expect(amountOf(amrapCardOf(), 'kettlebell swing')).toHaveValue(7)
    expect(weightOf(amrapCardOf(), 'kettlebell swing')).toHaveValue(20)
    expect(amountOf(amrapCardOf(), 'burpee')).toHaveValue(0)
    expect(amountOf(forTimeCardOf(), 'wall ball')).toHaveValue(28)
    expect(chosen(effortOf(log(forTimeCardOf())))).toEqual(['Too hard'])
    expect(amountOf(amrapCardOf(), 'kettlebell swing')).toBeEnabled()
    closeTimedLogs()
    expect(logging.blockResults().map((saved) => saved.block_id)).toEqual([amrap.blockId])
    expect(logging.movementResults()).toEqual([])
    expect(within(amrapCardOf()).queryByText('Block saved')).toBeNull()

    // The retry: the AMRAP's row is restated through its unique key, never
    // inserted twice; its movement rows are written once; then the others.
    await user.click(within(failed).getByRole('button', { name: 'Try again' }))
    await screen.findByRole('heading', { name: ACTUALS_RACE_SECTION_TITLE })
    const rows = logging.blockResults()
    expect(rows.map((saved) => saved.block_id).sort()).toEqual([amrap.blockId, forTime.blockId, ladder.blockId].sort())
    expect(rows.find((saved) => saved.block_id === amrap.blockId)).toMatchObject({ rounds_completed: 2, partial_round_reps: 5, effort: null, perceived_effort: null })
    expect(rows.find((saved) => saved.block_id === forTime.blockId)).toMatchObject({ elapsed_seconds: 120, completed_under_cap: false, effort: 'too_hard', perceived_effort: null })
    expect(rows.find((saved) => saved.block_id === ladder.blockId)).toMatchObject({ highest_rung: ACTUALS_LADDER_ROUNDS, effort: null, perceived_effort: null })
    expect(requestsTo(logging, '/block_results', 'POST').map((request) => (request.body as Record<string, unknown>[])[0].block_id)).toEqual([amrap.blockId, amrap.blockId, forTime.blockId, ladder.blockId])
    expect(requestsTo(logging, '/block_results', 'PATCH')).toHaveLength(1)
    const movements = logging.movementResults()
    expect(movements.map((saved) => saved.workout_exercise_id).sort()).toEqual([swing, burpee, wallBall, plank].sort())
    expect(movements.find((saved) => saved.workout_exercise_id === swing)).toMatchObject({ round_number: 3, actual_reps: 7, actual_duration_seconds: null, actual_distance: null, weight: 20, weight_unit: 'kg' })
    expect(movements.find((saved) => saved.workout_exercise_id === burpee)).toMatchObject({ round_number: 3, actual_reps: 0, weight: null })
    expect(movements.find((saved) => saved.workout_exercise_id === wallBall)).toMatchObject({ round_number: 1, actual_reps: 28, weight: 8, weight_unit: 'kg' })
    expect(movements.find((saved) => saved.workout_exercise_id === plank)).toMatchObject({ round_number: 1, actual_reps: null, actual_duration_seconds: 45, weight: null })
    expect(movements.some((saved) => saved.workout_exercise_id === row || saved.workout_exercise_id === goblet)).toBe(false)
    // Written once each: one POST per entered movement that landed, plus the one refused.
    expect(requestsTo(logging, '/block_movement_results', 'POST')).toHaveLength(5)
    expect(requestsTo(logging, '/block_movement_results', 'PATCH')).toHaveLength(0)
    // No category anywhere near the numeric effort, and nothing written for the mood.
    for (const saved of rows) expect(saved.perceived_effort).toBeNull()

    // Back to the saved section: the fields keep their values and are no longer offered.
    closeTimedLogs()
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    await screen.findByRole('heading', { name: ACTUALS_SECTION_TITLE })
    expect(amountOf(log(amrapCardOf()), 'kettlebell swing')).toHaveValue(7)
    expect(amountOf(log(amrapCardOf()), 'kettlebell swing')).toBeDisabled()
    expect(weightOf(log(amrapCardOf()), 'kettlebell swing')).toBeDisabled()
    expect(amountOf(log(forTimeCardOf()), 'wall ball')).toHaveValue(28)
    expect(amountOf(log(forTimeCardOf()), 'wall ball')).toBeDisabled()
    expect(amountOf(log(forTimeCardOf()), 'plank')).toHaveValue(45)
    expect(within(amrapCardOf()).getByText('Block saved')).toBeInTheDocument()

    // A reload: the records keep the entries and the rows are known, so the
    // same values read back, still not offered; nothing is written again.
    const before = logging.requests.length
    first.view.unmount()
    const second = await openActuals({ blockResults: first.real.blockResults, sessions: { asPerformed: first.real.sessions.asPerformed } })
    await waitFor(() => expect(within(amrapCardOf()).getByText('Block saved')).toBeInTheDocument())
    expect(amountOf(log(amrapCardOf()), 'kettlebell swing')).toHaveValue(7)
    expect(amountOf(log(amrapCardOf()), 'kettlebell swing')).toBeDisabled()
    expect(amountOf(log(forTimeCardOf()), 'wall ball')).toHaveValue(28)
    expect(amountOf(log(forTimeCardOf()), 'wall ball')).toBeDisabled()
    expect(requestsTo(logging, '/block_results', 'POST').length + requestsTo(logging, '/block_movement_results', 'POST').length).toBe(9)
    expect(logging.requests.length).toBeGreaterThan(before)
    second.view.unmount()

    // History reads the entries, not the plan: each movement's round and amount, and the load.
    const performed = await first.real.sessions.asPerformed(first.snapshot.session.id)
    if (isErr(performed) || performed.value === null) throw new Error('no performed read')
    const detail = sessionDetail(performed.value)
    const blockView = (id: string) => detail.sections.flatMap((section) => section.blocks).find((block) => block.id === id)!
    expect(blockView(amrap.blockId).movementActuals.map(({ name, roundLabel, amount, weight }) => ({ name, roundLabel, amount, weight }))).toEqual([
      { name: 'kettlebell swing', roundLabel: 'Round 3', amount: '7 reps', weight: '20 kg' },
      { name: 'burpee', roundLabel: 'Round 3', amount: '0 reps', weight: null },
    ])
    expect(blockView(forTime.blockId).movementActuals.map(({ name, roundLabel, amount, weight }) => ({ name, roundLabel, amount, weight }))).toEqual([
      { name: 'wall ball', roundLabel: 'Round 1', amount: '28 reps', weight: '8 kg' },
      { name: 'plank', roundLabel: 'Round 1', amount: '45s', weight: null },
    ])
    expect(blockView(forTime.blockId).effort).toBe('too_hard')
    expect(blockView(ladder.blockId).movementActuals).toEqual([])
  }, HEAVY_MS)

  it('AC-R015-02 a save with no new per-movement data behaves exactly as today: a timed log with nothing typed and no effort sends the same bare insert, names no effort column, calls neither the correction nor the movement writer, and a later-typed load reaches the row through the same path', async () => {
    const user = userEvent.setup()
    const { amrap, forTime, logging, real } = await openActualsOverDouble()
    await startAndFinishEarly(user, 240)
    await tap(user, count('Rounds completed', amrapCardOf()).plus, 3)
    await tap(user, count('Reps into the next round', amrapCardOf()).plus, 4)
    // The fields are there and left alone: nothing typed, no effort chosen.
    expect(amountOf(log(amrapCardOf()), 'kettlebell swing')).toHaveValue(null)
    await finishForTimeAfter(user, 75, forTimeCardOf())
    const forTimeLog = log(forTimeCardOf())
    expect(chosen(completionOf(forTimeLog))).toEqual(['Complete'])
    expect(chosen(effortOf(forTimeLog))).toEqual([])

    closeTimedLogs()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await screen.findByRole('heading', { name: ACTUALS_RACE_SECTION_TITLE })
    // One insert per block — the shipped body, no effort key — and nothing else.
    const inserts = requestsTo(logging, '/block_results', 'POST')
    expect(inserts).toHaveLength(3)
    for (const request of inserts) {
      const [sent] = request.body as Record<string, unknown>[]
      expect(Object.keys(sent)).not.toContain('effort')
      expect(Object.keys(sent).sort()).toEqual(['block_id', 'completed_under_cap', 'elapsed_seconds', 'highest_rung', 'minutes_completed', 'notes', 'partial_round_reps', 'perceived_effort', 'rounds_completed'])
    }
    expect(requestsTo(logging, '/block_results', 'PATCH')).toHaveLength(0)
    expect(requestsTo(logging, '/block_movement_results')).toHaveLength(0)
    expect(logging.movementResults()).toEqual([])
    expect(logging.blockResults().find((saved) => saved.block_id === amrap.blockId)).toMatchObject({ rounds_completed: 3, partial_round_reps: 4, effort: null })
    expect(logging.blockResults().find((saved) => saved.block_id === forTime.blockId)).toMatchObject({ completed_under_cap: true, effort: null })

    // The multi-round race, with a load typed: the same path writes the row
    // and then its one load-only movement row.
    const raceCard = liveCard(ACTUALS_FOR_TIME_WORK_LIST)
    await user.click(within(raceCard).getByRole('button', { name: 'Start For Time' }))
    advance(200)
    await user.click(within(raceCard).getByRole('button', { name: 'Finish' }))
    await type(user, weightOf(log(raceCard), 'thruster'), '35')
    closeTimedLogs()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await screen.findByRole('heading', { name: ACTUALS_COOLDOWN_TITLE })
    expect(logging.movementResults()).toHaveLength(1)
    expect(logging.movementResults()[0]).toMatchObject({ round_number: null, actual_reps: null, weight: 35, weight_unit: 'kg' })
    expect(requestsTo(logging, '/block_results', 'PATCH')).toHaveLength(0)
    expect((await real.sessions.asPerformed(logging.session().id)).ok).toBe(true)
  }, HEAVY_MS)

  it('JOURNEY-015 the accepted amrap, for_time and ladder gallery states draw the route’s own per-movement partial and load fields over memory only: the AMRAP’s seeded round-4 entry and load beside its counts, the capped For Time’s round-1 entry, the finished one’s load alone, the ladder’s fields once a round is stated, nothing stored and no network', async () => {
    const user = userEvent.setup()
    const fetch = vi.spyOn(globalThis, 'fetch')

    // AMRAP: finished early with 3 rounds — round-4 amounts, the swing's
    // seeded 7 reps and 20 kg (not its prescribed 12 and 24); the cap with
    // nothing counted — the load field alone.
    render(
      <MemoryRouter initialEntries={['/gallery/refinements?state=amrap']}>
        <GalleryRefinements />
      </MemoryRouter>,
    )
    const early = document.querySelector<HTMLElement>('[data-gallery-amrap="early"]')!
    const earlyLog = log(liveCard(AMRAP_WORK_LIST, early))
    expect(movementGroups(earlyLog).map((group) => [group.name, ...group.fields])).toEqual([['kb swing', 'Completed in round 4', 'Weight used']])
    expect(amountOf(earlyLog, 'kb swing')).toHaveValue(7)
    expect(weightOf(earlyLog, 'kb swing')).toHaveValue(20)
    expect(shown('Reps into the next round', liveCard(AMRAP_WORK_LIST, early))).toBe('0')
    const capped = document.querySelector<HTMLElement>('[data-gallery-amrap="cap"]')!
    const cappedLog = log(liveCard(AMRAP_WORK_LIST, capped))
    expect(movementGroups(cappedLog).map((group) => [group.name, ...group.fields])).toEqual([['kb swing', 'Weight used']])
    // Live over memory: a count moves the round and clears the amount, keeping the load.
    await tap(user, count('Rounds completed', liveCard(AMRAP_WORK_LIST, early)).plus)
    expect(movementGroups(earlyLog)[0].fields[0]).toBe('Completed in round 5')
    expect(amountOf(earlyLog, 'kb swing')).toHaveValue(null)
    expect(weightOf(earlyLog, 'kb swing')).toHaveValue(20)
    expect(localStorage.getItem(WORKOUT_AMRAP_STORAGE_KEY)).toBeNull()

    // For Time: the cap (Incomplete) — the wall ball's seeded round-1 28 reps
    // and 8 kg (not 40 and 9), the burpee blank; the finish (Complete) — the
    // wall ball's load alone, blank.
    cleanup()
    render(
      <MemoryRouter initialEntries={['/gallery/refinements?state=for_time']}>
        <GalleryRefinements />
      </MemoryRouter>,
    )
    const capRace = document.querySelector<HTMLElement>('[data-gallery-race="for-time-cap"]')!
    const capLog = log(liveCard(FOR_TIME_WORK_LIST, capRace))
    expect(movementGroups(capLog).map((group) => [group.name, ...group.fields])).toEqual([['wall ball', 'Completed', 'Weight used'], ['burpee', 'Completed']])
    expect(amountOf(capLog, 'wall ball')).toHaveValue(28)
    expect(weightOf(capLog, 'wall ball')).toHaveValue(8)
    expect(amountOf(capLog, 'burpee')).toHaveValue(null)
    const finishRace = document.querySelector<HTMLElement>('[data-gallery-race="for-time-finish"]')!
    const finishLog = log(liveCard(FOR_TIME_WORK_LIST, finishRace))
    expect(movementGroups(finishLog).map((group) => [group.name, ...group.fields])).toEqual([['wall ball', 'Weight used']])
    expect(weightOf(finishLog, 'wall ball')).toHaveValue(null)
    expect(localStorage.getItem(WORKOUT_FOR_TIME_STORAGE_KEY)).toBeNull()

    // Ladder: Incomplete with no rung stated and bodyweight work — nothing to
    // ask; stating round 2 asks each movement's round-3 amount, bounded by
    // that rung's target, blank.
    cleanup()
    render(
      <MemoryRouter initialEntries={['/gallery/refinements?state=ladder']}>
        <GalleryRefinements />
      </MemoryRouter>,
    )
    const ladderFinish = document.querySelector<HTMLElement>('[data-gallery-race="ladder-finish"]')!
    const ladderLog = log(liveCard(LADDER_WORK_LIST, ladderFinish))
    expect(chosen(completionOf(ladderLog))).toEqual(['Incomplete'])
    expect(movementGroups(ladderLog)).toEqual([])
    await user.click(within(within(ladderLog).getByRole('group', { name: 'Rounds completed' })).getByRole('button', { name: /^Round 2: / }))
    expect(movementGroups(ladderLog).map((group) => [group.name, ...group.fields])).toEqual([['push up', 'Completed in round 3'], ['burpee', 'Completed in round 3']])
    expect(amountOf(ladderLog, 'push up')).toHaveValue(null)
    expect(amountOf(ladderLog, 'push up')).toHaveAttribute('max')
    await type(user, amountOf(ladderLog, 'push up'), '3')
    expect(amountOf(ladderLog, 'push up')).toHaveValue(3)
    expect(localStorage.getItem('clear.workout-ladders')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  }, HEAVY_MS)
})
