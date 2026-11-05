// Isolated Playwright config for the required-check guard rehearsals. The
// fixtures never open a page, so no browser or web server is needed.
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: '*.fixture.spec.mjs',
  outputDir: `${process.env.REQUIRED_CHECK_FIXTURE_OUTPUT ?? '/tmp'}/playwright-fixture-output`,
  retries: 0,
  workers: 1,
  projects: [{ name: 'fixture' }],
})
