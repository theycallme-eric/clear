/**
 * SET-01 — the committed marks, read back against the skins they belong to.
 *
 * A favicon cannot read a token, so `public/icons/` restates two hexes per
 * skin. Restated values drift silently, and the drift is invisible — nobody
 * notices a tab icon holding last year's orange. So the expected values are
 * resolved here the way the browser resolves them: the skin's own
 * `[data-skin="…"]` block in the vendored `css/skins.css`, falling back to the
 * app-owned `src/styles/skin-clear.css` `:root` for anything that block leaves
 * to the cascade — which for `clear` is both of them.
 *
 * The set is checked against `SKINS` rather than against a list, so a skin
 * added to the export without a mark fails here rather than 404ing in a tab.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { SKINS } from '../design-system/skin'

const repoRoot = resolve(import.meta.dirname, '../..')

const read = (relativePath: string) =>
  readFileSync(resolve(repoRoot, relativePath), 'utf-8')

const skins = read('src/design-system/css/skins.css')
const clearSkin = read('src/styles/skin-clear.css')

/** The `[data-skin="…"] { … }` block for one skin, or '' when it has none. */
function skinBlock(skin: string): string {
  const start = skins.indexOf(`[data-skin="${skin}"] {`)
  if (start === -1) return ''
  return skins.slice(start, skins.indexOf('}', start))
}

/** A `--token: #hex;` declaration, as the cascade resolves it for a skin. */
function token(skin: string, name: string): string {
  const pattern = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`)
  const own = skinBlock(skin).match(pattern)?.[1]
  // CLEAR is the default: its block declares only a name, and the seven values
  // come from the app-owned skin at `:root`.
  const resolved = own ?? clearSkin.match(pattern)?.[1]

  expect(resolved, `--${name} for ${skin}`).toBeDefined()
  return (resolved as string).toUpperCase()
}

/** Every `fill="#hex"` in a mark, in document order. */
const fills = (svg: string) =>
  [...svg.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map(([, hex]) =>
    hex.toUpperCase(),
  )

describe('the per-skin favicons', () => {
  it('exist for every skin the export ships', () => {
    for (const skin of SKINS) {
      expect(
        existsSync(resolve(repoRoot, `public/icons/favicon-${skin}.svg`)),
        `public/icons/favicon-${skin}.svg`,
      ).toBe(true)
    }
  })

  it('are painted in their own skin’s base and structure', () => {
    for (const skin of SKINS) {
      expect(fills(read(`public/icons/favicon-${skin}.svg`)), skin).toEqual([
        token(skin, 'base'),
        token(skin, 'structure'),
      ])
    }
  })

  it('are the same mark in four colourways, not four drawings', () => {
    const geometry = (svg: string) =>
      [...svg.matchAll(/ d="([^"]+)"/g)].map(([, path]) => path)

    const reference = geometry(read('public/icon.svg'))
    expect(reference).toHaveLength(2)

    for (const skin of SKINS) {
      expect(geometry(read(`public/icons/favicon-${skin}.svg`)), skin).toEqual(
        reference,
      )
    }
  })

  it('agree with the scalable icon the document ships by default', () => {
    // `index.html` links `/icon.svg` before any script runs, so it is the
    // default skin's mark whether or not it is called that.
    expect(fills(read('public/icon.svg'))).toEqual(
      fills(read('public/icons/favicon-clear.svg')),
    )
  })
})
