import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'

import {
  buildCaptureRecord,
  captureIdentity,
  capturePairId,
  captureTarget,
  hashTree,
  pairCaptures,
  type CaptureDriver,
  type CaptureIdentity,
  type MotionObservation,
} from '../../e2e/design-0143/capture'
import {
  CLEAR_0143_SINGLE_GENERATION_GUARD,
  installDeterministicCapture,
  SINGLE_GENERATION_LANE,
  singleGenerationGuard,
} from '../../e2e/design-0143/fixtures'
import {
  AUTHENTICATED_CAPTURE_TARGETS,
  baselineEntry,
  BASELINE_INVENTORY_PATH,
  CAPTURE_SKINS,
  CAPTURE_VIEWPORTS,
  isProtectedPath,
  readBaselineInventory,
  readBaselinePackages,
  VIEWPORT_OF_PROJECT,
} from '../../e2e/design-0143/state-inventory'
import { REQUIRED_SCREENS } from '../../e2e/required-routes'
import { createGenerationBudget, MODEL_ROUTE } from '../../e2e/support/generation-budget'
import { MOBILE_VIEWPORT, TABLET_VIEWPORT } from '../../playwright.config'
import { SKINS } from '../design-system/skin'

/**
 * TASK-033 (#379) — the 0.14.3 evidence harness, proved without a browser, a
 * backend or a model. The browser half is `e2e/design-0143/baseline.spec.ts`;
 * what is held here is everything that decides whether a capture or a live
 * generation is allowed to happen at all.
 */

const root = resolve(import.meta.dirname, '../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf-8')

const ENDPOINT = 'https://fixture.supabase.co/functions/v1/generate-workout'
const HOME = AUTHENTICATED_CAPTURE_TARGETS[0]
const MOTION: MotionObservation = { reducedMotion: false, running: [], settled: true }
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

const packages = readBaselinePackages(root)
const identityFor = (packageVersion: string): CaptureIdentity => ({
  packageName: 'clear-design-system',
  packageVersion,
  packageHash: 'a'.repeat(64),
  runtimeSourceHash: 'b'.repeat(64),
  applicationCommit: 'c'.repeat(40),
  testedDeployment: 'local-dev-server',
})

/** A browser stand-in that records the order it was asked for things. */
function fakeDriver(reached: Partial<Awaited<ReturnType<CaptureDriver['observe']>>> = {}) {
  const calls: string[] = []
  const driver: CaptureDriver = {
    observe: async (target) => {
      calls.push('observe')
      return { pathname: target.path, heading: target.heading, stateVisible: true, ...reached }
    },
    motion: async () => {
      calls.push('motion')
      return MOTION
    },
    screenshot: async (name) => {
      calls.push(`screenshot:${name}`)
      return PNG
    },
  }
  return { driver, calls }
}

const request = { target: HOME, viewport: 'phone', skin: 'clear', root } as const

