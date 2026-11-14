# TASK-032 — Provide durable ladder draft and clock recovery state (#659)

Body `clear-refinement-v2-20261109b`, attempt 1, base `54cdca7` (after TASK-039 #679, TASK-001 to
TASK-012 and TASK-030, #680 to #692). Task-owned progress note: the approved exception to the shared
daily journal for this body. Only TASK-032 writes this file.

## Intended outcome

REQ-032 (TASK-AC-381E586395ED, TASK-AC-406D2CE971AA, TASK-AC-A168ED4B8418). Role: foundation provider
for JOURNEY-032; completion owner of no journey. The work is the durable state contract of one live
ladder attempt, built on the existing state/persistence and wall-clock owners:

- ordered rung progress;
- the current result draft;
- the accidental-Finish checkpoint;
- the original cap and the paused/elapsed clock identity.

Deterministic restoration and expiry tests prove it. It also exposes the interfaces that TASK-013,
TASK-014, TASK-046 and TASK-048 consume.

**JOURNEY-032 is not claimed complete.** No route renderer, gallery state, migration, live call or
server writer changes. The route's ladder still keeps its answer in memory until those tasks adopt
the owner. TASK-048 owns complete visible reload/reconnect/Undo/save recovery.

## Design (from the approved sources, not new product decisions)

**Where it lives.** It reuses both existing owners and duplicates neither.

- `src/state/ladder-recovery.ts` (new, pure, React- and storage-free) holds the state. Its clock is
  the existing For Time race clock (`ForTimeState`). Only `for-time.ts` (`startForTime`,
  `finishForTime`, `forTimeView`) and `timed-lifecycle.ts` (`pauseClock`, `resumeClock`) move it,
  and it is read against the wall clock through `workout-clock.ts`'s `elapsedSeconds`. This is the
  same clock every raced ladder already runs (TASK-006). No new clock arithmetic was added.
- `src/state/workout-persistence.ts` (the existing persistence owner) keeps it under a new key,
  `clear.workout-ladders`: one versioned record per block id.
  - A separate key is needed because the existing ladder clock writer (`usePersistedForTime` in
    `useLadderRace`) rewrites the For Time record from its own clamped state, and would drop any
    ladder fields stored beside it. This is the module's own "separate writers, separate keys"
    argument.
  - `clearWorkoutShellState` drops the new key with the others at session end. By then the row is
    saved or the workout abandoned.

**Identity (AC-381E).** Each record carries `{ sessionId, blockId, attemptId }`. The attempt id is
minted once (injectable; `crypto.randomUUID` by default).

- A record restores only for its own session and block.
- A record from another workout, one filed under another block's id, one of another or no version,
  or a malformed one restores nothing, and the reason is reported (`discarded`).
- The same block in the same workout under another attempt is never overwritten:
  `writeLadderAttempt` answers `refused` and the hook adopts the stored attempt (the two-tab case).
- Restoring makes the record safe for the block: the clock is repaired by `clampForTimeState`, and
  a rung the ladder no longer has is dropped, not clamped.

**Clock semantics (AC-406D).**

- A reload counts the time closed while the clock ran and none while it was paused (TASK-006's
  confirmed pause semantics, R98).
- `originalCapSeconds` is stamped when the attempt is created and is never re-read from the block
  (R124: no unrequested deadline extension).
- Expiry is derived, never written (the AMRAP posture). After the cap there is no Pause, Resume,
  check-off, Finish or Undo.
- `ladderRaceCapSeconds` is the same expression the route's ladder clock reads: a capped window's
  own cap, else `timer_seconds`. A schedule has none.

**Progress.** One number, "rungs completed through" (0…rungs), as the accepted owner's
`completedThrough` is. `null` means never tracked, which is not zero. Check-off is live only while
the clock runs or is paused (the accepted gallery controller).

**Finish and Undo (C36, C38, R69, R124).**

- Finish stops the clock where it is (at the pause for a paused clock, `clockStopMoment`). It
  carries tracked progress into the editable draft: every rung means Complete with the top rung;
  fewer means Incomplete through the last rung checked. Nothing tracked leaves the athlete's own
  answer, which keeps TASK-010's behaviour. The checkpoint records the pause stamp, progress and the
  pre-Finish answer.
- Undo applies "as though it had not occurred". A running clock resumes from the same start, so the
  time spent finished counts (the gallery's controller keeps ticking while finished). A paused clock
  is paused again at the same moment. Live progress comes back from the draft's rung (the gallery's
  `setProgress(draft.highestRung)`). The draft's entries stay. The ending answer goes back to its
  pre-Finish value, so an answer given to the ended attempt is undone (and For Time's
  `workCompleted` is not carried).
- Undo is unavailable when there is no athlete's Finish (cap, legacy, never finished), once the
  clock it would resume is at the original cap (`expired`), and after a save (`saved`).

**Save authority (AC-406D).**

- A failed save changes only the save state; the draft, progress and checkpoint stay for the retry.
- A successful save (`saveSucceeded(attemptId)`, ignored for another attempt) closes the attempt as
  a one-way latch: no Undo, no edit, no clock action. A clock still running stops at the save.
- The server's word that the row exists (`recorded`, from the provider's `isBlockRecorded`) also
  closes it, as `source: 'server'`. Then no local draft is claimed (`authority: 'saved-elsewhere'`),
  following TASK-010's rule that a saved ladder whose draft was lost claims no answer.
