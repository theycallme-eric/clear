import type { Page } from '@playwright/test'

import { namespaceId } from '../scripts/e2e/namespace.mjs'
import { expect, test } from './fixtures'
import { backend } from './support/backend'

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
  // Welcome holds its one entry in its card (U13), so the pinned-footer
  // subject is the email step of the code flow.
  await visit('/login')

  const region = page.locator('.clr-scroll-region')
  const scroller = region.locator('.clr-scroll-region__scroller')
  const streak = region.locator('.clr-scroll-region__streak--bottom')
  const bar = region.locator('.clr-scroll-region__bar')
  const foot = region.locator('.clr-scroll-region__foot')
  const lastAction = page.getByRole('button', { name: 'Send code' })

  await expect(region).toHaveAttribute('data-measured', '')
  await expect(lastAction).toBeVisible()
  await expect(scroller.getByRole('button')).toHaveCount(0)
  await expect(foot.getByRole('button')).toHaveText(['Send code'])
  const initialHeight = await scroller.evaluate((element) => element.clientHeight)

  // A real reduced viewport must still overflow in the one owner without
  // putting the actions below it.
  await page.setViewportSize({ width: 390, height: 280 })
  await expect.poll(() => scroller.evaluate((element) => element.clientHeight))
    .toBeLessThan(initialHeight)
  expect(await scroller.evaluate((element) => element.scrollHeight)).toBeGreaterThan(
    await scroller.evaluate((element) => element.clientHeight),
  )

  const before = await foot.boundingBox()
  const reached = await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    element.dispatchEvent(new Event('scroll'))
    return element.scrollTop
  })
  expect(reached).toBeGreaterThan(0)
  await expect(bar).toHaveCSS('width', '2px')
  const after = await foot.boundingBox()
  expect(before).not.toBeNull()
  expect(after).not.toBeNull()
  expect(after?.y).toBeCloseTo(before?.y ?? 0, 0)
  expect(after?.height).toBeCloseTo(before?.height ?? 0, 0)

  // A very short footer can clip its own contents. Native keyboard traversal
  // must reveal the last action inside that clip as well as inside the window.
  await page.getByLabel('Email').focus()
  await page.keyboard.press('Tab')
  await expect(lastAction).toBeFocused()
  const geometry = await lastAction.evaluate((element) => {
    const region = element.closest('.clr-scroll-region')
    const foot = element.closest('.clr-scroll-region__foot')
    const scroller = region?.querySelector('.clr-scroll-region__scroller')
    if (!region || !foot || !scroller) throw new Error('the pinned footer is missing')
    const rect = element.getBoundingClientRect()
    const footRect = foot.getBoundingClientRect()
    return {
      insideViewport: rect.top >= 0 && rect.bottom <= window.innerHeight,
      insideFooter: rect.top >= footRect.top && rect.bottom <= footRect.bottom,
      measuredFoot: parseFloat(getComputedStyle(region).getPropertyValue('--foot-h')),
      footHeight: footRect.height,
      scrollerBottom: scroller.getBoundingClientRect().bottom,
      footTop: footRect.top,
      bodyTop: document.scrollingElement?.scrollTop ?? -1,
      bodyHeight: document.scrollingElement?.scrollHeight ?? -1,
      bodyClientHeight: document.scrollingElement?.clientHeight ?? -1,
    }
  })
  expect(geometry.insideViewport).toBe(true)
  expect(geometry.insideFooter).toBe(true)
  expect(geometry.measuredFoot).toBeCloseTo(geometry.footHeight, 0)
  expect(geometry.scrollerBottom).toBeLessThanOrEqual(geometry.footTop + 1)
  expect(geometry.bodyTop).toBe(0)
  expect(geometry.bodyHeight).toBe(geometry.bodyClientHeight)

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

  await page.getByRole('button', { name: 'Get started' }).click()
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

