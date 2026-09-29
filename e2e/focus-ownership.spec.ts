import type { Page, Route } from '@playwright/test'

import { SKINS } from '../src/design-system/skin'

import { expect, test } from './fixtures'

/**
 * REQ-010 + REQ-011 (TASK-021) — focus belongs to the control, proved in a
 * browser on the sign-in form and on Settings.
 *
 * The unit suite proves the stylesheet's rule against a DOM that cannot
 * paint; this proves what a keyboard user actually sees. Each form is walked
 * with the Tab key, and at every stop the page's *computed* style answers two
 * questions against a resting capture taken with nothing focused:
 *
 *   1. Does the focused control — or the one frame that visibly *is* the
 *      control (`.clr-check__box`, an opted-in `.clr-chamfer--focus-owner`) —
 *      change its outline geometry? A thicker chamfer border or an outline that
 *      was not there before; never a hue change on its own.
 *   2. Is every non-interactive chamfered ancestor — the Card body above all —
 *      painted exactly as it was at rest? A card that adopts the ring is the
 *      ambiguity REQ-011 removes.
 *
 * Forced colours repeat both with `Highlight` resolved by the browser, so the
 * control is proved to take the system highlight and the card to take none.
 *
 * **The network is stubbed at the browser's edge, not the app.** A focus ring
 * does not depend on what the backend says, and a real one-time code costs a
 * rate-limited email to an inbox no test can read. So GoTrue's `/otp` answers
 * 200, a seeded session stands in for the verify step, and PostgREST answers an
 * onboarded profile — against whatever build `E2E_BASE_URL` names, including
 * the deployed exact head. A build with no Supabase configuration never makes
 * a request to stub: the two steps that need a session skip, by name, and the
 * email step still runs.
 */

const UNCONFIGURED_REASON =
  'The app under test was built without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, ' +
  'so it has no auth client to stub; see e2e/README.md'

const USER_ID = '00000000-0000-4000-8000-00000000f0c5'
const NOW = '2026-09-29T00:00:00.000+00:00'

/** An onboarded profile, so the guards let Settings render. */
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

// ─────────────────────────────────────────────────────────────────────────────
// The stubbed edge
// ─────────────────────────────────────────────────────────────────────────────

interface Edge {
  /** How many requests reached the stubbed Supabase edge. */
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
    const reading = route.request().method() === 'GET'
    const profiles = url.pathname.endsWith('/rest/v1/profiles')
    return answer(route, reading && profiles ? [PROFILE] : [])
  })
  await page.route('**/functions/v1/**', (route) => answer(route, {}))

  return { hits: () => hits }
}

/** A stored session, in the shape `src/data/auth.ts` restores without a call. */
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

