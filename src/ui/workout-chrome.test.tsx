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
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../test/render'
import { snapshotFixture } from '../test/workout-double'
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
          blocks: [{ structureType: 'emom', timerSeconds: 600, exercises: ['completed', 'not_started'] }],
        },
        { title: 'Finisher', blocks: [{ structureType: 'amrap', timerSeconds: 480 }] },
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

  it('is the shipped timer card — one bar, the timer role, and no frame around it', () => {
    renderWithProviders(<GlobalTimer seconds={750} />)

    const timer = screen.getByRole('timer', { name: 'Session time' })
    expect(timer).toHaveClass('clr-chamfer', 'clr-card__body', 'clr-chamfer--timer')
    expect(cards()).toHaveLength(1)
    expect(timer.parentElement).toBe(cards()[0])
    expect(cards()[0].querySelectorAll(':scope > .clr-card__bar')).toHaveLength(1)

    const bleed = cards()[0].parentElement as HTMLElement
    expect(bleed).toHaveClass('clr-bleed')
    expect(bleed.style.getPropertyValue('--bleed')).toBe('var(--border-timer)')
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
    expect(sections.getByRole('button', { name: 'Finisher, not started' })).toBeInTheDocument()
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

    await user.click(screen.getByRole('button', { name: 'Finisher, not started' }))
    expect(onSelect).toHaveBeenCalledWith(2)

    rerender(<ProgressTracker progress={mixedProgress()} currentIndex={0} />)
    expect(screen.getByRole('button', { name: 'Finisher, not started' })).toBeDisabled()
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

    const structures = within(screen.getByRole('list', { name: 'Structures in this section' }))
    expect(structures.getByText('EMOM · 10 MIN')).toBeInTheDocument()
    expect(structures.getByText('FOR TIME · 15 MIN CAP')).toBeInTheDocument()
    expect(structures.getByText('CIRCUIT · 3 ROUNDS · LADDER DOWN')).toBeInTheDocument()
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
    expect(restBar()).toHaveAttribute('data-loop', 'still')
  })

  it('goes low as the shipped low state: stepped over --dur-alert, pulsing to 80%, no glow', async () => {
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

    // The pulse is on the whole card and is the view's running loop.
    expect(restBar()).toHaveClass('clr-pulse-micro')
    expect(restBar()).toHaveAttribute('data-loop', 'run')

    // No glow of the timer's own: the extra glow is the primary action's.
    expect(document.querySelector('.clr-glow')).toBeNull()

    // What those classes resolve to in the shipped package.
    expect(MOTION_CSS).toMatch(/--dur-slow:\s*400ms/)
    expect(MOTION_CSS).toMatch(/--dur-alert:\s*var\(--dur-slow\)/)
    expect(MOTION_CSS).toMatch(/--step-4:\s*steps\(4, end\)/)
    expect(MOTION_CSS.includes('@keyframes clr-micro-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.8; } }')).toBe(true)
    expect(MOTION_CSS.includes('.clr-pulse-micro { animation: clr-micro-pulse var(--dur-idle) var(--step-2) infinite; }')).toBe(true)
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
    expect(restBar()).toHaveAttribute('data-loop', 'still')
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

    // A rest that is not low has no loop, so the wait keeps its own.
    expect(wait).toHaveAttribute('data-loop', 'run')
    expect(restBar()).toHaveAttribute('data-loop', 'still')

    clock.advance(52)
    returnToForeground()

    // Low: the pulse carries more state, so it runs and the wait is stilled —
    // still on screen, still busy, still saying what it is waiting for.
    expect(restBar()).toHaveAttribute('data-loop', 'run')
    expect(wait).toHaveAttribute('data-loop', 'still')
    expect(wait).toHaveAttribute('aria-busy', 'true')
    expect(wait).toHaveTextContent('Reading coaching for back squat')
    expect(document.querySelectorAll('[data-loop="run"]')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Skip rest' }))
    expect(wait).toHaveAttribute('data-loop', 'run')
    expect(document.querySelectorAll('[data-loop="run"]')).toHaveLength(1)
  })

  it('is still under reduced motion and loses nothing it was saying', async () => {
    reduceMotion(true)
    await restWith(8)

    expect(restBar()).toHaveAttribute('data-loop', 'still')
    expect(document.querySelector('[data-loop="run"]')).toBeNull()

    // The reading, the word, the colour role and the controls are all there.
    expect(restBar()).toHaveAttribute('data-urgent', 'true')
    expect(restCardBody()).toHaveClass('clr-chamfer--timer-low')
    expect(restDigits().style.color).toBe('var(--text-timer-low)')
    expect(screen.getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('00:08')
    expect(screen.getByText('8 seconds left')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Final 10 seconds')
    expect(screen.getByText('Rest after Back Squat')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add 30s' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Skip rest' })).toBeEnabled()

    // The shipped rule that makes a stilled or reduced pulse static.
    expect(MOTION_CSS).toMatch(
      /prefers-reduced-motion: reduce\) \{[\s\S]*\.clr-pulse-micro[\s\S]*animation: none/,
    )
  })
})
