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
- `constraint-selectors.ts` (DATA-05) — pure reads over a constraint set the server returned.
  Deterministic filtering is SQL's (`constraints_in_force`, `usable_equipment`); these mirror it for
  rendering, and where they disagree with the database, the database is right.
