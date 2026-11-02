# Historical feedback collection R01–R74

Snapshot preserved before consolidation, 2 November 2026. Eric subsequently closed intake and requested one consolidated list, pattern review and clarification before the next iteration. Dated holds, pending-choice descriptions and next-step instructions below are historical; use [the current consolidated list](../WORKOUT-REVIEW-FEEDBACK-2026-10-31.md) for current dispositions. Original R01–R23 source detail remains in [its earlier snapshot](WORKOUT-REVIEW-R01-R23-2026-10-30.md).

---

# Workout review feedback — 31 October 2026



## Active intake — 2 November 2026

**Eric explicitly requested intake only until he says all notes are entered.** Save feedback and answer factual questions with read-only inspection. Do not implement, revise/rebuild/publish the reviewed previews, reconcile notes into primary requirements, invoke Builder/Runner or treat the round as closed. This applies to the current EMOM notes and subsequent entries until Eric explicitly resumes work. Current reviewed preview: `7832150c1370525a42a561603020a87e0060d04b`, application source `a538f763dae6a491205469aa76386ad5205fef2c`, `/workout-formats/FORMATS.html`.

## Running refinement list — updated 2 November 2026

North Star: one executable visual library, with the same shared implementations in gallery and product. This workout refinement is the practical test of that reuse and the design → requirements → implementation workflow. It is not a new independent design system.

