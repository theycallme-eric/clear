# TASK-012 — Rest opens the logging sheet and starts rest; internal Log saves

Body: UI polish batch 05 · Requirement REQ-012 · GitHub issue #570 · completion owner for JOURNEY-009.
Branch `agent-runner/task-012-a1-420a75c5`, tested base `cdbcbe91fc7b9c79539c7ac2bd0fa3d5ad79df08`.
This task-owned record satisfies the shared daily-journal instruction for this body.

## Controller verification checkpoint

Same native run/attempt1; original history retained. Build a7fb2891 was integrated normally at
merge dd1a80a, after preserving original18source/105totalfiles and checkpoint8f43231. All circuit
new entries now say Rest, while circuit Start/Finish-round timing remains unchanged; no Log escape
hatch remains. Save/Edit after skipped/expired rest, exact lb unit/observation identity, changed-input
Cancel and combined independent drafts are covered.206focused units passed; final browser run
passed **5/5 in31.0s**,1worker0retries, session8914. Actual direct artifacts (97files/76PNGs/20records)
are externally retained; original capture source a7e5f8c+dirtyspec and driver6f71de…b96e remain honest.

One390 Edit test exposed stale published footer geometry between collapse and the next card click.
The trace did not establish a reproducible product bug. The proof now waits for observable collapse
completion (sheet absent; actual footer height equals public published inset), with no fixed sleep,
retry/force or product patch. Targeted390 and full5case checks passed; harness34/34 passed.

Owner accepted the baseline proof-method disposition in chat; resolved, no further investigation.
Root viewed actual390 Rest-before-log and320 saved-Edit captures. Timer and measurement/effort fields
are present; existing docked sheet styling remains Task13's separate approved work. No distance,
optional effort enum, durable queue or vendor contract changed. The original worker record below is
history, including its rejected circuit-label exception and preliminary proof claims.

Current active format evidence is prepared as a unique Task012 group and real task/run/attempt/tested
base metadata. Genuine authenticated source-bound recapture, all unchanged native criterion/task/
project checks, exact-head receipt, required CI and protected build delivery remain pending.

## Intended outcome

B05-07.1/07.2 (owner-resolved; see DECISIONS Rest/Log table): the movement card's entry action is
**Rest**. With no rest running, Rest opens the shared half-sheet and starts the prescribed rest, so the
countdown is visible before anything is logged. **Log set N** inside the sheet is the only save, and it
never starts or restarts rest. The chevron collapses without writing; reopening restores the same
countdown and draft. Expiry saves nothing, and saved-row Edit never starts rest. A superset still
saves one combined round. Circuit Start/Finish-round rest is unchanged. No rest duration is invented.

Out of scope here (later tasks on the same surface): 07.3 accent bar and 07.4 surface/backdrop/overlay.

## Reproduction of the reported defect

- Reference: `sources/source-10-B05-07-logging-sheet.jpg`, sha256
  `b7fa59ba908bd27bf86baa29075a1c8e8d308ecb9d72e20618dd1c9025c19f4e` (opened and viewed).
- Code cause: `ExerciseSetLogger` started rest only inside `log()`, after a saved set. The card's
  `Log set` only opened the sheet, so the first-open sheet had no rest. `SupersetRoundSheet` started
  the round rest only on submit.
- Baseline proof at the Workout host boundary:
  - `src/app/sheet-minimize-access.test.tsx` "minimised before any rest exists" asserted that no Rest
    region appeared after the card opened the sheet. That case is rewritten here, because it pinned
    the defect.
  - The browser reference case measures the defect in the reference's own pixels:
    - region 07.2 (sheet between title and fields) has 1 ink band, the context line only;
    - region 07.1 shows the seven-character LOG SET label.

## Changes

- `src/ui/set-logger.tsx` — the card entry action is `Rest` (new `entryAction` prop, default
  `'rest'`).
  - Activating it starts the prescribed rest only when none is running, then opens the sheet.
  - The in-sheet submit calls `logSet` only; the post-save `restTimer.start` is removed.
  - `SupersetRoundSheet` no longer starts rest; its unused `roundRestSeconds` prop is removed.
- `src/ui/superset-block.tsx` — the block's single entry action is `Rest`. It starts the block's
  `round_rest_seconds` rest (when none is running) and opens the round sheet. `Log round N` saves the
  combined round only.
- `src/ui/circuit-block.tsx` — circuit rows pass `entryAction="log"`. Their rest belongs to the round
  boundary, so circuit wording and Start/Finish-round transitions are unchanged.
- `src/ui/set-logging-sheet.tsx` — doc comment only.
- Tests updated to the owner-resolved contract. Card queries `Log set`/`Log round` → `Rest`;
  tests that pinned "rest starts on save" now assert that Rest starts it and save does not restart it:
  - `sheet-minimize-access`
  - `rest-footer-lifecycle`
  - `superset-logging`
  - `Workout`
  - `set-logging-sheet`
  - `set-logger`
  - `set-correction`
  - `set-effort`
  - `standard-block`
  - `movement-countdown`
  - `set-logging-provider`
  - `superset-block`
- New `e2e/ui-polish-b05-rest-log.spec.ts` — production `/workout` on a synthetic session.
  - All API traffic is intercepted; set and block writes are answered locally and never forwarded.
  - There are no function or model calls.
  - Each case asserts that nothing left the local origin.

No vendor (`src/design-system`) edits. No new tokens, components or hardcoded values.

## Failures and corrections during the work

