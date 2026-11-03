/**
 * TASK-201 — pixel arithmetic for the proof. Pure numbers: no pass tolerance
 * lives here, and nothing here decides adoption.
 */
import type { Page } from '@playwright/test'

export interface Rgba { width: number; height: number; data: Uint8Array }

/** Decode a PNG with the browser's own decoder, no colour conversion. */
export async function decodePng(page: Page, png: Buffer): Promise<Rgba> {
  const decoded = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), {
      colorSpaceConversion: 'none', premultiplyAlpha: 'none',
    })
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d', { colorSpace: 'srgb' })!
    context.drawImage(bitmap, 0, 0)
    const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data
    let binary = ''
    for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000))
    return { width: bitmap.width, height: bitmap.height, data: btoa(binary) }
  }, png.toString('base64'))
  return { width: decoded.width, height: decoded.height, data: new Uint8Array(Buffer.from(decoded.data, 'base64')) }
}

export function fromBase64(width: number, height: number, base64: string): Rgba {
  return { width, height, data: new Uint8Array(Buffer.from(base64, 'base64')) }
}

interface ChannelStats { maxAbs: number; meanAbs: number; differing: number; fraction: number }
export interface DiffStats {
  pixels: number
  r: ChannelStats
  g: ChannelStats
  b: ChannelStats
  anyChannel: { differing: number; fraction: number }
}

const round = (value: number, places = 6) => Number(value.toFixed(places))

/** Per-channel max/mean absolute difference and differing counts, over a mask. */
export function diffStats(a: Rgba, b: Rgba, mask?: Uint8Array): DiffStats {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`TASK-201 blocker: compared images differ in size (${a.width}x${a.height} vs ${b.width}x${b.height})`)
  }
  const max = [0, 0, 0]
  const sum = [0, 0, 0]
  const diff = [0, 0, 0]
  let pixels = 0
  let any = 0
  for (let p = 0; p < a.width * a.height; p++) {
    if (mask && !mask[p]) continue
    pixels++
    let changed = false
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(a.data[p * 4 + c]! - b.data[p * 4 + c]!)
      if (d > max[c]!) max[c] = d
      sum[c]! += d
      if (d > 0) { diff[c]!++; changed = true }
    }
    if (changed) any++
  }
  const channel = (c: number): ChannelStats => ({
    maxAbs: max[c]!, meanAbs: round(pixels ? sum[c]! / pixels : 0), differing: diff[c]!, fraction: round(pixels ? diff[c]! / pixels : 0),
  })
  return { pixels, r: channel(0), g: channel(1), b: channel(2), anyChannel: { differing: any, fraction: round(pixels ? any / pixels : 0) } }
}

/** Mean absolute difference over all three channels. */
export function meanAbs(a: Rgba, b: Rgba, mask?: Uint8Array): number {
  const s = diffStats(a, b, mask)
  return round((s.r.meanAbs + s.g.meanAbs + s.b.meanAbs) / 3)
}

export const identical = (s: DiffStats) => s.r.maxAbs === 0 && s.g.maxAbs === 0 && s.b.maxAbs === 0

/** Pearson correlation of two signed per-pixel change fields (a − base, b − base), all channels. */
export function changeCorrelation(a: Rgba, b: Rgba, base: Rgba, mask?: Uint8Array): number {
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0
  for (let p = 0; p < base.width * base.height; p++) {
    if (mask && !mask[p]) continue
    for (let c = 0; c < 3; c++) {
      const x = a.data[p * 4 + c]! - base.data[p * 4 + c]!
      const y = b.data[p * 4 + c]! - base.data[p * 4 + c]!
      n++; sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y
    }
  }
  const cov = sab / n - (sa / n) * (sb / n)
  const va = saa / n - (sa / n) ** 2
  const vb = sbb / n - (sb / n) ** 2
  return va > 0 && vb > 0 ? round(cov / Math.sqrt(va * vb)) : 0
}

/**
 * The still-pair regions: the edge-softness reach boundary splits centre from
 * perimeter (box distance from the centre, as the preserved fragment measures
 * it), and the source's brightest channel splits the protection bands.
 */
export function stillRegions(source: Rgba, edgeWidth: number, low: number, high: number) {
  const { width: W, height: H } = source
  const n = W * H
  const make = () => new Uint8Array(n)
  const regions = { wholeFrame: make(), centre: make(), perimeterBand: make(), sourceBelowLow: make(), sourceLowToHigh: make(), sourceAtOrAboveHigh: make() }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x
      const edge = Math.max(Math.abs((x + 0.5) / W - 0.5) / 0.5, Math.abs((y + 0.5) / H - 0.5) / 0.5)
      regions.wholeFrame[p] = 1
      if (edge < 1 - edgeWidth) regions.centre[p] = 1
      else regions.perimeterBand[p] = 1
      const peak = Math.max(source.data[p * 4]!, source.data[p * 4 + 1]!, source.data[p * 4 + 2]!) / 255
      if (peak < low) regions.sourceBelowLow[p] = 1
      else if (peak < high) regions.sourceLowToHigh[p] = 1
      else regions.sourceAtOrAboveHigh[p] = 1
    }
  }
  return regions
}

export interface Rect { x: number; y: number; width: number; height: number }

export function rectMask(W: number, H: number, rects: Rect[]): Uint8Array {
  const mask = new Uint8Array(W * H)
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y))
    const x1 = Math.min(W, Math.ceil(r.x + r.width)), y1 = Math.min(H, Math.ceil(r.y + r.height))
    for (let y = y0; y < y1; y++) mask.fill(1, y * W + x0, y * W + Math.max(x0, x1))
  }
  return mask
}

export const invert = (mask: Uint8Array) => mask.map((v) => (v ? 0 : 1))

/** Peak-channel residual of a frame against a base, projected onto a two-field basis. */
export function projectPhase(frame: Rgba, base: Float64Array, cos: number[], sin: number[], mask: Uint8Array) {
  let a = 0, b = 0, n = 0
  for (let p = 0; p < frame.width * frame.height; p++) {
    if (!mask[p]) continue
    const peak = Math.max(frame.data[p * 4]!, frame.data[p * 4 + 1]!, frame.data[p * 4 + 2]!)
    const r = peak - base[p]!
    a += r * (2 * cos[p]! / 255 - 1)
    b += r * (2 * sin[p]! / 255 - 1)
    n++
  }
  return { phase: Math.atan2(b, a), amplitude: Math.hypot(a, b) / Math.max(1, n) * 2 }
}

export function meanPeak(frames: Rgba[]): Float64Array {
  const base = new Float64Array(frames[0]!.width * frames[0]!.height)
  for (const f of frames) {
    for (let p = 0; p < base.length; p++) base[p]! += Math.max(f.data[p * 4]!, f.data[p * 4 + 1]!, f.data[p * 4 + 2]!) / frames.length
  }
  return base
}

export function intervalStats(values: number[]) {
  if (!values.length) return { count: 0, mean: 0, p50: 0, p95: 0, max: 0 }
  const sorted = [...values].sort((x, y) => x - y)
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!
  return {
    count: values.length,
    mean: round(values.reduce((s, v) => s + v, 0) / values.length, 3),
    p50: round(at(0.5), 3), p95: round(at(0.95), 3), max: round(sorted.at(-1)!, 3),
  }
}
