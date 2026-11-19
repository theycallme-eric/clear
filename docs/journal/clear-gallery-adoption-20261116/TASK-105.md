# TASK-105 — A3 task 5a (F3): durable ladder, live rung progress and Undo finish (#728)

Body `clear-gallery-adoption-v2-20261116`, attempt 1, integration branch
`build/clear-gallery-adoption-2026-11-13`, base `caa3dcce` (TASK-103 and TASK-104 merged). Source
material only: the old build `build/clear-refinement-2026-11-04` (`181e580`). This is the
task-owned progress note; it satisfies the shared daily journal rule for this body. Only TASK-105
writes it.

Round 06 (2026-11-18) continues this work in body `clear-gallery-adoption-v2-20261118`, attempt 1,
branch `v2/clear-gallery-adoption-v2-20261118/task-105-a1`, base `4e65efb1` (TASK-113 merged). The
earlier branch (`3f128bdd`) was merged in unchanged, with its history kept. See "Round 06" below.

Path note: the brief's rules name this folder (`clear-gallery-adoption-20261116`); the issue body
names `clear-gallery-adoption-20261113`. The brief's path is used, as TASK-103 and TASK-104 did.

## Status

Attempt 1, continued after the lane was widened (2026-11-16, `amendment-2026-11-16-lanes-105-widened`:
`src/app/Review.tsx`, `src/ui/ladder-block.tsx`, `src/ui/block-renderers.tsx`,
`evidence/refinement/task-032/`). The two parts the first lane could not reach are now wired, on
top of the first three commits (`4dd6c8de`, `72531f84`, `95704d55`):

1. **Review's ladder rounds** (TASK-AC-F3CDA21AC50B; JOURNEY-012 on `/review`): each ladder's
   `ladderRounds` (`src/state/review.ts`) is drawn under its unchanged movement rows by the live
   ladder's own round grid, `LadderPrescription.Rounds`.
2. **Scheduled ladders on `/workout`** (AC-R012-02, TASK-AC-65E0E29153D0, TASK-AC-72579D52073C for
   `scheduled_starts`): `BlockSlot` sends every ladder to `TimedWorkoutFlow`, which has a schedule
   mode over the same durable attempt.

Every inherited test that the blocked files held back now passes. In the lane-widened round one
carried browser assertion still failed: twelve rounds within one 320 × 568 screen. The owner decided
it on 2026-11-16 (Decision 2), and round 06 makes it pass (see "Round 06").

The first round's status, kept for the record: everything inside the first lane was done and
proved, and the two parts above needed files outside it.

## Round 06 (2026-11-18)

Two things were left. Both are now done.

1. **The twelve-round grid at 320 px** (TASK-AC-30138C4A2AFF; owner decision 2026-11-16, Decision 2:
   "Accept all five"). The earlier "Open" question is closed by that decision.
   - `src/ui/ladder-rungs.css` (gallery-owned): at a narrow phone width, `@media (max-width: 22.5rem)`,
     a round tile's inset (`.clr-ladder-prescription__grid li`) is `var(--spacing-100)` instead of
     `var(--spacing-200)`. The column rule, gap, frame, the frame's own inset and type are unchanged.
     At 390 px nothing changes.
   - Measured on the gallery's `ladder-12` state at 320 × 568: the grid before Start is 544 px (was
     592); while running it is 568 px (was 680, because some live tiles no longer wrap). At 390 × 844
     it is 464 px, as before.
   - The gallery's `ladder-12` (and `ladder-4`, `ladder-long`) states draw the same live component and
     stylesheet, so they change in the same commit and still match the route.
   - TASK-012 check-02's bound is unchanged.
   - The wider tile at 320 px exposed a latent defect, fixed in the same file (see "Round 06: failures
     and corrections"): a live round's toggle now fills its grid cell and starts its words at its top
     (`li > .clr-bleed { flex:1 1 auto }`, `justify-content:flex-start` on the live round), as a
     read-only round does. This is for AC-C33-01 and AC-R013-02. It draws nothing new for the accepted
     states, whose rows hold alike words.
2. **The capped window's pacing paragraph** (TASK-AC-6FBEFBDA2608; AC-R012-02, R71; rehearsal
   findings 2026-11-18, finding 7).
   - `src/ui/ladder-block.tsx` (gallery-owned): `PACING_NOTES.capped_window` is `null`, as in the old
     build. The type is now `string | null`. The presentation-less `LadderBlock` draws its note only
     when there is one.
   - `src/app/FormatPreview.tsx` already skips a `null` note, so `/settings/formats` draws none for the
     capped window. It was not edited. The carried FormatPreview case "shows every ladder timing mode
     with its rungs, read-only" now takes its removed branch. It was not edited either.
   - New required case in `src/ui/ladder-block.test.tsx` (TASK-105 check-01): "a capped window draws
     no pacing paragraph anywhere the product draws a ladder > TASK-AC-6FBEFBDA2608: …". It asserts the
     `null`, the other two lines unchanged, the format preview on its real route (no paragraph in
     "Capped window"; "For time" keeps its line), and the presentation-less block. It failed before
     the change and passes after it.

