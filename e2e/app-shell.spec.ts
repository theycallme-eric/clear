import { expect, test } from './fixtures'
import { SCREENS } from './screens'

/**
 * ENV-07 + CORE-05 — every screen the app routes to, visited and scanned.
 *
 * The list lives in `screens.ts` and is checked against the router by the unit
 * suite, so a screen cannot ship without being visited here — and being visited
 * is what gets it an `axe-core` scan, a heading-outline check and a document
 * title, because `visit` does all three and there is no other way in.
 */

for (const screen of SCREENS) {
  test(`${screen.path} renders one accessible screen`, async ({
    page,
    visit,
  }) => {
    await visit(screen.path)

    await expect(page).toHaveTitle(screen.title)

    // CORE-05: exactly one `<h1>`, inside the one `<main>`, and it names the
    // screen. The outline cannot be checked by axe — it has no opinion about
    // how many `<h1>`s is right — so it is checked here. The name rather than
    // the text, because a wordmark heading's visible glyphs are decoration and
    // its accessible name is what the screen is actually called.
    const headings = page.getByRole('heading', { level: 1 })
    await expect(headings).toHaveCount(1)
    await expect(headings).toHaveAccessibleName(screen.heading)
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
