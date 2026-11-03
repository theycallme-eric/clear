# CLEAR effects index

The small working index for CLEAR's two app-owned decorative effects: **Phosphor Echo** and
**CRT Glass**. Read this before you change, tune or reuse either one. The machine-readable twin is
[`index.json`](index.json). Keep both in step when an effect changes.

Effects body `clear-effects-2026-10-30`, TASK-008 (issue #609, REQ-009 and REQ-010). This page
records what was delivered by TASK-001 to TASK-007 and TASK-009. It moves no ownership. The
[visual library](../design/library/README.md) links here, and the effects do not wait for library
completion, unrelated library PRs or a new foundation release. The immutable 0.14.3 import
(`src/design-system/`) is not edited by either effect.

| | Phosphor Echo | CRT Glass |
| --- | --- | --- |
| Status | Delivered on the effects build branch. **Owner visual approval not yet recorded.** | Delivered on the effects build branch. **Owner visual approval and performance acceptance not yet recorded.** |
| Canonical code owner (one each) | `src/ui/phosphor-echo.tsx` | `src/ui/crt-field/crt-field.tsx` |
| Preset owner (one each) | `src/ui/phosphor-echo-preset.ts` | `src/ui/crt-field/config.ts` |
| Demo | `/gallery/app?component=PhosphorEchoFrame` | `/gallery/app?component=CrtField` |
| Third-party runtime dependency | None | None |

## Shared comfort policy, Settings and lifecycle

Both effects read one policy. They keep no on/off state of their own.

- **Owner:** `src/state/visual-effects.ts` (TASK-001). API: `useVisualEffects()` returns
  `{ effectsEnabled, motionAllowed }`. `useOptionalVisualEffects()` returns `null` outside the
  provider. `setVisualEffects(on)` writes the choice. `resolveVisualEffectsPolicy()` is the pure
  rule. `VisualEffectsProvider` wraps `ContainedShell` in `src/app/RootLayout.tsx`, which also
  renders the one `aria-hidden` `.clr-effects-host`.
- **Setting:** one *Visual effects* checkbox in the Settings Appearance card (`src/app/Settings.tsx`,
  TASK-002). Checked means on. It is on by default, and an unknown stored value falls back to on.
  The choice is device-local (`localStorage['clear.visual-effects']`, like `clear.skin`). There is
  no account write, no save status and no tuning control. This is current implementation. The
  owner selected keeping Visual effects and adding a separate Reduce motion checkbox; that app
  control is pending and is not implemented by the front-glass correction.
- **Off wins.** With Visual effects off, neither effect renders, no field clocks run, the atmosphere
  blobs hold still and no retired scanline comes back.
- **Reduced motion** (OS `prefers-reduced-motion`, honoured live). Line drift, grain refresh and the
  atmosphere blobs stop together. The static Echo and the CRT field as still glass stay, because
  they are readable. The old atmosphere scan layer is never drawn.
- **Hidden tab:** the field's clocks are paused in place, not cancelled. When the tab is shown again
  they resume with no catch-up jump.
- **Failure:** if graphics are unsupported or a layer fails, the effect renders nothing and the
  ordinary UI stays usable. Focus, input, loading/busy and error feedback were proven in every
  combination of on/off and reduced motion (TASK-007).

## Phosphor Echo

A static, soft rear image: the target's filled silhouette, blurred and shifted left and down in the
target's own role colour, visible only outside the foreground footprint. It adds no motion.

**Module and API** (TASK-003, TASK-004).

- `src/ui/phosphor-echo.tsx` is the one kernel owner. `PhosphorEchoDefinition` installs the filter
  once per document (the root effects host renders it). `PhosphorEchoFrame` wraps one framed owner.
  `PhosphorEchoText` is for a heading and `PhosphorEchoGlyph` for an SVG glyph.
  `PHOSPHOR_ECHO_FILTER_ID` names the filter. No component takes a blur, strength, offset or colour
  prop.
- `src/ui/foreground-echo.tsx` holds the eligibility rule, decided once. `ForegroundEchoFrame` and
  `ForegroundEchoText` echo only on the background. `EchoExcluded` marks a subtree that must not
  echo. It does not own the kernel or the numbers.
- Shared owners opt in, so no screen wraps a target itself: `src/app/Screen.tsx` (heading and header
  action slot), `src/ui/card.tsx` (outer Card), `src/ui/composition.tsx` (`ActionRow`, standalone
  `ListFrame`/`MetricFrame`) and `src/ui/view-state.tsx` (standalone `EmptyState`, `ScanLoader`
  and the error card with its Retry button).

**Preset** (`PHOSPHOR_ECHO_PRESET`, `PHOSPHOR_ECHO_PRESET_PROVENANCE`). Identity *Phosphor Echo ·
preferred*, from `round-3/preferred-preset.json`: opacity 0.29, softness 3.2 CSS px (Gaussian
standard deviation), x −4.7 CSS px (left), y +5.64 CSS px (down, displayed as 5.6). Status: the
owner selected it in the reference study. The owner has not yet approved it on the integrated app.
The earlier geometry-check values 0.34 / 1.4 / −5.5 / +6.6 are **not** this preset.

**Application, occlusion and colour rules.**

- Eligible: foreground artwork directly on the background. That means standalone headings, the
  framed back action, outer Cards and frames, and CTA surfaces, on every current screen. `/generate`
  is the representative proof, not a limit.
- Not eligible: anything inside a Card, dialog (`AppDialog`), sheet or an already-echoed owner. That
  includes nested text, labels, inputs, chips, the back arrow and the CTA label. Each subtree is
  filtered at most once. This describes current implementation. The latest owner-approved
  extension is **pending**: standalone timer artwork/frames on the background and dialog/sheet
  outer frames should receive the same Echo; their nested content stays excluded. The library
  workstream owns consumer opt-in, with shared eligibility support coordinated here. Do not
  interpret the current blanket dialog exclusion as the intended rule for a dialog's outer frame.
- Kernel, preserved from `round-3/phosphor-echo.mjs`: sRGB interpolation, `userSpaceOnUse`, the full
  filled silhouette → Gaussian blur → offset → alpha → `out` composite against `SourceAlpha`. The
  sharp foreground is drawn separately above. No rear pixel shows through the top/right interior of
  a translucent panel.
- Colour: the target's painted role colour in every skin (the frame's `::after` border, or the text
  colour). The silhouette uses that hue at full alpha. There is no generic glow colour.
