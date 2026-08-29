# CLEAR Design System

> **CLEAR is a low-tech sci-fi operating system for your body.**
> A workout-tracking app that looks like the terminal you sit down at before a mission.

This design system codifies CLEAR's visual + content language for use in mocks, prototypes, slides, and production code. It is extracted from the CLEAR app codebase and is the source of truth for designing anything that must look and feel like CLEAR.

---

## Products represented

- **CLEAR App** — React 19 + TypeScript + Vite + Supabase SPA. AI-generates personalized workouts, logs execution, tracks streaks. Custom design system (no Tailwind utility aesthetics, no component library). Mobile-first with adaptive tablet/desktop layouts.

## Sources

- **Repo:** `theycallme-eric/clear-app` (branch `main`) — imported into `_source/` for reference.
- **Design philosophy doc:** `docs/design-philosophy.md` (the north-star document; consult when breaking ties).
- **Token source:** `src/index.css` + `docs/frontend/figma-design-tokens.json`.
- **Figma tokens:** `docs/frontend/clear-design-tokens.json` (inside the repo).

Note: users of this design system do not need repo access — this folder is self-contained.

---

## Index

| File / Folder | What's in it |
|---|---|
| `README.md` | This document — philosophy, content rules, visual rules. |
| `SKILL.md` | Claude Code skill entrypoint. |
| `styles.css` | **Entry point.** Load this one file. |
| `css/foundation.css` | The bones — shape, spacing, type scale, role tokens. Names no colour. |
| `css/motion.css` | The movement vocabulary — durations, step functions, keyframes. |
| `css/skin-clear.css` | CLEAR's identity — six hexes, three fonts. **Swap this file to reskin.** |
| `css/skins.css` | The rest of the family — Vapour, Magnesium, Sodium, Signal. |
| `components/` | **The canonical public implementation** (`.jsx` + `.d.ts`). |
| `index.js` / `index.d.ts` | The public entry point. If it is not exported here, it is not public. |
| `docs/patterns.md` | Workflow patterns — states, a11y behaviour, content, what not to do. |
| `_source/` | Read-only reference pasted from the app repo. Never edit, never re-export. |
| `ui_kits/` | A worked example app, not a library surface. |

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

React `>=18` is a peer dependency. `VERSION` is exported from the entry and agrees with `package.json` and the CHANGELOG.

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

- **ChamferedFrame** — the signature container; SVG-stroked borders, trace-on, scan sweep. CSS twin: `.clr-chamfer`.
- **Chip** — selectable chip; green when chosen, interlace-flickers on toggle.
- **Checkbox** / **RadioButton** — sharp squares, no circles; green means chosen.
- **IntensitySlider** — rectangular thumb, structure-tinted track; the value tumbles.
- **Input** — sharp field, 2px structure border, surface brightens on focus; real-voice placeholders.
- **TabBar** — underline tabs; give the panel `.clr-tab-enter` on switch.
- **TimerDisplay** — selection-green at rest, urgency-red when low; split-flap digits.
- **Toast** — chamfered, phosphors in on mount; info / positive / negative.
- **ScanLoader** — scan sweep + boot-staggered rows; there is no spinner in this system.
- **EmptyState** — dimmed frame, factual title, one imperative action.
- **Button** / **IconButton** — primary, secondary, quiet, critical; loading, icon and icon-only.
- **FormField** — label, helper and error scaffolding for any control, with the aria wiring.
- **ChoiceGroup** — chip-style choice set with fieldset/legend semantics; radio or toggle roles.
- **Dialog** — native `<dialog>` + `showModal()`: platform focus trap, Esc, inert background.
- **AppHeader** — brand left, terse status and actions right.
- **Progress** — stepped fill, determinate or indeterminate; optional tick segments.
- **ClearLogo** + the 75-glyph icon set (`assets/icons.tsx`) — see Iconography.

