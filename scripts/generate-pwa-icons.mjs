/**
 * PWA-01 — the chamfered CLEAR mark, rendered to the raster sizes a manifest
 * and iOS need, as a Vite plugin.
 *
 * The mark is geometry, not type. The export's `assets/favicon.svg` sets a `C`
 * in Oxanium, which cannot be rasterized without shipping a font renderer, and
 * its `rx="6"` rounding contradicts the standing "corner radius is 0" rule. So
 * the glyph is drawn the way the export draws icons — orthogonal and 45° edges
 * only, zero curves (`assets/README.md`) — and the badge carries the chamfered
 * bottom-right corner the design system cuts on every frame
 * (`css/foundation.css` `.clr-chamfer`).
 *
 * The icons are emitted by the build rather than committed as binaries: one
 * source of truth for the two skin values below, nothing to regenerate by hand,
 * and `src/test/pwa-icons.test.ts` renders them here and asserts what comes
 * out. This module lives in `scripts/` rather than `src/` because those two
 * values are literal hex, which the DS-08 gate correctly refuses anywhere in
 * app-owned source.
 */
import { deflateSync } from 'node:zlib'

/**
 * The two skin values the mark is made of. Neither a manifest nor a PNG can
 * read a CSS custom property, so they are repeated here, once, from the CLEAR
 * skin (`src/styles/skin-clear.css`: `--base`, `--structure`).
 * `src/test/pwa-icons.test.ts` fails if they drift from the skin, and
 * `public/manifest.webmanifest` is checked against them too.
 */
export const BASE = '#171717'
export const STRUCTURE = '#F87823'

/** Everything below is expressed on a 32×32 grid and scaled at render time. */
const GRID = 32

/**
 * The badge: a square with the bottom-right corner cut at 45°, which is the
 * `.clr-chamfer` silhouette.
 */
const badge = (chamfer) => [
  [0, 0],
  [GRID, 0],
  [GRID, GRID - chamfer],
  [GRID - chamfer, GRID],
  [0, GRID],
]

/**
 * The `C`: a square ring open on the right, with both open tips chamfered —
 * the export's signature directional detail.
 */
const glyph = () => [
  [8, 8],
  [22, 8],
  [24, 10],
  [24, 12],
  [12, 12],
  [12, 20],
  [24, 20],
  [24, 22],
  [22, 24],
  [8, 24],
]

const scalePolygon = (points, scale, offset = 0) =>
  points.map(([x, y]) => [x * scale + offset, y * scale + offset])

const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

/**
 * How much of the badge the glyph occupies. Exported because a test that wants
 * to sample a stroke has to know where the renderer put it.
 */
export const DEFAULT_GLYPH_SCALE = 0.75

/** Sub-samples per pixel axis; 4 is enough to keep a 45° edge from stepping. */
const SAMPLES = 4

/**
 * Per-pixel coverage of a simple polygon, by scanline. Sampling rows at
 * sub-pixel offsets and filling the spans between sorted edge crossings is
 * exact for the straight edges this mark is made of.
 */
function rasterize(points, size) {
  const coverage = new Float64Array(size * size)
  const weight = 1 / (SAMPLES * SAMPLES)

  for (let row = 0; row < size * SAMPLES; row += 1) {
    const y = (row + 0.5) / SAMPLES
    const crossings = []

    for (let i = 0; i < points.length; i += 1) {
      const [x1, y1] = points[i]
      const [x2, y2] = points[(i + 1) % points.length]

      if (y1 === y2) continue
      // Half-open in y, so a vertex shared by two edges is counted once.
      if (y < Math.min(y1, y2) || y >= Math.max(y1, y2)) continue

      crossings.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1))
    }

    crossings.sort((a, b) => a - b)

    for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
      const from = crossings[pair]
      const to = crossings[pair + 1]
      const firstColumn = Math.max(0, Math.ceil(from * SAMPLES - 0.5))
      const lastColumn = Math.min(size * SAMPLES - 1, Math.ceil(to * SAMPLES - 0.5) - 1)

      for (let column = firstColumn; column <= lastColumn; column += 1) {
        const pixel =
          Math.floor(row / SAMPLES) * size + Math.floor(column / SAMPLES)
        coverage[pixel] += weight
      }
    }
  }

  return coverage
}

