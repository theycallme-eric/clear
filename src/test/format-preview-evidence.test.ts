import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CAPTURE_SKINS, CAPTURE_VIEWPORTS } from '../../e2e/design-0143/state-inventory'
import {
  bytesHash, formatBaselineAbsence, formatPreviewManifest, FORMAT_BASELINE_COMMIT, FORMAT_EVIDENCE_SOURCE,
  FORMAT_ROUTE, FORMAT_STATE, FORMAT_TITLE, isPreviewWrite, pngDimensions,
  validateFormatPreviewEvidence, type FormatEvidenceRecord,
} from '../../e2e/design-0143/format-preview-evidence'

const root = resolve(import.meta.dirname, '../..')
const oldDirectory = resolve(root, 'docs/design/evidence-0143/collections-settings')

/**
 * Pure validator fixtures only, never emitted as Task034 evidence. Existing PNG
 * bytes are borrowed in memory to test the byte/dimension checks without opening
 * a browser, manufacturing an image or writing a record. Their old routes are
 * NOT evidence for the new route; only the future real spec may create that.
 */
function fixture() {
  const old = readdirSync(resolve(oldDirectory, 'records')).flatMap((name) =>
    (JSON.parse(readFileSync(resolve(oldDirectory, 'records', name), 'utf8')) as {
      captures: { viewport: { id: string }; screenshot: { name: string } }[]
    }).captures)
  const pictures = new Map<string, Uint8Array>()
  const absence = formatBaselineAbsence(root)
  const records: FormatEvidenceRecord[] = []
  for (const project of ['mobile', 'tablet', 'desktop']) {
    for (const skin of CAPTURE_SKINS) {
      const viewports = CAPTURE_VIEWPORTS.filter(({ id }) => id === (project === 'mobile' ? 'phone' : project) || (project === 'mobile' && id === 'short'))
      const captures: FormatEvidenceRecord['captures'] = viewports.map((viewport) => {
        const prior = old.find((capture) => capture.viewport.id === viewport.id)
        if (prior === undefined) throw new Error('Missing historical PNG test fixture')
        const bytes = readFileSync(resolve(oldDirectory, 'screenshots', prior.screenshot.name))
        const pixels = pngDimensions(bytes)
        const name = `unit-fixture-${viewport.id}-${skin}.png`
        pictures.set(name, bytes)
        return {
          phase: 'after' as const, route: FORMAT_ROUTE, state: FORMAT_STATE, skin, viewport, before: null,
          reached: { pathname: FORMAT_ROUTE, heading: FORMAT_TITLE, stateVisible: true },
          motion: { reducedMotion: true, running: [], settled: true },
          layout: { noHorizontalOverflow: true, documentHeight: pixels.height },
          screenshot: { name, sha256: bytesHash(bytes), bytes: bytes.length, ...pixels, explicit: true as const, fullPage: true as const, scale: 'css' as const },
        }
      })
      records.push({
        version: 1, task: 'TASK-034', issue: 469, consumer: 'task034-format-preview', sourceFile: FORMAT_EVIDENCE_SOURCE,
        status: 'passed', project, skin, caseTitle: 'UNIT FIXTURE — NOT ACTUAL TASK034 PROOF', observedAt: '2026-10-22T00:00:00.000Z', captureProcessId: 1,
        identity: { packageName: 'unit-fixture', packageVersion: '0.14.3', packageHash: 'a'.repeat(64), runtimeSourceHash: 'b'.repeat(64), applicationCommit: 'c'.repeat(40), testedDeployment: 'http://127.0.0.1:4173' },
        sourceCheckout: { dirty: false, statusSha256: bytesHash(new Uint8Array()) }, driverSourceHash: 'd'.repeat(64), baselineAbsence: structuredClone(absence),
        session: { fixture: 'authenticatedSession', realSession: true, codeRequests: 1, verificationRequests: 1, generationRequests: 0, screens: ['Welcome', 'OTP Login', 'Home', 'Generate'] },
        observations: { settingsEntry: true, settingsBack: true, directEntryBack: true, allDisclosures: true, formatsAndStates: true, accessibility: true, storageUnchanged: true },
        network: { generationRequests: 0, blockedGenerations: 0, attemptedWrites: 0, forwardedWrites: 0 }, deterministic: true, liveGeneration: false, deployedProof: false, captures,
      })
    }
  }
  const expected = { runtimeHash: 'b'.repeat(64), packageHash: 'a'.repeat(64), driverHash: 'd'.repeat(64), absence,
    readPng: (name: string) => { const bytes = pictures.get(name); if (!bytes) throw new Error('Missing PNG'); return bytes } }
  return { records, expected, pictures }
}

