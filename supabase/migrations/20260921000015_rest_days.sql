-- HOME-02 — Rest days: the one thing about a streak that has to be stored
-- (REQ-060, issue #60)
--
-- Spec: docs/specs/DATA_MODEL.md §5 — the streak is derived and never stored.
--
-- Scope. One table, one enum and one write. The streak stays derived: nothing
-- here holds a count, a status, a start date or a run length, and the six
-- columns the old `profiles` carried are not coming back. What this table holds
-- is the *input* the sessions cannot supply.
--
-- Why a table exists at all, when SES-01c proved a streak needs none:
--
--   * **A marked rest day is not a fact about a session.** HIST-01 derives its
--     rest runs from the gaps between sessions, which is the right answer to
--     "what did the week look like" and cannot answer "why". A day the user
--     deliberately took off, and the reason they took it, is information no
--     `workout_sessions` row contains — a rest day has no focus, no duration
--     and no intensity, and every one of those columns is NOT NULL. It is not a
--     session with fields left out.
--   * **The reason is what the rules turn on.** `rest` is an allowance with a
--     ceiling; `injury`, `sick` and `vacation` are pauses with none. Without a
--     stored reason those two are the same empty day, and the engine would have
--     to guess which one broke the run.
--   * **It is still not a streak.** The count remains `deriveStreak` in
--     `src/state/streak.ts`, over these rows and the session rows together
--     (`src/state/rest-days.ts` is the policy). Deleting a row here changes the
--     answer on the next read, exactly as deleting a session does, and there is
--     no repair step in either direction.
--
-- Deliberately absent: any aggregate, any count, any column whose name is a
-- streak, and any notion of "the current pause". A pause is a run of marked
-- days, read the same way a training run is.
--
-- Idempotent: a guarded enum, `create table if not exists`, `drop policy if
-- exists` before each policy, and `create or replace` for the function.

-- ===========================================================================
-- 1. The reason
-- ===========================================================================
--
-- Four values, and the split between them is the whole rule set. The first is
-- an ordinary rest day; the other three are the pause states the old schema
-- held in `profiles.streak_pause_reason` — the same vocabulary, moved from a
-- column that described the user to a row that describes a day.
--
-- `rest` is *not* a pause: a rest day is a day inside a training week, and the
-- engine allows a bounded run of them (§`src/state/rest-days.ts`). A pause is
-- an interruption to training, and it is not bounded, because a fortnight of
-- influenza is not a lapse of discipline.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'rest_day_reason') then
    create type public.rest_day_reason as enum (
      'rest', 'injury', 'sick', 'vacation'
    );
  end if;
end;
$$;

-- ===========================================================================
-- 2. rest_days
-- ===========================================================================
--
-- One row per day the user marked, keyed by the day rather than by an instant.
-- A `date` and not a `timestamptz` on purpose: the row records a decision about
-- a calendar day in the user's own zone, and the client is the only place that
-- knows which zone that is (SES-01c). Storing an instant would make the
-- database re-decide, in UTC, which day was meant.
--
-- `unique (user_id, day)` is what makes marking idempotent: pressing the
-- affordance twice changes the reason, it does not stack two rest days onto one
-- date. Nothing in the engine has to de-duplicate, because the table cannot
-- hold a duplicate.

create table if not exists public.rest_days (
  id uuid primary key default gen_random_uuid(),
  -- `profiles.id` *is* `auth.users.id` and cascades from it, which is the
  -- convention `locations` and `user_constraints` already follow.
  user_id uuid not null references public.profiles (id) on delete cascade,

  day    date                   not null,
  reason public.rest_day_reason not null,

  -- Free text, stored and shown back. Never parsed, and never a source of a
  -- rule — the same posture as `user_constraints.note`. CLEAR does not model
  -- injuries, and a note about one is not an exception to that.
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint rest_days_one_per_day unique (user_id, day),
  constraint rest_days_note_not_blank check (note is null or btrim(note) <> '')
);

comment on table public.rest_days is
  'Days the user marked as not-training, with the reason. The streak is still '
  'derived and still stored nowhere: this table holds the input the session '
  'rows cannot — a rest day has no focus, duration or intensity — and the rules '
  'that read it live in src/state/rest-days.ts.';

