// Self-test fixture config for the shared required-case guard (TASK-039).
// No browser, server or page fixture is used; output goes to the OS temp dir.
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.case\.mjs$/,
  retries: 0,
  outputDir: join(tmpdir(), 'clear-required-check-playwright-fixture'),
  projects: [{ name: 'mobile' }, { name: 'other' }],
})
