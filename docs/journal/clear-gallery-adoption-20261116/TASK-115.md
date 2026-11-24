# TASK-115 — end-of-run comparison, old e2e suites and evidence closure before UAT (A3 task 15b, #738)

Task-owned progress note (body `clear-gallery-adoption-v2-20261120`, attempt 1, base `9a1569b1`). Only TASK-115 writes
it. The brief names this folder (`clear-gallery-adoption-20261116`); the issue body names `…-20261113`. The brief's
path is used, as every earlier task did.

## Intended outcome

Close the run before UAT; implement no feature. (1) An end-of-run comparison page of the 26 accepted gallery states
beside their real routes at 320 and 390 with matched data, every difference labelled. (2) The whole e2e suite run on
the branch, every failure fixed in its shared owner, updated under the 2026-11-23 test-update rule, or reported.
(3) The body-level ledger rerun (`gallery-a2/tools/a3-test-ledger.mjs --now`) with the helper and S6 rechecks.
(4) Aggregate evidence closure over TASK-103 to TASK-114 and TASK-116 to TASK-121 on the A3 body record. (5) TASK-121's
definition-record receipts consumed. Own `evidence/refinement/task-115/`.

## What the base showed (`9a1569b1`)

- The A3 body record `evidence/refinement/clear-gallery-adoption-20261113/BODY.json` did not exist (the round-07
  rehearsal's "body record is absent" was this task's own work). With it staged, the final check passes for all 18
  tasks: every earlier receipt was current.
- No product (`src/`) or gallery-owned file needed a change. TASK-120 and TASK-121 made none either.

## Changes

- **A3 body record.** `scripts/refinement/stage-a3-body.mjs` (one-time, like TASK-039's `stage-references.mjs`) staged
  two inline references by hash from the approved round-07 run into the out-of-Git store
  (`<project>/evidence-store/clear-gallery-adoption-20261113/references/…`, 13 objects, about 1.3 MB): the accepted
  gallery's guides (bec4454 `PINNED-SOURCE.json`, state map, state ids, logging contexts, REUSE, LOGGING-FIELDS, tokens,
  source manifest) and the A3 authority (adoption authority, criterion changes, owner decisions 2026-11-13/14, the
  corrected task 2 groundwork ledger). BODY.json names base a6cd01c9, gallery bec4454, Foundation 0.14.3, and 03087f7,
  eded158 and 181e580 as history only. The verifier is unchanged.
- **Recaptures** through each task's own guard: TASK-105, 106, 107, 108, 110, 111, 116, 117. Two failed first, both on
  TASK-108's TimerFrame drawing a clock one digit cell per character: TASK-105's scheduled ladder (`^01:05$`) and
  TASK-107's circuit round (`00:45`). Reads updated under the rule (cell by cell); both then passed, receipts
  byte-identical across two passing runs. The other six passed with byte-identical guard receipts.
- **Comparison page.** `e2e/refinement/task-115-comparison.spec.ts` (parity check, 53 cases): for each of the 26
  states at 320 and 390, its primary owner's end-of-run matched-data pair (TASK-110 cards; TASK-118 overview, assets;
  TASK-119 preparation, screens; TASK-105 ladder-4/12; TASK-114 ladder-long and the 16 logging contexts; TASK-120
  urgency; TASK-113 errors in four skins), every other end-of-run owner's pair for the same state, every capture
  re-hashed from the store, every recorded difference with its criterion; plus the state drawn again at this revision
  (reduced motion, fixed clock, animations disabled, running clocks masked, `wholePart`, two loads in a row must
  agree). The last case writes `evidence/refinement/task-115/comparison/index.html` and opens it (every image loads).
- **Body ledger.** `evidence/refinement/task-115/body-ledger.json`: the tool's output verbatim (1,826 build tests:
  1,457 carried, 309 rewritten, 47 ported, 13 retired, 0 unplaced) with its inputs
  (`body-ledger-inputs/files.json`, `notes.json`, built from the task 2 ledger and every task ledger) and the helper
  recheck (80 changed helpers reached by 371 carried tests, each with a verdict and result).
- **Whole e2e run** and its triage (see below); six reads updated, one case retired, the rest reported.
- **Closure test** `scripts/refinement/task-115-closure.test.mjs` (check-01, 13 cases), `required-cases.json`,
  `test-ledger.json`, `UAT-LIST.md`.

## Whole e2e run

`npx playwright test --project=mobile` over every spec except the other tasks' parity specs (they ran through their
guards): 741 cases, 390 passed, 131 failed, 220 skipped (backend lane), 1 did not run, 10.5 min. Three B05 specs
first failed to load: they read B05 reference images from the V1 layout `<worktrees>/.evidence/<checkout>/sources`;
the approved B05 sources were copied there for the run and removed afterwards.

- 20 cases need the backend lane (PRE-001; `Needs SUPABASE_URL…`): task-047 ×2, task-048 ×2 and 16 design-0143 cases.
  Verification runs them.
- 24 pass on rerun: 23 draw the app on the shared dev server, which needs a Supabase URL and anon key (the
  verification lane has them); with placeholder values and no backend they pass. One B05 case was flaky under load.
- 8 pass after an update under the rule (task-021, ui-polish-home ×2, uat-batch-01, ui-polish-pwa-viewport ×4).
- 2 retired (ui-polish-b05-recent-rows "History chronology…", owner decision 7), for Eric to confirm.
- 77 reported: the B05 look suites (70), contained-shell (3), public-gallery (2), task-033:1027 (1),
  focus-ownership:387 (1). The same root specs were run at the old build 181e580 (a scratch extraction, same
  placeholder lane): the B05 and contained-shell files fail there too.

## Failures and corrections

