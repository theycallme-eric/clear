# ATOMIC.md — CLEAR 0.14.3 component and token contract

**Status:** revision 5 · pinned to `clear-design-system@0.14.3`
**Companion to:** `docs/specs/IA.md` (screens and journeys)
**Companion to:** `docs/design/CLEAR-0.14.3-RECONCILIATION-LEDGER.md` (rule sources, owner
dispositions, task mapping and app-owned exceptions)

IA answers what screens exist and what they do. This document records the design-system
contract those screens compose from. The owner-supplied 0.14.3 archive is authoritative when this
document, historical requirements, screenshots, recovery notes, or local fixes disagree.

The design system is an external, versioned input. Product code may compose its public API; it
must not patch the vendored implementation or invent a second visual dialect.

---

## 1. Provenance and version pin

| Field | Value |
| --- | --- |
| Package | `clear-design-system` |
| Version | `0.14.3` |
| Source archive | `CLEAR-Design-System-0.14.3.zip` |
| Archive SHA-256 | `ef4a0f9ae0c41e4acc314a0202f48092d229910a1b16d84261275db85f966682` |
| Source files | 577 |
| Review pages | 43 (22 previews + 21 component cards) |
| Peer dependency | `react >= 18` |
| Public entry | `index.js` / `index.d.ts` |
| Style entry | `styles.css` — loaded exactly once, from `src/main.tsx` |
| Namespace (UMD) | `CLEARDesignSystem_4ee044` |
| Evidence copy | `exports/clear-design-system-0.14.3/` |
| Runtime copy | `src/design-system/` |
| Origin | Owner-supplied versioned archive, selected for recovery 012 on 2026-10-01 |

The evidence and runtime directories are exact copies of the supplied package. Do not edit either
copy by hand. A later design change arrives as another versioned import with a changelog entry and
an explicit migration.

### 1.1 What governs

The owner confirmed that the 0.14.3 components are accurate and that parts of the export's README
are out of date. When two sources disagree, the higher one wins:

1. component implementations and declarations, reached through `index.js` / `index.d.ts`;
2. the shipped CSS — `styles.css` and the `css/` files it loads;
3. the latest entries in `docs/decisions.md` and `CHANGELOG.md` (a later release overrides an
   earlier entry);
4. rendered specimens in `preview/` and `components/*/card.html`;
5. `README.md`, `docs/patterns.md` and `docs/register-status.md` — context only, where they agree
   with 1–4.

Stale prose is recorded in the ledger and never triggers a vendor edit. `_source/` is historical.
`ui_kits/app/` shows current visual composition on older illustrative content: copy its visual
intent through the public surface, never its sample behavior. `templates/` and `preview/` are
visual references, not production imports.

The prose header in the supplied `index.d.ts` still says 0.5.0. It is a non-blocking upstream
documentation defect: `VERSION`, `package.json`, the changelog, the archive name, and this pin all
agree on 0.14.3. The vendor remains byte-identical rather than patching the header locally.

---

## 2. System layers

Only the skin knows which product it is.

```text
foundation.css   shape · spacing · type · emission · semantic role slots · composition classes
motion.css       durations · step functions · stagger · keyframes · the atmosphere's motion
skin-clear.css   CLEAR role hues · base · ink · three font families
skins.css        Vapour · Signal · Mono alternatives
```

Foundation and motion name no product colour. A skin assigns the roles. Product CSS consumes the
semantic layer instead of copying ramp math or component internals.

### 2.1 Role slots

| Slot | Meaning | CLEAR |
| --- | --- | --- |
| `--structure` | frames, dividers, labels — things that are | orange |
| `--interaction` | actions, links, tappable controls | blue |
| `--selection` | chosen or confirmed | green |
| `--urgency` | demands attention now: failure or time pressure | crimson |
| `--info` | neutral information | violet |
| `--base` | ground | near-black |
| `--ink` | light | near-white |

Every semantic surface composites its role tint over `--base`. A frame's border, surface and halo
come from the same role. Use one 10% surface strength per role unless the public component defines
a state treatment.