Other round-06 changes:
- `e2e/refinement/task-105-parity.spec.ts`:
  - Each receipt keeps every moment's round-grid height (`gridHeights`).
  - For each twelve-round state (`ladder-12`, `ladder-long`), before Start, the grid must be shorter
    than the screen at both widths on both sides, and the two sides within 2 px (`expectTwelveFit`).
  - `galleryChanges` lists the narrow-width tile inset with TASK-AC-30138C4A2AFF.
  - Captures now go to this body's folder in the evidence store (`CAPTURE_BODY`,
    `clear-gallery-adoption-v2-20261118/task-105/captures/`), so this run does not overwrite the
    captures the earlier body's receipts hash.
- `evidence/refinement/task-105/required-cases.json`: the new check-01 case; TASK-AC-6FBEFBDA2608
  added to check-01's criteria and TASK-AC-30138C4A2AFF to parity's; the description says what each
  proves.
- `evidence/refinement/task-105/test-ledger.json`: see "Verification (round 06)".

Gallery-owned files changed in round 06: `src/ui/ladder-rungs.css` and `src/ui/ladder-block.tsx`.
Each change is named by a criterion above, and each `ladder-rungs.css` change is listed in the parity
receipts' `galleryChanges`.

### Round 06: failures and corrections

- **TASK-013 check-02 failed at 320 px after the first grid change.** Case "JOURNEY-013 phone-320
  touch", assertion "short live @phone-320: tiles level" (16 px apart). Cause: the four-round timed
  ladder's live tiles (`5 sec plank`, `10 sec plank`, …) sized to their words, not to their grid cell.
  Before, every tile's words wrapped to two lines at 320 px, so the row was level by coincidence. With
  the 8 px wider tile, `5 sec plank` fits one line and `10 sec plank` does not. Read-only tiles were
  already level: their frame has `height:100%`. The Chip-based live toggle sat inside a content-sized
  `.clr-bleed`.
  - First fix: `.clr-bleed` grows to fill its cell. The tiles were then level, but the round labels
    were not (8 px apart): the Chip centres its words vertically.
  - Second fix: the live round's words start at its top (`justify-content:flex-start`), as a read-only
    round's do. The case then passed at 320 and 390. This was diagnosed with a throw-away copy of the
    spec that logged each tile's box. The copy was deleted and is not committed.
- **My regression run overwrote TASK-104's stored ladder captures.** As a regression check for the
  shared stylesheet, I ran `task-104-parity.spec.ts` with `--no-receipt`. `--no-receipt` stops only
  the guard's receipt. The spec still writes its own parity receipts and captures. It overwrote all
  100 captures under `clear-gallery-adoption-v2-20261116/task-104/captures/` in the evidence store
  (2026-11-19, 00:20–00:23). 60 came out byte-identical. 40 now differ from the hashes in TASK-104's
  committed receipts: the `ladder-4` and `ladder-12` captures at 320 and 390 px. No copy of the old
  files was found anywhere under `project-workspaces/`, so they could not be restored. TASK-104's
  receipts in this worktree were restored to their committed state (that file is not this task's).
  Prevention: never run another task's parity spec as a regression check without first pointing its
  captures elsewhere. The TASK-105 spec now writes to its own body folder.
  - **Restored by the controller (repair round 1).** The controller reran TASK-104's parity at
    `4e65efb1`, TASK-104's delivered code, in a throw-away worktree. All 100 stored captures again
    match TASK-104's committed receipts (100/100 hashes), and its receipts came out byte-identical.
    This is no longer open.
- The captures of the earlier body sit in the evidence store under
  `clear-gallery-adoption-v2-20261116/task-105/captures/`. Running the parity spec unchanged would have
  overwritten them under the same names. The spec now writes this body's captures to its own folder.

Carry-forward checks from earlier reviews, confirmed in round 06:
- The 15 TASK-013/TASK-014 tests in `src/ui/timed-workout-flow.test.tsx` are rewritten, not deferred
  (ledger `rules.deferred` is empty). TASK-013 check-01 and TASK-014 check-01 pass.
- No word of a round tile breaks across lines in the running and paused ladders at 390 px (parity's
  `brokenWords` guard, every moment it reads).
- Each parity capture scrolls the card's top into view first (`keep`).

## Repair round 1 (2026-11-19)

The round-06 candidate passed the controller's verification: 20 commands, including TASK-048's two
backend lanes against the disposable test backend. The independent reviewer judged every criterion
and journey met. The review logged one scope issue, the TASK-104 capture overwrite, which the
controller has since restored (see "Round 06: failures and corrections"). This round fixes the
reviewer's three small findings and changes nothing else.

1. **Undo padding wording.** The `galleryChanges` entry in `e2e/refinement/task-105-parity.spec.ts`
   said the Undo button's inline padding is dropped. The code keeps it: the small button keeps its own
   `var(--spacing-300)` inset (so its focus frame clears the first letter), and its row gives the inset
   back outside the box with `margin-inline: calc(var(--spacing-300) * -1)` (`UNDO_TEXT_START` in
   `src/ui/timed-workout-flow.tsx`). The wording now says so. The parity receipts were regenerated.
2. **TASK-048 backend lanes in the ledger.** The two entries said "not run here: PRE-001". They now
   record `passed`, with `resultSource` naming the controller's verification (TASK-048 check-01,
   PASSED 6/6, log `runner-v2/clear-gallery-adoption-v2-20261118/logs/TASK-105-a1-r0-f88398e6-10df-411b-adbb-8c096988f9f7-verify.log`).
   I did not run them: this worktree has no test backend.
