/**
 * Effects TASK-006 (REQ-006) — the live CRT Glass field replaces the old
 * decorative scanlines in the app shell.
 *
 * Mounted behaviour on actual routes: the one field in the root effects host,
 * the retired atmosphere scan, the policy transitions (Visual effects off,
 * reduced motion, hidden tab) and navigation. The stylesheet assertions check
 * that the retirement lives in repository-owned CSS and that the 0.14.3 import
 * still carries its own rules untouched. Rendering and motion are proven in a
 * real browser by `e2e/effects/crt-composition-fidelity.spec.ts`.
 */
import { readFileSync, readdirSync } from 'node:fs'

import { act, render } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { setVisualEffects } from '../state/visual-effects'
import { AppProviders, renderApp, signedIn } from '../test/render'
import {
  CRT_FIELD_CONFIG,
  CRT_FIELD_REFERENCE,
  crtFieldCustomProperties,
  crtFieldLinePath,
} from '../ui/crt-field/config'
import { routes } from './router'

const VENDOR_FOUNDATION = readFileSync('src/design-system/css/foundation.css', 'utf8')
const APP_ATMOSPHERE_CSS = readFileSync('src/styles/atmosphere.css', 'utf8')
const FIELD_CSS = readFileSync('src/ui/crt-field/crt-field.css', 'utf8')

function setReducedMotion(prefersReduced: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('prefers-reduced-motion') ? prefersReduced : false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  )
}

function fieldIn(container: HTMLElement) {
  return container.querySelector<HTMLElement>('.clr-effects-host > .clr-crt-field')
}

afterEach(() => {
  localStorage.removeItem('clear.visual-effects')
  vi.restoreAllMocks()
})

describe('the live CRT Glass field on actual routes', () => {
  it.each([
    ['/', {}],
    ['/generate', signedIn()],
    ['/settings', signedIn()],
  ] as const)('mounts once in the root effects host on %s, above the shell', (pathname, providers) => {
    const { container } = renderApp([pathname], providers)
    const field = fieldIn(container)

    expect(container.querySelectorAll('.clr-crt-field')).toHaveLength(1)
    expect(field).not.toBeNull()
    // Outside every screen's tree, beside the one atmosphere.
    expect(container.querySelector('.clr-shell .clr-crt-field')).toBeNull()
    expect(container.querySelectorAll('.clr-atmosphere')).toHaveLength(1)
    expect(field).toHaveAttribute('aria-hidden', 'true')
    expect(field).toHaveAttribute('data-crt-config', CRT_FIELD_CONFIG.id)
    expect(field).toHaveAttribute('data-motion', 'running')

    // Four procedural layers, in order: perimeter, lines, grain, vignette.
    expect([...field!.children].map((child) => child.getAttribute('class'))).toEqual([
      'clr-crt-field__perimeter',
      'clr-crt-field__lines',
      'clr-crt-field__grain',
      'clr-crt-field__vignette',
    ])
    // The lines are a real path; the grain is a procedural tile, not a capture.
    expect(field!.querySelector('.clr-crt-field__lines path')?.getAttribute('d')).toMatch(/^M0 /)
    expect(field!.querySelector<HTMLElement>('.clr-crt-field__grain')!.style.backgroundImage).toContain(
      'data:image/svg+xml',
    )
    expect(field!.querySelector('canvas, img, video')).toBeNull()

    // The configuration reaches the field as its custom properties.
    for (const [name, value] of Object.entries(crtFieldCustomProperties())) {
      expect(field!.style.getPropertyValue(name), name).toBe(value)
    }

    // The old atmosphere scan is not rendered.
    expect(container.querySelector('.clr-atmosphere__scan')).toBeNull()
  })

  it('keeps the same field and atmosphere nodes across navigation', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/welcome'] })
    const { container } = render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    )
    const field = fieldIn(container)
    const atmosphere = container.querySelector('.clr-atmosphere')

    expect(field).not.toBeNull()
    await act(async () => {
      await router.navigate('/login')
    })

    expect(fieldIn(container)).toBe(field)
    expect(container.querySelector('.clr-atmosphere')).toBe(atmosphere)
    expect(container.querySelectorAll('.clr-crt-field')).toHaveLength(1)
  })
})

describe('comfort transitions', () => {
  it('Visual effects off removes the field, holds the atmosphere still and restores neither scan', () => {
    const { container } = renderApp(['/'])
    const atmosphere = container.querySelector('.clr-atmosphere')

    act(() => setVisualEffects(false))
    expect(fieldIn(container)).toBeNull()
    expect(container.querySelector('.clr-atmosphere__scan')).toBeNull()
    expect(container.querySelector('.clr-atmosphere')).toBe(atmosphere)
    expect(atmosphere).toHaveAttribute('data-static', 'true')

    act(() => setVisualEffects(true))
    expect(fieldIn(container)).toHaveAttribute('data-motion', 'running')
    expect(container.querySelector('.clr-atmosphere')).toBe(atmosphere)
    expect(atmosphere).not.toHaveAttribute('data-static')
  })

  it('reduced motion keeps the field and pauses its clocks and the blobs', () => {
    setReducedMotion(true)
    const { container } = renderApp(['/'])

    expect(fieldIn(container)).toHaveAttribute('data-motion', 'paused')
    expect(container.querySelector('.clr-atmosphere')).toHaveAttribute('data-static', 'true')
    expect(container.querySelectorAll('.clr-atmosphere__blob')).toHaveLength(3)
  })

  it('a hidden tab pauses the field and the blobs; visible again resumes them', () => {
    const { container } = renderApp(['/'])
    const field = fieldIn(container)
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(fieldIn(container)).toBe(field)
    expect(field).toHaveAttribute('data-motion', 'paused')
    expect(container.querySelector('.clr-atmosphere')).toHaveAttribute('data-static', 'true')

    visibility.mockReturnValue('visible')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(field).toHaveAttribute('data-motion', 'running')
    expect(container.querySelector('.clr-atmosphere')).not.toHaveAttribute('data-static')
  })
})

