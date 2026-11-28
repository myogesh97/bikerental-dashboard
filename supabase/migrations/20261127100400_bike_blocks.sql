-- bike_blocks: admin-set maintenance/unavailable windows, distinct
-- from customer bookings so "why is this bike unavailable" always has
-- a real reason attached. Checked by the availability query alongside
-- bookings; not currently part of the bookings exclusion constraint
-- (see docs/data-model.md for why).

create table public.bike_blocks (
  id uuid primary key default gen_random_uuid(),
  bike_id uuid not null references public.bikes (id) on delete cascade,
  during tstzrange not null,
  reason text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index bike_blocks_bike_id_idx on public.bike_blocks (bike_id);
create index bike_blocks_during_idx on public.bike_blocks using gist (during);

alter table public.bike_blocks enable row level security;

-- No public policy: blocks are an operational/admin concern, not
-- public data. The public availability function (Phase 3) reads this
-- table via a SECURITY DEFINER function instead of direct table access.

create policy "bike_blocks_select_admin"
  on public.bike_blocks for select
  to authenticated
  using (public.is_admin());

create policy "bike_blocks_write_admin"
  on public.bike_blocks for insert
  to authenticated
  with check (public.is_admin());

create policy "bike_blocks_update_admin"
  on public.bike_blocks for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "bike_blocks_delete_admin"
  on public.bike_blocks for delete
  to authenticated
  using (public.is_admin());
