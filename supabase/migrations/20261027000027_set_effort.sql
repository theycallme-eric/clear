-- TASK-007 (REQ-012, TC-001) — one categorical effort observation per logged
-- set, stored losslessly beside, and never inside, the historical RPE.
--
-- Spec: docs/progress/ui-polish-2026-10-26-text-final/TASK-007.md records the
-- seams this reaches. The per-set effort choice is three categories — too
-- hard, about right, too easy — or no answer at all.
--
-- Scope. One enum, one nullable column, and the column grants that let the
-- owner write it.
--
--   * Distinct from `rpe`. `rpe numeric(3, 1)` keeps every historical value
--     and its 1–10 CHECK exactly as they are. A category is not a number on
--     that scale, and storing one there would invent a conversion nobody
--     approved, so the categories have their own column and their own type.
--   * Additive. `add column` with no default leaves every existing row NULL —
--     no history is rewritten and nothing is backfilled — and NULL is exactly
--     what the contract calls unanswered: no fabricated effort for a set
--     logged before this column existed.
--   * Read back without a reader change. `session_performed`, the snapshot
--     and the three `session_as_*` reconstructions build each set log with
--     `to_jsonb(l)`, so the column reaches every reader the moment it exists.
--   * Nothing downstream reads it. No RPE conversion, session aggregation,
--     progression, adaptation or prompt input follows from this column; the
--     anchor and training-history functions still name `rpe` and only `rpe`.

-- ===========================================================================
-- 1. set_effort
-- ===========================================================================

do $$
begin
  -- Ordered as the choice is offered, hardest first. The order is
  -- presentation only: the values are categories, not points on a scale.
  if not exists (select 1 from pg_type where typname = 'set_effort') then
    create type public.set_effort as enum (
      'too_hard', 'about_right', 'too_easy'
    );
  end if;
end
$$;

comment on type public.set_effort is
  'REQ-012: how one logged set felt — too hard, about right or too easy. A '
  'category, never a numeric RPE; an unanswered set is NULL, not a value here.';

-- ===========================================================================
-- 2. exercise_set_logs.effort
-- ===========================================================================

alter table public.exercise_set_logs
  add column if not exists effort public.set_effort;

comment on column public.exercise_set_logs.effort is
  'REQ-012: the per-set effort category. NULL is unanswered, including every '
  'set logged before REQ-012. Independent of rpe, which keeps its history.';

-- ===========================================================================
-- 3. Privileges
-- ===========================================================================
--
-- `exercise_set_logs` is granted column by column (DATA-01d §6), so a new
-- column is unwritable until it is named. Insert records the answer with the
-- set; update is the correction path — another category, or NULL to clear it.

grant insert (effort) on public.exercise_set_logs to authenticated;
grant update (effort) on public.exercise_set_logs to authenticated;