// ── REQ-001 / TASK-001 — the shared phone shell, measured ──────────────────
//
// U01 rules, U02 fixed chrome, U03 equal actions and U04 action frames, on the
// established 390x844 phone with touch, keyboard, installed-PWA and background
// cases. Signed-in screens hold a real session for a disposable namespaced
// athlete whose workouts are persisted fixtures, never a model response.
// Checkbox interaction is U09's own check (settings-locations.spec.ts).

const PHONE = { width: 390, height: 844 } as const
/** The phone widths the shell supports. Desktop and tablet gating is future scope. */
const PHONE_WIDTHS = [PHONE, { width: 320, height: 568 }, { width: 430, height: 932 }] as const
const SESSION_KEY = 'clear.auth.session'

type Answer = { ok: boolean; status: number; body: unknown }

/** Never put an admin response body, token or address into an assertion. */
function must<T>(answer: Answer, operation: string): T {
  expect(answer.ok, `${operation}: HTTP status ${answer.status}`).toBe(true)
  return answer.body as T
}

/**
 * A confirmed athlete holding a real session in this page. Onboarded athletes
 * also own two completed two-section workouts, so Home lists recent rows and
 * either one can be restarted into Review.
 */
async function provisionAthlete(page: Page, label: string, onboarded: boolean) {
  const client = backend.client()
  const email = `clear-e2e-${namespaceId()}-${label}@example.com`
  const prior = await client.findUserByEmail(email)
  if (prior) await client.deleteUser(prior.id)
  const created = await client.ensureConfirmedUser(email)
  const cleanup = () => client.deleteUser(created.id)
  const completed: string[] = []

  try {
    const session = await client.mintSession(email)
    const token = session.accessToken
    if (onboarded) {
      const catalog = must<Array<{ id: string; default_equipment: string }>>(
        await client.selectAsService('exercise_definitions', {
          select: 'id,default_equipment', default_equipment: 'neq.bodyweight', order: 'id.asc', limit: '1',
        }),
        'Fixture catalog read',
      )
      expect(catalog).toHaveLength(1)
      const [exercise] = catalog
      must(await client.rpcAs('complete_onboarding', {
        p_location_name: 'REQ-001 shell gym', p_location_tier: 'full',
        p_equipment: [...new Set(['bodyweight', 'dumbbells', exercise.default_equipment])],
        p_experience_level: 'some', p_goal_preset: 'balanced',
        p_sections: ['warmup', 'primary_lift', 'cooldown'], p_avoid_patterns: [], p_note: null,
      }, token), 'Fixture onboarding')

      const block = (role: string) => ({
        structure_type: 'standard', rounds: null, timer_type: 'none', timer_seconds: null,
        round_rest_seconds: null, rep_scheme: 'fixed', block_notes: null,
        exercises: [{
          exercise_id: exercise.id, equipment: exercise.default_equipment, session_function: role,
          anchor_relationship: 'neutral', modality: 'reps', sets: 2, target_kind: 'fixed', target_value: 8,
          target_min: null, target_max: null, target_sequence: null, per_side: false, distance_unit: null,
          rest_seconds: 10, tempo: null, load_type: 'none', load_value: null, is_interval_exercise: false,
        }],
      })
      for (const daysAgo of [1, 2]) {
        const date = new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10)
        const stored = must<{ session: { id: string } }>(await client.rpcAs('persist_session', {
          p_user_id: created.id,
          p_session: {
            date, location_id: null, session_focus: 'full_body', goal_preset: 'balanced',
            requested_duration_mins: 30, effective_duration_target_mins: 30, computed_duration_mins: null,
            requested_intensity: 5, effective_intensity: 5, adjustment_reason: null, generation_notes: null,
            prompt_version: 'e2e', contract_version: '4.1.0',
            workout: {
              title: `REQ-001 shell fixture ${daysAgo}`,
              overview: 'Persisted fixture; not a model response.',
              estimated_duration_mins: 30,
              sections: [
                { section_type: 'primary_lift', section_title: 'Main', section_notes: null, blocks: [block('primary')] },
                { section_type: 'accessory', section_title: 'Second', section_notes: null, blocks: [block('accessory')] },
              ],
            },
          },
        }, token), 'Fixture persistence')
        must(await client.rpcAs('start_session', { p_session_id: stored.session.id }, token), 'Fixture start')
        must(await client.rpcAs('complete_session', {
          p_session_id: stored.session.id, p_actual_duration_mins: 30,
        }, token), 'Fixture completion')
        completed.push(stored.session.id)
      }
    }

    await page.addInitScript(({ key, value }) => {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value)
    }, {
      key: SESSION_KEY,
      value: JSON.stringify({
        accessToken: token, refreshToken: session.refreshToken,
        expiresAt: Date.now() + 60 * 60 * 1000, user: { id: created.id, email },
      }),
    })
  } catch (error) {
    await cleanup().catch(() => undefined)
    throw error
  }

  return { completed, cleanup }
}

