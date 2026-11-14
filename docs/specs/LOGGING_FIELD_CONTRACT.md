# CLEAR — Logging field contract

Task: TASK-030 (#657) — Validate complete logging field ownership before dependent writes
Requirement: REQ-030 (AC-R030-01, AC-R030-02, AC-R030-03)
Body: clear-refinement-20261103 (Runner body `clear-refinement-v2-20261109b`)
Status: engineering definition with a typed contract and deterministic tests
Implementation claim: none — no user-facing feature, writer, migration or live-service change
Amended by: TASK-031 (#658) — landed MIG-A and MIG-B as repository migrations (not applied), the
schemas, the correction and movement writers, the timed save provider and the History read model;
no entry UI, no route adoption, no live-service change (see §7 and §12)

This is the field-to-contract matrix every logging task builds against. It describes the current
source at integration base `b24ccfe` (after TASK-001 to TASK-012) truthfully, separates what exists
from what is proposed, and names the dependent task that owns each proposed piece.

- **Typed half:** [`src/data/refinement-logging-contract.ts`](../../src/data/refinement-logging-contract.ts)
  (`LOGGING_MOMENTS`, `LOGGING_FIELDS`, `PROPOSED_PATHS`, `partialRoundFor`, `loadApplies`,
  `movementActualFromDraft`, `draftsAfterProgressChange`). Import it; do not restate it.
- **Proof:** `src/state/schemas.test.ts` (check-01, the schema boundary) and
  `src/data/refinement-logging-contract.test.ts` (check-02, binding and consumer rehearsal over
  [`src/test/logging-contract-double.ts`](../../src/test/logging-contract-double.ts)).
- **Data model:** [`DATA_MODEL.md`](DATA_MODEL.md) §8 is the execution schema this extends.

A dependent task that lands a proposed field updates this file and the typed contract in the same
change: the field's status becomes `existing`, its suggested names become the real ones, and
check-02 fails until it does.

## 1. Rules every logging task keeps

1. **One writer per row kind.** Sets go through the durable set path
   (`createWorkoutClients().setLogs.mutate` → `mutate_set_observation`); block outcomes through the
   shell's one writer (`blockResults.record`, called only by `BlockCompletionProvider`); movement
   notes through `exercises.saveNotes`; the debrief through `createSummaryClient().saveDebrief`;
   rest days through `createRestDayClient().mark`. Adopting the shared dialog (TASK-043 to TASK-046)
   changes presentation, never these writers.
2. **Null is not recorded; zero is a measurement.** No actual or outcome column has a default.
   Blank input is `null`; `0` is stored and read back as `0`. Stopping, a cap, a timer or a plan
   never fills a value.
3. **Categories are not numbers.** `set_effort` (`too_hard`, `about_right`, `too_easy`) is never
   converted to or from `perceived_effort` (1–10), `rpe` (1–10) or `mood` (1–5). See §4.
4. **Planned is not performed.** Prescribed targets and loads (`workout_exercises.target_*`,
   `load_type`, `load_value`) are never copied into an actual.
5. **Identity is explicit.** A value attaches to a set (`workout_exercise_id`, `set_number`), a block
   (`block_id`), a prescription row, a session row, or a calendar day, as listed below — never to a
   guessed round or movement.

## 2. The 16 logging moments

Reconciliation. The moments are the accepted reference's 16 stable contexts
(`src/dev/gallery-refinement-data.ts` `LOGGING_CONTEXTS`; REUSE.md "All 16 contexts have stable
named query values"; REQ-019's coverage states list the same 16; CURRENT-REQUIREMENTS-AUTHORITY
§ "All 16 logging contexts"). LOGGING-FIELDS.md has 15 rows because its first row, "Anchor /
primary and other lift", covers two moments with the same field contract: `anchor` and
`other-lift`. Nothing was merged or invented: 15 rows + 1 split row = 16.

| # | Moment | Title | Writer today | Fields today | Proposed (owner) |
| --- | --- | --- | --- | --- | --- |
| 1 | `anchor` | Anchor / primary lift | `setLogs.mutate` | reps, weight + unit, set effort | — (TASK-043 adoption) |
| 2 | `other-lift` | Other lift | `setLogs.mutate` | reps, weight + unit, set effort | — (TASK-043 adoption) |
| 3 | `timed-movement` | Timed movement | `setLogs.mutate` | seconds, weight + unit where loaded, set effort | — (TASK-043 adoption) |
| 4 | `distance-movement` | Distance movement | `setLogs.mutate` | distance + unit, weight + unit, set effort | — (TASK-043 adoption) |
| 5 | `extra-set` | Extra set | `setLogs.mutate` | as a set, at the next set number | — (TASK-043 adoption) |
| 6 | `set-correction` | Saved-set correction | `setLogs.mutate` (correct / clear) | every set measurement, unit, set effort | — (TASK-043 adoption) |
| 7 | `superset` | Superset round | `setLogs.mutate` | per Performed movement: a set at the round's number | — (TASK-044 adoption) |
| 8 | `circuit-round` | Circuit round / take back | `blockResults.record` | rounds_completed | — (TASK-044 adoption) |
| 9 | `circuit-movement` | Circuit movement entry | `setLogs.mutate` | as a set | — (TASK-044 adoption; TASK-036 load meaning) |
| 10 | `movement-note` | Movement note | `exercises.saveNotes` | exercise_notes | — (TASK-045 adoption) |
| 11 | `workout-feedback` | Workout feedback | `saveDebrief` | mood, session_notes | — (TASK-045 adoption) |
| 12 | `rest-day` | Rest day / reason change | `mark` | reason (note always null) | — (TASK-045 adoption) |
| 13 | `emom` | EMOM results | `blockResults.record` | notes (minutes_completed null) | block effort (MIG-A), movement loads (MIG-B) — TASK-031, TASK-015, TASK-046, TASK-047 |
| 14 | `amrap` | AMRAP results | `blockResults.record` | elapsed, rounds, partial reps | notes (reuse), block effort (MIG-A), movement partials and loads (MIG-B) — TASK-031, TASK-015, TASK-046, TASK-047 |
| 15 | `for_time` | For Time results | `blockResults.record` | elapsed, completed_under_cap | notes (reuse), block effort (MIG-A), movement partials and loads (MIG-B) — TASK-031, TASK-015, TASK-046, TASK-047 |
| 16 | `ladder` | Ladder results | `blockResults.record` | highest_rung | notes (reuse), block effort (MIG-A), movement partials and loads (MIG-B), durable draft — TASK-031, TASK-032, TASK-013, TASK-015, TASK-046, TASK-047, TASK-048 |

TASK-019 verifies all 16 across families; TASK-041 closes dialog geometry on the routes.

### Set moments: the shared contract

Moments 1–7 and 9 share one contract; each section below adds only what differs.

- **Schema:** `exercise_set_logs` (20260921000004, effort 20261027000027, revisions
  20261027000028); `exerciseSetLogRowSchema`, `setEffortSchema`, `sessionSnapshotSchema`,
  `sessionReconstructionSchema` in `src/state/schemas.ts`; generated `Tables<'exercise_set_logs'>`.
- **Validator:** `setLogViolation` and `isRecordedEffort` (`src/state/set-logging.ts`) mirror the
  CHECKs before anything is queued; `setObservationMutation` builds the exact request and
  `parseSetObservationAck` accepts only a matching receipt (`src/state/set-observation-mutation.ts`);
  the RPC re-checks keys, types and CHECKs.
- **Writer:** `SetLoggingProvider` queues the entry durably (`clear.set-log-queue`) and flushes it
  through `createWorkoutClients().setLogs.mutate` → `mutate_set_observation`.
- **Identity:** one row per (`workout_exercise_id`, `set_number`) on the active prescription
  performed; the client-minted `id` is the observation id, so a retried flush collides rather than
  duplicates. `blockId` is attribution only (no column).
- **Null / zero:** a null measurement is not recorded; no row is no set recorded at that number;
  skipped is `workout_exercises.execution_status`; `0` is a measured result (0 reps is a failed
  attempt). `weight_unit` is never null: it is stamped at write time (the athlete's choice, else the
  profile then), and a set with no unit to stamp is refused.
- **Update / correction:** `correct` and `clear` are ordered requests against the row id (expected
  revision + 1), only while the session is active. A correction restates every measurement, the unit
  and the effort; `set_number`, `rpe` and `is_warmup_set` never change. A clear deletes the row and
  keeps its receipt; an exact retry is `replayed`, a stale one is a conflict.
- **Draft:** the open sheet holds the typed text; once submitted, `clear.set-log-queue` holds the
  entry until its receipt settles it (drawn `syncing` / `failed`, never confirmed).
- **Readback — Workout:** the card's set row (`loggedSetFromRow` / `loggedSetFromEntry`,
  `SetEffortReading` for the category) from `session_snapshot`.
- **Readback — History:** `/history/:id` → `sessionDetail` → `loggedSet`: reps, weight with its
  stamped unit, legacy RPE, seconds and distance. **History does not read the per-set effort
  category today** (an observation; no task in this body is assigned it; not changed here).
- **Also read by:** `anchor_evidence` (load anchors, deload D5) for working sets of loaded reps
  prescriptions in completed sessions — whatever the block's structure (see §5).

### `anchor`

Anchor / primary lift. Entry: `StandardBlock` → `ExerciseSetLogger` → `SetLoggingSheet`. Fields:
`actual_reps`, `weight`, `weight_unit`, `effort`; `rpe` written null. The anchor's suggested load is
a prefill, not an observation: nothing is written until the set is submitted. Owners: TASK-043
(dialog adoption, original writer), TASK-019.

### `other-lift`

Other lift. Same entry, fields and contract as `anchor` (LOGGING-FIELDS row 1). Owners: TASK-043,
TASK-019.

### `timed-movement`

Modality `time`: `actual_duration_seconds`. Weight and unit follow the set logger's load rule
(`ExerciseSetLogger` / `SupersetRoundSheet` `showLoad`): they are offered for a loaded prescription
(`incrementFor(equipment_used)` not null); on unloaded equipment (a plank) they appear only when a
weight is carried forward from this movement's earlier set (`prefillFrom`) or the set being
corrected already has one, so a recorded weight stays visible and correctable. A plank with no
recorded weight has no load fields. Owners: TASK-043, TASK-019.

### `distance-movement`

Modality `distance`: `actual_distance` with `actual_distance_unit` = the prescription's own unit
(`distance_has_unit`; a distance without a unit is refused), plus weight and unit under the same
load rule as `timed-movement`. Owners: TASK-043, TASK-019.

### `extra-set`

The same set fields at the next `set_number` past `workout_exercises.sets` ("Extra set N"); no new
data type. Owners: TASK-043, TASK-019.

### `set-correction`

Saved-set correction and Clear set. Addressed to the row id, never to the set number; see "Update /
correction" above. Keep set is the safe action; a clear removes the row and keeps its receipt.
Owners: TASK-043, TASK-019.

### `superset`

`SupersetBlock` → `SupersetRoundSheet`. Every movement ticked Performed writes one set at the
round's `set_number` (the pair's next round); a movement not ticked writes no row and keeps a gap
there — never a zero. Blank fields on a ticked movement are performed and not measured. Owners:
TASK-044, TASK-019.

