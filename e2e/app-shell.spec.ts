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
  await visit('/welcome')

  // Route changes deliberately focus the arriving screen heading. Clear that
  // programmatic focus before proving the document's natural keyboard order.
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  })

  await page.keyboard.press('Tab')

  const focused = page.locator(':focus')
  await expect(focused).toHaveAttribute('href', '#main')
})

test('welcome groups one card under the wordmark, pins its entries, and auth uses a direct form', async ({ page, visit }, testInfo) => {
  await visit('/welcome')

  // REQ-015: the line under the wordmark is the card's, not a floating label,
  // and the card holds no action — both entries are the pinned footer.
  const card = page.locator('main .clr-card')
  await expect(card).toHaveCount(1)
  await expect(card).toContainText('Strength training, simplified.')
  await expect(card.getByRole('button')).toHaveCount(0)
  await expect(page.locator('main').getByRole('status')).toHaveCount(0)

  const foot = page.locator('main .clr-scroll-region__foot > .clr-footer')
  await expect(foot).toHaveCount(1)
  await expect(foot.getByRole('button')).toHaveText(['Sign in', 'Create account'])
  await expect(page.getByRole('button', { name: /begin session/i })).toHaveCount(0)

  // Grouping, rendered: wordmark, then the card, then the footer, with the
  // footer's last action inside the viewport rather than below the fold.
  const boxes = await page.evaluate(() => {
    const top = (selector: string) =>
      document.querySelector(selector)?.getBoundingClientRect().top ?? -1
    const lastAction = document.querySelector(
      'main .clr-footer button:last-of-type',
    )
    return {
      heading: top('main h1'),
      card: top('main .clr-card'),
      foot: top('main .clr-footer'),
      lastActionBottom: lastAction?.getBoundingClientRect().bottom ?? -1,
      viewport: window.innerHeight,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }
  })
  expect(boxes.heading).toBeGreaterThanOrEqual(0)
  expect(boxes.card).toBeGreaterThan(boxes.heading)
  expect(boxes.foot).toBeGreaterThan(boxes.card)
  expect(boxes.lastActionBottom).toBeLessThanOrEqual(boxes.viewport)
  expect(boxes.overflow).toBeLessThanOrEqual(0)
  await page.screenshot({ path: testInfo.outputPath('vibe-d-welcome.png') })

  await foot.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/login\?mode=create$/)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Create account' }),
  ).toBeVisible()
  await expect(page.locator('main .clr-card')).toHaveCount(0)
  await expect(page.locator('main .clr-footer')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Send code' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('vibe-d-create-account.png') })
})

test.describe('with reduced motion', () => {
  // The browser's own media feature, set before the first document loads.
  test.use({ reducedMotion: 'reduce' })

  test('welcome entries work from the keyboard', async ({ page, visit }) => {
    await visit('/welcome')

    // Reduced motion reaches the final state at once: the card is fully shown
    // on arrival and nothing is held behind an entrance.
    const card = page.locator('main .clr-card')
    await expect(card).toBeVisible()
    await expect(card).toHaveCSS('opacity', '1')

    const signIn = page.getByRole('button', { name: 'Sign in' })
    const create = page.getByRole('button', { name: 'Create account' })
    await signIn.focus()
    await page.keyboard.press('Tab')
    await expect(create).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(signIn).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/login$/)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Sign in' }),
    ).toBeVisible()
  })
})

test('the full atmosphere keeps every colored layer in the viewport', async ({
  page,
  visit,
}) => {
  await visit('/welcome')

  const visibleFractions = await page
    .locator('.clr-atmosphere__blob')
    .evaluateAll((blobs) =>
      blobs.map((blob) => {
        const rect = blob.getBoundingClientRect()
        const visibleWidth = Math.max(
          0,
          Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0),
        )
        const visibleHeight = Math.max(
          0,
          Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0),
        )
        return (visibleWidth * visibleHeight) / (rect.width * rect.height)
      }),
    )

  expect(visibleFractions).toHaveLength(3)
  for (const visibleFraction of visibleFractions) {
    expect(visibleFraction).toBeGreaterThan(0.25)
  }
})

test('entry forms use the same Full atmosphere as every production screen', async ({
  page,
  visit,
}) => {
  await visit('/login?mode=create')

  const presentation = await page.locator('.clr-atmosphere').evaluate((layer) => {
    const style = getComputedStyle(layer)
    return {
      opacity: Number(style.getPropertyValue('--atmosphere-opacity')),
      dim: Number(style.getPropertyValue('--atmosphere-dim')),
    }
  })

  expect(presentation).toEqual({
    opacity: 0.4,
    dim: 0.5,
  })

  const visibleFractions = await page
    .locator('.clr-atmosphere__blob')
    .evaluateAll((blobs) =>
      blobs.map((blob) => {
        const rect = blob.getBoundingClientRect()
        const visibleWidth = Math.max(
          0,
          Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0),
        )
        const visibleHeight = Math.max(
          0,
          Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0),
        )
        return (visibleWidth * visibleHeight) / (rect.width * rect.height)
      }),
    )

  for (const visibleFraction of visibleFractions) {
    expect(visibleFraction).toBeGreaterThan(0.25)
  }
})

test('the CLEAR type system loads from the app origin', async ({ page, visit }) => {
  const fontResponses = new Set<string>()
  await page.addInitScript(() => {
    const metric = { value: 0 }
    Object.defineProperty(window, '__clearFontLayoutShift', { value: metric })
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          hadRecentInput: boolean
          value: number
        }
        if (!shift.hadRecentInput) metric.value += shift.value
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })
  page.on('response', (response) => {
    if (response.request().resourceType() === 'font') {
      fontResponses.add(response.url())
    }
  })

  await visit('/login')

  const loaded = await page.evaluate(async () => {
    const expected = [
      ['Rajdhani', '700'],
      ['Oxanium', '700'],
      ['Space Grotesk', '500'],
    ] as const

    await Promise.all(
      expected.map(([family, weight]) =>
        document.fonts.load(`${weight} 32px "${family}"`, 'CLEAR SIGN IN'),
      ),
    )

    return expected.map(([family, weight]) => ({
      family,
      weight,
      available: document.fonts.check(
        `${weight} 32px "${family}"`,
        'CLEAR SIGN IN',
      ),
    }))
  })

  expect(loaded).toEqual([
    { family: 'Rajdhani', weight: '700', available: true },
    { family: 'Oxanium', weight: '700', available: true },
    { family: 'Space Grotesk', weight: '500', available: true },
  ])

  const appOrigin = new URL(page.url()).origin
  expect(fontResponses.size).toBeGreaterThanOrEqual(3)
  for (const url of fontResponses) {
    expect(new URL(url).origin).toBe(appOrigin)
    expect(url).not.toMatch(/fonts\.(googleapis|gstatic)\.com/)
  }

  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS(
    'font-family',
    /Rajdhani/,
  )
  await expect(page.locator('body')).toHaveCSS('font-family', /Space Grotesk/)

  const fontLayoutShift = await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
    return (
      window as typeof window & { __clearFontLayoutShift: { value: number } }
    ).__clearFontLayoutShift.value
  })
  expect(fontLayoutShift).toBeLessThanOrEqual(0.01)
})
