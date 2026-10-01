/**
 * Paid model tests are opt-in even when backend credentials are available.
 * A broad local `npm run e2e` must never become a six-generation surprise
 * across phone, tablet and desktop.
 */
export const liveModelEnabled = process.env.LIVE_MODEL_TESTS === '1'

export const liveModelReason =
  'paid model test disabled; set LIVE_MODEL_TESTS=1 only for a bounded acceptance run'
