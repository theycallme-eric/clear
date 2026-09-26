/**
 * FAV-01 — what `/review` is handed, and why it is parsed on arrival.
 *
 * A favorite restart carries a whole composed workout from Home to Review
 * without writing anything first: the snapshot *is* the acceptance payload, and
 * Review's Start is what turns it into rows. The carrier is React Router's
 * history state, which puts the payload outside this app's trust boundary —
 * `history.pushState` is a public API, a user can edit an entry, and a restored
 * back/forward entry survives both a reload and a deploy.
 *
 * So the hand-off is a boundary like any other read: `reviewHandoffSchema`
 * (in `schemas.ts`, where every contract lives) describes it, this module reads
 * it, and a state that does not parse is "there is no workout to review" rather
 * than a screen rendering half a session.
 *
 * `savedWorkoutId` is what makes a completion attributable. Review's Start
 * writes the session; the attempt row written beside it is the only record that
 * this session came from that favorite, which is what
 * `record_favorite_completion` later stamps. A hand-off with no id is a plain
 * review of a composition that belongs to nothing — which is what a *generated*
 * workout will be when REV-01 routes one through here.
 */
import type { Result } from './errors'
import {
  parseBoundary,
  reviewHandoffSchema,
  type ReviewHandoff,
  type SessionAcceptance,
} from './schemas'

export type { ReviewHandoff }

/** The acceptance a favorite restart carries, as route state. */
export function reviewHandoff(
  acceptance: SessionAcceptance,
  savedWorkoutId: string | null = null,
): ReviewHandoff {
  return { acceptance, savedWorkoutId }
}

/**
 * The hand-off a `/review` entry carries, or `null` when it carries none.
 *
 * `null` rather than a typed error: an absent or unreadable history state is
 * not a failure the user can retry, it is the absence of a workout to review,
 * and the screen answers it by naming the two ways to get one.
 */
export function readReviewHandoff(state: unknown): ReviewHandoff | null {
  const parsed: Result<ReviewHandoff> = parseBoundary(reviewHandoffSchema, state)
  return parsed.ok ? parsed.value : null
}