describe('authenticated routes are reached before they are captured', () => {
  it('targets only protected routes, each in a state TASK-001 recorded', () => {
    const inventory = readBaselineInventory(root)

    expect(AUTHENTICATED_CAPTURE_TARGETS.length).toBeGreaterThan(0)
    for (const target of AUTHENTICATED_CAPTURE_TARGETS) {
      expect(isProtectedPath(target.path), target.path).toBe(true)
      expect(baselineEntry(inventory, target.screen, target.route)?.states, target.path).toContain(
        target.state,
      )
      expect(target.heading.trim(), target.path).not.toBe('')
      expect(target.stateText.trim(), target.path).not.toBe('')
    }
    // Welcome is where a protected route sends a visitor with no session.
    expect(isProtectedPath('/welcome')).toBe(false)
  })

  it('observes, then reads motion, then screenshots — in that order', async () => {
    const { driver, calls } = fakeDriver()
    const record = await captureTarget(driver, { ...request, identity: identityFor(packages.before) })

    expect(calls).toEqual(['observe', 'motion', `screenshot:${record.pairId}.png`])
    expect(record.reached).toEqual({ pathname: '/', heading: 'Today', stateVisible: true })
  })

  it.each([
    ['a guard redirect', { pathname: '/welcome', heading: 'CLEAR' }, 'expected /, the browser is at /welcome'],
    ['another heading', { heading: 'Page not found' }, 'expected the heading "Today"'],
    ['another state', { stateVisible: false }, 'is not in the "no-history" state'],
  ])('takes no screenshot after %s', async (_, reached, message) => {
    const { driver, calls } = fakeDriver(reached)

    await expect(captureTarget(driver, request)).rejects.toThrow(message)
    expect(calls).toEqual(['observe'])
  })

  it('drives the real session through the scanning fixture, never a stubbed route', () => {
    const spec = read('e2e/design-0143/baseline.spec.ts')

    expect(spec).toContain("from '../support/authenticated-session'")
    expect(spec).toContain('authenticatedPage: page')
    expect(spec).toContain('await visit(target.path)')
    expect(spec).toContain('test.skip(!backend.available, backend.reason)')
    expect(spec.match(/test\.skip\(/g)).toHaveLength(1)
    expect(spec).not.toMatch(/page\.goto\(|route\.fulfill\(|page\.route\(/)
    // The capture follows navigation and precedes every assertion on its record.
    expect(spec.indexOf('await captureTarget(')).toBeGreaterThan(spec.indexOf('await visit('))
  })
})

describe('the capture schema binds a screenshot to what it shows', () => {
  it('records package, runtime source, viewport, skin, state, screenshot and motion', () => {
    const record = buildCaptureRecord({
      ...request,
      identity: identityFor(packages.before),
      reached: { pathname: '/', heading: 'Today', stateVisible: true },
      motion: { reducedMotion: true, running: ['clr-scan'], settled: false },
      screenshot: { name: 'home.png', bytes: PNG },
    })

    expect(record).toMatchObject({
      schema: 1,
      phase: 'before',
      identity: { packageVersion: packages.before, packageHash: 'a'.repeat(64), runtimeSourceHash: 'b'.repeat(64) },
      viewport: { id: 'phone', ...MOBILE_VIEWPORT },
      skin: 'clear',
      screen: 'Home',
      route: '/',
      state: 'no-history',
      motion: { reducedMotion: true, running: ['clr-scan'], settled: false },
      screenshot: { name: 'home.png', bytes: PNG.byteLength, explicit: true },
      deterministic: true,
      liveGeneration: false,
    })
    expect(record.screenshot.sha256).toBe(
      '0f4636c78f65d3639ece5a064b5ae753e3408614a14fb18ab4d7540d2c248543',
    )
    expect(record.pairId).toBe(capturePairId(HOME, 'phone', 'clear'))
    expect(record.pairId).toBe('home--root--no-history--phone--clear')
  })

  it('hashes the installed package and the runtime source of this tree', () => {
    const identity = captureIdentity(root, {})
    const manifest = JSON.parse(read('src/design-system/package.json')) as { version: string }

    expect(identity.packageVersion).toBe(manifest.version)
    expect(identity.packageHash).toMatch(/^[0-9a-f]{64}$/)
    expect(identity.runtimeSourceHash).toMatch(/^[0-9a-f]{64}$/)
    expect(identity.packageHash).not.toBe(identity.runtimeSourceHash)
    expect(identity.packageHash).toBe(hashTree(root, ['src/design-system']))
    expect(identity.testedDeployment).toBe('local-dev-server')
  })

  it('changes the hash when a byte or a path changes, and skips what it is told to', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clear-0143-'))
    try {
      writeFileSync(join(dir, 'a.ts'), 'one')
      writeFileSync(join(dir, 'a.test.ts'), 'test')
      const skipTests = (path: string) => path.endsWith('.test.ts')
      const first = hashTree(dir, ['.'], skipTests)

      writeFileSync(join(dir, 'a.test.ts'), 'changed')
      expect(hashTree(dir, ['.'], skipTests)).toBe(first)
      expect(hashTree(dir, ['.'])).not.toBe(first)
      writeFileSync(join(dir, 'a.ts'), 'two')
      expect(hashTree(dir, ['.'], skipTests)).not.toBe(first)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('maps each before/after pair to its TASK-001 baseline state', async () => {
    const capture = (version: string, target = HOME) =>
      captureTarget(fakeDriver().driver, { ...request, target, identity: identityFor(version) })
    const before = await capture(packages.before)
    const after = await capture(packages.after)
    const beforeOnly = await capture(packages.before, AUTHENTICATED_CAPTURE_TARGETS[2])

    expect([before.phase, after.phase]).toEqual(['before', 'after'])
    const inventory = readBaselineInventory(root)
    const paired = pairCaptures([before, after, beforeOnly])
    expect(paired.pairs).toEqual([
      {
        pairId: before.pairId,
        baseline: {
          task: 'TASK-001',
          inventory: BASELINE_INVENTORY_PATH,
          mainSha: inventory.mainSha,
          screen: 'Home',
          route: '/',
          state: 'no-history',
        },
        before,
        after,
      },
    ])
    expect(paired.unpairedBefore).toEqual([beforeOnly.pairId])
    expect(paired.unpairedAfter).toEqual([])
    expect(() => pairCaptures([before, before])).toThrow('captured twice in the before phase')
  })

  it.each([
    ['a state the baseline does not record', { target: { ...HOME, state: 'sample-data' } }, 'records no "sample-data" state'],
    ['an empty screenshot', { screenshot: { name: 'home.png', bytes: new Uint8Array() } }, 'taken, not inferred'],
    ['an unknown package', { identity: identityFor('1.0.0') }, 'is neither the'],
    ['a missing runtime-source hash', { identity: { ...identityFor(packages.before), runtimeSourceHash: '' } }, 'no runtime-source hash'],
    ['an unreached route', { reached: { pathname: '/welcome', heading: 'CLEAR', stateVisible: true } }, 'was not reached'],
  ])('refuses %s', (_, override, message) => {
    expect(() =>
      buildCaptureRecord({
        ...request,
        identity: identityFor(packages.before),
        reached: { pathname: '/', heading: 'Today', stateVisible: true },
        motion: MOTION,
        screenshot: { name: 'home.png', bytes: PNG },
        ...override,
      }),
    ).toThrow(message)
  })

  it('covers every required screen, the four skins and the four viewports', () => {
    const inventory = readBaselineInventory(root)

    for (const { screen, route } of REQUIRED_SCREENS) {
      expect(baselineEntry(inventory, screen, route)?.states.length, screen).toBeGreaterThan(1)
    }
    expect(baselineEntry(inventory, 'Settings', '/settings/locations')?.ownerTask).toBe('TASK-024')
    expect(baselineEntry(inventory, 'BootSequence', null)?.states).toEqual([
      'checking',
      'failed-retry',
      'ready',
    ])
    expect([...CAPTURE_SKINS]).toEqual(SKINS)
    expect(CAPTURE_VIEWPORTS.map(({ id }) => id)).toEqual(['phone', 'tablet', 'desktop', 'short'])
    expect(CAPTURE_VIEWPORTS[0]).toMatchObject(MOBILE_VIEWPORT)
    expect(CAPTURE_VIEWPORTS[1]).toMatchObject(TABLET_VIEWPORT)
    expect(VIEWPORT_OF_PROJECT).toEqual({ mobile: 'phone', tablet: 'tablet', desktop: 'desktop' })
  })
})

describe('the live lane spends one generation, and only the core loop can', () => {
  const guard = (specFile = `/checkout/${SINGLE_GENERATION_LANE}`) => {
    const budget = createGenerationBudget(ENDPOINT)
    const dispatch = singleGenerationGuard({
      marker: CLEAR_0143_SINGLE_GENERATION_GUARD,
      specFile,
      budget,
    })
    return { budget, dispatch }
  }

  it('forwards the first POST, aborts the second, and never counts a preflight', () => {
    const { budget, dispatch } = guard()

    expect(dispatch('OPTIONS', ENDPOINT)).toBe('pass')
    expect(budget.snapshot()).toEqual({ attempted: 0, forwarded: 0, blocked: 0 })

    expect(dispatch('POST', ENDPOINT)).toBe('forward')
    expect(dispatch('OPTIONS', ENDPOINT)).toBe('pass')
    expect(dispatch('GET', ENDPOINT)).toBe('pass')
    expect(budget.snapshot()).toEqual({ attempted: 1, forwarded: 1, blocked: 0 })

    expect(dispatch('POST', ENDPOINT)).toBe('abort')
    expect(dispatch('POST', ENDPOINT)).toBe('abort')
    expect(budget.snapshot()).toEqual({ attempted: 3, forwarded: 1, blocked: 2 })
  })

  it('aborts a POST to any other model endpoint, and everything after it', () => {
    const { budget, dispatch } = guard()

    expect(dispatch('POST', ENDPOINT.replace('generate-workout', 'generate-section'))).toBe('abort')
    expect(dispatch('POST', ENDPOINT)).toBe('abort')
    expect(budget.snapshot()).toEqual({ attempted: 2, forwarded: 0, blocked: 2 })
  })

  it.each([
    ['another spec', CLEAR_0143_SINGLE_GENERATION_GUARD, '/checkout/e2e/design-0143/baseline.spec.ts'],
    ['a look-alike file', CLEAR_0143_SINGLE_GENERATION_GUARD, '/checkout/e2e/not-core-loop.spec.ts'],
    ['a missing marker', '', `/checkout/${SINGLE_GENERATION_LANE}`],
  ])('refuses %s before any request is decided', (_, marker, specFile) => {
    const budget = createGenerationBudget(ENDPOINT)

    expect(() => singleGenerationGuard({ marker, specFile, budget })).toThrow(
      'Only e2e/core-loop.spec.ts may opt in to a live generation.',
    )
    expect(budget.snapshot()).toEqual({ attempted: 0, forwarded: 0, blocked: 0 })
  })

  it('is named by the core-loop spec alone', () => {
    const specs: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (entry.name.endsWith('.ts')) specs.push(relative(root, path))
      }
    }
    walk(resolve(root, 'e2e'))

    expect(
      specs.filter((path) => read(path).includes('CLEAR_0143_SINGLE_GENERATION_GUARD')).sort(),
    ).toEqual(['e2e/core-loop.spec.ts', 'e2e/design-0143/fixtures.ts'])
  })

  it('is installed before navigation and leaves the live answer unstubbed', () => {
    const spec = read('e2e/core-loop.spec.ts')
    const marker = spec.indexOf('marker: CLEAR_0143_SINGLE_GENERATION_GUARD')
    const installed = spec.indexOf('await page.route(MODEL_ROUTE')

    expect(marker).toBeGreaterThan(-1)
    expect(spec).toContain('specFile: testInfo.file')
    expect(installed).toBeGreaterThan(marker)
    expect(spec.indexOf('await visit(')).toBeGreaterThan(installed)
    expect(spec).toContain('const decision = dispatch(request.method(), request.url())')
    expect(spec).toContain("if (decision === 'pass') return route.continue()")
    expect(spec).toContain("if (decision === 'abort') return route.abort('blockedbyclient')")
    // The original assertions stand: one request seen, one forwarded, a real answer relayed.
    expect(spec).toContain(
      "expect(generationRequests, 'generation was retried or repeated').toHaveLength(1)",
    )
    expect(spec).toContain('expect(budget.snapshot()).toEqual({ attempted: 1, forwarded: 1, blocked: 0 })')
    expect(spec).toContain('await route.fulfill({ response })')
    expect(spec).toContain('test.skip(!liveModelEnabled, liveModelReason)')
  })

  it('lets a deterministic capture lane generate nothing at all', async () => {
    type Handler = (route: unknown) => unknown
    let handler: Handler = () => undefined
    const page = {
      route: vi.fn(async (pattern: RegExp, installed: Handler) => {
        expect(pattern).toBe(MODEL_ROUTE)
        handler = installed
      }),
      emulateMedia: vi.fn(async () => undefined),
      addInitScript: vi.fn(async () => undefined),
    }
    const route = (method: string) => ({
      request: () => ({ method: () => method }),
      continue: vi.fn(),
      abort: vi.fn(),
    })

    const network = await installDeterministicCapture(
      page as unknown as Parameters<typeof installDeterministicCapture>[0],
      { skin: 'mono', reducedMotion: true },
    )
    const preflight = route('OPTIONS')
    const first = route('POST')
    await handler(preflight)
    await handler(first)

    expect(preflight.continue).toHaveBeenCalledTimes(1)
    expect(first.abort).toHaveBeenCalledWith('blockedbyclient')
    expect(first.continue).not.toHaveBeenCalled()
    expect(network.blockedGenerations()).toBe(1)
    expect(page.emulateMedia).toHaveBeenCalledWith({ reducedMotion: 'reduce' })
    expect(page.addInitScript).toHaveBeenCalledWith(expect.any(Function), {
      key: 'clear.skin',
      value: 'mono',
    })
  })
})
