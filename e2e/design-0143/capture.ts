import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  baselineEntry,
  BASELINE_INVENTORY_PATH,
  CAPTURE_SKINS,
  CAPTURE_VIEWPORTS,
  readBaselineInventory,
  readBaselinePackages,
  type CaptureSkin,
  type CaptureTarget,
  type CaptureViewportId,
} from './state-inventory'

/**
 * REQ-030 / TASK-033 — the capture record every 0.14.3 evidence lane writes.
 *
 * A screenshot is evidence only with what it is a screenshot *of*: which
 * package, which application source, which viewport, skin and state, and what
 * was moving when it was taken. This module binds those together and refuses a
 * record that is missing any of them.
 *
 * Two rules are enforced here rather than left to each caller:
 *
 *  * **Reached, then captured.** `captureTarget` asks the driver what the
 *    browser is showing and takes nothing until the route, heading and state
 *    are the target's. A protected route that resolved to Welcome is a failure,
 *    not a picture of Welcome filed under another screen's name.
 *  * **Explicit, not inferred.** The screenshot is the bytes this call took.
 *    Playwright's `only-on-failure` artefact is never a capture, so a green run
 *    has evidence because it asked for it.
 *
 * Nothing here imports Playwright; the driver is supplied by
 * `e2e/design-0143/fixtures.ts`, and the unit suite supplies its own.
 */

export const CAPTURE_SCHEMA_VERSION = 1

const SHA256 = /^[0-9a-f]{64}$/

/**
 * A stable digest of every file under `paths`: sorted relative path, then
 * bytes. `skip` receives the path relative to `root`.
 */
export function hashTree(
  root: string,
  paths: readonly string[],
  skip: (relative: string) => boolean = () => false,
): string {
  const files: string[] = []
  const walk = (relative: string) => {
    if (skip(relative)) return
    if (!statSync(resolve(root, relative)).isDirectory()) {
      files.push(relative)
      return
    }
    for (const name of readdirSync(resolve(root, relative))) walk(join(relative, name))
  }
  for (const path of paths) walk(path)

  const hash = createHash('sha256')
  for (const file of files.sort()) {
    hash.update(file).update('\0').update(readFileSync(resolve(root, file))).update('\0')
  }
  return hash.digest('hex')
}

const PACKAGE_DIR = 'src/design-system'

/** The application source a browser runs: not the vendor tree, not the tests. */
const isNotRuntimeSource = (relative: string) =>
  relative === PACKAGE_DIR ||
  relative === 'src/test' ||
  relative === 'src/dev' ||
  /\.test\.tsx?$/.test(relative)

export interface CaptureIdentity {
  readonly packageName: string
  readonly packageVersion: string
  /** Digest of the vendored design system exactly as installed. */
  readonly packageHash: string
  /** Digest of the application source the browser was served. */
  readonly runtimeSourceHash: string
  /** The commit checked out, or null outside a repository. */
  readonly applicationCommit: string | null
  /** The origin tested: a deployment URL, or the local dev server. */
  readonly testedDeployment: string
}

const identities = new Map<string, CaptureIdentity>()

/** Computed once per process; the tree does not change under a run. */
export function captureIdentity(
  root: string = process.cwd(),
  env: Record<string, string | undefined> = process.env,
): CaptureIdentity {
  const cached = identities.get(root)
  if (cached) return cached

  const manifest = JSON.parse(readFileSync(resolve(root, PACKAGE_DIR, 'package.json'), 'utf8')) as {
    name: string
    version: string
  }
  let applicationCommit: string | null
  try {
    applicationCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    applicationCommit = null
  }

  const identity: CaptureIdentity = {
    packageName: manifest.name,
    packageVersion: manifest.version,
    packageHash: hashTree(root, [PACKAGE_DIR]),
    runtimeSourceHash: hashTree(root, ['index.html', 'src'], isNotRuntimeSource),
    applicationCommit,
    testedDeployment: env.E2E_BASE_URL ?? 'local-dev-server',
  }
  identities.set(root, identity)
  return identity
}

