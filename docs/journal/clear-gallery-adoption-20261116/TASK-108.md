# TASK-108 — A3 task 8 (F6): section navigator access, workout header, timer frames and the pause-aware countdown warning (#731)

Body `clear-gallery-adoption-v2-20261120` (round 07), attempt 1, branch `v2/clear-gallery-adoption-v2-20261120/task-108-a1`,
integration branch `build/clear-gallery-adoption-2026-11-13`, base `debdeaf4` (TASK-117 merged). Source material only:
the old build `build/clear-refinement-2026-11-04` (`181e580`). This is the task-owned progress note; it satisfies the
shared daily journal rule for this body. Only TASK-108 writes it.

Path note: the brief's rules name this folder (`clear-gallery-adoption-20261116`); the issue body names
`clear-gallery-adoption-20261113`. The brief's path is used, as TASK-103 to TASK-117 did.

## Status

Attempt 1 implemented and committed. The two plan conflicts it raised (C1, C2) were decided by the owner on
2026-11-23 and applied; see "Owner decision (2026-11-23)". Nothing pushed.

## Intended outcome

- JOURNEY-027 (completion owner) on `/workout`: Round 7's compact "All sections N / M" bar keeps position and status
  for assistive technology without a second heading, and Previous, Next and a jump move focus to the opened section's
  first card with a temporary tabindex, falling back to its heading; a jump records and resets nothing.
- JOURNEY-007 (completion owner): every real-route clock is one whole Round 7 TimerFrame; the workout header keeps
  TASK-007's one-row rules at 380 px (23.75rem) and below; each clock keeps its own reading and pause/cap arithmetic.
- JOURNEY-008 (completion owner): every clock's warning reads its own deadline through the per-clock adapters into
  Round 7's `useCountdownUrgency` — colour at 10, the breathe and one edge at 5 while running, a paused clock keeping
  the colour and losing the breathe and the edge, elapsed-only clocks neutral; the timer and the aura breathe on one
  smooth 1.5 s cycle and one phase; two urgent deadlines show one warning loop and one edge.

## Changes

Product (every file below except `workout-navigation.css` is gallery-owned — `git diff --name-only 1633333c^ bec4454`
lists it — and each change is named by a criterion; the parity receipts list them under `galleryChanges`):

- `src/ui/countdown-urgency.tsx` (TASK-AC-ED9D1944F3CE, AC-R008-02, AC-C61-01, AC-C24-01): `useCountdownUrgency` takes
  the clock's `CountdownDeadline` (from its adapter). One shared warning: each urgent clock claims the view's one
  `urgent` loop, every urgent timer breathes while any claim runs (Round 7 stilled a second urgent timer), the first
  claim draws the one edge (portalled into the topmost open dialog, as before), and each new breathe — a timer, the
  edge moved into or out of a dialog, a resume — is pinned to the document timeline's epoch.
- `src/ui/countdown-urgency.css` (AC-R008-01, AC-C22-01): the urgent timer (`.clr-countdown-breathe`) and the edge
  breathe on one rule (`clr-deadline-breathe` 1.5 s ease-in-out .2/.8/.2, the one EXC-07 use), a steady .5 when still,
  under reduced motion or the app's own choice. This replaces the four-second stepped micro-pulse on urgent timers.
- `src/ui/workout-chrome.tsx`: TimerFrame carries the breathe on its `role="timer"` element (class, `data-urgent`, the
  warning loop) instead of `clr-pulse-micro` on its wrapper; RestTimerBar feeds `restDeadline`; CountdownBar takes an
  optional deadline (preparation keeps its `running` prop), its card's low role, fill colour (`data-urgent`) and
  "Final 10 seconds" from ten seconds, the breathe on the rest's timer (not the card) at five; the compact
  SectionHeader adds a visually hidden "Section N / M · status" and marks the visible "N / M" `aria-hidden`, so the
  trigger's one name is "All sections" (TASK-AC-A5D62CC0272B). Nothing visible changes in the navigator.
- `src/state/countdown-urgency.ts`: the adapters take only the fields of a view they read (`Pick<…>`), so the route's
  `TimedWorkoutFlow` feeds its attempt through them. No behaviour change.
- `src/ui/timed-workout-flow.tsx`: the clock's urgency through `emomMinuteDeadline`, `amrapWindowDeadline` and
  `raceCapDeadline` (held while paused, none once ended).
