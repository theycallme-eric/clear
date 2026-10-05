import type { Page } from '@playwright/test'

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

  // REQ-011: the arrival is complete the moment it happens. The chrome adds no
  // route entry under the preference, and nothing is on its way in.
  await expect(page.locator('main')).not.toHaveClass(/route-enter-|clr-interlace/)
  expect(await runningEntrances(page)).toEqual([])
})

/**
 * Keyframe animations still on their way to an end. Loops and the atmosphere
 * are not arrivals, and a colour transition on the control that was just
 * pressed is not motion (it has no keyframes, so it has no name).
 */
function runningEntrances(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    document
      .getAnimations()
      .filter(
        (animation) =>
          animation.playState === 'running' &&
          animation.effect?.getComputedTiming().iterations !== Infinity,
      )
      .map(
        (animation) =>
          (animation as Animation & { animationName?: string }).animationName,
      )
      .filter((name): name is string => name !== undefined),
  )
}

/**
 * REQ-011 — the same moments with motion allowed, so the reduced-motion result
 * above is a real difference rather than an app that never moves. The media
 * feature is the browser's own in both halves; nothing here stubs it.
 */
test.describe('with motion allowed', () => {
  test.use({ reducedMotion: 'no-preference' })

  /**
   * The screen named by `heading` arrived with exactly this entry: the class
   * the chrome gave it, and the keyframes the browser resolved from it. The URL
   * changes before the screen commits, so the screen is what is waited for.
   */
  async function expectEntry(
    page: Page,
    heading: string,
    entry: { name: string; keyframes: string },
  ) {
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(
      heading,
    )
    const main = page.locator('main')
    await expect(main).toHaveClass(new RegExp(`\\b${entry.name}\\b`))
    expect(
      await main.evaluate((element) => ({
        entries: [...element.classList].filter((name) =>
          name.startsWith('route-enter-'),
        ),
        keyframes: getComputedStyle(element).animationName,
      })),
    ).toEqual({ entries: [entry.name], keyframes: entry.keyframes })
  }

  const FORWARD = { name: 'route-enter-forward', keyframes: 'clr-shift-in-right' }
  const BACK = { name: 'route-enter-back', keyframes: 'clr-shift-in-left' }

  test('a screen enters forward going in and back coming out', async ({
    page,
    visit,
  }) => {
    await visit('/welcome')
    // The first load is the browser's: nothing arrived.
    await expect(page.locator('main')).not.toHaveClass(/route-enter-/)

    await page.getByRole('button', { name: 'Sign in' }).click()
    await expectEntry(page, 'Sign in', FORWARD)

    await page.goBack()
    await expectEntry(page, 'CLEAR', BACK)

    await page.goForward()
    await expectEntry(page, 'Sign in', FORWARD)
  })

  test('a set arrives 40ms apart', async ({ page, visit }) => {
    await visit('/welcome')

    const delays = await page.evaluate(() =>
      [...document.querySelectorAll('main .clr-boot > *')].map((row) => {
        const style = getComputedStyle(row)
        return { keyframes: style.animationName, delay: style.animationDelay }
      }),
    )

    expect(delays.length).toBeGreaterThan(1)
    expect(delays).toEqual(
      delays.map((_, index) => ({
        keyframes: 'clr-boot-in',
        delay: index === 0 ? '0s' : `${(index * 0.04).toFixed(2)}s`,
      })),
    )
  })

  test('a navigation that lands mid-entry cuts it rather than waiting', async ({
    page,
    visit,
  }) => {
    await visit('/welcome')
    // The route shift is over in 150ms, which is no window to act in. Holding
    // the shipped token open makes "mid-entry" a state the test is in rather
    // than a race it hopes to win; the entry and its class are untouched.
    await page.addStyleTag({ content: 'html:root { --dur-fast: 30s; }' })

    await page.getByRole('button', { name: 'Sign in' }).click()
    await expectEntry(page, 'Sign in', FORWARD)
    expect(await runningEntrances(page)).toContain('clr-shift-in-right')

    // Back while it is still playing: the new state does not queue behind the
    // entry, and the old entry is neither played out nor reversed.
    await page.goBack()

    await expect(page).toHaveURL(/\/welcome$/)
    await expectEntry(page, 'CLEAR', BACK)
    await expect(page.locator('main')).toHaveCount(1)
    expect(await runningEntrances(page)).not.toContain('clr-shift-in-right')

    // And nothing blocks on what is left: the screen works straight away.
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/login$/)
  })
})
