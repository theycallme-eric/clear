\set ON_ERROR_STOP on

-- TASK-072: fail closed unless the reused project is still at the exact
-- audited legacy boundary. This file is read-only.
begin transaction read only;

do $$
declare
  migration_count integer;
  rebuild_count integer;
  definition_count integer;
  anchor_count integer;
  muscle_count integer;
  pattern_count integer;
  user_count integer;
begin
  select count(*) into migration_count
  from supabase_migrations.schema_migrations
  where version ~ '^000[0-9]{2}$';

  select count(*) into rebuild_count
  from supabase_migrations.schema_migrations
  where version like '20260921%';

  select count(*) into definition_count from public.exercise_definitions;
  select count(*) into anchor_count from public.exercise_anchors;
  select count(*) into muscle_count from public.exercise_muscle_groups;
  select count(*) into pattern_count from public.movement_patterns;
  select count(*) into user_count from auth.users;

  if migration_count <> 29 or rebuild_count <> 0 then
    raise exception
      'TASK-072 preflight: migration ledger drift (legacy %, rebuild %)',
      migration_count, rebuild_count;
  end if;

  if definition_count <> 140 or anchor_count <> 150
     or muscle_count <> 488 or pattern_count <> 27 then
    raise exception
      'TASK-072 preflight: preservation counts drifted (%, %, %, %)',
      definition_count, anchor_count, muscle_count, pattern_count;
  end if;

  if user_count <> 8 then
    raise exception
      'TASK-072 preflight: expected 8 disposable test users, found %',
      user_count;
  end if;
end;
$$;

rollback;

