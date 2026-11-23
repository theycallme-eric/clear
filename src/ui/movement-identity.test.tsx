/**
 * Movement identity on the real routes: each movement's name with its compact
 * equipment beside it, in Review and in Workout.
 *
 * TASK-029 (REQ-029; C56; R122, R132; JOURNEY-029), carried onto Round 7
 * (gallery bec4454) by A3 TASK-118: the verified equipment asset inventory and
 * its readable fallback on the real `/review`, `/workout` and Setup equipment
 * surfaces. TASK-112 adds TASK-002's block (context-specific actions with
 * compact equipment) to this file and reuses the shared route harness and
 * `expectCompactEquipment` below unchanged.
 *
 * Review is the actual `/review` route (router, guard, handoff and briefing);
 * Workout is the actual `/workout` route the Start handoff navigates to, with
 * the same composition persisted and started through the session client seam.
 * The shared stylesheets are applied to the document so the declared face and
 * wrapping contract are read from the cascade, not from inline styles. Browser
 * geometry is `e2e/refinement/task-029.spec.ts`.
 *
 * Synthetic data only: in-memory doubles, no account and no network.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'

import type { CandidatesClient } from '../data/candidates'
import type { SessionsClient } from '../data/sessions'
import { EQUIPMENT_LABEL } from '../app/Review'
import { REVIEW_PATH } from '../app/ReviewRoute'
import { routes } from '../app/router'
import * as PublicEntry from '../design-system/index'
import { ASSET_BLOCKS, ASSET_EQUIPMENT_LABELS } from '../dev/gallery-refinement-assets-data'
import { peerGroupingAcceptance } from '../dev/gallery-refinement-cards-data'
import { GalleryRefinements } from '../dev/gallery-refinements'
import { createError, ErrorCode, err, ok, type Result } from '../state/errors'
import { EQUIPMENT, STEP_TITLES } from '../state/onboarding'
import { QueryClient } from '../state/query'
import { reviewHandoff } from '../state/review-handoff'
import type { SessionAcceptance, SessionSnapshot } from '../state/schemas'
import {
  CONTEXT_LISTS,
  CONTEXT_STRUCTURES,
  type ContextStructure,
} from '../test/context-actions-fixture'
import { peerGroupingSnapshot } from '../test/peer-grouping-fixture'
import { AppProviders, renderApp, signedIn } from '../test/render'
import { createFakeUserDataClient, FIXTURE_USER_ID, notOnboardedProfile } from '../test/user-data-double'
import { createWorkoutDouble } from '../test/workout-double'
import {
  EFFORT_FACES,
  EQUIPMENT_ASSETS,
  equipmentGlyph,
  ROUND_FACE_EXCEPTION,
  SHIPPED_EQUIPMENT_ICONS,
  SHIPPED_ICON_COUNT,
  WANTED_REVIEW_LABELS,
} from './refinements/equipment-assets'
import { SET_EFFORT_CHOICES } from './set-effort'

const ROOT = resolve(import.meta.dirname, '../..')

beforeAll(() => {
  // The shared owners' stylesheets and the shared text role, as the browser
  // receives them: Round 7's movement identity (movement-presentation.css) and
  // its inline equipment beside the name (workout-r7.css). jsdom reports each
  // declared value from the cascade.
  for (const file of [
    'src/styles/text-roles.css',
    'src/styles/movement-presentation.css',
    'src/styles/workout-r7.css',
  ]) {
    const style = document.createElement('style')
    style.dataset.movementIdentity = file
    style.textContent = readFileSync(resolve(ROOT, file), 'utf8')
    document.head.append(style)
  }
})

function declared(element: Element, property: string): string {
  return getComputedStyle(element).getPropertyValue(property).trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// The lists each context draws (shared with the browser proof)
// ─────────────────────────────────────────────────────────────────────────────

const LISTS = CONTEXT_LISTS
type Context = keyof typeof LISTS
type Structure = ContextStructure
const STRUCTURES = CONTEXT_STRUCTURES

// ─────────────────────────────────────────────────────────────────────────────
// The route harness
// ─────────────────────────────────────────────────────────────────────────────

interface JourneyOptions {
  acceptFails?: boolean
  candidates?: Partial<CandidatesClient>
}

function journeyDouble(acceptance: SessionAcceptance, options: JourneyOptions = {}) {
  const startedAt = new Date(Date.now() - 60_000).toISOString()
  const prescribed = peerGroupingSnapshot(acceptance, { userId: FIXTURE_USER_ID })
  const running = peerGroupingSnapshot(acceptance, { userId: FIXTURE_USER_ID, startedAt })
  const calls = { accepted: [] as SessionAcceptance[], started: [] as string[] }
  let started = false
  const sessions: Partial<SessionsClient> = {
    async accept(_userId, payload) {
      calls.accepted.push(payload)
      return options.acceptFails === true
        ? err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))
        : (ok(prescribed) as Result<SessionSnapshot>)
    },
    async start(sessionId) {
      calls.started.push(sessionId)
      started = true
      return ok({ session: running.session, state: 'active' as const })
    },
    async resume() {
      return ok(started ? running : null)
    },
    async snapshot() {
      return ok(running)
    },
  }
  const double = createWorkoutDouble({ session: null, sessions, candidates: options.candidates })
  return { double, calls }
}

/** The entry: the real router at `/review`, handed this composition. */
async function openReview(acceptance: SessionAcceptance, options: JourneyOptions = {}) {
  const { double, calls } = journeyDouble(acceptance, options)
  const router = createMemoryRouter(routes, {
    initialEntries: ['/', { pathname: REVIEW_PATH, state: reviewHandoff(acceptance) }],
    initialIndex: 1,
  })
  render(
    <AppProviders {...signedIn({ workout: double.clients })}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  await screen.findByRole('heading', { level: 1, name: acceptance.workout.title })
  return { router, calls, double }
}

/** The action: Start, then the `/workout` route the handoff lands on. */
async function startWorkout(router: ReturnType<typeof createMemoryRouter>, firstList: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Start workout' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/workout'))
  await screen.findByRole('list', { name: firstList })
}

