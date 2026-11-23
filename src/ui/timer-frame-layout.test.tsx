/**
 * TASK-007 (REQ-007; C19, C20, C21; G06; R15, R17, R42, R49, R53, R67, R96,
 * R102, R103, R119; AC-C19-01, AC-C20-01, AC-C21-01, AC-R007-01, AC-R007-02,
 * AC-R007-03; JOURNEY-007) — whole timer frames, the one-row workout header
 * and independent functional clocks, on the real `/workout` route and its open
 * logging dialog.
 *
 * A3 TASK-108 carries the build's six cases onto Round 7's owners: every
 * clock draws one whole `TimerFrame` (`src/ui/workout-chrome.tsx`) — beside a
 * card, the app's `Card` in the timer role (one bar, one body, the readout
 * alone in it); inside a card, that card's element frame (one chamfer on the
 * timer role, no bar of its own) — and the session's rest is Round 7's one
 * timer-role card (`CountdownBar`). Never a frame inside a frame. The header
 * keeps TASK-007's one-row rules in `src/ui/workout-navigation.css`. The
 * build's `DeadlineTimer` and `refinements/presentation.css` are source
 * material only (evidence/refinement/task-108/test-ledger.json).
 *
 * JOURNEY-007's entry is the actual route: the real router, guard and shell
 * over a running session whose first section holds a timed hold with a rest,
 * and whose main section holds a lift, a circuit and every format clock
 * (`src/test/timer-frames-fixture.ts`). The wall clock is injected
 * (`Date.now`), so each clock's arithmetic is read exactly. The shared
 * stylesheets are applied to the document so the declared recipe is read
 * from the cascade; browser geometry is `e2e/refinement/task-007.spec.ts`.
 *
 * Synthetic data only: in-memory doubles, no account and no network. Rest is
 * the card's entry action, which opens the log and starts the prescribed rest
 * without logging anything.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { routes } from '../app/router'
import { GalleryRefinements } from '../dev/gallery-refinements'
import { MAIN_SECTION, timerFramesAcceptance, timerFramesSnapshot } from '../test/timer-frames-fixture'
import { AppProviders, signedIn } from '../test/render'
import { FIXTURE_USER_ID } from '../test/user-data-double'
import { createWorkoutDouble } from '../test/workout-double'

const ROOT = resolve(import.meta.dirname, '../..')
const read = (file: string) => readFileSync(resolve(ROOT, file), 'utf8')
const NAVIGATION_CSS = read('src/ui/workout-navigation.css')
const OVERLAY_CSS = read('src/styles/logging-overlay.css')
const COUNTDOWN_CSS = read('src/ui/movement-countdown.css')

beforeAll(() => {
  for (const file of ['src/ui/refinements/tokens.css', 'src/ui/workout-navigation.css']) {
    const style = document.createElement('style')
    style.dataset.task007 = file
    style.textContent = read(file)
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

/** JOURNEY-007's entry: `/workout`, the session running for `ranFor` seconds, on its first section. */
async function openWorkout(ranFor = 60) {
  const acceptance = timerFramesAcceptance()
  const running = timerFramesSnapshot(acceptance, {
    userId: FIXTURE_USER_ID,
    startedAt: new Date(clock - ranFor * 1000).toISOString(),
  })
  const double = createWorkoutDouble({ session: running })
  const router = createMemoryRouter(routes, { initialEntries: ['/', '/workout'], initialIndex: 1 })
  render(
    <AppProviders {...signedIn({ workout: double.clients })}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  await screen.findByRole('navigation', { name: 'Workout sections' })
  await screen.findByRole('region', { name: 'plank countdown' })
  return { double, router, user: userEvent.setup({ advanceTimers: (ms) => void (clock += ms) }) }
}

/** The jump list: Previous and the jump list save nothing (REQ-013). */
async function jumpToMain(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'All sections' }))
  await user.click(screen.getByRole('button', { name: /^Accessory, / }))
  // Round 7's ladders name their grid `Prescribed ladder rounds`.
  await screen.findAllByRole('list', { name: 'Prescribed ladder rounds' })
}

/** The digits a frame shows. */
function reading(timer: HTMLElement): string {
  return /\d{1,2}:\d{2}(?::\d{2})?/.exec(timer.textContent ?? '')?.[0] ?? ''
}

function sessionClock(): HTMLElement {
  return screen.getByRole('timer', { name: 'Session time' })
}

