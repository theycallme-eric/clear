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
- **Definition record.** TASK-038's record pins `src/dev/gallery-refinement-scenes.tsx`; after D3 its check was
  REJECTED (source hash mismatch). Re-recorded the `repo:` hash only (line 57, TASK-121's rules); TASK-038 and TASK-121
  check-01 PASSED (receipts unchanged). The closure test now accepts exactly that one record line.
- **Key check.** The whole `e2e/refinement` with one worker and two retries (CI=1's settings) at 971ae643:
  10:43:06–11:51:26, 4,100 s (68 min). 395 passed, 4 failed — the four backend-lane cases (task-047:1121/1132,
  task-048:1253/1264), which need the disposable test lane. `git status` after the run: clean. A first start with
  `CI=1` was stopped after 14 s so it could run detached; that left its dev server (npm run e2e:server, vite on 5173)
  orphaned, and stopping it was refused by the permission check, so the key run reused it (CI=1 never reuses a
  server, which is why the flags were set by hand). The orphan had exited by the end of the run; port 5173 is free.
- **Daily drift (not changed).** TASK-103's screens receipts hold /history's rest-day range up to yesterday
  ("Wed 4 Nov 2026 – Mon 23 Nov 2026 · 20 rest days"), so a run on another day rewrites them. A fixed page clock in
  that spec would end it; it is another task's spec and timing outside D4(b), so it is reported, not changed.

## Repair round 2 (2026-11-24)

**What failed.** Verification of repair 1 (runs d1ca1e0d and a88f1b23) passed every command both times, including the
whole `e2e/refinement` (399 passed, backend lane included). But TASK-104's parity receipt `ladder-12-phone-390`
alternated between two renders of its route running, paused and ended captures (A 2a6de6c9/09465ba8/515a098f, as
committed at d79e674b; B 6de22238/15f169df/e5a4e953 in run 1), so any verification run could change the candidate.
Eric's decisions (chat, 2026-11-24): D4 "Allow both (Recommended)" (timing fixes that do not change what a test checks;
stale parity retaken through its own guard); D6 "Yes, retire both (Recommended)"; D7 "Accept as is (Recommended)".

**Root cause.** Captures taller than the viewport (ladder-12 at 320 and 390; ladder-4, AMRAP and For Time at 320)
show /workout's header over the card's top edge, with the session clock (`useElapsedSeconds(started_at)`,
`src/app/Workout.tsx:304`). `driveLifecycle` held the clock at `now + 1 s`, where `now` is the page clock, which runs
in real time from the gallery side's `resume()` through the /workout load; the clock read 03:06, 03:07 or 03:08 at
"running" by load time. Reproduced before the fix: 4 parallel repeats on the shared dev server (placeholder Supabase
values) gave 3 × A and 1 × a third render C (698f17df…); A and C differ only in a 20×25 px box at the card's top
right, the clock's last digit. B's images were overwritten in the store; that B was another reading is inferred.

**What changed.**
- `e2e/refinement/task-104-parity.spec.ts` (TASK-104's spec, timing only under D4): lines 63–74 `HOLD_AT` (gallery
  ENTRY + 2 min, route ENTRY + 5 min) and its comment; 500–503 `driveLifecycle(…, holdAt)`; 511
  `await page.clock.pauseAt(holdAt)`; 564 and 573 pass the side's instant. No read, receipt field, hash binding or
  tolerance changed; a load slower than 89 s fails at `pauseAt` instead of drawing another time. Five TASK-104
  receipts changed only in their route running/paused/ended hashes (amrap, for_time, ladder-4, ladder-12 at 320;
  ladder-12 at 390); TASK-104's guard receipt re-recorded the spec hash.
- D6: `e2e/contained-shell.spec.ts` — the clear/vapour skin loop (lines 401–482 at d79e674b) removed whole (no skip);
  the comment above it now names all four retired skins with D2 and D6 quoted. Two ledger rows (D6 quoted, old-build
  result: fails at 181e580 at line 410) and a UAT entry.
- D7: recorded in `test-ledger.json` (`rules.repairRound1.definitionReRecord.ownerAcceptance`) and `UAT-LIST.md`
  (owner item 6 and the D3 paragraph): the re-record landed in 7db407d6 after the D3 change 6ca3dc5f.
- `scripts/refinement/task-115-closure.test.mjs`: the whole-run test also checks the two D6 rows (decision, old-build
  result, UAT entry). `test-ledger.json`: `rules.repairRound2`, the D6 rows (retired 74 → 76), the TASK-104 refresh,
  the self-check (26 files; 30 base titles absent, the contained-shell skin title added; 9 changed bodies; 1 loop
  instance dropped; nothing weakened).
- The first try of this round stopped on the disk limit (free space fell to 3.8 GiB during the load run); Eric freed
  space (about 32 GiB) and the round resumed.

**Exact verification.**
- Load run, after the fix: `npx playwright test e2e/refinement/task-104-parity.spec.ts e2e/refinement/task-006.spec.ts
  e2e/refinement/task-010.spec.ts e2e/refinement/task-011.spec.ts --project=mobile --repeat-each=3 --workers=6` on the
  shared 5173 dev server with placeholder Supabase URL/key, outside the guard so a hash reporter could record every
  repeat: 69 passed (5.4 min); 30 TASK-104 cases, 300 captures under 100 names, each byte-identical in all 3 repeats.
- `run-required-check --task TASK-104 --check parity -- npx playwright test e2e/refinement/task-104-parity.spec.ts
  --project=mobile`: PASSED twice, 10/10 each. After each, the 10 parity receipts equal the load run's byte for byte;
  the guard receipt (08c0243f…) and the 100 store captures are identical across the two runs. ladder-12-phone-390
  route running/paused/ended: a78a7b0b…/5d4a2825…/e2a154ae….
- `run-required-check --task TASK-115 --check check-01 -- node --test scripts/refinement/task-115-closure.test.mjs`:
  PASSED twice, 13/13; receipt identical (3531eeb9…).
- `run-required-check --task TASK-115 --check parity -- npx playwright test e2e/refinement/task-115-comparison.spec.ts
  --project=mobile`: PASSED twice, 53/53; the 56 files under `task-115/comparison` and `task-115/results` unchanged
  from the committed ones after run 1, and run 2 byte-identical to run 1 (TASK-115 reads no TASK-104 receipt).
- The brief's body-ledger `node -e`: exit 0 (not rerun: the A3 ledger tool reads no e2e file and no build test
  changed). `git merge-base --is-ancestor a6cd01c9 HEAD`: exit 0.
