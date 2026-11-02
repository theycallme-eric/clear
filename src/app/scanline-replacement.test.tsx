/**
 * Effects TASK-006 (REQ-006) — the decorative scanline owners and the CRT
 * Glass field at the root.
 *
 * Inventory first. The 0.14.3 import paints the decorative scanline signal
 * from exactly three active owners: the atmosphere's `.clr-atmosphere__scan`,
 * the `--frame-scan` texture on every `.clr-chamfer` surface, and the scan in
 * `.clr-dialog::backdrop`. Busy frames and busy buttons sweep the same texture
 * as state feedback. `.scanlines-overlay` is bundled but nothing renders it.
 *
 * Then the integration's state. The preserved pass needs the pixels beneath
 * it — edge softness samples neighbours, colour protection and the final RGB
 * scaling divide by each pixel's own peak (`glass-effect.mjs`) — and the live
 * shell has none without a DOM-to-texture capture, which the owner excludes
 * (ADOPTION-REQUIREMENTS.txt). So the integration stopped with a sourced gap
 * (docs/journal/clear-effects-2026-10-30/TASK-006.md, measured by
 * e2e/effects/crt-composition-fidelity.spec.ts). Until it is resolved, nothing
 * is half-replaced: no field is mounted, no old owner is retired, and every
 * exposed pixel still receives the decorative signal exactly once — from the
 * shipped owners.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { act, render } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { AppProviders, renderApp, signedIn } from '../test/render'
import { routes } from './router'

const foundation = readFileSync('src/design-system/css/foundation.css', 'utf8')
const motion = readFileSync('src/design-system/css/motion.css', 'utf8')

/** Every repository-owned runtime file: the immutable import and tests excluded. */
function ownedFiles(dir = 'src'): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (path === join('src', 'design-system') || path === join('src', 'test')) return []
    if (statSync(path).isDirectory()) return ownedFiles(path)
    return /\.(css|tsx?)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

