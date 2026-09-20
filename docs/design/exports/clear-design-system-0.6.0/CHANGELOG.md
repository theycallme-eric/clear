# Changelog

The consumer contract is: the **public entry** (`index.js` / `index.d.ts`), **semantic tokens** (`--surface-*`, `--border-*`, `--text-*`, `--icon-*`), **component props** (see each `.d.ts`), the **`.clr-*` CSS classes**, and the **`data-skin` / `data-theme` / `data-atmosphere` attributes**. Those change only with a note here. Ramp math, internal file layout, and specimen cards are internal and may change freely.

## 0.6.0 — 2026-09-19 · Responsive constraints, and one system for more than one product

Two confirmed foundational gaps closed, and the documentation stopped describing a workout app as if it were the system.

DS-001 and DS-007 were both reported the same way: a product hit a wall, wrote a local override reaching into component internals, and shipped. That is the signal that a contract is wrong, not that a consumer is careless — a layout rule you have to remember is a layout rule that eventually gets forgotten, and the thing that breaks is reachability.

### Added — public

- **`OverflowRail`** (new public component). Keeps a row of peer items reachable when the width cannot hold them: containment, horizontal scrolling, directional overflow cues, active-item reveal. It owns behaviour and imposes no meaning — semantics pass through `trackProps` onto the element that directly contains the items, so a `role="tablist"` keeps `role="tab"` children as immediate descendants. Props: `activeIndex`, `gap`, `revealPadding`, `trackProps`.
  - **Always on.** No prop enables it; it is inert while the content fits and engages under pressure. There is deliberately no opt-in, because an opt-in is a thing a consumer can forget.
  - **The cue is structural, never a fade.** A hard edge rule plus a stepped chevron, shown only on the side that has more content. A gradient would soften an edge this system draws sharp everywhere else.
  - **No tab stop of its own.** The items are focusable and scroll into view natively when focused; a tabbable wrapper would compete with a roving tabindex. The cues are pointer affordances — `aria-hidden`, never focusable.
- **Tokens** `--surface-rail-cue`, `--border-rail-cue`, `--text-rail-cue`. The surface reads `--ground`, making this the canonical in-system use of that extension hook.
- **Tokens** `--dur-disrupt` (300ms) and `--dur-boot-reveal` (700ms), naming two timings that were literals with no token at their value.
- **Tokens** `--surface-input-invalid`, `--border-input-invalid`.
- **CSS** `.clr-rail`, `.clr-rail__scroller`, `.clr-rail__cue`.
- **Specimen** *Responsive Constraints — DS-001 · DS-007*: interactive, all four skins, with a live width control. It reports measured page and container overflow rather than asserting the fix.
- **Specimen** *OverflowRail* component card.

### Changed — public behaviour

- **`TabBar` composes `OverflowRail`.** A tab set that cannot fit now scrolls with cues and reveals its active tab instead of overflowing the page. The tabs contract is untouched: tablist semantics, roving tabindex, automatic activation, `aria-controls`, Home/End, disabled-tab skipping. TabBar remains always a tablist and never switches to navigation semantics — route navigation composes `OverflowRail` inside its own `<nav>`. Tab labels no longer shrink or wrap; shrinking is the rail's job.
- **`Input` shrinks inside constrained flex and grid parents.** It releases the intrinsic minimum width that makes form controls refuse to shrink as flex/grid items, so it takes the width it is given rather than forcing its parent to overflow. Height, focus ring, label, placeholder, entered text, validation and affordances are unchanged, as is standalone sizing. Consumers can delete `min-width: 0` overrides that reached into these internals.
- **`Input`'s invalid state no longer mismatches its frame.** It was a red border (`--border-toast-negative`) over a structure-tinted surface — and an input borrowing a toast token for its own state. Both layers now come from urgency. The only pixel change in this release that is not caused by width.

### Fixed