- `verify-delivery-evidence.mjs --body clear-gallery-adoption-20261113 --mode final --tasks <the 18>`: PASSED (18 tasks
  with current passing receipts, TASK-104 included).
- TASK-035, TASK-037, TASK-038 check-01 through the guard: PASSED; receipts unchanged.
- `npm run typecheck`: exit 0. CI chain (typecheck, lint, lint:ds, gen-issues --check, gen:types --check, npm test,
  build, console grep): exit 0; lint 0 errors, 175 warnings (as in round 1); 279 test files, 6,516 tests passed.
- The whole `e2e/refinement` was not run here (V2's verification runs it next).

**Open assumptions.** That verification run B was another header-clock reading is inferred (its images were
overwritten). The route has 89 s to load before `pauseAt` would fail; the slowest route load seen is a few seconds.

**Next action.** Controller verification; Eric's UAT with `evidence/refinement/task-115/UAT-LIST.md` (D6 and D7 are
listed there).

## Repair round 3 (2026-11-24)

**What failed.** V2 verification of repair 2 (2900d605) passed all 19 commands and the TASK-104 fix held. The
independent review did not accept it (`reviews/TASK-115-a1-r2-pending.json`): TASK-AC-C8FAD22523F1 and
TASK-AC-9691375B8163 not met. The root e2e cases that need the test backend never ran anywhere, and the ledger said they
run "in V2 verification", which runs only `e2e/refinement`. UAT-LIST.md also attributed "entry-forms left as reported"
to Eric; that was the controller's instruction, not an owner decision.

**Correction to earlier entries of this note.** The first section's "20 cases need the backend lane … Verification
runs them" and the round-1 "Root rerun … the verification lane has" were wrong for the root specs: V2 verification
runs only `e2e/refinement`, where task-047/048's four backend cases did run with the test lane and pass (verify logs
d1ca1e0d, a88f1b23, d5a56ca9: 399 passed). No root backend-lane case ran anywhere in this build.

**Owner decision.** D8, Eric, chat, 2026-11-24: "Accept unrun, list for UAT (Recommended)". Asked: "TASK-115: about 240
old end-to-end tests that need the test backend never ran in this build. That's mainly core workout flows, entry forms
and 98 database-permission tests. The build's agents have no backend access, and only two test suites were approved to
use it. Its criterion says every old test passes or is retired. How should TASK-115 close?" Option: recorded as not
run, with your answer, listed for UAT; running them becomes a follow-up.

