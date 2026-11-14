# TASK-044 — Adopt shared logging for supersets and circuits (#670)

Body `clear-refinement-v2-20261109b`, attempt 1. This is the task-owned progress note, the approved
exception to the shared daily journal for this body. Only TASK-044 writes this file.

## Status

Implementation complete, awaiting controller verification and commit. Base `04cba36` (after
TASK-021 #717): `git fetch origin && git rebase origin/build/clear-refinement-2026-11-04` exited 0
("up to date").

## Intended outcome

REQ-019 / C45 for this family only (TASK-AC-A6979DFEDE2D, TASK-AC-FCC746654DD9,
TASK-AC-3830472CD65C). Role: foundation provider contributing to JOURNEY-019. The family's real
entry points on `/workout` use the shared `LoggingOverlay` with its framed "Close log" X:

- superset round: the block's Rest opens `Log round N` (`SupersetBlock` → `SupersetRoundSheet`);
- the superset movements' saved-set corrections (`ExerciseSetLogger` Edit inside a superset);
- circuit round / Undo: `Round N recorded` with Take back this round — already moved into the
  dialog by TASK-021 (#717); here it is only re-proved as part of this family;
- circuit movement entry: a movement's Rest opens `Log set N` (`CircuitBlock` →
  `ExerciseSetLogger`).

Fields, Performed identity, drafts, writers, Save confirmation, errors/retry, correction/clear and
the one rest are unchanged.

## Sources read

Brief; RUNNING-SUMMARY; TASK-043 and TASK-021 notes; REUSE.md and LOGGING-FIELDS.md ("Superset
round", "Circuit round / take back", "Circuit movement entry"); the reference
`gallery-refinement-forms.tsx` (`superset`: A1 One arm row / A2 Bicep curl, Performed per movement,
title `Log round 1`; `circuit-movement`: `Log set 1`).

## Changes (product)

- `src/ui/superset-block.tsx`: the round's placement is `focused`; the round is drawn in
  `LoggingOverlay` (portalled to the body under the shell's host), titled by `setSheetTitle`
  (`Log round N`, then `Round N logged` while the TASK-020 confirmation holds), `onClose` = the same
  `collapse()` Minimize used. The form is drawn only while open; the draft stays in the block's
  `entry` state. Focus return to Rest after a collapse or the rest ending waits for the commit that
  closes the modal (the workout is inert while it is open), as TASK-043 did for sets. Each
  movement's `ExerciseSetLogger` gets `focused`, so its saved-set Edit/correction/Clear set opens
  in the same dialog (the logger's own TASK-043 path; no new code).
- `src/ui/circuit-block.tsx`: the circuit movement's `ExerciseSetLogger` gets `focused` (the row's
  one tap opens `Log set N` in the dialog; X/Cancel leave it unlogged). Round clock, rest,
  `Round N recorded` and Take back are unchanged (TASK-021).
- `src/ui/set-logger.tsx`, `src/ui/set-logging-sheet.tsx`: doc comments only (TASK-044 adoption).
- Gallery: new `src/dev/gallery-refinement-group-logging.tsx` (`GallerySupersetRound`: the route's
  `SupersetBlock`, A1 one arm row / A2 bicep curl, 3 × 8–12, 60 s after both, `corrections`;
  `GalleryCircuitMovement`: the route's `CircuitBlock` over V13's circuit) over the shell's
  `SetLoggingProvider`, `RestTimerProvider` and host, with the in-memory set-observation client.
  Two states appended to `src/dev/gallery-refinements.tsx` (append-only: one doc paragraph, one
  import, two list rows): `superset`, `circuit-movement`. `circuit-round` stays TASK-021's.
  Reuse by export (one keyword each, plus a comment): `GalleryFooterRest` in TASK-043's
  `gallery-refinement-set-logging.tsx`; `CIRCUIT` and `memoryStorage` in TASK-021's
  `gallery-refinement-circuit.tsx`.
- Shared owners: `logging-overlay.tsx` adopted unchanged; `timed-result-log.tsx` not applicable
  (no timed result in this family); `gallery-refinement-forms.tsx` read, not changed. No CSS, no
  tokens, no hotspot CSS touched. `docs/specs/LOGGING_FIELD_CONTRACT.md` (TASK-030's) not edited.

## Tests added

- `e2e/refinement/task-044.spec.ts` and `evidence/refinement/task-044/required-cases.json`
  (check-01, 7 required cases):
  1. superset round, 390 touch: Rest → `Log round 1` modal over an inert workout, framed X focused,
     block rest in the log, two complete movement groups (Performed, Weight/Unit/Reps or Reps
     only, Effort), no helper paragraph or Notes, Log round disabled until a movement is
     identified; X and Escape keep each draft and Performed; Log round writes only the Performed
     movement (`insert`, set 1) — the unticked partner is never written; `Round 1 logged` read-back
     beside the same rest; rest end closes and focuses Rest; round 2 logs only the explicitly ticked
     partner at set 2.
  2. superset correction and retry, 390 keyboard, reduced motion: refused round write held "On
     this device only", retried under the same id on `online`; movement `Edit set 1` opens in the
     log; close keeps the correction and returns focus to Edit; Cancel writes nothing; Save
     correction writes `correct` on the same observation; Clear set confirmation with Keep set
     first; clear writes `clear` and focus falls back to the block's Rest.
  3. circuit round/Undo and movement entry, 320 touch: Finish round → `Round 1 recorded` modal with
     the circuit rest drawn once; Take back this round → no rounds; re-finish; close; movement Rest
     → `Log set 1` modal (Weight/Unit/Reps/Effort, no Performed, no session rest, still one
     countdown on the page); X/Escape keep the draft; Log set writes `insert` and records no round;
     Edit → Save correction writes `correct`; Hide load entry → "1 set logged".
  4–7. gallery `superset`, `circuit-round`, `circuit-movement` in clear, vapour, signal, mono at 390
     (modal, X, fields, axe, in-memory save confirmed for `superset`, no network).
- Owned unit-test migrations (this family's own, not other tasks' check targets):
  `src/ui/superset-block.test.tsx` (4 × `region` → `dialog` for `Round N logged`),
  `src/app/superset-logging.test.tsx` (3 × `region` → `dialog`; 3 × `Minimize` → `Close log`, one
  via `form.closest('dialog')`), `src/app/circuit-rounds.test.tsx` (`.clr-set-sheet` →
  `dialog.clr-accepted-log`, `Minimize` → `Close log`; case name kept),
  `src/app/movement-countdown-circuit.test.tsx` (2 × `Minimize` → `Close log`).

## Earlier tasks' checks changed (owner decision 2026-11-10), line by line

Owner decision (Eric, 2026-11-10, relayed): "May tasks update earlier tests when their approved
requirement replaces that UI?" — "Yes, go ahead". Case names kept; no `required-cases.json` edited;
each owner's exact guard re-run. Line numbers are in the edited files.

- **TASK-003 check-01, `src/ui/block-panel.test.tsx` AC-C10-01:** l.313 `findByRole('region',
  'Set 1 logged')` → `'dialog'`; l.319–321 added: close the log with `Close log` before the card's
  "Hide load entry for kb swing" (the card is inert behind the modal). Meaning kept: the actual
  weight goes through the circuit's optional logger and the prescribed load stays 24 kg.
- **TASK-003 check-02, `e2e/refinement/task-003.spec.ts`:** l.550–551 `Minimize` → `Close log`
  (circuit "Rest for kb swing" entry), with a comment. Meaning kept: the entry closes with nothing
  logged.
- **TASK-020 check-01, `src/ui/set-logging-sheet.test.tsx` AC-R020-02 superset case:** l.982
  `region 'Round 1 logged'` → `dialog`; l.1005 `region 'Round 2 logged'` → `dialog`. Everything
  else (read-back, rest, collapse at rest end, focus on Rest) unchanged. Guard still executes 17.
- **TASK-020 check-02, `e2e/refinement/task-020.spec.ts` superset round:** l.464–465 the round's
  confirmation surface `sheet(page)` → `logDialog(page)`; l.471 rest read from `logDialog`; l.481
  `attachSheet` given `logDialog(page)`; l.484, l.487 `sheet(page)` → `logDialog(page)` for
  `toHaveCount(0)`; l.491 `Minimize` → `Close log`.
- **TASK-021 check-01, `src/ui/circuit-block.test.tsx`, "optional, compact load entry":**
  - "writes the set against its movement and block…": l.745 `region 'Set 1 logged'` → `dialog`;
    l.755–757 `Close log` added before "Hide load entry for back squat".
  - "holds only the saving movement's action busy…": l.774 `region` → `dialog`; l.779–790
    reordered for the modal: after asserting set 2's action busy, the log is closed with its X,
    the romanian deadlift's entry opened (Log set 1 enabled) and closed, Start round 1 asserted
    enabled, then the back squat's entry reopened and its still-disabled Log set 2 pressed
    (attempts stay 1). More than a pure locator change; the assertions are the same ones.
- **TASK-021 check-02, `e2e/refinement/task-021.spec.ts`:** l.595–596 the circuit movement entry
  surface `section.clr-set-sheet` → `dialog.clr-accepted-log[open]` (comment added); l.606
  `Minimize` → `Close log`.
- **TASK-043 check-01, `e2e/refinement/task-043.spec.ts`, case "…other lift, timed and distance
  movement phone-320 … while a superset round stays on its half-sheet (TASK-044)" (name kept):**
  l.625–639 the superset part now asserts the round opens in the focused log
  (`expectFocusedLog(page, 'Log round 1')`) and closes with `Close log`, still writing nothing.
  The old meaning (TASK-043 did not claim this family) no longer applies because TASK-044 delivers
  it; the case name now reads stale — flagged for the controller.

## Sweep (non-protected, cannot run locally)

- Edited (superseded flows): `e2e/design-0143/workout-circuit.spec.ts` (backend lane): the
  movement entry surface `[data-set-sheet-slot]` → `dialog.clr-accepted-log[open]` (×3),
  `Minimize` → `Close log` (×3), `expectFooterPair`'s covered check accepts the open log
  (`section.clr-set-sheet, dialog.clr-accepted-log`); `e2e/ui-polish-integrated.spec.ts`
  (`Round 1 logged` region → dialog; two `Minimize` → `Close log`); `e2e/ui-polish-b05-rest-log.spec.ts`
  (`collapseSheet` before the block's Rest once round 1 is confirmed, since the card is inert).
  Not run (backend lane / out-of-repo B05 `.evidence`).
- Already family-agnostic since TASK-043, unedited: `ui-polish-b05-active-hierarchy`,
  `-movement-countdown`.
- Not edited (owner decision 2026-11-11): the five deferred B05 half-sheet specs.

## Failures and corrections

- First full vitest run after the product change: 17 failures in 7 files, all superseded locators
  (`region` → `dialog`, `Minimize` → `Close log`, `.clr-set-sheet`). Fixed as listed above.
- The spec's first draft had a vacuous "framed X" check (`className.includes('clr-')`); replaced
  with the TASK-016 framing facts (chamfer, `clr-btn`, `clr-hit`, not quiet, inside a bleed, glyph).

## Verification

All on base `04cba36`. Every Playwright command ran under
`node /Users/eric/Projects/support-tooling/agent-runner-v2/bin/v2.mjs with-lock --`.

- `node scripts/refinement/run-required-check.mjs --task TASK-044 --check check-01 -- npx playwright test e2e/refinement/task-044.spec.ts --project=mobile`:
  PASSED, 7 total / 7 executed / 7 passed / 0 skipped.
- Earlier owners' exact guards (targets edited): TASK-003 check-01 PASSED 12/12; TASK-003 check-02
  PASSED 5/5; TASK-020 check-01 PASSED (36 total, 17 executed, 17 passed, 19 skipped by pattern);
  TASK-020 check-02 PASSED 3/3; TASK-021 check-01 PASSED 39/39; TASK-021 check-02 PASSED 6/6;
  TASK-043 check-01 PASSED 7/7. Receipts refreshed.
- `npx vitest run`: 270 files, 6375 tests passed.
- `npm run build`: passed. `npm run lint:ds`: clean.
- `npx eslint` on every changed `.ts`/`.tsx`: 0 errors, 5 warnings (`react-refresh/only-export-components`):
  2 new in `gallery-refinement-circuit.tsx` (the exported `CIRCUIT` and `memoryStorage`), 3
  pre-existing.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks <every task dir except TASK-039>`:
  PASSED, every receipt current.
- Full refinement sweep, `npx playwright test e2e/refinement/ --project=mobile --workers=1` (161
  tests, 19.7 min): 158 passed, 3 failed. Per spec: task-001 9/9, 002 7/7, 003 5/5, 004 5/5,
  005 5/5, 006 7/7, 007 7/7, 008 5/5, **009 0/3**, 010 3/3, 011 3/3, 012 5/5, 013 5/5, 014 5/5,
  015 3/3, 020 3/3, 021 6/6, 022 4/4, 023 5/5, 024 6/6, 025 5/5, 026 5/5, 027 4/4, 028 11/11,
  029 13/13, 033 8/8, 043 7/7, 044 7/7. The three task-009 failures (l.472, l.571, l.647) are the
  known pre-existing "one result group" cases (Expected length 1, received 2: TASK-015's movement
  group), owned by TASK-046; not touched here.

## Open items

- Contrast in the four skins rests on axe (`checkA11y`) only; no direct per-element contrast
  measurement was added (cross-task rule; TASK-041).
- TASK-043's case name "…while a superset round stays on its half-sheet (TASK-044)" is now stale
  wording over an updated assertion (names may not change).
- Stale doc comments in other tasks' tests left as they were (TASK-020 spec `expectConfirmation`
  says a round reads from the half-sheet; `openSheets()` in `set-logging-sheet.test.tsx` mentions
  a superset region) — wording only.
- UAT: a superset round is now a modal; to open round N + 1 during the confirmation the athlete
  closes the log first (the card is inert), then taps Rest.
- UAT: after a superset correction's Cancel/Save the log closes (the logger has no new-set entry of
  its own), unlike a standard set whose log moves on to `Log set N + 1`. Existing behaviour.
- Cross-route geometry (TASK-041) and cross-family closure (TASK-019) not claimed.

## Next action

Controller verification and commit.