function countdown(): HTMLElement {
  return within(screen.getByRole('region', { name: 'plank countdown' })).getByRole('timer', { name: 'Countdown' })
}

/** The rest, wherever it is drawn: the footer's, or the open log's. */
function rests(): HTMLElement[] {
  return screen.queryAllByRole('region', { name: 'Rest' })
}

/**
 * The timer's frame on Round 7: the chamfer of an element frame inside a card
 * (the timer itself), or the body of the timer's own card.
 */
function frameOf(timer: HTMLElement): HTMLElement {
  return timer.matches('.clr-chamfer') ? timer : (timer.closest('.clr-card__body') as HTMLElement)
}

/**
 * C19 / AC-R007-01: one complete frame — the shape every clock draws, as
 * Round 7's TimerFrame draws it, with its readout centred and labelled once.
 */
function expectWholeFrame(timer: HTMLElement) {
  const label = timer.getAttribute('aria-label')
  const frame = frameOf(timer)
  // One chamfered body on the timer role.
  expect(frame, `${label}: the body`).toHaveClass('clr-chamfer')
  expect(frame.classList.contains('clr-chamfer--timer') || frame.classList.contains('clr-chamfer--timer-low'), `${label}: timer role`).toBe(true)
  if (frame === timer) {
    // Inside a card: that card's element frame, emitting through its own
    // bleed, with no bar of its own and nothing else in the bleed.
    expect(timer.closest('.clr-card'), `${label}: inside its card`).not.toBeNull()
    expect(timer.parentElement, `${label}: its bleed`).toHaveClass('clr-bleed')
    expect(timer.parentElement!.children, `${label}: the bleed holds the body alone`).toHaveLength(1)
    expect(timer.parentElement!.querySelectorAll('.clr-card__bar'), `${label}: no bar of its own`).toHaveLength(0)
  } else {
    // Beside a card: the app's Card in the timer role — one bar, one body —
    // holding the readout alone, and inside no other card.
    const card = frame.parentElement as HTMLElement
    expect(card, `${label}: its own card`).toHaveClass('clr-card')
    expect(card.parentElement?.closest('.clr-card') ?? null, `${label}: in no other card`).toBeNull()
    expect(card.querySelectorAll(':scope > .clr-card__bar'), `${label}: one bar`).toHaveLength(1)
    expect(frame.querySelectorAll('.clr-card'), `${label}: no card inside`).toHaveLength(0)
    expect(frame.children, `${label}: the body holds the readout alone`).toHaveLength(1)
  }
  // No accent-bar strip, no card and no second chamfer inside the readout.
  expect(timer.querySelectorAll('.clr-chamfer, .clr-card, .clr-card__bar'), `${label}: nothing nested`).toHaveLength(0)
  // The readout is centred, both ways.
  const style = getComputedStyle(timer)
  expect(style.justifyContent, `${label}: centred across`).toBe('center')
  expect(style.alignItems, `${label}: centred down`).toBe('center')
  // Labelled once, never a live region; the value said in words.
  expect(timer).not.toHaveAttribute('aria-live')
  expect(timer.querySelector('.a11y-hidden')?.textContent).toMatch(/second/)
}

/** The rest: Round 7's one timer-role card — its label, digits, fill and controls inside it. */
function expectRestCard(rest: HTMLElement) {
  const cards = rest.querySelectorAll('.clr-card')
  expect(cards, 'the rest: one card').toHaveLength(1)
  expect(cards[0].querySelectorAll(':scope > .clr-card__bar'), 'the rest: one bar').toHaveLength(1)
  const body = cards[0].querySelector(':scope > .clr-card__body') as HTMLElement
  expect(body.classList.contains('clr-chamfer--timer') || body.classList.contains('clr-chamfer--timer-low'), 'the rest: timer role').toBe(true)
  const timer = within(rest).getByRole('timer', { name: 'Time remaining' })
  // No inner chamfer or card around the digits: the card is the one frame.
  expect(timer.querySelectorAll('.clr-chamfer, .clr-card, .clr-card__bar')).toHaveLength(0)
  expect(timer.closest('.clr-chamfer')).toBe(body)
  expect(timer).not.toHaveAttribute('aria-live')
  expect(timer.querySelector('.a11y-hidden')?.textContent).toMatch(/second/)
  return timer
}

/** The declared body of one rule in a stylesheet. */
function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css.replaceAll(/\/\*[\s\S]*?\*\//g, ''))?.[1] ?? ''
}

