/**
 * TASK-006 (REQ-006; C17, C18; G05; R39, R48, R66, R68, R98; AC-C17-01,
 * AC-C18-01, AC-R006-01, AC-R006-02; JOURNEY-006) — the timed
 * Start/Pause/Resume/Finish action hierarchy, through the shared lifecycle
 * owner (`TimedWorkoutActions`, `src/ui/timed-workout-flow.tsx`) and the
 * format controllers that compose it: `EmomBlock`, `AmrapBlock`,
 * `ForTimeBlock` and `LadderBlock`.
 *
 * JOURNEY-006's entry is the actual `/workout` route: the real router, guard
 * and shell over a running session whose last section holds an EMOM, an AMRAP,
 * a For Time and the accepted twelve-rung ladder (`timed-actions-fixture.ts`).
 * The wall clock is injected (`Date.now`), so pause arithmetic is read exactly.
 * The shared stylesheets are applied to the document, so the slot's declared
 * contract is read from the cascade; browser geometry is
 * `e2e/refinement/task-006.spec.ts`.
 *
 * Synthetic data only: in-memory doubles, no account and no network.
 *
 * TASK-011 (REQ-011; C31, C32; R40, R43, R44, R84; AC-C31-01, AC-C32-01,
 * AC-R011-01, AC-R011-02; JOURNEY-011) — the EMOM's schedule context and its
 * end log without a completion counter, through the EMOM owner (`EmomBlock`)
 * and the shared `TimedResultLog`'s EMOM family, on the same real `/workout`
 * route over its own fixture (`emom-end-log-fixture.ts`: the EMOM in the
 * first section, a cooldown after it, so `Next section` saves its row). Its
 * cases live in their own describe block, whose title carries "EMOM":
 * TASK-011's check-01 selects them with `--testNamePattern EMOM` (with
 * TASK-006's one EMOM-named case beside them, which must pass too).
 * TASK-006's check-01 runs this whole file.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { routes } from '../app/router'
import { GalleryRefinements } from '../dev/gallery-refinements'
import { LADDER_CAP_SECONDS, pushUpRungs } from '../dev/gallery-refinement-flow-data'
import {
  blockResultInsert,
  BlockCompletionContext,
  type BlockCompletion,
  type BlockCompletionApi,
  type BlockOutcome,
} from '../state/block-completion'
import { clampEmomState, emomShape, emomView, type EmomState } from '../state/emom'
import { createError, err, ErrorCode, ok } from '../state/errors'
import type { BlockResultRow } from '../state/schemas'
import { blockOutcome } from '../state/session-detail'
import {
  readEmomState,
  WORKOUT_AMRAP_STORAGE_KEY,
  WORKOUT_EMOM_STORAGE_KEY,
  WORKOUT_FOR_TIME_STORAGE_KEY,
  writeEmomState,
} from '../state/workout-persistence'
import { sessionProgress } from '../state/workout-progress'
import {
  COOLDOWN_SECTION_TITLE,
  EMOM_MINUTES,
  EMOM_MOVEMENTS,
  EMOM_NOTES_LABEL,
  EMOM_REST_SECONDS,
  EMOM_SECTION_TITLE,
  EMOM_WORK_LIST,
  RETIRED_CAPTIONS,
  emomEndLogAcceptance,
  emomEndLogBlock,
  emomEndLogSnapshot,
} from '../test/emom-end-log-fixture'
import {
  LONG_LADDER_ROUNDS,
  TIMED_FINISH,
  TIMED_FORMATS,
  TIMED_LISTS,
  TIMED_START,
  timedActionsAcceptance,
  timedActionsSnapshot,
  type TimedFormat,
} from '../test/timed-actions-fixture'
import { AppProviders, signedIn } from '../test/render'
import { FIXTURE_USER_ID } from '../test/user-data-double'
import { createWorkoutDouble, snapshotFixture, type BlockFixture, type WorkoutDoubleOptions } from '../test/workout-double'
import { BlockSlot } from './block-renderers'
import { finishLabel } from '../state/timed-lifecycle'
import { TimedWorkoutActions } from './timed-workout-flow'

const ROOT = resolve(import.meta.dirname, '../..')
const PRESENTATION_CSS = readFileSync(resolve(ROOT, 'src/ui/refinements/presentation.css'), 'utf8')

beforeAll(() => {
  for (const file of ['src/ui/refinements/tokens.css', 'src/ui/refinements/presentation.css']) {
    const style = document.createElement('style')
    style.dataset.task006 = file
    style.textContent = readFileSync(resolve(ROOT, file), 'utf8')
    document.head.append(style)
  }
})

let clock = Date.parse('2026-11-09T09:00:00.000Z')

beforeEach(() => {
  localStorage.clear()
  clock = Date.parse('2026-11-09T09:00:00.000Z')
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

/** JOURNEY-006's entry: `/workout`, the session running for one minute. */
async function openWorkout() {
  const acceptance = timedActionsAcceptance()
  const running = timedActionsSnapshot(acceptance, {
    userId: FIXTURE_USER_ID,
    startedAt: new Date(clock - 60_000).toISOString(),
  })
  const double = createWorkoutDouble({ session: running })
  const router = createMemoryRouter(routes, { initialEntries: ['/', '/workout'], initialIndex: 1 })
  const view = render(
    <AppProviders {...signedIn({ workout: double.clients })}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  await screen.findByRole('navigation', { name: 'Workout sections' })
  await screen.findByRole('list', { name: TIMED_LISTS.ladder })
  return { double, router, view }
}

/** One format's card: the live card holding that format's work. */
function cardOf(format: TimedFormat): HTMLElement {
  const list = screen.getByRole('list', { name: TIMED_LISTS[format] })
  const card = list.closest<HTMLElement>('[data-workout-card="workout"]')
  if (card === null) throw new Error(`${format} has no live card`)
  return card
}

/** The block's stack: its clock, beside its card. */
function blockOf(format: TimedFormat): HTMLElement {
  return cardOf(format).parentElement!.closest<HTMLElement>('.clr-stack')!
}

function actionsOf(format: TimedFormat): HTMLElement | null {
  return cardOf(format).querySelector<HTMLElement>('[data-timed-actions]')
}

type Variant = 'primary' | 'secondary' | 'quiet' | 'critical'

function variantOf(button: HTMLElement): Variant {
  if (button.classList.contains('clr-btn--primary')) return 'primary'
  if (button.classList.contains('clr-btn--quiet')) return 'quiet'
  if (button.classList.contains('clr-btn--critical')) return 'critical'
  return 'secondary'
}

/** The row's controls, in reading order, by name and hierarchy. */
function controls(format: TimedFormat): [string, Variant][] {
  const row = actionsOf(format)
  if (row === null) return []
  return within(row).queryAllByRole('button').map((button) => [button.textContent ?? '', variantOf(button)])
}

function button(format: TimedFormat, name: string): HTMLElement {
  return within(cardOf(format)).getByRole('button', { name })
}

/** `a` comes after `b` in the document. */
function follows(a: Node, b: Node): boolean {
  return (b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

function sessionTime(): string {
  return screen.getByRole('timer', { name: 'Session time' }).textContent ?? ''
}

function blockTime(format: TimedFormat): string {
  return within(blockOf(format)).getByRole('timer').textContent ?? ''
}

/** The words a For Time-style clock states its phase in: its card's one status line. */
function clockStatus(format: TimedFormat): HTMLElement {
  const clockCard = within(blockOf(format)).getByRole('timer').closest<HTMLElement>('.clr-card')!
  return within(clockCard).getByRole('status')
}

function stored(key: string): Record<string, Record<string, unknown>> {
  return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, Record<string, unknown>>
}

const BLOCK_IDS = () => sessionProgress(
  timedActionsSnapshot(timedActionsAcceptance(), { userId: FIXTURE_USER_ID, startedAt: new Date(clock).toISOString() }),
).sections[0].blocks.map((block) => block.blockId)

/** The declared body of one rule in the shared presentation stylesheet. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(PRESENTATION_CSS.replaceAll(/\/\*[\s\S]*?\*\//g, ''))?.[1] ?? ''
}

// ─────────────────────────────────────────────────────────────────────────────

describe('TASK-006 timed Start/Pause/Resume/Finish action hierarchy', () => {
  it('AC-R006-01 EMOM and AMRAP Start follows the work and prescription and precedes coaching on the real /workout route', async () => {
    await openWorkout()

    for (const format of ['emom', 'amrap'] as const) {
      const card = cardOf(format)
      const row = actionsOf(format)!
      expect(row, `${format}: one action slot`).not.toBeNull()
      expect(card.querySelectorAll('[data-timed-actions]')).toHaveLength(1)
      expect(row.dataset.timedActions).toBe('after-work')
      expect(controls(format)).toEqual([[TIMED_START[format], 'primary']])

      // After the work and its prescription: every movement, every reading.
      const list = within(card).getByRole('list', { name: TIMED_LISTS[format] })
      expect(follows(row, list), `${format}: after the movements`).toBe(true)
      expect(list.contains(row)).toBe(false)
      for (const reading of card.querySelectorAll('[data-movement-identity]')) {
        if (row.contains(reading)) continue
        expect(follows(row, reading), `${format}: after every prescription`).toBe(true)
      }
      // Before coaching: the card's one Coaching and notes disclosure is last.
      const coaching = card.querySelector('[data-coaching-group]')!
      expect(coaching).not.toBeNull()
      expect(follows(coaching, row), `${format}: before coaching`).toBe(true)
      expect(card.lastElementChild).toBe(coaching)
    }

    // The EMOM's rest inside each minute is part of its prescription: Start follows it too.
    const rest = within(cardOf('emom')).getByText('15s rest at the end of each minute')
    expect(follows(actionsOf('emom')!, rest)).toBe(true)
    // The AMRAP's round is its prescription: Start follows the whole round.
    const round = within(cardOf('amrap')).getByText('Each round:').closest('.clr-card')!
    expect(follows(actionsOf('amrap')!, round)).toBe(true)

    // Running, the same slot holds the running controls: still after the work, before coaching.
    const user = userEvent.setup()
    for (const format of ['emom', 'amrap'] as const) {
      await user.click(button(format, TIMED_START[format]))
      const row = actionsOf(format)!
      expect(controls(format).map(([name]) => name)).toEqual(['Pause', TIMED_FINISH[format]])
      expect(follows(row, within(cardOf(format)).getByRole('list', { name: TIMED_LISTS[format] }))).toBe(true)
      expect(follows(cardOf(format).querySelector('[data-coaching-group]')!, row)).toBe(true)
    }
  })

  it('AC-R006-01 the long ladder keeps its Start near the top, after its identity and cap and before the repetitive rounds, with no second Start', async () => {
    await openWorkout()
    const card = cardOf('ladder')
    const row = actionsOf('ladder')!
    expect(row.dataset.timedActions).toBe('top')
    expect(controls('ladder')).toEqual([[TIMED_START.ladder, 'primary']])

    // After the identity and the cap: the header (badge, cap and scheme) and
    // the timing line that restates the one cap on the whole ladder.
    const header = card.querySelector<HTMLElement>(':scope > [data-movement-group-header]')!
    expect(header.querySelector('[data-structure-meta]')?.textContent).toBe('7 MIN CAP · LADDER UP')
    expect(follows(row, header)).toBe(true)
    const timing = within(card).getByText(`${LONG_LADDER_ROUNDS} rounds · 07:00 cap on the whole ladder`)
    expect(follows(row, timing)).toBe(true)

    // Before the prescription it would otherwise sit under: the rung row and
    // every one of the twelve rounds.
    const rounds = within(card).getByRole('list', { name: TIMED_LISTS.ladder })
    expect(within(rounds).getAllByRole('listitem')).toHaveLength(LONG_LADDER_ROUNDS)
    expect(follows(rounds, row)).toBe(true)
    // TASK-012 (C35, R95): the prescription is the compact one — its summary,
    // then the rounds — and no read-only rung row repeats it before an answer.
    expect(follows(within(card).getByRole('list', { name: 'Movements in this ladder' }), row)).toBe(true)
    expect(within(card).queryByRole('list', { name: 'Ladder' })).toBeNull()
    // Nothing of the work sits between the cap and the Start.
    const before = [...card.querySelectorAll('ul, ol, [data-movement-identity]')].filter((node) => follows(row, node))
    expect(before).toEqual([])

    // One Start, in the one slot: no duplicate, nothing sticky or pinned.
    expect(screen.getAllByRole('button', { name: TIMED_START.ladder })).toHaveLength(1)
    expect(['sticky', 'fixed']).not.toContain(getComputedStyle(row).position)

    // Running, the same top slot holds Pause and Finish; the work follows them.
    const user = userEvent.setup()
    await user.click(button('ladder', TIMED_START.ladder))
    expect(controls('ladder')).toEqual([['Pause', 'secondary'], ['Finish', 'primary']])
    expect(follows(rounds, actionsOf('ladder')!)).toBe(true)
    expect(screen.queryAllByRole('button', { name: TIMED_START.ladder })).toHaveLength(0)
  })

  it('AC-C17-01 every timed action row is the shared responsive full-width slot, after the work and before coaching, and the ladder alone takes the top slot', async () => {
    await openWorkout()

    // The shared recipe (accepted reference `.clr-timed-actions`): one grid
    // row whose cells share the card's width equally, each control filling
    // its cell — a lone Start fills the row, a running pair splits it.
    expect(rule('.clr-timed-actions')).toMatch(/display:\s*grid/)
    expect(rule('.clr-timed-actions')).toMatch(/grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(0,\s*1fr\)\)/)
    expect(rule('.clr-timed-actions')).toMatch(/gap:\s*var\(--spacing-300\)/)
    expect(PRESENTATION_CSS).toMatch(/\.clr-timed-actions > \.clr-bleed,\s*\.clr-timed-actions button\s*\{[^}]*width:\s*100%/)
    expect(PRESENTATION_CSS).not.toMatch(/\.clr-timed-actions[^{]*\{[^}]*\d+px/)

    for (const format of TIMED_FORMATS) {
      const row = actionsOf(format)!
      expect(row, `${format}: the shared slot`).toHaveClass('clr-timed-actions')
      expect(getComputedStyle(row).display).toBe('grid')
      // Only the shared design-system buttons, each in its own cell.
      for (const control of within(row).getAllByRole('button')) {
        expect(control).toHaveClass('clr-btn')
        expect(control.parentElement).toHaveClass('clr-bleed')
        expect(control.parentElement!.parentElement).toBe(row)
      }
      const coaching = cardOf(format).querySelector('[data-coaching-group]')!
      expect(follows(coaching, row), `${format}: before coaching`).toBe(true)
      const list = within(cardOf(format)).getByRole('list', { name: TIMED_LISTS[format] })
      // After the work for every format but the ladder, whose Start is its exception.
      expect(follows(row, list), `${format}: placement`).toBe(format !== 'ladder')
      expect(row.dataset.timedActions).toBe(format === 'ladder' ? 'top' : 'after-work')
    }
    // For Time keeps its Start after its work: `The work:` and every movement.
    expect(follows(actionsOf('for_time')!, within(cardOf('for_time')).getByText('The work:'))).toBe(true)
  })

  it("AC-C18-01 running controls are a secondary Pause and the format's primary Finish or Finish early, and paused controls a secondary Resume in Pause's place", async () => {
    const user = userEvent.setup()
    await openWorkout()

    for (const format of TIMED_FORMATS) {
      expect(controls(format), `${format} ready`).toEqual([[TIMED_START[format], 'primary']])
      await user.click(button(format, TIMED_START[format]))
      expect(controls(format), `${format} running`).toEqual([['Pause', 'secondary'], [TIMED_FINISH[format], 'primary']])
      // The control under the pointer or keyboard becomes Pause, then Resume: focus is kept.
      expect(document.activeElement).toBe(button(format, 'Pause'))
      await user.click(button(format, 'Pause'))
      expect(controls(format), `${format} paused`).toEqual([['Resume', 'secondary'], [TIMED_FINISH[format], 'primary']])
      expect(document.activeElement).toBe(button(format, 'Resume'))
      await user.click(button(format, 'Resume'))
      expect(controls(format), `${format} resumed`).toEqual([['Pause', 'secondary'], [TIMED_FINISH[format], 'primary']])
    }
    // Pause and Resume are one control whose words change; nothing else moves.
    expect(within(cardOf('emom')).queryByRole('button', { name: 'Resume' })).toBeNull()

    // The selected wording is the format's own: a window with nothing left to
    // end early says Finish, as the AMRAP already did (R48, wording retained).
    expect(finishLabel('emom', true)).toBe('Finish early')
    expect(finishLabel('amrap', true)).toBe('Finish early')
    expect(finishLabel('emom', false)).toBe('Finish')
    expect(finishLabel('amrap', false)).toBe('Finish')
    expect(finishLabel('for_time', true)).toBe('Finish')
    expect(finishLabel('ladder', true)).toBe('Finish')
    cleanup()
    // A fresh device: the blocks below share the route's first block id.
    localStorage.clear()

    const completion: BlockCompletionApi = { reportOutcome: () => {}, isBlockRecorded: () => false }
    const open = (block: BlockFixture) => {
      const snapshot = snapshotFixture({ sections: [{ title: 'Finisher', sectionType: 'conditioning', blocks: [block] }] })
      return render(
        <BlockCompletionContext value={completion}>
          <BlockSlot block={sessionProgress(snapshot).sections[0].blocks[0]} />
        </BlockCompletionContext>,
      )
    }
    for (const [block, start] of [
      [{ structureType: 'amrap', timerType: 'countdown', timerSeconds: null }, 'Start AMRAP'],
      [{ structureType: 'emom', timerType: 'per_minute', timerSeconds: null }, 'Start EMOM'],
    ] as const) {
      open(block)
      await user.click(screen.getByRole('button', { name: start }))
      const row = document.querySelector<HTMLElement>('[data-timed-actions]')!
      expect(within(row).getAllByRole('button').map((control) => [control.textContent, variantOf(control)])).toEqual([
        ['Pause', 'secondary'], ['Finish', 'primary'],
      ])
      cleanup()
    }

    // The shared owner draws nothing once the attempt has ended, and nothing
    // the format does not offer: a schedule runs on with nothing to press.
    render(<TimedWorkoutActions phase="ended" startLabel="Start EMOM" finishLabel="Finish early" onStart={() => {}} />)
    expect(document.querySelector('[data-timed-actions]')).toBeNull()
    cleanup()
    render(<TimedWorkoutActions phase="running" startLabel="Start schedule" onStart={() => {}} placement="top" />)
    expect(document.querySelector('[data-timed-actions]')).toBeNull()
  })

  it('AC-C18-01 Pause freezes the section clock and its cap while the workout clock runs on, and Resume keeps the active time and the remaining window', async () => {
    const user = userEvent.setup()
    await openWorkout()
    expect(sessionTime()).toContain('01:00')

    // For Time: 30 seconds raced, then two paused minutes.
    await user.click(button('for_time', 'Start For Time'))
    advance(30)
    expect(blockTime('for_time')).toContain('00:30')
    expect(within(blockOf('for_time')).getByText('Cap in 14:30')).toBeInTheDocument()
    await user.click(button('for_time', 'Pause'))
    advance(120)
    expect(blockTime('for_time')).toContain('00:30')
    expect(within(blockOf('for_time')).getByText('Cap in 14:30')).toBeInTheDocument()
    expect(clockStatus('for_time')).toHaveTextContent('Paused')
    // The workout's own clock is not the section's: it ran on through the pause.
    expect(sessionTime()).toContain('03:30')
    const [, , forTimeId] = BLOCK_IDS()
    expect(stored(WORKOUT_FOR_TIME_STORAGE_KEY)[forTimeId].pausedAt).toBe(new Date(clock - 120_000).toISOString())
    await user.click(button('for_time', 'Resume'))
    advance(10)
    expect(blockTime('for_time')).toContain('00:40')
    expect(within(blockOf('for_time')).getByText('Cap in 14:20')).toBeInTheDocument()
    expect(stored(WORKOUT_FOR_TIME_STORAGE_KEY)[forTimeId].pausedAt).toBeUndefined()

    // AMRAP: the window left is frozen, then runs from where it stopped.
    await user.click(button('amrap', 'Start AMRAP'))
    advance(60)
    expect(blockTime('amrap')).toContain('07:00')
    await user.click(button('amrap', 'Pause'))
    advance(300)
    expect(blockTime('amrap')).toContain('07:00')
    expect(within(cardOf('amrap')).getByText('Paused')).toBeInTheDocument()
    await user.click(button('amrap', 'Resume'))
    advance(20)
    expect(blockTime('amrap')).toContain('06:40')

    // EMOM: the minute grid holds where it was paused — minute, phase and
    // seconds left — and moves on only once resumed.
    await user.click(button('emom', 'Start EMOM'))
    advance(50)
    const emom = within(cardOf('emom'))
    expect(emom.getByText('MIN 1 OF 10')).toBeInTheDocument()
    await user.click(button('emom', 'Pause'))
    advance(90)
    expect(emom.getByText('MIN 1 OF 10')).toBeInTheDocument()
    expect(emom.getByText('PAUSED')).toBeInTheDocument()
    expect(blockTime('emom')).toContain('00:10')
    await user.click(button('emom', 'Resume'))
    advance(15)
    expect(emom.getByText('MIN 2 OF 10')).toBeInTheDocument()
    expect(emom.queryByText('PAUSED')).toBeNull()

    // The ladder's clock: frozen while paused, against its one cap.
    await user.click(button('ladder', 'Start ladder'))
    advance(100)
    expect(blockTime('ladder')).toContain('01:40')
    await user.click(button('ladder', 'Pause'))
    advance(400)
    expect(blockTime('ladder')).toContain('01:40')
    expect(within(blockOf('ladder')).getByText(`Cap in ${'05:20'}`)).toBeInTheDocument()
    await user.click(button('ladder', 'Resume'))
    advance(20)
    expect(blockTime('ladder')).toContain('02:00')

    // Nothing paused or resumed wrote a result or touched the session.
    expect(sessionTime()).toContain('21:15')
  })

  it("AC-C18-01 Finish ends each format's attempt where it stands — a paused attempt at its pause — and records nothing the format did not already observe", async () => {
    const user = userEvent.setup()
    const { double } = await openWorkout()
    const [emomId, amrapId, forTimeId, ladderId] = BLOCK_IDS()

    // For Time, paused at 40 seconds and finished a minute later: 40 seconds.
    await user.click(button('for_time', 'Start For Time'))
    advance(40)
    await user.click(button('for_time', 'Pause'))
    advance(60)
    await user.click(button('for_time', 'Finish'))
    expect(blockTime('for_time')).toContain('00:40')
    expect(clockStatus('for_time')).toHaveTextContent('Finished under cap')
    expect(controls('for_time')).toEqual([])

    // AMRAP: Finish early settles the window at the time it was ended.
    await user.click(button('amrap', 'Start AMRAP'))
    advance(95)
    await user.click(button('amrap', 'Finish early'))
    expect(within(cardOf('amrap')).getByText(/01:35 on the clock/)).toBeInTheDocument()
    expect(controls('amrap')).toEqual([])

    // EMOM: Finish early stops the schedule where it is, and says so truthfully.
    await user.click(button('emom', 'Start EMOM'))
    advance(150)
    await user.click(button('emom', 'Finish early'))
    const emom = within(cardOf('emom'))
    expect(emom.getByText('Finished early, in minute 3 of 10. Continue when you are ready.')).toBeInTheDocument()
    expect(emom.queryByText(/The clock has run every prescribed minute/)).toBeNull()
    expect(controls('emom')).toEqual([])
    advance(600)
    expect(emom.queryByText(/The clock has run every prescribed minute/)).toBeNull()

    // Ladder: Finish stops its clock; how it ended is still the athlete's to say.
    // TASK-010 (C29; R78, R87, R124) supersedes the question's wording: the
    // shared log's Work completed, starting at Incomplete with no rung because
    // nothing was tracked — Finish alone never marks every rung.
    await user.click(button('ladder', 'Start ladder'))
    advance(200)
    await user.click(button('ladder', 'Finish'))
    expect(blockTime('ladder')).toContain('03:20')
    expect(controls('ladder')).toEqual([])
    expect(within(cardOf('ladder')).getByRole('group', { name: 'Work completed' })).toBeInTheDocument()

    // The section's forward action records what each block observed — and only that.
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))
    await waitFor(() => expect(double.recorded()).toHaveLength(4))
    const outcome = (id: string): BlockOutcome => double.recorded().find((row) => row.blockId === id)!.outcome
    expect(outcome(forTimeId)).toEqual({ elapsedSeconds: 40, completedUnderCap: true })
    expect(outcome(amrapId)).toEqual({ elapsedSeconds: 95 })
    // A scheduled minute is not performed work (E01), finished early or not.
    expect(outcome(emomId)).toEqual({})
    // An undeclared ladder ending records no rung; its clock records nothing.
    expect(outcome(ladderId)).toEqual({})
    expect(double.loggedSets()).toEqual([])
  })

  it("AC-R006-02 the section's Finish stays distinct from Finish workout: ending a block neither completes nor leaves the workout", async () => {
    const user = userEvent.setup()
    const { double, router } = await openWorkout()

    for (const format of TIMED_FORMATS) await user.click(button(format, TIMED_START[format]))

    // Two different actions with two different names, in two different places.
    const workoutFinish = screen.getByRole('button', { name: 'Finish workout' })
    const nav = screen.getByRole('navigation', { name: 'Workout sections' })
    expect(nav).toContainElement(workoutFinish)
    for (const format of TIMED_FORMATS) {
      const sectionFinish = button(format, TIMED_FINISH[format])
      expect(sectionFinish).not.toBe(workoutFinish)
      expect(nav).not.toContainElement(sectionFinish)
      expect(cardOf(format)).toContainElement(sectionFinish)
      expect(within(cardOf(format)).queryByRole('button', { name: 'Finish workout' })).toBeNull()
    }

    // Ending every block's attempt leaves the workout where it is.
    for (const format of TIMED_FORMATS) {
      advance(5)
      await user.click(button(format, TIMED_FINISH[format]))
    }
    expect(router.state.location.pathname).toBe('/workout')
    expect(double.recorded()).toEqual([])
    expect(double.completed()).toEqual([])
    expect(screen.getByRole('button', { name: 'Finish workout' })).toBeEnabled()

    // Finish workout is still the one action that saves and ends the workout.
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))
    await waitFor(() => expect(double.completed()).toHaveLength(1))
  })

  it('JOURNEY-006 recovery: a paused section comes back paused after close and reopen, and a reached cap offers no Resume', async () => {
    const user = userEvent.setup()
    const first = await openWorkout()
    await user.click(button('for_time', 'Start For Time'))
    await user.click(button('ladder', 'Start ladder'))
    await user.click(button('emom', 'Start EMOM'))
    advance(45)
    await user.click(button('for_time', 'Pause'))
    await user.click(button('emom', 'Pause'))
    const [emomId, , forTimeId] = BLOCK_IDS()
    expect(stored(WORKOUT_EMOM_STORAGE_KEY)[emomId].pausedAt).toBeDefined()

    // Close the app; ten minutes later, reopen it.
    first.view.unmount()
    clock += 600_000
    await openWorkout()
    expect(controls('for_time')).toEqual([['Resume', 'secondary'], ['Finish', 'primary']])
    expect(blockTime('for_time')).toContain('00:45')
    expect(controls('emom')).toEqual([['Resume', 'secondary'], ['Finish early', 'primary']])
    expect(within(cardOf('emom')).getByText('PAUSED')).toBeInTheDocument()
    // Nothing was stored for a block that was never started.
    expect(stored(WORKOUT_AMRAP_STORAGE_KEY)).toEqual({})
    await user.click(button('for_time', 'Resume'))
    advance(5)
    expect(blockTime('for_time')).toContain('00:50')
    expect(stored(WORKOUT_FOR_TIME_STORAGE_KEY)[forTimeId].pausedAt).toBeUndefined()

    // The ladder ran on through the close and reached its cap: no Resume, no
    // Pause, no Finish — and the clock says so in words.
    expect(controls('ladder')).toEqual([])
    expect(blockTime('ladder')).toContain(`0${LADDER_CAP_SECONDS / 60}:00`)
    expect(clockStatus('ladder')).toHaveTextContent('Cap reached')
    expect(within(cardOf('ladder')).queryByRole('button', { name: 'Resume' })).toBeNull()
  })

  it('JOURNEY-006 gallery ladder-4 and ladder-12 draw the actual ladder renderer with the top Start and the Pause/Finish hierarchy', async () => {
    const user = userEvent.setup()
    const fetch = vi.spyOn(globalThis, 'fetch')
    for (const rounds of [4, 12] as const) {
      render(
        <MemoryRouter initialEntries={[`/gallery/refinements?state=ladder-${rounds}`]}>
          <GalleryRefinements />
        </MemoryRouter>,
      )
      const state = document.querySelector<HTMLElement>(`[data-refinement-state="ladder-${rounds}"]`)!
      expect(state).not.toBeNull()
      expect(screen.getByRole('link', { name: `Live ladder · ${rounds} rounds` })).toHaveAttribute('aria-current', 'page')

      // The route's own long-ladder renderer: every round, its rung and the companion.
      const card = state.querySelector<HTMLElement>('[data-workout-card="workout"]')!
      const list = within(card).getByRole('list', { name: TIMED_LISTS.ladder })
      const items = within(list).getAllByRole('listitem')
      expect(items).toHaveLength(rounds)
      // TASK-012 (R72, AC-R012-02): the round's target in the ×/· notation.
      expect(within(items[rounds - 1]).getByText(`${pushUpRungs(rounds)[rounds - 1]} × push up`)).toBeInTheDocument()

      const row = card.querySelector<HTMLElement>('[data-timed-actions]')!
      expect(row).toHaveClass('clr-timed-actions')
      expect(row.dataset.timedActions).toBe('top')
      expect(follows(list, row)).toBe(true)
      await user.click(within(row).getByRole('button', { name: 'Start ladder' }))
      const running = card.querySelector<HTMLElement>('[data-timed-actions]')!
      expect(within(running).getAllByRole('button').map((control) => [control.textContent, variantOf(control)])).toEqual([
        ['Pause', 'secondary'], ['Finish', 'primary'],
      ])
      await user.click(within(running).getByRole('button', { name: 'Pause' }))
      expect(within(card.querySelector<HTMLElement>('[data-timed-actions]')!).getAllByRole('button').map((control) => control.textContent))
        .toEqual(['Resume', 'Finish'])
      // Memory-only: the route's storage keys are untouched.
      expect(localStorage.getItem(WORKOUT_FOR_TIME_STORAGE_KEY)).toBeNull()
      cleanup()
    }
    expect(fetch).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TASK-011 — the EMOM's schedule context and its end log (C31, C32)
// ─────────────────────────────────────────────────────────────────────────────

/** JOURNEY-011's session: started a minute before entry, the EMOM ready. */
const EMOM_SESSION = () =>
  emomEndLogSnapshot(emomEndLogAcceptance(), {
    userId: FIXTURE_USER_ID,
    startedAt: new Date(Date.parse('2026-11-09T09:00:00.000Z') - 60_000).toISOString(),
  })

/** JOURNEY-011's entry: `/workout`, the EMOM ready in the first section. */
async function openEmom(options: Omit<WorkoutDoubleOptions, 'session'> = {}, snapshot = EMOM_SESSION()) {
  const double = createWorkoutDouble({ session: snapshot, ...options })
  const router = createMemoryRouter(routes, { initialEntries: ['/', '/workout'], initialIndex: 1 })
  const view = render(
    <AppProviders {...signedIn({ workout: double.clients })}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  await screen.findByRole('navigation', { name: 'Workout sections' })
  await screen.findByRole('list', { name: EMOM_WORK_LIST })
  return { double, router, view, snapshot, block: emomEndLogBlock(snapshot) }
}

/** The EMOM's live card. */
function emomCard(scope: HTMLElement = document.body): HTMLElement {
  const found = within(scope).getByRole('list', { name: EMOM_WORK_LIST }).closest<HTMLElement>('[data-workout-card="workout"]')
  if (found === null) throw new Error('the EMOM has no live card')
  return found
}

/** The EMOM's stack: its minute countdown beside its card. */
function emomStack(scope?: HTMLElement): HTMLElement {
  return emomCard(scope).parentElement!.closest<HTMLElement>('.clr-stack')!
}

/** The minute's countdown, once the clock has started. */
function emomTime(scope?: HTMLElement): string {
  return within(emomStack(scope)).getByRole('timer').textContent ?? ''
}

/** The end log: the card's one form, headed "Log results". */
function queryEmomLog(scope?: HTMLElement): HTMLElement | null {
  const forms = emomCard(scope).querySelectorAll<HTMLElement>('form.clr-timed-log')
  expect(forms.length).toBeLessThanOrEqual(1)
  return forms[0] ?? null
}

function emomLog(scope?: HTMLElement): HTMLElement {
  const found = queryEmomLog(scope)
  if (found === null) throw new Error('the EMOM has no end log')
  return found
}

function notesField(scope?: HTMLElement): HTMLTextAreaElement {
  return within(emomLog(scope)).getByRole('textbox', { name: EMOM_NOTES_LABEL }) as HTMLTextAreaElement
}

/** The movements a marker word sits on — the frame's `Now` / `Next` — by heading. */
function emomMarked(word: 'Now' | 'Next', scope?: HTMLElement): string[] {
  const list = within(emomCard(scope)).getByRole('list', { name: EMOM_WORK_LIST })
  return [...list.querySelectorAll<HTMLElement>(':scope > li')]
    .filter((item) => [...item.children].some((child) => child.tagName === 'P' && child.textContent === word))
    .map((item) => within(item).getAllByRole('heading')[0].textContent ?? '')
}

function emomMovement(name: (typeof EMOM_MOVEMENTS)[number], scope?: HTMLElement) {
  const list = within(emomCard(scope)).getByRole('list', { name: EMOM_WORK_LIST })
  return within(within(list).getByRole('heading', { name }).closest('li')!)
}

/**
 * The card's minute line and the phase line under it, exactly as drawn: the
 * minute is always there; the phase line only when it says something more.
 */
function scheduleLines(scope?: HTMLElement): string[] {
  const minute = within(emomCard(scope)).getByText(/^MIN \d+( OF \d+)?$/)
  return [...minute.parentElement!.children].map((line) => line.textContent ?? '')
}

/** C32 / AC-R011-01: the annotated captions are drawn nowhere in the EMOM's block. */
function expectNoRetiredCaption(scope?: HTMLElement) {
  for (const caption of RETIRED_CAPTIONS) {
    expect(within(emomStack(scope)).queryByText(caption), caption).toBeNull()
  }
}

/** Every control or reading of a minutes tally or a completion question (C31). */
function expectNoTally(log: HTMLElement) {
  expect(log.querySelectorAll('output, .clr-quantity, [data-quantity-field], input[type="number"]')).toHaveLength(0)
  expect(within(log).queryByRole('spinbutton')).toBeNull()
  expect(within(log).queryByRole('slider')).toBeNull()
  expect(within(log).queryByRole('radiogroup')).toBeNull()
  expect(within(log).queryByRole('checkbox')).toBeNull()
  expect(within(log).queryByRole('button')).toBeNull()
  expect(within(log).queryByText(/minutes?|completed|complete|tally|count|confirm/i)).toBeNull()
  expect(log.querySelector('.clr-set-effort')).toBeNull()
}

/** The EMOM's stored grid, as the raw string the route wrote. */
function storedEmomRaw(): string | null {
  return localStorage.getItem(WORKOUT_EMOM_STORAGE_KEY)
}

/** Every column of the saved row a minutes tally or a timing could hide in. */
function resultRow(completion: BlockCompletion) {
  const row = blockResultInsert(completion)
  return {
    minutes_completed: row.minutes_completed,
    elapsed_seconds: row.elapsed_seconds,
    completed_under_cap: row.completed_under_cap,
    rounds_completed: row.rounds_completed,
    partial_round_reps: row.partial_round_reps,
    highest_rung: row.highest_rung,
    perceived_effort: row.perceived_effort,
    notes: row.notes,
  }
}

const NO_TALLY_ROW = {
  minutes_completed: null, elapsed_seconds: null, completed_under_cap: null, rounds_completed: null,
  partial_round_reps: null, highest_rung: null, perceived_effort: null,
}

/** History (`/history/:id`) over the same clients, as a later visit opens it. */
async function openHistory(double: ReturnType<typeof createWorkoutDouble>, sessionId: string) {
  const history = createMemoryRouter(routes, { initialEntries: ['/', `/history/${sessionId}`], initialIndex: 1 })
  render(
    <AppProviders {...signedIn({ workout: double.clients })}>
      <RouterProvider router={history} />
    </AppProviders>,
  )
  const badge = await screen.findByText(/^EMOM · 10 MIN$/)
  return badge.closest<HTMLElement>('[data-detail-block]')!
}

const EXCEPTION_NOTE = 'Dropped to 10 swings from minute 7.'
const EARLY_NOTE = 'Stopped in minute 3: shoulder.'

describe('TASK-011 EMOM schedule and end logging without a completion counter', () => {
  it('AC-R011-01 EMOM removes only the annotated Not started and Work captions on the real /workout route, keeping minute assignment, the rest transition and the actual clock state', async () => {
    const user = userEvent.setup()
    await openEmom()
    const [swing, burpee] = EMOM_MOVEMENTS

    // Ready: the minute ahead, the first movement Next, each movement's
    // minutes and the minute it opens — no NOT STARTED beside them.
    expect(scheduleLines()).toEqual(['MIN 1 OF 10'])
    expectNoRetiredCaption()
    expect(emomMarked('Next')).toEqual([swing])
    expect(emomMovement(swing).getByText('ODD MIN')).toBeInTheDocument()
    expect(emomMovement(burpee).getByText('EVEN MIN')).toBeInTheDocument()
    expect(emomMovement(swing).getByText('MIN 1 · 12 reps')).toBeInTheDocument()
    expect(emomMovement(burpee).getByText('MIN 2 · 10 reps')).toBeInTheDocument()
    expect(within(emomStack()).queryByRole('timer')).toBeNull()

    // Running, the work part of minute one: the minute and Now — no WORK.
    await user.click(within(emomCard()).getByRole('button', { name: 'Start EMOM' }))
    expect(scheduleLines()).toEqual(['MIN 1 OF 10'])
    expect(emomMarked('Now')).toEqual([swing])
    expect(emomTime()).toContain('01:00')
    expectNoRetiredCaption()
    advance(60 - EMOM_REST_SECONDS - 1)
    expect(scheduleLines()).toEqual(['MIN 1 OF 10'])
    expect(emomMarked('Now')).toEqual([swing])
    expect(emomTime()).toContain('00:16')

    // The transition into the minute's rest keeps its word and looks ahead.
    advance(1)
    expect(scheduleLines()).toEqual(['MIN 1 OF 10', 'REST'])
    expect(emomMarked('Next')).toEqual([burpee])
    expect(emomMarked('Now')).toEqual([])
    expect(emomTime()).toContain('00:15')

    // The boundary flips the work: minute two is the burpee's, with no caption.
    advance(EMOM_REST_SECONDS)
    expect(scheduleLines()).toEqual(['MIN 2 OF 10'])
    expect(emomMarked('Now')).toEqual([burpee])
    expect(emomMovement(swing).getByText('MIN 3 · 12 reps')).toBeInTheDocument()
    expectNoRetiredCaption()

    // The actual clock state stays in words: PAUSED holds the minute and its time.
    advance(10)
    await user.click(within(emomCard()).getByRole('button', { name: 'Pause' }))
    advance(90)
    expect(scheduleLines()).toEqual(['MIN 2 OF 10', 'PAUSED'])
    expect(emomTime()).toContain('00:50')
    await user.click(within(emomCard()).getByRole('button', { name: 'Resume' }))
    expect(scheduleLines()).toEqual(['MIN 2 OF 10'])
    expect(emomMarked('Now')).toEqual([burpee])

    // FINISHED EARLY in the minute it stopped.
    await user.click(within(emomCard()).getByRole('button', { name: 'Finish early' }))
    expect(scheduleLines()).toEqual(['MIN 2 OF 10', 'FINISHED EARLY'])
    expectNoRetiredCaption()

    // The rule itself: only the two annotated captions went, nothing else.
    const source = readFileSync(resolve(ROOT, 'src/ui/emom-block.tsx'), 'utf8')
    expect(source).toMatch(/ready: null,\s*work: null,\s*rest: 'REST',\s*finished: 'COMPLETE'/)
  })

  it('AC-C32-01 EMOM minute progress and Now/Next stay clear across every boundary, a background and a reload, with no phase caption repeating them', async () => {
    const user = userEvent.setup()
    const first = await openEmom()
    await user.click(within(emomCard()).getByRole('button', { name: 'Start EMOM' }))

    // Every minute boundary to the last: the minute, the movement that minute
    // prescribes as Now, and the other's next turn as its target.
    for (let minute = 1; minute <= EMOM_MINUTES; minute += 1) {
      const now = EMOM_MOVEMENTS[(minute - 1) % 2]
      const other = EMOM_MOVEMENTS[minute % 2]
      expect(scheduleLines(), `minute ${minute}`).toEqual([`MIN ${minute} OF ${EMOM_MINUTES}`])
      expect(emomMarked('Now'), `minute ${minute}`).toEqual([now])
      expect(emomMarked('Next'), `minute ${minute}`).toEqual([])
      const ahead = minute + 1 <= EMOM_MINUTES ? `MIN ${minute + 1} · ` : null
      if (ahead !== null) expect(emomMovement(other).getByText(new RegExp(`^${ahead}`))).toBeInTheDocument()
      else expect(emomMovement(other).queryByText(/^MIN \d+ · /)).toBeNull()
      expectNoRetiredCaption()
      // Into the minute's rest: the next minute's movement is Next.
      advance(60 - EMOM_REST_SECONDS + 1)
      expect(scheduleLines()).toEqual([`MIN ${minute} OF ${EMOM_MINUTES}`, 'REST'])
      expect(emomMarked('Next')).toEqual(minute < EMOM_MINUTES ? [other] : [])
      if (minute < EMOM_MINUTES) advance(EMOM_REST_SECONDS - 1)
    }
    // The last minute's rest runs out: the schedule ends, COMPLETE, nothing live.
    advance(EMOM_REST_SECONDS)
    expect(scheduleLines()).toEqual([`MIN ${EMOM_MINUTES} OF ${EMOM_MINUTES}`, 'COMPLETE'])
    expect(emomMarked('Now')).toEqual([])
    expect(emomTime()).toContain('00:00')

    // A fresh EMOM: backgrounded across boundaries, then reloaded mid-minute.
    first.view.unmount()
    localStorage.clear()
    clock = Date.parse('2026-11-09T09:00:00.000Z')
    const second = await openEmom()
    await user.click(within(emomCard()).getByRole('button', { name: 'Start EMOM' }))
    advance(125)
    expect(scheduleLines()).toEqual(['MIN 3 OF 10'])
    expect(emomMarked('Now')).toEqual([EMOM_MOVEMENTS[0]])
    expect(emomTime()).toContain('00:55')
    second.view.unmount()
    advance(40)
    await openEmom({}, second.snapshot)
    expect(scheduleLines()).toEqual(['MIN 3 OF 10', 'REST'])
    expect(emomMarked('Next')).toEqual([EMOM_MOVEMENTS[1]])
    expect(emomTime()).toContain('00:15')
    expectNoRetiredCaption()
  })

  it('AC-C31-01 EMOM end log omits any minutes-completed counter or completion question, assumes the schedule and accepts notes for exceptions', async () => {
    const user = userEvent.setup()
    const { block } = await openEmom()

    // Ready, running and paused: nothing to log yet.
    expect(queryEmomLog()).toBeNull()
    await user.click(within(emomCard()).getByRole('button', { name: 'Start EMOM' }))
    advance(30)
    expect(queryEmomLog()).toBeNull()
    await user.click(within(emomCard()).getByRole('button', { name: 'Pause' }))
    expect(queryEmomLog()).toBeNull()
    await user.click(within(emomCard()).getByRole('button', { name: 'Resume' }))

    // Every prescribed minute runs: the schedule ends, and its log opens.
    advance(EMOM_MINUTES * 60)
    expect(scheduleLines()).toEqual(['MIN 10 OF 10', 'COMPLETE'])
    const log = emomLog()
    expect(log.dataset.timedFormat).toBe('emom')
    expect(log.dataset.logHierarchy).toBe('simple')
    // R43: the log replaces the closing sentence that only said it was done.
    expect(within(emomCard()).queryByText(/The clock has run every prescribed minute/)).toBeNull()

    // After the work and its prescription, before the card's coaching.
    const list = within(emomCard()).getByRole('list', { name: EMOM_WORK_LIST })
    expect(follows(log, list)).toBe(true)
    expect(follows(log, within(emomCard()).getByText(`${EMOM_REST_SECONDS}s rest at the end of each minute`))).toBe(true)
    const coaching = emomCard().querySelector('[data-coaching-group]')!
    expect(follows(coaching, log)).toBe(true)
    expect(emomCard().lastElementChild).toBe(coaching)

    // One title, one group, one field: the optional notes. No counter, no
    // completion question, no confirmation step, no effort here.
    expect(within(log).getAllByRole('heading').map((heading) => heading.textContent)).toEqual(['Log results'])
    const groups = log.querySelectorAll('.clr-timed-log__group')
    expect(groups).toHaveLength(1)
    const fields = log.querySelectorAll('input, textarea, select, output')
    expect(fields).toHaveLength(1)
    expect(fields[0]).toBe(notesField())
    expect(notesField().tagName).toBe('TEXTAREA')
    expect(notesField()).toHaveValue('')
    expect(notesField()).not.toBeRequired()
    expectNoTally(log)
    expect(within(emomCard()).queryByRole('group', { name: 'Work completed' })).toBeNull()

    // Notes for an exception: written, and nothing else moves — the clock's
    // record is the same string, and no new key or field is stored.
    const keys = Object.keys(localStorage).sort()
    const grid = storedEmomRaw()
    await user.type(notesField(), EXCEPTION_NOTE)
    expect(notesField()).toHaveValue(EXCEPTION_NOTE)
    expect(storedEmomRaw()).toBe(grid)
    expect(Object.keys(localStorage).sort()).toEqual(keys)
    expect(readEmomState(localStorage, block.blockId)).toEqual({
      startedAt: new Date(Date.parse('2026-11-09T09:00:00.000Z')).toISOString(),
      workDoneMinute: null,
    })
    expect(scheduleLines()).toEqual(['MIN 10 OF 10', 'COMPLETE'])

    // Enter in the log submits nothing and navigates nowhere.
    const submitted = new Event('submit', { bubbles: true, cancelable: true })
    log.dispatchEvent(submitted)
    expect(submitted.defaultPrevented).toBe(true)
  })

  it('AC-R011-02 EMOM end logging assumes the schedule end to end: no minutes tally in the saved row, the exception note in the block’s existing notes, the actual timing untouched, and History reads it back', async () => {
    const user = userEvent.setup()
    const { double, block, snapshot, view } = await openEmom()
    await user.click(within(emomCard()).getByRole('button', { name: 'Start EMOM' }))
    advance(EMOM_MINUTES * 60 + 30)
    const grid = storedEmomRaw()
    await user.type(notesField(), EXCEPTION_NOTE)

    // The section's forward action saves the block: its note, and nothing counted.
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    expect(await screen.findByRole('heading', { name: COOLDOWN_SECTION_TITLE })).toBeInTheDocument()
    expect(double.recorded()).toEqual([{ blockId: block.blockId, outcome: { notes: EXCEPTION_NOTE }, perceivedEffort: null }])
    expect(resultRow(double.recorded()[0])).toEqual({ ...NO_TALLY_ROW, notes: EXCEPTION_NOTE })
    // The actual timing is the clock's own record, unchanged by the note or the save.
    expect(storedEmomRaw()).toBe(grid)

    // Back to the saved section: the schedule still reads as it ended; the log
    // has stepped aside (no correction writer), and the shell says it saved.
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(await screen.findByRole('heading', { name: EMOM_SECTION_TITLE })).toBeInTheDocument()
    expect(scheduleLines()).toEqual(['MIN 10 OF 10', 'COMPLETE'])
    expect(queryEmomLog()).toBeNull()
    expect(within(emomCard()).getByText('Block saved')).toBeInTheDocument()
    expect(double.recorded()).toHaveLength(1)

    // History reads the saved row back: the note, and no minutes reading.
    view.unmount()
    const detail = await openHistory(double, snapshot.session.id)
    expect(within(detail).getByText(EXCEPTION_NOTE)).toBeInTheDocument()
    expect(within(detail).queryByText('Minutes')).toBeNull()
    expect(within(detail).queryByText('Not scored')).toBeNull()
  })

  it('AC-R011-02 EMOM finished early or stopped before its last minute is never recorded as a completed full schedule and keeps its actual timing', async () => {
    const user = userEvent.setup()
    const first = await openEmom()
    const entry = Date.parse('2026-11-09T09:00:00.000Z')

    // Minute three, paused 130 seconds in, then ended early a while later: it
    // ends at its pause, in the minute it was in.
    await user.click(within(emomCard()).getByRole('button', { name: 'Start EMOM' }))
    advance(130)
    await user.click(within(emomCard()).getByRole('button', { name: 'Pause' }))
    advance(40)
    await user.click(within(emomCard()).getByRole('button', { name: 'Finish early' }))
    const stopped = { startedAt: new Date(entry).toISOString(), workDoneMinute: null, finishedAt: new Date(entry + 130_000).toISOString() }
    expect(readEmomState(localStorage, first.block.blockId)).toEqual(stopped)
    expect(scheduleLines()).toEqual(['MIN 3 OF 10', 'FINISHED EARLY'])
    expect(within(emomCard()).getByText('Finished early, in minute 3 of 10. Continue when you are ready.')).toBeInTheDocument()
    expect(within(emomStack()).queryByText('COMPLETE')).toBeNull()

    // The same counter-free log: nothing asks how many minutes, nothing claims all ten.
    const log = emomLog()
    expectNoTally(log)
    await user.type(notesField(), EARLY_NOTE)

    // The clock running on never turns an early end into a completed schedule.
    advance(EMOM_MINUTES * 60)
    expect(scheduleLines()).toEqual(['MIN 3 OF 10', 'FINISHED EARLY'])
    expect(readEmomState(localStorage, first.block.blockId)).toEqual(stopped)
    // The view the shell reads is the stop, not the window.
    const view = emomView(clampEmomState(stopped), emomShape(first.block), (clock - entry) / 1000)
    expect(view).toMatchObject({ phase: 'finished', endedEarly: true, minute: 3, minutes: 10 })

    // Close and reopen: the actual stop is restored, and the log is reachable.
    // Its note was this visit's draft, so it reads empty — what will be saved.
    first.view.unmount()
    const second = await openEmom({}, first.snapshot)
    expect(scheduleLines()).toEqual(['MIN 3 OF 10', 'FINISHED EARLY'])
    expect(notesField()).toHaveValue('')
    await user.type(notesField(), EARLY_NOTE)
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    expect(await screen.findByRole('heading', { name: COOLDOWN_SECTION_TITLE })).toBeInTheDocument()
    expect(second.double.recorded()).toEqual([{ blockId: second.block.blockId, outcome: { notes: EARLY_NOTE }, perceivedEffort: null }])
    expect(resultRow(second.double.recorded()[0])).toEqual({ ...NO_TALLY_ROW, notes: EARLY_NOTE })
    expect(readEmomState(localStorage, second.block.blockId)).toEqual(stopped)

    // History: the note, and no minutes reading — not "10 of 10", not "3 of 10".
    second.view.unmount()
    const detail = await openHistory(second.double, second.snapshot.session.id)
    expect(within(detail).getByText(EARLY_NOTE)).toBeInTheDocument()
    expect(within(detail).queryByText('Minutes')).toBeNull()
    expect(detail.textContent).not.toMatch(/\d+ of 10/)

    // Stopped before its last minute without Finish early: the section moved
    // on while the clock ran. No log opened, nothing is counted.
    cleanup()
    localStorage.clear()
    clock = entry
    const third = await openEmom()
    await user.click(within(emomCard()).getByRole('button', { name: 'Start EMOM' }))
    advance(200)
    expect(queryEmomLog()).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    expect(await screen.findByRole('heading', { name: COOLDOWN_SECTION_TITLE })).toBeInTheDocument()
    expect(third.double.recorded()).toEqual([{ blockId: third.block.blockId, outcome: {}, perceivedEffort: null }])
    expect(resultRow(third.double.recorded()[0])).toEqual({ ...NO_TALLY_ROW, notes: null })
    expect(readEmomState(localStorage, third.block.blockId)).toEqual({ startedAt: new Date(entry).toISOString(), workDoneMinute: null })
  })

  it('AC-R011-02 EMOM a failed save keeps the exception note on screen and the retry writes it once, unchanged', async () => {
    const user = userEvent.setup()
    const rows: BlockCompletion[] = []
    let refusing = true
    const record = vi.fn(async (completion: BlockCompletion) => {
      if (refusing) return err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))
      rows.push(completion)
      return ok({} as BlockResultRow)
    })
    const { block } = await openEmom({ blockResults: { record } })
    await user.click(within(emomCard()).getByRole('button', { name: 'Start EMOM' }))
    advance(EMOM_MINUTES * 60 + 5)
    const grid = storedEmomRaw()
    await user.type(notesField(), EXCEPTION_NOTE)

    await user.click(screen.getByRole('button', { name: 'Next section' }))
    const failed = await screen.findByRole('dialog')
    expect(failed).toHaveTextContent('That didn’t save')
    expect(record).toHaveBeenCalledTimes(1)
    expect(rows).toEqual([])
    // Nothing discarded and nothing filled in: the note, the ended schedule.
    expect(notesField()).toHaveValue(EXCEPTION_NOTE)
    expect(scheduleLines()).toEqual(['MIN 10 OF 10', 'COMPLETE'])
    expect(storedEmomRaw()).toBe(grid)

    refusing = false
    await user.click(within(failed).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: COOLDOWN_SECTION_TITLE })).toBeInTheDocument()
    expect(record).toHaveBeenCalledTimes(2)
    expect(record.mock.calls[0][0]).toEqual(record.mock.calls[1][0])
    expect(rows).toEqual([{ blockId: block.blockId, outcome: { notes: EXCEPTION_NOTE }, perceivedEffort: null }])
    expect(resultRow(rows[0])).toEqual({ ...NO_TALLY_ROW, notes: EXCEPTION_NOTE })
  })

  it('AC-R011-02 EMOM older stored records and older saved rows load and read exactly as before', async () => {
    const user = userEvent.setup()
    const entry = Date.parse('2026-11-09T09:00:00.000Z')
    const at = (seconds: number) => new Date(entry + seconds * 1000).toISOString()
    const block = emomEndLogBlock(EMOM_SESSION())

    // Records an earlier build wrote, read against the same moment: before
    // Pause existed, with the retired "Minute done" mark, TASK-006's paused and
    // ended-early stamps, and a window that expired while the tab was away.
    const older: { stored: EmomState; lines: string[]; log: boolean; time: string }[] = [
      { stored: { startedAt: at(-200), workDoneMinute: null }, lines: ['MIN 4 OF 10'], log: false, time: '00:40' },
      { stored: { startedAt: at(-190), workDoneMinute: 4 }, lines: ['MIN 4 OF 10'], log: false, time: '00:50' },
      { stored: { startedAt: at(-300), workDoneMinute: null, pausedAt: at(-250) }, lines: ['MIN 1 OF 10', 'PAUSED'], log: false, time: '00:10' },
      { stored: { startedAt: at(-300), workDoneMinute: null, finishedAt: at(-100) }, lines: ['MIN 4 OF 10', 'FINISHED EARLY'], log: true, time: '00:00' },
      { stored: { startedAt: at(-900), workDoneMinute: null }, lines: ['MIN 10 OF 10', 'COMPLETE'], log: true, time: '00:00' },
    ]
    for (const { stored, lines, log, time } of older) {
      writeEmomState(localStorage, block.blockId, stored)
      const raw = storedEmomRaw()
      const { double, view } = await openEmom()
      const label = JSON.stringify(stored)
      expect(scheduleLines(), label).toEqual(lines)
      expect(emomTime(), label).toContain(time)
      expect(queryEmomLog() !== null, label).toBe(log)
      // Loaded, not rewritten.
      expect(storedEmomRaw(), label).toBe(raw)
      // Saved as before: no note given, nothing counted — the same `{}` an older build saved.
      await user.click(screen.getByRole('button', { name: 'Next section' }))
      expect(await screen.findByRole('heading', { name: COOLDOWN_SECTION_TITLE })).toBeInTheDocument()
      expect(double.recorded().map((row) => row.outcome), label).toEqual([{}])
      view.unmount()
      localStorage.clear()
    }

    // Saved rows from before this change, minutes and all, read in History
    // exactly as they did: the History reading is unchanged, and so is the
    // row's mapping into it.
    const blockRow = emomEndLogSnapshot(emomEndLogAcceptance()).sections[0].blocks[0].block
    const row = (minutes: number | null, notes: string | null): BlockResultRow => ({
      id: '00000000-0000-4000-8000-000000000911', block_id: blockRow.id, elapsed_seconds: null,
      completed_under_cap: null, rounds_completed: null, partial_round_reps: null, minutes_completed: minutes,
      highest_rung: null, perceived_effort: null, notes, created_at: '2026-11-01T09:30:00+00:00',
    })
    expect(blockOutcome(blockRow, row(8, null))).toEqual([{ label: 'Minutes', value: '8 of 10' }])
    expect(blockOutcome(blockRow, row(10, null))).toEqual([{ label: 'Minutes', value: '10 of 10' }])
    expect(blockOutcome(blockRow, row(0, null))).toEqual([{ label: 'Minutes', value: '0 of 10' }])
    expect(blockOutcome(blockRow, row(null, null))).toEqual([])

    // And end to end: a row an earlier build wrote with eight minutes and a
    // note reads "Minutes 8 of 10" beside it, as it always did.
    const snapshot = EMOM_SESSION()
    const double = createWorkoutDouble({ session: snapshot })
    await double.clients.blockResults.record({ blockId: emomEndLogBlock(snapshot).blockId, outcome: { minutesCompleted: 8, notes: 'Older note' }, perceivedEffort: null })
    const detail = await openHistory(double, snapshot.session.id)
    expect(within(detail).getByText('Minutes').parentElement).toHaveTextContent(/^Minutes8 of 10$/)
    expect(within(detail).getByText('Older note')).toBeInTheDocument()
  })

  it('JOURNEY-011 EMOM gallery emom and cards states draw the actual route EmomBlock: the counter-free end log after every minute and after an early finish, and the ready card with its minute and Next and no caption', async () => {
    const user = userEvent.setup()
    const fetch = vi.spyOn(globalThis, 'fetch')

    // `?state=emom`: the accepted "EMOM results", the route's own block ended twice.
    render(
      <MemoryRouter initialEntries={['/gallery/refinements?state=emom']}>
        <GalleryRefinements />
      </MemoryRouter>,
    )
    const state = document.querySelector<HTMLElement>('[data-refinement-state="emom"]')!
    expect(state).not.toBeNull()
    expect(screen.getByRole('link', { name: 'EMOM results' })).toHaveAttribute('aria-current', 'page')
    const complete = state.querySelector<HTMLElement>('[data-gallery-emom="complete"]')!
    const early = state.querySelector<HTMLElement>('[data-gallery-emom="early"]')!
    expect(scheduleLines(complete)).toEqual(['MIN 10 OF 10', 'COMPLETE'])
    expect(scheduleLines(early)).toEqual(['MIN 4 OF 8', 'FINISHED EARLY'])
    expect(within(early).getByText('Finished early, in minute 4 of 8. Continue when you are ready.')).toBeInTheDocument()
    expect(within(complete).queryByText(/The clock has run every prescribed minute/)).toBeNull()
    for (const scope of [complete, early]) {
      const log = emomLog(scope)
      expect(log.dataset.timedFormat).toBe('emom')
      expectNoTally(log)
      expect(notesField(scope)).toHaveValue('')
      expectNoRetiredCaption(scope)
      expect(follows(log, within(emomCard(scope)).getByRole('list', { name: EMOM_WORK_LIST }))).toBe(true)
    }
    // Live over memory only: a note is written in place.
    await user.type(notesField(complete), 'Swings unbroken')
    expect(notesField(complete)).toHaveValue('Swings unbroken')
    expect(localStorage.getItem(WORKOUT_EMOM_STORAGE_KEY)).toBeNull()
    // The same owner the route draws, not a look-alike.
    const forms = readFileSync(resolve(ROOT, 'src/dev/gallery-refinement-forms.tsx'), 'utf8')
    expect(forms).toMatch(/import \{ EmomBlock \} from '\.\.\/ui\/emom-block'/)
    cleanup()

    // `?state=cards`, timed composition: the Workout context's EMOM is the
    // route's own block, ready — its minute, assignment and Next, no caption.
    render(
      <MemoryRouter initialEntries={['/gallery/refinements?state=cards']}>
        <GalleryRefinements />
      </MemoryRouter>,
    )
    const cards = document.querySelector<HTMLElement>('[data-refinement-state="cards"]')!
    await user.click(within(cards).getByRole('radio', { name: /EMOM, AMRAP and For Time/ }))
    const workout = cards.querySelector<HTMLElement>('[data-gallery-context="workout"]')!
    expect(scheduleLines(workout)).toEqual(['MIN 1 OF 10'])
    expectNoRetiredCaption(workout)
    expect(emomMarked('Next', workout)).toEqual([EMOM_MOVEMENTS[0]])
    expect(emomMovement(EMOM_MOVEMENTS[0], workout).getByText('ODD MIN')).toBeInTheDocument()
    expect(emomMovement(EMOM_MOVEMENTS[0], workout).getByText('MIN 1 · 12 reps')).toBeInTheDocument()
    await user.click(within(emomCard(workout)).getByRole('button', { name: 'Start EMOM' }))
    expect(scheduleLines(workout)).toEqual(['MIN 1 OF 10'])
    expect(emomMarked('Now', workout)).toEqual([EMOM_MOVEMENTS[0]])
    expect(within(emomStack(workout)).getByRole('timer')).toHaveTextContent('01:00')
    expect(localStorage.getItem(WORKOUT_EMOM_STORAGE_KEY)).toBeNull()
    const cardsSource = readFileSync(resolve(ROOT, 'src/dev/gallery-refinement-cards.tsx'), 'utf8')
    expect(cardsSource).toMatch(/<GalleryLiveEmom\b/)
    expect(fetch).not.toHaveBeenCalled()
  })
})
