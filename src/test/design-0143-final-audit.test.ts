import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { hashTree } from '../../e2e/design-0143/capture'
import { REQUIRED_SCREENS } from '../../e2e/required-routes'
import {
  currentFormatRuntimeHash, formatBaselineAbsence, formatDriverHash, formatPreviewManifest,
  FORMAT_EVIDENCE_DIR, FORMAT_HISTORICAL_COMMIT, FORMAT_HISTORICAL_EVIDENCE_DIR, FORMAT_ROUTE, validateFormatPreviewEvidence, type FormatEvidenceRecord,
} from '../../e2e/design-0143/format-preview-evidence'
import {
  browserTestsForTarget,
  REQ_007_NEXT_WORKOUT_CASE,
  REQ_007_REST_DAY_CASE,
  REQ_011_REVIEW_CASE,
} from '../../playwright.config'
import { assertCaptureSourceLineage, capturePayloadSha256 } from './capture-source-lineage'

describe('TASK-027 browser selection follows the tested package and target', () => {
  const publicOtp = 'mobile design-0143/task-040-entry-settings.spec.ts entry: Welcome and OTP validation, busy, typed failure and cooldown'
  const historical = [
    'design-0143/baseline.spec.ts 0.14.3 capture harness: authenticated routes (REQ-030) captures Home',
    'design-0143/task-040-home-review.spec.ts TASK-040 Home and Review before-state artifacts',
    'design-0143/task-040-lifecycle.spec.ts TASK-040 lifecycle before-state artifacts',
    'design-0143/task-040-lifecycle-gaps.spec.ts TASK-040 additive lifecycle gaps',
    'design-0143/task-040-entry-settings.spec.ts entry: real new user, all onboarding steps, retained draft and actual commit',
  ]
  const deployed = 'mobile generation-deployed-matrix.spec.ts deployed UAT matrix: nine entries to Review, model-free (REQ-028)'

  it('keeps the public OTP case on current local and deployed targets', () => {
    expect(browserTestsForTarget('0.14.3', 'http://127.0.0.1:4173').test(publicOtp)).toBe(true)
    expect(browserTestsForTarget('0.14.3', 'https://clear.example.com').test(publicOtp)).toBe(true)
  })

  it('keeps the REQ-011 Review→Workout and REQ-007 rest-day and next-workout cases on current targets, and only those', () => {
    const file = 'design-0143/task-040-home-review.spec.ts TASK-040 — Home and Review additive before-state artifacts'
    const source = readFileSync(resolve(import.meta.dirname, '../../e2e/design-0143/task-040-home-review.spec.ts'), 'utf8')
    for (const title of [REQ_011_REVIEW_CASE, REQ_007_REST_DAY_CASE, REQ_007_NEXT_WORKOUT_CASE]) {
      const kept = `mobile ${file} ${title}`
      expect(source).toContain(`'${title}'`)
      expect(browserTestsForTarget('0.14.3', 'http://127.0.0.1:4173').test(kept)).toBe(true)
      expect(browserTestsForTarget('0.14.3', 'https://clear.example.com').test(kept)).toBe(true)
    }
    expect(browserTestsForTarget('0.14.3', 'http://127.0.0.1:4173').test(
      `mobile ${file} Home: real active session Resume handoff`,
    )).toBe(false)
  })

  it.each(historical)('keeps historical BEFORE evidence in its original package lane: %s', (title) => {
    expect(browserTestsForTarget('0.9.7', 'http://127.0.0.1:4173').test(title)).toBe(true)
    expect(browserTestsForTarget('0.14.3', 'http://127.0.0.1:4173').test(title)).toBe(false)
    expect(browserTestsForTarget('0.14.3', 'https://clear.example.com').test(title)).toBe(false)
  })

  it.each(['http://127.0.0.1:4173', 'http://localhost:4173', 'http://[::1]:4173'])(
    'reserves the deployed matrix for a deployed target, including loopback URLs: %s', (target) => {
      expect(browserTestsForTarget('0.14.3', target).test(deployed)).toBe(false)
      expect(browserTestsForTarget('0.14.3', 'https://clear.example.com').test(deployed)).toBe(true)
    },
  )

  it.each(['mobile'])('retains current UI and accessibility coverage on %s', (project) => {
    for (const file of ['entry-forms', 'collections-settings', 'workout-lifecycle', 'accessibility']) {
      expect(browserTestsForTarget('0.14.3', 'http://127.0.0.1:4173').test(
        `${project} design-0143/${file}.spec.ts current UI requirement`,
      )).toBe(true)
    }
    expect(browserTestsForTarget('0.14.3', 'http://127.0.0.1:4173').test(
      `${project} auth-otp.spec.ts public OTP`,
    )).toBe(true)
  })
})

