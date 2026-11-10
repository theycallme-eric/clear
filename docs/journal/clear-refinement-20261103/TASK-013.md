# TASK-013 — Rep-first ordered live ladder progress and result handoff (#640)

Body `clear-refinement-v2-20261109b`, attempt 1, base `7c5a1ad` (after TASK-039 #679, TASK-001 to
TASK-012, TASK-030 and TASK-032, #680 to #693). Task-owned progress note: the approved exception to
the shared daily journal for this body. Only TASK-013 writes this file.

## Intended outcome

REQ-013 (C33, C34, C36; R69, R77, R88, R89, R92, R93, R99, R118, R124; AC-C33-01, AC-C34-01,
AC-C36-01, AC-R013-01, AC-R013-02, AC-R013-03) delivered through `LadderPrescription` /
`LadderCompletion` / the ladder's lifecycle on the real `/workout` route. JOURNEY-013, completion
owner: a true timed four- or twelve-rung ladder is started, rungs are tapped while the work goes on,
and Finish or the cap carries the ordered progress into an editable end log whose rep targets are
largest, round labels secondary and tile rows level. Accepted gallery reference
`eded158cfd928d382c9a9409e2c372270312741d`, stable states `/gallery/refinements?state=ladder-4` and
`?state=ladder-12`.

## Selected design (derived from the approved sources, not a new product decision)

- **Live check-off (C34, R118; G09 "live workout rungs become tappable completion controls").** While
  a raced ladder's clock runs or is paused (TASK-032's `canTrack`), the compact prescription's round
  tiles (TASK-012) are the live check-off. Each is the shared `Chip` (a real `button`,
  `aria-pressed`), keeping the read-only tile's rows, wrapping and words. Its accessible name is the
  round and its work in words (`Round 3 kettlebell swing, 9 reps row, 200 m`). Before Start, after
  Finish or the cap, once saved, and on Review the same tiles stay read-only (R95). There is one grid,
  never a second. A polite status beneath counts: `3 of 12 rounds completed`, `0 of 12 …` for an
  explicit zero, and `No rounds marked yet` when nothing is stated (R118: unreported is not zero).
