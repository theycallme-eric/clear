# TASK-003 — Home actions, copy and recent workout row hierarchy

Issue #523 · REQ-003, REQ-004 · role: completion-owner for JOURNEY-003.
Task-owned progress record; it stands in for the shared daily journal for this task.

## Outcome intended

Home drops "Not training today?" and keeps Mark Rest Day with its existing disclosure, reason
picker and save. When history exists and nothing was trained today, Home shows the normal
returning-user entry: Train Today states Last time and Suggested next, and the pinned primary is
Generate workout. The trained-today rule stays the same: a trained day has no rest-day affordance.
Streak, week-strip, rest/pause, Generate and empty-week behaviour are unchanged. Each recent row
shows a smaller title, then status and date together, then readable metrics. It has no "session"
word and no link underline, and completed and abandoned rows stay distinct.

## Baseline, as found (HEAD `e2301d9`, contains `7f0a367`)

- `RestDayControl` in `src/app/Home.tsx` printed `REST_DAY_PROMPT` ("Not training today?")
  above Mark Rest Day on an unmarked day, and printed "Today: <reason>." on a marked day.
- The returning-user entry and the trained-today rule were already in place.
  - `NextWorkoutEntry` plus the pinned Generate show for any history.
  - `RestDayControl` returns null when today's strip state is `workout`.
  - AC-010 therefore needed proof, not a behaviour change.
- Home's recents used the shared `HistoryList`/`SessionItem` (U44). Its head group was an h5-size
  title link with the status beside it, then a "date · focus" line, then metrics in 12px data
  labels. The underline is the global `a { border-bottom }` rule in the vendored foundation CSS.
- PRE-001: `git merge-base --is-ancestor 7f0a367… HEAD` exit 0. PRE-002:
  `git diff --stat 7f0a367 HEAD -- src/design-system` is empty, and this task does not touch
  `src/design-system`. The `node -e` version probe needed approval and was not run. The final
  audit test's package-hash assertion still passes (below), which checks the vendored tree's bytes.
- Issue comments were not read; the approved task body was the contract.

## Changes (local only; nothing changed in GitHub or any external service)

- `src/app/Home.tsx`:
  - `REST_DAY_PROMPT` is removed. An unmarked day renders no statement above Mark Rest Day.
    A marked day still says "Today: <reason>.".
  - The recents pass `layout="recent"` to `HistoryList`.
  - Generate, streak, strip, rest/pause and the "No sessions this week yet." copy are untouched.
- `src/ui/history-list.tsx`: new opt-in `layout?: 'chronology' | 'recent'`, default `chronology`,
  so History's own rows are unchanged. The `recent` row has three parts:
  1. `title`: `--label-md-size` display type, smaller than the chronology's `--heading-h5-size`.
     The link has `border-bottom: 0` and an inherited colour.
  2. `status-date`: the status glyph and word, then the formatted date, on one wrapping line.
  3. `metrics`: focus, requested minutes, actual minutes when recorded, and intensity. They use
     `--label-sm-size` in `--text-paragraph`, up from 12px in the label colour.

  The row also has these properties:
  - Completed uses `--text-selected`, the selection role the strip's trained day uses.
    Partial and Not started use `--text-card-label`.
  - Each status keeps its own glyph and word, so colour is never the only cue. `data-status`
    names the status.
  - A title ending in the standalone word "session" has that word dropped. A title that is only
    "session" stays as it is.
- `src/app/home-screen.test.tsx` (new, 11 cases): AC-009 to AC-015 on the real route tree, plus a
  check that History's chronology row is unchanged.
- `src/app/Home.test.tsx`: the U25 and Cancel tests now assert the prompt is absent. The U44 recent-row
  test is restated for REQ-004's order (`title`, `status-date` > `status`, `date`, `metrics`).
- `e2e/design-0143/task-040-home-review.spec.ts`: its two "Not training today?" visibility
  expectations now assert count 0. Not executed here.

## Decisions and assumptions (for review)

- **"Session" word.** The brief gives no example of where "session" appeared. The app adds no such
  word to rows, so it is read as a generated-title suffix (e.g. "… strength session"). If the owner
  meant something else, only `recentTitle` needs to change.
- **Abandoned.** "Abandoned" in the brief maps to History's existing `partial` (abandoned after
  starting) and `Not started` (abandoned before the first set) words. No new status label was added.
- The focus moved from the date line into the metrics, so line 2 is status and date only, as the
  brief orders it.
- Type steps (`--label-md-size` title, `--label-sm-size` metrics) are the worker's reading of
  "smaller" and "readable". The brief names no token.

## Verification (worker, uncommitted tree)

| Command | Result |
| --- | --- |
| `npm test -- home-screen` | pass, 1 file / 11 tests |
| `npm test` | **fail**: 2 of 5776, both in `src/test/design-0143-final-audit.test.ts` (blocker below); 233 of 234 files pass |
| `npm run lint:ds` | pass |
| `npm run build` | pass (existing >500 kB chunk advisory only) |
| `npm run lint` | pass, 0 errors (143 warnings, same as before) |
| `npm run typecheck` | pass |
| `npm run gen:types -- --check` | pass, types current |
| `python3 scripts/gen-issues.py --check` | pass (71 requirements, 136 edges) |

A first lint run showed 144 warnings, because `recentTitle` was exported from a component file. It
is now module-local, and the count is back to 143. An initial streak assertion used `\xa0`, which the
text matcher normalises away. It now matches a plain space, as `Home.test.tsx` does.

## Verification stop: runtime-source-bound audit evidence

This is the same blocker recorded by earlier tasks in this body. The audit hashes every non-test
runtime file under `src/`, so any runtime change fails two checks:

- *proof labels › bound to the package and runtime source of this tree*. Its first assertion,
  the package hash, still passes.
- *TASK-034 AFTER evidence (eight-cell mobile group)*

Fixing these means committing the tree and re-capturing the four-skin mobile format-preview group
against a disposable authenticated backend. This worker cannot do that, and no record, hash or
audit text was edited. jsdom checks structure and token styles only. No browser or e2e run was made.

Next safe action: the controller commits this tree and re-captures the format-preview evidence
against it. It then runs the Home e2e review spec and native verification.
