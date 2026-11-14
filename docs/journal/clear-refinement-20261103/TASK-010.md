# TASK-010 — Completion choices and existing effort faces (#637)

Body `clear-refinement-v2-20261109b`, attempt 1, base `ac87596` (after TASK-039 #679 and TASK-001 to
TASK-009 #680 to #688). Task-owned progress note: the approved exception to the shared daily journal
for this body. Only TASK-010 writes this file.

## Intended outcome

REQ-010 (C29, C30; R63, R76, R78, R80, R86, R87, R116, R124; AC-C29-01, AC-C30-01, AC-R010-01,
AC-R010-02) delivered through `TimedResultLog` / `ChoiceGroup` / the existing effort control on the
real `/workout` route and its end results (JOURNEY-010, completion owner):

- Complete and Incomplete share one row (C29, R78, R86, R87);
- the starting answer follows the work and the clock the block actually tracked, never a Finish
  alone, and the athlete can correct it (AC-R010-01, R78, R124);
- the existing three faces (Frown / Meh / Smile, Too hard / About right / Too easy) are reused with
  their categories, words, tick, focus and keyboard behaviour; effort stays optional and `null` when
  unanswered, and is never the numeric block effort or the session mood (C30, AC-R010-02, R76, R80,
  R63, R116).

Accepted gallery reference `eded158cfd928d382c9a9409e2c372270312741d`, stable states
`/gallery/refinements?state=for_time` and `?state=ladder`.

## Selected design (derived from the approved sources, not a new product decision)

- **Where the question is asked (R78).** Only where full prescribed-work completion is meaningful:
  For Time and the ladder. R78 and R80 say explicitly that the AMRAP score and EMOM minutes do not get
  it.
- **The row (C29).** The shared log's result group asks `Work completed` (the accepted owner's
  legend and R78's "shown shared Work completed question") with `Complete` and `Incomplete` as the
  two chips of one `ChoiceGroup` radiogroup, under the accepted `.clr-timed-completion` recipe
  (no wrap, equal shares, centred). It replaces the ladder's `How did this block end?` /
  `Finished the ladder` / `Hit the time cap` / `Fell behind the schedule`. One tab stop, arrows,
  Home/End, tick plus colour (the chip's own). A radiogroup cannot be emptied: once answered, the
  athlete corrects by choosing the other answer.
- **Starting answer (AC-R010-01; R78, R86, R87, R124).**
  - For Time (`forTimeCompletion` in `src/state/for-time.ts`): the log appears once the race has
    ended. Finish under the cap starts at Complete (R78's manual-Finish default; in For Time the
    athlete's Finish is their report that the work is done); the cap starts at Incomplete (R78:
    "the clock itself does not know whether the athlete performed all work"), with Complete one tap
    away. Ready, running and paused ask nothing. No cap, no claim: the question is not asked.
  - Ladder (`useLadderResult` in `src/ui/ladder-block.tsx`): the question is always present, as the
    ladder's ending question always was, so a ladder performed without its clock can still be
    answered. Before the attempt ends nothing is chosen. Once it ends — the athlete's Finish, the
    cap, or a schedule run out — it starts at **Incomplete with no rung**, because no rung was
    tracked (TASK-013 adds live check-off and imports it here). Only the athlete's Complete records
    the top rung (R124, R69: Finish never selects every rung). An answer given before the end stays.
  - **Stopping alone never marks the work performed.** Changed deliberately (AC-R010-01): a For Time
    recorded mid-race (section forward while running) used to save `completed_under_cap: true`
    ("the same fact as finishing under it"); it now saves only its seconds, `completed_under_cap`
    `null`.
- **Effort (C30; R63, R76, R80, R116).** The existing `SetEffortChoice`, adapted only as the accepted
  owner did: an optional `legend` and a `scopeLabel` for the compact Clear (`Clear effort for this
  block`) where there is no set number; the set sheet keeps `Effort` and `Clear effort for set N`.
  Legend `Effort · optional` (the accepted owner's section-log legend; the app's own optional-field
  convention). No icon, scale, word or category added.

## Shared owner dispositions

- **`src/ui/refinements/timed-result-log.tsx` (`TimedResultLog`)**: **extended, not replaced.** New
  `CompletionResultLog` family (`format: 'for_time' | 'ladder'`, `value: { completed, effort }`,
  `onChange`, `askCompletion`, `saved`) beside TASK-009's `AmrapResultLog`; same form, title,
  `useInvalidFocus` submit and group recipe. Two untitled groups (R90 A): the completion question,
  then the effort. Presentation over the consumer's record and writer; no draft, field or save of its
  own. `saved` disables the completion chips once the block's row exists (no correction writer for a
  saved `block_results` row, so the screen cannot drift from it). Not drawn here, deliberately:
  - the AMRAP's optional effort (R80, LOGGING-FIELDS): JOURNEY-010 and the brief's gallery states are
    For Time and the ladder; the family can take the same effort group in one line when its writer
    exists (TASK-015 / TASK-046 / TASK-047). Not added so the AMRAP log TASK-009 proved is unchanged;
  - the EMOM's end log (C31, R43): TASK-011;
  - rep-first rung tiles, live check-off, the rung selection inside the log and quiet Undo
    (`completionAction`): TASK-013, TASK-014 (the rung question stays the existing `LadderRungs` at
    the top of the ladder card);
  - notes, per-movement actuals/loads, a Save with retry and the categorical effort writer: TASK-015,
    TASK-031, TASK-047;
  - the focused dialog and its accessible name: TASK-016–018, TASK-046, TASK-041.
- **`ChoiceGroup`** (design system, public entry): **adopted unchanged** for the completion row;
  `.clr-timed-completion` divides its radiogroup evenly.
- **Existing effort control `SetEffortChoice` (`src/ui/set-effort.tsx`)**: **reused, with the
  accepted owner's narrow adaptation** (optional `legend`; `scopeLabel` XOR `setNumber` for the Clear
  name). Faces, words, categories, order, tick, focus and Clear behaviour unchanged; every set-sheet
  consumer unchanged.