All 74 recorded comments are indexed below. **Previewed is not released or blanket approval.** Superseded choices stay visible so future requirements cannot accidentally revive them. R01–R23 detail is preserved in [the historical feedback snapshot](WORKOUT-REVIEW-R01-R23-2026-10-30.md); R24 onward retains the source notes below. The five subpoints of R10 are included together in its row and remain verbatim in that snapshot.

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
| R33 | Movement count gets a fitting existing glyph and an accessible term. | Shown Overview visually accepted in R74 | SummaryFact |
| R34 | Required equipment gets deliberate grouping, spacing and neutral read-only items. | Shown Overview visually accepted in R74; preserve shared treatment | EquipmentSummary |
| R35 | Replace the clunky duplicate section card with compact navigation; preserve position/status, jumping and focus. | R3 first pass; visual selection pending | SectionHeader compact variant / existing jump owner |
| R36 | Keep the reviewed warm-up appearance and grouped Coaching and notes treatment. | Visually accepted; appearance preserved | PreparationGuide / GroupExerciseCoaching |
| R37 | Review headers are static, compact and always expanded, matching workout header layout. | Implemented in R3 preview; visual review pending | MovementGroupHeader / Review |
| R38 | General Review/Workout alignment covers every format; inspect matched EMOM, AMRAP, plain For Time and real timed-ladder examples. | Coverage examples added; timed presentation gaps remain open | Shared frame/rows plus EMOM, AMRAP, ForTime and Ladder owners |
| R39 | EMOM Start fills the responsive card width; place it below work content and above coaching. After starting, show a secondary Pause action. | Intake only; broader Start placement is tentative | Existing action composition / EMOM clock owner |
| R40 | Remove redundant EMOM Not started and Work captions shown in the annotations. | Intake only; minute progress and now/next not requested for removal | EMOM status presentation |
| R41 | Omit the per-movement rest-time line from EMOM Review. | Intake only; no change to the actual minute schedule selected | Review EMOM presentation |
| R42 | Fix the responsive timer frame so time uses its full framed area rather than a narrow inner frame inside empty width. | Intake only; use the shared timer owner | Shared timer composition / MinuteCountdown |
| R43 | At the prescribed EMOM end, provide a Log action instead of only the completion message. | Intake only; actual results/fields and interaction still open | EMOM end state / existing logging and completion owners |
| R44 | Clarify the movement ordinal: it identifies position in a multi-movement rotation; one movement currently still shows 1. | Question answered; hiding it for one movement not yet selected | EMOM movement identity |
| R45 | Dedicated platform-wide copy audit and language/tone rules, beyond the current workout examples. | Explicit future work request; audit not started during intake | Platform copy / shared terminology and action labels |
| R46 | Show how AMRAP Review and Workout handle multiple movements. | Example request; no new preview during intake | AMRAP work-list / shared movement presentation |
| R47 | Remove the per-movement Rest 60s line from AMRAP Review. | Intake only; do not change timer/scoring semantics | Review AMRAP presentation |
| R48 | Start AMRAP and Finish early fill responsive card width below the movement/prescription. | Intake only; EMOM Pause request does not automatically transfer | Existing action composition / AMRAP clock owner |
| R49 | AMRAP time fills the whole responsive timer frame, like R42. | Intake only; shared timer correction | Shared timer composition |
| R50 | Replace awkward running AMRAP helper with Log when complete. | Requested wording; broader copy rules remain future work | AMRAP running helper / platform copy |
| R51 | Badge contains format only; duration/details outside; position consistently, under title if same-row fit cannot be guaranteed. | Intake only; preserve upper-left preference and conditional placement | Shared format badge/header / Review and Workout |
| R52 | Explore softer quantity-control frame corners matching the referenced menu geometry. | Requested comparison; exact shape not selected | Quantity controls / existing icon-button geometry |
| R53 | Header timer and menu/icon share height globally; make the timer taller. | Intake only; explicit global request | Shared header timer / menu control |
| R54 | Put completed AMRAP movement/prescription before rounds-completed controls. | Intake only | AMRAP completed-state content order |
| R55 | Group/separate rounds and partial-round result areas rather than floating lines of text. | Intake only; containment design not selected | AMRAP results presentation |
| R56 | Explore minus/value/plus as one framed quantity-selector component. | Tentative design exploration, not an approved new API | Existing quantity-input owners / smallest shared addition if needed |
| R57 | Remove Clear rounds and No partial round reset controls; use decrement instead. | Intake only; preserve/reconcile zero versus unreported meaning | AMRAP result controls / recorded-result semantics |
| R58 | Explore a completion check/time arrangement that aligns cleanly, retaining the liked direction. | Alternative requested; final design not selected | Shared completion readout / AMRAP completed state |
| R59 | Apply the AMRAP format-only badge and consistent-placement notes to For Time too; cap belongs outside the badge. | Intake only; extends R51 | Shared format badge/header / timed format consumers |
| R60 | Remove the crossed-out Rest 60s line from For Time Review. | Intake only; preserve actual prescribed-work/timer semantics | Review For Time presentation |
| R61 | Show/explain grouped For Time shapes, including multiple movements and ladders performed before a cap. | Question and coverage request; current plain example is insufficient | ForTimeBlock / LadderBlock / shared movement presentation |
| R62 | Clarify how finishing For Time is logged and what actual work can be recorded. | Current source path verified; desired results-entry contract open | ForTime outcome / section completion / actual-work writers |
| R63 | Consider effort capture for timed work and whether that feedback can be used. | Exploratory question, not approval to restore collection or change progression | Existing effort storage / conditioning feedback rules |
| R64 | Natural For Time timeout/end-state screenshot is still pending from Eric. | Awaiting further intake; running screenshot is context only | For Time capped-state review |
| R65 | Ladder Review is visually accepted apart from moving prescription details out of the badge. | Explicit visual acceptance with badge exception; exact concise badge text open | Shared Review movement/header presentation / ladder badge |
| R66 | Long ladder card exception: Start near the top, below title/badge and likely above prescription, visible without scrolling through the ladder. | Intake only; refines general bottom-action placement for this case | Shared block action slot / LadderBlock |
| R67 | Timed ladder needs a functioning visible clock and Start/stop lifecycle like other For Time blocks. | Intake only; missing-timer observation retained | Existing shared timer and ladder timing owner |
| R68 | After ladder Start, show secondary Pause and primary Finish together. | Explicit requested hierarchy; pause/resume details open | Timed-ladder action composition / clock owner |
| R69 | Natural timeout or Finish prompts a results log: incomplete progress or all rungs checked when completed, plus effort, notes and applicable weights. | Explicit ladder logging direction; detailed fields/save/confirmation contract open | Ladder results / existing logging and effort owners |
| R70 | Remove repeated same every round suffix from companion-movement prescriptions. | Intake only; preserve the actual repeated rep targets | Shared ladder rung presentation / copy |
| R71 | Remove the crossed-out Move through the rounds… explanatory paragraph. | Intake only; relates to platform copy pass R45 | Ladder guidance/helper copy |
| R72 | Rung lines should omit reps between quantity and movement or use a separator such as × or ·. | Alternative notation requested; exact choice not selected | Shared ladder prescription text |
| R73 | Consider a dedicated empty-state pass and rules, prompted by repeated missing-coaching messages. | Exploratory follow-up; no replacement behavior selected | Shared empty-state presentation / coaching and notes |
| R74 | Overview shown here is exactly the desired visual treatment. | Visually accepted; preserve layout, fact/icon treatment and equipment grouping | SummaryFacts / EquipmentSummary / shared Overview consumers |
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

