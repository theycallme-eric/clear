# ATOMIC.md — CLEAR 0.14.3 component and token contract

**Status:** revision 4 · pinned to `clear-design-system@0.14.3`
**Companion to:** `docs/specs/IA.md` (screens and journeys)
**Companion to:** `docs/specs/design/visual-language-rules.md` (visual rationale)

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
| Style entry | `styles.css` — load exactly this file |
| Namespace (UMD) | `CLEARDesignSystem_4ee044` |
| Evidence copy | `exports/clear-design-system-0.14.3/` |
| Runtime copy | `src/design-system/` |
| Origin | Owner-supplied versioned archive, selected for recovery 012 |

The evidence and runtime directories are exact copies of the supplied package. Do not edit either
copy by hand. A later design change arrives as another versioned import with a changelog entry and
an explicit migration.

The consumer contract is:

1. `index.js` and `index.d.ts`;
2. semantic tokens (`--surface-*`, `--border-*`, `--text-*`, `--icon-*`);
3. each public component's typed props;
4. documented `.clr-*` classes;
5. `data-skin` and `data-atmosphere` on `<html>`;
6. the workflow and composition rules in `README.md` and `docs/patterns.md`.

`_source/` is historical input that predates the calibrated rules. Never copy patterns from it.
`preview/`, `templates/`, and `ui_kits/app/` are mandatory visual references, not production
imports. Product code imports only from the public entry.

The prose header in the supplied `index.d.ts` still says 0.5.0. It is a non-blocking upstream
documentation defect: `VERSION`, `package.json`, the changelog, the archive name, and this pin all
agree on 0.14.3. The vendor remains byte-identical rather than patching the header locally.

---

## 2. System layers

Only the skin knows which product it is.

```text
foundation.css   shape · spacing · type · semantic role slots · composition classes
motion.css       durations · step functions · keyframes
skin-clear.css   CLEAR role hues · base · ink · three font families
skins.css        Vapour · Signal · Mono alternatives
```

Foundation and motion name no product colour. A skin assigns the roles. Product CSS consumes the
semantic layer instead of copying ramp math or component internals.

### 2.1 Role slots

| Slot | Meaning | CLEAR |
| --- | --- | --- |
| `--structure` | frames, dividers, labels — things that are | `#F87823` orange |
| `--interaction` | actions, links, tappable controls | `#00A9F4` blue |
| `--selection` | chosen or confirmed | `#99DD39` green |
| `--urgency` | failure or attention needed now | `#CD1958` |
| `--info` | neutral information | `#A368FF` violet |
| `--base` | ground | `#171717` |
| `--ink` | light | `#F1F1F1` |

Every semantic surface composites its role tint over `--base`. Do not put a translucent role
surface over another coloured surface. A frame's border and surface come from the same role.

### 2.2 Shape and frame construction

- Corners are square except for the documented logo container.
- Borders are 2px, crisp, and 90% opaque.
- Borders bleed 2px. Only the primary action receives the 6px glow.
- A frame has one bottom-right cut. `cornerSize="auto"` is the default and resolves to 8, 12, or
  24px from the rendered height.
- `xl` and `--chamfer-xl` are deprecated. `hasLeftBorder={false}` and open-left construction exist
  only for compatibility and are not used in new compositions.
- A solid dark ground sits under the frame tint. Atmosphere appears between frames, never through
  them.
- Use one 10% surface strength per role unless the public component defines a state treatment.
- A Card is one closed frame with its title inside. Its optional accent is an attached 8px column
  that reads the Card's own role colours.

### 2.3 Type

| Role | Family | Use |
| --- | --- | --- |
| `--font-display` | Rajdhani | headings, screen titles; bold, uppercase |
| `--font-data` | Oxanium | labels, actions, timers, readouts; bold, uppercase |
| `--font-body` | Space Grotesk | body, descriptions, form content; sentence case |

Use the shipped type, spacing, shape, surface, border, text, icon, duration, and easing tokens.
Removed aliases are not part of the contract: `--tracking-data-wide`, `--surface-overlay`,
`.pulse-micro`, and `.clr-load-ticks` must not be reintroduced. The supported pulse class is
`.clr-pulse-micro`.

---

## 3. Page composition

These are system rules, not suggestions for individual screens:

- Full atmosphere is used on every screen. Quiet and Operational remain defined for compatibility
  but are not selected by default.
- Fields sit directly on atmosphere. Do not place a form in a generic enclosing Card.
- The primary phone action lives in a pinned `.clr-footer`.
- Tabs live in a full-width `.clr-band`.
- A collection uses one `.clr-list` frame with inset row rules, not a stack of independent frames.
- Button groups use `.clr-actions`.
- An empty collection keeps its list frame, places a plain factual message inside, and keeps the
  action in the footer.
- `Progress` uses 20 segments by default.
- Checkbox and radio selection use a solid inner block. Chip retains its tick.
- Keep only two or three semantic role colours prominent in one view.

### 3.1 Contained vertical scrolling

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

Import everything from `src/design-system/index`; importing component internals is an adherence
failure.

