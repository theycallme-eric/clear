-- SES-01a — Session lifecycle + atomic persistence (REQ-039, issue #40)
--
-- Spec: docs/specs/DATA_MODEL.md §7 (temporal lineage) and
-- docs/specs/generation/WORKED_EXAMPLE.md.
--
-- Scope. The verbs of a session, and nothing else: accept (persist the whole
-- composed structure, or persist none of it), start, complete, abandon, swap
-- one prescription for another, and read the one session that can be resumed.
-- DATA-01c and DATA-01d declared the tables these write; this file declares
-- what may legally happen to them and in what order.
--
-- Three things it exists for, each one an acceptance criterion:
--
--   1. **Acceptance is one transaction.** A session, its sections, its blocks
--      and every exercise in them are written by a single function call, so
--      "a failure leaves nothing behind" is the database's own guarantee
--      rather than a client's clean-up path. A function body is one statement
--      to the caller: an exception anywhere in it rolls back everything it had
--      written, including the session row itself.
--
--   2. **Exactly one active session per user, without a race.** The partial
--      unique index below is the invariant; `start_session` reads it first for
--      a decent answer and catches the unique violation for the concurrent
--      case, so a second start is a typed outcome either way and never a
--      Postgres error string crossing the boundary.
--
--   3. **Abandoning is a state, not a delete.** `abandoned_at` is the column
--      that makes that true. An abandoned session keeps its structure, its
--      logs and its lineage; what it loses is only its claim on being active.
--
-- Deliberately absent:
--
--   * A stored `status` column. State is `session_state(started_at,
--     completed_at, abandoned_at)` — derived, single-sourced, and incapable of
--     disagreeing with the timestamps it is derived from. The same reasoning
--     that kept `section_status` out of DATA-01c (a stored copy is one more
--     thing that can drift) applies with more force here, because the three
--     timestamps are load-bearing for §7's temporal queries anyway.
--   * The three reconstruction queries. "As generated", "as intended at start"
--     and "as performed" are SES-01b's, and `session_snapshot` below is not a
--     fourth one dressed up: it answers "what should the screen render now",
--     which is `revision_status = 'active'` plus the logs already written.
--   * Any policy about what a swap may do after `started_at`. DATA_MODEL §7
--     records that as unresolved, so `swap_session_exercise` refuses only on a
--     terminal session and lets the temporal query settle the rest.
--
-- Idempotent on an empty project, and on a project this has already been
-- pushed to: every object is `if not exists` or `create or replace`.

-- ===========================================================================
-- 1. session_state — the vocabulary, closed
-- ===========================================================================
--
-- A closed vocabulary is a type (DATA_MODEL §10), even when no column holds
-- it. The value is derived, but the *set* of values is a fact about the
-- lifecycle, and generating it into `Constants.public.Enums.session_state`
-- means the client machine (src/state/session-machine.ts) enumerates the same
-- four states rather than declaring a second list beside this one.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'session_state') then
    create type public.session_state as enum (
      'prescribed', 'active', 'completed', 'abandoned'
    );
  end if;
end
$$;

comment on type public.session_state is
  'The four states of a session. Derived from started_at, completed_at and '
  'abandoned_at — no column stores it, because a stored copy can disagree '
  'with the timestamps SES-01b reconstructs from.';

-- ===========================================================================
-- 2. abandoned_at — the state that is not a delete
-- ===========================================================================

alter table public.workout_sessions
  add column if not exists abandoned_at timestamptz;

comment on column public.workout_sessions.abandoned_at is
  'When the user gave up on this session. The row, its structure and its logs '
  'all survive: abandoning is a state, not a delete (REQ-039).';

