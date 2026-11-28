-- pgTAP test suite for RLS policies and the double-booking exclusion
-- constraint. Run via:
--   supabase db query --remote --yes -f supabase/tests/database/001_rls_and_constraints.sql
-- Wrapped in BEGIN/ROLLBACK so it leaves no residue in the real
-- database regardless of pass/fail. Every TAP-emitting call is routed
-- through tap_output so the final SELECT (the only one the CLI's
-- single-result-set output shows) contains the full TAP stream, not
-- just the last statement.

begin;
create temporary table tap_output (seq serial, line text);
grant insert, select on tap_output to public;
grant usage, select on sequence tap_output_seq_seq to public;

insert into tap_output(line) select plan(26);

-- ============ Fixtures ============
insert into auth.users (id, email, aud, role, instance_id)
values
  ('11111111-1111-1111-1111-111111111111', 'customer-a@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('22222222-2222-2222-2222-222222222222', 'customer-b@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('33333333-3333-3333-3333-333333333333', 'admin@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

set local role service_role;
update public.profiles set role = 'admin' where id = '33333333-3333-3333-3333-333333333333';
reset role;

insert into public.bikes (id, slug, name, brand, brand_label, category, price_paise, image_path)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test-active-bike', 'Test Active Bike', 'test', 'Test', 'sport', 100000, 'test.jpg'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'test-inactive-bike', 'Test Inactive Bike', 'test', 'Test', 'sport', 100000, 'test.jpg');
update public.bikes set is_active = false where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

create or replace function pg_temp.as_user(user_id uuid) returns void as $$
  select set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$ language sql;

create or replace function pg_temp.as_anon() returns void as $$
  select set_config('request.jwt.claims', '', true);
  select set_config('role', 'anon', true);
$$ language sql;

-- ============ bikes RLS ============

select pg_temp.as_anon();
insert into tap_output(line) select results_eq(
  $$ select slug from public.bikes where slug like 'test-%' order by slug $$,
  $$ values ('test-active-bike') $$,
  'anon sees only the active test bike, not the inactive test bike'
);

insert into tap_output(line) select throws_ok(
  $$ update public.bikes set price_paise = 1 where slug = 'test-active-bike' $$,
  '42501',
  null,
  'anon cannot update a bike (no UPDATE grant)'
);

-- RLS denies an UPDATE by filtering it to 0 matched rows, not by
-- throwing - so the real assertion is "the value didn't change",
-- not "an exception was thrown" (found via a first test run that
-- wrongly used throws_ok here and failed, revealing this).
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
update public.bikes set price_paise = 1 where slug = 'test-active-bike';
insert into tap_output(line) select isnt(
  (select price_paise from public.bikes where slug = 'test-active-bike')::text,
  '1',
  'a plain customer''s UPDATE on a bike silently matches zero rows (RLS requires is_admin())'
);

select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
insert into tap_output(line) select lives_ok(
  $$ update public.bikes set price_paise = 150000 where slug = 'test-active-bike' $$,
  'an admin CAN update a bike'
);

-- ============ profiles RLS ============

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into tap_output(line) select results_eq(
  $$ select count(*)::int from public.profiles $$,
  $$ values (1) $$,
  'a customer sees exactly their own profile row, not other customers'
);

insert into tap_output(line) select lives_ok(
  $$ update public.profiles set full_name = 'Customer A' where id = '11111111-1111-1111-1111-111111111111' $$,
  'a customer can update their own full_name'
);

insert into tap_output(line) select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '11111111-1111-1111-1111-111111111111' $$,
  'P0001',
  'role cannot be changed from a client session',
  'a customer cannot grant themself admin via direct UPDATE'
);

select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
insert into tap_output(line) select ok(
  (select count(*) from public.profiles) >= 3,
  'an admin sees all profiles, not just their own'
);

-- ============ bookings RLS + exclusion constraint ============

set local role service_role;
insert into public.bookings (id, customer_id, bike_id, start_at, end_at, amount_due_paise, advance_amount_paise, status)
values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '2027-01-10 00:00:00+05:30',
  '2027-01-12 00:00:00+05:30',
  200000, 50000, 'confirmed'
);
reset role;

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into tap_output(line) select results_eq(
  $$ select count(*)::int from public.bookings $$,
  $$ values (1) $$,
  'customer A sees their own booking'
);

