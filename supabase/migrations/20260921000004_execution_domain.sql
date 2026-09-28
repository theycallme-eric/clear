-- DATA-01d — Schema: execution domain (REQ-012, issue #11)
--
-- Spec: docs/specs/DATA_MODEL.md §8 (execution), §7 (the three states).
-- Disposition: docs/backend/dispositions.md §1 — `exercise_set_logs` is Replace
-- (same name, new shape), `structure_results` is Replace by `block_results`,
-- `get_last_set_data` is Replace. All three hold zero rows on the reused
-- project (docs/backend/capture/inventory-2026-09-18T162244Z.txt), so nothing
-- is migrated and nothing is lost.
--
-- Scope. The performed side, and only it: what was logged against a
-- prescription, what a block scored, and the view that reads the two together.
-- DATA-01c built the prescription side and deliberately stopped short of this
-- file; this file adds nothing to the prescription side except the referenced
-- key its own foreign key needs (§2).
--
-- The three things this migration exists for:
--
--   1. **Typed absence.** Null, zero and skipped are three different
--      observations and the schema keeps them three. No actual column has a
--      default, so silence can never be written as a measurement; every actual
--      column admits zero, so a failed attempt is storable; and "skipped" is
--      not in this table at all — it is `workout_exercises.execution_status`,
--      where a status belongs.
--
--   2. **Performed-row attribution.** The set log's foreign key does not point
--      at a `workout_exercises` row, it points at an *active* one. That is
--      defect D6 closed at the constraint rather than in a code path: a log
--      cannot be attached to a prescription that has already been swapped out.
--
--   3. **Block-keyed results.** `structure_results` was keyed to `section_id`,
--      so a conditioning section holding an EMOM *and* an AMRAP could record
--      only one of them. `block_results` is keyed to the block.
--
-- Two deliberate deviations from the spec's illustrative DDL, both strictly
-- stronger, both required by the acceptance criteria rather than invented here:
--
--   * `weight_unit` is NOT NULL. The spec writes it nullable with
--     `CHECK (weight IS NULL OR weight_unit IS NOT NULL)`; the requirement says
--     the unit is on **every** set-log row, stamped at write time. NOT NULL
--     says that and subsumes the CHECK. A profile default that changes then
--     cannot reinterpret a single historical row, including the ones with no
--     weight yet.
--   * `id` has no `DEFAULT gen_random_uuid()`. EXE-07 requires a
--     client-generated id, "not a server sequence", so a flush that retries is
--     idempotent by construction. A server-side default would let a caller
--     omit the id and silently lose that property on the retry that matters.
--
-- Idempotent on an empty project: re-running this file is a no-op, so a failed
-- push can be retried without hand-editing the migration history.

-- ===========================================================================
-- 1. Retiring what this domain replaces
-- ===========================================================================
--
-- DATA-01c dropped `exercises`, `workout_sections` and `workout_sessions` with
-- CASCADE, which removed the foreign-key constraints these two tables held
-- into them but left the tables themselves standing — deliberately, because
-- they are this domain's to retire. They are retired here.
--
-- This is destructive and, as in DATA-01b §2 and DATA-01c §2, deliberately so:
-- both are Replace with rows not migrated, both hold zero rows on the reused
-- project, and the off-machine-backup gate in docs/backend/live-inventory.md
-- holds any push to that project until TASK-072. Authoring is not applying.

drop table if exists public.structure_results cascade;
drop table if exists public.exercise_set_logs cascade;

-- The last-set prefill. Dispositioned Replace: the behaviour is retained and
-- re-authored for the new log shape by the requirement that consumes it
-- (OVR-01), not here. It reads the table just dropped, so leaving it behind
-- would leave a callable function that cannot work. Dropped by catalogue
-- lookup rather than by signature, for the same reason DATA-01c dropped
-- `save_generated_workout` that way: the previous project may hold more than
-- one overload and naming one would miss the others.
do $$
declare
  overload record;
begin
  for overload in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_last_set_data'
  loop
    execute format('drop function if exists %s', overload.signature);
  end loop;
end;
$$;

-- ===========================================================================
-- 2. The referenced key that makes attribution enforceable
-- ===========================================================================
--
-- A plain `REFERENCES workout_exercises (id)` would let a set log attach to
-- any prescription row, superseded ones included — which is exactly defect D6
-- wearing a foreign key. To make the database refuse it, the log references a
-- *composite* key: the row's id **and** its revision status. Postgres needs a
-- unique constraint over those two columns to point a foreign key at them, and
-- since `id` is already the primary key this constraint costs an index and
-- forbids nothing that was previously allowed.
--
-- It belongs to this migration rather than to DATA-01c because it exists only
-- to serve §3's foreign key. Guarded by catalogue lookup because
-- `ALTER TABLE ... ADD CONSTRAINT` has no `IF NOT EXISTS`.

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t      on t.oid = c.conrelid
    join pg_namespace n  on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'workout_exercises'
      and c.conname = 'workout_exercises_id_revision_key'
  ) then
    alter table public.workout_exercises
      add constraint workout_exercises_id_revision_key
      unique (id, revision_status);
  end if;
