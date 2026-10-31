import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer as createNetServer, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Locator, Page, TestInfo } from '@playwright/test'
import { createServer, type Plugin } from 'vite'

import { createError, ErrorCode } from '../src/state/errors'
import { expect, test as scanned } from './fixtures'

/**
 * error-role-consistency (TASK-001, REQ-001..003, issue #601).
 *
 * R22: the shared ErrorView's accent bar painted a different role from its
 * error frame and icon. The owner is `src/ui/view-state.tsx#ErrorView`. The
 * bar and the emission are siblings of the EmptyState body, so the released
 * body-only `--brd` never reached them; inside AppDialog the bar also read the
 * dialog's already resolved `--brd`. The correction scopes both existing hooks
 * (`--border-card`, `--brd`) to `--border-toast-negative` on the alert root,
 * as in corrected prototype c0d5782.
 *
 * Every case runs against servers this file starts itself, never the shared
 * preview: a fresh Vite server over this checkout (the candidate), and an
 * isolated baseline server over the same checkout whose only difference is
 * that the owner module is served from the released base's git object. The
 * candidate's file on disk is never rewritten; its hash is checked after.
 *
 * Contract, read after the document's applied `data-skin` is the requested
 * skin and its transitions have settled: frame (body ::after), bar (both inset
 * shadows), and emission (bleed) all paint `--border-toast-negative`, and the
 * glyph paints `--icon-toast-negative`, each resolved where the view sits.
 *
 * Data is synthetic: placeholder Supabase origin on `.invalid`, fake clients
 * in the consumer fixture, no account or database writes, no generation.
 */
const REPO_ROOT = resolve(import.meta.dirname, '..')
const RELEASED_BASE = '65522e93d60d439ad82a545833812a58095f2216'
const CORRECTED_PROTOTYPE = 'c0d5782bf9bec8065b5e224c9d3b4f35a9dded17'
const OWNER = 'src/ui/view-state.tsx'
const OWNER_PATH = resolve(REPO_ROOT, OWNER)
const RELEASED_OWNER = execFileSync('git', ['show', `${RELEASED_BASE}:${OWNER}`], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
})
const sha = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16)
const CANDIDATE_OWNER_HASH = sha(readFileSync(OWNER_PATH, 'utf8'))

const SKINS = ['clear', 'vapour', 'signal', 'mono'] as const
type Skin = (typeof SKINS)[number]
const WIDTHS = [320, 390] as const
const GALLERY = '/gallery/app?component=ErrorView'
const FIXTURE = '/e2e/fixtures/error-role-context.html'

const STANDALONE = ['with onRetry', 'without onRetry', 'with a requestId'] as const
const DIALOG_TRIGGER = 'Show failure in a dialog'
const GENERATE_TITLES = {
  profile: 'Your profile didn’t load',
  places: 'Your places didn’t load',
} as const
const GUARD_TITLE = 'Your account didn’t load'
const NETWORK_MESSAGE = createError(ErrorCode.NETWORK_OFFLINE).message
/** `M12 2.5L23 21.5H1L12 2.5Z…` is the AlertTriangle outline in the 0.14.3 icon set. */
const ALERT_TRIANGLE = 'M12 2.5L23 21.5H1L12 2.5Z'

/** The released owner from git, in place of the candidate's module, for this server only. */
function releasedOwner(): Plugin {
  return {
    name: 'error-role-released-owner',
    enforce: 'pre',
    load(id) {
      if (id.split('?')[0] === OWNER_PATH) return RELEASED_OWNER
    },
  }
}

function freePort() {
  return new Promise<number>((settle, fail) => {
    const probe = createNetServer()
    probe.once('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => settle(port))
    })
  })
}

type Source = 'candidate' | 'baseline'

