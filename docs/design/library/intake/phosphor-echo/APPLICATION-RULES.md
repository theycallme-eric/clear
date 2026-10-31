# Phosphor Echo · round 3

## What changed

Round 2 copied only the border pixels. That made a second outline whose top and right edges could show through translucent foreground panels.

Round 3 uses the **full filled silhouette** as the source of the rear image. The shared effect then subtracts the unshifted foreground footprint from its output, so the residual image is visible only where it is exposed around the foreground. The front panel stays translucent; it is not made opaque to hide the effect.

The same effect is used for the standalone heading and all three framed surfaces. The initial round 3 comparison retained round 2 settings while changing only source geometry and occlusion. The user subsequently selected the preferred preview preset: 29% opacity, 3.2px blur, −4.7px horizontal and +5.64px vertical offset (displayed as 5.6px). Those are now the single shared defaults and the reset target.

## One shared effect

`phosphor-echo.mjs` defines one filter, `#screen-echo`, and one settings object. Every enabled source references it. No per-area blur, strength, offset or color preset exists. Hue follows the source's existing color.

The single kernel is:

1. Blur the source silhouette.
2. Offset it left and down.
3. Reduce its alpha.
4. Composite it **out of the original SourceAlpha footprint**.
5. Render the untouched sharp foreground separately above it.

The filter emits only the rear copy. Turning it off hides the source layer altogether, preventing a solid source shape from appearing in place of the original transparent panel.

## Source and foreground rules

| Area | Rear-image source | Sharp foreground |
| --- | --- | --- |
| GENERATE heading | Duplicate of the text silhouette | Original heading text |
| Back action | Complete chamfered button silhouette in pink | Existing frame and arrow |
| Workout card | Complete chamfered card silhouette in yellow-green | Existing outline, accent bar, transparent ground and inner content |
| Generate Workout CTA | Complete chamfered button silhouette in pink | Existing outline, translucent fill and label |

Text and controls inside the card do not receive an effect. The back arrow and CTA label do not receive separate effects. The rear fill is an invisible input shape, not a new visible front-panel fill. The panel's background transmission remains unchanged.

## Review and limits

Open http://127.0.0.1:8794/round-3/. Compare round 2 keeps the prior border-copy treatment intact so the masking change can be assessed directly. Global controls still update the same filter for all four sources.

This remains an isolated editable reconstruction grounded in the supplied screenshot and CLEAR 0.14.3 conventions. No production integration, real data, physical-device test, app-code change, Runner change or publication is included. The original Phosphor Echo package and earlier preview revisions remain unchanged.