- **`src/ui/refinements/logging-overlay.tsx` (`LoggingOverlay`)**: **read; deliberately not created.**
  It is the focused dialog's chrome (C40–C45, C57–C59, P01–P03): TASK-016–018 build it, TASK-046
  adopts it for the four timed families, TASK-041 closes it on the routes. The logs stay inline in
  their cards (R81).
- **`src/dev/gallery-refinement-forms.tsx`**: **extended as a deliberate consolidation** of the
  reference's `GalleryLoggingMoment` for the `for_time` and `ladder` contexts. `?state=for_time`
  ("For Time results") renders the route's actual `ForTimeBlock` twice: the accepted sample (forty
  wall balls, 9 kg, 15:00 cap) finished under the cap at 06:23 → Complete; a two-movement companion
  run into its 10:00 cap → Incomplete. `?state=ladder` ("Ladder results") renders the route's
  `LadderBlock` twice: the accepted four-round push up + burpee ladder finished at 03:20 with nothing
  tracked → Incomplete, how far asked; the push up alone run into its 07:00 cap → Incomplete. Each
  race clock is seeded into its own memory `ShellStorage`; the shell's own `BlockCompletionProvider`
  over the gallery's refusing clients; no network. The reference's synthetic draft, Save/retry, rung
  tiles, Undo and overlay are not copied. Register specimens `TimedResultLogForTimeFinished`,
  `…LadderIncomplete`, `…LadderUnanswered`, `…ForTimeSaved` (entry `TimedResultLog`).
