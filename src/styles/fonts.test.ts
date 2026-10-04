/**
 * DS-02 acceptance without a browser: source checks preserve the local faces,
 * and a real in-memory Vite build checks what the app actually emits. jsdom
 * parses no stylesheet; checking only main's direct imports would miss the
 * public styles.css entry's transitive vendor skin import.
 *
 * The risk is real, not hypothetical. The vendored css/skin-clear.css carries
 * the CDN `@import`. Vite removes only that exact import at compile time,
 * while the app-owned skin supplies local font faces and fallback stacks.
 * The raw transitive graph remains a negative control, not an edited vendor.
 *
 * The self-hosted faces are Fontsource's Latin-only files. These checks name
 * every shipped family/weight so removing a face cannot silently fall back to
 * a system font while the rest of the suite stays green.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parse } from 'postcss'
import { build } from 'vite'
import { beforeAll, describe, expect, it } from 'vitest'

import { localVendorFontParser } from '../../vite.config.ts'

const srcDir = resolve(import.meta.dirname, '..')
const projectDir = resolve(srcDir, '..')

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
const vendoredSkinPath = resolve(srcDir, 'design-system/css/skin-clear.css')
const vendoredSkin = read('design-system/css/skin-clear.css')
const appSkinPath = resolve(srcDir, 'styles/skin-clear.css')
const appSkin = read('styles/skin-clear.css')
const fontImport = parse(vendoredSkin).nodes.find(
  (node) => node.type === 'atrule' && node.name === 'import',
)!

describe('the vendor font parser is narrowly scoped', () => {
  it('removes only the exact CDN import from the exact vendored skin', () => {
    const compiled = localVendorFontParser(vendoredSkin, { from: vendoredSkinPath })
    // Compare the remaining real nodes, including comments, rather than only
    // asserting absence of a host that a blanket CSS rewrite could also pass.
    const originalNodes = parse(vendoredSkin).nodes.filter(
      (node) => !(node.type === 'atrule' && node.name === 'import'),
    )
    expect(compiled.nodes.map((node) => node.toString())).toEqual(
      originalNodes.map((node) => node.toString()),
    )
    expect(compiled.toString()).not.toMatch(GOOGLE_FONT_HOST)
  })

  it.each(['styles/skin-clear.css', 'design-system/css/skins.css'])(
    'does not alter the same import in %s', (otherFile) => {
      const source = `${fontImport.toString()};\n:root { --retained: 1; }`
      expect(localVendorFontParser(source, { from: resolve(srcDir, otherFile) }).toString())
        .toBe(source)
    },
  )

  it('does not alter another import or a URL in the vendored skin', () => {
    const source = "@import url('https://fonts.googleapis.com/css2?family=Other');\n" +
      "@font-face { src: url('https://fonts.gstatic.com/other.woff2'); }"
    expect(localVendorFontParser(source, { from: vendoredSkinPath }).toString()).toBe(source)
  })

  it('scopes only app-owned CLEAR identity, retaining global font/alias rules and all other CSS', () => {
    const compiled = localVendorFontParser(appSkin, { from: appSkinPath })
    const original = parse(appSkin)
    const originalRoot = original.nodes.find((node) => node.type === 'rule' && node.selector === ':root')!
    const scoped = compiled.nodes.find((node) => node.type === 'rule' &&
      node.selector === '[data-skin="clear"], :root:not([data-skin])')!
    expect(originalRoot.type).toBe('rule')
    expect(scoped.type).toBe('rule')
    if (originalRoot.type !== 'rule' || scoped.type !== 'rule') throw new Error('Missing skin rules')
    const properties = [
      '--skin-name', '--structure', '--interaction', '--selection', '--urgency', '--info', '--base', '--ink',
    ]
    const originalIdentity = originalRoot.nodes.filter(
      (node) => node.type === 'decl' && properties.includes(node.prop),
    )
    expect(scoped.nodes.map((node) => node.toString()))
      .toEqual(originalIdentity.map((node) => node.toString()))
    expect(scoped.nodes).toHaveLength(8)
    for (const node of originalIdentity) node.remove()
    scoped.remove()
    expect(compiled.toString()).toBe(original.toString())
    expect(read('styles/skin-clear.css')).toBe(appSkin)
  })

  it('does not scope another file or a later root rule', () => {
    const source = ':root { --structure: first; --font-body: retained; }\n:root { --structure: later; }'
    expect(localVendorFontParser(source, { from: resolve(srcDir, 'styles/other.css') }).toString())
      .toBe(source)
    const compiled = localVendorFontParser(source, { from: appSkinPath })
    expect(compiled.nodes.at(-1)?.toString()).toBe(':root { --structure: later; }')
    expect(compiled.toString()).toContain(':root { --font-body: retained; }')
  })
})

describe('no font is requested from Google', () => {
  let builtCss = ''
  let builtHtml = ''

  beforeAll(async () => {
    // Use the actual app/config/import graph, not a hand-reassembled CSS list
    // or a prior dist directory. Bundling executes no app or model request.
    const result = await build({
      root: projectDir,
      configFile: resolve(projectDir, 'vite.config.ts'),
      envFile: false,
      logLevel: 'silent',
      build: { write: false, minify: false, cssMinify: false },
    })
    if (!('output' in result) && !Array.isArray(result)) throw new Error('Expected build output')
    const assets = (Array.isArray(result) ? result : [result]).flatMap((output) => output.output)
      .filter((output) => output.type === 'asset')
    builtCss = assets.filter((asset) => asset.fileName.endsWith('.css'))
      .map((asset) => String(asset.source)).join('\n')
    builtHtml = assets.filter((asset) => asset.fileName.endsWith('.html'))
      .map((asset) => String(asset.source)).join('\n')
    expect(builtCss.length).toBeGreaterThan(0)
    expect(builtHtml.length).toBeGreaterThan(0)
  }, 30_000)

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

  it('loads the public entry exactly once before the app-owned local-font skin', () => {
    expect(loadedStylesheets.filter((path) => path === './design-system/styles.css')).toHaveLength(1)
    expect(loadedStylesheets.filter((path) => path === './styles/skin-clear.css')).toHaveLength(1)
    expect(loadedStylesheets.indexOf('./design-system/styles.css'))
      .toBeLessThan(loadedStylesheets.indexOf('./styles/skin-clear.css'))
    expect(loadedStylesheets.some((path) => path.startsWith('./design-system/css/'))).toBe(false)
  })

  it('finds the real transitive vendor import with its unchanged remote-font negative control', () => {
    const imports = parse(read('design-system/styles.css')).nodes
      .flatMap((node) => node.type === 'atrule' && node.name === 'import' ? [node.params] : [])
    expect(imports).toEqual([
      "'./css/foundation.css'", "'./css/motion.css'", "'./css/skin-clear.css'", "'./css/skins.css'",
    ])
    expect(code(vendoredSkin)).toMatch(GOOGLE_FONT_HOST)
  })

  it('emits the real transitive CSS without any remote import or Google font host', () => {
    expect(code(builtCss)).not.toMatch(GOOGLE_FONT_HOST)
    expect(code(builtCss)).not.toMatch(/@import\b/)
    expect(code(builtHtml)).not.toMatch(GOOGLE_FONT_HOST)
  })

  it('emits each public foundation/motion/alternative-skin layer exactly once', () => {
    const css = parse(builtCss)
    const declarations: string[] = []
    css.walkDecls((declaration) => { declarations.push(`${declaration.prop}:${declaration.value}`) })
    expect(declarations.filter((value) => value === '--spacing-100:4px')).toHaveLength(1)
    expect(declarations.filter((value) => value === '--dur-boot-reveal:700ms')).toHaveLength(1)
    for (const skin of ['Vapour', 'Signal', 'Mono']) {
      expect(declarations.filter((value) => value === `--skin-name:'${skin}'`)).toHaveLength(1)
    }
  })

  it('retains all ten local faces and the app fallback stacks in built CSS', () => {
    const css = parse(builtCss)
    const faces: string[] = []
    css.walkAtRules('font-face', (face) => {
      const declarations = new Map<string, string>()
      face.walkDecls((declaration) => { declarations.set(declaration.prop, declaration.value) })
      faces.push(`${declarations.get('font-family')}:${declarations.get('font-weight')}`)
      expect(declarations.get('font-display')).toBe('swap')
      expect(declarations.get('src')).not.toMatch(/https?:/)
    })
    expect(faces).toHaveLength(10)
    for (const [family, weights] of [
      ["'Rajdhani'", [500, 600, 700]],
      ["'Oxanium'", [400, 500, 600, 700]],
      ["'Space Grotesk'", [400, 500, 700]],
    ] as const) {
      for (const weight of weights) expect(faces).toContain(`${family}:${weight}`)
    }
    expect(builtCss).toContain("--font-display: 'Rajdhani', system-ui, sans-serif")
    expect(builtCss).toContain("--font-data: 'Oxanium', ui-monospace, monospace")
    expect(builtCss).toContain("--font-body: 'Space Grotesk', system-ui, sans-serif")
  })

  it.each(['clear', 'vapour', 'signal', 'mono'])(
    'preserves the actual built identity cascade for the %s skin', (skin) => {
      const previous = document.documentElement.getAttribute('data-skin')
      document.documentElement.setAttribute('data-skin', skin)
      try {
        const actual = new Map<string, string>()
        // Identity and font declarations are top-level root/attribute rules,
        // not conditional media rules. Evaluate their matching built rules in
        // emitted order, so a later app :root resetting Vapour cannot pass.
        parse(builtCss).walkRules((rule) => {
          const ownsIdentityOrFonts = rule.nodes.some((node) => node.type === 'decl' && [
            '--skin-name', '--structure', '--interaction', '--selection', '--urgency', '--info', '--base', '--ink',
            '--font-display', '--font-data', '--font-body',
          ].includes(node.prop))
          if (rule.parent?.type === 'root' && ownsIdentityOrFonts &&
            document.documentElement.matches(rule.selector)) {
            rule.walkDecls((declaration) => { actual.set(declaration.prop, declaration.value) })
          }
        })
        const expected = new Map<string, string>()
        const source = skin === 'clear' ? vendoredSkin : read('design-system/css/skins.css')
        parse(source).walkRules((rule) => {
          if (rule.selector === (skin === 'clear' ? ':root' : `[data-skin="${skin}"]`)) {
            rule.walkDecls((declaration) => { expected.set(declaration.prop, declaration.value) })
          }
        })
        for (const property of [
          '--skin-name', '--structure', '--interaction', '--selection', '--urgency', '--info', '--base', '--ink',
        ]) expect(actual.get(property), property).toBe(expected.get(property))
        expect(actual.get('--font-display')).toBe("'Rajdhani', system-ui, sans-serif")
        expect(actual.get('--font-data')).toBe("'Oxanium', ui-monospace, monospace")
        expect(actual.get('--font-body')).toBe("'Space Grotesk', system-ui, sans-serif")
      } finally {
        if (previous === null) document.documentElement.removeAttribute('data-skin')
        else document.documentElement.setAttribute('data-skin', previous)
      }
    },
  )
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

describe('self-hosted faces are present', () => {
  const skin = code(read('styles/skin-clear.css'))
  const faces = [
    ['rajdhani', 500],
    ['rajdhani', 600],
    ['rajdhani', 700],
    ['oxanium', 400],
    ['oxanium', 500],
    ['oxanium', 600],
    ['oxanium', 700],
    ['space-grotesk', 400],
    ['space-grotesk', 500],
    ['space-grotesk', 700],
  ] as const

  it.each(faces)('ships @fontsource/%s Latin %i from this origin', (family, weight) => {
    const importPath = `@fontsource/${family}/latin-${weight}.css`
    expect(skin).toContain(`@import '${importPath}';`)

    const packageCss = readFileSync(
      resolve(projectDir, 'node_modules', importPath),
      'utf-8',
    )
    expect(packageCss).toMatch(/@font-face\s*\{/)
    expect(packageCss).toMatch(new RegExp(`font-weight:\\s*${weight}`))
    expect(packageCss).toMatch(/font-display:\s*swap/)
    expect(packageCss).toMatch(/\.woff2\)/)
    expect(packageCss).not.toMatch(/url\(\s*['"]?https?:/)
  })

  it('preloads only the above-the-fold display, data, and body faces', () => {
    const preloads = [
      'rajdhani/files/rajdhani-latin-700-normal.woff2',
      'oxanium/files/oxanium-latin-700-normal.woff2',
      'space-grotesk/files/space-grotesk-latin-500-normal.woff2',
    ]

    for (const preload of preloads) {
      expect(indexHtml).toContain(`./node_modules/@fontsource/${preload}`)
    }
    expect(indexHtml.match(/rel="preload"/g)).toHaveLength(3)
  })
})