/**
 * U04 — every full-width action's frame (the bleed wrapper that draws the
 * outline), surface (the button), label and hit area. An action is full width
 * when its frame spans the content box of its card, footer or page. Returns
 * one line per mismatch and how many actions were measured.
 */
async function actionMismatches(page: Page, where: string) {
  const frames = page.locator('main .clr-bleed:has(> button.clr-btn)')
  const failures: string[] = []
  let measured = 0

  for (let index = 0; index < (await frames.count()); index += 1) {
    const frame = frames.nth(index)
    if (!(await frame.isVisible())) continue
    await frame.evaluate((element) => element.scrollIntoView({ block: 'center' }))
    const result = await frame.evaluate((bleed) => {
      const button = bleed.querySelector<HTMLElement>(':scope > button.clr-btn')
      const reference = bleed.closest<HTMLElement>('.clr-card__body, .clr-footer, .clr-screen__content')
      if (!button || !reference) return null
      const style = getComputedStyle(reference)
      const available =
        reference.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const outer = bleed.getBoundingClientRect()
      if (outer.width < available - 1) return null

      const surface = button.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(button)
      const label = range.getBoundingClientRect()
      // Inside the chamfer: the cut corner is not part of the frame either.
      const inset = 3
      const samples = [
        [outer.left + inset, outer.top + inset],
        [outer.right - inset, outer.top + inset],
        [outer.left + inset, outer.bottom - inset],
        [outer.right - inset, outer.top + outer.height / 2],
        [outer.left + outer.width / 2, outer.top + outer.height / 2],
      ]
      const missed = samples.filter(([x, y]) => {
        const hit = document.elementFromPoint(x, y)
        return hit === null || !button.contains(hit)
      }).length
      const round = (value: number) => Math.round(value * 100) / 100

      return {
        name: (button.getAttribute('aria-label') ?? button.textContent ?? '').trim(),
        edges: [
          surface.left - outer.left,
          outer.right - surface.right,
          surface.top - outer.top,
          outer.bottom - surface.bottom,
        ].map(round),
        label: [
          (label.left + label.right) / 2 - (outer.left + outer.right) / 2,
          (label.top + label.bottom) / 2 - (outer.top + outer.bottom) / 2,
        ].map(round),
        missed,
        samples: samples.length,
      }
    })
    if (result === null) continue
    measured += 1
    const [left, right, top, bottom] = result.edges
    const [labelX, labelY] = result.label
    if ([left, right, top, bottom].some((edge) => Math.abs(edge) > 0.5)) {
      failures.push(`${where} · ${result.name}: surface sits inside its frame by l${left} r${right} t${top} b${bottom}`)
    }
    if (Math.abs(labelX) > 1 || Math.abs(labelY) > 1) {
      failures.push(`${where} · ${result.name}: label is off the frame's centre by x${labelX} y${labelY}`)
    }
    if (result.missed > 0) {
      failures.push(`${where} · ${result.name}: ${result.missed} of ${result.samples} frame points miss the button`)
    }
  }

  return { failures, measured }
}