async function serve(source: Source, use: (origin: string) => Promise<void>) {
  // Placeholders, never forwarded: the gallery and the fixture make no account traffic.
  process.env.VITE_SUPABASE_URL = 'https://synthetic-error-role.supabase.invalid'
  process.env.VITE_SUPABASE_ANON_KEY = 'synthetic-error-role-public-placeholder'
  const cacheDir = mkdtempSync(join(tmpdir(), `clear-error-role-${source}-`))
  const port = await freePort()
  const server = await createServer({
    configFile: resolve(REPO_ROOT, 'vite.config.ts'),
    root: REPO_ROOT,
    cacheDir,
    logLevel: 'error',
    clearScreen: false,
    plugins: source === 'baseline' ? [releasedOwner()] : [],
    server: { host: '127.0.0.1', port, strictPort: true, hmr: false },
  })
  try {
    await server.listen()
    const origin = `http://127.0.0.1:${port}`
    // This checkout's own server, serving the owner this source names.
    expect((await fetch(`${origin}/@fs${resolve(REPO_ROOT, 'package.json')}`)).ok).toBe(true)
    const owner = await (await fetch(`${origin}/${OWNER}`)).text()
    const aliased = /["']--brd["']:\s*["']var\(--border-toast-negative\)["'],?\s*\}/.test(owner)
      && /["']--border-card["']:\s*["']var\(--border-toast-negative\)["']/.test(owner)
    expect(aliased, `${source} server serves the ${source === 'candidate' ? 'corrected' : 'released'} owner`)
      .toBe(source === 'candidate')
    await use(origin)
  } finally {
    await server.close()
    rmSync(cacheDir, { recursive: true, force: true })
  }
}

const test = scanned.extend<object, { candidateOrigin: string; baselineOrigin: string }>({
  candidateOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => serve('candidate', use),
    { scope: 'worker', timeout: 120_000 },
  ],
  baselineOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => serve('baseline', use),
    { scope: 'worker', timeout: 120_000 },
  ],
  baseURL: async ({ candidateOrigin }, use) => use(candidateOrigin),
})

// One worker holds the servers; a failure restarts it for the remaining cases.
test.describe.configure({ mode: 'default' })

test.afterAll(() => {
  // The baseline never touched the candidate's tracked owner.
  expect(sha(readFileSync(OWNER_PATH, 'utf8'))).toBe(CANDIDATE_OWNER_HASH)
})

interface RoleReading {
  appliedSkin: string | null
  appliedWidth: number
  frame: number[]
  bar: number[]
  barTint: number[]
  emission: number[]
  expected: number[]
  icon: number[] | null
  expectedIcon: number[]
  matches: boolean
  iconMatches: boolean
  fits: boolean
}

/** Reads one alert root's painted roles, normalising every colour through a canvas pixel. */
function readRoles(alert: Locator): Promise<RoleReading> {
  return alert.evaluate((root) => {
    const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    context.globalCompositeOperation = 'copy'
    const pixel = (color: string) => {
      context.fillStyle = 'rgba(0, 0, 0, 0)'
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return Array.from(context.getImageData(0, 0, 1, 1).data)
    }
    const shadowColor = (shadow: string, index: number) =>
      shadow.split(/,(?![^(]*\))/)[index]!.trim().match(/^[a-z-]+\([^)]*\)|^#[0-9a-f]+|^[a-z]+/i)![0]
    const resolved = (host: Element, value: string) => {
      const probe = document.createElement('span')
      probe.style.color = value
      host.appendChild(probe)
      const color = getComputedStyle(probe).color
      probe.remove()
      return pixel(color)
    }
    const near = (a: number[], b: number[], channels = 4) =>
      a.slice(0, channels).every((value, index) => Math.abs(value - b[index]!) <= 2)

    const body = root.querySelector('.clr-card__body')!
    const bar = root.querySelector('.clr-card__bar')!
    const bleed = root.querySelector('.clr-bleed')!
    const shadow = getComputedStyle(bar).boxShadow
    const frame = pixel(getComputedStyle(body, '::after').backgroundColor)
    const barEdge = pixel(shadowColor(shadow, 0))
    const barTint = pixel(shadowColor(shadow, 1))
    const emission = resolved(bleed, 'var(--bleed)')
    const expected = resolved(root.parentElement!, 'var(--border-toast-negative)')
    const glyph = [...root.querySelectorAll('svg path')].find((path) =>
      path.getAttribute('d')?.startsWith('M12 2.5L23 21.5H1L12 2.5Z'))
    const iconHost = glyph?.closest('svg')?.parentElement
    const icon = iconHost ? pixel(getComputedStyle(iconHost).color) : null
    const expectedIcon = resolved(root.parentElement!, 'var(--icon-toast-negative)')
    const box = root.getBoundingClientRect()
    return {
      appliedSkin: document.documentElement.dataset.skin ?? null,
      appliedWidth: innerWidth,
      frame,
      bar: barEdge,
      barTint,
      emission,
      expected,
      icon,
      expectedIcon,
      matches: near(frame, expected) && near(barEdge, expected) && near(barTint, expected, 3)
        && near(emission, expected),
      iconMatches: icon !== null && near(icon, expectedIcon),
      fits: box.left >= 0 && box.right <= innerWidth
        && document.documentElement.scrollWidth <= innerWidth,
    }
  })
}

