# TASK-011 — EMOM schedule and end logging without a completion counter (#638)

Body `clear-refinement-v2-20261109b`, attempt 1, base `18a9afa` (after TASK-039 #679 and TASK-001 to
TASK-010 #680 to #689). Task-owned progress note: the approved exception to the shared daily journal
for this body. Only TASK-011 writes this file.

## Intended outcome

REQ-011 (C31, C32; G07, G10, G20; R40, R43, R44, R84; AC-C31-01, AC-C32-01, AC-R011-01,
AC-R011-02) delivered through the EMOM owner (`EmomBlock`) and the shared `TimedResultLog` on the real
`/workout` route (JOURNEY-011, completion owner):

- the minute (`MIN 1 OF 10`), each movement's minute assignment and target, and Now/Next stay;
  only the annotated NOT STARTED and WORK captions go (C32, AC-R011-01; R40);
- when the schedule ends, its end log has no minutes-completed counter, no completion question and
  no confirmation step; the schedule as specified is assumed, and an exception goes in the notes
  (C31, AC-C31-01; R43, R84);
- an exception note never rewrites the actual timing, and an early finish is never a completed
  schedule (AC-R011-02).

Accepted gallery reference `eded158cfd928d382c9a9409e2c372270312741d`, stable states
`/gallery/refinements?state=emom` and `?state=cards`.

## Data integrity: what an EMOM saves (C31, AC-R011-02)

Found at base `18a9afa`, before any change:

- **UI state.** No minutes counter exists on the route. `emom.ts` counts nothing (E01); the view is
  arithmetic on the stored clock. The natural end showed COMPLETE and "The clock has run every
  prescribed minute. Continue when you are ready."; Finish early (TASK-006) showed FINISHED EARLY and
  "Finished early, in minute N of M. …".
- **Stored draft.** `clear.workout-emom`, one record per block:
  `{ startedAt, workDoneMinute: null, pausedAt?, finishedAt? }`. Clock stamps only.
- **Reload.** The clock is restored from those stamps; nothing else.
- **Saved row.** `EmomBlock` gave `BlockPanel` no outcome, so the section's forward action saved
  `{}`: every `block_results` column `null`, including `minutes_completed`, `elapsed_seconds` and
  `notes`.
- **History.** `blockOutcome` reads an EMOM's `minutes_completed` as `Minutes N of M` and drops it
  when null; every block's `block_results.notes` is drawn under its badge (`session-detail.tsx`).
  Rows saved by this build's EMOM therefore showed the badge alone. Rows an earlier build wrote with
  minutes read `Minutes 8 of 10`.
- **Existing notes field and writer for the block.** `block_results.notes` (nullable text),
  `BlockOutcome.notes` → `blockResultInsert` → the shell's one writer on the section's forward
  action, read back by History. Present and unused by every renderer. (Movement notes are a separate
  per-movement writer in Coaching and notes; session notes are Summary's.)

Mapping chosen (derived from R84 and the approved criteria; not a new product decision):

- **"Assume completion" is the log's default, not a stored count.** R84: the assumption "does not
  supply a measured minutes_completed value … nor justify silently filling every prescribed minute";
  AC-R011-02: "without adding another minutes tally". So `minutes_completed` stays `null` for every
  ending, and nothing asks or confirms anything. The saved row is unchanged from before except for
  the note.
- **Early finish.** The card keeps FINISHED EARLY, its minute (`MIN 3 OF 10`) and TASK-006's sentence
  (the actual stop). The log is the same counter-free log. Nothing records it as a completed
  schedule: `minutes_completed` is `null` (History has no Minutes reading, so neither `10 of 10` nor
  `3 of 10`). The clock record keeps its `finishedAt`; the clock running on never turns it into
  COMPLETE. A stop before the last minute without Finish early (the section moved on while running)
  shows no log and saves `{}`.
- **Exceptions in notes.** The log's one field is the existing optional notes (`Notes · optional`,
  the accepted label). A non-blank note is reported as `{ notes }` (as typed; a blank note is not
  an observation) to the block's existing `block_results.notes`, through the shell's one writer.
  History reads it back.
- **Actual timing.** Never rewritten: the EMOM record is byte-identical before and after typing and
  saving a note; no `elapsed_seconds` is written (the EMOM never wrote one, and adding one is a new
  write mapping, TASK-031).
- **No new storage key, persisted field or writer.** The note is this mount's draft (React state).
  It survives a failed save and its retry, because the section keeps the block mounted until it
  saves. Once the block's row is saved the log steps aside (no correction writer for a saved row)
  and the shell's "Block saved" shows. See open assumptions for the reload case.
- **Older records** load and read exactly as before: pre-Pause, retired "Minute done", paused,
  ended-early and expired-while-away records render the same minute and phase, are not rewritten,
  and save `{}` when no note is written. Older rows with `minutes_completed` read `Minutes N of M` in
  History as before (`blockOutcome` unchanged).

No requirements contradiction was found, so no stop was needed: the criteria are met without
inventing completion for an early finish and without a tally.

## Shared owner dispositions

- **EMOM owner `src/ui/emom-block.tsx`: changed.**
  - Captions: `PHASE_WORDS.ready`/`.work` are `null`. `SectionTimer` draws the phase line only when
    it says something more: REST, PAUSED, FINISHED EARLY, FINISHED, COMPLETE.
  - The natural-end sentence is replaced by the end log (R43). The early-finish sentence stays.
  - The end log is `TimedResultLog format="emom"` after the work, the minute's rest and the
    early-finish sentence, before the card's coaching. It is drawn only once the schedule has ended
    and while the block's row is not saved.
  - The outcome is `endLogOutcome(notes)`: `{}` or `{ notes }`, through `BlockPanel`'s completion.
  - Unchanged: Start/Pause/Resume/Finish early (TASK-006), `MinuteCountdown` and its frame and warning
    (TASK-007, TASK-008), `emom.ts`, `workout-persistence.ts`.
- **`src/ui/refinements/timed-result-log.tsx` (`TimedResultLog`): extended, not forked.**
  - New EMOM family (`EmomResultLog`: `format: 'emom'`, `value: { notes }`, `onChange`). One
    untitled group (R90 A) holding the public multiline `Input` labelled `TIMED_NOTES_LABEL`,
    `rows={2}` as the reference.
  - Same form, title, `useInvalidFocus` submit and group recipe as TASK-009/010.
  - Not drawn here, deliberately, though R84/LOGGING-FIELDS list them for the full EMOM log:
    - the optional categorical effort: its writer and read model are TASK-031/TASK-047, and adoption
      for the four timed families is TASK-046. TASK-010 also left the AMRAP without it;
    - applicable movement weights: TASK-015 entry, TASK-031 writer, TASK-046 adoption.
- **`src/ui/refinements/logging-overlay.tsx`: read; deliberately not created.**
  - It is the focused dialog (C40–C45, C57–C59, P01–P03): TASK-016–018 build it, TASK-046 adopts it
    for the EMOM result, TASK-041 closes it.
  - The EMOM log is inline in its card, as TASK-009/010's are (R81 inline location). R43's
    end-of-window "Log" action is therefore the log appearing where the closing sentence was. A Log
    button that opens a dialog is the dialog tasks' entry point.
- **`src/dev/gallery-refinement-forms.tsx`: extended (deliberate consolidation of the reference's
  `GalleryLoggingMoment` `emom` context).**
  - `?state=emom` ("EMOM results") renders the route's actual `EmomBlock` twice over memory-only
    seeded records:
    - the ten-minute two-movement EMOM run to its end (COMPLETE);
    - the reference's own kettlebell-swing sample ended early in minute 4 of 8 (FINISHED EARLY).
  - `GalleryEmomShell` provides the shell's own `BlockCompletionProvider` and `SetLoggingProvider`
    over the gallery's refusing clients. The set-logging provider is there only for the prescribed
    load's unit (`kg`, the gallery's known unit, as the route reads the profile's). Nothing is saved.
  - New export `GalleryLiveEmom` is the `cards` state's live EMOM (below).
  - Register specimens `TimedResultLogEmomBlank` and `TimedResultLogEmomNoted`.
- **`?state=cards`, Workout context (`src/dev/gallery-refinement-cards.tsx`): adopted the actual
  consumer for the EMOM.**
  - The timed composition's EMOM is now the route's own `EmomBlock`, ready, under the section label
    the shell provides: `MIN 1 OF 10`, ODD/EVEN MIN, `MIN 1 · 12 reps`, Next on the first movement,
    Start EMOM, no NOT STARTED.
  - The AMRAP and For Time cards keep the frame's parts (not this task's families).
  - The cards readers of TASK-001/002/003/005/007 pass unchanged (see receipts).