- Composition: existing `.clr-bleed` emission and `.clr-glow` stay the component's own. The echo
  source sits beneath them as a sibling, so neither filter contains the other.
- Units are CSS pixels at every device-pixel ratio. Rear layers are `aria-hidden` and
  `pointer-events: none`.

## CRT Glass

Restrained curved scanlines that drift, soft grain that refreshes on its own clock, perimeter
softness and a vignette, layered over the real interactive page.

**Module and API** (TASK-006). `src/ui/crt-field/crt-field.tsx` is the one live owner. `CrtField` is
mounted once by the root effects host in `src/app/RootLayout.tsx` while effects are on, and
`CRT_FIELD_ANIMATIONS` names its two clocks. It is browser-native: four edge-strip `backdrop-filter`
blurs, one inline SVG path of curved lines (a transform Web Animation drifts it), a feathered noise
tile (a separate Web Animation steps it) and a static radial vignette. There is no canvas, DOM
capture or pixel readback. The viewport field is one transparent, nonmodal manual popover in the
browser top layer, above the interface and native dialogs. When a dialog/popover opens, the same
field is promoted above it; no second glass is created. It stays `aria-hidden`, unfocusable and
`pointer-events: none`, so the underlying interface keeps input and native modal focus. Its
ordinary stacking fallback is above the shell. The gallery's contained specimen remains local to
its frame. Appearance values and the two animation clocks are unchanged by this layer correction.

**Preset** (`src/ui/crt-field/config.ts`). `CRT_FIELD_CONFIG` identity
**`clr-crt-field/review-2026-11-03.1`**: lines period 4, thickness 2, opacity 0.16, curvature 6,
drift 0.7 s per period; grain opacity 0.07, frequency 0.85, feather 0.4, refresh 0.5 Hz, 8 frames,
160 tile; vignette clear fraction 0.62, opacity 0.3; perimeter blur 1.6, width fraction 0.14 (CSS px
and seconds). `crtFieldCustomProperties`, `crtFieldLinePath` and `crtFieldGrainTile` derive
everything else from it. To tune: change a value, bump the `id`, rerun the composition and overhead
specs, and get the owner's review. Status: the owner-selected scanline values on the review branch,
recorded in [the November 3 control export](scanline-selection-20261103.json). This changes only
the scanline preset; grain, vignette, perimeter and layering stay unchanged. The export also
records the existing Echo draft used by the review tools; it does not approve the proposed rear
text-glow cleanup or change the app's Echo preset. The earlier shipping interpretation
`clr-crt-field/shipping-2026-11-02.3` remains identified in its historical evidence. Main and the
effects build branch are not updated by this review-branch selection. These are live-field values,
distinct from the old raster reference export's slider numbers (owner clarification, 2 November 2026).

