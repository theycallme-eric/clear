# State boundary

Client state machines, query hooks, and cross-screen state coordination belong here.

## What is here now

- `errors.ts` (CORE-01) — the `AppError` union, the `Result` helpers, and the request-ID generator.
- `logger.ts` (CORE-02) — the one sanctioned logging sink, redacting by construction.
- `schemas.ts` (CORE-03) — the runtime-neutral boundary contract for generation envelopes,
  contract 4.1.0 output, and the row shapes `src/data/` reads. A future edge function must import
  this same source rather than restating the schemas in Deno.
- `session-machine.ts` (SES-01a) — the session lifecycle as four states and three events,
  pure. State is derived from the row's three timestamps, exactly as `session_state(...)` does in
  SQL, so there is no status column and no client-side copy to fall out of step with it. Abandoning
  is a state here for the same reason it is a column there: it is reachable from both non-terminal
  states and it is terminal, which is what a delete would not have been. `resumePoint` is the other
  half of a hard refresh — the first unfinished prescription and the set number the next log
  carries, recomputed from what is written rather than remembered.
- `streak.ts` (SES-01c) — consecutive training days, derived. A pure function of session rows and
  an IANA zone: no column stores a streak, so a deleted or abandoned session changes the answer on
  the next read with no repair step. The zone is resolved once into one formatter, and days are
  walked as calendar dates rather than as 24-hour blocks, which is the same distinction one DST
  boundary later. `StreakPolicy` is the named extension point — HOME-02's pause states and rest-day
  allowances arrive as a different policy passed to this same function, never as a second
  derivation beside it.
- `generation.ts` (GEN-03) — generation as a screen sees it: idle → pending → success | error over
  `src/data/generation.ts`, plus the client's context. A mutation rather than a query, because
  generating twice produces two different workouts and nothing here is keyed or cached. Double
  submit is guarded by a ref, cancel and unmount invalidate the run in flight, and the only path to
  `success` is a `Result` that said so.
- `toasts.ts` (DS-05) — the root toast queue; `src/ui/toast-host.tsx` renders it.
- `view-state.ts` (CORE-04) — the four-state contract every data-driven view implements.
- `auth-context.ts` / `auth-provider.tsx` (AUTH-01) — the session context. The context file holds
  the vocabulary (`status`, `user`, `error`, `signOut`) and the pure reducer over `src/data/auth.ts`
  events; the provider subscribes, reduces, and renders. Together they are under 80 lines of code,
  with no ref, no timer, no lock, and no fetch of any kind — a token refresh is one `setState` and
  cannot start a request. `status: 'error'` is the state D1 lacked: a session that could not be
  revalidated is not an anonymous user, and nothing may route it to onboarding.

## Ladder attempt recovery (TASK-032)

`src/state/ladder-recovery.ts` is one live ladder attempt as pure state, and
`src/state/workout-persistence.ts` keeps it under `clear.workout-ladders`, one versioned record per
block id. The record holds the attempt's ordered progress, its result draft, the accidental-Finish
checkpoint Undo returns to and the original cap. Its clock is the For Time race clock, moved and
read only by `for-time.ts`, `timed-lifecycle.ts` and `workout-clock.ts`.

This is a foundation (REQ-032, foundation-provider). No route renderer uses it yet, so
**JOURNEY-032 is not complete** here. Live check-off, quiet Undo, the shared timed log and visible
reload/reconnect/save recovery are adopted by the tasks in the table below. TASK-048 owns the
complete visible recovery.

The rules every consumer inherits:

- **Identity.** A record restores only for its own session and block (`readLadderAttempt`,
  `restoreLadderAttempt`). Another attempt's record for the same block is never replaced
  (`writeLadderAttempt` answers `refused` and the hook adopts the stored one). An unreadable,
  foreign or other-version record restores nothing (`discarded`).
- **Clock.** A reload counts the time closed while running and none while paused. The cap is
  stamped once (`originalCapSeconds`) and never re-read from the block. Expiry is derived, never
  written. After the cap there is no Pause, Resume, check-off, Finish or Undo.
- **Finish and Undo.** Finish stops the clock (at the pause, for a paused clock) and carries tracked
  progress into the draft. Undo restores the clock as though Finish never happened: a running clock
  keeps the time spent finished, and a paused one is paused again. It restores progress from the
  draft's rung, keeps the draft's entries and puts back the pre-Finish answer. Undo is not offered
  after the original cap or after a save.
