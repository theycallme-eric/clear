--
-- PostgreSQL database dump
--

\restrict gZHJsFz7y8eDMcd8EIZKgBcY5lYYNsft2ACRf5LIbsUwkGI8WEzIeFkgHM40IaV

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: supabase_migrations; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA supabase_migrations;


--
-- Name: anchor_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.anchor_type AS ENUM (
    'squat',
    'hinge',
    'press',
    'pull',
    'power',
    'surprise',
    'upper_body',
    'lower_body',
    'full_body'
);


--
-- Name: equipment_tier; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.equipment_tier AS ENUM (
    'minimal',
    'home',
    'building',
    'full'
);


--
-- Name: experience_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.experience_level AS ENUM (
    'new',
    'some',
    'confident'
);


--
-- Name: goal_preset; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.goal_preset AS ENUM (
    'strength',
    'balanced',
    'conditioning',
    'quick',
    'hypertrophy',
    'active_recovery'
);


--
-- Name: movement_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.movement_category AS ENUM (
    'lower_body',
    'upper_body',
    'core',
    'full_body'
);


--
-- Name: rest_day_reason; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.rest_day_reason AS ENUM (
    'rest',
    'injury',
    'sick'
);


--
-- Name: section_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.section_status AS ENUM (
    'not_started',
    'completed',
    'skipped'
);


--
-- Name: section_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.section_type AS ENUM (
    'warmup',
    'mobility',
    'primary_lift',
    'accessory',
    'skill_power',
    'carries',
    'core',
    'stability_balance',
    'conditioning',
    'cooldown'
);


--
-- Name: streak_pause_reason; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.streak_pause_reason AS ENUM (
    'injury',
    'sick',
    'vacation'
);


--
-- Name: streak_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.streak_status AS ENUM (
    'active',
    'paused'
);