**Reference port, not a second owner.** `src/ui/crt-glass/` (TASK-005) is a pixel-exact port of the
preserved raster pipeline, used only as the fidelity proof against the preserved motion host. It
holds `CRT_GLASS_PRESET` (exactly `crt-iab-current-settings.json`), `CRT_GLASS_REFERENCE`, the
motion clock (`initialClock`, `advanceClock`, `grainSeed`, `createMotionDriver`: phase 0.5, seed
0.57, 30 fps cap, 0.1 s frame clamp), `GRAIN_FEATHERING_REFERENCE_RANGE`,
`WORKBENCH_EXPLORATORY_RANGES` and `CrtGlassField`. Nothing in the app mounts it, and production
ships none of it. Do not mount it beside `CrtField`.

**Application, masking and colour rules.**

- One field covers the viewport. Each exposed pixel receives it once, and the centre is never
  blurred.
- Skin role colours stay authoritative. Lines use the selected opacity 0.16, so text, icons,
  controls and feedback stay readable.
- Grain feathering blurs the grain tile only. It never reaches UI, text, Echo geometry, frames or
  the lines.
- The viewport field is in front of cards, CTAs and native dialog content/backdrops. Each exposed
  pixel receives one coordinated glass treatment; dialogs do not mount their own copy.
- Echo is composed beneath the field. The live role-coloured atmosphere stays live behind both. It
  is not frozen into a texture or remounted on navigation.

### Scanline replacement map (TASK-006)

The field **replaces** the old decorative scanlines. It does not stack on them. The retirement
lives in repository-owned CSS (`src/styles/atmosphere.css`, with an inventory in its comments). The
0.14.3 import is untouched.

| Old active layer | Owner | Now |
| --- | --- | --- |
| Atmosphere scan `.clr-atmosphere__scan` | `src/ui/atmosphere.tsx` | Markup removed; `display: none` override kept |
| Idle frame scan `.clr-chamfer::before` | 0.14.3 frame recipe | `background-image: none` |
| Dialog backdrop scan `.clr-dialog::backdrop` | 0.14.3 dialog recipe | `--frame-scan: none`; noise and tint layers stay |
| Busy / loading sweeps (more specific busy rules) | 0.14.3 / `ScanLoader` | **Kept**: meaningful feedback, not decoration |
| `.scanlines-overlay` | unused bundled class | Not active; not counted as a layer |
| Atmosphere blobs | `src/ui/atmosphere.tsx` | Kept live; `[data-static]` pauses them in place instead of removing the animation |

## Source and preset provenance

The original preferred Phosphor Echo source and preset are preserved unchanged.
`docs/design/library/intake/phosphor-echo/phosphor-echo.mjs` and `preferred-preset.json` are
byte-identical to the supplied `round-3/` files. They have not changed since they were preserved,
and the public test fixtures hold a second copy (`e2e/fixtures/effects-reference/`, hashes in
`SOURCE-MANIFEST.json`).

| Reference | Role |
| --- | --- |
| `round-3/phosphor-echo.mjs` | Phosphor Echo kernel source. Ported once into `src/ui/phosphor-echo.tsx`. |
| `round-3/preferred-preset.json` | **The** Phosphor Echo preset (0.29 / 3.2 / −4.7 / +5.64). The kernel defaults agree. |
| `round-3/VERIFICATION.json`, early on/off images | Masking-method evidence at the earlier 0.34 / 1.4 / −5.5 / +6.6 values. Not selected-preset golden images. |
| `crt-iab-current-settings.json` (SHA-256 `3169d460…a033`) | Current-session CRT reference export. It is the identity in `CRT_GLASS_REFERENCE` and `CRT_FIELD_REFERENCE` and the input to the TASK-005 fidelity proof. Not the shipping field values. |
| `crt-glass-motion/glass-effect.mjs`, `motion-clock.mjs`, `study.mjs`, `study.css`, `index.html` | Preserved CRT motion host. `glass-effect.mjs` is authoritative for pass order. |
| `crt-glass-motion/working-session.mjs` | **Earlier reference.** An unapproved recovery seed of trial settings. It is kept only because the preserved host imports it; tests override it with the captured export. |
| `crt-glass-motion/default-preset.json` | **Earlier reference.** A proposed motion treatment from the paused study. Not used. |
| `PRESETS.selected` in `glass-effect.mjs` | **Earlier reference.** The selected *appearance* before motion was added (for example line width 3, contrast 0.06). Not used. |