/**
 * U01 — page, header, tab-band and pinned-action rules span the viewport;
 * card-internal row rules span the card's inner width with row text inset.
 */
async function ruleMismatches(page: Page, where: string) {
  return page.evaluate((label) => {
    const failures: string[] = []
    const viewport = document.documentElement.clientWidth
    const root = getComputedStyle(document.documentElement)
    const border = parseFloat(root.getPropertyValue('--border-width'))
    const inset = parseFloat(root.getPropertyValue('--spacing-300'))
    const off = (a: number, b: number) => Math.abs(a - b) > 0.5
    const counted = { header: 0, foot: 0, bands: 0, rows: 0 }

    const spansViewport = (element: Element, name: string, width: number) => {
      const box = element.getBoundingClientRect()
      if (!(width > 0)) failures.push(`${label} · ${name} draws no rule`)
      if (off(box.left, 0) || off(box.right, viewport)) {
        failures.push(`${label} · ${name} rule spans ${box.left}–${box.right} of ${viewport}`)
      }
    }

    const header = document.querySelector('.clr-shell__content > header')
    if (header) {
      counted.header += 1
      spansViewport(header, 'header', parseFloat(getComputedStyle(header).borderBottomWidth))
    }
    const foot = document.querySelector('main .clr-scroll-region__foot')
    if (foot) {
      counted.foot += 1
      spansViewport(foot, 'pinned actions', parseFloat(getComputedStyle(foot).borderTopWidth))
    }
    for (const band of document.querySelectorAll('main .clr-band')) {
      if (band.getBoundingClientRect().width === 0) continue
      counted.bands += 1
      spansViewport(band, 'tab band', parseFloat(getComputedStyle(band).boxShadow.match(/(-?[\d.]+)px/g)?.[1] ?? '0'))
    }
    for (const row of document.querySelectorAll<HTMLElement>('main .clr-list__row + .clr-list__row')) {
      const box = row.getBoundingClientRect()
      if (box.width === 0) continue
      counted.rows += 1
      const list = row.parentElement
      const card = list?.classList.contains('clr-chamfer') ? list : row.closest('.clr-card__body')
      if (!card) {
        failures.push(`${label} · a list row rule sits outside any card`)
        continue
      }
      const frame = card.getBoundingClientRect()
      const rule = getComputedStyle(row, '::before')
      const ruleLeft = box.left + parseFloat(rule.left)
      const ruleRight = box.right - parseFloat(rule.right)
      if (off(ruleLeft, frame.left + border) || off(ruleRight, frame.right - border)) {
        failures.push(
          `${label} · row rule spans ${ruleLeft}–${ruleRight}, card inner width is ${frame.left + border}–${frame.right - border}`,
        )
      }
      // Inset text: a row's text sits one row inset inside the card's own text.
      const textLeft = box.left + parseFloat(getComputedStyle(row).paddingLeft)
      const cardText = card === list ? frame.left : frame.left + parseFloat(getComputedStyle(card).paddingLeft)
      if (off(textLeft, cardText + inset)) {
        failures.push(`${label} · row text starts at ${textLeft}, expected ${cardText + inset}`)
      }
    }

    return { failures, counted }
  }, where)
}

/**
 * U02 — the header and pinned actions stay put at both scroll ends; only the
 * screen's ScrollRegion scrolls; content ends inside it, never under chrome.
 */