/**
 * TASK-027 (#373) — the 0.14.3 final audit aggregates the three completed AFTER
 * evidence groups. It owns no capture: these tests hold the audit's numbers,
 * identities and proof labels to the committed manifests, records and pictures,
 * so a stale, rebound or overclaimed audit fails here rather than in review.
 */

const root = resolve(import.meta.dirname, '../..')
const AUDIT = 'docs/design/CLEAR-0.14.3-FINAL-AUDIT.md'
const OWNER_QA = 'docs/design/CLEAR-0.14.3-OWNER-QA.md'
const PACKAGE_HASH = 'e09aa5dfaf7a5e9536e9ffd7b8a00624e38c7702d484dc1e820153e22864a1a8'
const GROUPS = [
  { consumer: 'entry-forms', task: 'TASK-034' },
  { consumer: 'collections-settings', task: 'TASK-035' },
  { consumer: 'workout-lifecycle', task: 'TASK-036' },
] as const
const SKINS = ['clear', 'vapour', 'signal', 'mono'] as const

type Identity = {
  packageName: string
  packageVersion: string
  packageHash: string
  runtimeSourceHash: string
  applicationCommit: string
  testedDeployment: string
}
type Manifest = {
  task: string
  consumer: string
  phase: string
  identity: Identity[]
  deterministic: boolean
  liveGeneration: boolean
  deployedProof: boolean
  run: {
    cases: { project: string; caseTitle: string; status: string; captures: number }[]
    generation: { requests: number; forwardedToProvider: number; blockedUnexpected: number }
  }
  matrix: {
    captures: number
    withBeforePicture: number
    withoutBeforePicture: unknown[]
    byViewport: Record<string, number>
    bySkin: Record<string, number>
    byScreen: Record<string, number>
  }
}
type Capture = {
  route: string | null
  skin: string
  liveGeneration: boolean
  deterministic: boolean
  before: { directory: string; screenshot: string; sha256: string } | null
  screenshot: { name: string; sha256: string }
}
type EvidenceRecord = { task: string; status: string; identity: Identity; captures: Capture[] }

const text = (path: string) => readFileSync(resolve(root, path), 'utf-8')
const json = <T,>(path: string) => JSON.parse(text(path)) as T
const sha256 = (path: string) => createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')
const dir = (consumer: string) => `docs/design/evidence-0143/${consumer}`

/** The audit's aggregate row for a group, split into its cells. */
function auditRow(consumer: string, task: string): string[] {
  const line = text(AUDIT).split('\n').find((candidate) => candidate.startsWith(`| \`${consumer}\` | ${task} |`))
  expect(line, `${AUDIT} has no aggregate row for ${consumer}`).toBeTruthy()
  return (line ?? '').split('|').slice(1, -1).map((cell) => cell.trim())
}

