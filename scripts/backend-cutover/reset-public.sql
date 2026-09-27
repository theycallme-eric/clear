\set ON_ERROR_STOP on

-- TASK-072's one destructive database step. The full dump and checksum must
-- be verified before this file is run. Supabase-managed schemas are untouched.
begin;

drop schema public cascade;
create schema public authorization pg_database_owner;
comment on schema public is 'standard public schema';

-- Restore the live project's existing schema ACL. Only the database owner may
-- create objects; API roles receive usage and object privileges from migrations.
grant usage on schema public to public, postgres, anon, authenticated, service_role;

-- Migrations run as postgres. Recreate the defaults that existed immediately
-- before the cutover so future postgres-owned objects retain Supabase access.
alter default privileges for role postgres in schema public
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant select, update, usage on sequences to postgres, anon, authenticated, service_role;

commit;

