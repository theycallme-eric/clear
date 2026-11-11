# TASK-038 — Retain coaching and empty-state content inventory (#665)

Body `clear-refinement-v2-20261109b`, attempt 1, base `a94ebc0` (after TASK-036 #714; `git fetch` and
rebase onto `origin/build/clear-refinement-2026-11-04` reported up to date, exit 0). This is the
task-owned progress note, the approved exception to the shared daily journal for this body. Only
TASK-038 writes this file.

## Intended outcome

REQ-038 (AC-R038-01, AC-R038-02; G21, R73; evidence EVID-C167F3DF2675, EVID-76CED19E0F10), role
independent. Produce the sourced definition record for the coaching and empty-state content
inventory:

- inventory missing coaching, blank user notes, loading and failure states;
- verify fixture/catalog identity before diagnosing catalog gaps;
- keep movement notes available independently of missing coaching;
- record the unresolved hide/replacement/content rule as one scoped owner decision, with no invented
  string and no hidden feature.

Nothing is implemented. No product copy, hide rule, route, gallery state, CSS, token, writer or
migration is added or changed.

## Changes

- `docs/definitions/clear-refinement-20261103/TASK-038.md`: the definition record, in TASK-039's
  format, with 29 sources (S01–S29). Each source is a verified `ref:accepted-gallery/` object, a
  `base:` blob at `03087f7` (for files unchanged since the base: exercise-queries, exercises client,
  view-state, catalog and workout migrations, seed and its README), or a `repo:` file (files this
  body created or changed). Sections:
  - Scope, Sources;
  - Current observations (O1–O5);
  - State inventory (I1–I14): written guidance, blank cues, blank regression, missing catalog entry,
    not yet read, loading, failure, blank user note, stored note, saving, saved, not saved,
    repetition, and History's session `No notes` as an adjacent, different field;
  - Fixture and catalog identity (F1–F7);
  - Catalog content findings (K1–K5);
  - Notes availability (N1–N3);
  - Options (H1–H4 empty-answer rules, Q1–Q2 regression reading, W1–W2 wider review scope, C1–C6
    constraints), none selected;
  - Open owner decisions (`G21-COACHING-EMPTY-RULE`, Owner: Eric);
  - Gallery disposition, Limitations, Traceability.
- `scripts/refinement/task-038-definition.test.mjs` (check-01, 8 node:test cases).
- `evidence/refinement/task-038/required-cases.json` (check-01, 8 declared cases, criteria
  AC-R038-01 and AC-R038-02); receipt `results/check-01.json` written by the guard.

## Findings recorded in the definition (sourced, not decided)

- **"No entry" cannot arise for a real persisted prescription.** `workout_exercises.exercise_id`
  references `exercise_definitions(id)`, and a catalog row cannot be removed from under it. Every
  authenticated user may read every catalog row, and no migration inserts catalog rows. So the
  owner's `The library has no entry…` answer shows up only in synthetic fixtures. On a real
  session, a failed read is the error state, not "no entry".
- **Fixture identity.** The gallery cards fixture, the register's states specimen and the shared
  TASK-005 test fixture use slugs that are mostly not catalog ids. `mountain-climber`, `kb-swing`,
  `burpee` and `push-up` exist in the catalog as `mountain-climbers`, `swing`, `burpees` and
  `push-ups`; `romanian-deadlift` exists as `rdl`. `wall-ball`, `chest-supported-row`,
  `dumbbell-bench-press` and the synthetic long names are not in the catalog. Where a fixture slug
  is a catalog id (`back-squat`, `plank`, `goblet-squat`), the fixture's answer is still synthetic
  and differs from the catalog row, which has written cues. The repeated "no entry" in the gallery
  (ten times in the ten-station circuit) is therefore a fixture artifact, not a catalog gap.
- **The real repeated empty answer is the regression.** Only 11 of the 140 seeded rows name a
  regression. Every other opened section says `No regression is written for this movement.` No
  seeded row has a blank cue list.
- **A regression shows as a catalog id.** The catalog stores a regression as another row's id, and
  the owner draws it as stored. A real section therefore reads, for example, `goblet-squat` under
  Regression. Every fixture writes prose instead. This is recorded as option Q1/Q2 in the owner
  decision and is not fixed here.
