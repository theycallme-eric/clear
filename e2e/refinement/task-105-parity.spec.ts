import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { join, relative, resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { resolveObjectStore } from '../../scripts/refinement/lib/references.mjs'
import { timedBlock } from '../../src/dev/gallery-refinement-fixtures'
import { reviewHandoff } from '../../src/state/review-handoff'
import { CONTRACT_VERSION, sessionSnapshotSchema, type SessionAcceptance, type SessionSnapshot } from '../../src/state/schemas'
import type { BlockProgress } from '../../src/state/workout-progress'
import { SCHEDULED_INTERVAL, SCHEDULED_LADDER, SCHEDULED_ROUNDS, EXPECTED } from '../../src/test/compact-ladder-fixture'
import { makePrescription, makeWorkoutBlock } from '../../src/test/factories'
import { formatBadgesSnapshot } from '../../src/test/format-badges-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * A3 TASK-105 look check (TASK-AC-FAEE8BA2A650): each real route this task
 * wires beside its accepted gallery state (gallery commit bec4454, Round 7),
 * with matched data, at the two approved phone widths, 320 and 390.
 *
 * The route this task wires is `/workout`'s ladder — Round 7's
 * `TimedWorkoutFlow` holding the ladder's one durable attempt, its
 * `LadderPrescription` live check-off, and its "Log results" dialog with
 * `LadderCompletion`, `SetEffortChoice`, notes and the quiet Undo finish. Each
 * accepted state draws the same flow over the very block the route performs
 * here:
 *
 *   · `ladder-4`, `ladder-12`: the live ladders (`GalleryLadderFlow`), driven
 *     on the browser's own clock (held still between steps): the card before
 *     Start; 30 seconds after Start with rounds 1–2 checked off (running); 60
 *     seconds into a Pause (paused); just after Finish, its "Log results"
 *     dialog with the checked rounds imported and the quiet Undo (log); the
 *     card after Undo finish · resume ladder brings the same paused attempt
 *     back with its rounds (undone); and the ended card after Finish again,
 *     its log closed (ended);
 *   · `ladder`, `ladder-long`: the ladder's results moments
 *     (`GalleryLoggingMoment`, four and twelve rounds): the card before Start,
 *     then the "Log results" dialog and the ended card once the attempt has run
 *     past its cap — the gallery's own "Open …" drive, and on the route Start
 *     and the clock moved past the same cap.
 *
 * Every visible word of each moment is read from both sides, and so is the
 * layout: every rendered element's box is measured and compared with its
 * counterpart within `LAYOUT_TOLERANCE_PX` (TASK-103's method). Each card's
 * top is scrolled into view before it is captured, so a 320 capture shows the
 * timer bar. A difference no criterion intends fails the case; an intended
 * one is labelled with its criterion ID. The gallery state draws the live
 * component, so this task's changes to it show on both sides alike; each
 * receipt lists those changes against the accepted capture (`galleryChanges`),
 * each with its criterion. Each case writes its receipt to
 * `evidence/refinement/task-105/parity/` and its captures beside the Runner's
 * evidence store (outside Git), recording each capture's SHA-256 in the
 * receipt. Synthetic and contained: nothing is written to any backend.
 *
 * Owner decision 2026-11-16 (TASK-AC-30138C4A2AFF): before Start a
 * twelve-round grid fits one screen at each width, 320×568 included, on the
 * accepted state and on the route alike, and each receipt keeps every
 * moment's grid height (`gridHeights`). The narrow-width tightening that makes
 * it fit is one of this task's gallery changes, so it shows on both sides.
 *
 * `/review` is the other route this task wires (TASK-AC-F3CDA21AC50B): each
 * ladder's rounds under its accepted movement rows, drawn by the same round
 * grid (`LadderRounds`) the live ladder draws. No accepted state draws a
 * Review card, so the round grid alone is compared with the one the accepted
 * `ladder-4` and `ladder-12` states draw before Start, over the same blocks —
 * in words and in layout, as above.
 *
 * A scheduled ladder on `/workout` (the route's `TimedWorkoutFlow` schedule)
 * has no accepted gallery state at all (bec4454 draws none): its captures are
 * kept for the look check with that disposition recorded in its receipt
 * (`non-applicable`), and its words are read against its own data.
 *
 * The reload, the failed save and the read-back have no gallery counterpart
 * (the gallery keeps nothing); they are proved on the route by
 * `src/ui/timed-workout-flow.test.tsx` and `e2e/refinement/task-013.spec.ts`,
 * `task-014.spec.ts` and `task-048.spec.ts`.
 */
const OWNER = '00000000-0000-4000-8000-000000010590'
const PLACE = '00000000-0000-4000-8000-000000010591'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const RECEIPTS = join(REPO_ROOT, 'evidence', 'refinement', 'task-105', 'parity')
/** The browser's clock at the start of each case. */
const ENTRY = Date.parse('2026-11-16T09:00:00.000Z')
const e2e = readE2eEnv()
const SYNTHETIC_ORIGIN_NEEDED = !e2e.usesExternalTarget && (e2e.url === null || e2e.anonKey === null)

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

async function waitForOrigin(origin: string, deadline: number, exited: () => number | null) {
  const own = `${origin}/@fs${resolve(REPO_ROOT, 'package.json')}`
  while (Date.now() < deadline) {
    const code = exited()
    if (code !== null) throw new Error(`Synthetic TASK-105 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-105 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-105.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-105-public-placeholder',
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
})

test.describe.configure({ mode: 'default' })
test.use({ timezoneId: 'UTC' })

const VIEWPORTS = [
  { name: 'phone-320', viewport: { width: 320, height: 568 } },
  { name: 'phone-390', viewport: { width: 390, height: 844 } },
] as const

// ─────────────────────────────────────────────────────────────────────────────
// Reading, comparing and keeping
// ─────────────────────────────────────────────────────────────────────────────

/** Fonts loaded and entrance motion finished, so every word is drawn (loops excepted). */
async function settle(page: Page) {
  await page.evaluate(async () => {
    void document.body.offsetHeight
    await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)))
    await document.fonts.ready
  })
  await page.waitForFunction(() => document.getAnimations()
    .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
    .every((animation) => animation.playState !== 'running'))
}

/** The visible words of a part, line by line, read once they hold still. */
async function linesOf(target: Locator): Promise<string[]> {
  const read = async () => (await target.evaluate((element) => (element as HTMLElement).innerText))
    .split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter((line) => line !== '')
  let previous = await read()
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await target.page().waitForTimeout(250)
    const next = await read()
    if (JSON.stringify(next) === JSON.stringify(previous)) return next
    previous = next
  }
  return previous
}

interface Difference { readonly side: 'gallery only' | 'route only'; readonly text: string; readonly criterion: string | null; readonly reason: string | null }
interface Intended { readonly criterion: string; readonly reason: string; readonly side: Difference['side']; readonly match: RegExp }

/** Each line only one side shows, labelled with the criterion that intends it, if any. */
function compare(gallery: readonly string[], route: readonly string[], intended: readonly Intended[]): Difference[] {
  const remaining = [...route]
  const differences: Difference[] = []
  for (const line of gallery) {
    const index = remaining.indexOf(line)
    if (index >= 0) remaining.splice(index, 1)
    else differences.push(label('gallery only', line, intended))
  }
  for (const line of remaining) differences.push(label('route only', line, intended))
  return differences
}

function label(side: Difference['side'], text: string, intended: readonly Intended[]): Difference {
  const rule = intended.find((candidate) => candidate.side === side && candidate.match.test(text))
  return { side, text, criterion: rule?.criterion ?? null, reason: rule?.reason ?? null }
}

/**
 * The Runner body these captures belong to. Each body keeps its own folder in
 * the evidence store, so a later body's run never overwrites the captures an
 * earlier body's receipts hash (round 06 continues the 20261116 body's work).
 */
const CAPTURE_BODY = 'clear-gallery-adoption-v2-20261118'

/** Captures go beside the Runner's evidence store, outside Git; else into test-results. */
function captureDir(): { dir: string; identity: string } {
  const store = resolveObjectStore({ cwd: REPO_ROOT })
  if (store.problem === undefined && store.dir !== null) {
    const dir = join(store.dir, CAPTURE_BODY, 'task-105', 'captures')
    return { dir, identity: `store:${CAPTURE_BODY}/task-105/captures` }
  }
  const dir = join(REPO_ROOT, 'test-results', 'task-105-parity')
  return { dir, identity: `repo:${relative(REPO_ROOT, dir)}` }
}

/**
 * The part's top is scrolled into view first, so a tall card's capture at 320
 * starts at its top (the timer bar included) rather than wherever the page
 * was left scrolled.
 */
async function keep(target: Locator, name: string) {
  await target.evaluate((element) => element.scrollIntoView({ block: 'start', inline: 'nearest' }))
  const bytes = await target.screenshot({ caret: 'hide', animations: 'disabled' })
  await test.info().attach(`${name}.png`, { body: bytes, contentType: 'image/png' })
  const { dir, identity } = captureDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${name}.png`), bytes)
  return { file: `${identity}/${name}.png`, sha256: createHash('sha256').update(bytes).digest('hex') }
}

/**
 * A whole tall card for the look check, where no gallery side is compared: at
 * a phone width the app's fixed footer and its scroll area clip a tall card's
 * capture, so the viewport is made tall (same width) for this one capture and
 * then put back. Layout comparisons never use these.
 */
async function keepWhole(target: Locator, name: string) {
  const page = target.page()
  const viewport = page.viewportSize()!
  await page.setViewportSize({ width: viewport.width, height: 3200 })
  try {
    await settle(page)
    return await keep(target, name)
  } finally {
    await page.setViewportSize(viewport)
    await settle(page)
  }
}

function writeReceipt(name: string, receipt: Record<string, unknown>) {
  mkdirSync(RECEIPTS, { recursive: true })
  writeFileSync(join(RECEIPTS, `${name}.json`), `${JSON.stringify({ schema: 'clear-task-105-parity/v1', task: 'TASK-105', gallery: 'bec44545eb982f6dc136a583400f7e314c306d1d', ...receipt }, null, 2)}\n`)
}

function expectAllIntended(differences: readonly Difference[], label: string) {
  const unintended = differences.filter((difference) => difference.criterion === null)
  expect(unintended, `${label}: every visible difference is one a criterion intends`).toEqual([])
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout: where each element is drawn, not only what it says
// ─────────────────────────────────────────────────────────────────────────────

/** How far, in CSS px, an element's edge or size may sit from its counterpart's. */
const LAYOUT_TOLERANCE_PX = 2

/** One rendered element's box, in CSS px from its part's top-left corner, scroll included. */
interface Box { readonly key: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
interface LayoutDifference {
  readonly key: string
  readonly gallery: Box | null
  readonly route: Box | null
  readonly criterion: string | null
  readonly reason: string | null
}
interface IntendedLayout { readonly criterion: string; readonly reason: string; readonly match: RegExp }

/**
 * Every rendered element of a part (the part itself first), named by its tag,
 * its `clr-` classes and the words it draws and numbered in document order, so
 * the same element is found on both sides whatever wraps the part. A heading
 * is named `h` whatever its level: the level follows the host page's outline
 * (the gallery nests the card one level deeper), not the layout. Elements not
 * drawn (`display: none`, hidden, or no box at all) are left out, and so is a
 * modal dialog the part holds: it is drawn in the top layer against the
 * viewport, not inside the part, and is measured as its own part.
 */
async function boxesOf(target: Locator): Promise<Box[]> {
  return target.evaluate((root) => {
    const origin = root.getBoundingClientRect()
    const rounded = (value: number) => Math.round(value * 10) / 10
    // A scrolled container moves what it holds; measured as drawn unscrolled.
    const scrolled = (element: Element) => {
      let x = 0
      let y = 0
      for (let node = element.parentElement; node !== null && node !== root.parentElement; node = node.parentElement) {
        x += node.scrollLeft
        y += node.scrollTop
      }
      return { x, y }
    }
    const seen = new Map<string, number>()
    const boxes: { key: string; x: number; y: number; width: number; height: number }[] = []
    for (const element of [root, ...root.querySelectorAll('*')]) {
      const modal = element.closest(':modal')
      if (modal !== null && modal !== root && root.contains(modal)) continue
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') continue
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      const classes = [...element.classList].filter((name) => name.startsWith('clr-')).sort().map((name) => `.${name}`).join('')
      const words = (element instanceof HTMLElement ? element.innerText : (element.textContent ?? '')).replace(/\s+/g, ' ').trim().slice(0, 80)
      const tag = element.tagName.toLowerCase().replace(/^h[1-6]$/, 'h')
      const name = element === root ? '(part)' : `${tag}${classes}|${words}`
      const index = seen.get(name) ?? 0
      seen.set(name, index + 1)
      const scroll = element === root ? { x: 0, y: 0 } : scrolled(element)
      boxes.push({
        key: `${name}#${index}`,
        x: rounded(rect.left - origin.left + scroll.x),
        y: rounded(rect.top - origin.top + scroll.y),
        width: rounded(rect.width),
        height: rounded(rect.height),
      })
    }
    return boxes
  })
}

/** Each element drawn elsewhere, at another size, or on one side only, labelled if a criterion intends it. */
function compareLayout(gallery: readonly Box[], route: readonly Box[], intended: readonly IntendedLayout[]): LayoutDifference[] {
  const remaining = new Map(route.map((box) => [box.key, box]))
  const differences: LayoutDifference[] = []
  const labelled = (key: string, galleryBox: Box | null, routeBox: Box | null): LayoutDifference => {
    const rule = intended.find((candidate) => candidate.match.test(key))
    return { key, gallery: galleryBox, route: routeBox, criterion: rule?.criterion ?? null, reason: rule?.reason ?? null }
  }
  for (const box of gallery) {
    const counterpart = remaining.get(box.key)
    remaining.delete(box.key)
    if (counterpart === undefined) {
      differences.push(labelled(box.key, box, null))
      continue
    }
    const offset = Math.max(
      Math.abs(box.x - counterpart.x), Math.abs(box.y - counterpart.y),
      Math.abs(box.width - counterpart.width), Math.abs(box.height - counterpart.height),
    )
    if (offset > LAYOUT_TOLERANCE_PX) differences.push(labelled(box.key, box, counterpart))
  }
  for (const box of remaining.values()) differences.push(labelled(box.key, null, box))
  return differences
}

function expectLayoutIntended(differences: readonly LayoutDifference[], label: string) {
  const unintended = differences.filter((difference) => difference.criterion === null)
  expect(unintended, `${label}: every element is drawn where the accepted gallery draws it, within ${LAYOUT_TOLERANCE_PX}px, unless a criterion intends otherwise`).toEqual([])
}

// ─────────────────────────────────────────────────────────────────────────────
// This task's changes to the accepted gallery state, each with its criterion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What TASK-105 changes in the live components the accepted states draw, so
 * how these states now differ from the bec4454 captures. Both sides draw the
 * same component, so none of these is a difference between them; each is
 * recorded in every receipt with the criterion that intends it.
 */
const GALLERY_CHANGES = [
  {
    criterion: 'AC-C34-01, TASK-AC-C021DADA60B8',
    change: 'A ladder whose rounds nobody has marked yet reads "No rounds marked yet" (live count and the log\'s count), not "0 of N rounds completed": nothing stated is not zero; an explicit zero still reads "0 of N".',
    moments: ['running before a round is checked', 'log after Finish or the cap with nothing checked'],
  },
  {
    criterion: 'AC-C60-01, AC-R014-01, AC-R014-02',
    change: 'Undo finish · resume ladder keeps its quiet style, its control height and the small button\'s own inline padding (`var(--spacing-300)`, so its focus frame clears the first letter); its row gives that padding back outside the box with a negative inline margin (`calc(var(--spacing-300) * -1)`), so its text starts at the rounds-completed count\'s left edge.',
    moments: ['log after the athlete\'s Finish'],
  },
  {
    criterion: 'AC-R013-01, AC-R013-03, TASK-AC-C021DADA60B8',
    change: 'The ladder log asks each movement\'s next-round amount only once a round is stated (zero included): with nothing stated there is no "Completed in round 1" field.',
    moments: ['log after Finish or the cap with nothing checked'],
  },
  {
    criterion: 'AC-R013-01',
    change: 'A tap inside the live check-off\'s selection leaves only the rounds before it (the log tiles\' rule), where it used to select through it.',
    moments: ['interaction only'],
  },
  {
    criterion: 'JOURNEY-012 (readable wrapping), AC-R013-02',
    change: 'A live round tile keeps the read-only tile\'s declared inset (`var(--spacing-200)`) instead of the Chip\'s wider inline inset, which broke BURPEE mid-word (BURPE/E) in the three-column grid at 390. Size, type, frame and selection are unchanged.',
    moments: ['running', 'paused', 'undone'],
  },
  {
    criterion: 'TASK-AC-30138C4A2AFF (owner decision 2026-11-16, Decision 2)',
    change: 'At a narrow phone width (22.5rem and below; here 320 px) a round tile\'s inset is tightened from `var(--spacing-200)` to `var(--spacing-100)`, so the twelve-round grid fits one 320×568 screen before Start (544 px, was 592). The column rule, gap, frame, the frame\'s own inset and type are unchanged; at 390 nothing changes.',
    moments: ['every moment at 320 px (the round grid)'],
  },
  {
    criterion: 'AC-C33-01, AC-R013-02',
    change: 'A live round\'s toggle fills its grid cell and starts its words at its top, as a read-only round does, so a row\'s tiles and round labels stay level when one tile\'s words fit one line and its neighbour\'s wrap (a one- and a two-digit timed rung at 320 px). The accepted states\' rows hold alike words, so nothing drawn changes.',
    moments: ['running', 'paused', 'undone (live tiles; not drawn for the accepted data)'],
  },
  {
    criterion: 'AC-C35-01, AC-R012-01, TASK-AC-F3CDA21AC50B',
    change: 'The prescription reads the shared `state/ladder.ts` readings (Review\'s too): each round is also said in words to a screen reader (visually hidden), live toggles describe their round\'s work, and the summary line wraps a long word rather than overflowing. No drawn word or box changes for the accepted push up and burpee ladder.',
    moments: ['every moment (not drawn)'],
  },
] as const

// ─────────────────────────────────────────────────────────────────────────────
// Matched data: the gallery's own blocks, persisted as a session
// ─────────────────────────────────────────────────────────────────────────────

type GalleryState = 'ladder' | 'ladder-4' | 'ladder-12' | 'ladder-long'
const STATES: readonly GalleryState[] = ['ladder', 'ladder-4', 'ladder-12', 'ladder-long']
/** The blocks the accepted states draw (`GalleryLadderFlow`; `sceneFor('ladder', rounds)` in `gallery-refinement-forms.tsx`). */
const GALLERY_BLOCKS: Readonly<Record<GalleryState, BlockProgress>> = {
  ladder: timedBlock('ladder', { rounds: 4 }),
  'ladder-4': timedBlock('ladder', { rounds: 4 }),
  'ladder-12': timedBlock('ladder', { rounds: 12 }),
  'ladder-long': timedBlock('ladder', { rounds: 12 }),
}
const ROUNDS: Readonly<Record<GalleryState, number>> = { ladder: 4, 'ladder-4': 4, 'ladder-12': 12, 'ladder-long': 12 }
/** The results moments' own "Open …" drive (`GalleryLoggingMoment`). */
const OPEN: Readonly<Partial<Record<GalleryState, string>>> = { ladder: 'Open Ladder results', 'ladder-long': 'Open Long ladder results' }
/** The gallery's own sample unit (`PreviewSetLogging`), so any planned load reads alike. */
const GALLERY_UNIT = 'lb' as const
const UNDO_FINISH = 'Undo finish · resume ladder'

const capOf = (state: GalleryState) => {
  const block = GALLERY_BLOCKS[state]
  return block.ladderTiming?.mode === 'capped_window' ? block.ladderTiming.cap_seconds ?? 0 : block.timerSeconds ?? 0
}

function persistedBlock(block: BlockProgress) {
  return makeWorkoutBlock({
    structure_type: block.structureType,
    rep_scheme: block.repScheme,
    rounds: block.rounds,
    round_rest_seconds: block.roundRestSeconds,
    timer_type: block.timerType,
    timer_seconds: block.timerSeconds,
    ...(block.ladderTiming ? { ladder_timing: block.ladderTiming } : {}),
    exercises: block.exercises.map(({ prescription: p }) => makePrescription({
      exercise_id: p.exercise_id,
      equipment: p.equipment_used,
      session_function: 'conditioning',
      anchor_relationship: 'neutral',
      modality: p.modality,
      sets: p.sets,
      target_kind: p.target_kind,
      target_value: p.target_value,
      target_min: p.target_min,
      target_max: p.target_max,
      target_sequence: p.target_sequence,
      per_side: p.per_side,
      distance_unit: p.distance_unit,
      rest_seconds: p.rest_seconds,
      tempo: p.tempo,
      load_type: p.load_type ?? 'none',
      load_value: p.load_value,
      is_interval_exercise: p.is_interval_exercise,
      // The gallery row is already one valid prescription; its target fields
      // keep their own discriminant.
    } as Parameters<typeof makePrescription>[0])),
  })
}

type ParityBlock = SessionAcceptance['workout']['sections'][number]['blocks'][number]

/** One synthetic composition: the blocks in one conditioning section, then a one-movement cooldown. */
function parityAcceptance(title: string, blocks: readonly ParityBlock[]): SessionAcceptance {
  return {
    date: '2026-11-16',
    location_id: PLACE,
    session_focus: 'full_body',
    goal_preset: 'balanced',
    requested_duration_mins: 30,
    effective_duration_target_mins: 30,
    computed_duration_mins: null,
    requested_intensity: 5,
    effective_intensity: 5,
    adjustment_reason: null,
    generation_notes: null,
    prompt_version: 'e2e',
    contract_version: CONTRACT_VERSION,
    is_deload: false,
    workout: {
      title,
      overview: null,
      estimated_duration_mins: 30,
      sections: [
        { section_type: 'conditioning', section_title: 'Parity', section_notes: null, blocks: [...blocks] },
        {
          section_type: 'cooldown', section_title: 'Cooldown', section_notes: null,
          blocks: [makeWorkoutBlock({ exercises: [makePrescription({ exercise_id: 'burpee', equipment: 'bodyweight', load_type: 'none', load_value: null, sets: 1, target_value: 1 })] })],
        },
      ],
    },
  }
}

/** The composition, persisted and running since a minute before the case's clock. */
function runningSession(acceptance: SessionAcceptance): SessionSnapshot {
  return sessionSnapshotSchema.parse(formatBadgesSnapshot(acceptance, { userId: OWNER, startedAt: new Date(ENTRY - 60_000).toISOString() }))
}

function ladderSession(state: GalleryState): SessionSnapshot {
  return runningSession(parityAcceptance(`TASK-105 parity ${state}`, [persistedBlock(GALLERY_BLOCKS[state])]))
}

/**
 * The contained synthetic app: reads only; any write fails the case. With a
 * `review` composition there is no running session yet, and `/review` is
 * handed that composition through the existing Review hand-off.
 */
async function syntheticApp(page: Page, snapshot: SessionSnapshot, options: { review?: SessionAcceptance } = {}) {
  const running = options.review === undefined
  const unexpected: string[] = []
  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/')) {
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (request.method() === 'GET' || request.method() === 'HEAD') {
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'balanced', weight_unit: GALLERY_UNIT })])
      if (name === 'locations') return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full', is_default: true })])
      if (name === 'workout_sessions') return reply(running ? [snapshot.session] : [])
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session' || name === 'session_snapshot') return reply(running ? snapshot : null)
      if (name === 'session_as_performed') {
        return reply({
          reconstruction: 'performed', as_of: snapshot.session.started_at, session: snapshot.session, state: snapshot.state,
          sections: snapshot.sections.map((section) => ({
            ...section,
            blocks: section.blocks.map((block) => ({ ...block, block_result: null, exercises: block.exercises.map((entry) => ({ ...entry, movement_result: null })) })),
          })),
        })
      }
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history', 'set_load_anchors',
        'generation_refusal_diagnostics', 'generation_candidate_sets_for_goal', 'generation_candidate_sets'].includes(name)) return reply([])
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-105 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner, handoff }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-105-session', refreshToken: 'synthetic-task-105-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-105@example.invalid' },
    }))
    if (handoff !== null && location.pathname === '/review') {
      history.replaceState({ usr: handoff, key: 'synthetic-task-105', idx: 0 }, '', location.href)
    }
  }, { owner: OWNER, handoff: options.review === undefined ? null : reviewHandoff(options.review) })
  return {
    assertContained() {
      expect(unexpected, 'Every synthetic API request has an explicit disposition').toEqual([])
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The ladder, driven alike on both sides
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Differences a criterion intends between the route and its gallery state. The
 * route draws the same Round 7 component from the same block, so none is
 * expected; the tables stay explicit so a future one is labelled rather than
 * waved through.
 */
const LADDER_INTENDED: readonly Intended[] = []
const LADDER_LAYOUT_INTENDED: readonly IntendedLayout[] = []

interface Reading {
  readonly lines: string[]
  readonly boxes: Box[]
  readonly capture: { file: string; sha256: string }
  /** The ladder clock's digits as drawn (`TimerDigits` draws each digit apart); null before Start. */
  readonly readout: string | null
  /** The round grid's drawn height in CSS px (TASK-AC-30138C4A2AFF), or null where the part draws none. */
  readonly gridHeight: number | null
}

/** The height of the part's round grid (the part itself when it is the grid), or null. */
async function gridHeightOf(target: Locator): Promise<number | null> {
  return target.evaluate((element, selector) => {
    const grid = element.matches(selector) ? element : element.querySelector(selector)
    return grid === null ? null : grid.getBoundingClientRect().height
  }, 'ol[aria-label="Prescribed ladder rounds"]')
}

/** The ladder clock's readout: the timer's one child whose words are its digits. */
async function readoutOf(card: Locator): Promise<string | null> {
  const timer = card.getByRole('timer')
  if (await timer.count() === 0) return null
  return timer.first().evaluate((element) =>
    [...element.children].map((part) => part.textContent ?? '').find((text) => /^\d{2}:\d{2}$/.test(text)) ?? null)
}

async function read(target: Locator, name: string): Promise<Reading> {
  await expect(target).toBeVisible()
  await settle(target.page())
  return { lines: await linesOf(target), boxes: await boxesOf(target), capture: await keep(target, name), readout: await readoutOf(target), gridHeight: await gridHeightOf(target) }
}

/** The open "Log results" dialog: its form's words and boxes, and the dialog as drawn. */
async function readLog(page: Page, name: string): Promise<Reading> {
  const log = page.locator('dialog[open] form.clr-timed-log')
  await expect(log).toBeVisible({ timeout: 15_000 })
  await settle(page)
  return { lines: await linesOf(log), boxes: await boxesOf(log), capture: await keep(page.locator('dialog[open]'), name), readout: null, gridHeight: null }
}

/**
 * JOURNEY-012's readable wrapping: every word a round tile draws stays on one
 * line — a tile may wrap between words, never inside one (`BURPE` / `E`).
 * Returns each word drawn across more than one line.
 */
async function brokenWords(card: Locator): Promise<string[]> {
  return card.evaluate((root) => {
    const broken: string[] = []
    for (const entry of root.querySelectorAll('.clr-ladder-prescription__grid li [aria-hidden="true"]')) {
      const node = entry.firstChild
      if (node === null || node.nodeType !== Node.TEXT_NODE) continue
      const text = node.textContent ?? ''
      for (const match of text.matchAll(/\S+/g)) {
        const range = document.createRange()
        range.setStart(node, match.index)
        range.setEnd(node, match.index + match[0].length)
        const lines = new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top)))
        if (lines.size > 1) broken.push(match[0])
      }
    }
    return broken
  })
}

