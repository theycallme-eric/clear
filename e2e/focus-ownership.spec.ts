import type { Page, Route } from '@playwright/test'

import { SKINS } from '../src/design-system/skin'

import { expect, test } from './fixtures'

/**
 * CLEAR 0.9.7 focus ownership, proved in the deployed browser:
 *
 * - one root-level bracket layer follows keyboard focus on selectable controls;
 * - text fields light their own border and never summon the bracket layer;
 * - any chamfered ancestor around a control keeps its resting paint;
 * - forced colours hand the indicator back to the operating system.
 *
 * The network is stubbed at the browser edge because focus does not depend on
 * backend data. The code and Settings steps still exercise the real app routes.
 */

const UNCONFIGURED_REASON =
  'The app under test was built without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, ' +
  'so it has no auth client to stub; see e2e/README.md'

const USER_ID = '00000000-0000-4000-8000-00000000f0c5'
const NOW = '2026-09-29T00:00:00.000+00:00'

const PROFILE = {
  id: USER_ID,
  created_at: NOW,
  updated_at: NOW,
  experience_level: 'some',
  goal_preset: 'strength',
  enabled_sections: ['warmup', 'primary_lift', 'accessory', 'cooldown'],
  weight_unit: 'kg',
  onboarded_at: NOW,
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

interface Edge {
  readonly hits: () => number
}

async function stubSupabase(page: Page): Promise<Edge> {
  let hits = 0

  const answer = async (route: Route, body: unknown) => {
    hits += 1
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS })
      return
    }
    await route.fulfill({ status: 200, headers: CORS, json: body })
  }

  await page.route('**/auth/v1/**', (route) => answer(route, {}))
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const profiles = url.pathname.endsWith('/rest/v1/profiles')
    return answer(route, route.request().method() === 'GET' && profiles ? [PROFILE] : [])
  })
  await page.route('**/functions/v1/**', (route) => answer(route, {}))

  return { hits: () => hits }
}

async function seedSession(page: Page) {
  await page.addInitScript((userId) => {
    localStorage.setItem(
      'clear.auth.session',
      JSON.stringify({
        accessToken: 'e2e-focus-ownership',
        refreshToken: 'e2e-focus-ownership',
        expiresAt: Date.now() + 60 * 60 * 1000,
        user: { id: userId, email: 'clear-e2e-focus@example.com' },
      }),
    )
  }, USER_ID)
}

async function useSkin(page: Page, skin: string) {
  await page.addInitScript((value) => localStorage.setItem('clear.skin', value), skin)
}

interface Frame {
  readonly outlineStyle: string
  readonly outlineWidth: number
  readonly outlineColor: string
  readonly borderColor: string
  readonly innerInset: number
  readonly borderLayer: string
}

interface Stop {
  readonly focused: string
  readonly kind: 'field' | 'brackets'
  readonly focusedFrame: Frame
  readonly restingFrame: Frame
  readonly bracket: {
    readonly count: number
    readonly opacity: number
    readonly width: number
    readonly height: number
  }
  readonly fieldFocusColor: string
  readonly fieldBorderChannel: 'borderColor' | 'borderLayer'
  readonly ancestors: readonly {
    readonly name: string
    readonly focused: Frame
    readonly resting: Frame
  }[]
}

async function settle(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter((animation) => animation instanceof CSSTransition)
            .filter((animation) => animation.playState === 'running').length,
      ),
    )
    .toBe(0)
}

async function captureResting(page: Page) {
  await page.evaluate(() => {
    const marker = document.createElement('span')
    marker.tabIndex = -1
    document.body.prepend(marker)
    marker.focus()
    marker.remove()
  })
  await settle(page)

  await page.evaluate(() => {
    const frame = (element: Element) => {
      const own = getComputedStyle(element)
      const before = getComputedStyle(element, '::before')
      const after = getComputedStyle(element, '::after')
      return {
        outlineStyle: own.outlineStyle,
        outlineWidth: own.outlineStyle === 'none' ? 0 : parseFloat(own.outlineWidth),
        outlineColor: own.outlineColor,
        borderColor: own.borderColor,
        innerInset: parseFloat(before.top) || 0,
        borderLayer: after.backgroundColor,
      }
    }

    const resting = new Map<Element, ReturnType<typeof frame>>()
    for (const element of document.querySelectorAll('main *')) {
      resting.set(element, frame(element))
    }
    Object.assign(window, { __focusResting: resting, __focusFrame: frame })
  })
}