--
-- Name: complete_onboarding(uuid, text, public.equipment_tier, text[], public.experience_level, public.goal_preset, public.section_type[], text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_onboarding(p_user_id uuid, p_location_name text, p_location_tier public.equipment_tier, p_equipment text[], p_experience_level public.experience_level, p_goal_preset public.goal_preset, p_sections public.section_type[], p_limitations text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_location_id UUID;
BEGIN
  -- Step 1: Upsert location (creates or updates based on user_id + name)
  INSERT INTO locations (user_id, name, tier, equipment, is_default)
  VALUES (p_user_id, p_location_name, p_location_tier, p_equipment, true)
  ON CONFLICT (user_id, name) DO UPDATE SET
    tier = EXCLUDED.tier,
    equipment = EXCLUDED.equipment,
    is_default = true,
    updated_at = NOW()
  RETURNING id INTO v_location_id;

  -- Step 2: Update profile atomically in same transaction
  UPDATE profiles SET
    onboarding_completed = true,
    experience_level = p_experience_level,
    goal_preset = p_goal_preset,
    enabled_sections = p_sections,
    limitations = p_limitations,
    default_location_id = v_location_id,
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Return location ID so client can update local state
  RETURN v_location_id;
END;
$$;


--
-- Name: FUNCTION complete_onboarding(p_user_id uuid, p_location_name text, p_location_tier public.equipment_tier, p_equipment text[], p_experience_level public.experience_level, p_goal_preset public.goal_preset, p_sections public.section_type[], p_limitations text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.complete_onboarding(p_user_id uuid, p_location_name text, p_location_tier public.equipment_tier, p_equipment text[], p_experience_level public.experience_level, p_goal_preset public.goal_preset, p_sections public.section_type[], p_limitations text) IS 'Atomically completes user onboarding by creating/updating location and marking profile as onboarded.
   This prevents race conditions where TOKEN_REFRESHED could read stale profile data between
   the location insert and profile update.';


--
-- Name: ensure_single_default_location(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_single_default_location() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.is_default = TRUE THEN
    UPDATE locations
    SET is_default = FALSE
    WHERE user_id = NEW.user_id
      AND id != NEW.id
      AND is_default = TRUE;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: get_last_set_data(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_last_set_data(p_user_id uuid, p_exercise_definition_ids text[]) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  result JSON;
BEGIN
  WITH latest_exercises AS (
    -- Find the most recent exercise row for each definition_id
    SELECT DISTINCT ON (e.exercise_id)
      e.id AS exercise_row_id,
      e.exercise_id AS definition_id,
      e.weight_logged,
      s.completed_at
    FROM exercises e
    JOIN workout_sections ws ON ws.id = e.section_id
    JOIN workout_sessions s ON s.id = ws.session_id
    WHERE s.user_id = p_user_id
      AND s.completed_at IS NOT NULL
      AND e.exercise_id = ANY(p_exercise_definition_ids)
    ORDER BY e.exercise_id, s.completed_at DESC
  ),
  set_data AS (
    -- Get set logs for those exercise rows
    SELECT
      le.definition_id,
      json_agg(
        json_build_object(
          'setNumber', esl.set_number,
          'weight', esl.weight,
          'weightUnit', esl.weight_unit,
          'reps', esl.reps,
          'rpe', esl.rpe
        ) ORDER BY esl.set_number
      ) AS sets
    FROM latest_exercises le
    JOIN exercise_set_logs esl ON esl.exercise_row_id = le.exercise_row_id
    GROUP BY le.definition_id
  ),
  legacy_data AS (
    -- Fallback: exercises without set logs use weight_logged
    SELECT
      le.definition_id,
      le.weight_logged
    FROM latest_exercises le
    LEFT JOIN exercise_set_logs esl ON esl.exercise_row_id = le.exercise_row_id
    WHERE esl.id IS NULL
      AND le.weight_logged IS NOT NULL
  )
  SELECT json_build_object(
    'setData', COALESCE(
      (SELECT json_object_agg(definition_id, sets) FROM set_data),
      '{}'::json
    ),
    'legacyData', COALESCE(
      (SELECT json_object_agg(definition_id, weight_logged) FROM legacy_data),
      '{}'::json
    )
  ) INTO result;

  RETURN result;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
  BEGIN
    INSERT INTO public.profiles (id)
    VALUES (NEW.id);
    RETURN NEW;
  END;
  $$;


--
-- Name: save_generated_workout(uuid, uuid, date, public.anchor_type, smallint, jsonb, smallint, text, public.goal_preset); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_generated_workout(p_user_id uuid, p_location_id uuid, p_date date, p_anchor public.anchor_type, p_intensity smallint, p_sections jsonb, p_time_target_mins smallint DEFAULT NULL::smallint, p_prompt_version text DEFAULT NULL::text, p_goal_preset public.goal_preset DEFAULT 'balanced'::public.goal_preset) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_session_id UUID;
  v_section JSONB;
  v_section_id UUID;
  v_exercise JSONB;
  v_exercise_id UUID;
  v_section_idx INTEGER := 0;
  v_exercise_idx INTEGER;
  v_sections_out JSONB := '[]'::JSONB;
  v_exercises_out JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  INSERT INTO workout_sessions (
    user_id, location_id, date, anchor, intensity, goal_preset,
    time_target_mins, prompt_version, is_rest_day, counts_for_streak
  ) VALUES (
    p_user_id, p_location_id, p_date, p_anchor, p_intensity, p_goal_preset,
    p_time_target_mins, p_prompt_version, FALSE, FALSE
  )
  RETURNING id INTO v_session_id;

  FOR v_section IN SELECT * FROM jsonb_array_elements(p_sections)
  LOOP
    INSERT INTO workout_sections (
      session_id, section_type, order_index, section_notes
    ) VALUES (
      v_session_id,
      (v_section->>'section_type')::section_type,
      v_section_idx,
      v_section->>'section_notes'
    )
    RETURNING id INTO v_section_id;

    v_exercise_idx := 0;
    v_exercises_out := '[]'::JSONB;

    FOR v_exercise IN SELECT * FROM jsonb_array_elements(v_section->'exercises')
    LOOP
      INSERT INTO exercises (
        section_id, exercise_id, equipment_used, sets, reps,
        effort_percent, tempo, rest_seconds, coaching_cues, order_index,
        structure
      ) VALUES (
        v_section_id,
        v_exercise->>'exercise_id',
        COALESCE(v_exercise->>'equipment_used', 'bodyweight'),
        (v_exercise->>'sets')::SMALLINT,
        COALESCE(v_exercise->>'reps', '1'),
        (v_exercise->>'effort_percent')::SMALLINT,
        v_exercise->>'tempo',
        (v_exercise->>'rest_seconds')::SMALLINT,
        v_exercise->>'coaching_cues',
        v_exercise_idx,
        v_exercise->'structure'
      )
      RETURNING id INTO v_exercise_id;

      v_exercises_out := v_exercises_out || jsonb_build_object(
        'id', v_exercise_id,
        'order_index', v_exercise_idx
      );
      v_exercise_idx := v_exercise_idx + 1;
    END LOOP;

    v_sections_out := v_sections_out || jsonb_build_object(
      'id', v_section_id,
      'order_index', v_section_idx,
      'exercises', v_exercises_out
    );
    v_section_idx := v_section_idx + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'sections', v_sections_out
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to save workout: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$;


--
-- Name: FUNCTION save_generated_workout(p_user_id uuid, p_location_id uuid, p_date date, p_anchor public.anchor_type, p_intensity smallint, p_sections jsonb, p_time_target_mins smallint, p_prompt_version text, p_goal_preset public.goal_preset); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.save_generated_workout(p_user_id uuid, p_location_id uuid, p_date date, p_anchor public.anchor_type, p_intensity smallint, p_sections jsonb, p_time_target_mins smallint, p_prompt_version text, p_goal_preset public.goal_preset) IS 'Atomically saves a generated workout and returns the session ID plus all
   section/exercise UUIDs, so the frontend can map logged data directly to DB rows.';


--
-- Name: suggest_anchor(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.suggest_anchor(p_user_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  result JSON;
BEGIN
  WITH recent_sessions AS (
    SELECT ws.id AS session_id, ws.date
    FROM workout_sessions ws
    WHERE ws.user_id = p_user_id
      AND ws.status = 'completed'
      AND ws.date >= (CURRENT_DATE - INTERVAL '7 days')
  ),
  exercise_muscles AS (
    SELECT
      emg.muscle_group,
      emg.role,
      rs.date
    FROM recent_sessions rs
    JOIN workout_sections wsec ON wsec.session_id = rs.session_id
    JOIN exercises ex ON ex.section_id = wsec.id
    JOIN exercise_muscle_groups emg ON emg.exercise_id = ex.id
  ),
  region_mapping AS (
    SELECT
      muscle_group,
      role,
      date,
      CASE
        WHEN muscle_group IN ('quads', 'hamstrings', 'glutes', 'calves', 'hip_flexors') THEN 'lower'
        WHEN muscle_group IN ('pecs', 'front_delts', 'side_delts', 'triceps') THEN 'upper_push'
        WHEN muscle_group IN ('lats', 'rhomboids', 'rear_delts', 'biceps', 'traps') THEN 'upper_pull'
        WHEN muscle_group IN ('abs', 'obliques', 'erectors') THEN 'core'
        ELSE 'other'
      END AS region
    FROM exercise_muscles
  ),
  region_scores AS (
    SELECT
      region,
      COUNT(*) FILTER (WHERE role = 'primary') AS primary_hits,
      COUNT(*) FILTER (WHERE role = 'synergist') AS synergist_hits,
      MAX(date) AS last_hit,
      EXTRACT(DAY FROM (CURRENT_DATE - MAX(date))) AS days_since
    FROM region_mapping
    WHERE region != 'other'
    GROUP BY region
  ),
  -- Include regions with zero hits
  all_regions AS (
    SELECT region FROM (VALUES ('lower'), ('upper_push'), ('upper_pull'), ('core')) AS r(region)
  ),
  scored AS (
    SELECT
      ar.region,
      COALESCE(rs.primary_hits, 0) AS primary_hits,
      COALESCE(rs.synergist_hits, 0) AS synergist_hits,
      rs.last_hit,
      COALESCE(rs.days_since, 8) AS days_since, -- never hit = 8 days (max staleness)
      -- Score: higher = more underworked. Weight staleness heavily.
      (COALESCE(rs.days_since, 8) * 10) - (COALESCE(rs.primary_hits, 0) * 3) AS score
    FROM all_regions ar
    LEFT JOIN region_scores rs ON rs.region = ar.region
  ),
  best AS (
    SELECT * FROM scored ORDER BY score DESC LIMIT 1
  )
  SELECT json_build_object(
    'suggested_anchor',
    CASE best.region
      WHEN 'lower' THEN 'LOWER BODY'
      WHEN 'upper_push' THEN 'UPPER BODY'
      WHEN 'upper_pull' THEN 'UPPER BODY'
      WHEN 'core' THEN 'FULL BODY'
      ELSE 'FULL BODY'
    END,
    'reason',
    CASE
      WHEN best.days_since >= 8 OR best.last_hit IS NULL THEN
        CASE best.region
          WHEN 'lower' THEN 'Lower body — not trained this week'
          WHEN 'upper_push' THEN 'Upper body (push) — not trained this week'
          WHEN 'upper_pull' THEN 'Upper body (pull) — not trained this week'
          WHEN 'core' THEN 'Core — not trained this week'
          ELSE 'Full body — no recent data'
        END
      ELSE
        CASE best.region
          WHEN 'lower' THEN 'Lower body — last trained ' || best.days_since || ' days ago'
          WHEN 'upper_push' THEN 'Upper body (push) — last trained ' || best.days_since || ' days ago'
          WHEN 'upper_pull' THEN 'Upper body (pull) — last trained ' || best.days_since || ' days ago'
          WHEN 'core' THEN 'Core — last trained ' || best.days_since || ' days ago'
          ELSE 'Full body — last trained ' || best.days_since || ' days ago'
        END
    END,
    'coverage',
    (SELECT json_agg(json_build_object(
      'region', s.region,
      'primary_hits', s.primary_hits,
      'synergist_hits', s.synergist_hits,
      'days_since', s.days_since
    )) FROM scored s)
  ) INTO result
  FROM best;

  -- If no data at all (new user, no sessions), return FULL BODY default
  IF result IS NULL THEN
    result := json_build_object(
      'suggested_anchor', 'FULL BODY',
      'reason', 'No recent workout data — starting with full body',
      'coverage', '[]'::json
    );
  END IF;

  RETURN result;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: exercise_anchors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exercise_anchors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    exercise_id text NOT NULL,
    anchor public.anchor_type NOT NULL,
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: exercise_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exercise_definitions (
    id text NOT NULL,
    pattern_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    equipment_options text[] NOT NULL,
    default_equipment text NOT NULL,
    regression text,
    progression text,
    coaching_cues text[],
    sections public.section_type[] NOT NULL,
    can_be_primary boolean DEFAULT false NOT NULL,
    equipment_display_names jsonb,
    CONSTRAINT valid_default_equipment CHECK ((default_equipment = ANY (equipment_options)))
);


--
-- Name: exercise_definitions_with_anchors; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.exercise_definitions_with_anchors AS
SELECT
    NULL::text AS id,
    NULL::text AS pattern_id,
    NULL::timestamp with time zone AS created_at,
    NULL::timestamp with time zone AS updated_at,
    NULL::text AS name,
    NULL::text[] AS equipment_options,
    NULL::text AS default_equipment,
    NULL::text AS regression,
    NULL::text AS progression,
    NULL::text[] AS coaching_cues,
    NULL::public.section_type[] AS sections,
    NULL::boolean AS can_be_primary,
    NULL::jsonb AS equipment_display_names,
    NULL::public.anchor_type[] AS anchors,
    NULL::public.anchor_type AS primary_anchor,
    NULL::jsonb AS muscle_groups;


--
-- Name: exercise_muscle_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exercise_muscle_groups (
    exercise_id text NOT NULL,
    muscle_group text NOT NULL,
    role text NOT NULL,
    CONSTRAINT exercise_muscle_groups_role_check CHECK ((role = ANY (ARRAY['primary'::text, 'synergist'::text, 'stabilizer'::text])))
);


--
-- Name: exercise_set_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exercise_set_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    exercise_row_id uuid NOT NULL,
    set_number smallint NOT NULL,
    weight numeric,
    weight_unit text DEFAULT 'lbs'::text,
    reps smallint,
    rpe numeric,
    is_warmup_set boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT exercise_set_logs_rpe_check CHECK (((rpe IS NULL) OR ((rpe >= (1)::numeric) AND (rpe <= (10)::numeric)))),
    CONSTRAINT exercise_set_logs_weight_unit_check CHECK ((weight_unit = ANY (ARRAY['lbs'::text, 'kg'::text])))
);


--
-- Name: exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exercises (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section_id uuid NOT NULL,
    exercise_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    equipment_used text NOT NULL,
    sets smallint,
    reps text NOT NULL,
    effort_percent smallint,
    tempo text,
    rest_seconds smallint,
    coaching_cues text,
    weight_logged text,
    exercise_notes text,
    order_index smallint NOT NULL,
    structure jsonb,
    CONSTRAINT exercises_effort_percent_check CHECK (((effort_percent IS NULL) OR ((effort_percent >= 0) AND (effort_percent <= 100))))
);


--
-- Name: COLUMN exercises.structure; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.exercises.structure IS 'Exercise structure metadata (type, group_id, minutes, time_cap_mins, etc.). Null for standard exercises. Examples: {"type":"emom","minutes":8,"group_id":"emom-1"}, {"type":"amrap","minutes":10,"group_id":"amrap-1"}, {"type":"for_time","time_cap_mins":12,"group_id":"ft-1"}, {"type":"superset","paired_with":"barbell-curl","group_id":"ss-1"}';


--
-- Name: movement_patterns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.movement_patterns (
    id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    category public.movement_category NOT NULL,
    anchor public.anchor_type NOT NULL,
    description text
);


--
-- Name: workout_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workout_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    section_type public.section_type NOT NULL,
    order_index smallint NOT NULL,
    section_notes text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    status public.section_status DEFAULT 'not_started'::public.section_status
);


--
-- Name: workout_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workout_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    location_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    date date NOT NULL,
    anchor public.anchor_type NOT NULL,
    intensity smallint NOT NULL,
    goal_preset public.goal_preset,
    time_target_mins smallint,
    generation_notes text,
    duration_mins smallint,
    mood text,
    session_notes text,
    counts_for_streak boolean DEFAULT true NOT NULL,
    is_rest_day boolean DEFAULT false NOT NULL,
    rest_day_reason public.rest_day_reason,
    prompt_version text,
    completed_at timestamp with time zone,
    CONSTRAINT valid_rest_day CHECK (((is_rest_day = false) OR ((is_rest_day = true) AND (location_id IS NULL)))),
    CONSTRAINT valid_rest_day_reason CHECK ((((is_rest_day = false) AND (rest_day_reason IS NULL)) OR (is_rest_day = true))),
    CONSTRAINT workout_sessions_intensity_check CHECK (((intensity >= 1) AND (intensity <= 10)))
);


--
-- Name: exercises_with_context; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.exercises_with_context AS
 SELECT e.id,
    e.section_id,
    e.exercise_id,
    e.created_at,
    e.updated_at,
    e.equipment_used,
    e.sets,
    e.reps,
    e.effort_percent,
    e.tempo,
    e.rest_seconds,
    e.coaching_cues,
    e.weight_logged,
    e.exercise_notes,
    e.order_index,
    ed.name AS exercise_name,
    ed.pattern_id,
    mp.anchor,
    ws.section_type,
    wsess.user_id,
    wsess.date AS workout_date,
    wsess.intensity AS workout_intensity
   FROM ((((public.exercises e
     JOIN public.exercise_definitions ed ON ((e.exercise_id = ed.id)))
     JOIN public.movement_patterns mp ON ((ed.pattern_id = mp.id)))
     JOIN public.workout_sections ws ON ((e.section_id = ws.id)))
     JOIN public.workout_sessions wsess ON ((ws.session_id = wsess.id)));


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    tier public.equipment_tier NOT NULL,
    equipment text[] DEFAULT ARRAY['bodyweight'::text] NOT NULL,
    is_default boolean DEFAULT false NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    experience_level public.experience_level,
    goal_preset public.goal_preset,
    limitations text,
    enabled_sections public.section_type[] DEFAULT ARRAY['warmup'::public.section_type, 'primary_lift'::public.section_type, 'accessory'::public.section_type, 'core'::public.section_type, 'conditioning'::public.section_type, 'cooldown'::public.section_type],
    streak_count integer DEFAULT 0 NOT NULL,
    streak_start_date date,
    streak_status public.streak_status DEFAULT 'active'::public.streak_status NOT NULL,
    streak_pause_reason public.streak_pause_reason,
    streak_pause_start date,
    consecutive_rest_days integer DEFAULT 0 NOT NULL,
    onboarding_completed boolean DEFAULT false NOT NULL,
    default_location_id uuid
);


--
-- Name: saved_workout_completions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_workout_completions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    saved_workout_id uuid NOT NULL,
    session_id uuid,
    completed_at timestamp with time zone DEFAULT now()
);


--
-- Name: saved_workouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_workouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    original_session_id uuid,
    workout_snapshot jsonb NOT NULL,
    title text NOT NULL,
    anchor text,
    intensity smallint,
    duration_mins smallint,
    times_completed integer DEFAULT 0,
    last_completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: structure_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.structure_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section_id uuid,
    structure_type text NOT NULL,
    completion_time_seconds integer,
    completed_under_cap boolean,
    rounds_completed integer,
    rep_scheme text,
    highest_rung integer,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: schema_migrations; Type: TABLE; Schema: supabase_migrations; Owner: -
--

CREATE TABLE supabase_migrations.schema_migrations (
    version text NOT NULL,
    statements text[],
    name text
);


--
-- Name: exercise_anchors exercise_anchors_exercise_id_anchor_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_anchors
    ADD CONSTRAINT exercise_anchors_exercise_id_anchor_key UNIQUE (exercise_id, anchor);


--
-- Name: exercise_anchors exercise_anchors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_anchors
    ADD CONSTRAINT exercise_anchors_pkey PRIMARY KEY (id);


--
-- Name: exercise_definitions exercise_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_definitions
    ADD CONSTRAINT exercise_definitions_pkey PRIMARY KEY (id);


--
-- Name: exercise_muscle_groups exercise_muscle_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_muscle_groups
    ADD CONSTRAINT exercise_muscle_groups_pkey PRIMARY KEY (exercise_id, muscle_group, role);


--
-- Name: exercise_set_logs exercise_set_logs_exercise_row_id_set_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_set_logs
    ADD CONSTRAINT exercise_set_logs_exercise_row_id_set_number_key UNIQUE (exercise_row_id, set_number);


--
-- Name: exercise_set_logs exercise_set_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_set_logs
    ADD CONSTRAINT exercise_set_logs_pkey PRIMARY KEY (id);


--
-- Name: exercises exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises
    ADD CONSTRAINT exercises_pkey PRIMARY KEY (id);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: locations locations_user_id_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_user_id_name_unique UNIQUE (user_id, name);


--
-- Name: CONSTRAINT locations_user_id_name_unique ON locations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT locations_user_id_name_unique ON public.locations IS 'Each user can only have one location with a given name. This prevents duplicate entries from bugs like navigation loops during onboarding.';


--
-- Name: movement_patterns movement_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movement_patterns
    ADD CONSTRAINT movement_patterns_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: saved_workout_completions saved_workout_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_workout_completions
    ADD CONSTRAINT saved_workout_completions_pkey PRIMARY KEY (id);


--
-- Name: saved_workouts saved_workouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_workouts
    ADD CONSTRAINT saved_workouts_pkey PRIMARY KEY (id);


--
-- Name: structure_results structure_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.structure_results
    ADD CONSTRAINT structure_results_pkey PRIMARY KEY (id);


--
-- Name: workout_sections workout_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_sections
    ADD CONSTRAINT workout_sections_pkey PRIMARY KEY (id);


--
-- Name: workout_sessions workout_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_sessions
    ADD CONSTRAINT workout_sessions_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: supabase_migrations; Owner: -
--

ALTER TABLE ONLY supabase_migrations.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: idx_exercise_anchors_anchor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_anchors_anchor ON public.exercise_anchors USING btree (anchor);


--
-- Name: idx_exercise_anchors_exercise; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_anchors_exercise ON public.exercise_anchors USING btree (exercise_id);


--
-- Name: idx_exercise_definitions_equipment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_definitions_equipment ON public.exercise_definitions USING gin (equipment_options);


--
-- Name: idx_exercise_definitions_pattern; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_definitions_pattern ON public.exercise_definitions USING btree (pattern_id);


--
-- Name: idx_exercise_definitions_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_definitions_primary ON public.exercise_definitions USING btree (can_be_primary) WHERE (can_be_primary = true);


--
-- Name: idx_exercise_definitions_sections; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_definitions_sections ON public.exercise_definitions USING gin (sections);


--
-- Name: idx_exercise_muscle_groups_muscle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_muscle_groups_muscle ON public.exercise_muscle_groups USING btree (muscle_group);


--
-- Name: idx_exercise_muscle_groups_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_muscle_groups_role ON public.exercise_muscle_groups USING btree (muscle_group, role);


--
-- Name: idx_exercise_set_logs_exercise; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_set_logs_exercise ON public.exercise_set_logs USING btree (exercise_row_id);


--
-- Name: idx_exercises_exercise_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercises_exercise_id ON public.exercises USING btree (exercise_id);


--
-- Name: idx_exercises_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercises_order ON public.exercises USING btree (section_id, order_index);


--
-- Name: idx_exercises_section_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercises_section_id ON public.exercises USING btree (section_id);


--
-- Name: idx_locations_is_default; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_is_default ON public.locations USING btree (user_id, is_default) WHERE (is_default = true);


--
-- Name: idx_locations_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_user_id ON public.locations USING btree (user_id);


--
-- Name: idx_profiles_onboarding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_onboarding ON public.profiles USING btree (onboarding_completed);


--
-- Name: idx_saved_workout_completions_saved_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_workout_completions_saved_id ON public.saved_workout_completions USING btree (saved_workout_id);


--
-- Name: idx_saved_workouts_original_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_workouts_original_session ON public.saved_workouts USING btree (original_session_id);


--
-- Name: idx_saved_workouts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_workouts_user_id ON public.saved_workouts USING btree (user_id);


--
-- Name: idx_structure_results_section_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_structure_results_section_id ON public.structure_results USING btree (section_id);


--
-- Name: idx_structure_results_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_structure_results_type ON public.structure_results USING btree (structure_type);


--
-- Name: idx_workout_sections_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_sections_order ON public.workout_sections USING btree (session_id, order_index);


--
-- Name: idx_workout_sections_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_sections_session_id ON public.workout_sections USING btree (session_id);


--
-- Name: idx_workout_sessions_anchor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_sessions_anchor ON public.workout_sessions USING btree (user_id, anchor);


--
-- Name: idx_workout_sessions_completed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_sessions_completed ON public.workout_sessions USING btree (user_id, completed_at) WHERE (completed_at IS NOT NULL);


--
-- Name: idx_workout_sessions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_sessions_date ON public.workout_sessions USING btree (user_id, date DESC);


--
-- Name: idx_workout_sessions_incomplete; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_sessions_incomplete ON public.workout_sessions USING btree (user_id, created_at DESC) WHERE (completed_at IS NULL);


--
-- Name: INDEX idx_workout_sessions_incomplete; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_workout_sessions_incomplete IS 'Partial index for finding incomplete workout sessions (completed_at IS NULL).
   Used by resumption logic to find workouts that were abandoned mid-session.';


--
-- Name: idx_workout_sessions_intensity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_sessions_intensity ON public.workout_sessions USING btree (user_id, intensity);


--
-- Name: idx_workout_sessions_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_sessions_user_date ON public.workout_sessions USING btree (user_id, date);


--
-- Name: idx_workout_sessions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_sessions_user_id ON public.workout_sessions USING btree (user_id);


--
-- Name: uq_saved_workouts_user_session; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_saved_workouts_user_session ON public.saved_workouts USING btree (user_id, original_session_id);


--
-- Name: exercise_definitions_with_anchors _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.exercise_definitions_with_anchors AS
 SELECT ed.id,
    ed.pattern_id,
    ed.created_at,
    ed.updated_at,
    ed.name,
    ed.equipment_options,
    ed.default_equipment,
    ed.regression,
    ed.progression,
    ed.coaching_cues,
    ed.sections,
    ed.can_be_primary,
    ed.equipment_display_names,
    COALESCE(array_agg(DISTINCT ea.anchor) FILTER (WHERE (ea.anchor IS NOT NULL)), '{}'::public.anchor_type[]) AS anchors,
    ( SELECT ea2.anchor
           FROM public.exercise_anchors ea2
          WHERE ((ea2.exercise_id = ed.id) AND (ea2.is_primary = true))
         LIMIT 1) AS primary_anchor,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('muscle', emg.muscle_group, 'role', emg.role)) AS jsonb_agg
           FROM public.exercise_muscle_groups emg
          WHERE (emg.exercise_id = ed.id)), '[]'::jsonb) AS muscle_groups
   FROM (public.exercise_definitions ed
     LEFT JOIN public.exercise_anchors ea ON ((ea.exercise_id = ed.id)))
  GROUP BY ed.id;


