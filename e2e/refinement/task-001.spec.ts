import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Locator, Page, Route, TestInfo } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { reviewHandoff } from '../../src/state/review-handoff'
import { sessionSnapshotSchema, type SessionAcceptance } from '../../src/state/schemas'
import {
  makeGenerationOutput,
  makePrescription,
  makeSessionAcceptance,
  makeWorkoutBlock,
} from '../../src/test/factories'
import { anchorRow, evidenceRows } from '../../src/test/load-suggestion-fixtures'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { definitionFixture, snapshotFixture } from '../../src/test/workout-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * REQ-001 / TASK-001 — JOURNEY-001 on the production `/review` and `/workout`
 * routes: one shared movement hierarchy (MovementIdentity / MovementList /
 * MovementGroupHeader, accepted gallery reference eded158,
 * `/gallery/refinements?state=cards`, V03 → V04).
 *
 *   AC-C01-01  prominent name; readable prescription/load; quiet equipment;
 *              actions/progress in their own slot.
 *   AC-C02-01  no Last-performance row, prescribed load still on the card.
 *   AC-C04-01  separators only between peers; no inner rail or final rule.
 *   AC-R001-01 the same on standard, superset and circuit cards, with the
 *              load history still reachable where progress is explained.
 *   AC-R001-02 long names and multi-digit ordinals wrap without covering
 *              targets/actions at phone, tablet and desktop widths.
 *
 * Every request is answered here; nothing is forwarded, no model is called
 * and nothing is written — Review is only read, and on Workout no set is
 * logged. Data is synthetic and non-personal.
 */
const OWNER = '00000000-0000-4000-8000-000000000a01'
const PLACE = '00000000-0000-4000-8000-000000000a11'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}

const VIEWPORTS = [
  { name: 'phone-390', viewport: { width: 390, height: 844 } },
  { name: 'tablet-768', viewport: { width: 768, height: 1024 } },
  { name: 'desktop-1280', viewport: { width: 1280, height: 900 } },
] as const

const LONG = 'single-arm-kettlebell-overhead-reverse-lunge-with-a-pause-at-the-bottom'
const LONG_PAIR = 'alternating-dumbbell-renegade-row-to-push-up-with-a-pause'
const CIRCUIT = [
  'mountain-climber', 'squat-jump', 'bear-crawl', 'burpee', 'jumping-jack',
  'skater-hop', 'high-knee', 'plank-jack', 'lateral-shuffle',
  'mountain-climber-cross-body-knee-drive-with-shoulder-tap',
]
const human = (id: string) => id.replaceAll('-', ' ')
const today = new Date().toISOString().slice(0, 10)

// ─────────────────────────────────────────────────────────────────────────────
// Review: a loaded standalone lift with load history, a standard pair, a
// superset and a ten-member circuit.
// ─────────────────────────────────────────────────────────────────────────────

const REVIEW: SessionAcceptance = (() => {
  const base = makeGenerationOutput()
  const block = (structure_type: 'standard' | 'superset' | 'circuit', exercises: ReturnType<typeof makePrescription>[],
    rounds: number | null = null) => makeWorkoutBlock({
    structure_type, rep_scheme: 'fixed', rounds, round_rest_seconds: rounds === null ? null : 60, exercises,
  })
  return makeSessionAcceptance({
    date: today, location_id: PLACE, goal_preset: 'balanced',
    workout: {
      ...base,
      title: 'Synthetic TASK-001 review',
      sections: [{
        section_type: 'primary_lift', section_title: 'Primary lift', section_notes: null,
        blocks: [block('standard', [makePrescription({
          exercise_id: 'back-squat', equipment: 'barbell', session_function: 'primary', sets: 3, target_value: 5,
          load_type: 'absolute', load_value: 60, rest_seconds: 180,
        })])],
      }, {
        section_type: 'accessory', section_title: 'Accessory', section_notes: null,
        blocks: [
          block('standard', [
            makePrescription({ exercise_id: 'goblet-squat', equipment: 'dumbbell', session_function: 'accessory',
              sets: 3, target_value: 10, load_type: 'absolute', load_value: 20, rest_seconds: 60 }),
            makePrescription({ exercise_id: LONG, equipment: 'kettlebell', session_function: 'accessory',
              sets: 3, target_value: 8, load_type: 'absolute', load_value: 16, rest_seconds: 60 }),
          ]),
          block('superset', [
            makePrescription({ exercise_id: LONG_PAIR, equipment: 'dumbbell', session_function: 'accessory',
              sets: 3, target_value: 8, load_type: 'absolute', load_value: 12, rest_seconds: 0 }),
            makePrescription({ exercise_id: 'bicep-curl', equipment: 'dumbbell', session_function: 'accessory',
              sets: 3, target_value: 12, load_type: 'absolute', load_value: 10, rest_seconds: 0 }),
          ], 3),
        ],
      }, {
        section_type: 'conditioning', section_title: 'Conditioning', section_notes: null,
        blocks: [block('circuit', CIRCUIT.map((exercise_id) => makePrescription({
          exercise_id, equipment: 'bodyweight', load_type: 'bodyweight', load_value: null,
          sets: 2, target_value: 10, rest_seconds: 0,
        })), 2)],
      }],
    },
  } as Parameters<typeof makeSessionAcceptance>[0])
})()

