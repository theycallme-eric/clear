-- ===========================================================================
-- GEN-02a — candidate resolution and retrieval
-- ===========================================================================
--
-- Spec: docs/specs/generation/GENERATION_CONTRACT.md §2–3.
--
-- Eligibility resolves here, in SQL, before a prompt exists. Every rule the
-- previous system prompt asked Claude to remember — "Upper Body → Press OR
-- Pull", "only use exercise_id values from this list", equipment availability,
-- the user's exclusions, which sections are enabled — is a predicate in this
-- file instead. A model cannot select an ineligible exercise because it never
-- sees one.
--
-- Nothing here calls a model, and nothing here can: these are `language sql`
-- functions over tables this project already owns. That is the point of the
-- split (GEN-02a from GEN-02b) — retrieval is deterministic, testable against
-- the seeded library, and cheap enough to run inside the request.
--
-- Four functions, smallest first:
--
--   * `generation_sections`  — which sections this user's request resolves to.
--   * `generation_equipment` — what the resolved location actually has.
--   * `generation_candidates`     — §3's query, for one section.
--   * `generation_candidate_sets` — the whole request: sections resolved,
--     equipment resolved, one candidate list per section, floor applied.
--
-- All four are SECURITY INVOKER and pin an empty search_path, matching
-- DATA-05's two. Owner-only RLS on `profiles`, `locations`,
-- `location_equipment` and `user_constraints` still decides what a caller sees;
-- the explicit `p_user_id` exists for the service-role caller generation runs
-- as, where RLS is bypassed and "the caller" is not a person.
--
-- What this migration deliberately does not own:
--   * the prompt, the model call, and the retry (GEN-02b);
--   * validation, hydration and persistence (GEN-02c);
--   * ranking. `avoid` and `prefer_not` never filter — they reach Claude as a
--     deprioritize list, exactly as DATA-05 says.

-- ===========================================================================
-- 1. Resolved sections
-- ===========================================================================
--
-- The profile carries `enabled_sections`, and for four of the five goals that
-- is the answer. `active_recovery` is the exception the requirement states:
-- it resolves to warmup, mobility and cooldown *only*, and it overrides the
-- toggles rather than intersecting with them — a recovery session with a
-- primary lift in it is not a recovery session, and a user whose toggles omit
-- mobility should still get one here.
--
-- A user with no profile row resolves to NULL, which `unnest` turns into zero
-- sections in §4. The caller reads that as "nothing to retrieve", which is the
-- typed `generation.no_candidates` failure and never an empty workout.

create or replace function public.generation_sections(p_user_id uuid)
returns public.section_type[]
language sql
stable
security invoker
set search_path = ''
as $$
  select case
           when p.goal_preset = 'active_recovery'
             then array['warmup', 'mobility', 'cooldown']::public.section_type[]
           else p.enabled_sections
         end
  from public.profiles p
  where p.id = p_user_id
$$;

comment on function public.generation_sections(uuid) is
  'The sections a request resolves to: the profile''s enabled_sections, except '
  'active_recovery, which is warmup/mobility/cooldown and overrides them.';

-- ===========================================================================
-- 2. Resolved equipment
-- ===========================================================================
--
-- `location_equipment` is the authoritative list (DATA-01b §5); `locations.tier`
-- is a label and is not consulted. Omitting a location means the user's default
-- one, which is the only location a request without a picker can mean.
--
-- A location with no equipment rows resolves to the empty array, and an empty
-- array makes every exercise ineligible — correctly so. That is over-constrained
-- input, not an empty library, and §4's caller reports it as such.

create or replace function public.generation_equipment(
  p_user_id     uuid,
  p_location_id uuid default null
)
returns text[]
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(array_agg(distinct le.equipment_id order by le.equipment_id), '{}')
  from public.locations l
  join public.location_equipment le on le.location_id = l.id
  where l.user_id = p_user_id
    and l.id = coalesce(
      p_location_id,
      (select d.id
         from public.locations d
        where d.user_id = p_user_id and d.is_default)
    )
$$;

comment on function public.generation_equipment(uuid, uuid) is
  'What the resolved location has, sorted and de-duplicated. NULL location '
  'means the user''s default. Never reads locations.tier.';

-- ===========================================================================
-- 3. Candidate retrieval, one section
-- ===========================================================================
--
-- GENERATION_CONTRACT §3, as written there, with two differences and both are
-- deliberate:
--
--   * the exclusion sets come from `constraints_in_force`, so a session-scoped
--     exclusion applies to its own session and to no other one. DATA-05 wrote
--     that filter once; this composes it rather than repeating it.
--   * `usable_equipment` is DATA-05's function too, computed once per candidate
--     in a LATERAL and used twice — as the returned column and as the
--     eligibility test. A candidate therefore arrives carrying the equipment it
--     may actually be performed with, and an exercise whose every option is
--     excluded never appears at all.
--
-- `p_relax_patterns` is §3's fallback, made explicit rather than implicit: the
-- caller decides, per section, whether the pattern predicate is dropped, and
-- §4 records that it did. The old app's equivalent widened silently at 20
-- exercises; a thin library now shows up in diagnostics instead.
--
-- Every reference to a catalog column is alias-qualified. The RETURNS TABLE
-- columns share names with `exercise_catalog`'s, and an unqualified reference
-- to one of them would be ambiguous.

