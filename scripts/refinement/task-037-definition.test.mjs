// TASK-037 (REQ-037; AC-R037-01, AC-R037-02): the platform language and
// terminology audit, retained as a definition record.
//
// Run through the shared guard:
//   node scripts/refinement/run-required-check.mjs --task TASK-037 --check check-01 -- \
//     node --test scripts/refinement/task-037-definition.test.mjs
//
// The record is docs/definitions/clear-refinement-20261103/TASK-037.md. It is a
// definition, not a copy change: these cases hold its structure and sourcing.
// TASK-039's shared checker verifies the header, the sections and every source
// hash. The cases below add what is specific to the copy audit:
//   - every claim cites a verified source, and every quoted string or
//     identifier occurs in the verified bytes of a source that claim cites;
//   - the inventory names every route surface with its titles, actions,
//     states and helper messages;
//   - every string literal that shows "RPE" in the frontend at this revision
//     is inventoried, and the four stored efforts keep their meanings;
//   - every explicitly selected copy change keeps its verified status, read
//     from the string literals of the pinned before/after sources;
//   - the proposal is concise, uses Effort rather than RPE and is not a
//     complete voice guide; undecided items and owner decisions are explicit;
//   - no product copy is claimed rewritten by this task.
// The ref: sources resolve through the out-of-Git reference object store,
// which fails closed when it is absent.

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

import { loadBody, readBaseBlobs, verifyReferences } from './lib/references.mjs'
import { DEFAULT_BODY, parseRecord, verifyDefinitionRecord } from './verify-definition-record.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TASK = 'TASK-037'
const RECORD = `docs/definitions/${DEFAULT_BODY}/${TASK}.md`
const EVIDENCE_ROOT = resolve(repo, 'evidence/refinement')
const EXTRA_SECTIONS = [
  'Effort and RPE',
  'Selected copy changes',
  'Terminology and voice proposal',
  'Undecided items',
  'Non-gallery disposition',
]
const CLAIM_SECTIONS = [
  'Scope',
  'Current observations',
  'Effort and RPE',
  'Selected copy changes',
  'Terminology and voice proposal',
  'Undecided items',
  'Options',
  'Open owner decisions',
  'Limitations',
  'Non-gallery disposition',
  'Traceability',
]
const EVIDENCE_IDS = [
  'EVID-F1CA58C8F8CF',
  'EVID-76CED19E0F10',
  'EVID-A8BBE1D1CAFB',
  'EVID-2CC0423F1253',
  'EVID-E93E0D7F20F0',
  'EVID-5D7D1D861CE6',
  'EVID-0FB6EA12D51D',
  'EVID-23A8EF90367F',
  'EVID-588799E96D5F',
  'EVID-68E7E9878523',
  'EVID-AA942F361914',
  'EVID-D7466F08C2C8',
  'EVID-B791E50FF6A0',
  'EVID-ECA54B20E8CF',
]
const DECISIONS = ['COPY-VOICE', 'EFFORT-NUMERIC-READING', 'COPY-APPLY']
const SOURCE_ENTRY = /^- `(repo|base|ref):([^`]+)` sha256 `([0-9a-f]{64})`\. (S\d{2}): \S/
const CITATION = /\[(S\d{2})\]/g
const ITEM = /^\*\*([A-Z]\d+|[A-Z]+(?:-[A-Z]+)+)\*\*\s+(.*)$/

/**
 * The explicitly selected copy changes of G20 (and the R43 sentence of G07), with
 * the status the record must state. `removed` strings must be string literals of
 * the `before` source and of no string literal in the `now` source; `present`
 * strings must still be string literals of the `now` source.
 */
const SELECTED = [
  { id: 'X1', note: 'R09', status: 'not applied', now: 'src/ui/session-detail.tsx', present: ['RPE'] },
  {
    id: 'X2',
    note: 'R23',
    status: 'applied',
    before: 'src/app/Generate.tsx',
    now: 'src/app/Generate.tsx',
    removed: ['Uses this place’s equipment.', 'Optional, today only. Ongoing limits go in Settings.'],
  },
  {
    id: 'X3',
    note: 'R40',
    status: 'applied',
    before: 'src/ui/emom-block.tsx',
    now: 'src/ui/emom-block.tsx',
    removed: ['NOT STARTED', 'WORK'],
    present: ['MIN ${…} OF ${…}'],
  },
  {
    id: 'X4',
    note: 'R43',
    status: 'applied',
    before: 'src/ui/emom-block.tsx',
    now: 'src/ui/emom-block.tsx',
    removed: ['The clock has run every prescribed minute. Continue when you are ready.'],
  },
  {
    id: 'X5',
    note: 'R50',
    status: 'not applied',
    now: 'src/ui/amrap-block.tsx',
    present: ['Nothing to enter now. Record your rounds afterwards if you like.'],
  },
  {
    id: 'X6',
    note: 'R70',
    status: 'applied',
    before: 'src/ui/ladder-block.tsx',
    now: 'src/ui/refinements/ladder.tsx',
    removed: ['— same every round'],
  },
  {
    id: 'X7',
    note: 'R71',
    status: 'applied',
    before: 'src/ui/ladder-block.tsx',
    now: 'src/ui/ladder-block.tsx',
    removed: ['Move through the rounds at your own pace inside the cap. Nothing here moves on by itself — you say how far you got.'],
  },
  { id: 'X8', note: 'R72', status: 'applied', now: 'src/state/ladder.ts', present: ['${…} × ${…}${…}'] },
  {
    id: 'X9',
    note: 'R112',
    status: 'applied',
    before: 'src/ui/set-logger.tsx',
    now: 'src/ui/set-logger.tsx',
    removed: ['Tick each movement you performed. A blank field is saved as not recorded.'],
  },
]

const text = readFileSync(resolve(repo, RECORD), 'utf8')
const { header, sections } = parseRecord(text)

/** Bullets of one section, each joined with its indented continuation lines. */
function bullets(name) {
  const items = []
  for (const line of sections.get(name) ?? []) {
    if (/^- /.test(line)) items.push(line.slice(2))
    else if (/^\s+\S/.test(line) && items.length) items[items.length - 1] += ` ${line.trim()}`
    else if (line.trim() !== '') items.push(null)
  }
  return items.filter((item) => item !== null)
}

/** `**X1**`-labelled items of one section, by id. */
function labelled(name, prefix) {
  return bullets(name)
    .map((item) => ITEM.exec(item))
    .filter((match) => match && (prefix === undefined || match[1].startsWith(prefix)))
    .map(([, id, body]) => ({ id, body }))
}

function citations(fragment) {
  return [...fragment.matchAll(CITATION)].map((match) => match[1])
}

function sectionText(name) {
  return (sections.get(name) ?? []).join('\n')
}

function backticked(fragment) {
  return [...fragment.matchAll(/`([^`]+)`/g)].map((match) => match[1])
}

