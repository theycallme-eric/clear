# Shared owners and proposed extensions

This isolated design branch refreshes the prior full workout comparison onto released `94f2c2f`. The broad proposal is not approved or ready to merge. The current repository library README, component index and registry govern reuse.

| Owner | Proposed change | Consumers and boundaries |
| --- | --- | --- |
| `app/Generate.tsx` | Larger Goal/Focus row; existing TextAction or Button; Recovery inside choices; remove helper copy. | Existing request/draft owners remain. Both action treatments remain open. |
| `ui/review-exercise-row.tsx` | Equipment adjacent to name; optional rough load guidance. | Same released shared Review row, with metadata recipe retained; Swap and lifting overrides stay with their current owners. No restored private row. |
| `ui/workout-chrome.tsx` | Pure CountdownBar extracted from RestTimerBar presentation. | RestTimerBar keeps its existing provider/expiry/extend/skip rules; preparation owns a separate clock. Existing urgency/reduced-motion behavior is inherited, with no new keyframes. |
| `ui/preparation-guide.tsx` | Concise guide/list and optional independent clock. | Review, active Workout and saved detail share the guide. Start/Pause/extend do not complete a section automatically. |
| `ui/set-logging-sheet.tsx`, `set-logger.tsx`, `superset-block.tsx` | Saved confirmation using existing sheet/rest; minimize/reopen; expiry closes without opening the next entry. | Actual logging writers/controllers are exercised with in-memory clients. Hosted receipts/failures/drafts/corrections still need integration. |
| `ui/set-logging-sheet.css` | Available-height sheet instead of the former 60% cap. | Retains measured overflow and all fields/actions; physical keyboard behavior needs later UAT. |
| `ui/history-list.tsx`, `app/History.tsx` | Status/date grouping and useful filters. | Real rows keep shared metadata classes, underlying statuses and records. Home retains its separate accepted row. |
| `app/SessionDetail.tsx`, `ui/session-detail.tsx` | Shared SummaryFacts/guide and Effort heading. | Preserve recorded values, dates, actual duration, mood/notes and legacy distance. |
| `ui/training-progress-report.tsx` | Candidate report using Card/List presentation. | Actual observations and next targets stay distinct; placement/content and shared data source remain unresolved. |
| `app/Onboarding.tsx`, `app/Settings.tsx` | Shorter setup and proposed preference visibility. | Current reducers remain; held fixture values are not approved defaults or permission to delete saved preferences. |
| `ui/view-state.tsx` | No new proposal. | PR 611's approved ErrorView role is already released and byte-identical on both sides. |

## Gap requests before requirements

These use the library's existing four-part intake, without a second inventory or approval schema.

### Preparation guide and shared countdown

1. Need/options checked: show brief warm-up/cooldown instructions and an optional timer in Review, Workout and saved detail. Existing RestTimerBar is the matching presentation, but its provider owns set-rest behavior.
2. Smallest extension: extract pure CountdownBar presentation and add PreparationGuide with its own clock. Do not share timer state or automatically advance workout sections.
3. Owner/consumers: the app-owned files above; existing public Card/Button and semantic styles. Historical foundation stays unchanged. The proposed guide's data/versioning contract is still open.
4. Preview/checks: hub group 4 and saved preparation in group 6; ready/running/reached, Pause/extend and independent-clock checks. Existing 15 RestTimerBar compatibility tests pass.

### Logging confirmation and available-height sheet

1. Need/options checked: show a successful set/round and rest without immediately reopening another form. Existing SetLoggingSheet, SetLogger and SupersetBlock provide the controllers/frame.
2. Smallest extension: explicit saved-confirmation presentation with parent-owned saved phase; preserve independent measurements, explicit corrections and existing rest rules.
3. Owner/consumers: the actual standard/superset loggers and sheet. Hosted receipt/failure, unsaved draft and correction transitions must be reconciled before production.
4. Preview/checks: group 5 entry/saved/minimized/expired/standard states; actual in-memory save, minimize/reopen, expiry and no-auto-open checks. Keyboard/physical-phone and hosted persistence are not established.

### Guide/load/report presentation inputs

1. Need/options checked: preview concise preparation, rough conditioning load guidance and actual-versus-next training history without inventing separate screen algorithms. Existing load suggestions, SummaryFacts and history rows remain in use.
2. Smallest extension: one typed, fixture-provided presentation context; no backend, calculation engine or persistence contract. Reconcile these inputs with the real domain contracts after visual selection.
3. Owner/consumers: `workout-experience-presentation.tsx` is mounted only by the isolated harness; Review/shared row, PreparationGuide, saved detail and candidate report consume it. Legacy reads retain meaning.
4. Preview/checks: groups 3, 4 and 6 include missing guidance, bodyweight, report empty state and legacy distance. Generation quality, saved range/guide compatibility and adaptation evidence remain future obligations.

### Shorter setup and preference visibility

1. Need/options checked: simplify setup and reduce visible preference detail using the current Onboarding/Settings controls and reducers.
2. Smallest extension: two-step design and visibility changes; retain all existing values rather than silently removing data.
3. Owner/consumers: existing screens. Hidden required field values are explicitly supplied by the fixture, so real completion/default/migration behavior remains undecided.
4. Preview/checks: groups 1 and 7 show controls, confirmation and Settings. Owner selection precedes a requirement for defaults or persistence changes.

## Approval and motion

Recorded R01–R23 directions remain available in the original review notes; the full proposal is still pending. A screenshot is not acceptance of every data/behavior contract. Carry the selected canonical owners and named states through requirements and verify affected screens and gallery examples together.

Motion uses existing shared owners. Rest urgency is triggered by the existing last-ten-seconds rule and stops at rest end; reduced motion retains readable time without decorative pulsing. Sheet/dialog behavior remains with their shared owner. Preparation has no new decorative motion. ScrollRegion work in #600 and the separate effects intake are not dependencies of this comparison.
