# CLEAR Design System

*Version 0.9.7. Visual decisions were each made from a side-by-side comparison; the record is in `explorations/index.html`.*

> **A low-tech sci-fi instrument language: emissive interfaces, light on dark, built for operators.**
> Angular geometry, chamfered frames, mechanical motion, roles instead of hues.

CLEAR is a cross-product design system. It began in a workout application and now also supports Project Control, with more consumers expected. **No single product owns its terminology, components, APIs, semantic roles, content policy, layout model, motion model, responsive behaviour or documentation language.** Everything above the product-profile section at the end of this document is universal and safe for any CLEAR consumer.

Making CLEAR cross-product does not make it neutral. The visual character — the angularity, the phosphor palette, the stepped motion — is the system, and it is not up for negotiation by any consumer.

---

## Consumers

| Product | What it is |
|---|---|
| **Workout application** | React 19 + TypeScript + Vite + Supabase SPA. Generates sessions, logs execution, tracks streaks. Mobile-first with adaptive tablet/desktop layouts. Its content and layout policy lives in the product profile at the end of this document — not here. |
| **Project Control** | A separate consumer. Its vocabulary stays in its own product; none of its concepts appear in CLEAR's public API. |

A product may supply evidence that CLEAR is missing a capability. It does not thereby name that capability, choose its anatomy, or make its own composition into system API.

## Sources

- **Origin repo:** `theycallme-eric/clear-app` (branch `main`), imported into `_source/` as a historical reference for the workout application's original implementation. **It predates every calibrated decision: don't copy patterns from it.**
- **Design philosophy doc:** `docs/design-philosophy.md` (consult when breaking ties).

Working in *this* project, you have the whole tree. Consuming the system elsewhere, you have the exported dependency, which is a strict subset — see **What the export actually contains** below.

---

## Index

| File / Folder | What's in it |
|---|---|
| `README.md` | This document — philosophy, content rules, visual rules. |
| `SKILL.md` | Claude Code skill entrypoint. |
| `styles.css` | **Entry point.** Load this one file. |
| `css/foundation.css` | The bones — shape, spacing, type scale, role tokens. Names no colour. |
| `css/motion.css` | The movement vocabulary — durations, step functions, keyframes. |
| `css/skin-clear.css` | CLEAR's identity — five role hues, a base, an ink, three fonts. **Swap this file to reskin.** |
| `css/skins.css` | The rest of the family — Vapour, Signal, Mono. |
| `components/` | **The canonical public implementation** (`.jsx` + `.d.ts`). |
| `index.js` / `index.d.ts` | The public entry point. If it is not exported here, it is not public. |
| `docs/patterns.md` | Workflow patterns — states, a11y behaviour, content, what not to do. |
| `fonts/` | Webfont notes (Google Fonts CDN — Rajdhani, Oxanium, Space Grotesk). |
| `assets/` | Logo SVG, favicon, iconography. |
| `preview/` | HTML specimen cards rendered in the Design System tab. |
| `templates/` | Starting folders a consuming project can copy. |
| `_source/` | Historical reference from the origin repo. Predates the calibrated rules; never copy from it, never edit, never re-export. |
| `ui_kits/app/` | A worked example app built only from the system's classes and rules: the representative workout consumer, not a library surface. |

### Consuming the system

Two supported paths, both serving the same implementations from `components/` — there is no second copy.

**With a bundler:**

```js
import { Button, Chip, TimerDisplay, Dumbbell } from 'clear-design-system';
import 'clear-design-system/styles.css';
```

**Browser, no build step** — what the specimen cards in `preview/` use:

```html
<link rel="stylesheet" href="styles.css">
<script src="_ds_bundle.js"></script>
<script>const { Button, Chip } = window.CLEARDesignSystem_4ee044;</script>
```

React `>=18` is a peer dependency. `VERSION` is exported from the entry and agrees with `package.json`, `index.d.ts` and the CHANGELOG.

**Load `styles.css` and nothing else.** It `@import`s the four CSS layers in order. Linking `styles.css` *and* any layer file directly parses that layer twice; the rendered result is the same, but the cascade doubles and it becomes hard to reason about which rule won an override. One stylesheet link.

### What the export actually contains

The exported dependency is **not** this folder. It carries the README, `styles.css`, the four CSS layers, the compiled `_ds_bundle.js`, `_ds_manifest.json` and the adherence config. It does **not** carry `components/`, `docs/`, `assets/`, `_source/`, `preview/`, `templates/`, `package.json` or `skin.js`.

So: in a consuming project, components come from the bundle on `window.CLEARDesignSystem_4ee044`, not from `components/`; `docs/patterns.md` is not present, which is why the patterns that matter most are repeated in this README; and `skin.js` must be copied across if you want it. Instructions elsewhere in this document that name a source path are for working *in* this project.

### Choosing a skin

Four skins with no persistence contract means every consuming app invents one, so the system ships `skin.js` — no dependencies, no build step, small enough to read in full.

```html
<script type="module">
  import { initSkin, setSkin } from './skin.js';
  initSkin();              // apply the resolved skin before first paint
  setSkin('mono');         // explicit user choice, persisted
  setSkin(null);           // clear the choice, fall back to the preference
</script>
```

Precedence, highest first:

1. **An explicit user choice**, in `localStorage` under `clear.skin`.
2. **`prefers-contrast: more`** → `mono`.
3. **The app's default**, else CLEAR.

A user choice always wins, including choosing a colour skin while the OS asks for more contrast — overriding that would be deciding on someone's behalf about their own eyes. While no choice is stored, the OS preference is followed live.

