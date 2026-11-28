-- Phase 3: booking-hold creation, cancellation, and public availability.
-- The double-booking guard itself (EXCLUDE USING gist) already exists on
-- bookings (see 20261127100500_bookings.sql) - these functions are the
-- only sanctioned way a client creates/cancels a booking row, per the
-- "no direct insert/update policy for customers" comment on that table.
--
-- advance_percent: set to 100 per explicit project-owner decision
-- (2026-11-28) - this is a non-production learning project with no real
-- payment flow yet, so "pay the full amount up front, no partial-advance
-- math" was chosen over inventing a percentage. Deliberately NOT setting
-- security_deposit_min/max_paise here - the booking-hold flow below
-- doesn't read them (deposit is collected offline at pickup, per
-- docs/data-model.md), so there's nothing to unblock yet.
update public.business_config set advance_percent = 100 where id = 1;

-- No pg_cron extension on this hosted project (checked - not installed,
-- and enabling it is a dashboard-level decision this migration shouldn't
-- make unilaterally). Expired holds are self-healed inline by
-- create_booking_hold instead of relying on a scheduled job: any held
-- row past its hold_expires_at is flipped to 'expired' before a new hold
-- is attempted, which is the only moment a stale hold can actually block
-- someone. A real pg_cron job remains a reasonable future addition if a
-- "released the second it expires" guarantee is ever needed instead of
-- "released the next time someone tries to book."
create or replace function public.expire_stale_holds()
returns void
language sql
security definer
set search_path = public
as $$
  update public.bookings
    set status = 'expired'
    where status = 'held' and hold_expires_at < now();
$$;

revoke all on function public.expire_stale_holds() from public;
grant execute on function public.expire_stale_holds() to authenticated, service_role;

comment on function public.expire_stale_holds() is
  'Flips any held booking past its hold_expires_at to expired. Called inline by create_booking_hold (no pg_cron on this project yet); also callable directly by an admin/service_role for manual cleanup.';

-- Public availability: which date ranges are already taken for a bike,
-- across both real bookings (held-and-not-expired/confirmed/picked_up)
-- and admin-set maintenance blocks. SECURITY DEFINER + its own narrow
-- SELECT (not a straight passthrough) because bookings' own RLS policy
-- restricts SELECT to "your own booking or admin" - this function
-- deliberately exposes only the date ranges, never customer_id or any
-- other column, so an anonymous visitor checking availability doesn't
-- need an account and never learns who booked what.
create or replace function public.get_bike_blocked_ranges(p_bike_id uuid)
returns table (start_at timestamptz, end_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select start_at, end_at
  from public.bookings
  where bike_id = p_bike_id
    and (
      status in ('confirmed', 'picked_up')
      or (status = 'held' and hold_expires_at > now())
    )
  union all
  select lower(during), upper(during)
  from public.bike_blocks
  where bike_id = p_bike_id
    and upper(during) > now();
$$;

revoke all on function public.get_bike_blocked_ranges(uuid) from public;
grant execute on function public.get_bike_blocked_ranges(uuid) to anon, authenticated;

comment on function public.get_bike_blocked_ranges(uuid) is
  'Public (anon-callable) list of date ranges a bike is NOT available for - bookings + maintenance blocks merged. Exposes only start_at/end_at, nothing identifying who/why, so it is safe for anonymous callers.';

-- create_booking_hold: the one way a customer creates a booking.
-- Validates the request, computes the price server-side (the client
-- never sends a price - hard rule), then inserts - letting the
-- exclusion constraint be the final, race-proof word on whether the
-- slot was actually free. Whole-day, IST-midnight-aligned bookings per
-- docs/data-model.md.
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

revoke all on function public.create_booking_hold(uuid, date, date) from public;
grant execute on function public.create_booking_hold(uuid, date, date) to authenticated;

comment on function public.create_booking_hold(uuid, date, date) is
  'The only sanctioned way a customer creates a booking. Computes price server-side from bikes.price_paise and business_config, then inserts as status=held - the exclusion constraint on bookings is the final race-proof guard, translated here into a clean error instead of a raw 23P01.';

-- cancel_booking_hold: lets a customer back out of their own held
-- (not yet paid) booking. Deliberately scoped to status='held' only -
-- cancelling a confirmed booking is Phase 6's refund-aware flow, a
-- different operation with different business rules.
create or replace function public.cancel_booking_hold(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  update public.bookings
    set status = 'cancelled_by_customer',
        cancelled_at = now(),
        cancellation_reason = 'Customer cancelled before payment'
    where id = p_booking_id
      and customer_id = auth.uid()
      and status = 'held'
    returning * into v_booking;

  if v_booking.id is null then
    raise exception 'Booking not found or can no longer be cancelled.';
  end if;

  return v_booking;
end;
$$;

revoke all on function public.cancel_booking_hold(uuid) from public;
grant execute on function public.cancel_booking_hold(uuid) to authenticated;

comment on function public.cancel_booking_hold(uuid) is
  'Lets a customer cancel their own still-held (unpaid) booking. Confirmed-booking cancellation with refund math is Phase 6, not this function.';
