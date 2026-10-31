import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

import { LOCAL_BASE_URL, readE2eEnv } from './scripts/e2e/env.mjs'

/**
 * ENV-07 — the E2E harness.
 *
 * CLEAR is mobile-only under the owner's 2026-10-22 scope decision.
 * The sole project is a touch phone; specs retain short/narrow-phone checks.
 * Wider-device evidence is historical, not a request to rerun those targets.
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
const designSystemPackage = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'src/design-system/package.json'), 'utf8'),
) as { version: string }

/**
 * The exact title of the home-review case that runs after the package import.
 * Plain words only: it is spliced into the selection pattern unescaped.
 */
export const REQ_011_REVIEW_CASE =
  'REQ-011 Review: type labels, ordered groups, adjacent shared rest and tempo detail into Workout'

/** TASK-011 (REQ-007, U25): the post-import rest-day case, same rules as above. */
export const REQ_007_REST_DAY_CASE =
  'REQ-007 Home: rest day reason trigger, Cancel discards, keyboard Save and aligned actions'

/** TASK-012 (REQ-007, U19/U20): the post-import next-workout case, same rules. */
export const REQ_007_NEXT_WORKOUT_CASE =
  'REQ-007 Home: first use guidance, one next workout entry and prefilled Generate without generating'

function isLocalBrowserTarget(baseURL: string): boolean {
  const hostname = new URL(baseURL).hostname.toLowerCase()
  return hostname === 'localhost' || hostname.endsWith('.localhost') ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname) || hostname === '[::1]'
}

/**
 * These synthetic proofs are already local-only. Exclude their files before
 * module loading on deployments: title grep runs after imports, when a local
 * proof may already have read its staged visual references.
 *
 * TASK-001 (library pilot): the error-role regression starts its own Vite
 * servers over this checkout, reads the released owner from git at import and
 * serves `e2e/fixtures/`, none of which a deployed origin has. It is local
 * candidate-source proof, never deployed proof.
 */
export function browserTestIgnoreForTarget(baseURL: string): string[] {
  return isLocalBrowserTarget(baseURL)
    ? []
    : [
        '**/ui-polish-b05-*.spec.ts',
        '**/ui-polish-integrated.spec.ts',
        '**/library-error-role.spec.ts',
      ]
}

/**
 * TASK-027: keep the original browser command, selecting cases for its target.
 * BEFORE assertions belong to 0.9.7; deployed assertions need a deployed origin.
 * Positive grep composes with the command's existing paid-lane grepInvert.
 */
export function browserTestsForTarget(packageVersion: string, baseURL: string): RegExp {
  const exclusions: string[] = []
  if (packageVersion === '0.14.3') {
    exclusions.push(
      String.raw`design-0143[\\/](?:baseline|task-040-lifecycle(?:-gaps)?)\.spec\.ts`,
      String.raw`design-0143[\\/]task-040-entry-settings\.spec\.ts(?!.*entry: Welcome and OTP validation, busy, typed failure and cooldown$)`,
      // TASK-019, TASK-011 and TASK-012: the post-import, non-capture cases (REQ-011, REQ-007).
      String.raw`design-0143[\\/]task-040-home-review\.spec\.ts(?!.*(?:${REQ_011_REVIEW_CASE}|${REQ_007_REST_DAY_CASE}|${REQ_007_NEXT_WORKOUT_CASE})$)`,
    )
  }
  if (isLocalBrowserTarget(baseURL)) {
    exclusions.push(String.raw`generation-deployed-matrix\.spec\.ts`)
  } else {
    // TASK-018 is an explicitly local synthetic proof. Keep ordinary preview
    // discovery on its existing cases; directly selecting only this file on
    // an external target finds no cases and retains Playwright's failure.
    exclusions.push(String.raw`(?:^|[\\/\s])ui-polish-integrated\.spec\.ts(?:$|[\s:])`)
    // B05 fixtures intercept synthetic data and must never target a deployment.
    exclusions.push(String.raw`(?:^|[\\/\s])ui-polish-b05-[a-z0-9-]+\.spec\.ts(?:$|[\s:])`)
  }
  return exclusions.length ? new RegExp(`^(?!.*(?:${exclusions.join('|')})).*$`) : /.*/
}

/**
 * Vercel protects preview deployments with its login interstitial. CI receives
 * one revocable, project-scoped automation value and sends it only as the two
 * headers Vercel documents. Local runs and the trusted backend lane do not
 * need it, so the browser remains unchanged when the value is absent.
 */
export function vercelProtectionHeaders(secret: string | undefined) {
  return secret
    ? {
        'x-vercel-protection-bypass': secret,
        'x-vercel-set-bypass-cookie': 'true',
        // The preview-only feedback overlay must not cover application hit areas.
        // https://vercel.com/docs/vercel-toolbar/managing-toolbar#disable-toolbar-for-automation
        'x-vercel-skip-toolbar': '1',
      }
    : undefined
}

/**
 * The backend harness accepts server-side Supabase names so the service-role
 * key never needs a `VITE_` prefix. A local Vite server is still browser code,
 * though, and only exposes variables with that prefix. Map only the public URL
 * and anon key into that child process; the service-role key remains available
 * to Playwright itself and never enters the browser bundle.
 */
export function browserSupabaseEnv(url: string | null, anonKey: string | null) {
  return {
    ...(url === null ? {} : { VITE_SUPABASE_URL: url }),
    ...(anonKey === null ? {} : { VITE_SUPABASE_ANON_KEY: anonKey }),
  }
}

const protectionHeaders = vercelProtectionHeaders(
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
)

if (process.env.CI && e2e.usesExternalTarget && !protectionHeaders) {
  throw new Error(
    'VERCEL_AUTOMATION_BYPASS_SECRET is required for protected preview E2E',
  )
}

/** The requirement's viewport, written as the numbers it states. */
export const MOBILE_VIEWPORT = { width: 390, height: 844 }
/** Historical evidence geometry only; no active tablet browser project. */
export const TABLET_VIEWPORT = { width: 768, height: 1024 }

export default defineConfig({
  testDir: './e2e',
  // `.spec.ts` only. Vitest owns `*.test.ts(x)` under `src/`, and a runner that
  // picks up the other one's files is the first thing that goes wrong here.
  testMatch: /.*\.spec\.ts$/,
  testIgnore: browserTestIgnoreForTarget(e2e.baseURL),
  grep: browserTestsForTarget(designSystemPackage.version, e2e.baseURL),

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
    ...(protectionHeaders ? { extraHTTPHeaders: protectionHeaders } : {}),
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
  ],

  // Named, so a failed run's artefacts are obvious and `.gitignore`d as a unit.
  outputDir: './test-results',

  // CI hands the suite a deployed origin; locally it starts the dev server.
  webServer: e2e.usesExternalTarget
    ? undefined
    : {
        command: 'npm run e2e:server',
        url: LOCAL_BASE_URL,
        env: browserSupabaseEnv(e2e.url, e2e.anonKey),
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
})
