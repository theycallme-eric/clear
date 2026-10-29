import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { basename, resolve } from 'node:path'
import type { Locator, Page, Route, TestInfo } from '@playwright/test'

import { readE2eEnv } from '../scripts/e2e/env.mjs'
import { reviewHandoff } from '../src/state/review-handoff'
import { sessionReconstructionSchema, sessionSnapshotSchema, type SessionAcceptance } from '../src/state/schemas'
import {
  makePrescription, makeSessionAcceptance, makeSessionRow, makeStructureSpectrumWorkout, makeWorkoutBlock,
} from '../src/test/factories'
import { fixtureLocation, onboardedProfile } from '../src/test/user-data-double'
import {
  definitionFixture, reconstructionFixture, snapshotFixture, type SectionFixture,
} from '../src/test/workout-double'
import { installDeterministicCapture } from './design-0143/fixtures'
import { expect, test as scanned } from './fixtures'

/**
 * UI polish batch 05 — content-hugging structure badges (REQ-009, TASK-009,
 * JOURNEY-012).
 *
 * B05-04's left pane is the defect: `CIRCUIT · 2 ROUNDS` sits in a frame that
 * hugs the label, but its emitted outline runs on across the whole unused
 * group width. The selected right pane frames the label alone. The outline is
 * the `.clr-bleed` wrapper's `::before`, so it is as wide as the wrapper, and a
 * flex-column parent stretches that wrapper even though it is inline-flex.
 *
 * Every case renders a production route at a phone viewport and checks every
 * `StructureBadge` on it, in its actual row or column parent:
 * - geometry: wrapper, emission and frame are one box, the width of glyph plus
 *   label plus padding, contained in the parent (long labels wrap inside);
 * - pixels: in the actual capture, the structure stroke runs along the frame's
 *   own top edge and is absent from the unused span beside it;
 * - roles: the enclosing card and any full-width action frame still fill
 *   their container — only the badge hugs.
 *
 * Data is synthetic and intercepted for a fictional user: no writes, no model
 * calls, no real account. None of this is an installed-iPhone result.
 */
const OWNER = '00000000-0000-4000-8000-000000000009'
const PLACE = '00000000-0000-4000-8000-000000000091'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}

/** Same reasoning as the B05 shell spec: placeholders on `.invalid`, never forwarded. */
const e2e = readE2eEnv()
const SYNTHETIC_ORIGIN_NEEDED = !e2e.usesExternalTarget && (e2e.url === null || e2e.anonKey === null)
const REPO_ROOT = resolve(import.meta.dirname, '..')

/** A port nothing on this machine is listening on — not a fixed range another checkout may hold. */
function freePort() {
  return new Promise<number>((settle, fail) => {
    const probe = createServer()
    probe.once('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => settle(port))
    })
  })
}

/** Ready only when the server answering is this checkout's own (`/@fs/` is rooted in it). */
async function waitForOrigin(origin: string, deadline: number, exited: () => number | null) {
  const own = `${origin}/@fs${resolve(REPO_ROOT, 'package.json')}`
  while (Date.now() < deadline) {
    const code = exited()
    if (code !== null) throw new Error(`Synthetic structure-badge server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic structure-badge origin ${origin} did not start`)
}

const test = scanned.extend<object, { syntheticOrigin: string | null }>({
  syntheticOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      if (!SYNTHETIC_ORIGIN_NEEDED) return use(null)
      const port = await freePort()
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [
        resolve(REPO_ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort',
      ], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          VITE_SUPABASE_URL: 'https://synthetic-b05-structure-badges.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-b05-structure-badges-public-placeholder',
        },
        stdio: 'ignore',
      })
      let exitCode: number | null = null
      server.once('exit', (code) => { exitCode = code ?? -1 })
      try {
        await waitForOrigin(origin, Date.now() + 90_000, () => exitCode)
        await use(origin)
      } finally {
        server.kill()
      }
    },
    { scope: 'worker', timeout: 120_000 },
  ],
  baseURL: async ({ baseURL, syntheticOrigin }, use) => use(syntheticOrigin ?? baseURL),
  checkA11y: async ({ page, checkA11y }, use) => {
    await use(async () => {
      const path = new URL(page.url()).pathname
      const heading = path === '/review' ? REVIEW.workout.title
        : path === '/workout' ? 'Workout'
        : path === `/history/${DONE_ID}` ? DONE.title
        : path === '/settings/formats' ? 'Workout formats' : null
      if (heading === null) throw new Error(`No actual-route readiness contract for ${path}`)
      // Boot also owns an h1, and Workout has a loading screen with its final
      // title. Require the actual destination and badge content before the
      // standing fixture's first complete accessibility assertion.
      await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible()
      await expect(page.locator('main#main').locator(BADGE).first()).toBeVisible()
      await checkA11y()
    })
  },
})

