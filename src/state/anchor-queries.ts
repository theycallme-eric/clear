/**
 * OVR-01c — the anchor reads, as queries keyed by `user.id`.
 *
 * Two entries rather than one, because they are two different answers with two
 * different lifetimes: `load_anchors` is what the last completion derived, and
 * `anchor_evidence` is the set history it was derived from. Review needs both —
 * the anchor for the number, the evidence for the session the rule was read from
 * — and a screen that only wanted to know whether a suggestion exists should not
 * have to fetch every working set the user has ever logged to find out.
 *
 * `enabled` is how a screen with no business asking declines to, the same lever
 * `useActiveSessionQuery` and `useConditioningHistoryQuery` offer. Review asks;
 * nothing else needs to yet.
 */
import { useCallback } from 'react'

import { useAuth } from './auth-context'
import { createError, err, ErrorCode, type Result } from './errors'
import { useQuery, type QueryResult } from './query'
import type { AnchorEvidenceRow, LoadAnchorRow } from './schemas'
import { useWorkoutClients } from './workout-queries'

export function loadAnchorsQueryKey(userId: string): string {
  return `load-anchors:${userId}`
}

export function anchorEvidenceQueryKey(userId: string): string {
  return `anchor-evidence:${userId}`
}

export type LoadAnchorsQuery = QueryResult<LoadAnchorRow[]>
export type AnchorEvidenceQuery = QueryResult<AnchorEvidenceRow[]>

/** The user's stored anchors, as the last recomputation left them. */
export function useLoadAnchorsQuery(enabled = true): LoadAnchorsQuery {
  const { user } = useAuth()
  const { anchors } = useWorkoutClients()

  const userId = enabled ? (user?.id ?? null) : null
  const key = userId === null ? null : loadAnchorsQueryKey(userId)

  return useQuery(
    key,
    useCallback(
      () => (userId === null ? signedOut<LoadAnchorRow[]>() : anchors.list(userId)),
      [anchors, userId],
    ),
  )
}

/** Every working set that may move an anchor — §2's read, and the dialog's. */
export function useAnchorEvidenceQuery(enabled = true): AnchorEvidenceQuery {
  const { user } = useAuth()
  const { anchors } = useWorkoutClients()

  const userId = enabled ? (user?.id ?? null) : null
  const key = userId === null ? null : anchorEvidenceQueryKey(userId)

  return useQuery(
    key,
    useCallback(
      () => (userId === null ? signedOut<AnchorEvidenceRow[]>() : anchors.evidence(userId)),
      [anchors, userId],
    ),
  )
}

function signedOut<T>(): Promise<Result<T>> {
  return Promise.resolve(err(createError(ErrorCode.AUTH_UNAUTHENTICATED)))
}
