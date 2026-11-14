# TASK-022 — Accepted concise Warm-up and Cooldown with separate preparation timer (#649)

Body `clear-refinement-v2-20261109b`, attempt 1, base `349f299` (after TASK-034 #697). This is the
task-owned progress note, the approved exception to the shared daily journal for this body. Only
TASK-022 writes this file.

## Intended outcome

REQ-022 (AC-C49-01, AC-R022-01, AC-R022-02), completion owner of JOURNEY-022 on `/review` and
`/workout`:

- a Warm-up or Cooldown is a concise title (`Warm-up` / `Cooldown`), an approximate total time and
  the movement names on separate lines, with no prose and no per-movement load, time, sets or rest;
- the title, names, count and time are TASK-034's reading, never the illustrated four minutes or
  three rows;
- the warm-up timer has no Dismiss and no substitute hide action, and there is a separate preparation
  clock with Start / Pause and Add 30s.

## Decisions (from the sources; recorded rather than asked)

- **Live workout replaces the section's movement cards with the guide (V05 → V06).** R01's owner
  reinforcement ("in both Review and the active workout") and V06 both show the Warm-up as the guide
  and its clock, not set-by-set cards. The guide's movements are therefore not logged set by set.
  Next section still completes the section's blocks through the shell's one forward action (REQ-013),
  unchanged. Every non-preparation section is drawn exactly as before.
- **No Swap on guide names in Review.** The accepted concise appearance (R36 "perfect") has names
  only. Review still offers Swap on every other section's movements. See "Open owner items".
- **The "existing Start/Pause/Add30s" clock did not exist in the app at this base** (TASK-007's note
  says so; `timed-clock.ts` reserved a reading for it). It existed in the earlier design preview.
  Per R15 it reuses the rest timer's pattern: `RestTimerBar`'s card is now the shared
  `CountdownCard` (same DOM), drawn by both the rest and the new `PreparationTimer`. Its arithmetic
  is the movement countdown's (`movement-countdown.ts` pure functions); Add 30s is
  `REST_EXTENSION_SECONDS`. Its length is the guide's own `approximateMinutes`.
- **The clock is live-workout only.** Review states the plan (R30); the journey's start/pause action
  happens on `/workout`. Review draws the guide alone.
- **One clock per section, per session**, held by the shell's `PreparationClockProvider`, so leaving
  and returning finds it as it was. Memory only: a reload shows it ready again, and nothing is written.
- **Warning:** the shared countdown warning (TASK-008) via `movementCountdownDeadline` — colour at 10,
  the edge at 5 while running, none when paused or run out.
- **Live title is a label.** The section header already heads the section, so the guide's title is a
  label (new additive `Card` prop `headingAs="label"`), as the live `WorkoutCard` does. In Review it is
  the section's level-2 heading, inside the usual `data-review-section` wrapper.

## Changes

- New `src/ui/preparation-guide.tsx`: `PreparationGuide` (loading / error with retry / missing
  `no-movements` / nothing for `not-composed` and `no-workout` / ready), `PreparationTimer`,
  `LivePreparation` (persisted reading; a malformed row is an error with no guide or clock).
- New `src/state/preparation-clock.ts` (`usePreparationClock`, `extendPreparation`, store context)
  and `src/state/preparation-clock-provider.tsx`.
- `src/state/timed-clock.ts`: fifth clock `preparation`, `preparationReading`.
- `src/ui/workout-chrome.tsx`: `CountdownCard` extracted from `RestTimerBar` (markup unchanged).
- `src/ui/card.tsx`: additive `headingAs?: 'heading' | 'label'`.
- `src/app/Review.tsx`: Warm-up/Cooldown sections draw the guide from `composedPreparationGuide`.
- `src/app/Workout.tsx`: preparation sections draw `LivePreparation`; shell mounts the clock provider.
- `src/ui/refinements/presentation.css`: `.clr-preparation-guide__list` / `__empty` (shared owner, no
  route CSS).
- Gallery: `?state=preparation` (`GalleryPreparation` in `src/dev/gallery-refinement-scenes.tsx`),
  data `src/dev/gallery-refinement-preparation-data.ts`, register entries `PreparationGuide`,
  `PreparationTimer`, `LivePreparation`; `CountdownCard` exemption in `gallery-registry.test.tsx`;
  `docs/design/library/COMPONENTS.md` regenerated (3 lines).
- `PROJECT_MAP.md` (3 lines) and `src/state/README.md` (consumer row) updated.
- Tests: new `src/ui/preparation-guide.test.tsx` (check-01, 7 cases), new
  `e2e/refinement/task-022.spec.ts` (check-02, 4 cases), `evidence/refinement/task-022/required-cases.json`
  and receipts.

## Superseded tests edited (consumer sweep)

- `src/test/timer-frames-fixture.ts` (TASK-007/008 shared fixture): the opening section holding the
  timed plank hold is now `core`, not `warmup`, because a Warm-up no longer draws set-by-set cards.
  The hold, countdown, rest and log are unchanged. Case titles untouched.
- `src/state/timed-clock.test.ts` (TASK-007 check-01): `TIMED_CLOCKS` now includes `preparation`.
- `src/app/Review.test.tsx`: shape cases read the spectrum with Warm-up/Cooldown composed as
  Mobility/Core; card counts include guide cards; the swap case asserts the Warm-up offers no Swap.
- `src/app/review-screen.test.tsx`: section headings include guide cards.
- `e2e/ui-polish-b05-swap.spec.ts`: the Warm-up `air squat` Swap invocation is removed and the empty
  case uses `back squat`.
- Checked, no edit needed: core-loop (Review sections keep `data-review-section`), workout-lifecycle
  (no preparation section), task-040 home-review (level-2 `Warm-up` heading still present once in
  each route), workout-ladder (cooldown only navigated), B05 specs other than swap, toast `Dismiss`
  locators (unrelated).

## Failures and corrections

- First full run: 47 failures in 10 files. Causes: duplicate `Warm-up`/`Cooldown` headings (fixed by
  the live label), the TASK-007/008 warm-up plank fixture, Review shape/swap cases, the registry gate.
- Order of work: the implementation was drafted before `preparation-guide.test.tsx`, not strictly
  test-first. Mitigation: a mutation check (Workout drawing blocks again; a Dismiss button added to
  the timer) turned 5 of 7 check-01 cases red; restored and green.
- jsdom does not expand `list-style: none`; the test reads the shared CSS rule instead. The browser
  case reads the computed style.
- Reduced-motion e2e: digit tumbles still report animations at 0.01ms, so the case checks every
  animation is ≤ 0.01ms and one iteration (the app's a11y.css guarantee).
- I once piped the check-01 guard into `tail` (forbidden). It was re-run cleanly with output to a
  file; only the clean receipts are used.

## Verification (exact results)

| Command | Result |
| --- | --- |
| `npm ci` | completed |
| `node scripts/refinement/run-required-check.mjs --task TASK-022 --check check-01 -- npx vitest run src/ui/preparation-guide.test.tsx --passWithNoTests=false` | PASSED: 7 total, 7 executed, 7 passed, 0 skipped |
| `node scripts/refinement/run-required-check.mjs --task TASK-022 --check check-02 -- npx playwright test e2e/refinement/task-022.spec.ts --project=mobile` | PASSED: 4 total, 4 executed, 4 passed, 0 skipped |
| TASK-007 check-01 / check-02 guards | PASSED 13/13, 7/7 |
| TASK-008 check-01 / check-02 guards | PASSED 13/13, 5/5 |
| `npx playwright test` refinement task-001…006, 009…014 (`--project=mobile`) | 62 passed |
| `npx playwright test e2e/ui-polish-b05-swap.spec.ts` (edited cases) | `empty renders` 2/2 passed; `every Review invocation` fails only on the pre-existing missing out-of-repo `.evidence` B05-05 reference, like 9 other cases in that file |
| `npx tsc --noEmit` | clean |
| `npm test` | 268 files, 6287 tests passed |
| `npm run build` | exit 0 |
| `npm run lint:ds` | exit 0 |
| `node scripts/gallery-index.mjs --check` | 75 entries verified |
| `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,…,TASK-014,TASK-022,TASK-030,TASK-031,TASK-032,TASK-034` | PASSED; every task has current passing receipts |

Visual comparison: the phone-390 captures of `/workout` match V06's composition (section header,
guide card with `~N MINUTES` on the title row and one name per line, then the timer card with its
label, whole timer body, fill and Start beside Add 30s; no Dismiss). Review shows the guide cards
around the worked section.

## Open owner items (not blocking)

- Warm-up/Cooldown movements are no longer swappable in Review and no longer logged set by set in
  the workout, because the accepted concise guide has names only. Confirm at UAT.
- Add 30s on a clock that has run out gives 0:30 waiting for Start (no auto-run). Start is disabled
  at 0:00. Confirm at UAT.
- Copy for TASK-037: "No movements are left in this warm-up.", "The warm-up didn’t load",
  "Reading the warm-up", region names "Warm-up timer" / "Warm-up movements".
- Inherited from TASK-034: names are humanised slugs (shown in sentence case by CSS); long holds
  under-read.

## Next action

The controller commits and verifies. TASK-023 places Regenerate after the Cooldown guide (Review
already keeps section order).
