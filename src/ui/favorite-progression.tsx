/**
 * FAV-02's repeat surface: the thread between the runs of one favorite.
 *
 * It sits above the briefing on Review when the workout in front of the user
 * was restored from a favorite, and it answers one question — *what happened
 * the last times I did this?* — in four parts: the bests, what was lifted last
 * time, the last run against the one before it, and the completions themselves.
 *
 * Four rules it keeps:
 *
 *   · **No figure without its source.** Every best, delta and last-time weight
 *     prints the day it was measured on, because "6:23" and "6:23, on Tue 8
 *     Sep" are different claims and only the second one can be checked.
 *   · **Direction is a word and a glyph, never a colour.** Faster, slower and
 *     level each carry their own arrow *and* their own sentence, so the delta
 *     survives a monochrome skin and a screen reader.
 *   · **A deload states its framing.** `unjudged` deltas render with a neutral
 *     glyph and no verdict, under the deload sentence, which is REQ-059's
 *     "show the history, drop the beat-your-time language" as markup.
 *   · **All four states belong to the caller.** This component renders the
 *     populated one and the honest empty one (a favorite with no completions,
 *     which says so). Loading and error are the screen's, through
 *     `ViewStateSwitch`, because they are facts about the read.
 */
import type { CSSProperties, ReactNode } from 'react'

import {
  ArrowDown,
  ArrowUp,
  CalendarCheck,
  Minus,
  Trophy,
  WeightPlate,
} from '../design-system/index'
import type {
  FavoriteProgression,
  ProgressionDelta,
  ProgressionDirection,
} from '../state/favorite-progression'
import { Card } from './card'
import { Heading, HeadingSection } from './Heading'

export const PROGRESSION_TITLE = 'Last time'
export const LAST_WEIGHTS_LABEL = 'What you lifted last time'
export const HISTORY_LABEL = 'Completions'
export const PB_BADGE_LABEL = 'Personal best'

/** How many times it has been done, in words. Zero says so plainly. */
export function timesCompletedText(timesCompleted: number): string {
  if (timesCompleted === 0) return 'Never completed'
  return timesCompleted === 1 ? 'Completed once' : `Completed ${timesCompleted} times`
}

/**
 * The glyph a direction carries. `unjudged` is a deload: the change is shown
 * and no arrow claims it was an improvement.
 */
const DIRECTION_GLYPH: Readonly<Record<ProgressionDirection, ReactNode>> = {
  better: <ArrowUp size={16} />,
  worse: <ArrowDown size={16} />,
  level: <Minus size={16} />,
  unjudged: <Minus size={16} />,
}

/** What each direction is, in words, for the reader who hears the row. */
const DIRECTION_WORDS: Readonly<Record<ProgressionDirection, string>> = {
  better: 'Better than',
  worse: 'Behind',
  level: 'Level with',
  unjudged: 'Compared with',
}

const META_STYLE: CSSProperties = {
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
  color: 'var(--text-card-label)',
  margin: 0,
}

const TITLE_STYLE: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--heading-h5-size)',
  color: 'var(--text-card-header)',
  margin: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--spacing-200)',
}

const GROUP_LABEL_STYLE: CSSProperties = {
  ...META_STYLE,
  textTransform: 'uppercase',
  marginTop: 'var(--spacing-300)',
}

const LIST_STYLE: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 'var(--spacing-100)',
}

const ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 'var(--spacing-200)',
  flexWrap: 'wrap',
  margin: 0,
}

const GLYPH_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignSelf: 'center',
}

const VALUE_STYLE: CSSProperties = {
  fontFamily: 'var(--font-data)',
  color: 'var(--text-card-header)',
}

export interface FavoriteProgressionCardProps {
  /** The derivation — `favoriteProgression(runs, { deload })`. */
  progression: FavoriteProgression
  /**
   * `saved_workouts.times_completed`, which is the count of *every* completion
   * rather than of the runs this progression was drawn over. Passed separately
   * so a favorite with more history than the read window still states the true
   * number instead of the size of the window.
   */
  timesCompleted: number
}