type LiveMoment = 'ready' | 'running' | 'paused' | 'log' | 'undone' | 'ended'
const LIVE_MOMENTS: readonly LiveMoment[] = ['ready', 'running', 'paused', 'log', 'undone', 'ended']

/**
 * A live ladder's journey on one side: before Start; 30 seconds after Start
 * with rounds 1–2 checked off; 60 seconds into a Pause; Finish, with its log;
 * Undo finish · resume ladder (the paused attempt back with its rounds);
 * Finish again, its log closed. The browser's clock is held between steps.
 */
async function driveLive(page: Page, card: Locator, side: string): Promise<Record<LiveMoment, Reading>> {
  const ready = await read(card, `${side}-ready`)
  expect(await brokenWords(card), `${side} ready: no word broken across lines`).toEqual([])

  const now = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(now + 1_000)
  await card.getByRole('button', { name: 'Start ladder', exact: true }).click()
  await page.clock.runFor(30_000)
  await card.getByRole('button', { name: 'Complete round 2', exact: true }).click()
  await expect(card.locator('[data-ladder-prescription] [role="status"]')).toHaveText(/^2 of \d+ rounds completed$/)
  const running = await read(card, `${side}-running`)
  expect(await brokenWords(card), `${side} running: no word broken across lines`).toEqual([])

  await card.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.clock.runFor(60_000)
  await expect(card.locator('[data-timed-actions] button')).toHaveText(['Resume', 'Finish'])
  const paused = await read(card, `${side}-paused`)
  expect(await brokenWords(card), `${side} paused: no word broken across lines`).toEqual([])

  await card.getByRole('button', { name: 'Finish', exact: true }).click()
  await page.clock.runFor(1_000)
  const log = await readLog(page, `${side}-log`)

  await page.locator('dialog[open]').getByRole('button', { name: UNDO_FINISH, exact: true }).click()
  await expect(page.locator('dialog[open]')).toHaveCount(0)
  await expect(card.locator('[data-timed-actions] button')).toHaveText(['Resume', 'Finish'])
  const undone = await read(card, `${side}-undone`)
  expect(await brokenWords(card), `${side} undone: no word broken across lines`).toEqual([])

  await card.getByRole('button', { name: 'Finish', exact: true }).click()
  await page.clock.runFor(1_000)
  await expect(page.locator('dialog[open] form.clr-timed-log')).toBeVisible({ timeout: 15_000 })
  // The athlete closes the log with its framed X: the ended card, as left behind.
  await page.locator('dialog[open]').getByRole('button', { name: 'Close log' }).click()
  await expect(page.locator('dialog[open]')).toHaveCount(0)
  const ended = await read(card, `${side}-ended`)
  await page.clock.resume()
  return { ready, running, paused, log, undone, ended }
}