- **All three templates loaded every stylesheet twice.** Each `ds-base.js` linked the four CSS layers *and* `styles.css`, which `@import`s those same four. Output was identical but the cascade was doubled, and consumers copied the pattern out of the templates. Now `styles.css` only.
- **`--dur-scan` existed while the scan band ran on a literal `2s`.** Same value, so no visual change — but the token was decorative until now.
- **Version drift, again, in a fourth place.** `index.d.ts` still declared `VERSION: '0.5.0'`. `index.js`, `package.json`, `index.d.ts` and this file now all read `0.6.0`.
- **The README's index table was split in half**, with five rows orphaned below the component list where they rendered as broken markdown.

### Documentation — no behaviour change

- **README restructured.** Universal guidance first; the workout application's voice, copy, card composition, layout policy and product prohibitions moved verbatim into an explicitly labelled **Workout application product profile**. Nothing was deleted — it is preserved in the README rather than in `docs/`, because the README ships in the export and `docs/` does not.
- **Corrected:** the index naming removed Magnesium and Sodium skins; "six hexes" (the contract is five role hues plus a base and an ink); the claim that the export is self-contained and carries `components/`, `docs/`, `skin.js` and `package.json` (it carries none of them — there is now a section saying exactly what it does carry); stylesheet-loading guidance.
- **Motion honesty.** "Atmospheric drift is the only eased exception" was false — logo boot eases too. Both are now documented as the two exceptions, stated once, with the rule that a third needs to join the list or not ship.
- **Atmospheric durations (14s/16s/18s/20s/22s) are documented as deliberately unequal** and deliberately not tokenised: they are spread so the composite never visibly repeats, and collapsing them onto one token would resynchronise the field into a single pulsing mass.
- **Off-rung frame tokens annotated** where a component deliberately departs from the 5/10/15 rungs.

### Removed

- **Specimen cards `Components — Tabs & Streak Bar` and `Components — Slider & Mood`.** Both were hand-drawn mockups on legacy hue aliases rather than the real components, and both duplicated contracts that `states-gallery` already demonstrates live. The tabs one had become actively wrong: it showed a tab bar that cannot scroll.

  Every pattern they taught survives on a card that renders the real component: underline tabs → the `TabBar` card; the segmented streak bar → the `Progress` card, which renders `segments` live; the intensity slider → the `IntensitySlider` card; the four-option mood selector → the `ChoiceGroup` card. **No public API, token, component or alias was removed** — legacy hue and font aliases are untouched and remain supported.

### Caught in verification, fixed before release

Both found by measuring the regenerated build, not by reading the code.

- **The rail cue's structural edge rule failed contrast in three of four skins.** At the `--structure-a500` rung it composited to 2.52:1 (Clear), 2.50:1 (Vapour) and **1.74:1 (Mono)** against the cue surface, under the 3:1 a non-text indicator needs. The chevron was always clear (8.1–16.8:1), so the cue still read — but the hard structural rule, the half that carries CLEAR's vocabulary, was nearly invisible in the grey skin. `--border-rail-cue` is now full strength, re-measured at 6.58 / 6.52 / 16.37 / 3.66 across Clear, Vapour, Signal and Mono. Both halves of the cue joined the Contrast Audit.
- **The cue could latch stale.** It sampled `scrollLeft` inside the scroll event, which can fire before the browser settles the final offset. The read now happens on the next animation frame, and a change to the item set re-checks too.

### Specimen fixes from automated review

- The DS-007 caption rendered literal `<code>` tags as text; the section notes failed AA at 4.49:1 (now 6.19:1).
- `createRoot` warned on load across the card set. Every component card, plus `states-gallery`, `brand-logo` and `icons`, is now idempotent; the canonical specimen mounts into a container React does not already own, which also survives a cached duplicate of its own script.

### Not done, deliberately

DS-002, DS-003, DS-004, DS-005, DS-006, DS-008 and DS-009 are unchanged. Each still rests on evidence from a single product; see `CLEAR-0.6.0-RECONCILIATION-REPORT.md` for the per-request reasoning.

