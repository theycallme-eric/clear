import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { capturePairId } from '../../e2e/design-0143/capture'
import {
  AUTHENTICATED_CAPTURE_TARGETS,
  BASELINE_INVENTORY_PATH,
  CAPTURE_SKINS,
  CAPTURE_VIEWPORTS,
  readBaselineInventory,
  readBaselinePackages,
  type CaptureSkin,
  type CaptureViewportId,
} from '../../e2e/design-0143/state-inventory'

/**
 * TASK-040 (#386) — the before-state record, held to the files beside it.
 *
 * The manifest is evidence only while it says what the committed screenshots
 * are and nothing more. This checks the bytes against the digests the harness
 * recorded, the identity every capture carries, and that the coverage it
 * reports is the coverage it has. It runs no browser and captures nothing.
 */

const root = resolve(import.meta.dirname, '../..')
const MANIFEST_PATH = 'docs/design/0143-intake-baseline/manifest.json'

interface ManifestCapture {
  pairId: string
  screen: string
  route: string
  state: string
  viewport: { id: CaptureViewportId; width: number; height: number }
  skin: CaptureSkin
  reached: { pathname: string; heading: string; stateVisible: boolean }
  screenshot: { name: string; sha256: string; bytes: number }
  motion: { reducedMotion: boolean; running: string[]; settled: boolean }
}

interface Manifest {
  task: string
  phase: string
  identity: {
    packageName: string
    packageVersion: string
    packageHash: string
    runtimeSourceHash: string
    applicationCommit: string
    testedDeployment: string
  }
  baseline: { task: string; inventory: string; mainSha: string }
  deterministic: boolean
  liveGeneration: boolean
  run: {
    deployedProof: boolean
    counts: { expected: number; unexpected: number; flaky: number; skipped: number }
    positiveCaptures: number
    negativeRejections: number
    generation: { journeyGenerationRequests: number; blockedCaptureGenerations: number }
  }
  matrix: {
    viewports: { captured: { id: string }[]; notCaptured: { id: string }[] }
    skins: { captured: string[]; notCaptured: string[] }
  }
  screenshotDirectory: string
  captures: ManifestCapture[]
  supplemental?: {
    version: number
    status: string
    deployedProof: boolean
    acceptanceComplete: boolean
    captures: Array<ManifestCapture & {
      phase: string; project: string; sourceFile: string; caseId: string; invocationId: string
      identity: Manifest['identity']; deterministic: boolean; liveGeneration: boolean
      deployedProof: boolean; acceptanceApproved: boolean; pictureKind: string
      screenshot: { name: string; sha256: string; bytes: number; explicit: boolean }
    }>
    packets: Array<{
      caseId: string; invocationId: string; images: number; status: string
      generation: { requests: number; forwarded: number; blocked?: number; blockedUnexpected?: number }
      fixtures?: string[]
    }>
    runs: Array<{
      invocationId: string; namedCases: number; executedCases: number; boundPassedCases: number
      passed: number; failed: number; skipped: number; notRun: number; flaky: number
      caseOutcomes: Array<{ id: string; status: string }>
    }>
    coverage: Array<{
      screen: string; route: string | null; state: string; historicalImages: string[]
      canonicalImages: string[]; variantImages: string[]; surfaceImages: string[]
      transitionDestinationImages: string[]; transitions: unknown[]; dispositions: unknown[]
    }>
    beforeFindings: Array<{
      kind: string; screenshot?: string; screenshotSha256?: string; containmentPassed?: boolean
      directRouteScreenshot?: string; navigationSuccessClaim?: boolean; acceptanceApproved?: boolean
      bottom?: number; requiredMaxBottom?: number
    }>
  }
  contactSheets: unknown[]
  coverage: {
    status: string
    inventoryStates: number
    capturedStates: number
    notCapturedStates: number
    entries: { screen: string; route: string | null; recordedStates: number; capturedStates: string[] }[]
  }
}