- The block writer is insert-once, so a retry never duplicates the row.

**The outcome.** `ladderDraftOutcome` keeps the existing ladder mapping (Complete is the top rung,
Incomplete is the stated rung or nothing) and yields `highest_rung` only, with 0 now representable
(TASK-030: TASK-013 records it).

- Effort, notes and per-movement entries are held durably for their owners (TASK-015, TASK-031,
  TASK-046) and never written from here. Writing the ladder's notes would land TASK-030's proposed
  `block_results.notes` for the ladder, which is TASK-015/046's.
- A change of rung clears movement amounts and keeps loads (TASK-030's `draftsAfterProgressChange`
  rule).

## Interfaces exposed (AC-A168) and who consumes them

Documented in `src/state/README.md` ("Ladder attempt recovery (TASK-032)") and in `PROJECT_MAP.md`.
The check asserts every name is a real export and documented, with one row per consumer.

- `ladder-recovery.ts`
  - Record: `LADDER_ATTEMPT_VERSION`, `EMPTY_LADDER_DRAFT`, `createLadderAttempt`,
    `adoptLegacyLadderClock`, `clampLadderAttempt`.
  - Cap: `normalizedCapSeconds`, `ladderRaceCapSeconds`.
  - Read model: `ladderClockView`, `ladderAttemptView` (`lifecycle`, `ended`, `authority`,
    `progress`, `canTrack`, `draft`, `editable`, `outcome`, `undo`, `saveFailed`),
    `ladderUndoAvailability`, `ladderDraftOutcome`.
  - Actions: `startLadderAttempt`, `pauseLadderAttempt`, `resumeLadderAttempt`,
    `trackLadderProgress`, `finishLadderAttempt`, `undoLadderFinish`, `editLadderDraft`,
    `ladderSaveSucceeded`, `ladderSaveFailed`, `ladderRecorded`.
  - TASK-030's two ladder rules, restated: `ladderPartialRound`, `movementsAfterRoundChange`.
- `workout-persistence.ts`: `WORKOUT_LADDER_STORAGE_KEY`, `isLadderAttempt`, `readLadderAttempt`,
  `writeLadderAttempt`, `restoreLadderAttempt`, and the hook `usePersistedLadder`. The hook covers
  `start`, `pause`, `resume`, `finish`, `undoFinish`, `track`, `editDraft`,
  `saveSucceeded(attemptId?)` and `saveFailed(attemptId?)`, and reports `source`, `discarded` and
  `durable`.

