# TASK-011 — Correction of saved results during the active workout

Issue #531 · REQ-013 (and REQ-012's correction/clear half) · role: completion-owner for JOURNEY-010.
Task-owned progress record; it stands in for the shared daily journal for this task.

## Outcome intended

Saved-row Edit reopens the actual result in TASK-006's shared half-sheet with its identity, values,
unit and effort intact. Save correction updates that row, and Cancel leaves it unchanged. For a
wrong movement the owner chose option A: confirm clearing the selected result, then re-enter it
explicitly on the right movement. There is no move-to-target, no logged-row Remove button, no
post-finish editor and no new explanatory prose. A correction or clear owns its mutation identity
and order from UI through provider, transport and the durable queue.

## Operator recovery checkpoint (local, unpublished)

The initial worker's focused checks passed, but independent review found that its client-only
mutation IDs and direct PATCH/DELETE could not prevent a delayed request from undoing a newer
correction or clear after reload. The candidate was preserved in checkpoint `e4d7291`; it was never
published or called complete. The original native run remains attempt 1 of 2, with its failed
verification and usage intact. The connection interruption started no replacement worker.

The product repair adds exact mutation requests/revisions, durable database receipts and tombstones,
and acknowledgement validation. Possibly dispatched work survives reload; old provider callbacks
cannot write stale storage. Database owner/active-workout checks and delayed-request tests have passed
the integrated checks below. Native full verification and delivery are still pending. No Runner change,
remote migration or new distance-tracking feature
is included. Existing observed distance values/units, categorical effort and historical numeric RPE
must survive correction unchanged unless the athlete explicitly edits the applicable value.

Quiet Clear now precedes the final aligned Cancel / Save correction pair. Its independent action-order
and submit regression passed (1/1). The three TASK-010 test/documentation cleanups are integrated here;
all ten rest lifecycle tests passed in the combined check. Edit selects the actual recorded measurement,
uses its actual unit label, and preserves other recorded measurements when the compact field changes.
The five new value-retention UI cases passed; new-entry behavior is unchanged.

### Current repair verification

| Check | Actual result |
| --- | --- |
| `npm test -- set-correction set-correction-queue effort-persistence rest-footer-lifecycle set-logging-sheet` | 7 files, 165 tests passed |
| `npm run typecheck` | passed |
| `npm run gen:types -- --check` | passed; 20 tables, 27 enums, 38 callable functions |
| Schema/type/standing-RLS/lifecycle boundary check | 4 files, 45 tests passed |
| Actual disposable PostgreSQL 17 mutation rehearsal | 43 checks passed; owned container and volume removed |

The actual SQL rehearsal used the current additive migration
`20261027000028_set_observation_mutations.sql`, SHA-256
`f9fc00fb79985aac5891cf5d771ea7359b1a6936509e42892a8361b29b0b7d27`.
It covered independently delayed older RPC/PATCH and legacy INSERT requests, clear/re-entry without
resurrection or duplicates, exact lost-response replay/current-head acknowledgement, changed-payload
UUID reuse and slot conflicts, owner/RLS and foreign-owner lock refusal, completed-workout refusal,
legacy numeric RPE/bootstrap, migration replay, prescription supersede, parent-delete cascade and
privileged cleanup. The first rehearsal failed because its synthetic supersede fixture omitted the
required `superseded_at`; the fixture was corrected and both failure and successful logs retained.
Independent SQL review then caught a receipt replay that unnecessarily failed after prescription
supersede. Exact replay now remains harmless; every new mutation still requires an active prescription.

The controller retains the executable rehearsal, logs and hashes outside the product at
`runner/reports/task-011-sql-proof*` in the clean build body. These are operator test artifacts, not a
native completion receipt. The hosted schema and other local Supabase stack were untouched.

The new queue tests hold requests independently across provider teardown/reload, then release them
after newer corrections or clear/re-entry. Generic conflicts and exercise/set slot matches cannot
confirm a save. Exact mutation IDs/payloads/revisions are persisted before dispatch and checked on
acknowledgement; current heads are monotonic. Old queue entries retain numeric RPE/classification,
including a never-sent rewrite and an already-dispatched lost-response replay.

## Historical initial worker implementation

