/**
 * AUTH-03 — the app's query cache, and the hook that reads it.
 *
 * The requirement asks for "independent React Query queries keyed by
 * `user.id`". There is no `@tanstack/react-query` in this repository and
 * installing one was not available here, so this follows the precedent AUTH-01
 * set for `supabase-js`: bring the *shape* the requirement names, not the
 * package. What that shape has to be is fixed by `auth-context.ts`, which
 * already declared the seam — `QueryCache { clear(): void }`, the one method
 * sign-out needs, which a real `QueryClient` satisfies structurally. Swapping
 * this module for the library is a change to `main.tsx` and these hooks, and to
 * nothing that consumes them.
 *
 * Four behaviours are the requirement rather than convenience, and each is
 * tested in `query.test.ts`:
 *
 *   * **One fetch per key.** `ensure` is idempotent, so two components reading
 *     the same key share one request and a re-render starts none. This is what
 *     makes a token refresh cost nothing: the key is `user.id`, the id does not
 *     change when the token does, so nothing re-runs. That was defect D1's
 *     refetch storm.
 *   * **Failure is a value.** A rejected fetch is an `AppError` in the entry,
 *     never an empty success — a guard can therefore tell "no profile" from
 *     "the profile did not load", which is the other half of D1.
 *   * **Stale results are dropped.** Every run carries a generation; a response
 *     from a superseded run (a retry, or a sign-out mid-flight) is discarded
 *     rather than published over a newer one.
 *   * **`clear()` empties everything.** Sign-out must not leave the next user
 *     reading the last one's rows.
 */
import { createContext, use, useCallback, useEffect, useSyncExternalStore } from 'react'

import { isErr, type AppError, type Result } from './errors'

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Three states, not four: `empty` is a view's judgement about data it has, and
 * only the view knows whether none is normal. `src/ui/view-state.tsx` maps
 * these onto the CORE-04 contract at the point where that judgement exists.
 */
export type QueryState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: AppError }
  | { readonly status: 'ready'; readonly data: T }

/**
 * One shared instance, so `useSyncExternalStore` sees a stable snapshot for
 * every key that has not resolved and cannot loop.
 */
const LOADING: QueryState<never> = { status: 'loading' }

export interface QueryResult<T> {
  readonly state: QueryState<T>
  /** Re-runs the fetch for this key. The retry action on an error screen. */
  refetch(): void
}

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

interface Entry {
  state: QueryState<unknown>
  readonly listeners: Set<() => void>
  /** Bumped on every run; a resolution from an older generation is dropped. */
  generation: number
  /** True once a run has been started and not invalidated since. */
  started: boolean
}

export class QueryClient {
  readonly #entries = new Map<string, Entry>()

  /**
   * Entries are created on subscribe and never removed — only reset. A
   * component holds its entry's listener set for as long as it is mounted, so
   * deleting the entry under it would silently orphan the subscription. The map
   * is bounded by the number of distinct keys the app uses, which is small.
   */
  #entry(key: string): Entry {
    const existing = this.#entries.get(key)
    if (existing !== undefined) return existing

    const created: Entry = {
      state: LOADING,
      listeners: new Set(),
      generation: 0,
      started: false,
    }
    this.#entries.set(key, created)
    return created
  }

  #publish(entry: Entry, state: QueryState<unknown>): void {
    entry.state = state
    for (const listener of [...entry.listeners]) listener()
  }

  #run<T>(entry: Entry, fetcher: () => Promise<Result<T>>): void {
    entry.started = true
    entry.generation += 1
    const generation = entry.generation

    void fetcher().then(
      (result) => {
        if (entry.generation !== generation) return
        this.#publish(
          entry,
          isErr(result)
            ? { status: 'error', error: result.error }
            : { status: 'ready', data: result.value },
        )
      },
      // A fetcher in this codebase answers `Result` and does not throw. If one
      // ever does, the entry must not be left loading forever — but inventing
      // an `AppError` here would guess at a code, so the run is abandoned and
      // the throw is re-raised as an unhandled rejection where it is visible.
      (reason: unknown) => {
        if (entry.generation === generation) entry.started = false
        throw reason
      },
    )
  }

  /** The current state for a key, without subscribing. */
  getState<T>(key: string): QueryState<T> {
    return (this.#entries.get(key)?.state ?? LOADING) as QueryState<T>
  }

  subscribe(key: string, listener: () => void): () => void {
    const entry = this.#entry(key)
    entry.listeners.add(listener)
    return () => {
      entry.listeners.delete(listener)
    }
  }

  /**
   * Starts the fetch for `key` unless one has already run. Called on every
   * render pass of every reader, and a no-op on all but the first — that is
   * the whole defence against a refetch storm.
   */
  ensure<T>(key: string, fetcher: () => Promise<Result<T>>): void {
    const entry = this.#entry(key)
    if (entry.started) return
    this.#run(entry, fetcher)
  }

  /** Drops what is cached for `key` and fetches again. */
  refetch<T>(key: string, fetcher: () => Promise<Result<T>>): void {
    const entry = this.#entry(key)
    this.#publish(entry, LOADING)
    this.#run(entry, fetcher)
  }

  /** Seeds a key as already resolved, without a fetch. */
  setData<T>(key: string, data: T): void {
    const entry = this.#entry(key)
    entry.started = true
    entry.generation += 1
    this.#publish(entry, { status: 'ready', data })
  }

  /**
   * Empties the cache — AUTH-01's `QueryCache` port, called by `signOut`.
   *
   * Bumping every generation is the part that matters: a request that was
   * already in flight when the session ended resolves into a discarded
   * generation and can never be published to the next user.
   */
  clear(): void {
    for (const entry of this.#entries.values()) {
      entry.generation += 1
      entry.started = false
      this.#publish(entry, LOADING)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

export const QueryClientContext = createContext<QueryClient | null>(null)

export function useQueryClient(): QueryClient {
  const client = use(QueryClientContext)
  if (client === null) {
    throw new Error('useQueryClient was called outside <QueryClientContext>')
  }
  return client
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads `key` from the cache, starting its fetch the first time anyone asks.
 *
 * `key` is `null` for a query that has nothing to ask for yet — no signed-in
 * user, or a guard that has no business reading this data. A disabled query
 * reports `loading` and touches neither the cache nor the network.
 *
 * `fetcher` must be stable across renders (`useCallback`); its identity is the
 * effect's dependency, so an unstable one would re-run the effect on every
 * render. `ensure` would still refuse to refetch, but the wasted work would
 * hide a real mistake, so the contract is stated rather than defended against.
 */
export function useQuery<T>(
  key: string | null,
  fetcher: () => Promise<Result<T>>,
): QueryResult<T> {
  const client = useQueryClient()

  const state = useSyncExternalStore(
    useCallback(
      (onChange: () => void) => (key === null ? () => {} : client.subscribe(key, onChange)),
      [client, key],
    ),
    useCallback(
      () => (key === null ? (LOADING as QueryState<T>) : client.getState<T>(key)),
      [client, key],
    ),
  )

  // `state` is a dependency so that a `clear()` — which resets a resolved entry
  // back to `loading` — starts the query again for a reader that is still
  // mounted. In the ordinary loading → ready transition the effect re-runs and
  // `ensure` returns immediately, so this costs a function call, not a request.
  useEffect(() => {
    if (key !== null) client.ensure(key, fetcher)
  }, [client, key, fetcher, state])

  const refetch = useCallback(() => {
    if (key !== null) client.refetch(key, fetcher)
  }, [client, key, fetcher])

  return { state, refetch }
}
