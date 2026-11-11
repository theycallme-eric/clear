/**
 * TASK-008 (REQ-008; C22, C23, C24, C61; G06; R120, R125, R126, R133, R135,
 * R144; P05; AC-C22-01, AC-C23-01, AC-C24-01, AC-C61-01, AC-R008-01,
 * AC-R008-02, AC-R008-03, AC-R008-04; JOURNEY-008) — the recovered smooth,
 * synchronized countdown warning, through its one owner (`DeadlineTimer`,
 * `src/ui/refinements/deadline-timer.tsx`, with the accepted eligibility rule
 * `countdown-warning.ts`) and the real consumers on `/workout`, its open
 * logging sheet and a native dialog.
 *
 * JOURNEY-008's entry is the actual route: the real router, guard and shell
 * over a running session whose Warm-up holds a 30-second timed hold with a
 * 20-second rest, and whose main section holds every format clock
 * (`src/test/timer-frames-fixture.ts`, TASK-007's composition, read-only).
 * The wall clock is injected (`Date.now`), so each threshold is crossed
 * exactly. The shared stylesheets are applied so the recipe is read from the
 * cascade. jsdom runs no CSS animation, so the phase pin is observed on the
 * animations the browser would hand back (`getAnimations`), and the real
 * breathe is sampled in `e2e/refinement/task-008.spec.ts`.
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
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { routes } from '../app/router'
import { GalleryRefinements } from '../dev/gallery-refinements'
import { TIMER_FRAME_LISTS, timerFramesAcceptance, timerFramesSnapshot } from '../test/timer-frames-fixture'
import { AppProviders, signedIn } from '../test/render'
import { FIXTURE_USER_ID } from '../test/user-data-double'
import { createWorkoutDouble } from '../test/workout-double'

const ROOT = resolve(import.meta.dirname, '../..')
const read = (file: string) => readFileSync(resolve(ROOT, file), 'utf8')
const TOKENS_CSS = read('src/ui/refinements/tokens.css')
const PRESENTATION_CSS = read('src/ui/refinements/presentation.css')
const COUNTDOWN_CSS = read('src/ui/movement-countdown.css')
const SHEET_CSS = read('src/ui/set-logging-sheet.css')
const MOTION_CSS = read('src/design-system/css/motion.css')

const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** The declarations of the first rule whose selector list is exactly `selector`. */
function ruleBody(css: string, selector: string): string {
  const flat = withoutComments(css)
  for (const match of flat.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    if (match[1].trim().replace(/\s+/g, ' ') === selector) return match[2].replace(/\s+/g, ' ').trim()
  }
  return ''
}

beforeAll(() => {
  for (const file of ['src/ui/refinements/tokens.css', 'src/ui/refinements/presentation.css']) {
    const style = document.createElement('style')
    style.dataset.task008 = file
    style.textContent = read(file)
    document.head.append(style)
  }
})

afterAll(() => {
  document.querySelectorAll('style[data-task008]').forEach((style) => style.remove())
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
  delete (Element.prototype as Partial<Element>).getAnimations
})

/** Time passes; the page re-reads its clocks, as a resumed tab does. */
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

/** JOURNEY-008's entry: `/workout`, the session running for one minute, on its Warm-up. */
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

async function jumpToMain(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'All sections' }))
  await user.click(screen.getByRole('button', { name: /^Accessory, / }))
  await screen.findAllByRole('list', { name: TIMER_FRAME_LISTS.ladder })
}

function holdRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'plank countdown' })
}

function holdTimer(): HTMLElement {
  return within(holdRegion()).getByRole('timer', { name: 'Countdown' })
}

function holdCard(): HTMLElement {
  return holdRegion().closest<HTMLElement>('[data-workout-card="workout"]') ?? holdRegion().closest<HTMLElement>('.clr-card')!
}

function sessionClock(): HTMLElement {
  return screen.getByRole('timer', { name: 'Session time' })
}

function restTimer(): HTMLElement {
  return within(screen.getByRole('region', { name: 'Rest' })).getByRole('timer', { name: 'Time remaining' })
}

function edges(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-countdown-edge]')]
}

function theEdge(): HTMLElement {
  const all = edges()
  expect(all, 'exactly one screen-edge aura').toHaveLength(1)
  return all[0]
}

function reading(timer: HTMLElement): string {
  return /\d{1,2}:\d{2}(?::\d{2})?/.exec(timer.textContent ?? '')?.[0] ?? ''
}

