# TASK-046 — Adopt shared logging for the four timed-result families (#672)

Body `clear-refinement-v2-20261109b`, attempt 1. This is the task-owned progress note, the approved
exception to the shared daily journal for this body. Only TASK-046 writes this file.

## Status

Implementation complete (uncommitted), awaiting controller verification and commit. Base `fa81c84`
(after TASK-045 #719): `git fetch origin && git rebase origin/build/clear-refinement-2026-11-04`
exited 0 ("up to date").

## Intended outcome

REQ-019 / C45 for this family only (TASK-AC-1C4999D342BC, TASK-AC-47129E192333,
TASK-AC-E2222DBA54CA). Role: foundation provider contributing to JOURNEY-019. The four timed-result
families' real entry points on `/workout` — EMOM end of schedule (`EmomBlock`), AMRAP closed window
(`AmrapBlock`), For Time finish/cap (`ForTimeBlock`), ladder log (`LadderBlock`) — use the shared
focused `LoggingOverlay` with its framed "Close log" X, keeping their fields, drafts, writer and
clocks. Also owned (controller instruction): the TASK-009 spec repair traced 2026-11-11.

No other family is touched or claimed. Cross-family closure (TASK-019) and route geometry (TASK-041)
are not claimed.

## Sources read

Brief; RUNNING-SUMMARY; TASK-043/044/045 notes; REUSE.md and LOGGING-FIELDS.md (EMOM, AMRAP, For
Time, Ladder rows); the reference `gallery-refinement-forms.tsx` (`GalleryLoggingMoment`: timed
contexts open `TimedResultLog` in `LoggingOverlay` titled "Log results"); CURRENT-REQUIREMENTS-AUTHORITY
G07/C40–C45; register notes R43 ("Make this the log button rather than just saying it's done"), R64,
R81, R82, R84, R100; and the owner-reviewed R7 replay bundle (`r7-replay/assets/proposed-*.js`),
whose focused mode draws, once a timed attempt has ended, a primary "Log results" in the
`.clr-timed-actions` row and the log in the dialog titled "Log results".

## Design decisions (recorded, not owner decisions)

- **Opener, not auto-open.** Where a block drew its inline `TimedResultLog`, it now draws one
  "Log results" action in the shared full-width action row (`.clr-timed-actions`, with
  `data-timed-log-opener`, not `data-timed-actions`, so TASK-006's "no lifecycle row once ended"
  stays true). Same draw condition as the inline log had: EMOM ended and unsaved; AMRAP window
  closed; For Time ended; ladder always (its log was always drawn). The R7 replay also opened the
  dialog by itself at Finish/cap; that was not adopted: a modal appearing at a natural cap or on
  every section revisit was judged too surprising, and R43 asks for a button. Recorded as a UAT item.
- **Primary/secondary.** Primary once the attempt has ended; the ladder's opener is secondary
  before its attempt ends (beside its own primary Start/Finish).
- **No Save in the dialog.** The original writer stays the section's one forward action through
  `BlockCompletionProvider` (REQ-013): there was never a per-block Save, and adding one would
  change the writer/controller lifecycle the brief forbids changing. X/Escape close and keep every
  entry (the consumer owns the record). Recorded as a UAT item.
- **Undo finish closes the log.** The ladder's quiet Undo (TASK-014) resumes the attempt on the
  card, so the dialog closes in the same act and the consumer's own handler then focuses Pause or
  Resume (the layout effect closes the dialog before the passive refocus effect runs).
- **Title "Log results"** for every family (accepted reference); the form drops its own heading
  inside the dialog (TASK-016's context), so the dialog's title is its one title.

## Changes (product)

- New shared owner `src/ui/refinements/timed-result-dialog.tsx` (`TimedResultDialog`,
  `TIMED_LOG_OPEN_LABEL`, `TIMED_LOG_TITLE`): takes the consumer's `TimedResultLogProps` unchanged
  plus `openerVariant`; draws the opener and, from the first open on, a portalled `LoggingOverlay`
  holding `TimedResultLog`. Wraps only the ladder's `completionAction` to close first.
  `logging-overlay.tsx` and `timed-result-log.tsx` adopted unchanged.
- `src/ui/emom-block.tsx`, `amrap-block.tsx`, `for-time-block.tsx`, `ladder-block.tsx`: the inline
  `<TimedResultLog …>` becomes `<TimedResultDialog …>` with the same props (ladder adds
  `openerVariant`). No state, writer, report or clock change.
- Gallery: `src/dev/gallery-refinement-forms.tsx` — one doc paragraph (TASK-046 adoption through
  the route's own blocks in `?state=emom|amrap|for_time|ladder`), three register specimens
  appended (`TimedResultDialogEmom`, `…Amrap`, `…ForTimeSecondary`). `src/dev/gallery-registry.tsx`
  — import + one `TimedResultDialog` entry after `TimedResultLog`; `docs/design/library/COMPONENTS.md`
  regenerated (`node scripts/gallery-index.mjs`, 77 entries). No CSS or token change (the
  dialog-held `.clr-timed-log` rule already existed, P01).

## Tests added

- `e2e/refinement/task-046.spec.ts` + `evidence/refinement/task-046/required-cases.json` (check-01,
  6 required cases):
  1. EMOM 390 touch (TASK-AC-1C4999D342BC): no opener before the end; primary opener after the work
     and before coaching; modal "Log results" (`:modal`, X focused, framed, backdrop blur, inert
     behind, form named by the title, no other family's fields); counter-free notes; X and Escape
     keep the note and return focus; clock record untouched; refused save → reopen keeps the note
     → retry writes `notes` once with `minutes_completed`/`elapsed_seconds` null.
  2. AMRAP + For Time + ladder 320 keyboard reduced motion (TASK-AC-47129E192333): ladder opener
     secondary before end; race clock runs 30 s behind the open log; live rounds → Finish → primary
     → Incomplete through 2; Undo by keyboard closes the log, focus on Pause, rounds kept; re-finish,
     round-3 amount + load typed, Escape and reopen keep them; animations hard-cut; AMRAP counts by
     keyboard kept through Escape; For Time Complete corrected to Incomplete + effort; refused first
     block write → logs reopen with entries → retry writes AMRAP rounds 2, For Time
     completed_under_cap false + effort too_hard, ladder highest_rung 2, one goblet movement row
     (round 3, 5 reps, 16); back to the saved section: For Time answer disabled.
  3–6. gallery `emom`, `amrap`, `for_time`, `ladder` in clear, vapour, signal, mono at 390
     (TASK-AC-E2222DBA54CA): opener → focused modal, an entry, X, reopen keeps it, axe, no storage,
     no network.
- `src/ui/timed-result-dialog.test.tsx` (4 cases, task-owned) and the test helper
  `src/test/timed-log-dialog.ts` (opens a block's log from its card for jsdom tests).

## Earlier tests changed (owner decision 2026-11-10), line by line

Owner decision (Eric, 2026-11-10, relayed): "May tasks update earlier tests when their approved
requirement replaces that UI?" — "Yes, go ahead". Case names kept; no `required-cases.json` edited;
each owner's exact guard re-run (see Verification). Line numbers are approximate, in the edited
files. Recurring pattern: (a) the log is opened from the card's "Log results" (helpers
`openLog`/`openerOf`/`logOf`, or `queryTimedLog`/`timedLog` in jsdom) before reading or operating
it; (b) in the browser the log is closed (X or Escape) before any control of the inert workout is
used; (c) placement assertions "the log after the work/before coaching" now read the opener's
place on the card, and the form is asserted to be held by the dialog frame; (d) the inline rule
(`border-block-start`) is asserted absent inside the frame (TASK-018/P01) instead of present; (e)
"Log results" is the dialog's title, not a form heading; (f) where a case read the log while the
"That didn't save" dialog was up, it now dismisses that dialog (Close), reopens the log to read
the same values, closes it and presses the same forward action (the failure's Try again runs that
same `forward()`).

- **TASK-009 check-01, `src/ui/timed-result-log.test.tsx` (AMRAP cases):** helpers ~l.190–235
  (`queryLog`/`log` open the dialog and assert the title/aria-labelledby; `count(label, scope?)`
  reads in the open log); AC-C25-01 ~l.270–305 (opener and title after every reading; capped case
  opener after the list); AC-C26-01 ~l.310–340 (no form in the card, one form in the dialog,
  headings read in the dialog, form draws no heading, title class `clr-accepted-log__title`);
  AC-C28-01 (reset-control checks also in the log); AC-R009-02 failed-save case (log closed
  before Next section); gallery case (opener after the list, reset checks in the log).
- **TASK-010 check-01, same file (completion/effort cases):** `closeTimedLogs()` inserted before
  every `Next section`/`Previous` click (17 sites, file-wide); AC-C29-01 (opener after the list;
  title read in the dialog; retired wording also absent in the form); AC-R010-01 ladder
  (`howFar` in the log); AC-C30-01 (Clear effort / slider / spinbutton / mood lookups in the log);
  gallery case (opener after the list; rounds in the form).
- **TASK-015 check-01, same file:** `entryScope()` added so `movementGroup(s)`/`amountOf`/
  `weightOf` read in the log opened from a card; AC-R015-02 save case reads entries after the
  refused save by reopening each card's log, then closes.
- **TASK-006 / TASK-011 / TASK-013 / TASK-014 check-01, `src/ui/timed-workout-flow.test.tsx`:**
  imports `timed-log-dialog`; `closeTimedLogs()` before `Next section`/`Previous`/`Finish workout`
  (file-wide). TASK-006 "Finish ends each format's attempt" — Work completed read via
  `timedLog(cardOf('ladder'))`. TASK-011 helpers ~l.735 (`queryEmomLog` = `queryTimedLog`, never
  inline); AC-C31-01 placement via the opener (after list and rest, before coaching), title in
  the dialog, form draws no heading. TASK-013 `ladderLog()` opens the log; direct mounts read
  `within(timedLog())`; gallery case `timedLog(card)`. TASK-014: AC-R014-01 Undo-not-offered
  checks read `undoOf('long')` in the log (closing between card actions) and add the in-log count;
  JOURNEY-014 gallery asserts Undo closes the dialog and reopens to read; the For Time/stale-answer
  case reads through `timedLog()`.
- **TASK-012 check-01, `src/ui/ladder-rungs.test.tsx`:** AC-C35-01 order — the opener follows the
  grid, and Work completed (in the log) follows it too; JOURNEY-012 recovery — `howFar` in
  `timedLog(mounted.card)`.
- **TASK-016/017/018 check-01, `src/ui/logging-overlay.test.tsx`:** only the TASK-017 case
  "…while no route claims the logging frame yet" (~l.1530, name kept; now stale wording): the
  For Time forms are opened from their cards with `timedLog`, nothing inline in the cards, and
  the last assertion now states the forms are held by `dialog.clr-accepted-log` (was: no dialog).
- **TASK-009 check-02, `e2e/refinement/task-009.spec.ts` (and the owned repair):** helpers ~l.242–
  275 (`openerOf`, dialog `logOf`, `openLog`, `closeLog`); `LogGeometry`/`readLog` ~l.320–380
  read the card (opener, work, list) and the open dialog (form, title); **the owned fix:** groups
  are `.clr-timed-log__group:not(.clr-timed-log__group--movement)` and new `movementGroups`, with
  `expectLogContract` asserting every movement group's top ≥ the counts group's bottom (C25/C26
  order); C25 placement via the opener; C26 rule → held by the frame, no interior rule. Bodies:
  `countOf/shown(card…)` → `logOf(card)`; opener absent while ready/running/paused (3 sites); touch
  case opens by tap, reopens after reload, closes before Next section, dismisses the failure,
  reopens, reads, closes, Next section; keyboard case opens by Enter and Escapes before Next;
  gallery case opens each attempt (log screenshot attached), and opens cap/early logs for the live
  checks.
- **TASK-010 check-02, `e2e/refinement/task-010.spec.ts`:** helpers ~l.253–300 (dialog-based
  `logOf`, `completionOf`, `effortOf`, `openLog`, `closeLog`); `readResultLog` reads the open form
  and the opener; placement via the opener; title from the dialog. Touch: open by tap; timer read
  before reopening after reload; failure handled as (f). Keyboard: the ladder's log opened by
  Enter and Escaped before Start; after the cap opened by keyboard; Clear effort in the log;
  Escape before Next. Gallery: each attempt opened and closed; live checks in the opened log.
- **TASK-011 check-02, `e2e/refinement/task-011.spec.ts`:** helpers ~l.263–300; `readLog` gains
  `opener`/`held`; contract via the opener, held, no interior rule. Touch: opener absent while
  paused; opened by tap after COMPLETE; failure as (f). Keyboard: the tab order now reaches the
  "Log results" action from the top of the page, Enter opens it, Tab reaches the notes (≤5 presses);
  after reload the log is opened by keyboard; Escape before Next. Gallery: open/close per attempt,
  log screenshots attached.
- **TASK-012 check-02, `e2e/refinement/task-012.spec.ts`:** keyboard case ~l.444: Tab after Start
  ladder lands on the "Log results" action (was: the Complete radio of the inline log), still not
  in the prescription; ~l.463: the log opened by keyboard before reading "Rounds completed".
- **TASK-013 check-02, `e2e/refinement/task-013.spec.ts`:** helpers ~l.281–330 (`openerOf`,
  `logOf`, `openLog`, `openLogByKeyboard`, `closeLog`; `completionOf`/`roundsOf` in the log);
  `readResultTiles` reads the open form; `saveSection` closes the log first. Touch: short log
  opened after Finish, closed before the cap fast-forward; long log opened after the cap (card
  checks first). Keyboard: logs opened by Enter; Escape between ladders and before Next; the long
  log reopened for the tile reading. Recovery: opened after Finish and after the reload. Gallery:
  opened after Finish, log screenshot attached, closed.
- **TASK-014 check-02, `e2e/refinement/task-014.spec.ts`:** helpers ~l.358–410 (as 013, plus
  `undoOf` in the log); `readUndo` reads the open form; `attachLog` also attaches the dialog frame;
  `saveSection` closes first. Touch: opened after each Finish; after Undo the dialog is asserted
  closed, card state read, the log reopened to assert no answer/rounds/Undo, then closed; both
  Undos read by opening each log. Keyboard: logs opened by Enter after each Finish; Escape before
  Next. Recovery: logs opened per check (short then long), closed before Next; failure dismissed
  then log reopened; after Undo the dialog is asserted closed; final reload loop opens each log
  for the disabled answers (lifecycle read first). Gallery: opened after Finish; Undo closes it.
- **TASK-015 check-02, `e2e/refinement/task-015.spec.ts`:** helpers ~l.314–360 (dialog `logOf`,
  `openLog`, `openLogByKeyboard`, `closeLog`; `completionOf` in the log); count/effort/status
  lookups `card.getByRole(...)` → `logOf(card).getByRole(...)`; `attachCard` also attaches the
  dialog frame. Touch: opened after Finish and after the reload; failure as (f); reopened on the
  saved section, closed before History. Keyboard: opened by Enter; Escape before each Next.
  Gallery: each card's log opened before reading (early, capped, early again; cap, finish;
  ladder).

## Non-task tests migrated (superseded UI)

`src/ui/amrap-block.test.tsx` (`openLog()` in `shown`/`recordRounds`/`recordZeroPartial`; "counts
rounds on the card, with no dialog and no other screen" — name kept, now asserts the one dialog is
"Log results" (stale name); "labels each group inside the card" — counts labelled inside the log
dialog, the opener in the card), `src/ui/emom-block.test.tsx` (2 cases: the Log action then the
notes in the dialog; hands-off has no field on the card), `src/ui/ladder-block.test.tsx`
(`openLog()` in `declare`/`roundsCompleted`; headings/radios read with the log open; "says it is
saved inside the card, below the ending" — the opener in the card above "Block saved", the ending
in the dialog), `src/app/Workout.test.tsx` (`performTwoRounds` opens/closes the log;
`roundsShown` opens, reads, closes), `src/dev/gallery-registry.test.tsx` passes via the new
registry entry.

## Sweep (non-protected)

- Edited where superseded, backend lane, not runnable here: `e2e/design-0143/workout-emom.spec.ts`
  (end log opened from its Log action and closed), `workout-amrap.spec.ts` (dialog-scoped
  `roundsShown`/`partialShown`/`countAction`, open/close around reads, failure as (f)),
  `workout-ladder.spec.ts` (`openLog(page, n)`; `ending(page)` reads the open log; failure as (f)).
  Typechecked and linted only.
- Not edited: the five deferred B05 half-sheet specs (owner decision 2026-11-11) —
  `ui-polish-b05-scroll-boundaries.spec.ts` l.818 reads an inline "Rounds completed" and is
  superseded too; left for the end-of-build review. `task-040-lifecycle.spec.ts` /
  `workout-lifecycle.spec.ts` "Work completed toHaveCount(0)" still hold (no log open);
  their "Notes · optional" lookups are the Summary debrief (TASK-045's).

## Failures and corrections

- First full vitest run after the product change: 96 failures in 9 files, all superseded inline-log
  lookups (plus the registry's unframed `TimedResultDialog`). Fixed as listed above.
- `timed-result-dialog.test.tsx`: jsdom sends no native `cancel` for an Escape key press; the case
  dispatches the `cancel` event (as TASK-016's tests do).
- `workout-ladder.spec.ts`: an unused `_index` parameter was an ESLint error; `ending()` now takes
  no index.

## Verification

All on base `fa81c84` (working tree). Every Playwright command ran under
`node /Users/eric/Projects/support-tooling/agent-runner-v2/bin/v2.mjs with-lock --`.

- `node scripts/refinement/run-required-check.mjs --task TASK-046 --check check-01 -- npx playwright test e2e/refinement/task-046.spec.ts --project=mobile`:
  PASSED, 6 total / 6 executed / 6 passed / 0 skipped.
- Earlier owners' exact guards (targets edited), all PASSED, receipts refreshed:
  TASK-006 c01 32/32; TASK-009 c01 10 executed (13 skipped by pattern), c02 3/3; TASK-010 c01 11,
  c02 3/3; TASK-011 c01 9, c02 3/3; TASK-012 c01 9/9, c02 5/5; TASK-013 c01 11, c02 5/5; TASK-014
  c01 15, c02 5/5; TASK-015 c01 13, c02 3/3; TASK-016 c01 13; TASK-017 c01 7; TASK-018 c01 9.
  TASK-009 check-02's three "one result group" cases (l.472, 571, 647 at base) now pass.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks <every task dir except TASK-039>`:
  PASSED (TASK-046 included).
- `npm test` (`vitest run`): 272 files, 6380 tests passed. `npm run build`: passed.
  `npm run lint:ds`: clean. `node scripts/gallery-index.mjs --check`: 77 entries verified.
  `npx eslint` on every changed/new `.ts`/`.tsx`: 0 errors, 139 warnings (all pre-existing
  `react-refresh/only-export-components`; none in the new files). `npx tsc --noEmit`: exit 0.
- Definition checks (not in npm test): TASK-035 passes; TASK-037 and TASK-038 fail only on
  `repo:` source-hash pins, as the cross-task rule expects (verified by receipt). TASK-037's list
  now also names `emom-block.tsx`, `amrap-block.tsx`, `for-time-block.tsx`, `ladder-block.tsx`
  (beside the pins earlier tasks already staled).
- Sweep 1, `npx playwright test e2e/refinement/ --project=mobile --workers=1` (174 tests, 22.8 min):
  173 passed, 1 failed. Per spec: 001 9/9, 002 7/7, 003 5/5, 004 5/5, 005 5/5, 006 7/7, 007 7/7,
  008 5/5, 009 3/3, 010 3/3, 011 3/3, 012 5/5, 013 5/5, 014 5/5, 015 3/3, 020 3/3, 021 6/6,
  022 4/4, 023 5/5, 024 6/6, 025 5/5, 026 5/5, 027 4/4, 028 11/11, 029 13/13, **033 7/8**,
  043 7/7, 044 7/7, 045 7/7, 046 6/6. The task-033 failure is l.902 "long log header: the glass is
  painted over this foreground" (0 changed pixels) on gallery `ladder-long` — the same intermittent
  paint reading TASK-043 recorded; `ladder-long` is not changed here. Re-run: task-033 spec alone
  8/8, and l.902 `--repeat-each=3` 3/3. An earlier run in this task (timed specs + 006/008/033)
  also passed task-033 8/8.
- Sweep 2 (non-refinement, placeholder env `SUPABASE_URL=https://synthetic-review.supabase.invalid
  SUPABASE_ANON_KEY=synthetic-review-placeholder`): `e2e/public-gallery.spec.ts` (renders every
  registered component, including the new `TimedResultDialog` and the timed blocks) — HEAD 2
  passed / 2 failed, base `fa81c84` (clean `git archive` export, same `node_modules`) 2 passed / 2
  failed, identical failures (`heading-order`, `landmark-unique`: the pre-existing public-gallery
  item). A combined run with `ui-polish-b05-movement-countdown`, `-structure-badges` and
  `-summary-facts` aborted at load on both trees (`-structure-badges` and `-summary-facts` read
  out-of-repo `.evidence` reference files that are absent; pre-existing). `-movement-countdown`
  also reads `.evidence` and only starts an AMRAP (no log use); it was not run separately
  [unverified]. No other non-refinement spec that runs locally touches timed results (the rest
  are backend-lane).

## Open items

- UAT: the timed logs open only from their "Log results" action — not automatically at Finish or
  the cap (the R7 replay auto-opened). Owner may prefer auto-open at the athlete's own Finish.
- UAT: the dialog has no Save; closing keeps every entry and the section's Next section / Finish
  workout saves the block (unchanged writer). Owner may want a closing action inside the dialog.
- UAT: after Finish the focus stays where the Finish button was (it is removed); keyboard users
  Tab to "Log results" (pre-existing focus loss on Finish, not changed here).
- UAT: two AMRAPs in one section both say "Log results" (the dialog title is the same).
- Stale case names kept by rule: TASK-017 "…while no route claims the logging frame yet";
  amrap-block "counts rounds on the card, with no dialog and no other screen".
- Copy for TASK-037: "Log results" as the action and dialog title.
- Contrast in the four skins rests on axe only (cross-task rule; TASK-041).
- Cross-route geometry (TASK-041) and cross-family closure (TASK-019) not claimed.

## Next action

Controller verification and commit.
