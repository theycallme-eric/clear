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
 *
 * A3 TASK-105 (F3, #728) carries the build's TASK-013 and TASK-014 cases
 * (TASK-104's test ledger deferred them here). TASK-013 (REQ-013; C33, C34,
 * C36; AC-C33-01, AC-C34-01, AC-C36-01, AC-R013-01/02/03; JOURNEY-013) —
 * rep-first ordered live ladder progress and its result handoff — and TASK-014
 * (REQ-014; C38, C39, C60; AC-C38-01, AC-C39-01, AC-C60-01, AC-R014-01/02/03;
 * JOURNEY-014) — accidental Finish recovery with an aligned quiet Undo — are
 * proved on Round 7's owners: `TimedWorkoutFlow` holding the ladder's one
 * durable attempt (`usePersistedLadder`, TASK-032's `clear.workout-ladders`),
 * `LadderPrescription` (the live check-off) and `LadderCompletion` (the log's
 * rep-first tiles) in `src/ui/ladder-rungs.tsx`, and `TimedResultLog` in the
 * one "Log results" `LoggingOverlay`. Each keeps the build's name and its
 * asserted behaviour, read from Round 7's controls and words (the test ledger,
 * `evidence/refinement/task-105/test-ledger.json`, says what each read
 * changed): Round 7's list `Prescribed ladder rounds`, its meta line (`12
 * rounds · 09:00 cap`), its clock captions (`Elapsed`, `Paused`, `Finished`,
 * `Cap reached`) with the original cap kept as `data-cap-seconds`, a log that
 * exists once the attempt has ended, the partial round named on each
 * movement's `Completed in round N` field, and the quiet `Undo finish · resume
 * ladder`. The route fixture is the build's (`ladder-handoff-fixture.ts`,
 * carried unchanged: a twelve-rung capped kettlebell ladder and a four-rung
 * timed plank ladder, a cooldown after). TASK-013's describe title carries
 * "ladder", "rung" and "handoff" and TASK-014's "undo", so their check-01
 * patterns select them; no TASK-014 name carries "ladder", "rung" or
 * "handoff". Browser geometry is `e2e/refinement/task-013.spec.ts` and
 * `task-014.spec.ts`.
 *
 * A3 TASK-117 (F3, #743) carries the build's TASK-011 cases (REQ-011; C31,
 * C32; R40, R43, R44, R84; AC-C31-01, AC-C32-01, AC-R011-01, AC-R011-02;
 * JOURNEY-011) in their own describe block — the EMOM's schedule context and
 * its end log without a completion counter — on Round 7's `TimedWorkoutFlow`
 * and `TimedResultLog` in the one "Log results" dialog, over the build's own
 * route fixture (`emom-end-log-fixture.ts`, carried unchanged: the EMOM in the
 * first section with a 15-second rest each minute, a cooldown after). Each case
 * keeps the build's name and its asserted behaviour, read from Round 7's words
 * (`evidence/refinement/task-117/test-ledger.json` says what each read
 * changed): the minute is the clock's caption (`Minute 3 of 10`, with `· Rest`
 * in the block's rest window), its state words are Round 7's (`Paused`,
 * `Finished early`, `Time complete`), each movement's minute is `Min 3 · …`,
 * Round 7 keeps the minute's movement marked Now through its minute and marks
 * the next minute's movement Next, and the grouped coaching disclosure is found
 * by its accessible name (`Coaching and notes — EMOM: …`) and read as the last
 * child of the card's content, `.clr-movement-group` (round-07 scan finding
 * S1). TASK-117 owns this whole file; its TASK-011 check selects the EMOM cases
 * with `--testNamePattern EMOM`.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { routes } from '../app/router'
import { timedBlock } from '../dev/gallery-refinement-fixtures'
import { LADDER_CAP_SECONDS, pushUpRungs } from '../dev/gallery-refinement-flow-data'
import { GalleryRefinements } from '../dev/gallery-refinements'
import {
  blockResultInsert,
  BlockCompletionContext,
  type BlockCompletion,
  type BlockCompletionApi,
  type BlockOutcome,
  type BlockRecordedSource,
  type RecordedBlockResult,
} from '../state/block-completion'
import { clampEmomState, emomShape, emomView, type EmomState } from '../state/emom'
import { createError, err, ErrorCode, ok } from '../state/errors'
import { ladderPrefixAfterTap, ladderRungs } from '../state/ladder'
import { ladderPartialRound } from '../state/ladder-recovery'
import type { BlockResultRow } from '../state/schemas'
import { blockOutcome } from '../state/session-detail'
import { finishLabel } from '../state/timed-lifecycle'
import {
  readAmrapState,
  readEmomState,
  WORKOUT_AMRAP_STORAGE_KEY,
  WORKOUT_EMOM_STORAGE_KEY,
  WORKOUT_FOR_TIME_STORAGE_KEY,
  WORKOUT_LADDER_STORAGE_KEY,
  writeEmomState,
} from '../state/workout-persistence'
import { sessionProgress, type BlockProgress } from '../state/workout-progress'
import {
  COOLDOWN_SECTION_TITLE,
  EMOM_MINUTES,
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
  HANDOFF_COOLDOWN_TITLE,
  LONG_CAP_SECONDS,
  LONG_ROUNDS,
  LONG_TARGETS,
  LONG_UNIT,
  ROUNDS_COMPLETED,
  SHORT_CAP_SECONDS,
  SHORT_ROUNDS,
  SHORT_TARGETS,
  SHORT_UNIT,
  WORK_COMPLETED,
  ladderHandoffAcceptance,
  ladderHandoffBlocks,
  ladderHandoffSnapshot,
} from '../test/ladder-handoff-fixture'
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
import { createWorkoutDouble, snapshotFixture, type BlockFixture, type WorkoutDoubleOptions } from '../test/workout-double'
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

/**
 * Each card's Coaching and notes accessible name is TASK-005's (the build's):
 * the visible words, then the block's format and movements, so each card's
 * region is named apart (axe `landmark-unique`, TASK-006 check-02).
 */
const COACHING: Readonly<Record<TimedFormat, string>> = {
  emom: 'Coaching and notes — EMOM: kb swing, burpee',
  amrap: 'Coaching and notes — AMRAP: kb swing, burpee',
  for_time: 'Coaching and notes — FOR TIME: wall ball',
  ladder: 'Coaching and notes — LADDER: push up, burpee',
}

/** The card's Coaching and notes disclosure: the slot the actions must precede. */
function coachingOf(format: TimedFormat): HTMLElement {
  return within(cardOf(format)).getByRole('button', { name: COACHING[format] })
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
      expect(within(card).getAllByRole('button', { name: /^Coaching and notes/ })).toHaveLength(1)
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

// ─────────────────────────────────────────────────────────────────────────────
// A3 TASK-105 — TASK-013: rep-first ordered live ladder progress and its handoff (C33, C34, C36)
// ─────────────────────────────────────────────────────────────────────────────

/** Explicit per-case time: each journey mounts the whole app; generous on a slower CI runner. */
const LADDER_TIMEOUT = 30_000

const FOUNDATION_CSS = readFileSync(resolve(ROOT, 'src/design-system/css/foundation.css'), 'utf8')

/** The stylesheets Round 7's ladder owners are drawn by: the rung tiles' own and the workout's. */
const LADDER_STYLESHEETS = ['src/ui/ladder-rungs.css', 'src/styles/workout-r7.css'] as const
const LADDER_CSS = LADDER_STYLESHEETS.map((file) => readFileSync(resolve(ROOT, file), 'utf8'))
  .join('\n')
  .replaceAll(/\/\*[\s\S]*?\*\//g, '')

/** Applies the ladder's stylesheets to the document (once), so the drawn recipe is read from the cascade. */
function applyLadderStylesheets() {
  for (const file of LADDER_STYLESHEETS) {
    if (document.head.querySelector(`style[data-task105="${file}"]`) !== null) continue
    const style = document.createElement('style')
    style.dataset.task105 = file
    style.textContent = readFileSync(resolve(ROOT, file), 'utf8')
    document.head.append(style)
  }
}

/** JOURNEY-013's session: started a minute before entry, both ladders ready. */
const LADDER_SESSION = () =>
  ladderHandoffSnapshot(ladderHandoffAcceptance(), {
    userId: FIXTURE_USER_ID,
    startedAt: new Date(clock - 60_000).toISOString(),
  })

type LadderKey = 'long' | 'short'

/**
 * Round 7's meta line for each ladder — its rounds and its one cap — which is
 * what tells the two cards apart (the build told them apart by its timing line).
 */
const LADDER_META: Readonly<Record<LadderKey, string>> = {
  long: `${LONG_ROUNDS} rounds · 09:00 cap`,
  short: `${SHORT_ROUNDS} rounds · 15:00 cap`,
}

/** Round 7's name for a ladder's round grid (`LadderPrescription`). */
const LADDER_ROUNDS_LIST = LISTS.ladder

/** JOURNEY-013's entry: `/workout`, behind the existing guard, both ladders ready in the first section. */
async function openLadders(options: Omit<WorkoutDoubleOptions, 'session'> = {}) {
  const snapshot = LADDER_SESSION()
  const double = createWorkoutDouble({ session: snapshot, ...options })
  const router = createMemoryRouter(routes, { initialEntries: ['/', '/workout'], initialIndex: 1 })
  const view = render(
    <AppProviders {...signedIn({ workout: double.clients })}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  await screen.findByRole('navigation', { name: 'Workout sections' })
  await screen.findByText(LADDER_META.long)
  await screen.findByText(LADDER_META.short)
  return { double, router, view, snapshot, ...ladderHandoffBlocks(snapshot) }
}

/** One ladder's Round 7 flow: its card, its clock and its log, told apart by its meta line. */
function ladderFlowOf(key: LadderKey): HTMLElement {
  const flow = screen.getByText(LADDER_META[key]).closest<HTMLElement>('.clr-timed-flow')
  if (flow === null) throw new Error(`the ${key} ladder has no timed flow`)
  return flow
}

/** One ladder's live card. */
function ladderCardOf(key: LadderKey): HTMLElement {
  const card = ladderFlowOf(key).querySelector('[data-movement-group-header]')?.closest<HTMLElement>('.clr-card') ?? null
  if (card === null) throw new Error(`the ${key} ladder has no live card`)
  return card
}

function ladderButton(key: LadderKey, name: string): HTMLElement {
  return within(ladderCardOf(key)).getByRole('button', { name })
}

/** The prescription's round grid: read-only tiles, or the live check-off while the race runs. */
function roundGrid(key: LadderKey): HTMLElement {
  return within(ladderCardOf(key)).getByRole('list', { name: LADDER_ROUNDS_LIST })
}

/** The live check-off's toggles, in round order; none while it is read-only. */
function liveToggles(key: LadderKey): HTMLElement[] {
  return within(roundGrid(key)).queryAllByRole('button')
}

/** The rounds pressed in the live check-off, by round number. */
function livePressed(key: LadderKey): number[] {
  return liveToggles(key)
    .filter((toggle) => toggle.getAttribute('aria-pressed') === 'true')
    .map((toggle) => Number(toggle.closest('li')!.dataset.ladderRound))
}

/** The live count beneath the rounds, or null when nothing can be tracked. */
function liveCount(key: LadderKey): string | null {
  const prescription = ladderCardOf(key).querySelector<HTMLElement>('[data-ladder-prescription]')!
  return within(prescription).queryByRole('status')?.textContent ?? null
}

/** The ladder's open log dialogs: Round 7's one "Log results" `LoggingOverlay`. */
function openLadderDialogs(key: LadderKey): HTMLDialogElement[] {
  return [...ladderFlowOf(key).querySelectorAll<HTMLDialogElement>('dialog[open]')].filter(
    (dialog) => dialog.querySelector('form.clr-timed-log') !== null,
  )
}

/**
 * TASK-046: the ladder's log, in the one "Log results" dialog its card opens —
 * opened by the card's own "Log results" action when it is not already open.
 * Null when the attempt offers no log: Round 7 draws one only once the attempt
 * has ended and while its result is unsaved (or being edited).
 */
function queryLadderLog(key: LadderKey): HTMLElement | null {
  if (openLadderDialogs(key).length === 0) {
    const opener = within(ladderCardOf(key)).queryByRole('button', { name: 'Log results' })
    if (opener === null) return null
    fireEvent.click(opener)
  }
  const open = openLadderDialogs(key)
  expect(open, `${key}: one open log`).toHaveLength(1)
  return open[0].querySelector<HTMLElement>('form.clr-timed-log')
}

function logOf(key: LadderKey): HTMLElement {
  const log = queryLadderLog(key)
  if (log === null) throw new Error(`the ${key} ladder offers no result log`)
  return log
}

function answerGroup(key: LadderKey): HTMLElement {
  return within(logOf(key)).getByRole('group', { name: WORK_COMPLETED })
}

/** The athlete's checked answer: none, Complete or Incomplete. */
function answerOf(key: LadderKey): string[] {
  return within(answerGroup(key)).queryAllByRole('radio', { checked: true }).map((radio) => radio.textContent ?? '')
}

async function answerWith(user: ReturnType<typeof userEvent.setup>, key: LadderKey, word: 'Complete' | 'Incomplete') {
  await user.click(within(answerGroup(key)).getByRole('radio', { name: word }))
}

/** The log's rep-first result tiles (`LadderCompletion`), or null when the log has none. */
function roundsGroup(key: LadderKey): HTMLElement | null {
  return within(logOf(key)).queryByRole('group', { name: ROUNDS_COMPLETED })
}

function resultTiles(key: LadderKey): HTMLElement[] {
  return within(roundsGroup(key)!).getAllByRole('button')
}

function resultTile(key: LadderKey, round: number): HTMLElement {
  const tile = resultTiles(key).find((candidate) => candidate.dataset.ladderRung === String(round))
  if (tile === undefined) throw new Error(`the ${key} log has no round ${round}`)
  return tile
}

function resultPressed(key: LadderKey): number[] {
  return resultTiles(key)
    .filter((tile) => tile.getAttribute('aria-pressed') === 'true')
    .map((tile) => Number(tile.dataset.ladderRung))
}

function resultCount(key: LadderKey): string {
  return within(roundsGroup(key)!).getByRole('status').textContent ?? ''
}

/**
 * The round any partial work belongs to (TASK-015's identity, not a field of
 * its own): Round 7 names it on each movement's amount field, `Completed in
 * round 5`. Null when no field asks for one.
 */
function partialRound(key: LadderKey): number | null {
  const named = within(logOf(key)).queryAllByText(/^Completed in round \d+$/)
  const rounds = new Set(named.map((label) => Number(/\d+$/.exec(label.textContent ?? '')![0])))
  expect(rounds.size, `${key}: at most one partial round`).toBeLessThanOrEqual(1)
  return [...rounds][0] ?? null
}

/** Rounds 1…n: an ordered prefix. */
const through = (count: number) => Array.from({ length: count }, (_, index) => index + 1)

/** The ladder's durable attempt, as the route stored it (TASK-032's record). */
function ladderAttemptRecord(blockId: string): Record<string, unknown> | undefined {
  return stored(WORKOUT_LADDER_STORAGE_KEY)[blockId]
}

/** Every column of the saved row a planned target or a timing could hide in. */
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

/** The row's result columns, as the shell's one writer would insert them. */
function ladderRow(double: ReturnType<typeof createWorkoutDouble>, blockId: string) {
  const rows = double.recorded().filter((row) => row.blockId === blockId)
  expect(rows, `one row for ${blockId}`).toHaveLength(1)
  return { completion: rows[0], insert: resultRow(rows[0]) }
}

const NOTHING_BUT_THE_RUNG = {
  minutes_completed: null, elapsed_seconds: null, completed_under_cap: null, rounds_completed: null,
  partial_round_reps: null, perceived_effort: null, notes: null,
}

async function saveLadders(user: ReturnType<typeof userEvent.setup>) {
  await closeLogs(user)
  await user.click(screen.getByRole('button', { name: 'Next section' }))
  await screen.findByRole('heading', { name: HANDOFF_COOLDOWN_TITLE })
}

/** The smallest value a design token takes at any breakpoint, in CSS pixels. */
function tokenFloor(name: string): number {
  const values = [...FOUNDATION_CSS.matchAll(new RegExp(`${name}:\\s*(\\d+(?:\\.\\d+)?)px`, 'g'))].map((match) => Number(match[1]))
  expect(values.length, name).toBeGreaterThan(0)
  return Math.min(...values)
}

function tokenCeiling(name: string): number {
  const values = [...FOUNDATION_CSS.matchAll(new RegExp(`${name}:\\s*(\\d+(?:\\.\\d+)?)px`, 'g'))].map((match) => Number(match[1]))
  expect(values.length, name).toBeGreaterThan(0)
  return Math.max(...values)
}

/**
 * A direct mount of one ladder block, as the route draws it (`BlockSlot` under
 * the product presentation), inside a bare completion seam that names its
 * session — so the route's own storage (`localStorage`) keeps its attempt.
 */
function mountLadderBlock(
  block: BlockFixture,
  completion: BlockCompletionApi,
  timing: BlockProgress['ladderTiming'] = null,
) {
  const snapshot = snapshotFixture({ sections: [{ title: 'Ladder', sectionType: 'conditioning', blocks: [block] }] })
  const progress: BlockProgress = { ...sessionProgress(snapshot).sections[0].blocks[0], ladderTiming: timing }
  const view = render(
    <WorkoutExperiencePresentationProvider value={PRODUCT_PRESENTATION}>
      <BlockCompletionContext value={completion}>
        <BlockSlot block={progress} />
      </BlockCompletionContext>
    </WorkoutExperiencePresentationProvider>,
  )
  return { ...view, block: progress }
}

/** A direct mount's one open log. */
function directLog(): HTMLElement {
  const open = openLogs()
  expect(open).toHaveLength(1)
  return open[0].querySelector<HTMLElement>('form.clr-timed-log')!
}

describe('TASK-013 rep-first ordered live ladder progress and result handoff', () => {
  beforeAll(applyLadderStylesheets)

  it('AC-C34-01 a running ladder’s rounds are its ordered live check-off on the real /workout route: a tap selects the prefix through it, the count says how many, no rung tile carries a check glyph, by touch and keyboard', async () => {
    const user = userEvent.setup()
    const { long, short } = await openLadders()

    // Ready: the prescription, read-only — no control and no count yet.
    expect(liveToggles('long')).toEqual([])
    expect(liveCount('long')).toBeNull()
    await user.click(ladderButton('long', 'Start ladder'))

    // Running: every round a toggle, in order, none pressed. R88: position and
    // target never confused — Round 7 names each toggle by its round
    // (`Complete round 3`) and describes its work in words; nothing stated is
    // not zero.
    let toggles = liveToggles('long')
    expect(toggles).toHaveLength(LONG_ROUNDS)
    expect(toggles.map((toggle) => toggle.closest('li')!.dataset.ladderRound)).toEqual(through(LONG_ROUNDS).map(String))
    expect(toggles.every((toggle) => toggle.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(toggles[2]).toHaveAccessibleName('Complete round 3')
    expect(toggles[2]).toHaveAccessibleDescription('kettlebell swing, 9 reps row, 200 m')
    expect(toggles[11]).toHaveAccessibleName('Complete round 12')
    expect(toggles[11]).toHaveAccessibleDescription('kettlebell swing, 36 reps row, 200 m')
    expect(liveCount('long')).toBe('No rounds marked yet')

    // A tap on R3 selects R1–R3: the prefix through it, and the count.
    await user.click(toggles[2])
    expect(livePressed('long')).toEqual(through(3))
    expect(liveCount('long')).toBe(`3 of ${LONG_ROUNDS} rounds completed`)
    // A tap inside the prefix leaves the rounds before it — never a gap.
    await user.click(liveToggles('long')[1])
    expect(livePressed('long')).toEqual([1])
    await user.click(liveToggles('long')[0])
    expect(livePressed('long')).toEqual([])
    // An explicit zero reads as zero, unlike nothing stated.
    expect(liveCount('long')).toBe(`0 of ${LONG_ROUNDS} rounds completed`)

    // Keyboard: each round is a real control — Enter, then Tab and Space —
    // and focus stays where it was.
    liveToggles('long')[4].focus()
    await user.keyboard('{Enter}')
    expect(livePressed('long')).toEqual(through(5))
    expect(document.activeElement).toBe(liveToggles('long')[4])
    await user.keyboard('{Tab}')
    expect(document.activeElement).toBe(liveToggles('long')[5])
    await user.keyboard(' ')
    expect(livePressed('long')).toEqual(through(6))
    // The count is a polite status: each change is announced.
    const status = within(ladderCardOf('long').querySelector<HTMLElement>('[data-ladder-prescription]')!).getByRole('status')
    expect(status).toHaveTextContent(`6 of ${LONG_ROUNDS} rounds completed`)

    // No literal check glyph on a rung tile, pressed or not (R92): the shared
    // Chip's tick is not drawn; the selected surface and the count carry it.
    toggles = liveToggles('long')
    for (const toggle of toggles) {
      for (const glyph of toggle.querySelectorAll('svg')) expect(getComputedStyle(glyph).display).toBe('none')
      expect(toggle.classList.contains('clr-chamfer--selected')).toBe(toggle.getAttribute('aria-pressed') === 'true')
    }
    expect(LADDER_CSS).toMatch(/\.clr-ladder-prescription__round > svg\s*\{\s*display:\s*none;?\s*\}/)
    expect(LADDER_CSS).toMatch(/\.clr-ladder-completion__tile > svg\s*\{\s*display:\s*none;?\s*\}/)

    // Stored as the attempt's ordered progress, under the ladder's own key —
    // never a For Time record beside it.
    expect(ladderAttemptRecord(long.blockId)).toMatchObject({ progress: 6, identity: { blockId: long.blockId } })
    expect(stored(WORKOUT_FOR_TIME_STORAGE_KEY)[long.blockId]).toBeUndefined()

    // Paused, the check-off stays the athlete's.
    advance(40)
    await user.click(ladderButton('long', 'Pause'))
    expect(liveToggles('long')).toHaveLength(LONG_ROUNDS)
    await user.click(liveToggles('long')[7])
    expect(livePressed('long')).toEqual(through(8))

    // The other ladder is its own: nothing to track before its own Start, nothing stored.
    expect(liveToggles('short')).toEqual([])
    expect(ladderAttemptRecord(short.blockId)).toBeUndefined()

    // Finish ends the check-off: the tiles are the prescription again.
    await user.click(ladderButton('long', 'Finish'))
    expect(liveToggles('long')).toEqual([])
    expect(liveCount('long')).toBeNull()
  }, LADDER_TIMEOUT)

  it('AC-R013-01 selecting a completed rung selects its preceding prefix and partial work belongs to the next rung: one contiguous run, never a gap, live and in the log, recorded as highest_rung alone', async () => {
    const user = userEvent.setup()
    const { double, long } = await openLadders()
    await user.click(ladderButton('long', 'Start ladder'))
    await user.click(liveToggles('long')[3])
    advance(200)
    await user.click(ladderButton('long', 'Finish'))

    // The log: the same prefix, and the round after it named as where any
    // partial work belongs — its identity, not a field of its own (TASK-015).
    expect(resultPressed('long')).toEqual(through(4))
    expect(partialRound('long')).toBe(5)

    // Any sequence of taps leaves one contiguous run from R1.
    for (const round of [9, 2, 11, 11, 1, 7, 7, 12, 3, 6]) {
      await user.click(resultTile('long', round))
      const pressed = resultPressed('long')
      expect(pressed, `after R${round}`).toEqual(through(pressed.length))
    }
    // 12 → Complete → R3 → [1,2] → R6 → 1…6.
    expect(resultPressed('long')).toEqual(through(6))
    expect(answerOf('long')).toEqual(['Incomplete'])
    expect(resultCount('long')).toBe(`6 of ${LONG_ROUNDS} rounds completed`)
    expect(partialRound('long')).toBe(7)

    // Every rung of the ladder, each way a tap can go: the rule is the
    // prefix's, and the partial round is always the rung after it (TASK-030's
    // rule, restated by TASK-032).
    const rungCount = ladderRungs(long.exercises).length
    for (const before of [null, ...Array.from({ length: rungCount + 1 }, (_, index) => index)]) {
      for (let rung = 1; rung <= rungCount; rung += 1) {
        const after = ladderPrefixAfterTap(rung, before)
        expect(after).toBeGreaterThanOrEqual(0)
        expect(after).toBeLessThanOrEqual(rungCount)
        // The tapped rung changes side: in the prefix after a tap outside it, and out after a tap inside it.
        expect(rung <= after).toBe(!(before !== null && rung <= before))
        expect(ladderPartialRound(after, rungCount)).toBe(after < rungCount ? after + 1 : null)
      }
    }

    // An explicit zero: no round completed, and round 1 is where any partial belongs.
    await user.click(resultTile('long', 1))
    expect(resultPressed('long')).toEqual([])
    expect(resultCount('long')).toBe(`0 of ${LONG_ROUNDS} rounds completed`)
    expect(partialRound('long')).toBe(1)
    // Complete: every rung, and no partial round.
    await user.click(resultTile('long', LONG_ROUNDS))
    expect(answerOf('long')).toEqual(['Complete'])
    expect(partialRound('long')).toBeNull()
    await user.click(resultTile('long', 6))
    expect(resultPressed('long')).toEqual(through(5))

    // One number holds it: no per-movement amount, no second model.
    expect(ladderAttemptRecord(long.blockId)).toMatchObject({ draft: { completed: false, highestRung: 5 } })
    expect((ladderAttemptRecord(long.blockId)?.draft as { movements: object }).movements).toEqual({})

    // Saved: the rounds completed through, and nothing else.
    await saveLadders(user)
    const row = ladderRow(double, long.blockId)
    expect(row.completion.outcome).toEqual({ highestRung: 5 })
    expect(row.insert).toEqual({ ...NOTHING_BUT_THE_RUNG, highest_rung: 5 })
  }, LADDER_TIMEOUT)

  it('AC-C36-01 checked live progress is imported at Finish into the editable log: every round checked starts Complete, a prefix Incomplete through its last round, and the athlete corrects either before the save', async () => {
    const user = userEvent.setup()
    const { double, long, short } = await openLadders()

    // The long ladder: five rounds checked, then Finish.
    await user.click(ladderButton('long', 'Start ladder'))
    advance(90)
    await user.click(liveToggles('long')[4])
    advance(90)
    // Before the end nothing is imported: Round 7 offers no log until the
    // attempt ends, and the durable attempt holds no answer.
    expect(queryLadderLog('long')).toBeNull()
    expect(ladderAttemptRecord(long.blockId)).toMatchObject({ progress: 5, draft: null, endCarried: false })
    await user.click(ladderButton('long', 'Finish'))
    expect(answerOf('long')).toEqual(['Incomplete'])
    expect(resultPressed('long')).toEqual(through(5))
    expect(resultCount('long')).toBe(`5 of ${LONG_ROUNDS} rounds completed`)
    expect(ladderAttemptRecord(long.blockId)).toMatchObject({ endCarried: true, draft: { completed: false, highestRung: 5 } })

    // Editable: a later round, then Complete, then Incomplete, which states
    // its round again rather than keeping the top one Complete recorded.
    await user.click(resultTile('long', 7))
    expect(resultPressed('long')).toEqual(through(7))
    await answerWith(user, 'long', 'Complete')
    expect(resultPressed('long')).toEqual(through(LONG_ROUNDS))
    expect(resultCount('long')).toBe(`${LONG_ROUNDS} of ${LONG_ROUNDS} rounds completed`)
    await answerWith(user, 'long', 'Incomplete')
    expect(answerOf('long')).toEqual(['Incomplete'])
    expect(resultPressed('long')).toEqual([])
    expect(resultCount('long')).toBe('No rounds marked yet')
    expect(ladderAttemptRecord(long.blockId)).toMatchObject({ draft: { completed: false, highestRung: null } })
    await user.click(resultTile('long', 7))
    // Planned targets are never entered as actuals by any of it.
    expect((ladderAttemptRecord(long.blockId)?.draft as { movements: object }).movements).toEqual({})

    // The short ladder: every round checked, then Finish — Complete, editable.
    await user.click(ladderButton('short', 'Start ladder'))
    for (const round of through(SHORT_ROUNDS)) {
      advance(30)
      await user.click(liveToggles('short')[round - 1])
    }
    expect(liveCount('short')).toBe(`${SHORT_ROUNDS} of ${SHORT_ROUNDS} rounds completed`)
    await user.click(ladderButton('short', 'Finish'))
    expect(answerOf('short')).toEqual(['Complete'])
    expect(resultPressed('short')).toEqual(through(SHORT_ROUNDS))
    expect(partialRound('short')).toBeNull()
    await user.click(resultTile('short', 4))
    expect(answerOf('short')).toEqual(['Incomplete'])
    expect(resultPressed('short')).toEqual(through(3))
    expect(partialRound('short')).toBe(4)

    // The save records the athlete's corrected rounds, and only them.
    await saveLadders(user)
    expect(ladderRow(double, long.blockId).insert).toEqual({ ...NOTHING_BUT_THE_RUNG, highest_rung: 7 })
    expect(ladderRow(double, short.blockId).insert).toEqual({ ...NOTHING_BUT_THE_RUNG, highest_rung: 3 })
    expect(double.loggedSets()).toEqual([])
  }, LADDER_TIMEOUT)

  it('AC-R013-03 Finish alone never selects every rung and planned targets never become actuals: nothing tracked starts Incomplete with no round stated and records nothing; the cap imports what was checked', async () => {
    const user = userEvent.setup()
    const { double, long, short } = await openLadders()

    // Finish with nothing tracked: Incomplete, how far asked, no round
    // selected, nothing recorded — never every rung.
    await user.click(ladderButton('long', 'Start ladder'))
    advance(120)
    await user.click(ladderButton('long', 'Finish'))
    expect(answerOf('long')).toEqual(['Incomplete'])
    expect(resultTiles('long')).toHaveLength(LONG_ROUNDS)
    expect(resultPressed('long')).toEqual([])
    expect(resultCount('long')).toBe('No rounds marked yet')
    expect(partialRound('long')).toBeNull()
    // Nothing was stated, so the draft holds no answer and no round.
    expect(ladderAttemptRecord(long.blockId)).toMatchObject({ progress: null, draft: null })

    // The short ladder runs into its cap with two rounds checked: the cap
    // imports them, and nothing more.
    await user.click(ladderButton('short', 'Start ladder'))
    advance(200)
    await user.click(liveToggles('short')[1])
    advance(SHORT_CAP_SECONDS)
    expect(attemptClock('short')).toMatchObject({ reading: '15:00', words: 'Cap reached' })
    expect(liveToggles('short')).toEqual([])
    expect(within(ladderCardOf('short')).queryByRole('button', { name: /^(Pause|Resume|Finish)$/ })).toBeNull()
    expect(answerOf('short')).toEqual(['Incomplete'])
    expect(resultPressed('short')).toEqual(through(2))
    expect(resultCount('short')).toBe(`2 of ${SHORT_ROUNDS} rounds completed`)
    expect(partialRound('short')).toBe(3)

    // Planned targets are prescription, never actuals: no amount for any
    // movement in either draft, and the rows carry only the rounds stated.
    for (const blockId of [long.blockId, short.blockId]) {
      const draft = (ladderAttemptRecord(blockId)?.draft ?? null) as { movements?: object } | null
      expect(draft === null ? {} : draft.movements).toEqual({})
    }
    await saveLadders(user)
    expect(ladderRow(double, long.blockId).completion.outcome).toEqual({})
    expect(ladderRow(double, long.blockId).insert).toEqual({ ...NOTHING_BUT_THE_RUNG, highest_rung: null })
    expect(ladderRow(double, short.blockId).insert).toEqual({ ...NOTHING_BUT_THE_RUNG, highest_rung: 2 })
    // Only the rounds stated are an outcome: no planned rep, second or metre.
    for (const row of double.recorded()) expect(Object.keys(row.outcome).every((key) => key === 'highestRung')).toBe(true)
    expect(double.loggedSets()).toEqual([])
  }, LADDER_TIMEOUT)

  it('AC-C33-01 the result tiles are rep-first and level: the rep target largest, the round secondary, the unit its own row, wrapping without a glyph for twelve and four rungs, one digit and two (AC-R013-02)', async () => {
    const user = userEvent.setup()
    await openLadders()
    await user.click(ladderButton('long', 'Start ladder'))
    await user.click(liveToggles('long')[2])
    await user.click(ladderButton('long', 'Finish'))
    await user.click(ladderButton('short', 'Start ladder'))
    await user.click(liveToggles('short')[3])
    await user.click(ladderButton('short', 'Finish'))

    for (const [key, targets, unit] of [['long', LONG_TARGETS, LONG_UNIT], ['short', SHORT_TARGETS, SHORT_UNIT]] as const) {
      const group = roundsGroup(key)!
      expect(group.tagName).toBe('FIELDSET')
      const tiles = resultTiles(key)
      expect(tiles).toHaveLength(targets.length)
      // One digit and two in the same ladder.
      expect(targets.some((target) => target < 10) && targets.some((target) => target >= 10)).toBe(true)
      tiles.forEach((tile, index) => {
        // R88: the round and the target both said, never confused.
        expect(tile).toHaveAccessibleName(`Round ${index + 1}: ${targets[index]} ${unit}`)
        // Three rows, in order: the round, the target, the unit (Round 7's
        // rep-first tile: `__round`, `__number`, then `__target` holding the unit).
        const content = tile.querySelector<HTMLElement>('.clr-ladder-completion__content')!
        expect(content).toHaveAttribute('aria-hidden', 'true')
        expect([...content.children].map((row) => [row.className, row.textContent])).toEqual([
          ['clr-ladder-completion__round', `R${index + 1}`],
          ['clr-ladder-completion__number', String(targets[index])],
          ['clr-ladder-completion__target', unit],
        ])
        // No literal check glyph (R92).
        for (const glyph of tile.querySelectorAll('svg')) expect(getComputedStyle(glyph).display).toBe('none')
        // The shared Chip: a real toggle with its pressed state and selected surface.
        expect(tile).toHaveClass('clr-chip', 'clr-ladder-completion__tile')
        expect(tile.parentElement).toHaveClass('clr-bleed')
        expect(tile.parentElement!.parentElement).toHaveClass('clr-ladder-completion__tiles')
      })
    }

    // The hierarchy from the cascade: the target in the heading face, the
    // round and the unit in the smallest label face — the target is the
    // largest at every breakpoint (R99), the round secondary.
    const sample = resultTiles('long')[11]
    const [round, number, unitRow] = [...sample.querySelector('.clr-ladder-completion__content')!.children] as HTMLElement[]
    expect(getComputedStyle(number).fontSize).toBe('var(--heading-h3-size)')
    expect(getComputedStyle(round).fontSize).toBe('var(--label-xs-size)')
    expect(getComputedStyle(unitRow).fontSize).toBe('var(--label-xs-size)')
    expect(tokenFloor('--heading-h3-size')).toBeGreaterThan(tokenCeiling('--label-xs-size'))
    // Level rows (R93): every row of every tile is one line with a fixed line
    // height — the round label never wraps, and the number and the unit are
    // each one unbroken token — so no label pushes its target below its peers.
    expect(getComputedStyle(round).whiteSpace).toBe('nowrap')
    for (const key of ['long', 'short'] as const) {
      for (const tile of resultTiles(key)) {
        const [, digits, unitText] = [...tile.querySelector('.clr-ladder-completion__content')!.children]
        expect(digits.textContent).toMatch(/^\d+$/)
        expect(unitText.textContent).toMatch(/^\S+$/)
      }
    }
    expect(getComputedStyle(number).lineHeight).toBe('var(--heading-h3-line-height)')
    expect(getComputedStyle(round).lineHeight).toBe('var(--label-xs-line-height)')
    expect(getComputedStyle(unitRow).lineHeight).toBe('var(--label-xs-line-height)')
    expect(getComputedStyle(sample.querySelector('.clr-ladder-completion__content')!).flexDirection).toBe('column')

    // Wrapping tiles (R77): a grid that adds columns as they fit, with no
    // horizontal scroller and no rail anywhere in the ladder.
    const tilesBox = roundsGroup('long')!.querySelector<HTMLElement>('.clr-ladder-completion__tiles')!
    expect(getComputedStyle(tilesBox).display).toBe('grid')
    expect(getComputedStyle(tilesBox).gridTemplateColumns)
      .toBe('repeat(auto-fill, minmax(calc(var(--control-height) + var(--spacing-500)), 1fr))')
    for (const key of ['long', 'short'] as const) {
      expect(ladderCardOf(key).querySelector('.clr-rail, .clr-rail__scroller, .clr-rungs')).toBeNull()
    }
    // No ladder rule makes a scroller of any kind (the browser proof measures it).
    const ladderRules = [...LADDER_CSS.matchAll(/([^{}]*clr-ladder[^{}]*)\{([^}]*)\}/g)]
    expect(ladderRules.length).toBeGreaterThan(10)
    for (const [, selector, body] of ladderRules) expect(body, selector).not.toMatch(/overflow[^:;]*:\s*(auto|scroll)/)
    // The selected prefix: pressed, on the shared selected surface; the rest not.
    expect(resultTiles('long').map((tile) => tile.getAttribute('aria-pressed'))).toEqual(
      through(LONG_ROUNDS).map((n) => String(n <= 3)),
    )
    expect(resultTiles('long').map((tile) => tile.classList.contains('clr-chamfer--selected'))).toEqual(
      through(LONG_ROUNDS).map((n) => n <= 3),
    )
  }, LADDER_TIMEOUT)

  it('JOURNEY-013 recovery: checked progress, the pause and the edited log survive close and reopen from the ladder’s durable record; effort stays unsaved; a saved ladder claims no answer', async () => {
    const user = userEvent.setup()
    const first = await openLadders()

    // The long ladder: three rounds checked, paused at 01:40.
    await user.click(ladderButton('long', 'Start ladder'))
    advance(60)
    await user.click(liveToggles('long')[2])
    advance(40)
    await user.click(ladderButton('long', 'Pause'))
    // The short ladder: running, two rounds checked.
    await user.click(ladderButton('short', 'Start ladder'))
    await user.click(liveToggles('short')[1])

    // Close the app; ten minutes later, reopen it.
    first.view.unmount()
    clock += 600_000
    const second = await openLadders()
    // Paused and frozen, its progress kept.
    expect(attemptClock('long')).toMatchObject({ reading: '01:40', words: 'Paused' })
    expect(within(ladderCardOf('long')).getByRole('button', { name: 'Resume' })).toBeInTheDocument()
    expect(livePressed('long')).toEqual(through(3))
    expect(liveCount('long')).toBe(`3 of ${LONG_ROUNDS} rounds completed`)
    // Running through the close, its progress kept.
    expect(attemptClock('short').reading).toBe('10:00')
    expect(livePressed('short')).toEqual(through(2))

    // Resume, track on, Finish; correct the log; answer an effort face.
    await user.click(ladderButton('long', 'Resume'))
    await user.click(liveToggles('long')[4])
    await user.click(ladderButton('long', 'Finish'))
    await user.click(resultTile('long', 8))
    await user.click(within(logOf('long')).getByRole('radio', { name: 'Too hard' }))

    // Close and reopen again: the edited log comes back, not re-imported over.
    // TASK-048 (AC-R032-01, superseding "the effort was this screen's alone"):
    // the effort is part of the durable draft, so it comes back as answered,
    // kept as the category word in the ladder's own record and nowhere else.
    second.view.unmount()
    clock += 30_000
    const third = await openLadders()
    expect(answerOf('long')).toEqual(['Incomplete'])
    expect(resultPressed('long')).toEqual(through(8))
    expect(within(logOf('long')).queryAllByRole('radio', { checked: true }).map((radio) => radio.textContent)).toEqual(['Incomplete', 'Too hard'])
    expect(stored(WORKOUT_LADDER_STORAGE_KEY)[third.long.blockId]).toMatchObject({ draft: { effort: 'too_hard' } })
    expect(JSON.stringify(stored(WORKOUT_FOR_TIME_STORAGE_KEY))).not.toMatch(/too_hard|about_right|too_easy/)
    // One durable record per ladder; the For Time record is never written for one.
    expect(Object.keys(stored(WORKOUT_LADDER_STORAGE_KEY)).sort()).toEqual([third.long.blockId, third.short.blockId].sort())
    expect(stored(WORKOUT_FOR_TIME_STORAGE_KEY)).toEqual({})

    // The short ladder finishes now with its two rounds.
    await user.click(ladderButton('short', 'Finish'))
    expect(resultPressed('short')).toEqual(through(2))
    await saveLadders(user)
    expect(ladderRow(third.double, third.long.blockId).insert).toEqual({ ...NOTHING_BUT_THE_RUNG, highest_rung: 8 })
    expect(ladderRow(third.double, third.short.blockId).insert).toEqual({ ...NOTHING_BUT_THE_RUNG, highest_rung: 2 })

    // Back to the saved section: the saved row is the answer, and nothing is
    // offered as a choice; no clock action. TASK-048 (AC-R032-02, superseding
    // "claims no answer"): the saved result is read back — through 8 and
    // through 2 — rather than nothing. On Round 7 a saved ladder shows its
    // saved log (`Log saved`, its rungs read back from the row) with no open
    // answer, no live check-off and no Undo.
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    await screen.findByText(LADDER_META.long)
    for (const [key, rung] of [['long', 8], ['short', 2]] as const) {
      const savedLog = ladderCardOf(key).querySelector<HTMLElement>('[data-timed-saved]')!
      expect(within(savedLog).getByRole('status')).toHaveTextContent('Log saved')
      expect(savedLog).toHaveTextContent(` · ${rung} rungs`)
      expect(queryLadderLog(key)).toBeNull()
      expect(liveToggles(key)).toEqual([])
      expect(within(ladderCardOf(key)).queryByRole('button', { name: /^(Start ladder|Pause|Resume|Finish)$/ })).toBeNull()
      expect(within(ladderCardOf(key)).queryByRole('button', { name: /^Undo finish|^Resume ladder$/ })).toBeNull()
      expect(within(ladderCardOf(key)).getByText('Block saved')).toBeInTheDocument()
    }
    expect(within(ladderCardOf('long')).getByText('Effort: Too hard')).toBeInTheDocument()
    expect(third.double.recorded()).toHaveLength(2)
  }, LADDER_TIMEOUT)

  it('JOURNEY-013 a ladder with no cap, a ladder clock an older build stored and a schedule: one durable attempt each, the progress imported only at Finish, and a schedule’s rounds stated by the athlete', async () => {
    const user = userEvent.setup()
    const reports: { blockId: string; outcome: BlockOutcome }[] = []
    const completion: BlockCompletionApi = {
      reportOutcome: (blockId, outcome) => void reports.push({ blockId, outcome }),
      isBlockRecorded: () => false,
      sessionId: 'session-task-013',
    }
    const lastOf = (blockId: string) => reports.filter((report) => report.blockId === blockId).at(-1)?.outcome
    const pullUps = { prescription: { exercise_id: 'pull-up', target_kind: 'sequence' as const, target_value: null, target_sequence: [1, 3, 5, 7, 9, 11] } }

    // No cap: a legacy ladder whose block carries no clock. It runs for an
    // hour and never caps; only Finish imports what was checked.
    const uncapped = mountLadderBlock({ structureType: 'for_time', repScheme: 'ladder_up', timerType: 'countdown', timerSeconds: null, exercises: [pullUps] }, completion)
    await user.click(screen.getByRole('button', { name: 'Start ladder' }))
    await user.click(within(screen.getByRole('list', { name: LADDER_ROUNDS_LIST })).getAllByRole('button')[1])
    advance(3600)
    expect(screen.queryByText('Cap reached')).toBeNull()
    expect(within(screen.getByRole('list', { name: LADDER_ROUNDS_LIST })).getAllByRole('button')).toHaveLength(6)
    expect(lastOf(uncapped.block.blockId)).toEqual({})
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    expect(within(within(directLog()).getByRole('group', { name: ROUNDS_COMPLETED })).getAllByRole('button')
      .filter((tile) => tile.getAttribute('aria-pressed') === 'true')).toHaveLength(2)
    expect(lastOf(uncapped.block.blockId)).toEqual({ highestRung: 2 })
    expect(stored(WORKOUT_LADDER_STORAGE_KEY)[uncapped.block.blockId]).toMatchObject({
      originalCapSeconds: null, identity: { sessionId: 'session-task-013' },
    })
    uncapped.unmount()
    localStorage.clear()

    // A ladder clock an older build kept under the For Time key: adopted once,
    // still running, and tracked from here; the For Time record is left as it was.
    const legacy = { structureType: 'for_time' as const, repScheme: 'ladder_up' as const, timerType: 'countdown' as const, timerSeconds: 600, exercises: [pullUps] }
    const blockId = sessionProgress(snapshotFixture({ sections: [{ title: 'Ladder', sectionType: 'conditioning', blocks: [legacy] }] })).sections[0].blocks[0].blockId
    const olderClock = JSON.stringify({ [blockId]: { startedAt: new Date(clock - 120_000).toISOString(), finishedAt: null } })
    localStorage.setItem(WORKOUT_FOR_TIME_STORAGE_KEY, olderClock)
    const adopted = mountLadderBlock(legacy, completion)
    expect(within(adopted.container).getByRole('timer')).toHaveTextContent('02:00')
    await user.click(within(screen.getByRole('list', { name: LADDER_ROUNDS_LIST })).getAllByRole('button')[2])
    expect(stored(WORKOUT_LADDER_STORAGE_KEY)[blockId]).toMatchObject({ progress: 3 })
    expect(localStorage.getItem(WORKOUT_FOR_TIME_STORAGE_KEY)).toBe(olderClock)
    adopted.unmount()
    localStorage.clear()

    // A schedule: its start stamp in the same durable record, no cap, no
    // check-off (its own clock marks the live round), and its end starts the
    // log at Incomplete with no round; the athlete states the rounds, which a
    // reopen keeps.
    const schedule = { structureType: 'emom' as const, repScheme: 'ladder_up' as const, timerType: 'per_minute' as const, timerSeconds: 180, exercises: [{ prescription: { exercise_id: 'thruster', target_kind: 'sequence' as const, target_value: null, target_sequence: [3, 5, 7] } }] }
    const timing = { mode: 'scheduled_starts' as const, rounds: 3, interval_seconds: 60, cap_seconds: null }
    const run = mountLadderBlock(schedule, completion, timing)
    await user.click(screen.getByRole('button', { name: 'Start schedule' }))
    advance(70)
    expect(within(screen.getByRole('list', { name: LADDER_ROUNDS_LIST })).queryAllByRole('button')).toEqual([])
    expect(stored(WORKOUT_LADDER_STORAGE_KEY)[run.block.blockId]).toMatchObject({
      originalCapSeconds: null, clock: { startedAt: new Date(clock - 70_000).toISOString(), finishedAt: null },
    })
    advance(120)
    expect(screen.getByText('COMPLETE')).toBeInTheDocument()
    const ending = within(directLog()).getByRole('group', { name: WORK_COMPLETED })
    expect(within(ending).getByRole('radio', { name: 'Incomplete' })).toHaveAttribute('aria-checked', 'true')
    expect(lastOf(run.block.blockId)).toEqual({})
    await user.click(within(within(directLog()).getByRole('group', { name: ROUNDS_COMPLETED })).getByRole('button', { name: 'Round 2: 5 reps' }))
    expect(lastOf(run.block.blockId)).toEqual({ highestRung: 2 })
    run.unmount()
    const reopened = mountLadderBlock(schedule, completion, timing)
    fireEvent.click(screen.getByRole('button', { name: 'Log results' }))
    expect(within(within(directLog()).getByRole('group', { name: ROUNDS_COMPLETED })).getByRole('status')).toHaveTextContent('2 of 3 rounds completed')
    expect(lastOf(reopened.block.blockId)).toEqual({ highestRung: 2 })
  }, LADDER_TIMEOUT)

  it('JOURNEY-013 gallery ladder-4 and ladder-12 draw the actual ladder renderer: live check-off, then the rep-first handoff into its log, over memory only', async () => {
    const user = userEvent.setup()
    const fetch = vi.spyOn(globalThis, 'fetch')
    for (const rounds of [4, 12] as const) {
      render(
        <MemoryRouter initialEntries={[`/gallery/refinements?state=ladder-${rounds}`]}>
          <GalleryRefinements />
        </MemoryRouter>,
      )
      const state = document.querySelector<HTMLElement>(`[data-refinement-state="ladder-${rounds}"]`)!
      const card = cardOf('ladder', state)
      const grid = within(card).getByRole('list', { name: LADDER_ROUNDS_LIST })
      expect(within(grid).queryAllByRole('button')).toEqual([])
      await user.click(within(card).getByRole('button', { name: 'Start ladder' }))
      const toggles = within(grid).getAllByRole('button')
      expect(toggles).toHaveLength(rounds)
      await user.click(toggles[1])
      expect(within(card.querySelector<HTMLElement>('[data-ladder-prescription]')!).getByRole('status'))
        .toHaveTextContent(`2 of ${rounds} rounds completed`)
      await user.click(within(card).getByRole('button', { name: 'Finish' }))

      // The handoff: Incomplete through R2, rep-first, the accepted push up's targets.
      // TASK-046: in the one "Log results" dialog, opened at Finish.
      const dialogs = openLogs().filter((dialog) => state.contains(dialog))
      expect(dialogs).toHaveLength(1)
      const log = dialogs[0].querySelector<HTMLElement>('form.clr-timed-log')!
      expect(within(within(log).getByRole('group', { name: WORK_COMPLETED })).getByRole('radio', { name: 'Incomplete' }))
        .toHaveAttribute('aria-checked', 'true')
      const tiles = within(within(log).getByRole('group', { name: ROUNDS_COMPLETED })).getAllByRole('button')
      expect(tiles.map((tile) => tile.getAttribute('aria-label'))).toEqual(pushUpRungs(rounds).map((reps, index) => `Round ${index + 1}: ${reps} reps`))
      expect(tiles.map((tile) => tile.getAttribute('aria-pressed'))).toEqual(through(rounds).map((n) => String(n <= 2)))
      await user.click(within(within(log).getByRole('group', { name: WORK_COMPLETED })).getByRole('radio', { name: 'Complete' }))
      expect(tiles.every((tile) => tile.getAttribute('aria-pressed') === 'true')).toBe(true)
      // Memory only: the route's storage is untouched, under every key.
      expect(localStorage.length).toBe(0)
      cleanup()
    }
    expect(fetch).not.toHaveBeenCalled()
  }, LADDER_TIMEOUT)
})

// ─────────────────────────────────────────────────────────────────────────────
// A3 TASK-105 — TASK-014: accidental Finish recovery with an aligned quiet Undo (C38, C39, C60)
// ─────────────────────────────────────────────────────────────────────────────

/** Heavier journeys: several close/reopen cycles of the whole app. */
const UNDO_TIMEOUT = 45_000

/**
 * Round 7's quiet action in the log (`TimedWorkoutFlow`'s completion action),
 * whose words are also its name — the accepted gallery's `Undo finish · resume
 * ladder` — and the card's own secondary `Resume ladder` beside "Log results".
 */
const UNDO_FINISH = 'Undo finish · resume ladder'
const RESUME_LADDER = 'Resume ladder'

/** The quiet Undo in an attempt's log, or null when it is not offered (or the attempt offers no log). */
function undoOf(key: LadderKey): HTMLElement | null {
  const log = queryLadderLog(key)
  return log === null ? null : within(log).queryByRole('button', { name: UNDO_FINISH })
}

/**
 * The attempt's clock: its reading, its phase in words (Round 7's timer
 * caption) and the original cap it is raced against, in seconds — which Round 7
 * states as its meta line and keeps on the flow as `data-cap-seconds`.
 */
function attemptClock(key: LadderKey): { reading: string; words: string; cap: string | null } {
  const flow = ladderFlowOf(key)
  const timer = within(flow).getByRole('timer')
  return {
    reading: [...timer.children].map((part) => part.textContent ?? '').find((text) => /^\d{2}:\d{2}$/.test(text)) ?? '',
    words: timer.firstElementChild?.textContent ?? '',
    cap: flow.dataset.capSeconds ?? null,
  }
}

/** The race's Start / Pause / Resume / Finish controls in the card, by name. */
function lifecycleControls(key: LadderKey): string[] {
  return within(ladderCardOf(key))
    .queryAllByRole('button', { name: /^(Start ladder|Pause|Resume|Finish)$/ })
    .map((button) => button.textContent ?? '')
}

/** The log's effort face that is chosen, if any. */
function effortOf(key: LadderKey): string[] {
  return ['Too hard', 'About right', 'Too easy'].filter(
    (name) => within(logOf(key)).getByRole('radio', { name }).getAttribute('aria-checked') === 'true',
  )
}

/** The durable attempt as the route stored it, typed for the fields Undo restores. */
interface StoredAttempt {
  identity: { sessionId: string; blockId: string; attemptId: string }
  originalCapSeconds: number | null
  clock: { startedAt: string | null; finishedAt: string | null; pausedAt?: string }
  progress: number | null
  draft: { completed: boolean | null; highestRung: number | null; effort: string | null } | null
  endCarried: boolean
  checkpoint: { pausedAt: string | null; progress: number | null; completed: boolean | null } | null
  save: { status: string; source?: string }
}

function attemptRecord(blockId: string): StoredAttempt {
  const record = ladderAttemptRecord(blockId)
  if (record === undefined) throw new Error(`no stored attempt for ${blockId}`)
  return record as unknown as StoredAttempt
}

/** Reopens the app after the section was saved: the shell comes back on its cooldown. */
async function reopenAtCooldown(options: Omit<WorkoutDoubleOptions, 'session'> = {}) {
  const double = createWorkoutDouble({ session: LADDER_SESSION(), ...options })
  const router = createMemoryRouter(routes, { initialEntries: ['/', '/workout'], initialIndex: 1 })
  const view = render(
    <AppProviders {...signedIn({ workout: double.clients })}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  await screen.findByRole('navigation', { name: 'Workout sections' })
  await screen.findByRole('heading', { name: HANDOFF_COOLDOWN_TITLE })
  return { double, view }
}

describe('TASK-014 accidental Finish recovery with an aligned quiet undo', () => {
  beforeAll(applyLadderStylesheets)

  it('AC-R014-03 undo while running returns the same attempt within its original cap: the time spent finished counts and none is granted, the checked progress and the log’s entries come back, the answer returns to before Finish, and nothing completes the workout (AC-C38-01)', async () => {
    const user = userEvent.setup()
    const { double, long, short } = await openLadders()

    // The twelve-round attempt: three rounds checked, then Finish at 03:00.
    await user.click(ladderButton('long', 'Start ladder'))
    advance(60)
    await user.click(liveToggles('long')[2])
    advance(120)
    const before = attemptRecord(long.blockId)
    await user.click(ladderButton('long', 'Finish'))
    expect(attemptClock('long')).toMatchObject({ reading: '03:00', words: 'Finished' })
    expect(answerOf('long')).toEqual(['Incomplete'])
    expect(resultPressed('long')).toEqual(through(3))
    // The athlete's log: the rounds corrected to four, an effort face.
    await user.click(resultTile('long', 4))
    await user.click(within(logOf('long')).getByRole('radio', { name: 'Too hard' }))
    expect(lifecycleControls('long')).toEqual([])

    // Thirty seconds later: Undo.
    advance(30)
    await user.click(undoOf('long')!)
    // The same attempt, running from the same start: the thirty seconds spent
    // finished count, and the cap it runs against is the original one (09:00,
    // so 05:30 is left).
    expect(attemptClock('long')).toEqual({ reading: '03:30', words: 'Elapsed', cap: String(LONG_CAP_SECONDS) })
    expect(lifecycleControls('long')).toEqual(['Pause', 'Finish'])
    expect(undoOf('long')).toBeNull()
    // Progress from the log's rounds; the log's entries kept; the answer as
    // it was before Finish — none — so no rounds are claimed: Round 7 offers
    // no log while the attempt runs, and the durable draft keeps the rung and
    // the effort with no answer.
    expect(livePressed('long')).toEqual(through(4))
    expect(liveCount('long')).toBe(`4 of ${LONG_ROUNDS} rounds completed`)
    expect(queryLadderLog('long')).toBeNull()
    const after = attemptRecord(long.blockId)
    expect(after.identity).toEqual(before.identity)
    expect(after.originalCapSeconds).toBe(9 * 60)
    expect(after.clock).toEqual({ startedAt: before.clock.startedAt, finishedAt: null })
    expect(after).toMatchObject({ progress: 4, checkpoint: null, endCarried: false, save: { status: 'unsaved' } })
    expect(after.draft).toMatchObject({ completed: null, highestRung: 4, effort: 'too_hard' })
    // No answer of another format is stored for it.
    expect(stored(WORKOUT_FOR_TIME_STORAGE_KEY)).toEqual({})

    // Within the original cap, never past it: running at 08:59, capped at 09:00.
    advance(329)
    expect(attemptClock('long')).toMatchObject({ reading: '08:59', words: 'Elapsed' })
    advance(1)
    expect(attemptClock('long')).toMatchObject({ reading: '09:00', words: 'Cap reached' })
    expect(lifecycleControls('long')).toEqual([])
    expect(answerOf('long')).toEqual(['Incomplete'])
    expect(resultPressed('long')).toEqual(through(4))
    expect(effortOf('long')).toEqual(['Too hard'])
    // The cap is not an accidental Finish: it is never undone.
    expect(undoOf('long')).toBeNull()

    // The four-round attempt, shaped otherwise: every round, Finish, Undo at once.
    await user.click(ladderButton('short', 'Start ladder'))
    await user.click(liveToggles('short')[3])
    advance(45)
    await user.click(ladderButton('short', 'Finish'))
    expect(answerOf('short')).toEqual(['Complete'])
    await user.click(undoOf('short')!)
    expect(attemptClock('short')).toEqual({ reading: '00:45', words: 'Elapsed', cap: String(SHORT_CAP_SECONDS) })
    expect(livePressed('short')).toEqual(through(SHORT_ROUNDS))
    expect(queryLadderLog('short')).toBeNull()
    expect(attemptRecord(short.blockId).draft).toMatchObject({ completed: null, highestRung: SHORT_ROUNDS })
    await user.click(ladderButton('short', 'Finish'))
    expect(answerOf('short')).toEqual(['Complete'])

    // Neither Finish nor Undo completed or left the workout, or wrote a row.
    expect(double.recorded()).toEqual([])
    expect(double.completed()).toEqual([])
    expect(screen.getByRole('button', { name: 'Next section' })).toBeInTheDocument()
    expect(screen.getByText(LADDER_META.long)).toBeInTheDocument()
  }, UNDO_TIMEOUT)

  it('AC-C38-01 undo while paused pauses the same attempt again at the same moment with its progress; resumed, finished again and saved, each of two differently shaped attempts writes exactly one row with the truthful highest round completed', async () => {
    const user = userEvent.setup()
    const { double, long, short } = await openLadders()

    // Two rounds checked, paused at 01:40, left paused for ten minutes, then Finish.
    await user.click(ladderButton('long', 'Start ladder'))
    advance(60)
    await user.click(liveToggles('long')[1])
    advance(40)
    await user.click(ladderButton('long', 'Pause'))
    const paused = attemptRecord(long.blockId).clock
    expect(paused.pausedAt).toBeDefined()
    advance(600)
    await user.click(ladderButton('long', 'Finish'))
    // Finished where it stood: at the pause.
    expect(attemptClock('long')).toMatchObject({ reading: '01:40', words: 'Finished' })
    expect(answerOf('long')).toEqual(['Incomplete'])
    expect(attemptRecord(long.blockId).checkpoint).toEqual({ pausedAt: paused.pausedAt, progress: 2, completed: null })

    // A paused Finish never runs out: an hour later, Undo is still offered.
    advance(3600)
    await user.click(undoOf('long')!)
    expect(attemptClock('long')).toEqual({ reading: '01:40', words: 'Paused', cap: String(LONG_CAP_SECONDS) })
    expect(lifecycleControls('long')).toEqual(['Resume', 'Finish'])
    expect(livePressed('long')).toEqual(through(2))
    expect(queryLadderLog('long')).toBeNull()
    expect(attemptRecord(long.blockId).draft).toMatchObject({ completed: null, highestRung: 2 })
    expect(attemptRecord(long.blockId).clock).toEqual(paused)
    // Still paused: no time passes for it.
    advance(600)
    expect(attemptClock('long').reading).toBe('01:40')

    // Resumed from there; more rounds; Finish again.
    await user.click(ladderButton('long', 'Resume'))
    advance(60)
    expect(attemptClock('long')).toMatchObject({ reading: '02:40', words: 'Elapsed', cap: String(LONG_CAP_SECONDS) })
    await user.click(liveToggles('long')[5])
    await user.click(ladderButton('long', 'Finish'))
    expect(answerOf('long')).toEqual(['Incomplete'])
    expect(resultPressed('long')).toEqual(through(6))

    // The four-round attempt: every round, Finish, Undo, round four taken
    // back on the live check-off, Finish again.
    await user.click(ladderButton('short', 'Start ladder'))
    await user.click(liveToggles('short')[3])
    advance(20)
    await user.click(ladderButton('short', 'Finish'))
    expect(answerOf('short')).toEqual(['Complete'])
    await user.click(undoOf('short')!)
    expect(livePressed('short')).toEqual(through(SHORT_ROUNDS))
    await user.click(liveToggles('short')[3])
    expect(livePressed('short')).toEqual(through(3))
    await user.click(ladderButton('short', 'Finish'))
    expect(answerOf('short')).toEqual(['Incomplete'])
    expect(resultPressed('short')).toEqual(through(3))

    // Saved: one row each, with the rounds actually completed through, and nothing else.
    await saveLadders(user)
    expect(double.recorded()).toHaveLength(2)
    expect(ladderRow(double, long.blockId).insert).toEqual({ ...NOTHING_BUT_THE_RUNG, highest_rung: 6 })
    expect(ladderRow(double, short.blockId).insert).toEqual({ ...NOTHING_BUT_THE_RUNG, highest_rung: 3 })
    expect(attemptRecord(long.blockId)).toMatchObject({ checkpoint: null, save: { status: 'saved' } })
  }, UNDO_TIMEOUT)

  it('AC-R014-03 undo is withdrawn the moment it would resume at the original cap, unprompted and for good, and the cap itself is never undone: the finished time, the log and its correction stay and are saved', async () => {
    const user = userEvent.setup()
    const first = await openLadders()

    // Finish at 08:20 of a 09:00 cap.
    await user.click(ladderButton('long', 'Start ladder'))
    advance(500)
    await user.click(liveToggles('long')[6])
    await user.click(ladderButton('long', 'Finish'))
    expect(undoOf('long')).not.toBeNull()
    // Undoing at 08:59 would still resume inside the cap…
    advance(39)
    expect(undoOf('long')).not.toBeNull()
    // …at 09:00 it would not: the action is gone, with nothing pressed.
    advance(1)
    expect(undoOf('long')).toBeNull()
    expect(screen.queryAllByRole('button', { name: RESUME_LADDER })).toEqual([])
    expect(attemptClock('long')).toMatchObject({ reading: '08:20', words: 'Finished' })
    expect(lifecycleControls('long')).toEqual([])
    // The log is the athlete's still.
    expect(answerOf('long')).toEqual(['Incomplete'])
    await user.click(resultTile('long', 8))
    expect(resultPressed('long')).toEqual(through(8))

    // For good: a reopen does not bring it back.
    first.view.unmount()
    clock += 60_000
    const second = await openLadders()
    expect(undoOf('long')).toBeNull()
    expect(attemptClock('long')).toMatchObject({ reading: '08:20', words: 'Finished' })
    expect(answerOf('long')).toEqual(['Incomplete'])
    expect(resultPressed('long')).toEqual(through(8))

    // The four-round attempt runs into its cap: never an Undo, before or after.
    await user.click(ladderButton('short', 'Start ladder'))
    await user.click(liveToggles('short')[1])
    expect(undoOf('short')).toBeNull()
    advance(SHORT_CAP_SECONDS)
    expect(attemptClock('short')).toMatchObject({ words: 'Cap reached' })
    expect(undoOf('short')).toBeNull()
    expect(answerOf('short')).toEqual(['Incomplete'])
    expect(resultPressed('short')).toEqual(through(2))

    await saveLadders(user)
    expect(ladderRow(second.double, second.long.blockId).insert).toEqual({ ...NOTHING_BUT_THE_RUNG, highest_rung: 8 })
    expect(ladderRow(second.double, second.short.blockId).insert).toEqual({ ...NOTHING_BUT_THE_RUNG, highest_rung: 2 })
  }, UNDO_TIMEOUT)

  it('AC-R014-03 undo survives close and reopen and a failed save with its draft kept, and a successful save ends it at once and durably, even when a reopen cannot read the saved row back', async () => {
    const user = userEvent.setup()
    const rows: BlockCompletion[] = []
    let refuse: (completion: BlockCompletion) => boolean = () => true
    const record = vi.fn(async (completion: BlockCompletion) => {
      if (refuse(completion)) return err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))
      rows.push(completion)
      return ok({} as BlockResultRow)
    })
    const first = await openLadders({ blockResults: { record } })

    // Five rounds, Finish at 02:00, the log corrected to six.
    await user.click(ladderButton('long', 'Start ladder'))
    advance(120)
    await user.click(liveToggles('long')[4])
    await user.click(ladderButton('long', 'Finish'))
    await user.click(resultTile('long', 6))

    // Closed and reopened: the same Finish, its log and its Undo.
    first.view.unmount()
    clock += 20_000
    await openLadders({ blockResults: { record } })
    expect(undoOf('long')).not.toBeNull()
    expect(attemptClock('long')).toMatchObject({ reading: '02:00', words: 'Finished' })
    expect(answerOf('long')).toEqual(['Incomplete'])
    expect(resultPressed('long')).toEqual(through(6))

    // The save fails: nothing is written, and nothing is discarded.
    await closeLogs(user)
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    const failed = await screen.findByRole('dialog', { name: /didn’t save/ })
    expect(failed).toHaveTextContent('That didn’t save')
    expect(record).toHaveBeenCalledTimes(1)
    expect(rows).toEqual([])
    await user.click(within(failed).getByRole('button', { name: 'Close' }))
    expect(undoOf('long')).not.toBeNull()
    expect(answerOf('long')).toEqual(['Incomplete'])
    expect(resultPressed('long')).toEqual(through(6))
    expect(attemptRecord(first.long.blockId).checkpoint).not.toBeNull()

    // Closed and reopened again after the failure: still offered.
    cleanup()
    clock += 10_000
    const third = await openLadders({ blockResults: { record } })
    expect(undoOf('long')).not.toBeNull()
    expect(resultPressed('long')).toEqual(through(6))

    // Undo: the same attempt, running on from its start (02:00 + 30 s closed).
    await user.click(undoOf('long')!)
    expect(attemptClock('long')).toMatchObject({ reading: '02:30', words: 'Elapsed' })
    expect(livePressed('long')).toEqual(through(6))
    await user.click(liveToggles('long')[7])
    await user.click(ladderButton('long', 'Finish'))
    expect(answerOf('long')).toEqual(['Incomplete'])
    expect(resultPressed('long')).toEqual(through(8))

    // Its row saves, the next block's does not: the athlete stays on the
    // section, and the saved attempt offers no Undo — at once.
    refuse = (completion) => completion.blockId === third.short.blockId
    await closeLogs(user)
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    const partial = await screen.findByRole('dialog', { name: /didn’t save/ })
    expect(record).toHaveBeenCalledTimes(3)
    expect(rows.map((row) => [row.blockId, resultRow(row).highest_rung])).toEqual([[third.long.blockId, 8]])
    await user.click(within(partial).getByRole('button', { name: 'Close' }))
    expect(screen.queryAllByRole('button', { name: UNDO_FINISH })).toEqual([])
    expect(screen.queryAllByRole('button', { name: RESUME_LADDER })).toEqual([])
    expect(lifecycleControls('long')).toEqual([])
    expect(attemptRecord(third.long.blockId)).toMatchObject({ checkpoint: null, save: { status: 'saved' } })

    // The retry saves the rest: one row each, the first never written twice.
    refuse = () => false
    await saveLadders(user)
    expect(record).toHaveBeenCalledTimes(4)
    expect(rows.map((row) => [row.blockId, resultRow(row).highest_rung])).toEqual([
      [third.long.blockId, 8],
      [third.short.blockId, null],
    ])
    // Closed in the same act as the save, before the section was left: no
    // Undo checkpoint survives in the durable record of either attempt.
    for (const blockId of [third.long.blockId, third.short.blockId]) {
      expect(attemptRecord(blockId)).toMatchObject({ checkpoint: null, save: { status: 'saved' } })
    }

    // Reopened where the saved row cannot be read back: still no Undo,
    // nothing to choose or start. TASK-048 (AC-R032-02, superseding "no
    // draft claimed"): each attempt this device saved shows the draft it
    // saved — the long through 8, the short with no round — never a starting
    // point; on Round 7 that is its saved log, with no log to answer.
    third.view.unmount()
    clock += 60_000
    await reopenAtCooldown({
      blockResults: { record },
      sessions: { asPerformed: async () => err(createError(ErrorCode.PERSISTENCE_READ_FAILED)) },
    })
    await closeLogs(user)
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    await screen.findByText(LADDER_META.long)
    for (const [key, shown] of [['long', ' · 8 rungs'], ['short', null]] as const) {
      const savedLog = ladderCardOf(key).querySelector<HTMLElement>('[data-timed-saved]')!
      expect(within(savedLog).getByRole('status')).toHaveTextContent('Log saved')
      if (shown === null) expect(savedLog.textContent).not.toMatch(/rungs/)
      else expect(savedLog).toHaveTextContent(shown)
      expect(undoOf(key)).toBeNull()
      expect(within(ladderCardOf(key)).queryByRole('group', { name: WORK_COMPLETED })).toBeNull()
      expect(lifecycleControls(key)).toEqual([])
      expect(liveToggles(key)).toEqual([])
    }
    expect(record).toHaveBeenCalledTimes(4)
  }, UNDO_TIMEOUT)

  it('AC-R014-01 the quiet undo sits below Complete and Incomplete and before Rounds completed, left-aligned with no inherited inset, the existing small quiet button at the shared control height, reached by Tab and taking no confirmation (AC-C39-01, AC-C60-01, AC-R014-02)', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await openLadders()

    // Never offered before an athlete's Finish: ready, running or paused
    // (TASK-046: read in the ladder's log, which Round 7 offers once ended).
    expect(screen.queryAllByRole('button', { name: UNDO_FINISH })).toEqual([])
    expect(undoOf('long')).toBeNull()
    await user.click(ladderButton('long', 'Start ladder'))
    advance(90)
    expect(undoOf('long')).toBeNull()
    await user.click(ladderButton('long', 'Pause'))
    expect(undoOf('long')).toBeNull()
    await user.click(ladderButton('long', 'Resume'))
    await user.click(liveToggles('long')[2])
    await user.click(ladderButton('long', 'Finish'))

    // One action, in the result group: after Work completed, before Rounds completed.
    expect(within(logOf('long')).getAllByRole('button', { name: UNDO_FINISH })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: UNDO_FINISH })).toHaveLength(1)
    const undo = undoOf('long')!
    const group = answerGroup('long').closest<HTMLElement>('.clr-timed-log__group')!
    const members = [...group.children]
    const at = (node: Element) => members.findIndex((member) => member.contains(node))
    expect([at(answerGroup('long')), at(undo), at(roundsGroup('long')!)]).toEqual([0, 1, 2])
    expect(members).toHaveLength(3)
    const wrapper = undo.closest<HTMLElement>('[data-timed-undo]')!
    expect(wrapper.parentElement).toBe(group)
    expect(wrapper).toHaveClass('clr-timed-undo')
    // The count it aligns with follows it, in the rounds.
    expect(within(roundsGroup('long')!).getByRole('status')).toHaveTextContent(`3 of ${LONG_ROUNDS} rounds completed`)

    // The existing small quiet button: no frame, no glow, no glyph, the
    // shared control height; its words are its name.
    expect(undo.tagName).toBe('BUTTON')
    expect(undo).toHaveAttribute('type', 'button')
    expect(undo).toHaveClass('clr-btn', 'clr-btn--quiet', 'clr-chamfer--sm')
    expect(undo).not.toHaveClass('clr-btn--primary')
    expect(undo.textContent).toBe(UNDO_FINISH)
    expect(undo.querySelector('svg')).toBeNull()
    expect(undo.style.minHeight).toBe('var(--control-height)')
    expect(undo.parentElement!.style.getPropertyValue('--bleed')).toBe('transparent')
    expect(undo.parentElement).not.toHaveClass('clr-glow')

    // The recipe: left-aligned (Round 7's `.clr-timed-undo` rules), and the
    // button's own inline inset — the small button's token — given back
    // outside its box by its row, so no inset is left on the text; and
    // nothing else: no size, colour, frame or type of its own.
    expect(rule('.clr-timed-undo')).toMatch(/justify-content:\s*flex-start/)
    const button = rule('.clr-timed-undo button')
    expect(button).toMatch(/justify-content:\s*flex-start/)
    expect(button).toMatch(/text-align:\s*start/)
    const inset = /^var\(--spacing-200\) var\((--spacing-[\w-]+)\)$/.exec(undo.style.padding)?.[1]
    expect(inset).toMatch(/^--spacing-/)
    expect(wrapper.style.marginInline).toBe(`calc(var(${inset}) * -1)`)
    expect(wrapper.getAttribute('style')).not.toMatch(/\d+px|height|color|background|border|font|letter-spacing|box-shadow|padding/)
    for (const declared of [rule('.clr-timed-undo'), button]) {
      expect(declared).not.toMatch(/\d+px|height|color|background|border|font|letter-spacing|box-shadow|padding-block/)
    }

    // Keyboard: one tab stop after the answer, before the first round.
    within(answerGroup('long')).getByRole('radio', { checked: true }).focus()
    await user.tab()
    expect(undo).toHaveFocus()
    await user.tab()
    expect(resultTile('long', 1)).toHaveFocus()
    await user.tab({ shift: true })
    expect(undo).toHaveFocus()

    // Pressed: the attempt is back at once — no confirmation, no dialog —
    // and the focus moves to the restored lead control.
    await user.keyboard('{Enter}')
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(lifecycleControls('long')).toEqual(['Pause', 'Finish'])
    expect(ladderButton('long', 'Pause')).toHaveFocus()
    expect(screen.queryAllByRole('button', { name: UNDO_FINISH })).toEqual([])

    // Again by Space, from a paused Finish: the focus lands on Resume.
    await user.click(ladderButton('long', 'Pause'))
    await user.click(ladderButton('long', 'Finish'))
    undoOf('long')!.focus()
    await user.keyboard(' ')
    expect(ladderButton('long', 'Resume')).toHaveFocus()
    expect(confirm).not.toHaveBeenCalled()
  }, UNDO_TIMEOUT)

  it('JOURNEY-014 the accepted gallery’s four- and twelve-round states draw the route’s own quiet undo: Finish, then Undo finish brings the same attempt back with its checked rounds, and its original cap withdraws it, over memory only', async () => {
    const user = userEvent.setup()
    const fetch = vi.spyOn(globalThis, 'fetch')
    for (const rounds of [4, 12] as const) {
      render(
        <MemoryRouter initialEntries={[`/gallery/refinements?state=ladder-${rounds}`]}>
          <GalleryRefinements />
        </MemoryRouter>,
      )
      const state = document.querySelector<HTMLElement>(`[data-refinement-state="ladder-${rounds}"]`)!
      const card = cardOf('ladder', state)
      const grid = within(card).getByRole('list', { name: LADDER_ROUNDS_LIST })
      const openLog = () => {
        const dialogs = openLogs().filter((dialog) => state.contains(dialog))
        expect(dialogs.length).toBeLessThanOrEqual(1)
        return dialogs[0]?.querySelector<HTMLElement>('form.clr-timed-log') ?? null
      }
      await user.click(within(card).getByRole('button', { name: 'Start ladder' }))
      await user.click(within(grid).getAllByRole('button')[1])
      await user.click(within(card).getByRole('button', { name: 'Finish' }))

      // The route's log, with its Undo between the answer and the rounds.
      // TASK-046: in the one "Log results" dialog, opened at Finish.
      let log = openLog()!
      const undo = within(log).getByRole('button', { name: UNDO_FINISH })
      const answer = within(log).getByRole('group', { name: WORK_COMPLETED })
      const tiles = within(log).getByRole('group', { name: ROUNDS_COMPLETED })
      expect(follows(undo, answer)).toBe(true)
      expect(follows(tiles, undo)).toBe(true)
      expect(within(tiles).getByRole('status')).toHaveTextContent(`2 of ${rounds} rounds completed`)
      expect(undo).toHaveClass('clr-btn--quiet')

      // Undo: running again, the two rounds still checked. TASK-046: Undo
      // closes the focused log; Round 7 offers no log while the attempt runs.
      await user.click(undo)
      expect(openLog()).toBeNull()
      expect(within(card).queryByRole('button', { name: 'Log results' })).toBeNull()
      expect(within(card).getByRole('button', { name: 'Pause' })).toBeInTheDocument()
      expect(within(grid).getAllByRole('button').map((tile) => tile.getAttribute('aria-pressed'))).toEqual(
        through(rounds).map((n) => String(n <= 2)),
      )
      expect(within(card.querySelector<HTMLElement>('[data-ladder-prescription]')!).getByRole('status'))
        .toHaveTextContent(`2 of ${rounds} rounds completed`)
      // Finish again: the same two rounds, Incomplete.
      advance(60)
      await user.click(within(card).getByRole('button', { name: 'Finish' }))
      log = openLog()!
      expect(within(within(log).getByRole('group', { name: WORK_COMPLETED })).getByRole('radio', { name: 'Incomplete' }))
        .toHaveAttribute('aria-checked', 'true')
      // The accepted 07:00 cap: offered one second before it, withdrawn at it
      // with nothing pressed — the attempt's own clock is the only one here.
      advance(LADDER_CAP_SECONDS - 61)
      expect(within(log).getByRole('button', { name: UNDO_FINISH })).toBeInTheDocument()
      advance(1)
      expect(within(log).queryByRole('button', { name: UNDO_FINISH })).toBeNull()
      expect(clockWords('ladder', state)).toHaveTextContent('Finished')
      // Memory only: nothing under any route key.
      expect(localStorage.length).toBe(0)
      cleanup()
    }
    expect(fetch).not.toHaveBeenCalled()
  }, UNDO_TIMEOUT)

  it('AC-R014-03 no stale completion survives an undo: an older build’s For Time answer stored beside an adopted clock never becomes the attempt’s answer, and For Time’s own Finish offers no undo', async () => {
    const user = userEvent.setup()
    const reports: { blockId: string; outcome: BlockOutcome }[] = []
    const completion: BlockCompletionApi = {
      reportOutcome: (blockId, outcome) => void reports.push({ blockId, outcome }),
      isBlockRecorded: () => false,
      sessionId: 'session-task-014',
    }
    const pullUps = { prescription: { exercise_id: 'pull-up', target_kind: 'sequence' as const, target_value: null, target_sequence: [1, 3, 5, 7, 9, 11] } }
    const legacy = { structureType: 'for_time' as const, repScheme: 'ladder_up' as const, timerType: 'countdown' as const, timerSeconds: 600, exercises: [pullUps] }
    const snapshot = snapshotFixture({ sections: [{ title: 'Ladder', sectionType: 'conditioning', blocks: [legacy] }] })
    const block = sessionProgress(snapshot).sections[0].blocks[0]

    // An older build's race record for this block: running two minutes,
    // with a For Time "Complete" answer beside its clock.
    const older = JSON.stringify({ [block.blockId]: { startedAt: new Date(clock - 120_000).toISOString(), finishedAt: null, workCompleted: true } })
    localStorage.setItem(WORKOUT_FOR_TIME_STORAGE_KEY, older)
    mountLadderBlock(legacy, completion)
    const last = () => reports.filter((report) => report.blockId === block.blockId).at(-1)?.outcome
    const grid = () => screen.getByRole('list', { name: LADDER_ROUNDS_LIST })
    expect(screen.getByRole('timer')).toHaveTextContent('02:00')
    await user.click(within(grid()).getAllByRole('button')[1])
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    // The carried progress is the answer — not the older record's Complete.
    const answer = () => within(within(directLog()).getByRole('group', { name: WORK_COMPLETED })).queryAllByRole('radio', { checked: true }).map((radio) => radio.textContent)
    expect(answer()).toEqual(['Incomplete'])
    expect(last()).toEqual({ highestRung: 2 })
    await user.click(within(directLog()).getByRole('button', { name: UNDO_FINISH }))
    // Back before Finish: no answer at all, the older Complete included — Round
    // 7 offers no log while the attempt runs, and the durable draft holds none.
    expect(openLogs()).toEqual([])
    expect(last()).toEqual({})
    expect(within(grid()).getAllByRole('button').filter((tile) => tile.getAttribute('aria-pressed') === 'true')).toHaveLength(2)
    expect(stored(WORKOUT_LADDER_STORAGE_KEY)[block.blockId].draft).toMatchObject({ completed: null, highestRung: 2 })
    // The older record is left exactly as it was.
    expect(localStorage.getItem(WORKOUT_FOR_TIME_STORAGE_KEY)).toBe(older)
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    expect(answer()).toEqual(['Incomplete'])
    expect(last()).toEqual({ highestRung: 2 })
    cleanup()
    localStorage.clear()

    // For Time's Finish is the athlete's report that the work is done
    // (TASK-010); it is not the accidental-Finish journey and offers no Undo.
    await openWorkout()
    await user.click(button('for_time', START.for_time))
    advance(90)
    await user.click(button('for_time', TIMED_FINISH.for_time))
    // TASK-046: read in the log its card opens.
    const forTimeLog = openLogs().find((dialog) => flowOf('for_time').contains(dialog))!.querySelector('form.clr-timed-log')!
    expect(within(forTimeLog as HTMLElement).getByRole('group', { name: WORK_COMPLETED })).toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: /undo|resume ladder/i })).toEqual([])
  }, UNDO_TIMEOUT)
})

// ─────────────────────────────────────────────────────────────────────────────
// A3 TASK-117 — TASK-011: the EMOM's schedule context and its end log (C31, C32)
// ─────────────────────────────────────────────────────────────────────────────

/** Explicit per-case time: each journey mounts the whole app. */
const EMOM_TIMEOUT = 30_000

/** The EMOM's two movements, by their names on Round 7's rows: the minute rotation's order. */
const EMOM_MOVEMENTS = ['kb swing', 'burpee'] as const

/** The grouped coaching disclosure's accessible name: the visible words, then the block's format and movements (TASK-005). */
const EMOM_COACHING = 'Coaching and notes — EMOM: kb swing, burpee'

/** JOURNEY-011's session: started a minute before entry, the EMOM ready. */
const EMOM_SESSION = () =>
  emomEndLogSnapshot(emomEndLogAcceptance(), {
    userId: FIXTURE_USER_ID,
    startedAt: new Date(ENTRY - 60_000).toISOString(),
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

/** The EMOM's Round 7 flow: its clock, its card and its log dialog. */
function emomFlow(scope: HTMLElement = document.body): HTMLElement {
  const found = within(scope).getByRole('list', { name: EMOM_WORK_LIST }).closest<HTMLElement>('.clr-timed-flow')
  if (found === null) throw new Error('the EMOM has no timed flow')
  return found
}

/** The EMOM's one card: the one holding its group header and its work. */
function emomCard(scope?: HTMLElement): HTMLElement {
  const card = emomFlow(scope).querySelector('[data-movement-group-header]')?.closest<HTMLElement>('.clr-card') ?? null
  if (card === null) throw new Error('the EMOM has no card')
  return card
}

/**
 * The words the EMOM's clock states its minute and its state in: the timer
 * frame's caption (`Minute 3 of 10`, `Minute 3 of 10 · Rest`, `Paused`,
 * `Finished early`, `Time complete`). Null before Start: Round 7 draws the
 * clock only once it runs, so nothing — no Not started — is said before then.
 */
function emomWords(scope?: HTMLElement): string | null {
  const timer = within(emomFlow(scope)).queryByRole('timer')
  return timer === null ? null : (timer.firstElementChild?.textContent ?? '')
}

/** The minute's countdown, once the clock has started. */
function emomTime(scope?: HTMLElement): string {
  const timer = within(emomFlow(scope)).getByRole('timer')
  return [...timer.children].map((part) => part.textContent ?? '').find((text) => /^\d{2}:\d{2}$/.test(text)) ?? ''
}

/** C32 / AC-R011-01: the annotated captions are drawn nowhere in the EMOM's block. */
function expectNoRetiredCaption(scope?: HTMLElement) {
  for (const caption of RETIRED_CAPTIONS) {
    expect(within(emomFlow(scope)).queryByText(new RegExp(`^${caption}$`, 'i')), caption).toBeNull()
  }
  expect(emomWords(scope) ?? '').not.toMatch(/not started|\bwork\b/i)
}

/** The EMOM's open log dialogs. */
function openEmomDialogs(scope?: HTMLElement): HTMLDialogElement[] {
  return [...emomFlow(scope).querySelectorAll<HTMLDialogElement>('dialog[open]')].filter((dialog) => dialog.querySelector('form.clr-timed-log') !== null)
}

/** The card's "Log results" action: null when the EMOM offers no log. */
function emomLogOpener(scope?: HTMLElement): HTMLButtonElement | null {
  const openers = within(emomCard(scope)).queryAllByRole('button', { name: 'Log results' }) as HTMLButtonElement[]
  expect(openers.length).toBeLessThanOrEqual(1)
  return openers[0] ?? null
}

/**
 * The end log. TASK-046 (C45; R43, R100): the card holds one "Log results"
 * action, and the same form opens in the shared focused dialog titled "Log
 * results"; null when the card offers no log. Never inline in the card.
 * Round 7 opens it by itself as the schedule ends; a closed one is opened
 * from the card's action.
 */
function queryEmomLog(scope?: HTMLElement): HTMLElement | null {
  for (const form of emomFlow(scope).querySelectorAll('form.clr-timed-log')) expect(form.closest('dialog')).not.toBeNull()
  if (openEmomDialogs(scope).length === 0) {
    const opener = emomLogOpener(scope)
    if (opener === null) return null
    for (const other of openLogs()) fireEvent.click(within(other).getByRole('button', { name: 'Close log' }))
    fireEvent.click(opener)
  }
  const open = openEmomDialogs(scope)
  expect(open).toHaveLength(1)
  return open[0].querySelector<HTMLElement>('form.clr-timed-log')
}

function emomLog(scope?: HTMLElement): HTMLElement {
  const found = queryEmomLog(scope)
  if (found === null) throw new Error('the EMOM has no end log')
  return found
}

function notesField(scope?: HTMLElement): HTMLTextAreaElement {
  return within(emomLog(scope)).getByRole('textbox', { name: EMOM_NOTES_LABEL }) as HTMLTextAreaElement
}

/** The movements a marker word sits on — Round 7's `Now` / `Next` — by name. */
function emomMarked(word: 'Now' | 'Next', scope?: HTMLElement): string[] {
  const list = within(emomCard(scope)).getByRole('list', { name: EMOM_WORK_LIST })
  return [...list.querySelectorAll<HTMLElement>(':scope > li')]
    .filter((item) => [...item.children].some((child) => child.tagName === 'P' && child.textContent === word))
    .map((item) => item.querySelector('.clr-movement-identity__name > span')?.textContent?.replace(/^\d+\s*/, '') ?? '')
}

function emomMovement(name: (typeof EMOM_MOVEMENTS)[number], scope?: HTMLElement) {
  const list = within(emomCard(scope)).getByRole('list', { name: EMOM_WORK_LIST })
  const item = [...list.querySelectorAll<HTMLElement>(':scope > li')]
    .find((candidate) => candidate.querySelector('.clr-movement-identity__name > span')?.textContent?.replace(/^\d+\s*/, '') === name)
  if (item === undefined) throw new Error(`the EMOM has no ${name}`)
  return within(item)
}

/**
 * Every control or reading of a minutes tally or a completion question (C31).
 * TASK-047 (REQ-031; R84: "optional effort, applicable movement weights and
 * notes"): the only number fields are loaded movements' actual loads, the only
 * radiogroup is the existing effort faces, and the only buttons are the
 * faces' compact Clear and Round 7's own Save log (TASK-103 bound it to the
 * shell's one completion path). Still no counter, completion question or
 * confirmation.
 */
function expectNoTally(log: HTMLElement) {
  expect(log.querySelectorAll('output, .clr-quantity')).toHaveLength(0)
  for (const field of within(log).queryAllByRole('spinbutton')) expect(field).toHaveAccessibleName(/^Weight · /)
  expect(within(log).queryByRole('slider')).toBeNull()
  for (const group of within(log).queryAllByRole('radiogroup')) {
    expect(within(group).getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['Too hard', 'About right', 'Too easy'])
  }
  expect(within(log).queryByRole('checkbox')).toBeNull()
  for (const button of within(log).queryAllByRole('button')) expect(button).toHaveAccessibleName(/^(Save log|Clear effort for this section)$/)
  expect(within(log).queryByRole('group', { name: 'Work completed' })).toBeNull()
  expect(within(log).queryByText(/minutes?|completed|complete|tally|count|confirm/i)).toBeNull()
}

/** The EMOM's stored grid, as the raw string the route wrote. */
function storedEmomRaw(): string | null {
  return localStorage.getItem(WORKOUT_EMOM_STORAGE_KEY)
}

const NO_TALLY_ROW = {
  minutes_completed: null, elapsed_seconds: null, completed_under_cap: null, rounds_completed: null,
  partial_round_reps: null, highest_rung: null, perceived_effort: null,
}

/** A section the forward action moved to: Round 7 heads the section and each of its block cards with its name. */
async function sectionShown(title: string) {
  expect((await screen.findAllByRole('heading', { name: title })).length).toBeGreaterThan(0)
}

/** History (`/history/:id`) over the same clients, as a later visit opens it: the saved EMOM's block, found by its note. */
async function openEmomHistory(double: ReturnType<typeof createWorkoutDouble>, sessionId: string, note: string) {
  const history = createMemoryRouter(routes, { initialEntries: ['/', `/history/${sessionId}`], initialIndex: 1 })
  render(
    <AppProviders {...signedIn({ workout: double.clients })}>
      <RouterProvider router={history} />
    </AppProviders>,
  )
  const written = await screen.findByText(note)
  const detail = written.closest<HTMLElement>('[data-detail-block]')
  if (detail === null) throw new Error('the note is not in a History block')
  return detail
}

const EXCEPTION_NOTE = 'Dropped to 10 swings from minute 7.'
const EARLY_NOTE = 'Stopped in minute 3: shoulder.'

describe('TASK-011 EMOM schedule and end logging without a completion counter', () => {
  it('AC-R011-01 EMOM removes only the annotated Not started and Work captions on the real /workout route, keeping minute assignment, the rest transition and the actual clock state', async () => {
    const user = userEvent.setup()
    await openEmom()
    const [swing, burpee] = EMOM_MOVEMENTS

    // Ready: each movement's minutes and the minute it opens — no NOT STARTED
    // beside them. Round 7 draws no clock (so no caption) before Start, and
    // marks the movement after the opening minute's Next.
    expect(emomWords()).toBeNull()
    expectNoRetiredCaption()
    expect(emomMarked('Now')).toEqual([])
    expect(emomMarked('Next')).toEqual([burpee])
    expect(emomMovement(swing).getByText('ODD MIN')).toBeInTheDocument()
    expect(emomMovement(burpee).getByText('EVEN MIN')).toBeInTheDocument()
    expect(emomMovement(swing).getByText('Min 1 · 12 reps')).toBeInTheDocument()
    expect(emomMovement(burpee).getByText('Min 2 · 10 reps')).toBeInTheDocument()
    expect(within(emomFlow()).queryByRole('timer')).toBeNull()

    // Running, the work part of minute one: the minute and Now — no WORK.
    await user.click(within(emomCard()).getByRole('button', { name: 'Start EMOM' }))
    expect(emomWords()).toBe('Minute 1 of 10')
    expect(emomMarked('Now')).toEqual([swing])
    expect(emomTime()).toBe('01:00')
    expectNoRetiredCaption()
    advance(60 - EMOM_REST_SECONDS - 1)
    expect(emomWords()).toBe('Minute 1 of 10')
    expect(emomMarked('Now')).toEqual([swing])
    expect(emomTime()).toBe('00:16')

    // The transition into the minute's rest keeps its word and looks ahead:
    // the next minute's movement is Next, and the swing's next turn is minute 3.
    advance(1)
    expect(emomWords()).toBe('Minute 1 of 10 · Rest')
    expect(emomMarked('Next')).toEqual([burpee])
    expect(emomMovement(swing).getByText('Min 3 · 12 reps')).toBeInTheDocument()
    expect(emomTime()).toBe('00:15')

    // The boundary flips the work: minute two is the burpee's, with no caption.
    advance(EMOM_REST_SECONDS)
    expect(emomWords()).toBe('Minute 2 of 10')
    expect(emomMarked('Now')).toEqual([burpee])
    expect(emomMovement(swing).getByText('Min 3 · 12 reps')).toBeInTheDocument()
    expectNoRetiredCaption()

    // The actual clock state stays in words: Paused holds the minute's
    // movement (Now) and its time.
    advance(10)
    await user.click(within(emomCard()).getByRole('button', { name: 'Pause' }))
    advance(90)
    expect(emomWords()).toBe('Paused')
    expect(emomMarked('Now')).toEqual([burpee])
    expect(emomTime()).toBe('00:50')
    await user.click(within(emomCard()).getByRole('button', { name: 'Resume' }))
    expect(emomWords()).toBe('Minute 2 of 10')
    expect(emomMarked('Now')).toEqual([burpee])

    // Finished early, in the minute it stopped.
    await user.click(within(emomCard()).getByRole('button', { name: 'Finish early' }))
    expect(emomWords()).toBe('Finished early')
    expect(within(emomCard()).getByText('Finished early, in minute 2 of 10. Continue when you are ready.')).toBeInTheDocument()
    expectNoRetiredCaption()

    // The rule itself: only the two annotated captions went, nothing else —
    // the clock's own words are the minute (with its rest), Paused, the end.
    const source = readFileSync(resolve(ROOT, 'src/ui/timed-workout-flow.tsx'), 'utf8')
    expect(source).not.toMatch(/['`](?:Not started|NOT STARTED|Work|WORK)['`]/)
    expect(source).toMatch(/`Minute \$\{minute\.minute\} of \$\{shape\.minutes \?\? '—'\}\$\{minute\.phase === 'rest' \? ' · Rest' : ''\}`/)
    expect(source).toMatch(/view\.phase === 'paused' \? 'Paused'/)
  }, EMOM_TIMEOUT)

  it('AC-C32-01 EMOM minute progress and Now/Next stay clear across every boundary, a background and a reload, with no phase caption repeating them', async () => {
    const user = userEvent.setup()
    const first = await openEmom()
    await user.click(within(emomCard()).getByRole('button', { name: 'Start EMOM' }))

    // Every minute boundary to the last: the minute, the movement that minute
    // prescribes as Now, and the other — the next minute's — as Next with its
    // next turn as its target.
    for (let minute = 1; minute <= EMOM_MINUTES; minute += 1) {
      const now = EMOM_MOVEMENTS[(minute - 1) % 2]
      const other = EMOM_MOVEMENTS[minute % 2]
      expect(emomWords(), `minute ${minute}`).toBe(`Minute ${minute} of ${EMOM_MINUTES}`)
      expect(emomMarked('Now'), `minute ${minute}`).toEqual([now])
      expect(emomMarked('Next'), `minute ${minute}`).toEqual(minute < EMOM_MINUTES ? [other] : [])
      const ahead = minute + 1 <= EMOM_MINUTES ? `Min ${minute + 1} · ` : null
      if (ahead !== null) expect(emomMovement(other).getByText(new RegExp(`^${ahead}`))).toBeInTheDocument()
      else expect(emomMovement(other).queryByText(/^Min \d+ · /)).toBeNull()
      expectNoRetiredCaption()
      // Into the minute's rest: the next minute's movement is Next.
      advance(60 - EMOM_REST_SECONDS + 1)
      expect(emomWords()).toBe(`Minute ${minute} of ${EMOM_MINUTES} · Rest`)
      expect(emomMarked('Next')).toEqual(minute < EMOM_MINUTES ? [other] : [])
      if (minute < EMOM_MINUTES) advance(EMOM_REST_SECONDS - 1)
    }
    // The last minute's rest runs out: the schedule ends, its own words say
    // so, and nothing is live.
    advance(EMOM_REST_SECONDS)
    expect(emomWords()).toBe('Time complete')
    expect(emomMarked('Now')).toEqual([])
    expect(emomMarked('Next')).toEqual([])
    expect(emomTime()).toBe('00:00')

    // A fresh EMOM: backgrounded across boundaries, then reloaded mid-minute.
    first.view.unmount()
    localStorage.clear()
    clock = ENTRY
    const second = await openEmom()
    await user.click(within(emomCard()).getByRole('button', { name: 'Start EMOM' }))
    advance(125)
    expect(emomWords()).toBe('Minute 3 of 10')
    expect(emomMarked('Now')).toEqual([EMOM_MOVEMENTS[0]])
    expect(emomTime()).toBe('00:55')
    second.view.unmount()
    advance(40)
    await openEmom({}, second.snapshot)
    expect(emomWords()).toBe('Minute 3 of 10 · Rest')
    expect(emomMarked('Next')).toEqual([EMOM_MOVEMENTS[1]])
    expect(emomTime()).toBe('00:15')
    expectNoRetiredCaption()
  }, EMOM_TIMEOUT)

  it('AC-C31-01 EMOM end log omits any minutes-completed counter or completion question, assumes the schedule and accepts notes for exceptions', async () => {
    const user = userEvent.setup()
    const { block, double } = await openEmom()

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
    expect(emomWords()).toBe('Time complete')
    const log = emomLog()
    expect(emomFlow().dataset.timedFormat).toBe('emom')
    expect(log.dataset.logHierarchy).toBe('simple')
    // R43: the log replaces the closing sentence that only said it was done.
    expect(within(emomCard()).queryByText(/The clock has run every prescribed minute/)).toBeNull()

    // After the work and its prescription, before the card's coaching —
    // TASK-046: the log's place on the card is its "Log results" action. The
    // grouped coaching disclosure, found by its accessible name, follows it
    // and is the last child of the card's content (`.clr-movement-group`,
    // where the shell's completion line draws nothing until the block is saved).
    const list = within(emomCard()).getByRole('list', { name: EMOM_WORK_LIST })
    const opener = emomLogOpener()!
    expect(follows(opener, list)).toBe(true)
    expect(follows(log, list)).toBe(true)
    const lastMovement = [...list.querySelectorAll<HTMLElement>(':scope > li')].at(-1)!
    expect(follows(opener, lastMovement)).toBe(true)
    const coaching = within(emomCard()).getByRole('button', { name: EMOM_COACHING })
    expect(follows(coaching, opener)).toBe(true)
    const content = emomCard().querySelector<HTMLElement>('.clr-movement-group')!
    const coachingGroup = [...content.children].find((child) => child.contains(coaching))
    expect(coachingGroup).toBeDefined()
    expect(content.lastElementChild).toBe(coachingGroup)
    expect(coachingGroup!.contains(opener)).toBe(false)
    expect(coachingGroup!.contains(list)).toBe(false)

    // One title, one group with a field, one field: the optional notes. No
    // counter, no completion question, no confirmation step. TASK-046: the one
    // title is the focused dialog's, and the form draws none.
    // TASK-047 (REQ-031; R84) supersedes "one group, one field, no effort
    // here": each loaded movement's actual load is its own titled movement
    // group (a load only — an EMOM has no partial round), and the closing
    // group holds the existing effort faces before the notes. Round 7's result
    // group is drawn and empty: there is nothing to count.
    const titles = within(log.closest('dialog')!).getAllByRole('heading')
    expect(titles.filter((heading) => !heading.classList.contains('clr-timed-log__group-title')).map((heading) => heading.textContent)).toEqual(['Log results'])
    expect(within(log).queryAllByRole('heading').map((heading) => heading.textContent)).toEqual(['kb swing'])
    expect(within(log).getAllByRole('spinbutton').map((field) => field.getAttribute('aria-label'))).toEqual(['Weight · kb swing'])
    const groups = [...log.querySelectorAll<HTMLElement>('.clr-timed-log__group')].filter(
      (group) => group.querySelector(':scope > .clr-timed-log__group-title') === null,
    )
    const withFields = groups.filter((group) => group.querySelector('textarea, select, output, input, [role="radiogroup"]') !== null)
    expect(withFields).toHaveLength(1)
    expect(groups.filter((group) => !withFields.includes(group)).every((group) => group.textContent === '')).toBe(true)
    expect(within(withFields[0]).getByRole('group', { name: 'Effort · optional' })).toBeInTheDocument()
    const fields = withFields[0].querySelectorAll('textarea, select, output, input:not([type="radio"])')
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
      startedAt: new Date(ENTRY).toISOString(),
      workDoneMinute: null,
    })
    expect(emomWords()).toBe('Time complete')

    // Enter in the log navigates nowhere: the submit is the form's own — Round
    // 7's Save log, through the shell's one completion path — and it saves the
    // note with nothing counted.
    const submitted = new Event('submit', { bubbles: true, cancelable: true })
    act(() => {
      log.dispatchEvent(submitted)
    })
    expect(submitted.defaultPrevented).toBe(true)
    await waitFor(() => expect(within(emomFlow()).getByText('Log saved')).toBeInTheDocument())
    expect(double.recorded()).toEqual([{ blockId: block.blockId, outcome: { notes: EXCEPTION_NOTE }, perceivedEffort: null }])
    expect(storedEmomRaw()).toBe(grid)
  }, EMOM_TIMEOUT)

  it('AC-R011-02 EMOM end logging assumes the schedule end to end: no minutes tally in the saved row, the exception note in the block’s existing notes, the actual timing untouched, and History reads it back', async () => {
    const user = userEvent.setup()
    const { double, block, snapshot, view } = await openEmom()
    await user.click(within(emomCard()).getByRole('button', { name: 'Start EMOM' }))
    advance(EMOM_MINUTES * 60 + 30)
    const grid = storedEmomRaw()
    await user.type(notesField(), EXCEPTION_NOTE)

    // The section's forward action saves the block: its note, and nothing counted.
    await closeLogs(user)
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    expect(await screen.findByRole('heading', { name: COOLDOWN_SECTION_TITLE })).toBeInTheDocument()
    expect(double.recorded()).toEqual([{ blockId: block.blockId, outcome: { notes: EXCEPTION_NOTE }, perceivedEffort: null }])
    expect(resultRow(double.recorded()[0])).toEqual({ ...NO_TALLY_ROW, notes: EXCEPTION_NOTE })
    // The actual timing is the clock's own record, unchanged by the note or the save.
    expect(storedEmomRaw()).toBe(grid)

    // Back to the saved section: the schedule still reads as it ended; the log
    // has stepped aside (Round 7 reads the saved log back, with its Edit log),
    // and the shell says it saved.
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    await sectionShown(EMOM_SECTION_TITLE)
    await screen.findByRole('list', { name: EMOM_WORK_LIST })
    expect(emomWords()).toBe('Time complete')
    expect(queryEmomLog()).toBeNull()
    expect(within(emomCard()).getByText('Block saved')).toBeInTheDocument()
    expect(within(emomFlow().querySelector<HTMLElement>('[data-timed-saved]')!).getByText(EXCEPTION_NOTE)).toBeInTheDocument()
    expect(double.recorded()).toHaveLength(1)

    // History reads the saved row back: the note, and no minutes reading.
    view.unmount()
    const detail = await openEmomHistory(double, snapshot.session.id, EXCEPTION_NOTE)
    expect(within(detail).getByText(EXCEPTION_NOTE)).toBeInTheDocument()
    expect(within(detail).queryByText('Minutes')).toBeNull()
    expect(within(detail).queryByText('Not scored')).toBeNull()
  }, EMOM_TIMEOUT)

  it('AC-R011-02 EMOM finished early or stopped before its last minute is never recorded as a completed full schedule and keeps its actual timing', async () => {
    const user = userEvent.setup()
    const first = await openEmom()

    // Minute three, paused 130 seconds in, then ended early a while later: it
    // ends at its pause, in the minute it was in.
    await user.click(within(emomCard()).getByRole('button', { name: 'Start EMOM' }))
    advance(130)
    await user.click(within(emomCard()).getByRole('button', { name: 'Pause' }))
    advance(40)
    await user.click(within(emomCard()).getByRole('button', { name: 'Finish early' }))
    const stopped = { startedAt: new Date(ENTRY).toISOString(), workDoneMinute: null, finishedAt: new Date(ENTRY + 130_000).toISOString() }
    expect(readEmomState(localStorage, first.block.blockId)).toEqual(stopped)
    expect(emomWords()).toBe('Finished early')
    expect(within(emomCard()).getByText('Finished early, in minute 3 of 10. Continue when you are ready.')).toBeInTheDocument()
    expect(within(emomFlow()).queryByText('Time complete')).toBeNull()

    // The same counter-free log: nothing asks how many minutes, nothing claims all ten.
    const log = emomLog()
    expectNoTally(log)
    await user.type(notesField(), EARLY_NOTE)

    // The clock running on never turns an early end into a completed schedule.
    advance(EMOM_MINUTES * 60)
    expect(emomWords()).toBe('Finished early')
    expect(readEmomState(localStorage, first.block.blockId)).toEqual(stopped)
    // The view the shell reads is the stop, not the window.
    const view = emomView(clampEmomState(stopped), emomShape(first.block), (clock - ENTRY) / 1000)
    expect(view).toMatchObject({ phase: 'finished', endedEarly: true, minute: 3, minutes: 10 })

    // Close and reopen: the actual stop is restored, and the log is reachable.
    // Its note was this visit's draft, so it reads empty — what will be saved.
    first.view.unmount()
    const second = await openEmom({}, first.snapshot)
    expect(emomWords()).toBe('Finished early')
    expect(notesField()).toHaveValue('')
    await user.type(notesField(), EARLY_NOTE)
    await closeLogs(user)
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    expect(await screen.findByRole('heading', { name: COOLDOWN_SECTION_TITLE })).toBeInTheDocument()
    expect(second.double.recorded()).toEqual([{ blockId: second.block.blockId, outcome: { notes: EARLY_NOTE }, perceivedEffort: null }])
    expect(resultRow(second.double.recorded()[0])).toEqual({ ...NO_TALLY_ROW, notes: EARLY_NOTE })
    expect(readEmomState(localStorage, second.block.blockId)).toEqual(stopped)

    // History: the note, and no minutes reading — not "10 of 10", not "3 of 10".
    second.view.unmount()
    const detail = await openEmomHistory(second.double, second.snapshot.session.id, EARLY_NOTE)
    expect(within(detail).getByText(EARLY_NOTE)).toBeInTheDocument()
    expect(within(detail).queryByText('Minutes')).toBeNull()
    expect(detail.textContent).not.toMatch(/\d+ of 10/)

    // Stopped before its last minute without Finish early: the section moved
    // on while the clock ran. No log opened, nothing is counted.
    cleanup()
    localStorage.clear()
    clock = ENTRY
    const third = await openEmom()
    await user.click(within(emomCard()).getByRole('button', { name: 'Start EMOM' }))
    advance(200)
    expect(queryEmomLog()).toBeNull()
    await closeLogs(user)
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    expect(await screen.findByRole('heading', { name: COOLDOWN_SECTION_TITLE })).toBeInTheDocument()
    expect(third.double.recorded()).toEqual([{ blockId: third.block.blockId, outcome: {}, perceivedEffort: null }])
    expect(resultRow(third.double.recorded()[0])).toEqual({ ...NO_TALLY_ROW, notes: null })
    expect(readEmomState(localStorage, third.block.blockId)).toEqual({ startedAt: new Date(ENTRY).toISOString(), workDoneMinute: null })
  }, EMOM_TIMEOUT)

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
    const timing = readEmomState(localStorage, block.blockId)
    await user.type(notesField(), EXCEPTION_NOTE)

    await closeLogs(user)
    await user.click(screen.getByRole('button', { name: 'Next section' }))
    const failed = await screen.findByRole('dialog', { name: /didn’t save/ })
    expect(failed).toHaveTextContent('That didn’t save')
    expect(record).toHaveBeenCalledTimes(1)
    expect(rows).toEqual([])
    // Nothing discarded and nothing filled in: the note, the ended schedule,
    // and the clock's timing as it was. The EMOM's record now also notes the
    // failed save (TASK-AC-D58939F8E091), and its log says so.
    expect(notesField()).toHaveValue(EXCEPTION_NOTE)
    expect(within(emomLog()).getByRole('alert')).toHaveTextContent('Your log didn’t save. Try again.')
    expect(emomWords()).toBe('Time complete')
    expect(readEmomState(localStorage, block.blockId)).toEqual({ ...timing, saveFailed: true })
    await closeLogs(user)

    refusing = false
    await user.click(within(failed).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: COOLDOWN_SECTION_TITLE })).toBeInTheDocument()
    expect(record).toHaveBeenCalledTimes(2)
    expect(record.mock.calls[0][0]).toEqual(record.mock.calls[1][0])
    expect(rows).toEqual([{ blockId: block.blockId, outcome: { notes: EXCEPTION_NOTE }, perceivedEffort: null }])
    expect(resultRow(rows[0])).toEqual({ ...NO_TALLY_ROW, notes: EXCEPTION_NOTE })
    // The save landed: the record is the clock's own again, byte for byte.
    expect(storedEmomRaw()).toBe(grid)
  }, EMOM_TIMEOUT)

  it('AC-R011-02 EMOM older stored records and older saved rows load and read exactly as before', async () => {
    const user = userEvent.setup()
    const at = (seconds: number) => new Date(ENTRY + seconds * 1000).toISOString()
    const block = emomEndLogBlock(EMOM_SESSION())

    // Records an earlier build wrote, read against the same moment: before
    // Pause existed, with the retired "Minute done" mark, TASK-006's paused and
    // ended-early stamps, and a window that expired while the tab was away.
    const older: { stored: EmomState; words: string; log: boolean; time: string }[] = [
      { stored: { startedAt: at(-200), workDoneMinute: null }, words: 'Minute 4 of 10', log: false, time: '00:40' },
      { stored: { startedAt: at(-190), workDoneMinute: 4 }, words: 'Minute 4 of 10', log: false, time: '00:50' },
      { stored: { startedAt: at(-300), workDoneMinute: null, pausedAt: at(-250) }, words: 'Paused', log: false, time: '00:10' },
      { stored: { startedAt: at(-300), workDoneMinute: null, finishedAt: at(-100) }, words: 'Finished early', log: true, time: '00:00' },
      { stored: { startedAt: at(-900), workDoneMinute: null }, words: 'Time complete', log: true, time: '00:00' },
    ]
    for (const { stored: record, words, log, time } of older) {
      writeEmomState(localStorage, block.blockId, record)
      const raw = storedEmomRaw()
      const { double, view } = await openEmom()
      const label = JSON.stringify(record)
      expect(emomWords(), label).toBe(words)
      expect(emomTime(), label).toBe(time)
      expect(queryEmomLog() !== null, label).toBe(log)
      // Loaded, not rewritten.
      expect(storedEmomRaw(), label).toBe(raw)
      // Saved as before: no note given, nothing counted — the same `{}` an older build saved.
      await closeLogs(user)
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
      highest_rung: null, perceived_effort: null, notes, created_at: '2026-11-01T09:30:00+00:00', effort: null,
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
    const detail = await openEmomHistory(double, snapshot.session.id, 'Older note')
    expect(within(detail).getByText('Minutes').parentElement).toHaveTextContent(/^Minutes8 of 10$/)
    expect(within(detail).getByText('Older note')).toBeInTheDocument()
  }, EMOM_TIMEOUT)

  it('TASK-AC-D58939F8E091 EMOM save authority, as the ladder’s: a refused Save log keeps the end log’s draft through close and reopen and says it did not save, the words and the typed load survive a reload until a save lands, the saved row then wins over the local echo, and a known row whose richer save failed reopens the block', async () => {
    const user = userEvent.setup()
    const block = emomEndLogBlock(EMOM_SESSION())
    const [swing] = block.exercises.map((exercise) => exercise.exerciseId)
    let refusing = true
    const sent: { outcome: BlockOutcome; movements: Record<string, { amount: string; weight: string }> }[] = []
    const saveTimedLog = vi.fn<NonNullable<BlockCompletionApi['saveTimedLog']>>(async (_id, outcome, report) => {
      if (refusing) return err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))
      sent.push({ outcome, movements: { ...report.movements } })
      return ok(null)
    })
    /** The shell, as the test speaks for it: its one save path and its word on the block's row. */
    const seam = (recorded: RecordedBlockResult | null = null) => {
      const listeners = new Set<(source: BlockRecordedSource) => void>()
      const reopenBlock = vi.fn<(id: string) => void>()
      const api: BlockCompletionApi = {
        reportOutcome: () => undefined,
        reportTimedResult: () => undefined,
        isBlockRecorded: () => false,
        sessionId: 'session-task-117',
        onBlockRecorded: (_id, listener) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        onBlockSaveFailed: () => () => undefined,
        recordedResult: () => recorded,
        reopenBlock,
        saveTimedLog,
      }
      return { api, reopenBlock, recorded: (source: BlockRecordedSource) => act(() => { for (const listener of [...listeners]) listener(source) }) }
    }
    const mount = (shell: ReturnType<typeof seam>) => render(
      <WorkoutExperiencePresentationProvider value={PRODUCT_PRESENTATION}>
        <BlockCompletionContext value={shell.api}>
          <BlockSlot block={block} />
        </BlockCompletionContext>
      </WorkoutExperiencePresentationProvider>,
    )
    const loadField = () => within(emomLog()).getByRole('spinbutton', { name: 'Weight · kb swing' })

    const first = mount(seam())
    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    advance(200)
    await user.click(screen.getByRole('button', { name: 'Finish early' }))
    // A draft: the swing's actual load, a face and an exception note.
    await user.type(loadField(), '14')
    await user.click(within(emomLog()).getByRole('radio', { name: 'Too hard' }))
    await user.type(notesField(), EARLY_NOTE)
    // Closed and reopened, the draft is the draft.
    await closeLogs(user)
    expect(loadField()).toHaveValue(14)
    expect(within(emomLog()).getByRole('radio', { name: 'Too hard' })).toHaveAttribute('aria-checked', 'true')
    expect(notesField()).toHaveValue(EARLY_NOTE)

    // Refused: kept, said once, and noted on the EMOM's own record beside its typed load.
    await user.click(within(emomLog()).getByRole('button', { name: 'Save log' }))
    expect(await within(emomLog()).findByRole('alert')).toHaveTextContent('Your log didn’t save. Try again.')
    expect(within(emomLog()).getAllByRole('alert')).toHaveLength(1)
    expect(loadField()).toHaveValue(14)
    expect(readEmomState(localStorage, block.blockId)).toMatchObject({ saveFailed: true, movements: { [swing]: { amount: '', weight: '14' } } })

    // A reload keeps the words and the load; the face and the note were the log's memory.
    first.unmount()
    mount(seam())
    expect(within(emomLog()).getByRole('alert')).toHaveTextContent('Your log didn’t save. Try again.')
    expect(loadField()).toHaveValue(14)
    expect(notesField()).toHaveValue('')
    await user.type(notesField(), EARLY_NOTE)
    refusing = false
    await user.click(within(emomLog()).getByRole('button', { name: 'Save log' }))
    await waitFor(() => expect(within(emomFlow()).getByText('Log saved')).toBeInTheDocument())
    // What was saved: the note as the block's notes, the load-only movement, nothing counted.
    expect(sent).toEqual([{ outcome: { notes: EARLY_NOTE }, movements: { [swing]: { amount: '', weight: '14' } } }])
    expect(readEmomState(localStorage, block.blockId)).not.toHaveProperty('saveFailed')
    cleanup()

    // The saved row wins over this device's echo: corrected elsewhere.
    const row = { elapsed_seconds: null, minutes_completed: null, effort: 'about_right', notes: 'Corrected elsewhere' } as unknown as BlockResultRow
    mount(seam({ row, movements: {} }))
    const saved = emomFlow().querySelector<HTMLElement>('[data-timed-saved]')!
    expect(within(saved).getByText('Corrected elsewhere')).toBeInTheDocument()
    expect(within(saved).queryByText(EARLY_NOTE)).toBeNull()
    expect(within(saved).getByText('Effort: About right')).toBeInTheDocument()
    await user.click(within(saved).getByRole('button', { name: 'Edit log' }))
    expect(notesField()).toHaveValue('Corrected elsewhere')
    cleanup()

    // A known row while this attempt's own richer save (its load) had failed: reopened, so the retry restates it.
    localStorage.clear()
    refusing = true
    const shell = seam()
    mount(shell)
    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    advance(90)
    await user.click(screen.getByRole('button', { name: 'Finish early' }))
    await user.type(loadField(), '16')
    await user.click(within(emomLog()).getByRole('button', { name: 'Save log' }))
    expect(await within(emomLog()).findByRole('alert')).toHaveTextContent('Your log didn’t save. Try again.')
    shell.recorded('known')
    expect(shell.reopenBlock).toHaveBeenCalledWith(block.blockId)
  }, EMOM_TIMEOUT)

  it('JOURNEY-011 EMOM gallery emom and cards states draw the actual route EmomBlock: the counter-free end log after every minute and after an early finish, and the ready card with its minute and Next and no caption', async () => {
    const user = userEvent.setup()
    const fetch = vi.spyOn(globalThis, 'fetch')

    // `?state=emom`: the accepted "EMOM results" — the route's own flow over
    // the gallery's EMOM, run past every minute by the state's own drive.
    render(
      <MemoryRouter initialEntries={['/gallery/refinements?state=emom&open=1']}>
        <GalleryRefinements />
      </MemoryRouter>,
    )
    const complete = document.querySelector<HTMLElement>('[data-refinement-state="emom"]')!
    expect(complete).not.toBeNull()
    expect(screen.getByRole('link', { name: 'EMOM results' })).toHaveAttribute('aria-current', 'page')
    await waitFor(() => expect(openEmomDialogs(complete)).toHaveLength(1), { timeout: 3000 })
    expect(emomWords(complete)).toBe('Time complete')
    expect(within(complete).queryByText(/The clock has run every prescribed minute/)).toBeNull()
    const completeLog = emomLog(complete)
    expect(emomFlow(complete).dataset.timedFormat).toBe('emom')
    expectNoTally(completeLog)
    expect(notesField(complete)).toHaveValue('')
    expectNoRetiredCaption(complete)
    expect(follows(completeLog, within(emomCard(complete)).getByRole('list', { name: EMOM_WORK_LIST }))).toBe(true)
    // Live over memory only: a note is written in place.
    await user.type(notesField(complete), 'Swings unbroken')
    expect(notesField(complete)).toHaveValue('Swings unbroken')
    expect(localStorage.getItem(WORKOUT_EMOM_STORAGE_KEY)).toBeNull()
    cleanup()

    // The same state finished early by its own controls: Finished early, the
    // minute it was in, and the same counter-free log.
    render(
      <MemoryRouter initialEntries={['/gallery/refinements?state=emom']}>
        <GalleryRefinements />
      </MemoryRouter>,
    )
    const early = document.querySelector<HTMLElement>('[data-refinement-state="emom"]')!
    await user.click(within(emomCard(early)).getByRole('button', { name: 'Start EMOM' }))
    await user.click(within(emomCard(early)).getByRole('button', { name: 'Finish early' }))
    expect(emomWords(early)).toBe('Finished early')
    expect(within(early).getByText('Finished early, in minute 1 of 10. Continue when you are ready.')).toBeInTheDocument()
    const earlyLog = emomLog(early)
    expectNoTally(earlyLog)
    expect(notesField(early)).toHaveValue('')
    expectNoRetiredCaption(early)
    expect(follows(earlyLog, within(emomCard(early)).getByRole('list', { name: EMOM_WORK_LIST }))).toBe(true)
    expect(localStorage.getItem(WORKOUT_EMOM_STORAGE_KEY)).toBeNull()
    // The same owner the route draws, not a look-alike: the gallery's EMOM
    // state is Round 7's TimedWorkoutFlow, as the route's BlockSlot draws it.
    const forms = readFileSync(resolve(ROOT, 'src/dev/gallery-refinement-forms.tsx'), 'utf8')
    expect(forms).toMatch(/import \{ TimedWorkoutFlow \} from '\.\.\/ui\/timed-workout-flow'/)
    expect(forms).toMatch(/case 'emom': return timedScene\('emom'\)/)
    cleanup()

    // `?state=cards`: the timed cards' EMOM is the route's own flow, ready —
    // its minute and no caption (Round 7's gallery EMOM is one movement, so
    // every minute is its own and nothing is marked Next).
    render(
      <MemoryRouter initialEntries={['/gallery/refinements?state=cards']}>
        <GalleryRefinements />
      </MemoryRouter>,
    )
    const cards = document.querySelector<HTMLElement>('[data-refinement-state="cards"]')!
    expect(emomWords(cards)).toBeNull()
    expectNoRetiredCaption(cards)
    expect(emomMarked('Next', cards)).toEqual([])
    expect(emomMovement('kb swing', cards).getByText('Min 1 · 12 reps')).toBeInTheDocument()
    await user.click(within(emomCard(cards)).getByRole('button', { name: 'Start EMOM' }))
    expect(emomWords(cards)).toBe('Minute 1 of 10')
    expect(emomMarked('Now', cards)).toEqual(['kb swing'])
    expect(emomTime(cards)).toBe('01:00')
    expect(localStorage.getItem(WORKOUT_EMOM_STORAGE_KEY)).toBeNull()
    const cardsSource = readFileSync(resolve(ROOT, 'src/dev/gallery-refinement-scenes.tsx'), 'utf8')
    expect(cardsSource).toMatch(/<LiveFlow kind="emom" \/>/)
    expect(fetch).not.toHaveBeenCalled()
  }, EMOM_TIMEOUT)
})
