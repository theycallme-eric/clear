# TASK-020 — Deliberate Save confirmation and existing rest lifecycle (#647)

Body `clear-refinement-v2-20261109b`, attempt 1, base `51028bf` (after TASK-017 #704). This is the
task-owned progress note, the approved exception to the shared daily journal for this body. Only
TASK-020 writes this file.

## Intended outcome

REQ-020 (C46, G12; R07, R17; AC-C46-01, AC-R020-01, AC-R020-02). Role: **completion owner** of
JOURNEY-020 on the real `/workout` route. A deliberate Save of a set (`ExerciseSetLogger`) or a
superset round (`SupersetRound` / `SupersetRoundSheet`) shows a saved confirmation beside the
existing rest instead of the next entry's form. The rest ending collapses and resets it. A manual
early collapse is never undone. Only a deliberate Rest opens the next entry. Rest expiry and its
warning never record a set.

## Status

Candidate complete. Both delivery checks pass through the guard, and the final evidence verifier
passes. Awaiting controller verification and commit.

## Behaviour before this task (base `51028bf`)

- After an accepted Log set N, the sheet stayed open and its draft key moved to N + 1, so set N + 1's
  form replaced the entry at once. That is the jump R07 rejects. Superset rounds did the same.
- The rest was already the session's one rest (`RestTimerProvider`, `RestTimerBar` in the sheet and
  in the footer when collapsed). Save never started or restarted it. Nothing collapsed the sheet
  when the rest ended.

## Changes

- New `src/ui/set-save-confirmation.ts`: `useSaveConfirmation`, the lifecycle owner, plus a
  `focusIsInSetSheet` helper.
  - It is derived, with no timer, write or storage of its own.
  - It records the saved entry and the identity (prescription id and start) of the rest running at
    Save.
  - The confirmation ends when that rest runs out, is skipped or is replaced. The sheet collapses
    once, on that transition, only if the sheet is open, holds the confirmation and is not in a
    correction. Focus returns to the entry action only if it was in the sheet.
  - `reset()` runs on Minimize and on a deliberate Rest.
  - A confirmation saved with no rest running stays until the athlete collapses it.
  - A confirmation shows only while the shell's set list holds the entry. A Save the shell refuses
    keeps its form.
- `src/ui/set-logging-sheet.tsx`: new optional `confirmation` prop (`SetSheetConfirmation`). With it,
  the sheet is titled `Set N logged` / `Round N logged`, keeps its context, rest and Minimize in
  place, and draws the read-back in a `role="status"` region where the form was. It draws no form.
  The title takes focus when the confirmation appears.
- `src/ui/set-logger.tsx`:
  - `ExerciseSetLogger` confirms after `logSet` and resets on Rest and on Minimize.
  - New `SavedSetLine` uses the card row's own formatter, effort reading and sync badge, so a queued
    or refused set reads "Saving" / "On this device only", never "Saved" (EXE-07).
  - `SupersetRoundSheet` takes `confirmed` / `onSaved` and confirms each logged movement under its
    own name. An unticked movement is not mentioned.
- `src/ui/superset-block.tsx`: the block owns the round's confirmation through the same hook.
- Not changed: rest provider, `RestTimerBar`, writers, drafts, correction/clear, effort, CSS and
  tokens. No route CSS was added.

## Shared-owner and gallery dispositions

- **LoggingOverlay** (`src/ui/refinements/logging-overlay.tsx`): read, not adopted. Moving the
  ordinary set-logging sheet into the focused dialog is TASK-043/044's migration, and this brief
  does not require it. The confirmation is a mode of the existing `SetLoggingSheet`, so the
  migration carries it over unchanged.
- **TimedResultLog**: not applicable. Timed families have no per-set Save/rest sequence. Their
  logging moves with TASK-046.
- **`src/dev/gallery-refinement-forms.tsx`**: read, not changed. In the reference, `anchor` and
  `superset` are synthetic `GalleryLoggingMoment`s whose saved state is a bare "Recorded".
- **Gallery states** `?state=anchor` and `?state=superset` (reference `eded158c…`) do not exist in
  this build. TASK-017 recorded the same: they arrive with their route consumers (TASK-043/044).
  - Per `templates/gallery-authority.md`, this task records a deferred disposition rather than
    adding a gallery-only form. Proof is on the real route only.
  - `SetLoggingSheet` stays a register-exempt structural entry, so `COMPONENTS.md` and
    `gallery-registry.tsx` are unchanged.
- **REUSE.md / LOGGING-FIELDS.md**: no field, writer or meaning added or moved. The read-back reuses
  the existing row formatter and sync status. The accepted reference's "Recorded" copy is not used.
  The confirmation says `Set N logged` with the actual saved values, which a confirmation of
  individual actuals needs (R07).

## Tests

- check-01 (`src/ui/set-logging-sheet.test.tsx`, describe "TASK-020 deliberate Save confirmation and
  existing rest lifecycle", 5 cases, injected wall clock; harness now also draws the footer rest the
  way `Workout.tsx` does):
  - AC-C46-01: confirmation, same rest, no form, collapse and focus at rest end, no reopen, Rest
    opens set 2 with its carried weight.
  - AC-R020-01: early Minimize kept through rest end; reopening during the rest gives the next entry
    on the same rest.
  - AC-R020-02:
    - Add 30s keeps the confirmation; the final-seconds warning records nothing; Skip rest ends it.
    - A draft is not closed by expiry.
    - A no-rest save is confirmed until Minimize.
    - A superset round is confirmed per movement, collapses at rest end, and an unticked movement is
      not mentioned.
    - A refused save (profile unread) keeps its form, and expiry neither collapses nor records it.
  - Mutation checks (each restored):
    - Removing the rest-end collapse made 3 cases fail.
    - Removing the reset on Minimize and Rest made the early-collapse case fail.