--
-- Name: locations enforce_single_default_location; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_single_default_location BEFORE INSERT OR UPDATE ON public.locations FOR EACH ROW WHEN ((new.is_default = true)) EXECUTE FUNCTION public.ensure_single_default_location();


--
-- Name: exercise_definitions update_exercise_definitions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_exercise_definitions_updated_at BEFORE UPDATE ON public.exercise_definitions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: exercises update_exercises_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_exercises_updated_at BEFORE UPDATE ON public.exercises FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: locations update_locations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: saved_workouts update_saved_workouts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_saved_workouts_updated_at BEFORE UPDATE ON public.saved_workouts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: workout_sections update_workout_sections_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_workout_sections_updated_at BEFORE UPDATE ON public.workout_sections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: workout_sessions update_workout_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_workout_sessions_updated_at BEFORE UPDATE ON public.workout_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: exercise_anchors exercise_anchors_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_anchors
    ADD CONSTRAINT exercise_anchors_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercise_definitions(id) ON DELETE CASCADE;


--
-- Name: exercise_definitions exercise_definitions_pattern_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_definitions
    ADD CONSTRAINT exercise_definitions_pattern_id_fkey FOREIGN KEY (pattern_id) REFERENCES public.movement_patterns(id) ON DELETE RESTRICT;


