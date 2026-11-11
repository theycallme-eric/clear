// TASK-042 (REQ-039; AC-R039-01..03, AC-GAL-01..08): aggregate delivered-source
// evidence closure for the clear-refinement-20261103 body.
//
// Run through the shared guard:
//   node scripts/refinement/run-required-check.mjs --task TASK-042 --check check-01 -- \
//     node --test scripts/refinement/task-042-evidence-closure.test.mjs
//
// This is proof closure, not implementation and not a new visual review. It
// consumes TASK-039's providers and every owner's committed task-local
// receipts; it adds no shared checker and re-runs no earlier check:
//   - the shared checker itself, in final mode, over every delivery task
//     (TASK-039 is setup-only and refused by final mode; TASK-042 is this run);
//   - verifyReceipt for each exact check a criterion or case is closed by;
//   - the staged accepted-gallery reference (coverage map, REUSE.md,
//     LOGGING-FIELDS.md, tokens.css, P01-P05 acceptance), verified byte for
//     byte from the out-of-Git store;
//   - the approved requirements handoff, pinned by sha256 and read from the
//     Runner V2 project layout (the same layout the store resolves through);
//   - the repository's own gallery state list, router, owners and import graph.
// Everything that depends on the store or the handoff fails closed without them.
//
// evidence/refinement/task-042/source-map.json is the committed criterion ->
// journey -> completion owner -> real route -> gallery state -> shared owner ->
// executed case map. The source-map case below re-derives it from the
// authorities and requires it to be identical, so it cannot drift silently.

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { loadBody, projectFromWorktree, readBaseBlobs, verifyReferences } from './lib/references.mjs'
import { MANIFEST_SCHEMA, RECEIPT_SCHEMA, receiptPathFor, verifyReceipt } from './lib/required-check.mjs'
import { parseRecord, verifyDefinitionRecord } from './verify-definition-record.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const BODY = 'clear-refinement-20261103'
const EVIDENCE_ROOT = resolve(repo, 'evidence/refinement')
const MAP_PATH = 'evidence/refinement/task-042/source-map.json'
const SELF = 'TASK-042'
const SETUP_ONLY = 'TASK-039'
const DEFINITION_TASKS = ['TASK-035', 'TASK-037', 'TASK-038']
const HANDOFF_RELATIVE = 'requirements/runs/round-03-gallery-aligned/APPROVED_HANDOFF.json'
const HANDOFF_SHA256 = 'a8e1b591ca85da3f961a21a06dc0ace5fb37520652c8495ec95fb2a3c71c9397'
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const git = (args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim()

// --- source-map derivation (begin) ------------------------------------------
// Pure: no imports, no I/O. Inputs are gathered by loadInputs() below.

const ACCEPTED_COMMIT = 'eded158cfd928d382c9a9409e2c372270312741d'
const GALLERY_ROUTE = '/gallery/refinements'

/** Route paths of src/app/router.tsx (ONBOARDING_ROUTE is '/onboarding') -> the route's own component file. */
const ROUTES = {
  '/': 'src/app/Home.tsx',
  '/onboarding': 'src/app/Onboarding.tsx',
  '/workout': 'src/app/Workout.tsx',
  '/generate': 'src/app/Generate.tsx',
  '/review': 'src/app/ReviewRoute.tsx',
  '/history': 'src/app/History.tsx',
  '/history/:id': 'src/app/SessionDetail.tsx',
  '/summary': 'src/app/Summary.tsx',
}

/** Each accepted state: the real route consumers it draws, and the routes that draw the same consumers. */
const STATE_CONSUMERS = {
  cards: { consumers: ['src/ui/review-block.tsx', 'src/ui/block-renderers.tsx', 'src/ui/refinements/workout-card.tsx', 'src/ui/refinements/movement.tsx'], routes: ['/review', '/workout'] },
  overview: { consumers: ['src/ui/refinements/overview.tsx'], routes: ['/review', '/summary', '/history/:id'] },
  'ladder-4': { consumers: ['src/ui/ladder-block.tsx', 'src/ui/refinements/ladder.tsx'], routes: ['/workout'] },
  'ladder-12': { consumers: ['src/ui/ladder-block.tsx', 'src/ui/refinements/ladder.tsx'], routes: ['/workout'] },
  urgency: { consumers: ['src/ui/refinements/deadline-timer.tsx', 'src/ui/refinements/countdown-warning.ts', 'src/ui/refinements/logging-overlay.tsx'], routes: ['/workout'] },
  amrap: { consumers: ['src/ui/amrap-block.tsx', 'src/ui/refinements/timed-result-dialog.tsx', 'src/ui/refinements/timed-result-log.tsx'], routes: ['/workout'] },
  for_time: { consumers: ['src/ui/for-time-block.tsx', 'src/ui/refinements/timed-result-dialog.tsx', 'src/ui/refinements/timed-result-log.tsx'], routes: ['/workout'] },
  ladder: { consumers: ['src/ui/ladder-block.tsx', 'src/ui/refinements/timed-result-dialog.tsx', 'src/ui/refinements/timed-result-log.tsx'], routes: ['/workout'] },
  'ladder-long': { consumers: ['src/ui/refinements/logging-overlay.tsx', 'src/ui/refinements/timed-result-log.tsx', 'src/ui/ladder-block.tsx'], routes: ['/workout'] },
  emom: { consumers: ['src/ui/emom-block.tsx', 'src/ui/refinements/timed-result-dialog.tsx', 'src/ui/refinements/timed-result-log.tsx'], routes: ['/workout'] },
  preparation: { consumers: ['src/ui/preparation-guide.tsx'], routes: ['/review', '/workout'] },
  screens: { consumers: ['src/app/Generate.tsx', 'src/app/Onboarding.tsx', 'src/app/History.tsx'], routes: ['/generate', '/onboarding', '/history'] },
  errors: { consumers: ['src/ui/view-state.tsx'], routes: ['/summary', '/workout'] },
  // equipment-assets.ts is the gallery's inventory record (no route draws it); the routes' own labels and Setup choices are the consumers.
  assets: { consumers: ['src/ui/refinements/movement.tsx', 'src/state/onboarding.ts'], routes: ['/review', '/workout', '/onboarding'] },
  anchor: { consumers: ['src/ui/standard-block.tsx', 'src/ui/set-logger.tsx', 'src/ui/refinements/logging-overlay.tsx'], routes: ['/workout'] },
  'other-lift': { consumers: ['src/ui/standard-block.tsx', 'src/ui/set-logger.tsx', 'src/ui/refinements/logging-overlay.tsx'], routes: ['/workout'] },
  'timed-movement': { consumers: ['src/ui/standard-block.tsx', 'src/ui/set-logger.tsx', 'src/ui/refinements/logging-overlay.tsx'], routes: ['/workout'] },
  'distance-movement': { consumers: ['src/ui/standard-block.tsx', 'src/ui/set-logger.tsx', 'src/ui/refinements/logging-overlay.tsx'], routes: ['/workout'] },
  'extra-set': { consumers: ['src/ui/standard-block.tsx', 'src/ui/set-logger.tsx', 'src/ui/refinements/logging-overlay.tsx'], routes: ['/workout'] },
  'set-correction': { consumers: ['src/ui/standard-block.tsx', 'src/ui/set-logger.tsx', 'src/ui/refinements/logging-overlay.tsx'], routes: ['/workout'] },
  superset: { consumers: ['src/ui/superset-block.tsx', 'src/ui/set-logger.tsx', 'src/ui/refinements/logging-overlay.tsx'], routes: ['/workout'] },
  'circuit-round': { consumers: ['src/ui/circuit-block.tsx', 'src/ui/refinements/logging-overlay.tsx'], routes: ['/workout'] },
  'circuit-movement': { consumers: ['src/ui/circuit-block.tsx', 'src/ui/set-logger.tsx', 'src/ui/refinements/logging-overlay.tsx'], routes: ['/workout'] },
  'movement-note': { consumers: ['src/ui/exercise-coaching.tsx', 'src/ui/refinements/logging-overlay.tsx'], routes: ['/workout'] },
  'workout-feedback': { consumers: ['src/app/Summary.tsx', 'src/ui/refinements/logging-overlay.tsx'], routes: ['/summary'] },
  'rest-day': { consumers: ['src/app/Home.tsx', 'src/ui/refinements/logging-overlay.tsx'], routes: ['/'] },
}

const SET_MOMENTS = 'JOURNEY-019 set, group and note moments on one /workout phone-390 touch'
const TIMED_MOMENTS = 'JOURNEY-019 the four timed-result families and their clocks on /workout phone-390 touch'
const SUMMARY_HOME_MOMENTS = 'JOURNEY-019 workout feedback on /summary and rest day on Home phone-320'
const ROUTE_CHROME = 'JOURNEY-016 every /workout logging moment phone-390 touch'
const OFF_WORKOUT_CHROME = 'JOURNEY-016 wrapped titles, Workout feedback on /summary and the rest day on Home'
const ref = (task, check, prefix) => ({ task, check, prefix })

/**
 * The 16 named logging contexts (LOGGING-FIELDS.md, FINAL-POLISH-ACCEPTANCE.md):
 * accepted state, the context-owned field and writer source, the route consumer
 * that opens it in the shared LoggingOverlay, and the executed cases.
 */
const LOGGING_CONTEXTS = [
  { state: 'anchor', context: 'Anchor / primary and other lift', fieldOwners: ['src/ui/set-logger.tsx', 'src/ui/set-logging-sheet.tsx'], routeConsumer: 'src/ui/set-logger.tsx', route: '/workout', family: 'TASK-043',
    cases: [ref('TASK-019', 'check-01', SET_MOMENTS), ref('TASK-043', 'check-01', 'JOURNEY-019 anchor and extra set phone-390 touch'), ref('TASK-041', 'check-01', ROUTE_CHROME)] },
  { state: 'other-lift', context: 'Anchor / primary and other lift', fieldOwners: ['src/ui/set-logger.tsx', 'src/ui/set-logging-sheet.tsx'], routeConsumer: 'src/ui/set-logger.tsx', route: '/workout', family: 'TASK-043',
    cases: [ref('TASK-019', 'check-01', SET_MOMENTS), ref('TASK-043', 'check-01', 'JOURNEY-019 other lift, timed and distance movement phone-320'), ref('TASK-041', 'check-01', ROUTE_CHROME)] },
  { state: 'timed-movement', context: 'Timed movement', fieldOwners: ['src/ui/set-logger.tsx', 'src/ui/set-logging-sheet.tsx'], routeConsumer: 'src/ui/set-logger.tsx', route: '/workout', family: 'TASK-043',
    cases: [ref('TASK-019', 'check-01', SET_MOMENTS), ref('TASK-043', 'check-01', 'JOURNEY-019 other lift, timed and distance movement phone-320'), ref('TASK-041', 'check-01', ROUTE_CHROME)] },
  { state: 'distance-movement', context: 'Distance movement', fieldOwners: ['src/ui/set-logger.tsx', 'src/ui/set-logging-sheet.tsx'], routeConsumer: 'src/ui/set-logger.tsx', route: '/workout', family: 'TASK-043',
    cases: [ref('TASK-019', 'check-01', SET_MOMENTS), ref('TASK-043', 'check-01', 'JOURNEY-019 other lift, timed and distance movement phone-320'), ref('TASK-041', 'check-01', ROUTE_CHROME)] },
  { state: 'extra-set', context: 'Extra set', fieldOwners: ['src/ui/set-logger.tsx'], routeConsumer: 'src/ui/set-logger.tsx', route: '/workout', family: 'TASK-043',
    cases: [ref('TASK-019', 'check-01', SET_MOMENTS), ref('TASK-043', 'check-01', 'JOURNEY-019 anchor and extra set phone-390 touch'), ref('TASK-041', 'check-01', ROUTE_CHROME)] },
  { state: 'set-correction', context: 'Saved-set correction', fieldOwners: ['src/ui/set-logger.tsx'], routeConsumer: 'src/ui/set-logger.tsx', route: '/workout', family: 'TASK-043',
    cases: [ref('TASK-019', 'check-01', SET_MOMENTS), ref('TASK-043', 'check-01', 'JOURNEY-019 saved-set correction and retry phone-390 keyboard reduced motion'), ref('TASK-041', 'check-01', ROUTE_CHROME)] },
  { state: 'superset', context: 'Superset round', fieldOwners: ['src/ui/set-logger.tsx', 'src/ui/superset-block.tsx'], routeConsumer: 'src/ui/superset-block.tsx', route: '/workout', family: 'TASK-044',
    cases: [ref('TASK-019', 'check-01', SET_MOMENTS), ref('TASK-044', 'check-01', 'JOURNEY-019 superset round phone-390 touch'), ref('TASK-041', 'check-01', ROUTE_CHROME)] },
  { state: 'circuit-round', context: 'Circuit round / take back', fieldOwners: ['src/ui/circuit-block.tsx'], routeConsumer: 'src/ui/circuit-block.tsx', route: '/workout', family: 'TASK-021',
    cases: [ref('TASK-019', 'check-01', SET_MOMENTS), ref('TASK-021', 'check-02', 'JOURNEY-021 touch phone-390'), ref('TASK-041', 'check-01', ROUTE_CHROME)] },
  { state: 'circuit-movement', context: 'Circuit movement entry', fieldOwners: ['src/ui/circuit-block.tsx', 'src/ui/set-logger.tsx'], routeConsumer: 'src/ui/circuit-block.tsx', route: '/workout', family: 'TASK-044',
    cases: [ref('TASK-019', 'check-01', SET_MOMENTS), ref('TASK-044', 'check-01', 'JOURNEY-019 circuit round, Undo and movement entry phone-320'), ref('TASK-041', 'check-01', ROUTE_CHROME)] },
  { state: 'movement-note', context: 'Movement note', fieldOwners: ['src/ui/exercise-coaching.tsx'], routeConsumer: 'src/ui/exercise-coaching.tsx', route: '/workout', family: 'TASK-045',
    cases: [ref('TASK-019', 'check-01', SET_MOMENTS), ref('TASK-045', 'check-01', 'JOURNEY-019 movement note phone-390 touch'), ref('TASK-041', 'check-01', ROUTE_CHROME)] },
  { state: 'workout-feedback', context: 'Workout feedback', fieldOwners: ['src/app/Summary.tsx'], routeConsumer: 'src/app/Summary.tsx', route: '/summary', family: 'TASK-045',
    cases: [ref('TASK-019', 'check-01', SUMMARY_HOME_MOMENTS), ref('TASK-045', 'check-01', 'JOURNEY-019 workout feedback phone-390 keyboard reduced motion'), ref('TASK-041', 'check-01', OFF_WORKOUT_CHROME)] },
  { state: 'rest-day', context: 'Rest day / reason change', fieldOwners: ['src/app/Home.tsx', 'src/state/rest-days.ts'], routeConsumer: 'src/app/Home.tsx', route: '/', family: 'TASK-045',
    cases: [ref('TASK-019', 'check-01', SUMMARY_HOME_MOMENTS), ref('TASK-045', 'check-01', 'JOURNEY-019 rest day and reason change phone-320 touch'), ref('TASK-041', 'check-01', OFF_WORKOUT_CHROME)] },
  { state: 'emom', context: 'EMOM', fieldOwners: ['src/ui/refinements/timed-result-log.tsx', 'src/ui/emom-block.tsx'], routeConsumer: 'src/ui/emom-block.tsx', route: '/workout', family: 'TASK-046',
    cases: [ref('TASK-019', 'check-01', TIMED_MOMENTS), ref('TASK-046', 'check-01', 'JOURNEY-019 EMOM phone-390 touch'), ref('TASK-041', 'check-01', ROUTE_CHROME)] },
  { state: 'amrap', context: 'AMRAP', fieldOwners: ['src/ui/refinements/timed-result-log.tsx', 'src/ui/amrap-block.tsx'], routeConsumer: 'src/ui/amrap-block.tsx', route: '/workout', family: 'TASK-046',
    cases: [ref('TASK-019', 'check-01', TIMED_MOMENTS), ref('TASK-046', 'check-01', 'JOURNEY-019 AMRAP, For Time and ladder phone-320 keyboard reduced motion'), ref('TASK-041', 'check-01', ROUTE_CHROME)] },
  { state: 'for_time', context: 'For Time', fieldOwners: ['src/ui/refinements/timed-result-log.tsx', 'src/ui/for-time-block.tsx'], routeConsumer: 'src/ui/for-time-block.tsx', route: '/workout', family: 'TASK-046',
    cases: [ref('TASK-019', 'check-01', TIMED_MOMENTS), ref('TASK-046', 'check-01', 'JOURNEY-019 AMRAP, For Time and ladder phone-320 keyboard reduced motion'), ref('TASK-041', 'check-01', ROUTE_CHROME)] },
  { state: 'ladder', context: 'Ladder', fieldOwners: ['src/ui/refinements/timed-result-log.tsx', 'src/ui/ladder-block.tsx'], routeConsumer: 'src/ui/ladder-block.tsx', route: '/workout', family: 'TASK-046',
    cases: [ref('TASK-019', 'check-01', TIMED_MOMENTS), ref('TASK-046', 'check-01', 'JOURNEY-019 AMRAP, For Time and ladder phone-320 keyboard reduced motion'), ref('TASK-041', 'check-01', ROUTE_CHROME)] },
]

/** The context-owned meanings AC-GAL-05 names, each closed by executed cases. */
const FIELD_MEANINGS = [
  { meaning: 'no invented Notes or Performed field: the superset helper paragraph is gone and each moment keeps its own fields', cases: [ref('TASK-017', 'check-01', 'AC-C47-01 AC-R017-03 helper: the superset round no longer draws'), ref('TASK-019', 'check-01', SET_MOMENTS)] },
  { meaning: 'no invented rest-day reason: the reason set is byte-identical to the integration base', cases: [ref('TASK-045', 'check-01', 'JOURNEY-019 rest day and reason change phone-320 touch')], unchangedFromBase: ['src/state/rest-days.ts'] },
  { meaning: 'saved-set correction and clear confirmation keep their identity and Keep set safety', cases: [ref('TASK-043', 'check-01', 'JOURNEY-019 saved-set correction and retry phone-390 keyboard reduced motion'), ref('TASK-030', 'check-02', 'AC-R030-01 consumer rehearsal: a saved set is corrected and cleared')] },
  { meaning: 'optional/null stays distinct from zero', cases: [ref('TASK-030', 'check-02', 'AC-R030-03 proposed per-movement identities derive from the block'), ref('TASK-047', 'check-01', 'JOURNEY-031 backend lane keyboard phone-320 reduced motion')] },
  { meaning: 'categorical effort stays distinct from the session feeling and the legacy numeric scale', cases: [ref('TASK-030', 'check-02', 'AC-R030-02 categorical block effort is never converted'), ref('TASK-045', 'check-01', 'JOURNEY-019 workout feedback phone-390 keyboard reduced motion')] },
  { meaning: 'narrow, long, error, retry, keyboard and reduced-motion states inside the mobile scope', cases: [ref('TASK-019', 'check-01', 'JOURNEY-019 errors and retry by keyboard phone-320 reduced motion'), ref('TASK-041', 'check-01', 'JOURNEY-018 long logs on /workout phone-320')] },
]

/** The four Foundation skins: a real-route case and a logging-state case each. */
const SKIN_CASES = (skin) => [
  ref('TASK-041', 'check-01', `JOURNEY-016 skin ${skin} /workout phone-390`),
  ref('TASK-043', 'check-01', `accepted gallery states ${skin} phone-390`),
  ref('TASK-044', 'check-01', `accepted gallery states ${skin} phone-390`),
  ref('TASK-045', 'check-01', `accepted gallery states ${skin} phone-390`),
  ref('TASK-046', 'check-01', `accepted gallery states ${skin} phone-390`),
]

/** P01-P05 (FINAL-POLISH-ACCEPTANCE.md): the real shared owner and the cases that demonstrate it. */
const POLISH = [
  { id: 'P01', owner: 'src/ui/refinements/logging-overlay.tsx', label: 'lower scroll boundary meets the inner frame',
    cases: [ref('TASK-041', 'check-01', 'JOURNEY-018 long logs on /workout phone-320'), ref('TASK-018', 'check-01', 'AC-C57-01 AC-R018-01 scroll: the scrolling region meets the inner lower border')] },
  { id: 'P02', owner: 'src/ui/refinements/logging-overlay.tsx', label: 'no automatic container outline while meaningful keyboard focus remains',
    cases: [ref('TASK-041', 'check-01', 'JOURNEY-018 keyboard and focus on /workout phone-390 and desktop-1280'), ref('TASK-018', 'check-01', 'AC-C58-01 AC-R018-02 outline: intentional keyboard focus is kept')] },
  { id: 'P03', owner: 'src/ui/refinements/logging-overlay.tsx', label: 'no scrollbar chrome with Notes and Save reachable',
    cases: [ref('TASK-041', 'check-01', 'JOURNEY-018 long logs on /workout phone-320'), ref('TASK-018', 'check-01', 'AC-C59-01 AC-R018-03 scroll: every scrollbar is hidden')] },
  { id: 'P04', owner: 'src/ui/refinements/timed-result-log.tsx', label: 'Undo text aligned with the rounds-completed count',
    cases: [ref('TASK-014', 'check-02', "JOURNEY-014 phone-320 touch: the quiet Undo's text starts"), ref('TASK-014', 'check-02', "JOURNEY-014 phone-390 touch: the quiet Undo's text starts")] },
  { id: 'P05', owner: 'src/ui/refinements/deadline-timer.tsx', label: 'timer and aura on one 1.5-second phase with countdown/deadline eligibility and reduced motion',
    cases: [ref('TASK-008', 'check-02', 'JOURNEY-008 touch phone-390: a running countdown takes the colour at 10'), ref('TASK-008', 'check-02', 'JOURNEY-008 touch phone-390: with the log open and then a native dialog open'),
      ref('TASK-008', 'check-02', 'JOURNEY-008 keyboard phone-390: an EMOM minute and a count-up cap'), ref('TASK-008', 'check-02', 'JOURNEY-008 reduced motion phone-320')] },
]

/** AC-GAL-03's accepted visual targets, each executed on the real route. */
const VISUAL_TARGETS = [
  { target: 'Balanced native dialog', cases: [ref('TASK-041', 'check-01', ROUTE_CHROME), ref('TASK-041', 'check-01', 'JOURNEY-016 skin clear /workout phone-390')] },
  { target: 'X-only aligned header', cases: [ref('TASK-041', 'check-01', OFF_WORKOUT_CHROME)] },
  { target: 'shared label/group/count spacing', cases: [ref('TASK-041', 'check-01', 'JOURNEY-017 rhythm on /review, /workout and the shared logs phone-390')] },
  { target: 'full timer bodies', cases: [ref('TASK-007', 'check-02', 'JOURNEY-007 phone-390: every clock is one whole frame')] },
  { target: 'compact beside-name equipment', cases: [ref('TASK-002', 'check-02', 'JOURNEY-002 phone-390: Review offers Swap under static headers')] },
  { target: 'rep-first four/twelve-rung ladders with companion movements and live check-off', cases: [ref('TASK-012', 'check-02', 'JOURNEY-012 phone-390: Review then Workout state each ladder'), ref('TASK-013', 'check-02', 'JOURNEY-013 phone-390 touch: rounds checked off live')] },
  { target: 'quiet aligned Undo', cases: [ref('TASK-014', 'check-02', "JOURNEY-014 phone-390 touch: the quiet Undo's text starts")] },
  { target: 'recovered synchronized soft urgency vignette', cases: [ref('TASK-008', 'check-02', 'JOURNEY-008 touch phone-390: a running countdown takes the colour at 10'), ref('TASK-033', 'check-01', 'JOURNEY-033 touch phone-390 /workout')] },
]

/** AC-R039-02's evidence kinds, each closed by executed real-route cases. */
const EVIDENCE_KINDS = [
  { kind: 'measured frame geometry', cases: [ref('TASK-041', 'check-01', 'JOURNEY-018 long logs on /workout phone-320'), ref('TASK-007', 'check-02', 'JOURNEY-007 phone-320: every clock is one whole frame')] },
  { kind: 'measured alignment', cases: [ref('TASK-014', 'check-02', "JOURNEY-014 phone-320 touch: the quiet Undo's text starts"), ref('TASK-041', 'check-01', OFF_WORKOUT_CHROME)] },
  { kind: 'measured gaps', cases: [ref('TASK-041', 'check-01', 'JOURNEY-017 rhythm on /review, /workout and the shared logs phone-390')] },
  { kind: 'motion/phase samples for warning criteria', cases: [ref('TASK-008', 'check-02', 'JOURNEY-008 touch phone-390: a running countdown takes the colour at 10'), ref('TASK-033', 'check-01', 'JOURNEY-033 touch phone-390 /workout')] },
  { kind: 'real write/read/reload against the test backend', backendLane: true, cases: [ref('TASK-047', 'check-01', 'JOURNEY-031 backend lane touch phone-390 Signal'), ref('TASK-047', 'check-01', 'JOURNEY-031 backend lane keyboard phone-320 reduced motion'),
    ref('TASK-048', 'check-01', 'JOURNEY-032 backend lane touch phone-390'), ref('TASK-048', 'check-01', 'JOURNEY-032 backend lane keyboard phone-320 reduced motion')] },
  { kind: 'error and retry', cases: [ref('TASK-019', 'check-01', 'JOURNEY-019 errors and retry by keyboard phone-320 reduced motion'), ref('TASK-047', 'check-01', 'JOURNEY-031 backend lane keyboard phone-320 reduced motion')] },
  { kind: 'reduced motion', cases: [ref('TASK-008', 'check-02', 'JOURNEY-008 reduced motion phone-320'), ref('TASK-033', 'check-01', 'JOURNEY-033 reduced motion phone-320')] },
]

function deriveSourceMap(inputs) {
  const { handoff, handoffSha256, coverage, coverageSha256, manifests, specs, repoStates, definitionCommits } = inputs
  const requirements = new Map(coverage.requirements.map((entry) => [entry.id, entry]))
  const checkKey = (task, check) => `${task}/${check}`

  function parseCommand(command) {
    const match = /--task (TASK-\d{3}) --check (\S+)/.exec(command)
    if (match) return { task: match[1], check: match[2] }
    if (/verify-delivery-evidence\.mjs .*--mode baseline/.test(command)) return { task: 'TASK-039', check: 'baseline-mode' }
    return { task: null, check: command }
  }

  function resolveCase({ task, check, prefix }) {
    const manifest = manifests.get(task)
    const declared = manifest?.checks?.[check]
    if (!declared) return { task, check, name: null, prefix }
    const matches = declared.cases.filter((testCase) => testCase.name.split(' > ').slice(1).join(' > ').startsWith(prefix))
    return { task, check, name: matches.length === 1 ? matches[0].name : null, ...(matches.length === 1 ? {} : { prefix, matches: matches.length }) }
  }

  function routesIn(text) {
    const found = new Set()
    for (const match of text.matchAll(/\/[a-z]+(\/:id)?/g)) if (ROUTES[match[0]]) found.add(match[0])
    if (/onboarding|Setup/.test(text)) found.add('/onboarding')
    return [...found].sort()
  }

  function specRoutes(text) {
    return Object.keys(ROUTES)
      .filter((route) => new RegExp(`['"\`]${route.replace(':id', '').replace(/\//g, '\\/')}${route === '/' || route.endsWith('/') || route.includes(':id') ? '' : '[\'"`/?]'}`).test(text))
      .sort()
  }

  const journeyOf = new Map()
  for (const journey of handoff.journeys) for (const id of journey.acceptanceCriterionIds) journeyOf.set(id, journey.id)

  const journeys = handoff.journeys.map((journey) => {
    const verification = parseCommand(journey.verification[0])
    const check = manifests.get(verification.task).checks[verification.check]
    const owner = handoff.tasks.find((task) => task.taskId === journey.integrationOwnerTaskId)
    const states = [...new Set(owner.requirementIds.flatMap((id) => requirements.get(id).states))]
    return {
      id: journey.id,
      title: journey.title,
      completionOwner: journey.integrationOwnerTaskId,
      requirementIds: owner.requirementIds,
      entries: journey.entries.map(({ id, entryState, routeOrScreen, userAction }) => ({ id, entryState, routeOrScreen, userAction })),
      expectedVisibleResult: journey.observableNextState,
      routes: routesIn([journey.destinationRouteOrScreen, ...journey.entries.map((entry) => entry.routeOrScreen)].join(' ')),
      criteria: journey.acceptanceCriterionIds,
      check: { task: verification.task, check: verification.check, runner: check.runner, command: check.command, spec: check.files[0], specRoutes: specRoutes(specs.get(check.files[0])) },
      galleryStates: states,
      galleryUrls: states.map((state) => `${GALLERY_ROUTE}?state=${state}`),
    }
  })

  const criteria = handoff.tasks.flatMap((task) => task.criterionObligations.map((obligation) => {
    const requirement = task.requirementIds.map((id) => requirements.get(id)).find((entry) => entry.acceptanceCriterionIds.includes(obligation.id))
    const journey = journeyOf.get(obligation.id) ?? null
    const owner = journey ? handoff.journeys.find((entry) => entry.id === journey).integrationOwnerTaskId : task.taskId
    return {
      id: obligation.id,
      task: task.taskId,
      requirement: requirement?.id ?? null,
      userFacing: obligation.userFacing,
      journey,
      completionOwner: owner,
      sourceCriterionIds: obligation.sourceCriterionIds,
      checks: obligation.verificationCommands.map((command) => {
        const parsed = parseCommand(command)
        return parsed.task === null ? parsed.check : checkKey(parsed.task, parsed.check)
      }),
      galleryScope: requirement?.galleryScope ?? null,
      galleryStates: requirement?.states ?? [],
      galleryUrls: (requirement?.states ?? []).map((state) => `${GALLERY_ROUTE}?state=${state}`),
      sharedOwners: requirement?.sharedOwners ?? [],
      semanticVariables: requirement?.semanticVariables ?? [],
      visualReferences: (requirement?.repositoryReferences ?? []).filter((path) => /\/references\/(V\d{2}|P\d{2})-/.test(path)),
    }
  }))

  const stateIds = [...new Set(coverage.requirements.flatMap((entry) => entry.states))].sort()
  const galleryStates = stateIds.map((state) => {
    const wanted = new RegExp(`(^|[^a-z0-9_-])${state.replace(/[-_]/g, '[-_ ]')}([^a-z0-9_-]|$)`, 'i')
    const loggingState = LOGGING_CONTEXTS.some((context) => context.state === state)
    const specimenCases = []
    for (const [task, manifest] of manifests) {
      for (const [check, declared] of Object.entries(manifest.checks)) {
        if (declared.purpose === 'setup') continue
        for (const testCase of declared.cases) {
          const leaf = testCase.name.split(' > ').slice(1).join(' > ')
          if (!/gallery/i.test(leaf)) continue
          if (wanted.test(leaf) || (loggingState && /all sixteen logging states/.test(leaf))) specimenCases.push({ task, check, runner: declared.runner, name: testCase.name })
        }
      }
    }
    return {
      id: state,
      url: `${GALLERY_ROUTE}?state=${state}`,
      title: repoStates.get(state) ?? null,
      requirements: coverage.requirements.filter((entry) => entry.states.includes(state)).map((entry) => entry.id),
      consumers: STATE_CONSUMERS[state]?.consumers ?? [],
      routes: STATE_CONSUMERS[state]?.routes ?? [],
      specimenCases,
    }
  })

  const tasks = handoff.tasks.map((task) => {
    const cited = /Accepted gallery reference: ([0-9a-f]{40})/.exec(task.prompt)?.[1] ?? null
    const states = [...new Set([...task.prompt.matchAll(/\/gallery\/refinements\?state=([a-z0-9_-]+)/g)].map((match) => match[1]))]
    return {
      task: task.taskId,
      issue: task.issueNumber,
      requirementIds: task.requirementIds,
      journeyRole: task.journeyRole,
      ownedJourneyIds: task.ownedJourneyIds,
      citedGalleryCommit: cited,
      galleryStates: states,
      disposition: task.requirementIds.every((id) => requirements.get(id).galleryScope === 'explicit non-gallery disposition') ? 'explicit non-gallery disposition' : 'gallery',
    }
  })

  const resolveAll = (cases) => cases.map(resolveCase)
  return {
    schema: 'clear-refinement-task-042-source-map/v1',
    task: 'TASK-042',
    body: 'clear-refinement-20261103',
    authorities: {
      approvedHandoff: { location: '<project>/requirements/runs/round-03-gallery-aligned/APPROVED_HANDOFF.json', sha256: handoffSha256, handoffSha256: handoff.handoffSha256, requirementsSet: handoff.requirementsSetId, approvedBy: handoff.approvedBy },
      acceptedGallery: { commit: ACCEPTED_COMMIT, reference: 'accepted-gallery', stateMap: { path: 'src/dev/gallery-refinement-coverage.json', sha256: coverageSha256 }, revision: coverage.revision, galleryReferenceVersion: coverage.galleryReferenceVersion },
      galleryRoute: GALLERY_ROUTE,
    },
    routes: ROUTES,
    journeys,
    criteria,
    galleryStates,
    loggingContexts: LOGGING_CONTEXTS.map(({ cases, ...context }) => ({ ...context, url: `${GALLERY_ROUTE}?state=${context.state}`, cases: resolveAll(cases) })),
    fieldMeanings: FIELD_MEANINGS.map(({ cases, ...meaning }) => ({ ...meaning, cases: resolveAll(cases) })),
    skins: ['clear', 'vapour', 'signal', 'mono'].map((skin) => ({ skin, cases: resolveAll(SKIN_CASES(skin)) })),
    polish: POLISH.map(({ cases, ...item }) => ({ ...item, cases: resolveAll(cases) })),
    visualTargets: VISUAL_TARGETS.map(({ cases, ...item }) => ({ ...item, cases: resolveAll(cases) })),
    evidenceKinds: EVIDENCE_KINDS.map(({ cases, ...item }) => ({ ...item, cases: resolveAll(cases) })),
    definitionRecords: Object.entries(definitionCommits).map(([task, commit]) => ({ task, record: `docs/definitions/clear-refinement-20261103/${task}.md`, deliveredCommit: commit, receipt: `evidence/refinement/${task.toLowerCase()}/results/check-01.json` })),
    tasks,
  }
}

// --- source-map derivation (end) --------------------------------------------

// ---------------------------------------------------------------- inputs

let cached = null
/** Every authority the closure reads, each verified before use; fails closed. */
function loadInputs() {
  if (cached) return cached
  const top = git(['rev-parse', '--show-toplevel'])
  const project = projectFromWorktree(resolve(top))
  assert.ok(project, `the approved handoff resolves only through the Runner V2 layout <project>/runner-v2/<body>/worktrees/<task>; ${top} is not in it`)
  const handoffPath = join(project, HANDOFF_RELATIVE)
  assert.ok(existsSync(handoffPath), `the approved handoff is absent: expected ${handoffPath}`)
  const handoffBytes = readFileSync(handoffPath)
  assert.equal(sha256(handoffBytes), HANDOFF_SHA256, 'the approved handoff must be the pinned, owner-approved revision')
  const handoff = JSON.parse(handoffBytes.toString('utf8'))

  const { record } = loadBody({ evidenceRoot: EVIDENCE_ROOT, body: BODY })
  assert.ok(record, 'the body record must load')
  const references = verifyReferences({ cwd: repo, evidenceRoot: EVIDENCE_ROOT, body: BODY, only: 'accepted-gallery' })
  assert.deepEqual(references.problems, [], 'the accepted-gallery reference must verify byte for byte')
  const gallery = references.references[0].result.files
  const coverageFile = gallery.get('src/dev/gallery-refinement-coverage.json')
  assert.ok(coverageFile, 'the accepted coverage map is a verified reference file')
  const coverage = JSON.parse(coverageFile.bytes.toString('utf8'))

  const manifests = new Map()
  for (const name of readdirSync(EVIDENCE_ROOT).filter((entry) => /^task-\d{3}$/.test(entry)).sort()) {
    const task = name.toUpperCase()
    if (task === SELF) continue
    manifests.set(task, JSON.parse(readFileSync(join(EVIDENCE_ROOT, name, 'required-cases.json'), 'utf8')))
  }
  const specs = new Map()
  for (const manifest of manifests.values()) {
    for (const check of Object.values(manifest.checks)) for (const file of check.files) specs.set(file, readFileSync(resolve(repo, file), 'utf8'))
  }
  const statesSource = readFileSync(resolve(repo, 'src/dev/gallery-refinements.tsx'), 'utf8')
  const repoStates = new Map([...statesSource.matchAll(/\{ id: '([a-z0-9_-]+)', title: '([^']+)', Render: (\w+) \}/g)].map((match) => [match[1], match[2]]))
  const repoRenders = new Map([...statesSource.matchAll(/\{ id: '([a-z0-9_-]+)', title: '[^']+', Render: (\w+) \}/g)].map((match) => [match[1], match[2]]))
  const definitionCommits = Object.fromEntries(DEFINITION_TASKS.map((task) => [task, git(['log', '-1', '--format=%H', '--', `docs/definitions/${BODY}/${task}.md`])]))

  cached = {
    project, handoff, handoffSha256: sha256(handoffBytes), record, gallery, coverage, coverageSha256: coverageFile.sha256 ?? sha256(coverageFile.bytes),
    manifests, specs, statesSource, repoStates, repoRenders, definitionCommits,
  }
  return cached
}

function sourceMap() {
  return JSON.parse(readFileSync(resolve(repo, MAP_PATH), 'utf8'))
}

/** The current-receipt verdict of one declared check (TASK-039's verifyReceipt). */
function receiptProblems(task, check) {
  const { manifests } = loadInputs()
  const declared = manifests.get(task)?.checks?.[check]
  if (!declared) return [`${task} declares no check ${check}`]
  return verifyReceipt({ cwd: repo, evidenceRoot: EVIDENCE_ROOT, task, checkId: check, check: declared, manifestPath: join(EVIDENCE_ROOT, task.toLowerCase(), 'required-cases.json') })
}

function readReceipt(task, check) {
  return JSON.parse(readFileSync(receiptPathFor(EVIDENCE_ROOT, task, check), 'utf8'))
}

/** A resolved case reference must name one declared required case that passed in a current receipt. */
function assertCasePassed(resolved, label) {
  assert.ok(resolved.name, `${label}: ${resolved.task} ${resolved.check} "${resolved.prefix}" must name exactly one declared case (found ${resolved.matches ?? 0})`)
  assert.deepEqual(receiptProblems(resolved.task, resolved.check), [], `${label}: ${resolved.task} ${resolved.check} needs a current passing receipt`)
  const receipt = readReceipt(resolved.task, resolved.check)
  const recorded = receipt.requiredCases.find((testCase) => testCase.name === resolved.name)
  assert.equal(recorded?.status, 'passed', `${label}: "${resolved.name}" passed in the receipt`)
  return receipt
}

// ---------------------------------------------------------------- import graph

const IMPORT = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g
const depsCache = new Map()
function deps(file) {
  if (depsCache.has(file)) return depsCache.get(file)
  const out = []
  if (/\.(tsx?|jsx?|mjs)$/.test(file)) {
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const match of text.matchAll(IMPORT)) {
      const spec = match[1] ?? match[2]
      if (!spec.startsWith('.')) continue
      const base = resolve(dirname(file), spec)
      const found = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, join(base, 'index.ts'), join(base, 'index.tsx'), join(base, 'index.js')]
        .find((candidate) => existsSync(candidate) && statSync(candidate).isFile())
      if (found) out.push(found)
    }
  }
  depsCache.set(file, out)
  return out
}
const graphCache = new Map()
/** Repository-relative files a module reaches through static and dynamic relative imports. */
function reach(root) {
  if (graphCache.has(root)) return graphCache.get(root)
  const seen = new Set()
  const stack = [resolve(repo, root)]
  while (stack.length) {
    const file = stack.pop()
    if (seen.has(file)) continue
    seen.add(file)
    stack.push(...deps(file))
  }
  const files = new Set([...seen].map((file) => relative(repo, file).split('\\').join('/')))
  graphCache.set(root, files)
  return files
}

/** The module that defines a gallery state's Render component. */
function stateModule(state) {
  const { repoRenders, statesSource } = loadInputs()
  const render = repoRenders.get(state)
  assert.ok(render, `state ${state} is in REFINEMENT_STATES`)
  const imported = [...statesSource.matchAll(/import \{([^}]+)\} from '(\.\/[^']+)'/g)]
    .find((match) => match[1].split(',').map((name) => name.trim()).includes(render))
  return imported ? `src/dev/${imported[2].slice(2)}.tsx` : 'src/dev/gallery-refinements.tsx'
}

/** Split a command line on spaces, honouring double quotes (the manifests' only quoting). */
function shellWords(command) {
  return [...command.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2])
}

function deliveryTasks() {
  return [...loadInputs().manifests.keys()].filter((task) => task !== SETUP_ONLY)
}

function runFinalChecker(tasks) {
  const run = spawnSync(process.execPath, [
    'scripts/refinement/verify-delivery-evidence.mjs', '--body', BODY, '--mode', 'final', '--tasks', tasks.join(','), '--json',
  ], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return { status: run.status, report: JSON.parse(run.stdout), stderr: run.stderr }
}

// ---------------------------------------------------------------- cases

describe('TASK-042 aggregate delivered-source evidence closure', () => {
  test('AC-R039-01 the shared checker in final mode accepts every delivery task over the integration base, Foundation 0.14.3 and every staged reference, and refuses the setup-only TASK-039', () => {
    const { handoff } = loadInputs()
    const approved = handoff.tasks.map((task) => task.taskId).filter((task) => task !== SELF).sort()
    assert.deepEqual([...loadInputs().manifests.keys()], approved, 'every approved task except this one has its own required-case manifest')
    const tasks = deliveryTasks()
    assert.equal(tasks.length, 45)
    const { status, report } = runFinalChecker(tasks)
    assert.deepEqual(report.problems, [], 'final mode reports no problem')
    assert.equal(report.ok, true)
    assert.equal(status, 0)
    assert.deepEqual(report.tasks.map(({ task, ok }) => [task, ok]), tasks.map((task) => [task, true]))
    assert.ok(report.tasks.every(({ deliveryChecks }) => deliveryChecks >= 1))
    assert.equal(report.baseline.integrationBase, loadInputs().record.integrationBase.commit)
    assert.equal(report.baseline.foundation.version, '0.14.3')
    assert.equal(report.baseline.foundation.unchangedFromBase, true)
    assert.equal(report.acceptedGallery.commit, 'eded158cfd928d382c9a9409e2c372270312741d')
    assert.deepEqual(report.references.map(({ id }) => id).sort(), ['accepted-gallery', 'historical-comparisons', 'phosphor-echo'])
    assert.equal(report.objectStore.available, true)

    const setup = runFinalChecker([SETUP_ONLY])
    assert.equal(setup.status, 1, 'final mode refuses a setup-only task as delivery')
    assert.ok(setup.report.problems.some((problem) => problem.includes('declares only setup checks')))
  })

  test('AC-R039-01 every approved journey keeps its entry, expected result and one completion owner whose approved journey check is a current real-route Playwright receipt', () => {
    const { handoff, manifests, specs } = loadInputs()
    const map = sourceMap()
    assert.equal(handoff.journeys.length, 32)
    const owners = new Map()
    for (const journey of handoff.journeys) {
      assert.ok(journey.entries.length >= 1, `${journey.id} has an entry`)
      for (const entry of journey.entries) {
        for (const field of ['entryState', 'userAction']) assert.ok(entry[field]?.length > 10, `${journey.id} ${entry.id} keeps its ${field}`)
        assert.ok(entry.routeOrScreen?.length > 0, `${journey.id} ${entry.id} keeps its route or screen`)
      }
      assert.ok(journey.observableNextState.length > 20, `${journey.id} keeps its expected visible result`)
      const owner = handoff.tasks.find((task) => task.taskId === journey.integrationOwnerTaskId)
      assert.equal(owner.journeyRole, 'completion-owner', `${journey.id}'s owner is a completion owner`)
      assert.ok(owner.ownedJourneyIds.includes(journey.id))
      assert.equal(handoff.tasks.filter((task) => task.ownedJourneyIds.includes(journey.id)).length, 1, `${journey.id} has exactly one completion owner`)
      owners.set(journey.id, owner.taskId)
      assert.equal(journey.verification.length, 1)
      const [, task, checkId] = /--task (TASK-\d{3}) --check (\S+)/.exec(journey.verification[0])
      assert.equal(task, owner.taskId, `${journey.id} is verified by its owner's own check`)
      const check = manifests.get(task).checks[checkId]
      assert.equal(check.command, journey.verification[0], `${journey.id}: the manifest command is the approved verification command`)
      assert.notEqual(check.purpose, 'setup')
      assert.equal(check.runner, 'playwright', `${journey.id} closes in a real browser, not by a gallery component or a broad build`)
      assert.ok(check.criteria.includes(journey.id))
      for (const id of journey.acceptanceCriterionIds) assert.ok(check.criteria.includes(id), `${journey.id}'s check declares ${id}`)
      assert.ok(check.cases.some((testCase) => testCase.criterion === journey.id || testCase.name.includes(journey.id)), `${journey.id} has a journey case`)
      assert.deepEqual(receiptProblems(task, checkId), [], `${journey.id}: ${task} ${checkId} receipt is current and passing`)
      const spec = specs.get(check.files[0])
      const mapped = map.journeys.find((entry) => entry.id === journey.id)
      assert.ok(mapped.check.specRoutes.length >= 1, `${journey.id}: ${check.files[0]} drives a real application route`)
      for (const route of mapped.routes) assert.ok(mapped.check.specRoutes.includes(route) || route === '/onboarding', `${journey.id}: the spec visits ${route}`)
      assert.ok(spec.length > 0)
    }
    assert.deepEqual([...new Set(owners.values())].sort(), handoff.tasks.filter((task) => task.journeyRole === 'completion-owner').map((task) => task.taskId).sort())
  })

  test('AC-R039-01 every user-facing criterion maps to one journey and one completion owner, and every approved verification of every criterion has a current passing receipt', () => {
    const { handoff, coverage, manifests } = loadInputs()
    const userFacing = handoff.tasks.flatMap((task) => task.criterionObligations.filter((obligation) => obligation.userFacing).map((obligation) => ({ task, obligation })))
    assert.equal(userFacing.length, 141)
    const covered = new Set(coverage.requirements.flatMap((entry) => entry.userFacingAcceptanceCriterionIds))
    for (const { task, obligation } of userFacing) {
      assert.ok(covered.has(obligation.id), `${obligation.id} is user-facing in the accepted coverage map`)
      assert.equal(obligation.journeyIds.length, 1, `${obligation.id} belongs to exactly one journey`)
      const journeys = handoff.journeys.filter((journey) => journey.acceptanceCriterionIds.includes(obligation.id))
      assert.equal(journeys.length, 1)
      assert.equal(journeys[0].id, obligation.journeyIds[0])
      assert.equal(journeys[0].integrationOwnerTaskId, task.taskId, `${obligation.id}'s obligation sits with its journey's completion owner`)
    }
    let verified = 0
    for (const task of handoff.tasks) {
      if (task.taskId === SELF) continue
      for (const obligation of task.criterionObligations) {
        const declaredBy = []
        for (const command of obligation.verificationCommands) {
          if (task.taskId === SETUP_ONLY && /verify-delivery-evidence\.mjs --body clear-refinement-20261103 --mode baseline --require-current-source$/.test(command)) {
            continue // baseline mode: the final-mode case runs it over the delivered tree
          }
          const [, owner, checkId] = /--task (TASK-\d{3}) --check (\S+)/.exec(command)
          const check = manifests.get(owner).checks[checkId]
          assert.equal(check?.command, command, `${obligation.id}: ${owner} ${checkId} runs the approved command`)
          if (owner === SETUP_ONLY) assert.equal(check.purpose, 'setup', `${obligation.id}: TASK-039's own self-tests are setup evidence only`)
          assert.deepEqual(receiptProblems(owner, checkId), [], `${obligation.id}: ${owner} ${checkId} is current and passing`)
          if (check.criteria.includes(obligation.id)) declaredBy.push(checkId)
          verified += 1
        }
        if (task.taskId !== SETUP_ONLY) assert.ok(declaredBy.length >= 1, `${obligation.id} is declared by at least one of its approved checks`)
      }
    }
    assert.ok(verified >= 190)
  })

  test('AC-R039-01 the committed source map is exactly the derivation from the approved handoff, the accepted coverage map, the task manifests and the repository gallery', () => {
    const inputs = loadInputs()
    const derived = deriveSourceMap(inputs)
    assert.deepEqual(sourceMap(), JSON.parse(JSON.stringify(derived)))
    assert.equal(derived.authorities.approvedHandoff.requirementsSet, inputs.record.requirementsSet, 'the handoff is this body\'s requirements set')
    for (const section of ['loggingContexts', 'fieldMeanings', 'skins', 'polish', 'visualTargets', 'evidenceKinds']) {
      for (const item of derived[section]) for (const resolved of item.cases) assert.ok(resolved.name, `${section}: "${resolved.prefix}" in ${resolved.task} ${resolved.check} names exactly one case`)
    }
  })

  test('AC-R039-01 the definition records TASK-035, TASK-037 and TASK-038 close by their current receipts and verify at their delivered commits', () => {
    const { definitionCommits, record } = loadInputs()
    const head = git(['rev-parse', 'HEAD'])
    for (const task of DEFINITION_TASKS) {
      assert.deepEqual(receiptProblems(task, 'check-01'), [], `${task} check-01 receipt is current and passing`)
      const path = `docs/definitions/${BODY}/${task}.md`
      const commit = definitionCommits[task]
      assert.match(commit, /^[0-9a-f]{40}$/)
      assert.equal(spawnSync('git', ['merge-base', '--is-ancestor', commit, head], { cwd: repo }).status, 0, `${task}'s delivered commit is in the delivered history`)
      assert.equal(git(['rev-parse', `${commit}:${path}`]), git(['rev-parse', `HEAD:${path}`]), `${task}'s record is unchanged since its delivered commit`)
      // The shared checker on today's tree: structure, base: and ref: sources all hold;
      // only repo: sources edited by later approved tasks may differ.
      const today = verifyDefinitionRecord({ cwd: repo, task, record: path })
      const other = today.problems.filter((problem) => !/^source hash mismatch: repo:/.test(problem))
      assert.deepEqual(other, [], `${task}: nothing but later-edited repo: sources differs today`)
      // Every repo: source verifies byte for byte at the record's own delivered commit.
      const { sections } = parseRecord(readFileSync(resolve(repo, path), 'utf8'))
      const sources = (sections.get('Sources') ?? []).map((line) => /^[-*]\s+`repo:([^`]+)`\s+sha256\s+`([0-9a-f]{64})`/.exec(line)).filter(Boolean)
      const blobs = readBaseBlobs(repo, commit, sources.map(([, file]) => file))
      for (const [, file, expected] of sources) {
        assert.ok(blobs.get(file), `${task}: repo:${file} exists at ${commit.slice(0, 7)}`)
        assert.equal(sha256(blobs.get(file)), expected, `${task}: repo:${file} verifies at its delivered commit`)
      }
      assert.ok(today.sources.length > sources.length || sources.length > 0)
    }
    assert.equal(record.body, BODY)
  })

  test('AC-R039-02 visual, geometry and motion evidence binds the code revision and artifact hashes: committed receipts at HEAD over HEAD blobs, the installed runners, and hash-pinned before references', () => {
    const { manifests, gallery, coverage } = loadInputs()
    const installed = {
      vitest: JSON.parse(readFileSync(resolve(repo, 'node_modules/vitest/package.json'), 'utf8')).version,
      playwright: JSON.parse(readFileSync(resolve(repo, 'node_modules/@playwright/test/package.json'), 'utf8')).version,
      'node-test': null,
    }
    const dirty = git(['status', '--porcelain', '--', 'evidence/refinement']).split('\n').filter(Boolean)
      .filter((line) => !line.slice(3).startsWith('evidence/refinement/task-042/'))
    assert.deepEqual(dirty, [], 'every other task\'s manifest and receipt is committed unchanged at HEAD')
    let playwrightChecks = 0
    for (const [task, manifest] of manifests) {
      for (const [checkId, check] of Object.entries(manifest.checks)) {
        const path = relative(repo, receiptPathFor(EVIDENCE_ROOT, task, checkId)).split('\\').join('/')
        assert.ok(git(['ls-files', '--', path]), `${path} is tracked`)
        const receipt = readReceipt(task, checkId)
        assert.equal(receipt.schema, RECEIPT_SCHEMA)
        assert.equal(receipt.runnerVersion, installed[check.runner], `${task} ${checkId} ran on the installed ${check.runner}`)
        assert.deepEqual(['node', 'scripts/refinement/run-required-check.mjs', '--task', task, '--check', checkId, '--', ...receipt.command], shellWords(check.command), `${task} ${checkId}: the receipt records the approved command`)
        assert.equal(receipt.manifest.sha256, sha256(execFileSync('git', ['show', `HEAD:${receipt.manifest.path}`], { cwd: repo, maxBuffer: 64 * 1024 * 1024 })))
        for (const target of receipt.targets) {
          assert.equal(target.sha256, sha256(execFileSync('git', ['show', `HEAD:${target.path}`], { cwd: repo, maxBuffer: 64 * 1024 * 1024 })), `${task} ${checkId}: ${target.path} hash is the delivered revision's blob`)
        }
        if (check.runner === 'playwright') playwrightChecks += 1
      }
    }
    assert.ok(playwrightChecks >= 30)
    // The visual specs attach their delivered-revision captures and measurements to the guard run.
    for (const spec of ['e2e/refinement/task-041.spec.ts', 'e2e/refinement/task-008.spec.ts']) {
      const text = readFileSync(resolve(repo, spec), 'utf8')
      assert.match(text, /contentType: 'image\/png'/, `${spec} captures images`)
      assert.match(text, /contentType: 'application\/json'/, `${spec} records its measurements`)
    }
    // Owner decision 2026-11-09: no image binaries are committed; before references are hash-pinned objects.
    const binaries = git(['ls-files', '--', 'evidence/refinement']).split('\n').filter((file) => /\.(png|jpe?g|webp|gif|webm|mp4|zip)$/i.test(file))
    assert.deepEqual(binaries, [])
    const before = new Set()
    for (const entry of coverage.requirements) for (const path of entry.repositoryReferences) if (/\/references\/(V\d{2}|P\d{2})-/.test(path)) before.add(path)
    assert.ok(before.size >= 15)
    for (const path of before) assert.ok(gallery.get(path), `${path} is a hash-verified accepted reference object`)
  })

  test('AC-R039-02 measured geometry, phase samples, real write/read/reload and error, retry and reduced-motion cases are executed in current receipts; backend-lane receipts are consumed, not re-run', () => {
    const map = sourceMap()
    assert.equal(map.evidenceKinds.length, EVIDENCE_KINDS.length)
    for (const kind of map.evidenceKinds) {
      for (const resolved of kind.cases) {
        const receipt = assertCasePassed(resolved, kind.kind)
        assert.equal(loadInputs().manifests.get(resolved.task).checks[resolved.check].runner, 'playwright', `${kind.kind} is measured in a real browser`)
        if (kind.backendLane) {
          assert.match(resolved.name, /backend lane/, 'a backend-lane case, not the synthetic twin')
          assert.equal(receipt.totals.skipped, 0, `${resolved.task}: no backend-lane case was skipped`)
          assert.equal(receipt.totals.executed, receipt.totals.total)
        }
      }
    }
    const phase = readFileSync(resolve(repo, 'e2e/refinement/task-008.spec.ts'), 'utf8')
    assert.match(phase, /phase-samples/, 'phase samples are recorded')
  })

  test('AC-R039-03 the gallery and the routes consume the same shared implementations; no route reaches gallery or test code; every receipt and manifest is TASK-039\'s rehearsed format', () => {
    const { manifests } = loadInputs()
    for (const [route, file] of Object.entries(ROUTES)) {
      const reached = [...reach(file)]
      assert.deepEqual(reached.filter((path) => path.startsWith('src/dev/') || path.startsWith('src/test/') || /\.test\./.test(path)), [], `${route} (${file}) reaches no gallery, fixture or test module`)
    }
    const router = readFileSync(resolve(repo, 'src/app/router.tsx'), 'utf8')
    for (const [route, file] of Object.entries(ROUTES)) {
      const component = file.split('/').pop().replace('.tsx', '')
      assert.match(router, new RegExp(`import \\{[^}]*\\b${component}\\b[^}]*\\} from '\\./${component}'`), `router imports ${component}`)
      if (route !== '/onboarding') assert.match(router, new RegExp(`path: '${route.replace(/\//g, '\\/')}'`), `router declares ${route}`)
    }
    for (const [state, { consumers, routes }] of Object.entries(STATE_CONSUMERS)) {
      const galleryGraph = reach(stateModule(state))
      for (const consumer of consumers) {
        assert.ok(galleryGraph.has(consumer), `gallery state ${state} draws ${consumer}`)
        assert.ok(routes.some((route) => reach(ROUTES[route]).has(consumer)), `a route of ${state} (${routes.join(', ')}) draws the same ${consumer}`)
      }
    }
    for (const [task, manifest] of manifests) {
      assert.equal(manifest.schema, MANIFEST_SCHEMA, `${task} manifest format`)
      for (const checkId of Object.keys(manifest.checks)) assert.equal(readReceipt(task, checkId).schema, RECEIPT_SCHEMA, `${task} ${checkId} receipt format`)
    }
    // Fixture receipts are TASK-039's self-test inputs and never count as delivery evidence.
    // The only other file is this task's source map: a traceability record checked by the
    // source-map case, not a proof format (every proof it cites is a provider receipt).
    const files = new Set([...git(['ls-files', '--', 'evidence/refinement']).split('\n'), ...git(['ls-files', '--others', '--exclude-standard', '--', 'evidence/refinement']).split('\n')].filter(Boolean))
    assert.ok(files.has(MAP_PATH))
    for (const file of files) {
      assert.match(file, /^evidence\/refinement\/(README\.md|clear-refinement-20261103\/(BODY\.json|references\/[a-z-]+\/REFERENCE\.json)|task-\d{3}\/(required-cases\.json|results\/[a-z0-9-]+\.json)|task-042\/source-map\.json)$/, `${file} is one of the provider's formats or this task's source map`)
    }
  })

  test('AC-GAL-01 every accepted user-visible refinement records its requirement and criteria, shared owner, actual route, canonical gallery URL and named state; the route-only exception names its state and real-route evidence', () => {
    const { coverage, repoStates, handoff } = loadInputs()
    const map = sourceMap()
    const routes = new Set(Object.keys(ROUTES))
    const galleryRoute = readFileSync(resolve(repo, 'src/dev/GalleryRoute.tsx'), 'utf8')
    assert.match(galleryRoute, /<Route path="refinements" element={<GalleryRefinements \/>} \/>/, 'the canonical gallery URL is served')
    for (const criterion of map.criteria.filter((entry) => entry.userFacing)) {
      assert.ok(criterion.requirement, `${criterion.id} names its requirement`)
      assert.ok(criterion.journey && criterion.completionOwner, `${criterion.id} names its journey and completion owner`)
      const journey = map.journeys.find((entry) => entry.id === criterion.journey)
      assert.ok(journey.routes.length >= 1 || journey.check.specRoutes.length >= 1, `${criterion.id} names an actual route`)
      for (const route of [...journey.routes, ...journey.check.specRoutes]) assert.ok(routes.has(route))
      if (criterion.galleryScope === 'explicit non-gallery disposition') {
        // Route-only: the state is the journey's entry state, closed by real-route cases.
        assert.equal(criterion.requirement, 'REQ-031')
        assert.ok(journey.entries[0].entryState.length > 10)
        assert.match(journey.check.command, /task-047\.spec\.ts/)
        continue
      }
      assert.ok(criterion.galleryStates.length >= 1, `${criterion.id} names a gallery state`)
      assert.ok(criterion.sharedOwners.length >= 1, `${criterion.id} names a shared owner`)
      for (const state of criterion.galleryStates) {
        assert.ok(repoStates.has(state), `${criterion.id}: ${state} is a stable state of the repository gallery`)
        assert.ok(criterion.galleryUrls.includes(`/gallery/refinements?state=${state}`))
      }
      for (const owner of criterion.sharedOwners) {
        const [file, symbol] = owner.split('#')
        assert.ok(existsSync(resolve(repo, file)), `${criterion.id}: owner ${file} exists`)
        if (symbol) assert.match(readFileSync(resolve(repo, file), 'utf8'), new RegExp(`export (function|const) ${symbol}\\b`), `${criterion.id}: ${owner} is exported`)
      }
    }
    const nonGalleryUserFacing = coverage.requirements.filter((entry) => entry.galleryScope === 'explicit non-gallery disposition' && entry.userFacingAcceptanceCriterionIds.length)
    assert.deepEqual(nonGalleryUserFacing.map((entry) => entry.id), ['REQ-031'], 'the only user-facing non-gallery requirement is REQ-031')
    const owner = handoff.tasks.find((task) => task.taskId === 'TASK-047')
    assert.deepEqual(owner.ownedJourneyIds, ['JOURNEY-031'])
  })

  test('AC-GAL-02 routes and gallery states consume the accepted shared owners and the one semantic variable file; Foundation 0.14.3 is unchanged; no route CSS, renderer or dialog duplicates them', () => {
    const { gallery, coverage, record } = loadInputs()
    const declarations = (text) => {
      const found = new Map()
      for (const match of text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) found.set(match[1], [...(found.get(match[1]) ?? []), match[2].trim().replace(/\s+/g, ' ')])
      return found
    }
    const accepted = declarations(gallery.get('src/ui/refinements/tokens.css').bytes.toString('utf8'))
    const current = declarations(readFileSync(resolve(repo, 'src/ui/refinements/tokens.css'), 'utf8'))
    assert.equal(accepted.size, 16)
    for (const [name, values] of accepted) assert.deepEqual(current.get(name), values, `${name} keeps its accepted value in tokens.css`)
    for (const name of coverage.requirements.flatMap((entry) => entry.semanticVariables)) assert.ok(current.has(name), `${name} is declared in tokens.css`)
    // No other shipped source redeclares a refinement variable or restates the accepted warning numbers.
    const shipped = git(['ls-files', '--', 'src']).split('\n')
      .filter((file) => /\.(css|tsx?|jsx?)$/.test(file) && !/\.test\.|^src\/test\/|^src\/design-system\/|^src\/dev\//.test(file) && file !== 'src/ui/refinements/tokens.css')
    for (const file of shipped) {
      const text = readFileSync(resolve(repo, file), 'utf8')
      for (const name of accepted.keys()) assert.doesNotMatch(text, new RegExp(`${name}\\s*:`), `${file} must not redeclare ${name}`)
    }
    // The only new dialog renderer since the integration base is the shared LoggingOverlay.
    const base = record.integrationBase.commit
    const dialogs = (ref) => git(['grep', '-l', '-E', '<dialog|showModal\\(\\)', ref, '--', 'src/*.tsx', 'src/*.ts']).split('\n')
      .map((line) => line.replace(`${ref}:`, '')).filter((file) => file && !/\.test\.|^src\/test\/|^src\/design-system\//.test(file)).sort()
    assert.deepEqual(dialogs('HEAD').filter((file) => !dialogs(base).includes(file)), ['src/ui/refinements/logging-overlay.tsx'])
    // Every logging route consumer reaches the one overlay; the timed families through the one timed dialog.
    for (const consumer of ['src/ui/set-logger.tsx', 'src/ui/superset-block.tsx', 'src/ui/circuit-block.tsx', 'src/ui/exercise-coaching.tsx', 'src/app/Summary.tsx', 'src/app/Home.tsx', 'src/ui/refinements/timed-result-dialog.tsx']) {
      assert.ok(deps(resolve(repo, consumer)).some((file) => file.endsWith('src/ui/refinements/logging-overlay.tsx')), `${consumer} imports the shared LoggingOverlay`)
    }
    for (const block of ['src/ui/emom-block.tsx', 'src/ui/amrap-block.tsx', 'src/ui/for-time-block.tsx', 'src/ui/ladder-block.tsx']) {
      const direct = deps(resolve(repo, block)).map((file) => relative(repo, file))
      assert.ok(direct.includes('src/ui/refinements/timed-result-dialog.tsx'), `${block} opens the shared TimedResultDialog`)
      assert.ok(direct.includes('src/ui/refinements/deadline-timer.tsx'), `${block} draws the shared DeadlineTimer`)
    }
    // Foundation 0.14.3 is byte-unchanged (the shared baseline check).
    assert.equal(spawnSync('git', ['diff', '--quiet', base, 'HEAD', '--', 'src/design-system'], { cwd: repo }).status, 0)
  })

  test('AC-GAL-03 each accepted visual target is executed on the real route by a current passing receipt', () => {
    const map = sourceMap()
    assert.deepEqual(map.visualTargets.map(({ target }) => target), VISUAL_TARGETS.map(({ target }) => target))
    for (const { target, cases } of map.visualTargets) {
      for (const resolved of cases) {
        assertCasePassed(resolved, target)
        assert.equal(loadInputs().manifests.get(resolved.task).checks[resolved.check].runner, 'playwright', `${target} is checked in a real browser`)
        assert.doesNotMatch(resolved.name.split(' > ').slice(1).join(' > '), /^(accepted )?gallery/i, `${target} is proved on the route, not by the gallery`)
      }
    }
  })

  test('AC-GAL-04 P01-P05 are each demonstrated by a real shared-component case with a current passing receipt', () => {
    const { gallery } = loadInputs()
    const acceptance = gallery.get('docs/design/library/refinements-2026-11-04/authority/FINAL-POLISH-ACCEPTANCE.md').bytes.toString('utf8')
    const map = sourceMap()
    assert.deepEqual(map.polish.map(({ id }) => id), ['P01', 'P02', 'P03', 'P04', 'P05'])
    for (const item of map.polish) {
      assert.match(acceptance, new RegExp(`\\| ${item.id} \\|`), `${item.id} is an accepted final correction`)
      assert.ok(reach(ROUTES['/workout']).has(item.owner), `${item.id}: ${item.owner} is the shared owner the /workout route draws`)
      let realRoute = false
      for (const resolved of item.cases) {
        assertCasePassed(resolved, item.id)
        const check = loadInputs().manifests.get(resolved.task).checks[resolved.check]
        if (check.runner === 'playwright') {
          realRoute = true
          assert.match(readFileSync(resolve(repo, check.files[0]), 'utf8'), new RegExp(item.id), `${check.files[0]} asserts ${item.id} by name`)
        }
      }
      assert.ok(realRoute, `${item.id} is demonstrated in a real browser, not by a schematic or replay`)
    }
    assert.match(readFileSync(resolve(repo, 'src/ui/refinements/timed-result-log.tsx'), 'utf8'), /clr-timed-undo/, 'P04 lives in the shared TimedResultLog')
  })

  test('AC-GAL-05 all 16 logging contexts and the four skins are mapped to their state, shared visual owner, own fields and writer, with real-route and skin cases; context-owned meanings are kept', () => {
    const { coverage, gallery, record } = loadInputs()
    const map = sourceMap()
    const loggingStates = coverage.requirements.find((entry) => entry.id === 'REQ-019').states
    assert.equal(loggingStates.length, 16)
    assert.deepEqual(map.loggingContexts.map(({ state }) => state).sort(), [...loggingStates].sort())
    const fields = gallery.get('docs/design/library/refinements-2026-11-04/LOGGING-FIELDS.md').bytes.toString('utf8')
    for (const context of map.loggingContexts) {
      assert.match(fields, new RegExp(`^\\| ${context.context.replace(/[/()]/g, '\\$&')} \\|`, 'm'), `${context.state}: "${context.context}" is an accepted field-ownership row`)
      for (const file of context.fieldOwners) assert.ok(existsSync(resolve(repo, file)), `${context.state}: field owner ${file} exists`)
      assert.ok(reach(context.routeConsumer).has('src/ui/refinements/logging-overlay.tsx'), `${context.state}: ${context.routeConsumer} opens the shared LoggingOverlay`)
      assert.ok(reach(ROUTES[context.route]).has(context.routeConsumer), `${context.state}: ${context.route} draws ${context.routeConsumer}`)
      for (const resolved of context.cases) assertCasePassed(resolved, context.state)
    }
    const skins = /export const SKINS = \[([^\]]+)\]/.exec(readFileSync(resolve(repo, 'src/design-system/skin.js'), 'utf8'))[1].match(/'([a-z]+)'/g).map((skin) => skin.slice(1, -1))
    assert.deepEqual(map.skins.map(({ skin }) => skin), skins)
    for (const { skin, cases } of map.skins) for (const resolved of cases) assertCasePassed(resolved, `skin ${skin}`)
    for (const meaning of map.fieldMeanings) {
      for (const resolved of meaning.cases) assertCasePassed(resolved, meaning.meaning)
      for (const file of meaning.unchangedFromBase ?? []) {
        assert.equal(git(['rev-parse', `${record.integrationBase.commit}:${file}`]), git(['rev-parse', `HEAD:${file}`]), `${file} is unchanged from the integration base`)
      }
    }
  })

  test('AC-GAL-06 each implementation owner\'s accepted gallery state draws the route consumer and is held by an executed specimen case', () => {
    const { coverage, repoStates } = loadInputs()
    const map = sourceMap()
    const accepted = [...new Set(coverage.requirements.flatMap((entry) => entry.states))].sort()
    assert.deepEqual([...repoStates.keys()].sort(), accepted, 'the repository gallery offers exactly the accepted states')
    assert.deepEqual(map.galleryStates.map(({ id }) => id), accepted)
    for (const state of map.galleryStates) {
      assert.ok(state.title, `${state.id} has a named state in REFINEMENT_STATES`)
      assert.ok(state.consumers.length >= 1, `${state.id} names the route consumers it draws`)
      const playwright = state.specimenCases.filter((testCase) => testCase.runner === 'playwright')
      assert.ok(playwright.length >= 1, `${state.id} is rendered and asserted by at least one executed browser case`)
      for (const testCase of state.specimenCases) {
        assert.deepEqual(receiptProblems(testCase.task, testCase.check), [], `${state.id}: ${testCase.task} ${testCase.check} is current`)
        const status = readReceipt(testCase.task, testCase.check).requiredCases.find((entry) => entry.name === testCase.name)?.status
        assert.equal(status, 'passed', `${state.id}: "${testCase.name}" passed`)
      }
    }
    // Each requirement's accepted application owners are drawn by its gallery states (scene compositions under
    // src/dev and Foundation icons are reference owners, not application modules).
    for (const entry of coverage.requirements.filter((requirement) => requirement.states.length)) {
      const graphs = entry.states.map((state) => reach(stateModule(state)))
      for (const owner of entry.sharedOwners.map((name) => name.split('#')[0]).filter((name) => /^src\/(ui|app|state)\//.test(name))) {
        assert.ok(graphs.some((graph) => graph.has(owner)), `${entry.id}: a state of ${entry.states.join(', ')} imports its accepted shared owner ${owner}`)
      }
    }
    // The gallery's specimen register keeps its refinement links, and every linked state exists.
    const registry = readFileSync(resolve(repo, 'src/dev/gallery-registry.tsx'), 'utf8')
    for (const match of registry.matchAll(/\/gallery\/refinements\?state=([a-z0-9_-]+)/g)) assert.ok(repoStates.has(match[1]), `registry link ${match[1]} resolves`)
  })

  test('AC-GAL-07 aggregate closure verifies the accepted coverage matrix and states, real-route parity and delivered receipts; persistence closes by real writes, never a synthetic gallery Save', () => {
    const { coverage, handoff } = loadInputs()
    const map = sourceMap()
    assert.equal(coverage.revision, 6)
    assert.equal(coverage.baseline, loadInputs().record.integrationBase.commit)
    assert.equal(coverage.requirements.length, 40)
    assert.equal(coverage.requirements.flatMap((entry) => entry.acceptanceCriterionIds).length, 162)
    assert.deepEqual(coverage.polish, ['P01', 'P02', 'P03', 'P04', 'P05'])
    for (const entry of coverage.requirements) {
      assert.ok(entry.states.length > 0 || entry.galleryScope === 'explicit non-gallery disposition', `${entry.id} has states or an explicit non-gallery disposition`)
      const tasks = handoff.tasks.filter((task) => task.requirementIds.includes(entry.id))
      assert.ok(tasks.length >= 1, `${entry.id} has an approved task`)
      for (const id of entry.acceptanceCriterionIds) assert.ok(map.criteria.some((criterion) => criterion.id === id), `${id} is in the source map`)
    }
    // Every journey is closed by its owner's real-route cases, never only by gallery cases.
    for (const journey of map.journeys) {
      const check = loadInputs().manifests.get(journey.check.task).checks[journey.check.check]
      const routeCases = check.cases.filter((testCase) => !/^(accepted )?gallery/i.test(testCase.name.split(' > ').slice(1).join(' > ')))
      assert.ok(routeCases.length >= 1, `${journey.id} has route cases beside any gallery case`)
    }
    // Persistence: the backend-lane cases are the proof; gallery states write nothing.
    for (const [task, journey] of [['TASK-047', 'JOURNEY-031'], ['TASK-048', 'JOURNEY-032']]) {
      const check = loadInputs().manifests.get(task).checks['check-01']
      const backend = check.cases.filter((testCase) => /backend lane/.test(testCase.name))
      assert.equal(backend.length, 2, `${journey} has two backend-lane cases`)
      const receipt = readReceipt(task, 'check-01')
      for (const testCase of backend) assert.equal(receipt.requiredCases.find((entry) => entry.name === testCase.name).status, 'passed')
      for (const testCase of check.cases.filter((entry) => /gallery/.test(entry.name))) assert.match(testCase.name, /memory only|no network|nothing stored/, `${task}'s gallery case is memory-only`)
    }
    for (const file of readdirSync(resolve(repo, 'src/dev')).filter((name) => /^gallery-refinement.*\.tsx?$/.test(name))) {
      const imports = deps(resolve(repo, 'src/dev', file)).map((path) => relative(repo, path))
      assert.deepEqual(imports.filter((path) => /^src\/data\/.*(client|supabase)/i.test(path)), [], `${file} imports no live data client`)
    }
  })

  test('AC-GAL-08 every approved task cites the accepted commit with a stable state or an explicit non-gallery disposition, and its delivered evidence carries the citation or its disposition', () => {
    const { handoff, record, gallery } = loadInputs()
    const map = sourceMap()
    assert.equal(record.acceptedGallery.commit, 'eded158cfd928d382c9a9409e2c372270312741d')
    const reference = JSON.parse(readFileSync(resolve(EVIDENCE_ROOT, BODY, 'references/accepted-gallery/REFERENCE.json'), 'utf8'))
    assert.equal(reference.identity.commit, record.acceptedGallery.commit, 'the reference is pinned to the immutable commit')
    assert.ok(gallery.size >= 1190)
    assert.equal(map.tasks.length, handoff.tasks.length)
    for (const task of map.tasks) {
      assert.equal(task.citedGalleryCommit, 'eded158cfd928d382c9a9409e2c372270312741d', `${task.task}'s approved body cites the accepted commit`)
      assert.ok(task.galleryStates.length >= 1 || task.disposition === 'explicit non-gallery disposition' || /non-gallery/.test(handoff.tasks.find((entry) => entry.taskId === task.task).prompt),
        `${task.task} cites a stable state or an explicit non-gallery disposition`)
      if (task.task === SELF) continue
      const evidence = [
        `evidence/refinement/${task.task.toLowerCase()}/required-cases.json`,
        `docs/journal/${BODY}/${task.task}.md`,
        `docs/definitions/${BODY}/${task.task}.md`,
      ].filter((file) => existsSync(resolve(repo, file))).map((file) => readFileSync(resolve(repo, file), 'utf8')).join('\n')
      const cites = evidence.includes('eded158cfd928d382c9a9409e2c372270312741d') || evidence.includes('eded158')
      const disposition = /non-gallery|gallery disposition/i.test(evidence) || task.galleryStates.some((state) => evidence.includes(`state=${state}`))
      assert.ok(cites || disposition, `${task.task}'s delivered evidence carries the accepted commit or its gallery disposition`)
      assert.doesNotMatch(evidence, /https?:\/\/localhost[^\s)]*gallery/i, `${task.task} does not rest on an unversioned localhost link`)
    }
  })
})
