\set ON_ERROR_STOP on

-- Rollback-only dependency owned by auth.users, and therefore not selected by
-- pg_restore --schema=public. The referenced legacy function is restored first.
begin;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

commit;