comment on column public.rest_days.day is
  'A calendar day in the user''s own time zone, decided by the client. Not an '
  'instant: the database is never told which zone to bucket one into.';

comment on column public.rest_days.reason is
  '`rest` is an allowance the engine bounds; `injury`, `sick` and `vacation` '
  'are pauses it does not. The distinction is the reason this column exists.';

-- The read the engine makes: this user's marks, most recent first. The unique
-- constraint's index already leads with `user_id`, so this is the same columns
-- in the order they are scanned — declared rather than assumed, because the
-- derivation walks days backwards from today and a forward-only index would be
-- read backwards on every call.
create index if not exists rest_days_user_day_idx
  on public.rest_days (user_id, day desc);

-- ===========================================================================
-- 3. Row-level security — owner-only
-- ===========================================================================
--
-- DATA-01b's posture, unchanged: policies scoped `TO authenticated` so an
-- anonymous request matches nothing, the owner predicate on both USING and
-- WITH CHECK so an UPDATE cannot rewrite a row into somebody else's ownership,
-- and `auth.uid()` in a scalar subquery so the planner evaluates it once per
-- statement rather than once per row (migration 00019's lesson).
--
-- DELETE has a policy, like `user_constraints` and unlike `profiles`: unmarking
-- a day is how a user corrects a mistake, and the row leaves no hole behind
-- when it goes — the streak simply derives again without it.

alter table public.rest_days enable row level security;

drop policy if exists rest_days_select_own on public.rest_days;
create policy rest_days_select_own on public.rest_days
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists rest_days_insert_own on public.rest_days;
create policy rest_days_insert_own on public.rest_days
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists rest_days_update_own on public.rest_days;
create policy rest_days_update_own on public.rest_days
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists rest_days_delete_own on public.rest_days;
create policy rest_days_delete_own on public.rest_days
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.rest_days from anon, authenticated;
grant select, insert, update, delete on public.rest_days to authenticated;
grant all on public.rest_days to service_role;

-- ===========================================================================
-- 4. mark_rest_day() — the write, idempotent per day
-- ===========================================================================
--
-- Marking today twice is one row, and marking it again with a different reason
-- is that row changed. The client cannot express that through PostgREST without
-- first reading to find out whether the day is already marked — two round trips
-- and a race between them — so the upsert is named here, where the conflict
-- target is the constraint itself.
--
-- The owner is `auth.uid()` and is not an argument. A rest day is marked from
-- Home by the person resting (IA §6: one place, one affordance), so there is no
-- caller who legitimately marks somebody else's day, and the function refuses
-- rather than trusting a user id off the wire. SECURITY INVOKER keeps §3's
-- policies in force on top of that: the write is checked twice and neither
-- check is this function's opinion.

create or replace function public.mark_rest_day(
  p_day date,
  p_reason public.rest_day_reason,
  p_note text default null
) returns public.rest_days
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_row public.rest_days;
begin
  if v_user_id is null then
    -- The message is for a log, not a screen: `src/state/errors.ts` types what
    -- the user is told, and an unauthenticated write is already impossible
    -- through the policies above.
    raise exception 'mark_rest_day requires an authenticated caller'
      using errcode = '42501';
  end if;

  insert into public.rest_days as r (user_id, day, reason, note)
  values (v_user_id, p_day, p_reason, nullif(btrim(p_note), ''))
  on conflict (user_id, day) do update
    set reason = excluded.reason,
        note = excluded.note,
        -- The row's own audit of when the user last changed their mind. Not
        -- state the engine reads: the rules are a function of `day` and
        -- `reason`, and nothing else in this table.
        updated_at = now()
  returning r.* into v_row;

  return v_row;
end;
$$;

comment on function public.mark_rest_day(date, public.rest_day_reason, text) is
  'Mark one calendar day as a rest day, or change the reason it is marked for. '
  'Idempotent per day by rest_days_one_per_day. The owner is auth.uid() and is '
  'never an argument — a rest day is marked from Home by the person resting.';

revoke all on function public.mark_rest_day(date, public.rest_day_reason, text)
  from public, anon;

grant execute on function public.mark_rest_day(date, public.rest_day_reason, text)
  to authenticated, service_role;
