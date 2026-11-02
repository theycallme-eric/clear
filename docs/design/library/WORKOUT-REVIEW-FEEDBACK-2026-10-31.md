# Workout experience — consolidated refinement list

Updated 2 November 2026, America/Chicago. **Round 4 intake is closed.** Eric asked whether his notes resolve the round's questions and assumptions. The main choices are settled; heading hierarchy and ladder tiles need a concrete visual refinement. Eric subsequently confirmed ordered ladder progress and resumed refinement (R89). **24 items cover 89 source comments**, including Round 4 notes R75–R88 and that confirmation. R-numbers are source references, not separate implementation tasks. The closure below governs current status; later dated intake-only statements preserve collection history. Preserve accepted choices and the pinned Round 4 preview as a reference.

North Star: gallery and app consume the same shared implementations. Design on an isolated branch using real components, review the coherent experience, then carry accepted component/state references through Requirements Builder, scoped implementation and UAT.

Reviewed [format preview](https://clear-efv8x002j-erics-projects-0ade0dda.vercel.app/workout-formats/FORMATS.html): application source `a538f763dae6a491205469aa76386ad5205fef2c`, hosting `7832150c1370525a42a561603020a87e0060d04b`; its current side is released baseline `94f2c2f3bf7e4d0eeb856d3716fd843f188e6fc2`, not a newly verified production head. Preserve this reviewed version; publish the next iteration separately.

## Single consolidated list

Accepted means the specific visual treatment Eric accepted. Refine means a requested proposal, not approval of its final implementation. Preserve existing data/behavior ownership unless a named decision changes it.

| # | Consolidated outcome | Disposition / shared owner | Source comments |
| --- | --- | --- | --- |
| 1 | Common movement hierarchy: prominent name, prescription/load, quiet equipment, aligned action slot; separators between peers, no inner vertical rail/final-item rule. Remove the added Last-performance row. | **Selected direction, reinforced by R75: never propose the inner grouping rail again.** MovementIdentity/MovementList/MovementGroupHeader. Earlier equipment-beside-title placement is superseded. Shown Ladder Review accepted apart from its badge. | R02, R28, R30, R31, R37, R38, R65, R75 |
| 2 | Review supplies Swap and static expanded headers; Workout supplies progress, Rest and logging. Keep planned work and consecutive group execution explicit. Omit the crossed-out generic Rest 60s lines in EMOM, AMRAP and For Time Review. Restore missing live prescribed load/equipment using existing formatters/units; suppress duplicate Bodyweight. | **Requested; verify consumers.** Shared presentation slots, separate Review/live state owners. This does not remove all prescribed rest or planned sets/rounds from Review. | R30, R31, R37, R38, R41, R47, R60 |
| 3 | Consistent format-badge location; format/shape only, with duration, cap, rounds and prescription outside. No length-driven jumping between positions or truncation. | **Refine.** Shared header/badge. Preserve upper-left preference; use below title if common beside-title fit cannot be guaranteed. A stable below-title row is a suitable first pass. Exact ladder label remains proposed. Supersedes mixed-detail badges and unconditional upper-right placement. | R28, R37, R51, R59, R65 |
| 4 | Preserve accepted Overview: wrapped facts/icons, intensity without of 10, deliberate Required equipment grouping, uppercase equipment names and truthful bodyweight-only state. Share with saved detail using each view's actual values. | **Shown treatment accepted.** SummaryFacts/EquipmentSummary. No carousel, hidden facts or invented full equipment-icon catalog. | R12, R20, R26, R27, R32, R33, R34, R74 |
| 5 | Responsive full-width timed actions below prescription/above coaching for EMOM and AMRAP. Long ladder exception: Start near the top, below title/badge, likely above prescription. Running EMOM has secondary Pause; running ladder has secondary Pause and primary Finish. | **Refine; pause semantics confirmed below.** Existing buttons/block slots. Retain format-specific Finish/Finish early wording within the shared lifecycle. Top placement does not imply sticky/duplicate controls or moving every format's actions. | R39, R48, R66, R68 |
| 6 | Time occupies its whole frame. Header elapsed timer grows to match adjacent menu height. Timed ladder needs a functioning visible clock, not only manual completion/cap declarations. Keep preparation/rest/section/overall clocks distinct. | **Refine.** Shared timer presentation and actual clock owners. Demonstrate running/paused/finished/capped states; do not invent another clock to fix geometry. | R15, R17, R42, R49, R53, R67 |
| 7 | Explicit timed results: EMOM end Log action; ladder timeout/Finish prompts progress if incomplete, or all rungs checked when completed, plus effort, notes and applicable movement weights. Clarify For Time's implicit time/cap recording and actual-work log. | **Inline end log preferred for now; preserve the focused panel as fallback (R81). Reuse the existing three-face effort control (R76/R80). Selectable rungs, distinct round/rep labels and Complete/Incomplete behavior follow R77/R78, clarified by R87/R88 and confirmed by R89. EMOM omits a minutes-completed counter and assumes completion, with notes for exceptions (R84).** Existing writers. Stopping does not prove completion; planned reps/load never silently become actuals. Detailed fields/save/reopen behavior need the interaction proposal. | R43, R62, R63, R69, R76, R77, R78, R80, R81, R84, R86, R87, R88, R89 |
| 8 | AMRAP work/prescription before scoring. Group rounds/partial-round inputs; explore one framed minus/value/plus selector with softer menu-like corners. Remove Clear rounds/No partial round reset controls. Align completion check/time. | **Roomier counter selected (R83), with the previous framed pink action buttons restored (R79).** Existing result/quantity owners. Completion-check and log-heading hierarchy refinements remain open (R85). Preserve zero versus unreported. Screenshot marker 1 targets counter PLUS geometry; marker 2 separately targets header timer height. | R52, R54, R55, R56, R57, R58, R79, R83, R85 |
| 9 | Concise ladder rungs: remove same every round suffixes and the crossed-out Move through the rounds… paragraph. Replace awkward quantity + reps + movement wording with omission or ×/· notation. Preserve targets, companion work and order. | **Copy removals requested; notation needs visual first pass.** Shared ladder presentation. Do not blindly remove units from accepted Review prescriptions. | R65, R70, R71, R72, R77, R88 |
| 10 | Real matching Review/Workout examples for every format, including multi-movement EMOM/AMRAP/For Time, actual timed ladders, loaded/bodyweight cases and natural end/cap states. Ordinals indicate movement position; hiding a lone ordinal was not selected. | **Next-review coverage.** Actual owner fixtures. Earlier mislabeled examples do not count. Natural plain For Time cap screenshot was not supplied before closure; reproduce/inspect that state in the next pass rather than wait for another upload. | R38, R44, R46, R61, R64 |
| 11 | One bottom grouped Coaching and notes disclosure with labeled movement sections and independently owned guidance/notes/drafts/save/error behavior. | **Appearance accepted; preserve.** GroupExerciseCoaching/BlockPanel. Missing content belongs to item 21; do not remove notes or reopen the accepted disclosure layout. | R29, R36, R73 |
| 12 | Set/superset Save shows confirmation plus existing rest; at rest end collapse/reset without opening another form. Early manual collapse never causes reopening. Logging sheet uses phone height with complete frame, safe area and keyboard scrolling. Retain a platform-wide logging-consistency pass. | **Retain and verify; logging-consistency pass requested (R82).** SetLoggingSheet/SetMeasurementRow/shared rest. Preserve deliberate entries, individual actuals and one rest clock. Inline preference for the reviewed timed end log does not select a blanket replacement of all existing logging surfaces. | R07, R16, R17, R82 |
| 13 | Preserve circuit round recording/undo, active round time and round-time history; improve their visual grouping/hierarchy. | **Function retained; visual refinement open.** CircuitBlock. Shared appearance does not merge its scoring/controller into another format. | R18 |
| 14 | Warm-up/cooldown: concise title, approximate total time and movement-name list; no prose/custom warm-up title or per-movement weight/time. Shared preparation timer appearance, separate clock; no Dismiss or substitute hiding action. | **Shown warm-up appearance accepted; preserve.** PreparationGuide/existing timer. Approximate duration/counts are data, not screenshot constants; production guide-content contract stays open. | R01, R13, R14, R15, R36 |
| 15 | Regenerate follows all Review workout content, including cooldown. | **Retain.** Review ordering; regeneration behavior/persistent navigation unchanged by this placement request. | R05 |
| 16 | Generate emphasizes Goal/Focus; Focus is the accessible change action. Recovery is reached through focus choices without conflating session mode and movement focus. First/no-history session stays normal. Keep Generate title, unit fit and shared icon-only Back/destination; remove rejected Place/Notes helper lines. | **Retain latest proposal and semantics.** Generate/shared field/header owners. Detached Change focus and older equally prominent CTA alternatives are superseded. All five R10 subpoints remain covered. | R06, R10, R11, R21, R23, R25 |
| 17 | Setup title, step and progress pinned together, one divider above scrolling equipment content. | **Retain.** Screen/AppHeader/scroll slots; no bespoke sticky overlay. | R24 |
| 18 | History title has its own row, status/date beneath. Filters omit Rest days/Not started while keeping useful existing choices. | **Retain and verify.** History shared rows/filter. Remove options, not historical records/lifecycle meaning. | R08, R19 |
| 19 | Accessible adaptive-training/progress report based on authoritative observations and distinct future targets. | **Retained request; placement/content open.** Existing training/read-model owners. Not an approved route/metrics set or mandatory addition to this timed-format preview; return as a focused design decision. | R03 |
| 20 | Dedicated platform copy/terminology/tone pass. Visible labels say Effort, preserving historical values/meaning. Apply explicit removals and Log when complete wording. Remove annotated EMOM Not started/Work captions, retaining minute progress/Now/Next. | **Full copy audit requested; separate from immediate preview.** Short direct language is a first-pass direction, not a finalized voice guide. Numeric historical effort and categories are not interchangeable. | R09, R23, R40, R45, R50, R70, R71, R72 |
| 21 | Review empty states/rules, starting with repeated missing-coaching messages. Distinguish missing content, blank user notes, loading and failure; verify fixture/catalog identity before diagnosing catalog gaps. | **Exploratory pass; bounded next-preview proposal.** Existing empty/guidance/notes owners. No selected replacement/hiding rule; broader platform work stays visible separately. | R73 |
| 22 | Refine the clunky live section navigator without repeating active card identity; preserve position/status, section jumping and focus. | **First pass exists; selection open.** SectionHeader compact variant/existing jump owner. Show in context. | R35 |
| 23 | Error frame/icon/accent share semantic error role across skins. | **Released via PR611.** ErrorView regression reference; completed Runner pilot is not restarted. | R22 |
| 24 | Load guidance in normal prescription position, clear units/per-hand meaning; no redundant Review Change weight for the verified circuit. Preserve prescribed target versus performed weight. | **Visual direction retained; range/read-model contract open.** Existing loadText/unit/data owners. Synthetic ranges are not approved production load logic; logging coverage is format-specific. | R04, R31 |

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

Retain comparable actual Review/Workout owners for all families, multi-movement/loaded cases and meaningful ready/running/paused/completed/natural-cap states. Apply the selected inline/roomier directions and shared-control corrections. Focus comparison options on log-heading hierarchy and ladder tile readability/interaction; do not reopen the settled logging-location or counter-size choices. Preserve accepted visuals and the phone-ready interactive flow.

Reuse semantic tokens, public components and real state/writer adapters with safe synthetic data. Label unsupported interactions. Verify actual renderer/state identity, narrow fit, relevant skins, focus/keyboard, reduced motion and existing logging/rest behavior as appropriate. These are practical checks, not a new gate framework.

After review, carry accepted canonical components/examples/consumers and behavior through the ordinary requirements/DAG workflow. Do not merge the entire broad V4 prototype or invoke Runner during this clarification pass.

## Source history

The [complete collection snapshot](archive/WORKOUT-REVIEW-R01-R74-2026-11-02.md) retains original wording, versions, inspection findings and dated dispositions. The [original R01–R23 notes](archive/WORKOUT-REVIEW-R01-R23-2026-10-30.md) preserve earlier subpoints. These are source evidence, not competing active checklists. This consolidated list governs present follow-through and superseded placements.


## Round 4 proposal — 2 November 2026

[Open the mobile visual review](https://clear-hb59rl1a1-erics-projects-0ade0dda.vercel.app/workout-review-r4/). Hosted package `c62294c`; shared application source `30735b1`. This is the pinned reviewed version. Inline logging and the roomier counter are now selected, subject to the recorded control/hierarchy corrections.

Branch: `codex/workout-review-r4-2026-11-02`. New review uses the same app-owned `TimedWorkoutFlow`, `TimedResultLog` and `QuantitySelector` registered in the gallery. It is enabled by the isolated comparison presentation; existing renderer routing remains the selection authority. Scheduled-start ladders retain their distinct existing owner.

Compare independent alternatives: **inline versus focused results panel**, and **compact versus roomier quantity frame**. Both logging locations use the same form, data and field rules. The panel uses the existing public Dialog adapter. The comparison also shows matched Review/Workout for the four timed families, multi-movement fixtures, a paused ladder, completed ladder, natural For Time cap and EMOM end. Explicitly requested copy removals, concise format-only badges, consistent placement, missing live load/equipment, header timer height and a simpler section navigator are represented. Missing coaching content is omitted in this proposal while notes and loading/error handling remain available.

The interaction adapter records complete synthetic receipts, including separate categorical effort, movement observations/actual weights and block notes; it supports save failure/retry and editing. The new categorical block feedback/measurements are **not mapped onto numeric historical effort or silently written through incompatible database fields**. Existing shell completion receives only compatible explicitly reported outcomes after a sample save. Production persistence, reload recovery of the proposed pause/result state, conditioning-history integration for the richer partial-result contract, and end-log/footer coordination must be carried through requirements after visual selection. The old domain implementations and observations remain available; this preview is not proof of a production migration.

Verification record is in the current journal and comparison evidence. All 89 source comments are covered by the 24-item list; the closure above distinguishes selected choices from remaining visual proposals.


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

Compare A simple versus B grouped log hierarchy, and A round-first versus B rep-first wrapping tiles. Simple and round-first are recommended starting points, not owner selections yet. Inline location, roomier framed-action counter, face effort, no EMOM counter and paired completion controls are applied rather than reopened. Both tile variants follow the confirmed ordered-progress behavior. The focused-sheet fallback remains linked under Preserved fallback.

Verified build/typecheck, design lint, 63 gallery entries, 7 browser flows, 19 visual cases, 8 narrow/four-skin cases, 4 built gallery owners and the exact packaged hub/log/fallback. Final axe violations/page errors/external requests are zero. Hosted hub images and a three-rung result with effort/notes were verified through the authenticated browser. Samples reset on reload; production persistence/recovery/history/footer contracts remain separate. Next action is owner visual review, not Builder/Runner or production adoption.
