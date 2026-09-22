/**
 * AUTH-02 — the OTP screen: the round trip, the typed failures, the cooldown,
 * and the guard.
 *
 * The acceptance criterion is "OTP flow works with typed errors on bad codes",
 * so the negative assertions matter as much as the positive ones: what GoTrue
 * says about a bad code never appears on the screen.
 */
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { otpError } from '../data/otp'
import { err, ok } from '../state/errors'
import {
  createFakeAuthClient,
  createFakeOtpClient,
  fakeSession,
  signedInEvent,
  type FakeOtpClient,
} from '../test/auth-double'
import { renderApp } from '../test/render'
import { RESEND_COOLDOWN_SECONDS } from './Login'

const EMAIL = 'lifter@example.test'
/** What GoTrue actually answers for a wrong or stale code. */
const GOTRUE_PROSE = 'Token has expired or is invalid'

function mount(otp: FakeOtpClient, auth = createFakeAuthClient()) {
  renderApp(['/login'], { auth, otp })
  return { auth, otp }
}

const emailField = () => screen.getByLabelText(/email/i)
const codeField = () => screen.getByLabelText(/code/i)

async function requestCode(user: ReturnType<typeof userEvent.setup>) {
  await user.type(emailField(), EMAIL)
  await user.click(screen.getByRole('button', { name: 'Send code' }))
  return screen.findByRole('button', { name: 'Verify' })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('OTP login — requesting a code', () => {
  it('renders the email step with the screen heading', () => {
    mount(createFakeOtpClient())

    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(emailField()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send code' })).toBeInTheDocument()
  })

  it('refuses a malformed address inline and never calls the server', async () => {
    const user = userEvent.setup()
    const { otp } = mount(createFakeOtpClient())

    await user.type(emailField(), 'lifter@example')
    await user.click(screen.getByRole('button', { name: 'Send code' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That is not an email address. Check it and try again.',
    )
    expect(otp.requests).toEqual([])
  })

  it('moves to the code step and says so politely', async () => {
    const user = userEvent.setup()
    const { otp } = mount(createFakeOtpClient())

    await requestCode(user)

    expect(otp.requests).toEqual([EMAIL])
    expect(codeField()).toBeInTheDocument()
    // Scoped to the screen: the route announcer is a status region too.
    expect(within(screen.getByRole('main')).getByRole('status')).toHaveTextContent(
      `Code sent to ${EMAIL}`,
    )
  })

  it('reports a send that never left as a typed connection failure', async () => {
    const user = userEvent.setup()
    mount(
      createFakeOtpClient({
        requestCode: async () => err(otpError('offline', { reason: 'Failed to fetch' })),
      }),
    )

    await user.type(emailField(), EMAIL)
    await user.click(screen.getByRole('button', { name: 'Send code' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No connection. Check your network and try again.',
    )
    // Still on the email step: nothing was sent, so there is nothing to type.
    expect(screen.getByRole('button', { name: 'Send code' })).toBeInTheDocument()
  })
})

describe('OTP login — verifying a code', () => {
  it('hands the verified session to the auth client and leaves the screen', async () => {
    const user = userEvent.setup()
    const session = fakeSession()
    const { auth } = mount(
      createFakeOtpClient({ verifyCode: async () => ok(session) }),
    )

    await requestCode(user)
    await user.type(codeField(), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    await waitFor(() => expect(auth.sessions).toEqual([session]))
    // Public-only: the signed-in visitor is sent to Home.
    expect(
      await screen.findByText('Workout generation is being rebuilt.'),
    ).toBeInTheDocument()
  })

  it('shows a typed human error for a wrong code and never quotes Supabase', async () => {
    const user = userEvent.setup()
    const { otp } = mount(
      createFakeOtpClient({
        verifyCode: async () =>
          err(otpError('invalid-code', { status: 401, errorCode: null })),
      }),
    )

    await requestCode(user)
    await user.type(codeField(), '000000')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('That code is not right. Check the digits and try again.')
    expect(document.body.textContent).not.toContain(GOTRUE_PROSE)
    expect(document.body.textContent).not.toContain('401')
    // The field that was wrong says so, and the user can try again in place.
    expect(codeField()).toHaveAttribute('aria-invalid', 'true')
    expect(otp.verifications).toEqual([{ email: EMAIL, code: '000000' }])
  })

  it('distinguishes an expired code, and offers a new one', async () => {
    const user = userEvent.setup()
    mount(
      createFakeOtpClient({
        verifyCode: async () =>
          err(otpError('expired-code', { status: 403, errorCode: 'otp_expired' })),
      }),
    )

    await requestCode(user)
    await user.type(codeField(), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That code has expired. Request a new one.',
    )
    expect(document.body.textContent).not.toContain('otp_expired')
  })

  it('refuses digits that cannot be a code without spending an attempt', async () => {
    const user = userEvent.setup()
    const { otp } = mount(createFakeOtpClient())

    await requestCode(user)
    await user.type(codeField(), '12')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That code is not right. Check the digits and try again.',
    )
    expect(otp.verifications).toEqual([])
  })

  it('marks the verify action busy while the exchange is in flight', async () => {
    const user = userEvent.setup()
    let release: () => void = () => {}
    mount(
      createFakeOtpClient({
        verifyCode: () =>
          new Promise((resolve) => {
            release = () => resolve(ok(fakeSession()))
          }),
      }),
    )

    await requestCode(user)
    await user.type(codeField(), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Verify' })).toHaveAttribute(
        'aria-busy',
        'true',
      ),
    )

    release()
  })
})

describe('OTP login — resend cooldown', () => {
  it('disables resend with a visible countdown and re-enables it when it ends', async () => {
    // `shouldAdvanceTime` keeps testing-library's own waits running while the
    // cooldown's interval is under this test's control.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { otp } = mount(createFakeOtpClient())

    await requestCode(user)

    const resend = screen.getByRole('button', {
      name: `Resend in ${RESEND_COOLDOWN_SECONDS}s`,
    })
    expect(resend).toBeDisabled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(
      screen.getByRole('button', { name: `Resend in ${RESEND_COOLDOWN_SECONDS - 1}s` }),
    ).toBeDisabled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESEND_COOLDOWN_SECONDS * 1_000)
    })
    const ready = screen.getByRole('button', { name: 'Resend code' })
    expect(ready).toBeEnabled()

    await user.click(ready)
    expect(otp.requests).toEqual([EMAIL, EMAIL])
  })

  it('starts the cooldown when the server says the limit was hit', async () => {
    const user = userEvent.setup()
    mount(
      createFakeOtpClient({
        requestCode: async () => err(otpError('rate-limited', { status: 429 })),
      }),
    )

    await user.type(emailField(), EMAIL)
    await user.click(screen.getByRole('button', { name: 'Send code' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Wait a moment, then try again.',
    )
    // A refused send is still a send to the limiter: the control says how long.
    expect(
      await screen.findByRole('button', {
        name: `Try again in ${RESEND_COOLDOWN_SECONDS}s`,
      }),
    ).toBeDisabled()
  })

  it('lets the user go back and use a different email', async () => {
    const user = userEvent.setup()
    mount(createFakeOtpClient())

    await requestCode(user)
    await user.click(screen.getByRole('button', { name: 'Use a different email' }))

    expect(await screen.findByRole('button', { name: 'Send code' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /resend/i })).not.toBeInTheDocument()
  })
})

describe('OTP login — the guard', () => {
  it('is public-only: an authenticated visitor never sees the form', async () => {
    mount(createFakeOtpClient(), createFakeAuthClient({ settled: signedInEvent() }))

    await waitFor(() => {
      expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument()
    })
    expect(screen.getByText('Workout generation is being rebuilt.')).toBeInTheDocument()
  })

  it('shows the form to a visitor whose stored session could not be revalidated', async () => {
    const auth = createFakeAuthClient({
      settled: {
        type: 'RESTORE_FAILED',
        error: otpError('offline'),
      },
    })
    mount(createFakeOtpClient(), auth)

    // D1: a failed restore is not a sign-out and not an identity. The visitor
    // asked for the sign-in screen, so they get it.
    expect(await screen.findByRole('button', { name: 'Send code' })).toBeInTheDocument()
  })
})