> **On dates.** `0.6.0` is dated from the release itself. `0.2` and `0.1` carry 2026-08-21, corroborated by the recorded repository sync in `github.md` (`2026-08-21T16:33:49Z`) covering the import and restructure those entries describe. The releases between them previously carried dates that no artifact in this project supports; those have been removed rather than approximated. An undated heading below means the date is unknown, not that the release did not happen.

## 0.5.2 · Frame role coherence

A frame paints a border and a surface. Border colour is the layer that gets swapped per state; the surface is the layer people forget. So the surface stayed on `--surface-card`, which reads from **structure** — and a failure toast, a selected chip or any `ChamferedFrame` handed a `borderColor` rendered an orange-tinted panel inside a red, green or blue frame. Two layers, disagreeing about which role was speaking.

The rule is now stated, tokenised, and cheaper to follow than to break.

### Added

- **Frame role pairs** in `foundation.css`: `--surface-frame-<role>` and `--border-frame-<role>` for all five roles (`structure` · `interaction` · `selection` · `urgency` · `info`), at three rungs — `-quiet` (5%), default (10%), `-strong` (15%). Roles only, no new hues. Above 15% a tint stops reading as a frame and becomes a filled control, which is `--surface-selected`'s job.
- **`.clr-chamfer--structure` / `--interaction` / `--selection` / `--urgency` / `--info`** set both layers from one class.
- **`ChamferedFrame` takes `role`.** Resolves `surfaceColor` and `borderColor` together from one role. `surfaceColor` / `borderColor` remain as escape hatches.
- **`--surface-input-invalid` / `--border-input-invalid`**, so an invalid field stops borrowing a toast token for its own state.
- **Colors — Frame Roles** specimen card: the five roles as frames, plus the mismatch as an explicit *don't*.
- The rule is written up under **Color** in the README and as a cross-cutting section in `docs/patterns.md`, alongside the unchanged "2–3 colours in view" and "never colour alone" rules.

### Fixed

- **`Input`'s invalid state was a red border on an orange field.** Border came from `--border-toast-negative` while the background stayed `--surface-input` (structure at 10%). Both layers now come from urgency. This is the only visual change in the release.
- **`ChamferedFrame`'s `scan` overlay produced an invalid colour for every token value.** The gradient was built by concatenating a hex alpha suffix onto `borderColor`, so `var(--border-card)38` — it only worked if the caller passed a literal hex. Now relative colour syntax against the resolved border colour.
- **`ChamferedFrame` no longer falls back to `--surface-card` when given a bare `borderColor`.** It derives a 10% tint of the border colour instead. That fallback was the mechanism behind the mismatch.
- **Version contract drifted again at 0.5.1** — the CHANGELOG gained a release, `VERSION` and `package.json` did not. All three read `0.5.2`.

### Internal

- Component frame tokens now read from the role pairs rather than from a rung directly, so the role a component claims is visible in its own definition and a skin re-pointing a role moves both layers at once. Values are unchanged — `--surface-card`, `--border-card`, `--surface-empty`, `--border-empty` and the three toast pairs all resolve exactly as before. Deliberate off-rung exceptions (low-time timer at 20%, positive toast at 20%) are annotated in place; an unannotated bare rung on a frame token is now read as drift.
- Contrast Audit covers **88 pairs**, up from 64: the five role frames under body text, and the new invalid-input surface.

## 0.5.1 · The info role is informational again

### Fixed

- **The system had no box-sizing reset, so every explicit size was wrong by its padding.** `*, *::before, *::after { box-sizing: border-box }` is now in the foundation. Every sizing value here — the 40px touch minimums, the 64px toast row, `.clr-shell__content`'s max-width — was written assuming padding sits inside the declared size, and the browser's content-box default was adding it on top: a "40px" control rendered at 56, a "64px" toast at 88. `.clr-shell__content` had a hand-patched `box-sizing` that was papering over the same gap; it is removed as redundant. Measured after: Button 42 · Chip 40 · Input 41 · Tab 40 · Toast 64, all at or above their intended minimums.

  **Breaking for consumers** who load `styles.css` into an existing page: the reset applies document-wide, in keeping with the system already owning `body`, headings, `p` and `label`.
