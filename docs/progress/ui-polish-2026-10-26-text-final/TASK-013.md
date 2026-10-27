# TASK-013 — Superset combined round logging

Issue #533 · REQ-016 · role: completion-owner for JOURNEY-012.
Task-owned progress record; it stands in for the shared daily journal for this task.

## Outcome intended

Give a superset one combined **Log round** action on the shared half-sheet. Each movement keeps its
own movement-appropriate fields and its own effort, and no result is copied between them. Partial
rounds stay allowed. A movement can be explicitly marked performed without measurements. Blank
fields alone do not log anything. An unlogged partner stays missing, and absent measurements stay
null. Shared rest and the global session clock are kept.

## Baseline, as found (HEAD `bc7764e`, contains `7f0a367`)

- Each superset movement had its own **Log set** and its own sheet. Rest started only when the
  closing movement (A2) logged, labelled with that movement's name.
- Each movement's set number was its own lowest unrecorded number. A partner that skipped a round
  filled that gap with its next result.
- PRE-001: `git merge-base --is-ancestor 7f0a367… HEAD` passed. PRE-002: the design system declares
  0.14.3, and `git diff 7f0a367 HEAD -- src/design-system` is empty. It is still untouched.

## What changed (local, unpublished)

- `src/ui/set-logger.tsx`
  - The new-set entry reading (`readEntry`) and the Weight/Unit/measure row (`SetMeasureFields`)
    were extracted from `SetSheetForm` so the round can reuse them. Single-movement behaviour is
    unchanged.
  - `ExerciseSetLogger` takes a new `logging` prop: `'self'` (the default) or `{ round }`. In round
    mode the card has no Log set, its counter shows the round's set number, and saved rows keep
    their own Edit/Clear correction sheet. That sheet closes on Save or Cancel.
  - The new `SupersetRoundSheet` and `supersetRound` live in this file so it remains the
    presentation layer's only `logSet` caller. The `block-completion-ownership` guard is unchanged
    and passes.
  - Each movement is a `role="group"` named "A1 bench press, set N", with a DS `Checkbox`
    **Performed**, its own measurement row and its own `SetEffortChoice`.
    - Typing a result or choosing an effort ticks Performed. Prefilled suggestions do not.
    - Only ticked movements are logged. A ticked movement with blank fields logs
      `{ setNumber }` only, so its measurements are null.
    - Log round is disabled only while nothing is ticked or a ticked movement has an unreadable or
      negative field. There is no both-movements gate and no new required-measurement error.
  - Every movement in a round logs the round's set number, which is 1 + the highest set number
    either movement has. A missed partner therefore keeps its gap.
  - A logged round starts the block's `round_rest_seconds` once, labelled "round N". Nothing reads or
    restarts the session clock.
- `src/ui/superset-block.tsx`: one **Log round** button inside the card opens the round sheet
  through the existing sheet host (key `round:<blockId>`). The round draft is held in the block, so
  minimising and reopening the sheet keeps it. An emptied block draws only the empty note and does
  not touch set logging.
- `src/ui/set-logging-sheet.tsx`: new optional `entryName` for the title and action ("Log round 2").
  The default is still "set N".
- `src/dev/gallery-registry.test.tsx`: `SupersetRoundSheet` exempted, with the same reason class as
  `ExerciseSetLogger` (it needs a live session).
- Tests: new `src/app/superset-logging.test.tsx`, with 10 real-route cases on a synthetic double
  plus 1 renderer refusal case. `superset-block.test.tsx` and four rest cases in `Workout.test.tsx`
  were moved from per-movement Log set to Log round.
- Nothing changed in GitHub or any external service.

## Decisions and assumptions (for review)

- **Explicit identification** is the Performed tick. Typing a result or choosing an effort sets it.
  A prescribed reps/seconds prefill is a suggestion: once ticked, it logs as shown.
- **Resumed sessions:** a partner that missed rounds resumes at the round, not at its lowest free
  set number. The old superset test "resumes each movement at the lowest set its rows have not
  recorded" was rewritten to match. With prescribed sets exceeded, the counter reads
  "Extra set N" for both movements.
