# TASK-110 — format badges, prescribed load and load guidance on real rows (A3 task 10a, F8 part 1)

Task-owned progress note for body `clear-gallery-adoption-v2-20261120`, attempt 1, worktree branch
`v2/clear-gallery-adoption-v2-20261120/task-110-a1`, base `9c9db333` (issue #733). Path per the brief's Rules
(the issue body says `…-20261113`; earlier tasks used this one).

## Intended outcome

Format-only badges (owner decision 6) with each block's duration, cap, rounds and schedule readable on the
block's prescription line on Review and Workout; live timed rows reading the prescribed load through
`MovementIdentity` and `src/ui/refinements/movement-readings.ts`; TASK-003's twelve block-panel cases and
TASK-036's two deferred cases carried onto Round 7; every remaining build-edited body of amrap-block,
emom-block and Workout.test.tsx restored, ported (R7-2) or retired (R7-3); the three cross-file bodies (S2, S3,
R7-5) restored by name filter; the look check for `cards` and `circuit-round`.

## Changes

Product (gallery-owned files marked *):

- `src/ui/timed-workout-flow.tsx`* — live rows read `liveMovementReadings` (name, compact equipment, load in the
  profile's unit; drawn exactly as before); the prescription line carries `data-structure-meta` and, for an
  EMOM with a rest window, `Ns rest at the end of each minute` (Round 7 had stated it only while resting).
- `src/ui/ladder-rungs.tsx`* — the live ladder's summary line reads `liveMovementReadings`.
- `src/ui/block-renderers-frame.tsx`* — `BlockPanel detailLine`: format-only badge plus the size it leaves out
  on a `clr-timed-meta` line directly under the header.
- `src/ui/circuit-block.tsx`* — passes `detailLine`: `CIRCUIT` badge and `3 ROUNDS` under it (Round 7 showed no
  rounds before one was recorded). Changes the `circuit-round` gallery state (one line).
- `src/ui/workout-chrome.tsx`* — SectionHeader's full structure list draws `StructureBadge formatOnly` (the
  compact navigator the route and gallery draw has no list; no state changes).

Tests: `src/ui/block-panel.test.tsx` (new on Round 7, 12 TASK-003 cases), `src/state/refinement-load-guidance.test.ts`
(+2), `src/ui/amrap-block.test.tsx` (13 ported), `src/ui/emom-block.test.tsx` (12 ported),
`src/app/Workout.test.tsx` (14: 11 restored, 3 rewritten), `src/ui/circuit-block.test.tsx` (2 restored),
`src/ui/workout-chrome.test.tsx` (1 rewritten), `e2e/refinement/task-003.spec.ts` (5 rewritten),
`e2e/refinement/task-110-parity.spec.ts` (new, 4). Comment above the AMRAP base body ("leaves urgency to the
timer's own low state …") tidied (comment only). Evidence: `evidence/refinement/task-110/` (required-cases,
results, parity receipts, test-ledger), TASK-003 and TASK-036 receipts, and the re-run receipts of TASK-104,
107, 108, 109 and 116 whose targets this task edited.

## Failures and corrections

- First tried `StructureBadge formatOnly` → `identity.format` (LADDER only when the ladder renderer performs it).
  It broke TASK-119's base Review body ("drops the STANDARD badge …", which asserts Round 7's glyph rule).
  Reverted; the restored SectionHeader body reads Round 7's `LADDER` for the ladder-down circuit (test-update
  rule; UAT).
- Workout "keeps a running rest through another Rest and Log": the build's body fails on Round 7 because the
  set dialog is modal (two rest regions). Kept the base's Round 7 body, which holds every build read.
- Note bodies: Round 7's dialog is "Movement note" with the field named by the movement (wording).
- EMOM hands-off port: Round 7 keeps the end log mounted in its dialog and opens it itself when the clock ends;
  the hands-off reads are on the card (outside the dialog) and the open dialog is read.
- Stored AMRAP ports: Round 7 does not reopen an ended attempt's log on arrival; the card's Log results opens
  it before counts are read.
- Self-check found two regex reads introduced while porting (For Time caption, one-round line); made exact.
- Repair round 1 (V2 verification): rerunning the parity check rewrote `circuit-round-phone-320.json` — the
  route card's capture alternated between two hashes (`d5f5f243…` in the guarded run, `24fd6026…` in the
  others). See "Repair round 1" below.

## Self-check (parser; TypeScript compiler API, every touched test file and spec, 9)

(a) Titles at the base absent at HEAD: 0 in every file (amrap 46→46, emom 51→51, Workout 78→78, circuit-block
41→41, workout-chrome 44→44, load-guidance 6→8, task-003 3→3 static titles; block-panel and the parity spec new).

(b) Bodies changed: 59 (56 with a build counterpart, 42 with a base counterpart). Build reads not verbatim: 145;
base reads not verbatim: 104. Each classified in the ledger: renamed helper / Round 7 subject (same read),
look or wording (test-update rule; `rules.forTask115`), R7-3 retirement (3 bodies), base read over
AmrapBlock/EmomBlock superseded by a port, or carried into the restored Workout body. `matchersWeakened: false`.

