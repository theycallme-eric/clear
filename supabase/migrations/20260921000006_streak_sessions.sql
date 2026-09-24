-- SES-01c — Derived streak: the read it is derived from (REQ-041, issue #42)
--
-- Spec: docs/specs/DATA_MODEL.md §7 (derived state, never stored).
--
-- Scope. One function and one index, and between them they answer a single
-- question: which of this user's sessions were completed, most recent first.
-- Nothing here counts anything. The streak itself is `deriveStreak` in
-- `src/state/streak.ts` — a pure function of the rows this returns — and the
-- division is the point of the requirement rather than a layering preference:
--
--   * **No streak column exists anywhere in this schema.** The old app stored
--     six of them (`streak_count`, `streak_status`, `streak_pause_reason`,
--     `streak_start_date`, `streak_pause_start`, `consecutive_rest_days`) and
--     they drifted from the sessions they claimed to summarise. A derived
--     count cannot drift, and a deleted or abandoned session changes it on the
--     next read with no repair step to run.
--   * **The day boundary is the user's, not this database's.** Postgres would
--     have to be told the time zone to bucket `completed_at` into days, and
--     the only place that knows it is the browser the user is standing in. So
--     the instants are returned as they are stored and resolved once, on the
--     client. A session at 11pm and one at 1am are two days for the user
--     whatever UTC thinks, and that is a fact about where the derivation runs.
--   * **`counts_for_streak` is returned, not applied.** Which sessions count
--     is a rule HOME-02 extends (pause states, rest-day allowances); a rule
--     half-applied here and half-extended there is two answers to one
--     question. This function filters on lifecycle only.
--
-- Deliberately absent: any aggregate, any date arithmetic, any `date_trunc`,
-- and any view that would make "the streak" look like something stored.
--
-- Idempotent: `create or replace` and `if not exists` throughout.

-- ===========================================================================
-- 1. The index the read is ordered by
-- ===========================================================================
--
-- DATA-01c indexed `(user_id, date desc)` — the training day a session was
-- composed for, which is not when it was finished. The streak reads the
-- completion instants in order, so it gets the partial index that matches it:
-- an incomplete session is not a row this query can ever return.

create index if not exists workout_sessions_completed_idx
  on public.workout_sessions (user_id, completed_at desc)
  where completed_at is not null;

-- ===========================================================================
-- 2. streak_sessions() — completed sessions, newest first, bounded
-- ===========================================================================
--
-- A streak has no maximum length, so the read is a page and `p_before` is its
-- cursor: the client asks again for what precedes the oldest row it has when,
-- and only when, the streak it derived reaches that row. A single call is the
-- common case; the cursor is what keeps a long streak correct rather than
-- truncated at whatever constant seemed generous.
--
-- `completed_at is not null` is the whole lifecycle filter it needs.
-- `workout_sessions_not_both_completed_and_abandoned` (SES-01a) means a
-- completed session cannot also be abandoned, so an abandoned one is already
-- excluded — by the constraint, not by a second predicate that could disagree
-- with it.
--
-- SECURITY INVOKER, so owner-only RLS decides what a caller sees: `p_user_id`
-- is a filter and never an authorization, and asking for somebody else's id
-- returns nothing rather than something. Every column reference is
-- alias-qualified because the RETURNS TABLE columns share their names.

create or replace function public.streak_sessions(
  p_user_id uuid,
  p_before  timestamptz default null,
  p_limit   int default 200
)
returns table (
  session_id        uuid,
  completed_at      timestamptz,
  counts_for_streak boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id, s.completed_at, s.counts_for_streak
  from public.workout_sessions s
  where s.user_id = p_user_id
    and s.completed_at is not null
    and (p_before is null or s.completed_at < p_before)
  order by s.completed_at desc
  -- Clamped rather than trusted: a page is a page, and an unbounded read of
  -- one user's whole history is not one.
  limit least(greatest(coalesce(p_limit, 200), 1), 1000)
$$;

comment on function public.streak_sessions(uuid, timestamptz, integer) is
  'Completed sessions for one user, newest first, one page at a time — the '
  'rows SES-01c derives a streak from. It counts nothing and stores nothing: '
  'no streak column exists in this schema, and the user''s day boundary is '
  'resolved on the client, which is the only place that knows the time zone.';

-- ===========================================================================
-- 3. Execute privileges
-- ===========================================================================
--
-- Same posture as SES-01a's: EXECUTE is granted to PUBLIC by default, and
-- "cannot be called" is a stronger statement than "returns nothing".

revoke all on function public.streak_sessions(uuid, timestamptz, integer)
  from public, anon;

grant execute on function public.streak_sessions(uuid, timestamptz, integer)
  to authenticated, service_role;
