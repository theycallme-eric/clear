# TASK-019 — Verify cross-family logging behavior and field ownership (#646)

Body `clear-refinement-v2-20261109b`, attempt 1. This is the task-owned progress note, the approved
exception to the shared daily journal for this body. Only TASK-019 writes this file.

## Status

Implementation complete (uncommitted), awaiting controller verification and commit. Base `bd330a7`
(#720, TASK-046 merged): `git fetch origin` then `git merge-base HEAD
origin/build/clear-refinement-2026-11-04` = `bd330a773e29641ba1bae1ae97d21683886b3bff`.

## Intended outcome

REQ-019 / C45, completion owner of JOURNEY-019 (AC-C45-01, AC-R019-01, AC-R019-02). After the four
consumer-family migrations (TASK-043 sets, TASK-044 groups, TASK-045 notes/feedback/rest day,
TASK-046 timed results), prove on the real entries (ENTRY-019: `/workout`, `/summary`, Home's
rest-day entry) that all 16 inventoried moments use the one shared focused `LoggingOverlay` while
keeping their own fields, drafts, timing and data ownership; repair only seams that cross families.
Not a fifth migration; TASK-041's geometry closure not claimed.

## Sources read

Brief; RUNNING-SUMMARY; TASK-043/044/045/046 notes; LOGGING-FIELDS.md (the 16 contexts);
CURRENT-REQUIREMENTS-AUTHORITY C21 ("Keep session elapsed, preparation, movement/rest and format
clocks distinct"); the four family specs and their synthetic apps; `logging-overlay.tsx`,
`set-logger.tsx`, `set-logging-sheet.tsx`, `circuit-block.tsx`.

## Approach

One spec, `e2e/refinement/task-019.spec.ts`, over one contained synthetic account whose
interceptor is the union of the four families' (every write recorded by owner table/rpc: set
observations via `mutate_set_observation`, `block_results`, `block_movement_results`,
`workout_exercises` PATCH, `workout_sessions` PATCH, `mark_rest_day`; anything else is
`unexpected` and fails `assertContained`). One cross-family session puts every `/workout` moment in
two sections: standard (back squat anchor, romanian deadlift, plank by time, farmer carry by
distance), superset, circuit; then EMOM, AMRAP, For Time and ladder; then a cooldown. A shared
`expectFocusedLog` reads every moment's chrome (modal, one header heading, framed icon-only X
focused first, backdrop blur, no half-sheet, nothing behind focusable) and returns a signature
that is compared across moments of different families.

## Cross-family seams found and repaired

1. **Correction focus return (set-logger, standard and circuit-movement families vs superset).**
   Closing a saved-set correction (`Edit set N`) with the X or Escape returned focus to the
   movement's Rest for a standard or circuit movement, but to the Edit for a superset movement;
   the shared overlay's contract is focus back on the opener. `src/ui/set-logger.tsx`:
   `collapse()` passes `toEdit = edit !== null`; `returnFocusNow` focuses the Edit that opened the
   correction when it is still connected. Every other return (Save, Cancel, clear, rest end) is
   unchanged. Proved in case 1 (touch, `closeByX(page, editSet)`), case 2 (keyboard Escape) and
   the gallery case (`set-correction`).
2. **Focus stranded on the page after a refused save (notes, feedback, rest day vs sets/groups).**
   Probed by keyboard: after a refused write the set families focus the dialog title (TASK-043),
   but a movement note, workout feedback and the rest day left focus on `BODY` inside an open
   modal (their Save is disabled while in flight; Chromium drops focus from a disabled control
   with a `focusout` whose `relatedTarget` is null — confirmed with a standalone Playwright probe).
   `src/ui/refinements/logging-overlay.tsx`: new `useFocusKeptInside` — on such a `focusout`, after
   a microtask, if the dialog is still open and connected and focus is on the body, focus moves to
   the dialog's title as a programmatic target (`tabindex="-1"` set at runtime, as TASK-043 did;
   TASK-018's source check forbids `tabIndex` in the source and the containers stay untabbable).
   Focus moved deliberately, a window blur and a closing log are left alone. Regression test
   `src/ui/logging-overlay-focus-kept.test.tsx` (2 cases; the first fails with the hook disabled —
   checked). Browser proof: `expectFocusKept` after the refused note (case 2), feedback and rest
   day (case 4).

No gallery state needed changing: the 16 states already render the route's own consumers, so both
repairs reach them directly. No CSS, tokens or hotspot files touched.

## Tests added

- `e2e/refinement/task-019.spec.ts` + `evidence/refinement/task-019/required-cases.json` (check-01,
  5 required cases, describe "TASK-019 every logging moment in the shared focused interaction"):
  1. **Sets, groups, note — /workout 390 touch** (AC-C45-01).
  2. **Errors and retry by keyboard — 320, reduced motion** (AC-R019-02).
  3. **Four timed families and their clocks — /workout 390 touch** (AC-R019-01).
  4. **Workout feedback on /summary, rest day on Home — 320, touch + keyboard, reduced motion**
     (AC-C45-01).
  5. **All 16 accepted gallery states — clear 390** (AC-R019-01).
- `src/ui/logging-overlay-focus-kept.test.tsx` (task-owned jsdom regression for repair 2).

## The 16 moments: inventory mapped to executed cases

The table is an inventory; each claim is the assertion in the named executed case.

| # | Moment | Executed in | What the case asserts (writer = intercepted write) |
| --- | --- | --- | --- |
| 1 | Anchor / primary lift | 1, 2, 5 | Weight/Unit/Reps/Effort, no Notes/Performed; draft through X and Escape; `insert` back-squat set 1; one rest, in the log; refused → "On this device only" → `online` → Saved, retry identical (2) |
| 2 | Other lift | 1, 5 | Weight + Unit `lb` kept through X; `insert` RDL set 1 `{70, lb, 8}` |
| 3 | Timed movement | 1, 5 | Seconds only (no Weight/Reps); draft through Escape; `actual_duration_seconds: 28`, `weight: null` |
| 4 | Distance movement | 1, 5 | Distance blank (never guessed), Weight; draft through X; `actual_distance: 35 m`, `weight: 24` |
| 5 | Extra set | 1, 5 | "Extra set 3" after 2 prescribed; draft through Escape; `insert` set 3 |
| 6 | Saved-set correction | 1, 2, 5 | Edit prefilled; unsaved correction kept through X/Escape; focus back on the Edit (repair 1); `correct` on the same `observation_id` |
| 7 | Superset round | 1, 2, 5 | Per-movement Performed; draft and unticked partner kept; `insert` only for the Performed movement, never the partner; no second rest (the running rest shown once); refused → held → retry identical (2) |
| 8 | Circuit round / take back | 1, 2, 5 | `Round 1 recorded`, round time, Take back; no movement fields; circuit rest drawn once (in the log), session rest once; block row `rounds_completed: 1` at Next section; refused block write keeps the round and retry writes each block once (2); keyboard close focuses the round clock (2) |
| 9 | Circuit movement entry | 1, 2, 5 | Weight/Reps, no Performed; draft through X; `insert` kb swing set 1; no rest invented (the running session rest shown once); round count unchanged; refused → held → retry (2) |
| 10 | Movement note | 1, 2, 3, 5 | Note field only; rest stays one and outside the log, still counting; draft through X; `PATCH workout_exercises` on that movement's row only; refused → text kept, focus kept (repair 2) → retry once (2); over a running AMRAP the clock advances 10 s, over a paused one it does not move (3) |
| 11 | Workout feedback | 4, 5 | Five feelings + notes, no Effort; draft through X and Escape; refused → alert in place, still /summary, focus kept → retry `PATCH workout_sessions {mood: 2, session_notes}` once, lands Home |
| 12 | Rest day / reason change | 4, 5 | Native Reason select (4 reasons), no textbox, picker focused (U25); X/Escape = existing Cancel; refused → alert, choice kept, focus kept → retry `mark_rest_day {p_reason: injury, p_note: null}` once; Change reason reopens at the saved reason |
| 13 | EMOM | 3, 5 | No log while running; Log results at COMPLETE, notes only (no counters); draft through X; kept through a refused save; `block_results.notes`, `minutes_completed: null` |
| 14 | AMRAP | 3, 5 | Rounds kept through X/Escape and through a refused save; `rounds_completed: 1` |
| 15 | For Time | 3, 5 | Complete → corrected Incomplete + Too hard, kept through close and a refused save; `completed_under_cap: false`, `effort: too_hard` |
| 16 | Ladder | 3, 5 | Clock runs 30 s on behind its open log; Undo finish closes the log, focus on Pause; rounds kept; `highest_rung: 1` |

Cross-family facts asserted: one chrome signature across the 10 moments of case 1, across the
timed logs + note of case 3, feedback + rest day of case 4, and all 16 gallery states of case 5;
timed logs write no set observation and draw no rest; notes write only `workout_exercises`;
`block_movement_results` is never written when no per-movement entry was typed.

## Earlier tests changed

None. No `required-cases.json` other than TASK-019's was created or edited.

## Failures and corrections during the work

- First spec run: correction X close did not return focus to `Edit set 1` → repair 1.
- The superset round opened while the squat's rest was running shows that rest ("Rest after back
  squat"), not its own: the existing one-rest rule (a running rest is kept); assertion corrected.
- Circuit round with the session rest running: two countdowns. Not a duplicate: C21 keeps the
  format rest distinct from the session rest; each is drawn exactly once. Assertion changed to
  "each rest once"; recorded as an owner/UAT item below.
- A timed log holds movement-group headings, so "one heading in the dialog" became "one heading in
  the header and the title not repeated".
- Feedback radio is "2, Worn" (not "Tired").
- Keyboard probe found focus on `BODY` after refused note/feedback/rest-day saves → repair 2.
- ESLint: `prefer-const` and a useless assignment in the spec; fixed (the second now asserts the
  saved read-back).

## Verification

All on base `bd330a7` (working tree). Every Playwright command ran under
`node /Users/eric/Projects/support-tooling/agent-runner-v2/bin/v2.mjs with-lock --`.

- `node scripts/refinement/run-required-check.mjs --task TASK-019 --check check-01 -- npx playwright test e2e/refinement/task-019.spec.ts --project=mobile`:
  PASSED, 5 total / 5 executed / 5 passed / 0 skipped (final run on the final spec; receipt
  `evidence/refinement/task-019/results/check-01.json`).
- Shared owner `logging-overlay.tsx` changed, so TASK-016/017/018 check-01 (`logging-overlay.test.tsx`
  with their patterns) re-run by their exact guards: PASSED 13 / 7 / 9 executed; receipts rewritten
  byte-identical (target unchanged).
- Full refinement sweep `npx playwright test e2e/refinement/ --project=mobile --workers=1` (179 tests,
  25.2 min): 176 passed, 3 failed. Two task-001 cases (l.425 tablet-768, l.462 phone-390) failed on
  `ENOSPC: no space left on device` writing traces (the disk was transiently full; 21 GiB free
  after); task-033 l.902 failed at "long log header: the glass is painted over this foreground"
  (0 changed pixels) — the known intermittent flake. Re-runs: task-001 + task-033 specs together
  17/17 passed; task-033 l.902 `--repeat-each=4` 4/4. Every other spec passed, including the
  overlay/set-logger consumers 002, 003, 005, 007–015, 020, 021, 033, 043, 044, 045, 046.
- Non-refinement specs that run locally with placeholder env (`SUPABASE_URL=https://synthetic-review.supabase.invalid
  SUPABASE_ANON_KEY=synthetic-review-placeholder`): `uat-batch-01`, `ui-polish-action-glow`,
  `ui-polish-home`, `ui-polish-pwa-viewport`, `ui-polish-integrated`, `public-gallery`. HEAD 24
  passed / 3 failed; base `bd330a7` (clean `git archive` export, same `node_modules`) 25 passed /
  2 failed. The 2 shared failures are the pre-existing public-gallery ones. The HEAD-only failure
  was `ui-polish-pwa-viewport` l.452 (a /generate Notes box 3 px past the safe inset at a reduced
  viewport — no logging UI involved); re-run `--repeat-each=3` on HEAD: 18/18 passed, so treated
  as intermittent [inferred]. `ui-polish-b05-active-hierarchy`, `-movement-countdown`, `-rest-log`
  fail identically on HEAD and base (out-of-repo B05 `.evidence` references absent). The five
  deferred B05 half-sheet specs were not edited or run. Backend-lane specs not run.
- `npx vitest run`: 273 files, 6382 tests passed (re-run after the last spec edit).
- `npm run build`: passed. `npm run lint:ds`: clean. `npx tsc --noEmit`: exit 0.
- `npx eslint` on the four changed/new `.ts`/`.tsx`: 0 errors, 2 pre-existing
  `react-refresh/only-export-components` warnings in `set-logger.tsx`.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks <every task dir except TASK-039, TASK-019 included>`:
  PASSED, every receipt current.

## Open owner / UAT items

- **Concurrent rests (C21):** a session rest from a set and the circuit's rest between rounds can
  count at once (two countdowns, each drawn once). Owner may want one to replace the other.
- **Superset round over another movement's rest:** the round starts no rest of its own and shows
  the running one ("Rest after back squat").
- **Rest day close semantics:** X/Escape discard the choice (its existing Cancel), while every
  other moment keeps its draft; and its opening focus is the Reason picker (U25), not the X.
- **After closing the forward action's "That didn't save" dialog by keyboard, focus is on the page
  body** (that dialog is `AppDialog`, not a logging moment; pre-existing; not changed here).
- Save semantics still differ by family (set log moves on/confirms; note stays open on "Note
  saved"; feedback leaves for Home; rest day closes; timed logs have no Save) — already recorded by
  TASK-043/045/046.
- Keyboard operation of the four timed logs is proved by TASK-046's executed case (its receipt),
  not re-executed here; case 3 is touch.
- TASK-037's definition record pins `repo:src/ui/set-logger.tsx` (and possibly the overlay) by
  hash; those pins are now stale too, as the cross-task rule expects — verify TASK-037 by its
  receipt. Not run here (`task-037` check is not in `npm test`).
- Gallery chrome identity is checked in the clear skin at 390 only (each family spec covers four
  skins). Contrast rests on axe only (TASK-041).

## Next action

Controller verification and commit.