`data-skin` belongs on `<html>`. The ramps and alpha ladders are derived at `:root`, so a subtree attribute overrides the hues but leaves every derived token inherited from the root. Call `initSkin()` from a blocking script in `<head>` so the first paint is already correct.

### Components

Every part ships as `<Name>.jsx` + `<Name>.d.ts` under `components/`, compiled into the bundle, with motion baked in:

- **ChamferedFrame** — the signature container over `.clr-chamfer`: role, corner size by height, trace-on, scan sweep.
- **Chip** — toggle chip: 40% selection tint, full border and a tick when chosen; interlace-flickers on toggle.
- **Checkbox** / **RadioButton** — both square; checked is an outlined box with a solid block inside.
- **IntensitySlider** — 16px square handle; the value tumbles.
- **Input** — fully framed field; focus lights the border; optional `unit` end cap; invalid shows a glyph inside the field.
- **TabBar** — underline tabs; give the panel `.clr-tab-enter` on switch. Composes `OverflowRail`, so a tab set too wide for its space stays reachable.
- **OverflowRail** — keeps a row of peer items reachable under width pressure: contained scrolling, directional edge cues, active-item reveal. Behaviour only, no tab or navigation meaning.
- **ScrollRegion** — a vertically scrolling area inside a fixed shell, with optional pinned top and bottom layers. The vertical counterpart of OverflowRail. Behaviour only.
- **TimerDisplay** — selection at rest; steps to urgency over 400ms when low and pulses; split-flap digits.
- **Toast** — chamfered, phosphors in on mount; info / positive / negative.
- **ScanLoader** — scan sweep, boot-staggered rows, current line ends in a cursor. No spinner, no pulse.
- **EmptyState** — a plain message inside the empty list's frame. The action goes in the screen's footer.
- **Button** / **IconButton** — primary, secondary, quiet, critical; loading, icon and icon-only.
- **FormField** — label, helper and error scaffolding for any control, with the aria wiring.
- **ChoiceGroup** — chip-style choice set with fieldset/legend semantics; radio or toggle roles.
- **Dialog** — native `<dialog>` + `showModal()`: platform focus trap, Esc, inert background.
- **AppHeader** — brand left, terse status and actions right.
- **Progress** — always segmented (20 by default), determinate or indeterminate.
- **FocusBrackets** — mount once; draws corner-bracket focus on selectable controls.
- **ClearLogo** + the 75-glyph icon set (`assets/icons.tsx`) — see Iconography.

CSS-only parts in the foundation: `.clr-chamfer` (frames and cards: one closed frame, title inside), `.clr-bleed`, `.clr-glow`, `.clr-btn`, `.clr-chip`, `.clr-atmosphere`, `.clr-rail`, `.clr-scroll-region`, `.clr-list`, `.clr-actions`, `.clr-field`, `.clr-footer`, `.clr-band`, `.clr-cursor`. `.clr-card` adds an optional 8px accent column to a card; the column reads the card's own colours.

---

## Architecture — foundation, motion, skin

The system is three layers, and only the last one knows what product it is.

**Foundation** defines six colour *roles* — `--structure`, `--interaction`, `--selection`, `--urgency`, `--info`, `--base`/`--ink` — and derives every tint, shade and alpha step from them. It names no hue. Shape, spacing, the type scale and all semantic tokens (`--surface-card`, `--border-cta-primary`, `--text-header`…) live here and refer only to roles.

**Motion** is the movement vocabulary: duration tokens, step functions, and every keyframe. Also hue-free.

**Skin** assigns the roles. `css/skin-clear.css` is CLEAR: orange structure, blue interaction, Rajdhani / Oxanium / Space Grotesk.

### Building a second product on these bones

Copy `styles.css`, `css/foundation.css`, `css/motion.css` and `components/` unchanged. Write a new skin next to `skin-clear.css`:

```css
:root {
  --skin-structure: #7DF9A6;
  --skin-interaction: #FF5E5B;
  --structure: var(--skin-structure);
  --interaction: var(--skin-interaction);
  --selection: #99DD39;
  --urgency: #CD1958;
  --base: #171717;
  --ink: #F1F1F1;
  --font-display: 'Chakra Petch', sans-serif;
  --font-data: 'Oxanium', monospace;
  --font-body: 'Space Grotesk', sans-serif;
}
```

That is the whole reskin. Shape, spacing, density, pacing, motion and every component carry over untouched. The **Skins** card in the Design System tab demonstrates it live across the family.

### Roles, not hues

The two primary roles are **structure** and **interaction**, and they are roles rather than colours: structure is orange in CLEAR, purple in Vapour, chartreuse in Signal and grey in Mono. Naming them by hue is the fastest way to write code that only works in one skin — so the Colors cards are organised by role, and each shows what that role resolves to in all four.

### The family

Four skins ship in `css/skins.css`, switched with an attribute on `<html>`:

```html
<html data-skin="vapour">
```

| Skin | Structure | Interaction | Character |
|---|---|---|---|
| **CLEAR** (default) | `#F87823` orange | `#00A9F4` blue | The reference. Needs no attribute. |
| **Vapour** | `#B47DFF` purple | `#00E5C7` teal | Cooler, more synthetic. Ground pushed toward the teal. |
| **Signal** | `#C6FF2E` yellow-green | `#FF2EA6` magenta | Maximum tension, hardest to live with. |
| **Mono** | `#6A6A6A` grey | `#8E8E8E` grey | Enhanced contrast. Five greys, every text pair AAA. |

Two earlier skins were cut rather than kept for the sake of a bigger family: **Sodium** (gold / indigo) landed too close to CLEAR to justify itself, and **Magnesium** (near-white / electric blue) leaned on a green that repeated how green already reads elsewhere in the system. A skin has to earn its slot by being a different idea, not a different hue.

