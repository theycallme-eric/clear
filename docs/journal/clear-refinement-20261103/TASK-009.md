# TASK-009 — AMRAP prescription and concise scoring controls (#636)

Body `clear-refinement-v2-20261109b`, attempt 1, base `a140923` (after TASK-039 #679 and TASK-001 to
TASK-008 #680 to #687). Task-owned progress note: the approved exception to the shared daily journal
for this body. Only TASK-009 writes this file.

## Intended outcome

REQ-009 (C25, C26, C27, C28; G08; R52, R54, R55, R56, R57, R79, R83, R85, R90; AC-C25-01,
AC-C26-01, AC-C27-01, AC-C28-01, AC-R009-01, AC-R009-02) delivered through the AMRAP block, the
accepted `TimedResultLog` and `QuantitySelector` on the real `/workout` route (JOURNEY-009,
completion owner):

- the work and its prescription come before any completed-round or partial-round scoring (C25);
- the rounds and the partial round are one coherently grouped result under the simple selected
  log hierarchy (C26, R90 A);
- each count is one wide frame with framed minus/plus actions in the interaction role (pink in
  Signal) around a distinct value, in the selected roomier geometry (C27, R79, R83);
- Clear rounds and No partial round are removed with nothing in their place; blank (unreported) and
  an explicit zero stay distinct from the screen to the saved row and History; nothing clears a
  value implicitly and stopping never invents completion (C28, R57).

Accepted gallery reference `eded158cfd928d382c9a9409e2c372270312741d`, stable state
`/gallery/refinements?state=amrap`.

## Selected design (derived from the approved sources, not a new product decision)

- **Order (C25, R54).** The ended card reads: the settled-time readout (unchanged, R58 is not a
  criterion here), `Each round:` with every movement and its prescription, then the log, then the
  like-for-like score line, then the block's save state. Ready, running and paused are unchanged
  (no score entry; TASK-006's action slot after the work).
- **Simple hierarchy (C26, R85, R90).** One `<form class="clr-timed-log">` under one rule, one
  `Log results` title (the accepted `.clr-timed-log__title`, h2 size — R85's "Log results seems too
  small" resolution), then one `.clr-timed-log__group` holding `Rounds completed` and `Reps into the
  next round`, each a label then its frame. No Result / Movements / Feedback / Your score titles.
  The title is a `Heading` at the level of `Each round:`, so the log is the work's sibling in the
  outline, not a child of it.
- **Counts (C27, R52, R56, R79, R83).** The accepted `QuantitySelector`: `.clr-quantity` is one
  `clr-chamfer--sm clr-chamfer--structure` frame (the softer small corner), grid
  `var(--control-height) minmax(0, 1fr) var(--control-height)` with `--spacing-300` padding (the
  roomier one), the shared secondary `IconButton` (size `sm`) for minus and plus (their own frame and
  bleed are `--border-cta-secondary` / `--border-cta-primary` = `--interaction-500`, pink
  `#FF2EA6` in Signal; a disabled minus takes `--border-disabled`, its real state), and the value in
  `--text-timer`, data face, h2 size, centred.
- **Blank and zero (C28, R57).** Blank reads `—` (aria-hidden) with `Not recorded` for assistive
  technology. The minus is unavailable at blank and at zero; tapping down stops at an explicit zero
  and never returns to blank; the plus counts up from blank. `onChange` is typed `(next: number)`,
  so the selector cannot emit `null`. The retired `Record rounds` / `Partial round` text-action
  toggles and the two "No … recorded" sentences are subsumed by the selector's own blank state.

## Shared owner dispositions

- **AMRAP block** (`src/ui/amrap-block.tsx`, EXE-04c): **adopted the owners, kept its controller.**
  Moved the result after the work (C25); replaced its private `Counter` / `Rounds` / `PartialRound`
  and the four text actions with `TimedResultLog`. Data and controller ownership unchanged:
  `amrap.ts` (`setRoundsCompleted`, `setPartialRoundReps`, `finishAmrap`, `amrapOutcome`) and
  `usePersistedAmrap` write every tap; `BlockCompletionControl` reports the same outcome; the
  section's forward action saves it. `countRound` stays exported in `amrap.ts` (its own tests use it)
  but the block no longer calls it.
- **`src/ui/refinements/timed-result-log.tsx` (`TimedResultLog`)**: **created from the accepted owner,
  scoped to C25–C28.** Presentation over the consumer's record and writer (`format`, `value`,
  `onChange`), simple hierarchy only, no draft, no field, no save. Shaped to be extended, not
  replaced: `format` is the discriminant later families widen, and later groups join the same form
  under the same title and group recipe. Not drawn here, deliberately, and left to:
  - completion choices (`ChoiceGroup` Complete/Incomplete) and the existing effort faces
    (`SetEffortChoice`): TASK-010 (C29, C30);
  - the EMOM's counter-free end log: TASK-011 (C31, R43);
  - the ladder's results, rung tiles and quiet Undo (`completionAction`): TASK-013, TASK-014;
  - per-movement next-round actuals and loads, notes and a Save with retry: TASK-031 (writers),
    TASK-046 (adoption for the four timed families);
  - `embedded` / an accessible name for the dialog: TASK-016, TASK-046.
  Deliberate deviation: inline the form is **unnamed** (not a `form` landmark). A section may hold
  two AMRAPs, and two `form` landmarks with one name fail axe `landmark-unique`; the title heads it.
  The dialog that later holds one log at a time can name it. The form submits through the app's one
  helper (`useInvalidFocus`, required of every form by `formFocus.test.tsx`) with nothing to submit,
  so Enter can never navigate away.
- **`src/ui/refinements/quantity.tsx` (`QuantitySelector`)**: **created from the accepted owner, with
  two deliberate consolidations.** (1) The value is an `<output>` (implicit `status`, announced per
  tap, as the shipped counter was), not the reference's `<input type="number">`: production text
  entry goes only through the public field components (`design-system-097-deprecations.test.ts`,
  "enters text only through the public field components"), and the shipped AMRAP counter and the
  package's own counter are tap-only, so typing would be a new behaviour. Consequence: blank is
  reachable only before any entry (no erase-to-blank either), which is exactly R57's "users can tap
  down". (2) The reference's unused `max` is not carried.
- **`src/ui/refinements/logging-overlay.tsx` (`LoggingOverlay`)**: **read; deliberately not created
  here.** It is the focused dialog's chrome, header X, backdrop, contained scrolling and Echo frame
  (C40–C45, C57–C59, P01–P03): TASK-016, TASK-017, TASK-018 provide it, TASK-046 adopts it for the
  AMRAP result, TASK-041 closes it on the routes. Building it here would pre-build their criteria.
  The AMRAP log stays inline in its card until then (R81's inline location, the shipped location).
- **`src/dev/gallery-refinement-forms.tsx`**: **created as a deliberate consolidation** of the
  reference's `GalleryLoggingMoment` for the `amrap` context. `?state=amrap` ("AMRAP results", the
  reference's title) renders the route's actual `AmrapBlock`, twice: the two-movement AMRAP closed by
  its cap with nothing entered (both blank), and the reference's own single kettlebell-swing sample
  finished early at 05:23 with 3 rounds and an observed zero partial round. Each attempt's record is
  seeded into its own memory `ShellStorage`; the shell's own `BlockCompletionProvider` over the
  gallery's refusing clients; `conditioningHistory={null}`; no network. The two blocks differ so
  their Coaching and notes regions (TASK-005's owner names them by movement) keep distinct landmark
  names. The reference's synthetic form, Save/retry and overlay are not copied. The other fifteen
  logging contexts join this file with their own tasks. Register specimens `QuantitySelector*` and
  `TimedResultLogAmrap*` also live here.
- **`src/ui/refinements/presentation.css`**: **adopted** the accepted `.clr-timed-log`,
  `.clr-timed-log__title`, `.clr-timed-log__group`, `.clr-timed-field` and `.clr-quantity` recipes
  (tokens only), with the value rule written against `.clr-quantity__value` (the `output`). Not
  adopted: `[data-log-hierarchy=grouped]` (rejected B hierarchy), `.clr-timed-completion` (TASK-010),
  `.clr-timed-undo` (TASK-014), `.clr-accepted-log*` (TASK-016–018), `[data-counter-style=wide]` (the
  roomier geometry is now the only one).
- **`src/ui/refinements/tokens.css`**: **read; no variable added.** REQ-009 lists the
  `--logging-*` variables, but the accepted recipes TASK-009 adopts read spacing tokens directly
  (`.clr-timed-log` gap `--spacing-600`, group `--spacing-400`, field `--spacing-200`); the variables
  are read by the dialog and form-rhythm recipes (TASK-016, TASK-017). Adding them unread would be
  dead tokens (TASK-007's precedent).
- REUSE.md: one owner per decision, no route-local look-alike, the gallery draws the actual consumer.
- LOGGING-FIELDS.md: AMRAP's accepted contract is "nullable rounds plus per-movement next-round
  actuals/load, optional Effort/Notes; zero stays distinct from unreported". This task keeps the
  existing fields only (rounds and one partial-round count, both nullable); no field, reason, writer
  or storage key added. The richer fields are TASK-031 / TASK-046.

## Data integrity (C28, AC-R009-02)

- **UI state:** blank `—` + "Not recorded" vs `0`; minus floors at zero; no control emits `null`.
- **Stopping:** `finishAmrap` and cap expiry set only the time; both counts stay `null` (tested on
  Finish early, the cap, pause/resume).
- **Stored:** `clear.workout-amraps`, unchanged shape; `roundsCompleted` / `partialRoundReps`
  `null` vs `0` (tested after each tap).
- **Reload:** the remount/reload reads back blank as blank and zero as zero (unit and browser).
- **Saved:** the section's forward action sends `rounds_completed` / `partial_round_reps` as `null`
  for blank and `0` for zero, `completed_under_cap` `null` (unit: `double.recorded()` →
  `blockResultInsert`; browser: the actual `POST /rest/v1/block_results` body, before and after a
  refused save).
- **Read back:** History (`/history/:id`, `sessionDetail`) shows `Rounds 0` with no partial-round
  reading, or `Partial round 0 reps` with no rounds reading — absence, not zero.
- **Older records:** four stored shapes from before this change (pre-pause record with rounds 2 and
  no partial; both zeros from the retired toggles; rounds cleared with Clear rounds and a partial of
  7; a cap expiry while away) load into the selectors as before, report exactly
  `amrapOutcome(amrapView(clampAmrapState(stored)))`, and are not rewritten.
- No new storage key, persisted field, schema or writer.

## Changes

- New: `src/ui/refinements/timed-result-log.tsx`, `src/ui/refinements/quantity.tsx`,
  `src/dev/gallery-refinement-forms.tsx`, `src/dev/gallery-refinement-forms-data.ts`,
  `src/test/amrap-result-fixture.ts` (shared by check-01 and check-02: the AMRAP in the first
  section, a cooldown after it, so `Next section` saves the AMRAP's row).
- Changed: `src/ui/amrap-block.tsx`, `src/ui/refinements/presentation.css`,
  `src/dev/gallery-refinements.tsx` (state `amrap`), `src/dev/gallery-registry.tsx` (entries
  `TimedResultLog`, `QuantitySelector`), `docs/design/library/COMPONENTS.md` (regenerated, 69
  entries), `PROJECT_MAP.md` (refinements row).
- Evidence: `evidence/refinement/task-009/required-cases.json` (check-01: 8 vitest cases; check-02:
  3 Playwright mobile cases); receipts in `results/` written by the guard.

## Tests added and changed

- New `src/ui/timed-result-log.test.tsx` (check-01, 8 cases, every name carries "AMRAP"; none
  carries "completion" or "effort", which TASK-010's pattern selects). Real router at `/workout`,
  injected `Date.now`, shared stylesheets applied:
  - AC-C25-01 order in ready/running/paused (no log), Finish early and the cap (log after every
    movement reading);
  - AC-C26-01 one form, one title at the work's outline level, one group of both counts, labels
    before frames, the accepted gaps, submit prevented, unnamed (no landmark);
  - AC-C27-01 / AC-R009-01 frame classes, exactly three cells, secondary chamfered actions with the
    interaction or disabled bleed, `output` value, the roomier recipe;
  - AC-C28-01 no reset/toggle/text action, blank reads "Not recorded", tap down to zero and stop,
    the other count untouched;
  - AC-R009-02 end to end (stopping, stored, reload, saved row, back to the section, History);
    failed save + retry; four older stored records;
  - JOURNEY-009 the gallery state (two attempts, live, memory only, no fetch).
  - Mutation checks (each restored byte for byte, confirmed with `cmp`): actions `quiet` → AC-C27-01
    failed; Finish early inferring `roundsCompleted: 0` → AC-C28-01 and AC-R009-02 failed; the counts
    in two groups → AC-C26-01 failed; the log moved before the work → AC-C25-01 and the gallery case
    failed; the minus clearing zero back to blank → AC-C28-01 and the gallery case failed.
- New `e2e/refinement/task-009.spec.ts` (check-02, 3 cases, contained synthetic lane, Playwright
  clock). The lane accepts only the AMRAP's own `block_results` insert (recorded as sent, the first
  optionally refused with 503) and answers `session_as_performed` with the recorded row; any other
  write fails the case. Not backend proof; the backend lane is `workout-amrap.spec.ts`.
  - touch, 390, Signal: ready → Start → Pause → Resume → Finish early; browser geometry (log below
    the work, one group, frame = log width, 40 px actions at the 12 px inset, value centred and in
    the timer role, larger than its label, actions framed `rgb(255, 46, 166)`); tap 3 up, 3 down to
    0, partial untouched; reload; refused save keeps both; retry; both POST bodies
    `rounds_completed: 0, partial_round_reps: null, elapsed_seconds: 95, completed_under_cap: null`;
    History `Rounds 0`, no partial reading; axe.
  - keyboard, 320, reduced motion, Clear skin: Enter starts; the cap closes it (`Cap reached`, both
    blank); Tab order skips the disabled minus; Enter/Space up, Shift+Tab, Enter down to 0; no
    animation beyond 0.01 ms; no horizontal overflow; save body `rounds_completed: null,
    partial_round_reps: 0, elapsed_seconds: 480`; History `Partial round 0 reps`, no rounds reading;
    axe.
  - gallery `amrap`, 390, Signal: both attempts meet the same geometry contract, blank vs `3`/`0`,
    live tap, axe, no network, route storage untouched.
  - Captures attached: `amrap-ready-signal-phone-390`, `amrap-ended-blank-signal-phone-390`,
    `amrap-ended-zero-and-blank-signal-phone-390`, `history-amrap-signal-phone-390`,
    `amrap-cap-blank-and-zero-reduced-phone-320`, `gallery-amrap-{cap,early}-signal-phone-390`.
    VISUAL-CONTRACTS ties no V/P image to C25–C28; the comparable references are the accepted
    `?state=amrap` and the R7 replay `scene.html?view=timed&state=amrap&stage=capped&multi=1`.
- Updated, superseded by approved criteria (each cites TASK-009 and the criterion in place):
  - `src/ui/amrap-block.test.tsx`: helpers (`recordRounds`, new `recordZeroPartial`, `shown`,
    `expectNoScoreEntry`); "holds an entered zero … clearing it goes back to blank" → "no control
    clears it back to blank" (C28); "distinguishes a partial round of zero reps …" without No partial
    round (C28); "reports a cleared result as blank again" → "reports a result tapped back down as an
    explicit zero" (C28); "labels each group inside the card" (C26: title + labelled fields);
    "makes the optional result toggles frameless text actions" → "draws the optional result as
    framed counts … no text action remains" (C27, C28); the expiry/early/refresh cases read the blank
    counts instead of the sentences and Record rounds. 45 cases, same count.
  - `src/app/Workout.test.tsx`: `performTwoRounds` taps `Increase rounds completed` (C27, C28).
  - `e2e/design-0143/workout-amrap.spec.ts` (backend lane, cannot run here): retired toggles and
    sentences replaced by the framed counts' actions and blank states; "entered and cleared again"
    replaced by "no reset control; left blank" (C28). Every row assertion is unchanged. Typechecks
    and loads under `--list` (2 tests).

## Sweep (every spec and test under `e2e/` and `src/`)

Searched for: `Clear rounds`, `No partial round`, `Record rounds`, `Partial round`, `Add a completed
round`, `Take back a round`, `One more rep in the partial`, `One rep fewer in the partial`, `No
rounds recorded`, `No partial round recorded`, `Rounds completed`, `Reps into the next round`, `AMRAP
complete`, `on the clock`, `amrap` (every e2e file), `spinbutton`, `locator('form')`,
`clr-text-action`, `clr-timed-log`, `clr-timed-field`, `clr-quantity`.

- Fixed: the three files above.
- Checked, not superseded:
  - `e2e/design-0143/workout-circuit.spec.ts`, `src/ui/circuit-block*.tsx`,
    `src/app/circuit-rounds.test.tsx`: the circuit's own `No rounds recorded` / `Take back a round`.
  - `src/ui/block-effort.test.tsx`: `AMRAP complete` is the effort dialog's heading.
  - `src/state/session-detail*.ts`, `src/app/FormatPreview.tsx`: History's and the preview's
    `Partial round` reading label, unchanged and relied on for read-back.
  - `e2e/design-0143/task-040-lifecycle.spec.ts`, `workout-formats.spec.ts`,
    `workout-lifecycle.spec.ts`, `format-preview.spec.ts`, `e2e/core-loop.spec.ts`,
    `e2e/ui-polish-integrated.spec.ts`: ready/list/badge reads only, or no AMRAP.
  - `e2e/ui-polish-b05-movement-countdown.spec.ts` (Start AMRAP, the window timer),
    `ui-polish-b05-structure-badges.spec.ts` (badge), `ui-polish-b05-summary-facts.spec.ts` (source
    check `amrap-block.tsx` contains `<MetricFrame>` — still true).
  - `e2e/refinement/task-002`, `-003`, `-006`, `-007.spec.ts` and the earlier vitest targets: the
    ready/running AMRAP DOM is unchanged; TASK-006 reads the Finish-early readout, which is
    unchanged. Re-run through their guards (below).
  - `e2e/focus-ownership.spec.ts`, `app-shell.spec.ts` (`locator('form')` on other screens).
  - `src/test/design-0143-final-audit.test.ts`: not modified; no `FORMAT_DRIVER_FILES` file edited.

## Failures and corrections

- `formFocus.test.tsx` "wires each one to useInvalidFocus" failed on the new `<form>`: every form in
  `src/` must submit through the shared helper. The log now submits through `useInvalidFocus` with
  nothing to submit (the first version had a private `preventDefault`).
- The accepted reference's `<input type="number">` would fail the repository's "enters text only
  through the public field components" guard; the value is an `<output>` instead (see dispositions).
  Found by reading the guard before building, not by a failure.
- Unit: the History step first navigated within the workout's router; the workout route kept the
  location (`/workout`). The read-back now opens `/history/:id` in a fresh router over the same
  clients, as a later visit does. The section headings are the section-type labels
  (`Conditioning`), not the fixture's `section_title`.
- Unit: the "cap while away" older record needs the real elapsed time for its expected outcome.
- e2e: axe `landmark-unique` on the gallery — first the two forms named "Log section results"
  (fixed by leaving the inline form unnamed), then two identical `Coaching and notes — AMRAP: kb
  swing, burpee` regions from two identical blocks (fixed by making the second attempt the reference's
  single-movement sample).
- e2e: the History reading locator matched the label span itself; it now reads the label's parent.

## Verification (this worktree, uncommitted candidate, 2026-11-10)

- `npm ci`: exit 0.
- `node scripts/refinement/run-required-check.mjs --task TASK-009 --check check-01 -- npx vitest run src/ui/timed-result-log.test.tsx --testNamePattern AMRAP --passWithNoTests=false`:
  PASSED. Native 8 total, 8 executed, 8 passed, 0 failed/skipped/todo.
- `node scripts/refinement/run-required-check.mjs --task TASK-009 --check check-02 -- npx playwright test e2e/refinement/task-009.spec.ts --project=mobile`:
  PASSED. Native 3 total, 3 executed, 3 passed, 0 failed/skipped/todo (about 40 s; synthetic origin,
  no credentials used; each case sets 120–180 s).
- Manifest sha256 `bc11b49882752327fa817d77ca586d8f3dd6b7b920e1167564d5c1aec3274a0c`.
- `npm run build`: exit 0 (`tsc --noEmit` over `src` and `e2e`, then Vite). `npm run lint:ds`: exit 0.
  `node scripts/gallery-index.mjs --check`: 69 verified.
- `npm test`: 262 files, 6179 tests passed, 0 failed (TASK-008: 261 / 6171; +1 file, +8 cases).
- `npx eslint` per touched file against `git show HEAD:<file>`: no new error or warning
  (`gallery-registry.tsx` 137 → 137 warnings; every other touched or new file 0).
- `npx playwright test <specs> --list --project=mobile`, in groups: top-level non-B05 (minus the
  deployed-only `generation-deployed-matrix`, which lists 0 locally by design) 291 tests in 28 files;
  `e2e/design-0143` 59 in 13; `e2e/effects` 27 in 9; `e2e/refinement` 53 in 9 — 430 in 59
  (TASK-008: 427 in 58, +3 and +1 is this spec). Observation: one invocation naming all 28
  top-level files lists 0 while each half lists normally; a CLI filter quirk, not this change.
  `ui-polish-b05-movement-countdown.spec.ts` alone: 10. The edited backend spec
  `e2e/design-0143/workout-amrap.spec.ts`: 2.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,TASK-002,TASK-003,TASK-004,TASK-005,TASK-006,TASK-007,TASK-008,TASK-009`:
  PASSED, exit 0; every task "current passing receipts"; accepted-gallery 1193 files verified.
- Mutation checks on check-01: see Tests (five, all caught, all restored and confirmed with `cmp`).
- Not run here: backend-lane specs (`e2e/design-0143/*`, `e2e/core-loop.spec.ts`) need
  `.env.runner.local`; the edited `workout-amrap.spec.ts` typechecks and loads under `--list`.

## Earlier-task receipts

- **TASK-002, TASK-003, TASK-005, TASK-006, TASK-007 and TASK-008: refreshed by genuinely re-running
  their exact approved guard commands** (no file of theirs edited; their manifests untouched). Their
  checks render the AMRAP renderer this task changed; TASK-006's also reads the AMRAP after Finish
  early, whose card now carries the log after the work. Results, all PASSED: TASK-002 check-01
  11/11, check-02 7/7; TASK-003 check-01 12/12, check-02 5/5; TASK-005 check-01 9/9, check-02 5/5;
  TASK-006 check-01 9/9, check-02 7/7; TASK-007 check-01 13/13, check-02 7/7; TASK-008 check-01
  13/13, check-02 5/5. The receipts are deterministic, so the refreshed files are byte-identical to
  the committed ones (`git status -- evidence/` shows only `evidence/refinement/task-009/`).
- TASK-001 and TASK-004: not refreshed. Their targets are untouched and they render no AMRAP
  (movement list, summary facts); the new CSS rules match only the new classes. Their vitest targets
  passed in `npm test`.

## Open assumptions / unresolved

- **Tap-only counts.** The accepted reference's value was a typeable number input. This build keeps
  the shipped tap-only behaviour (output value) because of the repository's text-entry guard and to
  avoid adding a behaviour; blank is the never-entered state and the minus floors at zero (R57). If
  the owner wants typed counts or an erase-to-blank, that needs the public `Input` inside the frame
  or a guard exception, and a decision on how an emptied field reads.
- **Touch target.** The actions are the shared control height (40 px; 44 px hit area on coarse
  pointers), per R83's "follow the shared control", down from the old counter's 48 px
  (`docs/specs/structures/amrap-logging.md` §1). The frame's 12 px roomier inset sits around them.
- **Focus at the floor.** Pressing the minus down to zero disables it, so keyboard focus leaves it
  (the shipped counter and the accepted owner behave the same). Not changed here; a candidate for the
  logging-consistency pass (G12) or TASK-016's focus contracts.
- **Inline location and title scale.** The log stays inline in its card with the accepted h2 title;
  R91 ("large Log results beneath the smaller section title feels odd") is C40, TASK-041, and the
  focused dialog is TASK-046.
- **R58** (completion readout alignment) is in G08 and the evidence list but is not a TASK-009
  criterion; the readout is unchanged.

## Next action

Controller verification and commit.
