# TASK-111 — A3 task 11 (F9): rest-day and workout-feedback dialogs with drafts kept (#734)

Built in body `clear-gallery-adoption-v2-20261118` (round 06), attempt 1, on base `eb6b20af` (TASK-105 and
TASK-106 merged); resumed in body `clear-gallery-adoption-v2-20261120` (round 07, decision R7-4), attempt 1, on
base `779b3436` (TASK-107 merged). Integration branch `build/clear-gallery-adoption-2026-11-13`. Source material
only: the old build `build/clear-refinement-2026-11-04` (`181e580`). This is the task-owned progress note; it
satisfies the shared daily journal rule for this body. Only TASK-111 writes it.

Path note: the brief's rules name this folder (`clear-gallery-adoption-20261116`); the issue body names
`clear-gallery-adoption-20261113`. The brief's path is used, as TASK-103/104/105/106/107/113 did.

## Status

Round 07 (2026-11-20): the round-06 worker branch (`fe571ecf`) is merged onto `779b3436` without conflict;
every required check passes again on the merged tree, with receipts byte-identical to round 06's and stable over
two parity runs. The round-06 plan conflict (Home's recovery case) is now placed by round-07 scan finding S4:
its old assertions are deferred to TASK-119 (see "Round 07"). Committed in the worktree; nothing is pushed.
Not yet independently verified or reviewed.

Round 06 (superseded by the paragraph above): "Attempt 1 implemented, verified and committed on the worker
branch (2026-11-19). Every required check passes and its receipt is byte-stable on a second identical run. One
plan conflict is reported, not settled (see "Open"). Nothing is pushed."

## Intended outcome

- /summary: the debrief is entered only in Round 7's "Workout feedback" `LoggingOverlay`, opened from the
  Debrief card's "Log workout feedback", over the existing `saveDebrief` writer; Save and close saves and leaves
  for Home. Home: the rest day (Mark Rest Day / Change reason) is chosen only in Round 7's "Log rest day"
  `LoggingOverlay`, over the existing `mark_rest_day` writer (note null). No old inline form remains.
- The feedback draft survives Close and reopen; neither dialog closes while saving; a refused save or reason
  change keeps its error, its entry and focus in the dialog for the retry; the feedback form submits through
  `useInvalidFocus`.

## Changes

Product (both files were last changed by the gallery's history, `1633333c` in `bec4454`; each change below is
named by TASK-AC-579280C10CDC or TASK-AC-49B5381CB1E9):

- `src/app/Summary.tsx`: the presentation gate is gone, with the old inline debrief form and its pinned
  `PhoneFooter` Save and close. The Debrief card always holds "Log workout feedback" and Round 7's
  `LoggingOverlay` ("Workout feedback"), drawn in place exactly as the gallery's `workout-feedback` state draws
  it. New: `closeDisabled={saving}` (X disabled, Escape refused while the save is in flight). Exports
  `LOG_FEEDBACK_LABEL` and `FEEDBACK_TITLE`. Unused imports dropped. The writer, its null rules, the
  2,000-character refusal and `useInvalidFocus` are unchanged.
- `src/app/Home.tsx` (`RestDayControl`): the presentation gate is gone, with the inline editor. The trigger now
  stays in its card while the dialog is open (`aria-expanded` true, as the gallery's `rest-day` state and the
  build draw it); the dialog ("Log rest day", `REST_DAY_LOG_TITLE`) is mounted while editing, as Round 7 did,
  with `closeDisabled={write.marking}`. The refused mark's alert moved from the card into the dialog (TASK-106's
  task-019 finding for this task). Focus rules (picker on open, trigger on close) and the writer are unchanged.

The draft question (objective, controller note): `LoggingOverlay` → `AppDialog` → Foundation `Dialog` always
renders its children inside the `<dialog>`, so a closed overlay does not unmount them; the debrief's state is
also the screen's, above the overlay. No fix was needed. A test proves it (same form node after X and Escape,
draft back on reopen). `LoggingOverlay` was not changed.

Tests (`evidence/refinement/task-111/test-ledger.json`, 123 entries: 104 carried, 3 rewritten, 4 deferred,
12 added, 0 retired):

- `src/app/Summary.test.tsx`: the build's bodies restored for the ledger's 18 F9 cases (15 identical to the
  build; 3 rewritten for Round 7: the dialog is drawn in place, not portalled; the scroll region is
  `.clr-logging-overlay__scroll`; task 1's extra assertions kept beside the build's). 4 TASK-111 cases added.
- `src/app/Home.test.tsx`: the build's bodies restored for 2 of the ledger's 3 F9 cases (identical). The third
  (recovery) is a plan conflict (see "Open"): base body kept. 4 TASK-111 cases added.
- `src/app/action-glow.test.tsx`, `src/app/home-screen.test.tsx`, `src/ui/formFocus.test.tsx`: unchanged, pass.
- `e2e/refinement/task-111-parity.spec.ts` (new, 4 cases): TASK-106's look-check method (synthetic origin,
  held clock and page scroll, X repaint, steady screenshots), captures in
  `evidence-store/clear-gallery-adoption-v2-20261118/task-111/captures/`.
