-- Code review (2026-11-28) findings fixed here:
--
-- 1. TOCTOU race between create_booking_hold's bike_blocks overlap check
--    and its own insert. Booking-vs-booking conflicts are protected by
--    the bookings_no_overlap EXCLUDE constraint, but bike_blocks has no
--    such constraint tying it to bookings - under READ COMMITTED, an
--    admin inserting a maintenance block and a customer calling
--    create_booking_hold for the same bike/overlapping dates can
--    interleave so the customer's plain `select exists(...)` check runs
--    and returns false just before the admin's block commits, letting a
--    hold through that overlaps a maintenance window with nothing left
--    to catch it afterward. Fixed with a per-bike advisory lock taken at
--    the top of the function's critical section (serializes concurrent
--    create_booking_hold calls for the same bike_id; auto-released at
--    transaction end, so it can't be leaked by an error or an early
--    return).
--
-- 2. supabase/migrations/20261128120100_fix_booking_function_grants.sql
--    is itself a symptom of a deeper default-privilege gap, not just a
--    one-off typo: Supabase grants EXECUTE on every new public-schema
--    function to anon/authenticated/service_role at the platform level
--    regardless of what this project's own migrations grant, so each
--    new SECURITY DEFINER function silently inherits anon EXECUTE
--    unless someone remembers a second, function-named revoke -
--    exactly the failure mode that already slipped through once.
--    Fixed at the schema level so new functions default-deny anon
--    without relying on per-function memory.
alter default privileges in schema public revoke execute on functions from public, anon;

create or replace function public.create_booking_hold(
  p_bike_id uuid,
  p_start_date date,
  p_end_date date
)
returns public.bookings
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_customer_id uuid := auth.uid();
  v_bike public.bikes;
  v_config public.business_config;
  v_nights integer;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_amount_due_paise integer;
  v_advance_amount_paise integer;
  v_booking public.bookings;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if v_customer_id is null then
    raise exception 'You must be logged in to book a bike.';
  end if;

  if p_start_date < v_today then
    raise exception 'Pickup date cannot be in the past.';
  end if;

  if p_end_date <= p_start_date then
    raise exception 'Return date must be after the pickup date.';
  end if;

  v_nights := p_end_date - p_start_date;

  select * into v_bike from public.bikes where id = p_bike_id and is_active = true;
  if v_bike.id is null then
    raise exception 'This bike is not available for booking.';
  end if;

  select * into v_config from public.business_config where id = 1;

  if v_nights < v_config.min_rental_days then
    raise exception 'Minimum rental is % day(s).', v_config.min_rental_days;
  end if;

  if v_config.max_rental_days is not null and v_nights > v_config.max_rental_days then
    raise exception 'Maximum rental is % day(s).', v_config.max_rental_days;
  end if;

  if v_config.advance_percent is null then
    raise exception 'Online booking is not yet configured. Please contact us directly.';
  end if;

  v_start_at := (p_start_date::timestamp) at time zone 'Asia/Kolkata';
  v_end_at := (p_end_date::timestamp) at time zone 'Asia/Kolkata';

  -- Serializes concurrent create_booking_hold calls (and races against an
  -- admin's bike_blocks insert) for this one bike - held for the rest of
  -- this transaction, released automatically on commit/rollback.
  perform pg_advisory_xact_lock(hashtextextended(p_bike_id::text, 0));

  perform public.expire_stale_holds();

  if exists (
    select 1 from public.bike_blocks
    where bike_id = p_bike_id
      and during && tstzrange(v_start_at, v_end_at)
  ) then
    raise exception 'This bike is unavailable for the selected dates.';
  end if;

  v_amount_due_paise := v_bike.price_paise * v_nights;
  v_advance_amount_paise := ceil(v_amount_due_paise * v_config.advance_percent / 100.0)::integer;

  begin
    insert into public.bookings (
      customer_id, bike_id, start_at, end_at,
      amount_due_paise, advance_amount_paise, hold_expires_at
    ) values (
      v_customer_id, p_bike_id, v_start_at, v_end_at,
      v_amount_due_paise, v_advance_amount_paise,
      now() + (v_config.hold_minutes || ' minutes')::interval
    )
    returning * into v_booking;
  exception
    when exclusion_violation then
      raise exception 'This bike is no longer available for the selected dates.';
  end;

  return v_booking;
end;
$$;

revoke all on function public.create_booking_hold(uuid, date, date) from public, anon;
grant execute on function public.create_booking_hold(uuid, date, date) to authenticated;

-- bike_blocks writes (admin.js's addBlockForm) should also respect the
-- same per-bike lock, so an admin's insert can't land in the gap between
-- a concurrent create_booking_hold's check and its insert either.
create or replace function public.admin_create_bike_block(
  p_bike_id uuid,
  p_during tstzrange,
  p_reason text
)
returns public.bike_blocks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_block public.bike_blocks;
begin
  if not public.is_admin() then
    raise exception 'Admin access required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_bike_id::text, 0));

  insert into public.bike_blocks (bike_id, during, reason, created_by)
  values (p_bike_id, p_during, p_reason, auth.uid())
  returning * into v_block;

  return v_block;
end;
$$;

revoke all on function public.admin_create_bike_block(uuid, tstzrange, text) from public, anon;
grant execute on function public.admin_create_bike_block(uuid, tstzrange, text) to authenticated;

comment on function public.admin_create_bike_block(uuid, tstzrange, text) is
  'Admin-only bike_blocks insert that takes the same per-bike advisory lock as create_booking_hold, closing the TOCTOU gap a plain direct-table insert (bike_blocks_write_admin RLS) would leave open against a concurrent booking-hold attempt.';