const manifest = JSON.parse(readFileSync(resolve(root, MANIFEST_PATH), 'utf-8')) as Manifest

describe('0.14.3 before-state manifest (TASK-040)', () => {
  it('names the commit, package and baseline every capture was taken with', () => {
    expect(manifest.task).toBe('TASK-040')
    expect(manifest.phase).toBe('before')
    expect(manifest.identity.packageName).toBe('clear-design-system')
    expect(manifest.identity.packageVersion).toBe(readBaselinePackages(root).before)
    expect(manifest.identity.packageHash).toMatch(/^[0-9a-f]{64}$/)
    expect(manifest.identity.runtimeSourceHash).toMatch(/^[0-9a-f]{64}$/)
    expect(manifest.identity.applicationCommit).toMatch(/^[0-9a-f]{40}$/)
    expect(new URL(manifest.identity.testedDeployment).origin).toBe(manifest.identity.testedDeployment)

    const inventory = readBaselineInventory(root)
    expect(manifest.baseline).toEqual({
      task: inventory.task,
      inventory: BASELINE_INVENTORY_PATH,
      mainSha: inventory.mainSha,
    })
  })

  it('holds exactly the screenshots it lists, byte for byte', () => {
    const onDisk = readdirSync(resolve(root, manifest.screenshotDirectory)).filter((name) =>
      name.endsWith('.png'),
    )
    const allCaptures = [...manifest.captures, ...(manifest.supplemental?.captures ?? [])]
    expect(onDisk.sort()).toEqual(allCaptures.map((capture) => capture.screenshot.name).sort())
    expect(manifest.captures).toHaveLength(15)

    for (const capture of allCaptures) {
      const bytes = readFileSync(resolve(root, manifest.screenshotDirectory, capture.screenshot.name))
      expect(bytes.byteLength, capture.pairId).toBe(capture.screenshot.bytes)
      expect(createHash('sha256').update(bytes).digest('hex'), capture.pairId).toBe(
        capture.screenshot.sha256,
      )
    }
  })

  it('files every capture under the harness target it reached, with skin and viewport', () => {
    const pairIds = manifest.captures.map((capture) => capture.pairId)
    expect(new Set(pairIds).size).toBe(pairIds.length)

    for (const capture of manifest.captures) {
      const target = AUTHENTICATED_CAPTURE_TARGETS.find(
        (candidate) =>
          candidate.screen === capture.screen &&
          candidate.route === capture.route &&
          candidate.state === capture.state,
      )
      expect(target, capture.pairId).toBeDefined()
      // Reached, not redirected: the route and heading are the target's own.
      expect(capture.reached).toEqual({
        pathname: target!.path,
        heading: target!.heading,
        stateVisible: true,
      })
      expect(CAPTURE_SKINS).toContain(capture.skin)
      expect(CAPTURE_VIEWPORTS).toContainEqual(capture.viewport)
      expect(capture.pairId).toBe(capturePairId(capture, capture.viewport.id, capture.skin))
      expect(capture.screenshot.name).toBe(`${capture.pairId}.png`)
    }
  })

  it('reports the matrix and the run it has, not the one it was asked for', () => {
    const viewports = [...new Set(manifest.captures.map((capture) => capture.viewport.id))]
    const skins = [...new Set(manifest.captures.map((capture) => capture.skin))]
    expect(manifest.matrix.viewports.captured.map((viewport) => viewport.id).sort()).toEqual(viewports.sort())
    expect(manifest.matrix.skins.captured.sort()).toEqual(skins.sort())
    expect(
      [...viewports, ...manifest.matrix.viewports.notCaptured.map((viewport) => viewport.id)].sort(),
    ).toEqual(CAPTURE_VIEWPORTS.map((viewport) => viewport.id).sort())
    expect([...skins, ...manifest.matrix.skins.notCaptured].sort()).toEqual([...CAPTURE_SKINS].sort())

    expect(manifest.run.positiveCaptures).toBe(manifest.captures.length)
    expect(manifest.run.counts).toEqual({
      expected: manifest.run.positiveCaptures + manifest.run.negativeRejections,
      unexpected: 0,
      flaky: 0,
      skipped: 0,
    })
    expect(manifest.run.deployedProof).toBe(false)
  })

  it('used no generation', () => {
    expect(manifest.deterministic).toBe(true)
    expect(manifest.liveGeneration).toBe(false)
    expect(manifest.run.generation).toMatchObject({
      journeyGenerationRequests: 0,
      blockedCaptureGenerations: 0,
    })
  })

  it('counts coverage against the whole TASK-001 inventory and claims no more', () => {
    const inventory = readBaselineInventory(root)
    expect(manifest.coverage.entries.map(({ screen, route }) => [screen, route])).toEqual(
      inventory.entries.map(({ screen, route }) => [screen, route]),
    )

    for (const [index, entry] of manifest.coverage.entries.entries()) {
      const recorded = inventory.entries[index]
      expect(entry.recordedStates, entry.screen).toBe(recorded.states.length)
      const captured = recorded.states.filter((state) =>
        manifest.captures.some(
          (capture) =>
            capture.screen === recorded.screen && capture.route === recorded.route && capture.state === state,
        ),
      )
      expect(entry.capturedStates, entry.screen).toEqual(captured)
    }

    const total = inventory.entries.reduce((sum, entry) => sum + entry.states.length, 0)
    const captured = manifest.coverage.entries.reduce((sum, entry) => sum + entry.capturedStates.length, 0)
    expect(manifest.coverage.inventoryStates).toBe(total)
    expect(manifest.coverage.capturedStates).toBe(captured)
    expect(manifest.coverage.notCapturedStates).toBe(total - captured)
    expect(manifest.coverage.status).toBe(captured === total ? 'complete' : 'partial')
  })

  it('keeps supplemental capture provenance separate from historical and deployed proof', () => {
    const supplement = manifest.supplemental
    expect(supplement, 'The partial original five-state baseline is not the complete intake record').toBeDefined()
    expect(supplement!.version).toBe(1)
    expect(supplement!.deployedProof).toBe(false)
    expect(supplement!.acceptanceComplete).toBe(false)
    expect(supplement!.status).toBe('acceptance-review-pending')
    const names = supplement!.captures.map((capture) => capture.screenshot.name)
    expect(new Set(names).size).toBe(names.length)
    for (const capture of supplement!.captures) {
      expect(capture.phase).toBe('before')
      expect(capture.project).toBe('mobile')
      expect(capture.identity.packageVersion).toBe(manifest.identity.packageVersion)
      expect(capture.identity.packageHash).toBe(manifest.identity.packageHash)
      expect(capture.identity.runtimeSourceHash).toBe(manifest.identity.runtimeSourceHash)
      expect(capture.identity.applicationCommit).toMatch(/^[0-9a-f]{40}$/)
      const origin = new URL(capture.identity.testedDeployment)
      expect(origin.hostname).toBe('127.0.0.1')
      expect(origin.origin).toBe(capture.identity.testedDeployment)
      expect(capture.deterministic).toBe(true)
      expect(capture.liveGeneration).toBe(false)
      expect(capture.deployedProof).toBe(false)
      expect(capture.acceptanceApproved).toBe(false)
      expect(capture.screenshot.explicit).toBe(true)
      expect(['canonical-state', 'route-variant', 'non-route-surface', 'transition-destination']).toContain(capture.pictureKind)
      const bound = supplement!.runs.find((run) => run.invocationId === capture.invocationId)
      expect(bound?.caseOutcomes).toContainEqual({ id: capture.caseId, status: 'passed' })
      const identity = JSON.parse(capture.caseId) as string[]
      expect(identity[0]).toBe(capture.project)
      expect(identity[1]).toBe(capture.sourceFile)
    }
  })

  it('retains every actual batch outcome without manufacturing an all-green invocation', () => {
    const supplement = manifest.supplemental!
    const invocations = supplement.runs.map((run) => run.invocationId)
    expect(new Set(invocations).size).toBe(invocations.length)
    for (const run of supplement.runs) {
      expect(run.namedCases).toBe(run.caseOutcomes.length)
      for (const [count, status] of [
        ['passed', 'passed'], ['failed', 'failed'], ['skipped', 'skipped'],
        ['notRun', 'not-run'], ['flaky', 'flaky'],
      ] as const) expect(run[count]).toBe(run.caseOutcomes.filter((row) => row.status === status).length)
      expect(run.executedCases).toBe(run.passed + run.failed + run.flaky)
      expect(run.boundPassedCases).toBe(supplement.packets.filter((packet) => packet.invocationId === run.invocationId).length)
    }
    expect(supplement.packets.reduce((sum, packet) => sum + packet.images, 0)).toBe(supplement.captures.length)
    expect(supplement.runs.some((run) => run.failed > 0)).toBe(true)
  })

  it('keeps known adverse before-state geometry rather than labeling capture success containment success', () => {
    const supplement = manifest.supplemental!
    const finding = supplement.beforeFindings.find((row) => row.kind === 'known-before-layout-constraint')
    expect(finding).toBeDefined()
    expect(finding!.containmentPassed).toBe(false)
    expect(finding!.bottom!).toBeGreaterThan(finding!.requiredMaxBottom!)
    const picture = supplement.captures.find((capture) => capture.screenshot.name === finding!.screenshot)
    expect(picture?.screenshot.sha256).toBe(finding!.screenshotSha256)
  })

  it('accounts for every inventory label without treating destinations or source-only branches as rendered states', () => {
    const supplement = manifest.supplemental!
    const expected = readBaselineInventory(root).entries.flatMap((entry) =>
      entry.states.map((state) => [entry.screen, entry.route, state]),
    )
    expect(supplement.coverage.map((entry) => [entry.screen, entry.route, entry.state])).toEqual(expected)
    for (const entry of supplement.coverage) {
      expect(entry.canonicalImages.length + entry.variantImages.length + entry.surfaceImages.length +
        entry.transitionDestinationImages.length + entry.dispositions.length, `${entry.screen}: ${entry.state}`).toBeGreaterThan(0)
    }
  })

  it('retains locally fulfilled generation request counts without claiming provider generation', () => {
    for (const packet of manifest.supplemental!.packets) {
      expect(packet.generation.forwarded).toBe(0)
      expect(packet.generation.blocked ?? packet.generation.blockedUnexpected).toBe(0)
      expect(Number.isSafeInteger(packet.generation.requests)).toBe(true)
      expect(packet.generation.requests).toBeGreaterThanOrEqual(0)
      if (packet.generation.requests > 0) expect(packet.fixtures?.length).toBeGreaterThan(0)
    }
  })

  it('preserves the Gallery wrong-link finding separately from direct-route specimens', () => {
    const supplement = manifest.supplemental!
    const finding = supplement.beforeFindings.find((row) => row.kind === 'known-before-navigation-defect')
    expect(finding).toBeDefined()
    expect(finding!.navigationSuccessClaim).toBe(false)
    expect(finding!.acceptanceApproved).toBe(false)
    const observed = supplement.captures.find((capture) => capture.screenshot.name === finding!.screenshot)
    const direct = supplement.captures.find((capture) => capture.screenshot.name === finding!.directRouteScreenshot)
    expect(observed?.screenshot.sha256).toBe(finding!.screenshotSha256)
    expect(observed?.reached.pathname).toBe('/dev/gallery/ds/app')
    expect(direct?.reached.pathname).toBe('/dev/gallery/app')
  })
})