/** Source-over composite of one flat-coloured polygon onto an RGBA buffer. */
function paint(rgba, size, points, color) {
  const coverage = rasterize(points, size)
  const [red, green, blue] = hexToRgb(color)

  for (let pixel = 0; pixel < coverage.length; pixel += 1) {
    const alpha = Math.min(1, coverage[pixel])
    if (alpha === 0) continue

    const offset = pixel * 4
    const existing = rgba[offset + 3] / 255
    const out = alpha + existing * (1 - alpha)

    rgba[offset] = Math.round(
      (red * alpha + rgba[offset] * existing * (1 - alpha)) / out,
    )
    rgba[offset + 1] = Math.round(
      (green * alpha + rgba[offset + 1] * existing * (1 - alpha)) / out,
    )
    rgba[offset + 2] = Math.round(
      (blue * alpha + rgba[offset + 2] * existing * (1 - alpha)) / out,
    )
    rgba[offset + 3] = Math.round(out * 255)
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)

  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }

  return table
})()

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)

  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))

  return Buffer.concat([length, body, crc])
}

/** Minimal 8-bit RGBA PNG: one IDAT, filter 0 on every scanline. */
function encodePng(rgba, size) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.writeUInt8(8, 8) // bit depth
  header.writeUInt8(6, 9) // colour type: truecolour with alpha
  header.writeUInt8(0, 10) // compression
  header.writeUInt8(0, 11) // filter
  header.writeUInt8(0, 12) // interlace

  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)

  for (let row = 0; row < size; row += 1) {
    raw[row * (stride + 1)] = 0 // filter type: none
    Buffer.from(rgba.buffer, row * stride, stride).copy(
      raw,
      row * (stride + 1) + 1,
    )
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * `any` icons keep the chamfered silhouette — the cut corner is the brand, so
 * it survives as transparency rather than being drawn over. `maskable` and the
 * iOS icon are full-bleed instead, because the platform supplies its own mask
 * and a transparent corner would read as a hole.
 *
 * @param {{ size: number, fullBleed: boolean, glyphScale?: number }} spec
 * @returns {Buffer} the encoded PNG
 */
export function renderIcon({
  size,
  fullBleed,
  glyphScale = DEFAULT_GLYPH_SCALE,
}) {
  const rgba = new Uint8Array(size * size * 4)
  const scale = size / GRID

  paint(
    rgba,
    size,
    scalePolygon(badge(fullBleed ? 0 : GRID / 8), scale),
    BASE,
  )

  // The glyph is inset symmetrically, so a maskable icon shrinks it into the
  // 80% safe zone without moving it off centre.
  paint(
    rgba,
    size,
    scalePolygon(glyph(), scale * glyphScale, (size * (1 - glyphScale)) / 2),
    STRUCTURE,
  )

  return encodePng(rgba, size)
}

/** Every raster `manifest.webmanifest` and `index.html` reference. */
export const ICONS = [
  { file: 'icons/icon-192.png', size: 192, fullBleed: false },
  { file: 'icons/icon-512.png', size: 512, fullBleed: false },
  // The maskable safe zone is the centre 80%; 0.55 keeps the mark inside it
  // even after a platform crops to a circle.
  {
    file: 'icons/icon-maskable-512.png',
    size: 512,
    fullBleed: true,
    glyphScale: 0.55,
  },
  // iOS renders this at 180 and applies its own corner treatment.
  { file: 'icons/apple-touch-icon-180.png', size: 180, fullBleed: true },
]

/**
 * Emits the icons into the build, and serves the same bytes in dev so the
 * install prompt can be exercised locally. Not `apply`-scoped: unlike the DS-07
 * specimen middleware, these files ship.
 *
 * @returns {import('vite').Plugin}
 */
export function pwaIcons() {
  /** @type {Map<string, Buffer>} */
  const rendered = new Map()
  // `emitFile` belongs to the build; in serve mode the middleware below is how
  // the same bytes are delivered.
  let isBuild = false

  const render = (/** @type {typeof ICONS[number]} */ icon) => {
    const existing = rendered.get(icon.file)
    if (existing !== undefined) return existing

    const png = renderIcon(icon)
    rendered.set(icon.file, png)
    return png
  }

  return {
    name: 'clear:pwa-icons',

    configResolved(config) {
      isBuild = config.command === 'build'
    },

    buildStart() {
      if (!isBuild) return

      for (const icon of ICONS) {
        // A fixed `fileName` rather than a hashed asset name: the manifest and
        // the iOS <link> reference these paths literally.
        this.emitFile({ type: 'asset', fileName: icon.file, source: render(icon) })
      }
    },

    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? '').split('?')[0].replace(/^\//, '')
        const icon = ICONS.find((candidate) => candidate.file === path)

        if (icon === undefined) {
          next()
          return
        }

        response.setHeader('Content-Type', 'image/png')
        response.end(render(icon))
      })
    },
  }
}