export type CapturePhase = 'before' | 'after'

/** What the browser was showing when it was asked. */
export interface ReachedObservation {
  readonly pathname: string
  readonly heading: string
  readonly stateVisible: boolean
}

export interface MotionObservation {
  /** Whether `prefers-reduced-motion: reduce` matched. */
  readonly reducedMotion: boolean
  /** Names of the animations and transitions still running at capture. */
  readonly running: readonly string[]
  readonly settled: boolean
}

export interface ScreenshotObservation {
  readonly name: string
  readonly sha256: string
  readonly bytes: number
  /** Taken by this capture, never a failure artefact. */
  readonly explicit: true
}

export interface BaselineReference {
  readonly task: string
  readonly inventory: string
  readonly mainSha: string
  readonly screen: string
  readonly route: string
  readonly state: string
}

export interface CaptureRecord {
  readonly schema: typeof CAPTURE_SCHEMA_VERSION
  readonly phase: CapturePhase
  /** Shared by the before and the after capture of the same thing. */
  readonly pairId: string
  readonly identity: CaptureIdentity
  readonly viewport: { readonly id: CaptureViewportId; readonly width: number; readonly height: number }
  readonly skin: CaptureSkin
  readonly screen: string
  readonly route: string
  readonly state: string
  readonly reached: ReachedObservation
  readonly screenshot: ScreenshotObservation
  readonly motion: MotionObservation
  readonly baseline: BaselineReference
  /** A capture fixture's state is arranged; it is never live generation proof. */
  readonly deterministic: true
  readonly liveGeneration: false
}

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'root'

export function capturePairId(
  target: Pick<CaptureTarget, 'screen' | 'route' | 'state'>,
  viewport: CaptureViewportId,
  skin: CaptureSkin,
): string {
  return [slug(target.screen), slug(target.route), slug(target.state), viewport, skin].join('--')
}

/** Throws unless the browser is on the target's route, heading and state. */
export function verifyReached(target: CaptureTarget, reached: ReachedObservation): void {
  if (reached.pathname !== target.path) {
    throw new Error(
      `${target.screen} was not reached: expected ${target.path}, the browser is at ${reached.pathname}.`,
    )
  }
  if (reached.heading !== target.heading) {
    throw new Error(
      `${target.screen} was not reached: expected the heading "${target.heading}", found "${reached.heading}".`,
    )
  }
  if (!reached.stateVisible) {
    throw new Error(`${target.screen} is not in the "${target.state}" state; nothing was captured.`)
  }
}

export interface CaptureInput {
  readonly target: CaptureTarget
  readonly viewport: CaptureViewportId
  readonly skin: CaptureSkin
  readonly reached: ReachedObservation
  readonly motion: MotionObservation
  readonly screenshot: { readonly name: string; readonly bytes: Uint8Array }
  readonly identity?: CaptureIdentity
  readonly root?: string
}

