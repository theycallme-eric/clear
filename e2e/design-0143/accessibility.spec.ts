import { createHash, randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'

import { namespaceId } from '../../scripts/e2e/namespace.mjs'
import { expect, test as base } from '../fixtures'
import { backend } from '../support/backend'
import { installDeterministicCapture } from './fixtures'
import { CAPTURE_SKINS, VIEWPORT_OF_PROJECT, isProtectedPath, type CaptureSkin } from './state-inventory'

/**
 * REQ-004/006/008/010/011/012/013/029 / TASK-026 — integrated accessibility,
 * focus, forced colours, reduced motion and viewport proof on the routes a
 * signed-in athlete actually reaches.
 *
 * The signed-out shell is already held by `contained-shell.spec.ts`,
 * `focus-ownership.spec.ts` and `reduced-motion.spec.ts`. This lane walks every
 * required route behind its real guard with a genuine session for a disposable
 * namespaced user: the protected routes are reached and named by heading, never
 * inferred from a Welcome redirect. Workouts are persisted through the real
 * `persist_session` RPC and every model POST is aborted in the browser, so
 * nothing here is live generation.
 *
 * Each project is one of REQ-029's viewports (phone 390x844, touch tablet
 * 768x1024, desktop); the phone project also proves the 390x320 short phone.
 */

const SKIN_KEY = 'clear.skin'
const SESSION_KEY = 'clear.auth.session'
const TITLE = 'TASK-026 accessibility session'
const SHORT = { width: 390, height: 320 } as const
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

// ── The backend fixture: a real user, real rows, nothing generated ──────────

type Catalogued = { id: string; default_equipment: string }
type Persisted = { session: { id: string } }
type Answer = { ok: boolean; status: number; body: unknown }

/** Never put an admin response body, token or email into an assertion. */
function must<T>(answer: Answer, operation: string): T {
  expect(answer.ok, `${operation}: HTTP status ${answer.status}`).toBe(true)
  return answer.body as T
}

const dayAgo = (offset: number) => {
  const value = new Date()
  value.setUTCDate(value.getUTCDate() - offset)
  return value.toISOString().slice(0, 10)
}

function prescription(exercise: Catalogued, overrides: Record<string, unknown> = {}) {
  return {
    exercise_id: exercise.id, equipment: exercise.default_equipment, session_function: 'primary',
    anchor_relationship: 'neutral', modality: 'reps', sets: 2, target_kind: 'fixed', target_value: 8,
    target_min: null, target_max: null, target_sequence: null, per_side: false, distance_unit: null,
    rest_seconds: 10, tempo: null, load_type: 'none', load_value: null, is_interval_exercise: false,
    ...overrides,
  }
}

/** A Standard lift and a Ladder (the OverflowRail renderer); a fixture, never a model answer. */
function workout(catalog: Catalogued[], locationId: string | null, offset: number) {
  const [one] = catalog
  const block = (structure: string, overrides: Record<string, unknown> = {}) => ({
    structure_type: structure, rounds: null,
    timer_type: structure === 'for_time' ? 'countdown' : 'none',
    timer_seconds: structure === 'for_time' ? 120 : null,
    round_rest_seconds: null, rep_scheme: 'fixed', block_notes: null,
    exercises: [prescription(one)],
    ...overrides,
  })
  const sections = [
    ['Standard', 'primary_lift', 'primary', block('standard')],
    ['Ladder', 'conditioning', 'conditioning', block('for_time', {
      rep_scheme: 'ladder_up',
      exercises: [prescription(one, {
        target_kind: 'sequence', target_value: null, target_sequence: [2, 4, 6, 8, 10, 12, 14, 16], sets: null,
      })],
    })],
  ] as const
  return {
    date: dayAgo(offset), location_id: locationId, session_focus: 'full_body', goal_preset: 'balanced',
    requested_duration_mins: 30, effective_duration_target_mins: 30, computed_duration_mins: null,
    requested_intensity: 5, effective_intensity: 5, adjustment_reason: null, generation_notes: null,
    prompt_version: 'e2e', contract_version: '4.1.0',
    workout: {
      title: TITLE, overview: 'Persisted accessibility fixture; not a model response.', estimated_duration_mins: 30,
      sections: sections.map(([section_title, section_type, session_function, fixture]) => ({
        section_type, section_title, section_notes: null,
        blocks: [{ ...fixture, exercises: fixture.exercises.map((exercise) => ({ ...exercise, session_function })) }],
      })),
    },
  }
}

interface World {
  readonly userId: string
  /** A completed session: History, its detail, Summary and a Review restart. */
  completed(offset?: number): Promise<Persisted>
  /** A rest-day mark the user made, `offset` days before today. */
  rest(offset: number): Promise<void>
}

interface Options {
  /** False leaves the user before onboarding, so `/onboarding` is theirs. */
  readonly onboarded: boolean
}

const test = base.extend<Options & { world: World; blocked: () => number }>({
  onboarded: [true, { option: true }],

  // Every capture lane refuses generation; this one counts what it refused.
  blocked: async ({ page }, use) => {
    const guard = await installDeterministicCapture(page, { skin: 'clear' })
    await use(guard.blockedGenerations)
  },

  world: async ({ page, onboarded }, use, testInfo) => {
    // A missing integration credential is not a passing or skipped proof.
    expect(backend.available, backend.reason).toBe(true)
    const client = backend.client()
    const catalog = must<Catalogued[]>(await client.selectAsService('exercise_definitions', {
      select: 'id,default_equipment', default_equipment: 'neq.bodyweight', order: 'id.asc', limit: '1',
    }), 'Fixture catalog read')
    expect(catalog).toHaveLength(1)
    const suffix = createHash('sha256').update(testInfo.titlePath.join('\0')).digest('hex').slice(0, 10)
    const email = `clear-e2e-${namespaceId()}-${testInfo.project.name}-t026-${suffix}@example.com`
    const prior = await client.findUserByEmail(email)
    if (prior) await client.deleteUser(prior.id)
    const created = await client.ensureConfirmedUser(email)
    const owner = created.id
    try {
      const session = await client.mintSession(email)
      const token = session.accessToken
      let locationId: string | null = null
      if (onboarded) {
        must(await client.rpcAs('complete_onboarding', {
          p_location_name: 'TASK-026 gym', p_location_tier: 'full',
          p_equipment: [...new Set(['bodyweight', 'dumbbells', ...catalog.map((e) => e.default_equipment)])],
          p_experience_level: 'some', p_goal_preset: 'balanced',
          p_sections: ['warmup', 'primary_lift', 'cooldown'], p_avoid_patterns: [], p_note: null,
        }, token), 'Fixture onboarding')
        const [location] = must<Array<{ id: string }>>(await client.selectAsService('locations', {
          select: 'id', user_id: `eq.${owner}`, limit: '1',
        }), 'Fixture location read')
        locationId = location?.id ?? null
      }
      await page.addInitScript(({ key, value }) => {
        if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, JSON.stringify(value))
      }, {
        key: SESSION_KEY,
        value: { accessToken: token, refreshToken: session.refreshToken,
          expiresAt: Date.now() + 60 * 60 * 1000, user: { id: owner, email } },
      })
      await use({
        userId: owner,
        async rest(offset) {
          must(await client.insertAs('rest_days', {
            user_id: owner, day: dayAgo(offset), reason: 'rest', note: null,
          }, token), 'Fixture rest-day mark')
        },
        async completed(offset = 1) {
          const stored = must<Persisted & {
            sections: { blocks: { exercises: { exercise: { id: string } }[] }[] }[]
          }>(await client.rpcAs('persist_session', {
            p_user_id: owner, p_session: workout(catalog, locationId, offset),
          }, token), 'Fixture persistence')
          const started = must<{ outcome: string }>(await client.rpcAs('start_session', {
            p_session_id: stored.session.id }, token), 'Fixture start')
          expect(started.outcome).toBe('started')
          must(await client.insertAs('exercise_set_logs', {
            id: randomUUID(), workout_exercise_id: stored.sections[0].blocks[0].exercises[0].exercise.id,
            set_number: 1, actual_reps: 8, weight: 40, weight_unit: 'kg', rpe: 8,
          }, token), 'Fixture performed-set write')
          const done = must<{ outcome: string }>(await client.rpcAs('complete_session', {
            p_session_id: stored.session.id, p_actual_duration_mins: 30 }, token), 'Fixture completion')
          expect(done.outcome).toBe('completed')
          return stored
        },
      })
    } finally {
      await client.deleteUser(owner).catch(() => {
        throw new Error('TASK-026 scoped fixture cleanup failed.')
      })
    }
  },
})