/** The load history behind the squat's suggestion: retained, not drawn on the card. */
const ANCHOR = anchorRow({ user_id: OWNER, exercise_id: 'back-squat', equipment_used: 'barbell', anchor_value: 62.5 })
const EVIDENCE = evidenceRows()

// ─────────────────────────────────────────────────────────────────────────────
// Workout: standard, superset and circuit cards in one section.
// ─────────────────────────────────────────────────────────────────────────────

const WORKOUT = sessionSnapshotSchema.parse(snapshotFixture({
  userId: OWNER,
  title: 'Synthetic TASK-001 workout',
  startedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  session: { location_id: PLACE, goal_preset: 'balanced' },
  sections: [{ title: 'Accessory', sectionType: 'accessory', blocks: [
    { structureType: 'standard', exercises: [
      { prescription: { exercise_id: LONG, order_index: 0, equipment_used: 'kettlebell', sets: 3, target_value: 8,
        load_type: 'absolute', load_value: 16, rest_seconds: 60 } },
      { prescription: { exercise_id: 'goblet-squat', order_index: 1, equipment_used: 'dumbbell', sets: 3,
        target_value: 10, load_type: 'absolute', load_value: 20, rest_seconds: 60 } },
    ] },
    { structureType: 'superset', rounds: 3, roundRestSeconds: 60, exercises: [
      { prescription: { exercise_id: LONG_PAIR, order_index: 0, equipment_used: 'dumbbell', sets: 3, target_value: 8,
        load_type: 'absolute', load_value: 12, rest_seconds: null } },
      { prescription: { exercise_id: 'bicep-curl', order_index: 1, equipment_used: 'dumbbell', sets: 3,
        target_value: 12, load_type: 'absolute', load_value: 10, rest_seconds: null } },
    ] },
    { structureType: 'circuit', rounds: 2, roundRestSeconds: 30, exercises: CIRCUIT.map((exercise_id, order_index) => ({
      prescription: { exercise_id, order_index, equipment_used: 'bodyweight', load_type: 'bodyweight' as const,
        load_value: null, sets: 2, target_value: 10, rest_seconds: null },
    })) },
  ] }],
}))
const WORKOUT_EXERCISES = WORKOUT.sections.flatMap((section) => section.blocks
  .flatMap((block) => block.exercises.map(({ exercise }) => exercise)))

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app
// ─────────────────────────────────────────────────────────────────────────────

const e2e = readE2eEnv()
const SYNTHETIC_ORIGIN_NEEDED = !e2e.usesExternalTarget && (e2e.url === null || e2e.anonKey === null)

