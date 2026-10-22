-- TASK-039 (REQ-018, E03) — a block's explicit ladder timing survives the write
-- and the read back.
--
-- Spec: docs/specs/generation/GENERATION_CONTRACT.md §5.1 (TASK-038's additive
-- boundary). `workoutBlockSchema` already accepts an optional, nullable
-- `ladder_timing` object; until this migration `persist_session` named every
-- block column but that one, so a timed ladder was accepted at the boundary
-- and silently written as an untimed one.
--
-- Scope. One nullable column, its shape, and the one INSERT that writes it.
--
--   * Additive. `add column` with no default leaves every existing row NULL —
--     no history is rewritten — and NULL is exactly what the contract calls a
--     legacy block: no explicit timing, existing behaviour.
--   * Read back without a reader change. `session_snapshot` and the three
--     `session_as_*` reconstructions build each block with `to_jsonb(b)`, so
--     the column reaches every reader the moment it exists.
--   * Shape, not consistency. The constraint mirrors `ladderTimingSchema` —
--     the three modes, an integer rung count of at least two, and exactly the
--     mode's own fields non-null — so a hand-written row cannot store a timing
--     no reader could parse. Whether it agrees with the block's sequences and
--     clock is `workoutBlockSchema`'s rule, enforced before `persist_session`
--     is called; restating it here would be a second copy to drift.
--   * Nothing is inferred. A payload with no key, or with JSON `null`, stores
--     SQL NULL; a timing object is stored as sent.
--
-- Generation still never emits the key (`LADDER_TIMING_GENERATION_ACTIVE` is
-- false); TASK-032 decides when it does, against this proven path.

-- ===========================================================================
-- 1. workout_blocks.ladder_timing
-- ===========================================================================

alter table public.workout_blocks
  add column if not exists ladder_timing jsonb;

comment on column public.workout_blocks.ladder_timing is
  'REQ-018: when each ladder round happens — scheduled_starts, for_time or '
  'capped_window, with its rung count and interval or whole-block cap. NULL is '
  'a block with no explicit timing (every block written before REQ-018).';

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t     on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'workout_blocks'
      and c.conname = 'workout_blocks_ladder_timing_shape'
  ) then
    -- CASE rather than AND throughout: SQL does not promise to evaluate AND
    -- left to right, and a cast reached before its type test would raise an
    -- error instead of refusing the row.
    -- z.int() accepts only safe JavaScript integers. PostgreSQL numeric can
    -- hold larger integral values, so bound each JSON number explicitly.
    alter table public.workout_blocks
      add constraint workout_blocks_ladder_timing_shape
      check (
        ladder_timing is null
        or case
          when jsonb_typeof(ladder_timing) <> 'object' then false
          -- Exactly the four keys: the object is strict in the schema too.
          when not (ladder_timing ?& array['mode', 'rounds', 'interval_seconds', 'cap_seconds'])
            then false
          when ladder_timing - array['mode', 'rounds', 'interval_seconds', 'cap_seconds']
            <> '{}'::jsonb then false
          when jsonb_typeof(ladder_timing -> 'rounds') <> 'number' then false
          when (ladder_timing ->> 'rounds')::numeric < 2
            or (ladder_timing ->> 'rounds')::numeric > 9007199254740991
            or (ladder_timing ->> 'rounds')::numeric % 1 <> 0 then false
          when ladder_timing ->> 'mode' = 'scheduled_starts' then
            jsonb_typeof(ladder_timing -> 'cap_seconds') = 'null'
            and case
              when jsonb_typeof(ladder_timing -> 'interval_seconds') <> 'number' then false
              else (ladder_timing ->> 'interval_seconds')::numeric > 0
                and (ladder_timing ->> 'interval_seconds')::numeric <= 9007199254740991
                and (ladder_timing ->> 'interval_seconds')::numeric % 1 = 0
            end
          when ladder_timing ->> 'mode' = 'for_time' then
            jsonb_typeof(ladder_timing -> 'interval_seconds') = 'null'
            and jsonb_typeof(ladder_timing -> 'cap_seconds') = 'null'
          when ladder_timing ->> 'mode' = 'capped_window' then
            jsonb_typeof(ladder_timing -> 'interval_seconds') = 'null'
            and case
              when jsonb_typeof(ladder_timing -> 'cap_seconds') <> 'number' then false
              else (ladder_timing ->> 'cap_seconds')::numeric > 0
                and (ladder_timing ->> 'cap_seconds')::numeric <= 9007199254740991
                and (ladder_timing ->> 'cap_seconds')::numeric % 1 = 0
            end
          else false
        end
      );
  end if;
end
$$;

comment on constraint workout_blocks_ladder_timing_shape on public.workout_blocks is
  'Mirrors ladderTimingSchema (GENERATION_CONTRACT §5.1): a known mode, an '
  'integer rung count of at least two, and only that mode''s fields non-null.';

-- ===========================================================================
-- 2. persist_session() writes it
-- ===========================================================================
--
-- Unchanged from 20260921000017 except the block INSERT's last column.
-- Restated in full because `create or replace function` has no smaller unit.

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
    generation_notes, prompt_version, contract_version,
    is_deload
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
    p_session ->> 'contract_version',
    coalesce((p_session ->> 'is_deload')::boolean, false)
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
        round_rest_seconds, rep_scheme, block_notes,
        ladder_timing
      ) values (
        v_section_id,
        v_block_index,
        (v_block ->> 'structure_type')::public.structure_type,
        (v_block ->> 'rounds')::integer,
        coalesce((v_block ->> 'timer_type')::public.timer_contract, 'none'),
        (v_block ->> 'timer_seconds')::integer,
        (v_block ->> 'round_rest_seconds')::integer,
        coalesce((v_block ->> 'rep_scheme')::public.rep_scheme, 'fixed'),
        v_block ->> 'block_notes',
        -- Absent and JSON null are both "no explicit timing": SQL NULL. A
        -- timing object is stored as sent, never defaulted or derived.
        nullif(v_block -> 'ladder_timing', 'null'::jsonb)
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
  'Accepts a generated workout in one transaction (SES-01a §5), tagging the '
  'session as a deload when the payload says the user applied one (OVR-04 §4) '
  'and storing each block''s explicit ladder timing (REQ-018). '
  'Returns session_snapshot(id) — the structure as it was stored.';

revoke all on function public.persist_session(uuid, jsonb) from public, anon;
grant execute on function public.persist_session(uuid, jsonb)
  to authenticated, service_role;
