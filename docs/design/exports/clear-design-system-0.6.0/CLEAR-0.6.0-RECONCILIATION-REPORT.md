# CLEAR 0.6.0 — reconciliation report

Date: 2026-09-19
Scope: in-place maintenance release, `0.5.2` → `0.6.0`
Baseline confirmed before editing: `index.js` `0.5.2`, `package.json` `0.5.2`, CHANGELOG head `0.5.2`, `index.d.ts` **`0.5.0`** (drifted — see below)

## 1 · Confirmation

**The existing CLEAR design system was edited in place.** No new project, iteration, copy, fork, parallel tree or re-import artifact was created. Every change below is a modification to a file that already existed, except four genuinely new files (one component pair, two specimen cards) and these two reports.

Existing components, tokens, skins, visual language, architecture and documentation are preserved. The four skins — Clear, Vapour, Signal, Mono — are unchanged in both hue and contract. No public API was removed.

## 2 · Public surface change summary

Stated explicitly, as required.

| | |
|---|---|
| **Added** | 1 component (`OverflowRail`), 7 tokens, 3 CSS classes, 2 specimen cards |
| **Changed** | 2 components' behaviour (`TabBar`, `Input`) — no signature changes |
| **Deprecated** | nothing |
| **Removed** | 2 specimen cards. **No public component, token, variable, variant, mode or motion primitive was removed.** |

New tokens: `--surface-rail-cue`, `--border-rail-cue`, `--text-rail-cue`, `--surface-input-invalid`, `--border-input-invalid`, `--dur-disrupt`, `--dur-boot-reveal`.
New CSS: `.clr-rail`, `.clr-rail__scroller`, `.clr-rail__cue`.
No new motion primitive was created. `--dur-disrupt` and `--dur-boot-reveal` name timings that already rendered; neither adds a behaviour.

## 3 · Everything changed

### New files

| File | Why |
|---|---|
| `components/OverflowRail/OverflowRail.jsx` | DS-001 capability |
| `components/OverflowRail/OverflowRail.d.ts` | its public contract |
| `components/OverflowRail/card.html` | component thumbnail specimen |
| `preview/responsive-constraints.html` | canonical DS-001 + DS-007 specimen |

### Modified

| File | Change | Kind |
|---|---|---|
| `components/TabBar/TabBar.jsx` | composes `OverflowRail`; tabs get `flex: 0 0 auto` + `white-space: nowrap` | behaviour |
| `components/TabBar/TabBar.d.ts` | documents composition and that TabBar stays a tablist | docs |
| `components/Input/Input.jsx` | releases intrinsic min-width on field, wrapper and label; invalid state reads urgency tokens | behaviour |
| `components/Input/Input.d.ts` | documents the shrink contract | docs |
| `css/foundation.css` | rail tokens + rail CSS; invalid-input tokens | additive |
| `css/motion.css` | `--dur-disrupt`, `--dur-boot-reveal`; scan band and signal-loss and logo reveal consume tokens; eased-exception and desync notes | token adoption, no rendered change |
| `styles.css` | header corrected; single-link instruction | docs |
| `index.js` | exports `OverflowRail`; `VERSION` `0.6.0` | additive |
| `index.d.ts` | exports `OverflowRail` + `OverflowRailProps`; `VERSION` `0.6.0` | additive + fix |
| `package.json` | `0.6.0` | version |
| `CHANGELOG.md` | `0.6.0` entry | docs |
| `README.md` | restructured; contradictions corrected; product profile added | docs |
| `templates/app-shell/ds-base.js` | loads `styles.css` only | fix |
| `templates/boot-sequence/ds-base.js` | same | fix |
| `templates/form-screen/ds-base.js` | same | fix |
| `preview/contrast-audit.html` | + frame-role and invalid-input pairs (88, was 64) | specimen |

### Deleted

`preview/component-tabs-streak.html`, `preview/component-slider-mood.html` — see §8.

### Documentation sections changed