describe('CLEAR 0.14.3 final audit — aggregated evidence groups', () => {
  it('both owned documents exist', () => {
    expect(existsSync(resolve(root, AUDIT))).toBe(true)
    expect(existsSync(resolve(root, OWNER_QA))).toBe(true)
  })

  for (const { consumer, task } of GROUPS) {
    describe(consumer, () => {
      const manifest = json<Manifest>(`${dir(consumer)}/manifest.json`)
      const recordNames = readdirSync(resolve(root, dir(consumer), 'records')).filter((name) => name.endsWith('.json'))
      const pictures = readdirSync(resolve(root, dir(consumer), 'screenshots')).filter((name) => name.endsWith('.png'))
      const records = recordNames.map((name) => json<EvidenceRecord>(`${dir(consumer)}/records/${name}`))

      it('is a completed deterministic AFTER group that never claims live or deployed proof', () => {
        expect(manifest.task).toBe(task)
        expect(manifest.phase).toBe('after')
        expect(manifest.deterministic).toBe(true)
        expect(manifest.liveGeneration).toBe(false)
        expect(manifest.deployedProof).toBe(false)
        expect(manifest.run.generation.forwardedToProvider).toBe(0)
        expect(manifest.run.generation.blockedUnexpected).toBe(0)
        expect(manifest.run.cases.every((entry) => entry.status === 'passed')).toBe(true)
        expect(manifest.matrix.withoutBeforePicture).toEqual([])
      })

      it('its manifest, records and pictures agree with one another', () => {
        expect(records).toHaveLength(manifest.run.cases.length)
        expect(pictures).toHaveLength(manifest.matrix.captures)
        expect(records.flatMap((record) => record.captures)).toHaveLength(manifest.matrix.captures)
        expect(manifest.matrix.withBeforePicture).toBe(manifest.matrix.captures)
        const viewports = Object.values(manifest.matrix.byViewport).reduce((sum, count) => sum + count, 0)
        const skins = Object.values(manifest.matrix.bySkin).reduce((sum, count) => sum + count, 0)
        expect(viewports).toBe(manifest.matrix.captures)
        expect(skins).toBe(manifest.matrix.captures)
        for (const skin of SKINS) expect(manifest.matrix.bySkin[skin], `${skin} is pictured`).toBeGreaterThan(0)
      })

      it('every record passed on the installed 0.14.3 package and its pictures are byte-identical', () => {
        for (const record of records) {
          expect(record.task).toBe(task)
          expect(record.status).toBe('passed')
          expect(record.identity.packageVersion).toBe('0.14.3')
          expect(record.identity.packageHash).toBe(PACKAGE_HASH)
          expect(record.identity.applicationCommit).toMatch(/^[0-9a-f]{40}$/)
          expect(record.identity.runtimeSourceHash).toMatch(/^[0-9a-f]{64}$/)
          for (const capture of record.captures) {
            expect(capture.liveGeneration).toBe(false)
            expect(capture.deterministic).toBe(true)
            expect(sha256(`${dir(consumer)}/screenshots/${capture.screenshot.name}`), capture.screenshot.name)
              .toBe(capture.screenshot.sha256)
            expect(capture.before, `${capture.screenshot.name} names its BEFORE picture`).not.toBeNull()
            if (capture.before) {
              expect(sha256(`${capture.before.directory}/${capture.before.screenshot}`)).toBe(capture.before.sha256)
            }
          }
        }
      })

      it('the audit row reproduces the manifest totals', () => {
        const { byViewport, bySkin } = manifest.matrix
        expect(auditRow(consumer, task)).toEqual([
          `\`${consumer}\``,
          task,
          String(records.length),
          String(manifest.matrix.captures),
          String(byViewport.phone),
          String(byViewport.tablet),
          String(byViewport.desktop),
          String(byViewport.short),
          String(bySkin.clear),
          String(bySkin.vapour),
          String(bySkin.signal),
          String(bySkin.mono),
          String(manifest.matrix.withBeforePicture),
          String(manifest.run.generation.forwardedToProvider),
        ])
      })

      it('the audit names every package, commit and runtime identity the group was captured on', () => {
        const audit = text(AUDIT)
        for (const identity of manifest.identity) {
          expect(audit).toContain(identity.packageHash)
          expect(audit).toContain(identity.applicationCommit)
          expect(audit).toContain(identity.runtimeSourceHash)
        }
      })
    })
  }

  it('the totals row is the sum of the three groups', () => {
    const rows = GROUPS.map(({ consumer, task }) => auditRow(consumer, task))
    const line = text(AUDIT).split('\n').find((candidate) => candidate.startsWith('| **Total** |'))
    expect(line, 'the aggregate table has a total row').toBeTruthy()
    const total = (line ?? '').split('|').slice(1, -1).map((cell) => cell.trim().replaceAll('**', ''))
    for (let column = 2; column < total.length; column += 1) {
      expect(total[column], `total column ${column}`).toBe(
        String(rows.reduce((sum, row) => sum + Number(row[column]), 0)),
      )
    }
  })

  it('every real route is covered by an evidence group and owner QA', () => {
    const introducedRecords = resolve(root, FORMAT_EVIDENCE_DIR, 'records')
    const covered = new Set(
      [...GROUPS.flatMap(({ consumer }) => readdirSync(resolve(root, dir(consumer), 'records'))
        .flatMap((name) => json<EvidenceRecord>(`${dir(consumer)}/records/${name}`).captures)
        .map((capture) => capture.route)),
      ...(existsSync(introducedRecords) ? readdirSync(introducedRecords).filter((name) => name.endsWith('.json'))
        .flatMap((name) => json<FormatEvidenceRecord>(`${FORMAT_EVIDENCE_DIR}/records/${name}`).captures)
        .map((capture) => capture.route) : [])],
    )
    const qa = text(OWNER_QA)
    const routes = REQUIRED_SCREENS
      .filter((screen) => screen.route != null && screen.screen !== 'Component Gallery' && screen.screen !== 'Not Found')
      .flatMap((screen) => [screen.route as string, ...(screen.subPaths ?? [])])
    expect(new Set(routes)).toEqual(new Set([
      '/welcome', '/login', '/onboarding', '/', '/generate', '/review', '/workout', '/summary',
      '/history', '/history/:id', '/settings', '/settings/locations',
      '/settings/formats',
    ]))
    for (const route of routes) {
      expect(covered.has(route), `${route} has AFTER pictures`).toBe(true)
      expect(qa, `${route} has an owner QA step`).toContain(`\`${route}\``)
    }
    for (const skin of SKINS) expect(qa.toLowerCase()).toContain(skin)
  })
})

