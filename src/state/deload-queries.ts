/**
 * OVR-04 — the reads behind the banner, and the answer they compose into.
 *
 * Two queries, both already owned by somebody else: `anchor_evidence(...)`
 * (OVR-01a) for the working sets D1, D2, D3 and D5 read, and HIST-01's session
 * page for the intensities D4 and D6 read. Nothing new is fetched, and nothing
 * is derived twice — §4's triggers are a function of the same rows an anchor is.
 *
 * **Silence is the failure state.** A suggestion is unsolicited by definition, so
 * a history that has not loaded, a read that refused, or a signed-out caller all
 * answer `null` rather than a skeleton or an error region. The Generate screen's
 * four states belong to the *form* — its places load, fail and come back — and a
 * banner that announced its own loading would be an app apologising for advice
 * nobody asked for. `conditioningRowsOf` makes the same call one requirement
 * over, and for the same reason: no claim is better than a false one.
 */
import { useCallback, useMemo } from 'react'

import { useAuth } from './auth-context'
import { useDeloadDecisions, type DecisionStorage } from './deload-decisions'
import {
  decisionFor,
  deloadSessionReads,
  deloadSuggestion,
  type DeloadDecisionKind,
  type DeloadSuggestion,
} from './deload'
import { createError, err, ErrorCode, type Result } from './errors'
import { useHistoryQuery } from './history-queries'
import { useQuery, type QueryResult } from './query'
import type { AnchorEvidenceRow } from './schemas'
import { useWorkoutClients } from './workout-queries'

export function anchorEvidenceQueryKey(userId: string): string {
  return `anchor-evidence:${userId}`
}

export type AnchorEvidenceQuery = QueryResult<AnchorEvidenceRow[]>

/** Every working set in this user's history that may move an anchor. */
export function useAnchorEvidenceQuery(enabled = true): AnchorEvidenceQuery {
  const { user } = useAuth()
  const { anchors } = useWorkoutClients()

  const userId = enabled ? (user?.id ?? null) : null
  const key = userId === null ? null : anchorEvidenceQueryKey(userId)

  return useQuery(
    key,
    useCallback(
      () =>
        userId === null
          ? Promise.resolve(
              err(createError(ErrorCode.AUTH_UNAUTHENTICATED)) as Result<
                AnchorEvidenceRow[]
              >,
            )
          : anchors.evidence(userId),
      [anchors, userId],
    ),
  )
}

export interface DeloadBanner {
  /** What to say, or null when there is nothing to say. */
  readonly suggestion: DeloadSuggestion | null
  /** Records the user's answer. Nothing else in the app writes a decision. */
  answer(decision: DeloadDecisionKind): void
}

/**
 * §4's banner state for the Generate screen.
 *
 * `today` is the caller's rather than this module's: the user's own calendar
 * draws the day boundary, which is SES-01c's reasoning applied once more, and it
 * is what makes this hook testable without a clock.
 */
export function useDeloadBanner(
  today: string,
  options: { readonly enabled?: boolean; readonly storage?: DecisionStorage | null } = {},
): DeloadBanner {
  const { user } = useAuth()
  const enabled = options.enabled ?? true

  const evidence = useAnchorEvidenceQuery(enabled)
  const history = useHistoryQuery(enabled)
  const { decisions, record } = useDeloadDecisions(
    enabled ? (user?.id ?? null) : null,
    options.storage,
  )

  const suggestion = useMemo(() => {
    if (evidence.state.status !== 'ready' || history.state.status !== 'ready') return null

    return deloadSuggestion({
      evidence: evidence.state.data,
      sessions: deloadSessionReads(history.state.data.sessions),
      today,
      decisions,
    })
  }, [decisions, evidence.state, history.state, today])

  const answer = useCallback(
    (decision: DeloadDecisionKind) => {
      if (suggestion === null) return
      record(decisionFor(suggestion, decision, today))
    },
    [record, suggestion, today],
  )

  return { suggestion, answer }
}
