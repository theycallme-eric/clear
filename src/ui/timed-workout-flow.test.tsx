/**
 * TASK-006 (REQ-006; C17, C18; G05; R39, R48, R66, R68, R98; AC-C17-01,
 * AC-C18-01, AC-R006-01, AC-R006-02; JOURNEY-006) — the timed
 * Start/Pause/Resume/Finish action hierarchy, carried onto Round 7 by A3
 * TASK-104 (F2, #727).
 *
 * The build (`build/clear-refinement-2026-11-04`, 181e580) proved this file's
 * TASK-006 cases on its own `TimedWorkoutActions` and its format controllers
 * (`EmomBlock`, `AmrapBlock`, `ForTimeBlock`, `LadderBlock`). On Round 7 the
 * route's timed blocks are Round 7's `TimedWorkoutFlow`
 * (`src/ui/timed-workout-flow.tsx`; A3 TASK-103 made it the real renderer), and
 * its own action row is now the build's lifecycle: one primary Start; running,
 * a secondary Pause beside the format's primary Finish or Finish early
 * (`finishLabel`); paused, Resume in Pause's place; ended, nothing. Pause,
 * Resume and Finish move the attempt through `src/state/timed-lifecycle.ts`
 * (`src/state/timed-attempt.ts`), and the pause is kept in each format's record
 * (`src/state/timed-attempt-records.ts`) — a raced ladder's inside its durable
 * attempt (`pauseLadderAttempt`, `resumeLadderAttempt`) — so a reload while
 * paused comes back paused with the same time left. Each TASK-006 case below
 * keeps the build's name and its asserted behaviour, read from Round 7's
 * controls and words (the test ledger,
 * `evidence/refinement/task-104/test-ledger.json`, says what each read
 * changed). TASK-104's own cases follow them.
 *
 * JOURNEY-006's entry is the actual `/workout` route: the real router, guard
 * and shell over a running session whose last section holds an EMOM, an AMRAP,
 * a For Time and the accepted twelve-rung ladder (`timed-actions-fixture.ts`,
 * carried unchanged). The wall clock is injected (`Date.now`), so pause
 * arithmetic is read exactly. Round 7's timed stylesheet is applied to the
 * document, so the slot's declared contract is read from the cascade; browser
 * geometry is `e2e/refinement/task-006.spec.ts`, and the look against the
 * accepted gallery is `e2e/refinement/task-104-parity.spec.ts`.
 *
 * Synthetic data only: in-memory doubles, no account and no network.
 *
 * Later tasks add their cases here (A3 TASK-105: TASK-013/TASK-014; A3
 * TASK-116: TASK-011), each in its own describe block, selected by their own
 * name patterns.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { routes } from '../app/router'
import { timedBlock } from '../dev/gallery-refinement-fixtures'
import { GalleryRefinements } from '../dev/gallery-refinements'
import { BlockCompletionContext, type BlockCompletionApi, type BlockOutcome } from '../state/block-completion'
import { ladderRungs } from '../state/ladder'
import { finishLabel } from '../state/timed-lifecycle'
import {
  readAmrapState,
  readEmomState,
  WORKOUT_AMRAP_STORAGE_KEY,
  WORKOUT_EMOM_STORAGE_KEY,
  WORKOUT_FOR_TIME_STORAGE_KEY,
  WORKOUT_LADDER_STORAGE_KEY,
} from '../state/workout-persistence'
import { sessionProgress } from '../state/workout-progress'
import {
  LONG_LADDER_ROUNDS,
  TIMED_FINISH,
  TIMED_FORMATS,
  timedActionsAcceptance,
  timedActionsSnapshot,
  type TimedFormat,
} from '../test/timed-actions-fixture'
import { AppProviders, signedIn } from '../test/render'
import { FIXTURE_USER_ID } from '../test/user-data-double'
import { createWorkoutDouble, snapshotFixture, type BlockFixture } from '../test/workout-double'
import { BlockSlot } from './block-renderers'
import { PRODUCT_PRESENTATION } from './product-presentation'
import { WorkoutExperiencePresentationProvider } from './workout-experience-presentation'

const ROOT = resolve(import.meta.dirname, '../..')
/** Round 7's timed stylesheet: the one file that declares the action slot (`.clr-timed-actions`). */
const TIMED_CSS = readFileSync(resolve(ROOT, 'src/styles/timed-workout.css'), 'utf8')

