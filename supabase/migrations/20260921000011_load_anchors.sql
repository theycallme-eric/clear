-- OVR-01a — load anchors: the table, and the evidence it is derived from
-- (REQ-065, issue #65)
--
-- Spec: docs/specs/OVR-01_progressive-overload.md §1 (the anchor math) and its
-- "Data needed" table (`load_anchors`, `is_deload`).
--
-- Scope. This file adds the place an anchor is kept and the query that says
-- which sets are allowed to move one. It changes no prescription: nothing here
-- suggests a weight, and `weight_suggested` is deliberately absent — OVR-01b
-- owns the rules that read this table, and an anchor written before those rules
-- exist is a number the app learns rather than a number it acts on.
--
-- **Why the arithmetic is not here.** The requirement calls the anchor rules
-- "a set of pure functions with a test per row — the single most testable thing
-- in the project", and the milestone puts them in the `state` layer. So the
-- split is the one SES-01c already uses for the streak: SQL owns the join and
-- the exclusions, because they are facts about rows and a screen must not be
-- able to reproduce them differently; `src/state/anchors.ts` owns Epley,
-- the unit conversion and the smoothing, where every branch of §1 is a unit
-- test rather than a claim about SQL nobody can execute on a pull request.
--
-- Three of the five acceptance criteria are enforced in this file and nowhere
-- else, which is why they are joins and predicates rather than conventions:
--
--   * **Working sets only.** `is_warmup_set = false`. A warmup never moves an
--     anchor, so a warmup never leaves this function.
--   * **Active-recovery and deload sessions excluded.** A deliberately light
--     day is not evidence you got weaker. `is_deload` is added here (§1)
--     because this is the requirement that needs it; OVR-04 is what sets it.
--   * **Bodyweight excluded entirely.** Pull-ups and dips progress by reps, and
--     an e1RM computed from a null or an added load is a confident-looking
--     number about nothing.
--
-- The fourth — rep completion **computed, not parsed** — is the join itself.
-- `exercise_set_logs` carries no `reps_prescribed`: prescription rows are
-- immutable under append-and-supersede (DATA_MODEL §11), so a log reaches the
-- exact prescription it was performed against and the target is read from it.
-- Nothing anywhere parses a string for a rep count.
--
-- The fifth — idempotency — is §3: recomputation replaces the user's anchor set
-- in one statement, so re-running against unchanged history writes the same
-- rows and leaves nothing behind that the logs no longer support.
--
-- Idempotent on an empty project and on one this has already been pushed to:
-- every object is `if not exists` or `create or replace`.

-- ===========================================================================
-- 1. is_deload — the exclusion flag, on the session
-- ===========================================================================
--
-- DATA_MODEL §14 left `load_anchors` and derived athlete state to M3 on
-- purpose, and this column with it. It lands here rather than in OVR-04
-- because the exclusion is an acceptance criterion of *this* requirement: an
-- anchor computation that had no way to see a deload would quietly read a week
-- of deliberately light work as a loss of capacity. OVR-04 decides when a
-- session is tagged; this file only has to be able to skip one.

alter table if exists public.workout_sessions
  add column if not exists is_deload boolean not null default false;

comment on column public.workout_sessions.is_deload is
  'A deliberately lighter session (OVR-01 §4). Excluded from load-anchor '
  'evidence: underperforming on purpose is not new capacity data. OVR-04 sets '
  'it; nothing in M3 does.';

-- ===========================================================================
-- 2. load_anchors — one stored e1RM per exercise and equipment
-- ===========================================================================
--
-- Keyed by exercise **and** equipment, because they are different lifts: a
-- dumbbell press anchor is not a barbell press anchor wearing other shoes, and
-- a single row per exercise would average two capacities into one that
-- describes neither.
--
-- `unit` is stored on the row rather than read from the profile. DATA-01d
-- stamps `weight_unit` on every set log at write time precisely so a changed
-- default cannot reinterpret history, and an anchor that borrowed the profile's
-- unit would undo that at one remove — the number would silently become a
-- different weight the next time somebody switched to kg. The derivation
-- therefore expresses the anchor in the unit of the most recent working set it
-- was computed from, and says so here.
--
-- `confidence` and `session_count` are the row's own honesty (§5): a number
-- from one session and a number from five are not the same claim, and OVR-01b
-- may not present either without it. The ladder that turns a count into a tier
-- is in `src/state/anchors.ts` with the rest of the arithmetic.
--
-- No `id`. The natural key is the whole key, and a surrogate would let two rows
-- claim the same anchor.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'anchor_confidence') then
    create type public.anchor_confidence as enum ('low', 'medium', 'high');
  end if;
end
$$;

comment on type public.anchor_confidence is
  'How much history an anchor rests on (OVR-01 §5): one session is low, two is '
  'medium, three or more is high — reduced one level when the evidence needed '
  'the effective-rep clamp.';