type CappedMoment = 'ready' | 'log' | 'ended'
const CAPPED_MOMENTS: readonly CappedMoment[] = ['ready', 'log', 'ended']

/** What each live moment must show on both sides: the journey this task wires. */
function expectLive(reading: Record<LiveMoment, Reading>, rounds: number, label: string) {
  const has = (moment: LiveMoment, pattern: RegExp) =>
    expect(reading[moment].lines.some((line) => pattern.test(line)), `${label} ${moment}: ${pattern}`).toBe(true)
  has('running', new RegExp(`^2 of ${rounds} rounds completed$`))
  has('running', /^Elapsed$/i)
  has('paused', /^Paused$/i)
  has('log', new RegExp(`^2 of ${rounds} rounds completed$`))
  has('log', /^Undo finish · resume ladder$/i)
  has('undone', new RegExp(`^2 of ${rounds} rounds completed$`))
  has('undone', /^Paused$/i)
  has('ended', /^Finished$/i)
  expect(reading.running.readout, `${label} running readout`).toBe('00:30')
  expect(reading.paused.readout, `${label} paused readout`).toBe('00:30')
  expect(reading.undone.readout, `${label} undone readout`).toBe('00:30')
  expect(reading.ended.readout, `${label} ended readout`).toBe('00:30')
}

