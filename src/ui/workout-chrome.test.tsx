/**
 * EXE-01 acceptance — the shell's four chrome parts, and the operational-screen
 * rules the export's pattern 6 states for them: the timer is labelled and not
 * live, status is never colour alone, and the destructive action is nowhere
 * near the one pressed between every section.
 *
 * And the 0.14.3 composition of the same parts: a timer is its own card and is
 * never put inside another, a label is inside the card it names, the structure
 * badge is an element frame, and the low rest is the shipped low state — the
 * stepped `--dur-alert` crossing and the 80% pulse, as the view's one loop.
 * jsdom applies no stylesheet, so motion is proved as classes, attributes and
 * the rule text the classes resolve to.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { ReactNode } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { routes } from '../app/router'
import { GalleryRefinements } from '../dev/gallery-refinements'
import { AppProviders, renderWithProviders, signedIn } from '../test/render'
import { createWorkoutDouble, snapshotFixture, type WorkoutDouble } from '../test/workout-double'
import { useRestTimer } from '../state/rest'
import { RestTimerProvider } from '../state/rest-provider'
import { sessionProgress, type SessionProgress } from '../state/workout-progress'
import {
  GlobalTimer,
  ProgressTracker,
  RestTimerBar,
  SectionHeader,
  StructureBadge,
  WorkoutNavigation,
} from './workout-chrome'
import { Card } from './card'
import { HeadingLevelProvider } from './Heading'
import { LoadingView } from './view-state'

const MOTION_CSS = readFileSync(
  resolve(import.meta.dirname, '../design-system/css/motion.css'),
  'utf-8',
)
const REST_BAR_CSS = readFileSync(resolve(import.meta.dirname, 'rest-timer-bar.css'), 'utf-8')
const PRESENTATION_CSS = readFileSync(resolve(import.meta.dirname, 'refinements/presentation.css'), 'utf-8')

afterEach(() => vi.restoreAllMocks())

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

/** Every card frame in the document, and the ones that sit inside another. */
function cards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.clr-card'))
}

function nestedCards(): HTMLElement[] {
  return cards().filter((card) => card.parentElement?.closest('.clr-card') != null)
}

/** Three sections: one finished, one under way, one untouched. */
function mixedProgress(): SessionProgress {
  return sessionProgress(
    snapshotFixture({
      sections: [
        { title: 'Warm-up', blocks: [{ exercises: ['completed'] }] },
        {
          title: 'Primary lift',
          sectionType: 'primary_lift',
          blocks: [{ structureType: 'emom', timerSeconds: 600, exercises: ['completed', 'not_started'] }],
        },
        {
          title: 'Finisher',
          sectionType: 'conditioning',
          blocks: [{ structureType: 'amrap', timerSeconds: 480 }],
        },
      ],
    }),
  )
}

describe('GlobalTimer', () => {
  it('is a labelled timer, spoken in words rather than punctuation', () => {
    renderWithProviders(<GlobalTimer seconds={750} />)

    const timer = screen.getByRole('timer', { name: 'Session time' })
    expect(timer).toHaveTextContent('12:30')
    expect(timer).toHaveTextContent('12 minutes 30 seconds')
  })

  it('is not a live region — a second-by-second announcement ruins the screen', () => {
    renderWithProviders(<GlobalTimer seconds={12} />)

    const timer = screen.getByRole('timer')
    expect(timer).not.toHaveAttribute('aria-live')
    expect(timer).not.toHaveAttribute('role', 'status')
  })

  // TASK-007 (C19, C20; R53, R96, R102, R119) supersedes the hand-assembled
  // timer card here: the header readout is the shared whole timer body — one
  // chamfered frame on the timer role, no accent-bar strip, no card — in its
  // compact header placement at the menu's height.
  it('is one whole timer frame in the header placement — no accent bar, no card, the timer role', () => {
    renderWithProviders(<GlobalTimer seconds={750} />)

    const timer = screen.getByRole('timer', { name: 'Session time' })
    expect(timer).toHaveClass('clr-chamfer', 'clr-accepted-timer__body', 'clr-chamfer--timer')
    expect(timer).not.toHaveClass('clr-card__body')
    expect(cards()).toHaveLength(0)
    expect(document.querySelectorAll('.clr-card__bar')).toHaveLength(0)
    expect(timer.querySelectorAll('.clr-chamfer')).toHaveLength(0)

    const bleed = timer.parentElement as HTMLElement
    expect(bleed).toHaveClass('clr-bleed', 'clr-accepted-timer', 'clr-accepted-timer--header')
    expect(bleed).toHaveAttribute('data-timer-frame', 'header')
    expect(bleed).toHaveAttribute('data-clock', 'session')
    expect(bleed).not.toHaveAttribute('data-low')
  })

  it('is an element frame inside a card, never a second card', () => {
    renderWithProviders(
      <Card heading="Workout in progress">
        <GlobalTimer seconds={750} />
      </Card>,
    )

    const timer = screen.getByRole('timer', { name: 'Session time' })
    expect(cards()).toHaveLength(1)
    expect(nestedCards()).toEqual([])
    expect(document.querySelectorAll('.clr-card__bar')).toHaveLength(1)
    expect(timer).toHaveClass('clr-chamfer--timer')
    expect(timer).not.toHaveClass('clr-card__body')
    expect(timer.parentElement).toHaveClass('clr-bleed')
    expect(timer).toHaveTextContent('12 minutes 30 seconds')
  })

  it('counts up, so it has no low state at any reading', () => {
    renderWithProviders(<GlobalTimer seconds={0} />)

    const timer = screen.getByRole('timer', { name: 'Session time' })
    expect(timer).not.toHaveClass('clr-chamfer--timer-low')
    expect(document.querySelector('.clr-pulse-micro')).toBeNull()
    expect(document.querySelector('.clr-glow')).toBeNull()
  })
})

