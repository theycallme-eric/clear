/**
 * TASK-008 (C23, G06; R120, R125, R126, R144) — when a timer warns. The
 * accepted gallery owner (eded158cfd928d382c9a9409e2c372270312741d, REUSE.md
 * "Whole timer body and meaningful soft deadline warning"), adopted as it was
 * accepted: eligibility is behaviour, kept apart from the warning's look
 * (`tokens.css`, `presentation.css`) and from its one drawing owner
 * (`DeadlineTimer`, `deadline-timer.tsx`).
 *
 *   · **Colour at ten.** A live deadline — running, or paused with time left —
 *     takes the timer-low colour once 0 < remaining ≤ 10.
 *   · **Edge at five.** The soft peripheral aura and the timer's matching
 *     breathe exist only while the deadline is running with 0 < remaining ≤ 5.
 *     Pause and expiry end them (C24).
 *   · **Remaining, not displayed.** Every functional clock owner supplies the
 *     seconds left before its own deadline — a countdown's reading, or a
 *     count-up race's cap minus its elapsed time — so a count-up-to-cap warns
 *     on the cap, never on the number it shows (R126).
 *   · **Elapsed-only clocks never warn.** The session's elapsed time and a
 *     round's elapsed time have no deadline (R126, R144).
 *
 * Pure: no clock, no storage and no write. A warning never records work.
 */
export const COUNTDOWN_WARNING_THRESHOLDS = Object.freeze({ colorSeconds: 10, pulseSeconds: 5 })

export interface CountdownWarning {
  /** The timer-low colour: a live deadline with 0 < remaining ≤ 10. */
  readonly low: boolean
  /** The breathe and the one screen-edge aura: running with 0 < remaining ≤ 5. */
  readonly urgent: boolean
}

export function countdownWarningState(
  remaining: number | null,
  running: boolean,
  elapsedOnly = false,
): CountdownWarning {
  const eligible = !elapsedOnly && remaining !== null && Number.isFinite(remaining) && remaining > 0
  return {
    low: eligible && remaining <= COUNTDOWN_WARNING_THRESHOLDS.colorSeconds,
    urgent: eligible && running && remaining <= COUNTDOWN_WARNING_THRESHOLDS.pulseSeconds,
  }
}