**What changed.**
- `test-ledger.json` `rules.wholeE2eRun`: the exact count is 227 cases in 27 files under D8 (211 of the 220 the whole
  run did not run, and the 16 design-0143 failures that failed only for the missing backend), each with the outcome
  "not run: no backend lane; accepted unrun by the owner (D8)" and D8 quoted. The 4 task-047/048 failures are now
  "passes in V2 verification (backend lane, PRE-001)" with the logs cited. Of the other 9 not run: focus-ownership's 8
  were skipped because the app had no Supabase URL and passed on round 1's placeholder reruns ("passes on rerun"), and
  crt-source-graphic-proof's 1 is a flag-gated diagnostic. New `notRun` (all 220, by file and outcome) and `d8`.
  Totals corrected to 390 + 131 + 219 + 1 = 741 (the ledger had 220 skipped plus 1 did not run; Playwright's summary
  says 219 and 1, and its JSON report failed to write, so the one did-not-run case cannot be told apart).
  `byOutcome` recounted. Every "the verification lane supplies them" claim is removed. `rules.repairRound1.decisions
  .entryForms` now says it was not an owner decision. `rules.repairRound3` records this round.
- `UAT-LIST.md`: owner item 7 and a D8 section listing the 27 files with counts (rls 98, core-loop, entry-forms,
  optional-feedback, task-040-home-review, the six design-0143 workout files, history-detail, accessibility and the
  rest), the stale `/^Focus:/` read at `entry-forms.spec.ts:1059/1063`, and running them as a follow-up. The "Still
  reported" entry-forms line is corrected. "Coverage and follow-ups" says plainly that they did not run.
- `scripts/refinement/task-115-closure.test.mjs` (same case names): "needs backend lane" and "reported for Eric" are no
  longer accepted. D8's outcome is accepted only on rows quoting D8, and the V2 outcome only on task-047/048 rows citing
  the logs. The totals and both outcome tallies must add up, every not-run case needs its own outcome, no old-build file
  outcome rests on the backend lane alone, and the UAT list must quote D8 and name every D8 file with its count.