async function readStop(page: Page): Promise<Stop | null> {
  return page.evaluate(() => {
    const focused = document.activeElement
    const main = document.querySelector('main')
    if (!(focused instanceof HTMLElement) || !main?.contains(focused)) return null

    const { __focusResting: resting, __focusFrame: frame } = window as unknown as {
      __focusResting: Map<Element, Frame>
      __focusFrame: (element: Element) => Frame
    }
    const describe = (element: Element) =>
      `<${element.tagName.toLowerCase()}${
        element.className ? ` class="${String(element.className)}"` : ''
      }>` + (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 40)

    const isTextField = focused.matches(
      'input:not([type="checkbox"],[type="radio"],[type="range"],[type="button"],[type="submit"],[type="reset"]),textarea,select,[contenteditable="true"]',
    )
    const owner = isTextField ? (focused.closest('.clr-field') ?? focused) : focused
    // 0.14.3 fields paint a chamfered ::after ring; 0.9.7/plain fields
    // paint a native border. Do not borrow paint from an unrelated ancestor.
    const fieldBorderChannel: Stop['fieldBorderChannel'] = owner.matches('.clr-field.clr-chamfer')
      ? 'borderLayer' : 'borderColor'
    const bracket = document.querySelector('.clr-focus-brackets')
    const bracketStyle = bracket === null ? null : getComputedStyle(bracket)
    const bracketRect = bracket?.getBoundingClientRect()

    const ancestors = []
    for (
      let element = focused.parentElement;
      element !== null && element !== main.parentElement;
      element = element.parentElement
    ) {
      if (element === owner || !element.classList.contains('clr-chamfer')) continue
      ancestors.push({
        name: describe(element),
        focused: frame(element),
        resting: resting.get(element)!,
      })
    }

    const probe = document.createElement('span')
    probe.style.border = '1px solid var(--border-field-focus)'
    document.body.append(probe)
    const fieldFocusColor = getComputedStyle(probe).borderColor
    probe.remove()

    return {
      focused: describe(focused),
      kind: isTextField ? 'field' : 'brackets',
      focusedFrame: frame(owner),
      restingFrame: resting.get(owner)!,
      bracket: {
        count: document.querySelectorAll('.clr-focus-brackets').length,
        opacity: Number(bracketStyle?.opacity ?? 0),
        width: bracketRect?.width ?? 0,
        height: bracketRect?.height ?? 0,
      },
      fieldFocusColor,
      fieldBorderChannel,
      ancestors,
    }
  })
}

async function tabThroughMain(page: Page, stable = false): Promise<Stop[]> {
  const stops: Stop[] = []
  let entered = false

  for (let press = 0; press < 80; press += 1) {
    await page.keyboard.press('Tab')
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))))
    if (stable) await settle(page)
    const stop = await readStop(page)
    if (stop === null) {
      if (entered) break
      continue
    }
    entered = true
    stops.push(stop)
  }

  expect(stops.length, 'the Tab key never reached a control in <main>').toBeGreaterThan(0)
  return stops
}

function expectNormalFocus(stop: Stop) {
  const where = `focus on ${stop.focused}`
  expect(stop.bracket.count, `${where}: the root mounted more than one bracket layer`).toBe(1)

  if (stop.kind === 'field') {
    const borderColor = stop.focusedFrame[stop.fieldBorderChannel]
    const restingBorderColor = stop.restingFrame[stop.fieldBorderChannel]
    expect(stop.bracket.opacity, `${where}: a text field summoned brackets`).toBe(0)
    expect(borderColor, `${where}: its border did not light`).toBe(
      stop.fieldFocusColor,
    )
    expect(borderColor, `${where}: its border did not change`).not.toBe(
      restingBorderColor,
    )
  } else {
    expect(stop.bracket.opacity, `${where}: brackets are hidden`).toBe(1)
    expect(stop.bracket.width, `${where}: brackets have no width`).toBeGreaterThan(0)
    expect(stop.bracket.height, `${where}: brackets have no height`).toBeGreaterThan(0)
  }

  for (const ancestor of stop.ancestors) {
    expect(
      ancestor.focused,
      `${where}: the chamfered ancestor ${ancestor.name} changed its paint`,
    ).toEqual(ancestor.resting)
  }
}