select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
insert into tap_output(line) select results_eq(
  $$ select count(*)::int from public.bookings $$,
  $$ values (0) $$,
  'customer B cannot see customer A''s booking (RLS, not just no rows matching a filter)'
);

insert into tap_output(line) select is_empty(
  $$ select * from public.bookings where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and customer_id = '11111111-1111-1111-1111-111111111111' $$,
  'customer B cannot read booking A even by guessing its id + customer_id directly in a query'
);

select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
insert into tap_output(line) select results_eq(
  $$ select count(*)::int from public.bookings $$,
  $$ values (1) $$,
  'admin sees all bookings'
);

set local role service_role;
insert into tap_output(line) select throws_ok(
  $$ insert into public.bookings (customer_id, bike_id, start_at, end_at, amount_due_paise, advance_amount_paise, status)
     values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
             '2027-01-11 00:00:00+05:30', '2027-01-13 00:00:00+05:30', 200000, 50000, 'held') $$,
  '23P01',
  null,
  'an overlapping booking for the same bike is rejected at the database level (EXCLUDE USING gist)'
);

insert into tap_output(line) select lives_ok(
  $$ insert into public.bookings (customer_id, bike_id, start_at, end_at, amount_due_paise, advance_amount_paise, status, cancelled_at)
     values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
             '2027-01-11 00:00:00+05:30', '2027-01-13 00:00:00+05:30', 200000, 50000, 'cancelled_by_customer', now()) $$,
  'a cancelled booking for the same overlapping dates is allowed (not counted by the exclusion constraint)'
);

insert into tap_output(line) select lives_ok(
  $$ insert into public.bookings (customer_id, bike_id, start_at, end_at, amount_due_paise, advance_amount_paise, status)
     values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
             '2027-02-01 00:00:00+05:30', '2027-02-03 00:00:00+05:30', 200000, 50000, 'held') $$,
  'a non-overlapping booking for the same bike is allowed'
);
reset role;

-- ============ business_config RLS ============

select pg_temp.as_anon();
insert into tap_output(line) select throws_ok(
  $$ select * from public.business_config $$,
  '42501',
  null,
  'anon cannot read business_config at all'
);

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into tap_output(line) select lives_ok(
  $$ select * from public.business_config $$,
  'an authenticated customer CAN read business_config (needs hold_minutes etc. for the booking UI)'
);

update public.business_config set hold_minutes = 99 where id = 1;
insert into tap_output(line) select isnt(
  (select hold_minutes from public.business_config where id = 1)::text,
  '99',
  'a customer''s UPDATE on business_config silently matches zero rows (RLS requires is_admin())'
);

select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
insert into tap_output(line) select lives_ok(
  $$ update public.business_config set hold_minutes = 20 where id = 1 $$,
  'an admin CAN update business_config'
);

insert into tap_output(line) select is(
  (select count(*)::int from public.business_config),
  1,
  'business_config stays a singleton (id=1 check)'
);

-- ============ audit_log ============

select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
insert into tap_output(line) select ok(
  (select count(*) from public.audit_log where table_name = 'bikes') > 0,
  'audit_log recorded the bikes UPDATE via trigger, not app code'
);

insert into tap_output(line) select ok(
  (select count(*) from public.audit_log where table_name = 'business_config') > 0,
  'audit_log recorded the business_config UPDATE via trigger'
);

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into tap_output(line) select is_empty(
  $$ select * from public.audit_log $$,
  'a plain customer cannot read audit_log at all (RLS silently returns zero rows)'
);

-- ============ payments RLS ============

set local role service_role;
insert into public.payments (id, booking_id, amount_paise, status)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 50000, 'created');
reset role;

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into tap_output(line) select results_eq(
  $$ select count(*)::int from public.payments $$,
  $$ values (1) $$,
  'customer A sees the payment on their own booking'
);

select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
insert into tap_output(line) select results_eq(
  $$ select count(*)::int from public.payments $$,
  $$ values (0) $$,
  'customer B cannot see customer A''s payment'
);

insert into tap_output(line) select throws_ok(
  $$ update public.payments set status = 'captured' where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' $$,
  null,
  null,
  'no client (not even the owning customer) can write payments directly - only service_role via Edge Functions'
);

insert into tap_output(line) select * from finish();

select line from tap_output order by seq;
rollback;