/** What the warning shows on one timer: colour, breathe, and its loop state. */
function warningOf(timer: HTMLElement) {
  return {
    low: timer.parentElement?.hasAttribute('data-low') ?? false,
    role: timer.classList.contains('clr-chamfer--timer-low') ? 'timer-low' : 'timer',
    urgent: timer.getAttribute('data-urgent') === 'true',
    loop: timer.getAttribute('data-loop'),
  }
}

const NEUTRAL = { low: false, role: 'timer', urgent: false, loop: null }
const COLOUR = { low: true, role: 'timer-low', urgent: false, loop: null }
const BREATHE = { low: true, role: 'timer-low', urgent: true, loop: 'run' }

/** The animations a browser hands back for a breathing timer or aura, pinned or not. */
const breathes = new WeakMap<Element, { animationName: string; startTime: number | null }>()
function observeBreathes() {
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    writable: true,
    value(this: Element) {
      if (!this.matches('[data-urgent][data-loop="run"], .clr-deadline-edge[data-loop="run"]')) {
        breathes.delete(this)
        return []
      }
      let animation = breathes.get(this)
      if (animation === undefined) {
        // A CSS animation starts on its own moment, not the timeline's epoch.
        animation = { animationName: 'clr-deadline-breathe', startTime: 4321 }
        breathes.set(this, animation)
      }
      return [Object.assign(animation, { effect: null, playState: 'running', cancel() {} })]
    },
  })
}

