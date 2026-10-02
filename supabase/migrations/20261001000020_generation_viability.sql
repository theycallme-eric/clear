-- ===========================================================================
-- REQ-010 — save-time viability evaluation
-- ===========================================================================
--
-- Candidate retrieval (20260921000005, 20260927000018) answers "what may this
-- request compose from" after Generate is pressed, from what is already saved.
-- This answers the earlier question: given a *proposed* Goal, enabled sections,
-- exclusions and location equipment — none of it saved yet — is retrieval
-- already known to be unable to generate?
--
-- One function, additive, and safe to roll back by dropping it. It reads the
-- catalog and `focus_pattern_map` and nothing else: no profile, no location, no
-- constraint row, because every one of those is the proposal and arrives as an
-- argument. It calls no model and cannot.
--
-- The eligibility predicates are `generation_candidates`' own, in its order,
-- with the proposal standing where the saved rows stood:
--
--   * `constraints_in_force(...)` where action = 'exclude'  → the three
--     `p_excluded_*` arrays, one per constraint scope;
--   * `usable_equipment(...)`                               → the same
--     narrowing, against `p_excluded_equipment`;
--   * `generation_equipment(...)`                           → `p_available_equipment`;
--   * `generation_sections_for_goal(...)`                   → `p_enabled_sections`,
--     with active recovery's override.
--
-- They are restated rather than called because the retrieval functions resolve
-- those inputs from saved rows by user id, and a proposal has none.
-- `src/test/generation-reliability/viability-evaluation.test.ts` holds each
-- restated clause to the retrieval function's text.
--
-- What is evaluated. The goal is chosen per request on Generate, so a saved
-- configuration is viable only if *every* goal and *every* focus resolves:
-- each goal's sections (the proposed toggles, or active recovery's fixed
-- three) × each `session_focus`, with the floor applied per section exactly as
-- `generation_candidate_sets_for_goal` applies it. A section fails where the
-- list retrieval would serve — strict, or relaxed under the floor — is empty.
--
-- What is returned. No rows means viable. Otherwise one row per failing
-- section and failure class:
--
--   * `catalog_gap`        — the catalog has nothing for the section at all.
--                            The incompatible choice is the section.
--   * `missing_equipment`  — it has, but nothing this equipment can perform.
--                            The incompatible choice is the equipment set.
--   * `athlete_exclusion`  — it has, and the proposed exclusions remove every
--                            one. The incompatible choice is the exclusions
--                            that removed something.
--   * `no_sections`        — the goal resolves to no sections whatsoever, which
--                            retrieval reports as nothing to retrieve. `section`
--                            is NULL; the incompatible choice is the toggles.
--
-- `goals` and `focuses` say which requests the row fails for, and
-- `blocks_proposed_goal` whether `p_goal` is among them — a location that
-- cannot serve Recovery is a different message from one that cannot serve the
-- goal being saved.