/** The skin `skin.js` applies at boot — the same key the Settings picker writes. */
async function useSkin(page: Page, skin: string) {
  await page.addInitScript((value) => {
    localStorage.setItem('clear.skin', value)
  }, skin)
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the rendered page
// ─────────────────────────────────────────────────────────────────────────────

/** Computed paint of one element and its chamfer layers. */
interface Frame {
  readonly outlineStyle: string
  readonly outlineWidth: number
  readonly outlineColor: string
  /** The chamfer fill's inset — the border's visible thickness. */
  readonly innerInset: number
  /** The chamfer border layer's colour. */
  readonly borderLayer: string
}

interface Stop {
  /** What was focused, for the failure message. */
  readonly focused: string
  /** How the indicator is drawn. */
  readonly kind: 'outline' | 'chamfer'
  readonly indicator: { readonly name: string; readonly visible: boolean }
  readonly focusedFrame: Frame
  readonly restingFrame: Frame
  /** Every non-owning chamfered ancestor, focused and at rest. */
  readonly ancestors: readonly {
    readonly name: string
    readonly focused: Frame
    readonly resting: Frame
  }[]
}

interface Colours {
  readonly focusRing: string
  readonly highlight: string
}

/** Waits out every running CSS transition — the chamfer's colour takes a second. */
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

/**
 * Records the resting paint of every element in `main` before anything in it
 * is focused, and moves the Tab starting point back to the top of the
 * document. Kept on the window so each Tab stop compares against it.
 */
async function captureResting(page: Page) {
  await page.evaluate(() => {
    // Blurring alone leaves the starting point where focus was — after the
    // code input the screen focused for the user. A focused, removed marker
    // at the top of the body puts it before everything instead.
    const marker = document.createElement('span')
    marker.tabIndex = -1
    document.body.prepend(marker)
    marker.focus()
    marker.remove()
  })
  await settle(page)

  await page.evaluate(() => {

    const frame = (el: Element) => {
      const own = getComputedStyle(el)
      const before = getComputedStyle(el, '::before')
      const after = getComputedStyle(el, '::after')
      return {
        outlineStyle: own.outlineStyle,
        outlineWidth: own.outlineStyle === 'none' ? 0 : parseFloat(own.outlineWidth),
        outlineColor: own.outlineColor,
        innerInset: parseFloat(before.top) || 0,
        borderLayer: after.backgroundColor,
      }
    }

    const resting = new Map<Element, ReturnType<typeof frame>>()
    for (const el of document.querySelectorAll('main *')) resting.set(el, frame(el))
    Object.assign(window, { __focusResting: resting, __focusFrame: frame })
  })
}

/** Resolves the colours a style would paint, through the page's own cascade. */
async function colours(page: Page): Promise<Colours> {
  return page.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.setProperty('forced-color-adjust', 'none')
    document.body.append(probe)
    probe.style.color = 'var(--focus-ring)'
    const focusRing = getComputedStyle(probe).color
    probe.style.color = 'Highlight'
    const highlight = getComputedStyle(probe).color
    probe.remove()
    return { focusRing, highlight }
  })
}

/** The focused element's indicator and chamfered ancestors, read now. */
async function readStop(page: Page): Promise<Stop | null> {
  return page.evaluate(() => {
    const focused = document.activeElement
    const main = document.querySelector('main')
    if (!(focused instanceof HTMLElement) || !main?.contains(focused)) return null

    const { __focusResting: resting, __focusFrame: frame } = window as unknown as {
      __focusResting: Map<Element, unknown>
      __focusFrame: (el: Element) => unknown
    }

    const describe = (el: Element) =>
      `<${el.tagName.toLowerCase()}${el.className ? ` class="${String(el.className)}"` : ''}>` +
      (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)

    // The one element whose paint *is* the control. A native checkbox is
    // drawn by its box; an opted-in frame is its control's visible border.
    const owner =
      focused.closest('.clr-chamfer--focus-owner') ??
      (focused.matches('.clr-check input')
        ? focused.parentElement?.querySelector('.clr-check__box')
        : null) ??
      focused
    const kind = owner.classList.contains('clr-chamfer') ? 'chamfer' : 'outline'
    const rect = owner.getBoundingClientRect()

    const ancestors = []
    for (let el = focused.parentElement; el !== null && el !== main.parentElement; el = el.parentElement) {
      if (el === owner || !el.classList.contains('clr-chamfer')) continue
      ancestors.push({ name: describe(el), focused: frame(el), resting: resting.get(el) })
    }

    return {
      focused: describe(focused),
      kind,
      indicator: {
        name: describe(owner),
        visible:
          rect.width > 0 && rect.height > 0 && Number(getComputedStyle(owner).opacity) > 0,
      },
      focusedFrame: frame(owner),
      restingFrame: resting.get(owner),
      ancestors,
    } as never
  })
}

/**
 * Tabs from the top of the document through every focusable control in
 * `main`, returning each stop. Stops when focus has entered `main` and left it.
 */