describe('TASK-008 recovered smooth synchronized countdown warning', () => {
  it('AC-C22-01 the recovered appearance: one 70px urgency-a400 inset vignette and the timer breathing .2/.8/.2 on one smooth 1.5 s ease-in-out cycle, a steady .5 still, with no hard outline, fill, flash or stepped micro-pulse', () => {
    // The owner-selected values, stated once (tokens.css).
    const tokens = Object.fromEntries(
      [...TOKENS_CSS.matchAll(/(--countdown-warning-[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]),
    )
    expect(tokens).toEqual({
      '--countdown-warning-edge-softness': '70px',
      '--countdown-warning-period': '1.5s',
      '--countdown-warning-easing': 'ease-in-out',
      '--countdown-warning-opacity-min': '.2',
      '--countdown-warning-opacity-max': '.8',
      '--countdown-warning-opacity-still': '.5',
    })

    // One viewport-wide, pointer-transparent soft vignette: no hard outline (no
    // zero-blur spread), no fill or background, no flash of the whole screen.
    const edge = ruleBody(PRESENTATION_CSS, '.clr-deadline-edge')
    expect(edge).toContain('position: fixed;')
    expect(edge).toContain('inset: 0;')
    expect(edge).toContain('pointer-events: none;')
    expect(edge).toContain('box-shadow: inset 0 0 var(--countdown-warning-edge-softness) var(--urgency-a400);')
    expect(edge).not.toMatch(/background|border|outline|inset 0 0 0/)

    // The timer and the aura share one rule: the same keyframes, period and easing.
    expect(ruleBody(PRESENTATION_CSS, ".clr-accepted-timer__body[data-urgent][data-loop='run'], .clr-deadline-edge[data-loop='run']")).toBe(
      'animation: clr-deadline-breathe var(--countdown-warning-period) var(--countdown-warning-easing) infinite;',
    )
    expect(withoutComments(PRESENTATION_CSS)).toMatch(
      /@keyframes clr-deadline-breathe \{\s*0%, 100% \{ opacity: var\(--countdown-warning-opacity-min\); \}\s*50% \{ opacity: var\(--countdown-warning-opacity-max\); \}\s*\}/,
    )
    // Still — the loop's still policy, the device's or the app's reduced motion — a steady .5.
    expect(ruleBody(PRESENTATION_CSS, '.clr-accepted-timer__body[data-urgent], .clr-deadline-edge')).toBe(
      'opacity: var(--countdown-warning-opacity-still);',
    )
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(
      withoutComments(PRESENTATION_CSS).slice(withoutComments(PRESENTATION_CSS).indexOf('.clr-deadline-edge')),
    )?.[1] ?? ''
    expect(reduced.replace(/\s+/g, ' ')).toContain(
      '.clr-accepted-timer__body[data-urgent], .clr-deadline-edge { animation: none !important; opacity: var(--countdown-warning-opacity-still); }',
    )
    expect(ruleBody(PRESENTATION_CSS, 'html[data-reduce-motion] .clr-accepted-timer__body[data-urgent], html[data-reduce-motion] .clr-deadline-edge')).toBe(
      'animation: none !important; opacity: var(--countdown-warning-opacity-still);',
    )

    // The retired hard-outlined countdown edge is gone, and the warning never
    // uses the shipped four-second stepped micro-pulse.
    expect(withoutComments(COUNTDOWN_CSS)).not.toMatch(/clr-countdown-edge|box-shadow|animation|position: fixed/)
    expect(MOTION_CSS).toContain('.clr-pulse-micro { animation: clr-micro-pulse var(--dur-idle) var(--step-2) infinite; }')
    expect(withoutComments(PRESENTATION_CSS)).not.toMatch(/clr-pulse-micro|clr-micro-pulse|steps\(/)
  })

  it('AC-R008-03 on the real /workout route the preparation hold takes the colour at 10 seconds and the one edge only while it runs at 5 and under; pause and expiry end the edge; the session clock stays neutral', async () => {
    const { user } = await openWorkout()
    expect(edges()).toHaveLength(0)

    await user.click(within(holdRegion()).getByRole('button', { name: 'Start' }))
    advance(19)
    expect(reading(holdTimer())).toBe('00:11')
    expect(warningOf(holdTimer())).toEqual(NEUTRAL)
    expect(edges()).toHaveLength(0)

    advance(1)
    expect(reading(holdTimer())).toBe('00:10')
    expect(warningOf(holdTimer())).toEqual(COLOUR)
    expect(edges()).toHaveLength(0)

    advance(4)
    expect(reading(holdTimer())).toBe('00:06')
    expect(warningOf(holdTimer())).toEqual(COLOUR)
    expect(edges()).toHaveLength(0)

    advance(1)
    expect(reading(holdTimer())).toBe('00:05')
    expect(warningOf(holdTimer())).toEqual(BREATHE)
    const edge = theEdge()
    expect(edge.parentElement).toBe(document.body)
    expect(edge).toHaveAttribute('aria-hidden', 'true')
    expect(edge).toHaveClass('clr-deadline-edge')
    expect(edge).toHaveAttribute('data-loop', 'run')
    expect(within(holdRegion()).getByRole('status')).toHaveTextContent('Final 5 seconds')
    // Elapsed only: the session clock never warns.
    expect(warningOf(sessionClock())).toEqual(NEUTRAL)
    // No stepped micro-pulse anywhere: the breathe is the only warning motion.
    expect(document.querySelectorAll('.clr-pulse-micro')).toHaveLength(0)

    // Paused in the last stretch: the colour holds, the breathe and the edge stop.
    await user.click(within(holdRegion()).getByRole('button', { name: 'Pause' }))
    advance(30)
    expect(reading(holdTimer())).toBe('00:05')
    expect(warningOf(holdTimer())).toEqual(COLOUR)
    expect(edges()).toHaveLength(0)

    // Resumed: the edge returns while it runs out.
    await user.click(within(holdRegion()).getByRole('button', { name: 'Start' }))
    advance(2)
    expect(warningOf(holdTimer())).toEqual(BREATHE)
    expect(edges()).toHaveLength(1)

    // Expired: the warning is over; the words say what happened.
    advance(4)
    expect(reading(holdTimer())).toBe('00:00')
    expect(warningOf(holdTimer())).toEqual(NEUTRAL)
    expect(edges()).toHaveLength(0)
    expect(within(holdRegion()).getByRole('status')).toHaveTextContent('Countdown done')
    expect(warningOf(sessionClock())).toEqual(NEUTRAL)
  })

  it('AC-C23-01 an EMOM minute and a count-up cap warn on their own remaining time on the real route: colour at 10, the edge at 5, none on pause or at the cap, and the cap\'s outcome never breathes', async () => {
    const { user } = await openWorkout()
    await jumpToMain(user)
    const emomTimer = () => screen.getAllByRole('timer', { name: 'Time remaining' })[0]

    // The EMOM's minute: the cue means "wrap up this minute" and resets at the boundary.
    await user.click(screen.getByRole('button', { name: 'Start EMOM' }))
    advance(49)
    expect(reading(emomTimer())).toBe('00:11')
    expect(warningOf(emomTimer())).toEqual(NEUTRAL)
    advance(1)
    expect(warningOf(emomTimer())).toEqual(COLOUR)
    advance(5)
    expect(reading(emomTimer())).toBe('00:05')
    expect(warningOf(emomTimer())).toEqual(BREATHE)
    expect(edges()).toHaveLength(1)
    advance(5)
    expect(reading(emomTimer())).toBe('01:00')
    expect(warningOf(emomTimer())).toEqual(NEUTRAL)
    expect(edges()).toHaveLength(0)
    // Held at the top of minute two, so the race below is the only deadline.
    await user.click(screen.getByRole('button', { name: 'Pause' }))

    // The For Time race counts up toward its 15:00 cap; it warns on the cap.
    await user.click(screen.getByRole('button', { name: 'Start For Time' }))
    const races = screen.getAllByRole('timer', { name: 'Block time' })
    expect(races).toHaveLength(1)
    const race = () => screen.getAllByRole('timer', { name: 'Block time' })[0]
    advance(889)
    expect(reading(race())).toBe('14:49')
    expect(warningOf(race())).toEqual(NEUTRAL)
    advance(1)
    expect(reading(race())).toBe('14:50')
    expect(warningOf(race())).toEqual(COLOUR)
    expect(screen.getByText('Cap in 00:10 — finish now')).toBeInTheDocument()
    advance(5)
    expect(reading(race())).toBe('14:55')
    expect(warningOf(race())).toEqual(BREATHE)
    expect(theEdge().parentElement).toBe(document.body)
    // The held EMOM and the elapsed-only session clock stay out of it.
    expect(warningOf(emomTimer())).toEqual(NEUTRAL)
    expect(warningOf(sessionClock())).toEqual(NEUTRAL)

    // Paused three seconds before the cap: frozen, coloured, no edge.
    advance(2)
    const pauses = screen.getAllByRole('button', { name: 'Pause' })
    await user.click(pauses[pauses.length - 1])
    advance(60)
    expect(reading(race())).toBe('14:57')
    expect(warningOf(race())).toEqual(COLOUR)
    expect(edges()).toHaveLength(0)
    const resumes = screen.getAllByRole('button', { name: 'Resume' })
    await user.click(resumes[resumes.length - 1])
    advance(1)
    expect(warningOf(race())).toEqual(BREATHE)
    expect(edges()).toHaveLength(1)

    // The cap: the warning ends; "Cap reached" keeps its own outcome colour, still.
    advance(5)
    expect(screen.getByText('Cap reached')).toBeInTheDocument()
    expect(reading(race())).toBe('15:00')
    expect(warningOf(race())).toEqual({ low: true, role: 'timer-low', urgent: false, loop: null })
    expect(edges()).toHaveLength(0)
  })

  it('AC-C24-01 exactly one decorative pointer-transparent edge, above the open log: two urgent deadlines draw one, it moves into an open native dialog and back, and nothing is recorded', async () => {
    const { double, user } = await openWorkout()

    // The hold runs; thirteen seconds in, Rest opens the log with its 20-second rest.
    await user.click(within(holdRegion()).getByRole('button', { name: 'Start' }))
    advance(13)
    await user.click(within(holdCard()).getByRole('button', { name: 'Rest' }))
    await screen.findByRole('form', { name: /^Log set 1 of plank$/i })
    advance(10)
    expect([reading(holdTimer()), reading(restTimer())]).toEqual(['00:07', '00:10'])
    expect(edges()).toHaveLength(0)

    // From here on only time passes: watch for any write.
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    advance(5)
    expect([reading(holdTimer()), reading(restTimer())]).toEqual(['00:02', '00:05'])
    // Two deadlines are urgent — the hold behind the log and the rest inside it.
    expect(warningOf(holdTimer())).toEqual(BREATHE)
    expect(warningOf(restTimer())).toEqual(BREATHE)
    // One aura, decorative and pointer-transparent, over the whole viewport and above the log.
    // TASK-043: the open log is itself a native dialog now (the standard
    // block's focused logging dialog), in the top layer, so the one aura is
    // drawn inside it — above the log — rather than on the body under it.
    const log = screen.getByRole('form', { name: /^Log set 1 of plank$/i }).closest('dialog')!
    expect(log.open).toBe(true)
    const edge = theEdge()
    expect(edge.parentElement).toBe(log)
    expect(edge).toHaveAttribute('aria-hidden', 'true')
    expect(getComputedStyle(edge).position).toBe('fixed')
    expect(getComputedStyle(edge).pointerEvents).toBe('none')
    const sheetLayer = Number(/\.clr-set-sheet-layer \{[^}]*z-index: (\d+)/.exec(SHEET_CSS)?.[1])
    expect(Number(getComputedStyle(edge).zIndex)).toBeGreaterThan(sheetLayer)
    expect(edge.querySelector('*')).toBeNull()
    expect(setItem).not.toHaveBeenCalled()

    // TASK-043: the workout behind the modal log is inert, so the log is
    // closed (its X) before the menu is used; the one aura comes back to the
    // body with the rest, now the footer's, and the hold, both still urgent.
    await user.click(within(log).getByRole('button', { name: 'Close log' }))
    await waitFor(() => expect(theEdge().parentElement).toBe(document.body))
    expect(edges()).toHaveLength(1)
    expect(warningOf(restTimer())).toEqual(BREATHE)

    // A native dialog opens over everything (the top layer): the one aura moves into it.
    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(screen.getByRole('button', { name: 'Abandon' }))
    const dialog = await waitFor(() => {
      const open = document.querySelector<HTMLDialogElement>('dialog[open]')
      expect(open).not.toBeNull()
      return open!
    })
    await waitFor(() => expect(theEdge().parentElement).toBe(dialog))
    expect(edges()).toHaveLength(1)
    await user.click(within(dialog).getByRole('button', { name: 'Keep going' }))
    await waitFor(() => expect(theEdge().parentElement).toBe(document.body))

    // The hold runs out; the rest alone now owns the one aura.
    advance(2)
    expect(reading(holdTimer())).toBe('00:00')
    expect(warningOf(holdTimer())).toEqual(NEUTRAL)
    expect(warningOf(restTimer())).toEqual(BREATHE)
    expect(edges()).toHaveLength(1)

    // The rest runs out: no aura is left behind, and nothing was recorded.
    advance(4)
    expect(screen.queryAllByRole('region', { name: 'Rest' })).toHaveLength(0)
    expect(edges()).toHaveLength(0)
    expect(document.querySelectorAll('[data-urgent]')).toHaveLength(0)
    expect(double.loggedSets()).toEqual([])
    expect(double.recorded()).toEqual([])
    expect(double.completed()).toEqual([])
  })

  it('AC-C61-01 the timer and the aura share one phase: each breathe is pinned to the document timeline\'s epoch when it starts, again when the aura moves into or out of a dialog or the deadline resumes, and never restarted by a numeric tick', async () => {
    observeBreathes()
    const { user } = await openWorkout()
    await user.click(within(holdRegion()).getByRole('button', { name: 'Start' }))
    advance(25)

    const body = holdTimer()
    const edge = theEdge()
    expect(breathes.get(body)?.startTime).toBe(0)
    expect(breathes.get(edge)?.startTime).toBe(0)

    // Numeric ticks: the digits change, the same breathing elements carry on.
    advance(1)
    advance(1)
    expect(reading(holdTimer())).toBe('00:03')
    expect(holdTimer()).toBe(body)
    expect(theEdge()).toBe(edge)
    expect(breathes.get(body)?.startTime).toBe(0)
    expect(breathes.get(edge)?.startTime).toBe(0)

    // The aura moves into a native dialog: a new element, pinned to the same epoch.
    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(screen.getByRole('button', { name: 'Abandon' }))
    const dialog = await waitFor(() => document.querySelector<HTMLDialogElement>('dialog[open]')!)
    await waitFor(() => expect(theEdge().parentElement).toBe(dialog))
    expect(breathes.get(theEdge())?.startTime).toBe(0)
    expect(breathes.get(body)?.startTime).toBe(0)
    await user.click(within(dialog).getByRole('button', { name: 'Keep going' }))
    await waitFor(() => expect(theEdge().parentElement).toBe(document.body))
    expect(breathes.get(theEdge())?.startTime).toBe(0)

    // Paused and resumed: the breathe that starts again is pinned to the epoch too.
    await user.click(within(holdRegion()).getByRole('button', { name: 'Pause' }))
    expect(edges()).toHaveLength(0)
    // No longer urgent, the running rule stops matching: the browser drops that breathe.
    expect(body.matches('[data-urgent][data-loop="run"]')).toBe(false)
    breathes.delete(body)
    await user.click(within(holdRegion()).getByRole('button', { name: 'Start' }))
    expect(breathes.get(holdTimer())?.startTime).toBe(0)
    expect(breathes.get(theEdge())?.startTime).toBe(0)
  })

  it('AC-R008-04 reduced motion and the still policy: the urgent timer and the one aura hold a steady .5 with no animation, stay drawn, and keep every word, digit and colour', async () => {
    reduceMotion(true)
    const { user } = await openWorkout()
    await user.click(within(holdRegion()).getByRole('button', { name: 'Start' }))
    advance(27)

    expect(reading(holdTimer())).toBe('00:03')
    expect(warningOf(holdTimer())).toEqual({ ...BREATHE, loop: 'still' })
    const edge = theEdge()
    expect(edge).toHaveAttribute('data-loop', 'still')
    // Neither matches the running rule; both take the still .5.
    expect(holdTimer().matches(".clr-accepted-timer__body[data-urgent][data-loop='run']")).toBe(false)
    expect(edge.matches(".clr-deadline-edge[data-loop='run']")).toBe(false)
    // jsdom does not resolve custom properties: the still token is the owner-selected .5.
    expect(getComputedStyle(edge).opacity).toBe('var(--countdown-warning-opacity-still)')
    expect(getComputedStyle(holdTimer()).opacity).toBe('var(--countdown-warning-opacity-still)')
    expect(/--countdown-warning-opacity-still: ([^;]+);/.exec(TOKENS_CSS)?.[1]).toBe('.5')
    expect(within(holdRegion()).getByRole('status')).toHaveTextContent('Final 5 seconds')
    expect(holdTimer()).toHaveTextContent('3 seconds left')
    expect(document.querySelectorAll('[data-loop="run"]')).toHaveLength(0)
  })

  it('AC-R008-02 the urgency gallery state draws the warning through the shared owner: held at 10 and 5, run into its last five, as a count-up cap, under an open native log with one aura in phase, and still', async () => {
    const user = userEvent.setup()
    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/gallery/refinements?state=urgency']}>
          <GalleryRefinements />
        </MemoryRouter>
      </AppProviders>,
    )
    const state = document.querySelector<HTMLElement>('[data-refinement-state="urgency"]')!
    expect(within(state).getByRole('heading', { name: /^Countdown warning and whole timer frames/ })).toBeInTheDocument()
    const demo = state.querySelector<HTMLElement>('[data-gallery-deadline-warning]')!
    const cue = () => within(demo).getAllByRole('timer')[0]
    expect(reading(cue())).toBe('00:12')
    expect(warningOf(cue())).toEqual(NEUTRAL)

    // Held: the colour, never the aura.
    await user.click(within(demo).getByRole('button', { name: 'Inspect 10 seconds' }))
    expect(warningOf(cue())).toEqual(COLOUR)
    await user.click(within(demo).getByRole('button', { name: 'Inspect 5 seconds' }))
    expect(warningOf(cue())).toEqual(COLOUR)
    expect(edges()).toHaveLength(0)

    // Running at five: the breathe and the one aura.
    await user.click(within(demo).getByRole('button', { name: 'Run countdown' }))
    expect(warningOf(cue())).toEqual(BREATHE)
    expect(theEdge().parentElement).toBe(document.body)

    // The count-up race toward its cap reads the same deadline: cap minus elapsed.
    await user.click(within(demo).getByRole('button', { name: 'Show count-up cap' }))
    expect(cue()).toHaveAccessibleName('Block time')
    expect(reading(cue())).toBe('00:55')
    expect(warningOf(cue())).toEqual(BREATHE)

    // An open native log over the warning: two timers, one aura in its top layer.
    await user.click(within(demo).getByRole('button', { name: 'Open log over the warning' }))
    const dialog = await waitFor(() => document.querySelector<HTMLDialogElement>('dialog[open]')!)
    await waitFor(() => expect(theEdge().parentElement).toBe(dialog))
    const inLog = within(dialog).getByRole('timer', { name: 'Block time' })
    expect(warningOf(inLog)).toEqual(BREATHE)
    expect(warningOf(cue())).toEqual(BREATHE)
    // Still preview: both timers and the aura hold the steady .5.
    await user.click(within(demo).getByRole('checkbox', { name: 'Still preview (reduced motion)' }))
    expect(theEdge()).toHaveAttribute('data-loop', 'still')
    expect(warningOf(within(dialog).getByRole('timer', { name: 'Block time' })).loop).toBe('still')
    await user.click(within(dialog).getByRole('button', { name: 'Close log' }))
    await waitFor(() => expect(document.querySelector('dialog[open]')).toBeNull())
    await waitFor(() => expect(theEdge().parentElement).toBe(document.body))

    // Pause ends the aura; the elapsed-only session clock never had one.
    await user.click(within(demo).getByRole('button', { name: 'Pause' }))
    expect(edges()).toHaveLength(0)
    expect(warningOf(cue())).toEqual(COLOUR)
    const session = within(state).getAllByRole('timer', { name: 'Session time' })
    expect(session.map(warningOf)).toEqual(session.map(() => NEUTRAL))
  })
})
