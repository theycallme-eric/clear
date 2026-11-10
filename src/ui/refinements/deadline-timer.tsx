/**
 * The whole timer body — every live clock's one frame (TASK-007: C19, C20,
 * G06; R15, R17, R42, R49, R53, R96, R102, R103, R119).
 *
 * Accepted gallery reference eded158cfd928d382c9a9409e2c372270312741d,
 * `/gallery/refinements?state=cards` and `?state=urgency` (REUSE.md: "Whole
 * timer body and meaningful soft deadline warning"). This is that owner,
 * consolidated with the app's former `TimerFrame` (EXC-03) and the shipped
 * `TimerDisplay` positions it replaces, so the session clock, a movement's
 * countdown, the session's rest and every format clock draw one frame:
 *
 *   · **One complete frame.** One chamfered timer body on the timer role,
 *     emitting through its own `.clr-bleed` — no accent bar strip, no card
 *     inside it, no second chamfer. In a block's stack, a card or the open
 *     log it fills the available width (the `body` placement), so no short
 *     inner frame ever sits inside an empty wider one (R42, R49, R102, R103).
 *   · **Centred digits.** The readout is centred in the body, horizontally
 *     and vertically, whatever the width.
 *   · **The header readout** (the `header` placement) is the same frame at
 *     the menu's control height, sized to its digits — it is never stretched
 *     across the header (R53, R96, R102). The header's single-row alignment
 *     is `.clr-workout-header` in `presentation.css` (C20, R119).
 *
 * It has no clock of its own and writes nothing. What it draws is a
 * `TimerReading` from `state/timed-clock.ts`, taken from the clock's existing
 * owner; drawing it in another place cannot start, restart or reset that
 * clock (C21).
 *
 * TASK-008 (C22, C23, C24, C61; G06; R120, R125, R126, R133, R135, R144; P05)
 * makes it the one owner of the recovered countdown warning, consolidating
 * the R7 `useCountdownUrgency` hook, every consumer's own low threshold and
 * loop claim, and the movement countdown's own screen-edge portal:
 *
 *   · **Eligibility** is `countdown-warning.ts`, read from the deadline the
 *     consumer passes (`state/countdown-urgency.ts`, from the clock's own
 *     owner): the timer-low colour at ten seconds, the breathe and the edge at
 *     five while running, nothing on pause, expiry or an elapsed-only clock.
 *   · **One loop.** The warning is one coordinated loop: each urgent timer
 *     claims the view's one `urgent` loop (`motion.ts`), so a wait beside it
 *     is stilled, and while the warning holds the loop every urgent timer and
 *     the aura breathe together — never two competing pulses.
 *   · **One edge.** However many deadlines are urgent, exactly one decorative
 *     pointer-transparent aura is drawn — by the first urgent timer — over the
 *     whole viewport, portalled into the topmost open native dialog so it
 *     shows above an open log, otherwise onto the document body.
 *   · **One phase.** The timer's breathe and the aura's are the same keyframes
 *     on the same period and easing, and both are pinned to the document
 *     timeline's epoch, so they brighten and fade together over every cycle,
 *     whatever the numeric ticks and wherever the aura is portalled (P05).
 *   · **Still.** Under reduced motion (the device's or the app's own choice)
 *     or the still policy, the timer and the aura hold a steady .5.
 *
 * The warning is presentation only: it starts, pauses and stores nothing, and
 * never records performed work (C24).
 *
 * Accessibility is the app's operational rule, unchanged: the timer is named
 * once by its label and is not a live region; the digits are decorative and
 * the value is said in words.
 */
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'

import { NO_DEADLINE, type CountdownDeadline } from '../../state/countdown-urgency'
import type { TimerReading } from '../../state/timed-clock'
import { ForegroundEchoFrame } from '../foreground-echo'
import { useInterfaceLoop, type InterfaceLoop, type InterfaceLoopState } from '../motion'
import { countdownWarningState } from './countdown-warning'
import './presentation.css'

export type TimerPlacement = 'body' | 'header'

