# Workout experience — consolidated refinement list

Updated 2 November 2026, America/Chicago. **Round 4 intake is open.** Eric explicitly requested notes only for Section 1 and subsequent review feedback until he resumes work. Save feedback; do not revise/rebuild/publish the reviewed preview, change primary requirements or invoke Builder/Runner during this collection round. The preceding round is consolidated below: **24 items now cover 83 source comments**, including Round 4 notes R75–R83. R-numbers are source references, not separate implementation tasks. Preserve accepted choices; replace superseded directions rather than applying every historical note literally.

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
| 7 | Explicit timed results: EMOM end Log action; ladder timeout/Finish prompts progress if incomplete, or all rungs checked when completed, plus effort, notes and applicable movement weights. Clarify For Time's implicit time/cap recording and actual-work log. | **Inline end log preferred for now; preserve the focused panel as fallback (R81). Reuse the existing three-face effort control (R76/R80). Individual rung selection and Complete/Incomplete behavior follow R77/R78.** Existing writers. Stopping does not prove completion; planned reps/load never silently become actuals. Detailed fields/save/reopen behavior need the interaction proposal. | R43, R62, R63, R69, R76, R77, R78, R80, R81 |
| 8 | AMRAP work/prescription before scoring. Group rounds/partial-round inputs; explore one framed minus/value/plus selector with softer menu-like corners. Remove Clear rounds/No partial round reset controls. Align completion check/time. | **Roomier counter selected (R83), with the previous framed pink action buttons restored (R79).** Existing result/quantity owners. Completion-check refinements remain open. Preserve zero versus unreported. Screenshot marker 1 targets counter PLUS geometry; marker 2 separately targets header timer height. | R52, R54, R55, R56, R57, R58, R79, R83 |
| 9 | Concise ladder rungs: remove same every round suffixes and the crossed-out Move through the rounds… paragraph. Replace awkward quantity + reps + movement wording with omission or ×/· notation. Preserve targets, companion work and order. | **Copy removals requested; notation needs visual first pass.** Shared ladder presentation. Do not blindly remove units from accepted Review prescriptions. | R65, R70, R71, R72, R77 |
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

## Confirmed decisions — 2 November 2026

Eric answered the timing and effort questions and clarified that a common log follows from the consistency goal; treating per-format segmentation as another owner decision was unnecessary. Proceed with the shared layout across all timed formats, keeping their result fields specific.

| Decision | Settled direction |
| --- | --- |
| Pause | Freeze section clock and cap; overall workout elapsed time continues. Resume preserves elapsed active time and remaining work window. |
| Timed end log | One shared results layout across EMOM, AMRAP, For Time and ladders, with format-specific results plus optional effort, notes and applicable movement weights. |
| Effort | Too easy / About right / Too hard through the existing three-face effort UI (R76), not a new text-button version. Keep this separate from prescribed Overview Intensity and historical numeric block effort. Do not invent a numeric conversion or alter progression implicitly. |

Proceed with the next isolated preview. Demonstrate incomplete versus fully completed work, editable results and explicit save/confirmation as a concrete first pass rather than asking Eric to design each detail abstractly. Later Requirements Builder/implementation must settle persistence for categorical block effort, movement weights and notes without pretending existing numeric block fields already support the new contract. The comparison's in-memory result adapter must be labeled and exercised honestly.

## Next review shape

Use comparable actual Review/Workout owners for all families, multi-movement/loaded cases and meaningful ready/running/paused/completed/natural-cap states. Provide phone-ready interactive Start → Pause/Resume → Finish/cap → results examples, with screenshots for quick comparison. Preserve accepted visuals. Show AMRAP quantity/completion alternatives and compact navigation in context.

Reuse semantic tokens, public components and real state/writer adapters with safe synthetic data. Label unsupported interactions. Verify actual renderer/state identity, narrow fit, relevant skins, focus/keyboard, reduced motion and existing logging/rest behavior as appropriate. These are practical checks, not a new gate framework.