CSS-only parts in the foundation: `.clr-chamfer`, `.clr-card` (accent bar + body), `.clr-btn` (secondary / primary / pressed / disabled), `.clr-atmosphere`.
| `fonts/` | Webfont notes (Google Fonts CDN — Rajdhani, Oxanium, Space Grotesk). |
| `assets/` | Logo SVG, favicon, iconography. |
| `_source/` | Imported reference code from `clear-app` — read-only. |
| `preview/` | HTML specimen cards rendered in the Design System tab. |
| `ui_kits/app/` | Clickable recreation of the CLEAR app. |

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

## Content Fundamentals

**CLEAR speaks like a knowledgeable training partner who doesn't waste words.** Terse. Confident. Gym-literate. Trusts the user.

### Voice principles

- **Imperative, not inviting.** `Initiate Workout` — not "Let's get started!" `Abandon & Start Fresh` — not "Give up?"
- **Factual, not motivational.** `Strength training, simplified.` — not "Your fitness journey starts here."
- **Abbreviated when possible.** `Int. 7` — not "Intensity Level: 7". Labels are stenciled, not sentences.
- **Earned celebration only.** `Nice Work!` — two words, then straight to the debrief. No confetti. No "You're amazing."
- **No guilt, no pressure.** The abandonment modal asks a factual question with two clear options. Rest day is `Mark Rest Day` — not "Take a break, you deserve it."
- **Real voice in placeholders.** `Bad left shoulder from years ago. Overhead press feels sketchy sometimes.` — written like a person talks, not like a form asks.

### Casing

- **UPPERCASE** everywhere except body paragraphs and italic coaching cues. Headings, labels, CTAs, timers, tabs, chip text — all uppercase. It's stenciled, not typed.
- **Sentence case** for multi-sentence body copy (descriptions, prose).
- **Italic** only for coaching cues — it marks them as instructional whispers, distinct from the system's voice.

### Pronouns & tone

- Direct commands (no subject): `Start Workout`, `Abandon`, `Save`.
- When addressing the user, **you** (never "your journey"). E.g. `How do you feel?`, `You chose this.`
- Never "we" / "us" — the system is not your friend. It's a tool.
- No emoji. Ever.
- No exclamation stacking. One `!` max, and only when earned (`Nice Work!`).

### Concrete examples (lift these tones)

| Do | Don't |
|---|---|
| `INITIATE WORKOUT` | "Let's go! 💪" |
| `Int. 7` (intensity label) | "Level: Intense" |
| `ABANDON & START FRESH` | "Start over?" |
| `MARK REST DAY` | "Take a break, you've earned it!" |
| `NICE WORK!` | "Incredible! You crushed it! 🔥" |
| `How do you feel?` | "Tell us about your workout!" |

---

## Visual Foundations

### Metaphor

Five references overlap in CLEAR's zone: **Star Wars** (sparse green-vector displays), **Alien** (phosphor-on-black MU-TH-UR terminal), **Blade Runner** (amber/blue warmth, Esper grid overlay), **Cyberpunk 2077** (chamfered corners, Rajdhani, signal hierarchy), and **Neon Genesis Evangelion** (angular trapezoidal frames, traffic-light color logic). The unifying principle: **emissive interfaces — light on dark, machine-generated displays built for operators, not consumers.**

### Color

- **Structure role** (`--structure`, orange in CLEAR) = frames, borders, accent bars, labels. The scaffolding — things that *are*.
- **Interaction role** (`--interaction`, blue in CLEAR) = CTAs, links, tappable icons — things that *act*.
- **Selection** (`--selection`, `#99DD39`) = selection / confirmation. Role-independent. Always means "you chose this."
- **Urgency** (`--urgency`, `#CD1958`) = urgency, **not danger**. Reserved almost exclusively for timer-low warnings.
- **Emissive, not flat.** Almost every colored element uses 10–60% alpha over the dark base — translucent, glassy, light glowing through frosted panels. Composite the tint *over* `--base`, never over another solid colour, or a 10% surface stops reading as 10%.
- **2–3 colors max** in view at once. High saturation, no pastels.