- **Saved results.** A successful save, or the server's word that the row exists, closes the attempt
  as a one-way latch. A failed save keeps everything for the retry. The block writer is insert-once,
  so a retry never duplicates the row. `ladderDraftOutcome` gives only `highest_rung`. Effort, notes
  and movement entries are kept durably but are never written from here.
- **Older browsers.** A ladder clock already stored under the For Time key
  (`clear.workout-for-time`) is adopted once by `restoreLadderAttempt` / `usePersistedLadder`
  (`source: 'legacy-clock'`). The For Time record is left as it was. A finished legacy clock has no
  checkpoint, so it cannot be undone.

Interfaces:

- `src/state/ladder-recovery.ts`
  - Record: `LADDER_ATTEMPT_VERSION`, `EMPTY_LADDER_DRAFT`, `createLadderAttempt`,
    `adoptLegacyLadderClock`, `clampLadderAttempt`.
  - Cap: `normalizedCapSeconds`, `ladderRaceCapSeconds`.
  - TASK-030's ladder rules, restated so the workout bundle does not carry the contract's tables
    and pinned equal to `partialRoundFor` / `draftsAfterProgressChange` by the check:
    `ladderPartialRound`, `movementsAfterRoundChange`.
  - Read model: `ladderClockView`, `ladderAttemptView`, `ladderUndoAvailability`,
    `ladderDraftOutcome`.
  - Actions: `startLadderAttempt`, `pauseLadderAttempt`, `resumeLadderAttempt`,
    `trackLadderProgress`, `finishLadderAttempt`, `undoLadderFinish`, `editLadderDraft`,
    `ladderSaveSucceeded`, `ladderSaveFailed`, `ladderRecorded`.
- `src/state/workout-persistence.ts`: `WORKOUT_LADDER_STORAGE_KEY`, `isLadderAttempt`,
  `readLadderAttempt`, `writeLadderAttempt`, `restoreLadderAttempt`, `usePersistedLadder`.

| Task | Consumes | What it must do |
| --- | --- | --- |
| TASK-013 (ladder result entry and live check-off) | `usePersistedLadder` (`track`, `editDraft`, `start`, `pause`, `resume`, `finish`), `ladderAttemptView` (`canTrack`, `progress`, `draft`, `outcome`, `lifecycle`), `ladderRaceCapSeconds` | Replace `usePersistedForTime` in the ladder's race with `usePersistedLadder`, for the clock and the progress together; never run both clocks. Move the answer, rung and effort from the renderer's memory into `editDraft`, and report `outcome` through `BlockCompletionControl`. Decide how a scheduled ladder (no cap here; its end is its schedule) uses the record. Re-run the TASK-010 and TASK-012 checks whose assertions this changes (for example "the ladder's draft starts again at Incomplete" and "no category in storage"). |
| TASK-014 (Undo Finish) | `ladderAttemptView` (`undo`), `usePersistedLadder` (`undoFinish`) | Offer the quiet Undo only while `undo.available`, and call `undoFinish`. It already clears the ending answer and restores the pause and progress. Never resume past the cap or grant time. |
| TASK-046 (shared timed logging) | `ladderAttemptView` (`draft`, `editable`), `usePersistedLadder` (`editDraft`), `EMPTY_LADDER_DRAFT` | Read and write the ladder's log through the durable draft, never a second draft. Write effort, notes and movement entries only through TASK-015 / TASK-031's writers. `ladderDraftOutcome` stays `highest_rung` only. |
| TASK-048 (visible reload, reconnect, Undo and save recovery) | `usePersistedLadder` (`source`, `discarded`, `durable`, `saveSucceeded`, `saveFailed`), `ladderAttemptView` (`authority`, `saveFailed`, `undo`), `restoreLadderAttempt`, `readLadderAttempt` | Call `saveSucceeded(attemptId)` or `saveFailed(attemptId)` with the attempt id captured when the forward action began, and pass `isBlockRecorded` as `recorded`. Make `discarded`, `durable: false` and `saveFailed` explicit on screen. Read the saved row back when `authority` is `saved-elsewhere`, and prefer it over the local echo. Prove it on the real lane. |
