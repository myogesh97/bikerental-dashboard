-- Promote the project owner's own account to admin, so the Phase 5
-- admin dashboard actually has an admin to log in as. role is a trust
-- boundary (profiles_prevent_role_self_update trigger) - only a
-- service_role/migration session can set it, never the API, per
-- docs/data-model.md's profiles notes. Scoped to this one specific
-- profiles.id (m.yogesh0197@gmail.com's account, looked up read-only
-- beforehand) rather than a subquery against auth.users - the
-- migration-runner connection doesn't have grants on the auth schema
-- even after SET ROLE service_role (caught by actually running this:
-- first attempt errored "permission denied for table users").
set local role service_role;

update public.profiles
  set role = 'admin'
  where id = '6f3a6b30-b53d-4b6b-8aad-8f9a54536946';

reset role;
