import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { hashTree, type CaptureIdentity, type MotionObservation, type ReachedObservation } from './capture'
import { ACTIVE_CAPTURE_VIEWPORTS, CAPTURE_SKINS, type CaptureSkin, type CaptureViewport } from './state-inventory'

/** Follow-up #469 only. This does not alter or rebind the three historical paired groups. */
export const FORMAT_HISTORICAL_EVIDENCE_DIR = 'docs/design/evidence-0143/task034-format-preview'
export const FORMAT_HISTORICAL_COMMIT = 'eb61b9daf21848c2727eaa6fa2c5e203f4effd7b'
// V3 catalog migration changes the source-list fingerprint; keep old captures intact.
export const FORMAT_PRE_V3_EVIDENCE_DIR = 'docs/design/evidence-0143/task034-format-preview-mobile'
// UI-polish changes runtime source; retain earlier records and collect anew.
export const FORMAT_PRE_UI_POLISH_EVIDENCE_DIR = 'docs/design/evidence-0143/task034-format-preview-mobile-v3-verified'
export const FORMAT_EVIDENCE_DIR = 'docs/design/evidence-0143/task034-format-preview-batch05-task012-ci'
export const FORMAT_EVIDENCE_CONSUMER = 'task034-format-preview-mobile'
export const FORMAT_EVIDENCE_SCOPE = 'mobile-only-2026-10-22'
export const FORMAT_EVIDENCE_SOURCE = 'e2e/design-0143/format-preview.spec.ts'
export const FORMAT_BASELINE_COMMIT = 'c31ef865f60811df076db396a40f90517701380e'
export const FORMAT_ROUTE = '/settings/formats'
export const FORMAT_TITLE = 'Workout formats'
export const FORMAT_STATE = 'expanded-read-only-formats'
export const FORMAT_RECORD_MARKER = 'CLEAR_TASK034_RECORD_AFTER'
/** Ordinary browser reruns still verify the whole journey, without rewriting history. */
export const shouldRecordFormatArtifacts = (marker: string | undefined, status: string | undefined) =>
  marker === '1' && status === 'passed'
export const FORMAT_NOTE = 'Fixed examples of how each format is shown. Nothing here generates or starts a workout, logs a set, or changes your training.'
export const FORMAT_DRIVER_FILES = [
  FORMAT_EVIDENCE_SOURCE, 'e2e/design-0143/format-preview-evidence.ts',
  'e2e/design-0143/capture.ts', 'e2e/design-0143/fixtures.ts',
  'e2e/design-0143/state-inventory.ts', 'e2e/fixtures.ts',
  'e2e/support/authenticated-session.ts', 'e2e/support/backend.ts',
  'playwright.config.ts', 'package.json',
] as const

export const bytesHash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
export const formatDriverHash = (root: string) => hashTree(root, FORMAT_DRIVER_FILES)
export const currentFormatRuntimeHash = (root: string) => hashTree(root, ['index.html', 'src'], (path) =>
  path === 'src/design-system' || path === 'src/test' || path === 'src/dev' || /\.test\.tsx?$/.test(path))

export function formatSourceCheckout(root: string) {
  const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  return { dirty: status.length > 0, statusSha256: bytesHash(status) }
}

/** Existing boot reads use POST RPCs; the SQL for both is stable/read-only. */
export function isPreviewWrite(method: string, pathname: string) {
  // This inert preview has no reason even to preflight/read a model endpoint.
  if (pathname.startsWith('/functions/v1/generate-')) return true
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return false
  if (method === 'POST' && ['/rest/v1/rpc/constraints_in_force', '/rest/v1/rpc/resume_session'].includes(pathname)) return false
  return pathname.startsWith('/rest/v1/') || pathname.startsWith('/functions/v1/')
}

export interface BaselineAbsence {
  kind: 'route-introduced-after-baseline'
  commit: typeof FORMAT_BASELINE_COMMIT
  route: typeof FORMAT_ROUTE
  sources: { path: string; sha256: string }[]
  before: null
}

/** Independently reproducible source absence, not a Not Found picture passed off as BEFORE. */
export function formatBaselineAbsence(root: string): BaselineAbsence {
  const sources = ['src/app/router.tsx', 'e2e/required-routes.ts'].map((path) => {
    const bytes = execFileSync('git', ['show', `${FORMAT_BASELINE_COMMIT}:${path}`], {
      cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    })
    if (bytes.toString('utf8').includes(FORMAT_ROUTE)) throw new Error(`Baseline already names ${FORMAT_ROUTE}: ${path}`)
    return { path, sha256: bytesHash(bytes) }
  })
  return { kind: 'route-introduced-after-baseline', commit: FORMAT_BASELINE_COMMIT, route: FORMAT_ROUTE, sources, before: null }
}