// ENV-07: the Preview lane has no privileged backend credentials. Register only
// these backend-dependent cases as ineligible there, before their fixtures run.
const backendTest = backend.available ? test : test.skip
test.use({ timezoneId: 'UTC' })

// ── Probes ─────────────────────────────────────────────────────────────────

const h1 = (page: Page) => page.locator('main h1')

/** Reached, by route and heading; a protected route that fell back to Welcome is a failure. */
async function reached(page: Page, path: string | RegExp, heading?: string | RegExp) {
  await expect(page).toHaveURL((url) =>
    typeof path === 'string' ? url.pathname === path : path.test(url.pathname), { timeout: 30_000 })
  if (heading !== undefined) await expect(h1(page)).toHaveAccessibleName(heading, { timeout: 30_000 })
  else await expect(h1(page)).toBeVisible({ timeout: 30_000 })
  const pathname = new URL(page.url()).pathname
  if (isProtectedPath(pathname) || /^\/history\//.test(pathname)) {
    await expect(page.getByRole('button', { name: 'Get started', exact: true })).toHaveCount(0)
  }
}

/** Every finite animation or transition has ended: arrivals are over. */
async function settled(page: Page, timeout = 15_000) {
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) =>
    animation.playState === 'running' &&
    Number.isFinite(Number(animation.effect?.getComputedTiming().endTime))).length),
  { message: 'the screen never came to rest', timeout }).toBe(0)
}

interface Layout {
  readonly h1s: number
  readonly skippedLevels: string[]
  readonly headingsInSpans: string[]
  readonly cardsInCards: number
  readonly scrollers: number
  readonly nestedOwners: string[]
  readonly documentOverflowX: number
  readonly documentScrollTop: number
  readonly documentScrolls: boolean
  readonly scrollerMask: string
  readonly opaqueLayers: string[]
  readonly headers: { grid: boolean; centreOffset: number; small: string[] }[]
  readonly foot: null | { measured: number; height: number; hidden: number; actions: string[]; outside: string[] }
  readonly clippedText: string[]
}

/** The shell, outline and target geometry of whatever route the browser is on. */
function layout(page: Page): Promise<Layout> {
  return page.evaluate(() => {
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' &&
        !element.closest('dialog:not([open]), [hidden], [aria-hidden="true"]')
    }
    const name = (element: Element) => `<${element.tagName.toLowerCase()}>` +
      (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 40)

    // The product outline: one h1, and no level skipped on the way down.
    const headings = [...document.querySelectorAll('main :is(h1,h2,h3,h4,h5,h6)')].filter(visible)
    const skippedLevels: string[] = []
    let previous = 0
    for (const heading of headings) {
      const level = Number(heading.tagName[1])
      if (previous > 0 && level > previous + 1) skippedLevels.push(`${name(heading)} h${previous}->h${level}`)
      previous = level
    }

    const scroller = document.querySelector<HTMLElement>('.clr-scroll-region__scroller')
    const nestedOwners = scroller === null ? [] : [...scroller.querySelectorAll<HTMLElement>('*')]
      .filter((element) => /(auto|scroll)/.test(getComputedStyle(element).overflowY) &&
        element.scrollHeight > element.clientHeight + 1)
      .map((element) => String(element.className))

    const region = document.querySelector<HTMLElement>('.clr-scroll-region')
    const foot = region?.querySelector<HTMLElement>(':scope > .clr-scroll-region__foot') ?? null
    const layers = [
      ...(foot ? [foot, ...foot.querySelectorAll<HTMLElement>('.clr-footer')] : []),
      ...document.querySelectorAll<HTMLElement>('.clr-shell__content > header'),
    ]
    const opaqueLayers = layers.filter((layer) => {
      const style = getComputedStyle(layer)
      return style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.backgroundImage !== 'none' ||
        style.maskImage !== 'none'
    }).map(name)

    // A control's target is its own box, or the package's centred .clr-hit area.
    const target = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect()
      if (!element.classList.contains('clr-hit')) return { width: rect.width, height: rect.height }
      const hit = getComputedStyle(element, '::after')
      return { width: Math.max(rect.width, parseFloat(hit.width) || 0),
        height: Math.max(rect.height, parseFloat(hit.height) || 0) }
    }
    const headers = [...document.querySelectorAll<HTMLElement>('header')].filter(visible).map((header) => {
      const style = getComputedStyle(header)
      const grid = style.display === 'grid'
      let centreOffset = 0
      if (grid) {
        // The left-slot form: the title column sits on the header's centre.
        const middle = header.children[1] as HTMLElement | undefined
        const box = header.getBoundingClientRect()
        const title = middle?.firstElementChild?.getBoundingClientRect() ?? middle?.getBoundingClientRect()
        if (title) centreOffset = Math.abs((title.left + title.right) / 2 - (box.left + box.right) / 2)
      }
      // Every header control keeps the package's 40px target, by its box or its .clr-hit area.
      const small = [...header.querySelectorAll<HTMLElement>('button, a, [role="button"]')].filter(visible)
        .filter((control) => {
          const size = target(control)
          return size.height < 39.5 || size.width < 39.5
        }).map(name)
      return { grid, centreOffset, small }
    })

    const actions = foot ? [...foot.querySelectorAll<HTMLElement>('button, a')].filter(visible) : []
    const footRect = foot?.getBoundingClientRect()
    const outside = actions.filter((action) => {
      const rect = action.getBoundingClientRect()
      return rect.top < -0.5 || rect.bottom > window.innerHeight + 0.5 ||
        rect.left < -0.5 || rect.right > window.innerWidth + 0.5 ||
        (footRect !== undefined && (rect.top < footRect.top - 0.5 || rect.bottom > footRect.bottom + 0.5))
    }).map(name)

    // Visible text that is cut off on its own line, rather than wrapped or ellipsised by design.
    const clippedText = [...document.querySelectorAll<HTMLElement>('main :is(h1,h2,h3,p,label,button,input,textarea)')]
      .filter(visible).filter((element) => {
        const style = getComputedStyle(element)
        if (style.textOverflow === 'ellipsis' || element.matches('input, textarea')) {
          return element.getBoundingClientRect().right > window.innerWidth + 1
        }
        return /(hidden|clip)/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 1
      }).map(name)

    const root = document.scrollingElement ?? document.documentElement
    return {
      h1s: document.querySelectorAll('main h1').length,
      skippedLevels,
      // The public Card's heading slot is a span: a block heading must never sit inside one.
      headingsInSpans: [...document.querySelectorAll('main .clr-card__body span.label :is(h1,h2,h3,h4,h5,h6)')].map(name),
      cardsInCards: document.querySelectorAll('.clr-card .clr-card').length,
      scrollers: document.querySelectorAll('.clr-scroll-region__scroller').length,
      nestedOwners,
      documentOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      documentScrollTop: root.scrollTop,
      documentScrolls: root.scrollHeight > root.clientHeight + 1,
      scrollerMask: scroller ? getComputedStyle(scroller).maskImage : 'missing',
      opaqueLayers,
      headers,
      foot: foot === null || region === null ? null : {
        measured: parseFloat(getComputedStyle(region).getPropertyValue('--foot-h')),
        height: foot.getBoundingClientRect().height,
        hidden: foot.scrollHeight - foot.clientHeight,
        actions: actions.map(name),
        outside,
      },
      clippedText,
    }
  })
}

/** REQ-004/008/010/029 on the current route at the current viewport. */
async function expectContainedRoute(page: Page, where: string, options: { short?: boolean } = {}) {
  await settled(page)
  const probe = await layout(page)
  expect(probe.h1s, `${where}: one screen title`).toBe(1)
  expect(probe.skippedLevels, `${where}: the heading outline skips a level`).toEqual([])
  expect(probe.headingsInSpans, `${where}: a block heading sits inside a span`).toEqual([])
  expect(probe.cardsInCards, `${where}: a card is nested in a card`).toBe(0)
  expect(probe.scrollers, `${where}: one ScrollRegion owns vertical scroll`).toBe(1)
  expect(probe.nestedOwners, `${where}: a second vertical scroll owner`).toEqual([])
  expect(probe.documentOverflowX, `${where}: the document overflows sideways`).toBeLessThanOrEqual(0)
  expect(probe.documentScrollTop, `${where}: the document scrolled`).toBe(0)
  expect(probe.documentScrolls, `${where}: the document itself scrolls`).toBe(false)
  expect(probe.scrollerMask, `${where}: an edge fade masks the scroller`).toBe('none')
  expect(probe.opaqueLayers, `${where}: a pinned layer paints a surface`).toEqual([])
  expect(probe.clippedText, `${where}: text is clipped`).toEqual([])
  for (const header of probe.headers) {
    expect(header.small, `${where}: a header control is under the 40px target`).toEqual([])
    if (header.grid) expect(header.centreOffset, `${where}: the left-slot header is off centre`).toBeLessThanOrEqual(1)
  }
  if (probe.foot !== null) {
    expect(probe.foot.measured, `${where}: the footer is not measured`).toBeCloseTo(probe.foot.height, 0)
    if (!options.short) {
      expect(probe.foot.hidden, `${where}: the footer hides content`).toBeLessThanOrEqual(1)
      expect(probe.foot.outside, `${where}: a pinned action is out of reach`).toEqual([])
    }
  }
  return probe
}

