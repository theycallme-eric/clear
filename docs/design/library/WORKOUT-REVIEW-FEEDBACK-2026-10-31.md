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

## Retrieval checkpoint

Personal Context is unavailable in this conversation, and ChatGPT history lookup is unavailable to this durable task. The former Sprout delegation source does not return readable turns on the available hosts. Local project review notes and accessible CLEAR task histories are being checked. Do not claim that the earlier preferred superset comparison has been found or ask an unrelated build task to start work.
