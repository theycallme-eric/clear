import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { REQUIRED_SCREENS } from '../required-routes'

/**
 * REQ-029 / REQ-030 / TASK-033 — what the 0.14.3 evidence lanes capture.
 *
 * The states are not restated here. TASK-001 recorded every reachable state of
 * every required screen in `docs/design/0143-intake-baseline/`, and this module
 * reads that record: a capture names a state the baseline already has, or it is
 * refused. Nothing here invents a state, a route or a sample screen.
 *
 * Pure data and Node only, so the unit suite and the browser suite read the
 * same values.
 */

/** TASK-001's record, relative to the repository root. */
export const BASELINE_INVENTORY_PATH = 'docs/design/0143-intake-baseline/route-state-inventory.json'
export const BASELINE_INTAKE_PATH = 'docs/design/0143-intake-baseline/intake-baseline.json'

/** REQ-029's four viewports, written as the numbers it states. */
export const CAPTURE_VIEWPORTS = [
  { id: 'phone', width: 390, height: 844 },
  { id: 'tablet', width: 768, height: 1024 },
  { id: 'desktop', width: 1280, height: 720 },
  // The hard edge `contained-shell.spec.ts` already holds the shell to.
  { id: 'short', width: 390, height: 320 },
] as const

export type CaptureViewport = (typeof CAPTURE_VIEWPORTS)[number]
export type CaptureViewportId = CaptureViewport['id']

/** The export's four skins; the unit suite holds this to `SKINS`. */
export const CAPTURE_SKINS = ['clear', 'vapour', 'signal', 'mono'] as const
export type CaptureSkin = (typeof CAPTURE_SKINS)[number]

/** The Playwright project a viewport is captured in. `short` resizes a phone. */
export const VIEWPORT_OF_PROJECT: Readonly<Record<string, CaptureViewportId>> = {
  mobile: 'phone',
  tablet: 'tablet',
  desktop: 'desktop',
}

export interface InventoryEntry {
  /** The IA.md §4 screen, or the non-route surface TASK-001 named. */
  readonly screen: string
  /** The route pattern, or null for a transient or non-route surface. */
  readonly route: string | null
  readonly ownerTask: string
  readonly states: readonly string[]
}

interface RecordedEntry {
  screen?: string
  route: string | null
  ownerTask: string
  reachableStates: string[]
  subRouteInventory?: RecordedEntry[]
}

interface RecordedInventory {
  task: string
  mainSha: string
  screens: RecordedEntry[]
  nonRouteStateInventory: RecordedEntry[]
}

function readJson<T>(root: string, path: string): T {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8')) as T
}

export interface BaselineInventory {
  readonly task: string
  /** The `main` commit the before-state was recorded at. */
  readonly mainSha: string
  readonly entries: readonly InventoryEntry[]
}

/** Every screen, sub-route and non-route surface TASK-001 recorded, flattened. */
export function readBaselineInventory(root: string = process.cwd()): BaselineInventory {
  const recorded = readJson<RecordedInventory>(root, BASELINE_INVENTORY_PATH)
  const entries = [...recorded.screens, ...recorded.nonRouteStateInventory].flatMap((entry) => {
    const screen = entry.screen ?? ''
    return [
      { screen, route: entry.route, ownerTask: entry.ownerTask, states: entry.reachableStates },
      // A sub-view is the same §4 screen at its own route, with its own states.
      ...(entry.subRouteInventory ?? []).map((sub) => ({
        screen,
        route: sub.route,
        ownerTask: sub.ownerTask,
        states: sub.reachableStates,
      })),
    ]
  })
  return { task: recorded.task, mainSha: recorded.mainSha, entries }
}

export interface BaselinePackages {
  /** The vendored version the before-state was recorded with. */
  readonly before: string
  /** The incoming version every after-state is captured with. */
  readonly after: string
}

export function readBaselinePackages(root: string = process.cwd()): BaselinePackages {
  const intake = readJson<{ source: { version: string; installedBaseline: { version: string } } }>(
    root,
    BASELINE_INTAKE_PATH,
  )
  return { before: intake.source.installedBaseline.version, after: intake.source.version }
}

/** The baseline's entry for a screen at a route, or undefined when it has none. */
export function baselineEntry(
  inventory: BaselineInventory,
  screen: string,
  route: string | null,
): InventoryEntry | undefined {
  return inventory.entries.find((entry) => entry.screen === screen && entry.route === route)
}

export interface CaptureTarget {
  readonly screen: string
  /** The route pattern the baseline records for it. */
  readonly route: string
  /** The concrete URL asked for. */
  readonly path: string
  /** The `<h1>`'s accessible name once the route has resolved. */
  readonly heading: string
  /** One of the baseline's `reachableStates` for this screen and route. */
  readonly state: string
  /** Text that is on screen only in that state. */
  readonly stateText: string
}

/**
 * The authenticated states the scoped session user is already in.
 *
 * `authenticatedSession` onboards a returning athlete with one place and no
 * history, so each of these is that user's real state at that route — reached
 * through the guards with the app's own stored session, not a sample screen and
 * not a protected route's Welcome redirect. States that need seeded history, an
 * active session or a failing read are captured by their owning evidence task
 * with the same schema.
 */
export const AUTHENTICATED_CAPTURE_TARGETS: readonly CaptureTarget[] = [
  {
    screen: 'Home',
    route: '/',
    path: '/',
    heading: 'Today',
    state: 'no-history',
    stateText: 'No workouts yet',
  },
  {
    screen: 'Generate',
    route: '/generate',
    path: '/generate',
    heading: 'Generate workout',
    state: 'first-or-stale-history-manual-focus',
    // This first-workout member of the baseline state excludes history-read errors.
    stateText: 'CLEAR needs a starting workout. Choose the focus for this one.',
  },
  {
    screen: 'History',
    route: '/history',
    path: '/history',
    heading: 'History',
    state: 'no-workouts-empty',
    stateText: 'No workouts yet',
  },
  {
    screen: 'Settings',
    route: '/settings',
    path: '/settings',
    heading: 'Settings',
    state: 'preferences-populated',
    stateText: 'Manage places',
  },
  {
    screen: 'Settings',
    route: '/settings/locations',
    path: '/settings/locations',
    heading: 'Places and equipment',
    state: 'list-populated',
    stateText: 'Session journey gym',
  },
]

/** Whether the required inventory serves `path` behind the protected guard. */
export function isProtectedPath(path: string): boolean {
  return REQUIRED_SCREENS.some(
    (entry) =>
      entry.guard === 'protected' && (entry.path === path || (entry.subPaths ?? []).includes(path)),
  )
}