What each consumer must do:

- **TASK-013.** Replace `usePersistedForTime` in the ladder's race with `usePersistedLadder`, for
  the clock and progress together; never run both clocks.
  - Move the answer, rung and effort into `editDraft`, and report `outcome` through
    `BlockCompletionControl`.
  - Decide how a scheduled ladder uses the record.
  - Refresh the TASK-010 and TASK-012 checks whose assertions change.
- **TASK-014.** Offer the quiet Undo only while `undo.available`, and call `undoFinish`.
- **TASK-046.** Read and write the ladder log through the durable draft. Write effort, notes and
  entries only through TASK-015/031's writers.
- **TASK-048.**
  - Call `saveSucceeded` / `saveFailed` with the attempt id captured when the forward action began,
    and pass `isBlockRecorded` as `recorded`.
  - Make `discarded`, `durable: false` and `saveFailed` explicit on screen.
  - Read back the row when the authority is `saved-elsewhere`, and prefer it over the local echo.
  - Prove it on the real lane.

TASK-030's contract is updated in both halves:

- `PROPOSED_PATHS` `ladder-durable-draft` now names the real export
  (`usePersistedLadder`, no `extendedBy`), with the summary "landed by TASK-032". The `ladder`
  moment's `identity` and `draft` say the owner exists and who adopts it.
- `LOGGING_FIELD_CONTRACT.md` §2 (ladder), §5, §7 and §10 say the same.

No TASK-030 required case changed meaning.

## Persistence compatibility

- **New key, versioned record.** No existing record's shape changed. A record of another version is
  not restored. A write leaves every other block's entry as stored, even one this build cannot
  read.
- **Ladder clocks already in users' browsers.** Every raced ladder has kept its clock under
  `clear.workout-for-time`. When no ladder record exists, `restoreLadderAttempt` / the hook adopts
  that clock once: running, paused and finished alike (`source: 'legacy-clock'`).
  - It gets a minted attempt id, the block's cap as the original cap, no progress and no draft.
  - The hook writes it at once so the attempt id is stable across reloads.
  - A finished legacy clock has no checkpoint, so it cannot be undone (its pause state at Finish was
    never stored).
  - The For Time record is left byte-identical and reads as before. A For Time `workCompleted` beside
    it is not carried.
  - An unreadable or foreign ladder record is not backed by the older clock.
- Tested in check-01 (the legacy-adoption and stale-snapshot cases). The existing For Time,
  AMRAP, EMOM, circuit and shell persistence tests pass unchanged.

## Gallery disposition (templates/gallery-authority.md)

**No gallery state changed. Recorded disposition: not applicable to this task's deliverable.**

- `?state=ladder-4` / `ladder-12` render the route's own `LadderBlock` over an in-memory
  `ShellStorage`, and this task changes no renderer, so both states render byte-for-byte as before.
  TASK-006 check-02 and TASK-012 check-02 (which drive them) re-ran green with identical receipts.
- The accepted reference demonstrates in-memory Undo only, and REQ-032 says durable reload,
  reconnect and original-cap recovery need application integration. That integration's visible
  part is TASK-013/014/048's.
- Adopting the durable owner in a gallery state now would mean either a consumer adoption that
  belongs to them or a synthetic writer, which is not allowed. Neither was added.
- Shared owners `src/ui/refinements/ladder.tsx` and `src/dev/gallery-refinement-flow.tsx` were read
  and left unchanged. `tokens.css` was not touched; no variable is needed.

## Changes

- New:
  - `src/state/ladder-recovery.ts`;
  - `src/state/refinement-ladder-recovery.test.ts` (check-01);
  - `evidence/refinement/task-032/required-cases.json` and receipt `results/check-01.json`;
  - this note.