export function FavoriteProgressionCard({
  progression,
  timesCompleted,
}: FavoriteProgressionCardProps) {
  const {
    bests,
    bestsLabel,
    comparisonLabel,
    deltas,
    history,
    lastRunHeadline,
    lastRunOn,
    lastWeights,
    note,
    runCount,
  } = progression

  return (
    <HeadingSection>
      <Card>
        <Heading style={TITLE_STYLE}>
          <span aria-hidden="true" style={GLYPH_STYLE}>
            <CalendarCheck size={16} />
          </span>
          {PROGRESSION_TITLE}
        </Heading>

        <p style={{ ...META_STYLE, marginTop: 'var(--spacing-200)' }}>
          {timesCompletedText(timesCompleted)}
          {/* The headline of the most recent run, sourced to its day. A
              favorite never completed has neither, and says nothing. */}
          {lastRunOn === null ? '' : ` · ${lastRunOn}`}
        </p>
        {lastRunHeadline !== null && <p style={ROW_STYLE}>{lastRunHeadline}</p>}

        {note !== null && (
          <p style={{ ...META_STYLE, marginTop: 'var(--spacing-200)' }} role="note">
            {note}
          </p>
        )}

        {bests.length > 0 && (
          <>
            <p style={GROUP_LABEL_STYLE}>{bestsLabel}</p>
            <ul style={LIST_STYLE}>
              {bests.map((best) => (
                <li key={best.key} style={ROW_STYLE}>
                  <span aria-hidden="true" style={GLYPH_STYLE}>
                    <Trophy size={16} />
                  </span>
                  <span>{best.label}</span>
                  <span style={VALUE_STYLE}>{best.display}</span>
                  {/* The badge is a word, so the record reads as a record
                      without depending on the glyph beside it — and it names
                      the workout and the day it was set in, because a record
                      whose source is not stated cannot be checked. */}
                  <span style={META_STYLE}>
                    {PB_BADGE_LABEL} · set {best.setOn} · {best.workoutTitle}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {comparisonLabel !== null && (
          <>
            <p style={GROUP_LABEL_STYLE}>{comparisonLabel}</p>
            <ul style={LIST_STYLE}>
              {deltas.map((delta) => (
                <li key={delta.key}>
                  <DeltaRow delta={delta} />
                </li>
              ))}
            </ul>
          </>
        )}

        {lastWeights.length > 0 && (
          <>
            <p style={GROUP_LABEL_STYLE}>{LAST_WEIGHTS_LABEL}</p>
            <ul style={LIST_STYLE}>
              {lastWeights.map((weight) => (
                <li key={weight.key} style={ROW_STYLE}>
                  <span aria-hidden="true" style={GLYPH_STYLE}>
                    <WeightPlate size={16} />
                  </span>
                  <span>{weight.label}</span>
                  <span style={VALUE_STYLE}>{weight.display}</span>
                  <span style={META_STYLE}>on {weight.setOn}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {runCount > 0 && (
          <>
            <p style={GROUP_LABEL_STYLE}>{HISTORY_LABEL}</p>
            <ul style={LIST_STYLE} aria-label={HISTORY_LABEL}>
              {history.map((entry) => (
                <li key={entry.key} style={ROW_STYLE}>
                  <span style={VALUE_STYLE}>{entry.on}</span>
                  <span>{entry.headline}</span>
                  {/* The other end of the record's source: the run that holds
                      it says so, in the same word the badge above uses. */}
                  {entry.holdsBest && (
                    <span style={META_STYLE}>
                      <span aria-hidden="true" style={GLYPH_STYLE}>
                        <Trophy size={16} />
                      </span>{' '}
                      {PB_BADGE_LABEL}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </HeadingSection>
  )
}

/**
 * One reading against the same reading last time.
 *
 * The change is stated twice on purpose: once as the sentence the row is about
 * ("12s faster") and once as the two readings that produced it ("06:23 · vs
 * 06:35, Tue 8 Sep 2026"), because a delta with no operands is a conclusion the
 * user is being asked to take on trust.
 */
function DeltaRow({ delta }: { delta: ProgressionDelta }) {
  return (
    <p style={ROW_STYLE}>
      <span aria-hidden="true" style={GLYPH_STYLE}>
        {DIRECTION_GLYPH[delta.direction]}
      </span>
      <span>{delta.label}</span>
      <span style={VALUE_STYLE}>{delta.current}</span>
      <span>{delta.change}</span>
      <span style={META_STYLE}>
        {DIRECTION_WORDS[delta.direction]} {delta.previous} {delta.against}
      </span>
    </p>
  )
}
