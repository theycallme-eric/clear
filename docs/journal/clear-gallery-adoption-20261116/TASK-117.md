# TASK-117 — A3 task 5b-2 (F3): EMOM end log and per-movement partials and loads (#743)

Body `clear-gallery-adoption-v2-20261120` (round 07), attempt 1, branch `v2/clear-gallery-adoption-v2-20261120/task-117-a1`,
integration branch `build/clear-gallery-adoption-2026-11-13`, base `1aae4fe6` (TASK-111 and TASK-116 merged). Source
material only: the old build `build/clear-refinement-2026-11-04` (`181e580`). This is the task-owned progress note; it
satisfies the shared daily journal rule for this body. Only TASK-117 writes it.

Path note: the brief's rules name this folder (`clear-gallery-adoption-20261116`); the issue body names
`clear-gallery-adoption-20261113`. The brief's path is used, as TASK-103 to TASK-116 did.

## Status

Attempt 1 implemented and committed; every required check passed through the guard twice, receipts and captures byte-stable (see "Verification"). Nothing pushed.
Repair 1 (2026-11-20) restored two inherited e2e reads the review found weakened and corrected the ledger; see "Repair 1".

## Intended outcome

- JOURNEY-011 (completion owner) on `/workout`: the EMOM's minute progress and Now/Next stay clear with no Not started
  or Work caption; its end log is the one "Log results" dialog with no minutes-completed counter, the loaded movement's
  actual load, the effort and the notes, where an exception is written; the note is saved as the block's notes,
  `minutes_completed` stays null, and the log steps aside once saved.
- JOURNEY-015 (completion owner) on `/workout`: each movement's next-round amount and actual load are drawn by the
  rules the shell saves them with, stored with the attempt, restored by a reload, cleared (amounts only) when the round
  count or answer moves the round, saved through the shell's one completion path and read back.
- TASK-046 for all four timed families: one "Log results" action per card, the draft kept through close, reopen and a
  failed save. Save authority for the EMOM as TASK-105 holds it for the ladder.

## Changes

Product (gallery-owned files marked; each change is named by a criterion and listed in the parity receipts'
`galleryChanges`):

- `src/ui/timed-result-log.tsx` (gallery-owned; named by the objective): per-movement groups drawn by
  `src/data/refinement-logging-rules.ts` — an amount only while a partial round applies (`partialRoundFor` over the
  log's own draft: an AMRAP none until a rounds count is recorded, a For Time only for a single pass answered
  Incomplete, an EMOM never), a load only where `loadApplies` (the set logger's rule, which the saved row applies), a
  decimal amount for a distance, the bound from `movementAmountMax`, and the row's own rule
  (`movementActualFromDraft`) saying in the field what an entry is refused on. A changed rounds count clears the
  amounts and keeps the loads (`draftsAfterProgressChange`). Round 7's labels and units are kept ("Completed in next
  round", "Completed in round N", "Completed"; `Reps`, `Seconds`, `Distance (m)`).
- `src/ui/timed-workout-flow.tsx` (gallery-owned; named by the objective): typed entries written onto the attempt's
  own record as they change (`writeTimedMovements`; not while correcting a saved log) and restored with it; save
  authority for the EMOM (`saveFailed` on its record, `reopenBlock` for a known row whose richer save failed); the
  EMOM's caption says `· Rest` beside its minute in the block's own rest window (AC-R011-01); `aria-expanded` on the
  card's "Log results" action (TASK-046).
- `src/state/emom.ts`, `src/state/workout-persistence.ts`: optional `movements` and `saveFailed` on the EMOM record,
  validated and kept by `clampEmomState`; older records parse unchanged.
- `src/state/timed-attempt-records.ts`: `RestoredTimedAttempt.movements`; the EMOM write keeps `movements` and
  `saveFailed`; `writeTimedSaveFailed` accepts the EMOM; new `writeTimedMovements` (written only when the entries
  change).
- `src/data/refinement-logging-contract.ts` and `docs/specs/LOGGING_FIELD_CONTRACT.md`: the `timed-entry` row and the
  EMOM moment's draft say what is now wired (re-verified on Round 7's entry; the EMOM's loads on its record).

Tests and specs:

- `src/ui/timed-result-log.test.tsx` (owned whole): the build's TASK-015 block (6) rewritten onto Round 7, after
  TASK-116's blocks; AC-C26-01's exact heading list restored (`['Log results', 'kb swing']`) and its unnamed-form read
  retired (R7-3), replaced by the accepted name; one added case for TASK-AC-339D1096F660.
- `src/ui/timed-result-dialog.test.tsx` (new, owned whole): the build's TASK-046 unit suite (4) rewritten against
  `TimedWorkoutFlow`, `TimedResultLog` and `LoggingOverlay` (the build's `refinements/timed-result-dialog.tsx` is not
  carried).
- `src/ui/timed-workout-flow.test.tsx` (owned whole): the build's TASK-011 block (8) in its own describe block, with
  AC-C31-01 restored whole (coaching disclosure by its accessible name; last child of `.clr-movement-group`); one added
  case for TASK-AC-D58939F8E091. TASK-104's and TASK-105's blocks unchanged.
- `src/data/refinement-logging-contract.test.ts`: TASK-030's cases unchanged; one added case re-verifying `timed-entry`
  on the wired entry for all four families (TASK-AC-A1C737BDC2FB).
- `e2e/refinement/task-011.spec.ts`, `task-015.spec.ts`, `task-046.spec.ts`: rewritten onto Round 7 (same names,
  same asserted behaviour; the ladder part of task-046 rewritten under owner decision 3 of 2026-11-16).
- `e2e/refinement/task-117-parity.spec.ts` (new, 8 cases): emom, amrap, for_time and ladder at 320 and 390 — before
  Start, past the cap, after the same entries, and the card behind the log; captures in the evidence store under
  `clear-gallery-adoption-v2-20261120/task-117/captures/`.
- Evidence: `evidence/refinement/task-117/required-cases.json` (check-01 81 cases, parity 8), `test-ledger.json`,
  `parity/*.json`, `results/*.json`; the TASK-011, TASK-015 and TASK-046 manifests' descriptions name Round 7's owners
  (case names and commands unchanged).

Not changed: `amrap-block`, `emom-block`, `for-time-block` tests and `Workout.test.tsx` (R7-1), `src/ui/logging-overlay.tsx`,
the gallery's own files (`src/dev/**`; the states draw the live components, so they show the change in the same commit),
`src/test/timed-log-dialog.ts`, `PROJECT_MAP.md` (no new boundary).

## Failures and corrections

- Tests first: before the product change, 9 of the new and restored unit cases failed, each on work this task builds
  (gating, `loadApplies`, inline refusal, stored entries, the rest caption, EMOM save authority, `aria-expanded`).
- `react-refresh/only-export-components` warning for an exported helper in `timed-result-log.tsx`: made module-private.
- jsdom: Round 7's dialog closes asynchronously (`waitFor`), re-reports the same outcome on every render (compare the
  value, not the call count), a direct mount has no profile unit (compare names and fields only), and the AC-C31-01
  last child is the coaching group's own wrapper (read as the child of `.clr-movement-group` that holds the disclosure).
