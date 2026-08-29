# ATOMIC.md — the component and token substrate

**Status:** revision 1 · pinned to `clear-design-system@0.5.0`
**Companion to:** `specs/IA.md` (which screens exist and what they do)
**Companion to:** `specs/design/visual-language-rules.md` (why the system looks like this)

IA.md answers *what screens exist and what they can do*. This document answers *what
they are made of* — every token, component, icon and attribute that a screen is
allowed to compose from, and the rules for the few things that are not shipped.

The design system is an **external input**, not something the rebuild authors. It
arrives as a versioned drop. This file is the contract that lets the build agent work
from it without reading 4MB of source on every ticket.

---

## 1. Provenance and version pin

| Field | Value |
|---|---|
| Package | `clear-design-system` |
| Version | `0.5.0` |
| Peer dependency | `react >= 18` |
| Public entry | `index.js` / `index.d.ts` |
| Style entry | `styles.css` — **load exactly this one file** |
| Namespace (UMD) | `CLEARDesignSystem_4ee044` |
| Origin | Authored in Claude Design; extracted from `theycallme-eric/clear-app @ main` |

**The consumer contract** — the surface that only changes with a CHANGELOG note:

1. the public entry (`index.js` / `index.d.ts`)
2. semantic tokens (`--surface-*`, `--border-*`, `--text-*`, `--icon-*`)
3. component props (each `.d.ts`)
4. the `.clr-*` CSS classes
5. the `data-skin` and `data-atmosphere` attributes

Ramp math and internal file layout are **internal**. Do not depend on them or copy
implementation details out of them. The specimen cards, templates, and
`ui_kits/app/` are different: they are **mandatory visual references** named by each
screen contract in `specs/IA.md`. Inspect them to preserve composition, hierarchy,
density, and motion intent, but never import them as production modules or treat
their internal markup as a public API. Production code composes only from the public
entry, declared `.clr-*` classes, tokens, and app-owned domain components.

> **Independence note.** The design system was extracted *from* the old repo, but it is
> now self-contained and self-describing — no repo access required, per its own README.
> Vendoring it into the rebuild carries no dependency on `clear-app`. This is the one
> sanctioned line of descent from the old codebase, and it descends through an artifact,
> not through code.

---

## 2. The three layers

Only the last layer knows what product it is.

```
foundation.css   the bones      shape · spacing · type scale · role slots · semantic tokens
motion.css       the movement   durations · step functions · keyframes
skin-*.css       the identity   five role hues + a base + an ink + three font families
```

Foundation and motion **name no colour**. Every colour in the system is a *role*, and a
skin assigns hues to roles. This is why theme-count-agnostic was the right call in DS-01:
the number of skins is a property of the skin files, not of the token pipeline.

**Design analogy:** the role slots are component properties; the skin file is a variant
that binds every property at once. Swap the variant, the whole instance re-renders — you
never touch the component.

---

## 3. Atomic layer — role slots

A skin is **seven declarations**. Nothing else.

| Slot | Means | CLEAR |
|---|---|---|
| `--structure` | frames, borders, accent bars, labels — things that **are** | `#F87823` orange |
| `--interaction` | CTAs, links, tappables — things that **act** | `#00A9F4` blue |
| `--selection` | "you chose this" | `#99DD39` green |
| `--urgency` | demands attention **now** — time pressure *and* failure | `#CD1958` |
| `--info` | neutral information; the quietest role | `#A368FF` violet |
| `--base` | the ground | `#171717` |
| `--ink` | the light | `#F1F1F1` |

Everything below derives from those seven at `:root`.

### 3.1 Ramps

Six steps, exactly: **100 · 300 · 400 · 500 · 600 · 900**. There is no 200, 700 or 800.
`-500` is the role hue itself; tints climb toward the ink, shades fall toward the base.

CLEAR pins its ramps to hand-tuned brand hexes (they diverge from the derived values by
up to ΔsRGB 37 on the interaction ramp). Those pins are **scoped** to
`[data-skin="clear"], :root:not([data-skin])` — never at bare `:root`, or CLEAR's orange
would leak into every sibling skin.

### 3.2 The alpha ladder

`-a050 · -a100 · -a150 · -a200 · -a300 · -a400 · -a500 · -a600 · -a800`