function assertNumbered(items, prefix) {
  assert.deepEqual(
    items.map(({ id }) => id),
    items.map((_, index) => `${prefix}${index + 1}`),
    `${prefix}-items are numbered once, in order`,
  )
}

/** Sources: id -> { kind, path }, in the record's own order. */
const sources = new Map(
  (sections.get('Sources') ?? [])
    .filter((line) => line.startsWith('- '))
    .map((line) => {
      const match = SOURCE_ENTRY.exec(line)
      assert.ok(match, `source line does not name its id: ${line}`)
      return [match[4], { kind: match[1], path: match[2] }]
    }),
)

function sourceId(kind, path) {
  const found = [...sources].find(([, source]) => source.kind === kind && source.path === path)
  return found?.[0] ?? null
}

let sourceTextCache = null
/** The verified bytes of every source, as text, by source id. */
function sourceTexts() {
  if (sourceTextCache) return sourceTextCache
  const { record } = loadBody({ evidenceRoot: EVIDENCE_ROOT, body: DEFAULT_BODY })
  assert.ok(record, 'the body record must load')
  const basePaths = [...sources.values()].filter((s) => s.kind === 'base').map((s) => s.path)
  const base = readBaseBlobs(repo, record.integrationBase.commit, basePaths)
  const references = verifyReferences({ cwd: repo, evidenceRoot: EVIDENCE_ROOT, body: DEFAULT_BODY, only: 'accepted-gallery' })
  assert.deepEqual(references.problems, [], 'the accepted-gallery reference must verify byte for byte')
  const gallery = references.references[0].result.files
  sourceTextCache = new Map()
  for (const [id, { kind, path }] of sources) {
    let bytes
    if (kind === 'repo') bytes = readFileSync(resolve(repo, path))
    else if (kind === 'base') bytes = base.get(path)
    else {
      const [refId, ...rest] = path.split('/')
      assert.equal(refId, 'accepted-gallery', `${id} must cite the accepted-gallery reference`)
      bytes = gallery.get(rest.join('/'))?.bytes
    }
    assert.ok(bytes, `${id} (${kind}:${path}) must resolve`)
    sourceTextCache.set(id, bytes.toString('utf8'))
  }
  return sourceTextCache
}

