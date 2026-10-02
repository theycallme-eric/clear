-- ===========================================================================
-- REQ-013 — a location write cannot create an impossible configuration
-- ===========================================================================
--
-- SET-02's location writes (20260921000009) commit whatever equipment they are
-- handed, and `generation_viability` (20261001000021) can say whether a proposed
-- equipment list leaves a section with nothing to retrieve. This joins them:
-- adding a location, editing its equipment — a tier preset is an equipment list
-- — moving the default, and deleting a location are each refused when what they
-- leave cannot support the caller's saved sections.
--
-- The refusal is an exception raised after the write, inside the function, so
-- the transaction is what restores the previous rows: `locations` and
-- `location_equipment` are exactly as they were, with nothing for a client to
-- undo. It carries SQLSTATE 23514 like this file's other refusable input, the
-- message `location_not_viable`, and a JSON `detail`:
--
--   { "change":   { "kind": "add" | "edit" | "default" | "delete",
--                   "location": <name>, "removed": [...], "added": [...] },
--     "failures": [ <generation_viability rows> ] }
--
-- so the caller can name the section and the change responsible without a
-- second request, and without this file writing user-facing copy.
--
-- What is evaluated, and when:
--
--   * `save_location` — the equipment as stored, when the location is new or
--     its equipment differs from what it held. A rename is not an equipment
--     change and is never refused for a list it did not touch.
--   * `set_default_location` — the equipment of the location becoming the
--     default, which is what generation reads when a request names none.
--   * `delete_location` — new. Removing a location that is not the last leaves
--     every other location as it was. Removing the last one leaves no equipment
--     at all, which is evaluated as the empty list and so refused as
--     `missing_equipment`. The default is still not reassigned here (SET-02).
--
-- The saved configuration is the caller's own rows: `profiles.goal_preset` and
-- `enabled_sections`, and the persistent `exclude` constraints, by the same
-- `constraints_in_force` retrieval reads. A caller with no profile has no saved
-- sections to protect and is not evaluated. `no_sections` is not reported: it is
-- a statement about the section toggles, and no equipment change causes it.
--
-- Additive and idempotent: every object is `create or replace function`. No
-- table, column, policy or row is altered. Rolling back is re-applying
-- 20260921000009's two definitions and dropping the two new functions.

-- ===========================================================================
-- 1. location_viability_failures
-- ===========================================================================

create or replace function public.location_viability_failures(
  p_equipment text[]
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(to_jsonb(v) order by v.section, v.failure_class),
    '[]'::jsonb
  )
  from public.profiles p
  cross join lateral public.generation_viability(
    p.goal_preset,
    p.enabled_sections,
    coalesce(p_equipment, '{}'::text[]),
    array(
      select c.target_exercise_id
      from public.constraints_in_force(p.id) c
      where c.action = 'exclude' and c.scope = 'exercise'
    ),
    array(
      select c.target_pattern
      from public.constraints_in_force(p.id) c
      where c.action = 'exclude' and c.scope = 'movement_pattern'
    ),
    array(
      select c.target_equipment
      from public.constraints_in_force(p.id) c
      where c.action = 'exclude' and c.scope = 'equipment'
    )
  ) v
  where p.id = (select auth.uid())
    and v.failure_class <> 'no_sections'
$$;

comment on function public.location_viability_failures(text[]) is
  'REQ-013: generation_viability for this equipment against the caller''s saved '
  'goal, sections and persistent exclusions, as a JSON array. Empty is viable.';

-- ===========================================================================
-- 2. save_location
-- ===========================================================================
--
-- 20260921000009's body, with the equipment it replaced remembered and the
-- stored result evaluated before the function returns.

create or replace function public.save_location(
  p_name text,
  p_tier public.equipment_tier,
  p_equipment text[] default '{}',
  p_location_id uuid default null
) returns json
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id   uuid := (select auth.uid());
  v_name      text := btrim(p_name);
  v_location  public.locations;
  v_equipment text[];
  v_previous  text[] := '{}';
  v_first     boolean;
  v_failures  jsonb;
begin
  if v_user_id is null then
    raise exception 'save_location requires an authenticated caller'
      using errcode = 'insufficient_privilege';
  end if;

  if v_name = '' then
    raise exception 'a location needs a name'
      using errcode = 'check_violation';
  end if;

  if p_location_id is null then
    select not exists (
      select 1 from public.locations l where l.user_id = v_user_id
    ) into v_first;

    insert into public.locations (user_id, name, tier, is_default)
    values (v_user_id, v_name, p_tier, v_first)
    returning * into v_location;
  else
    update public.locations
       set name = v_name,
           tier = p_tier
     where id = p_location_id
       and user_id = v_user_id
    returning * into v_location;

    if v_location.id is null then
      raise exception 'no such location for the authenticated caller'
        using errcode = 'no_data_found';
    end if;

    -- What the location held, so the refusal can say what the change removed.
    select coalesce(array_agg(le.equipment_id order by le.equipment_id), '{}')
      into v_previous
      from public.location_equipment le
     where le.location_id = v_location.id;
  end if;

  delete from public.location_equipment
   where location_id = v_location.id;

  insert into public.location_equipment (location_id, equipment_id)
  select v_location.id, btrim(item)
    from unnest(coalesce(p_equipment, '{}'::text[])) as item
   where btrim(item) <> ''
  on conflict do nothing;

  select coalesce(array_agg(le.equipment_id order by le.equipment_id), '{}')
    into v_equipment
    from public.location_equipment le
   where le.location_id = v_location.id;

  -- REQ-013. Evaluated on what is stored, after the write, so the exception is
  -- what puts the previous rows back.
  if p_location_id is null or v_equipment is distinct from v_previous then
    v_failures := public.location_viability_failures(v_equipment);

    if jsonb_array_length(v_failures) > 0 then
      raise exception 'location_not_viable'
        using errcode = 'check_violation',
              detail = jsonb_build_object(
                'change', jsonb_build_object(
                  'kind', case when p_location_id is null then 'add' else 'edit' end,
                  'location', v_location.name,
                  'removed', to_jsonb(array(
                    select item from unnest(v_previous) as item
                     where item <> all (v_equipment)
                     order by item
                  )),
                  'added', to_jsonb(array(
                    select item from unnest(v_equipment) as item
                     where item <> all (v_previous)
                     order by item
                  ))
                ),
                'failures', v_failures
              )::text;
    end if;
  end if;

  return json_build_object(
    'location',  to_json(v_location),
    'equipment', to_json(v_equipment)
  );