3. **This note.** The TASK-104 capture overwrite is recorded as restored by the controller and is no
   longer open.

Verification (repair round 1): see "Verification (repair round 1)" below.

## Intended outcome

- JOURNEY-012/013/014/032 (completion owner) on `/workout`: a raced ladder is Round 7's
  `TimedWorkoutFlow` holding the ladder's one durable attempt. The compact prescription and live
  check-off are `LadderPrescription`. The log is the one "Log results" `LoggingOverlay` with
  `TimedResultLog`, `LadderCompletion`, `SetEffortChoice` and notes. Undo finish · resume ladder
  and save authority work as the build's did.
- The ladder cases of JOURNEY-010/015/019/031 on the same owners.

## Changes

- `src/ui/timed-workout-flow.tsx` (gallery-owned; named by the objective): for a ladder, the
  flow holds `usePersistedLadder` (TASK-032's record, `clear.workout-ladders`). That one owner has
  the clock against the original cap, the progress, the draft (answer, rung, entries, effort,
  notes), the Undo checkpoint and the save state. Other formats are unchanged.
  - The log's draft is the durable draft (changes are sent as patches; an answer and its rung
    always travel together).
  - Undo uses `ladderUndoAvailability`. It re-reads the clock each second while it can run out, so
    it is withdrawn at the original cap.
  - Shell listeners close the attempt in the same act: `onBlockRecorded` (`saved` → saveSucceeded;
    `known` → markRecorded, or `reopenBlock` when this attempt's richer save had failed);
    `onBlockSaveFailed` → saveFailed. Save log failures and successes are kept on the attempt too.
  - A saved ladder shows its row read back (`receiptFromRecorded`); with no row known here it shows
    the draft this device saved, and saved elsewhere it claims nothing. It is closed: no lifecycle,
    even if it was never started, and "Edit log" stays Round 7's correction.
  - Other details: the malformed-ladder note; the timing's own round count; the quiet Undo's row
    gives the small button's inset back (`margin-inline: calc(var(--spacing-300) * -1)`, C60).
  - The clock readout is read from the attempt at render, which fixes Round 7's one-tick-stale
    readout after Undo (all formats; AC-R014-03).
- `src/ui/ladder-rungs.tsx` (gallery-owned; named by the criteria): `LadderPrescription` reads
  the shared `ladderProgressionText` and `ladderRoundReadings`, the readings Review's
  `ladderRounds` also uses.
  - A read-only round is spoken in words. Live toggles keep Round 7's name "Complete round N"
    (pinned by the gallery's own test) and describe their work through `aria-describedby`.
  - A tap inside the selection leaves the rounds before it (`ladderPrefixAfterTap`, AC-R013-01).
    Round 7's live grid used to select through it.
  - Nothing marked reads "No rounds marked yet", not "0 of N" (AC-C34-01; real data only).
  - A live tile keeps the read-only tile's declared inset, so "BURPEE" no longer breaks mid-word at
    390 (JOURNEY-012 "readable wrapping").
  - Hooks `data-ladder-prescription`, `data-ladder-round`, `data-ladder-entry`,
    `data-ladder-movement`, `data-movement-load`.
  - `LadderCompletion`: `data-ladder-rung`, `disabled`, `role="status"` on its count, and the same
    words and tap rule.
- `src/ui/ladder-rungs.css` (gallery-owned): the summary line wraps a long word
  (`overflow-wrap: anywhere`); no drawn change for the accepted states.
- `src/ui/timed-result-log.tsx` (gallery-owned): a durable `saveFailed` message (one alert, the
  accepted words); the ladder's partial-amount fields only once a round is stated (null is not
  round 0); the rung unit is the shared `ladderUnit` (`sec`, not "seconds").
- `src/ui/set-effort.tsx` (gallery-owned): the build's union props (the Clear is always named) and
  `disabled` (TASK-048).
- `src/state/workout-persistence.ts`: `usePersistedLadder` option
  `adoptLegacyClock: 'at-once' | 'on-first-change'`. The default is TASK-032's; the route uses
  TASK-104's lazy adoption, so TASK-104's test holds.
- `src/state/timed-attempt-records.ts`: the ladder branch is removed (one writer).
- Tests:
  - `src/ui/timed-workout-flow.test.tsx`: the 15 TASK-013/TASK-014 build tests, rewritten.
  - `src/ui/ladder-block.test.tsx`: the build's 35 definitions (39 tests).
  - `src/ui/ladder-rungs.test.tsx`: new on this branch, the build's 9.
- E2E: `e2e/refinement/task-012|013|014|048.spec.ts` rewritten for Round 7; new
  `e2e/refinement/task-105-parity.spec.ts` (8 cases).
- Evidence: `evidence/refinement/task-105/required-cases.json`, `test-ledger.json`,
  `parity/*.json`, `results/*.json`; carry notes appended to the TASK-012/013/014/048 manifests'
  descriptions (case names unchanged). Captures are outside Git, in the evidence store under
  `clear-gallery-adoption-v2-20261116/task-105/captures/`, hashed in the receipts.
- `PROJECT_MAP.md`: the ladder's one owner on the route.

Gallery-owned files changed (for the controller's hand diff): `src/ui/timed-workout-flow.tsx`,
`src/ui/ladder-rungs.tsx`, `src/ui/ladder-rungs.css`, `src/ui/timed-result-log.tsx`,
`src/ui/set-effort.tsx`. The gallery states render these live components, so `/gallery/refinements`
shows each change in the same commit. Each parity receipt lists the changes against bec4454 with
their criteria (`galleryChanges`).

### Lane-widened round (2026-11-16)

**Route choice for scheduled ladders.** The controller offered two routes: rework
`ladder-block.tsx`, or send scheduled ladders through `block-renderers.tsx` to a schedule mode in
`TimedWorkoutFlow`. The second is the smaller correct one, so it was taken. The durable attempt,
the "Log results" dialog, the save authority (`onBlockRecorded`, `onBlockSaveFailed`,
`reopenBlock`), the saved-log read-back and "Edit log" already live in `TimedWorkoutFlow`. A
schedule needs only what is different about it: no cap, no check-off, no Pause or Finish, its own
status and countdown, and an end that comes from its clock. Reworking `ladder-block.tsx` would have
copied all of that shared work into a second consumer, which is the look-alike the brief forbids.

- `src/ui/block-renderers.tsx` (gallery-owned): `BlockSlot` no longer skips `scheduled_starts`.
  Under the product presentation every ladder is `TimedWorkoutFlow`.
- `src/ui/timed-workout-flow.tsx` (gallery-owned): the schedule mode.
  - It uses the same `usePersistedLadder` attempt. `ladderRaceCapSeconds` gives a schedule no cap,
    and none is invented here. The start stamp, answer, rung, entries, effort and notes are
    therefore durable, as for a raced ladder.
  - Where the schedule is comes from the attempt's start stamp (`scheduleView`). Its end is the
    attempt's end: the log opens at Incomplete with no round (TASK-010), and only `highest_rung` is
    recorded.
  - Its actions are `Start schedule` and nothing after it.
  - The meta line is the schedule's own `timingSummary`, for example `7 rounds · a new round every 01:15`.
  - Its status and countdown are the schedule's existing parts (`LadderBlock.ScheduleStatus`,
    `LadderBlock.IntervalCountdown`, "Time remaining"). It also keeps its one pacing line and the
    "The clock has run every scheduled round" note.
  - Each round's tile states its start and the live round's `Now` (`Next` before Start), through
    the prescription's round context.
  - There is no Undo: a schedule's end is not a Finish.
  - The once-a-second re-render stops once the schedule has run every round. Its active time is
    capped at the schedule's length.
- `src/ui/ladder-rungs.tsx` (gallery-owned):
  - The round grid is now its own function, `LadderRounds`, exposed as `LadderPrescription.Rounds`
    so Review can draw it. It is not a new exported component, so the gallery register stays
    complete: `LadderPrescription`'s specimens draw it.
  - It takes an optional `roundContext`, which a schedule uses for each round's start
    (`.clr-ladder-prescription__detail`) and its live marker (`[data-ladder-marker]`, with
    `aria-current="step"` on the live round's tile).
  - A round with no context renders exactly the same DOM as before. The accepted states never pass
    a context, so they draw nothing new.
- `src/ui/ladder-rungs.css` (gallery-owned): two rules used only by a schedule's tiles. `__head`
  keeps the round label and its marker on one line; `__detail` wraps the start inside the tile.
- `src/app/Review.tsx` (gallery-owned): grouped blocks draw
  `<LadderPrescription.Rounds rounds={block.ladderRounds} />` after their movement list and before
  the round rest. The accepted rows are unchanged (R65).
- `src/ui/ladder-block.tsx` (gallery-owned):
  - `ScheduleStatus` takes an optional `onStart`. The flow's top action is the schedule's Start.
  - `ScheduleStatus` and `IntervalCountdown` are attached as `LadderBlock.ScheduleStatus` and
    `LadderBlock.IntervalCountdown`.
  - Nothing else in `LadderBlock` changed. It is now drawn only where no presentation is provided
    (tests and specimens). Its legacy schedule list and the "— same every round" suffix are
    reached by no route.
- `src/state/ladder.ts`: `scheduleView`, `ScheduleView` and `roundMarker` moved here from
  `ladder-block.tsx`, unchanged, so both renderers read a schedule the same way.
- Tests:
  - No assertion was changed.
  - Comments in `ladder-block.test.tsx` and `e2e/refinement/task-012.spec.ts` now say where a
    scheduled ladder is drawn.
- `e2e/refinement/task-105-parity.spec.ts`: four new cases.
  - `review phone-320|390`: `/review`'s round grids for the `ladder-4` and `ladder-12` blocks
    beside the grids those accepted states draw before Start. They are compared in words and
    layout (element boxes within 2 px), and each Review card is captured.
  - `scheduled phone-320|390`: `/workout`'s scheduled ladder before Start, running, with its log at
    the end, and ended. No accepted state draws a schedule, so the receipt records
    `disposition: non-applicable` and the words are read against the fixture's own data.
- Evidence:
  - `evidence/refinement/task-105/required-cases.json`: the four new parity cases are declared.
    TASK-AC-F3CDA21AC50B is added to parity's criteria, and the description is updated.
  - The TASK-012 and TASK-105 manifest descriptions now name the schedule mode and Review's grid.
  - `test-ledger.json`: updated (see Verification).
- `PROJECT_MAP.md`: scheduled ladders and Review's grid.

Gallery-owned files changed in this round: `src/ui/timed-workout-flow.tsx`, `src/ui/ladder-rungs.tsx`,
`src/ui/ladder-rungs.css`, `src/ui/block-renderers.tsx`, `src/ui/ladder-block.tsx`, `src/app/Review.tsx`
(all are touched by the gallery commits `1633333c`–`bec44545`). None changes what an accepted
`/gallery/refinements` state draws, because no accepted state passes a round context or draws a
schedule or a Review card. `src/state/ladder.ts` is not gallery-owned.

## Failures and corrections

- Removing the live tiles' "Complete round N" name broke the gallery's own test
  (`src/dev/gallery-refinements.test.tsx`, outside the lane). The name was kept, and the work is
  given as a description instead.
- `usePersistedLadder` writes an older ladder clock as soon as it mounts, but TASK-104's test needs
  the route to adopt it only on the first action. The hook got an explicit option rather than a
  changed default (TASK-032's test pins the default).
- Round 7's log said "seconds" for a timed ladder where its grid said "sec". The log now uses the
  shared `ladderUnit`.
- A saved, never-started ladder offered "Start ladder" and an "Edit log" that opened nothing. Fixed:
  a saved ladder is closed, and its log is offered whether or not it ran here.
- The first C60 fix dropped the button's padding, which the build's browser check rejects (the focus
  frame must clear the first letter). It was replaced by the build's recipe: keep the inset, give it
  back outside the box.
- After Undo, Round 7's readout showed the finished time until the next tick. With the browser clock
  held it never updated (task-014.spec.ts). Fixed in the flow; the unit tests no longer need an
  extra clock read after Undo.
- Browser helpers: Round 7 opens the log by itself a moment after Finish, so `openLog` waits briefly
  for it. The design system's dialog leaves after a 200 ms timer, so `closeLog` runs a held clock by
  that exit only when the dialog has not left (running it unconditionally installed a held clock in
  the gallery case and froze it).
- The parity spec's new word-break guard failed on the unfixed padding (the gallery's running state,
  six broken words) and passes with the fix.

### Lane-widened round: failures and corrections

- **New exported components broke the gallery register.** The first wiring exported `LadderRounds`
  from `ladder-rungs.tsx`, and `ScheduleStatus` and `IntervalCountdown` from `ladder-block.tsx`.
  `src/dev/gallery-registry.test.tsx` (outside the lane) then failed: every component `src/ui`
  exports must be framed in the gallery or exempted. None of these is a new component, so they are
  now parts of the components that own them: `LadderPrescription.Rounds`,
  `LadderBlock.ScheduleStatus` and `LadderBlock.IntervalCountdown`. The register passes unchanged.
- **Two new lint warnings.** Exporting `scheduleView` and `roundMarker` from a component file added
  two `react-refresh/only-export-components` warnings. Both functions moved, unchanged, to
  `src/state/ladder.ts`. Lint is back to 175 warnings and 0 errors, as at base.
- **Clipped captures.** The first parity captures of a Review card and of the schedule were clipped
  at 320 and 390 px. The app's fixed footer and its scroll area cut tall cards, which is the known
  framing artifact from TASK-103. The look-check-only moments now also keep a whole-card capture
  taken in a temporarily tall viewport at the same width (`keepWhole`). Layout comparisons never
  use those captures.
- **The host lock was busy for a long time.** TASK-106's TASK-041 run held it for about 20 minutes.
  The browser checks were retried until the lock freed. This was environment waiting, not a defect.
- **A carried assertion conflicts with the accepted gallery.** At 320 px the twelve-round grid is
  592 px tall, and the bound is the 568 px screen. See "Open: the twelve-round grid at 320 px".

## Verification (repair round 1)

- TASK-105 parity, under the host lock, twice in a row on the same tree. Results are filled in below.

## Verification (round 06, final tree)

Each browser check ran under the host lock (`v2.mjs with-lock`). One attempt waited out a lock held
by another task (environment waiting), then ran. The first round-06 run found the TASK-013 failure
above. The table is the rerun after the fix, on the final tree.

| Check | Result | Notes |
|---|---|---|
| TASK-105 check-01 | PASSED, 111/111 | Was 110; the new TASK-AC-6FBEFBDA2608 case |
| TASK-012 check-01 | PASSED, 9/9 | |
| TASK-012 check-02 | PASSED, 5/5 | Was 4/5. The 320 × 568 twelve-round bound passes, unchanged |
| TASK-013 check-01 | PASSED, 12/12 run | |
| TASK-013 check-02 | PASSED, 5/5 | The first round-06 run failed at 320 px (see corrections) |
| TASK-014 check-01 | PASSED, 14/14 run | |
| TASK-014 check-02 | PASSED, 5/5 | |
| TASK-032 check-01 | PASSED, 10/10 | |
| TASK-048 check-01 | REJECTED, 4/6 | Only the two backend lanes, which stop at PRE-001 (no test backend here). Both synthetic lanes, the deterministic clocks and the gallery case pass |
| TASK-105 parity | PASSED, 12/12 | Zero text and layout differences on every receipt. Twelve-round grids before Start: 544 px at 320 and 464 px at 390, gallery and route alike |
| TASK-006 check-02 | PASSED, 7/7 | Regression, `--no-receipt` |
| TASK-104 parity | PASSED, 10/10 | Regression, `--no-receipt`; see the capture overwrite above |

- `FormatPreview.test.tsx` (not this task's file): 12/12, run directly.
- `gen-issues --check` passed (71 requirements, 136 edges). `gen:types --check`: current. Console
  grep: no match.
- The brief's whole CI chain, run once as one command on the final tree, exits 0:
  - typecheck pass;
  - lint 0 errors, 175 warnings (as base);
  - lint:ds pass;
  - `gen-issues --check` pass;
  - `gen:types --check` current;
  - `npm test` 265 files, 6,284/6,284 tests;
  - `npm run build` pass;
  - console grep: no match.
- Ledger (`evidence/refinement/task-105/test-ledger.json`):
  - 155 entries: 85 carried, 57 rewritten, 13 added, 0 retired, 0 deferred.
  - 153 passed. 2 are the PRE-001 backend lanes, not run here. Repair round 1: the controller's
    verification passed both (see "Repair round 1"), so the ledger now records 155 passed.
  - The earlier `needsDecision` item is moved to `rules.resolved`, citing the owner decision.

## Verification (lane-widened round, final tree)

Receipts are in `evidence/refinement/*/results/`. TASK-006 and TASK-104 are outside the lane, so
they were run with `--no-receipt`. Browser checks ran in one hold of the host lock
(`v2.mjs with-lock`).

| Check | Result | Notes |
|---|---|---|
| TASK-105 check-01 | PASSED, 110/110 | Was 101/110 |
| TASK-012 check-01 | PASSED, 9/9 | Was 5/9 |
| TASK-012 check-02 | REJECTED, 4/5 | Review then Workout passes at 390, and the keyboard, touch-and-recovery (scheduled card) and gallery cases pass. At 320 the only failing check is the build's twelve-rounds-in-one-screen bound: 592 px against 568 px. See Open. |
| TASK-013 check-01 | PASSED, 12/12 run (the pattern filters the rest) | Was 7/8 |
| TASK-013 check-02 | PASSED, 5/5 | |
| TASK-014 check-01 | PASSED, 14/14 run | Was rejected by the schedule case |
| TASK-014 check-02 | PASSED, 5/5 | |
| TASK-032 check-01 | PASSED, 10/10 | With its receipt now that it is in the lane. The receipt is byte-identical to base's. |
| TASK-048 check-01 | REJECTED, 4/6 | Both backend lanes stop at PRE-001 (no test backend here; the controller supplies it). Both synthetic lanes, the deterministic clocks and the gallery case pass. |
| TASK-105 parity | PASSED, 12/12 | The 8 earlier cases plus `review` and `scheduled` at 320 and 390. Zero text and layout differences. |
| TASK-006 check-01 | PASSED, 29/29 | `--no-receipt` |
| TASK-104 check-01 | PASSED, 162/162 | `--no-receipt` |
| TASK-006 check-02 | PASSED, 7/7 | `--no-receipt`; TASK-104's lifecycle journeys over the same flow |

- The brief's whole CI chain, as one command, exits 0:
  - typecheck pass;
  - lint 0 errors, 175 warnings (base 175);
  - lint:ds pass;
  - `gen-issues --check` pass (71 requirements, 136 edges);
  - `gen:types --check` current;
  - `npm test` 265 files, 6,279/6,279 tests;
  - `npm run build` pass, with the two new rules built once each;
  - console grep: no match.
- Diagnostic, not a check: a throw-away copy of `task-012.spec.ts` was run once, with only the
  320 px height bound made `expect.soft`. It reported that bound as the case's only failure, and
  every later assertion passed: removed copy absent, no horizontal overflow, attachments and
  containment. The copy was deleted and is not committed.
- Ledger (`evidence/refinement/task-105/test-ledger.json`):
  - 154 entries: 85 carried, 57 rewritten, 12 added, 0 retired, 0 deferred.
  - 151 passed. 2 are the PRE-001 backend lanes, not run here. 1 failed: the 320 px height bound,
    recorded under `rules.needsDecision`.
  - `rules.blocked` is empty.

## Verification (first round, this worktree)

- Unit: `npx vitest run src/ui/timed-workout-flow.test.tsx`: 28/29. The one failure is JOURNEY-013
  "…and a schedule" (its schedule third; out-of-lane `ladder-block.tsx`).
- `src/ui/ladder-block.test.tsx`: 34/39. The 5 failures are the scheduled-ladder cases.
- `src/ui/ladder-rungs.test.tsx`: 5/9. The 4 failures: Review (Review.tsx) and three
  scheduled-ladder cases.
- State tests (`ladder-save-authority`, `refinement-ladder-recovery`, `review`): 62/62.
- Browser (host lock):
  - `task-013.spec.ts` 5/5; `task-014.spec.ts` 5/5.
  - `task-048.spec.ts` 4/6: both synthetic lanes, the deterministic clocks and the gallery case
    pass. The two backend lanes stop at their PRE-001 precondition (no test backend in this
    worktree).
  - `task-105-parity.spec.ts` 8/8: zero unintended text and layout differences at 320 and 390, and
    no broken word in a live tile.
- CI pieces: typecheck pass; lint 0 errors, 175 warnings (as base); lint:ds pass;
  `gen-issues --check` pass; `gen:types --check` pass; console grep no match.

## Verification (first round, through the guard)

| Check | Result | Why |
|---|---|---|
| TASK-105 check-01 | REJECTED, 101/110 | 5 scheduled-ladder cases in `ladder-block.test.tsx`; Review and 3 scheduled cases in `ladder-rungs.test.tsx` |
| TASK-012 check-01 | REJECTED, 5/9 | The same 4 `ladder-rungs.test.tsx` cases |
| TASK-012 check-02 | REJECTED, 2/5 | The two "Review then Workout" cases stop at Review's missing grid; touch-and-recovery stops at the scheduled card. The keyboard and gallery cases pass. |
| TASK-013 check-01 | REJECTED, 7/8 required | JOURNEY-013 "…and a schedule" |
| TASK-013 check-02 | PASSED, 5/5 | |
| TASK-014 check-01 | REJECTED | All 7 required TASK-014 cases pass. The pattern `undo\|resume\|cap` also runs the blocked JOURNEY-013 "no cap … schedule" case, so the runner exits 1. |
| TASK-014 check-02 | PASSED, 5/5 | |
| TASK-032 check-01 | PASSED, 10/10 | Run with `--no-receipt`: TASK-032's evidence folder is outside the lane |
| TASK-048 check-01 | REJECTED, 4/6 | The two backend lanes stop at their PRE-001 precondition (no test backend here). Both synthetic lanes, the deterministic clocks and the gallery case pass. |
| TASK-105 parity | PASSED, 8/8 | |

- CI chain pieces:
  - typecheck pass;
  - lint 0 errors, 175 warnings (as base);
  - lint:ds pass;
  - `gen-issues --check` and `gen:types --check` pass;
  - console grep: no match;
  - `npm run build` pass (one built rule each for the touched selectors);
  - `npm test` 6,269/6,279. The 10 failures are exactly the out-of-lane cases above.
- Regression: `e2e/refinement/task-006.spec.ts` (TASK-104's lifecycle journeys over the same flow),
  run directly so it writes no receipt: 7/7.
- Side effect to know: TASK-006 check-01 and TASK-104 check-01 run the whole
  `src/ui/timed-workout-flow.test.tsx`, so the one blocked JOURNEY-013 case rejects them too until
  the scheduled ladder is wired. Every TASK-006 and TASK-104 case in the file passes.

## Open assumptions and questions

- **Parked for UAT (scheduled ladder, no gallery state).**
  - The interval countdown is the schedule's existing one (`LadderBlock.IntervalCountdown`, the
    design-system `TimerDisplay`), not Round 7's full-width timer frame.
  - After the last interval it stays at `00:00` in its low colour, as before.
  - Its status words are the existing capitals: NOT STARTED, ROUND N OF M, ON THE CLOCK, COMPLETE.
  - The end note still says "Say how the block ended below"; below it is the "Log results" action.
  - All of this is unchanged schedule behaviour, now inside Round 7's card. Whole-card captures are
    in the evidence store (`scheduled-phone-*-route-*-whole.png`).
- **The legacy `LadderBlock` is otherwise unchanged.** It still draws the "— same every round" list
  for a schedule. Since round 06 it no longer draws the capped window's "Move through the rounds"
  paragraph. No route reaches it: under the product presentation every ladder is `TimedWorkoutFlow`.
  It is kept for presentation-less mounts.
- `src/app/FormatPreview.tsx` (Settings, `/settings/formats`) prints `PACING_NOTES` for the scheduled
  and free-paced modes, and since round 06 nothing for the capped window (finding 7). It was not
  edited.
- Round 7 offers the ladder's log once the attempt has ended. The build let an athlete answer, give
  an effort or write notes before Start or while paused; Round 7's accepted flow does not. The
  inherited tests now enter them after Finish, still before the reloads, Undo and saves that must
  keep them.
- A saved ladder is Round 7's saved log ("Log saved" with the row read back, plus "Edit log" for a
  correction), not the build's disabled form. `SetEffortChoice`'s `disabled` and
  `LadderCompletion`'s `disabled` are carried as component behaviour (the F3 inventory row), but no
  Round 7 surface shows a disabled saved effort. Worth the owner's word.
- Round 7's raced ladders draw no free-paced pacing paragraph ("Start each round when you finish the
  last…"), which the build kept for the `for_time` mode. The rewritten AC-R012-02 case reads Round
  7's flow. Flagged in the ledger.
- Round 7's ladder summary has no equipment word beside the movement (R132 in the build). This is
  the accepted gallery's look and is kept.
- The live toggles' accessible name stays Round 7's "Complete round N"; the round's work is their
  accessible description.
- Undo words are Round 7's "Undo finish · resume ladder" (lower-case "resume"; drawn in capitals).
  The card's "Resume ladder" beside "Log results" is Round 7's too.

## Next action

Controller (repair round 1):
- TASK-048's backend lanes with PRE-001: done in the controller's round-06 verification (passed);
- diff the gallery-owned files by hand: `src/ui/timed-workout-flow.tsx`, `src/ui/ladder-rungs.tsx`,
  `src/ui/ladder-rungs.css`, `src/ui/timed-result-log.tsx`, `src/ui/set-effort.tsx`,
  `src/ui/block-renderers.tsx`, `src/ui/ladder-block.tsx` and `src/app/Review.tsx`;
- look at the round-06 captures in the evidence store, under
  `clear-gallery-adoption-v2-20261118/task-105/captures/`, especially the 320 px ladder-12 and
  ladder-long ones (the tightened grid).
