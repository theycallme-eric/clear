/**
 * OVR-04 — where an answer to a deload suggestion is kept.
 *
 * §4 asks for two things that outlive the screen: a dismissal that lasts three
 * sessions, and an override that is *logged* rather than merely obeyed. Both are
 * records of what the user said, so both are written down — here, in
 * `localStorage`, keyed by user.
 *
 * **Why not a table.** There is no column anywhere in the schema for "the user
 * declined a suggestion", and inventing one is a data requirement (DATA-01's)
 * rather than this one's. What the database *does* record is the consequence:
 * an applied deload becomes `workout_sessions.is_deload`, which is durable,
 * shared across devices and already excluded from anchor evidence. What is local
 * is the part that only exists to stop a banner nagging on this device — and a
 * snooze that is lost when the browser storage is cleared costs the user one
 * banner, not one workout. That trade is stated here so the next reader does not
 * have to guess it was considered; the journal records it as an assumption.
 *
 * The log is capped and append-only within the cap. Its purpose is the one §4
 * gives it — "Log the override; don't fight it" — so a later reader can see that
 * the same suggestion was declined five times, which is evidence about the
 * suggestion rather than about the user.
 *
 * No zod. CORE-03's rule is that a payload crossing a *process* boundary is
 * parsed in `schemas.ts`; this crosses none, and its own previous write is the
 * only thing that produces it (`workout-persistence.ts` makes the same call).
 */
import { useCallback, useState } from 'react'

import type { DeloadDecision, DeloadDecisionKind, DeloadTriggerId } from './deload'

/** One key for every user on the device; the record inside is keyed by user. */
export const DELOAD_DECISIONS_STORAGE_KEY = 'clear.deload-decisions'

/**
 * How many decisions are kept per user. Three sessions of snooze needs one; the
 * rest are the log, and a log that grows forever in `localStorage` is a leak
 * with a pleasant name.
 */
export const DELOAD_DECISIONS_LIMIT = 20

/** The subset of `Storage` this module uses; injectable, so a test owns it. */
export interface DecisionStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * `localStorage`, or nothing. Safari in private mode throws on access, and an
 * app that cannot remember a dismissal is still a working app — it asks again.
 */
export function defaultDecisionStorage(): DecisionStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const TRIGGER_IDS: readonly DeloadTriggerId[] = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6']
const KINDS: readonly DeloadDecisionKind[] = ['applied', 'dismissed']

function isDecision(value: unknown): value is DeloadDecision {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>

  return (
    typeof record.key === 'string' &&
    record.key !== '' &&
    typeof record.trigger === 'string' &&
    TRIGGER_IDS.includes(record.trigger as DeloadTriggerId) &&
    typeof record.decision === 'string' &&
    KINDS.includes(record.decision as DeloadDecisionKind) &&
    typeof record.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(record.date)
  )
}

/** Every decision this user has recorded, newest last. Absent reads as none. */
export function readDeloadDecisions(
  storage: DecisionStorage | null,
  userId: string,
): readonly DeloadDecision[] {
  if (storage === null) return []

  let raw: string | null
  try {
    raw = storage.getItem(DELOAD_DECISIONS_STORAGE_KEY)
  } catch {
    return []
  }
  if (raw === null) return []

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return []

    const forUser = (parsed as Record<string, unknown>)[userId]
    if (!Array.isArray(forUser)) return []

    // Malformed entries are dropped one at a time rather than the record being
    // discarded whole: a record half-written by an older shape still holds
    // answers the user gave, and the snooze is the thing worth keeping.
    return forUser.filter(isDecision)
  } catch {
    return []
  }
}

/** Appends one decision and answers the list as it now stands. */
export function recordDeloadDecision(
  storage: DecisionStorage | null,
  userId: string,
  decision: DeloadDecision,
): readonly DeloadDecision[] {
  const next = [...readDeloadDecisions(storage, userId), decision].slice(
    -DELOAD_DECISIONS_LIMIT,
  )
  if (storage === null) return next

  let existing: Record<string, unknown> = {}
  try {
    const raw = storage.getItem(DELOAD_DECISIONS_STORAGE_KEY)
    const parsed: unknown = raw === null ? {} : JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) {
      existing = parsed as Record<string, unknown>
    }
  } catch {
    existing = {}
  }

  try {
    storage.setItem(
      DELOAD_DECISIONS_STORAGE_KEY,
      JSON.stringify({ ...existing, [userId]: next }),
    )
  } catch {
    // A full or refused quota costs a snooze, never a workout.
  }

  return next
}

export interface DeloadDecisions {
  readonly decisions: readonly DeloadDecision[]
  /** Records an answer, and republishes the list without re-reading storage. */
  record(decision: DeloadDecision): void
}

/**
 * The decisions for one user, as a screen holds them.
 *
 * Read once on mount rather than on every render: storage is synchronous and
 * this is a screen that renders on every keystroke of the notes field. The
 * lazy initialiser is what keeps that read out of the render path after the
 * first, and `record` publishes what it just wrote so no second read is needed.
 */
export function useDeloadDecisions(
  userId: string | null,
  storage: DecisionStorage | null = defaultDecisionStorage(),
): DeloadDecisions {
  const [decisions, setDecisions] = useState<readonly DeloadDecision[]>(() =>
    userId === null ? [] : readDeloadDecisions(storage, userId),
  )

  const record = useCallback(
    (decision: DeloadDecision) => {
      if (userId === null) return
      setDecisions(recordDeloadDecision(storage, userId, decision))
    },
    [storage, userId],
  )

  return { decisions, record }
}