### 2.2 Shape, ground and emission

- Corners are square except the documented logo container. The only curves are the round,
  line-drawn mood faces (`Frown`, `Meh`, `Smile`, `SmilePlus`), an explicit icon exception.
- **Frame:** a 2px ring border at 90%, one bottom-right cut sized by height — `cornerSize="auto"`
  resolves to `--chamfer-sm` 8px, `--chamfer-md` 12px or `--chamfer-lg` 24px. `sm`, `md`, `lg` and
  `auto` are the only sizes.
- **Ground:** a card's body ground is 70% base (`--card-ground-alpha`), so the atmosphere reads
  faintly through it. Element frames — buttons, chips, fields, streak days — keep a solid ground.
- **Emission:** every stroke and letter emits light through `.clr-bleed`: a tight `--emit-near`
  halo and a wide `--emit-far` halo, while the line itself stays crisp. Components add it
  themselves; a plain-class frame must be wrapped by hand.
- **Glow:** only the primary action adds the extra 6px `--glow-spread`. Scroll streaks glow only
  while scrolling. Nothing else glows.
- **Layers** — the pinned header, footer and tab band — are transparent and full width, drawing only
  the rule on the edge that faces content. The footer draws its top rule only.

### 2.3 Type

| Role | Family | Use |
| --- | --- | --- |
| `--font-display` | Rajdhani | headings, screen titles; bold, uppercase |
| `--font-data` | Oxanium | labels, actions, timers, readouts; bold, uppercase |
| `--font-body` | Space Grotesk | body, descriptions, form content; sentence case |

Body text runs at 1.25 line height (`--paragraph-xs-line-height` 15px, `--paragraph-sm-line-height`
17.5px). Card headings are 20px over 14px body; labels are uppercase at `--tracking-data`;
secondary text is `--text-secondary`. Padding inside a cut frame clears the corner's diagonal.

Use the shipped type, spacing, shape, surface, border, text, icon, duration, and easing tokens.

---

## 3. Containment and page composition

These are system rules, not suggestions for individual screens.

### 3.1 Terms

| Term | Is | Never |
| --- | --- | --- |
| Frame | the chamfered container (`.clr-chamfer`): ring border, one cut, scanlines | — |
| Card | a frame with the mandatory 12px accent bar and its heading inside (`Card`) | nested in another card |
| Element frame | a small frame round one item: button, chip, field, streak day, tag | given a bar or a heading |
| Layer | the pinned header, footer and tab band (`.clr-footer`, `.clr-band`) | a frame |
| Overlay | `Dialog` and `Toast`, above the screen | given an accent bar |

### 3.2 Containment

- **Nothing floats.** Every component, group or form sits inside a card. Only a large screen title
  sits on the atmosphere.
- **Headings go inside their card.** A section label is the card's heading, never a line above it.
  Fields keep their own labels above the field, inside the card.
- **A form is one card.** Its submit action lives in the pinned `.clr-footer`, so it never moves.
- **A card holds content and element frames, never another card.** Sub-groups inside a card use a
  rule under a heading. `TimerDisplay`, `ScanLoader` and `EmptyState` are already cards: never wrap
  them in another.
- Framed groups are 16px apart. A collection is one `.clr-list` frame with inset row rules. Button
  groups use `.clr-actions`, which stacks on a phone with the main action on top and becomes an
  equal-width row, main action last, from 560px.
- Tabs live in a full-width `.clr-band`.
- An empty collection keeps its frame and shows a plain factual message inside it. The action stays
  in the footer.
- Loading is per section: the section keeps its heading and frame, scans, and states what is
  happening on one line ending in `.clr-cursor`.
- Keep only two or three semantic role colours prominent in one view.

### 3.3 Contained vertical scrolling

`ScrollRegion` is the public vertical scrolling contract.

- Put it inside a parent with a definite height, normally `.clr-shell--fixed`.
- It owns the scrolling element. Avoid accidental document scrolling or a second vertical scroll
  owner inside it.