create table if not exists public.load_anchors (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  exercise_id    text not null references public.exercise_definitions (id) on delete cascade,
  equipment_used text not null,

  -- The estimated 1RM, in `unit`. Never tested, always derived (§1).
  anchor_value numeric              not null,
  unit         public.weight_unit   not null,

  confidence   public.anchor_confidence not null,

  -- How many completed sessions contributed a candidate, and when the most
  -- recent one was. The staleness decay that reads this date is OVR-01b's;
  -- what this table owes it is the date itself.
  session_count     integer not null,
  last_session_date date    not null,

  updated_at timestamptz not null default now(),

  primary key (user_id, exercise_id, equipment_used),

  -- An anchor of zero is not a light anchor, it is the absence of one, and the
  -- derivation answers absence by writing no row at all.
  constraint load_anchors_value_positive check (anchor_value > 0),
  constraint load_anchors_session_count_positive check (session_count > 0),
  constraint load_anchors_equipment_not_blank check (btrim(equipment_used) <> ''),
  -- Restated as a constraint rather than trusted to the query: bodyweight
  -- movements are excluded from load anchors entirely, and a row that claimed
  -- one would be wrong in the direction that hurts.
  constraint load_anchors_equipment_not_bodyweight check (equipment_used <> 'bodyweight')
);

comment on table public.load_anchors is
  'The stored e1RM per exercise and equipment (OVR-01 §1). Cached rather than '
  'derived on every generation, and recomputed from set logs on session '
  'completion — never edited by hand.';

comment on column public.load_anchors.unit is
  'The unit the anchor is expressed in: the one its most recent contributing '
  'working set was logged in. Never the profile default, which would let a '
  'setting change rewrite a weight.';

comment on column public.load_anchors.session_count is
  'Completed sessions that contributed a candidate — the confidence a screen '
  'shows as "· 4 sessions", not the number of sets.';

alter table public.load_anchors enable row level security;

drop policy if exists load_anchors_select_own on public.load_anchors;
create policy load_anchors_select_own on public.load_anchors
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists load_anchors_insert_own on public.load_anchors;
create policy load_anchors_insert_own on public.load_anchors
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists load_anchors_update_own on public.load_anchors;
create policy load_anchors_update_own on public.load_anchors
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- DELETE has a policy because recomputation deletes: an anchor whose evidence
-- the logs no longer support has to be able to leave, or the table would
-- accumulate numbers nothing can justify.
drop policy if exists load_anchors_delete_own on public.load_anchors;
create policy load_anchors_delete_own on public.load_anchors
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.load_anchors from anon, authenticated;
grant select, insert, update, delete on public.load_anchors to authenticated;
grant all on public.load_anchors to service_role;

-- ===========================================================================
-- 3. anchor_evidence() — the sets that are allowed to move an anchor
-- ===========================================================================
--
-- One row per working set of a logged, completed, non-deload, non-active-
-- recovery session, on a reps-modality exercise that is not bodyweight, with
-- the prescribed target read from the prescription row the log is attached to.
--
-- What it deliberately does **not** filter: a set with no RPE, no weight or no
-- recorded reps. §1 skips those for the e1RM candidate, but rep completion is
-- a different question with a different denominator — a set performed without
-- an RPE still happened — and a function that dropped them here would make one
-- of the two answers impossible to compute. The skipping is in
-- `src/state/anchors.ts`, per measurement rather than per row.
--
-- `prescribed_reps` resolves the three target shapes (DATA_MODEL §6):
-- `fixed` is the value, `range` is its bottom — the reps that had to be
-- completed for the set to count as completed, not the top of the band, which
-- is where double progression goes next — and `sequence` is the rung for this
-- set number, since a ladder prescribes a different target per set. Null when
-- the rung does not exist, which is one more set than the ladder had.
--
-- STABLE and SECURITY INVOKER: owner-only RLS on every table it reads still
-- decides what a caller sees, and the explicit `p_user_id` narrows a result the
-- policies have already narrowed rather than being the thing that protects it.

