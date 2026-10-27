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

    // CORE-05: exactly one `<h1>`, in the page header or main, and it names the
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

test('welcome groups one card under the wordmark, holds its one entry, and auth uses a direct form', async ({ page, visit }, testInfo) => {
  await visit('/welcome')
  await expect(
    page.getByRole('heading', { level: 1, name: 'CLEAR' }).getByRole('img', {
      name: 'CLEAR',
    }),
  ).toBeVisible()

  // REQ-015 / U13: the line under the wordmark is the card's, not a floating
  // label, and the card holds the one Get started entry (U14).
  const card = page.locator('main .clr-card')
  await expect(card).toHaveCount(1)
  await expect(card).toContainText('Strength training, simplified.')
  await expect(card.getByRole('button')).toHaveText(['Get started'])
  await expect(page.locator('main').getByRole('status')).toHaveCount(0)
  await expect(page.locator('main .clr-footer')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /begin session/i })).toHaveCount(0)

  // Grouping, rendered: wordmark, then the card holding the entry, with the
  // entry inside the viewport rather than below the fold.
  const boxes = await page.evaluate(() => {
    const top = (selector: string) =>
      document.querySelector(selector)?.getBoundingClientRect().top ?? -1
    const action = document.querySelector('main .clr-card button')
    return {
      heading: top('h1'),
      card: top('main .clr-card'),
      actionBottom: action?.getBoundingClientRect().bottom ?? -1,
      viewport: window.innerHeight,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }
  })
  expect(boxes.heading).toBeGreaterThanOrEqual(0)
  expect(boxes.card).toBeGreaterThan(boxes.heading)
  expect(boxes.actionBottom).toBeGreaterThan(0)
  expect(boxes.actionBottom).toBeLessThanOrEqual(boxes.viewport)
  expect(boxes.overflow).toBeLessThanOrEqual(0)
  await page.screenshot({ path: testInfo.outputPath('vibe-d-welcome.png') })

  await card.getByRole('button', { name: 'Get started' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Get started' }),
  ).toBeVisible()
  // 0.14.3 groups the native form in one card; the submit stays pinned.
  const formCard = page.locator('main .clr-card')
  await expect(formCard).toHaveCount(1)
  await expect(formCard.getByRole('heading', { level: 2, name: 'Your email' })).toBeVisible()
  await expect(formCard.getByLabel('Email')).toBeVisible()
  await expect(formCard.locator('form')).toHaveCount(1)
  await expect(formCard.getByRole('button')).toHaveCount(0)
  const footer = page.locator('main .clr-footer')
  await expect(footer).toHaveCount(1)
  const submit = footer.getByRole('button', { name: 'Send code' })
  await expect(submit).toBeVisible()
  await expect(submit).toHaveAttribute('type', 'submit')
  const formId = await formCard.locator('form').getAttribute('id')
  expect(formId).toBeTruthy()
  await expect(submit).toHaveAttribute('form', formId!)
  await page.screenshot({ path: testInfo.outputPath('vibe-d-get-started.png') })
})

test('JOURNEY-002 welcome: one statement, its entries, the enlarged label tier and no overflow at enlarged text', async ({
  page,
  visit,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'JOURNEY-002 is proven at the 390 by 844 phone viewport')
  expect(page.viewportSize()).toEqual({ width: 390, height: 844 })
  await visit('/welcome')

  // U08: one statement in the one card, and the entry is the next action.
  const card = page.locator('main .clr-card')
  await expect(card.locator('p')).toHaveCount(1)
  await expect(card.locator('p')).toHaveText('Strength training, simplified.')
  await expect(card.getByRole('button')).toHaveCount(1)

  // U06: on a screen the 12px data-label tier reads at the next label step.
  const tier = await page.locator('main.clr-screen').evaluate((main) => {
    const style = getComputedStyle(main)
    return {
      xs: style.getPropertyValue('--label-xs-size').trim(),
      sm: style.getPropertyValue('--label-sm-size').trim(),
      margin: getComputedStyle(main.querySelector('.clr-screen__content p')!).marginBottom,
    }
  })
  expect(tier.xs).toBe(tier.sm)
  // U05: the gap owns the rhythm, never a browser paragraph margin.
  expect(tier.margin).toBe('0px')

  // Enlarged text and the longest entry label: nothing clips or overflows,
  // and the entry stays inside the viewport.
  await page.addStyleTag({
    content: '.clr-screen { --label-sm-size: 18px; --label-md-size: 20px; --label-lg-size: 24px; --paragraph-md-size: 20px; }',
  })
  for (const button of await page.locator('main .clr-card button').all()) {
    await button.evaluate((element) => {
      const label = [...element.querySelectorAll('*')].find((node) => node.children.length === 0 && node.textContent?.trim()) ?? element
      label.textContent = `${label.textContent} with the longest label`
    })
  }
  const fit = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll<HTMLElement>('main .clr-card button')]
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      outside: buttons.filter((button) => {
        const rect = button.getBoundingClientRect()
        return rect.left < -0.5 || rect.right > window.innerWidth + 0.5 || rect.bottom > window.innerHeight + 0.5
      }).length,
      clipped: [...document.querySelectorAll<HTMLElement>('main :is(p, button, h1)')].filter((element) => {
        const style = getComputedStyle(element)
        return /(hidden|clip)/.test(style.overflowX) && style.textOverflow !== 'ellipsis' &&
          element.scrollWidth > element.clientWidth + 1
      }).length,
      heights: new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().height))).size,
    }
  })
  expect(fit).toEqual({ overflow: 0, outside: 0, clipped: 0, heights: 1 })
})

test.describe('with reduced motion', () => {
  // The browser's own media feature, set before the first document loads.
  test.use({ reducedMotion: 'reduce' })

  test('the welcome entry works from the keyboard', async ({ page, visit }) => {
    await visit('/welcome')

    // Reduced motion reaches the final state at once: the card is fully shown
    // on arrival and nothing is held behind an entrance.
    const card = page.locator('main .clr-card')
    await expect(card).toBeVisible()
    await expect(card).toHaveCSS('opacity', '1')

    const entry = card.getByRole('button', { name: 'Get started' })
    await entry.focus()
    await expect(entry).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/login$/)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Get started' }),
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

test('JOURNEY-008: the installed PWA owns every Settings route, so in-app navigation never leaves it', async ({
  page,
  visit,
}) => {
  // The standalone window's scope is the whole origin, so `/settings` and its
  // sub-view open inside it, and its launch is Home — Settings' safe fallback.
  const manifest = (await (await page.request.get('/manifest.webmanifest')).json()) as {
    display?: string
    scope?: string
    start_url?: string
  }
  expect(manifest.display).toBe('standalone')
  expect(manifest.scope).toBe('/')
  expect(manifest.start_url).toBe('/')

  // A direct link into Settings without a session is answered in-app by the
  // guard, never by a blank or external page. The signed-in Back and header
  // control are walked in e2e/settings-locations.spec.ts.
  for (const path of ['/settings', '/settings/locations']) {
    await visit(path)
    await expect(page).toHaveURL((url) => url.pathname === '/welcome')
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('CLEAR')
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