--
-- Name: exercise_definitions exercise_definitions_progression_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_definitions
    ADD CONSTRAINT exercise_definitions_progression_fkey FOREIGN KEY (progression) REFERENCES public.exercise_definitions(id) ON DELETE SET NULL;


--
-- Name: exercise_definitions exercise_definitions_regression_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_definitions
    ADD CONSTRAINT exercise_definitions_regression_fkey FOREIGN KEY (regression) REFERENCES public.exercise_definitions(id) ON DELETE SET NULL;


--
-- Name: exercise_muscle_groups exercise_muscle_groups_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_muscle_groups
    ADD CONSTRAINT exercise_muscle_groups_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercise_definitions(id) ON DELETE CASCADE;


--
-- Name: exercise_set_logs exercise_set_logs_exercise_row_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_set_logs
    ADD CONSTRAINT exercise_set_logs_exercise_row_id_fkey FOREIGN KEY (exercise_row_id) REFERENCES public.exercises(id) ON DELETE CASCADE;


--
-- Name: exercises exercises_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises
    ADD CONSTRAINT exercises_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercise_definitions(id) ON DELETE RESTRICT;


--
-- Name: exercises exercises_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises
    ADD CONSTRAINT exercises_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.workout_sections(id) ON DELETE CASCADE;


