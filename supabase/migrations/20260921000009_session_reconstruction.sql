-- SES-01b — the three reconstructions (REQ-040, issue #41)
--
-- Spec: docs/specs/DATA_MODEL.md §7 (the three states as queries) and §8
-- ("as performed" — a view, not a join).
--
-- Scope. Three questions about one session, each of which has exactly one
-- answer and therefore exactly one function:
--
--   * **as generated** — what the model composed, before anybody touched it.
--   * **as intended at start** — what the user set out to do, resolved at
--     `started_at` rather than now.
--   * **as performed** — what actually happened, including the parts that did
--     not happen and are only visible because a row says so.
--
-- SES-01a deliberately left these out and said so: `session_snapshot` answers
-- "what should the screen render now", which is the present tense. This file
-- is the past, and the past has three tenses of its own.
--
-- The reason they are functions rather than three SELECTs a screen assembles:
-- the difference between them is one predicate, and a predicate copied into
-- three call sites is three places for "intended at start" to quietly become
-- `revision_status = 'active'`. That substitution is the defect — it is right
-- until the first swap after `started_at`, and then it is silently wrong about
-- history forever. One builder, one envelope, three named entry points.
--
-- Idempotent on an empty project and on one this has already been pushed to:
-- every object is `if not exists` or `create or replace`.

-- ===========================================================================
-- 1. reconstruction_kind — the vocabulary, closed
-- ===========================================================================
--
-- DATA_MODEL §10: a closed vocabulary is a type, even when no column holds
-- one. Three states are named in §7 and there is no fourth; making that a type
-- means the builder cannot be asked for a reconstruction nobody has defined,
-- and means `Constants.public.Enums.reconstruction_kind` is what CORE-03 parses
-- rather than a second list of three strings beside this one.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'reconstruction_kind') then
    create type public.reconstruction_kind as enum (
      'generated', 'intended_at_start', 'performed'
    );
  end if;
end
$$;

comment on type public.reconstruction_kind is
  'The three reconstructions of a session (DATA_MODEL §7). Not a column: it '
  'names which question public.session_reconstruction is being asked.';