describe('retired decorative scan owners, in repository-owned styles', () => {
  it('leaves the 0.14.3 import carrying its own rules, untouched', () => {
    expect(VENDOR_FOUNDATION).toContain('.clr-atmosphere__scan { position: absolute;')
    expect(VENDOR_FOUNDATION).toMatch(/\.clr-chamfer::before \{[^}]*background-image: var\(--frame-scan\);/)
    expect(VENDOR_FOUNDATION).toMatch(/\.clr-dialog::backdrop \{ background: var\(--frame-scan\), /)
  })

  it('retires the atmosphere, frame and dialog-backdrop scans in src/styles/atmosphere.css', () => {
    expect(APP_ATMOSPHERE_CSS).toMatch(/\.clr-atmosphere__scan \{\s*display: none;\s*\}/)
    expect(APP_ATMOSPHERE_CSS).toMatch(/\.clr-chamfer::before \{\s*background-image: none;\s*\}/)
    expect(APP_ATMOSPHERE_CSS).toMatch(/\.clr-dialog::backdrop \{\s*--frame-scan: none;\s*\}/)
  })

  it('keeps the busy sweeps: their more specific rules are not overridden', () => {
    expect(VENDOR_FOUNDATION).toContain('.clr-chamfer[aria-busy="true"]:not(.clr-btn)::before { background-image: linear-gradient(')
    expect(VENDOR_FOUNDATION).toContain('.clr-btn[aria-busy="true"]::before { background-image: linear-gradient(')
    const rulesOnly = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rulesOnly(APP_ATMOSPHERE_CSS)).not.toContain('aria-busy')
    expect(rulesOnly(FIELD_CSS)).not.toContain('aria-busy')
  })

  it('does not treat bundled but unused scanline classes as active layers', () => {
    const markup = readdirSync('src', { recursive: true })
      .map(String)
      .filter((name) => /\.tsx?$/.test(name) && !name.startsWith('design-system') && !/\.test\.tsx?$/.test(name))
      .map((name) => readFileSync(`src/${name}`, 'utf8'))
    expect(markup.some((source) => source.includes('scanlines-overlay'))).toBe(false)
    expect(APP_ATMOSPHERE_CSS).not.toMatch(/^\.scanlines-overlay/m)
  })
})

describe('one shipping configuration', () => {
  it('owns every appearance and cadence value, and the stylesheet reads each one', () => {
    for (const name of Object.keys(crtFieldCustomProperties())) {
      expect(FIELD_CSS, name).toContain(`var(${name})`)
    }
    // The host stylesheet carries no intensity of its own.
    expect(FIELD_CSS).not.toMatch(/opacity:\s*0?\.\d/)
    expect(FIELD_CSS).not.toMatch(/blur\(\d/)
  })

  it('keeps the archived preview identity separate from the shipping identity', () => {
    expect(CRT_FIELD_REFERENCE.settingsSha256).toBe(
      '3169d4608c8babe17a20670bd59f53e3110c7ce917641786d33c2713943ca033',
    )
    expect(CRT_FIELD_CONFIG.id).not.toContain(CRT_FIELD_REFERENCE.settingsSha256)
    // Line drift and grain refresh run on different clocks.
    expect(CRT_FIELD_CONFIG.lines.driftSecondsPerPeriod).not.toBe(1 / CRT_FIELD_CONFIG.grain.refreshHz)
    // Not the measured 1.4-second-per-frame SourceGraphic prototype cadence.
    expect(CRT_FIELD_CONFIG.lines.driftSecondsPerPeriod).toBeLessThan(1.4)
  })

  it('draws lines that bow outward from the centre, most at the edges', () => {
    const path = crtFieldLinePath(390, 844)
    const segments = [...path.matchAll(/M0 (-?[\d.]+)Q195 (-?[\d.]+) 390 (-?[\d.]+)/g)].map(
      ([, start, control, end]) => ({ start: Number(start), control: Number(control), end: Number(end) }),
    )
    expect(segments.length).toBeGreaterThan(844 / CRT_FIELD_CONFIG.lines.periodPx)
    const top = segments[1]
    const bottom = segments[segments.length - 2]
    // Top: centre above the edges. Bottom: centre below them.
    expect(top.control).toBeLessThan(top.start)
    expect(bottom.control).toBeGreaterThan(bottom.start)
    expect(top.start).toBe(top.end)
  })

  it('ships no slider and no Settings control for the field', () => {
    const settings = readFileSync('src/app/Settings.tsx', 'utf8')
    expect(settings).not.toContain('crt-field')
    expect(settings).toContain('Visual effects')
  })
})