function expectCapped(reading: Record<CappedMoment, Reading>, state: GalleryState, label: string) {
  const cap = capOf(state)
  const clock = `${String(Math.floor(cap / 60)).padStart(2, '0')}:${String(cap % 60).padStart(2, '0')}`
  expect(reading.ended.readout, `${label} ended readout`).toBe(clock)
  expect(reading.ended.lines.some((line) => /^Cap reached$/i.test(line)), `${label} ended: Cap reached`).toBe(true)
  // Nothing was checked: Incomplete with no round marked, no Undo of a cap.
  expect(reading.log.lines.some((line) => /^No rounds marked yet$/.test(line)), `${label} log: No rounds marked yet`).toBe(true)
  expect(reading.log.lines.some((line) => /Undo finish/i.test(line)), `${label} log: no Undo at the cap`).toBe(false)
}

/**
 * TASK-AC-30138C4A2AFF (owner decision 2026-11-16, Decision 2): before Start a
 * twelve-round grid fits one screen at each width — 320×568 included — on the
 * gallery state and on the route alike, and the two are drawn the same height
 * (the gallery's `ladder-12` matches the route). The bound is TASK-012
 * check-02's, unchanged: the grid is shorter than the screen.
 */
function expectTwelveFit(gallery: Reading, route: Reading, rounds: number, viewport: { width: number; height: number }, label: string) {
  if (rounds !== 12) return
  for (const [side, reading] of [['gallery', gallery], ['route', route]] as const) {
    expect(reading.gridHeight, `${side} ${label}: a round grid is drawn`).not.toBeNull()
    expect(reading.gridHeight!, `${side} ${label}: twelve rounds fit one ${viewport.width}×${viewport.height} screen`).toBeLessThan(viewport.height)
  }
  expect(Math.abs(gallery.gridHeight! - route.gridHeight!), `${label}: the gallery's grid is the route's height`).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX)
}