## Verification (exact)

| Command | Result |
| --- | --- |
| `npm ci` | ok |
| TASK-110 check-01 (5 files) | PASSED, 196/196 |
| TASK-110 check-02 (name filter) | PASSED, 3 executed, 82 skipped by filter |
| TASK-003 check-01 | PASSED, 12/12 |
| TASK-003 check-02 (with-lock) | PASSED, 5/5 |
| TASK-036 check-01 | PASSED, 8/8 |
| TASK-110 parity (with-lock) | PASSED, 4/4; route vs gallery: no differences (lines, layout) |
| Re-run of edited targets: TASK-104 c01, TASK-107 c01, TASK-108 c01, TASK-109 c01, TASK-116 c02 | all PASSED (180, 60, 296, 131, 4) |
| `verify-delivery-evidence --mode final --body clear-refinement-20261103 --tasks TASK-003,TASK-036,TASK-110` | current passing receipts for all three |
| CI chain (typecheck, lint, lint:ds, gen-issues --check, gen:types --check, npm test, build, console grep) | exit 0; lint 0 errors / 175 warnings (as base); 71 requirements, 136 edges; 276 files, 6,432/6,432; build ok |

Gallery against the base (receipt `galleryAgainstBase`, diffed with TASK-108's and TASK-107's base receipts):
`cards` unchanged at 320 and 390; `circuit-round` gains `3 ROUNDS` (TASK-AC-2E6734369AC5, TASK-AC-9A47DF868BD4).
Port 5173 free before and after each browser run. No test over 2 s locally; route-level block-panel cases carry
`{ timeout: HEAVY }` anyway.

## Repair round 1 (evidence only; 2026-11-23)

Cause. The circuit's card at 320 is taller than what its scroll region shows (card 74–687 px, region 74–438,
viewport 568); it is the only route part this spec captures that overruns its region (the gallery's circuit card
at 320 overruns too). Playwright's element screenshot of an overrunning part scrolls it into view and captures
its whole box: the region's clip, the pinned footer and the page past the viewport are drawn over its lower part,
and the scroll it makes lights the ScrollRegion's streak (`data-scrolling`, settled by a 420 ms timer) at the
region's edge. Two screenshots 100 ms apart can agree while the streak is lit, so the steady capture sometimes
caught the lit edge. Diagnosed with a temporary, uncommitted probe: three full runs and six repeats of the case
in one worker all gave `24fd6026`; the guarded run's `d5f5f243` could not be reproduced on demand, and nothing
else in the page was moving (no part scrolling at capture, focus on the body, clocks held).

Fix (`e2e/refinement/task-110-parity.spec.ts` only; no product file; no text or layout read changed — words and
boxes are still read at the approved size before the capture): `wholePart` captures a part only once it fits
its region (within a pixel). A part that overruns gets a viewport just tall enough at the same width, then is
captured once no ScrollRegion is lit, and only kept if none lit during the capture; the viewport is then put
back and the part scrolled back to where it was read. The other parts already fit and are captured as before
(their hashes are unchanged). Applies to every capture in the spec (cards and circuit-round).

Runs (each through the guard, under `with-lock`, one at a time; port 5173 free before and after each):

| Run | Result | cards-320 | cards-390 | circuit-round-320 | circuit-round-390 |
| --- | --- | --- | --- | --- | --- |
| 1 | PASSED 4/4 | identical | identical | identical | identical |
| 2 | PASSED 4/4 | (receipts byte-identical to run 1) | | | |

Capture hashes (both runs): circuit-round-320 gallery `8d01f3b28f79`, route `f153c6877445` (both now the whole
card); circuit-round-390 `f61f8996bda7` / `634e0fef2937`; cards-320 route emom `985d67bb7298`, amrap
`e45b28be65d3`, for_time `e6b1ad49fd6e`; cards-390 route emom `b89d960a9b68`, amrap `698cb8524ab0`, for_time
`f07c3f3f5ea9` (gallery hashes unchanged too). A first attempt without the one-pixel tolerance failed cards-320
(a part scrolled to the region's start sat 0.05 px above its edge); the tolerance fixed it.
`verify-delivery-evidence --mode final --body clear-refinement-20261103 --tasks TASK-110`: current passing receipts.

## Open assumptions

- Review draws no change from this task (Round 7 already badge-format-only with its line and no timed rest);
  `/review` has no accepted gallery state and is read on the real route by task-003.spec.ts.
- Pre-existing stale/failed receipts of other tasks (TASK-001/002/004 targets gone, TASK-017/018, TASK-019
  rejected, TASK-021/023/024/027/029/039/041) are not this task's and were left as they were.

## Next action

Controller verification and review. UAT items are in the ledger's `rules.forTask115`.