/** On a short phone a clipped footer must still reveal each action to the keyboard. */
async function expectShortReachable(page: Page, where: string) {
  const original = page.viewportSize()!
  await page.setViewportSize(SHORT)
  try {
    const probe = await expectContainedRoute(page, `${where} (short phone)`, { short: true })
    const actions = page.locator('.clr-scroll-region__foot').locator('button:visible, a:visible')
    const count = await actions.count()
    for (let index = 0; index < count; index += 1) {
      const action = actions.nth(index)
      // A native disabled button intentionally has no keyboard stop (for
      // example Previous on the first workout section). Verify that contract;
      // require full viewport/footer reachability for every enabled action.
      const disabled = await action.evaluate((element) => element instanceof HTMLButtonElement && element.disabled)
      if (disabled) {
        await expect(action).toBeDisabled()
        await action.focus()
        await expect(action).not.toBeFocused()
        continue
      }
      await action.focus()
      const geometry = () => action.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const foot = element.closest('.clr-scroll-region__foot')!
        const frame = foot.getBoundingClientRect()
        return {
          inViewport: rect.top >= -0.5 && rect.bottom <= window.innerHeight + 0.5,
          insideFoot: rect.top >= frame.top - 0.5 && rect.bottom <= frame.bottom + 0.5,
          documentScrollTop: document.scrollingElement?.scrollTop ?? 0,
          top: rect.top, bottom: rect.bottom, viewportHeight: window.innerHeight,
          footTop: frame.top, footBottom: frame.bottom, footScrollTop: foot.scrollTop,
        }
      })
      const initial = await geometry()
      let observed = initial
      try {
        // Focus can initiate native scrolling and a measured-layer update.
        // Require the actual fully reachable state, never a fixed delay.
        await expect.poll(async () => { observed = await geometry(); return observed }, {
          message: `${where} (short phone): footer action ${index + 1} is unreachable`, timeout: 2_000,
        }).toMatchObject({ inViewport: true, insideFoot: true, documentScrollTop: 0 })
      } finally {
        if (!initial.inViewport || !initial.insideFoot || initial.documentScrollTop !== 0) {
          await test.info().attach('short-footer-reachability.json', {
            body: JSON.stringify({ route: where, action: index + 1, initial, observed }, null, 2),
            contentType: 'application/json',
          })
        }
      }
    }
    // The content above the footer still reaches its last item in the one owner.
    const reachedEnd = await page.locator('.clr-scroll-region__scroller').evaluate((element) => {
      element.scrollTop = element.scrollHeight
      return Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop) <= 1
    })
    expect(reachedEnd, `${where} (short phone): the scroller cannot reach its end`).toBe(true)
    return probe
  } finally {
    await page.setViewportSize(original)
  }
}

async function useSkin(page: Page, skin: CaptureSkin) {
  // What the package's own `setSkin` does: the stored key and the attribute.
  await page.evaluate(({ key, value }) => {
    window.localStorage.setItem(key, value)
    document.documentElement.setAttribute('data-skin', value)
  }, { key: SKIN_KEY, value: skin })
  await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
}

/**
 * Selection is never colour alone: a selected choice or tab differs from an
 * unselected peer in something other than colour (a tick, a mark, a bar).
 */
function nonColourCues(page: Page) {
  return page.evaluate(() => {
    // Presence, never hue: a drawn edge (an underline, a bar) counts; its colour does not.
    const transparent = (colour: string) => colour === 'transparent' || /rgba\(.*,\s*0\)$/.test(colour)
    const edges = (style: CSSStyleDeclaration) => (['Top', 'Right', 'Bottom', 'Left'] as const)
      .filter((side) => parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 &&
        style.getPropertyValue(`border-${side.toLowerCase()}-style`) !== 'none' &&
        !transparent(style.getPropertyValue(`border-${side.toLowerCase()}-color`))).join('')
    const shape = (element: Element) => {
      const parts = [element, ...element.querySelectorAll('*')]
      return parts.map((part) => {
        const own = getComputedStyle(part)
        const pseudo = ['::before', '::after'].map((which) => {
          const style = getComputedStyle(part, which)
          return [style.content, style.width, style.height, style.opacity, style.display, style.transform,
            transparent(style.backgroundColor) ? '' : 'filled'].join(' ')
        })
        return [part.tagName, own.opacity, own.display, own.visibility, own.fontWeight,
          own.textDecorationLine, edges(own), ...pseudo].join('|')
      }).join('||')
    }
    const groups = new Map<Element, { on: Element[]; off: Element[] }>()
    const selected = (element: Element) => ['aria-checked', 'aria-selected', 'aria-pressed']
      .some((attribute) => element.getAttribute(attribute) === 'true')
    for (const choice of document.querySelectorAll('main :is([role="radio"],[role="tab"],[role="checkbox"],[role="switch"])')) {
      const group = choice.closest('[role="radiogroup"], [role="tablist"], [role="group"], fieldset') ?? choice.parentElement!
      const entry = groups.get(group) ?? { on: [], off: [] }
      ;(selected(choice) ? entry.on : entry.off).push(choice)
      groups.set(group, entry)
    }
    const failures: string[] = []
    let compared = 0
    for (const { on, off } of groups.values()) {
      if (on.length === 0 || off.length === 0) continue
      compared += 1
      if (shape(on[0]) === shape(off[0])) {
        failures.push((on[0].getAttribute('aria-label') ?? on[0].textContent ?? '').trim().slice(0, 40))
      }
    }
    return { compared, failures }
  })
}

/** Four skins: contrast and the rest of axe, plus the non-colour selection cue. */
async function expectFourSkins(page: Page, checkA11y: () => Promise<void>, where: string) {
  try {
    for (const skin of CAPTURE_SKINS) {
      await useSkin(page, skin)
      await settled(page)
      await checkA11y()
      const cues = await nonColourCues(page)
      expect(cues.failures, `${where} in ${skin}: a selection is carried by colour alone`).toEqual([])
    }
  } finally {
    await useSkin(page, 'clear')
  }
}

const runningNames = (page: Page) => page.evaluate(() => document.getAnimations()
  .filter((animation) => animation.playState === 'running')
  .map((animation) => 'animationName' in animation ? String(animation.animationName)
    : 'transitionProperty' in animation ? String(animation.transitionProperty) : animation.id))

/** Under the real reduced-motion preference: final state at once, nothing blanked. */
async function expectResolvedImmediately(page: Page, where: string) {
  await expect.poll(() => runningNames(page), { message: `${where}: still animating`, timeout: 3_000 }).toEqual([])
  // An entrance silenced to nothing leaves content at opacity 0. OverflowRail's
  // edge cues are hidden whenever there is nothing further, and a native
  // checkbox or radio is always hidden behind the package's drawn mark.
  const blanked = await page.evaluate(() => [...document.querySelectorAll(
    'main h1, main h2, main p, main button, main input, main a')]
    .filter((element) => !element.matches('.clr-rail__cue, input[type="checkbox"], input[type="radio"]'))
    .filter((element) => {
      const style = getComputedStyle(element)
      return style.opacity === '0' || (style.visibility === 'hidden' && style.animationName !== 'none')
    }).map((element) => element.tagName.toLowerCase() + '.' + String(element.className) + ':' +
      (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 30)))
  expect(blanked, `${where}: content vanished with its animation`).toEqual([])
  const atmosphere = await page.locator('.clr-atmosphere__blob').evaluateAll((blobs) =>
    blobs.map((blob) => ({ animations: blob.getAnimations().length, transform: getComputedStyle(blob).transform })))
  expect(atmosphere.length, `${where}: the atmosphere is missing`).toBe(3)
  for (const blob of atmosphere) expect(blob, `${where}: the atmosphere moves`).toEqual({ animations: 0, transform: 'none' })
}

