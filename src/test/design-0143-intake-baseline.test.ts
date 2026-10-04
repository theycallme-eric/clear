import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REQUIRED_SCREENS } from '../../e2e/required-routes'

/**
 * TASK-001 (#347) — the 0.14.3 intake baseline is a record of the before-state.
 * These tests compare the record with independent approved-policy and retained-proof
 * identities. They do not re-query a deployment, model or external Runner files.
 */

const root = resolve(import.meta.dirname, '../..')
const baseline = resolve(root, 'docs/design/0143-intake-baseline')

function read(name: string) {
  return JSON.parse(readFileSync(resolve(baseline, name), 'utf-8'))
}

const SHA = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/
const MAIN = 'f83ddc9770d2f013f65b0e5140ada09ca84b7583'
// Snapshotted from actual TASK_OWNERSHIP + approved handoff, not JSON under test.
const APPROVED_FOUNDATIONS = {
  "TASK-002": {
    "owns": [
      "src/design-system/**",
      "exports/clear-design-system-0.14.3/**",
      "src/main.tsx",
      "src/test/design-system*",
      "docs/specs/design/ATOMIC.md (identity section only)",
      "src/ui/app-dialog* (minimum lifecycle compatibility only)",
      "src/ui/toast-host* (minimum lifecycle compatibility only)",
      "src/dev/gallery-* (compile-facing migration only)"
    ],
    "dependsOn": [
      "TASK-040"
    ]
  },
  "TASK-003": {
    "owns": [
      "src/ui/card*",
      "src/ui/composition*",
      "src/ui/Heading*"
    ],
    "dependsOn": [
      "TASK-002"
    ]
  },
  "TASK-004": {
    "owns": [
      "src/ui/select*",
      "src/ui/formFocus*",
      "src/ui/checkbox-group*",
      "src/ui/inline-save*",
      "src/ui/text-action*"
    ],
    "dependsOn": [
      "TASK-003"
    ]
  },
  "TASK-005": {
    "owns": [
      "src/app/RootLayout*",
      "src/app/Screen*",
      "src/app/atmosphere*",
      "src/ui/atmosphere*",
      "src/app/Nav*",
      "src/ui/header-back-button*",
      "src/styles/**"
    ],
    "dependsOn": [
      "TASK-003"
    ]
  },
  "TASK-006": {
    "owns": [
      "src/ui/motion*",
      "src/app/router*",
      "src/app/AppChrome*",
      "src/styles/** (motion only)"
    ],
    "dependsOn": [
      "TASK-005"
    ]
  },
  "TASK-007": {
    "owns": [
      "src/ui/app-dialog*",
      "src/ui/blocking-dialog*",
      "src/app/ActiveSessionPrompt*",
      "src/styles/** (dialog action layout only)"
    ],
    "dependsOn": [
      "TASK-006"
    ]
  },
  "TASK-008": {
    "owns": [
      "src/ui/toast-host*"
    ],
    "dependsOn": [
      "TASK-007"
    ]
  },
  "TASK-009": {
    "owns": [
      "src/ui/view-state*",
      "src/app/GenerationLoadingHost*",
      "src/app/GenerationLoading*",
      "src/app/ErrorBoundary*"
    ],
    "dependsOn": [
      "TASK-008"
    ]
  },
  "TASK-032": {
    "owns": [
      "src/ui/workout-chrome*",
      "src/ui/exercise-coaching*",
      "src/ui/set-sync-notice*",
      "src/ui/rest-timer-bar*"
    ],
    "dependsOn": [
      "TASK-009"
    ]
  },
  "TASK-039": {
    "owns": [
      "src/ui/mood*",
      "src/app/FavoriteToggle*"
    ],
    "dependsOn": [
      "TASK-009"
    ]
  },
  "TASK-025": {
    "owns": [
      "docs/specs/design/ATOMIC.md (complete current contract)",
      "docs/specs/IA.md (visual only)",
      "docs/design/** (consolidation only)",
      "scripts/adherence/**",
      "eslint.ds.config.js",
      "src/test/adherence-gate*",
      "src/test/design-system*",
      "src/dev/gallery-* (final specimens)"
    ],
    "dependsOn": [
      "TASK-034",
      "TASK-035",
      "TASK-036"
    ]
  }
} as const
const PR287_PATHS = [
  "docs/journal/2026-10-01.md",
  "e2e/uat-batch-01.spec.ts",
  "src/app/Generate.test.tsx",
  "src/app/Generate.tsx",
  "src/app/History.tsx",
  "src/app/Home.test.tsx",
  "src/app/LocationSettings.tsx",
  "src/app/SessionDetail.tsx",
  "src/dev/gallery-registry.tsx",
  "src/test/goal-focus-journeys.test.tsx",
  "src/ui/card.test.tsx",
  "src/ui/card.tsx",
  "src/ui/header-back-button.test.tsx",
  "src/ui/header-back-button.tsx"
] as const