async function waitForOrigin(origin: string, deadline: number) {
  while (Date.now() < deadline) {
    try {
      if ((await fetch(origin)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-001 origin ${origin} did not start`)
}

/** As the B05 specs: a bundle with non-secret placeholders when no public URL is configured. */
const test = scanned.extend<object, { syntheticOrigin: string | null }>({
  syntheticOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      if (!SYNTHETIC_ORIGIN_NEEDED) return use(null)
      const port = 5760 + workerInfo.parallelIndex
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [
        resolve(import.meta.dirname, '../../node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort',
      ], {
        env: {
          ...process.env,
          VITE_SUPABASE_URL: 'https://synthetic-task-001.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-001-public-placeholder',
        },
        stdio: 'ignore',
      })
      const closed = new Promise<void>((settle) => {
        server.once('exit', () => settle())
        server.once('error', () => settle())
      })
      try {
        await waitForOrigin(origin, Date.now() + 90_000)
        await use(origin)
      } finally {
        server.kill()
        await closed
      }
    },
    { scope: 'worker', timeout: 120_000 },
  ],
  baseURL: async ({ baseURL, syntheticOrigin }, use) => use(syntheticOrigin ?? baseURL),
})

async function syntheticApp(page: Page, mode: 'review' | 'workout') {
  const unexpected: string[] = []
  let writes = 0
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
  await page.route('**/*', (route) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.continue()
    unexpected.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
    return route.abort('blockedbyclient')
  })
  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const last = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/')) {
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (request.method() === 'GET') {
      if (last === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'balanced' })])
      if (last === 'locations') return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full', is_default: true })])
      if (last === 'load_anchors') return reply(mode === 'review' ? [ANCHOR] : [])
      if (last === 'exercise_definitions') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        return reply(mode === 'workout'
          ? WORKOUT_EXERCISES.filter((exercise) => id === undefined || exercise.exercise_id === id)
            .map((exercise) => definitionFixture({ id: exercise.exercise_id }))
          : [])
      }
      if (last === 'workout_exercises') return reply(mode === 'workout' ? WORKOUT_EXERCISES : [])
      if (['workout_sessions', 'rest_days', 'location_equipment', 'saved_workouts', 'saved_workout_attempts',
        'saved_workout_completions', 'user_constraints', 'block_results'].includes(last)) return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (last === 'resume_session' || last === 'session_snapshot') return reply(mode === 'workout' ? WORKOUT : null)
      if (last === 'session_as_performed') return reply(null)
      if (last === 'anchor_evidence') {
        return reply(mode === 'review' ? EVIDENCE.map((row) => ({ ...row, equipment_used: 'barbell' })) : [])
      }
      if (last === 'generation_candidate_sets_for_goal') return reply([])
      if (['streak_sessions', 'constraints_in_force', 'conditioning_history'].includes(last)) return reply([])
    }
    if (request.method() !== 'GET') writes += 1
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-001 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-001-session', refreshToken: 'synthetic-task-001-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-001@example.invalid' },
    }))
  }, { owner: OWNER })
  return {
    assertContained() {
      expect(unexpected, 'Every request has an explicit synthetic disposition').toEqual([])
      expect(writes, 'Nothing is written to capture this reference').toBe(0)
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)))
    await document.fonts.ready
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the screen
// ─────────────────────────────────────────────────────────────────────────────

type Box = { left: number; top: number; right: number; bottom: number }

interface PeerList {
  label: string
  items: number
  /** Bottom border of each item, in order. */
  rules: number[]
  /** Rule lies between this peer and the next. */
  between: boolean[]
  /** Any element from the list up to its card, or inside it, drawing a tall inline-edge line. */
  rails: string[]
}

interface Identity {
  name: string
  nameBoxes: Box[]
  ordinal: string | null
  equipment: string | null
  equipmentInsideHeading: boolean
  prescription: string[]
  load: string | null
  slot: { kind: 'action' | 'counter'; box: Box } | null
  nameSize: number
  nameWeight: number
  detailSize: number
  equipmentSize: number | null
  nameColor: string
  equipmentColor: string | null
  identityBox: Box
  overflowX: boolean
}

async function readCards(main: Locator) {
  return main.evaluate((root) => {
    const box = (rect: DOMRect) => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom })
    const px = (value: string) => parseFloat(value) || 0
    const lists: PeerList[] = Array.from(root.querySelectorAll<HTMLOListElement>('ol.clr-movement-list')).map((list) => {
      const items = Array.from(list.children) as HTMLElement[]
      const rules = items.map((item) => px(getComputedStyle(item).borderBottomWidth))
      const between = items.slice(0, -1).map((item, index) => {
        const ruleY = item.getBoundingClientRect().bottom
        return ruleY <= items[index + 1].getBoundingClientRect().top + 0.5
      })
      const rails: string[] = []
      const listHeight = list.getBoundingClientRect().height
      const tall = (element: Element) => element.getBoundingClientRect().height >= listHeight * 0.5
      const edge = (element: Element) => {
        const style = getComputedStyle(element)
        return px(style.borderLeftWidth) > 0 || px(style.borderRightWidth) > 0
      }
      // Up from the list to its card frame…
      for (let node = list as Element | null; node && node !== root; node = node.parentElement) {
        if (node.matches('.clr-card, [class*="clr-card"], section.clr-card')) break
        if (edge(node) && tall(node)) rails.push(`${node.tagName.toLowerCase()}.${node.className}`)
      }
      // …and anything inside it.
      for (const node of Array.from(list.querySelectorAll('*'))) {
        if (edge(node) && tall(node) && !node.closest('button')) rails.push(`${node.tagName.toLowerCase()}.${node.className}`)
      }
      return { label: list.getAttribute('aria-label') ?? '', items: items.length, rules, between, rails }
    })

    const identities: Identity[] = Array.from(root.querySelectorAll<HTMLElement>('[data-movement-identity]')).map((identity) => {
      const nameElement = identity.querySelector<HTMLElement>('.clr-movement-identity__name')!
      const range = document.createRange()
      range.selectNodeContents(nameElement)
      const equipment = identity.querySelector<HTMLElement>('[data-movement-context]')
      const detail = identity.querySelector<HTMLElement>('[data-movement-detail]')
      const action = identity.querySelector<HTMLElement>('.clr-movement-identity__action')
      const counter = identity.querySelector<HTMLElement>('.clr-movement-identity__counter')
      const slot = action ? { kind: 'action' as const, box: box(action.getBoundingClientRect()) }
        : counter ? { kind: 'counter' as const, box: box(counter.getBoundingClientRect()) } : null
      const ordinal = identity.querySelector('.clr-movement-identity__ordinal')?.textContent?.trim() ?? null
      const ordinalNode = nameElement.querySelector('.clr-movement-identity__ordinal')
      const name = Array.from(nameElement.childNodes).filter((node) => node !== ordinalNode)
        .map((node) => node.textContent).join('').trim()
      return {
        name,
        nameBoxes: Array.from(range.getClientRects()).filter((rect) => rect.width > 0).map(box),
        ordinal,
        equipment: equipment?.textContent?.trim() ?? null,
        equipmentInsideHeading: equipment !== null && nameElement.contains(equipment),
        prescription: detail ? Array.from(detail.children).map((span) => span.textContent?.trim() ?? '') : [],
        load: detail?.querySelector('[data-movement-load]')?.textContent?.trim() ?? null,
        slot,
        nameSize: px(getComputedStyle(nameElement).fontSize),
        nameWeight: px(getComputedStyle(nameElement).fontWeight),
        detailSize: detail ? px(getComputedStyle(detail).fontSize) : 0,
        equipmentSize: equipment ? px(getComputedStyle(equipment).fontSize) : null,
        nameColor: getComputedStyle(nameElement).color,
        equipmentColor: equipment ? getComputedStyle(equipment).color : null,
        identityBox: box(identity.getBoundingClientRect()),
        overflowX: identity.scrollWidth > identity.clientWidth + 1,
      }
    })
    return { lists, identities }
  })
}

const overlaps = (a: Box, b: Box) =>
  a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1

function expectPeerLists(lists: PeerList[], context: string) {
  expect(lists.length, `${context}: peer lists drawn`).toBeGreaterThan(0)
  for (const list of lists) {
    const label = `${context} · ${list.label}`
    expect(list.items, label).toBeGreaterThanOrEqual(2)
    // A rule after every peer but the last, and none after the last.
    list.rules.slice(0, -1).forEach((width, index) => expect(width, `${label} rule after peer ${index + 1}`).toBeGreaterThan(0))
    expect(list.rules.at(-1), `${label}: no final-item rule`).toBe(0)
    list.between.forEach((between, index) => expect(between, `${label} rule ${index + 1} lies between peers`).toBe(true))
    expect(list.rails, `${label}: no inner grouping rail`).toEqual([])
  }
}

function expectHierarchy(identities: Identity[], context: string) {
  expect(identities.length, `${context}: movements drawn`).toBeGreaterThan(0)
  for (const identity of identities) {
    const label = `${context} · ${identity.ordinal ?? ''} ${identity.name}`
    // Prominent name; readable prescription one step below; quiet equipment.
    expect(identity.nameWeight, label).toBeGreaterThanOrEqual(700)
    expect(identity.nameSize, label).toBeGreaterThan(identity.detailSize)
    expect(identity.detailSize, label).toBeGreaterThan(0)
    expect(identity.prescription.length, `${label}: prescription`).toBeGreaterThan(0)
    if (identity.equipment !== null) {
      expect(identity.equipmentSize!, label).toBeLessThan(identity.nameSize)
      expect(identity.equipmentColor, `${label}: equipment is quieter than the name`).not.toBe(identity.nameColor)
      expect(identity.equipmentInsideHeading, `${label}: equipment beside, not inside, the name`).toBe(false)
    }
    // Actions/progress keep their own slot; the wrapped name never runs under it.
    if (identity.slot !== null) {
      for (const nameBox of identity.nameBoxes) {
        expect(overlaps(nameBox, identity.slot.box), `${label}: name clear of its ${identity.slot.kind}`).toBe(false)
      }
      expect(identity.slot.box.right, `${label}: ${identity.slot.kind} inside the row`).toBeLessThanOrEqual(identity.identityBox.right + 1)
    }
    expect(identity.overflowX, `${label}: nothing overflows the row`).toBe(false)
  }
}

function record(testInfo: TestInfo, id: string, entry: Record<string, unknown>) {
  const file = testInfo.outputPath(`${id}.json`)
  writeFileSync(file, JSON.stringify({
    task: 'TASK-001', requirement: 'REQ-001', journey: 'JOURNEY-001',
    reference: { commit: 'eded158cfd928d382c9a9409e2c372270312741d', state: '/gallery/refinements?state=cards', visuals: ['V03', 'V04'] },
    ...entry,
  }, null, 2))
  return testInfo.attach(`${id}.json`, { path: file, contentType: 'application/json' })
}

const CRITERIA = 'AC-C01-01 AC-C02-01 AC-C04-01 AC-R001-01 AC-R001-02'

for (const { name: size, viewport } of VIEWPORTS) {
  test.describe(`TASK-001 /review @ ${size}`, () => {
    test.use({ viewport })

    test(`${CRITERIA}: shared hierarchy, peer-only separators, no rail, no Last-performance row, history retained`, async ({ page, visit, checkA11y }, testInfo) => {
      const app = await syntheticApp(page, 'review')
      // ENTRY-001: Review is entered as the product enters it — Home, then the handoff.
      await visit('/')
      await page.evaluate((handoff) => {
        history.pushState({ usr: handoff, key: 'synthetic-task-001', idx: 1 }, '', '/review')
        dispatchEvent(new PopStateEvent('popstate', { state: history.state }))
      }, reviewHandoff(REVIEW))
      await expect(page).toHaveURL(/\/review$/)
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(REVIEW.workout.title)
      const main = page.locator('main')
      const squat = main.locator('[data-movement-identity]').filter({ hasText: 'back squat' })
      // The suggestion settles from the history reads; wait for it rather than a delay.
      await expect(main.getByRole('button', { name: /suggest/i }).first()).toBeVisible()
      await settle(page)
      await checkA11y()

      const { lists, identities } = await readCards(main)
      expectPeerLists(lists, `review ${size}`)
      expectHierarchy(identities, `review ${size}`)

      // Standard pair, superset and circuit are each one peer list.
      expect(lists.map((list) => list.label)).toEqual(expect.arrayContaining([
        'Movements in this block', 'superset, 3 rounds', 'circuit, 2 rounds',
      ]))
      // Review's Swap is each movement's action slot; no live progress counter here.
      expect(identities.every((identity) => identity.slot?.kind === 'action')).toBe(true)

      // C02: prescribed load beside the prescription, and no Last-performance row.
      const lift = identities.find((identity) => identity.name === 'back squat')!
      expect(lift.prescription).toEqual(['3 × 5 reps', '60 kg', 'Rest 180s'])
      expect(lift.load).toBe('60 kg')
      expect(lift.equipment).toBe('barbell')
      expect(identities.find((identity) => identity.name === 'goblet squat')!.load).toBe('20 kg')
      expect(await main.innerText()).not.toMatch(/\bLast\s*(:|performance|performed|session)/i)
      await expect(squat).not.toContainText('Last')

      // AC-R001-02: the long names and the two-digit ordinal wrap beside, never under, Swap.
      const long = identities.find((identity) => identity.name === human(LONG))!
      const tenth = identities.find((identity) => identity.ordinal === '10')!
      expect(tenth.name).toBe(human(CIRCUIT[9]))
      if (size === 'phone-390') {
        expect(long.nameBoxes.length, 'long name wraps at phone width').toBeGreaterThan(1)
        expect(tenth.nameBoxes.length, 'long circuit name wraps at phone width').toBeGreaterThan(1)
      }
      for (const wrapped of [long, tenth]) {
        expect(wrapped.slot!.kind).toBe('action')
        await expect(main.getByRole('button', { name: `Swap ${wrapped.name}`, exact: false }).first()).toBeVisible()
      }

      // History is retained where progress is explained, not on the card.
      await main.getByRole('button', { name: /suggest/i }).first().click()
      const dialog = page.getByRole('dialog', { name: 'Why this number' })
      await expect(dialog).toBeVisible()
      await expect(dialog).toContainText(`Last session · ${EVIDENCE[0].session_date}`)
      await expect(dialog).toContainText('85 kg')
      await checkA11y()
      await dialog.getByRole('button', { name: 'Close' }).first().click()
      await expect(dialog).toBeHidden()
      await expect(squat).not.toContainText('Last')

      await record(testInfo, `review-${size}`, {
        route: '/review', viewport, entry: 'ENTRY-001 Home → Review handoff',
        lists, identities: identities.map(({ name, ordinal, equipment, prescription, load, slot, nameBoxes }) =>
          ({ name, ordinal, equipment, prescription, load, slot: slot?.kind ?? null, nameLines: nameBoxes.length })),
      })
      app.assertContained()
    })
  })

  test.describe(`TASK-001 /workout @ ${size}`, () => {
    test.use({ viewport })

    test(`${CRITERIA}: standard, superset and circuit cards share the hierarchy with peer-only separators and the prescribed load`, async ({ page, visit }, testInfo) => {
      const app = await syntheticApp(page, 'workout')
      await visit('/workout')
      const content = page.locator('main#main > .clr-scroll-region > .clr-scroll-region__scroller')
      await expect(content.getByRole('heading', { name: human(LONG), exact: true })).toBeVisible()
      await settle(page)

      const { lists, identities } = await readCards(content)
      expectPeerLists(lists, `workout ${size}`)
      expectHierarchy(identities, `workout ${size}`)
      expect(lists.map((list) => list.label)).toEqual(expect.arrayContaining([
        'Movements in this block', 'Movements in this superset', 'Movements in this circuit',
      ]))
      // The shared group header leads each card.
      await expect(content.locator('[data-movement-group-header]')).toHaveCount(3)

      // Live progress is the counter slot on logged movements; Workout draws no Swap.
      expect(await content.getByRole('button', { name: /^Swap\b/ }).count()).toBe(0)
      const long = identities.find((identity) => identity.name === human(LONG))!
      expect(long.slot?.kind).toBe('counter')
      expect(long.load).toBe('16 kg')
      expect(long.equipment).toBe('kettlebell')
      expect(identities.find((identity) => identity.name === `A1 ${human(LONG_PAIR)}` ||
        identity.name.endsWith(human(LONG_PAIR)))!.load).toBe('12 kg')
      // Bodyweight is said once, by the equipment; the circuit's ten peers keep their targets.
      const circuit = identities.filter((identity) => identity.equipment === 'bodyweight')
      expect(circuit).toHaveLength(CIRCUIT.length)
      expect(circuit.every((identity) => identity.load === null && identity.prescription.length > 0)).toBe(true)
      if (size === 'phone-390') expect(long.nameBoxes.length, 'long name wraps at phone width').toBeGreaterThan(1)

      // C02: no Last-performance row on any card.
      expect(await content.innerText()).not.toMatch(/\bLast\s*(:|performance|performed|session)/i)

      await record(testInfo, `workout-${size}`, {
        route: '/workout', viewport, entry: 'ENTRY-001 resumed active session',
        lists, identities: identities.map(({ name, equipment, prescription, load, slot, nameBoxes }) =>
          ({ name, equipment, prescription, load, slot: slot?.kind ?? null, nameLines: nameBoxes.length })),
      })
      app.assertContained()
    })
  })
}
