# Visual effects performance

## Archived front-glass measurement — 3 November 2026, issue #624

The existing comparison passed 1/1, recording six alternating off/on runs on clean source
`8aaac466e65f7fe4eaafb8182e4832a7404dabdd`. Same runtime as the layer correction; Echo and CRT
configuration values are unchanged. Full [raw measurements](evidence/front-glass-performance-20261103.json)
and [generated tables with build hashes](evidence/front-glass-performance-20261103.md) are preserved.
The earlier identity and results below are **pre-front-layer history**, not measurements of the
corrected layer. The browser's initial blank-page probe is 980px wide; each actual application run
independently reports 390×844, DPR 3 and visual viewport scale 1.

- Chromium 153, mobile emulation, SwiftShader software renderer; no physical-phone claim or gate.
- Both modes fetched 17 resources / 321,523 bytes **on the same effects-enabled build**. This does not
  compare bundle size against the pre-effects application.
- Recorded main-thread long tasks: off 0, on 0. A 50 ms long-task cutoff does not rule
  out shorter main-thread work or establish a compositor cause for 33 ms frame gaps.
- Across the 15 pacing phases per mode: off 0 gaps over 20 ms;
  on 29. Maximum gap off 16.8 ms,
  on 33.4 ms. Lowest phase rate off 60.3 fps,
  on 57.3 fps. These are observed browser costs, not pass/fail thresholds.
- First Anchor taps: off 34.4, 33.2, 48.4 ms;
  on 57.3, 61.1, 58.8 ms. Later input overlaps
  between modes. The raw timing measures event-to-second-next-frame, not field-validated INP.

No appearance fallback, phone test or performance budget was introduced. At this measurement
checkpoint, visual review and main merge were pending. The owner subsequently approved the
November 3 live Echo/scanline selections and authorized release after the engineering checks.
These historical numbers are not measurements of the later selected preset or a claim of
physical-device performance approval. Current presets and release policy are in the effects index.


Effects TASK-009 · REQ-008 · issue #610. This is the browser-based engineering comparison of the
same app flows with Visual effects **off** and **on**, on the same build. Under the owner
amendment, it replaces mandatory owner-run testing on a real phone.

**What this record is not.**
- It is not physical-phone evidence. Every number below comes from desktop Chromium. That browser
  ran Playwright's *mobile emulation* and *software rendering* (SwiftShader).
- It claims no phone performance approval.
- It sets no pass threshold, no latency threshold and no passing performance budget, and it
  enforces none.
- Measurements that are missing, skipped or inconclusive are **not proven**. Metrics this
  environment cannot provide are listed as **unmeasured**.
- Whether the measured cost is acceptable is the owner's decision at final review, together with
  the completed browser preview (Q-003).

## Owner decision (final review)