Use `--structure-*` / `--interaction-*` in anything new. The old `--color-orange-*` / `--color-blue-*` primitives still resolve, but they name a hue, so they do not follow a reskin.

### Type

Three fonts, three jobs, **no exceptions:**

| Font | Role | Treatment |
|---|---|---|
| **Rajdhani** | Headings, titles, screen names | Bold, uppercase, wide tracking. HUD display header. |
| **Oxanium** | Labels, CTAs, timers, data readouts | Bold, uppercase, widest tracking. Circuit board / digital clock. |
| **Space Grotesk** | Body text, descriptions, form content | Medium weight, sentence case. Clean instrument-panel readout. |

Bold is the default voice. Italics are asides (coaching cues only). See `colors_and_type.css` for the full scale.

### Spacing

4px base. Named 100 / 200 / 300… mapping to 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64px. No hardcoded pixel values — always use `--spacing-*` tokens.

### Backgrounds

**Dark + animated gradient blobs + grain + scanlines + dark overlay.** Five-layer stack, shipped as `.clr-atmosphere`:

1. Static fallback for reduced-motion users.
2. Drifting blobs coloured from the **role layer** — structure, interaction, info — on 14–22s ease-in-out loops. Because they read from roles, the space a product lives in changes with its skin.
3. Dark overlay at `--atmosphere-dim` flattening the blobs.
4. SVG grain texture, opacity `0.03`.
5. Horizontal scanline overlay — "this is a CRT display, not a window."

Tuned with three tokens: `--atmosphere-blur`, `--atmosphere-opacity`, `--atmosphere-dim`. Defaults suit a full viewport; small surfaces want a tighter blur and lower opacity, since blobs are diffuse at page scale and intense in a 300px card.

The blob drift is the **one documented exception** to stepped timing. The background is weather, not interface: it eases, nothing else does.

**Never:** solid flat backgrounds, white backgrounds, photographic imagery, bluish-purple gradients, radial hero gradients.

### Borders, corners, shadows

- **Corner radius: 0.** CLEAR is angular. The one exception is the `ClearLogo` icon container (16px) — do not generalize.
- **Chamfered corners** are the signature shape: the bottom-right corner of most containers is cut at 45°, with the border following the diagonal. Sizes: `--chamfer-sm` 8 / `--chamfer-md` 12 / `--chamfer-lg` 24 / `--chamfer-xl` 32px.

  Two implementations, both shipped:

  - **`.clr-chamfer`** — one CSS class, no wrapper markup, no JS. Border and surface are drawn on the element's two pseudo-elements at negative z-index, so content (including bare text nodes) sits above them without needing a wrapper. Use this by default, and anywhere React isn't available.
  - **`<ChamferedFrame>`** — React. SVG double-width stroke clipped to the shape, which gives a perfectly uniform border and mitred corners no CSS approach matches. Use it when the frame is large, when the border must be exact, or when you want the built-in trace-on and scan-sweep.

- **Borders: 2px, crisp** (`--border-width`). Never blurred, never gradient. Border color swaps with state (selected → `--selection`; hover → lighter shade of the interaction role).
- **Shadows** are for emissive glow, not depth. Use `box-shadow` / `text-shadow` with role-colored transparency. No drop-shadows for "elevation" — CLEAR is a flat HUD, not a Material card stack.

### Animation

**Mechanical, not organic. Stepped, not eased. Linear, not springy.** Motion is baked into components — they animate correctly by default rather than waiting for you to remember a class.

Durations and step counts are tokens, taken from the app's real values:

| Token | Value | Used for |
|---|---|---|
| `--dur-cut` | 100ms | interlace flicker, hard cuts |
| `--dur-fast` | 150ms | route shift, tab enter, tumble |
| `--dur-mode` | 180ms | entering / leaving a focused mode |
| `--dur-base` | 200ms | materialize, hover, phosphor decay |
| `--dur-slow` | 400ms | border trace, boot stagger total |
| `--dur-atmos` | 1000ms | chamfer colour drift, logo scan — the heartbeat |
| `--dur-idle` | 4000ms | micro-pulse |
| `--step-2…24` | `steps(n, end)` | everything; `--ease-mech` is `linear` |
| `--stagger` | 60ms | delay between boot-sequence rows |

