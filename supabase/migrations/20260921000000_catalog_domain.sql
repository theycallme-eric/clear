-- DATA-01a — Schema: catalog domain (REQ-009, issue #8)
--
-- Spec: docs/specs/DATA_MODEL.md §3 (taxonomy) and §4 (catalog).
-- Disposition: docs/backend/dispositions.md §1, §5, §7 — the catalog content is
-- Transform, the physical tables are rebuilt here rather than ported.
--
-- Scope. Exercise definitions with their component vocabulary, the
-- component→pattern map, equipment, muscle mappings, the authored pattern
-- weighting table, and the derived pattern views. Nothing user-owned: profiles,
-- sessions, logs and favourites belong to DATA-01b/c/d.
--
-- Two shapes deliberately absent:
--   * `exercise_anchors` is NOT created. It is being retired, not rebuilt; its
--     one piece of real information — the primary/secondary ranking — lands in
--     `exercise_pattern_weights` when DATA-02 migrates it.
--   * `movement_patterns` (the 27-row legacy table) is NOT created. Patterns are
--     derived from `component_movements`, so there is no table to keep in sync.
--
-- Seeds. The two mapping tables are seeded because they *are* taxonomy — the
-- acceptance criterion is that the focus→pattern mapping is data, not a CASE
-- expression. Exercise rows are DATA-02's job.
--
-- Idempotent on an empty project: re-running this file is a no-op, so a failed
-- push can be retried without hand-editing the migration history.

-- ===========================================================================
-- 1. Enums
-- ===========================================================================

-- `anchor_type` held three concepts at once (DATA_MODEL §11). It splits into a
-- session-level focus and an exercise-level movement pattern, and neither is
-- created here as TEXT with a CHECK — the vocabulary is closed.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'session_focus') then
    create type public.session_focus as enum (
      'upper_body', 'lower_body', 'full_body', 'power'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'movement_pattern') then
    -- `conditioning` derives from `cardio-output` but maps to no focus. That is
    -- correct for now and recorded as open question 5 in DATA_MODEL §13.
    create type public.movement_pattern as enum (
      'squat', 'hinge', 'press', 'pull', 'power', 'unilateral', 'conditioning'
    );
  end if;

  -- Converted from TEXT + CHECK (DATA_MODEL §10). Same seven values migration
  -- 00031 tagged, now enforced by the type system instead of a constraint.
  if not exists (select 1 from pg_type where typname = 'exercise_role') then
    create type public.exercise_role as enum (
      'compound_lift', 'accessory', 'activation',
      'mobility', 'conditioning', 'stability', 'cardio'
    );
  end if;

  -- Converted from TEXT + CHECK (DATA_MODEL §10).
  if not exists (select 1 from pg_type where typname = 'muscle_role') then
    create type public.muscle_role as enum ('primary', 'synergist', 'stabilizer');
  end if;

  -- Section eligibility is catalog content (docs/process/CATALOG_MIGRATION_SCOPE.md),
  -- so the vocabulary has to exist before `exercise_definitions` can reference
  -- it. The ten live values carry forward unchanged (dispositions §5).
  if not exists (select 1 from pg_type where typname = 'section_type') then
    create type public.section_type as enum (
      'warmup', 'mobility', 'primary_lift', 'accessory', 'skill_power',
      'carries', 'core', 'stability_balance', 'conditioning', 'cooldown'
    );
  end if;
end;
$$;

-- ===========================================================================
-- 2. Shared trigger function
-- ===========================================================================

-- `update_updated_at_column()` is Replace (dispositions §3). Re-authored with a
-- pinned empty search_path so a schema on the caller's path cannot shadow
-- anything this function resolves.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Stamps updated_at on UPDATE. Shared by every table that carries the column.';

-- ===========================================================================
-- 3. Taxonomy mapping tables
-- ===========================================================================

-- A real table, not a CASE expression: adding a component to the vocabulary is
-- one INSERT, and never a migration.
create table if not exists public.component_pattern_map (
  component        text primary key,
  movement_pattern public.movement_pattern not null
);

comment on table public.component_pattern_map is
  'Component primitive → movement pattern. Quality components (brace, grip, the '
  'mobility set) are deliberately absent: they describe demands, not patterns.';

-- Focus → patterns as data, so the generator joins rather than branches.
create table if not exists public.focus_pattern_map (
  session_focus    public.session_focus    not null,
  movement_pattern public.movement_pattern not null,
  primary key (session_focus, movement_pattern)
);

comment on table public.focus_pattern_map is
  'Which movement patterns a session focus admits. Replaces the hardcoded '
  '"Upper Body → Press OR Pull" branch in filterByAnchor() and the prompt.';

-- ===========================================================================
-- 4. Exercise definitions
-- ===========================================================================

