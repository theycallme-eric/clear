# clear-effects-2026-10-30 · TASK-005 — CRT Glass field renderer and motion clock

Task-owned progress record. Under the owner-selected policy this record satisfies the
repository's shared daily-journal requirement for this body; TASK-008 consolidates.

## Identity

- Body: `clear-effects-2026-10-30`, task `TASK-005`, issue #606, REQ-005.
- Branch: `agent-runner/task-005-a1-5af1b379` (attempt 1), base `26885c9` (TASK-001 merged, #612).
  Nothing pushed, no PR opened.

## Intended outcome

One repository-owned CRT Glass module under `src/ui/crt-glass/`. It contains a central preset
owner, a port of the motion clock, a lazily loaded PixiJS 8.22.0 / pixi-filters 6.1.5 renderer
that follows the `glass-effect.mjs` pass order, and a policy-driven field component. Unit,
build-boundary and real-browser fidelity proofs go with it. It is not mounted in `RootLayout`, and
no old textures are retired (TASK-006 owns that).

## Changes (this session)

- `src/ui/crt-glass/preset.ts` (new) holds `CRT_GLASS_PRESET`. It has exactly the
  `crt-iab-current-settings.json` values (SHA-256 `3169d460…a033`). `CRT_GLASS_REFERENCE`
  records capture provenance and status: current-session evidence, not owner approval (Q-007).
  The pass-order source is `glass-effect.mjs`, not the export's `pipeline` label. It also
  documents the Grain feathering reference range (0.01–0.99, step 0.01, two decimals, no product
  slider) and the workbench exploratory ranges, which are not defaults. It deliberately does not use
  `working-session.mjs`, `PRESETS.selected` or `default-preset.json`.
- `src/ui/crt-glass/motion-clock.ts` (new) ports `motion-clock.mjs` exactly: phase 0.5, seed 0.57,
  step 0.1732050808, and elapsed-time `grainIndex`. `createMotionDriver` ports the `study.mjs`
  loop: 30 fps render cap and a 0.1 s per-frame clamp. It schedules nothing unless motion is
  allowed and something animates, resumes from a zero delta (no catch-up), and cancels on
  dispose.
- `src/ui/crt-glass/motion-clock.test.ts` (new) has 13 tests covering the clock and the scheduler.

## Failures and blockers

1. **Dependency install not approved (blocking).** `npm install --save-exact pixi.js@8.22.0
   pixi-filters@6.1.5` was declined by the session permission policy. Neither package is in
   `node_modules`. Without them the renderer (`CRTFilter` plus the custom pass), the field
   component, `scanline-field.test.tsx`, `bundle-boundary.test.ts` and
   `e2e/effects/crt-glass-fidelity.spec.ts` cannot be built or run. Copying the prototype
   `vendor/pixi.min.js` / `filters.js` into the repository is forbidden by the task, so it was
   not done. `npx` commands and `npm test -- <file>` were also gated in this session; only plain
   `npm run <script>` / `npm test` ran.
2. **Missing pattern file.** The task says to follow `src/dev/prod-exclusion.test.ts`, but that
   file does not exist in this tree. The nearest existing build-output pattern is
   `src/styles/fonts.test.ts`, which calls Vite `build()` in `beforeAll`.
3. **Audit runtime-hash binding (expected, same as TASK-001).** `src/test/design-0143-final-audit.test.ts`
   pins a SHA-256 over all runtime files under `src/` (excluding design-system, test, dev and
   `*.test.ts(x)`). The mandated `src/ui/crt-glass/preset.ts` and `motion-clock.ts` change that
   hash, so `npm test` cannot pass until the owner-authorized capture and rebind flow runs again.
   That flow needs external services and credentials, so it was not run, and no hash was edited
   by hand.
4. **Host integration gap, reported before adoption.** The saved pass blurs edges, protects colour
   and scales RGB from the underlying pixels. Over live DOM with no DOM-to-texture capture there
   are no underlying pixels, so the exact pass applies only to textures the app itself owns.
   Over live UI it can only be approximated, for example as a light-modulation overlay. TASK-006
   (texture surface) must decide this. It is not solved here by rasterising the app.

## Verification (this tree)

- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0, 0 errors and 149 warnings, all pre-existing. None are in `src/ui/crt-glass/`.
- `npm run lint:ds`: exit 0.
- `npm test`: **exit 1**. 241 of 242 files and 5952 of 5954 tests passed, including the new
  `motion-clock.test.ts`. The only failures are the 2 audit binding cases in
  `src/test/design-0143-final-audit.test.ts` described in blocker 3.
- Not run, blocked by item 1: `npm run build && npx vitest run src/ui/crt-glass/bundle-boundary.test.ts`
  and `npx playwright test --project=mobile e2e/effects/crt-glass-fidelity.spec.ts`. No
  fidelity, pixel-identity or motion claim is made.

## Assumptions and next action

- Assumed: the clock's 0.1 s per-frame clamp and the 30 fps `now - lastRender >= 1000/30` test are
  part of the preserved host loop, and are ported unchanged so host and app frames align in the
  fidelity spec.
- Next safe action (owner): approve installing `pixi.js@8.22.0` and `pixi-filters@6.1.5` as exact
  dependencies, and allow `npx vitest` / `npx playwright`. Then implement `renderer.ts` (lazy chunk:
  `Application`, `Sprite`, `Filter`, `GlProgram` and `pixi-filters/crt` only), `scanline-field.tsx`,
  the two remaining unit tests and the fidelity spec. Decide the audit rebind for this body.

## Attempt 2 — 2 November 2026

Branch `agent-runner/task-005-a1-5af1b379`, carried forward from attempt 1 and merged with
`f39873c` (TASK-201). Nothing pushed, no PR opened. Attempt 1 failed controller verification
because `e2e/effects/crt-glass-fidelity.spec.ts` did not exist ("No tests found").

### Correction to attempt 1's blocker 1

Installing `pixi.js` / `pixi-filters` was declined again, so the renderer does not depend on them.
It reproduces the reference pipeline in plain WebGL2 (`renderer.ts`). It carries over only the
parts the pipeline uses (`shaders.ts`): the PixiJS 8.22.0 filter vertex program, the pixi-filters
6.1.5 CRTFilter fragment (verbatim, with both full MIT notices in a preserved `/*! @license */`
block), and the custom pass from `glass-effect.mjs` (verbatim). Pixi's filter-input geometry was
read from the vendored `pixi.min.js`: screen-fitted 390 × 844 RGBA8 linear textures,
`uInputSize`, a half-texel `uInputClamp` rounded as Pixi's Float32Array rounds it, root
`uOutputTexture.z = −1`, the (0,0)(1,0)(1,1)(0,1) quad and premultiplied normal blending. No
prototype bundle and no npm dependency is added. The browser proof below compares it with the
actual vendored libraries.

Attempt 1's blocker 2 is unchanged (`src/dev/prod-exclusion.test.ts` does not exist). The
boundary test follows `src/styles/fonts.test.ts` instead.

### Changes (this attempt)

- `src/ui/crt-glass/shaders.ts`, `renderer.ts` (new): the three passes in `glass-effect.mjs`
  order. The CRTFilter gets lineWidth 0, lineContrast 0 and noise 0, so it supplies only the
  vignette. The custom pass does edge softness, then colour protection, then one line field and
  grain in one RGB scaling. Feathering is read only inside `grainAt`. A context-loss handler is
  included, and `destroy()` deletes every program, texture, framebuffer, buffer and vertex array
  and removes the listener. An unsupported browser or failed program throws
  `CrtGlassUnsupportedError` after releasing whatever it had allocated.
- `src/ui/crt-glass/scanline-field.tsx` + `.css` (new): `CrtGlassField`. It reads only
  `useVisualEffects()`. With Visual effects off it renders nothing and imports nothing. When on,
  it waits for an idle callback after mount (not a frame callback), then imports the renderer
  chunk, decodes the app-owned source and draws one frame at phase 0.5 and seed 0.57. Motion runs
  through `createMotionDriver` only while motion is allowed. Turning effects off or unmounting
  cancels the frame and the pending load and releases the GPU resources and decoded bitmap. Any
  failure renders nothing and leaves the surrounding UI alone. Nothing mounts it (TASK-006).
- Tests (new): `scanline-field.test.tsx` (18 cases: lifecycle, policy, pipeline shape, preset);
  `bundle-boundary.test.ts` (5 cases: `dist/` ships none of it; a build mounting the field puts
  renderer and shaders in one dynamically imported chunk, with the MIT notice and no prototype
  library); `e2e/effects/crt-glass-fidelity.spec.ts` + `crt-glass-fidelity/pixels.ts`. The spec
  serves the checkpoint read-only by route interception, starts its own Vite server, sets
  viewport and DPR per comparison, and edits no shared Playwright configuration.
- `src/dev/gallery-registry.test.tsx`: `CrtGlassField` added to the recorded not-a-specimen map,
  as TASK-003/004 did for the Echo parts. It is unmounted until TASK-006.
- `PROJECT_MAP.md`: a row for `src/ui/crt-glass/` (new directory and boundary).

### Verification (this tree, exact results)

- `npx vitest run src/ui/crt-glass/motion-clock.test.ts src/ui/crt-glass/scanline-field.test.tsx`:
  exit 0, 2 files, 31 tests passed.
- `npm run build && npx vitest run src/ui/crt-glass/bundle-boundary.test.ts`: exit 0, 5/5 passed.
- `npx playwright test --project=mobile e2e/effects/crt-glass-fidelity.spec.ts`: exit 0, 1 passed
  (≈10 s). Chromium 153.0.8010.12 headless, ANGLE/SwiftShader software GL. Software rendering
  is not phone evidence. Results from `test-results/crt-glass-fidelity/summary.json`:
  - Still: the live preserved host (`index.html` + `study.mjs` + `study.css` + `glass-effect.mjs`
    + `motion-clock.mjs`, vendored PixiJS 8.22.0 / pixi-filters 6.1.5) at phase 0.5 and seed 0.57
    against the app renderer on the same `echo-clean.jpg`, 390 × 844, resolution 1. Both
    **pixel-identical, 0 differing pixels**, at DPR 1 and at DPR 3. Host CSS render scale
    0.8205, app 1. Settings file SHA-256 `3169d460…a033`. Every reference file's SHA-256 is
    recorded.
  - Motion: all 12 matched frame pairs (preserved pass and clock vs app) are identical. Line-only
    difference 303 561 px. The full 0.60 s cycle (18 steps of 1/30 s) returns to 0 px. Grain-only
    difference 225 257 px. Grain index is 0 at 1.9 s, 1 at 2.0 s and 2 at 4.0 s (0.50 Hz). Still
    keeps phase 0.5 while grain advances, and the Still frame equals the grain-only frame (0 px).
    Feathering 0.40→0.80 changes 120 539 px with grain on and 0 px at grain 0. With colour
    protection on, protected (peak ≥ 0.65) line-only and grain-only differences are 14 745 px and
    10 803 px. The shape metrics are equal for both: horizontal (∂y 1.369 vs ∂x 0.262), curvature
    lag 2 rows at the edge, phase direction +1, grain lag-1 autocorrelation 0.140. The app clock
    equals `motion-clock.mjs` at all 183 uneven and clamped steps.
  - Live: the running host drifts and reaches grainIndex ≥ 1. The app scheduler made 33 renders
    in 1.50 s (cap 47), scheduled 0 callbacks and 0 renders while paused, resumed at exactly the
    paused phase (3.6398) and scheduled nothing after dispose.
- `npm run typecheck`: exit 0. `npm run lint`: exit 0, 0 errors (154 warnings, none in the new
  files). `npm run lint:ds`: exit 0. `npm run build`: exit 0.
- `npm test`: **exit 1**. 246/247 files and 6026/6028 tests passed. The only failures are the two
  `src/test/design-0143-final-audit.test.ts` runtime-source bindings ("requires the complete
  actual eight-cell mobile group…" and "is bound to the package and runtime source of this
  tree…"). This is attempt 1's blocker 3, and TASK-001–004 hit the same thing. The mandated
  `src/ui/crt-glass/` files change the pinned runtime hash. Rebinding needs the owner-authorized
  authenticated Format Preview recapture (disposable account, external writes, owner-approved
  bindings), so it was not run, and no hash or evidence was edited by hand.

### Unresolved assumptions and next action

- Host integration gap, reported before adoption (unchanged from attempt 1). The pass needs
  source pixels: edge blur, colour protection and RGB scaling all read them. The module therefore
  draws only from textures the app owns, and it captures no DOM. Applying it over the live DOM
  with live atmosphere is TASK-006's decision, informed by TASK-201's SourceGraphic findings.
  Nothing is rasterised here.
- Not done here: integrating current `origin/main` and a remote CI run. The runner owns
  integration and delivery for this workspace.
- Next safe action (owner): authorize the Format Preview recapture and audit rebind for this tree
  (the same flow as TASK-001–004), then run controller verification. The preset values remain
  current-session evidence, not shipping approval (Q-007).

## Owner-authorized native continuation and source evidence refresh — 2 November 2026

The owner approved one additional native attempt (ceiling2 to3), preserving the original run, workspace, branch and attempts1–2, and the existing genuine source-audit refresh. The captured-source selector and task/revision/run/base metadata now name TASK-005 under the amended approved graph; source-only branch slot a1 remains separate from native claim ordinals. No validator, assertion predicate, helper, preset or historical capture changed. The missing nonsecret reference paths were supplied through the existing ignored local test configuration; the exact isolated browser command passed1/1 in11.1s. Fresh native acceptance and delivery remain pending.
