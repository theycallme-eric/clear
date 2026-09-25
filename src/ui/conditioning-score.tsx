/**
 * OVR-03 — the score a timed block earned, and the comparison only when there
 * is one to make.
 *
 * Two lines, and the second one is the requirement: **the comparison appears
 * only on identical repeats, never across differently-generated pieces**. That
 * rule is enforced where it can be tested — `previousBest` answers null unless
 * the fingerprints match — and this component's whole contribution is to render
 * nothing when it did. A view that showed "no previous best" would be making a
 * claim about history; §3(a) asks for silence instead.
 *
 * Colour is not a cue here at all. Ahead, level and behind are *words*, so the
 * direction survives a monochrome skin, a screen reader and a photograph of a
 * phone in the sun.
 */
import type { ConditioningScore, ScoreComparison } from '../state/conditioning'

/** What each direction says, in words rather than in a colour or an arrow. */
const DIRECTION_WORDS: Readonly<Record<ScoreComparison['direction'], string>> = {
  ahead: 'Ahead of your previous best',
  level: 'Level with your previous best',
  behind: 'Behind your previous best',
}

export interface ConditioningScoreLineProps {
  /** The normalized score, or null for a block §3 does not score. */
  score: ConditioningScore | null
  /** The like-for-like comparison, or null — which is the common case. */
  comparison?: ScoreComparison | null
}

export function ConditioningScoreLine({
  score,
  comparison = null,
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
      {comparison === null ? null : (
        <p style={{ margin: 0 }}>
          {comparison.label} · {DIRECTION_WORDS[comparison.direction]}
        </p>
      )}
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