- The gallery's preview profile states loads in pounds; the gallery case in task-015 reads `lb`.

## Verification

All browser runs were under the host lock (`node …/agent-runner-v2/bin/v2.mjs with-lock -- <command>`). No other
task's parity spec was run.

### Verification (run 1, 2026-11-20, through the guard; then committed)

| Check | Result |
|---|---|
| `npm ci` | exit 0 |
| TASK-117 check-01 (four files whole) | PASSED, 81/81 |
| TASK-009 check-02 (`task-009.spec.ts`) | PASSED, 3/3 |
| TASK-010 check-02 (`task-010.spec.ts`) | PASSED, 3/3 |
| TASK-011 check-01 (`timed-workout-flow.test.tsx`, `EMOM`) | PASSED, 12 executed of 38 (8 declared) |
| TASK-011 check-02 (`task-011.spec.ts`) | PASSED, 3/3 |
| TASK-015 check-01 (`timed-result-log.test.tsx`, `partial\|load\|round`) | PASSED, 16 executed of 26 (6 declared) |
| TASK-015 check-02 (`task-015.spec.ts`) | PASSED, 3/3 |
| TASK-046 check-01 (`task-046.spec.ts`) | PASSED, 6/6 |
| TASK-117 parity (`task-117-parity.spec.ts`) | PASSED, 8/8; zero text and zero layout differences on all four moments of every case |

The brief's CI chain as one command exits 0: typecheck pass; lint 0 errors, 175 warnings (as at base); lint:ds pass;
`gen-issues --check` (71 requirements, 136 edges); `gen:types --check` current; `npm test` 271 files, 6,368/6,368;
`npm run build` pass; console grep no match. The parity spec had also run once directly before the guard run (8/8).
TASK-009's and TASK-010's receipts came out byte-identical to the committed ones.

### Verification (run 2, 2026-11-20, on the committed tree `d99a47e3`)

The same nine checks, the same commands through the guard (browser ones under the host lock): TASK-117 check-01
81/81, TASK-011 check-01 12 executed, TASK-015 check-01 16 executed, TASK-009 check-02 3/3, TASK-010 check-02 3/3,
TASK-011 check-02 3/3, TASK-015 check-02 3/3, TASK-046 check-01 6/6, TASK-117 parity 8/8 — all PASSED again.

- Afterwards `git status` showed no change: every `results/*.json` and every `parity/*.json` receipt came out
  byte-identical to the committed ones.
- The 48 parity captures in the evidence store (`clear-gallery-adoption-v2-20261120/task-117/captures/`) hash
  identically to run 1 (48/48, `shasum -a 256`).

### Other tasks' checks on files this task changed

