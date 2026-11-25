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
   - TASK-115's own test updates under the 2026-11-23 rule (listed at the end);
   - the 73 old look cases retired under D2 and contained-shell's clear and vapour skin cases retired under D6 (listed
     at the end).
6. **TASK-038's re-record landed after the gallery change** (D7, accepted as is): TASK-038's definition record pins
   `src/dev/gallery-refinement-scenes.tsx`; the D3 gallery change (6ca3dc5f) changed it, and the record's `repo:` hash
   was re-recorded in 7db407d6, the next commit to touch either file (four commits later on the branch, same repair-1
   candidate), where TASK-AC-99A513AC101C asks for the same commit. The final code passes every check; no product
   effect. Eric, chat, 2026-11-24: "Accept as is (Recommended)". Asked: "TASK-115: the hash update for TASK-038's
   record landed one commit after the gallery change. Its criterion asks for the same commit. The final code passes
   every check, and there's no product effect. Accept it as is, listed for UAT?" Confirm at UAT.
7. **The root backend-lane e2e cases did not run** (D8, accepted unrun): 227 old end-to-end cases that need the test
   backend never ran in this build (listed in full at the end). Running them is a follow-up.


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
- **The root backend-lane e2e cases did not run** (227 cases in 27 files, accepted unrun under D8; listed in full at the
  end). Only e2e/refinement's task-047/048 ran with the test backend. Running the rest is a follow-up.
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

## Repair round 1 (Eric's decisions of 2026-11-24)

### D2 — "Retire, list for UAT (Recommended)": 73 old look cases retired

Each case below asserted the old build's UI polish batch 05 look (or `contained-shell`'s entry screens) that Round 7
replaced; each is removed from its file as a whole case (no skip). Those marked **try on the phone** read behaviour,
so check that behaviour by hand at UAT.

