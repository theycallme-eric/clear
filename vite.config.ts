import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['src/design-system/_source/**'],
    setupFiles: './src/test/setup.ts',
    coverage: {
      // Reported, not gated: no thresholds, ever.
      provider: 'v8',
      include: ['src/**'],
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
