// TASK-038 (REQ-038; AC-R038-01, AC-R038-02): the coaching and empty-state
// content inventory for G21 / R73.
//
// Run through the shared guard:
//   node scripts/refinement/run-required-check.mjs --task TASK-038 --check check-01 -- \
//     node --test scripts/refinement/task-038-definition.test.mjs
//
// The record is docs/definitions/clear-refinement-20261103/TASK-038.md. It is a
// definition, not a feature: these cases hold its structure, its sourcing and
// its claims against the files they describe. TASK-039's shared checker
// verifies the header, the sections and every source hash. The cases below add
// what is specific to G21:
//   - every claim cites a verified source, and every identifier or quoted
//     string a claim names really occurs in a source it cites (no invented
//     string);
//   - the inventory holds every guidance and note state the owner draws, in
//     the owner's words;
//   - fixture/catalog identity is recomputed from the fixtures and the seeded
//     catalog, and it is recorded before any catalog gap is diagnosed;
//   - movement notes stay outside every guidance state in the owner, and the
//     behavioural proof of that is a current passing receipt;
//   - the hide/replacement/content rule is one exact owner decision with no
//     option pre-selected, and nothing is hidden or reworded in the product.
// The ref: sources resolve through the out-of-Git reference object store,
// which fails closed when it is absent.

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { loadBody, readBaseBlobs, verifyReferences } from './lib/references.mjs'
import { DEFAULT_BODY, parseRecord, verifyDefinitionRecord } from './verify-definition-record.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TASK = 'TASK-038'
const RECORD = `docs/definitions/${DEFAULT_BODY}/${TASK}.md`
const EVIDENCE_ROOT = resolve(repo, 'evidence/refinement')
const EXTRA_SECTIONS = [
  'State inventory',
  'Fixture and catalog identity',
  'Catalog content findings',
  'Notes availability',
  'Gallery disposition',
]
const CLAIM_SECTIONS = [
  'Current observations',
  'State inventory',
  'Fixture and catalog identity',
  'Catalog content findings',
  'Notes availability',
  'Options',
  'Open owner decisions',
  'Gallery disposition',
  'Limitations',
  'Traceability',
]
const EVIDENCE_IDS = ['EVID-C167F3DF2675', 'EVID-76CED19E0F10']
const OWNER = 'src/ui/exercise-coaching.tsx'
const SEED = 'supabase/seed/010_exercise_definitions.sql'
const SOURCE_ENTRY = /^- `(repo|base|ref):([^`]+)` sha256 `([0-9a-f]{64})`\. (S\d{2}): \S/
const CITATION = /\[(S\d{2})\]/g
const NOTE_CASE = 'TASK-005 one grouped coaching and notes disclosure > AC-R005-01 keeps the note of a movement the library has no entry for, and saves it'

const text = readFileSync(resolve(repo, RECORD), 'utf8')
const { header, sections } = parseRecord(text)
const read = (path) => readFileSync(resolve(repo, path), 'utf8')
const squash = (value) => value.replace(/\s+/g, ' ').trim()

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
    .map((item) => /^\*\*([A-Z]\d+|G21-[A-Z-]+)\*\*\s+(.*)$/.exec(item))
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

function sourceId(path) {
  const entry = [...sources].find(([, source]) => source.path === path)
  assert.ok(entry, `Sources must list ${path}`)
  return entry[0]
}

// ─────────────────────────────────────────────────────────────────────────────
// The seeded catalog and the fixtures, read from the files themselves
// ─────────────────────────────────────────────────────────────────────────────

function seededCatalog() {
  const seed = read(SEED)
  const rows = new Map()
  for (const match of seed.matchAll(/^ {2}\('([^']+)', .*?::jsonb, array\[(.*?)\]::text\[\]/gm)) {
    const cues = [...match[2].matchAll(/'((?:[^']|'')*)'/g)].map((cue) => cue[1])
    rows.set(match[1], { cues })
  }
  const ids = [...seed.matchAll(/^ {2}\('([^']+)'/gm)].map((match) => match[1])
  assert.equal(rows.size, ids.length, 'every seeded row was read with its cues')
  const links = seed.slice(seed.indexOf('set regression'))
  const regressions = new Map(
    [...links.matchAll(/\('([^']+)'(?:::text)?, (null|'[^']+')(?:::text)?, (null|'[^']+')(?:::text)?\)/g)]
      .map((match) => [match[1], match[2] === 'null' ? null : match[2].slice(1, -1)]),
  )
  for (const [id, regression] of regressions) if (rows.has(id)) rows.get(id).regression = regression
  return { rows, regressions }
}

/** `slug -> answer` from one `Record<string, CatalogAnswer>` literal in the gallery's data. */
function galleryCatalog(source, name, base = new Map()) {
  const start = source.indexOf(`export const ${name}`)
  assert.ok(start >= 0, `${name} is defined`)
  const block = source.slice(start, source.indexOf('\n}\n', start))
  const long = /LONG_MOVEMENT_ID = '([^']+)'/.exec(read('src/dev/gallery-refinement-cards-data.ts'))[1]
  const answers = new Map(base)
  const entry = /^\s*(?:'([a-z0-9-]+)'|([a-z][a-z0-9]*)|\[(LONG_MOVEMENT_ID)\]): (definition\([^,]+, \[([^\]]*)\], (null|'[^']*')\)|'read fails'),?$/gm
  for (const match of block.matchAll(entry)) {
    const slug = match[1] ?? match[2] ?? (match[3] && long)
    if (match[4] === "'read fails'") answers.set(slug, 'read fails')
    else answers.set(slug, match[5].trim() !== '' || match[6] !== 'null' ? 'written' : 'blank')
  }
  return answers
}

function slugsOf(source) {
  return [...source.matchAll(/exercise_id: (?:[^'\n,]*? \? )?'([a-z0-9-]+)'/g)].map((match) => match[1])
}

/** What each fixture's library answers, recomputed from the fixture files. */
function fixtureIdentity() {
  const cardsData = read('src/dev/gallery-refinement-cards-data.ts')
  const coachingData = read('src/dev/gallery-refinement-coaching-data.ts')
  const long = /LONG_MOVEMENT_ID = '([^']+)'/.exec(cardsData)[1]
  assert.match(cardsData, /exercise_id: LONG_MOVEMENT_ID/)
  const gallery = galleryCatalog(coachingData, 'GALLERY_CATALOG')
  const states = galleryCatalog(coachingData, 'STATES_CATALOG', gallery)
  const answer = (catalog, slug) => catalog.get(slug) ?? 'no entry'

  const cardSlugs = [...new Set([...slugsOf(cardsData), long])]
  const circuitStart = cardsData.indexOf('export const CIRCUIT_BLOCK')
  const circuit = slugsOf(cardsData.slice(circuitStart, cardsData.indexOf('export const', circuitStart + 1)))

  const fixture = read('src/test/grouped-coaching-fixture.ts')
  const guidanceStart = fixture.indexOf('export const COACHING_GUIDANCE')
  const guidance = fixture.slice(guidanceStart, fixture.indexOf('\n}\n', guidanceStart))
  const kinds = { written: 'written', blank: 'blank', absent: 'no entry', 'fails-once': 'read fails once', held: 'held' }
  const shared = [...guidance.matchAll(/'([a-z0-9-]+)': '([a-z-]+)'/g)].map(([, slug, kind]) => [slug, kinds[kind]])

  return {
    F2: new Map(cardSlugs.map((slug) => [slug, answer(gallery, slug)])),
    F3: new Map(circuit.map((slug) => [slug, answer(states, slug)])),
    F4: new Map(shared),
    cardsData,
  }
}

/** The record's per-slug identity lines, by F-item. */
function recordedIdentity() {
  const items = new Map()
  let current = null
  for (const line of sections.get('Fixture and catalog identity') ?? []) {
    const head = /^- \*\*(F\d+)\*\*/.exec(line)
    if (head) {
      current = head[1]
      items.set(current, '')
    }
    if (current) items.set(current, `${items.get(current)} ${line.trim()}`)
  }
  const lines = new Map()
  const pattern = /`([a-z0-9-]+)`: (in the catalog|not in the catalog)(?: \(catalog row `([a-z0-9-]+)`\))?; library answer: (written|blank|no entry|read fails once|read fails)\./g
  for (const [id, body] of items) {
    lines.set(id, [...squash(body).matchAll(pattern)].map(([, slug, where, row, answer]) => ({ slug, inCatalog: where === 'in the catalog', row, answer })))
  }
  return { items, lines }
}

/** One named function's source in the owner, up to the next top-level declaration. */
function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `${OWNER} defines ${name}`)
  const rest = source.slice(start + 1)
  const end = rest.search(/\n(?:export )?function |\n\/\/ ─|\n\/\*\*/)
  return source.slice(start, end < 0 ? undefined : start + 1 + end)
}

describe('TASK-038 coaching and empty-state content inventory (G21)', () => {
  test('AC-R038-01 the record passes the shared definition-record checker with its inventory, identity, catalog findings, notes and gallery sections', () => {
    const result = verifyDefinitionRecord({ cwd: repo, task: TASK, record: RECORD, requireSections: EXTRA_SECTIONS })
    assert.deepEqual(result.problems, [])
    assert.equal(result.ok, true)
    assert.equal(header.requirement, 'REQ-038')
    assert.equal(header.criteria, 'AC-R038-01, AC-R038-02')
    assert.equal(header.issue, '#665')
    assert.match(header['accepted gallery reference'], /^eded158cfd928d382c9a9409e2c372270312741d \(state cards;/)
    assert.equal(result.sources.length, sources.size, 'every source line carries an S-id')
    for (const kind of ['repo', 'base', 'ref']) {
      assert.ok([...sources.values()].some((source) => source.kind === kind), `at least one ${kind}: source`)
    }
    for (const path of [OWNER, SEED, 'src/ui/refinements/movement.tsx', 'src/ui/refinements/workout-card.tsx']) sourceId(path)
  })

  test('AC-R038-01 every claim cites a listed source and every listed source is cited', () => {
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
    }
    for (const id of citations(sectionText('Scope'))) cited.add(id)
    const uncited = [...sources.keys()].filter((id) => !cited.has(id))
    assert.deepEqual(uncited, [], 'every listed source supports at least one claim')
  })

  test('AC-R038-01 every identifier and quoted string a claim names occurs in a source that claim cites', () => {
    const texts = sourceTexts()
    for (const name of CLAIM_SECTIONS) {
      for (const item of bullets(name)) {
        const ids = citations(item)
        const cited = ids.map((id) => squash(texts.get(id)))
        const paths = ids.map((id) => sources.get(id).path)
        const tokens = [
          ...[...item.matchAll(/`([^`]+)`/g)].map((match) => match[1]),
          ...[...item.matchAll(/"([^"]+)"/g)].map((match) => match[1]),
        ]
        for (const token of tokens) {
          if (token.startsWith('/')) continue // routes: held to the router where named
          if (/^scripts\/refinement\//.test(token)) continue // this task's own check target
          if (paths.some((path) => path.endsWith(token))) continue // a cited file by name
          const found = cited.some((source) => source.includes(squash(token)))
          assert.ok(found, `"${name}" names "${token}" but none of ${ids.join(', ')} contains it: ${item}`)
        }
      }
    }
    // The G21 request and the R73 note are quoted from their sources.
    const request = 'Distinguish missing content, blank user notes, loading and failure; verify fixture/catalog identity before diagnosing catalog gaps'
    assert.ok(squash(texts.get('S01')).includes(request), 'S01 states G21')
    assert.ok(squash(sectionText('Scope')).includes(request), 'Scope quotes G21')
    assert.ok(squash(texts.get('S02')).includes('rather than an approved replacement string/hide rule or a started audit'), 'S02 states R73')
  })

  test('AC-R038-01 the inventory holds every guidance and note state the owner draws, in the owner’s words, with missing content, blank notes, loading and failure apart', () => {
    const owner = read(OWNER)
    const inventory = squash(sectionText('State inventory'))
    const items = labelled('State inventory')
    assert.deepEqual(items.map(({ id }) => id), items.map((_, index) => `I${index + 1}`), 'I-items are numbered once, in order')
    assert.ok(items.length >= 12)
    // Every sentence the owner exports for these states is inventoried word for word.
    const constants = [...owner.matchAll(/export const ([A-Z_]+_TEXT) =\s*'([^']+)'/g)]
    assert.ok(constants.length >= 6, 'the owner exports its state words')
    for (const [, name, words] of constants) assert.ok(inventory.includes(`\`${words}\``), `${name} (${words}) is inventoried`)
    // The words drawn from templates and inline are inventoried as the owner writes them.
    for (const words of ['Reading coaching for', 'Coaching for', 'didn’t load', 'Try again', 'Saving…', 'Not saved', 'Notes — ']) {
      assert.ok(owner.includes(words), `the owner draws "${words}"`)
      assert.ok(inventory.includes(`\`${words.trim()}`), `"${words}" is inventoried`)
    }
    assert.ok(read('src/ui/view-state.tsx').includes("SLOW_LOADING_LABEL = 'Taking longer than usual'"))
    // The four kinds G21 names each have their own item.
    const byTitle = (title) => items.find(({ body }) => body.startsWith(title))
    for (const title of ['Missing catalog entry.', 'Blank user note.', 'Loading.', 'Failure.', 'Blank cues.', 'Blank regression.']) {
      assert.ok(byTitle(title), `the inventory has "${title}"`)
    }
    assert.match(byTitle('Missing catalog entry.').body, /It replaces both I2 and I3/)
    assert.match(inventory, /The guidance states \(I1 to I7\) and the note states \(I8 to I12\) are independent/)
    // Each guidance state the owner switches on is inventoried.
    const view = functionBody(owner, 'GuidanceView')
    for (const status of ['loading', 'error', 'ready']) assert.match(view, new RegExp(`case '${status}'`))
  })

  test('AC-R038-01 fixture and catalog identity is recomputed from the fixtures and the seeded catalog, and is recorded before any catalog gap is diagnosed', () => {
    const { rows, regressions } = seededCatalog()
    const fixtures = fixtureIdentity()
    const { lines } = recordedIdentity()

    // F1: the catalog's identity guarantees.
    assert.equal(rows.size, 140, 'the seed gives the database 140 catalog rows')
    assert.match(text, /The database is given 140 `exercise_definitions` rows by the seed/)
    const migrations = readdirSync(resolve(repo, 'supabase/migrations')).filter((file) => file.endsWith('.sql'))
    for (const file of migrations) {
      assert.doesNotMatch(read(`supabase/migrations/${file}`), /insert into public\.exercise_definitions/i, `${file} inserts no catalog row`)
    }
    assert.match(read('supabase/migrations/20260921000003_workout_domain.sql'), /exercise_id text not null\s+references public\.exercise_definitions \(id\),/)
    assert.match(read('supabase/migrations/20260921000000_catalog_domain.sql'), /'create policy %I on public\.%I for select to authenticated using \(true\)'/)
    assert.match(read('src/data/exercises.ts'), /if \(row === undefined\) return ok\(null\)/)

    // F2 to F4: every fixture slug, with its catalog status and its library answer.
    for (const id of ['F2', 'F3', 'F4']) {
      const recorded = lines.get(id)
      const literalSlugs = [...fixtures[id].keys()]
      assert.deepEqual(recorded.map(({ slug }) => slug).sort(), [...literalSlugs].sort(), `${id} lists exactly the fixture's movements`)
      for (const { slug, inCatalog, row, answer } of recorded) {
        assert.equal(inCatalog, rows.has(slug), `${id}: \`${slug}\` is ${rows.has(slug) ? '' : 'not '}a catalog id`)
        if (row !== undefined) assert.ok(rows.has(row), `${id}: catalog row \`${row}\` exists`)
        assert.equal(answer, fixtures[id].get(slug), `${id}: \`${slug}\` answers ${fixtures[id].get(slug)}`)
      }
    }
    // The nine template stations of the ten-station circuit.
    assert.ok(fixtures.cardsData.includes('Array.from({ length: 10 }'))
    assert.ok(fixtures.cardsData.includes('`station-${index + 1}-${LONG_MOVEMENT_ID}`'))
    assert.ok(![...rows.keys()].some((id) => id.startsWith('station-')), 'no catalog id is a station')
    assert.match(squash(sectionText('Fixture and catalog identity')), /The nine `station-` movements of the ten-station circuit: not in the catalog; library answer: no entry\./)
    assert.ok(read('src/dev/gallery-refinement-coaching.tsx').includes('<GalleryCoachingClients catalog={STATES_CATALOG}'))
    assert.ok(read('src/dev/gallery-refinement-coaching.tsx').includes('<LiveCard block={CIRCUIT_BLOCK}'))

    // F5, F6: catalog ids in fixtures still answer synthetically; regressions are ids.
    for (const slug of ['back-squat', 'plank', 'goblet-squat']) assert.ok(rows.get(slug).cues.length > 0, `the catalog's ${slug} has written cues`)
    assert.match(read('supabase/migrations/20260921000000_catalog_domain.sql'), /regression {2}text references public\.exercise_definitions \(id\)/)

    // Identity comes first: inventory, then identity, then the diagnosis, which rests on it.
    const order = ['## State inventory', '## Fixture and catalog identity', '## Catalog content findings'].map((heading) => text.indexOf(heading))
    assert.ok(order.every((index) => index >= 0) && order[0] < order[1] && order[1] < order[2], 'identity is recorded before the catalog findings')
    assert.match(sectionText('Catalog content findings'), /^Diagnosed only after F1 to F7/m)
    const [k1] = labelled('Catalog content findings', 'K')
    assert.match(k1.body, /\(F2 to F5\)/)

    // K2, K3: what the catalog itself answers.
    assert.deepEqual([...rows].filter(([, row]) => row.cues.every((cue) => cue.trim() === '')).map(([id]) => id), [], 'no seeded row has a blank cue list')
    const named = [...regressions.values()].filter((regression) => regression !== null).length
    assert.match(squash(sectionText('Catalog content findings')), new RegExp(`Only ${named} of the ${rows.size} rows name a regression`))
    assert.equal(rows.get('back-squat').regression, 'goblet-squat', 'a regression is stored as a catalog id')
    assert.ok(read(OWNER).includes('{regression ?? NO_REGRESSION_TEXT}'), 'the owner draws the stored regression as it is')
  })

  test('AC-R038-02 movement notes stay outside every guidance state in the owner, and the behavioural proof is a current passing receipt', () => {
    const owner = read(OWNER)
    for (const name of ['CoachingMovementSection', 'CoachingPanel']) {
      const body = functionBody(owner, name)
      const guidance = /\{opened \? \(([\s\S]*?)\) : null\}/.exec(body)
      assert.ok(guidance, `${name} reads guidance only once opened`)
      assert.match(guidance[1], /<Guidance /)
      assert.doesNotMatch(guidance[1], /ExerciseNotesField/, `${name}'s note is not inside the guidance condition`)
      assert.match(body.slice(guidance.index + guidance[0].length), /<ExerciseNotesField exercise=\{exercise\} name=\{name\} \/>/, `${name} draws the note unconditionally after the guidance`)
    }
    assert.doesNotMatch(functionBody(owner, 'GuidanceView'), /[Nn]otes?/, 'no guidance state touches the note')
    assert.doesNotMatch(functionBody(owner, 'Guidance'), /[Nn]otes?/, 'the guidance read touches no note')
    assert.doesNotMatch(functionBody(owner, 'ExerciseNotesField'), /useExerciseDefinitionQuery|Guidance/, 'the note does not wait on the guidance')

    // TASK-005's behavioural case is declared, present and passed on the current test file.
    const manifest = JSON.parse(read('evidence/refinement/task-005/required-cases.json'))
    assert.ok(manifest.checks['check-01'].cases.some((entry) => entry.name === NOTE_CASE), 'TASK-005 declares the note case')
    const receipt = JSON.parse(read('evidence/refinement/task-005/results/check-01.json'))
    assert.equal(receipt.verdict, 'passed')
    assert.equal(receipt.requiredCases.find((entry) => entry.name === NOTE_CASE)?.status, 'passed')
    const target = receipt.targets.find((entry) => entry.path === 'src/ui/group-exercise-coaching.test.tsx')
    const current = createHash('sha256').update(readFileSync(resolve(repo, target.path))).digest('hex')
    assert.equal(target.sha256, current, 'the receipt is for the current test file')
    assert.match(squash(sectionText('Notes availability')), /`AC-R005-01 keeps the note of a movement the library has no entry for, and saves it`/)
  })

  test('AC-R038-02 the hide/replacement/content rule is one exact owner decision with no option pre-selected, and nothing is hidden or reworded', () => {
    const options = sectionText('Options')
    assert.match(options, /^No option is selected\./m)
    assert.match(options, /None proposes\s+wording: any new words are decided under COPY-VOICE/)
    assert.deepEqual(labelled('Options', 'H').map(({ id }) => id), ['H1', 'H2', 'H3', 'H4'])
    assert.deepEqual(labelled('Options', 'Q').map(({ id }) => id), ['Q1', 'Q2'])
    assert.deepEqual(labelled('Options', 'W').map(({ id }) => id), ['W1', 'W2'])
    assert.deepEqual(labelled('Options', 'C').map(({ id }) => id), ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'])
    assert.match(labelled('Options', 'C')[0].body, /The note field stays in every section whatever the guidance answers/)
    assert.doesNotMatch(text, /\b(Selected|Recommended|Chosen|Preferred) (option|rule)\b|\bwe recommend\b/i)

    const decisions = labelled('Open owner decisions')
    assert.deepEqual(decisions.map(({ id }) => id), ['G21-COACHING-EMPTY-RULE'], 'one exact remaining decision')
    const [decision] = decisions
    assert.match(decision.body, /Owner: Eric \(product owner, R73 source\)/)
    assert.match(decision.body, /Decision: choose the rule for empty guidance answers in Coaching and notes \(one of H1 to H4/)
    assert.match(decision.body, /how a regression reads \(Q1 or Q2\)/)
    assert.match(decision.body, /Blocks: any change to whether or how the guidance's empty answers are drawn\. Does not block: the note field/)
    assert.match(read('docs/definitions/clear-refinement-20261103/TASK-037.md'), /\*\*COPY-VOICE\*\*/)

    // No hidden feature: every empty answer is still drawn, and the record claims nothing built.
    assert.equal(header.status, 'definition-only')
    assert.equal(header['implementation claim'], 'none')
    const owner = read(OWNER)
    for (const name of ['NO_DEFINITION_TEXT', 'NO_CUES_TEXT', 'NO_REGRESSION_TEXT']) {
      assert.ok(owner.split(name).length - 1 >= 2, `${name} is defined and still drawn`)
    }
    assert.match(sectionText('Limitations'), /No rule is implemented and no copy is changed/)
    const body = text.slice(text.indexOf('\n## '))
    for (const sentence of squash(body).split(/(?<=\.)\s/).filter((s) => /\bimplement(ed|ation|ing|s)?\b/i.test(s))) {
      assert.match(sentence, /\b(no|not|none|never|future)\b/i, `implementation sentence without a negation: ${sentence}`)
    }
  })

  test('AC-R038-02 the follow-up stays in source-to-task traceability, and the accepted cards state draws the actual owner without claiming the inventory', () => {
    const trace = sectionText('Traceability')
    for (const id of ['R73', 'G21', 'G11', 'REQ-038', 'AC-R038-01', 'AC-R038-02', 'TASK-038', '#665', 'G21-COACHING-EMPTY-RULE', ...EVIDENCE_IDS]) {
      assert.ok(trace.includes(id), `Traceability names ${id}`)
    }
    assert.match(trace, /scripts\/refinement\/task-038-definition\.test\.mjs/)

    const texts = sourceTexts()
    assert.match(texts.get('S01'), /### G21: Review empty states\/rules, starting with repeated missing-coaching messages\./)
    assert.match(texts.get('S02'), /### R73 — Empty-state pass and rules/)
    const coverage = JSON.parse(texts.get('S03'))
    const requirement = coverage.requirements.find((entry) => entry.id === 'REQ-038')
    assert.ok(requirement, 'the accepted coverage map lists REQ-038')
    assert.deepEqual(requirement.states, ['cards'])
    assert.deepEqual(requirement.sharedOwners, ['src/ui/refinements/movement.tsx', 'src/ui/refinements/workout-card.tsx'])
    assert.deepEqual(requirement.semanticVariables, [])
    assert.deepEqual(requirement.acceptanceCriterionIds, ['AC-R038-01', 'AC-R038-02'])
    assert.equal(requirement.limit, 'Grouped appearance is demonstrated. Missing coaching/empty/error inventory and rules remain definition work.')
    assert.match(texts.get('S04'), /\| REQ-038 \| cards \| src\/ui\/refinements\/movement\.tsx; src\/ui\/refinements\/workout-card\.tsx \|/)
    assert.match(texts.get('S05'), /\/ TASK-038 \| REQ-038 \|/)

    // The cards state draws the actual grouped owner in the card's coaching slot.
    const cards = read('src/dev/gallery-refinement-cards.tsx')
    assert.ok(cards.includes("import { GroupExerciseCoaching } from '../ui/exercise-coaching'"))
    assert.match(cards, /coaching=\{grouped \? <GroupExerciseCoaching /)
    assert.match(read('src/ui/refinements/workout-card.tsx'), /coaching\?: ReactNode/)
    assert.match(sectionText('Gallery disposition'), /This task changes no gallery state, owner,\s+CSS or token/)
  })
})