do $$
begin
  -- A session cannot both finish and be given up on. Whichever happened
  -- first is what happened, and the other transition is refused above.
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t     on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'workout_sessions'
      and c.conname = 'workout_sessions_not_both_completed_and_abandoned'
  ) then
    alter table public.workout_sessions
      add constraint workout_sessions_not_both_completed_and_abandoned
      check (completed_at is null or abandoned_at is null);
  end if;

  -- Abandoning a session that was never started is legitimate — a generated
  -- workout the user walked away from — so there is no "after started_at"
  -- half here, unlike `workout_sessions_completed_after_started`.
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t     on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'workout_sessions'
      and c.conname = 'workout_sessions_abandoned_after_created'
  ) then
    alter table public.workout_sessions
      add constraint workout_sessions_abandoned_after_created
      check (abandoned_at is null or abandoned_at >= created_at);
  end if;
end
$$;

-- The invariant, not a hint: at most one session per user is started, not
-- finished and not abandoned. Two concurrent starts cannot both win, which is
-- what makes "starting a second is a typed error, not a race" true rather
-- than likely.
create unique index if not exists workout_sessions_one_active_idx
  on public.workout_sessions (user_id)
  where started_at is not null
    and completed_at is null
    and abandoned_at is null;

-- The resume read, and the incomplete-session index DATA-01c declared is no
-- longer enough for it: an abandoned session is incomplete forever.
create index if not exists workout_sessions_resumable_idx
  on public.workout_sessions (user_id, started_at desc)
  where completed_at is null
    and abandoned_at is null;

-- ===========================================================================
-- 3. session_state() — one derivation, used by everything
-- ===========================================================================
--
-- Takes the three timestamps rather than the row, so it is callable from a
-- SELECT list, from a trigger-free CHECK-style expression, and from PostgREST
-- — and so the generated types describe it as three arguments a client can
-- actually supply.

create or replace function public.session_state(
  p_started_at timestamptz,
  p_completed_at timestamptz,
  p_abandoned_at timestamptz
) returns public.session_state
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_abandoned_at is not null then 'abandoned'
    when p_completed_at is not null then 'completed'
    when p_started_at   is not null then 'active'
    else 'prescribed'
  end::public.session_state
$$;

comment on function public.session_state(timestamptz, timestamptz, timestamptz) is
  'The session state, derived. Abandoned outranks completed because the CHECK '
  'makes the pair impossible and a reader should never have to guess which.';

-- ===========================================================================
-- 4. insert_prescription() — one place a prescription becomes a row
-- ===========================================================================
--
-- Acceptance and a swap write the same twenty columns from the same contract
-- shape (generation contract §5), differing only in lineage: `generated` with
-- no predecessor, or `revised` pointing at one. Writing the column list twice
-- is how the two paths drift, and a swap that quietly dropped `per_side` would
-- be a prescription nobody could perform as written.
--
-- Discriminated targets are passed through as the contract sends them. The
-- `target_shape` CHECK is what decides whether they are coherent, so a
-- malformed target fails the INSERT — inside the caller's transaction, which
-- is what leaves nothing behind.

create or replace function public.insert_prescription(
  p_block_id uuid,
  p_order_index integer,
  p_slot_id uuid,
  p_replaces_id uuid,
  p_origin public.prescription_origin,
  p_prescription jsonb
) returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_sequence integer[] := null;
  v_id       uuid;
