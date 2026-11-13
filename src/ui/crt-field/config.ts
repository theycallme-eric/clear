/**
 * CRT Glass field — the one shipping configuration (effects TASK-006, REQ-006).
 *
 * Every number that controls how the live field looks and moves is here, and
 * nowhere else. The host (`crt-field.tsx`) and its stylesheet only read these
 * values: they own masking, layer order and lifecycle, never an intensity. To
 * tune the field, change a value here, bump `CRT_FIELD_CONFIG.id`, then rerun
 * the visual and overhead specs (`e2e/effects/crt-composition-fidelity.spec.ts`,
 * `e2e/effects/crt-live-overhead.spec.ts`), which record the identity and the
 * values beside every capture.
 *
 * The values are the browser-native interpretation of the saved CRT Glass
 * Motion preview, in CSS pixels and seconds. They are not the preview's slider
 * numbers: the preview's shader worked on a raster texture, while this field is
 * a set of procedural layers over live HTML (owner clarification, November 2,
 * 2026). The archived preview export keeps its own identity in
 * `CRT_FIELD_REFERENCE` and in `src/ui/crt-glass/preset.ts`; nothing here is
 * read from it. No slider or Settings control ships: the only user choice is
 * the existing Visual effects checkbox, plus the OS reduced-motion preference.
 */

export interface CrtFieldConfig {
  /** Changes whenever any value below changes, so evidence names what it measured. */
  readonly id: string
  /** Curved horizontal scanlines that drift. */
  readonly lines: {
    /** Distance between line centres, CSS px. */
    readonly periodPx: number
    /** Line stroke thickness, CSS px. */
    readonly thicknessPx: number
    /** Darkening of each line, 0–1. Restrained: source colours stay clear. */
    readonly opacity: number
    /** Barrel bow at the top and bottom edges, CSS px; 0 is straight. */
    readonly curvaturePx: number
    /** Seconds for the lines to drift one period. */
    readonly driftSecondsPerPeriod: number
  }
  /** Soft procedural grain, refreshed on its own clock. */
  readonly grain: {
    /** Grain light, 0–1. */
    readonly opacity: number
    /** Turbulence frequency per CSS px; higher is finer. */
    readonly frequency: number
    /** Feathering of the grain alone, a blur radius in CSS px. */
    readonly featherPx: number
    /** Grain refreshes per second, independent of the line drift. */
    readonly refreshHz: number
    /** Distinct grain placements cycled through before the sequence repeats. */
    readonly frames: number
    /** Side of the seamless grain tile, CSS px. */
    readonly tilePx: number
  }
  /** Perimeter darkening. */
  readonly vignette: {
    /** Fraction of the half-diagonal, from the centre, that stays untouched. */
    readonly clearFraction: number
    /** Darkening at the far corners, 0–1. */
    readonly opacity: number
  }
  /** Perimeter softness; the centre is never blurred. */
  readonly perimeter: {
    /** Blur at the very edge, CSS px. */
    readonly blurPx: number
    /** How far the softness reaches in from each edge, as a fraction of the half-size. */
    readonly widthFraction: number
  }
}

export const CRT_FIELD_CONFIG: CrtFieldConfig = Object.freeze({
  id: 'clr-crt-field/review-2026-11-03.1',
  lines: Object.freeze({
    periodPx: 4,
    thicknessPx: 2,
    opacity: 0.16,
    curvaturePx: 6,
    driftSecondsPerPeriod: 0.7,
  }),
  grain: Object.freeze({
    opacity: 0.07,
    frequency: 0.85,
    featherPx: 0.4,
    refreshHz: 0.5,
    frames: 8,
    tilePx: 160,
  }),
  vignette: Object.freeze({
    clearFraction: 0.62,
    opacity: 0.3,
  }),
  perimeter: Object.freeze({
    blurPx: 1.2,
    widthFraction: 0.14,
  }),
})

/**
 * The archived preview export the field was interpreted from, kept separate
 * from the shipping values. It is reference identity only.
 */
export const CRT_FIELD_REFERENCE = Object.freeze({
  settingsFile: 'crt-iab-current-settings.json',
  settingsSha256: '3169d4608c8babe17a20670bd59f53e3110c7ce917641786d33c2713943ca033',
  host: 'crt-glass-motion/index.html',
  sources: Object.freeze([
    'crt-glass-motion/study.mjs',
    'crt-glass-motion/study.css',
    'crt-glass-motion/glass-effect.mjs',
    'crt-glass-motion/motion-clock.mjs',
  ]),
})

/**
 * The configuration as the custom properties the stylesheet reads. Unitless
 * numbers: the stylesheet gives each its unit, so the values stay plain data.
 */
export function crtFieldCustomProperties(config: CrtFieldConfig = CRT_FIELD_CONFIG): Record<string, string> {
  return {
    '--clr-crt-line-period': String(config.lines.periodPx),
    '--clr-crt-line-opacity': String(config.lines.opacity),
    '--clr-crt-grain-opacity': String(config.grain.opacity),
    '--clr-crt-grain-tile': String(config.grain.tilePx),
    '--clr-crt-vignette-clear': String(config.vignette.clearFraction * 100),
    '--clr-crt-vignette-opacity': String(config.vignette.opacity),
    '--clr-crt-perimeter-blur': String(config.perimeter.blurPx),
    '--clr-crt-perimeter-width': String(config.perimeter.widthFraction),
  }
}

/**
 * The curved lines for a field of `width` × `height` CSS px, as one SVG path.
 * Each line bows away from the horizontal centre line, most at the top and
 * bottom edges, as a curved tube face does. One extra period is drawn above
 * and below so the drift never exposes an edge.
 */
export function crtFieldLinePath(width: number, height: number, config: CrtFieldConfig = CRT_FIELD_CONFIG): string {
  const { periodPx, curvaturePx } = config.lines
  if (width <= 0 || height <= 0 || periodPx <= 0) return ''
  const round = (value: number) => Math.round(value * 100) / 100
  const segments: string[] = []
  for (let y = -periodPx; y <= height + periodPx; y += periodPx) {
    // +1 at the top edge, −1 at the bottom: edges sit below the centre at the
    // top and above it at the bottom, so every line bows outward.
    const bow = curvaturePx * Math.max(-1, Math.min(1, 1 - (2 * y) / height))
    // A quadratic's midpoint is a quarter of the way to its control point.
    segments.push(`M0 ${round(y + bow / 2)}Q${round(width / 2)} ${round(y - (bow * 3) / 2)} ${round(width)} ${round(y + bow / 2)}`)
  }
  return segments.join('')
}

/**
 * The seamless grain tile, built once from the configuration: fractal noise as
 * white light with alpha, feathered by a blur inside the tile itself so the
 * feathering never reaches the lines or the page.
 */
export function crtFieldGrainTile(config: CrtFieldConfig = CRT_FIELD_CONFIG): string {
  const { tilePx, frequency, featherPx } = config.grain
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${tilePx}' height='${tilePx}'>` +
    `<filter id='g' x='0' y='0' width='100%' height='100%'>` +
    `<feTurbulence type='fractalNoise' baseFrequency='${frequency}' numOctaves='2' seed='7' stitchTiles='stitch'/>` +
    `<feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1.6 -0.55'/>` +
    `<feGaussianBlur stdDeviation='${featherPx}' edgeMode='wrap'/>` +
    `</filter><rect width='100%' height='100%' filter='url(#g)'/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}