After review, carry accepted canonical components/examples/consumers and behavior through the ordinary requirements/DAG workflow. Do not merge the entire broad V4 prototype or invoke Runner during this clarification pass.

## Source history

The [complete collection snapshot](archive/WORKOUT-REVIEW-R01-R74-2026-11-02.md) retains original wording, versions, inspection findings and dated dispositions. The [original R01–R23 notes](archive/WORKOUT-REVIEW-R01-R23-2026-10-30.md) preserve earlier subpoints. These are source evidence, not competing active checklists. This consolidated list governs present follow-through and superseded placements.


## Round 4 proposal — 2 November 2026

[Open the mobile visual review](https://clear-hb59rl1a1-erics-projects-0ade0dda.vercel.app/workout-review-r4/). Hosted package `c62294c`; shared application source `30735b1`. Alternatives await owner selection.

Branch: `codex/workout-review-r4-2026-11-02`. New review uses the same app-owned `TimedWorkoutFlow`, `TimedResultLog` and `QuantitySelector` registered in the gallery. It is enabled by the isolated comparison presentation; existing renderer routing remains the selection authority. Scheduled-start ladders retain their distinct existing owner.

Compare independent alternatives: **inline versus focused results panel**, and **compact versus roomier quantity frame**. Both logging locations use the same form, data and field rules. The panel uses the existing public Dialog adapter. The comparison also shows matched Review/Workout for the four timed families, multi-movement fixtures, a paused ladder, completed ladder, natural For Time cap and EMOM end. Explicitly requested copy removals, concise format-only badges, consistent placement, missing live load/equipment, header timer height and a simpler section navigator are represented. Missing coaching content is omitted in this proposal while notes and loading/error handling remain available.

The interaction adapter records complete synthetic receipts, including separate categorical effort, movement observations/actual weights and block notes; it supports save failure/retry and editing. The new categorical block feedback/measurements are **not mapped onto numeric historical effort or silently written through incompatible database fields**. Existing shell completion receives only compatible explicitly reported outcomes after a sample save. Production persistence, reload recovery of the proposed pause/result state, conditioning-history integration for the richer partial-result contract, and end-log/footer coordination must be carried through requirements after visual selection. The old domain implementations and observations remain available; this preview is not proof of a production migration.

Verification record is in the current journal and comparison evidence. All 83 source comments are covered by the 24-item list; alternatives remain proposals until reviewed.


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

Eric reports that rungs cannot be selected individually and appear to select in pairs. He requests a layout like the Home streak tracker: numbered items in a horizontal row, wrapping responsively when more rungs cannot fit. Each rung must be independently selectable; the two-column checkbox list is not the desired presentation.

Read-only source finding: the current form stores highestRung and checks every rung number <= that value, so choosing a rung selects its preceding prefix; this is not caused merely by the two-column grid. The request rejects that forced linked-selection interaction. Reuse the existing WeekStrip visual vocabulary and inspect LadderRungs' existing numbered frames before adding a primitive; do not import calendar/week state or force seven columns/days into a workout. Tiles must accommodate variable rung counts, retain selected/unselected and accessible labels, and wrap without clipping or horizontal overflow. The exact visible number (rung position versus prescribed target) is not explicitly chosen by this message; preserve both meanings in the next proposal/accessibility rather than silently conflating them. LadderRungs already supplies numbered frames, but its current radio/highest-reached selection and OverflowRail scrolling are not a drop-in implementation of independent selection plus wrapping. Reuse its visual vocabulary and reconcile the shared interaction; Eric's wrapping request supersedes the older horizontal-scroll direction for this new log control.

Independent rung observations cannot be losslessly represented by the current single highestRung scalar when there are gaps. Retain that persistence/read-model consequence for requirements after design selection; do not silently collapse selections or erase legacy highest-rung results. No implementation/migration is started during intake.

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
