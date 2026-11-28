-- pgTAP coverage for the 2026-11-28 code-review fixes:
-- admin_create_bike_block (admin-only, locked insert) and the
-- schema-level default-privilege fix (new functions no longer
-- auto-grant anon EXECUTE, closing the gap that previously needed a
-- second per-function revoke migration).
-- Run via:
--   supabase db query --remote --yes -f supabase/tests/database/003_review_fixes.sql

begin;
create temporary table tap_output (seq serial, line text);
grant insert, select on tap_output to public;
grant usage, select on sequence tap_output_seq_seq to public;

insert into tap_output(line) select plan(6);

insert into auth.users (id, email, aud, role, instance_id)
values
  ('77777777-7777-7777-7777-777777777777', 'review-customer@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('88888888-8888-8888-8888-888888888888', 'review-admin@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

set local role service_role;
update public.profiles set role = 'admin' where id = '88888888-8888-8888-8888-888888888888';
reset role;

insert into public.bikes (id, slug, name, brand, brand_label, category, price_paise, image_path)
values ('99999999-9999-9999-9999-999999999999', 'test-review-bike', 'Test Review Bike', 'test', 'Test', 'sport', 100000, 'test.jpg');

create or replace function pg_temp.as_user(user_id uuid) returns void as $$
  select set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$ language sql;

create or replace function pg_temp.as_anon() returns void as $$
  select set_config('request.jwt.claims', '', true);
  select set_config('role', 'anon', true);
$$ language sql;

-- ============ admin_create_bike_block access control ============

select pg_temp.as_anon();
insert into tap_output(line) select throws_ok(
  $$ select public.admin_create_bike_block('99999999-9999-9999-9999-999999999999', tstzrange('2027-06-01 00:00:00+05:30', '2027-06-03 00:00:00+05:30'), 'test') $$,
  '42501',
  null,
  'anon cannot call admin_create_bike_block at all (no EXECUTE grant)'
);

select pg_temp.as_user('77777777-7777-7777-7777-777777777777');
insert into tap_output(line) select throws_ok(
  $$ select public.admin_create_bike_block('99999999-9999-9999-9999-999999999999', tstzrange('2027-06-01 00:00:00+05:30', '2027-06-03 00:00:00+05:30'), 'test') $$,
  'P0001',
  'Admin access required.',
  'a plain authenticated customer cannot create a bike block via this function'
);

select pg_temp.as_user('88888888-8888-8888-8888-888888888888');
insert into tap_output(line) select lives_ok(
  $$ select public.admin_create_bike_block('99999999-9999-9999-9999-999999999999', tstzrange('2027-06-01 00:00:00+05:30', '2027-06-03 00:00:00+05:30'), 'scheduled servicing') $$,
  'an admin can create a bike block via admin_create_bike_block'
);

insert into tap_output(line) select results_eq(
  $$ select count(*)::int from public.bike_blocks where bike_id = '99999999-9999-9999-9999-999999999999' $$,
  $$ values (1) $$,
  'the block row actually exists'
);

-- ============ create_booking_hold still rejects the overlapping block ============

select pg_temp.as_user('77777777-7777-7777-7777-777777777777');
insert into tap_output(line) select throws_ok(
  $$ select public.create_booking_hold('99999999-9999-9999-9999-999999999999', '2027-06-02', '2027-06-03') $$,
  'P0001',
  'This bike is unavailable for the selected dates.',
  'create_booking_hold still rejects a hold overlapping a block created via admin_create_bike_block'
);

-- ============ schema-level default-privilege fix ============

-- Catalog check, not a live CREATE FUNCTION: the role this query runs as
-- doesn't have CREATE on schema public (only migrations, run as a more
-- privileged role, do), so this verifies the actual mechanism instead -
-- pg_default_acl's entry for role "postgres" (the role every migration
-- in this project runs as) on public-schema functions should no longer
-- include an "anon=X" grant. That's the real fix behind the anon-EXECUTE
-- bug that previously needed a per-function revoke: any NEW function a
-- future migration creates inherits this default, not a hand-remembered
-- per-function patch.
insert into tap_output(line) select is_empty(
  $$ select 1 from pg_default_acl
     where defaclrole = 'postgres'::regrole
       and defaclnamespace = 'public'::regnamespace
       and defaclobjtype = 'f'
       and defaclacl::text like '%anon=%' $$,
  'postgres-authored functions no longer default-grant EXECUTE to anon (schema-level fix, not a per-function patch)'
);

insert into tap_output(line) select * from finish();

select line from tap_output order by seq;
rollback;
