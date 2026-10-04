# Icon set brief — CLEAR design system

Copy everything below the line into the LLM.

---

You are designing icons for **CLEAR**, a low-tech sci-fi design system — the instrument-panel aesthetic of the original Alien, Blade Runner, and Cyberpunk 2077's HUDs. Think stamped military stencils and CRT cockpit glyphs, not modern app icons.

## Hard rules (non-negotiable)

1. **24×24 viewBox, single solid fill.** `fill="currentColor"`, no strokes, no outlines, no gradients, no multiple colors. One flat silhouette per icon.
2. **No circles, no rounded corners.** The system contains zero curves. Anything round in the real object (a clock, a wheel, a person's head) is rendered as a square, octagon, or chamfered rectangle. This is the strongest rule — if an icon needs a circle to read, redesign it until it doesn't.
3. **Chamfered tips on anything directional.** Arrows, chevrons, and pointers get a flat 45° cut on the tip, never a sharp point and never a rounded one. This is the signature detail.
4. **Chunky proportions.** Limbs and bars are 3–5 units thick out of 24. If it would survive being stamped in metal or printed on a shipping crate, it's right. Nothing hairline.
5. **Orthogonal + 45° only.** Every edge is horizontal, vertical, or exactly 45°. No organic curves, no beziers, no arbitrary angles.
6. **Solid means solid.** Prefer positive silhouettes with rectangular notches cut out over line-work. A pause icon is two bars; a menu is three bars; a checkmark is a thick 45° polygon.

## Vibe words

Stenciled, stamped, industrial, cockpit, HUD, retro-terminal, utilitarian, brutalist. The icon should look like it means business on a dark near-black panel next to uppercase monospaced labels.

## Anti-patterns (reject on sight)

- Stroked/outline style (Feather, Lucide) — CLEAR replaces these, it doesn't imitate them
- Rounded corners or capsule shapes anywhere
- Perfect circles, dots as accents
- Thin, elegant, or hand-drawn lines
- Gradients, duotone, shadows
- Cute or friendly — no mascots, no smiles, nothing soft
- Detail that dies below 16px — every icon must survive rendered at 16px

## Reference silhouettes (existing set, for consistency)

- **ArrowRight**: thick horizontal bar + chamfered-tip head
- **Play**: right-pointing triangle with the tip chamfered flat
- **X/Close**: two thick 45° bars crossing, square ends
- **Check**: thick two-segment polygon, square ends, 45° bend
- **Dumbbell**: solid rectangles — plates as squares, bar as a thick beam

## What to deliver

For each icon: the concept in one line (what silhouette, what gets chamfered, what circle got squared), then the SVG as a single `<path>` (or minimal path count) in a 24×24 viewBox with `fill="currentColor"`. Keep coordinates on whole or half units.

## Icons needed

**Priority — redraws.** These exist but still use circles/curves from their lucide origins; redraw each obeying rule 2 (square, octagon, or chamfered-rect instead of round):
clock, target, crosshair, gauge, eye, eye-off, user (squared head + shoulders), circle-check → square-check badge, circle-x → square-x badge, circle-alert → square-alert badge, help badge, refresh (rectangular loop, 90° corners, chamfered arrowhead), flame (angular, faceted like a low-poly flame), and four mood faces: frown, meh, smile, smile-plus (square faces, rectangular eyes, angular mouths).

**New — core UI:**
search (square lens + 45° handle), filter (funnel with chamfered mouth), sort-asc, sort-desc, bell, bell-off, calendar, calendar-check, lock, unlock, key, log-in, log-out, sliders (three vertical faders — CLEAR's "settings"; no gear, gears are round), trash, copy, download, upload, share, play, pause, stop, skip (double chevron), info badge, warning triangle.

**New — domain (fitness/instrument):**
stopwatch (squared), pulse (angular EKG trace), streak (row of square pips), rest (pause bar inside a frame), weight-plate (octagon), circuit (loop of square nodes), ladder (rungs), superset (two stacked bars linked), trophy (angular), log (list with square bullets).