--
-- Name: profiles fk_profiles_default_location; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT fk_profiles_default_location FOREIGN KEY (default_location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: locations locations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: saved_workout_completions saved_workout_completions_saved_workout_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_workout_completions
    ADD CONSTRAINT saved_workout_completions_saved_workout_id_fkey FOREIGN KEY (saved_workout_id) REFERENCES public.saved_workouts(id) ON DELETE CASCADE;


--
-- Name: saved_workout_completions saved_workout_completions_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_workout_completions
    ADD CONSTRAINT saved_workout_completions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.workout_sessions(id);


--
-- Name: saved_workouts saved_workouts_original_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_workouts
    ADD CONSTRAINT saved_workouts_original_session_id_fkey FOREIGN KEY (original_session_id) REFERENCES public.workout_sessions(id);


--
-- Name: saved_workouts saved_workouts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_workouts
    ADD CONSTRAINT saved_workouts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: structure_results structure_results_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.structure_results
    ADD CONSTRAINT structure_results_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.workout_sections(id) ON DELETE CASCADE;


--
-- Name: workout_sections workout_sections_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_sections
    ADD CONSTRAINT workout_sections_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.workout_sessions(id) ON DELETE CASCADE;


--
-- Name: workout_sessions workout_sessions_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_sessions
    ADD CONSTRAINT workout_sessions_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: workout_sessions workout_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_sessions
    ADD CONSTRAINT workout_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: exercise_definitions Authenticated users can view exercise definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view exercise definitions" ON public.exercise_definitions FOR SELECT TO authenticated USING (true);


--
-- Name: movement_patterns Authenticated users can view movement patterns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view movement patterns" ON public.movement_patterns FOR SELECT TO authenticated USING (true);


--
-- Name: exercise_anchors Exercise anchors are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Exercise anchors are viewable by everyone" ON public.exercise_anchors FOR SELECT USING (true);


--
-- Name: exercise_muscle_groups Exercise muscle groups are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Exercise muscle groups are viewable by everyone" ON public.exercise_muscle_groups FOR SELECT USING (true);


--
-- Name: saved_workout_completions Users can create own completion records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own completion records" ON public.saved_workout_completions FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.saved_workouts
  WHERE ((saved_workouts.id = saved_workout_completions.saved_workout_id) AND (saved_workouts.user_id = auth.uid())))));