end;
$$;

comment on constraint workout_exercises_id_revision_key
  on public.workout_exercises is
  'Referenced by exercise_set_logs so a log can only be attached to a row '
  'that is active at the moment it is written (DATA_MODEL §7, defect D6).';

-- ===========================================================================
-- 3. exercise_set_logs
-- ===========================================================================
--
-- One row per set the user engaged with. Prescriptions carry reps, time and
-- distance (DATA-01c), so logs carry all three — a 400 m carry and a 40 s
-- plank are not reps, and a log that can only hold reps quietly discards what
-- they did.
--
-- Missing-data semantics (I3), which are the point of this table:
--
--   * **A row exists** → the user engaged with this set.
--   * **A null value** → not recorded. Never zero, never a skip.
--   * **Zero** → a real result. `actual_reps = 0` is a failed attempt, and it
--     is a different row from one where the field is null.
--   * **No row** → not recorded at that set number.
--   * **Skipped** → `workout_exercises.execution_status = 'skipped'`, one
--     level up. A skip is a property of the exercise, not of a set, and
--     storing it here would mean every set of a skipped exercise had to agree.
--
-- So: no actual column has a DEFAULT, every actual column's CHECK admits zero,
-- and no column in this table can hold the word "skipped". Nothing here needs
-- a comment to say which of the three a row means.
--
-- Deliberately absent:
--   * `reps_prescribed`. Prescription rows are immutable under
--     append-and-supersede, so a log joins back to the exact prescription it
--     was performed against (DATA_MODEL §11). The snapshot was redundant, and
--     it never worked for time or distance anyway.
--   * a modality discriminator. Which actual columns *should* be populated
--     follows from `workout_exercises.modality`, one join away, and a copy
--     here is a second answer to that question. A CHECK cannot read another
--     table, and a reps-prescribed set whose duration the user also recorded
--     is a legitimate row, not a malformed one — this is recorded as a
--     decision, not an oversight.

