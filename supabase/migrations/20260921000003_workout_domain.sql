-- DATA-01c — Schema: workout domain (REQ-011, issue #10)
--
-- Spec: docs/specs/DATA_MODEL.md §4 (catalog reference), §6 (prescription) and
-- §7 (temporal lineage).
-- Disposition: docs/backend/dispositions.md §1 — `workout_sessions`,
-- `workout_sections` and `exercises` are all Replace. No row is migrated; the
-- physical tables are rebuilt here, and `exercises` does not come back under
-- its old name.
--
-- Scope. The prescription side: what a session asked for, the sections it is
-- composed of, the blocks inside them, and the exercises inside those. The
-- execution side — `exercise_set_logs`, `block_results`, and the
-- `session_performed` view that joins them (DATA_MODEL §8) — is DATA-01d's and
-- is deliberately absent, because a view cannot be written against tables that
-- do not exist yet and writing half of it would be worse than not writing it.
--
-- The two structural changes this migration exists for:
--
--   1. `workout_blocks` between sections and exercises. Structure attributes —
--      type, rounds, timer, round rest, rep scheme — lived on every member
--      exercise before, duplicated per member, with nothing stopping three
--      exercises in one circuit from disagreeing about the clock. They live on
--      the block now, once, and no exercise column can contradict them because
--      no exercise column exists.
--
--   2. Append-and-supersede lineage on `workout_exercises`. This is defect D6
--      designed out: a swap inserts a new row carrying the same `slot_id`
--      rather than mutating the old one, so a set log always points at the
--      exercise that was actually performed.
--
-- Idempotent on an empty project: re-running this file is a no-op, so a failed
-- push can be retried without hand-editing the migration history.

-- ===========================================================================
-- 1. Enums
-- ===========================================================================
--
-- Everything the prescription discriminates on is a closed vocabulary, and a
-- closed vocabulary is a type rather than TEXT with a CHECK (DATA_MODEL §10).
-- The guards matter on the reused project, where nothing below exists yet but
-- a retried push must not fail on the second attempt.

do $$
begin
  -- Converted from TEXT (DATA_MODEL §10). The six structures the generation
  -- contract 4.1.0 can return (docs/specs/generation/GENERATION_CONTRACT.md §5).
  if not exists (select 1 from pg_type where typname = 'structure_type') then
    create type public.structure_type as enum (
      'standard', 'superset', 'circuit', 'emom', 'amrap', 'for_time'
    );
  end if;

  -- What kind of clock the block runs, which is not the same question as how
  -- long it runs for. `none` is a real answer, not an absence, so the column is
  -- NOT NULL DEFAULT 'none'.
  if not exists (select 1 from pg_type where typname = 'timer_contract') then
    create type public.timer_contract as enum (
      'none', 'count_up', 'countdown', 'interval', 'per_minute'
    );
  end if;

  -- Converted from TEXT (DATA_MODEL §10). The seven schemes the previous
  -- prompt defined (docs/backend/evidence/previous-functions/generate-workout.prompt.ts)
  -- and docs/specs/structures/structure-types.md tabulates. A rep scheme is a
  -- property of the block: it describes how reps move across rounds, and that
  -- is one pattern for the whole block or it is not a pattern at all.
  if not exists (select 1 from pg_type where typname = 'rep_scheme') then
    create type public.rep_scheme as enum (
      'fixed', 'ladder_up', 'ladder_down', 'pyramid',
      'inverse', 'n_plus_one', 'ladder_fixed_interval'
    );
  end if;

  -- What the target's numbers mean. `rounds` is deliberately not a value here:
  -- an exercise inside an AMRAP still prescribes reps or time *per round*, and
  -- the block is what repeats (DATA_MODEL §6).
  if not exists (select 1 from pg_type where typname = 'prescription_modality') then
    create type public.prescription_modality as enum ('reps', 'time', 'distance');
  end if;

  -- The discriminator that makes `{8,10}` as a rep range and `{8,10}` as a
  -- two-rung ladder different rows rather than the same row read two ways.
  if not exists (select 1 from pg_type where typname = 'target_kind') then
    create type public.target_kind as enum ('fixed', 'range', 'sequence');
  end if;

  if not exists (select 1 from pg_type where typname = 'distance_unit') then
    create type public.distance_unit as enum ('m', 'km', 'ft', 'mi');
  end if;

  -- How load is expressed. `effort_percent` folded into this plus `load_value`
  -- (DATA_MODEL §11): one column could not say "RIR 3" and "70% of 1RM".
  if not exists (select 1 from pg_type where typname = 'load_guidance') then
    create type public.load_guidance as enum (
      'percent_1rm', 'rir', 'bodyweight', 'prior_session', 'absolute', 'none'
    );
  end if;

  -- Where a prescription row came from. `generated` is composition's output;
  -- `revised` is a row a swap inserted (DATA_MODEL §7).
  if not exists (select 1 from pg_type where typname = 'prescription_origin') then
    create type public.prescription_origin as enum ('generated', 'revised');
  end if;

  -- The two statuses, and the reason they are two types rather than one.
  -- Collapsing them loses information: replacing an exercise the user already
  -- completed would overwrite `completed` with `superseded`, and the set logs
  -- would be attached to a row whose own record of being performed had just
  -- been erased.
  if not exists (select 1 from pg_type where typname = 'revision_status') then
    create type public.revision_status as enum ('active', 'superseded');
  end if;

  if not exists (select 1 from pg_type where typname = 'execution_status') then
    create type public.execution_status as enum (
      'not_started', 'completed', 'skipped'
    );
  end if;
end;
$$;

-- ===========================================================================
-- 2. Retiring what this domain replaces
-- ===========================================================================
--
-- The rebuild reuses the live project (dispositions §9), so on that database
-- `workout_sessions`, `workout_sections` and `exercises` already exist in
-- their previous shape. Creating them with IF NOT EXISTS would leave the old
-- tables standing — no blocks, no lineage, no discriminated targets, and the
-- previous RLS policies — and every acceptance criterion below would read as
-- satisfied by this file while being false in the database. So the replaced
-- tables are dropped and rebuilt, exactly as DATA-01b §2 did for `profiles`.
--
-- This is destructive, and deliberately so:
--   * All three are Replace with "rows not migrated" (dispositions §1),
--     grounded in the owner decision that personal rows are disposable.
--   * Replace takes effect after a recoverable snapshot. The snapshot is
--     `docs/backend/snapshot/2026-09-18T162821Z`, and the off-machine-backup
--     gate in docs/backend/live-inventory.md holds any push to the live
--     project until TASK-072. Authoring is not applying.
--   * On an empty project these statements find nothing and do nothing.
--
-- CASCADE drops the dependent *objects* — the old RLS policies, triggers, and
-- the foreign-key constraints `structure_results`, `exercise_set_logs` and
-- `saved_workouts` hold into these tables. It does not drop those tables:
-- they are Replace under DATA-01d and FAV-01 and are retired with their own
-- domains, which is the boundary this file stays inside.

-- The old-client read convenience over `exercises` (dispositions §2, Retire).
drop view if exists public.exercises_with_context;

drop table if exists public.exercises         cascade;
drop table if exists public.workout_sections  cascade;
drop table if exists public.workout_sessions  cascade;

-- This domain's persistence boundary. It is Replace (dispositions §3) and is
-- re-authored against blocks and prescriptions by GEN-01, not here — but it
-- writes the three tables just dropped, so leaving it behind would leave a
-- callable function that cannot work. Dropped by catalogue lookup because the
-- previous migrations left four overloads of it (00018, 00021, 00023, 00025)
-- and naming signatures would miss whichever one is actually present.
do $$
declare
  overload record;
begin
  for overload in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'save_generated_workout'
  loop
    execute format('drop function if exists %s', overload.signature);
  end loop;
end;
$$;

-- Both types are now unreferenced: `section_status` existed only on
-- `workout_sections` and `rest_day_reason` only on `workout_sessions`.
-- `section_status` is Replace — section completion is derived, not stored
-- (§4) — and `rest_day_reason` is Retire (dispositions §5). `anchor_type` is not
-- dropped here despite `workout_sessions.anchor` going with the table:
-- `saved_workouts.anchor` still uses it, and that table belongs to FAV-01.
drop type if exists public.section_status;
drop type if exists public.rest_day_reason;

-- ===========================================================================
-- 3. workout_sessions
-- ===========================================================================
--
-- One row per generated workout. It is written after a successful generation,
-- which is why `prompt_version` and `contract_version` can be NOT NULL: a
-- session that exists was produced by a known prompt against a known contract,
-- and a stored workout whose contract version is unknown is unreconstructable.
--
-- Deliberately absent:
--   * `duration_mins`. It meant four different things depending on who read it
--     (DATA_MODEL §11); it is four columns below.
--   * `anchor anchor_type`. Three concepts in one enum; the session-level one
--     is `session_focus` (DATA-01a).
--   * `is_rest_day` / `rest_day_reason`. Not an omission by accident: every
--     generation input below is NOT NULL, so a rest day cannot be a row in
--     this table at all. `rest_day_reason` is dispositioned Retire, and where
--     a rest day is recorded is a product question this requirement does not
--     answer — recorded as a finding rather than guessed at here.
--   * the six streak columns' session-side mirror. Streak is derived from
--     these rows (DATA_MODEL §5).

create table if not exists public.workout_sessions (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  -- Null when the location was deleted after the fact. The workout stays; what
  -- it was composed against is simply no longer known, which is the truth.
  location_id uuid references public.locations (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The training day. Not unique per user: migration 00015 removed that
  -- constraint from the previous schema on purpose, and two workouts in one
  -- day is a thing people do.
  date date not null,

  -- Composition output the user reads (generation contract §5).
  title    text not null,
  overview text,

  session_focus public.session_focus not null,

  -- Snapshotted at generation time. The user's current goal is a preference
  -- and can change; what this workout was composed for cannot.
  goal_preset public.goal_preset,

  -- ── the four durations (DATA_MODEL §6) ──
  -- One name per meaning. `requested` is what the user asked for, `effective
  -- target` is what generation aimed at after clamps, `computed` is what
  -- GEN-06 calculated from the composed structure, `actual` is what elapsed.
  -- Storing `computed` is what makes the after-the-fact comparison against
  -- Claude's own estimate possible, which is how you find out whether the
  -- model understands the time cost of what it composed.
  requested_duration_mins        int not null,
  effective_duration_target_mins int not null,
  computed_duration_mins         int,
  actual_duration_mins           int,

  -- Same shape for intensity: asked for, targeted, and why they differ.
  requested_intensity int  not null,
  effective_intensity int  not null,
  adjustment_reason   text,

  -- Free text the user gave generation ("shoulder feels tight today"). Context
  -- only; a deterministic exclusion is a `user_constraints` row (DATA-05).
  generation_notes text,

  -- ── provenance ──
  prompt_version   text not null,
  contract_version text not null,

  -- ── lifecycle ──
  -- `started_at` is load-bearing, not bookkeeping: "as intended at start"
  -- (DATA_MODEL §7) is a temporal query against this timestamp, and without it
  -- the three reconstructions collapse into two.
  started_at   timestamptz,
  completed_at timestamptz,

  -- ── post-workout ──
  mood              smallint,
  session_notes     text,
  counts_for_streak boolean not null default true,

  constraint workout_sessions_title_not_blank
    check (btrim(title) <> ''),

  constraint workout_sessions_requested_intensity_range
    check (requested_intensity between 1 and 10),
  constraint workout_sessions_effective_intensity_range
    check (effective_intensity between 1 and 10),

  -- `mood` was TEXT holding an emoji for a 1–5 rating (DATA_MODEL §11). NULL
  -- is "not asked yet", which is not 3.
  constraint workout_sessions_mood_range
    check (mood is null or mood between 1 and 5),

  constraint workout_sessions_durations_sane check (
    requested_duration_mins > 0
    and effective_duration_target_mins > 0
    and (computed_duration_mins is null or computed_duration_mins > 0)
    and (actual_duration_mins is null or actual_duration_mins >= 0)),

  -- A workout cannot finish before it starts, and cannot finish without having
  -- started. The second half is what keeps `started_at` usable as the pivot of
  -- the intended-at-start query.
  constraint workout_sessions_completed_after_started check (
    completed_at is null
    or (started_at is not null and completed_at >= started_at))
);

comment on table public.workout_sessions is
  'One generated workout. Rest days are not rows here — every generation '
  'input is NOT NULL. Streak is derived from these rows, never stored.';

comment on column public.workout_sessions.computed_duration_mins is
  'What GEN-06 calculated from the composed blocks. Kept so Claude''s own '
  'estimate can be compared against it after the fact.';

comment on column public.workout_sessions.started_at is
  'The pivot of the "as intended at start" reconstruction (DATA_MODEL §7), '
  'not display metadata.';

-- The history list, and the streak derivation behind it.
create index if not exists workout_sessions_user_date_idx
  on public.workout_sessions (user_id, date desc);

-- "Resume incomplete session" on Home (IA §Home) reads exactly this.
create index if not exists workout_sessions_incomplete_idx
  on public.workout_sessions (user_id, created_at desc)
  where completed_at is null;

drop trigger if exists workout_sessions_set_updated_at on public.workout_sessions;
create trigger workout_sessions_set_updated_at
  before update on public.workout_sessions
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- 4. workout_sections
-- ===========================================================================
--
-- The named parts of a workout, in order. A section holds blocks, not
-- exercises — that indirection is the whole point of §5.
--
-- Deliberately absent:
--   * `UNIQUE (session_id, section_type)`. The previous schema had it and
--     migration 00022 dropped it; two accessory sections is a legitimate
--     composition, and recreating the constraint would re-break what was
--     already fixed once.
--   * `status section_status`. Dispositioned Replace: section completion is
--     derivable from its blocks' results and its exercises' execution status,
--     and a stored copy is one more thing that can disagree with them.

create table if not exists public.workout_sections (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null
    references public.workout_sessions (id) on delete cascade,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  section_type public.section_type not null,
  order_index  int not null,

  -- Composition names the section ("Prepare", "Primary"); `section_type` is
  -- what the code switches on.
  section_title text not null,
  section_notes text,

  constraint workout_sections_title_not_blank check (btrim(section_title) <> ''),
  constraint workout_sections_order_index_non_negative check (order_index >= 0),
  constraint workout_sections_order_unique unique (session_id, order_index)
);

comment on table public.workout_sections is
  'Ordered parts of a session. Contains blocks, never exercises directly.';

create index if not exists workout_sections_session_idx
  on public.workout_sections (session_id);

drop trigger if exists workout_sections_set_updated_at on public.workout_sections;
create trigger workout_sections_set_updated_at
  before update on public.workout_sections
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- 5. workout_blocks — the normalization fix
-- ===========================================================================
--
-- Every exercise belongs to a block. A `standard` block groups exercises
-- performed independently in sequence — the ordinary accessory section is one
-- standard block with four exercises — and a non-standard block groups
-- exercises performed together according to its structure.
--
-- This also fixes an inherited defect: `structure_results` was keyed to
-- `section_id`, so a conditioning section holding an EMOM *and* an AMRAP could
-- record only one of them. Results attach to blocks in DATA-01d.

create table if not exists public.workout_blocks (
  id         uuid primary key default gen_random_uuid(),
  section_id uuid not null
    references public.workout_sections (id) on delete cascade,

  created_at timestamptz not null default now(),

  order_index int not null,

  -- ── every structure attribute, and they live only here ──
  structure_type     public.structure_type  not null,
  rounds             int,                   -- fixed rounds; null when open-ended
  timer_type         public.timer_contract  not null default 'none',
  timer_seconds      int,                   -- duration or cap
  round_rest_seconds int,
  rep_scheme         public.rep_scheme      not null default 'fixed',
  block_notes        text,

  -- The structure's own rules, enforced by the database rather than by
  -- whichever caller happens to be writing. Generation validation checks 6 and
  -- 8 (generation contract §6) mirror these, so a workout that validates at
  -- the boundary is a workout that can be persisted — failing at the boundary
  -- beats failing at the INSERT, and failing at the INSERT beats storing a
  -- structure nothing can render.
  constraint timed_structures_have_a_clock check (
    structure_type not in ('emom', 'amrap', 'for_time')
    or timer_seconds is not null),

  constraint fixed_round_structures_have_rounds check (
    structure_type <> 'circuit' or rounds is not null),

  constraint workout_blocks_rounds_positive
    check (rounds is null or rounds > 0),
  constraint workout_blocks_timer_seconds_positive
    check (timer_seconds is null or timer_seconds > 0),
  constraint workout_blocks_round_rest_non_negative
    check (round_rest_seconds is null or round_rest_seconds >= 0),
  constraint workout_blocks_order_index_non_negative check (order_index >= 0),

  constraint workout_blocks_order_unique unique (section_id, order_index)
);

comment on table public.workout_blocks is
  'The structure level. Owns structure_type, rounds, timer, round rest and '
  'rep scheme, so members of a circuit cannot disagree about the clock.';

comment on constraint timed_structures_have_a_clock on public.workout_blocks is
  'EMOM, AMRAP and For Time are defined by their clock; without '
  'timer_seconds there is nothing to run and nothing to score against.';

comment on constraint fixed_round_structures_have_rounds on public.workout_blocks is
  'A circuit is a fixed number of rounds. DATA_MODEL §9 computes a superset''s '
  'duration from rounds as well, but the spec constrains circuit alone and '
  'this constraint follows the spec — recorded as a finding, not widened here.';

create index if not exists workout_blocks_section_idx
  on public.workout_blocks (section_id);

-- ===========================================================================
-- 6. workout_exercises
-- ===========================================================================
--
-- One prescribed exercise inside a block. Replaces `exercises`, which held
-- prescribed instances under a name that read like the catalog.
--
-- Deliberately absent, and this is the acceptance criterion rather than tidying:
-- no timer, no round count, no structure type, no rep scheme. Those are block
-- columns. An exercise carrying its own copy is how three members of a circuit
-- came to disagree about the clock in the first place.
--
-- Also absent: `reps` TEXT (one column holding four data types — replaced by
-- `modality` plus discriminated targets), `weight_logged` TEXT (superseded by
-- set logs), `coaching_cues` TEXT[] (hydrated from the catalog; a copy here
-- goes stale), `effort_percent` (folded into `load_type` + `load_value`).

create table if not exists public.workout_exercises (
  id       uuid primary key default gen_random_uuid(),
  block_id uuid not null
    references public.workout_blocks (id) on delete cascade,

  -- The catalog row this prescribes. Restrict, not cascade: a catalog entry
  -- cannot be removed out from under a workout that was performed against it.
  exercise_id text not null
    references public.exercise_definitions (id),

  order_index int not null,

  -- ── prescription: what THIS exercise asks for, per round or per set ──
  modality        public.prescription_modality not null,
  sets            int,            -- null inside open-ended blocks
  target_kind     public.target_kind not null,
  target_value    int,            -- fixed
  target_min      int,            -- range
  target_max      int,            -- range
  target_sequence int[],          -- sequence: ordered ladder/pyramid rungs
  per_side        boolean not null default false,
  distance_unit   public.distance_unit,
  rest_seconds    int,            -- between this exercise's own sets
  tempo           text,           -- display only; never parsed

  load_type  public.load_guidance,
  load_value numeric,

  -- Which of the catalog's equipment options this instance was composed for.
  equipment_used       text not null,
  is_interval_exercise boolean not null default false,

  -- ── lineage (defect D6) ──
  -- A swap inserts; nothing mutates a row into a different exercise. The new
  -- row carries the same `slot_id`, points at its predecessor through
  -- `replaces_id`, and the old row is marked superseded with a timestamp.
  slot_id       uuid not null,
  replaces_id   uuid references public.workout_exercises (id),
  origin        public.prescription_origin not null default 'generated',
  created_at    timestamptz not null default now(),
  superseded_at timestamptz,

  -- ── two independent statuses ──
  revision_status  public.revision_status  not null default 'active',
  execution_status public.execution_status not null default 'not_started',

  exercise_notes text,

  -- The discriminator doing its work. Exactly the fields the kind names are
  -- populated and no others, so `{8,10}` as a range and `{8,10}` as a two-rung
  -- sequence are different rows that cannot be confused, and a malformed
  -- combination is refused by the database rather than stored and mis-rendered.
  constraint target_shape check (
    (target_kind = 'fixed'
       and target_value is not null
       and target_min is null and target_max is null
       and target_sequence is null) or
    (target_kind = 'range'
       and target_min is not null and target_max is not null
       and target_max > target_min
       and target_value is null and target_sequence is null) or
    (target_kind = 'sequence'
       and target_sequence is not null
       and array_length(target_sequence, 1) > 1
       and target_value is null
       and target_min is null and target_max is null)),

  constraint distance_has_unit check (
    modality <> 'distance' or distance_unit is not null),

  constraint load_value_matches_type check (
    load_type in ('bodyweight', 'prior_session', 'none')
    or load_value is not null),

  -- Superseded and "when" are one fact. A superseded row with no timestamp
  -- cannot be placed on the timeline, which is what intended-at-start reads.
  constraint superseded_has_timestamp check (
    (revision_status = 'active'     and superseded_at is null) or
    (revision_status = 'superseded' and superseded_at is not null)),

  -- Lineage is a chain, never a tree: two rows claiming the same predecessor
  -- would make "what replaced this" ambiguous.
  constraint one_successor unique (replaces_id),

  -- A row cannot replace itself.
  constraint workout_exercises_no_self_replacement
    check (replaces_id is null or replaces_id <> id),

  -- `generated` is composition's output and replaces nothing; a row that
  -- replaces something was a revision.
  constraint workout_exercises_revision_has_predecessor check (
    (origin = 'generated' and replaces_id is null) or origin = 'revised'),

  constraint workout_exercises_sets_positive check (sets is null or sets > 0),
  constraint workout_exercises_rest_non_negative
    check (rest_seconds is null or rest_seconds >= 0),
  constraint workout_exercises_equipment_not_blank
    check (btrim(equipment_used) <> ''),
  constraint workout_exercises_order_index_non_negative check (order_index >= 0)
);

comment on table public.workout_exercises is
  'A prescribed exercise inside a block. Carries no timer, rounds, structure '
  'type or rep scheme — those belong to the block. Rows are immutable under '
  'append-and-supersede, which is why set logs can join back to the exact '
  'prescription they were performed against (defect D6).';

comment on column public.workout_exercises.slot_id is
  'Stable across every revision of the same slot, so "what filled this slot '
  'over time" is a one-column query rather than a recursive walk.';

comment on constraint target_shape on public.workout_exercises is
  'Exactly the fields target_kind names, and no others. {8,10} as a range and '
  '{8,10} as a two-rung sequence stay distinguishable.';

-- The read every rendering path makes: this block's current exercises.
create index if not exists workout_exercises_block_revision_idx
  on public.workout_exercises (block_id, revision_status);

-- The slot's history, in the order it happened.
create index if not exists workout_exercises_slot_idx
  on public.workout_exercises (slot_id, created_at);

-- OVR's per-exercise history read.
create index if not exists workout_exercises_exercise_idx
  on public.workout_exercises (exercise_id);

-- Ordering is unique among *active* rows only. A plain UNIQUE (block_id,
-- order_index) would make a swap impossible: the superseded row and the row
-- that replaced it occupy the same position in the block, which is the point.
create unique index if not exists workout_exercises_active_order_idx
  on public.workout_exercises (block_id, order_index)
  where revision_status = 'active';

-- One active row per slot. The other half of the same invariant: a slot's
-- history may be long, but only one entry in it is the current prescription.
create unique index if not exists workout_exercises_one_active_per_slot_idx
  on public.workout_exercises (slot_id)
  where revision_status = 'active';

-- ===========================================================================
-- 7. Row-level security — owner-only, inherited down the tree
-- ===========================================================================
--
-- Same posture and the same two independent mechanisms as DATA-01b §7: RLS
-- policies scoped `TO authenticated` with owner predicates on both USING and
-- WITH CHECK, plus table privileges revoked from anon entirely.
--
-- Only `workout_sessions` stores the owner. Everything below it walks up to
-- the session rather than carrying a denormalized `user_id` that could
-- disagree with the parent it hangs from — a copy is a second answer to the
-- question of who owns this row, and two answers is one too many. Every hop is
-- a primary-key lookup, and each parent has its own owner policy, so a caller
-- cannot even see the block they would need to attach an exercise to someone
-- else's workout.
--
-- `auth.uid()` is wrapped in a scalar subquery throughout so the planner
-- evaluates it once per statement rather than once per row (migration 00019).

alter table public.workout_sessions  enable row level security;
alter table public.workout_sections  enable row level security;
alter table public.workout_blocks    enable row level security;
alter table public.workout_exercises enable row level security;

-- --- workout_sessions -------------------------------------------------------

drop policy if exists workout_sessions_select_own on public.workout_sessions;
create policy workout_sessions_select_own on public.workout_sessions
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists workout_sessions_insert_own on public.workout_sessions;
create policy workout_sessions_insert_own on public.workout_sessions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists workout_sessions_update_own on public.workout_sessions;
create policy workout_sessions_update_own on public.workout_sessions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists workout_sessions_delete_own on public.workout_sessions;
create policy workout_sessions_delete_own on public.workout_sessions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- --- workout_sections -------------------------------------------------------

drop policy if exists workout_sections_select_own on public.workout_sections;
create policy workout_sections_select_own on public.workout_sections
  for select to authenticated
  using (
    exists (
      select 1 from public.workout_sessions s
      where s.id = workout_sections.session_id
        and s.user_id = (select auth.uid())
    )
  );

drop policy if exists workout_sections_insert_own on public.workout_sections;
create policy workout_sections_insert_own on public.workout_sections
  for insert to authenticated
  with check (
    exists (
      select 1 from public.workout_sessions s
      where s.id = workout_sections.session_id
        and s.user_id = (select auth.uid())
    )
  );

drop policy if exists workout_sections_update_own on public.workout_sections;
create policy workout_sections_update_own on public.workout_sections
  for update to authenticated
  using (
    exists (
      select 1 from public.workout_sessions s
      where s.id = workout_sections.session_id
        and s.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.workout_sessions s
      where s.id = workout_sections.session_id
        and s.user_id = (select auth.uid())
    )
  );

drop policy if exists workout_sections_delete_own on public.workout_sections;
create policy workout_sections_delete_own on public.workout_sections
  for delete to authenticated
  using (
    exists (
      select 1 from public.workout_sessions s
      where s.id = workout_sections.session_id
        and s.user_id = (select auth.uid())
    )
  );

-- --- workout_blocks ---------------------------------------------------------

drop policy if exists workout_blocks_select_own on public.workout_blocks;
create policy workout_blocks_select_own on public.workout_blocks
  for select to authenticated
  using (
    exists (
      select 1
      from public.workout_sections sec
      join public.workout_sessions s on s.id = sec.session_id
      where sec.id = workout_blocks.section_id
        and s.user_id = (select auth.uid())
    )
  );

drop policy if exists workout_blocks_insert_own on public.workout_blocks;
create policy workout_blocks_insert_own on public.workout_blocks
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.workout_sections sec
      join public.workout_sessions s on s.id = sec.session_id
      where sec.id = workout_blocks.section_id
        and s.user_id = (select auth.uid())
    )
  );

