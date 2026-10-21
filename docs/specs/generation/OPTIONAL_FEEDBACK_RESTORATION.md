# Optional feedback — what was removed, and how to restore it

REQ-015 (U36) removed every set- and block-level effort collection from the workout, and the
execution warm-up checkbox with it. This note records what went, what stayed, and the shortest
honest path back, so restoring any of it is an edit against named code rather than archaeology.
It sits beside `GENERATION_CONTRACT.md` because generation and progression are the consumers of
the data these surfaces collected; the contract itself is unchanged.

No feature flag and no parallel implementation were added. Restoring collection is a code change
reviewed like any other.

## What did not change

- **Schema.** `exercise_set_logs.rpe` and `block_results.perceived_effort` stay nullable, with
  their CHECK ranges (`exercise_set_logs_rpe_range` 1–10, `block_results_perceived_effort_range`
  1–10). No migration ran; every historical value is untouched.
- **Warm-up classification.** `exercise_set_logs.is_warmup_set` is still written and read.
  `LoggedSet.isWarmup` still prints `Warmup` in the logger's set list, `prefillFrom` still skips a
  warm-up as a reference point, and History still marks a warm-up row. Only the control that set
  it during execution is gone, so new sets are written `false` unless an entry queued earlier says
  otherwise. Warm-up *sections* (`section_type = 'warmup'`) are generation's and are unaffected.
- **Historical readers.** History (`src/state/session-detail.ts`, `src/ui/session-detail.tsx`)
  still shows a recorded RPE and block effort. Load suggestions (`src/state/load-suggestions.ts`,
  `recordedRpeText`, and the "Why this number" dialog in `src/ui/load-suggestion.tsx`) still read
  RPE from previous sessions, and `src/state/progression.ts` still uses `medianRpe` and
  `firstSetRpe`. All of these treat `null` as not recorded. Sessions logged after this change carry
  no RPE, so the RPE-gated progression rows stop matching and the rules that read reps alone decide.
  That degradation is expected. Suggestions remain optional guidance, overridable for the session.

## Set level — the RPE field and the warm-up checkbox

**Surface removed.** `src/ui/set-logger.tsx`, `SetEntryForm`: the `RPE` `Input` (1–10, decimal,
error copy `RPE runs 1 to 10`) and the `Checkbox` labelled `Warmup set`. The form now has weight
and the prescription's measure (reps, seconds or distance), both optional. A blank set still logs.
`loggedSetText` no longer prints `RPE n`.

**Writer changed.** `src/state/set-logging.ts`:

- `PerformedSet.rpe` was removed. `isWarmup` stays as an optional field so an entry already
  classified keeps that classification.
- `setLogInsert` writes `rpe: null` unconditionally.
- `setLogViolation` no longer checks an RPE range, and `RPE_MIN`/`RPE_MAX` were removed.
- `LoggedSet.rpe` was removed, along with its mapping in `loggedSetFromRow` and
  `loggedSetFromEntry`.

**Queue.** `src/state/set-log-queue.ts` still accepts an optional numeric `rpe` on a stored
entry. A set queued before this change is therefore still sent rather than dropped; the writer
just leaves its effort out. Its `isWarmup` is still written.

**Regression tests removed or replaced.**

- `src/ui/set-logger.test.tsx`: removed "carries RPE and the warmup flag when they are given" and
  "refuses an RPE outside the scale". The prefill test no longer asserts an empty RPE field. The
  field-row test now asserts exactly two fields. A new test asserts that no RPE, exertion, slider
  or checkbox control exists.
- `src/ui/superset-block.test.tsx`: the field-row test asserts weight and reps only. The
  refused-entry test uses a negative weight instead of RPE 11.
- `src/state/set-logging.test.ts`: removed the `refuses an RPE of %s` and `accepts an RPE of %s`
  cases. Added cases that check the writer sends no RPE, even from a legacy entry, and that a
  legacy RPE is not grounds for refusal.

**To restore:** put the `Input` and `Checkbox` back in `SetEntryForm` and spread
`rpe`/`isWarmup` into `onLog`. Re-add `PerformedSet.rpe`, `LoggedSet.rpe`, `RPE_MIN`/`RPE_MAX`
and the range check, and write `rpe: recorded(performed.rpe)` again. The queue guard needs no
change. The previous implementation is `src/ui/set-logger.tsx` and `src/state/set-logging.ts` as
of commit `f0b48b9`.

## Block level — the perceived-effort dialog

**Surface unmounted earlier, kept now.** TASK-022 (#457) stopped mounting the dialog, and
TASK-029 (#476) made the shared completion writer accept absent effort. The completion path
(`src/state/block-completion-provider.tsx`) records every block with `perceivedEffort: null`, and
`src/test/block-completion-ownership.test.ts` asserts that `<BlockEffortDialog` is mounted
nowhere. The component, `src/ui/block-effort.tsx` (`BlockEffortDialog`, `effortValueText`,
`outcomeSummary`, `DEFAULT_PERCEIVED_EFFORT`), and its tests in `src/ui/block-effort.test.tsx`
remain as the restoration seam. The renderers (EMOM, AMRAP, For Time, ladders) were never given
their own effort controls, and none exist.

**Writer.** `src/data/workout.ts` `blockResultInsert` still validates and writes a supplied
effort, and writes `null` when none is given. It is unchanged.

**To restore:** mount `BlockEffortDialog` from the completion provider before
`blockResults.record`, pass its answer as `perceivedEffort`, and drop the ownership test's
"mounts the effort question nowhere" and "writes every block result with no effort" assertions.
That reverses the relevant part of #485/#476.

## What restoration must not do

- Make any feedback compulsory. A missing entry never blocks a set, a block or the workout.
- Fill an observed value from the prescription. Targets are printed as targets.
- Treat `null` as `0`. A zero is an observed result, and `null` means it was not recorded.
