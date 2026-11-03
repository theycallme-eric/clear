# clear-effects-2026-10-30 · TASK-009 — browser-based Visual effects performance comparison

This is the task's own progress record. Under the owner-selected policy it satisfies the
repository's shared daily-journal requirement for this body. TASK-008 consolidates it.

## Identity

- Body: `clear-effects-2026-10-30`, task `TASK-009`, issue #610, REQ-008 (AC-045, AC-046, AC-047,
  AC-077). Role: independent.
- Branch: `agent-runner/task-009-a1-bfb57d49` (attempt 1). Base: `700a2a0` (TASK-007, #621).
- Nothing was committed, pushed or opened as a PR. No external service changed.

## Intended outcome

Compare the same real-app flows with Visual effects off and on, in a real browser, on the same
build of the actual shipping implementation. The flows are:
- Home, Generate and Settings navigation;
- the Anchor chip and the Intensity slider;
- scrolling;
- turning Visual effects off and on in Settings;
- controlled busy and error states.

Record the identity, methodology, raw measurements, what is unmeasured, regressions, tuning
options and budget proposals in `docs/effects/performance.md`. Invent no threshold, claim no phone
evidence, and change no product code or shared configuration.

## Changes

- `e2e/effects/performance-comparison.spec.ts` (new) is self-contained and imports no other
  spec's harness.
  - **Build.** A worker fixture runs `vite build` into a temporary folder with synthetic Supabase
    values, then serves it with `vite preview` on port 5860 or above.
  - **Data.** Data is intercepted and read-only. Generation POSTs are held (busy), then answered
    with a 503 (error). Service workers are blocked, and every run asserts no write and nothing
    outbound.
  - **Runs.** Six fresh-context runs, off, on, on, off, off, on.
  - **What it records.** For each run:
    - cold and warm load: Navigation Timing, FCP, LCP, *Generate ready*, resources and bytes;
    - frame pacing (gaps between `requestAnimationFrame` callbacks) for idle Generate,
      scrolling, busy, error and idle Home;
    - long tasks per phase;
    - tap and key time to the second next frame, plus Event Timing entries;
    - navigation timings and the Visual effects toggle;
    - DevTools Performance metrics and the heap after a forced garbage collection.
  - **Identity.** Browser, OS, viewport, device-pixel ratio, render scale, the WebGL renderer and
    the DevTools GPU info, commit and bundle hashes, the Echo preset, the CRT shipping
    configuration id and values, and the archived reference identity.
  - **Output.** JSON plus Markdown tables, attached to the report.
  - **Failure rule.** It fails only on a missing identity field or raw-measurement record, a run
    in the wrong mode, or a write.
- `docs/effects/performance.md` (new) is the "Visual effects performance" record. It holds the
  final run's tables unchanged, the unmeasured and not-proven list, findings, tuning options,
  mitigations, budget proposals and a pending owner-decision table.
- This file.

No product code, shared Playwright configuration, `CRT_FIELD_CONFIG` or TASK-006 file was edited.
`PROJECT_MAP.md` is unchanged because the architecture did not change.

## Failures and corrections

1. **First run failed on the Visual effects toggle.** The checkbox was below the fold, so the tap
   at its bounding-box centre missed. Fix: scroll each tapped control into view and wait two
   frames before the measured tap.
2. **Ad-hoc summary scripts needed approval.** Running a Node script against the JSON needed
   approval in this boundary, so I removed it. The spec now writes its own Markdown tables, which
   also makes the record easier to reproduce.
3. **Heap and DOM-node counts were dominated by garbage-collection timing.** In the first data
   run, effects-on showed *fewer* nodes. The spec now forces a collection before reading memory.
4. **The probe page reported a misleading viewport.** The blank probe page reported a 980 px
   layout viewport and a 0.398 visual scale, because it has no viewport meta tag. The app page's
   own device-pixel ratio, inner size and visual-viewport scale are now recorded for every run
   (3, 390 × 844, 1).

## Verification (exact results)

- `npx playwright test --project=mobile e2e/effects/performance-comparison.spec.ts`: 1 passed
  (1.6 min). The record holds this run's tables.
- All `test -f`/`grep -qi` record checks pass: title, frame pacing, long task, shipping
  configuration, tuning, renderer, device-pixel ratio and viewport. These check the record's
  contents only; they do not prove performance.
- `npm run typecheck`: exit 0.
- `npm run lint`: 0 errors, 158 warnings, all already present.
- `npm run lint:ds`: exit 0.
- `npm test`: 250 files and 6,059 tests passed.
- `npm run build`: built.

## Findings (summary; details in `docs/effects/performance.md`)

- The renderer is SwiftShader (software); GPU compositing and raster were disabled. This is
  mobile emulation, not phone evidence.
- **Load:** no material difference; the same 17 resources and bytes.
- **Long tasks:** none in either mode.
- **Frame pacing:** off had 0 gaps over 20 ms in 15 phases; on had 30 single missed frames of
  about 33 ms (the most on idle Home); none exceeded 50 ms.
- **Main-thread work:** about 2.1× style recalculations; task time about +37 % over the flow.
- **Input:** the first Anchor tap after load was about +10–25 ms; later input overlapped.
- **Memory:** heap about +80 KB; DOM nodes +61.

## Unresolved and next action

- Whether the cost is acceptable, and any fallback, is the owner's decision at final review
  (Q-003). It is recorded as pending in the record, and no fallback was implemented.
- Hardware-GPU behaviour, compositor-presented frames, GPU time and memory, touch-fling scroll and
  INP are unmeasured or not proven here.
- Next safe action: controller verification. Optionally, rerun the spec on a hardware-GPU browser
  before final review.