function receiptOf<M extends string>(
  state: string, width: number, drive: string, moments: readonly M[],
  gallery: Record<M, Reading>, route: Record<M, Reading>,
  where: { readonly route: string; readonly file: string; readonly extra?: Record<string, unknown> } = { route: '/workout', file: `${state}-phone-${width}` },
) {
  const heights = (reading: Record<M, Reading>) => Object.fromEntries(moments.map((moment) => [moment, reading[moment].gridHeight]))
  const differences = Object.fromEntries(moments.map((moment) => [moment, compare(gallery[moment].lines, route[moment].lines, LADDER_INTENDED)])) as Record<M, Difference[]>
  const layout = Object.fromEntries(moments.map((moment) => [moment, compareLayout(gallery[moment].boxes, route[moment].boxes, LADDER_LAYOUT_INTENDED)])) as Record<M, LayoutDifference[]>
  const part = (boxes: readonly Box[]) => boxes.find((box) => box.key === '(part)#0') ?? null
  writeReceipt(where.file, {
    state, width, route: where.route, drive, ...where.extra,
    galleryChanges: GALLERY_CHANGES,
    captures: Object.fromEntries(moments.flatMap((moment) => [[`gallery-${moment}`, gallery[moment].capture], [`route-${moment}`, route[moment].capture]])),
    lines: {
      gallery: Object.fromEntries(moments.map((moment) => [moment, gallery[moment].lines])),
      route: Object.fromEntries(moments.map((moment) => [moment, route[moment].lines])),
    },
    readouts: {
      gallery: Object.fromEntries(moments.map((moment) => [moment, gallery[moment].readout])),
      route: Object.fromEntries(moments.map((moment) => [moment, route[moment].readout])),
    },
    differences,
    gridHeights: { gallery: heights(gallery), route: heights(route) },
    layout: {
      method: 'element boxes',
      tolerancePx: LAYOUT_TOLERANCE_PX,
      measured: {
        gallery: Object.fromEntries(moments.map((moment) => [moment, gallery[moment].boxes.length])),
        route: Object.fromEntries(moments.map((moment) => [moment, route[moment].boxes.length])),
      },
      parts: {
        gallery: Object.fromEntries(moments.map((moment) => [moment, part(gallery[moment].boxes)])),
        route: Object.fromEntries(moments.map((moment) => [moment, part(route[moment].boxes)])),
      },
      differences: layout,
    },
  })
  return { differences, layout }
}