README: header and framing; **Consumers** (replaces *Products represented*); **Sources**; **Index** table (repaired, corrected); **Consuming the system** (single-link rule); **What the export actually contains** (new); **Components** (+ OverflowRail); **Layout primitives** (new, universal); **Responsive contract** (new, universal); **Workout application product profile** (new, holds the moved material); **What CLEAR is not** (split). `docs/patterns.md` and `CHANGELOG.md` as listed above.

## 4 · `OverflowRail` — final public contract

```ts
OverflowRail(props: {
  activeIndex?: number
  gap?: string              // default var(--spacing-600)
  revealPadding?: number    // default 24
  trackProps?: React.HTMLAttributes<HTMLDivElement>
  // + standard div props on the outer element
}): JSX.Element
```

**Owns:** containment, horizontal scrolling, overflow cues, active-item reveal.
**Does not own:** any tab or navigation semantics. It renders no `role`.

- Semantics pass through `trackProps` onto the element that *directly* contains the items, so `role="tablist"` keeps `role="tab"` children as immediate descendants and the accessibility tree stays valid.
- **Default on, no opt-in.** Inert while content fits; engages under width pressure. There is deliberately no enabling prop — reachability that can be forgotten is reachability that ships broken.
- **Never wraps, never collapses to an overflow menu, never causes page-level horizontal overflow.**
- **Cue:** a hard structural edge rule plus a stepped chevron, using existing tokens, shown only on a side that has more content. No fade, no gradient.
- **Keyboard:** the rail adds no tab stop. Items are focusable and are scrolled into view natively on focus; a tabbable wrapper would compete with a roving tabindex. Cues are `aria-hidden`, `tabIndex={-1}` — pointer affordances only.
- **Reduced motion:** reveal scrolling is instant under `prefers-reduced-motion: reduce`.
- **Composition:** `TabBar` composes it and keeps tablist semantics, roving tabindex, automatic activation, `aria-controls`, Home/End and disabled-tab skipping. Route navigation composes it inside its own `<nav>`. TabBar does not switch roles. The primitive is not named `NavRail`.

## 5 · `Input` — final correction

