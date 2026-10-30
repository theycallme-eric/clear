/**
 * REQ-002 — installed-PWA atmosphere behind the status icons, content safe.
 *
 * What this file proves is the markup and CSS boundary only: the document asks
 * an edge-to-edge viewport, the atmosphere declares its viewport attachment,
 * and the shell declares safe-area padding. Actual geometry belongs to the
 * focused browser checks, including controls outside the shell. jsdom has no
 * notch and resolves no `env()`, so this is not device proof — the installed
 * iPhone's status area, keyboard and launch/resume behaviour stay with the
 * owner's post-launch manual UAT and are not claimed here.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AtmosphereLayer } from '../ui/atmosphere'

const repoRoot = resolve(import.meta.dirname, '../..')

const read = (relativePath: string) =>
  readFileSync(resolve(repoRoot, relativePath), 'utf-8')

const html = read('index.html')
const foundation = read('src/design-system/css/foundation.css')
const shell = read('src/styles/shell.css')
const atmosphereCss = read('src/styles/atmosphere.css')

const viewport = html.match(/<meta name="viewport" content="([^"]*)"/)?.[1]

/**
 * The declaration block of the first top-level rule whose selector is exactly
 * `selector`. Rules nested in a media query are indented, so they never match.
 */
const rule = (css: string, selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1]
}

describe('viewport extends under the status icons (AC-008)', () => {
  it('declares viewport-fit=cover so the page reaches the screen edge', () => {
    expect(viewport).toBeDefined()
    expect(viewport).toMatch(/(^|,)\s*viewport-fit=cover\s*(,|$)/)
  })

  it('keeps the device-width, zoomable viewport it already had', () => {
    expect(viewport).toContain('width=device-width')
    expect(viewport).toContain('initial-scale=1.0')
    expect(viewport).not.toMatch(/user-scalable\s*=\s*(no|0)/)
    expect(viewport).not.toContain('maximum-scale')
  })

  it('asks the installed app for a translucent status bar over its own page', () => {
    // Preserve the requested translucent installed-app metadata. This assertion
    // does not establish how a particular installed iOS build renders it.
    const style = html.match(
      /name="apple-mobile-web-app-status-bar-style"\s+content="([^"]*)"/,
    )?.[1]

    expect(style).toBe('black-translucent')
  })
})

describe('the atmosphere, not a tint, fills that area (AC-007)', () => {
  it('renders the gradient blobs, dim overlay and scanlines as one fixed layer', () => {
    const { container } = render(<AtmosphereLayer />)
    const layer = container.querySelector('.clr-atmosphere')

    expect(layer).not.toBeNull()
    expect(layer).toHaveClass('clr-atmosphere--fixed')
    expect(layer).toHaveAttribute('aria-hidden', 'true')
    expect(layer?.querySelectorAll('.clr-atmosphere__blob')).toHaveLength(3)
    expect(layer?.querySelector('.clr-atmosphere__overlay')).not.toBeNull()
    expect(layer?.querySelector('.clr-atmosphere__scan')).not.toBeNull()
  })

  it('declares viewport attachment after vendor CSS without defeating the gallery frame', () => {
    const { container } = render(<AtmosphereLayer />)
    expect(container.querySelector('.clr-atmosphere')?.getAttribute('style')).toBeNull()
    expect(rule(atmosphereCss, '.clr-atmosphere--fixed')).toMatch(/position:\s*fixed/)
    const main = read('src/main.tsx')
    expect(main.indexOf("import './styles/atmosphere.css'")).toBeGreaterThan(
      main.indexOf("import './design-system/styles.css'"),
    )
    expect(rule(read('src/dev/gallery.css'), '.clr-dev-gallery__atmosphere .clr-atmosphere--fixed'))
      .toMatch(/position:\s*absolute/)
    const base = rule(foundation, '.clr-atmosphere')
    expect(base).toMatch(/inset:\s*0/)
    // The scanlines are a repeating gradient across the whole layer.
    expect(rule(foundation, '.clr-atmosphere__scan')).toMatch(/inset:\s*0/)
    expect(rule(foundation, '.clr-atmosphere__scan')).toContain('repeating-linear-gradient')
  })

  it('never insets the atmosphere by the safe area or swaps in a flat ground', () => {
    // A safe-area offset would leave the status area to the theme-colour tint.
    for (const css of [atmosphereCss, rule(foundation, '.clr-atmosphere') ?? '']) {
      expect(css).not.toContain('safe-area-inset')
    }
    expect(atmosphereCss).not.toMatch(/background(-color)?\s*:/)
    // The document behind the shell gets no solid fill of its own.
    expect(rule(shell, 'html,\nbody,\n#root')).toBeDefined()
    expect(rule(shell, 'html,\nbody,\n#root')).not.toMatch(/background/)
  })

  it('leaves theme-color as the fallback ground, the skin base, not a status-area tint', () => {
    const themeColor = html.match(/<meta name="theme-color" content="([^"]*)"/)?.[1]
    const base = read('src/styles/skin-clear.css').match(/--base:\s*(#[0-9A-Fa-f]{6})/)?.[1]

    expect(themeColor).toBe(base)
  })
})

describe('shell safe-area declarations (AC-075; browser geometry checked separately)', () => {
  const content = rule(shell, '.clr-shell--contained > .clr-shell__content')

  it('pads the shell content by every safe-area inset', () => {
    // B05: the top gap starts below the inset; the bottom inset is carried by
    // the screen's last layer, so the shell itself reserves nothing below.
    expect(content).toMatch(/--shell-inset-top:\s*calc\(env\(safe-area-inset-top\)\s*\+\s*var\(--shell-gap-top\)\)/)
    expect(content).toMatch(/padding-top:\s*var\(--shell-inset-top\)/)
    expect(content).toMatch(/--shell-inset-bottom:\s*max\(var\(--shell-gap-bottom\),\s*env\(safe-area-inset-bottom\)\)/)
    expect(content).toMatch(/padding-bottom:\s*0;/)
    expect(content).toMatch(/--shell-inset-left:\s*max\(var\(--spacing-\d+\),\s*env\(safe-area-inset-left\)\)/)
    expect(content).toMatch(/--shell-inset-right:\s*max\(var\(--spacing-\d+\),\s*env\(safe-area-inset-right\)\)/)
  })

  it('declares an in-flow header without a negative top offset', () => {
    const header = rule(shell, '.clr-screen > .clr-scroll-region > .clr-scroll-region__head > header')

    expect(header).toBeDefined()
    expect(header).not.toMatch(/position:\s*(fixed|absolute)/)
    expect(header).not.toMatch(/margin-top:\s*-/)
  })

  it('declares dynamic viewport height and document clipping for resize', () => {
    expect(rule(foundation, '.clr-shell--fixed')).toMatch(/height:\s*100dvh/)
    const root = rule(shell, 'html,\nbody,\n#root')
    expect(root).toMatch(/height:\s*100%/)
    // This checks the declared clipping boundary, not computed scrolling or
    // actual keyboard behavior on an installed device.
    expect(root).toMatch(/overflow:\s*hidden/)
  })
})
