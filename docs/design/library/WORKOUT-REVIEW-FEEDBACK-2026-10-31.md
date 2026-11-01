# Workout review feedback — 31 October 2026

## Running refinement list — updated 1 November 2026

North Star: one executable visual library, with the same shared implementations in gallery and product. This workout refinement is the practical test of that reuse and the design → requirements → implementation workflow. It is not a new independent design system.

All 38 recorded comments are indexed below. **Previewed is not released or blanket approval.** Superseded choices stay visible so future requirements cannot accidentally revive them. R01–R23 detail is preserved in [the historical feedback snapshot](archive/WORKOUT-REVIEW-R01-R23-2026-10-30.md); R24 onward retains the source notes below. The five subpoints of R10 are included together in its row and remain verbatim in that snapshot.

<!-- refinement-index:start -->
| ID | Decision / refinement | Current status | Shared owner / follow-through |
| --- | --- | --- | --- |
| R01 | Warm-up: title, approximate total time, movement-name list; no prose or per-movement prescriptions. | Visually accepted (R36); data contract open | PreparationGuide; Review and Workout |
| R02 | Remove added Last-performance row; retain prescribed weight. Earlier equipment-beside-title placement is superseded by R28. | Previewed; placement superseded | ReviewExerciseRow / MovementIdentity |
| R03 | Accessible adaptive-training/progress report, using authoritative observations and distinct next targets. | Open: location, content and data contract | TrainingProgressReport proposal / History |
| R04 | Conditioning range in the prescription; clear units/per-hand meaning; no extra Review Change weight action. Equipment placement follows R28. | Previewed; range data contract open | ReviewExerciseRow / live load reading |
| R05 | Cooldown precedes Regenerate; Regenerate is last after workout content. | Previewed | Review / PreparationGuide |
| R06 | Reconcile returning Generate with delivered UI; keep Change focus associated with Focus. | Previewed; refined by R21/R25 | Generate |
| R07 | Save → confirmation plus existing rest → collapse/reset at rest end; never auto-open the next form. | Previewed with real in-memory writers; hosted integration open | SetLogger / SupersetBlock / SetLoggingSheet |
| R08 | History filters omit Rest days and Not started. | Previewed | History |
| R09 | Frontend titles use Effort instead of RPE; keep recorded effort values. | Previewed | Session detail / shared result tables |
| R10 | Generate: Recovery inside focus choices; stronger Goal; MINUTES fits; Generate title; shared icon-only Back with destination/accessibility preserved. | Previewed; normal/recovery semantics retained | Generate / existing header and unit owners |
| R11 | No-history first workout is normal, never default Recovery. | Retained and checked | Generate draft/request owner |
| R12 | Use actual updated Overview; do not restore a frozen preview as current design. | Retained source rule; R26/R32–R34 refine visuals | SummaryFacts / source-labeled comparison |
| R13 | Cooldown matches the concise warm-up format. | Previewed; data contract open | PreparationGuide |
| R14 | Warm-up timer has no Dismiss or substitute hiding action. | Previewed | PreparationGuide |
| R15 | Preparation reuses shared timer presentation, with an independent clock. | Previewed; real integration open | CountdownBar / RestTimerBar / PreparationGuide |
| R16 | Complete logging-sheet frame; use available phone height, with safe-area/keyboard overflow preserved. | Previewed; physical-keyboard UAT open | SetLoggingSheet / SetMeasurementRow |
| R17 | Expanded and minimized rest use the shared timer; no custom plain-text countdown or duplicate clock. | Previewed; hosted integration open | RestTimerBar / shared rest owner |
| R18 | Keep circuit recording/undo/history behavior; reconcile its visual hierarchy with current shared patterns. | Current real renderer retained; further visual review open | CircuitBlock |
| R19 | History title on its own row; status beneath it beside the date. | Previewed | History list row |
| R20 | Saved Overview uses the same compact fact composition as Review. | Previewed; recorded meanings retained | SummaryFacts / SessionDetail |
| R21 | Goal and Focus are prominent; Change focus subordinate. Earlier framed/link alternatives refined by R25. | Previewed | Generate |
| R22 | Error accent uses the semantic error role across skins. | Released through PR611 | ErrorView |
| R23 | Remove Place and Notes helper copy in Generate. | Previewed | Generate |
| R24 | Setup title and step/progress stay pinned together; one divider below. | Previewed in R2/R3 | Screen / AppHeader / pinned head |
| R25 | Focus value itself is the accessible action; remove detached Change focus. | Previewed in R2/R3 | Generate / TextAction |
| R26 | Overview facts wrap across rows; no carousel or hidden facts. | Previewed in R2/R3 | SummaryFacts |
| R27 | Required-equipment names uppercase; do not invent a complete icon catalog. | Previewed; refined by R34 | EquipmentSummary |
| R28 | Selected B05-04 hierarchy: distinct name/prescription/equipment, no inner rail, separators only between peers. | Selected direction; revised preview pending | MovementIdentity / MovementList / MovementGroupHeader |
| R29 | One bottom grouped coaching disclosure with separately labeled movement cues/notes and independent writers/drafts. | Visually accepted (R36) | GroupExerciseCoaching / BlockPanel |
| R30 | Use workout layout as the Review/live base; Swap only in Review, progress/Rest only live. Preserve planned work. | R3 common cases previewed; remaining format gaps in R38 | Shared movement/header/layout owners |
| R31 | Restore prescribed load in live movement rows; do not confuse target and actual or guess units. | Previewed standard/superset/circuit; remaining families in R38 | MovementIdentity load slot / loadText / live rows |
| R32 | Overview intensity omits redundant of 10; values and scale unchanged. | Implemented in R3 preview | Review fact derivation / saved Overview |
| R33 | Movement count gets a fitting existing glyph and an accessible term. | R3 first pass: Log/list glyph, label retained; selection pending | SummaryFact |
| R34 | Required equipment gets deliberate grouping, spacing and neutral read-only items. | R3 first pass; visual selection pending | EquipmentSummary |
| R35 | Replace the clunky duplicate section card with compact navigation; preserve position/status, jumping and focus. | R3 first pass; visual selection pending | SectionHeader compact variant / existing jump owner |
| R36 | Keep the reviewed warm-up appearance and grouped Coaching and notes treatment. | Visually accepted; appearance preserved | PreparationGuide / GroupExerciseCoaching |
| R37 | Review headers are static, compact and always expanded, matching workout header layout. | Implemented in R3 preview; visual review pending | MovementGroupHeader / Review |
| R38 | General Review/Workout alignment covers every format; inspect matched EMOM, AMRAP, plain For Time and real timed-ladder examples. | Coverage examples added; timed presentation gaps remain open | Shared frame/rows plus EMOM, AMRAP, ForTime and Ladder owners |
<!-- refinement-index:end -->