- A bulk `sed` rename was denied by the sandbox; the renames were done file by file instead.
- `effort-persistence.test.tsx` has its own stub button named `Log set`, so renaming it there was
  wrong. Reverted.
- `Workout.test` `logRound` matched several `Rest` buttons; scoped it to the superset card.
- Browser runs:
  - `page.clock.install()` lets real time flow, so exact `MM:SS` assertions drifted. They were
    replaced with an exact upper bound (any restart or second rest reads higher) and a lower bound
    from the measured real elapsed time.
  - The correction operation is `correct`, not `update`.
  - `Rest between rounds` needed an exact text match.

## Browser evidence — `npx playwright test e2e/ui-polish-b05-rest-log.spec.ts --project=mobile`

Final run: **5 passed (16.0 s)**, exit 0. Chromium mobile emulation, DPR 3, skin clear, source
`cdbcbe9` plus the dirty tree; synthetic public config. Viewports: phone 390×844 and narrow 320×568.

Each state writes a JSON record with:
- reference file, sha256 and region;
- sheet/card PNG with sha256, plus a full-viewport PNG;
- consumer, state and viewport;
- criterion results.

The records are under `test-results/ui-polish-b05-rest-log-*/`.

| State (both viewports) | Consumer | Reference region | Measured result |
| --- | --- | --- | --- |
| Card entry, nothing running | standard movement card | 07.1 | label `Rest`; ink narrower than 0.8× the reference LOG SET; no `Log`/`Log set`/`Log round` button; no rest bar |
| Rest activated | SetLoggingSheet new | 07.2 | countdown at the prescribed 150 s inside the sheet before any write; band ink 2 vs reference 1; counts down on fast-forward |
| Collapse with draft, then reopen | same | 07.2 | 0 writes; footer shows the same rest; reopen restores weight 100 / reps 5 / About right; countdown not reset; one Rest region |
| Log set 1 | same | 07.2 | one `insert` set 1 {weight 100, reps 5, effort about_right}; rest unchanged; row `Saved` |
| Collapse after save | same | — | no additional attempt |
| Save failure | same | 07.2 | refused attempt; set 2 held `On this device only` with 4 reps; rest unchanged; `online` retries and saves |
| Saved-row Edit / Cancel / Save correction | SetLoggingSheet edit | 07.2 | rest unchanged on open and save; Cancel writes nothing; `correct` set 1 reps 6 |
| Expiry with draft open | SetLoggingSheet new | 07.2 | rest gone; no attempt; draft kept; Rest still visible and starts a fresh rest |
| No rest prescribed | RDL (`rest_seconds` null) | 07.2 | no Rest region; no duration invented |
| Combined round | SupersetRoundSheet via block Rest | 07.2 | 60 s round rest before logging; one Log round = bench set 1 (reps 7) + plank set 1 (28 s); rest not restarted |
| Circuit | CircuitBlock | — | Start/Finish round 1 shows `Rest between rounds`; no session rest; no `Rest` button; `Log load and reps` kept |

Visually inspected (opened):
- card-entry 390 (REST label);
- sheet-rest-open 390 and its viewport (02:30 countdown above the fields, before logging);
- sheet-expired 390 (no countdown; draft 105/3 kept; full-width LOG SET 3);
- sheet-combined-round 390 (one round rest, each movement's own fields).

## Other verification

| Command | Result |
| --- | --- |
| `npx vitest run src/ui/set-logging-sheet.test.tsx src/ui/set-logging-sheet-actions.test.tsx src/ui/set-logger.test.tsx src/app/sheet-minimize-access.test.tsx` | 4 files, 77/77 passed, exit 0 |
| `npm test` | **exit 1: 2 failed / 5,835 passed** — both in `src/test/design-0143-final-audit.test.ts` (see below) |
| `npm run typecheck` | exit 0 |
| `npm run lint:ds` | exit 0 |
| `npm run lint` | exit 0; 0 errors, 149 existing warnings |
| `npm run build` | exit 0; existing chunk-size advisory |
| `npm run gen:types -- --check` | exit 0; current |
| `python3 scripts/gen-issues.py --check` | exit 0 (71 requirements, 136 edges) |

## Unresolved

- **0.14.3 audit source binding (blocks `npm test`).** This is the same known binding recorded by
  TASK-005/006/008.
  - What fails: `design-0143-final-audit.test.ts` hashes runtime `src/`, so this task's source change
    makes the audit and the format-preview group stale. Two checks fail: "is bound to the package
    and runtime source…" and "requires the complete actual eight-cell mobile group…".
  - Why it can't be cleared here: re-deriving needs the authenticated format-preview collector
    against an owned disposable local backend. This workspace has no backend config (only
    `.env.example`) and no Supabase CLI.
  - No hash was written without a real recapture.
  - Next safe action: the controller runs the existing recapture on the frozen source. That updates:
    - the new evidence group;
    - the `format-preview-evidence.ts` pointer;
    - TASK-012 lineage, base `cdbcbe9`;
    - the audit hash.
- Reference resolution: the spec reads the reference from `B05_EVIDENCE_DIR` or the
  workspace-relative `../.evidence/<workspace>/`, and fails closed when neither exists. The relative
  path resolved in this run.
- Observed, not changed (07.4 belongs to later tasks):
  - the docked sheet sits in the pinned foot's capped scroll region above the section navigation;
  - with the countdown inside it, `Log set N` is reached by scrolling that region.
- Physical-iPhone UAT remains pending. Nothing here is an installed-device result.
- `origin/main` was not fetched or merged; the controller owns integration and delivery.