async function openCodeStep(page: Page, visit: (path: string) => Promise<void>, edge: Edge) {
  await visit('/login')
  await page.getByLabel('Email').fill('clear-e2e-focus@example.com')
  await page.getByRole('button', { name: 'Send code' }).click()

  const code = page.getByLabel('Code')
  await expect(code.or(page.getByRole('alert'))).toBeVisible()
  test.skip(edge.hits() === 0, UNCONFIGURED_REASON)
  await expect(code).toBeVisible()
}

async function openSettings(page: Page, visit: (path: string) => Promise<void>, edge: Edge) {
  await seedSession(page)
  await visit('/settings')
  test.skip(edge.hits() === 0, UNCONFIGURED_REASON)
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('radiogroup').first()).toBeVisible()
}

for (const skin of SKINS) {
  test.describe(`focus ownership, ${skin} skin`, () => {
    test.beforeEach(async ({ page }) => useSkin(page, skin))

    test('the sign-in email step follows the 0.9.7 focus contract', async ({ page, visit }) => {
      await stubSupabase(page)
      await visit('/login')
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
      await expect(page.locator('html')).toHaveAttribute('data-clr-focus', 'brackets')

      await captureResting(page)
      const stops = await tabThroughMain(page, true)

      expect(stops.some((stop) => stop.kind === 'field')).toBe(true)
      expect(stops.some((stop) => stop.kind === 'brackets')).toBe(true)
      for (const stop of stops) expectNormalFocus(stop)
      await expect(page.locator('main .clr-card')).toHaveCount(0)
      await expect(page.locator('main .clr-footer')).toHaveCount(1)
    })

    test('the one-time code step follows the 0.9.7 focus contract', async ({ page, visit }) => {
      const edge = await stubSupabase(page)
      await openCodeStep(page, visit, edge)
      await captureResting(page)
      const stops = await tabThroughMain(page, true)

      expect(stops.some((stop) => stop.kind === 'field')).toBe(true)
      for (const stop of stops) expectNormalFocus(stop)
      await expect(page.locator('main .clr-card')).toHaveCount(0)
      await expect(page.locator('main .clr-footer')).toHaveCount(1)
    })

    test('Settings follows the 0.9.7 focus contract', async ({ page, visit }) => {
      const edge = await stubSupabase(page)
      await openSettings(page, visit, edge)
      await captureResting(page)
      const stops = await tabThroughMain(page, true)

      expect(stops.some((stop) => stop.kind === 'field')).toBe(true)
      expect(stops.some((stop) => stop.kind === 'brackets')).toBe(true)
      for (const stop of stops) expectNormalFocus(stop)
      await expect(page.locator('main .clr-card')).toHaveCount(0)
      await expect(page.locator('main .clr-list')).toHaveCount(1)
    })
  })
}

test('forced colours return focus geometry to the operating system', async (
  { page, visit },
  testInfo,
) => {
  await stubSupabase(page)
  await visit('/login')
  await page.emulateMedia({ forcedColors: 'active' })
  await expect.poll(() => page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true)

  for (let press = 0; press < 20; press += 1) {
    await page.keyboard.press('Tab')
    if (
      await page.evaluate(() => {
        const main = document.querySelector('main')
        return (
          main?.contains(document.activeElement) === true &&
          document.activeElement?.matches('button') === true
        )
      })
    ) {
      break
    }
  }
  const focused = page.locator(':focus')
  await expect(focused).toBeVisible()
  const style = await focused.evaluate((element) => {
    const computed = getComputedStyle(element)
    return { outlineStyle: computed.outlineStyle, outlineWidth: parseFloat(computed.outlineWidth) }
  })
  expect(style.outlineStyle).not.toBe('none')
  expect(style.outlineWidth).toBeGreaterThan(0)
  await page.screenshot({ path: testInfo.outputPath('vibe-d-forced-colours-exception.png') })
})