**Capture provenance and limits of `crt-iab-current-settings.json`.**

- It was captured 2026-10-31 01:49 UTC. The preview's own *Save settings* export was downloaded
  once from the already-open motion host, with no reload, reset, slider change or storage clearing.
  The on-screen controls agreed with every exported value, and the 390 × 844 canvas was rendered.
- It is current-session numeric evidence. It is not proof of the final-at-pause storage and not a
  new owner approval of a shipping motion intensity. The owner said individual numbers are tunable
  and must not block delivery.
- Persisted storage equality was not independently verified.
- The open tab had the older *Grain softness* 0–1 (step 0.05) control. The disk source later has
  *Grain feathering* 0.01–0.99. The captured 0.40 is valid on both scales.
- The export's human-readable `pipeline` label is older text. `glass-effect.mjs` defines pass order.
- The specimen is a fixed 390 × 844 raster with Echo baked in and frozen blobs. That is a limit of
  the reference, not permission to rasterise the app.

## Reference-package workbench controls (not product settings)

The preserved CRT Glass Motion workbench exposes these controls for exploration. They are recorded
in `src/ui/crt-glass/preset.ts` for reference only. **None ships.** The only user choice is the
Visual effects checkbox, plus the OS reduced-motion preference.

| Control | Reference range |
| --- | --- |
| Drift cycle | 0.1–180 s at 0.1 s precision |
| Still | Freezes the line phase; separately enabled grain keeps refreshing |
| Independent grain animation | 0.5–6 Hz, on its own clock |
| Grain feathering | 0.01–0.99, step 0.01, two-decimal readout (0.01 crisper, 0.99 softer) |

These ranges are exploratory capacity, not defaults. The export's 0.6 s cycle and 0.5 Hz grain are
reference tuning, not an automatically approved shipping intensity.

## Dependencies and licences

| Item | Version | Licence | How it is used |
| --- | --- | --- | --- |
| PixiJS (`pixi.js`) | 8.22.0 | MIT (© 2013–2023 Mathew Groves, Chad Engler) | **Not adopted** as an npm dependency. The preserved reference host loads its vendored copy in tests only. `src/ui/crt-glass/shaders.ts` carries its filter vertex program verbatim, with the full MIT notice. |
| `pixi-filters` | 6.1.5 | MIT (© 2013–2025 Mathew Groves, Chad Engler) | **Not adopted** as an npm dependency. `shaders.ts` carries the CRTFilter fragment verbatim, with the full MIT notice. |

Both upstream licence files and `*-version.json` records are preserved unchanged under
`e2e/fixtures/effects-reference/crt-glass-motion/vendor/`.