end;
$$;

comment on function public.save_location(
  text,
  public.equipment_tier,
  text[],
  uuid
) is
  'SET-02: creates or updates one location and replaces its equipment in one '
  'transaction, answering both as stored. REQ-013: refused, with nothing '
  'written, when the equipment cannot support the caller''s saved sections. '
  'SECURITY INVOKER, owner from auth.uid().';

-- ===========================================================================
-- 3. set_default_location
-- ===========================================================================

create or replace function public.set_default_location(
  p_location_id uuid
) returns json
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id   uuid := (select auth.uid());
  v_location  public.locations;
  v_equipment text[];
  v_failures  jsonb;
begin
  if v_user_id is null then
    raise exception 'set_default_location requires an authenticated caller'
      using errcode = 'insufficient_privilege';
  end if;

  update public.locations
     set is_default = false
   where user_id = v_user_id
     and is_default
     and id <> p_location_id;

  update public.locations
     set is_default = true
   where id = p_location_id
     and user_id = v_user_id
  returning * into v_location;

  if v_location.id is null then
    raise exception 'no such location for the authenticated caller'
      using errcode = 'no_data_found';
  end if;

  -- REQ-013. The default is what generation reads when a request names no
  -- location, so its equipment is what has to support the saved sections.
  select coalesce(array_agg(le.equipment_id order by le.equipment_id), '{}')
    into v_equipment
    from public.location_equipment le
   where le.location_id = v_location.id;

  v_failures := public.location_viability_failures(v_equipment);

  if jsonb_array_length(v_failures) > 0 then
    raise exception 'location_not_viable'
      using errcode = 'check_violation',
            detail = jsonb_build_object(
              'change', jsonb_build_object(
                'kind', 'default',
                'location', v_location.name,
                'removed', '[]'::jsonb,
                'added', '[]'::jsonb
              ),
              'failures', v_failures
            )::text;
  end if;

  return to_json(v_location);
end;
$$;

comment on function public.set_default_location(uuid) is
  'SET-02: moves the default to this location in one transaction. REQ-013: '
  'refused, with the default unmoved, when that location''s equipment cannot '
  'support the caller''s saved sections.';

-- ===========================================================================
-- 4. delete_location
-- ===========================================================================
--
-- Answers the deleted id, or NULL when the id names no location of the
-- caller's: a location already gone is not an error, as the DELETE this
-- replaces was not.

create or replace function public.delete_location(
  p_location_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id  uuid := (select auth.uid());
  v_location public.locations;
  v_failures jsonb;
begin
  if v_user_id is null then
    raise exception 'delete_location requires an authenticated caller'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.locations
   where id = p_location_id
     and user_id = v_user_id
  returning * into v_location;

  if v_location.id is null then
    return null;
  end if;

  -- REQ-013. Only the last location's removal changes what generation can
  -- read: it leaves no equipment rows at all.
  if not exists (
    select 1 from public.locations l where l.user_id = v_user_id
  ) then
    v_failures := public.location_viability_failures('{}'::text[]);

    if jsonb_array_length(v_failures) > 0 then
      raise exception 'location_not_viable'
        using errcode = 'check_violation',
              detail = jsonb_build_object(
                'change', jsonb_build_object(
                  'kind', 'delete',
                  'location', v_location.name,
                  'removed', '[]'::jsonb,
                  'added', '[]'::jsonb
                ),
                'failures', v_failures
              )::text;
    end if;
  end if;

  return v_location.id;
end;
$$;

comment on function public.delete_location(uuid) is
  'REQ-013: deletes one of the caller''s locations; its equipment cascades. '
  'Refused, with nothing deleted, when it is the last one and the caller''s '
  'saved sections would be left with no equipment.';

-- ===========================================================================
-- 5. Privileges
-- ===========================================================================
--
-- `create or replace` keeps the grants 20260921000009 made on the two functions
-- it replaces; the two new ones get the same pair of statements.

revoke all on function public.location_viability_failures(text[]) from public, anon;

grant execute on function public.location_viability_failures(text[])
  to authenticated, service_role;

revoke all on function public.delete_location(uuid) from public, anon;

grant execute on function public.delete_location(uuid)
  to authenticated, service_role;
