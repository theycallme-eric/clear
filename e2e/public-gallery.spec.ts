import { test, expect } from './fixtures'
import { PUBLIC_LIBRARY_ROUTES } from './required-routes'

for (const { screen, path, section } of PUBLIC_LIBRARY_ROUTES) {
  test(`public library: ${screen} opens without account traffic`, async ({ page, visit, checkA11y }) => {
    const accountRequests: string[] = []
    page.on('request', (request) => {
      if (/\/(auth|rest|functions)\/v1\//.test(request.url())) accountRequests.push(request.url())
    })

    await visit(path)
    await expect(page.getByRole('navigation', { name: 'Gallery sections' })).toBeVisible()
    if (section) await expect(page.getByRole('heading', { level: 2, name: section })).toBeVisible()
    else await expect(page.getByText(/no account required/)).toBeVisible()

    await page.reload()
    await expect(page.getByRole('navigation', { name: 'Gallery sections' })).toBeVisible()
    await checkA11y()
    expect(accountRequests).toEqual([])
  })
}

test('public library: related presentations fit phones and keep real controls without account traffic', async ({ page, visit, checkA11y }) => {
  const accountRequests: string[] = []
  page.on('request', request => {
    if (/\/(auth|rest|functions)\/v1\//.test(request.url())) accountRequests.push(request.url())
  })
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    for (const component of ['WorkoutEntryComparison', 'MovementIdentityComparison']) {
      await visit(`/gallery/app?component=${component}`)
      await expect(page.getByRole('heading', { name: component, exact: true })).toBeVisible()
      for (const skin of ['clear', 'vapour', 'signal', 'mono']) {
        await page.locator('.clr-dev-gallery__chrome').getByRole('radio', { name: skin, exact: true }).click()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      }
      await checkA11y()
    }
  }
  await page.getByRole('button', { name: /^Swap back squat$/i }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await checkA11y()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  const recorded = page.locator('.clr-dev-gallery__specimen').filter({
    has: page.getByRole('heading', { name: 'Saved detail · recorded sets', exact: true }),
  })
  const disclosure = recorded.getByRole('button', { name: 'Saved detail · primary work', exact: true })
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
  await disclosure.click()
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
  expect(accountRequests).toEqual([])
})
