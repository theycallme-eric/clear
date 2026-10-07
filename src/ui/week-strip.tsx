/**
 * HOME-01's week strip — the IA's `WeekStreakDisplay`, as the app-owned part it
 * has to be (ATOMIC.md §11: every layer-4 component composes from the export).
 *
 * Seven days, Monday first, each one carrying its state as a **glyph and a
 * word** before it carries a colour: a tick for a day that was trained, the
 * `Rest` mark for a day that finished empty, and a dash for a day that has not
 * happened yet. The letters `M T W T F S S` are decorative — they are ambiguous
 * twice over — so each day's accessible name is its full weekday and what
 * became of it.
 *
 * Today is marked by a doubled border rather than by hue alone, for the same
 * reason: an outline is visible to a reader who cannot tell the two surfaces
 * apart.
 */
import type { CSSProperties } from 'react'

import { Check, Rest } from '../design-system/index'
import { formatDay } from '../state/history'
import { WEEK_DAY_LABELS, type WeekDay } from '../state/home'
import { REST_DAY_REASON_LABELS } from '../state/rest-days'

const LIST_STYLE: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: 'var(--spacing-100)',
}

/**
 * Each day is a small element frame inside the week's card: the shipped
 * chamfer draws the border and the solid ground, and the day only says which
 * state it is in through the frame's own `--surface` / `--brd`.
 */
const DAY_CLASS = 'clr-chamfer clr-chamfer--sm'

const DAY_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--spacing-100)',
  padding: 'var(--spacing-200) var(--spacing-100)',
  '--surface': 'var(--surface-unselected)',
  '--brd': 'var(--border-unselected)',
} as CSSProperties

/** A trained day takes the selection state, beside its tick. */
const TRAINED_STYLE = {
  '--surface': 'var(--surface-selected)',
  '--brd': 'var(--border-selected)',
} as CSSProperties

const TODAY_STYLE = {
  // The doubled border is the export's own cue for "this one" (ATOMIC.md §9 —
  // a chamfer expresses focus as a widened border, because a colour change
  // alone is not an indicator), and it survives a skin, a contrast preference
  // and a monochrome screen.
  '--bw': 'var(--focus-ring-width)',
  '--brd': 'var(--border-selected)',
} as CSSProperties

const LETTER_STYLE: CSSProperties = {
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
  textTransform: 'uppercase',
  color: 'var(--text-card-label)',
}

/** The mark each state carries. Never colour alone, and never an emoji. */
function DayMark({ state }: { state: WeekDay['state'] }) {
  switch (state) {
    case 'workout':
      return (
        <span aria-hidden="true" style={{ display: 'flex', color: 'var(--icon-selected)' }}>
          <Check size={16} />
        </span>
      )
    case 'rest':
      return (
        <span aria-hidden="true" style={{ display: 'flex', color: 'var(--text-rail-cue)' }}>
          <Rest size={16} />
        </span>
      )
    case 'upcoming':
      return (
        <span aria-hidden="true" style={{ color: 'var(--text-unselected)' }}>
          –
        </span>
      )
  }
}

export interface WeekStripProps {
  days: readonly WeekDay[]
  /** Names the strip for assistive technology — "This week". */
  label: string
}

export function WeekStrip({ days, label }: WeekStripProps) {
  return (
    <ul aria-label={label} style={LIST_STYLE}>
      {days.map((day) => (
        <li
          key={day.day}
          className={DAY_CLASS}
          style={{
            ...DAY_STYLE,
            ...(day.state === 'workout' ? TRAINED_STYLE : null),
            ...(day.isToday ? TODAY_STYLE : null),
          }}
        >
          <span aria-hidden="true" style={LETTER_STYLE}>
            {day.initial}
          </span>
          <DayMark state={day.state} />
          {/* The whole of what this square says, for anyone not reading the
              letter: the date, the day, and what became of it. */}
          <span className="a11y-hidden">
            {formatDay(day.day)}
            {day.isToday ? ' (today)' : ''}: {WEEK_DAY_LABELS[day.state]}
            {day.reason === null ? '' : ` — ${REST_DAY_REASON_LABELS[day.reason]}`}
          </span>
        </li>
      ))}
    </ul>
  )
}