- **Ordered prefix (AC-R013-01, R89).** One number, "rounds completed through" (TASK-032's
  `progress` and the draft's `highestRung`). A tap on a rung outside the prefix selects through it; a
  tap inside it leaves the rungs before it (`ladderPrefixAfterTap`, pure, in `src/state/ladder.ts`).
  No gap is representable. The rung after the prefix is where partial work belongs: the log names it
  (`Any partial work belongs to round 6`) from TASK-030's rule as restated by TASK-032
  (`ladderPartialRound`). Entering the partial itself is TASK-015's.
- **Rep-first result tiles (C33, R99, R93, R92, R77, R88).** The result log's ladder family draws
  `LadderCompletion` under Complete / Incomplete (the accepted owner's composition): legend
  `Rounds completed`, one Chip per rung named `Round 3: 9 reps`. Three `aria-hidden` rows: `R3`
  (label-xs), the target (heading-h3, the largest) and the unit (label-xs, its own row). Each row is
  one line (`white-space: nowrap`, fixed line heights), so a row of tiles stays level for one- and
  two-digit targets. The grid is the accepted
  `repeat(auto-fill, minmax(calc(var(--control-height) + var(--spacing-500)), 1fr))`: it wraps and
  has no sideways scroller. The Chip's tick is not drawn on a rung tile. Selection is the shared
  selected surface and frame (the accepted `--bw: var(--focus-ring-width)`), `aria-pressed`, and the
  count.
- **The handoff (C36, AC-R013-03, R69, R118, R124).** TASK-032's carry is the rule: Finish carries
  tracked progress into the draft at once, and the cap carries it lazily, so a later edit is never
  overwritten.
  - Every round checked starts the log at Complete. A prefix starts at Incomplete through its last
    round.
  - Nothing tracked leaves the athlete's own answer. Once ended, an unanswered draft starts at
    Incomplete with no round stated (TASK-010), drawn but not recorded.
  - Finish never selects every rung, and no planned target becomes an actual: the draft's movement
    entries stay `{}`, and the outcome is `highest_rung` only.
- **Complete / Incomplete against the imported prefix (decided here, recorded).** The answer and the
  rounds are one draft.
  - Complete selects every rung.
  - A tile states the prefix through it; the top tile is Complete, any lower tile Incomplete.
  - Incomplete clears the round to be stated again (`editDraft({ completed: false, highestRung: null })`).
    This is the accepted owner's behaviour and the route's before. It fixes TASK-032's reviewer
    finding that a naive Incomplete after Complete would record the top rung.
  - So a fully checked ladder pre-selects Complete but stays editable. TASK-010's starting points and
    `workCompleted` semantics (For Time) are unchanged.

## Scope dispositions

- **Persistence.** The ladder's race clock, live progress, answer and rounds are TASK-032's durable
  attempt (`usePersistedLadder`, `clear.workout-ladders`). It replaces `usePersistedForTime` for
  every ladder: one clock, never two. A ladder clock an older build stored under the For Time key is
  adopted once and left as it was. The record is filed under the real session: `BlockCompletionApi`
  gains an optional read-only `sessionId`, which the shell's provider supplies; a bare test seam may
  omit it. Writes: only the existing `highest_rung` path. There is no migration, new writer or live
  service.
- **Effort.** Kept in the renderer's memory as before (TASK-010's check-01 "no category in storage"
  is unchanged and still passes). Storing it is TASK-046/047's.
- **Undo Finish.** Not offered (TASK-014). `undoFinish` is not wired.
- **Visible reload / reconnect / save recovery.** TASK-048. `saveSucceeded` / `saveFailed` are not
  called. The server's `recorded` still closes the attempt through the hook, so a saved ladder
  claims no answer (TASK-010's rule).
- **Per-movement partials and loads.** TASK-015 and MIG-B (TASK-031). Only the next rung's identity
  is shown.
- **Scheduled ladders (left to TASK-013 by TASK-032).** They use the same durable record for their
  start stamp, answer and rounds, with no cap (`ladderRaceCapSeconds` gives none and none is
  invented). They offer no live check-off: the schedule's own clock marks the live round (`Now`,
  E03), and a schedule has no Finish or cap. Their end is the schedule's, which starts the log at
  Incomplete as TASK-010 does. The athlete states the rounds on the same rep-first tiles, and a
  reopen keeps them.
- **Rounds versus rungs.** Check-off is offered for rounds that are rungs (`round <= rungCount`). A
  timing whose round count disagrees with its sequence (which the schema refuses) keeps any extra
  round read-only.

## Shared owner dispositions

- **`src/ui/refinements/ladder.tsx`** (accepted owner): **extended, not forked.**
  - `LadderRounds` takes `progress` and turns the same tile into a Chip.
  - `LadderPrescription` passes it through and adds the count (internal `LadderCount`).
  - New `LadderCompletion`: the reference's rep-first tiles, every reading from `ladderRungs`,
    `ladderUnit`, `rungNumbers` and `rungLabel`.
  - Not copied from the reference: its `emphasis="round"` variant (R99 selected rep-first) and
    its inline readings.
- **`src/ui/refinements/timed-result-log.tsx`**: **extended.** The ladder family's `rounds`
  (`LadderCompletionProps`) is drawn under the completion row in the same group, and disabled with
  it once saved. There is no new group, title or field.
- **`src/ui/ladder-block.tsx`** (route consumer):
  - `useLadderAttempt` (`usePersistedLadder` + `ladderAttemptView`), `ladderRace`, `liveProgress`
    and `useLadderResult` over the durable draft.
  - `RungsRow` and the `LadderRungs` import are removed. The read-only rung row and the "How far did
    you get?" radios are superseded by the log's tiles, so the 12-rung rail and its axe
    `scrollable-region-focusable` finding (TASK-012's open item) no longer exist.
- **`src/ui/ladder-rungs.tsx` (`LadderRungs`)**: unchanged. It is still FormatPreview's read-only
  reading. The register summary now says the live ladder no longer draws it.
- **`src/state/ladder.ts`**: `ladderPrefixAfterTap` (pure).
- **`src/state/block-completion.ts` / `-provider.tsx`**: optional `sessionId` on the seam.
- **`src/ui/refinements/presentation.css`**: the accepted `.clr-ladder-completion*` recipe and the
  live tile's Chip rules (no glyph, pressed frame, bleed fill). Tokens only.
- **`src/ui/refinements/tokens.css`**: **read; no variable** (REQ-013 `semanticVariables: []`).
- **`src/dev/gallery-refinement-flow.tsx`**: `ladder-4` / `ladder-12` already draw the route's own
  `LadderBlock`, so they now show the live check-off and the handoff with no gallery-only code (actual
  consumer adoption, memory storage, no writer). New register specimens: `LadderPrescriptionTracking`
  and `LadderCompletionFour` / `Twelve` / `Unstated`, plus a `LadderCompletion` registry entry.
  `COMPONENTS.md` was regenerated (72 entries).
- **`src/dev/gallery-refinement-forms.tsx`**: TASK-010's `?state=ladder` (route `LadderBlock`, clocks
  seeded under the For Time key, now adopted) shows the tiles. Its memory specimens draw the rounds
  too.
- REUSE.md: one owner, no route-local look-alike, and the gallery draws the actual consumer.
  LOGGING-FIELDS.md "Ladder — ordered prefix, dynamic completion count …": prefix and count are
  delivered. Per-movement partials, load, notes and the reversible-Finish UI belong to their tasks.

## Changes

- New:
  - `src/test/ladder-handoff-fixture.ts`
  - `e2e/refinement/task-013.spec.ts`
  - `evidence/refinement/task-013/required-cases.json` (check-01: 8 vitest cases; check-02: 5
    Playwright mobile cases) and the guard receipts
  - this note
- Source:
  - `src/ui/refinements/ladder.tsx`, `src/ui/refinements/timed-result-log.tsx`,
    `src/ui/refinements/presentation.css`
  - `src/ui/ladder-block.tsx`
  - `src/state/ladder.ts`, `src/state/block-completion.ts`, `src/state/block-completion-provider.tsx`
- Gallery and register: `src/dev/gallery-refinement-flow.tsx`, `src/dev/gallery-refinement-forms.tsx`,
  `src/dev/gallery-refinements.tsx` (doc), `src/dev/gallery-registry.tsx`,
  `docs/design/library/COMPONENTS.md`.
- Docs:
  - `src/state/README.md`: the TASK-013 row marked done; JOURNEY-032 still not complete.
  - `PROJECT_MAP.md`
  - `src/data/refinement-logging-contract.ts` and `docs/specs/LOGGING_FIELD_CONTRACT.md`: the ladder
    moment's draft, zero and readback text, now true.

## Tests added and changed

- **check-01** — 8 new cases in `src/ui/timed-workout-flow.test.tsx` (TASK-006's file), describe
  `TASK-013 rep-first ordered live ladder progress and result handoff`. They run over the real router
  at `/workout` over the new fixture, with injected `Date.now` and the shared stylesheets applied.
  - The fixture's ladders: twelve rungs of 16 kg kettlebell swing 3 → 36 reps with a fixed 200 m
    row, one 09:00 cap (`capped_window`); and four rungs of plank 5 → 20 sec under a 15:00 For Time
    cap. Neither matches the accepted screenshot's push up / burpee / 07:00.
  - Every case has a 30 s timeout. None is named "EMOM", so TASK-011's pattern does not select them.

  Cases:
  - AC-C34-01: read-only before Start, then 12 toggles named by round and work.
    - Prefix taps, inside-prefix taps and an explicit zero; Enter / Tab / Space with focus kept.
    - The polite count, no glyph (computed `display: none`) and the selected surface.
    - Progress stored under the ladder key, never the For Time key. Pause keeps check-off.
    - The other ladder is untouched; Finish returns the tiles to read-only.
  - AC-R013-01: a 10-tap sequence keeps one contiguous prefix; the pure rule over every rung and
    every prior state; the partial-round line, the explicit zero and Complete; the record holds one
    number (`movements` exactly `{}`); the saved row is `highest_rung` only.
  - AC-C36-01: 5 checked → Finish → Incomplete 5. Corrections: 7, Complete, Incomplete (null, not the
    top), 7. All 4 checked → Complete → corrected to 3. Saved rows 7 and 3 only; no set logs.
  - AC-R013-03: Finish with nothing tracked → Incomplete, none pressed, no partial line, draft
    `null`, outcome `{}`. The cap with 2 checked → 2 imported, no actions, no live tiles. No movement
    amounts; outcome keys only `highestRung`.
  - AC-C33-01 / AC-R013-02:
    - names `Round n: t unit` and the three rows' classes and text for both ladders;
    - the target in heading-h3 and the round and unit in label-xs, with heading-h3's smallest
      breakpoint value larger than label-xs's largest (read from foundation.css);
    - nowrap rows with fixed line heights;
    - the grid template; no rail and no scroller rule in any ladder CSS rule;
    - the pressed prefix on the selected surface.
  - JOURNEY-013 recovery: paused at 01:40 with 3 checked plus a running ladder with 2. After 10 min
    closed: frozen, kept, running 10:00. Then Resume / check / Finish / edit to 8 / effort. Reopen:
    the edit is kept, not re-imported; effort is unanswered and no category is stored; one record per
    ladder; the For Time key empty. Save 8 and 2; back to the saved section: no answer claimed, chips
    disabled, no clock action.
  - JOURNEY-013 no cap / older clock / schedule (direct mounts):
    - an uncapped ladder runs an hour without a cap, Finish imports 2, and the record has
      `originalCapSeconds: null` and the seam's session id;
    - a For Time-key clock is adopted (02:00), tracked, and left byte-identical;
    - a schedule: start stamp in the record, no cap, no check-off, Incomplete at its end, round 2
      stated, kept on reopen.
  - JOURNEY-013 gallery `ladder-4` / `ladder-12`: Start, tap R2 → `2 of N`, Finish → Incomplete
    through R2 with the accepted push up targets, Complete → all. `localStorage` stays empty; no
    fetch.
- **check-02** — new `e2e/refinement/task-013.spec.ts` (5 cases, mobile). It runs on a contained
  synthetic lane with Playwright's clock; only the section's own `block_results` inserts are allowed.
  The lane is not backend proof.
  - phone-320 and phone-390 touch:
    - the long ladder: check 3, toggle 5 off and on; live tiles wrap, labels and heights level, no
      glyph, unclipped; axe;
    - the short ladder: all 4, Finish → Complete;
    - result-tile geometry: three rows at the same offsets in every tile, each row level across a
      grid row, target font larger than round and unit, no glyph, unclipped, inside the log, more
      than one column, no sideways scroll, the selected frame equals `--border-selected`;
    - correct to R3 (partial round 4);
    - the long ladder's cap (clock fast-forwarded) → 5 imported, partial round 6; axe; no page
      overflow;
    - save: the long ladder `highest_rung` 5, the short 3, every other column null.
  - Keyboard, reduced motion (390):
    - Start, then Tab past Finish to R1; Space, Enter; the count's `role=status`;
    - Finish; in the log, Tab through the rounds; Space / Shift+Tab / Enter → 5;
    - a ladder finished with nothing → none pressed, `No rounds marked yet`;
    - animations ≤ 0.01 ms; geometry; axe; keyboard save.
  - Recovery (390): paused at 01:15 with 4 checked; reload → frozen and kept. Resume, check, Finish,
    edit to 9; reload → 9 kept; one ladder record and no For Time record; save 9.
  - Gallery `ladder-4` / `ladder-12` (320): live check-off geometry; handoff tiles named for the
    accepted push up and wrapping; axe; no network; both route keys empty.
  - Captures attached: `long-live-checked-phone-{320,390}`, `short-finish-complete-phone-{320,390}`,
    `long-cap-incomplete-phone-{320,390}`, `long-keyboard-corrected-reduced-phone-390` and
    `gallery-ladder-{4,12}-handoff-phone-320`. Comparable references: V11 (`V11-ladder.png`,
    VISUAL-CONTRACTS ties it to C35/C36), the accepted `ladder-4` / `ladder-12` states and the R7
    replay `scene.html?view=timed&state=ladder&rounds=4|12`.
- **Updated, superseded by approved criteria, each citing TASK-013 and the criterion in place:**
  - `src/ui/ladder-block.test.tsx` (39 cases, same count):
    - `afterEach(localStorage.clear)`, because the answer is durable now (without it, 5 cases
      inherited another case's answer);
    - the "How far did you get?" radios → `Rounds completed` tiles `Round n: t reps` (inverse
      `Round 1: 10 / 1 reps`; pyramid duplicates distinct by round);
    - `data-state` → pressed prefix; `Reached rung …` → the count;
    - choosing the top rung is Complete;
    - "captions … same group label" → the tiles' legend wears the log's `label` face;
    - the scheduled end → the tile;
    - free-paced: neither key stored before Start, and running tiles unpressed.
  - **TASK-012 check-01** `src/ui/ladder-rungs.test.tsx`, recovery case: the stored key
    `clear.workout-ladders` (was `clear.workout-for-time`); the How-far radios → 12 tiles,
    `Round 7: 14 reps`; the reached reading → `12 of 12 rounds completed` (C33, C34, C36).
  - **TASK-010 check-01** `src/ui/timed-result-log.test.tsx`:
    - the ladder case: How-far radios → tiles and count;
    - end to end: after a reload the ladder's Complete comes back (it was "starts again at
      Incomplete"; C36 / TASK-032 adoption);
    - gallery: tiles and count, and the ladder key is null.
    - "No category in storage" is unchanged.
  - **TASK-010 check-02** `e2e/refinement/task-010.spec.ts`: the How-far group → `Rounds completed`;
    `Reached rung 4 of 4` → the count; keyboard Tab now passes the four rung tiles before the faces
    (C34); gallery tiles; the ladder key is null.
  - **TASK-012 check-02** `e2e/refinement/task-012.spec.ts`, keyboard case: the How-far group with
    12 radios → `Rounds completed` with 12 tiles.
  - `e2e/ui-polish-b05-scroll-boundaries.spec.ts`: the ladder rung-rail case → "ladder rungs wrap
    into rep-first tiles with no horizontal rail, and every rung is reachable and revealed in place".
    It asserts no rail, no sideways scroll, more than one column, and every one of the 11 rungs
    focused by Tab wholly inside the viewport; Space / Shift+Tab / Enter. Header comment updated.
    Home's tab band keeps the rail contract.
  - Backend lane `e2e/design-0143/workout-ladder.spec.ts`:
    - the schedule's start is read from the ladder record's `clock.startedAt`;
    - free and capped ladders have nothing under either key;
    - How-far → the third `Rounds completed`, `Round 2: N reps`, the count.
  - `e2e/design-0143/accessibility.spec.ts`: comment only (its rail probe is conditional and still
    valid).
  - `src/dev/gallery-registry.test.tsx`: comment only.

## Mutation checks (check-01 selection; each restored and confirmed with a byte compare)

| Mutation | Cases failed |
| --- | --- |
| M1 Finish selects every rung | 7 |
| M2 no deselect inside the prefix | 3 |
| M3 no live check-off | 8 |
| M4 Incomplete keeps the top rung (TASK-032 reviewer finding) | 1 |
| M5 round largest, target small | 1 |
| M6 tick glyph drawn | 2 |
| M7 nothing stated reads as zero | 3 |
| M8 memory-only attempt | 6 |
| M9 no partial round named | 3 |
| M10 tiles never wrap | 1 |
| M11 a planned amount entered as an actual | 2 (0 before the `movements` assertion was made exact) |
| M12 check-off before Start | 2 |

## Sweep (every spec and test under `e2e/` and `src/`)

Searched for:
- copy and reading strings: `How far did you get`, `Reached rung`, `name: 'Ladder'`, `clr-rungs`,
  `LadderRungs`, `ladder-rungs`, `rung row`;
- storage: `usePersistedForTime`, `clear.workout-for-time` and `WORKOUT_FOR_TIME_STORAGE_KEY` in
  tests and specs, `clear.workout-ladders`, `localStorage.length`;
- scrolling: `clr-rail`, `scrollable-region`, `overflowX`;
- interaction: `Rounds completed` (shared with the AMRAP), `getByRole('status')` in ladder cards,
  every file mentioning `ladder` or `rung`.

Results:
- Fixed: the files listed above.
- Checked, not superseded:
  - `e2e/design-0143/workout-lifecycle.spec.ts` and `task-040-lifecycle.spec.ts`: Complete aria-checked
    and the movements list still hold; the tiles appear and wrap. Not run (backend); they load.
  - `e2e/refinement/task-006.spec.ts`: Start, Pause, Finish and recovery hold, 7/7 direct and through
    its guard. Its `checkJourneyA11y` comment ("the one state that still draws it, TASK-013's") is
    now historical; the code has no carve-out; left.
  - `e2e/refinement/task-007.spec.ts` and `task-008.spec.ts`: their `scrollable-region-focusable`
    allowance (held to `.clr-rail__scroller`) was already vacuous after TASK-012 for their journeys
    (four rungs, never answered Complete). My change does not alter what their journeys draw, so
    by the rule it is not "made wrong" here. Left unchanged and re-run green; noted for the owner.
  - `e2e/design-0143/accessibility.spec.ts`: comment updated only.
  - `core-loop.spec.ts`, `workout-formats`, `format-preview` and the B05 badges / other B05 specs:
    badges, `ladder_timing` columns and `highest_rung: null` fixtures only.
  - `src/app/FormatPreview.*` "Reached rung 3 of 5": FormatPreview's own read-only `LadderRungs`
    reading, unchanged.
  - `src/app/Workout.test.tsx` "Rounds completed": the AMRAP's group, with no ladder in its fixture.
  - `src/ui/for-time-block.test.tsx`, `src/state/workout-persistence.test.ts`,
    `refinement-ladder-recovery.test.ts`: the For Time key's own tests; pass.
  - `src/test/design-0143-final-audit.test.ts`: not modified.
- Edited specs: `tsc --noEmit` exit 0; `--list` loads 47 tests across the 6 edited or new spec files.

## Failures and corrections

- After the switch to the durable attempt, 5 `ladder-block.test.tsx` cases failed only in the full
  file: each case's answer persisted in `localStorage` (deterministic block ids) into the next.
  Corrected with `afterEach(localStorage.clear)`, as `timed-workout-flow.test.tsx` already does.
- The gallery coverage test refused the exported `LadderCount` (no register entry). It is now
  internal to the owner.
- `src/test/design-system-0.9.7.test.tsx` refuses the literal `overflowX` / `overflow-x` anywhere
  outside `test/` directories. My first AC-C33-01 draft read computed `overflowX`. It now asserts
  that no ladder CSS rule makes a scroller (`/overflow[^:;]*:\s*(auto|scroll)/`); the browser proof
  measures the real scroll.
- A drafting error in AC-R013-01 (three taps where one reaches zero) and a meaningless target
  assertion in AC-R013-03 were corrected before the first run.
- M11 showed `toMatchObject({ movements: {} })` matches any object. It now uses exact `toEqual({})`.
- Spec speed: `page.clock.runFor` over the 9-minute cap ticked every second (≈53 s per case). It
  now uses `fastForward` plus one tick (≈26 s), the same reading a phone left on the floor gets.
- A first attempt to read the unit row expected uppercase text. `textContent` is the DOM's
  `reps`; the uppercase is CSS.
- `grep` on the minified bundle silently missed matches on very long lines. Python counted instead.

## Verification (this worktree, uncommitted candidate, 2026-11-10)

- `npm ci`: exit 0.
- `node scripts/refinement/run-required-check.mjs --task TASK-013 --check check-01 -- npx vitest run src/ui/timed-workout-flow.test.tsx --testNamePattern "ladder|rung|handoff" --passWithNoTests=false`:
  PASSED. Native 25 total, 11 executed, 11 passed (8 declared plus TASK-006's 3 ladder-named
  cases), 0 failed, 14 skipped, 0 todo.
- `node scripts/refinement/run-required-check.mjs --task TASK-013 --check check-02 -- npx playwright test e2e/refinement/task-013.spec.ts --project=mobile`:
  PASSED. Native 5 total, 5 executed, 5 passed (synthetic origin, no credentials used; 120–180 s
  per-case timeouts).
- Manifest sha256 `55b39552db8b4a3230ddeac533c21fcb9dbfb4a1a798a333d734dac8054d7ee7`.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,TASK-002,TASK-003,TASK-004,TASK-005,TASK-006,TASK-007,TASK-008,TASK-009,TASK-010,TASK-011,TASK-012,TASK-013,TASK-030,TASK-032`:
  PASSED, exit 0. Every task has "current passing receipts"; accepted-gallery 1193 files verified.
- `npm run build`: exit 0 (`tsc --noEmit` over `src` and `e2e`, then Vite). The shared app chunk is
  356,220 → 367,639 bytes against base `7c5a1ad`, built in a scratch `git worktree` outside the
  workspace and removed afterwards. The difference is TASK-032's durable-attempt owner, tree-shaken
  while unused and now adopted, plus `LadderCompletion`. TASK-030's contract tables stay out of the
  bundle (`block_movement_results` is absent).
- `npm run lint:ds`: exit 0. `npx eslint` per touched or new file: no new error or warning
  (`gallery-registry.tsx` 137 → 137, `ladder-block.tsx` 2 → 2, every other file 0).
- `node scripts/gallery-index.mjs --check`: 72 verified.
- `npm test`: 265 files, 6251 tests passed, 0 failed (TASK-032: 265 / 6243; +8).
- Direct runs: `e2e/refinement/task-013.spec.ts` 5/5 twice; task-006/010/012 specs 15/15; the B05
  ladder case 1/1.
- Backend lane `e2e/design-0143/workout-ladder.spec.ts`, run in its own hermetic public-preview mode
  (`CI=1` with placeholder public values and no service-role key, `--retries=0`): 1/1 passed. This is
  the spec's labelled hermetic contract mode, not hosted-backend proof.

## Earlier-task receipts

Every check of TASK-001 to TASK-012, TASK-030 and TASK-032 was refreshed by genuinely re-running its
exact approved guard command (from each manifest's `command`), sequentially, after the candidate's
code and tests were final, together with TASK-013's two. No manifest was edited
(`git diff -- 'evidence/refinement/*/required-cases.json'` is empty). All 29 PASSED:

| Task | check-01 | check-02 |
| --- | --- | --- |
| TASK-001 | 7/7 | 9/9 |
| TASK-002 | 11/11 | 7/7 |
| TASK-003 | 12/12 | 5/5 |
| TASK-004 | 10/10 | 5/5 |
| TASK-005 | 9/9 | 5/5 |
| TASK-006 | 25/25 (the whole file, now with TASK-013's 8) | 7/7 |
| TASK-007 | 13/13 | 7/7 |
| TASK-008 | 13/13 | 5/5 |
| TASK-009 | 8 executed of 17 (its pattern) | 3/3 |
| TASK-010 | 9 executed of 17 | 3/3 |
| TASK-011 | 9 executed of 25 (its pattern) | 3/3 |
| TASK-012 | 9/9 | 5/5 |
| TASK-030 | 112/112 | 12/12 |
| TASK-032 | 10/10 | — |

- **Changed receipts, as expected.** Each is a check whose target file this task edited, so the
  target hash is new:
  - TASK-006 and TASK-011 check-01 (`timed-workout-flow.test.tsx` holds the new cases);
  - TASK-009 and TASK-010 check-01 (`timed-result-log.test.tsx`);
  - TASK-010 check-02 (`task-010.spec.ts`);
  - TASK-012 check-01 and check-02 (`ladder-rungs.test.tsx`, `task-012.spec.ts`).
- Every other receipt is byte-identical (compared with `cmp` against a copy taken before the run).
  That includes the checks that render the changed ladder without an edited target: TASK-002, 003,
  005, 006, 007 and 008 check-02; TASK-003 check-01; TASK-030; and TASK-032 (whose README / contract
  text this task updated without changing any assertion).

## Open assumptions / unresolved (for the controller and owner)

- **Copy (TASK-037):** `No rounds marked yet`, `N of M rounds completed` (the accepted format),
  `Any partial work belongs to round N`. The last is the visible identity of the next rung until
  TASK-015 puts its per-movement entry there.
- **Non-colour selection cue.** The accepted recipe's frame weight (`--bw: var(--focus-ring-width)`)
  equals today's `--border-width` (2px), so the visible cues are the selected surface fill and
  frame, `aria-pressed` and the count. A heavier frame would depart from the accepted gallery; it was
  not invented here.
- **Inverse pairs.** `10 / 1` in one tile is nowrap at heading-h3. At 320 it is close to the
  narrowest tile; it is covered in the DOM, not measured in the browser.
- **Effort** remains answerable but unsaved and unstored (TASK-010's open item, unchanged).
- **TASK-007 / TASK-008** axe allowance for `.clr-rail__scroller` is now impossible to trigger from
  any ladder state; removing it is theirs or a follow-up.
- The scheduled ladder's attempt clock never "ends" in TASK-032's terms (no cap, no Finish). Its end
  is the schedule's, read by the renderer. Undo/recovery owners should keep that in mind.

## Next action

Controller verification and commit.