This is the emissive mechanism, and it is the single most important rule in the system:
**almost every coloured element is its hue at 10–60% alpha over the dark base.** Colour
over dark, never flat fill.

> **Composite over `--base`, never over another solid colour** — a 10% surface over an
> already-tinted surface stops reading as 10%.

### 3.3 Shape

| Token | Value |
|---|---|
| `--radius` | `0px` — CLEAR is angular |
| `--radius-logo` | `16px` — the **one** documented exception. Do not generalize. |
| `--chamfer-sm / md / lg / xl` | `8 / 12 / 24 / 32px` |
| `--border-width` | `2px` — crisp, never blurred, never gradient |
| `--accent-bar-width` / `-lg` | `8px` / `12px` |

### 3.4 Spacing — 4px base

`--spacing-0 25 50 100 200 300 400 500 600 700 800 1000 1200 1300 1400`
→ `0 · 1 · 2 · 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 96 · 128px`

A raw px value in a component is a review-blocking defect.

### 3.5 Type — three roles, three fonts, no exceptions

| Role | CLEAR family | Job | Treatment |
|---|---|---|---|
| `--font-display` | Rajdhani | headings, titles, screen names | bold, uppercase, wide tracking |
| `--font-data` | Oxanium | labels, CTAs, timers, readouts | bold, uppercase, widest tracking |
| `--font-body` | Space Grotesk | body, descriptions, form content | medium, sentence case |

Scales (mobile base; `--heading-*` scale up at 834px and 1440px):

- `--heading-h1…h6` — 32 / 28 / 24 / 22 / 20 / 20px
- `--label-xs…xl` — 12 / 14 / 16 / 20 / 24px
- `--paragraph-xs…xl` — 12 / 14 / 16 / 20 / 24px
- `--tracking-display .02em · -data .05em · -data-wide .08em · -wordmark .18em`
- `--font-weight-regular 400 · -medium 500 · -bold 700`

---

## 4. Semantic tokens — what components actually consume

Components never read a ramp step directly. They read a **semantic** token, which reads
a ramp step, which derives from a role. Retinting "every card border" is one line, not an
audit.

**Design analogy:** ramps are the raw colour styles; semantic tokens are the *named*
styles that get applied to layers. You rename the named style once.

`--surface-*` (23) · `--border-*` (16) · `--text-*` (19) · `--icon-*` (8)

Selected examples, to show the shape of the mapping:

| Semantic token | Resolves to | Used by |
|---|---|---|
| `--surface-card` | `--structure-a100` | card body |
| `--surface-card-accent` | `--structure-a400` | the left accent bar |
| `--surface-cta-primary` | `--interaction-a400` | primary button |
| `--surface-selected` | `--selection-a800` | chosen chip — strong surface, dark text |
| `--surface-timer` / `-low` | `--selection-a150` / `--urgency-a200` | readout — quiet surface, bright text |
| `--border-card` | `--structure-500` | card frame |
| `--text-timer` | 92% selection into ink | timer digits |
| `--text-tab-inactive` | 62% ink into base | inactive tab (**not** the disabled neutral) |
| `--icon-toast-info` | `--info-300` | severity glyph |

Two inversions worth memorising, because they are measured decisions rather than taste:

- **Compact selected controls** take a *strong* surface with *dark* text (5.2–6.0:1).
- **Large readouts** invert it — *quiet* surface, *bright* text (7.4–8.8:1).

Glow never counts toward contrast.

---

## 5. Components — the shipped 18

Every one is `<Name>.jsx` + `<Name>.d.ts`, exported from `index.js`, with motion baked
in. Importing from a component's internal path is a lint error; import from the entry.

