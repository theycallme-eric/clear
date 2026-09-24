/**
 * HIST-01's list, as the two app-owned domain components it needs
 * (ATOMIC.md §11: every layer-4 part composes from the export rather than
 * arriving in it).
 *
 * `WorkoutListItem` is the IA's name for the first one. It renders one entry of
 * the chronology — a session with its date and what became of it, or a run of
 * rest days — over the DS-04a `Card`, so a history row is the same frame as
 * every other card in the app.
 *
 * Two rules the list is built to keep:
 *
 *   · **Rest is visually distinct, and not by colour.** A rest entry carries
 *     the `Rest` glyph, quiet surface tokens and the word "Rest"; a session
 *     carries its status glyph and the status word. Anyone who cannot see the
 *     difference in hue reads the difference in the text.
 *   · **The status is a word before it is anything else.** `Completed`,
 *     `Partial`, `Not started` — a glyph beside each, never a glyph alone.
 */
import type { CSSProperties, ReactNode } from 'react'

import { CircleCheck, CircleX, Pause, Rest } from '../design-system/index'
import {
  formatDay,
  formatFocus,
  formatRestRange,
  HISTORY_STATUS_LABELS,
  type HistoryEntry,
  type HistoryRestEntry,
  type HistorySessionEntry,
  type HistorySessionStatus,
} from '../state/history'
import { Card } from './card'
import { Heading, HeadingSection } from './Heading'

/** The glyph each status carries. Colour is never the only cue. */
const STATUS_GLYPH: Readonly<Record<HistorySessionStatus, ReactNode>> = {
  completed: <CircleCheck />,
  partial: <Pause />,
  unstarted: <CircleX />,
}

const ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 'var(--spacing-200)',
  flexWrap: 'wrap',
}

const META_STYLE: CSSProperties = {
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
  color: 'var(--text-card-label)',
  margin: 0,
}

const GLYPH_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--spacing-100)',
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data-wide)',
  textTransform: 'uppercase',
}

const TITLE_STYLE: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--heading-h5-size)',
  color: 'var(--text-card-header)',
  margin: 0,
}

export interface WorkoutListItemProps {
  entry: HistoryEntry
}

/** One entry of the chronology: a workout, or the gap before it. */
export function WorkoutListItem({ entry }: WorkoutListItemProps) {
  return entry.kind === 'rest' ? <RestItem entry={entry} /> : <SessionItem entry={entry} />
}

function SessionItem({ entry }: { entry: HistorySessionEntry }) {
  return (
    <HeadingSection>
      <Card>
        <p style={META_STYLE}>{formatDay(entry.day)}</p>
        <Heading style={TITLE_STYLE}>{entry.title}</Heading>
        <p style={{ ...ROW_STYLE, ...META_STYLE, marginTop: 'var(--spacing-200)' }}>
          <span style={{ ...GLYPH_STYLE, color: 'var(--text-card-header)' }}>
            <span aria-hidden="true" style={{ display: 'flex' }}>
              {STATUS_GLYPH[entry.status]}
            </span>
            {HISTORY_STATUS_LABELS[entry.status]}
          </span>
          <span>{formatFocus(entry.focus)}</span>
          {entry.durationMins !== null && <span>{entry.durationMins} min</span>}
          <span>Intensity {entry.intensity}/10</span>
        </p>
      </Card>
    </HeadingSection>
  )
}

/**
 * A run of untrained days. It is a card like any other rather than a divider,
 * because a rest day is part of the chronology the user is reading — but it is
 * quiet: the accent bar and the type step down, so a screen of rest does not
 * look like a screen of workouts.
 */
function RestItem({ entry }: { entry: HistoryRestEntry }) {
  return (
    <HeadingSection>
      <Card
        style={
          {
            // The chamfer's own two hooks, exactly as `ErrorView` sets them:
            // surface and border move together, so the quiet card is a quiet
            // frame rather than a normal one wearing a different fill.
            '--surface': 'var(--surface-frame-structure-quiet)',
            '--surface-card-accent': 'var(--surface-rail-cue)',
          } as CSSProperties
        }
      >
        <p style={META_STYLE}>{formatRestRange(entry)}</p>
        <Heading style={{ ...TITLE_STYLE, ...GLYPH_STYLE, color: 'var(--text-rail-cue)' }}>
          <span aria-hidden="true" style={{ display: 'flex' }}>
            <Rest />
          </span>
          Rest
        </Heading>
      </Card>
    </HeadingSection>
  )
}

export interface HistoryListProps {
  entries: readonly HistoryEntry[]
  /** Names the list for assistive technology — "Workout history". */
  label: string
}

/** The chronology, newest first, as a real list. */
export function HistoryList({ entries, label }: HistoryListProps) {
  return (
    <ul
      aria-label={label}
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'grid',
        gap: 'var(--spacing-300)',
      }}
    >
      {entries.map((entry) => (
        <li key={entry.key}>
          <WorkoutListItem entry={entry} />
        </li>
      ))}
    </ul>
  )
}
