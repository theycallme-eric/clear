// TASK-115 (A3 task 15b; REQ-039, REQ-040): the pre-UAT closure of the body
// clear-gallery-adoption-20261113. No feature. It consumes the task-owned proof
// and adds no shared checker (TASK-039's providers are unchanged):
//   - the A3 body record and the shared checker in final mode over the
//     receipts of TASK-103 to TASK-114 and TASK-116 to TASK-121;
//   - the integration ancestry, with main and the old build untouched;
//   - TASK-121's definition-record receipts and the three record checks;
//   - the body-level ledger rerun (the A3 test ledger tool, --now at the tip),
//     its helper recheck and the round-07 S6 recheck;
//   - the end-of-run comparison of the 26 gallery states, each capture
//     re-hashed from the evidence store, and the recaptured owners' receipts;
//   - the UAT list for Eric.
//
// Run through the shared guard:
//   node scripts/refinement/run-required-check.mjs --task TASK-115 --check check-01 -- \
//     node --test scripts/refinement/task-115-closure.test.mjs
//
// Everything that depends on the out-of-Git evidence store fails closed without it.

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { loadBody, resolveObjectStore } from './lib/references.mjs'
import { manifestPathFor, verifyReceipt } from './lib/required-check.mjs'
import { verifyDeliveryEvidence } from './verify-delivery-evidence.mjs'