- The first full run aborted at collection (the B05 reference images); fixed by staging them for the run.
- The first comparison runs were not byte-identical: running clocks (urgency at 390) and, in the first guard run after
  each spec edit, a second drawing of the cards state at 320 (3 of 9 guard runs; never in direct runs). Clocks and
  progress fills are masked in the fresh capture, a state is drawn again until two loads agree, and every state is
  opened once on the dev server before any capture. The final pair (02:04) was byte-identical: receipts, page and
  guard receipt.
- `npx playwright test e2e/refinement --project=mobile` as one command was not run: it also runs the parity specs of
  TASK-103, 104, 109, 112, 113, 114, 118, 119 and 120, which the controller's rules forbid outside their own guards
  (and the permission check refused it). Its parts were run instead: every task-0NN spec in the whole run, the eight
  listed parity specs through their guards, and TASK-115's comparison through its guard.
- Compared rows whose sides read the same were counted as unintended differences; they are skipped now.
- A3 test ledger tool: the helper recheck was first written without caching and stalled; rewritten with caching.

## Verification

- `run-required-check --task TASK-115 --check parity -- npx playwright test e2e/refinement/task-115-comparison.spec.ts
  --project=mobile`: PASSED, 53/53, run twice back to back; receipts byte-identical.
- `run-required-check --task TASK-115 --check check-01 -- node --test scripts/refinement/task-115-closure.test.mjs`:
  PASSED, 13/13.
- `verify-delivery-evidence.mjs --body clear-gallery-adoption-20261113 --mode final --tasks <the 18>`: PASSED.
- Body-ledger check (the brief's `node -e`): exit 0. `git merge-base --is-ancestor a6cd01c9 HEAD`: exit 0.
- TASK-035, TASK-037, TASK-038 check-01 through the guard: PASSED (receipts unchanged).
- Recaptures and refreshed receipts: `test-ledger.json` `rules.recaptures`, `rules.receiptsRefreshed`.
- CI chain on the final HEAD: see the hand-back report.
- Self-check (touched test files since 9a1569b1): 9 files, 1 base title absent (the retired chronology case, with its
  ledger row), 6 changed bodies with no read lost against the base or the build; matchersWeakened false.

## Open assumptions

- The comparison page consumes the owners' end-of-run pairs (AC-GAL-07); TASK-113, 118 and 119's pairs were taken by
  their own runs (not on the recapture list) and are labelled with where they were taken.
- task-033:1027 and focus-ownership:387 are harness timing, not product; not changed.

## Next action

Controller verification; Eric's UAT with `evidence/refinement/task-115/UAT-LIST.md`.

## Repair round 1 (2026-11-24)

Verify 1 timed out on `npx playwright test e2e/refinement --project=mobile` (one CI worker needs about 80 minutes;
the body's limit was 20; Eric raised it to 120 through a separate V2 change). Every other check passed. Verify 1's
partial run also rewrote `task-115/comparison/receipts/cards-phone-320.json` (the second drawing of the cards state).
Eric's decisions (chat, 2026-11-24): D2 "Retire, list for UAT (Recommended)"; D3 "Yes, gallery page only
(Recommended)"; D4 "Allow both (Recommended)"; entry-forms left as reported.

- **D2.** The 73 failing old look cases (70 in 13 ui-polish-b05-* files, 3 in contained-shell) are retired as whole
  cases (28 definitions removed; contained-shell's signal/mono skins and header-back's Locations instance dropped from
  their loops). Helpers and imports lint then reported unused went with them (TS-AST pruning; lint clean). Each case
  has a ledger row (reason, D2 quoted, old-build result) and a UAT entry; 21 that read behaviour are flagged "try on
  the phone".
- **D3.** `src/dev/gallery-refinement-scenes.tsx` 1 and 95–114 (`GalleryFullSectionHeader`) and
  `src/dev/gallery-registry.tsx` 132 and 2916: the full-header specimen's region is named for itself.
  `public-gallery.spec.ts` passes; task-027 and TASK-108's parity (which read the specimens) pass unchanged.
- **D4(b).** task-033:1058–1063 (run the held clock 20 ms, then wait until the foreground is clear) and
  focus-ownership:393–395 (wait for Send code). The first try (`runFor(1)` alone) still failed; the readiness wait
  passes twice. TASK-033 check-01 refreshed through its guard.
- **D4(a).** Whole e2e/refinement run (parallel): 389 passed, 10 failed (task-033 before its fix, 4 backend lane,
  task-041 ×5 under load — 10/10 alone). It rewrote receipts of TASK-103 (10), 104 (10), 109 (4), 119 (2) — stale — and
  one capture hash each of 105, 108, 110, 117 and 120 (load). 103/104/109/119 retaken twice each through their guards,
  byte-identical; 105/108/110/117/120 reproduced their committed receipts through their guards. TASK-103's /history
  rest-day range ("… – Mon 23 Nov 2026 · N rest days") is read from today's date, so its receipts drift daily.
- **Comparison.** The end-of-run gallery view is no longer hash-bound in the receipts (its 5-pixel icon anti-aliasing
  varied, and verify 1 rewrote the receipt); the warm-up and second load were dropped. Owner pairs stay hash-bound.
  The pair run twice was byte-identical (622 labelled differences, none unintended).
- **Body ledger** rerun at cca35346: identical rows (the tool reads no e2e file, so the e2e retirements are recorded in
  TASK-115's own ledger); unplaced 0.
- **Root rerun** (placeholder Supabase URL, references staged and removed afterwards): 110 passed, 4 skipped, 2 failed —
  contained-shell's clear and vapour skins fail with a Supabase URL configured, on the same read as the retired skins
  (they passed in the whole run without one). Reported, not retired (D2 named only the failing cases).