- Changed:
  - `src/state/workout-persistence.ts`: header paragraph, the new key, the guard, read/write/restore,
    `usePersistedLadder`, and the key added to `clearWorkoutShellState`;
  - `src/data/refinement-logging-contract.ts`: the `ladder` moment's `identity` and `draft` text,
    and the `ladder-durable-draft` path;
  - `docs/specs/LOGGING_FIELD_CONTRACT.md`: §2 ladder, §5 row, §7 row, §10 bullet;
  - `src/state/README.md` (new section);
  - `PROJECT_MAP.md` (one paragraph).
- Unchanged: every renderer (`ladder-block.tsx`, `for-time-block.tsx`), the gallery,
  `block-completion*.ts`, `src/data/workout.ts`, `supabase/`, `.github/`, and
  `src/test/design-0143-final-audit.test.ts`.

## Tests added (check-01, 10 required cases; each with its criterion)

All cases use a fake wall clock (injected `now`), an in-memory `ShellStorage`, injected attempt ids
and the real owners. "Close" is an unmount; "reopen" is a fresh mount over the same storage.

1. **AC-381E round-trip.** Start, check off 2 rungs, then draft effort, notes and a load, and close.
   Reopen 90 s later: identity, version, original cap, progress, draft, and elapsed 150 s running.
   Finish: the checkpoint, the carried draft and the frozen clock. Reopen: the record is identical,
   Undo is available, one key is used and no For Time write happened.
2. **AC-381E stale snapshots.**
   - Another workout's record is discarded as `other-session`.
   - These are each `unreadable` and do not fall back to the older clock: another block id, version
     2, no version, an empty attempt id, negative progress, a zero cap, a non-category effort, a
     fractional rung, a numeric amount, a bad checkpoint, a bad save state, a bad `endCarried`, and
     a bad clock.
   - Garbage JSON is ignored.
   - Two tabs: the second Start adopts the first attempt; another attempt's write is `refused`.
   - Another block's unreadable entry is preserved.
   - Hostile storage still works in memory with `durable: false`.
3. **AC-381E backward compatibility.** Legacy For Time clocks (running, paused, finished with
   `workCompleted`, and never started) are adopted once under a stable id. The For Time record is
   byte-identical and reads as before. The paused one stays frozen after an hour. The finished one
   cannot be undone. An existing ladder record wins over the older clock. Session end clears every
   key.
4. **AC-406D close/reopen and the original cap.**
   - Running then closed: 100 + 200 s, so 300 s elapsed.
   - Paused at 300 s then closed for 2 h: still 300 s.
   - The block's cap now 600 or null: still 420.
   - Resume keeps 300/120, then runs to the cap.
   - `ladderRaceCapSeconds` for legacy, fractional, none, `for_time`, `capped_window` and
     `scheduled_starts` ladders.
5. **AC-406D expiry while closed.** The ladder comes back capped (420/0, `ended`). Pause, Resume,
   Finish, check-off, Start and Undo write nothing. Three tracked rungs carry once to
   Incomplete/3. A later edit to 2 is not overwritten after a reopen. All four rungs tracked give
   Complete/4. A paused clock never runs out.
6. **AC-406D Undo.**
   - Running Finish at 05:00. The log sets rung 3, effort, notes and entries. Reopen 30 s later and
     Undo: the same start with no pause, 330 s elapsed (no time granted), progress 3, entries kept,
     the answer back to unanswered.
   - Finish again at the same rung keeps the entries. A different rung clears amounts and keeps
     loads.
   - Paused Finish: it freezes at the pause, and the checkpoint keeps the pause and the pre-Finish
     Incomplete. Complete is chosen after Finish; then 1 h passes and Undo is still available. Undo
     gives paused at 200 s, progress = every rung, and the answer back to Incomplete. Resume
     continues from 200 s.
   - `ladderPartialRound` and `movementsAfterRoundChange` are pinned equal to TASK-030's
     `partialRoundFor` and `draftsAfterProgressChange`.