- `e2e/contained-shell.spec.ts` (old line 400, 2 cases): “the signal skin … / the mono skin keeps shipped fonts, ground and emission” (the clear and vapour cases were retired later under D6; see repair round 2)
- `e2e/contained-shell.spec.ts` (old line 859, 1 case): “REQ-001 phone shell — entry screens › Welcome and OTP keep full-width rules, fixed chrome and coinciding action frames” — **try on the phone:** Welcome and the OTP screen’s full-width action
- `e2e/ui-polish-b05-active-hierarchy.spec.ts` (old line 920, 3 cases): “B05 active movement hierarchy @ narrow-320 › standard logger cards: selected hierarchy with long names; counter, Rest/Log, saved result, refusal, correction and countdown keep their roles (and 2 more instances)” — **try on the phone:** a standard card’s counter, Rest/Log, saved result, refused save and correction
- `e2e/ui-polish-b05-active-hierarchy.spec.ts` (old line 1022, 3 cases): “B05 active movement hierarchy @ narrow-320 › superset logger cards: selected hierarchy, independent counters and countdown; one Rest and an explicit combined Log round (and 2 more instances)” — **try on the phone:** a superset’s independent counters, countdown, one Rest and the combined log
- `e2e/ui-polish-b05-active-hierarchy.spec.ts` (old line 1086, 3 cases): “B05 active movement hierarchy @ narrow-320 › circuit rows: selected hierarchy closed and with the shared logger open; countdown, Rest entry and round clock keep their roles (and 2 more instances)” — **try on the phone:** circuit rows with the log open: countdown, Rest and the round clock
- `e2e/ui-polish-b05-generate.spec.ts` (old line 739, 3 cases): “B05 Generate @ narrow-short-320 › JOURNEY-005: Home to Generate with the one-line title, removals, Goal/Focus summary with its Focus control, notes and pinned action (and 2 more instances)” — **try on the phone:** Home to Generate: Goal/Focus summary and its Focus control
- `e2e/ui-polish-b05-generate.spec.ts` (old line 793, 3 cases): “B05 Generate @ narrow-short-320 › Recovery session, the Focus control and intensity each keep their own behaviour, Recovery inside the Focus choices (and 2 more instances)” — **try on the phone:** Recovery, the Focus control and intensity on Generate
- `e2e/ui-polish-b05-generate.spec.ts` (old line 862, 3 cases): “B05 Generate @ narrow-short-320 › Generate Time available: MINUTES is whole and comfortably contained in every skin (and 2 more instances)”
- `e2e/ui-polish-b05-generate.spec.ts` (old line 927, 3 cases): “B05 Generate @ narrow-short-320 › Logging keeps its separate Unit Select: its value, choices and behaviour (and 2 more instances)” — **try on the phone:** the set log’s Unit select (value, choices, behaviour)
- `e2e/ui-polish-b05-header-back.spec.ts` (old line 502, 1 case): “B05 REQ-007 header Back housing › Locations: framed icon-only Back, reached in-app, returns to /settings”
- `e2e/ui-polish-b05-header-back.spec.ts` (old line 584, 1 case): “B05 REQ-007 header Back housing › the logging sheet's collapse control keeps its own treatment” — **try on the phone:** the open log’s close/collapse control
- `e2e/ui-polish-b05-movement-countdown.spec.ts` (old line 637, 3 cases): “B05 movement countdown @ narrow-320 › logger card: full-width countdown above its pair, above Rest, through every state; distinct clocks; nothing logged (and 2 more instances)” — **try on the phone:** a movement countdown keeping its deadline and drafts through Rest and the log
- `e2e/ui-polish-b05-movement-countdown.spec.ts` (old line 766, 3 cases): “B05 movement countdown @ narrow-320 › circuit row: the one clock sits in the owning card above Rest and keeps its deadline through load entry; round and AMRAP clocks stay theirs (and 2 more instances)” — **try on the phone:** a circuit row’s clock keeping its deadline through load entry
- `e2e/ui-polish-b05-movement-countdown.spec.ts` (old line 872, 3 cases): “B05 movement countdown @ narrow-320 › superset movement: own-card countdown stays distinct from block rest, retains deadline and drafts, and rearms only after explicit combined logging (and 2 more instances)” — **try on the phone:** a superset movement’s own countdown beside the block rest
- `e2e/ui-polish-b05-rest-log.spec.ts` (old line 544, 2 cases): “B05 Rest and Log @ narrow-320 › Rest opens the sheet with the running prescribed rest; Log saves; collapse, reopen, failure, expiry and Edit keep their contracts (and 1 more instance)” — **try on the phone:** Rest and Log on a standard card: running rest, save, close/reopen, refused save, expiry and Edit
- `e2e/ui-polish-b05-rest-log.spec.ts` (old line 783, 2 cases): “B05 Rest and Log @ narrow-320 › a superset Rest starts the round rest and Log round saves one combined round; circuit rounds are unchanged (and 1 more instance)” — **try on the phone:** a superset’s Rest and Log round saving one combined round
- `e2e/ui-polish-b05-review-groups.spec.ts` (old line 605, 4 cases): “B05 review groups @ narrow-320 › Review (multi-line): grouped hierarchy, right-aligned Swap, one group rest (and 3 more instances)”
- `e2e/ui-polish-b05-review-groups.spec.ts` (old line 728, 1 case): “B05 grouped Review after a real in-memory swap › narrow multi-line name: choose and Undo keep both actions contained and preserve the prescription” — **try on the phone:** Swap and Undo on a long movement name in a grouped Review block
- `e2e/ui-polish-b05-scroll-boundaries.spec.ts` (old line 683, 3 cases): “B05 REQ-003 scroll boundaries › capped workout entry area holds the sheet through a public region at 320x360 (B05-07) (and 2 more instances)” — **try on the phone:** a short phone holding the open log through its scroll region
- `e2e/ui-polish-b05-scroll-boundaries.spec.ts` (old line 800, 1 case): “B05 REQ-003 scroll boundaries › ladder rungs wrap into rep-first tiles with no horizontal rail, and every rung is reachable and revealed in place” — **try on the phone:** the ladder log’s Incomplete answer and every rung reachable at 320
- `e2e/ui-polish-b05-sheet-surface.spec.ts` (old line 762, 3 cases): “B05 sheet surface @ narrow-320x568 › new entry, correction and the combined superset round share the guttered, barred, opaque sheet over a clean backdrop; collapse restores navigation (and 2 more instances)”
- `e2e/ui-polish-b05-sheet-surface.spec.ts` (old line 931, 1 case): “B05 sheet surface @ keyboard resize and semantics › a keyboard-like resize keeps the guttered sheet scrolling through its public region; focus, Escape and outside taps keep their semantics” — **try on the phone:** focus after a keyboard resize in an open log (and Escape/outside tap)
- `e2e/ui-polish-b05-sheet-surface.spec.ts` (old line 1013, 2 cases): “B05 sheet surface @ keyboard resize and semantics › edit retains its draft and explicit save through a focused keyboard-like resize (and 1 more instance)” — **try on the phone:** the footer behind an open log while editing, and the kept draft and explicit save through a keyboard resize
- `e2e/ui-polish-b05-shell.spec.ts` (old line 840, 1 case): “B05 shell: crash fallback renders inside the shared contained shell with safe-area clearance” — **try on the phone:** the crash fallback’s alert inside the shell
- `e2e/ui-polish-b05-structure-badges.spec.ts` (old line 567, 4 cases): “B05 structure badges @ narrow-320 › Review groups (clear): every badge hugs its label in its column parent (and 3 more instances)”
- `e2e/ui-polish-b05-structure-badges.spec.ts` (old line 595, 2 cases): “B05 structure badges @ narrow-320 › Workout section header, BlockPanel and AMRAP badges hug their labels in row parents (and 1 more instance)”
- `e2e/ui-polish-b05-summary-facts.spec.ts` (old line 547, 6 cases): “B05 summary facts @ narrow-320 › Review (bodyweight): title, one aligned glyph fact row with real values, equipment near the top (and 5 more instances)”
- `e2e/ui-polish-b05-summary-facts.spec.ts` (old line 710, 2 cases): “B05 summary facts @ narrow-320 › Session detail keeps its record readouts (distinct variant) (and 1 more instance)”
- `e2e/ui-polish-b05-swap.spec.ts` (old line 838, 2 cases): “B05 REQ-010 roomy swap selection › Superset and Circuit selections preserve their owning grouped Review at narrow (and 1 more instance)” — **try on the phone:** Swap in a superset and a circuit returning to its grouped Review
- `e2e/ui-polish-b05-unit-fields.spec.ts` (old line 484, 2 cases): “B05 unit fields @ narrow-320 › Logging keeps its separate Unit Select: its value, choices and behaviour (and 1 more instance)” — **try on the phone:** the set log’s Unit select (value, choices, behaviour)

