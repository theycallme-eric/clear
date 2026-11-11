# TASK-042 — Close the aggregate delivered-source evidence package (#668)

Body `clear-refinement-v2-20261109b`, attempt 1, base `46cb82f` (#724, TASK-048 merged; merge-base
with `origin/build/clear-refinement-2026-11-04` confirmed). This is the task-owned progress note, the
approved exception to the shared daily journal for this body. Only TASK-042 writes this file.

## Intended outcome

REQ-039 (AC-R039-01..03, AC-GAL-01..08), role independent, explicit non-gallery disposition
(accepted gallery `eded158cfd928d382c9a9409e2c372270312741d`; REQ-039 is "explicit non-gallery
disposition" in the accepted coverage map). Aggregate proof closure after every completion owner
delivered: consume TASK-039's providers and each owner's committed task-local receipts, and verify
them against the approved criterion/journey identities, source hashes, the accepted gallery and the
real routes. No product code, no new shared checker, no re-run of any earlier check, no new visual
review.

## Changes

- `scripts/refinement/task-042-evidence-closure.test.mjs` (node:test, 16 cases, each named with its
  criterion). It consumes, and does not reimplement:
  - the shared checker `verify-delivery-evidence.mjs`, spawned in final mode over the 45 delivery
    tasks (every approved task except setup-only TASK-039 and this task), plus a run proving final
    mode refuses TASK-039;
  - `verifyReceipt` for every check a criterion, journey or cited case is closed by;
  - `verifyReferences` for the accepted-gallery reference (coverage map revision 6, REUSE.md,
    LOGGING-FIELDS.md, tokens.css, FINAL-POLISH-ACCEPTANCE.md), byte for byte from the store;
  - `verifyDefinitionRecord`, `parseRecord` and `readBaseBlobs` for the definition records.
  It also reads the approved requirements handoff (`APPROVED_HANDOFF.json`, pinned sha256
  `a8e1b591…`, requirements set `93cf163b…` = `BODY.json`) through the same Runner V2 project layout
  the store uses (`projectFromWorktree`). Like the store, it fails closed outside that layout.
- `evidence/refinement/task-042/required-cases.json`: check-01 (node-test, delivery), 16 exact
  cases, all 11 criteria.
- `evidence/refinement/task-042/source-map.json`: the final criterion → journey → completion owner →
  real route → gallery state/URL → shared owner → executed case map. It holds:
  - 32 journeys, with entry state/action, expected visible result, owner check and the routes its
    spec visits;
  - 202 criteria, each with its approved verification checks;
  - 26 accepted states, with their consumers and specimen cases;
  - 16 logging contexts, 6 field meanings, 4 skins, P01–P05, 8 visual targets and 7 evidence kinds;
  - 3 definition records, at their delivered commits;
  - 47 task citations.

  The source-map case re-derives it from the authorities (the derivation block inside the test
  file) and requires deep equality. The map was written by a scratch script that evaluated that
  same block; the script was deleted afterwards.
- `evidence/refinement/task-042/results/check-01.json`: the guard's receipt.

## Criterion → evidence consumed

| Criterion | Case(s) | Evidence consumed |
| --- | --- | --- |
| AC-R039-01 | final-mode; journeys; criteria; source map; definition records | Shared checker in final mode over 45 tasks: PASSED (base `03087f7` ancestor, Foundation 0.14.3 unchanged, 3 references verified). All 32 journeys have one completion owner, and the owner's approved journey command equals its manifest command. Those checks are Playwright and their specs visit real routes. All 141 user-facing criteria sit in exactly one journey with that journey's owner. Every approved verification command of all 191 non-TASK-042 obligations maps to a declared check with a current passing receipt. TASK-039's are setup or baseline mode, which final mode runs. |
| AC-R039-02 | delivered captures; evidence kinds | Repair round 1: the hash-only `delivered-captures.json` lists 186 actual-app after attachments (146 unique objects, about 240 MB, in the evidence store), each with its revision, case, criteria, viewport/skin and V/P before reference or stand-in. The case re-hashes each object from the store. Receipts bind HEAD blobs, the installed runners and the approved commands. No binaries are committed. Geometry: TASK-041 long logs/rhythm, TASK-007 whole frame, TASK-014 Undo edge. Phase: TASK-008, TASK-033. Real write/read/reload: TASK-047 and TASK-048 backend-lane cases, all passed, none skipped (consumed, not re-run). Error/retry: TASK-019, TASK-047. Reduced motion: TASK-008, TASK-033. |
| AC-R039-03 | shared implementations / format | No route root (`/`, `/onboarding`, `/workout`, `/generate`, `/review`, `/history`, `/history/:id`, `/summary`) reaches `src/dev`, `src/test` or a test file. Each of the 26 states' gallery module and one of its routes reach the same consumer files. Every manifest and receipt is in TASK-039's rehearsed schema. Nothing under `evidence/refinement` is another format except this task's source map, a traceability record. |
| AC-GAL-01 | refinement records | Every user-facing criterion has a requirement, journey/owner, real route, state(s) in `REFINEMENT_STATES`, `/gallery/refinements?state=…` URL and existing shared owner; `#Symbol` owners are exported. The one user-facing non-gallery requirement, REQ-031, is closed by JOURNEY-031's entry state and TASK-047's real-route cases. |
| AC-GAL-02 | owners and variables | All 16 accepted declarations in `tokens.css` keep their accepted values, and 3 were added. No shipped source outside `tokens.css` redeclares them. The only dialog renderer new since the base is `LoggingOverlay`, which every logging consumer imports. The timed blocks use `TimedResultDialog` and `DeadlineTimer`. `src/design-system` is byte-unchanged. |
| AC-GAL-03 | visual targets | Balanced dialog, X header, rhythm (TASK-041). Full timer bodies (TASK-007). Compact equipment (TASK-002). Rep-first ladders (TASK-012, TASK-013). Quiet Undo (TASK-014). Soft vignette (TASK-008, TASK-033). All are route cases, not gallery cases, with current passing receipts. |
| AC-GAL-04 | P01–P05 | P01/P03: TASK-041 "JOURNEY-018 long logs on /workout phone-320" with TASK-018 scroll cases. P02: TASK-041 "JOURNEY-018 keyboard and focus…" with TASK-018 "intentional keyboard focus is kept". P04: TASK-014 check-02 phone-320/390 Undo-edge cases. P05: TASK-008 check-02 touch phase, dialog portal, EMOM/cap eligibility and reduced motion. Each owner is drawn by `/workout`, and each spec asserts the P-id by name. |
| AC-GAL-05 | 16 contexts, 4 skins | Each context has: its accepted LOGGING-FIELDS row, field-owner files, a route consumer reaching `LoggingOverlay` and drawn by its route, and three passing cases (TASK-019, its family owner 043/044/045/046/021, and TASK-041). Each skin (from Foundation `SKINS`) has TASK-041 `/workout` plus TASK-043..046 gallery cases. Meanings: TASK-017 helper removal; `rest-days.ts` unchanged from base; correction/clear (TASK-043, TASK-030); null versus zero (TASK-030, TASK-047); effort versus feeling (TASK-030, TASK-045); narrow, error, retry, keyboard and reduced motion (TASK-019, TASK-041). |
| AC-GAL-06 | states and specimens | The repository's 26 states equal the accepted set exactly. Each has a named title, consumers and at least one executed Playwright specimen case. Every specimen case passed in a current receipt. Each requirement's application owners are imported by one of its states. Registry links resolve. |
| AC-GAL-07 | matrix | The coverage map is revision 6 at the integration base: 40 requirements, 162 criteria, P01–P05, and every requirement has states or a non-gallery disposition. Every journey has route cases besides its gallery cases. Persistence is closed by 2 backend-lane cases each for TASK-047 and TASK-048. Their gallery cases are memory-only, and no gallery module imports a data client. |
| AC-GAL-08 | citations | Every approved task body (47) cites `eded158…` with a stable state or a non-gallery disposition. `REFERENCE.json` and `BODY.json` pin the commit. Each task's delivered evidence (manifest, journal or definition) carries the citation or its gallery disposition, and none rests on a localhost link. |

## Determinations

- **Definition records TASK-035/037/038.** Final mode accepts their check-01 receipts, because the
  test files and manifests are unchanged. Their `repo:` source pins are partly stale on today's tree:
  TASK-035 1 of 4, TASK-037 15 of 32 (including `logging-overlay.tsx`, `set-logger.tsx`,
  `timed-result-log.tsx`, `ladder-block.tsx`, `set-effort.tsx` and the four block files), and
  TASK-038 3 of 14. Later approved tasks edited those files. Closure therefore verifies three
  things:
  - each record is unchanged since its delivered commit (`6c44148`, `9584dc9`, `7b3da92`), and
    that commit is in HEAD's history;
  - every `repo:` source verifies byte for byte at that commit;
  - the shared checker on today's tree reports nothing except `repo:` hash mismatches, so
    structure, `base:` and `ref:` sources all hold.

  The records and their approvals are not edited. Re-pinning them, or adding a commit-pinned
  source kind, would be a shared-verifier change. That is an owner decision; see the open items.
- **Artifact path/hash (AC-R039-02).** Attempt 1 claimed that receipts satisfy "artifact
  path/hash" for measured evidence but not for image bytes, and left AC-R039-02 as an open item.
  The reviewer rejected that. It is superseded by repair round 1 (below): the delivered-revision
  route captures and measurements are now retained by hash in
  `evidence/refinement/task-042/delivered-captures.json`, with their bytes in the evidence store.
- **Backend-lane receipts (TASK-047/048).** Consumed as committed. They were not re-run here, and
  credentials are absent in worktrees. Each receipt shows both backend-lane cases passed, 5/5 and
  6/6 executed, none skipped.
- **Limit of receipt currency.** A current receipt proves that its spec and manifest bytes are
  unchanged and that its required cases passed when it ran. It does not hash product source. The
  Vitest checks are re-executed at the final revision by `npm test`. The Playwright checks are not
  re-executed here, by design (consume, don't re-run). Their currency against later product edits
  rests on the cross-task rule (an editor re-runs every affected owner's spec) and on per-merge
  controller verification. TASK-039's receipt schema cannot mechanically prove more.

## Gaps found

None in the sense of a criterion without a current executed proof. Every approved verification
command of every delivered criterion maps to a current passing receipt. Precise observations (no
fix needed in this task):

- TASK-030 check-01 lists AC-R030-03 as an approved verification command but does not declare it
  in its manifest `criteria`. check-02 does declare it and passes. This is a manifest annotation
  only, and `required-cases.json` must not be edited.
- TASK-031, TASK-032 and TASK-034's own manifests and journals do not quote `eded158` by hash.
  Their approved issue bodies do. Their journals record the gallery disposition: non-gallery, "not
  applicable to this task's deliverable", and the `?state=preparation` reading. REQ-032 and
  REQ-034's states are closed by TASK-048 and TASK-022, which cite the commit.
- `src/ui/refinements/equipment-assets.ts` is the gallery's inventory record. No route imports it.
  The `assets` state's route consumers are `movement.tsx` and `state/onboarding.ts`'s `EQUIPMENT`.
  This is consistent with its header ("presentation record only").
- `src/dev/gallery-registry.test.tsx` links only two refinement states, and
  `gallery-route.test.tsx` none. The accepted-state, link and shared-owner checks live in each
  owner's Vitest and Playwright tests and in this closure's AC-GAL-06 case.

## Failures and corrections

- First run: 5 of 16 failed, all from my own assumptions, none from delivered evidence:
  - "/workout" is shorter than my 10-character field check;
  - TASK-039's obligations include its setup bootstrap check, not only baseline mode;
  - the manifest commands quote `--testNamePattern "a|b"`, so they are now compared word by word;
  - `equipment-assets.ts` is gallery-only (see above);
  - REQ-019's owners are now required per requirement rather than per state.

  After these corrections, 16 of 16 passed.
- Mutation check (reverted at once): with a byte appended to `e2e/refinement/task-041.spec.ts` and
  a completion owner changed in the source map, 9 cases failed. Restored by `git checkout` and a
  copy-back; the tree was verified clean.
- Before handback: the provider-format case would have rejected `source-map.json` once it is
  committed, so the case now admits exactly that one file. It reads tracked and untracked files
  alike, so the case gives the same answer before and after the controller's commit.

## Verification (this tree)

- Guard: `node scripts/refinement/run-required-check.mjs --task TASK-042 --check check-01 -- node
  --test scripts/refinement/task-042-evidence-closure.test.mjs` — PASSED, exit 0; 16 total, 16
  executed, 16 passed, 0 failed, 0 skipped.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode
  final --tasks <45 tasks: TASK-001..038, 041, 043..048>` — PASSED, exit 0:
  - HEAD `46cb82f` descends from `03087f7`, and Foundation 0.14.3 is unchanged;
  - accepted-gallery 1193 files (94 staged, 1099 from base), phosphor-echo 5, historical 3;
  - 45 of 45 tasks have "current passing receipts", and there are no problems.
- The same checker with `--tasks TASK-039` returns REJECTED: "declares only setup checks".
- `npx eslint scripts/refinement/task-042-evidence-closure.test.mjs`: clean.
- `npx vitest run`: 276 files, 6,391 tests passed, exit 0.
- `npm run build`: exit 0. `npm run lint:ds`: exit 0. `npx tsc --noEmit`: exit 0.
- `npm ci` was run first in this worktree, because `node_modules` was absent.

## Open owner items and UAT index (links, not copies)

- Raised by this closure:
  1. (Closed in repair round 1: AC-R039-02 image hashes are now retained; see below.)
     New: the TASK-041 flake. `e2e/refinement/task-041.spec.ts:1304` ("the ladder clock ran on
     behind its log", allowed 10–11 s) is a known intermittent timing check. It read 12 s in
     about 2 of 8 runs at `c35c785`. The TASK-041 owner should widen or harden it; this task must
     not edit that spec.
  2. Definition-record pins. Either accept "verified at delivered commit + current receipt", or add
     a commit-pinned source kind to the shared verifier.
  3. Whether to re-run every Playwright guard at the final head before release (receipt currency
     limit above).
  4. Whether `gallery-registry.test.tsx` itself should enumerate the 26 accepted states.
- Deferred by the owner (2026-11-11): the five B05 half-sheet visual specs, `ui-polish-b05-sheet-surface`,
  `-scroll-boundaries`, `-unit-fields`, `-generate` and `-header-back`. They are not edited; retire
  or re-baseline them at end-of-build review. See the runner body's `RUNNING-SUMMARY.md`, "Standing
  owner decisions".
- Open definitions:
  - R03-PLACEMENT-CONTENT (TASK-035 record);
  - COPY-APPLY, EFFORT-NUMERIC-READING, COPY-VOICE (TASK-037 record);
  - G21-COACHING-EMPTY-RULE (TASK-038 record);
  - LOAD-RANGE-RULE, LOAD-PER-HAND (TASK-036, `docs/specs/LOAD_GUIDANCE_CONTRACT.md`);
  - the adaptive effort gap (TASK-035 review).
- UAT items per task: `RUNNING-SUMMARY.md`, "UAT items so far" (TASK-013/014/015/016/017/018/019/020/022/024/026/027/028/033/034/038/041/046/047), and each task's own note in this folder.
- Pre-existing, outside scope: the public-gallery heading order, ui-polish-integrated failures,
  stale backend e2e specs and B05 out-of-repo `.evidence` (`RUNNING-SUMMARY.md`, "Open owner
  items").

## Open assumptions

- The approved handoff is read from `<project>/requirements/runs/round-03-gallery-aligned/` and
  pinned by hash. A future successor requirements run would need this pin updated by its own
  approved task.
- The closure runs only where the project evidence store and the requirements run exist (the
  Runner V2 layout), as for every reference-verifying check of this body.

## Next action

The controller commits the candidate and runs the brief's commands.

## Repair round 1 (2026-11-11): stopped, TASK-041 guard failed at the capture revision

The reviewer rejected attempt 1 on AC-R039-02 (`reviews/TASK-042-a1-96232cad0458.json`): no
delivered-revision capture path, sha256 or commit was retained, and the case passed on proxies.
The planned repair had five parts:

- re-run the visual guards at HEAD;
- store the after bytes content-addressed at
  `<project>/evidence-store/clear-refinement-20261103/task-042/objects/<sha256>`;
- commit a hash-only `evidence/refinement/task-042/delivered-captures.json`;
- make the AC-R039-02 case re-hash every object and check the revision, coverage and before
  references;
- extend the AC-GAL-02 scan to the 3 app-added variables.

What ran, at HEAD `c35c785` with a clean worktree, each command being an approved guard command,
unchanged, under `v2.mjs with-lock`, one at a time:

- A scratch reporter added through `PW_TEST_REPORTER` wrote the attachments the specs already make
  to scratch storage. It does not change the command, the native JSON report or the receipt.
- TASK-008 check-02 5/5, TASK-033 check-01 8/8, TASK-007 check-02 7/7, TASK-014 check-02 5/5,
  TASK-002 check-02 7/7, TASK-012 check-02 5/5 and TASK-013 check-02 5/5 all PASSED. Each
  rewrote its receipt byte-identical (`git status` clean after each).
- TASK-041 check-01 was REJECTED: 9/10 passed, with one worker. The failing case was "JOURNEY-016
  every /workout logging moment phone-390 touch…", which reported `the ladder clock ran on behind
  its log (12s)` at `e2e/refinement/task-041.spec.ts:1304`, where 10–11 is allowed. The receipt
  was rewritten with verdict `rejected`. This is the same assertion the reviewer saw fail in a
  parallel run.

Disposition: following the controller's rule ("if a guard rewrites another task's receipt it must
be byte-identical; if not, stop and report"), I stopped here:

- TASK-041's receipt was restored from Git with `git checkout --` on that one file, and the
  worktree is clean.
- The rejected run's captures were discarded, and `test-results/` was deleted.
- No object was written to the evidence store.
- The test and required-case changes were drafted outside the worktree and not applied. Without
  TASK-041 captures, JOURNEY-016/017/018 (alignment, gaps, frame) cannot be covered.

At this point AC-R039-02 remained **unmet** (superseded by the resumed section below).

Needed to continue (owner or controller decision):

- either authorize re-running the TASK-041 guard until it reproduces its committed receipt;
- or have TASK-041's owner harden the ladder-clock assertion first. The spec is TASK-041's, not
  this task's.

### Repair round 1, resumed (2026-11-11, controller decision)

The controller judged the TASK-041 failure at l.1304 to be an intermittent timing flake, not a
regression. At `c35c785` it ran 5/5 under `--repeat-each=5`, and the earlier reviewer ran the
single-file command 10/10. The controller authorized up to 3 attempts of the exact TASK-041 guard,
accepting the first that reproduces the committed receipt byte for byte.

TASK-041 check-01 attempts, at `c35c785`, under `with-lock`, with the capture reporter:

| Attempt | Run | Result |
| --- | --- | --- |
| Earlier, stopped (above) | REJECTED 9/10 | ladder clock read 12 s; receipt restored from Git |
| 1 | 22:42:55–22:47:32Z | PASSED 10/10; receipt byte-identical; **accepted** |

The TASK-041 capture set comes only from the accepted attempt. Captures from the rejected run were
discarded. l.1304 is recorded as a flake for the TASK-041 owner (open item 1).

Changes:

- `evidence/refinement/task-042/delivered-captures.json` (new, hash-only, 339 KB). It
  lists 186 actual-app attachments from the 8 guard runs: 115 PNG captures and 71 JSON
  measurements.
  - Each entry records: task, check, file, case and project; journey and criterion IDs;
    attachment name and content type; store identity, sha256 and byte size; revision
    `c35c785`; and viewport, device scale factor 3 and skin with its source.
  - Each entry also records its before references: the V/P staged in `accepted-gallery`, with id,
    path and sha256. JOURNEY-002 pairs with V03/V04; 012 and 013 with V11; 017 with V10; 018 with
    P01–P03; 014 with P04; 008 with P05.
  - JOURNEY-007, 016 and 033 have no staged V/P image, so each states its stand-in: the
    accepted gallery states at `eded158`, the integration base `03087f7` as the before code
    revision and, for 033, the phosphor-echo reference.
  - Each guard run records its approved command, receipt path and sha256 (byte-identical to the
    committed receipt) and its totals.
  - Gallery-case attachments are excluded, because they are not actual-app evidence.
- Evidence store: 146 objects, about 240 MB, at
  `<project>/evidence-store/clear-refinement-20261103/task-042/objects/<sha256>`. This is the
  README's store, at a task-owned subpath. TASK-039's references are untouched.
- `scripts/refinement/task-042-evidence-closure.test.mjs`:
  - The first AC-R039-02 case is renamed and rebuilt on `deliveredCaptureProblems()`. It
    re-hashes every object from the store (size, sha256, PNG signature or JSON).
  - It requires the revision to be HEAD or an ancestor of HEAD, with no committed, uncommitted
    or untracked change since, outside `docs/`, `evidence/` and this test. Local changes recorded
    at capture time must be limited to the same paths.
  - Each guard run must use its approved command and keep its receipt sha256 unchanged and
    current. Each capture must be a declared, non-gallery required case carrying its journey's
    criteria. Each before reference must resolve byte for byte, or the stand-in must be stated.
  - Every JOURNEY-002/007/008/012/013/014/016/017/018/033 criterion needs at least one capture,
    and JOURNEY-008 and 033 criteria also need a measurement.
  - The `contentType` grep proxies are gone. The second AC-R039-02 case now reads the retained
    phase-sample measurement instead of grepping the spec.
  - AC-R039-03 admits exactly this manifest besides the source map. AC-GAL-02 scans all 19
    `tokens.css` variables (16 accepted and 3 app-added: `--logging-viewport-gap`,
    `--movement-peer-gap`, `--movement-tier-gap`).
  - Correction: the "other tasks' evidence unchanged" check parsed `git status --porcelain`
    after the helper's `trim()`, which cut the first line's path. It now uses
    `git diff --name-only HEAD` plus untracked files. Before the fix, the case wrongly flagged
    this task's own `required-cases.json`.
- `evidence/refinement/task-042/required-cases.json`: the AC-R039-02 case identity is renamed and
  the description updated. There are still 16 cases.

Method: the scratch reporter was added with `PW_TEST_REPORTER`. The approved commands, the native
JSON report and the receipts were unchanged; the guard forbids reporter flags in the command, not
an added reporter. The reporter, generator and captures were scratch only, and the captures were
deleted after the store copy.

Mutation proofs ran in a scratch Runner-layout worktree (`git worktree add --detach`, since
removed). The store was symlinked, and the manifest was a copy. The unmutated baseline passed.
Each mutation failed the AC-R039-02 case:

- one capture's sha256 changed in the manifest: "not content-addressed" and "object missing";
- one object deleted from the scratch store: "object missing from the evidence store";
- another object's bytes placed under that hash name: "does not hash to …" and a size mismatch.

Verification on this tree (HEAD `c35c785` plus these changes):

- TASK-042 guard: PASSED, 16 total, 16 executed, 16 passed, 0 skipped.
- `verify-delivery-evidence.mjs --mode final`: PASSED over 45 tasks (all except TASK-039 and
  TASK-042), and again over 46 tasks (all except TASK-039).
- `npx eslint` on the changed test file: clean. `npx tsc --noEmit`: exit 0.
- `npm run lint:ds`: exit 0. `npm run build`: exit 0.
- `npx vitest run`: 276 files, 6,391 tests passed, exit 0.

AC-R039-02 is now closed by an executed, store-verified case and removed from the open items.