## EMOM feedback intake — 2 November 2026

Source: Eric’s message and four annotated screenshots, in order: before Start, running minute, Review, prescribed window complete. Preserve the frozen reviewed preview while collecting the entire round. These are recorded requests/questions, not implemented changes or finalized requirements.

### R39 — Start/Pause action: width and placement

- Before starting, Start EMOM should fill the card’s available width responsively (screenshot 1 annotation 1).
- Move Start below the movement/work content and other relevant readings, directly above Coaching and notes.
- After starting, the action should become a **secondary Pause** button. The current preview has no Pause action; this requests real interaction/state behavior, not just a label substitution. Exact resume, persistence and end-state details are not selected in this intake.
- Eric adds: “this will likely be true everywhere.” Record common Start-action placement as a **candidate cross-format rule** to reconcile when the whole feedback round is closed. Do not silently move every logging/finish/undo control or label this a finalized universal rule.

### R40 — Remove redundant phase captions

Screenshot 1 annotation 2 crosses out **NOT STARTED**. Screenshot 2 annotation 2 crosses out **WORK**. Remove these redundant captions in the next authorized revision. Minute position (MIN 1 OF 10) and NOW/NEXT movement cues were not crossed out; preserve their meaning pending further notes. The completed-state screenshot is separately covered by R43.

### R41 — Review EMOM rest reading

Drop the Review movement’s **Rest 60s** line for EMOM (screenshot 3 and accompanying text). A generic between-set rest reading does not describe the EMOM minute pattern. This is a Review display request; no instruction changes the actual minute length, within-minute work/rest contract or global workout timer.

### R42 — Timer frame fills its responsive space

Screenshot 2 annotation 1: “Timer frame is broke, the time should take up this whole framed space.” The illustrated 00:59 occupies a narrow inner cut frame while a much wider outer frame remains empty. Correct containment and responsive width through the applicable **shared timer composition** after intake closes, rather than making an isolated EMOM timer or patching the immutable vendor. No exact digit size is selected here.

### R43 — End of EMOM and a real Log action

Eric asks what happens when the prescribed EMOM ends and whether there is somewhere to log results. Screenshot 4 annotation 1 crosses out “The clock has run every prescribed minute. Continue when you are ready.” and requests: “Make this the log button rather than just saying it’s done.”

Verified current implementation at application source a538f76: after the final minute, the EMOM view enters finished, shows COMPLETE and the informational message, and provides **no dedicated EMOM performance-results form**. The existing footer forward action saves block/section completion. EmomBlock passes no observed outcome into BlockPanel; scheduled elapsed minutes are not athlete-reported minutes/work, so the results path does not fabricate performed reps, load or minutes_completed from the timer. Coaching notes are a separate existing writer.

