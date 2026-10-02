-- ===========================================================================
-- REQ-011 — onboarding cannot save an impossible configuration
-- ===========================================================================
--
-- `complete_onboarding` (20260921000008) commits every first-run answer in one
-- transaction. It committed them whether or not the result could generate: a
-- tier with a section its equipment cannot perform was a finished profile whose
-- first Generate was refused.
--
-- This replaces the function, same signature, with one step added ahead of
-- every write: the answers are put to `generation_viability` (20261001000021)
-- as a proposal, and a proposal it fails is refused.
--
--   * **Server-side.** The check is inside the commit, so a crafted request
--     that skips the screen meets it exactly as the screen does. There is no
--     argument that turns it off.
--   * **Atomic.** The refusal is raised before the first write, and a function
--     body is one statement to the caller, so nothing — profile completion,
--     location, equipment, constraint — exists afterwards either way.
--   * **Named.** The exception's DETAIL is `generation_viability`'s rows as
--     JSON, each carrying the failing section, its class and the incompatible
--     choice. `src/data/user-data.ts` reads them back through
--     `src/data/viability.ts`; the sentence the athlete sees is built from
--     them in `src/state/onboarding.ts`.
--
-- The proposal is what the function is about to write, not what it was handed:
-- the equipment is trimmed and blank-filtered as the insert below trims and
-- filters it, and the avoided patterns are the `exclude` rows it will create.
-- Onboarding writes no exercise- or equipment-scoped exclusion, so those two
-- arguments are empty. The floor is `generation_viability`'s own default.
--
-- SQLSTATE `CLR11` is this refusal's and nothing else's: class `CL` is not one
-- Postgres defines, so PostgREST answers it as a 400 like any other raised
-- exception and the client can tell it from a CHECK violation by the code.
--
-- Everything after the check is 20260921000008's body, unchanged. Additive and
-- safe to roll back by re-applying that migration's `create or replace`.

create or replace function public.complete_onboarding(
  p_location_name text,
  p_location_tier public.equipment_tier,
  p_equipment text[],
  p_experience_level public.experience_level,
  p_goal_preset public.goal_preset,
  p_sections public.section_type[],
  p_avoid_patterns public.movement_pattern[] default '{}',
  p_note text default null
) returns json
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id     uuid := (select auth.uid());
  v_location_id uuid;
  v_name        text := btrim(p_location_name);
  v_note        text := nullif(btrim(coalesce(p_note, '')), '');
  v_profile     public.profiles;
  v_location    public.locations;
  v_pattern     public.movement_pattern;
  v_failures    jsonb;