export interface DeadlineTimerProps {
  /** The clock's reading, from its owner (`state/timed-clock.ts`). */
  reading: TimerReading
  /**
   * `body` fills the available width (a block's stack, a card, the open log);
   * `header` is the compact readout beside the workout header's menu.
   */
  placement?: TimerPlacement
  /** The digit size, a type token. Each consumer keeps its existing size. */
  size?: string
  /** A short caption drawn inside the frame, before the digits. */
  caption?: string
  /**
   * TASK-008: the live deadline this clock's warning reads, from the clock's
   * own owner (`state/countdown-urgency.ts`). Omitted for an elapsed-only
   * clock, and `NO_DEADLINE` before a start or after the end: no warning.
   */
  deadline?: CountdownDeadline
  /**
   * An ended clock's own outcome drawn in the timer-low role — For Time's
   * "Cap reached". Not the warning: it never breathes or lights the edge.
   */
  lowOutcome?: boolean
  /**
   * The still policy, previewed: the reduced-motion treatment (a steady .5,
   * no animation) without changing the device's or the app's own choice.
   */
  still?: boolean
}

/** The emission follows the frame's role: timer, or timer-low. */
const TIMER_BLEED_STYLE = { '--bleed': 'var(--border-timer)' } as CSSProperties
const TIMER_LOW_BLEED_STYLE = { '--bleed': 'var(--border-timer-low)' } as CSSProperties

const DEFAULT_SIZE: Readonly<Record<TimerPlacement, string>> = {
  body: 'var(--heading-h3-size)',
  header: 'var(--label-lg-size)',
}

export function DeadlineTimer({
  reading,
  placement = 'body',
  size = DEFAULT_SIZE[placement],
  caption,
  deadline = NO_DEADLINE,
  lowOutcome = false,
  still = false,
}: DeadlineTimerProps) {
  const warning = countdownWarningState(deadline.remaining, deadline.running)
  const low = warning.low || lowOutcome
  const { loop, ownsEdge } = useCountdownUrgency(warning.urgent, still)
  const body = useRef<HTMLSpanElement>(null)
  const state = loop['data-loop']

  // A new breathe starts on the document timeline's epoch, as the aura's does.
  useLayoutEffect(() => {
    if (warning.urgent) alignPhase(body.current)
  }, [warning.urgent, state])

  return (
    <>
      <ForegroundEchoFrame>
        <span
          className={['clr-bleed', 'clr-accepted-timer', `clr-accepted-timer--${placement}`].join(' ')}
          data-timer-frame={placement}
          data-clock={reading.clock}
          data-low={low || undefined}
          style={low ? TIMER_LOW_BLEED_STYLE : TIMER_BLEED_STYLE}
        >
          <span
            ref={body}
            role="timer"
            aria-label={reading.label}
            className={`clr-chamfer clr-chamfer--md clr-accepted-timer__body ${low ? 'clr-chamfer--timer-low' : 'clr-chamfer--timer'}`}
            data-urgent={warning.urgent ? 'true' : undefined}
            {...(warning.urgent ? loop : undefined)}
          >
            {caption === undefined ? null : (
              <span aria-hidden="true" className="clr-accepted-timer__caption">
                {caption}
              </span>
            )}
            <TimerDigits text={reading.text} size={size} low={low} />
            <span className="a11y-hidden">{reading.spoken}</span>
          </span>
        </span>
      </ForegroundEchoFrame>
      {ownsEdge ? <DeadlineEdge loop={loop} /> : null}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The one loop, the one edge and the one phase
// ─────────────────────────────────────────────────────────────────────────────

/** The keyframes the timer and the aura share (`presentation.css`). */
const WARNING_KEYFRAMES = 'clr-deadline-breathe'

/**
 * Pin each of the element's warning breathes to the document timeline's epoch.
 * Every breathe then shares one phase, wherever and whenever it started: a
 * timer that went urgent a second after another, or an aura portalled into a
 * dialog that just opened, brightens and fades with the rest (P05).
 */
function alignPhase(element: Element | null) {
  if (element === null || typeof element.getAnimations !== 'function') return
  for (const animation of element.getAnimations()) {
    if ((animation as CSSAnimation).animationName === WARNING_KEYFRAMES && animation.startTime !== 0) {
      animation.startTime = 0
    }
  }
}

/**
 * The urgent timers, in the order they went urgent, with the state of each
 * one's claim on the view's one `urgent` loop. The warning is one loop: it
 * runs when any of its claims holds the view's loop — an urgent claim
 * outranks every other kind, so it does unless motion is reduced — and then
 * every urgent timer and the aura breathe together, on the one phase. The
 * first claim draws the one edge.
 */
const warningClaims = new Map<string, InterfaceLoopState>()
const warningListeners = new Set<() => void>()
let warning: { readonly owner: string | null; readonly state: InterfaceLoopState } = { owner: null, state: 'still' }

function settleWarning() {
  const owner = warningClaims.keys().next().value ?? null
  const state: InterfaceLoopState = [...warningClaims.values()].includes('run') ? 'run' : 'still'
  if (owner === warning.owner && state === warning.state) return
  warning = { owner, state }
  for (const listener of warningListeners) listener()
}

function subscribeWarning(listener: () => void) {
  warningListeners.add(listener)
  return () => {
    warningListeners.delete(listener)
  }
}

const readWarning = () => warning

/**
 * R7's `useCountdownUrgency`, consolidated into the accepted owner: while the
 * deadline is urgent, claim the view's one `urgent` loop (so a wait beside it
 * is stilled) and a place in the one warning. The claims end with the urgency
 * — on pause, on expiry, and when the timer unmounts — so nothing urgent is
 * left behind on another screen or in a closed dialog.
 */
function useCountdownUrgency(urgent: boolean, still: boolean) {
  const id = useId()
  const own = useInterfaceLoop('urgent', urgent)['data-loop']

  // Its place in the warning, held for as long as it is urgent: the order of
  // the claims (and so the edge's owner) never moves when a loop state does.
  useLayoutEffect(() => {
    if (!urgent) return
    warningClaims.set(id, 'still')
    return () => {
      warningClaims.delete(id)
      settleWarning()
    }
  }, [id, urgent])

  // Its claim's loop state, kept current in that same place.
  useLayoutEffect(() => {
    if (!urgent || !warningClaims.has(id)) return
    warningClaims.set(id, own)
    settleWarning()
  }, [id, urgent, own])

  const shared = useSyncExternalStore(subscribeWarning, readWarning, readWarning)
  const loop: InterfaceLoop = { 'data-loop': still ? 'still' : shared.state }
  return { loop, ownsEdge: urgent && shared.owner === id }
}

/** The topmost open native dialog, or the body when none is open. */
function edgeHost(): HTMLElement {
  const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog[open]')
  return dialogs.length > 0 ? dialogs[dialogs.length - 1] : document.body
}

/**
 * Where the aura is drawn. An open native dialog is in the top layer, above
 * everything on the page, so the aura follows it there — above an open log —
 * and comes back to the body when it closes.
 */
function useEdgeHost(): HTMLElement {
  const [host, setHost] = useState(edgeHost)
  useLayoutEffect(() => {
    const update = () => setHost(edgeHost())
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] })
    return () => observer.disconnect()
  }, [])
  return host
}

