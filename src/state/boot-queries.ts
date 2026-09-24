/**
 * REQ-057 — the boot sequence bound to the app's real initialization.
 *
 * Each of `boot.ts`'s four checks is one of the queries the app runs anyway:
 * AUTH-03's profile and locations, HIST-01's first page of history, and
 * DATA-05's constraints in force. Nothing here starts a read that exists only
 * to be watched — every one of them lands in the shared cache, so the screen
 * that wanted it afterwards reads it rather than asking again. That is the
 * whole of "boot steps mirror real init promises": remove the boot screen and
 * exactly the same requests happen, in the same order, taking the same time.
 *
 * A visitor with no session initializes nothing. `status` settling to
 * `anonymous` — or to `error`, which is a question AUTH-03's guard asks on the
 * route that needs an answer — completes boot immediately, and the router takes
 * it from there.
 *
 * `retry` re-runs only what failed. A retry that re-read everything would make
 * the successful checks flicker back to pending, which would be the boot screen
 * lying about work it already has in hand.
 */
import { useCallback } from 'react'

import { useAuth } from './auth-context'
import {
  BOOT_STEPS,
  bootView,
  constraintsDetail,
  equipmentDetail,
  historyDetail,
  profileDetail,
  type BootCheck,
  type BootView,
} from './boot'
import { useConstraintsQuery } from './constraint-queries'
import { useHistoryQuery } from './history-queries'
import type { QueryState } from './query'
import { useLocationsQuery, useProfileQuery } from './user-queries'

export interface AppBoot {
  readonly view: BootView
  /** Runs the failed check again. Pattern 3's one recovery action. */
  retry(): void
}

/** One query's state as a boot check, with the row it produced when it is done. */
function checkFrom<T>(state: QueryState<T>, detail: (data: T) => string): BootCheck {
  switch (state.status) {
    case 'loading':
      return { status: 'checking' }
    case 'error':
      return { status: 'failed', error: state.error }
    case 'ready':
      return { status: 'done', detail: detail(state.data) }
  }
}

export function useAppBoot(): AppBoot {
  const { status } = useAuth()
  // Only a signed-in visitor has any of this to read. The queries are disabled
  // rather than skipped, so the hooks below are unconditional and a session
  // that settles mid-boot starts them without a remount.
  const initializing = status === 'authenticated'

  const profile = useProfileQuery(initializing)
  const history = useHistoryQuery(initializing)
  const locations = useLocationsQuery(initializing)
  const constraints = useConstraintsQuery(initializing)

  const retry = useCallback(() => {
    for (const query of [profile, history, locations, constraints]) {
      if (query.state.status === 'error') query.refetch()
    }
  }, [profile, history, locations, constraints])

  if (!initializing) {
    // Nothing to initialize. `loading` is the session restore, which is work
    // the boot screen is honestly waiting on; anything else is settled.
    return {
      view:
        status === 'loading'
          ? { status: 'checking', lines: [], value: 0, max: BOOT_STEPS.length }
          : { status: 'ready' },
      retry,
    }
  }

  return {
    view: bootView({
      profile: checkFrom(profile.state, profileDetail),
      history: checkFrom(history.state, historyDetail),
      equipment: checkFrom(locations.state, equipmentDetail),
      constraints: checkFrom(constraints.state, constraintsDetail),
    }),
    retry,
  }
}