begin
  -- An anonymous caller matches no policy on any table below, so every write
  -- would fail — one at a time, with a message about row-level security. Say
  -- it once, at the top, in the function's own vocabulary.
  if v_user_id is null then
    raise exception 'complete_onboarding requires an authenticated caller'
      using errcode = 'insufficient_privilege';
  end if;

  -- `locations_name_not_blank` would catch this, but as a constraint violation
  -- naming a constraint. The empty string is the one input a user can actually
  -- produce here, so it gets an answer rather than a stack trace.
  if v_name = '' then
    raise exception 'a location needs a name'
      using errcode = 'check_violation';
  end if;

  -- `profiles_enabled_sections_not_empty` says the same thing about sections.
  -- A workout with no sections is not a workout.
  if coalesce(cardinality(p_sections), 0) = 0 then
    raise exception 'at least one section must be enabled'
      using errcode = 'check_violation';
  end if;

  -- REQ-011. The answers as a proposal, before any of them is written. No rows
  -- is viable; any row is a section candidate retrieval is already known to be
  -- unable to fill, for a goal and focus Generate offers.
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'section',              v.section,
               'failure_class',        v.failure_class,
               'incompatible_choice',  v.incompatible_choice,
               'goals',                to_jsonb(v.goals),
               'focuses',              to_jsonb(v.focuses),
               'blocks_proposed_goal', v.blocks_proposed_goal
             )
             order by v.section nulls first, v.failure_class
           ),
           '[]'::jsonb
         )
    into v_failures
    from public.generation_viability(
           p_goal                => p_goal_preset,
           p_enabled_sections    => p_sections,
           p_available_equipment => array(
             select btrim(item)
               from unnest(coalesce(p_equipment, '{}'::text[])) as item
              where btrim(item) <> ''
           ),
           p_excluded_exercises  => '{}'::text[],
           p_excluded_patterns   => coalesce(p_avoid_patterns, '{}'::public.movement_pattern[]),
           p_excluded_equipment  => '{}'::text[]
         ) as v;

  if jsonb_array_length(v_failures) > 0 then
    raise exception 'this onboarding configuration cannot generate a workout'
      using errcode = 'CLR11',
            detail  = v_failures::text;
  end if;

  -- The new location is the default, so anything that was default stops being
  -- one *before* the insert: `locations_one_default_per_user_idx` is an
  -- immediate unique index and would refuse a second default outright. The
  -- transient state where the user has locations and no default among them is
  -- legal exactly because `locations_exactly_one_default` is a deferred
  -- constraint trigger — it is judged at COMMIT, by which time §1 has put the
  -- default back.
  update public.locations
     set is_default = false
   where user_id = v_user_id
     and is_default;

  -- Upsert on (user_id, name): `locations_name_unique_per_user` is the
  -- conflict target, so onboarding run twice with the same location name
  -- updates the place rather than failing on a name the user already owns.
  insert into public.locations (user_id, name, tier, is_default)
  values (v_user_id, v_name, p_location_tier, true)
  on conflict (user_id, name) do update
    set tier       = excluded.tier,
        is_default = true
  returning * into v_location;

  v_location_id := v_location.id;

  -- Equipment is replaced, not merged: the accordion the user just confirmed
  -- is the whole answer to "what is here", so an item they unticked has to
  -- disappear. Delete-then-insert inside the same statement-level transaction
  -- is atomic like everything else in this body.
  delete from public.location_equipment
   where location_id = v_location_id;

  insert into public.location_equipment (location_id, equipment_id)
  select v_location_id, btrim(item)
    from unnest(coalesce(p_equipment, '{}'::text[])) as item
   where btrim(item) <> ''
  on conflict do nothing;

  -- The profile. `onboarded_at` uses coalesce so a re-run keeps the original
  -- moment; every other column is the answer the user just gave.
  update public.profiles
     set experience_level = p_experience_level,
         goal_preset      = p_goal_preset,
         enabled_sections = p_sections,
         onboarded_at     = coalesce(onboarded_at, now())
   where id = v_user_id
  returning * into v_profile;

  -- The trigger in DATA-01b §6 creates this row at signup, so a missing one
  -- means the profile was never created or RLS hid it. Either way there is
  -- nothing to update and the commit must not report success.
  if v_profile.id is null then
    raise exception 'no profile row for the authenticated caller'
      using errcode = 'no_data_found';
  end if;

  -- Limitations. Onboarding writes persistent, pattern-scoped exclusions and
  -- nothing else: an exercise- or equipment-scoped row needs a target the
  -- first-run screen has no vocabulary for, and DATA-05 is explicit that a
  -- constraint is never inferred from prose. Replacing this user's persistent
  -- pattern exclusions keeps a re-run from stacking duplicates.
  delete from public.user_constraints
   where user_id = v_user_id
     and scope = 'movement_pattern'
     and persistence = 'persistent';

  foreach v_pattern in array coalesce(p_avoid_patterns, '{}'::public.movement_pattern[])
  loop
    insert into public.user_constraints (
      user_id, scope, action, persistence, target_pattern, note
    )
    values (
      v_user_id, 'movement_pattern', 'exclude', 'persistent', v_pattern, v_note
    );
  end loop;

  return json_build_object(
    'profile',  to_json(v_profile),
    'location', to_json(v_location)
  );
end;
$$;

comment on function public.complete_onboarding(
  text,
  public.equipment_tier,
  text[],
  public.experience_level,
  public.goal_preset,
  public.section_type[],
  public.movement_pattern[],
  text
) is
  'ONB-01, REQ-011: commits every onboarding answer in one transaction and '
  'answers with the committed profile and default location, or refuses a '
  'configuration generation_viability fails (SQLSTATE CLR11) before writing '
  'anything. SECURITY INVOKER, owner from auth.uid() — there is no argument '
  'that can name another user.';
