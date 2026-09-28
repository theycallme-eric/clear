-- ONB-01 — Schema: the atomic onboarding commit (REQ-056, issue #57)
--
-- Spec: docs/specs/screens/onboarding-wireframe.md; the rows it writes are
-- DATA-01b's (`profiles`, `locations`, `location_equipment`) and DATA-05's
-- (`user_constraints`).
--
-- Scope. One function. Onboarding asks five questions and the answers land in
-- four tables, so the thing that has to be true is that they land together or
-- not at all: REQ-056's "a failure leaves no partial profile or orphan
-- location". A function body is one statement to the caller, so an exception
-- anywhere inside it rolls back everything it had written — including the
-- location row, which is the orphan the requirement names.
--
-- What is deliberately different from the previous application's
-- `00017_complete_onboarding_rpc.sql` (kept read-only under
-- docs/backend/evidence/previous-migrations/):
--
--   * **No `p_user_id`.** The old function took the id as an argument and ran
--     SECURITY DEFINER, so the only thing standing between a caller and
--     someone else's profile was the client passing its own id. Here the owner
--     is `auth.uid()` and the function is SECURITY INVOKER, so every write goes
--     through the same owner-only policies a direct PostgREST call would —
--     there is no argument that can name another user.
--   * **No `locations.equipment TEXT[]`.** Equipment is one row per item in
--     `location_equipment` (DATA-01b §5), which is what generation joins.
--   * **No `profiles.limitations` and no `default_location_id`.** DATA-01b
--     retired both. The default location is `locations.is_default`, and a
--     limitation is an explicit `user_constraints` row (DATA-05) — prose an
--     LLM interprets is not a constraint. The free text the wireframe collects
--     survives as that row's `note`, which DATA-05 defines as best-effort
--     context and nothing reads as an exclusion.
--
-- Re-running it is defined behaviour, not an accident: a user who somehow
-- reaches onboarding twice gets their answers replaced rather than doubled,
-- which is why the equipment and constraint writes below delete before they
-- insert. `onboarded_at` is stamped on the first commit and left alone after,
-- so "when did this user finish onboarding" stays the answer to that question.
--
-- Idempotent on an empty project and on one this has already been pushed to:
-- the only object is `create or replace function`.

-- ===========================================================================
-- 1. complete_onboarding
-- ===========================================================================
--
-- Returns the two rows the client's caches must now hold — the profile and the
-- default location — rather than just the location id. The reason is the
-- AUTH-03 guard: it routes on `profiles.onboarded_at`, so a client that had to
-- refetch after committing would spend that round trip still looking, to the
-- guard, like a user who has not onboarded. Handing back the committed rows
-- makes "finish onboarding, land Home" one navigation instead of a race.

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
  'ONB-01: commits every onboarding answer in one transaction and answers '
  'with the committed profile and default location. SECURITY INVOKER, owner '
  'from auth.uid() — there is no argument that can name another user.';

-- ===========================================================================
-- 2. Privileges
-- ===========================================================================
--
-- Callable by a signed-in user and by nobody else. The grant is not what makes
-- it safe — SECURITY INVOKER plus the owner-only policies on all four tables
-- is — but an anonymous caller should be refused before it reaches a policy.

revoke all on function public.complete_onboarding(
  text,
  public.equipment_tier,
  text[],
  public.experience_level,
  public.goal_preset,
  public.section_type[],
  public.movement_pattern[],
  text
) from public, anon;

grant execute on function public.complete_onboarding(
  text,
  public.equipment_tier,
  text[],
  public.experience_level,
  public.goal_preset,
  public.section_type[],
  public.movement_pattern[],
  text
) to authenticated, service_role;
