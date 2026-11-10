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
 * clock (C21). The low state and its pulse are still each consumer's existing
 * threshold and `urgent` loop claim, passed in unchanged: when eligibility,
 * the recovered soft warning and its peripheral cue change (C22–C24, C61),
 * that is TASK-008's change, through `countdown-warning.ts` and this owner.
 *
 * Accessibility is the app's operational rule, unchanged: the timer is named
 * once by its label and is not a live region; the digits are decorative and
 * the value is said in words.
 */
import type { CSSProperties } from 'react'

import type { TimerReading } from '../../state/timed-clock'
import { ForegroundEchoFrame } from '../foreground-echo'
import type { InterfaceLoop } from '../motion'
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
  /** The shipped low state: emission, body and digits take timer-low. */
  low?: boolean
  /**
   * The low state's 80% pulse, as a claim on the view's one loop: the frame
   * pulses while that claim runs and is still otherwise. `true` when the
   * consumer's own wrapper already carries the claim, as the shipped
   * `TimerDisplay`'s wrappers did.
   */
  pulse?: InterfaceLoop | true
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
  low = false,
  pulse,
}: DeadlineTimerProps) {
  return (
    <ForegroundEchoFrame>
      <span
        className={[
          'clr-bleed',
          'clr-accepted-timer',
          `clr-accepted-timer--${placement}`,
          pulse === undefined ? null : 'clr-pulse-micro',
        ].filter(Boolean).join(' ')}
        data-timer-frame={placement}
        data-clock={reading.clock}
        data-low={low || undefined}
        style={low ? TIMER_LOW_BLEED_STYLE : TIMER_BLEED_STYLE}
        {...(pulse === true ? undefined : pulse)}
      >
        <span
          role="timer"
          aria-label={reading.label}
          className={`clr-chamfer clr-chamfer--md clr-accepted-timer__body ${low ? 'clr-chamfer--timer-low' : 'clr-chamfer--timer'}`}
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