| Component | Contract note |
| --- | --- |
| `ChamferedFrame` | Exact SVG frame; prefer `role`; `cornerSize="auto"`; glow ignored/deprecated |
| `Button`, `IconButton` | One primary forward action; icon-only requires an accessible label |
| `Chip` | Toggle with `aria-pressed` and a tick |
| `Checkbox`, `RadioButton` | Native controls; square; checked state is a solid inner block |
| `ChoiceGroup` | Fieldset/legend semantics; radio or multi-toggle behavior |
| `Input` | Label/helper/error wiring, constrained sizing, multiline, optional `unit` end cap |
| `FormField` | The same accessible scaffolding for controls without built-in labels |
| `IntensitySlider` | Native range with an associated output |
| `OverflowRail` | Horizontal reachability, edge cues, and active-item reveal |
| `ScrollRegion` | Fixed-shell vertical scrolling with pinned head/foot and transient feedback |
| `TabBar`, `TabPanel` | ARIA tabs over OverflowRail; place the set in `.clr-band` |
| `Dialog` | Native modal dialog; safe action first; Escape never confirms |
| `Toast` | Severity always includes a glyph; only negative is assertive |
| `ScanLoader` | Scan-based loading; no spinner, skeleton pulse, or fake progress |
| `Progress` | Segmented; 20 segments by default; indeterminate when value is absent |
| `TimerDisplay` | Steps into urgency over 400ms and dims to 80% while pulsing |
| `EmptyState` | Plain message for a containing list frame; action belongs in the footer |
| `AppHeader` | Real header; terse status and actions |
| `FocusBrackets` | Mount once near the root; it renders focus decoration out of flow |
| `ClearLogo` and icons | Brand mark and 75-glyph icon set; no third-party icon dialect |

CSS-only public composition parts include `.clr-chamfer`, `.clr-card`, `.clr-btn`, `.clr-chip`,
`.clr-atmosphere`, `.clr-rail`, `.clr-scroll-region`, `.clr-list`, `.clr-actions`, `.clr-field`,
`.clr-footer`, `.clr-band`, `.clr-cursor`, `.clr-shell`, and `.clr-shell--fixed`.

App-owned domain components are still appropriate: workout section renderers, set logging,
history rows, streak display, suggestions, and other product semantics compose the public parts.
They may not introduce new geometry, focus, atmosphere, or scrolling rules.

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

### 5.2 `data-atmosphere`

Set `data-atmosphere="full"` for every production screen. The five atmospheric layers remain
visible around solid-ground frames. The app does not choose atmosphere strength per route and
does not add local compensation to make an intentionally dimmed mode louder.

---

## 6. Focus and accessibility

- Mount one `FocusBrackets` near the app root.
- Selectable controls—buttons, chips, tabs, checkbox/radio surfaces—receive static corner
  brackets. Text inputs keep their lit border.
- Focus never animates and never decorates a Card merely because a descendant has focus.
- Do not use the superseded local `.clr-chamfer--focus-owner` convention.
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

Interface motion is stepped or linear: mechanical, not springy. Press is a hard cut. Atmosphere
blob drift is the documented eased exception because it is background weather, not interface
feedback.

- Use only the shipped duration, step, and semantic motion tokens.
- Loading scans the section that is waiting and states what is happening. Never add a spinner,
  skeleton pulse, or delay so animation can be admired.
- Timer low state steps into urgency over 400ms, dims to 80%, and pairs colour with text/state.
- Focus is static.
- Motion is disabled or resolves immediately under `prefers-reduced-motion`.
- Motion never carries information by itself.

---

## 8. Workflow patterns

`docs/design/exports/clear-design-system-0.9.7/docs/patterns.md` is acceptance guidance for:

1. data-entry forms;
2. long-running generation;
3. recoverable failure;
4. destructive confirmation;
5. empty and first-run states;
6. operational screens;
7. boot and re-entry.

All seven use Full atmosphere. Forms place fields directly on it; primary actions live in the
pinned footer; loading is per section; empty-list actions remain outside the list frame.

---

## 9. Adherence and verification

`src/design-system/_adherence.oxlintrc.json` is the imported rule set. The application raises its
findings to errors in CI. It guards raw colours and spacing, unsupported fonts, internal imports,
unknown component props, and out-of-range variants.

The gallery serves the exact 0.9.7 preview and component-card inventory plus app-owned
compositions. A new design-system import must update:

- exact vendor/evidence identity evidence;
- package/API/version tests;
- gallery inventory tests;
- active ATOMIC and IA guidance;
- this repository's design changelog;
- rendered narrow and wide browser evidence.

Passing lint proves vocabulary compliance, not visual fidelity. Route work still requires
rendered comparison against the 0.9.7 package.

---

## 10. Non-negotiables

1. The 0.9.7 artifact is the final ruling for this recovery pass.
2. No local edits inside either vendored copy.
3. No hardcoded product colours, fonts, or replacement design geometry.
4. No rounded containers, bounce, spring, elastic, or generic consumer-app polish.
5. No spinner, emoji, third-party icon set, photography, or flat white surface.
6. Frames are closed, solid-ground, one-corner-cut surfaces; only the primary action glows.
7. Full atmosphere appears on every screen and between frames.
8. Forms sit directly on atmosphere; lists, tabs, action groups, and footers use the public
   composition classes.
9. `FocusBrackets` and `ScrollRegion` are the shared contracts; do not create local substitutes.
10. Import from the public entry and preserve native semantics.
11. Copy is factual and imperative, never apologetic or motivational.
12. Any exception is recorded with evidence and owner approval instead of becoming an invisible
    local convention.

---

## 11. Historical state

The 0.5.0 and 0.6.0 exports, frozen requirements, and earlier audit notes remain available as
historical evidence. They do not override this contract. The full comparison and migration order
are recorded in `docs/design/CLEAR-0.9.7-RECONCILIATION-AUDIT.md`.

Extracting the system into a standalone repository and adding Storybook remain deferred in #239.
Those may improve future release governance, but they are not prerequisites for bringing CLEAR
into conformance with the supplied 0.9.7 release.
