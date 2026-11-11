# TASK-048 — Verify visible ladder recovery and accidental-Finish restoration (#674)

Body `clear-refinement-v2-20261109b`, attempt 1, base `b6e269b` (#723, TASK-047 merged; `git fetch
origin` then `git merge-base HEAD origin/build/clear-refinement-2026-11-04` =
`b6e269b6772569b17b5ece8460258c3fc75fd8dc`). Task-owned progress note, the approved exception to the
shared daily journal for this body. Only TASK-048 writes this file.

## Status

Implementation complete (uncommitted), awaiting controller verification and commit. The two
backend-lane cases could not run here: no `.env.runner.local` exists in this worktree, so they fail
at their explicit PRE-001 precondition (see Verification). Every other case passes.

## Intended outcome

REQ-032 (AC-R032-01, AC-R032-02, AC-R032-03), completion owner of JOURNEY-032 (ENTRY-032:
`/workout`). A running, paused or accidentally finished ladder with checked progress, a draft and
its original cap recovers durably across reload and reconnect through the existing owners
(TASK-032's `usePersistedLadder` / `ladder-recovery.ts`, the shell's `BlockCompletionProvider`):
ordered progress, the whole current draft, the accidental-Finish checkpoint, the actual
elapsed/paused time and the original cap. No hidden time extension, no resumption after expiry,
Undo only where valid, a failed save keeps the draft and retries without duplicate actuals, saved or
corrected results are authoritative, and a successful Save removes Undo. The recovery provider is
not recreated.

## Sources read

Brief; RUNNING-SUMMARY; notes of TASK-012, 013, 014, 015, 032, 046, 047; CURRENT-REQUIREMENTS-AUTHORITY
C38/C39 and the R7 paragraph; register R124 and R141 note; accepted reference (eded158c…)
`timed-result-log.tsx` (its failure line), `gallery-refinement-flow.tsx`, REUSE.md and
LOGGING-FIELDS.md (ladder row: "Effort/Notes and reversible Finish draft"); TASK-047's backend-lane
pattern (`e2e/refinement/task-047.spec.ts`); TASK-014's synthetic lane and clock helpers.

## Determinations on the controller's open questions

1. **Is the ladder's notes/effort draft part of the "current draft" (AC-R032-01)? Yes — persisted
   through the existing owner.** Sources:
   - AC-R032-01 (verbatim): "durable reload/reconnect recovery for live ordered rung progress,
     current draft and accidental Finish state through existing state/persistence owners; a
     memory-only reload reset is not accepted." The effort and notes were exactly such a
     memory-only reset (TASK-047's open item: "lost on a reload before the save").
   - TASK-032's owner already defines the draft as including them: `LadderDraft` has `effort` and
     `notes`, and its design says "Effort, notes and per-movement entries are held durably for their
     owners". Its note also predicted this adoption: "TASK-010 check-01 asserts 'no category in
     storage' … The adopter changes that assertion and must refresh TASK-010's receipts."
   - LOGGING-FIELDS.md (accepted reference), ladder row: "Effort/Notes and reversible Finish draft".
   - So `ladder-block.tsx` now reads `effort` / `notes` from the durable draft and writes them with
     `editDraft({ effort })` / `editDraft({ notes })`. Nothing new is stored beyond fields the record
     already had; the category word is stored, never a number. Other families' (AMRAP, For Time,
     EMOM) notes/effort stay memory-only: outside REQ-032 (ladder recovery); recorded as an owner item.
2. **UAT TASK-013 "a just-saved ladder shows no answer if a later block's save fails" — fixed**
   (AC-R032-02 "saved/corrected results remain authoritative"). The provider now tells the ladder
   that its own save was answered (`'saved'`), so the attempt closes as `saved-here` with the draft
   it sent, shown disabled, while the later block's save fails. When the shell knows the row
   (`recordedResult`), the row is read back instead (`ladderDraftFromRow`), ahead of the local echo.
   Proved in journey 2 (both lanes).
3. **UAT TASK-015 "reload after a refused movement write shows entries disabled under 'Block saved'
   with no movement rows" — fixed for the ladder** (JOURNEY-032: "Failed save retains the draft and
   supports retry without duplicate actuals"; AC-R032-03 "save failure"). The ladder's durable
   attempt records the failed save (`saveFailed`). After a reload the performed read reports the
   block row; a ladder whose own richer save failed (effort or a typed entry) now reopens the block
   (`reopenBlock`) instead of closing as saved elsewhere, so it keeps its draft, Undo and the failure
   line, and the retry restates the row (POST 409 → PATCH) and writes each movement once. A bare
   save (no effort, no entry) whose answer was lost still closes on the server's row (TASK-032 case 9
   unchanged). **For Time and AMRAP still show the TASK-015 symptom** — outside this task's ladder
   scope; open owner item.

## Design (from the approved sources; no new product decision)

- **The shell says how a row is known** (`src/state/block-completion.ts`, `-provider.tsx`).
  `onBlockRecorded` listeners now receive `'saved'` (this device's answered save; the richer path's
  23505 → correction counts, since the row then holds the report) or `'known'` (a bare insert's 23505,
  which leaves the row as it was, or the performed read). Listeners with no parameter are unchanged.
  New optional seams: `onBlockSaveFailed(blockId, listener)` (called when the forward action's save of
  that block returns an error, never for a 23505); `recordedResult(blockId)` (the row and its
  movement rows as the shell wrote or read them this session); `reopenBlock(blockId)` (only from a
  `'known'` listener, in the same act: the block stays outstanding, `isBlockRecorded` and the shell's
  progress projection are not told). The provider stays the one save path; idempotency is unchanged.
- **The ladder** (`src/ui/ladder-block.tsx`): `'saved'` → `saveSucceeded(attemptId)` (the attempt
  whose draft was last reported); `'known'` → `markRecorded()`, unless the attempt's save failed and
  its draft carries effort or a typed entry → `reopenBlock`. `onBlockSaveFailed` →
  `saveFailed(attemptId)`. A saved ladder shows the row read back when known (only a row with its own
  `block_id`), else the draft it saved here, else nothing (saved elsewhere, TASK-010 rule). A failed
  save that has not yet succeeded shows the accepted reference's `Your log didn’t save. Try again.`
  (`role="alert"`) after the feedback group, across reloads.
- **Read model** (`src/state/ladder-recovery.ts`, appended): `ladderDraftFromRow(recorded, rungCount)`
  — the inverse of `ladderDraftOutcome`: top rung Complete, lower rung or 0 Incomplete through it, no
  rung no answer; the row's effort and notes; each movement row's amount and load as text (zero kept,
  absent movement absent). TASK-032's state transitions are unchanged.
- **Shared log** (`src/ui/refinements/timed-result-log.tsx`): `CompletionResultLog.failure?` drawn as
  `<p role="alert">` after the feedback group (the reference's place and markup); the effort is
  `disabled` once saved. **`src/ui/set-effort.tsx`**: optional `disabled` (choices take the shared
  disabled role; no Clear). Without it a saved effort, now shown, would have offered faces and a
  Clear that change nothing.
- **Clock semantics** — unchanged TASK-032/014 owners, now proved on the route: paused clocks stay
  frozen through reloads and closed tabs, running clocks count closed time, Undo resumes from the
  same `startedAt` (finished time counts, nothing granted), the original cap is stamped once, Undo is
  withdrawn at the cap, a cap reached while closed comes back capped with no Resume, and the cap is
  never undone.

## Gallery disposition (templates/gallery-authority.md)

- `?state=ladder-4` / `ladder-12` already render the route's own `LadderBlock` over a memory
  `ShellStorage` and the shell's own provider; with this change they keep the whole draft (rounds,
  effort, notes) through the log's close/reopen, Finish and Undo — actual consumer adoption, no
  gallery-only code, no duplicated route CSS, no writer. The header doc says so. REQ-032: "Gallery
  demonstrates in-memory Undo only. Durable reload/reconnect and original cap recovery require
  application integration" — those are proved on `/workout`.
- One register specimen appended: `TimedResultLog` · "Ladder · save failed, draft kept"
  (`TimedResultLogLadderSaveFailed`, memory only). `node scripts/gallery-index.mjs --check`: 77
  entries verified (index unchanged).
- `src/ui/refinements/ladder.tsx` read, unchanged. `tokens.css` read; no variable needed (the alert
  reuses the reference's bare paragraph inside the log).

## Changes

- Source: `src/state/block-completion.ts`, `src/state/block-completion-provider.tsx`,
  `src/state/ladder-recovery.ts` (appended `ladderDraftFromRow`), `src/ui/ladder-block.tsx`,
  `src/ui/refinements/timed-result-log.tsx`, `src/ui/set-effort.tsx`.
- Gallery/register: `src/dev/gallery-refinement-flow.tsx` (header paragraph, appended specimen),
  `src/dev/gallery-registry.tsx` (one import, one appended state line).
- Docs: `src/state/README.md` (TASK-048 row: Done), `PROJECT_MAP.md` (data-flow paragraph).
- New: `src/test/ladder-recovery-fixture.ts`, `e2e/refinement/task-048.spec.ts`,
  `evidence/refinement/task-048/required-cases.json` (and the guard's receipt),
  `src/state/ladder-save-authority.test.tsx` (task-owned jsdom seam tests), this note.
- Not touched: `supabase/`, `.github/**`, any `.env*`, `src/test/design-0143-final-audit.test.ts`,
  every other `required-cases.json`, the five deferred B05 specs, `block-panel.test.tsx`,
  `task-003.spec.ts`, TASK-030's contract files.

## Tests added

**check-01** — `e2e/refinement/task-048.spec.ts` (6 required cases, mobile). Fixture: a four-rung
(2→8) loaded + bodyweight ladder in one 06:00 capped window, a three-rung (3→9) bodyweight ladder For
Time under 10:00, then a cooldown; planned load 16 kg. Clocks: Playwright's fake clock (context-wide)
held for exact readings, released before reloads, saves and scans; post-reload running readings are
checked against the stored `startedAt`.

1. **Backend lane, touch, 390, Signal (AC-R032-03)** — journey 1 (below) on the disposable lane.
2. **Backend lane, keyboard, 320, reduced motion (AC-R032-03)** — journey 2 on the disposable lane.
3. **Synthetic twin of 1 (AC-R032-01)** — not backend proof.
4. **Synthetic twin of 2 (AC-R032-03)** — not backend proof.
5. **Deterministic clocks (AC-R032-02, synthetic)** — Finish at 05:50 of 06:00: Undo at 05:59,
   withdrawn at 06:00 unprompted, the Finish frozen, the log still editable (corrected to 3, notes);
   the second ladder paused at 01:00 with an effort; a **real tab close** and a new tab two hours
   later: paused 01:00 kept, Undo still gone, edits kept; resumed, round 2, tab closed while running
   and reopened 15 min later: `Cap reached` 10:00, no lifecycle, progress carried to Incomplete
   through 2, no Undo, effort kept, still 10:00 a minute later; **connection dropped** at the save:
   failure dialog, draft and failure line kept, nothing stored; regained: one row each
   (`POST lost`, `POST 201` / `POST 201`), both records `saved` from this device.
6. **Gallery `ladder-4` / `ladder-12` (AC-R032-01)** — effort and notes kept through close/reopen,
   Finish (Incomplete through 2) and Undo (Pause + Finish, rounds 1–2 live, answer back to none,
   effort/notes kept); no failure line; no route key stored; no network.

Journey 1 (`journeyRecovery`): start, rounds 1–2, Pause at 01:00, effort Too hard + notes; record
asserted (cap 360, progress 2, draft). Reload: Paused 01:00, rounds and draft kept; 10 min more:
still 01:00; same attempt id. Resume to 01:30, round 3, accidental Finish: Incomplete 1–3, round-4
partials (5 loaded, explicit 0 bodyweight) and 18 load; checkpoint asserted. Reload: Finished 01:30,
everything and Undo kept. Undo: same `startedAt`, no pause, cap 360, running at ≥ 01:50 (finished
time counted), rounds 1–3 live, answer back to none, entries kept. Finish again: entries back. Save
refused (block 503): dialog; failure line; draft and Undo kept; record `failed`; no row. Reload:
still failed, kept, undoable, no "Block saved". Retry: `POST 503, POST 201` for the block, one POST
per movement, the other ladder's bare row; rows exact (highest_rung 3, too_hard, notes, round 4,
5 reps / 0 reps, 18 in the profile's unit); record saved from this device, checkpoint null.
Previous: "Block saved", no Undo/lifecycle/live tiles, every value read back disabled. Reload: read
back from the server row the same; no write; still 2 + 2 rows.

Journey 2 (`journeyPartial`): second ladder Incomplete 1 with round-2 partial 4; main ladder all
rounds → Complete, About right, load 20. Main's movement write refused: block `POST 201`, movement
`POST 503`, failure line, entries kept, no "Block saved", only the block row stored. Reload: the row
is known but the attempt is reopened — draft, enabled load, Undo and failure kept. Retry with the
second's block refused: main `POST 201, POST 409, PATCH 200`, movement `POST 503, POST 201`; second
`POST 503`. Main now saved and shows Complete / About right / 20 disabled with no Undo (the TASK-013
UAT fix); second keeps its draft, Undo and failure line. Last retry: second `POST 503, POST 201`, its
movement `POST 201`. Rows exact (one block row each, one movement row each). Reload: both read back
from their rows, nothing written.

Backend lane follows TASK-047 exactly: `expect(backend.available …)` fails (never skips); MIG-A,
MIG-B and `ladder_timing` zero-row boundary reads; catalog movements read from the project
(dumbbells / bodyweight); namespaced `clear-e2e-<ns>-<project>-t048-<hash>@example.com` user;
`complete_onboarding`, `persist_session` (acceptance parsed), `start_session`; service-role reads
filtered to this user's block and exercise ids; `deleteUser` in `finally`; faults in the browser only
(503 fulfilled, never forwarded; a dropped connection aborted).

**Task-owned jsdom** — `src/state/ladder-save-authority.test.tsx` (4 cases, not a declared check):
`'saved'` with the row kept for an answered insert, `'known'` with none kept for a 23505, a failed
save told to its block only; the performed read `'known'` with row and movement rows kept; a
`reopenBlock` from a `'known'` listener keeps the block outstanding and unannounced, and the retry
restates once (record 23505 → one correction with the category); `ladderDraftFromRow` mapping.

## Earlier tests changed (owner decision 2026-11-10), line by line

Owner decision (Eric, 2026-11-10): "May tasks update earlier tests when their approved requirement
replaces that UI?" — "Yes, go ahead". Case names kept (now partly stale, listed below); no other
`required-cases.json` edited; each owner's exact guard re-run.

- `src/ui/timed-result-log.test.tsx` (TASK-010 check-01; shared with TASK-009/015 check-01):
  - "AC-R010-01 completion end to end…", ~l.1037–1044: the saved section's ladder answer `[]` →
    `['Complete']` (AC-R032-02: the saved result read back, disabled; comment updated).
  - "AC-C30-01 effort is optional…", end, ~l.1131–1142: `JSON.stringify(localStorage)` has no
    category → the ladder's attempt draft holds `effort: 'too_easy'` (AC-R032-01), every other key
    holds no category, and the ladder record holds no other category or numeric effort. Import of
    `WORKOUT_LADDER_STORAGE_KEY` added.
- `src/ui/timed-workout-flow.test.tsx` (TASK-013 check-01; shared with TASK-006/011/014):
  - "JOURNEY-013 recovery … effort stays unsaved; a saved ladder claims no answer", ~l.1810–1820:
    after reopen the checked radios are `['Incomplete', 'Too hard']` (effort durable), the ladder
    record's draft has `effort: 'too_hard'`, the For Time record holds no category; ~l.1834–1846: the
    saved section shows Incomplete through 8 and 2 with disabled tiles (was: no answer, no rounds
    group). **Case name now stale** ("effort stays unsaved", "claims no answer").
  - TASK-014 check-01 "AC-R014-03 undo survives close and reopen…", ~l.2312–2330: reopened with the
    performed read failing, the long ladder shows the draft it saved (Incomplete, rounds 1–8), the
    short (never answered) still `[]`; still no Undo, disabled, no controls (was: no answer).
- `e2e/refinement/task-014.spec.ts` (TASK-014 check-02), "JOURNEY-014 recovery phone-390 … even when
  a reload cannot read the row back", ~l.933–950: after the reload with the performed read refused,
  each saved ladder shows the draft it saved — `['Incomplete']` with rounds 1–8 (long) and 1–2
  (short) — instead of `[]`; still no Undo, no lifecycle, disabled (AC-R032-02). Found by the sweep.

## Failures and corrections

- First vitest run after the product change: exactly the four superseded assertions above failed.
- A React warning "Received NaN for `data-ladder-count`" appeared once: TASK-014's case answers its
  insert with a bare `{}` row, which the first readback mapped to `Math.min(undefined, n)`. Fixed by
  reading only a row carrying the block's own `block_id` and treating absent columns as null.
- Deterministic case, run 1: the reopened tab never booted ("Loading CLEAR"). Cause: Playwright's
  `page.clock` is the browser context's clock; it was still paused (held) when the first tab closed,
  so the new tab's scheduler never ran. Fixed: release before closing and move the wall clock with
  `setSystemTime` for the time the tab was closed. (Debug logging removed.)
- Deterministic case, run 2: the dropped-connection POST is in the request trail as `POST lost`;
  expectation corrected.
- ESLint: one `no-useless-assignment` in the spec; fixed by using the reassigned card.

## Verification (this worktree, uncommitted)

All Playwright commands ran under `node …/agent-runner-v2/bin/v2.mjs with-lock --`. `npm ci` once at
the start (exit 0).

- **TASK-048 guard** (`node scripts/refinement/run-required-check.mjs --task TASK-048 --check
  check-01 -- npx playwright test e2e/refinement/task-048.spec.ts --project=mobile`): REJECTED, as
  expected here. Native 6 total, 6 executed, 4 passed, 2 failed, 0 skipped. The four synthetic and
  gallery cases passed; the two backend-lane cases failed at their precondition "TASK-048 backend
  lane (PRE-001): Needs SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY". The receipt
  in `evidence/refinement/task-048/results/check-01.json` is that rejected run; the controller's
  run replaces it.
- Earlier owners' vitest guards (exact manifest commands), all PASSED: TASK-006 c01 32/32; TASK-009
  c01 10 executed; TASK-010 c01 11; TASK-011 c01 9; TASK-012 c01 9/9; TASK-013 c01 11; TASK-014 c01
  15; TASK-015 c01 13; TASK-016 c01 13; TASK-017 c01 7; TASK-018 c01 9; TASK-032 c01 10/10.
- `npx vitest run`: 276 files, 6391 tests passed.
- `npx tsc --noEmit`: exit 0. `npm run build`: exit 0. `npm run lint:ds`: exit 0.
- `npx eslint` on every changed/new TS file: 0 errors; warnings only the existing fast-refresh family
  (per-file counts equal to base for `ladder-block.tsx`, `set-effort.tsx`, `gallery-registry.tsx`,
  `gallery-refinement-flow.tsx`).
- `node scripts/gallery-index.mjs --check`: 77 verified.
- **Sweep** `npx playwright test e2e/refinement/ --project=mobile --workers=1 --trace=off` (200
  tests, 30.2 min): 195 passed, 5 failed — the 2 TASK-047 and 2 TASK-048 backend-lane cases
  (PRE-001 precondition, no credentials here) and TASK-014 check-02's recovery case on the
  superseded "no answer" assertion above. After that edit: **TASK-014 check-02 guard PASSED 5/5**,
  and the TASK-048 guard re-run on the final spec: 4 passed, the 2 backend cases failed at their
  precondition (REJECTED, as expected here). No known flake recurred.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final
  --tasks <every task dir except TASK-039>`: REJECTED only for TASK-048 check-01 (its rejected
  receipt: the two backend cases). Every other task has current passing receipts; accepted-gallery
  1193 files verified.
- Changed receipts (targets edited, guards genuinely re-run): TASK-006, 009, 010, 011, 013, 014, 015
  check-01 and TASK-014 check-02. TASK-012/016/017/018/032 check-01 re-ran byte-identical.

## Open items (for the controller and owner)

- **Backend lane unrun here** (cases 1–2 need `.env.runner.local`). Their UI steps and request trails
  are the synthetic twins' (green); their backend-only parts (catalog reads, onboarding,
  `persist_session` / `start_session` with two ladder blocks incl. `capped_window`, service-role row
  reads, cleanup) are typechecked and linted, not executed.
- **`discarded` and `durable: false` are not drawn** (TASK-032 suggested them). No accepted copy
  exists for "an earlier attempt couldn't be restored" or "progress is kept on this screen only";
  inventing it is copy work (TASK-037 / owner). Today an unreadable or foreign record silently starts
  a fresh attempt and a storage write failure is silent.
- **For Time / AMRAP** keep the TASK-015 UAT symptom (a reload after a refused movement write shows
  "Block saved" without the movement rows) and memory-only notes/effort. Outside REQ-032's ladder.
- **Readback restates over another device's correction**: a ladder whose own richer save failed
  reopens a known row and the retry restates it from this device's draft; a correction made elsewhere
  in between would be overwritten (no source defines a merge). A bare save keeps the server row.
- **Readback unit**: a movement row's load is shown as stored; if the athlete's unit changed since,
  the number is in the row's `weight_unit`, not the field's (not converted) [inferred rare].
- **Failure line placement**: inside the log only (the reference's place); after a reload the card
  itself does not say the save failed until the log is opened or the forward action fails again
  (UAT). Copy "Your log didn’t save. Try again." for TASK-037.
- **Stale case names kept by rule**: TASK-013 "…effort stays unsaved; a saved ladder claims no
  answer"; TASK-014 "…even when a reopen cannot read the saved row back" (still true, but it now
  shows the saved draft).
- `src/state/README.md` still says "JOURNEY-032 is not complete" in TASK-032's foundation paragraph
  (TASK-032's check pins that sentence); the TASK-048 row records completion.
- TASK-030's contract text (`refinement-logging-contract.ts`, `LOGGING_FIELD_CONTRACT.md`) still
  lists TASK-048's obligations as pending; not edited to avoid touching TASK-030's check targets
  (housekeeping).

## Next action

Controller verification (with `.env.runner.local`) and commit.
