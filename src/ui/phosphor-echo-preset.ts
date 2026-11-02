/**
 * Effects TASK-003 (REQ-003) — the one owner of the Phosphor Echo numbers.
 *
 * This file holds the shared preset and nothing else: no eligibility, no
 * silhouette geometry, no compositing and no lifecycle. `phosphor-echo.tsx`
 * reads it; no target can pass its own blur, strength, offset or colour. A
 * later numeric change is an edit to `PHOSPHOR_ECHO_PRESET` here followed by
 * visual verification (`e2e/effects/echo-standalone-fidelity.spec.ts`), and is
 * never called the exact latest preset until the owner has reviewed it.
 *
 * Provenance: the owner-preferred preset saved in the preserved effects
 * checkpoint as `round-3/preferred-preset.json` ("Phosphor Echo · preferred",
 * selected by the owner from a control screenshot, shared across all targets).
 * Its kernel is `round-3/phosphor-echo.mjs`, whose `EFFECT_DEFAULTS` carry the
 * same four values.
 *
 * Not this preset: the earlier round-3 geometry check and the old Chrome Echo
 * tab used opacity 0.34, blur 1.4, x −5.5, y +6.6. Those values only describe
 * how the masking method was first verified (`round-3/VERIFICATION.json`,
 * echo-on.jpg / echo-off.jpg) and are not a golden reference for this one.
 */

/** Units are CSS pixels; `opacity` is the alpha slope applied to the rear copy. */
export interface PhosphorEchoPreset {
  /** feFuncA linear slope: how much of the rear copy's alpha survives. */
  readonly opacity: number
  /** feGaussianBlur stdDeviation, in CSS px. */
  readonly blur: number
  /** feOffset dx, in CSS px. Negative is left. */
  readonly x: number
  /** feOffset dy, in CSS px. Positive is down. */
  readonly y: number
}

/** The single shared parameter set — round-3/preferred-preset.json. */
export const PHOSPHOR_ECHO_PRESET: PhosphorEchoPreset = Object.freeze({
  opacity: 0.29,
  blur: 3.2,
  x: -4.7,
  y: 5.64,
})

/**
 * How the preset reads in the owner's control: the offset control derives
 * y = |x| × 1.2, so 5.64 displays as 5.6.
 */
export const PHOSPHOR_ECHO_PRESET_DISPLAY = '4.7 left / 5.6 down'

/** Where the numbers came from, so a reviewer can trace them. */
export const PHOSPHOR_ECHO_PRESET_PROVENANCE = Object.freeze({
  name: 'Phosphor Echo · preferred',
  source: 'round-3/preferred-preset.json',
  kernel: 'round-3/phosphor-echo.mjs',
  selectedBy: 'owner',
})
