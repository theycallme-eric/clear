# TASK-034 — Use authoritative guide content and approximate duration (#661)

Body `clear-refinement-v2-20261109b`, attempt 1, base `d3cea8d` (after TASK-031 #696). This is the
task-owned progress note, the approved exception to the shared daily journal for this body. Only
TASK-034 writes this file.

## Intended outcome

REQ-034 (AC-R034-01, AC-R034-02), role independent. This is engineering definition work:

- establish where a Warm-up or Cooldown guide's content, count and approximate total time come
  from, with typed source ownership and the original movement selection kept;
- contract-test the missing, content, loading and error cases and the actual readings;
- use no hard-coded illustrated "4 minutes / 3 movements".

No user-facing feature, route, component, clock, writer, migration or live call is claimed or added.
TASK-022 draws the concise presentation and TASK-023 places Regenerate. Both build on this reading.

## Decision: the authoritative sources (from current source, nothing invented)

No product decision was needed. The guide content already exists in the generation output and the
persisted session, so nothing had to be invented or generated.

- **Content.** The generated Warm-up and Cooldown sections are catalog-bound prescriptions
  (`exercise_id`s from the candidate set). The guide lists every prescribed movement in composed
  order. After acceptance it reads the session's active rows, so a swap shows its replacement in the
  same place. Movements are named by `exerciseName`, the reader every movement row uses. The guide
  does no filtering, deduplication or curation.
- **Title.** The title is `sectionTypeLabel`: `Warm-up` or `Cooldown`. It never uses `section_title`
  ("Prepare for the press") or `section_notes` (R01).
- **Approximate time.** This is GEN-06's own `estimateDuration` over the section alone, rounded to
  whole minutes (at least one) and shown as `~N minutes`. It is the repository's only computed
  duration model, so the reading imports it rather than adding a second model. The reading never
  uses `estimated_duration_mins`, `computed_duration_mins` or the effective target. The Overview's
  Duration stays the target (REV-01).
- **Limitation, recorded in the contract §5.** The §7 allowance treats every set, including a timed
  hold, as one fixed working set, so a long hold under-reads. The owner's word is "approximate". A
  different rule, such as stated hold times, is an owner choice made in one place.

## Changes

- New `src/state/preparation-guide.ts` exports:
  - `composedPreparationGuide` and `persistedPreparationGuide`;
  - `preparationGuideReading` (`loading` / `error` / `missing` with `no-workout`, `not-composed` or
    `no-movements` / `ready`);
  - `approximateDurationText`;
  - `PREPARATION_GUIDE_SOURCES`, the typed source record.

  A malformed persisted row gives `PERSISTENCE_READ_FAILED` (`target_shape`) and is never guessed.
- New `docs/specs/PREPARATION_GUIDE_CONTRACT.md` contains the contract, the sources table, the
  states, an observed reading, the limitations, the gallery disposition and traceability.
- New `src/state/preparation-guide.test.ts` is check-01, with 8 cases.
- New `evidence/refinement/task-034/required-cases.json` and the guard receipt
  `results/check-01.json`.
- Changed `src/state/README.md`: a section on the reading and a consumers table for TASK-022 and
  TASK-023.
- Changed `PROJECT_MAP.md`: three lines on the new data flow, where the app imports GEN-06's pure
  estimator.
- Unchanged: `supabase/functions/**` (imported only, not edited), every schema, writer, renderer,
  route, gallery file and e2e spec.

## Gallery disposition

The accepted `/gallery/refinements?state=preparation` shows the guide's appearance only. Its
coverage entry for REQ-034 says that content and duration rules remain definition work. The
application gallery has no `preparation` state at this base, and the presentation that state must
draw belongs to TASK-022 (PreparationGuide). Adding it here would duplicate TASK-022's component or
create a synthetic scene. Therefore no state, scene, CSS or writer was added, and
`src/dev/gallery-refinement-scenes.tsx` is unchanged. TASK-022 adopts this reading in the routes
and in that state, replacing the reference's fixed `minutes={5}` and sample names (contract §6).

## Consumer sweep

The new module changes no existing type or export. Review (`review.ts`), the live workout
(`workout-progress.ts`), favorites, History, the generation output types and the backend-lane
specs (`e2e/design-0143/*`, task-040, core-loop, B05) need no edit. The test checks parity with
Review's `reviewBriefing` and the workout's `sessionProgress` without changing either.

## Tests (each criterion it justifies)

All cases are in check-01 `src/state/preparation-guide.test.ts`, describe "TASK-034 authoritative
preparation guide content and approximate duration":

- **AC-R034-01:**
  - the stable title, all movements in order with a repeat kept, and the count;
  - no generated title, prose or per-movement prescription;
  - the time equals GEN-06 §7 by hand and inside a whole workout;
  - moving the model estimate, computed duration or target changes nothing;
  - the persisted session reads the same as its composed source, through the real sessions client
    over the session double;
  - a swap is read in place;
  - every source owner resolves to a real export, and the contract names every owner, column and
    reason.
- **AC-R034-02:**
  - missing reads `no-workout`, `not-composed` and `no-movements`;
  - loading and error pass through, and a malformed row is an error;
  - the recorded generation response, parsed by the edge parser, reads as Review's briefing and the
    live workout name it: `~5 minutes`, 2 movements, derived from its prescriptions;
  - readings vary with the data (counts 1, 2, 6 and 1, with distinct times);
  - the `~N minutes` format, singular for one;
  - the module's code holds no duration, count or sample movement (its numeric literals are only
    0, 1 and 60).

## Failures and corrections

- The worktree had no `node_modules`. The first `npx vitest` therefore fetched an unrelated
  `vitest@5.1.0` into the npx cache, and that run failed to load the config. Nothing in the worktree
  changed. `npm ci` was then run, as the controller does, and every later command used the installed
  Vitest 4.1.11.
- The first run had 2 failures:
  - the contract file was not written yet;
  - the literal scan found `0`, from the empty checks `length === 0`, and the expectation was
    widened to `0`, `1` and `60`.

  Both were fixed, and nothing was skipped.
- Order of work: the module draft was written just before the test file, not strictly test-first.
  The test was then run red, as described above, before the contract was added.

## Verification (exact results)

| Command | Result |
| --- | --- |
| `npm ci` | completed |
| `node scripts/refinement/run-required-check.mjs --task TASK-034 --check check-01 -- npx vitest run src/state/preparation-guide.test.ts --passWithNoTests=false` | PASSED: 8 total, 8 executed, 8 passed, 0 skipped |
| `npx tsc --noEmit` | clean |
| `npx eslint` on the two new files | clean |
| `npm run build` | exit 0 |
| `npm run lint:ds` | exit 0 |
| `npm test` | 267 files, 6280 tests passed |
| `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,TASK-002,TASK-003,TASK-004,TASK-005,TASK-006,TASK-007,TASK-008,TASK-009,TASK-010,TASK-011,TASK-012,TASK-013,TASK-014,TASK-030,TASK-031,TASK-032,TASK-034` | PASSED; every task has current passing receipts |

## Open assumptions

- The first Warm-up or Cooldown section is "the" guide, because each enabled section is composed
  once. Per-section functions cover any other layout.
- Owner review (not blocking): whether the §7 allowance is an acceptable "approximate" for long
  holds, or whether stated hold times should count. This is recorded in contract §5.

## Next action

The controller commits and verifies. TASK-022 adopts `composedPreparationGuide` /
`persistedPreparationGuide` / `preparationGuideReading` on `/review`, `/workout` and the gallery
`preparation` state.
