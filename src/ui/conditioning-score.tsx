/**
 * OVR-03 — the score a timed block earned, and the comparison only when there
 * is one to make.
 *
 * Two lines, and the second one is the requirement: **the comparison appears
 * only on identical repeats, never across differently-generated pieces**. That
 * rule is enforced where it can be tested — `previousBest` answers null unless
 * the fingerprints match — and this component's whole contribution is to render
 * no comparison when it did. What it may say instead is only what the history
 * that *was* read supports: that this is the first attempt at the piece, or that
 * the earlier pieces are different ones and there is nothing like-for-like to
 * compare. With no history in hand (`absence` null) it says nothing — a claim
 * about rows nobody read is the false comparison §3(a) forbids.
 *
 * Colour is not a cue here at all. Ahead, level and behind are *words*, so the
 * direction survives a monochrome skin, a screen reader and a photograph of a
 * phone in the sun.
 */
import type {
  ComparisonAbsence,
  ConditioningScore,
  ScoreComparison,
} from '../state/conditioning'

/** What each direction says, in words rather than in a colour or an arrow. */
const DIRECTION_WORDS: Readonly<Record<ScoreComparison['direction'], string>> = {
  ahead: 'Ahead of your previous best',
  level: 'Level with your previous best',
  behind: 'Behind your previous best',
}

/** Why there is no comparison, said once and plainly. */
export const ABSENCE_WORDS: Readonly<Record<ComparisonAbsence, string>> = {
  first_attempt: 'First attempt at this piece — no previous attempt to compare against',
  different_composition:
    'Nothing like-for-like to compare — this piece differs from your earlier attempts',
}

export interface ConditioningScoreLineProps {
  /** The normalized score, or null for a block §3 does not score. */
  score: ConditioningScore | null
  /** The like-for-like comparison, or null — which is the common case. */
  comparison?: ScoreComparison | null
  /**
   * Why there is no comparison, when the history answered and gave a reason.
   * Ignored while there is a comparison; null says nothing.
   */
  absence?: ComparisonAbsence | null
}

export function ConditioningScoreLine({
  score,
  comparison = null,
  absence = null,
}: ConditioningScoreLineProps) {
  if (score === null) return null

  return (
    <div className="clr-stack--tight" style={{ display: 'flex', flexDirection: 'column' }}>
      <p style={{ margin: 0 }}>
        {/*
          The rate, named. "8.4 reps/min" on its own is a number looking for a
          question, and the label is what makes it an answer.
        */}
        {scoreTitle(score)}: {score.label}
        {score.completedUnderCap === false ? ' · cap reached' : ''}
      </p>
      {comparison !== null ? (
        <p style={{ margin: 0 }}>
          {comparison.label} · {DIRECTION_WORDS[comparison.direction]}
        </p>
      ) : absence !== null ? (
        <p style={{ margin: 0 }}>{ABSENCE_WORDS[absence]}</p>
      ) : null}
    </div>
  )
}

/** What the number is, per format — a rate, a survival, or a rung. */
export function scoreTitle(score: ConditioningScore): string {
  switch (score.unit) {
    case 'reps_per_minute':
      return 'Score'
    case 'completion_ratio':
      return 'Completed'
    case 'rung':
      return 'Reached'
  }
}