drop policy if exists workout_blocks_update_own on public.workout_blocks;
create policy workout_blocks_update_own on public.workout_blocks
  for update to authenticated
  using (
    exists (
      select 1
      from public.workout_sections sec
      join public.workout_sessions s on s.id = sec.session_id
      where sec.id = workout_blocks.section_id
        and s.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.workout_sections sec
      join public.workout_sessions s on s.id = sec.session_id
      where sec.id = workout_blocks.section_id
        and s.user_id = (select auth.uid())
    )
  );

drop policy if exists workout_blocks_delete_own on public.workout_blocks;
create policy workout_blocks_delete_own on public.workout_blocks
  for delete to authenticated
  using (
    exists (
      select 1
      from public.workout_sections sec
      join public.workout_sessions s on s.id = sec.session_id
      where sec.id = workout_blocks.section_id
        and s.user_id = (select auth.uid())
    )
  );

-- --- workout_exercises ------------------------------------------------------
--
-- No DELETE policy and no DELETE grant, and that is the lineage requirement
-- expressed as a privilege. Supersede is an UPDATE of `revision_status` plus
-- an INSERT of the replacement; deleting the predecessor would break the chain
-- and orphan the set logs that point at it. Removing a whole workout still
-- works — it cascades from the session.

drop policy if exists workout_exercises_select_own on public.workout_exercises;
create policy workout_exercises_select_own on public.workout_exercises
  for select to authenticated
  using (
    exists (
      select 1
      from public.workout_blocks b
      join public.workout_sections sec on sec.id = b.section_id
      join public.workout_sessions s   on s.id = sec.session_id
      where b.id = workout_exercises.block_id
        and s.user_id = (select auth.uid())
    )
  );

