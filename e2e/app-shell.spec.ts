import { expect, test } from './fixtures'

/**
 * ENV-07 + CORE-05 — every screen the app currently routes to, visited and
 * scanned.
 *
 * The list is deliberately a list. As screens land they are added here, and
 * adding one is what gets it an `axe-core` scan, a heading-outline check and a
 * document title — because `visit` does all three and there is no other way in.
 *
 * `/does-not-exist` is a screen, not a gap: the catch-all route renders one,
 * and a 404 that is inaccessible is still inaccessible.
 */

const SCREENS = [
  { path: '/', title: 'CLEAR', heading: 'CLEAR' },
  {
    path: '/does-not-exist',
    title: 'Page not found · CLEAR',
    heading: 'Page not found',
  },
]

for (const screen of SCREENS) {
  test(`${screen.path} renders one accessible screen`, async ({
    page,
    visit,
  }) => {
    await visit(screen.path)

    await expect(page).toHaveTitle(screen.title)

    // CORE-05: exactly one `<h1>`, inside the one `<main>`, and it names the
    // screen. The outline cannot be checked by axe — it has no opinion about
    // how many `<h1>`s is right — so it is checked here.
    const headings = page.getByRole('heading', { level: 1 })
    await expect(headings).toHaveCount(1)
    await expect(headings).toHaveText(screen.heading)
    await expect(page.locator('main')).toHaveCount(1)
  })
}

test('the skip link is the first thing a keyboard reaches', async ({
  page,
  visit,
}) => {
  await visit('/')

  await page.keyboard.press('Tab')

  const focused = page.locator(':focus')
  await expect(focused).toHaveAttribute('href', '#main')
})
