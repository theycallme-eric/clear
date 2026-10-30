/**
 * REQ-014 / JOURNEY-011 — a timed prescription's own countdown, at the
 * workout-screen boundary.
 *
 * Mounted through the real route tree on a synthetic session from the workout
 * double: no personal data, no backend. The wall clock is the only thing the
 * test moves, and the platform's foreground events are what make the screen
 * read it, as on a phone.
 *
 * What it holds the screen to:
 *
 *   · the session's elapsed clock and the movement's countdown are two timers
 *     with two names, two directions and two sizes (AC-050);
 *   · a hollow-body hold counts its own seconds with Start / Pause / Reset, on
 *     its movement's card, while the sheet opens and minimises (AC-051);
 *   · the countdown is drawn with the session clock's adapter — the timer
 *     role's border, surface and chamfer — as an element frame in the card,
 *     never a second card or a second bar (AC-052);
 *   · the final five seconds are the shipped low state plus the screen-edge
 *     cue, both still under reduced motion, with no keyframe of their own; and
 *     running out records nothing (AC-053).
 *
 * jsdom applies no stylesheet, so framing and motion are proved as classes,
 * attributes and the rule text those classes resolve to.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppProviders, renderWithProviders, signedIn } from '../test/render'
import {
  createWorkoutDouble,
  snapshotFixture,
  type SectionFixture,
  type WorkoutDouble,
} from '../test/workout-double'
import { Card } from '../ui/card'
import { MovementCountdown } from '../ui/movement-countdown'
import { routes } from './router'

const COUNTDOWN_CSS = readFileSync(
  resolve(import.meta.dirname, '../ui/movement-countdown.css'),
  'utf-8',
)
const MOTION_CSS = readFileSync(
  resolve(import.meta.dirname, '../design-system/css/motion.css'),
  'utf-8',
)

/** Synthetic: a 30-second hollow-body hold, two sets, with its own rest. */
const SECTIONS: SectionFixture[] = [
  {
    title: 'Core',
    sectionType: 'accessory',
    blocks: [
      {
        exercises: [
          {
            prescription: {
              exercise_id: 'hollow-body-hold',
              equipment_used: 'bodyweight',
              load_type: 'bodyweight',
              load_value: null,
              modality: 'time',
              target_value: 30,
              sets: 2,
              rest_seconds: 60,
            },
          },
        ],
      },
    ],
  },
]

let clock = 0

beforeEach(() => {
  window.localStorage.clear()
  clock = Date.now()
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
})

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

/** The wall clock moves, then the platform says the page is back. */
function advance(seconds: number) {
  clock += seconds * 1000
  act(() => {
    window.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
  })
}

function reduceMotion(reduced: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: reduced && query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  )
}

async function shell(): Promise<WorkoutDouble> {
  const double = createWorkoutDouble({
    session: snapshotFixture({
      sections: SECTIONS,
      startedAt: new Date(Date.now() - 600_000).toISOString(),
    }),
  })
  render(
    <AppProviders {...signedIn({ workout: double.clients })}>
      <RouterProvider
        router={createMemoryRouter(routes, { initialEntries: ['/', '/workout'], initialIndex: 1 })}
      />
    </AppProviders>,
  )
  await screen.findByRole('heading', { level: 1, name: 'Workout' })
  await screen.findByRole('navigation', { name: 'Workout sections' })
  return double
}

/** The movement's card, on the main screen — not the sheet. */
function movementCard(): HTMLElement {
  const card = screen
    .getAllByRole('heading', { name: /hollow body hold$/ })
    .map((heading) => heading.closest('section'))
    .find((section) => section !== null && within(section).queryByRole('button', { name: 'Rest' }))
  if (card === undefined || card === null) throw new Error('no hollow body hold card')
  return card
}

function countdownRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'hollow body hold countdown' })
}

function countdown(): HTMLElement {
  return within(countdownRegion()).getByRole('timer', { name: 'Countdown' })
}

function sessionClock(): HTMLElement {
  return screen.getByRole('timer', { name: 'Session time' })
}