Record the requested end-of-window **Log action**. Which performed results it collects, exact button label/placement, save/error/reopen behavior and any relationship to the footer are **open**, to resolve after the full intake round. Do not implement a guessed form or auto-log performance because the clock elapsed.

### R44 — What the movement number means

Screenshot 1 annotation 3 asks whether “1.” is for EMOMs with multiple movements. Verified: EmomMovement builds the prefix from ExerciseProgress.position, the movement’s one-based position in the rotation. Minute progress is a separate reading; a single movement still renders as 1. This answers the question. Eric has not explicitly requested hiding the ordinal for the single-movement case, so do not convert that possible refinement into an approved change.

### Intake continuation

Keep collecting subsequent format notes in this same running list. Do not start the next revision until Eric explicitly says all notes are entered and work may continue. Previously accepted warm-up and grouped coaching presentation remain accepted; this EMOM intake does not reopen those decisions.


## AMRAP and platform-wide feedback intake — 2 November 2026

Source: Eric's message explicitly requesting a platform-wide language/copy pass and continued intake, with six annotated AMRAP screenshots from the same published format comparison. The intake hold remains active. These notes distinguish direct requests, questions and exploratory ideas; they do not authorize a new preview or implementation.

### R45 — Platform-wide language and copy pass

Explicitly add a dedicated pass across the platform, not just AMRAP or the current comparison. Inventory awkward/inconsistent language, terminology, action labels and state/helper messages; agree on compact language/tone rules before applying them. Eric has not selected a final product voice. Preserve this as a future work item for the complete round; do not start the audit or silently rewrite other screens during intake.

### R46 — Multiple-movement AMRAP example

Screenshot 1 asks what this looks like with multiple movements. Retain a request to demonstrate both relevant Review and Workout states with multiple actual movements, including their order/prescriptions and scoring implications. The present single-Burpee example cannot establish that coverage. Do not fabricate a new example while intake is open.

### R47 — No generic AMRAP Review rest line

The Rest 60s line is crossed out in screenshot 1. Record its removal from AMRAP Review, parallel to the EMOM display request. Do not reinterpret this as changing actual clock/scoring behavior or dropping an intentional rest prescription elsewhere.

### R48 — AMRAP action width and order

Screenshot 2: Start AMRAP is full-width/responsive, at the bottom of the card below the movement and prescription. Screenshot 3: Finish early uses the same full-width placement below the prescription. Preserve the earlier action-above-coaching direction where coaching is present, without hiding the work. The EMOM-specific request for a secondary Pause action is not an instruction to replace AMRAP Finish early with Pause.

### R49 — Full-frame AMRAP timer

Screenshot 3 annotation 1 repeats the EMOM timer note: time should occupy the whole responsive framed area, not a narrow inner frame beside empty width. Resolve through the shared timer owner after intake, not a format-specific patch. Exact font sizing is not selected here.

### R50 — Running helper wording

Replace “Nothing to enter now. Record your rounds afterwards if you like.” with the requested wording “log when complete”. Casing and consistency with other action/helper text can be reconciled during the requested copy pass. Do not infer an optional-results policy from the old wording or change the underlying logging behavior from this copy request.

### R51 — Format-only badge and stable placement

Screenshot 4: the label should identify only the section's shape/format, e.g. AMRAP. Duration (8 minutes), rep-scheme and other prescription details belong outside the badge; move their meaning rather than discarding it. This revises earlier mixed-detail badge directions in R28/R30/R37 where they conflict.

Eric wants one consistent badge position across screens, rather than moving beside/below the title according to label length. His exact preference is short enough to stay in the “upper left”; if that cannot be guaranteed without truncation, place it under the title. Preserve that conditional choice for the next revision; do not silently substitute an earlier upper-right preference or treat an exact row arrangement as settled. No truncation is requested.

### R52 — Softer quantity-control geometry

