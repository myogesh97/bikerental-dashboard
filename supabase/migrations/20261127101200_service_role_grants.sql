-- service_role is used by Edge Functions (Phase 4+) and needs to act
-- on every table (it BYPASSRLS so row policies never restrict it, but
-- that only skips *row-level* security - it still needs the base
-- table GRANT like every other role, which this project's manually
-- authored schema does not get automatically the way Supabase's
-- dashboard table editor would have provided it).
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