async function chromeMismatches(page: Page, where: string) {
  return page.evaluate((label) => {
    const failures: string[] = []
    const scroller = document.querySelector<HTMLElement>('main .clr-scroll-region__scroller')
    if (!scroller) return [`${label} · the screen has no ScrollRegion`]
    const header = document.querySelector('.clr-shell__content > header')
    const foot = document.querySelector('main .clr-scroll-region__foot')
    const content = scroller.querySelector('.clr-screen__content')
    const boxes = () => ({
      header: header?.getBoundingClientRect() ?? null,
      foot: foot?.getBoundingClientRect() ?? null,
      scroller: scroller.getBoundingClientRect(),
    })

    const scrollTo = (top: number) => {
      scroller.scrollTop = top
      scroller.dispatchEvent(new Event('scroll'))
    }
    scrollTo(0)
    const atTop = boxes()
    scrollTo(scroller.scrollHeight)
    const atEnd = boxes()
    const end = content?.getBoundingClientRect()
    scrollTo(0)

    for (const layer of ['header', 'foot'] as const) {
      const before = atTop[layer]
      const after = atEnd[layer]
      if (!before || !after) continue
      if (Math.abs(before.top - after.top) > 0.5 || Math.abs(before.height - after.height) > 0.5) {
        failures.push(`${label} · the ${layer} moved while the content scrolled`)
      }
    }
    if (atTop.header && atTop.scroller.top < atTop.header.bottom - 0.5) {
      failures.push(`${label} · the content region starts under the header`)
    }
    if (atTop.foot) {
      if (atTop.scroller.bottom > atTop.foot.top + 0.5) {
        failures.push(`${label} · the content region runs under the pinned actions`)
      }
      if (atTop.foot.bottom > window.innerHeight + 0.5) {
        failures.push(`${label} · the pinned actions end below the viewport`)
      }
    }
    if (end && end.bottom > atEnd.scroller.bottom + 1) {
      failures.push(`${label} · the end of the content cannot be scrolled into view`)
    }

    const owners = [...document.querySelectorAll<HTMLElement>('body *')].filter((element) => {
      const style = getComputedStyle(element)
      return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1
    })
    if (owners.some((owner) => owner !== scroller)) {
      failures.push(`${label} · a second region scrolls: ${owners.filter((o) => o !== scroller).map((o) => o.className).join(', ')}`)
    }
    const documentScroll = document.scrollingElement
    if (documentScroll && (documentScroll.scrollTop !== 0 || documentScroll.scrollHeight > documentScroll.clientHeight)) {
      failures.push(`${label} · the document itself scrolls`)
    }
    return failures
  }, where)
}

/** U03 — heights of equivalent actions, read from their frames. */
async function heightsOf(page: Page, names: ReadonlyArray<string | RegExp>) {
  return Promise.all(
    names.map(async (name) => {
      const box = await page
        .locator('main .clr-footer .clr-bleed')
        .filter({ has: page.getByRole('button', { name, exact: typeof name === 'string' }) })
        .boundingBox()
      expect(box, `${String(name)} is rendered`).not.toBeNull()
      return box?.height ?? 0
    }),
  )
}

/** Tap a full-width action at the far right of its frame, where U04 lost the hit. */
async function tapFrameEdge(page: Page, name: string) {
  const frame = page.locator('main .clr-bleed').filter({
    has: page.getByRole('button', { name, exact: true }),
  })
  const box = await frame.boundingBox()
  expect(box, `${name} is rendered`).not.toBeNull()
  if (box) await page.touchscreen.tap(box.x + box.width - 6, box.y + box.height / 3)
}

/**
 * The installed app, as a home-screen launch has it: the manifest's standalone
 * display at the full phone viewport, with no browser toolbar. Headless
 * Chromium cannot emulate the display-mode feature, and neither the app nor
 * the package branches on it, so standalone is reported to scripts.
 */
async function launchInstalled(page: Page) {
  const manifest = await page.request.get('/manifest.webmanifest')
  expect(((await manifest.json()) as { display?: string }).display).toBe('standalone')
  await page.addInitScript(() => {
    const native = window.matchMedia.bind(window)
    window.matchMedia = (query: string) =>
      native(/display-mode:\s*standalone/.test(query) ? 'all' : query)
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true })
  })
}

/** Send the installed app to the background and bring it back. */
async function backgroundAndReturn(page: Page) {
  for (const state of ['hidden', 'visible'] as const) {
    await page.evaluate((visibility) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => visibility === 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event(visibility === 'hidden' ? 'blur' : 'focus'))
    }, state)
  }
}

