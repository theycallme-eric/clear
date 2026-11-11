/**
 * TASK-007 (REQ-007; C19, C20, C21; G06; R15, R17, R42, R49, R53, R67, R96,
 * R102, R103, R119; AC-C19-01, AC-C20-01, AC-C21-01, AC-R007-01, AC-R007-02,
 * AC-R007-03; JOURNEY-007) — whole timer frames, the one-row workout header
 * and independent functional clocks, through the shared owner
 * (`DeadlineTimer`, `src/ui/refinements/deadline-timer.tsx`) and every clock
 * consumer on the real `/workout` route and its open logging sheet.
 *
 * JOURNEY-007's entry is the actual route: the real router, guard and shell
 * over a running session whose Warm-up holds a timed hold with a rest, and
 * whose main section holds a lift, a circuit and every format clock
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

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { routes } from '../app/router'
import { GalleryRefinements } from '../dev/gallery-refinements'
import { MAIN_SECTION, TIMER_FRAME_LISTS, timerFramesAcceptance, timerFramesSnapshot } from '../test/timer-frames-fixture'
import { AppProviders, signedIn } from '../test/render'
import { FIXTURE_USER_ID } from '../test/user-data-double'
import { createWorkoutDouble } from '../test/workout-double'

const ROOT = resolve(import.meta.dirname, '../..')
const PRESENTATION_CSS = readFileSync(resolve(ROOT, 'src/ui/refinements/presentation.css'), 'utf8')
const NAVIGATION_CSS = readFileSync(resolve(ROOT, 'src/ui/workout-navigation.css'), 'utf8')

beforeAll(() => {
  for (const file of ['src/ui/refinements/tokens.css', 'src/ui/refinements/presentation.css']) {
    const style = document.createElement('style')
    style.dataset.task007 = file
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

/** JOURNEY-007's entry: `/workout`, the session running for one minute, on its Warm-up. */
async function openWorkout() {
  const acceptance = timerFramesAcceptance()
  const running = timerFramesSnapshot(acceptance, {
    userId: FIXTURE_USER_ID,
    startedAt: new Date(clock - 60_000).toISOString(),
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
  await screen.findAllByRole('list', { name: TIMER_FRAME_LISTS.ladder })
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

function frameOf(timer: HTMLElement): HTMLElement {
  return timer.parentElement as HTMLElement
}

/** C19 / AC-R007-01: one complete frame — the shape every clock draws. */
function expectWholeFrame(timer: HTMLElement, placement: 'body' | 'header') {
  const frame = frameOf(timer)
  const label = timer.getAttribute('aria-label')
  // One chamfered timer body on the timer role, emitting through its own bleed.
  expect(timer, `${label}: the body`).toHaveClass('clr-chamfer', 'clr-chamfer--md', 'clr-accepted-timer__body')
  expect(timer.classList.contains('clr-chamfer--timer') || timer.classList.contains('clr-chamfer--timer-low'), `${label}: timer role`).toBe(true)
  expect(frame, `${label}: its bleed`).toHaveClass('clr-bleed', 'clr-accepted-timer', `clr-accepted-timer--${placement}`)
  expect(frame).toHaveAttribute('data-timer-frame', placement)
  // No accent-bar strip, no card and no second chamfer inside or around it.
  expect(timer, `${label}: not a card body`).not.toHaveClass('clr-card__body')
  expect(timer.querySelectorAll('.clr-chamfer, .clr-card, .clr-card__bar'), `${label}: nothing nested`).toHaveLength(0)
  expect(frame.querySelectorAll(':scope > .clr-card, :scope > .clr-card__bar'), `${label}: no card in the bleed`).toHaveLength(0)
  expect(frame.children, `${label}: the bleed holds the body alone`).toHaveLength(1)
  // The readout is centred in the body, both ways.
  const style = getComputedStyle(timer)
  expect(style.display, `${label}: flex body`).toBe('flex')
  expect(style.justifyContent, `${label}: centred across`).toBe('center')
  expect(style.alignItems, `${label}: centred down`).toBe('center')
  // Labelled once, never a live region; the value said in words.
  expect(timer).not.toHaveAttribute('aria-live')
  expect(timer.querySelector('.a11y-hidden')?.textContent).toMatch(/second/)
}

/** The declared body of one rule in the shared presentation stylesheet. */
function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css.replaceAll(/\/\*[\s\S]*?\*\//g, ''))?.[1] ?? ''
}

// ─────────────────────────────────────────────────────────────────────────────

describe('TASK-007 whole timer frames and independent functional clocks', () => {
  it('AC-C19-01 every clock on the real /workout route draws one whole frame: one chamfered body, no accent bar or second chamfer, the readout centred', async () => {
    const { user } = await openWorkout()

    // The entry: the preparation hold's countdown and the session clock.
    expectWholeFrame(countdown(), 'body')
    expectWholeFrame(sessionClock(), 'header')

    // Every format clock in the main section, started.
    await jumpToMain(user)
    for (const name of ['Start EMOM', 'Start AMRAP', 'Start For Time', 'Start ladder', 'Start schedule']) {
      await user.click(screen.getByRole('button', { name }))
    }
    advance(3)

    const timers = screen.getAllByRole('timer')
    const named = timers.map((timer) => [timer.getAttribute('aria-label'), frameOf(timer).dataset.clock])
    expect(named).toEqual(expect.arrayContaining([
      ['Session time', 'session'],
      ['Countdown', 'movement'],
      ['Time remaining', 'format'],
      ['Block time', 'format'],
    ]))
    // EMOM minute, AMRAP window, scheduled interval, two races, a circuit station hold, the session.
    expect(timers.length).toBeGreaterThanOrEqual(7)
    for (const timer of timers) {
      expectWholeFrame(timer, timer.getAttribute('aria-label') === 'Session time' ? 'header' : 'body')
    }

    // The declared recipe: a body frame fills its place; the body centres its readout.
    expect(rule(PRESENTATION_CSS, '.clr-accepted-timer--body')).toMatch(/display:\s*flex/)
    expect(rule(PRESENTATION_CSS, '.clr-accepted-timer--body')).toMatch(/width:\s*100%/)
    expect(rule(PRESENTATION_CSS, '.clr-accepted-timer__body')).toMatch(/justify-content:\s*center/)
    expect(rule(PRESENTATION_CSS, '.clr-accepted-timer__body')).toMatch(/align-items:\s*center/)
    // Nothing outside the shared owner styles a timer's width.
    expect(readFileSync(resolve(ROOT, 'src/ui/movement-countdown.css'), 'utf8')).not.toMatch(/\.clr-bleed\s*>\s*\*/)
  })

  it('AC-R007-01 the rest in the open log is one frame filling the log\'s width, not a short readout beside its label', async () => {
    const { user } = await openWorkout()
    await jumpToMain(user)

    // The lift's Rest opens the log and starts its rest; nothing is logged.
    const lift = screen.getAllByRole('button', { name: 'Rest' })[0]
    await user.click(lift)
    const log = await screen.findByRole('form', { name: /^Log set 1 of back squat$/i })
    // TASK-043: the open log is the standard block's focused logging dialog.
    const sheet = log.closest<HTMLElement>('dialog.clr-accepted-log')!
    const [rest] = rests()
    expect(sheet).toContainElement(rest)

    const timer = within(rest).getByRole('timer', { name: 'Time remaining' })
    expectWholeFrame(timer, 'body')
    expect(frameOf(timer)).toHaveAttribute('data-clock', 'rest')
    expect(reading(timer)).toBe('02:00')
    // The frame is the rest card's own full-width row: not sharing a row with
    // the label, and the label stays in the same card above it.
    const label = within(rest).getByText(/^Rest after back squat$/i)
    expect(label.contains(timer)).toBe(false)
    expect(frameOf(timer).parentElement).toBe(label.parentElement)
    expect(label.compareDocumentPosition(timer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(getComputedStyle(frameOf(timer)).width).toBe('100%')
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
    const recipe = rule(PRESENTATION_CSS, '.clr-workout-header')
    expect(recipe).toMatch(/flex-wrap:\s*nowrap/)
    expect(NAVIGATION_CSS.replaceAll(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/flex-wrap:\s*wrap/)
    expect(getComputedStyle(header).flexWrap).toBe('nowrap')
    // The readout is the compact header frame at the menu's control height,
    // sized to its digits rather than stretched across the header.
    expect(frameOf(session)).toHaveClass('clr-accepted-timer--header')
    expect(rule(PRESENTATION_CSS, '.clr-accepted-timer--header > .clr-accepted-timer__body')).toMatch(/min-height:\s*var\(--control-height\)/)
    expect(rule(PRESENTATION_CSS, '.clr-accepted-timer--header')).not.toMatch(/width:\s*100%/)
    // The title's line is the same row height, so all three centre on it.
    expect(rule(PRESENTATION_CSS, '.clr-workout-header .clr-screen__title')).toMatch(/line-height:\s*var\(--control-height\)/)
    expect(reading(session)).toBe('01:00')
  })

  it('AC-R007-02 the accepted single-row header is the only header state shown: the gallery draws the route\'s own header on one row, and no two-row state', () => {
    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/gallery/refinements?state=cards']}>
          <GalleryRefinements />
        </MemoryRouter>
      </AppProviders>,
    )
    const state = document.querySelector<HTMLElement>('[data-refinement-state="cards"]')!
    const headers = [...state.querySelectorAll<HTMLElement>('header.clr-workout-header')]
    // The accepted reading and one past the hour: each one row of title, readout and menu.
    expect(headers).toHaveLength(2)
    expect(headers.map((header) => reading(within(header).getByRole('timer', { name: 'Session time' })))).toEqual(['20:32', '1:02:03'])
    for (const header of headers) {
      expect(within(header).getAllByRole('timer')).toHaveLength(1)
      expect(within(header).getByRole('button', { name: 'Actions' })).toBeInTheDocument()
      expect(within(header).getByText('Workout')).toBeInTheDocument()
      expectWholeFrame(within(header).getByRole('timer'), 'header')
    }
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
    // The For Time card: the one whose Start says so (the lift's list shares its name).
    const forTimeCard = screen.getByRole('button', { name: 'Start For Time' }).closest<HTMLElement>('[data-workout-card="workout"]')!
    await user.click(within(forTimeCard).getByRole('button', { name: 'Start For Time' }))
    advance(30)
    // The race clock beside its card: the first of the two races in the
    // section (the For Time block precedes the timed ladder), which is unstarted.
    const race = () => screen.getAllByRole('timer', { name: 'Block time' })[0]
    expect(reading(race())).toBe('00:30')
    expect(screen.getAllByText('Cap in 14:30').length).toBeGreaterThan(0)
    await user.click(within(forTimeCard).getByRole('button', { name: 'Pause' }))
    advance(120)
    expect(reading(race())).toBe('00:30')
    expect(screen.getAllByText('Cap in 14:30').length).toBeGreaterThan(0)
    expect(reading(sessionClock())).toBe('04:10')
    await user.click(within(forTimeCard).getByRole('button', { name: 'Resume' }))
    advance(10)
    expect(reading(race())).toBe('00:40')
    expect(screen.getAllByText('Cap in 14:20').length).toBeGreaterThan(0)
    expect(reading(sessionClock())).toBe('04:20')
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
    // TASK-043: the log's framed X ("Close log") is its collapse (was Minimize).
    await user.click(screen.getByRole('button', { name: 'Close log' }))
    expect(screen.queryByRole('form', { name: /^Log set 1 of plank$/i })).toBeNull()
    expect(rests()).toHaveLength(1)
    const inFooter = within(rests()[0]).getByRole('timer', { name: 'Time remaining' })
    expectWholeFrame(inFooter, 'body')
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
