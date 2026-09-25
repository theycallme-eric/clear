-- ===========================================================================
-- OVR-03 — the conditioning read: scored conditioning blocks, with what they
-- were prescribed to be.
-- ===========================================================================
--
-- Scope. One function, no new table and no new column. §3 of
-- `docs/specs/OVR-01_progressive-overload.md` needs three things from the
-- database — a timed block's outcome, the prescription that outcome answers,
-- and the session's intensity — and all three are already stored: DATA-01c's
-- immutable prescription rows, EXE-01's `block_results` (including the section
-- RPE it has captured since M1), and `workout_sessions.effective_intensity`.
--
-- Why no stored score. §3's normalized score is `reps ÷ minutes`,
-- `minutes_completed ÷ minutes_prescribed` or a rung number — arithmetic over
-- columns that are already here, against a prescription that cannot change
-- (a revision supersedes, it does not mutate). A `normalized_score` column
-- would therefore be a second copy of a derived number, and the copy is the
-- failure mode: one backfill, one rounding change or one repaired prescription
-- and the stored score disagrees with the row it was computed from, with
-- nothing to say which is right. The spec's own "New — required" table lists
-- every field §3 needs — `perceived_effort`, `partial_reps`,
-- `minutes_completed` — and no score among them. So the score is computed, in
-- one place (`src/state/conditioning.ts`), from the row this function returns.
--
-- Why a function rather than a view. The prescriptions belong to the row: a
-- caller that received a block and then went looking for its exercises would
-- be re-joining per block, and — worse — could resolve `revision_status`
-- differently from the last caller that asked. So each row carries its own
-- active prescriptions as `jsonb`, exactly as `session_performed` carries a
-- block's set logs, and the join is made once here.
--
-- STABLE and SECURITY INVOKER, as `anchor_evidence` is: owner-only RLS on
-- every table this reads still decides what a caller sees, and `p_user_id`
-- narrows a result the policies have already narrowed rather than being the
-- thing that protects it.

-- ===========================================================================
-- 1. conditioning_history() — the scored conditioning blocks
-- ===========================================================================
--
-- One row per conditioning block that produced a result, newest first.
--
-- What it filters, and why each filter is here rather than in TypeScript:
--
--   * **Completed, un-abandoned sessions.** A density read is a claim about
--     how conditioning is landing, and an abandoned session is not a session
--     the app knows the shape of (`anchor_evidence` §3 makes the same call).
--   * **Non-deload.** A deliberately lighter week must not read as capacity,
--     in either direction; `is_deload` exists for exactly this exclusion.
--   * **Conditioning sections.** §3's window is "the last 3 conditioning
--     sections", and `section_type` is what says one is.
--   * **Scored blocks only.** A block with no `block_results` row produced no
--     outcome; returning it would mean every consumer re-checking for null
--     before it could do anything.
--
-- What it deliberately does **not** filter:
--
--   * **Intensity.** §3's gate is intensity ≥ 5, and it is applied in
--     `src/state/conditioning.ts` where it is a unit test rather than a
--     predicate nobody can execute on a pull request. The column travels so
--     that gate has something to read.
--   * **Structure type.** A conditioning section can hold a structure §3 has
--     no score for. Which formats are scorable is the score's business, and a
--     function that dropped the rest would also drop the effort they recorded.
--   * **A missing measurement.** `perceived_effort`, `partial_round_reps` and
--     the rest stay nullable here. Absence is an observation (DATA_MODEL §8),
--     and the score refuses to invent a number from it rather than the read
--     refusing to return the row.
--
-- `p_limit` bounds the read at the two windows that consume it: §3's trend
-- needs the most recent three qualifying sections, and the like-for-like
-- comparison needs enough history to hold a previous attempt of the same
-- piece. Sixty blocks is months of conditioning for a regular trainer and one
-- small request either way.

create or replace function public.conditioning_history(
  p_user_id uuid,
  p_limit   integer default 60
)
returns table (
  session_id          uuid,
  session_date        date,
  effective_intensity integer,
  goal_preset         public.goal_preset,
  section_id          uuid,
  section_order       integer,
  block_id            uuid,
  block_order         integer,
  structure_type      public.structure_type,
  rep_scheme          public.rep_scheme,
  timer_type          public.timer_contract,
  timer_seconds       integer,
  rounds              integer,
  round_rest_seconds  integer,
  elapsed_seconds     integer,
  completed_under_cap boolean,
  rounds_completed    integer,
  partial_round_reps  integer,
  minutes_completed   integer,
  highest_rung        integer,
  perceived_effort    smallint,
  scored_at           timestamptz,
  prescriptions       jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    s.id,
    s.date,
    s.effective_intensity,
    s.goal_preset,
    sec.id,
    sec.order_index,
    wb.id,
    wb.order_index,
    wb.structure_type,
    wb.rep_scheme,
    wb.timer_type,
    wb.timer_seconds,
    wb.rounds,
    wb.round_rest_seconds,
    br.elapsed_seconds,
    br.completed_under_cap,
    br.rounds_completed,
    br.partial_round_reps,
    br.minutes_completed,
    br.highest_rung,
    br.perceived_effort,
    br.created_at,
    -- The prescription as it stands: the active revision, in prescribed order.
    -- A superseded row is part of what *happened* (D6) but not part of what
    -- the piece *was*, and the like-for-like fingerprint is a statement about
    -- the work — so a swap makes today's piece a different piece, which is
    -- precisely the comparison §3(a) refuses to draw.
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'exercise_id',     we.exercise_id,
            'order_index',     we.order_index,
            'modality',        we.modality,
            'sets',            we.sets,
            'target_kind',     we.target_kind,
            'target_value',    we.target_value,
            'target_min',      we.target_min,
            'target_max',      we.target_max,
            'target_sequence', we.target_sequence,
            'per_side',        we.per_side,
            'distance_unit',   we.distance_unit,
            'load_type',       we.load_type,
            'load_value',      we.load_value,
            'equipment_used',  we.equipment_used
          )
          order by we.order_index
        )
        from public.workout_exercises we
        where we.block_id = wb.id
          and we.revision_status = 'active'
      ),
      '[]'::jsonb
    )
  from public.block_results   br
  join public.workout_blocks   wb  on wb.id = br.block_id
  join public.workout_sections sec on sec.id = wb.section_id
  join public.workout_sessions s   on s.id = sec.session_id
  where s.user_id = p_user_id
    and s.completed_at is not null
    and s.abandoned_at is null
    and s.is_deload = false
    and sec.section_type = 'conditioning'
  order by s.date desc, s.created_at desc, sec.order_index desc, wb.order_index desc
  limit greatest(coalesce(p_limit, 60), 1)
$$;

comment on function public.conditioning_history(uuid, integer) is
  'Scored conditioning blocks, newest first, each carrying its active '
  'prescriptions and its session intensity (OVR-03 §3). Deloads and '
  'abandoned sessions are already gone; the intensity gate and the '
  'normalized score are computed in src/state/conditioning.ts.';

-- ===========================================================================
-- 2. Execute privileges
-- ===========================================================================
--
-- Same posture as OVR-01a §5: SECURITY INVOKER means an anonymous caller would
-- read nothing anyway, but "cannot be called" is the stronger statement, and
-- this reads a person's training history.

revoke all on function public.conditioning_history(uuid, integer) from public, anon;

grant execute on function public.conditioning_history(uuid, integer)
  to authenticated, service_role;
