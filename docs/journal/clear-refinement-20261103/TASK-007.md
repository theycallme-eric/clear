# TASK-007 — Whole timer frames and independent functional clocks (#634)

Body `clear-refinement-v2-20261109b`, attempt 1, base `182d71e` (after TASK-039 #679 and TASK-001 to
TASK-006 #680 to #685). Task-owned progress note: the approved exception to the shared daily journal
for this body. Only TASK-007 writes this file.

## Intended outcome

REQ-007 (C19, C20, C21; G06; R15, R17, R42, R49, R53, R67, R96, R98, R102, R103, R119; AC-C19-01,
AC-C20-01, AC-C21-01, AC-R007-01, AC-R007-02, AC-R007-03) delivered on the real `/workout` route and
its open logging sheet (JOURNEY-007, completion owner).

## Status

Candidate complete; both delivery checks passed through the guard. Awaiting controller
verification and commit.

## Current observations (base `182d71e`, synthetic lane, phone 390)

- Header: `GlobalTimer` is a hand-assembled timer card (EXC-03 `TimerFrame`): an accent-bar strip
  drawn as a second inner chamfer at the left of the readout; body 81 × 33 inside a 91 px bleed; the
  menu is 40 × 40. `.clr-workout-header { flex-wrap: wrap }` lets the timer/menu cluster drop to a
  second row when the title does not fit (an unapproved two-row state, C20/R119).
- EMOM minute, AMRAP window and scheduled-ladder interval: the shipped `TimerDisplay` body is
  108–154 px wide inside a 358 px bleed stretched by its flex-column parent: the R42/R49 "short
  inner chamfer inside an empty wider outer frame".
- For Time / raced ladder clock and the rest (footer and open log): the digits are a 68 px readout
  beside a label inside a timer card, not a frame (R102/R103).
- Movement countdown on a card already fills its card's width (element frame, no bar).
- Accepted reference (`eded158c…`, rendered from the staged copy in a scratch directory outside the
  workspace): `?state=cards` header = title | one-chamfer timer 92 × 40 | menu 40 × 40, all on one
  40 px row; `?state=urgency` timers = one chamfer frame 358/358 wide, digits centred, no bar.

## Shared owner dispositions

- **`src/ui/refinements/deadline-timer.tsx`** (accepted owner): **adopted and consolidated** with the
  app's former `TimerFrame` (EXC-03, `workout-chrome.tsx`) and with every position that drew the
  shipped `TimerDisplay` (EMOM minute, AMRAP window, scheduled-ladder interval, circuit round rest).
  `DeadlineTimer` is now the one whole timer body: `.clr-bleed.clr-accepted-timer` holding one
  `.clr-chamfer.clr-chamfer--md.clr-accepted-timer__body` on the timer role, no card, no accent-bar
  strip, no second chamfer; `body` placement fills its place, `header` placement is the compact
  readout at the menu's control height. Wrapped in the existing `ForegroundEchoFrame` exactly as the
  accepted owner is (the Echo policy decides; inside a card, dialog or sheet it is a no-op).
  - Kept from the app, deliberately, over the reference: the accessible contract (named once by its
    label, not live, value in words in `.a11y-hidden`; the reference put the digits into
    `aria-label`, which would rename every timer and break every `getByRole('timer', { name })`
    consumer); the tumbling digits with their inline colour/stepped `--dur-alert` crossing; the
    inline `--bleed` per role; each consumer's existing digit size (movement countdown and AMRAP
    `--heading-h1-size` — the AMRAP's shipped `lg` was a raw 40 px, h1 is the nearest token — session
    `--label-lg-size`, rest and race `--label-xl-size`, and the EMOM minute, interval and circuit rest — the shipped `TimerDisplay` md, 24 px — the recipe's `--heading-h3-size`, 24 px at phone).
  - **Not adopted here, by scope:** the reference's `EdgeCue`, claims de-duplication,
    `clr-deadline-breathe` keyframes, `data-urgent`/`data-still` animation and `reducedMotion` prop.
    They are C22–C24 and C61 (REQ-008), owned by TASK-008, which depends on this task. The low state
    and pulse stay each consumer's existing threshold and `urgent` loop claim, passed in unchanged
    (`low`, `pulse`).
- **`src/ui/refinements/countdown-warning.ts`** (accepted owner): **read; deliberately not created
  here.** It is the eligibility rule of C23 (colour at 10, edge at 5, count-up caps, elapsed-only
  excluded): TASK-008's. This task keeps every existing threshold (rest 10, EMOM minute 10, AMRAP 10,
  interval 10, circuit rest 10, For Time cap 10, movement countdown 5). The seam TASK-008 needs is in
  place: every `TimerReading` carries `remaining` (a countdown's own, or cap − elapsed for a race;
  null for elapsed-only), which is `countdownWarningState`'s input.