/** The bracket layer or the field's own border, for the focused control. */
function focusStop(page: Page) {
  return page.evaluate(() => {
    const focused = document.activeElement
    const main = document.querySelector('main')
    if (!(focused instanceof HTMLElement) || !main?.contains(focused)) return null
    const field = focused.matches(
      'input:not([type="checkbox"],[type="radio"],[type="range"],[type="button"],[type="submit"],[type="reset"]),textarea,select')
    const bracket = document.querySelector('.clr-focus-brackets')
    const box = bracket?.getBoundingClientRect()
    return {
      name: (focused.getAttribute('aria-label') ?? focused.textContent ?? focused.tagName).trim().slice(0, 40),
      field,
      layers: document.querySelectorAll('.clr-focus-brackets').length,
      opacity: bracket ? Number(getComputedStyle(bracket).opacity) : 0,
      area: box ? box.width * box.height : 0,
      animating: bracket ? bracket.getAnimations().filter((animation) => animation.playState === 'running').length : 0,
    }
  })
}

/** Tab through `main` and hold every stop to the 0.14.3 focus ownership. */
async function expectFocusOwnership(page: Page, where: string) {
  // Move the sequential-navigation starting point to the top of the document,
  // so the walk covers all of main rather than resuming after the last click.
  await page.evaluate(() => {
    const marker = document.createElement('span')
    marker.tabIndex = -1
    document.body.prepend(marker)
    marker.focus()
    marker.remove()
  })
  let entered = false
  const kinds = new Set<string>()
  for (let press = 0; press < 80; press += 1) {
    await page.keyboard.press('Tab')
    await settled(page, 5_000)
    const stop = await focusStop(page)
    if (stop === null) {
      if (entered) break
      continue
    }
    entered = true
    expect(stop.layers, `${where}: more than one bracket layer`).toBe(1)
    if (stop.field) {
      kinds.add('field')
      expect(stop.opacity, `${where}: the field "${stop.name}" summoned brackets`).toBe(0)
    } else {
      kinds.add('brackets')
      expect(stop.opacity, `${where}: "${stop.name}" has no brackets`).toBe(1)
      expect(stop.area, `${where}: "${stop.name}" brackets have no size`).toBeGreaterThan(0)
      // Static brackets: they appear where focus is, they do not travel or pulse.
      expect(stop.animating, `${where}: "${stop.name}" brackets animate`).toBe(0)
    }
  }
  expect(entered, `${where}: the keyboard never reached main`).toBe(true)
  return kinds
}

// ── Routes ─────────────────────────────────────────────────────────────────

interface Stop {
  readonly label: string
  readonly path: string | RegExp
  readonly heading?: string | RegExp
  readonly go: (page: Page, visit: (path: string) => Promise<void>) => Promise<void>
}

/** Every protected required route, in the order a returning athlete reaches them. */
function protectedStops(detail: string): Stop[] {
  const at = (path: string, heading?: string): Stop => ({
    label: path, path, heading, go: (_page, visit) => visit(path),
  })
  return [
    at('/', 'Today'),
    at('/generate', 'Generate workout'),
    at('/history', 'History'),
    at(`/history/${detail}`),
    at('/settings', 'Settings'),
    at('/settings/locations', 'Places and equipment'),
    at('/summary', 'Nice work'),
    {
      label: '/review', path: '/review', heading: TITLE,
      async go(page, visit) {
        await visit(`/history/${detail}`)
        await page.getByRole('button', { name: 'Restart', exact: true }).click()
      },
    },
    { label: '/workout', path: '/workout', heading: 'Workout', go: startWorkout },
  ]
}

/**
 * Review's own Start: the active session is the app's, not a fixture's. The
 * running session clock remounts a digit's finite tumble each second. Hold
 * only wall time once Workout is reached; timers/RAF must keep running for
 * axe and the actual route/dialog callbacks, rather than deadlocking them.
 */
async function startWorkout(page: Page) {
  await page.getByRole('button', { name: 'Start workout', exact: true }).click()
  await reached(page, '/workout', 'Workout')
  await page.clock.setFixedTime((await page.evaluate(() => Date.now())) + 1_000)
  // Regress the actual deadlock: both frame callbacks and timers must turn.
  await page.evaluate(() => {
    document.documentElement.dataset.t026ClockTurn = 'pending'
    requestAnimationFrame(() => setTimeout(() => {
      document.documentElement.dataset.t026ClockTurn = 'done'
    }, 0))
  })
  await expect(page.locator('html')).toHaveAttribute('data-t026-clock-turn', 'done', { timeout: 2_000 })
  await page.locator('html').evaluate((element) => { delete (element as HTMLElement).dataset.t026ClockTurn })
}

// ── Cases ──────────────────────────────────────────────────────────────────

backendTest('protected routes: outline, containment, one scroll owner, targets, pinned actions and four skins', async ({
  page, visit, checkA11y, world, blocked,
}, testInfo) => {
  test.setTimeout(420_000)
  expect(VIEWPORT_OF_PROJECT[testInfo.project.name], 'a REQ-029 viewport project').toBeTruthy()
  const phone = testInfo.project.name === 'mobile'
  const done = await world.completed()
  for (const stop of protectedStops(done.session.id)) {
    await stop.go(page, visit)
    await reached(page, stop.path, stop.heading)
    await expectContainedRoute(page, stop.label)
    if (stop.path === '/') {
      // U18 replaced the bare text link (TASK-026's undersized target) with the
      // package's framed icon-only control, which brings its own target.
      await expect(page.locator('header').getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
      expect((await layout(page)).headers.flatMap((header) => header.small)).toEqual([])
    }
    await expectFourSkins(page, checkA11y, stop.label)
    if (phone) await expectShortReachable(page, stop.label)
  }
  expect(blocked(), 'a generation request left the browser').toBe(0)
})

backendTest('public routes: Welcome, sign-in and onboarding keep the same contract', async ({
  page, visit, checkA11y,
}, testInfo) => {
  test.setTimeout(240_000)
  const phone = testInfo.project.name === 'mobile'
  for (const [path, heading] of [['/welcome', 'CLEAR'], ['/login', 'Get started']] as const) {
    await visit(path)
    await reached(page, path, heading)
    await expectContainedRoute(page, path)
    await expectFourSkins(page, checkA11y, path)
    if (phone) await expectShortReachable(page, path)
  }
})

// ── TASK-002 · JOURNEY-002 (U05–U08) ──────────────────────────────────────

/** Enlarged text: every type step a phone user can raise, by a quarter. */
const ENLARGED_TEXT = `.clr-screen {
  --label-xs-size: 18px; --label-sm-size: 18px; --label-md-size: 20px;
  --paragraph-sm-size: 18px; --paragraph-md-size: 20px; --paragraph-md-line-height: 25px;
}`

/** One in-card action group: its actions inside its box, sharing the card width. */
function actionGroupGeometry(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true }).evaluate((button) => {
    const group = button.closest('.clr-action-group')!
    const body = group.closest('.clr-card__body')!
    const style = getComputedStyle(body)
    const inner = body.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    const box = group.getBoundingClientRect()
    const cells = [...group.children].map((child) => child.getBoundingClientRect())
    const rows = new Map<number, number>()
    const rowHeights = new Map<number, Set<number>>()
    for (const cell of cells) {
      const top = Math.round(cell.top)
      rows.set(top, (rows.get(top) ?? 0) + cell.width)
      rowHeights.set(top, (rowHeights.get(top) ?? new Set()).add(Math.round(cell.height)))
    }
    const gap = parseFloat(getComputedStyle(group).columnGap) || 0
    return {
      groupWidth: box.width,
      cardInnerWidth: inner,
      outside: cells.filter((cell) => cell.left < box.left - 0.5 || cell.right > box.right + 0.5).length,
      // Each row of cells (with the gaps between them) fills the group.
      rowFill: [...rows.entries()].map(([top, width]) => {
        const count = cells.filter((cell) => Math.round(cell.top) === top).length
        return Math.abs(width + gap * (count - 1) - box.width)
      }),
      // Actions sharing a row share a height; a label too long for a shared
      // row takes a full row of its own and may wrap there.
      unevenRows: [...rowHeights.values()].filter((heights) => heights.size > 1).length,
      minTarget: Math.min(...cells.map((cell) => cell.height)),
    }
  })
}

async function expectCompactGroup(page: Page, name: string, where: string) {
  const geometry = await actionGroupGeometry(page, name)
  expect(geometry.groupWidth, `${where}: the action group does not use the card width`)
    .toBeCloseTo(geometry.cardInnerWidth, 0)
  expect(geometry.outside, `${where}: an action spills out of its group`).toBe(0)
  for (const fill of geometry.rowFill) expect(fill, `${where}: a row of actions leaves card width unused`).toBeLessThanOrEqual(1)
  expect(geometry.unevenRows, `${where}: actions sharing a row differ in height`).toBe(0)
  expect(geometry.minTarget, `${where}: an action is under the 40px target`).toBeGreaterThanOrEqual(39.5)
}

