-- pgTAP test suite for Phase 3's booking functions:
-- create_booking_hold, cancel_booking_hold, get_bike_blocked_ranges.
-- Run via:
--   supabase db query --remote --yes -f supabase/tests/database/002_booking_functions.sql
-- Wrapped in BEGIN/ROLLBACK so it leaves no residue in the real
-- database regardless of pass/fail, same pattern as 001.

begin;
create temporary table tap_output (seq serial, line text);
grant insert, select on tap_output to public;
grant usage, select on sequence tap_output_seq_seq to public;

insert into tap_output(line) select plan(15);

-- ============ Fixtures ============
insert into auth.users (id, email, aud, role, instance_id)
values
  ('44444444-4444-4444-4444-444444444444', 'booking-customer-a@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('55555555-5555-5555-5555-555555555555', 'booking-customer-b@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('66666666-6666-6666-6666-666666666666', 'booking-admin@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

set local role service_role;
update public.profiles set role = 'admin' where id = '66666666-6666-6666-6666-666666666666';
reset role;

insert into public.bikes (id, slug, name, brand, brand_label, category, price_paise, image_path)
values
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'test-booking-bike', 'Test Booking Bike', 'test', 'Test', 'sport', 100000, 'test.jpg'),
  ('11111111-2222-3333-4444-555555555555', 'test-inactive-booking-bike', 'Test Inactive Booking Bike', 'test', 'Test', 'sport', 100000, 'test.jpg');
update public.bikes set is_active = false where id = '11111111-2222-3333-4444-555555555555';

create or replace function pg_temp.as_user(user_id uuid) returns void as $$
  select set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$ language sql;

create or replace function pg_temp.as_anon() returns void as $$
  select set_config('request.jwt.claims', '', true);
  select set_config('role', 'anon', true);
$$ language sql;

-- ============ create_booking_hold: authorization ============

select pg_temp.as_anon();
insert into tap_output(line) select throws_ok(
  $$ select public.create_booking_hold('ffffffff-ffff-ffff-ffff-ffffffffffff', '2027-03-01', '2027-03-03') $$,
  '42501',
  null,
  'anon cannot call create_booking_hold at all (no EXECUTE grant)'
);

-- ============ create_booking_hold: validation ============

select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
insert into tap_output(line) select throws_ok(
  $$ select public.create_booking_hold('ffffffff-ffff-ffff-ffff-ffffffffffff', '2027-03-03', '2027-03-01') $$,
  'P0001',
  'Return date must be after the pickup date.',
  'end date before start date is rejected'
);

insert into tap_output(line) select throws_ok(
  $$ select public.create_booking_hold('ffffffff-ffff-ffff-ffff-ffffffffffff', '2020-01-01', '2020-01-03') $$,
  'P0001',
  'Pickup date cannot be in the past.',
  'a past pickup date is rejected'
);

insert into tap_output(line) select throws_ok(
  $$ select public.create_booking_hold('11111111-2222-3333-4444-555555555555', '2027-03-01', '2027-03-03') $$,
  'P0001',
  'This bike is not available for booking.',
  'booking an inactive bike is rejected'
);

-- ============ create_booking_hold: happy path + pricing ============

insert into tap_output(line) select results_eq(
  $$ select status, amount_due_paise, advance_amount_paise
     from public.create_booking_hold('ffffffff-ffff-ffff-ffff-ffffffffffff', '2027-03-01', '2027-03-03') $$,
  $$ values ('held', 200000, 200000) $$,
  'a valid hold is created: status=held, 2 nights at 100000 paise/day, 100% advance means advance=amount_due'
);

insert into tap_output(line) select results_eq(
  $$ select count(*)::int from public.bookings
     where bike_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff' and customer_id = '44444444-4444-4444-4444-444444444444' $$,
  $$ values (1) $$,
  'the hold row actually exists and belongs to the requesting customer'
);

-- ============ create_booking_hold: conflict prevention ============

select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
insert into tap_output(line) select throws_ok(
  $$ select public.create_booking_hold('ffffffff-ffff-ffff-ffff-ffffffffffff', '2027-03-02', '2027-03-04') $$,
  'P0001',
  'This bike is no longer available for the selected dates.',
  'an overlapping hold by a different customer is rejected with a clean message (exclusion_violation translated)'
);

insert into tap_output(line) select lives_ok(
  $$ select public.create_booking_hold('ffffffff-ffff-ffff-ffff-ffffffffffff', '2027-04-01', '2027-04-03') $$,
  'a non-overlapping hold for the same bike by a different customer succeeds'
);

-- ============ bike_blocks overlap ============

set local role service_role;
insert into public.bike_blocks (bike_id, during, reason, created_by)
values (
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  tstzrange('2027-05-01 00:00:00+05:30', '2027-05-05 00:00:00+05:30'),
  'scheduled maintenance',
  '66666666-6666-6666-6666-666666666666'
);
reset role;

select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
insert into tap_output(line) select throws_ok(
  $$ select public.create_booking_hold('ffffffff-ffff-ffff-ffff-ffffffffffff', '2027-05-02', '2027-05-03') $$,
  'P0001',
  'This bike is unavailable for the selected dates.',
  'a maintenance block (not the exclusion constraint) also blocks a hold request'
);

-- ============ cancel_booking_hold ============

select pg_temp.as_user('55555555-5555-5555-5555-555555555555');

-- customer B's hold from the non-overlapping-success test above:
insert into tap_output(line) select ok(
  (select id from public.bookings
     where bike_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
       and customer_id = '55555555-5555-5555-5555-555555555555'
       and status = 'held') is not null,
  'fixture check: customer B has a held booking to cancel'
);

select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
insert into tap_output(line) select throws_ok(
  $$ select public.cancel_booking_hold(
       (select id from public.bookings
          where bike_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
            and customer_id = '55555555-5555-5555-5555-555555555555'
            and status = 'held')
     ) $$,
  'P0001',
  'Booking not found or can no longer be cancelled.',
  'customer A cannot cancel customer B''s held booking'
);

select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
insert into tap_output(line) select results_eq(
  $$ select status from public.cancel_booking_hold(
       (select id from public.bookings
          where bike_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
            and customer_id = '55555555-5555-5555-5555-555555555555'
            and status = 'held')
     ) $$,
  $$ values ('cancelled_by_customer') $$,
  'customer B can cancel their own held booking'
);

insert into tap_output(line) select lives_ok(
  $$ select public.create_booking_hold('ffffffff-ffff-ffff-ffff-ffffffffffff', '2027-04-01', '2027-04-03') $$,
  'the cancelled booking''s dates are bookable again (cancelled status is not in the exclusion constraint''s WHERE clause)'
);

-- ============ get_bike_blocked_ranges ============

select pg_temp.as_anon();
insert into tap_output(line) select ok(
  (select count(*) from public.get_bike_blocked_ranges('ffffffff-ffff-ffff-ffff-ffffffffffff')) >= 3,
  'anon can call get_bike_blocked_ranges and sees the held bookings + the maintenance block, with no auth required'
);

insert into tap_output(line) select is_empty(
  $$ select * from public.get_bike_blocked_ranges('ffffffff-ffff-ffff-ffff-ffffffffffff')
     where start_at is null $$,
  'get_bike_blocked_ranges never leaks a null/customer-identifying row - only real ranges'
);

insert into tap_output(line) select * from finish();

select line from tap_output order by seq;
rollback;