function control(name: 'Start' | 'Pause' | 'Reset'): HTMLElement {
  return within(countdownRegion()).getByRole('button', { name })
}

function edgeCue(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[data-countdown-edge]')
}

/** The digits' own font size — the decorative span the frame draws. */
function digitSize(timer: HTMLElement): string {
  const digits = Array.from(timer.querySelectorAll<HTMLElement>(':scope > span[aria-hidden="true"]'))
    .find((span) => span.querySelector('.clr-tumble') !== null)
  return digits?.style.fontSize ?? ''
}

function sheetForm(): HTMLElement | null {
  return screen.queryByRole('form', { name: /^(Log|Edit) set \d+ of hollow body hold$/ })
}

describe('Elapsed session clock and movement countdown stay separate (AC-050)', () => {
  it('names, directions and sizes the two clocks differently', async () => {
    await shell()

    expect(sessionClock()).toHaveTextContent('10:00')
    expect(countdown()).toHaveTextContent('00:30')
    expect(countdown()).toHaveTextContent('30 seconds left')
    expect(countdown()).not.toBe(sessionClock())
    expect(countdownRegion()).not.toContainElement(sessionClock())

    // The session clock is the larger one, and says nothing about time left.
    expect(digitSize(sessionClock())).toBe('var(--label-lg-size)')
    expect(digitSize(countdown())).toBe('var(--label-md-size)')
    expect(sessionClock()).not.toHaveTextContent(/left/)

    fireEvent.click(control('Start'))
    advance(10)

    // One counts up, the other down, from the same ten seconds.
    expect(sessionClock()).toHaveTextContent('10:10')
    expect(countdown()).toHaveTextContent('00:20')
    expect(countdown()).toHaveTextContent('20 seconds left')
  })
})

describe('A movement-owned countdown with Start / Pause / Reset (AC-051)', () => {
  it('starts, pauses, resumes and resets the hold’s own seconds', async () => {
    await shell()

    expect(control('Reset')).toBeDisabled()
    advance(10)
    // Nothing starts a countdown but Start.
    expect(countdown()).toHaveTextContent('00:30')

    fireEvent.click(control('Start'))
    advance(10)
    expect(countdown()).toHaveTextContent('00:20')

    fireEvent.click(control('Pause'))
    advance(10)
    expect(countdown()).toHaveTextContent('00:20')

    fireEvent.click(control('Start'))
    advance(5)
    expect(countdown()).toHaveTextContent('00:15')

    fireEvent.click(control('Reset'))
    expect(countdown()).toHaveTextContent('00:30')
    expect(control('Start')).toBeEnabled()
    expect(control('Reset')).toBeDisabled()
  })

  it('stays on its movement’s card, still running, while the sheet opens and minimises', async () => {
    const user = userEvent.setup()
    await shell()

    expect(movementCard()).toContainElement(countdownRegion())
    fireEvent.click(control('Start'))
    advance(5)

    fireEvent.click(within(movementCard()).getByRole('button', { name: 'Rest' }))
    const form = sheetForm()
    expect(form).not.toBeNull()
    // One countdown, on the card — none in the sheet.
    expect(screen.getAllByRole('region', { name: 'hollow body hold countdown' })).toHaveLength(1)
    expect(form).not.toContainElement(countdownRegion())
    expect(movementCard()).toContainElement(countdownRegion())
    expect(countdown()).toHaveTextContent('00:25')

    advance(5)
    await user.click(screen.getByRole('button', { name: 'Minimize' }))
    expect(sheetForm()).toBeNull()
    expect(movementCard()).toContainElement(countdownRegion())
    advance(5)
    expect(countdown()).toHaveTextContent('00:15')
    expect(control('Pause')).toBeInTheDocument()
  })

  it('times the next set from its own prescribed seconds once a set is logged', async () => {
    const user = userEvent.setup()
    await shell()

    fireEvent.click(control('Start'))
    advance(30)
    fireEvent.click(within(movementCard()).getByRole('button', { name: 'Rest' }))
    await user.click(
      within(screen.getByRole('form', { name: 'Log set 1 of hollow body hold' })).getByRole(
        'button',
        { name: 'Log set 1' },
      ),
    )
    await screen.findByRole('form', { name: 'Log set 2 of hollow body hold' })

    // The rest is the sheet's clock; the countdown is the card's, re-armed.
    expect(within(screen.getByRole('region', { name: 'Rest' })).getByRole('timer', {
      name: 'Time remaining',
    })).toHaveTextContent('01:00')
    expect(countdown()).toHaveTextContent('00:30')
    expect(control('Start')).toBeEnabled()
  })
})

