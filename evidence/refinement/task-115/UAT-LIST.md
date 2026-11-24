# A3 pre-UAT list for Eric (TASK-115)

Body `clear-gallery-adoption-v2-20261120` (A3 body record `clear-gallery-adoption-20261113`), accepted gallery bec4454.
Written by TASK-115 at the end of the run from every merged task's ledger (`rules.forTask115`, `rules.retiredAssertions`)
and the running summary's UAT items. The side-by-side page is
`evidence/refinement/task-115/comparison/index.html` (open it from a Runner V2 worktree of this project; its images
are read from the evidence store).

## Owner items (decide at UAT)

1. **Q-007** (owner decisions of 2026-11-18, decision 8): whether leaving a saved timed log without pressing **Save log**
   keeps the edit. The build keeps today's behaviour.
2. **Generate's Focus control name** (TASK-119): Round 7 names it **Change focus**, so a screen reader does not hear the
   current Focus value (the build said "Focus: <value>"; the accepted gallery names it by its value; WCAG 2.5.3,
   label in name). The approved S4 criterion accepts Round 7's naming. Keep, or a successor fix that puts the value in
   the name.
3. **No Echo inside dialogs** (TASK-120): Round 7's `AppDialog` wraps every dialog in `EchoExcluded`, so the logging
   frame has no Phosphor Echo rear; the build had one. bec4454's REUSE.md line 21 and
   `docs/specs/EFFECTS_COMPOSITION_CONTRACT.md` §2.3 still describe a frame Echo. Keep Round 7, or a successor change to
   `AppDialog`.
