# TASK-007 — Lossless categorical per-set effort data contract

Issue #527 · REQ-012 · TC-001 · role: foundation-provider for JOURNEY-007 (TASK-008 and TASK-011 build on it).
Task-owned progress record; it stands in for the shared daily journal for this task.

## Outcome intended

A distinct, nullable, categorical per-set effort value — `too_hard` / `about_right` / `too_easy`, or
NULL for unanswered — carried through input, provider, durable queue and retry, validation,
persistence, saved-row reads, correction and clear. Historical numeric `rpe` and its readers stay
unchanged. No RPE conversion, session aggregation, progression, adaptation or prompt change. The
preview keys are not adopted. No UI is built here (TASK-008), and no correction orchestration
(TASK-011).

## Seams found

| Seam | What it is | Change |
| --- | --- | --- |
| `exercise_set_logs` (`20260921000004_execution_domain.sql`) | the row; `rpe numeric(3,1)` with a 1–10 CHECK, column-by-column grants | new nullable `effort public.set_effort` and its column grants, in a new additive migration |
| `src/data/database.types.ts` | generated types | regenerated shape: `set_effort` enum, `effort` on Row/Insert/Update |
| `PerformedSet` / `SetLogEntry` (`src/state/set-logging.ts`) | what a renderer hands the provider; what is queued | optional `effort?: SetEffort \| null` |
| `setLogInsert` | the one insert mapping | writes `effort` only when answered; `rpe` stays `null` |
| `setLogViolation` | pre-send CHECK mirror | refuses a non-category `effort` |
| `LoggedSet`, `loggedSetFromRow`, `loggedSetFromEntry` | saved-row and queued-set reads | `effort: SetEffort \| null` |
| `setLogEffortUpdate` (new) | the correction row TASK-011 writes | `{ effort }` — a category, or `null` to clear |
| `set-log-queue.ts` `isPerformedSet` | durable queue decoder | accepts missing / `null` / a category; drops a number or unknown key |
| `exerciseSetLogRowSchema` (`schemas.ts`) | boundary parser for rows and `to_jsonb(l)` set logs | `effort: setEffortSchema.nullable().default(null)` |
| `set-logging-provider.tsx` | mints id and unit, queues the entry | unchanged: it passes `performed` through, so `effort` reaches the queue as typed |
| `session_performed`, snapshot, `session_as_*` | readers built on `to_jsonb(l)` | unchanged; they carry the column the moment it exists |
| anchor / training-history functions, `supabase/functions/**`, progression/deload/anchors state | adaptation and prompt consumers | unchanged; a test asserts none of them reference the categories |

## Decisions (engineering details, per TC-001)

- **Enum, not CHECK on text.** `public.set_effort` gives generated types and `Constants` a single
  vocabulary (`setEffortSchema = z.enum(Constants.public.Enums.set_effort)`), the way every other
  enum in this schema works.
- **Column `effort`, no default, no backfill.** NULL is unanswered, including every older row.
- **Unanswered is written by omission.** The column has no default, so an omitted key stores
  NULL. This also keeps unanswered sets writable if the client deploys before the migration is
  applied remotely (remote application is not authorized here). An answered set needs the column.
- **Legacy rows without the key parse as `null`** (`.default(null)`); an unknown category or a
  number is still refused, never coerced.
- **Legacy queued entries** (no `effort` key, possibly a tolerated legacy `rpe`) still decode and
  still write `rpe: null` and no `effort`.

## Changes (local, unpublished)

- New: `supabase/migrations/20261027000027_set_effort.sql`, `src/state/effort-persistence.test.tsx`
  (72 tests), `scripts/ui-polish/rehearse-effort-schema.mjs`.
- Updated: `src/data/database.types.ts`, `src/state/{schemas,set-logging,set-log-queue}.ts`,
  `src/test/{workout,session}-double.ts`, fixtures in `set-logging.test.ts` and
  `set-logger.test.tsx`; migration registries in `generated-types`, `generation-persistence`,
  `goal-focus-journeys` tests and the two `docs/process/generation-reliability/*.json` source lists;
  `PROJECT_MAP.md` (new `scripts/ui-polish/`).
- `src/test/dev-preflight.test.ts`: the "no Docker under `scripts/`" promise conflicts with the
  mandated rehearsal path. I added one named exemption for `scripts/ui-polish/rehearse-effort-schema.mjs`.
  The rest of the promise is unchanged: setup docs, `package.json` and every other script are still
  checked.
- Nothing changed in GitHub or any external service. The vendored design system was not touched.

## Failures and corrections

- `npm run gen:types` (write mode) was not permitted in this worker. I applied the generated shape
  by hand and proved it byte-identical with `npm run gen:types -- --check`.
- The first rehearsal run failed because a helper JSON-decoded a bare text scalar. Fixed with
  `to_json(...)`. The second run had a wrong hard-coded row count in the idempotency check (10
  expected, 8 actual). It now compares full state before and after the reapply.
- The first full `npm test` run had 10 failures: migration-list registries, two `LoggedSet`
  expectations, and the dev-preflight Docker promise. All are fixed above. The two
  `design-0143-final-audit` failures remain (see blocker).

## Verification (2026-10-27)

| Command | Result |
| --- | --- |
| `npm test -- effort-persistence` | pass, 72/72 |
| `npm run gen:types -- --check` | pass, types current |
| `node scripts/ui-polish/rehearse-effort-schema.mjs` | pass, 27 checks on local `supabase/postgres:17.6.1.167`, container removed |
| `npm run lint:ds` | pass |
| `npm run lint` | pass, 0 errors (warnings only, none in touched files) |
| `npm run typecheck` | pass |
| `npm run build` | pass |
| `python3 scripts/gen-issues.py --check` | pass |
| `npm test` | **fail**: 2 tests, both in `src/test/design-0143-final-audit.test.ts` (see blocker) |

## Blocker: runtime-source-bound audit evidence

This is the TASK-006 blocker again. Any non-test `src/` change alters the runtime-source hash, and
the format-preview AFTER records and the final audit must name the current hash. Refreshing them
means re-running `e2e/design-0143/format-preview.spec.ts` on a committed tree against a disposable
local authenticated backend. This worker cannot do that. I did not edit any record hash or audit
text. That would fabricate evidence.

## Next safe action

The controller or an operator lane commits this diff, re-runs the TASK-034 mobile format-preview
capture on that commit the same way TASK-006's recovery did, re-derives the audit's runtime
hash/lineage, and then re-runs `npm test`. Remote application of the migration still needs its own
gate.

## Operator local-proof recovery

Native attempt1 reported a complete implementation and independently passed the effort-persistence
checks and actual local PostgreSQL rehearsal. Its full-suite failure was only the two stale
source-bound audit checks. Preserve this failure and unused second coding attempt. Preparing
a genuine new local browser capture group on the committed current source, without changing
any record schema, validator, task requirement or required check. Old groups remain untouched.
The separate owned local proof backend will use this task's actual additive migration; remote
schema application is still outside authority. No further coding invocation is needed for this proof.

The rehearsal refusal diagnostics now name the violated boundary without echoing a caller-supplied
argument or Docker endpoint, which might contain private connection data. Both argument and
nonlocal-endpoint refusals are checked before any Docker or database command. Exit semantics,
actual SQL/RLS checks and normal local rehearsal remain unchanged.
