import AxeBuilder from '@axe-core/playwright'
import { test as base, expect } from '@playwright/test'

/**
 * ENV-07 — the fixtures every spec imports instead of `@playwright/test`.
 *
 * The one that matters is `visit`. CORE-05 asks for `axe-core` against *every
 * screen the suite visits*, and the only way that stays true as the suite grows
 * is for visiting and checking to be the same act. A spec cannot reach a screen
 * without an accessibility scan, because there is no other way in — and
 * `src/test/e2e-harness.test.ts` fails if a spec reaches for `page.goto`
 * directly, which is the only way back around it.
 *
 * Violations are attached to the report as JSON as well as asserted on, so a CI
 * failure says which rule, on which node, rather than "expected 0, got 3".
 */

interface Fixtures {
  /** Navigate to a path and scan the screen that renders. */
  visit: (path: string) => Promise<void>
  /** Scan the current screen again — after opening a dialog, say. */
  checkA11y: () => Promise<void>
}

export const test = base.extend<Fixtures>({
  checkA11y: async ({ page }, use, testInfo) => {
    await use(async () => {
      const results = await new AxeBuilder({ page }).analyze()

      if (results.violations.length > 0) {
        await testInfo.attach('axe-violations.json', {
          body: JSON.stringify(results.violations, null, 2),
          contentType: 'application/json',
        })
      }

      expect(
        results.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          nodes: violation.nodes.map((node) => node.target.join(' ')),
        })),
      ).toEqual([])
    })
  },

  visit: async ({ page, checkA11y }, use) => {
    await use(async (path: string) => {
      await page.goto(path)
      // The heading is the screen: `Screen` renders it, so waiting for it is
      // waiting for the route to have resolved rather than for a fixed delay.
      await expect(page.locator('main h1')).toBeVisible()
      await checkA11y()
    })
  },
})

export { expect } from '@playwright/test'
