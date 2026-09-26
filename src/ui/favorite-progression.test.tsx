/**
 * FAV-02's repeat surface as markup: the figures are on the card, each with the
 * run it came from, and a deload reads as a record rather than as a challenge.
 *
 * The derivation is tested in `src/state/favorite-progression.test.ts`; what is
 * checked here is what the user can actually read.
 */
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  BESTS_LABEL_COMPETITIVE,
  BESTS_LABEL_DELOAD,
  DELOAD_NOTE,
  favoriteProgression,
  type FavoriteRun,
} from '../state/favorite-progression'
import { renderWithProviders } from '../test/render'
import { reconstructionFixture, type SectionFixture } from '../test/workout-double'
import { FavoriteProgressionCard, PB_BADGE_LABEL } from './favorite-progression'

/** A run of the same favorite: one For Time block and one loaded lift. */
function run(day: string, elapsed: number, weight: number, underCap = true): FavoriteRun {
  const sections: SectionFixture[] = [
    {
      title: 'Conditioning',
      sectionType: 'conditioning',
      blocks: [
        {
          structureType: 'for_time',
          timerType: 'count_up',
          timerSeconds: 900,
          result: { elapsed_seconds: elapsed, completed_under_cap: underCap },
        },
      ],
    },
    {
      title: 'Primary lift',
      sectionType: 'primary_lift',
      blocks: [
        {
          exercises: [
            {
              status: 'completed',
              setLogs: [{ set_number: 1, weight, weight_unit: 'kg', actual_reps: 8 }],
            },
          ],
        },
      ],
    },
  ]

  return {
    sessionId: `session-${day}`,
    completedAt: `${day}T19:00:00+00:00`,
    performed: reconstructionFixture({ session: { date: day }, sections }),
  }
}

const RUNS = [run('2026-09-01', 400, 95), run('2026-09-08', 383, 100)]

/** An attempt whose For Time ran out of cap: a completion, and not a record. */
function capped(day: string): FavoriteRun {
  return run(day, 900, 100, false)
}

describe('the repeat surface', () => {
  it('states the last comparable performance with the day it was measured on', () => {
    renderWithProviders(
      <FavoriteProgressionCard
        progression={favoriteProgression(RUNS)}
        timesCompleted={2}
      />,
    )

    expect(screen.getByText('Completed 2 times · Tue 8 Sep 2026')).toBeInTheDocument()
    expect(screen.getByText('For time 06:23', { selector: 'p' })).toBeInTheDocument()
  })

  it('badges the personal best in words and names the workout that set it', () => {
    renderWithProviders(
      <FavoriteProgressionCard
        progression={favoriteProgression(RUNS)}
        timesCompleted={2}
      />,
    )

    expect(screen.getByText(BESTS_LABEL_COMPETITIVE)).toBeInTheDocument()
    expect(
      screen.getByText(`${PB_BADGE_LABEL} · set Tue 8 Sep 2026 · Full body`),
    ).toBeInTheDocument()
  })

  it('marks the completion that holds the record, and leaves the others unclaimed', () => {
    renderWithProviders(
      <FavoriteProgressionCard
        progression={favoriteProgression(RUNS)}
        timesCompleted={2}
      />,
    )

    const days = screen.getByRole('list', { name: 'Completions' }).querySelectorAll('li')

    expect(days[0]).toHaveTextContent(PB_BADGE_LABEL)
    expect(days[1]).not.toHaveTextContent(PB_BADGE_LABEL)
  })

  it('badges no record at all when every attempt stopped at the cap', () => {
    renderWithProviders(
      <FavoriteProgressionCard
        progression={favoriteProgression([capped('2026-09-01'), capped('2026-09-08')])}
        timesCompleted={2}
      />,
    )

    // Two completions, listed; no record drawn off a clock that read the cap.
    expect(
      screen.getByRole('list', { name: 'Completions' }).querySelectorAll('li'),
    ).toHaveLength(2)
    expect(screen.queryByText(new RegExp(PB_BADGE_LABEL))).not.toBeInTheDocument()
    expect(screen.queryByText(BESTS_LABEL_COMPETITIVE)).not.toBeInTheDocument()
  })

  it('makes the delta obvious, with both readings and the day it is against', () => {
    renderWithProviders(
      <FavoriteProgressionCard
        progression={favoriteProgression(RUNS)}
        timesCompleted={2}
      />,
    )

    expect(screen.getByText('17s faster')).toBeInTheDocument()
    expect(screen.getByText('5 kg heavier')).toBeInTheDocument()
    expect(screen.getAllByText(/vs Tue 1 Sep 2026/)).toHaveLength(2)
  })

  it('shows what was lifted last time, sourced to that run', () => {
    renderWithProviders(
      <FavoriteProgressionCard
        progression={favoriteProgression(RUNS)}
        timesCompleted={2}
      />,
    )

    const lastLift = screen.getByText('on Tue 8 Sep 2026').closest('li')

    expect(lastLift).not.toBeNull()
    expect(within(lastLift!).getByText('100 kg')).toBeInTheDocument()
  })

  it('lists the completions, newest first', () => {
    renderWithProviders(
      <FavoriteProgressionCard
        progression={favoriteProgression(RUNS)}
        timesCompleted={2}
      />,
    )

    const days = screen
      .getByRole('list', { name: 'Completions' })
      .querySelectorAll('li')

    expect(days).toHaveLength(2)
    expect(days[0]).toHaveTextContent('Tue 8 Sep 2026')
    expect(days[1]).toHaveTextContent('Tue 1 Sep 2026')
  })

  it('states the true completion count even when the read window is shorter', () => {
    renderWithProviders(
      <FavoriteProgressionCard
        progression={favoriteProgression(RUNS)}
        timesCompleted={14}
      />,
    )

    expect(screen.getByText(/Completed 14 times/)).toBeInTheDocument()
  })

  it('says a favorite has never been completed rather than showing empty figures', () => {
    renderWithProviders(
      <FavoriteProgressionCard progression={favoriteProgression([])} timesCompleted={0} />,
    )

    expect(screen.getByText('Never completed')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('not completed this one yet')
    expect(screen.queryByRole('list', { name: 'Completions' })).not.toBeInTheDocument()
  })

  it('drops the competitive framing during a deload and keeps the history', () => {
    renderWithProviders(
      <FavoriteProgressionCard
        progression={favoriteProgression(RUNS, { deload: true })}
        timesCompleted={2}
      />,
    )

    expect(screen.getByRole('note')).toHaveTextContent(DELOAD_NOTE)
    expect(screen.getByText(BESTS_LABEL_DELOAD)).toBeInTheDocument()
    expect(screen.queryByText(BESTS_LABEL_COMPETITIVE)).not.toBeInTheDocument()
    // The numbers stay; the verdict does not.
    expect(screen.getByText('17s faster')).toBeInTheDocument()
    expect(screen.getByText(/Compared with 06:40/)).toBeInTheDocument()
    expect(screen.queryByText(/Better than/)).not.toBeInTheDocument()
  })

  it('never leaves direction to colour — every delta carries its own words', () => {
    renderWithProviders(
      <FavoriteProgressionCard
        progression={favoriteProgression([RUNS[1], run('2026-09-15', 420, 95)])}
        timesCompleted={2}
      />,
    )

    expect(screen.getByText('37s slower')).toBeInTheDocument()
    expect(screen.getByText('5 kg lighter')).toBeInTheDocument()
    expect(screen.getAllByText(/Behind/).length).toBeGreaterThan(0)
  })
})