### D3 — "Yes, gallery page only (Recommended)": the SectionHeader specimens' region names

On `/gallery` and `/gallery/app` the catalogue draws two SectionHeader specimens; both jump lists were regions named
"All sections" (axe landmark-unique). The full-header specimen's region is now named "All sections, full header
specimen". Gallery page composition only — `SectionHeader` and every route are unchanged:
- `src/dev/gallery-refinement-scenes.tsx` line 1 (React imports) and lines 95–114 (new `GalleryFullSectionHeader`,
  a gallery-only wrapper that labels its specimen's region; `display: contents`, nothing drawn changes);
- `src/dev/gallery-registry.tsx` line 132 (import) and line 2916 (the "full header with progress bar" specimen renders
  `GalleryFullSectionHeader`).
`e2e/public-gallery.spec.ts:5` passes again. TASK-038's definition record pins `gallery-refinement-scenes.tsx`, so its
`repo:` hash was re-recorded (line 57; hash only, TASK-121's editing rules). The re-record landed in 7db407d6, after the
D3 change 6ca3dc5f, not in the same commit as TASK-AC-99A513AC101C asks; Eric accepted that as is (D7, owner item 6:
"Accept as is (Recommended)").

### D4 — "Allow both (Recommended)"

- (b) Timing only, nothing the tests check changed: `e2e/refinement/task-033.spec.ts` lines 1058–1063 (after the movement
  note opens on the held clock, the clock runs 20 ms and the case waits until the cards' collapsed arrival is through,
  as its device-setting step already did); `e2e/focus-ownership.spec.ts` lines 393–395 (waits for /login's "Send code"
  before tabbing). Both pass (task-033 twice).
- (a) Parity retaken through their own guards (two runs each, byte-identical): see RETAKES below.

- TASK-103 (10 receipts: /history's rest-day range is read from today's date, and later look changes), TASK-104 (10,
  after TASK-108's timer frames and TASK-114's dialog frame), TASK-109 (4: the movement note's dialog frame and the
  preparation parts) and TASK-119 (2: the Focus choices' open dialog boxes, TASK-114's frame) were retaken. Look at
  them on the comparison page. TASK-112, 113 and 118 were current. TASK-105, 108, 110, 117 and 120 reproduced their
  committed receipts through their guards.

## Still reported

- `e2e/design-0143/entry-forms.spec.ts` "generate-reads" (backend lane) still reads `/^Focus:/` and "Focus: Lower body".
  Correction: this was never an owner decision. Repair round 1 recorded it as "left as reported (Eric, 2026-11-24)", but
  that wording came from the controller's instruction. It is part of the D8 set (below): not run, accepted unrun.
- (Resolved in repair round 2.) `e2e/contained-shell.spec.ts` "the clear skin / the vapour skin keeps shipped fonts,
  ground and emission" passed in the whole run (no Supabase URL); with a Supabase URL configured both failed on the same
  read as the retired signal and mono cases. Retired under D6; see below.

## Repair round 2 (Eric's decisions of 2026-11-24)

### D6 — "Yes, retire both (Recommended)": contained-shell's clear and vapour skin cases retired

Asked: "TASK-115: two more old look tests fail the same check you retired under D2. They are the clear and vapour skins
on the create-account screen. They fail only when the test backend is set, so the first full run missed them. Retire
them too, on the same terms as D2 (listed for UAT)?" Each asserted the old build's skin look on the create-account
screen (an emitting primary and quiet frame beside the heading), which Round 7 replaced; the whole skin loop is removed
(no skip). Both fail at the old build 181e580 too (an earlier line).

- `e2e/contained-shell.spec.ts` (old line 402, 2 cases): “the clear skin … / the vapour skin keeps shipped fonts, ground and emission” — check the create-account screen's fonts and glow in the clear and vapour skins by eye

### D4 — TASK-104's parity, retaken after a timing fix

TASK-104's look check now holds the browser clock at a fixed time before Start (it followed the real page-load time,
so /workout's header clock, drawn over the top of the tall cards' captures, read a different second from run to run).
Five of its receipts changed only in their route running, paused and ended captures (the header clock reads a fixed
time): amrap, For Time, ladder-4 and ladder-12 at 320, and ladder-12 at 390. Nothing the check reads changed. The
captures are in the evidence store under `clear-gallery-adoption-v2-20261116/task-104/captures/`.

## Repair round 3 (Eric's decision of 2026-11-24)

### D8 — "Accept unrun, list for UAT (Recommended)": the root backend-lane e2e cases did not run

Asked: "TASK-115: about 240 old end-to-end tests that need the test backend never ran in this build. That's mainly core
workout flows, entry forms and 98 database-permission tests. The build's agents have no backend access, and only two
test suites were approved to use it. Its criterion says every old test passes or is retired. How should TASK-115
close?" Option: recorded as not run, with your answer, listed for UAT; running them becomes a follow-up.

The exact count is 227 cases in 27 files: 211 skipped for no backend and 16 design-0143 cases that failed only for the
missing backend. None of them ran anywhere in this build. V2 verification runs only e2e/refinement; there, task-047 and
task-048's four backend cases did run with the test lane and pass. Earlier records said the root cases "run in V2
verification"; that was wrong and is corrected. **Running them is a follow-up.** Until then, nothing they check is
proved for Round 7: the core workout flows on the six design-0143 workout files, the entry forms, the database
permissions, History detail and the signed-in accessibility checks.

Known stale read: `e2e/design-0143/entry-forms.spec.ts:1059` and `:1063` ("generate-reads") still click and read
`/^Focus:/`, where Round 7 names the control "Change focus" (owner item 2). It will fail when the cases are run until it
is updated under the test-update rule.

Not run, by file (cases):
- `e2e/rls.spec.ts`: 98 — the database-permission (row-level security) cases
- `e2e/core-loop.spec.ts`: 1 — a new user from sign-up to Home on every screen of the path (REQ-010; also needs the live model)
- `e2e/design-0143/entry-forms.spec.ts`: 7 — onboarding, Generate (including "generate-reads"), loading, boot and routing
- `e2e/design-0143/optional-feedback.spec.ts`: 2 — the no-feedback journey (TASK-030, JOURNEY-028)
- `e2e/design-0143/task-040-home-review.spec.ts`: 3 — Home and Review before-state journeys (REQ-007, REQ-011)
- `e2e/design-0143/workout-amrap.spec.ts`: 2 — AMRAP save to Summary (JOURNEY-024)
- `e2e/design-0143/workout-circuit.spec.ts`: 7 — circuit save, footer and menu at 320 and 390 (JOURNEY-014, 015, 025)
- `e2e/design-0143/workout-emom.spec.ts`: 1 — EMOM save to Summary (JOURNEY-023)
- `e2e/design-0143/workout-formats.spec.ts`: 1 — every format in one session to Summary (REQ-016)
- `e2e/design-0143/workout-ladder.spec.ts`: 1 — timed ladders save (JOURNEY-029)
- `e2e/design-0143/workout-lifecycle.spec.ts`: 6 — Review, the seven renderers, recovery and Summary across widths and skins
- `e2e/history-detail.spec.ts`: 5 — History to Review or Session detail, Favorites, and another user's session
- `e2e/design-0143/accessibility.spec.ts`: 15 — protected and public routes, JOURNEY-002/003/020, onboarding, reduced motion, focus, forced colours, dialog and toast
- `e2e/generation-database-lane.spec.ts`: 25
- `e2e/auth-otp.spec.ts`: 8
- `e2e/design-0143/collections-settings.spec.ts`: 7
- `e2e/settings-locations.spec.ts`: 7
- `e2e/d6-swap-persistence.spec.ts`: 6
- `e2e/auth-boundaries.spec.ts`: 4
- `e2e/design-0143/format-preview.spec.ts`: 4
- `e2e/auth-screen.spec.ts`: 3
- `e2e/contained-shell.spec.ts`: 3
- `e2e/generation-browser-new-user.spec.ts`: 3
- `e2e/generation-persistence.spec.ts`: 3
- `e2e/generation-browser-returning-user.spec.ts`: 2
- `e2e/session-continuity.spec.ts`: 2
- `e2e/settings-appearance.spec.ts`: 1

Also not run in the whole run, outside D8: `e2e/focus-ownership.spec.ts` (8; skipped because the app had no Supabase
URL, not for a backend; they passed on round 1's reruns with placeholder values) and
`e2e/effects/crt-source-graphic-proof.spec.ts` (1; a diagnostic that runs only when its flag is set).

### D4 — TASK-103's History receipts no longer follow the run date

TASK-103's look check of /history now holds the browser clock at 24 Nov 2026 (it read the real date, so the rest-day
range "… – Mon 23 Nov 2026" changed every day). Its receipts are unchanged.

## Repair round 4 (Eric, chat, 2026-11-24: "One extra round, recorded (Recommended)")

### D4 — TASK-114's dialog look check waits for a settled page

TASK-114's check of the logging dialogs on their real routes could draw the page behind a dialog at two scroll offsets
(12 px apart), because it pressed its control before the page had finished laying out. That page shows through the
dialog's edges and its cut corner. Workout feedback at 320 alternated between two captures from run to run, and the
movement note at 320 and 390 did so more rarely. The check now waits for the page to settle before it presses
anything. Nothing it reads changed and nothing in the app changed. Its receipts are back to the ones taken before
repair 3's verification. The Workout feedback and Movement note dialogs on the comparison page are the same as before.

Every other look check was read and run three times under load: TASK-103, 105, 106, 107, 111, 116, 117 and 120 each
gave the same capture every time and were left unchanged (details in the test ledger, `rules.repairRound4.scan`).
