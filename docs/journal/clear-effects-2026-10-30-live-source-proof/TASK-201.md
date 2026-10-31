# TASK-201 — Live SourceGraphic filter vs the preserved CRT Glass pass (test-only investigation)

Task-owned progress record (templates/task-owned-progress.md). Under the owner-selected policy, this
record satisfies the repository's shared daily-journal requirement for this body, and its required
contents are kept intact. TASK-201 is the body's one consolidation owner. Any combined view is rendered
read-only with the Builder's `scripts/task-notes.mjs`.

## Identity

- Proof body `clear-effects-2026-10-30-live-source-proof`, task `TASK-201`, issue #616, REQ-201/202/203.
- Branch `agent-runner/task-201-a1-5d6191f3` (attempt 1), base `618532b` (TASK-001…004 delivered).
  Nothing was pushed, no PR was opened and nothing was written to an external service.

## Intended outcome

A bounded, test-only report on whether a public-browser live SourceGraphic filter can represent the
preserved CRT Glass shader. It covers measured matches, differences and practical limits. It ships
nothing, adopts nothing and revises no frozen task.

## Changes (only these files)

- `e2e/effects/crt-source-graphic-proof.spec.ts`: the proof (one test). It covers the still pair,
  per-operation sub-tests and live `/generate`.
- `e2e/effects/crt-source-graphic-proof/fixture.ts`: the one source of every CRT number.
  - Settings come from `$CLEAR_EFFECTS_CURRENT_SETTINGS`, with the SHA-256 checked.
  - Shader constants are parsed from the preserved `glass-effect.mjs` fragment and from the
    CRTFilter fragment in `vendor/filters.js`.
  - Phase and seed come from `motion-clock.mjs`. The 30 fps cap and the 0.1 s step clamp come from
    `study.mjs`.
  - All of these are read in place. If an input is missing, the spec fails and names it.
- `e2e/effects/crt-source-graphic-proof/candidate.ts`: the candidate.
  - `filter: url(#…)` on the element. It is an SVG filter graph built from feColorMatrix,
    feComponentTransfer, feComposite (arithmetic/in/over), feBlend lighten, feDisplacementMap and
    feImage, about 60 primitives.
  - Its feImage inputs are fields that do not depend on page content: edge reach, vignette, the line
    cos/sin basis and grain. A WebGL2 program draws them from the preserved GLSL lines.
  - No page code reads page pixels.
  - It runs its own motion loop and pause handling, and its cleanup releases the filter, the
    animation callbacks, the observer and the blob URLs.
- `e2e/effects/crt-source-graphic-proof/reference.ts`: serves the checkpoint read-only and runs the
  exact reference harness (`createGlassEffect` on PixiJS 8.22.0, initialised as `study.mjs` does).
- `e2e/effects/crt-source-graphic-proof/measure.ts`: pixel statistics. It has no tolerances.
- This record.

Nothing changed under `src/`, `package*.json`, `playwright.config.ts`, vendor, workflows, the audit or
frozen outputs. Nothing was installed or copied.

## Failures and corrections

1. The CRTFilter vignette regex expected `x *= vignette(…)`. The vendor actually uses
   `float v = vignette(finalColor.rgb, coord); finalColor *= vec4(v,v,v,a)`. I fixed the parser and
   made the blocker message quote the vendor `main()`.
2. Pixi's `destroy()` threw in the touch-device accessibility hook. I made harness teardown tolerant;
   it is cleanup only.
3. The specimen and harness pages had no viewport meta, so mobile emulation laid them out at 980px.
   The first source-identity check therefore failed (mean |Δ| about 45). After adding the meta,
   the Pixi texture and `<img>` are pixel-identical (0 differing pixels).
4. Candidate bug: grain swaps fired only when a grain step landed on a rendered tick. The loop now
   compares against the requested index.
5. With the candidate on, frames take about 1.4 s, so fixed short waits missed pauses and resumes.
   The spec now waits on conditions. It also counts a grain refresh only for frames whose capture
   window contained no swap.