- **`src/ui/refinements/presentation.css`**: **adopted** the accepted `.clr-timed-completion` rules
  (tokens only; `!important` overrides the radiogroup's inline wrap, as `set-effort.css` does).
- **`src/ui/refinements/tokens.css`**: **read; no variable added.** The `--logging-*` variables are
  read by the dialog and form-rhythm recipes (TASK-016, TASK-017); the completion recipe needs none.
- REUSE.md: one owner per decision, no route-local look-alike, the gallery draws the actual consumers.
- LOGGING-FIELDS.md: For Time "Complete/Incomplete … Effort/Notes; Finish is not automatic
  performed-work proof"; Ladder "… Effort/Notes and reversible Finish draft". This task keeps the
  existing fields only: `completed_under_cap` (For Time) and `highest_rung` (ladder).

## Data integrity (AC-R010-01, AC-C30-01)

- **Completion, For Time.** UI `true`/`false` ↔ `completed_under_cap` `true`/`false`; `null` when the
  race has not ended or has no cap. The athlete's answer is one optional boolean, `workCompleted`, on
  the race's existing `clear.workout-for-time` record (no new key; the guard accepts it absent, null
  or boolean; `clampForTimeState` keeps only a boolean). Why it is stored: without it a reload after
  correcting a Finish to Incomplete would bring back the clock's Complete and save work as performed
  — the fabrication AC-R010-01 forbids. Older records (no `workCompleted`) read exactly as before:
  a finish → Complete/`true`, the cap → Incomplete/`false`, and nothing is rewritten unless answered.
- **Completion, ladder.** Complete ↔ `highest_rung` = top rung; Incomplete ↔ the chosen rung or
  `null`; unanswered ↔ `null` (unchanged mapping). The answer, rung and effort are the renderer's
  draft (as the ending always was); durable ladder drafts are TASK-032 / TASK-048. A ladder whose
  draft was lost (its section left and reopened) and whose row is saved claims no answer rather
  than a starting point the saved row may contradict.