- **Notes stay independent.** In both the grouped section and the standalone panel, the note field
  is drawn unconditionally outside the `opened ? <Guidance/> : null` condition. TASK-005's case
  "keeps the note of a movement the library has no entry for, and saves it" and the standalone
  panel's equivalent case prove this behaviourally.
- **Movement notes are not read back on History.** History's `No notes` is the session note. This
  is recorded only as an observation; it is outside REQ-038.

## Shared owner dispositions

- `src/ui/refinements/workout-card.tsx`: read; unchanged. Its `coaching` slot already carries the
  actual `GroupExerciseCoaching` (TASK-005).
- `src/ui/refinements/movement.tsx`: read; unchanged. Grouped sections are labelled by name, not by
  `MovementIdentity`.
- `src/ui/refinements/tokens.css`: no variable. The coverage entry lists `semanticVariables: []`.
- Gallery `?state=cards`: unchanged. It already draws the actual owner through memory-only clients.
  No rule is selected, so there is nothing new to demonstrate. The original crosswalk says the
  inventory "is not proven by gallery examples". Changing the gallery fixtures would also break
  TASK-005's protected gallery assertions. The owner's 2026-11-10 superseded-UI decision does not
  cover that, because no approved requirement replaces that UI.
- REUSE.md / LOGGING-FIELDS.md: followed. The Movement note keeps "independent save/error
  ownership", and no field, reason or write was added.

## Failures and corrections

- First check run: 2 of 8 cases failed.
  - K5 named `wall-ball` but cited only S02/S15, neither of which contains it. Added the S17
    citation (the cards fixture).
  - The fixture slug regex matched `'kettlebell'` from `equipment:` on the
    `exercise_id: LONG_MOVEMENT_ID` line. The regex now accepts only a literal, or the ternary's
    first literal, directly after `exercise_id:`.
- Mutation checks, each reverted from a scratch copy (no `git stash`); `git status` confirmed the
  owner file was restored:
  - recording the gallery `plank` answer as `written`: the identity case fails;
  - adding an invented quoted string "Coaching coming soon" to H3: the identifier/quote case
    fails;
  - moving `ExerciseNotesField` inside the grouped section's guidance condition: the notes case
    fails (and the record's S09 hash fails);
  - making the missing-entry state return `null` (a shipped hide rule): the decision/no-hidden-
    feature case fails (and the S09 hash fails).

## Verification (this worktree, uncommitted candidate, 2026-11-11)

- `npm ci`: exit 0.
- `node scripts/refinement/run-required-check.mjs --task TASK-038 --check check-01 -- node --test scripts/refinement/task-038-definition.test.mjs`:
  PASSED. Native 8 total, 8 executed, 8 passed, 0 failed/skipped/todo.
- `node scripts/refinement/verify-definition-record.mjs --task TASK-038` with the five extra
  sections: PASSED.
- `npm run build`: exit 0.
- `npm run lint:ds`: exit 0.
- `npx eslint scripts/refinement/task-038-definition.test.mjs`: exit 0, no output.
- `npm test`: 270 files, 6368 tests passed.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-005,TASK-038`:
  PASSED. TASK-005 and TASK-038 each have current passing receipts.

## Earlier-task receipts

None refreshed and none needed. No file named in another task's `required-cases.json` was edited.
The only changed paths are this task's record, its check, its evidence folder and this note.

## Open assumptions / owner items

- **G21-COACHING-EMPTY-RULE (owner, Eric):**
  - the rule for empty guidance answers (H1 keep, H2 once per disclosure, H3 hide, H4 treat a
    missing entry as a fault);
  - how a regression reads (Q1 stored id, Q2 the catalog row's name);
  - whether the wider cross-platform empty-state review is opened as its own work (W1/W2).

  Any new words go through TASK-037's COPY-VOICE.
- The identity check runs against the seed and migrations the database is given. The hosted
  project's rows were not read (no credentials). The R73 screenshot's preview fixture is not in a
  verified source, so it was not identity-checked.
- The record pins several `repo:` sources (owner, gallery and fixture files, TASK-037 record). If
  TASK-044–046 edit them, this record's live re-run goes stale. Per the cross-task rule, closure
  verifies definition records by their receipts.
- Check-01 also requires TASK-005's check-01 receipt to be for the current
  `src/ui/group-exercise-coaching.test.tsx`. A later task that edits that file must refresh
  TASK-005's receipt (the existing cross-task rule).

## Next action

Controller verification and commit.
