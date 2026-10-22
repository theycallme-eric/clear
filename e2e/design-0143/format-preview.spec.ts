import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page } from '@playwright/test'

import { test as base, expect } from '../support/authenticated-session'
import { backend } from '../support/backend'
import { captureIdentity, verifyReached } from './capture'
import { installDeterministicCapture, playwrightCaptureDriver } from './fixtures'
import { CAPTURE_SKINS, CAPTURE_VIEWPORTS, VIEWPORT_OF_PROJECT } from './state-inventory'
import {
  bytesHash, formatBaselineAbsence, formatDriverHash, formatPreviewManifest, formatSourceCheckout,
  FORMAT_EVIDENCE_DIR, FORMAT_EVIDENCE_SOURCE, FORMAT_NOTE, FORMAT_ROUTE, FORMAT_STATE, FORMAT_TITLE,
  FORMAT_RECORD_MARKER, shouldRecordFormatArtifacts, isPreviewWrite, pngDimensions, type FormatEvidenceRecord,
} from './format-preview-evidence'

/**
 * Follow-up TASK-034/#469: actual AFTER-only proof for a route absent at c31.
 * Uses the existing real authenticated-session fixture, never a fake session or
 * a baseline Not Found picture. The fixture owns disposable auth/onboarding;
 * this preview walk refuses data writes and generation. No release/UAT claim.
 */
const root = process.cwd()
/** Only known synthetic UI labels/styles/geometry; no athlete or auth values. */
async function settingsReadiness(page: Page) {
  return page.evaluate(() => {
    const expected = [
      ['settings-training', 'Training'], ['settings-limitations', 'Limitations'],
      ['settings-appearance', 'Appearance'], ['settings-places', 'Places and equipment'],
      ['settings-formats', 'Workout formats'], ['settings-session', 'Session'],
    ]
    return {
      fonts: document.fonts.status,
      measured: document.querySelector('main > .clr-scroll-region')?.hasAttribute('data-measured') === true,
      headings: expected.map(([id, text]) => {
        const span = document.querySelector(`h2 > #${id}`)
        const heading = span?.parentElement
        const style = span ? getComputedStyle(span) : null
        const parentStyle = heading ? getComputedStyle(heading) : null
        const rect = span?.getBoundingClientRect()
        return { id, expected: text, text: span?.textContent?.trim(), connected: span?.isConnected === true,
          display: style?.display, visibility: style?.visibility, opacity: style?.opacity,
          headingDisplay: parentStyle?.display, headingVisibility: parentStyle?.visibility,
          headingOpacity: parentStyle?.opacity,
          rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null }
      }),
    }
  })
}

async function waitForSettingsLayout(page: Page) {
  await page.evaluate(async () => { await document.fonts.ready })
  await expect.poll(async () => {
    const before = await settingsReadiness(page)
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    const after = await settingsReadiness(page)
    return after.fonts === 'loaded' && after.measured && JSON.stringify(before) === JSON.stringify(after)
      && after.headings.every((h) => h.connected && h.text === h.expected && h.display !== 'none'
        && h.visibility === 'visible' && Number(h.opacity) > 0 && h.headingDisplay !== 'none'
        && h.headingVisibility === 'visible' && Number(h.headingOpacity) > 0
        && h.rect !== null && h.rect.width > 0 && h.rect.height > 0)
  }, { message: 'Settings headings and measured layout settle before the unchanged accessibility scan' }).toBe(true)
}

type PendingEvidence = { record: FormatEvidenceRecord; pictures: Map<string, Uint8Array> }
const test = base.extend<{ recordEvidence: (evidence: PendingEvidence) => void }>({
  checkA11y: async ({ page, checkA11y }, use, info) => {
    await use(async () => {
      const isSettings = new URL(page.url()).pathname === '/settings'
      if (isSettings) await waitForSettingsLayout(page)
      const before = isSettings ? await settingsReadiness(page) : undefined
      try {
        await checkA11y() // The original unfiltered Axe assertion; no rule is waived.
      } catch (error) {
        if (isSettings) await info.attach('task034-settings-a11y-readiness.json', {
          body: JSON.stringify({ before, after: await settingsReadiness(page) }, null, 2), contentType: 'application/json',
        })
        throw error
      }
    })
  },
  recordEvidence: async ({}, use, info) => {
    let pending: PendingEvidence | undefined
    await use((evidence) => { pending = evidence })
    // Failed/skipped/aborted cases never become passing committed evidence.
    if (info.status !== 'passed' || pending === undefined) return
    await info.attach('task034-format-preview-evidence.json', { body: JSON.stringify(pending.record, null, 2), contentType: 'application/json' })
    // Recording is an explicit one-time operator action, not a side effect of
    // every future trusted E2E run. All browser assertions/captures still run.
    if (!shouldRecordFormatArtifacts(process.env[FORMAT_RECORD_MARKER], info.status)) return
    const directory = resolve(root, FORMAT_EVIDENCE_DIR)
    const recordName = `${pending.record.project}-${pending.record.skin}.json`
    if (existsSync(resolve(directory, 'records', recordName))) throw new Error(`Refusing to overwrite historical Task034 evidence: ${recordName}`)
    mkdirSync(resolve(directory, 'records'), { recursive: true })
    mkdirSync(resolve(directory, 'screenshots'), { recursive: true })
    for (const [name, bytes] of pending.pictures) {
      writeFileSync(resolve(directory, 'screenshots', name), bytes, { flag: 'wx' })
    }
    writeFileSync(resolve(directory, 'records', recordName), `${JSON.stringify(pending.record, null, 2)}\n`, { flag: 'wx' })
    const records = readdirSync(resolve(directory, 'records')).filter((name) => name.endsWith('.json'))
      .sort().map((name) => JSON.parse(readFileSync(resolve(directory, 'records', name), 'utf8')) as FormatEvidenceRecord)
    writeFileSync(resolve(directory, 'manifest.json'), `${JSON.stringify(formatPreviewManifest(records), null, 2)}\n`)
  },
})

