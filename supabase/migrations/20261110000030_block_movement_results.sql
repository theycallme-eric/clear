-- TASK-031 (REQ-031; MIG-B of docs/specs/LOGGING_FIELD_CONTRACT.md §7) — one
-- row per movement per timed block attempt: the round its partial amount
-- belongs to, the set log's measurement vocabulary, and a stamped unit.
--
-- Spec: docs/specs/LOGGING_FIELD_CONTRACT.md §5 (why not exercise_set_logs),
-- §6 (the timed contract) and §7 (MIG-B). Progress record:
-- docs/journal/clear-refinement-20261103/TASK-031.md.
--
-- NOT APPLIED. This file is part of the repository's declared schema so the
-- generated types, the writer and the History read model can be built and
-- tested against it. Applying it to any hosted project is the owner's separate
-- decision (LIVE-PRE-1). Until then the hosted project has no such table; no
-- shipped code path writes or reads it directly, and the hosted
-- `session_as_*` functions keep answering without `movement_result`, which
-- the client reads as "no movement actual recorded".
--
-- Why a table of its own rather than `exercise_set_logs` (§5, rehearsed in
-- src/data/refinement-logging-contract.test.ts with the real readers):
--
--   1. `anchor_evidence` reads every working set log of a completed session,
--      whatever the block's structure; a next-round partial (5 of 12) would
--      read as a short working set and raise the missed-rep deload (D5).
--   2. History would show and count it as an ordinary set.
--   3. A movement's load for the whole attempt has no set identity.
--   4. `set_number` is immutable under correction (20261027000028), while a
--      partial's round must follow a corrected round count.
--
-- Identity. One row per movement per block attempt: UNIQUE
-- (workout_exercise_id). A block is attempted once per session, and a
-- workout_exercises row belongs to exactly one block. The id is minted by the
-- client (no default), as a set log's is, so a retried insert collides
-- instead of duplicating; a correction is an UPDATE addressed to the movement,
-- restating every value.
--
-- Missing-data semantics, the set log's (I3): a null value is not recorded,
-- zero is a measurement, and no row is nothing recorded for that movement.
-- No actual column has a default. A row needs something observed (an amount
-- or a load), and an amount needs the round it belongs to.
--
-- Changes from the TASK-030 draft (recorded in the progress note):
--
--   * `updated_at` is maintained by the existing `public.set_updated_at()`
--     trigger rather than granted to the client, so the client cannot write a
--     stamp the database did not observe.
--   * The `performed` reconstruction also keeps a superseded prescription that
--     carries a movement result, as it already does one that carries set logs
--     (evidence of having been performed is never dropped, D6).

-- ===========================================================================
-- 1. block_movement_results
-- ===========================================================================

create table if not exists public.block_movement_results (
  -- Client-minted, and the absence of a default is what makes that true.
  id uuid primary key,

  workout_exercise_id uuid not null,

  -- Not client-settable (see the column grants in §3): it takes 'active' on
  -- insert, so the composite foreign key below resolves only against a
  -- prescription that is active when the result is written, and it cascades
  -- forward if that prescription is superseded later — the set log's rule.
  prescription_revision_status public.revision_status not null default 'active',

  -- The round (AMRAP round, ladder rung, For Time round) the amounts belong
  -- to, from the block's own recorded outcome; null on a load-only row.
  round_number int,

  -- ── what was performed in that round; null means not recorded ──
  actual_reps             int,
  actual_duration_seconds int,
  actual_distance         numeric,
  actual_distance_unit    public.distance_unit,

  -- The actual load used for this movement in the attempt, never the
  -- prescribed load.
  weight numeric,

  -- Stamped per row at write time, never inherited later.
  weight_unit public.weight_unit not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint block_movement_results_prescription_fkey
    foreign key (workout_exercise_id, prescription_revision_status)
    references public.workout_exercises (id, revision_status)
    on update cascade
    on delete cascade,

  constraint block_movement_results_one_per_movement
    unique (workout_exercise_id),

  constraint block_movement_results_round_positive
    check (round_number is null or round_number > 0),

  -- An amount without its round would be attached to a guessed one.
  constraint block_movement_results_amount_needs_round
    check (
      round_number is not null
      or (actual_reps is null and actual_duration_seconds is null and actual_distance is null)
    ),

  -- A row is an observation; an empty one would claim something was recorded.
  constraint block_movement_results_observed
    check (
      actual_reps is not null or actual_duration_seconds is not null
      or actual_distance is not null or weight is not null
    ),

  constraint block_movement_results_reps_non_negative
    check (actual_reps is null or actual_reps >= 0),
  constraint block_movement_results_duration_non_negative
    check (actual_duration_seconds is null or actual_duration_seconds >= 0),
  constraint block_movement_results_distance_non_negative
    check (actual_distance is null or actual_distance >= 0),
  constraint block_movement_results_distance_has_unit
    check (actual_distance is null or actual_distance_unit is not null),
  constraint block_movement_results_weight_non_negative
    check (weight is null or weight >= 0)
);

