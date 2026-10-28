# TASK-018 — Bounded integrated mobile smoke for the sheet, clocks, navigation and swap return

Issue #538 · REQ-009 · role: completion-owner for JOURNEY-017.
Task-owned progress record; it stands in for the shared daily journal for this task.

## Outcome intended

One local Playwright smoke, `e2e/ui-polish-integrated.spec.ts`, on the existing `mobile` project.
It exercises the accepted, already-merged composition together rather than re-implementing any
of it: TASK-006 sheet, TASK-008 effort, TASK-009 minimise access, TASK-011 correction/clear,
TASK-012 movement clock, TASK-013/014 logging, TASK-015/016 paired navigation and menu, TASK-017
swap return, TASK-001 frame and TASK-005 Review.

## Baseline, as found (HEAD `bae4f84`, contains `7f0a367`)

- PRE-001: `git merge-base --is-ancestor 7f0a367… HEAD` exit 0.
- PRE-002: `src/design-system` is unchanged by this task (`git status` lists no path under it);
  `lint:ds` green. The `node -e` version probe was not run separately.
- PRE-004: Chromium for the `mobile` project launched; the local Vite server was started by the
  Playwright `webServer`. `gh issue view` was not used; the approved task body was the contract.

## What changed (local, uncommitted)

- New `e2e/ui-polish-integrated.spec.ts`: 4 cases, two journeys × 390×844 and 320×568.
  - **Workout journey** on the production `/workout` route, from a synthetic `snapshotFixture`
    session (back squat 3×8 with 45 s rest; hollow body hold 2×30 s, bodyweight). It covers:
    - the top menu holding Abandon, with Escape restoring focus;
    - card Log set opening the sheet: title, single Minimize chevron, Reps prefilled 8, Unit, and
      no "Reps performed" or "No sets logged yet" text;
    - typing Weight;
    - selecting effort, with `aria-checked` and Clear effort shown;
    - **a refused first save**: the row shows "On this device only" and never "Saved", and no
      observation is recorded. The `online` retry then saves 8 reps · 60 kg · about right;
    - rest Skip and then logging set 2;
    - rest expiry while minimised (`page.clock.fastForward`), with the card Log set reopening
      the sheet;
    - Edit set 1, clearing its effort, the Cancel / Save correction paired group (row or aligned
      stack, Cancel first) and saving the correction (`effort: null`);
    - Next section to Accessory with focus, an intercepted block result and Finish workout shown;
    - the movement Countdown starting and pausing beside the separate Session time;
    - the timed set (Seconds 30, no Weight field) saved;
    - Previous back to Primary lift with focus.
  - **Review journey**: a 24-alternative synthetic swap list on `/review`. The last option is
    reached by touch inside the dialog scroller and selected, then the view returns to Review with
    the swapped slot focused, the existing toast and Start enabled.
  - Every tap is real Chromium touch input. Off-screen targets are reached only by swipes along
    points that hit-test inside the target's own scroller; scroll position is never assigned. Each
    tap waits for layout and scroll momentum to settle, then hit-tests the point. Each reached
    target is checked for viewport containment and horizontal clipping. Axe runs on visit, the open
    sheet, edit mode and the final state.
  - Containment: API calls are answered in the spec (reads from fixtures; observation writes and
    block results answered synthetically, never forwarded). Any other non-local request is aborted
    and fails the case. Function calls, model generation (guard) and unexpected requests must be
    zero. `beforeEach` refuses a non-localhost target, a non-`mobile` project or a non-Chromium
    browser. `afterEach` refuses any case not expected to pass, so a skip or fixme cannot pass
    silently, and Playwright fails a run with zero selected tests.
  - Keyboard-like resize (normal phone only, 390×844 → 390×600 and back): focus and the typed
    value persist, the paired navigation stays wholly on screen, and Minimize, Weight, effort and
    the Log set action stay touch-reachable.
- `src/ui/workout-navigation.css` — **one product correction found by this smoke** (below).
- Nothing changed in GitHub or any external service.

## Failure found and corrected

At 320×568 the open sheet's fields were unreachable by touch. Diagnostic data from the failing
swipe:

