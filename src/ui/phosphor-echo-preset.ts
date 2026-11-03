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
 * Provenance: the owner-approved November 3 live-review export, preserved as
 * `docs/effects/echo-selection-20261103.json`. The earlier round-3 preferred
 * preset remains historical evidence. The kernel is still the unchanged
 * `round-3/phosphor-echo.mjs`; only its shared numeric inputs are updated.
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

/** The single shared parameter set — owner-approved live review, November 3. */
export const PHOSPHOR_ECHO_PRESET: PhosphorEchoPreset = Object.freeze({
  opacity: 0.21,
  blur: 1.8,
  x: -7.12,
  y: 6.75,
})

/** Independent CSS-pixel offsets from the owner's live review controls. */
export const PHOSPHOR_ECHO_PRESET_DISPLAY = '7.12 left / 6.75 down'

/** Where the numbers came from, so a reviewer can trace them. */
export const PHOSPHOR_ECHO_PRESET_PROVENANCE = Object.freeze({
  name: 'Phosphor Echo · approved 2026-11-03',
  source: 'docs/effects/echo-selection-20261103.json',
  kernel: 'round-3/phosphor-echo.mjs',
  selectedBy: 'owner',
})