| Seam | Change |
| --- | --- |
| `LoggedSet` (`set-logging.ts`) | gains `id`, the row's client-minted id. Corrections and clears address it, never the set number |
| `setLogCorrection` (new) | the PATCH body: measurements, `weight_unit`, `effort` (null clears). Never `set_number`, `rpe` or `is_warmup_set` |
| `SetLoggingApi` | optional `correctSet(exerciseId, setId, performed)` / `clearSet(exerciseId, setId)`, present only when the provider has `corrections` |
| `QueuedSetLog` (`set-log-queue.ts`) | optional `kind: 'correct' \| 'clear'`, `mutationId` and `dispatched`. Legacy inserts decode unchanged; a mutation without its own id is refused |
| `sendable` | per-row and per-slot ordering barrier: a correction waits for its insert, a re-entry into a cleared slot waits for the clear |
| `corrected` / `cleared` | rewrite or withdraw only an insert that has never been dispatched. Anything that may have landed gets a queued mutation behind it |
| `reconciled` | accounts for inserts only. A correction or clear survives reload, and a slot being cleared does not swallow its re-entry |
| `SetLogsClient.correct` / `.clear` (`data/workout.ts`) | PATCH / DELETE filtered by `id` and `workout_exercise_id`. An empty PATCH answer (RLS, or row gone) is `PERSISTENCE_NOT_FOUND`, so it is never drawn as saved |
| `SetLoggingProvider` | sends by kind; `dispatched` is written to disk before each request; confirmed rows are replaced or removed by id; queued corrections are drawn `syncing`/`failed`, and a queued clear hides the row |
| `set-logger.tsx`, `set-logging-sheet.tsx` | Edit uses the provider seam by row id. Edit mode gains a quiet **Clear set** under Cancel / Save correction, which opens a critical `AppDialog`: title "Clear set N of movement?", body is the result itself, actions Keep set / Clear set |
| `Workout.tsx` | passes `corrections`, the only place in runtime source that does |

The initial worker assumed no migration was needed because the existing owner-scoped policies and
column grants permitted direct writes. Independent review disproved the sufficiency of that approach:
owner isolation alone does not establish mutation ordering or prevent stale resurrection. The additive
mutation migration and RPC supersede that assumption. No remote schema application is authorized.
The vendored design system is untouched.

## Decisions

- The Clear control lives in the edit sheet, not the logged row, so the row keeps exactly one
  control (Edit), matching the brief's concise-row rule.
- A correction states the whole observation, so a later unsent correction supersedes an earlier
  unsent one. One already in flight is never superseded, and the newer one queues behind it.
- "Possibly landed" means dispatched, refused at least once, or in flight. Only a never-dispatched
  insert is rewritten or withdrawn locally. Otherwise a delayed id-collision answer would confirm
  values the database does not hold, or a cleared set would come back.
- A queued clear hides the row right away, but the shell's unsynced count still includes it.
  Re-entry into that slot is ordered behind the delete.

## Failures and corrections along the way

- Sandbox: only the controller-approved commands could run (`npm test -- <name>`, etc.), so no
  ad-hoc vitest file lists were run.
- First queue-test run: 10 of 23 failed. The cause was the harness. A synchronous `act()` right after
  mount joined the mount's finished flush pass before its promise cleared on a microtask, and the
  write then waited for the 60 s test backoff. A real tap always has that gap. The fix was a
  `start()` helper that settles after mount and reload. Separately, two expectations had wrongly
  assumed that an insert refused once could still be withdrawn locally. The queue correctly treats
  it as possibly landed, so I removed one test and retitled the other.
- First full `npm test`: 5 failures. Three were mine. Two `LoggedSet` expectations lacked `id`, and
  the one-mapping ownership guard caught `setLogCorrection` calling `setLogInsert`. It now maps the
  columns itself. The other two are the blocker below.
- Discrimination: I weakened the "never sent" guard to only check in-flight, and 5 of 27 queue tests
  failed (lost-answer resurrection, lost correction across reload, rule tests). The source is restored.

## Historical initial worker verification (2026-10-27)

| Command | Result |
| --- | --- |
| `npm test -- set-correction` | pass, 38/38 (both files) |
| `npm test -- set-correction-queue` | pass, 27/27 |
| `npm test -- effort-persistence` | pass, 77/77 |
| `npm run typecheck` | pass |
| `npm run lint` | pass, 0 errors (138 warnings, same count as base) |
| `npm run lint:ds` | pass |
| `npm run build` | pass (existing chunk-size advisory) |
| `npm run gen:types -- --check` | pass, types current |
| `python3 scripts/gen-issues.py --check` | pass (71 requirements, 136 edges) |
| `npm test` | **fail**: 2 of 5644, both in `src/test/design-0143-final-audit.test.ts` (blocker below) |

## Blocker: runtime-source-bound audit evidence

This is the same blocker TASK-006 and TASK-007 hit. Any non-test `src/` change alters the runtime-source
hash, and the format-preview AFTER records and the final audit must name the current hash. Refreshing
them means re-running the TASK-034 mobile format-preview capture on a committed tree against a
disposable local authenticated backend. This worker cannot do that. I did not edit any record, hash or
audit text, because that would fabricate evidence.

## Next safe action

Finish and review the product durability repair, run actual disposable PostgreSQL and delayed-request
checks, then commit the complete source and genuinely re-capture the mobile format-preview group.
Derive hashes/lineage from those artifacts and use native same-attempt recovery for every approved
criterion/task/project check. Normal native publication, required CI and protected merge target only
`build/ui-polish-clean-2026-10-27`. The frozen build base is authoritative; integrating unrelated main
is not part of this run.
