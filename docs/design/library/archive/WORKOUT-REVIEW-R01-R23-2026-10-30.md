# Historical owner feedback R01–R23

Preserved verbatim from `workout-quality-review/v4-requirements/PREVIEW_REVIEW_NOTES.md` on 1 November 2026. This is source evidence for the current running list. Dated pauses, intake-only statements, localhost links and older placements below describe their original rounds; they do not override later owner instructions. R28/R30/R37 supersede the earlier equipment/title and Review header arrangements where they conflict. Use [the current feedback index](../WORKOUT-REVIEW-FEEDBACK-2026-10-31.md) for present dispositions.

---

# V4 preview owner feedback

**Latest full review —30 October:** [All seven comparison areas](http://127.0.0.1:8788/) are available together in the [full source/coverage packet](previews/2026-10-30-full-review/README.md), based on mainba19701. Eric requested this complete pass after R21–R23 intake; those notes are represented as proposals, not approvals. Collect whole-round feedback before the next revision. Older dated intake/capture dispositions remain historical.


**Active intake —30 October, Generate library pilot:** collect screenshots/dictation only until Eric closes the round. Current reviewed proposal is `4836764` against released source `14acb2c`, served on8787. Do not change the preview, product code or primary requirements during this intake. Earlier dated rounds retain their own sources.


**Owner resumed —30 October:** Eric authorized the library-based reconciliation and focused comparison. See [the new pilot](previews/2026-10-30-library-pilot/README.md). All R01–R20 remain intact; no overall visual approval is inferred.

**Historical owner pause —29 October:** intake/preview refinement is paused. Older UI remains in the comparison; no final experience/regression approval is implied. Keep all R01–R20 feedback. Resume only on owner direction, beginning with actual final UI-source reconciliation.

**Round-two intake is reconciled.** Eric subsequently authorized another pass (“figured you'd just take a stab, go for it”). R10–R20 now inform primary BRIEF §3.3/3.5 and the [third-pass reconciliation](previews/2026-10-29-round-03/ROUND_03_RECONCILIATION.md). The intake-only dispositions below preserve their original timing; they are not an ongoing stop after that authorization. Third-pass visual approval remains pending.

29 October 2026, America/Chicago. **Round-one feedback collection complete.** Nine entries R01–R09; Eric closed the round. Reconciled owner direction is in BRIEF §3.3/3.5; [round-two dispositions and UI overlap](previews/2026-10-29-round-02/ROUND_02_RECONCILIATION.md) preserve what remains open. The dated collection dispositions below describe when each comment was received, not a later approval of the entire packet.

Eric's direction: collect comments during this review, then reconcile them with the UI work in flight and make another preview pass when the review is finished. Do not revise the running comparisons after each comment. The current panes remain the frozen `ac04390` first pass; they do not automatically reflect later or unmerged UI work.

This log feeds the [comparison checklist](PREVIEW_COMPARISON_CHECKLIST.md) and [frontend change list](FRONTEND_CHANGE_LIST.md). Reconcile decisions into [BRIEF.md](BRIEF.md) after collection; Builder remains NOT READY.

## R01 — Warm-up: movement list, not prose

- **Affected:** F09; P04 preparation, and its corresponding warm-up presentation in P03 Review.
- **Source:** Eric's review of the “Prepare for the press” paragraph screenshot in this chat, 29 October 2026: “I'd rather it be a list of movements without anything extra prescriptions like weight or time than a paragraph. I'm not going to read that, it's not helpful.”
- **Requested presentation:** title “Warm-up” with an approximate total time, then movement names on separate lines. No explanatory paragraph or individual movement prescriptions, including weight or time. Retain relevant movement selection; make the result glanceable.
- **Owner's illustrative shape:**

  ```text
  Warm-up · total time ~4 minutes
  Movement 1
  Movement 2
  Movement 3
  ```

- **Bounds:** four minutes and three rows illustrate the presentation, not a fixed duration or required movement count. This comment concerns warm-up; it does not settle cooldown presentation or the optional timer behavior.
- **Owner reinforcement, active-workout screenshot:** Eric reiterates that the paragraph is too wordy and the custom “Prepare for the press” title is unwanted: “just have it be warm up still”. Use the existing **Warm-up** label, approximate total duration and movement-name list in both Review and the active workout; no generated custom title or explanatory paragraph. This is the same R01 correction, not a new feature or a reason to change timer controls.
- **Disposition:** owner direction collected; preview and primary-brief reconciliation deferred until the review is complete. The first-pass paragraph remains visible for review history, not as an approved design.

## R02 — Review lift card: equipment beside title; remove last-performance row

- **Affected:** F06; P03 Review lifting targets.
- **Source:** Eric's annotated Bench Press screenshot and accompanying comment, 29 October 2026. Annotation 1 moves “Barbell” next to the movement title. Annotation 2 crosses out the “Last: 95 lb · 5 / 5 / 5 · 25 Oct” row as clutter.
- **Requested presentation:** show the equipment label alongside the movement title, rather than on a separate line below the prescription. Keep the current prescribed weight in the prescription; remove the added last-performance/date row from this card.
- **Reason:** the current target is sufficient in this workout context. Progress remains interesting, but belongs in a place intended for reviewing progress rather than adding clutter to this card.
- **Bounds:** this is a display decision, not removal of historical actuals, dates or their use in adaptive prescriptions. Do not infer changes to other screens or Swap behavior.
- **Disposition:** collected for the next reconciled preview pass; no running preview changes.

## R03 — User-visible adaptive training and progress report

- **Affected:** F18; P06 training-record/progress presentation, connected to F06 above.
- **Source:** Eric, 29 October 2026: “there should be a place where users can see their adaptive training report as well as progress”.
- **Direction:** provide a user-accessible place to review adaptive training and progress. This extends the existing F18 discussion; it is not an additional approved screen or a settled location.
- **Existing constraints retained:** consume the same authoritative recorded performance and prepared training context as generation/Review. Distinguish completed performance from suggested future targets; do not create a competing editable profile or a separate per-screen calculation.
- **Still to work through after feedback collection:** where this belongs and which information makes the report useful. No new metrics, charts, route, report frequency or explanation format is prescribed by this comment. The current P06 card remains an unapproved proposal.
- **Disposition:** collected for reconciliation and a subsequent visual pass. No implementation or new data capture started.

## R04 — Conditioning Review card: compact labels and inline load guidance

- **Affected:** F07/F08, with F14 logging preserved; P03 conditioning Review and corresponding P05 execution context.
- **Source:** Eric's annotated conditioning screenshot, 29 October 2026. Annotation 1 flags redundant movement text; the shown title is “Dumbbell Thruster” with a separate “Dumbbell” line below. Annotation 2 requests moving the suggested load to the normal weight position and removing “Change weight” here if actual workout logging already supports weight entry. Eric: “These should be concise and this is cluttered”.
- **Requested presentation:** remove redundant movement/equipment labels. Put the rough suggested load range in the normal prescription row with the other target information, not on an extra row below Swap. Keep units and the per-hand meaning clear without adding explanatory prose. Coordinate equipment placement with R02; do not repeat equipment already clear from the title.
- **Weight-entry check:** the frozen `ac04390` source used by these previews already provides optional “Log load and reps” on each circuit movement, opening the shared set logger with a Weight field for loaded movements (`source/src/ui/circuit-block.tsx` and `source/src/ui/set-logger.tsx` in the preview archive). This establishes support for the illustrated circuit, not every conditioning format or the still-in-flight UI revision.
- **Control disposition:** Eric's condition is satisfied for this circuit: remove the proposed Review “Change weight” control. Keep choosing/recording the actual weight in the existing optional workout logger. F08's earlier Review override proposal is superseded for this example and must be reconciled rather than carried forward automatically.
- **Data meaning retained:** a suggested range helps choose a load; the logged value records the one actual weight used. Removing the Review control does not turn logged actuals into edits of the original prescription or require logging.
- **Disposition:** collected for the reconciled pass; no preview, source, logging or contract changes. Recheck any affected control against the delivered UI when reconciling.

## R05 — Review order: Regenerate after cooldown

- **Affected:** P03 Review; F11 cooldown presentation and its ordering with the existing Regenerate action.
- **Source:** Eric's screenshot, 29 October 2026, shows Regenerate between conditioning and cooldown. Eric: “regenerate should be the last thing in the list, not cool down”.
- **Requested order:** all workout content, including cooldown, precedes Regenerate. Regenerate is the last item in this list; do not append workout content below it.
- **Bounds:** this is list/action placement, not a change to regeneration behavior or a decision about cooldown wording. It does not request changes to unrelated persistent navigation or footer controls.
- **Disposition:** collected for the next reconciled preview pass; no running preview or product changes.

## R06 — Returning-athlete Generate: reconcile ordering and Change focus placement

- **Affected:** F03/F05; returning-athlete Generate in P01/P02.
- **Source:** Eric's returning-athlete screenshot, 29 October 2026, showing Goal: Balanced, Recovery Session, Focus: Full body, the recent-history rationale and a centered Change focus action at the bottom. Eric recalls reorder notes in the new UI work and flags the centered bottom action as visually odd.
- **Requested follow-up:** include this returning-athlete state in the next pass. Reconcile the ordering with the actual new UI work/its notes rather than treating the frozen snapshot's order as the desired layout or duplicating another worker's changes.
- **Placement feedback:** the centered bottom Change focus action feels detached from the focus information. Revisit its placement/grouping; exact alignment and control order have not been selected by this comment.
- **Bounds:** the referenced in-flight reorder has not been verified in this feedback-collection step. No new focus, Recovery, goal or adaptation behavior is inferred from this layout feedback.
- **Disposition:** collected; inspect and reconcile the current UI changes after the review, then show the revised mobile comparison. Running previews remain unchanged.

## R07 — Superset logging: saved confirmation and rest before the next entry

- **Affected:** F14/F15/F20; P05 superset logging sheet and rest lifecycle.
- **Source:** Eric's superset logging screenshot and comment, 29 October 2026. After one set is logged, do not jump to or present the second set. Show that it was logged and the timer. When the timer clears, collapse the half-sheet if still open, then reset. Eric notes this is also changing in the current UI work and must be rechecked.
- **Requested sequence:** deliberate Save → logged confirmation plus the rest timer → at rest completion, collapse the sheet if the athlete has not already collapsed it and reset for the next entry. Do not immediately replace the saved entry with the next set's form or automatically reopen it. Logging proceeds one deliberate entry at a time.
- **Early collapse:** the athlete may collapse the sheet before rest ends; rest completion must not reopen it. The next entry is available through a deliberate logging action.
- **Bounds:** this feedback establishes the post-save lifecycle. It does not by itself replace the existing grouped superset logging with separate A1/A2 prompts or settle whether a combined superset entry should be labeled set versus round. Preserve individual movement actuals and optional effort; a timer ending does not log another set.
- **Reconciliation:** inspect the actual in-flight implementation/requirements before the next preview pass. Verify confirmation, timer ownership, manual early collapse, automatic collapse at rest completion and next-entry reset without a jump to the next form. Do not claim the current UI work already implements this sequence.
- **Disposition:** owner direction collected; no running preview, product logging, timer or data changes.

## R08 — History filters: remove Rest days and Not started

- **Affected:** F16; P06 History filter options.
- **Source:** Eric's History dropdown screenshot, 29 October 2026. Eric says a rest-days-only view provides no useful information and Not started is not something the experience is recording; the options feel like pattern completeness rather than useful functionality.
- **Requested change:** remove **Rest days** and **Not started** from the History filter options. Retain useful workout-oriented filtering; do not add replacement statuses merely to fill out the control.
- **Bounds:** this feedback concerns filter choices. It does not request deleting historical rest/session records, removing rest context from All entries, changing lifecycle storage or removing the entire filter. All entries, Completed and Partial are not rejected by this comment.
- **Reconciliation:** carry this owner decision into the next History preview, checking current UI work before changing the frozen comparison. Do not treat all enum/storage statuses as user-facing filter requirements.
- **Disposition:** collected for the next reconciled pass; no preview, History data or lifecycle changes.

## R09 — Use Effort, not RPE, in frontend titles

- **Affected:** F14/F16 and any other frontend title/header using RPE; P05/P06 logging and saved actuals presentation.
- **Source:** Eric approves the shown Accessories/sets-logged table overall, with one correction, 29 October 2026: “we should change RPE to effort, I don't want to use RPE as a front end title anywhere”.
- **Requested change:** replace the **RPE** column heading with **Effort**. Apply the same title/label terminology consistently across the frontend; do not leave another user-facing RPE heading behind.
- **Bounds:** retain this table's useful presentation. A label change does not convert legacy numeric RPE into categorical effort or fabricate missing effort. Preserve original stored values and their meaning; reconcile historical numeric and current categorical displays honestly under the Effort label. No new numeric RPE input is requested.
- **Disposition:** collected for the reconciled pass, including a frontend label sweep against the current UI revision. No preview, historical-data or effort-contract changes.

## Round two

### R10 — Generate: five annotated intake points

- **Affected:** returning-athlete Generate, F03/F04/F20; P01/P02. Source: Eric's five-number annotated round-two screenshot, 29 October 2026, with the explicit instruction “same as before, just intake”.
1. **Recovery within Change focus:** explore making Recovery available inside Change focus so the main card has one button instead of separate Recovery and Change focus actions. This revises the proposed visible paired-action arrangement; it does not select a new underlying recovery/focus contract or make Recovery a mutually exclusive movement-focus value. Preserve the existing distinction until the interaction is worked through during reconciliation.
2. **Goal: Balanced hierarchy:** the annotated Goal: Balanced text appears too small. Revisit its size/prominence with the current shared typography; exact styling/size is not chosen by this comment.
3. **Minutes unit fit:** MINUTES clips in the Time available unit area. Capture the fit defect and inherit the in-flight reusable unit-fit correction (previously identified REQ-006/TASK-006), rather than a separate V4 route-specific patch.
4. **Header title:** use **Generate** rather than the two-line Generate Workout, consistently with the notes in the ongoing UI work (previously identified REQ-005/TASK-007). This is title consistency, not renaming the Generate workout action by inference.
5. **Header Back/Home icon:** the pictured arrow-plus-HOME treatment is changing in the ongoing UI work. Inherit the planned shared icon-only Back control and preserve its destination/accessibility rather than fighting or duplicating that work. The current rendering is a known screen exception pending that change, not a newly approved permanent exception. The related shared Back work was previously identified as TASK-005/REQ-007; final delivery still needs checking at reconciliation.

- **Disposition:** all five points collected only. No preview, primary brief, product code, control behavior or other UI-body changes. Do not reopen the current build/recovery work during intake.

### R11 — First workout: normal session, not Recovery

- **Affected:** first-workout/no-history Generate, F03; P01. Source: Eric's annotated first-workout screenshot, 29 October 2026: “First workout shouldn't be a recovery session, that doesn't make sense”.
- **Direction:** the first workout starts as a normal session; missing training history is not a reason to select or recommend Recovery. Do not present Recovery as the initial session mode.
- **Presentation distinction:** the screenshot shows an outlined Recovery session option, while Full body is selected. It does not establish that recovery mode is active. Record the owner's concern without claiming a verified default-state defect; reconcile the presentation with R10's request to place Recovery inside Change focus.
- **Bounds:** this establishes the normal first-session default. Whether Recovery should be completely unavailable on the first workout is not explicitly decided by this comment; do not silently impose a hard restriction or change the meaning of movement focus.
- **Disposition:** intake only; no preview, defaults, generation policy or primary-brief changes.

### R12 — Inherit the new Review overview; prevent regression to this snapshot

- **Affected:** P03 Review overview/required-equipment summary and its shared content/data integration, F06/F09/F12/F20.
- **Source:** Eric's Overview screenshot, 29 October 2026: “this whole section is changing” and ensure the next body catches the overlap so things are not accidentally regressed.
- **Direction:** flag the entire section as owned by the ongoing UI changes, not an approved V4 layout from this frozen preview. The existing batch-05 Review summary overlap was previously identified as TASK-008; no new delivery check is performed during intake.
- **Reconciliation requirement:** once that UI body is complete, bind the V4 comparison/requirements to its actual delivered revision and compare the real updated overview before/after V4. Preserve its settled hierarchy, controls and summary behavior while integrating the new workout content. Check that displayed values/equipment remain truthful to the accepted workout; do not reintroduce this old overview composition via copied preview code or stale requirements.
- **Bounds:** this is an inheritance/regression requirement for the whole section, not a request to choose its replacement layout, rename fields or add metrics now. Final layout/contract must come from the delivered UI work.
- **Disposition:** intake only; no preview, primary brief, UI-body requirement or product changes. Retain this flag for post-build reconciliation.

### R13 — Cooldown matches the compact warm-up format

- **Affected:** F11 with F09 consistency; P03 Review and P04 cooldown/guide presentation.
- **Source:** Eric's revised Warm-up list screenshot, 29 October 2026: “much better but do the same for cooldown for consistency”.
- **Direction:** the revised warm-up presentation is preferred. Use the same concise format for **Cooldown**: simple section title, approximate total duration and relevant movement names on separate lines. No paragraph, custom generated title or per-movement prescriptions.
- **Bounds:** consistency concerns presentation, not identical movements, duration or item count. The pictured four minutes applies to the warm-up example, not a universal cooldown target. This does not settle timer controls or approve the entire preview/requirements packet.
- **Disposition:** intake only; collect for the next reconciled pass. No running preview, primary brief or product changes.

### R14 — Remove Dismiss from the warm-up timer

- **Affected:** F10; P04 warm-up timer controls.
- **Source:** Eric's warm-up timer screenshot, 29 October 2026: “we don't need the dismiss here”.
- **Direction:** remove the **Dismiss** action from this timer. Do not add a replacement hide/dismiss control as part of this correction.
- **Bounds:** this does not request changes to Start/Pause, Add 30 sec, guide content, session navigation or unrelated dismissal controls. The earlier optional timer-dismiss proposal is superseded for this warm-up surface.
- **Disposition:** intake only; no preview, primary-brief or timer implementation changes.

### R15 — Reuse the existing rest-timer pattern for warm-up

- **Affected:** F10/F20; P04 warm-up timer presentation and controls.
- **Source:** Eric's running warm-up timer screenshot, 29 October 2026: “why doesn't this use the same pattern as the rest timer? why invent a new one here?” This reinforces the earlier direction to use the existing rest timer as the UI reference.
- **Cause in this preview:** Guide uses a custom clock row and action arrangement instead of the existing timer presentation. This was a preview-composition deviation, not an established need for a new product component.
- **Direction:** reuse the existing shared rest-timer visual/interaction pattern, inheriting the applicable updated UI version at reconciliation. Do not create another timer layout or parallel component simply because the timer appears in warm-up. R14's removal of Dismiss remains in force; do not replace it with another hiding action.
- **Bounds:** reuse the pattern without coupling the warm-up guide clock to a logged set's actual rest state. Preserve the previously stated optional guide behavior/no automatic workout advancement; identify any real component capability gap during reconciliation instead of silently inventing controls. This does not approve a new timer implementation or change other clock owners.
- **Disposition:** intake only; recorded as a correction to the preview approach. No preview, primary brief, product component or timer behavior changed.

### R16 — Logging sheet: complete frame and enough height for the form

- **Affected:** F14/F20; P05 combined superset logging sheet, with the pending shared sheet composition to reconcile.
- **Source:** Eric's filled superset sheet screenshot, 29 October 2026: “much closer, but the frame at the buttom doesn't contain everything” and make it tall enough that this screen does not need to scroll; no reason to limit the height. Eric wants to continue iterating.
- **Containment:** the sheet's frame must enclose all its content, including the rest controls, both movement entries, each effort/clear row and the final Log round action. The screenshot shows the lower effort/action content outside the visible structural frame; this is a reported preview defect, not a new desired composition.
- **Height:** do not impose the preview's arbitrary half-screen/60dvh ceiling. Allow the sheet to grow into the available phone height so the complete form can be seen without unnecessary scrolling in this state. Reconcile with the current UI's inset/safe-area/keyboard behavior; do not replace a fixed half-height cap with another arbitrary cap or promise zero scrolling at every keyboard/viewport combination.
- **Bounds:** preserve the shared logging pattern, independent movement fields/effort, explicit Save and existing collapse/rest semantics. This is not a request to split superset entry, remove fields, shrink text to force a fit or create a different logging route. Inherit the eventual shared sheet implementation while applying this owner sizing/containment correction.
- **Disposition:** intake continues; no preview, primary brief or other UI-body changes. Revisit frame geometry and full-content fit in the next reconciled pass.

### R17 — Collapsed rest display must use the shared timer pattern

- **Affected:** F14/F20; P05 superset saved/rest state, related to R15 timer reuse.
- **Source:** Eric's screenshot, 29 October 2026, of Round 1 logged, a Rest button and plain “Rest · 1:20” inside an awkward action frame. Eric calls the rest timer objectively wrong and questions whether there is a dependable shared timer component.
- **Preview cause:** the round-two synthetic SupersetPreview supplies custom collapsed-state status/button/countdown markup. It is not a faithful render of the existing shared RestTimerBar composition. The product source does contain shared rest-timer components; this screenshot does not establish their absence or a defect in their actual current implementation. The preview adapter also places its custom content at the old action's parent, which must be checked for correct frame ownership during reconciliation.
- **Direction:** use the shared rest-timer component/pattern consistently in expanded and collapsed logging states, inheriting the pending UI updates. Do not substitute a plain text countdown or a second improvised action frame. Recheck the actual rendered component in context, its frame ownership and remaining-time/entry behavior before presenting the next pass as consistent.
- **Bounds:** preserve the accepted one-rest-clock, no-restart-on-save/reopen and logged-confirmation behavior. This comment does not justify inventing a new timer component; actual product behavior must be inspected separately from the synthetic preview.
- **Disposition:** intake only. Record as a preview composition defect; no preview, shared component, primary brief or other UI-body changes.

### R18 — Circuit round controls: preserve function, reconcile visual format

- **Affected:** F15/F20; P05 circuit round state, timer, actions and round-time history.
- **Source:** Eric's circuit screenshot, 29 October 2026, showing two of three rounds recorded, the Round 3 elapsed clock, Finish round 3, Take back a round and round times. Eric: “functionally this is good, but visually it's messy” and recalls a better format in the new UI work.
- **Direction:** preserve the demonstrated circuit behavior. Reconcile the grouping/hierarchy of count, active round clock, actions and round-time history with the actual new UI work/shared patterns. Do not carry forward this snapshot's visual layout as newly approved V4 design.
- **Source distinction:** the round-two timed scene still mounts the frozen source circuit renderer; its added conditioning-range text does not update that renderer's layout. This comment does not establish what the pending UI work has implemented. Inspect its final delivered circuit/timer composition before proposing changes or claiming the improved format is already included.
- **Bounds:** retain explicit round recording/undo, elapsed round durations and independent logging/rest ownership. No functional redesign, new metrics, deleted history or invented replacement layout is requested during this intake.
- **Disposition:** functional feedback recorded; visual reconciliation pending. No preview, primary brief, circuit controller or other UI-body changes.

### R19 — History row regression: status and date beneath the title

- **Affected:** F16/F20; P06 History workout rows, including any candidate training-report view retaining the list.
- **Source:** Eric's History screenshot, 29 October 2026, with Completed beside a wrapped Balanced lower body title. Eric identifies this as a regression: “the completed is supposed to be under the title with the date next to it”.
- **Required arrangement:** movement/session title occupies its own row. Put the Completed status below the title, with the date beside the status on that lower row. Do not place Completed alongside the title and unnecessarily constrain the title's width.
- **Source distinction:** this preview still mounts the frozen History renderer. The separate UI build's history-row changes were identified during the prior reconciliation, but were not imported into this snapshot. This is an omitted agreed layout in the preview, not proof that the delivered app changed back.
- **Reconciliation:** preserve the owner's previously agreed layout and inherit the current UI body's actual final History row implementation. Check normal/narrow phone title wrapping and status/date grouping without inventing new metadata or changing stored completion/date semantics.
- **Disposition:** record as a visual regression against owner-approved direction; intake only. No preview, primary brief, history data or other UI-body changes.

### R20 — Saved-workout overview should match the workout preview

- **Affected:** F16/F20 and the Review summary connection; P06 saved workout detail ↔ P03 pre-start Review, linked to R12.
- **Source:** Eric's saved-workout Overview screenshot, 29 October 2026: after the new work, “this upper portion should match the preview screen rather than recreating a new version here, the consistency seems off”.
- **Direction:** use the updated workout preview's overview presentation as the consistent pattern for the upper saved-workout summary. Reuse the appropriate shared composition/hierarchy instead of independently recreating a second visual version in History/detail.
- **Reconciliation timing:** follow R12's actual delivered new-UI overview baseline once that body is complete. Compare Review and saved detail together and carry the same settled visual language/field-label conventions into V4. Do not freeze this old detail screenshot as a separate approved design.
- **Data meaning:** consistency of presentation must preserve the saved attempt's real values and relevant historical state; do not replace actual duration/completion/date with the current generation request, today's recommendation or fabricated equivalents. The screenshot's lower mood/notes content is not removed by inference from this upper-summary comment.
- **Disposition:** intake only; no replacement component, preview, primary-brief or saved-data changes. Include the cross-screen consistency check in post-build reconciliation.


## Generate library pilot intake —30 October

### R21 — Generate: emphasize the current Goal/Focus, subordinate Change focus

- **Affected:** F03; returning-athlete Generate, proposed library pilot `4836764a38b77114810b76bea6a8644e2dc5badd`, base `14acb2cc549b482e2fb5466a2402bbe5a34029c3`.
- **Source:** Eric's attached cropped Generate screenshot and dictated feedback,30 October. It shows stacked Goal: Balanced and Focus: Full body, a centered Change focus action, and unused space at the upper right.
- **Positive direction:** Eric likes the starting direction and Change focus being the entry for related choices. This is directional feedback, not approval of the current styling or the whole V4 packet.
- **Hierarchy:** increase Goal and current Focus prominence relative to Change focus; make Focus: Full body stand out. Explore placing Goal and Focus in one row rather than stacked, making useful use of the upper-right area. Exact dimensions and responsive treatment remain for the next preview.
- **Action:** current button size/link treatment and equal visual emphasis feel wrong. A smaller CTA is acceptable. Keep both alternatives open: a compact framed CTA using the established frame style, or a substantially smaller link-style action beneath the Focus information. Eric has not chosen between these alternatives.
- **Intent:** the selected program/focus is the information to notice. Changing focus is optional, not the main task the screen should appear to encourage. Keep the agreed access to Recovery through the focus choices.
- **Disposition:** intake only. Saved feedback; no preview, source, requirements or running UI changes.


### R22 — Account-load error: accent bar must match the error treatment

- **Affected:** F20; Generate/account-load error state in the current library pilot, proposal4836764/base14acb2c, shown in the Signal skin.
- **Source:** Eric's attached screenshot/dictation,30 October. The inline “Your account didn’t load / No connection. Check your network.” card has an orange error frame/icon but a lime accent bar. Eric described the alert/toast treatment and flagged the mismatch as minor.
- **Direction:** the accent bar should use the same semantic error/severity color as the card's error border/icon, orange in this example. Do not hardcode this example's orange across skins or change the separate Try again action by inference.
- **Investigation to retain:** verify the actual card/error-state/shared style owner and whether the mismatch exists in the declared source or is introduced by the preview. Source/cause is not established by the screenshot alone; do not assume it is only a preview defect or change unrelated toast components.
- **Disposition:** intake only. Record the visual mismatch for reconciliation; no preview, component, style, requirements or behavior changes.


### R23 — Generate: remove Place and Notes helper copy

- **Affected:** F03/F20; Generate form in library pilot4836764/base14acb2c.
- **Source:** Eric's attached annotated Signal-skin screenshot,30 October, with red strikeouts beneath Place and Notes: “Remove the crossout text. ... we don't need it.”
- **Direction:** remove the two crossed-out helper lines: “Uses this place’s equipment.” beneath Place and “Optional, today only. Ongoing limits go in Settings.” beneath Notes.
- **Bounds:** retain the field labels, controls and Notes placeholder; this is copy removal, not a change to equipment selection, notes scope, stored constraints or request behavior. When implemented, remove any obsolete helper-description wiring along with the helper props, retaining the fields' accessible labels/errors.
- **Disposition:** intake only. Save this for the next reconciliation; preview/source/primary requirements unchanged.
