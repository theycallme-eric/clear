/**
 * HIST-01's list, as the two app-owned domain components it needs
 * (ATOMIC.md §11: every layer-4 part composes from the export rather than
 * arriving in it).
 *
 * `WorkoutListItem` is the IA's name for the first one. It renders one entry of
 * the chronology — a session with its date and what became of it, or a run of
 * rest days — as a `ListRow`; `HistoryList` owns the one closed `ListFrame`
 * around the related collection.
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
import type { CSSProperties, ElementType, ReactNode } from 'react'
import { Link } from 'react-router-dom'

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
import { ListFrame, ListRow } from './composition'
import { Heading } from './Heading'

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
  letterSpacing: 'var(--tracking-data)',
  textTransform: 'uppercase',
}

const TITLE_STYLE: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--heading-h5-size)',
  color: 'var(--text-card-header)',
  margin: 0,
}

/** The two duration contexts, each named, so neither is read as the other. */
export const REQUESTED_DURATION_LABEL = 'Requested'
export const ACTUAL_DURATION_LABEL = 'Actual'

/** Title left, status right; the status drops below a title that needs the width. */
const HEAD_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  columnGap: 'var(--spacing-200)',
  rowGap: 'var(--spacing-100)',
}

/** A long name wraps inside the row, even a single unbroken word. */
const LONG_TITLE_STYLE: CSSProperties = {
  flex: '1 1 0',
  minWidth: 0,
  overflowWrap: 'anywhere',
}

export interface WorkoutListItemProps {
  entry: HistoryEntry
  /**
   * Where this workout opens, when it opens anywhere. HOME-01's recents and
   * History's own list both link into HIST-01's detail; the link stays a prop
   * rather than a fact about the row so a list that should not open anything
   * can say so. A rest run is never a link — there is no session behind it.
   */
  to?: string
  /** Resolve a session activation before the detail-route fallback is used. */
  onOpen?: (entry: HistorySessionEntry) => void
  /** The stored prescription is being checked for direct Review entry. */
  opening?: boolean
  /** Semantic element used by a containing real list. */
  as?: ElementType
  /**
   * `chronology` is History's full row; `recent` is Home's shorter one
   * (REQ-004). Rest runs read the same in both.
   */
  layout?: HistoryListLayout
}

export type HistoryListLayout = 'chronology' | 'recent'

/** One entry of the chronology: a workout, or the gap before it. */
export function WorkoutListItem({
  entry,
  to,
  onOpen,
  opening = false,
  as,
  layout = 'chronology',
}: WorkoutListItemProps) {
  return entry.kind === 'rest' ? (
    <RestItem entry={entry} as={as} />
  ) : layout === 'recent' ? (
    <RecentSessionItem entry={entry} to={to} onOpen={onOpen} opening={opening} as={as} />
  ) : (
    <SessionItem entry={entry} to={to} onOpen={onOpen} opening={opening} as={as} />
  )
}

function SessionItem({
  entry,
  to,
  onOpen,
  opening,
  as,
}: {
  entry: HistorySessionEntry
  to?: string
  onOpen?: (entry: HistorySessionEntry) => void
  opening: boolean
  as?: ElementType
}) {
  return (
    // A list row is a top-level section of both History and Home's recent
    // panel. `Screen` has already established h2 for this content; deepening
    // here would skip directly from the screen's h1 to h3.
    // U44: one hierarchy for every row, whatever its status. The title and
    // its status are the head group; the day and focus say when and what; the
    // metrics close the row in a fixed order, the requested minutes always and
    // the actual minutes only when some were recorded.
    <ListRow as={as ?? 'section'} aria-busy={opening || undefined}>
      <div data-part="head" style={HEAD_STYLE}>
        {/* The title carries the link rather than the whole card: an accessible
            name is the workout, not every fact printed beside it. */}
        <Heading style={{ ...TITLE_STYLE, ...LONG_TITLE_STYLE }}>
          {to === undefined ? (
            entry.title
          ) : (
            <Link
              to={to}
              onClick={(event) => {
                if (onOpen === undefined) return
                event.preventDefault()
                if (!opening) onOpen(entry)
              }}
              aria-disabled={opening || undefined}
            >
              {entry.title}
            </Link>
          )}
        </Heading>
        <span
          data-part="status"
          style={{ ...GLYPH_STYLE, color: 'var(--text-card-header)', flexShrink: 0 }}
        >
          <span aria-hidden="true" style={{ display: 'flex' }}>
            {STATUS_GLYPH[entry.status]}
          </span>
          {HISTORY_STATUS_LABELS[entry.status]}
        </span>
      </div>
      <p data-part="context" style={{ ...META_STYLE, marginTop: 'var(--spacing-100)' }}>
        {`${formatDay(entry.day)} · ${formatFocus(entry.focus)}`}
      </p>
      {/* A count never wraps away from its unit. */}
      <p data-part="metrics" style={{ ...ROW_STYLE, ...META_STYLE, marginTop: 'var(--spacing-100)' }}>
        <span className="clr-nowrap">{`${REQUESTED_DURATION_LABEL} ${entry.requestedMins} min`}</span>
        {entry.durationMins !== null && (
          <span className="clr-nowrap">{`${ACTUAL_DURATION_LABEL} ${entry.durationMins} min`}</span>
        )}
        <span className="clr-nowrap">{`Intensity ${entry.intensity}/10`}</span>
      </p>
    </ListRow>
  )
}

/** REQ-004: the recent row's title, one step under the chronology's. */
const RECENT_TITLE_STYLE: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--label-md-size)',
  lineHeight: 'var(--label-md-line-height)',
  color: 'var(--text-card-header)',
  margin: 0,
}

