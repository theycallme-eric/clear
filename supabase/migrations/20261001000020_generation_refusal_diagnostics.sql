-- GR-04 / REQ-009 — why a section resolved to nothing.
--
-- `generation_candidate_sets` and `generation_candidate_sets_for_goal` return
-- an empty list for a section nothing is eligible for, and the caller names
-- that `generation.no_candidates`. What neither says is *why*, and the three
-- reasons ask for three different people: a catalog with no rows for a section
-- is the project's defect, a location without the equipment is the athlete's
-- to change, and an exclusion that removed the last candidate is theirs too
-- but is a different sentence.
--
-- This function answers with two counts per section and no judgement. The
-- class is the caller's (`classifySection` in src/data/candidates.ts), so the
-- closed set of classes lives in one place and this stays a query anybody can
-- run by hand:
--
--   * `catalog_exercises` — catalog rows tagged with the section that name at
--     least one piece of equipment. Zero means the section is empty for every
--     equipment set there is: no location and no exclusion could change it.
--   * `equipped_exercises` — of those, the rows the resolved location can
--     perform. The user's exclusions are deliberately not applied: a section
--     that retrieval returned empty while this is non-zero was emptied by an
--     exclusion, because exclusions are the only predicates left in
--     `generation_candidates` once the pattern predicate has been relaxed.
--
-- It is called only after a refusal, with the sections that came back empty,
-- so a request that resolves pays nothing for it. It reads no constraint and
-- returns no exercise: two integers per section, safe to log.
--
-- Additive, and rolled back by dropping the one function below.

create or replace function public.generation_refusal_diagnostics(
  p_user_id     uuid,
  p_sections    public.section_type[],
  p_location_id uuid default null
)
returns table (
  section            public.section_type,
  catalog_exercises  integer,
  equipped_exercises integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with resolved as (
    select public.generation_equipment(p_user_id, p_location_id) as equipment
  )
  select
    s.section,
    count(ec.id)::integer,
    (count(ec.id) filter (where ec.equipment_options && r.equipment))::integer
  from resolved r
  cross join lateral unnest(p_sections) with ordinality as s (section, ordinal)
  left join public.exercise_catalog ec
    on ec.sections @> array[s.section]
   and cardinality(ec.equipment_options) > 0
  group by s.section, s.ordinal
  order by s.ordinal
$$;

comment on function public.generation_refusal_diagnostics(
  uuid, public.section_type[], uuid) is
  'For sections that resolved to no candidates: how many catalog exercises '
  'carry the section at all, and how many of those the resolved location can '
  'perform before exclusions. Counts only; the failure class is the caller''s.';

revoke all on function public.generation_refusal_diagnostics(
  uuid, public.section_type[], uuid) from public, anon;

grant execute on function public.generation_refusal_diagnostics(
  uuid, public.section_type[], uuid) to authenticated, service_role;
