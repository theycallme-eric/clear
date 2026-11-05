// Isolated Vitest config for the required-check guard rehearsals: no jsdom,
// no product setup, only the synthetic fixtures beside it.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: 'node',
    include: ['*.fixture.test.mjs'],
    setupFiles: [],
    watch: false,
  },
})