/** Every chamfer, bar and bleed outside an alert, for released-appearance comparisons. */
function readOrdinaryPaint(page: Page) {
  return page.evaluate(() => {
    const scope = document.querySelector('main') ?? document.body
    const outside = (element: Element) => element.closest('[role="alert"]') === null
    return {
      frames: [...scope.querySelectorAll('.clr-chamfer')].filter(outside).map((element) => {
        const after = getComputedStyle(element, '::after')
        const before = getComputedStyle(element, '::before')
        return `${after.backgroundColor} | ${before.backgroundColor}`
      }),
      bars: [...scope.querySelectorAll('.clr-card__bar')].filter(outside)
        .map((element) => getComputedStyle(element).boxShadow),
      bleeds: [...scope.querySelectorAll('.clr-bleed')].filter(outside)
        .map((element) => getComputedStyle(element).getPropertyValue('--bleed').trim()),
    }
  })
}

/** Reads a contained ErrorView's host card roles and anything framed inside the alert. */
function readContainment(alert: Locator) {
  return alert.evaluate((root) => {
    const hostBody = root.closest('.clr-card__body')!
    const hostBar = hostBody.parentElement!.querySelector(':scope > .clr-card__bar')!
    const hostBleed = hostBody.closest('.clr-bleed')!
    return {
      // Card parts only: the Retry button's own element frame is allowed inside a card.
      nested: root.querySelectorAll('.clr-card, .clr-card__bar, .clr-card__body').length,
      frame: getComputedStyle(hostBody, '::after').backgroundColor,
      bar: getComputedStyle(hostBar).boxShadow,
      emission: getComputedStyle(hostBleed).getPropertyValue('--bleed').trim(),
      expected: getComputedStyle(hostBleed.parentElement!).getPropertyValue('--border-card').trim(),
    }
  })
}

/** The applied skin is the requested one and its colour transitions have finished. */
async function settledSkin(page: Page, skin: Skin) {
  await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
  // Bounded: an unrelated control may hold a transition that never finishes.
  await page.evaluate(async () => {
    await Promise.race([
      Promise.all(document.getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => animation.finished.catch(() => undefined))),
      new Promise((settle) => setTimeout(settle, 1_000)),
    ])
    await new Promise((settle) => requestAnimationFrame(() => requestAnimationFrame(settle)))
  })
}

async function chooseGallerySkin(page: Page, skin: Skin) {
  await page.locator('.clr-dev-gallery__chrome').getByRole('radio', { name: skin, exact: true }).click()
  await settledSkin(page, skin)
}

function specimen(page: Page, state: string) {
  return page.locator('.clr-dev-gallery__specimen').filter({
    has: page.getByRole('heading', { name: state, exact: true }),
  })
}

async function openDialogSpecimen(page: Page) {
  await specimen(page, 'inside an AppDialog').getByRole('button', { name: DIALOG_TRIGGER }).click()
  const dialog = page.getByRole('dialog', { name: 'Swap exercise' })
  await expect(dialog.getByRole('alert')).toBeVisible()
  return dialog
}

