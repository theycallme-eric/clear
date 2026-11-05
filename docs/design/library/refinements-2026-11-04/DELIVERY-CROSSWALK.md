# Gallery delivery crosswalk

This records accepted-reference coverage, independently of actual application
implementation. The complete original audit remains `gallery-crosswalk.md/json`;
its pinned main findings were not retroactively changed.

| Revision-6 requirement | Reference states | Canonical source / limit |
| --- | --- | --- |
| REQ-001 | cards | src/ui/refinements/movement.tsx; src/ui/refinements/workout-card.tsx |
| REQ-002 | cards | src/ui/refinements/movement.tsx; src/ui/refinements/workout-card.tsx |
| REQ-003 | cards | src/ui/refinements/movement.tsx; src/ui/refinements/workout-card.tsx |
| REQ-004 | overview | src/dev/gallery-refinement-scenes.tsx |
| REQ-005 | cards | src/ui/refinements/movement.tsx; src/ui/refinements/workout-card.tsx |
| REQ-006 | ladder-4, ladder-12 | src/ui/refinements/ladder.tsx; src/dev/gallery-refinement-flow.tsx |
| REQ-007 | cards, urgency | src/ui/refinements/deadline-timer.tsx; src/ui/refinements/countdown-warning.ts |
| REQ-008 | urgency | src/ui/refinements/deadline-timer.tsx; src/ui/refinements/countdown-warning.ts |
| REQ-009 | amrap | src/ui/refinements/logging-overlay.tsx; src/ui/refinements/timed-result-log.tsx; src/dev/gallery-refinement-forms.tsx |
| REQ-010 | for_time, ladder | src/ui/refinements/logging-overlay.tsx; src/ui/refinements/timed-result-log.tsx; src/dev/gallery-refinement-forms.tsx |
| REQ-011 | emom, cards | src/ui/refinements/logging-overlay.tsx; src/ui/refinements/timed-result-log.tsx; src/dev/gallery-refinement-forms.tsx |
| REQ-012 | ladder-4, ladder-12 | src/ui/refinements/ladder.tsx; src/dev/gallery-refinement-flow.tsx |
| REQ-013 | ladder-4, ladder-12 | src/ui/refinements/ladder.tsx; src/dev/gallery-refinement-flow.tsx |
| REQ-014 | ladder-4, ladder-12 | src/ui/refinements/ladder.tsx; src/dev/gallery-refinement-flow.tsx |
| REQ-015 | amrap, for_time, ladder | src/ui/refinements/logging-overlay.tsx; src/ui/refinements/timed-result-log.tsx; src/dev/gallery-refinement-forms.tsx |
| REQ-016 | anchor, superset, ladder | src/ui/refinements/logging-overlay.tsx; src/ui/refinements/timed-result-log.tsx; src/dev/gallery-refinement-forms.tsx |
| REQ-017 | superset, for_time | src/ui/refinements/logging-overlay.tsx; src/ui/refinements/timed-result-log.tsx; src/dev/gallery-refinement-forms.tsx |
| REQ-018 | ladder, ladder-long | src/ui/refinements/logging-overlay.tsx; src/ui/refinements/timed-result-log.tsx; src/dev/gallery-refinement-forms.tsx |
| REQ-019 | anchor, other-lift, timed-movement, distance-movement, extra-set, set-correction, superset, circuit-round, circuit-movement, movement-note, workout-feedback, rest-day, emom, amrap, for_time, ladder | src/ui/refinements/logging-overlay.tsx; src/ui/refinements/timed-result-log.tsx; src/dev/gallery-refinement-forms.tsx |
| REQ-020 | anchor, superset | src/ui/refinements/logging-overlay.tsx; src/ui/refinements/timed-result-log.tsx; src/dev/gallery-refinement-forms.tsx |
| REQ-021 | circuit-round | src/ui/refinements/logging-overlay.tsx; src/ui/refinements/timed-result-log.tsx; src/dev/gallery-refinement-forms.tsx |
| REQ-022 | preparation | src/dev/gallery-refinement-scenes.tsx |
| REQ-023 | preparation | src/dev/gallery-refinement-scenes.tsx |
| REQ-024 | screens | src/dev/gallery-refinement-scenes.tsx |
| REQ-025 | screens | src/dev/gallery-refinement-scenes.tsx |
| REQ-026 | screens | src/dev/gallery-refinement-scenes.tsx |
| REQ-027 | cards | src/ui/refinements/movement.tsx; src/ui/refinements/workout-card.tsx; src/ui/workout-chrome.tsx#SectionHeader |
| REQ-028 | errors | src/ui/view-state.tsx#ErrorView |
| REQ-029 | assets | src/dev/gallery-refinement-scenes.tsx; src/design-system/assets/icons.tsx; docs/design/library/refinements-2026-11-04/authority/EQUIPMENT-ICON-WANTED-LIST.md |
| REQ-030 | Explicit non-gallery disposition | Data/schema/writer mapping and null/zero contracts require application engineering; no synthetic save proves support. |
| REQ-031 | Explicit non-gallery disposition | Workout → Summary → History write/read/retry/reload proof remains application integration. |
| REQ-032 | ladder-4, ladder-12 | src/ui/refinements/ladder.tsx; src/dev/gallery-refinement-flow.tsx |
| REQ-033 | urgency, ladder-long | src/ui/refinements/deadline-timer.tsx; src/ui/refinements/countdown-warning.ts |
| REQ-034 | preparation | src/dev/gallery-refinement-scenes.tsx |
| REQ-035 | Explicit non-gallery disposition | Progress/adaptive-report placement and metrics were not finalized. Preserve the request; no invented accepted screen. |
| REQ-036 | cards | src/ui/refinements/movement.tsx; src/ui/refinements/workout-card.tsx |
| REQ-037 | Explicit non-gallery disposition | Platform terminology audit remains definition work; selected explicit removals remain in the authority. |
| REQ-038 | cards | src/ui/refinements/movement.tsx; src/ui/refinements/workout-card.tsx |
| REQ-039 | Explicit non-gallery disposition | Aggregate delivery/source evidence requires real application consumer verification. |
| REQ-040 | Explicit non-gallery disposition | Runner/baseline/verification providers are outside gallery presentation. |
