# clear-effects-2026-10-30 · TASK-006 — browser-native CRT Glass field replaces the old decorative scanlines

This is the task's own progress record. Under the owner-selected policy it satisfies the
repository's shared daily-journal requirement for this body. TASK-008 consolidates it.

## Identity

- Body: `clear-effects-2026-10-30`, task `TASK-006`, issue #607, REQ-006, journey JOURNEY-003
  (completion owner).
- Branch: `agent-runner/task-006-a5-fc2ea285` (attempt 5 of 5). Base: `3b5eab5` (TASK-005 merged,
  #618). Nothing was committed, pushed or opened as a PR.
- Earlier attempts 1–4 left no recoverable work in this workspace, so this attempt started from
  the base. Attempt 3 failed controller verification on `npm test`, which failed only the 2
  source-bound audit cases.

## Intended outcome

One live CRT Glass field, built from browser-native layers over the real interactive HTML. It is
mounted once in the TASK-001 root effects host and is the only decorative scanline signal. The old
atmosphere, frame and dialog-backdrop scans are retired in repository-owned CSS, and busy sweeps are
kept. The atmosphere stays live and reads the TASK-001 policy. One documented shipping
configuration controls the field. Real-browser composition and overhead proof go with it.

## Changes

- `src/ui/crt-field/config.ts` (new) is **the shipping configuration** and its public API:
  `CRT_FIELD_CONFIG`, `CRT_FIELD_REFERENCE`, `crtFieldCustomProperties`, `crtFieldLinePath` and
  `crtFieldGrainTile`. Identity: `clr-crt-field/shipping-2026-11-02.3`. Values, in CSS px and seconds:
  - lines: period 3, thickness 1, opacity 0.12, curvature 6 px bow at top and bottom,
    drift 0.6 s per period;
  - grain: opacity 0.07, frequency 0.85, feather 0.4 px (blur inside the grain tile only),
    refresh 0.5 Hz, 8 placements, 160 px tile;
  - vignette: clear fraction 0.62, opacity 0.3;
  - perimeter: blur 1.6 px, width 0.14 of the half-size.

  The archived `crt-iab-current-settings.json` identity (SHA-256 `3169d460…a033`) is kept
  separately as reference only. TASK-005's `src/ui/crt-glass/` was not edited.
- `src/ui/crt-field/crt-field.tsx` and `crt-field.css` (new) own the layers, masking and lifecycle:
  - four edge-strip `backdrop-filter` blurs faded toward the centre;
  - one inline SVG path of curved lines, drifting by a transform Web Animation;
  - a feathered noise tile stepped by a separate Web Animation;
  - a static radial vignette.

  The field uses `pointer-events: none` and `z-index` 5, above the shell and below the skip link,
  focus brackets and top layer. Effects off unmounts it. When motion is disallowed, both clocks are
  paused in place. There is no canvas, image, capture or readback.
- `src/app/RootLayout.tsx`: the root `EffectsHost` mounts `<CrtField>` once while effects are on.
- `src/ui/atmosphere.tsx`: the `.clr-atmosphere__scan` markup is removed. `AtmosphereLayer` reads
  the TASK-001 policy and is `still` when motion is disallowed. Outside the root provider it falls
  back to the OS preference.
- `src/styles/atmosphere.css` holds the retirement overrides, with an inventory in its comments:
  - `.clr-atmosphere__scan { display: none }`;
  - `.clr-chamfer::before { background-image: none }`. The busy rules are more specific, so their
    sweep is untouched;
  - `.clr-dialog::backdrop { --frame-scan: none }`. The noise and tint layers stay.

  `[data-static]` now pauses the blobs instead of removing their animation, so they resume from
  where they stopped. The 0.14.3 import was not edited. `.scanlines-overlay` is unused and not
  treated as active.
- Gallery: `CrtField` entry with two specimens, a `.clr-dev-gallery__crt-frame` frame in
  `src/dev/gallery.css`, and a hand-updated `docs/design/library/COMPONENTS.md` row (byte-identical to
  generator output; `--check` passes). Running `node scripts/gallery-index.mjs` in write mode needed an
  approval that was not available.
- Tests:
  - `src/app/atmosphere.test.tsx`: updated for the retired scan, the host's two children,
    effects-off still and pause CSS;
  - `src/app/scanline-replacement.test.tsx` (new, 15 tests);
  - `src/test/pwa-viewport.test.tsx`: one assertion updated, because it asserted the retired scan;
  - `e2e/effects/crt-live/harness.ts` (task-owned helper);
  - `e2e/effects/crt-composition-fidelity.spec.ts` (6 tests);
  - `e2e/effects/crt-live-overhead.spec.ts` (1 test).
- `PROJECT_MAP.md`: new `src/ui/crt-field/` row.

## Failures and corrections

1. **Full-viewport backdrop blur halved frame pacing.** The first overhead profile showed rAF p95
   at 33.3 ms with effects on and 16.7 ms with effects off (SwiftShader). Disabling the blur alone
   restored 16.7 ms, so the blur was the whole cost. It was corrected by blurring only four edge
   strips with no corner overlap. The profile now shows p95 16.7–16.8 ms on both sides, and
   perimeter softness is kept.
2. **Local `@keyframes` are forbidden** by `design-system-097-deprecations.test.ts`. The drift and
   grain moved from CSS keyframes to Web Animations created from the same configuration.
3. **Gallery contracts.** Each entry needs at least 2 specimens, and only one
   `.clr-dev-gallery__atmosphere` frame is allowed. I added a "field clocks paused" specimen and a
   dedicated frame class.
4. The spec's mask assertion and its periodicity check needed adjustment for computed-style
   serialization and Mono's low-frequency content. I detrended over one period. No threshold was
   loosened to pass.

## Verification (final tree)

- `npx vitest run src/app/atmosphere.test.tsx src/app/scanline-replacement.test.tsx`: 66/66 passed.
- `node scripts/gallery-index.mjs --check`: "54 registered component entries verified."
- `npx playwright test --project=mobile e2e/effects/crt-composition-fidelity.spec.ts`: 6/6 passed,
  covering 4 skins with Echo-only and then the composed field, live motion and transitions, and the
  gallery example. Per-skin capture pairs and JSON provenance are in `test-results/` (reference
  host and sources, settings SHA-256, shipping identity and values, app commit and field-source
  hashes, skin, viewport, DPR 3, device render scale, source and motion state).
- `npx playwright test --project=mobile e2e/effects/crt-live-overhead.spec.ts`: 1/1 passed. No
  capture, readback or encoding call and no extra resource with effects on. Profile on
  SwiftShader (ANGLE Vulkan, software; not phone evidence), off → on:
  - idle: 60.3 fps, p95 16.7 ms → 60.3 fps, p95 16.7 ms;
  - scroll: 60.7 fps → 60.3 fps;
  - Home: 60.5 fps → 60.5 fps;
  - long tasks: 0 → 0;
  - tap to next frame: 34.5 ms → 62.9 ms. This is one noisy sample; earlier runs measured
    37.2 → 29.6 and 38.9 → 27.2 ms;
  - JS heap: about 35 MB → about 47 MB. With effects off the policy also stills the six atmosphere
    blob animations, so the sides differ by more than the field.
- `npm run typecheck`: passed. `npm run lint`: 0 errors and 156 warnings, none in the new files.
  `npm run lint:ds`: passed. `npm run build`: passed.
- `npm test`: **failed 2 of 6046 tests**, both in `src/test/design-0143-final-audit.test.ts`
  (runtime-source binding and the eight-cell capture group). See below.

## Unresolved

- **Audit refresh not done (unmet).** The runtime source changed, so the source-bound audit needs
  the existing collector (`e2e/design-0143/format-preview.spec.ts`, selector
  `FORMAT_EVIDENCE_DIR` in `e2e/design-0143/format-preview-evidence.ts`). It must run against a
  frozen commit into a new group, with the lineage binding in the audit test set to this task's
  runner revision, run and base. This workspace has no TASK-006 revision identity in its sources
  and no collector environment file. I did not invent metadata, edit hashes or run a partial
  capture. Next safe action (operator): freeze this tree, set the new group and TASK-006 binding,
  run the collector with the PRE-003 account, and record the result.
- **Likely regression in completed specs, not run here (the command needed an approval I did not
  have).** `e2e/effects/echo-applied-fidelity.spec.ts` (TASK-004) compares effects on/off pixels
  inside frames and assumes "no CRT field is mounted". With the field on, those interiors will
  differ. `e2e/ui-polish-pwa-viewport.spec.ts:203` and `e2e/ui-polish-b05-sheet-surface.spec.ts:1007`
  also reference the retired scans. These are other tasks' contracts and were not edited. The
  owner or TASK-007 needs to decide how they hold the field off.
- Dialogs and sheets render in the browser top layer above the field, so the field shows through
  their backdrop but not over their content.
- Visual discrepancies for owner UAT: the reference is a raster shader over a fixed specimen, and
  the app is live layers, so pixels are not expected to match. Lines are restrained (opacity 0.12),
  and the vignette is lighter than the reference. Owner visual approval is pending final UAT and is
  not claimed. The earlier inconclusive long SourceGraphic result stays a flag, not a pass. Held
  PR #619 satisfies nothing.

## Operator verification correction — 2 November 2026

Native attempt 5's field checks passed; its project verification failed only the two current-runtime audit checks. The existing native `recover-failed-workspace` feature is the recovery path for the same unpublished candidate, with every approved criterion, task and project command rerun. No app effect, requirement, Runner code/profile, attempt history or completed task is changed by this correction.

The actual task/run/revision/base identities above are supplied from the durable native state and approved round-14 graph. The existing authorized audit test-account environment is present only in ignored `.env.audit.local` (mode 0600); no values are recorded. The original authenticated collector will record a new Task006 group, retaining all prior groups byte-for-byte. The test-only lineage helper's old attempt-1-or-2 restriction is corrected to accept a positive safe-integer source attempt while retaining exact run/revision/branch/base/payload/ancestry checks; actual attempt 5 is independently exercised by its synthetic structural-incorporation regression.

The earlier worker paragraph saying previous work was not recoverable refers only to the new a5 checkout. The a3 partial workspace and attempt-4 results are preserved separately. Native attempt 3 failed its cadence-binding task check; attempt 4 failed the two source-bound audit checks. No source-only capture or test result is owner visual approval, native completion or main/production approval. Five additional Task006 retries remain authorized by Eric (ceiling 10 if needed); none has been consumed or reset here.

Genuine capture and full native recovery verification are pending at this checkpoint.

The affected existing Echo/PWA browser checks passed 12/12 with no skips or retries after test-only compatibility corrections: the Echo-only proof explicitly holds the new CRT field off, retaining every pixel/occlusion/color threshold; viewport geometry now positively checks the single replacement field and absence of the retired atmosphere scan. The previously verified standalone-reference service-worker isolation patch is retained. The local-only B05 sheet diagnostic was not verified because its legacy source photograph is absent from this effects body's evidence; the existing deployment selector already excludes that local-only proof. Its input and tests are unchanged, and no new disclosure or gate was introduced. The effects' actual app implementation remains the native attempt-5 output.

The unchanged authenticated collector passed 4/4 skin cases, with no skips/retries, and recorded eight genuine PNGs on frozen source `9aba9e75138dc5d2c433d47e84e3a987d4c28e3b`. All 1724 prior evidence files were checked byte-identical. New payload `235a6764877ee62c933b11a452ec4ccbddf3ac184e52db03f51887dca9ba12c0` and current runtime `a894639de2084efe51c680e8ad5fe40f797b155bd05d8a6e29a30fbeb47a8c7f` are recorded in the audit. Native full workspace-recovery verification is next; no final visual approval or main/production authorization is claimed.