describe('0.14.3 intake baseline', () => {
  it('records the main SHA, the source identity and the operator-hashed archive', () => {
    const intake = read('intake-baseline.json')

    expect(intake.main.sha).toMatch(SHA)
    expect(intake.main.sha).toBe(MAIN)
    expect(intake.main.treeSha).toBe('ad445729f3b3534b6897202cc38ee8aedcd86a9c')
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
    expect(pr287.liveStateObserved).toBe(false)
    expect(pr287).not.toHaveProperty('state')
    expect(pr287).not.toHaveProperty('headSha')
    expect(pr287.operatorObservation).toMatchObject({
      state: 'open', merged: false, draft: false, mergeable: false, mergeableState: 'dirty',
      headSha: '55981753796643d74011ebd7bf702a6e36896635',
      observedAt: '2026-10-04T02:05:19.147040+00:00',
    })
  })

  it('records a deployed backend identity with its proof, not local source', () => {
    const backend = read('backend-baseline.json')

    expect(backend.verified).toBe(true)
    expect(backend.verificationBasis).toBeTruthy()
    expect(backend.deployedReleaseIdentity.verifiedAtMainSha).toMatch(SHA)
    expect(backend.deployedReleaseIdentity.verifiedAtMainSha).toBe(MAIN)
    expect(backend.deployedReleaseIdentity.function.bundleSha256).toMatch(SHA256)
    expect(backend.deployedReleaseIdentity.application).toMatchObject({
      sha: MAIN, environment: 'Production', deploymentId: '6824761508',
      successStatusId: '19207035097', state: 'success', createdAt: '2026-10-03T07:24:43Z',
      observedAt: '2026-10-04T01:54:09.556088+00:00',
    })
    expect(backend.retainedOperatorEvidence.sha256).toBe('efa9450b52818efd1637e81176c8b29d28e14263d2534576fc3bb1ef46bc2daf')
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

    expect(orders).toEqual(orders.map((_: number, index: number) => index + 1))
    expect(ownership.foundations.map((entry: { task: string }) => entry.task)).toEqual(Object.keys(APPROVED_FOUNDATIONS))
    for (const [task, expected] of Object.entries(APPROVED_FOUNDATIONS)) {
      const entry = ownership.foundations.find((candidate: { task: string }) => candidate.task === task)
      expect(entry.owns, task).toEqual(expected.owns)
      expect(entry.dependsOn, task).toEqual(expected.dependsOn)
      expect(entry.pr287, task).toBeTruthy()
    }
    expect(ownership.policySource.fileSha256).toBe('6d8060d7bd6a755b40b4e77f7961d4eaf8508ba5ba85f968cf6b41b129ccc515')
  })

  it('preserves actual historical function/model proof separately from current f83 app deployment', () => {
    const backend = read('backend-baseline.json')
    const historical = backend.historicalRuntimeProof
    expect(historical.preserved).toBe(true)
    expect(historical.verifiedAtMainSha).toBe('df91e415168b0b11449ed146f2255e1f1686dad5')
    expect(historical.application).toMatchObject({
      deploymentId: '6822912431', successStatusId: '19202747979',
      immutableUrl: 'https://clear-37caizbsu-erics-projects-0ade0dda.vercel.app',
    })
    expect(historical.function).toMatchObject({
      name: 'generate-workout', state: 'ACTIVE', version: 33,
      bundleSha256: 'd47e58037c78e7b60d30afbb241929ca01fffbb24786c2a4a7633dde4977582c',
      promptVersion: '5.1.2', outputVersion: '4.1.0',
    })
    expect(historical.function).toEqual(backend.deployedReleaseIdentity.function)
    expect(historical.database).toEqual(backend.deployedReleaseIdentity.database)
    expect(historical.hostedRuns).toEqual({
      trustedBackend: 'https://github.com/theycallme-eric/clear/actions/runs/37094532559',
      deployedNoModel: 'https://github.com/theycallme-eric/clear/actions/runs/37094567243',
      realRelease: 'https://github.com/theycallme-eric/clear/actions/runs/37094710974',
    })
    expect(historical.sourceEquivalence).toMatchObject({ from: historical.verifiedAtMainSha, to: MAIN })
    expect(historical.limit).toContain('not a newly exercised')
  })

  it('binds all original 011 task identities, archive bytes and current graph to retained observations', () => {
    const intake = read('intake-baseline.json')
    expect(intake.recovery011.originalIdentity.handoffSha256).toBe('cac19ff02997fd95ea5472ba07c8f024cd954dbefa7bf54afd2e9400283ca34b')
    expect(intake.recovery011.originalIdentity.taskIds).toEqual(Array.from({ length: 30 }, (_, i) => 'TASK-' + String(i + 1).padStart(3, '0')))
    expect(intake.recovery011.originalIdentity.latestCompleted).toBe(30)
    expect(intake.recovery011.originalIdentity.releaseMergeCommit).toBe(MAIN)
    expect(intake.recovery011.controller.observedRecoveryControllerProcesses).toEqual([])
    expect(intake.recovery011.controller.observedAt).toBe('2026-10-04T02:05:19.147040+00:00')
    expect(intake.source.archiveSha256Basis).toMatch(/^actual_original_file_bytes/)
    expect(intake.source.archiveVerification).toMatchObject({
      fileCount: 577,
      inventoryFileSha256: '304b45ad196d70559c3de69fb5c2bd69b6881b77510fbdcfe0888aca0b551757',
      sourceManifestFileSha256: 'ed8679e6cc3693c99b19c791f34cc5413e1c065934879313a2633e98e9d3eaed',
    })
    expect(intake.source.installedBaseline.version).toBe('0.9.7')
    // Historical export, not the future active vendor version.
    const saved = JSON.parse(readFileSync(resolve(root, intake.source.installedBaseline.savedExport, 'package.json'), 'utf-8'))
    expect(saved.version).toBe('0.9.7')
    expect(intake.noOverlapBoundary.approvalIdentity).toMatchObject({
      handoffVersion: 4, approval: 2, requirementsRevision: 11,
      handoffSha256: '327808c15c33b11ba77d33e4d882be2c8c6280082bb542b16c6b62a163106b4d',
      graphSha256: '2a6fa9223b19c4ddd3ccb2a26a134d4109d6c0291b1272f97d92488009193d32',
      approvalSha256: '657564d78b13e5ea40a1a4269ad3ec7e6ca357b7551e11e741f1f57c6e3fa4cd',
      current012ControllerPermitted: 'sole existing TASK001 wave, unchanged',
    })
    expect(intake.recovery011.uiHold).toContain('no passcode or release word gates')
  })

  it('maps exactly the observed fourteen PR287 paths and preserves their behavior within actual owners', () => {
    const { pr287 } = read('intake-baseline.json')
    expect(pr287.changedFiles.map((entry: { path: string }) => entry.path)).toEqual(PR287_PATHS)
    const expectedOwners = [
      ['shared-journal-append-only'], ['TASK-012', 'TASK-016'], ['TASK-016'], ['TASK-016'],
      ['TASK-014'], ['TASK-013'], ['TASK-024'], ['TASK-015'], ['TASK-002', 'TASK-025'],
      ['TASK-013', 'TASK-016'], ['TASK-003'], ['TASK-003'], ['TASK-005'], ['TASK-005'],
    ]
    pr287.changedFiles.forEach((entry: { path: string; owners: string[]; ownershipBasis: string; disposition: string }, i: number) => {
      expect(entry.owners, entry.path).toEqual(expectedOwners[i])
      expect(entry.ownershipBasis.length, entry.path).toBeGreaterThan(20)
      expect(entry.disposition.length, entry.path).toBeGreaterThan(20)
    })
    expect(pr287.changedFiles[9].ownershipBasis).toContain('No explicit whole-file assignment')
    expect(pr287.preservedOldProduct.status).toEqual([' M docs/journal/2026-10-01.md', '?? docs/process/CLEAR-GENERATION-RELIABILITY-RECOVERY.md'])
  })

  it('records concrete reachable branches with existing source/fixture pointers and planned capture ownership', () => {
    const inventory = read('route-state-inventory.json')
    const owners = ['TASK-010', 'TASK-011', 'TASK-012', 'TASK-013', 'TASK-016', 'TASK-016', 'TASK-017', 'TASK-021', 'TASK-022', 'TASK-014', 'TASK-015', 'TASK-023', 'TASK-025', 'TASK-010']
    inventory.screens.forEach((entry: { screen: string; ownerTask: string; stateSources: string[]; fixtureSources: string[]; reachableStates: string[]; fixtureOwner: string; beforeCaptureOwner: string }, i: number) => {
      expect(entry.ownerTask, entry.screen).toBe(owners[i])
      expect(entry.reachableStates.length, entry.screen).toBeGreaterThan(1)
      expect(entry.fixtureOwner).toBe('TASK-033')
      expect(entry.beforeCaptureOwner).toBe('TASK-040')
      for (const path of [...entry.stateSources, ...entry.fixtureSources]) expect(existsSync(resolve(root, path)), path).toBe(true)
    })
    const find = (screen: string) => inventory.screens.find((entry: { screen: string }) => entry.screen === screen)
    expect(find('Generate').reachableStates).toEqual(expect.arrayContaining(['history-error-manual-or-retry', 'first-or-stale-history-manual-focus', 'cancel-preserves-draft']))
    expect(find('History').reachableStates).toEqual(expect.arrayContaining(['no-workouts-empty', 'filtered-no-matches', 'compatible-review-entry', 'incompatible-detail-fallback']))
    expect(find('Review').reachableStates).toEqual(expect.arrayContaining(['missing-or-invalid-handoff', 'start-failure']))
    expect(find('Workout').reachableStates).toEqual(expect.arrayContaining(['no-active-session-home', 'set-sync-sustained-failure-retry', 'finish-error-retry']))
    expect(find('Summary').reachableStates).toEqual(expect.arrayContaining(['no-completed-session-home', 'save-error-draft-retry']))
    const places = find('Settings').subRouteInventory[0]
    expect(places).toMatchObject({ route: '/settings/locations', ownerTask: 'TASK-024', fixtureOwner: 'TASK-033', beforeCaptureOwner: 'TASK-040' })
    expect(places.reachableStates).toContain('typed-viability-refusal-rollback')
    const boot = inventory.nonRouteStateInventory[0]
    expect(boot).toMatchObject({ screen: 'BootSequence', route: null, ownerTask: 'TASK-010' })
    expect(boot.reachableStates).toEqual(['checking', 'failed-retry', 'ready'])
    for (const entry of [places, boot]) {
      for (const path of [entry.source, entry.unit, ...entry.stateSources, ...entry.fixtureSources]) expect(existsSync(resolve(root, path)), path).toBe(true)
    }
    expect(inventory.captureStatus).toBe('planned_not_captured')
    expect(inventory.fixturePlan.status).toBe('planned_not_implemented_by_TASK-001')
    expect(inventory.beforeStateSequence).toEqual(['TASK-001', 'TASK-033', 'TASK-040', 'TASK-002'])
  })

  it('serializes overlapping resources and discloses path gaps without expanding scope', () => {
    const ownership = read('shared-file-ownership.json')
    const expected = {
      'src/styles/**': ['TASK-005', 'TASK-006', 'TASK-007'],
      'src/ui/app-dialog*': ['TASK-002', 'TASK-007'],
      'src/ui/toast-host*': ['TASK-002', 'TASK-008'],
      'src/dev/gallery-*': ['TASK-002', 'TASK-025'],
      'docs/specs/design/ATOMIC.md': ['TASK-002', 'TASK-025'],
      'src/test/design-system*': ['TASK-002', 'TASK-025'],
      'src/app/GenerationLoading*': ['TASK-009', 'TASK-016'],
      'e2e/uat-batch-01.spec.ts': ['TASK-012', 'TASK-016'],
      'e2e/history-detail.spec.ts': ['TASK-014', 'TASK-015'],
    }
    expect(ownership.sharedResourceStages.map((entry: { path: string }) => entry.path)).toEqual(Object.keys(expected))
    for (const [path, tasks] of Object.entries(expected)) {
      const entry = ownership.sharedResourceStages.find((candidate: { path: string }) => candidate.path === path)
      expect(entry.stages.map((stage: { task: string }) => stage.task), path).toEqual(tasks)
      expect(new Set(entry.stages.map((stage: { task: string }) => stage.task)).size, path).toBe(tasks.length)
    }
    expect(ownership.evidence.beforeStateSequence).toEqual(['TASK-001', 'TASK-033', 'TASK-040', 'TASK-002'])
    const nav = ownership.sourcePathFindings.find((entry: { source: string }) => entry.source === 'src/ui/Nav.tsx')
    expect(nav.approvedScope).toBe('src/app/Nav*')
    expect(nav.disposition).toContain('not let this intake silently add ownership')
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