create or replace function public.generation_viability(
  p_goal                public.goal_preset,
  p_enabled_sections    public.section_type[],
  p_available_equipment text[],
  p_excluded_exercises  text[] default '{}',
  p_excluded_patterns   public.movement_pattern[] default '{}',
  p_excluded_equipment  text[] default '{}',
  p_floor               integer default 8
)
returns table (
  section              public.section_type,
  failure_class        text,
  incompatible_choice  jsonb,
  goals                public.goal_preset[],
  focuses              public.session_focus[],
  blocks_proposed_goal boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with proposal as (
    -- A NULL array is an empty one: nothing enabled, nothing owned, nothing
    -- excluded. Equipment is sorted and de-duplicated as `generation_equipment`
    -- returns it; the sorts that reach the caller are byte-order, so the answer
    -- does not depend on the database's collation.
    select
      coalesce(p_enabled_sections, '{}')   as sections,
      array(
        select a.equipment_id
        from unnest(p_available_equipment) as a (equipment_id)
        group by a.equipment_id
        order by a.equipment_id collate "C"
      )                                    as equipment,
      coalesce(p_excluded_exercises, '{}') as excluded_exercises,
      coalesce(p_excluded_patterns, '{}')  as excluded_patterns,
      coalesce(p_excluded_equipment, '{}') as excluded_equipment
  ),
  goal_sections as (
    -- Every goal Generate offers, and the sections each resolves to.
    select
      g.goal,
      case
        when g.goal = 'active_recovery'
          then array['warmup', 'mobility', 'cooldown']::public.section_type[]
        else p.sections
      end as sections
    from proposal p
    cross join unnest(enum_range(null::public.goal_preset)) as g (goal)
  ),
  focus_values as (
    select f.focus
    from unnest(enum_range(null::public.session_focus)) as f (focus)
  ),
  requested as (
    select distinct s.section, fv.focus
    from goal_sections gs
    cross join lateral unnest(gs.sections) as s (section)
    cross join focus_values fv
  ),
  judged as (
    -- One row per requested section × focus × catalog exercise tagged for the
    -- section, carrying which of retrieval's predicates it passes. A section
    -- with no catalog row keeps its one all-NULL row.
    select
      r.section,
      r.focus,
      ec.id,
      ec.movement_patterns,
      ec.equipment_options,
      -- Thematic eligibility, as retrieval states it.
      (
        ec.movement_patterns && array(
          select f.movement_pattern
          from public.focus_pattern_map f
          where f.session_focus = r.focus
        )
        or ec.exercise_role = any (array[
             'conditioning', 'mobility', 'activation', 'cardio', 'stability'
           ]::public.exercise_role[])
      ) as thematic,
      -- Equipment: the location has at least one of its options.
      ec.equipment_options && p.equipment as equipped,
      -- … at least one of those survives the equipment exclusions, and no
      -- exercise or pattern exclusion names it.
      (
        cardinality(ue.equipment) > 0
        and ec.id <> all (p.excluded_exercises)
        and not (ec.movement_patterns && p.excluded_patterns)
      ) as permitted
    from requested r
    cross join proposal p
    left join public.exercise_catalog ec
      -- Section eligibility: catalog content, not a heuristic on the role.
      on ec.sections @> array[r.section]
    cross join lateral (
      -- `usable_equipment`, against the proposed exclusions.
      select coalesce(array_agg(o.equipment_id order by o.equipment_id), '{}') as equipment
      from unnest(ec.equipment_options) as o (equipment_id)
      where o.equipment_id = any (p.equipment)
        and o.equipment_id <> all (p.excluded_equipment)
    ) ue
  ),
  counted as (
    select
      j.section,
      j.focus,
      count(j.id) filter (where j.thematic and j.equipped and j.permitted)::integer as strict_found,
      count(j.id) filter (where j.equipped and j.permitted)::integer                as relaxed_found,
      count(j.id) filter (where j.thematic and j.equipped)::integer                 as strict_equipped,
      count(j.id) filter (where j.equipped)::integer                                as relaxed_equipped,
      count(j.id) filter (where j.thematic)::integer                                as strict_tagged,
      count(j.id)::integer                                                          as relaxed_tagged
    from judged j
    group by j.section, j.focus
  ),
  served as (
    -- The floor, as `generation_candidate_sets_for_goal` applies it: under it
    -- the section is retrieved with the pattern predicate relaxed.
    select
      c.*,
      coalesce(c.strict_found < p_floor, false) as relaxed
    from counted c
  ),
  failing as (
    select
      s.section,
      s.focus,
      s.relaxed,
      case
        when (case when s.relaxed then s.relaxed_tagged else s.strict_tagged end) = 0
          then 'catalog_gap'
        when (case when s.relaxed then s.relaxed_equipped else s.strict_equipped end) = 0
          then 'missing_equipment'
        else 'athlete_exclusion'
      end as failure_class
    from served s
    where (case when s.relaxed then s.relaxed_found else s.strict_found end) = 0
  ),
  blocking as (
    -- For a section the exclusions emptied: each exclusion that removed, or
    -- narrowed, an exercise the equipment could otherwise have performed.
    select distinct f.section, f.failure_class, x.scope, x.target
    from failing f
    cross join proposal p
    join judged j
      on j.section = f.section
     and j.focus = f.focus
     and j.equipped
     and (f.relaxed or j.thematic)
    cross join lateral (
      select 'exercise' as scope, j.id as target
      where j.id = any (p.excluded_exercises)
      union all
      select 'movement_pattern', mp.pattern::text
      from unnest(j.movement_patterns) as mp (pattern)
      where mp.pattern = any (p.excluded_patterns)
      union all
      select 'equipment', o.equipment_id
      from unnest(j.equipment_options) as o (equipment_id)
      where o.equipment_id = any (p.equipment)
        and o.equipment_id = any (p.excluded_equipment)
    ) x
    where f.failure_class = 'athlete_exclusion'
  ),
  section_failures as (
    select
      f.section,
      f.failure_class,
      array_agg(f.focus order by f.focus) as focuses
    from failing f
    group by f.section, f.failure_class
  ),
  reported as (
    select
      sf.section,
      sf.failure_class,
      case sf.failure_class
        when 'catalog_gap'
          then jsonb_build_object('kind', 'section', 'section', sf.section)
        when 'missing_equipment'
          then jsonb_build_object('kind', 'equipment', 'equipment', to_jsonb(p.equipment))
        else jsonb_build_object(
          'kind', 'exclusion',
          'exclusions', coalesce(
            (
              select jsonb_agg(
                       jsonb_build_object('scope', b.scope, 'target', b.target)
                       order by b.scope, b.target collate "C"
                     )
              from blocking b
              where b.section = sf.section
            ),
            '[]'::jsonb
          )
        )
      end as incompatible_choice,
      array(
        select gs.goal
        from goal_sections gs
        where gs.sections @> array[sf.section]
        order by gs.goal
      ) as goals,
      sf.focuses
    from section_failures sf
    cross join proposal p

    union all

    -- A goal that resolves to no sections has nothing to retrieve, which
    -- retrieval's caller reports as a failure and never as an empty workout.
    select
      null::public.section_type,
      'no_sections',
      jsonb_build_object('kind', 'sections', 'sections', to_jsonb(p.sections)),
      array(
        select gs.goal
        from goal_sections gs
        where cardinality(gs.sections) = 0
        order by gs.goal
      ),
      array(select fv.focus from focus_values fv order by fv.focus)
    from proposal p
    where exists (
      select 1 from goal_sections gs where cardinality(gs.sections) = 0
    )
  )
  select
    rp.section,
    rp.failure_class,
    rp.incompatible_choice,
    rp.goals,
    rp.focuses,
    coalesce(p_goal = any (rp.goals), false)
  from reported rp
  -- Deterministic: the same proposal reports the same rows in the same order.
  order by rp.section nulls first, rp.failure_class
$$;

comment on function public.generation_viability(
  public.goal_preset, public.section_type[], text[], text[],
  public.movement_pattern[], text[], integer) is
  'REQ-010: whether candidate retrieval is already known to be unable to '
  'generate for a proposed configuration. No rows is viable; otherwise each '
  'failing section, its class, and the incompatible choice. No model call.';

-- ===========================================================================
-- Execute privileges
-- ===========================================================================
--
-- The candidate functions' two statements, for the same reason: Postgres grants
-- EXECUTE to PUBLIC by default, and "cannot be called" is the stronger
-- statement than "would see nothing".

revoke all on function public.generation_viability(
  public.goal_preset, public.section_type[], text[], text[],
  public.movement_pattern[], text[], integer) from public, anon;

grant execute on function public.generation_viability(
  public.goal_preset, public.section_type[], text[], text[],
  public.movement_pattern[], text[], integer) to authenticated, service_role;