Screenshot 5 marker 1 targets the rounds PLUS control, not the timer. Eric requests a less harsh corner/frame using the referenced menu control's geometry. His text calls the menu upper left while the screenshot shows it at upper right; preserve the intended geometry reference without inventing a different target. Explore matching geometry for the counter controls rather than selecting a new component shape during intake.

### R53 — Header timer/menu height alignment

Screenshot 5 marker 2 targets the global elapsed timer/menu pair. They should share height; the timer should be taller. Eric explicitly describes this as global. Keep this separate from R49's full-width section timer and from the quantity-control corner request.

### R54 — Prescription before results entry

Screenshot 5 marker 3 targets the Burpee name/prescription currently after the scoring controls. Move the movement/work information above Rounds completed. Keep planned work distinct from athlete-reported results.

### R55 — Group the result areas

Screenshot 5 marker 4 boxes the rounds and partial-round controls. Add deliberate grouping/separation/containment so the result UI is not a sequence of floating text lines. The exact visual container and relationship between these groups remain to be designed.

### R56 — Explore one framed quantity selector

Screenshot 6 annotation 2 asks to “entertain” minus/value/plus housed as one framed quantity-selection component. Record this as exploratory, not an approved component/API or permission to introduce a new abstraction before checking the existing controls. Apply any selected shared presentation to relevant counters while retaining their separate result meanings.

### R57 — Remove reset/clear controls

Screenshot 6 annotation 1 removes both Clear rounds and No partial round; users can tap down. Do not replace them with another clear-all action. During reconciliation, explicitly preserve or settle how zero, unreported and no partial round differ; removing a reset control does not authorize auto-recording zero or erasing existing data semantics.

### R58 — Align the completion readout

Screenshot 5 marker 5: Eric likes the completion-time direction, but the check makes the text misaligned. Explore another aligned arrangement. No replacement icon, exact composition or new completion wording is selected yet.

### Intake continuation

Continue collecting all formats and platform notes in this list until Eric explicitly closes intake. Keep R39–R44 and these R45–R58 notes alongside the earlier selected and superseded choices. The published preview/checklist remains the reviewed version; this local intake record is the current feedback source.


## For Time feedback intake — 2 November 2026

Source: Eric's three screenshots of For Time Review, a running attempt and a manually finished-under-cap attempt, plus his message that he is leaving the clock running separately to inspect natural timeout and will add that screen when complete. Accept these now; do not treat the format or intake round as finished. Reviewed application source remains a538f763dae6a491205469aa76386ad5205fef2c, hosted by 7832150c1370525a42a561603020a87e0060d04b. This inspection describes that source, not an independently verified newer production version.

### R59 — Carry badge simplification across to For Time

Screenshot 1 annotation 1 explicitly repeats the AMRAP notes. Apply R51's format-only badge and consistent placement to For Time: FOR TIME identifies the shape; the 15-minute cap is prescription detail outside it. Preserve the actual cap information. The same conditional placement preference remains unresolved; do not create another per-format location or infer additional unrelated AMRAP changes from this annotation.

### R60 — No generic For Time Review rest line

Screenshot 1 crosses out Rest 60s. Record removal of that line from this For Time Review presentation. Keep intentional prescribed work/rest and clock rules distinct; the annotation is not authority to alter the underlying exercise prescription or timer.

### R61 — Grouped and ladder For Time coverage

Screenshot 1 annotation 2 asks whether this shape can also be a ladder or a circuit-like group of movements trying to finish before the clock ends. Verified in the reviewed source: plain ForTimeBlock renders every block exercise in a movement list, not just the single Wall Ball in this fixture. A For Time block with a ladder rep scheme dispatches to LadderBlock; explicit ladder timing can also select that owner. A circuit-like grouping performed for time is a different clock/scoring contract from automatically selecting CircuitBlock, which remains the circuit structure owner.

Retain a request to show representative grouped/multiple-movement For Time and timed-ladder examples after intake. Source support is not proof that the current multi-movement display or repeated-round explanation is good. Do not claim this single-movement fixture establishes that coverage or implement a new format/taxonomy now.

