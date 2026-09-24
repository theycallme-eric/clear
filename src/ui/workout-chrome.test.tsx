/**
 * EXE-01 acceptance — the shell's four chrome parts, and the operational-screen
 * rules the export's pattern 6 states for them: the timer is labelled and not
 * live, status is never colour alone, and the destructive action is nowhere
 * near the one pressed between every section.
 */
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../test/render'
import { snapshotFixture } from '../test/workout-double'
import { sessionProgress, type SessionProgress } from '../state/workout-progress'
import {
  GlobalTimer,
  ProgressTracker,
  SectionHeader,
  StructureBadge,
  WorkoutNavigation,
} from './workout-chrome'

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
})

describe('SectionHeader', () => {
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
})

describe('StructureBadge', () => {
  it('is the label alone when the block carries no number', () => {
    const identity = sessionProgress(snapshotFixture({ sections: [{ blocks: [{}] }] }))
      .sections[0].blocks[0].identity

    renderWithProviders(<StructureBadge identity={identity} />)

    expect(screen.getByText('STANDARD')).toBeInTheDocument()
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
})