create table if not exists public.exercise_definitions (
  id   text primary key,
  name text not null,

  -- Equipment: the options, the default, and the per-equipment display names
  -- ("Barbell Strict Press" vs "Dumbbell Strict Press").
  equipment_options       text[] not null,
  default_equipment       text   not null,
  equipment_display_names jsonb  not null default '{}'::jsonb,

  -- Progressions. Both sides stay nullable — a valid null means "no easier/
  -- harder variant authored", which DATA-02 must preserve rather than invent.
  regression  text references public.exercise_definitions (id) on delete set null,
  progression text references public.exercise_definitions (id) on delete set null,

  coaching_cues text[] not null default '{}',

  -- Eligibility.
  sections       public.section_type[] not null default '{}',
  can_be_primary boolean               not null default false,

  -- The component vocabulary patterns derive from. Populated across 142
  -- exercises with 20 values and more precise than the old anchor enum, which
  -- is exactly why there is no re-tagging step anywhere in this migration.
  component_movements text[] not null default '{}',

  exercise_role public.exercise_role not null default 'accessory',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint exercise_definitions_default_equipment_is_an_option
    check (default_equipment = any (equipment_options)),
  constraint exercise_definitions_equipment_options_not_empty
    check (cardinality(equipment_options) > 0),
  -- An exercise cannot be its own progression or regression.
  constraint exercise_definitions_no_self_progression
    check (regression is distinct from id and progression is distinct from id)
);

comment on table public.exercise_definitions is
  'Canonical exercise library. Read-only to clients; DATA-02 seeds it from the '
  'captured 140-row live export.';

create index if not exists exercise_definitions_components_idx
  on public.exercise_definitions using gin (component_movements);
create index if not exists exercise_definitions_equipment_idx
  on public.exercise_definitions using gin (equipment_options);
create index if not exists exercise_definitions_sections_idx
  on public.exercise_definitions using gin (sections);
create index if not exists exercise_definitions_role_idx
  on public.exercise_definitions (exercise_role);
create index if not exists exercise_definitions_primary_idx
  on public.exercise_definitions (can_be_primary) where can_be_primary;

drop trigger if exists exercise_definitions_set_updated_at
  on public.exercise_definitions;
create trigger exercise_definitions_set_updated_at
  before update on public.exercise_definitions
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- 5. Muscle mappings
-- ===========================================================================

create table if not exists public.exercise_muscle_groups (
  exercise_id  text              not null
    references public.exercise_definitions (id) on delete cascade,
  muscle_group text              not null,
  role         public.muscle_role not null,
  primary key (exercise_id, muscle_group, role)
);

comment on table public.exercise_muscle_groups is
  'Muscle coverage with primary/synergist/stabilizer roles. 488 live rows carry '
  'into this table in DATA-02.';

create index if not exists exercise_muscle_groups_muscle_idx
  on public.exercise_muscle_groups (muscle_group);
create index if not exists exercise_muscle_groups_muscle_role_idx
  on public.exercise_muscle_groups (muscle_group, role);

-- ===========================================================================
-- 6. Authored pattern ranking
-- ===========================================================================

-- Derivation alone would discard `is_primary`, and that loss is real:
-- push-press carries both `vertical-press` and `triple-extension`, so a pure
-- derivation makes it equally a press and a power movement. This table is the
-- weighting layer that keeps the authored ranking — nothing more. Coverage may
-- be partial; an exercise with no row here is still a candidate, just not a
-- primary one.
create table if not exists public.exercise_pattern_weights (
  exercise_id      text                     not null
    references public.exercise_definitions (id) on delete cascade,
  movement_pattern public.movement_pattern  not null,
  is_primary       boolean                  not null default false,
  primary key (exercise_id, movement_pattern)
);

comment on table public.exercise_pattern_weights is
  'Receives DATA-02''s migrated ranking from the retired exercise_anchors. '
  'Region anchors (upper_body, lower_body, full_body) are focus values, not '
  'patterns, and are dropped deliberately rather than stored here.';

-- One primary pattern per exercise: the ranking is a ranking.
create unique index if not exists exercise_pattern_weights_one_primary_idx
  on public.exercise_pattern_weights (exercise_id) where is_primary;

-- ===========================================================================
-- 7. Derived views
-- ===========================================================================

-- `security_invoker` so the catalog policies below are what decides a read,
-- rather than the view silently running with the owner's rights.

-- Candidate patterns, derived. No authoring, no re-tagging.
create or replace view public.exercise_patterns
with (security_invoker = on) as
select distinct
  ed.id as exercise_id,
  m.movement_pattern
from public.exercise_definitions ed
cross join lateral unnest(ed.component_movements) as c (component)
join public.component_pattern_map m on m.component = c.component;

comment on view public.exercise_patterns is
  'Derived candidate patterns. A new component is one row in '
  'component_pattern_map, not a migration.';

-- What candidate retrieval reads: every derived pattern, with the authored
-- ranking applied where one exists.
create or replace view public.exercise_pattern_ranked
with (security_invoker = on) as
select
  ep.exercise_id,
  ep.movement_pattern,
  coalesce(w.is_primary, false) as is_primary
from public.exercise_patterns ep
left join public.exercise_pattern_weights w
  on w.exercise_id = ep.exercise_id
 and w.movement_pattern = ep.movement_pattern;