- Evidence: `evidence/refinement/task-111/required-cases.json` (check-01: 119 cases in 5 files; parity: 4),
  `results/check-01.json`, `results/parity.json`, `parity/*.json` (4 receipts).

No gallery-owned file outside `Home.tsx` and `Summary.tsx` changed, and no shared gallery component changed,
so no `/gallery/refinements` state needed an update: the `workout-feedback` and `rest-day` states compose the
same shared owners (`src/dev/gallery-refinement-forms.tsx`) and do not render `Home.tsx` or `Summary.tsx`.
No CSS changed. `PROJECT_MAP.md` not edited (no architecture change).

## Failures and corrections

- The build's bodies, dropped in over task 1's, failed 2 of 36 Summary cases on Round 7 markup (the build
  portalled its dialog to the body and named its scroller `[data-logging-scroll]`). Rewritten to Round 7's
  markup with the same assertions; task 1's extra assertions in 2 cases kept (unions), so no assertion was lost.
  A line diff of the removed lines confirmed it.
- Red before green on the base: the gate-closed cases (no dialog), the in-flight case (X enabled while saving),
  the refused rest day (alert drawn in the card behind the dialog), and the trigger's focus after close (the base
  re-created the trigger, so focus was not on the same Change reason). The draft and invalid-focus cases passed
  on the base too: they are checks, not fixes.
- First parity run: 4/4 with zero word and box differences. The captures showed one difference boxes cannot
  see: the route's rest-day dialog opens with focus on its Reason picker (U25, kept), the gallery's on the X. The
  spec now records each dialog moment's focused control and labels that difference (AC-GAL-05) in the receipt.

## Verification (round 06: the round-06 worktree, 2026-11-19; `npm ci` first)

- check-01 (`run-required-check`): PASSED, 119 executed, 119 passed, 0 skipped. Run again after the last test
  edit: PASSED 119/119, receipt unchanged (no unstaged change under `evidence/`).
- parity (`run-required-check`, host lock `v2.mjs with-lock`): run 1 PASSED 4/4; evidence staged; run 2
  PASSED 4/4 with **no unstaged change under `evidence/`** and all 28 capture files byte-identical (SHA-256
  list compared). Words: 0 differences on every moment. Boxes: 0 differences beyond 2 px on every moment.
  Labelled: rest-day focus (AC-GAL-05) and the rest-day control's surroundings (TASK-AC-579280C10CDC).
- `verify-delivery-evidence.mjs --mode final --body clear-refinement-20261103 --tasks TASK-111`: current
  passing receipts.