describe('B05-06: full-width countdown above its paired controls, above Rest', () => {
  it('draws the timer first, then Start/Pause and Reset as one pair, inside the card above Rest', async () => {
    await shell()

    const card = movementCard()
    const region = countdownRegion()
    const rest = within(card).getByRole('button', { name: 'Rest' })
    expect(card).toContainElement(region)
    expect(region.compareDocumentPosition(rest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const [timerRow, pair] = Array.from(region.children) as HTMLElement[]
    expect(timerRow).toHaveClass('clr-movement-countdown__timer')
    expect(timerRow).toContainElement(countdown())
    expect(pair).toHaveClass('clr-action-group', 'clr-action-group--paired', 'clr-action-group--paired-labels')
    expect(pair).toContainElement(control('Start'))
    expect(pair).toContainElement(control('Reset'))

    fireEvent.click(control('Start'))
    expect(pair).toContainElement(control('Pause'))
    // The card's one entry is Rest; no separate Log button sits outside the sheet.
    expect(within(card).queryByRole('button', { name: /^Log/ })).toBeNull()
  })

  it('spans the card width and keeps the pair on one row through the shipped rules', () => {
    expect(COUNTDOWN_CSS).toMatch(/\.clr-movement-countdown__timer > \.clr-bleed\s*\{[^}]*display:\s*flex/)
    expect(COUNTDOWN_CSS).toMatch(/\.clr-movement-countdown__timer > \.clr-bleed > \*\s*\{[^}]*flex:\s*1 1 auto/)
  })
})

describe('Countdown framing matches the session clock (AC-052)', () => {
  it('is an element frame of the timer role inside the block card — no second card, no second bar', async () => {
    await shell()

    const timer = countdown()
    expect(timer).toHaveClass('clr-chamfer', 'clr-chamfer--md', 'clr-chamfer--timer')
    expect(timer).not.toHaveClass('clr-card__body')
    const bleed = timer.parentElement as HTMLElement
    expect(bleed).toHaveClass('clr-bleed')
    expect(bleed.style.getPropertyValue('--bleed')).toBe('var(--border-timer)')

    // The block's card is the only card around it, with its one bar.
    const card = timer.closest('.clr-card') as HTMLElement
    expect(card).not.toBeNull()
    expect(card.parentElement?.closest('.clr-card')).toBeNull()
    expect(card.querySelectorAll('.clr-card__bar')).toHaveLength(1)
    expect(card.querySelectorAll('.clr-card .clr-card')).toHaveLength(0)

    // The session clock's frame is the same chamfer and role.
    const session = sessionClock()
    expect(session).toHaveClass('clr-chamfer', 'clr-chamfer--md', 'clr-chamfer--timer')
  })

  it('is the shipped timer card, with one bar, wherever no card surrounds it', () => {
    renderWithProviders(<MovementCountdown seconds={30} movement="hollow body hold" />)

    const timer = screen.getByRole('timer', { name: 'Countdown' })
    expect(timer).toHaveClass('clr-card__body', 'clr-chamfer--timer')
    expect(document.querySelectorAll('.clr-card')).toHaveLength(1)
    expect(document.querySelectorAll('.clr-card__bar')).toHaveLength(1)
    expect(timer.parentElement?.parentElement).toHaveClass('clr-bleed')
  })

  it('never adds a frame or bar in a card', () => {
    renderWithProviders(
      <Card heading="Core">
        <MovementCountdown seconds={30} movement="hollow body hold" />
      </Card>,
    )
    expect(document.querySelectorAll('.clr-card')).toHaveLength(1)
    expect(document.querySelectorAll('.clr-card__bar')).toHaveLength(1)
  })
})

describe('Final five seconds: low state and screen-edge cue (AC-053)', () => {
  it('crosses into the low state and lights the screen edge in the final five seconds only', async () => {
    reduceMotion(false)
    await shell()

    fireEvent.click(control('Start'))
    advance(24)
    expect(countdown()).toHaveTextContent('00:06')
    expect(countdown()).toHaveClass('clr-chamfer--timer')
    expect(edgeCue()).toBeNull()
    expect(within(countdownRegion()).getByRole('status')).toHaveTextContent('')

    advance(1)
    expect(countdown()).toHaveTextContent('00:05')
    expect(countdown()).toHaveClass('clr-chamfer--timer-low')
    const bleed = countdown().parentElement as HTMLElement
    expect(bleed.style.getPropertyValue('--bleed')).toBe('var(--border-timer-low)')
    expect(bleed).toHaveClass('clr-pulse-micro')
    expect(bleed).toHaveAttribute('data-loop', 'run')
    expect(within(countdownRegion()).getByRole('status')).toHaveTextContent('Final 5 seconds')

    const edge = edgeCue() as HTMLElement
    expect(edge).not.toBeNull()
    expect(edge).toHaveClass('clr-countdown-edge', 'clr-pulse-micro')
    expect(edge).toHaveAttribute('aria-hidden', 'true')
    expect(edge).toHaveAttribute('data-loop', 'run')
    // On the viewport, not inside the card.
    expect(edge.parentElement).toBe(document.body)

    // The session clock never takes the low state.
    expect(sessionClock()).not.toHaveClass('clr-chamfer--timer-low')

    // Paused in the final stretch: still low, but no edge and no pulse.
    fireEvent.click(control('Pause'))
    expect(countdown()).toHaveClass('clr-chamfer--timer-low')
    expect(edgeCue()).toBeNull()
    expect(countdown().parentElement).not.toHaveClass('clr-pulse-micro')
  })

  it('keeps the low state and the edge, still, under reduced motion', async () => {
    reduceMotion(true)
    await shell()

    fireEvent.click(control('Start'))
    advance(27)
    expect(countdown()).toHaveClass('clr-chamfer--timer-low')
    expect(countdown().parentElement).toHaveAttribute('data-loop', 'still')
    const edge = edgeCue() as HTMLElement
    expect(edge).not.toBeNull()
    expect(edge).toHaveAttribute('data-loop', 'still')
    expect(within(countdownRegion()).getByRole('status')).toHaveTextContent('Final 5 seconds')
  })

  it('animates only with the shipped pulse, which reduced motion stills — no new flashing', () => {
    expect(COUNTDOWN_CSS).not.toMatch(/@keyframes|animation|transition|opacity/)
    expect(COUNTDOWN_CSS).toMatch(/\.clr-countdown-edge\s*\{[^}]*position:\s*fixed/)
    expect(COUNTDOWN_CSS).toMatch(/var\(--border-timer-low\)/)
    // The vendor's reduced-motion block stills the one pulse the cue uses.
    const reduced = MOTION_CSS.slice(MOTION_CSS.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced).toContain('.clr-pulse-micro')
  })

  it('records no movement result when the countdown runs out', async () => {
    const double = await shell()
    const before = double.loggedSets().length

    fireEvent.click(control('Start'))
    advance(31)
    expect(countdown()).toHaveTextContent('00:00')
    expect(within(countdownRegion()).getByRole('status')).toHaveTextContent('Countdown done')
    expect(edgeCue()).toBeNull()
    expect(control('Start')).toBeDisabled()
    expect(double.loggedSets()).toHaveLength(before)
    expect(within(movementCard()).queryByRole('list', { name: 'Logged sets' })).toBeNull()
    expect(sheetForm()).toBeNull()

    advance(60)
    expect(double.loggedSets()).toHaveLength(before)
  })
})
