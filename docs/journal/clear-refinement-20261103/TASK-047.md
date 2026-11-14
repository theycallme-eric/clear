# TASK-047 — Verify visible timed-result persistence and History readback (#673)

Body `clear-refinement-v2-20261109b`, attempt 1, base `3175c07` (#722, TASK-041 merged; `git fetch
origin` then `git merge-base HEAD origin/build/clear-refinement-2026-11-04` =
`3175c0781f772624e163fbdfe655e7cd7ab226f5`). This is the task-owned progress note, the approved
exception to the shared daily journal for this body. Only TASK-047 writes this file.

## Status

Implementation complete (uncommitted), awaiting controller verification and commit. The two
backend-lane cases could not run here: no `.env.runner.local` exists in this worktree, so they
fail at their explicit precondition (see Verification).

## Intended outcome

REQ-031 (AC-R031-01, AC-R031-02, AC-R031-03), completion owner of JOURNEY-031 (ENTRY-031:
`/workout` → `/summary` → `/history/:id`). Entered timed actuals save with correct
block/round/movement identity:

- per-movement partials and loads;
- categorical section effort;
- notes.

They survive a forced save failure with the draft kept and retry without duplicate rows. They read
back after a reload in History, reflecting the actual entries, not the plan or a fixture. All of
this is proved on the authorized disposable lane. The data provider is not recreated: TASK-031's
writers, `saveTimedResult` and the History read model, as wired by TASK-015 through
`BlockCompletionProvider`, are used unchanged.

## Sources read

- The brief and RUNNING-SUMMARY.
- Notes from TASK-010, 015, 030, 031, 026, 046 and 019.
- `docs/specs/LOGGING_FIELD_CONTRACT.md` §2–§13.
- The accepted reference's `LOGGING-FIELDS.md` and `src/ui/refinements/timed-result-log.tsx`
  (eded158c…).
- CURRENT-REQUIREMENTS-AUTHORITY G07.
- Register entries R43, R62, R80, R84 and R116.
- `scripts/e2e/env.mjs`, `e2e/support/backend.ts`, `scripts/e2e/client.mjs`, and the backend-lane
  pattern in `e2e/design-0143/workout-amrap.spec.ts` and `workout-ladder.spec.ts`.
- `scripts/refinement/lib/required-check.mjs` (how skipped required cases are treated).

## Missing-field determination (controller's question)

The accepted reference and LOGGING-FIELDS give every timed family Effort and Notes, and the EMOM
its applicable movement loads. On base `3175c07` six were missing:

- AMRAP effort;
- AMRAP notes;
- EMOM effort;
- EMOM per-movement "Weight used";
- For Time notes;
- ladder notes.

**Determination: (a), all six.** They are required by AC-R031-01, which this task owns, so they are
wired through to save and readback here using the existing writers.

Sources:

- **AC-R031-01** (verbatim): "Implement the validated richer timed-result mapping for per-movement
  partials/loads, categorical section effort and notes with correct block/round/movement identity".
  JOURNEY-031's entry state: "An ended timed attempt has measured per-movement partials/loads,
  optional effort/notes".
- **The validated contract (TASK-030),** `LOGGING_FIELD_CONTRACT.md` §2. It lists exactly these as
  "Proposed still":
  - EMOM: "block effort (MIG-A) and applicable movement loads (MIG-B, no partials)";
  - AMRAP: "notes (reuse `block_results.notes`), block effort (MIG-A, no AMRAP effort field yet)";
  - For Time and ladder: "notes (reuse)".

  Each has owners "TASK-031, TASK-015, TASK-046, TASK-047, TASK-019". §5 decides notes reuse
  `block_results.notes` with no migration.
- **Every other listed owner has merged and deferred:**
  - TASK-015's note, "Scope dispositions": "EMOM loads … not drawn … the EMOM family keeps its
    notes-only log (TASK-046's shared timed logging)" and "Notes for AMRAP / For Time / ladder,
    AMRAP effort: not added (TASK-046)". §13 says the same.
  - TASK-046's note: "keeping their fields"; `TimedResultLog` adopted unchanged.
  - TASK-019 verifies only.
  - TASK-010's note: "AMRAP effort (R80): not added … the shared log can take it in one line for
    TASK-015 / TASK-046 / TASK-047".
  - `timed-result-log.tsx`'s own header (base): "the EMOM's applicable weights, notes for the other
    families and the categorical effort's wider adoption (TASK-046, TASK-047)".
- **Owner intake:**
  - R80 (AMRAP): "reuse the existing actual three-face effort selector".
  - R84 (EMOM): "Keep the shared end-log layout with its meaningful optional effort, applicable
    movement weights and notes".
  - G07: "plus effort, notes and applicable movement weights".
  - LOGGING-FIELDS EMOM row: "engineering mapping pending".

None was invented. Each reuses an existing field, writer and control:

- `SetEffortChoice`, the same legend and Clear as the For Time and ladder;
- the EMOM's `Notes · optional` input;
- TASK-015's `MovementGroups` with no partial round for the EMOM, since `partialRoundFor` gives an
  EMOM none.

Not drawn, deliberately (c): no EMOM amount, no new rounds count, no durable draft for the new
fields (see open items).

The History screen did not render `BlockDetailView.effort` or `movementActuals` (TASK-031's open
item "TASK-026 / TASK-047 … render"; TASK-015's "History's screen does not yet render
movementActuals (TASK-026/047)"). JOURNEY-031's destination needs it, so it is rendered here (a).

## Changes (product)

- **`src/ui/refinements/timed-result-log.tsx`** (shared owner, extended):
  - new `TimedEffortField` and `TimedNotesField`;
  - `AmrapResultLog.effort/notes`, `CompletionResultLog.notes`, `EmomResultLog.effort/movements`;
  - one closing feedback group (effort, then notes) as the accepted log draws it;
  - EMOM movement groups take loads only;
  - notes are disabled once saved, and a saved block with a blank note draws no empty field.
- **`src/ui/emom-block.tsx`:** effort and loads as this mount's drafts (like the note), reported
  once ended as `TimedResultReport { family: 'emom' }` beside `endLogOutcome`.
- **`src/ui/amrap-block.tsx`:** effort and notes drafts. Notes go in the reported outcome; effort
  goes in the report (`effort` was `null` before).
- **`src/ui/for-time-block.tsx` and `src/ui/ladder-block.tsx`:** a notes draft, reported in the
  outcome.
- **`src/ui/session-detail.tsx`** (History `/history/:id`):
  - `StructureResultBadge` draws `block.effort` through `SetEffortReading` as an "Effort"
    measurement (never on the 1–10 scale);
  - `LoggedExercise` draws the movement's recorded actual (`data-movement-actual`) as
    `Actual Round N · amount · load`.
- No writer, schema, migration, provider or read model changed. `BlockCompletionProvider` is still
  the only save path.
- **Gallery:** `?state=emom|amrap|for_time|ladder` render the route's own blocks, so they show the
  new fields with no gallery change. Register: one appended `SessionSectionCard` specimen,
  "timed actuals and effort". `node scripts/gallery-index.mjs --check` passes with 77 entries; the
  index is unchanged.
- **Docs:** `LOGGING_FIELD_CONTRACT.md` gains an appended §14 (TASK-047 amendment).

## Tests added

- **`e2e/refinement/task-047.spec.ts`** and **`evidence/refinement/task-047/required-cases.json`**
  (check-01, 5 required cases). One journey body runs in both lanes:
  1. **Backend lane, touch, 390, Signal (AC-R031-02).** The four families' entries are made. The
     EMOM's movement write is refused (503, never forwarded): the existing dialog appears and every
     entry is kept (all four logs reopened and read). The retry writes:
     - the EMOM block `POST 201, POST 409, PATCH 200`;
     - its movement `POST 503, POST 201`;
     - every other row once, and no row for a blank movement.

     The rows read back with exact round, amount, load, unit, effort and notes, including an
     explicit 0. Then `/summary`, the History row's address, and `/history/:id`, which shows each
     effort face, note and actual under its movement, never the planned 16 kg. A reload shows the
     same, with nothing written.
  2. **Backend lane, keyboard, 320, reduced motion, Clear (AC-R031-03).** The AMRAP's block write
     applies but its answer is lost. The effort, an amount and the notes are corrected, then
     retried: `POST lost, POST 409, PATCH 200`, with the corrected values in one row. The For
     Time's movement write applies but its answer is lost. The amount is corrected, then retried:
     `POST lost, POST 409, PATCH 200`. Zero is kept. A blank movement and the unreported "Reps into
     the next round" stay unrecorded (no "Partial round" reading). History reads the corrected
     values, before and after a reload.
  3. Case 1's journey on the contained synthetic lane (AC-R031-01; not backend proof).
  4. Case 2's journey on the contained synthetic lane (AC-R031-03; not backend proof).
  5. **Gallery (AC-R031-01).** The four states' logs end in the feedback group, and the EMOM has a
     load field. Values typed there are kept through close and reopen. Nothing is stored and there
     is no network.

  Backend precondition: `backendWorld` asserts `backend.available` with the PRE-001 reason (a
  failure, never `test.skip`), then zero-row MIG-A and MIG-B boundary reads. The shared guard also
  rejects any skipped required case. The lane follows the existing pattern:
  - a namespaced `clear-e2e-<ns>-<project>-t047-<hash>@example.com` user;
  - `complete_onboarding`, `persist_session` (the acceptance parsed with
    `sessionAcceptanceSchema`) and `start_session`;
  - service-role reads filtered to this user's block and exercise ids;
  - `deleteUser` in `finally`.

  Faults are injected in the browser only: a refused write is fulfilled 503; a lost answer is
  `route.fetch()` then `route.abort()`.
- **`src/test/timed-readback-fixture.ts`:** the shared session; the catalog ids are parameters
  (the backend lane reads a dumbbell and a bodyweight movement from the project's own catalog).
- **`src/ui/session-detail-timed-actuals.test.tsx`** (task-owned jsdom, 2 cases): the History
  category through the face and never on the 1–10 scale; each actual under its movement; zero kept;
  nothing for an unrecorded movement; nothing from the plan.

## Earlier tests changed (owner decision 2026-11-10), line by line

Owner decision (Eric, 2026-11-10): "May tasks update earlier tests when their approved requirement
replaces that UI?" — "Yes, go ahead". Case names are kept, no `required-cases.json` was edited, and
each owner's exact guard was re-run.

- **`src/ui/timed-result-log.test.tsx`** (TASK-009 check-01), AC-C26-01, ~l.371–379: "non-movement
  groups toHaveLength(1)" becomes 2. The second group holds no count and holds the `Effort ·
  optional` group and the `Notes · optional` textbox (R80). The first group's count assertions are
  unchanged.
- **`src/ui/timed-workout-flow.test.tsx`** (TASK-011 check-01; TASK-006 whole file):
  - `expectNoTally`, ~l.781: number fields may only be `Weight · …` loads; a radiogroup may only be
    the effort faces (`.clr-set-effort`); a button may only be `Clear effort for this block`; the
    `.clr-set-effort` absence assertion is dropped (R84). No output, quantity or checkbox is
    allowed, and no minutes/complete/count/confirm words.
  - AC-C31-01, ~l.976–996: dialog headings other than movement-group titles = `['Log results']`;
    form headings = `['kb swing']`; one spinbutton, `Weight · kb swing`; one non-movement group,
    holding the effort group; its only non-radio field is the notes textarea.
- **`src/ui/emom-block.test.tsx`** (not a check target), "draws no set-entry form…", end of case:
  after the log opens, fields = notes only, spinbuttons only `Weight · …`, an effort group exists,
  still no slider, Minute done, RPE or exertion.
- **`src/ui/ladder-block.test.tsx`** (not a check target), `expectNoSetEntry`: the only allowed
  textbox is `Notes · optional` (the block note, not a set entry).
- **`e2e/refinement/task-009.spec.ts`** (TASK-009 check-02):
  - `LogGeometry.feedbackGroups` added;
  - `readLog` `groups` keeps only the non-movement group holding the counts, and `feedbackGroups`
    is the non-movement group without a count;
  - `expectLogContract` keeps "one result group" for the counts and adds "one feedback group",
    after the counts and every movement group (R80).
- **`e2e/refinement/task-010.spec.ts`** (TASK-010 check-02): the two History checks
  `getByText('Effort').toHaveCount(0)` (~l.601, ~l.713) become the saved category read through the
  face (`img 'Effort: too easy'` / `'Effort: too hard'`, count 1) and no `N of 10` anywhere. Since
  TASK-015 the row carries the category; History now reads it (AC-R031-02).
- **`e2e/refinement/task-011.spec.ts`** (TASK-011 check-02), `expectNoTally`:
  - number fields only `Weight · …`; radiogroups only inside `.clr-set-effort`; buttons only
    `Clear effort for this block`;
  - still no output, quantity, slider or checkbox, and none of the minutes/complete/count/confirm
    words;
  - exactly one text field (`textarea, select, input` other than number and radio) (R84).
- **`e2e/refinement/task-019.spec.ts`** (TASK-019 check-01), ~l.1238: "no `input[type=number]`
  and no `[role=radiogroup]` in the EMOM log" becomes: number inputs only `Weight · …`,
  radiogroups only the effort faces, no output or quantity.
- **`e2e/refinement/task-046.spec.ts`** (TASK-046 check-01), ~l.443: the same restatement for the
  EMOM log.

## Failures and corrections

- Spec run 1:
  - Both journeys started a block while the previous block's log was open (the workout is inert
    behind it). `runBlock` now closes the log first.
- Spec run 2:
  - Case 1's final count included the cooldown block's row (the synthetic `blockRows` returned
    every block). It now returns the four timed blocks, as the backend read does.
  - A generic "every animation ≤ 0.01 ms" check failed on a 700 ms animation unrelated to this
    task. It was removed: reduced-motion behaviour is not this task's criterion.
- Spec run 3: the History detail called `session_as_intended_at_start`, which the synthetic lane
  did not answer.
- Spec run 4: the synthetic lane now answers it, and activating the History row then went to
  `/review`. Activating a completed row is designed to repeat the workout (`useOpenHistorySession`).
  The journey now asserts the row's `href` is `/history/:id` and opens that address, as TASK-015's
  spec did.
- ESLint:
  - `react-hooks/preserve-manual-memoization` error in `amrap-block.tsx` and two new
    exhaustive-deps warnings, both from a needless `useMemo` over the outcome (a new object every
    render). It is now a plain expression in AMRAP and For Time.
  - This edit landed while the Playwright guards were running. It is behaviour-equivalent; the
    final sweep below ran on the final tree.

## Verification (this worktree, uncommitted)

All Playwright commands ran under `node …/agent-runner-v2/bin/v2.mjs with-lock --`.

- `npm ci`: exit 0.
- Synthetic and gallery cases (`-g "synthetic lane|gallery"`, `--trace=off`): 3/3 passed.
- Unit tests: `npx vitest run` gave 275 files and 6387 tests passed (after the test updates).
- Earlier owners' vitest guards (exact manifest commands), all PASSED:
  - TASK-006 c01: 32/32;
  - TASK-009 c01: 10 executed;
  - TASK-010 c01: 11;
  - TASK-011 c01: 9;
  - TASK-012 c01: 9/9;
  - TASK-013 c01: 11;
  - TASK-014 c01: 15;
  - TASK-015 c01: 13;
  - TASK-016 c01: 13;
  - TASK-017 c01: 7;
  - TASK-018 c01: 9;
  - TASK-030 c01: 112/112;
  - TASK-030 c02: 12/12;
  - TASK-031 c01: 12/12.

  Changed receipts are the check-01 receipts of TASK-006, 009, 010, 011, 013, 014 and 015. Their
  targets were edited, or (for TASK-015 check-01) share the edited file. The others are
  byte-identical.
- **Earlier owners' Playwright guards, run 1** (exact manifest commands, one lock):
  - PASSED: TASK-006 c02 7/7; TASK-012 c02 5/5; TASK-013 c02 5/5; TASK-014 c02 5/5;
    TASK-015 c02 3/3; TASK-019 c01 5/5; TASK-041 c01 10/10; TASK-046 c01 6/6. TASK-019 and
    TASK-046 already ran on their edited specs.
  - REJECTED on the superseded assertions listed above: TASK-009 c02 0/3 ("one result group");
    TASK-010 c02 1/3 (History "no Effort"); TASK-011 c02 0/3 (`expectNoTally`).
- **Run 2, after the spec updates:** TASK-009 c02 3/3, TASK-010 c02 3/3 and TASK-011 c02 3/3,
  all PASSED.
- **TASK-047 guard** (`node …/v2.mjs with-lock -- node scripts/refinement/run-required-check.mjs --task TASK-047 --check check-01 -- npx playwright test e2e/refinement/task-047.spec.ts --project=mobile`):
  REJECTED, as expected here. Native: 5 total, 5 executed, 3 passed, 2 failed, 0 skipped.
  - The three synthetic and gallery cases passed.
  - The two backend-lane cases failed at their precondition: "TASK-047 backend lane (PRE-001):
    Needs SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY". No `.env.runner.local`
    exists here.
  - The committed receipt `evidence/refinement/task-047/results/check-01.json` is this rejected
    run; the controller's run replaces it.
- **Sweep, on the final tree:** `npx playwright test e2e/refinement/ --project=mobile --workers=1 --trace=off`
  gave 192 passed and 2 failed (27.7 min). The two failures are the TASK-047 backend-lane cases
  above. No flake recurred.
- `npx vitest run` (final): 275 files, 6387 tests passed.
- `npx tsc --noEmit`: exit 0.
- `npm run build`: exit 0.
- `npm run lint:ds`: exit 0.
- `npx eslint` on every changed file: 0 errors. The 140 warnings are the existing fast-refresh
  family; `gallery-registry.tsx` gains one for the new specimen function, like every specimen.
- `node scripts/gallery-index.mjs --check`: 77 verified.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks <every task dir except TASK-039>`:
  REJECTED, and only for TASK-047 check-01 (rejected receipt; the two backend cases). Every other
  task has current passing receipts; accepted-gallery 1193 files verified; Foundation 0.14.3
  unchanged.
- Not edited: every `required-cases.json` except TASK-047's own; the five deferred B05 specs;
  `.github/**`; `src/test/design-0143-final-audit.test.ts`; any `.env` file. No hosted call was
  made.

## Open items (for the controller and owner)

- **Backend lane unrun here.** Cases 1 and 2 need `.env.runner.local` (PRE-001). The controller's
  run is their first execution. Their UI steps and request trails are the same code the synthetic
  cases ran green. Their backend-only parts were typechecked and linted, not executed:
  - the catalog reads (`default_equipment=eq.dumbbells` / `eq.bodyweight`);
  - onboarding, `persist_session` and `start_session`;
  - the service-role row reads;
  - `route.fetch()` and cleanup.
- **Drafts for the new fields are memory only.** This covers the notes for all four families, the
  AMRAP and EMOM effort and the EMOM loads, matching the existing EMOM note and For Time/ladder
  effort. They are kept through close, reopen, a refused save and its retry, and lost on a reload
  before the save. After a save and a reload, the saved block's log shows no note field (blank
  hidden), and the effort faces show unanswered. History is the readback. This is a UAT item:
  durable drafts would be a new storage field.
- **Notes-only save path.** A report with notes but no effort and no typed entry takes the bare
  insert (owner decision via TASK-015: "A save with no new per-movement data behaves exactly as
  today"). A notes edit made after a lost answer on such a save is absorbed by the 409 rule, as the
  EMOM note always was. With an effort or an entry present, the correction restates the notes
  (proved in case 2/4).
- **History detail (UAT).**
  - Timed movements still show "Not logged" and "No sets logged" beside their recorded actual
    (pre-existing set reading).
  - The categorical effort is the face alone with a spoken name, as set rows show it.
  - The label "Actual" is copy for TASK-037.
- **Housekeeping.**
  - The typed matrix (`refinement-logging-contract.ts`) still lists the timed fields under
    `proposed`, as TASK-015 left its landed fields; recorded in the spec's §14.
  - The registry's `TimedResultDialogEmom` note still says it "opens the end log's optional notes"
    (now also effort and loads); left unedited (hotspot, append-only).
- **Copy for TASK-037:** "Actual" in History. No other new copy: every label reuses an existing one.
- **Adaptive effort gap unchanged** (open owner item): the categorical effort is not fed into
  `conditioning.ts`.

## Next action

Controller verification (with `.env.runner.local`) and commit.