- `src/ui/logging-overlay.test.tsx -t "Workout feedback"` (TASK-114's file, name filter): 1 passed.
- `npm run typecheck` pass; `npx eslint` on the changed files: 0 errors, 1 warning, the same one as the base
  (`Home.tsx` favorites `rows` memo).
- No `.skip`, `.only` or `.todo` added (grep of the added src and e2e lines: 0).
- CI chain (the brief's one command): exit 0; detail in "CI chain" below.
- Not run: `e2e/refinement/task-045.spec.ts` and `task-019.spec.ts` (TASK-120's), any other task's parity spec,
  real phones.

## Round 07 (body `clear-gallery-adoption-v2-20261120`, 2026-11-20)

Resumed under decision R7-4; round 07 did not change this task's text.

- **Merge.** `git fetch` of the round-06 clone's `v2/clear-gallery-adoption-v2-20261118/task-111-a1` (tip
  `fe571ecf8b38`), then `git merge FETCH_HEAD` onto `779b3436`: a real merge (the branch's base is `eb6b20af`),
  no conflict. TASK-107's changes between the two bases touch none of this task's files (`Home.tsx`,
  `Summary.tsx`, the five check-01 test files, `logging-overlay.*`, `task-045`/`task-019` specs): checked with
  `git diff eb6b20af 779b3436` on them, empty. So the ledger's body comparisons with the base still hold.
- **Criteria re-read against the merged tree.** Nothing missing: both dialogs are Round 7's `LoggingOverlay`
  with no gate and no inline form (TASK-AC-579280C10CDC); `closeDisabled` while saving on both, the draft kept
  and the refusals kept in the dialog for the retry (TASK-AC-49B5381CB1E9); the feedback form submits through
  `useInvalidFocus` (TASK-AC-4F3A94603641). `LoggingOverlay` and `src/ui/logging-overlay.test.tsx` (TASK-114's)
  are untouched. No product or test code changed in this round.
- **Home's recovery case, placed (round-07 scan finding S4, decision R7-5).** `src/app/Home.test.tsx` ›
  "recovery: says the last one was Recovery, and the next opens as an ordinary day" keeps Round 7's passing
  body (unchanged from `779b3436`). The build's (`181e580`) assertions on it — a button named `/^Focus:/`
  that opens closed (`aria-expanded` false) with Recovery among its choices, TASK-024's Focus disclosure — are
  deferred to TASK-119. TASK-119 restores them on that case, rewritten to Round 7's "Change focus" naming where
  only the name differs, and runs this file only with the name filter of TASK-119:check-02 (`--testNamePattern
  "recovery: says the last one was Recovery"`). TASK-111 still owns the file and runs it whole.
- **Ledger** (`evidence/refinement/task-111/test-ledger.json`): `base` is now `779b3436`; the recovery entry and
  `rules.deferred[0]` say the S4 placement above instead of "plan conflict, reported, not settled"; the
  task-045 entry and `rules.deferred[1]` note that round 07 keeps TASK-045 check-01 at TASK-120 (checked in the
  round-07 plan, as are TASK-120's task-019 check and TASK-114's TASK-017 name-filter check). Counts unchanged:
  104 carried, 3 rewritten, 4 deferred, 12 added, 0 retired. `required-cases.json` unchanged.
- **Gallery-owned files** (`git diff --name-only 1633333c^ bec4454`, 97 files) that this task changes: only
  `src/app/Home.tsx` and `src/app/Summary.tsx`, both named by TASK-AC-579280C10CDC / TASK-AC-49B5381CB1E9.

Verification (this worktree, 2026-11-20; `npm ci` first):

- check-01 (`run-required-check`, the brief's command): PASSED, 119 total, 119 executed, 119 passed, 0 skipped;
  `results/check-01.json` byte-identical to round 06's (no change under `evidence/`).
- parity (`run-required-check` wrapped in `node …/agent-runner-v2/bin/v2.mjs with-lock -- …`; the CLI takes no
  body argument): run 1 PASSED 4/4, run 2 PASSED 4/4. Both left `results/parity.json` and the four
  `parity/*.json` receipts byte-identical to round 06's, and the 28 capture files in
  `evidence-store/clear-gallery-adoption-v2-20261118/task-111/captures/` (the folder the spec already uses)
  hashed the same after both runs (SHA-256 list compared).
- CI chain (the brief's one command): exit 0. `npm run typecheck` pass; `npm run lint` 0 errors, 175
  warnings; `npm run lint:ds` pass; `gen-issues --check` pass (71 requirements, 136 edges); `gen:types --check`
  current; `npm test` 6,327/6,327 in 269 files, no rerun; `npm run build` pass; console grep no match. The run
  changed no tracked file.
- No `.skip`, `.only` or `.todo` in the task's added src and e2e lines (grep: 0).
- Not run: any other task's parity spec, `task-045.spec.ts`, `task-019.spec.ts` (TASK-120's), real phones.

## Open

- **Round 06: plan conflict (reported, not settled): `Home.test.tsx` › "recovery: says the last one was Recovery …".**
  The groundwork ledger lists it as F9 build-edit-pending, but the build's body asserts Generate's TASK-024
  Focus disclosure (a `Focus: …` button with `aria-expanded`), which A3 TASK-119 restores [inferred from the
  round-06 check plan: TASK-119 runs TASK-024 check-01/02]. Base body kept (passes); the build's assertions
  are deferred to TASK-119 in the ledger.
  - **Round 07: placed, no longer open.** Scan finding S4 and decision R7-5 defer the old assertions to
    TASK-119, which restores them with a name filter (TASK-119:check-02). See "Round 07".
- **The rest-day control's surroundings.** Home draws it as the ruled "Rest day" sub-group of This week (a card
  never holds a card); the gallery scene draws it in a card of its own. The parity check compares the control's
  own stack and the dialog box by box and the surroundings by words, and labels the frame difference with
  TASK-AC-579280C10CDC. A reviewer may prefer another label or a gallery change; changing the gallery scene is
  outside this task's allowance.
- **Exit motion of the rest day.** As in Round 7, the rest-day dialog is unmounted when it closes, so it leaves
  without the shared Dialog's 200 ms exit (reduced motion has none anyway); the feedback dialog plays it. Kept
  as Round 7 had it, because the carried U25 cases need the editor gone and focus on the trigger at once.
- Real-backend runs: the parity spec is synthetic; `.env.runner.local` was not present.

## Next action

Round 07: controller runs the brief's commands on this candidate and reviews the hand diff of
`src/app/Home.tsx` and `src/app/Summary.tsx` against the allowance (TASK-AC-32A027ADF304); then independent
verification and review. TASK-119 restores the recovery case's Focus assertions (TASK-119:check-02). TASK-120
runs `task-045.spec.ts` and `task-019.spec.ts` over these dialogs.

Round 06 (superseded by the line above): "Controller: run the brief's commands on this candidate and review
the hand diff of `src/app/Home.tsx` and `src/app/Summary.tsx` against the allowance (TASK-AC-32A027ADF304).
Decide the recovery-case conflict (TASK-119). TASK-120 then runs `task-045.spec.ts` and `task-019.spec.ts`
over these dialogs."

## CI chain (round 06)

The brief's one command, once, on the final tree (2026-11-19): exit 0. `npm run typecheck` pass;
`npm run lint` 0 errors, 175 warnings (as the base); `npm run lint:ds` pass; `gen-issues --check` pass
(71 requirements, 136 edges); `gen:types --check` current; `npm test` 6,318/6,318 in 269 files (the 8 new
TASK-111 cases included; all 269 files passed in the one run, no rerun); `npm run build` pass; console grep no
match. The run changed no tracked file.