- **`src/ui/refinements/tokens.css`, `presentation.css`: read; nothing added.** The log reuses
  `.clr-timed-log*`; the field is the DS `Input`.
- REUSE.md: one owner, no route-local look-alike, and the gallery draws the actual consumer.
- LOGGING-FIELDS.md "EMOM: accepted no-minutes-counter results, optional categorical Effort/Notes
  and applicable actual movement load; engineering mapping pending". This task delivers the
  no-counter result and the notes on the existing field. Effort and loads are left as above.
- Left for later tasks:
  - TASK-016–018 the dialog, TASK-046 shared logging adoption, TASK-041 closure;
  - TASK-031/047 writers, readback and reload of richer results (durable note drafts among them);
  - TASK-015 truthful notes and loads across edit and retry;
  - TASK-045 movement-note, feedback and rest-day notes;
  - TASK-037 copy (the early-finish sentence and the COMPLETE word stay as TASK-006 left them).

## Changes

- Owners and consumers: `src/ui/emom-block.tsx`, `src/ui/refinements/timed-result-log.tsx`.
- Gallery and register:
  - `src/dev/gallery-refinement-forms.tsx`, `src/dev/gallery-refinement-forms-data.ts`;
  - `src/dev/gallery-refinements.tsx` (state `emom`, "EMOM results");
  - `src/dev/gallery-refinement-cards.tsx` (live EMOM);
  - `src/dev/gallery-registry.tsx` (two `TimedResultLog` specimens, summary);
  - `docs/design/library/COMPONENTS.md` regenerated (69 entries).
