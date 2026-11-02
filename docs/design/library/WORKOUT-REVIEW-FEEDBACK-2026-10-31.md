# Workout experience — consolidated refinement list

Updated 2 November 2026, America/Chicago. **Round 5 intake is closed and consolidated.** Eric accepted Sections 3 and 4, then explicitly ended intake and requested collection/preparation for another iteration centered on logging behavior and ladder tweaks. **24 items cover 100 source comments**, including R90–R96 refinements, R97/R98 acceptance and R99/R100 follow-up choices. Preserve reviewed package db59bf8 as the reference. Eric subsequently authorized another isolated comparison. Round 6 is implemented, locally verified and exact-package verified; hosted verification is pending. Primary requirements, production integration and Builder/Runner remain downstream. The Round 5 consolidation below governs older intake holds and superseded inline-placement statements.

North Star: gallery and app consume the same shared implementations. Design on an isolated branch using real components, review the coherent experience, then carry accepted component/state references through Requirements Builder, scoped implementation and UAT.

Reviewed [format preview](https://clear-efv8x002j-erics-projects-0ade0dda.vercel.app/workout-formats/FORMATS.html): application source `a538f763dae6a491205469aa76386ad5205fef2c`, hosting `7832150c1370525a42a561603020a87e0060d04b`; its current side is released baseline `94f2c2f3bf7e4d0eeb856d3716fd843f188e6fc2`, not a newly verified production head. Preserve this reviewed version; publish the next iteration separately.

## Single consolidated list

Accepted means the specific visual treatment Eric accepted. Refine means a requested proposal, not approval of its final implementation. Preserve existing data/behavior ownership unless a named decision changes it.

| # | Consolidated outcome | Disposition / shared owner | Source comments |
| --- | --- | --- | --- |
| 1 | Common movement hierarchy: prominent name, prescription/load, quiet equipment, aligned action slot; separators between peers, no inner vertical rail/final-item rule. Remove the added Last-performance row. | **Shown R5 shared movement treatment accepted (R97); no inner grouping rail (R75).** MovementIdentity/MovementList/MovementGroupHeader. Earlier equipment-beside-title placement is superseded. Shown Ladder Review accepted apart from its badge. | R02, R28, R30, R31, R37, R38, R65, R75, R97 |
| 2 | Review supplies Swap and static expanded headers; Workout supplies progress, Rest and logging. Keep planned work and consecutive group execution explicit. Omit the crossed-out generic Rest 60s lines in EMOM, AMRAP and For Time Review. Restore missing live prescribed load/equipment using existing formatters/units; suppress duplicate Bodyweight. | **Shown R5 Review/end-log examples accepted (R97); verify affected consumers during later integration.** Shared presentation slots, separate Review/live state owners. This does not remove all prescribed rest or planned sets/rounds from Review. | R30, R31, R37, R38, R41, R47, R60, R97 |
| 3 | Consistent format-badge location; format/shape only, with duration, cap, rounds and prescription outside. No length-driven jumping between positions or truncation. | **Shown below-title, format-only badge treatment accepted (R97), including LADDER.** Shared header/badge. Preserve the accepted location and truthful prescription outside it. Earlier mixed-detail, length-dependent and unconditional upper-right treatments are superseded. | R28, R37, R51, R59, R65, R97 |
| 4 | Preserve accepted Overview: wrapped facts/icons, intensity without of 10, deliberate Required equipment grouping, uppercase equipment names and truthful bodyweight-only state. Share with saved detail using each view's actual values. | **Shown treatment accepted.** SummaryFacts/EquipmentSummary. No carousel, hidden facts or invented full equipment-icon catalog. | R12, R20, R26, R27, R32, R33, R34, R74 |
| 5 | Responsive full-width timed actions below prescription/above coaching for EMOM and AMRAP. Long ladder exception: Start near the top, below title/badge, likely above prescription. Running EMOM has secondary Pause; running ladder has secondary Pause and primary Finish. | **Shown Start/Pause/Resume/Finish flows accepted (R98); preserve confirmed pause semantics.** Existing buttons/block slots. Retain format-specific Finish/Finish early wording within the shared lifecycle. Top placement does not imply sticky/duplicate controls or moving every format's actions. | R39, R48, R66, R68, R98 |
| 6 | Time occupies its whole frame. Header title, elapsed timer and menu align; timer text is centered within its frame, whose height matches the menu. Timed ladder needs a functioning visible clock, not only manual completion/cap declarations. Keep preparation/rest/section/overall clocks distinct. | **Clock behavior and shown end states accepted (R98); header alignment/centering still needs R96 refinement.** Shared timer presentation and actual clock owners; do not invent another clock to fix geometry. | R15, R17, R42, R49, R53, R67, R96, R98 |
| 7 | Explicit timed results: EMOM end Log action; ladder timeout/Finish prompts progress if incomplete, or all rungs marked complete when completed, plus effort, notes and applicable movement weights. Clarify For Time's implicit time/cap recording and actual-work log. | **A/simple log hierarchy selected for both Section 1 examples (R90). B/rep-first result tiles selected (R99), with round position secondary. Focused/modal logging is the preferred direction across all logs (R100); compare dialog versus rising bottom sheet while retaining the existing focused-panel reference (R81). Remove the rung-tile check glyphs (R92), preserving an understandable selected state and ordered behavior. Keep round labels, target numbers and units level across tiles (R93); Round may abbreviate to R if needed.** Reuse the existing three-face effort control (R76/R80). Selectable rungs, distinct round/rep labels and Complete/Incomplete behavior follow R77/R78, clarified by R87/R88 and confirmed by R89. EMOM omits a minutes-completed counter and assumes completion, with notes for exceptions (R84). Existing writers. Stopping does not prove completion; planned reps/load never silently become actuals. Reviewed fields and sample save/edit flows are accepted (R97/R98), subject to the recorded refinements. The next bottom-sheet proposal must show close/reopen, focus, save/confirmation and return-to-workout behavior together. | R43, R62, R63, R69, R76, R77, R78, R80, R81, R84, R86, R87, R88, R89, R90, R91, R92, R93, R97, R98, R99, R100 |
| 8 | AMRAP work/prescription before scoring. Group rounds/partial-round inputs; explore one framed minus/value/plus selector with softer menu-like corners. Remove Clear rounds/No partial round reset controls. Align completion check/time. | **Roomier framed-action counter selected (R79/R83) and shown shared controls accepted (R97).** Existing result/quantity owners. A/simple hierarchy is selected for AMRAP and Ladder (R90); the section-title versus Log results scale still needs refinement in context (R91). Preserve zero versus unreported. Screenshot marker 1 targets counter PLUS geometry; marker 2 separately targets header timer height. | R52, R54, R55, R56, R57, R58, R79, R83, R85, R90, R91, R97 |
| 9 | Concise ladder rungs: remove same every round suffixes and the crossed-out Move through the rounds… paragraph. Replace awkward quantity + reps + movement wording with omission or ×/· notation. Preserve targets, companion work and order. | **Add an at-a-glance ladder prescription: concise pattern summary (R94), preferably a compact round-by-round visual instead of the long expanded list (R95).** Keep movement names, progression, fixed companions, round count and cap truthful; shared presentation with read-only prescription behavior. Copy removals and clear notation remain retained. Do not blindly remove units from accepted Review prescriptions. | R65, R70, R71, R72, R77, R88, R94, R95 |
| 10 | Real matching Review/Workout examples for every format, including multi-movement EMOM/AMRAP/For Time, actual timed ladders, loaded/bodyweight cases and natural end/cap states. Ordinals indicate movement position; hiding a lone ordinal was not selected. | **Shown R5 format and flow examples accepted (R97/R98). Add the 12-round wrapping ladder and aligned two-digit tile content (R92/R93) next.** Preserve actual owner fixtures, loaded/multi-movement cases and labeled cap states. Earlier mislabeled fixtures and the unsupplied screenshot are history, not outstanding requests to repeat this review. | R38, R44, R46, R61, R64, R92, R93, R97, R98, R99, R100 |
| 11 | One bottom grouped Coaching and notes disclosure with labeled movement sections and independently owned guidance/notes/drafts/save/error behavior. | **Appearance accepted; preserve.** GroupExerciseCoaching/BlockPanel. Missing content belongs to item 21; do not remove notes or reopen the accepted disclosure layout. | R29, R36, R73 |
| 12 | Set/superset Save shows confirmation plus existing rest; at rest end collapse/reset without opening another form. Early manual collapse never causes reopening. Logging sheet uses phone height with complete frame, safe area and keyboard scrolling. Retain a platform-wide logging-consistency pass. | **Cross-application logging consistency is part of this refinement (R100), building on R82/R90/R91.** SetLoggingSheet/SetMeasurementRow/shared rest. Preserve deliberate entries, individual actuals and one rest clock. Inventory every log entry point, including anchor/other lifts, grouped/circuit work and timed results. Review one focused interaction pattern with logging during existing rest; compare the two overlay appearances. Preserve actual fields, drafts, save/correction and distinct rest/writer ownership. | R07, R16, R17, R82, R90, R91, R100 |
| 13 | Preserve circuit round recording/undo, active round time and round-time history; improve their visual grouping/hierarchy. | **Function retained; visual refinement open.** CircuitBlock. Shared appearance does not merge its scoring/controller into another format. | R18 |
| 14 | Warm-up/cooldown: concise title, approximate total time and movement-name list; no prose/custom warm-up title or per-movement weight/time. Shared preparation timer appearance, separate clock; no Dismiss or substitute hiding action. | **Shown warm-up appearance accepted; preserve.** PreparationGuide/existing timer. Approximate duration/counts are data, not screenshot constants; production guide-content contract stays open. | R01, R13, R14, R15, R36 |
| 15 | Regenerate follows all Review workout content, including cooldown. | **Retain.** Review ordering; regeneration behavior/persistent navigation unchanged by this placement request. | R05 |
| 16 | Generate emphasizes Goal/Focus; Focus is the accessible change action. Recovery is reached through focus choices without conflating session mode and movement focus. First/no-history session stays normal. Keep Generate title, unit fit and shared icon-only Back/destination; remove rejected Place/Notes helper lines. | **Retain latest proposal and semantics.** Generate/shared field/header owners. Detached Change focus and older equally prominent CTA alternatives are superseded. All five R10 subpoints remain covered. | R06, R10, R11, R21, R23, R25 |
| 17 | Setup title, step and progress pinned together, one divider above scrolling equipment content. | **Retain.** Screen/AppHeader/scroll slots; no bespoke sticky overlay. | R24 |
| 18 | History title has its own row, status/date beneath. Filters omit Rest days/Not started while keeping useful existing choices. | **Retain and verify.** History shared rows/filter. Remove options, not historical records/lifecycle meaning. | R08, R19 |
| 19 | Accessible adaptive-training/progress report based on authoritative observations and distinct future targets. | **Retained request; placement/content open.** Existing training/read-model owners. Not an approved route/metrics set or mandatory addition to this timed-format preview; return as a focused design decision. | R03 |
| 20 | Dedicated platform copy/terminology/tone pass. Visible labels say Effort, preserving historical values/meaning. Apply explicit removals and Log when complete wording. Remove annotated EMOM Not started/Work captions, retaining minute progress/Now/Next. | **Full copy audit requested; separate from immediate preview.** Short direct language is a first-pass direction, not a finalized voice guide. Numeric historical effort and categories are not interchangeable. | R09, R23, R40, R45, R50, R70, R71, R72 |
| 21 | Review empty states/rules, starting with repeated missing-coaching messages. Distinguish missing content, blank user notes, loading and failure; verify fixture/catalog identity before diagnosing catalog gaps. | **Exploratory pass; bounded next-preview proposal.** Existing empty/guidance/notes owners. No selected replacement/hiding rule; broader platform work stays visible separately. | R73 |
| 22 | Refine the clunky live section navigator without repeating active card identity; preserve position/status, section jumping and focus. | **Shown compact navigation accepted with the reviewed R5 flows (R98).** Preserve position/status, jump and focus behavior in affected contexts; unshown multi-section cases remain integration verification. | R35, R98 |
| 23 | Error frame/icon/accent share semantic error role across skins. | **Released via PR611.** ErrorView regression reference; completed Runner pilot is not restarted. | R22 |
| 24 | Load guidance in normal prescription position, clear units/per-hand meaning; no redundant Review Change weight for the verified circuit. Preserve prescribed target versus performed weight. | **Visual direction retained; range/read-model contract open.** Existing loadText/unit/data owners. Synthetic ranges are not approved production load logic; logging coverage is format-specific. | R04, R31 |

## Round 5 consolidation and next-round preparation — 2 November 2026

Eric closed intake. Sections 3 (shared corrections across all formats) and 4 (flow examples) are accepted as shown, carrying forward the specific Section 1/2 refinements rather than cancelling them.

| Area | Current disposition |
| --- | --- |
| Shared controls and reviewed flows | Accepted across the shown EMOM, AMRAP, For Time and Ladder examples. Retain the roomier framed-action counter, existing effort faces, one-row Complete/Incomplete, EMOM completion assumption without a minutes counter, pause semantics, ordered rung progress, partial next round, and sample save/edit behavior. |
| Log contents | A/simple hierarchy selected for both AMRAP and Ladder. Remove B's extra Result/Movements/Feedback grouping titles from that direction. |
| Logging space | Prepare focused/modal logging across the app using A's contents and existing owners (R100). Compare a dialog and a sheet rising from the bottom with the same preferred focus/background behavior. Appearance remains a visual choice; this is design scope rather than an approved production migration. |
| Logging behavior | Show Finish/cap → results entry → save/error/retry → confirmation → return/edit. Also show close without saving and reopening the same draft; distinguish draft, saved result and section completion. Preserve agreed timing/rest behavior. |
| Ladder prescription | Replace the long default per-round list with an at-a-glance compact visual of the actual round targets and all movements, including fixed companions. Concise pattern text can support it. Preserve round count/cap and the accepted Review layout. |
| Ladder result tiles | Remove tile tick glyphs; keep round label/number/unit rows level. Round → R is allowed for fit. Demonstrate 12 rounds, narrow widths and two-digit labels. Ordered completion is confirmed; B/rep-first emphasis is selected (R99), with round number visible as secondary context. |
| Heading and header hierarchy | Reconcile the smaller section title versus Log results, and align Workout title/timer/menu precisely with centered timer digits. Existing clocks and accepted behavior stay authoritative. |
| Platform consistency | Cross-application logging is now in the refinement scope (R100). Inventory and reconcile actual entry points, starting with anchor/other lifts, set/superset, circuit and timed logs; examine note writers in their actual context. Reuse shared entry/save/edit behavior and preserve data/rest responsibilities. Copy/empty-state/report work remains separately retained. |

**Preparation finding: existing logging has reusable behavior, not just reusable fields.** ExerciseSetLogger keeps drafts outside the displayed sheet so collapse/reopen preserves input. SupersetBlock uses the same sheet presentation for one round with separately owned movement entries. Rest is started through the existing Rest action; submitting a set/round saves and does not restart it. Circuit round recording/undo is distinct from its optional movement logger. ExerciseCoaching keeps independent movement-note writers and save/error feedback. These are source facts from the current owners, not a completed platform audit.

**A genuine interaction difference to resolve:** SetLoggingSheetOverlay is currently non-modal: it does not trap focus, make the background inert, dismiss on backdrop tap or answer Escape. The preserved timed-results AppDialog uses the public native modal dialog, which takes focus and makes the background inert. Calling both a sheet does not settle that behavior. Reuse/extend the appropriate owner after this choice is shown or answered; do not recreate a generic panel and accidentally change the accepted rest/draft contracts.

The preparation questions are answered: B/rep-first tiles are selected (R99). Eric leans toward focused/modal interaction and wants the logging pattern consistent across all logs, including rest-time entry for anchor and other lifts (R100). Compare dialog and rising-sheet appearances instead of asking him to choose the sci-fi feel abstractly. No further clarification is needed to define the review scope.

**Prepared next review:** one coherent results-sheet flow with A's form; a small comparison with the existing set/superset sheet to show shared behavior and deliberate differences; compact ladder prescriptions plus 12-round logging; the heading/header alignment fixes. Include loaded/bodyweight and partial/complete/capped examples, draft close/reopen, failed-save retry and edit-after-save. The published R5 package remains pinned. No new preview or production implementation is started in this consolidation turn.

## Next refinement checklist — current scope

1. **Logging across the application.** Inventory all logging entry points and reconcile them around one focused interaction pattern, including anchor/other lifts, grouped/circuit work and timed results. Keep their real fields and writers.
2. **Compare the two visual treatments.** Show a dialog and a sheet rising from the bottom with equivalent fields, draft/save behavior and preferred modal focus. Preserve CLEAR's framed, low-tech sci-fi/cyberpunk character through the existing type, shape and motion vocabulary.
3. **Logging during rest.** Use the existing anchor/lift rest-and-log flow as the reference. Keep the actual rest timer visible and running; opening, saving and closing must not create/restart another rest clock.
4. **Complete logging behavior and hierarchy.** Use A/simple contents. Show open → enter → close/reopen draft → save/error/retry → confirmation → edit, including correct return/focus. Reconcile section-title versus log-title hierarchy in context.
5. **Compact ladder prescription.** Replace the long default per-round list with a concise visual of each round's actual work, including every movement and fixed companion. Keep round count/cap and useful shorthand visible.
6. **Rep-first ladder result tiles.** Use B: reps prominent, round position secondary. Remove the tile ticks, keep label/target/unit rows aligned, allow Round → R for fit, and show 12 rounds/two-digit labels/narrow wrapping. Preserve ordered selection and partial-next-round entry.
7. **Shared workout header alignment.** Align Workout title, timer and menu precisely; center the timer digits within its frame using the existing clock.
8. **Verify the coherent review.** Exercise representative log contexts and all four timed families, loaded/bodyweight and complete/partial/capped cases, draft/retry/edit states, narrow fit, keyboard/focus, reduced motion and relevant skins. Preserve the accepted Section 3/4 controls and behavior.

The broader copy, empty-state and adaptive-report work remains tracked separately. Eric has authorized the next isolated visual comparison. This checklist governs Round 6; production integration remains downstream.

## Patterns and next refinements

**Put repeated visual decisions in shared presentation.** Header/badge positions, movement hierarchy, quantity frames, timers and result grouping should cascade. Minute schedules, AMRAP scores, race/cap outcomes, circuit rounds and ladder rungs keep distinct state owners. Shared variables alone do not enforce those contracts.

**Remove explanatory clutter while preserving work.** Move prescription out of badges; keep useful quantities/units/progress; remove the named redundant captions and prose. Preserve accepted Overview, warm-up, grouped coaching and Ladder Review appearance.

**Timed feedback adds behavior as well as polish.** Pause, a real ladder clock and prompted logging require an explicit interaction/data contract. Demonstrate actual controls and end states rather than implying behavior from new labels. Missing results/effort stay unreported; zero and completion are distinct observations.

**Keep the next revision coherent.** Focus on shared timed headers/actions, timer geometry, end logs, AMRAP result/counter alternatives, completion alignment, ladder readability and compact navigation. Carry Generate/setup/History/rest/logging decisions as regression checks. Full platform copy audit, broader empty-state rules and adaptive report remain on this list without silently becoming prerequisites for this preview.

## Round 4 closure — decisions and remaining assumptions

Eric closed intake after R88. No further abstract choice questionnaire is needed before a focused visual iteration.

| Review question | Disposition |
| --- | --- |
| Inline or focused log? | Inline selected for now; retain the focused version as a fallback reference, not a required user-facing switch. |
| Compact or roomier counter? | Roomier selected, with the existing framed pink action buttons in the Signal skin, using shared semantic roles. |
| Effort control? | Reuse the actual existing three-face selector across timed logs. |
| EMOM result quantity? | Remove the minutes-completed counter; assume completion and allow notes for exceptions. Keep optional effort and applicable weights. |
| Complete / Incomplete? | One row. Manual Finish before cap defaults Complete; timeout defaults Incomplete but remains correctable to Complete. |
| Ladder progress readability? | Selectable numbered tiles that wrap, with round position clearly distinct from prescribed reps. Exact tile hierarchy/selection feedback still needs a visual proposal. |
| Log title hierarchy? | Refine the relationship of the main title, groups, movements and field labels. Show alternatives for this unresolved visual choice instead of asking for abstract type/spacing decisions. |

**Confirmed interaction (R89):** Eric confirmed that ladder work is ordered. Selecting a completed rung records progress through it, including preceding rungs; partial work in the next rung remains separately enterable. This retains the existing prefix semantics. R88 clarified the meaning of the displayed numbers and did not confirm either arbitrary non-contiguous completion or a new storage model. Make this interaction visible in the next proposal so it can be assessed directly.

The inner grouping rail remains rejected. Keep the remaining shown layouts as the starting point; silence on a surface is not a new blanket approval. Production persistence, recovery and completion coordination still need technical follow-through after visual review; they are not unanswered owner preferences for this round. The platform logging, copy and empty-state passes remain separate retained work. This closure records the review result; it does not invoke Builder/Runner or authorize production integration.

## Confirmed decisions — 2 November 2026

Eric answered the timing and effort questions and clarified that a common log follows from the consistency goal; treating per-format segmentation as another owner decision was unnecessary. Proceed with the shared layout across all timed formats, keeping their result fields specific.

| Decision | Settled direction |
| --- | --- |
| Pause | Freeze section clock and cap; overall workout elapsed time continues. Resume preserves elapsed active time and remaining work window. |
| Timed end log | One shared results layout across EMOM, AMRAP, For Time and ladders, with format-specific results plus optional effort, notes and applicable movement weights. |
| Effort | Too easy / About right / Too hard through the existing three-face effort UI (R76), not a new text-button version. Keep this separate from prescribed Overview Intensity and historical numeric block effort. Do not invent a numeric conversion or alter progression implicitly. |

Proceed with the next isolated preview. Demonstrate incomplete versus fully completed work, editable results and explicit save/confirmation as a concrete first pass rather than asking Eric to design each detail abstractly. Later Requirements Builder/implementation must settle persistence for categorical block effort, movement weights and notes without pretending existing numeric block fields already support the new contract. The comparison's in-memory result adapter must be labeled and exercised honestly.

## Next review shape

Retain comparable actual Review/Workout owners for all families, multi-movement/loaded cases and meaningful ready/running/paused/completed/natural-cap states. Apply A/simple hierarchy and preserve the selected roomier control. Explore bottom-origin logging and the recorded ladder/header refinements from the latest consolidation; earlier inline placement is reopened. Do not reopen settled counter size or accepted field/clock behavior. Preserve accepted visuals and the phone-ready interactive flow.

Reuse semantic tokens, public components and real state/writer adapters with safe synthetic data. Label unsupported interactions. Verify actual renderer/state identity, narrow fit, relevant skins, focus/keyboard, reduced motion and existing logging/rest behavior as appropriate. These are practical checks, not a new gate framework.

After review, carry accepted canonical components/examples/consumers and behavior through the ordinary requirements/DAG workflow. Do not merge the entire broad V4 prototype or invoke Runner during this clarification pass.

## Source history

The [complete collection snapshot](archive/WORKOUT-REVIEW-R01-R74-2026-11-02.md) retains original wording, versions, inspection findings and dated dispositions. The [original R01–R23 notes](archive/WORKOUT-REVIEW-R01-R23-2026-10-30.md) preserve earlier subpoints. These are source evidence, not competing active checklists. This consolidated list governs present follow-through and superseded placements.


## Round 4 proposal — 2 November 2026

[Open the mobile visual review](https://clear-hb59rl1a1-erics-projects-0ade0dda.vercel.app/workout-review-r4/). Hosted package `c62294c`; shared application source `30735b1`. This is the pinned reviewed version. Inline logging and the roomier counter are now selected, subject to the recorded control/hierarchy corrections.

Branch: `codex/workout-review-r4-2026-11-02`. New review uses the same app-owned `TimedWorkoutFlow`, `TimedResultLog` and `QuantitySelector` registered in the gallery. It is enabled by the isolated comparison presentation; existing renderer routing remains the selection authority. Scheduled-start ladders retain their distinct existing owner.

Compare independent alternatives: **inline versus focused results panel**, and **compact versus roomier quantity frame**. Both logging locations use the same form, data and field rules. The panel uses the existing public Dialog adapter. The comparison also shows matched Review/Workout for the four timed families, multi-movement fixtures, a paused ladder, completed ladder, natural For Time cap and EMOM end. Explicitly requested copy removals, concise format-only badges, consistent placement, missing live load/equipment, header timer height and a simpler section navigator are represented. Missing coaching content is omitted in this proposal while notes and loading/error handling remain available.

The interaction adapter records complete synthetic receipts, including separate categorical effort, movement observations/actual weights and block notes; it supports save failure/retry and editing. The new categorical block feedback/measurements are **not mapped onto numeric historical effort or silently written through incompatible database fields**. Existing shell completion receives only compatible explicitly reported outcomes after a sample save. Production persistence, reload recovery of the proposed pause/result state, conditioning-history integration for the richer partial-result contract, and end-log/footer coordination must be carried through requirements after visual selection. The old domain implementations and observations remain available; this preview is not proof of a production migration.

Verification record is in the current journal and comparison evidence. All 100 source comments are covered by the 24-item list; the closure above distinguishes selected choices from remaining visual proposals.


## Round 4 Section 1 intake — R75 — 2 November 2026

**Intake only; keep the reviewed package c62294c fixed.** Source: Eric's message “notes for section 1, please just intake for now” and four annotated screenshots from the Round 4 review: Ladder, plain For Time, AMRAP and EMOM Review cards.

All four annotations reject the **extra inner vertical grouping line** beside the movement list. Eric describes it as out of the system/generic-library-looking and explicitly says he does not want it recommended again. This reinforces R28 and consolidated item 1; it is not a new alternative to debate or an invitation to find another use for that rail. Do not propose or reintroduce it for any of these format families. Use the selected hierarchy, spacing and between-peer horizontal separation to communicate grouping.

The marker targets the inner rule below the header, not the card's outer frame/accent; between-peer horizontal separators were not rejected in this message. Do not silently broaden this into removal of all card borders/rules. The four cropped screenshots omit the Baseline/Proposed pane headings; their collapsing headers, mixed-detail badges and inner rail correspond to the historical baseline treatment in this comparison. Preserve source labels and verify the actual pane/owner during reconciliation rather than claiming a newly diagnosed proposal regression from the crops. Historical current/baseline evidence is not a design recommendation; make that distinction clearer in the next review if needed, without rewriting the historical source to appear corrected.

Keep collecting the rest of the round. No logging/counter alternative is selected or rejected by these Section 1 notes, and earlier accepted visual choices remain accepted.


## Round 4 results intake — R76–R78 — 2 November 2026

Source: Eric's “intake notes” message and three annotated results-form screenshots. Keep intake open and the reviewed package c62294c fixed. These are corrections to the proposed controls; they do not select inline versus focused logging or compact versus roomier quantity alternatives.

### R76 — Reuse the existing three-face effort control

Eric: “We have a way that captures effort already, you’re reinventing things here. It’s three faces, just reuse that.” The text-only Too easy/About right/Too hard buttons in the proposal are rejected as a replacement UI. Use the existing face-based effort control and its established states/accessibility, checking SetEffortChoice/SetEffortReading in src/ui/set-effort.tsx first. The current proposal reused the existing choice values but re-created their visible presentation with text; reusing data alone does not satisfy the requested component reuse. Adapt the existing owner narrowly if its set-specific label/API needs a block-context name; do not create another effort control, new icons, scale or wording. Optional/unanswered effort and historical data meanings remain as previously established.

### R77 — Individual numbered rung tiles, responsive wrap

Eric reports that rungs cannot be selected individually and appear to select in pairs. He requests a layout like the Home streak tracker: numbered items in a horizontal row, wrapping responsively when more rungs cannot fit. Each rung must be clearly identifiable/selectable; the two-column checkbox list is not the desired presentation. R88 later clarifies that the apparent pair was the round number and its rep target, so do not treat this earlier observation as proof that the control selected two rungs per tap.

Read-only source finding: the current form stores highestRung and checks every rung number <= that value, so choosing a rung selects its preceding prefix; this is not caused merely by the two-column grid. R88 clarifies the label confusion, so a change to this prefix behavior is not yet established. Reuse the existing WeekStrip visual vocabulary and inspect LadderRungs' existing numbered frames before adding a primitive; do not import calendar/week state or force seven columns/days into a workout. Tiles must accommodate variable rung counts, retain selected/unselected and accessible labels, and wrap without clipping or horizontal overflow. R88 subsequently requires a clear visible distinction between round position and rep target; both must be understandable, rather than choosing one unexplained number. LadderRungs already supplies numbered frames, but its current OverflowRail scrolling does not meet the requested wrapping layout. Reuse its visual vocabulary and review the selection interaction in the next concrete proposal; Eric's wrapping request supersedes the older horizontal-scroll direction for this new log control.

The earlier note about a highestRung scalar losing gaps is conditional on selecting a non-contiguous completion model. R88 clarifies a label-reading issue and does not establish that model or require a migration. Preserve per-rung selectability and the existing data semantics while reviewing the next concrete interaction; do not create extra selection/storage complexity from the misread paired numbers. The source's prefix behavior remains a verified implementation fact, not a separately confirmed user request to change data models. No implementation/migration is started during intake.

### R78 — Complete / Incomplete in one row, with the right default

Rename All completed to **Complete** and Stopped short to **Incomplete**, side by side in a row. Manual Finish before the timer expires defaults to Complete. At timeout, Complete remains available so someone who finished the work but could not stop the timer soon enough can correct the outcome. This is editable log state, not authority to persist a completed result before Save.

Preserve Eric's rationale: “The only reason all complete should appear is if they weren’t able to stop the timer soon enough and this leaves the option to do so.” Read with his explicit rename/row/manual-default requests; do not invent a separate completion prompt or hide the selector on additional screens from that sentence alone. The shown shared Work completed question applies where full prescribed-work completion is meaningful (e.g. ladder/For Time); it does not add that question indiscriminately to AMRAP score or EMOM-minute collection. The earlier incomplete-at-cap starting state stays correctable; the clock itself does not know whether the athlete performed all work.


## Round 4 Section 2 intake — R79–R82 — 2 November 2026

Source: Eric's “notes for 2” message and three annotated screenshots: the framed round counter, effort controls, and B · Focused logging sheet. Intake remains open; keep package c62294c fixed while collecting the round.

### R79 — Keep the framed counter, restore the framed action buttons

Eric says the counter is close to what he pictured, but prefers the pink buttons from the last version and asks to retain those. Preserve the containing minus/value/plus frame and restore the established **framed action-button** treatment for +/−, rather than only bare glyphs. Pink refers to the demonstrated Signal skin's interaction treatment; use the existing semantic action roles/components across skins, not a hardcoded pink value. Keep R52's softer/menu-related corner direction in the reconciliation instead of blindly restoring an old harsh corner. This is positive feedback on the grouped counter plus a button-style correction, not selection of compact versus roomier proportions or blanket approval of all counter details. Do not restore removed Clear rounds/reset controls by inference.

### R80 — Same existing three-face effort control here

The effort screenshot says “Same notes here as the ladder.” Apply R76 to this AMRAP/shared results presentation too: reuse the existing actual three-face effort selector and its accessibility/optional state, not the new text-button presentation. This annotation targets effort; it does not apply ladder rung/Complete-Incomplete controls indiscriminately to AMRAP.

### R81 — Inline for now; preserve focused panel as fallback

Eric explicitly prefers **inline logging for now** and asks to save the focused-sheet version as a fallback. Record the location choice across the shared timed end-log layout; the form details still carry his other corrections and are not blanket-approved. Preserve the current focused-panel source and visual reference from this pinned package. Do not discard it, but do not infer a permanent user-facing toggle, new settings option or requirement to ship both modes. The retained fallback can be revisited during the broader logging-consistency review.

### R82 — Platform-wide logging-consistency pass

Eric explicitly requests a pass over logging across the platform because the current experience is inconsistent. Keep this as a durable follow-up alongside the copy and empty-state work, using the existing UI inventory/shared owners before proposing new controls. Compare actual entry/confirmation/edit/reopen patterns and their intended contexts; do not convert every set logger, results form or notes writer to inline solely from the current timed end-log preference. Preserve legitimate state/writer differences and existing accepted rest/logging behavior. The wider pass is requested work to reconcile after intake, not work to execute while this review remains in collection mode.


## Round 4 counter selection — R83 — 2 November 2026

Eric selected the **roomier counter** so it can accommodate the framed +/− buttons, with the supplied screenshot identifying that alternative. Read together with R79: retain the roomier unified outer frame, fit the established framed action buttons inside it, and keep the central value clear. In the demonstrated Signal skin those actions are pink; use semantic roles and existing components across skins. The disabled-minus appearance follows its real state, not a new permanent grey button treatment. This resolves the earlier compact/roomier size choice; it does not select the bare-glyph version shown in the roomier reference or reopen removed reset controls. Exact responsive fit should follow the shared control rather than copying screenshot pixels.

The request is clear; no clarification is needed. Intake remains open. Save the combined size/button direction for the next coherent revision; keep the reviewed preview fixed until Eric resumes work.


## Round 4 EMOM logging intake — R84 — 2 November 2026

Eric questions the purpose of a minutes-completed counter in EMOM logging and asks to remove it unless there is a good use case. His selected default is that the EMOM was complete; notes can capture deviations or other record-keeping detail. No established requirement in this design round justifies adding that numerical entry burden. Record removal of the **Minutes completed** logging counter rather than inventing a metric merely because the clock has minutes.

Keep the shared end-log layout with its meaningful optional effort, applicable movement weights and notes. EMOM completion does not need a replacement numeric counter, mandatory completion question or additional confirmation step. This refines the earlier general end-log request (R43/R69 and consolidated item 7); it does not remove EMOM's live minute/rotation progress or change its prescribed duration, Pause/Resume or clock behavior. Live schedule progress and a post-workout results-entry counter are different surfaces.

The default completion assumption is Eric's explicit product direction. It does **not** supply a measured minutes_completed value, actual rep total or load, nor justify silently filling every prescribed minute as an observed performance metric. Retain any existing historical minute values; settle the production completion/save mapping in requirements without creating new adaptive logic or claiming the timer measured actual work. Notes remain available for exceptions. Intake stays open and package c62294c remains fixed.


## Round 4 log hierarchy intake — R85 — 2 November 2026

Source: Eric's annotated inline AMRAP results screenshot. He says Log results seems too small and the nearby titles are all around the same size, awkwardly separated; he asks to explore hierarchy. He also explicitly says the form is otherwise functionally great.

Record a visual hierarchy refinement across **Log results → score/progress grouping → movement heading → field label**, including the relationship of Your score, Rounds completed, Burpee/Next round, Effort and Notes. Use the existing shared heading/text roles and spacing/grouping; do not solve this as a one-off font-size tweak or invent another typography scale. Exact sizes, weights, spacing and whether redundant intermediate headings such as Your score should be consolidated remain design options for the next coherent preview, not decisions already selected by the annotation. Preserve semantic headings and accessible field labels when simplifying visual titles.

Retain the positive functional feedback on the shown log workflow. It does not cancel R76/R80's effort-control correction, R79/R83's selected roomier framed-button counter, or other collected refinements, and it is not blanket approval of production persistence. Keep inline as the current preferred location and preserve the focused-panel fallback. Intake remains open; package c62294c stays fixed.


## Round 4 For Time flow intake — R86 — 2 November 2026

Eric identifies this as the For Time Start flow and says it is functionally good. His two screenshots show its result controls and repeat prior corrections: completion options should share one row (R78's Complete / Incomplete naming and defaults remain the shared direction), and effort should reuse the actual existing three-face selector (R76/R80), not the new text-button presentation. Apply these through the shared owners so this For Time consumer inherits the same pattern rather than receiving a separate one-off fix.

Retain the positive functional feedback on the exercised For Time flow. This is not a new request to change Start-button position, timer behavior, scoring, or the underlying meaning of completion. The screenshot's selected Too hard value is demonstration state, not a new default effort choice. Other recorded refinements and unresolved production persistence/coordination contracts remain intact. Intake stays open and reviewed package c62294c remains fixed.


## Round 4 Ladder clarification — R87–R88 — 2 November 2026

Source: three annotated Ladder screenshots. Continue intake with the current package c62294c fixed.

### R87 — Repeat completion-row and effort reuse for Ladder

The first two screenshots explicitly repeat the earlier notes for Ladder: Complete / Incomplete belong side by side, with the already recorded manual-finish default and timeout correction behavior; reuse the existing actual three-face effort control instead of text buttons. Apply through the same shared owners. These repeat established direction, not additional per-format components or a new effort scale.

### R88 — Clearly distinguish round position from reps on selectable rungs

Eric clarifies that he previously misread the pair of numbers and did not realize the second number was the rep target. He requests a clear distinction between **round number** and **prescribed reps**, and reiterates that the rung items need to be selectable. Labels such as Round 1 · 2 are insufficiently clear in the current presentation. Preserve both meanings in the visual hierarchy and accessible names; the exact layout, type hierarchy or wording is not selected here. Retain the requested wrapping numbered-tile direction from R77.

This clarification changes how the earlier “only pairs” observation should be interpreted: it may describe the two numbers printed on each item, not literally selecting two rungs per tap. The implementation's highestRung/prefix behavior was verified separately, but the notes do not establish a requirement for arbitrary non-contiguous rung combinations or a new storage model. Keep per-rung interaction understandable; resolve any remaining ordered-progress behavior from the next concrete preview rather than inventing selection semantics or a migration during intake. Earlier source wording remains retained with this clarification attached.


## Round 5 refinement — R89 — 2 November 2026

Eric confirmed the working assumption: selecting a completed ladder rung marks preceding rungs complete, with partial work in the next rung recorded separately. He explicitly requested continued refinement. This resolves the remaining interaction assumption; no non-contiguous completion model is needed.

The next isolated review applies the selected inline log, roomier framed-action counter, existing three-face effort control, paired Complete/Incomplete with editable defaults, and removal of the EMOM minutes counter. Two independent visual comparisons remain: simple versus grouped log hierarchy, and round-first versus rep-first wrapping ladder tiles. Both tile options use the same confirmed ordered progress. Preserve the pinned Round 4 review and focused-sheet fallback. Source branch: codex/workout-review-r5-2026-11-02. Publishing this refinement is an isolated preview, not production adoption or a Runner task.


## Round 5 hosted review — ready

[Open the visual refinement](https://clear-491hto4bx-erics-projects-0ade0dda.vercel.app/workout-review-r5/). Shared source f23fa6481b9665ea750e2a60dff5cb9c7e0dfb7f; hosted package db59bf8f9d28446fffdfa54a1609fd807c7fe1d0 on codex/workout-review-r5-2026-11-02. Deployment Cy8qRGzVRSgQfjogBokPTJzdUyYU is Ready (2m 28s). The previous pinned R4 package is unchanged.

Compare A simple versus B grouped log hierarchy, and A round-first versus B rep-first wrapping tiles. At publication, simple and round-first were recommended starting points. R90 subsequently selects the simple hierarchy for both Section 1 examples; the separate Section 2 tile-emphasis choice is not settled by that statement. Inline location, roomier framed-action counter, face effort, no EMOM counter and paired completion controls are applied rather than reopened. Both tile variants follow the confirmed ordered-progress behavior. The focused-sheet fallback remains linked under Preserved fallback.

Verified build/typecheck, design lint, 63 gallery entries, 7 browser flows, 19 visual cases, 8 narrow/four-skin cases, 4 built gallery owners and the exact packaged hub/log/fallback. Final axe violations/page errors/external requests are zero. Hosted hub images and a three-rung result with effort/notes were verified through the authenticated browser. Samples reset on reload; production persistence/recovery/history/footer contracts remain separate. Next action is owner visual review, not Builder/Runner or production adoption.


## Round 5 Section 1 intake — R90–R92 — 2 November 2026

Eric explicitly returned to intake mode. Source: his Section 1 log-hierarchy message and two annotated screenshots. Keep the pinned R5 package db59bf8 unchanged while collecting this round.

### R90 — A/simple hierarchy for both Section 1 examples; reinforce logging review

Eric prefers A for both AMRAP and Ladder in Section 1. This selects the simpler form hierarchy rather than B's additional Result/Movements/Feedback grouping titles. The supplied screenshots include grouped presentation, but his explicit A preference governs. “Both” refers to the two Section 1 examples, not the separate Section 2 ladder-tile alternatives. He again calls this evidence for reviewing logging across the platform; retain and reinforce consolidated item 12 rather than creating a competing audit.

### R91 — Reconsider inline logging and section-title hierarchy

The large Log results heading beneath the smaller Conditioning title feels odd. Eric is leaning toward larger section titles in general, but has not selected an exact shared type role, scale or platform-wide heading change. Preserve the mismatch as a context/hierarchy issue, not only a local font-size request.

He now thinks results logging may belong in a sheet/modal appearing from the bottom, separating the workout display from the focused act of logging, and explicitly requests our thoughts. This reopens the earlier inline preference. Record the leaning toward a bottom sheet/modal; do not silently make either inline or a specific sheet design a final production decision during intake. The preserved focused-sheet source is useful starting evidence, not automatic approval of its current geometry or a mandate to move every log surface.

Design response: a bottom sheet is a reasonable direction for section results because it gives the log its own hierarchy while preserving workout context. Review it through the existing shared dialog/sheet owners, with simple A form hierarchy, clear save/return behavior and draft preservation considered together. This is the assistant's assessment, not a new owner-approved contract. The wider logging pass should compare each actual logging purpose before applying the presentation broadly. Keep section-title scale as a separate shared hierarchy question.

### R92 — Remove rung-tile check glyphs; demonstrate 12 rounds

The marker targets the small tick on a selected ladder rung tile. Remove those rung-tile check glyphs; it does not request removal of the check on Complete, effort choices, saved confirmation or every shared Chip. The shown control is otherwise positively received. Keep meaningful selected/unselected feedback and accessible pressed state; a replacement visible cue can be explored without relying solely on color. Exact treatment is not selected by this note.

Eric asks what the layout looks like with 12 rounds. Add a genuine 12-round responsive wrapping example in the next authorized visual pass, including narrow widths and two-digit round labels. Do not manufacture a screenshot or rebuild during intake. The confirmed ordered progress and separate partial-next-round entry remain intact. Positive feedback on this shown round-first treatment is retained, while the separate Section 2 comparison is not declared fully reviewed.


## Round 5 Section 2 intake — R93–R96 — 2 November 2026

Source: Eric identifies this as Section 2 and supplies four annotated screenshots. His note about not scrolling before earlier comments does not withdraw those comments or the logging-review discussion. Intake remains open and reviewed R5 package db59bf8 stays fixed.

### R93 — Keep each tile's internal rows aligned

Round label, rep-target number and unit must stay level across neighboring tiles. Longer labels and two-digit round numbers must not wrap one cell's label and push its target/unit below its peers. Eric explicitly allows shortening Round to R if needed for fit; this is an allowed fallback, not a mandatory new label. Explore shared tile sizing/row alignment and responsive columns without sacrificing the distinct meanings of round position and rep target. Preserve full accessible labels. Include the already requested 12-round case (R92) in later verification.

The screenshot uses rep-first tiles, but this annotation requests alignment rather than explicitly selecting A or B for logging. Do not turn the screenshot alone into a tile-emphasis decision.

### R94 — Show the whole ladder prescription in concise form

The long per-round list makes it hard to understand the whole prescribed pattern and what each round contains without scrolling. Eric suggests a shorthand near the prescription, such as push-ups starting at 2 and increasing by 2 per round, with 4 burpees. Retain movement identity, actual progression, constant companion work, existing round count and cap so the block can be understood at a glance.

Use the actual sequence rather than inferring that every ladder is a simple linear progression. The sample shorthand is an example, not a fixed copy template for descending, pyramid or inverse ladders. This addresses the live workout prescription shown; it does not automatically replace the separately accepted Review movement layout.

### R95 — Prefer a compact visual of each round over the long list

Eric follows the shorthand idea with “Or better yet” and points to the round-first tiles as a visual way to show what is prescribed in every round. Record this as the preferred exploration for compact ladder prescription display, with shorthand still available as supporting context. It is not an additional requirement to show a full repetitive list beside a duplicate summary/grid.

Reuse the shared round/target visual vocabulary and truthful prescription data, while keeping prescription display read-only and results logging selectable. A prescription tile/group must make all movements understandable, including the fixed burpee companion; the example's ladder rep target alone is not the entire round's work. Exact composition is not selected during intake. Using a round-first visual as a prescription reference does not by itself settle the separate A/B emphasis choice for the log.

### R96 — Precisely align the workout header and center its timer

Eric reinforces alignment across the Workout title, elapsed timer frame and menu button, and asks that the timer text be centered in its frame. Retain the earlier shared header timer/menu height direction (R53), aligning the header elements and the digits horizontally/vertically within the frame. Treat this through the shared header/timer presentation rather than a ladder-only offset or another clock. No new timer semantics or navigation behavior is requested.


## Round 5 acceptance and intake closure — R97–R98 — 2 November 2026

### R97 — Section 3 shared corrections accepted

Eric says everything in Section 3 checks out. This covers the shown shared Review and end-log examples for all four timed formats, including format-only badges, movement hierarchy and the revised common controls. Retain R90–R96 as explicit refinements; the acceptance does not reverse the renewed sheet discussion, tick removal, compact prescription or header-alignment notes. It is acceptance of reviewed design examples, not proof of production persistence/integration.

### R98 — Section 4 flows accepted; prepare the next round

Eric also says Section 4 checks out, then explicitly clarifies that intake is complete and asks for consolidation/preparation focused on logging behavior and ladder tweaks. Retain the reviewed Start/Pause/Resume/Finish/cap/result/save/edit direction and confirmed time/completion rules. Prepare a concrete next iteration; this message requests findings and preparation before the next visual build. Current draft/data/persistence limitations remain recorded. The current consolidation governs older holds and publication-era choice descriptions.


## Follow-up choices — R99–R100 — 2 November 2026

### R99 — Select B/rep-first ladder result tiles

Eric selects B: the rep target should be largest because he counts toward the next set of reps; round number is useful secondary context. This resolves the Section 2 emphasis question. Keep all aligned-row, tick-removal, wrapping and 12-round refinements. A/simple form hierarchy remains selected separately; the two A/B comparisons mean different things.

### R100 — Focused logging across all logs; rest integration and overlay appearance

Eric leans toward the first interaction option: logging takes focus and background workout controls are unavailable while it is open. He explicitly wants a consistent pattern for all logs, including anchor and other lifts, with logging during their built-in rest as a model to reuse. Cross-application logging is therefore part of the next refinement, rather than a timed-only correction or an indefinitely deferred audit.

He identifies CLEAR's low-tech sci-fi/cyberpunk feel as the key appearance criterion and is unsure whether a dialog or a sheet rising from the bottom best expresses it. Prepare comparable visuals with the same focus/draft/save contract; geometry/entrance style remains open. This is a preferred behavior/design scope, not permission to silently change every writer or restart rest. Inspect actual entry points and reuse existing owners. The subsequent request asks for the concrete refinement work list; the checklist above records that scope.


## Requirements handoff and Round 6 coverage — in progress, 2 November 2026

Eric explicitly asked for a durable record so the refinements are not lost in chat. This file is the canonical decision/requirements source: the 24-item master list, R-number source history, closure/checklist and accepted-preview references govern the handoff. The project PLAN tracks delivery status; the journal records implementation findings and verification. An in-progress prototype is not silently promoted to an accepted decision.

When requirements are written, carry each active master item's source IDs, accepted component/example and version, behavior/field semantics, affected consumers, acceptance checks and any unresolved data contract. Preserve superseded directions as history, not competing current requirements. Keep distinct A/simple form hierarchy and B/rep-first tile emphasis explicit. Carry logging consistency across the following actual moments; do not scope the handoff to timed work.

| Logging moment | Current owner and responsibility | Round 6 comparison coverage |
| --- | --- | --- |
| Anchor/primary and other lift sets | ExerciseSetLogger / SetLoggingSheet; reps, load/unit, optional effort, actual observations; extra sets and warm-up flags remain owned here. | Same proposed LoggingOverlay around existing fields/writer; anchor, accessory, time and distance fixtures. |
| Correcting or clearing a saved set | ExerciseSetLogger correction mode and existing clear confirmation / observation mutation. | Enter, correct, cancel and clear recovery checks; preserve historical meaning and distinct destructive confirmation. |
| Superset/grouped round entry | SupersetRoundSheet; per-movement inclusion/actuals/effort with one round rest. | Shared overlay appearance; partial group entry and correction remain real owner behavior. |
| Circuit round record and undo | CircuitBlock / circuit state; observed round time/count and boundary rest. | Shared focused confirmation of the recorded boundary, actual circuit rest, and existing take-back action. No invented movement result from a round clock. |
| Circuit movement logging | ExerciseSetLogger under CircuitBlock; optional movement measurements, separate from round record. | Same entry surface as other set logs; no merger of those writers or clocks. |
| EMOM / AMRAP / For Time / Ladder results | TimedWorkoutFlow / TimedResultLog; format-specific result, effort/weights/notes with explicit sample save. | Both overlay treatments; accepted lifecycle and richer in-memory results retained. Production mapping/recovery remains separate. |
| Movement notes | ExerciseNotesField / useExerciseNotes; independent save/clear/error writer. | Both overlay treatments using actual note fields and writer; draft and failed-save text preserved. |
| Workout debrief | Summary Debrief / summary.saveDebrief; five-choice feeling and session note; Save and close returns Home. | Shared overlay; keep five-choice session feeling distinct from three-choice set effort. |
| Rest-day mark or reason change | Home RestDayControl / useMarkRestDay; recovery reason record. | Shared overlay for mark/change/save/cancel with the existing writer. |
| Saved result/history readback | SessionDetail/session-detail owners; existing observed values and historical scales. | Reference/readback coverage; do not turn old numeric effort into new categories or invent a new history-edit writer. |
| Planned load/anchor suggestion | Review/load-suggestion owner changes a target, not a performed observation. Actual anchor-lift results use the set logger above. | Accounted for in the inventory; preserve this distinction in requirements instead of presenting target edits as performance logs. |

The next comparison uses the actual shared owners with safe synthetic data, one modal focus contract, and two visual appearances (dialog / rising sheet). It is implemented and locally verified on codex/workout-review-r6-2026-11-02. Hosted-source identity will be appended after package verification; no production adoption or Builder/Runner is implied by this preparation.


## Round 6 local verification and shared-owner handoff — 2 November 2026

The authorized comparison implements the eight-item checklist with the same actual owners used in the app and gallery. LoggingOverlay is the smallest shared addition over AppDialog: existing set sheet geometry/interaction was non-modal, and the existing timed fallback did not provide both proposed appearances across all consumers. The addition owns modal geometry/header/close and reuses native Dialog focus, backdrop and exit plus the shipped stepped entrance for the sheet. Existing forms keep fields, drafts, rest clocks and writers. Consumers are SetLoggingSheet (anchor/other/extra/correction/grouped/circuit movement), TimedWorkoutFlow, ExerciseNotesField, Summary Debrief, Home RestDayControl, and CircuitBlock's recorded-boundary confirmation. The gallery registers LoggingOverlay and LadderPrescription alongside their app consumers.

Locally verified 36 interaction scenarios, 35 visual cases and 16 narrow/four-skin cases with zero final axe violations, page errors or external traffic. The six built gallery owners pass independently, the generated index verifies 65 entries, and build/typecheck/design lint pass. Existing set/group draft/rest/correction paths are preserved; partial grouped confirmation states that entries were logged rather than implying the entire round was completed. Session feeling stays five-choice; set/timed effort stays categorical three-face; stored Away remains the existing vacation reason. Reduced motion and native modal keyboard/Escape behavior are checked.

The shared header's 2.5px inline-meta descender offset was measured and removed: title, timer and menu share top/height, and digits center in the timer body. Compact ladder prescription is read-only and derives the actual sequence/companion work; rep-first result tiles remain ordered/selectable and wrap through 12 rounds with an explicit count instead of tile ticks. See evidence/workout-r6/VERIFICATION.json for exact owners, fixtures and checks. These implementation/evidence facts support the next visual review; they are not a new owner approval or production-persistence claim.