The vocabulary, each a class and a keyframe:

- **Scan sweep** (`.clr-scan` + a `.clr-scan-band` child) — a band of light travelling down a surface.
Components read the **semantic** durations — `--dur-enter`, `--dur-exit`, `--dur-state`, `--dur-nav`, `--dur-drift` — not the raw values. Same relationship colour has between its ramps and `--surface-*`: retiming "everything that enters" is one line, not an audit of every component.

- **Glitch / signal loss** (`.clr-glitch`, `.clr-signal-loss`) — horizontal displacement off sync, plus a brightness spike. Punctuation, never decoration. It never clips itself away: if content disappears mid-effect it reads as a bug, not a style.
- **Boot stagger** (`.clr-boot` on a container) — children arrive in sequence, each a stepped materialize.
- **Number tumble** (`.clr-tumble`) — a split-flap, not a count-up. Short travel and no fade; a mechanical digit doesn't go transparent on its way past. `.clr-tumble--long` for a longer throw with motion blur.
- **Phosphor decay** (`.clr-phosphor-out` / `-in`) — the signal cuts, the coating keeps glowing, the glow bleeds to grey and goes dark. Brightness rises as opacity falls; that inversion *is* the effect.
- **CRT off** (`.clr-crt-off`) — the harder version: collapses to a bright line, then dark. For something switched off, not something leaving.
- **Interlace flicker** (`.clr-interlace`) — the display re-syncs when state changes. Two frames, not a crossfade.
- **Border trace** (`.clr-trace`) — the frame draws itself on.
- Plus the app's own: `.clr-materialize`, `.clr-tab-enter`, `.pulse-micro`, `.route-enter-*`.

The **Motion Lab** card fires every effect on real components and lets you tune duration and step count live. Everything is disabled under `prefers-reduced-motion` — motion is atmosphere, never information.

| Do | Don't |
|---|---|
| Linear / stepped timing | Bounce, spring, elastic |
| Staggered sequential reveals | Everything appearing at once |
| Hard cuts between states | Slow crossfades |
| `steps(3, end)` or `steps(2, end)` | `ease-in-out` everywhere |
| Brief transitions (150–200ms) | 500ms+ cinematic moves |

### Hover / press / disabled

- **Hover:** border + surface get the `-hover` variant of the same token (usually darker/more-saturated). No scale transforms. No drop-shadow bloom. 200ms transition.
- **Press:** handled by the browser's default `:active` — no explicit shrink / dim.
- **Disabled:** surface → `--surface-disabled` (`rgba(114,114,116,0.3)`), border → `--border-disabled` (neutral-400), text → `--text-disabled`. `cursor: not-allowed`. No opacity hacks.

### Transparency & blur

- Backdrop blur (`backdrop-blur-md`) is used on CTA buttons and overlaid surfaces — lets the animated background bleed through the chamfered panel. Combined with alpha surfaces, it produces the "frosted HUD" feel.
- Scanline overlays sit on top of any blurred surface (`.scanlines-overlay`) so the CRT grid doesn't disappear behind the frost.

### Cards

Cards are **LeftColumn + ChamferedFrame** composed:

- A 8/12px-wide left accent bar (`LeftColumn`) — solid alpha fill, border all sides, `pulse-micro` animation.
- A main body (`ChamferedFrame`) — chamfered bottom-right, no left border (the column handles it), 2px border all other sides.
- Inner padding uses the spacing scale (`px-3 py-2` / `px-4 py-3` / `px-6 py-4`).

Surfaces: low-alpha tint of the structure color. Border: solid structure color. Accent bar: higher-alpha tint. See `_source/Card.tsx` and `_source/ChamferedFrame.tsx`.