7. **AC-406D no resumption after expiry.** Undo is available at 06:59 and `expired` at 07:00 of
   the would-be clock, and writes nothing. The Finish keeps its 05:00, and the draft is intact and
   editable. A reopen with a block cap of 900 is still expired. Finish after the cap writes nothing.
8. **AC-406D save authority.**
   - A failed save keeps the draft, checkpoint and Undo across a reload.
   - A stale attempt's success changes nothing.
   - Success sets `saved-here` and frozen: Undo `saved`, and Undo, edit, check-off, Resume and
     saveFailed write nothing. This survives a reload.
   - Saved mid-race: the clock stops at the save and does not resume.
   - A server row without a local save sets `saved-elsewhere`, claims no draft and has an empty
     outcome. It stays closed when reopened offline.
   - `ladderDraftOutcome`: null is not zero, Complete is the top rung, and effort and notes are never
     in the outcome.
9. **AC-406D through the shell's one writer.** This uses the real `BlockCompletionProvider` and
   `createWorkoutClients` over TASK-030's in-memory PostgREST (`logging-contract-double.ts`),
   mounted with `AppProviders`.
   - A refused save (503) writes no row and the record says `failed`.
   - Reload (a new provider): the draft is restored; the retry writes exactly one row (`highest_rung`
     3, `perceived_effort` null, `notes` null); a further forward sends no request.
   - Answer lost in transit (the row landed, then the fetch throws): the record says `failed`.
     Reload: the provider's performed read finds the row, the hook latches `saved` with source
     `server`, no draft is claimed, Undo is gone, and a forward sends nothing. Still one row.
   - 20 s explicit timeout (CI note).
10. **AC-A168 interfaces.**
    - Every interface name is a real export and appears in the README section.
    - Each consumer has a row with its obligation.
    - The README says "JOURNEY-032 is not complete".
    - TASK-030's contract path names `usePersistedLadder` with no `proposedBy` / `extendedBy`, and
      the spec row says the same.

## Mutation checks

Each mutation was applied to the real file, run, and restored. The restore was confirmed with a
byte comparison against a scratch copy (`scratchpad/mut/run.py`). All 18 were caught:

| Mutation | Failed cases |
| --- | --- |
| M1 Undo freezes at the Finish (time spent finished not counted) | 1 (Undo) |
| M2 restore re-reads the cap from the block | 2 (close/reopen, expiry Undo) |
| M3 Undo ignores expiry | 1 |
| M4 Finish forgets the pause | 1 |
| M5 another session's record restores | 1 |
| M6 another attempt's record is overwritten | 1 |
| M7 a failed save drops the draft | 2 (save, writer) |
| M8 a save leaves Undo available | 1 |
| M9 the legacy For Time clock is not adopted | 1 |
| M10 the outcome carries the notes | 2 (save, writer) |
| M11 check-off after expiry | 1 |
| M12 session end keeps the ladder key | 1 |
| M13 the end carry is repeated over edits | 1 |
| M14 a pause does not freeze the clock | 3 |
| M15 a server row does not close the attempt | 2 |
| M16 Undo keeps the post-Finish answer | 1 |
| M17 a round change keeps the amounts | 1 |
| M18 the partial round may pass the last rung | 1 |

## Sweep

`e2e/` and `src/` were searched for `clearWorkoutShellState`, `clear.workout-*`,
`WORKOUT_*_STORAGE_KEY`, `workout-persistence`, `localStorage.length`, `Object.keys(localStorage)`
and `removeItem`.

- No test asserts the exact set of keys removed at session end.
- `ladder-rungs.test.tsx` asserts that the ladder writes only `clear.workout-for-time`;
  `timed-workout-flow.test.tsx` asserts that the stored keys are unchanged; the gallery tests assert
  `localStorage.length` 0. All three still hold, because nothing in the route writes the new key.