comment on table public.block_movement_results is
  'REQ-031 (MIG-B): one row per movement per timed block attempt — the round '
  'a partial amount belongs to and the actual load. Not a set: anchor '
  'evidence, History set counts and set numbering never read it.';

comment on column public.block_movement_results.round_number is
  'The round the amounts belong to, from the block''s recorded outcome '
  '(AMRAP rounds + 1, ladder rung + 1, For Time single pass or recorded count '
  '+ 1). NULL on a load-only row; never guessed.';

drop trigger if exists block_movement_results_set_updated_at on public.block_movement_results;
create trigger block_movement_results_set_updated_at
  before update on public.block_movement_results
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- 2. Row-level security — owner-only, inherited up to the session
-- ===========================================================================
--
-- Exactly the exercise_set_logs_*_own predicates (20260921000004): the row
-- walks up through its exercise, block and section to the session that
-- stores the owner.

alter table public.block_movement_results enable row level security;

drop policy if exists block_movement_results_select_own on public.block_movement_results;
create policy block_movement_results_select_own on public.block_movement_results
  for select to authenticated
  using (
    exists (
      select 1
      from public.workout_exercises we
      join public.workout_blocks   b   on b.id   = we.block_id
      join public.workout_sections sec on sec.id = b.section_id
      join public.workout_sessions s   on s.id   = sec.session_id
      where we.id = block_movement_results.workout_exercise_id
        and s.user_id = (select auth.uid())
    )
  );

drop policy if exists block_movement_results_insert_own on public.block_movement_results;
create policy block_movement_results_insert_own on public.block_movement_results
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.workout_exercises we
      join public.workout_blocks   b   on b.id   = we.block_id
      join public.workout_sections sec on sec.id = b.section_id
      join public.workout_sessions s   on s.id   = sec.session_id
      where we.id = block_movement_results.workout_exercise_id
        and s.user_id = (select auth.uid())
    )
  );

drop policy if exists block_movement_results_update_own on public.block_movement_results;
create policy block_movement_results_update_own on public.block_movement_results
  for update to authenticated
  using (
    exists (
      select 1
      from public.workout_exercises we
      join public.workout_blocks   b   on b.id   = we.block_id
      join public.workout_sections sec on sec.id = b.section_id
      join public.workout_sessions s   on s.id   = sec.session_id
      where we.id = block_movement_results.workout_exercise_id
        and s.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.workout_exercises we
      join public.workout_blocks   b   on b.id   = we.block_id
      join public.workout_sections sec on sec.id = b.section_id
      join public.workout_sessions s   on s.id   = sec.session_id
      where we.id = block_movement_results.workout_exercise_id
        and s.user_id = (select auth.uid())
    )
  );

-- A movement result cleared on correction is removed, not zeroed: zero is a
-- measurement.
drop policy if exists block_movement_results_delete_own on public.block_movement_results;
create policy block_movement_results_delete_own on public.block_movement_results
  for delete to authenticated
  using (
    exists (
      select 1
      from public.workout_exercises we
      join public.workout_blocks   b   on b.id   = we.block_id
      join public.workout_sections sec on sec.id = b.section_id
      join public.workout_sessions s   on s.id   = sec.session_id
      where we.id = block_movement_results.workout_exercise_id
        and s.user_id = (select auth.uid())
    )
  );

