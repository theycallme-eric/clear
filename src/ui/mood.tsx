/**
 * The mood scale as glyphs, and the read-only reading of one.
 *
 * `MOOD_ICONS` is the one place a `MoodGlyph` name becomes a component, so the
 * scale itself (`src/state/mood.ts`) stays free of React and SUM-01's capture
 * and HIST-01's report draw the same faces from the same list.
 *
 * `MoodReading` is the reporting half: a face, the word, and the number out of
 * five. Three cues for one value, because the face alone is a picture a reader
 * may not parse the same way and the number alone is a rating without a scale.
 */
import type { CSSProperties, ReactElement } from 'react'

import {
  Frown,
  Meh,
  Smile,
  SmilePlus,
  ThumbsDown,
  type IconProps,
} from '../design-system/index'
import { MOOD_MAX, type MoodGlyph, type MoodStep } from '../state/mood'

/** Each glyph the scale names, as the export ships it (ATOMIC.md §6). */
export const MOOD_ICONS: Readonly<
  Record<MoodGlyph, (props: IconProps) => ReactElement>
> = {
  ThumbsDown,
  Frown,
  Meh,
  Smile,
  SmilePlus,
}

const READING_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--spacing-200)',
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-sm-size)',
  letterSpacing: 'var(--tracking-data)',
  color: 'var(--text-card-body)',
}

const SCALE_STYLE: CSSProperties = {
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
  color: 'var(--text-card-label)',
}

export interface MoodReadingProps {
  /** The step the session recorded, or null when the debrief went unanswered. */
  step: MoodStep | null
  /** What an unanswered mood reads as. The screen owns the wording. */
  unansweredLabel?: string
}

/**
 * How a session's mood reads back. The unanswered case is a sentence rather
 * than a blank or a middle face: a debrief nobody filled in is a fact about the
 * session, and a neutral `Meh` would be the app answering on the user's behalf.
 */
export function MoodReading({
  step,
  unansweredLabel = 'Not recorded',
}: MoodReadingProps) {
  if (step === null) {
    return <span style={{ ...READING_STYLE, ...SCALE_STYLE }}>{unansweredLabel}</span>
  }

  const Icon = MOOD_ICONS[step.glyph]

  return (
    <span style={READING_STYLE}>
      {/* The glyph ships aria-hidden; the word beside it is the accessible one. */}
      <Icon size={20} />
      {step.label}
      <span style={SCALE_STYLE}>
        {step.value} of {MOOD_MAX}
      </span>
    </span>
  )
}
