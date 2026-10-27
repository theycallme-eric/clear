-- TASK-011: ordered, idempotent current-workout observation mutations.
-- Receipts survive a cleared observation. A delayed request therefore cannot
-- recreate it or overwrite a later correction. No hosted migration is implied.

alter table public.exercise_set_logs add column if not exists mutation_revision bigint not null default 0;
alter table public.exercise_set_logs add column if not exists last_mutation_id uuid;

-- Every new correction/clear goes through the owner/active-state/order checks.
-- Revoke both table and historical column ACLs; table REVOKE alone leaves the
-- old column grants in force. Initial inserts remain compatible with old outboxes.
revoke update, delete on public.exercise_set_logs from authenticated;
revoke update (set_number, actual_reps, actual_duration_seconds, actual_distance,
  actual_distance_unit, weight, weight_unit, rpe, is_warmup_set, effort)
  on public.exercise_set_logs from authenticated;

create table if not exists public.set_observation_mutations (
  mutation_id uuid primary key,
  observation_id uuid not null,
  revision bigint not null check (revision > 0 and revision <= 9007199254740991),
  expected_revision bigint not null check (expected_revision >= 0),
  operation text not null check (operation in ('insert', 'correct', 'clear')),
  workout_exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
  set_number integer not null check (set_number > 0),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_values jsonb not null,
  created_at timestamptz not null default now(),
  unique (observation_id, revision),
  check (revision = expected_revision + 1)
);

alter table public.set_observation_mutations enable row level security;
drop policy if exists set_observation_mutations_select_own on public.set_observation_mutations;
create policy set_observation_mutations_select_own on public.set_observation_mutations
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.set_observation_mutations from public, anon, authenticated;
grant select on public.set_observation_mutations to authenticated;
grant all on public.set_observation_mutations to service_role;

-- Column-enumerated existing grants intentionally do not grant the metadata.
-- The receipt, not a caller-controlled flag, authorizes the RPC's row DML.
create or replace function public.fence_set_observation_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_head public.set_observation_mutations;
  v_session_id uuid;
