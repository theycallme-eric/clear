-- ===========================================================================
-- REQ-012 — Settings cannot save impossible preferences
-- ===========================================================================
--
-- `generation_viability` (20261001000021) answers whether a *proposed*
-- configuration can generate at one location. This migration asks it at the
-- moment a saved preference changes, for every location the athlete has, and
-- refuses the write when the answer got worse.
--
-- It is a trigger rather than a function Settings is expected to call, because
-- "the refusal is enforced server-side" is a statement about the rows: a
-- client that PATCHes `profiles` or POSTs a `user_constraints` row directly
-- meets the same refusal, and a refused statement leaves both tables exactly
-- as they were — the raise aborts it.
--
-- Additive, and safe to roll back by dropping the two triggers and the two
-- functions. No table, column, policy or existing function is altered.
--
-- What is guarded:
--
--   * `profiles.goal_preset` and `profiles.enabled_sections` — Goal and the
--     section toggles;
--   * a persistent `exclude` row in `user_constraints` — a limitation. Removing
--     one can only widen what is eligible, so DELETE is not guarded, and the
--     note is never read (DATA_MODEL §5), so an update of it is not either.
--
-- What "got worse" means. The saved configuration is evaluated as it stood and
-- as it would stand, and the write is refused only for a failure the change
-- introduces: a (location, section, class) that was not failing before, or one
-- that now blocks the saved Goal and did not block the previous one. A
-- configuration that was already failing — a catalog gap is nobody's choice —
-- must stay editable, or the athlete could never change anything again,
-- including the choice that would fix it.
--
-- What is not guarded here. Onboarding's commit and the location writes change
-- the same answer and are other tasks' to wire: the profile trigger does
-- nothing until the profile is onboarded, the constraint trigger nothing inside
-- the transaction that onboards it, and no trigger is placed on `locations` or
-- `location_equipment`.

-- ===========================================================================
-- 1. settings_viability_failures
-- ===========================================================================
--
-- `generation_viability` once per saved location, with the location's
-- equipment and the athlete's persistent exclusions read through the functions
-- retrieval itself uses — `generation_equipment` and `constraints_in_force` —
-- and the Goal and sections taken as arguments, because those are what a
-- profile update proposes. `p_without_constraint` leaves one constraint row
-- out, which is how a limitation being added is evaluated as it stood before.
--
-- SECURITY INVOKER: every row read is behind the owner-only policies, so
-- another user's id answers no locations and therefore no rows.

