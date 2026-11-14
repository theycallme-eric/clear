# TASK-021 — Circuit round/Undo and measurement behavior remains intact (#648)

Body `clear-refinement-v2-20261109b`, attempt 1. This is the task-owned progress note, the approved
exception to the shared daily journal for this body. Only TASK-021 writes this file.

## Status

Implementation complete, awaiting controller verification and commit. Base `77aa7f9` (after
TASK-043 #715); `git fetch origin && git rebase origin/build/clear-refinement-2026-11-04` exited 0
("up to date").

## Intended outcome

REQ-021 / C48 (G13; R18, R103, R104, R105; V13), completion owner of JOURNEY-021 on `/workout` and
`/history/:id`:

- AC-C48-01: round recording/Undo, the active round time and the round-time history are kept while
  the presentation is reconciled with the shared logging dialog.
- AC-R021-01: one circuit controller (`src/state/circuit.ts`, `usePersistedCircuit`), original
  scoring (`rounds_completed` = recorded rounds; a taken-back round leaves no count); nothing merged
  into a ladder or another format's state machine.
- AC-R021-02: the recorded-round dialog — X-only aligned header, full-width timer, Take back this
  round, correct rest behaviour.

## Sources read

Brief; RUNNING-SUMMARY; TASK-043 note; accepted reference `gallery-refinement-forms.tsx`
(`circuit-round` context), REUSE.md, LOGGING-FIELDS.md ("Circuit round / take back: recorded round
time, existing rest and Take back this round. No guessed movement actuals."); register R18, R103,
R104, R105; V13-circuit.png; the reviewed R7 code (`code/reviewed-r7/src/ui/circuit-block.tsx`), which
already drew this confirmation as `LoggingOverlay` + "MM:SS round time recorded" + the rest + "Take
back this round".

## Changes (product)

- `src/ui/circuit-block.tsx`:
  - Finish round N now also opens `Round N recorded` in the shared `LoggingOverlay` (portalled to
    `document.body`, as TASK-043's focused logs are). Its header is the overlay's: title plus the
    framed icon-only "Close log" X (TASK-016 alignment). Body, in the R7/V13 order:
    1. "MM:SS round time recorded" (`role="status"`), read back from the stored history entry (digits
       `aria-hidden`, spoken form for AT; "Round recorded" when the round's clock never ran);
    2. while the circuit rests, "Rest after round N" over the shared `DeadlineTimer` (body placement,
       full content width, the circuit's own `circuitRestDeadline` warning);
    3. "Take back this round" (secondary, full width in the shared `.clr-timed-actions` row).
  - The rest is drawn once: while the dialog shows it, the card's timer slot is empty; closed, the
    card draws the same rest again (same stamp; nothing restarted).
  - Lifecycle (UI state only, never persisted): a round recorded into a rest closes its dialog when
    that rest ends (runs out, or the card's existing Start round N ends it early); with no rest
    (none prescribed, or the last round) it stays until closed. X/Escape close it and change nothing.
    Any take back (dialog or card) closes it. A reload comes back to the card, never the dialog.
  - Take back this round = the existing `takeBackRound` (same as the card's Take back a round, which
    is kept). Finish = the existing `finishRound`. No new controller state.
  - Focus: after the dialog closes, if focus was stranded (body / inside the closed dialog), it moves
    to the round clock's own control (Finish round N, or Start round N during a rest).
- `src/dev/gallery-refinement-circuit.tsx` (new) and `src/dev/gallery-refinements.tsx` (one appended
  state `circuit-round` + one import + doc paragraph): the route's own `CircuitBlock` over the
  shell's providers, round 1's clock seeded 32 s before mount in the mount's in-memory storage; set
  observations answered in memory. Deliberate consolidation of the reference's synthetic form.
- `src/dev/gallery-refinement-set-logging.tsx` (TASK-043's file): `MemorySetLogClients` exported
  (one word + comment), reused by the circuit-round state.

Shared owners: `logging-overlay.tsx` adopted unchanged; `deadline-timer.tsx` unchanged;
`timed-result-log.tsx` not applicable (no timed result here); `gallery-refinement-forms.tsx` read,
not changed. No CSS added (inline token gaps `--logging-section-gap` / `--logging-label-gap`, existing
`.clr-timed-actions`). No hotspot CSS/tokens touched.

## Tests

- `src/ui/circuit-block.test.tsx` (check-01, whole file): appended describe
  "TASK-021 the recorded round in the shared focused log" with 7 cases (AC-R021-02 ×5, AC-C48-01,
  AC-R021-01). Existing 32 cases unchanged and passing.
- `e2e/refinement/task-021.spec.ts` (check-02, new): touch 390 journey (record, Take back, re-record,
  X, rest end, rest ending with the log open, optional movement actual via the circuit's half-sheet
  entry, refused block save + retry, History "Rounds 2 of 3" and the 16 kg × 8 actual); keyboard 320
  reduced-motion Signal (Enter/Tab/Shift+Tab/Escape, final-seconds warning still with its one edge
  in the log, reload mid-rest); the gallery `circuit-round` state in clear/vapour/signal/mono at 390.
  Geometry measured in the browser: X frame top vs title top (≤ 2 px), timer frame and Take back
  edges vs the log body content edges (≤ 1.5 px), digits centred (≤ 2 px).
- `evidence/refinement/task-021/required-cases.json` (new).
- `src/app/circuit-rounds.test.tsx` (not a guarded file): the "across a refresh" case wiped
  `document.body.innerHTML`, which removes the portalled dialog under React and made the cleanup
  throw; replaced with testing-library `cleanup()` (same meaning: unmount and remount).

## Earlier tasks' checks / sweep

- No other task's guarded check file was edited. Protected specs touching circuits (task-003 circuit
  Rest entry, task-005 `Start round 1` visibility, `group-exercise-coaching.test.tsx`) do not press
  Finish round, so they are not affected.
- Backend-lane / out-of-repo specs that press Finish round and then act on the card behind the new
  modal: see "Open items".

## Failures and corrections

- `src/app/circuit-rounds.test.tsx` "across a refresh" threw `NotFoundError` after the dialog was
  portalled (the test wiped `document.body`); fixed with `cleanup()` (see Tests).
- First spec runs timed out: `page.waitForFunction` and axe both run on the page's timers, which a
  paused Playwright clock holds still. Fixed by polling the circuit record from the test side, and by
  running each axe scan on a flowing clock that is re-paused exactly 5 s later (`scanPaused`); the
  readings after a scan account for those 5 s. The reload mid-rest likewise runs on a flowing clock
  (boot uses timers), re-paused 15 s after resuming.
- `clear.workout-shell` (the shell's own open-section record) is written alongside the circuit's
  record; the "one controller" assertion now excludes it and checks no other `clear.workout-*` format
  record exists.
- The scratchpad is shared with the parallel task's agent: an early grep read the other agent's log.
  Logs now use `task021-*` names.

## Verification

All on base `77aa7f9`. Every Playwright command ran under
`node /Users/eric/Projects/support-tooling/agent-runner-v2/bin/v2.mjs with-lock --`.

- `node scripts/refinement/run-required-check.mjs --task TASK-021 --check check-01 -- npx vitest run src/ui/circuit-block.test.tsx --passWithNoTests=false`:
  PASSED, 39 total / 39 executed / 39 passed / 0 skipped; 7/7 required.
- `node scripts/refinement/run-required-check.mjs --task TASK-021 --check check-02 -- npx playwright test e2e/refinement/task-021.spec.ts --project=mobile`:
  PASSED, 6/6/6/0; 6/6 required.
- `npx vitest run` (= `npm test`): 270 files, 6375 tests passed.
- `npm run build`: passed. `npm run lint:ds`: clean.
- `npx eslint` on every changed/new `.ts`/`.tsx` file: 0 errors, 0 warnings.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks <every task dir except TASK-039>`:
  PASSED, every receipt current (no other task's check target was edited).
- Sweep of the refinement specs that touch circuits, the shared log, the timer/warning edge or the
  gallery (`task-001, 002, 003, 005, 007, 008, 029, 033 .spec.ts`, `--project=mobile --workers=1`):
  59 passed, 0 failed (6.4 min). Not re-run: other task specs that never reach a circuit's round
  clock (the change is confined to Finish round / the circuit's rest slot and one appended gallery
  state); the backend-lane and B05 specs (cannot run here).
- Screens checked by eye (HTML report in the scratchpad): `Round 1 recorded` at 390 (one-line title)
  and 320 (title wraps to two lines, X stays on the first line's top), timer and Take back across the
  full content width.

## Open items / owner and UAT

- **Rest controls in the dialog (UAT):** the accepted gallery's generic form draws Add 30s / Skip
  rest under every non-note context's timer, including `circuit-round`. LOGGING-FIELDS limits the
  circuit to its *existing* rest, the reviewed R7 confirmation had no rest controls, and the circuit
  controller has no rest extension. So the dialog has none; the rest's existing early end stays on
  the card ("Start round N", one tap after the X). Adding Add 30s would be a controller change — owner
  decision if wanted.
- **Copy (TASK-037):** "Round N recorded", "MM:SS round time recorded", "Round recorded", "Rest after
  round N", "Take back this round" (reference/R7 copy) beside the card's existing "Take back a round".
- **UAT:** each round now costs a dialog; with no rest prescribed the dialog stays until closed (the
  next round's clock runs behind it). Confirm that is wanted for rest-less circuits.
- **Contrast:** readability in the four skins rests on axe (`checkA11y`) only — no per-element
  contrast measurement was added (cross-task rule; TASK-041).
- **Superseded flows in specs that cannot run here (edited, unrun):**
  - `e2e/design-0143/workout-circuit.spec.ts` (backend lane), "JOURNEY-014 … paired footer" case:
    after Finish round 1 it now closes `Round 1 recorded` with its X before tapping the movement's
    Rest (the modal makes the card inert). Its first journey needs no change: its locators read the
    one rest wherever drawn, and the page reload closes the log.
  - `e2e/ui-polish-b05-rest-log.spec.ts` (needs the out-of-repo B05 `.evidence`): the same X close
    after Finish round 1, before the circuit's Rest entry.
  - `e2e/ui-polish-integrated.spec.ts` presses Finish round 1 and lets the ~10 s rest run out, which
    closes the log, before its next tap; left unedited [inferred to still hold].
- Superset and the circuit's optional movement entry stay on the half-sheet (TASK-044).

## Next action

Controller verification and commit.
