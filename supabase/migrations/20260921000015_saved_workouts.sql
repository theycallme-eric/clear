-- FAV-01 — favorites: the snapshot, the attempts, and the two writes that keep
-- the counter honest (REQ-058, issue #58)
--
-- Spec: docs/specs/favorites-v2.md (§Schema, §Progression Tracking) and
-- docs/specs/DATA_MODEL.md §11 snapshot versioning.
--
-- Scope. Two tables and two functions. A favorite is a completed workout the
-- user decided to keep: the structure it was performed with, frozen as JSON,
-- plus the metadata the list states. Everything the app does with one —
-- restart it, complete it again, remove it — is one of the verbs below.
--
-- Three decisions here are the requirement rather than the schema:
--
--   1. **The snapshot states its own contract version.** `workout_snapshot` is
--      a workout in the shape of its era (DATA_MODEL §11). Restoring is
--      therefore a parse against the schema for the version *the row names*,
--      not against whatever the app currently understands, and a favorite
--      saved before a breaking change is a clear refusal instead of a workout
--      with holes in it. This file's whole contribution to that is the NOT NULL
--      column: the registry of versions the app can still read is
--      `src/state/schemas.ts`'s, because it is a fact about code and not about
--      rows.
--
--   2. **An attempt is a row, and the counter is derived from the rows.**
--      `saved_workout_completions` is written when a restarted favorite
--      *starts*, and stamped when it completes — so an abandoned attempt is a
--      row with a null `completed_at`, which is the distinction
--      favorites-v2.md draws in "Incomplete Attempt": the partial data exists,
--      and `times_completed` does not move. `record_favorite_completion`
--      recomputes both denormalized fields from the attempt rows rather than
--      incrementing, which is what makes calling it twice for one session
--      harmless.
--
--   3. **Removing a favorite removes its progression.** The cascade is the
--      hard delete favorites-v2.md §"Removing from Favorites" resolved on:
--      attempts go with the favorite, and the sessions themselves stay exactly
--      where they were, in history.
--
-- Deliberately absent:
--
--   * Any column on `workout_sessions`. Which favorite a session came from is
--     the attempt row, and a second copy on the session would be a second
--     answer to the same question.
--   * Previous-best and last-weight queries. They are FAV-02's, and they read
--     these attempt rows through the session join favorites-v2.md already
--     writes out; adding them here would ship a query with no caller.
--   * A `name`. v2 dropped it: a favorite inherits the workout's title.
--
-- Idempotent on an empty project, and on a project this has already been
-- pushed to: every object is `if not exists` or `create or replace`.

-- ===========================================================================
-- 1. saved_workouts — the snapshot, and what the list says about it
-- ===========================================================================
--
-- `user_id` is stored here and nowhere below it: the attempt table walks up to
-- this row for ownership, exactly as `workout_sections` walks up to its
-- session (DATA-01c §7).
--
-- The metadata columns are copies on purpose. `session_focus`, `intensity` and
-- `duration_mins` are also inside the snapshot, and reading them from JSONB to
-- draw a list would make the favorites tab a scan over documents; more
-- importantly, they must keep meaning what they meant when the favorite was
-- saved, which a later contract version could change inside the snapshot.
--
-- `original_session_id` is `on delete set null`: the session it was first
-- performed as can be pruned by a retention rule that does not exist yet, and
-- the favorite outlives it — that is the whole distinction favorites-v2.md
-- draws between History and Favorites.

create table if not exists public.saved_workouts (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  original_session_id uuid references public.workout_sessions (id) on delete set null,

  -- The workout in the shape of its era, and the era it is in. Never read
  -- without the version beside it.
  workout_snapshot          jsonb not null,
  snapshot_contract_version text  not null,

  -- Inherited from the workout. There is no user-provided name (v2).
  title text not null,

  -- What the favorites list states: anchor, intensity, duration.
  session_focus public.session_focus not null,
  intensity     integer              not null,
  duration_mins integer              not null,

  -- Derived from `saved_workout_completions`, written by
  -- `record_favorite_completion`, and denormalized so the list is one read.
  times_completed   integer not null default 0,
  last_completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint saved_workouts_title_not_blank
    check (btrim(title) <> ''),
  constraint saved_workouts_contract_version_not_blank
    check (btrim(snapshot_contract_version) <> ''),
  -- The same bounds `workout_sessions` holds, so a favorite cannot state a
  -- workout the session table would have refused.
  constraint saved_workouts_intensity_range
    check (intensity between 1 and 10),
  constraint saved_workouts_duration_positive
    check (duration_mins > 0),
  constraint saved_workouts_times_completed_non_negative
    check (times_completed >= 0),

  -- One favorite per session. The star on the summary screen is a toggle, and
  -- a toggle that could write two rows is a toggle with two off states.
  constraint saved_workouts_one_per_session
    unique (user_id, original_session_id)
);

comment on table public.saved_workouts is
  'A completed workout the user kept (favorites-v2 §Favorites). The snapshot '
  'is restored by parsing it against the schema for '
  'snapshot_contract_version — never against the current one.';

comment on column public.saved_workouts.snapshot_contract_version is
  'The prescription contract the snapshot was written under (DATA_MODEL §11). '
  'A favorite predating a breaking change is refused with a clear message '
  'rather than restored into a shape it does not have.';

comment on column public.saved_workouts.times_completed is
  'Completed attempts, recomputed from saved_workout_completions. Abandoned '
  'attempts do not count (favorites-v2 §Incomplete Attempt).';

-- The favorites tab: one user's favorites, most recently used first.
create index if not exists saved_workouts_user_idx
  on public.saved_workouts (user_id, created_at desc);

drop trigger if exists saved_workouts_set_updated_at on public.saved_workouts;
create trigger saved_workouts_set_updated_at
  before update on public.saved_workouts
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- 2. saved_workout_completions — one row per attempt
-- ===========================================================================
--
-- Written when a restarted favorite is started, stamped when it completes.
-- The null `completed_at` is load-bearing: it is how a session that came from
-- a favorite is known to have come from one even though it was abandoned, and
-- it is why `times_completed` can be a count rather than an increment.
--
-- `session_id` is unique per favorite because one session is one attempt.

create table if not exists public.saved_workout_completions (
  id uuid primary key default gen_random_uuid(),

  saved_workout_id uuid not null
    references public.saved_workouts (id) on delete cascade,
  session_id uuid not null
    references public.workout_sessions (id) on delete cascade,

  started_at   timestamptz not null default now(),
  -- Null until the session finishes. Not a default of now(): an attempt is not
  -- a completion, and a column that assumed it was would count abandonments.
  completed_at timestamptz,

  constraint saved_workout_completions_one_per_session
    unique (saved_workout_id, session_id)
);

comment on table public.saved_workout_completions is
  'One attempt at a favorite (favorites-v2 §Schema). completed_at is null '
  'while the session is unfinished and for one that was abandoned, which is '
  'what keeps times_completed to full completions only.';

create index if not exists saved_workout_completions_favorite_idx
  on public.saved_workout_completions (saved_workout_id, completed_at desc);

create index if not exists saved_workout_completions_session_idx
  on public.saved_workout_completions (session_id);

-- ===========================================================================
-- 3. Row-level security
-- ===========================================================================
--
-- The same posture as DATA-01c §7: policies scoped `TO authenticated` with
-- owner predicates on USING and WITH CHECK, `auth.uid()` in a scalar subquery
-- so it is evaluated once per statement, and nothing granted to anon at all.
-- Only `saved_workouts` stores the owner; an attempt walks up to it.

alter table public.saved_workouts             enable row level security;
alter table public.saved_workout_completions  enable row level security;

drop policy if exists saved_workouts_select_own on public.saved_workouts;
create policy saved_workouts_select_own on public.saved_workouts
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists saved_workouts_insert_own on public.saved_workouts;
create policy saved_workouts_insert_own on public.saved_workouts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists saved_workouts_update_own on public.saved_workouts;
create policy saved_workouts_update_own on public.saved_workouts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Unfavoriting is a delete, and it is the user's to make.
drop policy if exists saved_workouts_delete_own on public.saved_workouts;
create policy saved_workouts_delete_own on public.saved_workouts
  for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists saved_workout_completions_select_own
  on public.saved_workout_completions;
create policy saved_workout_completions_select_own
  on public.saved_workout_completions
  for select to authenticated
  using (
    exists (
      select 1 from public.saved_workouts f
      where f.id = saved_workout_completions.saved_workout_id
        and f.user_id = (select auth.uid())
    )
  );

drop policy if exists saved_workout_completions_insert_own
  on public.saved_workout_completions;
create policy saved_workout_completions_insert_own
  on public.saved_workout_completions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.saved_workouts f
      where f.id = saved_workout_completions.saved_workout_id
        and f.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.workout_sessions s
      where s.id = saved_workout_completions.session_id
        and s.user_id = (select auth.uid())
    )
  );