// ─────────────────────────────────────────────────────────────────────────────

describe('TASK-007 whole timer frames and independent functional clocks', () => {
  it('AC-C19-01 every clock on the real /workout route draws one whole frame: one chamfered body, no accent bar or second chamfer, the readout centred', async () => {
    const { user } = await openWorkout()

    // The entry: the preparation hold's countdown and the session clock.
    expectWholeFrame(countdown())
    expectWholeFrame(sessionClock())

    // Every format clock in the main section, started.
    await jumpToMain(user)
    for (const name of ['Start EMOM', 'Start AMRAP', 'Start FOR TIME', 'Start ladder', 'Start schedule']) {
      await user.click(screen.getByRole('button', { name }))
    }
    advance(3)

    const timers = screen.getAllByRole('timer')
    const named = timers.map((timer) => timer.getAttribute('aria-label'))
    // Round 7 names each format clock by its block.
    expect(named).toEqual(expect.arrayContaining([
      'Session time',
      'Countdown',
      'EMOM time',
      'AMRAP time',
      'FOR TIME time',
      'Ladder time',
      'Time remaining',
    ]))
    // EMOM minute, AMRAP window, scheduled interval, two races, a circuit station hold, the session.
    expect(timers.length).toBeGreaterThanOrEqual(7)
    for (const timer of timers) expectWholeFrame(timer)

    // The declared recipe: a clock beside its card fills its place — the
    // frame's own full-width wrapper — and every frame centres its readout.
    for (const name of ['EMOM time', 'AMRAP time', 'FOR TIME time', 'Ladder time', 'Time remaining']) {
      const wrapper = screen.getByRole('timer', { name }).closest('.clr-timer-frame') as HTMLElement
      expect(wrapper.style.width, `${name}: fills its place`).toBe('100%')
      expect(wrapper.style.display).toBe('flex')
    }
    // Inside its card the countdown's element frame fills the card's width too,
    // its column stretched by the countdown's own stylesheet.
    const hold = within(screen.getAllByRole('region', { name: /countdown$/ })[0]).getByRole('timer')
    expect((hold.parentElement as HTMLElement).style.width).toBe('100%')
    expect(COUNTDOWN_CSS).toMatch(/\.clr-movement-countdown__timer > \.clr-bleed > \*\s*\{[^}]*flex:\s*1 1 auto/)
  })

  it('AC-R007-01 the rest in the open log is one frame filling the log\'s width, with no short inner chamfer inside it', async () => {
    const { user } = await openWorkout()
    await jumpToMain(user)

    // The lift's Rest opens the log and starts its rest; nothing is logged.
    const lift = screen.getAllByRole('button', { name: 'Rest' })[0]
    await user.click(lift)
    const log = await screen.findByRole('form', { name: /^Log set 1 of back squat$/i })
    // The open log is the standard block's focused logging dialog.
    const dialog = log.closest<HTMLElement>('dialog')!
    expect(dialog).toHaveAttribute('open')
    const [rest] = rests()
    expect(dialog).toContainElement(rest)

    const timer = expectRestCard(rest)
    expect(reading(timer)).toBe('02:00')
    // The label stays in the same card, beside the digits on the card's own
    // row (Round 7's rest card): never a readout outside the card it names.
    const label = within(rest).getByText(/^Rest after back squat$/i)
    expect(label.contains(timer)).toBe(false)
    expect(timer.parentElement).toBe(label.parentElement)
    expect(label.compareDocumentPosition(timer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // The card is the log's whole width: a block in the log's body, not an
    // inline readout (its geometry is read in e2e/refinement/task-007.spec.ts).
    expect(rest.parentElement?.closest('.clr-card')).toBeNull()
  })

  it('AC-C20-01 the Workout title, the centred elapsed readout and the menu frame share one row: the readout is the menu\'s height and never stretched across the header', async () => {
    await openWorkout()

    const title = screen.getByRole('heading', { level: 1, name: 'Workout' })
    const header = title.closest<HTMLElement>('header')!
    expect(header).toHaveClass('clr-workout-header')
    const session = sessionClock()
    const menu = within(header).getByRole('button', { name: 'Actions' })
    expect(header).toContainElement(session)
    expect(header).toContainElement(menu)

    // One row: nothing lets the readout and menu drop to a second line.
    expect(rule(NAVIGATION_CSS, '.clr-workout-header')).toMatch(/flex-wrap:\s*nowrap/)
    expect(NAVIGATION_CSS.replaceAll(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/flex-wrap:\s*wrap/)
    expect(getComputedStyle(header).flexWrap).toBe('nowrap')
    // The title gives up width first; the readout and the menu stay whole.
    expect(rule(NAVIGATION_CSS, '.clr-workout-header > :first-child')).toMatch(/min-width:\s*0/)
    expect(rule(NAVIGATION_CSS, '.clr-workout-header > :last-child')).toMatch(/flex:\s*none/)
    // The readout is the menu's height (Round 7's accepted header rule) and is
    // sized to its digits rather than stretched across the header.
    expect(OVERLAY_CSS).toMatch(
      /\[data-logging-overlay\] \.clr-workout-header \[aria-label="Actions"\],\s*\[data-logging-overlay\] \.clr-workout-header \.clr-timer-frame__readout \{\s*height:var\(--heading-h1-line-height\);/,
    )
    expect(OVERLAY_CSS).toMatch(/\[data-logging-overlay\] \.clr-workout-header \{ align-items:center !important; \}/)
    const wrapper = session.closest('.clr-timer-frame') as HTMLElement
    expect(wrapper.style.display).toBe('inline-flex')
    expect(wrapper.style.width).not.toBe('100%')
    expect(frameOf(session)).toHaveClass('clr-timer-frame__readout')
    expect(reading(session)).toBe('01:00')
  })

  it('AC-R007-02 the accepted single-row header is the only header state shown: the route keeps its one row past the hour, and the gallery presents no two-row state', async () => {
    // Past the hour the readout is H:MM:SS, still one clock on the title's row.
    await openWorkout(3723)
    const header = screen.getByRole('heading', { level: 1, name: 'Workout' }).closest<HTMLElement>('header')!
    expect(reading(sessionClock())).toBe('1:02:03')
    expect(within(header).getAllByRole('timer')).toHaveLength(1)
    expect(within(header).getByRole('button', { name: 'Actions' })).toBeInTheDocument()
    expect(within(header).getByText('Workout')).toBeInTheDocument()
    expectWholeFrame(within(header).getByRole('timer'))
    // The readout and the menu share the header's last cell, whole, on one row.
    const cluster = header.lastElementChild as HTMLElement
    expect(cluster).toContainElement(sessionClock())
    expect(cluster).toContainElement(within(header).getByRole('button', { name: 'Actions' }))
    expect(getComputedStyle(header).flexWrap).toBe('nowrap')
    // On a narrow phone the title takes a smaller heading size on the same line
    // height; nothing moves the readout or the menu to a second line.
    expect(NAVIGATION_CSS).toMatch(/@media \(max-width: 23\.75rem\) \{\s*\.clr-workout-header \.clr-screen__title \{\s*font-size: var\(--heading-h3-size\);\s*\}\s*\}/)

    // Round 7's accepted gallery (bec4454) draws no workout header in its
    // movement cards state, so it shows no other header state at all.
    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/gallery/refinements?state=cards']}>
          <GalleryRefinements />
        </MemoryRouter>
      </AppProviders>,
    )
    const state = document.querySelector<HTMLElement>('[data-refinement-state="cards"]')!
    expect(state.querySelectorAll('header.clr-workout-header')).toHaveLength(0)
    expect(state.textContent).not.toMatch(/two[- ]row/i)
  })

  it('AC-C21-01 the session clock, the preparation hold, the rest and a paused section clock each keep their own reading and arithmetic', async () => {
    const { user } = await openWorkout()

    // The preparation hold starts; the session clock runs on beside it.
    await user.click(within(screen.getByRole('region', { name: 'plank countdown' })).getByRole('button', { name: 'Start' }))
    advance(10)
    expect(reading(countdown())).toBe('00:20')
    expect(reading(sessionClock())).toBe('01:10')

    // Pausing the hold banks its time; nothing else stops.
    await user.click(within(screen.getByRole('region', { name: 'plank countdown' })).getByRole('button', { name: 'Pause' }))
    advance(30)
    expect(reading(countdown())).toBe('00:20')
    expect(reading(sessionClock())).toBe('01:40')

    // A section clock: For Time runs, pauses and resumes with its cap.
    await jumpToMain(user)
    // The For Time card: the one whose Start says so.
    const forTimeCard = screen.getByRole('button', { name: 'Start FOR TIME' }).closest<HTMLElement>('.clr-card')!
    await user.click(within(forTimeCard).getByRole('button', { name: 'Start FOR TIME' }))
    advance(30)
    // The race clock beside its card (Round 7 names it by its block).
    const race = () => screen.getByRole('timer', { name: 'FOR TIME time' })
    const isLow = () => frameOf(race()).classList.contains('clr-chamfer--timer-low')
    // Round 7 states the race as its "Elapsed" reading beside the cap its card
    // states (`15 MIN CAP`), where the build read ForTimeBlock's "Cap in 14:30"
    // and "Cap in 14:20" (updated under Eric's rule of 2026-11-23, "Yes,
    // approve"): elapsed and cap together carry the time left.
    const cap = () => race().closest('.clr-timed-flow')!.querySelector('.clr-timed-meta')
    expect(reading(race())).toBe('00:30')
    expect(race()).toHaveTextContent('Elapsed')
    expect(cap()).toHaveTextContent(/^15 MIN CAP/)
    await user.click(within(forTimeCard).getByRole('button', { name: 'Pause' }))
    advance(120)
    expect(reading(race())).toBe('00:30')
    expect(cap()).toHaveTextContent(/^15 MIN CAP/)
    expect(reading(sessionClock())).toBe('04:10')
    await user.click(within(forTimeCard).getByRole('button', { name: 'Resume' }))
    advance(10)
    expect(reading(race())).toBe('00:40')
    expect(race()).toHaveTextContent('Elapsed')
    expect(cap()).toHaveTextContent(/^15 MIN CAP/)
    expect(reading(sessionClock())).toBe('04:20')
    // The cap arithmetic is the race's own: the 15:00 cap is still 14:20 of
    // active time away — the pause counted for nothing — so the warning's
    // colour arrives at 14:50 of race time, ten seconds before the cap.
    advance(849)
    expect(reading(race())).toBe('14:49')
    expect(isLow()).toBe(false)
    advance(1)
    expect(reading(race())).toBe('14:50')
    expect(isLow()).toBe(true)
    expect(MAIN_SECTION).toBe('Strength and conditioning')
  })

  it('AC-R007-03 opening, minimising and reopening the log moves the rest between the log and the footer without creating, restarting or resetting a clock', async () => {
    const { double, user } = await openWorkout()

    await user.click(within(screen.getByRole('region', { name: 'plank countdown' })).getByRole('button', { name: 'Start' }))
    advance(5)

    // Rest opens the log with the prescribed rest running.
    const card = screen.getByRole('region', { name: 'plank countdown' }).closest<HTMLElement>('[data-workout-card="workout"]') ??
      screen.getByRole('region', { name: 'plank countdown' }).closest<HTMLElement>('.clr-card')!
    await user.click(within(card).getByRole('button', { name: 'Rest' }))
    await screen.findByRole('form', { name: /^Log set 1 of plank$/i })
    expect(rests()).toHaveLength(1)
    const inLog = () => within(rests()[0]).getByRole('timer', { name: 'Time remaining' })
    expect(reading(inLog())).toBe('00:20')
    advance(6)
    expect(reading(inLog())).toBe('00:14')
    // The hold on the card ran on through the open log.
    expect(reading(countdown())).toBe('00:19')

    // Minimised: the same rest, now the footer's, at the same reading.
    // The log's framed X ("Close log") is its collapse; Round 7's dialog closes
    // on its own animation frame.
    await user.click(screen.getByRole('button', { name: 'Close log' }))
    await waitFor(() => expect(screen.queryByRole('form', { name: /^Log set 1 of plank$/i })).toBeNull())
    expect(rests()).toHaveLength(1)
    const inFooter = expectRestCard(rests()[0])
    expect(reading(inFooter)).toBe('00:14')
    advance(4)
    expect(reading(within(rests()[0]).getByRole('timer', { name: 'Time remaining' }))).toBe('00:10')

    // Reopened: still the same rest, not a fresh twenty seconds.
    await user.click(within(card).getByRole('button', { name: 'Rest' }))
    await screen.findByRole('form', { name: /^Log set 1 of plank$/i })
    expect(reading(inLog())).toBe('00:10')
    expect(reading(countdown())).toBe('00:15')
    expect(reading(sessionClock())).toBe('01:15')

    // Nothing was written to capture any of it.
    expect(double.loggedSets()).toEqual([])
    expect(double.recorded()).toEqual([])
    expect(double.completed()).toEqual([])
  })
})
