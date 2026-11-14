# TASK-012 — Compact truthful ladder prescription (#639)

Body `clear-refinement-v2-20261109b`, attempt 1, base `24f9a70` (after TASK-039 #679 and TASK-001 to
TASK-011 #680 to #690). Task-owned progress note: the approved exception to the shared daily journal
for this body. Only TASK-012 writes this file.

## Intended outcome

REQ-012 (C35; R65, R70, R71, R72, R94, R95, R117; V11; AC-C35-01, AC-R012-01, AC-R012-02) delivered
through `LadderPrescription` / `ladderRungs` / the companion movement reading on the real `/review`
and `/workout` routes (JOURNEY-012, completion owner): each ladder's concise total and progression,
and every round's movement targets — the fixed companion included — in a compact grid with
readable wrapping, from the workout's own data. Accepted gallery reference
`eded158cfd928d382c9a9409e2c372270312741d`, stable states `/gallery/refinements?state=ladder-4` and
`?state=ladder-12`.

## Selected design (derived from the approved sources, not a new product decision)

- **Composition (C35, R94, R95, R117; V11; the accepted `ladder.tsx`).** One concise line per
  movement in prescribed order, then every round as a compact read-only tile: `R1`, then each
  movement's work in that round, the fixed companion in each. It replaces, in every live ladder
  (legacy, raced and scheduled):
  - the read-only rung row while the ladder is performed (R95: no duplicate beside the grid);
  - the "Each rung" caption and the legacy movement rows with their "4 reps burpee between each
    rung" annotation;
  - the timed ladders' long per-round list with its "— same every round" suffix (R70).
- **Progression (R94).** A sequence with one constant non-zero step reads as its ends and step:
  `2 → 24 reps · +2 per round`, `15 → 3 reps · −3 per round`. Any other sequence (pyramid, uneven,
  all equal) is its actual sequence, `20-30-40-50-40-30-20 sec`, never a step it does not have. A
  fixed companion, a band or no target reads as its own target (`4 reps`, `250 m`,
  `8 reps each side`).
- **Notation (R72, AC-R012-02).** Reps: `2 × push up` (the `×` replaces "reps" between quantity
  and movement). Time and distance keep the unit that is the meaning: `30 sec plank`,
  `250 m row`. Per side is kept: `8 × walking lunge each side`. A screen reader gets each tile in
  words (`Round 1`, `push up, 2 reps`), so `×` is never the only statement of the unit.
- **Order and identity.** Tiles in round order. Entries and summary lines in prescribed movement
  order (the old timed list put laddered movements before companions).
- **Load and equipment (C03/R132, C10/R31).** Compact equipment beside each name and the prescribed
  load once in the movement's summary line, through `liveMovementReadings`. A load is the same
  every round, so no tile repeats it.
- **Totals and cap (AC-R012-01).** The round count is the explicit timing's; without one, the
  ladder's own rungs. The timing line (`12 rounds · 07:00 cap on the whole ladder`) and the
  header's `7 MIN CAP · LADDER UP` are unchanged and data-driven. A schedule has no cap and states
  none.
- **Removed copy (R71, AC-R012-02).** The capped window's "Move through the rounds at your own pace
  inside the cap. Nothing here moves on by itself — you say how far you got." is removed, with
  nothing in its place (`PACING_NOTES.capped_window` is `null`). The For Time and scheduled pacing
  lines were not part of that removal and are unchanged.
- **Schedule (E03 kept).** A scheduled ladder's tile keeps `Starts at 01:15` and marks the live
  round `Now` (`Next` before Start) beside its `R` label on one line, with `aria-current="step"`,
  from the block's own clock.
- **Rung row.** Drawn only once the ladder is answered: the reached reading of a Complete and the
  "How far did you get?" question of an Incomplete (TASK-010's starting answer), until TASK-013
  moves both into the result log.
- **Review (JOURNEY-012, R65, R72).** Review keeps its accepted movement rows and their prescription
  text (`12 rungs · 2-4-…-24 reps`, `1 × 4 reps`), and draws the same `LadderRounds` grid,
  read-only, under them ("Review/ready prescription remains descriptive", G09). Review and Workout
  state each round in the same words.

## Shared owner dispositions

- **`src/ui/refinements/ladder.tsx`** (accepted owner): **created as a deliberate consolidation.**
  - `LadderPrescription` (live): the summary lines over `LadderRounds`.
  - `LadderRounds`: the grid alone, used by Review and the live prescription, with an optional
    consumer-owned `roundContext` (a schedule's start and Now/Next).
  - The reference computed readings inline from screenshot-shaped data. Here every reading comes
    from the columns through `src/state/ladder.ts` and `liveMovementReadings`.
  - **Not created here:** the reference's `LadderCompletion` (rep-first result tiles, C33/C34) and
    `LadderPrescription`'s `completedThrough`/`onProgress` live check-off (C34/C36). Both are
    TASK-013. Quiet Undo (`completionAction`) is TASK-014. Durable ladder drafts are TASK-032 and
    TASK-048. TASK-013 extends `LadderRounds`' tile (a Chip in place of the static frame) rather
    than drawing a second grid.
- **`ladderRungs` / companion movement reading** (`src/state/ladder.ts`): **adopted and widened.**
  - `ladderMovements`, `ladderRungs` and `ladderUnit` take any `{ prescription: PrescribedColumns }`
    (a structural `LadderMember`), so Review's composed `Prescription` and the live
    `ExerciseProgress` share one reader. Their behaviour is unchanged.
  - New pure readings: `ladderProgressionText` (the concise progression) and
    `ladderRoundReadings` (each round's entries; a sequence that ran out adds nothing).
  - The companion — any member without a sequence — is read at its own target in every round.
- **`src/state/prescription.ts`**: `measuredText(exercise, numbers)` was extracted from
  `targetText`. Same output; it is the one place a unit and `each side` are added.
- **`src/ui/ladder-block.tsx`** (route consumer): `LegacyLadder` and `TimedLadder` compose
  `LadderPrescription`. `RungsRow` returns nothing while unanswered. `LadderMovement`,
  `LadderRound`, `roundTarget` and `PrescribedLoad` were removed (superseded).
  - Unchanged: clock and actions (TASK-006), `ForTimeClock` frame (TASK-007), warning (TASK-008)
    and completion log (TASK-010).
- **`src/dev/gallery-refinement-flow.tsx`**: the `ladder-4` / `ladder-12` states draw the route's
  `LadderBlock`, so they now show the compact prescription from the gallery's own data (TASK-006's
  composition: push up 2…2n, fixed 4-rep burpee, 07:00 capped window).
  - Register specimens: `LadderPrescriptionFour`, `…Twelve` and `…Loaded` (a 24 kg descending
    swing with a 250 m row, `loadedLadderBlock()` in `gallery-refinement-flow-data.ts`), plus
    `LadderRoundsReview` and `LadderRoundsScheduled`.
  - Registry entries `LadderPrescription` and `LadderRounds`; the `LadderRungs` summary notes its
    answered-only use. `COMPONENTS.md` regenerated (71 entries).
- **Review / FormatPreview readings (TASK-002 cards).**
  - Review: `ReviewBlockView.ladderRounds` (from `ladderRoundReadings`, only where
    `identity.format === 'LADDER'`, i.e. exactly where the ladder renderer performs the block).
    `ReviewSection` draws `LadderRounds` after the accepted rows. Rows, Swap, header and badge are
    unchanged.
  - FormatPreview: the capped window's pacing line is no longer drawn, because `PACING_NOTES` is
    shared and R71 removed it. Its `LadderRungs` rung-reached readings are unchanged. It is the
    timing-mode/result preview, not a prescription, so it gets no grid.
- **`src/ui/ladder-rungs.tsx` (`LadderRungs`)**: **unchanged.** It is TASK-013's to replace with
  wrapping result tiles.
- **`src/ui/refinements/presentation.css`**: **adopted** the accepted `.clr-ladder-prescription*`
  recipe.
  - Kept: the grid's `repeat(auto-fit, minmax(calc(var(--control-height) * 2), 1fr))`, the
    `--spacing-200` gap, structure-framed `clr-chamfer--sm` tiles, `overflow-wrap: anywhere`, and
    the summary in the data face with an uppercase name.
  - Added: quiet equipment and a one-line head (label plus Now/Next). Tokens only.
- **`src/ui/refinements/tokens.css`**: **read; no variable** (REQ-012 `semanticVariables: []`).
- REUSE.md: one owner, no route-local look-alike, and the gallery draws the actual consumer.
- LOGGING-FIELDS.md: no field, reason, storage key or writer added. The prescription is read-only
  presentation. The ladder's result contract (`highest_rung`, the TASK-010 draft) is untouched.

## Changes

- New: `src/ui/refinements/ladder.tsx`, `src/test/compact-ladder-fixture.ts`,
  `src/ui/ladder-rungs.test.tsx`, `e2e/refinement/task-012.spec.ts`,
  `evidence/refinement/task-012/required-cases.json` (check-01: 9 vitest cases; check-02: 5
  Playwright mobile cases) and the guard receipts.
- Changed:
  - State: `src/state/ladder.ts`, `src/state/prescription.ts`, `src/state/review.ts`.
  - UI: `src/ui/ladder-block.tsx`, `src/ui/review-block.tsx`,
    `src/ui/refinements/presentation.css`, `src/app/FormatPreview.tsx`.
  - Gallery: `src/dev/gallery-refinement-flow.tsx`, `src/dev/gallery-refinement-flow-data.ts`,
    `src/dev/gallery-refinements.tsx` (doc), `src/dev/gallery-registry.tsx`.
  - Docs: `docs/design/library/COMPONENTS.md`, `PROJECT_MAP.md` (refinements row).

## Tests added and changed

- **check-01, `src/ui/ladder-rungs.test.tsx` (9 cases).** Real router: `/review` → Start →
  `/workout` over the shared fixture, with the shared stylesheets applied. The fixture holds three
  ladders:
  - the accepted 12-round push up/burpee ladder (07:00 capped window);
  - a loaded descending ladder: 24 kg kettlebell swing 15…3 with a fixed 250 m row, For Time,
    10:00 cap;
  - a scheduled plank pyramid 20…50…20 s with a fixed 8-each-side 12 kg lunge, every 01:15, no
    cap.

  Cases:
  - AC-C35-01: summary, 12 tiles, spoken words; no rung row, rail or second list; nothing
    focusable; order Start → prescription → log; the cascade's grid, min-width and wrap rules.
  - AC-R012-01 (data truth): exact readings for all three ladders. The other two borrow no
    accepted constant (`push up`, `burpee`, `07:00`, `+2 per round`, `12 rounds`, `R12`). Loads
    once, never in a tile. Per-hand equipment. The accepted rows hold the indexed sequences.
  - AC-R012-01 (Review parity): Review grid under unchanged rows, read-only, with the same words
    as Workout.
  - AC-R012-02: no suffix, paragraph or "between each rung"; no `N reps name`; × and units kept;
    per side kept; the other pacing lines kept.
  - Recovery: Start/Pause/the cap keep the tiles. The question and the reached reading appear only
    once answered. Only the race clock is stored. Only the declared rung is recorded.
  - Scheduled: starts and Now/Next with `aria-current`, through Start, remount and run-out.
  - Legacy, inverse and malformed ladders through the same owner; an emptied block keeps its own
    words.
  - Pure readings.
  - Gallery `ladder-4` / `ladder-12`: no fetch, no storage.

  Mutation checks (each restored, confirmed with `cmp`):

  | Mutation | Cases failed |
  | --- | --- |
  | Suffix re-added | 9 |
  | Screenshot-constant progression | 5 |
  | Read-only rail drawn unanswered | 3 |
  | Companion dropped from tiles | 9 |
  | "reps" instead of × | 9 |
  | Capped paragraph restored | 1 |
  | Review grid dropped | 1 |
  | Round count fixed at 12 | 7 |
- **check-02, `e2e/refinement/task-012.spec.ts` (5 cases).** Contained synthetic lane, fixture as
  above, full axe on every scan with no exception.
  - Phone-320 and phone-390 Review → touch Start → Workout:
    - every ladder's grid wraps into more than one column with no sideways scroll, inside the
      card;
    - tiles are level per row (heights and round labels within 1 px), unclipped and not focusable;
    - Review and Workout read the same words;
    - summary lines and timing lines match the data;
    - no rung row or rail; the Start sits above the prescription;
    - the 12-round grid is shorter than the viewport, with no page overflow.
  - Keyboard and reduced motion (390): Tab from Start skips every tile to the log. Enter, Space and
    Enter run Start/Pause/Resume, then Finish. The tiles are unchanged, the 12-radio question
    appears, and prescription animations are at most 0.01 ms.
  - Touch and recovery (320): a tapped tile changes nothing. Two ladders are started, then a
    reload: the same tiles and summaries; the race is still running and the schedule's live round
    is restored.
  - Gallery `ladder-4` / `ladder-12` (320): no network.
  - Captures attached: `review-{accepted,loaded,scheduled}-phone-{320,390}`,
    `workout-{…}-phone-{320,390}`, `workout-accepted-arrival-phone-{320,390}`,
    `workout-accepted-answered-keyboard-phone-390`, `workout-scheduled-reopened-phone-320`,
    `gallery-ladder-{4,12}-phone-320`. Comparable reference: V11 (`V11-ladder.png`, VISUAL-CONTRACTS
    ties it to C35) and the accepted `ladder-4`/`ladder-12` states.
- **Updated, superseded by approved criteria, each citing TASK-012 and the criterion in place:**
  - `src/ui/ladder-block.test.tsx`, 39 cases, same count:
    - the scheme read from the grid;
    - pyramid lines and headings: only `Log results` (C35, R94);
    - "Each rung" → tiles (C35, R95);
    - inverse pair: tiles, plus the question still `10 / 1 reps`;
    - fixed-interval companion: summary and tiles, no "between each rung" (R70, R72);
    - "offers nothing to tap": grid, no rung row;
    - malformed ladder named in the summary;
    - movement order from the summary;
    - "Ladder" legend read after Complete;
    - timed rung `sec` (R72);
    - scheduled tiles `R{n}`/`Starts at`/`N × thruster`/`N × burpee`, no suffix (R70);
    - per side `6 × lunge each side`;
    - free-paced `× wall ball`;
    - capped window `5 × push up`, no suffix, no paragraph (R71);
    - legacy: rounds are its rungs, no timing line or pacing.
  - `src/ui/for-time-block.test.tsx`: `Round N` headings → grid tiles (C35, R95).
  - `src/app/FormatPreview.test.tsx`: capped window has no pacing line; the others keep theirs
    (AC-R012-02, R71).
  - **TASK-003 check-01** `src/ui/block-panel.test.tsx`: the ladder's load is read from its
    summary line and asserted absent from rounds. The consumer list reads
    `refinements/ladder.tsx`, and `ladder-block.tsx` must compose `<LadderPrescription` (C35, R70,
    R72).
  - **TASK-003 check-02** `e2e/refinement/task-003.spec.ts` `readLoads`: the same.
  - **TASK-006 check-01** `src/ui/timed-workout-flow.test.tsx` (also TASK-011 check-01's file):
    - "the prescription follows the Start", with no `Ladder` rung row (was: the rung row follows
      it);
    - gallery last tile `24 × push up` (C35, R72).
  - **TASK-006 check-02** `e2e/refinement/task-006.spec.ts`:
    - "12 rounds outrun the screen" → the rounds follow the Start (C35, R95, R117);
    - `checkJourneyA11y`'s `scrollable-region-focusable` exception removed. The read-only rung
      rail it held is no longer drawn in any TASK-006 journey, so every rule now runs (the
      brief's "fix properly" option: no scroller).
  - **TASK-010 check-01** `src/ui/timed-result-log.test.tsx` (also TASK-009 check-01's file):
    before the end, the rounds grid is present and no `Ladder` rung row (C35, R95).
  - Backend lane, typechecked and loaded under `--list`, not run here:
    `e2e/design-0143/workout-ladder.spec.ts`:
    - `round()` finds the tile by `data-ladder-round`;
    - `N × name` notation;
    - the companion without "— same every round" (R70, R72).
  - Local B05, run here: `e2e/ui-polish-b05-scroll-boundaries.spec.ts`, ladder rung rail case:
    - the rail is now asserted absent while unanswered, and the horizontal cue contract is
      exercised on the answered (Incomplete) rail;
    - the cue pages until the scroll edge (interactive rungs are wider);
    - the start cue returns to the start before the unchanged radio contract;
    - explicit 90 s timeout.

## Sweep (every spec and test under `e2e/` and `src/`)

Searched for:
- copy: `same every round`, `Move through the rounds`, `between each rung`, `Each rung`;
- lists: `Movements in this ladder`, `Rounds in this ladder`, `name: 'Ladder'`, `.clr-rungs`,
  `LadderRungs`, `clr-rail`;
- headings and text: `Round N` headings, `N reps <name>`, `PACING_NOTES`, `timingSummary`;
- carve-outs: `scrollable-region`;
- every file mentioning `ladder` or `rung`.

- Fixed: the files above.
- Checked, not superseded:
  - `e2e/design-0143/workout-lifecycle.spec.ts` and `task-040-lifecycle.spec.ts` (`Movements in
    this ladder` — the summary list keeps that name; Complete/Incomplete unchanged).
  - `e2e/design-0143/accessibility.spec.ts`: its rail probe is conditional; containment and axe
    still hold.
  - `workout-formats.spec.ts`, `format-preview.spec.ts`, `core-loop.spec.ts`: badges, the
    `ladder_timing` column, and preview regions without the capped note.
  - Result-row fixtures (`highest_rung: null`) in the `workout-*`, B05 and `task-009/011` specs.
  - `ui-polish-b05-structure-badges.spec.ts`: badges only.
  - `e2e/refinement/task-007.spec.ts` and `task-008.spec.ts`: their `scrollable-region` allowances
    are now vacuous (their ladders are four rungs, never answered Complete). They still pass and
    are left unchanged.
  - `src/` tests that render ladders: `group-exercise-coaching`, `movement-identity`,
    `timer-frame-layout`, `countdown-urgency`, `Review`, `review-screen`, `gallery-registry`. All
    pass.
  - `src/test/generation-persistence.test.ts` "same every round" is a code comment about data.
- Edited specs: `tsc --noEmit` exit 0; `--list` loads all 30 tests in the 5 edited spec files.

## Failures and corrections

- check-01 route cases first read 0 live cards. Review now also draws `Rounds in this ladder`, so
  waiting on that list returned while Review was still mounted. `startWorkout` now waits for the
  three live cards and `Start schedule`.
- jsdom reports `min-width: 0` as `0px`; the assertion accepts both.
- A Next marker above `R1` pushed that tile's label 20 px below its row's. The marker now shares
  the label's line (`.clr-ladder-prescription__head`), so every row's labels are level.
- First live captures split names (`10 × push / up`). The reference sets no data tracking on the
  tiles or summary; dropping `letter-spacing` matches it. At 390 the names stay whole in 3
  columns; at 320 the grid is 2 columns.
- e2e: comparing whole tile readings after focus or scroll compared boxes. Comparisons now use the
  words.
- e2e: the ladder's Finish status is drawn beside the card, not in it. The case waits for the top
  slot to leave instead.
- e2e: after a reload, axe saw transient `empty-heading` in the grouped Coaching and notes sections
  (TASK-005's owner, unchanged). `settle` now waits for finite animations and for every heading to
  have its name; 3/3 then passed.
- B05 rail case: one end-cue click no longer reached the end (wider answered rungs); then a click
  hit a rung while the cue faded under load. It now pages by the scroll edge with explicit waits
  and a 90 s timeout; 3/3 isolated and 2/2 full-spec runs passed.
- TS6133: the unused `rungNames` helper was removed from `ladder-block.test.tsx`.

## Verification (this worktree, uncommitted candidate, 2026-11-10)

- `npm ci`: exit 0.
- `node scripts/refinement/run-required-check.mjs --task TASK-012 --check check-01 -- npx vitest run src/ui/ladder-rungs.test.tsx --passWithNoTests=false`:
  PASSED. Native 9 total, 9 executed, 9 passed, 0 failed/skipped/todo. It was re-run after every
  case was given an explicit timeout.
- `node scripts/refinement/run-required-check.mjs --task TASK-012 --check check-02 -- npx playwright test e2e/refinement/task-012.spec.ts --project=mobile`:
  PASSED. Native 5 total, 5 executed, 5 passed (about 28 s; synthetic origin, no credentials
  used; each case sets 120 s). Two direct runs before it: 5/5 each.
- Manifest sha256 `0d322bfc8bd10b71142860f775633b0207c7b172e35f4e7e3287b43781462ea1`.
- `npm run build`: exit 0 (`tsc --noEmit` over `src` and `e2e`, then Vite). `npm run lint:ds`:
  exit 0. `node scripts/gallery-index.mjs --check`: 71 verified.
- `npm test`: 263 files, 6215 tests passed, 0 failed.
- `npx eslint` per touched file against `git show HEAD:<file>`: no new error or warning
  (`gallery-registry.tsx` 137 → 137, `FormatPreview.tsx` 3 → 3, `ladder-block.tsx` 2 → 2, every
  other touched or new file 0).
- `npx playwright test <edited specs> --list --project=mobile`: 30 tests in 5 files.
  `e2e/refinement`: 64 in 12 files (+5, this spec). `e2e/design-0143`: 59 in 13.
- Direct runs, not through the guards (before the receipt refresh below):
  - `e2e/refinement/task-001` to `task-011` (minus 003, run separately): 52 passed. The 2 TASK-006
    "outrun the screen" failures were then fixed as above; TASK-006 7/7 and TASK-003 5/5.
  - `e2e/ui-polish-b05-scroll-boundaries.spec.ts`: the ladder case passes, 3/3 isolated and in 2
    full runs. The pre-existing B05-07 390x844 failure, and page cases flaky under load, are as at
    base.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,TASK-002,TASK-003,TASK-004,TASK-005,TASK-006,TASK-007,TASK-008,TASK-009,TASK-010,TASK-011,TASK-012`:
  PASSED, exit 0. Every task has "current passing receipts"; accepted-gallery 1193 files verified.
- Not run here: backend-lane specs (`e2e/design-0143/*`, `e2e/core-loop.spec.ts`) need
  `.env.runner.local`. The edited `workout-ladder.spec.ts` typechecks, lints and loads under
  `--list`.

## Earlier-task receipts

All refreshed by genuinely re-running their exact approved guard commands, sequentially, after the
candidate's code was final. Every manifest is untouched (`git diff -- 'evidence/refinement/*/required-cases.json'`
is empty). All PASSED:

| Task | check-01 | check-02 |
| --- | --- | --- |
| TASK-001 | 7/7 | 9/9 |
| TASK-002 | 11/11 | 7/7 |
| TASK-003 | 12/12 | 5/5 |
| TASK-004 | 10/10 | 5/5 |
| TASK-005 | 9/9 | 5/5 |
| TASK-006 | 17/17 | 7/7 |
| TASK-007 | 13/13 | 7/7 |
| TASK-008 | 13/13 | 5/5 |
| TASK-009 | 8 executed of 17 (its pattern) | 3/3 |
| TASK-010 | 9 executed of 17 | 3/3 |
| TASK-011 | 9 executed of 17 | 3/3 |

- **Changed receipts, as expected.** Each is a check whose target file this task edited, so the
  target hash is new:
  - TASK-003 check-01 and check-02;
  - TASK-006 check-01 and check-02;
  - TASK-009 check-01, TASK-010 check-01 and TASK-011 check-01 (they share
    `timed-result-log.test.tsx` / `timed-workout-flow.test.tsx` with the edited cases).
- Every other receipt is byte-identical (sha256 compared before and after). That includes the
  checks that render the changed ladder (TASK-002, 005, 007, 008, 010 check-02), which still pass.

## Open assumptions / unresolved

- **Per-movement progression lines.** Two movements sharing one sequence (thruster and pull up
  21 → 9) each state it on their own line, as the accepted reference does (one line per exercise).
  This supersedes EXE-04a's "the scheme is shown once" for the summary, per C35/R94.
- **Equipment beside the name in the summary** (`PUSH UP Bodyweight · …`) applies the platform's
  C03/R132 rule. V11's bodyweight sample shows no equipment word. The load is said once per
  movement, never per tile.
- **Wording kept, not rejected:** the timing line `… cap on the whole ladder` (V11 shows
  `12 rounds · 07:00 cap`) and the For Time and scheduled pacing lines. The copy pass is TASK-037.
- **Remaining read-only rung row** (the Complete state's reached reading) still overflows at 12
  rungs and would carry axe `scrollable-region-focusable` there. It and the "How far" question are
  TASK-013's wrapping result tiles (C33/C34). No journey here answers a 12-rung Complete.
- FormatPreview keeps its rung-reached rows and gets no grid (it previews timing modes and
  results).
- **Observation, pre-existing, not this task:**
  - `ui-polish-b05-scroll-boundaries` "capped workout entry area … 390x844 (B05-07)" fails
    identically at base `24f9a70` (`Expected <= 484, Received 497`; scratch `git worktree`,
    removed).
  - Its Home, History and B05-01.2 page cases fail intermittently under parallel load, at base
    too.
  - The scheduled EMOM ladder's header detail `525 SEC · PYRAMID` is the existing structure
    reading.

## Next action

Controller verification and commit.