The next visual review focuses on **R30–R35 and R37**. Accepted warm-up/coaching treatments remain in place. After selection, Requirements Builder should name these canonical owners and examples, preserve their distinct state/data behavior, and carry every active row forward or explicitly defer it. Report/guide/range/default contracts are open work, not invisible assumptions. The later Runner/UAT stage is conditional on that approved implementation scope; this preview pass does not start it.



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

## Owner review of R2 — 1 November 2026

Reviewed source: `f519268024e7f61d62e73c01a02c936e5213bd2a`, shared implementation `272d38708eea6baa151635ebd47f15047f1d5c90`. Eric supplied four screenshots and selected the live workout layout as the cleaner common direction. Preserve that published R2 preview while preparing the next revision on `codex/workout-review-r3-2026-11-01`.

### R30 — One layout, context-specific slots

Use the cleaner workout card as the common presentation for related Review and live blocks. Share group-header/badge placement, movement hierarchy, spacing, separators and rest description. Sharing MovementIdentity/MovementList alone has not removed the surrounding group/header and prescription differences. Extend the existing shared composition rather than copying one screen into another.

Review supplies Swap; live workout supplies set/round progress and Rest/logging controls. Do not show Swap during the workout or a live `Set 1/3` progress counter/Rest button in Review. **Do not interpret this as removing prescribed sets, reps, rounds or rest information from Review**: those describe the planned workout. Preserve accepted ordinal/consecutive-execution meanings. Keep behavior/state owners separate.

### R31 — Prescribed load remains visible in the workout

Show the relevant load beside the prescription in both contexts, using one shared reading/formatter. Verify the same movement and data on both sides. `ExerciseSetLogger` currently passes only `prescriptionText(prescription)` to BlockPanel.Movement; Review includes its separate load. Circuit movement presentation also supplies target text without a load reading. The existing `loadText` formatter covers absolute load, percent-1RM, RIR, last-session and Bodyweight semantics; reuse established unit/data ownership. Do not substitute logged actual weight for a prescribed target, guess a missing unit, or promote synthetic rough-load inputs into a production data contract. Suppress duplicated Bodyweight/equipment text.

### R32 — Intensity Overview copy

Remove visible `of 10` from the Overview intensity reading; the fixed ten-point scale does not need repeating here. Preserve the actual value and meaning. Apply through the relevant shared fact presentation/consumers, not string replacement over unrelated effort scores or stored data.

