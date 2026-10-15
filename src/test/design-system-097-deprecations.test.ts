import { readFileSync, readdirSync } from 'node:fs'
import { extname, relative, resolve, sep } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * VIBE-D — retired vocabulary must not quietly return through a local screen.
 * The 0.14.3 vendor removes compatibility aliases; this scan is deliberately
 * limited to the production application consumer: everything under `src/`
 * except the vendored package, the dev-only gallery and the tests.
 *
 * TASK-025 widens it from removed names to the competing dialects REQ-028
 * names: a second card, a second field, a second motion vocabulary, and a
 * route around the public entry. Each rule and its exceptions are recorded in
 * docs/design/CLEAR-0.14.3-RECONCILIATION-LEDGER.md.
 */

const src = resolve(import.meta.dirname, '..')
const vendor = resolve(src, 'design-system')
const notProduction = new Set(['design-system', 'dev', 'test'])
const extensions = new Set(['.ts', '.tsx', '.css'])

const repoPath = (path: string) => relative(resolve(src, '..'), path).split(sep).join('/')

function productionFiles(): string[] {
  return readdirSync(src, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => resolve(entry.parentPath, entry.name))
    .filter((path) => !notProduction.has(relative(src, path).split(sep)[0]))
    .filter((path) => extensions.has(extname(path)))
    .filter((path) => !/\.(test|spec)\.[^.]+$/.test(path))
}

const scripts = () => productionFiles().filter((path) => /\.tsx?$/.test(path))
const stylesheets = () => productionFiles().filter((path) => extname(path) === '.css')
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

function parse(path: string) {
  const kind = extname(path) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  return ts.createSourceFile(path, readFileSync(path, 'utf-8'), ts.ScriptTarget.Latest, true, kind)
}

function visit(file: ts.SourceFile, inspect: (node: ts.Node) => void) {
  const walk = (node: ts.Node) => {
    inspect(node)
    ts.forEachChild(node, walk)
  }
  walk(file)
}

interface JsxOpening {
  tag: string
  attributes: Map<string, ts.JsxAttribute>
}

function jsxOpenings(file: ts.SourceFile): JsxOpening[] {
  const openings: JsxOpening[] = []
  visit(file, (node) => {
    const opening = ts.isJsxSelfClosingElement(node)
      ? node
      : ts.isJsxElement(node)
        ? node.openingElement
        : null
    if (!opening) return
    const attributes = new Map<string, ts.JsxAttribute>()
    for (const property of opening.attributes.properties) {
      if (ts.isJsxAttribute(property)) attributes.set(property.name.getText(file), property)
    }
    openings.push({ tag: opening.tagName.getText(file), attributes })
  })
  return openings
}

/** A JSX attribute's value when it is a plain string, `"x"` or `{'x'}`. */
function literalValue(attribute: ts.JsxAttribute | undefined): string | undefined {
  const initializer = attribute?.initializer
  if (!initializer) return undefined
  if (ts.isStringLiteral(initializer)) return initializer.text
  if (ts.isJsxExpression(initializer) && initializer.expression) {
    const expression = initializer.expression
    if (ts.isStringLiteralLike(expression)) return expression.text
  }
  return undefined
}

/** Every string a script writes: literals and template text. */
function strings(file: ts.SourceFile): string[] {
  const found: string[] = []
  visit(file, (node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      found.push(node.text)
    }
  })
  return found
}

function importSpecifiers(file: ts.SourceFile): { module: string; names: string[] }[] {
  return file.statements.filter(ts.isImportDeclaration).map((declaration) => {
    const bindings = declaration.importClause?.namedBindings
    return {
      module: (declaration.moduleSpecifier as ts.StringLiteral).text,
      names:
        bindings && ts.isNamedImports(bindings)
          ? bindings.elements.map((element) => (element.propertyName ?? element.name).text)
          : [],
    }
  })
}

