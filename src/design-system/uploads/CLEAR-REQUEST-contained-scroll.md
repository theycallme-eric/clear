# CLEAR request — contained vertical scroll region with a pinned layer

Paste this into the CLEAR Design System project.

---

Add a **contained scroll region** capability to CLEAR: a vertically scrolling content area inside a
fixed shell, with an optional layer pinned over its top edge (and optionally its bottom edge), where
content dissolves at the edges like the edge of a CRT display rather than sliding under a panel.

This is proven in a consuming product. Record it at system level so any consumer gets the exact
behaviour below. Name and shape the public API in CLEAR's own terms — no consumer vocabulary
(no "project", "assist", "workboard" etc.). Behaviour only; it carries no navigation or
product meaning.

## Why it is a system capability

- It is reusable wherever a fixed shell holds a scrolling region: a main content column, a side
  panel, a drawer, a dialog body.
- It shipped with eleven distinct defects before it was right (listed below). Every consumer that
  rebuilds it by hand will rediscover them.
- It is the vertical sibling of `OverflowRail`: that keeps a horizontal row reachable; this keeps a
  vertical region readable under a pinned layer.

## Exact behaviour (do not reinterpret — this is accepted as correct)

**Structure**
- The shell owns the viewport (`height: 100vh; overflow: hidden`). Only the region scrolls;
  neighbouring rails and panels never scroll with it.
- The region is a `position: relative` wrapper containing an absolutely positioned scroller
  (`inset: 0; overflow-y: auto; overflow-x: hidden`) and, as siblings **over** it, the pinned
  layer(s). The pinned layer is never a child of the scroller — a sticky child would be erased by
  the scroller's mask.
- `min-width: 0` on every descendant of the scroller, so overflowing children shrink instead of
  opening a sideways scroll under a neighbouring panel.

**Measurement**
- The pinned layer's height is **measured**, never guessed, and published as a custom property on
  the wrapper (`--head-h`; `--foot-h` for a bottom layer). Re-measure on resize, on font load, when
  the layer mounts, and on update.
- The scroller stays `visibility: hidden` until the first real measurement, then the wrapper gets a
  `data-measured` attribute. **No fallback length** — any guess collides content with the pinned
  layer on first paint.
- A layer that is mounted but measures `0` means layout has not resolved. Do not publish the zero:
  retry on a timer with a short backoff (16ms rising to 200ms, bounded at ~30 tries). Once a region
  has measured, **never remove `data-measured`** — a later zero must not re-hide painted content.

**The dissolve**
- A mask on the scroller, ramping from transparent to opaque over **26px** below the top layer, and
  back to transparent over 26px above the bottom edge (or above the bottom layer):

  ```css
  mask-image: linear-gradient(to bottom,
    transparent 0, transparent var(--head-h), #000 calc(var(--head-h) + 26px),
    #000 calc(100% - var(--foot-h, 0px) - 26px), transparent calc(100% - var(--foot-h, 0px)));
  ```
- The ramp sits **below** the pinned layer, not ending at its edge.
- Content inset equals the ramp's end so nothing is faded at rest:
  `padding-top: calc(var(--head-h) + 26px)` and
  `padding-bottom: calc(var(--foot-h, 0px) + 26px)`, plus a 26px trailing spacer.

**The pinned layer**
- Carries **no surface**. The mask has already removed the content behind it; a fill breaks the
  atmosphere's continuity. Only borders, streaks and content draw over the gradient.
- Ends in one horizontal rule: the structure role at `--border-width`, `--structure-a300` (or a tab
  rail's own underline when the layer ends in one).
- Capped: `max-height: 45%; overflow-y: auto`, so a layer that grows at narrow widths scrolls
  internally instead of squeezing the region. Its title row has `min-height: 40px`, centred, with the
  title `flex: 1 1 auto; min-width: 0` so it never loses space to its action (`flex: 0 0 auto`).

**The streak**
- A 1px line at each edge (top at `--head-h`, bottom at the region's bottom / above `--foot-h`), in
  the region frame's **own** structure role at full strength (`--structure-500`), inset by
  `--border-width`.
- Invisible at rest (`opacity: 0`); `0.7` with a 7px role-coloured glow **while scrolling**, removed
  ~420ms after the last scroll event. Transition in `steps(3, end)` at `--dur-base`.
- Sits **below** the pinned layer in z-order, so an active tab indicator keeps priority over the
  streak's glow.
- Reduced motion: streak at 0.5, no glow, no transition.

## The traps — each shipped as a defect once

| Trap | What goes wrong |
|---|---|
| A fallback length for the layer height | Async content and wrapping change the height; any guess collides on first paint. |
| Publishing a zero, or un-revealing on one | A mounted-but-zero layer is unresolved layout. Retry; never re-hide once measured. |
| Ramp ending at the layer's edge | The fade paints underneath the layer and only the bottom edge reads. |
| A sticky header inside the scroller | The mask erases it with the content. |
| Content inset less than the ramp | First and last rows look broken at rest. |
| Streak above the layer in z-order | Its glow washes out the active indicator. |
| A surface on the pinned layer | Breaks atmosphere continuity; the mask already did the work. |
| Letting the layer's rows wrap freely | The layer grows as the region shrinks. Cap it. |
| Title yielding to its action | At narrow widths the title collapses to nothing. Title grows, action is fixed. |
| `overflow-y: auto` alone | `overflow-x` computes to `auto`; children scroll sideways under a neighbour. |
| Relying on ResizeObserver / rAF alone | In some hosts neither fires reliably on mount; a timer retry is the one dependable trigger. |

## Deliverable

- A component (e.g. a region primitive composing scroller + pinned slots) **and** a CSS twin, in
  line with how `ChamferedFrame` / `.clr-chamfer` and `OverflowRail` / `.clr-rail` both ship.
- Top and bottom pinned slots, both optional; with no top slot the ramp starts at the region edge.
- Tokens for the ramp length (26px) and streak timing rather than literals.
- Works in all four skins by reading roles only; no hue named.
- A specimen card that **measures** it — first-row inset at rest, layer height versus published
  variable, no horizontal overflow, streak z-order — rather than asserting it, like the existing
  Responsive Constraints card.
- Document it in the README under Responsive contract, beside `OverflowRail`.

Do not change existing components, tokens or modes to accommodate it.
