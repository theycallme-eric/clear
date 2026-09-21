-- DATA-05 — Schema: user-authored constraints (REQ-015, issue #14)
--
-- Spec: docs/specs/DATA_MODEL.md §5 (`user_constraints`), with the eligibility
-- fragment in docs/specs/generation/GENERATION_CONTRACT.md §3.
--
-- Scope. One table and the two functions that make its rows mean something
-- deterministic: which constraints are in force for a given session, and which
-- equipment options survive an equipment exclusion. DATA-01b left this table
-- out deliberately and dropped `profiles.limitations` in favour of it — an
-- exclusion here is an explicit row, never prose an LLM interprets.
--
-- CLEAR does not model injuries. Three scopes, every one of them enforceable
-- against catalog data that already exists: an exercise id, a movement pattern,
-- a piece of equipment. There is no `impact` scope, because the catalog carries
-- no impact tagging to enforce it with, and a control that silently does
-- nothing is worse than no control.
--
-- Idempotent on an empty project: re-running this file is a no-op, so a failed
-- push can be retried without hand-editing the migration history. Nothing here
-- is destructive — this domain has no predecessor on the reused project.
--
-- Open, and owned elsewhere. DATA_MODEL §5 declares
-- `applies_to_session_id uuid REFERENCES workout_sessions(id) ON DELETE
-- CASCADE`. `workout_sessions` is DATA-01c's table: on an empty project it does
-- not exist yet, and on the reused project the table of that name is the
-- previous application's, which DATA-01c drops and rebuilds — an FK declared
-- here would be silently dropped with it. So the column ships with its
-- semantics enforced (§2's CHECK, §4's filter) and without the reference, and
-- DATA-01c adds the FK when the table it points at is the real one.

-- ===========================================================================
-- 1. Enums
-- ===========================================================================
--
-- New in DATA_MODEL §10. Guarded like every other enum in this series so the
-- file is re-runnable; none of these three exists on the reused project.

do $$
begin
  -- What the constraint is about. `impact` is deliberately absent (see above).
  if not exists (select 1 from pg_type where typname = 'constraint_scope') then
    create type public.constraint_scope as enum (
      'exercise', 'movement_pattern', 'equipment'
    );
  end if;

  -- How hard it is. Only `exclude` filters; the other two are ranking input
  -- that nothing consumes yet (§4).
  if not exists (select 1 from pg_type where typname = 'constraint_action') then
    create type public.constraint_action as enum (
      'exclude', 'avoid', 'prefer_not'
    );
  end if;

  -- How long it lasts — CHANGE_SET_v0.4 §"this session · persistent".
  if not exists (
    select 1 from pg_type where typname = 'constraint_persistence'
  ) then
    create type public.constraint_persistence as enum ('session', 'persistent');
  end if;
end;
$$;

-- ===========================================================================
-- 2. user_constraints
-- ===========================================================================
--
-- One row per thing the user has said they do not want. The three target
-- columns are nullable and the CHECKs make exactly one of them the populated
-- one *and* make it the one the scope names — so "scope says equipment, target
-- is an exercise id" is not a row this table can hold, and no reader has to
-- defend against it.

create table if not exists public.user_constraints (
  id      uuid primary key default gen_random_uuid(),
  -- DATA_MODEL §5 writes this as `auth.users(id)`; `profiles.id` *is* that id
  -- and cascades from it, so pointing at the domain's own table is the same
  -- deletion behaviour and the same convention `locations` already follows.
  user_id uuid not null references public.profiles (id) on delete cascade,

  scope       public.constraint_scope       not null,
  action      public.constraint_action      not null,
  persistence public.constraint_persistence not null default 'persistent',

  -- DATA-01c adds the foreign key (see the header). Until then this is a bare
  -- uuid, and nothing reads it except §4's filter.
  applies_to_session_id uuid,

  -- The catalog is the vocabulary. An exercise id is checked by the database;
  -- a pattern is checked by its enum; equipment is free text because DATA-01a
  -- models equipment as the ids inside `exercise_definitions.equipment_options`
  -- and there is no table to point at (the same reasoning as
  -- `location_equipment.equipment_id`). An equipment id that matches nothing
  -- excludes nothing, which is the same outcome as not owning it. CASCADE
  -- because a constraint against an exercise the catalog no longer has is not
  -- a constraint, and NO ACTION would make catalog maintenance fail on it.
  target_exercise_id text references public.exercise_definitions (id)
    on delete cascade,
  target_pattern     public.movement_pattern,
  target_equipment   text,

  -- Stored, shown back, and passed to Claude as best-effort context. Never
  -- parsed: no trigger reads it, no function below reads it, and no constraint
  -- is ever inferred from it. A deterministic exclusion is always an explicit
  -- row (DATA_MODEL §5).
  note text,

  created_at timestamptz not null default now(),

  constraint user_constraints_exactly_one_target check (
    num_nonnulls(target_exercise_id, target_pattern, target_equipment) = 1
  ),
  constraint user_constraints_target_matches_scope check (
    (scope = 'exercise'         and target_exercise_id is not null) or
    (scope = 'movement_pattern' and target_pattern     is not null) or
    (scope = 'equipment'        and target_equipment   is not null)
  ),
  -- The leak this closes is real: without it, a one-session exclusion applies
  -- forever. A session-scoped row has to name the session it belongs to.
  constraint user_constraints_session_scope_has_session check (
    persistence = 'persistent' or applies_to_session_id is not null
  ),
  constraint user_constraints_target_equipment_not_blank check (
    target_equipment is null or btrim(target_equipment) <> ''
  )
);

comment on table public.user_constraints is
  'Explicit exclusions a user sets for themselves: exercise, movement pattern, '
  'or equipment. Not an injury model. `note` is stored and never parsed.';

comment on column public.user_constraints.applies_to_session_id is
  'Set when persistence = ''session''. A session-scoped exclusion applies to '
  'that session and to no later one; constraints_in_force() is where that is '
  'enforced. The FK to workout_sessions lands with DATA-01c.';

comment on column public.user_constraints.note is
  'Free text. Best-effort composition context for Claude only — no constraint '
  'is ever inferred from it.';

-- The read every eligibility query makes: this user's rows, narrowed by action
-- and scope.
create index if not exists user_constraints_user_idx
  on public.user_constraints (user_id, action, scope);

-- And the other direction: everything scoped to one session, which is what a
-- session's own screen shows and what cleanup after a session would read.
create index if not exists user_constraints_session_idx
  on public.user_constraints (applies_to_session_id)
  where applies_to_session_id is not null;

-- The same exclusion added twice is not an error the user should have to see,
-- but it is two rows that filter identically and show up twice in a list. The
-- expression collapses the three target columns into the one that is populated
-- — guaranteed by the CHECKs above — and the sentinel stands in for "not
-- session-scoped", because NULLs in a unique index do not collide.
create unique index if not exists user_constraints_no_duplicates_idx
  on public.user_constraints (
    user_id,
    scope,
    action,
    (coalesce(target_exercise_id, target_pattern::text, target_equipment)),
    (coalesce(applies_to_session_id, '00000000-0000-0000-0000-000000000000'::uuid))
  );

-- ===========================================================================
-- 3. Row-level security — owner-only
-- ===========================================================================
--
-- DATA-01b's posture, unchanged: the owner reads and writes, nobody else sees
-- the row exists. Policies scoped `TO authenticated` so an anonymous request
-- matches nothing, owner predicates on both USING and WITH CHECK so an UPDATE
-- cannot rewrite a row into someone else's ownership, and `auth.uid()` wrapped
-- in a scalar subquery so the planner evaluates it once per statement rather
-- than once per row (migration 00019's lesson).

alter table public.user_constraints enable row level security;

drop policy if exists user_constraints_select_own on public.user_constraints;
create policy user_constraints_select_own on public.user_constraints
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists user_constraints_insert_own on public.user_constraints;
create policy user_constraints_insert_own on public.user_constraints
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists user_constraints_update_own on public.user_constraints;
create policy user_constraints_update_own on public.user_constraints
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- DELETE has a policy and a grant here, unlike `profiles`: removing a
-- constraint is how a user changes their mind, and the row leaves no hole
-- behind when it goes.
drop policy if exists user_constraints_delete_own on public.user_constraints;
create policy user_constraints_delete_own on public.user_constraints
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.user_constraints from anon, authenticated;
grant select, insert, update, delete on public.user_constraints to authenticated;
grant all on public.user_constraints to service_role;

-- ===========================================================================
-- 4. What is in force, and what survives
-- ===========================================================================
--
-- Two functions, because the two halves of "a constraint filtered something"
-- are separable and both have to be deterministic:
--
--   * `constraints_in_force` answers "which of this user's rows apply to this
--     session" — persistent always, session-scoped only to its own session.
--   * `usable_equipment` answers "which of these options survive", which is a
--     narrowing and not a rejection: an exercise usable with dumbbells and a
--     barbell survives a barbell exclusion, and what reaches Claude offers
--     dumbbells only.
--
-- They are SECURITY INVOKER, so RLS above still decides what an authenticated
-- caller can see and the user id is not a way around it. The explicit
-- `p_user_id` is for the service-role caller that generation runs as, where RLS
-- is bypassed and "the caller" is not a person.
--
-- GEN-01's eligibility query composes them; this migration does not own that
-- query. The shape it composes into (GENERATION_CONTRACT §3):
--
--   SELECT ec.id, ...,
--          public.usable_equipment(
--            $user, ec.equipment_options, $available, $session) AS usable_equipment
--   FROM public.exercise_catalog ec
--   WHERE ...
--     AND ec.id <> ALL (SELECT c.target_exercise_id
--                         FROM public.constraints_in_force($user, $session) c
--                        WHERE c.action = 'exclude' AND c.scope = 'exercise')
--     AND NOT (ec.movement_patterns && ARRAY(
--                SELECT c.target_pattern
--                  FROM public.constraints_in_force($user, $session) c
--                 WHERE c.action = 'exclude' AND c.scope = 'movement_pattern'))
--     AND cardinality(usable_equipment) > 0
--
-- `action = 'exclude'` is the caller's to state and is stated there rather than
-- baked in here, because `avoid` and `prefer_not` reach Claude through the same
-- function as the deprioritize list. Nothing filters on them: they are modelled
-- and carried, and they start filtering when a ranking layer consumes them.

create or replace function public.constraints_in_force(
  p_user_id    uuid,
  p_session_id uuid default null
)
returns setof public.user_constraints
language sql
stable
security invoker
set search_path = ''
as $$
  select c.*
  from public.user_constraints c
  where c.user_id = p_user_id
    -- A session-scoped row whose session is not this one fails the comparison
    -- (or yields NULL when no session was given), which is the same answer:
    -- not in force. The CHECK in §2 is what makes that comparison meaningful —
    -- a session-scoped row always has a session to compare.
    and (c.persistence = 'persistent' or c.applies_to_session_id = p_session_id)
  order by c.created_at, c.id
$$;

comment on function public.constraints_in_force(uuid, uuid) is
  'The constraints applying to one session: persistent always, session-scoped '
  'only to its own session. A one-session exclusion does not reach the next.';

create or replace function public.usable_equipment(
  p_user_id    uuid,
  p_options    text[],
  p_available  text[],
  p_session_id uuid default null
)
returns text[]
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(array_agg(o.equipment_id order by o.equipment_id), '{}')
  from unnest(p_options) as o (equipment_id)
  where o.equipment_id = any (p_available)
    and not exists (
      select 1
      from public.constraints_in_force(p_user_id, p_session_id) c
      where c.action = 'exclude'
        and c.scope = 'equipment'
        and c.target_equipment = o.equipment_id
    )
$$;

comment on function public.usable_equipment(uuid, text[], text[], uuid) is
  'The equipment options that survive availability and this session''s '
  'equipment exclusions. Sorted, so the candidate handed to Claude is the same '
  'on every run. Empty means the exercise is not eligible at all.';