create table if not exists public.exercise_set_logs (
  -- Client-generated, and the absence of a default is what makes that true.
  -- EXE-07 writes the set to a durable local queue and flushes it later,
  -- possibly twice; the id is minted where the set happened, so the second
  -- flush collides with the first instead of creating a phantom set.
  id uuid primary key,

  workout_exercise_id uuid not null,

  -- Not client-settable — see the column grants in §6. It carries the default
  -- on every insert, so the composite foreign key below can only resolve
  -- against a prescription that is active *now*, and it is cascaded forward
  -- if that prescription is superseded later.
  prescription_revision_status public.revision_status not null default 'active',

  set_number int not null,

  -- ── what was performed; null means not recorded ──
  actual_reps             int,
  actual_duration_seconds int,
  actual_distance         numeric,
  actual_distance_unit    public.distance_unit,
  weight                  numeric,

  -- Stamped per row at write time, never inherited from the profile. A
  -- default that changes must not silently reinterpret history: that is an
  -- injury path, not a display bug.
  weight_unit public.weight_unit not null,

  rpe numeric(3, 1),

  is_warmup_set boolean not null default false,
  created_at    timestamptz not null default now(),

  -- The log points at the exercise actually performed, and at an *active*
  -- one. ON UPDATE CASCADE is what keeps that honest afterwards: superseding a
  -- prescription the user already logged against is allowed — DATA_MODEL §7
  -- requires it, since a superseded row keeps its own execution status — and
  -- the cascade moves this column to 'superseded' with it. The log stays
  -- attached to the row it was performed against; what changes is only this
  -- row's record of that prescription's current standing.
  constraint exercise_set_logs_performed_prescription_fkey
    foreign key (workout_exercise_id, prescription_revision_status)
    references public.workout_exercises (id, revision_status)
    on update cascade
    on delete cascade,

  -- A second, independent guarantee of the same idempotency: even a retry that
  -- somehow mints a fresh id cannot produce two rows for set 3.
  constraint exercise_set_logs_set_number_unique
    unique (workout_exercise_id, set_number),

  constraint exercise_set_logs_set_number_positive check (set_number > 0),

  -- Every one of these admits zero and rejects the impossible. Zero reps is a
  -- failed attempt; zero seconds and zero distance are results a user can
  -- produce; a negative anything is not.
  constraint exercise_set_logs_reps_non_negative
    check (actual_reps is null or actual_reps >= 0),
  constraint exercise_set_logs_duration_non_negative
    check (actual_duration_seconds is null or actual_duration_seconds >= 0),
  constraint exercise_set_logs_distance_non_negative
    check (actual_distance is null or actual_distance >= 0),
  constraint exercise_set_logs_weight_non_negative
    check (weight is null or weight >= 0),

  -- A distance without its unit is a number, not a measurement. `weight_unit`
  -- needs no equivalent because it is NOT NULL.
  constraint distance_has_unit
    check (actual_distance is null or actual_distance_unit is not null),

  constraint exercise_set_logs_rpe_range
    check (rpe is null or rpe between 1 and 10)
);

comment on table public.exercise_set_logs is
  'One set the user engaged with. A null actual means not recorded — never '
  'zero, never skipped; zero is a measurement and skipped is '
  'workout_exercises.execution_status.';

comment on column public.exercise_set_logs.id is
  'Client-generated, with no server default, so EXE-07''s retried flush '
  'collides with the first write instead of duplicating the set.';

comment on column public.exercise_set_logs.prescription_revision_status is
  'Half of the composite foreign key that refuses a superseded prescription '
  'at insert. Not client-settable; cascaded if the prescription is later '
  'superseded.';

comment on column public.exercise_set_logs.weight_unit is
  'Stamped per row at write time. The profile default is a default, never a '
  'retroactive reinterpretation of what was lifted.';

comment on constraint exercise_set_logs_performed_prescription_fkey
  on public.exercise_set_logs is
  'Defect D6: a set log names the exercise actually performed, and cannot be '
  'attached to a prescription that was already swapped out.';

-- Reading a session's logs back in set order needs no index of its own:
-- `exercise_set_logs_set_number_unique` is already exactly that index, and the
-- composite foreign key's lookups use its leading column.
--
-- OVR's history read and EXE-07's reconciliation order by when it happened
-- rather than by set number, which that index cannot serve.
create index if not exists exercise_set_logs_created_idx
  on public.exercise_set_logs (workout_exercise_id, created_at desc);

