# clear-effects-2026-10-30 · TASK-007 — comfort end states across real screens

This is the task's own progress record. Under the owner-selected policy it satisfies the
repository's shared daily-journal requirement for this body. TASK-008 consolidates it.

## Identity

- Body: `clear-effects-2026-10-30`, task `TASK-007`, issue #608, REQ-007, journey JOURNEY-004
  (completion owner; entries ENTRY-006 `/settings`, ENTRY-007 and ENTRY-008 `/generate`).
- Branch: `agent-runner/task-007-a2-199e6183` (attempt 2 of 5). Base: `b57bb2a` (TASK-006 merged,
  #620). Nothing was committed, pushed or opened as a PR.
- Attempt 1's workspace was not readable from this one, so this attempt started from the base.

## Intended outcome

Prove the JOURNEY-004 end states on the real app, without a reload:

- With Visual effects off there is no Echo, no CRT field and no old scanline, and the blobs are
  still.
- Turning it back on restores both effects with the same preset identities.
- OS reduced motion, honoured live, stops drift, grain and blobs together.
- A hidden tab stops effect work, and it resumes without a catch-up jump.
- Focus, input, loading/busy and errors work in every combination.

The proof is a route-level jsdom journey and a real-browser spec. Integration gaps may be fixed
only in the effect modules' public wiring.

## Changes

- `src/app/visual-effects-journey.test.tsx` (new) is the journey on the real route tree, through
  `renderApp`. It uses these doubles:
  - a live `prefers-reduced-motion` that tells its listeners when it flips;
  - a `visibilityState` spy with `visibilitychange`;
  - the Echo layout stub from `generate-echo.test.tsx`;
  - a stand-in `Element.animate` that records the field's two clocks.

  The journey runs `/settings` (uncheck) → Back → Home → *Generate workout* → `/generate`, and back
  again (re-check). Seven cases cover:
  - off: no field, no Echo source or rear, no atmosphere scan or overlay, the same three blobs
    still, and the field clocks cancelled;
  - on again: the same `CRT_FIELD_CONFIG.id` and custom properties, the same Echo filter node with
    the `PHOSPHOR_ECHO_PRESET` values, the four `/generate` rear sources, and motion allowed;
  - an unknown stored value falls back to on;
  - reduced motion mid-session and at start: the same field node, both clocks paused in place,
    blobs still, the static Echo kept, no atmosphere scan, and resuming plays the same clocks;
  - hidden and visible: the same two clocks are paused and played, never cancelled or recreated;
    off stays off.

  Every combination of Visual effects on/off and reduced motion on/off also checks the same things
  on `/generate`:
  - focus and keyboard on an Anchor chip;
  - a submit that shows the busy loading status;
  - a typed failure that shows the alert with Retry;
  - keyboard Cancel back to the form.
- `e2e/effects/comfort-transitions.spec.ts` (new) is the same journey in Chromium (the `mobile`
  project, 390 × 844) on actual screens. It is self-contained:
  - it starts its own Vite origin on port 5820+ with synthetic Supabase values;
  - its intercepted data is read-only and nothing leaves the origin, which it asserts;
  - service workers are blocked;
  - generation requests are held, then failed with a 503;
  - it edits no shared Playwright configuration and imports no other spec's harness.

  One test, in a single document (a window marker proves there was no reload), checks:
  - **hidden tab:** the field pauses and the blobs go still. Every clock — line drift, grain
    refresh and each blob CSS animation — reads exactly the same after 1.5 s hidden. When shown
    again, each clock moved forward by no more than the time since it was shown (plus one frame of
    slack), then runs at its own rate;
  - **reduced motion on:** the clocks are held, blob transforms are unchanged, blob shapes and
    colours equal the baseline, the static Echo and the same preset identities stay, and no old
    scan shows. Feedback works. When turned off, motion continues with no catch-up;
  - **off in Settings:** Settings, Home and `/generate` show no field, no Echo source and no old
    scan. That means no visible `.clr-atmosphere__scan`, no `.scanlines-overlay`, and no idle
    `.clr-chamfer::before` `repeating-linear-gradient`. The blobs keep their looks and hold still.
    Feedback works with reduced motion off and on;
  - **on again:** the same `CRT_FIELD_CONFIG.id`, custom properties, drift and grain durations, and
    Echo filter values. The field's clocks start from their own beginning (no catch-up past the
    time since re-enable), the held blobs continue with no catch-up, and the Echo returns on
    `/generate`.

  Every clock read first waits two frames and then for every pending animation's `ready`, so a
  reading is the committed state.
- No production code was changed. None was needed, and none of the forbidden owners was edited:
  TASK-006 texture/field files, `Settings.tsx`, `RootLayout`, and the preset owners.

## Failures and corrections

- **Attempt 1 failed controller verification** with `no line time passes while hidden`: line time
  was 933.238 ms, then 949.938 ms. The 16.7 ms difference is exactly one frame. The cause is that
  `Animation.pause()` is *pending* until the next frame, and `currentTime` keeps advancing until
  it commits. The "hidden" baseline was read before the pause had committed, so the app was not
  at fault. Correction: `readEffects` awaits two animation frames and then every animation's
  `ready` before it reads. The hidden phase then passed on the first run.
- In this attempt, under OS reduced motion, no blob animations were found. The existing
  reduced-motion end-state CSS removes the blob animations instead of pausing them. Correction:
  the still states accept a paused blob clock *or* none, and they also prove stillness through
  unchanged computed blob transforms. On resume, a clock that the held state removed must start
  from its own beginning.
- The error toast lies over the pinned foot, so a pointer click on *Cancel* was intercepted.
  Correction: the CTA, *Cancel* and Home's *Generate workout* are focused and activated with the
  keyboard. That also proves keyboard operation in each combination.
- jsdom: framed Echo rear `path`s inherit `aria-hidden` from their `svg`, so the assertion checks
  for an `aria-hidden` ancestor.

## Assumption to confirm (not a blocking finding)

REQ-007 says that under reduced motion "no scanlines are drawn over the atmosphere background". I
read that as the atmosphere's own scan layer, the "atmosphere-scope lines" in JOURNEY-004 and the
"existing atmosphere fallback" in the owner intent. That layer is never rendered. The CRT field
stays as **static glass** with paused lines, which matches TASK-006's merged behaviour and the
"static glass/Echo may stay where readable" allowance (Q-006).

If the owner meant that the field's own lines must disappear under reduced motion, that change
belongs in TASK-006's `src/ui/crt-field/` and is outside this task. It would then be a blocking
finding for that owner.

## Verification (this workspace, final tree)

All were run from this workspace on the final tree, 2026-11-02:

| Command | Result |
| --- | --- |
| `npx vitest run src/app/visual-effects-journey.test.tsx` | 1 file, 7 tests passed |
| `npx playwright test --project=mobile e2e/effects/comfort-transitions.spec.ts` | 1 passed (8.6 s); run twice more on the final tree, both passed |
| `npm run typecheck` | exit 0 |
| `npm run lint` | 0 errors, 158 warnings (all already present; none in this task's files) |
| `npm run lint:ds` | exit 0 |
| `npm test` | 250 files, 6059 tests passed |
| `npm run build` | built |

The jsdom "Not implemented: getComputedStyle with pseudo-elements" lines are stderr noise from
user-event's pointer check; they are not failures. The Playwright `NO_COLOR`/`FORCE_COLOR`
warnings come from the environment. `--repeat-each` could not be run in this boundary because it
needs a separate approval, so the stability evidence is the three separate passing runs.

## Next action

The controller verifies independently. TASK-008 consolidates this record.