begin
  -- `target_sequence` is the one field whose JSON shape is not a scalar. An
  -- absent key and a JSON null are both "no sequence"; anything else is read
  -- as the ladder it is, in the order it was written.
  if jsonb_typeof(p_prescription -> 'target_sequence') = 'array' then
    select array_agg(entry::integer order by ordinality)
      into v_sequence
      from jsonb_array_elements_text(p_prescription -> 'target_sequence')
           with ordinality as elements (entry, ordinality);
  end if;

  insert into public.workout_exercises (
    block_id, exercise_id, order_index,
    modality, sets, target_kind,
    target_value, target_min, target_max, target_sequence,
    per_side, distance_unit, rest_seconds, tempo,
    load_type, load_value,
    equipment_used, is_interval_exercise,
    slot_id, replaces_id, origin
  ) values (
    p_block_id,
    p_prescription ->> 'exercise_id',
    p_order_index,
    (p_prescription ->> 'modality')::public.prescription_modality,
    (p_prescription ->> 'sets')::integer,
    (p_prescription ->> 'target_kind')::public.target_kind,
    (p_prescription ->> 'target_value')::integer,
    (p_prescription ->> 'target_min')::integer,
    (p_prescription ->> 'target_max')::integer,
    v_sequence,
    coalesce((p_prescription ->> 'per_side')::boolean, false),
    (p_prescription ->> 'distance_unit')::public.distance_unit,
    (p_prescription ->> 'rest_seconds')::integer,
    p_prescription ->> 'tempo',
    (p_prescription ->> 'load_type')::public.load_guidance,
    (p_prescription ->> 'load_value')::numeric,
    p_prescription ->> 'equipment',
    coalesce((p_prescription ->> 'is_interval_exercise')::boolean, false),
    p_slot_id,
    p_replaces_id,
    p_origin
  )
  returning id into v_id;

  return v_id;
end
$$;

comment on function public.insert_prescription(
  uuid, integer, uuid, uuid, public.prescription_origin, jsonb) is
  'The contract''s prescription shape as a workout_exercises row. Shared by '
  'acceptance and by a swap so the two cannot drift a column apart.';

-- ===========================================================================
-- 5. persist_session() — acceptance, in one transaction
-- ===========================================================================
--
-- The whole structure or none of it. Sections, blocks and exercises are
-- ordered by their position in the payload rather than by an index the model
-- supplies: order is a property of the array it sent, and a duplicated
-- `order_index` would otherwise be refused by a UNIQUE constraint halfway
-- through a workout that had already half-persisted.
--
-- The payload is CORE-03's `sessionAcceptanceSchema` — validated at the
-- boundary before it is sent, so everything checked here is a fact about the
-- *transport* (is there a workout at all) rather than a second validation
-- pass. Anything the schema missed is caught by a CHECK constraint, and both
-- failures abort the same transaction.
--
-- `user_id` is an argument rather than `auth.uid()` for symmetry with GEN-02a,
-- and it is not a way around RLS: `workout_sessions_insert_own` refuses a row
-- whose owner is not the caller, so passing somebody else's id fails the
-- INSERT instead of writing to their history.