- **History.** `Cap · Finished under the cap` (true), `Cap · Stopped at the cap` (false at the cap —
  every older row), and new: `Cap · Incomplete` only for `false` with a recorded time short of the
  cap (an athlete's Incomplete). The old wording would have been false for that row. `Highest rung`
  unchanged.
- **Effort.** `null` until answered; Clear returns it to `null`; never defaulted by an ending. No
  categorical block-effort field exists (`block_results.perceived_effort` is the historical 1–10
  number; R116 forbids writing a category into it), so the answer is held by the block while it is
  open and **is not saved**: every saved row has `perceived_effort: null`, no category reaches
  storage or the network, no mood is written. A reload brings it back unanswered. The writer and
  read model are TASK-030 / TASK-031 / TASK-047.
- No new storage key, schema, column or writer. The one new persisted value is the optional
  `workCompleted` above.

## Changes

- New: `src/test/completion-effort-fixture.ts` (shared by check-01 and check-02: For Time and the
  accepted four-round ladder in the first section, a cooldown after), `e2e/refinement/task-010.spec.ts`,
  `evidence/refinement/task-010/required-cases.json` (+ guard receipts).
- Changed (owners/consumers): `src/ui/refinements/timed-result-log.tsx`,
  `src/ui/refinements/presentation.css`, `src/ui/set-effort.tsx`, `src/ui/for-time-block.tsx`,
  `src/ui/ladder-block.tsx`, `src/state/for-time.ts`, `src/state/workout-persistence.ts`,
  `src/state/session-detail.ts`.
- Gallery/register: `src/dev/gallery-refinement-forms.tsx`, `src/dev/gallery-refinement-forms-data.ts`,
  `src/dev/gallery-refinements.tsx` (states `for_time`, `ladder`), `src/dev/gallery-registry.tsx`,
  `docs/design/library/COMPONENTS.md` (regenerated, 69 entries). `PROJECT_MAP.md` refinements row.

## Tests added and changed

- **check-01** — 9 new cases in `src/ui/timed-result-log.test.tsx` (TASK-009's file), in their own
  describe block `TASK-010 completion choices and existing effort faces`; the describe title carries
  both "completion" and "effort", and no TASK-010 name carries "AMRAP". Checked before naming: none of
  TASK-009's 8 names (or its describe title) contains "completion" or "effort", so
  `--testNamePattern "completion|effort"` selects exactly these 9 and `--testNamePattern AMRAP`
  exactly TASK-009's 8. Real router at `/workout` over `completion-effort-fixture.ts`, injected
  `Date.now`, the shared stylesheets applied:
  - AC-C29-01 one row: no log while ready/running/paused; after Finish, For Time and ladder logs
    after their work, one title, two untitled groups, one `fieldset` "Work completed" with exactly
    two chips (Complete, Incomplete) as direct children of one radiogroup, retired wording absent,
    the accepted recipe rules.
  - AC-R010-01 For Time: Finish → Complete (nothing stored until answered), corrected both ways
    (stored `workCompleted`), saved `{90, false}`; cap → Incomplete, corrected to Complete, saved
    `{900, true}`; mid-race forward saves `{200}` (`completed_under_cap: null`); uncapped: no
    question, effort still offered, outcome `{120}`.
  - AC-R010-01 ladder: unanswered before the end; Finish with nothing tracked → Incomplete, how far
    asked, no rung; rung 3; Complete → top rung; back to Incomplete clears the rung; saved `{}`; the cap
    → Incomplete; a schedule run out → Incomplete `{}`; a legacy ladder answered Complete before Start
    stays Complete through Start/Finish.
  - AC-R010-01 end to end: stored answer, reload (For Time keeps Incomplete; the ladder's draft
    starts again at Incomplete, never every rung), both saved rows and `blockResultInsert`, return to
    the saved section (completion chips disabled with the shared disabled role; For Time shows its
    saved Incomplete; the ladder whose draft left claims nothing), History `Cap · Incomplete`,
    `Elapsed 01:30`, `Highest rung 4`, no Effort reading.
  - AC-C30-01 effort: three faces, none chosen after the cap or Finish, no Clear until answered,
    three not the mood's five, no slider/spinbutton/digit; Clear → null with focus kept; independent
    per block; saved `perceivedEffort: null`, `perceived_effort: null`, no category in storage, no
    session write.
  - AC-R010-02 faces: same owner (`.clr-set-effort`), Frown/Meh/Smile markup in order, hidden words,
    `aria-hidden` glyphs, `SET_EFFORT_CHOICES` unchanged; selected tick (opacity 1) and
    `--border-selected` bleed, others 0 and `--border-unselected`; never disabled; roving tab stop,
    ArrowRight/Home/End choose and move focus; the completion row behaves the same.
  - AC-R010-01 failed save: Incomplete, Too hard and the ladder's Complete stay; retry writes each row
    once, unchanged, with no effort.
  - AC-R010-01 older records: three pre-change For Time records (finish, cap while away, finish
    stamped past the cap) read Complete/Incomplete/Incomplete, save exactly the old
    `forTimeOutcome` (`{383,true}`, `{900,false}`, `{900,false}`) and are not rewritten.
  - JOURNEY-010 gallery: `for_time` and `ladder` states, the route's own blocks, starting answers,
    unanswered effort, live correction, no fetch, route storage untouched.
  - Mutation checks (each restored, confirmed with `cmp`): M1 the cap starts at Complete → 3 failed;
    M2 ladder Finish marks every rung → 3; M3 mid-race claims completion → 1; M4 the row recipe
    dropped → 1; M5 effort defaults to the middle face → 3; M6 the correction not kept on the race's
    record → 5; M7 faces redrawn as text → 1; M8 a saved ladder stays editable → 1; M9 History reads an
    Incomplete as "Stopped at the cap" → 1.
- **check-02** — new `e2e/refinement/task-010.spec.ts` (3 cases, mobile, contained synthetic lane,
  Playwright clock; the lane accepts only the section's own `block_results` inserts, the first
  optionally refused with 503, and answers `session_as_performed` with the recorded rows; anything
  else fails the case). Not backend proof; the ladder's backend lane is `workout-ladder.spec.ts`.
  - touch, 390, Signal: For Time ready/running/paused (no log) → Finish → Complete; browser geometry
    (log after the work, two groups at the 24 px gap, the two answers in one row with equal widths
    spanning the log, unclipped; the three faces in one row; ticks and frames by selection);
    Incomplete (stored `workCompleted: false`); Too hard → Clear → About right; axe; reload keeps
    Incomplete, effort back unanswered; refused save keeps both; retry; both For Time POSTs
    `elapsed_seconds: 90, completed_under_cap: false, perceived_effort: null`, the unstarted ladder all
    null, no category or extra key in any body; History `CapIncomplete`, `Elapsed01:30`, no Effort.
  - keyboard, 320, reduced motion, Clear skin: Enter starts the ladder; the cap → Incomplete, how far
    asked, no rung; geometry at 320; ArrowLeft → Complete (focused), rung question gone, `Reached rung
    4 of 4 — 8 reps`; Tab → Too hard; End/Home/ArrowRight; Tab → Clear, Enter, focus back, Space;
    animations ≤ 0.01 ms and ≤ 1 iteration; no overflow; axe; keyboard save: For Time all null,
    ladder `highest_rung: 4`, `perceived_effort: null`; History `Highest rung4`.
  - gallery `for_time` and `ladder`, 390, Signal: all four attempts meet the same contract and
    starting answers; live correction and a face; axe; no network; route storage untouched.
  - Captures attached: `for-time-finished-complete-signal-phone-390`,
    `for-time-incomplete-effort-signal-phone-390`, `history-for-time-incomplete-signal-phone-390`,
    `ladder-cap-incomplete-reduced-phone-320`, `ladder-complete-effort-keyboard-reduced-phone-320`,
    `gallery-{for-time,ladder}-{finish,cap}-signal-phone-390`. VISUAL-CONTRACTS ties no V/P image to
    C29/C30; the comparable references are the accepted `?state=for_time` / `?state=ladder` and the R7
    replay `scene.html?view=timed&state=for_time|ladder&stage=capped`.
- **Unit tests added (not a declared check):** `src/state/for-time.test.ts` (6: starting points,
  nothing before the end, no cap no claim, corrections, `answerForTime`, restore),
  `src/state/workout-persistence.test.ts` (3: round-trip, older records, a non-boolean answer
  refused), `src/state/session-detail.test.ts` (1: `Incomplete` before the cap, every capped/older row
  unchanged).
- **Updated, superseded by approved criteria** (each cites TASK-010 and the criterion in place):
  - `src/state/for-time.test.ts` "supplies the seconds so far when recorded mid-attempt" → "…, and
    claims no completion" (AC-R010-01).
  - `src/ui/ladder-block.test.tsx`: `declare()` uses Complete/Incomplete; group `Work completed`;
    the heading lists gain the log's `Log results`; "offers nothing to tap" lists the log's five
    radios, none checked; the schedule run out starts at Incomplete (C29, C30, AC-R010-01). 39 cases,
    same count.
  - `src/ui/timed-workout-flow.test.tsx` (TASK-006 check-01 target): the ladder's question is
    `Work completed` (C29). Body only; no case renamed.
  - Backend lane / B05 (cannot run here; typecheck and load under `--list`):
    `e2e/design-0143/workout-ladder.spec.ts` (ending legend and answers; the schedule run out is
    asserted Incomplete before Complete; `expectHandsOff` comment), `workout-lifecycle.spec.ts`
    (Complete, `Work completed` count 0 while racing), `task-040-lifecycle.spec.ts` (same; excluded by
    the config, lists 0 by design), `e2e/ui-polish-b05-scroll-boundaries.spec.ts` (Incomplete opens
    the rung question).

## Sweep (every spec and test under `e2e/` and `src/`)

Searched for: `How did this block end`, `Finished the ladder`, `Hit the time cap`, `Fell behind the
schedule`, `All completed`, `Stopped short`, `Work completed`, `Clear effort for`, `Finished under
cap`, `Finished under the cap`, `Stopped at the cap`, `completed_under_cap` / `completedUnderCap`,
`perceived_effort`, `Effort`, `Log results`, `clr-timed-log`, `getByRole('radio')`,
`getAllByRole('radio')`, `radiogroup`, `locator('form')`, `getAllByRole('heading')`, `expectHandsOff`.

- Fixed: the files listed above.
- Checked, not superseded:
  - `src/app/FormatPreview.tsx` / `.test.tsx` "Finished the ladder": the read-only preview's reading
    of a reached rung, not the completion question.
  - `Finished under cap` (For Time clock status) in `for-time-block.test.tsx`, `block-panel.test.tsx`
    (TASK-003 target), `timed-workout-flow.test.tsx` and `e2e/refinement/task-006.spec.ts`: the clock's
    words are unchanged (see open assumptions).
  - `Finished under the cap` / `Stopped at the cap` in `session-detail.test.ts` and
    `SessionDetail.test.tsx`: older rows read exactly as before.
  - `Clear effort for set 1` in `set-effort`, `set-logging-sheet`, `set-correction`,
    `superset-logging` tests and `e2e/ui-polish-integrated.spec.ts`: the set sheet's name, unchanged.
  - `completed_under_cap` in mocked rows (`ui-polish-b05-*`, `ui-polish-integrated`, `workout-*`
    backend specs, `disposable-athlete.ts`): fixture rows or nulls; no spec asserts a For Time row
    saved mid-race. `src/ui/conditioning-score*`, `block-effort*`, `conditioning.ts`: readings of
    rows, unchanged (`false` still scores as not finished; R63 forbids new adaptive logic).
  - `block-completion-ownership.test.ts`: still one `perceivedEffort: null` in the provider and no
    `<BlockEffortDialog`.
  - `expectHandsOff` in `workout-ladder/emom/circuit/amrap.spec.ts`: no slider, spin button or
    RPE/exertion/"how hard" text — the faces' words are "Too hard / About right / Too easy".
  - `e2e/design-0143/accessibility.spec.ts`: its selected/unselected shape check is generic over every
    radio (the chip tick satisfies it); `focus-ownership.spec.ts` / `app-shell.spec.ts`
    `locator('form')`: other screens. `e2e/refinement/task-009.spec.ts`: AMRAP only, unchanged DOM.
  - `src/test/design-0143-final-audit.test.ts`: not modified.

## Failures and corrections

- e2e harness: `test.describe.configure` was declared twice (copied with the synthetic-origin
  harness) → removed the duplicate.
- e2e: the chip tick fades in over a real-time transition, so the first read saw opacity 0; the
  reader now awaits the log's own finite animations. A focused chip's frame wears the shared focus
  treatment, so the frame check skips the focused chip.
- e2e: my "no effort key" regex also matched `perceived_effort"`; replaced by "no category string and
  no column beyond the existing ones".
- Unit (design flaw found by the end-to-end case): returning to a saved ladder section remounted the
  ladder without its draft, and the starting-point rule then showed a disabled **Incomplete** while
  the saved row said Complete. A starting point now belongs to the unsaved draft only; a saved ladder
  without its draft claims no answer (mutation M8 guards it).

## Verification (this worktree, uncommitted candidate, 2026-11-10)

- `npm ci`: exit 0.
- `node scripts/refinement/run-required-check.mjs --task TASK-010 --check check-01 -- npx vitest run src/ui/timed-result-log.test.tsx --testNamePattern "completion|effort" --passWithNoTests=false`:
  PASSED. Native 17 total, 9 executed, 9 passed, 0 failed, 8 skipped (TASK-009's), 0 todo.
- `node scripts/refinement/run-required-check.mjs --task TASK-010 --check check-02 -- npx playwright test e2e/refinement/task-010.spec.ts --project=mobile`:
  PASSED. Native 3 total, 3 executed, 3 passed (about 48 s; synthetic origin, no credentials used;
  each case sets 120–180 s).
- Manifest sha256 `7630d75e8f2d2f5585faed776b7fdae708703374b6788a2947d2a524d833cef8`.
- `npm run build`: exit 0 (`tsc --noEmit` over `src` and `e2e`, then Vite). `npm run lint:ds`: exit 0.
  `node scripts/gallery-index.mjs --check`: 69 verified.
- `npm test`: 262 files, 6198 tests passed, 0 failed (TASK-009: 262 / 6179; +19 = 9 check-01 + 10
  state/persistence/History).
- `npx eslint` per touched file against `git show HEAD:<file>`: no new error or warning
  (`gallery-registry.tsx` 137 → 137, `ladder-block.tsx` 2 → 2, `set-effort.tsx` 1 → 1, every other
  touched or new file 0).
- `npx playwright test <specs> --list --project=mobile`: `e2e/refinement` 56 in 10 files (+3, this
  spec); `e2e/design-0143` 59 in 13; `e2e/effects` 27 in 9; top-level specs one by one, 42 files, all
  load. Edited: `workout-ladder.spec.ts` 1, `workout-lifecycle.spec.ts` 6,
  `ui-polish-b05-scroll-boundaries.spec.ts` 12, `task-040-lifecycle.spec.ts` 0 (config exclusion).
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,TASK-002,TASK-003,TASK-004,TASK-005,TASK-006,TASK-007,TASK-008,TASK-009,TASK-010`:
  PASSED, exit 0; every task "current passing receipts"; accepted-gallery 1193 files verified.
- Not run here: backend-lane specs (`e2e/design-0143/*`, `e2e/core-loop.spec.ts`) need
  `.env.runner.local`; the edited ones typecheck and load under `--list`.

## Earlier-task receipts

All refreshed by genuinely re-running their exact approved guard commands (every manifest untouched;
`git diff -- evidence/refinement/task-00*/required-cases.json` empty). All PASSED: TASK-001 7/7, 9/9;
TASK-002 11/11, 7/7; TASK-003 12/12, 5/5; TASK-004 10/10, 5/5; TASK-005 9/9, 5/5; TASK-006 9/9, 7/7;
TASK-007 13/13, 7/7; TASK-008 13/13, 5/5; TASK-009 check-01 8/8 executed of 17 (my 9 skipped by its
pattern), check-02 3/3.

- Changed receipts, as expected: **TASK-006 check-01** (its target `timed-workout-flow.test.tsx` was
  edited: new target hash) and **TASK-009 check-01** (its target `timed-result-log.test.tsx` now also
  holds my cases: new target hash, totals 17 / 8 executed / 9 skipped).
- Every other receipt is byte-identical (deterministic): TASK-002/003/005/006 check-02/007/008 render
  the For Time and ladder renderers I changed, and still pass; TASK-001/004 were re-run for
  completeness.

## Open assumptions / unresolved (for the controller and owner)

- **Categorical block effort is not saved.** No field exists for it (`perceived_effort` is the
  historical 1–10 number, and R116 forbids converting a category into it), and the brief allows no new
  writer. The faces are therefore an optional draft, held by the block while it is open: never
  written, never numeric, lost on reload or when the section unmounts. The writer and read model are
  TASK-030 / TASK-031 / TASK-047 by the approved DAG. Until they land, the route shows an answerable
  effort that History cannot show; the owner may prefer to hide the faces until then — a product call,
  not taken here.
- **One persisted value added**: the optional `workCompleted` on the existing For Time record, because
  without it a reload after correcting a Finish to Incomplete would save the work as completed. No new
  key; older records parse and read unchanged.
- **History wording**: one new reading, `Cap · Incomplete`, only for a row whose recorded time is short
  of its cap and whose completion is false (an athlete's Incomplete); the old "Stopped at the cap"
  would be false there. Copy pass: TASK-037.
- **Mid-race save changed**: a For Time saved while still racing now records no completion instead of
  `true` (AC-R010-01). `conditioning.ts` reads `null` as before for its score; its completion read
  becomes `unknown` rather than `complete`.
- **Clock words**: For Time's clock still says "Finished under cap" after Finish, even if the athlete
  then answers Incomplete. It is the clock's status (and TASK-006/007/003 targets assert it); the
  ladder already says "Finished". Neutral wording is a copy decision (TASK-037).
- **After save** the completion chips are disabled (no correction writer for a saved row); the effort
  faces stay answerable but unsaved. Correction after save: TASK-031 / TASK-047.
- **Ladder draft durability**: the ladder's answer, rung and effort are in memory (as its ending always
  was); a reload starts it again at Incomplete (never every rung), and a saved ladder whose draft was
  lost claims no answer. Durable drafts and saved-result readback: TASK-032 / TASK-048.
- **AMRAP effort (R80)**: not added (JOURNEY-010 is For Time / ladder); the shared log can take it in one
  line for TASK-015 / TASK-046 / TASK-047.
- The ladder's rung question stays at the top of its card (`LadderRungs`) while the completion row
  is in the log at the bottom, as the ending question was; moving rung selection into the log is
  TASK-013.

## Next action

Controller verification and commit.
