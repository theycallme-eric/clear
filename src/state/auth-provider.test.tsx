/**
 * AUTH-01 — the provider against a mocked auth client.
 *
 * The sequence the requirement names is the first test: signed out → in →
 * refresh → out. The rest are the four things D1 did that this provider must
 * not: fetch in an event handler, refetch on a token refresh, guard itself with
 * a ref and a timer, and present a failure as a signed-out user.
 */
import { readFileSync } from 'node:fs'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { AuthClient, AuthEvent, AuthSession, AuthUser } from '../data/auth'
import { useAuth } from './auth-context'
import { AuthProvider } from './auth-provider'
import { ErrorCode, createError, err, ok, type Result } from './errors'

const USER: AuthUser = { id: 'user-1', email: 'lifter@example.test' }

function session(accessToken: string): AuthSession {
  return { accessToken, refreshToken: 'refresh', expiresAt: 2_000_000_000_000, user: USER }
}

/**
 * The mocked auth client: a set of handlers and a way to tell them something.
 * It fetches nothing, which is the point — anything the provider is seen to do
 * with an event, it did on its own.
 */
function mockAuthClient(signOutResult: Result<void> = ok(undefined)) {
  const handlers = new Set<(event: AuthEvent) => void>()
  const signOut = vi.fn(async () => signOutResult)
  const client: AuthClient = {
    onAuthStateChange(handler) {
      handlers.add(handler)
      return {
        unsubscribe() {
          handlers.delete(handler)
        },
      }
    },
    getSession: async () => ok(null),
    setSession: () => {},
    signOut,
  }

  return {
    client,
    signOut,
    subscriberCount: () => handlers.size,
    emit(event: AuthEvent) {
      act(() => {
        for (const handler of [...handlers]) handler(event)
      })
    },
  }
}

/** Every observable of the context, and the identity of `user` across renders. */
const seenUsers: (AuthUser | null)[] = []

function Probe() {
  const { status, user, error, signOut } = useAuth()
  seenUsers.push(user)
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="user">{user?.id ?? 'none'}</p>
      <p data-testid="error">{error?.code ?? 'none'}</p>
      <button type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  )
}

function mount(client: AuthClient, queryCache?: { clear: () => void }, children?: ReactNode) {
  seenUsers.length = 0
  return render(
    <StrictMode>
      <AuthProvider client={client} queryCache={queryCache}>
        {children ?? <Probe />}
      </AuthProvider>
    </StrictMode>,
  )
}

const status = () => screen.getByTestId('status').textContent