### Layout

- Mobile-first. Breakpoints: `768px` (desktop background), `834px` (tablet type), `1440px` (desktop type).
- Content max-width on desktop ~ 720–960px, centered. The app stays narrow on wide screens — it's a cockpit, not a dashboard.
- Shipped as classes: `.clr-shell` + `.clr-shell__content` (the cockpit column), `.clr-stack` / `.clr-stack--tight` / `.clr-row` (spacing-token gaps), `.clr-atmosphere--fixed` (the background layer pinned behind an app).
- Fixed elements: the atmosphere layer and the grain/scanline overlays sit behind `z-index: 1` content.

---

## Accessibility

Built into the primitives, not bolted on as examples.

**Focus** is visible on everything. Unclipped controls get an outline; chamfered elements express focus as a **doubled border** in the focus hue, because a chamfer's `clip-path` clips its own outline away. The width change is the point — a colour change alone is not a focus indicator. The ring is a near-white tint of the interaction role: unmistakable on all three skins, still skin-tinted rather than browser blue.

**Selection never relies on colour alone.** Chips and choice groups carry a solid tick as well as the green surface, and expose `aria-pressed` or `aria-checked`.

**Native where native is better.** Checkbox, radio, slider and dialog are real platform elements styled to CLEAR, so form participation, `required`, indeterminate, radio grouping, arrow-key navigation, focus trapping and `Esc` are the browser's job rather than ours. Tabs follow the ARIA tabs pattern with a roving tabindex, Home/End, and `aria-controls` tying each tab to its panel.

**Announcements are scaled to severity.** Only a negative toast is assertive; info and positive are polite status. Loading regions carry `aria-busy` and announce their label, not each log line. The timer is labelled but is *not* a live region — announcing every second makes the rest of a screen unusable.

**Touch targets** stay visually compact and practically large: ≥40px, ≥44px on coarse pointers. Checkbox and radio place the real input over the drawn box at target size, so the enlarged area is the input itself.

**Contrast** is measured continuously, not asserted. The **Contrast Audit** card composites all 64 pairs — 16 text/surface combinations across four skins — from the tokens as they currently resolve, and fails loudly with the failures sorted to the top. It found two AA/AAA failures on its first run that reading the tokens had missed, because both were translucent text over a translucent tint: only rasterizing the real stack surfaces them. If you change a colour token, that card is the thing to check.

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

## Atmosphere intensity

The background is one system at three intensities, set per **screen** with `data-atmosphere`:

| Mode | For | Behaviour |
|---|---|---|
| `full` | boot, brand moments, empty states, marketing | The default. Atmosphere is part of the message. |
| `quiet` | forms, settings, history, long reading | Background stops competing with text; grain and scanlines nearly vanish. |
| `operational` | active sessions, timers, logging | Glanceability first. Scanlines off, ground dimmed hard, controls unambiguous at arm's length. |

Same layers in all three — only intensity changes, so a quiet screen still reads as CLEAR rather than a different product. A settings page inside a full-atmosphere product should still be quiet.

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

- **Composed but alive** — at rest, calm and structured; under the hood, always powered on (micro-pulse, slow blob drift).
- **Lived-in, not pristine** — grain, scanlines, subtle imperfection. Not a showroom demo.
- **Tense under load** — timer-low flips the atmosphere (red surface, red border, glow intensifies). Environment communicates urgency, not just the widget.
- **Never precious** — if decoration competes with usability, decoration loses.

## What CLEAR is **not**

- Bubbly or playful. No rounded containers. No bounce. No friendly blob shapes.
- Pastel or muted. No soft tones.
- Over-animated. Motion is earned.
- Patronizing. No gamification badges. No "you can do it."
- Social. No leaderboards. No sharing.
- Decorative for its own sake. Every visual serves function or atmosphere.
- Smooth and slick. **Mechanical and angular** — edges, not curves. Steps, not slides.
