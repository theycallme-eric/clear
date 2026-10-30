import { test, expect } from './fixtures'
import { MOTION_PATTERNS } from '../src/dev/gallery-motion-patterns'

test('motion lab: replay package effects and keep timing edits local', async ({ page, visit, checkA11y }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await visit('/gallery/motion')
  const systemTiming = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--dur-base').trim())
  await page.getByRole('button', { name: 'Local timing controls' }).click()
  await page.getByRole('slider', { name: 'Duration (ms)' }).press('End')
  const lab = page.locator('[data-motion-lab]')
  await expect(lab).toHaveCSS('--dur-base', '800ms')
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--dur-base').trim())).toBe(systemTiming)
  for (const pattern of MOTION_PATTERNS) {
    const timerBefore = await page.locator('[data-motion-readout]').innerText()
    await page.getByRole('button', { name: pattern.label, exact: true }).click()
    if (pattern.id === 'tumble') {
      await expect(page.locator('[data-motion-readout]')).not.toHaveText(timerBefore)
    } else {
      const target = page.locator(pattern.id === 'boot' ? '[data-motion-rows]' : '[data-motion-subject]')
      await expect(target).toHaveClass(new RegExp(pattern.className))
    }
  }
  await page.getByRole('button', { name: 'Reset timing' }).click()
  expect(await lab.evaluate(element => element.style.getPropertyValue('--dur-base'))).toBe('')
  await expect(page.locator('[data-motion-subject]')).toHaveCSS('opacity', '1')
  await checkA11y()
})

test('motion scroll comparison: both samples work and fit four skins on narrow phones', async ({ page, visit, checkA11y }, testInfo) => {
  const accountRequests: string[] = []
  page.on('request', request => { if (/\/(auth|rest|functions)\/v1\//.test(request.url())) accountRequests.push(request.url()) })
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await visit('/gallery/motion')
    for (const skin of ['clear', 'vapour', 'signal', 'mono']) {
      await page.locator('.clr-dev-gallery__chrome').getByRole('radio', { name: skin, exact: true }).click()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await page.locator('.clr-dev-gallery__chrome').getByRole('radio', { name: 'clear', exact: true }).click()
    const slider = page.getByRole('slider', { name: 'Scroll both samples (%)' })
    await slider.press('Home')
    for (let index = 0; index < 4; index += 1) await slider.press('PageUp')
    const states = await page.locator('[data-gallery-scroll]').evaluateAll(elements => elements.map(element => {
      const scroller = element.querySelector<HTMLElement>('.clr-scroll-region__scroller')!
      return { type: element.getAttribute('data-gallery-scroll'), top: scroller.scrollTop, full: scroller.scrollHeight, height: scroller.clientHeight, mask: getComputedStyle(scroller).maskImage }
    }))
    expect(states).toHaveLength(2)
    expect(states[0]!.mask).toBe('none')
    expect(states[1]!.mask).toContain('linear-gradient')
    expect(states.every(state => state.top > 0)).toBe(true)
    expect(Math.abs(states[0]!.top - states[1]!.top)).toBeLessThanOrEqual(1)
    const panels = await page.locator('.clr-gallery-motion__scroll-stage').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().top))
    expect(Math.abs(panels[0]! - panels[1]!)).toBeLessThanOrEqual(1)
    await checkA11y()
    await testInfo.attach('scroll-comparison-' + width + '.png', { body: await page.locator('.clr-gallery-motion__scroll-pair').screenshot(), contentType: 'image/png' })
  }
  expect(accountRequests).toEqual([])
  await page.reload()
  await expect(page.getByRole('heading', { level: 2, name: 'Motion and behavior' })).toBeVisible()
})

test('motion scroll glow: survives compiled time units, can be held, and respects reduced motion', async ({ page, visit, checkA11y }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await visit('/gallery/motion')
  const pair = page.locator('.clr-gallery-motion__scroll-pair')
  await expect(pair).toHaveCSS('--dur-streak-settle', '420ms')
  const hard = page.locator('[data-gallery-scroll="hard"]')
  const top = hard.locator(':scope > .clr-scroll-region__streak').first()
  await page.getByRole('slider', { name: 'Scroll both samples (%)' }).press('PageUp')
  await expect(hard).toHaveAttribute('data-scrolling', '')
  await expect(top).toHaveCSS('opacity', '0.7')
  expect(await top.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe('none')
  await expect(hard).not.toHaveAttribute('data-scrolling')
  for (let index = 0; index < 3; index += 1) await page.getByRole('slider', { name: 'Scroll both samples (%)' }).press('PageUp')
  const hold = page.getByRole('button', { name: 'Hold glow for inspection' })
  await hold.click()
  await expect(hold).toHaveAttribute('aria-pressed', 'true')
  await expect(top).toHaveCSS('opacity', '0.7')
  await testInfo.attach('scroll-glow-held.png', { body: await pair.screenshot(), contentType: 'image/png' })
  await hold.click()
  await expect(top).toHaveCSS('opacity', '0')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await hold.click()
  await expect(top).toHaveCSS('opacity', '0.5')
  await expect(top).toHaveCSS('box-shadow', 'none')
  await checkA11y()
})

test('motion rules: interrupt state, coordinate loops and preserve reduced-motion content', async ({ page, visit, checkA11y }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await visit('/gallery/motion')
  await page.getByRole('button', { name: 'Start list arrival' }).click()
  await page.getByRole('button', { name: 'Replace with updated state' }).click()
  await expect(page.getByText('Updated 1', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Start loop example' }).click()
  const busy = page.locator('[data-motion-loop="busy"]')
  await expect(busy).toHaveAttribute('data-loop', 'run')
  await page.getByRole('button', { name: 'Introduce urgent state' }).click()
  await expect(busy).toHaveAttribute('data-loop', 'still')
  await expect(page.locator('[data-motion-loop="urgent"]')).toHaveAttribute('data-loop', 'run')
  await expect(busy).toBeVisible()
  await page.getByRole('button', { name: 'Preview reduced motion' }).click()
  expect(await page.locator('.clr-gallery-motion').evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.effect?.getTiming().iterations === Infinity).length)).toBe(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Glitch', exact: true }).click()
  await expect(page.getByText(/Glitch · reduced motion: static end state/)).toBeVisible()
  await expect(page.locator('[data-motion-subject]')).toHaveCSS('opacity', '1')
  await expect(page.getByText('Chamfered panel', { exact: true })).toBeVisible()
  await checkA11y()
})