create or replace function public.persist_session(
  p_user_id uuid,
  p_session jsonb
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_workout    jsonb := p_session -> 'workout';
  v_session_id uuid;
  v_section_id uuid;
  v_block_id   uuid;
  v_section    jsonb;
  v_block      jsonb;
  v_exercise   jsonb;
  v_section_index  integer := 0;
  v_block_index    integer;
  v_exercise_index integer;
begin
  if jsonb_typeof(v_workout -> 'sections') <> 'array' then
    raise exception 'persist_session: the payload carries no workout sections'
      using errcode = 'PT422';
  end if;

  insert into public.workout_sessions (
    user_id, location_id, date,
    title, overview, session_focus, goal_preset,
    requested_duration_mins, effective_duration_target_mins,
    computed_duration_mins,
    requested_intensity, effective_intensity, adjustment_reason,
    generation_notes, prompt_version, contract_version
  ) values (
    p_user_id,
    (p_session ->> 'location_id')::uuid,
    (p_session ->> 'date')::date,
    v_workout ->> 'title',
    v_workout ->> 'overview',
    (p_session ->> 'session_focus')::public.session_focus,
    (p_session ->> 'goal_preset')::public.goal_preset,
    (p_session ->> 'requested_duration_mins')::integer,
    (p_session ->> 'effective_duration_target_mins')::integer,
    (p_session ->> 'computed_duration_mins')::integer,
    (p_session ->> 'requested_intensity')::integer,
    (p_session ->> 'effective_intensity')::integer,
    p_session ->> 'adjustment_reason',
    p_session ->> 'generation_notes',
    p_session ->> 'prompt_version',
    p_session ->> 'contract_version'
  )
  returning id into v_session_id;

  for v_section in select value from jsonb_array_elements(v_workout -> 'sections')
  loop
    insert into public.workout_sections (
      session_id, section_type, order_index, section_title, section_notes
    ) values (
      v_session_id,
      (v_section ->> 'section_type')::public.section_type,
      v_section_index,
      v_section ->> 'section_title',
      v_section ->> 'section_notes'
    )
    returning id into v_section_id;

    v_block_index := 0;

    for v_block in select value from jsonb_array_elements(v_section -> 'blocks')
    loop
      insert into public.workout_blocks (
        section_id, order_index,
        structure_type, rounds, timer_type, timer_seconds,
        round_rest_seconds, rep_scheme, block_notes
      ) values (
        v_section_id,
        v_block_index,
        (v_block ->> 'structure_type')::public.structure_type,
        (v_block ->> 'rounds')::integer,
        coalesce((v_block ->> 'timer_type')::public.timer_contract, 'none'),
        (v_block ->> 'timer_seconds')::integer,
        (v_block ->> 'round_rest_seconds')::integer,
        coalesce((v_block ->> 'rep_scheme')::public.rep_scheme, 'fixed'),
        v_block ->> 'block_notes'
      )
      returning id into v_block_id;

      v_exercise_index := 0;

      for v_exercise in select value from jsonb_array_elements(v_block -> 'exercises')
      loop
        -- A fresh slot per prescription. The slot is what a later revision
        -- carries forward, so it is minted once, here, at acceptance.
        perform public.insert_prescription(
          v_block_id, v_exercise_index, gen_random_uuid(), null,
          'generated', v_exercise);

        v_exercise_index := v_exercise_index + 1;
      end loop;

      v_block_index := v_block_index + 1;
    end loop;

    v_section_index := v_section_index + 1;
  end loop;

  return public.session_snapshot(v_session_id);
end
$$;

comment on function public.persist_session(uuid, jsonb) is
  'Accepts a composed workout: session, sections, blocks and exercises in one '
  'transaction. A failure anywhere leaves nothing behind, including the '
  'session row (REQ-039).';

-- ===========================================================================
-- 6. session_snapshot() — what a screen renders now
-- ===========================================================================
--
-- One round trip for the whole of a session as it currently stands: the row,
-- its sections in order, their blocks in order, each block's *active*
-- prescriptions in order, and the sets already logged against each one. That
-- last part is what makes a hard refresh mid-workout survivable — the logs
-- come back with the structure rather than in a second request that can fail
-- on its own.
--
-- Superseded rows are absent on purpose. This is not a reconstruction (§7);
-- it is the present tense, and SES-01b owns the past.
--
-- Returns SQL NULL when there is no such session, which is also what RLS
-- answers for somebody else's: "not found" is the honest answer to both, and
-- it is the one that leaks nothing.

create or replace function public.session_snapshot(p_session_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'session', to_jsonb(s),
    'state', public.session_state(s.started_at, s.completed_at, s.abandoned_at),
    'sections', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'section', to_jsonb(sec),
          'blocks', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'block', to_jsonb(b),
                'exercises', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'exercise', to_jsonb(we),
                      'set_logs', coalesce((
                        select jsonb_agg(to_jsonb(l) order by l.set_number)
                        from public.exercise_set_logs l
                        where l.workout_exercise_id = we.id
                      ), '[]'::jsonb)
                    )
                    order by we.order_index
                  )
                  from public.workout_exercises we
                  where we.block_id = b.id
                    and we.revision_status = 'active'
                ), '[]'::jsonb)
              )
              order by b.order_index
            )
            from public.workout_blocks b
            where b.section_id = sec.id
          ), '[]'::jsonb)
        )
        order by sec.order_index
      )
      from public.workout_sections sec
      where sec.session_id = s.id
    ), '[]'::jsonb)
  )
  from public.workout_sessions s
  where s.id = p_session_id