/**
 * The one soft screen-edge aura: decorative (`aria-hidden`), pointer
 * transparent, covering the whole viewport, breathing on the shared phase.
 */
function DeadlineEdge({ loop }: { loop: InterfaceLoop }) {
  const edge = useRef<HTMLDivElement>(null)
  const host = useEdgeHost()
  const state = loop['data-loop']
  useLayoutEffect(() => {
    alignPhase(edge.current)
  }, [host, state])
  return createPortal(
    <div ref={edge} aria-hidden="true" className="clr-deadline-edge" data-countdown-edge="" {...loop} />,
    host,
  )
}

/**
 * The digits, drawn the way the shipped `TimerDisplay` draws them: each one
 * tumbles when it changes, the colon holds still, and the colour crosses into
 * the low state on the frame's own schedule — `--dur-alert`, stepped.
 * Decorative; the frame carries the accessible value. (The former
 * `TimerFrame`'s digits, unchanged but for a line height of one, so the
 * readout centres exactly in its frame.)
 */
function TimerDigits({ text, size, low }: { text: string; size: string; low: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        fontFamily: 'var(--font-data)',
        fontSize: size,
        fontWeight: 'var(--font-weight-bold)',
        letterSpacing: 'var(--tracking-data)',
        lineHeight: 1,
        color: low ? 'var(--text-timer-low)' : 'var(--text-timer)',
        transition: 'color var(--dur-alert) var(--step-4)',
      }}
    >
      {text.split('').map((char, index) => (
        <span
          key={`${index}-${char}`}
          className={char === ':' ? undefined : 'clr-tumble'}
          style={{
            display: 'inline-block',
            minWidth: char === ':' ? undefined : '0.62em',
            textAlign: 'center',
          } as CSSProperties}
        >
          {char}
        </span>
      ))}
    </span>
  )
}
