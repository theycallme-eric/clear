# Workout review feedback — 31 October 2026

Source: Eric's six annotated screenshots and accompanying message in Plan CLEAR design library. Reviewed preview: hosting commit `bed9c744263502c95be80e78a2d6bbdc88287d86`; current source `94f2c2f`, design proposal `f51a62f`. This is feedback intake, not blanket approval of the broader proposal. Keep the reviewed preview fixed while assembling the next coherent revision.

## R24 — Setup header stays pinned

Keep Set up CLEAR, step label and progress above the scrolling content, separated by the shared screen divider. Equipment content scrolls behind/below this pinned area, as on Generate/Home. Use the existing shared screen/header slots and scrolling contract; do not add a bespoke sticky overlay.

## R25 — Focus action alignment

The detached Change focus action below the summary looks misaligned and is rejected. Explore placing the action next to Focus or making Focus itself the touch target. Preserve keyboard access, an accessible name, expanded state and a visible interactive affordance. A first pass may reuse the current TextAction; the exact revised appearance still needs review.

## R26 — Overview facts wrap, never carousel

Remove horizontal carousel/arrow navigation from the proposed Overview. Allow a second row and keep every fact visible. The current implementation is shared SummaryFacts/OverflowRail, not an isolated V4-only invention; make the intended shared presentation explicit for Review and saved detail. Preserve the fact meanings and existing values.

## R27 — Equipment labels

Use uppercase, intentionally styled equipment names in Overview. Investigate existing equipment icons before adding any. The pinned public icon exports include Dumbbell and WeightPlate; they do not provide a complete one-icon-per-equipment vocabulary. Do not invent or substitute misleading icons for missing types.

## R28 — Superset and circuit grouping

Reject the long vertical grouping rail and the bottom/rest line treatment called out in the Review screenshots. Eric recalls a preferred comparison from earlier this week in another chat and requests retrieval through Sprout/Dot. Locate the source/selection before redesigning the grouped card; do not assume the current released/preview shape was approved. Carry the same resolved visual contract across related Review, live, History and Favorites presentations where their meanings match, preserving distinct behavior.

## R29 — One coaching-notes disclosure per grouped block

For supersets, circuits and related grouped blocks, explore one coaching-notes accordion at the bottom, containing clearly labeled notes for every movement. Remove the repeated per-movement disclosures from the main reading flow. Preserve movement-specific coaching, editable notes, save/error state and labels; consolidate presentation rather than merging or dropping those data owners.

## Next pass

Retrieve the earlier superset comparison, map these notes to existing shared owners, and make one coherent isolated preview revision. Show the relevant changed examples together. Owner visual acceptance precedes requirements changes. The library and manually released ErrorView pilot remain complete; no additional Runner test or invocation is part of this work.

## Recovered source and owner clarification

The comparison is recovered. Eric identified **Batch 05 — annotated visual decisions**, specifically **B05-04 — Review circuit/superset hierarchy**, and explicitly selected the right-hand pane. Primary source: `/Users/eric/Documents/Projects/support-tooling/project-workspaces/clear/inputs/ui-polish-batch-05-2026-10-28/VISUAL-REFERENCE.md`, with `sources/B05-04-review-grouping.jpg`. Its `GLOBAL-PATTERNS.md` requires correction through shared compositions and relevant consumers. The earlier October 26 comparison and written brief are supporting history, not replacement authority.

Earlier context lookup limitations are resolved by the recovered handoff and Eric's specific source. Do not continue treating the missing reference as a blocker. Eric's latest notes govern refinements. The separate numbering-column suggestion was not selected and is withdrawn.

## Shared presentation contract: the right-hand layout

- **Section/group owns context:** section name and movement count; one content-sized structure badge with its existing glyph and round count; one round-rest reading below the movement list. Keep the card's normal outer frame/accent. Remove the extra internal grouping rail and unused-width badge outline.
- **Movement row owns a stable hierarchy:** prominent name; prescription on a separate line; quieter equipment on a third line, with the same left alignment. Equipment must not migrate into the name line in this selected pattern. Keep tight spacing within a movement and a larger, consistent gap between movements, using existing tokens.
- **Action has its own slot:** Review's Swap aligns to the right of the movement-name row. A long name wraps in its own column without pushing Swap below the prescription or equipment. Only actions use the action treatment; a movement name does not imply an unprovided action.
- **Group data is not repeated by children:** round count/rest belong to the group; each row shows its per-round work and relevant equipment. Avoid duplicated Bodyweight/load/equipment and repeated per-movement round rest.
- **Rules separate peers:** use a restrained horizontal separator between movement rows. No final list-item divider and no nested vertical rule creating a second visual frame.
- **Keep execution semantics:** B05-04 explicitly preserves accepted numbered one-round semantics and structure glyphs that the older right-hand mockup omits. Preserve those meanings compactly in existing row/group metadata; do not create the separate numbering-column design Eric did not select or reintroduce a rail to carry order.
- **Share presentation, preserve behaviors:** Review supplies Swap, live workout supplies its actual logging/rest/state and the requested one bottom coaching-notes disclosure, and saved views supply recorded results. Reuse the layout and semantic text roles without moving all those behaviors into one state owner or copying an old mockup/controller.

Existing owners to reconcile are `ReviewExerciseRow`/Review grouping, `BlockPanel` movement/group composition and saved-detail movement rows. Shared tokens alone do not enforce this layout: the shared presentation must own the slot order, alignment, grouping, separator and rest placement. The real-component gallery and affected-context previews should exercise those owners with long names, multiple group sizes and relevant phone widths. Requirements should point to that canonical implementation/example, not reinterpret a screenshot.

## R2 candidate implementation

Branch `codex/workout-review-r2-2026-10-31` implements the shared selected hierarchy through MovementIdentity/MovementList, consumed by ReviewExerciseRow, BlockPanel.Movement and saved-detail rows. Standard movement behavior remains with its owner. Compound BlockPanel places one bottom coaching disclosure around the existing per-movement Guidance/ExerciseNotesField implementations. Explicit one-round/no-rest semantics remain.

R24: setup title/progress pinned together, one divider below. R25: Focus value is the accessible Change focus control in the proposal. R26: shared SummaryFacts wraps; no carousel. R27: required-equipment names uppercase using existing roles; no new icon catalog. R28: shared three-tier row, no internal rail or final separator. R29: one grouped coaching disclosure, independent notes. These are implemented review candidates; acceptance of the broad proposal and production contract resolution remain next.

Verification: 409 selected unit tests, 80 rendered panes, 69 focused checks, seven accessibility samples without violations; typecheck, app/preview builds and design lint pass. Review, live logging/rest, saved results and coaching-note writers retain their separate behavior. The comparison uses deterministic in-memory data, so live backend behavior is a later integration check.