$$;

comment on function public.session_snapshot(uuid) is
  'A session as it currently stands — structure, active prescriptions and the '
  'sets already logged — in one round trip, so a refresh mid-workout resumes '
  'from one read rather than three.';

-- ===========================================================================
-- 7. resume_session() — the one session that can be picked back up
-- ===========================================================================

create or replace function public.resume_session(p_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.session_snapshot(s.id)
  from public.workout_sessions s
  where s.user_id = p_user_id
    and s.started_at is not null
    and s.completed_at is null
    and s.abandoned_at is null
  -- The unique index makes this at most one row. The ORDER BY and LIMIT are
  -- what keeps that a fact about the answer rather than about the index: a
  -- resume must not become "arbitrary row" if the invariant is ever relaxed.
  order by s.started_at desc
  limit 1
$$;

comment on function public.resume_session(uuid) is
  'The user''s single resumable session, whole, or NULL. Abandoned sessions '
  'are not resumable — that is the point of abandoning one.';

-- ===========================================================================
-- 8. The transitions
-- ===========================================================================
--
-- Every one of them answers with an outcome rather than raising: `started`,
-- `completed`, `abandoned`, `swapped`, and the three refusals `not_found`,
-- `already_active` and `invalid_transition`. GEN-02a settled the reasoning and
-- it holds here — an exception crosses PostgREST as a 400 carrying a Postgres
-- message, and CORE-01's envelope cannot turn that back into a typed code.
-- A refusal is an expected answer, so it is a value.
--
-- `select … for update` is what makes each one a decision about a row nobody
-- else is changing underneath it, and RLS is what makes "somebody else's
-- session" indistinguishable from "no such session".

create or replace function public.start_session(p_session_id uuid)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_session public.workout_sessions;
  v_state   public.session_state;
  v_active  uuid;
begin
  select * into v_session
    from public.workout_sessions
    where id = p_session_id
    for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found', 'session', null);
  end if;

  v_state := public.session_state(
    v_session.started_at, v_session.completed_at, v_session.abandoned_at);

  if v_state <> 'prescribed' then
    return jsonb_build_object(
      'outcome', 'invalid_transition',
      'event', 'start',
      'state', v_state,
      'session', to_jsonb(v_session));
  end if;

  -- The courteous answer: name the session already running, because the only
  -- useful thing a caller can do is finish or abandon that one.
  select id into v_active
    from public.workout_sessions
    where user_id = v_session.user_id
      and started_at is not null
      and completed_at is null
      and abandoned_at is null
    limit 1;

  if v_active is not null then
    return jsonb_build_object(
      'outcome', 'already_active',
      'active_session_id', v_active,
      'session', to_jsonb(v_session));
  end if;

  -- And the correct one. Two callers can both pass the check above; only one
  -- of them can pass the unique index, and the loser gets the same typed
  -- outcome rather than a 409 with a constraint name in it.
  begin
    update public.workout_sessions
      set started_at = now()
      where id = p_session_id
      returning * into v_session;
  exception
    when unique_violation then
      select id into v_active
        from public.workout_sessions
        where user_id = v_session.user_id
          and started_at is not null
          and completed_at is null
          and abandoned_at is null
        limit 1;

      return jsonb_build_object(
        'outcome', 'already_active',
        'active_session_id', v_active,
        'session', to_jsonb(v_session));
  end;

  return jsonb_build_object(
    'outcome', 'started',
    'state', public.session_state(
      v_session.started_at, v_session.completed_at, v_session.abandoned_at),
    'session', to_jsonb(v_session));
end
$$;

comment on function public.start_session(uuid) is
  'prescribed → active, for the one session a user may have running. A second '
  'start is an outcome, not a race and not an exception (REQ-039).';

-- Completion writes both halves: `completed_at`, and how long it actually
-- took. The elapsed default is what the clock says; a caller that tracked
-- paused time supplies its own, because only the client knows the workout was
-- interrupted for twenty minutes.
create or replace function public.complete_session(
  p_session_id uuid,
  p_actual_duration_mins integer default null
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_session public.workout_sessions;
  v_state   public.session_state;
begin
  select * into v_session
    from public.workout_sessions
    where id = p_session_id
    for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found', 'session', null);
  end if;

  v_state := public.session_state(
    v_session.started_at, v_session.completed_at, v_session.abandoned_at);

  if v_state <> 'active' then
    return jsonb_build_object(
      'outcome', 'invalid_transition',
      'event', 'complete',
      'state', v_state,
      'session', to_jsonb(v_session));
  end if;

  update public.workout_sessions
    set completed_at = now(),
        actual_duration_mins = coalesce(
          p_actual_duration_mins,
          greatest(
            0,
            ceil(extract(epoch from (now() - v_session.started_at)) / 60)::integer))
    where id = p_session_id
    returning * into v_session;

  return jsonb_build_object(
    'outcome', 'completed',
    'state', public.session_state(
      v_session.started_at, v_session.completed_at, v_session.abandoned_at),
    'session', to_jsonb(v_session));
end
$$;

comment on function public.complete_session(uuid, integer) is
  'active → completed, writing completed_at and actual_duration_mins. The '
  'elapsed default is the clock; a caller that tracked pauses overrides it.';

-- Abandoning is legal from either non-terminal state: a generated workout the
-- user never started, and one they walked out of halfway. Nothing is deleted
-- and no log is touched — what the row loses is its claim on being the active
-- session, which is exactly what the partial unique index reads.
create or replace function public.abandon_session(p_session_id uuid)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_session public.workout_sessions;
  v_state   public.session_state;
begin
  select * into v_session
    from public.workout_sessions
    where id = p_session_id
    for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found', 'session', null);
  end if;

  v_state := public.session_state(
    v_session.started_at, v_session.completed_at, v_session.abandoned_at);

  if v_state not in ('prescribed', 'active') then
    return jsonb_build_object(
      'outcome', 'invalid_transition',
      'event', 'abandon',
      'state', v_state,
      'session', to_jsonb(v_session));
  end if;

  update public.workout_sessions
    set abandoned_at = now()
    where id = p_session_id
    returning * into v_session;

  return jsonb_build_object(
    'outcome', 'abandoned',
    'state', public.session_state(
      v_session.started_at, v_session.completed_at, v_session.abandoned_at),
    'session', to_jsonb(v_session));
end
$$;

comment on function public.abandon_session(uuid) is
  'prescribed | active → abandoned. The structure, the logs and the lineage '
  'all survive: abandoning is a state, not a delete (REQ-039).';

-- ===========================================================================
-- 9. swap_session_exercise() — append and supersede (defect D6)
-- ===========================================================================
--
-- The swap is two writes in one transaction and their order is not
-- interchangeable: `workout_exercises_active_order_idx` is unique over active
-- rows in a block, so the outgoing row has to stop being active before its
-- replacement can take its position. Superseding first also cascades
-- `exercise_set_logs.prescription_revision_status` forward, which is DATA-01d's
-- composite foreign key doing its work — the logs stay attached to the row
-- that was actually performed.
--
-- What is deliberately not touched: `execution_status`. A user who completed
-- an exercise and then replaced it performed the first one, and overwriting
-- that with "replaced" is the information loss DATA_MODEL §7 split the two
-- statuses to prevent.

create or replace function public.swap_session_exercise(
  p_workout_exercise_id uuid,
  p_prescription jsonb
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_outgoing public.workout_exercises;
  v_session  public.workout_sessions;
  v_state    public.session_state;
  v_new_id   uuid;
begin
  select * into v_outgoing
    from public.workout_exercises
    where id = p_workout_exercise_id
    for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found', 'exercise', null);
  end if;

  select s.* into v_session
    from public.workout_sessions s
    join public.workout_sections sec on sec.session_id = s.id
    join public.workout_blocks b     on b.section_id   = sec.id
    where b.id = v_outgoing.block_id;

  v_state := public.session_state(
    v_session.started_at, v_session.completed_at, v_session.abandoned_at);

  -- A terminal session is a record of what happened, and what happened does
  -- not get revised. Whether a swap *after* starting is allowed is an open
  -- product question (DATA_MODEL §7) and this function does not answer it:
  -- the temporal reconstruction is what keeps "intended at start" true either
  -- way.
  if v_state not in ('prescribed', 'active') then
    return jsonb_build_object(
      'outcome', 'invalid_transition',
      'event', 'swap',
      'state', v_state,
      'exercise', to_jsonb(v_outgoing));
  end if;

  if v_outgoing.revision_status <> 'active' then
    return jsonb_build_object(
      'outcome', 'invalid_transition',
      'event', 'swap',
      'state', v_state,
      'exercise', to_jsonb(v_outgoing));
  end if;

  update public.workout_exercises
    set revision_status = 'superseded',
        superseded_at   = now()
    where id = p_workout_exercise_id;

  v_new_id := public.insert_prescription(
    v_outgoing.block_id,
    v_outgoing.order_index,
    v_outgoing.slot_id,
    v_outgoing.id,
    'revised',
    p_prescription);

  return jsonb_build_object(
    'outcome', 'swapped',
    'state', v_state,
    'exercise', (select to_jsonb(we) from public.workout_exercises we
                 where we.id = v_new_id),
    'superseded', (select to_jsonb(we) from public.workout_exercises we
                   where we.id = p_workout_exercise_id));
end
$$;

comment on function public.swap_session_exercise(uuid, jsonb) is
  'Appends a revision in the same slot_id and supersedes its predecessor, '
  'whose execution_status is left exactly as it was (DATA_MODEL §7, D6).';

-- ===========================================================================
-- 10. Execute privileges
-- ===========================================================================
--
-- Postgres grants EXECUTE to PUBLIC by default. SECURITY INVOKER means an
-- anonymous caller would see and write nothing — every table underneath is
-- owner-only — but "cannot be called" is a stronger statement than "returns
-- nothing", and these are the session's write surface.

revoke all on function public.session_state(
  timestamptz, timestamptz, timestamptz) from public, anon;
revoke all on function public.insert_prescription(
  uuid, integer, uuid, uuid, public.prescription_origin, jsonb) from public, anon;
revoke all on function public.persist_session(uuid, jsonb) from public, anon;
revoke all on function public.session_snapshot(uuid) from public, anon;
revoke all on function public.resume_session(uuid) from public, anon;
revoke all on function public.start_session(uuid) from public, anon;
revoke all on function public.complete_session(uuid, integer) from public, anon;
revoke all on function public.abandon_session(uuid) from public, anon;
revoke all on function public.swap_session_exercise(uuid, jsonb) from public, anon;

grant execute on function public.session_state(
  timestamptz, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.insert_prescription(
  uuid, integer, uuid, uuid, public.prescription_origin, jsonb)
  to authenticated, service_role;
grant execute on function public.persist_session(uuid, jsonb)
  to authenticated, service_role;
grant execute on function public.session_snapshot(uuid)
  to authenticated, service_role;
grant execute on function public.resume_session(uuid)
  to authenticated, service_role;
grant execute on function public.start_session(uuid)
  to authenticated, service_role;
grant execute on function public.complete_session(uuid, integer)
  to authenticated, service_role;
grant execute on function public.abandon_session(uuid)
  to authenticated, service_role;
grant execute on function public.swap_session_exercise(uuid, jsonb)
  to authenticated, service_role;