type Viewport = { width: number; height: number }
/** The portrait phone B05 was captured on, and the narrowest supported one. */
const VIEWPORTS: ReadonlyArray<{ name: string; viewport: Viewport }> = [
  { name: 'phone-390', viewport: { width: 390, height: 844 } },
  { name: 'narrow-320', viewport: { width: 320, height: 568 } },
]

const REFERENCE_DIR = resolve(REPO_ROOT, '..', '.evidence', basename(REPO_ROOT), 'sources')
const REFERENCE_FILE = 'sources/source-07-B05-04-review-grouping.jpg'
const REFERENCE = {
  file: REFERENCE_FILE,
  sha256: createHash('sha256').update(readFileSync(resolve(REFERENCE_DIR, basename(REFERENCE_FILE)))).digest('hex'),
  regions: {
    'B05-04 current': 'Left pane: CIRCUIT · 2 ROUNDS frame hugs its label but its outline runs on to the group edge (the defect)',
    'B05-04 selected': 'Right pane: CIRCUIT · 2 ROUNDS framed by an outline that ends with the label (compact structure-label framing)',
  },
}

function sourceIdentity() {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 10_000 }).trim()
  if (!/^[a-f0-9]{40}$/.test(head)) throw new Error('Badge capture requires an actual Git source identity')
  return {
    head,
    dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8', timeout: 10_000 }).trim() !== '',
  }
}

const today = new Date().toISOString().slice(0, 10)
const bodyweight = { equipment: 'bodyweight', load_type: 'bodyweight' as const, load_value: null }

/**
 * Review: the structure spectrum (grouped superset, a long `CIRCUIT · 3 ROUNDS
 * · PYRAMID`, a badged standard ladder, EMOM, AMRAP, For Time) plus B05-04's
 * own shape, a two-round bodyweight circuit with round rest.
 */
const spectrum = makeStructureSpectrumWorkout({ title: 'Synthetic structure badges' })
const REVIEW: SessionAcceptance = makeSessionAcceptance({
  date: today, location_id: PLACE, goal_preset: 'strength',
  workout: {
    ...spectrum,
    sections: [...spectrum.sections, {
      section_type: 'conditioning', section_title: 'Conditioning', section_notes: null,
      blocks: [makeWorkoutBlock({
        structure_type: 'circuit', rep_scheme: 'fixed', rounds: 2, round_rest_seconds: 60,
        exercises: [
          makePrescription({ exercise_id: 'mountain-climber', ...bodyweight, target_value: 12, sets: null, rest_seconds: null }),
          makePrescription({ exercise_id: 'squat-jump', ...bodyweight, target_value: 10, sets: null, rest_seconds: null }),
          makePrescription({ exercise_id: 'bear-crawl', ...bodyweight, modality: 'time', target_value: 20, sets: null, rest_seconds: null }),
        ],
      })],
    }],
  },
})