describe('follow-up TASK-034 — introduced route has real AFTER evidence, not a coverage waiver', () => {
  it('preserves the committed twelve-case/sixteen-PNG wider group byte-for-byte as history', () => {
    // Pinned from the actual committed eb61 group before any mobile changes.
    // A shallow CI checkout can prove its bytes without fetching old commits.
    expect(FORMAT_HISTORICAL_COMMIT).toBe('eb61b9daf21848c2727eaa6fa2c5e203f4effd7b')
    const names = [
      `${FORMAT_HISTORICAL_EVIDENCE_DIR}/manifest.json`,
      ...['records', 'screenshots'].flatMap((folder) => readdirSync(resolve(root, FORMAT_HISTORICAL_EVIDENCE_DIR, folder))
        .map((name) => `${FORMAT_HISTORICAL_EVIDENCE_DIR}/${folder}/${name}`)),
    ].sort()
    expect(names.filter((name) => name.includes('/records/'))).toHaveLength(12)
    expect(names.filter((name) => name.endsWith('.png'))).toHaveLength(16)
    const manifest = names.map((path) => ({ path, sha256: sha256(path) }))
    expect(createHash('sha256').update(JSON.stringify(manifest)).digest('hex'))
      .toBe('1e0edab78fc87e6ddc10d8a3b21873179723a3a3adca449d20ddb171470ec48e')
  })

  it('preserves the pre-V3 mobile captures unchanged', () => {
    expect(capturePayloadSha256(root, 'docs/design/evidence-0143/task034-format-preview-mobile'))
      .toBe('632c242e9f6bac131336ecec32e84223b0805628397d99b9ab9524456152b9cc')
  })

  it('requires the complete actual eight-cell mobile group and byte/pixel/source/session records', () => {
    const manifestPath = `${FORMAT_EVIDENCE_DIR}/manifest.json`
    expect(existsSync(resolve(root, manifestPath)), 'real Task034 AFTER capture is still required').toBe(true)
    const names = readdirSync(resolve(root, FORMAT_EVIDENCE_DIR, 'records')).filter((name) => name.endsWith('.json')).sort()
    const records = names.map((name) => json<FormatEvidenceRecord>(`${FORMAT_EVIDENCE_DIR}/records/${name}`))
    validateFormatPreviewEvidence(records, {
      runtimeHash: currentFormatRuntimeHash(root), packageHash: PACKAGE_HASH, driverHash: formatDriverHash(root),
      absence: formatBaselineAbsence(root), readPng: (name) => readFileSync(resolve(root, FORMAT_EVIDENCE_DIR, 'screenshots', name)),
    })
    const derived = formatPreviewManifest(records)
    expect(derived.status).toBe('complete')
    expect(json(manifestPath)).toEqual(derived)
    expect(new Set(readdirSync(resolve(root, FORMAT_EVIDENCE_DIR, 'screenshots'))))
      .toEqual(new Set(records.flatMap((record) => record.captures.map((capture) => capture.screenshot.name))))
    // Capture source remains genuine after normal protected squash delivery:
    // direct ancestry, or exact retained-input/payload/full-tree incorporation.
    // This is source continuity only; it never certifies merge approval or ACK.
    assertCaptureSourceLineage(root, {
      repository: 'theycallme-eric/clear',
      taskId: 'TASK-012',
      taskRevision: 'e5be584cb84251a6a4cc8af316a82e6cfd65636d6b51525cd2076aa6d55f3be0:TASK-012',
      runId: '48195f8e-fd87-4aa4-8be4-1c5094808b60',
      // Source-only native retained input; delivery remains independently gated.
      attempt: 1,
      testedBase: 'cabb0d20d9891a60f2c4b9cfd1387c76d365a18c',
      groupPath: FORMAT_EVIDENCE_DIR,
      capturedSourceCommits: records.map((record) => record.identity.applicationCommit!),
    })
    for (const record of records) {
      expect(record.captures.every((capture) => capture.route === FORMAT_ROUTE && capture.before === null)).toBe(true)
      for (const identity of [record.identity.applicationCommit, record.identity.runtimeSourceHash, record.driverSourceHash]) {
        expect(text(AUDIT), 'the audit names the actual capture identities').toContain(identity)
      }
    }
  })
})

