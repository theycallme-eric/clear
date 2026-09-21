-- DATA-01b — Schema: user baseline domain (REQ-010, issue #9)
--
-- Spec: docs/specs/DATA_MODEL.md §2 (domains) and §5 (user baseline).
-- Disposition: docs/backend/dispositions.md §1 — `profiles` and `locations` are
-- Replace. Their rows are disposable test data and are never migrated; the
-- physical tables are rebuilt here, not altered.
--
-- Scope. The profile, its training locations, and the equipment each location
-- actually has. `user_constraints` is deliberately absent — it is DATA-05's
-- table, and the free-text `profiles.limitations` column it supersedes is not
-- rebuilt here rather than being carried forward and then dropped twice.
--
-- Shapes deliberately absent from the rebuilt profile:
--   * The six streak columns (`streak_count`, `streak_start_date`,
--     `streak_status`, `streak_pause_reason`, `streak_pause_start`,
--     `consecutive_rest_days`). Streak is derived from `workout_sessions`
--     (DATA_MODEL §5, §11) — stored derived state drifts.
--   * `default_location_id`. It duplicated `locations.is_default`, so the two
--     could disagree about which location was the default. One of them had to
--     go, and the flag is the one a constraint can police (§4 below).
--   * `limitations` TEXT. Superseded by `user_constraints` (DATA-05), where an
--     exclusion is an explicit row rather than prose an LLM interprets.
--
-- Idempotent on an empty project: re-running this file is a no-op, so a failed
-- push can be retried without hand-editing the migration history.

-- ===========================================================================
-- 1. Enums
-- ===========================================================================

do $$
begin
  -- New (DATA_MODEL §10). The profile default, and the type set logs stamp per
  -- row in DATA-01d.
  if not exists (select 1 from pg_type where typname = 'weight_unit') then
    create type public.weight_unit as enum ('lb', 'kg');
  end if;

  -- Transform (dispositions §6): onboarding vocabulary is retained, not
  -- redesigned. The guard matters on the reused project, where 00001 already
  -- created these types — there the live value set carries forward untouched,
  -- including `goal_preset`'s legacy 'quick', which 00020 removed from the UI
  -- but left in the type.
  if not exists (select 1 from pg_type where typname = 'experience_level') then
    create type public.experience_level as enum ('new', 'some', 'confident');
  end if;

  if not exists (select 1 from pg_type where typname = 'goal_preset') then
    create type public.goal_preset as enum (
      'strength', 'hypertrophy', 'conditioning', 'balanced', 'active_recovery'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'equipment_tier') then
    create type public.equipment_tier as enum (
      'minimal', 'home', 'building', 'full'
    );
  end if;
end;
$$;

-- ===========================================================================
-- 2. Retiring what this domain replaces
-- ===========================================================================
--
-- The rebuild reuses the live project (dispositions §9), so on that database
-- `profiles` and `locations` already exist in their previous shape. Creating
-- them with IF NOT EXISTS would silently leave the old tables standing: no
-- `weight_unit`, no equipment table, and the previous RLS policies — every
-- acceptance criterion below would read as satisfied by this file while being
-- false in the database. So the replaced tables are dropped and rebuilt.
--
-- This is destructive, and deliberately so:
--   * Both tables are Replace with "rows are disposable test data, never
--     migrated" (dispositions §1), grounded in the owner decision of
--     2026-09-07 that all personal rows are disposable.
--   * Replace is defined as taking effect *after a recoverable snapshot*. The
--     snapshot is `docs/backend/snapshot/2026-09-18T162821Z`, and the
--     off-machine-backup gate in docs/backend/live-inventory.md holds any push
--     to the live project until TASK-072. Authoring is not applying.
--   * On an empty project — `supabase db reset`, CI, a fresh project — these
--     statements find nothing and do nothing.
--
-- CASCADE reaches the foreign keys legacy `workout_sessions` and friends hold
-- into these tables. Those tables are Replace too (DATA-01c/d) and are dropped
-- with their own domains; nothing here drops a table another domain owns.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

drop table if exists public.locations cascade;
drop table if exists public.profiles  cascade;

-- Its table is gone; the trigger went with it. The function is Replace
-- (dispositions §3) and the rebuild enforces the rule with a constraint
-- instead (§4), so nothing recreates it.
drop function if exists public.ensure_single_default_location();

-- ===========================================================================
-- 3. profiles
-- ===========================================================================
--
-- One row per authenticated user, created by §6's trigger at signup. Every
-- column below is either defaulted or nullable, which is what makes "never
-- partially written" structural rather than careful: the insert that creates a
-- profile names only `id`, so there is no window in which a half-written
-- profile is visible. An answer the user has not given yet is NULL — typed
-- absence — and never a sentinel that reads as an answer.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Onboarding answers. NULL means "not answered", which is distinguishable
  -- from every valid value of either type.
  experience_level public.experience_level,
  goal_preset      public.goal_preset,

  -- Which sections this user's workouts may contain. NOT NULL with the six
  -- defaults, because a profile that has answered nothing still has to
  -- generate something.
  enabled_sections public.section_type[] not null default array[
    'warmup', 'primary_lift', 'accessory', 'core', 'conditioning', 'cooldown'
  ]::public.section_type[],

  -- The profile default unit. It applies to *new* writes only: DATA-01d stamps
  -- `weight_unit` on every set log at write time, and nothing reads this column
  -- to interpret a stored log. Changing it therefore cannot reinterpret
  -- history, which is an injury path and not a display bug (DATA_MODEL §8).
  weight_unit public.weight_unit not null default 'lb',

  -- Typed absence again: NULL is "has not completed onboarding". The AUTH-03
  -- guard reads this, and a *failed* profile fetch is an error state rather
  -- than a NULL — that distinction is defect D1.
  onboarded_at timestamptz,

  constraint profiles_enabled_sections_not_empty
    check (cardinality(enabled_sections) > 0)
);