| Component | Props | Notes |
|---|---|---|
| **ChamferedFrame** | `cornerSize` sm/md/lg/xl · `surfaceColor` · `borderColor` · `borderWidth` · `hasLeftBorder` · `bottomBorderOnly` · `scan` · `trace` · `glow` | The signature container. SVG double-width stroke + clip. Use when the frame is large or the border must be exact. CSS twin: `.clr-chamfer`. |
| **Button** | `variant` primary/secondary/quiet/critical · `size` sm/md/lg · `loading` · `disabled` · `icon` · `iconOnly` · `buttonRef` | `primary` = the *one* forward action on a screen. `critical` is never the only warning. Hit area ≥40px. |
| **IconButton** | `label` **(required)** · `icon` · + Button props | The required `label` is the accessible name. 40–44px target. |
| **Chip** | `selected` · `disabled` | Toggle. `aria-pressed` + a solid tick — selection is never colour-alone. Interlace-flickers on toggle. |
| **ChoiceGroup** | `legend` · `options` · `value` · `onChange` · `multiple` · `required` · `errorText` · `name` | Real `fieldset`/`legend`. Single-select = full radiogroup pattern (one tab stop, arrows, Home/End). Multi-select = independent toggles, each tabbable. |
| **Checkbox** | `checked` · `defaultChecked` · `indeterminate` · `disabled` · `required` · `onChange(checked, e)` · `label` · `inputRef` | Real `<input type=checkbox>`. Sharp 20px box, ≥40px hit area. |
| **RadioButton** | `checked` · `disabled` · `required` · `onChange(value, e)` · `label` · `name` · `inputRef` | Real `<input type=radio>`. Shared `name` gives native arrow-keys + roving tabindex free. **No circles** — square with a solid inner square. |
| **Input** | `label` · `value` · `onChange(value, e)` · `placeholder` · `multiline` · `rows` · `disabled` · `readOnly` · `required` · `invalid` · `helperText` · `errorText` · `inputRef` | `multiline` renders a textarea — there is no separate Textarea. Label/helper/error aria wiring built in. |
| **FormField** | `label` · `htmlFor` · `required` · `helperText` · `errorText` · `children` (element or render fn) | The same wiring for controls that don't have it built in — Chips, Sliders, ChoiceGroups, third-party. |
| **IntensitySlider** | `value` · `min` · `max` · `step` · `onChange(value, e)` · `label` · `valueText` · `disabled` · `inputRef` | Real `<input type=range>`. Rectangular thumb 12×20px, readout is an associated `<output>`. `valueText` for "7 of 10, hard". |
| **TabBar** / **TabPanel** | `tabs` · `active` · `onChange(index)` · `idBase` ‖ `idBase` · `index` · `active` | ARIA tabs pattern, automatic activation. Panel adds `.clr-tab-enter`. |
| **Dialog** | `open` · `onClose` · `title` · `actions` · `critical` · `dismissOnBackdrop` | Native `<dialog>` + `showModal()` — focus trap, Esc, inertness are the platform's. `dismissOnBackdrop` defaults **false** on purpose. Safe action first in DOM order. **Ships with no entrance motion** — the app wrapper adds it, see §11. |
| **Toast** | `variant` info/positive/negative · `actionLabel` · `onAction` · `onDismiss` | Each variant carries a **glyph**, not just a border hue. Only `negative` is `role="alert"`. |
| **ScanLoader** | `label` · `lines` · `value` · `max` · `status` ok/slow/failed | **There is no spinner in this system.** Polite live region + `aria-busy`. Pass `value`/`max` only when progress is real. |
| **Progress** | `value` · `max` · `label` · `showValue` · `segments` | Stepped fill, never a smooth glide. Omit `value` for indeterminate. `segments` draws tick divisions. |
| **EmptyState** | `title` · `message` · `actionLabel` · `onAction` · `icon` | Factual, never apologetic. One imperative action. |
| **AppHeader** | `meta` · `actions` · `children` | Renders a real `<header>`. `meta` is terse status ("Week 04 · Day 2"), never a sentence. |
| **ClearLogo** | (see `assets/ClearLogo.tsx`) | Wordmark, Oxanium Bold, `.18em`, scanline at 57% in the **structure role** — brand marks recolour with the skin. |

### 5.1 CSS-only parts

For markup that isn't React, and the default for simple frames:

`.clr-chamfer` · `.clr-card` (`__bar` + `__body`) · `.clr-btn` · `.clr-atmosphere`
`.clr-shell` / `.clr-shell__content` · `.clr-stack` / `--tight` / `.clr-row`

`.clr-chamfer` draws border and surface on two pseudo-elements at negative z-index, so
bare text nodes sit above them with no wrapper. Prefer it; reach for `<ChamferedFrame>`
when you need the exact SVG border, the trace-on, or the scan sweep.