comment on view public.exercise_pattern_ranked is
  'Derived patterns plus authored ranking. Replaces exercise_definitions_with_anchors.';

-- The hydration surface generation reads (DATA_MODEL §4). Replaces both retired
-- convenience views.
create or replace view public.exercise_catalog
with (security_invoker = on) as
select
  ed.*,
  array(
    select epr.movement_pattern
    from public.exercise_pattern_ranked epr
    where epr.exercise_id = ed.id
    order by epr.movement_pattern
  ) as movement_patterns,
  array(
    select epr.movement_pattern
    from public.exercise_pattern_ranked epr
    where epr.exercise_id = ed.id and epr.is_primary
    order by epr.movement_pattern
  ) as primary_patterns,
  coalesce(
    (
      select jsonb_agg(
               jsonb_build_object('muscle', emg.muscle_group, 'role', emg.role)
               order by emg.muscle_group, emg.role
             )
      from public.exercise_muscle_groups emg
      where emg.exercise_id = ed.id
    ),
    '[]'::jsonb
  ) as muscles
from public.exercise_definitions ed;

comment on view public.exercise_catalog is
  'Exercise definitions hydrated with derived patterns and muscle coverage.';

-- ===========================================================================
-- 8. Row-level security — the catalog convention starts here
-- ===========================================================================
--
-- Readable by any authenticated user, writable by none. Two independent
-- mechanisms, because either alone is a single point of failure:
--   * RLS with a SELECT policy and no INSERT/UPDATE/DELETE policy — a write has
--     no policy to satisfy, so it is refused.
--   * Table privileges revoked from anon and authenticated — a write is refused
--     before RLS is consulted at all.
-- `service_role` holds BYPASSRLS, which is how DATA-02 seeds these tables.

alter table public.component_pattern_map      enable row level security;
alter table public.focus_pattern_map          enable row level security;
alter table public.exercise_definitions       enable row level security;
alter table public.exercise_muscle_groups     enable row level security;
alter table public.exercise_pattern_weights   enable row level security;

do $$
declare
  catalog_table text;
begin
  foreach catalog_table in array array[
    'component_pattern_map',
    'focus_pattern_map',
    'exercise_definitions',
    'exercise_muscle_groups',
    'exercise_pattern_weights'
  ]
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      catalog_table || '_select_authenticated', catalog_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      catalog_table || '_select_authenticated', catalog_table);

    -- No write policy is created, and that is the whole point. Stating it as a
    -- revoke as well means a future default-privilege grant cannot quietly open
    -- a hole.
    execute format(
      'revoke all on public.%I from anon, authenticated', catalog_table);
    execute format(
      'grant select on public.%I to authenticated', catalog_table);
    execute format(
      'grant all on public.%I to service_role', catalog_table);
  end loop;
end;
$$;

-- Views inherit nothing automatically; grant them the same way.
revoke all on public.exercise_patterns       from anon, authenticated;
revoke all on public.exercise_pattern_ranked from anon, authenticated;
revoke all on public.exercise_catalog        from anon, authenticated;

grant select on public.exercise_patterns       to authenticated;
grant select on public.exercise_pattern_ranked to authenticated;
grant select on public.exercise_catalog        to authenticated;

grant all on public.exercise_patterns       to service_role;
grant all on public.exercise_pattern_ranked to service_role;
grant all on public.exercise_catalog        to service_role;

-- ===========================================================================
-- 9. Taxonomy seeds
-- ===========================================================================

-- The mapped components and their counts in the live catalog (DATA_MODEL §3).
-- Everything not listed — brace (61), scapular-control, grip, anti-rotation,
-- landing-mechanics, anti-lateral-flexion and the mobility set — stays out on
-- purpose: those describe demands, and the warmup coverage rule reads them
-- straight off `component_movements`.
insert into public.component_pattern_map (component, movement_pattern) values
  ('knee-flexion',         'squat'),        -- 27
  ('hip-hinge',            'hinge'),        -- 20
  ('vertical-press',       'press'),        -- 18
  ('horizontal-press',     'press'),        -- 13
  ('triple-extension',     'power'),        -- 17
  ('horizontal-pull',      'pull'),         -- 7
  ('vertical-pull',        'pull'),         -- 5
  ('single-leg-stability', 'unilateral'),   -- 11
  ('cardio-output',        'conditioning')  -- 12
on conflict (component) do update
  set movement_pattern = excluded.movement_pattern;

insert into public.focus_pattern_map (session_focus, movement_pattern) values
  ('upper_body', 'press'),
  ('upper_body', 'pull'),
  ('lower_body', 'squat'),
  ('lower_body', 'hinge'),
  ('lower_body', 'unilateral'),
  ('full_body',  'squat'),
  ('full_body',  'hinge'),
  ('full_body',  'press'),
  ('full_body',  'pull'),
  ('full_body',  'unilateral'),
  ('power',      'power')
on conflict (session_focus, movement_pattern) do nothing;
