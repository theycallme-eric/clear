-- TASK-072 integration repair — generation uses today's chosen goal.
--
-- The original candidate RPC resolved active-recovery sections from
-- profiles.goal_preset. The rebuilt Generate screen deliberately asks what
-- *today* is for, so a stored default is not the request's answer. Keep the
-- original RPC for existing callers and add one explicit goal-scoped surface
-- for generate-workout. This is additive and safe to roll back by dropping the
-- two functions below.

create or replace function public.generation_sections_for_goal(
  p_user_id uuid,
  p_goal public.goal_preset
)
returns public.section_type[]
language sql
stable
security invoker
set search_path = ''
as $$
  select case
           when p_goal = 'active_recovery'
             then array['warmup', 'mobility', 'cooldown']::public.section_type[]
           else p.enabled_sections
         end
  from public.profiles p
  where p.id = p_user_id
$$;

comment on function public.generation_sections_for_goal(uuid, public.goal_preset) is
  'The sections for the goal chosen for this request: active recovery overrides '
  'the profile toggles; every other goal uses the enabled profile sections.';

create or replace function public.generation_candidate_sets_for_goal(
  p_user_id     uuid,
  p_goal        public.goal_preset,
  p_focus       public.session_focus,
  p_location_id uuid default null,
  p_session_id  uuid default null,
  p_floor       integer default 8
)
returns table (
  section    public.section_type,
  relaxed    boolean,
  candidates jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with resolved as (
    select public.generation_sections_for_goal(p_user_id, p_goal) as sections,
           public.generation_equipment(p_user_id, p_location_id) as equipment
  )
  select
    s.section,
    strict_set.found < p_floor,
    case when strict_set.found < p_floor
         then relaxed_set.candidates
         else strict_set.candidates
    end
  from resolved r
  cross join lateral unnest(r.sections) with ordinality as s (section, ordinal)
  cross join lateral (
    select
      count(*)::integer as found,
      coalesce(
        jsonb_agg(to_jsonb(c) order by c.can_be_primary desc, c.exercise_id),
        '[]'::jsonb
      ) as candidates
    from public.generation_candidates(
           p_user_id, p_focus, s.section, r.equipment, p_session_id, false) c
  ) strict_set
  cross join lateral (
    select coalesce(
             jsonb_agg(to_jsonb(c) order by c.can_be_primary desc, c.exercise_id),
             '[]'::jsonb
           ) as candidates
    from public.generation_candidates(
           p_user_id, p_focus, s.section, r.equipment, p_session_id, true) c
    where strict_set.found < p_floor
  ) relaxed_set
  order by s.ordinal
$$;

comment on function public.generation_candidate_sets_for_goal(
  uuid, public.goal_preset, public.session_focus, uuid, uuid, integer) is
  'One eligible candidate list per section for the goal selected in this '
  'generation request, with the existing per-section floor relaxation.';

revoke all on function public.generation_sections_for_goal(
  uuid, public.goal_preset) from public, anon;
revoke all on function public.generation_candidate_sets_for_goal(
  uuid, public.goal_preset, public.session_focus, uuid, uuid, integer)
  from public, anon;

grant execute on function public.generation_sections_for_goal(
  uuid, public.goal_preset) to authenticated, service_role;
grant execute on function public.generation_candidate_sets_for_goal(
  uuid, public.goal_preset, public.session_focus, uuid, uuid, integer)
  to authenticated, service_role;
