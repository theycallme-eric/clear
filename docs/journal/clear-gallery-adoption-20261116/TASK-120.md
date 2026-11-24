# TASK-120 — every logging moment's writers and the effects layer on real routes (A3 task 14b, #746)

Task-owned progress note (body `clear-gallery-adoption-v2-20261120`, attempt 1, base `bacf0ca8`). Only TASK-120 writes it.

## Intended outcome

On their real routes, check that all 16 logging moments open Round 7's shared focused interaction
(`LoggingOverlay`) over their original writers (task-019, task-045), and compose the effects layer (atmosphere,
CRT front glass, Phosphor Echo) with open dialogs and TASK-108's deadline warning (task-033; effects reference
PRE-002). Fix only what the sweep finds, in the shared Round 7 owners. Own `src/app/visual-effects-journey.test.tsx`
and `src/ui/phosphor-echo.test.tsx`; rerun TASK-114's task-041 as a regression check. Gallery states: urgency,
ladder-long. Completion owner of JOURNEY-019 and JOURNEY-033.

## What the sweep found (base `bacf0ca8`)

- task-019 (TASK-106's Round 7 rewrite, deferred here): 4 of 5 pass at the base. The timed-families case stops
  where it opens the ladder's log while the ladder runs. Owner decision 3 (2026-11-16): the ladder log opens only
  after the attempt ends. Test rewrite only.
- task-045 and task-033: the build's specs, unchanged since 181e580, fail on build-only locators
  (`dialog.clr-accepted-log`, `[data-logging-head]`, `[data-logging-frame]`, `[data-workout-card]`, the build's
  gallery scenes and the "Notes — <movement>" title). Ported to Round 7.
- Writers: every one of the 16 moments writes only through its original writer on the real route, keeps its draft
  through X, Escape and reopen, keeps the entry through a refused write and retries it once; no second rest clock.
  Coverage table: ledger `rules.coverage` (context, route, gallery state, Round 7 owner, writer, proving cases).
- Effects: one glass in the top layer above every open dialog; the warning's one edge moves into the topmost
  dialog and back, in phase, steady .5 under reduced motion; Balanced backdrop on the native backdrop only;
  effects off/on live; owners byte-identical to bec4454. Round 7 draws no Echo inside a dialog, its frame
  included (AppDialog, REQ-004), where the build echoed the logging frame (look difference, for UAT).
  task-041 contrast unchanged.
- No product defect found, so no product file and no gallery state changed.

## Changes

- `e2e/refinement/task-019.spec.ts`: ladder section of the timed-families case rewritten for owner decision 3
  (no Log results while it runs; the clock read behind the ladder movement's note, still exactly 30 s; the log
  opens itself on Finish and is reopened from Log results); a `settled` helper waits on running animations'
  `finished` promises before tapping inside the animating coaching disclosure.
- `e2e/refinement/task-045.spec.ts`: ported to Round 7 (LoggingOverlay locators, "Movement note" title with the
  field named by the movement (owner decision 4), Round 7's one-moment gallery states).
- `e2e/refinement/task-033.spec.ts`: ported to Round 7 (accepted reference bec4454 with the eded158 bytes still
  checked; breathe keyframes in `countdown-urgency.css`; Round 7's urgency and ladder-long states; the Echo read
  beneath the backdrop on background owners; the held clock run through the shared Dialog's 200 ms exit; the
  shipped primary's own glow exempt from the foreground-filter read).
- New `e2e/refinement/task-120-parity.spec.ts` (urgency and ladder-long at 320 and 390, route beside gallery).
- Evidence: `evidence/refinement/task-120/` (required-cases, receipts, parity receipts, test-ledger); manifest
  descriptions of task-019, task-045 and task-033 extended with the TASK-120 port note; their receipts refreshed.
- Captures: `evidence-store/clear-gallery-adoption-v2-20261120/task-120/captures/` (outside Git).

## Failures, misleading signals and corrections

- Port run 1 of task-033: the route case's edge stayed in the dialog after Close log, and the gallery cases'
  dialogs never hid after Escape. Cause: Round 7's log is the Foundation Dialog, whose 200 ms exit is a
  `setTimeout` on the page clock the cases hold. Correction: run the held clock 200 ms through the exit (TASK-107's
  method), never a sleep.
- The composed-dialog foreground read flagged `span.clr-bleed.clr-glow` (drop-shadow 6 px): Foundation's own
  primary Button emission in Round 7's logs. Exempted exactly that emission; anything else still fails.
- Under the device reduced-motion setting Foundation's arrival collapses to a hard cut but paints its first frame
  once; the read now polls until the foreground is through (as the build's route case already did).
- `settled`-style waits filter to running animations: a paused finite animation never resolves `finished`.

## Verification (2026-11-23, final tree; browsers under `v2.mjs with-lock`, one run at a time, port 5173 free before and after each)

| Command | Result |
| --- | --- |
| base `bacf0ca8`: `npx playwright test e2e/refinement/task-019.spec.ts --project=mobile` | 4 passed, 1 failed (ladder log while it runs) |
| base `bacf0ca8`: `npx playwright test e2e/refinement/task-045.spec.ts e2e/refinement/task-033.spec.ts --project=mobile` | 15 failed (build locators) |
| TASK-120 check-01 (`vitest run src/app/visual-effects-journey.test.tsx src/ui/phosphor-echo.test.tsx`) | PASSED, 24/24 (every case under 0.5 s; no HEAVY needed) |
| TASK-019 check-01 (`playwright test e2e/refinement/task-019.spec.ts`) | PASSED, 5/5 (timed-families case about 2.4 min of its 5 min limit) |
| TASK-045 check-01 | PASSED, 7/7 |
| TASK-033 check-01 | PASSED, 8/8 |
| TASK-041 check-01 (TASK-114's suite, regression rerun) | PASSED, 10/10; receipt byte-identical to the base's |
| TASK-120 parity, runs 1 and 2 (direct) and run 3 (guard) | 4/4 each; the 4 receipts byte-identical across all three runs; 16 capture hashes match the store files |
| PRE-002: `verify-delivery-evidence --mode references --reference phosphor-echo` | PASSED, 5 files verified |
| `verify-delivery-evidence --mode final --tasks TASK-019,TASK-045,TASK-033,TASK-041,TASK-120` | PASSED, current passing receipts |
| lint on the changed specs, base vs HEAD | 0 warnings, 0 errors both |
| CI chain (`typecheck && lint && lint:ds && gen-issues --check && gen:types --check && npm test && build && console check`) on `73052d44` (this note's commit before its CI row was added; only this file changed since) | exit 0: lint 0 errors, 175 warnings (as at the base); 279 files, 6516 tests passed; build ok |

Self-check (TypeScript compiler API, the 4 specs touched since the base): 14 base titles, 16 at HEAD; 0 base titles
absent or renamed; 8 changed bodies and 2 new; 3 bodies with fewer body-level reads than the base and 4 than the
build, each lost matcher accounted for in the ledger (`rules.selfCheck.bodies`: moved into a helper, or a Round 7
scene/markup change listed in `rules.readsDroppedOrRelaxed`); 0 skip/only/todo/fixme added.
`matchersWeakened: false` (no matcher replaced by a weaker one on the same read; three relaxations listed by name).

## Open assumptions

- The Echo on the logging frame is treated as look (test-update rule), not behaviour: Round 7's accepted gallery
  draws none, so the inherited reads are moved to the background owners' rears and the change is listed for UAT.
  bec4454's REUSE.md line 21 and `docs/specs/EFFECTS_COMPOSITION_CONTRACT.md` §2.3 still describe a frame rear.
- The gallery states' missing refused-save scenes (notes, feedback, rest day) are look the accepted gallery does
  not compose; each refusal stays proved on the real route.

## Next action

Controller verification.
