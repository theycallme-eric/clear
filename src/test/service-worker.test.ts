/**
 * PWA-01 acceptance, the offline half.
 *
 * `public/sw.js` is not part of the bundle and jsdom has no worker scope, so
 * the file is evaluated here against a fabricated one: a cache store, a fetch
 * that can be made to fail, and the three events a worker lives by. Asserting
 * on the source text instead would prove that the word `skipWaiting` appears
 * in a file, which is not the same as a shell that loads offline.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const source = readFileSync(
  resolve(import.meta.dirname, '../../public/sw.js'),
  'utf-8',
)

const ORIGIN = 'https://clear.example'

/** Only the request fields the worker reads; a real `Request` forbids `mode: 'navigate'`. */
type FakeRequest = {
  url: string
  method: string
  mode: string
  destination: string
}

const request = (
  url: string,
  { mode = 'no-cors', destination = '', method = 'GET' } = {},
): FakeRequest => ({
  url: url.startsWith('http') ? url : `${ORIGIN}${url}`,
  method,
  mode,
  destination,
})

const navigation = (path: string) =>
  request(path, { mode: 'navigate', destination: 'document' })

/** A `Cache` over a Map, keyed the way the real one is: by request URL. */
class FakeCache {
  entries = new Map<string, Response>()

  async match(key: FakeRequest | string) {
    return this.entries.get(typeof key === 'string' ? key : keyOf(key))
  }

  async put(key: FakeRequest | string, response: Response) {
    this.entries.set(typeof key === 'string' ? key : keyOf(key), response)
  }

  async addAll(urls: string[]) {
    for (const url of urls) {
      const response = await scope.fetchMock(request(url))
      if (!response.ok) throw new Error(`precache failed: ${url}`)
      await this.put(url, response)
    }
  }
}

/** Precached URLs are relative; runtime requests are absolute. Normalise. */
const keyOf = (value: FakeRequest) => new URL(value.url).pathname

type WorkerEvent = {
  waitUntil: (promise: Promise<unknown>) => void
  respondWith: (response: Promise<Response>) => void
  request?: FakeRequest
}

const scope = {
  listeners: new Map<string, ((event: WorkerEvent) => void)[]>(),
  caches: new Map<string, FakeCache>(),
  skipWaiting: vi.fn(async () => {}),
  claim: vi.fn(async () => {}),
  // The implementation is set per test; `beforeEach` gives it a default.
  fetchMock: vi.fn<(input: FakeRequest) => Promise<Response>>(),
}

/** The worker global the file is evaluated against. */
function workerScope() {
  return {
    location: new URL(`${ORIGIN}/`),
    addEventListener(type: string, handler: (event: WorkerEvent) => void) {
      scope.listeners.set(type, [...(scope.listeners.get(type) ?? []), handler])
    },
    skipWaiting: scope.skipWaiting,
    clients: { claim: scope.claim },
    caches: {
      async open(name: string) {
        const existing = scope.caches.get(name)
        if (existing !== undefined) return existing

        const cache = new FakeCache()
        scope.caches.set(name, cache)
        return cache
      },
      async keys() {
        return [...scope.caches.keys()]
      },
      async delete(name: string) {
        return scope.caches.delete(name)
      },
      async match(key: FakeRequest | string) {
        for (const cache of scope.caches.values()) {
          const hit = await cache.match(key)
          if (hit !== undefined) return hit
        }
        return undefined
      },
    },
  }
}

/** Evaluate `sw.js` with `self`, `fetch` and `Response` supplied. */
function loadWorker() {
  const run = new Function('self', 'fetch', 'Response', source)
  run(workerScope(), scope.fetchMock, Response)
}

async function dispatch(type: string, request?: FakeRequest) {
  const pending: Promise<unknown>[] = []
  let responded: Promise<Response> | undefined

  for (const handler of scope.listeners.get(type) ?? []) {
    handler({
      request,
      waitUntil: (promise) => pending.push(promise),
      respondWith: (response) => {
        responded = response
      },
    })
  }

  await Promise.all(pending)
  return responded
}

const cachedPaths = () =>
  [...scope.caches.values()].flatMap((cache) => [...cache.entries.keys()])

beforeEach(async () => {
  scope.listeners.clear()
  scope.caches.clear()
  scope.skipWaiting.mockClear()
  scope.claim.mockClear()
  scope.fetchMock.mockReset()
  scope.fetchMock.mockImplementation(
    async (input: FakeRequest) => new Response(`body of ${input.url}`),
  )

  loadWorker()
})

