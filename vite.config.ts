import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { parse, type Parser, type Root } from 'postcss'
import { defineConfig } from 'vitest/config'

// Explicit extension: Vite's native config loader resolves this file with
// Node's own rules, which do not guess one.
import { specimenServer } from './src/dev/specimen-server.ts'
// PWA-01's icons are rendered by the build rather than committed as binaries.
import { pwaIcons } from './scripts/generate-pwa-icons.mjs'

const vendoredSkinPath = resolve(import.meta.dirname, 'src/design-system/css/skin-clear.css')
const appSkinPath = resolve(import.meta.dirname, 'src/styles/skin-clear.css')
const vendoredGoogleFontImport = "url('https://fonts.googleapis.com/css2?family=Oxanium:wght@400;500;600;700&family=Rajdhani:wght@500;600;700&family=Space+Grotesk:wght@400;500;700&display=swap')"
const clearIdentityProperties = new Set([
  '--skin-name', '--structure', '--interaction', '--selection', '--urgency', '--info', '--base', '--ink',
])

// Vite's CSS @import inliner reads nested files directly, not through Vite
// load/transform hooks. It applies this parser to those files before inlining.
// Keep vendor bytes and all other vendor CSS intact; the app skin supplies
// these exact families/weights locally through Fontsource.
export const localVendorFontParser: Parser<Root> = (css, options) => {
  const root = parse(css, options)
  if (root.source?.input.file === vendoredSkinPath) {
    root.walkAtRules('import', (rule) => {
      if (rule.params === vendoredGoogleFontImport) rule.remove()
    })
  } else if (root.source?.input.file === appSkinPath) {
    // The unchanged app skin now follows the public entry. Its global fonts
    // must still win, but its CLEAR identity must not reset an alternate skin.
    // Scope only the first root's eight identity declarations; keep every
    // local face, fallback, alias and other rule in its original global scope.
    const defaultSkin = root.nodes.find((node) => node.type === 'rule' && node.selector === ':root')
    if (defaultSkin?.type === 'rule') {
      const identity = defaultSkin.clone({ selector: '[data-skin="clear"], :root:not([data-skin])', nodes: [] })
      for (const node of [...defaultSkin.nodes]) {
        if (node.type === 'decl' && clearIdentityProperties.has(node.prop)) identity.append(node)
      }
      if (identity.nodes.length > 0) defaultSkin.before(identity)
    }
  }
  return root
}

export default defineConfig({
  // DS-07's specimen middleware declares `apply: 'serve'`, so the export's
  // cards are reachable while developing and nothing of it exists in a build.
  plugins: [react(), specimenServer(), pwaIcons()],
  css: {
    postcss: { parser: localVendorFontParser },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['src/design-system/_source/**'],
    setupFiles: './src/test/setup.ts',
    coverage: {
      // Reported, not gated: no thresholds, ever.
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/design-system/**', // vendored; covered at source, not here
        'src/test/**',
        'src/**/*.test.{ts,tsx}',
        'src/main.tsx',
      ],
      reporter: ['text', 'html', 'lcov'],
    },
  },
})
