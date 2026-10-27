# TASK-014 — Circuit rounds, timing and round-history display

Issue #534 · REQ-017 · role: completion-owner for JOURNEY-013.
Task-owned progress record; it stands in for the shared daily journal for this task.

## Outcome intended

Circuits keep compact numbered rows, accessible logging and a concise coaching disclosure, and
opening logging uses the accepted half-sheet pattern. Logging stays optional. The round clock has
an initial **Start round 1** and subsequent **Finish round N** actions, with elapsed round timers
and durations. Shared rest is kept, and the next round's clock starts after the rest. Clock
controls are separate from movement logging. The round history shows elapsed durations only;
stored start and end timestamps are kept but not shown.

## Baseline, as found (HEAD `94c76d7`, contains `7f0a367`)

- The circuit card offered **Finish round N** from the start. It had no round clock, no elapsed
  durations and no round history. During rest, **Start round N** ended the rest early.
- **Log load and reps** expanded the row into the shared logger. A second tap, its **Log set**,
  opened the half-sheet.
- PRE-001: `git merge-base --is-ancestor 7f0a367… HEAD` passed. PRE-002: the design system
  declares 0.14.3, and `git diff 7f0a367 HEAD -- src/design-system` is empty. It is still untouched.
- `gh issue view` needed approval in this worker, so the approved task body was the contract. Issue
  comments were not read by the worker. The controller read the existing issue and verified zero comments.

## What changed (local, unpublished)

- `src/state/circuit.ts`: `CircuitState` gains two optional fields:
  - `roundStartedAt`: when the current round's clock started (ISO).
  - `history`: one `{ round, startedAt, endedAt }` per finished round.
  - Both are optional, so records stored before this change still restore.
  - New pure functions `startRound`, `finishRound`, `endRest`, `takeBackRound` and
    `roundDuration`. The last two moved here from the block.
  - `finishRound` sets the next round's clock to start when the shared rest ends: at once with no
    rest, and never after the last round. `endRest` starts it from the tap instead.
  - Take back reopens the round on the clock it was finished on and removes that round's
    history entry.
  - `clampCircuitState` retains the stored history and known clock metadata; controller recovery
    also restores missing legacy clock metadata from a known rest deadline without inventing history.
- `src/state/workout-persistence.ts`: the stored-record guard accepts and validates the new
  optional fields.
- `src/ui/circuit-block.tsx`:
  - The round controls are a `role="group"` named "Round clock". It shows **Start round N**
    until a round clock is running, then a `TimerFrame` count-up named "Round N time" with
    **Finish round N**. During rest it keeps the existing **Start round N**.
  - A "Round times" list shows each finished round's elapsed duration only, with a spoken
    equivalent. No wall-clock times are drawn.
  - **Log load and reps** opens the shared half-sheet in one tap.
- `src/ui/set-logger.tsx`: new optional `openSheetOnMount` prop. It is not one-shot, so a
  StrictMode remount, whose cleanup closes the sheet, opens it again.
- Tests:
  - New `src/app/circuit-rounds.test.tsx`: 12 real-route cases, grouped by AC-061, AC-062 and
    AC-063.
  - 5 new pure cases in `circuit.test.ts`.
  - `circuit-block.test.tsx`, `rest-footer-lifecycle.test.tsx`, `Workout.test.tsx` and
    `movement-countdown-circuit.test.tsx` were updated for the initial Start. Rest assertions are
    now scoped to the "Time remaining" timer, because a round timer is now present.
- Nothing changed in GitHub or any external service.

## Decisions and assumptions (for review)

- **Finish needs a running clock.** Before Start, Finish is not offered, so recording round 1
  takes two taps (Start, then Finish). Round recording and movement logging both stay optional,
  and the section's forward action saves the block either way.
- **Next-round clock after rest:** it starts when the rest ends on its own or when the athlete
  ends it early, with no extra tap. With no rest prescribed, Finish starts the next round's clock
  at once.
- **Legacy records** without a known clock/rest origin resume at **Start round N**, and rounds
  already counted gain no invented duration. A legacy rest stamp supplies the accepted next-round
  clock deadline; after expiry its elapsed time is retained across reload.
- **Take back** removes the taken-back round's history entry and resumes its clock from the
  stored start. This is the existing correction path, not a display change.

## Failures and corrections

- First named-test run: 3 of 12 failed. The sheet did not open in the real shell. StrictMode's
  simulated unmount closed it, and a one-shot guard then stopped it reopening. The guard was
  removed.
- First full run: 24 failures. 22 were old-flow tests that clicked Finish round 1 straight away or
  asserted no `timer` role at all; they were updated. The other 2 were the known audit blocker
  below.
- A `replace_all` edit missed one test that had no blank line before its Finish tap; fixed by hand.
- Discrimination check: starting the next round's clock at Finish, ignoring the rest, failed 3 of
  the 12 named cases. Reverted, and all 12 pass again.

## Initial worker verification

| Command | Result |
| --- | --- |
| `npm test -- circuit-rounds` | pass, 1 file / 12 tests |
| `npm test` | **fail**: 2 of 5727, both in `src/test/design-0143-final-audit.test.ts` (blocker below); 228 of 229 files pass |
| `npm run lint:ds` | pass |
| `npm run build` | pass (existing >500 kB chunk advisory only) |
| `npm run lint` | pass, 0 errors (141 warnings, unchanged) |
| `npm run typecheck` | pass |
| `npm run gen:types -- --check` | pass, types current |
| `python3 scripts/gen-issues.py --check` | pass (71 requirements, 136 edges) |

## Initial verification stop: runtime-source-bound audit evidence

This is the same blocker as TASK-006/007/009/011/012/013. Any runtime change in `src/` changes
the runtime-source hash, so two checks in `design-0143-final-audit.test.ts` fail:

- *proof labels › bound to the runtime source of this tree*
- *TASK-034 AFTER evidence*

Fixing them means committing the tree and re-capturing the four-skin mobile format-preview group
against a disposable authenticated backend. This worker cannot do that. No record, hash or audit
text was edited, because that would fabricate evidence.

## Controller review and bounded recovery

Initial candidate `886a823` preserves the worker outcome. Native run
`4eb44af3-53f9-4b4f-82ba-fa89cd434e5b` remains on attempt 1 of 2; no coding-model retry,
state reset or Runner change was used.

Independent state review found a legacy in-rest cache with no new roundStartedAt. It restored the
round count and rest stamp but lost elapsed time after the known rest deadline. Recovery derives
only the next clock origin from that deadline, retaining the raw legacy cache and timestamps and
creating no past round history. Two real-route regressions failed before repair and pass afterward;
pure tests also cover early-rest override and unreadable legacy timestamps. The relevant focused set
passed **133 tests across six files**, plus typecheck, design-system lint and diff checks.

The existing JOURNEY-025 browser spec is adapted to the actual pinned half-sheet, with no inline
form, and the initial Start action. It also verifies elapsed time alone records nothing and the
explicit Finish creates one elapsed-history entry. Ordered work, optional logging, background/rest,
reload, save-failure/retry, exact Summary and zero-model-request assertions are retained.
Actual browser execution is still required before this task is declared complete.

Root review confirmed the narrow state repair and browser assertions; UI review found no additional
runtime blocker, including StrictMode sheet ownership and stable movement countdown placement.
Timing history uses the existing active-session circuit cache and survives remount/reload; hiding
wall-clock labels retains the stored startedAt/endedAt fields.

Next is actual browser execution from committed repaired source, followed by genuine mobile
format-preview capture and same-attempt native verification. Deployed and physical-iPhone behavior
are not inferred.