const climb = { exercise_id: 'mountain-climber', equipment_used: 'bodyweight', load_type: 'bodyweight' as const, load_value: null }
/** Active workout and session detail: row-parent consumers with short and long labels. */
const SECTIONS: SectionFixture[] = [
  { title: 'Circuit work', sectionType: 'accessory', blocks: [
    { structureType: 'superset', roundRestSeconds: 60, exercises: [
      { prescription: { exercise_id: 'bench-press', order_index: 0, sets: 3, target_value: 8 } },
      { prescription: { exercise_id: 'bent-over-row', order_index: 1, sets: 3, target_value: 8 } },
    ], result: undefined },
    { structureType: 'circuit', rounds: 3, repScheme: 'pyramid', roundRestSeconds: 60, exercises: [
      { prescription: { ...climb, order_index: 0, sets: 3, target_value: 12, rest_seconds: null } },
      { prescription: { exercise_id: 'goblet-squat', order_index: 1, sets: 3, target_value: 10, rest_seconds: null } },
    ], result: { rounds_completed: 3 } },
  ] },
  { title: 'Conditioning', sectionType: 'conditioning', blocks: [
    { structureType: 'amrap', repScheme: 'inverse', timerType: 'countdown', timerSeconds: 480, exercises: [
      { prescription: { ...climb, exercise_id: 'burpee', order_index: 0, sets: null, target_value: 10, rest_seconds: null } },
    ], result: { rounds_completed: 6, partial_round_reps: 4 } },
    { structureType: 'for_time', repScheme: 'ladder_down', timerType: 'count_up', timerSeconds: 900, exercises: [
      { prescription: { ...climb, exercise_id: 'push-up', order_index: 0, target_kind: 'sequence',
        target_value: null, target_sequence: [10, 8, 6, 4, 2], sets: 1, rest_seconds: null } },
    ], result: { elapsed_seconds: 700, completed_under_cap: true } },
  ] },
]
const STARTED = new Date(Date.now() - 10 * 60_000).toISOString()
const WORKOUT = sessionSnapshotSchema.parse(snapshotFixture({
  userId: OWNER, title: 'Synthetic structure badge workout', startedAt: STARTED,
  session: { location_id: PLACE, goal_preset: 'strength' }, sections: SECTIONS,
}))
const PERFORMED = sessionReconstructionSchema.parse({
  ...WORKOUT, reconstruction: 'performed', as_of: WORKOUT.session.started_at,
  sections: WORKOUT.sections.map((section) => ({ ...section, blocks: section.blocks.map((block) => ({
    ...block, block_result: null,
  })) })),
})
const WORKOUT_EXERCISES = WORKOUT.sections.flatMap((section) => section.blocks
  .flatMap((block) => block.exercises.map(({ exercise }) => exercise)))

const DONE_ID = '00000000-0000-4000-8000-000000000901'
const DONE = makeSessionRow({
  id: DONE_ID, user_id: OWNER, location_id: PLACE, date: today, title: 'Synthetic structure badge record',
  goal_preset: 'strength', created_at: `${today}T09:00:00.000Z`, updated_at: `${today}T10:00:00.000Z`,
  started_at: `${today}T09:00:00.000Z`, completed_at: `${today}T09:45:00.000Z`, actual_duration_mins: 45,
})
const RECORD = reconstructionFixture({
  state: 'completed', sessionId: DONE_ID, userId: OWNER, title: DONE.title, session: DONE, sections: SECTIONS,
})

type Mode = { review?: SessionAcceptance; active?: boolean; skin?: 'clear' | 'vapour' }