6. At 390 × 844 the populated form does not overflow (scrollHeight = clientHeight = 692). So scroll is
   observed at 390 × 560 with a real touch gesture (`Input.synthesizeScrollGesture`), and then the
   viewport is restored. This is recorded in the summary.

## Verdict (owner review; not product fidelity, adoption or real-phone proof)

**Overall: `represented-with-measured-differences`.** The still pair is not identical, and every
preserved operation reproduced part of its measured effect. The candidate is not called identical or
equivalent to the reference. No treatment is preselected, colour protection is not disabled, no
threshold changed and no visual compromise is requested.

### Source-backed facts

- W3C Filter Effects says filters act on an element's rendered SourceGraphic, including HTML/CSS. The
  spec does not establish parity, support or cost (source-03).
- The preserved pass runs in this order: CRTFilter vignette, nine-tap edge softness, colour
  protection from the *original* texture, then grain and the curved line through one
  brightest-channel RGB scaling (`glass-effect.mjs`).
- The CRTFilter vignette is a multiplicative, content-independent field (`vendor/filters.js` main()).
- SVG filter primitives have no per-pixel division. The ratio and 1/peak steps in the shader need one.

### Measured results (this run; Chromium 153.0.8010.12 headless, SwiftShader software GL, DPR 1, 390 × 844)

- **Inputs:** the source decode is identical between Pixi and `<img>`. The reference filter geometry
  is inputSize 390 × 844 with a half-texel inputClamp.
- **Still pair (full pass)**, per channel R/G/B:
  - Whole frame: max |Δ| 21/20/15, mean 0.265/0.328/0.316. 38.4% of pixels differ in some channel.
  - Centre inside the 0.14 reach: max 2/2/2, 27.8% differ.
  - Perimeter band: max 21/20/15, mean 0.91/0.91/0.74, 68.7% differ.
  - Source brightest channel below 0.30: max 21/20/14, 35.0% differ. From 0.30 to below 0.65: max
    16/16/15, 63.4% differ. At or above 0.65: max 14/16/9, mean 1.60/1.82/0.87, 48.4% differ.
  - No pass tolerance applies.
- **Operations.** Each was measured by an isolated sub-test. E is the operation's own effect and R is
  the residual, both as mean |Δ|.
  - CRTFilter vignette: feImage field and arithmetic multiply. Max 1, 0.14% of pixels differ,
    R/E 0.0003. **represented-with-measured-differences**.
  - Nine-tap edge softness: 8 feDisplacementMap taps, weighted arithmetic sums and a reach mask.
    Max 30/29/26, R/E 0.215, correlation 0.985. **represented-with-measured-differences**. Most of the
    still-pair error is in the perimeter band.
  - Colour protection: lighten for peak, a smoothstep table, a feImage clamped-vignette ratio, and
    in/over composites. Max 1, R/E 0.289. **represented-with-measured-differences**. The Rec. 709 ratio
    division and the 1/peak limit are not computed.
  - Feathered grain: feImage from the preserved `grainAt()` at the clock seed. Max 1, R/E 0.325,
    correlation 0.868. **represented-with-measured-differences**.
  - Curved line wave with the 0.65 floor: cos/sin basis, phase rotation in feComposite k-values and a
    floor table. Max 1, R/E 0.145. **represented-with-measured-differences**.
  - Final brightest-channel RGB scaling: un-premultiply for c/peak, then multiply by the clamped
    target. Max 1, R/E 0.116. **represented-with-measured-differences**.
- **Live `/generate`, matched captures.**
  - Setup: default skin; DPR 1; populated form with the first Anchor chosen; Echo present (1
    definition; sources unchanged on, off and after removal); blobs live. The test held the CSS
    animation time for the pair only.
  - Max |Δ| R/G/B for candidate on vs off with scans suppressed, then candidate on vs the test-only
    reference:
    - Whole frame: 56/52/79 vs off, 21/16/21 vs reference.
    - Text: 48/36/41 vs off, 15/16/18 vs reference.
    - Controls: 48/52/79 vs off, 15/16/21 vs reference.
    - Role-coloured pixels: 48/36/30 vs off, 15/16/18 vs reference.
    - Atmosphere background: 41/27/48 vs off, 15/8/10 vs reference.
  - Means and differing fractions per mask are in `summary.json` → `live.matchedCaptures`.
