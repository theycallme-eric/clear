# Effects composition contract — CRT Glass, Phosphor Echo, focused log and deadline warning

TASK-033 (#660), REQ-033: AC-R033-01, AC-R033-02, AC-R033-03; JOURNEY-033. Body
`clear-refinement-v2-20261109b`, reconciled on 10 November 2026 at integration head `b7e9cb8`.
Accepted gallery reference `eded158cfd928d382c9a9409e2c372270312741d`, stable states
`/gallery/refinements?state=urgency` and `?state=ladder-long`.

This is an engineering and definition record. It says which owners compose the final effects
layer, in what order, and under which policy. It adds no new user-facing feature, no new effect
and no new preset. Proof: `e2e/refinement/task-033.spec.ts` (check-01), whose required cases are
listed in `evidence/refinement/task-033/required-cases.json`.

## 1. Re-verified owners and API (AC-R033-01)

Effects issue #596 preserved the Phosphor Echo intake. The effects body
(`clear-effects-2026-10-30`, PRs #612–#624 and #627) later moved it into runtime owners, and those
owners are the current API. I re-verified each one against the current tree and against the
accepted reference (eded158c…). The pinned source resolves each from integration base `03087f7`
unchanged, and its `SOURCE-MANIFEST.json` lists the two preset owners as `unchangedPresetOwners`.
The two are byte-identical (SHA-256 pinned in the spec).

| Concern | One owner | Public API |
| --- | --- | --- |
| Comfort policy | `src/state/visual-effects.ts` | `useVisualEffects`, `useOptionalVisualEffects`, `setVisualEffects`, `setReduceMotion`, `VisualEffectsProvider`; storage `clear.visual-effects`, `clear.reduce-motion`; `html[data-reduce-motion]` |
| Root effects host | `src/app/RootLayout.tsx` (`EffectsHost`) | Mounts `PhosphorEchoDefinition` once, and `CrtField` once while effects are on |
| Echo kernel | `src/ui/phosphor-echo.tsx` | `PhosphorEchoDefinition`, `PhosphorEchoFrame`, `PhosphorEchoText`, `PhosphorEchoGlyph`, `PHOSPHOR_ECHO_FILTER_ID` |
| Echo preset | `src/ui/phosphor-echo-preset.ts` | `PHOSPHOR_ECHO_PRESET` = opacity 0.21, blur 1.8, x −7.12, y +6.75 (CSS px). Matches the owner-approved `docs/effects/echo-selection-20261103.json` |
| Echo eligibility | `src/ui/foreground-echo.tsx` | `ForegroundEchoFrame`, `ForegroundEchoText`, `EchoExcluded` |
| CRT front glass | `src/ui/crt-field/crt-field.tsx` (+ `crt-field.css`) | `CrtField`, `CRT_FIELD_ANIMATIONS` (`clr-crt-line-drift`, `clr-crt-grain-refresh`) |
| CRT preset | `src/ui/crt-field/config.ts` | `CRT_FIELD_CONFIG` id `clr-crt-field/review-2026-11-03.1`. Lines match the owner-approved `docs/effects/scanline-selection-20261103.json` |
| Retired scans | `src/styles/atmosphere.css` | Atmosphere scan, frame scan and dialog-backdrop scan stay retired |
| Deadline warning | `src/ui/refinements/deadline-timer.tsx`, `countdown-warning.ts` (TASK-007/008) | `DeadlineTimer` with `deadline`; one `.clr-deadline-edge` |
| Focused log | `src/ui/refinements/logging-overlay.tsx` (TASK-018/016) | `LoggingOverlay`; Balanced `::backdrop` from `--logging-backdrop-*` |

**Moved paths.** #596's intake now lives at `docs/design/library/intake/phosphor-echo/`, with a
public fixture copy in `e2e/fixtures/effects-reference/round-3/`. The kernel, rules, verification
and preferred preset in both places are byte-identical to the staged `phosphor-echo` reference
(PRE-002). Only the intake README differs: it adds the integration status line and drops a private
local path.

The round-3 preferred numbers (0.29 / 3.2 / −4.7 / +5.64) are **historical**. The selected preset
is the owner-approved 3 November live-review export. The accepted reference confirms it:
"Presets remain single-owned and unchanged."

**One kernel.** The application source has:

- exactly one Echo compositing kernel (`phosphor-echo.tsx`);
- one front-glass promotion (`showPopover` in `crt-field.tsx`);
- one live `CrtField` mount (`RootLayout.tsx`), plus the register's contained specimen;
- one filter definition;
- no import of an intake snapshot, reference host or `.mjs` reference;
- no restated glass values outside the two `crt-` directories;
- one `clr-deadline-breathe` keyframes.

`src/ui/crt-glass/` is the raster reference port (effects TASK-005). It is never mounted.

**October 26 preview.** Only its recovered warning values were adopted, by TASK-008: 70 px,
1.5 s ease-in-out, .2/.8/.2, static .5. No other pattern from that preview was imported.

## 2. Composition order (AC-R033-02)

This is the browser's paint order with a native modal open, back to front. Each exposed pixel
receives each layer once.

1. Live atmosphere and the page. The Echo rears of background owners are painted beneath each
   owner, never inside a card or dialog body.
2. The modal's `::backdrop`:
   - For the logging dialog, TASK-016's A / Balanced backdrop: a 55% ground dim, an 85% corner
     vignette and a 4 px blur.
   - For other dialogs, 0.14.3's backdrop with its scan retired.

   The backdrop has no CRT layer of its own.
3. The dialog itself:
   - The logging frame's one Echo rear sits beneath the frame, in the frame's own role colour and
     on its full chamfer footprint. Nested content is excluded.
   - The frame, title, X and form are unfiltered and fully opaque, so the foreground stays sharp.
     Foundation's entry may hold an identity `brightness(1) saturate(1)`, which changes no pixel.
4. The one warning edge, while a deadline is in its final five running seconds:
   - It is portalled into the topmost open dialog and drawn above that dialog's content.
   - With no dialog open, it is on `body` at z-index 20, which is above the set-logging sheet's
     z-index 3.
   - It is pointer-transparent and covers the viewport.
   - It shares one phase with every urgent timer.
5. The one CRT front glass:
   - A non-modal manual popover, re-promoted above each newly opened dialog or popover.
   - `aria-hidden` and pointer-transparent. It is inert while a modal is open, so it never takes
     focus or input.
   - Its lines, grain and vignette darken or lighten restrainedly. Measured mean channel change
     over foreground text patches is 3.5–5.4 of 255. Perimeter softness is limited to the outer
     7% of each side.

## 3. Policy matrix (AC-R033-02)

| State | Glass | Echo rears | Balanced backdrop | Warning |
| --- | --- | --- | --- | --- |
| Effects on, motion allowed | One, both clocks running | Drawn | Drawn; 200 ms fade on open | Breathing .2/.8/.2, in phase |
| Effects off (live) | Removed. Its clock positions are kept by the host | None | Unchanged | Unchanged: it is meaningful, not decoration |
| Reduce motion: app choice or device | Same glass, both clocks paused in place | Drawn, static | Drawn; fade collapsed to ≤ 0.01 ms (`a11y.css`) | Steady .5, no animation |
| Motion allowed again | Same glass resumes, no restart | Drawn | Drawn | Breathing, re-pinned to the shared epoch |
| Dialog closed or deadline over | Stays one | — | Gone | Edge returns to `body`, or is removed. No urgent claim is left behind |

**Correction made here.** 0.14.3's own reduced-motion rule for the dialog backdrop fade
(`.clr-dialog[open]::backdrop`) is outranked by its fade rule
(`.clr-dialog[open]:not(.clr-dialog--closing)::backdrop`). The app's end-state guarantee
(`a11y.css`) did not cover `::backdrop`. So every modal backdrop, the Balanced one included, still
faded for 200 ms under either reduced-motion choice. `a11y.css` now collapses `*::backdrop` the
same way it collapses `*`, `::before` and `::after`. The Foundation bytes are unchanged.

## 4. Proof in the actual app (AC-R033-03)

`e2e/refinement/task-033.spec.ts`, mobile project, on the delivered revision. The cases are:

- **Source equivalence.** Pinned hashes of the owners. Where the project reference store is
  present, the same bytes are read back from eded158c… by identity. The selection exports, the
  moved intake bytes and the one-kernel scan are also checked.
- **`/workout` at phone 390** (synthetic contained session, nothing written). The open set log and
  the native Abandon dialog. One glass is painted over each, proved by comparing the same interior
  patch with the glass shown and hidden, with every animation held at its own start time. The edge
  is above them, in phase, and moves into the dialog and back. Effects off and on, live, with the
  dialog open: the glass returns above it. A draft typed in the log survives. Cleanup leaves no
  urgent claim. The dialog is scanned with axe.
- **`?state=urgency` at phone 390.** The warning under the accepted Balanced `LoggingOverlay`,
  which this task adopts in that state as the accepted reference does. Checked:
  - X focus and no visible Close word;
  - the frame's Echo rear;
  - the glass over the sharp frame;
  - the edge in the dialog's top layer;
  - with effects off, the backdrop and warning kept;
  - Escape returns focus to the opener;
  - a closed log holds no second warning.
- **Reduced motion at phone 320**, with the app's choice and then the device's: the long log and
  the warning. Glass paused in place, edge steady .5, backdrop fade collapsed, then resumed.
- **Each of the four skins** (clear, signal, vapour, mono) at phone 390 on `?state=ladder-long`.
  The Echo rear's ink equals the frame border's painted role colour. The glass is over a readable
  header (axe). Captures are attached.

The register's contained `CrtField` specimen and the `/gallery/app?component=…` effects demos are
the effects package's synthetic examples. They are not part of this proof.

## 5. Limits and open items

- **Routes.** No `/workout` logging entry uses `LoggingOverlay` yet: TASK-043–046 adopt it. On the
  route, the "open logging dialog" is still the set-logging sheet plus native dialogs, and those
  are what was proved there. The Balanced dialog composition is proved through the accepted
  gallery states, which mount the real shared owners. When the routes adopt the overlay, they
  inherit this order with no extra code. TASK-041 owns the cross-route sweep.
- **Perimeter softness.** The glass's perimeter softness (≤ 1.6 px, faded to 0 by 7% of the height)
  reaches the top of a full-height dialog's header on a phone. This is the owner-accepted
  front-glass treatment. Changing it is a preset decision in `config.ts`, not part of this task.
- **Two vignettes.** The Balanced backdrop's corner vignette and the glass's vignette both darken
  the corners outside the dialog. Each was selected separately (R127 Balanced, and the 3 November
  glass). Neither was retuned here.
- **Entry animation.** The logging frame sits in a `PhosphorEchoFrame` wrapper inside the app shell
  (as in the accepted reference). So 0.14.3's `> .clr-bleed` phosphor entry does not apply to it.
  This is the same with effects on and off, so behaviour is consistent. `AppDialog` keeps its own
  entry.
- **Not observed.** Browser evidence is Chromium only. Safari/iOS `backdrop-filter` behaviour
  inside the top layer and physical-phone performance were not observed (see
  `docs/effects/performance.md`).
- **Recovery path.** JOURNEY-033's failed-save retry belongs to the logging consumers' writers
  (TASK-015/047). The composition never unmounts a form or touches a draft, and is proved not to.
  No live data was modified.
