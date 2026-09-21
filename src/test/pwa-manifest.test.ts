/**
 * PWA-01 acceptance, the installability half.
 *
 * Lighthouse's installability audit is a checklist over files that ship
 * outside the bundle — the manifest, the document head, and the worker's
 * registration path. So, as in `document-shell.test.ts` and
 * `deploy-config.test.ts`, the assertions are made against those files
 * directly. What a browser then does with them is verified on the preview; a
 * manifest that is missing a 512px icon never gets that far.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ICONS } from '../../scripts/generate-pwa-icons.mjs'
import { SERVICE_WORKER_URL } from '../app/service-worker'

const repoRoot = resolve(import.meta.dirname, '../..')

const read = (relativePath: string) =>
  readFileSync(resolve(repoRoot, relativePath), 'utf-8')

type ManifestIcon = {
  src: string
  sizes: string
  type: string
  purpose: string
}

type Manifest = {
  name?: string
  short_name?: string
  start_url?: string
  scope?: string
  display?: string
  theme_color?: string
  background_color?: string
  icons?: ManifestIcon[]
}

const manifest = JSON.parse(read('public/manifest.webmanifest')) as Manifest
const html = read('index.html')
const skin = read('src/styles/skin-clear.css')
const serviceWorker = read('public/sw.js')
const vercel = JSON.parse(read('vercel.json')) as {
  headers?: { source: string; headers: { key: string; value: string }[] }[]
}

/** A `--token: #hex;` declaration in the CLEAR skin. */
const skinToken = (name: string) =>
  skin.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1]

describe('web app manifest (PWA-01)', () => {
  it('names the app the way an installed icon has to read', () => {
    expect(manifest.name).toBe('CLEAR')
    expect(manifest.short_name).toBe('CLEAR')
  })

  it('launches standalone from the root, scoped to the whole app', () => {
    // `standalone` is what removes the browser chrome once installed.
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
  })

  it('carries the 192px and 512px PNGs installability requires', () => {
    const png = (size: string, purpose: string) =>
      manifest.icons?.find(
        (icon) =>
          icon.sizes === size &&
          icon.type === 'image/png' &&
          icon.purpose === purpose,
      )

    expect(png('192x192', 'any')).toBeDefined()
    expect(png('512x512', 'any')).toBeDefined()
    // Without a maskable icon, Android draws the square inside its own shape
    // and the chamfer is lost to a platform mask.
    expect(png('512x512', 'maskable')).toBeDefined()
  })

  it('references only icons the build actually emits', () => {
    const emitted = new Set(ICONS.map((icon) => `/${icon.file}`))
    // The scalable icon is a committed file rather than a rendered one.
    emitted.add('/icon.svg')

    for (const icon of manifest.icons ?? []) {
      expect(emitted).toContain(icon.src)
    }
  })

  it('declares each emitted PNG at the size it is rendered at', () => {
    for (const icon of manifest.icons ?? []) {
      const rendered = ICONS.find(
        (candidate) => `/${candidate.file}` === icon.src,
      )
      if (rendered === undefined) continue

      expect(icon.sizes).toBe(`${rendered.size}x${rendered.size}`)
    }
  })

  it('takes its colours from the CLEAR skin rather than inventing them', () => {
    const base = skinToken('base')

    expect(base).toBeDefined()
    expect(manifest.theme_color).toBe(base)
    expect(manifest.background_color).toBe(base)
  })
})

describe('document head (PWA-01)', () => {
  it('links the manifest', () => {
    expect(html).toMatch(/<link rel="manifest" href="\/manifest\.webmanifest"/)
  })

  it('declares a theme colour matching the manifest', () => {
    const themeColor = html.match(
      /<meta name="theme-color" content="([^"]*)"/,
    )?.[1]

    expect(themeColor).toBe(manifest.theme_color)
  })

  it('links an icon for the browser and one iOS can actually use', () => {
    expect(html).toMatch(
      /<link rel="icon" href="\/icon\.svg" type="image\/svg\+xml"/,
    )
    // iOS reads no SVG here and no manifest icon at all.
    const appleIcon = html.match(
      /<link rel="apple-touch-icon" href="([^"]*)"/,
    )?.[1]

    expect(appleIcon).toBeDefined()
    expect(appleIcon).toMatch(/\.png$/)
    expect(ICONS.map((icon) => `/${icon.file}`)).toContain(appleIcon)
  })

  it('asks iOS for a standalone launch with no Safari chrome', () => {
    expect(html).toMatch(
      /<meta name="apple-mobile-web-app-capable" content="yes"/,
    )
    expect(html).toMatch(/<meta name="mobile-web-app-capable" content="yes"/)
    expect(html).toMatch(
      /<meta name="apple-mobile-web-app-title" content="CLEAR"/,
    )
    expect(html).toMatch(/name="apple-mobile-web-app-status-bar-style"/)
  })
})

describe('worker delivery (PWA-01)', () => {
  it('registers the worker from the origin root, so its scope is the app', () => {
    expect(SERVICE_WORKER_URL).toBe('/sw.js')
    // A worker served from a subdirectory could not control '/'.
    expect(serviceWorker.length).toBeGreaterThan(0)
  })

  it('never lets the HTTP cache answer the worker update check', () => {
    const rule = vercel.headers?.find((entry) => entry.source === '/sw.js')
    const cacheControl = rule?.headers.find(
      (header) => header.key === 'Cache-Control',
    )?.value

    // A long-lived sw.js is the stale-shell trap one layer below the worker.
    expect(cacheControl).toMatch(/max-age=0/)
  })
})