- Optional top and bottom layers are pinned, measured, transparent, and never cover content.
- Content clips at a hard rule. There is no fade at the edge.
- The 2px drawn scrollbar and edge streaks appear only while actively scrolling and settle after.
- Use `headRule={false}` when the pinned head already ends with a TabBar underline.
- Verify safe-area insets, software keyboard resizing, short and tall phones, tablet, and desktop.

`OverflowRail` remains the public horizontal equivalent. Do not wrap TabBar in another horizontal
scroller.

---

## 4. Public components

Import everything from `src/design-system/index`; importing component internals, `_source/`, the
worked app, templates or previews is an adherence failure.

| Component | Contract note |
| --- | --- |
| `Card` | `heading`, `meta`, `role`, `padding`; automatic corner; the 12px bar is always drawn. Compose it through `src/ui/card.tsx` (§4.1) |
| `ChamferedFrame` | Exact SVG frame; prefer `role`; `cornerSize` is `auto`/`sm`/`md`/`lg` |
| `Button`, `IconButton` | One primary forward action per screen; icon-only is always framed and needs an accessible label |
| `TextAction` | Quiet non-destructive action: a real link (`href`) or button with a chevron, 40px target, optional `block` |
| `Chip` | Toggle with `aria-pressed` and a tick |
| `Checkbox`, `RadioButton` | Native controls; square; checked state is a solid inner block |
| `ChoiceGroup` | Fieldset/legend semantics over `Chip`; radio or multi-toggle behavior |
| `Input` | 8px element frame with its own emission; label above; helper/error wiring; `unit` end cap; warning glyph in the field on error; `multiline` grows with content and has no grip |
| `FormField` | The same accessible scaffolding for controls without built-in labels |
| `IntensitySlider` | Native range with an associated output |
| `OverflowRail` | Horizontal reachability, edge cues, and active-item reveal |
| `ScrollRegion` | Fixed-shell vertical scrolling with pinned head/foot and transient feedback |
| `TabBar`, `TabPanel` | ARIA tabs over OverflowRail; place the set in `.clr-band` |
| `Dialog` | Native modal overlay, no accent bar; owns its entrance and exit; safe action first; Escape never confirms |
| `Toast` | Overlay; severity always has a glyph; only negative is assertive; may cover the footer while shown |
| `ScanLoader` | A card that scans; `status="failed"` glitches once; no spinner, skeleton or fake progress |
| `Progress` | 20 lit/unlit segments by default; indeterminate when value is absent |
| `TimerDisplay` | A timer card; steps into urgency over 400ms and pulses at 80% when low |
| `EmptyState` | A plain message card for an empty collection; its action belongs in the footer |
| `AppHeader` | Real header layer with `left`, `meta` and `actions` slots |
| `FocusBrackets` | Mount once near the root; it renders focus decoration out of flow |
| `ClearLogo` and icons | Brand mark and the 75-glyph icon set; no third-party icon dialect |

CSS-only public composition parts include `.clr-chamfer`, `.clr-card`, `.clr-bleed`, `.clr-btn`,
`.clr-chip`, `.clr-field`, `.clr-atmosphere`, `.clr-rail`, `.clr-scroll-region`, `.clr-list`,
`.clr-actions`, `.clr-footer`, `.clr-band`, `.clr-cursor`, `.clr-shell`, and `.clr-shell--fixed`.

### 4.1 App-owned composition

App-owned domain components are appropriate: workout section renderers, set logging, history rows,
streak display, suggestions, and other product semantics compose the public parts. They may not
introduce new geometry, focus, atmosphere, motion or scrolling rules.

There is exactly one app card (`src/ui/card.tsx`), one text-entry path (`Input` / `FormField`, plus
the DS-04b native select in `src/ui/select.tsx`), and one motion vocabulary (`motion.css`). Every
place that deliberately departs from plain composition is a named exception — EXC-01 to EXC-05 in
the ledger — with its own focused test. An adapter exists only for a reproduced integration,
accessibility or runtime need; stale README prose never justifies one.

---

## 5. Global attributes

### 5.1 `data-skin`

`data-skin` belongs on `<html>` only. Four skins ship:

