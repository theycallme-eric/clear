# TASK-103 — A3 task 3 (F1): save timed results for real and read them back in History (#726)

Body `clear-gallery-adoption-v2-20261116`, attempt 1, integration branch
`build/clear-gallery-adoption-2026-11-13`, base `a6cd01c9`. Source material only: the old build
`build/clear-refinement-2026-11-04` (`181e580`). This is the task-owned progress note; it satisfies
the shared daily journal rule for this body. Only TASK-103 writes it.

Path note: the brief's rules name this folder (`clear-gallery-adoption-20261116`); the issue body
names `clear-gallery-adoption-20261113`. The brief's path is used; the controller may move it.

## Status

Repair round 1 (2026-11-16) complete and committed on the worker branch, awaiting controller
verification. The reviewer rejected two criteria. Both are fixed: no load unit is guessed
(TASK-AC-21D8C507B137 / JOURNEY-031), and the ladder rung grid resolves to the accepted gallery's
inset tiles in dev and production (TASK-AC-A6EC0ADCD3BD). The parity check now compares layout as
well as words. Everything ran here except the two TASK-047 backend-lane cases, which need the
PRE-001 test backend (no `.env.runner.local` in this worktree; they fail at their explicit
precondition).

## Repair round 1 (review `TASK-103-a1-0912243326fd`, 2026-11-16)

### Rule: never guess a load unit (TASK-AC-21D8C507B137, JOURNEY-031)