test.describe('TASK-034 introduced format-preview route — real AFTER evidence', () => {
  // Missing trusted config is an explicit non-proof outcome. The offline audit
  // still fails without the complete real sixteen-cell committed evidence.
  test.skip(!backend.available, backend.reason)

  for (const skin of CAPTURE_SKINS) {
    test(`${skin}: Settings entry, read-only formats, Back and direct-entry Back`, async ({
      authenticatedPage: page, authenticatedSession, visit, checkA11y, recordEvidence,
    }, info) => {
      const viewportId = VIEWPORT_OF_PROJECT[info.project.name]
      expect(viewportId, 'only the three existing browser projects own captures').toBeTruthy()
      const viewports = CAPTURE_VIEWPORTS.filter(({ id }) => id === viewportId || (info.project.name === 'mobile' && id === 'short'))
      expect(viewports).toHaveLength(info.project.name === 'mobile' ? 2 : 1)
      const deterministic = await installDeterministicCapture(page, { skin, reducedMotion: true })
      let generationRequests = 0
      let attemptedWrites = 0
      page.on('request', (request) => {
        if (new URL(request.url()).pathname.includes('/functions/v1/generate-')) generationRequests += 1
      })
      await page.route('**/*', async (route) => {
        const request = route.request()
        if (!isPreviewWrite(request.method(), new URL(request.url()).pathname)) return route.fallback()
        attemptedWrites += 1
        return route.abort('blockedbyclient')
      })

      expect(authenticatedSession.journey.codeRequests).toBe(1)
      expect(authenticatedSession.journey.verificationRequests).toBe(1)
      expect(authenticatedSession.journey.generationRequests).toBe(0)
      await visit('/settings')
      await expect(page.locator('main h1')).toHaveAccessibleName('Settings')
      // TextAction's CSS-generated chevron is included in Chromium's name.
      const previewEntry = page.getByRole('button', { name: /^Preview formats(?:\s*›)?$/ })
      await expect(previewEntry).toHaveCount(1)
      await expect(previewEntry).toBeEnabled()
      // Hash inside the browser; no stored athlete/auth value is returned or recorded.
      const storageHash = () => page.evaluate(async () => {
        const entries = Object.keys(window.localStorage).filter((key) => key !== 'clear.auth.session' && key !== 'clear.skin')
          .sort().map((key) => [key, window.localStorage.getItem(key)])
        const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(entries)))
        return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
      })
      const storageBefore = await storageHash()
      await previewEntry.click()
      await expect(page).toHaveURL((url) => url.pathname === FORMAT_ROUTE)
      await expect(page.locator('main h1')).toHaveAccessibleName(FORMAT_TITLE)
      await expect(page.getByText(FORMAT_NOTE, { exact: true })).toBeVisible()
      await checkA11y()
      const preview = page.locator('[data-format-preview]')
      await expect(preview).toBeVisible()
      await expect(preview.getByRole('button', { name: /^(start|save|log|generate)(\s|$)/i })).toHaveCount(0)
      await expect(preview.locator('input, textarea, select')).toHaveCount(0)
      const disclosures = preview.locator('button[aria-expanded]')
      expect(await disclosures.count(), 'the real shared section disclosures exist').toBeGreaterThan(0)
      for (const disclosure of await disclosures.all()) {
        await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
        await disclosure.click()
        await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
        await disclosure.click()
        await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
      }
      for (const mode of ['scheduled_starts', 'for_time', 'capped_window']) {
        await expect(preview.locator(`[data-preview-ladder="${mode}"]`)).toHaveCount(1)
      }
      const blocks = preview.locator('[data-detail-block]')
      await expect(blocks).toHaveCount(6)
      for (const [index, label] of ['STANDARD', 'SUPERSET', 'CIRCUIT', 'EMOM', 'AMRAP', 'FOR TIME'].entries()) {
        await expect(blocks.nth(index)).toContainText(label)
      }
      for (const status of ['Done', 'Skipped', 'Not logged', 'Not scored']) {
        await expect(preview.getByText(status, { exact: true }).first()).toBeVisible()
      }

      const captures: FormatEvidenceRecord['captures'] = []
      const pictures = new Map<string, Uint8Array>()
      const target = { screen: 'Workout formats', route: FORMAT_ROUTE, path: FORMAT_ROUTE, heading: FORMAT_TITLE, state: FORMAT_STATE, stateText: FORMAT_NOTE }
      const driver = playwrightCaptureDriver(page, info)
      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
        await checkA11y()
        // Screen owns an inner scroller; resetting window leaves disclosure-click
        // offsets in the picture. Reset and prove the actual capture surface.
        const scroller = page.locator('main .clr-scroll-region__scroller')
        await expect(scroller).toHaveCount(1)
        await scroller.evaluate((element) => element.scrollTo({ top: 0, left: 0, behavior: 'instant' }))
        await expect.poll(() => scroller.evaluate((element) => [element.scrollTop, element.scrollLeft])).toEqual([0, 0])
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
        await expect(page.locator('main h1')).toBeInViewport({ ratio: 1 })
        const reached = await driver.observe(target)
        verifyReached(target, reached)
        await expect.poll(async () => (await driver.motion()).settled).toBe(true)
        const motion = await driver.motion()
        expect(motion).toEqual({ reducedMotion: true, running: [], settled: true })
        const layout = await page.evaluate(() => {
          const surface = document.querySelector<HTMLElement>('main .clr-scroll-region__scroller')!
          const heading = document.querySelector('main h1')!.getBoundingClientRect()
          const region = surface.getBoundingClientRect()
          return {
            noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
            documentHeight: Math.max(window.innerHeight, document.documentElement.scrollHeight, document.body.scrollHeight),
            scrollTop: surface.scrollTop, scrollLeft: surface.scrollLeft,
            headingVisibleAtCapture: heading.top >= region.top && heading.bottom <= Math.min(region.bottom, window.innerHeight),
          }
        })
        expect(layout.noHorizontalOverflow).toBe(true)
        expect([layout.scrollTop, layout.scrollLeft]).toEqual([0, 0])
        expect(layout.headingVisibleAtCapture).toBe(true)
        const name = `task034-format-preview-${viewport.id}-${skin}.png`
        // This buffer is the actual explicit full-page picture, CSS-scaled on every DPR.
        const bytes = await page.screenshot({ fullPage: true, caret: 'hide', scale: 'css' })
        const pixels = pngDimensions(bytes)
        expect(pixels).toEqual({ width: viewport.width, height: layout.documentHeight })
        pictures.set(name, bytes)
        await info.attach(name, { body: bytes, contentType: 'image/png' })
        captures.push({ phase: 'after', route: FORMAT_ROUTE, state: FORMAT_STATE, skin, viewport, before: null, reached, motion, layout,
          screenshot: { name, sha256: bytesHash(bytes), bytes: bytes.length, ...pixels, explicit: true, fullPage: true, scale: 'css' } })
      }
      await page.getByRole('button', { name: 'Settings', exact: true }).click()
      await expect(page).toHaveURL((url) => url.pathname === '/settings')
      await expect(page.locator('main h1')).toHaveAccessibleName('Settings')
      await checkA11y()
      // Real direct navigation clears React Router's arrival state; Back must replace with Settings.
      await visit(FORMAT_ROUTE)
      await expect(page.locator('main h1')).toHaveAccessibleName(FORMAT_TITLE)
      await page.getByRole('button', { name: 'Settings', exact: true }).click()
      await expect(page).toHaveURL((url) => url.pathname === '/settings')
      await expect(page.locator('main h1')).toHaveAccessibleName('Settings')
      await checkA11y()
      expect(await storageHash(), 'preview controls and both Back paths leave athlete storage unchanged').toBe(storageBefore)
      expect(generationRequests).toBe(0)
      expect(deterministic.blockedGenerations()).toBe(0)
      expect(attemptedWrites).toBe(0)

      recordEvidence({ pictures, record: {
        version: 1, task: 'TASK-034', issue: 469, consumer: 'task034-format-preview', sourceFile: FORMAT_EVIDENCE_SOURCE,
        status: 'passed', project: info.project.name, skin, caseTitle: info.title, observedAt: new Date().toISOString(), captureProcessId: process.pid,
        identity: captureIdentity(root), sourceCheckout: formatSourceCheckout(root), driverSourceHash: formatDriverHash(root), baselineAbsence: formatBaselineAbsence(root),
        session: { fixture: 'authenticatedSession', realSession: true, codeRequests: authenticatedSession.journey.codeRequests,
          verificationRequests: authenticatedSession.journey.verificationRequests, generationRequests: authenticatedSession.journey.generationRequests,
          screens: authenticatedSession.journey.screens },
        observations: { settingsEntry: true, settingsBack: true, directEntryBack: true, allDisclosures: true, formatsAndStates: true, accessibility: true, storageUnchanged: true },
        network: { generationRequests, blockedGenerations: deterministic.blockedGenerations(), attemptedWrites, forwardedWrites: 0 },
        deterministic: true, liveGeneration: false, deployedProof: false, captures,
      } })
    })
  }
})
