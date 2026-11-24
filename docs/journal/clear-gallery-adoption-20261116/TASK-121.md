# TASK-121 — re-record the retained definition records on the Round 7 tree (A3 task 15a, #747)

Task-owned progress note (body `clear-gallery-adoption-v2-20261120`, attempt 1, base `0b65357d`). Only TASK-121 writes it.

## Intended outcome

Re-record `docs/definitions/clear-refinement-20261103/TASK-035.md`, `TASK-037.md` and `TASK-038.md` in place, under
their body header, on the Round 7 tree after TASK-120, so their checks pass. Implement no feature. Change only
`repo:` source entries, their hashes and citations, and claim text tied to a moved source; leave
`verify-definition-record.mjs` and `lib/references.mjs` alone; in the tests change only the named old-build
assertions of rehearsal finding 6 (task-038: required sources, the coaching gallery page reads, the
`CoachingMovementSection` shape, the cards page and `WorkoutCard` slot; task-037: X2, X3, X4, X6). Own
`evidence/refinement/task-121/` (required-cases, receipt, test-ledger).

## What the base showed (`0b65357d`)

- 16 of 25 cases passed; 9 failed. TASK-035: two `repo:` hashes (the logging contract's additive amendments; History's
  read model gained equipment). TASK-037: 23 hashes and four removed files (`src/ui/refinements/overview.tsx`,
  `ladder.tsx`, `timed-result-log.tsx`, `logging-overlay.tsx`), and X2/X3/X4/X6 reading the old owners. TASK-038:
  six hashes, four removed files (`src/dev/gallery-refinement-coaching.tsx`, `gallery-refinement-cards.tsx`,
  `src/ui/refinements/workout-card.tsx`, `movement.tsx`), and the four named test reads.
- No `ref:accepted-gallery` (eded158) or `base:` (03087f7) blob holds the removed files' bytes (eded158's versions
  differ; the base has none), so each was re-pointed to the Round 7 file that holds or draws the same thing.
- Round 7's `/workout` draws every timed format through `TimedWorkoutFlow` (`BlockSlot`, under
  `PRODUCT_PRESENTATION`, which the app root mounts for every route). `EmomBlock`, `AmrapBlock`, `ForTimeBlock` and
  `LadderBlock`'s own rounds are drawn by no route. Generate keeps its two R23 helpers only in the
  presentation-less branch (owner decision 4 of 2026-11-13).
- Hard-stop check: no removed selected string is drawn by a Round 7 product route. The only `NOT STARTED` a route
  draws is the scheduled ladder's status (`LadderBlock.ScheduleStatus` inside `TimedWorkoutFlow`), which R40 did not
  select (U4). No product gap, no weakened claim needed.
