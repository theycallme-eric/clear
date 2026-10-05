import { expect, test } from './fixtures'

/**
 * CLEAR 0.14.3 contained-shell contract.
 *
 * The document stays fixed while each screen owns exactly one vertical
 * ScrollRegion. The component's hard edge, temporary streak and 2px bar are
 * the only overflow cues; content never fades beneath transparent chrome.
 * The shell sits on the package's one atmosphere, and every skin renders the
 * shipped fonts, card ground and emission.
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

test('a short phone keeps the last action reachable at a hard edge', async ({
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

  const reached = await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    element.dispatchEvent(new Event('scroll'))
    return element.scrollTop
  })
  expect(reached).toBeGreaterThan(0)
  await expect(bar).toHaveCSS('width', '2px')

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

for (const viewport of [
  { name: 'short phone', width: 390, height: 320 },
  { name: 'narrow phone', width: 320, height: 568 },
  { name: 'touch tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 720 },
] as const) {
  test(`${viewport.name} pins the primary action in a measured transparent layer`, async ({
    page,
    visit,
  }) => {
    await page.setViewportSize(viewport)
    await visit('/login?mode=create')

    const region = page.locator('.clr-scroll-region')
    await expect(region).toHaveAttribute('data-measured', '')
    await expect(page.getByRole('button', { name: 'Send code' })).toBeVisible()

    const geometry = await region.evaluate((element) => {
      const scroller = element.querySelector<HTMLElement>(
        ':scope > .clr-scroll-region__scroller',
      )
      const foot = element.querySelector<HTMLElement>(
        ':scope > .clr-scroll-region__foot',
      )
      const action = foot?.querySelector<HTMLElement>('button')
      if (!scroller || !foot || !action) {
        throw new Error('the pinned footer or its action is missing')
      }

      scroller.scrollTop = scroller.scrollHeight
      const footRect = foot.getBoundingClientRect()
      const actionRect = action.getBoundingClientRect()
      const layers = [
        foot,
        ...foot.querySelectorAll<HTMLElement>('.clr-footer'),
        ...document.querySelectorAll<HTMLElement>('.clr-shell__content > header'),
      ].map((layer) => {
        const style = getComputedStyle(layer)
        return {
          background: style.backgroundColor,
          image: style.backgroundImage,
          mask: style.maskImage,
        }
      })

      return {
        measuredFoot: parseFloat(getComputedStyle(element).getPropertyValue('--foot-h')),
        footHeight: footRect.height,
        footHiddenContent: foot.scrollHeight - foot.clientHeight,
        scrollerBottom: scroller.getBoundingClientRect().bottom,
        footTop: footRect.top,
        actionTop: actionRect.top,
        actionBottom: actionRect.bottom,
        viewportHeight: window.innerHeight,
        scrollerMask: getComputedStyle(scroller).maskImage,
        layers,
        documentOverflowX:
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
        documentScrollTop: document.scrollingElement?.scrollTop ?? -1,
      }
    })

    // The scroller ends exactly where the measured footer begins: a hard clip,
    // so nothing passes under the layer and it needs no surface to hide it.
    expect(geometry.measuredFoot).toBeCloseTo(geometry.footHeight, 0)
    expect(geometry.scrollerBottom).toBeLessThanOrEqual(geometry.footTop + 1)
    expect(geometry.footHiddenContent).toBeLessThanOrEqual(1)
    expect(geometry.actionTop).toBeGreaterThanOrEqual(0)
    expect(geometry.actionBottom).toBeLessThanOrEqual(geometry.viewportHeight)
    expect(geometry.scrollerMask).toBe('none')
    for (const layer of geometry.layers) {
      expect(layer).toEqual({ background: 'rgba(0, 0, 0, 0)', image: 'none', mask: 'none' })
    }
    expect(geometry.documentOverflowX).toBeLessThanOrEqual(0)
    expect(geometry.documentScrollTop).toBe(0)
  })
}

test('one atmosphere fills a portrait phone from its longer side and survives navigation', async ({
  page,
  visit,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.setViewportSize({ width: 390, height: 844 })
  await visit('/welcome')

  await expect(page.locator('.clr-atmosphere')).toHaveCount(1)
  await expect(page.locator('.clr-atmosphere__blob')).toHaveCount(3)

  const blobs = await page.evaluate(() => {
    const longer = Math.max(window.innerWidth, window.innerHeight)
    const layer = document.querySelector<HTMLElement>('.clr-atmosphere')
    if (!layer) throw new Error('the atmosphere layer is missing')
    // Marks this exact node; a remount on navigation would lose it.
    layer.dataset.e2eMounted = 'once'

    return [...layer.querySelectorAll<HTMLElement>('.clr-atmosphere__blob')].map(
      (blob) => {
        // Layout geometry, so the running drift and breathing do not move it.
        const left = Math.max(0, blob.offsetLeft)
        const top = Math.max(0, blob.offsetTop)
        const right = Math.min(window.innerWidth, blob.offsetLeft + blob.offsetWidth)
        const bottom = Math.min(window.innerHeight, blob.offsetTop + blob.offsetHeight)
        const visible = Math.max(0, right - left) * Math.max(0, bottom - top)

        return {
          longerSideShare: blob.offsetWidth / longer,
          aspect: blob.offsetHeight / blob.offsetWidth,
          visibleShare: visible / (blob.offsetWidth * blob.offsetHeight),
          animations: blob.getAnimations().map((animation) => ({
            name: (animation as CSSAnimation).animationName,
            properties: [
              ...new Set(
                ((animation.effect as KeyframeEffect | null)?.getKeyframes() ?? []).flatMap(
                  (frame) =>
                    Object.keys(frame).filter(
                      (key) =>
                        !['offset', 'computedOffset', 'easing', 'composite'].includes(key),
                    ),
                ),
              ),
            ].sort(),
          })),
        }
      },
    )
  })

  // 62 / 54 / 34 cqmax in foundation.css — the longer side, not the width.
  expect(blobs.map((blob) => Number(blob.longerSideShare.toFixed(2)))).toEqual([
    0.62, 0.54, 0.34,
  ])
  for (const blob of blobs) {
    expect(blob.aspect).toBeCloseTo(1, 2)
    // Depth stays on screen: no blob sits mostly beyond the portrait edges.
    expect(blob.visibleShare).toBeGreaterThan(0.25)
    expect(blob.animations.map((animation) => animation.name)).toEqual([
      expect.stringMatching(/^clr-drift-[a-d]$/),
      'clr-breathe',
    ])
    // Compositor-only: no opacity, filter or outline is ever animated.
    expect(blob.animations[0].properties).toEqual(['transform'])
    expect(blob.animations[1].properties).toEqual(['rotate', 'scale'])
  }

  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/login/)
  await expect(page.locator('.clr-atmosphere')).toHaveCount(1)
  await expect(page.locator('.clr-atmosphere')).toHaveAttribute(
    'data-e2e-mounted',
    'once',
  )
})

test('reduced motion holds the atmosphere still without removing its depth', async ({
  page,
  visit,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await visit('/welcome')

  await expect(page.locator('.clr-atmosphere')).toHaveAttribute('data-static', 'true')
  const blobs = await page.locator('.clr-atmosphere__blob').evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element)
      return {
        animationName: style.animationName,
        running: element.getAnimations().length,
        transform: style.transform,
        scale: style.scale,
        rotate: style.rotate,
        width: (element as HTMLElement).offsetWidth,
      }
    }),
  )

  expect(blobs).toHaveLength(3)
  for (const blob of blobs) {
    expect(blob).toMatchObject({
      animationName: 'none',
      running: 0,
      transform: 'none',
      scale: 'none',
      rotate: 'none',
    })
    expect(blob.width).toBeGreaterThan(0)
  }
})

for (const skin of ['clear', 'vapour', 'signal', 'mono'] as const) {
  test(`the ${skin} skin keeps shipped fonts, ground and emission`, async ({
    page,
    visit,
  }) => {
    await visit('/login?mode=create')
    await page.evaluate((name) => {
      document.documentElement.setAttribute('data-skin', name)
    }, skin)
    // Loading, not merely checking: a face the screen has not drawn yet is
    // still one the skin must be able to fetch from the app's own origin.
    const facesLoaded = await page.evaluate(() =>
      Promise.all(
        ['700 16px Rajdhani', '500 16px "Space Grotesk"', '600 16px Oxanium'].map(
          async (font) => (await document.fonts.load(font)).length,
        ),
      ),
    )
    for (const faces of facesLoaded) expect(faces).toBeGreaterThan(0)

    const rendered = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement)
      const token = (name: string) => root.getPropertyValue(name).trim()
      const px = (name: string) => parseFloat(token(name))
      const heading = document.querySelector<HTMLElement>('main h1')
      const primary = document.querySelector<HTMLElement>('.clr-bleed.clr-glow')
      const quiet = document.querySelector<HTMLElement>('.clr-bleed:not(.clr-glow)')
      if (!heading || !primary || !quiet) {
        throw new Error('the heading or an emitting frame is missing')
      }

      return {
        skin: document.documentElement.getAttribute('data-skin'),
        atmosphereMarkers: document.querySelectorAll(
          '[data-atmosphere]:not([data-atmosphere="full"])',
        ).length,
        // CSS minification may spell 0.7 as .7; the contract is numeric opacity.
        cardGround: Number(token('--card-ground-alpha')),
        emitNear: token('--emit-near'),
        emitFar: token('--emit-far'),
        glowSpread: token('--glow-spread'),
        borderWidth: token('--border-width'),
        bodyRatios: ['xs', 'sm', 'md'].map(
          (step) => px(`--paragraph-${step}-line-height`) / px(`--paragraph-${step}-size`),
        ),
        smallLineHeights: [
          token('--paragraph-xs-line-height'),
          token('--paragraph-sm-line-height'),
        ],
        displayFont: getComputedStyle(heading).fontFamily,
        bodyFont: getComputedStyle(document.body).fontFamily,
        dataFont: getComputedStyle(primary.querySelector('button') ?? primary).fontFamily,
        letterEmission: getComputedStyle(heading).textShadow,
        primaryGlow: getComputedStyle(primary).filter,
        quietGlow: getComputedStyle(quiet).filter,
        strokeEmission: getComputedStyle(quiet, '::before').filter,
      }
    })

    expect(rendered.skin).toBe(skin)
    expect(rendered.atmosphereMarkers).toBe(0)
    expect(rendered).toMatchObject({
      cardGround: 0.7,
      emitNear: '1.5px',
      emitFar: '5px',
      glowSpread: '6px',
      borderWidth: '2px',
      bodyRatios: [1.25, 1.25, 1.25],
      smallLineHeights: ['15px', '17.5px'],
      quietGlow: 'none',
    })
    expect(rendered.dataFont).toMatch(/^"?Oxanium"?,/)
    expect(rendered.displayFont).toMatch(/^"?Rajdhani"?,/)
    expect(rendered.bodyFont).toMatch(/^"?Space Grotesk"?,/)
    // Every letter emits; only the primary action adds the 6px glow, and a
    // stroke's light is the tight 80% halo inside the wide 35% one.
    expect(rendered.letterEmission).not.toBe('none')
    expect(rendered.primaryGlow).toMatch(/^drop-shadow\(.* 0px 0px 6px\)$/)
    expect(rendered.strokeEmission).toMatch(
      /^drop-shadow\(.*0\.8\) 0px 0px 1\.5px\) drop-shadow\(.*0\.35\) 0px 0px 5px\)$/,
    )
  })
}
