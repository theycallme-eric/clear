/**
 * Effects TASK-006 — the task-owned harness shared by
 * `crt-composition-fidelity.spec.ts` and `crt-live-overhead.spec.ts`.
 *
 * This workspace's own Vite origin with synthetic, intercepted data (no write,
 * no model call, nothing leaves the origin), the preserved CRT Glass Motion
 * reference served read-only by route interception, and provenance helpers.
 * No shared Playwright configuration is read or changed.
 */
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'

import type { BrowserContext, Page, Route, TestInfo } from '@playwright/test'

import { parseEnvFile } from '../../../scripts/dev-preflight/env.mjs'
import { fixtureLocation, onboardedProfile } from '../../../src/test/user-data-double'
import { CRT_FIELD_CONFIG, CRT_FIELD_REFERENCE } from '../../../src/ui/crt-field/config'
import { expect, test as base } from '../../fixtures'
import { bundledEffectsInput } from '../reference-inputs'

export { expect }

export const SKINS = ['clear', 'signal', 'vapour', 'mono'] as const
export type Skin = (typeof SKINS)[number]

// ---------------------------------------------------------------------------
// The preserved reference, read-only.
// ---------------------------------------------------------------------------

export const SETTINGS_SHA256 = '3169d4608c8babe17a20670bd59f53e3110c7ce917641786d33c2713943ca033'
export const REFERENCE_ORIGIN = 'http://crt-glass-reference.localhost'
export const REFERENCE_HOST = 'crt-glass-motion/index.html'
export const REFERENCE_SOURCES = [
  'crt-glass-motion/study.mjs',
  'crt-glass-motion/study.css',
  'crt-glass-motion/glass-effect.mjs',
  'crt-glass-motion/motion-clock.mjs',
] as const
/** Earlier-settings renders: listed for the record, never compared. */
export const EARLIER_SETTINGS_DIAGNOSTICS = [
  'crt-glass-motion-study-02.jpg',
  'crt-animation-controls-fixed.jpg',
  'crt-grain-softness.jpg',
] as const
const ENV_FILES = ['.env.runner.local', '.env.audit.local', '.env.local'] as const

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
}

function envValue(name: string): string | undefined {
  let value = process.env[name]?.trim()
  for (const file of ENV_FILES) {
    if (value) break
    const path = resolve(process.cwd(), file)
    if (existsSync(path)) value = parseEnvFile(readFileSync(path, 'utf8'))[name]?.trim()
  }
  return value || bundledEffectsInput(name)
}

export interface ReferenceInputs {
  root: string
  settings: Record<string, unknown>
  settingsSha256: string
}

export function referenceInputs(): ReferenceInputs {
  const dir = envValue('CLEAR_EFFECTS_REFERENCE_DIR')
  const settingsPath = envValue('CLEAR_EFFECTS_CURRENT_SETTINGS')
  if (!dir || !settingsPath) throw new Error('PRE-001/PRE-002 reference inputs are not available')
  const root = resolve(dir)
  for (const file of [REFERENCE_HOST, ...REFERENCE_SOURCES]) {
    if (!existsSync(resolve(root, file))) throw new Error(`reference checkpoint is missing ${file}`)
  }
  const bytes = readFileSync(settingsPath)
  const settingsSha256 = createHash('sha256').update(bytes).digest('hex')
  if (settingsSha256 !== SETTINGS_SHA256) throw new Error(`current settings SHA-256 is ${settingsSha256}`)
  const settings = (JSON.parse(bytes.toString('utf8')) as { settings: Record<string, unknown> }).settings
  return { root, settings, settingsSha256 }
}

export async function serveReference(context: BrowserContext, root: string) {
  await context.route(`${REFERENCE_ORIGIN}/**`, async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname.slice(1))
    const file = resolve(root, path)
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
      await route.fulfill({ status: 404, body: '' })
      return
    }
    await route.fulfill({ status: 200, body: readFileSync(file), contentType: MIME[extname(file)] ?? 'application/octet-stream' })
  })
}

// ---------------------------------------------------------------------------
// This workspace's own app origin.
// ---------------------------------------------------------------------------