- TASK-103 (D4, timing only): `e2e/refinement/task-103-parity.spec.ts` lines 124–131 (`SCREENS_TODAY`,
  2026-11-24T12:00:00Z, and its comment) and line 710 (`page.clock.install({ time: SCREENS_TODAY })` before the screens
  case's first visit). /history's rest-day range ran up to yesterday by the real date; it is now fixed. Its 10 parity
  receipts are unchanged; the guard receipt re-records the spec hash.
- Self-check: 27 files, 10 changed bodies (task-103's screens case added), nothing weakened.

**Exact verification.**
- `run-required-check --task TASK-103 --check parity -- npx playwright test e2e/refinement/task-103-parity.spec.ts
  --project=mobile`: PASSED twice (10/10 each, 16:27 and 16:29 CST, before the 18:00 roll-over). Run 1's 10 parity
  receipts are byte-identical to the committed ones. Run 2's receipts, guard receipt (d1a00a65…) and 36 store captures
  are byte-identical to run 1's. Dates left in the receipts: Sun 1, Mon 2 and Tue 3 Nov 2026 (fixtures and the derived
  rest day), and "Wed 4 Nov 2026 – Mon 23 Nov 2026 · 20 rest days" (up to the day before the fixed instant). None comes
  from the real clock.
- `run-required-check --task TASK-115 --check check-01 -- node --test scripts/refinement/task-115-closure.test.mjs`:
  PASSED twice, 13/13; receipt identical (3ad5a8ff…). Negative checks of the tightened case (ledger mutated, then
  restored byte for byte): a bare "needs backend lane" row fails it, and so does a D8 row without the quote.
- `run-required-check --task TASK-115 --check parity -- npx playwright test e2e/refinement/task-115-comparison.spec.ts
  --project=mobile`: PASSED twice, 53/53; comparison files and the parity receipt byte-identical to the committed ones
  and across the two runs.
- The brief's body-ledger `node -e`: exit 0 (not rerun; no build test changed). `git merge-base --is-ancestor a6cd01c9
  HEAD`: exit 0.
- `verify-delivery-evidence.mjs --body clear-gallery-adoption-20261113 --mode final --tasks <the 18>`: PASSED (18
  current and passing, TASK-103 included).
- TASK-035, TASK-037, TASK-038 check-01 through the guard: PASSED; receipts unchanged.
- `npm run typecheck`: exit 0. CI chain: exit 0 (lint 0 errors, 175 warnings as before; 279 files, 6,516 tests).
- The whole `e2e/refinement` was not run here (V2's verification runs it).

**Open assumptions.** None new. D8's 227 cases are unproved on Round 7 until they are run against the test backend.

**Next action.** Controller verification. Then Eric's UAT with `evidence/refinement/task-115/UAT-LIST.md` (owner items 6
and 7). Running the D8 cases is a follow-up.

## Repair round 4 (2026-11-24)

**Authorisation.** V2's three repair rounds were used up. Eric, chat, 2026-11-24: "One extra round, recorded
(Recommended)". The work is timing only, under D4(b): Eric, chat, 2026-11-24: "Allow both (Recommended)".

**What failed.** V2 verification of repair 3 (2bd7513a) passed every command twice. But TASK-114's capture
workout-feedback-phone-320 (route-open) alternated between 31d5cb33… and 62c557be…: V2 committed run 1's version as
318994cb, together with TASK-115's comparison receipt and page, and run 2 flipped them back.

**Root cause (measured; not the clock).** TASK-114 already holds both sides at fixed instants. The route side held its
clock as soon as `<main>` showed, but /summary's content could still be arriving: in 4 of 80 diagnostic runs the page
had 80 or 130 elements instead of 256 at that point. The case then scrolled "Log workout feedback" into view while
the page laid that content out, so the scroller stopped at its maximum for a page 12 px shorter (scrollTop 133 of 613
against 145 of 625). The page behind the dialog therefore sat 12 px lower. It shows through the dialog's edges and
chamfered corner, and the drawn scroll bar and CRT lines move with it. The pixel diff of 62c557be against 31d5cb33
covers only the top 19 and bottom 27 CSS px and the right edge. The movement note (320 and 390) flipped the same way:
it pressed Add note straight after opening Coaching and notes, before that layout settled. That flip was 1 in 3 per
width in the load probe, and 1 in 40 with the unchanged spec.

**What changed.** In `e2e/refinement/task-114-parity.spec.ts`, waits only:
- Lines 349–375: a new `settleRoute` (fonts, entrance motion, and every scroll height still across two reads 250 ms
  apart).
- Lines 622–628 and 630–631: the route side waits for the first control it presses and a settled layout, holds at
  ENTRY + 600 s as before, then settles again.
- Lines 645–646: the movement note settles between its two presses.

No read, receipt field, hash binding, tolerance or held instant changed. A temporary diagnostic copy of the spec was
used and deleted. TASK-114's receipts are back to the ones before 318994cb.

**Scan.** I read every parity spec for the pattern, then ran task-103, 105, 106, 107, 111, 114, 116, 117 and 120
parity under load (`--repeat-each=3 --workers=6`, shared 5173 server, placeholder Supabase values, a hash reporter
keyed by spec and capture): 294 passed. Only TASK-114's movement note flipped, and that is now fixed. TASK-105 reads
the page's own `now` before Start (TASK-104's old shape), but none of its captures depends on the absolute instant. A
trial with fixed instants 3+ minutes later gave byte-identical receipts, so the trial was reverted and the spec is
unchanged. The others are unchanged too (reasons in `rules.repairRound4.scan`). Limit: three repeats cannot rule out
a flip rarer than about 1 in 20.

**Exact verification.**
- TASK-114 parity guard: PASSED twice, 34/34 each. Receipts, guard receipt (992a802f…) and the 68 store captures are
  byte-identical across the two runs, and the receipts equal 2bd7513a's. Committed as 4fc7e489.
- Load: TASK-114 parity with task-006, 010 and 011, `--repeat-each=3 --workers=6`: 141 passed. All 204 TASK-114
  captures were byte-identical per name across the 3 repeats.
- TASK-115 parity guard: PASSED twice, 53/53 each. Run 2 is byte-identical to run 1. Against 2bd7513a, only the
  workout-feedback-phone-320 owner's provenance changed ("as committed at 4fc7e489", was 54d0a935), along with the
  page and receipt hashes that follow from it.
- TASK-115 check-01: PASSED twice, 13/13; receipt identical (3ad5a8ff…, unchanged).
- `verify-delivery-evidence.mjs --mode final --tasks <the 18>`: PASSED, all 18 current and passing (TASK-114
  included).
- TASK-035, TASK-037 and TASK-038 check-01: PASSED, receipts unchanged.
- Body-ledger `node -e`: exit 0. `git merge-base --is-ancestor a6cd01c9 HEAD`: exit 0.
- `npm run typecheck`: exit 0. CI chain: exit 0 (lint 0 errors and 175 warnings, as before; 279 files, 6,516 tests).
- The whole `e2e/refinement` was not run here (V2's verification runs it).

**Open assumptions.** The specs left unchanged were stable in three repeats under load. A rarer flip there cannot be
ruled out.

**Next action.** Controller verification, then Eric's UAT.

## Repair round 5 (2026-11-25)

**Authorisation.** Eric, chat, 2026-11-24: "Yes, one more round (Recommended)". It is outside V2's count and recorded in
the body ledger.

**What failed.** V2 verification of repair 4 (6c8bc1bf) passed in one run: 19 commands, tree unchanged, so the
TASK-114 settle fix held. The fresh review (`reviews/TASK-115-a1-9d006fc1ac12.json`) did not accept
TASK-AC-495C349983AC. The comparison's `END_OF_RUN_OWNERS` still left out TASK-103, 104, 109 and 112 and TASK-113's
screens receipts, a choice made in attempt 1 while some receipts were stale. As a result:
- the screens state had only TASK-119's /generate beside it, with no Setup (/onboarding) or History (/history) side;
- the cards state had no Review side (TASK-112);
- preparation and movement-note lacked TASK-109's pairs;
- UAT-LIST.md pointed at TASK-103/104/109 retakes the page did not show;
- `RECAPTURED` named only the first eight owners, so TASK-119's and TASK-114's retakes read "taken by its own task
  run".

**What changed.**
- `e2e/refinement/task-115-comparison.spec.ts`:
  - `END_OF_RUN_OWNERS` now lists every owner the final evidence check consumes (TASK-103 to 114 and 116 to 120).
  - A receipt joins a state when its `state` names it (`statesNamed`: one or several states). The primary owner's
    other receipts join too (TASK-105's Review grid).
  - `RECAPTURED` is gone. Provenance now comes from the commit that last wrote each receipt: "retaken by TASK-115
    through <task>'s own guard" or "taken by <task>'s own run".
  - The header comment is updated. Every existing read is kept.
- `scripts/refinement/task-115-closure.test.mjs`:
  - The comparison case checks that each state's owners equal every current owner receipt with captures that names
    it, and that each provenance matches git.
  - The store check's `RECAPTURED` adds TASK-103, 104, 109, 114 and 119.
  - Negative checks pass: dropping TASK-113 from the screens receipt fails the case, and so does a wrong provenance.
    Both files were restored byte for byte.
- UAT-LIST.md:
  - The round-1 D4(a) pointer now names where each retake sits on the page.
  - The round-2 TASK-104 entry points at its states.
  - A new round-5 section lists each state's owners and the totals.
- Ledger: `rules.repairRound5`, two self-check bodies (13 changed bodies, nothing weakened).

**New owners on the page:** TASK-103 (emom, amrap, for_time, ladder, screens), TASK-104 (emom, amrap, for_time,
ladder-4, ladder-12), TASK-109 (cards, preparation, movement-note), TASK-112 (cards), TASK-113 (screens) and TASK-105's
Review grid (ladder-4, ladder-12).

**Totals.** Before: 26 states (52 sections), 550 images, 622 labelled, 0 unintended. After: 26 states (52 sections),
794 images, 902 labelled, 0 unintended. Among the new labelled differences are the reviewer's examples: KETTLEBELL and
BENCH (TASK-AC-7B8DC9E87617, TASK-113), FILTER against SHOW and the status/date order (TASK-103: AC-C53-01 and
TASK-AC-6BFF651DF237).

**Not shown, by design.** TASK-105's scheduled ladder and TASK-108's ended card and SectionHeader navigator are drawn
by no accepted gallery state. TASK-118's and TASK-119's gallery-base receipts record no images.

**Exact verification.**
- `run-required-check --task TASK-115 --check parity -- npx playwright test e2e/refinement/task-115-comparison.spec.ts
  --project=mobile`: PASSED twice, 53/53. All 55 files (52 receipts, receipt.json, index.html at 16aa6345…, and the
  guard receipt at 8d7f902b…) are byte-identical across the two runs.
- `run-required-check --task TASK-115 --check check-01 -- node --test scripts/refinement/task-115-closure.test.mjs`:
  PASSED twice, 13/13; receipt identical (d8b528bc…).
- `verify-delivery-evidence.mjs --mode final --tasks <the 18>`: PASSED, all 18 current.
- TASK-035, TASK-037 and TASK-038 check-01: PASSED, receipts unchanged.
- Body-ledger `node -e`: exit 0. `git merge-base --is-ancestor a6cd01c9 HEAD`: exit 0.
- CI chain (typecheck first): exit 0. Lint shows 0 errors and 175 warnings, as before; 279 files and 6,516 tests pass.
- The whole `e2e/refinement` was not run here.

**Next action.** Controller verification, then Eric's UAT.