--
-- Name: exercises Users can create own exercises; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own exercises" ON public.exercises FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.workout_sections wsec
     JOIN public.workout_sessions ws ON ((ws.id = wsec.session_id)))
  WHERE ((wsec.id = exercises.section_id) AND (ws.user_id = auth.uid())))));


--
-- Name: locations Users can create own locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own locations" ON public.locations FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: saved_workouts Users can create own saved workouts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own saved workouts" ON public.saved_workouts FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: workout_sections Users can create own sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own sections" ON public.workout_sections FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workout_sessions ws
  WHERE ((ws.id = workout_sections.session_id) AND (ws.user_id = auth.uid())))));


--
-- Name: workout_sessions Users can create own sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own sessions" ON public.workout_sessions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: saved_workout_completions Users can delete own completion records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own completion records" ON public.saved_workout_completions FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.saved_workouts
  WHERE ((saved_workouts.id = saved_workout_completions.saved_workout_id) AND (saved_workouts.user_id = auth.uid())))));


--
-- Name: exercises Users can delete own exercises; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own exercises" ON public.exercises FOR DELETE USING ((EXISTS ( SELECT 1
   FROM (public.workout_sections wsec
     JOIN public.workout_sessions ws ON ((ws.id = wsec.session_id)))
  WHERE ((wsec.id = exercises.section_id) AND (ws.user_id = auth.uid())))));