drop policy if exists workout_exercises_insert_own on public.workout_exercises;
create policy workout_exercises_insert_own on public.workout_exercises
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.workout_blocks b
      join public.workout_sections sec on sec.id = b.section_id
      join public.workout_sessions s   on s.id = sec.session_id
      where b.id = workout_exercises.block_id
        and s.user_id = (select auth.uid())
    )
  );

drop policy if exists workout_exercises_update_own on public.workout_exercises;
create policy workout_exercises_update_own on public.workout_exercises
  for update to authenticated
  using (
    exists (
      select 1
      from public.workout_blocks b
      join public.workout_sections sec on sec.id = b.section_id
      join public.workout_sessions s   on s.id = sec.session_id
      where b.id = workout_exercises.block_id
        and s.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.workout_blocks b
      join public.workout_sections sec on sec.id = b.section_id
      join public.workout_sessions s   on s.id = sec.session_id
      where b.id = workout_exercises.block_id
        and s.user_id = (select auth.uid())
    )
  );

-- --- privileges -------------------------------------------------------------

revoke all on public.workout_sessions  from anon, authenticated;
revoke all on public.workout_sections  from anon, authenticated;
revoke all on public.workout_blocks    from anon, authenticated;
revoke all on public.workout_exercises from anon, authenticated;

grant select, insert, update, delete on public.workout_sessions to authenticated;
grant select, insert, update, delete on public.workout_sections to authenticated;
grant select, insert, update, delete on public.workout_blocks   to authenticated;
grant select, insert, update         on public.workout_exercises to authenticated;

grant all on public.workout_sessions  to service_role;
grant all on public.workout_sections  to service_role;
grant all on public.workout_blocks    to service_role;
grant all on public.workout_exercises to service_role;