-- ===========================================================================
-- 3. Privileges
-- ===========================================================================
--
-- Column by column, as exercise_set_logs is. `prescription_revision_status`,
-- `created_at` and `updated_at` are not grantable: the database observes them.
-- The movement and id are fixed once written; a correction restates the values.

revoke all on public.block_movement_results from anon, authenticated;

grant select, delete on public.block_movement_results to authenticated;
grant insert (
  id, workout_exercise_id, round_number,
  actual_reps, actual_duration_seconds,
  actual_distance, actual_distance_unit,
  weight, weight_unit
) on public.block_movement_results to authenticated;
grant update (
  round_number,
  actual_reps, actual_duration_seconds,
  actual_distance, actual_distance_unit,
  weight, weight_unit
) on public.block_movement_results to authenticated;

grant all on public.block_movement_results to service_role;

-- ===========================================================================
-- 4. session_reconstruction() — each exercise also carries its movement result
-- ===========================================================================
--
-- 20260921000010's builder, unchanged except for two additions:
--
--   * each exercise object carries `movement_result` — its row, or null;
--   * the `performed` predicate keeps a superseded prescription that carries a
--     movement result, as it keeps one that carries set logs (D6).
--
-- `create or replace` with the same signature keeps the function's existing
-- privileges and the three named entry points that call it. `session_snapshot`
-- and `anchor_evidence` are untouched: these rows are not sets.

create or replace function public.session_reconstruction(
  p_session_id uuid,
  p_kind public.reconstruction_kind
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'reconstruction', p_kind,
    'as_of', case p_kind
               when 'generated'         then s.created_at
               when 'intended_at_start' then s.started_at
               when 'performed'         then coalesce(s.completed_at, s.abandoned_at, now())
             end,
    'session', to_jsonb(s),
    'state', public.session_state(s.started_at, s.completed_at, s.abandoned_at),
    'sections', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'section', to_jsonb(sec),
          'blocks', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'block', to_jsonb(b),
                'block_result', (
                  select to_jsonb(br)
                  from public.block_results br
                  where br.block_id = b.id
                ),
                'exercises', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'exercise', to_jsonb(we),
                      'set_logs', coalesce((
                        select jsonb_agg(to_jsonb(l) order by l.set_number)
                        from public.exercise_set_logs l
                        where l.workout_exercise_id = we.id
                      ), '[]'::jsonb),
                      -- MIG-B: at most one per exercise (UNIQUE), or null.
                      'movement_result', (
                        select to_jsonb(m)
                        from public.block_movement_results m
                        where m.workout_exercise_id = we.id
                      )
                    )
                    order by we.order_index, we.created_at
                  )
                  from public.workout_exercises we
                  where we.block_id = b.id
                    and case p_kind
                          when 'generated' then
                            we.origin = 'generated'

                          when 'intended_at_start' then
                            s.started_at is not null
                            and we.created_at <= s.started_at
                            and (
                              we.superseded_at is null
                              or we.superseded_at > s.started_at
                            )

                          when 'performed' then
                            we.revision_status = 'active'
                            or we.execution_status <> 'not_started'
                            or exists (
                              select 1
                              from public.exercise_set_logs l
                              where l.workout_exercise_id = we.id
                            )
                            or exists (
                              select 1
                              from public.block_movement_results m
                              where m.workout_exercise_id = we.id
                            )
                        end
                ), '[]'::jsonb)
              )
              order by b.order_index
            )
            from public.workout_blocks b
            where b.section_id = sec.id
          ), '[]'::jsonb)
        )
        order by sec.order_index
      )
      from public.workout_sections sec
      where sec.session_id = s.id
    ), '[]'::jsonb)
  )
  from public.workout_sessions s
  where s.id = p_session_id
$$;

comment on function public.session_reconstruction(uuid, public.reconstruction_kind) is
  'One envelope for all three reconstructions (DATA_MODEL §7). Each exercise '
  'carries its set logs and, since MIG-B, its timed movement result.';
