# TASK-033 — Coordinate final CRT and Phosphor Echo composition (#660)

Body `clear-refinement-v2-20261109b`, attempt 1, base `b7e9cb8` (after TASK-024, #703). This is the
task-owned progress note, the approved exception to the shared daily journal for this body. Only
TASK-033 writes this file.

## Intended outcome

REQ-033 (AC-R033-01, AC-R033-02, AC-R033-03). I am the completion owner of JOURNEY-033 (`/workout`
and open logging dialogs).

1. Re-verify the current effects owner, API and moved paths, then adopt the selected preset through
   one shared kernel.
2. Compose the front glass, Echo and CRT layer with:
   - a readable modal foreground;
   - TASK-016's Balanced backdrop;
   - TASK-008's meaningful deadline warning.

   Enabled, off and reduced-motion behaviour, and native top-layer coverage, must be preserved.
3. Prove source equivalence and the composed viewport, skin and dialog behaviour in the actual app.

The deliverable is the sourced contract `docs/specs/EFFECTS_COMPOSITION_CONTRACT.md` plus real
proof. It claims no new feature.

## Reconciliation (recorded rather than asked)

- **Effects owner.** The current effects owner is in this repository. The effects body
  (`clear-effects-2026-10-30`, #612–#624/#627) moved #596's intake into:
  - `src/ui/phosphor-echo.tsx` (preset `phosphor-echo-preset.ts`);
  - `src/ui/crt-field/` (preset `config.ts`);
  - the policy `src/state/visual-effects.ts`;
  - the root host `RootLayout.tsx`.

  These and `foreground-echo.tsx` / `atmosphere.css` are byte-identical to the accepted reference
  eded158c… (`verifyReferences`: pinned from base `03087f7`; `SOURCE-MANIFEST.unchangedPresetOwners`
  names the two preset owners). No effects code is missing, and nothing needed importing.
  PRE-002 (`--mode references --reference phosphor-echo`) passed: 5 files.
- **Selected preset.** It can be identified, so there was no stop:
  - Echo: 0.21 / 1.8 / −7.12 / +6.75, from `docs/effects/echo-selection-20261103.json`.
  - CRT: `clr-crt-field/review-2026-11-03.1`, from `scanline-selection-20261103.json`.

  The accepted REUSE.md says "Presets remain single-owned and unchanged." #596's round-3 numbers
  (0.29 / 3.2 / −4.7 / +5.64) are historical.
- **Moved intake.** `docs/design/library/intake/phosphor-echo/` and
  `e2e/fixtures/effects-reference/round-3/` match the staged intake bytes. The intake README
  differs only by its status line and a removed private path.
- **One kernel.** None was copied. There is no second runtime owner. Nothing from the
  October 26 preview was imported beyond TASK-008's recovered warning values.
- **Gallery.** The accepted reference's `?state=urgency` opens the warning under
  `LoggingOverlay`. The repo's urgency state used an `AppDialog` with a visible "Close log" button
  (TASK-016's UAT note). That state now uses the shared `LoggingOverlay`, as the accepted reference
  does, so the final composition is visible there. This is gallery adoption of the real owner.
  Route adoption of the overlay is TASK-043–046.

## Findings in the browser (Chromium probes, then the spec)

- The front glass is promoted above each native dialog, including the Balanced `LoggingOverlay`,
  and stays one instance.
  - A modal makes the glass inert, so hit-testing cannot show its order. The spec measures paint
    instead: the same patch with the glass shown and hidden.
- The edge is portalled into the overlay. It covers the viewport, is topmost inside the dialog and
  stays in phase.
- The Echo rear of the overlay frame matches the frame box and the frame's role ink in all four
  skins.
- **Defect found and fixed.** Under reduced motion, either the app choice or the device setting,
  the dialog backdrop still faded for 200 ms.
  - Cause: 0.14.3's closure `.clr-dialog[open]::backdrop` (0,2,1) loses to its fade rule
    `.clr-dialog[open]:not(.clr-dialog--closing)::backdrop` (0,3,1). `a11y.css`'s end-state
    guarantee did not cover `::backdrop`.
  - Fix: `a11y.css` adds `*::backdrop` to both collapse lists. Foundation is untouched.
- The logging frame never gets 0.14.3's `> .clr-bleed` phosphor entry: its child is the Echo
  wrapper, inside the shell, with effects on or off. This is consistent, matches the accepted
  reference, and is recorded as a limit rather than changed.

## Changes

- New `docs/specs/EFFECTS_COMPOSITION_CONTRACT.md`: owners/API, layer order, policy matrix, proof,
  limits.
- `src/dev/gallery-refinement-timers.tsx`: the urgency demo's log is `LoggingOverlay` (not
  `AppDialog`). Its timer renders only while open. Docblocks updated.
- `src/styles/a11y.css`: `*::backdrop` in both reduced-motion collapse lists.
- `docs/effects/README.md`: a two-line pointer (overlay frame Echo; the contract).
- New `e2e/refinement/task-033.spec.ts` and `evidence/refinement/task-033/required-cases.json`
  (check-01, 8 cases).

Not touched:

- the effects owners, the presets, `presentation.css`, `tokens.css`, `gallery-registry.tsx`,
  `COMPONENTS.md` and `PROJECT_MAP.md` (no new boundary);
- `src/test/design-0143-final-audit.test.ts` and `.github/**`.

## Tests

`e2e/refinement/task-033.spec.ts`, mobile, 8 cases:

1. AC-R033-01 source equivalence and one kernel.
2. `/workout` at phone 390: log and native dialog, effects off and on, draft kept, nothing written,
   axe.
3. `?state=urgency` under the Balanced overlay: focus, Echo, glass, edge, effects off, Escape.
4. Reduced motion at phone 320, app choice then device: `ladder-long` and urgency.
5. Skins clear, signal, vapour and mono on `ladder-long`.

Tests-first and mutation check: with `a11y.css` and the gallery file restored to base, the
reduced-motion case failed (backdrop fade) and the urgency case failed (no `LoggingOverlay`). Both
files were restored and confirmed byte for byte with `cmp`.

## Failures and corrections during the work

- Importing `crt-field.tsx` into the spec pulled its CSS into Node. The spec now reads the
  animation ids as text and asserts them against the source.
- Playwright `animations: 'disabled'` cancels and restarts infinite animations, which broke the
  phase it was measuring (a timer's startTime became 4714). The probe now pauses running
  animations, takes both shots and restores each start time (`play()` for pending ones).
- Hiding the glass under reduced motion: `a11y.css` collapses transitions to 0.01 ms, which held
  the discrete `visibility` change. The probe now sets `transition: none !important` inline.
- axe schedules timers, so it hung while the Playwright clock was paused. The scans now run while
  the clock runs.
- The foreground check flagged Foundation's held identity filter `brightness(1) saturate(1)` after
  the `AppDialog` entry. Identity filters are now accepted, and the check polls until the entry
  settles.
- Ink was parsed from text and lost precision. It is now resolved by the browser through a canvas.

## Verification (this worktree, uncommitted candidate, 2026-11-10)

- `npm ci`: exit 0.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode references --reference phosphor-echo`:
  PASSED (5 files).
- `node …/v2.mjs with-lock -- node scripts/refinement/run-required-check.mjs --task TASK-033 --check check-01 -- npx playwright test e2e/refinement/task-033.spec.ts --project=mobile`:
  PASSED, native 8 total, 8 executed, 8 passed, 0 failed or skipped.
  - Measured glass mean channel change over foreground text: 3.5 (log), 3.7 (native dialog), 4.7
    (overlay frame) and 5.0–5.4 (`ladder-long` header, four skins), out of 255.
- Earlier guards re-run because their targets render the urgency gallery state I changed. All
  passed, and their receipts are byte-identical:
  - TASK-008 check-01: 13/13.
  - TASK-008 check-02, under lock: 5/5.
  - TASK-007 check-02, under lock: 7/7.
- `npm run build`: exit 0. `npm run lint:ds`: exit 0. `npx eslint` on the spec and the gallery file:
  clean.
- `npm test`: 269 files, 6323 tests passed.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,…,TASK-024,TASK-030,TASK-031,TASK-032,TASK-033,TASK-034`:
  PASSED, every task "current passing receipts".

## Sweep

- **Effects consumers.** Effects-body specs (`e2e/effects/*`) and `scanline-replacement`,
  `visual-effects-journey` and `atmosphere` tests are untouched. Their owners are unchanged.
  - `e2e/effects/crt-composition-fidelity.spec.ts` still records the knownDiscrepancy "the field
    reads through their backdrop rather than over their content". The front-glass correction
    (ced9357) superseded that before this task, and this task did not change it. Left for the
    effects index owner.
- **Dialog specs.**
  - TASK-016/018's `logging-overlay.test.tsx`: the overlay is untouched.
  - TASK-008 gallery cases: re-run and passed.
  - `app-motion.test.ts` (AppDialog cut-in backdrop): passes in `npm test`.
  - The `a11y.css` change only adds `::backdrop` to the collapse. `reduced-motion.test.ts` passes.
- **Backend-lane specs** (`e2e/design-0143/*`, task-040, core-loop, B05): none read the urgency
  demo, the backdrop animation or the effects owners. Not superseded, not edited.

## Open assumptions / items for later tasks

- TASK-043–046: when route logs adopt `LoggingOverlay`, they inherit this composition. The route
  case here covers the set-logging sheet plus native dialogs only. TASK-041 owns the cross-route
  sweep.
- UAT:
  - The glass's perimeter softness reaches the top of a full-height dialog's header on a phone.
    This is the accepted front glass; changing it is a `config.ts` preset decision.
  - Two corner vignettes (Balanced and glass) show outside the dialog.
  - Safari/iOS top-layer `backdrop-filter` was not observed. WebKit is not installed.

## Next action

Controller verification (`npm ci`, check-01, build, lint:ds, test), then the final evidence
verifier.