### `circuit-round`

- **Schema / validator:** `block_results`; `blockResultRowSchema`; `blockResultInsert`,
  `isPerceivedEffort` (`src/state/block-completion.ts`).
- **Writer:** the circuit reports `{ roundsCompleted }` to the shell; the section's forward action
  saves it through `blockResults.record`.
- **Identity:** one `block_results` row per block (UNIQUE `block_id`). Round position, rest and each
  round's timing stay in the circuit controller (`clear.workout-circuits`); round times are never
  written to the row.
- **Null / zero:** the circuit reports nothing for 0 rounds, so `rounds_completed` is null when no
  round was recorded; Take back a round returns to that same nothing (the circuit's own rule).
- **Update:** insert-once; a repeated insert is 409 / 23505 and counts as recorded. Before the save,
  Finish round and Take back a round change the controller's count.
- **Readback:** the circuit card reads its controller record; History reads `Rounds N of M`.
- **Owners:** TASK-044, TASK-019.

### `circuit-movement`

`CircuitBlock` → `ExerciseSetLogger` for one movement: the set contract, with `set_number` that
movement's next logged entry while the circuit controller keeps round position and time. The actual
weight lives here (TASK-036 keeps it in this logger and removes the redundant Review weight
control). Owners: TASK-044, TASK-036, TASK-019.

### `movement-note`

- **Schema / validator:** `workout_exercises.exercise_notes` (text, nullable);
  `workoutExerciseRowSchema` on the stored row.
- **Writer:** Coaching and notes (`GroupExerciseCoaching`) → `useExerciseNotes().save` →
  `createWorkoutClients().exercises.saveNotes` (UPDATE of the one column).
- **Identity:** that one prescription row (`workout_exercises.id`); after a swap the note stays on the
  row it was written on.
- **Null:** no note; the panel saves an emptied field as `null`.
- **Update:** each save replaces the column and answers the stored row; an update that matches
  nothing is `PERSISTENCE_WRITE_FAILED`.
- **Draft:** the panel field (memory) until Save; the last successful save is cached under
  `exercise-notes:<id>`.
- **Readback:** the Coaching and notes panel. **History does not read movement notes today.**
- **Owners:** TASK-045, TASK-019.

### `workout-feedback`

- **Schema / validator:** `workout_sessions.mood` (1–5, `workout_sessions_mood_range`) and
  `session_notes`; `sessionDebriefSchema` (mood 1–5 or null, notes ≤ 2000 or null), checked before
  sending.
- **Writer:** `Summary` (`FeelingRow`, notes field) → `createSummaryClient().saveDebrief` (UPDATE of
  the session row).
- **Identity:** the session row.
- **Null / zero:** null mood is not answered (never the middle face); 0 is refused. Blank notes are
  saved as null.
- **Update:** each save restates both columns and answers the stored row.
- **Readback:** the Summary form; History reads mood (`moodStep`) and notes on `/history/:id`.
- **Owners:** TASK-045, TASK-019. The five-step mood is a different question from any effort.

### `rest-day`

- **Schema / validator:** `rest_days` (`reason` rest_day_reason, `note` text);
  `restDayMarkSchema` (reason enum, note ≤ 2000 or null) before sending.
- **Writer:** `Home` (native Reason select) → `createRestDayClient().mark` → `mark_rest_day`
  (upsert).
- **Identity:** one row per (`user_id`, `day`); the owner is `auth.uid()`, never a browser value.
- **Null:** an unmarked day has no row. `note` is always null: Home sends null and the function
  stores a blank note as null. No Notes field is added (LOGGING-FIELDS).
- **Update:** marking the same day again replaces reason and note in that row.
- **Readback:** Home (`Today: <reason>`) and the streak rules (`restDayStreakPolicy`); History lists
  rest as derived calendar gaps, not from this row.
- **Owners:** TASK-045, TASK-019.

### Timed moments: the shared contract

Moments 13–16 write one `block_results` row each through the shell's one writer.

- **Schema:** `block_results` (20260921000004); `blockResultRowSchema`,
  `sessionReconstructionSchema`.
- **Validator:** `blockResultInsert` (pure mapping; an absent field is null), `isPerceivedEffort`
  (1–10 or refused before sending).
- **Writer:** the renderer reports an outcome (`reportOutcome`); the section's forward action
  (`completeSection`) writes it with `perceivedEffort: null` through `blockResults.record`.
- **Identity:** one row per block (UNIQUE `block_id`); a repeated insert answers 409 / 23505 and
  counts as already recorded.
- **Update:** insert-once on the shipped path. TASK-031 added the correction writer
  (`createWorkoutClients().blockResults.correct`: an UPDATE of the row by `block_id`, restating every
  outcome column, the notes and the categorical effort) and the save provider that uses it on the
  insert's 23505 (`saveTimedResult`), so a changed retry after a lost answer is corrected, not
  re-inserted. TASK-015 wired that provider into the shell's one completion path
  (`BlockCompletionProvider`, the only caller): a timed renderer reports the log's categorical
  effort and each movement's typed entry beside its outcome (`reportTimedResult`), and the
  section's forward action saves a block whose report carries either through `saveTimedResult`
  (row → correction on 23505 → movement rows, ids minted once per block in the shell); a report
  with no effort and no typed entry takes the bare insert, byte for byte as before, and a changed
  retry of such a save is still absorbed by the 409 rule. A refused movement write leaves the
  block unrecorded in the shell and the athlete on the section with the existing dialog; the retry
  restates the row and writes the movements once.
- **Readback:** History `blockOutcome` (per structure) plus block notes; `perceived_effort` as
  `N of 10` for older rows.

### `emom`

Today: the end log (`TimedResultLog` EMOM family, TASK-011) reports `{ notes }` for a non-blank
note, else `{}`; `minutes_completed` stays null for every ending (R84: the schedule is assumed;
exceptions go in notes). Older rows keep their minutes and read `Minutes N of M`. Draft: the note is
this mount's memory (kept across a failed save and retry, lost on reload); the clock is
`clear.workout-emom`. Proposed: block effort (MIG-A) and applicable movement loads (MIG-B, no
partials — there is no partial round to attach). Owners: TASK-031, TASK-015, TASK-046, TASK-047,
TASK-019.

### `amrap`

Today: `amrapOutcome` reports `elapsedSeconds` and, once the window has closed, `roundsCompleted`
and `partialRoundReps` when recorded; blank is null and an explicit 0 is stored (TASK-009). Draft:
`clear.workout-amraps`, restored on reload — since TASK-015 also each movement's typed next-round
amount and load (`AmrapState.movements`, written on every keystroke; a change of the rounds count
clears the amounts and keeps the loads). The amount is asked only once a rounds count is recorded
(round `rounds_completed + 1`; an explicit 0 gives round 1); "Reps into the next round" stays
beside it, neither derived from the other. Saved by the section's forward action through the
shell's one path as `block_movement_results` rows (TASK-015); once saved the fields keep their
values and are no longer offered. History reads `Rounds N`, `Partial round N reps` and each
movement's `Round N · amount · load`. Proposed still: notes (reuse `block_results.notes`), block
effort (MIG-A, no AMRAP effort field yet). Owners: TASK-031, TASK-015, TASK-046, TASK-047, TASK-019.

### `for_time`

Today: `forTimeOutcome` reports `elapsedSeconds` and the completion answer as `completedUnderCap`;
the athlete's Complete/Incomplete is kept as `workCompleted` on `clear.workout-for-time` (TASK-010);
null before the end, with no cap, or when recorded mid-race. The effort faces are the renderer's
memory (not stored), reported to the shell and saved as `block_results.effort` (TASK-015, MIG-A).
Since TASK-015 the record also holds each movement's typed entry (`ForTimeState.movements`): a
single pass answered Incomplete asks each movement's completed amount for round 1 and its load; a
multi-round race (`rounds` > 1) asks loads only — no partial round and no new rounds-count control
(owner decision, 2026-11-10); a change of answer clears the amounts and keeps the loads. Saved
through the shell's one path as `block_movement_results` rows. History reads `Elapsed`, `Cap ·
Finished under the cap / Stopped at the cap / Incomplete` (no rounds reading) and each movement's
`Round 1 · amount · load`. Proposed still: notes (reuse). Owners: TASK-031, TASK-015, TASK-046,
TASK-047, TASK-019.

Rounds. `workout_blocks.rounds` is a nullable int with no For Time restriction (20260921000003
`workout_blocks_rounds_positive`; the generation contract's `rounds` is fixed rounds or null), so a
race may be one pass or several. `forTimeOutcome` records no rounds count, while the conditioning
reader already scores a capped For Time as `rounds_completed` × reps per round +
`partial_round_reps` (`conditioningScore`, read back from `conditioning_history`; a finished race
uses reps per round × `rounds`). A capped For Time therefore has no like-for-like score today. The
proposed partial's round follows from that (§6): round 1 only for a single pass, otherwise only
from a recorded completed-rounds count.

### `ladder`

Today: `highest_rung` is the last completed rung, 1-based (Complete records the top rung; Incomplete
records the chosen rung or nothing; `ladder-for-time.md` "taps the last rung they completed"). The
CHECK admits 0 (no rung completed), which the ladder log records when the athlete states that no
round was completed (TASK-013), never for nothing stated. Draft: since TASK-013 the renderer keeps its
race clock, live checked progress and the answer and rounds in the durable owner below, and imports
the checked prefix at Finish or the cap; effort is still its memory (no writer). The durable owner
(`ladder-durable-draft`, landed by TASK-032):
`clear.workout-ladders`, one versioned record per block with session/block/attempt identity, holding
ordered progress, the draft, the Finish checkpoint and the original cap on the For Time clock
(`src/state/ladder-recovery.ts`, `usePersistedLadder`); TASK-013, TASK-014, TASK-046 and TASK-048
adopt it. TASK-014 adopted the Finish checkpoint as the log's quiet Undo: it restores the attempt
before a saved row exists and writes nothing; the shell's word that the row exists
(`onBlockRecorded`) closes the record in the same act as the save. TASK-015 adopted the draft's
`movements`: while Incomplete with a rung stated and a rung left, the log asks each movement's
completed amount for the round after the prefix (bounded by that movement's target at that rung)
and its load; a change of rung clears the amounts and keeps the loads (`editLadderDraft`); the
effort faces stay the renderer's memory, reported and saved as `block_results.effort`. Saved
through the shell's one path as `block_movement_results` rows; a saved ladder claims no draft
(TASK-048 reads the row back). History reads `Highest rung N` and each movement's `Rung N · amount
· load`. Proposed still: notes (reuse); ordered progress is recorded by TASK-013. Owners:
TASK-013, TASK-015, TASK-031, TASK-032, TASK-046, TASK-047, TASK-048, TASK-019.

## 3. Field matrix

Status: `existing` (written today), `legacy` (kept for history; the current UI writes null),
`prescription` (read by logging, never written by it), `proposed-migration` (needs MIG-A or MIG-B),
`pending-live-migration` (TASK-031's name, kept as these fields' identity: declared by a repository
migration and in the generated types, with a client writer and History reader; applied to the
hosted project by the owner's `LIVE-PRE-1` on 2026-11-10 and written by the shell's one completion
path since TASK-015, §13).
Writers: S = `setLogs.mutate`, B = `blockResults.record`, N = `exercises.saveNotes`,
D = `saveDebrief`, R = `mark`. History: H = `sessionDetail` (`loggedSet` / `blockOutcome`),
W = Workout set row (`loggedSetFromRow`); conditioning = `conditioning_history` (20260921000012) read
by `timedOutcome` / `conditioningScore` / `conditioningTrend` (like-for-like score and trend).

| Field | Status | Type | Meaning | Null | Zero | Update / correction | Writer | Validator | Readback | Migration | Owners |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `exercise_set_logs.actual_reps` | `existing` | int ≥ 0 | reps in the set (modality reps) | not recorded | failed attempt | restated by correct; removed by clear | S | `setLogViolation` | W, H | — | TASK-043, TASK-044 |
| `exercise_set_logs.actual_duration_seconds` | `existing` | int ≥ 0 | seconds (modality time) | not recorded | measured | restated by correct | S | `setLogViolation` | W, H | — | TASK-043, TASK-044 |
| `exercise_set_logs.actual_distance` | `existing` | numeric ≥ 0 | distance (modality distance) | not recorded; needs its unit | measured | restated by correct | S | `setLogViolation` | W, H | — | TASK-043, TASK-044 |
| `exercise_set_logs.actual_distance_unit` | `existing` | distance_unit | the prescription's unit, only with a distance | no distance | — | restated by correct | S | `setLogViolation` | W, H | — | TASK-043, TASK-044 |
| `exercise_set_logs.weight` | `existing` | numeric ≥ 0 | actual load, never the prescribed load | not recorded | measured load | restated by correct | S | `setLogViolation` | W, H, anchors | — | TASK-043, TASK-044, TASK-036 |
| `exercise_set_logs.weight_unit` | `existing` | weight_unit NOT NULL | stamped at write time | never null | — | restated by correct | S | `setLogViolation` | W, H | — | TASK-043, TASK-044 |
| `exercise_set_logs.effort` | `existing` | set_effort | per-set category, never a number, never rpe | unanswered (every older set) | — | another category or null by correct | S | `isRecordedEffort`, `setEffortSchema` | W (`SetEffortReading`); not History | — | TASK-043, TASK-044 |
| `exercise_set_logs.rpe` | `legacy` | numeric(3,1), 1–10 | historical per-set RPE; the UI writes null; older queued entries replay theirs | not recorded | refused | immutable | none | `exerciseSetLogRowSchema` | H (`RPE N`), anchors | — | — |
| `block_results.elapsed_seconds` | `existing` | int ≥ 0 | For Time / AMRAP clock actually run | not observed | measured | insert-once (shipped); `correct` (TASK-031, unwired) | B | `blockResultInsert` | H `Elapsed`, conditioning | — | TASK-031, TASK-047 |
| `block_results.completed_under_cap` | `existing` | boolean | For Time Complete (true) / Incomplete (false); older rows: before the cap | no answer (not ended, no cap, mid-race) | — | insert-once (shipped); `correct` (TASK-031, unwired) | B | `blockResultInsert` | H `Cap`, conditioning | — | TASK-031, TASK-047 |
| `block_results.rounds_completed` | `existing` | int ≥ 0 | AMRAP and circuit rounds recorded; conditioning also scores a capped For Time from it, which the current For Time card never writes | not recorded | AMRAP explicit 0 (circuit never writes 0) | insert-once (shipped); `correct` (TASK-031, unwired) | B | `blockResultInsert` | H `Rounds`, conditioning | — | TASK-031, TASK-047 |
| `block_results.partial_round_reps` | `existing` | int ≥ 0 | AMRAP reps into the next round, one count; conditioning also reads it for a capped For Time (never written by For Time today) | not recorded | explicit 0 | insert-once (shipped); `correct` (TASK-031, unwired) | B | `blockResultInsert` | H `Partial round`, conditioning | — | TASK-031, TASK-047 |
| `block_results.minutes_completed` | `legacy` | int ≥ 0 | older EMOM minutes tally; no current EMOM writes it | every current ending | older 0 of M | insert-once | none | `blockResultRowSchema` | H `Minutes`, conditioning | — | — |
| `block_results.highest_rung` | `existing` | int ≥ 0 | ladder: last completed rung, 1-based | unanswered or no rung chosen | no rung completed (stated by the athlete, TASK-013) | insert-once (shipped); `correct` (TASK-031, unwired) | B | `blockResultInsert` | H `Highest rung`, conditioning | — | TASK-013, TASK-031, TASK-032, TASK-047 |
| `block_results.perceived_effort` | `legacy` | smallint, 1–10 | historical block RPE; every current row null; `conditioningTrend` reads ≤ 7 as easy | not answered, never low | refused | insert-once | none | `isPerceivedEffort` | H `N of 10`, conditioning | — | — |
| `block_results.notes` | `existing` | text | the athlete's words about the block; EMOM writes it; AMRAP / For Time / ladder reuse it | nothing written | — | insert-once (shipped); `correct` (TASK-031, unwired) | B | `blockResultInsert` | H block notes | — | TASK-015, TASK-031, TASK-046, TASK-047 |
| `block_results.effort` | `pending-live-migration` | set_effort | optional categorical effort for the whole timed block | unanswered (every older row) | — | written with the row by omission when unanswered; restated by `correct`; null clears | B (`BlockOutcome.effort`) | `isRecordedEffort`, `setEffortSchema`, `blockResultRowSchema` | H `BlockDetailView.effort` (the category, never 1–10) | MIG-A | TASK-031, TASK-015, TASK-046, TASK-047 |
| `block_movement_results.round_number` | `pending-live-migration` | int > 0 | round the amounts belong to (`partialRoundFor`; For Time: 1 only for a single pass, else after a recorded rounds count) | no amount (load-only row) | — | restated whole; cleared when progress changes | `blockResults.recordMovements` (TASK-031) | `movementActualFromDraft`, `movementResultViolation`, `blockMovementResultRowSchema` | H `movementActualReadings` (TASK-031) | MIG-B | TASK-031, TASK-015, TASK-046, TASK-047 |
| `block_movement_results.actual_reps` | `pending-live-migration` | int ≥ 0 | reps of this movement in that round | not recorded | measured | restated whole; cleared when progress changes | `blockResults.recordMovements` (TASK-031) | `movementActualFromDraft`, `movementResultViolation`, `blockMovementResultRowSchema` | H `movementActualReadings` (TASK-031) | MIG-B | TASK-031, TASK-015, TASK-046, TASK-047 |
| `block_movement_results.actual_duration_seconds` | `pending-live-migration` | int ≥ 0 | seconds of this movement in that round | not recorded | measured | restated whole; cleared when progress changes | `blockResults.recordMovements` (TASK-031) | `movementActualFromDraft`, `movementResultViolation`, `blockMovementResultRowSchema` | H `movementActualReadings` (TASK-031) | MIG-B | TASK-031, TASK-015, TASK-046, TASK-047 |
| `block_movement_results.actual_distance` | `pending-live-migration` | numeric ≥ 0 | distance of this movement in that round | not recorded; needs its unit | measured | restated whole; cleared when progress changes | `blockResults.recordMovements` (TASK-031) | `movementActualFromDraft`, `movementResultViolation`, `blockMovementResultRowSchema` | H `movementActualReadings` (TASK-031) | MIG-B | TASK-031, TASK-015, TASK-046, TASK-047 |
| `block_movement_results.actual_distance_unit` | `pending-live-migration` | distance_unit | the prescription's unit, only with a distance | no distance | — | restated whole | `blockResults.recordMovements` (TASK-031) | `movementActualFromDraft`, `movementResultViolation`, `blockMovementResultRowSchema` | H `movementActualReadings` (TASK-031) | MIG-B | TASK-031, TASK-015, TASK-046, TASK-047 |
| `block_movement_results.weight` | `pending-live-migration` | numeric ≥ 0 | actual load for this movement in the attempt, only where `loadApplies` | not recorded | measured load | restated whole; kept when progress changes | `blockResults.recordMovements` (TASK-031) | `movementActualFromDraft`, `movementResultViolation`, `blockMovementResultRowSchema` | H `movementActualReadings` (TASK-031) | MIG-B | TASK-031, TASK-015, TASK-046, TASK-047 |
| `block_movement_results.weight_unit` | `pending-live-migration` | weight_unit NOT NULL | stamped at write time, as on a set | never null | — | restated whole | `blockResults.recordMovements` (TASK-031) | `movementActualFromDraft`, `movementResultViolation`, `blockMovementResultRowSchema` | H `movementActualReadings` (TASK-031) | MIG-B | TASK-031, TASK-015, TASK-046, TASK-047 |
| `workout_sessions.mood` | `existing` | int, 1–5 | the session's five-step feeling | not answered | refused | restated by each save | D | `sessionDebriefSchema` | H mood, Summary | — | TASK-045 |
| `workout_sessions.session_notes` | `existing` | text (≤ 2000 at the boundary) | session notes | nothing written | — | restated by each save | D | `sessionDebriefSchema` | H notes, Summary | — | TASK-045 |
| `workout_exercises.exercise_notes` | `existing` | text | the note on one prescription | no note | — | replaced by each save | N | `workoutExerciseRowSchema` | Coaching and notes panel; not History | — | TASK-045 |
| `workout_exercises.load_value` | `prescription` | numeric, with load_type | prescribed load guidance; never an actual | no value | — | immutable (append-and-supersede) | none | `workoutExerciseRowSchema` | prescribed-load readings | — | TASK-036 |
| `rest_days.reason` | `existing` | rest_day_reason | rest / injury / sick / vacation | an unmarked day has no row | — | replaced by re-marking the day | R | `restDayMarkSchema` | Home, streak rules | — | TASK-045 |
| `rest_days.note` | `existing` | text (≤ 2000 at the boundary) | supported by the writer, never filled: Home sends null | no note | — | replaced (with null) by re-marking | R | `restDayMarkSchema` | rest-day read | — | TASK-045 |

## 4. Effort: categorical versus numeric (AC-R030-02)

Four different things are called "effort" or "feeling" in the schema. None is ever derived from
another.

| Value | Where | Vocabulary | Writer today | Read by |
| --- | --- | --- | --- | --- |
| Per-set effort | `exercise_set_logs.effort` | `set_effort`: too_hard / about_right / too_easy, or null | the set path (insert and correct) | Workout set row; **not** History |
| Per-set RPE (legacy) | `exercise_set_logs.rpe` | numeric 1–10, or null | none (null); older queued entries replay theirs | History `RPE N`, `anchor_evidence` |
| Block effort (legacy) | `block_results.perceived_effort` | smallint 1–10, or null | none: every row is written null (E04) | History `Effort N of 10`, `conditioningTrend` (≤ 7 with a complete finish = `ready`) |
| Session feeling | `workout_sessions.mood` | int 1–5, or null | `saveDebrief` | Summary, History |

What is reused, from `20261027000027_set_effort.sql`: the `set_effort` enum type (its three
categories and "NULL is unanswered") and its validators (`setEffortSchema`, `isRecordedEffort`), and
the existing three-face control (`SetEffortChoice`, adapted by TASK-010 with a block `scopeLabel`).
That migration states the rule this contract keeps: "A category is not a number on that scale, and
storing one there would invent a conversion nobody approved."

Why categorical block effort cannot go into `perceived_effort`: the column is a 1–10 smallint
(`block_results_perceived_effort_range`) and its value has adaptive meaning — `conditioningTrend`
reads two complete sections at ≤ 7 as `ready` (a progression nudge). Any number chosen for
"too easy" would fabricate that signal. The writer refuses a category before sending
(`isPerceivedEffort`), the column would refuse it (smallint), and the timed logs keep
`perceivedEffort: null`. TASK-010's faces are therefore an unsaved draft until MIG-A lands.

Why it cannot reuse another existing column: `notes` is the athlete's free text and is read back
verbatim; `exercise_set_logs.effort` belongs to a performed set (writing it per movement would
fabricate set rows, see §5); `mood` is the session's five-step feeling, a different question. So
block-level categorical effort **genuinely needs a migration**: MIG-A, one nullable column reusing
the `set_effort` type.

## 5. Reuse versus migration, from the schema (AC-R030-02)

| Proposed | Decision | Evidence from schema/source |
| --- | --- | --- |
| Notes for AMRAP, For Time, ladder | **Reuse** `block_results.notes` and `BlockOutcome.notes` (no migration) | The column exists, `blockResultInsert` maps it, EMOM already writes it (TASK-011), History reads every block's notes. |
| Correction of a saved timed result | **Reuse** (no migration): a new client method, `block-result-correction` | `grant select, insert, update, delete on public.block_results to authenticated` and the `block_results_update_own` policy (20260921000004). |
| Block categorical effort | **Migration MIG-A** | §4: no categorical column on `block_results`; every candidate column has a different meaning. |
| Per-movement partials (AMRAP next round, ladder next rung, For Time Incomplete — single pass, or after a recorded rounds count) and per-movement loads | **Migration MIG-B** (a new table) | See below. |
| Durable ladder progress, draft, Finish checkpoint, original cap | **Reuse** the local persistence owner (`src/state/workout-persistence.ts`, landed by TASK-032 as `usePersistedLadder` under `clear.workout-ladders`); not a database field | Saved `block_results` stay authoritative; TASK-032. |
| Ordered ladder progress | **Reuse** `highest_rung` (last completed rung, 0 admitted) | 20260921000004 CHECK `highest_rung >= 0`; TASK-013 owns the live check-off. |

Why per-movement timed partials and loads cannot reuse `exercise_set_logs` (rehearsed in check-02
with the real readers):

1. **It changes adaptive behaviour.** `anchor_evidence` (20260921000011, redefined by
   20260921000014 to read only the active prescription) reads every working set log of a completed,
   non-deload session on an active, loaded reps prescription, with no filter on the block's
   structure. A next-round partial is by definition short of the prescribed reps (5 of 12), so it
   becomes a short working set: `d5MissedReps` raises the missed-rep deload (D5) and the e1RM sees
   it. R63/R84 forbid new adaptive consequences.
2. **History misreads it.** `sessionDetail` shows it as an ordinary "Set 4 · 5 reps · 24 kg" and
   counts it in `loggedSetCount`.
3. **A load has no set identity.** A movement's weight for the whole attempt is not "set N":
   any `set_number` claims a set that was never logged.
4. **The round would be frozen.** `set_number` is immutable under correction (the fence trigger in
   20261027000028), but a partial's round must follow a corrected round count.

## 6. The proposed timed contract

Implemented as pure functions in the typed contract and proven in check-02.

- **Round identity — `partialRoundFor`.** From the block's own reported outcome, never a planned
  target:
  - EMOM: none (the schedule is assumed; loads only).
  - AMRAP: `rounds_completed + 1` once the window has closed. Unrecorded rounds give **no** identity —
    a partial is never attached to a round nobody counted (an explicit 0 gives round 1). The
    accepted gallery treated an unanswered count as zero; that is not adopted.
  - For Time: round `1` only for a single-pass block (`workout_blocks.rounds` null or 1), when the
    athlete answered Incomplete; none when Complete or not ended. A multi-round race
    (`rounds` > 1) takes its round only from a recorded completed-rounds count
    (`roundsCompleted` + 1 while a round is left, so 2 rounds done in a 3-round race is round 3);
    without one it has **no** identity. `forTimeOutcome` records no count today, so every
    multi-round partial amount is refused (`round_number`) and only loads can be entered until
    TASK-015 records one. `rounds` is the block's structure, read only to know whether a single
    pass exists and to bound a recorded count — never to supply the round.
  - Ladder: `highest_rung + 1` while a rung is left; none when Complete or when no rung was
    recorded. An Incomplete ladder must record its completed-through count (0 allowed) before
    partials can attach (TASK-013 / TASK-015).
- **Applicable load — `loadApplies`.** The set logger's base load rule (`incrementFor(equipment_used)`
  not null), so a timed movement and a set of the same movement agree. The set logger also shows
  load fields on unloaded equipment when a weight is carried forward or already recorded; that
  exception has no counterpart here, because a timed attempt has no earlier movement row to carry a
  weight from and `loadApplies` admits no weight on unloaded equipment, so none can be saved to
  correct. One actual load per movement per attempt; a load that changed between rounds is not
  representable (a product question, not decided here).
- **Values — `movementActualFromDraft`.** The amount goes to the column of the prescription's
  modality, with its own distance unit, bounded exactly as a set (`setLogViolation`): whole
  non-negative reps and seconds, non-negative distance and weight. Blank is null; `0` is kept. An
  amount without a round is refused (`round_number`); a load on an unloaded movement is refused; a
  ladder amount above that movement's target at that rung is refused (the accepted log's input
  `max`). AMRAP and For Time amounts have no source-defined upper bound. Nothing reads `load_value`
  or a target to fill a value.
- **Progress change — `draftsAfterProgressChange`.** An amount belongs to one round: when the round
  identity changes every amount is cleared (never carried to the new round) and every load kept (the
  accepted owner's rule).
- **Identity in storage.** One MIG-B row per movement per block attempt (UNIQUE
  `workout_exercise_id`, client-minted `id`), only when an amount or a load was entered. TASK-031's
  writer inserts it once, restates it by an UPDATE addressed to the movement on a 23505 (retry or
  correction), and removes it when the movement is cleared — never a zeroed row.
- **Readback.** History reads each movement's `round_number` partial and load with its movement and
  round (`movementActualReadings` → `BlockDetailView.movementActuals`: `Round 4` / `Rung 3`,
  `5 reps`, `24 kg`), and the block effort as its category (`BlockDetailView.effort`) — never on the
  1–10 scale (`timed-read-model`, TASK-031). The reconstruction carries each exercise's
  `movement_result` (MIG-B redefines `session_reconstruction`). TASK-047 proves Workout → Summary →
  History save, retry and reload.
- **Decided for TASK-015 (owner decision, 2026-11-10): the AMRAP keeps its single "Reps into the
  next round"** count (`partial_round_reps`, read by the conditioning score) beside the per-movement
  next-round amounts; neither is derived from the other. The per-movement amounts are asked only
  once a rounds count is recorded (an explicit 0 gives round 1), per `partialRoundFor`.
- **Decided for TASK-015 (owner decision, 2026-11-10): the multi-round For Time records loads
  only** — no partial round, no new rounds-count control, and `partial_round_reps` is not written.
  So a multi-round race keeps no round identity and no movement amount (`partialRoundFor` is
  unchanged); a single pass keeps round 1, where in-round and total are the same thing. Nothing is
  derived from the per-movement amounts or filled from the plan.

## 7. Isolated prerequisites (AC-R030-03)

TASK-030 applied nothing. TASK-031 (#658) landed both migrations as repository files. They are
**Applied** to the hosted project by the owner — LIVE-PRE-1, option A, 2026-11-10, performed
outside this repository and verified by 18 read-only schema/privilege checks with zero rows
(result file `project-workspaces/clear-visual-refinement-2026-11-03/handoffs/LIVE-PRE-1-RESULT-20261110.md`, in the support workspace). Nothing in
the repository applies a migration; TASK-015 adopted the landed writers through the shell's one
completion path once the result file confirmed it.

| Id | Kind | What | Basis | Owner |
| --- | --- | --- | --- | --- |
| `MIG-A` | migration | `block_results.effort public.set_effort` — landed as `supabase/migrations/20261110000029_block_result_effort.sql` | reuses the enum; table-level grants and `to_jsonb(br)` reconstructions need no change | TASK-031 |
| `MIG-B` | migration | `block_movement_results` table, RLS, grants, reconstruction — landed as `supabase/migrations/20261110000030_block_movement_results.sql` | §5 | TASK-031 |
| `block-effort-schema` | schema | landed: `blockResultRowSchema.effort` (`setEffortSchema.nullable().default(null)`); `blockResultInsert` writes `BlockOutcome.effort` by omission when unanswered | MIG-A | TASK-031 |
| `movement-actual-schema` | schema | landed: `blockMovementResultRowSchema` (mirrors MIG-B's CHECKs) and the reconstruction's `movement_result` (default null) | MIG-B | TASK-031 |
| `block-result-correction` | writer | landed: `createWorkoutClients().blockResults.correct` (`blockResultCorrection`), an UPDATE by `block_id` answered with the stored row; unwired | reuse (§5) | TASK-031 |
| `movement-actuals-writer` | writer | landed: `createWorkoutClients().blockResults.recordMovements` — insert, restate on 23505, delete when cleared, in order; unwired | MIG-B | TASK-031 |
| `timed-result-save` | writer | landed: `src/state/timed-results.ts` — `timedResultDraft`, `timedResultRequest`, `saveTimedResult` (record → correct on 23505 → recordMovements), `timedSaveSettled` (draft kept on failure); the data provider for TASK-015/019/026/047; adopted by `BlockCompletionProvider` only (TASK-015: `timedDraftFromReport`, `reportedTimedEntries`) | the writers above | TASK-031 |
| `timed-read-model` | read model | landed: `sessionDetail` → `BlockDetailView.effort` and `movementActuals` (`movementActualReadings`) | MIG-A, MIG-B | TASK-031 |
| `timed-entry` | draft | landed by TASK-015: per-movement partial and load entry in `TimedResultLog` (AMRAP, For Time and ladder families; labels from the recorded progress; blank unrecorded, 0 kept; the same rule that builds the row refuses inline), the entries on each family's own draft owner, the effort reported and saved as the block's category; saved through the shell's one path | §6; `src/data/refinement-logging-rules.ts` | TASK-015 |
| `ladder-durable-draft` | draft | landed: durable ladder progress, draft, Finish checkpoint and original cap — `usePersistedLadder` (`clear.workout-ladders`) over `src/state/ladder-recovery.ts`; adopted by TASK-013/014/046/048 | `workout-persistence.ts` | TASK-032 |
| `visible-proof` | read model | Workout → Summary → History save, retry and reload proof on the real test lane (disposable namespaced users) | PRE-001 + `LIVE-PRE-1` | TASK-047 |
| `LIVE-PRE-1` | live authority | owner decision: apply MIG-A and MIG-B to the hosted project TASK-047's real lane writes to — per the repository's docs, the reused live (production) project | no task in this body is authorised to change a hosted database | owner |

`LIVE-PRE-1` is not covered by PRE-001 (which checks only Auth health and REST availability). It
was taken by the owner on 2026-11-10; TASK-047's real-lane proof can now be made.

### Exact live authority (TASK-031 exposed it; the owner took it on 2026-11-10)

- **What:** exactly two migrations, in order — `20261110000029_block_result_effort.sql` (MIG-A) then
  `20261110000030_block_movement_results.sql` (MIG-B). Both are additive: one nullable column, one
  new table with its policies and grants, and a `create or replace` of `session_reconstruction`
  with the same signature and privileges. No existing row is rewritten or backfilled.
- **Where:** the hosted Supabase project the app and TASK-047's lane use. The repository documents
  one: the reused live project `qxckevxniacktaqecypl`
  (`docs/process/IMPLEMENTATION_PLAN.md`), where the "disposable" lane is namespaced test users, not
  a separate database. Unless the owner names another project, this is a **production schema
  change**.
- **Who:** the owner, or someone the owner explicitly authorises for that release step. No
  task in this body — TASK-031 included — is authorised to run `supabase db push`, `supabase link`,
  `psql` or any write against a hosted project.
- **How (documented release step, for the owner):** `docs/process/generation-reliability/release-checklist.md`
  §3.1 — a tracked push dry run that must list only these two files, then the push; then fresh hosted
  Standing RLS.
- **Taken (owner, 2026-11-10):** exactly those two files, in order, applied through the owner's
  authorised procedure and verified read-only (18/18 checks; history aligned to the repository
  versions; zero movement rows and zero non-null efforts; the reconstruction body equal to MIG-B).
  Recorded in `project-workspaces/clear-visual-refinement-2026-11-03/handoffs/LIVE-PRE-1-RESULT-20261110.md`.
- **What waited on it:** TASK-015's adoption of the writers (done, through the shell's one
  completion path) and TASK-047's real write/readback proof (still TASK-047's). A shipped save
  with no effort and no typed entry still omits `effort` and never touches
  `block_movement_results`.
- **Access-policy register (TASK-015):** with MIG-B live, `scripts/e2e/dispositions.mjs` lists
  `block_movement_results` as `seeded: true` and the shared seed (`scripts/e2e/lifecycle.mjs`)
  writes one row per slot on the seeded workout exercise, so the hosted Standing RLS matrix
  (`.github/workflows/rls-standing.yml`, gated by `E2E_LIVE_SCHEMA_READY`) has its positive
  control; the matrix's owner write restates the row's `weight` because MIG-B grants no
  `created_at` update.

Nothing applies a migration automatically: no repository workflow pushes migrations (CI only checks
`database.types.ts` against the migration files, `npm run gen:types -- --check`).

## 8. Validation (what the checks prove, and what they do not)

- **check-01** (`src/state/schemas.test.ts`, describe "TASK-030 logging field ownership at the
  schema boundary"): the schemas each moment validates with keep null distinct from zero for every
  column the matrix names; `perceived_effort` keeps its 1–10 number at both ends (the writer's
  `isPerceivedEffort` agrees with the column at every boundary) and refuses every category;
  per-set effort is exactly the three categories beside an untouched `rpe`; mood is 1–5; the
  rest-day and debrief bounds; and every schema the matrix names is a real export.
- **check-02** (`src/data/refinement-logging-contract.test.ts`): the 16-moment inventory and its
  reconciliation; every named source is a real export, every existing column is in the generated
  types and every proposed one is still absent; this document states the same facts as the typed
  contract; consumer rehearsal of every existing moment through the app's own clients and readers
  over the migration-transcribed double (sets, corrections and clears, block outcomes with refused
  save and retry, notes, debrief and rest days); categorical effort never becoming a number; the
  anchor/deload consequence of reusing set logs; the proposed identities from the real outcome
  functions, including For Time by the block's real `rounds` (round 1 only for a single pass; a
  3-round race stopped in round 3 has no round without a recorded count, and round 3 with a count
  of 2), beside `conditioningScore`'s reading of a capped For Time; and the isolation of the
  drafts.
- **TASK-031 check-01** (`src/data/refinement-timed-actuals.test.ts`): the landed MIG-A/MIG-B
  mappings, writers and read model over the same double (now also answering as the hosted project
  before `LIVE-PRE-1`): per-movement/round/block identity, category versus legacy numeric effort,
  notes, null versus zero versus unreported, correction identity, retained errors with the draft
  kept, idempotent retry without duplicate rows (23505 and lost answers), the hosted-schema
  degradation, and History reading actual entries rather than planned values.
- **TASK-015 check-01** (`src/ui/timed-result-log.test.tsx`, the TASK-015 cases) and **check-02**
  (`e2e/refinement/task-015.spec.ts`): the entry on the real `/workout` route — which fields
  appear for which family and progress, their labels, units, bounds and inline refusals; blank
  versus zero; the save through the shell's one path over the migration-transcribed double
  (rows, identity, effort as a category, a refused movement write with the draft kept, the retry
  converging without a duplicate); readback after a reload and once saved; History; the gallery
  states `amrap`, `for_time` and `ladder` over memory only.
- **Not proven here:** that Postgres agrees with the double (the real lane is TASK-047's), or
  the Workout → Summary → History proof on that lane.

## 9. Gallery disposition: not applicable

REQ-030's coverage entry (`src/dev/gallery-refinement-coverage.json`) is "explicit non-gallery
disposition" with no states and no shared owners. TASK-030 changes no consumer, so no gallery state
needs consumer adoption; the existing `/gallery/refinements` logging states (`amrap`, `for_time`,
`ladder`, `emom`) render the route's own blocks over refusing clients and save nothing. No synthetic
writer is added to the gallery or anywhere else.

TASK-031 keeps the same disposition: an explicit non-gallery data and operational obligation. It
adds no consumer of the new writers or read-model fields, so no gallery state adopts them; the two
gallery/preview literals that build a `BlockDetailView` (`src/dev/gallery-registry.tsx`,
`src/app/FormatPreview.tsx`) only state the new fields as unanswered/empty, which changes nothing
they render. No synthetic production writer is added.

TASK-015 adopts the accepted states `amrap`, `for_time` and `ladder` (reference
`eded158cfd928d382c9a9409e2c372270312741d`) through actual consumer adoption: those states already
render the route's own `AmrapBlock`, `ForTimeBlock` and `LadderBlock`, so the per-movement fields
they now draw are the route's, over memory-only records and the shell's own completion path with
refusing clients — no gallery-only form, no duplicated route CSS and no synthetic writer. The
AMRAP's finished-early attempt and the For Time's capped attempt seed one typed entry each as
examples (distinct from the plan's targets and loads).

## 10. Observations recorded, not changed

- History has no reader for the per-set effort category or for movement notes. No task in this body
  is assigned either; they are recorded for the owner.
- A block result is insert-once on the shipped path: a retry with changed values after a lost answer
  is absorbed by the 409 rule. TASK-031's correction writer and `saveTimedResult` fix this for timed
  results once TASK-047 wires them.
- `src/ui/block-renderers.tsx`, `block-completion-control.tsx` and `block-completion.ts` still say an
  EMOM supplies `minutes_completed`; none has since REQ-014/E01 (first recorded by TASK-011). Those
  comments are left; `DATA_MODEL.md` §8's timer-contract line said the same and is corrected by this
  task (documentation only).
- The EMOM note and the ladder answer are memory-only drafts today (TASK-011, TASK-010); durability is
  TASK-032 (ladder; the owner has landed, its route adoption is TASK-013/014/046/048) and
  TASK-031/TASK-047 (results).

## 11. Sources and traceability

- `ref:accepted-gallery/docs/design/library/refinements-2026-11-04/LOGGING-FIELDS.md` sha256 `ab9d7ff1ccb10ec0dd6bb19c351369b0b06dde708c9f54246ae87a4a7a214a7f`
- `ref:accepted-gallery/docs/design/library/refinements-2026-11-04/REUSE.md` sha256 `9f6b702c6daa40626c2ca3c47740be1862b538c72b0edfec18834aac36f8ce46`
- `ref:accepted-gallery/src/dev/gallery-refinement-data.ts` sha256 `754d30d34f420ac92e349910e07bf1e6b0b79483dc704872af484806ddeb87c0`
- `ref:accepted-gallery/src/dev/gallery-refinement-coverage.json` sha256 `6253aae08c731978308e700e32a32162e5299b1f74fe5a15d02239ac787e772a`
- `ref:accepted-gallery/src/ui/refinements/timed-result-log.tsx` sha256 `a293b6741a7a3e39aaffa5d68c211c19b259c54f7f0d222768b2799d69ed098f`
- `ref:accepted-gallery/docs/design/library/refinements-2026-11-04/authority/CURRENT-REQUIREMENTS-AUTHORITY.md` sha256 `6916f4a3c2d798807792e7ff80fed684985cd5a7f8e8cb4ef651bb997d3b194c`
- `ref:accepted-gallery/docs/design/library/refinements-2026-11-04/authority/INDIVIDUAL-CORRECTION-REGISTER-2026-11-03.md` sha256 `82b1daa663ff4d8001b78e40cfaef73ecba48f71e65000e397ff34caf9698de5` (R43, R62, R63, R69, R76, R80, R84, R112, R115, R116)
- Repository: `supabase/migrations/20260921000003`, `…0004`, `…0010`, `…0011`, `…0012`, `…0014`, `…0015`,
  `20261027000027`, `20261027000028`; `src/state/schemas.ts`; `src/data/database.types.ts`;
  `src/data/workout.ts`, `summary.ts`, `rest-days.ts`, `exercises.ts`, `anchors.ts`;
  `src/state/block-completion*.ts*`, `set-logging*.ts*`, `set-observation-mutation.ts`,
  `session-detail.ts`, `conditioning.ts`, `deload.ts`, `amrap.ts`, `for-time.ts`, `ladder.ts`.

| Criterion | Where |
| --- | --- |
| AC-R030-01 matrix | §2, §3; `LOGGING_MOMENTS`, `LOGGING_FIELDS`; check-01, check-02 |
| AC-R030-02 effort, reuse versus migration | §4, §5; check-01 effort cases; check-02 AC-R030-02 cases |
| AC-R030-03 validation and isolation | §6, §7, §8; check-02 AC-R030-03 cases |
| JOURNEY-015, -019, -026, -031, -032 (foundation provider) | §2 owners, §6, §7 |

## 12. TASK-031 landing (amendment)

- Migrations: §7 (landed; **applied** by the owner's `LIVE-PRE-1` on 2026-11-10, after this
  amendment was written).
- Statuses: `block_results.effort` and every `block_movement_results.*` field carry the
  `pending-live-migration` status TASK-031 introduced; the status name is TASK-031's and is kept
  as the matrix's identity for these fields, now read as "declared by a repository migration,
  applied to the hosted project on 2026-11-10, written by the shell's one completion path since
  TASK-015 (§13)".
- Changes from the TASK-030 draft: `updated_at` is stamped by the existing `set_updated_at()`
  trigger instead of being granted to the client; the `performed` reconstruction keeps a superseded
  prescription that carries a movement result (as it keeps one with set logs, D6); the correction
  is an UPDATE addressed to the movement (`workout_exercise_id`), so the first id stays.
- Explicit degradation: a writer refused by a project without MIG-A/MIG-B answers its error with
  `details.reason: 'migration-not-applied'` and `details.migration`; nothing is dropped to make it
  pass, and the caller keeps its draft.
- JOURNEY-031 is **not** claimed complete; TASK-047 owns it.

## 13. TASK-015 adoption (amendment)

- Entry: `TimedResultLog` draws the accepted per-movement groups for its AMRAP, For Time and
  ladder families (`movements`: the block's exercises, the consumer's `partialRound`, the unit, the
  typed values and one writer per movement). An amount field appears only while a partial round
  applies, labelled with that round (`Completed in round N`; the single-pass For Time's
  `Completed`) in the movement's own unit and bounded where §6 bounds it; a load field only on a
  loaded movement, in the athlete's unit. The same `movementActualFromDraft` that builds the row
  says inline what an entry is refused on. EMOM loads and notes for the other families are not
  drawn (TASK-046).
- Drafts: `AmrapState.movements`, `ForTimeState.movements` (new optional fields on the existing
  records; absent until typed, so older records are rewritten unchanged) and the ladder's
  `LadderDraft.movements` (TASK-032's). Effort stays the renderer's memory.
- Save: `BlockCompletionApi.reportTimedResult` (the one control, `BlockCompletionControl`) →
  `BlockCompletionProvider` → `saveTimedResult`, as §2 and §7 state. Rules the shipped graph runs
  live in `src/data/refinement-logging-rules.ts`, re-exported unchanged by the contract module.
- Decisions recorded in §6; the register and the seed in §7.

## 14. TASK-047 adoption and visible proof (amendment)

- Entry (AC-R031-01; LOGGING-FIELDS; G07; R80, R84): the "proposed still" fields of §2 now have
  entry in `TimedResultLog`. Every family closes with one feedback group: the existing three-face
  effort (`SetEffortChoice`, legend `Effort · optional`) and the existing optional notes
  (`Notes · optional`). The AMRAP takes both (R80). The For Time and ladder add notes beside their
  effort. The EMOM adds the effort and each loaded movement's actual load (`Weight used`; no amount,
  because `partialRoundFor` gives an EMOM no round; R84).
- Drafts: the notes, the AMRAP's and EMOM's effort and the EMOM's loads are each consumer's memory,
  as the EMOM note and the For Time/ladder effort already were. They are kept through close and
  reopen, a refused save and its retry, and lost on reload before a save. Durable drafts for these
  are not added.
- Save: unchanged path. The consumer reports the notes in its outcome (`block_results.notes`) and
  the effort and loads in its `TimedResultReport` (`block_results.effort`, load-only
  `block_movement_results` rows for the EMOM). A report with an effort or a typed entry saves
  through `saveTimedResult`; a notes-only report takes the bare insert, as the EMOM note always did.
- Readback: History `/history/:id` draws `BlockDetailView.effort` through `SetEffortReading` beside
  the block's outcome, and each `movementActuals` entry under its movement as
  `Actual Round N · amount · load` (`Rung N` for a ladder; a load alone without a round).
- Proof: `e2e/refinement/task-047.spec.ts` (check-01). Two cases run on the authorized disposable
  backend lane (PRE-001) and fail when it is absent. Two run the same journeys on a contained
  synthetic lane. One covers the four gallery states.
- Not changed: the typed matrix in `src/data/refinement-logging-contract.ts` still lists these
  fields under `proposed` for the timed moments, as TASK-015 left its own landed fields there.
  Reconciling it is housekeeping for the owner of that matrix.