describe('Task034 introduced-route evidence guard — offline fixtures, not capture proof', () => {
  it('checks real c31 source absence without inventing a BEFORE image', () => {
    const absence = formatBaselineAbsence(root)
    expect(absence.commit).toBe(FORMAT_BASELINE_COMMIT)
    expect(absence.before).toBeNull()
    expect(absence.sources.map(({ path }) => path)).toEqual(['src/app/router.tsx', 'e2e/required-routes.ts'])
    expect(absence.sources.every(({ sha256 }) => /^[a-f0-9]{64}$/.test(sha256))).toBe(true)
  })

  it('accepts a complete in-memory validator fixture with all sixteen unique cells', () => {
    const { records, expected } = fixture()
    expect(() => validateFormatPreviewEvidence(records, expected)).not.toThrow()
    expect(formatPreviewManifest(records).matrix).toEqual({ captures: 16, withBeforePicture: 0, introducedWithoutBeforePicture: 16,
      byViewport: { phone: 4, tablet: 4, desktop: 4, short: 4 }, bySkin: { clear: 4, vapour: 4, signal: 4, mono: 4 } })
    expect(formatPreviewManifest([]).status).toBe('incomplete')
  })

  const mutations: [string, (records: FormatEvidenceRecord[]) => void][] = [
    ['missing case', (records) => { records.pop() }],
    ['duplicate case', (records) => { records[1] = records[0] }],
    ['missing short capture', (records) => { records[0].captures.pop() }],
    ['wrong CSS viewport', (records) => { records[0].captures[0].viewport = { ...records[0].captures[0].viewport, width: 391 } as never }],
    ['old route', (records) => { records[0].captures[0].route = '/settings' as never }],
    ['Welcome instead of preview', (records) => { records[0].captures[0].reached = { ...records[0].captures[0].reached, pathname: '/welcome' } }],
    ['missing state', (records) => { records[0].captures[0].reached = { ...records[0].captures[0].reached, stateVisible: false } }],
    ['invented BEFORE', (records) => { records[0].captures[0].before = {} as never }],
    ['baseline source tampered', (records) => { records[0].baselineAbsence.sources[0].sha256 = '0'.repeat(64) }],
    ['old runtime source', (records) => { records[0].identity = { ...records[0].identity, runtimeSourceHash: 'e'.repeat(64) } }],
    ['old capture driver', (records) => { records[0].driverSourceHash = 'e'.repeat(64) }],
    ['missing source commit', (records) => { records[0].identity = { ...records[0].identity, applicationCommit: null } }],
    ['false clean checkout', (records) => { records[0].sourceCheckout.statusSha256 = 'e'.repeat(64) }],
    ['no actual session', (records) => { records[0].session.realSession = false as never }],
    ['generation during authentication', (records) => { records[0].session.generationRequests = 1 }],
    ['generation during preview', (records) => { records[0].network.generationRequests = 1 }],
    ['a blocked write is still failure', (records) => { records[0].network.attemptedWrites = 1 }],
    ['unchecked direct Back', (records) => { records[0].observations.directEntryBack = false as never }],
    ['unverified formats/states', (records) => { records[0].observations.formatsAndStates = false as never }],
    ['storage changed', (records) => { records[0].observations.storageUnchanged = false as never }],
    ['running animation', (records) => { records[0].captures[0].motion = { ...records[0].captures[0].motion, running: ['animation'] } }],
    ['horizontal overflow', (records) => { records[0].captures[0].layout.noHorizontalOverflow = false }],
    ['incorrect PNG hash', (records) => { records[0].captures[0].screenshot.sha256 = '0'.repeat(64) }],
    ['incorrect PNG pixels', (records) => { records[0].captures[0].screenshot.width += 1 }],
    ['implicit failure screenshot', (records) => { records[0].captures[0].screenshot.explicit = false as never }],
    ['unsafe PNG path', (records) => { records[0].captures[0].screenshot.name = '../old.png' }],
    ['deployed claim', (records) => { records[0].deployedProof = true as never }],
  ]
  it.each(mutations)('refuses %s', (_name, mutate) => {
    const { records, expected } = fixture()
    mutate(records)
    expect(() => validateFormatPreviewEvidence(records, expected)).toThrow()
  })

  it('refuses absent or truncated PNG bytes and missing files', () => {
    expect(() => pngDimensions(new Uint8Array())).toThrow()
    const { records, expected } = fixture()
    expect(() => validateFormatPreviewEvidence(records, { ...expected, readPng: () => { throw new Error('absent') } })).toThrow('absent')
  })

  it('permits only reads and the existing read-only boot RPC, never a write or generation', () => {
    expect(isPreviewWrite('GET', '/rest/v1/profiles')).toBe(false)
    expect(isPreviewWrite('GET', '/functions/v1/generate-workout')).toBe(true)
    expect(isPreviewWrite('OPTIONS', '/functions/v1/generate-workout')).toBe(true)
    expect(isPreviewWrite('POST', '/rest/v1/rpc/constraints_in_force')).toBe(false)
    for (const path of ['/rest/v1/profiles', '/rest/v1/rpc/persist_session', '/rest/v1/rpc/complete_onboarding', '/functions/v1/generate-workout', '/functions/v1/generate-section']) {
      expect(isPreviewWrite('POST', path), path).toBe(true)
    }
    expect(isPreviewWrite('DELETE', '/rest/v1/rpc/constraints_in_force')).toBe(true)
  })

  it('wires the real capture posture rather than creating baseline or synthetic screenshots', () => {
    const source = readFileSync(resolve(root, FORMAT_EVIDENCE_SOURCE), 'utf8')
    expect(source).toContain("from '../support/authenticated-session'")
    expect(source).toContain("await page.screenshot({ fullPage: true, caret: 'hide', scale: 'css' })")
    expect(source).toContain('verifyReached(target, reached)')
    expect(source).toContain('await checkA11y()')
    expect(source).toContain('info.status !== \'passed\'')
    expect(source).toContain("flag: 'wx'")
    expect(source).not.toContain('page.goto(')
    expect(source).not.toContain('pairCaptures(')
    expect(source).not.toContain('writeFileSync(resolve(root, \'docs/design/0143-intake-baseline')
  })
})