async function tabThroughMain(page: Page): Promise<Stop[]> {
  const stops: Stop[] = []
  let entered = false

  for (let press = 0; press < 80; press += 1) {
    await page.keyboard.press('Tab')
    // One frame, so `:focus-visible` has been matched and painted.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => resolve(null))),
    )
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

// ─────────────────────────────────────────────────────────────────────────────
// The assertions
// ─────────────────────────────────────────────────────────────────────────────

/** REQ-011 criteria 1 and 2, at one stop. */
function expectOwnedFocus(stop: Stop, { focusRing }: Colours) {
  const where = `focus on ${stop.focused}`

  expect(stop.indicator.visible, `${where}: its indicator ${stop.indicator.name} is not visible`).toBe(true)

  // Geometry, not hue: the ring either appears or thickens the border.
  if (stop.kind === 'outline') {
    expect(stop.restingFrame.outlineWidth, `${where}: outlined at rest`).toBe(0)
    expect(stop.focusedFrame.outlineStyle, `${where}: no outline`).not.toBe('none')
    expect(stop.focusedFrame.outlineWidth, `${where}: no outline width`).toBeGreaterThan(0)
  } else {
    expect(
      stop.focusedFrame.innerInset,
      `${where}: the chamfer border did not thicken`,
    ).toBeGreaterThan(stop.restingFrame.innerInset)
  }

  for (const ancestor of stop.ancestors) {
    expect(
      ancestor.focused,
      `${where}: the chamfered ancestor ${ancestor.name} changed its paint`,
    ).toEqual(ancestor.resting)
    expect(
      ancestor.focused.borderLayer,
      `${where}: the chamfered ancestor ${ancestor.name} wears the focus ring`,
    ).not.toBe(focusRing)
  }
}

/** Forced colours: the control takes `Highlight`; the ancestor takes none. */
function expectForcedOwnership(stop: Stop, { highlight }: Colours) {
  const where = `forced colours, focus on ${stop.focused}`
  const painted =
    stop.kind === 'outline' ? stop.focusedFrame.outlineColor : stop.focusedFrame.borderLayer

  expect(painted, `${where}: the indicator is not Highlight`).toBe(highlight)

  for (const ancestor of stop.ancestors) {
    expect(ancestor.focused.borderLayer, `${where}: ${ancestor.name} took Highlight`).not.toBe(
      highlight,
    )
    expect(ancestor.focused.outlineStyle, `${where}: ${ancestor.name} is outlined`).toBe('none')
  }
}

/** A walk only proves ownership if some stop sat inside a Card. */
function expectCardCoverage(stops: readonly Stop[]) {
  const inCard = stops.filter((stop) =>
    stop.ancestors.some((ancestor) => ancestor.name.includes('clr-card__body')),
  )
  expect(inCard.length, 'no Tab stop was inside a chamfered Card').toBeGreaterThan(0)
}

/**
 * Forced-colours paint is settled by the browser; the chamfer layer's colour
 * transition is not skipped for it. Waits for the focused frame to settle.
 */
async function settledStops(page: Page): Promise<Stop[]> {
  const stops: Stop[] = []
  let entered = false

  for (let press = 0; press < 80; press += 1) {
    await page.keyboard.press('Tab')
    let stop: Stop | null = null
    await expect
      .poll(async () => {
        const first = await readStop(page)
        await page.waitForTimeout(50)
        const second = await readStop(page)
        stop = second
        return JSON.stringify(first) === JSON.stringify(second)
      })
      .toBe(true)
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

// ─────────────────────────────────────────────────────────────────────────────
// Reaching each form
// ─────────────────────────────────────────────────────────────────────────────

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
  // The profile-backed card is the one with radios and checkboxes in it.
  await expect(page.getByRole('radiogroup').first()).toBeVisible()
}

// ─────────────────────────────────────────────────────────────────────────────
// The gate
// ─────────────────────────────────────────────────────────────────────────────

for (const skin of SKINS) {
  test.describe(`focus ownership, ${skin} skin`, () => {
    test.beforeEach(async ({ page }) => {
      await useSkin(page, skin)
    })

    test('the sign-in email step keeps focus on its controls', async ({ page, visit }) => {
      await stubSupabase(page)
      await visit('/login')
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin)

      await captureResting(page)
      const colour = await colours(page)
      const stops = await tabThroughMain(page)

      expect(stops.map((stop) => stop.focused).join('\n')).toMatch(/clr-input/)
      for (const stop of stops) expectOwnedFocus(stop, colour)
      expectCardCoverage(stops)
    })

    test('the one-time code input owns its focus, not the card', async ({ page, visit }) => {
      const edge = await stubSupabase(page)
      await openCodeStep(page, visit, edge)
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin)

      await captureResting(page)
      const colour = await colours(page)
      const stops = await tabThroughMain(page)

      const code = stops.find((stop) => /one-time|clr-input/.test(stop.focused))
      expect(code, 'Tab never reached the one-time code input').toBeDefined()
      for (const stop of stops) expectOwnedFocus(stop, colour)
      expectCardCoverage(stops)
    })

    test('every Settings control owns its focus, not its card', async ({ page, visit }) => {
      const edge = await stubSupabase(page)
      await openSettings(page, visit, edge)
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin)

      await captureResting(page)
      const colour = await colours(page)
      const stops = await tabThroughMain(page)

      // The walk has to have met each kind of control the form is built from.
      const seen = stops.map((stop) => stop.focused).join('\n')
      expect(seen).toMatch(/<button[^>]*clr-chamfer/) // radio chip or button
      expect(seen).toMatch(/<input/) // checkbox
      expect(seen).toMatch(/clr-input/) // text field
      for (const stop of stops) expectOwnedFocus(stop, colour)
      expectCardCoverage(stops)
    })
  })
}