- check-02 (`e2e/refinement/task-020.spec.ts`, mobile, contained synthetic lane, Playwright clock):
  - JOURNEY-020 at phone-320 and phone-390: set, then superset round, with axe after each
    confirmation and collapse. Captures: `confirmation-set-1-*`, `collapsed-at-rest-end-*`,
    `early-collapse-*`, `confirmation-round-1-*`.
  - AC-R020-02 at phone-390 with keyboard and reduced motion:
    - A refused write shows "On this device only", then retries under the same id to "Saved".
    - Add 30s, the "Final 10 seconds" warning and Skip rest record nothing; focus returns to Rest.
    - A draft survives expiry, and a no-rest save is confirmed until Minimize.
- Superseded expectations updated, each citing TASK-020 / C46. The old expectation was set N + 1's
  form straight after Save; it is now the confirmation, then a deliberate Rest:
  - `set-logging-sheet.test.tsx` (4 cases);
  - `src/app/sheet-minimize-access.test.tsx`, `rest-footer-lifecycle.test.tsx`,
    `superset-logging.test.tsx`, `Workout.test.tsx`, `movement-countdown.test.tsx`;
  - `src/ui/set-effort.test.tsx` (helper), `superset-block.test.tsx`, `circuit-block.test.tsx`,
    `block-panel.test.tsx` (TASK-003's check-01 target; its exact guard was re-run).

## Sweep (consumers locating Save / rest)

- Edited, because superseded (they cannot run locally):
  - `e2e/ui-polish-b05-rest-log.spec.ts`: after Log set 1, Set 1's confirmation; round 2 opened by
    the pair's Rest; `captureSheet` falls back to the confirmation when no form is drawn. It still
    needs the out-of-repo B05 `.evidence` reference, which is pre-existing.
  - `e2e/ui-polish-integrated.spec.ts`: after Skip rest, set 2 opened by Rest with its new rest
    skipped; round 1 confirmed instead of round 2's form. That spec's other failures are
    pre-existing.
- Checked, not superseded:
  - These use "Minimize if a sheet is open" or reopen through Rest: `ui-polish-b05-sheet-surface`,
    `ui-polish-b05-active-hierarchy`, `ui-polish-b05-movement-countdown`,
    `e2e/design-0143/workout-circuit.spec.ts`.
  - `e2e/design-0143/workout-lifecycle.spec.ts`, `task-040-lifecycle(-gaps).spec.ts`,
    `optional-feedback.spec.ts`, `core-loop.spec.ts` (backend lane). They expect a set form on the
    card without Rest, which has been stale since REQ-012 and is outside this task. Left unedited.
    If they are revived, "Set 1 · …" text now also appears once in the sheet's confirmation.

## Failures and corrections

- First browser run: Next section's own `block_results` write had no synthetic disposition, so a
  "That didn't save" dialog appeared. Fixed by answering `block_results` the way the B05 harness
  does, and recording that leaving the section writes no set.
- Keyboard Add 30s was read before it applied. The spec now polls for the extension before
  comparing.
- One lock timeout (another worktree held the dev-server lock). It was an environment wait; the run
  was retried with no code change.

## Verification (this candidate)

- `node scripts/refinement/run-required-check.mjs --task TASK-020 --check check-01 -- npx vitest run src/ui/set-logging-sheet.test.tsx --testNamePattern "rest|save|collapse" --passWithNoTests=false`:
  PASSED (17 executed, 5 required passed, 19 skipped by the pattern).
- `node …/v2.mjs with-lock -- node scripts/refinement/run-required-check.mjs --task TASK-020 --check check-02 -- npx playwright test e2e/refinement/task-020.spec.ts --project=mobile`:
  PASSED (3/3).
- TASK-003 check-01 re-run with its exact command (its target `block-panel.test.tsx` was edited):
  PASSED (12/12).
- `npx vitest run` (whole suite): 269 files, 6335 tests passed.
- `npm run build`: passed. `npm run lint:ds`: clean.
- `npx eslint` on every changed TS/TSX file: 0 errors. The 2 existing fast-refresh warnings in
  `set-logger.tsx` remain.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,…,TASK-034`
  (the brief's list): PASSED, every receipt current.

## Open assumptions (UAT)

- With no rest running at Save (none prescribed, or already over), the confirmation stays until
  Minimize. R07 only defines the end at rest completion, and nothing auto-opens the next form.
- Rest expiry never collapses an unsaved draft, or a correction left open over it.
- After Skip rest following Log set N, logging set N + 1 needs a Rest tap, which starts that set's
  prescribed rest. That is REQ-012's existing entry, now the only way in.
- The circuit movement's optional set entry shares `ExerciseSetLogger`, so it also confirms instead
  of opening set N + 1. That is consistent with "never auto-open the next form" (G12 logging
  consistency).
- Copy `Set N logged` / `Round N logged` goes to TASK-037. Check the confirmation on a phone at 320
  with a long superset round.

## Next action

Controller verification and commit.