const owned = ownedFiles().map((path) => ({ path, text: readFileSync(path, 'utf8') }))
/** Rules only: a comment that names an owner is not a rule that retires it. */
const ownedCss = owned
  .filter(({ path }) => path.endsWith('.css'))
  .map(({ path, text }) => ({ path, text: text.replace(/\/\*[\s\S]*?\*\//g, '') }))

/** The declaration block of the first rule whose selector is exactly `selector`. */
function rule(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`)
  expect(at, selector).toBeGreaterThanOrEqual(0)
  return css.slice(at, css.indexOf('}', at) + 1)
}

afterEach(() => {
  localStorage.removeItem('clear.visual-effects')
})

describe('inventory of the decorative scanline owners in the 0.14.3 import', () => {
  it('paints the atmosphere scan as its own full-layer repeating gradient', () => {
    expect(rule(foundation, '.clr-atmosphere__scan')).toMatch(/inset: 0;.*repeating-linear-gradient\(to bottom/)
  })

  it('textures every framed surface with --frame-scan', () => {
    expect(foundation).toMatch(/--frame-scan: repeating-linear-gradient\(to bottom,/)
    expect(rule(foundation, '.clr-chamfer::before')).toContain('background-image: var(--frame-scan);')
  })

  it('scans the dialog backdrop', () => {
    expect(rule(foundation, '.clr-dialog::backdrop')).toMatch(/^[^}]*background: var\(--frame-scan\),/)
  })

  it('keeps the busy sweeps as state feedback, separate from the decoration', () => {
    const busyFrame = rule(foundation, '.clr-chamfer[aria-busy="true"]:not(.clr-btn)::before')
    const busyButton = rule(foundation, '.clr-btn[aria-busy="true"]::before')
    for (const sweep of [busyFrame, busyButton]) {
      expect(sweep).toMatch(/background-image: linear-gradient\(to bottom, transparent, [^)]+\) r g b \/ 0\.\d+\), transparent\), var\(--frame-scan\)/)
      expect(sweep).toMatch(/animation: clr-btn-scan /)
    }
    expect(motion).toMatch(/\.clr-scan-band \{[^}]*animation: clr-scan-sweep /)
  })

  it('does not count the bundled .scanlines-overlay: nothing the app owns renders it', () => {
    expect(foundation).toContain('.scanlines-overlay::after {')
    expect(owned.length).toBeGreaterThan(100)
    for (const { path, text } of owned) expect(text, path).not.toContain('scanlines-overlay')
  })

  it('leaves the 0.14.3 import as shipped', () => {
    const pkg = JSON.parse(readFileSync('src/design-system/package.json', 'utf8')) as { version: string }
    expect(pkg.version).toBe('0.14.3')
  })
})

describe('integration stopped with a sourced gap: nothing is half-replaced', () => {
  it('records the gap where the successor reads it', () => {
    const record = readFileSync('docs/journal/clear-effects-2026-10-30/TASK-006.md', 'utf8')
    expect(record).toContain('## Sourced gap')
    expect(record).toContain('e2e/effects/crt-composition-fidelity.spec.ts')
  })

  it('retires no old owner in repository-owned styles while no field replaces it', () => {
    // The one existing exception predates the effects work: B05-07.4 made the
    // set-logging sheet's own frame plain and opaque (its fields keep theirs).
    const sheet = ownedCss.find(({ path }) => path.endsWith('set-logging-sheet.css'))!.text
    expect(rule(sheet, '.clr-set-sheet .clr-set-sheet__frame::before')).toContain('background-image: none;')
    for (const { path, text } of ownedCss) {
      expect(text, path).not.toMatch(/\.clr-atmosphere__scan[^{]*\{[^}]*(display: none|background: none|opacity: 0)/)
      expect(text, path).not.toMatch(/--frame-scan\s*:/)
      expect(text, path).not.toMatch(/\.clr-dialog::backdrop[^{]*\{/)
    }
  })

  it('mounts no CRT Glass field and captures no DOM anywhere in the app', () => {
    for (const { path, text } of owned) {
      if (path.startsWith(join('src', 'ui', 'crt-glass'))) continue
      expect(text, path).not.toMatch(/<CrtGlassField\b/)
      expect(text, path).not.toMatch(/html2canvas|dom-to-image|foreignObject/)
    }
  })

  it.each(['on', 'off'])('paints the shipped owners once, with no field, with Visual effects %s', (effects) => {
    localStorage.setItem('clear.visual-effects', effects)
    const { container } = renderApp(['/generate'], signedIn())

    expect(container.querySelectorAll('.clr-atmosphere')).toHaveLength(1)
    expect(container.querySelectorAll('.clr-atmosphere__scan')).toHaveLength(1)
    expect(container.querySelectorAll('canvas, .clr-crt-glass')).toHaveLength(0)
    expect(container.querySelectorAll('.scanlines-overlay')).toHaveLength(0)
    // The decorative host still holds only the one Echo definition.
    const host = container.querySelector('.clr-effects-host')
    expect(host).toHaveAttribute('data-effects', effects)
    expect(host?.children).toHaveLength(1)
    expect(host?.querySelector('filter')).toHaveAttribute('id', 'clr-phosphor-echo')
  })

  it('keeps the one live atmosphere node and its three blobs across navigation', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/generate'] })
    const { container } = render(
      <AppProviders {...signedIn()}>
        <RouterProvider router={router} />
      </AppProviders>,
    )
    const layer = container.querySelector('.clr-atmosphere')
    const blobs = [...(layer?.querySelectorAll('.clr-atmosphere__blob') ?? [])]
    expect(blobs).toHaveLength(3)

    for (const path of ['/', '/settings', '/generate']) {
      await act(async () => {
        await router.navigate(path)
      })
      expect(container.querySelector('.clr-atmosphere'), path).toBe(layer)
      expect([...container.querySelectorAll('.clr-atmosphere__blob')], path).toEqual(blobs)
      expect(layer, path).not.toHaveAttribute('data-static')
    }
  })
})