-- ===========================================================================
-- 4. block_results — replaces structure_results
-- ===========================================================================
--
-- One row per block that produced an outcome. Keyed to the **block**, which is
-- the whole reason the block level exists on the results side: a conditioning
-- section holding an EMOM and an AMRAP records both, where `structure_results`
-- keyed to `section_id` could record one and silently drop the other.
--
-- Every timed outcome the structures can produce has its own column, because
-- "8 rounds + 3 reps" and "8 minutes" are not the same number wearing
-- different labels. The timer contracts map onto them directly (DATA_MODEL
-- §8): count-up and For Time write `elapsed_seconds` and
-- `completed_under_cap`; countdown and AMRAP write `rounds_completed` and
-- `partial_round_reps`; EMOM writes `minutes_completed`; a ladder writes
-- `highest_rung`.
--
-- Typed absence again, and it is why there is no constraint here pairing one
-- outcome column with another. "They beat the cap but the elapsed time was
-- never recorded" is a real state under I3, and a CHECK requiring
-- `elapsed_seconds` alongside `completed_under_cap` would make the schema
-- refuse to store the truth. The constraints below bound values; they do not
-- invent rules about which absences are allowed.

create table if not exists public.block_results (
  id       uuid primary key default gen_random_uuid(),
  block_id uuid not null unique
    references public.workout_blocks (id) on delete cascade,

  -- ── count-up / For Time ──
  elapsed_seconds     int,
  completed_under_cap boolean,

  -- ── AMRAP / circuit ──
  rounds_completed   int,
  partial_round_reps int,

  -- ── EMOM ──
  minutes_completed int,

  -- ── ladder ──
  highest_rung int,

  -- Retained because EXE-04 captures section RPE at completion: the collection
  -- point exists in the spec, so this is not speculative storage.
  perceived_effort smallint,

  notes      text,
  created_at timestamptz not null default now(),

  constraint block_results_perceived_effort_range
    check (perceived_effort is null or perceived_effort between 1 and 10),

  -- Zero is a result everywhere here too: zero rounds completed in an AMRAP is
  -- a hard, informative outcome.
  constraint block_results_elapsed_non_negative
    check (elapsed_seconds is null or elapsed_seconds >= 0),
  constraint block_results_rounds_non_negative
    check (rounds_completed is null or rounds_completed >= 0),
  constraint block_results_partial_reps_non_negative
    check (partial_round_reps is null or partial_round_reps >= 0),
  constraint block_results_minutes_non_negative
    check (minutes_completed is null or minutes_completed >= 0),
  constraint block_results_highest_rung_non_negative
    check (highest_rung is null or highest_rung >= 0)
);

comment on table public.block_results is
  'One outcome per block, not per section — a conditioning section holding an '
  'EMOM and an AMRAP records both. Replaces structure_results.';

comment on column public.block_results.perceived_effort is
  'Section RPE, captured at completion by EXE-04.';

-- No index is declared here: `UNIQUE (block_id)` is the only access path this
-- table has, and it already has one.

-- ===========================================================================
-- 5. session_performed — "as performed" is a view, not a join
-- ===========================================================================
--
-- Set logs alone miss three things: skipped exercises, block outcomes, and
-- completed exercises with only some fields filled in. Each of those is an
-- observation, and a reconstruction that infers them from the absence of rows
-- is a reconstruction that cannot tell "skipped" from "not logged yet" —
-- which is the distinction this whole domain exists to keep.
--
-- So every active exercise appears whether or not it has logs. A skipped one
-- appears with `execution_status = 'skipped'` and an empty array: visible,
-- not inferred.
--
-- `security_invoker` so the policies in §6 are what decides a read, rather
-- than the view running with its owner's rights and handing one user another
-- user's workout.

-- Dropped first rather than replaced: `CREATE OR REPLACE VIEW` refuses a
-- change to the column list, and a retried push must not depend on the view
-- having had exactly this shape last time.
drop view if exists public.session_performed;

