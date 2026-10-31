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
