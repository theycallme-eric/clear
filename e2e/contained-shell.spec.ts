import { expect, test } from './fixtures'

/**
 * CLEAR 0.9.7 contained-shell contract.
 *
 * The document stays fixed while each screen owns exactly one vertical
 * ScrollRegion. The component's hard edge, temporary streak and 2px bar are
 * the only overflow cues; content never fades beneath transparent chrome.
 */

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 320 },
  { name: 'tablet', width: 834, height: 600 },
  { name: 'desktop', width: 1280, height: 720 },
] as const

for (const viewport of VIEWPORTS) {
  test(`${viewport.name} keeps the document fixed and gives the screen one scroll owner`, async ({
    page,
    visit,
  }) => {
    await page.setViewportSize(viewport)
    await visit('/welcome')

    const scroller = page.locator('.clr-scroll-region__scroller')
    await expect(scroller).toHaveCount(1)

    const geometry = await page.evaluate(() => {
      const owner = document.querySelector<HTMLElement>(
        '.clr-scroll-region__scroller',
      )
      if (!owner) throw new Error('screen ScrollRegion is missing')

      const nestedOwners = [...owner.querySelectorAll<HTMLElement>('*')]
        .filter((element) => {
          const style = getComputedStyle(element)
          return (
            /(auto|scroll)/.test(style.overflowY) &&
            element.scrollHeight > element.clientHeight + 1
          )
        })
        .map((element) => element.className)

      return {
        bodyTop: document.scrollingElement?.scrollTop ?? -1,
        bodyHeight: document.scrollingElement?.scrollHeight ?? -1,
        bodyClientHeight: document.scrollingElement?.clientHeight ?? -1,
        overflowX: getComputedStyle(owner).overflowX,
        overflowY: getComputedStyle(owner).overflowY,
        nestedOwners,
      }
    })

    expect(geometry.bodyTop).toBe(0)
    expect(geometry.bodyHeight).toBe(geometry.bodyClientHeight)
    expect(geometry.overflowX).toBe('hidden')
    expect(geometry.overflowY).toBe('auto')
    expect(geometry.nestedOwners).toEqual([])
  })
}

test('a short phone keeps the last action reachable and shows only transient hard-edge feedback', async ({
  page,
  visit,
}) => {
  await page.setViewportSize({ width: 390, height: 320 })
  await visit('/welcome')

  const region = page.locator('.clr-scroll-region')
  const scroller = region.locator('.clr-scroll-region__scroller')
  const streak = region.locator('.clr-scroll-region__streak--bottom')
  const bar = region.locator('.clr-scroll-region__bar')

  await expect(region).toHaveAttribute('data-measured', '')
  expect(await scroller.evaluate((element) => element.scrollHeight)).toBeGreaterThan(
    await scroller.evaluate((element) => element.clientHeight),
  )

  // Capture the transient state inside the browser. A round trip from a remote
  // preview can take longer than the 420ms feedback window and would otherwise
  // turn a correct disappearance into a timing-dependent failure.
  const activeFeedback = await region.evaluate(async (wrapper) => {
    const owner = wrapper.querySelector<HTMLElement>(
      '.clr-scroll-region__scroller',
    )
    const edge = wrapper.querySelector<HTMLElement>(
      '.clr-scroll-region__streak--bottom',
    )
    const thumb = wrapper.querySelector<HTMLElement>('.clr-scroll-region__bar')
    if (!owner || !edge || !thumb) {
      throw new Error('ScrollRegion feedback elements are missing')
    }

    const activated = await new Promise<boolean>((resolve) => {
      const observer = new MutationObserver(() => {
        if (wrapper.hasAttribute('data-scrolling')) {
          observer.disconnect()
          resolve(true)
        }
      })
      observer.observe(wrapper, { attributes: true })
      owner.scrollTop = owner.scrollHeight
      owner.dispatchEvent(new Event('scroll'))
      window.setTimeout(() => {
        observer.disconnect()
        resolve(wrapper.hasAttribute('data-scrolling'))
      }, 300)
    })

    // The visual arrives in three 200ms steps. Sample after the last step but
    // before the 420ms settle timer clears the state.
    await new Promise((resolve) => window.setTimeout(resolve, 250))
    return {
      activated,
      edgeOpacity: Number(getComputedStyle(edge).opacity),
      barOpacity: Number(getComputedStyle(thumb).opacity),
      barWidth: getComputedStyle(thumb).width,
    }
  })

  expect(activeFeedback.activated).toBe(true)
  expect(activeFeedback.edgeOpacity).toBeGreaterThan(0)
  expect(activeFeedback.barOpacity).toBeGreaterThan(0)
  expect(activeFeedback.barWidth).toBe('2px')

  const lastAction = page.getByRole('button', { name: 'Create account' })
  const isInsideViewport = await lastAction.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return rect.top >= 0 && rect.bottom <= window.innerHeight
  })
  expect(isInsideViewport).toBe(true)

  await expect(region).not.toHaveAttribute('data-scrolling', '', {
    timeout: 1_500,
  })
  await expect(streak).toHaveCSS('opacity', '0')
  await expect(bar).toHaveCSS('opacity', '0')
})

test('transparent route chrome stays outside the scroller and fixed at its edge', async ({
  page,
  visit,
}) => {
  await page.setViewportSize({ width: 390, height: 320 })
  await visit('/login')

  const header = page.locator('header')
  const scroller = page.locator('.clr-scroll-region__scroller')
  await expect(header).toHaveCount(1)
  await expect(scroller.locator('header')).toHaveCount(0)

  const before = await header.boundingBox()
  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    element.dispatchEvent(new Event('scroll'))
  })
  const after = await header.boundingBox()

  expect(before).not.toBeNull()
  expect(after).not.toBeNull()
  expect(after?.y).toBeCloseTo(before?.y ?? 0, 0)
  expect(after?.height).toBeCloseTo(before?.height ?? 0, 0)
})

test('the fixed shell follows a reduced visual viewport without creating document scroll', async ({
  page,
  visit,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await visit('/login?mode=create')

  const shell = page.locator('.clr-shell--fixed')
  const scroller = page.locator('.clr-scroll-region__scroller')
  const initialShellHeight = await shell.evaluate(
    (element) => element.getBoundingClientRect().height,
  )
  const initialScrollerHeight = await scroller.evaluate(
    (element) => element.getBoundingClientRect().height,
  )

  await page.setViewportSize({ width: 390, height: 420 })

  await expect
    .poll(() => shell.evaluate((element) => element.getBoundingClientRect().height))
    .toBeLessThan(initialShellHeight)
  await expect
    .poll(() =>
      scroller.evaluate((element) => element.getBoundingClientRect().height),
    )
    .toBeLessThan(initialScrollerHeight)

  expect(
    await page.evaluate(() => document.scrollingElement?.scrollTop ?? -1),
  ).toBe(0)
  await page.getByRole('button', { name: 'Send code' }).scrollIntoViewIfNeeded()
  await expect(page.getByRole('button', { name: 'Send code' })).toBeVisible()
})