/** The title link reads as the row's name: no rule under it. */
const RECENT_LINK_STYLE: CSSProperties = {
  borderBottom: 0,
  color: 'inherit',
}

/**
 * B05-01.5: the status and date share one line and one baseline. The status
 * leads with a text-less glyph, so baseline alignment would hang the date off
 * the glyph's bottom edge; centring the two same-type items lines up their text.
 */
const RECENT_STATUS_DATE_STYLE: CSSProperties = {
  ...ROW_STYLE,
  ...META_STYLE,
  alignItems: 'center',
  marginTop: 'var(--spacing-100)',
}

/** Metrics a glance can read: a step up from the data labels, in paragraph colour. */
const RECENT_METRICS_STYLE: CSSProperties = {
  ...ROW_STYLE,
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-sm-size)',
  lineHeight: 'var(--label-sm-line-height)',
  color: 'var(--text-paragraph)',
  margin: 0,
  marginTop: 'var(--spacing-100)',
}

/**
 * Completed takes the selection colour the week strip's trained day uses; a
 * workout that stopped short steps back. The glyph and word still differ, so
 * colour is never the only cue.
 */
const RECENT_STATUS_COLOR: Readonly<Record<HistorySessionStatus, string>> = {
  completed: 'var(--text-selected)',
  partial: 'var(--text-card-label)',
  unstarted: 'var(--text-card-label)',
}

/**
 * A generated title that ends in "session" says nothing the row does not:
 * every recent row is one. The word is dropped only when something precedes it.
 */
function recentTitle(title: string): string {
  const trimmed = title.replace(/\s+session\s*$/i, '')
  return trimmed.length === 0 ? title : trimmed
}

/**
 * REQ-004: Home's recent row. A smaller title first; then what became of it
 * and when, together; then the metrics. The focus leads the metrics because
 * it is what the workout trained.
 */
function RecentSessionItem({
  entry,
  to,
  onOpen,
  opening,
  as,
}: {
  entry: HistorySessionEntry
  to?: string
  onOpen?: (entry: HistorySessionEntry) => void
  opening: boolean
  as?: ElementType
}) {
  const title = recentTitle(entry.title)

  return (
    <ListRow as={as ?? 'section'} aria-busy={opening || undefined} data-status={entry.status}>
      <Heading data-part="title" style={{ ...RECENT_TITLE_STYLE, ...LONG_TITLE_STYLE }}>
        {to === undefined ? (
          title
        ) : (
          <Link
            to={to}
            style={RECENT_LINK_STYLE}
            onClick={(event) => {
              if (onOpen === undefined) return
              event.preventDefault()
              if (!opening) onOpen(entry)
            }}
            aria-disabled={opening || undefined}
          >
            {title}
          </Link>
        )}
      </Heading>
      <p data-part="status-date" style={RECENT_STATUS_DATE_STYLE}>
        <span
          data-part="status"
          style={{ ...GLYPH_STYLE, color: RECENT_STATUS_COLOR[entry.status] }}
        >
          <span aria-hidden="true" style={{ display: 'flex' }}>
            {STATUS_GLYPH[entry.status]}
          </span>
          {HISTORY_STATUS_LABELS[entry.status]}
        </span>
        <span data-part="date" className="clr-nowrap">
          {formatDay(entry.day)}
        </span>
      </p>
      {/* A count never wraps away from its unit. */}
      <p data-part="metrics" style={RECENT_METRICS_STYLE}>
        <span className="clr-nowrap">{formatFocus(entry.focus)}</span>
        <span className="clr-nowrap">{`${REQUESTED_DURATION_LABEL} ${entry.requestedMins} min`}</span>
        {entry.durationMins !== null && (
          <span className="clr-nowrap">{`${ACTUAL_DURATION_LABEL} ${entry.durationMins} min`}</span>
        )}
        <span className="clr-nowrap">{`Intensity ${entry.intensity}/10`}</span>
      </p>
    </ListRow>
  )
}

/**
 * A run of untrained days. It is a real row rather than a divider, because a
 * rest day is part of the chronology the user is reading — but its surface and
 * type step down, so a screen of rest does not look like a screen of workouts.
 */
function RestItem({ entry, as }: { entry: HistoryRestEntry; as?: ElementType }) {
  return (
    <ListRow
      as={as ?? 'section'}
      style={
        {
          background: 'var(--surface-frame-structure-quiet)',
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
    </ListRow>
  )
}

export interface HistoryListProps {
  entries: readonly HistoryEntry[]
  /** Names the list for assistive technology — "Workout history". */
  label: string
  /** Where each session row opens. Omitted, no row is a link. */
  linkTo?: (entry: HistorySessionEntry) => string
  /** Optional activation resolver used before the detail-route fallback. */
  onOpen?: (entry: HistorySessionEntry) => void
  openingId?: string | null
  /** Which row each session renders as. History's chronology by default. */
  layout?: HistoryListLayout
}

/** The chronology, newest first, as a real list. */
export function HistoryList({
  entries,
  label,
  linkTo,
  onOpen,
  openingId = null,
  layout,
}: HistoryListProps) {
  return (
    <ListFrame
      as="ul"
      aria-label={label}
      style={{ listStyle: 'none', margin: 0, padding: 0 }}
    >
      {entries.map((entry) => (
        <WorkoutListItem
          key={entry.key}
          as="li"
          entry={entry}
          to={entry.kind === 'session' ? linkTo?.(entry) : undefined}
          onOpen={onOpen}
          opening={entry.kind === 'session' && entry.id === openingId}
          layout={layout}
        />
      ))}
    </ListFrame>
  )
}
