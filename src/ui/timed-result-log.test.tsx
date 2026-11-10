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
import { createError, err, ErrorCode, ok } from '../state/errors'
import { clampForTimeState, forTimeOutcome, forTimeShape, forTimeView, type ForTimeState } from '../state/for-time'
import { MOOD_SCALE } from '../state/mood'
import type { BlockResultRow, LadderTiming } from '../state/schemas'
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
import { AppProviders, signedIn } from '../test/render'
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

/** The AMRAP's log: the card's one form, headed "Log results" (not a landmark; see the owner). */
function queryLog(scope: HTMLElement = card()): HTMLElement | null {
  const forms = scope.querySelectorAll<HTMLElement>('form.clr-timed-log')
  expect(forms.length).toBeLessThanOrEqual(1)
  return forms[0] ?? null
}

function log(scope: HTMLElement = card()): HTMLElement {
  const found = queryLog(scope)
  if (found === null) throw new Error('the AMRAP has no log')
  expect(within(found).getByRole('heading', { name: 'Log results' })).toHaveClass('clr-timed-log__title')
  return found
}

/** One count's parts, by its label. */
function count(label: string, scope: HTMLElement = card()) {
  const group = within(scope).getByRole('group', { name: label })
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
    // of its readings before the log's title and both counts.
    advance(65)
    await user.click(within(card()).getByRole('button', { name: 'Finish early' }))
    expect(within(card()).getByText('01:35 on the clock')).toBeInTheDocument()
    const form = log()
    const title = within(form).getByRole('heading', { name: 'Log results' })
    expect(follows(form, list)).toBe(true)
    expect(list.contains(form)).toBe(false)
    for (const reading of card().querySelectorAll('[data-movement-identity]')) {
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
    const capped = log()
    expect(follows(capped, within(card()).getByRole('list', { name: AMRAP_WORK_LIST }))).toBe(true)
  })

  it('AC-C26-01 AMRAP rounds and the partial round are one result group under the simple log hierarchy: one Log results title, labels before their counts, no Result, Movements or Feedback group titles', async () => {
    const user = userEvent.setup()
    await openWorkout()
    await startAndFinishEarly(user, 95)

    const form = log()
    expect(form.tagName).toBe('FORM')
    // Unnamed inline, so never a duplicate landmark when a section holds two AMRAPs.
    expect(form).not.toHaveAttribute('aria-label')
    expect(form).not.toHaveAttribute('aria-labelledby')
    expect(within(card()).queryByRole('form')).toBeNull()
    expect(form.dataset.logHierarchy).toBe('simple')
    expect(form.dataset.timedFormat).toBe('amrap')
    expect(card().querySelectorAll('form')).toHaveLength(1)

    // One title, at the level of the card's other group ("Each round:") — the
    // log is the work's sibling in the outline, not part of it.
    const headings = within(form).getAllByRole('heading')
    expect(headings.map((heading) => heading.textContent)).toEqual(['Log results'])
    const title = headings[0]
    expect(title).toHaveClass('clr-timed-log__title')
    const round = within(card()).getByRole('heading', { name: 'Each round:' })
    expect(title.tagName).toBe(round.tagName)
    for (const retired of ['Result', 'Movements', 'Feedback', 'Your score']) {
      expect(within(form).queryByText(retired, { exact: true })).toBeNull()
    }

    // One group holds both counts, rounds first; each label precedes its frame.
    const groups = form.querySelectorAll<HTMLElement>('.clr-timed-log__group')
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
      const form = log(live)
      expect(follows(form, list)).toBe(true)
      expect(form.dataset.logHierarchy).toBe('simple')
      expect(form.querySelectorAll('.clr-quantity')).toHaveLength(2)
      expectNoResetControls(live)
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
      // One title and no group titles; the question and the effort in two groups.
      expect(within(form).getAllByRole('heading').map((heading) => heading.textContent)).toEqual(['Log results'])
      const groups = form.querySelectorAll<HTMLElement>('.clr-timed-log__group')
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
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await screen.findByRole('heading', { name: RESULTS_COOLDOWN_TITLE })
    expect(recordedOutcome(second.double, second.forTime.blockId).outcome).toEqual({ elapsedSeconds: FOR_TIME_CAP_SECONDS, completedUnderCap: true })

    // Stopping to record mid-race claims no completion — only the seconds.
    freshVisit()
    const third = await openResults()
    await user.click(within(forTimeCard()).getByRole('button', { name: 'Start For Time' }))
    advance(200)
    expect(queryLog(forTimeCard())).toBeNull()
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
    expect(within(ladderCard()).getByRole('list', { name: 'Ladder' })).toBeInTheDocument()

    // Finish with nothing tracked rung by rung: Incomplete, and how far is asked.
    await finishLadderAfter(user, 200)
    expect(chosen(completionOf(log(ladderCard())))).toEqual(['Incomplete'])
    const howFar = within(ladderCard()).getByRole('group', { name: 'How far did you get?' })
    expect(within(howFar).queryAllByRole('radio', { checked: true })).toEqual([])
    expect(within(ladderCard()).queryByText(/^Reached rung/)).toBeNull()
    await user.click(within(howFar).getByRole('radio', { name: '6 reps' }))
    expect(within(ladderCard()).getByText(`Reached rung 3 of ${LADDER_ROUNDS} — 6 reps`)).toBeInTheDocument()

    // Complete is the athlete's to say, and only then is every rung reached.
    await answer(user, completionOf(log(ladderCard())), 'Complete')
    expect(within(ladderCard()).queryByRole('group', { name: 'How far did you get?' })).toBeNull()
    expect(within(ladderCard()).getByText(`Reached rung ${LADDER_ROUNDS} of ${LADDER_ROUNDS} — 8 reps`)).toBeInTheDocument()
    // Back to Incomplete: the rung starts over rather than keeping a guess.
    await answer(user, completionOf(log(ladderCard())), 'Incomplete')
    expect(within(within(ladderCard()).getByRole('group', { name: 'How far did you get?' })).queryAllByRole('radio', { checked: true })).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await screen.findByRole('heading', { name: RESULTS_COOLDOWN_TITLE })
    expect(recordedOutcome(first.double, first.ladder.blockId).outcome).toEqual({})

    // The cap with nothing tracked: Incomplete, no rung.
    freshVisit()
    const second = await openResults()
    await user.click(within(ladderCard()).getByRole('button', { name: 'Start ladder' }))
    advance(LADDER_CAP + 5)
    await waitFor(() => expect(chosen(completionOf(log(ladderCard())))).toEqual(['Incomplete']))
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
    // athlete's Incomplete — never the clock's Complete. The ladder's answer is
    // a draft of its renderer (durable ladder drafts are TASK-032): it starts
    // again where its ended clock puts it, Incomplete, never at every rung.
    first.view.unmount()
    const second = await openResults()
    expect(within(forTimeCard().parentElement!.closest('.clr-stack')!).getByRole('timer', { name: 'Block time' })).toHaveTextContent('01:30')
    expect(chosen(completionOf(log(forTimeCard())))).toEqual(['Incomplete'])
    expect(chosen(completionOf(log(ladderCard())))).toEqual(['Incomplete'])
    await answer(user, completionOf(log(ladderCard())), 'Complete')

    // The save: one forward action writes both rows.
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
    // The ladder's draft left with its section, so it claims no answer at all
    // rather than a starting point the saved row contradicts (reading the
    // saved ladder result back is TASK-032 / TASK-048).
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
      expect(within(scope).queryByRole('button', { name: /^Clear effort/ })).toBeNull()
      // Three categories, not the session's five-choice feeling.
      expect(within(effort).getAllByRole('radio')).toHaveLength(SET_EFFORT_CHOICES.length)
      expect(within(effort).getAllByRole('radio')).not.toHaveLength(MOOD_SCALE.length)
      expect(within(scope).queryByRole('group', { name: 'How do you feel?' })).toBeNull()
      // No number anywhere: no slider, no spin button, no digit in the question.
      expect(within(scope).queryByRole('slider')).toBeNull()
      expect(within(scope).queryByRole('spinbutton')).toBeNull()
      expect(effort.textContent).not.toMatch(/\d/)
    }

    // Answered, then cleared back to unanswered — and focus stays in the question.
    await answer(user, effortOf(log(forTimeCard())), 'Too hard')
    expect(chosen(effortOf(log(forTimeCard())))).toEqual(['Too hard'])
    await user.click(within(forTimeCard()).getByRole('button', { name: 'Clear effort for this block' }))
    expect(chosen(effortOf(log(forTimeCard())))).toEqual([])
    expect(within(effortOf(log(forTimeCard()))).getAllByRole('radio')[0]).toHaveFocus()
    // Each block's effort is its own.
    await answer(user, effortOf(log(forTimeCard())), 'About right')
    await answer(user, effortOf(log(ladderCard())), 'Too easy')
    expect(chosen(effortOf(log(forTimeCard())))).toEqual(['About right'])
    expect(chosen(effortOf(log(ladderCard())))).toEqual(['Too easy'])

    // Saved: a category is never converted into the numeric 1–10 block effort,
    // and nothing is written as the session's mood.
    expect(storedRace(forTime.blockId)).not.toHaveProperty('effort')
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    await screen.findByRole('heading', { name: RESULTS_COOLDOWN_TITLE })
    for (const blockId of [forTime.blockId, ladder.blockId]) {
      const row = recordedOutcome(double, blockId)
      expect(row.perceivedEffort).toBeNull()
      expect(Object.keys(row.outcome)).not.toContain('effort')
      expect(blockResultInsert(row).perceived_effort).toBeNull()
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
    expect(within(forTimeCard()).getByRole('button', { name: 'Clear effort for this block' })).toHaveClass('clr-btn--quiet')
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
    expect(rows).toEqual([
      { blockId: forTime.blockId, outcome: { elapsedSeconds: 150, completedUnderCap: false }, perceivedEffort: null },
      { blockId: ladder.blockId, outcome: { highestRung: LADDER_ROUNDS }, perceivedEffort: null },
    ])
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
        const form = log(live)
        expect(follows(form, within(live).getByRole('list', { name: state.list }))).toBe(true)
        expect(chosen(completionOf(form))).toEqual([starts])
        expect(chosen(effortOf(form))).toEqual([])
        if (state.id === 'ladder') {
          // Nothing tracked: how far is asked, and no rung is claimed.
          expect(within(live).getByRole('group', { name: 'How far did you get?' })).toBeInTheDocument()
          expect(within(live).queryByText(/^Reached rung/)).toBeNull()
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
        expect(within(liveCard(state.list, finish)).getByText(/^Reached rung 4 of 4/)).toBeInTheDocument()
      }
    }
    expect(localStorage.getItem(WORKOUT_FOR_TIME_STORAGE_KEY)).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})