| Skin | Structure | Interaction | Character |
| --- | --- | --- | --- |
| CLEAR | orange | blue | reference |
| Vapour | purple | teal | cooler, synthetic |
| Signal | yellow-green | magenta | maximum tension |
| Mono | grey | grey | enhanced contrast |

`skin.js` owns persistence. Precedence is explicit user choice, then
`prefers-contrast: more`, then the app default. Mono is a preference, not “the accessible skin”;
accessibility is the baseline for all four.

### 5.2 Atmosphere

There is one atmosphere and no modes. `RootLayout` mounts the `.clr-atmosphere` layer once, above
every route. Its blobs are sized from the container's longer side and breathe with transforms only,
never with brightness. Under reduced motion it is static.

`data-atmosphere` selects nothing in the shipped CSS. The app writes the inert value `full` as a
marker of the one atmosphere; no route, overlay or transient screen selects anything else.

---

## 6. Focus and accessibility

- Mount one `FocusBrackets` near the app root.
- Selectable controls—buttons, chips, tabs, checkbox/radio surfaces—receive static corner
  brackets. Text inputs keep their lit border.
- Focus never animates and never decorates a Card merely because a descendant has focus.
- The public Card heading slot is a `span`; the app card renders a real heading at the surrounding
  outline level so every screen keeps a valid heading order.
- Selection is never colour alone; severity always includes text and a glyph.
- Native input, checkbox, radio, slider, and dialog behavior stays native.
- Touch targets are at least 40px and at least 44px for coarse pointers.
- Only urgent failures are assertive live regions. Timers are labelled but not live each second.
- All four skins meet the shipped contrast audit. Product compositions still require measurement
  against their actual surfaces.
- Each screen owns heading order, route-change focus, skip navigation, invalid-submit focus, and
  a meaningful reduced-motion end state.

---

## 7. Motion

Interface motion is stepped or linear: mechanical, not springy. Press is a hard cut. The atmosphere
is the documented eased exception because it is background weather, not interface feedback.

Use only the shipped duration, step, stagger and keyframe vocabulary. App CSS declares no
`@keyframes` of its own. If a moment is not in this table, it does not animate.

| When | Use | Built into |
| --- | --- | --- |
| A screen arrives | `.route-enter-forward` / `-back` / `-up` / `-down` | the router (`src/ui/motion.ts`) |
| Cards or rows arrive on a screen | `.clr-boot`, `--stagger` 40ms apart, once | the arriving container |
| A tab's panel changes | `.clr-tab-enter` | `TabPanel` |
| A dialog opens or closes | four-step backdrop, phosphor in and out | `Dialog` |
| A toast arrives or is dismissed | phosphor in; phosphor decay out | `Toast` |
| Something is loading | scan sweep and one line ending in `.clr-cursor` | `Button loading`, `ScanLoader`, `aria-busy` frames |
| A value changes | `.clr-tumble` | `TimerDisplay`, `IntensitySlider` |
| Something toggles | `.clr-interlace` | `Chip`, `ChoiceGroup` |
| Something fails | `.clr-glitch` once, on the failed thing, with a message | `ScanLoader status="failed"` |
| Time is running out | step to urgency over 400ms, then the 80% pulse | `TimerDisplay` |

- An inline update never replays a screen arrival.
- One interface loop is visible at a time; a stilled loop keeps its static busy state.
- Motion never delays input or a callback, and never carries information by itself.
- Under `prefers-reduced-motion` decoration is removed and state-carrying signals stay static at
  their end state.

---

## 8. Workflow patterns

`exports/clear-design-system-0.14.3/docs/patterns.md` is acceptance guidance for:

1. data-entry forms;
2. long-running generation;
3. recoverable failure;
4. destructive confirmation;
5. empty and first-run states;
6. operational screens;
7. boot and re-entry.

Its "atmosphere level" lines predate the removal of modes: read them as the one atmosphere.

---

## 9. Adherence and verification

`src/design-system/_adherence.oxlintrc.json` is the imported rule set, and `npm run lint:ds` raises
every finding to an error. It guards raw colours and spacing, unsupported fonts, internal imports,
unknown component props, and out-of-range variants. `scripts/adherence/ds-config.mjs` adds the
app-owned rules this migration needs, and inline disable comments are refused:

