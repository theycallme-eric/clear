/** Eligibility is behavior, separate from visual tokens. Functional clock
 * owners supply remaining time, including remaining = cap - elapsed. */
export const COUNTDOWN_WARNING_THRESHOLDS = Object.freeze({ colorSeconds: 10, pulseSeconds: 5 })
export function countdownWarningState(remaining: number | null, running: boolean, elapsedOnly = false) {
  const eligible = !elapsedOnly && remaining !== null && Number.isFinite(remaining) && remaining > 0
  return {
    low: eligible && remaining <= COUNTDOWN_WARNING_THRESHOLDS.colorSeconds,
    urgent: eligible && running && remaining <= COUNTDOWN_WARNING_THRESHOLDS.pulseSeconds,
  }
}
