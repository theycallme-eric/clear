# clear-effects-2026-10-30 · TASK-006 — CRT Glass field over the live shell

Task-owned progress record. Under the owner-selected policy it satisfies the repository's shared
daily-journal requirement for this body; TASK-008 consolidates.

## Identity

- Body `clear-effects-2026-10-30`, task `TASK-006`, issue #607, REQ-006, AC-033–039 and AC-071–075.
  Completion owner for JOURNEY-003.
- Branch `agent-runner/task-006-a2-5eec8a00` (attempt 2), base `3b5eab5` (TASK-005, #618). Nothing
  was pushed, no PR was opened and nothing was written to an external service.

## Intended outcome

Mount the TASK-005 field once in the root decorative host, over the TASK-003/004 Echo. Retire the
active old decorative scanline owners in repository-owned styles and keep the busy sweeps. Make the
atmosphere follow the TASK-001 policy, and prove the result on actual screens against the preserved
motion host. If live composition cannot be achieved within public surfaces without a DOM-to-texture
capture, stop with a concrete sourced gap (AC-075).

**Outcome: the integration stopped with a sourced gap.** The product is unchanged. The stop and its
evidence are tested.

## Attempt 1 failure and its cause

Controller `npm test` failed in `src/test/design-0143-final-audit.test.ts` (2 cases). That audit pins
a SHA-256 over every runtime file under `src/` and `index.html`. Attempt 1 changed runtime source
(atmosphere, root and retirement styles), and the owner-authorized Format Preview recapture that
re-derives the hash had not run. This is the same binding TASK-001–005 met. In this attempt no
runtime file changes, because the stop leaves the product as shipped. So the audit hash still holds,
and no hash or evidence was edited.

## Sourced gap

The preserved pass cannot be laid over live, interactive DOM through any public surface without
the DOM's pixels.

1. **The pass reads the pixels beneath it.** In `crt-glass-motion/glass-effect.mjs` the custom
   fragment does three things:
   - nine-tap edge softness samples neighbouring source pixels (`sampleAt(uv ± d)`);
   - colour protection reads the original pixel's peak and luminance, then divides
     (`filtered/max(brightness,.001)`, `1.0/max(peak,.001)`);
   - the final scaling is `c.rgb *= clamp(peak+lightDelta,0,1)/max(peak,.0001)`, where
     `lightDelta` itself uses `max(peak,.65)`.

   No layer composited over the DOM (canvas, blend mode or overlay) receives those pixels. Measured
   on actual `/generate` in all four skins (`e2e/effects/crt-composition-fidelity.spec.ts`, preserved
   PixiJS host, current settings, phase 0.5, seed 0.57):
   - Changing one perimeter column of the source changes about 3 403 other output pixels in each
     skin (CLEAR 3 403, Signal 3 404, Vapour 3 406, Mono 3 403).
   - Changing only green changes red or blue at 94 500, 103 419, 99 335 and 94 649 pixels.

   No content-independent layer can do either.
2. **The owner excludes the capture that would provide them.** ADOPTION-REQUIREMENTS.txt says to
   "avoid a whole-screen DOM-to-texture capture". INTEGRATION.txt says: "Do not transplant a
   screen-capture-to-WebGL bridge into the app".
3. **The public live-filter route is not equivalent and not approved for adoption.** TASK-201
   (`docs/journal/clear-effects-2026-10-30-live-source-proof/TASK-201.md`) applied an SVG
   SourceGraphic filter to the live shell. Its findings:
   - Verdict: `represented-with-measured-differences`. The still pair has max |Δ| 21/20/15 and
     38.4 % of pixels differ.
   - SVG primitives have no per-pixel division, so the ratio and 1/peak steps are not computed.
   - Frames took about 1.4 s (6 long tasks) under software GL. Observed cadence was a 9.94 s line
     cycle against the configured 0.60 s, and 0.031 Hz grain against 0.50 Hz.
   - That record says any production treatment or TASK-005/006 revision is "a separately reviewed
     step".

   Adopting it here would be approximating the effect and would miss AC-072's cadence.
4. **TASK-005 reported the same gap** before this task ("Host integration gap, reported before
   adoption").

So the field is not mounted. No old owner is retired, because retiring without a replacement would
leave a scanline-free shell nobody approved. The atmosphere is not re-wired. Every exposed pixel
keeps exactly one decorative signal: the shipped one.

### Options for the owner (none chosen here)

- Approve the TASK-201 SourceGraphic treatment as a measured approximation, with its differences,
  cost and a revised cadence criterion.
- Re-scope the field to content-independent operations only (vignette, lines and grain as a
  multiply layer), knowingly dropping edge softness and colour protection.
- Keep the field to app-owned textures (specimens, gallery) and leave the shell's scanlines as
  shipped.

The retirement overrides, `AtmosphereLayer` reading the TASK-001 policy, the gallery example and
the composed proofs follow from whichever option is chosen. Each would then change runtime source
and need the owner-authorized audit recapture.

## Changes

- `src/app/scanline-replacement.test.tsx` (new, 13 cases). It inventories the three active
  decorative owners in the 0.14.3 import: `.clr-atmosphere__scan`, `--frame-scan` on
  `.clr-chamfer::before`, and `.clr-dialog::backdrop`. It checks that both busy sweeps and
  `.clr-scan-band` stay state feedback, that `.scanlines-overlay` is rendered by nothing the app
  owns, and that the import is still 0.14.3. For the stop state, it checks that no repository style
  retires an owner, that no `CrtGlassField` or DOM capture exists, and that one atmosphere and one
  Echo definition paint with effects on and off. It also checks that the atmosphere node and its
  three blobs survive navigation.
- `e2e/effects/crt-composition-fidelity.spec.ts` (new, 2 cases, self-contained). It starts its own
  Vite server (port 5830+) with synthetic intercepted data. It serves the checkpoint read-only by
  route interception, checks the settings SHA-256, sets viewport and DPR per comparison, and edits
  no shared Playwright configuration.
- This record.

`src/app/atmosphere.test.tsx` is unchanged: the scan it asserts is still shipped. No runtime source,
style, gallery register, preset, vendor or shared configuration changed.

## Failures and corrections (this attempt)

1. The first draft's no-retirement check matched a *comment* in `set-logging-sheet.css`. That
   surfaced an existing exception: B05-07.4 already made the set-logging sheet's own frame plain
   (`background-image: none`). The test now strips comments and asserts that exception explicitly.
2. The Echo-only interior check first failed with max Δ 24 at 7 pixels. They were in the card's
   open bottom-right chamfer cut, where the rear shows by design. The mask now follows the painted
   footprint, as TASK-004's spec does, and the interior is 0 differing pixels in every skin.
3. `npx vitest run <one file>`, `npm test -- <file>` and ad-hoc `node -e` were held by the session
   permission gate. Only the approved command forms ran.

## Verification (this tree)

- `npx playwright test --project=mobile e2e/effects/crt-composition-fidelity.spec.ts`: 2 passed
  (26.0 s). Chromium headless, ANGLE/SwiftShader software GL, PixiJS 8.22.0. Software rendering is
  not phone evidence.
  - Pairs, 390 × 844, DPR 1, render resolution 1, reduced motion (ground still), no field:
    - Echo-only, card owner: left and below changed (4 824 / about 2 730 px). Above and right max
      Δ ≤ 2. Interior footprint 0 differing pixels in CLEAR, Signal, Vapour and Mono.
    - Composed reference (test-side preserved pass over the Echo-only capture): centre mean |Δ|
      1.19 / 1.25 / 1.26 / 1.29 against perimeter 3.32 / 3.44 / 3.54 / 2.89.
    - Gap probes: as listed under Sourced gap.
    - Written to `test-results/crt-composition-fidelity/` per skin: `*-echo-off.png`,
      `*-echo-only.png`, `*-composed-source.png` and `*-composed-reference.png`. `pairs.json`
      records host file SHA-256s (`index.html`, `study.mjs`, `study.css`, `glass-effect.mjs`,
      `motion-clock.mjs`, vendor), settings SHA-256 `3169d460…a033`, skin, viewport, DPR,
      resolution, source state, phase and seed. Historical renders are listed as not-targets.
  - Live, 390 × 844, DPR 3, all four skins:
    - No field and no `.scanlines-overlay`. The shipped atmosphere and frame scans paint.
    - All 3 blobs run and their transforms move.
    - The Anchor chip is its own hit target and accepts the tap.
    - Scrolling works. The loading sweep runs while generation is held, and Cancel restores the
      form.
    - In-app navigation to Home and Back keeps the same atmosphere node.
    - Under reduced motion the ground is still in place (`data-static`, 0 running) and resumes.
    - Hidden and visible tab, and effects off and on, keep the same node and the shipped owners.
    - The dialog backdrop keeps its shipped scan.
    - Read-only: no write, nothing outbound.
- `npx vitest run src/app/atmosphere.test.tsx src/app/scanline-replacement.test.tsx`: 2 files, 63/63
  passed.
- `node scripts/gallery-index.mjs --check`: "53 registered component entries verified."
- `npm run typecheck`: passed. `npm run lint`: 0 errors, 154 existing warnings, none in the new
  files. `npm run lint:ds`: passed. `npm run build`: built.
- `npm test`: 249/249 files, 6041/6041 tests. The audit binding holds because no runtime source
  changed.

## Not met while stopped (reported, not claimed)

AC-033, the AC-035 policy wiring, AC-036, the AC-038 gallery example and owner approval, the AC-071
composed comparison against a mounted field, and AC-072 cadence on actual screens all depend on a
mounted field. They are not met. AC-034, AC-037 (as shipped), AC-039, the AC-073 integration checks
on the shipped shell, the AC-074 records and AC-075 are covered above. No owner visual approval is
claimed.

## Next safe action

Owner decision on the options above. Then a TASK-006 revision implements the chosen option,
followed by the owner-authorized audit recapture and the owner's visual review of the pairs.