const HEAVY = 30_000
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const EVIDENCE_ROOT = resolve(repo, 'evidence/refinement')
const OWN = resolve(EVIDENCE_ROOT, 'task-115')
const BODY = 'clear-gallery-adoption-20261113'
const BASE = 'a6cd01c926d516b3c72770b32443ea0dadfe47a9'
const TASK2_FIXES_ON = '2f023b9cf7f2a1659ade911a59a01035d6f1bab2'
const GALLERY = 'bec44545eb982f6dc136a583400f7e314c306d1d'
const MAIN = '03087f7488bee8d7e927534b1b5e656378fe9cb3'
const OLD_GALLERY = 'eded158cfd928d382c9a9409e2c372270312741d'
const OLD_BUILD = '181e5808e5264ab3041a186ca16a8d9f845fe072'
const FINAL_TASKS = ['TASK-103', 'TASK-104', 'TASK-105', 'TASK-116', 'TASK-117', 'TASK-106', 'TASK-107', 'TASK-108', 'TASK-109', 'TASK-110', 'TASK-118', 'TASK-111', 'TASK-112', 'TASK-119', 'TASK-113', 'TASK-114', 'TASK-120', 'TASK-121']
const RECAPTURED = ['TASK-105', 'TASK-106', 'TASK-107', 'TASK-108', 'TASK-110', 'TASK-111', 'TASK-116', 'TASK-117']
const DEFINITION_TASKS = ['TASK-035', 'TASK-037', 'TASK-038']
const DISPOSITIONS = new Set(['carried', 'rewritten', 'ported', 'retired'])
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const git = (args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim()
const gitOk = (args) => spawnSync('git', args, { cwd: repo, stdio: 'ignore' }).status === 0
const json = (path) => JSON.parse(readFileSync(path, 'utf8'))

function receiptProblems(task, checkId) {
  const manifestPath = manifestPathFor(EVIDENCE_ROOT, task)
  const manifest = json(manifestPath)
  const check = manifest.checks[checkId]
  assert.ok(check, `${task} declares ${checkId}`)
  return verifyReceipt({ cwd: repo, evidenceRoot: EVIDENCE_ROOT, task, checkId, check, manifestPath })
}

function storePath(identity) {
  const store = resolveObjectStore({ cwd: repo })
  assert.equal(store.problem, undefined, `the evidence store is available: ${store.problem}`)
  assert.ok(identity.startsWith('store:'), `${identity} is a store identity`)
  return join(store.dir, identity.slice('store:'.length))
}

describe('TASK-115 A3 body record and aggregate evidence closure', () => {
  test('TASK-AC-B1DAECFD68F1 the A3 body record names base a6cd01c9, gallery bec4454, Foundation 0.14.3, and main 03087f7, gallery eded158 and the old build 181e580 as history only', () => {
    const { record, problems } = loadBody({ evidenceRoot: EVIDENCE_ROOT, body: BODY })
    assert.deepEqual(problems, [])
    assert.equal(record.integrationBase.commit, BASE)
    assert.match(record.integrationBase.role, /a6cd01c9 on 2f023b9/)
    assert.equal(record.acceptedGallery.commit, GALLERY)
    assert.deepEqual(record.foundation, { path: 'src/design-system', version: '0.14.3' })
    const historical = Object.fromEntries(record.historicalComparisons.map((entry) => [entry.commit, entry]))
    for (const commit of [MAIN, OLD_GALLERY, OLD_BUILD]) {
      assert.ok(historical[commit], `${commit} is recorded`)
      assert.equal(historical[commit].role, 'historical-comparison')
    }
    assert.ok(gitOk(['merge-base', '--is-ancestor', TASK2_FIXES_ON, BASE]), 'a6cd01c9 is the task 2 review fixes on 2f023b9')
    assert.ok(gitOk(['merge-base', '--is-ancestor', GALLERY, BASE]), 'the base was cut from bec4454')
  })

  test('AC-GAL-07 TASK-AC-B1DAECFD68F1 the final evidence check consumes the receipts of TASK-103 to TASK-114 and TASK-116 to TASK-121', { timeout: HEAVY }, () => {
    const result = verifyDeliveryEvidence({ cwd: repo, body: BODY, mode: 'final', tasks: FINAL_TASKS })
    assert.deepEqual(result.problems, [])
    assert.equal(result.ok, true)
    assert.deepEqual(result.report.tasks.map(({ task, ok }) => [task, ok]), FINAL_TASKS.map((task) => [task, true]))
    assert.equal(result.report.acceptedGallery.commit, GALLERY)
    assert.equal(result.report.baseline.foundation.unchangedFromBase, true)
  })

  test('TASK-AC-8E85446CC848 AC-R040-01 the branch still descends from a6cd01c9; the old build 181e580 is not merged and main carries none of this body', () => {
    assert.ok(gitOk(['merge-base', '--is-ancestor', BASE, 'HEAD']), 'HEAD descends from a6cd01c9')
    assert.ok(gitOk(['cat-file', '-e', `${OLD_BUILD}^{commit}`]), 'the old build commit is still available')
    assert.equal(gitOk(['merge-base', '--is-ancestor', OLD_BUILD, 'HEAD']), false, 'the old build is source material only, never merged')
    for (const ref of ['refs/remotes/origin/main', 'refs/heads/main']) {
      if (!gitOk(['rev-parse', '--verify', '--quiet', ref])) continue
      assert.equal(gitOk(['merge-base', '--is-ancestor', BASE, ref]), false, `${ref} carries no A3 work`)
    }
    if (gitOk(['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/build/clear-refinement-2026-11-04'])) {
      assert.equal(git(['rev-parse', 'refs/remotes/origin/build/clear-refinement-2026-11-04']), OLD_BUILD, 'the old build branch is untouched')
    }
  })
})

describe('TASK-115 consumes TASK-121’s definition-record receipts', () => {
  test('TASK-AC-99A513AC101C TASK-121’s receipt and the three definition-record checks are current and passing at the end', () => {
    assert.deepEqual(receiptProblems('TASK-121', 'check-01'), [])
    for (const task of DEFINITION_TASKS) assert.deepEqual(receiptProblems(task, 'check-01'), [], `${task} check-01`)
    // No checker or definition test changed after TASK-121's merge. The only record change is the one re-record
    // TASK-121's rules allow (a repo: hash): TASK-038 pins src/dev/gallery-refinement-scenes.tsx, which the D3
    // gallery fix (repair round 1) changed.
    const checkers = git(['diff', '--name-only', '9a1569b1580c1fa5ffe26b0fb1d0d401259249bf', 'HEAD', '--',
      'scripts/refinement/verify-definition-record.mjs', 'scripts/refinement/lib',
      ...DEFINITION_TASKS.map((task) => `scripts/refinement/${task.toLowerCase()}-definition.test.mjs`)])
    assert.equal(checkers, '')
    const records = git(['diff', '-U0', '9a1569b1580c1fa5ffe26b0fb1d0d401259249bf', 'HEAD', '--', 'docs/definitions'])
      .split('\n').filter((line) => /^[-+]/.test(line) && !/^(---|\+\+\+) /.test(line))
    assert.deepEqual(records.map((line) => line.replace(/sha256 `[0-9a-f]{64}`/, 'sha256 `…`')), [
      '-- `repo:src/dev/gallery-refinement-scenes.tsx` sha256 `…`. S20: the cards state (`GalleryMovementCards`) draws the real timed cards (the removed `src/dev/gallery-refinement-cards.tsx` drew the old cards state).',
      '+- `repo:src/dev/gallery-refinement-scenes.tsx` sha256 `…`. S20: the cards state (`GalleryMovementCards`) draws the real timed cards (the removed `src/dev/gallery-refinement-cards.tsx` drew the old cards state).',
    ])
  })

  test('TASK-AC-8E85988C2B58 the UAT list names Q-007, every record claim TASK-121 retired and every definition-test assertion it re-pointed', () => {
    const uat = readFileSync(join(OWN, 'UAT-LIST.md'), 'utf8')
    const ledger = json(join(EVIDENCE_ROOT, 'task-121', 'test-ledger.json'))
    assert.match(uat, /Q-007/)
    assert.match(uat, /Save log/)
    for (const claim of ledger.rules.retiredClaims) assert.ok(uat.includes(claim.claim), `retired claim ${claim.claim.slice(0, 80)}`)
    for (const item of ledger.rules.rePointed) assert.ok(uat.includes(item.item), `re-point ${item.item}`)
  })
})

describe('TASK-115 body-level ledger rerun', () => {
  const ledger = json(join(OWN, 'body-ledger.json'))

  test('TASK-AC-B1417172F706 every build test on 181e580 is carried, rewritten, ported or retired, none pending, deferred or unplaced, at a recorded tip', () => {
    assert.equal(ledger.summary.unplaced, 0)
    assert.ok(ledger.tests.length > 0)
    const off = ledger.tests.filter((row) => !DISPOSITIONS.has(row.disposition))
    assert.deepEqual(off, [])
    for (const row of ledger.tests.filter((entry) => entry.disposition !== 'carried')) assert.match(row.reason ?? '', /\S/, `${row.file} :: ${row.test} has a note`)
    assert.equal(ledger.ranAt.build, OLD_BUILD)
    assert.match(ledger.ranAt.now, /^[0-9a-f]{40}$/)
    assert.ok(gitOk(['merge-base', '--is-ancestor', ledger.ranAt.now, 'HEAD']), 'the ledger ran at an ancestor of HEAD')
    const files = [...new Set(ledger.tests.map((row) => row.file))]
    const changed = git(['diff', '--name-only', ledger.ranAt.now, 'HEAD', '--', ...files])
    assert.equal(changed, '', 'no build test file changed after the ledger ran')
  })

  test('TASK-AC-B1417172F706 each shared helper a carried test reaches that differs from the build’s is rechecked and recorded with its result', () => {
    const recheck = ledger.helperRecheck
    assert.ok(recheck.helpers.length > 0)
    for (const helper of recheck.helpers) {
      assert.match(helper.result ?? '', /\S/, `${helper.file}#${helper.helper} has a result`)
      assert.ok(['kept', 'kept (Round 7 locator or wording)', 'recorded by its task'].includes(helper.verdict), `${helper.file}#${helper.helper}: ${helper.verdict}`)
    }
    const own = json(join(OWN, 'test-ledger.json'))
    assert.equal(own.rules.helperRecheck.changedHelpers, recheck.helpers.length)
  })

  test('TASK-AC-B43450BD688A the eleven S6 bodies dropped nothing the later task owns', () => {
    const own = json(join(OWN, 'test-ledger.json'))
    const rows = own.rules.s6Recheck
    assert.equal(rows.length, 11)
    for (const row of rows) {
      assert.equal(row.droppedLaterTaskWork, false, `${row.file} :: ${row.test}`)
      assert.match(row.result, /\S/)
    }
  })
})

describe('TASK-115 end-of-run comparison and recaptures', () => {
  test('TASK-AC-495C349983AC the comparison page shows all 26 states at 320 and 390 beside their real routes, each capture re-hashed and every difference labelled or listed as unintended', { timeout: HEAVY }, () => {
    const page = json(join(OWN, 'comparison', 'receipt.json'))
    assert.equal(page.states, 26)
    assert.deepEqual(page.widths, [320, 390])
    const html = readFileSync(join(OWN, 'comparison', 'index.html'))
    assert.equal(sha256(html), page.pageSha256)
    const receipts = readdirSync(join(OWN, 'comparison', 'receipts')).filter((name) => name.endsWith('.json'))
    assert.equal(receipts.length, 52)
    for (const name of receipts) {
      const receipt = json(join(OWN, 'comparison', 'receipts', name))
      assert.equal(receipt.gallery, GALLERY)
      assert.ok(existsSync(storePath(receipt.endOfRunGallery.file)), `${name}: the end-of-run gallery view is in the store`)
      const primary = receipt.owners.filter((owner) => owner.primary)
      assert.ok(primary.length > 0, `${name}: a primary owner`)
      for (const owner of receipt.owners) {
        assert.equal(sha256(readFileSync(join(repo, owner.receipt))), owner.receiptSha256, `${name}: ${owner.receipt} unchanged since the page`)
        for (const moment of owner.moments) {
          for (const capture of [...moment.gallery, ...moment.route]) assert.equal(sha256(readFileSync(storePath(capture.file))), capture.sha256, capture.file)
        }
      }
      assert.ok(primary.some((owner) => owner.moments.some((moment) => moment.gallery.length > 0)), `${name}: gallery side`)
      assert.ok(primary.some((owner) => owner.moments.some((moment) => moment.route.length > 0)), `${name}: route side`)
      for (const difference of receipt.labelled) assert.match(difference.criterion, /\S/)
    }
  })

  test('AC-R039-02 the recaptured owners’ parity receipts are current and passing, and every capture they name is in the store with its hash', { timeout: HEAVY }, () => {
    for (const task of RECAPTURED) {
      assert.deepEqual(receiptProblems(task, 'parity'), [], `${task} parity`)
      const dir = join(EVIDENCE_ROOT, task.toLowerCase(), 'parity')
      for (const name of readdirSync(dir).filter((file) => file.endsWith('.json'))) {
        const visit = (node) => {
          if (Array.isArray(node)) return node.forEach(visit)
          if (node === null || typeof node !== 'object') return
          if (typeof node.file === 'string' && node.file.startsWith('store:') && typeof node.sha256 === 'string') {
            assert.equal(sha256(readFileSync(storePath(node.file))), node.sha256, `${task} ${name} ${node.file}`)
          }
          Object.values(node).forEach(visit)
        }
        visit(json(join(dir, name)))
      }
    }
  })

  test('TASK-AC-C8FAD22523F1 the whole e2e run is recorded: every one of the 63 old-build e2e files and every failure has an outcome', () => {
    const own = json(join(OWN, 'test-ledger.json'))
    const run = own.rules.wholeE2eRun
    assert.equal(run.oldBuildE2eFiles.length, 63)
    for (const file of run.oldBuildE2eFiles) assert.match(file.outcome, /\S/, file.path)
    // Repair round 3 (D8): a case not run is accepted only where the row quotes Eric's decision; the backend lane in V2
    // verification runs only task-047/048 (PRE-001), and a row says so only with the verification logs.
    const D8 = 'not run: no backend lane; accepted unrun by the owner (D8)'
    const V2_LANE = 'passes in V2 verification (backend lane, PRE-001)'
    const DIAGNOSTIC = 'not run: diagnostic only (skipped unless CLEAR_RUN_SOURCEGRAPHIC_DIAGNOSTIC=1)'
    const accepted = (row) => {
      if (row.outcome === D8) assert.match(row.decision ?? '', /"Accept unrun, list for UAT \(Recommended\)"/, `${row.case} quotes D8`)
      if (row.outcome === V2_LANE) {
        assert.match(row.case, /^e2e\/refinement\/task-04[78]\.spec\.ts:/, `${row.case}: only task-047/048 run in the backend lane`)
        assert.match(row.note ?? '', /verify\.log/, `${row.case} cites the verification logs`)
      }
      if (row.outcome === DIAGNOSTIC) assert.match(row.case, /^e2e\/effects\/crt-source-graphic-proof\.spec\.ts:/, row.case)
    }
    for (const failure of run.failures) {
      assert.ok(['passes after update', 'passes on rerun', 'retired with a reason', D8, V2_LANE].includes(failure.outcome), `${failure.case}: ${failure.outcome}`)
      accepted(failure)
      if (failure.outcome !== 'passes on rerun') assert.match(failure.change ?? failure.note ?? '', /\S/, `${failure.case} says what changed or why it is reported`)
    }
    assert.equal(run.failures.length, run.totals.failed)
    // The totals and the outcome counts add up; every case the run did not run has its own outcome.
    const tally = (rows) => rows.reduce((counts, row) => ({ ...counts, [row.outcome]: (counts[row.outcome] ?? 0) + 1 }), {})
    assert.equal(run.totals.passed + run.totals.failed + run.totals.skipped + run.totals.didNotRun, run.totals.cases)
    assert.deepEqual(tally(run.failures), run.byOutcome)
    assert.equal(run.notRun.cases.length, run.totals.skipped + run.totals.didNotRun)
    assert.deepEqual(tally(run.notRun.cases), run.notRun.totals.byOutcome)
    for (const row of run.notRun.cases) {
      assert.ok([D8, 'passes on rerun', DIAGNOSTIC].includes(row.outcome), `${row.case}: ${row.outcome}`)
      accepted(row)
      assert.match(row.note ?? '', /\S/, `${row.case} says why`)
    }
    for (const file of run.oldBuildE2eFiles) {
      assert.doesNotMatch(file.outcome, /skipped \(backend lane\)|needs backend lane(?!; accepted unrun, D8)/, `${file.path}: no case rests on the backend lane alone`)
    }
    // Repair round 1 (D2): the 73 retired old look cases each have a ledger row quoting the decision and a UAT entry.
    const uat = readFileSync(join(OWN, 'UAT-LIST.md'), 'utf8')
    const d2 = own.entries.filter((entry) => entry.disposition === 'retired' && /Retire, list for UAT/.test(entry.decision ?? ''))
    assert.equal(d2.length, 73)
    for (const entry of d2) {
      assert.match(entry.oldBuild ?? '', /\S/, `${entry.file} :: ${entry.test} records its old-build result`)
      assert.ok(uat.includes(`\`${entry.file}\` (old line ${entry.oldLine}`), `${entry.file}:${entry.oldLine} is on the UAT list`)
    }
    // Repair round 3 (D8): the UAT list quotes D8 and names every file it covers, with its count.
    assert.ok(uat.includes('"Accept unrun, list for UAT (Recommended)"'), 'D8 is quoted on the UAT list')
    const d8Files = tally([...run.notRun.cases, ...run.failures].filter((row) => row.outcome === D8).map((row) => ({ outcome: row.case.split(':')[0] })))
    for (const [file, count] of Object.entries(d8Files)) assert.ok(uat.includes(`\`${file}\`: ${count}`), `${file} (${count}) is on the UAT list`)
    // Repair round 2 (D6): contained-shell's clear and vapour skin cases, retired on D2's terms.
    const d6 = own.entries.filter((entry) => entry.disposition === 'retired' && /Yes, retire both \(Recommended\)/.test(entry.decision ?? ''))
    assert.equal(d6.length, 2)
    for (const entry of d6) {
      assert.match(entry.oldBuild ?? '', /\S/, `${entry.file} :: ${entry.test} records its old-build result`)
      assert.ok(uat.includes(`\`${entry.file}\` (old line ${entry.oldLine}`), `${entry.file}:${entry.oldLine} is on the UAT list`)
    }
  })
})

describe('TASK-115 UAT list for Eric', () => {
  const uat = readFileSync(join(OWN, 'UAT-LIST.md'), 'utf8')

  test('TASK-AC-5BC37E04FCFD the UAT list names every R7-2 and R7-3 retirement with what supersedes it, and the carried “does not call an early finish a cap” body', () => {
    const r73 = [
      'ends on its own when the block’s seconds have passed, and only then offers the result',
      'shows the elapsed time when the user finishes early, not the cap',
      'comes back into the completion state when the buzzer went while it was away',
      'timed-result-dialog.test.tsx',
      'task-046.spec.ts',
    ]
    for (const item of r73) assert.ok(uat.includes(item), item)
    assert.match(uat, /does not call an early finish a cap/)
    for (const task of ['task-108', 'task-110']) {
      const ledger = json(join(EVIDENCE_ROOT, task, 'test-ledger.json'))
      for (const row of ledger.entries.filter((entry) => entry.disposition === 'superseded' && /R7-2/.test(entry.note ?? '') && /(amrap|emom|for-time)-block\.test/.test(entry.file))) {
        assert.ok(uat.includes(row.test.split(' > ').at(-1)), `${task} R7-2: ${row.test}`)
      }
    }
  })

  test('TASK-AC-8E85988C2B58 the UAT list carries the owner items first: the Focus control’s name, the Echo inside dialogs, X5 and the retirements to confirm', () => {
    const owner = uat.slice(0, uat.indexOf('\n## ', uat.indexOf('## Owner items') + 1))
    for (const item of ['Q-007', 'Change focus', 'Echo', 'X5']) assert.ok(owner.includes(item), item)
  })
})
