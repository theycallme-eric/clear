# Equipment icon inventory and wanted list

Round6 request, 3 November2026. This is an inventory/design backlog, not a claim that the assets exist or permission to alter equipment taxonomy. Preserve readable equipment text while visual placement is refined.

## Verified reusable public icons

`Dumbbell` and `WeightPlate` are exported from the immutable0.14.3 public entry and implemented in `src/design-system/assets/icons.tsx`. The current Required equipment summary uses Dumbbell as its category glyph. No public Kettlebell, MedicineBall, Barbell or other equipment-specific export was found. Generic User is not automatically a Bodyweight equipment glyph.

## Wanted coverage

The16 current setup equipment IDs come from `src/state/onboarding.ts` EQUIPMENT, also reused by Locations. Priorities below are proposed ordering for review, not approved new assets.

| Equipment / ID | Current icon status | Proposed next step |
| --- | --- | --- |
| Dumbbells / dumbbells | Dumbbell exists | Reuse the actual shared icon. |
| Kettlebells / kettlebells | Missing | First batch; directly shown in the review. |
| Medicine ball / review label | Missing; not a current16-item setup option | First-batch candidate from the Wall ball fixture; resolve label/data coverage without inventing a new catalog ID. |
| Barbell / barbell | No dedicated export | First-batch candidate; WeightPlate alone does not clearly mean Barbell. |
| Bodyweight / bodyweight | No dedicated equipment glyph | Decide whether a compact text label is sufficient; do not substitute User by assumption. |
| Resistance bands / resistance_bands | Missing | Catalog coverage backlog. |
| Foam roller / foam_roller | Missing | Catalog coverage backlog. |
| Pull-up bar / pullup_bar | Missing | Catalog coverage backlog. |
| Plyo box / box | Missing | Catalog coverage backlog. |
| Cable machine / cable_machine | Missing | Catalog coverage backlog. |
| Rowing machine / rowing_machine | Missing | Catalog coverage backlog. |
| Assault bike / assault_bike | Missing | Catalog coverage backlog. |
| Battle ropes / battle_ropes | Missing | Catalog coverage backlog. |
| Assisted pull-up/dip / assisted_pullup_dip | Missing | Catalog coverage backlog; retain the combined category identity. |
| Leg press / leg_press | Missing | Catalog coverage backlog. |
| Leg curl/extension / leg_curl_extension | Missing | Catalog coverage backlog; one combined category is the current data model. |
| Hack squat / hack_squat | Missing | Catalog coverage backlog. |
| Weight plate / supplementary glyph | WeightPlate exists | Reuse where its meaning is genuinely plates; not a blanket substitute for missing equipment. |

## Asset and presentation rules

Match the real shared filled geometric icon family:24×24 viewBox, currentColor, readable at16px, consistent optical weight and angular silhouette. No shadow/Echo baked into paths and no import of a mismatched icon library. Keep existing vendor bytes unchanged; any new shared SVG/component gets an app-owned source and gallery specimen through the normal design workflow.

R132 selects Section 4 A: compact equipment beside the movement name, with consistent responsive wrapping. Icons support a clear label; icon-only equipment is not selected. Bodyweight/none stays truthful; the accepted Overview Required equipment group is not implicitly redesigned by this movement-row request. This backlog does not make a complete equipment icon family a prerequisite for the next workout refinement.

Broader cross-chat context: [visual asset handoff](VISUAL-ASSET-HANDOFF-2026-11-03.md), including the current icon set, approved face exception, brand assets, general-imagery scoping and shared effects ownership.
