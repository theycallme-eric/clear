import { expect, type Page, type TestInfo } from '@playwright/test'

import { MODEL_ROUTE, type createGenerationBudget } from '../support/generation-budget'
import type { CaptureDriver } from './capture'
import type { CaptureSkin } from './state-inventory'

/**
 * REQ-029 / REQ-030 / TASK-033 — the two network postures of the 0.14.3 lanes.
 *
 * They are opposites, and keeping them in one file is what keeps them apart:
 *
 *  * **The live lane** (`e2e/core-loop.spec.ts`, and only it) stubs nothing.
 *    Its guard lets the first generation POST through to the real service and
 *    aborts every later one before it leaves the browser.
 *  * **A capture lane** is explicitly deterministic. It pins the skin and the
 *    motion preference, and it never generates: any generation POST is aborted,
 *    and counted so a capture can assert there was none.
 *
 * Neither changes routing or state. The app under capture is the real app, on
 * its real routes, behind its real guards, holding a real session.
 */

/** The opt-in. Only the lane below may name it. */
export const CLEAR_0143_SINGLE_GENERATION_GUARD = 'CLEAR_0143_SINGLE_GENERATION_GUARD'

/** The one spec that spends a generation. */
export const SINGLE_GENERATION_LANE = 'e2e/core-loop.spec.ts'

export type GenerationDispatch = 'pass' | 'forward' | 'abort'

export interface SingleGenerationGuardOptions {
  readonly marker: string
  /** The opting-in spec's own file, as Playwright reports it. */
  readonly specFile: string
  readonly budget: ReturnType<typeof createGenerationBudget>
}

/**
 * Decide one request on a model route.
 *
 * Only a POST is a generation dispatch. A preflight or any other method passes
 * untouched and is not counted; the first POST to the budget's endpoint is
 * forwarded; every POST after it — and a POST to any other model endpoint — is
 * aborted before it reaches the service.
 */
export function singleGenerationGuard(options: SingleGenerationGuardOptions) {
  const lane = options.specFile.replaceAll('\\', '/')
  if (
    options.marker !== CLEAR_0143_SINGLE_GENERATION_GUARD ||
    !(lane === SINGLE_GENERATION_LANE || lane.endsWith(`/${SINGLE_GENERATION_LANE}`))
  ) {
    throw new Error(`Only ${SINGLE_GENERATION_LANE} may opt in to a live generation.`)
  }

  return (method: string, url: string): GenerationDispatch => {
    if (method !== 'POST') return 'pass'
    return options.budget.allow(url) ? 'forward' : 'abort'
  }
}

export interface DeterministicCaptureOptions {
  readonly skin: CaptureSkin
  readonly reducedMotion?: boolean
}

/** `skin.js`'s persistence key. */
const SKIN_KEY = 'clear.skin'

/**
 * Pin what a capture must not leave to chance, before navigation.
 *
 * The skin is stored the way the appearance picker stores it, so the app
 * applies it through its own boot path. Generation is refused outright.
 */
export async function installDeterministicCapture(page: Page, options: DeterministicCaptureOptions) {
  let blockedGenerations = 0

  await page.route(MODEL_ROUTE, (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    blockedGenerations += 1
    return route.abort('blockedbyclient')
  })
  await page.emulateMedia({ reducedMotion: options.reducedMotion ? 'reduce' : 'no-preference' })
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: SKIN_KEY, value: options.skin },
  )

  return { blockedGenerations: () => blockedGenerations }
}

/** The capture driver for a real page: observes, then screenshots on request. */
export function playwrightCaptureDriver(page: Page, testInfo: TestInfo): CaptureDriver {
  const settled = (assertion: Promise<void>) => assertion.then(() => true, () => false)

  return {
    async observe(target) {
      const heading = page.locator('main h1')
      await settled(expect(page).toHaveURL((url) => url.pathname === target.path, { timeout: 30_000 }))
      const named = await settled(
        expect(heading).toHaveAccessibleName(target.heading, { timeout: 30_000 }),
      )
      const stateVisible = await settled(
        expect(page.getByText(target.stateText, { exact: true }).first()).toBeVisible({
          timeout: 30_000,
        }),
      )
      return {
        pathname: new URL(page.url()).pathname,
        heading: named ? target.heading : await heading.innerText().catch(() => ''),
        stateVisible,
      }
    },

    motion: () =>
      page.evaluate(() => {
        const running = document
          .getAnimations()
          .filter((animation) => animation.playState === 'running')
          .map((animation) =>
            'animationName' in animation
              ? String(animation.animationName)
              : 'transitionProperty' in animation
                ? String(animation.transitionProperty)
                : animation.id,
          )
        return {
          reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          running,
          settled: running.length === 0,
        }
      }),

    async screenshot(name) {
      const path = testInfo.outputPath(name)
      const bytes = await page.screenshot({ path, caret: 'hide' })
      await testInfo.attach(name, { path, contentType: 'image/png' })
      return bytes
    },
  }
}