**A skin is seven declarations** — five role hues, a base and an ink. Nothing else. Every ramp (`-100`…`-900`) and alpha step (`-a050`…`-a800`) is derived at `:root` in `foundation.css`, and because the attribute and the derivations both land on `<html>`, they recompute for free. That is also why `data-skin` belongs on `<html>` and nowhere else: on a subtree the hue overrides apply but the derived tokens do not — they were already resolved at the root and are merely inherited. To ship a product on one skin, lift its block into its own file and drop the attribute selector.

### Choosing hues for a new skin

Every surface in the system is its hue at 10–60% alpha over near-black, so **a hue only belongs here if it still reads as itself once darkened**. The failure mode is not brightness, it is naming: chartreuse is only chartreuse when it is light — darkened it becomes olive, which is a different colour with different associations. Violet, emerald, magenta, indigo and CLEAR's own blue keep their identity across the whole lightness range.

**Structure hues are exempt.** They appear at full strength as borders, or at 10% as a whisper, never in the middle where identity breaks down. It is the interaction role, living at 40–60%, that has to survive. This is why Signal can use chartreuse as structure when it would have failed as an interaction colour.

The two roles are therefore **not interchangeable**, and the system does not pretend otherwise: there is no mode that trades them. A hue is chosen for the job it does.

### What `info` is

`--info` is the **neutral information** role: the third background blob, and the informational toast. It is the quietest of the five — it never competes with structure or interaction, and it never signals success or failure.

Between 0.3 and 0.5.1 the info toast read from `--structure` instead, which put an orange frame on an informational message in CLEAR and left `--info` decorative by accident. It now uses its own role in all four skins, with one measured exception: **Mono** puts `--info` at the bottom of its value ladder deliberately, and a border there measures 1.74:1 against the ground — effectively invisible. Mono's info toast falls back to the structure rung (3.66:1) and lets the severity glyph carry the meaning, which is the same trade the whole skin makes.

### Keeping the semantic hues distinct

`--urgency` means **demands attention now** — time pressure *and* failure. Before 0.3 the docs said "time pressure, not danger" while error toasts used the same role; the sentence was too narrow, not the role. Distinguish a nine-second timer from a failed sync with text, icon and placement, never with a second red.

Within a skin, no two roles may be confusable, and that constrains the system colours more than the structure/interaction pair does. Signal's negative leans orange rather than red because a pink-leaning red sits too close to its magenta interaction hue — at a glance the fault text and the primary button would read as the same signal. Across skins the negatives are also kept apart, so a red never means one thing in one product and something else in another.

Check any candidate against the **Alpha Behaviour** card before designing around it. Also worth knowing: lightening a hue lowers its chroma, so "lighter for more contrast" usually backfires — separate by hue instead.

### Authoring a new skin — the checklist

1. **Pick five hues**: structure (warm by convention), interaction (cool), info/neutral, selection/positive, urgency/negative. High saturation, no pastels.
2. **Alpha-test the ones that live translucent**: interaction (40–60%), selection and urgency (60%). Each must keep its hue name once darkened — measure, don't eyeball. Structure and info are exempt (full strength or 10% only).
3. **Keep roles unconfusable within the skin** — the negative may not read as the interaction hue, the positive may not read as either.
4. **Tint the ground**: near-black pushed toward the interaction hue.
5. **Publish the block** in `css/skins.css`: the five hues plus `--base` and `--ink`. Nothing else — every ramp and alpha step derives from those seven at `:root`.
6. **Cut a favicon variant**: copy `assets/favicon.svg` with the new structure hue — favicons can't read tokens.
7. Check it in the Skins card; ship by lifting the block into its own file and dropping the attribute selector.

One caveat: the alpha ladder derives with `rgb(from …)` on the element where it is *declared*. Overriding `--structure` on a subtree rather than `:root` requires re-declaring the ladder there too.

---

---

## Visual Foundations

### Metaphor

Five references overlap in CLEAR's zone: **Star Wars** (sparse green-vector displays), **Alien** (phosphor-on-black MU-TH-UR terminal), **Blade Runner** (amber/blue warmth, Esper grid overlay), **Cyberpunk 2077** (chamfered corners, Rajdhani, signal hierarchy), and **Neon Genesis Evangelion** (angular trapezoidal frames, traffic-light color logic). The unifying principle: **emissive interfaces — light on dark, machine-generated displays built for operators, not consumers.**

### Color

- **Structure role** (`--structure`, orange in CLEAR) = frames, borders, labels. The scaffolding — things that *are*.
- **Interaction role** (`--interaction`, blue in CLEAR) = CTAs, links, tappable icons — things that *act*.
- **Selection** (`--selection`) = selection / confirmation. Role-independent. Always means "you chose this."
- **Urgency** (`--urgency`) = something needs attention now: failures, invalid fields, time running out.
- **Info** (`--info`) = neutral information with nothing at stake.
- **Emissive, not flat.** Almost every colored element uses 10–60% alpha over the dark base — translucent, glassy, light glowing through frosted panels. Composite the tint *over* `--base`, never over another solid colour, or a 10% surface stops reading as 10%.
- **2–3 colors max** in view at once. High saturation, no pastels.
- **A frame's two layers come from one role.** Border at full strength, surface at the 5–15% rung of the *same* role, composited over `--base`. The failure case is specific and easy to hit: a semantic border (`--border-toast-negative`, a passed-in `borderColor`, a selected state) left over a structure surface, giving an orange-tinted panel inside a red, green or blue frame — two layers disagreeing about which role is speaking. Reach for the pair, not two hexes: `--surface-frame-<role>` / `--border-frame-<role>` in CSS (use the default 10% rung; `-quiet` and `-strong` exist but components don't use them), `.clr-chamfer--<role>` as a class, or `role="urgency"` on `ChamferedFrame`. Roles are `structure` · `interaction` · `selection` · `urgency` · `info`. See the **Colors — Frame Roles** card.