/**
 * Forced colours are switched on once the screen has arrived and been scanned:
 * `axe-core` computes contrast from author colours the browser has already
 * replaced, so its verdict there is about the emulation, not the screen.
 */
async function forceColours(page: Page) {
  await page.emulateMedia({ forcedColors: 'active' })
  await expect
    .poll(() => page.evaluate(() => matchMedia('(forced-colors: active)').matches))
    .toBe(true)
}

test.describe('focus ownership under forced colours', () => {
  test('the sign-in email step takes Highlight and the card takes none', async ({
    page,
    visit,
  }) => {
    await stubSupabase(page)
    await visit('/login')
    await forceColours(page)

    await captureResting(page)
    const colour = await colours(page)
    const stops = await settledStops(page)

    expect(stops.some((stop) => /clr-input/.test(stop.focused))).toBe(true)
    for (const stop of stops) {
      expectOwnedFocus(stop, colour)
      expectForcedOwnership(stop, colour)
    }
    expectCardCoverage(stops)
  })

  test('the one-time code input takes Highlight and the card takes none', async ({
    page,
    visit,
  }) => {
    const edge = await stubSupabase(page)
    await openCodeStep(page, visit, edge)
    await forceColours(page)

    await captureResting(page)
    const colour = await colours(page)
    const stops = await settledStops(page)

    expect(stops.some((stop) => /clr-input/.test(stop.focused))).toBe(true)
    for (const stop of stops) {
      expectOwnedFocus(stop, colour)
      expectForcedOwnership(stop, colour)
    }
    expectCardCoverage(stops)
  })

  test('each Settings control takes Highlight and its card takes none', async ({
    page,
    visit,
  }) => {
    const edge = await stubSupabase(page)
    await openSettings(page, visit, edge)
    await forceColours(page)

    await captureResting(page)
    const colour = await colours(page)
    const stops = await settledStops(page)

    for (const stop of stops) {
      expectOwnedFocus(stop, colour)
      expectForcedOwnership(stop, colour)
    }
    expectCardCoverage(stops)
  })
})