- the removed vocabulary below, as props, classes or tokens;
- selection of an atmosphere mode other than the one atmosphere;
- imports from `_source/`, the worked app, templates, previews or `exports/`.

`src/test/design-system-097-deprecations.test.ts` scans the whole production consumer — every file
under `src/` except the vendor, the dev gallery and tests — for the same removed vocabulary and for
competing dialects: a second card, a raw text field, local keyframes or non-shipped animation
names, and any route around the public entry or the single stylesheet.

### 9.1 Removed vocabulary

These names are gone from the package. They must not appear in production code.

| Removed | Use instead |
| --- | --- |
| `.clr-load-ticks`, `.pulse-micro` | the scan and `.clr-cursor`; `.clr-pulse-micro` |
| `--tracking-data-wide`, `--surface-overlay` | `--tracking-data`; `--surface-backdrop` |
| `.glow-emissive`, `.text-shadow-glow`, `.glow-box`, `ChamferedFrame glow` | emission through `.clr-bleed`; glow is the primary action's |
| `--chamfer-xl`, `.clr-chamfer--xl`, `cornerSize="xl"` | `sm` / `md` / `lg` / `auto` |
| `.clr-chamfer--open-left`, `--bottom-only`, `hasLeftBorder`, `bottomBorderOnly` | closed frames |
| `--accent-bar-width-lg`, `.clr-card__bar--lg`, the app card's `barWidth` | the one `--accent-bar-width` |
| `--color-{orange,blue,green,red,purple,neutral}-*` | role tokens (`--surface-*`, `--border-*`, `--text-*`) |
| `--font-headings`, `--font-label`, `--font-paragraph` | `--font-display`, `--font-data`, `--font-body` |
| `EmptyState actionLabel` / `onAction` | a footer action |
| `data-atmosphere="quiet"` / `"operational"` | the one atmosphere |

### 9.2 A new design-system import must update

- exact vendor/evidence identity evidence;
- package/API/version tests;
- gallery inventory tests;
- this document, IA visual sections and the reconciliation ledger;
- rendered narrow and wide browser evidence.

Passing lint proves vocabulary compliance, not visual fidelity. Route work still requires rendered
comparison against the 0.14.3 package (`docs/design/evidence-0143/`).

---

## 10. Non-negotiables

1. The 0.14.3 components and CSS are the final ruling; stale prose is context.
2. No local edits inside either vendored copy.
3. No hardcoded product colours, fonts, or replacement design geometry.
4. No rounded containers, bounce, spring, elastic, or generic consumer-app polish.
5. No spinner, emoji, third-party icon set, photography, or flat white surface.
6. Every card carries its bar and heading inside; cards never nest; overlays carry no bar.
7. Every stroke emits through the shipped halo; only the primary action glows.
8. One atmosphere on every screen.
9. `FocusBrackets` and `ScrollRegion` are the shared contracts; do not create local substitutes.
10. Import from the public entry and preserve native semantics.
11. Copy is factual and imperative, never apologetic or motivational.
12. Any exception is recorded in the ledger with evidence and a focused test instead of becoming an
    invisible local convention.

---

## 11. Historical state

The following are historical evidence. They do not override this contract.

- the 0.9.7, 0.6.0 and 0.5.0 exports under `docs/design/exports/`;
- the 0.9.7 reconciliation and VIBE audits under `docs/design/`;
- `docs/specs/design/visual-language-rules.md` and `docs/specs/design/chamfered-component.md`;
- the export's `_source/`;
- frozen requirements and earlier recovery notes.

Earlier contracts taught forms placed directly on the atmosphere, a solid card ground, a 2px bleed,
an optional or wide accent bar, and selectable atmosphere modes. 0.14.3 retired all of them. The
full mapping is in `docs/design/CLEAR-0.14.3-RECONCILIATION-LEDGER.md`.

Extracting the system into a standalone repository and adding Storybook remain deferred in #239.