/**
 * The text a TypeScript source can show: its string literals, template
 * literals (each substitution read as `${…}`) and JSX text. Comments and
 * identifiers are not copy, so a string kept only in a comment is absent.
 */
function literalsOf(source, fileName) {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind)
  const out = []
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const value = node.text.replace(/\s+/g, ' ').trim()
      if (value) out.push(value)
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      out.push(node.text)
    } else if (ts.isTemplateExpression(node)) {
      out.push(node.head.text + node.templateSpans.map((span) => `\${…}${span.literal.text}`).join(''))
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return out
}

function routerPaths() {
  const router = readFileSync(resolve(repo, 'src/app/router.tsx'), 'utf8')
  return new Set([...router.matchAll(/path:\s*'([^']+)'/g)].map((match) => match[1]))
}

/** Frontend source files at this revision: no tests, test doubles or dev gallery. */
function frontendFiles(dir = resolve(repo, 'src')) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name)
    const rel = relative(repo, path)
    if (entry.isDirectory()) {
      if (rel === 'src/test' || rel === 'src/dev') continue
      files.push(...frontendFiles(path))
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      files.push(rel)
    }
  }
  return files
}

describe('TASK-037 platform language and terminology audit (G20)', () => {
  test('AC-R037-01 the record passes the shared definition-record checker with its inventory, effort, selected-change, proposal, undecided and non-gallery sections', () => {
    const result = verifyDefinitionRecord({ cwd: repo, task: TASK, record: RECORD, requireSections: EXTRA_SECTIONS })
    assert.deepEqual(result.problems, [])
    assert.equal(result.ok, true)
    assert.equal(header.requirement, 'REQ-037')
    assert.equal(header.criteria, 'AC-R037-01, AC-R037-02')
    assert.equal(header.issue, '#664')
    assert.equal(result.sources.length, sources.size, 'every source line carries an S-id')
    assert.ok(sources.size >= 40, 'a platform inventory rests on the files that hold the copy')
    for (const kind of ['repo', 'base', 'ref']) {
      assert.ok([...sources.values()].some((source) => source.kind === kind), `at least one ${kind}: source`)
    }
  })

  test('AC-R037-01 every claim cites a listed source and every listed source is cited', () => {
    const cited = new Set()
    for (const name of CLAIM_SECTIONS) {
      const items = bullets(name)
      assert.ok(items.length > 0, `section "${name}" makes its claims as bullets`)
      for (const item of items) {
        const ids = citations(item)
        assert.ok(ids.length > 0, `uncited claim in "${name}": ${item}`)
        for (const id of ids) {
          assert.ok(sources.has(id), `"${name}" cites ${id}, which Sources does not list`)
          cited.add(id)
        }
      }
      for (const id of citations(sectionText(name))) cited.add(id)
    }
    const uncited = [...sources.keys()].filter((id) => !cited.has(id))
    assert.deepEqual(uncited, [], 'every listed source supports at least one claim')
  })

  test('AC-R037-01 every quoted string and identifier occurs in the verified bytes of a source its claim cites', () => {
    const texts = sourceTexts()
    let checked = 0
    for (const name of CLAIM_SECTIONS) {
      for (const item of bullets(name)) {
        const ids = citations(item)
        for (const token of backticked(item)) {
          if (/^\/[^\s]*$/.test(token)) continue // routes are held to the router by the route case below
          if (/^scripts\/refinement\//.test(token)) continue // this task's own check target
          if (/^[0-9a-f]{40}$/.test(token)) continue // the accepted gallery commit, cited by S03
          // JSX text wraps across source lines and is drawn with its whitespace collapsed.
          const found = ids.some((id) => texts.get(id).includes(token) || texts.get(id).replace(/\s+/g, ' ').includes(token))
          assert.ok(found, `"${name}" quotes \`${token}\` but none of ${ids.join(', ')} contains it: ${item}`)
          checked += 1
        }
      }
    }
    assert.ok(checked >= 200, `the inventory quotes the product's own words (${checked} quoted)`)
    // The audit request itself is quoted from its source.
    const request = 'Inventory awkward/inconsistent language, terminology, action labels and state/helper messages'
    assert.ok(texts.get('S02').includes(request), 'S02 holds the R45 request')
    assert.ok(sectionText('Scope').replace(/\s+/g, ' ').includes(request), 'Scope quotes the same request')
  })

  test('AC-R037-01 the inventory covers every route surface with its titles, actions, states and helper messages', () => {
    const items = labelled('Current observations')
    assert.ok(items.length >= 14, 'one inventory item per surface')
    assert.ok(items.every(({ id }) => id.startsWith('I')), 'inventory items are I-items only')
    assertNumbered(items, 'I')
    for (const { id, body } of items) {
      const kinds = ['Titles:', 'Actions:', 'States:', 'Helpers:'].filter((kind) => body.includes(kind))
      assert.ok(kinds.length >= 2, `${id} classifies its copy as titles, actions, states or helpers`)
      assert.ok(backticked(body).length >= 6, `${id} quotes the surface's own words`)
    }
    const inventory = sectionText('Current observations')
    for (const kind of ['Titles:', 'Actions:', 'States:', 'Helpers:']) {
      const count = items.filter(({ body }) => body.includes(kind)).length
      assert.ok(count >= 8, `${kind} is inventoried on most surfaces (${count})`)
    }
    const routes = routerPaths()
    const named = new Set([...inventory.matchAll(/`(\/[^`\s]*)`/g)].map((match) => match[1]))
    for (const route of named) assert.ok(routes.has(route), `\`${route}\` is not a route in src/app/router.tsx`)
    for (const route of routes) {
      if (route === '*' || route.startsWith('dev/')) continue
      assert.ok(named.has(route), `the inventory names the ${route} surface`)
    }
    for (const constant of ['ONBOARDING_ROUTE', 'FORMAT_PREVIEW_ROUTE']) {
      assert.ok(inventory.includes(`\`${constant}\``), `the inventory names the ${constant} surface`)
    }
  })

  test('AC-R037-01 every visible RPE string at this revision is inventoried and Effort keeps numeric historical and categorical meanings apart', () => {
    const effort = sectionText('Effort and RPE')
    const items = labelled('Effort and RPE')
    assert.ok(items.length >= 8 && items.every(({ id }) => id.startsWith('E')), 'effort items are E-items only')
    assertNumbered(items, 'E')
    const citedPaths = new Set(citations(effort).map((id) => sources.get(id)?.path))

    // Every frontend string literal that says RPE is inventoried by its file.
    const flagged = new Map()
    for (const file of frontendFiles()) {
      const literals = literalsOf(readFileSync(resolve(repo, file), 'utf8'), file).filter((value) => /\bRPE\b/.test(value))
      if (literals.length) flagged.set(file, literals)
    }
    assert.ok(flagged.size >= 5, 'the scan finds the RPE strings the frontend holds today')
    for (const [file, literals] of flagged) {
      assert.ok(citedPaths.has(file), `${file} shows ${JSON.stringify(literals[0])} but "Effort and RPE" does not inventory it`)
    }
    for (const file of ['src/ui/session-detail.tsx', 'src/state/session-detail.ts', 'src/ui/deload-banner.tsx', 'src/state/deload.ts', 'src/state/load-suggestions.ts', 'src/state/progression.ts']) {
      assert.ok(flagged.has(file), `${file} is one of the RPE strings the scan must still find`)
    }

    // The four stored values keep their own meanings and are never converted.
    const texts = sourceTexts()
    const contract = sourceId('repo', 'docs/specs/LOGGING_FIELD_CONTRACT.md')
    assert.ok(contract, 'the logging field contract is a source')
    assert.match(texts.get(contract), /Four different things are called "effort" or "feeling" in the schema\. None is ever derived from\s+another\./)
    for (const identifier of ['`rpe`', '`perceived_effort`', '`set_effort`', '`mood`', '`too_hard`', '`about_right`', '`too_easy`']) {
      assert.ok(effort.includes(identifier), `"Effort and RPE" names ${identifier}`)
    }
    assert.match(effort, /never converted/)
    assert.match(effort, /historical/)
    assert.match(effort, /categor/)
  })

  test('AC-R037-01 every explicitly selected copy change keeps its verified status: removed where applied, still present where not', () => {
    const texts = sourceTexts()
    const items = new Map(labelled('Selected copy changes').map(({ id, body }) => [id, body]))
    assert.ok(items.size >= SELECTED.length + 1, 'every selected change and the other groups are listed')
    for (const change of SELECTED) {
      const body = items.get(change.id)
      assert.ok(body, `${change.id} (${change.note}) is listed`)
      assert.ok(body.includes(change.note), `${change.id} names ${change.note}`)
      assert.match(body, new RegExp(`Status: ${change.status}\\b`), `${change.id} states "Status: ${change.status}"`)
      const ids = citations(body)
      const cites = (kind) => ids.find((id) => sources.get(id)?.path === change.now && sources.get(id)?.kind === kind)
      const nowId = cites('repo') ?? cites('base')
      assert.ok(nowId, `${change.id} cites ${change.now} as it is now`)
      if (change.removed) assert.equal(sources.get(nowId).kind, 'repo', `${change.id} reads ${change.now} at this revision, not at the base`)
      const now = literalsOf(texts.get(nowId), change.now)
      for (const value of change.removed ?? []) {
        const beforeId = ids.find((id) => sources.get(id)?.path === change.before && sources.get(id)?.kind === 'base')
        assert.ok(beforeId, `${change.id} cites the base ${change.before} the string was removed from`)
        const before = literalsOf(texts.get(beforeId), change.before)
        assert.ok(before.some((literal) => literal.includes(value)), `${change.id}: "${value}" was copy at the base`)
        assert.ok(!now.some((literal) => literal.includes(value)), `${change.id}: "${value}" is still copy in ${change.now}`)
      }
      for (const value of change.present ?? []) {
        assert.ok(now.some((literal) => literal.includes(value)), `${change.id}: "${value}" is copy in ${change.now}`)
      }
    }
    // R40 removed only the EMOM captions: the minute and Now/Next stay, and the ladder's caption is undecided.
    assert.match(items.get('X3'), /Now/)
    assert.match(sectionText('Undecided items'), /`NOT STARTED`/)
    // The approved sources still say what the record says they selected.
    const authority = texts.get('S01')
    assert.match(authority, /### G20: Dedicated platform copy\/terminology\/tone pass\. Visible labels say Effort, preserving historical values\/meaning\./)
    assert.match(authority, /Source notes: R09, R23, R40, R45, R50, R70, R71, R72, R112/)
    for (const note of ['R09', 'R23', 'R40', 'R43', 'R45', 'R50', 'R70', 'R71', 'R72', 'R112']) {
      assert.match(texts.get('S02'), new RegExp(`### ${note} — `), `S02 holds ${note}`)
    }
  })

  test('AC-R037-02 the terminology and voice proposal is concise, sourced, uses Effort not RPE and is not a complete voice guide', () => {
    const proposal = sectionText('Terminology and voice proposal')
    const terms = labelled('Terminology and voice proposal', 'T')
    const rules = labelled('Terminology and voice proposal', 'W')
    assert.ok(terms.length >= 5 && terms.length <= 10, 'a handful of terms')
    assert.ok(rules.length >= 5 && rules.length <= 10, 'a handful of voice rules')
    assertNumbered(terms, 'T')
    assertNumbered(rules, 'W')
    assert.ok(proposal.split('\n').filter((line) => line.trim()).length <= 70, 'the proposal stays concise')
    assert.match(proposal, /^Status: proposal\. Nothing here is approved or applied\./m)
    assert.match(proposal, /not a finalized voice guide/)
    const [effort] = terms
    assert.match(effort.body, /^Effort\./, 'T1 is the Effort term')
    assert.match(effort.body, /never (a|as a) visible (title|label)/)
    // RPE appears in the proposal only as quoted existing copy or as what is never shown.
    for (const sentence of proposal.replace(/`[^`]*`/g, '``').replace(/\s+/g, ' ').split(/(?<=\.)\s/)) {
      if (/\bRPE\b/.test(sentence)) assert.match(sentence, /\b(never|not|no)\b/i, `RPE is proposed as a label: ${sentence}`)
    }
    // Every rule rests on an owner note or decision, not on taste.
    for (const { id, body } of [...terms, ...rules]) {
      assert.ok(citations(body).length > 0, `${id} cites its source`)
    }
    assert.match(sectionText('Limitations'), /The few approved examples are not a complete voice guide/)
  })

  test('AC-R037-02 undecided items and owner decisions are explicit and none is pre-selected', () => {
    const undecided = labelled('Undecided items')
    assert.ok(undecided.length >= 10 && undecided.every(({ id }) => id.startsWith('U')), 'undecided items are U-items')
    assertNumbered(undecided, 'U')
    for (const { id, body } of undecided) {
      assert.ok(backticked(body).length > 0, `${id} quotes the copy it is about`)
    }
    const options = sectionText('Options')
    assert.match(options, /^No option is selected\./m)
    assert.doesNotMatch(text, /\b(Selected|Recommended|Chosen|Preferred) option\b|\bwe recommend\b/i)
    const decisions = labelled('Open owner decisions')
    assert.deepEqual(decisions.map(({ id }) => id), DECISIONS, 'three exact remaining decisions')
    for (const { id, body } of decisions) {
      assert.match(body, /Owner: Eric/, `${id} names its owner`)
      assert.match(body, /Decision: \S/, `${id} states the exact decision`)
      assert.match(body, /Blocks: \S/, `${id} says what it blocks`)
    }
    const groups = labelled('Options')
    for (const prefix of ['N', 'A', 'Y']) {
      assert.ok(groups.filter(({ id }) => id.startsWith(prefix)).length >= 2, `option group ${prefix} offers a choice`)
    }
  })

  test('AC-R037-02 no product copy is claimed rewritten and the accepted map still records the non-gallery disposition with traceability', () => {
    assert.equal(header.status, 'definition-only')
    assert.equal(header['implementation claim'], 'none')
    assert.match(sectionText('Limitations'), /This task changes no product copy/)
    // Every sentence that speaks of rewriting or applying copy says it has not happened here, is future work or names another task.
    const body = text.slice(text.indexOf('\n## '))
    const sentences = body.replace(/`[^`]*`/g, '``').replace(/\s+/g, ' ').split(/(?<=\.)\s/)
    for (const sentence of sentences.filter((s) => /\b(rewr(ote|itten|ite|iting)|renamed|implement(ed|ation|ing|s)?)\b/i.test(s))) {
      assert.match(sentence, /\b(no|not|none|never|future|TASK-0\d\d|would|before)\b/i, `copy-change sentence without a negation or owner: ${sentence}`)
    }

    const trace = sectionText('Traceability')
    for (const id of ['G20', 'R09', 'R45', 'R50', 'REQ-037', 'AC-R037-01', 'AC-R037-02', 'TASK-037', '#664', ...DECISIONS, ...EVIDENCE_IDS]) {
      assert.ok(trace.includes(id), `Traceability names ${id}`)
    }
    assert.match(trace, /scripts\/refinement\/task-037-definition\.test\.mjs/)

    const texts = sourceTexts()
    const coverage = JSON.parse(texts.get('S03'))
    const requirement = coverage.requirements.find((entry) => entry.id === 'REQ-037')
    assert.ok(requirement, 'the accepted coverage map lists REQ-037')
    assert.equal(requirement.galleryScope, 'explicit non-gallery disposition')
    assert.deepEqual(requirement.states, [])
    assert.deepEqual(requirement.acceptanceCriterionIds, ['AC-R037-01', 'AC-R037-02'])
    assert.match(requirement.limit, /selected explicit removals remain in the authority/)
    assert.match(texts.get('S04'), /\| REQ-037 \| Explicit non-gallery disposition \|/)
    assert.match(texts.get('S05'), /\/ TASK-037 \| REQ-037 \| not applicable to gallery \|/)
    assert.match(sectionText('Non-gallery disposition'), /eded158cfd928d382c9a9409e2c372270312741d/)
  })
})