/** CSS-scale full-page PNGs retain the actual pixel height, not an invented viewport-sized image. */
export function pngDimensions(bytes: Uint8Array) {
  const png = Buffer.from(bytes)
  if (png.length < 33 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    png.readUInt32BE(8) !== 13 || png.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Not a PNG with an IHDR')
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  if (width < 1 || height < 1) throw new Error('PNG has no pixels')
  return { width, height }
}

export interface FormatCapture {
  phase: 'after'
  route: typeof FORMAT_ROUTE
  state: typeof FORMAT_STATE
  skin: CaptureSkin
  viewport: CaptureViewport
  before: null
  reached: ReachedObservation
  motion: MotionObservation
  layout: { noHorizontalOverflow: boolean; documentHeight: number; scrollTop: number; scrollLeft: number; headingVisibleAtCapture: boolean }
  screenshot: { name: string; sha256: string; bytes: number; width: number; height: number; explicit: true; fullPage: true; scale: 'css' }
}

export interface FormatEvidenceRecord {
  version: 1
  task: 'TASK-034'
  issue: 469
  consumer: typeof FORMAT_EVIDENCE_CONSUMER
  scope: typeof FORMAT_EVIDENCE_SCOPE
  sourceFile: typeof FORMAT_EVIDENCE_SOURCE
  status: 'passed'
  project: string
  skin: CaptureSkin
  caseTitle: string
  observedAt: string
  captureProcessId: number
  identity: CaptureIdentity
  sourceCheckout: { dirty: boolean; statusSha256: string }
  driverSourceHash: string
  baselineAbsence: BaselineAbsence
  session: { fixture: 'authenticatedSession'; realSession: true; codeRequests: number; verificationRequests: number; generationRequests: number; screens: readonly string[] }
  observations: { settingsEntry: true; settingsBack: true; directEntryBack: true; allDisclosures: true; formatsAndStates: true; accessibility: true; storageUnchanged: true }
  network: { generationRequests: number; blockedGenerations: number; attemptedWrites: number; forwardedWrites: 0 }
  deterministic: true
  liveGeneration: false
  deployedProof: false
  captures: FormatCapture[]
}

export function formatPreviewManifest(records: readonly FormatEvidenceRecord[]) {
  const captures = records.flatMap((record) => record.captures)
  const byViewport = Object.fromEntries(ACTIVE_CAPTURE_VIEWPORTS.map(({ id }) => [id, captures.filter((capture) => capture.viewport.id === id).length]))
  const bySkin = Object.fromEntries(CAPTURE_SKINS.map((skin) => [skin, captures.filter((capture) => capture.skin === skin).length]))
  return {
    version: 1, task: 'TASK-034', issue: 469, consumer: FORMAT_EVIDENCE_CONSUMER, scope: FORMAT_EVIDENCE_SCOPE, phase: 'after',
    status: records.length === 4 && captures.length === 8 ? 'complete' : 'incomplete',
    deterministic: true, liveGeneration: false, deployedProof: false,
    cases: records.map(({ project, skin, caseTitle, status }) => ({ project, skin, caseTitle, status }))
      .sort((a, b) => `${a.project}-${a.skin}`.localeCompare(`${b.project}-${b.skin}`)),
    matrix: { captures: captures.length, withBeforePicture: 0, introducedWithoutBeforePicture: captures.length, byViewport, bySkin },
  }
}

/** Both the offline gate and the real collector use this fail-closed acceptance predicate. */
export function validateFormatPreviewEvidence(
  records: readonly FormatEvidenceRecord[],
  expected: { runtimeHash: string; packageHash: string; driverHash: string; absence: BaselineAbsence; readPng: (name: string) => Uint8Array },
) {
  const require = (condition: boolean, reason: string) => { if (!condition) throw new Error(`Task034 AFTER evidence: ${reason}`) }
  require(records.length === 4, 'all four mobile skin cases must actually pass')
  const caseKeys = new Set<string>()
  const matrix = new Set<string>()
  const pictures = new Set<string>()
  for (const record of records) {
    require(record.version === 1 && record.task === 'TASK-034' && record.issue === 469 &&
      record.consumer === FORMAT_EVIDENCE_CONSUMER && record.scope === FORMAT_EVIDENCE_SCOPE, 'wrong body/task/issue/mobile scope')
    require(record.sourceFile === FORMAT_EVIDENCE_SOURCE && record.status === 'passed', 'wrong driver or failed case')
    require(record.project === 'mobile' && CAPTURE_SKINS.includes(record.skin), 'unexpected project/skin')
    const key = `${record.project}/${record.skin}`
    require(!caseKeys.has(key), 'duplicate project/skin case')
    caseKeys.add(key)
    require(Number.isInteger(record.captureProcessId) && record.captureProcessId > 0 && Number.isFinite(Date.parse(record.observedAt)), 'missing actual capture process/time')
    require(record.identity.packageVersion === '0.14.3' && record.identity.packageHash === expected.packageHash &&
      record.identity.runtimeSourceHash === expected.runtimeHash && /^[a-f0-9]{40}$/.test(record.identity.applicationCommit ?? '') &&
      /^https?:\/\//.test(record.identity.testedDeployment), 'stale or missing source/package/origin identity')
    require(record.driverSourceHash === expected.driverHash, 'stale capture-driver source')
    require(typeof record.sourceCheckout.dirty === 'boolean' && /^[a-f0-9]{64}$/.test(record.sourceCheckout.statusSha256) &&
      (record.sourceCheckout.dirty || record.sourceCheckout.statusSha256 === bytesHash(new Uint8Array())), 'missing truthful checkout status')
    require(JSON.stringify(record.baselineAbsence) === JSON.stringify(expected.absence), 'baseline absence must match actual c31 source')
    require(record.session.fixture === 'authenticatedSession' && record.session.realSession === true &&
      record.session.codeRequests === 1 && record.session.verificationRequests === 1 && record.session.generationRequests === 0 &&
      JSON.stringify(record.session.screens) === JSON.stringify(['Welcome', 'OTP Login', 'Home', 'Generate']), 'not the real authenticated fixture journey')
    require(['settingsEntry', 'settingsBack', 'directEntryBack', 'allDisclosures', 'formatsAndStates', 'accessibility', 'storageUnchanged']
      .every((key) => record.observations[key as keyof typeof record.observations] === true), 'incomplete route/interaction observations')
    require(record.network.generationRequests === 0 && record.network.blockedGenerations === 0 && record.network.attemptedWrites === 0 && record.network.forwardedWrites === 0, 'generation or write attempted')
    require(record.deterministic === true && record.liveGeneration === false && record.deployedProof === false, 'overclaimed proof')
    const ids = ACTIVE_CAPTURE_VIEWPORTS.map(({ id }) => id)
    require(record.captures.length === ids.length, 'missing project viewport capture')
    for (const capture of record.captures) {
      const viewport = ACTIVE_CAPTURE_VIEWPORTS.find(({ id }) => id === capture.viewport.id)
      require(viewport !== undefined && JSON.stringify(capture.viewport) === JSON.stringify(viewport), 'wrong explicit viewport')
      require(capture.skin === record.skin && capture.route === FORMAT_ROUTE && capture.state === FORMAT_STATE && capture.phase === 'after' && capture.before === null, 'invented BEFORE or wrong route/state')
      require(capture.reached.pathname === FORMAT_ROUTE && capture.reached.heading === FORMAT_TITLE && capture.reached.stateVisible === true, 'route/heading/state not reached')
      require(capture.motion.reducedMotion === true && capture.motion.settled === true && capture.motion.running.length === 0, 'unsettled frame')
      require(capture.layout.noHorizontalOverflow === true && Number.isInteger(capture.layout.documentHeight) && capture.layout.documentHeight >= capture.viewport.height, 'overflow or invalid full-page height')
      require(capture.layout.scrollTop === 0 && capture.layout.scrollLeft === 0 && capture.layout.headingVisibleAtCapture === true, 'actual inner-scroller top and visible heading required')
      const cell = `${capture.viewport.id}/${capture.skin}`
      require(!matrix.has(cell), 'duplicate matrix cell')
      matrix.add(cell)
      const shot = capture.screenshot
      require(/^[a-z0-9-]+\.png$/.test(shot.name) && !pictures.has(shot.name), 'unsafe or duplicate PNG filename')
      pictures.add(shot.name)
      const bytes = expected.readPng(shot.name)
      const pixels = pngDimensions(bytes)
      require(bytesHash(bytes) === shot.sha256 && bytes.length === shot.bytes, 'PNG bytes/hash mismatch')
      require(shot.explicit === true && shot.fullPage === true && shot.scale === 'css' && pixels.width === capture.viewport.width &&
        pixels.height === capture.layout.documentHeight && shot.width === pixels.width && shot.height === pixels.height, 'wrong actual PNG dimensions or capture posture')
    }
  }
  require(matrix.size === 8 && ACTIVE_CAPTURE_VIEWPORTS.every(({ id }) => CAPTURE_SKINS.every((skin) => matrix.has(`${id}/${skin}`))), 'incomplete eight-cell phone/short matrix')
}
