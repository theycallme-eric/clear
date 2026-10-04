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
    expect(onDisk.sort()).toEqual(manifest.captures.map((capture) => capture.screenshot.name).sort())

    for (const capture of manifest.captures) {
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
})
