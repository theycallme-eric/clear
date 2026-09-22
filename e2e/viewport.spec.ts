import { MOBILE_VIEWPORT } from '../playwright.config'

import { expect, test } from './fixtures'

/**
 * ENV-07 — the baseline itself, asserted rather than assumed.
 *
 * "The default project is a mobile viewport" is a claim about a config file,
 * and a config file can drift. These two tests are the claim restated where a
 * browser can answer it: the project that runs first reports a phone's
 * geometry and a phone's input, and the additional project reports a desktop's.
 */

test('the default project is a 390×844 touch, coarse-pointer phone', async ({
  page,
  visit,
}) => {
  test.skip(test.info().project.name !== 'mobile', 'asserts the mobile project')

  await visit('/')

  expect(page.viewportSize()).toEqual(MOBILE_VIEWPORT)

  const input = await page.evaluate(() => ({
    touch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    coarse: window.matchMedia('(pointer: coarse)').matches,
    hoverless: window.matchMedia('(hover: none)').matches,
  }))

  expect(input).toEqual({ touch: true, coarse: true, hoverless: true })
})

test('desktop is additional coverage, not the baseline', async ({
  page,
  visit,
}) => {
  test.skip(
    test.info().project.name !== 'desktop',
    'asserts the desktop project',
  )

  await visit('/')

  expect(page.viewportSize()?.width).toBeGreaterThan(MOBILE_VIEWPORT.width)

  const input = await page.evaluate(() => ({
    fine: window.matchMedia('(pointer: fine)').matches,
    hover: window.matchMedia('(hover: hover)').matches,
  }))

  expect(input).toEqual({ fine: true, hover: true })
})