- **Toast height depended on which optional controls were present.** An action button set `minHeight: 40`; a dismiss button did not. So an info toast with no action rendered 44px against 64px for the other two, and the row height silently tracked the props rather than the component. `minHeight: 64` now lives on the toast root — height is a property of the toast, not of its contents.
- **Severity glyphs read primitives directly** (`--structure-300`, `--selection-400`), the same layer violation fixed elsewhere in 0.3. Now `--icon-toast-info` / `-positive` / `-negative`, which is also what lets Mono re-point its info glyph to the structure rung alongside its frame.

- **The info toast used the structure hue.** `--surface-toast-info` and `--border-toast-info` read from `--structure`, so an informational message wore an orange frame in CLEAR, purple in Vapour and chartreuse in Signal — the frame colour, not the info colour. Introduced in 0.3 and then rationalised in the docs as "`--info` is atmospheric accent only", which described the bug rather than a decision. Both tokens now read `--info-a100` / `--info-500`.
- **Mono keeps the structure fallback, measured rather than assumed.** Mono's `--info` is `#3A3A3A`, deliberately the lowest rung of its value ladder; as a toast border it measures **1.74:1** against the ground and effectively disappears. Mono scopes the two tokens back to structure (**3.66:1**) and lets the severity glyph carry the meaning. Border contrast for the other three: 5.11 CLEAR · 14.89 Vapour · 4.43 Signal.

## 0.5 · The role swap is gone

### Breaking

- **`data-theme="swap"` and `data-theme="blue"` are removed.** The role swap traded structure and interaction so frames took the interaction hue and actions took the structure hue. It was CLEAR's blue-mode generalised, and it never generalised well: the two roles are not symmetric — structure appears at full strength or 10%, interaction lives at 40–60% over near-black — so a hue chosen for one job often failed at the other. Two of four skins already refused it. Rather than keep a feature that half the family opted out of, the axis is gone. Nothing replaces it; pick the hue for the job.
- Removed with it: `--skin-swap-safe`, the entire `--skin-structure-*` / `--skin-interaction-*` indirection layer, the per-skin swap-refusal blocks, and `canSwap()` / `setRoleSwap()` from `skin.js`.

### Changed

- **A skin is now seven declarations** — five role hues, a base and an ink. Previously each skin also restated ten ramp values plus the `--skin-*` source set, purely so the swap could cross-assign without a cycle. With the swap gone, the ramps derive at `:root` from the seven, and because the attribute and the derivations both land on `<html>` they recompute for free. `css/skins.css` went from ~250 lines to ~60.
- **CLEAR's pinned ramps moved out of `:root`** to `[data-skin="clear"], :root:not([data-skin])`. They are hand-tuned brand hexes that differ from the derived values by up to ΔsRGB 37, so they are worth keeping — but at `:root` they load after `foundation.css` and would now leak CLEAR's orange ramp into every other skin, since siblings no longer restate their own. Same applies to `--selection-400/900`.
- **`preview/skin-swap.html` → `preview/skins.html`**, card renamed "Skins". The Colors — Roles card drops its swap column, and the States Gallery drops its Role swap toggle.

### Notes

- The asymmetry that killed the swap is now stated positively in the README and the Roles card: structure hues are exempt from the alpha test *because* they never appear in the 40–60% band, and that exemption is exactly why the two roles cannot be exchanged.

## 0.4 · Mono, and the governance pass

### Breaking

- **`Dialog.onClose` now fires exactly once per dismissal.** It previously fired twice on Esc: `onCancel` called `preventDefault()` and notified, the consumer set `open={false}`, the effect called `el.close()`, and the native close event notified again. Esc is no longer intercepted, and programmatic closes are suppressed — so a controlled parent cannot loop. If you were compensating for the double-fire, remove the workaround.
- **`Dialog` no longer dismisses on a backdrop click unless you ask.** New `dismissOnBackdrop` prop, default false: a destructive confirmation must not be dismissible by a stray click.

### Fixed

