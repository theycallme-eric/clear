/**
 * TASK-022 — the session's preparation clocks, as a component.
 *
 * `preparation-clock.ts` is the vocabulary and the arithmetic; this holds the
 * state, at the shell, so a Warm-up's clock and a Cooldown's are each one clock
 * for the whole session: leaving the section and coming back finds it as it
 * was. Nothing here persists and nothing here writes.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react'

import type { CountdownState } from './movement-countdown'
import { PreparationClockContext, type PreparationClockStore } from './preparation-clock'

export function PreparationClockProvider({ children }: { children: ReactNode }) {
  const [clocks, setClocks] = useState<ReadonlyMap<string, CountdownState>>(() => new Map())

  const update = useCallback<PreparationClockStore['update']>((key, initial, change) => {
    setClocks((current) => new Map(current).set(key, change(current.get(key) ?? initial)))
  }, [])

  const store = useMemo<PreparationClockStore>(() => ({ clocks, update }), [clocks, update])

  return <PreparationClockContext value={store}>{children}</PreparationClockContext>
}