create or replace function public.settings_viability_failures(
  p_user_id            uuid,
  p_goal               public.goal_preset,
  p_enabled_sections   public.section_type[],
  p_without_constraint uuid default null
)
returns table (
  location_id          uuid,
  location_name        text,
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
  with exclusions as (
    -- Only `exclude` filters retrieval, and only a persistent row is a saved
    -- setting: no session is named, so a session-scoped row is not in force.
    select c.scope, c.target_exercise_id, c.target_pattern, c.target_equipment
    from public.constraints_in_force(p_user_id) c
    where c.action = 'exclude'
      and c.id is distinct from p_without_constraint
  )
  select
    l.id,
    l.name,
    v.section,
    v.failure_class,
    v.incompatible_choice,
    v.goals,
    v.focuses,
    v.blocks_proposed_goal
  from public.locations l
  cross join lateral public.generation_viability(
    p_goal,
    p_enabled_sections,
    public.generation_equipment(p_user_id, l.id),
    array(select e.target_exercise_id from exclusions e where e.scope = 'exercise'),
    array(select e.target_pattern from exclusions e where e.scope = 'movement_pattern'),
    array(select e.target_equipment from exclusions e where e.scope = 'equipment')
  ) v
  where l.user_id = p_user_id
  -- Deterministic: the default location first, as the locations read orders them.
  order by l.is_default desc, l.name, l.id, v.section nulls first, v.failure_class
$$;

comment on function public.settings_viability_failures(
  uuid, public.goal_preset, public.section_type[], uuid) is
  'REQ-012: generation_viability for a Goal and section toggles at every saved '
  'location of one user, under their persistent exclusions. No rows is viable.';

revoke all on function public.settings_viability_failures(
  uuid, public.goal_preset, public.section_type[], uuid) from public, anon;

grant execute on function public.settings_viability_failures(
  uuid, public.goal_preset, public.section_type[], uuid) to authenticated, service_role;

-- ===========================================================================
-- 2. refuse_non_viable_settings
-- ===========================================================================
--
-- One trigger function for both tables. The refusal is SQLSTATE P0001 with the
-- message `settings_not_viable`, which PostgREST answers as a 400 carrying the
-- message and the detail; the detail is the introduced failures as JSON, each
-- with the location it is at, so the client can name the choice and the place
-- without asking again.

create or replace function public.refuse_non_viable_settings()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id      uuid;
  v_old_goal     public.goal_preset;
  v_old_sections public.section_type[];
  v_new_goal     public.goal_preset;
  v_new_sections public.section_type[];
  v_without      uuid;
  v_onboarded_at timestamptz;
  v_introduced   jsonb;
begin
  if tg_table_name = 'profiles' then
    -- Onboarding's own commit is the first write of these columns.
    if old.onboarded_at is null then
      return new;
    end if;

    v_user_id      := new.id;
    v_old_goal     := old.goal_preset;
    v_old_sections := old.enabled_sections;
    v_new_goal     := new.goal_preset;
    v_new_sections := new.enabled_sections;
  else
    if new.action <> 'exclude' or new.persistence <> 'persistent' then
      return new;
    end if;

    select p.goal_preset, p.enabled_sections, p.onboarded_at
      into v_new_goal, v_new_sections, v_onboarded_at
      from public.profiles p
     where p.id = new.user_id;

    -- `complete_onboarding` stamps `onboarded_at` with now() and then writes
    -- the limitations in the same transaction; now() is the transaction's
    -- start, so equality is "being onboarded by this transaction".
    if v_onboarded_at is null or v_onboarded_at = now() then
      return new;
    end if;

    v_user_id      := new.user_id;
    v_old_goal     := v_new_goal;
    v_old_sections := v_new_sections;
    v_without      := new.id;
  end if;

  select jsonb_agg(
           jsonb_build_object(
             'location_id',          a.location_id,
             'location_name',        a.location_name,
             'section',              a.section,
             'failure_class',        a.failure_class,
             'incompatible_choice',  a.incompatible_choice,
             'goals',                to_jsonb(a.goals),
             'focuses',              to_jsonb(a.focuses),
             'blocks_proposed_goal', a.blocks_proposed_goal
           )
           -- Deterministic: the same refusal reads the same twice.
           order by a.location_name, a.location_id, a.section nulls first, a.failure_class
         )
    into v_introduced
    from public.settings_viability_failures(
           v_user_id, v_new_goal, v_new_sections
         ) a
   where not exists (
     select 1
       from public.settings_viability_failures(
              v_user_id, v_old_goal, v_old_sections, v_without
            ) b
      where b.location_id = a.location_id
        and b.section is not distinct from a.section
        and b.failure_class = a.failure_class
        and (b.blocks_proposed_goal or not a.blocks_proposed_goal)
   );

  if v_introduced is not null then
    raise exception 'settings_not_viable'
      using errcode = 'P0001',
            detail  = v_introduced::text,
            hint    = 'The change cannot generate at a saved location; nothing was saved.';
  end if;

  return new;
end;
$$;

comment on function public.refuse_non_viable_settings() is
  'REQ-012: refuses a Goal, section or limitation change that introduces a '
  'generation failure at any of the user''s saved locations.';

revoke all on function public.refuse_non_viable_settings() from public, anon;

-- ===========================================================================
-- 3. Triggers
-- ===========================================================================
--
-- AFTER, so the constraint row being added is one `constraints_in_force`
-- already returns and the evaluation reads what would be stored. The WHEN on
-- `profiles` keeps an experience-only edit — which patches all three
-- preference columns — from evaluating anything.

drop trigger if exists profiles_refuse_non_viable_settings on public.profiles;
create trigger profiles_refuse_non_viable_settings
  after update of goal_preset, enabled_sections on public.profiles
  for each row
  when (
    old.goal_preset is distinct from new.goal_preset
    or old.enabled_sections is distinct from new.enabled_sections
  )
  execute function public.refuse_non_viable_settings();

drop trigger if exists user_constraints_refuse_non_viable_settings on public.user_constraints;
create trigger user_constraints_refuse_non_viable_settings
  after insert or update of
    action, persistence, scope, target_exercise_id, target_pattern, target_equipment
  on public.user_constraints
  for each row
  execute function public.refuse_non_viable_settings();
