-- SET-02 — Schema: the two location writes PostgREST cannot express (REQ-063, issue #63)
--
-- Spec: docs/specs/IA.md — Settings sub-views. The rows are DATA-01b's
-- (`locations`, `location_equipment`); nothing here creates a table, a column or
-- a policy, and ownership stays the owner-only policies that file installed.
--
-- Scope. Two functions, and the reason there are exactly two is worth stating,
-- because every other operation SET-02 needs is an ordinary PostgREST call and
-- deliberately stays one:
--
--   * renaming a location or changing its tier is one UPDATE;
--   * deleting a non-default location is one DELETE;
--   * reading a location's equipment is one SELECT.
--
-- The two below cannot be, and not for want of trying:
--
--   1. **Moving the default.** DATA-01b §4 enforces "exactly one default per
--      user" with two objects: `locations_one_default_per_user_idx`, an
--      *immediate* partial unique index, and `locations_exactly_one_default`, a
--      *deferred* constraint trigger. So setting the new default first is
--      refused by the index, clearing the old one first is refused by the
--      trigger at that statement's COMMIT, and a PostgREST PATCH is always its
--      own transaction. Both UPDATEs have to be inside one, which is what a
--      function body is.
--   2. **Saving a location and what is in it.** The place and its equipment are
--      one answer to one question — REQ-063's "equipment edits appear in the
--      next generation's constraints" is about the list, and `location_equipment`
--      is a row per item (DATA-01b §5). Two round trips can half-succeed, and a
--      location that exists carrying equipment nobody chose is exactly the
--      partial write the optimistic UI would then have to invent a rollback for.
--
-- Both are SECURITY INVOKER with an empty `search_path`, like
-- `complete_onboarding`: the owner is `auth.uid()` and there is no argument that
-- can name another user, so RLS is what decides, not a parameter the client
-- passes.
--
-- What is deliberately absent: a `delete_location` that reassigns the default on
-- the way out. REQ-063 asks that deleting the default **force reassignment
-- first**, so the reassignment is a decision the user makes and sees — one
-- `set_default_location` call — and the delete that follows is an ordinary
-- DELETE of a row that is no longer the default. Folding it into one function
-- would make the forcing disappear into SQL nobody is shown.
--
-- Idempotent on an empty project and on one this has already been pushed to:
-- every object is `create or replace function`.

-- ===========================================================================
-- 1. save_location
-- ===========================================================================
--
-- Insert when `p_location_id` is null, update that row when it is not, and in
-- both cases replace the equipment list. Answers the committed location *and*
-- the equipment as stored, because those are the two cache entries the screen
-- holds — a client that had to re-read would show the place it just saved with
-- the equipment it had before.
--
-- The first location a user has is their default. Not a convenience: DATA-01b
-- §4 requires a user with locations to have exactly one default among them, so
-- an insert into an empty set that left `is_default` false would fail at COMMIT
-- with a message about a constraint the user has never heard of.

create or replace function public.save_location(
  p_name text,
  p_tier public.equipment_tier,
  p_equipment text[] default '{}',
  -- Last, and defaulted, because "which location" is the argument a create does
  -- not have: omitting it is how the caller says this place is new.
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
  v_first     boolean;
begin
  -- An anonymous caller matches no policy on either table, so every statement
  -- below would fail one at a time with a message about row-level security.
  -- Said once, at the top, in this function's own vocabulary.
  if v_user_id is null then
    raise exception 'save_location requires an authenticated caller'
      using errcode = 'insufficient_privilege';
  end if;

  -- `locations_name_not_blank` would catch this as a constraint violation
  -- naming a constraint. The empty name is the one input a user can actually
  -- produce, so it gets a sentence instead.
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
    -- `user_id` is in the predicate as well as the id. RLS already refuses
    -- another user's row, but a write that says who it belongs to cannot be
    -- read as relying on a policy to be the only check.
    update public.locations
       set name = v_name,
           tier = p_tier
     where id = p_location_id
       and user_id = v_user_id
    returning * into v_location;

    -- No row means the id is not this user's, or the location is gone. Either
    -- way the equipment write below would attach items to nothing.
    if v_location.id is null then
      raise exception 'no such location for the authenticated caller'
        using errcode = 'no_data_found';
    end if;
  end if;

  -- Equipment is replaced, not merged: the list the user just confirmed is the
  -- whole answer to "what is here", so an item they unticked has to disappear.
  -- Delete-then-insert is atomic here like everything else in this body.
  delete from public.location_equipment
   where location_id = v_location.id;

  insert into public.location_equipment (location_id, equipment_id)
  select v_location.id, btrim(item)
    from unnest(coalesce(p_equipment, '{}'::text[])) as item
   where btrim(item) <> ''
  on conflict do nothing;

  -- Read back rather than echoed: the blanks dropped above and the duplicates
  -- the primary key collapsed are differences between what was sent and what is
  -- stored, and the client's cache must hold the second one.
  select coalesce(array_agg(le.equipment_id order by le.equipment_id), '{}')
    into v_equipment
    from public.location_equipment le
   where le.location_id = v_location.id;

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
  'transaction, answering both as stored. SECURITY INVOKER, owner from '
  'auth.uid() — there is no argument that can name another user.';

-- ===========================================================================
-- 2. set_default_location
-- ===========================================================================
--
-- The default is what generation reads when a request names no location
-- (`generation_equipment`, GEN-02a §2), so moving it is a training decision and
-- not bookkeeping. Answers the row that is now the default.

create or replace function public.set_default_location(
  p_location_id uuid
) returns json
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id  uuid := (select auth.uid());
  v_location public.locations;
begin
  if v_user_id is null then
    raise exception 'set_default_location requires an authenticated caller'
      using errcode = 'insufficient_privilege';
  end if;

  -- Ordered, and the order is the whole point:
  -- `locations_one_default_per_user_idx` is immediate, so the row that is
  -- default stops being one before another becomes it. The state in between —
  -- locations with no default among them — is legal exactly because
  -- `locations_exactly_one_default` is deferred, and by COMMIT the second
  -- statement has put a default back.
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

  -- Nothing updated means the id names no location of this caller's. Reported
  -- rather than returned as success: the first UPDATE has left the user with no
  -- default, and the exception is what rolls that back.
  if v_location.id is null then
    raise exception 'no such location for the authenticated caller'
      using errcode = 'no_data_found';
  end if;

  return to_json(v_location);
end;
$$;

comment on function public.set_default_location(uuid) is
  'SET-02: moves the default to this location in one transaction — the deferred '
  'one-default constraint is what makes the intermediate state legal.';

-- ===========================================================================
-- 3. Privileges
-- ===========================================================================
--
-- Callable by a signed-in user and by nobody else. The grant is not what makes
-- either one safe — SECURITY INVOKER plus the owner-only policies on both
-- tables is — but an anonymous caller should be refused before it reaches a
-- policy.

revoke all on function public.save_location(
  text,
  public.equipment_tier,
  text[],
  uuid
) from public, anon;

grant execute on function public.save_location(
  text,
  public.equipment_tier,
  text[],
  uuid
) to authenticated, service_role;

revoke all on function public.set_default_location(uuid) from public, anon;

grant execute on function public.set_default_location(uuid)
  to authenticated, service_role;