/** Bind one capture to its identity and its TASK-001 baseline, or refuse it. */
export function buildCaptureRecord(input: CaptureInput): CaptureRecord {
  const { target, reached, motion, screenshot } = input
  const root = input.root ?? process.cwd()
  const identity = input.identity ?? captureIdentity(root)

  const viewport = CAPTURE_VIEWPORTS.find((candidate) => candidate.id === input.viewport)
  if (!viewport) throw new Error(`"${input.viewport}" is not a capture viewport.`)
  if (!CAPTURE_SKINS.includes(input.skin)) throw new Error(`"${input.skin}" is not a skin.`)
  for (const [name, value] of [
    ['package hash', identity.packageHash],
    ['runtime-source hash', identity.runtimeSourceHash],
  ]) {
    if (!SHA256.test(value)) throw new Error(`The capture has no ${name}.`)
  }

  verifyReached(target, reached)

  const inventory = readBaselineInventory(root)
  const entry = baselineEntry(inventory, target.screen, target.route)
  if (!entry?.states.includes(target.state)) {
    throw new Error(
      `${inventory.task} records no "${target.state}" state for ${target.screen} at ${target.route}.`,
    )
  }

  // Before is the package TASK-001 recorded; after is the one it took in.
  const packages = readBaselinePackages(root)
  const phase: CapturePhase | null =
    identity.packageVersion === packages.before
      ? 'before'
      : identity.packageVersion === packages.after
        ? 'after'
        : null
  if (phase === null) {
    throw new Error(
      `Package ${identity.packageVersion} is neither the ${packages.before} baseline nor ${packages.after}.`,
    )
  }

  if (screenshot.bytes.byteLength === 0) {
    throw new Error(`${target.screen} has no screenshot; a capture is taken, not inferred.`)
  }

  return {
    schema: CAPTURE_SCHEMA_VERSION,
    phase,
    pairId: capturePairId(target, viewport.id, input.skin),
    identity,
    viewport: { id: viewport.id, width: viewport.width, height: viewport.height },
    skin: input.skin,
    screen: target.screen,
    route: target.route,
    state: target.state,
    reached,
    screenshot: {
      name: screenshot.name,
      sha256: createHash('sha256').update(screenshot.bytes).digest('hex'),
      bytes: screenshot.bytes.byteLength,
      explicit: true,
    },
    motion,
    baseline: {
      task: inventory.task,
      inventory: BASELINE_INVENTORY_PATH,
      mainSha: inventory.mainSha,
      screen: target.screen,
      route: target.route,
      state: target.state,
    },
    deterministic: true,
    liveGeneration: false,
  }
}

/** What a capture needs from a browser, so the order can be proved without one. */
export interface CaptureDriver {
  observe(target: CaptureTarget): Promise<ReachedObservation>
  motion(): Promise<MotionObservation>
  screenshot(name: string): Promise<Uint8Array>
}

export interface CaptureRequest {
  readonly target: CaptureTarget
  readonly viewport: CaptureViewportId
  readonly skin: CaptureSkin
  readonly identity?: CaptureIdentity
  readonly root?: string
}

/** Verify the target was reached, then — and only then — capture it. */
export async function captureTarget(
  driver: CaptureDriver,
  request: CaptureRequest,
): Promise<CaptureRecord> {
  const reached = await driver.observe(request.target)
  verifyReached(request.target, reached)

  const motion = await driver.motion()
  const name = `${capturePairId(request.target, request.viewport, request.skin)}.png`
  const bytes = await driver.screenshot(name)
  return buildCaptureRecord({ ...request, reached, motion, screenshot: { name, bytes } })
}

export interface CapturePair {
  readonly pairId: string
  readonly baseline: BaselineReference
  readonly before: CaptureRecord
  readonly after: CaptureRecord
}

export interface PairedCaptures {
  readonly pairs: readonly CapturePair[]
  /** Pair ids captured in one phase only; reported, never dropped. */
  readonly unpairedBefore: readonly string[]
  readonly unpairedAfter: readonly string[]
}

/** Match each after-capture to the before-capture of the same baseline state. */
export function pairCaptures(records: readonly CaptureRecord[]): PairedCaptures {
  const byPhase = (phase: CapturePhase) => {
    const found = new Map<string, CaptureRecord>()
    for (const record of records) {
      if (record.phase !== phase) continue
      if (found.has(record.pairId)) {
        throw new Error(`${record.pairId} was captured twice in the ${phase} phase.`)
      }
      found.set(record.pairId, record)
    }
    return found
  }
  const before = byPhase('before')
  const after = byPhase('after')

  const pairs: CapturePair[] = []
  for (const [pairId, record] of before) {
    const match = after.get(pairId)
    if (!match) continue
    if (JSON.stringify(match.baseline) !== JSON.stringify(record.baseline)) {
      throw new Error(`${pairId} maps to two different baseline states.`)
    }
    pairs.push({ pairId, baseline: record.baseline, before: record, after: match })
  }
  return {
    pairs,
    unpairedBefore: [...before.keys()].filter((pairId) => !after.has(pairId)),
    unpairedAfter: [...after.keys()].filter((pairId) => !before.has(pairId)),
  }
}