Use `--structure-*` / `--interaction-*` in anything new. The old `--color-orange-*` / `--color-blue-*` primitives still resolve, but they name a hue, so they do not follow a reskin.

### Type

Three fonts, three jobs, **no exceptions:**

| Font | Role | Treatment |
|---|---|---|
| **Rajdhani** | Headings, titles, screen names | Bold, uppercase, wide tracking. HUD display header. |
| **Oxanium** | Labels, CTAs, timers, data readouts | Bold, uppercase, widest tracking. Circuit board / digital clock. |
| **Space Grotesk** | Body text, descriptions, form content | Medium weight, sentence case. Clean instrument-panel readout. |

Bold is the default voice. Italics are asides (coaching cues only). See `colors_and_type.css` for the full scale.

#### Casing

A type rule, and universal — it binds every CLEAR consumer regardless of product voice:

- **UPPERCASE** everywhere except body paragraphs and italic asides. Headings, labels, CTAs, timers, tabs, chip text — all uppercase. It's stenciled, not typed.
- **Sentence case** for multi-sentence body copy (descriptions, prose).
- **Italic** only for asides — it marks them as instructional whispers, distinct from the system's voice. In the workout application these are coaching cues; another product will have its own equivalent.

### Spacing

4px base. Named 100 / 200 / 300… mapping to 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64px. No hardcoded pixel values: use `--spacing-*` for space, and the size tokens for fixed sizes (`--control-height` 40px, `--icon-size` 16px, `--border-width` 2px, `--bleed-spread` 2px, `--glow-spread` 6px, `--chamfer-*`).

### Backgrounds

**Dark + animated gradient blobs + grain + scanlines + dark overlay.** Five-layer stack, shipped as `.clr-atmosphere`:

1. Static fallback for reduced-motion users.
2. Drifting blobs coloured from the **role layer** — structure, interaction, info — on 14–22s ease-in-out loops. Because they read from roles, the space a product lives in changes with its skin.
3. Dark overlay at `--atmosphere-dim` flattening the blobs.
4. SVG grain texture, opacity `--atmosphere-grain`.
5. Horizontal scanline overlay — "this is a CRT display, not a window."

Tuned with `--atmosphere-blur`, `--atmosphere-opacity` (40%), `--atmosphere-dim`. **Full intensity on every screen** (`data-atmosphere="full"`, the default). Quiet and Operational stay defined but aren't used by default. Frames keep a solid ground, so text contrast doesn't depend on the atmosphere.

The blob drift is one of the two eased exceptions (the other is the logo boot); see **Motion**.

**Never:** solid flat backgrounds, white backgrounds, photographic imagery, bluish-purple gradients, radial hero gradients.

### Borders, corners, shadows

- **Corner radius: 0.** CLEAR is angular. The one exception is the `ClearLogo` icon container (16px) — do not generalize.
- **Chamfered corners** are the signature shape: the bottom-right corner of most containers is cut at 45°, with the border following the diagonal. Sizes: `--chamfer-sm` 8 / `--chamfer-md` 12 / `--chamfer-lg` 24px, chosen by card height (under ~80px, up to ~140px, above). `--chamfer-xl` 32px is deprecated.

  One implementation: **`.clr-chamfer`**, a CSS class with no wrapper markup and no JS. Border and surface are drawn on the element's two pseudo-elements, under the content. **`<ChamferedFrame>`** is the React wrapper over the same class (role, size, trace and scan as props), so a frame looks the same whichever way it was built. Before 0.9.1 it drew its own SVG; that drifted, so it was retired.

- **Borders: 2px** (`--border-width`), at 90% strength at rest, with a faint 2px bleed (`.clr-bleed`) like phosphor on glass. Never a gradient. Border colour changes with *selection* (→ `--selection`) and with *focus on text fields*. Hover changes the surface, not the border.
- **Glow, not shadow.** No shadows for elevation; CLEAR is a flat display. Light is limited to three things: the 2px bleed on every border, a 6px glow on the primary action only, and the scroll streaks and scrollbar while scrolling. Nothing else glows.

### Motion

**Mechanical, not organic. Stepped, not eased. Linear, not springy.** Motion is built into the components, so they animate correctly by default.

The **Motion Rules** card shows every rule below working live. The **Motion Lab** card fires each effect on real components and lets you tune it.

#### The rules

1. **Interface motion is linear or stepped, never eased.** There are exactly two eased exceptions, and neither is interface: atmospheric drift and the logo boot. A third has to join this list or it doesn't ship.
2. **Motion may reinforce state, but it is never the only cue.** A low timer is also red and labelled; a failure is also a message. Removing every animation must lose no information.
3. **Nothing waits on an animation.** Input is never blocked while something plays, and no delay is added for effect.
4. **A state change interrupts: cut, then interlace.** If new state arrives mid-animation, drop the animation immediately and bring the new state in with `.clr-interlace` (100ms). Never let the old animation finish first, and never reverse it.
5. **One interface loop in view at a time.** A pulse, a looping scan, or a loading indicator counts as a loop; if two would run, keep the one carrying state. One-shot effects are unlimited. Atmosphere is exempt.
6. **Each effect has one meaning.** Don't borrow an effect for a different one:

| Effect | Class | Means |
|---|---|---|
| Glitch / signal loss | `.clr-glitch`, `.clr-signal-loss` | Failure |
| CRT off | `.clr-crt-off` | Switched off |
| Phosphor decay | `.clr-phosphor-out` / `-in` | Leaving / arriving |
| Scan sweep | `.clr-scan` + `.clr-scan-band` | Loading or reading |
| Interlace | `.clr-interlace` | State changed; the display re-syncs |
| Boot stagger | `.clr-boot` | A set arriving in sequence |
| Number tumble | `.clr-tumble` | A value changed (split-flap, not a count-up) |
| Border trace | `.clr-trace` | A frame drawing itself on |
| Materialize, tab enter, route enter | `.clr-materialize`, `.clr-tab-enter`, `.route-enter-*` | Something arriving |

Glitch never clips its content away; if content disappears mid-effect it reads as a bug.

#### Interaction states

| State | Timing | Treatment |
|---|---|---|
| **Hover** | `--dur-hover` (200ms), linear | The surface steps to the `-hover` rung of the same role; the border stays. No scale, no bloom. |
| **Press** (held down) | `--dur-press` (0ms): a hard cut | Surface cuts to the `-pressed` rung, one above hover. No shrink, no movement. |
| **Toggle** (`aria-pressed`, `-selected`, `-checked`) | `--dur-state` (100ms), linear | The control changes to its on-state surface. |
| **Alert** (a frame crossing into an alert state, e.g. timer low) | `--dur-alert` (400ms) in 4 steps | The frame and its text step to the alert colour. Stepped, never eased, so it registers without breaking the rules. |
| **Focus** | Never animated | The ring snaps on. It must be visible the instant focus lands. |
| **Disabled** | n/a | `--surface-disabled`, `--border-disabled`, `--text-disabled`, `cursor: not-allowed`. No opacity hacks. |

A frame's surface is painted as an inset shadow over its ground colour, and its border as a background colour. Both are plain colours, so every state change transitions over the timing above, whatever caused it. Set a frame's colours through `--surface` / `--brd` or a `.clr-chamfer--<role>` class. Don't paint `background` on its pseudo-elements: that replaces the ground.

#### Reduced motion

Decoration is removed. Signals that carry state stay, static: the element keeps its end state and only the movement goes.

| | Under `prefers-reduced-motion: reduce` |
|---|---|
| Scan band, atmosphere drift | Removed |
| Glitch, CRT off, phosphor, interlace, tumble, trace, boot, materialize, route and tab enters | No animation; the end state renders immediately |
| Loading ticks, loading-button scan, indeterminate progress, low-timer pulse | Stay visible, static |
| Scroll-region streaks | Stay at 0.5 while scrolling, no glow, no transition |
| Hover, press and toggle colour changes | Unchanged; colour change isn't motion |

#### Tokens

Components read the semantic durations, never the raw ones. Retiming "everything that enters" then means changing one line.

| Semantic | Maps to | For |
|---|---|---|
| `--dur-hover` | `--dur-base` 200ms | Pointer arrives on a control |
| `--dur-press` | `--dur-instant` 0ms | Held down |
| `--dur-state` | `--dur-cut` 100ms | Toggle, select, check |
| `--dur-alert` | `--dur-slow` 400ms | A frame crossing into an alert state (stepped, `--step-4`) |
| `--dur-enter` | `--dur-base` 200ms | Something arrives |
| `--dur-exit` | `--dur-fast` 150ms | Something leaves |
| `--dur-nav` | `--dur-fast` 150ms | Route or tab change |
| `--dur-drift` | `--dur-atmos` 1000ms | Atmospheric colour settling |

| Raw | Value | Used by |
|---|---|---|
| `--dur-instant` | 0ms | Press |
| `--dur-cut` | 100ms | Interlace, hard cuts |
| `--dur-fast` | 150ms | Route shift, tab enter, tumble |
| `--dur-mode` | 180ms | Entering or leaving a focused mode |
| `--dur-base` | 200ms | Materialize, hover, phosphor decay |
| `--dur-disrupt` | 300ms | Signal loss |
| `--dur-slow` | 400ms | Border trace, boot stagger total |
| `--dur-streak-settle` | 420ms | Scroll-region streak hold after scrolling stops |
| `--dur-boot-reveal` | 700ms | Logo boot |
| `--dur-atmos` | 1000ms | Atmosphere, logo scan |
| `--dur-scan` | 2000ms | Scan sweep |
| `--dur-idle` | 4000ms | Micro-pulse |
| `--step-2` … `--step-24` | `steps(n, end)` | All interface motion; `--ease-mech` is `linear` |
| `--stagger` | 60ms | Delay between boot-sequence rows |

The five atmosphere blobs run at 14, 16, 18, 20 and 22s. These are deliberately unequal literals so the field never visibly repeats; don't tokenise them onto one value.

### Transparency

- Frame surfaces are low-alpha tints of a role composited over `--ground`, which is what lets the atmosphere show through a panel. The system ships **no backdrop blur**. Earlier versions of this README described one, but that was the workout application's own styling and never part of CLEAR.
- `.scanlines-overlay` adds the CRT line grid on top of a surface.

### Layout primitives

Shipped as classes, all using spacing tokens: `.clr-shell` + `.clr-shell__content` (a centred content column), `.clr-stack` / `.clr-stack--tight` / `.clr-row` (gap-spaced groups), `.clr-atmosphere--fixed` (the background layer pinned behind an app), `.clr-rail` (the overflow rail), `.clr-scroll-region` (the contained vertical region), `.clr-shell--fixed` (a shell that owns the viewport at `100dvh`, so only inner regions scroll). The atmosphere and grain/scanline overlays sit behind `z-index: 1` content.

