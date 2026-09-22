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
  (`supabase/migrations/20260921000004_generation_candidates.sql`). What it owns is the domain
  shape, the parse of the `jsonb` candidate list, and the typed empty-set failure —
  `GENERATION_NO_CANDIDATES`, naming the sections that resolved to nothing. One RPC per request,
  and no model call anywhere in the path.
- `constraint-selectors.ts` (DATA-05) — pure reads over a constraint set the server returned.
  Deterministic filtering is SQL's (`constraints_in_force`, `usable_equipment`); these mirror it for
  rendering, and where they disagree with the database, the database is right.