comment on table public.profiles is
  'One row per auth.users row, created at signup with defaults only. Streak is '
  'derived from workout_sessions, not stored here.';

comment on column public.profiles.weight_unit is
  'Default unit for new weight entries. Never consulted when reading a set '
  'log: DATA-01d stamps the unit per row, so changing this cannot reinterpret '
  'recorded history.';

comment on column public.profiles.onboarded_at is
  'NULL means onboarding is incomplete. A failed profile read is an error '
  'state, never this NULL (defect D1).';

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- 4. locations
-- ===========================================================================

create table if not exists public.locations (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  name text not null,

  -- The coarse label onboarding asks for. It is a description of the place,
  -- not the source of truth for what is in it — §5 is.
  tier public.equipment_tier not null,

  is_default boolean not null default false,

  constraint locations_name_not_blank check (btrim(name) <> ''),
  -- Two locations called "Home" are a bug report waiting to happen.
  constraint locations_name_unique_per_user unique (user_id, name)
);

comment on table public.locations is
  'Where a user trains. Equipment is not a column here — it is one row per '
  'item in location_equipment (§5).';

create index if not exists locations_user_id_idx
  on public.locations (user_id);

-- At most one default per user, enforced immediately and by the index itself.
-- The previous schema used a trigger that quietly un-defaulted the other rows;
-- that is a convention correcting a violation, not a constraint preventing one.
create unique index if not exists locations_one_default_per_user_idx
  on public.locations (user_id) where is_default;

-- "At most one" is half the requirement. The other half is that a user who has
-- locations has a default among them — otherwise generation has no equipment
-- list to read and the UI has nothing to preselect.
--
-- DEFERRABLE INITIALLY DEFERRED so a legitimate multi-statement edit — moving
-- the default from one location to another — is judged at COMMIT rather than
-- between its two UPDATEs. Zero locations is allowed: a user who has deleted
-- them all has no default because there is nothing to be default.
create or replace function public.assert_user_has_one_default_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- NEW is unassigned on DELETE and OLD is unassigned on INSERT, so which row
  -- names the owner depends on the operation. An UPDATE that moved a location
  -- between users would leave two users to re-check, so it checks both.
  owners   uuid[];
  owner_id uuid;
  total    integer;
  defaults integer;
begin
  if tg_op = 'INSERT' then
    owners := array[new.user_id];
  elsif tg_op = 'DELETE' then
    owners := array[old.user_id];
  else
    owners := array[new.user_id, old.user_id];
  end if;

  foreach owner_id in array owners
  loop
    select count(*), count(*) filter (where l.is_default)
      into total, defaults
      from public.locations l
     where l.user_id = owner_id;

    if total > 0 and defaults <> 1 then
      raise exception
        'user % must have exactly one default location, found % among % locations',
        owner_id, defaults, total
        using errcode = 'check_violation';
    end if;
  end loop;

  return null;
end;
$$;

comment on function public.assert_user_has_one_default_location() is
  'Deferred constraint: a user with locations has exactly one default. '
  'SECURITY DEFINER so the count is of the owner''s rows, not of the rows RLS '
  'happens to show the caller.';

drop trigger if exists locations_exactly_one_default on public.locations;
create constraint trigger locations_exactly_one_default
  after insert or update or delete on public.locations
  deferrable initially deferred
  for each row execute function public.assert_user_has_one_default_location();

drop trigger if exists locations_set_updated_at on public.locations;
create trigger locations_set_updated_at
  before update on public.locations
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- 5. location_equipment
-- ===========================================================================
--
-- The explicit list, one row per item, replacing the previous
-- `locations.equipment TEXT[]`. A row per item is what lets DATA-05 exclude a
-- single piece of equipment and lets eligibility join rather than unnest.
--
-- `equipment_id` carries no foreign key because the catalog has no equipment
-- table to point at: DATA-01a models equipment as the text ids in
-- `exercise_definitions.equipment_options`. An id that matches nothing simply
-- makes no exercise eligible, which is the same outcome as not owning it.