- `.clr-workout-footer__entry`: clientHeight 58, scrollHeight 292.
- The sheet's own `.clr-set-sheet__frame` (`overflow-y: auto; overscroll-behavior: contain`,
  max-height 60dvh) sat under the finger without overflowing (292/292), so the touch scroll
  stopped there.

Weight, effort and Log set could not be reached. Because `workout-navigation.css` already states
that in the workout foot only the entry area may scroll, the docked frame is made a non-scroller
there: `max-height: none; overflow-y: visible; overscroll-behavior: auto`, using tokens only. After
the change, actual touch swipes reach every sheet control at 320×568.

## Test-side corrections along the way (no assertion weakened)

- The first clipping check compared an icon button's `scrollWidth`. It now checks clipping boxes
  and that every descendant stays within the viewport's sides.
- The first swipes started on the footer navigation. Swipes now run only through hit-tested
  scroller points.
- Taps during fling momentum or during sheet collapse did nothing, as they would on a phone. The
  driver now waits for scroll and box stability before tapping.
- In a 58 px entry window, a 52 px control is accepted once all but 12 px of it is shown; it
  remains hit-tested and tapped.
- Cancel/Save were first measured at different scroll positions. They are now read together. The
  shipped `clr-action-group--paired` stacks at this width, which is accepted as aligned.
- Section headings are the type labels ("Primary lift", "Accessory"), not fixture titles.
- An unanswered `session_as_performed` read is now answered with the matching
  `reconstructionFixture`.
- Two runs aborted with "execution context destroyed by a navigation" at unrelated early steps,
  before any touch input. The next unchanged rerun passed those steps. This was taken as transient
  dev-server reloading; the cause was not otherwise established.

## Unresolved finding (not changed; owner decision)

On very short windows (≈320×312, a narrow phone with a keyboard-like reduction), the vendored
ScrollRegion foot cap (`max-height: 45%`, `foundation.css`) is shorter than the paired navigation.
The workout composition sets that foot to `overflow-y: hidden` (TASK-015), so the navigation is
clipped (53% on screen) and the sheet entry collapses to nothing. Fixing this means changing the
accepted foot/half-sheet proportions across TASK-006/009/015 surfaces, so it was not widened into
this task. The spec documents why its keyboard-like resize runs only on the normal phone. At
390×465 the entry window was 37 px and a swipe did not move it with a focused field (cause not
established). Proposed next step: owner decides whether the workout foot cap should guarantee the
navigation plus a minimum entry height.

## Proof limits

This is synthetic, intercepted UI proof on production routes in local Chromium. It is not backend
persistence, deployed preview, iOS keyboard/status-bar, installation or physical-iPhone proof.
Installed-device outcomes remain pending in `POST-LAUNCH-MANUAL-UAT.md`, outside this DAG; no task,
prerequisite or completion gate depends on a device. No terminal receipt or reporter contract was
introduced.

## Verification (this worker, final tree)

| Command | Result |
| --- | --- |
| `env -u E2E_BASE_URL npm run e2e -- e2e/ui-polish-integrated.spec.ts --workers=1 --retries=0` | pass, 4/4 (1.3 m), and again 4/4 (1.4 m) |
| `npm test` | **fail**: 2, both in `src/test/design-0143-final-audit.test.ts` (blocker below) |
| `npm run lint:ds` | pass |
| `npm run build` | pass (existing >500 kB chunk advisory only) |
| `npm run lint` | pass, 0 errors (143 warnings, same baseline) |
| `npm run typecheck` | pass |
| `npm run gen:types -- --check` | pass, types current |
| `python3 scripts/gen-issues.py --check` | pass (71 requirements, 136 edges) |

## Verification stop: runtime-source-bound audit evidence

This is the same blocker as TASK-006/007/009/011–017. The audit hashes the runtime source under
`src/`, so the CSS correction fails two checks:

- *proof labels › bound to the package and runtime source of this tree*
- *TASK-034 AFTER evidence (eight-cell mobile group)*

No record, hash or audit text was edited. Next safe action: the controller commits the tree,
re-captures the four-skin format-preview evidence against it on the owned disposable backend, then
runs native verification.