---

## 6. Icons — 75 glyphs

`assets/icons.tsx`, exported from the entry. 24×24 viewBox, `fill="currentColor"`, so
every glyph inherits text colour and follows the active skin.

Directional (10) · Actions (19) · Access (5) · Time (5) · Status (13) · Content (17) · Mood (6)

Domain glyphs that matter to CLEAR: `Dumbbell` `WeightPlate` `Pulse` `Streak` `Circuit`
`Ladder` `Superset` `Log` `Gauge` `Target` `Crosshair` `Stopwatch` `Rest` `Flame`
`Trophy` `Frown` `Meh` `Smile` `SmilePlus` `ThumbsUp` `ThumbsDown`.

**No Lucide. No Heroicons. No emoji. No Unicode characters used as icons.** If a glyph is
missing, draw it in the CLEAR style — solid fills, angular construction, chamfered tips on
directional shapes, chunky proportions — and export it from both `icons.tsx` and the Icon
Set card.

The `Circle*` names (`CircleCheck`, `CircleX`, `CircleAlert`) are lucide-compat names on
**square** badges. Do not rename them.

---

## 7. The two global attributes

Both belong on `<html>`.

### 7.1 `data-skin` — which product this is

| Skin | Structure | Interaction | Character |
|---|---|---|---|
| **clear** (default, no attribute) | `#F87823` orange | `#00A9F4` blue | the reference |
| **vapour** | `#B47DFF` purple | `#00E5C7` teal | cooler, synthetic |
| **signal** | `#C6FF2E` chartreuse | `#FF2EA6` magenta | maximum tension |
| **mono** | `#6A6A6A` grey | `#8E8E8E` grey | enhanced contrast, every text pair AAA |

`data-skin` goes on `<html>` **and nowhere else**: the ramps and alpha ladders are derived
at `:root`, so a subtree attribute overrides the hues but leaves every derived token
inherited from the root — the failure is silent and looks like a bug in the component.

**Mono is not "the accessible skin."** Accessibility is the baseline and applies to all
four equally. Mono is a *contrast preference*, the same class of thing as
`prefers-reduced-motion`. Copy must never imply the other three are inaccessible.

`skin.js` ships the persistence contract, so the app does not invent one. Precedence,
highest first: an explicit user choice in `localStorage['clear.skin']` → `prefers-contrast: more` → mono → the app default. Call `initSkin()` from a blocking script in `<head>` so the
first paint is already correct.

### 7.2 `data-atmosphere` — how loud the room is

Set **per screen**. Same five layers in all three; only intensity changes.

| Mode | For | Behaviour |
|---|---|---|
| `full` | boot, brand moments, empty states | the default; atmosphere is part of the message |
| `quiet` | forms, settings, history, long reading | background stops competing with text |
| `operational` | active sessions, timers, logging | glanceability first; scanlines off, ground dimmed hard |

Assignment per screen lives in `specs/IA.md` §4.

---

## 8. Motion

**Mechanical, not organic. Stepped, not eased. Linear, not springy.** Motion is baked into
components — they animate correctly by default.

| Token | Value | For |
|---|---|---|
| `--dur-cut` | 100ms | interlace flicker, hard cuts |
| `--dur-fast` | 150ms | route shift, tab enter, tumble |
| `--dur-mode` | 180ms | entering / leaving a focused mode |
| `--dur-base` | 200ms | materialize, hover, phosphor decay |
| `--dur-slow` | 400ms | border trace, boot stagger total |
| `--dur-atmos` | 1000ms | chamfer colour drift, logo scan — the heartbeat |
| `--dur-idle` | 4000ms | micro-pulse |
| `--step-2…24` | `steps(n, end)` | everything |
| `--ease-mech` | `linear` | everything |
| `--stagger` | 60ms | delay between boot-sequence rows |

Components read the **semantic** durations — `--dur-enter`, `--dur-exit`, `--dur-state`,
`--dur-nav`, `--dur-drift` — not the raw values. Retiming "everything that enters" is one
line.