- **Rest label** is "Rest after round N". It was the closing movement's name.
- **Lint:** warnings went from 140 to 141. The new one is the `supersetRound` export, the same
  `only-export-components` pattern as the existing `loggedSetText`.

## Failures and corrections

- First full-suite run: 23 failures.
  - Gallery coverage: fixed by the exemption.
  - Ownership guard: `logSet(` appeared outside `set-logger.tsx`. The round sheet was moved into
    that file rather than loosening the guard.
  - Old per-movement superset tests: updated.
  - `block-renderers` registry: the empty superset fixture has no set-logging provider. The round
    wiring was moved into an inner component rendered only when there are movements.
- The round draft was first held in the sheet, so minimising lost it. The draft was moved to the
  block.
- Discrimination checks, each reverted:
  - Defaulting every movement to performed failed 5 of 11 focused cases.
  - Starting rest only when both movements logged failed 1 of 11.

## Initial worker verification

| Command | Result |
| --- | --- |
| `npm test -- superset-logging` | pass, 1 file / 11 tests |
| `npm test` | **fail**: 2 of 5704, both in `src/test/design-0143-final-audit.test.ts` (blocker below); 227 of 228 files pass |
| `npm run lint:ds` | pass |
| `npm run build` | pass (existing >500 kB chunk advisory only) |
| `npm run lint` | pass, 0 errors (141 warnings) |
| `npm run typecheck` | pass |
| `npm run gen:types -- --check` | pass, types current |
| `python3 scripts/gen-issues.py --check` | pass (71 requirements, 136 edges) |

## Initial verification stop: runtime-source-bound audit evidence

This is the same blocker as TASK-006/007/009/011/012. Any runtime change in `src/` changes the
runtime-source hash, which was `4148cde3a3523e30be43bd10921980ecf43198cd807f86dd3d86b107354ba1cf` for the initial candidate.
The TASK-034 format-preview AFTER records and `docs/design/CLEAR-0.14.3-FINAL-AUDIT.md` must name
that hash. Refreshing them requires committing the tree and genuinely re-capturing the four-skin
mobile format-preview group against a disposable authenticated backend. This worker cannot do that.
No record, hash or audit text was edited, because that would fabricate evidence.

## Controller review and recovery

The initial candidate is preserved in `5fea95442574c387b49bd8ef35d73f0ba0351edc`.
Native run `cab8b212-f843-4c94-8030-16cc4c46e43e`, attempt 1 of 2, retains its history.
No new coding-model attempt, Runner change or counter reset was used.

Independent review found and corrected four concrete defects before publication:

- Clearing a suggestion, the last entered measurement or an effort answer could implicitly
  identify an unmeasured movement. Entry intent now distinguishes supplied results from an
  explicit Performed tick. Clearing alone never creates an observation; deliberate unmeasured
  logging still works, and unticking excludes a movement without losing its draft.
- Advancing the pair after only one result reset the untouched partner's countdown. Clock identity
  now follows the owning movement's highest explicitly recorded set number plus one. Missing round
  gaps remain missing, and prescription sequence indexing remains by set number rather than
  observation count. Real-route tests cover both ordinary progression and a gapped three-rung case.
- Grouped correction Minimize, Cancel and Save lost keyboard focus after removing the individual
  Log set button. They now return to the real Edit trigger; clearing that row returns to Log round.
- An excluded invalid numeric draft could block its selected partner through native form
  validation. Excluded grouped fields remain editable but are detached from the round form.
  Selected fields and ordinary set/correction forms retain native and custom validation.
  A disposable Chromium check reproduced native badInput blocking even after min was removed;
  form ownership fixes that case too. Route tests verify ownership and actual independent saving.

The final focused repair set passed **141 tests across 10 files**, including all **17**
`superset-logging` cases. Typecheck, design-system lint and diff checks passed.
Initial failed regression runs were corrected without weakening selected-entry validation.

The root controller reviewed the source changes and retained the existing ownership guard and
design-system/vendor/workflow/schema boundaries. The live-session form gallery exemption follows
the existing SetLoggingSheet/ExerciseSetLogger exemptions; the gallery check itself is unchanged.
Next is a genuine capture of the committed repaired source and same-attempt native verification.

Deployed and physical-iPhone behaviour are not inferred.
