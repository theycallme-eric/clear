-- ===========================================================================
-- EXE-06 — a swapped slot does not move a load anchor
-- ===========================================================================
--
-- Spec: docs/requirements/REQUIREMENTS.md EXE-06 · docs/specs/OVR-01_progressive-overload.md §1
--
-- "A swapped slot is excluded from load-anchor updates for the superseded
-- exercise — you did not get weaker at deadlift, you stopped doing it."
--
-- The failure this prevents is specific. `anchor_evidence` carries each set
-- beside the target the prescription it was logged against asked for, and
-- `src/state/anchors.ts` reads rep completion off that pair. A slot that was
-- swapped mid-workout is, by construction, a prescription that was left
-- unfinished: three sets of a prescribed five, because the rack went. Counted
-- as evidence, that reads as a failure to complete the work — the anchor
-- decays, and the reason it decays is that the user changed exercise.
--
-- So the predicate is `revision_status = 'active'`: an anchor learns from the
-- prescription that still stands, and from no other. Two things this does not
-- do, both deliberate:
--
--   * It does not delete, hide or detach anything. The superseded row keeps
--     its `execution_status` and its set logs, and every reconstruction still
--     answers "3×8 Deadlift, then switched to RDL" (DATA_MODEL §7, §8). What
--     narrows is one derived cache's input, not the history.
--   * It does not change the function's signature or its returned columns, so
--     `src/data/database.types.ts` is unaffected and no caller changes. The
--     rule belongs in SQL for the reason every other eligibility rule does:
--     a screen must not be able to reproduce it differently.
--
-- A swap made on the Review screen (REV-02) is unaffected in practice — a
-- session that has not started has no logs to exclude — which is why this
-- reads as an EXE-06 rule even though it is stated once, for both.
--
-- Everything else about the function is unchanged and is restated verbatim
-- from `20260921000010_load_anchors.sql`, because `create or replace` replaces
-- the whole body and a diff is not a patch.

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
    -- EXE-06. The prescription that still stands, and no other: a slot the
    -- user swapped out of prescribed work they deliberately stopped doing,
    -- and reading that as a failure to complete it would move the anchor for
    -- an exercise they simply left.
    and we.revision_status = 'active'
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
  'active recovery, bodyweight, non-reps prescriptions and slots that were '
  'swapped out (EXE-06) are already gone, and each row carries the target '
  'from the prescription it was logged against — rep completion is computed, '
  'never parsed.';

revoke all on function public.anchor_evidence(uuid) from public, anon;
grant execute on function public.anchor_evidence(uuid) to authenticated, service_role;