How wide the content column runs, and where it breaks, is a **product** decision — see the product profile.

### Calibrated defaults

These were each picked from a live comparison. Components already apply them; follow them when composing new UI.

- **Surfaces:** one tint strength per role (the 10% default). Emphasis comes from labels and position, never a stronger or quieter surface. The `-quiet` and `-strong` rungs stay defined but components don't use them.
- **Atmosphere:** Full on every screen.
- **Frames:** 2px borders at 90% strength; one corner cut, bottom right, sized by height (8/12/24px; `ChamferedFrame` does this automatically); a solid dark ground under the tint, so the atmosphere shows between frames rather than through them; subtle scanlines in the surface only; the title alone marks a card, with an optional 8px accent column (`.clr-card`) that reads the card's own colours.
- **Bleed:** every border bleeds 2px (`.clr-bleed`). Components add it. **Plain-class frames must be wrapped by hand**; a frame without the wrapper has no bleed. Check for this when generating UI.
- **Glow:** only the primary action, 6px. Scroll motion (streaks and scrollbar) is the one other thing that glows, and only while scrolling.
- **Selected:** 40% selection tint, full-strength selection border, light text, plus a non-colour cue.
- **Controls:** 40px tall, 16px icons, hover steps the surface only, press is a hard cut, disabled is border only, icon-only buttons are always framed.
- **Focus:** mount `<FocusBrackets />` once. Selectable controls get corner brackets; text fields light their own border. Focus is never animated.
- **Fields:** labels above; always fully framed; placeholder at 55%; units via `<Input unit="kg">` (a tinted end cap); errors show urgency border, tint, a glyph inside the field, and the message.
- **Type:** labels uppercase at 0.05em; card headings 20px over 14px body; line height 1.25; secondary text 70% (`--text-secondary`).
- **Layout:** 16px between framed groups; inside a frame, sub-groups use a rule under a heading, never nested frames; lists are one frame with inset rules (`.clr-list`); button rows follow `.clr-actions`.
- **Avoid links inside running text.** Use a distinct call to action.

### Screen layout

Picked by comparison at phone size.

- **Section labels sit above their frame** as plain text. A card's own title still goes inside the card; never a separate header frame above a panel.
- **The primary action is in a pinned footer** (`.clr-footer`). Tabs sit in a full-width band (`.clr-band`).
- **Forms put fields directly on the atmosphere**, with labels above. Fields are already framed, so no panel around them.
- **Loading is per section:** each section keeps its label and frame, and its frame scans with one line ending in a cursor.
- **An empty list keeps its frame** and shows a plain message inside: what's missing and what to do. The action stays in the footer.

### Responsive contract

Two rules, both enforced by the components rather than by consumer CSS:

- **A set of peer destinations stays reachable at any width.** `TabBar` composes `OverflowRail`: when the row cannot fit, it contains itself and scrolls horizontally, shows a hard structural edge rule and a stepped chevron on whichever side has more content, and reveals the active item automatically. It never wraps, never collapses into an overflow menu, and never pushes the page into horizontal scroll. There is no prop to enable this — reachability that can be forgotten is reachability that gets shipped broken. For route navigation, compose `OverflowRail` inside your own `<nav>`; `TabBar` is always a tablist and never switches roles.
- **A text field shrinks to the space it is given.** `Input` releases the intrinsic minimum width that makes form controls refuse to shrink as flex and grid items, so it takes its parent's width instead of forcing the parent to overflow. Height, focus ring, label, validation and affordances are unaffected, and standalone sizing is unchanged. Deciding to stack or reflow at extreme widths belongs to the parent layout. No `min-width: 0` override at the call site, and no reaching into component internals.

- **A region under a pinned layer stays readable.** `ScrollRegion` scrolls vertically inside its parent while its top and bottom layers stay put. Content is clipped at a hard rule and never passes under a layer, so the layers carry no surface and the atmosphere shows through them. There is no fade; CLEAR draws edges sharp. While scrolling, a 1px streak lights up on each edge and settles `--dur-streak-settle` after scrolling stops. Layer heights are measured and published as `--head-h` / `--foot-h`, never guessed, and the region stays hidden until the first real measurement. The region fills its parent and does not claim the viewport; put it in `.clr-shell--fixed` or any parent with a definite height. With a `TabBar` in the head, pass `headRule={false}` so the tab underline is the only rule.

Neither of the first two behaviours is a visual change at comfortable widths. Both are visible in the **Responsive Constraints** card, and `ScrollRegion` in its own card. Both cards measure the behaviour rather than asserting it.

---

## Accessibility

Built into the primitives, not bolted on as examples.

**Focus** is visible on everything. Unclipped controls get an outline; chamfered elements express focus as a **doubled border** in the focus hue, because a chamfer's `clip-path` clips its own outline away. The width change is the point — a colour change alone is not a focus indicator. The ring is a near-white tint of the interaction role: unmistakable on all three skins, still skin-tinted rather than browser blue.

**Selection never relies on colour alone.** Chips and choice groups carry a solid tick as well as the green surface, and expose `aria-pressed` or `aria-checked`.

**Native where native is better.** Checkbox, radio, slider and dialog are real platform elements styled to CLEAR, so form participation, `required`, indeterminate, radio grouping, arrow-key navigation, focus trapping and `Esc` are the browser's job rather than ours. Tabs follow the ARIA tabs pattern with a roving tabindex, Home/End, and `aria-controls` tying each tab to its panel.

