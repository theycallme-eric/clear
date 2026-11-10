# TASK-016 — Selected focused dialog appearance and accessible header (#643)

Body `clear-refinement-v2-20261109b`, attempt 1, base `c0c21c2` (after TASK-018 #701). This is the
task-owned progress note, the approved exception to the shared daily journal for this body. Only
TASK-016 writes this file.

## Intended outcome

REQ-016 (AC-C40-01, AC-C41-01, AC-C43-01, AC-R016-01–03; TASK-AC-F1CC1A37FB0E,
TASK-AC-73CE385048B8, TASK-AC-C0A657D4BABE). Role: **foundation provider** contributing to
JOURNEY-016; no completion ownership. Deliver the shared selected dialog on TASK-018's
`LoggingOverlay`, with focused representative-consumer tests at the shared-component boundary:

- the selected simple form in a focused dialog, the dialog's title the form's one title (C40);
- a header of the title then the framed icon-only X, named, with no visible Close word, its frame
  on the visible title top for one-line and wrapped titles, Workout feedback included (C41;
  R104, R105, R106, R113);
- the selected A / Balanced backdrop, foreground sharp, nothing darker, no rising sheet (C43;
  R110, R127);
- background workout controls unavailable while the modal is open while clocks/rest continue;
  close/reopen keeps drafts; keyboard dismissal and focus return (R100).

Not claimed: no logging route adopts the dialog here. TASK-043–046 migrate the consumers; TASK-041
owns full-route visual/geometry acceptance and JOURNEY-016/017/018 closure; TASK-017 owns the
group/label rhythm.

## Decisions (from the sources; recorded rather than asked)

- **Backdrop values.** The accepted reference (`eded158c…`, `tokens.css` / `presentation.css`) and
  the R7 replay's `backdrop=balanced` (`.clr-logging-overlay[data-backdrop]::backdrop`) declare the
  same A / Balanced treatment: radial vignette `transparent 35%` → ground colour at 85%, over a 55%
  dim of the ground colour, `blur(var(--spacing-100))` (4 px). Kept exactly as three variables in
  `tokens.css` (`--logging-backdrop-blur/-tint/-edge-tint`). Drawn on `::backdrop` only, via
  `.clr-dialog.clr-accepted-log::backdrop` (0,2,1 over Foundation's 0,1,1, so it wins regardless of
  stylesheet order). It sets only the paint (`background`, `backdrop-filter` + `-webkit-` for older
  iOS), so Foundation's backdrop fade and reduced-motion closure (animation only) still apply.
- **Top alignment (R105).** Header `align-items: flex-start` (kept from the reference) plus the
  title's `line-height: 1` and `text-box: trim-start cap alphabetic`, so the title's box top is the
  capitals' top (the title is uppercase). Chromium measurement (scratch probe, below): with the trim
  the title's ink top equals the X frame's top (0 px) at 320/390/1280, one line or wrapped; without
  it the letters sit 4 px below the frame. Browsers without `text-box` (Firefox today) keep the
  tight line box, i.e. that ~4 px residual; recorded for TASK-041.
- **One title (C40, R90 A, R91).** New `LoggingOverlayTitleContext`
  (`src/ui/refinements/logging-overlay-context.ts`). The overlay provides its title id to its body;
  `TimedResultLog` reads it and, inside the dialog, drops its own "Log results" heading and is named
  by the dialog title (`aria-labelledby`, so it becomes the dialog's one named form). Inline (no
  context) it is unchanged: own title, unnamed form. This removes the duplicate title TASK-018
  noted and is the reusable contract TASK-043–046 adopt (any form can read the same hook).
- **Close and focus return (R100, R104).** The X stays the shared secondary `IconButton` (chamfered,
  bleeding `--border-cta-primary`, `clr-hit`), label "Close log", icon only. Escape is the native
  `cancel`, prevented and routed to the consumer's `onClose` (one call); a browser-initiated close
  is reported once through `close`. New: the overlay records the opener (the focused control, not
  `body`, not inside the dialog) at `showModal()` and, after any close, returns focus to it if focus
  is stranded (in the dialog or on `body`) and the opener is still connected. Chromium already
  restores natively (the guard leaves it alone); jsdom does not, so the behaviour is now owned and
  testable rather than "relies on native dialog behaviour" (TASK-018 UAT note).
- **Drafts and clocks.** The overlay never unmounts its children on close and owns no clock, so a
  consumer's draft and any clock (behind or inside) continue. Proved with the actual
  `MovementCountdown` behind the modal and another inside it.
- **Inert background.** Native: `showModal()` (never `show()`). jsdom's dialog shim does not model
  inertness, so it is asserted by construction in jsdom and measured in Chromium (below).
- **Gallery.** `?state=anchor` and `?state=superset` do not exist at this base: they arrive with
  their route consumers (TASK-043, TASK-044); `?state=ladder` still logs inline until TASK-046. The
  existing provider state `?state=ladder-long` now shows the selected header/backdrop/one title. One
  register specimen added to the `LoggingOverlay` entry: "wrapped title · Workout feedback" — the
  owner's R106 example, the shared `FeelingRow` and notes field held in memory, no writer (the
  Summary debrief adopts the dialog with TASK-045). No route CSS duplicated; no synthetic writer.

