import { defineConfig, devices } from '@playwright/test'

import { LOCAL_BASE_URL, readE2eEnv } from './scripts/e2e/env.mjs'

/**
 * ENV-07 — the E2E harness.
 *
 * **The default project is a phone.** ~80% of CLEAR is used on a handset in a
 * gym, so `mobile` is listed first and every `npx playwright test` with no
 * arguments runs it. `desktop` is additional coverage, deliberately second:
 * a suite whose baseline is a 1280px window proves the minority case and calls
 * it done.
 *
 * Where it runs is one decision, made from one variable. `E2E_BASE_URL` names
 * an origin — that is CI, pointed at the pull request's Vercel preview
 * deployment — and its absence means a laptop, where the harness starts the
 * same Vite dev server development uses.
 *
 * A failure keeps a trace and a screenshot. `retain-on-failure` rather than
 * `on`, because the value of a trace is that it exists for the run that broke,
 * not that every green run writes 40MB nobody opens.
 */

const e2e = readE2eEnv()

/** The requirement's viewport, written as the numbers it states. */
export const MOBILE_VIEWPORT = { width: 390, height: 844 }

export default defineConfig({
  testDir: './e2e',
  // `.spec.ts` only. Vitest owns `*.test.ts(x)` under `src/`, and a runner that
  // picks up the other one's files is the first thing that goes wrong here.
  testMatch: /.*\.spec\.ts$/,

  // A run that finds no test is a broken harness reporting success.
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['github']]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: e2e.baseURL,
    // The two artefacts the requirement names, kept for failures only.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      // Built from a mobile Chromium rather than a desktop one wearing a small
      // window: `isMobile` and `hasTouch` are what make `(pointer: coarse)` and
      // `(hover: none)` true, and those are the media queries the design system
      // actually branches on.
      name: 'mobile',
      use: {
        ...devices['Pixel 5'],
        viewport: MOBILE_VIEWPORT,
        deviceScaleFactor: 3,
      },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Named, so a failed run's artefacts are obvious and `.gitignore`d as a unit.
  outputDir: './test-results',

  // CI hands the suite a deployed origin; locally it starts the dev server.
  webServer: e2e.usesExternalTarget
    ? undefined
    : {
        command: 'npm run e2e:server',
        url: LOCAL_BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
})