begin
  -- Service-role cleanup already owns every row/table; authenticated callers
  -- cannot SET ROLE service_role. Do not use current_user here: SECURITY DEFINER
  -- would make every caller appear to be the function owner.
  if current_setting('role', true) = 'service_role' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  -- Preserve the existing FK cascades, not a second client mutation path.
  -- The prescription status column has never been caller-writable.
  if tg_op = 'UPDATE' and new.prescription_revision_status is distinct from old.prescription_revision_status
    and (to_jsonb(new) - 'prescription_revision_status') = (to_jsonb(old) - 'prescription_revision_status') then
    return new;
  end if;
  if tg_op = 'DELETE' and not exists (
    select 1 from public.workout_exercises where id = old.workout_exercise_id
  ) then return old; end if;

  v_id := case when tg_op = 'DELETE' then old.id else new.id end;
  if tg_op = 'INSERT' then
    -- Same lock order as the RPC, including legacy inserts whose request can
    -- outlive the client that sent it. No observation row need exist yet.
    select s.id into v_session_id
      from public.workout_sessions s
      join public.workout_sections sec on sec.session_id = s.id
      join public.workout_blocks b on b.section_id = sec.id
      join public.workout_exercises e on e.block_id = b.id
      where e.id = new.workout_exercise_id and e.revision_status = 'active'
        and s.user_id = auth.uid()
      for update of s;
    if not found then
      raise exception 'observation prescription not owned' using errcode = '42501';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_id::text, 0));
  end if;

  select * into v_head from public.set_observation_mutations
    where observation_id = v_id order by revision desc limit 1;

  if not found then
    if tg_op <> 'INSERT' then
      raise exception 'observation mutation receipt missing' using errcode = '23514';
    end if;
    if new.mutation_revision = 0 and new.last_mutation_id is null then return new; end if;
    raise exception 'observation mutation receipt missing' using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    if v_head.operation = 'clear'
      and v_head.expected_revision = old.mutation_revision
      and v_head.workout_exercise_id = old.workout_exercise_id
      and v_head.set_number = old.set_number then return old; end if;
    raise exception 'observation delete requires its next clear receipt' using errcode = '23514';
  end if;

  if v_head.operation = 'clear'
    or new.mutation_revision <> v_head.revision
    or new.last_mutation_id is distinct from v_head.mutation_id
    or new.workout_exercise_id <> v_head.workout_exercise_id
    or new.set_number <> v_head.set_number then
    raise exception 'stale observation write' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if v_head.expected_revision <> old.mutation_revision
      or new.id <> old.id or new.workout_exercise_id <> old.workout_exercise_id
      or new.set_number <> old.set_number or new.created_at <> old.created_at
      or new.rpe is distinct from old.rpe
      or new.is_warmup_set is distinct from old.is_warmup_set then
      raise exception 'observation correction changed immutable fields' using errcode = '23514';
    end if;
  elsif v_head.operation <> 'insert' then
    raise exception 'observation insert requires an insert receipt' using errcode = '23514';
  end if;

  if jsonb_build_object(
      'actual_reps', new.actual_reps, 'actual_duration_seconds', new.actual_duration_seconds,
      'actual_distance', new.actual_distance, 'actual_distance_unit', new.actual_distance_unit,
      'weight', new.weight, 'weight_unit', new.weight_unit, 'effort', new.effort)
    is distinct from (v_head.request_values - 'is_warmup_set' - 'rpe') then
    raise exception 'observation values differ from receipt' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and (
    new.is_warmup_set is distinct from (v_head.request_values->>'is_warmup_set')::boolean
    or new.rpe is distinct from (v_head.request_values->>'rpe')::numeric) then
    raise exception 'observation insert differs from receipt' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.fence_set_observation_write() from public, anon, authenticated;
drop trigger if exists fence_set_observation_write on public.exercise_set_logs;
create trigger fence_set_observation_write before insert or update or delete
  on public.exercise_set_logs for each row execute function public.fence_set_observation_write();