describe('the production app consumes CLEAR 0.14.3 vocabulary', () => {
  it('scans the whole production consumer, not a hand-kept list of folders', () => {
    const roots = new Set(productionFiles().map((path) => relative(src, path).split(sep)[0]))
    for (const root of ['app', 'ui', 'styles', 'state', 'data', 'main.tsx']) expect(roots).toContain(root)
  })

  it('contains none of the removed class or token names', () => {
    const removed = [
      'clr-load-ticks',
      'tracking-data-wide',
      'surface-overlay',
      'chamfer-xl',
      'chamfer--xl',
      'chamfer--open-left',
      'chamfer--bottom-only',
      'accent-bar-width-lg',
      'clr-card__bar--lg',
      'glow-emissive',
      'text-shadow-glow',
      'glow-box',
      'hasLeftBorder',
      'bottomBorderOnly',
    ]

    for (const path of productionFiles()) {
      const source = readFileSync(path, 'utf-8')
      for (const name of removed) expect(source, `${repoPath(path)}: ${name}`).not.toContain(name)
      expect(source, `${repoPath(path)}: retired pulse-micro`).not.toMatch(/(?<!clr-)pulse-micro/)
    }
  })

  it('uses role tokens and the three font roles rather than the removed hue and font aliases', () => {
    for (const path of productionFiles()) {
      const source = readFileSync(path, 'utf-8')
      expect(source, repoPath(path)).not.toMatch(/--color-(?:orange|blue|green|red|purple|neutral)-/)
      expect(source, repoPath(path)).not.toMatch(/--font-(?:headings|label|paragraph)\b/)
    }
  })

  it('passes none of the removed component props', () => {
    const removed: Record<string, string[]> = {
      EmptyState: ['actionLabel', 'onAction'],
      ChamferedFrame: ['glow', 'hasLeftBorder', 'bottomBorderOnly'],
      Card: ['barWidth'],
    }

    for (const path of scripts()) {
      const violations = jsxOpenings(parse(path)).flatMap(({ tag, attributes }) => [
        ...(removed[tag] ?? []).filter((prop) => attributes.has(prop)).map((prop) => `<${tag} ${prop}>`),
        ...(literalValue(attributes.get('cornerSize')) === 'xl' ? [`<${tag} cornerSize="xl">`] : []),
      ])
      expect(violations, repoPath(path)).toEqual([])
    }
  })

  it('selects no removed atmosphere mode', () => {
    for (const path of scripts()) {
      const file = parse(path)
      const selected = jsxOpenings(file)
        .map(({ attributes }) => literalValue(attributes.get('data-atmosphere')))
        .filter((value): value is string => value !== undefined)

      visit(file, (node) => {
        // `element.dataset.atmosphere = 'quiet'` and `setAttribute('data-atmosphere', 'quiet')`.
        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          /\.dataset\.atmosphere$/.test(node.left.getText(file)) &&
          ts.isStringLiteralLike(node.right)
        ) {
          selected.push(node.right.text)
        }
        if (
          ts.isCallExpression(node) &&
          /\.setAttribute$/.test(node.expression.getText(file)) &&
          node.arguments.length === 2 &&
          ts.isStringLiteralLike(node.arguments[0]) &&
          node.arguments[0].text === 'data-atmosphere' &&
          ts.isStringLiteralLike(node.arguments[1])
        ) {
          selected.push(node.arguments[1].text)
        }
      })

      expect(selected.filter((mode) => mode !== 'full'), repoPath(path)).toEqual([])
    }
  })
})