- Brief premise: Round 7's accepted cards state does draw coaching. Its three single-movement timed cards each end
  with the real `GroupExerciseCoaching` (`timed-workout-flow.tsx:615`) on the gallery runtime's memory clients, whose
  library answers no entry for every movement (A3 TASK-109's cards parity reads it). The re-point follows the code.

## Changes

- Records: every `repo:` source rehashed. TASK-035: hashes only (claims hold on Round 7: V3's score line is drawn
  through `AmrapComparison` in `TimedWorkoutFlow`; no route is a report). TASK-037: S32/S44/S47/S48 re-pointed to
  `equipment-summary.tsx`, `ladder-rungs.tsx`, `timed-result-log.tsx`, `logging-overlay.tsx`; S69–S73 added
  (`timed-workout-flow.tsx`, `block-renderers.tsx`, `state/emom.ts`, `AppRuntime.tsx`, `product-presentation.ts`);
  I9, I10, X2–X6, U2, U3, U5, U13 re-recorded to the words the route draws; one Limitations bullet (copy behind the
  product presentation, and the presentation-less timed blocks, are not drawn). TASK-038: S19/S20/S27/S28
  re-pointed to `gallery-refinement-runtime.tsx`, `gallery-refinement-scenes.tsx`, `block-renderers-frame.tsx`,
  `movement-presentation.tsx`; S30/S31 added (`gallery-refinement-flow.tsx`, `timed-workout-flow.tsx`); I8 (the
  product's Add note → Movement note path), I13, F2/F3 leads, N3 and two Gallery disposition bullets re-recorded.
- Tests (named list only): task-037's `SELECTED` X2 (`drawn: 'product'`, read by `productLiterals`), X3/X4
  (`now` = `timed-workout-flow.tsx` + `state/emom.ts`; kept minute in Round 7's words, plus Now/Next), X6 (`now` =
  `ladder-rungs.tsx` + `state/ladder.ts`); the loop reads each `now` file; route-owner reads added. task-038: the
  required sources, the gallery-library reads, the per-owner guidance shape (plus `GroupCoachingPanel` draws one
  section per movement), the cards-state and `BlockPanel` owner reads. No title changed; task-035 untouched.
- Evidence: `evidence/refinement/task-121/required-cases.json` (check-01, 25 cases, the three records' tests),
  `results/check-01.json`, `test-ledger.json` (8 re-points, 4 retired claims, record changes, UAT list in
  `rules.forTask115`, self-check). TASK-037 and TASK-038 receipts refreshed; TASK-035's rewrote byte-identical.

## Failures, misleading signals and corrections

- First 038 edit wrapped "This task / changes no gallery state" across lines, which the unchanged Gallery-disposition
  read would not match; rewrapped before running.
- The self-check flagged one exact `.includes` read replaced by an escaped regex (the runtime library); changed back
  to an exact `.includes` read.
- `git grep` with zsh globs and a `while read` pipeline lost PATH in this shell; the source audits were rewritten as
  node scripts (scratchpad, outside the repository).

## Verification (exact)

- Base: `node --test` of the three files: 25 tests, 16 pass, 9 fail (above).
- `node --test scripts/refinement/task-035/037/038-definition.test.mjs`: 25/25 pass.
- `verify-definition-record.mjs --task TASK-035|037|038` (with each test's extra sections), Runner-layout store:
  PASSED, 41 / 73 / 31 sources.
- Guard: TASK-121 check-01, TASK-035 check-01, TASK-037 check-01, TASK-038 check-01: exit 0, every required case
  passed. Rerun: TASK-121, 037 and 038 receipts byte-identical.
- `verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-035,TASK-037,TASK-038,TASK-121`:
  PASSED (1193 accepted-gallery files verified).
- Mutation check (scratch, each product file restored from Git, `src/` clean after): 16 of 16 caught (X2 helper
  drawn, X2 constant or literal elsewhere, X3 caption in the flow or `state/emom.ts`, X3 kept minute gone, X4
  sentence, X6 suffix in `ladder-rungs.tsx` or `state/ladder.ts`, BlockSlot not using the flow, the section's note
  inside the guidance, the grouped panel not per movement, either owner dropping the disclosure, a gallery page
  reading `STATES_CATALOG`, the runtime library answering otherwise).
- Self-check (AST, typescript, over task-037 and task-038; both identical at the base and 181e580): 17 base titles,
  17 at HEAD, 0 absent or renamed; 5 changed bodies, 0 with fewer reads than the base or the build (15→24, 8→8,
  25→27, 12→13, 16→19); 9 lost reads, all named re-points; 0 skip/only/todo. `matchersWeakened: false`; X2's
  narrowed form is listed in `readsDroppedOrRelaxed`.
- CI chain (`npm run typecheck && npm run lint && npm run lint:ds && python3 scripts/gen-issues.py --check &&
  npm run gen:types -- --check && npm test && npm run build && ! git grep … console`), on the final records,
  tests and receipts: exit 0. Lint 0 errors, 175 warnings, none in the two changed scripts (`npx eslint` on them:
  clean), and no other lint-scope file differs from the base, so no new warning. Unit: 279 files, 6516 tests
  passed. gen:types current. Build passed. No browser or dev-server command was needed.

## Open assumptions

- `base:` sources stay as they are (the criterion allows `repo:` changes only). TASK-037 S20/S56/S58 and seven of
  TASK-035's `base:` files differ in Round 7; every token their claims quote is still in Round 7's files (audit).
- X5 (not on the named list): Round 7's AMRAP says `Log when complete` while it runs; the record keeps "Status: not
  applied in `AmrapBlock`" and states the route fact. Eric decides whether X5 is recorded as applied (successor work).

## Repair round 1 (records and ledger only)

- Finding (review, TASK-AC-D170E278DE09): retired claim 2 and its UAT line said `Start EMOM`, `Start AMRAP`,
  `Start For Time` and `Start ladder` no longer reach /workout, and the re-recorded I9/I10 had dropped them. Round 7
  draws all four: `Start ${format === 'ladder' ? 'ladder' : block.identity.label}` (`timed-workout-flow.tsx:469`)
  over the structure labels `EMOM`, `AMRAP`, `FOR TIME` (`workout-progress.ts:321-323`), checked by
  `timed-workout-flow.test.tsx:203-205`. Cause: I compared the old block files' literals with the flow's literals
  and missed the template that composes them.
- Same check over every word the re-record called gone (grep of `src` outside tests, `src/dev`, `src/test` and the
  three presentation-less blocks, then the styles that draw them) turned up three more: the timer frame draws its
  caption in capitals (`workout-chrome.tsx` `labelStyle`, `textTransform: 'uppercase'`), so `Paused`,
  `Finished early` and ` · Rest` still show as PAUSED, FINISHED EARLY and REST; and the format preview's for-time
  ladder (`FormatPreview.tsx`, mode `for_time`) still draws `Start each round when you finish the last. …`.
- TASK-037.md: I9 and I10 carry the Start actions as drawn (template [S69], labels [S74], exact strings
  `Start EMOM`, `Start AMRAP`, `Start FOR TIME`, `Start ladder` [S75]); U2 records the casing (written words differ;
  the timer frame and the Foundation button draw them in capitals [S33] [S76]); U5 says the for-time pacing sentence
  is drawn on the format preview [S60]; X3 says a scheduled ladder's status still shows `NOT STARTED` (U4); the
  Limitations bullet says the components are undrawn (not every word in their files), and a new bullet says words
  are quoted as written. Sources added: S74 `src/state/workout-progress.ts`, S75 `src/ui/timed-workout-flow.test.tsx`,
  S76 `src/design-system/css/foundation.css` (unchanged since the base). TASK-038.md: S29 (TASK-037.md) rehashed.
- Ledger: retired claim 2 now holds only words with no Round 7 drawing (`NO CLOCK`, `MIN ${view.minute} OF
  ${view.minutes}`, `AMRAP complete`, For Time's `Ready`, `Racing the clock`, `Finished under cap`, `As many rounds
  as possible…`), with a `repairRound1` note; the UAT line and the TASK-037 record-change summary match;
  `rules.repairRound1` added. No test assertion, `src` file, verifier or `base:` line changed.
- Verification: `node --test` of the three files 25/25; a token audit of every claim against Round 7's files: no
  quoted token missing. Guards TASK-121 (25), TASK-035 (8), TASK-037 (9), TASK-038 (8) check-01: exit 0, every
  receipt rewritten byte-identical. `verify-definition-record` TASK-035/037/038: PASSED (41, 76, 31 sources).
  `verify-delivery-evidence --mode final --tasks TASK-035,TASK-037,TASK-038,TASK-121`: PASSED. `npm test`
  (once, this tree): 279 files, 6516 tests passed.

## Next action

Controller verification and merge; TASK-115 carries the UAT items in the ledger's `rules.forTask115`.