for (const state of STATES) {
  const open = OPEN[state]
  for (const { name, viewport } of VIEWPORTS) {
    test(`TASK-AC-FAEE8BA2A650 ${state} ${name}: /workout’s ladder matches the accepted gallery state ${open === undefined ? 'through Start, rounds checked off, Pause, Finish, its log, Undo finish and Finish again' : 'before Start and past the cap, with its log'}`, async ({ page, visit }) => {
      test.setTimeout(240_000)
      await page.setViewportSize(viewport)
      await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
      const rounds = ROUNDS[state]

      if (open === undefined) {
        // A live ladder: the same journey on both sides, on the browser clock.
        await page.clock.install({ time: ENTRY })
        await visit(`/gallery/refinements?state=${state}`)
        const galleryCard = page.locator(`[data-refinement-state="${state}"] .clr-timed-flow`)
        await expect(galleryCard).toBeVisible()
        const gallery = await driveLive(page, galleryCard, `${state}-${name}-gallery`)
        // Memory only: the gallery keeps nothing under any key.
        expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('clear.workout-')))).toEqual([])

        const app = await syntheticApp(page, ladderSession(state))
        await visit('/workout')
        const routeCard = page.locator('.clr-timed-flow[data-timed-format="ladder"]')
        await expect(routeCard).toBeVisible()
        const route = await driveLive(page, routeCard, `${state}-${name}-route`)
        // The route's attempt is the ladder's own durable record.
        expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('clear.workout-')))).toContain('clear.workout-ladders')

        const { differences, layout } = receiptOf(state, viewport.width,
          'Start; 30 s; round 2 checked off; Pause; 60 s; Finish; 1 s; Undo finish · resume ladder; Finish; 1 s; Close log — on the browser clock, held between steps',
          LIVE_MOMENTS, gallery, route)
        for (const [side, reading] of [['gallery', gallery], ['route', route]] as const) expectLive(reading, rounds, `${side} ${state} @${name}`)
        expectTwelveFit(gallery.ready, route.ready, rounds, viewport, `${state} @${name}`)
        for (const moment of LIVE_MOMENTS) expectAllIntended(differences[moment], `${state} ${moment} @${name}`)
        for (const moment of LIVE_MOMENTS) expectLayoutIntended(layout[moment], `${state} ${moment} layout @${name}`)
        app.assertContained()
        return
      }

      // A results moment: the card before Start, then past the cap with its log.
      await visit(`/gallery/refinements?state=${state}`)
      const galleryCard = page.locator(`[data-refinement-state="${state}"] .clr-timed-flow`)
      await expect(galleryCard).toBeVisible()
      const galleryReady = await read(galleryCard, `${state}-${name}-gallery-ready`)
      await page.getByRole('button', { name: open, exact: true }).click()
      const galleryLog = await readLog(page, `${state}-${name}-gallery-log`)
      await page.locator('dialog[open]').getByRole('button', { name: 'Close log' }).click()
      await expect(page.locator('dialog[open]')).toHaveCount(0)
      const galleryEnded = await read(page.locator(`[data-refinement-state="${state}"] .clr-timed-flow`), `${state}-${name}-gallery-ended`)
      const gallery = { ready: galleryReady, log: galleryLog, ended: galleryEnded }

      await page.clock.install()
      const app = await syntheticApp(page, ladderSession(state))
      await visit('/workout')
      const routeCard = page.locator('.clr-timed-flow[data-timed-format="ladder"]')
      await expect(routeCard).toBeVisible()
      const routeReady = await read(routeCard, `${state}-${name}-route-ready`)
      await routeCard.getByRole('button', { name: 'Start ladder', exact: true }).click()
      await page.clock.fastForward((capOf(state) + 1) * 1000)
      const routeLog = await readLog(page, `${state}-${name}-route-log`)
      await page.locator('dialog[open]').getByRole('button', { name: 'Close log' }).click()
      await expect(page.locator('dialog[open]')).toHaveCount(0)
      const routeEnded = await read(routeCard, `${state}-${name}-route-ended`)
      const route = { ready: routeReady, log: routeLog, ended: routeEnded }

      const { differences, layout } = receiptOf(state, viewport.width,
        `the gallery's "${open}" (Start, then its own clock past the cap); the route: Start, then the browser clock past the same cap`,
        CAPPED_MOMENTS, gallery, route)
      for (const [side, reading] of [['gallery', gallery], ['route', route]] as const) expectCapped(reading, state, `${side} ${state} @${name}`)
      expectTwelveFit(gallery.ready, route.ready, rounds, viewport, `${state} @${name}`)
      expect(rounds).toBe(ROUNDS[state])
      for (const moment of CAPPED_MOMENTS) expectAllIntended(differences[moment], `${state} ${moment} @${name}`)
      for (const moment of CAPPED_MOMENTS) expectLayoutIntended(layout[moment], `${state} ${moment} layout @${name}`)
      app.assertContained()
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// /review: each ladder's rounds, beside the accepted states' round grid
// ─────────────────────────────────────────────────────────────────────────────