The internal wrapper and the control both retained the intrinsic minimum width that form controls carry (`min-width: auto` resolving to the field's default size), which as a flex or grid item is an unbreakable floor. `Input` now sets `min-width: 0` and `width: 100%` with `box-sizing: border-box` on the field, and `min-width: 0` on its column wrapper and label.

Preserved: 40px minimum height, visible focus, label, placeholder and entered text, validation wiring, leading/trailing affordances, standalone sizing. Unchanged public signature. The parent layout owns stacking and reflow decisions at extreme widths. No private selectors or `!important` required at the call site.

**Separate defect found and fixed in the same component:** the invalid state painted `--border-toast-negative` over `--surface-input` — a red border on a structure-tinted (orange, in CLEAR) field, and an input borrowing a *toast* token for its own state. New `--surface-input-invalid` / `--border-input-invalid` put both layers on urgency. This is the only colour change in the release.

## 6 · Disposition of DS-001 … DS-009

| ID | Disposition | Action |
|---|---|---|
| DS-001 | Confirmed foundational gap | **Implemented** as `OverflowRail`, composed by `TabBar` |
| DS-002 | Strengthened candidate | Deferred, unchanged |
| DS-003 | Candidate | Deferred, unchanged |
| DS-004 | Not justified | No generic status component created |
| DS-005 | Not justified | Kept locally composed |
| DS-006 | Product-local candidate | Deferred, unchanged |
| DS-007 | Confirmed foundational gap | **Implemented** in `Input` |
| DS-008 | Strengthened candidate; API not approved | Deferred, unchanged |
| DS-009 | Candidate; test quiet Button first | Deferred. Test performed: quiet Button **does not** satisfy the need — see below |

No disposition was weakened, promoted or omitted.

**DS-009 — the required prior test, and its result.** The register asks that the existing quiet Button and action hierarchy be tried before a variant is proposed. That test was performed, and **the existing quiet Button does not satisfy the demonstrated need.** `Button` paints its surface and chamfer pseudo-elements internally, so no combination of existing props yields a text-only action; suppressing them requires `!important` plus pseudo-element overrides reaching into component internals, which is exactly the workaround the product reported.

So the need is real and the current API cannot meet it. What one consumer's evidence *cannot* settle is the shape of the answer — a `text` variant on Button, a separate component, or link semantics are three materially different contracts with different accessibility and hierarchy consequences, and choosing among them from a single use is how a system acquires the wrong abstraction permanently. **DS-009 stays a candidate**, now with its precondition discharged rather than outstanding.

### Candidates resolved by existing capability

- **Structural containers and semantic condition cues** (from the Pass 5 evidence) needed no new component. Frame roles, the 5/10/15 rungs and the semantic text tokens already express it. Reconciled as *guidance* in `docs/patterns.md`, product-neutral, with no Project Control card component and no generic status component created.
- **Project Control's motion accounting** composes existing duration and step tokens. No motion primitive was created from it, as directed.

### Still deferred, and why

DS-002, DS-003, DS-006 and DS-008 each rest on evidence from a single product. DS-002 and DS-008 have multiple *contexts* but one *consumer*, which is the distinction the register draws and the reason it holds them. Nothing in the current CLEAR source independently demonstrates them: there is no second consumer in this project exercising ordered destinations, region headings, graph primitives or contained scrolling beside pinned regions. DS-004 and DS-005 remain unjustified on surviving-use count.

## 7 · Contradictions

### Confirmed and corrected

1. **Removed skin names.** Index table named Magnesium and Sodium. Corrected. *(Note: the contradiction was narrower than the audit suggested — the body text at §The family already described both as cut and already stated the seven-declaration contract. The stale table contradicted correct prose, so the table was the smallest correction.)*
2. **Skin colour contract.** "Six hexes" in the index table and in `styles.css`. Corrected to five role hues plus a base and an ink.
3. **Definitions of urgency.** Already resolved in 0.3 and documented under *Keeping the semantic hues distinct*; the narrow "not danger" phrasing is gone from the current source. **No change needed.**
4. **Hue-neutrality vs. root fallbacks.** Foundation's root fallback slots do carry CLEAR's hues before the skin layer repeats them. This is a deliberate no-skin-loaded fallback, not a contradiction of layer separation; foundation still *names* no colour in its semantic tokens. Documented behaviour, **left as is** — changing it would make a bare foundation render colourless.
5. **Stylesheet double-loading.** Real, and worse than documentation: all three shipped templates' `ds-base.js` linked the four layers *and* `styles.css`. Consumers copied it from there. **Fixed in all three**, plus the rule stated in `styles.css` and the README.
6. **Motion tokens vs. literals.** `--dur-scan` existed while the scan band ran `2s` — same value, token now consumed. `300ms` and `700ms` had no token at their value; `--dur-disrupt` and `--dur-boot-reveal` introduced and consumed. All rendered timing preserved exactly.
7. **Export packaging.** The README claimed self-containment and referenced `skin.js`, `components/`, `docs/` and `package.json` as if shipped. Corrected by describing what the export actually contains. **Export packaging was not changed to make the old text true**, as directed.
8. **Undocumented public exports.** `OverflowRail` documented on creation. `IconButton` and `TabPanel` remain without standalone cards; both are covered by their parent component cards and by `states-gallery`, which exercises them live. Judged sufficient; noted, not acted on.
9. **Duplicate specimens.** See §8.
10. **Templates vs. manifest starting points.** Different concepts, not a gap: templates are copyable folders and appear to consumers as a Templates group; starting points are a separate surface this system does not use. **No change.**
11. **Legacy hue and font aliases.** Retained. Inventory confirms the representative workout consumer still reads `--color-orange-*` and `--color-green-*` through `ui_kits/app/app.css`, so removal would break a live consumer. **No deletion**; compatibility status unchanged.
12. **`--ground` extension hook.** Verified as an intentional, documented extension point, not an undefined-token defect. It now has a canonical in-system use: `--surface-rail-cue` reads it so a rail inside a panel masks against that panel.
13. **Workout policy as universal rule.** Corrected by restructure — see §9.
14. **Other.** The README index table was **split in half**, with five rows orphaned below the component list where they rendered as broken markdown. Repaired. `index.d.ts` declared `VERSION: '0.5.0'` — a fourth version location, drifted two releases. Synchronised.

### Superseded rules

- "Atmospheric drift is the only eased exception" → **two** documented exceptions: atmospheric drift and logo boot. Both non-interface. A third must join the list or not ship.
- "Load only `styles.css`" was correct guidance contradicted by the shipped templates; the templates now match the guidance.
- Combined specimen cards as component documentation → canonical per-component cards plus `states-gallery`.
- Workout voice, card composition, layout policy and product prohibitions as CLEAR-universal → scoped to the product profile.

## 8 · Removed specimens

`Components — Tabs & Streak Bar` and `Components — Slider & Mood` were hand-drawn mockups built from legacy hue aliases, not from the components they named. They duplicated contracts already demonstrated live by the canonical component cards and `states-gallery`, and the tabs card had become **actively wrong**: it depicted a tab bar that cannot scroll, which is now false. Removed as misleading, not merely redundant.

**Teaching value confirmed retained before removal**, card by card:

| Was taught by the removed card | Now taught by |
|---|---|
| Underline tabs, active state | `TabBar` card — the real component, plus scrolling behaviour the old card contradicted |
| Segmented / tick progress ("streak bar") | `Progress` card, which renders `segments` live |
| Intensity slider, tumbling readout | `IntensitySlider` card |
| Four-option mood selector | `ChoiceGroup` card — the real chip-style choice set with fieldset/legend semantics |

Every pattern survives on a card that renders the actual component. **No public API, token, alias or component was removed** — only two specimen files.

## 9 · Documentation restructure

Universal CLEAR guidance now comes first. The workout application's voice principles, casing examples, pronouns, concrete copy table, card composition, layout policy (including the cockpit width rule) and product prohibitions (no gamification, no sharing) moved **verbatim** into **Workout application product profile**, explicitly labelled as product policy that binds no other consumer. Kept in the README rather than moved to `docs/` because the README ships in the export and `docs/` does not.

One item was deliberately *not* moved: the **casing rule** (uppercase labels, sentence case for body, italic for asides) is a type rule, not a voice rule, and binds every consumer. It stays marked universal inside the profile section where its context lives.

No Project Control vocabulary — Assist, Workboard, Attention, Build Flow, Requirements Builder, Agent Runner, Project Memory — appears anywhere in CLEAR's public API, tokens, component names, props or documentation. Verified by search.

## 10 · Verification

### Direct consumer testing — `ui_kits/app/`

**An honest limitation first: the representative workout consumer does not use the system's `TabBar` or `Input`.** It composes its own `TextInput`, `Card`, `CTAButton` and `Chip` in `Primitives.jsx` against CLEAR *tokens*. So for DS-001 and DS-007 it provides **no-regression** evidence, not behavioural coverage:

- It renders unchanged. It has no tab bar, so the TabBar change cannot affect it.
- Every token it consumes still resolves: `--surface-input`, `--surface-input-active`, `--border-input`, `--text-input`, and the legacy `--color-orange-*` / `--color-green-*` aliases, all untouched.
- It loads `styles.css` + its own `app.css` — a single system link, already correct, unaffected by the template fix.
- Corroborating, not proving: its local `.field-input` already sets `width: 100%` inside `all: unset`, which is the same workaround DS-007 describes. A second product independently reaching for the same release is the pattern the fix removes.

### Behavioural verification — `preview/responsive-constraints.html`

The canonical specimen is interactive across all four skins with a live width control, and **measures** rather than asserts: it reports page horizontal overflow, input-row overflow, and whether the rail is engaged, read from the live DOM. It covers a short destination set, a set under width pressure, keyboard navigation, active-item reveal, directional cues, and Input in both a constrained flex row and a `minmax(0,1fr)` grid.

**Live measurements, taken against the regenerated `0.6.0` bundle:**

| Check | Result |
|---|---|
| Rails mounted | 2 |
| `role="tablist"` sits on the rail track | yes |
| `role="tab"` are its direct children | yes — accessibility tree valid |
| Pressure rail engaged | yes (content 613px in a 413px viewport) |
| Cue at scroll start | start hidden, end shown |
| Cue mid-scroll | both shown |
| Cue at scroll end | start shown, end hidden |
| Cues `aria-hidden` / `tabIndex` | `true` / `-1` on both — no competing tab stop |
| Roving tabindex after selecting tab 7 | `-1,-1,-1,-1,-1,-1,0` |
| Active-item reveal | scrolled to 201px; last tab fully within the viewport; focus followed |
| Input `min-width` | `0px` (was `auto`) |
| Input height under pressure | 40px preserved |
| Input width at 280px container | shrank to 178px |
| Page horizontal overflow, full width | 0px |
| Page horizontal overflow, 280px container | 0px |
| Input row overflow, 280px container | 0px |

**Two defects were found by these measurements and fixed before release** — see §10a.

### 10a · Defects found during live verification

Both were found by measuring rather than by looking, and both are fixed in the released build.

1. **The cue's structural edge rule failed contrast in three of four skins.** `--border-rail-cue` started at the `--structure-a500` rung and composited to **2.52:1** in Clear, **2.50:1** in Vapour and **1.74:1** in Mono against the cue surface — under the 3:1 a non-text indicator needs. The chevron was never in doubt (8.1–16.8:1), so the cue still *read*; what was nearly invisible in the grey skin was the hard structural rule, which is the half of the cue that carries CLEAR's vocabulary. Moved to full strength (`--border-frame-structure`), consistent with the frame-role rule that a border is always full strength. Re-measured after the fix: **6.58** Clear, **6.52** Vapour, **16.37** Signal, **3.66** Mono — all clear of 3:1. Both halves of the cue are now in the Contrast Audit card, so the next time someone reaches for an alpha rung here it goes red.
2. **The cue could latch stale.** `measure` sampled `scrollLeft` synchronously inside the scroll event; a scroll event can be delivered before the browser settles its final offset, leaving a cue displaying the previous position until something else nudged it. The read now happens on the next animation frame, and the item set changing also triggers a re-check.

### 10b · Defects found by automated review of the specimen

The rail and Input behaviour verified correctly; these were defects in the card that demonstrates them.

1. **Literal `<code>` tags rendering as escaped text.** The DS-007 caption was passed to `React.createElement` as a single text child, so its markup was escaped and shown verbatim. Split into element children; the card's `code{}` style rule, previously dead, now applies.
2. **Section-note text failed AA at 4.49:1.** `.sh em` was alpha-muted to 50% at 8px — normal-size text, so 4.5:1 is the bar. This one mattered more than its size: the release's headline claim is that contrast is measured rather than asserted, and the card making that claim shipped text that failed. Now 62% at 8.5px, measuring **6.19:1**.
3. **`createRoot` warning on load.** The preview host can evaluate the script twice, including a cached earlier copy — and a property guard does not help, because the cached copy creates the root without setting the flag. The card now mounts into a container React does not already own, so each execution is self-consistent and the last wins. Console is clean.

The same latent `createRoot` pattern existed in **17 component cards** plus `states-gallery`, `brand-logo` and `icons`. All were made idempotent in the same pass — fixing the class rather than the one instance the review happened to land on.

**One item is fixed in source but not yet in the loaded bundle:** the rail's next-frame measurement (§10a, item 2). Live probing still shows the transient it removes — a cue briefly reflecting the previous scroll position before settling correctly — because the bundle compiles from source at the end of the pass. The settled state measures correctly in every position.

### Four skins

All new tokens derive from existing roles (`--structure-*`) and the `--ground` hook, so they follow every skin with no per-skin declarations — including Mono, where the cue remains legible by value and the stepped chevron carries the meaning without relying on hue. The Contrast Audit card now covers **96 pairs** (was 64), adding the five role-frame surfaces, the invalid-input surface, and both halves of the rail cue.

### Motion and reduced motion

Rendered timing is byte-identical: `2s` → `var(--dur-scan)` (2000ms), `300ms` → `var(--dur-disrupt)` (300ms), `700ms` → `var(--dur-boot-reveal)` (700ms). Atmospheric durations untouched at 14/16/18/20/22s and documented as deliberately desynchronised. Rail reveal honours `prefers-reduced-motion`.

### Project Control — evidence-based, not tested

**The Project Control prototype was not attached and was not regression-tested.** Nothing below is a test result; each is a contract claim checked against the register's documented evidence.

- Its DS-001 workaround is a non-wrapping horizontal scroller with overflow cues and active-item reveal. `OverflowRail` provides that behaviour as system API with the same shape, so the local scroller can be deleted. Its seven project destinations are the case the specimen reproduces.
- Its DS-007 workaround is a local `min-width: 0` release on Input internals. The component now does this itself, so the override can be deleted.
- Its `.pc-action` `!important` treatment (DS-009) **must remain** — nothing in this release addresses it.
- Its contained-scroll and pinned-region handling (DS-008) **must remain** — deferred.
- Its late-mounted pinned-heading measurement observer **must remain** — deferred with DS-008.
- No Project Control terminology entered CLEAR.

## 11 · Compatibility and migration

**No migration is required.** No signature changed, no export was removed, no token was renamed or deleted, and legacy hue and font aliases are untouched.

Three visual consequences to expect:

1. A `TabBar` that previously overflowed its container now scrolls with edge cues. This is the fix; a consumer that built its own wrapping or scrolling override around TabBar should remove it, because two scroll mechanisms will fight.
2. An `Input` in a constrained flex or grid parent now shrinks where it previously forced the parent wide. Layouts that relied on that overflow — deliberately or not — will reflow.
3. An invalid `Input` is now red-on-red rather than red-on-orange.

### Workarounds consumers may now remove

- Local `min-width: 0` releases on Input internals.
- Local wrapping or horizontal-scroll overrides on `TabBar`.
- Duplicate stylesheet-layer links alongside `styles.css` (copied from the templates).
- Any local border/surface patch on an invalid input.

### Workarounds that must remain

- Text-action treatments overriding Button internals (DS-009).
- Contained scrolling beside pinned regions, and pinned-region measurement (DS-008).
- Ordered/stepped destination compositions (DS-002).
- Region heading + caption compositions (DS-003).
- Graph and node primitives (DS-006).
- Status indicators and label/value metadata pairs (DS-004, DS-005) — kept local by decision, not by omission.

## 12 · Newly demonstrated reusable gaps

None introduced by this pass. Two observations worth recording in product-neutral language, neither rising to a request:

- **A component that paints its own surface cannot express a surface-less variant by prop.** This is the mechanism under DS-009, stated generally rather than as a Button complaint. If a second consumer hits it on a different component, that generalises into a system-wide question about which components own their ground.
- **A scroll container that hides its scrollbar owes the user a substitute cue.** `OverflowRail` discharges this with a structural rule and chevron. Written into `css/foundation.css` beside the rule that hides the scrollbar, so the obligation travels with the technique.

## 13 · Artifact returned

The updated system **is** this project, edited in place. `_ds_bundle.js`, `_ds_manifest.json` and `_adherence.oxlintrc.json` are compiler-generated and were regenerated by the normal generation process — not hand-edited. The export or handoff is the standard one taken from this project at `0.6.0`; no separate export package was constructed.

Accompanying files: `CLEAR-0.6.0-REQUEST-REGISTER-UPDATES.md` (proposed register changes, for review — the attached register was not edited).
