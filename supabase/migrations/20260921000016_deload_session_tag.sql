-- OVR-04 — persist_session() writes the deload tag it is given.
-- Sequenced after the rest-day and saved-workout migrations already on main.
--
-- Spec: docs/specs/OVR-01_progressive-overload.md §4 ("session tagged
-- `is_deload = true`", and "anchors do not update during a deload").
--
-- Scope. One column, on one INSERT. `is_deload` itself was added by OVR-01a
-- (20260921000010) because the exclusion is that requirement's acceptance
-- criterion — `anchor_evidence` and `conditioning_history` already refuse a
-- session carrying it. What was missing is the only thing that can ever set
-- it: the write that accepts a generated workout. Until this migration the
-- column was true of nothing, so the exclusion was a rule with no subjects.
--
-- Why the payload and not a trigger. A deload is a decision the user made on
-- the Generate screen and nothing in the row can reconstruct it: a light
-- session is not a deload, and a deload is not always light. So it arrives in
-- `p_session` beside the intensity it was chosen with, defaulting to false for
-- every caller that never asked — the same default the column has, and the same
-- default `sessionAcceptanceSchema` parses.
--
-- The rest of the function is unchanged; it is restated in full because
-- `create or replace function` has no smaller unit.

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
  'Accepts a generated workout in one transaction (SES-01a §5), tagging the '
  'session as a deload when the payload says the user applied one (OVR-04 §4). '
  'Returns session_snapshot(id) — the structure as it was stored.';

revoke all on function public.persist_session(uuid, jsonb) from public, anon;
grant execute on function public.persist_session(uuid, jsonb)
  to authenticated, service_role;