function list(context: Context, structure: Structure): HTMLElement {
  return screen.getByRole('list', { name: LISTS[context][structure] })
}

/**
 * The rows of one structure in one context. Every Workout block and every
 * grouped Review block is a named list; Round 7's Review draws a standard
 * block's rows straight in its card's movement group, with no list around
 * them, so that group is the scope.
 */
function rows(context: Context, structure: Structure): HTMLElement {
  if (context === 'workout' || structure !== 'standard') return list(context, structure)
  const groups = [...document.querySelectorAll<HTMLElement>('[data-review-section] .clr-movement-group')].filter((group) =>
    group.querySelector('ol, .clr-movement-group') === null && group.querySelector('.clr-movement-identity') !== null)
  expect(groups, 'one standard block on Review').toHaveLength(1)
  return groups[0]
}

/** Each movement's identity in a scope, in order (Round 7's `MovementIdentity`). */
function identities(scope: HTMLElement): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>('.clr-movement-identity')]
}

/** The movement's own name: the name's words, without a group ordinal or its equipment. */
function nameOf(identity: HTMLElement): string {
  const context = identity.querySelector<HTMLElement>(':scope > [data-movement-name-row] > .clr-movement-identity__name > [data-movement-context]')
  const words = (context?.previousElementSibling ?? identity.querySelector('.clr-movement-identity__name')) as HTMLElement
  return [...words.childNodes]
    .filter((node) => !(node instanceof HTMLElement && node.classList.contains('clr-movement-identity__ordinal')))
    .map((node) => node.textContent ?? '')
    .join('')
}