- `PROJECT_MAP.md`: refinements row.
- New fixture `src/test/emom-end-log-fixture.ts`, shared by check-01 and check-02. It holds the
  accepted EMOM (kb swing 24 kg, burpee; ten minutes; a 15 s rest in each minute) in the first
  section and a cooldown after it, so `Next section` saves the EMOM's row.
- Evidence: `evidence/refinement/task-011/required-cases.json` (check-01: 8 vitest cases; check-02:
  3 Playwright mobile cases). Receipts in `results/` were written by the guard.

## Tests added and changed

- **check-01:** 8 new cases in `src/ui/timed-workout-flow.test.tsx` (TASK-006's target), in their
  own describe block `TASK-011 EMOM schedule and end logging without a completion counter`.
  - Every case carries "EMOM" through the describe title, so `--testNamePattern EMOM` selects them.
  - Checked before naming: of TASK-006's 9 cases only "AC-R006-01 EMOM and AMRAP Start follows…"
    contains "EMOM". It runs as an undeclared extra and passes (native: 17 total, 9 executed).
  - TASK-006's cases and describe title are not edited.
  - Real router at `/workout`, injected `Date.now`, shared stylesheets applied. Cases:
    - **AC-R011-01:** ready, work, the rest transition, PAUSED and FINISHED EARLY as the exact
      minute-line and phase-line pair; ODD/EVEN MIN; targets.
    - **AC-C32-01:** all ten boundaries (Now, Next in each rest, the other movement's next turn),
      COMPLETE, then a background and a reload mid-rest.
    - **AC-C31-01:** no log before the end; after it, one title, one group and one field (the
      textarea), no output, quantity, spinbutton, radiogroup, checkbox, button, effort or
      count/complete words; the log after the work and rest, before coaching; typing changes no
      stored key or the clock record; submit prevented.
    - **AC-R011-02 natural end:** note → `Next section` → the recorded completion is
      `{ notes }`, and `blockResultInsert` gives every tally and timing column `null`. The clock
      record is unchanged. Back to the section: COMPLETE, no log, "Block saved". History shows the
      note and no Minutes reading.
    - **AC-R011-02 early finish:** paused, then Finish early. `finishedAt` is exact; FINISHED EARLY
      and MIN 3 OF 10 survive the clock running on; `emomView` stays `endedEarly`. After a reload
      the stop is kept and the note field is empty. Saved `{ notes }`, all tallies `null`. History
      has no `N of 10`. A running EMOM saved by `Next section` gets no log and `{}`.
    - **AC-R011-02 failed save:** a refused save keeps the note and the ended schedule; the retry
      writes once, identical.
    - **AC-R011-02 older records:** five stored shapes read, unrewritten, and save `{}`.
      `blockOutcome` gives `Minutes 8/10/0 of 10` or nothing. An older row's `Minutes 8 of 10` and
      its note read back in History.
    - **JOURNEY-011 gallery:** `emom` (both attempts, the log, live typing, memory only) and
      `cards` (the actual ready `EmomBlock`, Start → Now and the timer). No fetch.
  - Mutation checks (each applied to the real file and restored byte for byte, confirmed with
    `cmp`):

    | Mutation | Cases failed |
    | --- | --- |
    | NOT STARTED restored | 2 |
    | WORK restored | 4 |
    | REST removed too (over-removal) | 2 |
    | Natural end reports `minutesCompleted: 10` | 4 |
    | `elapsedSeconds` reported | 4 |
    | A "Minutes completed" `QuantitySelector` added to the log | 3 |
    | Early finish worded COMPLETE | 4 |
    | The note persisted into the EMOM record | 4 |
    | The log kept after save | 1 |
    | The log shown before the end | 3 |
    | The note dropped from the outcome | 3 |

- **check-02:** new `e2e/refinement/task-011.spec.ts` (3 cases, mobile, contained synthetic lane,
  Playwright clock held with `pauseAt` at exact seconds of the block's stored start, explicit
  120–180 s timeouts). The lane accepts only the EMOM's own `block_results` insert (the first
  optionally refused with 503) and answers `session_as_performed` with the recorded row. Any other
  write fails the case. Not backend proof; the backend lane is `workout-emom.spec.ts`.
  - **Touch, 390, Signal:** ready, then +10 s, +46 s (REST, Next burpee), +61 s (MIN 2, Now
    burpee), PAUSED, Resume, then the natural end. Then:
    - geometry: the log after the work and rest, before coaching, its rule, the label above a
      full-width notes field;
    - no tally; axe;
    - the note by touch, with the clock record unchanged;
    - a refused save keeps the note; the retry;
    - both POST bodies `{ minutes_completed: null, elapsed_seconds: null, …, notes }`;
    - History shows the note and no Minutes.
  - **Keyboard, 320, reduced motion, Clear:** Enter on Start, then Tab to Finish early at +130 s:
    - FINISHED EARLY and MIN 3 OF 10, never COMPLETE, even at +900 s; exact `finishedAt`;
    - the notes reached by Tab and typed by keyboard; animations ≤ 0.01 ms; no overflow; axe;
    - a reload keeps the stop, with the note empty;
    - a keyboard save posts the note with no tally;
    - History has no `N of 10`.
  - **Gallery `emom` and `cards`, 390:** both attempts meet the same log contract; live typing; the
    `cards` ready EMOM then Start; axe; no network; route storage untouched.
  - Captures attached:
    - `emom-{ready,running,rest,ended-log,ended-note}-signal-phone-390`;
    - `history-emom-note-signal-phone-390`;
    - `emom-early-log-keyboard-reduced-phone-320`;
    - `gallery-emom-{complete,early}-signal-phone-390`;
    - `gallery-cards-emom-ready-signal-phone-390`.
  - Comparable references: VISUAL-CONTRACTS ties no V/P image to C31/C32. They are the accepted
    `?state=emom`/`?state=cards` and the R7 replay timed EMOM scenes. The captures were inspected:
    the ended log, the early finish at 320 and the ready card read as intended.
- **Updated, superseded by the approved criteria** (each cites TASK-011 and the criterion in place):
  - `src/ui/emom-block.test.tsx`, 12 cases:
    - NOT STARTED/WORK assertions become the minute and Now/Next with no caption (C32,
      AC-R011-01; R40). Cases: "keeps the timer in its own single frame…", "states the window…",
      "moves the live movement…", "offers nothing to press…", "rests for the window…", "drops a
      minute marked done…", "ignores a record no clock can be read against", "starts at the top…",
      "is one block card beside one whole timer frame…", "is still under reduced motion…".
    - "says the block is done…": the closing sentence becomes the end log with no counter (C31; R43,
      R84).
    - REQ-014 hands-off: after expiry the one entry field is the end log's notes (C31). No set form,
      count, Minute done or exertion still holds.
    - 47 cases, same count.
  - Backend lane (cannot run here; typecheck and load under `--list`):
    - `e2e/design-0143/workout-emom.spec.ts`: NOT STARTED becomes MIN 1 OF 6 and Next; two WORK
      assertions become count 0; the closing sentence becomes the log heading and notes field.
      `expectHandsOff` and the row assertions are unchanged and still hold (no note is written
      there).
    - `e2e/design-0143/workout-lifecycle.spec.ts`: WORK becomes `MIN 1 OF n` with WORK count 0.

## Sweep (every spec and test under `e2e/` and `src/`)

Searched for: `NOT STARTED`, `'WORK'`, `WORK` (exact text), `COMPLETE`, `REST`, `FINISHED EARLY`,
`every prescribed minute`, `Continue when you are ready`, `Minutes completed`,
`minutes_completed`/`minutesCompleted`, `minute done`, `Log results`, `clr-timed-log`, `textbox`,
`textarea`, `locator('form')`, `Notes · optional`, `expectHandsOff`, `entryFields`, `state=cards`,
`EMOM, AMRAP and For Time`, and every e2e file mentioning EMOM.

- Fixed: the files above.
- Checked, not superseded:
  - `src/ui/ladder-block.test.tsx` NOT STARTED/COMPLETE: the ladder's own captions, not the EMOM's.
  - `src/ui/timed-workout-flow.test.tsx` TASK-006 cases: MIN 1/2 OF 10, PAUSED, the early-finish
    sentence and `outcome(emomId) = {}` all still hold.
  - Cards-state readers `block-panel`, `group-exercise-coaching`, `movement-identity`,
    `movement-list` and `timer-frame-layout`: badges, metas, loads, the coaching group last, the
    live title tag, no action slot and the header are unchanged with the actual `EmomBlock`.
  - `timed-result-log.test.tsx` (TASK-009/010): the AMRAP, For Time and ladder families are
    untouched.
  - `src/app/Workout.test.tsx`, `SessionDetail.test.tsx`, `session-detail.test.ts`,
    `block-completion*.test.*`, `conditioning*.test.*`: pass. `outcomeSummary` and conditioning
    still read `minutesCompleted`.
  - `e2e/refinement/task-002` (cards timed identities), `task-003` (`MIN 1 OF 10`, cards badges and
    loads), `task-006` (early-finish sentence, `MIN 1 OF 10`, axe after Finish early), `task-007`,
    `task-008` (EMOM minute warning): run through their guards (below).
  - `e2e/design-0143/task-040-lifecycle.spec.ts` (ready oracle only: list and Start EMOM),
    `workout-formats.spec.ts` (navigation), `format-preview.spec.ts`, `collections-settings.spec.ts`
    and `ui-polish-b05-structure-badges.spec.ts` (badges or fixtures): no caption, end text or field
    count read. `e2e/core-loop.spec.ts` holds no EMOM.
  - `focus-ownership.spec.ts` and `app-shell.spec.ts` `locator('form')`: other screens.
  - Observed, not changed (pre-existing documentation staleness, not recorded by earlier notes):
    - `src/ui/block-renderers.tsx` says `EmomBlock` "supplies `minutes_completed`";
    - `block-completion-control.tsx` says "where an EMOM passes its minutes";
    - `block-completion.ts` says "An EMOM knows `minutes_completed`".
    No EMOM has supplied minutes since REQ-014/E01. Comments only; left to avoid widening scope.
  - `src/test/design-0143-final-audit.test.ts`: not modified.

## Failures and corrections

- 12 expected `emom-block.test.tsx` failures after the caption/sentence change were all superseded
  assertions, updated as above, none deleted or skipped.
- `getByRole('status')` in the unit test matched the coaching notes' empty status lines; replaced by
  a direct check for `output`/`.clr-quantity`.
- `field.labels` typecheck on `HTMLElement`; cast to the textarea.
- History's EMOM badge text is `EMOM · 10 MIN`, not `EMOM`; the History locator matches that.
- e2e: a one-shot read right after Resume caught the intermediate render. `useElapsedSeconds`
  recomputes in its effect after the start changes, and the paused page clock runs no interval to
  correct it. This is a test race, not a lasting state: every schedule and marker read is now
  `expect.poll`. A one-frame `MIN 1` flash on Resume may exist (TASK-006's hook, pre-existing; not
  changed here).
- e2e: `filter({ has })` with a scope-rooted inner locator would not match relative to the outer
  element; the inner card locators are page-rooted.

## Verification (this worktree, uncommitted candidate, 2026-11-10)

- `npm ci`: exit 0.
- `node scripts/refinement/run-required-check.mjs --task TASK-011 --check check-01 -- npx vitest run src/ui/timed-workout-flow.test.tsx --testNamePattern EMOM --passWithNoTests=false`:
  PASSED. Native 17 total, 9 executed, 9 passed, 0 failed, 8 skipped (TASK-006's non-EMOM cases),
  0 todo. All 8 declared cases passed; TASK-006's EMOM-named case ran and passed as an extra.
- `node scripts/refinement/run-required-check.mjs --task TASK-011 --check check-02 -- npx playwright test e2e/refinement/task-011.spec.ts --project=mobile`:
  PASSED. Native 3 total, 3 executed, 3 passed (about 21 s; synthetic origin, no credentials used).
  Two direct runs passed before the guard run, one of them with an HTML report written outside the
  repository, used to inspect the captures.
- `npm run build`: exit 0 (`tsc --noEmit` over `src` and `e2e`, then Vite). `npm run lint:ds`: exit 0.
  `node scripts/gallery-index.mjs --check`: 69 verified.
- `npm test`: 262 files, 6206 tests passed, 0 failed (TASK-010: 262 / 6198; +8 is check-01).
  `src/dev/gallery-registry.test.tsx` re-run after the `PROJECT_MAP.md` edit: 10/10.
- `npx eslint` per touched file against `git show HEAD:<file>`: no new error or warning
  (`gallery-registry.tsx` 137 → 137; every other touched or new file 0).
- `npx playwright test <group> --list --project=mobile`:

  | Group | Listed |
  | --- | --- |
  | `e2e/refinement` | 59 tests in 11 files (+3, this spec) |
  | `e2e/design-0143` | 59 in 13 |
  | `e2e/effects` | 27 in 9 |
  | top-level specs, one by one | 39 files load, 422 tests |
  | edited `workout-emom.spec.ts` + `workout-lifecycle.spec.ts` + this spec | 10 tests in 3 files |

  - Not loading, all pre-existing and recorded by TASK-008/009:
    - `generation-deployed-matrix` lists 0 locally by design;
    - `ui-polish-b05-review-groups`, `-structure-badges` and `-summary-facts` stop at an
      import-time read of an absent `.evidence/` reference image.
- Mutation checks on check-01: 11, all caught, all restored byte for byte (see Tests).
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,TASK-002,TASK-003,TASK-004,TASK-005,TASK-006,TASK-007,TASK-008,TASK-009,TASK-010,TASK-011`:
  PASSED, exit 0. Every task has "current passing receipts"; accepted-gallery 1193 files verified;
  Foundation 0.14.3 unchanged.
- Not run here: backend-lane specs (`e2e/design-0143/*`, `e2e/core-loop.spec.ts`) need
  `.env.runner.local`. The two edited ones typecheck and load under `--list`.

## Earlier-task receipts

All refreshed by genuinely re-running their exact approved guard commands. No manifest was touched:
`git diff -- 'evidence/refinement/*/required-cases.json'` is empty. All PASSED:

| Task | check-01 | check-02 |
| --- | --- | --- |
| TASK-001 | 7/7 | 9/9 |
| TASK-002 | 11/11 | 7/7 |
| TASK-003 | 12/12 | 5/5 |
| TASK-004 | 10/10 | 5/5 |
| TASK-005 | 9/9 | 5/5 |
| TASK-006 | 17/17 (its 9 declared plus my 8) | 7/7 |
| TASK-007 | 13/13 | 7/7 |
| TASK-008 | 13/13 | 5/5 |
| TASK-009 | 8 executed of 17 | 3/3 |
| TASK-010 | 9 executed of 17 | 3/3 |

- Why each was re-run:
  - **TASK-006**: its check-01 target was edited (my cases added).
  - **TASK-001, 002, 003, 005, 007**: the `cards` state they read now draws the actual `EmomBlock`.
  - **TASK-002, 003, 006, 007, 008**: they render the EMOM, whose captions and end changed.
    TASK-006's keyboard case ends the EMOM early and scans axe over the new log.
  - **TASK-009, 010**: their shared owner `TimedResultLog` was extended.
  - **TASK-004**: re-run for completeness.
- Changed receipt, as expected: **TASK-006 check-01** only. New target hash; totals 17 / 17
  executed.
- Every other receipt is byte-identical (deterministic): `git status -- evidence/` shows only
  `task-006/results/check-01.json` modified and `task-011/` new.

## Open assumptions / unresolved

- **Note draft durability.** The note is this mount's draft, with no new persisted field (per the
  brief's data-ownership rule and the controller's instruction).
  - It survives a failed save and its retry.
  - A reload, or leaving the section unsaved and coming back, starts it empty. The screen then
    shows exactly what would be saved; nothing is fabricated.
  - Once the row is saved, the log steps aside rather than show a field that could drift from the
    saved note.
  - Durable drafts and saved-result readback/correction belong to TASK-031/TASK-047 (reload, retry,
    History) and TASK-016/TASK-046 (close/reopen of the dialog). If the owner wants the draft
    durable now, it is one optional `notes` string on the existing `clear.workout-emom` record
    (TASK-010's `workCompleted` precedent). That is an owner/controller call, not taken here.
- **Effort and weights** are not in the EMOM log yet (see dispositions). The log is notes only.
- **Natural end vs early finish in the saved row.** Both save `minutes_completed: null`; only the
  athlete's note distinguishes them in `block_results`. The local clock record keeps the actual
  stop. Recording actual EMOM timing would be a new write mapping (TASK-031).
- **Untimed EMOM** (no clock) has no end, so no end log, as before.
- R43's "Log" action is the inline log replacing the closing sentence. A Log button opening the
  focused dialog is TASK-016–018/046's entry point.

## Next action

Controller verification and commit.
