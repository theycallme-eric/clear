# TASK-008 — Recovered smooth synchronized countdown warning (#635)

Body `clear-refinement-v2-20261109b`, attempt 1, base `7557b1f` (after TASK-039 #679 and TASK-001 to
TASK-007 #680 to #686). Task-owned progress note: the approved exception to the shared daily journal
for this body. Only TASK-008 writes this file.

## Intended outcome

REQ-008 (C22, C23, C24, C61; G06; R120, R125, R126, R133, R135, R144; P05; AC-C22-01, AC-C23-01,
AC-C24-01, AC-C61-01, AC-R008-01 to AC-R008-04) delivered through `useCountdownUrgency` / the
TimerFrame consumers / the native-dialog portal on the real `/workout` route, its open logging sheet
and native dialogs (JOURNEY-008, completion owner):

- the timer-low colour at 10 seconds left on a live deadline (running or paused);
- in the final five seconds of a running deadline, the timer and one decorative, pointer-transparent
  70 CSS px `--urgency-a400` inset vignette over the whole viewport breathe .2 → .8 → .2 on one
  smooth 1.5 s ease-in-out cycle, in the same phase, across numeric ticks and portal moves;
- count-up caps (For Time, raced ladder) warn on cap − elapsed; EMOM minutes, AMRAP windows,
  movement countdowns, the rest, scheduled-ladder intervals and circuit round rests all warn;
  elapsed-only clocks (session, round elapsed, uncapped race) never do;
- pause and expiry end the breathe and the edge; reduced motion (device or app) and the still policy
  hold a steady .5 with no animation; nothing is recorded.

Accepted gallery reference `eded158cfd928d382c9a9409e2c372270312741d`, stable state
`/gallery/refinements?state=urgency`.

## Shared owner dispositions

- **`src/ui/refinements/countdown-warning.ts`** (accepted owner): **adopted as accepted** —
  `COUNTDOWN_WARNING_THRESHOLDS` `{ colorSeconds: 10, pulseSeconds: 5 }` and
  `countdownWarningState(remaining, running, elapsedOnly)`, same signature and rule (eligible only
  when 0 < remaining; low ≤ 10; urgent while running ≤ 5). Pure; no storage.
- **`src/ui/refinements/deadline-timer.tsx`** (accepted owner, TASK-007's one frame): **extended,
  not duplicated.** It is now the one owner of the warning. New props: `deadline` (the clock's live
  deadline), `lowOutcome` (For Time's "Cap reached" outcome role — never animated), `still` (the
  still-policy preview, used by the gallery only). Removed: `low` and `pulse` (each consumer's own
  threshold and loop claim) and the `.clr-pulse-micro` on the frame. The body carries
  `data-urgent="true"` and the warning's `data-loop` only while urgent; the frame keeps `data-low`.
  DOM is unchanged otherwise (bleed holds the body alone; digits stay the body's first child).
- **`useCountdownUrgency`** (R7's hook, named by REQ-008): **consolidated into `DeadlineTimer`** as
  its internal hook (not exported: a component file exports components only). It claims the view's
  one `urgent` interface loop (`motion.ts`, so a wait beside it is stilled) and a place in one warning
  registry. The warning is one coordinated loop: while any of its claims holds the view's loop (an
  urgent claim outranks every other kind, so always unless motion is reduced), every urgent timer and
  the aura breathe together. The first urgent claim draws the one edge.
  - Deliberate deviation from a strict one-winner reading: two urgent deadlines (e.g. the hold behind
    the log and the rest inside it, or a gallery cue drawn twice) both breathe, pinned to the same
    phase, rather than stilling the second. Stilling it would leave the timer the user is looking at
    (inside the open log) still while the aura breathes — the "competing" look AC-R008-02 forbids. This
    follows the accepted reference, where every urgent timer breathes and the edge is deduplicated.
- **Native-dialog portal**: **adopted from the accepted owner** — the edge portals into the last
  `dialog[open]` (the top layer, above an open native log), otherwise `document.body` at
  `z-index: 20` (above the set-logging sheet layer, z-index 3); a `MutationObserver` on `open`
  attributes moves it. Each new edge element is re-pinned to the document-timeline epoch.
- **TimerFrame consumers** (every `DeadlineTimer` reader), each now passing its deadline from
  `src/state/countdown-urgency.ts`:
  - `MovementCountdownView` (`movement-countdown.tsx`): its own edge portal, `useInterfaceLoop` claim,
    `COUNTDOWN_LOW_SECONDS = 5` and the `.clr-countdown-edge` CSS (hard inset `--border-width` rule +
    stepped micro-pulse) are **retired into the owner** (C24 "one cue", R133 "no hard outline", R135
    "not the four-second stepped micro-pulse"). Colour moves 5 → 10 (C23, R126: "the five-second
    movement baseline is not a reason to omit"); the "Final 5 seconds" milestone stays at the edge.
  - `RestTimerBar` (`workout-chrome.tsx`): `REST_URGENT_SECONDS` replaced by the shared rule (same
    10); the card's `.clr-pulse-micro` and loop claim **retired** (R133, R135). The section's
    `data-urgent` keeps its EXE-05 meaning (the final ten seconds, the fill's colour hook) and "Final
    10 seconds" is unchanged.
  - EMOM `MinuteCountdown`, ladder `IntervalCountdown`, circuit round rest: their `MINUTE_LOW_SECONDS`
    / `INTERVAL_LOW_SECONDS` / inline 10 and their wrapper `data-urgent` + loop **retired** (same
    10 for colour; the pulse is now the 5-second breathe). Wrapper divs kept for layout.
  - AMRAP window: inline 10 + `WINDOW_LOW_SECONDS` and the stack's `data-urgent` + loop **retired**.
  - `ForTimeClock` (For Time and the raced ladder): the wrapper's `.clr-pulse-micro` / `data-urgent` /
    loop **retired**; card role = shared colour ‖ capped; "Cap reached" keeps its outcome role
    (`lowOutcome`), never animated. `for-time.ts`'s `FOR_TIME_URGENCY_SECONDS` (10, the cap line's
    "finish now" words) is unchanged and pinned equal to `colorSeconds` by the state test.
  - `GlobalTimer`, `RoundElapsed`: elapsed-only, unchanged (no deadline passed).
- **Thresholds changed, with dispositions:** movement countdown colour 5 → 10 (C23, R126). Every
  other colour threshold stays 10, now from the one rule. Every pulse moves from "≤ 10 while running,
  4 s stepped" to "≤ 5 while running, 1.5 s smooth, with the edge" (C22, C23, C61, R135, R144).
  Expiry now ends the colour too (accepted rule: eligible only while 0 < remaining): the EMOM's
  `00:00` and a finished movement countdown are neutral (their words — COMPLETE, Countdown done —
  carry the outcome); For Time's "Cap reached" keeps its distinct outcome treatment.
  Paused with ≤ 10 left now keeps the colour (C23: colour on a live deadline; the accepted rule's
  `countdownWarningState(5, false)` is `{ low: true }`); TASK-006's "no urgency" while paused is kept
  for the words and the breathe/edge.
- **`src/state/countdown-urgency.ts`** (new, named by check-01): the per-clock deadline projection —
  `{ remaining, running }` from each existing owner's own view (movement countdown, rest, EMOM
  minute, AMRAP window, race cap, scheduled interval, circuit rest). Not a clock: no wall clock, no
  storage, no write. The rule itself stays in the accepted owner.
- **`src/ui/refinements/tokens.css`**: the six accepted `--countdown-warning-*` variables, exact
  values (70px, 1.5s, ease-in-out, .2, .8, .5). Header updated to the reference's wording ("exact
  owner-selected effect values").
- **`src/ui/refinements/presentation.css`**: the accepted `.clr-deadline-edge` and
  `clr-deadline-breathe`, with the timer and the edge on one shared animation rule; static `.5` as the
  urgent base; `animation: none` under `prefers-reduced-motion` and `html[data-reduce-motion]`.
- REUSE.md: one owner, no route look-alike; the gallery draws the actual consumers.
  LOGGING-FIELDS.md: no field, reason or writer added or moved.
- Not changed, deliberately: `src/dev/gallery-motion.tsx`'s Motion Lab "Low timer · 00:05" loop
  specimen (the pinned lab's demonstration of loop ranking with the vendored `clr-pulse-micro`; no app
  timer uses that pulse now) and `app-motion.css`'s still rule (still covers the vendored loops).

## Owner-decision exception (EXC-07) — please confirm

The approved C22/AC-R008-01 values conflict with two existing repository guards: DS-06
(`src/test/easing-vocabulary.test.ts`: no named easing curve outside the vendor) and the
shipped-keyframes rule (`src/test/design-system-097-deprecations.test.ts`: no local `@keyframes`).
The accepted gallery reference violates both (it only ran 165 focused tests). Meeting C22 exactly
needs `ease-in-out` and a keyframe the package does not ship. I recorded **ledger EXC-07** and pinned
both guards exactly, rather than relaxing them or dodging them with a `linear()` approximation:
DS-06 allows only `--countdown-warning-easing: ease-in-out;` once in `tokens.css`; the keyframes rule
allows only `clr-deadline-breathe` declared once in `presentation.css` on the tokens. Every other file
is still scanned and mutation checks (a second curve, a second keyframes, the breathe used elsewhere)
fail. Citation: C22, C61; R133, R135 ("the four-second stepped micro-pulse is explicitly not this
effect"), R144.

## Changes

- New: `src/ui/refinements/countdown-warning.ts`, `src/state/countdown-urgency.ts`.
- Owner/recipe: `deadline-timer.tsx`, `presentation.css`, `tokens.css`; `motion.ts` (comment).
- Consumers: `movement-countdown.tsx`/`.css`, `state/movement-countdown.ts` (constant removed),
  `workout-chrome.tsx`, `emom-block.tsx`, `amrap-block.tsx`, `for-time-block.tsx`, `ladder-block.tsx`,
  `circuit-block.tsx`.
- Gallery: `?state=urgency` retitled "Countdown warning and whole timer frames · countdown, cap and
  elapsed clocks"; its static "format countdown in its low state" became `GalleryDeadlineWarning`
  (memory-only deadline: Inspect 10/5, Run/Pause, count-up cap, "Open log over the warning" in a
  native `AppDialog` drawing the same cue, "Still preview"). The clock multiset TASK-007's gallery
  case reads is unchanged (the dialog's cue renders only while open). Register `DeadlineTimer`
  summary/specimen updated; `COMPONENTS.md` regenerated (67 entries).
- Ledger EXC-07; `PROJECT_MAP.md` refinements row.
- Evidence: `evidence/refinement/task-008/required-cases.json` (check-01: 13 vitest cases; check-02:
  5 Playwright mobile cases); receipts written by the guard.

## Tests added and changed

- New `src/state/countdown-urgency.test.ts` (check-01, 6 cases; AC-C23-01, AC-C24-01, AC-R008-03):
  the accepted rule at 11/10/6/5/4/1/0 and unusable readings; every countdown family through its own
  owner; count-up caps on cap − elapsed (For Time, raced ladder; words and colour agree on 10); pause,
  resume, expiry, finish and the cap; elapsed-only neutral; no storage write, nothing started.
- New `src/ui/countdown-urgency.test.tsx` (check-01, 7 cases; AC-C22-01, AC-R008-03, AC-C23-01,
  AC-C24-01, AC-C61-01, AC-R008-04, AC-R008-02): the recipe and tokens; the real route's hold through
  10/5/pause/resume/expiry; EMOM minute and For Time cap on the route; one edge for two urgent
  deadlines, into the abandon dialog and back, nothing recorded and no storage write; phase pinning
  (startTime 0) on start, ticks, portal moves and resume; reduced motion; the gallery state.
  - Mutation checks (each restored byte for byte): colour 10 → 9 (6 cases failed); edge while
    paused (6); edge never re-pinned in a dialog (1, AC-C61-01); edge always on body (3); one edge per
    urgent timer (2); hard outline instead of the vignette (1, AC-C22-01).
- New `e2e/refinement/task-008.spec.ts` (check-02, 5 cases, contained synthetic lane, Playwright
  clock for the app's clocks, the browser's real document timeline for the breathe): hold through
  10/5 with 13 live samples over > 3 s (> 2 cycles) and ticks 05 → 02 — edge and timer at the same
  `currentTime`, same opacity (≤ 0.001), `startTime` 0, the same two animations throughout, ≥ 6
  distinct opacities in .2–.8; pause/resume/expiry; open log + abandon dialog (edge topmost at six
  points via a probe that briefly makes the decorative edge hit-testable, covers the viewport, host
  moves body → dialog → body, same phase); keyboard EMOM minute and For Time cap (pause/resume/cap);
  reduced motion at 320 (static .5, no animation, edge covers 320 × 568); the gallery state with no
  network. Captures attached: `hold-colour-10`, `hold-edge-5`, `log-open-edge`, `dialog-edge`,
  `cap-edge-5`, `reduced-motion-edge-phone-320`, `gallery-urgency-{edge,log,still}`; JSON
  `phase-samples-hold-phone-390`.
- Updated, superseded by approved criteria (each cites TASK-008 and the criterion in place):
  - `src/app/movement-countdown.test.tsx` AC-053 section: colour at 10, the shared soft edge at 5, no
    countdown-own edge CSS (C22, C23, C24, C61; R126, R133, R135).
  - `src/ui/workout-chrome.test.tsx` RestTimerBar: no card pulse; new "breathes with the one soft
    screen edge in its final five seconds"; loop handover at ≤ 5; reduced motion at 5 (C22, C23, C61).
  - `src/app/Workout.test.tsx`: rest still/low/loop/reduced cases; "coordinates a low AMRAP window /
    Circuit round rest" → "…urgent … one warning, one edge" at 5 s; abandon from an urgent rest also
    leaves no edge (C23, C24, C61).
  - `src/ui/emom-block.test.tsx`: section renamed "the countdown takes the shared countdown warning"
    (9 cases; adds the final-five breathe + edge and pause); refresh case reads `data-low` (C23, C24,
    C61; R126).
  - `src/ui/for-time-block.test.tsx`: "turns urgent…" and the low-state section (C22, C23, C24, C61).
  - `src/ui/amrap-block.test.tsx`: "leaves urgency to the timer's own shared warning" (C22, C23, C61).
  - `src/ui/exercise-coaching.test.tsx`: the raised rest is 5 s ("Raise urgent rest"); what runs is
    the warning (C23, C61).
  - `src/test/easing-vocabulary.test.ts`, `src/test/design-system-097-deprecations.test.ts`: EXC-07
    pins (above).
  - Backend lane (cannot run here; typecheck and `--list` load): `e2e/design-0143/workout-lifecycle.spec.ts`
    (`timerProbe` low = frame `data-low`, pulse = the timer's own `clr-deadline-breathe`; new
    `expectWarningBreathe`; EMOM urgent moments moved 8 s → 4 s; rest coaching-loop shot moved to 4 s;
    `loops().running` = `['Time remaining', 'clr-deadline-edge']`; evidence note texts), `workout-emom`,
    `workout-ladder` (frame `data-low`; ladder at 5 s also asserts `data-urgent` + one edge),
    `workout-amrap` (frame `data-low`), `e2e/ui-polish-b05-movement-countdown.spec.ts` (`data-loop` on
    the timer itself; one comment).

## Sweep (every spec and test under `e2e/` and `src/`)

Searched for: `clr-pulse-micro`, `clr-micro-pulse`, `clr-countdown-edge`, `data-countdown-edge`,
`COUNTDOWN_LOW_SECONDS`, `*_LOW_SECONDS`, `REST_URGENT_SECONDS`, `FOR_TIME_URGENCY_SECONDS`,
`data-urgent`, `data-loop`, `timer-low`, `Final 5 seconds`, `Final 10 seconds`, `finish now`,
`expectLowState`, `timerProbe`, `loops(`, `steps(2`, `0.4s`, `getAnimations`, `xpath=..`.

- Fixed: the files above.
- Checked, not superseded:
  - `timerProbe`'s first `aria-hidden` child is still the digits with the inline 0.4 s `steps(4)`
    colour crossing (kept: it is the colour change, not the pulse); card depth unchanged; no glow.
  - `e2e/design-0143/task-040-lifecycle-gaps.spec.ts` (rest section `data-urgent="false"` after
    Add 30s) and `task-040-lifecycle.spec.ts` ("Final 10 seconds"): the rest section's attribute and
    words keep their meaning.
  - `e2e/core-loop.spec.ts`, `accessibility.spec.ts`, `workout-formats.spec.ts`: name/text reads only.
  - `e2e/gallery-motion.spec.ts`: the Motion Lab's own loop specimen, unchanged.
  - TASK-006/TASK-007 targets (`timed-workout-flow.test.tsx`, `timed-clock.test.ts`,
    `timer-frame-layout.test.tsx`, `e2e/refinement/task-006.spec.ts`, `task-007.spec.ts`): not edited;
    re-run through their guards (below).
  - `src/test/design-0143-final-audit.test.ts`: not modified; no driver file
    (`FORMAT_DRIVER_FILES`) edited.

## Failures and corrections

- First design stilled every urgent timer but the loop winner (strict one-loop reading). With a log
  open, the timer the user sees would sit still while the aura breathes. Corrected to one coordinated
  warning loop (above).
- First full unit run after the owner change: 34 expected failures across the eight files above, plus
  the ledger citing not-yet-written tests; all addressed as superseded, none deleted or skipped.
- jsdom resolves no `var()` in computed styles and runs no CSS animation: the still case asserts the
  token, and phase pinning is observed on the animations the browser would return
  (`getAnimations` stub); the real breathe is sampled in the browser.
- e2e: under reduced motion `a11y.css` collapses every transition to 0.01 ms, so the urgent body's
  1 → .5 change is a transition that had not had a frame; the case now waits for the settled value.
- e2e: the DS Dialog's 200 ms exit runs on the page clock, which the spec holds; the spec now passes
  a second (or half) after a dismissal. The gallery has three other "Block time" specimens; the still
  check targets the urgent one.
- e2e: one run raced a probe right after Resume (before React committed the edge); every post-action
  probe now waits on the observable state first. Two consecutive full runs then passed 5/5.
- `lint:ds` flagged "70px" inside the registry summary string (raw px literal); reworded.
- React compiler lint: a ref written during render in the warning hook; replaced by two layout
  effects (presence, then loop state) with the same claim order.

## Verification (this worktree, uncommitted candidate, 2026-11-09)

- `npm ci`: exit 0.
- `node scripts/refinement/run-required-check.mjs --task TASK-008 --check check-01 -- npx vitest run src/state/countdown-urgency.test.ts src/ui/countdown-urgency.test.tsx --passWithNoTests=false`:
  PASSED. Native 13 total, 13 executed, 13 passed, 0 failed/skipped/todo.
- `node scripts/refinement/run-required-check.mjs --task TASK-008 --check check-02 -- npx playwright test e2e/refinement/task-008.spec.ts --project=mobile`:
  PASSED. Native 5 total, 5 executed, 5 passed, 0 failed/skipped/todo (synthetic origin; no
  credentials used). Also two consecutive direct runs 5/5 before the guard runs.
- Live phase samples (direct JSON-reported run of the first journey case, attachment
  `phase-samples-hold-phone-390.json`): 13 samples over 3,467 ms of the document timeline (~2.3
  cycles), digits 00:05 → 00:02; edge and timer opacity identical at every sample (0.2012 … 0.7883)
  and their `currentTime`s equal (5741 … 9208 ms, both `startTime` 0).
- `npm run build`: exit 0 (`tsc --noEmit` over `src` and `e2e`, then Vite). `npm run lint:ds`: exit 0.
  `node scripts/gallery-index.mjs --check`: 67 verified.
- `npm test`: 261 files, 6171 tests passed, 0 failed.
- `npx eslint` per touched file against `git show HEAD:<file>`: no new error or warning in any file
  (`gallery-registry.tsx` 137 → 137 warnings, `ladder-block.tsx` 2 → 2; the rest 0).
- `npx playwright test <every non-B05 spec> --list --project=mobile`: 427 tests in 58 files (TASK-007:
  422 in 57; +5 is this spec). Each B05 spec listed alone: all load except
  `ui-polish-b05-review-groups`, `-structure-badges`, `-summary-facts`, which stop at an import-time read
  of an out-of-repo `.evidence/` reference image — identical on base `7557b1f` (checked in a scratch
  `git worktree` outside the workspace, then removed). `ui-polish-b05-movement-countdown.spec.ts`
  (edited): 10 tests. Edited backend specs: 10 tests in 4 files.
- Earlier tasks' browser specs run directly: `e2e/refinement/task-001` to `task-005.spec.ts`, 31/31
  passed.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,TASK-002,TASK-003,TASK-004,TASK-005,TASK-006,TASK-007,TASK-008`:
  PASSED, exit 0; every task "current passing receipts"; accepted-gallery 1193 files verified.
- Mutation checks: see Tests (six on check-01, three on the EXC-07 guard pins; all caught, all
  restored byte for byte and confirmed with `cmp`).
- Not run here: backend-lane specs (`e2e/design-0143/*`, `e2e/core-loop.spec.ts`) need
  `.env.runner.local`; the edited ones typecheck and load under `--list`.

## Earlier-task receipts

- **TASK-006 and TASK-007: refreshed by genuinely re-running their exact approved guard commands**
  (no file of theirs edited; their manifests untouched). This task changes what their checks render:
  the EMOM, AMRAP, For Time and ladder renderers (TASK-006) and every `DeadlineTimer` consumer and the
  `?state=urgency` gallery state, retitled and with its static low specimen replaced by the warning
  demonstration (TASK-007). Results: TASK-006 check-01 9/9, check-02 7/7; TASK-007 check-01 13/13,
  check-02 7/7, all PASSED. The receipts are deterministic, so the refreshed files are byte-identical
  to the committed ones (`git diff -- evidence/` touches only `evidence/refinement/task-008/`).
- TASK-001 to TASK-005: not refreshed. Their targets are untouched and this change does not alter
  what they assert (the added CSS rules match no element they read); their vitest targets passed in
  `npm test` and their browser specs passed directly (31/31).

## Open assumptions / unresolved

- EXC-07 (above) is an implementation of the owner's explicit C22 values against two older guards;
  it is recorded and pinned, and flagged for the controller/owner to confirm.
- At this base the open log is the set-logging sheet (an overlay layer, not a native dialog). The edge
  is proven above it by stacking (z-index 20 over 3, topmost hit test) and above a real native dialog
  on the route (the abandon confirmation) and in the gallery (`AppDialog` "Log set"). When the
  Balanced native logging overlay lands (TASK-016/041), the same portal follows it.
- Two simultaneous urgent deadlines both breathe in one phase (see `useCountdownUrgency`).
- Expiry neutralises the colour for EMOM/movement/interval/circuit (accepted rule); For Time's "Cap
  reached" keeps its outcome role.
- The gallery's Motion Lab low-timer loop specimen still shows the vendored micro-pulse (lab
  demonstration, not a timer consumer).

## Next action

Controller verification and commit.