create view public.session_performed
with (security_invoker = on) as
select
  s.id  as session_id,
  wb.id as block_id,
  wb.structure_type,
  wb.order_index as block_order,
  we.id as workout_exercise_id,
  we.slot_id,
  we.exercise_id,
  we.execution_status,
  we.origin,
  br.elapsed_seconds,
  br.completed_under_cap,
  br.rounds_completed,
  br.partial_round_reps,
  br.minutes_completed,
  br.highest_rung,
  br.perceived_effort,
  array(
    select to_jsonb(l)
    from public.exercise_set_logs l
    where l.workout_exercise_id = we.id
    order by l.set_number
  ) as set_logs
from public.workout_sessions s
join public.workout_sections  ws on ws.session_id = s.id
join public.workout_blocks    wb on wb.section_id = ws.id
join public.workout_exercises we on we.block_id   = wb.id
                                and we.revision_status = 'active'
left join public.block_results br on br.block_id = wb.id;

comment on view public.session_performed is
  'What actually happened: every active exercise, its logs, and its block''s '
  'outcome. A skipped exercise appears with an empty set_logs array rather '
  'than being absent (DATA_MODEL §8).';

-- ===========================================================================
-- 6. Row-level security — owner-only, inherited up to the session
-- ===========================================================================
--
-- Same posture and the same two independent mechanisms as DATA-01b §7 and
-- DATA-01c §7: policies scoped `TO authenticated` with owner predicates on
-- both USING and WITH CHECK, plus table privileges revoked from anon
-- entirely.
--
-- Neither table stores the owner. A log walks up through its exercise, its
-- block and its section to the session that does — a denormalized `user_id`
-- here would be a second answer to who owns this row, and each hop is a
-- primary-key lookup against a parent that has its own owner policy, so a
-- caller cannot even see the exercise they would need to name.
--
-- `auth.uid()` is wrapped in a scalar subquery throughout so the planner
-- evaluates it once per statement rather than once per row (migration 00019).

alter table public.exercise_set_logs enable row level security;
alter table public.block_results     enable row level security;

-- --- exercise_set_logs ------------------------------------------------------

drop policy if exists exercise_set_logs_select_own on public.exercise_set_logs;
create policy exercise_set_logs_select_own on public.exercise_set_logs
  for select to authenticated
  using (
    exists (
      select 1
      from public.workout_exercises we
      join public.workout_blocks   b   on b.id   = we.block_id
      join public.workout_sections sec on sec.id = b.section_id
      join public.workout_sessions s   on s.id   = sec.session_id
      where we.id = exercise_set_logs.workout_exercise_id
        and s.user_id = (select auth.uid())
    )
  );

drop policy if exists exercise_set_logs_insert_own on public.exercise_set_logs;
create policy exercise_set_logs_insert_own on public.exercise_set_logs
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.workout_exercises we
      join public.workout_blocks   b   on b.id   = we.block_id
      join public.workout_sections sec on sec.id = b.section_id
      join public.workout_sessions s   on s.id   = sec.session_id
      where we.id = exercise_set_logs.workout_exercise_id
        and s.user_id = (select auth.uid())
    )
  );

drop policy if exists exercise_set_logs_update_own on public.exercise_set_logs;
create policy exercise_set_logs_update_own on public.exercise_set_logs
  for update to authenticated
  using (
    exists (
      select 1
      from public.workout_exercises we
      join public.workout_blocks   b   on b.id   = we.block_id
      join public.workout_sections sec on sec.id = b.section_id
      join public.workout_sessions s   on s.id   = sec.session_id
      where we.id = exercise_set_logs.workout_exercise_id
        and s.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.workout_exercises we
      join public.workout_blocks   b   on b.id   = we.block_id
      join public.workout_sections sec on sec.id = b.section_id
      join public.workout_sessions s   on s.id   = sec.session_id
      where we.id = exercise_set_logs.workout_exercise_id
        and s.user_id = (select auth.uid())
    )
  );

