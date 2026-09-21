# `supabase/migrations`

Two kinds of file live here.

## The rebuild's own migrations

`20260921000000_catalog_domain.sql` onwards. Authored against
`docs/specs/DATA_MODEL.md`, one per domain, commented, idempotent on an empty
project. These are the migrations the project actually owns.

## Inherited history markers — `00001` … `00029`

Every file numbered below `00030` is a **no-op**. It contains comments and
nothing else. They exist for one reason, and it is worth stating plainly because
an empty migration file otherwise looks like a mistake.

The rebuild **reuses the live Supabase project** rather than starting a new one
(`docs/backend/dispositions.md` §9). That project's
`supabase_migrations.schema_migrations` table already records twenty-nine
migrations applied by the previous application — the exact list is in
`docs/backend/capture/inventory-2026-09-18T162244Z.txt`. The Supabase CLI
refuses to run `db push`, in dry-run mode or otherwise, while a version exists
remotely with no matching local file:

```
Remote migration versions not found in local migrations directory.
```

There are two ways out of that. One is `supabase migration repair --status
reverted 00001 … 00029`, which deletes twenty-nine rows from the live project.
That is a live mutation, and the off-machine-backup gate in
`docs/backend/live-inventory.md` forbids it until TASK-072. The other is to give
the CLI the local files it is looking for, which costs nothing and touches
nothing. This directory takes the second route.

The original SQL is **not** lost and is deliberately not reproduced here —
reproducing it would rebuild the old schema on `supabase db reset`, which is the
opposite of what the rebuild wants. It is preserved as read-only evidence of the
archived `theycallme-eric/clear-app` repository, and the schema it produced is
captured in `docs/backend/capture/` and in the verified full dump recorded in
`docs/backend/live-inventory.md`.

### What this means in practice

- `supabase db reset` (local) applies twenty-nine no-ops and then the rebuild's
  migrations, leaving a database that is purely the new schema.
- `supabase db push` against the reused project skips all twenty-nine — they are
  already in its history — and pushes only the rebuild's migrations.
- Nothing here depends on the gate, and nothing here mutates the live project.

### Removal

TASK-072 resets the bookkeeping to the rebuild's own series after the gate
clears (`docs/backend/dispositions.md` §9). At that point `supabase migration
repair --status reverted` drops the inherited rows from the live project and
every file numbered below `00030` is deleted from this directory in the same
change. Until then, deleting them breaks `supabase db push`.