create or replace function public.anchor_evidence(p_user_id uuid)
returns table (
  session_id      uuid,
  session_date    date,
  logged_at       timestamptz,
  exercise_id     text,
  equipment_used  text,
  set_number      integer,
  actual_reps     integer,
  prescribed_reps integer,
  weight          numeric,
  weight_unit     public.weight_unit,
  rpe             numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    s.id,
    s.date,
    l.created_at,
    we.exercise_id,
    we.equipment_used,
    l.set_number,
    l.actual_reps,
    case we.target_kind
      when 'fixed'    then we.target_value
      when 'range'    then we.target_min
      when 'sequence' then we.target_sequence[l.set_number]
    end,
    l.weight,
    l.weight_unit,
    l.rpe
  from public.exercise_set_logs l
  join public.workout_exercises we on we.id = l.workout_exercise_id
  join public.workout_blocks    wb on wb.id = we.block_id
  join public.workout_sections  sec on sec.id = wb.section_id
  join public.workout_sessions  s on s.id = sec.session_id
  where s.user_id = p_user_id
    -- Completed sessions only. An abandoned workout's logs are real work, but
    -- an anchor is a claim about capacity and a session nobody finished is not
    -- a session the app knows the shape of.
    and s.completed_at is not null
    and s.abandoned_at is null
    and s.is_deload = false
    and s.goal_preset is distinct from 'active_recovery'
    and l.is_warmup_set = false
    -- Reps only: Epley needs a rep count, and a timed carry or a distance has
    -- none. Bodyweight twice, because the two say different things — the
    -- prescription's load guidance, and the equipment the set was performed
    -- with.
    and we.modality = 'reps'
    and we.load_type is distinct from 'bodyweight'
    and we.equipment_used <> 'bodyweight'
  order by s.date, s.id, we.exercise_id, we.equipment_used, l.set_number
$$;

comment on function public.anchor_evidence(uuid) is
  'Working sets that may move a load anchor (OVR-01 §1): warmups, deloads, '
  'active recovery, bodyweight and non-reps prescriptions are already gone, '
  'and each row carries the target from the prescription it was logged '
  'against — rep completion is computed, never parsed.';

-- ===========================================================================
-- 4. set_load_anchors() — recomputation as one replacement
-- ===========================================================================
--
-- Takes the anchors `src/state/anchors.ts` derived and makes the table equal to
-- them. **Replacement, not accumulation:** an anchor the evidence no longer
-- supports — its only session turned out to be a deload, its logs were deleted
-- with an abandoned session — is removed in the same statement that writes the
-- rest. That is what makes recomputation idempotent in the sense the
-- requirement means: the table is a function of the set logs, so running it
-- twice against unchanged history leaves exactly the same rows, and running it
-- against changed history leaves no trace of what changed.
--
-- One statement, so it is one transaction: there is no instant at which the
-- user has some of their anchors.
--
-- VOLATILE and SECURITY INVOKER — it writes, and the policies above are what
-- decide whose rows. `p_user_id` is explicit for the same reason it is on
-- `constraints_in_force`: the service role has no `auth.uid()` to read.

create or replace function public.set_load_anchors(
  p_user_id uuid,
  p_anchors jsonb
) returns setof public.load_anchors
language sql
volatile
security invoker
set search_path = ''
as $$
  with incoming as (
    select
      a.exercise_id,
      a.equipment_used,
      a.anchor_value,
      a.unit,
      a.confidence,
      a.session_count,
      a.last_session_date
    from jsonb_to_recordset(coalesce(p_anchors, '[]'::jsonb)) as a(
      exercise_id       text,
      equipment_used    text,
      anchor_value      numeric,
      unit              public.weight_unit,
      confidence        public.anchor_confidence,
      session_count     integer,
      last_session_date date
    )
  ),
  removed as (
    delete from public.load_anchors la
    where la.user_id = p_user_id
      and not exists (
        select 1
        from incoming i
        where i.exercise_id = la.exercise_id
          and i.equipment_used = la.equipment_used
      )
    returning la.*
  )
  insert into public.load_anchors as la (
    user_id, exercise_id, equipment_used,
    anchor_value, unit, confidence,
    session_count, last_session_date, updated_at
  )
  select
    p_user_id, i.exercise_id, i.equipment_used,
    i.anchor_value, i.unit, i.confidence,
    i.session_count, i.last_session_date, now()
  from incoming i
  on conflict (user_id, exercise_id, equipment_used) do update
    set anchor_value      = excluded.anchor_value,
        unit              = excluded.unit,
        confidence        = excluded.confidence,
        session_count     = excluded.session_count,
        last_session_date = excluded.last_session_date,
        updated_at        = now()
  returning la.*
$$;

comment on function public.set_load_anchors(uuid, jsonb) is
  'Replaces a user''s load anchors with the recomputed set in one statement, '
  'so the table stays a function of the set logs (OVR-01a). Anchors the '
  'evidence no longer supports are deleted rather than left behind.';

-- ===========================================================================
-- 5. Execute privileges
-- ===========================================================================
--
-- Same posture as SES-01b §4. Both are SECURITY INVOKER, so an anonymous
-- caller would read and write nothing anyway — but "cannot be called" is a
-- stronger statement than "returns nothing", and the first of these reads a
-- person's whole training history.

revoke all on function public.anchor_evidence(uuid) from public, anon;
revoke all on function public.set_load_anchors(uuid, jsonb) from public, anon;

grant execute on function public.anchor_evidence(uuid) to authenticated, service_role;
grant execute on function public.set_load_anchors(uuid, jsonb)
  to authenticated, service_role;