- **Motion (composited live screen, blobs moving).**
  - Line-only, seed fixed at 0.57: frames differ. Phase estimated from pixels matches a rendered
    phase within 0.06–0.08 rad on all 12 frames.
  - Observed line cycle: 9.94 s against the configured 0.60 s.
  - Grain-only, phase fixed: frames that straddle a refresh differ more (78.3% of pixels) than frames
    within one refresh (59.6%).
  - Observed grain refresh: 0.031 Hz against the configured 0.50 Hz.
  - Both observed rates are slow because frames take about 1.4 s, and the preserved loop clamps each
    step to 0.1 s.
- **Input with the candidate on:**
  - A tap on an Anchor chip activated it.
  - A touch scroll moved the content (at 390 × 560, as described above).
  - The held generation showed ScanLoader with its busy sweep visible; Cancel restored the form.
  - Home navigation completed and Back returned.
  - No input was blocked or altered.
- **Pauses:**
  - Visual effects off (`data-effects=off`): the candidate renders nothing, so the `#root` filter is
    empty.
  - Reduced motion and a hidden document (`data-motion=still`): 0 frames are scheduled during a 3 s
    window.
  - On each resume the phase delta is 0, so there is no catch-up.
- **Cleanup:**
  - Removing the candidate leaves 0 observers, 0 blob URLs, no pending frame and no proof nodes. The
    log does not grow after removal.
  - The `#root` style, the Echo, the scans and the layout are restored.
  - A tap still works afterwards.
- **Scans:** while the candidate renders, `.clr-atmosphere__scan` and the non-busy frame-scan
  texture are hidden test-locally. Busy sweeps stay.
- **Timing** (emulated mobile Chromium on a desktop host with SwiftShader; not phone proof; no
  threshold):
  - Same interaction, candidate off: 0 long tasks, frame interval mean 16.7 ms (p95 16.8).
  - Candidate on: 6 long tasks, mean 1421.8 ms (p95 1433.3).

### Remaining hypotheses (not established here)

- The edge-softness residual comes from feDisplacementMap sampling: 8-bit offset maps, filtering that
  differs from Pixi's bilinear clamp, and renormalised edge taps.
- The remaining ±1 differences elsewhere come from 8-bit intermediates in the filter chain.
- The 1.4 s frame cost is specific to software GL in this harness. Behaviour on GPU-composited
  Chromium, Safari or a real phone is unmeasured.
- Whether an exact ratio/1-over-peak division is achievable with other primitives is not determined.
- A neutral-texture/blend approach was not included.

## Captures (this run; `summary.json` → `captures` is authoritative per run)

All files are under `test-results/crt-source-graphic-proof/`.

