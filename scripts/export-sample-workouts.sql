-- Export your 3 most recent generated workouts as JSON.
--
-- WHERE TO RUN IT
--   1. supabase.com/dashboard → open your Clear project
--      (if it says "Paused", hit Restore and wait ~2 min)
--   2. Left sidebar → SQL Editor → New query
--   3. Paste this whole file, press Run (or ⌘↵)
--   4. Three rows come back, each one a complete workout.
--      Click a cell to expand it, then copy — or use the download button
--      above the results grid to save as CSV/JSON.
--
-- Nothing here writes or changes anything. It only reads.

WITH ex AS (
  SELECT
    e.section_id,
    jsonb_agg(
      jsonb_build_object(
        'exercise_id',    e.exercise_id,
        'name',           d.name,
        'sets',           e.sets,
        'reps',           e.reps,
        'equipment_used', e.equipment_used,
        'effort_percent', e.effort_percent,
        'tempo',          e.tempo,
        'rest_seconds',   e.rest_seconds,
        'coaching_cues',  e.coaching_cues,
        'structure',      e.structure
      ) ORDER BY e.order_index
    ) AS exercises
  FROM exercises e
  LEFT JOIN exercise_definitions d ON d.id = e.exercise_id
  GROUP BY e.section_id
),
sec AS (
  SELECT
    ws.session_id,
    jsonb_agg(
      jsonb_build_object(
        'section_type',   ws.section_type,
        'section_notes',  ws.section_notes,
        'exercises',      COALESCE(ex.exercises, '[]'::jsonb)
      ) ORDER BY ws.order_index
    ) AS sections
  FROM workout_sections ws
  LEFT JOIN ex ON ex.section_id = ws.id
  GROUP BY ws.session_id
)
SELECT jsonb_pretty(
  jsonb_build_object(
    'generated_for', jsonb_build_object(
      'goal',                 s.goal_preset,
      'intensity',            s.intensity,
      'anchor',               s.anchor,
      'duration_target_mins', s.time_target_mins,
      'duration_actual_mins', s.duration_mins,
      'prompt_version',       s.prompt_version,
      'date',                 s.date
    ),
    'sections', sec.sections
  )
) AS workout_json
FROM workout_sessions s
JOIN sec ON sec.session_id = s.id
WHERE s.is_rest_day IS NOT TRUE
ORDER BY s.date DESC
LIMIT 3;