async function waitForOrigin(origin: string, deadline: number) {
  while (Date.now() < deadline) {
    try {
      if ((await fetch(origin)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`CRT field origin ${origin} did not start`)
}

export const test = base.extend<object, { crtOrigin: string }>({
  crtOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      const port = 5700 + workerInfo.parallelIndex
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [
        resolve(import.meta.dirname, '../../../node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort',
      ], {
        env: {
          ...process.env,
          VITE_SUPABASE_URL: 'https://synthetic-crt-field.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-crt-field-public-placeholder',
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
  baseURL: async ({ crtOrigin }, use) => use(crtOrigin),
})

const OWNER = '00000000-0000-4000-8000-000000000061'
const HOME_ID = '00000000-0000-4000-8000-000000000062'
const GYM_ID = '00000000-0000-4000-8000-000000000063'
const AUTH_KEY = 'clear.auth.session'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}

export interface AppOptions {
  skin: Skin
  effects: 'on' | 'off'
  /** Hold a generation request unanswered, so the Loading host is the screen. */
  holdGeneration?: boolean
}

export async function syntheticApp(page: Page, origin: string, { skin, effects, holdGeneration }: AppOptions) {
  const writes: string[] = []
  const outbound: string[] = []
  const requested: string[] = []
  const held: string[] = []

  await page.route('**/*', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === origin && ['GET', 'HEAD'].includes(request.method())) {
      requested.push(url.pathname)
      return route.continue()
    }
    outbound.push(`${request.method()} ${url.origin}${url.pathname}`)
    return route.abort('blockedbyclient')
  })
  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/')) {
      if (holdGeneration && request.method() === 'POST') {
        held.push(url.pathname)
        return new Promise<void>(() => {})
      }
      writes.push(`${request.method()} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (request.method() === 'GET') {
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'balanced' })])
      if (name === 'locations') {
        return reply([
          fixtureLocation({ id: HOME_ID, user_id: OWNER, tier: 'full', name: 'Home gym', is_default: true }),
          fixtureLocation({ id: GYM_ID, user_id: OWNER, tier: 'full', name: 'Building gym', is_default: false }),
        ])
      }
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) return reply(name === 'resume_session' ? null : [])
    writes.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic write.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ authKey, owner, skin, effects }) => {
    if (sessionStorage.getItem('crt-field-seeded')) return
    sessionStorage.setItem('crt-field-seeded', '1')
    localStorage.setItem(authKey, JSON.stringify({
      accessToken: 'synthetic-crt-session', refreshToken: 'synthetic-crt-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-crt@example.invalid' },
    }))
    localStorage.setItem('clear.skin', skin)
    localStorage.setItem('clear.visual-effects', effects)
  }, { authKey: AUTH_KEY, owner: OWNER, skin, effects })

  return {
    held,
    requested,
    assertReadOnly() {
      expect(writes, 'no write and no model call').toEqual([])
      expect(outbound, 'nothing leaves the local origin').toEqual([])
    },
  }
}

export async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  })
}

export async function openGenerate(page: Page) {
  await page.goto('/generate')
  await expect(page.getByRole('heading', { level: 1, name: 'Generate', exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Anchor' })).toBeVisible()
  await settle(page)
}

/** Live Visual effects change in this tab, as another tab's Settings would make it. */
export async function setEffects(page: Page, value: 'on' | 'off') {
  await page.evaluate((next) => {
    localStorage.setItem('clear.visual-effects', next)
    window.dispatchEvent(new StorageEvent('storage', { key: 'clear.visual-effects' }))
  }, value)
}

export async function setTabVisibility(page: Page, state: 'hidden' | 'visible') {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value === 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  }, state)
}

// ---------------------------------------------------------------------------
// Provenance.
// ---------------------------------------------------------------------------

function git(args: string[]): string {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim()
  } catch {
    return 'unavailable'
  }
}

/** The app source this run served: the commit, and whether the tree differs from it. */
export function appIdentity() {
  const runtime = ['src/ui/crt-field/config.ts', 'src/ui/crt-field/crt-field.tsx', 'src/ui/crt-field/crt-field.css', 'src/styles/atmosphere.css', 'src/ui/atmosphere.tsx', 'src/app/RootLayout.tsx']
  return {
    commit: git(['rev-parse', 'HEAD']),
    uncommittedChanges: git(['status', '--porcelain', '--untracked-files=no']) !== '',
    build: 'Vite development server started by this spec from this workspace',
    fieldSources: Object.fromEntries(runtime.map((file) => [file, createHash('sha256').update(readFileSync(file)).digest('hex')])),
  }
}

export function shippingConfiguration() {
  return { module: 'src/ui/crt-field/config.ts', id: CRT_FIELD_CONFIG.id, values: CRT_FIELD_CONFIG }
}

export function referenceIdentity(inputs: ReferenceInputs) {
  return {
    host: REFERENCE_HOST,
    sources: REFERENCE_SOURCES,
    settings: { file: CRT_FIELD_REFERENCE.settingsFile, sha256: inputs.settingsSha256 },
    earlierSettingsDiagnostics: { files: EARLIER_SETTINGS_DIAGNOSTICS, note: 'earlier settings; never an exact target' },
  }
}

export function keepPng(testInfo: TestInfo, name: string, png: Buffer) {
  const path = testInfo.outputPath(name)
  writeFileSync(path, png)
  return testInfo.attach(name, { path, contentType: 'image/png' })
}

export function keepJson(testInfo: TestInfo, name: string, body: unknown) {
  const text = JSON.stringify(body, null, 2)
  writeFileSync(testInfo.outputPath(name), text)
  return testInfo.attach(name, { body: text, contentType: 'application/json' })
}
