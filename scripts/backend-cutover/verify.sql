\set ON_ERROR_STOP on

-- TASK-072 post-cutover database assertions. Read-only; any mismatch aborts.
begin transaction read only;

do $$
declare
  legacy_count integer;
  rebuild_count integer;
  definition_count integer;
  muscle_count integer;
  pattern_weight_count integer;
  user_count integer;
  missing_tables text[];
begin
  select count(*) into legacy_count
  from supabase_migrations.schema_migrations
  where version ~ '^000[0-9]{2}$';

  select count(*) into rebuild_count
  from supabase_migrations.schema_migrations
  where version between '20260921000000' and '20260921000017';

  select count(*) into definition_count from public.exercise_definitions;
  select count(*) into muscle_count from public.exercise_muscle_groups;
  select count(*) into pattern_weight_count from public.exercise_pattern_weights;
  select count(*) into user_count from auth.users;

  select array_agg(expected.table_name order by expected.table_name)
    into missing_tables
  from unnest(array[
    'block_results', 'component_pattern_map', 'exercise_definitions',
    'exercise_muscle_groups', 'exercise_pattern_weights', 'exercise_set_logs',
    'focus_pattern_map', 'load_anchors', 'location_equipment', 'locations',
    'profiles', 'rest_days', 'saved_workout_completions', 'saved_workouts',
    'user_constraints', 'workout_blocks', 'workout_exercises',
    'workout_sections', 'workout_sessions'
  ]) as expected(table_name)
  where to_regclass('public.' || expected.table_name) is null;

  if legacy_count <> 0 or rebuild_count <> 18 then
    raise exception
      'TASK-072 verification: migration ledger mismatch (legacy %, rebuild %)',
      legacy_count, rebuild_count;
  end if;

  if definition_count <> 140 or muscle_count <> 488
     or pattern_weight_count <> 102 then
    raise exception
      'TASK-072 verification: catalog mismatch (definitions %, muscles %, weights %)',
      definition_count, muscle_count, pattern_weight_count;
  end if;

  if user_count <> 0 then
    raise exception
      'TASK-072 verification: disposable auth population remains (%)', user_count;
  end if;

  if missing_tables is not null then
    raise exception
      'TASK-072 verification: expected tables are missing (%)', missing_tables;
  end if;

  if to_regclass('public.movement_patterns') is not null
     or to_regclass('public.exercise_anchors') is not null
     or to_regclass('public.exercises') is not null
     or to_regclass('public.structure_results') is not null then
    raise exception 'TASK-072 verification: one or more retired tables remain';
  end if;
end;
$$;

rollback;