create or replace function public.generation_candidates(
  p_user_id            uuid,
  p_focus              public.session_focus,
  p_section            public.section_type,
  p_available_equipment text[],
  p_session_id         uuid default null,
  p_relax_patterns     boolean default false
)
returns table (
  exercise_id         text,
  name                text,
  movement_patterns   public.movement_pattern[],
  primary_patterns    public.movement_pattern[],
  exercise_role       public.exercise_role,
  component_movements text[],
  muscles             jsonb,
  can_be_primary      boolean,
  usable_equipment    text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  with focus_patterns as (
    select f.movement_pattern
    from public.focus_pattern_map f
    where f.session_focus = p_focus
  ),
  excluded as (
    select c.scope, c.target_exercise_id, c.target_pattern
    from public.constraints_in_force(p_user_id, p_session_id) c
    where c.action = 'exclude'
  )
  select
    ec.id,
    ec.name,
    ec.movement_patterns,
    ec.primary_patterns,
    ec.exercise_role,
    ec.component_movements,
    ec.muscles,
    ec.can_be_primary,
    ue.equipment
  from public.exercise_catalog ec
  cross join lateral (
    select public.usable_equipment(
             p_user_id, ec.equipment_options, p_available_equipment, p_session_id
           ) as equipment
  ) ue
  where
    -- Thematic eligibility: the focus admits one of the exercise's patterns, or
    -- the role is focus-exempt — a cooldown stretch belongs in a press day as
    -- much as in a squat day. Relaxation drops this predicate and only this one.
    (
      p_relax_patterns
      or ec.movement_patterns && array(select fp.movement_pattern from focus_patterns fp)
      or ec.exercise_role = any (array[
           'conditioning', 'mobility', 'activation', 'cardio', 'stability'
         ]::public.exercise_role[])
    )
    -- Section eligibility: catalog content, not a heuristic on the role.
    and ec.sections @> array[p_section]
    -- Equipment: the location has at least one of its options …
    and ec.equipment_options && p_available_equipment
    -- … and at least one of those survives the user's equipment exclusions.
    and cardinality(ue.equipment) > 0
    -- User constraints. Only `exclude` filters.
    and ec.id <> all (array(
      select e.target_exercise_id from excluded e where e.scope = 'exercise'
    ))
    and not (ec.movement_patterns && array(
      select e.target_pattern from excluded e where e.scope = 'movement_pattern'
    ))
  -- Deterministic: the same request retrieves the same list in the same order,
  -- which is what makes a generation reproducible enough to debug.
  order by ec.can_be_primary desc, ec.id
$$;

comment on function public.generation_candidates(
  uuid, public.session_focus, public.section_type, text[], uuid, boolean) is
  'GENERATION_CONTRACT §3: the eligible exercises for one section, each with '
  'the equipment it may actually be performed with. No model call.';

-- ===========================================================================
-- 4. Candidate retrieval, one request
-- ===========================================================================
--
-- One call per generation rather than one per section: the sections and the
-- equipment are resolved here, every section is retrieved against the same
-- resolved inputs, and the floor is applied per section.
--
-- The floor is §3's, with its number left to the caller because §12 records 8
-- as a guess to be tuned against the real library. A section under the floor is
-- retrieved a second time with the pattern predicate relaxed, and `relaxed` is
-- returned beside the list — the relaxation is a fact about the request, and a
-- fact the caller records rather than one the query hides.
--
-- What this function does not do is fail. A section that resolves to nothing is
-- returned as an empty list, and naming that as `generation.no_candidates` is
-- the caller's (src/data/candidates.ts) — an exception here would cross the
-- PostgREST boundary as a 400 with a Postgres message in it, which CORE-01's
-- envelope has no way to turn back into a typed code.

create or replace function public.generation_candidate_sets(
  p_user_id     uuid,
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
    select public.generation_sections(p_user_id)                    as sections,
           public.generation_equipment(p_user_id, p_location_id)    as equipment
  )
  select
    s.section,
    strict_set.found < p_floor,
    case when strict_set.found < p_floor
         then relaxed_set.candidates
         else strict_set.candidates
    end
  from resolved r
  -- A profile that resolves to no sections unnests to no rows, so the caller
  -- receives an empty result rather than a workout with nothing in it.
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
    -- Only evaluated for a section under the floor; every other section skips
    -- the second retrieval entirely.
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

comment on function public.generation_candidate_sets(
  uuid, public.session_focus, uuid, uuid, integer) is
  'One candidate list per resolved section, with the section''s own relaxation '
  'recorded. The whole of GEN-02a in one round trip, and no model call.';

-- ===========================================================================
-- 5. Execute privileges
-- ===========================================================================
--
-- Postgres grants EXECUTE to PUBLIC by default, which would let an anonymous
-- request call these. SECURITY INVOKER means it would see nothing — every table
-- underneath is either owner-only or `to authenticated` — but "returns empty
-- because RLS refused it" is a weaker statement than "cannot be called", and
-- these four are the generation surface. They are stated explicitly, in the
-- catalog's two-mechanism spirit (DATA-01a §8).

revoke all on function public.generation_sections(uuid) from public, anon;
revoke all on function public.generation_equipment(uuid, uuid) from public, anon;
revoke all on function public.generation_candidates(
  uuid, public.session_focus, public.section_type, text[], uuid, boolean)
  from public, anon;
revoke all on function public.generation_candidate_sets(
  uuid, public.session_focus, uuid, uuid, integer) from public, anon;

grant execute on function public.generation_sections(uuid)
  to authenticated, service_role;
grant execute on function public.generation_equipment(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.generation_candidates(
  uuid, public.session_focus, public.section_type, text[], uuid, boolean)
  to authenticated, service_role;
grant execute on function public.generation_candidate_sets(
  uuid, public.session_focus, uuid, uuid, integer)
  to authenticated, service_role;