test.describe('REQ-001 phone shell — entry screens', () => {
  test('Welcome and OTP keep full-width rules, fixed chrome and coinciding action frames', async ({
    page,
    visit,
  }) => {
    await page.setViewportSize(PHONE)
    const frames: string[] = []
    const rules: string[] = []
    const chrome: string[] = []

    for (const [where, path] of [['Welcome', '/welcome'], ['OTP', '/login'], ['OTP create', '/login?mode=create']] as const) {
      await visit(path)
      for (const viewport of PHONE_WIDTHS) {
        await page.setViewportSize(viewport)
        const { failures, measured } = await actionMismatches(page, `${where} ${viewport.width}px`)
        expect(measured, `${where} has a full-width action`).toBeGreaterThan(0)
        frames.push(...failures)
      }
      await page.setViewportSize(PHONE)
      const measuredRules = await ruleMismatches(page, where)
      // U13: Welcome's one entry is inside its centred card, not pinned.
      expect(measuredRules.counted.foot, `${where} pins its actions`).toBe(where === 'Welcome' ? 0 : 1)
      rules.push(...measuredRules.failures)
      chrome.push(...(await chromeMismatches(page, where)))
    }

    expect.soft(frames, 'U04 — surface, frame, label and hit area coincide').toEqual([])
    expect.soft(rules, 'U01 — page and pinned rules span the viewport').toEqual([])
    expect.soft(chrome, 'U02 — fixed chrome, one scroll owner').toEqual([])
  })

  test('an open keyboard leaves the focused field and the pinned action reachable', async ({
    page,
    visit,
  }) => {
    await page.setViewportSize(PHONE)
    await visit('/login?mode=create')
    const email = page.getByLabel('Email')
    await email.focus()
    await page.keyboard.type('athlete')

    // The on-screen keypad takes the lower part of the visual viewport.
    await page.setViewportSize({ width: PHONE.width, height: 480 })
    await email.scrollIntoViewIfNeeded()
    const geometry = await page.evaluate(() => {
      const field = document.activeElement
      const scroller = document.querySelector('main .clr-scroll-region__scroller')
      const action = [...document.querySelectorAll('main .clr-footer button')].find(
        (button) => button.textContent?.trim() === 'Send code',
      )
      if (!field || !scroller || !action) throw new Error('the field, region or action is missing')
      const fieldBox = field.getBoundingClientRect()
      const region = scroller.getBoundingClientRect()
      const actionBox = action.getBoundingClientRect()
      return {
        fieldInsideRegion: fieldBox.top >= region.top - 0.5 && fieldBox.bottom <= region.bottom + 0.5,
        actionInsideViewport: actionBox.top >= 0 && actionBox.bottom <= window.innerHeight,
        documentScroll: document.scrollingElement?.scrollTop ?? -1,
      }
    })
    expect(geometry).toEqual({ fieldInsideRegion: true, actionInsideViewport: true, documentScroll: 0 })
    await expect(email).toBeFocused()
    expect(await chromeMismatches(page, 'OTP with keyboard')).toEqual([])
  })
})