--
-- Name: locations Users can delete own locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own locations" ON public.locations FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: saved_workouts Users can delete own saved workouts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own saved workouts" ON public.saved_workouts FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: workout_sections Users can delete own sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own sections" ON public.workout_sections FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.workout_sessions ws
  WHERE ((ws.id = workout_sections.session_id) AND (ws.user_id = auth.uid())))));


--
-- Name: workout_sessions Users can delete own sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own sessions" ON public.workout_sessions FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: exercise_set_logs Users can delete their own set logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own set logs" ON public.exercise_set_logs FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ((public.exercises e
     JOIN public.workout_sections ws ON ((ws.id = e.section_id)))
     JOIN public.workout_sessions s ON ((s.id = ws.session_id)))
  WHERE ((e.id = exercise_set_logs.exercise_row_id) AND (s.user_id = auth.uid())))));


--
-- Name: structure_results Users can insert own structure results; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own structure results" ON public.structure_results FOR INSERT WITH CHECK ((section_id IN ( SELECT ws.id
   FROM (public.workout_sections ws
     JOIN public.workout_sessions wses ON ((ws.session_id = wses.id)))
  WHERE (wses.user_id = auth.uid()))));


--
-- Name: exercise_set_logs Users can insert their own set logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own set logs" ON public.exercise_set_logs FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.exercises e
     JOIN public.workout_sections ws ON ((ws.id = e.section_id)))
     JOIN public.workout_sessions s ON ((s.id = ws.session_id)))
  WHERE ((e.id = exercise_set_logs.exercise_row_id) AND (s.user_id = auth.uid())))));