create table if not exists public.location_equipment (
  location_id uuid not null
    references public.locations (id) on delete cascade,
  equipment_id text not null,

  created_at timestamptz not null default now(),

  primary key (location_id, equipment_id),

  constraint location_equipment_id_not_blank check (btrim(equipment_id) <> '')
);

comment on table public.location_equipment is
  'What a location actually has, one row per item. The authoritative input to '
  'eligibility; locations.tier is a label, not a substitute for this list.';

-- "Which of my locations have a barbell" reads this way round.
create index if not exists location_equipment_equipment_idx
  on public.location_equipment (equipment_id);

-- ===========================================================================
-- 6. Profile on signup
-- ===========================================================================
--
-- Replace of `handle_new_user()` (dispositions §3), re-authored with a pinned
-- empty search_path so nothing on the caller's path can be resolved in place of
-- what this function names. It runs inside the signup transaction: if the
-- insert fails the user is not created, so "authenticated but profileless" is
-- not a state the application has to handle.
--
-- SECURITY DEFINER because the inserting role is the auth system, not the new
-- user, so the profiles INSERT policy would otherwise refuse it.

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Defaults only. Every onboarding answer stays NULL until the user gives it,
  -- so this row is complete the moment it exists.
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.create_profile_for_new_user() is
  'Creates the profile row at signup, with defaults only. ON CONFLICT DO '
  'NOTHING so a replayed signup is not an error.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

-- ===========================================================================
-- 7. Row-level security — owner-only
-- ===========================================================================
--
-- The catalog's posture (DATA-01a §8) was "everyone reads, nobody writes".
-- This domain's is "the owner reads and writes, nobody else sees it exists",
-- and it is built from the same two independent mechanisms:
--   * RLS policies, scoped `TO authenticated` so an anonymous request matches
--     no policy at all, with owner predicates on both USING and WITH CHECK.
--     USING alone would let a user rewrite their own row into someone else's.
--   * Table privileges: revoked from anon entirely, granted to authenticated
--     only for the commands that have a policy.
-- `auth.uid()` is wrapped in a scalar subquery so the planner evaluates it once
-- per statement rather than once per row (the lesson of migration 00019).

alter table public.profiles           enable row level security;
alter table public.locations          enable row level security;
alter table public.location_equipment enable row level security;

-- --- profiles ---------------------------------------------------------------

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

-- §6's trigger normally creates the row. This policy exists so a profile
-- missing for any reason can be recreated by its owner and by nobody else.
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No DELETE policy, and no DELETE grant. Deleting a profile row would leave an
-- authenticated user with no profile and no way back; account deletion removes
-- the auth.users row and this row goes with it by cascade.

-- --- locations --------------------------------------------------------------

drop policy if exists locations_select_own on public.locations;
create policy locations_select_own on public.locations
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists locations_insert_own on public.locations;
create policy locations_insert_own on public.locations
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists locations_update_own on public.locations;
create policy locations_update_own on public.locations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists locations_delete_own on public.locations;
create policy locations_delete_own on public.locations
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- --- location_equipment -----------------------------------------------------
--
-- Ownership is inherited, not copied: the predicate walks to `locations` rather
-- than trusting a denormalized `user_id` that could disagree with the location
-- it belongs to. The walk is a primary-key lookup, and `locations` has its own
-- owner policy, so a caller cannot even see the location row they would need to
-- attach equipment to someone else's location.

drop policy if exists location_equipment_select_own on public.location_equipment;
create policy location_equipment_select_own on public.location_equipment
  for select to authenticated
  using (
    exists (
      select 1 from public.locations l
      where l.id = location_equipment.location_id
        and l.user_id = (select auth.uid())
    )
  );

drop policy if exists location_equipment_insert_own on public.location_equipment;
create policy location_equipment_insert_own on public.location_equipment
  for insert to authenticated
  with check (
    exists (
      select 1 from public.locations l
      where l.id = location_equipment.location_id
        and l.user_id = (select auth.uid())
    )
  );

drop policy if exists location_equipment_update_own on public.location_equipment;
create policy location_equipment_update_own on public.location_equipment
  for update to authenticated
  using (
    exists (
      select 1 from public.locations l
      where l.id = location_equipment.location_id
        and l.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.locations l
      where l.id = location_equipment.location_id
        and l.user_id = (select auth.uid())
    )
  );

drop policy if exists location_equipment_delete_own on public.location_equipment;
create policy location_equipment_delete_own on public.location_equipment
  for delete to authenticated
  using (
    exists (
      select 1 from public.locations l
      where l.id = location_equipment.location_id
        and l.user_id = (select auth.uid())
    )
  );

-- --- privileges -------------------------------------------------------------

revoke all on public.profiles           from anon, authenticated;
revoke all on public.locations          from anon, authenticated;
revoke all on public.location_equipment from anon, authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.locations          to authenticated;
grant select, insert, update, delete on public.location_equipment to authenticated;

grant all on public.profiles           to service_role;
grant all on public.locations          to service_role;
grant all on public.location_equipment to service_role;
