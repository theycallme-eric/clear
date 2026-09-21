# `supabase/seed`

Generated. Every `.sql` file here is written by `npm run seed`
(`scripts/catalog-seed/`) and overwritten on the next run. `npm run seed --
--check` fails if one has been hand-edited, so an edit made here is lost rather
than kept.

## What is seeded

| File | Rows | Table |
|---|---:|---|
| `010_exercise_definitions.sql` | 140 | `exercise_definitions` |
| `020_exercise_muscle_groups.sql` | 488 | `exercise_muscle_groups` |
| `030_exercise_pattern_weights.sql` | 102 | `exercise_pattern_weights` |
| `090_dev_baseline.sql` | 1 + 1 | `profiles`, `locations` — `--dev` only |

The first three are the audited preservation set, transformed from the read-only
capture in `docs/backend/snapshot/2026-09-18T162821Z/catalog/` and the reviewed
workout-anatomy tags in
`docs/backend/evidence/previous-migrations/00031_tag_exercises.sql`. The
transformation and its equivalence proof are recorded in
`docs/backend/taxonomy-equivalence.md`; read that before changing anything.

The 150 captured exercise-anchor links become 102 pattern weights. The other 48
carried `surprise`, which named the absence of a movement pattern; the seed
refuses to run unless every affected exercise is still reachable through its
preserved `exercise_role` or `sections`.

## Nothing here is applied

`npm run seed` writes files. It opens no connection and reads no credential.
Applying these against the reused Supabase project is **TASK-072**, behind the
off-machine-backup gate in `docs/backend/live-inventory.md`.

The first three files are listed in `[db.seed]` in `supabase/config.toml`, so a
local `supabase db reset` applies them in the order above — which is foreign-key
order, definitions first.

## Idempotence

Both directions, and the second is the one that is easy to get wrong.

* Running `npm run seed` twice writes byte-identical files. Every collection is
  sorted and no timestamp is emitted.
* Applying a file twice touches zero rows. Each `ON CONFLICT DO UPDATE` carries
  an `IS DISTINCT FROM` guard, so `exercise_definitions`' `updated_at` trigger
  does not fire on a re-apply. A seed that merely "did not error" twice would
  still churn 140 timestamps.

Each file ends by counting its own table and raising if the number is wrong.
That check runs at apply time, where a row this seed knows nothing about would
otherwise pass unnoticed.

## `090_dev_baseline.sql`

Written only by `npm run seed -- --dev`, and deliberately **not** in
`[db.seed]`: it targets a development database and needs an owner id the
operator supplies.

```sh
npm run seed -- --dev
psql "$SUPABASE_DB_URL" \
  -c "set clear.dev_owner_id = '<auth user uuid>'" \
  -f supabase/seed/090_dev_baseline.sql
```

It creates one profile and one default location from constants in
`scripts/catalog-seed/sql.mjs`. It copies no prior personal row — none is
available to it, and none is wanted
(`docs/process/CATALOG_MIGRATION_SCOPE.md`, Exclude). It does not create the
auth user; sign in once first.

`public.profiles` and `public.locations` are **DATA-01b's** tables and do not
exist yet. The script raises a named exception saying so rather than silently
doing nothing.
