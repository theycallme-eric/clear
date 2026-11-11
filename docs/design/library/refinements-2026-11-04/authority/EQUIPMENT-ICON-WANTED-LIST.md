# Equipment icon inventory and wanted list

Round 6 request, 3 November 2026 (R122), carried into the application build by TASK-029 (REQ-029,
C56; R122, R132) from accepted gallery reference `eded158cfd928d382c9a9409e2c372270312741d`,
`/gallery/refinements?state=assets`. This is an inventory and design backlog. It does not claim that
the wanted assets exist, and it does not give permission to change the equipment taxonomy. Keep
equipment text readable while the visual placement is refined.

The same inventory is stated in source by `src/ui/refinements/equipment-assets.ts`. The focused
check in `src/ui/movement-identity.test.tsx` fails if this table and that module disagree.

## Verified icon family

`src/design-system/assets/icons.tsx` exports **75** named icons in one solid, angular family. It was
verified unchanged against the accepted reference. The approved exception is the four round,
line-drawn mood faces: `Frown`, `Meh`, `Smile` and `SmilePlus`. Set and block Effort reuse `Frown`,
`Meh` and `Smile`. The faces are not redrawn, and the Effort control is not replaced.

## Verified reusable public icons

`Dumbbell` and `WeightPlate` are exported from the public entry and implemented in
`src/design-system/assets/icons.tsx`. The current Required equipment summary uses Dumbbell as its
category glyph. No public Kettlebell, MedicineBall, Barbell or other equipment-specific export was
found. Generic User is not automatically a Bodyweight equipment glyph.

## Wanted coverage

The 16 current setup equipment IDs come from `src/state/onboarding.ts` EQUIPMENT, which Locations
also reuses. The priorities below are a proposed ordering for review, not approved new assets.

| Equipment / ID | Current icon status | Proposed next step |
| --- | --- | --- |
| Dumbbells / dumbbells | Dumbbell exists | Reuse the actual shared icon. |
| Kettlebells / kettlebells | Missing | First batch; directly shown in the review. |
| Medicine ball / review label | Missing; not a current 16-item setup option | First-batch candidate from the Wall ball fixture; resolve label/data coverage without inventing a new catalog ID. |
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

New icons must match the real shared filled geometric icon family:

- a 24×24 viewBox and `currentColor`;
- readable at 16px;
- a consistent optical weight and an angular silhouette;
- no shadow or Echo baked into the paths;
- no import of a mismatched icon library.

Keep existing vendor bytes unchanged. Any new shared SVG or component gets an app-owned source and a
gallery specimen through the normal design workflow.

R132 selects Section 4 A: compact equipment beside the movement name, with consistent responsive
wrapping. Icons support a clear label; icon-only equipment is not selected. Bodyweight/none stays
truthful. This movement-row request does not implicitly redesign the accepted Overview Required
equipment group. The backlog does not make a complete equipment icon family a prerequisite for the
next workout refinement.

## Status in the application build (TASK-029)

- **Selected placement, in use.** On `/review` and `/workout`, every movement's equipment is the
  readable label beside its name. That holds whether or not the kind has a glyph, and for the Wall
  ball's medicine ball. Setup (`/onboarding`) and Locations name every equipment choice in words.
  No surface shows equipment as an icon alone.
- **No glyph adopted in movement rows.** `Dumbbell` exists, but placing it beside a movement's
  equipment label is part of the artwork and adoption follow-up below. It is not done implicitly.
- **No taxonomy change.** EQUIPMENT still has 16 IDs, and there is no medicine-ball setup ID.

## Follow-up (explicit, not scheduled by TASK-029)

1. **Artwork.** Comparison batch: Kettlebell, Medicine ball and Barbell, shown beside the existing
   Dumbbell and WeightPlate at 16, 20, 24 and 32px in all four skins. Then the catalog-coverage
   backlog above.
2. **Bodyweight.** Decide between text and a glyph.
3. **Adoption.** An approved glyph is added to `icons.tsx` with a gallery specimen. The selected
   placement then shows it *beside* the readable label, never in place of it. Update
   `src/ui/refinements/equipment-assets.ts` and this table together.
4. **Medicine ball catalog coverage.** Resolved separately; no setup ID is invented here.

Broader cross-chat context is in the visual asset handoff (`VISUAL-ASSET-HANDOFF-2026-11-03.md` in
the accepted gallery reference). It covers the current icon set, the approved face exception, brand
assets, general-imagery scoping and shared effects ownership.
