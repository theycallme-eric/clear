# App component index

Generated from `src/dev/gallery-registry.tsx` by `node scripts/gallery-index.mjs`.
Edit that register, then regenerate; do not edit this table. These are registered
examples, not complete screen/state coverage. API details live in the linked source.

| Component | Source | Purpose |
| --- | --- | --- |
| ActionGlow | [src/ui/action-glow.tsx](../../../src/ui/action-glow.tsx) | The Generate button’s glow on another actionable control. It goes out when the control is disabled or loading. |
| ActionGroup | [src/ui/composition.tsx](../../../src/ui/composition.tsx) | In-card actions sharing the card width: equal cells while the labels fit, a full-width row each when they do not (U07). |
| ActionRow | [src/ui/composition.tsx](../../../src/ui/composition.tsx) | The 0.9.7 action pattern: full-width stack on phones and an equal-width row on wider screens, with the primary action ordered consistently. |
| AppDialog | [src/ui/app-dialog.tsx](../../../src/ui/app-dialog.tsx) | The shipped Dialog with the motion it lacks: the frame traces on, the contents materialize, the backdrop hard-cuts, and dismissal decays. |
| AppearancePicker | [src/ui/appearance-picker.tsx](../../../src/ui/appearance-picker.tsx) | Skin selection, derived from the export’s own SKINS list and persisted by its own skin.js. Explicit skins only: there is no System option and the OS contrast setting never picks one. Mono is named enhanced contrast, never accessible. |
| AtmosphereLayer | [src/ui/atmosphere.tsx](../../../src/ui/atmosphere.tsx) | The export’s five-layer ground. One mount serves every screen and there are no modes; under reduced motion the layer drops its drift and its scanlines. |
| Card | [src/ui/card.tsx](../../../src/ui/card.tsx) | The public 0.14.3 Card: one mandatory fixed-width bar, a corner picked from its height and the 70% card ground. The card imposes no heading level on its content. |
| CardActions | [src/ui/card.tsx](../../../src/ui/card.tsx) | The reusable action edge inside a card, keeping single- and multi-action placement consistent across flows. |
| CheckboxGroup | [src/ui/checkbox-group.tsx](../../../src/ui/checkbox-group.tsx) | A native fieldset and legend for related checkboxes without a second visual frame around controls. |
| CollapsibleSection | [src/ui/collapsible-section.tsx](../../../src/ui/collapsible-section.tsx) | App-owned disclosure. Collapsed content keeps its place in document order, so find-in-page and a linear read still reach it. |
| ConditioningScoreLine | [src/ui/conditioning-score.tsx](../../../src/ui/conditioning-score.tsx) | Names the normalized score for timed conditioning and shows a comparison only when an identical repeat provides one. |
| ConfirmDialog | [src/ui/blocking-dialog.tsx](../../../src/ui/blocking-dialog.tsx) | A decision that blocks. Cancel comes first in DOM order, so the choice a stray Enter takes is the safe one. |
| DeloadBanner | [src/ui/deload-banner.tsx](../../../src/ui/deload-banner.tsx) | States the one trigger that fired and offers both answers. Never a dialog and never urgent: the suggestion is ignorable by design, and severity is carried by the glyph and the sentence rather than by hue. |
| ErrorDialog | [src/ui/blocking-dialog.tsx](../../../src/ui/blocking-dialog.tsx) | The blocking third of the AppError contract: user-safe message, requestId for correlation, and exactly one retry. |
| ErrorView | [src/ui/view-state.tsx](../../../src/ui/view-state.tsx) | Whole-screen failure. Severity carries a glyph as well as colour, and the frame speaks urgency on both surface and border. |
| FavoriteList | [src/ui/favorite-list.tsx](../../../src/ui/favorite-list.tsx) | The favorites a user keeps, newest first, as a named list. |
| FavoriteListItem | [src/ui/favorite-list.tsx](../../../src/ui/favorite-list.tsx) | One favorite: title with its star, anchor · duration · intensity, and the progression it is kept for. A snapshot this build cannot restore omits Start and says why in words. |
| FavoriteProgressionCard | [src/ui/favorite-progression.tsx](../../../src/ui/favorite-progression.tsx) | The thread between the runs of one favorite: bests, the last run against the one before it, what was lifted last time, and the completions — every figure carrying the day it was measured on. |
| FeelingRow | [src/ui/feeling-row.tsx](../../../src/ui/feeling-row.tsx) | Asks the optional 1–5 feeling as one non-wrapping row of five even numbers; each option’s accessible name carries the scale word. |
| HistoryList | [src/ui/history-list.tsx](../../../src/ui/history-list.tsx) | The newest-first chronology as a named list, including derived rest runs between sessions. |
| Input | [src/styles/fields.css](../../../src/styles/fields.css) | The public Input with a unit end cap. The cap is sized by its unit text and never shrinks, so the control gives up room instead (B05-02.9). |
| LadderRungs | [src/ui/ladder-rungs.tsx](../../../src/ui/ladder-rungs.tsx) | The block’s rep pattern, stated once. Read-only it is data — quiet, square, nothing to tap; once the cap is hit the same rungs become a radio group, named by their target rather than their index, with the choice ticked and said in words. |
| ListFrame | [src/ui/composition.tsx](../../../src/ui/composition.tsx) | One closed frame for a related list, with rows separated inside rather than nested in individual cards. |
| ListMessage | [src/ui/composition.tsx](../../../src/ui/composition.tsx) | A factual empty collection rendered in the same one-row frame the populated list occupies. |
| ListRow | [src/ui/composition.tsx](../../../src/ui/composition.tsx) | One row inside the system list frame, preserving the caller’s content semantics. |
| LoadingView | [src/ui/view-state.tsx](../../../src/ui/view-state.tsx) | The loading state of the four-state contract. A ScanLoader, never a spinner; past its threshold it says it is slow. |
| LoadSuggestionButton | [src/ui/load-suggestion.tsx](../../../src/ui/load-suggestion.tsx) | One prescription’s suggested weight on Review, with its session count beside it. Low confidence leads with the words and a glyph in a dashed frame; a suggestion with no honest number says so rather than showing zero. |
| LoadSuggestionDialog | [src/ui/load-suggestion.tsx](../../../src/ui/load-suggestion.tsx) | Why this number: last session’s sets, the RPE recorded, the rule that fired, and an override that changes this session only. |
| LoadSuggestionsStatus | [src/ui/load-suggestion.tsx](../../../src/ui/load-suggestion.tsx) | The anchor reads’ loading and error states, inline in the briefing so neither blocks nor discards it. |
| LoggedSetTable | [src/ui/session-detail.tsx](../../../src/ui/session-detail.tsx) | Reads weight, reps, and RPE as a named table while preserving the difference between zero and not logged. |
| MetricFrame | [src/ui/composition.tsx](../../../src/ui/composition.tsx) | One compact labelled value in the system small closed frame. |
| MetricGrid | [src/ui/composition.tsx](../../../src/ui/composition.tsx) | The shared responsive grid for terse workout facts and completed-result readouts. |
| MoodReading | [src/ui/mood.tsx](../../../src/ui/mood.tsx) | Reports a stored mood with glyph, word, and numeric scale; an unanswered debrief stays explicitly unanswered. |
| MovementCountdown | [src/ui/movement-countdown.tsx](../../../src/ui/movement-countdown.tsx) | A timed prescription’s own countdown, on its movement’s card: Start, Pause and Reset over the session clock’s timer frame. The final five seconds take the low state and light the screen edge; running out records nothing. |
| PhoneFooter | [src/ui/composition.tsx](../../../src/ui/composition.tsx) | The pinned primary-action area: transparent atmosphere underneath, one full-width rule above. |
| Select | [src/ui/select.tsx](../../../src/ui/select.tsx) | The native control styled to CLEAR and wired through FormField for label, helper and error. The opened dropdown stays the platform’s. |
| SessionProvenance | [src/ui/session-detail.tsx](../../../src/ui/session-detail.tsx) | Names which reconstruction is being read and the moment it resolves, including an explicit unresolved state. |
| SessionSectionCard | [src/ui/session-detail.tsx](../../../src/ui/session-detail.tsx) | Frames one historical workout section with its blocks, outcomes, prescriptions, lineage, and logged sets. |
| SetEffortChoice | [src/ui/set-effort.tsx](../../../src/ui/set-effort.tsx) | Asks one set’s optional effort as Frown / Meh / Smile — too hard, about right, too easy — with the words in each option’s accessible name only. |
| SetEffortReading | [src/ui/set-effort.tsx](../../../src/ui/set-effort.tsx) | Reads a saved set’s effort back beside its result as the face, named for a screen reader. |
| StructureResultBadge | [src/ui/session-detail.tsx](../../../src/ui/session-detail.tsx) | Pairs the workout structure with its logged outcome and perceived effort without treating absent scores as zero. |
| SummaryFact | [src/ui/composition.tsx](../../../src/ui/composition.tsx) | One reading in SummaryFacts: optional system glyph, a term (visible or for readers only) and its value. |
| SummaryFacts | [src/ui/composition.tsx](../../../src/ui/composition.tsx) | The compact workout-facts row: every glyph-led reading on one line, with public horizontal containment and keyboard reachability. |
| TabBand | [src/ui/composition.tsx](../../../src/ui/composition.tsx) | The full-width ruled band used to make a tab rail read as one screen-level region. |
| ToastHost | [src/ui/toast-host.tsx](../../../src/ui/toast-host.tsx) | The one toast surface, mounted at the app root. These triggers use the real queue, so each toast arrives where a screen’s would, one at a time. |
| ViewStateSwitch | [src/ui/view-state.tsx](../../../src/ui/view-state.tsx) | The one mapping from a ViewState onto a screen. The union is closed and the switch exhaustive, so no view using it can render nothing. |
| WeekStrip | [src/ui/week-strip.tsx](../../../src/ui/week-strip.tsx) | Seven data-backed days with written accessible states; today is marked by structure rather than colour alone. |
| WorkoutListItem | [src/ui/history-list.tsx](../../../src/ui/history-list.tsx) | One chronological row. Workout status is written and carries a glyph; rest uses a quieter frame and the word Rest, so colour is never the only cue. |
| WorkoutMenu | [src/ui/workout-chrome.tsx](../../../src/ui/workout-chrome.tsx) | The active workout’s framed header menu: an icon-only framed trigger named “Actions” for assistive technology, disclosing one framed panel that holds Abandon. Abandon closes the panel and asks the shared abandon confirm. |
