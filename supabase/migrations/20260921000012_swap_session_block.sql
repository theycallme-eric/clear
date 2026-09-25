-- ===========================================================================
-- REV-02 — swap_session_block(): a unit swap, or none of it
-- ===========================================================================
--
-- `exercise-swap.md` makes a superset, an EMOM, an AMRAP and a For Time block
-- swap **as a unit**: the pair was composed to work together, so replacing one
-- half of it is not a smaller version of the same operation. SES-01a already
-- owns the one-slot mechanism — `swap_session_exercise()` appends a revision in
-- the same `slot_id` and supersedes its predecessor (DATA_MODEL §7, defect D6)
-- — and this function is that mechanism applied to every member of one block
-- inside a single transaction.
--
-- Why it is a function rather than N calls from the edge function: a unit swap
-- that replaced three of four members would leave the block half revised, with
-- two exercises composed for each other and two composed for the pair that is
-- gone. A caller cannot make N PostgREST round trips atomic; one plpgsql body
-- is atomic by construction, and a failure part-way rolls the whole block back
-- to what the model composed.
--
-- What is deliberately not written: `workout_blocks`. The block's structure
-- type, its rounds, its timer and its rest are the unit the replacement has to
-- fit *into*, so preserving them is not a rule this function follows — it is a
-- table it never touches. The same is true of `execution_status`, for the
-- reason `swap_session_exercise()` gives.
--
-- The payload names its own targets, in order, rather than being zipped against
-- a query here: which prescription replaces which slot is the caller's decision
-- and it is already made by the time this is called. It is checked rather than
-- trusted — the ids must be exactly the block's active members, once each.

create or replace function public.swap_session_block(
  p_block_id   uuid,
  p_revisions  jsonb
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_block    public.workout_blocks;
  v_session  public.workout_sessions;
  v_state    public.session_state;
  v_active   uuid[];
  v_targets  uuid[];
  v_entry    jsonb;
  v_outcome  jsonb;
  v_results  jsonb := '[]'::jsonb;
begin
  select * into v_block
    from public.workout_blocks
    where id = p_block_id;

  if not found then
    return jsonb_build_object('outcome', 'not_found', 'revisions', null);
  end if;

  select s.* into v_session
    from public.workout_sessions s
    join public.workout_sections sec on sec.session_id = s.id
    where sec.id = v_block.section_id;

  v_state := public.session_state(
    v_session.started_at, v_session.completed_at, v_session.abandoned_at);

  -- The same gate `swap_session_exercise()` applies, asked once for the block:
  -- a terminal session is a record of what happened, and a unit swap that
  -- refused half way would have already written the other half.
  if v_state not in ('prescribed', 'active') then
    return jsonb_build_object(
      'outcome', 'invalid_transition',
      'event', 'swap_block',
      'state', v_state,
      'revisions', null);
  end if;

  select coalesce(array_agg(we.id order by we.order_index), '{}')
    into v_active
    from public.workout_exercises we
    where we.block_id = p_block_id
      and we.revision_status = 'active';

  select coalesce(array_agg((entry ->> 'workout_exercise_id')::uuid), '{}')
    into v_targets
    from jsonb_array_elements(p_revisions) as entries (entry);

  -- Exactly the block's active members, once each. Mutual containment plus
  -- equal cardinality is what makes "once each" true: a payload naming one slot
  -- twice fails containment the other way.
  if not (v_active <@ v_targets
          and v_targets <@ v_active
          and cardinality(v_active) = cardinality(v_targets)) then
    return jsonb_build_object(
      'outcome', 'slot_mismatch',
      'state', v_state,
      'expected', to_jsonb(v_active),
      'revisions', null);
  end if;

  for v_entry in
    select entry
      from jsonb_array_elements(p_revisions) with ordinality as entries (entry, position)
      order by position
  loop
    v_outcome := public.swap_session_exercise(
      (v_entry ->> 'workout_exercise_id')::uuid,
      v_entry -> 'prescription');

    -- Unreachable by the checks above, and raised rather than returned because
    -- reaching it means an earlier member has already been revised: the whole
    -- point of this function is that the block does not survive in that state.
    if v_outcome ->> 'outcome' <> 'swapped' then
      raise exception 'swap_session_block: % refused the unit swap', v_outcome ->> 'outcome'
        using errcode = 'data_exception';
    end if;

    v_results := v_results || jsonb_build_array(v_outcome);
  end loop;

  return jsonb_build_object(
    'outcome', 'swapped',
    'state', v_state,
    'block_id', p_block_id,
    'revisions', v_results);
end
$$;

comment on function public.swap_session_block(uuid, jsonb) is
  'Every active member of one block, appended and superseded in one '
  'transaction. The block row itself is never written: the structure and the '
  'timer are what the replacement has to fit (REV-02, DATA_MODEL §7).';

-- ===========================================================================
-- Execute privileges
-- ===========================================================================
--
-- The session's write surface, granted the way SES-01a grants the rest of it:
-- "cannot be called" is a stronger statement than "returns nothing".

revoke all on function public.swap_session_block(uuid, jsonb) from public, anon;

grant execute on function public.swap_session_block(uuid, jsonb)
  to authenticated, service_role;