Vocabulary: `.clr-scan` · `.clr-glitch` / `.clr-signal-loss` · `.clr-boot` ·
`.clr-tumble` (+`--long`) · `.clr-phosphor-out` / `-in` · `.clr-crt-off` · `.clr-interlace`
· `.clr-trace` · `.clr-materialize` · `.clr-tab-enter` · `.pulse-micro` · `.route-enter-*`

**The one documented exception to stepped timing** is the atmosphere blob drift (14–22s
ease-in-out). The background is weather, not interface: it eases, nothing else does.

Everything is disabled under `prefers-reduced-motion`. Motion is atmosphere, never
information.

---

## 9. Accessibility guarantees inherited from the export

These are already true. Do not re-implement them; do not regress them.

- **Focus visible on everything.** Chamfered elements express focus as a *doubled border*
  in the focus hue, because a chamfer's `clip-path` clips its own outline away. The width
  change is the point — a colour change alone is not a focus indicator.
- **Selection never relies on colour alone** — chips and choice groups carry a solid tick.
- **Native where native is better** — checkbox, radio, slider, dialog are real platform
  elements, so form participation, `required`, indeterminate, grouping, arrow keys, focus
  trapping and Esc are the browser's job.
- **Announcements scaled to severity** — only a negative toast is assertive. The timer is
  labelled but is **not** a live region; announce milestones deliberately instead.
- **Touch targets** ≥40px, ≥44px on coarse pointers, via a centred pseudo-element so
  layout does not shift.
- **Contrast is measured, not asserted** — the Contrast Audit card composites all 64 pairs
  (16 text/surface combinations × 4 skins) from the tokens as they currently resolve. If
  you change a colour token, that is the thing to check.

What the export does **not** cover, and the rebuild must specify per screen: heading
outline order, focus management on route change, skip links, form-error focus movement,
and the `prefers-reduced-motion` end-state for any app-composed animation.

---

## 10. Workflow patterns

`docs/patterns.md` in the export defines seven patterns — components, states,
accessibility, atmosphere level, and copy — that screens implement rather than reinvent:

1. **Data-entry form** — `quiet` · empty → filled → validating → invalid → submitting → submitted
2. **Long-running generation** — idle → running → slow → complete → failed
3. **Recoverable failure** — the one case for `role="alert"`
4. **Destructive confirmation** — safe action first, Esc never confirms
5. **Empty and first-run** — `full`; distinguish *never-had-data* from *filtered-to-nothing*
6. **Operational screen** — `operational`; timer is labelled, not live
7. **Boot and re-entry** — brand once, then get out of the way

Where a screen in IA.md matches a pattern, the pattern is the acceptance criteria. This
is why GEN-03's "what happens when it fails" question is already answered: pattern 2 → 3.

---

## 11. Gaps — what CLEAR needs that 0.5.0 does not ship

Everything above is inherited. Everything below is work the rebuild owns. These are the
*only* legitimate new component requirements; anything else means composing what exists.

| Gap | Why it isn't in the export | Owner |
|---|---|---|
| **Card as a React component** | `.clr-card` ships as CSS (bar + body); no JSX export. CLEAR uses cards on every screen. | DS-04 |
| **Select / FilterDropdown** | Not in the export at all. History and library filtering need it. | DS-04 |
| **Toast host / queue** | The export ships a Toast *component*, not a *manager*. "Toasts queue without overlap" is app state. | DS-05 |
| **Dialog entrance motion** | `showModal()` reveals the element with no animation; the vocabulary exists but `Dialog` does not use it. The wrapper composes `.clr-trace` + `.clr-materialize` + a hard-cut backdrop, and `.clr-phosphor-out` on dismiss. | DS-05 |
| **Collapsible workout section** | Not in the export; app-specific disclosure. | DS-04 |
| **Every Layer-4 domain component** | Correctly out of scope for a design system — `SectionRenderer`, `LadderRungs`, `WeekStreakDisplay` etc. compose from the primitives above. | EXE / HIST / HOME trunks |

New parts must be built from the tokens and classes above and must pass the adherence
lint (§13). A new part is a *composition*, not a new visual idea.

---

## 12. Decisions taken

Both open questions were resolved 2026-08-25.

### No bottom sheets

