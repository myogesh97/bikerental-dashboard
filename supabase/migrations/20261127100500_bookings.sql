-- bookings: the core table. The double-booking guard (the exclusion
-- constraint below) is enforced by Postgres itself, independent of any
-- application code path - see docs/data-model.md and docs/threat-model.md.

create or replace function public.generate_booking_reference()
returns text
language sql
as $$
  select 'BM-' || upper(encode(extensions.gen_random_bytes(5), 'hex'));
$$;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default public.generate_booking_reference(),
  customer_id uuid not null references public.profiles (id),
  bike_id uuid not null references public.bikes (id),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'held' check (
    status in (
      'held', 'confirmed', 'picked_up', 'returned',
      'expired', 'cancelled_by_customer', 'cancelled_by_admin', 'no_show'
    )
  ),
  amount_due_paise integer not null check (amount_due_paise > 0),
  advance_amount_paise integer not null check (advance_amount_paise > 0),
  hold_expires_at timestamptz,
  id_type text check (id_type in ('aadhaar', 'voter_id', 'passport', 'driving_licence')),
  id_verified_at timestamptz,
  id_verified_by uuid references public.profiles (id),
  deposit_collected_at timestamptz,
  deposit_collected_amount_paise integer check (deposit_collected_amount_paise >= 0),
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bookings_end_after_start check (end_at > start_at),
  constraint bookings_advance_not_more_than_due check (advance_amount_paise <= amount_due_paise)
);

comment on column public.bookings.id_type is
  'The CATEGORY of ID checked at pickup only. The document itself (number, image, OCR text) is never stored anywhere, per hard rule.';
comment on column public.bookings.reference is
  'Customer-facing booking reference. Deliberately not the internal uuid id, and not sequential, so it cannot be enumerated or guessed.';

create index bookings_customer_id_idx on public.bookings (customer_id);
create index bookings_bike_id_idx on public.bookings (bike_id);
create index bookings_status_idx on public.bookings (status);

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row
  execute function public.set_updated_at();

-- THE double-booking guard. Two concurrent transactions both trying
-- to hold/confirm/have-picked-up the same bike for overlapping dates
-- cannot both succeed - the second one gets a constraint-violation
-- error (SQLSTATE 23P01) that create_booking_hold() (Phase 3) must
-- translate into a clean "no longer available" response.
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    bike_id with =,
    tstzrange(start_at, end_at) with &&
  ) where (status in ('held', 'confirmed', 'picked_up'));

alter table public.bookings enable row level security;

create policy "bookings_select_own_or_admin"
  on public.bookings for select
  to authenticated
  using (customer_id = auth.uid() or public.is_admin());

-- No direct insert/update/delete policy for customers: all booking
-- creation and state transitions go through SECURITY DEFINER
-- functions (create_booking_hold, cancel_booking, etc. - Phase 3/6)
-- that apply their own business-rule checks before writing, rather
-- than letting a client UPDATE a booking row directly. Those functions
-- run as their definer, not through these policies, by design.

create policy "bookings_update_admin"
  on public.bookings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