**Announcements are scaled to severity.** Only a negative toast is assertive; info and positive are polite status. Loading regions carry `aria-busy` and announce their label, not each log line. The timer is labelled but is *not* a live region — announcing every second makes the rest of a screen unusable.

**Touch targets** stay visually compact and practically large: ≥40px, ≥44px on coarse pointers. Checkbox and radio place the real input over the drawn box at target size, so the enlarged area is the input itself.

**Contrast** is measured continuously, not asserted. The **Contrast Audit** card composites all 88 pairs — 22 text/surface combinations across four skins — from the tokens as they currently resolve, and fails loudly with the failures sorted to the top. It found two AA/AAA failures on its first run that reading the tokens had missed, because both were translucent text over a translucent tint: only rasterizing the real stack surfaces them. If you change a colour token, that card is the thing to check.

Earlier figures were measured, not estimated. Selected controls now sit at 5.2–6.0:1 and timer readouts at 7.4–8.8:1 across all three skins, against 2.2–3.0:1 before 0.3. Compact selected controls use a strong surface with dark text; large readouts invert it. Glow does not count toward contrast.

### The Mono skin — enhanced contrast

**Mono is not "the accessible skin."** Accessibility is the baseline above, and it applies to all four skins equally. Mono is an *enhanced contrast* option — the same class of thing as `prefers-reduced-motion` — for people who need more separation than a colour palette can give. Naming it otherwise would imply the other three are inaccessible, which is untrue and would invite treating the baseline as optional.

It is a **skin**, not a fork — `data-skin="mono"`, through the same five role slots, so geometry, spacing, type, density and motion are untouched: chamfers, the accent bar and stenciled type carry the identity with no hue at all.

Roles cannot separate by hue there, so they separate by **value**, ordered by how much attention each is entitled to:

| Role | Value | Meaning |
|---|---|---|
| `info` | `#3A3A3A` | atmospheric only, never asks for attention |
| `structure` | `#6A6A6A` | frames and containers, recede |
| `interaction` | `#8E8E8E` | what you can touch |
| `selection` | `#D4D4D4` | what you chose |
| `urgency` | `#FFFFFF` | demands attention now |

Every text pair clears **AAA** (7:1 normal, 4.5:1 large) — 7.4 at the tightest, on the selected control. The figures are read back from rasterized pixels rather than computed from the token definitions: `color-mix(in oklab, …)` and an sRGB mix at the same stated percentage differ by enough to cross a threshold, which is exactly how the first version of this table shipped a wrong number. The interaction hex can sit mid-ladder because every `--text-*` token mixes 22% with the white ink, so label colour lands near-white regardless; the hex governs surfaces and borders, not text.

**What value cannot carry, geometry does.** Two cases surfaced when building it, and both were fixed in the shared layer rather than special-cased:

- **Toast severity** was carried by border hue alone, so all three variants collapsed into identical grey frames. Each variant now also carries a distinct glyph — which helps red-green deficiency on Vapour and Signal too, so it shipped for every skin.
- **`--text-tab-inactive` mapped to the disabled neutral** and measured 2.57:1. WCAG exempts disabled controls from contrast; an inactive tab is *available*, so it is not exempt. It is now a pure value dim of the ink.

Where Mono needs more weight than the colour skins, the tightening is **scoped to the mono block** — see `MONO · AAA OVERRIDES` in `css/skins.css`. Mono exists so the colour skins do not have to compromise toward its target, and an early cut of this work got that backwards, lightening CLEAR's helper text and inactive tabs for a threshold only Mono has to meet. The one exception is `--text-negative`, which was a genuine AA failure in CLEAR itself and is fixed globally at the minimum lightening that clears it.

The one place value genuinely cannot do the work is the timer: resting and low states sit 0.02 L apart in surface, since both are a light grey at low alpha over the same ground. Pushing them apart would mean re-mapping the alpha relationships. Instead the low state **doubles its border** — the same mechanism focus uses, for the same reason.

**Where it stops.** Atmospheric and decorative layers are still not held to AAA in the colour skins — forcing them there would sand the character off the system. Mono is the answer for anyone who needs compliance, rather than compromising all four skins toward it.


## Iconography

**Source:** `assets/icons.tsx` — 75 glyphs, compiled into the bundle and rendered live in the **Icon Set** card. 24×24 viewBox, `fill="currentColor"`, so icons inherit text colour and follow the active skin. **No Lucide, no Heroicons, no emoji.**

Groups: Directional (10) · Actions (19) · Access (5) · Time (5) · Status (13) · Content (17) · Mood (6) = 75. The **Icon Set** card is the canonical inventory — if a glyph is not on the card it is invisible to consumers, so add new exports to both the file and the card.

The `Circle*`-prefixed names (`CircleCheck`, `CircleX`, `CircleAlert`) are kept for drop-in compatibility with the lucide names the app imports — **the glyphs themselves are square badges.** Renaming them would break app imports for no visual gain.

Construction rules:

- **Solid fills** — never stroked outlines.
- **Angular / geometric** construction — chamfered tips on directional icons (the signature CLEAR detail).
- **Chunky proportions** — reads like stamped HUD glyphs, not line icons.
- **`fill="currentColor"`** — always. Never hardcoded colors.

Set includes: `ChevronRight/Left/Up/Down`, `ArrowRight/Left`, `Menu`, `X`, `Plus`, `Minus`, `Check`, `RefreshCw`, `Loader2`, `Eye/EyeOff`, `CircleCheck/X/Alert`, `Zap`, `Flame`, `Star`, `Dumbbell`, `Clock`, `Gauge`, `Target`, `Crosshair`, `FileText`, `Pencil`, `User`, `Frown/Meh/Smile/SmilePlus`, `ThumbsDown`, `AlertCircle`, `HelpCircle`, `Maximize2`.

