import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Explicit extension: Vite's native config loader resolves this file with
// Node's own rules, which do not guess one.
import { specimenServer } from './src/dev/specimen-server.ts'

export default defineConfig({
  // DS-07's specimen middleware declares `apply: 'serve'`, so the export's
  // cards are reachable while developing and nothing of it exists in a build.
  plugins: [react(), specimenServer()],
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