describe('AuthProvider', () => {
  it('walks signed out → in → refresh → out', async () => {
    const auth = mockAuthClient()
    mount(auth.client)

    // Before the client has settled, nobody is claimed either way.
    expect(status()).toBe('loading')

    auth.emit({ type: 'INITIAL_SESSION', session: null })
    expect(status()).toBe('anonymous')
    expect(screen.getByTestId('user')).toHaveTextContent('none')

    auth.emit({ type: 'SIGNED_IN', session: session('access-1') })
    expect(status()).toBe('authenticated')
    expect(screen.getByTestId('user')).toHaveTextContent('user-1')

    auth.emit({ type: 'TOKEN_REFRESHED', session: session('access-2') })
    expect(status()).toBe('authenticated')
    expect(screen.getByTestId('user')).toHaveTextContent('user-1')

    auth.emit({ type: 'SIGNED_OUT' })
    expect(status()).toBe('anonymous')
    expect(screen.getByTestId('user')).toHaveTextContent('none')
  })

  it('restores an existing session on mount', () => {
    const auth = mockAuthClient()
    mount(auth.client)

    auth.emit({ type: 'INITIAL_SESSION', session: session('access-1') })

    expect(status()).toBe('authenticated')
    expect(screen.getByTestId('user')).toHaveTextContent('user-1')
  })

  it('hands back the identical user object across a token refresh', () => {
    const auth = mockAuthClient()
    mount(auth.client)
    auth.emit({ type: 'SIGNED_IN', session: session('access-1') })

    const before = seenUsers.at(-1)
    auth.emit({ type: 'TOKEN_REFRESHED', session: session('access-2') })

    // A new `user` object would invalidate every query keyed by it (AUTH-03).
    expect(seenUsers.at(-1)).toBe(before)
  })

  it('takes a new user object when a different account signs in', () => {
    const auth = mockAuthClient()
    mount(auth.client)
    auth.emit({ type: 'SIGNED_IN', session: session('access-1') })

    const before = seenUsers.at(-1)
    auth.emit({
      type: 'SIGNED_IN',
      session: { ...session('access-9'), user: { id: 'user-2', email: null } },
    })

    expect(seenUsers.at(-1)).not.toBe(before)
    expect(screen.getByTestId('user')).toHaveTextContent('user-2')
  })

  it('reports a failed restore as an error, never as a signed-out user', () => {
    const auth = mockAuthClient()
    mount(auth.client)
    auth.emit({ type: 'INITIAL_SESSION', session: session('access-1') })

    auth.emit({
      type: 'RESTORE_FAILED',
      error: createError(ErrorCode.NETWORK_OFFLINE),
    })

    // The D1 regression: an onboarded user whose session could not be
    // revalidated is in an error state, not at the start of onboarding.
    expect(status()).toBe('error')
    expect(status()).not.toBe('anonymous')
    expect(screen.getByTestId('error')).toHaveTextContent(ErrorCode.NETWORK_OFFLINE)
    expect(screen.getByTestId('user')).toHaveTextContent('user-1')
  })

  it('recovers from an error when the session is revalidated', () => {
    const auth = mockAuthClient()
    mount(auth.client)
    auth.emit({ type: 'RESTORE_FAILED', error: createError(ErrorCode.NETWORK_OFFLINE) })

    auth.emit({ type: 'TOKEN_REFRESHED', session: session('access-2') })

    expect(status()).toBe('authenticated')
    expect(screen.getByTestId('error')).toHaveTextContent('none')
  })

  it('clears the query cache on sign-out', async () => {
    const auth = mockAuthClient()
    const queryCache = { clear: vi.fn() }
    mount(auth.client, queryCache)
    auth.emit({ type: 'SIGNED_IN', session: session('access-1') })

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(auth.signOut).toHaveBeenCalledTimes(1)
    expect(queryCache.clear).toHaveBeenCalledTimes(1)
  })

  it('clears the query cache even when revocation fails, and reports the typed error', async () => {
    const failure = err(createError(ErrorCode.NETWORK_OFFLINE))
    const auth = mockAuthClient(failure)
    const queryCache = { clear: vi.fn() }
    let result: Result<void> | null = null

    function SignOutProbe() {
      const { signOut } = useAuth()
      return (
        <button
          type="button"
          onClick={() => {
            void signOut().then((value) => {
              result = value
            })
          }}
        >
          Sign out
        </button>
      )
    }

    mount(auth.client, queryCache, <SignOutProbe />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(queryCache.clear).toHaveBeenCalledTimes(1)
    expect(result).toEqual(failure)
  })

  it('subscribes once and unsubscribes on unmount', () => {
    const auth = mockAuthClient()
    const view = mount(auth.client)

    // StrictMode mounts effects twice; a leaked subscription would show here.
    expect(auth.subscriberCount()).toBe(1)

    view.unmount()

    expect(auth.subscriberCount()).toBe(0)
  })

  it('refuses to be read outside the provider', () => {
    expect(() => render(<Probe />)).toThrow(/AuthProvider/)
  })
})

describe('AuthProvider — the shape the requirement asks for', () => {
  const sources = ['./auth-provider.tsx', './auth-context.ts'].map((file) =>
    readFileSync(new URL(file, import.meta.url), 'utf8'),
  )

  /** Code only: the requirement counts the implementation, not its commentary. */
  const codeLines = sources
    .flatMap((source) => source.split('\n'))
    .map((line) => line.trim())
    .filter(
      (line) =>
        line !== '' &&
        !line.startsWith('//') &&
        !line.startsWith('/*') &&
        !line.startsWith('*') &&
        !line.startsWith('*/'),
    )

  it('is at most 80 lines of code', () => {
    expect(codeLines.length).toBeLessThanOrEqual(80)
  })

  it.each(['useRef', 'setTimeout', 'setInterval', 'clearTimeout', 'AbortController'])(
    'uses no %s',
    (banned) => {
      expect(codeLines.join('\n')).not.toContain(banned)
    },
  )

  it('cannot fetch anything, in an auth event handler or anywhere else', () => {
    const code = codeLines.join('\n')

    expect(code).not.toContain('fetch')
    // No data module, no transport, no query — only the client's own types.
    expect(code).not.toContain('supabase')
    expect(code).not.toContain('createSupabaseClient')
  })
})