beforeAll(() => {
  const style = document.createElement('style')
  style.dataset.task104 = 'src/styles/timed-workout.css'
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
// Round 7's words for the fixture's blocks
// ─────────────────────────────────────────────────────────────────────────────

/** Round 7's Start words: the block's own structure label (`Start FOR TIME`), the ladder's `Start ladder`. */
const START: Readonly<Record<TimedFormat, string>> = {
  emom: 'Start EMOM', amrap: 'Start AMRAP', for_time: 'Start FOR TIME', ladder: 'Start ladder',
}

/** The list each Round 7 card names its work by — the work the actions follow (the ladder's: its rounds). */
const LISTS: Readonly<Record<TimedFormat, string>> = {
  emom: 'Movements in this EMOM',
  amrap: 'Movements in this AMRAP',
  for_time: 'Movements in this FOR TIME',
  ladder: 'Prescribed ladder rounds',
}

/** The fixture's blocks, in the order the section performs them. */
const BLOCK_IDS = () => sessionProgress(
  timedActionsSnapshot(timedActionsAcceptance(), { userId: FIXTURE_USER_ID, startedAt: new Date(clock).toISOString() }),
).sections[0].blocks.map((block) => block.blockId)

// ─────────────────────────────────────────────────────────────────────────────
// The route harness
// ─────────────────────────────────────────────────────────────────────────────

/** JOURNEY-006's entry: `/workout`, the session running for one minute. */
async function openWorkout() {
  const acceptance = timedActionsAcceptance()
  const running = timedActionsSnapshot(acceptance, {
    userId: FIXTURE_USER_ID,
    startedAt: new Date(ENTRY - 60_000).toISOString(),
  })
  const double = createWorkoutDouble({ session: running })
  const router = createMemoryRouter(routes, { initialEntries: ['/', '/workout'], initialIndex: 1 })
  const view = render(
    <AppProviders {...signedIn({ workout: double.clients })}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  await screen.findByRole('navigation', { name: 'Workout sections' })
  await screen.findByRole('list', { name: LISTS.ladder })
  return { double, router, view, sessionId: running.session.id }
}

/** One format's timed block: Round 7's flow, its clock beside its card. */
function flowOf(format: TimedFormat, scope: ParentNode = document): HTMLElement {
  const flow = scope.querySelector<HTMLElement>(`.clr-timed-flow[data-timed-format="${format}"]`)
  if (flow === null) throw new Error(`${format} has no timed flow`)
  return flow
}

/** The block's one card: the one holding its group header and its work. */
function cardOf(format: TimedFormat, scope?: ParentNode): HTMLElement {
  const card = flowOf(format, scope).querySelector('[data-movement-group-header]')?.closest<HTMLElement>('.clr-card') ?? null
  if (card === null) throw new Error(`${format} has no card`)
  return card
}

function actionsOf(format: TimedFormat, scope?: ParentNode): HTMLElement | null {
  return cardOf(format, scope).querySelector<HTMLElement>('[data-timed-actions]')
}

type Variant = 'primary' | 'secondary' | 'quiet' | 'critical'

function variantOf(button: HTMLElement): Variant {
  if (button.classList.contains('clr-btn--primary')) return 'primary'
  if (button.classList.contains('clr-btn--quiet')) return 'quiet'
  if (button.classList.contains('clr-btn--critical')) return 'critical'
  return 'secondary'
}

/** The row's controls, in reading order, by name and hierarchy. */
function controls(format: TimedFormat, scope?: ParentNode): [string, Variant][] {
  const row = actionsOf(format, scope)
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

/** The section clock's readout: its digits, as drawn. */
function blockTime(format: TimedFormat, scope?: ParentNode): string {
  const timer = within(flowOf(format, scope)).getByRole('timer')
  const digits = [...timer.children].map((part) => part.textContent ?? '').find((text) => /^\d{2}:\d{2}$/.test(text))
  return digits ?? ''
}

/** The words the section clock states its phase in: the timer frame's caption. */
function clockWords(format: TimedFormat, scope?: ParentNode): HTMLElement {
  const timer = within(flowOf(format, scope)).getByRole('timer')
  return timer.firstElementChild as HTMLElement
}

/** The card's Coaching and notes disclosure: the slot the actions must precede. */
function coachingOf(format: TimedFormat): HTMLElement {
  return within(cardOf(format)).getByRole('button', { name: 'Coaching and notes' })
}

/** The movements a marker word sits on — Round 7's `Now` / `Next` — by name. */
function marked(word: 'Now' | 'Next'): string[] {
  const list = within(cardOf('emom')).getByRole('list', { name: LISTS.emom })
  return [...list.querySelectorAll<HTMLElement>(':scope > li')]
    .filter((item) => [...item.children].some((child) => child.tagName === 'P' && child.textContent === word))
    .map((item) => item.querySelector('.clr-movement-identity__name > span')?.textContent?.replace(/^\d+\s*/, '') ?? '')
}

function stored(key: string): Record<string, Record<string, unknown>> {
  return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, Record<string, unknown>>
}

/** The ladder's durable attempt as the route stored it (TASK-032's record), with the clock this task moves. */
function ladderRecord(blockId: string) {
  return stored(WORKOUT_LADDER_STORAGE_KEY)[blockId] as undefined | {
    identity: { sessionId: string; blockId: string; attemptId: string }
    originalCapSeconds: number | null
    clock: { startedAt: string | null; finishedAt: string | null; pausedAt?: string }
    checkpoint: { pausedAt: string | null } | null
  }
}

/** Every timed log that is open: Round 7's "Log results" dialog. */
function openLogs(): HTMLDialogElement[] {
  return [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].filter((dialog) => dialog.querySelector('form.clr-timed-log') !== null)
}

/** Closes every open timed log with its framed X, as an athlete would before the forward action. */
async function closeLogs(user: ReturnType<typeof userEvent.setup>) {
  for (const dialog of openLogs()) await user.click(within(dialog).getByRole('button', { name: 'Close log' }))
  await waitFor(() => expect(openLogs()).toEqual([]))
}

/** The ladder's open log. */
function ladderLog(): HTMLElement {
  const open = openLogs().filter((dialog) => cardOf('ladder').closest('.clr-timed-flow')!.contains(dialog))
  expect(open).toHaveLength(1)
  return open[0].querySelector<HTMLElement>('form.clr-timed-log')!
}

/** The declared body of one rule in Round 7's timed stylesheet. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(TIMED_CSS.replaceAll(/\/\*[\s\S]*?\*\//g, ''))?.[1] ?? ''
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
      expect(controls(format)).toEqual([[START[format], 'primary']])

      // After the work and its prescription: every movement, every reading.
      const list = within(card).getByRole('list', { name: LISTS[format] })
      expect(follows(row, list), `${format}: after the movements`).toBe(true)
      expect(list.contains(row)).toBe(false)
      const readings = card.querySelectorAll('.clr-movement-identity, [data-movement-detail]')
      expect(readings.length).toBeGreaterThan(0)
      for (const reading of readings) {
        expect(follows(row, reading), `${format}: after every prescription`).toBe(true)
      }
      // Before coaching: the card's one Coaching and notes disclosure follows the slot.
      const coaching = coachingOf(format)
      expect(follows(coaching, row), `${format}: before coaching`).toBe(true)
      expect(within(card).getAllByRole('button', { name: 'Coaching and notes' })).toHaveLength(1)
    }

    // The EMOM's schedule is part of its prescription: each movement's minute
    // and target is read before the Start. The AMRAP's round is its
    // prescription: Start follows every movement of the round.
    const minuteLine = within(cardOf('emom')).getByText('Min 2 · 10 reps')
    expect(follows(actionsOf('emom')!, minuteLine)).toBe(true)
    const lastOfRound = within(within(cardOf('amrap')).getByRole('list', { name: LISTS.amrap })).getAllByRole('listitem').at(-1)!
    expect(follows(actionsOf('amrap')!, lastOfRound)).toBe(true)

    // Running, the same slot holds the running controls: still after the work, before coaching.
    const user = userEvent.setup()
    for (const format of ['emom', 'amrap'] as const) {
      await user.click(button(format, START[format]))
      const row = actionsOf(format)!
      expect(controls(format).map(([name]) => name)).toEqual(['Pause', TIMED_FINISH[format]])
      expect(follows(row, within(cardOf(format)).getByRole('list', { name: LISTS[format] }))).toBe(true)
      expect(follows(coachingOf(format), row)).toBe(true)
    }
  })

  it('AC-R006-01 the long ladder keeps its Start near the top, after its identity and cap and before the repetitive rounds, with no second Start', async () => {
    await openWorkout()
    const card = cardOf('ladder')
    const row = actionsOf('ladder')!
    expect(row.dataset.timedActions).toBe('top')
    expect(controls('ladder')).toEqual([[START.ladder, 'primary']])

    // After the identity and the cap: the header (section and LADDER badge)
    // and Round 7's meta line, which states the rounds and the one cap.
    const header = card.querySelector<HTMLElement>('[data-movement-group-header]')!
    expect(header.textContent).toContain('LADDER')
    expect(follows(row, header)).toBe(true)
    const cap = within(card).getByText(`${LONG_LADDER_ROUNDS} rounds · 07:00 cap`)
    expect(follows(row, cap)).toBe(true)

    // Before the prescription it would otherwise sit under: the compact
    // summary and every one of the twelve rounds (TASK-012's compact
    // prescription, Round 7's LadderPrescription).
    const rounds = within(card).getByRole('list', { name: LISTS.ladder })
    expect(within(rounds).getAllByRole('listitem')).toHaveLength(LONG_LADDER_ROUNDS)
    expect(follows(rounds, row)).toBe(true)
    expect(follows(card.querySelector('.clr-ladder-prescription__summary')!, row)).toBe(true)
    // Nothing of the work sits between the cap and the Start.
    const before = [...card.querySelectorAll('ul, ol, .clr-movement-identity, .clr-ladder-prescription')].filter((node) => follows(row, node))
    expect(before).toEqual([])

    // One Start, in the one slot: no duplicate, nothing sticky or pinned.
    expect(screen.getAllByRole('button', { name: START.ladder })).toHaveLength(1)
    expect(['sticky', 'fixed']).not.toContain(getComputedStyle(row).position)

    // Running, the same top slot holds Pause and Finish; the work follows them.
    const user = userEvent.setup()
    await user.click(button('ladder', START.ladder))
    expect(controls('ladder')).toEqual([['Pause', 'secondary'], ['Finish', 'primary']])
    expect(follows(rounds, actionsOf('ladder')!)).toBe(true)
    expect(screen.queryAllByRole('button', { name: START.ladder })).toHaveLength(0)
  })

  it('AC-C17-01 every timed action row is the shared responsive full-width slot, after the work and before coaching, and the ladder alone takes the top slot', async () => {
    await openWorkout()

    // The shared recipe (Round 7's `.clr-timed-actions`, declared once): one
    // grid row whose cells share the card's width equally, each control
    // filling its cell — a lone Start fills the row, a running pair splits it.
    expect(rule('.clr-timed-actions')).toMatch(/display:\s*grid/)
    expect(rule('.clr-timed-actions')).toMatch(/grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(0,\s*1fr\)\)/)
    expect(rule('.clr-timed-actions')).toMatch(/gap:\s*var\(--spacing-300\)/)
    expect(TIMED_CSS).toMatch(/\.clr-timed-actions > \.clr-bleed,\s*\.clr-timed-actions button\s*\{[^}]*width:\s*100%/)
    expect(TIMED_CSS).not.toMatch(/\.clr-timed-actions[^{]*\{[^}]*\d+px/)

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
      expect(follows(coachingOf(format), row), `${format}: before coaching`).toBe(true)
      const list = within(cardOf(format)).getByRole('list', { name: LISTS[format] })
      // After the work for every format but the ladder, whose Start is its exception.
      expect(follows(row, list), `${format}: placement`).toBe(format !== 'ladder')
      expect(row.dataset.timedActions).toBe(format === 'ladder' ? 'top' : 'after-work')
    }
    // For Time keeps its Start after its work: every movement and its prescription.
    for (const reading of cardOf('for_time').querySelectorAll('.clr-movement-identity, [data-movement-detail]')) {
      expect(follows(actionsOf('for_time')!, reading)).toBe(true)
    }
  })

  it("AC-C18-01 running controls are a secondary Pause and the format's primary Finish or Finish early, and paused controls a secondary Resume in Pause's place", async () => {
    const user = userEvent.setup()
    await openWorkout()

    for (const format of TIMED_FORMATS) {
      expect(controls(format), `${format} ready`).toEqual([[START[format], 'primary']])
      await user.click(button(format, START[format]))
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
        <WorkoutExperiencePresentationProvider value={PRODUCT_PRESENTATION}>
          <BlockCompletionContext value={completion}>
            <BlockSlot block={sessionProgress(snapshot).sections[0].blocks[0]} />
          </BlockCompletionContext>
        </WorkoutExperiencePresentationProvider>,
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
      // The row draws nothing once the attempt has ended.
      await user.click(within(row).getByRole('button', { name: 'Finish' }))
      expect(document.querySelector('[data-timed-actions]')).toBeNull()
      cleanup()
    }
  })

  it('AC-C18-01 Pause freezes the section clock and its cap while the workout clock runs on, and Resume keeps the active time and the remaining window', async () => {
    const user = userEvent.setup()
    await openWorkout()
    expect(sessionTime()).toContain('01:00')

    // For Time: 30 seconds raced, then two paused minutes.
    await user.click(button('for_time', START.for_time))
    advance(30)
    expect(blockTime('for_time')).toBe('00:30')
    await user.click(button('for_time', 'Pause'))
    advance(120)
    expect(blockTime('for_time')).toBe('00:30')
    expect(clockWords('for_time')).toHaveTextContent('Paused')
    // The workout's own clock is not the section's: it ran on through the pause.
    expect(sessionTime()).toContain('03:30')
    const [, , forTimeId] = BLOCK_IDS()
    expect(stored(WORKOUT_FOR_TIME_STORAGE_KEY)[forTimeId].pausedAt).toBe(new Date(clock - 120_000).toISOString())
    // Its cap holds too: paused far past what was left of it, it is still paused, not capped.
    advance(900)
    expect(blockTime('for_time')).toBe('00:30')
    expect(clockWords('for_time')).toHaveTextContent('Paused')
    expect(within(flowOf('for_time')).queryByText('Cap reached')).toBeNull()
    await user.click(button('for_time', 'Resume'))
    advance(10)
    expect(blockTime('for_time')).toBe('00:40')
    expect(clockWords('for_time')).toHaveTextContent('Elapsed')
    expect(stored(WORKOUT_FOR_TIME_STORAGE_KEY)[forTimeId].pausedAt).toBeUndefined()

    // AMRAP: the window left is frozen, then runs from where it stopped.
    await user.click(button('amrap', START.amrap))
    advance(60)
    expect(blockTime('amrap')).toBe('07:00')
    await user.click(button('amrap', 'Pause'))
    advance(300)
    expect(blockTime('amrap')).toBe('07:00')
    expect(clockWords('amrap')).toHaveTextContent('Paused')
    await user.click(button('amrap', 'Resume'))
    advance(20)
    expect(blockTime('amrap')).toBe('06:40')

    // EMOM: the minute grid holds where it was paused — the minute's movement
    // and its seconds left — and moves on only once resumed.
    await user.click(button('emom', START.emom))
    advance(50)
    expect(clockWords('emom')).toHaveTextContent('Minute 1 of 10')
    expect(marked('Now')).toEqual(['kb swing'])
    await user.click(button('emom', 'Pause'))
    advance(90)
    expect(clockWords('emom')).toHaveTextContent('Paused')
    expect(marked('Now')).toEqual(['kb swing'])
    expect(blockTime('emom')).toBe('00:10')
    await user.click(button('emom', 'Resume'))
    advance(15)
    expect(clockWords('emom')).toHaveTextContent('Minute 2 of 10')
    expect(marked('Now')).toEqual(['burpee'])
    expect(within(flowOf('emom')).queryByText('Paused')).toBeNull()

    // The ladder's clock: frozen while paused, against its one cap — paused
    // longer than the cap had left, it is still paused, not capped.
    await user.click(button('ladder', START.ladder))
    advance(100)
    expect(blockTime('ladder')).toBe('01:40')
    await user.click(button('ladder', 'Pause'))
    advance(400)
    expect(blockTime('ladder')).toBe('01:40')
    expect(clockWords('ladder')).toHaveTextContent('Paused')
    expect(within(flowOf('ladder')).queryByText('Cap reached')).toBeNull()
    await user.click(button('ladder', 'Resume'))
    advance(20)
    expect(blockTime('ladder')).toBe('02:00')

    // Nothing paused or resumed wrote a result or touched the session.
    expect(sessionTime()).toContain('36:15')
  })

  it("AC-C18-01 Finish ends each format's attempt where it stands — a paused attempt at its pause — and records nothing the format did not already observe", async () => {
    const user = userEvent.setup()
    const { double } = await openWorkout()
    const [emomId, amrapId, forTimeId, ladderId] = BLOCK_IDS()

    // For Time, paused at 40 seconds and finished a minute later: 40 seconds.
    await user.click(button('for_time', START.for_time))
    advance(40)
    await user.click(button('for_time', 'Pause'))
    advance(60)
    await user.click(button('for_time', 'Finish'))
    expect(blockTime('for_time')).toBe('00:40')
    expect(clockWords('for_time')).toHaveTextContent('Finished')
    expect(controls('for_time')).toEqual([])

    // AMRAP: Finish early settles the window at the time it was ended.
    await user.click(button('amrap', START.amrap))
    advance(95)
    await user.click(button('amrap', 'Finish early'))
    expect(blockTime('amrap')).toBe('06:25')
    expect(clockWords('amrap')).toHaveTextContent('Finished')
    expect(controls('amrap')).toEqual([])
    advance(60)
    expect(blockTime('amrap')).toBe('06:25')

    // EMOM: Finish early stops the schedule where it is, and says so truthfully.
    await user.click(button('emom', START.emom))
    advance(150)
    await user.click(button('emom', 'Finish early'))
    const emom = within(cardOf('emom'))
    expect(emom.getByText('Finished early, in minute 3 of 10. Continue when you are ready.')).toBeInTheDocument()
    expect(emom.queryByText(/The clock has run every prescribed minute/)).toBeNull()
    expect(controls('emom')).toEqual([])
    advance(600)
    expect(emom.getByText('Finished early, in minute 3 of 10. Continue when you are ready.')).toBeInTheDocument()
    expect(clockWords('emom')).toHaveTextContent('Finished early')
    expect(within(flowOf('emom')).queryByText('Time complete')).toBeNull()

    // Ladder: Finish stops its clock; how it ended is still the athlete's to
    // say — Round 7's log, opened by the Finish, asks Work completed.
    await user.click(button('ladder', START.ladder))
    advance(200)
    await user.click(button('ladder', 'Finish'))
    expect(blockTime('ladder')).toBe('03:20')
    expect(controls('ladder')).toEqual([])
    expect(within(ladderLog()).getByRole('group', { name: 'Work completed' })).toBeInTheDocument()

    // The section's forward action records what each block observed — and only that.
    await closeLogs(user)
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

    for (const format of TIMED_FORMATS) await user.click(button(format, START[format]))

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
    await closeLogs(user)
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))
    await waitFor(() => expect(double.completed()).toHaveLength(1))
  })

  it('JOURNEY-006 recovery: a paused section comes back paused after close and reopen, and a reached cap offers no Resume', async () => {
    const user = userEvent.setup()
    const first = await openWorkout()
    await user.click(button('for_time', START.for_time))
    await user.click(button('ladder', START.ladder))
    await user.click(button('emom', START.emom))
    advance(45)
    await user.click(button('for_time', 'Pause'))
    await user.click(button('emom', 'Pause'))
    const [emomId, , forTimeId, ladderId] = BLOCK_IDS()
    expect(stored(WORKOUT_EMOM_STORAGE_KEY)[emomId].pausedAt).toBeDefined()

    // Close the app; ten minutes later, reopen it.
    first.view.unmount()
    clock += 600_000
    await openWorkout()
    expect(controls('for_time')).toEqual([['Resume', 'secondary'], ['Finish', 'primary']])
    expect(blockTime('for_time')).toBe('00:45')
    expect(controls('emom')).toEqual([['Resume', 'secondary'], ['Finish early', 'primary']])
    expect(clockWords('emom')).toHaveTextContent('Paused')
    // Nothing was stored for a block that was never started.
    expect(stored(WORKOUT_AMRAP_STORAGE_KEY)).toEqual({})
    await user.click(button('for_time', 'Resume'))
    advance(5)
    expect(blockTime('for_time')).toBe('00:50')
    expect(stored(WORKOUT_FOR_TIME_STORAGE_KEY)[forTimeId].pausedAt).toBeUndefined()

    // The ladder ran on through the close and reached its cap: no Resume, no
    // Pause, no Finish — and the clock says so in words.
    expect(controls('ladder')).toEqual([])
    expect(blockTime('ladder')).toBe('07:00')
    expect(clockWords('ladder')).toHaveTextContent('Cap reached')
    expect(within(cardOf('ladder')).queryByRole('button', { name: 'Resume' })).toBeNull()
    // Its clock is its durable attempt's, never a For Time race beside it.
    expect(ladderRecord(ladderId)?.clock.startedAt).toBe(new Date(ENTRY).toISOString())
    expect(stored(WORKOUT_FOR_TIME_STORAGE_KEY)[ladderId]).toBeUndefined()
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

      // The route's own timed renderer over the gallery's ladder: every round, its rung and the companion.
      const card = cardOf('ladder', state)
      const list = within(card).getByRole('list', { name: LISTS.ladder })
      const items = within(list).getAllByRole('listitem')
      expect(items).toHaveLength(rounds)
      const rungs = ladderRungs(timedBlock('ladder', { rounds }).exercises)
      expect(rungs).toHaveLength(rounds)
      expect(within(items[rounds - 1]).getByText(`${rounds * 2} × push up`)).toBeInTheDocument()
      expect(within(items[rounds - 1]).getByText('4 × burpee')).toBeInTheDocument()

      const row = card.querySelector<HTMLElement>('[data-timed-actions]')!
      expect(row).toHaveClass('clr-timed-actions')
      expect(row.dataset.timedActions).toBe('top')
      expect(follows(list, row)).toBe(true)
      await user.click(within(row).getByRole('button', { name: 'Start ladder' }))
      expect(controls('ladder', state)).toEqual([['Pause', 'secondary'], ['Finish', 'primary']])
      await user.click(within(card.querySelector<HTMLElement>('[data-timed-actions]')!).getByRole('button', { name: 'Pause' }))
      expect(controls('ladder', state).map(([name]) => name)).toEqual(['Resume', 'Finish'])
      // Memory-only: the route's storage keys are untouched.
      expect(localStorage.getItem(WORKOUT_FOR_TIME_STORAGE_KEY)).toBeNull()
      expect(localStorage.getItem(WORKOUT_LADDER_STORAGE_KEY)).toBeNull()
      cleanup()
    }
    // The same owner the route draws (`BlockSlot` → `TimedWorkoutFlow`), not a look-alike.
    const flow = readFileSync(resolve(ROOT, 'src/dev/gallery-refinement-flow.tsx'), 'utf8')
    expect(flow).toMatch(/import \{ TimedWorkoutFlow \} from '\.\.\/ui\/timed-workout-flow'/)
    const slot = readFileSync(resolve(ROOT, 'src/ui/block-renderers.tsx'), 'utf8')
    expect(slot).toMatch(/import \{ TimedWorkoutFlow \} from '\.\/timed-workout-flow'/)
    expect(fetch).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// A3 TASK-104 — the lifecycle kept across reloads, on Round 7's flow
// ─────────────────────────────────────────────────────────────────────────────

const at = (seconds: number) => new Date(ENTRY + seconds * 1000).toISOString()

/** The section clock's caption, as drawn: Round 7's timer frame sets its words in capitals. */
function drawnWords(format: TimedFormat): string {
  const caption = clockWords(format)
  return getComputedStyle(caption).textTransform === 'uppercase' ? (caption.textContent ?? '').toUpperCase() : caption.textContent ?? ''
}

describe('A3 TASK-104 timed Pause, Resume and Finish early on Round 7’s flow, kept across reloads', () => {
  it('TASK-AC-591C4D5CE263 a reload while paused restores every format’s paused clock with the same time left, kept as one pause stamp beside its start in the format’s own record', async () => {
    const user = userEvent.setup()
    const first = await openWorkout()
    const [emomId, amrapId, forTimeId, ladderId] = BLOCK_IDS()
    for (const format of TIMED_FORMATS) await user.click(button(format, START[format]))
    advance(70)
    for (const format of TIMED_FORMATS) await user.click(button(format, 'Pause'))
    const paused = { emom: '00:50', amrap: '06:50', for_time: '01:10', ladder: '01:10' } as const
    for (const format of TIMED_FORMATS) expect(blockTime(format), format).toBe(paused[format])

    // One pause stamp beside the start, in each format's own record — the
    // ladder's inside its durable attempt, under this workout's session.
    expect(readEmomState(localStorage, emomId)).toEqual({ startedAt: at(0), workDoneMinute: null, pausedAt: at(70) })
    expect(readAmrapState(localStorage, amrapId)).toEqual({
      startedAt: at(0), pausedAt: at(70), endedAtSeconds: null, roundsCompleted: null, partialRoundReps: null,
    })
    expect(stored(WORKOUT_FOR_TIME_STORAGE_KEY)[forTimeId]).toEqual({ startedAt: at(0), pausedAt: at(70), finishedAt: null })
    expect(ladderRecord(ladderId)).toMatchObject({
      identity: { sessionId: first.sessionId, blockId: ladderId },
      originalCapSeconds: 420,
      clock: { startedAt: at(0), finishedAt: null, pausedAt: at(70) },
    })
    expect(stored(WORKOUT_FOR_TIME_STORAGE_KEY)[ladderId]).toBeUndefined()

    // Close the app; half an hour later, reopen it: every clock is paused where it was.
    first.view.unmount()
    clock += 30 * 60_000
    await openWorkout()
    for (const format of TIMED_FORMATS) {
      expect(controls(format), format).toEqual([['Resume', 'secondary'], [TIMED_FINISH[format], 'primary']])
      expect(drawnWords(format), format).toBe('PAUSED')
      expect(blockTime(format), format).toBe(paused[format])
    }
    // Paused past the AMRAP's window and the ladder's cap: neither ran out while paused.
    expect(within(flowOf('ladder')).queryByText('Cap reached')).toBeNull()
    expect(within(flowOf('amrap')).queryByText('Time complete')).toBeNull()

    // Resume picks each up where it was paused, the start moved on by the pause.
    for (const format of TIMED_FORMATS) await user.click(button(format, 'Resume'))
    advance(10)
    expect({ emom: blockTime('emom'), amrap: blockTime('amrap'), for_time: blockTime('for_time'), ladder: blockTime('ladder') })
      .toEqual({ emom: '00:40', amrap: '06:40', for_time: '01:20', ladder: '01:20' })
    const moved = at(30 * 60)
    expect(readEmomState(localStorage, emomId)).toEqual({ startedAt: moved, workDoneMinute: null })
    expect(stored(WORKOUT_FOR_TIME_STORAGE_KEY)[forTimeId]).toEqual({ startedAt: moved, finishedAt: null })
    expect(ladderRecord(ladderId)?.clock).toEqual({ startedAt: moved, finishedAt: null })

    // AMRAP: Finish early on a paused window reads the pause moment, stored as the window's end.
    await user.click(button('amrap', 'Pause'))
    advance(50)
    await user.click(button('amrap', 'Finish early'))
    expect(blockTime('amrap')).toBe('06:40')
    expect(readAmrapState(localStorage, amrapId)).toMatchObject({ startedAt: moved, endedAtSeconds: 80 })
    expect(readAmrapState(localStorage, amrapId)?.pausedAt).toBeUndefined()
  })

  it('TASK-AC-8E33C288F00C EMOM Pause and Finish early: PAUSED, then FINISHED EARLY and the minute it was in, stored as the stop and never counted as performed minutes', async () => {
    const user = userEvent.setup()
    const first = await openWorkout()
    const [emomId] = BLOCK_IDS()

    // Minute three, paused 130 seconds in, then ended early a while later: it
    // ends at its pause, in the minute it was in.
    await user.click(button('emom', START.emom))
    advance(130)
    expect(drawnWords('emom')).toBe('MINUTE 3 OF 10')
    await user.click(button('emom', 'Pause'))
    expect(drawnWords('emom')).toBe('PAUSED')
    advance(40)
    expect(blockTime('emom')).toBe('00:50')
    await user.click(button('emom', 'Finish early'))
    const stop = { startedAt: at(0), workDoneMinute: null, finishedAt: at(130) }
    expect(readEmomState(localStorage, emomId)).toEqual(stop)
    expect(drawnWords('emom')).toBe('FINISHED EARLY')
    const note = 'Finished early, in minute 3 of 10. Continue when you are ready.'
    expect(within(cardOf('emom')).getByText(note)).toBeInTheDocument()
    expect(controls('emom')).toEqual([])

    // The clock running on never turns an early end into a completed schedule.
    advance(10 * 60)
    expect(drawnWords('emom')).toBe('FINISHED EARLY')
    expect(within(flowOf('emom')).queryByText('Time complete')).toBeNull()
    expect(readEmomState(localStorage, emomId)).toEqual(stop)

    // Close and reopen: the actual stop is restored, words and minute alike.
    first.view.unmount()
    const second = await openWorkout()
    expect(drawnWords('emom')).toBe('FINISHED EARLY')
    expect(within(cardOf('emom')).getByText(note)).toBeInTheDocument()
    expect(controls('emom')).toEqual([])

    // Saved by the section's forward action: nothing counted (E01) — no minutes, no "3 of 10".
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))
    await waitFor(() => expect(second.double.recorded().some((row) => row.blockId === emomId)).toBe(true))
    expect(second.double.recorded().find((row) => row.blockId === emomId)!.outcome).toEqual({})
    // The workout is complete: its timed records are dropped with the session, never rewritten as a full schedule.
    await waitFor(() => expect(second.double.completed()).toHaveLength(1))
    expect(readEmomState(localStorage, emomId)).toBeNull()
  })

  it('TASK-AC-8E33C288F00C the For Time Finish label follows the cap: a race is finished with a cap or without one, never ended early, while a prescribed EMOM or AMRAP window is', async () => {
    const user = userEvent.setup()
    const completion: BlockCompletionApi = { reportOutcome: () => {}, isBlockRecorded: () => false }
    const cases: readonly [BlockFixture, string, 'emom' | 'amrap' | 'for_time', boolean][] = [
      [{ structureType: 'for_time', timerType: 'count_up', timerSeconds: 900 }, 'Start FOR TIME', 'for_time', true],
      [{ structureType: 'for_time', timerType: 'count_up', timerSeconds: null }, 'Start FOR TIME', 'for_time', false],
      [{ structureType: 'amrap', timerType: 'countdown', timerSeconds: 480 }, 'Start AMRAP', 'amrap', true],
      [{ structureType: 'emom', timerType: 'per_minute', timerSeconds: 600 }, 'Start EMOM', 'emom', true],
    ]
    for (const [block, start, format, hasCap] of cases) {
      const snapshot = snapshotFixture({ sections: [{ title: 'Finisher', sectionType: 'conditioning', blocks: [block] }] })
      render(
        <WorkoutExperiencePresentationProvider value={PRODUCT_PRESENTATION}>
          <BlockCompletionContext value={completion}>
            <BlockSlot block={sessionProgress(snapshot).sections[0].blocks[0]} />
          </BlockCompletionContext>
        </WorkoutExperiencePresentationProvider>,
      )
      await user.click(screen.getByRole('button', { name: start }))
      const finish = within(document.querySelector<HTMLElement>('[data-timed-actions]')!).getAllByRole('button')[1]
      expect(finish.textContent, `${format} ${hasCap ? 'with' : 'without'} a cap`).toBe(finishLabel(format, hasCap))
      expect(finish.textContent).toBe(format === 'for_time' ? 'Finish' : 'Finish early')
      expect(variantOf(finish)).toBe('primary')
      cleanup()
    }
  })

  it('TASK-AC-591C4D5CE263 a raced ladder’s clock pauses and resumes inside its durable attempt, an older For Time-kept clock is adopted, and Undo finish puts the focus back on the lead control', async () => {
    const user = userEvent.setup()
    const first = await openWorkout()
    const [, , , ladderId] = BLOCK_IDS()

    await user.click(button('ladder', START.ladder))
    expect(ladderRecord(ladderId)).toMatchObject({ identity: { sessionId: first.sessionId }, clock: { startedAt: at(0), finishedAt: null } })
    advance(30)
    await user.click(button('ladder', 'Pause'))
    expect(ladderRecord(ladderId)?.clock).toEqual({ startedAt: at(0), finishedAt: null, pausedAt: at(30) })
    advance(60)
    await user.click(button('ladder', 'Resume'))
    // The lead control is the same element through Pause and Resume.
    expect(document.activeElement).toBe(button('ladder', 'Pause'))
    expect(ladderRecord(ladderId)?.clock).toEqual({ startedAt: at(60), finishedAt: null })
    advance(20)
    expect(blockTime('ladder')).toBe('00:50')

    // Finish, then the quiet Undo in its log: the same attempt runs on from the
    // same start (the time spent finished counts), and the focus is back on the
    // attempt's lead control, Pause.
    await user.click(button('ladder', 'Finish'))
    expect(ladderRecord(ladderId)).toMatchObject({ clock: { startedAt: at(60), finishedAt: at(110) }, checkpoint: { pausedAt: null } })
    advance(5)
    await user.click(within(ladderLog()).getByRole('button', { name: 'Undo finish · resume ladder' }))
    // The running clock's next read (its tick).
    advance(0)
    expect(blockTime('ladder')).toBe('00:55')
    expect(controls('ladder')).toEqual([['Pause', 'secondary'], ['Finish', 'primary']])
    expect(document.activeElement).toBe(button('ladder', 'Pause'))
    expect(ladderRecord(ladderId)).toMatchObject({ clock: { startedAt: at(60), finishedAt: null }, checkpoint: null })

    // Paused, then finished and undone: paused again at the same moment, focus on Resume.
    advance(5)
    await user.click(button('ladder', 'Pause'))
    advance(15)
    await user.click(button('ladder', 'Finish'))
    expect(ladderRecord(ladderId)).toMatchObject({ clock: { finishedAt: at(120) }, checkpoint: { pausedAt: at(120) } })
    await user.click(within(ladderLog()).getByRole('button', { name: 'Undo finish · resume ladder' }))
    expect(controls('ladder')).toEqual([['Resume', 'secondary'], ['Finish', 'primary']])
    expect(document.activeElement).toBe(button('ladder', 'Resume'))
    expect(blockTime('ladder')).toBe('01:00')
    expect(ladderRecord(ladderId)?.clock).toEqual({ startedAt: at(60), finishedAt: null, pausedAt: at(120) })
    expect(stored(WORKOUT_FOR_TIME_STORAGE_KEY)[ladderId]).toBeUndefined()
    first.view.unmount()

    // A ladder clock an earlier build kept under the For Time key: read as
    // running, and adopted into the durable attempt by the first action; the
    // For Time record is left exactly as it was.
    localStorage.clear()
    clock = ENTRY
    const older = JSON.stringify({ [ladderId]: { startedAt: at(-120), finishedAt: null } })
    localStorage.setItem(WORKOUT_FOR_TIME_STORAGE_KEY, older)
    const second = await openWorkout()
    expect(blockTime('ladder')).toBe('02:00')
    expect(controls('ladder')).toEqual([['Pause', 'secondary'], ['Finish', 'primary']])
    expect(ladderRecord(ladderId)).toBeUndefined()
    await user.click(button('ladder', 'Pause'))
    expect(ladderRecord(ladderId)).toMatchObject({
      identity: { sessionId: second.sessionId, blockId: ladderId },
      clock: { startedAt: at(-120), finishedAt: null, pausedAt: at(0) },
    })
    expect(localStorage.getItem(WORKOUT_FOR_TIME_STORAGE_KEY)).toBe(older)
  })

  it('TASK-AC-591C4D5CE263 the accepted gallery states emom, amrap and for_time draw the route’s own flow with its lifecycle, over memory only', async () => {
    const user = userEvent.setup()
    const fetch = vi.spyOn(globalThis, 'fetch')
    for (const format of ['emom', 'amrap', 'for_time'] as const) {
      render(
        <MemoryRouter initialEntries={[`/gallery/refinements?state=${format}`]}>
          <GalleryRefinements />
        </MemoryRouter>,
      )
      const state = document.querySelector<HTMLElement>(`[data-refinement-state="${format}"]`)!
      const start = START[format]
      expect(controls(format, state)).toEqual([[start, 'primary']])
      await user.click(within(cardOf(format, state)).getByRole('button', { name: start }))
      expect(controls(format, state)).toEqual([['Pause', 'secondary'], [TIMED_FINISH[format], 'primary']])
      advance(20)
      await user.click(within(cardOf(format, state)).getByRole('button', { name: 'Pause' }))
      expect(controls(format, state)).toEqual([['Resume', 'secondary'], [TIMED_FINISH[format], 'primary']])
      const frozen = blockTime(format, state)
      advance(30)
      expect(blockTime(format, state)).toBe(frozen)
      await user.click(within(cardOf(format, state)).getByRole('button', { name: TIMED_FINISH[format] }))
      expect(controls(format, state)).toEqual([])
      if (format === 'emom') {
        expect(within(cardOf(format, state)).getByText('Finished early, in minute 1 of 10. Continue when you are ready.')).toBeInTheDocument()
      }
      // Memory only: nothing under any key.
      expect(localStorage.length).toBe(0)
      cleanup()
    }
    expect(fetch).not.toHaveBeenCalled()
  })
})
