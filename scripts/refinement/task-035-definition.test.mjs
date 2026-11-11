// TASK-035 (REQ-035; AC-R035-01, AC-R035-02): the adaptive-training and
// progress report definition record for R03.
//
// Run through the shared guard:
//   node scripts/refinement/run-required-check.mjs --task TASK-035 --check check-01 -- \
//     node --test scripts/refinement/task-035-definition.test.mjs
//
// The record is docs/definitions/clear-refinement-20261103/TASK-035.md. It is a
// definition, not a feature: these cases hold its structure and its sourcing.
// TASK-039's shared checker verifies the header, the sections and every source
// hash. The cases below add what is specific to R03:
//   - every claim cites a verified source;
//   - each identifier a claim names really occurs in the source it cites;
//   - observations, derived readings and targets stay apart;
//   - the open owner decision is exact and no option is pre-selected;
//   - no route, chart, metric set, frequency or profile is invented;
//   - the follow-up stays visible in source-to-task traceability;
//   - no report is claimed implemented.
// The ref: sources resolve through the out-of-Git reference object store,
// which fails closed when it is absent.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { loadBody, readBaseBlobs, verifyReferences } from './lib/references.mjs'
import { DEFAULT_BODY, parseRecord, verifyDefinitionRecord } from './verify-definition-record.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TASK = 'TASK-035'
const RECORD = `docs/definitions/${DEFAULT_BODY}/${TASK}.md`
const EVIDENCE_ROOT = resolve(repo, 'evidence/refinement')
const EXTRA_SECTIONS = ['Derived readings', 'Future targets', 'Where these readings appear today', 'Non-gallery disposition']
const CLAIM_SECTIONS = [
  'Scope',
  'Current observations',
  'Derived readings',
  'Future targets',
  'Where these readings appear today',
  'Options',
  'Open owner decisions',
  'Limitations',
  'Non-gallery disposition',
  'Traceability',
]
const EVIDENCE_IDS = [
  'EVID-1D0835D0F7B2',
  'EVID-76CED19E0F10',
  'EVID-61F2618D2BE0',
  'EVID-307A9596F2E5',
  'EVID-39767BA29C05',
  'EVID-39D9BD43BFE7',
]
const SOURCE_ENTRY = /^- `(repo|base|ref):([^`]+)` sha256 `([0-9a-f]{64})`\. (S\d{2}): \S/
const CITATION = /\[(S\d{2})\]/g

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
    .map((item) => /^\*\*([A-Z]\d+|R03-[A-Z-]+)\*\*\s+(.*)$/.exec(item))
    .filter((match) => match && (prefix === undefined || match[1].startsWith(prefix)))
    .map(([, id, body]) => ({ id, body }))
}

function citations(fragment) {
  return [...fragment.matchAll(CITATION)].map((match) => match[1])
}

function sectionText(name) {
  return (sections.get(name) ?? []).join('\n')
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

function routerPaths() {
  const router = readFileSync(resolve(repo, 'src/app/router.tsx'), 'utf8')
  return new Set([...router.matchAll(/path:\s*'([^']+)'/g)].map((match) => match[1]))
}

describe('TASK-035 adaptive-training and progress report definition (R03)', () => {
  test('AC-R035-01 the record passes the shared definition-record checker with its derived readings, future targets, current surfaces and non-gallery disposition', () => {
    const result = verifyDefinitionRecord({ cwd: repo, task: TASK, record: RECORD, requireSections: EXTRA_SECTIONS })
    assert.deepEqual(result.problems, [])
    assert.equal(result.ok, true)
    assert.equal(header.requirement, 'REQ-035')
    assert.equal(header.criteria, 'AC-R035-01, AC-R035-02')
    assert.equal(header.issue, '#662')
    assert.equal(result.sources.length, sources.size, 'every source line carries an S-id')
    assert.ok(sources.size >= 10, 'a definition of what the app records rests on its schema, read models and authority')
    for (const kind of ['repo', 'base', 'ref']) {
      assert.ok([...sources.values()].some((source) => source.kind === kind), `at least one ${kind}: source`)
    }
  })

  test('AC-R035-01 every claim cites a listed source and every listed source is cited', () => {
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

  test('AC-R035-01 the identifiers each claim names occur in the sources that claim cites', () => {
    const texts = sourceTexts()
    for (const name of CLAIM_SECTIONS) {
      for (const item of bullets(name)) {
        const ids = citations(item)
        const tokens = [...item.matchAll(/`([^`]+)`/g)].map((match) => match[1])
        for (const token of tokens) {
          if (token.includes(' ')) continue // a phrase such as a script path with arguments
          if (token.startsWith('/')) continue // routes are held to the router by the route case below
          if (/^scripts\/refinement\//.test(token)) continue // this task's own check target
          if (/^[0-9a-f]{40}$/.test(token)) continue // the accepted gallery commit, cited by S03
          const found = ids.some((id) => texts.get(id).includes(token))
          assert.ok(found, `"${name}" names \`${token}\` but none of ${ids.join(', ')} contains it: ${item}`)
        }
      }
    }
    // The R03 request itself is quoted from its source.
    const request = 'there should be a place where users can see their adaptive training report as well as progress'
    assert.ok(texts.get('S02').replace(/\s+/g, ' ').includes(request), 'S02 quotes the R03 request')
    assert.ok(sectionText('Scope').replace(/\s+/g, ' ').includes(request), 'Scope quotes the same request')
  })

  test('AC-R035-01 completed observations, derived readings and future targets stay apart', () => {
    const observations = labelled('Current observations')
    const derived = labelled('Derived readings')
    const targets = labelled('Future targets')
    assert.ok(observations.length >= 5 && observations.every(({ id }) => id.startsWith('O')), 'observations are O-items only')
    assert.ok(derived.length >= 3 && derived.every(({ id }) => id.startsWith('D')), 'derived readings are D-items only')
    assert.ok(targets.length >= 3 && targets.every(({ id }) => id.startsWith('T')), 'future targets are T-items only')
    for (const [items, prefix] of [[observations, 'O'], [derived, 'D'], [targets, 'T']]) {
      assert.deepEqual(items.map(({ id }) => id), items.map((_, index) => `${prefix}${index + 1}`), `${prefix}-items are numbered once, in order`)
    }
    for (const { id, body } of observations) {
      assert.doesNotMatch(body, /\bsuggest/i, `${id} is a recorded observation, not a suggestion`)
    }
    assert.match(sectionText('Current observations'), /None of them is a target\./)
    assert.match(sectionText('Derived readings'), /They are not observations/)
    assert.match(sectionText('Future targets'), /A target is never an observation and is never written back as\s+performance\./)
    // Every surface and content option says which kinds of reading it carries.
    for (const { id, body } of [...labelled('Where these readings appear today', 'V').slice(0, 6), ...labelled('Options', 'C')]) {
      assert.match(body, /\(([ODT]\d+)(,|\)| to)/, `${id} names the observations, readings or targets it carries`)
    }
  })

  test('AC-R035-01 the remaining owner decision is exact, names its owner and chooses between options none of which is pre-selected', () => {
    const placements = labelled('Options', 'P')
    const contents = labelled('Options', 'C')
    assert.deepEqual(placements.map(({ id }) => id), ['P1', 'P2', 'P3', 'P4', 'P5'])
    assert.deepEqual(contents.map(({ id }) => id), ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'])
    const options = sectionText('Options')
    assert.match(options, /^No option is selected\./m)
    assert.doesNotMatch(text, /\b(Selected|Recommended|Chosen|Preferred) option\b|\bwe recommend\b/i)
    const decisions = labelled('Open owner decisions')
    assert.deepEqual(decisions.map(({ id }) => id), ['R03-PLACEMENT-CONTENT'], 'one exact remaining decision')
    const [decision] = decisions
    assert.match(decision.body, /Owner: Eric \(product owner, R03 source\)/)
    assert.match(decision.body, /Decision: choose where the adaptive-training and progress report lives \(one of P1 to P5/)
    assert.match(decision.body, /which information it shows \(a subset of C1 to C6/)
    assert.match(decision.body, /Blocks: any future report implementation task\. Does not block: the unrelated shared presentation/)
    // Every constraint an option must keep is the retained R03 decision's, cited.
    const constraints = labelled('Options', 'K')
    assert.ok(constraints.length >= 4)
    assert.match(constraints.map(({ body }) => body).join('\n'), /no separate per-screen calculation/)
    assert.match(constraints.map(({ body }) => body).join('\n'), /No competing editable profile/)
  })

  test('AC-R035-01 no route, chart, metric set, report frequency or editable duplicate profile is invented', () => {
    const routes = routerPaths()
    const named = [...text.matchAll(/`(\/[^`\s]*)`/g)].map((match) => match[1])
    assert.ok(named.length > 0, 'the record names the existing routes it places readings on')
    for (const route of named) assert.ok(routes.has(route), `\`${route}\` is not a route in src/app/router.tsx`)
    const [p3] = labelled('Options', 'P').filter(({ id }) => id === 'P3')
    assert.doesNotMatch(p3.body, /`\//, 'the dedicated-screen option names no path')
    assert.match(p3.body, /which this record does not name\s+or approve/)
    const limitations = sectionText('Limitations')
    assert.match(
      limitations,
      /No route, chart, metric set, report frequency, explanation format or editable duplicate profile is\s+defined or approved here/,
    )
    assert.match(limitations, /C1 to C6 are categories, not metrics/)
    assert.match(sectionText('Options'), /Content options \(categories of information already recorded or derived; not a metric set\)/)
    assert.match(sectionText('Options'), /The training profile is edited only in Settings/)
    assert.match(sectionText('Options'), /No new chart shape without an owner decision/)
  })

  test('AC-R035-02 the follow-up stays visible in source-to-task traceability and the accepted map still records its non-gallery disposition', () => {
    const trace = sectionText('Traceability')
    for (const id of ['R03', 'G19', 'REQ-035', 'AC-R035-01', 'AC-R035-02', 'TASK-035', '#662', 'R03-PLACEMENT-CONTENT', ...EVIDENCE_IDS]) {
      assert.ok(trace.includes(id), `Traceability names ${id}`)
    }
    assert.match(trace, /scripts\/refinement\/task-035-definition\.test\.mjs/)
    assert.match(trace, /A future report implementation must cite this record/)
    assert.match(trace, /Unrelated shared presentation can proceed without it/)

    const texts = sourceTexts()
    assert.match(texts.get('S01'), /### G19: Accessible adaptive-training\/progress report based on authoritative observations and distinct future targets\./)
    assert.match(texts.get('S01'), /Retained request; placement\/content open\./)
    assert.match(texts.get('S02'), /### R03 — User-visible adaptive training and progress report/)
    const coverage = JSON.parse(texts.get('S03'))
    const requirement = coverage.requirements.find((entry) => entry.id === 'REQ-035')
    assert.ok(requirement, 'the accepted coverage map lists REQ-035')
    assert.equal(requirement.galleryScope, 'explicit non-gallery disposition')
    assert.deepEqual(requirement.states, [])
    assert.deepEqual(requirement.acceptanceCriterionIds, ['AC-R035-01', 'AC-R035-02'])
    assert.match(texts.get('S04'), /\| REQ-035 \| Explicit non-gallery disposition \|/)
    assert.match(texts.get('S05'), /\/ TASK-035 \| REQ-035 \| not applicable to gallery \|/)
    assert.match(sectionText('Non-gallery disposition'), /eded158cfd928d382c9a9409e2c372270312741d/)
  })

  test('AC-R035-02 no report is claimed implemented, and no route at this revision is a report', () => {
    assert.equal(header.status, 'definition-only')
    assert.equal(header['implementation claim'], 'none')
    assert.match(sectionText('Limitations'), /No report is implemented by this body's UI consistency delta/)
    assert.match(sectionText('Where these readings appear today'), /^No route is a report today\./m)
    // Every sentence that speaks of implementing says that it has not happened or is future work.
    const body = text.slice(text.indexOf('\n## '))
    const sentences = body.replace(/\s+/g, ' ').split(/(?<=\.)\s/)
    for (const sentence of sentences.filter((s) => /\bimplement(ed|ation|ing|s)\b/i.test(s))) {
      assert.match(sentence, /\b(no|not|none|never|future)\b/i, `implementation sentence without a negation: ${sentence}`)
    }
    for (const route of routerPaths()) {
      assert.doesNotMatch(route, /progress|report|adaptive/i, `${route} would be an undefined report route`)
    }
  })
})
