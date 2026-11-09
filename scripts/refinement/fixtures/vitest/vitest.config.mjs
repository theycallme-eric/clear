// Self-test fixture config for the shared required-case guard (TASK-039).
// Collects only *.case.mjs here; not-collected.mjs exists but is outside include.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['scripts/refinement/fixtures/vitest/*.case.mjs'],
    environment: 'node',
  },
})
