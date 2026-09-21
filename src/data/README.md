# Data boundary

Catalog access, Supabase clients, repositories, and persistence adapters belong here.

## What is here now

- `constraints.ts` (DATA-05) — the typed client for `user_constraints`: the domain type, the row
  mapping, and the PostgREST calls. It carries its own transport because the shared client is
  DATA-03's and waits on DATA-01d; when that lands, the transport collapses into it and the types
  and mapping stay. Every call takes an injected `fetch` and returns `Result<…, AppError>` from
  `src/state/errors.ts` — nothing in this directory throws a string, and no `any` escapes it.
- `constraint-selectors.ts` (DATA-05) — pure reads over a constraint set the server returned.
  Deterministic filtering is SQL's (`constraints_in_force`, `usable_equipment`); these mirror it for
  rendering, and where they disagree with the database, the database is right.