**Every overlay in CLEAR is a `Dialog`.** A sheet and a dialog are the same interaction —
content on top, background inert, Esc closes — differing only in geometry. `Dialog` is built
on native `<dialog>` + `showModal()`, so the focus trap, Esc handling, background inertness
and top-layer stacking are the platform's rather than hand-written; those are exactly the
parts that ship subtly broken when reimplemented.

Only one sheet was ever specified — OVR-01's *why this number* explanation on Review — and
it is modal. CLEAR also bans rounded corners, so a sheet would have lost its most
recognisable signature and arrived as a full-width chamfered panel.

**What the sheet was really offering was arrival**, and that comes from the motion
vocabulary instead: the frame traces itself on, the contents materialize, the backdrop
hard-cuts. A panel powering up, not a drawer sliding. See §11 and DS-05.

Reopen only for a **non-modal** panel — one the user can see and touch the screen around.
That is a genuinely different interaction and would need its own requirement and its own
reason.

### Fonts are self-hosted

The export's font delivery is four nested, render-blocking round trips:

```
styles.css → @import css/skin-clear.css → @import fonts.googleapis.com → fonts.gstatic.com
```

Until all four complete, every uppercase Rajdhani and Oxanium surface renders in `system-ui`
at a different width and the interface reflows once. Self-hosting collapses that to one
request from the app's own origin.

This is **not** an offline argument. CLEAR does not need to work offline.

The mechanism is the export's own instruction — *"a second app replaces THIS FILE ONLY: six
role hexes and three font families"* — so the app owns `src/styles/skin-clear.css` and never
loads the vendored `styles.css` or `css/skin-clear.css`. Nothing is patched and the version
pin holds. Delivery is three Fontsource packages. See DS-01 and DS-02.

---

## 13. The adherence gate

`_adherence.oxlintrc.json` ships with the export and mechanises the standing constraint.
It catches, as lint errors:

- raw hex colours → "use a design-system color token via `var()`"
- raw px values → "use a design-system spacing token via `var()`"
- fonts outside Oxanium / Rajdhani / Space Grotesk
- unknown props on any of the 17 typed components
- out-of-range enum values (`Button` variant/size, `Toast` variant, `ScanLoader` status,
  `TimerDisplay` size)
- imports of component internals instead of the public entry

It ships as `warn`. **The rebuild raises it to `error` in CI.** That is what converts
"a hardcoded hex is a review-blocking defect" from a sentence in a doc into a failing
build — see DS-08.

---

## 14. Non-negotiables

A one-screen summary. Violating any of these is a review-blocking defect.

1. No hardcoded hex, px, or font name. Tokens only.
2. Corner radius is `0`. The logo container's 16px is the only exception.
3. No spinner. `ScanLoader` or `Progress`.
4. No emoji, ever. No Lucide. No Unicode as icons.
5. No rounded containers, bounce, spring, elastic, or crossfade.
6. No solid flat backgrounds, no white, no photography, no radial hero gradients.
7. Colour composites over `--base`, never over another solid surface.
8. Shadows are emissive glow, never depth. CLEAR is a flat HUD.
9. 2–3 colours max in view at once.
10. UPPERCASE everywhere except body prose and italic coaching cues.
11. Imperative and factual. Never "we". Never motivational. One `!` maximum, earned.
12. `data-skin` on `<html>` only.
13. Import from the public entry, never a component's internal path.
14. Selection carries a tick; severity carries a glyph. Colour is never the only cue.

---

## 15. Defects found in 0.5.0

Recorded so they are not mistaken for our own bugs, and so an upgrade can check them.

| # | Where | What |
|---|---|---|
| DS-a | `css/foundation.css` | `--atmosphere-blur`, `--atmosphere-opacity` and `--atmosphere-dim` are declared **twice** in the same `:root` block with different values (`64px/0.30/0.50`, then `80px/0.4/0.45`). The second wins; the README's stated defaults are therefore ambiguous. |
| DS-b | `CHANGELOG.md` | The consumer contract names `data-theme` as a stable attribute. No such attribute exists anywhere in the CSS. |
| DS-c | `README.md` index table | Describes `css/skins.css` as "Vapour, Magnesium, Sodium, Signal". Magnesium and Sodium were cut and Mono added; the body of the same README documents the real family correctly. |

None are blocking. Report upstream on the next design-system pass.
