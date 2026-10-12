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
 *
 * The frame is the shared readout's, `MetricFrame`: one small element frame
 * where the score stands in a dialog, and a bare readout wherever a card
 * already surrounds it — so the score is never a floating line and never a
 * card inside a card.
 */
import type { CSSProperties } from 'react'

import type {
  ComparisonAbsence,
  ConditioningScore,
  ScoreComparison,
} from '../state/conditioning'
import { MetricFrame } from './composition'

/** The score itself: the data face, as every other readout's value is. */
const SCORE_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-data)',
  letterSpacing: 'var(--tracking-data)',
}

/** The comparison, or its absence: context for the score, and quieter than it. */
const CONTEXT_STYLE: CSSProperties = { margin: 0, color: 'var(--text-secondary)' }

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
    <MetricFrame>
      <p style={SCORE_STYLE}>
        {/*
          The rate, named. "8.4 reps/min" on its own is a number looking for a
          question, and the label is what makes it an answer.
        */}
        {scoreTitle(score)}: {score.label}
        {score.completedUnderCap === false ? ' · cap reached' : ''}
      </p>
      {comparison !== null ? (
        <p style={CONTEXT_STYLE}>
          {comparison.label} · {DIRECTION_WORDS[comparison.direction]}
        </p>
      ) : absence !== null ? (
        <p style={CONTEXT_STYLE}>{ABSENCE_WORDS[absence]}</p>
      ) : null}
    </MetricFrame>
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
