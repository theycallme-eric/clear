# TASK-006 — Half-sheet set logging and movement card hierarchy

Issue #526 · REQ-008, REQ-009 · role: foundation-provider (TASK-008, -009, -011, -013, -014 depend on it).
Task-owned progress record; it stands in for the shared daily journal for this task.

## Outcome intended

One shared half-sheet (`src/ui/set-logging-sheet.tsx`) for new-entry and edit fields, and the
movement card hierarchy (section label + structure badge, heading + Set X/Y, prescription,
equipment, saved rows with Edit, Log set, coaching disclosure). Insertion interfaces for effort and
edit mode only; effort behaviour (TASK-008) and persisted correction/Clear (TASK-011) are not
implemented or claimed here.

## What changed (local, unpublished)

- New: `src/ui/set-logging-sheet.tsx`, `set-logging-sheet.css`, `set-logging-sheet-context.ts`,
  `section-label-context.ts`, `set-logging-sheet.test.tsx` (26 tests, one block per criterion
  AC-025…AC-035 plus insertion interfaces and the no-host fallback).
- `src/ui/set-logger.tsx`: card hierarchy; entry fields moved into the sheet; compact
  Weight / Unit / Reps (Seconds for timed, load omitted for bodyweight, no conversion); prescribed
  reps/seconds prefilled, recorded only on Log set; removed unit helper, "No sets logged yet",
  repeated target and visible tempo; Saved only on database success, entry retained on failure.
- `src/ui/block-renderers-frame.tsx`, `src/app/Workout.tsx`: section label context and the sheet
  host in the pinned foot.
- Existing renderer, Workout, provider and gallery tests updated to open the sheet before typing.
- Nothing changed in GitHub or any external service. Vendored design system untouched.

## Verification (attempt 2, 2026-10-27)

| Command | Result |
| --- | --- |
| `npm test -- set-logging-sheet` | pass, 26/26 |
| `npm run lint:ds` | pass |
| `npm run lint` | pass, 0 errors (warnings only) |
| `npm run typecheck` | pass |
| `npm run build` | pass |
| `npm run gen:types -- --check` | pass, types current |
| `python3 scripts/gen-issues.py --check` | pass |
| `npm test` | **fail**: 2 of 5463, both in `src/test/design-0143-final-audit.test.ts` |

One run also failed `goal-focus-journeys` journey 2. The next full run passed it, so it was a
timing flake under load. It does not touch the logging code.

## Blocker: runtime-source-bound audit evidence

Both remaining failures happen because any runtime source change fails them. They are not defects in
this diff:

1. *proof labels › bound to the runtime source of this tree*: the audit names runtime hash
   `319d101b…`; this tree hashes to `7855ffc4…`.
2. *TASK-034 AFTER evidence*: every record's `identity.runtimeSourceHash` must equal the current
   runtime hash. The records can only be refreshed by re-running `e2e/design-0143/format-preview.spec.ts`
   with the real authenticated-session fixture. That needs privileged backend credentials
   (`.env.local` / `.env.runner.local`), and none exist in this worker. It also needs a committed
   application commit with lineage provenance (see #512 and `c02e16f`, which did exactly this).

Not done, on purpose: editing record hashes or the audit to name a hash that no capture backs.
That would fabricate evidence.

## Next safe action

The owner or a credentialed lane commits this diff, re-runs the TASK-034 mobile capture on that
commit, and re-derives the audit's runtime hash and lineage the way `c02e16f` did. After that,
re-run `npm test`.