- **`src/state/timed-clock.ts`** (named by check-01): **created as the single owner of the clock
  reading contract, not a clock.** No time state, no wall-clock read, no storage, no write. Each
  reading is built from the existing owner's own reading: session `workout-clock.ts`; rest
  `rest.ts`/`rest-provider.tsx`; movement countdown `movement-countdown.ts`; format clocks
  `emom.ts`/`amrap.ts`/`for-time.ts`/`circuit.ts`/`ladder.ts` with TASK-006's `timed-lifecycle.ts`
  pause arithmetic. No second ladder or format clock: the raced ladder still runs TASK-006's For Time
  clock (`raceReading`), and TASK-006's pause semantics are untouched.
  - Preparation: no separate preparation clock exists at this base. A preparation section's timed
    holds are movement countdowns and its rests the session's rest; REQ-022's guide clock would be one
    more reading. Recorded rather than invented.
- **`src/ui/refinements/tokens.css`**: **read; no variable added.** REQ-007 lists the
  `--countdown-warning-*` variables, but every one of them is the warning's (C22) and none is read by
  anything this task delivers; adding them unread would be dead tokens. TASK-008 adds them with the
  cue.
- **`src/ui/refinements/presentation.css`**: **adopted** — `.clr-accepted-timer*` recipe and the
  accepted `.clr-accepted-workout-header` recipe applied to the route's existing `.clr-workout-header`
  class (one row, `--spacing-200` gaps, title `--heading-h2-size` / `--heading-h4-size` at ≤ 380 px
  with a control-height line, readout padding `--spacing-200` inline at ≤ 380 px). AppHeader
  (Foundation 0.14.3, immutable) sets its two gaps inline, so the gap overrides use `!important`
  (precedent: `feeling-row.css`). The `flex-wrap: wrap` rule that let the readout/menu drop to a
  second row was removed from `workout-navigation.css` (C20/R119: no two-row state).
- **`src/ui/refinements/workout-card.tsx`**, `movement.tsx`, `overview.tsx`, `timed-workout-flow.tsx`:
  read; unchanged.
- REUSE.md: one owner; no route-local look-alike; the gallery draws the actual consumers.
- LOGGING-FIELDS.md: no field, reason or writer added or moved; the rest inside the log is the same
  `RestTimerBar` over the same provider.

## Changes

- New: `src/ui/refinements/deadline-timer.tsx`, `src/state/timed-clock.ts`,
  `src/dev/gallery-refinement-timers.tsx` (the route's header composition and the `urgency` state's
  frames, plus the register specimens), `src/test/timer-frames-fixture.ts` (shared by check-01 and
  check-02: a Warm-up timed hold with a rest, then a lift, a circuit with a timed station, an EMOM
  with a rest window, an AMRAP, a capped For Time, the raced ladder and a scheduled ladder).
- Consumers moved onto the one frame: `GlobalTimer` and `RestTimerBar` (`workout-chrome.tsx`;
  `TimerFrame`/`TimerDigits` removed), `MovementCountdownView`, `ForTimeClock` (status line, then the
  full-width frame, then the cap line, all still inside its timer card), EMOM `MinuteCountdown`,
  AMRAP window, ladder `IntervalCountdown`, circuit round rest and `RoundElapsed`.
- CSS: `presentation.css` (+ timer and header recipes), `workout-navigation.css` (wrap rule removed),
  `movement-countdown.css` (its width-stretching rules removed; the frame fills by itself).