async function syntheticApp(page: Page, mode: Mode = {}) {
  const unexpected: string[] = []
  let attemptedWrites = 0
  let functionCalls = 0
  const guard = await installDeterministicCapture(page, { skin: mode.skin ?? 'clear', reducedMotion: true })
  await page.route('**/*', async (route) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.continue()
    attemptedWrites += 1
    unexpected.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
    return route.abort('blockedbyclient')
  })
  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/')) {
      functionCalls += 1
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (request.method() === 'GET') {
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'strength' })])
      if (name === 'locations') return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full' })])
      if (name === 'workout_sessions') return reply(mode.active || mode.review ? [] : [DONE])
      if (mode.active && name === 'exercise_definitions') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        return reply(WORKOUT_EXERCISES.filter((exercise) => id === undefined || exercise.exercise_id === id)
          .map((exercise) => definitionFixture({ id: exercise.exercise_id })))
      }
      if (mode.active && name === 'workout_exercises') return reply(WORKOUT_EXERCISES)
      if (['rest_days', 'load_anchors', 'location_equipment', 'saved_workouts', 'saved_workout_attempts',
        'saved_workout_completions', 'exercise_definitions'].includes(name)) return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(mode.active ? WORKOUT : null)
      if (mode.active && name === 'session_snapshot') return reply(WORKOUT)
      if (name === 'session_as_performed') return reply(mode.active ? PERFORMED : RECORD)
      if (name === 'streak_sessions') return reply(mode.active || mode.review ? [] : [{
        session_id: DONE.id, completed_at: DONE.completed_at, counts_for_streak: true,
      }])
      if (['constraints_in_force', 'anchor_evidence', 'conditioning_history',
        'generation_candidate_sets_for_goal'].includes(name)) return reply([])
    }
    if (request.method() !== 'GET') attemptedWrites += 1
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic structure-badge request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner, handoff }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-b05-structure-badges-session', refreshToken: 'synthetic-b05-structure-badges-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-b05-structure-badges@example.invalid' },
    }))
    if (location.pathname === '/review' && handoff !== null) {
      history.replaceState({ usr: handoff, key: 'synthetic-structure-badges', idx: 0 }, '', location.href)
    }
  }, { owner: OWNER, handoff: mode.review === undefined ? null : reviewHandoff(mode.review) })
  return {
    assertReadOnly() {
      expect(unexpected).toEqual([])
      expect(attemptedWrites).toBe(0)
      expect(functionCalls).toBe(0)
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

/** Every rendered StructureBadge: the emitting wrapper around the small structure frame. */
const BADGE = '.clr-bleed:has(> .clr-chamfer--sm.clr-chamfer--structure)'

/**
 * One badge's boxes: wrapper, its `::before` emission, the frame, the glyph and
 * label run inside it, the parent it is laid out in, and the roles around it.
 */
async function badgeGeometry(badge: Locator) {
  return badge.evaluate((wrapper) => {
    const box = (rect: DOMRect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      width: rect.width, height: rect.height })
    const frame = wrapper.firstElementChild as HTMLElement
    const frameStyle = getComputedStyle(frame)
    const range = document.createRange()
    range.selectNodeContents(frame)
    const content = range.getBoundingClientRect()
    const textRange = document.createRange()
    const text = [...frame.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim() !== '')!
    textRange.selectNodeContents(text)
    const lines = new Set([...textRange.getClientRects()].map((rect) => Math.round(rect.top))).size
    const emission = getComputedStyle(wrapper, '::before')
    // The label's own unwrapped width: a hidden copy beside it, at max-content.
    const twin = wrapper.cloneNode(true) as HTMLElement
    twin.style.cssText += ';position:absolute;visibility:hidden;width:max-content;max-width:none'
    wrapper.parentElement!.append(twin)
    const maxContent = twin.getBoundingClientRect().width
    twin.remove()

    // The layout parent is the nearest ancestor that is not a bare list item.
    let parent = wrapper.parentElement!
    while (getComputedStyle(parent).display === 'list-item' && parent.parentElement) parent = parent.parentElement
    const parentStyle = getComputedStyle(parent)
    const parentBox = parent.getBoundingClientRect()
    const parentContent = {
      left: parentBox.left + parseFloat(parentStyle.borderLeftWidth) + parseFloat(parentStyle.paddingLeft),
      right: parentBox.right - parseFloat(parentStyle.borderRightWidth) - parseFloat(parentStyle.paddingRight),
    }
    // Where the unused span beside the badge ends: the parent's content edge,
    // or the next thing laid out on the same line.
    const wrapperBox = wrapper.getBoundingClientRect()
    const own = wrapper.parentElement === parent ? wrapper : wrapper.parentElement!
    let spanEnd = parentContent.right
    // A sibling on the badge's line must neither sit under it nor be squeezed
    // past its own words (B05-04 recovery: row parents stay contained).
    const collisions: string[] = []
    for (const sibling of [...parent.children]) {
      if (sibling === own) continue
      const rect = sibling.getBoundingClientRect()
      const sameLine = rect.top < wrapperBox.bottom && rect.bottom > wrapperBox.top
      if (rect.left >= wrapperBox.left && sameLine) spanEnd = Math.min(spanEnd, rect.left)
      if (rect.width === 0 || !sameLine) continue
      const overlaps = rect.left < wrapperBox.right - 0.5 && rect.right > wrapperBox.left + 0.5
      const squeezed = sibling.scrollWidth > sibling.clientWidth + 1
      if (overlaps || squeezed) collisions.push(`${sibling.textContent?.trim()} overlaps:${overlaps} squeezed:${squeezed}`)
    }

    const card = wrapper.closest('.clr-bleed:has(> .clr-card), .clr-card')
    const cardHost = card?.parentElement ?? null
    const probe = document.createElement('span')
    probe.style.color = 'var(--border-frame-structure)'
    wrapper.append(probe)
    const stroke = getComputedStyle(probe).color
    probe.remove()
    const emitFar = document.createElement('span')
    emitFar.style.width = 'var(--emit-far)'
    emitFar.style.position = 'absolute'
    document.body.append(emitFar)
    const emitFarPx = emitFar.getBoundingClientRect().width
    emitFar.remove()

    return {
      label: frame.textContent,
      lines,
      wrapper: box(wrapperBox),
      frame: box(frame.getBoundingClientRect()),
      content: box(content),
      padding: { left: parseFloat(frameStyle.paddingLeft), right: parseFloat(frameStyle.paddingRight) },
      maxContent,
      emission: { width: parseFloat(emission.width), height: parseFloat(emission.height),
        inset: emission.inset, position: emission.position },
      frameOverflows: frame.scrollWidth > frame.clientWidth + 1,
      parent: {
        tag: parent.tagName.toLowerCase(),
        display: parentStyle.display,
        direction: parentStyle.flexDirection,
        alignItems: parentStyle.alignItems,
        content: parentContent,
      },
      spanEnd,
      collisions,
      card: card === null || cardHost === null ? null : {
        width: card.getBoundingClientRect().width,
        hostContent: cardHost.clientWidth - parseFloat(getComputedStyle(cardHost).paddingLeft)
          - parseFloat(getComputedStyle(cardHost).paddingRight),
      },
      stroke,
      emitFarPx,
    }
  })
}

/**
 * Stroke coverage along the top edge of a rectangle span in an actual capture:
 * the share of pixel columns where the structure stroke colour is drawn.
 */
async function strokeCoverage(page: Page, png: Buffer, stroke: string, span: { left: number; right: number; top: number }) {
  return page.evaluate(async ({ data, stroke, span }) => {
    // Resolve the computed colour (any syntax) to sRGB bytes the capture is in.
    const swatch = new OffscreenCanvas(1, 1).getContext('2d')!
    swatch.fillStyle = stroke
    swatch.fillRect(0, 0, 1, 1)
    const [r, g, b] = swatch.getImageData(0, 0, 1, 1).data
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    const x = Math.max(0, Math.ceil(span.left))
    const w = Math.floor(span.right) - x
    if (w < 1) return { columns: 0, stroked: 0, share: 0 }
    const y = Math.max(0, Math.floor(span.top) - 1)
    const pixels = context.getImageData(x, y, w, 4).data
    let stroked = 0
    for (let column = 0; column < w; column += 1) {
      for (let row = 0; row < 4; row += 1) {
        const at = (row * w + column) * 4
        const distance = Math.hypot(pixels[at]! - r!, pixels[at + 1]! - g!, pixels[at + 2]! - b!)
        if (distance < 60) { stroked += 1; break }
      }
    }
    return { columns: w, stroked, share: stroked / w }
  }, { data: png.toString('base64'), stroke, span })
}

/** Sub-pixel rounding only; the defect measured tens of CSS px. */
const TOLERANCE = 1

/** The badge contract, asserted on its geometry and its pixels; returns the record entry. */
async function checkBadge(page: Page, badge: Locator, testInfo: TestInfo, id: string, consumer: string) {
  await badge.scrollIntoViewIfNeeded()
  await page.evaluate(() => document.fonts.ready)
  const geometry = await badgeGeometry(badge)
  const detail = JSON.stringify(geometry)
  const png = await page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' })
  const inside = await strokeCoverage(page, png, geometry.stroke, {
    left: geometry.frame.left + 4, right: geometry.frame.right - 4, top: geometry.frame.top,
  })
  const beside = await strokeCoverage(page, png, geometry.stroke, {
    left: geometry.frame.right + geometry.emitFarPx + 2, right: geometry.spanEnd - 1, top: geometry.frame.top,
  })

  // Pixels first: the stroke runs along the frame and not across the unused span.
  expect(inside.share, detail).toBeGreaterThan(0.8)
  if (beside.columns > 0) expect(beside.stroked, JSON.stringify({ beside, geometry })).toBe(0)
  expect(geometry.collisions, detail).toEqual([])
  // Wrapper, emission and frame are one box.
  expect(Math.abs(geometry.wrapper.width - geometry.frame.width), detail).toBeLessThanOrEqual(TOLERANCE)
  expect(Math.abs(geometry.wrapper.left - geometry.frame.left), detail).toBeLessThanOrEqual(TOLERANCE)
  expect(geometry.emission.position).toBe('absolute')
  expect(Math.abs(geometry.emission.width - geometry.wrapper.width), detail).toBeLessThanOrEqual(TOLERANCE)
  // The frame is its glyph and label plus padding — nothing more. A label too
  // long for its parent wraps, and is then exactly as wide as the parent lets
  // it be: never wider than the label's own unwrapped width.
  const intrinsic = geometry.content.width + geometry.padding.left + geometry.padding.right
  expect(geometry.frame.width, detail).toBeLessThanOrEqual(geometry.maxContent + TOLERANCE)
  if (geometry.lines === 1) {
    expect(Math.abs(geometry.frame.width - geometry.maxContent), detail).toBeLessThanOrEqual(TOLERANCE)
    expect(geometry.frame.width - intrinsic, detail).toBeLessThanOrEqual(TOLERANCE)
  } else {
    expect(geometry.maxContent, detail).toBeGreaterThan(geometry.frame.width + TOLERANCE)
  }
  // Contained in its parent; a long label wraps inside rather than overflowing.
  expect(geometry.wrapper.left, detail).toBeGreaterThanOrEqual(geometry.parent.content.left - TOLERANCE)
  expect(geometry.wrapper.right, detail).toBeLessThanOrEqual(geometry.parent.content.right + TOLERANCE)
  expect(geometry.frameOverflows, detail).toBe(false)
  // The enclosing card keeps its full width; only the badge hugs.
  if (geometry.card !== null) {
    expect(geometry.card.width, detail).toBeGreaterThanOrEqual(geometry.card.hostContent - TOLERANCE)
  }

  const file = `${id}.png`
  const path = testInfo.outputPath(file)
  writeFileSync(path, png)
  await testInfo.attach(file, { path, contentType: 'image/png' })
  return {
    consumer,
    label: geometry.label,
    lines: geometry.lines,
    parent: geometry.parent.direction === 'column' && geometry.parent.display.includes('flex') ? 'column' : 'row',
    parentLayout: `${geometry.parent.tag} ${geometry.parent.display} ${geometry.parent.direction} align-items:${geometry.parent.alignItems}`,
    badgeWidth: geometry.wrapper.width,
    emissionWidth: geometry.emission.width,
    contentRunWidth: intrinsic,
    labelMaxContentWidth: geometry.maxContent,
    parentContentWidth: geometry.parent.content.right - geometry.parent.content.left,
    unusedSpan: { columns: beside.columns, strokeColumns: beside.stroked },
    siblingCollisions: geometry.collisions,
    frameStrokeShare: inside.share,
    card: geometry.card,
    capture: { file, sha256: createHash('sha256').update(png).digest('hex') },
    result: 'pass' as const,
  }
}

type Entry = Awaited<ReturnType<typeof checkBadge>>

/** Full-width action frames keep filling their action row. */
async function expectActionsFill(page: Page) {
  const actions = await page.locator('.clr-actions').evaluateAll((rows) => rows.flatMap((row) => {
    const width = row.clientWidth
    return [...row.children].filter((child) => child.getClientRects().length > 0
      && child.getBoundingClientRect().width > 0)
      .map((child) => ({ width: child.getBoundingClientRect().width, row: width }))
  }))
  for (const action of actions) expect(action.width).toBeGreaterThanOrEqual(action.row - TOLERANCE)
  return actions.length
}

async function record(page: Page, testInfo: TestInfo, id: string, context: {
  consumer: string; state: string; viewport: Viewport; entries: Entry[]; actionFrames: number
}) {
  const entry = {
    id,
    ...context,
    criteria: { 'AC-026': 'pass', 'AC-070': 'pass' },
    reference: REFERENCE,
    source: sourceIdentity(),
    target: new URL(page.url()).origin,
    route: new URL(page.url()).pathname,
    skin: await page.locator('html').getAttribute('data-skin'),
    syntheticPublicConfig: SYNTHETIC_ORIGIN_NEEDED,
    browser: `${testInfo.project.name} (Chromium emulation, deviceScaleFactor ${testInfo.project.use.deviceScaleFactor ?? 1})`,
  }
  writeFileSync(testInfo.outputPath(`${id}.json`), JSON.stringify(entry, null, 2))
  await testInfo.attach(`${id}.json`, { body: JSON.stringify(entry, null, 2), contentType: 'application/json' })
}

async function checkAll(page: Page, scope: Locator, testInfo: TestInfo, id: string, consumer: (badge: Locator) => Promise<string>) {
  const badges = await scope.locator(BADGE).all()
  const entries: Entry[] = []
  for (const [index, badge] of badges.entries()) {
    if (!(await badge.isVisible())) continue
    entries.push(await checkBadge(page, badge, testInfo, `${id}-badge${index + 1}`, await consumer(badge)))
  }
  return entries
}

test.use({ timezoneId: 'UTC' })

test.beforeEach(({ browserName }, testInfo) => {
  expect(testInfo.project.name).toBe('mobile')
  expect(browserName).toBe('chromium')
})

for (const { name: size, viewport } of VIEWPORTS) {
  test.describe(`B05 structure badges @ ${size}`, () => {
    test.use({ viewport })

    for (const skin of ['clear', 'vapour'] as const) {
      test(`Review groups (${skin}): every badge hugs its label in its column parent`, async ({ page, visit }, testInfo) => {
        const app = await syntheticApp(page, { review: REVIEW, skin })
        await visit('/review')
        await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(REVIEW.workout.title)
        const main = page.locator('main')
        const entries = await checkAll(page, main, testInfo, `review-${size}-${skin}`, async (badge) =>
          (await badge.locator('xpath=..').getAttribute('style'))?.includes('border-inline-start')
            ? 'Review grouped structure (ReviewBlockRows group)' : 'Review badged standard block (ReviewBlockRows stack)')
        const labels = entries.map((entry) => entry.label)
        expect(labels).toEqual(expect.arrayContaining([
          'SUPERSET · 4 ROUNDS', 'CIRCUIT · 3 ROUNDS · PYRAMID', 'CIRCUIT · 2 ROUNDS', 'STANDARD · LADDER UP',
          'FOR TIME · 10 MIN CAP · LADDER · FIXED INTERVAL',
        ]))
        expect(entries.every((entry) => entry.parent === 'column')).toBe(true)
        // B05-04's own label: the group width beside it is unused, and stays dark.
        const pictured = entries.find((entry) => entry.label === 'CIRCUIT · 2 ROUNDS')!
        expect(pictured.badgeWidth).toBeLessThan(pictured.parentContentWidth - 60)
        expect(pictured.unusedSpan.columns).toBeGreaterThan(50)
        expect(pictured.unusedSpan.strokeColumns).toBe(0)
        const actionFrames = await expectActionsFill(page)
        await record(page, testInfo, `review-${size}-${skin}`, {
          consumer: 'Review (grouped superset/circuit and badged standard)', state: 'pre-start review, structure spectrum + B05-04 circuit',
          viewport, entries, actionFrames,
        })
        app.assertReadOnly()
      })
    }

    test('Workout section header, BlockPanel and AMRAP badges hug their labels in row parents', async ({ page, visit }, testInfo) => {
      const app = await syntheticApp(page, { active: true })
      await visit('/workout')
      const content = page.locator('main#main > .clr-scroll-region > .clr-scroll-region__scroller')
      const consumerOf = async (badge: Locator) => {
        if (await badge.locator('xpath=ancestor::ul[@aria-label="Structures in this section"]').count()) return 'SectionHeader'
        if (await badge.locator('xpath=ancestor::*[@data-block-top-row]').count()) return 'BlockPanel top row'
        return 'AmrapBlock top row'
      }
      const entries: Entry[] = []
      entries.push(...await checkAll(page, content, testInfo, `workout-circuit-${size}`, consumerOf))
      await page.getByRole('button', { name: 'All sections', exact: true }).click()
      await page.getByRole('button', { name: 'Conditioning, not started', exact: true }).click()
      await expect(content.getByText('AMRAP · 8 MIN · INVERSE', { exact: true }).first()).toBeVisible()
      entries.push(...await checkAll(page, content, testInfo, `workout-conditioning-${size}`, consumerOf))

      const consumers = new Set(entries.map((entry) => entry.consumer))
      expect([...consumers].sort()).toEqual(['AmrapBlock top row', 'BlockPanel top row', 'SectionHeader'])
      expect(entries.every((entry) => entry.parent === 'row')).toBe(true)
      expect(entries.map((entry) => entry.label)).toEqual(expect.arrayContaining([
        'SUPERSET', 'CIRCUIT · 3 ROUNDS · PYRAMID', 'AMRAP · 8 MIN · INVERSE', 'FOR TIME · 15 MIN CAP · LADDER DOWN',
      ]))
      const actionFrames = await expectActionsFill(page)
      await record(page, testInfo, `workout-${size}`, {
        consumer: 'Active Workout (SectionHeader, BlockPanel, AmrapBlock)', state: 'active session, both sections',
        viewport, entries, actionFrames,
      })
      app.assertReadOnly()
    })

    test('read-only session detail structure results hug their labels beside the measurements', async ({ page, visit }, testInfo) => {
      const app = await syntheticApp(page)
      await visit(`/history/${DONE_ID}`)
      const main = page.locator('main')
      await expect(main.locator(BADGE).first()).toBeVisible()
      const entries = await checkAll(page, main, testInfo, `session-detail-${size}`, async () => 'StructureResultBadge')
      expect(entries.map((entry) => entry.label)).toEqual(expect.arrayContaining([
        'SUPERSET', 'CIRCUIT · 3 ROUNDS · PYRAMID', 'AMRAP · 8 MIN · INVERSE', 'FOR TIME · 15 MIN CAP · LADDER DOWN',
      ]))
      expect(entries.every((entry) => entry.parent === 'row')).toBe(true)
      const actionFrames = await expectActionsFill(page)
      await record(page, testInfo, `session-detail-${size}`, {
        consumer: 'Read-only session detail (StructureResultBadge)', state: 'completed session with scored and unscored blocks',
        viewport, entries, actionFrames,
      })
      app.assertReadOnly()
    })

    test('format preview ladder badges hug their labels in their column parent', async ({ page, visit }, testInfo) => {
      const app = await syntheticApp(page)
      await visit('/settings/formats')
      const main = page.locator('main')
      const ladders = main.locator('[data-preview-ladder]')
      await expect(ladders.first()).toBeVisible()
      // Every badge on the screen keeps the contract; the ladders are its column consumer.
      const entries = await checkAll(page, main, testInfo, `format-preview-${size}`, async (badge) =>
        await badge.locator('xpath=ancestor::*[@data-preview-ladder]').count()
          ? 'FormatPreview LadderTimingCard' : 'FormatPreview other')
      const ladderEntries = entries.filter((entry) => entry.consumer === 'FormatPreview LadderTimingCard')
      expect(ladderEntries.length).toBeGreaterThanOrEqual(3)
      expect(ladderEntries.every((entry) => entry.parent === 'column')).toBe(true)
      const actionFrames = await expectActionsFill(page)
      await record(page, testInfo, `format-preview-${size}`, {
        consumer: 'Settings format preview (LadderTimingCard)', state: 'fixed read-only preview', viewport, entries, actionFrames,
      })
      app.assertReadOnly()
    })
  })
}