4. **X5 (R50)** (TASK-121): the record keeps "Status: not applied in AmrapBlock", although Round 7's /workout AMRAP
   already says "Log when complete" while it runs (TimedWorkoutFlow). Decide whether X5 should be recorded as applied
   by Round 7 (a successor change to X5's assertion).
5. **Retirements to confirm** (each listed in full below):
   - the six R7-3 look retirements and the 38 R7-2 superseded bodies, each with what replaced it;
   - the carried amrap-block body **"does not call an early finish a cap"**, which still asserts the old
     `05:23 on the clock` readout over AmrapBlock, a component the route does not draw (round-07 N11);
   - TASK-121's retired definition-record claims and its re-pointed definition-test assertions;
   - TASK-112: C04 (Review's standard lifts have no rule between them while Workout's do; weakens JOURNEY-001's
     "consistent in both contexts" for standard blocks; restoring it is a Review.tsx change, successor work) and
     AC-C03-01 (a two-word equipment label can wrap onto the next line instead of moving as one unit);
   - TASK-119: the screens state's expanded, four-Anchors, Notes and first-workout reads; the preparation state's
     Regenerate reads; Review's "STANDARD" word;
   - TASK-109: the preparation and cards gallery cases' reads of the actual reading, the Cooldown clock and the
     Review/Workout context switch (proved on the routes instead);
   - TASK-118: the reading max-width, column wrap, label max-width and wrap-as-one-unit look reads, and the build's
     gallery variants/scenes that Round 7's overview and assets states do not draw;
   - TASK-108: the "— finish now" words beside the For Time cap clock (four reads), and the three build bodies retired
     as superseded by Round 7's timer card;
   - TASK-114: three task-041 titles name reads their bodies no longer make (reasons in its ledger);
   - TASK-115's own test updates under the 2026-11-23 rule (listed at the end).


## Look and wording to check on a phone (320 and 390)

**Logging dialogs** (TASK-106, 111, 114, 116, 117, 120)
- Titles sit about 4 px higher (trimmed to the capitals so the X's frame starts on the letters); Firefox ignores
  `text-box` and keeps the old position. Check a real iPhone in Safari.
- Timed-log movement groups are 36 px apart, where the accepted gallery showed 24 (visible in For Time).
- Long logs scroll to the inner lower border, are cut on the chamfer mid-scroll, and show no scrollbar.
- Keyboard-follow was tested only on an emulated viewport: try a real keyboard on iOS and Android, including closing
  the log with the keyboard up.
- The primary button keeps its 6 px glow inside logs.
- The rest-day dialog vanishes on close with no 200 ms fade (as the gallery's Home unmounts it); it opens with focus on
  Reason, where the gallery opens on the X; the rest-day control sits inside the "This week" card, where the gallery
  scene gives it its own card.
- The round dialog with no rest only flashes (a hard cut under reduced motion); the last round counts as no rest.
- AMRAP/For Time effort and notes survive close, reopen and a failed save, but not a reload.
- For Time without a cap is no longer asked "Work completed" and saves no claim; a Complete given at the cap saves
  `completed_under_cap: true`.
- The accepted AMRAP log shows only the load field until a rounds count is entered; the field keeps "Completed in next
  round"; after a reload the EMOM end log keeps its failed-save message and loads but loses the note and effort.
- The build's TASK-046 "no Save" read now reads Round 7's one Save log (still one writer); Enter in the log saves the
  note; a saved For Time log offers Edit log where the build showed disabled choices.
- No Round 7 screen shows a disabled saved effort (proved at component level only).
- Ladder: no Log results while it runs (owner decision 2026-11-16); the movement note keeps its fixed one-line title.

**Timers and warnings** (TASK-108)
- For Time near the cap shows no "— finish now" words: the warning is colour, edge and breathing. Its time to the cap
  is no longer "Cap in MM:SS": the race clock reads "Elapsed" and the cap is on the meta line ("15 MIN CAP").
- Urgent digits breathe down to 20% opacity at the trough of the 1.5 s cycle and hold 50% under reduced motion:
  check legibility on a phone.
- The rest bar turns the low colour (and its fill) at 10 s, not 5 s; the card no longer micro-pulses.
- Two urgent deadlines both breathe with one aura (the accepted gallery stilled the second).
- The header title is h3-sized at 380 px and below (the build used h4).
- The rest card's digits sit beside its label (confirm against the accepted look).
- The circuit round rest and a scheduled ladder's interval are Round 7 TimerFrames.
- TASK-104's 320 px note: pressing Start on a tall timed card scrolled to its top lets scroll anchoring push the
  40 px timer bar just above the scroll area.
- Round 7 wording in ported tests: "Elapsed", "Minute 1 of 10", "Minute N of M · Rest", "Time complete",
  "EMOM time"/"AMRAP time"/"FOR TIME time"/"Ladder time", "Prescribed ladder rounds", "N rounds · 08:00 cap",
  "01 hollow body hold", "Min 1 · 8 reps", "Start FOR TIME".
- Focus removal of the temporary tabindex and the heading fallback are untested (a screen-reader pass would help).

**Timed formats and cards** (TASK-105, 110, 116, 117)
- The AMRAP clock after Finish early shows the window left, not the elapsed time (the elapsed time is still saved).
- The circuit card reads "CIRCUIT" with a "3 ROUNDS" line under the header (Round 7 showed no rounds before one was
  recorded). At 320 px the circuit card is taller than its scroll region, on the route and the gallery.
- A ladder-scheme circuit is badged LADDER (Round 7's glyph rule) though the circuit renderer performs it; the build
  said CIRCUIT.
- A live EMOM with a rest window reads "10 MIN · … · 15s rest at the end of each minute" (no gallery state shows it;
  check the wording and the wrap at 320). Review words the same rest "Rest 15s between rounds".
- Before Start an EMOM marks its second movement Next; Round 7 keeps the EMOM's Now through its rest; the EMOM caption
  adds "· Rest" in the block's own rest and shows no minute when paused or finished early.
- TASK-105's review items: durable ladder, live rung progress and durable Undo finish (the saved row read back ahead
  of the local echo; a refused save kept on the attempt's record).

**Review, Workout and History** (TASK-109, 112, 118, 119)
- Every block card repeats the section name as an H2 (the screen-reader outline repeats it); the live header is an
  H2 too; the group header uses label-sm where the build used label-xs; live ordinals sit inside the name (A1, 1., 10.).
- Review's standard card draws an empty line under its header; at 320 px Review breaks short names next to SWAP
  ("KB / SWING"), and AMRAP and For Time rows read "1 × 10 reps" (base behaviour).
- On Review at 320 and 390 a two-word equipment label continues on a second line under the name ("cable / machine").
- History detail hides the Duration, Focus and Date terms visually (screen readers keep them), adds a Calendar glyph
  and shows a Required equipment group (no gallery state draws that route); glance at per-exercise equipment there.
- Summary's metric cells are 8 px taller than the gallery state's.
- Review has no Swap on warm-up movements (C49); History detail shows the warm-up and cooldown as the concise guide, so
  older warm-up set logs are not listed there while the header's logged-set count includes them; a malformed warm-up
  row on /workout shows its error with no Try again (History has one); guide names are the catalog's lower case
  ("childs pose"); a three-movement Cooldown reads ~4 min where the gallery sample says ~3; the movement note's status
  sits below its opener.
- Generate keeps the Recovery chip (with its note) visible when the choices are closed while Recovery is on: check it
  by eye at 320 and 390. After turning Recovery off, keyboard focus falls back to the page.
- The gallery's screens state still shows Recovery as a fourth Focus choice and "Back to Home", while the route keeps
  R10.1 and R10.5: confirm the illustration can stay. There is a 16 px gap from the Cooldown card to Regenerate.

**Coverage and follow-ups (not UAT failures)**
- Only jsdom and Chromium were tested: no WebKit or real phones.
- Reduced-motion effects composition is proved on the gallery's live components, not on /workout.
- task-019's timed case uses about 2.4 of its 5 minutes locally; on CI's Preview E2E it could time out.
- EMOM per-movement loads and AMRAP partial reps rest on TASK-117's tests and the backend-lane task-047/048, which run
  only in V2 verification (the disposable test lane, PRE-001).
- After the build: talk about paring down the inherited old-build tests (Eric, 2026-11-23); tighten
  `task-011.spec.ts:446`; rewrite the old "nothing is Now during an EMOM rest" check to Round 7's behaviour; make the
  EMOM "saved row wins" case check the typed load is absent. `docs/specs/EFFECTS_COMPOSITION_CONTRACT.md` and the
  coaching-data doc comment still name eded158-era owners (docs refresh, successor work).


## Retirements in full


### R7-3: six look retirements (Eric, chat, 2026-11-20 "Great, go ahead please"; extended 2026-11-22 "Yes, extend R7-3")

- `src/ui/amrap-block.test.tsx` — “ends on its own when the block’s seconds have passed, and only then offers the result”: retired “08:00 on the clock”; “AMRAP complete”; no timer once ended. Replaced by Round 7's AMRAP clock, which stays after the window and after Finish early and reads “Time complete” (TASK-110).
- `src/ui/amrap-block.test.tsx` — “shows the elapsed time when the user finishes early, not the cap”: retired “05:23 on the clock”; “AMRAP complete”. Replaced by Round 7's AMRAP clock, which stays after the window and after Finish early and reads “Time complete” (TASK-110).
- `src/ui/amrap-block.test.tsx` — “comes back into the completion state when the buzzer went while it was away”: retired “08:00 on the clock”; “AMRAP complete”. Replaced by Round 7's AMRAP clock, which stays after the window and after Finish early and reads “Time complete” (TASK-110).
- `src/ui/timed-result-log.test.tsx` — TASK-009 … > AC-C26-01 AMRAP rounds and the partial round are one result group …: retired the dialog’s form has no name of its own (`expect(form).not.toHaveAttribute('aria-label')`, TASK-046). Round 7's accepted TimedResultLog names its form “Log section results”, and that name stays (TASK-117).
- `src/ui/timed-result-dialog.test.tsx` — TASK-046 TimedResultDialog > draws one Log results action …: retired the form is named by the dialog’s title (`form.getAttribute('aria-labelledby') === title.id`, TASK-046). Round 7's accepted TimedResultLog names its form “Log section results”, and that name stays (TASK-117).
- `e2e/refinement/task-046.spec.ts` — expectFocusedLog (every TASK-046 case): retired the form is named by the dialog’s title (`aria-labelledby` → “Log results”) and carries `data-timed-format`. Round 7's accepted TimedResultLog names its form “Log section results”, and that name stays (TASK-117).

### R7-2: Round 7 base bodies over the old timed components, superseded by the ported body of the same title

Each ported body mounts the block through the route’s dispatch (`BlockSlot` under `PRODUCT_PRESENTATION`, i.e. Round 7’s `TimedWorkoutFlow`) and supersedes the base body that read the presentation-less AmrapBlock/EmomBlock/ForTimeBlock.

- TASK-108 `src/ui/emom-block.test.tsx` — “is not low, and claims no loop, while the minute has time left” → superseded by the TimedWorkoutFlow case “the countdown takes the shared countdown warning > is not low, and claims no loop, while the minute has time left”.
- TASK-108 `src/ui/emom-block.test.tsx` — “stays low through the rest remainder, with the phase still in words” → superseded by the TimedWorkoutFlow case “the countdown takes the shared countdown warning > stays low through the rest remainder, with the phase still in words”.
- TASK-108 `src/ui/emom-block.test.tsx` — “stays a labelled timer that is not a live region” → superseded by the TimedWorkoutFlow case “the countdown takes the shared countdown warning > stays a labelled timer that is not a live region”.
- TASK-108 `src/ui/emom-block.test.tsx` — “takes the one loop from a loading region beside it, and gives it back” → superseded by the TimedWorkoutFlow case “the countdown takes the shared countdown warning > takes the one loop from a loading region beside it, and gives it back”.
- TASK-108 `src/ui/emom-block.test.tsx` — “is still under reduced motion and loses nothing it was saying” → superseded by the TimedWorkoutFlow case “the countdown takes the shared countdown warning > is still under reduced motion and loses nothing it was saying”.
- TASK-108 `src/ui/emom-block.test.tsx` — “keeps the timer in its own single frame without remounting the movement list (base body)” → superseded by the TimedWorkoutFlow case “the EMOM runs the clock the block prescribes > keeps the timer in its own single frame without remounting the movement list”.
- TASK-108 `src/ui/amrap-block.test.tsx` — “stands the countdown beside the block’s card, never inside one (base body)” → superseded by the TimedWorkoutFlow case “the 0.14.3 card, timer and group grammar > stands the countdown beside the block’s card, never inside one”.
- TASK-108 `src/ui/for-time-block.test.tsx` — “is not low, and claims no loop, while there is time left” → superseded by the TimedWorkoutFlow case “the clock takes the shared countdown warning > is not low, and claims no loop, while there is time left”.
- TASK-108 `src/ui/for-time-block.test.tsx` — “stays a labelled timer that is not a live region” → superseded by the TimedWorkoutFlow case “the clock takes the shared countdown warning > stays a labelled timer that is not a live region”.
- TASK-108 `src/ui/for-time-block.test.tsx` — “takes the one loop from a loading region beside it, and gives it back” → superseded by the TimedWorkoutFlow case “the clock takes the shared countdown warning > takes the one loop from a loading region beside it, and gives it back”.
- TASK-108 `src/ui/for-time-block.test.tsx` — “is still under reduced motion and loses nothing it was saying” → superseded by the TimedWorkoutFlow case “the clock takes the shared countdown warning > is still under reduced motion and loses nothing it was saying”.
- TASK-108 `src/ui/for-time-block.test.tsx` — “free-paced, %i rounds: rounds listed, no race clock and nothing inferred from it (base body)” → superseded by the TimedWorkoutFlow case “For Time with explicit ladder timing > free-paced, %i rounds: rounds listed, no race clock and nothing inferred from it”.
- TASK-108 `src/ui/for-time-block.test.tsx` — “a capped window inside For Time states the cap it carries (base body)” → superseded by the TimedWorkoutFlow case “For Time with explicit ladder timing > a capped window inside For Time states the cap it carries”.
- TASK-110 `src/ui/amrap-block.test.tsx` — “states the window it prescribes, before it is opened, with no round goal (base body)” → superseded by the TimedWorkoutFlow case “what the AMRAP reads from the block > states the window it prescribes, before it is opened, with no round goal”.
- TASK-110 `src/ui/amrap-block.test.tsx` — “ends on its own when the block’s seconds have passed, and only then offers the result (base body)” → superseded by the TimedWorkoutFlow case “the window closing > ends on its own when the block’s seconds have passed, and only then offers the result”.
- TASK-110 `src/ui/amrap-block.test.tsx` — “shows the elapsed time when the user finishes early, not the cap (base body)” → superseded by the TimedWorkoutFlow case “the window closing > shows the elapsed time when the user finishes early, not the cap”.
- TASK-110 `src/ui/amrap-block.test.tsx` — “counts rounds on the card, with no dialog and no other screen (base body)” → superseded by the TimedWorkoutFlow case “recording rounds afterwards > counts rounds on the card, with no dialog and no other screen”.
- TASK-110 `src/ui/amrap-block.test.tsx` — “takes a round back, and never counts below zero (base body)” → superseded by the TimedWorkoutFlow case “recording rounds afterwards > takes a round back, and never counts below zero”.
- TASK-110 `src/ui/amrap-block.test.tsx` — “is asked for after the window and nowhere before it (base body)” → superseded by the TimedWorkoutFlow case “the partial round > is asked for after the window and nowhere before it”.
- TASK-110 `src/ui/amrap-block.test.tsx` — “counts the reps up and down without leaving the card (base body)” → superseded by the TimedWorkoutFlow case “the partial round > counts the reps up and down without leaving the card”.
- TASK-110 `src/ui/amrap-block.test.tsx` — “sends the result, partial round included, entered after the clock ended the block (base body)” → superseded by the TimedWorkoutFlow case “what it supplies to the shell > sends the result, partial round included, entered after the clock ended the block”.
- TASK-110 `src/ui/amrap-block.test.tsx` — “supplies an entered zero as a zero (base body)” → superseded by the TimedWorkoutFlow case “what it supplies to the shell > supplies an entered zero as a zero”.
- TASK-110 `src/ui/amrap-block.test.tsx` — “labels each group inside the card it belongs to (base body)” → superseded by the TimedWorkoutFlow case “the 0.14.3 card, timer and group grammar > labels each group inside the card it belongs to”.
- TASK-110 `src/ui/amrap-block.test.tsx` — “comes back into the completion state when the buzzer went while it was away (base body)” → superseded by the TimedWorkoutFlow case “surviving a refresh > comes back into the completion state when the buzzer went while it was away”.
- TASK-110 `src/ui/amrap-block.test.tsx` — “keeps the post-window result it was holding, zero included (base body)” → superseded by the TimedWorkoutFlow case “surviving a refresh > keeps the post-window result it was holding, zero included”.
- TASK-110 `src/ui/amrap-block.test.tsx` — “restores an edit made after the window as the edit, not the first entry (base body)” → superseded by the TimedWorkoutFlow case “surviving a refresh > restores an edit made after the window as the edit, not the first entry”.
- TASK-110 `src/ui/emom-block.test.tsx` — “states the window from timer_seconds once the clock is started (base body)” → superseded by the TimedWorkoutFlow case “the EMOM runs the clock the block prescribes > states the window from timer_seconds once the clock is started”.
- TASK-110 `src/ui/emom-block.test.tsx` — “moves the live movement on the boundary, with no tap (base body)” → superseded by the TimedWorkoutFlow case “the minute boundary flips the active work > moves the live movement on the boundary, with no tap”.
- TASK-110 `src/ui/emom-block.test.tsx` — “offers nothing to press once the clock runs: the minute is never marked done (base body)” → superseded by the TimedWorkoutFlow case “the minute boundary flips the active work > offers nothing to press once the clock runs: the minute is never marked done”.
- TASK-110 `src/ui/emom-block.test.tsx` — “rests for the window the block prescribes at the end of every minute (base body)” → superseded by the TimedWorkoutFlow case “the minute boundary flips the active work > rests for the window the block prescribes at the end of every minute”.
- TASK-110 `src/ui/emom-block.test.tsx` — “says the block is done once its last minute has elapsed (base body)” → superseded by the TimedWorkoutFlow case “the minute boundary flips the active work > says the block is done once its last minute has elapsed”.
- TASK-110 `src/ui/emom-block.test.tsx` — “labels nothing on a single-movement EMOM (base body)” → superseded by the TimedWorkoutFlow case “an alternating EMOM says which minutes each movement covers > labels nothing on a single-movement EMOM”.
- TASK-110 `src/ui/emom-block.test.tsx` — “drops a minute marked done by an earlier build: the restored minute is the clock’s (base body)” → superseded by the TimedWorkoutFlow case “the timed state survives a refresh > drops a minute marked done by an earlier build: the restored minute is the clock’s”.
- TASK-110 `src/ui/emom-block.test.tsx` — “restores the countdown and its end-of-minute cue after a background and a refresh (base body)” → superseded by the TimedWorkoutFlow case “the timed state survives a refresh > restores the countdown and its end-of-minute cue after a background and a refresh”.
- TASK-110 `src/ui/emom-block.test.tsx` — “ignores a record no clock can be read against (base body)” → superseded by the TimedWorkoutFlow case “the timed state survives a refresh > ignores a record no clock can be read against”.
- TASK-110 `src/ui/emom-block.test.tsx` — “starts at the top when there is nothing stored, and stores what it starts (base body)” → superseded by the TimedWorkoutFlow case “the timed state survives a refresh > starts at the top when there is nothing stored, and stores what it starts”.
- TASK-110 `src/ui/emom-block.test.tsx` — “carries the identity row and the movement rows (base body)” → superseded by the TimedWorkoutFlow case “the EMOM draws with the shared block frame > carries the identity row and the movement rows”.
- TASK-110 `src/ui/emom-block.test.tsx` — “draws no set-entry form, no Minute done and no exertion prompt, in any phase (base body)” → superseded by the TimedWorkoutFlow case “execution is hands-off (REQ-014) > draws no set-entry form, no Minute done and no exertion prompt, in any phase”.

### The carried body that still reads the old readout (round-07 N11)

- `src/ui/amrap-block.test.tsx` — “does not call an early finish a cap”: carried unchanged (identical at 181e580 and the base); it still asserts `05:23 on the clock` over AmrapBlock, which no route draws. R7-3 retired that readout elsewhere. Confirm it may stay as a component-level read, or retire it in a successor plan.


### TASK-121: definition-record claims retired (no Round 7 source)

- TASK-037.md: I10 and U13 quote `Any partial work belongs to round` [S44] — No Round 7 file holds it: it was the removed src/ui/refinements/ladder.tsx’s copy, and Round 7’s ladder log says `Completed in round` / `Completed in next round` (timed-result-log.tsx). Dropped from both items; nothing replaces it.
- TASK-037.md: I9, I10, U2 and U3 quoted words that only the presentation-less EmomBlock, AmrapBlock and ForTimeBlock write as /workout copy: `NO CLOCK`, `MIN ${view.minute} OF ${view.minutes}`, `AMRAP complete`, For Time’s `Ready` state, `Racing the clock`, `Finished under cap` and `As many rounds as possible. This block prescribes no window, so it ends when you do.` — No route draws those components (BlockSlot hands every timed format to TimedWorkoutFlow), and no other route code writes these words (grep of src outside tests, dev and the three components): Round 7’s EMOM minute reads `Minute ${minute.minute} of ${shape.minutes ?? '—'}`, a no-window EMOM reads `Minute N of —`, the AMRAP and For Time end on `Time complete`, `Cap reached` or `Finished`, History says `Finished under the cap`, and the For Time card draws no state word before Start (no timer frame while ready). Replaced in I9, I10, U2 and U3 by the words TimedWorkoutFlow and its parts draw; U5 keeps AmrapBlock’s `No window prescribed — …` and says no route draws it.
- TASK-038.md: I13: "In the gallery cards state the ten-station circuit repeats I4 ten times (F2) [S17] [S18] [S20]" — Round 7’s cards state has no circuit and does not read GALLERY_CATALOG (the removed src/dev/gallery-refinement-cards.tsx drew it). Replaced by Round 7’s fact: its EMOM, AMRAP and For Time cards each answer I4 for their one movement, because the gallery runtime has no entry for any movement.
- TASK-038.md: F3: "The register’s states specimen (`STATES_CATALOG`, the circuit)" as a drawn specimen [S19] — The removed src/dev/gallery-refinement-coaching.tsx drew it; Round 7 has no coaching gallery page and this task adds none. F3 now records STATES_CATALOG as a kept, unread fixture; its identity lines are unchanged and still recomputed.

### TASK-121: definition-test assertions re-pointed to Round 7 (rehearsal finding 6)

- X2 (R23, Generate helpers) (`scripts/refinement/task-037-definition.test.mjs`): was no string literal of src/app/Generate.tsx holds "Uses this place’s equipment." or "Optional, today only. Ongoing limits go in Settings."; now no text src/app/Generate.tsx draws under the product presentation holds either (productLiterals: in `presentation ? a : b` only `a`, where `presentation` is the file’s useWorkoutExperiencePresentation(); a module constant counts where it is used), no other frontend file holds either as copy or names PLACE_HELPER/NOTES_HELPER, and the app root mounts PRODUCT_PRESENTATION for every route. Why: Round 7’s Generate keeps both helpers for a screen without the product presentation (owner decision 4 of 2026-11-13: "Generate hides the Place/Notes helper text"); the product always mounts it (src/app/AppRuntime.tsx), so the strings are left in a branch no route draws. The old form reads every literal in the file and cannot tell the branches apart.
- X3 (R40, EMOM captions) (`scripts/refinement/task-037-definition.test.mjs`): was now src/ui/emom-block.tsx: "NOT STARTED" and "WORK" absent; "MIN ${…} OF ${…}" present; now now src/ui/timed-workout-flow.tsx and src/state/emom.ts: "NOT STARTED" and "WORK" absent from both; Round 7’s minute "Minute ${…} of ${…}${…}" and the "Now" and "Next" markers present; BlockSlot hands every timed format to TimedWorkoutFlow under the product presentation, and /workout draws every block through BlockSlot. Why: On Round 7’s /workout TimedWorkoutFlow draws the EMOM (with its minute labels from state/emom.ts); EmomBlock, which still holds both captions, is drawn by no route. Never re-pointed to ladder-block.tsx: its scheduled-ladder status still says NOT STARTED, which R40 did not select (U4). The kept minute reads in Round 7’s words (standing test-update rule, Eric, 2026-11-23: "Yes, approve").
- X4 (R43, natural-end sentence) (`scripts/refinement/task-037-definition.test.mjs`): was now src/ui/emom-block.tsx: "The clock has run every prescribed minute. Continue when you are ready." absent; now now src/ui/timed-workout-flow.tsx and src/state/emom.ts: the sentence absent from both (same route-owner reads as X3). Why: TimedWorkoutFlow draws the EMOM on /workout; EmomBlock still holds the sentence and no route draws it.
- X6 (R70, ladder suffix) (`scripts/refinement/task-037-definition.test.mjs`): was now src/ui/refinements/ladder.tsx (removed by Round 7): "— same every round" absent; now now src/ui/ladder-rungs.tsx and src/state/ladder.ts: "— same every round" absent from both; TimedWorkoutFlow draws the ladder through LadderPrescription, which draws ladderRoundReadings. Why: Round 7 removed src/ui/refinements/ladder.tsx and draws the route’s ladder rounds with LadderPrescription from the ladder readings. LadderBlock’s own LadderRound still holds the suffix; no route draws it (BlockSlot hands ladders to TimedWorkoutFlow, which uses only LadderBlock.IntervalCountdown and ScheduleStatus).
- required record sources (`scripts/refinement/task-038-definition.test.mjs`): was Sources lists src/ui/refinements/movement.tsx and src/ui/refinements/workout-card.tsx; now Sources lists src/ui/movement-presentation.tsx (MovementIdentity) and src/ui/block-renderers-frame.tsx (BlockPanel, which places the grouped disclosure). Why: Round 7 removed both files; no ref:accepted-gallery or base: blob holds their bytes (eded158’s versions differ; 03087f7 has neither), so the record cites the Round 7 owners of the same roles.
- coaching gallery page (fixture and catalog identity) (`scripts/refinement/task-038-definition.test.mjs`): was src/dev/gallery-refinement-coaching.tsx draws <GalleryCoachingClients catalog={STATES_CATALOG} and <LiveCard block={CIRCUIT_BLOCK}; now the library Round 7’s cards state reads is the gallery runtime’s (src/dev/gallery-refinement-runtime.tsx: definition: async () => ok(null), so no entry for any movement), mounted under the real TimedWorkoutFlow by LiveFlow; no src/dev file other than the data file names GALLERY_CATALOG or STATES_CATALOG. Why: Round 7 has no coaching gallery page and this task adds none; the old specimen pairing (STATES_CATALOG over CIRCUIT_BLOCK) is drawn by nothing. The identity of what the gallery draws now rests on the runtime library, and F2/F3 are recorded as kept but unread fixtures; their per-slug identity lines are still recomputed from the fixture files (unchanged reads).
- CoachingMovementSection guidance shape (`scripts/refinement/task-038-definition.test.mjs`): was CoachingMovementSection and CoachingPanel each match {opened ? ( … ) : null} with <Guidance inside, no ExerciseNotesField inside, and <ExerciseNotesField exercise={exercise} name={name} /> after it; now CoachingMovementSection matches {opened ? <Guidance … /> : null} (one self-closing Guidance, no parentheses) and CoachingPanel keeps {opened ? ( … ) : null}; the same three reads follow for each; plus GroupCoachingPanel draws one CoachingMovementSection per movement with opened={opened}. Why: Round 7’s per-movement owner (A3 TASK-109) writes the condition without parentheses. The asserted behaviour — guidance only once opened, the note never inside it and drawn unconditionally after it — is read unchanged; the added read binds the section to the grouped disclosure.
- cards gallery page and WorkoutCard slot (`scripts/refinement/task-038-definition.test.mjs`): was src/dev/gallery-refinement-cards.tsx imports GroupExerciseCoaching from ../ui/exercise-coaching and draws coaching={grouped ? <GroupExerciseCoaching ; src/ui/refinements/workout-card.tsx declares coaching?: ReactNode; now GalleryMovementCards (src/dev/gallery-refinement-scenes.tsx) draws LiveFlow emom, amrap and for_time; TimedWorkoutFlow imports GroupExerciseCoaching from ./exercise-coaching and draws it for a single-movement card; BlockPanel imports it, sets groupedCoaching for a non-standard block of more than one movement and draws it right after {children}. Why: Round 7 removed both files. Its accepted cards state still draws the actual owner: each of its three single-movement timed cards ends with GroupExerciseCoaching on the gallery runtime’s memory-only clients (A3 TASK-109’s cards parity reads it), and the real route’s block card places the same owner after a grouped block’s content (the brief’s src/ui/block-renderers-frame.tsx).

## TASK-115's own test updates (2026-11-23 rule) and retirement

- `e2e/refinement/task-021.spec.ts` (JOURNEY-021 keyboard, final seconds in the log): the urgent rest's warning is
  read on its timer — the shared breathe class `clr-countdown-breathe` (TASK-108) where the base read the old
  `clr-pulse-micro`; the build's `data-urgent` read is restored and the still loop kept.
- `e2e/refinement/task-105-parity.spec.ts` (scheduled ladder) and `task-107-parity.spec.ts` (circuit round): Round 7's
  TimerFrame draws a clock's digits one cell per character, so `01:05`, `00:45` and `00:44` are read cell by cell.
- `e2e/ui-polish-home.spec.ts` (JOURNEY-003): the Focus control is read by Round 7's name "Change focus" (see owner
  item 2).
- `e2e/uat-batch-01.spec.ts` (Generate and Settings rulings): "Goal:" is read as Round 7's term "Goal".
- `e2e/ui-polish-pwa-viewport.spec.ts` (JOURNEY-002): the rest-day dialog's scroll owner is Round 7's
  `.clr-logging-overlay__scroll`.
- Retired, for Eric to confirm: `e2e/ui-polish-b05-recent-rows.spec.ts` "History chronology puts the title on its own
  row with status and date beneath (TASK-026)" (two viewports) — owner decision 7 replaced that row with Round 7's
  History order; the unit twin was already retired by the corrected task 2 ledger.

## Reported from the whole e2e run (details in `evidence/refinement/task-115/test-ledger.json`, `rules.wholeE2eRun`)

- The B05 look suites (13 `e2e/ui-polish-b05-*.spec.ts` files, 70 cases in the whole run) still assert UI polish batch 05's look,
  which the old build's refinement and then Round 7 replaced; the same files also fail at the old build 181e580.
- `e2e/contained-shell.spec.ts` (3 cases in the whole run): also failing at the old build.
- `e2e/public-gallery.spec.ts` (2 cases): the gallery's two SectionHeader specimens now share the region name
  "All sections" (TASK-108 hid the "N / M" from the compact toggle's name), an axe landmark-unique finding.
- `e2e/refinement/task-033.spec.ts:1027` and `e2e/focus-ownership.spec.ts:387`: timing in the harness (held page clock;
  the lazy product chunk's loading screen), not a look change.
- `e2e/design-0143/entry-forms.spec.ts` "generate-reads" (backend lane) still reads `/^Focus:/` and "Focus: Lower body";
  it runs only with the test backend, so it was not changed blind here. `task-040-entry-settings.spec.ts`'s Focus case
  is deselected for Foundation 0.14.3 and never runs.
