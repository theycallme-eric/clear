/**
 * Effects TASK-005 — pixel arithmetic for the CRT Glass fidelity spec.
 *
 * Frames are RGBA, row-major, top row first, 8 bits per channel. Nothing here
 * has a tolerance: a difference is a difference, and where frames differ the
 * regions are recorded for owner review rather than explained away.
 */
import { deflateSync } from 'node:zlib'

export interface Frame {
  width: number
  height: number
  rgba: Buffer
}

export interface DiffRegion {
  x: number
  y: number
  width: number
  height: number
  pixels: number
  maxDelta: number
}

export interface DiffStats {
  identical: boolean
  differingPixels: number
  maxDelta: [number, number, number, number]
  bounds: { x: number; y: number; width: number; height: number } | null
  /** 30 × 30 tiles that contain a difference, largest first, at most 40. */
  regions: DiffRegion[]
}

const TILE = 30

export function diff(a: Frame, b: Frame, mask?: (index: number) => boolean): DiffStats {
  if (a.width !== b.width || a.height !== b.height) throw new Error(`frame sizes differ: ${a.width}x${a.height} vs ${b.width}x${b.height}`)
  const { width, height } = a
  const maxDelta: [number, number, number, number] = [0, 0, 0, 0]
  const tiles = new Map<number, DiffRegion>()
  let differingPixels = 0
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      if (mask && !mask(index)) continue
      let pixelMax = 0
      for (let c = 0; c < 4; c += 1) {
        const delta = Math.abs(a.rgba[index * 4 + c]! - b.rgba[index * 4 + c]!)
        if (delta > maxDelta[c]!) maxDelta[c] = delta
        if (delta > pixelMax) pixelMax = delta
      }
      if (pixelMax === 0) continue
      differingPixels += 1
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      const key = Math.floor(y / TILE) * 1000 + Math.floor(x / TILE)
      const tile = tiles.get(key) ?? {
        x: Math.floor(x / TILE) * TILE,
        y: Math.floor(y / TILE) * TILE,
        width: TILE,
        height: TILE,
        pixels: 0,
        maxDelta: 0,
      }
      tile.pixels += 1
      tile.maxDelta = Math.max(tile.maxDelta, pixelMax)
      tiles.set(key, tile)
    }
  }
  return {
    identical: differingPixels === 0,
    differingPixels,
    maxDelta,
    bounds: maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    regions: [...tiles.values()].sort((p, q) => q.pixels - p.pixels).slice(0, 40),
  }
}

/** Brightness per pixel, mean of R, G and B. */
export function luminance(frame: Frame): Float64Array {
  const out = new Float64Array(frame.width * frame.height)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = (frame.rgba[i * 4]! + frame.rgba[i * 4 + 1]! + frame.rgba[i * 4 + 2]!) / 3
  }
  return out
}

export function subtract(a: Float64Array, b: Float64Array): Float64Array {
  return a.map((value, i) => value - b[i]!)
}

/** Mean absolute change along rows (x) and along columns (y). */
export function gradients(field: Float64Array, width: number, height: number) {
  let dx = 0
  let dy = 0
  for (let y = 1; y < height; y += 1) {
    for (let x = 1; x < width; x += 1) {
      const i = y * width + x
      dx += Math.abs(field[i]! - field[i - 1]!)
      dy += Math.abs(field[i]! - field[i - width]!)
    }
  }
  const n = (width - 1) * (height - 1)
  return { alongX: dx / n, alongY: dy / n }
}

function column(field: Float64Array, width: number, x: number, from: number, to: number): number[] {
  const out: number[] = []
  for (let y = from; y < to; y += 1) out.push(field[y * width + x]!)
  return out
}

function correlation(a: number[], b: number[], lag: number): number {
  let sum = 0
  let n = 0
  for (let i = 0; i < a.length; i += 1) {
    const j = i + lag
    if (j < 0 || j >= b.length) continue
    sum += a[i]! * b[j]!
    n += 1
  }
  return n ? sum / n : 0
}

/** The row shift (−8…8) that best aligns an edge column's line profile with the centre column's. */
export function curvatureLag(field: Float64Array, width: number, height: number, edgeX: number): number {
  const from = 12
  const to = Math.floor(height / 4)
  const centre = column(field, width, Math.floor(width / 2), from, to)
  const edge = column(field, width, edgeX, from, to)
  let best = 0
  let bestValue = -Infinity
  for (let lag = -8; lag <= 8; lag += 1) {
    const value = correlation(centre, edge, lag)
    if (value > bestValue) {
      bestValue = value
      best = lag
    }
  }
  return best
}

/**
 * Which way the lines travel as phase grows: the sign of the correlation of
 * the phase change with the line field's downward gradient. Positive means the
 * pattern moves down the screen.
 */
export function phaseDirection(wave: Float64Array, waveLater: Float64Array, width: number, height: number): number {
  let sum = 0
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x
      const change = waveLater[i]! - wave[i]!
      const gradient = (wave[i + width]! - wave[i - width]!) / 2
      sum -= change * gradient
    }
  }
  return Math.sign(sum)
}

/** Horizontal autocorrelation of a field at lags 1 and 2, relative to lag 0: grain cell scale. */
export function grainScale(field: Float64Array, width: number, height: number) {
  const at = (lag: number) => {
    let sum = 0
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x + lag < width; x += 1) sum += field[y * width + x]! * field[y * width + x + lag]!
    }
    return sum
  }
  const zero = at(0) || 1
  return { lag1: at(1) / zero, lag2: at(2) / zero }
}

// ---------------------------------------------------------------------------
// PNG, for the owner-review images only.
// ---------------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Buffer): number {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

export function encodePng(frame: Frame): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(frame.width, 0)
  header.writeUInt32BE(frame.height, 4)
  header[8] = 8
  header[9] = 6
  const stride = frame.width * 4
  const raw = Buffer.alloc((stride + 1) * frame.height)
  for (let y = 0; y < frame.height; y += 1) frame.rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Differing pixels in white on black, for review beside the two frames. */
export function diffImage(a: Frame, b: Frame): Frame {
  const rgba = Buffer.alloc(a.rgba.length)
  for (let i = 0; i < a.width * a.height; i += 1) {
    let delta = 0
    for (let c = 0; c < 4; c += 1) delta = Math.max(delta, Math.abs(a.rgba[i * 4 + c]! - b.rgba[i * 4 + c]!))
    const value = delta === 0 ? 0 : Math.min(255, 64 + delta * 16)
    rgba[i * 4] = value
    rgba[i * 4 + 1] = value
    rgba[i * 4 + 2] = value
    rgba[i * 4 + 3] = 255
  }
  return { width: a.width, height: a.height, rgba }
}