- **`ChoiceGroup` single-select claimed radio semantics without radio keyboard behaviour.** It set `role="radio"` and `aria-checked` but had no roving tabindex and no arrow handling, so assistive tech announced a radiogroup whose arrow keys did nothing — worse than not claiming the role. It now implements the full pattern: one tab stop, arrows, Home/End, selection follows focus. Multi-select stays a set of independently tabbable toggles, which is the correct pattern for that question.
- **The published version was wrong.** `package.json`, `index.js` and `index.d.ts` all said `0.3.0` while the CHANGELOG documented 0.4. All four now agree at `0.4.0`, and the description no longer says "three skins".

### Added

- **`skin.js`** — the skin selection and persistence contract, which was previously left to each consumer. Precedence: an explicit stored choice, then `prefers-contrast: more` → `mono`, then the app default. A user choice always wins; the OS preference is followed live only while no choice is stored. Also clears `data-theme` when moving to a swap-unsafe skin.
- **`LICENSE`** — the project had none, and `package.json` had no `license` field. Now proprietary, with third-party terms recorded (fonts under OFL and loaded from Google Fonts, React under MIT as a peer dependency, and the icon set as original work whose Zondicons-derived geometry study was fully redrawn).
- **Contrast Audit card** — measures all 64 pairs (16 × four skins) live from the resolved tokens and fails loudly, failures sorted to the top. The claim is now self-verifying rather than a table someone has to remember to re-check.

  It found two real failures on its first run, both of which had been shipping as passing:

  - **`--text-negative` measured 3.51:1 on the negative toast surface in CLEAR** — below AA. At 92% urgency the text was nearly as dark as the tint beneath it. Quieting the surface could not fix it: CLEAR's urgency is intrinsically dark, so text derived from it stays under 4.5:1 on a near-black ground even at a 5% tint (3.75). The text had to lighten, so it lightened by **the minimum that clears the threshold** — 75%, measuring 4.75:1 — rather than the comfortable 70% first applied. Global, because the failure is in the token, not in one skin.
  - **`--text-empty-body` missed AAA in Mono at 6.81:1**, and **`--text-tab-inactive` at 6.78:1.** Both were raised globally in the first cut, which lightened CLEAR's helper text and inactive tabs for a problem CLEAR did not have — it met AA at its own values. **Both reverted to their original values and the tightening scoped to `[data-skin="mono"]`.** Mono exists so the colour skins do not have to compromise toward its target; letting its threshold pull their alphas defeats the point.

  Neither was reachable by reading the tokens: both are translucent text over a translucent tint over the ground, so only compositing the real stack surfaces them. This is the argument for the card over a static table.

- **`data-skin="mono"`** — enhanced contrast as a fourth skin rather than a fork. **Not "the accessible skin"**: accessibility is the baseline in the component layer and applies to all four skins equally. Mono is a contrast preference, the same class of thing as reduced motion. The earlier framing implied the other three were inaccessible, which is untrue and invites treating the baseline as optional. Five greys, one lightness step per role, ordered by how much attention each is entitled to: info `#3A3A3A` · structure `#6A6A6A` · interaction `#8E8E8E` · selection `#D4D4D4` · urgency `#FFFFFF`. Same role slots, so geometry, spacing, type, density and motion are unchanged.
- Every text pair clears **AAA** (7:1 normal, 4.5:1 large); 7.4 at the tightest. Values were solved against the thresholds, not chosen and then checked.
- **Contrast figures are now measured by rasterizing the resolved token**, not computed from the token arithmetic. The first cut of the Mono table was derived from sRGB channel interpolation while the CSS declares `color-mix(in oklab, …)`; at the same stated percentage those differ materially — 62% ink over the mono ground is `rgb(151,151,151)` in oklab (6.78:1) versus `rgb(162,162,162)` in sRGB (7.76:1). Most pairs had the headroom to absorb it; `--text-tab-inactive` did not, and shipped as a published 7.5 that was really 6.78. This supersedes the "arithmetic against the token definitions… not verified against painted pixels" caveat in 0.3: published numbers now come from pixels.
- **Mono Skin** card with the measured table, and Mono added to the Skin Swap card.