async function closeDialog(page: Page) {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

function noAccountTraffic(page: Page) {
  const requests: string[] = []
  page.on('request', (request) => {
    if (/\/(auth|rest|functions)\/v1\//.test(request.url())) requests.push(request.url())
  })
  return requests
}

/** Attached to the report and kept in this case's output directory as source-labelled evidence. */
async function record(testInfo: TestInfo, name: string, body: unknown) {
  const json = JSON.stringify(body, null, 2)
  writeFileSync(testInfo.outputPath(name), json)
  await testInfo.attach(name, { body: json, contentType: 'application/json' })
}

const SOURCES = {
  canonicalOwner: `${OWNER}#ErrorView`,
  registryEntry: 'src/dev/gallery-registry.tsx · ErrorView',
  releasedBase: RELEASED_BASE,
  correctedPrototype: CORRECTED_PROTOTYPE,
}

test('error-role-consistency: the released owner mismatches in an isolated baseline', async ({ page, visit, baselineOrigin }, testInfo) => {
  const accountRequests = noAccountTraffic(page)
  const contexts: unknown[] = []
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 })
    await visit(`${baselineOrigin}${GALLERY}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    for (const skin of SKINS) {
      await chooseGallerySkin(page, skin)
      for (const state of STANDALONE) {
        const reading = await readRoles(specimen(page, state).getByRole('alert'))
        contexts.push({ source: 'baseline', context: `gallery ${state}`, skin, width, ...reading })
        expect(reading.matches, `released ${state} bar differs from its frame (${skin} ${width})`).toBe(false)
      }
      const dialog = await openDialogSpecimen(page)
      await settledSkin(page, skin)
      const reading = await readRoles(dialog.getByRole('alert'))
      contexts.push({ source: 'baseline', context: 'gallery inside an AppDialog', skin, width, ...reading })
      expect(reading.matches, `released dialog bar differs from its frame (${skin} ${width})`).toBe(false)
      await closeDialog(page)
    }
    for (const [mode, title] of Object.entries(GENERATE_TITLES)) {
      for (const skin of SKINS) {
        await visit(`${baselineOrigin}${FIXTURE}?mode=${mode}&skin=${skin}`)
        const alert = page.getByRole('alert').filter({ hasText: title })
        await expect(alert).toBeVisible()
        await settledSkin(page, skin)
        const reading = await readRoles(alert)
        contexts.push({ source: 'baseline', context: `Generate ${mode}-read failure`, skin, width, ...reading })
        expect(reading.matches, `released Generate ${mode} bar differs (${skin} ${width})`).toBe(false)
      }
    }
  }
  await record(testInfo, 'error-role-baseline.json', { ...SOURCES, server: baselineOrigin, contexts })
  expect(accountRequests).toEqual([])
})

test('error-role-consistency: gallery ErrorView specimens and the AppDialog context match across skins and widths', async ({ page, visit, checkA11y, candidateOrigin }, testInfo) => {
  const accountRequests = noAccountTraffic(page)
  const contexts: unknown[] = []
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 })
    await visit(GALLERY)
    for (const skin of SKINS) {
      await chooseGallerySkin(page, skin)
      for (const state of STANDALONE) {
        const reading = await readRoles(specimen(page, state).getByRole('alert'))
        contexts.push({ source: 'candidate', context: `gallery ${state}`, skin, width, ...reading })
        expect(reading, `${state} (${skin} ${width})`).toMatchObject({ matches: true, iconMatches: true, fits: true })
      }
      const dialog = await openDialogSpecimen(page)
      await settledSkin(page, skin)
      const reading = await readRoles(dialog.getByRole('alert'))
      contexts.push({ source: 'candidate', context: 'gallery inside an AppDialog', skin, width, ...reading })
      expect(reading, `dialog (${skin} ${width})`).toMatchObject({ matches: true, iconMatches: true, fits: true })
      if (skin === 'signal') await checkA11y()
      await closeDialog(page)
    }
  }
  // A direct reload re-renders the same entry with the same roles.
  await page.reload()
  await chooseGallerySkin(page, 'signal')
  for (const state of STANDALONE) {
    expect(await readRoles(specimen(page, state).getByRole('alert'))).toMatchObject({ matches: true })
  }
  await record(testInfo, 'error-role-candidate-gallery.json', { ...SOURCES, server: candidateOrigin, contexts })
  expect(accountRequests).toEqual([])
})

test('error-role-consistency: ErrorView keeps alert semantics, glyph, copy, request id and Retry', async ({ page, visit }) => {
  await visit(GALLERY)
  const message = createError(ErrorCode.GENERATION_FAILED).message
  const timeout = createError(ErrorCode.NETWORK_TIMEOUT).message
  const cases = [
    { state: 'with onRetry', title: 'Request failed', message, requestId: null, action: 'Retry' },
    { state: 'without onRetry', title: "History didn't load", message, requestId: null, action: null },
    { state: 'with a requestId', title: 'Generation failed', message: timeout, requestId: 'req_sample_a1b2c3', action: 'Try again' },
    { state: 'inside a card', title: "History didn't load", message: timeout, requestId: 'req_sample_a1b2c3', action: 'Retry' },
  ]
  for (const expected of cases) {
    const alert = specimen(page, expected.state).getByRole('alert')
    await expect(alert).toHaveCount(1)
    await expect(alert).toHaveClass(/\bclr-glitch\b/)
    await expect(alert.locator(`svg path[d^="${ALERT_TRIANGLE}"]`)).toHaveCount(1)
    await expect(alert.getByText(expected.title, { exact: true })).toBeVisible()
    await expect(alert.getByText(expected.message)).toBeVisible()
    if (expected.requestId) await expect(alert.getByText(expected.requestId, { exact: true })).toBeVisible()
    const buttons = alert.getByRole('button')
    if (expected.action === null) {
      await expect(buttons).toHaveCount(0)
    } else {
      await expect(buttons).toHaveCount(1)
      await expect(buttons).toHaveText(expected.action)
      // Secondary: the bare .clr-btn, no primary/quiet/critical modifier.
      await expect(buttons).toHaveClass(/\bclr-btn\b/)
      await expect(buttons).not.toHaveClass(/clr-btn--(?:primary|quiet|critical)/)
    }
    const icon = await alert.evaluate((root) => {
      const host = root.querySelector('svg')!.parentElement!
      const probe = document.createElement('span')
      probe.style.color = 'var(--icon-toast-negative)'
      root.appendChild(probe)
      const expectedColor = getComputedStyle(probe).color
      probe.remove()
      return { color: getComputedStyle(host).color, expectedColor }
    })
    expect(icon.color, `${expected.state} glyph colour`).toBe(icon.expectedColor)
  }
})

test('error-role-consistency: a contained ErrorView stays its host card\'s content and ordinary states keep released paint', async ({ page, visit, candidateOrigin, baselineOrigin }, testInfo) => {
  // Eight skin/width contexts, each read on both servers across four entries.
  test.setTimeout(240_000)
  const comparisons: unknown[] = []
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 })
    for (const skin of SKINS) {
      const read = async (origin: string) => {
        await visit(`${origin}${GALLERY}`)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await chooseGallerySkin(page, skin)
        const contained = await readContainment(specimen(page, 'inside a card').getByRole('alert'))
        const ordinary: Record<string, unknown> = {}
        for (const component of ['LoadingView', 'Card', 'ViewStateSwitch']) {
          await visit(`${origin}/gallery/app?component=${component}`)
          await expect(page.locator('.clr-dev-gallery__specimen').first()).toBeVisible()
          await chooseGallerySkin(page, skin)
          ordinary[component] = await readOrdinaryPaint(page)
        }
        return { contained, ordinary }
      }
      const baseline = await read(baselineOrigin)
      const candidate = await read(candidateOrigin)
      comparisons.push({ skin, width, baseline, candidate })
      // No second frame, bar or emission inside the host; the host keeps its own role.
      expect(candidate.contained.nested).toBe(0)
      expect(candidate.contained).toEqual(baseline.contained)
      expect(candidate.contained.emission).toBe(candidate.contained.expected)
      // EmptyState (via ViewStateSwitch), LoadingView and unrelated cards: released paint.
      for (const paint of Object.values(candidate.ordinary) as Array<{ frames: string[] }>) {
        expect(paint.frames.length).toBeGreaterThan(0)
      }
      expect(candidate.ordinary).toEqual(baseline.ordinary)
    }
  }
  await visit(GALLERY)
  await record(testInfo, 'error-role-containment-and-controls.json', { ...SOURCES, comparisons })
})

for (const mode of ['profile', 'places'] as const) {
  test(`error-role-consistency: Generate ${mode}-read failure matches and Retry recovers`, async ({ page, visit, candidateOrigin }, testInfo) => {
    const accountRequests = noAccountTraffic(page)
    const title = GENERATE_TITLES[mode]
    const contexts: unknown[] = []
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 844 })
      for (const skin of SKINS) {
        await visit(`${FIXTURE}?mode=${mode}&skin=${skin}`)
        await expect(page.getByRole('heading', { level: 1, name: 'Generate' })).toBeVisible()
        const alert = page.getByRole('alert').filter({ hasText: title })
        await expect(alert).toBeVisible()
        await settledSkin(page, skin)
        const reading = await readRoles(alert)
        contexts.push({ source: 'candidate', context: `Generate ${mode}-read failure`, skin, width, ...reading })
        expect(reading, `Generate ${mode} (${skin} ${width})`).toMatchObject({ matches: true, iconMatches: true, fits: true })

        await expect(alert.getByText(NETWORK_MESSAGE)).toBeVisible()
        await expect(alert.getByText('req_fixture_e1r2', { exact: true })).toBeVisible()
        await expect(alert.getByRole('button')).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Home', exact: true })).toBeVisible()
        const retry = page.locator('footer.clr-footer').getByRole('button', { name: 'Retry', exact: true })
        await expect(retry).toBeVisible()
        await expect(retry).toHaveClass(/\bclr-btn--primary\b/)

        const reads = () => page.evaluate(() => {
          const fixture = window as Window & { __profileReads?: number; __placeReads?: number }
          return { profile: fixture.__profileReads, places: fixture.__placeReads }
        })
        // The failed read is the one Retry repeats; the other read is not repeated by it.
        const before = await reads()
        expect(mode === 'profile' ? before.profile : before.places).toBe(1)
        await retry.click()
        await expect(page.getByText('No places yet', { exact: true })).toBeVisible()
        await expect(page.getByRole('alert')).toHaveCount(0)
        const after = await reads()
        if (mode === 'profile') expect(after.profile).toBe(2)
        else expect(after).toEqual({ profile: before.profile, places: 2 })
      }
    }
    await visit(`${FIXTURE}?mode=${mode}&skin=clear`)
    await expect(page.getByRole('alert').filter({ hasText: title })).toBeVisible()
    await page.getByRole('button', { name: 'Home', exact: true }).click()
    await expect(page.getByText('Fixture: / reached', { exact: true })).toBeVisible()
    await record(testInfo, `error-role-candidate-generate-${mode}.json`, {
      ...SOURCES,
      consumer: 'src/app/Generate.tsx account-load error (guard precondition held)',
      server: candidateOrigin,
      contexts,
    })
    expect(accountRequests).toEqual([])
  })
}

test('error-role-consistency: the protected route guard\'s account error (not Generate) matches', async ({ page, visit, candidateOrigin }, testInfo) => {
  const accountRequests = noAccountTraffic(page)
  const contexts: unknown[] = []
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 })
    for (const skin of SKINS) {
      await visit(`${FIXTURE}?mode=guard&skin=${skin}`)
      const alert = page.getByRole('alert').filter({ hasText: GUARD_TITLE })
      await expect(alert).toBeVisible()
      // The guard owns this state: Generate's own titles and pinned Retry are absent.
      await expect(page.getByText(GENERATE_TITLES.profile)).toHaveCount(0)
      await expect(page.locator('footer.clr-footer')).toHaveCount(0)
      await expect(alert.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
      await settledSkin(page, skin)
      const reading = await readRoles(alert)
      contexts.push({ source: 'candidate', context: 'route guard account error', skin, width, ...reading })
      expect(reading, `guard (${skin} ${width})`).toMatchObject({ matches: true, iconMatches: true, fits: true })
    }
  }
  await record(testInfo, 'error-role-candidate-guard.json', {
    ...SOURCES,
    consumer: 'src/app/guards.tsx profile-error (protected /generate)',
    server: candidateOrigin,
    contexts,
  })
  expect(accountRequests).toEqual([])
})

test('error-role-consistency: one-shot glitch motion, and reduced motion keeps the same content', async ({ page, visit, checkA11y }) => {
  await visit(GALLERY)
  const motion = (alert: Locator) => alert.evaluate((root) => ({
    glitch: root.classList.contains('clr-glitch'),
    name: getComputedStyle(root).animationName,
    count: getComputedStyle(root).animationIterationCount,
  }))
  for (const state of STANDALONE) {
    expect(await motion(specimen(page, state).getByRole('alert'))).toEqual({ glitch: true, name: 'clr-glitch', count: '1' })
  }

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await expect(specimen(page, 'with a requestId').getByRole('alert')).toBeVisible()
  for (const state of STANDALONE) {
    const alert = specimen(page, state).getByRole('alert')
    expect(await motion(alert)).toMatchObject({ glitch: true, name: 'none' })
    expect(await readRoles(alert)).toMatchObject({ matches: true })
  }
  const withId = specimen(page, 'with a requestId').getByRole('alert')
  await expect(withId.getByText('Generation failed', { exact: true })).toBeVisible()
  await expect(withId.getByText(createError(ErrorCode.NETWORK_TIMEOUT).message)).toBeVisible()
  await expect(withId.getByText('req_sample_a1b2c3', { exact: true })).toBeVisible()
  await expect(withId.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
  const dialog = await openDialogSpecimen(page)
  expect(await motion(dialog.getByRole('alert'))).toMatchObject({ glitch: true, name: 'none' })
  await checkA11y()
  await closeDialog(page)

  await visit(`${FIXTURE}?mode=places&skin=clear`)
  const alert = page.getByRole('alert').filter({ hasText: GENERATE_TITLES.places })
  await expect(alert).toBeVisible()
  expect(await motion(alert)).toMatchObject({ glitch: true, name: 'none' })
  await expect(alert.getByText(NETWORK_MESSAGE)).toBeVisible()
  await expect(alert.getByText('req_fixture_e1r2', { exact: true })).toBeVisible()
  await expect(page.locator('footer.clr-footer').getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
})