/** The accepted states whose round grid (before Start) Review's grid is compared with, over the same blocks. */
const REVIEW_STATES = ['ladder-4', 'ladder-12'] as const
type ReviewState = (typeof REVIEW_STATES)[number]
/** Review draws this grid under its accepted movement rows; as with the ladder, no criterion intends a difference inside it (`LADDER_INTENDED`). */
const ROUND_GRID = 'ol[aria-label="Prescribed ladder rounds"]'

for (const { name, viewport } of VIEWPORTS) {
  test(`TASK-AC-FAEE8BA2A650 review ${name}: /review’s ladder rounds match the round grid the accepted ladder-4 and ladder-12 states draw before Start`, async ({ page, visit }) => {
    test.setTimeout(240_000)
    await page.setViewportSize(viewport)
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })

    const gallery = {} as Record<ReviewState, Reading>
    for (const state of REVIEW_STATES) {
      await visit(`/gallery/refinements?state=${state}`)
      gallery[state] = await read(page.locator(`[data-refinement-state="${state}"] .clr-timed-flow ${ROUND_GRID}`), `review-${name}-gallery-${state}`)
    }

    // The same two blocks, handed to the real /review route through its existing hand-off.
    const acceptance = parityAcceptance('TASK-105 parity review', REVIEW_STATES.map((state) => persistedBlock(GALLERY_BLOCKS[state])))
    const app = await syntheticApp(page, runningSession(acceptance), { review: acceptance })
    await visit('/review')
    await expect(page).toHaveURL(/\/review$/)
    const grids = page.locator(`[data-review-section] ${ROUND_GRID}`)
    await expect(grids).toHaveCount(REVIEW_STATES.length)
    const route = {} as Record<ReviewState, Reading>
    const cards: Record<string, { file: string; sha256: string }> = {}
    for (const [index, state] of REVIEW_STATES.entries()) {
      const grid = grids.nth(index)
      route[state] = await read(grid, `review-${name}-route-${state}`)
      // Read-only on Review: nothing in the grid is a control.
      expect(await grid.locator('button, input, a, select, textarea, [tabindex]').count(), `review ${state} @${name}: read-only`).toBe(0)
      // The whole Review card too, for the look check: the accepted movement rows, then the rounds.
      const card = grid.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " clr-card ")][1]')
      expect(await brokenWords(card), `review ${state} @${name}: no word broken across lines`).toEqual([])
      cards[`route-card-${state}`] = await keepWhole(card, `review-${name}-route-card-${state}`)
    }

    const { differences, layout } = receiptOf('ladder-4, ladder-12 (the round grid before Start)', viewport.width,
      'none: /review is read before Start; the gallery states are read before Start',
      REVIEW_STATES, gallery, route, { route: '/review', file: `review-phone-${viewport.width}`, extra: { routeCards: cards } })
    for (const state of REVIEW_STATES) {
      const rounds = ROUNDS[state]
      for (const [side, reading] of [['gallery', gallery], ['route', route]] as const) {
        expect(reading[state].lines.filter((line) => /^R\d+$/.test(line)), `${side} ${state} @${name}: every round`).toEqual(
          Array.from({ length: rounds }, (_, index) => `R${index + 1}`))
      }
      expectAllIntended(differences[state], `review ${state} @${name}`)
      expectLayoutIntended(layout[state], `review ${state} layout @${name}`)
    }
    app.assertContained()
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// /workout's scheduled ladder: no accepted state draws one
// ─────────────────────────────────────────────────────────────────────────────

