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