/** No horizontal overflow and no clipped text, at enlarged text with the longest labels. */
async function expectEnlargedFits(page: Page, where: string) {
  const tag = await page.addStyleTag({ content: ENLARGED_TEXT })
  try {
    const probe = await layout(page)
    expect(probe.documentOverflowX, `${where} (enlarged text): the document overflows sideways`).toBeLessThanOrEqual(0)
    expect(probe.clippedText, `${where} (enlarged text): text is clipped`).toEqual([])
    const sideways = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('main .clr-screen__content *')]
      .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1 &&
        !element.closest('.clr-band, [role="tablist"]'))
      .map((element) => `<${element.tagName.toLowerCase()}>${(element.textContent ?? '').trim().slice(0, 30)}`))
    expect(sideways, `${where} (enlarged text): content runs past the viewport`).toEqual([])
  } finally {
    await tag.evaluate((element) => (element as Element).remove())
  }
}

/** Every short count with its unit renders on one line. */
async function expectCountsTogether(page: Page, pattern: RegExp, where: string) {
  const spans = await page.locator('main').evaluate((main, source) => {
    const matcher = new RegExp(source, 'g')
    const found: { text: string; lines: number }[] = []
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node.textContent ?? ''
      for (const match of text.matchAll(matcher)) {
        const range = document.createRange()
        range.setStart(node, match.index)
        range.setEnd(node, match.index + match[0].length)
        const tops = new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top)))
        found.push({ text: match[0], lines: tops.size })
      }
    }
    return found
  }, pattern.source)
  expect(spans.length, `${where}: no count was found to check`).toBeGreaterThan(0)
  for (const span of spans) expect(span.lines, `${where}: "${span.text}" wraps away from its unit`).toBe(1)
}

backendTest('JOURNEY-002: Home and History keep one rhythm, enlarged readable text, compact actions and one statement', async ({
  page, visit, world,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'JOURNEY-002 is proven at the 390 by 844 phone viewport')
  test.setTimeout(240_000)
  void world
  expect(page.viewportSize()).toEqual({ width: 390, height: 844 })

  // Home, empty history: one statement per empty, no standing explanation.
  await visit('/')
  await reached(page, '/', 'Today')
  await expectContainedRoute(page, '/')
  const recentStatement = page.getByText('No workouts yet', { exact: true })
  await expect(recentStatement).toBeVisible()
  expect(await recentStatement.evaluate((node) => node.parentElement!.children.length)).toBe(1)
  await expect(page.getByText(/Compose a session/)).toHaveCount(0)
  await expect(page.locator('.clr-footer').getByRole('button', { name: 'Generate workout', exact: true })).toBeVisible()

  // U05: paragraphs carry no browser margin; spacing is the layout's gap.
  const margins = await page.locator('main .clr-screen__content').evaluate((content) =>
    [...content.querySelectorAll('p, dl, dd')].filter((element) => {
      const style = getComputedStyle(element)
      return parseFloat(style.marginTop) + parseFloat(style.marginBottom) + parseFloat(style.marginLeft) > 0 &&
        !(element as HTMLElement).style.marginTop
    }).length)
  expect(margins, '/: a paragraph adds unexplained blank space').toBe(0)

  // U06: the data-label tier is enlarged on the screen, and counts keep their units.
  const tier = await page.locator('main.clr-screen').evaluate((main) => {
    const style = getComputedStyle(main)
    return { xs: style.getPropertyValue('--label-xs-size').trim(), sm: style.getPropertyValue('--label-sm-size').trim() }
  })
  expect(tier.xs).toBe(tier.sm)
  await expect(page.getByText('No sessions this week yet.', { exact: true })).toBeVisible()

  // U07: the rest-day action uses the card width, alone and as Save/Cancel.
  await expectCompactGroup(page, 'Mark Rest Day', '/ rest day')
  await page.getByRole('button', { name: 'Mark Rest Day', exact: true }).click()
  await expectCompactGroup(page, 'Save rest day', '/ rest day editor')
  await expectEnlargedFits(page, '/ rest day editor')

  // Long labels and an error state keep the group usable inside the card.
  await page.route('**/rest/v1/rpc/mark_rest_day*', (route) => route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: CORS })
    : route.fulfill({ status: 503, headers: CORS, json: { code: 'PGRST000', message: 'Controlled TASK-002 failure.' } }))
  await page.getByRole('button', { name: 'Save rest day', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'The rest day wasn’t saved' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).evaluate((button) => {
    const label = [...button.querySelectorAll('*')].find((node) => node.children.length === 0 && node.textContent?.trim() === 'Cancel') ?? button
    label.textContent = 'Cancel and keep today as a training day'
  })
  await expectCompactGroup(page, 'Save rest day', '/ rest day error, long label')
  await expectEnlargedFits(page, '/ rest day error, long label')
  await page.unroute('**/rest/v1/rpc/mark_rest_day*')

  // History, empty: one statement and the first workout as its next action.
  await visit('/history')
  await reached(page, '/history', 'History')
  await expectContainedRoute(page, '/history')
  const historyStatement = page.getByText('No workouts yet', { exact: true })
  await expect(historyStatement).toBeVisible()
  expect(await historyStatement.evaluate((node) => node.parentElement!.children.length)).toBe(1)
  await expectEnlargedFits(page, '/history empty')
  await page.locator('.clr-footer').getByRole('button', { name: 'Generate workout', exact: true }).click()
  await reached(page, '/generate', 'Generate workout')

  // Generate with the on-screen keypad up: a shorter visual viewport, the
  // numeric field focused, and nothing pushed sideways or out of reach.
  await page.setViewportSize({ width: 390, height: 500 })
  try {
    const minutes = page.getByLabel('Time available')
    await minutes.focus()
    await minutes.fill('45')
    await expect(minutes).toBeInViewport()
    await expectContainedRoute(page, '/generate (keypad)', { short: true })
    await expectEnlargedFits(page, '/generate (keypad)')
  } finally {
    await page.setViewportSize({ width: 390, height: 844 })
  }
})

backendTest('JOURNEY-002: a populated Home and History keep counts with units and fit enlarged text', async ({
  page, visit, world,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'JOURNEY-002 is proven at the 390 by 844 phone viewport')
  test.setTimeout(240_000)
  await world.completed()

  await visit('/history')
  await reached(page, '/history', 'History')
  await expectContainedRoute(page, '/history populated')
  await expectCountsTogether(page, /\d+ min|Intensity \d+\/10/, '/history rows')
  const nowrap = await page.locator('main .clr-nowrap').evaluateAll((spans) => spans.map((span) => getComputedStyle(span).whiteSpace))
  expect(nowrap.length).toBeGreaterThan(0)
  expect(new Set(nowrap)).toEqual(new Set(['nowrap']))
  await expectEnlargedFits(page, '/history populated')

  await visit('/')
  await reached(page, '/', 'Today')
  await expectContainedRoute(page, '/ populated')
  await expectCountsTogether(page, /\d+\xa0days?/, '/ streak')
  await expectCountsTogether(page, /\d+\xa0of\xa07\xa0days/, '/ week')
  await expectCompactGroup(page, 'Quick start', '/ quick start')
  await expectEnlargedFits(page, '/ populated')
})

backendTest('JOURNEY-002: Settings stays readable with long input and concise navigation', async ({
  page, visit, world,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'JOURNEY-002 is proven at the 390 by 844 phone viewport')
  void world
  await visit('/settings')
  await reached(page, '/settings', 'Settings')
  await expectContainedRoute(page, '/settings')
  const places = page.getByRole('region', { name: 'Places and equipment', exact: true })
  await expect(places.locator('p')).toHaveCount(0)
  // The shipped TextAction includes its trailing chevron in the browser's
  // accessible name. Match that actual name while keeping the label anchored.
  await expect(places.getByRole('button', { name: /^Manage places(?:\s*›)?$/ })).toBeVisible()
  await page.getByLabel(/note/i).fill('Synthetic long limitations context for readable phone controls. '.repeat(8))
  await expectEnlargedFits(page, '/settings long input')
  await page.setViewportSize({ width: 390, height: 500 })
  try {
    await page.getByLabel(/note/i).focus()
    await expectEnlargedFits(page, '/settings keypad')
  } finally {
    await page.setViewportSize({ width: 390, height: 844 })
  }
})