- Backend-lane specs (`e2e/design-0143/workout-ladder.spec.ts`, `workout-lifecycle`, the task-040
  specs, `task-010.spec.ts`) read `clear.workout-for-time`, which is unchanged.
- No DOM, copy or persisted behaviour existing tests assert was changed. No existing assertion was
  edited.

## Failures and corrections

- **The bundle carried TASK-030's contract tables.** `ladder-recovery.ts` first imported
  `partialRoundFor` and `draftsAfterProgressChange` from `src/data/refinement-logging-contract.ts`.
  The production build then grew the workout chunk from 356.12 kB to 367.85 kB: Rollup kept
  `LOGGING_FIELDS` and other tables built by function calls (`block_movement_results`, `TASK-031`
  and `MIG-B` strings appeared in the bundle). The comparison was made against a scratch
  `git worktree` of `54cdca7` outside the workspace, removed afterwards.
  - Correction: the two three-line rules are restated as `ladderPartialRound` /
    `movementsAfterRoundChange`, the contract is imported for its type only, and check-01 pins both
    rules equal to the contract's functions over every rung (mutations M17 and M18 confirm the pin).
  - The chunk is now 356.22 kB, the contract strings are absent, and the contract module's header
    sentence ("Nothing in `src/` imports it at runtime") is true and unchanged.
- **A `.ts` test cannot use JSX.** `createElement` with `children` in props was needed:
  `tsc --noEmit` in `npm run build` caught the missing `children`, which a bare vitest run had not.
- **Lint.** `react-hooks/immutability` refused mutating a `handle` prop inside the harness effect.
  It became an `expose` callback.
- **Wait condition.** The first writer run waited for "more than 2" performed reads. StrictMode's
  read count differed from that assumption, so the wait now compares to the count before the
  remount.
- **Design correction before tests.** Movement amounts compared rounds from the outcome, which made
  Undo-then-Finish at the same rung clear the athlete's entries: Undo restores an unanswered draft,
  whose outcome has no round. The amounts' round now follows the stated rung whatever the answer
  (none once Complete), so entries survive Undo/Finish at the same rung (case 6).
