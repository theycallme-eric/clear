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
import { amrapOutcome, amrapShape, amrapView, clampAmrapState, type AmrapState } from '../state/amrap'
import { blockResultInsert, type BlockCompletion } from '../state/block-completion'
import { createError, err, ErrorCode, ok } from '../state/errors'
import type { BlockResultRow } from '../state/schemas'
import { readAmrapState, WORKOUT_AMRAP_STORAGE_KEY } from '../state/workout-persistence'
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
import { AppProviders, signedIn } from '../test/render'
import { FIXTURE_USER_ID } from '../test/user-data-double'
import { createWorkoutDouble, type WorkoutDoubleOptions } from '../test/workout-double'

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
