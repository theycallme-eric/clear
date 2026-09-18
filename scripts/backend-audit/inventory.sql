-- REQ-008 read-only live inventory of the reused Supabase project (qxckevxniacktaqecypl).
-- Every statement is a SELECT against catalogs or a COUNT; nothing here mutates state.
-- Run via: npm run backend:inventory  (scripts/backend-audit/inventory.sh)

\echo '=== server version ==='
SELECT version();

\echo '=== applied migrations (supabase bookkeeping) ==='
SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version;

\echo '=== tables (public) ==='
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       pg_catalog.obj_description(c.oid) AS comment
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

\echo '=== per-table row counts (public) ==='
SELECT relname AS table_name, n_live_tup AS approx_rows
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY relname;

\echo '=== exact catalog counts (the 140-vs-173 question) ==='
SELECT 'exercise_definitions' AS dataset, count(*) FROM exercise_definitions
UNION ALL SELECT 'exercise_anchors', count(*) FROM exercise_anchors
UNION ALL SELECT 'exercise_muscle_groups', count(*) FROM exercise_muscle_groups;

\echo '=== exercise_definitions taxonomy completeness ==='
SELECT count(*) AS total,
       count(*) FILTER (WHERE component_movements IS NOT NULL) AS with_components,
       count(*) FILTER (WHERE exercise_role IS NOT NULL) AS with_role
FROM exercise_definitions;

\echo '=== views (public) ==='
SELECT table_name FROM information_schema.views
WHERE table_schema = 'public' ORDER BY table_name;

\echo '=== enums and values ==='
SELECT t.typname AS enum_name,
       array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
GROUP BY t.typname ORDER BY t.typname;

\echo '=== functions / RPCs (public) ==='
SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       CASE WHEN p.prosecdef THEN 'definer' ELSE 'invoker' END AS security
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname;

\echo '=== RLS policies ==='
SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

\echo '=== triggers (public + auth) ==='
SELECT event_object_schema, event_object_table, trigger_name, action_timing,
       string_agg(event_manipulation, ',') AS events
FROM information_schema.triggers
WHERE event_object_schema IN ('public', 'auth')
GROUP BY 1, 2, 3, 4
ORDER BY 1, 2, 3;

\echo '=== installed extensions ==='
SELECT extname, extversion FROM pg_extension ORDER BY extname;

\echo '=== auth population size (count only — no personal data) ==='
SELECT count(*) AS auth_users FROM auth.users;

\echo '=== inventory complete (read-only) ==='