create or replace function public.mutate_set_observation(
  p_observation_id uuid,
  p_mutation_id uuid,
  p_revision bigint,
  p_expected_revision bigint,
  p_operation text,
  p_exercise_id uuid,
  p_set_number integer,
  p_values jsonb
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_session public.workout_sessions;
  v_row public.exercise_set_logs;
  v_has_row boolean;
  v_receipt public.set_observation_mutations;
  v_head public.set_observation_mutations;
  v_revision bigint;
  v_values jsonb;
  v_keys text[];
  v_outcome text;
  v_current jsonb;
begin
  if v_user is null then return jsonb_build_object('outcome', 'not_found'); end if;
  if p_observation_id is null or p_mutation_id is null or p_exercise_id is null
    or p_revision is null or p_expected_revision is null or p_expected_revision < 0
    or p_revision <> p_expected_revision + 1 or p_revision > 9007199254740991
    or p_set_number is null or p_set_number < 1
    or p_operation is null or p_operation not in ('insert', 'correct', 'clear')
    or p_values is null or jsonb_typeof(p_values) <> 'object' then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  v_keys := case p_operation
    when 'insert' then array['actual_reps','actual_duration_seconds','actual_distance',
      'actual_distance_unit','weight','weight_unit','effort','is_warmup_set','rpe']
    when 'correct' then array['actual_reps','actual_duration_seconds','actual_distance',
      'actual_distance_unit','weight','weight_unit','effort']
    else array[]::text[] end;
  if not (p_values ?& v_keys)
    or exists (select 1 from jsonb_object_keys(p_values) k where not (k = any(v_keys))) then
    return jsonb_build_object('outcome', 'invalid');
  end if;
  if p_operation <> 'clear' then
    if exists (select 1 from jsonb_each(p_values) v where
      (v.key in ('actual_reps','actual_duration_seconds','actual_distance','weight','rpe')
        and jsonb_typeof(v.value) not in ('number','null'))
      or (v.key in ('actual_distance_unit','effort') and jsonb_typeof(v.value) not in ('string','null'))
      or (v.key = 'weight_unit' and jsonb_typeof(v.value) <> 'string')
      or (v.key = 'is_warmup_set' and jsonb_typeof(v.value) <> 'boolean')) then
      return jsonb_build_object('outcome', 'invalid');
    end if;
  end if;

  -- Explicit owner check because the RPC alone may write private receipts and
  -- server metadata. Serialize against complete/abandon_session's row lock.
  select s.* into v_session from public.workout_sessions s
    join public.workout_sections sec on sec.session_id = s.id
    join public.workout_blocks b on b.section_id = sec.id
    join public.workout_exercises e on e.block_id = b.id
    where e.id = p_exercise_id and s.user_id = v_user
    for update of s;
  if not found then return jsonb_build_object('outcome', 'not_found'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_observation_id::text, 0));

  select * into v_head from public.set_observation_mutations
    where observation_id = p_observation_id order by revision desc limit 1;
  if found and (v_head.workout_exercise_id <> p_exercise_id or v_head.set_number <> p_set_number
    or v_head.user_id <> v_user) then return jsonb_build_object('outcome', 'conflict'); end if;

  select * into v_receipt from public.set_observation_mutations where mutation_id = p_mutation_id;
  if found then
    if v_receipt.observation_id <> p_observation_id or v_receipt.revision <> p_revision
      or v_receipt.expected_revision <> p_expected_revision or v_receipt.operation <> p_operation
      or v_receipt.workout_exercise_id <> p_exercise_id or v_receipt.set_number <> p_set_number
      or v_receipt.user_id <> v_user or v_receipt.request_values <> p_values then
      return jsonb_build_object('outcome', 'conflict');
    end if;
    v_outcome := 'replayed';
  else
    -- Exact committed receipts above remain replayable after a legitimate
    -- supersede. Every NEW write still belongs to an active prescription.
    if not exists (select 1 from public.workout_exercises e
      where e.id = p_exercise_id and e.revision_status = 'active') then
      return jsonb_build_object('outcome', 'not_found');
    end if;
    -- Original queued inserts retain the preexisting owner/prescription write
    -- permission even after completion; only new corrections/clears are active-only.
    if p_operation <> 'insert' and public.session_state(v_session.started_at,
      v_session.completed_at, v_session.abandoned_at) <> 'active' then
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
    v_revision := coalesce(v_head.revision, 0);
    if p_expected_revision <> v_revision then return jsonb_build_object('outcome', 'conflict'); end if;
    if p_operation = 'insert' and v_head.mutation_id is not null then
      return jsonb_build_object('outcome', 'conflict');
    end if;

    select * into v_row from public.exercise_set_logs where id = p_observation_id for update;
    v_has_row := found;
    if v_has_row and (v_row.workout_exercise_id <> p_exercise_id or v_row.set_number <> p_set_number) then
      return jsonb_build_object('outcome', 'conflict');
    end if;
    if p_operation = 'correct' and (not v_has_row or v_head.operation = 'clear') then
      return jsonb_build_object('outcome', 'not_found');
    end if;
    if v_has_row and v_row.mutation_revision <> v_revision then
      return jsonb_build_object('outcome', 'conflict');
    end if;

    if p_operation = 'insert' and v_has_row then
      -- An old outbox insert may already have landed without its answer.
      -- Bootstrap only that exact observation, including its historical RPE.
      v_values := jsonb_build_object('actual_reps',v_row.actual_reps,
        'actual_duration_seconds',v_row.actual_duration_seconds,'actual_distance',v_row.actual_distance,
        'actual_distance_unit',v_row.actual_distance_unit,'weight',v_row.weight,
        'weight_unit',v_row.weight_unit,'effort',v_row.effort,
        'is_warmup_set',v_row.is_warmup_set,'rpe',v_row.rpe);
      if v_values <> p_values then return jsonb_build_object('outcome', 'conflict'); end if;
    end if;

    insert into public.set_observation_mutations(mutation_id,observation_id,revision,
      expected_revision,operation,workout_exercise_id,set_number,user_id,request_values)
      values(p_mutation_id,p_observation_id,p_revision,p_expected_revision,p_operation,
        p_exercise_id,p_set_number,v_user,p_values) returning * into v_receipt;

    if p_operation = 'clear' then
      delete from public.exercise_set_logs where id = p_observation_id;
    elsif p_operation = 'insert' and not v_has_row then
      insert into public.exercise_set_logs(id,workout_exercise_id,set_number,
        actual_reps,actual_duration_seconds,actual_distance,actual_distance_unit,
        weight,weight_unit,effort,is_warmup_set,rpe,mutation_revision,last_mutation_id)
        values(p_observation_id,p_exercise_id,p_set_number,
          (p_values->>'actual_reps')::integer,(p_values->>'actual_duration_seconds')::integer,
          (p_values->>'actual_distance')::numeric,(p_values->>'actual_distance_unit')::public.distance_unit,
          (p_values->>'weight')::numeric,(p_values->>'weight_unit')::public.weight_unit,
          (p_values->>'effort')::public.set_effort,(p_values->>'is_warmup_set')::boolean,
          (p_values->>'rpe')::numeric,p_revision,p_mutation_id);
    elsif p_operation = 'insert' then
      update public.exercise_set_logs set mutation_revision = p_revision,
        last_mutation_id = p_mutation_id where id = p_observation_id;
    else
      update public.exercise_set_logs set
        actual_reps = (p_values->>'actual_reps')::integer,
        actual_duration_seconds = (p_values->>'actual_duration_seconds')::integer,
        actual_distance = (p_values->>'actual_distance')::numeric,
        actual_distance_unit = (p_values->>'actual_distance_unit')::public.distance_unit,
        weight = (p_values->>'weight')::numeric,weight_unit = (p_values->>'weight_unit')::public.weight_unit,
        effort = (p_values->>'effort')::public.set_effort,
        mutation_revision = p_revision,last_mutation_id = p_mutation_id where id = p_observation_id;
    end if;
    v_outcome := 'applied';
  end if;

  select * into v_head from public.set_observation_mutations
    where observation_id = p_observation_id order by revision desc limit 1;
  v_current := null;
  if v_head.operation <> 'clear' then
    select to_jsonb(l) into v_current from public.exercise_set_logs l where id = p_observation_id;
  end if;
  return jsonb_build_object('outcome',v_outcome,'mutation',jsonb_build_object(
    'observation_id',v_receipt.observation_id,'mutation_id',v_receipt.mutation_id,
    'revision',v_receipt.revision,'expected_revision',v_receipt.expected_revision,
    'operation',v_receipt.operation,'exercise_id',v_receipt.workout_exercise_id,
    'set_number',v_receipt.set_number,'values',v_receipt.request_values),
    'head',jsonb_build_object('revision',v_head.revision,'mutation_id',v_head.mutation_id,
      'cleared',v_head.operation = 'clear','row',v_current));
exception
  when unique_violation then return jsonb_build_object('outcome','conflict');
  when check_violation or invalid_text_representation or numeric_value_out_of_range
    or not_null_violation then return jsonb_build_object('outcome','invalid');
  when foreign_key_violation or insufficient_privilege then return jsonb_build_object('outcome','not_found');
end;
$$;
revoke all on function public.mutate_set_observation(uuid,uuid,bigint,bigint,text,uuid,integer,jsonb)
  from public, anon;
grant execute on function public.mutate_set_observation(uuid,uuid,bigint,bigint,text,uuid,integer,jsonb)
  to authenticated;