## Changes

- `src/ui/refinements/logging-overlay.tsx`: TASK-016 contract docblock; opener capture and focus
  return; `data-logging-head`; title class `clr-accepted-log__title`; provides
  `LoggingOverlayTitleContext`.
- New `src/ui/refinements/logging-overlay-context.ts` (`LoggingOverlayTitleContext`,
  `useLoggingOverlayTitle`).
- `src/ui/refinements/timed-result-log.tsx`: inside the dialog, no own title and named by it.
- `src/ui/refinements/presentation.css`: Balanced `::backdrop` rule; header/title recipe
  (`.clr-accepted-log__head h2` → `.clr-accepted-log__title`, adds `text-box`).
- `src/ui/refinements/tokens.css`: three `--logging-backdrop-*` variables.
- Gallery: `LoggingOverlayWorkoutFeedback` specimen (`gallery-refinement-forms.tsx`), registry entry
  summary + specimen (`gallery-registry.tsx`), docblocks (`gallery-refinements.tsx`);
  `docs/design/library/COMPONENTS.md` regenerated (`node scripts/gallery-index.mjs`).
- `src/ui/logging-overlay.test.tsx`: new describe "TASK-016 LoggingOverlay — selected dialog,
  header, backdrop and close" (8 cases) and a header note; TASK-018's cases untouched.
- New `evidence/refinement/task-016/required-cases.json` (8 required cases).

## Sweep

- `LoggingOverlay` / `.clr-accepted-log` consumers: only the gallery (ladder-long, register
  specimens) and the shared test file. No route, no e2e spec, no backend-lane spec
  (`e2e/design-0143/*`, workout-lifecycle, task-040, core-loop, B05) references them — none superseded.
- `TimedResultLog` change applies only inside the dialog; route logs are inline, so the e2e
  locators that find the log by its "Log results" heading (`task-009/010/011/015.spec.ts`,
  `design-0143/workout-emom.spec.ts`) are unaffected. TASK-046 must update them when it moves the
  timed logs into the dialog (the form is then found by its dialog name).