### R62 — What Finish records, and the missing explicit work log

Screenshot 3 asks: “There's no way to log this work. Is it captured automatically?” Verified path in the source behind this preview:

- ForTimeBlock's Finish stamps the attempt's finish; forTimeOutcome supplies elapsedSeconds and completedUnderCap to the existing BlockPanel completion reporter.
- Reporting that outcome does not itself write a block_results row. The footer section-forward/Finish workout path calls completeSection, which saves the latest reported result through the shared writer.
- ForTimeMovement displays prescribed work; this view has no actual per-movement reps/load entry form. A timer result does not demonstrate the actual reps/load performed, especially when the cap is reached.
- This hosted comparison uses synthetic in-memory data; interaction is not proof of backend persistence.

Keep the owner question/request for a clear logging path and actual-work capture in the complete-round reconciliation. Exact fields, completion confirmation, cap/partial-work reporting and save/reopen behavior are open. Do not infer that every prescribed rep/weight should be auto-logged, or assume a new Log form/API has already been approved.

### R63 — Effort capture and possible use

Screenshot 3 also asks whether there is a way to record effort and whether it could be leveraged. In the reviewed source, BlockCompletionProvider passes perceivedEffort: null: this timed results path does not ask for effort. Existing block result storage still supports nullable perceived_effort, and conditioning.ts contains trend logic using recorded effort alongside completion. This establishes existing capability, not authorization to reinstate a scale, choose a new effort UI or change adaptive-training behavior.

Retain as an exploratory product/data question for the next reconciliation: what, if anything, should be collected, at what level, and how should it affect guidance. Keep historical 1–10 block effort and the separate categorical set-effort vocabulary distinct. Do not infer missing effort as low effort or default a value.

### R64 — Natural timeout evidence remains pending

Screenshot 2 shows the running For Time view without annotations. Preserve it as context only; do not turn its unmarked elements into accepted designs or new requested changes. Screenshot 3 is an early/manual finish at 00:03, not the natural cap end. Eric is leaving another clock running and will supply the naturally timed-out screen later. Keep that state review explicitly pending; do not change, restart or operate his running attempt, accelerate the timer or substitute a generated cap screenshot for his observation.


## Ladder, empty-state and Overview intake — 2 November 2026

Source: Eric's message describing timed-ladder action placement, Pause/Finish and end logging, plus five annotated screenshots: Ladder Review, lower live ladder, upper live ladder, expanded coaching/notes empty states and the Overview. Continue intake; Eric has not closed the round. The separate natural plain For Time timeout screen in R64 remains pending.

### R65 — Preserve the accepted Ladder Review layout

Screenshot 1 says “Otherwise this is excellent”; its only requested change is taking prescription out of the badge, consistent with R51/R59. Preserve the shown movement hierarchy, equipment placement and separation. Keep cap/duration and ladder prescription meaning outside the concise format label. Do not infer an exact final badge string or silently discard ascending/descending meaning where it matters. Visual acceptance does not claim every data/state variant has been verified or approve the entire prototype.

### R66 — Top action is the long-ladder exception

Because the ladder card can be long, place Start at the top or at least above the fold, below title and label and likely above prescription. This explicitly refines the earlier bottom-of-card Start direction for this case; retain the existing bottom placement request for other formats unless Eric changes it. Use a shared action slot rather than an isolated duplicate control. Eric did not request sticky positioning, duplicated Start controls or a global move of every format's action. Verify visibility at relevant phone sizes in the later preview without treating “above the fold” as an exact fixed pixel offset.

### R67 — Functioning timed-ladder clock

Screenshot 3 annotation 2 reports that there is no timer and asks for the same Start/stop behavior as other For Time work. Record the need for a real visible timed-ladder lifecycle and shared timer presentation, including reaching the prescribed cap. This is a user-observed gap, not a diagnosed root cause. Do not replace an actual clock with manual “Hit the time cap” self-reporting. Other ladder timing modes retain their own contracts; this note is about the shown For Time ladder.

