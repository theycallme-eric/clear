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
import { BlockCompletionContext, type BlockCompletionApi, type BlockOutcome } from '../state/block-completion'
import {
  WORKOUT_AMRAP_STORAGE_KEY,
  WORKOUT_EMOM_STORAGE_KEY,
  WORKOUT_FOR_TIME_STORAGE_KEY,
} from '../state/workout-persistence'
import { sessionProgress } from '../state/workout-progress'
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
import { createWorkoutDouble, snapshotFixture, type BlockFixture } from '../test/workout-double'
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
    expect(follows(within(card).getByRole('list', { name: 'Ladder' }), row)).toBe(true)
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
      expect(within(items[rounds - 1]).getByText(`${pushUpRungs(rounds)[rounds - 1]} reps push up`)).toBeInTheDocument()

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
