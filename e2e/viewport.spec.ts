import { MOBILE_VIEWPORT } from '../playwright.config'

import { expect, test } from './fixtures'

/**
 * ENV-07 — the baseline itself, asserted rather than assumed.
 *
 * "The default project is a mobile viewport" is a claim about a config file,
 * and a config file can drift. These tests are the claim restated where a
 * browser can answer it: the project that runs first reports a phone's
 * geometry and a phone's input, including short and narrow phone shapes.
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

// Wider-device cases remain in Git history; CLEAR's current scope is phones.
for (const viewport of [
  { name: 'short phone', width: 390, height: 320 },
  { name: 'narrow phone', width: 320, height: 568 },
] as const) {
  test(`${viewport.name} retains touch, coarse-pointer and hoverless input`, async ({ page, visit }) => {
    await page.setViewportSize(viewport)
    await visit('/')
    expect(page.viewportSize()).toEqual({ width: viewport.width, height: viewport.height })
    const input = await page.evaluate(() => ({
      touch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      coarse: window.matchMedia('(pointer: coarse)').matches,
      hoverless: window.matchMedia('(hover: none)').matches,
    }))
    expect(input).toEqual({ touch: true, coarse: true, hoverless: true })
  })
}
