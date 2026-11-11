# TASK-045 — Adopt shared logging for notes, feedback and rest days (#671)

Body `clear-refinement-v2-20261109b`, attempt 1. This is the task-owned progress note, the approved
exception to the shared daily journal for this body. Only TASK-045 writes this file.

## Status

Implementation complete, awaiting controller verification and commit. Base `e238b38` (after
TASK-044 #718): `git fetch origin && git rebase origin/build/clear-refinement-2026-11-04` exited 0
("up to date").

## Intended outcome

REQ-019 / C45 for this family only (TASK-AC-AF9A8D51EC8F, TASK-AC-6F80AE2AEA26,
TASK-AC-1ADE4EF9CF05). Role: foundation provider contributing to JOURNEY-019. The family's real entry
points open in the shared focused `LoggingOverlay` (native modal, title, framed "Close log" X,
Balanced backdrop) with their own fields, drafts and original writers:

- movement note — a movement's Coaching and notes panel on `/workout` (standalone and grouped);
- workout feedback — `/summary`'s Debrief card;
- rest day / reason change — Home's rest-day control.

No other family is touched or claimed. Cross-family closure (TASK-019) and route geometry (TASK-041)
are not claimed.

## Sources read

Brief; RUNNING-SUMMARY; TASK-043 and TASK-044 notes; REUSE.md and LOGGING-FIELDS.md ("Movement
note", "Workout feedback", "Rest day / reason change"); the reference `gallery-refinement-forms.tsx`
(`ContextForm`: titles Movement note / Workout feedback / Rest day, Save note / Save and close / Save
rest day + Cancel); V14 (Log rest day), V15 (Notes — <movement> dialog opened by "Add note —
<movement>"); and the owner-reviewed R7 replay bundle (`r7-replay/assets/proposed-*.js`), which
already drew this route integration: Summary's Debrief card with a primary "Log workout feedback"
opening "Workout feedback" (form + Save and close, no pinned foot); the note opener "Add note —
<name>" / "Edit note — <name>" with the status beside it while closed, the dialog "Notes — <name>"
holding the field, Save note and status (Save keeps the dialog open); the rest-day editor in a
dialog titled "Log rest day" whose close is Cancel. The implementation follows that replay.

## Changes (product)

- `src/ui/exercise-coaching.tsx` (`ExerciseNotesField`, both the standalone `CoachingPanel` and
  `GroupExerciseCoaching` sections): the panel/section keeps one opener (`Add note — <movement>`,
  `Edit note — …` once the draft holds words) and the note's status beside it while closed. The
  dialog `Notes — <movement>` (portalled to `document.body`, drawn from the first open on and kept
  mounted) holds the same `Notes — <movement>` field, `Save note — <movement>` and the status. X /
  Escape close without saving and keep the draft, status and failure. Writer
  (`useExerciseNotes().save`, null for blank), failure wording and the one busy loop unchanged.
  New exported constants `NOTE_ADD_LABEL`, `NOTE_EDIT_LABEL`.
- `src/app/Summary.tsx`: the debrief is the exported `WorkoutFeedback` component — the Debrief card
  holds `Log workout feedback` (primary); the dialog `Workout feedback` (portalled) holds the same
  `form#summary-debrief` (alert, `FeelingRow`, `Notes · optional`, submit `Save and close`, busy while
  in flight). Same writer (`saveDebrief`, both columns restated, blank notes null, the 2,000-character
  refusal with `useInvalidFocus`). On success the route caches the row and navigates Home (unchanged);
  on failure the alert shows in place with the draft kept. The pinned footer is removed (the replay
  removed it): the dialog's Save and close is the one save-and-leave. New constants
  `LOG_FEEDBACK_LABEL`, `FEEDBACK_TITLE`.
- `src/app/Home.tsx`: `RestDayControl` (now exported) keeps its trigger in the card
  (`aria-expanded` follows the dialog); the editor (native Reason select + effect helper, failure
  alert, Save rest day / Cancel) is in the dialog `Log rest day` (portalled). X and Escape are Cancel
  (the existing meaning: the choice is discarded and the next open starts from the saved reason);
  nothing closes it while the save is in flight. Picker focus on open (U25) kept; focus returns to
  the trigger. Writer `mark({ day, reason, note: null })` unchanged. New constant
  `REST_DAY_LOG_TITLE`.
- `src/ui/refinements/logging-overlay.tsx` (shared owner, one guarded line): a native `close` event
  that arrives while the dialog is open again is ignored. Found by the TASK-045 spec: reopening
  Workout feedback with Enter straight after Escape opened the dialog and the queued `close` event of
  the earlier close then closed it (the `onClose` handler read the new `open === true`). A real close
  still reaches the consumer. Regression test `src/ui/logging-overlay-stale-close.test.tsx`.
- Gallery: new `src/dev/gallery-refinement-notes-logging.tsx` — `GalleryMovementNote` (route
  `ExerciseCoaching` for back squat and a superset `GroupExerciseCoaching`, over TASK-005's
  `GalleryCoachingClients`, push up's write refused), `GalleryWorkoutFeedback` (Summary's
  `WorkoutFeedback` over an in-memory `SummaryContext` client: fresh, and stored with first save
  refused), `GalleryRestDay` (Home's `RestDayControl` over an in-memory `RestDayContext` client, a
  gallery-only `AuthContext` reader and Home's own `weekStrip` placement: unmarked, and marked with
  the first change refused). Three states appended to `src/dev/gallery-refinements.tsx`
  (append-only: one doc paragraph, one import, three rows): `movement-note`, `workout-feedback`,
  `rest-day`. Deliberate consolidation of the reference's synthetic `GalleryLoggingMoment` for these
  contexts; no production writer substituted.
- Shared owners: `logging-overlay.tsx` adopted (plus the one guard above); `timed-result-log.tsx` not
  applicable (no timed result in this family); `gallery-refinement-forms.tsx` read, not changed (its
  TASK-016 `LoggingOverlayWorkoutFeedback` specimen left as it was). No CSS or token changes.

## Tests added

- `e2e/refinement/task-045.spec.ts` + `evidence/refinement/task-045/required-cases.json` (check-01,
  7 required cases):
  1. movement note, 390 touch: the squat's Rest starts the one rest; panel → `Add note — back squat`
     → modal `Notes — back squat` (X focused, framed, backdrop, inert behind, no other family's
     fields, no rest in the dialog, the one rest still counting); X and Escape keep the draft (opener
     becomes `Edit note`, focus returns); refused PATCH keeps the text, marks the field, `Not saved`
     in the dialog and beside the opener after close; retry stores it on the same row; grouped
     superset section's push up note is its own write.
  2. workout feedback, 390 keyboard + reduced motion: no pinned Save and close; `Log workout
     feedback` by Enter → `Workout feedback` with five unchecked feelings, notes, Save and close;
     arrows choose 4, notes typed, Escape keeps both; refused PATCH → alert in place, draft kept,
     still on /summary; retry writes `{ mood: 4, session_notes }` and lands on Home.
  3. rest day, 320 touch: `Mark Rest Day` → `Log rest day`, picker focused, the four reasons, no
     textbox; X discards; refused `mark_rest_day` → alert in the dialog, choice kept; retry writes
     `{ p_reason: 'sick', p_note: null }`, closes, `Rest day saved.`, `Today: Unwell.`, focus on
     Change reason; Change reason reopens at the saved reason; Escape and Cancel discard.
  4–7. gallery `movement-note`, `workout-feedback`, `rest-day` in clear, vapour, signal, mono at 390
     (modal + X, fields, save in memory, refused write kept, axe, no network).
- `src/ui/logging-overlay-stale-close.test.tsx` (1 case, task-owned).

## Earlier tests changed (owner decision 2026-11-10), line by line

Owner decision (Eric, 2026-11-10, relayed): "May tasks update earlier tests when their approved
requirement replaces that UI?" — "Yes, go ahead". Case names kept; no `required-cases.json` edited;
each owner's exact guard re-run. Line numbers are in the edited files.

- **TASK-005 check-01, `src/ui/group-exercise-coaching.test.tsx`** (all 9 cases kept, names
  unchanged; 9/9 executed):
  - helpers (~l.230–260): `noteOpener`, `openNote`, `closeNote` added; `noteField(scope)` now takes
    the note's dialog as scope; `statusText` reads the status beside Save note in an open dialog, or
    beside the opener in a closed section.
  - `expectOneBottomDisclosure` (~l.297): each section's note entry is its enabled opener, with no
    textbox in the section (was: field + Save enabled in the section).
  - "every grouped format" (~l.374): opener enabled instead of field enabled.
  - "each movement keeps its own draft…" (~l.399–470): every type/save/read goes through
    `openNote`/`closeNote`; failure text/aria-invalid/`Not saved` read in the goblet's dialog, then
    `Not saved` beside its opener after close; the other sections' statuses still empty; the writes
    array assertion unchanged.
  - "keeps the note of a movement the library has no entry for" (~l.496–507): field/Save in its
    dialog.
  - "a resumed workout shows each movement's stored note…" (~l.542–565): stored note → opener reads
    `Edit note` and the dialog field holds `Grip chalked`; blank ones → `Add note`, empty field, no
    status. A `userEvent.setup()` was added for the opens.
  - "AC-R005-02 … stay distinct" (~l.587, ~l.594–600): the note "usable beside the loading guidance"
    is its enabled opener; the "blank note is its own state" loop asserts `Add note`, enabled, no
    status (was: empty enabled field).
  - "JOURNEY-005 opens Review…" (~l.606–650): Review also has no note opener; drafts typed in each
    dialog, disclosure closed/reopened, drafts read back through their dialogs; save and the "edit
    after save says nothing" step in the bench dialog, and nothing claimed beside its opener after
    close.
  - "JOURNEY-005 recovery…" (~l.652–676): failure in the dialog, `Not saved` beside the opener after
    close, disclosure closed/reopened, dialog reopened with text + failure, retry saves.
  - gallery cards case (~l.698–703): the plank note typed/saved in its dialog; `Note saved` beside
    its opener after close.
- **TASK-005 check-02, `e2e/refinement/task-005.spec.ts`** (5 cases, names unchanged; 5/5):
  - helpers (~l.366–393): `openerOf`, `noteDialog`, `openNote` (tap), `closeNote` (X tap).
  - JOURNEY-005 (both viewports, ~l.485–575): Review also has no note opener; each note typed /
    saved / refused / retried / read back in its dialog; `Note saved` / `Not saved` read beside the
    opener after close; an extra `checkA11y()` with the refused dialog open.
  - AC-R005-02 (~l.604, ~l.619): opener enabled beside the loading guidance; blank note = `Add note
    — <movement>` opener, no status.
  - keyboard + reduced motion (~l.663–720): Tab reaches the swing's opener (was: the field), Enter
    opens the dialog, Tab to the field, type, Tab to Save, Enter → failure; Escape closes and returns
    focus to the opener; the climber's draft typed in its dialog and closed with Escape; disclosure
    Space/Enter as before; both drafts and the failure read back by reopening; retry by keyboard in
    the dialog, `Note saved` beside the opener after Escape. Every original assertion is kept.
- **TASK-017 check-01 case "…while no route claims the logging frame yet"
  (`src/ui/logging-overlay.test.tsx`)**: not edited. It failed in the first full vitest run because
  the coaching panels in the gallery's timed states drew closed note dialogs; fixed in the product
  (the note dialog is drawn only after its first open), so the case passes unchanged.

## Non-task unit tests migrated (superseded UI)

`src/ui/exercise-coaching.test.tsx` (note via `openNote`; card-containment case now asserts the
opener is in the card and the field/Save in the dialog, not a card in the card; loop case raises the
urgent rest with `hidden: true` since the dialog is open), `src/app/Workout.test.tsx` (note opener/
dialog; debrief through `Log workout feedback`), `src/app/Summary.test.tsx` (`openFeedback()` before
the first feeling/notes/Save use in 16 cases; "keeps the debrief fields in one card… action pinned"
and "keeps completion associated with the scrolling form" rewritten for the dialog — names kept),
`src/app/Home.test.tsx`, `src/app/home-screen.test.tsx`, `src/app/action-glow.test.tsx` (editor
looked up in the `Log rest day` dialog).

## Sweep (non-protected, cannot run locally — backend lane)

Edited where superseded (open the dialog first; editor lookups in the dialog):
`e2e/core-loop.spec.ts` and `e2e/history-detail.spec.ts` (Summary: `expectPinnedAction('Save and
close')` removed — no pinned foot; keyboard reaches `Log workout feedback`, Enter, then `Save and
close`), `e2e/contained-shell.spec.ts`, `e2e/design-0143/optional-feedback.spec.ts`,
`accessibility.spec.ts` (feeling row's container may be the dialog frame; rest-day action group's
container may be the dialog body; JOURNEY-020 opens the dialog after each visit),
`task-040-lifecycle.spec.ts` (dialog opened/closed around the favorite step, the page is inert
under the modal), `task-040-lifecycle-gaps.spec.ts` (Save and close → opener enabled; one Notes
value check dropped — it needs the dialog open inside a capture callback), `task-040-home-review.spec.ts`,
`workout-formats.spec.ts`, `workout-lifecycle.spec.ts` (containment probe rewritten for the dialog
frame). Not run. `workout-lifecycle.spec.ts`'s mood-face assertions (`'Spent'` exact, faces) already
predate U43's numbered feeling row and look stale independently of this task [inferred].
Not edited: the five deferred B05 half-sheet specs (owner decision 2026-11-11);
`ui-polish-action-glow`, `ui-polish-home`, `ui-polish-pwa-viewport`, `uat-batch-01` (page-scoped
locators still resolve inside the portalled dialog).

## Failures and corrections

- First full vitest run after the product change: 46 failures in 8 files, all superseded locators,
  plus TASK-017's "no route claims the logging frame yet" (closed note dialogs in the gallery's timed
  states) — fixed by drawing the note dialog only after its first open.
- Spec: `snapshotFixture` section type `strength` is not an enum value → `primary_lift`.
- Spec: typing notes right after arrow-keying the feeling lost characters — ChoiceGroup moves focus
  on the next animation frame (pre-existing); the spec now waits for the radio's focus first.
- Spec: reopening by Enter right after Escape did not open — the stale `close` event race in
  `LoggingOverlay`, fixed (see Changes) with a regression test.

## Verification

All on base `e238b38`. Every Playwright command ran under
`node /Users/eric/Projects/support-tooling/agent-runner-v2/bin/v2.mjs with-lock --`.

- `node scripts/refinement/run-required-check.mjs --task TASK-045 --check check-01 -- npx playwright test e2e/refinement/task-045.spec.ts --project=mobile`:
  PASSED, 7 total / 7 executed / 7 passed / 0 skipped.
- TASK-005 check-01 (`group-exercise-coaching.test.tsx`): PASSED 9/9/9/0. Receipt refreshed (TASK-038
  depends on it).
- TASK-005 check-02 (`task-005.spec.ts`): PASSED 5/5/5/0. Receipt refreshed.
- `npx vitest run`: 271 files, 6376 tests passed.
- `npm run build`: passed. `npm run lint:ds`: clean.
- `npx eslint` on every changed `.ts`/`.tsx` (product, tests, swept specs): 0 errors, 1 warning
  (`react-hooks/exhaustive-deps`, `Home.tsx` ~l.845, favorites code, not touched here).
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks <every task dir except TASK-039>`:
  PASSED, every receipt current (TASK-045 included).
- `node --test scripts/refinement/task-038-definition.test.mjs` (not in npm test): 7 of 8 pass; the
  shared-checker case fails only on `repo:` source-hash pins of `exercise-coaching.tsx`,
  `group-exercise-coaching.test.tsx`, `exercise-coaching.test.tsx` — expected per the cross-task rule
  (definition records are verified by receipt); its "TASK-005 receipt is current" case passes.
  TASK-037's record pins `repo:src/app/Summary.tsx` and `exercise-coaching.tsx` the same way (not run).
- Full refinement sweep, `npx playwright test e2e/refinement/ --project=mobile --workers=1` under
  the lock (168 tests, 20.3 min): 165 passed, 3 failed. Per spec: task-001 9/9, 002 7/7, 003 5/5,
  004 5/5, 005 5/5, 006 7/7, 007 7/7, 008 5/5, **009 0/3**, 010 3/3, 011 3/3, 012 5/5, 013 5/5,
  014 5/5, 015 3/3, 020 3/3, 021 6/6, 022 4/4, 023 5/5, 024 6/6, 025 5/5, 026 5/5, 027 4/4,
  028 11/11, 029 13/13, 033 8/8, 043 7/7, 044 7/7, 045 7/7. The three task-009 failures (l.472,
  l.571, l.647) are the known pre-existing "one result group" cases owned by TASK-046; not touched.
  The specs using the changed `LoggingOverlay` (016–018 have no spec; 021, 033, 043, 044) all pass.

## Open items

- Copy for TASK-037: "Add note — <movement>", "Edit note — <movement>", "Notes — <movement>" (title),
  "Log workout feedback", "Workout feedback", "Log rest day" (all from the R7 replay / V14 / V15).
- UAT: Summary no longer has a pinned Save and close; leaving through Save means opening the
  feedback first (the replay's composition). Save and close was already the screen's only in-screen
  way forward; nothing else changed about leaving Summary [inferred from the route code].
- UAT: the movement note's text is no longer visible on the card; only `Edit note` says one exists.
- UAT: after a successful note save the dialog stays open on "Note saved" (replay behaviour); after
  a rest-day save it closes; a debrief save leaves for Home.
- UAT: closing a note dialog with an unsaved draft says nothing beside the opener (only `Edit note`).
- Contrast in the four skins rests on axe (`checkA11y`) only; no direct per-element contrast
  measurement (TASK-041).
- The TASK-016 gallery specimen `LoggingOverlayWorkoutFeedback` and doc comments in
  `gallery-refinement-forms.tsx` still say the Summary debrief adopts the dialog "with TASK-045"
  (wording only; not this task's file to rewrite).
- `docs/specs/LOGGING_FIELD_CONTRACT.md` rows 10–12 still read "— (TASK-045 adoption)" (TASK-030's
  contract; not edited).
- Cross-route geometry (TASK-041) and cross-family closure (TASK-019) not claimed.

## Next action

Controller verification and commit.