A timed load is stamped with the unit the route knows: a saved row's unit, else the profile's
(`SetLoggingProvider`'s `weightUnit`). While the profile is unread (loading or failed),
`Workout.tsx` hands the shell `null`. The timed save is then refused exactly as the set path
refuses a set: `VALIDATION_REQUIRED_FIELD` with `{ field: 'weight_unit', reason: 'profile-unread' }`,
before anything is sent. The log keeps its draft and its dialog and says "Your log didn’t save. Try
again."; the forward action is refused the same way; once the profile is read, the same draft saves
in the profile's unit. `block_movement_results.weight_unit` is NOT NULL, so this applies to any timed
save made while no unit is known.

- `src/ui/timed-result-shell.ts`: removed `UNSCOPED_WEIGHT_UNIT` (`'kg'`) and the `weightUnit ?? 'kg'`
  fallback; the report carries the unit as known, or `null`.
- `src/state/block-completion.ts`: `TimedResultReport.weightUnit` is `Enums<'weight_unit'> | null`,
  documented as above.
- `src/state/block-completion-provider.tsx`: `saveTimed` (the one path for Save log and the forward
  action) refuses with `profile-unread` when the unit is `null`. TASK-031's `timedResultRequest`
  is unchanged.
- `src/ui/timed-flow-save.test.tsx`: the shell is mounted as the route mounts it, with the real
  `SetLoggingProvider` holding the profile's unit. The AMRAP case now uses pounds and asserts `lb`
  on every movement row (it asserted the fallback's `kg` before). The in-memory table stores exactly
  the unit sent. New case: with the profile unread, Save log and the forward action are refused,
  nothing is written, the draft and the dialog stay, and the retry after the profile is read saves
  in its unit. This case failed on the previous candidate (it saved `kg`).

### Look check: ladder rung tiles (TASK-AC-A6EC0ADCD3BD)

Cause: `.clr-ladder-prescription__grid li` had `padding: var(--spacing-200)` in
`src/ui/ladder-rungs.css` and `padding: 0; gap: 0` in `src/styles/workout-r7.css`, with equal
specificity, so stylesheet order decided. The gallery's dev chunk loaded `ladder-rungs.css` last
(inset tiles, the accepted look); the product chunk on `/workout` and the production bundle's shared
CSS chunk loaded `workout-r7.css` last (full-width tiles). Fix: the `li` declarations were removed
from `workout-r7.css`, so `ladder-rungs.css` is the only rule for that box and no load order can
change it. A static scan of every app CSS file (design system excluded) found no other identical
selector declared with conflicting values in two files. The gallery's look is unchanged: its ladder
card measures 523 px (320) and 559 px (390) tall before and after.

Production [inferred from the built CSS before the fix]: the pre-fix bundle carried both rules in one
shared chunk with `padding:0` last, so the production gallery drew full-width tiles too. After the
fix the bundle has one rule (`padding:var(--spacing-200)`). The dev gallery look, which the
controller confirmed as the accepted one, now holds in every build.

Parity spec (`e2e/refinement/task-103-parity.spec.ts`), every earlier assertion kept:
- Timed states: every rendered element of the card (ready, ended) and of the Log results form is
  measured (box relative to its part, scroll included) and compared one-for-one with the gallery's
  within 2 px. Heading levels are normalised (the gallery nests the card one outline level deeper),
  and a modal dialog inside the ended card is left out (top layer; measured as the log part).
- History (`screens`): the accepted state is a static composition in its own words, so the row
  hierarchy's geometry is compared: title alone on its line, status line beneath it from the same
  left edge, filter above the rows, for the same two workouts in order.
- Receipt schema `clear-task-103-parity/v2` adds `layout` (method, tolerance, counts, part boxes,
  differences or geometry).
- Before the CSS fix the strengthened spec failed exactly the two ladder cases (rung tiles 92 vs
  76 px tall at 320, 110 vs 76 at 390, frame inset 8 px vs 0); emom, amrap and for_time passed.

### Optional: For Time "Incomplete" at the route

New case in `src/ui/timed-flow-save.test.tsx`: a For Time saved as Incomplete through Round 7's log
is read back on the real `/history/:id` route (`renderApp`, `asPerformed` over the rows stored) as
Incomplete, not "Stopped at the cap", beside the effort face ("Effort: too hard") and the movement's
recorded actual ("ActualRound 1 · 22 reps · 20 kg"). `SessionDetail.test.tsx` stays byte-identical
to the build.

### Evidence updated

`required-cases.json` (AMRAP case renamed, two cases added to check-01, layout described),
`test-ledger.json` (11 carried, 14 rewritten, 0 retired, 11 added), `results/check-01.json`,
`results/parity.json`, and every `parity/*.json` receipt with its captures regenerated by the
final dev run.

## Intended outcome

- JOURNEY-031 (completion owner): `/workout`'s timed blocks are Round 7's `TimedWorkoutFlow` and
  `TimedResultLog`, and their Save log writes `block_results` and `block_movement_results` through
  `BlockCompletionProvider` and TASK-031's `saveTimedResult`; a refused write keeps the draft and the
  dialog; the retry converges; History reads the saved effort face and movement actuals back.
- JOURNEY-026 (completion owner): `/history` keeps Round 7's rows (title, then status with the date,
  then metrics) and the carried TASK-026 filter (All entries, Completed, Partial).
- Nothing the shipped timed renderers did on the base is lost while TASK-104, TASK-105 and TASK-116
  are pending.

## Changes

- **The seam.** `PRODUCT_PRESENTATION.timedWorkflows.saveResult` is `saveLogThroughShell`
  (`src/ui/timed-result-shell.ts`). `saveResult` now also receives `{ block, shell }`; the gallery's
  sample ignores it. With it present, `BlockSlot` draws EMOM, AMRAP, For Time and timed ladders with
  `TimedWorkoutFlow` (scheduled-start ladders keep `LadderBlock`).
- **The provider.** `BlockCompletionApi.saveTimedLog` (`src/state/block-completion.ts`, provider in
  `block-completion-provider.tsx`): keeps the report as the block's latest, waits for an in-flight
  section save, saves through the existing `saveTimed` (row, 23505 → correct, movement rows under
  ids minted once per block), then records the block (`onBlockRecorded` `saved`) or replaces its
  rows on a correction. No new `perceivedEffort:` or `effort:` key in the provider.
- **The translation** (`src/ui/timed-result-shell.ts`): receipt/draft → outcome in each format's
  existing contract (EMOM no measured outcome; AMRAP elapsed + counts once ended; For Time elapsed +
  completed under cap once ended; ladder highest rung only), report (category effort, typed entries;
  blank not sent unless a saved row must be removed), and saved row → receipt (TASK-048 read-back).
- **`TimedWorkoutFlow`:** reports outcome and timed report through `BlockPanel` continuously, so the
  forward action still saves what was entered without Save log; reads a saved row back as the saved
  log; keeps its clock (and an AMRAP's counts) in the shipped renderers' records through
  `src/state/timed-attempt-records.ts` when inside the shell, nothing in the gallery; does not reopen
  an already-ended log on remount; carries the shipped renderers' `data-urgent` marker; draws the
  shipped AMRAP's like-for-like score line (`AmrapComparison`, now exported).
- **`TimedResultLog`:** the AMRAP's "Reps into the next round" count (`partialReps`) beside the
  per-movement amounts — the shipped AMRAP's partial round, kept per the logging contract's owner
  decision ("the AMRAP keeps partial_round_reps beside the amounts").
- **`BlockPanel`:** passes `completion.timed` to `BlockCompletionControl` (TASK-015).
- **History detail** (`src/ui/session-detail.tsx`): the block's categorical effort through
  `SetEffortReading`, each movement's recorded actual under it (`data-movement-actual`), and the set
  table's column named RPE again. `src/app/SessionDetail.tsx`: facts in Review's order (TASK-004),
  as the F1 test body requires.
- **History rows** (`src/ui/history-list.tsx`): under Round 7 the status and the stored date share
  one line beneath the title (Home's status-date style), so they no longer wrap apart at 320.
- **Tests:** `src/ui/session-detail-timed-actuals.test.tsx` (build file, byte-identical);
  `src/app/SessionDetail.test.tsx` (now byte-identical to the build); new
  `src/ui/timed-flow-save.test.tsx` (7); one new ownership assertion; `Workout.test.tsx`'s two AMRAP
  helpers read Round 7's log (bodies unchanged); gallery registry exemption for `AmrapComparison`;
  `e2e/refinement/task-047.spec.ts` and `task-026.spec.ts` rewritten for Round 7 (same assertions);
  new `e2e/refinement/task-103-parity.spec.ts` (10).
- **Evidence:** `evidence/refinement/task-103/required-cases.json`, `test-ledger.json`,
  `results/check-01.json`, `results/parity.json`, `parity/*.json` (receipts). Captures are outside
  Git, in the project evidence store under `clear-gallery-adoption-v2-20261116/task-103/captures/`,
  hashed in the receipts.
- `PROJECT_MAP.md`: the Save log data flow.

Gallery-owned files changed (for the controller's hand diff): `src/styles/workout-r7.css` (repair
round 1: the ladder `li` declarations removed, TASK-AC-A6EC0ADCD3BD; the dev gallery's look is
unchanged), `src/ui/timed-workout-flow.tsx`,
`src/ui/timed-result-log.tsx` (AMRAP partial count; visible in the gallery's AMRAP log),
`src/ui/workout-experience-presentation.tsx` (seam type), `src/ui/block-renderers-frame.tsx`,
`src/ui/session-detail.tsx`, `src/ui/history-list.tsx`, `src/ui/amrap-block.tsx` (export only).
The gallery states render these live components, so `/gallery/refinements` shows the changes in the
same commit; the parity check found no text difference between the timed states and the route.

## Failures and corrections

- Switching the timed formats on failed 5 base tests in `Workout.test.tsx`: the AMRAP lost its
  clock and counts on navigation. Fixed by keeping the attempt in the shipped renderers' records, not
  by changing the tests' assertions.
- `initialTimedResultDraft` first lived in `timed-result-log.tsx` and added a fast-refresh lint
  warning; moved to `timed-result-shell.ts` (lint back to 175 warnings).
- TASK-026's e2e failed on Round 7 rows: at 320 the status and the date wrapped onto two lines.
  The row was fixed (one status-date line), not the assertion.
- The parity spec first read the route card before its movement list was drawn; it now waits for
  animations and stable text.
- Exporting `AmrapComparison` tripped the gallery registry's coverage test; recorded as an exemption
  (it draws `ConditioningScoreLine`, already framed).
- Review round 0 (2026-11-16) rejected two criteria. (1) The timed save fell back to `kg` when the
  profile was unread, and the AMRAP test asserted that fallback; corrected as described above. (2)
  The parity spec compared text only, so it recorded zero differences while the ladder tiles were
  drawn differently. The first layout-aware run also flagged heading levels and the top-layer
  dialog inside the ended card, both measurement artifacts; the comparison now normalises those,
  and after that only the real ladder difference failed.

## Verification (this worktree)

Repair round 1 (2026-11-16), final tree:

- `run-required-check TASK-103 check-01`: PASSED, 141/141 (21 required cases).
- `run-required-check TASK-103 parity` (host lock, dev server): PASSED, 10/10. Zero text and
  zero layout differences on every timed state at 320 and 390 (ready, log, ended). History's text
  differences are all labelled, and its row geometry matches the gallery's.
- Same spec against a production build (`vite build` with synthetic public values into the
  scratchpad, `vite preview`, `E2E_BASE_URL`; host lock): 10/10. Ladder card 523/559 px on both
  sides. Its receipts were then replaced by the dev run above.
- Before the CSS fix the strengthened parity spec failed 2/10 (both ladder cases).
- `npx playwright test e2e/refinement/task-026.spec.ts` 5/5; `task-047.spec.ts` 3/5, with the two
  backend lanes stopping at their PRE-001 precondition as before. Run directly, not through
  `run-required-check`, so the other tasks' receipts were not rewritten.
- `npm run typecheck` pass; `npm run lint` 0 errors, 175 warnings (as base); `npm run lint:ds`
  pass; console grep: no match; `gen-issues --check` pass; `gen:types --check` pass; `npm test`
  6,241/6,241 (263 files); `npm run build` pass, and its CSS has one `.clr-ladder-prescription__grid li`
  rule (`padding:var(--spacing-200)`).

Round 0 (before review):

- `run-required-check TASK-103 check-01` (vitest, 7 files): PASSED, 139/139.
- `run-required-check TASK-103 parity` (playwright, host lock): PASSED, 10/10. Every timed state
  matched the route with zero text differences at 320 and 390 (ready, log, ended); History's
  differences are all labelled (TASK-AC-6BFF651DF237, AC-C53-01, AC-R026-01).
- `run-required-check TASK-026 check-01`: PASSED, 5/5.
- `run-required-check TASK-047 check-01`: 3/5 — the two synthetic lanes and the gallery case pass;
  the two backend lanes fail at their PRE-001 precondition (no credentials here). Not proved here.
- `TASK-030 check-01` 112/112, `TASK-030 check-02` 12/12, `TASK-031 check-01` 12/12: PASSED. Their
  receipts were restored to the committed versions (other tasks own them).
- `npm run typecheck` pass; `npm run lint` 0 errors, 175 warnings (as base); `npm run lint:ds`
  pass; console check pass; `gen-issues --check` pass; `gen:types --check` pass; `npm test`
  6,239/6,239; `npm run build` pass.

## Open assumptions and questions

- Pause is still held in memory (TASK-104): the record keeps the clock's start moved on by completed
  pauses, but a reload while paused restores a running clock.
- An edit made after a save and then abandoned is not saved by the forward action (the block is
  already recorded); Save log is the authority once a log is saved.
- An AMRAP amount entered with no round count is refused by the contract (no round identity) and the
  log says it did not save; TASK-116 owns the AMRAP entry rules (amounts reset when rounds change).
- For the owner: Round 7's gallery History sample reads "date · status"; the app reads the status,
  then the date (decision 7 as task 1 implemented it, C53's carried row). Labelled AC-C53-01 in the
  receipt; worth confirming at approval.
- The backend lanes of TASK-047 are unverified until the controller runs them with PRE-001. They
  read the expected unit from the weight field's unit cap, which is drawn only when the profile's
  unit is known, so they never relied on the removed fallback [inferred from the spec].
- The accepted ladder look is the dev gallery's inset tiles, as the controller confirmed. Before this
  fix the production gallery drew full-width tiles [inferred from the built CSS]. If the owner
  accepted from a deployed preview, they saw that look; worth a glance at approval.
- At 320 the route's fixed section footer overlaps the bottom of tall timed cards in the element
  captures. This is how the spec captured before too; the box comparison measures the full card.
- A timed save with no unit known is refused even if it carries only effort or notes. The rule
  follows the set path ("no unit, no write"); the profile is normally read long before a block ends.

## Next action

Controller: run the brief's commands with the disposable backend, diff the gallery-owned files
above (now including `src/styles/workout-r7.css`), and review the parity receipts (`layout`
sections) and the regenerated captures.
