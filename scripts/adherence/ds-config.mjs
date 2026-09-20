// DS-08 — the adherence gate.
//
// The rule set is not written here. It is read from the vendored export at
// `src/design-system/_adherence.oxlintrc.json`, which ships every rule as `warn`; this
// module raises each one to `error` and hands it to the linter. The vendored file stays
// byte-identical (DS-01) — regenerate the design system and the gate follows it.

import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import tseslint from 'typescript-eslint'

const repoRoot = resolve(import.meta.dirname, '../..')

export const ADHERENCE_CONFIG_PATH = resolve(
  repoRoot,
  'src/design-system/_adherence.oxlintrc.json',
)

/** The vendored rule set, parsed. Never mutated. */
export function readAdherenceRules() {
  return JSON.parse(readFileSync(ADHERENCE_CONFIG_PATH, 'utf-8'))
}

/** `warn` becomes `error`: that is the whole point of the rebuild owning this gate. */
function raise(entry) {
  return Array.isArray(entry) ? ['error', ...entry.slice(1)] : 'error'
}

/**
 * The export's import patterns are written against the design system's own layout
 * (`components/Button/**`), which only matches a bare specifier. CLEAR imports the public
 * entry by relative path (`../design-system/index`), so each internal group is also matched
 * under any path that reaches the vendored folder.
 *
 * `index.js` and `skin.js` are deliberately not expanded — they are the public entry and the
 * skin initialiser, the two things a consumer is supposed to import.
 */
const PUBLIC_ENTRIES = new Set(['index.js', 'skin.js'])

function expandImportPatterns(options) {
  const patterns = options.patterns.map((pattern) => ({
    ...pattern,
    group: pattern.group.flatMap((entry) =>
      PUBLIC_ENTRIES.has(entry) ? [entry] : [entry, `**/design-system/${entry}`],
    ),
  }))
  return { ...options, patterns }
}

/** The three raw-literal restrictions — hex, px, font-family — as opposed to the component rules. */
function isRawLiteralRestriction(entry) {
  return typeof entry.selector === 'string' && entry.selector.startsWith('Literal[')
}

const UNKNOWN_PROP_SELECTOR = /^JSXOpeningElement\[name\.name='(\w+)'] > JSXAttribute > JSXIdentifier\[name!=/

/**
 * Components whose props interface extends a React DOM attributes interface. Their prop
 * surface is open by contract — `<Dialog onCancel>` is declared, inherited and type-checked —
 * but the export's generated prop list carries only each component's *own* props, so the
 * unknown-prop rule reports every inherited attribute as unknown. For those components the
 * exact gate is `tsc --noEmit`, which rejects a typo'd attribute just as firmly; the
 * closed-prop components (EmptyState, TimerDisplay) keep the lint rule, and every enum range
 * stays enforced for all of them.
 */
function componentsWithInheritedProps() {
  const componentsDir = resolve(repoRoot, 'src/design-system/components')
  const names = new Set()

  for (const entry of readdirSync(componentsDir, { recursive: true })) {
    if (!entry.endsWith('.d.ts')) continue
    const declarations = readFileSync(resolve(componentsDir, entry), 'utf-8')
    for (const [, name, heritage] of declarations.matchAll(
      /export interface (\w+)Props([^{]*)\{/g,
    )) {
      if (/React\.\w*(?:HTML|SVG|DOM)Attributes/.test(heritage)) names.add(name)
    }
  }

  return names
}

/**
 * The flat config the gate runs. Callers scope it with paths: `npm run lint:ds` passes
 * `src`, the fixture suite passes one deliberately broken file at a time.
 */
export function buildAdherenceConfig() {
  const vendored = readAdherenceRules()
  const rules = vendored.rules

  // `react/forbid-elements` ships with an empty forbid list, so it has nothing to say. If a
  // future export fills it in, fail loudly rather than dropping the coverage in silence.
  const forbidden = rules['react/forbid-elements']?.[1]?.forbid ?? []
  if (forbidden.length > 0) {
    throw new Error(
      `_adherence.oxlintrc.json now forbids elements (${forbidden.length}); teach the gate to enforce them.`,
    )
  }

  const inherited = componentsWithInheritedProps()
  const restrictedSyntax = rules['no-restricted-syntax'].slice(1).filter((entry) => {
    const component = entry.selector?.match(UNKNOWN_PROP_SELECTOR)?.[1]
    return component === undefined || !inherited.has(component)
  })
  const restrictedImports = expandImportPatterns(rules['no-restricted-imports'][1])

  return [
    {
      ignores: [
        'dist',
        'coverage',
        // The design system is the source of the tokens, not a consumer of them.
        'src/design-system/**',
      ],
    },
    {
      files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
      languageOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      // A hardcoded hex is a review-blocking defect; an inline disable comment would make it
      // a negotiable one.
      linterOptions: { noInlineConfig: true },
      rules: {
        'no-restricted-syntax': raise(['warn', ...restrictedSyntax]),
        'no-restricted-imports': raise(['warn', restrictedImports]),
      },
    },
    // Carried over from the export's own override.
    {
      files: ['**/index.js'],
      rules: { 'no-restricted-imports': 'off' },
    },
    // A test asserting `borderRadius: '0px'` is reading a rendered value back, not styling
    // anything. The component, enum and import rules still apply to tests.
    {
      files: ['**/*.test.{ts,tsx}', 'src/test/**'],
      rules: {
        'no-restricted-syntax': [
          'error',
          ...restrictedSyntax.filter((entry) => !isRawLiteralRestriction(entry)),
        ],
      },
    },
  ]
}