- **Case rename.** Case 6 was renamed before the manifest was generated ("the answer given to the
  ended attempt is undone"), because a paused attempt's pre-Finish answer is restored, not cleared.

## Verification

This worktree, uncommitted candidate on `54cdca7`, 2026-11-10. `npm ci` was run once at the start
(exit 0). This was the final run, after the last source and test edit:

- `node scripts/refinement/run-required-check.mjs --task TASK-032 --check check-01 -- npx vitest run src/state/refinement-ladder-recovery.test.ts --passWithNoTests=false`:
  PASSED. Native 10 total, 10 executed, 10 passed, 0 failed, 0 skipped, 0 todo (10 declared).
  Manifest sha256 `36ace4286476c1a819ca8e7ce912c8c301ff4ed1cd21f8a377684357cc08d45c`.
- `npm run build`: exit 0 (`tsc --noEmit` over `src` and `e2e`, then Vite). The workout chunk is
  356.22 kB against 356.12 kB at base.
- `npm run lint:ds`: exit 0. `npx eslint` on the four changed or new source and test files: exit 0,
  no warnings.
- `npm test`: 265 files, 6243 tests passed, 0 failed. TASK-030 had 264 / 6233, so +1 file and +10
  cases.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,TASK-002,TASK-003,TASK-004,TASK-005,TASK-006,TASK-007,TASK-008,TASK-009,TASK-010,TASK-011,TASK-012,TASK-030,TASK-032`:
  exit 0. Every task has "current passing receipts", and accepted-gallery verified 1193 files.
- `git diff 54cdca7 -- supabase .github src/ui src/dev src/test/design-0143-final-audit.test.ts`:
  empty.
- Not run: the backend-lane specs (they need `.env.runner.local`). None was edited, and none reads
  the new key.
- This note is not a check target, so editing it after the runs leaves every receipt current.

## Earlier-task receipts

- **TASK-030 (check targets read what this task changed).** `refinement-logging-contract.test.ts`
  (check-02) reads the contract and the spec this task edited. Both TASK-030 checks were re-run with
  their exact approved guard commands: check-01 112/112 and check-02 12/12, PASSED. The receipts
  are byte-identical: the targets were not edited and the manifest is untouched. The flip changed
  no case's meaning; check-02's "every source resolves to a real export" now resolves
  `usePersistedLadder`.
- **Re-run for confidence, every one PASSED with a byte-identical receipt.** No other earlier
  task's target was edited and no assertion changed.
  - The vitest check-01 of TASK-001 to TASK-012: TASK-006 17/17; TASK-009 8 executed (9 skipped by
    its pattern); TASK-010 9 executed; TASK-011 9 executed; TASK-012 9/9.
  - The Playwright check-02 of TASK-006 (7/7), TASK-010 (3/3) and TASK-012 (5/5), which drive the
    route's ladder and the `ladder-4` / `ladder-12` gallery states (synthetic origin, no
    credentials).
- `git status -- evidence/` shows only `task-032/`. No other `required-cases.json` was edited.

## Open assumptions / unresolved (for the controller and owner)

- **The carry rule at the end of the attempt.** Tracked progress wins: every rung is Complete with
  the top rung, and fewer is Incomplete through the last rung checked (C36, gallery `finish()`).
  With nothing tracked the athlete's own answer stands (TASK-010).
  - How a pre-Finish answer and live check-off interact on screen is TASK-013's. It can refine
    `finishLadderAttempt` in this owner, recording why.
  - "Never tracked" is `null`, not 0, so a ladder whose athlete never used check-off does not save
    `highest_rung` 0.
- **What Undo restores.** Progress comes from the draft's rung (the gallery), and the answer is
  restored to its pre-Finish value: unanswered in the gallery flow, which clears an answer given to
  the ended attempt. The source says "restores draft/progress/pause" and "draft intact"; this reading
  keeps every entry and undoes only the verdict on an ending that no longer exists.
- **Server-closed before the device's own success.** If the provider's `recorded` flag reaches the
  hook before `saveSucceeded`, the attempt latches as `saved-elsewhere` and claims no local draft.
  That is conservative and never wrong, but less informative. In the tested path (and in practice)
  the save's continuation runs first. TASK-048 should call `saveSucceeded` as soon as the forward
  action resolves.
- **A known insert-once limitation, not introduced here.** An answer lost in transit, then an edit,
  then a retry is absorbed by 23505. The server keeps the first values while this device latches
  `saved-here` with the edited draft. Only TASK-031's correction writer and TASK-048's readback
  (prefer the row) can resolve that. The draft stays editable after a failed save because a retry
  may need a correction.
- **Two tabs on the same attempt are last-write-wins**, as every other per-block record is. Only a
  different attempt is refused.
- **An unreadable record for a block** (for example a newer build's, after a downgrade) is replaced
  by the next write for that block. Other blocks' entries are preserved.
- **Scheduled ladders.** `ladderRaceCapSeconds` gives no cap for a schedule; its end is
  `scheduledRoundAt`. Whether TASK-013 moves the schedule's start stamp into the record is theirs to
  decide.
- **Effort in local storage once adopted.** The durable draft holds the effort category (the
  accepted draft includes it, LOGGING-FIELDS: "Effort/Notes and reversible Finish draft"). TASK-010
  check-01 asserts "no category in storage" for today's renderer. The adopter (TASK-013/046) changes
  that assertion and must refresh TASK-010's receipts under the controller rule.
- **No isolated prerequisite.** Everything is local storage. No migration, live write or server
  writer is needed or added.

## Next action

Controller verification and commit.