describe('the production app speaks one dialect per component', () => {
  /**
   * Hand-assembled `.clr-card` markup outside the public Card. Each entry is a
   * named exception in the ledger; an entry whose file no longer needs it fails
   * below, so an exception cannot outlive its reason.
   */
  const HAND_ASSEMBLED_CARD: Record<string, string> = {
    'src/ui/workout-chrome.tsx':
      'EXC-03 GlobalTimer: TimerDisplay always draws its own card and counts down into the low state, so a count-up session clock inside a card mirrors its markup',
  }

  const cardClass = /(?:^|\s)clr-card(?:__(?:bar|body))?(?=\s|$)/

  it('imports the public Card only through the app card adapter', () => {
    for (const path of scripts()) {
      const importsCard = importSpecifiers(parse(path)).some(
        ({ module, names }) => /design-system\/index$/.test(module) && names.includes('Card'),
      )
      expect(importsCard, repoPath(path)).toBe(repoPath(path) === 'src/ui/card.tsx')
    }
  })

  it('hand-assembles card markup only in a named, still-needed exception', () => {
    const assembled = scripts()
      .filter((path) => strings(parse(path)).some((text) => cardClass.test(text)))
      .map(repoPath)

    expect(assembled.sort()).toEqual(Object.keys(HAND_ASSEMBLED_CARD).sort())
  })

  it('never restyles the card from app CSS', () => {
    for (const path of stylesheets()) {
      expect(withoutComments(readFileSync(path, 'utf-8')), repoPath(path)).not.toMatch(
        /\.clr-card\b[^{}]*\{/,
      )
    }
  })

  it('enters text only through the public field components', () => {
    // A raw radio or checkbox behind a domain control (a ladder rung) is a
    // choice, not a field. Text entry is Input/FormField; the native select is
    // the one DS-04b adapter, framed with the public `.clr-field`.
    const choiceTypes = new Set(['radio', 'checkbox', 'hidden'])

    for (const path of scripts()) {
      const violations = jsxOpenings(parse(path)).flatMap(({ tag, attributes }) => {
        if (tag === 'textarea') return ['<textarea>']
        if (tag === 'input' && !choiceTypes.has(literalValue(attributes.get('type')) ?? 'text')) {
          return [`<input type="${literalValue(attributes.get('type')) ?? 'text'}">`]
        }
        if (tag === 'select' && repoPath(path) !== 'src/ui/select.tsx') return ['<select>']
        return []
      })
      expect(violations, repoPath(path)).toEqual([])
    }
  })

  it('animates only with the keyframes the package ships', () => {
    const vendorCss = ['css/foundation.css', 'css/motion.css']
      .map((file) => readFileSync(resolve(vendor, file), 'utf-8'))
      .join('\n')
    const shipped = new Set([...vendorCss.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1]))
    const keywords = new Set([
      'none', 'both', 'forwards', 'backwards', 'infinite', 'alternate', 'alternate-reverse',
      'reverse', 'normal', 'running', 'paused', '!important',
    ])
    expect(shipped).toContain('clr-phosphor-out')

    for (const path of productionFiles()) {
      // In a script, only what it writes as a string can style anything.
      const source =
        extname(path) === '.css'
          ? withoutComments(readFileSync(path, 'utf-8'))
          : strings(parse(path)).join('\n')
      expect(source, `${repoPath(path)}: local @keyframes`).not.toMatch(/@keyframes/)

      const names = [...source.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g)]
        .flatMap((match) => match[1].split(','))
        .flatMap((part) => part.trim().split(/\s+/))
        .filter((token) => /^[a-z!][\w-]*$/i.test(token) && !keywords.has(token))
      for (const name of names) expect(shipped, `${repoPath(path)}: ${name}`).toContain(name)
    }
  })

  it('composes only the public entry, the skin initialiser and the one stylesheet', () => {
    const stylesheetImports: string[] = []

    for (const path of scripts()) {
      for (const { module } of importSpecifiers(parse(path))) {
        if (!/(?:^|\/)design-system(?:\/|$)/.test(module)) continue
        expect(module, repoPath(path)).toMatch(/design-system\/(?:index|skin|skin\.js|styles\.css)$/)
        if (module.endsWith('styles.css')) stylesheetImports.push(repoPath(path))
      }
    }
    for (const path of stylesheets()) {
      expect(readFileSync(path, 'utf-8'), repoPath(path)).not.toMatch(/@import\s+[^;]*design-system/)
    }

    expect(stylesheetImports).toEqual(['src/main.tsx'])
  })
})
