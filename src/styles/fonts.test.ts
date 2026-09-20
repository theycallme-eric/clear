/**
 * DS-02 acceptance, the half that can be proved from source: nothing the app
 * loads reaches Google. jsdom parses no stylesheet, so — as in
 * app-motion.test.ts — the guarantee is asserted against the files themselves:
 * every stylesheet main.tsx pulls in, plus the served HTML.
 *
 * The risk is real, not hypothetical. The vendored css/skin-clear.css carries
 * the CDN `@import`, and the app-owned copy in this directory exists to replace
 * it; the last test here asserts the vendored file still carries it, so these
 * checks can never pass by accident.
 *
 * The self-hosted faces are not in this workspace — see the delivery note at
 * the foot of skin-clear.css. The @font-face rules below are checked
 * generically so the guard already covers them when they land.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const srcDir = resolve(import.meta.dirname, '..')

const read = (relativeToSrc: string): string =>
  readFileSync(resolve(srcDir, relativeToSrc), 'utf-8')

/**
 * What a file *requests*, not what it talks about — the skin documents the CDN
 * it replaced, and a comment is not a round trip.
 */
const code = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')

const main = read('main.tsx')
const indexHtml = readFileSync(resolve(srcDir, '../index.html'), 'utf-8')

/** The stylesheets the entry point imports, in load order. */
const loadedStylesheets = [...main.matchAll(/^import '(\.[^']+\.css)'$/gm)].map(
  (match) => match[1],
)

const GOOGLE_FONT_HOST = /fonts\.(googleapis|gstatic)\.com/

describe('no font is requested from Google', () => {
  it('finds the stylesheets to check', () => {
    // Guards the regex above: a rewritten import style must not silently empty
    // the set this suite iterates.
    expect(loadedStylesheets.length).toBeGreaterThanOrEqual(6)
  })

  it.each(loadedStylesheets)('%s requests no Google Fonts host', (stylesheet) => {
    expect(code(read(stylesheet))).not.toMatch(GOOGLE_FONT_HOST)
  })

  it('serves markup that requests no Google Fonts host', () => {
    expect(code(indexHtml)).not.toMatch(GOOGLE_FONT_HOST)
    // Not even the cheap hop: a preconnect is still a request to Google.
    expect(code(indexHtml)).not.toMatch(/preconnect|dns-prefetch/)
  })

  it('loads the app-owned skin instead of the vendored one', () => {
    expect(main).toContain("import './styles/skin-clear.css'")
    expect(main).not.toContain('design-system/css/skin-clear.css')
  })

  it('leaves the vendored skin unedited — it is replaced, not patched', () => {
    // If this ever fails, src/design-system/ was edited, which DS-02 forbids;
    // it is also what makes the assertions above mean something.
    expect(code(read('design-system/css/skin-clear.css'))).toMatch(GOOGLE_FONT_HOST)
  })
})

describe('every font role degrades to a real stack', () => {
  const skin = code(read('styles/skin-clear.css'))

  const stack = (token: string): string => {
    const declaration = new RegExp(`--${token}:\\s*([^;]+);`).exec(skin)
    expect(declaration).not.toBeNull()
    return declaration![1]
  }

  it.each([
    ['font-display', 'Rajdhani', 'sans-serif'],
    ['font-data', 'Oxanium', 'monospace'],
    ['font-body', 'Space Grotesk', 'sans-serif'],
  ])('%s leads with %s and ends in %s', (token, family, generic) => {
    const value = stack(token)
    expect(value.startsWith(`'${family}'`)).toBe(true)
    expect(value.endsWith(generic)).toBe(true)
    // A family name and a generic keyword is not a stack — something has to
    // catch the role between them.
    expect(value.split(',')).toHaveLength(3)
  })
})

describe('self-hosted faces, when they land', () => {
  const appOwnedCss = ['styles/skin-clear.css', 'styles/app-motion.css', 'styles/atmosphere.css']
    .map((stylesheet) => code(read(stylesheet)))
    .join('\n')

  const fontFaces = [...appOwnedCss.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(
    (match) => match[1],
  )

  it('swaps rather than blocks, and is served from this origin', () => {
    for (const face of fontFaces) {
      expect(face).toMatch(/font-display:\s*swap/)
      expect(face).not.toMatch(/url\(\s*['"]?https?:/)
    }
  })

  it('records why there are none yet', () => {
    // Deliberate: the packages that carry the woff2 files cannot be installed
    // in this workspace. Deleting the note without shipping the faces should
    // fail, because the absence would then look like an oversight.
    if (fontFaces.length === 0) {
      expect(read('styles/skin-clear.css')).toContain('NOT DELIVERED IN THIS WORKSPACE')
    }
  })
})