| File | SHA-256 |
|---|---|
| still-reference-source.png | 76d09fe7184125be57d792d3c85e0ba5608b12ebcf76e73df3edbfe85811c4eb |
| still-candidate-source.png | dc28af5e39ad4abcf0ef572de7f6cd481319d4771370b9b9171986bf83f78d05 |
| still-reference-vignette.png | 0022bcc15f13a48d8185000afd7cd5661a346303b8b62e5f043111d27b62509f |
| still-candidate-vignette.png | b1ab750d9692404cd0faf411103f7beee147887cd26145a5d1f763302a938015 |
| still-reference-blur.png | c3d438b55aeb58f16e8e336880cc659761cf933ff5de9e621e6e1099e5cd78ba |
| still-candidate-blur.png | 06d8bad607cfb6a80287d1afc871b8cd1578fbcd93704c936643de18b9f884ab |
| still-reference-protect.png | 6fc1b502281c61743877328e1c599259a20d06ebb0f08e3d649b332a3612c721 |
| still-candidate-protect.png | 3c2a8a75640c09927cc0db1b12139d330510f1e9da69722c7d8e22f0498cc873 |
| still-reference-grain.png | 503b8cadd79b32bf3320789f783a009c98e1c497b10c8a6ec6c26dfad820e72a |
| still-candidate-grain.png | d1729e6c57e71cf8757a0ca2ae0ad762d5987e437d6fe1b0c46e9d8aebab66b1 |
| still-reference-line.png | 2a855fd473388a5e7ab16d74280a823974e058c19f4d1e38b8366b22b6e458a3 |
| still-candidate-line.png | 910da45086ba4201e43d6aca292650e7bb362f9d240af04c3d73cd807fcf8bb9 |
| still-reference-scaling.png | 7a0b528c222aebce91fe0bc53dab2dc1dd7796525d6cf0c2a871b4131eec6d8c |
| still-candidate-scaling.png | 0fe73577f161e944f8a58329817c66871afe9f73ba39df37e50f300026aba2c7 |
| still-reference-full.png | 930df87574a5854ee7177f6c26e028e14e29c7b16e0d114f2d059fba36458817 |
| still-candidate-full.png | 9713a9b4cac33aff8a8eedbf78d39179b5b2db5831890aa8bdd687262a7bb924 |
| live-off.png | c0acdf19cc67c7001b5cbcde2e6a5d0ddfa6ed324458ec3a058128be637f5d2f |
| live-off-scan-suppressed.png | dfed12e49384f85324d8b34dbd01709e6ad91da67721ec33321a277294454732 |
| live-on.png | 0582e913be34d9b2c4d19f1923b317010a57fe1c21a8187977e05868802d053c |
| live-reference.png | a4d89d1484ccb1560083b0848df3206d8c534e014424a903b4562e46e72796d9 |
| live-on-loading.png | 7a5e471b92f811a38165698d4cd767bb6c48c5d660fa9d18c7a19d6cfe31e0a8 |
| live-effects-off.png | 7b1dced2b44f14d927cb62cbcb4aa9198e768d54755b9951224f23dc7c401d2c |

Motion frames (`motion-line-only-NN.png`, `motion-grain-only-NN.png`):
line 00 337f0df4…1485 · 01 cb1e2cda…dd28 · 02 04687e63…4084 · 03 f18c464c…d17d · 04 05b687d0…3b9a ·
05 40461b17…968d · 06 6e1d08fd…6b7b · 07 f28eb0c4…7135 · 08 31ab517c…3e9b · 09 85b983d2…4471 ·
10 d70344dc…33d0 · 11 77d19524…bdbc; grain 00 8d863443…01c4 · 01 8ef6c16d…c07f · 02 88479e69…1e18 ·
03 c385f5b6…54cc · 04 7c03e30e…049b · 05 3f426c44…2e5f · 06 0f288fe3…1cfd · 07 261e3718…9fbf ·
08 b7763b01…4b1d · 09 14657033…e9a8 · 10 c232ef9b…a453 · 11 b1078c67…8c38 · 12 7f8cb87a…bc5f ·
13 1381d405…d3e6 · 14 28e61f39…9582 · 15 fdc23dd0…9b74 · 16 9483c4ff…bc6f · 17 aa3b5354…4715 ·
18 cbc3d8af…657f · 19 bd30106b…ee98. The full 64-character values are in `summary.json`.

## Verification (this tree)

- `npx playwright test --project=mobile e2e/effects/crt-source-graphic-proof.spec.ts`: **1 passed
  (5.3 min)**. The summary status is "all required observations captured" and
  `missingObservations` is `[]`.
- `test -f test-results/crt-source-graphic-proof/summary.json`: present.
- `npm run typecheck`: passed.
- `npm run lint`: 0 errors and 154 warnings. These are pre-existing; none are in the new files.
- `npm run lint:ds`: passed.
- `npm run build`: passed.
- `npm test`: 244/244 files and 5990/5990 tests passed.

## Assumptions and next action

- The live screen is this workspace's Vite build of `/generate` with synthetic, intercepted data, as
  in the existing Echo specs. No credentials were used.
- Hosted CI has no private reference, so the spec fails there and names `CLEAR_EFFECTS_REFERENCE_DIR`.
  This is intentional, not a skip.
- Next safe action: owner review of the captures and numbers. Any production treatment, fidelity
  compromise, Task005/006 revision or GPU/phone measurement is a separately reviewed step.