### Changed — all skins

- **Toast severity now carries a glyph** as well as a border hue. Border colour alone collapsed entirely in mono, and was always weak for red-green deficiency — so this shipped in the shared component layer rather than as a mono special case. Distinct silhouettes (stamped "i", tick, warning triangle) so severity separates by shape, not tone.
- **`--text-tab-inactive` no longer borrows the disabled neutral.** It measured 2.57:1. WCAG exempts disabled controls from contrast requirements; an inactive tab is an available control, so the exemption never applied. Now a pure value dim of the ink at 62% — clearing AA comfortably in the colour skins (6.06 CLEAR · 6.09 Vapour · 6.11 Signal), with Mono overriding to 66% for its AAA target.

### Fixed — foundation

- **`em, i` no longer forces the page body colour.** The rule set `color: color-mix(in srgb, var(--text-paragraph) 75%, transparent)`, which hardcodes the body hue and therefore beats inheritance anywhere emphasis sits on a custom ground — it rendered pale blue on a white swatch at **1.05:1**, i.e. invisible. Now `currentColor` (which, in the `color` property, resolves to the inherited value), so the same dimming follows whatever colour the emphasis is actually in. Byte-identical in body text.

### Changed — documentation

- **The Colors cards were reorganised by role.** They previously had one card per CLEAR hue — "Orange (Structure)", "Blue (Interaction)" — which taught the wrong model for a four-skin system and duplicated the same coupling twice. Now three cards: **Roles** (the structure/interaction pairing, the swap, and per-skin swap safety), **Ground** (base and ink per skin, so `#171717` is no longer presented as the system base), and **Semantic** (selection, urgency and info per skin, with the corrected urgency definition and the severity glyphs). Retired `color-blue.html`, `color-orange.html` and `color-neutrals.html`.

### Notes

- Mono is **not swap-safe**, enforced in CSS like Signal's. The swap reverses two hues; with none to reverse it would only trade the structure and interaction rungs and invert the value hierarchy.
- The timer's resting and low surfaces sit 0.02 L apart in mono — both a light grey at low alpha over the same ground. Rather than re-map the alpha relationships, the low state doubles its border, the same mechanism focus uses.
- Skins are root-level: `data-skin` belongs on `<html>`. Semantic tokens are declared at `:root`, so a subtree attribute leaves them resolved against the root's roles.

## 0.3 · Production hardening

No new visual direction. Same three skins, same geometry, same motion vocabulary. This pass makes the component system as disciplined as the visual language.

### Breaking

- **`Checkbox` and `RadioButton` are now native `<input>` elements.** `onChange` was `(checked) => void` on Checkbox and is now `(checked, event) => void`; RadioButton's `onSelect` is replaced by `onChange(value, event)`. Radios in a group now need a shared `name` — that is what gives them native arrow-key navigation. Migration: rename `onSelect` → `onChange`, add `name` to each group, read the first argument as before.
- **`IntensitySlider.onChange`** is now `(value, event) => void`.
- **`Input.onChange`** is now `(value, event) => void`.
- **`--surface-timer` and `--surface-selected` changed value substantially** (see Visual below). Anything that hardcoded the old alpha will look different — which is the point.

### Deprecated, still working

- **`--urgency` is no longer documented as "time pressure, not danger".** The role is unchanged and the token name is unchanged; the *definition* was too narrow, since error states legitimately used the same role. It now means "demands attention now", covering both time pressure and failure. No rename, no alias, no migration: distinguish the two cases with text, icon and placement, never with a second red.
- **`--info` is documented as atmospheric accent only.** It has a full ramp and alpha ladder as of this release, so it *can* carry a surface — but nothing informational in the system consumes it, and the README says so rather than implying otherwise.
- **`colors_and_type.css`** remains as an external-compat alias. Nothing internal links it.

### Accessibility

