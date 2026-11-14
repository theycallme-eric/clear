-- TASK-031 (REQ-031; MIG-A of docs/specs/LOGGING_FIELD_CONTRACT.md §7) — an
-- optional categorical effort for a whole timed block, stored beside, and
-- never inside, the historical 1–10 `perceived_effort`.
--
-- Spec: docs/specs/LOGGING_FIELD_CONTRACT.md §4 (four different "efforts",
-- none derived from another) and §7 (MIG-A). Progress record:
-- docs/journal/clear-refinement-20261103/TASK-031.md.
--
-- NOT APPLIED. This file is part of the repository's declared schema so the
-- generated types, the client mapping and the deterministic tests can be built
-- against it. Applying it to any hosted project is the owner's separate
-- decision (LIVE-PRE-1); until then the hosted `block_results` has no `effort`
-- column, and the shipped completion path never sends one (the writer omits an
-- unanswered effort, and no renderer reports one yet).
--
-- Scope. One nullable column, reusing an existing type.
--
--   * Reuses `public.set_effort` (20261027000027): the same three categories —
--     too hard, about right, too easy — and the same "NULL is unanswered".
--     No new vocabulary, so a block's effort and a set's effort cannot drift.
--   * Distinct from `perceived_effort`. That smallint keeps its 1–10 CHECK and
--     its adaptive meaning (`conditioningTrend` reads two complete finishes at
--     ≤ 7 as an easy pair). A category is not a point on that scale, and any
--     number chosen for "too easy" would fabricate a progression signal.
--   * Additive. No default and no backfill: every row written before this
--     column reads NULL — unanswered — which is exactly true of it.
--   * Read back without a reader change. The `session_as_*` reconstructions
--     return `to_jsonb(br)`, so the column reaches History the moment it
--     exists (`session_snapshot` carries no block result).
--   * Granted already. `block_results` is granted at table level (select,
--     insert, update, delete to authenticated, 20260921000004), so the owner can
--     write and correct it through the existing `block_results_*_own` policies.
--   * Nothing downstream reads it: no RPE conversion, conditioning score,
--     progression or prompt input follows from this column.

alter table public.block_results
  add column if not exists effort public.set_effort;

comment on column public.block_results.effort is
  'REQ-030/REQ-031 (MIG-A): the optional categorical effort for the whole '
  'block — too hard, about right or too easy. NULL is unanswered, including '
  'every row written before this column. Independent of perceived_effort, '
  'which keeps its historical 1–10 meaning; neither is derived from the other.';
