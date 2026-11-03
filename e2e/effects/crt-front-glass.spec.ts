/** Owner-requested front-glass correction. Uses real app surfaces and a real
 * native modal, with local synthetic data and no backend or generation calls. */
import type { Locator, Page } from '@playwright/test'

import { expect, keepPng, openGenerate, setEffects, settle, syntheticApp, test } from './crt-live/harness'

/** Hold only the glass out of the comparison. Background, Echo and UI stay fixed. */
async function expectPaintedOver(page: Page, surface: Locator) {
  await surface.scrollIntoViewIfNeeded()
  await settle(page)
  // Compare an interior patch of the actual opaque owner. Whole-element shots
  // encoded millions of unnecessary pixels and repeatedly scrolled the owner;
  // its transparent frame fringe could also give a misleading behind-glass hit.
  const clip = await surface.evaluate((node) => {
    const r = node.getBoundingClientRect()
    const left = Math.max(0, r.left + 8), right = Math.min(innerWidth, r.right - 8)
    const top = Math.max(0, r.top + 8), bottom = Math.min(innerHeight, r.bottom - 8)
    const width = Math.floor(Math.min(160, right - left))
    const height = Math.floor(Math.min(48, bottom - top))
    return { x: Math.floor((left + right - width) / 2), y: Math.floor((top + bottom - height) / 2), width, height }
  })
  expect(clip.width).toBeGreaterThan(0)
  expect(clip.height).toBeGreaterThan(0)
  const withGlass = await page.screenshot({ clip, animations: 'disabled' })
  let withoutGlass: Buffer
  try {
    await page.locator('.clr-crt-field').evaluate((field) => { field.style.visibility = 'hidden' })
    withoutGlass = await page.screenshot({ clip, animations: 'disabled' })
  } finally {
    await page.locator('.clr-crt-field').evaluate((field) => { field.style.visibility = '' })
  }
  const changed = await page.evaluate(async (images) => {
    const pixels = await Promise.all(images.map(async (base64) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = canvas.getContext('2d')!
      context.drawImage(bitmap, 0, 0)
      return context.getImageData(0, 0, bitmap.width, bitmap.height).data
    }))
    const [a, b] = pixels
    if (a.length !== b.length) throw new Error('comparison dimensions changed')
    let count = 0
    for (let index = 0; index < a.length; index += 4) {
      if (a[index] !== b[index] || a[index + 1] !== b[index + 1] || a[index + 2] !== b[index + 2]) count++
    }
    return count
  }, [withGlass.toString('base64'), withoutGlass.toString('base64')])
  expect(changed, 'the actual surface is visibly painted through the front glass').toBeGreaterThan(0)
}

for (const width of [390, 1280]) {
  test(`one front glass covers opaque cards and CTA without taking input at ${width}px`, async ({ page, crtOrigin, checkA11y }, info) => {
    await page.setViewportSize({ width, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const app = await syntheticApp(page, crtOrigin, { skin: 'signal', effects: 'on' })
    await openGenerate(page)
    const field = page.locator('.clr-crt-field')
    await expect(field).toHaveCount(1)
    await expect(field).toBeVisible()
    await expect.poll(() => field.evaluate((node) => node.matches(':popover-open'))).toBe(true)
    await expect(field).toHaveAttribute('aria-hidden', 'true')
    expect(await field.evaluate((node) => getComputedStyle(node).pointerEvents)).toBe('none')

    // Make the existing Card and CTA opaque in this proof: glass painted behind
    // a translucent card could otherwise give a misleading positive result.
    const opaqueProof = await page.addStyleTag({ content: '.clr-card__body, button.clr-btn { --surface: var(--base) !important; }' })
    const card = page.locator('.clr-card').first()
    await expectPaintedOver(page, card.locator('.clr-card__body').first())
    const anchor = page.getByRole('group', { name: 'Anchor' }).getByRole('button').first()
    await anchor.tap()
    await expect(anchor).toHaveAttribute('aria-pressed', 'true')
    const cta = page.getByRole('button', { name: /generate workout/i })
    await expect(cta).toBeEnabled()
    await expectPaintedOver(page, cta)
    await opaqueProof.evaluate((node) => (node as Element).remove())
    await checkA11y()
    await keepPng(info, `front-glass-generate-${width}.png`, await page.screenshot())
    app.assertReadOnly()
  })

  // Keep the existing modal lifecycle checks in their own standard 30s case;
  // independent screen checks do not share a timing budget or mutable state.
  test(`one front glass covers native modal lifecycle without taking input at ${width}px`, async ({ page, crtOrigin, checkA11y }, info) => {
    await page.setViewportSize({ width, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const app = await syntheticApp(page, crtOrigin, { skin: 'signal', effects: 'on' })
    await openGenerate(page)
    const field = page.locator('.clr-crt-field')
    await expect(field).toHaveCount(1)
    await page.goto('/settings/locations')
    const trigger = page.getByRole('button', { name: /^delete$/i }).last()
    await trigger.tap()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    expect(await dialog.evaluate((node) => node.matches(':modal'))).toBe(true)
    await expect(field).toHaveCount(1)
    await expectPaintedOver(page, dialog.locator('.clr-chamfer').first())
    await checkA11y()
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true)
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true)
    await keepPng(info, `front-glass-dialog-${width}.png`, await page.screenshot())
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()

    // Reopening a modal must put the same glass above it again. Its safe
    // action remains tappable, including after an effects off/on transition.
    await trigger.tap()
    await expect(dialog).toBeVisible()
    await setEffects(page, 'off')
    await expect(field).toHaveCount(0)
    await setEffects(page, 'on')
    await expect(field).toHaveCount(1)
    await expectPaintedOver(page, dialog.locator('.clr-chamfer').first())
    await dialog.getByRole('button').first().tap()
    await expect(dialog).toBeHidden()
    app.assertReadOnly()
  })
}