test.describe('REQ-001 phone shell — signed-in screens', () => {
  test.skip(!backend.available, backend.reason)
  // Fixture dates are UTC days; the browser's "today" must be the same day.
  test.use({ timezoneId: 'UTC' })

  test('Home, Review, Workout and Summary: action frames, rules and chrome, by touch, keyboard and as an installed app', async ({
    page,
    visit,
  }, testInfo) => {
    test.setTimeout(240_000)
    const athlete = await provisionAthlete(page, `${testInfo.project.name}-req001-shell`, true)
    const frames: string[] = []
    const rules: string[] = []
    const chrome: string[] = []
    const heights: Record<string, number[]> = {}

    const measure = async (where: string) => {
      for (const viewport of PHONE_WIDTHS) {
        await page.setViewportSize(viewport)
        const { failures, measured } = await actionMismatches(page, `${where} ${viewport.width}px`)
        expect(measured, `${where} has a full-width action`).toBeGreaterThan(0)
        frames.push(...failures)
      }
      await page.setViewportSize(PHONE)
      const measuredRules = await ruleMismatches(page, where)
      expect(measuredRules.counted.foot, `${where} pins its actions`).toBe(1)
      expect(measuredRules.counted.header, `${where} has its header`).toBe(1)
      rules.push(...measuredRules.failures)
      chrome.push(...(await chromeMismatches(page, where)))
      return measuredRules.counted
    }

    try {
      await page.setViewportSize(PHONE)
      await launchInstalled(page)

      // ── Home: tall content, a tab band and a two-row recent list ─────────
      await visit('/')
      expect(await page.evaluate(() => matchMedia('(display-mode: standalone)').matches)).toBe(true)
      await expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeVisible()
      await expect(page.locator('main .clr-list__row').nth(1)).toBeVisible({ timeout: 30_000 })
      // The rest-day card's full-width action: one of U04's reported instances.
      await expect(page.getByRole('button', { name: 'Mark Rest Day', exact: true })).toBeVisible({
        timeout: 30_000,
      })
      const home = await measure('Home')
      expect(home.bands, 'Home has its tab band').toBe(1)
      expect(home.rows, 'Home has a rule between list rows').toBeGreaterThan(0)

      // ── Review ─────────────────────────────────────────────────────────
      await visit(`/history/${athlete.completed[0]}`)
      await page.getByRole('button', { name: 'Restart', exact: true }).click()
      const start = page.getByRole('button', { name: 'Start workout', exact: true })
      await expect(start).toBeEnabled({ timeout: 30_000 })
      await measure('Review')
      heights.Review = await heightsOf(page, ['Regenerate', 'Start workout'])

      // Touch: the frame's far edge is part of the action.
      await tapFrameEdge(page, 'Start workout')
      const next = page.getByRole('button', { name: 'Next section', exact: true })
      await expect(next).toBeVisible({ timeout: 30_000 })

      // ── Workout: first section, previous held ──────────────────────────
      await measure('Workout')
      heights['Workout first section'] = await heightsOf(page, ['Previous', 'Next section'])

      // The installed app goes to the background mid-session and returns.
      await backgroundAndReturn(page)
      chrome.push(...(await chromeMismatches(page, 'Workout after background')))

      await tapFrameEdge(page, 'Next section')
      const finish = page.getByRole('button', { name: 'Finish workout', exact: true })
      await expect(finish).toBeVisible()
      heights['Workout last section'] = await heightsOf(page, ['Previous', 'Finish workout'])

      // Keyboard: back and forward again, then the focused action is measured.
      const previous = page.getByRole('button', { name: 'Previous', exact: true })
      await previous.focus()
      await page.keyboard.press('Enter')
      await expect(next).toBeVisible()
      await next.focus()
      await page.keyboard.press('Enter')
      await expect(finish).toBeVisible()
      await previous.focus()
      await page.keyboard.press('Tab')
      await expect(finish).toBeFocused()
      frames.push(...(await actionMismatches(page, 'Workout keyboard focus')).failures)
      await page.keyboard.press('Enter')

      // ── Summary ───────────────────────────────────────────────────────
      const save = page.getByRole('button', { name: 'Save and close', exact: true })
      await expect(save).toBeVisible({ timeout: 30_000 })
      await measure('Summary')

      // Installed navigation back Home by touch keeps the same chrome.
      await tapFrameEdge(page, 'Save and close')
      await expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeVisible({
        timeout: 30_000,
      })
      chrome.push(...(await chromeMismatches(page, 'Home after installed navigation')))
    } finally {
      await athlete.cleanup()
    }

    expect.soft(frames, 'U04 — surface, frame, label and hit area coincide').toEqual([])
    expect.soft(rules, 'U01 — viewport-width page rules, card-width row rules').toEqual([])
    expect.soft(chrome, 'U02 — fixed chrome, one scroll owner').toEqual([])
    for (const [where, measured] of Object.entries(heights)) {
      expect.soft(new Set(measured).size, `U03 — ${where} actions share one height: ${measured.join(', ')}`).toBe(1)
    }
  })

  test('the other captured phone routes keep full-width rules and one scroll owner', async ({
    page,
    visit,
  }, testInfo) => {
    test.setTimeout(120_000)
    await page.setViewportSize(PHONE)
    const athlete = await provisionAthlete(page, `${testInfo.project.name}-req001-routes`, true)
    const rules: string[] = []
    const chrome: string[] = []

    try {
      const routes = [
        ['Generate', '/generate', 'generate'],
        ['History', '/history', 'history'],
        ['Workout detail', `/history/${athlete.completed[0]}`, 'history'],
        ['Settings', '/settings', 'settings'],
        ['Places', '/settings/locations', 'places'],
      ] as const

      for (const [where, path, ready] of routes) {
        await visit(path)
        if (ready === 'generate') {
          await expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeVisible()
        } else if (ready === 'history') {
          await expect(page.getByText('REQ-001 shell fixture 1', { exact: true }).first()).toBeVisible()
        } else {
          await expect(page.getByRole('heading', {
            name: ready === 'settings' ? 'Training' : 'REQ-001 shell gym', exact: true,
          })).toBeVisible()
        }
        const measured = await ruleMismatches(page, where)
        expect(measured.counted.header, `${where} has its fixed header`).toBe(1)
        rules.push(...measured.failures)
        chrome.push(...(await chromeMismatches(page, where)))
      }
    } finally {
      await athlete.cleanup()
    }

    expect(rules, 'U01 — the remaining captured routes use the shared full-width rules').toEqual([])
    expect(chrome, 'U02 — only the intended content region scrolls').toEqual([])
  })

  test('OTP and onboarding render equivalent actions at one height in every state', async ({
    page,
    visit,
  }, testInfo) => {
    test.setTimeout(120_000)
    await page.setViewportSize(PHONE)
    const heights: Record<string, number[]> = {}

    // ── OTP: delivery is answered locally; the request is still made ─────
    await page.route('**/auth/v1/otp', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    )
    await visit('/login')
    await page.getByLabel('Email').fill(`clear-e2e-${namespaceId()}-${testInfo.project.name}-req001-otp@example.com`)
    await page.getByRole('button', { name: 'Send code', exact: true }).click()
    await expect(page.getByLabel('Code')).toBeFocused()
    // Resend counts its cooldown down in its own label.
    const resend = page.getByRole('button', { name: /^resend/i })
    await expect(resend).toBeDisabled()
    heights['OTP cooling down'] = await heightsOf(page, ['Verify', /^resend/i])

    // ── Onboarding: held, answered, and stepping back ──────────────────
    const athlete = await provisionAthlete(page, `${testInfo.project.name}-req001-onboarding`, false)
    try {
      await visit('/onboarding')
      const next = page.getByRole('button', { name: 'Next', exact: true })
      await expect(next).toBeDisabled()
      await page.getByRole('radio', { name: 'Home gym' }).click()
      await expect(next).toBeEnabled()
      await next.click()
      await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible()
      heights['Onboarding held'] = await heightsOf(page, ['Next', 'Back'])
      await page.locator('main [role="radio"]').first().click()
      await expect(next).toBeEnabled()
      heights['Onboarding answered'] = await heightsOf(page, ['Next', 'Back'])
      expect(await chromeMismatches(page, 'Onboarding')).toEqual([])
      expect((await ruleMismatches(page, 'Onboarding')).failures).toEqual([])
    } finally {
      await athlete.cleanup()
    }

    for (const [where, measured] of Object.entries(heights)) {
      expect.soft(new Set(measured).size, `U03 — ${where} actions share one height: ${measured.join(', ')}`).toBe(1)
    }
  })
})
