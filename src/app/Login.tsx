/**
 * OTP Login — `/login` (AUTH-02).
 *
 * IA.md §4: atmosphere `quiet`, public-only, in from Welcome, out to `/` (the
 * onboarding question is a profile question, and this screen reads no profile).
 * Composition is `AuthLayout › PageHeader + Card › Input + CTAButton` — the
 * shell and its atmosphere come from `RootLayout`, `PageHeader` is `AppHeader`,
 * and the two steps share one card.
 *
 * Two things here are the requirement rather than decoration:
 *
 *   1. **No Supabase prose ever reaches the screen.** Every failure arrives as
 *      an `OtpError` whose `failure` is a closed union and whose `message` was
 *      written in `src/data/otp.ts`. This file branches on `failure`; it never
 *      formats a status code and never reads a wire body.
 *   2. **Resend is disabled with a visible countdown.** The remaining seconds
 *      are on the button's own label, so the disabled state always has a reason
 *      attached to it rather than being a dead control.
 *
 * The four states (CORE-04), for a screen whose data is a form:
 *   · loading — the session restore, owned by the route's `PublicOnly` guard
 *     and rendered as the shared `LoadingView`; and the in-flight submit,
 *     which is scoped to the
 *     control that started it (`Button loading` — the export's stepped
 *     indicator, aria-busy, activation blocked) rather than to the whole
 *     screen, because replacing a filled-in form with a loading panel loses
 *     the caret and the context.
 *   · error — a typed message in an alert region, carrying a glyph so severity
 *     never rests on colour alone.
 *   · empty — n/a, per the IA entry: there is nothing to have none of.
 *   · populated — the form.
 *
 * Motion: the step swap is `.clr-interlace` (keyed on the step, so React
 * remounts it and the animation runs once); validation and failure text sits
 * outside that subtree and appears with no entrance animation, per IA.md §4.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react'

import type { OtpError } from '../data/otp'
import { isCodeLike, isEmailLike, otpError } from '../data/otp'
import { AlertCircle, AppHeader, Button, ClearLogo, Input } from '../design-system/index'
import { useCountdown } from '../state/cooldown'
import { useSignInClients } from '../state/sign-in-context'
import { Card } from '../ui/card'
import { Screen } from './Screen'

/**
 * GoTrue's own email send limit is a minute by default, so asking sooner is an
 * error the user did not need to see. The number is the app's promise to match
 * the project's configuration, not a guess about the network.
 */
export const RESEND_COOLDOWN_SECONDS = 60

type Step = 'request' | 'verify'

type Busy = 'sending' | 'verifying' | null

export function Login() {
  return <LoginScreen />
}

function LoginScreen() {
  const { otp, auth } = useSignInClients()
  const cooldown = useCountdown()

  const [step, setStep] = useState<Step>('request')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<OtpError | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const codeRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  // The code has arrived somewhere else entirely; the least this screen can do
  // is have the caret waiting in the right field when the user comes back.
  useEffect(() => {
    if (step === 'verify') codeRef.current?.focus()
  }, [step])

  async function sendCode(address: string) {
    setBusy('sending')
    setError(null)
    const sent = await otp.requestCode(address)
    setBusy(null)

    if (!sent.ok) {
      setError(sent.error)
      // A refused send is still a send as far as the server's limiter is
      // concerned, so the countdown starts and the button stops inviting a
      // retry that cannot succeed yet.
      if (sent.error.failure === 'rate-limited') {
        cooldown.start(RESEND_COOLDOWN_SECONDS)
      }
      return
    }

    setNotice(`Code sent to ${address}. It expires in a few minutes.`)
    setStep('verify')
    cooldown.start(RESEND_COOLDOWN_SECONDS)
  }

  function onRequest(event: FormEvent) {
    event.preventDefault()
    const address = email.trim()
    if (!isEmailLike(address)) {
      setError(otpError('invalid-email'))
      return
    }
    void sendCode(address)
  }

  function onResend() {
    if (cooldown.active || busy !== null) return
    setNotice(null)
    void sendCode(email.trim())
  }

  function onVerify(event: FormEvent) {
    event.preventDefault()
    const digits = code.trim()
    if (!isCodeLike(digits)) {
      setError(otpError('invalid-code'))
      return
    }

    void (async () => {
      setBusy('verifying')
      setError(null)
      const verified = await otp.verifyCode(email.trim(), digits)
      setBusy(null)

      if (!verified.ok) {
        setError(verified.error)
        return
      }

      // The session goes to the client `AuthProvider` subscribed to; the
      // provider flips to `authenticated` and the route guard leaves this screen.
      auth.setSession(verified.value)
    })()
  }

  function onUseAnotherEmail() {
    setStep('request')
    setCode('')
    setError(null)
    setNotice(null)
    cooldown.clear()
  }

  // The countdown is on the label, so a disabled control always says why it is
  // disabled — on both steps, because a refused first send hits the same limit.
  const resendLabel = cooldown.active
    ? `Resend in ${cooldown.secondsLeft}s`
    : 'Resend code'
  const sendLabel = cooldown.active
    ? `Try again in ${cooldown.secondsLeft}s`
    : 'Send code'

  return (
    <>
      <AppHeader>
        <ClearLogo size="md" />
      </AppHeader>
      <Screen title="Sign in">
        <div className="clr-stack">
          <p>
            We email a one-time code. No password to forget.
          </p>

          <Card>
            {/* Outside the keyed subtree: a failure must not animate in. */}
            {error !== null && (
              <div role="alert" className="clr-row">
                <span
                  aria-hidden="true"
                  style={{ color: 'var(--icon-toast-negative)', display: 'flex' }}
                >
                  <AlertCircle />
                </span>
                <span>{error.message}</span>
              </div>
            )}

            <div key={step} className="clr-interlace clr-stack">
              {step === 'request' ? (
                <form className="clr-stack" onSubmit={onRequest} noValidate>
                  <Input
                    label="Email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="you@example.com"
                    invalid={error?.failure === 'invalid-email'}
                    required
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    loading={busy === 'sending'}
                    disabled={cooldown.active}
                  >
                    {sendLabel}
                  </Button>
                </form>
              ) : (
                <form className="clr-stack" onSubmit={onVerify} noValidate>
                  <Input
                    label="Code"
                    type="text"
                    name="one-time-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={setCode}
                    placeholder="6 digits"
                    helperText={`Sent to ${email.trim()}`}
                    invalid={
                      error?.failure === 'invalid-code' ||
                      error?.failure === 'expired-code'
                    }
                    inputRef={codeRef}
                    required
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    loading={busy === 'verifying'}
                  >
                    Verify
                  </Button>
                  <div className="clr-row">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={onResend}
                      disabled={cooldown.active || busy !== null}
                    >
                      {resendLabel}
                    </Button>
                    <Button
                      type="button"
                      variant="quiet"
                      onClick={onUseAnotherEmail}
                      disabled={busy !== null}
                    >
                      Use a different email
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </Card>

          {/* Polite, and only ever one sentence: the step swap is visible, so
              this exists for the person who cannot see it. */}
          <div role="status" aria-live="polite" className="a11y-hidden">
            {notice}
          </div>
        </div>
      </Screen>
    </>
  )
}