-- ===========================================================================
-- 2. session_reconstruction() — one envelope, three predicates
-- ===========================================================================
--
-- The shape is `session_snapshot`'s, plus two things the present tense has no
-- use for: `reconstruction`, so an answer says which question it answers, and
-- `as_of`, the instant it resolves at. A caller holding two of these can
-- diff them because they are the same shape; that is the whole point of one
-- builder.
--
-- **`as_of` per kind.**
--
--   * `generated` → `created_at`. When the workout was composed.
--   * `intended_at_start` → `started_at`, and **null when the session was
--     never started**. That null is the honest answer and it is why the
--     exercise list comes back empty alongside it: nothing was intended at a
--     start that never happened. §7's predicate says the same thing — every
--     comparison against a null `started_at` is null, so no row qualifies —
--     and a reader who sees `as_of: null` knows why rather than suspecting
--     data loss.
--   * `performed` → the terminal timestamp, or `now()` while the session is
--     still running. "What has happened so far" is a legitimate question
--     mid-workout, and the instant is what makes the answer datable.
--
-- **The predicates**, each transcribed from §7's table:
--
--   * `generated` is `origin = 'generated'`. Superseded or not: what was
--     composed was composed, and a swap does not retroactively un-compose it.
--   * `intended_at_start` is temporal — created at or before the start, and
--     not yet superseded at the start. Not `revision_status = 'active'`, which
--     is the same answer only until somebody swaps mid-session, and which
--     would then rewrite what the user set out to do.
--   * `performed` is every active prescription — with logs, without logs,
--     skipped, partially logged — **plus** every superseded one that carries
--     evidence of having been performed. The second half is the one a bare
--     join to `exercise_set_logs` loses, and so does §8's view: `session_
--     performed` filters to `revision_status = 'active'`, which is right for
--     the flat analytical surface DATA-01d declared it as and wrong for a
--     reconstruction, because an exercise the user logged three sets of and
--     then replaced is work they did. Dropping it is D6's information loss
--     wearing a different hat.
--
-- Evidence follows the row it was recorded against, in every kind. That is not
-- incidental: `as_generated` on a swapped session shows the original with an
-- empty `set_logs`, and the substitute holding them is what D6's regression
-- test reads. A reconstruction that hid the logs could not show the defect.
--
-- Returns SQL NULL for a session that is not there and for one the caller may
-- not read. RLS makes those indistinguishable, and "not found" is the honest
-- answer to both.

create or replace function public.session_reconstruction(
  p_session_id uuid,
  p_kind public.reconstruction_kind
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'reconstruction', p_kind,
    'as_of', case p_kind
               when 'generated'         then s.created_at
               when 'intended_at_start' then s.started_at
               when 'performed'         then coalesce(s.completed_at, s.abandoned_at, now())
             end,
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
                -- Null until the block is scored. §8 lists block outcomes as
                -- part of what "as performed" means, and a block result is a
                -- fact about the block rather than about any one member.
                'block_result', (
                  select to_jsonb(br)
                  from public.block_results br
                  where br.block_id = b.id
                ),
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
                    -- Two revisions of one slot share an `order_index` — the
                    -- unique index covers active rows only — so the tie is
                    -- broken by when each was written, which is the order the
                    -- lineage happened in.
                    order by we.order_index, we.created_at
                  )
                  from public.workout_exercises we
                  where we.block_id = b.id
                    and case p_kind
                          when 'generated' then
                            we.origin = 'generated'

                          when 'intended_at_start' then
                            s.started_at is not null
                            and we.created_at <= s.started_at
                            and (
                              we.superseded_at is null
                              or we.superseded_at > s.started_at
                            )

                          when 'performed' then
                            we.revision_status = 'active'
                            or we.execution_status <> 'not_started'
                            or exists (
                              select 1
                              from public.exercise_set_logs l
                              where l.workout_exercise_id = we.id
                            )
                        end
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

comment on function public.session_reconstruction(uuid, public.reconstruction_kind) is
  'One envelope for all three reconstructions (DATA_MODEL §7). The three named '
  'functions below differ from each other by one predicate and nothing else, '
  'which is what stops a screen assembling a fourth.';

-- ===========================================================================
-- 3. The three, named
-- ===========================================================================
--
-- Named entry points rather than a `kind` argument every caller repeats: a
-- call site reads as the question it is asking, and "which string was it
-- again" is not a question a reader of `src/data/sessions.ts` has to answer.

create or replace function public.session_as_generated(p_session_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.session_reconstruction(p_session_id, 'generated')
$$;

comment on function public.session_as_generated(uuid) is
  'What the model composed: origin = generated, superseded rows included. A '
  'swap does not un-compose what was composed (DATA_MODEL §7).';

create or replace function public.session_as_intended_at_start(p_session_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.session_reconstruction(p_session_id, 'intended_at_start')
$$;

comment on function public.session_as_intended_at_start(uuid) is
  'What the user set out to do, resolved at started_at — not revision_status '
  '= active, which a swap made after starting would silently rewrite.';

create or replace function public.session_as_performed(p_session_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.session_reconstruction(p_session_id, 'performed')
$$;

comment on function public.session_as_performed(uuid) is
  'What happened: every active prescription whether or not it was logged, the '
  'superseded ones that carry evidence, and each block''s result (§8).';

-- ===========================================================================
-- 4. Execute privileges
-- ===========================================================================
--
-- Same posture as SES-01a §10. SECURITY INVOKER means an anonymous caller
-- would read nothing anyway, but "cannot be called" is a stronger statement
-- than "returns nothing", and these read a person's whole training history.

revoke all on function public.session_reconstruction(
  uuid, public.reconstruction_kind) from public, anon;
revoke all on function public.session_as_generated(uuid) from public, anon;
revoke all on function public.session_as_intended_at_start(uuid) from public, anon;
revoke all on function public.session_as_performed(uuid) from public, anon;

grant execute on function public.session_reconstruction(
  uuid, public.reconstruction_kind) to authenticated, service_role;
grant execute on function public.session_as_generated(uuid)
  to authenticated, service_role;
grant execute on function public.session_as_intended_at_start(uuid)
  to authenticated, service_role;
grant execute on function public.session_as_performed(uuid)
  to authenticated, service_role;