type ScheduledMoment = 'ready' | 'running' | 'log' | 'ended'
const SCHEDULED_MOMENTS: readonly ScheduledMoment[] = ['ready', 'running', 'log', 'ended']
const at = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

for (const { name, viewport } of VIEWPORTS) {
  test(`TASK-AC-FAEE8BA2A650 scheduled ${name}: /workout’s scheduled ladder, which no accepted gallery state draws, kept for the look check before Start, on its clock and once its schedule has run out, with its log`, async ({ page, visit }) => {
    test.setTimeout(240_000)
    await page.setViewportSize(viewport)
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    await page.clock.install({ time: ENTRY })
    const app = await syntheticApp(page, runningSession(parityAcceptance('TASK-105 parity scheduled', [SCHEDULED_LADDER])))
    await visit('/workout')
    const card = page.locator('.clr-timed-flow[data-timed-format="ladder"]')
    await expect(card).toBeVisible()
    const side = `scheduled-${name}-route`

    const ready = await read(card, `${side}-ready`)
    expect(await brokenWords(card), `ready @${name}: no word broken across lines`).toEqual([])
    const whole: Record<string, { file: string; sha256: string }> = { 'route-ready': await keepWhole(card, `${side}-ready-whole`) }

    const now = await page.evaluate(() => Date.now())
    await page.clock.pauseAt(now + 1_000)
    await card.getByRole('button', { name: 'Start schedule', exact: true }).click()
    await page.clock.runFor((SCHEDULED_INTERVAL + 10) * 1_000)
    await expect(card.locator('li[aria-current="step"]')).toHaveAttribute('data-ladder-round', '2')
    const running = await read(card, `${side}-running`)
    expect(await brokenWords(card), `running @${name}: no word broken across lines`).toEqual([])
    whole['route-running'] = await keepWhole(card, `${side}-running-whole`)

    // The schedule runs out: the log opens by itself, at Incomplete with no round stated.
    await page.clock.runFor((SCHEDULED_INTERVAL * (SCHEDULED_ROUNDS - 1)) * 1_000)
    const log = await readLog(page, `${side}-log`)
    await page.locator('dialog[open]').getByRole('button', { name: 'Close log' }).click()
    await expect(page.locator('dialog[open]')).toHaveCount(0)
    const ended = await read(card, `${side}-ended`)
    whole['route-ended'] = await keepWhole(card, `${side}-ended-whole`)
    await page.clock.resume()
    const reading: Record<ScheduledMoment, Reading> = { ready, running, log, ended }

    const has = (moment: ScheduledMoment, pattern: RegExp) =>
      expect(reading[moment].lines.some((line) => pattern.test(line)), `${moment} @${name}: ${pattern}`).toBe(true)
    // Its own data: the timing line, every round's start, the schedule's words.
    has('ready', new RegExp(`^${EXPECTED.scheduled.timing}$`))
    has('ready', /^NOT STARTED$/i)
    for (let round = 0; round < SCHEDULED_ROUNDS; round += 1) has('ready', new RegExp(`^Starts at ${at(round * SCHEDULED_INTERVAL)}$`))
    has('ready', /^Each round starts on the clock\./)
    has('running', new RegExp(`^ROUND 2 OF ${SCHEDULED_ROUNDS}$`, 'i'))
    has('running', /^ON THE CLOCK$/i)
    has('running', new RegExp(`^${at(SCHEDULED_INTERVAL - 10)}$`))
    has('log', /^No rounds marked yet$/)
    has('ended', /^COMPLETE$/i)
    has('ended', /^The clock has run every scheduled round\./)
    expect(reading.log.lines.some((line) => /Undo finish/i.test(line)), `log @${name}: a schedule's end is not undone`).toBe(false)
    for (const moment of SCHEDULED_MOMENTS) {
      expect(reading[moment].lines.some((line) => /same every round|Move through the rounds|between each rung/i.test(line)), `${moment} @${name}: removed copy`).toBe(false)
    }
    expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('clear.workout-')))).toContain('clear.workout-ladders')

    writeReceipt(`scheduled-phone-${viewport.width}`, {
      state: null, width: viewport.width, route: '/workout',
      drive: `Start schedule; ${SCHEDULED_INTERVAL + 10} s (round 2 live); the rest of the schedule (the log opens by itself); Close log — on the browser clock, held between steps`,
      disposition: 'non-applicable',
      reason: 'No accepted gallery state (bec4454: ladder, ladder-4, ladder-12, ladder-long) draws a scheduled ladder, so there is nothing to compare; the captures are kept for the look check and its words are read against its own data (src/test/compact-ladder-fixture.ts, SCHEDULED_LADDER).',
      captures: Object.fromEntries(SCHEDULED_MOMENTS.map((moment) => [`route-${moment}`, reading[moment].capture])),
      wholeCardCaptures: whole,
      lines: { route: Object.fromEntries(SCHEDULED_MOMENTS.map((moment) => [moment, reading[moment].lines])) },
    })
    app.assertContained()
  })
}