describe('CLEAR 0.14.3 final audit — proof labels', () => {
  const audit = text(AUDIT)

  it('names the existing deployed jobs and matrix without inventing a workflow', () => {
    const workflow = text('.github/workflows/e2e.yml')
    for (const name of ['Deployed exact-head no-model journeys (mobile)', 'Paid release canary (one generation)']) {
      expect(workflow).toContain(`name: ${name}`)
      expect(audit).toContain(name)
    }
    expect(audit).toContain('npx playwright test e2e/generation-deployed-matrix.spec.ts --project=mobile')
    expect(audit).not.toContain('protected `release-e2e` workflow')
  })

  it('is bound to the package and runtime source of this tree, not only to the capture trees', () => {
    // The same digests the capture harness records; a runtime change after the
    // audit makes it stale until the audit is re-derived.
    expect(hashTree(root, ['src/design-system'])).toBe(PACKAGE_HASH)
    const current = hashTree(root, ['index.html', 'src'], (relative) =>
      relative === 'src/design-system' || relative === 'src/test' || relative === 'src/dev' ||
      /\.test\.tsx?$/.test(relative))
    expect(audit, `the audit names the current runtime source hash ${current}`).toContain(`\`${current}\``)
  })

  it('separates local same-source proof from exact deployed proof', () => {
    expect(audit).toContain('## Local same-source proof')
    expect(audit).toContain('## Exact deployed proof')
    const deployed = audit.slice(audit.indexOf('## Exact deployed proof'))
    const section = deployed.slice(0, deployed.indexOf('\n## ', 4))
    // Nothing in this tree exercised a deployed origin; the section may not certify one.
    expect(section).toMatch(/not claimed/i)
    expect(section).not.toMatch(/\|\s*pass\s*\|/i)
  })

  it('never reports a skipped or unexecuted lane as passed', () => {
    for (const line of audit.split('\n')) {
      if (/skipped|not run|unavailable/i.test(line) && /\|/.test(line)) {
        expect(line, line).not.toMatch(/\|\s*pass(ed)?\s*\|/i)
      }
    }
  })

  it('keeps the bounded live lane at one generation per viewport inside the five-attempt phase ledger', () => {
    expect(audit).toMatch(/five[- ]proof[- ]attempt/i)
    expect(audit).toMatch(/one genuine generation per viewport/i)
  })

  it('carries a numbered exception ledger and points to the owner QA path', () => {
    const exceptions = audit.match(/^\| EX-\d{2} \|/gm) ?? []
    expect(exceptions.length).toBeGreaterThan(0)
    expect(audit).toContain(OWNER_QA)
  })
})