-- A set entered by mistake is a set that was never performed, and the honest
-- correction is to remove the row rather than to zero it — zero is a
-- measurement. The previous project granted the same
-- (docs/backend/capture/inventory-2026-09-18T162244Z.txt).
drop policy if exists exercise_set_logs_delete_own on public.exercise_set_logs;
create policy exercise_set_logs_delete_own on public.exercise_set_logs
  for delete to authenticated
  using (
    exists (
      select 1
      from public.workout_exercises we
      join public.workout_blocks   b   on b.id   = we.block_id
      join public.workout_sections sec on sec.id = b.section_id
      join public.workout_sessions s   on s.id   = sec.session_id
      where we.id = exercise_set_logs.workout_exercise_id
        and s.user_id = (select auth.uid())
    )
  );

-- --- block_results ----------------------------------------------------------

drop policy if exists block_results_select_own on public.block_results;
create policy block_results_select_own on public.block_results
  for select to authenticated
  using (
    exists (
      select 1
      from public.workout_blocks   b
      join public.workout_sections sec on sec.id = b.section_id
      join public.workout_sessions s   on s.id   = sec.session_id
      where b.id = block_results.block_id
        and s.user_id = (select auth.uid())
    )
  );

drop policy if exists block_results_insert_own on public.block_results;
create policy block_results_insert_own on public.block_results
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.workout_blocks   b
      join public.workout_sections sec on sec.id = b.section_id
      join public.workout_sessions s   on s.id   = sec.session_id
      where b.id = block_results.block_id
        and s.user_id = (select auth.uid())
    )
  );

drop policy if exists block_results_update_own on public.block_results;
create policy block_results_update_own on public.block_results
  for update to authenticated
  using (
    exists (
      select 1
      from public.workout_blocks   b
      join public.workout_sections sec on sec.id = b.section_id
      join public.workout_sessions s   on s.id   = sec.session_id
      where b.id = block_results.block_id
        and s.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.workout_blocks   b
      join public.workout_sections sec on sec.id = b.section_id
      join public.workout_sessions s   on s.id   = sec.session_id
      where b.id = block_results.block_id
        and s.user_id = (select auth.uid())
    )
  );

drop policy if exists block_results_delete_own on public.block_results;
create policy block_results_delete_own on public.block_results
  for delete to authenticated
  using (
    exists (
      select 1
      from public.workout_blocks   b
      join public.workout_sections sec on sec.id = b.section_id
      join public.workout_sessions s   on s.id   = sec.session_id
      where b.id = block_results.block_id
        and s.user_id = (select auth.uid())
    )
  );

-- --- privileges -------------------------------------------------------------
--
-- `exercise_set_logs` is granted column by column, and the one column left out
-- is the requirement expressed as a privilege. `prescription_revision_status`
-- is not grantable to a caller, so it always takes its 'active' default on
-- insert, so the composite foreign key in §3 always resolves against an active
-- prescription. If the client could set it, it could name 'superseded' and the
-- foreign key would happily oblige — the column is what makes "impossible"
-- mean impossible rather than "unlikely".

revoke all on public.exercise_set_logs from anon, authenticated;
revoke all on public.block_results     from anon, authenticated;
revoke all on public.session_performed from anon, authenticated;

grant select on public.exercise_set_logs to authenticated;
grant insert (
  id, workout_exercise_id, set_number,
  actual_reps, actual_duration_seconds,
  actual_distance, actual_distance_unit,
  weight, weight_unit, rpe,
  is_warmup_set, created_at
) on public.exercise_set_logs to authenticated;
grant update (
  set_number,
  actual_reps, actual_duration_seconds,
  actual_distance, actual_distance_unit,
  weight, weight_unit, rpe,
  is_warmup_set
) on public.exercise_set_logs to authenticated;
grant delete on public.exercise_set_logs to authenticated;

grant select, insert, update, delete on public.block_results to authenticated;
grant select on public.session_performed to authenticated;

grant all on public.exercise_set_logs to service_role;
grant all on public.block_results     to service_role;
grant select on public.session_performed to service_role;