--
-- Name: exercises Users can update own exercises; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own exercises" ON public.exercises FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (public.workout_sections wsec
     JOIN public.workout_sessions ws ON ((ws.id = wsec.session_id)))
  WHERE ((wsec.id = exercises.section_id) AND (ws.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.workout_sections wsec
     JOIN public.workout_sessions ws ON ((ws.id = wsec.session_id)))
  WHERE ((wsec.id = exercises.section_id) AND (ws.user_id = auth.uid())))));


--
-- Name: locations Users can update own locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own locations" ON public.locations FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: saved_workouts Users can update own saved workouts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own saved workouts" ON public.saved_workouts FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: workout_sections Users can update own sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own sections" ON public.workout_sections FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.workout_sessions ws
  WHERE ((ws.id = workout_sections.session_id) AND (ws.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workout_sessions ws
  WHERE ((ws.id = workout_sections.session_id) AND (ws.user_id = auth.uid())))));


--
-- Name: workout_sessions Users can update own sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own sessions" ON public.workout_sessions FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: structure_results Users can update own structure results; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own structure results" ON public.structure_results FOR UPDATE USING ((section_id IN ( SELECT ws.id
   FROM (public.workout_sections ws
     JOIN public.workout_sessions wses ON ((ws.session_id = wses.id)))
  WHERE (wses.user_id = auth.uid()))));


--
-- Name: exercise_set_logs Users can update their own set logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own set logs" ON public.exercise_set_logs FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ((public.exercises e
     JOIN public.workout_sections ws ON ((ws.id = e.section_id)))
     JOIN public.workout_sessions s ON ((s.id = ws.session_id)))
  WHERE ((e.id = exercise_set_logs.exercise_row_id) AND (s.user_id = auth.uid())))));


--
-- Name: saved_workout_completions Users can view own completion records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own completion records" ON public.saved_workout_completions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.saved_workouts
  WHERE ((saved_workouts.id = saved_workout_completions.saved_workout_id) AND (saved_workouts.user_id = auth.uid())))));


--
-- Name: exercises Users can view own exercises; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own exercises" ON public.exercises FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.workout_sections wsec
     JOIN public.workout_sessions ws ON ((ws.id = wsec.session_id)))
  WHERE ((wsec.id = exercises.section_id) AND (ws.user_id = auth.uid())))));


--
-- Name: locations Users can view own locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own locations" ON public.locations FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: saved_workouts Users can view own saved workouts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own saved workouts" ON public.saved_workouts FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: workout_sections Users can view own sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own sections" ON public.workout_sections FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.workout_sessions ws
  WHERE ((ws.id = workout_sections.session_id) AND (ws.user_id = auth.uid())))));


--
-- Name: workout_sessions Users can view own sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own sessions" ON public.workout_sessions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: structure_results Users can view own structure results; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own structure results" ON public.structure_results FOR SELECT USING ((section_id IN ( SELECT ws.id
   FROM (public.workout_sections ws
     JOIN public.workout_sessions wses ON ((ws.session_id = wses.id)))
  WHERE (wses.user_id = auth.uid()))));


--
-- Name: exercise_set_logs Users can view their own set logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own set logs" ON public.exercise_set_logs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ((public.exercises e
     JOIN public.workout_sections ws ON ((ws.id = e.section_id)))
     JOIN public.workout_sessions s ON ((s.id = ws.session_id)))
  WHERE ((e.id = exercise_set_logs.exercise_row_id) AND (s.user_id = auth.uid())))));


--
-- Name: exercise_anchors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exercise_anchors ENABLE ROW LEVEL SECURITY;

--
-- Name: exercise_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exercise_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: exercise_muscle_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exercise_muscle_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: exercise_set_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exercise_set_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: exercises; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

--
-- Name: locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

--
-- Name: movement_patterns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.movement_patterns ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: saved_workout_completions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saved_workout_completions ENABLE ROW LEVEL SECURITY;

--
-- Name: saved_workouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saved_workouts ENABLE ROW LEVEL SECURITY;

--
-- Name: structure_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.structure_results ENABLE ROW LEVEL SECURITY;

--
-- Name: workout_sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workout_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: workout_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict gZHJsFz7y8eDMcd8EIZKgBcY5lYYNsft2ACRf5LIbsUwkGI8WEzIeFkgHM40IaV