- **Visible focus on everything.** Unclipped controls get an outline; chamfered elements express focus as a **doubled border** in the focus hue, because a chamfer's `clip-path` clips its own outline away. The width change is deliberate — a colour change alone is not a focus indicator.
- **Focus ring** is a near-white tint of the interaction role: unmistakable on all three skins, still skin-tinted rather than browser blue.
- **Selection is no longer colour-only.** `Chip` and `ChoiceGroup` show a solid tick alongside the green surface, and expose `aria-pressed` / `aria-checked`.
- **Native form controls.** Checkbox and radio are real inputs, so form participation, `required`, indeterminate, radio grouping and arrow-key navigation are the platform's rather than ours.
- **Tabs implement the ARIA tabs pattern** — one tab in the tab sequence, arrow keys, Home/End, `aria-controls`, disabled-tab support, and a matching `TabPanel`.
- **Slider** has a real accessible name, an `<output>` associated with the input, `aria-valuetext` support, and native keyboard behaviour intact.
- **Live regions scaled to severity.** Only `Toast variant="negative"` is assertive (`role="alert"`); info and positive are polite status. `ScanLoader` is a polite region with `aria-busy`, and its log lines are `aria-hidden` — a boot log read line by line is noise.
- **`TimerDisplay` is labelled but not a live region.** Announcing every second makes the rest of a screen unusable; consumers announce milestones themselves.
- **Touch targets.** Visible controls stay compact; hit areas are ≥40px, ≥44px on coarse pointers. Checkbox and radio put the real input over the box at target size, so the enlarged area is the input itself.
- **Forced colors** support: chamfer layers fall back to system colours, atmosphere is hidden.

### Contrast

Measured, not estimated. Every selected and timer pairing sat between **2.2:1 and 3.0:1** before this release.

| Pairing | Before | After | Threshold |
|---|---|---|---|
| Selected control (small text) | 2.75–3.04 | **5.17–5.99** | 4.5 (AA) |
| Timer at rest (24–40px digits) | 2.50–2.63 | **7.35–8.76** | 3.0 (AA large) |
| Timer low | 2.24–2.54 | **3.15–5.15** | 3.0 (AA large) |

Compact selected controls take a strong surface with dark text; large readouts invert it — quiet surface, bright text. Low-time stays the more aggressive state through hue and the micro-pulse, not a louder surface. Glow was never counted toward contrast.

Atmospheric and decorative layers are deliberately *not* held to these thresholds; a full accessible mode is a separate, larger piece of work.

**How these were measured.** Superseded in 0.4. These 0.3 figures are arithmetic against the token definitions, which is accurate only where the declaration is an alpha composite; anywhere the token uses `color-mix(in oklab, …)` the sRGB arithmetic drifts. From 0.4 on, published ratios are read back from rasterized pixels — see that entry.

### API

- **Public entry point**: `index.js` + `index.d.ts` export every public component and all 75 icons, with a `VERSION` constant and React `>=18` as a peer dependency. `package.json` declares `exports` for the entry, `styles.css` and the browser bundle.
- **`components/` is the single canonical implementation.** `_source/` is read-only reference and is not re-exported; `ui_kits/` is a worked example, not a library surface.
- Components accept `className`, spread native attributes, forward standard ARIA, and no longer swallow consumer event handlers.
- **`Input`** gained `id`, `name`, `type`, `required`, `readOnly`, `autoComplete`, `invalid`, `helperText`, `errorText`, `onFocus`, `onBlur`, and `aria-describedby` wiring.
- **No component injects global CSS during render.** `Input`'s placeholder rule and the slider's track/thumb rules moved to `css/foundation.css`.
- **No random IDs.** `ChamferedFrame` uses `useId()`; every generated id is hydration-stable.
- **`ChamferedFrame`** gained `contentStyle`, because `display: flex` on the frame laid out its content wrapper rather than the children.
- Hardcoded weights, durations, borders and type sizes replaced with tokens. SVG path geometry remains in pixels — an internal exception, documented in the component.

### Fixed

