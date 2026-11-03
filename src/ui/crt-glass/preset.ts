/**
 * Effects TASK-005 — the one owner of the CRT Glass parameter reference.
 *
 * Every number the CRT Glass field renders with comes from this file and
 * nowhere else. Host masking, compositing and lifecycle code read it; none of
 * them keep a copy. A later numeric update is one change here followed by a
 * visual check against the preserved motion host.
 *
 * The values are the current-session export `crt-iab-current-settings.json`
 * exactly as captured (see `CRT_GLASS_REFERENCE`). They are current-session
 * numeric evidence: not proof of the final-at-pause storage, and not owner
 * approval of a shipping intensity (Q-007). They are deliberately NOT any of
 * the other preserved candidates — `working-session.mjs` (an unapproved
 * recovery seed), `PRESETS.selected` in `glass-effect.mjs`, or
 * `default-preset.json` — and no slow or static variant is inferred from them.
 *
 * Pass order is not configuration. It follows `crt-glass-motion/glass-effect.mjs`;
 * the export's human-readable `pipeline` label is older text and is not used.
 */

/** Numeric and switch inputs to the CRT pass and the motion clock. */
export interface CrtGlassValues {
  /** Scanline curvature; 0 is straight. */
  curvature: number
  /** Scanline period input in pixels; 0 disables the line field. */
  lineWidth: number
  /** Scanline light-modulation depth; 0 disables the line field. */
  lineContrast: number
  /** Perimeter edge softness, in source pixels at full reach. */
  edgeBlur: number
  /** How far the edge softness reaches in from the perimeter (0–1). */
  edgeWidth: number
  /** Upstream CRTFilter vignette reach. */
  vignetting: number
  /** Upstream CRTFilter vignette darkening. */
  vignettingAlpha: number
  /** Upstream CRTFilter vignette feather. */
  vignettingBlur: number
  /** Procedural grain amount; 0 disables grain. */
  noise: number
  /** Grain cell size in pixels. */
  noiseSize: number
  /** Grain feathering: sharp cells blended toward four-neighbour interpolation. */
  grainSoftness: number
  /** Line phase drifts. False is Still: lines frozen, grain unaffected. */
  animate: boolean
  /** Grain refreshes over time, independently of the line phase. */
  grainAnimate: boolean
  /** Seconds per full line-phase cycle. */
  cycleSeconds: number
  /** Grain refreshes per second. */
  grainRate: number
  /** The source is the Echo-composed image. */
  echo: boolean
  /** Bright foreground pixels keep their source colour proportions. */
  colorProtect: boolean
  /** Lines run vertically instead of horizontally. */
  verticalLine: boolean
}

/** Where the reference values came from, kept beside them. */
export const CRT_GLASS_REFERENCE = Object.freeze({
  file: 'crt-iab-current-settings.json',
  sha256: '3169d4608c8babe17a20670bd59f53e3110c7ce917641786d33c2713943ca033',
  study: 'CLEAR CRT glass motion 02',
  capturedUTC: '2026-10-31T01:49:46.556531+00:00',
  method: 'Existing Save settings JSON of the open motion host, read without changing controls or reloading',
  mode: 'glass',
  status:
    'Current-session numeric evidence. Not asserted final-at-pause storage, not owner approval of shipping intensity (Q-007).',
  passOrder: 'crt-glass-motion/glass-effect.mjs',
  specimen: { width: 390, height: 844, resolution: 1 },
})

/** The CRT Glass values. Change numbers here and nowhere else. */
export const CRT_GLASS_PRESET: Readonly<CrtGlassValues> = Object.freeze({
  curvature: 0.2,
  lineWidth: 2,
  lineContrast: 0.02,
  edgeBlur: 3.4,
  edgeWidth: 0.14,
  vignetting: 0.21,
  vignettingAlpha: 0.08,
  vignettingBlur: 0.18,
  noise: 0.01,
  noiseSize: 1,
  grainSoftness: 0.4,
  animate: true,
  grainAnimate: true,
  cycleSeconds: 0.6,
  grainRate: 0.5,
  echo: true,
  colorProtect: true,
  verticalLine: false,
})

/**
 * The workbench's Grain feathering control, recorded for reference only: the
 * product ships no slider for it. 0.01 is crisper, 0.99 softer; the readout
 * shows two decimals. The pass itself accepts 0–1 from direct callers.
 */
export const GRAIN_FEATHERING_REFERENCE_RANGE = Object.freeze({ min: 0.01, max: 0.99, step: 0.01, decimals: 2 })

/**
 * The workbench's exploratory ranges, recorded so they are not mistaken for
 * shipping defaults: 0.1–180 s per drift cycle and 0.5–6 Hz grain refresh.
 */
export const WORKBENCH_EXPLORATORY_RANGES = Object.freeze({
  cycleSeconds: Object.freeze({ min: 0.1, max: 180 }),
  grainRate: Object.freeze({ min: 0.5, max: 6 }),
})