describe('install (PWA-01)', () => {
  it('precaches the shell document, so a first offline load has one', async () => {
    await dispatch('install')

    expect(cachedPaths()).toContain('/index.html')
    expect(cachedPaths()).toContain('/')
  })

  it('precaches the manifest and its icons', async () => {
    await dispatch('install')

    expect(cachedPaths()).toContain('/manifest.webmanifest')
    expect(cachedPaths()).toContain('/icons/icon-192.png')
  })

  it('takes over immediately rather than waiting for every tab to close', async () => {
    await dispatch('install')

    // This is the no-stale-shell-trap guarantee, first half.
    expect(scope.skipWaiting).toHaveBeenCalled()
  })
})

describe('activate (PWA-01)', () => {
  it('deletes every cache from an older version', async () => {
    scope.caches.set('clear-shell-v0', new FakeCache())
    await dispatch('install')

    await dispatch('activate')

    expect([...scope.caches.keys()]).not.toContain('clear-shell-v0')
    expect([...scope.caches.keys()]).toHaveLength(1)
  })

  it('claims the pages that are already open', async () => {
    await dispatch('activate')

    expect(scope.claim).toHaveBeenCalled()
  })
})

describe('navigation (PWA-01)', () => {
  it('prefers the network, so a new deploy is live on the next load', async () => {
    await dispatch('install')
    scope.fetchMock.mockImplementation(async () => new Response('new shell'))

    const response = await dispatch('fetch', navigation('/'))

    expect(await response?.text()).toBe('new shell')
  })

  it('serves the cached shell for any route when the network is gone', async () => {
    await dispatch('install')
    scope.fetchMock.mockRejectedValue(new Error('offline'))

    // A deep link offline: the SPA shell answers it, exactly as the ENV-03
    // rewrite does online.
    const response = await dispatch('fetch', navigation('/history/2026-09-21'))

    expect(await response?.text()).toBe(`body of ${ORIGIN}/index.html`)
  })

  it('refreshes the cached shell from each successful response', async () => {
    await dispatch('install')
    scope.fetchMock.mockImplementation(async () => new Response('newer shell'))

    await dispatch('fetch', navigation('/'))
    scope.fetchMock.mockRejectedValue(new Error('offline'))
    const offline = await dispatch('fetch', navigation('/'))

    expect(await offline?.text()).toBe('newer shell')
  })
})

describe('shell assets (PWA-01)', () => {
  const asset = request('/assets/index-a1b2c3d4.js', { destination: 'script' })

  it('caches a fingerprinted asset the first time it is requested', async () => {
    await dispatch('fetch', asset)

    expect(cachedPaths()).toContain('/assets/index-a1b2c3d4.js')
  })

  it('answers from the cache afterwards, including with no network', async () => {
    await dispatch('fetch', asset)
    scope.fetchMock.mockRejectedValue(new Error('offline'))

    const response = await dispatch('fetch', asset)

    expect(await response?.text()).toBe(`body of ${asset.url}`)
    expect(scope.fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failed response as though it were the shell', async () => {
    scope.fetchMock.mockImplementation(
      async () => new Response('nope', { status: 503 }),
    )

    await dispatch('fetch', asset)

    expect(cachedPaths()).toHaveLength(0)
  })
})

describe('data is never cached (PWA-01)', () => {
  // Offline data is OFF-01, in M3. Until then a cached API response would be a
  // wrong answer presented as a current one.
  const uncacheable: [string, FakeRequest][] = [
    ['a cross-origin API call', request('https://db.supabase.co/rest/v1/sets')],
    ['a same-origin API route', request('/api/generate')],
    ['a same-origin auth route', request('/auth/v1/token')],
  ]

  it.each(uncacheable)('leaves %s to the network, uncached', async (_name, target) => {
    const response = await dispatch('fetch', target)

    // Not handled at all: the browser's own network path serves it.
    expect(response).toBeUndefined()
    expect(cachedPaths()).toHaveLength(0)
  })

  it('never caches a mutation, even of a shell URL', async () => {
    const response = await dispatch(
      'fetch',
      request('/', { method: 'POST', mode: 'navigate' }),
    )

    expect(response).toBeUndefined()
    expect(cachedPaths()).toHaveLength(0)
  })
})