// ── TASK-003 · JOURNEY-003 (U12) ──────────────────────────────────────────

interface DayRoles {
  readonly rest: number
  readonly trained: number
  /** The drawn border of the first rest / trained day, as sRGB over the ground. */
  readonly restBorder: readonly number[] | null
  readonly trainedBorder: readonly number[] | null
  /** The skin's info and completed roles, resolved the same way. */
  readonly infoRole: readonly number[]
  readonly completedRole: readonly number[]
  readonly ground: readonly number[]
  readonly restGlyph: string | null
  readonly trainedGlyph: string | null
}

/** The rest and trained days of the one week/streak list on the current route. */
function dayRoles(page: Page): Promise<DayRoles> {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    const probe = document.createElement('div')
    document.body.append(probe)
    const resolve = (value: string) => {
      probe.style.backgroundColor = value
      return getComputedStyle(probe).backgroundColor
    }
    const ground = resolve('var(--base)')
    // Any CSS colour form, flattened onto the ground the frame sits on.
    const rgb = (colour: string) => {
      context.fillStyle = ground
      context.fillRect(0, 0, 1, 1)
      context.fillStyle = colour
      context.fillRect(0, 0, 1, 1)
      return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)]
    }
    const days = [...document.querySelectorAll<HTMLElement>('main li[data-day-state]')]
    const rest = days.filter((day) => day.dataset.dayState === 'rest')
    const trained = days.filter((day) => day.dataset.dayState === 'workout')
    const border = (day: HTMLElement | undefined) =>
      day ? rgb(getComputedStyle(day, '::after').backgroundColor) : null
    const glyph = (day: HTMLElement | undefined) => day?.querySelector('[aria-hidden="true"] svg')?.innerHTML ?? null
    const result = {
      rest: rest.length,
      trained: trained.length,
      restBorder: border(rest[0]),
      trainedBorder: border(trained[0]),
      infoRole: rgb(resolve('var(--border-toast-info)')),
      completedRole: rgb(resolve('var(--border-selected)')),
      ground: rgb(ground),
      restGlyph: glyph(rest[0]),
      trainedGlyph: glyph(trained[0]),
    }
    probe.remove()
    return result
  })
}

