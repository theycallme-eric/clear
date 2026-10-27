# TASK-010 — Rest countdown lifecycle and footer control cleanup

Issue #530 · REQ-015 · role: completion-owner for JOURNEY-009 (TASK-009 depends on it).
Task-owned progress record; it stands in for the shared daily journal for this task.

## Outcome intended

Own rest-footer acceptance at the workout-screen boundary. Record the actual baseline and do not
manufacture a defect. After expiry or skip, the minimized Rest control must be gone, and logging
must stay reachable without it. Expiry, the next clock, prefill and section moves must record
nothing. The wall-clock lifecycle must be kept.

## Baseline, as found (reviewed base, HEAD `cad7860`)

- `src/state/rest.ts` holds one `RestPeriod` per session: `startedAt` plus `totalSeconds`, read
  against `Date.now()` on a 500 ms repaint and on `visibilitychange` / `focus` / `pageshow`.
  Extend moves `totalSeconds`. Skip clears the period. Only `set-logger.tsx` starts a rest, and
  only after an explicit Log set. Nothing starts a clock on mount.
- `src/app/Workout.tsx` `FooterRest` draws `RestTimerBar` in the pinned foot only while the sheet
  is minimized. The open sheet draws the same bar itself, so the countdown is shared and never
  doubled.
- `RestTimerBar` (`src/ui/workout-chrome.tsx`) returns `null` unless `rest !== null &&
  remainingSeconds > 0`. So on this base, the minimized Rest control **already disappears** after
  expiry and after skip, and no "Rest complete · 00:00" state exists anywhere in `src/`. The brief's
  example is a prohibition. It is not a defect this product shows.
- The movement card's own Log set opens the sheet whatever state rest is in.
- Circuit rounds keep their own block-owned rest. Rest expiry and "Start round N" only change
  phase. `rounds_completed` counts only explicit "Finish round" taps.

Conclusion: every criterion is met by the existing runtime. This task adds acceptance coverage
only. It makes no runtime change, so the TASK-034 runtime-source hash is untouched.

## What changed (local, unpublished)

- New: `src/app/rest-footer-lifecycle.test.tsx`, 10 tests that run through the real route tree
  on a synthetic `createWorkoutDouble` session. There is no personal data and no backend.
  - AC-054: the rest moves from the sheet to the footer on minimize and back on reopen, while it
    keeps running (01:30 → 01:10 → 01:00). Add 30s and Skip rest are present. After an extension,
    the countdown stays visible past the prescribed 90 s until the extended end.
  - AC-055: on expiry and on skip with the sheet minimized, there is no Rest region, no
    "Rest complete" and no `00:00`. The saved row stays on the card, and the card's Log set opens
    `Log set 2`. Later foreground returns do not bring the control back.
  - AC-056: `loggedSets()` stays the same through the prefilled sheet opening, expiry with the
    sheet open, reopening, circuit "Start round 2" (early clock start) and circuit rest expiry
    (rounds-recorded text stays the same), and Next/Previous with a running rest. The block
    completion carries `outcome: {}`.
  - AC-057: no rest exists on mount even after the clock moves 120 s. Backgrounding with no ticks
    reads the correct remainder on foreground return.
- Nothing changed in GitHub or any external service. The vendored design system was not touched,
  and `git diff 7f0a367 HEAD -- src/design-system` is empty.

## Failures and corrections along the way

- The first run had 4 of 10 failures, all from the test harness: (1) the shell persists the open
  section in `localStorage`, so a test that navigated to Conditioning made later tests open
  there. The fix clears storage per test. (2) I expected a saved-row **Edit set 1** at the shell.
  `onCorrectSet` is not wired in `Workout` on this base, because persisted correction belongs to
  TASK-011. The test now asserts the saved row plus Log set, and does not depend on another
  task's output. (3) The navigation button is named `Previous`, not `Previous section`.
- Discrimination check: I temporarily changed `RestTimerBar` to stay drawn at 0 s, and 6 of 10
  tests failed. The source was restored, and the runtime diff is empty.

## Already-approved Edit allocation

On the recorded baseline, saved-row **Edit** was not exposed at the workout shell. Production
correction wiring is already allocated to TASK-011, and rest-independent Edit reachability is
allocated to TASK-009. No new owner decision is needed. This task retains its own rest-lifecycle
and independent Log set boundary; its baseline findings above remain historical facts.

During TASK-011 integration, the test's stale Edit description was corrected and its finished-rest
assertion was scoped to the Rest control/caption. Legitimate movement or elapsed timers may show
`00:00`; all absence, continuity, reachability and no-auto-recording checks remain in force.

## Verification

| Command | Result |
| --- | --- |
| `npm test -- rest-footer-lifecycle` | pass, 10/10 |
| `npm test` | pass, 218 files / 5601 tests |
| `npm run lint:ds` | pass |
| `npm run build` | pass (existing >500 kB chunk advisory only) |
| `npm run lint` | pass, 0 errors (138 existing warnings, none in the new file) |
| `npm run typecheck` | pass |
| `npm run gen:types -- --check` | pass, types current |
| `python3 scripts/gen-issues.py --check` | pass (71 requirements, 136 edges) |

The design-0143 runtime-source audit that blocked TASK-006 stayed green. This task changes no
runtime source.

## Next safe action

Controller verification and delivery. TASK-009 can use this test file as its rest-lifecycle
guard.