describe('ProgressTracker', () => {
  it('measures real progress: sections resolved out of sections prescribed', () => {
    renderWithProviders(<ProgressTracker progress={mixedProgress()} currentIndex={1} />)

    const bar = screen.getByRole('progressbar', { name: 'Section 2 of 3' })
    expect(bar).toHaveAttribute('aria-valuenow', '1')
    expect(bar).toHaveAttribute('aria-valuemax', '3')
  })

  it('says each section’s status in words, never in colour alone', () => {
    renderWithProviders(<ProgressTracker progress={mixedProgress()} currentIndex={1} />)

    const sections = within(screen.getByRole('list', { name: 'Sections' }))
    expect(sections.getByRole('button', { name: 'Warm-up, complete' })).toBeInTheDocument()
    expect(sections.getByRole('button', { name: 'Primary lift, in progress' })).toBeInTheDocument()
    expect(sections.getByRole('button', { name: 'Conditioning, not started' })).toBeInTheDocument()
  })

  it('marks where the user is with aria-current, not with a tint', () => {
    renderWithProviders(<ProgressTracker progress={mixedProgress()} currentIndex={1} />)

    expect(screen.getByRole('button', { name: 'Primary lift, in progress' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(screen.getByRole('button', { name: 'Warm-up, complete' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('jumps to a section when the shell offers it, and is inert when it does not', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const { rerender } = renderWithProviders(
      <ProgressTracker progress={mixedProgress()} currentIndex={0} onSelect={onSelect} />,
    )

    await user.click(screen.getByRole('button', { name: 'Conditioning, not started' }))
    expect(onSelect).toHaveBeenCalledWith(2)

    rerender(<ProgressTracker progress={mixedProgress()} currentIndex={0} />)
    expect(screen.getByRole('button', { name: 'Conditioning, not started' })).toBeDisabled()
  })

  it('is one card with its heading, bar and section list inside', () => {
    renderWithProviders(<ProgressTracker progress={mixedProgress()} currentIndex={1} />)

    expect(cards()).toHaveLength(1)
    const body = within(cards()[0].querySelector('.clr-card__body') as HTMLElement)
    expect(body.getByRole('heading', { name: 'Sections' })).toBeInTheDocument()
    expect(body.getByRole('progressbar', { name: 'Section 2 of 3' })).toBeInTheDocument()
    expect(body.getByRole('list', { name: 'Sections' })).toBeInTheDocument()
  })
})

describe('SectionHeader', () => {
  it('uses the current structural heading level rather than skipping past it', () => {
    const progress = mixedProgress()
    renderWithProviders(
      <HeadingLevelProvider level={2}>
        <SectionHeader section={progress.sections[0]} position={1} total={3} />
      </HeadingLevelProvider>,
    )

    expect(
      screen.getByRole('heading', { level: 2, name: progress.sections[0].title }),
    ).toBeInTheDocument()
  })

  it('says where the section sits, what it is called, and what state it is in', () => {
    const progress = mixedProgress()
    renderWithProviders(
      <SectionHeader section={progress.sections[1]} position={2} total={3} />,
    )

    expect(screen.getByRole('heading', { name: 'Primary lift' })).toBeInTheDocument()
    expect(screen.getByText('Section 2 / 3 · In progress')).toBeInTheDocument()
  })

  it('states the structure identity of every block, per the master clarity spec', () => {
    // An EMOM and an AMRAP over the same movements are different workouts, and
    // this is the line that says which one the user is about to do.
    const progress = sessionProgress(
      snapshotFixture({
        sections: [
          {
            title: 'Conditioning',
            blocks: [
              { structureType: 'emom', timerSeconds: 600 },
              { structureType: 'for_time', timerSeconds: 900 },
              { structureType: 'circuit', rounds: 3, repScheme: 'ladder_down' },
            ],
          },
        ],
      }),
    )

    renderWithProviders(<SectionHeader section={progress.sections[0]} position={1} total={1} />)

    // TASK-003 (AC-C08-01): each block named by its format alone, as its own
    // card's badge names it; the card states the window, cap and rounds.
    const structures = within(screen.getByRole('list', { name: 'Structures in this section' }))
    expect(structures.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'EMOM',
      'FOR TIME',
      'CIRCUIT',
    ])
    expect(structures.queryByText(/MIN|CAP|ROUNDS/)).toBeNull()
  })

  it('is one card: the title, its position and its badges are all inside it', () => {
    const progress = mixedProgress()
    renderWithProviders(
      <SectionHeader section={progress.sections[1]} position={2} total={3}>
        <p>Section body</p>
      </SectionHeader>,
    )

    expect(cards()).toHaveLength(1)
    const body = within(cards()[0].querySelector('.clr-card__body') as HTMLElement)
    expect(body.getByRole('heading', { name: 'Primary lift' })).toBeInTheDocument()
    expect(body.getByText('Section 2 / 3 · In progress')).toBeInTheDocument()
    expect(body.getByRole('list', { name: 'Structures in this section' })).toBeInTheDocument()
    expect(body.getByText('Section body')).toBeInTheDocument()
  })

  it('carries the session’s bar and a collapsible jump list in that one card (U34, U35)', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const progress = mixedProgress()
    renderWithProviders(
      <SectionHeader
        section={progress.sections[1]}
        position={2}
        total={3}
        progress={progress}
        onSelect={onSelect}
      />,
    )

    expect(cards()).toHaveLength(1)
    const body = within(cards()[0].querySelector('.clr-card__body') as HTMLElement)
    expect(body.getByRole('progressbar', { name: 'Section 2 of 3' })).toBeInTheDocument()
    const toggle = body.getByRole('button', { name: 'All sections' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(body.getByRole('list', { name: 'Sections' })).toHaveAttribute('inert')

    await user.click(toggle)
    expect(body.getByRole('list', { name: 'Sections' })).not.toHaveAttribute('inert')
    await user.click(body.getByRole('button', { name: 'Conditioning, not started' }))

    expect(onSelect).toHaveBeenCalledWith(2)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('StructureBadge', () => {
  function standardIdentity() {
    return sessionProgress(snapshotFixture({ sections: [{ blocks: [{}] }] })).sections[0]
      .blocks[0].identity
  }

  it('is the label alone when the block carries no number', () => {
    renderWithProviders(<StructureBadge identity={standardIdentity()} />)

    expect(screen.getByText('STANDARD')).toBeInTheDocument()
  })

  it('is an element frame on the structure role, emitting through its own wrapper', () => {
    renderWithProviders(<StructureBadge identity={standardIdentity()} />)

    const frame = screen.getByText('STANDARD')
    expect(frame).toHaveClass('clr-chamfer', 'clr-chamfer--sm', 'clr-chamfer--structure')
    // The glyph the export ships for the structure, beside the word.
    expect(frame.querySelector('svg')).not.toBeNull()

    const bleed = frame.parentElement as HTMLElement
    expect(bleed).toHaveClass('clr-bleed')
    expect(bleed).not.toHaveClass('clr-glow')
    expect(bleed.style.getPropertyValue('--bleed')).toBe('var(--border-frame-structure)')
  })

  it('is not a card, so it sits inside one without nesting', () => {
    renderWithProviders(
      <Card heading="Block">
        <StructureBadge identity={standardIdentity()} />
      </Card>,
    )

    expect(cards()).toHaveLength(1)
    expect(document.querySelectorAll('.clr-card__bar')).toHaveLength(1)
    expect(screen.getByText('STANDARD')).not.toHaveClass('clr-card__body')
  })
})

describe('WorkoutNavigation', () => {
  const handlers = () => ({
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    onFinish: vi.fn(),
  })

  it('is a named landmark, because the shell has more than one nav’s worth of controls', () => {
    renderWithProviders(<WorkoutNavigation canGoBack canGoForward {...handlers()} />)

    expect(screen.getByRole('navigation', { name: 'Workout sections' })).toBeInTheDocument()
  })

  it('refuses to go back from the first section', () => {
    renderWithProviders(
      <WorkoutNavigation canGoBack={false} canGoForward {...handlers()} />,
    )

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
  })

  it('turns the forward action into completion on the last section', async () => {
    const user = userEvent.setup()
    const spies = handlers()
    renderWithProviders(<WorkoutNavigation canGoBack canGoForward={false} {...spies} />)

    expect(screen.queryByRole('button', { name: 'Next section' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))

    expect(spies.onFinish).toHaveBeenCalledOnce()
  })

  it('offers no destructive action beside the one pressed between every section', () => {
    renderWithProviders(<WorkoutNavigation canGoBack canGoForward {...handlers()} />)

    const nav = within(screen.getByRole('navigation', { name: 'Workout sections' }))
    expect(nav.queryByRole('button', { name: /abandon/i })).not.toBeInTheDocument()
  })

  it('stops taking presses while a lifecycle call is in flight', () => {
    renderWithProviders(<WorkoutNavigation canGoBack canGoForward busy {...handlers()} />)

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next section' })).toBeDisabled()
  })

  it('claims the loop only while finishing, and stays busy when it is stilled', () => {
    reduceMotion(false)
    const { rerender } = renderWithProviders(
      <WorkoutNavigation canGoBack canGoForward={false} {...handlers()} />,
    )
    const nav = screen.getByRole('navigation', { name: 'Workout sections' })
    expect(nav).toHaveAttribute('data-loop', 'still')

    rerender(<WorkoutNavigation canGoBack canGoForward={false} busy {...handlers()} />)
    expect(nav).toHaveAttribute('data-loop', 'run')
    expect(screen.getByRole('button', { name: 'Finish workout' })).toHaveAttribute(
      'aria-busy',
      'true',
    )

    // Moving between sections disables the buttons but scans nothing.
    rerender(<WorkoutNavigation canGoBack canGoForward busy {...handlers()} />)
    expect(nav).toHaveAttribute('data-loop', 'still')
  })
})

describe('RestTimerBar', () => {
  /** A clock the test moves, so "the phone was in a pocket" is one assignment. */
  function testClock(start = 1_000_000) {
    let current = start
    return {
      now: () => current,
      advance(seconds: number) {
        current += seconds * 1000
      },
    }
  }

  function Raise({ seconds }: { seconds: number }) {
    const rest = useRestTimer()
    return (
      <button
        type="button"
        onClick={() => rest.start({ exerciseId: 'ex-1', label: 'Back Squat', seconds })}
      >
        Raise rest
      </button>
    )
  }

  /** The bar under the shell's provider, and one control that raises a rest. */
  function mountRest(clock = testClock(), seconds = 90, beside: ReactNode = null) {
    renderWithProviders(
      <RestTimerProvider now={clock.now}>
        <Raise seconds={seconds} />
        {beside}
        <RestTimerBar />
      </RestTimerProvider>,
    )
    return clock
  }

  /** A rest raised and run down to `left` seconds, read on return. */
  async function restWith(left: number, beside: ReactNode = null) {
    const user = userEvent.setup()
    const clock = mountRest(testClock(), 90, beside)
    await user.click(screen.getByRole('button', { name: 'Raise rest' }))
    clock.advance(90 - left)
    returnToForeground()
    return { user, clock }
  }

  function restCardBody(): HTMLElement {
    return (restBar() as HTMLElement).querySelector('.clr-card__body') as HTMLElement
  }

  /** The decorative digits: the timer's first child. */
  function restDigits(): HTMLElement {
    return screen.getByRole('timer', { name: 'Time remaining' }).firstElementChild as HTMLElement
  }

  function restBar(): HTMLElement | null {
    return screen.queryByRole('region', { name: 'Rest' })
  }

  /** What the platform fires when a backgrounded tab comes back. */
  function returnToForeground() {
    act(() => {
      window.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    })
  }

  it('draws nothing until a rest is running — no bar at zero', () => {
    mountRest()

    expect(restBar()).not.toBeInTheDocument()
    expect(screen.queryByRole('timer', { name: 'Time remaining' })).not.toBeInTheDocument()
  })

  it('starts nothing for a rest of zero seconds', async () => {
    const user = userEvent.setup()
    mountRest(testClock(), 0)

    await user.click(screen.getByRole('button', { name: 'Raise rest' }))

    expect(restBar()).not.toBeInTheDocument()
    expect(screen.queryByText(/Rest: 0/)).not.toBeInTheDocument()
  })

  it('shows the remaining time, in digits and in words, with skip and add-time', async () => {
    const user = userEvent.setup()
    mountRest()

    await user.click(screen.getByRole('button', { name: 'Raise rest' }))

    const bar = within(restBar() as HTMLElement)
    expect(bar.getByText('Rest after Back Squat')).toBeInTheDocument()
    expect(bar.getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('01:30')
    expect(bar.getByText('1 minute 30 seconds left')).toBeInTheDocument()
    expect(bar.getByRole('button', { name: 'Add 30s' })).toBeEnabled()
    expect(bar.getByRole('button', { name: 'Skip rest' })).toBeEnabled()
  })

  it('adds time to the end of the rest, not to its start', async () => {
    const user = userEvent.setup()
    const clock = mountRest()

    await user.click(screen.getByRole('button', { name: 'Raise rest' }))
    clock.advance(60)
    await user.click(screen.getByRole('button', { name: 'Add 30s' }))

    expect(screen.getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('01:00')
  })

  it('leaves the screen when the rest is skipped', async () => {
    const user = userEvent.setup()
    mountRest()

    await user.click(screen.getByRole('button', { name: 'Raise rest' }))
    await user.click(screen.getByRole('button', { name: 'Skip rest' }))

    expect(restBar()).not.toBeInTheDocument()
  })

  it('reads the wall clock on return from the background, and leaves when it elapses', async () => {
    const user = userEvent.setup()
    const clock = mountRest()

    await user.click(screen.getByRole('button', { name: 'Raise rest' }))

    // Forty-five seconds in a pocket: the reading is what the clock implies,
    // not a count that paused while the tab was throttled.
    clock.advance(45)
    returnToForeground()
    expect(screen.getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('00:45')

    clock.advance(45)
    returnToForeground()
    expect(restBar()).not.toBeInTheDocument()
  })

  it('carries urgency in the last ten seconds beside the digits, never instead of them', async () => {
    const user = userEvent.setup()
    const clock = mountRest()

    await user.click(screen.getByRole('button', { name: 'Raise rest' }))
    expect(restBar()).toHaveAttribute('data-urgent', 'false')

    clock.advance(82)
    returnToForeground()
    expect(restBar()).toHaveAttribute('data-urgent', 'true')
    expect(screen.getByText('8 seconds left')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Final 10 seconds')
  })

  it('enters with no list or route motion — it appears in the tap that logs a set', async () => {
    const user = userEvent.setup()
    mountRest()

    await user.click(screen.getByRole('button', { name: 'Raise rest' }))

    const bar = restBar() as HTMLElement
    const animated = [bar, ...Array.from(bar.querySelectorAll('*'))].filter((node) =>
      /route-enter|clr-boot|clr-reveal|clr-scan/.test(node.getAttribute('class') ?? ''),
    )
    expect(animated).toEqual([])
  })

  it('is one timer card, with the label, the digits, the fill and the controls inside', async () => {
    await restWith(60)

    expect(cards()).toHaveLength(1)
    expect(nestedCards()).toEqual([])
    expect((restBar() as HTMLElement).querySelectorAll('.clr-card__bar')).toHaveLength(1)

    const body = restCardBody()
    expect(body).toHaveClass('clr-chamfer--timer')
    expect(body).not.toHaveClass('clr-chamfer--timer-low')
    const inside = within(body)
    expect(inside.getByText('Rest after Back Squat')).toBeInTheDocument()
    expect(inside.getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('01:00')
    expect(body.querySelector('.clr-rest-bar__fill')).not.toBeNull()
    expect(inside.getByRole('button', { name: 'Add 30s' })).toBeInTheDocument()
    expect(inside.getByRole('button', { name: 'Skip rest' })).toBeInTheDocument()

    // Not low: nothing pulses and nothing claims the loop.
    expect(restBar()).not.toHaveClass('clr-pulse-micro')
    expect(restBar()).not.toHaveAttribute('data-loop')
    expect(screen.getByRole('timer', { name: 'Time remaining' })).not.toHaveAttribute('data-loop')
  })

  // TASK-008 (C22, C23, C61; R133, R135) supersedes "pulsing to 80%": the
  // colour still comes at ten seconds, but the card no longer takes the
  // shipped four-second stepped micro-pulse. In the final five the rest's
  // whole timer frame breathes with the one soft screen-edge aura.
  it('goes low at ten seconds as the shipped low state: stepped over --dur-alert, no stepped pulse and no glow', async () => {
    reduceMotion(false)
    await restWith(8)

    // One role change moves bar, body and emission together.
    expect(restCardBody()).toHaveClass('clr-chamfer--timer-low')
    expect(restCardBody()).not.toHaveClass('clr-chamfer--timer')
    expect(cards()).toHaveLength(1)

    // The digits cross over on the frame's schedule, and each one tumbles.
    expect(restDigits().style.color).toBe('var(--text-timer-low)')
    expect(restDigits().style.transition).toBe('color var(--dur-alert) var(--step-4)')
    expect(restDigits().querySelectorAll('.clr-tumble')).toHaveLength(4)

    // Eight seconds left is the colour alone: nothing pulses yet, no edge.
    expect(document.querySelector('.clr-pulse-micro')).toBeNull()
    expect(restBar()).not.toHaveAttribute('data-loop')
    expect(document.querySelector('[data-countdown-edge]')).toBeNull()

    // No glow of the timer's own: the extra glow is the primary action's.
    expect(document.querySelector('.clr-glow')).toBeNull()

    // What those classes resolve to in the shipped package.
    expect(MOTION_CSS).toMatch(/--dur-slow:\s*400ms/)
    expect(MOTION_CSS).toMatch(/--dur-alert:\s*var\(--dur-slow\)/)
    expect(MOTION_CSS).toMatch(/--step-4:\s*steps\(4, end\)/)
  })

  it('breathes with the one soft screen edge in its final five seconds: the timer frame on the running loop, not the card', async () => {
    reduceMotion(false)
    const { clock } = await restWith(8)
    clock.advance(3)
    returnToForeground()

    const timer = screen.getByRole('timer', { name: 'Time remaining' })
    expect(timer).toHaveTextContent('00:05')
    expect(timer).toHaveAttribute('data-urgent', 'true')
    expect(timer).toHaveAttribute('data-loop', 'run')
    expect(restBar()).not.toHaveClass('clr-pulse-micro')
    expect(restBar()).not.toHaveAttribute('data-loop')
    const edges = document.querySelectorAll('[data-countdown-edge]')
    expect(edges).toHaveLength(1)
    expect(edges[0]).toHaveAttribute('data-loop', 'run')
    expect(edges[0]).toHaveAttribute('aria-hidden', 'true')
    expect(document.querySelector('.clr-pulse-micro')).toBeNull()
  })

  it('steps the fill to the low colour on the same schedule, with no glow in its styles', () => {
    expect(REST_BAR_CSS).toMatch(
      /\.clr-rest-bar__fill \{[^}]*background-color var\(--dur-alert\) var\(--step-4\)/,
    )
    expect(REST_BAR_CSS).toMatch(
      /\.clr-rest-bar\[data-urgent='true'\] \.clr-rest-bar__fill \{\s*background: var\(--text-timer-low\);/,
    )
    expect(REST_BAR_CSS).not.toMatch(/box-shadow|drop-shadow|filter:|animation/)
    expect(REST_BAR_CSS).toMatch(
      /prefers-reduced-motion: reduce\) \{\s*\.clr-rest-bar__fill \{\s*transition: none;/,
    )
  })

  it('stays a labelled timer that is not live, with one milestone that is', async () => {
    await restWith(8)

    const timer = screen.getByRole('timer', { name: 'Time remaining' })
    expect(timer).not.toHaveAttribute('aria-live')
    expect(restDigits()).toHaveAttribute('aria-hidden', 'true')
    expect(timer).toHaveTextContent('8 seconds left')
    expect(restBar()).not.toHaveAttribute('aria-live')

    const live = (restBar() as HTMLElement).querySelectorAll('[aria-live], [role="status"]')
    expect(live).toHaveLength(1)
    expect(live[0]).toHaveTextContent('Final 10 seconds')
  })

  it('keeps its controls true in the low state: added time leaves it, skip ends it', async () => {
    reduceMotion(false)
    const { user } = await restWith(8)

    await user.click(screen.getByRole('button', { name: 'Add 30s' }))
    expect(screen.getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('00:38')
    expect(restBar()).toHaveAttribute('data-urgent', 'false')
    expect(restBar()).not.toHaveClass('clr-pulse-micro')
    expect(screen.getByRole('timer', { name: 'Time remaining' })).not.toHaveAttribute('data-loop')
    expect(restCardBody()).toHaveClass('clr-chamfer--timer')
    expect(screen.queryByText('Final 10 seconds')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Skip rest' }))
    expect(restBar()).not.toBeInTheDocument()
  })

  it('takes the one loop from a loading region beside it, and gives it back', async () => {
    reduceMotion(false)
    const loading = (
      <Card heading="Coaching">
        <LoadingView label="Reading coaching for back squat" />
      </Card>
    )
    const { user, clock } = await restWith(60, loading)
    const wait = screen.getByText('Reading coaching for back squat').closest(
      '[data-loop]',
    ) as HTMLElement

    // A rest with time left has no loop, so the wait keeps its own.
    const timer = () => screen.getByRole('timer', { name: 'Time remaining' })
    expect(wait).toHaveAttribute('data-loop', 'run')
    expect(timer()).not.toHaveAttribute('data-loop')

    // TASK-008 (C23): the colour at ten seconds is no loop of its own.
    clock.advance(52)
    returnToForeground()
    expect(wait).toHaveAttribute('data-loop', 'run')

    // The final five (TASK-008, C61): the warning carries more state, so it runs
    // — the timer and its one aura, together — and the wait is stilled: still on
    // screen, still busy, still saying what it is waiting for.
    clock.advance(3)
    returnToForeground()
    expect(timer()).toHaveAttribute('data-loop', 'run')
    expect(wait).toHaveAttribute('data-loop', 'still')
    expect(wait).toHaveAttribute('aria-busy', 'true')
    expect(wait).toHaveTextContent('Reading coaching for back squat')
    expect([...document.querySelectorAll('[data-loop="run"]')].every((node) =>
      node === timer() || node.matches('[data-countdown-edge]'))).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Skip rest' }))
    expect(wait).toHaveAttribute('data-loop', 'run')
    expect(document.querySelectorAll('[data-loop="run"]')).toHaveLength(1)
    expect(document.querySelector('[data-countdown-edge]')).toBeNull()
  })

  it('is still under reduced motion and loses nothing it was saying', async () => {
    reduceMotion(true)
    await restWith(5)

    // TASK-008 (C22): the urgent timer and its aura are still, at a steady .5.
    expect(screen.getByRole('timer', { name: 'Time remaining' })).toHaveAttribute('data-loop', 'still')
    expect(document.querySelector('[data-countdown-edge]')).toHaveAttribute('data-loop', 'still')
    expect(document.querySelector('[data-loop="run"]')).toBeNull()

    // The reading, the word, the colour role and the controls are all there.
    expect(restBar()).toHaveAttribute('data-urgent', 'true')
    expect(restCardBody()).toHaveClass('clr-chamfer--timer-low')
    expect(restDigits().style.color).toBe('var(--text-timer-low)')
    expect(screen.getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('00:05')
    expect(screen.getByText('5 seconds left')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Final 10 seconds')
    expect(screen.getByText('Rest after Back Squat')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add 30s' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Skip rest' })).toBeEnabled()

    // The shared rule that makes the stilled warning static (presentation.css).
    expect(PRESENTATION_CSS).toMatch(
      /prefers-reduced-motion: reduce\) \{\s*\.clr-accepted-timer__body\[data-urgent\],\s*\.clr-deadline-edge \{\s*animation: none !important;/,
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TASK-027 — the compact live navigator (C54; R35, R98; JOURNEY-027)
// ─────────────────────────────────────────────────────────────────────────────

/** The navigator's own frame: no card, just the disclosure and its hidden reading. */
function navigatorFrame(): HTMLElement {
  const frame = document.querySelector<HTMLElement>('[data-section-navigation]')
  if (frame === null) throw new Error('No compact navigator')
  return frame
}

/** What a sighted athlete reads in the navigator: everything not visually hidden or aria-hidden decoration. */
function visibleText(frame: HTMLElement): string {
  const clone = frame.cloneNode(true) as HTMLElement
  // The visually hidden reading, and a jump list collapsed out of sight.
  clone.querySelectorAll('.a11y-hidden, .clr-collapsible__region[data-expanded="false"]').forEach((node) => node.remove())
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** The opened section's first card: the first card frame after the navigator. */
function firstCardAfterNavigator(): HTMLElement {
  const frame = navigatorFrame()
  const card = [...document.querySelectorAll<HTMLElement>('.clr-card__body')].find(
    (candidate) => frame.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING,
  )
  if (card === undefined) throw new Error('No card follows the navigator')
  return card
}

/**
 * A real multi-section session: a finished Warm-up, a Primary lift under way
 * — its first movement with one of three sets already logged, its second done
 * — and an untouched Conditioning AMRAP.
 */
function multiSectionSession() {
  return snapshotFixture({
    sections: [
      { title: 'Warm-up', blocks: [{ exercises: ['completed'] }] },
      {
        title: 'Primary lift',
        sectionType: 'primary_lift',
        blocks: [{
          structureType: 'standard',
          exercises: [{ status: 'not_started', prescription: { sets: 3 }, setLogs: [{ actual_reps: 5, weight: 100 }] }, 'completed'],
        }],
      },
      { title: 'Finisher', sectionType: 'conditioning', blocks: [{ structureType: 'amrap', timerSeconds: 480 }] },
    ],
    startedAt: new Date(Date.now() - 750 * 1000).toISOString(),
  })
}

function mountWorkoutRoute(): { double: WorkoutDouble } {
  const double = createWorkoutDouble({ session: multiSectionSession() })
  const router = createMemoryRouter(routes, { initialEntries: ['/', '/workout'], initialIndex: 1 })
  render(
    <AppProviders {...signedIn({ workout: double.clients })}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { double }
}

describe('TASK-027 compact live navigator preserves section access', () => {
  it('AC-C54-01 the compact navigator keeps the position and status and repeats none of the active card’s identity: no section card, title, status line or structure badges on screen', () => {
    const progress = mixedProgress()
    renderWithProviders(
      <HeadingLevelProvider level={2}>
        <SectionHeader compact section={progress.sections[1]} position={2} total={3} progress={progress} bar={false} onSelect={() => {}} />
      </HeadingLevelProvider>,
    )

    const frame = navigatorFrame()
    // No card of its own, and no block identity: no structure list, badge or format word.
    expect(cards()).toHaveLength(0)
    expect(within(frame).queryByRole('list', { name: 'Structures in this section' })).toBeNull()
    expect(frame.querySelector('.clr-chamfer--structure')).toBeNull()
    expect(frame.textContent).not.toMatch(/EMOM|AMRAP|STANDARD|10 MIN/)
    // What the athlete sees: the disclosure and the position — not the title or a status line.
    expect(visibleText(frame)).toBe('All sections2 / 3')
    // Assistive technology still reads the section's level-two heading, its position and its status.
    const heading = within(frame).getByRole('heading', { level: 2, name: 'Primary lift' })
    expect(heading).toHaveClass('a11y-hidden')
    expect(within(frame).getByText('Section 2 / 3 · In progress')).toHaveClass('a11y-hidden')
    // The trigger keeps its one name; the visible position is decoration of it.
    const toggle = within(frame).getByRole('button', { name: 'All sections' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const position = toggle.querySelector('[data-section-position]')
    expect(position).toHaveTextContent('2 / 3')
    expect(position).toHaveAttribute('aria-hidden', 'true')
    expect(position).toHaveClass('clr-section-nav__meta')
    // Every section's status, in words and a glyph, and which one is open.
    const list = within(frame).getByRole('list', { name: 'Sections' })
    const chips = within(list).getAllByRole('button')
    expect(chips.map((chip) => chip.getAttribute('aria-label'))).toEqual([
      'Warm-up, complete',
      'Primary lift, in progress',
      'Conditioning, not started',
    ])
    for (const chip of chips) expect(chip.querySelector('svg')).not.toBeNull()
    expect(within(list).getByRole('button', { name: 'Primary lift, in progress' })).toHaveAttribute('aria-current', 'step')
    // The meta sits at the trigger's end, from tokens, as the accepted reference draws it.
    expect(PRESENTATION_CSS).toMatch(
      /\.clr-section-nav__meta \{\s*margin-inline-start: auto;\s*color: var\(--text-secondary\);\s*font-size: var\(--label-xs-size\);\s*\}/,
    )
  })

  it('AC-C54-01 the jump list opens by keyboard and touch, jumps and collapses, stays out of the tab order while collapsed, and is read-only while a move is saving', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const progress = mixedProgress()
    const { rerender } = renderWithProviders(
      <SectionHeader compact section={progress.sections[1]} position={2} total={3} progress={progress} bar={false} onSelect={onSelect} />,
    )

    const frame = within(navigatorFrame())
    const toggle = frame.getByRole('button', { name: 'All sections' })
    expect(frame.getByRole('list', { name: 'Sections' })).toHaveAttribute('inert')

    // Keyboard: the trigger is the one tab stop; Enter opens it and the chips follow it.
    await user.tab()
    expect(toggle).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(frame.getByRole('list', { name: 'Sections' })).not.toHaveAttribute('inert')
    await user.tab()
    expect(frame.getByRole('button', { name: 'Warm-up, complete' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenLastCalledWith(0)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(frame.getByRole('list', { name: 'Sections' })).toHaveAttribute('inert')

    // Touch: open, choose, collapsed again.
    await user.click(toggle)
    await user.click(frame.getByRole('button', { name: 'Conditioning, not started' }))
    expect(onSelect).toHaveBeenLastCalledWith(2)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    // While a move is saving the route withholds `onSelect`: the list reads, but jumps nowhere.
    rerender(<SectionHeader compact section={progress.sections[1]} position={2} total={3} progress={progress} bar={false} />)
    await user.click(toggle)
    for (const chip of within(frame.getByRole('list', { name: 'Sections' })).getAllByRole('button')) expect(chip).toBeDisabled()
    expect(onSelect).toHaveBeenCalledTimes(2)
  })

  it('AC-R027-01 on the real /workout route a multi-section session jumps away and back: focus lands on each opened section’s first card, the navigator repeats no card identity, and nothing is recorded or reset — the logged set, every status and the session clock stay as they were', { timeout: 30_000 }, async () => {
    const user = userEvent.setup()
    const { double } = mountWorkoutRoute()
    await screen.findByRole('heading', { level: 1, name: 'Workout' })
    await screen.findByRole('navigation', { name: 'Workout sections' })

    // Entry: the first unfinished section is open, its logged set on its card.
    expect(within(navigatorFrame()).getByRole('heading', { level: 2, name: 'Primary lift' })).toBeInTheDocument()
    expect(visibleText(navigatorFrame())).toBe('All sections2 / 3')
    expect(screen.queryByRole('list', { name: 'Structures in this section' })).toBeNull()
    expect(navigatorFrame().closest('.clr-card')).toBeNull()
    const loggedBefore = within(firstCardAfterNavigator()).getByRole('list', { name: 'Logged sets' })
    expect(within(loggedBefore).getAllByRole('listitem')).toHaveLength(1)
    const sessionTime = () => screen.getByRole('timer', { name: 'Session time' }).textContent
    const clockBefore = sessionTime()

    // Jump away by keyboard: the Conditioning AMRAP's own card takes focus.
    const toggle = screen.getByRole('button', { name: 'All sections' })
    toggle.focus()
    await user.keyboard('{Enter}')
    screen.getByRole('button', { name: 'Conditioning, not started' }).focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(firstCardAfterNavigator()).toHaveFocus())
    const amrap = firstCardAfterNavigator()
    expect(amrap.querySelector('.clr-movement-group-header__badge')).toHaveTextContent('AMRAP')
    expect(within(navigatorFrame()).getByRole('heading', { level: 2, name: 'Conditioning' })).toBeInTheDocument()
    expect(within(navigatorFrame()).getByText('Section 3 / 3 · Not started')).toBeInTheDocument()
    expect(visibleText(navigatorFrame())).toBe('All sections3 / 3')
    expect(navigatorFrame().textContent).not.toMatch(/AMRAP|8 MIN/)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    // And back by touch: the Primary lift's card, its logged set still there.
    await user.click(toggle)
    await user.click(screen.getByRole('button', { name: 'Primary lift, in progress' }))
    await waitFor(() => expect(firstCardAfterNavigator()).toHaveFocus())
    const loggedAfter = within(firstCardAfterNavigator()).getByRole('list', { name: 'Logged sets' })
    expect(within(loggedAfter).getAllByRole('listitem')).toHaveLength(1)
    expect(visibleText(navigatorFrame())).toBe('All sections2 / 3')

    // Nothing recorded, corrected, cleared or completed; no status moved; the session clock ran on.
    expect(double.recorded()).toEqual([])
    expect(double.loggedSets()).toEqual([])
    expect(double.correctedSets()).toEqual([])
    expect(double.clearedSets()).toEqual([])
    expect(double.completed()).toEqual([])
    expect(within(screen.getByRole('list', { name: 'Sections' })).getAllByRole('button').map((chip) => chip.getAttribute('aria-label'))).toEqual([
      'Warm-up, complete',
      'Primary lift, in progress',
      'Conditioning, not started',
    ])
    expect(screen.getByRole('progressbar', { name: 'Section 2 of 3' })).toHaveAttribute('aria-valuenow', '1')
    expect(sessionTime()).toBe(clockBefore)
  })

  it('AC-C54-01 the accepted gallery state ?state=cards draws the route’s own compact navigator before the live cards, jumping a memory-only position with nothing read or written', async () => {
    const user = userEvent.setup()
    const fetch = vi.spyOn(globalThis, 'fetch')
    render(
      <MemoryRouter initialEntries={['/gallery/refinements?state=cards']}>
        <GalleryRefinements />
      </MemoryRouter>,
    )
    const state = document.querySelector<HTMLElement>('[data-refinement-state="cards"]')!
    const review = state.querySelector<HTMLElement>('[data-gallery-context="review"]')!
    const workout = state.querySelector<HTMLElement>('[data-gallery-context="workout"]')!
    expect(review.querySelector('[data-section-navigation]')).toBeNull()
    const frame = workout.querySelector<HTMLElement>('[data-section-navigation]')!
    expect(frame).not.toBeNull()
    expect(frame.compareDocumentPosition(workout.querySelector('[data-workout-card="workout"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(visibleText(frame)).toBe('All sections2 / 3')
    expect(frame.querySelector('.clr-chamfer--structure')).toBeNull()

    await user.click(within(frame).getByRole('button', { name: 'All sections' }))
    await user.click(within(frame).getByRole('button', { name: 'Cooldown, not started' }))
    expect(visibleText(frame)).toBe('All sections3 / 3')
    expect(within(frame).getByText('Section 3 / 3 · Not started')).toBeInTheDocument()
    // The cards below are untouched by the jump.
    expect(workout.querySelectorAll('[data-workout-card="workout"]')).toHaveLength(3)
    expect(fetch).not.toHaveBeenCalled()
  })
})