- Close-word locators in specs (`name: 'Close'` in task-003/014/023, design-0143 lifecycle/circuit/
  task-040): all are blocking error/confirmation dialogs ("That didn’t save", "Couldn’t start this
  workout"), not logging headers; R104 explicitly excludes them. Unchanged.
- Current logging consumers still outside the dialog (dispositions, not edited here):
  `SetLoggingSheet` (rising sheet, Minimize chevron; anchor/other lift/timed/distance/extra/correction)
  → TASK-043; superset round in `set-logger.tsx` and circuit round/movement → TASK-044; movement
  note, Summary debrief (Workout feedback), Home rest day → TASK-045; EMOM/AMRAP/For Time/ladder
  inline logs → TASK-046.
- `src/dev/gallery-refinement-timers.tsx` (`?state=urgency`, TASK-008) shows "Open log over the
  warning" as a Foundation `AppDialog` with a visible "Close log" action button. It is TASK-008's
  urgency-over-a-native-dialog demonstration (its Playwright check taps that button), not a logging
  consumer; left unchanged. Recorded for TASK-041's cross-route sweep.
- No other task's check target edited except TASK-018's shared file (its guard re-run, below).
  `PROJECT_MAP.md` unchanged (no new directory or boundary).

## Verification

- `node scripts/refinement/run-required-check.mjs --task TASK-016 --check check-01 -- npx vitest run
  src/ui/logging-overlay.test.tsx --testNamePattern "header|focus|close|backdrop" --passWithNoTests=false`
  — PASSED: 17 total, 13 executed (8 required TASK-016 + 5 TASK-018 counted), 13 passed, 4 skipped.
- TASK-018's guard re-run because its target file changed:
  `node scripts/refinement/run-required-check.mjs --task TASK-018 --check check-01 -- npx vitest run
  src/ui/logging-overlay.test.tsx --testNamePattern "scroll|outline|viewport" --passWithNoTests=false`
  — PASSED: 17 total, 9 executed, 9 passed, 8 skipped (none of TASK-016's cases selected).
- Tests-first check: with the four implementation files reverted to the base, 6 of the 8 new cases
  failed (header ×2, one title, backdrop, close/focus return, gallery); the inline-title and
  clocks-continue cases passed at base, as non-regression guards should.
- `npm test` — 269 files, 6314 tests passed.
- `npm run lint:ds` — clean. `npm run build` — passed (`text-box` and the backdrop rule emitted).
  `npx eslint` on the changed files: 0 errors (137 pre-existing fast-refresh warnings).
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final
  --tasks TASK-001,…,TASK-016,TASK-018,TASK-022,TASK-023,TASK-030,TASK-031,TASK-032,TASK-034` —
  PASSED; every listed task, TASK-016 and TASK-018 included, has current passing receipts.
- Scratch Chromium probe (under the host lock; not committed — TASK-041 owns route geometry) of
  `/dev/gallery/refinements?state=ladder-long` and the register's Workout feedback specimen at
  320×568, 390×844, 1280×800, opened by keyboard:
  - title wraps at 320 (2 lines) in both; X frame top = title box top = title ink top (0 px; 1 px
    antialiasing at 1280 on the feedback title); untrimmed comparison 4 px;
  - `::backdrop` computed: the radial vignette (85%) over the 55% dim, `blur(4px)`; dialog, frame,
    scroller and body: `filter: none`, `opacity: 1`, no backdrop-filter, no box-shadow;
  - the held ladder form is `aria-labelledby` the title, no "Log results" heading, groups are h3;
  - Escape closes; focus back on the opener button;
  - while open: `dialog:modal` true; of 23 (gallery state) / 355 (register) background controls,
    0 could take focus; a point on a background control hits the dialog (backdrop);
  - opening focus on "Close log".
  WebKit/Firefox not installed locally: Safari/iOS backdrop-filter and Firefox's untrimmed title
  were not observed.

## Failures and corrections

- First run of the new cases: 1 failure — jsdom has no `HTMLDialogElement.prototype.show`, so a spy
  on it threw. Replaced with a source assertion that the overlay never calls `.show(`.
- First probe of the register page failed on a strict-mode locator (three overlay dialogs on the
  page); the scratch probe was narrowed to the open dialog. Not a product defect.

## Open assumptions / items for later tasks

- Firefox lacks `text-box` trimming: the title's capitals sit ~4 px under the X frame's top there
  (TASK-041 to confirm whether that is acceptable or needs a fallback).
- TASK-043–046: wrap entry points in `LoggingOverlay`; forms that keep their own heading should read
  `useLoggingOverlayTitle()` the way `TimedResultLog` does (one title). TASK-046 updates the
  "Log results" e2e locators listed above.
- TASK-008's urgency demonstration dialog keeps a visible "Close log" button (see Sweep).
- UAT: check the Balanced backdrop over a bright background on a phone, iOS Safari's blur.

## Next action

Controller verification (`npm ci`, check-01, build, lint:ds, test) and the final evidence verifier.
