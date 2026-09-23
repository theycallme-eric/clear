/**
 * AUTH-03 — the cache, on its own.
 *
 * `guards.test.tsx` proves what a user sees; this proves the four properties
 * that make those screens correct, and each one is a thing defect D1 got wrong:
 * one fetch per key, a failure that stays a failure, a stale response that
 * cannot overwrite a newer one, and a `clear()` that really empties.
 */
import { describe, expect, it, vi } from 'vitest'

import { createError, ErrorCode, err, ok, type Result } from './errors'
import { QueryClient } from './query'

/** A fetch whose resolution the test decides, so timing is not a race. */
function deferred<T>() {
  let settle!: (result: Result<T>) => void
  const promise = new Promise<Result<T>>((resolve) => {
    settle = resolve
  })
  return { promise, settle }
}

const BOOM = createError(ErrorCode.NETWORK_SERVER_ERROR, { details: { status: 500 } })

describe('QueryClient', () => {
  it('starts loading and stays there until the fetch settles', async () => {
    const client = new QueryClient()
    const gate = deferred<string>()

    client.ensure('k', () => gate.promise)
    expect(client.getState('k')).toEqual({ status: 'loading' })

    gate.settle(ok('value'))
    await gate.promise

    expect(client.getState('k')).toEqual({ status: 'ready', data: 'value' })
  })

  it('fetches once per key however many readers ask', async () => {
    const client = new QueryClient()
    const fetcher = vi.fn(async () => ok('value'))

    client.ensure('k', fetcher)
    client.ensure('k', fetcher)
    await Promise.resolve()
    client.ensure('k', fetcher)

    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('keeps the keys apart', async () => {
    const client = new QueryClient()

    client.ensure('a', async () => ok(1))
    client.ensure('b', async () => err(BOOM))
    await vi.waitFor(() => {
      expect(client.getState('b').status).toBe('error')
    })

    // One key failing leaves the other exactly as it was.
    expect(client.getState('a')).toEqual({ status: 'ready', data: 1 })
    expect(client.getState('b')).toEqual({ status: 'error', error: BOOM })
  })

  it('reports a failure as a failure, never as an empty success', async () => {
    const client = new QueryClient()

    client.ensure('k', async () => err(BOOM))
    await vi.waitFor(() => {
      expect(client.getState('k').status).toBe('error')
    })

    expect(client.getState('k')).not.toEqual({ status: 'ready', data: null })
  })

  it('notifies subscribers, and stops when they unsubscribe', async () => {
    const client = new QueryClient()
    const listener = vi.fn()
    const unsubscribe = client.subscribe('k', listener)

    client.ensure('k', async () => ok('one'))
    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(1)
    })

    unsubscribe()
    client.refetch('k', async () => ok('two'))
    await vi.waitFor(() => {
      expect(client.getState('k')).toEqual({ status: 'ready', data: 'two' })
    })

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('refetches on demand, and goes back through loading on the way', async () => {
    const client = new QueryClient()
    let attempt = 0
    const fetcher = async () => {
      attempt += 1
      return attempt === 1 ? err(BOOM) : ok('recovered')
    }

    client.ensure('k', fetcher)
    await vi.waitFor(() => {
      expect(client.getState('k').status).toBe('error')
    })

    client.refetch('k', fetcher)
    expect(client.getState('k')).toEqual({ status: 'loading' })

    await vi.waitFor(() => {
      expect(client.getState('k')).toEqual({ status: 'ready', data: 'recovered' })
    })
  })

  it('drops a response from a superseded run', async () => {
    const client = new QueryClient()
    const slow = deferred<string>()
    const fast = deferred<string>()

    client.ensure('k', () => slow.promise)
    client.refetch('k', () => fast.promise)

    fast.settle(ok('newer'))
    await fast.promise
    expect(client.getState('k')).toEqual({ status: 'ready', data: 'newer' })

    // The first run finally answers. It is two generations old and must not
    // be published over the answer the user is already looking at.
    slow.settle(ok('older'))
    await slow.promise
    expect(client.getState('k')).toEqual({ status: 'ready', data: 'newer' })
  })

  it('empties every key on clear, and tells everyone watching', async () => {
    const client = new QueryClient()
    const listener = vi.fn()
    client.subscribe('profile:user-1', listener)

    client.ensure('profile:user-1', async () => ok('profile'))
    client.ensure('locations:user-1', async () => ok(['gym']))
    await vi.waitFor(() => {
      expect(client.getState('locations:user-1').status).toBe('ready')
    })
    listener.mockClear()

    client.clear()

    expect(client.getState('profile:user-1')).toEqual({ status: 'loading' })
    expect(client.getState('locations:user-1')).toEqual({ status: 'loading' })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('cannot deliver a request that was in flight when the session ended', async () => {
    const client = new QueryClient()
    const gate = deferred<string>()

    client.ensure('profile:user-1', () => gate.promise)
    client.clear()

    gate.settle(ok('the previous user’s profile'))
    await gate.promise

    // The row arrived after sign-out. It belongs to nobody now.
    expect(client.getState('profile:user-1')).toEqual({ status: 'loading' })
  })

  it('fetches again after a clear, because the cache really is empty', async () => {
    const client = new QueryClient()
    const fetcher = vi.fn(async () => ok('value'))

    client.ensure('k', fetcher)
    await vi.waitFor(() => {
      expect(client.getState('k').status).toBe('ready')
    })

    client.clear()
    client.ensure('k', fetcher)

    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('seeds a key without fetching it', () => {
    const client = new QueryClient()
    const fetcher = vi.fn(async () => ok('fetched'))

    client.setData('k', 'seeded')
    client.ensure('k', fetcher)

    expect(client.getState('k')).toEqual({ status: 'ready', data: 'seeded' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('reports an unknown key as loading rather than throwing', () => {
    expect(new QueryClient().getState('never-asked')).toEqual({ status: 'loading' })
  })
})
