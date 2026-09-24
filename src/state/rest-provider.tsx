/**
 * EXE-05 — the session's one rest, as a component.
 *
 * The split is `set-logging-provider.tsx`'s: `rest.ts` is the vocabulary and the
 * arithmetic, and this is the half that holds state. One rest at a time, owned
 * by the shell, for the same reason the set write and the block result are —
 * two rest bars disagreeing about the same rest is a defect the architecture can
 * refuse rather than a bug to be found.
 *
 * What it owns:
 *
 *   · **The period.** A start stamps the wall clock; extending moves the end;
 *     skipping drops it. Nothing counts down a stored number.
 *   · **The replacement rule.** A set logged while a rest runs replaces it. The
 *     user is resting after the set they just finished, and a queue of rests
 *     would have them resting after one they finished two minutes ago.
 *   · **Nothing persisted.** A rest is not a row. A refresh mid-rest loses the
 *     countdown and not one thing the session recorded — which is the right
 *     trade: `rest_seconds` is a prescription, and how long the user actually
 *     stood there is not a measurement this app claims to make.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react'

import {
  extendRest,
  RestTimerContext,
  useRestRemaining,
  type RestPeriod,
  type RestTimerApi,
} from './rest'

export interface RestTimerProviderProps {
  /**
   * The clock the rest is measured against, injectable so a test can move time
   * without moving the machine's. The same seam `useElapsedSeconds` offers.
   */
  now?: () => number
  children: ReactNode
}

export function RestTimerProvider({ now = Date.now, children }: RestTimerProviderProps) {
  const [rest, setRest] = useState<RestPeriod | null>(null)
  const remainingSeconds = useRestRemaining(rest, now)

  const start = useCallback<RestTimerApi['start']>(
    ({ exerciseId, label, seconds }) => {
      if (!Number.isFinite(seconds) || seconds <= 0) return

      setRest({
        exerciseId,
        label,
        startedAt: now(),
        totalSeconds: Math.floor(seconds),
      })
    },
    [now],
  )

  const extend = useCallback<RestTimerApi['extend']>((by) => {
    setRest((current) => {
      if (current === null) return null
      return by === undefined ? extendRest(current) : extendRest(current, by)
    })
  }, [])

  const skip = useCallback(() => {
    setRest(null)
  }, [])

  const api = useMemo<RestTimerApi>(
    () => ({ rest, remainingSeconds, start, extend, skip }),
    [extend, remainingSeconds, rest, skip, start],
  )

  return <RestTimerContext value={api}>{children}</RestTimerContext>
}