- **The chamfer trace never animated.** `transitionProperty: "stroke"` excluded `clip-path`, so the border snapped. Worse, the trace's CSS `clip-path` was silently defeating the mitre clip on the same element. The mitre now lives on a `<g>` wrapper and the trace on the path.
- **Signal's swap refusal is enforced in CSS**, not just disabled in the demo control. Setting `data-skin="signal" data-theme="swap"` by hand used to produce the broken olive state.
- **Boot no longer manufactures delay.** The sequence tracks real initialization, continues automatically when work completes, reports honestly when it runs slow, and offers retry on failure. Enter appears only where it represents consent.

### Added

- **Components**: `Button`, `IconButton`, `FormField`, `ChoiceGroup`, `Dialog` (native `<dialog>` + `showModal`), `AppHeader`, `Progress`, `TabPanel`.
- **Atmosphere intensity modes** — `data-atmosphere="full | quiet | operational"`. Same layers, three intensities, chosen per screen. Full for boot and brand, quiet behind reading and forms, operational for mid-set glanceability.
- **Semantic motion layer** — `--dur-enter`, `--dur-exit`, `--dur-state`, `--dur-nav`, `--dur-drift`, plus `--ease-drift` and `--dur-scan`. Components read these rather than raw durations.
- **Full ramps and alpha ladders for `selection`, `urgency` and `info`.** Previously urgency had two alpha steps and info had none, so a skin could not put its neutral hue on a surface without inlining `rgb(from …)`.
- **Missing semantic tokens** for the seven components that were reaching past the semantic layer into primitives: `--text-timer-low`, `--border-tab-rail`, `--border-tab-active`, `--text-tab-active`, `--text-tab-inactive`, `--surface-empty`, `--border-empty`, `--icon-empty`, `--text-empty-title`, `--text-empty-body`, `--text-scan-line`, `--surface-track`, `--surface-thumb`, `--surface-toast-*`, `--border-toast-*`, `--text-negative`.
- **`docs/patterns.md`** — seven workflow patterns with states, accessibility behaviour, atmosphere level, content guidance, and what not to do. Written generically; CLEAR's app is the worked example, not the contract.
- **States Gallery** and **Atmosphere Modes** cards. The gallery renders the compiled components — no HTML-only clones — with skin, role swap, narrow container, long label, reduced motion and 200% zoom toggles.
- **`.clr-hit`** utility for enlarging a hit area without shifting layout, and `.clr-load-ticks`, the system's stepped stand-in for a spinner.

### Notes

- The **ramp scale is exactly 100 · 300 · 400 · 500 · 600 · 900** — no 200, 700 or 800. Documented in `css/foundation.css` because a missing step falls back silently.
- **Skin is a root-level product setting.** Apply `data-skin` to `<html>`. Alpha tokens resolve where declared, so a subtree skin leaves derived ramps inherited from the root. `data-atmosphere` *is* per-subtree by design.
- `_adherence.oxlintrc.json`, `_ds_bundle.js` and `_ds_manifest.json` are compiler-generated and are never hand-edited.

## 0.2 — 2026-08-21

- Skins: family finalized as CLEAR (default), Vapour, Signal in `css/skins.css`, switched via `data-skin` on `<html>`. Sodium and Magnesium cut (too close to CLEAR / repetitive green).
- Role swap now crosses the tint ramps via `--skin-*` sources; skins whose structure hue fails the alpha test declare `--skin-swap-safe: 0` and refuse the swap.
- Components: Chip, Checkbox, RadioButton, IntensitySlider, Input, TabBar, TimerDisplay, Toast, ScanLoader, EmptyState added as compiled parts with motion baked in.
- Layout primitives: `.clr-shell`, `.clr-stack`, `.clr-row`, `.clr-atmosphere--fixed`.
- All internal links point at `styles.css`; `colors_and_type.css` remains as an external-compat alias only.

## 0.1 — 2026-08-21

- Restructured into foundation / motion / skin layers under `styles.css`.
- Chamfer shipped as `.clr-chamfer` (CSS) and `<ChamferedFrame>` (React).
- Motion layer built from the app's real timings; Motion Lab and Alpha Behaviour cards added.