If an icon is needed that isn't in the set, **draw a new one in the CLEAR style** (solid, geometric, chamfered tips where directional). Do **not** reach for Lucide.

### Logos & brand marks

- **Wordmark** — `CLEAR` set in Oxanium Bold, 0.18em tracking, uppercase. Top half white, bottom half 55% opacity, a thin scanline at 57% height **in the structure role's colour, so brand marks recolour with the skin**. Optional boot animation (scanline sweep + clip-reveal). See `assets/ClearLogo.tsx`.
- **Icon mark** — `C` glyph inside a rounded 16px square, same structure-coloured scanline.
- **Favicon** — favicons cannot read CSS custom properties, so one ships per skin: `assets/favicon.svg` (CLEAR), `favicon-vapour.svg`, `favicon-signal.svg`. An app sets the one matching its skin — a Vapour app with an orange favicon is exactly the mismatch this system exists to prevent. A new skin needs a new favicon variant (step 8 of the skin checklist).

Emoji: **never.** Unicode chars used as icons: **never.** Stick to the CLEAR icon set.

---

## Font substitutions

All three CLEAR fonts ship from **Google Fonts** directly — no local `.ttf` files are shipped in the repo:

```
Rajdhani   — 500 / 600 / 700
Oxanium    — 400 / 500 / 600 / 700
Space Grotesk — 400 / 500 / 700
```

`colors_and_type.css` pulls them via `@import url('https://fonts.googleapis.com/css2?family=...')`. If you need fully offline use, download the TTFs from Google Fonts and drop them in `fonts/` — no substitutions were needed.

---

## Design principles — quick reference

- **Composed but alive** — at rest, calm and structured; the atmosphere's slow drift keeps it powered on. Interface elements are still at rest; only urgent states pulse.
- **Lived-in, not pristine** — grain, scanlines, subtle imperfection. Not a showroom demo.
- **Tense under load** — timer-low steps into red over 400ms and pulses (dims to 80%, two hard steps). Urgency is the one state that moves at rest.
- **Never precious** — if decoration competes with usability, decoration loses.

---

## Workout application product profile

**Everything in this section is the workout application's policy, not CLEAR's.** It is preserved here because the README travels with the export and `docs/` does not. Another CLEAR consumer may adopt it, adapt it, or ignore it entirely; none of it constrains Project Control or any future product. Universal rules live above.

### Content — voice and copy

**The workout application speaks like a knowledgeable training partner who doesn't waste words.** Terse. Confident. Gym-literate. Trusts the user. Other CLEAR products will have their own register. (The *casing* rule is a type rule, not a voice rule — it lives under **Type** above and binds every consumer.)

#### Voice principles

- **Imperative, not inviting.** `Initiate Workout` — not "Let's get started!" `Abandon & Start Fresh` — not "Give up?"
- **Factual, not motivational.** `Strength training, simplified.` — not "Your fitness journey starts here."
- **Abbreviated when possible.** `Int. 7` — not "Intensity Level: 7". Labels are stenciled, not sentences.
- **Earned celebration only.** `Nice Work!` — two words, then straight to the debrief. No confetti. No "You're amazing."
- **No guilt, no pressure.** The abandonment modal asks a factual question with two clear options. Rest day is `Mark Rest Day` — not "Take a break, you deserve it."
- **Real voice in placeholders.** `Bad left shoulder from years ago. Overhead press feels sketchy sometimes.` — written like a person talks, not like a form asks.

#### Pronouns & tone

- Direct commands (no subject): `Start Workout`, `Abandon`, `Save`.
- When addressing the user, **you** (never "your journey"). E.g. `How do you feel?`, `You chose this.`
- Never "we" / "us" — the system is not your friend. It's a tool.
- No emoji. Ever.
- No exclamation stacking. One `!` max, and only when earned (`Nice Work!`).

#### Concrete examples (lift these tones)

| Do | Don't |
|---|---|
| `INITIATE WORKOUT` | "Let's go! 💪" |
| `Int. 7` (intensity label) | "Level: Intense" |
| `ABANDON & START FRESH` | "Start over?" |
| `MARK REST DAY` | "Take a break, you've earned it!" |
| `NICE WORK!` | "Incredible! You crushed it! 🔥" |
| `How do you feel?` | "Tell us about your workout!" |




### Cards

The workout application uses the accent card (`.clr-card`): an 8px column against a closed chamfered frame. The column reads the card's own colours, so it needs no tokens of its own.

### Layout policy

- Mobile-first. Breakpoints: `768px` (desktop background), `834px` (tablet type), `1440px` (desktop type).
- Content max-width on desktop ~720–960px, centred. The app stays narrow on wide screens — it's a cockpit, not a dashboard. **This is the workout application's choice**, not a CLEAR constraint; a denser product should set its own.

### Product prohibitions

These are the workout application's product decisions, listed separately from CLEAR's visual rules because they are about what the product does, not how it looks:

- Not patronizing. No gamification badges. No "you can do it."
- Not social. No leaderboards. No sharing.

---

## What CLEAR is **not**

- Bubbly or playful. No rounded containers. No bounce. No friendly blob shapes.
- Pastel or muted. No soft tones.
- Over-animated. Motion is earned.
- Decorative for its own sake. Every visual serves function or atmosphere.
- Smooth and slick. **Mechanical and angular** — edges, not curves. Steps, not slides.

These are visual absolutes and they bind every consumer. Product-behaviour prohibitions — no gamification, no sharing — belong to the products that hold them, and are listed in the product profile above.
