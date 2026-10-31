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
    for (const [component, title] of [
      ['WorkoutEntryComparison', 'History and Favorites'],
      ['MovementIdentityComparison', 'Movement across workout screens'],
    ]) {
      await visit(`/gallery/app?component=${component}`)
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
      for (const skin of ['clear', 'vapour', 'signal', 'mono']) {
        await page.locator('.clr-dev-gallery__chrome').getByRole('radio', { name: skin, exact: true }).click()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      }
      const textGutters = await page.evaluate(() => {
        const title = document.querySelector('main h1')!.getBoundingClientRect()
        return [
          '.clr-dev-gallery > .clr-dev-gallery__meta',
          '.clr-dev-gallery__section > h2',
          '.clr-dev-gallery__group > h3',
          '.clr-dev-gallery__group > p',
        ].every(selector => [...document.querySelectorAll(selector)].every(element => {
          const box = element.getBoundingClientRect()
          return box.left >= title.left && box.right <= title.right
        }))
      })
      expect(textGutters).toBe(true)
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
  const nav = page.getByRole('navigation', { name: 'Gallery sections' })
  await nav.getByRole('link', { name: 'History and Favorites', exact: true }).click()
  await expect(page).toHaveURL(/component=WorkoutEntryComparison$/)
  await expect(page.locator('.clr-dev-gallery__group')).toHaveCount(1)
  await expect(page.locator('.clr-dev-gallery__specimen')).toHaveCount(2)
  await expect(nav.locator('[aria-current="page"]')).toHaveText('History and Favorites')
  await page.reload()
  await expect(page.locator('.clr-dev-gallery__group')).toHaveCount(1)
  await checkA11y()
  await nav.getByRole('link', { name: 'All components', exact: true }).click()
  await expect(page).not.toHaveURL(/component=/)
  await expect(page.locator('.clr-dev-gallery__group').nth(1)).toBeAttached()
  expect(await page.locator('.clr-dev-gallery__group').count()).toBeGreaterThan(1)
  expect(accountRequests).toEqual([])
})