- `src/ui/movement-countdown.tsx`: through `movementCountdownDeadline`.
- `src/ui/circuit-block.tsx`, `src/ui/ladder-block.tsx` (TASK-AC-23D0ADE293F8): the circuit's round rest and a
  schedule's interval — the route's two remaining `CountdownDisplay` clocks — now draw Round 7's TimerFrame (full
  width, `heading-h3` digits, the package TimerDisplay's size) fed by `circuitRestDeadline` / `scheduleIntervalDeadline`;
  the package TimerDisplay micro-pulsed for its whole final ten seconds, paused or not.
- `src/ui/timer-display.tsx`: `CountdownDisplay` takes an optional deadline; its drawing is unchanged (it stays the
  gallery catalogue's specimen and the countdown of EmomBlock/AmrapBlock, which the route never draws — keeping it
  unchanged leaves TASK-110's base bodies over EmomBlock passing).
- `src/ui/for-time-block.tsx`: the hook's new signature, same behaviour (`raceCapDeadline` only while running).
- `src/app/Workout.tsx` (TASK-AC-DCFC4C79B85A): `firstCardAfter` + the temporary-tabindex focus move (the build's,
  skipping a clock's own timer card), falling back to the section's heading.
- `src/ui/workout-navigation.css` (TASK-AC-8E1E91D4F4AA; not gallery-owned): TASK-007's header rules replace task 1's
  `flex-wrap: wrap` — one row, title column `flex: 1 1 auto; min-width: 0`, the meta/menu cluster `flex: none`, and at
  `max-width: 23.75rem` (380 px; the file's test forbids px) the title takes `--heading-h3-size` on its own line height.

Tests and specs (every inherited body is in `evidence/refinement/task-108/test-ledger.json`):

- `src/ui/countdown-urgency.test.tsx` (new, 7) and `src/ui/timer-frame-layout.test.tsx` (new, 6): the build's suites
  rewritten onto Round 7's owners; four case names changed where the build's wording described its own look or
  gallery controls (AC-R008-02, AC-R007-01, AC-R007-02; the TASK-027 gallery case below) — TASK-007/008/027 manifests
  updated to match, with descriptions naming Round 7's owners.
- `src/ui/workout-chrome.test.tsx` (owned whole): the build's RestTimerBar bodies and TASK-027 block restored
  (TASK-027 rewritten: no navigator heading; the gallery case reads the SectionHeader specimen); one GlobalTimer body
  retired as superseded; the SectionHeader structure-identity body deferred to TASK-110 (S3, R7-5).
- `src/app/workout-footer-nav.test.tsx`, `src/app/movement-countdown.test.tsx` (owned whole): build bodies restored or
  rewritten; one retired as superseded.
- `src/app/Workout.test.tsx` (TASK-110's): this task's 13 bodies — the navigator block (S5's compact-navigator body
  restored beside Round 7's), the focus moves and the rest warning; one retired as superseded.
- `src/ui/emom-block.test.tsx` (11), `src/ui/amrap-block.test.tsx` (2) (TASK-110's) and `src/ui/for-time-block.test.tsx`
  (9, owned whole): ported onto the route's dispatch (R7-2); the superseded base bodies removed.
- `src/ui/exercise-coaching.test.tsx` (TASK-109's): two base reads moved from the rest card's pulse to the rest's timer
  (C1; first committed provisionally on its own, kept as final under the owner's 2026-11-23 rule).
- `e2e/refinement/task-007.spec.ts`, `task-008.spec.ts`, `task-027.spec.ts`: rewritten onto Round 7 (three gallery
  cases renamed; manifests updated).
- `e2e/refinement/task-108-parity.spec.ts` (new, 8 cases): cards, urgency, emom/amrap/for_time (ended) and the
  navigator at 320 and 390; captures in the evidence store under
  `clear-gallery-adoption-v2-20261120/task-108/captures/`.
- Evidence: `evidence/refinement/task-108/required-cases.json` (check-01 143 declared, parity 8), `test-ledger.json`,
  `parity/*.json`, `results/*.json`.

Not changed: `docs/design/CLEAR-0.14.3-RECONCILIATION-LEDGER.md` (no exception needed: no new keyframes, no
hand-assembled frame), `src/dev/**` (the gallery states draw the live components, so they show the change in the same
commit), `src/ui/preparation-guide.tsx` (TASK-109's), `PROJECT_MAP.md` (no new boundary).

## Failures and corrections

- At base all ten check-01 files passed (274) but `countdown-urgency.test.tsx` and `timer-frame-layout.test.tsx` were
  absent and the TASK-007/008/027 e2e specs failed 16/16 (they read the build's DeadlineTimer DOM).
- Moving `CountdownDisplay` itself to TimerFrame broke a TASK-110-placed base body over EmomBlock ("restores the
  countdown and its end-of-minute cue …"). Corrected: CountdownDisplay keeps its drawing; the route's two consumers
  draw TimerFrame directly.
- The breathe first sat on TimerFrame's wrapper; the build's bodies read it on the `role="timer"` element and expect
  every urgent timer as `[role=timer][data-urgent=true]`. Moved to the timer element.
- `workout-footer-nav.test.tsx` forbids `\d+px` in workout-navigation.css (comments included): breakpoint written as
  `23.75rem`.
- jsdom drops `flex: 1 1 0`; that read was left to the browser specs.
- e2e: Round 7's log dialog exits on the page clock, which the specs hold still; a 0.3 s step (inside the same whole
  second of every reading) lets it leave before the next tap. A `pauseAt(Date.now())` in Node time jumped the page
  clock days ahead; the gallery case no longer pauses and accepts each moment's warning band.
- Plan conflicts found: C1 (exercise-coaching base bodies), C2 (ForTimeBlock's cap words). Both were held for the
  owner in attempt 1 and decided on 2026-11-23 (see below).

## Verification

All browser runs were under the host lock (`node /Users/eric/Projects/support-tooling/agent-runner-v2/bin/v2.mjs
with-lock -- <command>`). No other task's parity spec was run. Run on 2026-11-22/23 on the working tree that was then
committed (no source change after these runs except this note and the ledger text).

| Check (brief's command) | Result |
|---|---|
| `npm ci` | exit 0 (at the start) |
| TASK-108 check-01 (ten files) | PASSED, 287 executed, 287 passed; 143 declared |
| TASK-007 check-01 (`timed-clock`, `timer-frame-layout`) | PASSED, 13/13 |
| TASK-007 check-02 (`task-007.spec.ts`) | PASSED, 7/7 |
| TASK-008 check-01 (`countdown-urgency` state and ui) | PASSED, 13/13 |
| TASK-008 check-02 (`task-008.spec.ts`) | PASSED, 5/5 |
| TASK-027 check-01 (`workout-chrome`) | PASSED, 44/44 |
| TASK-027 check-02 (`task-027.spec.ts`) | PASSED, 4/4 |
| TASK-108 parity (`task-108-parity.spec.ts`), run 1 | PASSED, 8/8; zero text and zero layout differences in every moment |
| TASK-108 parity, run 2 | PASSED, 8/8; all 8 receipts and `results/parity.json` byte-identical to run 1; all 60 captures hash-identical (`shasum -a 256`) |

CI commands: `npm run typecheck` exit 0; `npm run lint` 0 errors, 175 warnings (as at base); `npm run lint:ds` exit 0;
`python3 scripts/gen-issues.py --check` (71 requirements, 136 edges); `npm run gen:types -- --check` current;
`npm test` 273 files, 6,388/6,388; `npm run build` pass; console grep no match.

Other tasks' checks on files this task changed (their receipts hash these targets), re-run once through the guard and
refreshed: TASK-104 check-01 PASSED 172/172 (amrap-, emom-, for-time-block); TASK-116 check-02 PASSED 4 executed of
45 (its `TASK-009` filter on amrap-block). `verify-delivery-evidence.mjs --mode final --body clear-refinement-20261103
--tasks TASK-104,TASK-116,TASK-007,TASK-008,TASK-027,TASK-108`: current passing receipts for all six.
`src/ui/exercise-coaching.test.tsx` is no task's check target yet (TASK-109's check-01 will run it whole).

## Owner decision (2026-11-23)

Decision: Eric, chat, 2026-11-23: "Yes, approve" — approving the rule "tasks may update old tests to match Round 7's look and wording, and each change gets listed for your UAT. A test that expects behaviour or saved data Round 7 doesn't have would still stop the build. That approval covers both TASK-108 issues."

Applied in new commits on `82aa20f3` (no product change):

- **C1 (final).** `src/ui/exercise-coaching.test.tsx`: the re-pointed reads stay; the comment no longer says
  provisional and cites the rule (TASK-109 still owns the file and restores the build's TASK-008 bodies). The ledger
  records both bodies as rewritten under the decision.
- **C2.** The seven withheld cap-word checks now read what Round 7 shows at that moment — the race clock's "Elapsed"
  reading and the cap its card states in its meta line (`15 MIN CAP`, `8 MIN CAP`); where Round 7 has no equivalent,
  the "— finish now" wording alone is dropped. Old → new:
  1. `countdown-urgency.test.tsx` AC-C23-01: "Cap in 00:10 — finish now" → "Elapsed" (14:50) + `15 MIN CAP`; "finish
     now" dropped.
  2. `timer-frame-layout.test.tsx` AC-C21-01: "Cap in 14:30" ×2, "Cap in 14:20" → "Elapsed" (00:30, 00:30, 00:40) +
     `15 MIN CAP` at each point; the warning-timing cap arithmetic kept.
  3. `for-time-block.test.tsx` "turns urgent in the last ten seconds …": "Cap in 00:07 — finish now" → "Elapsed"
     07:53 + `8 MIN CAP`; "finish now" dropped.
  4. `for-time-block.test.tsx` "is not low, and claims no loop …": "Cap in 00:11" → "Elapsed" 07:49 + `8 MIN CAP`.
  5. `for-time-block.test.tsx` "is still under reduced motion …": "Cap in 00:04 — finish now" → "Elapsed" 07:56 +
     `8 MIN CAP`; "finish now" dropped.
  6. `e2e/refinement/task-007.spec.ts` touch phone-390: "Cap in 14:30" ×2, "Cap in 14:20" → "Elapsed" (00:30, 00:30,
     00:40) + `15 MIN CAP` at each point; the warning-timing arithmetic kept.
  7. `e2e/refinement/task-008.spec.ts` keyboard phone-390: "Cap in 00:10 — finish now" → "Elapsed" (14:50) +
     `15 MIN CAP`; "finish now" dropped.
  None expects behaviour or saved data Round 7 lacks: elapsed and cap carry the time left, and "finish now" is
  wording.
- **Ledger.** `rules.pendingOwnerDecision` replaced by `rules.ownerDecisions` (both resolved, with the quote);
  `rules.capWordChecks` lists the seven old → new; `rules.retiredAssertions` the four "— finish now" drops;
  `matchersWeakened: false` with the reason (no matcher loosened; the only removed wording is the approved drop);
  `rules.forTask115` lists every change for UAT, including "For Time near the cap shows no 'finish now' words; the
  warning is colour, edge and breathing only."

Verification after the decision (browser runs under the host lock; through the guard):

| Check | Result |
|---|---|
| TASK-108 check-01 | PASSED, 287/287 |
| TASK-007 check-01 / check-02 | PASSED, 13/13 / 7/7 |
| TASK-008 check-01 / check-02 | PASSED, 13/13 / 5/5 |
| `npx vitest run src/ui/exercise-coaching.test.tsx` (TASK-109's file alone) | 23/23 |
| TASK-104 check-01 (its for-time-block target changed; receipt refreshed) | PASSED, 172/172 |
| CI chain as one command | exit 0: lint 0 errors / 175 warnings; `npm test` 273 files, 6,388/6,388; build ok; console grep no match |
| `verify-delivery-evidence.mjs --mode final` for TASK-007, 008, 027, 104, 116, 108 | current passing receipts for all six |

TASK-108's parity was not re-run: no product file, parity spec or manifest changed, and its receipts stay current.

## Open

1. **Look changes from the accepted gallery (labelled, for UAT).** An urgent timer now breathes .2/.8/.2 with the
   edge on the 1.5 s cycle instead of the stepped four-second 1 → .8 micro-pulse (AC-R008-01/02, C61), and holds a
   steady .5 under reduced motion; the rest's fill turns the low colour at ten seconds (was five); the circuit's round
   rest and a schedule's interval are TimerFrames.
2. **UAT list (ledger `rules.forTask115`).** For Time near the cap shows no "finish now" words; the warning is colour,
   edge and breathing only. The cap is "Elapsed" + the card's `N MIN CAP`, not "Cap in MM:SS". The C1 re-point in
   exercise-coaching. The three "one whole frame with no card" bodies retired as superseded. The renamed cases. The
   320 px Start scroll-anchoring note from TASK-104's review (not in this task's criteria).
3. Real phones and WebKit untested (Chromium and jsdom only).

## Next action

Controller: V2 verify and review.
