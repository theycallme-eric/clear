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

## Seams and changes (local, unpublished)

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

No migration was needed. The existing owner-scoped update/delete policies and column grants (`update`
on the measurement columns and `effort`, plus `delete`) already cover the writes. Nothing changed in
GitHub or any external service. The vendored design system is untouched.

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

## Verification (2026-10-27)

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

The controller or an operator commits this diff, re-captures the TASK-034 mobile format-preview group
on that commit the way TASK-007's recovery did, re-derives the audit's runtime hash and lineage, then
re-runs `npm test`. After that, integrate current `origin/main` and re-verify.