drop policy if exists saved_workout_completions_update_own
  on public.saved_workout_completions;
create policy saved_workout_completions_update_own
  on public.saved_workout_completions
  for update to authenticated
  using (
    exists (
      select 1 from public.saved_workouts f
      where f.id = saved_workout_completions.saved_workout_id
        and f.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.saved_workouts f
      where f.id = saved_workout_completions.saved_workout_id
        and f.user_id = (select auth.uid())
    )
  );

drop policy if exists saved_workout_completions_delete_own
  on public.saved_workout_completions;
create policy saved_workout_completions_delete_own
  on public.saved_workout_completions
  for delete to authenticated
  using (
    exists (
      select 1 from public.saved_workouts f
      where f.id = saved_workout_completions.saved_workout_id
        and f.user_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on public.saved_workouts            to authenticated;
grant select, insert, update, delete on public.saved_workout_completions to authenticated;

grant all on public.saved_workouts            to service_role;
grant all on public.saved_workout_completions to service_role;

-- ===========================================================================
-- 4. save_favorite() — the star on the summary screen, as one transaction
-- ===========================================================================
--
-- Favoriting from the summary screen counts that session as the first
-- completion (favorites-v2 §Resolved Decisions 1). That is two rows — the
-- favorite and its first attempt — and a client that wrote them in two calls
-- could leave a favorite claiming a completion it has no record of.
--
-- The session's own `completed_at` is what stamps the attempt, never `now()`:
-- the debrief can be saved minutes after the workout ended, and the favorite's
-- "last completed" is a fact about the session.
--
-- Re-favoriting a session already favorited answers the existing row rather
-- than raising. The star is a toggle, and a double tap is not an error.
--
-- VOLATILE and SECURITY INVOKER: the policies above decide whose rows, and
-- `p_user_id` is explicit because the service role has no `auth.uid()`.

create or replace function public.save_favorite(
  p_user_id  uuid,
  p_favorite jsonb
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_session      public.workout_sessions;
  v_favorite     public.saved_workouts;
  v_session_id   uuid := nullif(p_favorite->>'original_session_id', '')::uuid;
begin
  if v_session_id is null then
    return jsonb_build_object('outcome', 'session_not_found', 'favorite', null);
  end if;

  select * into v_session
  from public.workout_sessions s
  where s.id = v_session_id;

  -- RLS filters somebody else's session before this read sees it, so "not
  -- yours" and "not there" answer identically, which is the answer they are
  -- both entitled to.
  if not found then
    return jsonb_build_object('outcome', 'session_not_found', 'favorite', null);
  end if;

  select * into v_favorite
  from public.saved_workouts f
  where f.user_id = p_user_id
    and f.original_session_id = v_session_id;

  if found then
    return jsonb_build_object(
      'outcome',  'already_saved',
      'favorite', to_jsonb(v_favorite));
  end if;

  insert into public.saved_workouts (
    user_id, original_session_id,
    workout_snapshot, snapshot_contract_version,
    title, session_focus, intensity, duration_mins)
  values (
    p_user_id, v_session_id,
    p_favorite->'workout_snapshot',
    p_favorite->>'snapshot_contract_version',
    p_favorite->>'title',
    (p_favorite->>'session_focus')::public.session_focus,
    (p_favorite->>'intensity')::integer,
    (p_favorite->>'duration_mins')::integer)
  returning * into v_favorite;

  -- The session that was just finished is this favorite's first attempt, and
  -- it is already complete. An unfinished session can be favorited from
  -- history later; it simply contributes no attempt.
  if v_session.completed_at is not null then
    insert into public.saved_workout_completions (
      saved_workout_id, session_id, started_at, completed_at)
    values (
      v_favorite.id, v_session_id,
      coalesce(v_session.started_at, v_session.completed_at),
      v_session.completed_at);

    update public.saved_workouts f
    set times_completed   = 1,
        last_completed_at = v_session.completed_at
    where f.id = v_favorite.id
    returning * into v_favorite;
  end if;

  return jsonb_build_object('outcome', 'saved', 'favorite', to_jsonb(v_favorite));
end;
$$;

comment on function public.save_favorite(uuid, jsonb) is
  'Saves a completed workout as a favorite and records that session as its '
  'first attempt, in one transaction (favorites-v2 §Resolved Decisions 1). '
  'Re-favoriting answers the existing row.';

-- ===========================================================================
-- 5. record_favorite_completion() — the counter, recomputed
-- ===========================================================================
--
-- Called after a session completes. Most sessions did not come from a
-- favorite, and that is an outcome rather than a failure — the caller asks
-- unconditionally so that nothing has to remember where a session came from.
--
-- Both denormalized fields are recomputed from the attempt rows. Counting is
-- what makes a second call for the same session harmless, and it is also what
-- makes the counter repairable: delete an attempt and the next completion
-- writes the truth rather than a number that drifted once and stayed wrong.

create or replace function public.record_favorite_completion(
  p_session_id uuid
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_session   public.workout_sessions;
  v_attempt   public.saved_workout_completions;
  v_favorite  public.saved_workouts;
begin
  select * into v_session
  from public.workout_sessions s
  where s.id = p_session_id;

  if not found then
    return jsonb_build_object('outcome', 'session_not_found', 'favorite', null);
  end if;

  select * into v_attempt
  from public.saved_workout_completions c
  where c.session_id = p_session_id;

  -- The ordinary case: a session nobody started from a favorite.
  if not found then
    return jsonb_build_object('outcome', 'not_a_favorite', 'favorite', null);
  end if;

  if v_session.completed_at is null then
    -- Abandoned, or still running. The attempt row stays exactly as it is:
    -- the work that was logged belongs to the favorite's history, and the
    -- counter does not move (favorites-v2 §Incomplete Attempt).
    select * into v_favorite
    from public.saved_workouts f
    where f.id = v_attempt.saved_workout_id;

    return jsonb_build_object(
      'outcome',  'not_completed',
      'favorite', to_jsonb(v_favorite));
  end if;

  update public.saved_workout_completions c
  set completed_at = v_session.completed_at
  where c.id = v_attempt.id
    and c.completed_at is distinct from v_session.completed_at;

  update public.saved_workouts f
  set times_completed = (
        select count(*)
        from public.saved_workout_completions c
        where c.saved_workout_id = f.id
          and c.completed_at is not null),
      last_completed_at = (
        select max(c.completed_at)
        from public.saved_workout_completions c
        where c.saved_workout_id = f.id)
  where f.id = v_attempt.saved_workout_id
  returning * into v_favorite;

  return jsonb_build_object('outcome', 'recorded', 'favorite', to_jsonb(v_favorite));
end;
$$;

comment on function public.record_favorite_completion(uuid) is
  'Stamps the attempt a completed session belongs to and recomputes the '
  'favorite''s times_completed and last_completed_at from the attempt rows. '
  'Answers not_a_favorite for the ordinary session, which is not a failure.';

grant execute on function public.save_favorite(uuid, jsonb)
  to authenticated, service_role;
grant execute on function public.record_favorite_completion(uuid)
  to authenticated, service_role;