- Gallery: `?state=cards` Workout context opens with the route's own one-row header at the accepted
  reading and one past the hour; new stable `?state=urgency` (titled "Whole timer frames · countdown,
  cap and elapsed clocks"; TASK-008 adds the warning there) drawing `MovementCountdown`,
  `ForTimeClock` (running / paused / last seconds), a format countdown in its low state,
  `RestTimerBar` under the actual `RestTimerProvider`, and the elapsed-only session frame. Register
  entry `DeadlineTimer` (4 specimens); `COMPONENTS.md` regenerated (67 entries). The stale `TimerFrame`
  exemption was removed from `gallery-registry.test.tsx`.
- `PROJECT_MAP.md`: refinements row names the new owner, the reading contract and the gallery file.
- `docs/design/CLEAR-0.14.3-RECONCILIATION-LEDGER.md`: EXC-03 recorded as retired (the guard test no
  longer pins it); EXC-01, EXC-04 and EXC-06 unchanged.
- Evidence: `evidence/refinement/task-007/required-cases.json` (check-01: 13 vitest cases; check-02:
  7 Playwright mobile cases).

## Tests added and changed

- New `src/state/timed-clock.test.ts` (check-01, 7 cases; AC-C21-01, AC-R007-03): every clock driven
  through its existing owner at one shared moment — session, movement countdown, rest, For Time,
  AMRAP, EMOM and the raced ladder; a section Pause freezes only its clock and cap while session,
  rest and a running countdown run on; Resume keeps active time and window left; cap − elapsed,
  frozen while paused, zero at the cap, none without a cap; countdown banking and rest extension;
  elapsed-only session past an hour; names/directions/words; a reading is a pure function of the
  owner's reading (reload round trip, two places, an unstarted race not started by reading).
- New `src/ui/timer-frame-layout.test.tsx` (check-01, 6 cases; AC-C19-01, AC-R007-01, AC-C20-01,
  AC-R007-02, AC-C21-01, AC-R007-03): over the real router at `/workout` with an injected `Date.now`
  and the shared stylesheets applied: every timer on the route (preparation hold, session, EMOM,
  AMRAP, interval, two races, circuit station) is one whole frame with a centred readout; the rest in
  the open log is one full-width frame in its card, not beside its label; the header recipe is one
  row with the readout at control height and never 100% wide; the `cards` gallery state draws the
  route's header twice (20:32 and 1:02:03), one row each, no two-row state; clocks keep their own
  readings through hold Pause and For Time Pause/Resume; Rest → Minimize → Rest moves the same rest
  without restarting it and writes nothing.
  - Mutation checks, each restored byte for byte: header `flex-wrap: wrap` → AC-C20-01 failed;
    body `justify-content: flex-start` → 4 cases failed; session reading given a deadline (0) →
    the elapsed-only case failed.
- New `e2e/refinement/task-007.spec.ts` (check-02, 7 cases, contained synthetic lane, Playwright
  clock, 320 and 390): header geometry (title, readout and menu centred on one line within 1 px,
  readout height = menu height, readout between title and menu and < half the header, digits centred,
  past an hour too); every clock's frame filling its place's content box within 1 px with centred
  digits, in the warm-up, the open log, the footer and the main section, the beside-card countdowns
  spanning the screen content; touch journey with exact readings (hold, rest open/minimise/reopen,
  hold Pause, For Time Pause/Resume and its cap line, session clock); keyboard + reduced motion
  (focus kept Start→Pause, animations ≤ 0.01 ms) + reload of a paused AMRAP window (frozen 07:15, same
  frame); gallery `cards` header rows and `urgency` frames with no network. axe on every visited
  screen plus after the interactions. Captures attached: `header-phone-{320,390}`,
  `header-hour-phone-{320,390}`, `entry-…`, `log-rest-…`, `footer-rest-…`, `main-clocks-…`,
  `main-clocks-running-phone-390`, `gallery-cards-header-phone-320`, `gallery-urgency-frames-phone-320`.
- Updated, superseded by approved criteria and citing them:
  - `src/ui/workout-chrome.test.tsx` "is the shipped timer card — one bar…" → "is one whole timer
    frame in the header placement — no accent bar, no card, the timer role" (C19, C20; R53, R96,
    R102, R119).
  - `src/app/Workout.test.tsx` "draws the session timer and the rest as two self-framed cards" → the
    session clock is one whole header frame and the rest its own timer card holding its whole frame
    (C19, C20, C21; R102, R103).
  - `src/app/movement-countdown.test.tsx`: "spans the card width … through the shipped rules" now
    reads the shared recipe (the countdown-local stretch rules are gone, C19); "is the shipped timer
    card, with one bar, wherever no card surrounds it" → "is one whole timer frame, with no card and
    no bar…" (C19, R102). The AC-052 in-card and AC-053 low-state cases pass unchanged.
  - `src/ui/amrap-block.test.tsx` "stands the countdown beside the block's card" (C19, R49) and
    `src/ui/emom-block.test.tsx` "keeps the timer in its own single frame…" and "is one block card
    beside one timer card…" → "…beside one whole timer frame…" (C19, R42).
  - `src/test/design-system-097-deprecations.test.ts`: the EXC-03 `TimerFrame` hand-assembled-card
    exception retired (C19); the ledger test requires an exception only while still needed.
  - `src/dev/gallery-registry.test.tsx`: stale `TimerFrame` exemption removed.
  - Backend lane, note text only (assertions unchanged and still valid):
    `e2e/design-0143/workout-lifecycle.spec.ts` two `evidence.note` strings that described the
    retired timer card; `e2e/ui-polish-b05-movement-countdown.spec.ts` one comment.

