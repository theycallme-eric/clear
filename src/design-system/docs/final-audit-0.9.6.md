# Final audit: 0.9.6

Run after the calibration, layout and cleanup passes. Everything below was measured or loaded, not read off the code.

## Result

| Check | How | Result |
|---|---|---|
| Components follow the recorded rules | Scanned every component for raw colours, raw sizes, retired names, off-rule letter-spacing, eased transitions, frames without the bleed wrapper, and private focus outlines | **6 findings, all fixed** (below) |
| Contrast, all four skins | The Contrast Audit card, measured live as painted pixels: 96 text/surface pairs | **2 failures, both fixed. Now all 96 pass**, tightest at 1.06× its threshold |
| Every page and template loads | Loaded all 43 preview and component pages plus the 3 templates, checked for script errors, blank renders and a stale library | **46 of 46 clean** |
| Docs match the code | Every class, token, component and icon the README and `docs/patterns.md` name, checked against the CSS and exports; retired names searched for; version in four places | **Clean.** The three tokens not defined in CSS (`--ground`, `--head-h`, `--foot-h`) are runtime hooks set by components or consumers, by design |

## Fixed in this pass

1. **Four frames had no 2px bleed:** `TimerDisplay`, `ScanLoader`, `Dialog` and the chips in `ChoiceGroup`. Each now has the bleed wrapper, coloured from its own border.
2. **`TimerDisplay` digits tracked at 0.06em**, off the 0.05em rule. Now `--tracking-data`.
3. **`AppHeader` and `ChoiceGroup` used a literal 40px** instead of `--control-height`.
4. **Mono's selected chip text was 6.2:1**, under the AAA 7:1 that Mono promises. In Mono only, the selected tint drops from 40% to 30%; the full border and the tick still mark the state. Colour skins keep the 40% you picked.
5. **The rail's edge cue was held to 4.5:1 in Mono** as if it were text. It's a non-text indicator, which WCAG holds to 3:1 at every level (there is no AAA for non-text contrast). The audit now classes it correctly, and it passes at 3.66:1.

## Left as is, deliberately

- **`OverflowRail` cue width (28px)** and **`Toast` minimum height (64px)** are fixed sizes for single components, not system sizes. Tokenising them would add tokens nothing else uses.
- **`ChamferedFrame` doesn't wrap itself in the scanline layer differently from `.clr-chamfer`**: it uses the same class, so they match by construction.

## For the owner, not the system

- The workout application in `_source/` still uses its own button, input and card, and the retired accent styling. None of the system's changes reach it until it's migrated.