### R33 — Movement-count fact

Eric requested a matching icon treatment for the Movements fact. Check existing public glyphs for a clear semantic fit and retain an accessible term. An icon has not been selected or approved. Do not silently use a circuit/superset-only symbol for all movement counts.

### R34 — Required equipment still needs design attention

Uppercase names are closer but the flat label/list remains visually unresolved. Prepare a deliberate shared equipment group aligned with Overview's fact hierarchy and spacing; use the same first pass in related contexts. The public glyph set includes Dumbbell/WeightPlate, not complete equipment coverage. Do not invent one icon per equipment type or pretend those two represent every kind. Exact revised treatment still needs owner review.

### R35 — Live section navigator

Eric finds the separate top card (`Accessory`, section/status, repeated structure badge, All sections) clunky. Explore a compact navigation treatment that avoids repeating the active card's identity. Preserve current position/status meaning and access to section jumping; this feedback does not authorize deleting navigation or tracking behavior. Show a first pass in context rather than introducing a new route or framework.

### R36 — Accepted visual choices

**Warm-up:** Eric says the concise presentation is perfect. **Coaching and notes:** Eric says the single bottom grouped disclosure is perfect. Preserve those selected visual treatments. This approves their reviewed appearance/placement, not unresolved synthetic guide content, generation, persistence or setup defaults.

Next revision: common Review/live group composition based on the workout layout, complete prescribed-load reading, Overview cleanup and a simpler live navigator. Keep the accepted warm-up and grouped coaching appearance. Review with identical sample movements, long names and relevant phone widths; exercise existing Swap/logging/rest/notes behaviors. Owner visual review comes before requirements consume the revised contract.

### R37 — Review uses static workout-style headers

Eric explicitly requested removing Review section-header collapsing because it consumes space, and using the cleaner workout header for consistency. Review section content stays visible. Reuse the compact shared header arrangement: section identity on the left, the relevant structure/rounds badge on the right. Remove the disclosure chevron, toggle hit area, expanded/collapsed state and hidden-content behavior from those Review headers; preserve semantic headings and the planned workout information. Related Review/live cards should inherit the same spacing and header presentation, with context-specific controls in their existing slots. This does not remove the separately accepted grouped Coaching and notes disclosure. Include this in R3 alongside R30–R36.

### R38 — Scope is all workout formats, not just supersets

Eric clarified that the objective is general Review/Workout consistency and asked to see EMOM, AMRAP, For Time and ladders. The superset screenshot is an example, not a scope limit. Follow-up inspection found that inherited preview coverage overstated the format distinction: the For Time option selected a For Time block with ladder_down, which dispatches LadderBlock; the Ladder option selected a standard ladder-up prescription, not the explicit timed ladder renderer. Correct the examples without labeling those earlier screenshots as a plain For Time test.

Added matched Review/live fixtures for the four requested families. The plain For Time sample has a fixed target and uses ForTimeBlock. The ladder sample uses the existing makeLadderTimingBlock capped-window fixture, including its explicit ladder_timing through snapshotFixture. Review fixtures validate with the actual generationOutputSchema. These are synthetic examples of current R3 components, not new runtime implementations or approval of all format-specific visuals.

| Family | Shared presentation already consumed | Remaining consistency work |
| --- | --- | --- |
| Standard | BlockPanel header/frame; MovementIdentity/MovementList; prescribed load/equipment | Review next to live with context-specific controls |
| Superset | Shared header/frame, peer rows, load/equipment, grouped coaching | Owner visual review of R3 |
| Circuit | Shared header/frame, peer rows, load/equipment, grouped coaching | Circuit clock/action hierarchy still needs visual review (R18) |
| EMOM | BlockPanel header/frame and shared movement/list presentation | Row does not yet supply the common load/equipment readings; retain its minute assignment and now/next state |
| AMRAP | Its own Card/header and private work-list composition | Reconcile with shared group/header/row owners; preserve window, rounds/reps scoring and conditioning-history behavior |
| Plain For Time | BlockPanel header/frame and shared movement/list presentation | Row does not yet supply common load/equipment readings; preserve race/cap and result controls |
| Timed ladder | BlockPanel frame and dedicated rung/timing presentation | Align applicable movement/load/equipment roles; retain rung schedule/companion work and whole-block timing |

Do not claim the general reconciliation complete while these gaps are open. The inherited render sweep proves that a named scene rendered, not that its format/fixture represented every intended renderer or that its presentation was fully reconciled. The new format verification checks the actual renderer's distinguishing controls/content as well as the matching Review data. These remaining items belong in the same feedback/requirements handoff; do not build a single universal timing/scoring state machine.
