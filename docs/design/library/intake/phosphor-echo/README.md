# Phosphor Echo selected design input

Owner-selected round-3 visual direction, received 30 October 2026. This intake
preserves one reusable decorative effect under [issue596](https://github.com/theycallme-eric/clear/issues/596).
Its next step is a scoped, opt-in foundation/gallery integration proposal.

## Source and selected preset

The [kernel](phosphor-echo.mjs), [preferred preset](preferred-preset.json),
[application rules](APPLICATION-RULES.md) and [original verification](VERIFICATION.json)
are exact copies of `preview/round-3/` in the supplied package. Round 3 is the
selected source; earlier rounds and the original effect are historical.

| Parameter | Shared value |
| --- | --- |
| Opacity | 0.29 / 29% |
| Softness | 3.2 CSS px Gaussian standard deviation |
| Horizontal offset | −4.7 CSS px / left |
| Vertical offset | +5.64 CSS px / down, displayed as 5.6px |
| Color | Associated semantic role, inherited by each source |

The preferred JSON records the selected values; the supplied kernel defaults
agree. Integration must provide one runtime parameter owner for all eligible
targets, rather than independently tuning each surface or maintaining competing
defaults. The Signal study's pink/yellow colors are examples, not fixed colors.
The kernel's initialState/PART_DEFAULTS belong to the preview controls, not
application-wide enable flags.

Portable package: `phosphor-echo-design-system-handoff.zip`, already saved in
Library as `libfile_b475d9b2dfd881918cd2cb8a796c0f93`. Archive SHA-256:
`1752275a6f5ec2b42974245614aada229ff294067bff53313275ccef06912c3d`.
Original local source:
`/Users/eric/Documents/Codex/2026-10-28/task/output/phosphor-echo-design-system-handoff/`.
Its START-HERE.txt explains how to open the complete isolated study.

## Existing-library gap

1. **Need:** one static CRT rear image on eligible outer foreground surfaces.
2. **Options checked:** existing emission/bleed and primary-action glow lack
   this offset filled silhouette with foreground occlusion.
3. **Smallest extension and owner:** the next versioned CLEAR foundation's
   shared decorative-effect API owns the kernel and parameters. App adapters
   supply eligible silhouettes and semantic role colors. The pinned 0.14.3
   runtime/reference copies remain immutable. Locate/confirm the editable
   foundation authoring source before integration; add the effect there and
   consume it through a new versioned import, rather than an app-local visual
   fork or edits to historical `_source/`. No version number is assigned here.
4. **Consumers and review:** show real heading, framed back action, outer Card
   and CTA owners together with the effect off/on before opting a screen in.
   Register the actual shared implementation in the existing gallery/index.

## Essential rendering and application contract

Use one shared ghost-only filter. Its input is the full filled silhouette;
blur, offset and attenuate it, then subtract the original unshifted
`SourceAlpha` footprint using the out composite. Draw the sharp foreground
separately above the exposed rear image. Preserve foreground transparency:
rear pixels cannot leak through the top/right interior of translucent panels.
Turning the effect off hides the source entirely.

The demonstrated targets are the standalone Generate heading and outer back
button, card and CTA frames. Nested card content, the back arrow and CTA label
receive no independent echo. Keep SVG icon paths clean and the effect separate.
All eligible targets share settings and inherit their own associated role.

Map these targets to actual app owners before implementation. Current Generate
uses the shared Screen header and framed Home/back action in
`src/app/Generate.tsx`; the study's standalone heading is a rendering reference,
not authority to replace that layout. Its isolated screen must not be copied
wholesale into the application.

## Integration acceptance and verification limits

- Use actual shared components and safe fixtures for effect off/on. Verify the
  preferred preset at narrow mobile widths and across skins and meaningful
  semantic/focus states; no nested independent echoes or changed icon shapes.
- Verify one filter/parameter owner, complete silhouette input, foreground
  occlusion/transparency and source hiding when off. Check exposed left/bottom
  pixels and unchanged foreground interiors with the preferred preset.
- Carry the reviewed implementation through the normal issue/PR and versioned
  import workflow, then opt eligible surfaces in deliberately. This intake
  authorizes preservation, not app-wide activation, merge or release.

The supplied verification covers the isolated study at its initial round-3
settings (0.34 / 1.4 / −5.5 / +6.6). The selected preset was saved afterward as a
parameter-only update. Those records are preserved as supplied and do not prove
the selected preset on current app components or physical devices. The effect
is static and introduces no motion.

## Aesthetic reference

Eric identified [Augmented UI](https://augmented-ui.com/) as the closest visual
reference from the shortlist he previewed. It complements CLEAR's angular,
low-tech sci-fi direction and Phosphor Echo. This records aesthetic direction;
dependency adoption or replacement of CLEAR components is not part of this intake.

This intake is separate from the workout-prompt design-to-delivery pilot in
[the active plan](../../PLAN.md); it does not silently replace that work.
