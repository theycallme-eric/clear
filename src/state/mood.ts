/**
 * The mood scale, once.
 *
 * `workout_sessions.mood` is 1–5 (`workout_sessions_mood_range`), and two
 * screens read it: SUM-01 asks for it and HIST-01's detail reports what was
 * asked. A scale written twice is a scale that will disagree with itself — a
 * `4` captioned *Ready* on one screen and *Good* on the other is the same row
 * described two ways — so the words live here and the screens read them.
 *
 * The glyph is named rather than imported, the way `StructureGlyph` is: this
 * module stays free of React so it can be read by anything, and the one place
 * a name becomes a component is `src/ui/mood.tsx`.
 */

/** The shipped Mood glyphs this scale uses (ATOMIC.md §6). */
export type MoodGlyph = 'ThumbsDown' | 'Frown' | 'Meh' | 'Smile' | 'SmilePlus'

export interface MoodStep {
  /** What the column stores: 1–5, worst to best. */
  readonly value: number
  /** The word beside the glyph. Colour and face are never the only cue. */
  readonly label: string
  readonly glyph: MoodGlyph
}

/**
 * 1–5, worst to best. The four middle words are the design export's own
 * (`DebriefScreen`, `MOODS`); `Spent` is the fifth the stored range needs —
 * the column is 1 to 5, not 1 to 4.
 */
export const MOOD_SCALE: readonly MoodStep[] = [
  { value: 1, label: 'Spent', glyph: 'ThumbsDown' },
  { value: 2, label: 'Worn', glyph: 'Frown' },
  { value: 3, label: 'Flat', glyph: 'Meh' },
  { value: 4, label: 'Ready', glyph: 'Smile' },
  { value: 5, label: 'Peak', glyph: 'SmilePlus' },
]

/** The lowest and highest the scale goes, for anything that reads it as a range. */
export const MOOD_MIN = 1
export const MOOD_MAX = 5

/**
 * The step a stored mood is, or `null` when there is none to read.
 *
 * Null is the common case and not a failure: mood is optional at the debrief,
 * and a session with none recorded is a session the user did not answer for.
 * A value outside the range is also `null` rather than a clamp — the database
 * refuses those, so one arriving here is a read to report, not a rating to
 * round into the scale.
 */
export function moodStep(value: number | null): MoodStep | null {
  if (value === null) return null
  return MOOD_SCALE.find((step) => step.value === value) ?? null
}