/**
 * C03, R132: the compact equipment is readable text beside the name. Round 7
 * (bec4454, `equipmentPlacement: 'name'`) draws it inside the name's own
 * element, directly after the movement's name, as one inline reading that
 * wraps with the name — never a line of its own, never below the
 * prescription and never an icon alone.
 */
function expectCompactEquipment(identity: HTMLElement, equipment: string) {
  const nameRow = identity.querySelector<HTMLElement>(':scope > [data-movement-name-row]')!
  const name = nameRow.querySelector<HTMLElement>(':scope > .clr-movement-identity__name')!
  const context = name.querySelector<HTMLElement>(':scope > [data-movement-context]')!
  expect(context, 'equipment beside the name').not.toBeNull()
  // Beside the name: the reading directly after the movement's own words.
  const words = context.previousElementSibling as HTMLElement
  expect(words, 'the movement name before its equipment').not.toBeNull()
  expect(words.nextElementSibling).toBe(context)
  expect(words).not.toContainElement(context)
  expect(name).toContainElement(context)
  expect(context.textContent).toBe(equipment)
  // Text fallback: a readable word, not a glyph standing in for it.
  expect(context.querySelector('svg, img')).toBeNull()
  // Only one equipment reading on the movement, and none below the prescription.
  expect(identity.querySelectorAll('[data-movement-context]')).toHaveLength(1)
  // Readable wrapping: the equipment is inline text in the name's own line
  // box, so it moves under the name as a unit inside the name's column.
  expect(declared(name, 'overflow-wrap')).toBe('anywhere')
  expect(declared(name, 'min-width')).toMatch(/^0(px)?$/)
  expect(declared(context, 'display')).toBe('inline')
  expect(declared(context, 'font-size')).toBe('var(--label-xs-size)')
  expect(declared(context, 'color')).toBe('var(--text-secondary)')
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK-029 (REQ-029; C56; R122, R132; JOURNEY-029) — the verified equipment
// asset inventory and the readable fallback, on the real /review, /workout and
// Setup equipment surfaces. Composition: `gallery-refinement-assets-data.ts`,
// every Setup equipment id once and the Wall ball review's medicine ball.
// Browser geometry is `e2e/refinement/task-029.spec.ts`.
// ─────────────────────────────────────────────────────────────────────────────

/** The 75 shipped icons, by name, in source order (R122's verified inventory). */
const SHIPPED_ICON_NAMES = [
  'ChevronRight', 'ChevronLeft', 'ChevronDown', 'ChevronUp', 'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown',
  'SortAsc', 'SortDesc', 'Menu', 'X', 'Plus', 'Minus', 'Check', 'Search', 'Filter', 'Sliders', 'Trash', 'Copy',
  'Download', 'Upload', 'Share', 'Play', 'Pause', 'Stop', 'Skip', 'Pencil', 'Maximize2', 'Lock', 'Unlock', 'Key',
  'LogIn', 'LogOut', 'Calendar', 'CalendarCheck', 'Clock', 'Stopwatch', 'Rest', 'RefreshCw', 'Loader2',
  'CircleCheck', 'CircleX', 'CircleAlert', 'AlertCircle', 'AlertTriangle', 'HelpCircle', 'Info', 'Eye', 'EyeOff',
  'Bell', 'BellOff', 'Zap', 'Flame', 'Star', 'Trophy', 'Dumbbell', 'WeightPlate', 'Pulse', 'Streak', 'Circuit',
  'Ladder', 'Superset', 'Log', 'FileText', 'Gauge', 'Target', 'Crosshair', 'User', 'Frown', 'Meh', 'Smile',
  'SmilePlus', 'ThumbsDown', 'ThumbsUp',
] as const

/**
 * sha256 of `src/design-system/assets/icons.tsx` at the accepted gallery
 * reference eded158 (identical on this integration base). Adopting a new
 * glyph is the recorded follow-up: it changes this pin, `SHIPPED_ICON_NAMES`,
 * `equipment-assets.ts` and the wanted list together, deliberately.
 */
const SHIPPED_ICONS_SHA256 = '8368e49bce23ce890c195736e22c28f68b2ce5a18be7a689696285caf8c1224d'

const WANTED_LIST = 'docs/design/library/refinements-2026-11-04/authority/EQUIPMENT-ICON-WANTED-LIST.md'

const assetAcceptance = () => peerGroupingAcceptance({ blocks: ASSET_BLOCKS })

/** Each structure's equipment labels, in order, read from a context's lists. */
function equipmentLabels(context: Context): string[][] {
  return STRUCTURES.map((structure) =>
    identities(rows(context, structure)).map((identity) => identity.querySelector('[data-movement-context]')!.textContent ?? ''))
}

/** AC-R029-02: every movement's equipment is the readable label beside its name, glyph or none. */
function expectEveryLabelReadable(context: Context) {
  expect(equipmentLabels(context)).toEqual(ASSET_EQUIPMENT_LABELS)
  for (const structure of STRUCTURES) {
    for (const identity of identities(rows(context, structure))) {
      const label = identity.querySelector('[data-movement-context]')!.textContent!
      expect(label.trim().length, 'a readable word, never an empty slot').toBeGreaterThan(0)
      expectCompactEquipment(identity, label)
    }
  }
}

/** Review's Required equipment group: the label beside the one shipped category glyph, then words. */
function expectRequiredEquipmentReadable() {
  const summary = document.querySelector<HTMLElement>('.clr-equipment-summary')!
  expect(summary).not.toBeNull()
  const label = summary.querySelector<HTMLElement>('.clr-equipment-summary__label')!
  expect(label.textContent).toBe(EQUIPMENT_LABEL)
  const glyphs = summary.querySelectorAll('svg')
  expect(glyphs, 'one category glyph, beside its label').toHaveLength(1)
  expect(glyphs[0].closest('[aria-hidden="true"]')).not.toBeNull()
  expect(glyphs[0].outerHTML).toBe(renderToStaticMarkup(<PublicEntry.Dumbbell size={16} />))
  const names = within(summary).getByRole('list', { name: EQUIPMENT_LABEL })
  const items = within(names).getAllByRole('listitem')
  expect(items.map((item) => item.textContent)).toEqual(ASSET_EQUIPMENT_LABELS.flat().filter((name) => name !== 'bodyweight'))
  for (const item of items) expect(item.querySelector('svg, img')).toBeNull()
}

/** Setup's own equipment step, through the real route and its guard. */
async function openSetupEquipment() {
  const userData = createFakeUserDataClient({
    profile: async () => ok(notOnboardedProfile()),
    locations: async () => ok([]),
  })
  const user = userEvent.setup()
  // A cold cache, so the guard reads this athlete's profile rather than a warm onboarded one.
  renderApp(['/onboarding'], signedIn({ userData, queryClient: new QueryClient() }))
  await screen.findByRole('heading', { level: 2, name: STEP_TITLES.location })
  await user.click(screen.getByRole('radio', { name: 'Home gym' }))
  return { user, group: screen.getByRole('group', { name: 'Equipment' }) }
}

describe('TASK-029 equipment asset inventory and readable fallback', () => {
  it('AC-C56-01 preserves the verified equipment inventory: the 75 shipped icons unchanged, Dumbbell and WeightPlate the only equipment glyphs, and Setup’s 16 equipment ids', () => {
    // The icon family: 75 named icons, byte-identical to the accepted reference.
    const source = readFileSync(resolve(ROOT, 'src/design-system/assets/icons.tsx'), 'utf8')
    expect(createHash('sha256').update(source).digest('hex')).toBe(SHIPPED_ICONS_SHA256)
    const exported = [...source.matchAll(/^export const (\w+)/gm)].map((match) => match[1])
    expect(exported).toEqual([...SHIPPED_ICON_NAMES])
    expect(exported).toHaveLength(SHIPPED_ICON_COUNT)
    // The public entry re-exports every one of them (`index.js` from `./assets/icons`).
    expect(readFileSync(resolve(ROOT, 'src/design-system/index.js'), 'utf8')).toMatch(/\} from '\.\/assets\/icons';/)
    for (const name of SHIPPED_ICON_NAMES) {
      expect(typeof (PublicEntry as Record<string, unknown>)[name], `${name} from the public entry`).toBe('function')
    }
    // No equipment glyph beyond the two verified ones exists or is assumed.
    expect(exported.filter((name) => /kettle|barbell|medicine|band|roller|rope|bike|rower|bench|box/i.test(name))).toEqual([])
    expect(SHIPPED_EQUIPMENT_ICONS.map(({ glyph }) => glyph)).toEqual(['Dumbbell', 'WeightPlate'])

    // The taxonomy is Setup's own, read, not redefined: 16 ids in Setup's order.
    expect(EQUIPMENT_ASSETS.map(({ id, label }) => ({ value: id, label }))).toEqual(EQUIPMENT.map(({ value, label }) => ({ value, label })))
    expect(EQUIPMENT_ASSETS).toHaveLength(16)
    expect(EQUIPMENT_ASSETS.filter(({ glyph }) => glyph !== null).map(({ id, glyph }) => [id, glyph])).toEqual([['dumbbells', 'Dumbbell']])
    expect(EQUIPMENT_ASSETS.filter(({ status }) => status === 'wanted')).toHaveLength(15)
    // WeightPlate is plates only: never a stand-in for barbell or any other missing kind.
    expect(EQUIPMENT.map(({ value }) => equipmentGlyph(value)).filter((glyph) => glyph === 'WeightPlate')).toEqual([])
    expect(equipmentGlyph('barbell')).toBeNull()
    expect(equipmentGlyph('bodyweight'), 'User is not assumed to mean bodyweight').toBeNull()
  })

  it('AC-C56-01 keeps the equipment wanted list in step with the inventory: every Setup id’s glyph status and next step, the medicine ball as a review label', () => {
    const doc = readFileSync(resolve(ROOT, WANTED_LIST), 'utf8')
    const rows = new Map(
      [...doc.matchAll(/^\| ([^|]+) \/ ([^|]+?) \| ([^|]+) \| ([^|]+) \|$/gm)]
        .map(([, label, id, status, next]) => [id.trim(), { label: label.trim(), status: status.trim(), next: next.trim() }]),
    )
    const nextWords = { 'reuse': /^Reuse the actual shared icon/, 'first-batch': /^First[ -]batch/, 'text-decision': /^Decide whether a compact text label is sufficient/, 'catalog-backlog': /^Catalog coverage backlog/ }
    for (const asset of EQUIPMENT_ASSETS) {
      const row = rows.get(asset.id)
      expect(row, `${asset.id} is on the wanted list`).toBeDefined()
      expect(row!.status, asset.id).toMatch(asset.glyph === null ? /^(Missing|No dedicated)/ : new RegExp(`^${asset.glyph} exists`))
      expect(row!.next, asset.id).toMatch(nextWords[asset.next])
    }
    const [medicine] = WANTED_REVIEW_LABELS
    expect(rows.get('review label')).toMatchObject({ label: medicine.label, status: expect.stringMatching(/^Missing; not a current 16-item setup option/) })
    expect(rows.get('review label')!.next).toMatch(nextWords[medicine.next])
    expect(rows.get('supplementary glyph')?.status).toBe('WeightPlate exists')
    // The selected placement and the explicit follow-up are both recorded.
    expect(doc).toMatch(/icon-only equipment is not selected/)
    expect(doc).toMatch(/## Follow-up \(explicit, not scheduled by TASK-029\)/)
    expect(doc).toMatch(/\*\*75\*\* named icons/)
  })

  it('AC-R029-01 preserves the approved round effort faces: only Frown, Meh, Smile and SmilePlus are round, and Effort still reuses Frown, Meh and Smile', () => {
    const round = SHIPPED_ICON_NAMES.filter((name) => {
      const Icon = (PublicEntry as unknown as Record<string, (props: { size?: number }) => React.ReactElement>)[name]
      return renderToStaticMarkup(<Icon />).includes('<circle')
    })
    expect(round).toEqual([...ROUND_FACE_EXCEPTION])
    for (const face of ROUND_FACE_EXCEPTION) {
      const Icon = (PublicEntry as unknown as Record<string, () => React.ReactElement>)[face]
      // Line-drawn: an unfilled, stroked round outline, as approved.
      expect(renderToStaticMarkup(<Icon />)).toMatch(/<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor"/)
    }
    // The Effort control keeps its faces: the shipped components themselves.
    expect(SET_EFFORT_CHOICES.map(({ Glyph }) => Glyph)).toEqual(EFFORT_FACES.map((face) => (PublicEntry as Record<string, unknown>)[face]))
  })

  it('AC-R029-01 reads the Wall ball’s medicine ball as composed equipment without inventing a medicine-ball setup id', async () => {
    expect(EQUIPMENT.filter(({ value, label }) => /medicine/i.test(`${value} ${label}`))).toEqual([])
    expect(WANTED_REVIEW_LABELS).toEqual([expect.objectContaining({ label: 'Medicine ball', equipment: 'medicine-ball', setupId: null })])

    // Review and Workout say "medicine ball" beside Wall ball, in words.
    const { router } = await openReview(assetAcceptance())
    const [wallBall] = identities(list('review', 'circuit'))
    expect(nameOf(wallBall)).toBe('wall ball')
    expectCompactEquipment(wallBall, 'medicine ball')
    await startWorkout(router, LISTS.workout.superset)
    expectCompactEquipment(identities(list('workout', 'circuit'))[0], 'medicine ball')
  })

  it('AC-R029-01 Setup equipment offers exactly the 16 Setup equipment choices, each named in words, and no medicine ball', async () => {
    const { user, group } = await openSetupEquipment()
    const choices = within(group).getAllByRole('checkbox')
    expect(choices.map((choice) => choice.getAttribute('aria-label') ?? (choice as HTMLInputElement).labels?.[0]?.textContent?.trim())).toEqual(EQUIPMENT.map(({ label }) => label))
    for (const { label } of EQUIPMENT) {
      expect(within(group).getByRole('checkbox', { name: label })).toBeInTheDocument()
      expect(within(group).getByText(label)).toBeVisible()
    }
    expect(within(group).queryByRole('checkbox', { name: /medicine/i })).toBeNull()
    for (const choice of choices) {
      const row = choice.closest('label') ?? choice.parentElement!
      expect(row.textContent!.trim().length, 'each choice carries its readable label').toBeGreaterThan(0)
    }
    // The choices remain controls: a label answers, and nothing is committed by reading.
    const barbell = within(group).getByRole('checkbox', { name: 'Barbell' })
    expect(barbell).not.toBeChecked()
    await user.click(within(group).getByText('Barbell'))
    expect(barbell).toBeChecked()
  })

  it('AC-R029-02 JOURNEY-029 reads every equipment kind as a readable label beside its name in Review and Workout, glyph or none, and Review’s Required equipment in words', async () => {
    const { router, calls } = await openReview(assetAcceptance())
    expectEveryLabelReadable('review')
    expectRequiredEquipmentReadable()
    // Lack of glyphs does not block the placement: the kinds with no shipped
    // glyph are labelled exactly as the one kind that has one.
    const kinds = new Set(ASSET_EQUIPMENT_LABELS.flat())
    expect(kinds.size).toBe(17)

    await startWorkout(router, LISTS.workout.superset)
    expectEveryLabelReadable('workout')
    expect(calls.started).toHaveLength(1)
    // The live heading names the movement alone; its equipment is beside it.
    expect(screen.getByRole('heading', { name: 'dumbbell bench press' })).toBeInTheDocument()
  })

  it('JOURNEY-029 recovery: a failed Start keeps Review’s equipment labels and Required equipment as they were and records no work', async () => {
    const { router, calls } = await openReview(assetAcceptance(), { acceptFails: true })
    const before = equipmentLabels('review')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Start workout' }))
    expect(await screen.findByText('Couldn’t start this workout')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(REVIEW_PATH)
    expect(calls.started).toEqual([])
    expect(equipmentLabels('review')).toEqual(before)
    expectEveryLabelReadable('review')
    expectRequiredEquipmentReadable()
  })

  it('renders the accepted gallery state assets: the shared equipment inventory, then the routes’ own Review, Workout and Setup equipment as readable labels', async () => {
    render(
      <MemoryRouter initialEntries={['/gallery/refinements?state=assets']}>
        <GalleryRefinements />
      </MemoryRouter>,
    )
    const state = document.querySelector<HTMLElement>('[data-refinement-state="assets"]')!
    expect(state).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Equipment and icon inventory' })).toHaveAttribute('aria-current', 'page')
    // Round 7's state is the inventory card: the selected placement, the
    // shipped glyphs, Setup's equipment with its glyph status, and the wanted
    // medicine ball. The routes' own Review, Workout and Setup equipment are
    // read on the routes (the cases above and task-029.spec.ts).
    const inventory = within(state).getByRole('heading', { name: 'Equipment icon inventory' }).closest<HTMLElement>('.clr-card')!
    expect(inventory).toHaveTextContent('Equipment names remain readable beside movement names.')
    const items = within(inventory).getAllByRole('listitem')
    // Every Setup id once, in Setup's order, each named in words with the
    // status the shared inventory gives it.
    expect(items.map((row) => row.textContent)).toEqual(EQUIPMENT_ASSETS.map(({ label, status }) =>
      `${label} · ${status === 'shipped' ? 'Dumbbell available' : 'equipment glyph wanted / text fallback'}`))
    for (const [index, row] of items.entries()) expect(row.textContent).toContain(EQUIPMENT[index].label)
    for (const row of items) expect(row.querySelector('svg, img')).toBeNull()
    // The two shipped equipment glyphs, the public entry's own, each named.
    const shipped = [...inventory.querySelectorAll('svg')]
    expect(shipped).toHaveLength(2)
    expect(shipped.map((glyph) => glyph.outerHTML)).toEqual(SHIPPED_EQUIPMENT_ICONS.map(({ glyph }) => {
      const Icon = (PublicEntry as unknown as Record<string, (props: { 'aria-hidden'?: string }) => React.ReactElement>)[glyph]
      return renderToStaticMarkup(<Icon aria-hidden="true" />)
    }))
    expect(shipped.map((glyph) => glyph.parentElement!.textContent!.trim())).toEqual(['Dumbbell · shipped', 'WeightPlate · shipped supplementary glyph'])
    expect(within(inventory).getByText(/^Medicine ball is also wanted from the Wall ball review\./)).toHaveTextContent(/not a current Setup equipment ID/)

    // The gallery draws the owners the routes draw (GAL-02, GAL-06).
    const scenes = readFileSync(resolve(ROOT, 'src/dev/gallery-refinement-scenes.tsx'), 'utf8')
    expect(scenes).toMatch(/import \{ EQUIPMENT, ONBOARDING_STEPS \} from '\.\.\/state\/onboarding'/)
    expect(scenes).toMatch(/<EquipmentSummary equipment=/)
    expect(scenes).toMatch(/<Dumbbell aria-hidden="true" \/> Dumbbell · shipped/)
  })
})
