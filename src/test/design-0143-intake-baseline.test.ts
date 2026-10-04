import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REQUIRED_SCREENS } from '../../e2e/required-routes'

/**
 * TASK-001 (#347) — the 0.14.3 intake baseline is a record of the before-state.
 * These tests hold the record to its shape; they do not re-prove what it records.
 */

const root = resolve(import.meta.dirname, '../..')
const baseline = resolve(root, 'docs/design/0143-intake-baseline')

function read(name: string) {
  return JSON.parse(readFileSync(resolve(baseline, name), 'utf-8'))
}

const SHA = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/

describe('0.14.3 intake baseline', () => {
  it('records the main SHA, the source identity and the owner-declared archive hash', () => {
    const intake = read('intake-baseline.json')

    expect(intake.main.sha).toMatch(SHA)
    expect(intake.main.moving).toBe(true)
    expect(intake.source.version).toBe('0.14.3')
    expect(intake.source.archiveSha256).toBe(
      'ef4a0f9ae0c41e4acc314a0202f48092d229910a1b16d84261275db85f966682',
    )
    expect(intake.source.publicEntry).toEqual({
      main: './index.js',
      types: './index.d.ts',
      styles: './styles.css',
    })
  })

  it('links recovery 011 completion to committed records that exist', () => {
    const { recovery011 } = read('intake-baseline.json')

    expect(recovery011.proof.length).toBeGreaterThan(0)
    for (const { path, anchor } of recovery011.proof) {
      expect(readFileSync(resolve(root, path), 'utf-8'), path).toContain(anchor)
    }
    expect(recovery011.behavioralUiToPreserve.map((entry: { task: string }) => entry.task)).toEqual([
      'TASK-009',
      'TASK-010',
      'TASK-011',
      'TASK-012',
    ])
    expect(recovery011.controller.stateChangedByThisTask).toBe(false)
    expect(recovery011.controller.heartbeatChangedByThisTask).toBe(false)
    expect(recovery011.controller.secondControllerStarted).toBe(false)
  })

  it('preserves PR #287 and never states a live state it did not read', () => {
    const { pr287 } = read('intake-baseline.json')

    expect(pr287.number).toBe(287)
    expect(pr287.disposition).toBe('preserve_untouched')
    if (!pr287.liveStateObserved) {
      expect(pr287.liveRecheck).toMatch(/^not_performed/)
      expect(pr287).not.toHaveProperty('state')
      expect(pr287).not.toHaveProperty('headSha')
    }
  })

  it('records a deployed backend identity with its proof, not local source', () => {
    const backend = read('backend-baseline.json')

    expect(backend.verified).toBe(true)
    expect(backend.verificationBasis).toBeTruthy()
    expect(backend.deployedReleaseIdentity.verifiedAtMainSha).toMatch(SHA)
    expect(backend.deployedReleaseIdentity.function.bundleSha256).toMatch(SHA256)
    expect(backend.deployedReleaseIdentity.application.deploymentId).toBeTruthy()
    for (const { path, anchor } of backend.proof) {
      expect(readFileSync(resolve(root, path), 'utf-8'), path).toContain(anchor)
    }
  })

  it('inventories every required screen with a source that exists', () => {
    const inventory = read('route-state-inventory.json')

    expect(inventory.screens.map((entry: { screen: string }) => entry.screen)).toEqual(
      REQUIRED_SCREENS.map((entry) => entry.screen),
    )
    for (const entry of inventory.screens) {
      const required = REQUIRED_SCREENS.find((screen) => screen.screen === entry.screen)
      expect(entry.route, entry.screen).toBe(required?.route)
      expect(entry.guard, entry.screen).toBe(required?.guard)
      for (const path of [entry.source, entry.unit, ...entry.browser]) {
        expect(existsSync(resolve(root, path)), path).toBe(true)
      }
    }
  })

  it('gives each shared file one serialized owner', () => {
    const ownership = read('shared-file-ownership.json')
    const orders = ownership.foundations.map((entry: { order: number }) => entry.order)
    const owned = ownership.foundations.flatMap((entry: { owns: string[] }) => entry.owns)

    expect(orders).toEqual(orders.map((_: number, index: number) => index + 1))
    expect(new Set(owned).size).toBe(owned.length)
    for (const entry of ownership.foundations) {
      expect(entry.pr287, entry.role).toBeTruthy()
    }
  })

  it('carries no credential-shaped value', () => {
    for (const name of [
      'intake-baseline.json',
      'backend-baseline.json',
      'route-state-inventory.json',
      'shared-file-ownership.json',
    ]) {
      const text = readFileSync(resolve(baseline, name), 'utf-8')
      expect(text, name).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}|sb_[a-z]+_|sbp_|@[a-z0-9-]+\.(com|io|app)\b/)
    }
  })
})
