# Data boundary

Catalog access, Supabase clients, repositories, and persistence adapters belong here.

## What is here now

- `database.types.ts` (DATA-03) — **generated, never edited.** `npm run gen:types` writes it from
  `supabase/migrations/`; `npm run gen:types -- --check` fails on drift and runs in CI. It is the
  only source of a table's row shape, an insert's required columns, an RPC's arguments, and an
  enum's values.
- `supabase.ts` (DATA-03) — the typed client, and the only PostgREST transport in `src/`. Typed
  table helpers (`from(table).select/insert/update/delete`) and typed RPC (`rpc(fn, args)`), each
  keyed to the generated types, so a renamed column is a compile error rather than a 400. Takes an
  injected `fetch`, returns `Result<…, AppError>` from `src/state/errors.ts`, and asserts a row
  shape in exactly one place (`asRows`), which is where CORE-03's parsing will attach.
- `constraints.ts` (DATA-05) — `user_constraints` as a domain type: the discriminated union over
  `scope`, the mapping to and from the generated row, and the four calls that use it. The transport
  is `supabase.ts`'s; what lives here is the meaning. Nothing in this directory throws a string, and
  no `any` escapes it.
- `auth.ts` (AUTH-01) — the session, and only the session. The one place in `src/` that calls
  GoTrue: restore from storage, exchange an expired refresh token on demand, revoke on sign-out. It
  owns no clock (nothing is scheduled) and no profile (a user id and an email, nothing more), it
  answers `Result<…, AppError>` like everything else here, and it reports a refresh that could not
  be delivered as `RESTORE_FAILED` rather than as a sign-out — the D1 distinction. AUTH-02's verify
  call turns its payload into a session with `sessionFromPayload` and hands it to `setSession`.
- `candidates.ts` (GEN-02a) — the eligible exercises for a generation request, read back from
  `generation_candidate_sets`. It decides no eligibility of its own: focus→pattern, section,
  equipment and exclusions all ran in SQL before a row arrived
  (`supabase/migrations/20260921000005_generation_candidates.sql`). What it owns is the domain
  shape, the parse of the `jsonb` candidate list, and the typed empty-set failure —
  `GENERATION_NO_CANDIDATES`, naming the sections that resolved to nothing and the failure class of
  each (`catalog_defect`, `athlete_constraint`, `missing_equipment`, `empty_profile`; GR-04). One RPC
  per request, a second (`generation_refusal_diagnostics`) only to classify a refusal, and no model
  call anywhere in the path.
- `viability.ts` (REQ-010) — whether a *proposed* Goal, section toggles, exclusions and location
  equipment can generate at all, read back from `generation_viability`
  (`supabase/migrations/20261001000021_generation_viability.sql`). The proposal is the arguments;
  nothing saved is read and nothing is written. It answers viable, or each failing section with its
  class (`catalog_gap`, `missing_equipment`, `athlete_exclusion`, `no_sections`) and the
  incompatible choice. REQ-012 adds the refusal read: the database runs the same evaluation when a
  Goal, section or limitation changes (`20261002000022_settings_viability_guard.sql`) and refuses
  the write, and `settingsRefusalFrom` turns that write's error into the sentence naming the choice
  and the place. `user-data.ts` (`updatePreferences`) and `constraints.ts` (`add`) apply it.
- `generation.ts` (GEN-03) — the call to `generate-workout`, and every way it refuses. One method,
  answering the validated workout or a typed error carrying the request id, and never both. Three
  refusals happen before anything is sent: a request `workout_sessions`' CHECK constraints would not
  hold, a caller with no session, and nothing else. The answer is re-parsed with CORE-03's schemas
  rather than trusted, and the contract's §9 code is read when the function names one — each of the
  six mapping to its own sentence and its own answer to whether retrying could work. There is no
  fallback here and no fixture to reach for; `src/test/generation-fallback.test.ts` proves it.
- `streak.ts` (SES-01c) — the streak query: the completed sessions `streak_sessions(...)` returns,
  newest first, and `src/state/streak.ts` derives the count from. It owns the three things between
  the rows and the derivation — the time zone resolved once when the client is made, the cursor
  that reads the page before when a run reaches the oldest row it was given, and the typed failure
  that keeps a read which did not happen from rendering as a streak of zero. Nothing is cached and
  nothing is written back; there is no streak column to write it to.
- `constraint-selectors.ts` (DATA-05) — pure reads over a constraint set the server returned.
  Deterministic filtering is SQL's (`constraints_in_force`, `usable_equipment`); these mirror it for
  rendering, and where they disagree with the database, the database is right.
