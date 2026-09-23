import { expect, test } from './fixtures'
import { SCREENS } from './screens'

/**
 * CORE-05 — the reduced-motion end state, proved in a browser.
 *
 * `src/styles/reduced-motion.test.ts` holds the stylesheets to the contract;
 * this holds the running app to what the contract is *for*. Under
 * `prefers-reduced-motion: reduce` a screen must arrive already finished:
 *
 *   · nothing is still animating once the screen has resolved,
 *   · nothing has disappeared because its animation was silenced,
 *   · nothing waits on an animation before it can be used.
 *
 * Playwright's `reducedMotion` emulates the real media feature, so both the
 * CSS fallback and the JS-side `prefersReducedMotion()` branches are exercised
 * the way a person who set the preference would exercise them.
 */

test.use({ reducedMotion: 'reduce' })

/** Elements that carry the screen's content, and are therefore never blank. */
const CONTENT =
  'main h1, main p, main a, main form, main button, main input, main .clr-boot > *'

for (const screen of SCREENS) {
  test(`${screen.path} renders its final state immediately`, async ({
    page,
    visit,
  }) => {
    await visit(screen.path)

    // Nothing is mid-flight: every animation has either been silenced or has
    // already reached its end. A `running` one means something is still on its
    // way in, which is the wait reduced motion exists to remove.
    await expect
      .poll(() =>
        page.evaluate(() =>
          document
            .getAnimations()
            .filter((animation) => animation.playState === 'running')
            .map(
              (animation) =>
                (animation as Animation & { animationName?: string })
                  .animationName ?? 'unnamed',
            ),
        ),
      )
      .toEqual([])

    // Nothing vanished with its animation. An element whose entrance was what
    // made it visible is invisible the moment that entrance is removed, and no
    // automated accessibility check would notice.
    const content = await page.evaluate((selector) => {
      const elements = [...document.querySelectorAll(selector)]
      return {
        checked: elements.length,
        blanked: elements
          .filter((element) => {
            const style = getComputedStyle(element)
            return (
              style.opacity === '0' ||
              style.visibility === 'hidden' ||
              style.display === 'none'
            )
          })
          .map(
            (element) => `${element.tagName.toLowerCase()}.${element.className}`,
          ),
      }
    }, CONTENT)

    expect(content.blanked).toEqual([])
    // A selector that matches nothing passes this check without checking
    // anything; every screen has a heading and at least one thing under it.
    expect(content.checked).toBeGreaterThan(1)
  })
}

test('a screen is usable on arrival, with nothing waiting on an entrance', async ({
  page,
  visit,
}) => {
  await visit('/welcome')

  // No settling, no timeout: the first thing the person does is the thing the
  // screen is for, and it works.
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(
    'Sign in',
  )
})