/** WCAG contrast between two sRGB colours. */
function contrast(a: readonly number[], b: readonly number[]) {
  const luminance = (rgb: readonly number[]) => {
    const [r, g, b] = rgb.map((channel) => {
      const c = channel / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const close = (a: readonly number[] | null, b: readonly number[]) =>
  a !== null && a.every((channel, index) => Math.abs(channel - b[index]) <= 2)

/** In every skin: rest in the info role, trained in the completed role, two glyphs. */
async function expectRestTrainingDistinct(page: Page, where: string) {
  // The week is data: wait for its reads, not only for the arrival animation.
  for (const state of ['rest', 'workout']) {
    await expect(page.locator(`main li[data-day-state="${state}"]`).first(),
      `${where}: no ${state} day rendered`).toBeVisible({ timeout: 30_000 })
  }
  try {
    for (const skin of CAPTURE_SKINS) {
      await useSkin(page, skin)
      await settled(page)
      const roles = await dayRoles(page)
      const at = `${where} in ${skin}`
      expect(roles.rest, `${at}: no rest day to compare`).toBeGreaterThan(0)
      expect(roles.trained, `${at}: no trained day to compare`).toBeGreaterThan(0)
      expect(close(roles.restBorder, roles.infoRole), `${at}: a rest day is not in the info role`).toBe(true)
      expect(close(roles.trainedBorder, roles.completedRole), `${at}: a trained day is not in the completed role`).toBe(true)
      expect(close(roles.restBorder, roles.trainedBorder ?? []), `${at}: rest and trained share a border colour`).toBe(false)
      // Visible: the rest frame's edge holds the 3:1 non-text contrast against the ground.
      expect(contrast(roles.restBorder!, roles.ground), `${at}: the rest frame vanishes into the ground`)
        .toBeGreaterThanOrEqual(3)
      // The non-colour cue: each state draws its own glyph.
      expect(roles.restGlyph, `${at}: a rest day has no glyph`).not.toBeNull()
      expect(roles.trainedGlyph, `${at}: a trained day has no glyph`).not.toBeNull()
      expect(roles.restGlyph, `${at}: rest and trained share a glyph`).not.toBe(roles.trainedGlyph)
    }
  } finally {
    await useSkin(page, 'clear')
  }
}

backendTest('JOURNEY-003: Home and Summary keep rest and training days distinct in every skin', async ({
  page, visit, world,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'JOURNEY-003 is proven at the 390 by 844 phone viewport')
  test.setTimeout(240_000)
  expect(page.viewportSize()).toEqual({ width: 390, height: 844 })
  // Trained today; a marked rest day elsewhere in this (Monday-first) week.
  await world.completed(0)
  await world.rest(new Date().getUTCDay() === 0 ? 1 : -1)

  await visit('/summary')
  await reached(page, '/summary', 'Nice work')
  await expectRestTrainingDistinct(page, '/summary streak')

  await visit('/')
  await reached(page, '/', 'Today')
  await expectContainedRoute(page, '/ week')
  await expectRestTrainingDistinct(page, '/ week')
})

test.describe('onboarding', () => {
  test.use({ onboarded: false })
  backendTest('JOURNEY-002: all five onboarding steps keep readable controls and concise grouping', async ({
    page, visit, world,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'JOURNEY-002 is proven at the 390 by 844 phone viewport')
    void world
    await visit('/onboarding')
    await reached(page, '/onboarding', 'Set up CLEAR')
    for (let step = 0; step < 5; step += 1) {
      await expect(page.locator('main .clr-card')).toHaveCount(1)
      await expectContainedRoute(page, `/onboarding step ${step + 1}`)
      await expectEnlargedFits(page, `/onboarding step ${step + 1}`)
      if (step < 3) await page.getByRole('radio').first().click()
      if (step < 4) await page.getByRole('button', { name: /^(Next|Skip)$/ }).click()
    }
    // Review the final grouping without submitting onboarding or generating.
    await expect(page.getByRole('button', { name: 'Finish setup', exact: true })).toBeVisible()
  })
  backendTest('onboarding: the guard serves a new athlete and the contract holds', async ({
    page, visit, checkA11y, world,
  }, testInfo) => {
    test.setTimeout(180_000)
    void world
    await visit('/onboarding')
    await reached(page, '/onboarding')
    await expectContainedRoute(page, '/onboarding')
    await expectFourSkins(page, checkA11y, '/onboarding')
    if (testInfo.project.name === 'mobile') await expectShortReachable(page, '/onboarding')
    const kinds = await expectFocusOwnership(page, '/onboarding')
    expect(kinds.has('brackets')).toBe(true)

    // TASK026-R1: this authenticated, not-yet-onboarded athlete must also
    // arrive at the actual wizard with reduced motion, not fall back to Welcome.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await visit('/onboarding')
    await reached(page, '/onboarding', 'Set up CLEAR')
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    await expectResolvedImmediately(page, '/onboarding (authenticated reduced motion)')
    await expect(page.locator('main')).not.toHaveClass(/route-enter-/)
  })
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  backendTest('every required route resolves immediately under the real preference', async ({
    page, visit, world,
  }) => {
    test.setTimeout(300_000)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    const done = await world.completed()
    for (const stop of protectedStops(done.session.id)) {
      await stop.go(page, visit)
      await reached(page, stop.path, stop.heading)
      await expectResolvedImmediately(page, stop.label)
      // Nothing waits on an entrance: the main element carries none.
      await expect(page.locator('main')).not.toHaveClass(/route-enter-/)
    }
    // Home's tabs change in place with no entrance left running.
    await visit('/')
    await page.getByRole('tab', { name: 'Favorites', exact: true }).click()
    await expect(page.getByRole('tab', { name: 'Favorites', exact: true })).toHaveAttribute('aria-selected', 'true')
    // The collapsed 0.01ms state transition may still be in its first frame; it ends at once.
    await expect.poll(() => runningNames(page), { timeout: 1_000 }).toEqual([])
  })

  test('signed-out routes resolve immediately too', async ({ page, visit }) => {
    for (const path of ['/welcome', '/login']) {
      await visit(path)
      await expectResolvedImmediately(page, path)
    }
  })
})

backendTest('motion: one breathing atmosphere, interrupted entries cut, one informative loop', async ({
  page, visit, world,
}) => {
  test.setTimeout(240_000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const done = await world.completed()
  await visit('/')
  await reached(page, '/', 'Today')

  // REQ-006: one mounted atmosphere; breathing is transform-only — no opacity, filter or blur.
  const blobs = await page.locator('.clr-atmosphere__blob').evaluateAll((elements) => elements.map((blob) => ({
    filter: getComputedStyle(blob).filter,
    animations: blob.getAnimations().map((animation) => ({
      name: (animation as CSSAnimation).animationName,
      properties: [...new Set(((animation.effect as KeyframeEffect | null)?.getKeyframes() ?? [])
        .flatMap((frame) => Object.keys(frame)
          .filter((key) => !['offset', 'computedOffset', 'easing', 'composite'].includes(key))))].sort(),
    })),
  })))
  expect(blobs).toHaveLength(3)
  for (const blob of blobs) {
    expect(blob.animations.map((animation) => animation.name)).toEqual([expect.stringMatching(/^clr-drift-[a-d]$/), 'clr-breathe'])
    expect(blob.animations[0].properties).toEqual(['transform'])
    expect(blob.animations[1].properties).toEqual(['rotate', 'scale'])
  }
  await page.locator('.clr-atmosphere').evaluate((layer) => { (layer as HTMLElement).dataset.e2eMounted = 'once' })
  await expect(page.locator('[data-atmosphere]:not([data-atmosphere="full"])')).toHaveCount(0)

  // REQ-011: hold the shipped durations open so "mid-entry" is a state, not a race.
  await page.addStyleTag({ content: 'html:root { --dur-fast: 30s; --dur-base: 30s; }' })
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await reached(page, '/settings', 'Settings')
  await expect(page.locator('main')).toHaveClass(/\broute-enter-forward\b/)
  await page.goBack()
  // The new state does not queue behind the entry, and the old one is neither played out nor reversed.
  await reached(page, '/', 'Today')
  await expect(page.locator('main')).toHaveClass(/\broute-enter-back\b/)
  expect(await runningNames(page)).not.toContain('clr-shift-in-right')
  await expect(page.locator('.clr-atmosphere')).toHaveAttribute('data-e2e-mounted', 'once')

  // Tabs: an interrupted change cuts to the latest choice; input is never held.
  const recent = page.getByRole('tab', { name: 'Recent workouts', exact: true })
  const favorites = page.getByRole('tab', { name: 'Favorites', exact: true })
  await favorites.click()
  await recent.click()
  await expect(recent).toHaveAttribute('aria-selected', 'true')
  await expect(favorites).toHaveAttribute('aria-selected', 'false')
  await expect(page.getByRole('tabpanel')).toHaveCount(1)
  const entering = await page.evaluate(() => document.querySelectorAll('.clr-tab-enter').length)
  expect(entering, 'two tab entrances run at once').toBeLessThanOrEqual(1)

  // The keyboard drives the same tabs (the TabBar contract), so no destination needs a pointer.
  await recent.focus()
  await page.keyboard.press('ArrowRight')
  await expect(favorites).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(favorites).toHaveAttribute('aria-selected', 'true')

  // One interface loop at a time on the busiest screen; motion is never the only cue.
  await page.evaluate(() => document.querySelectorAll('style').forEach((style) => {
    if (style.textContent?.includes('--dur-fast: 30s')) style.remove()
  }))
  await visit(`/history/${done.session.id}`)
  await page.getByRole('button', { name: 'Restart', exact: true }).click()
  await reached(page, '/review', TITLE)
  await startWorkout(page)
  await settled(page)
  const loops = await page.evaluate(() => document.getAnimations()
    .filter((animation) => animation.playState === 'running' &&
      animation.effect?.getComputedTiming().iterations === Infinity &&
      !(animation.effect as KeyframeEffect | null)?.target?.closest('.clr-atmosphere'))
    .map((animation) => (animation as CSSAnimation).animationName))
  expect(loops.length, `more than one interface loop: ${loops.join(', ')}`).toBeLessThanOrEqual(1)
  // The session clock is a labelled, static readout, not only something that moves.
  await expect(page.getByRole('timer', { name: 'Session time', exact: true })).toHaveText(/\d/)
  // REQ-010: section navigation stays reachable on every viewport.
  const sectionTabs = page.getByRole('button', { name: /^(Standard|Ladder), / })
  await expect(sectionTabs).toHaveCount(2)
  for (const tab of await sectionTabs.all()) {
    await tab.scrollIntoViewIfNeeded()
    await expect(tab).toBeInViewport()
    await tab.click()
    await expect(tab).toHaveAttribute('aria-current', 'step')
  }
  // The Ladder's rungs are an OverflowRail: contained sideways, every rung reachable.
  const rail = await page.evaluate(() => {
    const scroller = [...document.querySelectorAll<HTMLElement>('main *')]
      .find((element) => /(auto|scroll)/.test(getComputedStyle(element).overflowX) && element.querySelector('[role="radio"], button'))
    if (!scroller) return null
    const rungs = [...scroller.querySelectorAll<HTMLElement>('[role="radio"], button')]
    const last = rungs.at(-1)!
    last.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const box = last.getBoundingClientRect()
    const frame = scroller.getBoundingClientRect()
    return {
      rungs: rungs.length,
      lastInside: box.left >= frame.left - 1 && box.right <= frame.right + 1,
      documentOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
  if (rail !== null) {
    expect(rail.rungs).toBeGreaterThan(0)
    expect(rail.lastInside, 'the last rung cannot be revealed').toBe(true)
    expect(rail.documentOverflowX).toBeLessThanOrEqual(0)
  }
  await expectContainedRoute(page, '/workout ladder')
})

backendTest('focus: brackets for selectable controls, fields own focus, on protected routes', async ({
  page, visit, world,
}) => {
  test.setTimeout(240_000)
  void world
  await visit('/settings')
  await reached(page, '/settings', 'Settings')
  await expect(page.locator('html')).toHaveAttribute('data-clr-focus', 'brackets')
  const kinds = await expectFocusOwnership(page, '/settings')
  expect([...kinds].sort()).toEqual(['brackets', 'field'])

  await visit('/generate')
  await reached(page, '/generate', 'Generate workout')
  expect((await expectFocusOwnership(page, '/generate')).has('brackets')).toBe(true)

  await visit('/settings/locations')
  await reached(page, '/settings/locations', 'Places and equipment')
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
  const kindsPlaces = await expectFocusOwnership(page, '/settings/locations editor')
  expect([...kindsPlaces].sort()).toEqual(['brackets', 'field'])
})

/**
 * The one named app-layer exception: `src/styles/a11y.css`'s forced-colours
 * rule. It is kept only because removing it reproduces the defect — the
 * vendor's bracket-mode `outline: none` outranks its own forced-colours rule.
 */
backendTest('forced colours: the app-layer repair is still required and still works', async ({
  page, visit, world,
}) => {
  test.setTimeout(180_000)
  void world
  await visit('/settings')
  await reached(page, '/settings', 'Settings')
  await page.emulateMedia({ forcedColors: 'active' })
  await expect.poll(() => page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true)

  const radio = page.getByRole('radio').first()
  const outline = async () => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.getByRole('heading', { level: 1 }).click()
    // Keyboard focus, so :focus-visible matches as it does for a person.
    await radio.evaluate((element) => (element as HTMLElement).focus({ focusVisible: true } as FocusOptions))
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    return page.evaluate(() => {
      const focused = document.activeElement as HTMLElement
      const style = getComputedStyle(focused)
      return {
        visible: focused.matches(':focus-visible'),
        outlineStyle: style.outlineStyle,
        outlineWidth: parseFloat(style.outlineWidth),
        brackets: getComputedStyle(document.querySelector('.clr-focus-brackets')!).display,
      }
    })
  }

  const repaired = await outline()
  expect(repaired.visible).toBe(true)
  expect(repaired.outlineStyle).not.toBe('none')
  expect(repaired.outlineWidth).toBeGreaterThan(0)
  expect(repaired.brackets).toBe('none')

  // Reproduce: drop only the app's forced-colours rule and the system ring disappears.
  const removed = await page.evaluate(() => {
    let count = 0
    for (const sheet of [...document.styleSheets]) {
      let rules: CSSRuleList
      try { rules = sheet.cssRules } catch { continue }
      for (let index = rules.length - 1; index >= 0; index -= 1) {
        const rule = rules[index]
        if (rule instanceof CSSMediaRule && rule.conditionText.includes('forced-colors') &&
          rule.cssText.includes('data-clr-focus') && rule.cssText.includes('!important')) {
          sheet.deleteRule(index)
          count += 1
        }
      }
    }
    return count
  })
  expect(removed, 'the app-layer forced-colours repair is not loaded').toBe(1)
  const vendorOnly = await outline()
  expect(vendorOnly.visible).toBe(true)
  expect(vendorOnly.outlineStyle, 'the vendor alone now restores the ring: retire the app-layer repair').toBe('none')
})

backendTest('dialog: native safety, phosphor and four-step backdrop, one callback, action layout', async ({
  page, visit, checkA11y, world,
}) => {
  test.setTimeout(240_000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const done = await world.completed()
  await visit(`/history/${done.session.id}`)
  await page.getByRole('button', { name: 'Restart', exact: true }).click()
  await reached(page, '/review', TITLE)
  await startWorkout(page)
  await settled(page)
  const trigger = page.locator('header').getByRole('button', { name: 'Abandon', exact: true })
  const dialog = page.getByRole('dialog', { name: 'Abandon workout?' })
  await page.locator('dialog.clr-dialog').evaluateAll((elements) => elements.forEach((element) => {
    (element as HTMLElement).dataset.closes = '0'
    element.addEventListener('close', () => {
      const host = element as HTMLElement
      host.dataset.closes = String(Number(host.dataset.closes) + 1)
    })
  }))

  // By keyboard, from the trigger. A press that lands while the route is still
  // committing a prior state is pressed again rather than waited out.
  const open = async () => {
    await expect(async () => {
      if (!(await dialog.isVisible())) await trigger.press('Enter')
      await expect(dialog).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 10_000 })
  }
  await open()
  const arrival = await dialog.evaluate((element) => ({
    modal: element.matches(':modal'),
    backdrop: (() => {
      const style = getComputedStyle(element, '::backdrop')
      return { name: style.animationName, duration: style.animationDuration, timing: style.animationTimingFunction }
    })(),
    panel: getComputedStyle(element.querySelector(':scope > .clr-bleed')!).animationName,
    focused: (document.activeElement?.textContent ?? '').trim(),
    // Inert background: a point on the screen lands on the dialog, not the page.
    hit: (() => {
      const heading = document.querySelector('main h1')!.getBoundingClientRect()
      const at = document.elementFromPoint(heading.left + 2, heading.top + 2)
      return at === null ? 'none' : element.contains(at) || at === element ? 'dialog' : 'page'
    })(),
  }))
  expect(arrival.modal).toBe(true)
  expect(arrival.backdrop).toEqual({ name: 'clr-fade-in', duration: '0.2s', timing: 'steps(4)' })
  expect(arrival.panel).toBe('clr-phosphor-in')
  // Safe initial DOM focus: showModal lands on the first action, which is the safe one.
  expect(arrival.focused).toBe('Keep going')
  expect(arrival.hit).toBe('dialog')
  await checkA11y()

  // Actions: stacked full width with the main action on top on a phone; an equal row, main right, from 560px.
  const actions = await dialog.locator('.clr-actions').evaluate((row) => {
    const buttons = [...row.querySelectorAll<HTMLElement>('.clr-btn')]
    const box = (name: string) => buttons.find((button) => button.textContent?.trim() === name)!.getBoundingClientRect()
    const main = box('Abandon')
    const safe = box('Keep going')
    return { rowWidth: row.getBoundingClientRect().width, main: { x: main.x, y: main.y, w: main.width },
      safe: { x: safe.x, y: safe.y, w: safe.width }, wide: window.innerWidth >= 560 }
  })
  if (actions.wide) {
    expect(actions.main.y).toBeCloseTo(actions.safe.y, 0)
    expect(actions.main.x).toBeGreaterThan(actions.safe.x)
    expect(actions.main.w).toBeCloseTo(actions.safe.w, 0)
  } else {
    expect(actions.main.y).toBeLessThan(actions.safe.y)
    expect(actions.main.w).toBeCloseTo(actions.rowWidth, 0)
    expect(actions.safe.w).toBeCloseTo(actions.rowWidth, 0)
  }

  // A destructive dialog is not dismissed by a stray backdrop tap.
  await page.mouse.click(2, 2)
  await expect(dialog).toBeVisible()

  // Esc: the component-owned exit plays, one close is reported, focus returns, state is kept.
  await page.keyboard.press('Escape')
  await expect(page.locator('dialog.clr-dialog--closing')).toHaveCount(1)
  await expect(page.locator('dialog.clr-dialog--closing')).toHaveCount(0)
  await expect(dialog).toBeHidden()
  const closes = () => page.locator('dialog.clr-dialog').first().getAttribute('data-closes')
  await expect.poll(closes).toBe('1')
  await expect(trigger).toBeFocused()
  await expect(page).toHaveURL((url) => url.pathname === '/workout')

  // Reopen straight after: a fresh open, and still exactly one close per dismissal.
  await open()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect.poll(closes).toBe('2')
  await expect(trigger).toBeFocused()

  // Reduced motion: the same Esc closes at once, with no exit left to wait on.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open()
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => [...document.querySelectorAll('dialog')].some((d) => d.open))).toBe(false)
  await expect(page.locator('dialog.clr-dialog--closing')).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await page.emulateMedia({ reducedMotion: 'no-preference' })

  // Code close: the main action closes it and leaves the route.
  await open()
  await dialog.getByRole('button', { name: 'Abandon', exact: true }).click()
  await reached(page, '/', 'Today')
})

backendTest('toast: assertive failure overlays without obstruction, dismisses by keyboard and returns focus', async ({
  page, visit, world,
}) => {
  test.setTimeout(180_000)
  void world
  await page.route('**/rest/v1/profiles*', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.method() !== 'PATCH') return route.fallback()
    return route.fulfill({ status: 503, headers: CORS,
      json: { code: 'PGRST000', message: 'Controlled TASK-026 save failure.' } })
  })
  await visit('/settings')
  await reached(page, '/settings', 'Settings')
  const region = page.locator('.clr-scroll-region')
  const footBefore = await region.evaluate((element) => getComputedStyle(element).getPropertyValue('--foot-h'))
  // With no toast the host renders nothing at all: no permanent obstruction.
  await expect(page.locator('[data-clear-toast-host]')).toHaveCount(0)

  const choice = page.getByRole('radio', { name: /^Confident/ })
  await choice.click()
  const toast = page.getByRole('alert').filter({ has: page.getByRole('button', { name: 'Dismiss', exact: true }) })
  await expect(toast).toBeVisible()
  await expect(toast).toHaveAttribute('aria-live', 'assertive')
  // Recovery context: the rollback is real and said in words, with a glyph beside it.
  await expect(page.getByRole('radio', { name: /^Some experience/ })).toHaveAttribute('aria-checked', 'true')
  await expect(toast.locator('svg[aria-hidden="true"]').first()).toBeAttached()
  expect(await toast.innerText()).not.toBe('')

  const overlay = await page.locator('[data-clear-toast-host]').evaluate((host) => {
    const style = getComputedStyle(host)
    const inner = host.querySelector('[role="alert"]')!
    return { position: style.position, animation: getComputedStyle(inner).animationName,
      inFlow: host.closest('.clr-scroll-region') !== null, focusInside: host.contains(document.activeElement) }
  })
  // The 0.14.3 rule: a temporary overlay above the screen, arriving by phosphor, never stealing focus.
  expect(overlay).toEqual({ position: 'fixed', animation: 'clr-phosphor-in', inFlow: false, focusInside: false })
  expect(await region.evaluate((element) => getComputedStyle(element).getPropertyValue('--foot-h'))).toBe(footBefore)

  // Keyboard: reach Dismiss from the action, dismiss, and land back on the action.
  await choice.focus()
  const dismiss = toast.getByRole('button', { name: 'Dismiss', exact: true })
  let reachedDismiss = false
  for (let press = 0; press < 80 && !reachedDismiss; press += 1) {
    await page.keyboard.press('Tab')
    reachedDismiss = await dismiss.evaluate((element) => element === document.activeElement)
  }
  expect(reachedDismiss, 'the keyboard cannot reach the toast').toBe(true)
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-clear-toast-host]')).toHaveCount(0)
  // Focus is handed back to a real control in main, never dropped to the document.
  expect(await page.evaluate(() => document.activeElement !== document.body &&
    document.querySelector('main')?.contains(document.activeElement) === true)).toBe(true)

  // A positive outcome waits for a gap in speech: the real save says so politely, in place.
  await page.unroute('**/rest/v1/profiles*')
  await choice.click()
  const training = page.getByRole('region', { name: 'Training', exact: true })
  const saved = training.getByRole('status')
  await expect(saved).toHaveText('Saved')
  expect(await saved.getAttribute('aria-live')).not.toBe('assertive')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(choice).toHaveAttribute('aria-checked', 'true')
})