## Sweep (every spec and test under `e2e/` and `src/`)

Searched for: `clr-card__bar`, `clr-card__body`, `clr-chamfer--timer`, `getByRole('timer'`,
`role="timer"`, `Session time`, `Time remaining`, `Block time`, `Round N time`, `clr-workout-header`,
`clr-rest-bar`, `TimerDisplay`, `TimerFrame`, `countdown-edge`, `movement-countdown__timer`,
`flex-wrap`, digit parsers and `--bleed` reads.

- Fixed: the files above.
- Checked, not superseded:
  - `e2e/design-0143/workout-lifecycle.spec.ts` `timerProbe`/`expectTimerContract` (backend lane):
    first `aria-hidden` child is still the digits with the inline 0.4 s stepped crossing; card depth
    ≤ 1 (session 0, race and rest 1); low = nearest `.clr-pulse-micro` (EMOM/AMRAP/interval frames
    still take it when low, through `pulse`); one running loop (wrapper-held claims are not
    duplicated: `pulse === true` spreads no `data-loop`); `seconds()` reads the digits span.
  - `e2e/design-0143/workout-{emom,amrap,ladder,circuit}.spec.ts`, `accessibility.spec.ts`,
    `task-040-lifecycle-gaps.spec.ts`, `e2e/core-loop.spec.ts` (backend lane): name/text reads only
    (`exact` names unchanged, `mm:ss` digits still first in the text).
  - `e2e/ui-polish-b05-movement-countdown.spec.ts` placement (region-wide bleed, h1 digits ≥ 1.5 ×
    control, no nested card), `ui-polish-b05-rest-log`, `ui-polish-b05-sheet-surface`,
    `ui-polish-b05-active-hierarchy` (rest/round reads), `ui-polish-integrated` (`timerSeconds` joins
    `aria-hidden` texts and takes the first `mm:ss`; the circuit caption is still before the digits).
  - `src/ui/timed-workout-flow.test.tsx` and `e2e/refinement/task-006.spec.ts` (TASK-006's targets,
    not edited): one `role=timer` per block stack, digits in text, the race timer still inside its
    timer card with the status line (`clockStatus` = `closest('.clr-card')`).
  - Gallery `?state=cards` readers: `block-panel`, `group-exercise-coaching`, `movement-identity`,
    `movement-list` tests and `e2e/refinement/task-001` to `task-005.spec.ts` (the Workout context's
    card counts are unchanged; the header adds no card).

## Failures and corrections

- Exploration first: the current route was captured on the synthetic lane and the accepted reference
  rendered from the staged copy in a scratch directory outside the workspace (base `index.html`,
  `vite.config.ts`, `public/`, `scripts/` from `03087f7`, node_modules linked). The scratch copy was
  deleted afterwards; only the measurements above were kept.
- First exploration tap on the hold's Start was intercepted (the target was under other content after
  Playwright's own scroll). The spec scrolls each control to the middle of its scroller before a tap.
- Moving the digits' colour/transition into CSS broke the existing rest low-state assertions (they read
  the digits' inline style, which C19 does not change). The digits keep their inline styling; the same
  for the inline `--bleed`, so AC-052/AC-053 pass unchanged.
- The shipped `TimerDisplay` carried a plain `mm:ss` hidden span; the frame says the value in words. The
  EMOM test now reads the digits through text content.
- Two identical ladders in the fixture gave two identically named "Coaching and notes — LADDER: push up,
  burpee" regions (axe `landmark-unique`). Fixture-only: the scheduled ladder now has its own movements.
- e2e `settle()` awaited `animation.finished`, which never resolves for a paused finite animation under a
  held page clock: the run hung. Settle now only flushes layout and fonts; captures use
  `animations: 'disabled'`.
- e2e header case ticked an hour through `runFor` (7,200 interval runs) and the synthetic auth session
  expired exactly one hour after entry, so the app left `/workout`. The hour is now jumped with
  `fastForward` and the synthetic session lasts a day.
- e2e recovery case reloaded with the page clock paused, so the app could not boot. The clock now runs
  through the reload (the paused AMRAP window is still read frozen at 07:15).
- e2e gallery header "overflow" at 320 came from `scrollWidth`: under the mobile project's coarse
  pointer the menu's enlarged invisible hit area reaches past the gallery's unpadded header. Measured
  outside emulation the header is 288 px with scrollWidth 288. The check now measures the visible parts
  (title, readout frame, menu frame) against the header box.
