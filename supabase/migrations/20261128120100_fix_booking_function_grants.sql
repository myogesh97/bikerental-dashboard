-- Fix: Supabase grants EXECUTE on newly-created public-schema functions
-- to anon/authenticated/service_role by default (a platform-level
-- ALTER DEFAULT PRIVILEGES, not something visible in our own migrations),
-- independently of the schema's PUBLIC pseudo-role. The previous
-- migration's "revoke all ... from public" only revoked the PUBLIC
-- grant, not anon's own default grant - caught by pgTAP test 1 in
-- 002_booking_functions.sql, which expected anon to get 42501
-- (permission denied) and instead got all the way into the function
-- body (P0001 "must be logged in"). anon must never be able to create
-- or cancel a booking; only get_bike_blocked_ranges is meant to be
-- anon-callable.
revoke execute on function public.create_booking_hold(uuid, date, date) from anon;
revoke execute on function public.cancel_booking_hold(uuid) from anon;
revoke execute on function public.expire_stale_holds() from anon;
