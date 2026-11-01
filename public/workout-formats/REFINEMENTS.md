# CLEAR workout refinement checklist — R3

Canonical running list: docs/design/library/WORKOUT-REVIEW-FEEDBACK-2026-10-31.md. Original R01–R23 detail is preserved in docs/design/library/archive/WORKOUT-REVIEW-R01-R23-2026-10-30.md. This is a generated review copy of that one list.

Goal: one shared visual library consumed by the actual screens. Previewed means visible in a design branch, not released or blanket approval. Warm-up appearance and grouped coaching are accepted; new equipment/icon/navigation treatments need visual review. Data contracts for guides, ranges, report and setup defaults remain open.

After visual selection: reconcile approved components/examples and all active feedback into Requirements Builder, then a scoped implementation and UAT. Do not treat this multi-area prototype branch as the implementation task.

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
