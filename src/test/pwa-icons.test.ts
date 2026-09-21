/**
 * PWA-01 — the icons the build emits.
 *
 * They are rendered, not committed, so the thing to check is the renderer's
 * output rather than a blob in the tree. Each assertion reads decoded pixels:
 * a PNG that is the right size but empty, or a "chamfered" icon with a square
 * corner, would pass any header-only check.
 */
import { inflateSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  BASE,
  DEFAULT_GLYPH_SCALE,
  ICONS,
  STRUCTURE,
  renderIcon,
} from '../../scripts/generate-pwa-icons.mjs'

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

type Pixel = { red: number; green: number; blue: number; alpha: number }

/**
 * Enough of a PNG reader for what this renderer writes: 8-bit RGBA, one IDAT,
 * filter 0 on every row. Anything else throws rather than guessing.
 */
function decode(png: Buffer) {
  expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE)

  const chunks = new Map<string, Buffer[]>()
  let offset = 8

  while (offset < png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('ascii', offset + 4, offset + 8)
    const data = png.subarray(offset + 8, offset + 8 + length)

    chunks.set(type, [...(chunks.get(type) ?? []), data])
    offset += length + 12
  }

  const header = chunks.get('IHDR')?.[0]
  if (header === undefined) throw new Error('PNG has no IHDR')

  const width = header.readUInt32BE(0)
  const height = header.readUInt32BE(4)
  expect(header.readUInt8(8)).toBe(8) // bit depth
  expect(header.readUInt8(9)).toBe(6) // RGBA

  const raw = inflateSync(Buffer.concat(chunks.get('IDAT') ?? []))
  const stride = width * 4

  const at = (x: number, y: number): Pixel => {
    const row = y * (stride + 1)
    expect(raw.readUInt8(row)).toBe(0) // filter: none
    const pixel = row + 1 + x * 4

    return {
      red: raw.readUInt8(pixel),
      green: raw.readUInt8(pixel + 1),
      blue: raw.readUInt8(pixel + 2),
      alpha: raw.readUInt8(pixel + 3),
    }
  }

  return { width, height, at }
}

const hex = ({ red, green, blue }: Pixel) =>
  `#${[red, green, blue]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase()

describe('rendered icons (PWA-01)', () => {
  it.each(ICONS)('$file is a square PNG at its declared size', (icon) => {
    const { width, height } = decode(renderIcon(icon))

    expect(width).toBe(icon.size)
    expect(height).toBe(icon.size)
  })

  it.each(ICONS)('$file draws the mark, not an empty square', (icon) => {
    const { at } = decode(renderIcon(icon))
    const scale = icon.glyphScale ?? DEFAULT_GLYPH_SCALE
    // Where a point on the renderer's 32-unit grid lands once the glyph has
    // been scaled about the centre.
    const onGlyph = (unit: number) =>
      Math.floor(icon.size * ((unit / 32) * scale + (1 - scale) / 2))

    // The C is open on the right, so its own centre row is background there;
    // the left upright — grid x 8–12 — is solid through it.
    expect(hex(at(onGlyph(10), onGlyph(16)))).toBe(STRUCTURE)
    expect(at(onGlyph(10), onGlyph(16)).alpha).toBe(255)
    expect(hex(at(onGlyph(18), onGlyph(16)))).toBe(BASE)
  })

  it.each(ICONS)('$file fills its field with the skin base', (icon) => {
    const { at } = decode(renderIcon(icon))
    const corner = at(1, 1)

    expect(hex(corner)).toBe(BASE)
    expect(corner.alpha).toBe(255)
  })

  it('cuts the bottom-right corner on every icon the app draws itself', () => {
    for (const icon of ICONS.filter((candidate) => !candidate.fullBleed)) {
      const { at } = decode(renderIcon(icon))
      const last = icon.size - 1

      // Chamfered: the corner is cut away entirely, and the pixel diagonally
      // opposite it on the same row is still the badge.
      expect(at(last, last).alpha).toBe(0)
      expect(at(0, last).alpha).toBe(255)
      expect(at(last, 0).alpha).toBe(255)
    }
  })

  it('leaves the platform-masked icons full-bleed, with no transparent corner', () => {
    for (const icon of ICONS.filter((candidate) => candidate.fullBleed)) {
      const { at } = decode(renderIcon(icon))
      const last = icon.size - 1

      // iOS composites a transparent corner against black, and Android crops
      // to its own shape; either way the cut belongs to the platform here.
      expect(at(last, last).alpha).toBe(255)
    }
  })

  it('keeps the maskable mark inside the centre 80% safe zone', () => {
    const maskable = ICONS.find((icon) => icon.glyphScale !== undefined)
    if (maskable === undefined) throw new Error('no maskable icon declared')

    const { at } = decode(renderIcon(maskable))
    const margin = Math.floor(maskable.size * 0.1)

    // Sample the ring outside the safe zone: nothing but background there.
    for (let step = 0; step < maskable.size; step += 8) {
      for (const pixel of [
        at(step, margin - 1),
        at(step, maskable.size - margin),
        at(margin - 1, step),
        at(maskable.size - margin, step),
      ]) {
        expect(hex(pixel)).toBe(BASE)
      }
    }
  })

  it('renders deterministically — same spec, same bytes', () => {
    for (const icon of ICONS) {
      expect(renderIcon(icon).equals(renderIcon(icon))).toBe(true)
    }
  })
})

describe('icon colours (PWA-01)', () => {
  const skin = readFileSync(
    resolve(import.meta.dirname, '../styles/skin-clear.css'),
    'utf-8',
  )

  /**
   * The renderer restates two skin values because a PNG reads no CSS token.
   * This is the check that keeps the restatement honest.
   */
  it.each([
    ['base', BASE],
    ['structure', STRUCTURE],
  ])('%s matches the CLEAR skin', (token, value) => {
    expect(skin).toMatch(new RegExp(`--${token}:\\s*${value};`))
  })
})

describe('the scalable icon (PWA-01)', () => {
  // Markup, not commentary: the file's header comment names the `rx="6"` it
  // exists to replace, and — as in fonts.test.ts — describing a thing is not
  // doing it.
  const svg = readFileSync(
    resolve(import.meta.dirname, '../../public/icon.svg'),
    'utf-8',
  ).replace(/<!--[\s\S]*?-->/g, '')

  it('uses the same two skin colours as the rasters', () => {
    expect(svg).toContain(BASE)
    expect(svg).toContain(STRUCTURE)
  })

  it('is drawn with straight edges only — no curve, no corner radius', () => {
    // The export's icon rule: orthogonal and 45° edges, zero curves.
    expect(svg).not.toMatch(/\b[CcSsQqTtAa]\d/)
    expect(svg).not.toMatch(/<(circle|ellipse)\b/)
    expect(svg).not.toMatch(/\brx=/)
  })

  it('carries the chamfer in its own outline', () => {
    // The badge path closes across a cut corner rather than meeting at 32,32.
    expect(svg).toMatch(/V28 L28 32/)
  })
})
