# Reconcile requirements with the gallery reference

This is a gallery handoff, not an edited native approval. Revision 6, approval 2,
revision SHA `d110d124872d4bd0638db548e8cf153e03d91e13685847b05b42ad8c00d0f898`
and plan SHA `ff0cdcebc4aa259d46dd759537cf7604c9f6e06141ac79961de255072a49d8bf`
remain unchanged. Keep the application build paused.

Current main was verified live as `03087f7488bee8d7e927534b1b5e656378fe9cb3`.
Preserve PR627's shipped Echo/CRT owners and presets. Older 94f2c2f requirement
reference snapshots must not overwrite that delivery. The original saved launch
already used 03087f7; snapshot drift is not proof of a wrong launch checkout.

For each affected native task, reconcile source references and implementation
delta against the delivered gallery commit, exact named state and shared owner
below. Preserve every criterion and its real consumer acceptance. Gallery
controllers remain memory-only. No backend, actual-route, durable recovery or
aggregate verification task is closed by these examples. Existing GAL-01–08
amendment remains a proposal to reconcile through the native Builder workflow.

| Requirement | Stable gallery states | Reuse / integration boundary |
| --- | --- | --- |
| REQ-001 | `cards` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-002 | `cards` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-003 | `cards` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-004 | `overview` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-005 | `cards` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-006 | `ladder-4`, `ladder-12` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-007 | `cards`, `urgency` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-008 | `urgency` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-009 | `amrap` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-010 | `for_time`, `ladder` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-011 | `emom`, `cards` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-012 | `ladder-4`, `ladder-12` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-013 | `ladder-4`, `ladder-12` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-014 | `ladder-4`, `ladder-12` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-015 | `amrap`, `for_time`, `ladder` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-016 | `anchor`, `superset`, `ladder` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-017 | `superset`, `for_time` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-018 | `ladder`, `ladder-long` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-019 | `anchor`, `other-lift`, `timed-movement`, `distance-movement`, `extra-set`, `set-correction`, `superset`, `circuit-round`, `circuit-movement`, `movement-note`, `workout-feedback`, `rest-day`, `emom`, `amrap`, `for_time`, `ladder` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-020 | `anchor`, `superset` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-021 | `circuit-round` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-022 | `preparation` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-023 | `preparation` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-024 | `screens` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-025 | `screens` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-026 | `screens` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-027 | `cards` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-028 | `errors` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-029 | `assets` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-030 | Non-gallery disposition | Data/schema/writer mapping and null/zero contracts require application engineering; no synthetic save proves support. |
| REQ-031 | Non-gallery disposition | Workout → Summary → History write/read/retry/reload proof remains application integration. |
| REQ-032 | `ladder-4`, `ladder-12` | Gallery demonstrates in-memory Undo only. Durable reload/reconnect and original cap recovery require application integration. |
| REQ-033 | `urgency`, `ladder-long` | Gallery state is a reference; actual route integration and persistence verification remain in the application build. |
| REQ-034 | `preparation` | Guide appearance is demonstrated; content/duration source rules remain product-definition work. |
| REQ-035 | Non-gallery disposition | Progress/adaptive-report placement and metrics were not finalized. Preserve the request; no invented accepted screen. |
| REQ-036 | `cards` | Load presentation is demonstrated. Approved ranges/per-hand semantics/read model require application engineering. |
| REQ-037 | Non-gallery disposition | Platform terminology audit remains definition work; selected explicit removals remain in the authority. |
| REQ-038 | `cards` | Grouped appearance is demonstrated. Missing coaching/empty/error inventory and rules remain definition work. |
| REQ-039 | Non-gallery disposition | Aggregate delivery/source evidence requires real application consumer verification. |
| REQ-040 | Non-gallery disposition | Runner/baseline/verification providers are outside gallery presentation. |

Do not import the old R7 route/controller tree wholesale. The gallery selects
accepted presentation owners and applies P01–P05 on current main. Application
owners must adopt/consolidate them explicitly, retain actual writers and schema
semantics, and prove the affected route at the eventual delivered revision.

The following remain explicit engineering/definition work: timed per-movement
actuals and categorical effort mapping; null versus zero, correction/retry and
History readback; reload/reconnect/authoritative-cap recovery; rest/save lifecycle;
progress-report placement/metrics; guide timing/content; load-read-model/ranges;
platform copy audit; missing coaching/empty/error rules. Do not invent answers.

Run focused relevant checks as owners adopt the shared presentation. Preserve
valid delivery evidence and avoid blanket replay of unrelated expensive journeys.
The aggregate verification task closes only after real consumer evidence exists.
