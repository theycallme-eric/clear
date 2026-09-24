/**
 * EXE-01 — the active session, as a query every screen can ask about.
 *
 * `resume_session` is the database's own answer to "is this user mid-workout",
 * and it answers with the whole snapshot rather than an id, so one read serves
 * both callers: the workout shell, which needs the structure, and everything
 * else, which needs to know only that it exists. Keyed by `user.id` for the
 * same reason the profile is (AUTH-03) — a rotated token is not a new user, so
 * a refresh costs nothing.
 *
 * `null` is a real answer, not a failure: most of the time nobody is
 * mid-workout, and a screen must be able to tell "no active session" from "the
 * question could not be asked". That distinction is what makes the deep-link
 * prompt safe — a failed read must never abandon anybody's session by silence.
 */
import { createContext, use, useCallback } from 'react'

import type { WorkoutClients } from '../data/workout'
import { useAuth } from './auth-context'
import { createError, err, ErrorCode, type Result } from './errors'
import { useQuery, useQueryClient, type QueryResult } from './query'
import type { SessionSnapshot } from './schemas'

export const WorkoutClientsContext = createContext<WorkoutClients | null>(null)

export function useWorkoutClients(): WorkoutClients {
  const clients = use(WorkoutClientsContext)
  if (clients === null) {
    throw new Error('useWorkoutClients was called outside <WorkoutClientsContext>')
  }
  return clients
}

export function activeSessionQueryKey(userId: string): string {
  return `active-session:${userId}`
}

export interface ActiveSessionQuery extends QueryResult<SessionSnapshot | null> {
  /**
   * Publishes a snapshot the caller already has — the answer a transition just
   * returned. Completing and abandoning both end with one, and re-reading the
   * row to learn what the write already said is a round trip for nothing.
   */
  publish(snapshot: SessionSnapshot | null): void
}

/**
 * The user's resumable session. `enabled` is how a screen with no business
 * asking declines to — the public-only guard's reasoning, applied again.
 */
export function useActiveSessionQuery(enabled = true): ActiveSessionQuery {
  const { user } = useAuth()
  const { sessions } = useWorkoutClients()
  const cache = useQueryClient()
  const userId = enabled ? (user?.id ?? null) : null
  const key = userId === null ? null : activeSessionQueryKey(userId)

  const query = useQuery(
    key,
    useCallback(
      () =>
        userId === null
          ? signedOut<SessionSnapshot | null>()
          : sessions.resume(userId),
      [sessions, userId],
    ),
  )

  const publish = useCallback(
    (snapshot: SessionSnapshot | null) => {
      if (key !== null) cache.setData(key, snapshot)
    },
    [cache, key],
  )

  return { ...query, publish }
}

/**
 * Whether a snapshot is a session the user is *in* — started, and neither
 * finished nor abandoned. A `prescribed` session belongs to Review, not to the
 * shell, and it is not what the focus-mode trap is about.
 */
export function isActiveSession(snapshot: SessionSnapshot | null): boolean {
  return snapshot !== null && snapshot.state === 'active'
}

function signedOut<T>(): Promise<Result<T>> {
  return Promise.resolve(err(createError(ErrorCode.AUTH_UNAUTHENTICATED)))
}