### R68 — Secondary Pause and primary Finish

After Start, replace the Start action with two controls: secondary-styled Pause and primary-styled Finish. Keep the hierarchy explicit. Pause/resume wording, cap-time accounting while paused, reload/background behavior and exact responsive arrangement still need the later interaction contract; do not silently decide them during intake. This explicit ladder request does not automatically alter AMRAP's earlier Finish early direction.

### R69 — End-state logging for completed and incomplete ladders

When the timer expires naturally or Finish is pressed, prompt the user with log options rather than leaving only an outcome statement. For an incomplete ladder, collect how far they got. For a completed ladder, show all ladder rungs checked for them. In either case, include effort and basic logging options such as notes and weights for movements that have them.

This is an explicit requested direction for ladder results, extending the earlier exploratory effort discussion (R63) for this context. The exact effort vocabulary/scale, per-movement weight/unit handling, note scope, partial-rung representation and save/cancel/reopen behavior remain open. Distinguish completion from ending an attempt: the message discusses both completed and incomplete results when an attempt ends; do not assume every Finish press or timeout proves every rung was completed. All-rungs-checked is the completed-case log presentation, not authority to silently persist every prescribed rep/load as actual work. How the prefilled log can be edited and confirmed needs a later design decision; no specific mechanism is selected. Do not automatically extend this contract to every timed format or change adaptive progression now.

### R70 — Remove same every round suffix

Screenshots 2 and 3 cross out the repeated “— same every round” suffix. Remove that explanatory phrase wherever the shared ladder rung presentation adds it. Keep the actual companion movement quantity in each relevant round (e.g. 4 Burpee) and the prescribed repetition pattern; this is a copy cleanup, not a change in the work. Eric calls out this wording as feeling AI-added, which is relevant evidence for R45's copy audit rather than a finalized global tone rule.

### R71 — Remove the extra ladder instruction paragraph

Screenshot 2 annotation 2 crosses out the entire paragraph: “Move through the rounds at your own pace inside the cap. Nothing here moves on by itself — you say how far you got.” Remove it. Do not replace it with equally redundant explanatory prose. The nearby “How did this block end?” buttons are not themselves crossed out; reconcile their role with the requested real clock/end-log flow later rather than treating this annotation as a separate explicit removal of every adjacent control.

### R72 — Cleaner rung prescription notation

Screenshot 3 annotation 1 says the word “reps” between quantity and movement feels odd. Eric offers alternatives: omit it, or use a separator such as “x”/× or a dot. Preserve quantity, movement identity and the applicable unit meaning; the exact notation is not selected. Do not apply this as a blind platform-wide removal of units or change the already accepted Review prescription solely because this live-rung line is being simplified. Carry the wording concern into R45.

### R73 — Empty-state pass and rules

Screenshot 4 shows repeated “The library has no entry for this movement, so there are no cues or regression.” messages above independent movement notes. Eric says it may be worth a pass on empty states and rules. Record a prospective cross-platform empty-state review, with this as an example, rather than an approved replacement string/hide rule or a started audit. Distinguish missing coaching content from the user's still-available notes capability and from loading/error states. Whether these fixture movements reflect real catalog gaps requires later verification; do not diagnose or repair the movement catalog during intake.

### R74 — Overview visual acceptance

Screenshot 5 explicitly says this Overview is perfect and precisely envisioned. Record acceptance of the shown wrapping facts/icons, compact intensity, separator and Required equipment grouping, including the “None — bodyweight only” reading for this fixture. Preserve that visual treatment across its shared consumers. R33/R34's earlier first-pass selection-pending status is resolved by this acceptance for the shown Overview. Actual fact values, equipment truth and other existing data-contract questions still follow their owners; do not invent data from the screenshot or reopen the accepted appearance as undecided.
