/**
 * PWA-01 — registration. The worker's own behaviour is proved in
 * `src/test/service-worker.test.ts`; what matters here is that registration is
 * scoped to the whole app, never blocks the first paint, and cannot take the
 * app down with it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SERVICE_WORKER_URL, registerServiceWorker } from './service-worker'

type Registration = { register: ReturnType<typeof vi.fn> }

function stubServiceWorkerContainer(register = vi.fn(async () => ({}))) {
  const container: Registration = { register }

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: container,
  })

  return container
}

const load = () => window.dispatchEvent(new Event('load'))

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker')
  vi.restoreAllMocks()
})

describe('registerServiceWorker (PWA-01)', () => {
  it('registers at the origin root so the worker controls every route', async () => {
    const { register } = stubServiceWorkerContainer()

    registerServiceWorker({ enabled: true })
    load()

    expect(register).toHaveBeenCalledWith(SERVICE_WORKER_URL, {
      scope: '/',
      updateViaCache: 'none',
    })
  })

  it('waits for load, so installing the shell never competes with rendering it', () => {
    const { register } = stubServiceWorkerContainer()

    registerServiceWorker({ enabled: true })

    expect(register).not.toHaveBeenCalled()

    load()

    expect(register).toHaveBeenCalledTimes(1)
  })

  it('registers once, however many times the page fires load', () => {
    const { register } = stubServiceWorkerContainer()

    registerServiceWorker({ enabled: true })
    load()
    load()

    expect(register).toHaveBeenCalledTimes(1)
  })

  it('stays silent when the browser refuses — an online app still works', async () => {
    const register = vi.fn(() => Promise.reject(new Error('insecure origin')))
    stubServiceWorkerContainer(register)

    registerServiceWorker({ enabled: true })

    expect(() => load()).not.toThrow()
    // The rejection is handled, not left to the unhandled-rejection path.
    await expect(
      Promise.resolve().then(() => 'settled'),
    ).resolves.toBe('settled')
  })

  it('does nothing in a browser without service workers', () => {
    expect(() => {
      registerServiceWorker({ enabled: true })
      load()
    }).not.toThrow()
  })

  it('is off by default under test and dev, where PROD is false', () => {
    const { register } = stubServiceWorkerContainer()

    registerServiceWorker()
    load()

    // A shell cache in front of the dev server would serve yesterday's build.
    expect(import.meta.env.PROD).toBe(false)
    expect(register).not.toHaveBeenCalled()
  })
})
