/**
 * OTP Login — `/login` (AUTH-02).
 *
 * IA.md §4: atmosphere `full`, public-only, in from Welcome, out to `/` (the
 * onboarding question is a profile question, and this screen reads no profile).
 * Composition is the 0.14.3 form contract: the shell and its atmosphere come
 * from `RootLayout`, `PageHeader` is `AppHeader`, and only the screen title
 * sits on the atmosphere. The step's heading, its guidance, the failure and the
 * current field are one form `Card`; the actions use the measured pinned
 * footer. The way back to email entry is an inline `TextAction` beside the
 * address the code went to, inside the card (U14).
 *
 * One Get started entry serves new and returning accounts (U14): the code
 * signs a returning athlete in and creates a new athlete's account, and the
 * route guard sends each on (`/onboarding` or `/`). A legacy `?mode=create`
 * link renders the same screen.
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
 *   · error — a typed message in an alert region inside the card, carrying a
 *     glyph so severity never rests on colour alone; a refused field is also an
 *     invalid `Input`, which draws its own urgency frame and warning glyph.
 *   · empty — n/a, per the IA entry: there is nothing to have none of.
 *   · populated — the form.
 *
 * Motion: the step swap is `.clr-interlace` (keyed on the step, so React
 * remounts it and the animation runs once); the card, its heading and the
 * failure text sit outside that subtree, so the card does not replay an
 * arrival for an inline update and a failure appears with no entrance
 * animation, per IA.md §4.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'

import type { OtpError } from '../data/otp'
import { isCodeLike, isEmailLike, otpError } from '../data/otp'
import {
  AlertCircle,
  AppHeader,
  Button,
  ClearLogo,
  Input,
  TextAction,
} from '../design-system/index'
import { useCountdown } from '../state/cooldown'
import { useSignInClients } from '../state/sign-in-context'
import { Card } from '../ui/card'
import { ActionRow, PhoneFooter } from '../ui/composition'
import { useInvalidFocus } from '../ui/formFocus'
import { Screen } from './Screen'

/**
 * GoTrue's own email send limit is a minute by default, so asking sooner is an
 * error the user did not need to see. The number is the app's promise to match
 * the project's configuration, not a guess about the network.
 */
export const RESEND_COOLDOWN_SECONDS = 60

/** The screen's title: the same words as Welcome's one entry. */
const LOGIN_TITLE = 'Get started'

const REQUEST_FORM_ID = 'clear-auth-request'
const VERIFY_FORM_ID = 'clear-auth-verify'

/** The address and its change action wrap onto two lines rather than squeeze. */
const WRAP_ROW_STYLE: CSSProperties = { flexWrap: 'wrap', rowGap: 0 }

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
  const emailRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const changingEmail = useRef(false)

  // CORE-05: both steps submit through the shared helper, so a rejected
  // address or code puts the caret back on the field that was rejected —
  // whether this screen refused it or the server did. One instance serves both
  // steps: only one of the two forms is mounted at a time.
  const onSubmit = useInvalidFocus()

  // The code has arrived somewhere else entirely; the least this screen can do
  // is have the caret waiting in the right field when the user comes back.
  // Changing the email is a return to that field, so the caret goes back to
  // it; the screen's first paint leaves focus where the route put it.
  useEffect(() => {
    if (step === 'verify') codeRef.current?.focus()
    else if (changingEmail.current) emailRef.current?.focus()
    changingEmail.current = false
  }, [step])

  async function sendCode(address: string): Promise<boolean> {
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
      return false
    }

    setNotice(`Code sent to ${address}. It expires in a few minutes.`)
    setStep('verify')
    cooldown.start(RESEND_COOLDOWN_SECONDS)
    return true
  }

  function onRequest(): boolean | Promise<boolean> {
    const address = email.trim()
    if (!isEmailLike(address)) {
      setError(otpError('invalid-email'))
      return false
    }
    return sendCode(address)
  }

  function onResend() {
    if (cooldown.active || busy !== null) return
    setNotice(null)
    void sendCode(email.trim())
  }

  function onVerify(): boolean | Promise<boolean> {
    const digits = code.trim()
    if (!isCodeLike(digits)) {
      setError(otpError('invalid-code'))
      return false
    }

    return (async () => {
      setBusy('verifying')
      setError(null)
      const verified = await otp.verifyCode(email.trim(), digits)
      setBusy(null)

      if (!verified.ok) {
        setError(verified.error)
        return false
      }

      // The session goes to the client `AuthProvider` subscribed to; the
      // provider flips to `authenticated` and the route guard leaves this screen.
      auth.setSession(verified.value)
      return true
    })()
  }

  function onChangeEmail() {
    changingEmail.current = true
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
      <Screen
        title={LOGIN_TITLE}
        pinnedFoot={
          <PhoneFooter>
            <ActionRow>
              {step === 'request' ? (
                <Button
                  type="submit"
                  form={REQUEST_FORM_ID}
                  variant="primary"
                  size="lg"
                  loading={busy === 'sending'}
                  disabled={cooldown.active}
                >
                  {sendLabel}
                </Button>
              ) : (
                <>
                  <Button
                    type="submit"
                    form={VERIFY_FORM_ID}
                    variant="primary"
                    size="lg"
                    loading={busy === 'verifying'}
                  >
                    Verify
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    onClick={onResend}
                    disabled={cooldown.active || busy !== null}
                  >
                    {resendLabel}
                  </Button>
                </>
              )}
            </ActionRow>
          </PhoneFooter>
        }
      >
        {/* One form card for both steps, outside the keyed subtree: the card
            stays put while the field inside it swaps. */}
        <Card heading={step === 'request' ? 'Your email' : 'Your code'}>
          <div className="clr-stack">
            {step === 'request' ? (
              <p style={{ margin: 0 }}>
                New or returning, enter your email and we’ll send a one-time code.
              </p>
            ) : (
              // The address the code went to, with the way to change it beside
              // it — in the card, where the mistake would be noticed.
              <div className="clr-row" style={WRAP_ROW_STYLE}>
                <p style={{ margin: 0 }}>
                  Enter the code sent to <strong>{email.trim()}</strong>.
                </p>
                <TextAction onClick={onChangeEmail} disabled={busy !== null}>
                  Change email
                </TextAction>
              </div>
            )}

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
                <form
                  id={REQUEST_FORM_ID}
                  className="clr-stack"
                  onSubmit={onSubmit(onRequest)}
                  noValidate
                >
                  <Input
                    label="Email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="you@example.com"
                    invalid={error?.failure === 'invalid-email'}
                    inputRef={emailRef}
                    required
                  />
                </form>
              ) : (
                <form
                  id={VERIFY_FORM_ID}
                  className="clr-stack"
                  onSubmit={onSubmit(onVerify)}
                  noValidate
                >
                  <Input
                    label="Code"
                    type="text"
                    name="one-time-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={setCode}
                    placeholder="6–10 digits"
                    invalid={
                      error?.failure === 'invalid-code' ||
                      error?.failure === 'expired-code'
                    }
                    inputRef={codeRef}
                    required
                  />
                </form>
              )}
            </div>
          </div>
        </Card>

        {/* Polite, and only ever one sentence: the step swap is visible, so
            this exists for the person who cannot see it. */}
        <div role="status" aria-live="polite" className="a11y-hidden">
          {notice}
        </div>
      </Screen>
    </>
  )
}