Their receipts hash the target files this task changed, so each was re-run once through the guard and its receipt
refreshed (nothing else in those folders changed): TASK-030 check-02 13/13; TASK-009 check-01 9 executed; TASK-010
check-01 10 executed; TASK-006 check-01 38/38; TASK-013 check-01 13 executed; TASK-014 check-01 17 executed; TASK-104
check-01 171/171 — all PASSED. `verify-delivery-evidence.mjs --mode final` for TASK-117, 011, 015, 046, 009, 010, 030,
006, 013, 014 and 104: current passing receipts. (`--all-tasks` still reports receipts for other tasks that were stale
or failing before this task — logging-overlay, review-screen, Generate, workout-chrome and load-guidance targets, and
TASK-019's and TASK-041's later-task cases; none is a file this task changed.)

## Repair 1 (2026-11-20, review `TASK-117-a1-d3ac491f3038`)

Failure: the review rejected TASK-AC-41FE9AC96A94 ("no matcher is weakened"). Attempt 1 had weakened two inherited
e2e reads with no ledger reason, and the ledger's `rules.matchersWeakened: false` was therefore wrong:

- `e2e/refinement/task-046.spec.ts`, `expectFocusedLog` (every TASK-046 case): the Close log X's `clr-hit` class (the
  shared 44 px hit area) and its `.clr-bleed` parent were dropped. Round 7 still draws both: `LoggingOverlay` uses the
  design-system `IconButton`, which adds `clr-hit` and wraps the button in `span.clr-bleed`
  (`src/ui/logging-overlay.test.tsx` asserts the same).
- `e2e/refinement/task-011.spec.ts`, JOURNEY-011 keyboard phone-320: the Tab bound from the log's X to the notes was
  raised from the build's 5 to 12.

Correction (test files and evidence only; no product change):

- `task-046.spec.ts` lines 361-365: the X read is back exactly as the build asserted it —
  `{framed (clr-chamfer, clr-btn, clr-hit), quiet: false, bleed: true, glyph: true}`.
- `task-011.spec.ts` line 703: the bound is back to the build's `press < 5`. Round 7 reaches the notes in 3 Tabs
  (`Weight · kb swing`, the effort faces' one roving radio stop, the notes), measured once with a temporary probe
  (bound 40, logging each focused element) that was removed before the guarded runs.
- `evidence/refinement/task-117/test-ledger.json`: the task-046 entries (40-45) say the X is read as the build read
  it, with `clr-hit` and `.clr-bleed`; the task-011 keyboard entry (35) records the unchanged 5-Tab bound and Round 7's
  3; `rules.resolved` records both restorations; `rules.matchersWeakened: false` is now accurate. Counts unchanged.
- Not changed: the R7-3 form-name retirements in `timed-result-dialog.test.tsx` and `task-046.spec.ts` (the owner is
  deciding their scope), the parity spec and its receipts, and every product file.

Verification (through the guard, browser runs under the host lock
`node /Users/eric/Projects/support-tooling/agent-runner-v2/bin/v2.mjs with-lock -- …`):

| Check | Run 1 | Run 2 |
|---|---|---|
| TASK-046 check-01 (`task-046.spec.ts --project=mobile`) | PASSED, 6/6 executed and passed | PASSED, 6/6 |
| TASK-011 check-02 (`task-011.spec.ts --project=mobile`) | PASSED, 3/3 executed and passed | PASSED, 3/3 |

- `npm run typecheck`: exit 0. `npm run lint`: exit 0, 0 errors, 175 warnings (as at base).
- Receipts refreshed: `evidence/refinement/task-046/results/check-01.json` and
  `evidence/refinement/task-011/results/check-02.json`; after run 2 each differs from the committed receipt only in
  the spec's target hash (the receipts carry no timestamp). No other receipt hashes these two specs (`evidence/refinement/task-042/source-map.json`
  names task-011's command and path only).

## Open

1. The AMRAP's amount label stays Round 7's accepted "Completed in next round" (`Next round · …`); the build named the
   round ("Completed in round 2"). AC-R015-01 reads "Use completed-next-round labels derived from actual ordered
   progress"; the round identity is proved through the saved rows and History. Listed for UAT.
2. Round 7 keeps the EMOM's Now on the minute's movement through its rest window (TASK-104's carried TASK-006 case
   reads the same) and, before Start, marks the movement after the opening minute's Next; the build differed. Listed
   for UAT.
3. R7-3 names the AC-C26-01 case; the identical TASK-046 "form named by the dialog's title" read in
   `timed-result-dialog.test.tsx` and `task-046.spec.ts` is retired on the same reason (recorded in the ledger).
4. Real write/read-back on the disposable lane (task-047/task-048) is not among this task's checks; the specs here run
   on a synthetic origin.
5. TASK-116's parity receipts were made before this task's AMRAP gating; re-run, its amrap `log` moment would draw only
   the kb swing's load group (on both sides alike). Not re-run here (another task's parity spec).

## Next action

Controller: verify the candidate; hand-diff `src/ui/timed-result-log.tsx` and `src/ui/timed-workout-flow.tsx` against
the allowance; look at the captures under `evidence-store/clear-gallery-adoption-v2-20261120/task-117/captures/`.
