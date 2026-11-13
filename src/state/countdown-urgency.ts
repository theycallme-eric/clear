/** Deadline presentation only: actual clocks keep their existing owners. */
export const COUNTDOWN_COLOR_SECONDS = 10
export const COUNTDOWN_EDGE_SECONDS = 5
export function countdownUrgency(remainingSeconds: number | null, running: boolean) {
  const pending = remainingSeconds !== null && Number.isFinite(remainingSeconds) && remainingSeconds > 0
  return {
    low: pending && remainingSeconds <= COUNTDOWN_COLOR_SECONDS,
    urgent: pending && running && remainingSeconds <= COUNTDOWN_EDGE_SECONDS,
  }
}