**What actually loads.** The live `CrtField` and the Echo use only browser features: SVG filters,
inline SVG, `backdrop-filter` and Web Animations. Off/on measurements fetched the same resources
and bytes on the same effects-enabled build; this is not a comparison with the pre-effects app
(TASK-009 and the issue#624 front-glass refresh). The `src/ui/crt-glass/` port has a plain-WebGL2 renderer that would load as one lazy,
idle-time chunk, but nothing mounts it. The production build therefore emits no CRT/Pixi chunk, and
`src/ui/crt-glass/bundle-boundary.test.ts` proves it.

## Review and verification evidence

| Task | Proof | Recorded result |
| --- | --- | --- |
| TASK-001 | `src/state/visual-effects.test.ts`, `src/app/atmosphere.test.tsx` | Policy and host pass |
| TASK-002 | `src/app/visual-effects-settings.test.tsx` | Checkbox, keyboard, persistence and no account write pass |
| TASK-003 | `e2e/effects/echo-standalone-fidelity.spec.ts`, `src/ui/phosphor-echo.test.tsx` | App versus round-3 kernel: 0 differing pixels at DPR 1 and 3; on/off interiors identical at 320, 375 and 1280 widths |
| TASK-004 | `e2e/effects/echo-applied-fidelity.spec.ts`, `src/app/generate-echo.test.tsx` | CLEAR, Signal, Vapour and Mono: frame interiors identical on/off (max channel diff ≤ 2); only left/bottom change; rear ink equals painted role colour |
| TASK-005 | `e2e/effects/crt-glass-fidelity.spec.ts` | Reference port versus preserved host: still 0 differing pixels at DPR 1 and 3; all 12 motion frame pairs identical; clock equal at 183 steps |
| TASK-006 | `e2e/effects/crt-composition-fidelity.spec.ts`, `crt-live-overhead.spec.ts`, `src/app/scanline-replacement.test.tsx` | Four skins Echo-only then composed; live motion; no capture or readback. The live field is a browser-native interpretation, so pixel identity with the raster reference is **not** expected or claimed. |
| TASK-007 | `e2e/effects/comfort-transitions.spec.ts`, `src/app/visual-effects-journey.test.tsx` | Off, reduced-motion and hidden-tab end states with no reload and no catch-up |
| TASK-009 | `e2e/effects/performance-comparison.spec.ts` → [`performance.md`](performance.md) | Browser engineering comparison (see below) |

**Performance (TASK-009, refreshed for issue#624).** [The current front-glass record](performance.md) keeps the new measured source separate from pre-front-layer history. The earlier comparison ran in desktop Chromium 153 with Playwright mobile
emulation (390 × 844, DPR 3) on the **SwiftShader software renderer**.

- Load: no material difference, and the same resources and bytes.
- Long tasks: none in either mode.
- Frame pacing: effects on had about 30 single missed frames of about 33 ms; effects off had none.
- Main-thread work: about 2.1× style recalculations.
- Input: the first tap after load was about 10–25 ms slower; later input overlapped.
- Memory: heap about +80 KB, DOM nodes +61.

These are **browser engineering results. They are not physical phone evidence and not a
performance approval.** No pass threshold or budget is set. Whether the cost is acceptable is the
owner's decision at final review. It is recorded as pending in `performance.md`, and no fallback is
implemented.

## Recorded integration gaps (library gap process)

Recorded in the four-part form of the [library gap process](../design/library/README.md#request-a-gap).

1. **Need:** CRT Glass over the live, interactive app with the live atmosphere.
2. **Why the existing option does not fit:** the preserved pass reads source pixels (edge blur,
   colour protection, RGB scaling). Live DOM supplies none without DOM-to-texture capture, which is
   ruled out. The test-only SourceGraphic proof (TASK-201) was inconclusive for long use. Smallest
   extension: a browser-native layer interpretation with its own shipping configuration, keeping
   the reference port for fidelity proof (owner clarification, 2 November 2026).
3. **Owner and consumers:** `src/ui/crt-field/` owns it, the root effects host is its one consumer,
   and `src/ui/crt-glass/` is the reference.
4. **Preview and checks:** `/gallery/app?component=CrtField` and the TASK-006 specs. The resulting
   appearance difference is listed for the owner's visual review below.

No other public integration gap was found.

## Known limits

- **No matching current-settings motion recording existed at intake.** The preserved executable
  host, clock and current export define the repeatable comparison. TASK-005 and TASK-006 captured
  motion proof during implementation, and none was invented.
- **Historical rendered screenshots are earlier-settings diagnostics.** They are not current-preset
  golden images and not approval. A still image cannot prove motion. The browser screenshots and
  capture details are private inputs and are not published here.
- **Browser engineering performance results are not physical phone evidence or a performance
  approval.** Hardware-GPU behaviour, compositor-presented frames, GPU time and memory, touch-fling
  scroll and INP are unmeasured or not proven.
- **Final visual approval is not claimed until recorded.** It is pending the owner's comparison at
  matching state and settings, for both effects and their composition. Points for that review:
  - the live field is lighter than the raster reference (lines at 0.12, a lighter vignette);
  - the Echo silhouette is drawn at full-alpha role hue;
  - the heading's rear copy inherits the body `text-shadow`;
  - under reduced motion, the field stays as still glass.
- Dialog and sheet content sits above the field, so it is not covered by the field.
- Echo rears re-measure one frame after their owner resizes.

Record the owner's visual decision and performance decision here, with their dates, when they are
made.

## Demos

- Real components, effects off and on with the real checkbox:
  `/gallery/app?component=PhosphorEchoFrame` and `/gallery/app?component=CrtField`. Their rows are
  in [the component index](../design/library/COMPONENTS.md).
- In the app: any screen with effects on. `/generate` is the representative Echo screen.
- Preserved reference hosts (test fixtures, not product): `e2e/fixtures/effects-reference/round-3/`
  and `e2e/fixtures/effects-reference/crt-glass-motion/index.html`. The fidelity specs serve them.

## Changing an effect

Keep one entry per effect here and in `index.json`, and keep one code owner and one preset owner.
Change numbers only in the preset owner, bump its identity where it has one, rerun that effect's
specs, and update this page. Do not let screenshots or copied snippets become a second
implementation. A successful visual experiment is not a production integration, release, all-skin
certification or performance certification.