| Item | State |
| --- | --- |
| Is the measured cost acceptable? | **Pending.** The owner decides at final review. This task does not wait for that decision. |
| Lighter or static decoration fallback | **None selected, none implemented.** If the owner finds the cost not acceptable, the fallback is chosen under the unchanged fallback criterion and is built as a follow-up revision. Effects stay **on by default**. |
| Proposed future budgets | Proposals only (see [Proposals for the owner](#proposals-for-the-owner-not-adopted)). None is adopted. |

Record the owner's decision here, with its date, when it is made.

## Identity of what was measured

| Field | Value |
| --- | --- |
| Browser and version | Chromium 153.0.8010.12 (Playwright bundled), product `HeadlessChrome/153.0.8010.12`, revision `@971a7443b0c9b0a9b2860529b33331b76077ec62`, V8 15.3.76.4, headless |
| OS (host) | macOS, Darwin 25.5.0, arm64, Apple M4 Pro, 14 logical CPUs, 48 GiB RAM |
| Emulated device | Playwright `mobile` project: Pixel 5 descriptor (`isMobile`, `hasTouch`, Android 11 Pixel 5 user agent). **Mobile emulation, not a phone.** |
| Viewport | 390 × 844 CSS px. The app page reported `innerWidth` 390 and `innerHeight` 844 in every run. |
| Device-pixel ratio | 3. The app page reported `devicePixelRatio` 3 in every run. |
| Render scale | Page zoom 1 and visual viewport scale 1 in every run. The CRT field has no offscreen raster or render-scale setting, so it paints at the device-pixel ratio. |
| GPU / renderer | **Software renderer.** WebGL reports `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)`, vendor `Google Inc. (Google)`. The DevTools GPU device is SwiftShader driver 5.0.0, `SwANGLE`. Feature status: `gpu_compositing: disabled_software`, `rasterization: disabled_software`, `webgl: unavailable_software`, `2d_canvas: unavailable_software`, `multiple_raster_threads: enabled_on`. No hardware GPU was used. |
| App source | Commit `700a2a03692993a9157211bb95bd57b47745f8e9`, no tracked-file changes. The only addition is this task's untracked spec, which is not app code. |
| Build | A `vite build` of that tree into a temporary folder, served by `vite preview` (production bundle, not the dev server). Built 2026-11-03T01:15:50Z (UTC). Bundle SHA-256: `index.html` `45215bfc…cf01`, `assets/index-Bt4MFYgq.js` `4c718871…267d`, `assets/AppRuntime-D8HE0_vi.js` `4f212d20…bdd7`, `assets/index-CPI1Pb8z.css` `5d169e2a…8839`, `assets/AppRuntime-DLE1vizf.css` `f6dae303…8a49`. The full hashes are in the run's JSON attachment. |
| Echo preset | `Phosphor Echo · preferred` (`round-3/preferred-preset.json`), `src/ui/phosphor-echo-preset.ts`: opacity 0.29, blur 3.2 px, x −4.7 px, y 5.64 px (shown as "4.7 left / 5.6 down"). |
| Live CRT shipping configuration | `src/ui/crt-field/config.ts`, `CRT_FIELD_CONFIG.id` = **`clr-crt-field/shipping-2026-11-02.3`**. Values (the TASK-006 shipping configuration, unchanged by this task): lines `periodPx` 3, `thicknessPx` 1, `opacity` 0.12, `curvaturePx` 6, `driftSecondsPerPeriod` 0.6; grain `opacity` 0.07, `frequency` 0.85, `featherPx` 0.4, `refreshHz` 0.5, `frames` 8, `tilePx` 160; vignette `clearFraction` 0.62, `opacity` 0.3; perimeter `blurPx` 1.6, `widthFraction` 0.14. |
| Archived reference (named separately) | `crt-iab-current-settings.json`, SHA-256 `3169d4608c8babe17a20670bd59f53e3110c7ce917641786d33c2713943ca033` (`CRT_FIELD_REFERENCE`). It is reference identity only. It was not measured, and it is not the shipping values. The prototype's variable names and numeric values are not required (owner clarification, November 2, 2026). |
| Skin / motion | `clear` skin; `reducedMotion: no-preference` (motion running). |

## Methodology

The comparison is run by `e2e/effects/performance-comparison.spec.ts`:

```sh
npx playwright test --project=mobile e2e/effects/performance-comparison.spec.ts
```

**Harness.** The spec uses the repository's Playwright `mobile` project for its device settings.
It edits no shared configuration, and none needed changing.
- It builds the workspace once with synthetic Supabase values, then serves the build on its own
  port (5860 or above).
- All data is intercepted and read-only:
  - an onboarded profile and one location;
  - no write and no model call;
  - nothing leaves the origin, which every run asserts;
  - service workers are blocked.
- Busy and error are controlled previews, not live generation:
  - **busy:** the generation request is held unanswered;
  - **error:** the request is then answered with a synthetic 503.

**Order.** There are six runs, three per mode, each in a fresh browser context, in the order
off, on, on, off, off, on. That balances order and warm-up effects. Each run checks it is what it
claims to be:
- effects on: one `.clr-crt-field` and four Echo sources on `/generate`;
- effects off: no field and no Echo sources.

**The flow.** Every run goes through the same steps:

1. **Cold load.** Open `/generate` in a new context: empty HTTP cache, no service worker.
   - Record Navigation Timing (response end, DOMContentLoaded, load).
   - Record first contentful paint, largest contentful paint (LCP) and *Generate ready*: the first
     moment a MutationObserver sees the Anchor group.
   - Record resource count, transfer bytes and long tasks.
2. **Warm load.** Reload the same page (HTTP cache warm) and record the same metrics.
3. **Idle `/generate`, 3 s.** Frame pacing.
4. **Input.**
   - Six taps on the Anchor chips (a pointer at the centre of each chip).
   - Six arrow-key steps on the Intensity slider.
   - Each is timed from the event to the second following `requestAnimationFrame`, so the change
     has been through one rendered frame.
   - Event Timing entries of at least 16 ms are collected.
5. **Scroll `/generate`, 3 s.** The scroll region is scrolled by a script every frame (±12 px
   sine), while frame pacing is recorded.
6. **Busy, 2 s.** *Generate workout* is pressed and the request held; the screen shows a busy
   status. Frame pacing.
7. **Error, 1.5 s.** The held request is answered with a 503; an alert with Retry appears. Frame
   pacing. Then Cancel.
8. **Navigation.** Generate → Home (with **idle Home, 2 s**, frame pacing) → Settings. Tap
   Visual effects to switch the mode, then tap again to restore it; each tap is timed to the next
   frame, and the field's presence is checked after each. Then Back → Home → *Generate workout* →
   `/generate`. Each navigation is timed from the action to the screen appearing plus two frames.
   This is wall-clock time, including Playwright's round trips, so it is coarse.
9. **Memory and rendering work.** Force a garbage collection, then read:
   - `performance.memory` and the DevTools `Performance.getMetrics` values: JS heap, DOM nodes,
     layout and style-recalc counts and durations, script and task durations, accumulated over
     the run;
   - the number of running Web Animations.

**Measures.**
- **Frame pacing** is the gaps between `requestAnimationFrame` callbacks: frames, fps, p50, p95,
  p99, maximum, standard deviation, and how many gaps exceed 20, 33 and 50 ms.
- **Main-thread long tasks** are Long Tasks API entries (50 ms or more), drained separately for
  each phase.

**Spec failure rule.** The spec fails only when one of these happens:
- a required identity field or a raw-measurement record is missing;
- a run is not what it claims (field present or absent in the wrong mode);
- a write leaves the page.

It enforces no threshold. Each run writes `visual-effects-performance.json` (every raw value,
including the frame and long-task lists and the Event Timing entries) and
`visual-effects-performance.md` (the tables below), and attaches both to the Playwright report.

The tables below are copied unchanged from the run recorded above (2026-11-03T01:15Z UTC). The
earlier development run of the same spec showed the same pattern: no long tasks in either mode,
zero frame gaps over 20 ms with effects off, and occasional 33 ms gaps with effects on. Its heap
figures were taken without a forced garbage collection and are not used here.

## Raw measurements

Columns are per run; nothing is averaged. "ms" is milliseconds; "s" is seconds of main-thread
time accumulated over the whole run.

#### What each run measured

| Run | Mode | CRT fields | Echo sources on /generate | device-pixel ratio | inner width | inner height | visual viewport scale |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | off | 0 | 0 | 3 | 390 | 844 | 1 |
| 1 | on | 1 | 4 | 3 | 390 | 844 | 1 |
| 2 | on | 1 | 4 | 3 | 390 | 844 | 1 |
| 3 | off | 0 | 0 | 3 | 390 | 844 | 1 |
| 4 | off | 0 | 0 | 3 | 390 | 844 | 1 |
| 5 | on | 1 | 4 | 3 | 390 | 844 | 1 |

#### Cold load (/generate, new context)

| Run | Mode | response end ms | DCL ms | load ms | FCP ms | LCP ms | Generate ready ms | resources | transfer bytes | long tasks | long-task total ms | long-task max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | off | 4.4 | 28.2 | 28.6 | 92 | 388 | 365.5 | 17 | 321249 | 0 | 0 | 0 |
| 1 | on | 3.9 | 25.9 | 26.2 | 64 | 408 | 367.3 | 17 | 321249 | 0 | 0 | 0 |
| 2 | on | 2.7 | 24.3 | 24.6 | 64 | 408 | 364.9 | 17 | 321249 | 0 | 0 | 0 |
| 3 | off | 2.7 | 25.2 | 25.5 | 60 | 384 | 361.3 | 17 | 321249 | 0 | 0 | 0 |
| 4 | off | 2.8 | 24 | 24.3 | 68 | 68 | 363.5 | 17 | 321249 | 0 | 0 | 0 |
| 5 | on | 2.7 | 24.5 | 24.8 | 64 | 408 | 373.6 | 17 | 321249 | 0 | 0 | 0 |

#### Warm load (/generate reloaded)

| Run | Mode | response end ms | DCL ms | load ms | FCP ms | LCP ms | Generate ready ms | resources | transfer bytes | long tasks | long-task total ms | long-task max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | off | 2.4 | 20.4 | 20.5 | 72 | 364 | 340 | 17 | 321249 | 0 | 0 | 0 |
| 1 | on | 2.3 | 17.6 | 17.6 | 48 | 48 | 337.3 | 17 | 321249 | 0 | 0 | 0 |
| 2 | on | 3.4 | 18.8 | 18.8 | 48 | 368 | 338.3 | 17 | 321249 | 0 | 0 | 0 |
| 3 | off | 2.3 | 17.9 | 18 | 64 | 364 | 336.6 | 17 | 321249 | 0 | 0 | 0 |
| 4 | off | 2.1 | 19.7 | 19.8 | 60 | 364 | 338.1 | 17 | 321249 | 0 | 0 | 0 |
| 5 | on | 1.9 | 17.6 | 17.6 | 48 | 364 | 337.9 | 17 | 321249 | 0 | 0 | 0 |

#### Frame pacing — idle /generate (3 s)

| Run | Mode | frames | fps | p50 ms | p95 ms | p99 ms | max ms | sd ms | >20 ms | >33 ms | >50 ms | long tasks | long-task total ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | off | 181 | 60.3 | 16.7 | 16.8 | 16.8 | 16.8 | 0.74 | 0 | 0 | 0 | 0 | 0 |
| 1 | on | 181 | 60.3 | 16.7 | 16.7 | 16.8 | 16.8 | 1.23 | 0 | 0 | 0 | 0 | 0 |
| 2 | on | 182 | 60.7 | 16.7 | 16.7 | 16.8 | 16.8 | 1.31 | 0 | 0 | 0 | 0 | 0 |
| 3 | off | 181 | 60.3 | 16.7 | 16.7 | 16.8 | 16.8 | 0.63 | 0 | 0 | 0 | 0 | 0 |
| 4 | off | 181 | 60.3 | 16.7 | 16.7 | 16.8 | 16.8 | 0.62 | 0 | 0 | 0 | 0 | 0 |
| 5 | on | 181 | 60.3 | 16.7 | 16.8 | 16.8 | 33.4 | 1.76 | 1 | 1 | 0 | 0 | 0 |

#### Frame pacing — scrolling /generate (3 s)

| Run | Mode | frames | fps | p50 ms | p95 ms | p99 ms | max ms | sd ms | >20 ms | >33 ms | >50 ms | long tasks | long-task total ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | off | 181 | 60.3 | 16.7 | 16.7 | 16.8 | 16.8 | 1.07 | 0 | 0 | 0 | 0 | 0 |
| 1 | on | 180 | 60 | 16.7 | 16.8 | 16.8 | 33.2 | 1.6 | 1 | 0 | 0 | 0 | 0 |
| 2 | on | 180 | 60 | 16.7 | 16.8 | 16.8 | 33.4 | 1.42 | 1 | 0 | 0 | 0 | 0 |
| 3 | off | 181 | 60.3 | 16.7 | 16.7 | 16.8 | 16.8 | 0.21 | 0 | 0 | 0 | 0 | 0 |
| 4 | off | 181 | 60.3 | 16.7 | 16.7 | 16.8 | 16.8 | 0.43 | 0 | 0 | 0 | 0 | 0 |
| 5 | on | 175 | 58.3 | 16.7 | 16.8 | 33.4 | 33.4 | 3.14 | 6 | 1 | 0 | 0 | 0 |

#### Frame pacing — busy, held generation (2 s)

| Run | Mode | frames | fps | p50 ms | p95 ms | p99 ms | max ms | sd ms | >20 ms | >33 ms | >50 ms | long tasks | long-task total ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | off | 122 | 61 | 16.7 | 16.8 | 16.8 | 16.8 | 1.58 | 0 | 0 | 0 | 0 | 0 |
| 1 | on | 121 | 60.5 | 16.7 | 16.8 | 16.8 | 33.3 | 2.3 | 1 | 0 | 0 | 0 | 0 |
| 2 | on | 122 | 61 | 16.7 | 16.7 | 16.8 | 16.8 | 2.56 | 0 | 0 | 0 | 0 | 0 |
| 3 | off | 122 | 61 | 16.7 | 16.7 | 16.8 | 16.8 | 1.53 | 0 | 0 | 0 | 0 | 0 |
| 4 | off | 121 | 60.5 | 16.7 | 16.7 | 16.8 | 16.8 | 0.2 | 0 | 0 | 0 | 0 | 0 |
| 5 | on | 121 | 60.5 | 16.7 | 16.7 | 16.8 | 16.8 | 1.06 | 0 | 0 | 0 | 0 | 0 |

#### Frame pacing — error, synthetic 503 (1.5 s)

| Run | Mode | frames | fps | p50 ms | p95 ms | p99 ms | max ms | sd ms | >20 ms | >33 ms | >50 ms | long tasks | long-task total ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | off | 91 | 60.7 | 16.7 | 16.8 | 16.8 | 16.8 | 1.13 | 0 | 0 | 0 | 0 | 0 |
| 1 | on | 90 | 60 | 16.7 | 16.8 | 33.3 | 33.3 | 2.16 | 1 | 0 | 0 | 0 | 0 |
| 2 | on | 91 | 60.7 | 16.7 | 16.8 | 16.8 | 16.8 | 1.14 | 0 | 0 | 0 | 0 | 0 |
| 3 | off | 91 | 60.7 | 16.7 | 16.8 | 16.8 | 16.8 | 1.16 | 0 | 0 | 0 | 0 | 0 |
| 4 | off | 91 | 60.7 | 16.7 | 16.7 | 16.8 | 16.8 | 1.21 | 0 | 0 | 0 | 0 | 0 |
| 5 | on | 86 | 57.3 | 16.7 | 33.3 | 33.4 | 33.4 | 4.26 | 5 | 2 | 0 | 0 | 0 |

#### Frame pacing — idle Home (2 s)

| Run | Mode | frames | fps | p50 ms | p95 ms | p99 ms | max ms | sd ms | >20 ms | >33 ms | >50 ms | long tasks | long-task total ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | off | 121 | 60.5 | 16.7 | 16.7 | 16.8 | 16.8 | 0.39 | 0 | 0 | 0 | 0 | 0 |
| 1 | on | 118 | 59 | 16.7 | 16.8 | 33.3 | 33.4 | 2.63 | 3 | 0 | 0 | 0 | 0 |
| 2 | on | 117 | 58.5 | 16.7 | 16.8 | 33.3 | 33.4 | 3.38 | 4 | 1 | 0 | 0 | 0 |
| 3 | off | 121 | 60.5 | 16.7 | 16.7 | 16.8 | 16.8 | 0.45 | 0 | 0 | 0 | 0 | 0 |
| 4 | off | 121 | 60.5 | 16.7 | 16.8 | 16.8 | 16.8 | 0.48 | 0 | 0 | 0 | 0 | 0 |
| 5 | on | 116 | 58 | 16.7 | 33.3 | 33.4 | 33.4 | 4.3 | 7 | 1 | 0 | 0 | 0 |

#### Input to second next frame

| Run | Mode | Anchor taps ms | Intensity keys ms | Visual effects first tap ms | Visual effects restore tap ms | input long tasks | input long-task total ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | off | 36.4, 27.1, 27.6, 27.6, 27.9, 28.4 | 18.5, 24.6, 31.6, 21.6, 25.8, 32.3 | 30.8 | 25.3 | 0 | 0 |
| 1 | on | 59.4, 28.2, 27.3, 28.5, 28.8, 29.7 | 21.8, 31.2, 25.8, 33, 23.7, 30.6 | 27.9 | 34.9 | 0 | 0 |
| 2 | on | 59, 26.3, 28.5, 28.5, 27.7, 30.3 | 20.9, 31.1, 25.8, 20.2, 28.7, 19.7 | 45.9 | 34.4 | 0 | 0 |
| 3 | off | 33.7, 27.2, 28, 27.4, 27.8, 27.9 | 22, 29.7, 18.7, 27.2, 19.1, 27.2 | 30.9 | 24.9 | 0 | 0 |
| 4 | off | 37.8, 26.6, 27.6, 28.4, 28.2, 27.4 | 20.7, 29.8, 20.1, 29.2, 18.9, 27.7 | 30.7 | 25 | 0 | 0 |
| 5 | on | 47.3, 28.4, 28.9, 28.8, 29.5, 28.7 | 22.1, 19, 28.6, 21.2, 30.3, 21.7 | 27.8 | 34.1 | 0 | 0 |

The two Visual effects taps go in opposite directions in the two modes:
- **on runs:** the first tap turns the field off and the restore tap turns it on;
- **off runs:** the first tap turns it on and the restore tap turns it off.

#### Navigation, action to settled screen

| Run | Mode | Generate→Home ms | Home→Settings ms | Settings→Home ms | Home→Generate ms | long tasks | long-task total ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | off | 68 | 97 | 60 | 99 | 0 | 0 |
| 1 | on | 76 | 102 | 94 | 106 | 0 | 0 |
| 2 | on | 76 | 85 | 74 | 91 | 0 | 0 |
| 3 | off | 68 | 97 | 63 | 101 | 0 | 0 |
| 4 | off | 69 | 97 | 63 | 101 | 0 | 0 |
| 5 | on | 78 | 87 | 76 | 94 | 0 | 0 |

#### Memory and rendering work at the end of the flow

| Run | Mode | JS heap used B | JS heap total B | DOM nodes | layouts | style recalcs | layout s | recalc s | script s | task s | running animations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | off | 7249964 | 9306112 | 609 | 133 | 478 | 0.017 | 0.059 | 0.07 | 0.465 | 3 |
| 1 | on | 7328312 | 8257536 | 670 | 135 | 1029 | 0.019 | 0.103 | 0.103 | 0.63 | 11 |
| 2 | on | 7329144 | 8519680 | 670 | 132 | 1033 | 0.018 | 0.101 | 0.102 | 0.617 | 11 |
| 3 | off | 7249520 | 8781824 | 609 | 133 | 483 | 0.017 | 0.056 | 0.066 | 0.445 | 3 |
| 4 | off | 7249528 | 9043968 | 609 | 133 | 480 | 0.017 | 0.058 | 0.068 | 0.456 | 3 |
| 5 | on | 7330008 | 8519680 | 670 | 132 | 1029 | 0.018 | 0.103 | 0.102 | 0.625 | 11 |

## Unmeasured and not proven

| Metric | State | Why |
| --- | --- | --- |
| Physical phone: any metric, thermal behaviour, battery | **Unmeasured** | No phone was used, and none was required. Emulation and software rendering are not phone evidence. |
| Hardware-GPU compositing and raster cost | **Unmeasured** | This browser composited and rasterised in software (`gpu_compositing: disabled_software`). Cost on a hardware GPU may be higher or lower; it is not proven either way. |
| GPU process time and GPU memory | **Unmeasured** | Neither the page APIs nor the DevTools metrics used here report them. |
| Frames actually presented / dropped by the compositor | **Unmeasured** | Frame pacing here is the gap between main-thread `requestAnimationFrame` callbacks. It does not show compositor-only frames or what reached the display. |
| Refresh rates above 60 Hz | **Unmeasured** | Headless Chromium paced frames at 60 Hz. |
| `performance.measureUserAgentSpecificMemory()` | **Unmeasured** | The page is not cross-origin isolated (`crossOriginIsolated: false`). |
| `navigator.deviceMemory` | **Unmeasured** | Not exposed in this context. |
| Touch-gesture (fling) scrolling | **Not proven** | Scrolling was driven by a script, not by touch input. |
| Network-realistic cold load | **Not proven** | Loads came from localhost with no network or CPU throttling. "Cold" means an empty HTTP cache, not a slow network. |
| LCP comparison | **Inconclusive, not proven** | LCP alternates between about 48–68 ms and about 364–408 ms in both modes (runs 1-warm and 4-cold took the early candidate). |
| Interaction to Next Paint (INP) | **Not proven** | Event Timing entries are in the raw JSON but are not summarised or compared here. The input table above is the reported input measure. |
| Skins other than `clear`; reduced motion on | **Not measured here** | Out of this flow's scope. Reduced-motion and hidden-tab behaviour is proven by TASK-007, not measured for cost. |
| Which elements cause the extra style recalculations and animations with effects on | **Not proven** | Counts were recorded but not attributed to elements. |

## Findings for the owner's final review

These describe this environment only. None is a pass or a fail.

1. **Load: no material difference measured.**
   - Both modes fetched the same 17 resources, 321,249 bytes; the field loads nothing of its own.
   - Generate ready: 361–366 ms off against 365–374 ms on (cold), and 336.6–340 ms off against
     337.3–338.3 ms on (warm).
   - No long task occurred during any load.
2. **Long tasks: none in either mode.** Not one long task of 50 ms or more occurred in any phase
   of any run.
3. **Frame pacing: a small, consistent effects-on regression. This is the main remaining one.**
   - With effects **off**, all 15 measured pacing phases had zero gaps over 20 ms.
   - With effects **on**, 30 gaps were over 20 ms (single missed frames of about 33 ms). By phase:
     - idle Home: 3, 4 and 7;
     - error: 1, 0 and 5;
     - scrolling: 1, 1 and 6;
     - idle `/generate`: 0, 0 and 1;
     - busy: 1, 0 and 0.
   - No gap exceeded 50 ms in either mode.
   - The worst phase rate was 57.3 fps on, against 60.7 fps off. Pacing spread (sd) rose from
     about 0.2–1.6 ms off to about 1.1–4.3 ms on.
   - No main-thread task of 50 ms or more was recorded. Shorter main-thread work and compositor
     cost are not separated by this measurement; neither the cause nor hardware-GPU behaviour
     is proven.
4. **Main-thread work over the flow: higher with effects on.**
   - Style recalculations: 1,029–1,033 on against 478–483 off (about 2.1×). Recalculation time
     about +0.045 s.
   - Script time about +0.035 s. Total task time 0.617–0.630 s on against 0.445–0.465 s off
     (about +0.17 s, about +37 %, over a run of roughly 25 s).
   - Running Web Animations: 11 on against 3 off.
5. **Input: the first tap is slower; later input is not.**
   - The first Anchor tap after load took 47.3–59.4 ms on against 33.7–37.8 ms off. Later taps
     and the Intensity keys overlap between modes (about 26–30 ms and 18–33 ms).
   - Turning the field **on** from Settings took 30.7–30.9 ms in off runs and 34.1–34.9 ms in on
     runs. Turning it **off** took 24.9–25.3 ms (off runs) and 27.8–45.9 ms (on runs); 45.9 ms
     is a single outlier.
6. **Navigation: slightly slower with effects on.**
   - Generate → Home: 76–78 ms on against 68–69 ms off.
   - Settings → Home: 74–94 ms on against 60–63 ms off.
   - Home → Settings and Home → Generate overlap between modes.
   - These are coarse wall-clock times.
7. **Memory: small.** With effects on, after a forced garbage collection:
   - JS heap used about +80 KB (7.33 MB against 7.25 MB);
   - DOM nodes +61 (670 against 609).

## Tuning options for the shipping configuration

These are options only. This task changes neither the TASK-006 implementation nor
`CRT_FIELD_CONFIG`. Any change needs a new `CRT_FIELD_CONFIG.id`, the fidelity specs, this spec
and the owner's review. Options that change the appearance are marked; none may ship silently.

- **Perimeter backdrop blur** (`perimeter.blurPx` 1.6, `widthFraction` 0.14). A backdrop filter
  is the costliest layer to composite. TASK-006 already limited it to edge strips after a full
  backdrop blur halved the frame rate. A narrower `widthFraction` or a smaller `blurPx` reduces
  the blurred area. *Changes the appearance.*
- **Line drift** (`lines.driftSecondsPerPeriod` 0.6). This is a continuous transform animation,
  so the field repaints or recomposites every frame. A slower drift does not reduce the frame
  count. Pausing drift while idle would, but *changes the appearance and motion* and is an owner
  decision.
- **Grain refresh** (`grain.refreshHz` 0.5, `frames` 8, `tilePx` 160). It is already slow. A
  larger tile reduces repetition but costs raster memory, and the effect on pacing is not proven.
  *Changes the appearance.*
- **Line density** (`lines.periodPx` 3 at device-pixel ratio 3). More lines mean more path
  geometry to raster; whether that affects pacing is not proven. A larger period *changes the
  appearance*.

## Mitigations the evidence supports

- **No appearance change is supported by this evidence alone.** There are no long tasks, no
  material load cost and no extra resources. The pacing regression is single missed frames on a
  software-rendered browser, without attributing the cause. That is not enough to justify an
  appearance-changing fallback, and none is made.
- **Investigation without an appearance change:**
  - Rerun this spec on a hardware-GPU browser (headed Chromium, or a CI runner with a GPU) to see
    whether the missed frames remain.
  - Use a DevTools performance trace on effects-on idle Home to find which layer is repainted
    each frame, and what causes the extra style recalculations and animations.
- **The fallback path is unchanged.** If the owner finds the cost not acceptable, a lighter or
  static decoration fallback is selected under the existing criterion, effects stay on by
  default, and the decision is recorded in [Owner decision](#owner-decision-final-review). It is
  built as a follow-up revision.

## Proposals for the owner (not adopted)

These are **proposals for the owner's final review**, made with the completed browser preview
(Q-003). None is a requirement, and none is enforced by any spec.

- *Proposal:* effects on causes no main-thread long task in the flows above (true in this run).
- *Proposal:* effects on adds no request or transfer bytes to the load (true in this run).
- *Proposal:* a frame-pacing budget for effects on, for example a maximum number of gaps over
  33 ms per 2 s of idle. It would be set only after a hardware-GPU run, because software
  rendering may overstate or understate the cost.
- *Proposal:* a first-input latency budget for effects on, set relative to effects off on the
  same device, if the owner wants one.

## Reproduce

```sh
npx playwright test --project=mobile e2e/effects/performance-comparison.spec.ts
npx playwright show-report   # attachments: visual-effects-performance.json / .md
```

Use the attached `.md` to refresh the tables above, and update the identity table from the
attached JSON's `identity` block.