- `react-refresh` warnings: the three `DeadlineTimer` register specimens first added 3 warnings to
  `gallery-registry.tsx` (137 → 140); they moved to `gallery-refinement-timers.tsx` (exports components
  only). Every touched file now has the same warning count as at base (compared per file with
  `git show HEAD:<file> | eslint --stdin`).

## Verification (this worktree, uncommitted candidate, 2026-11-09)

- `npm ci`: exit 0.
- `node scripts/refinement/run-required-check.mjs --task TASK-007 --check check-01 -- npx vitest run src/state/timed-clock.test.ts src/ui/timer-frame-layout.test.tsx --passWithNoTests=false`:
  PASSED. Native 13 total, 13 executed, 13 passed, 0 failed/skipped/todo.
- `node scripts/refinement/run-required-check.mjs --task TASK-007 --check check-02 -- npx playwright test e2e/refinement/task-007.spec.ts --project=mobile`:
  PASSED. Native 7 total, 7 executed, 7 passed, 0 failed/skipped/todo (1.6 min; synthetic origin, no
  credentials used).
- `npm run build`: exit 0 (`tsc --noEmit` over `src` and `e2e`, then Vite). `npm run lint:ds`: exit 0.
  `node scripts/gallery-index.mjs --check`: 67 verified.
- `npm test`: 259 files, 6154 tests passed, 0 failed.
- Earlier tasks' browser specs run directly (not through their guards, so their receipts were not
  rewritten): `e2e/refinement/task-001` to `task-006.spec.ts`, 38/38 passed.
- `npx playwright test <every non-B05 spec> --list --project=mobile`: 422 tests in 57 files;
  `e2e/ui-polish-b05-movement-countdown.spec.ts --list`: 10 tests. (Listing all specs at once stops at
  the B05 import-time reference read, pre-existing and recorded by TASK-006.)
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,TASK-002,TASK-003,TASK-004,TASK-005,TASK-006,TASK-007`:
  PASSED, exit 0. Every task has "current passing receipts"; accepted-gallery 1193 files verified.
- Mutation checks on check-01: see Tests.
- Not run here: backend-lane specs (`e2e/design-0143/*`, `e2e/core-loop.spec.ts`) need
  `.env.runner.local`; they load under `--list` and typecheck.
- `e2e/ui-polish-integrated.spec.ts` (local synthetic), run here: 5 failed, every one before the
  workout draws — the page lands on the CLEAR screen, so the session timer is absent and
  `timerSeconds` finds no digits. Identical to TASK-005's record on its base; pre-existing, not this
  task's scope.

## Earlier-task receipts

None refreshed. No file named in another task's `required-cases.json` was edited
(`movement-list.test.tsx`, `movement-identity.test.tsx`, `block-panel.test.tsx`,
`summary-facts.test.tsx`, `group-exercise-coaching.test.tsx`, `timed-workout-flow.test.tsx`,
`e2e/refinement/task-001` to `task-006.spec.ts`, `scripts/refinement/required-check.test.mjs`).
`git diff -- evidence/` touches only `evidence/refinement/task-007/`. The final verifier above confirms
every earlier receipt is current.

## Open assumptions / unresolved

- Header title size: the accepted header's title is `--heading-h2-size`, and `--heading-h4-size` at
  ≤ 380 px (the reference recipe), down from the h1 the header used. This is what keeps title, readout
  (even past an hour) and menu on one row at 320. A title that cannot fit at an extreme text zoom would
  wrap inside its own column; that is not presented as an approved two-row state, and none is shown.
- The rest and race clocks keep their timer card (its accent bar is R102's "intended accent bar") with
  the whole frame inside it at full width, as the accepted reference places the ladder's timer inside
  its card. If the owner wants the rest without its card in the open log (the reference's bare label /
  frame / actions), that is a composition choice for the logging-overlay work (TASK-016/TASK-041), not
  a frame change.
- Digit sizes are each consumer's existing size; the AMRAP's shipped 40 px became `--heading-h1-size`
  (32 px at phone), the nearest token, because raw px values are not allowed.
- The low state and pulse thresholds are unchanged per consumer (5 for the movement countdown, 10
  elsewhere). Unifying them to colour at 10 and edge at 5 is C23, TASK-008, as is the soft vignette.
  The `?state=urgency` title says "Whole timer frames · countdown, cap and elapsed clocks" until
  TASK-008 adds the warning there.
- No separate preparation clock exists at this base (see dispositions); REQ-022 owns it.

## Next action

Controller verification and commit.
