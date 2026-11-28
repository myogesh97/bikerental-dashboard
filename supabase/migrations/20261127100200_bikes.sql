-- bikes: the rental inventory. price_paise is the only price Postgres
-- stores; the client never sends a price for anything (hard rule).
-- Bikes are never hard-deleted once they have booking history -
-- is_active = false is how a bike is "removed" from public listings.

create table public.bikes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  brand text not null,
  -- Display label for brand (e.g. 'royal-enfield' -> 'Royal Enfield',
  -- 'ktm' -> 'KTM') - a plain capitalize-first-letter of the slug
  -- doesn't reproduce this, so it's stored explicitly rather than
  -- derived, matching bikes-data.js's original brandLabel field.
  brand_label text not null,
  category text not null check (category in ('sport', 'cruiser', 'retro', 'adventure')),
  price_paise integer not null check (price_paise > 0),
  is_active boolean not null default true,
  specs jsonb not null default '{}'::jsonb,
  -- Phase 1: the existing static image path (assets/images/bikes/*.jpg),
  -- unchanged from the current site - no Storage upload needed yet.
  -- Real per-bike photo galleries move into bike_images (Storage-backed)
  -- once Phase 5 gives admins a way to actually upload photos; until
  -- real photography exists (see PRODUCTION_READINESS.md), this stays
  -- a path to the same placeholder/demo images the static site uses today.
  image_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.bikes.price_paise is
  'Per-day rental price in integer paise (inr * 100). Never trust a price from the client.';
comment on column public.bikes.specs is
  'Flexible spec bag (fuel, engine, gears, mileage, ...) so new fields do not need a migration.';

create trigger bikes_set_updated_at
  before update on public.bikes
  for each row
  execute function public.set_updated_at();

alter table public.bikes enable row level security;

-- Public (including anon) can read only active bikes.
create policy "bikes_select_active_public"
  on public.bikes for select
  to anon, authenticated
  using (is_active = true);

-- Admins can read every bike, including inactive ones.
create policy "bikes_select_all_admin"
  on public.bikes for select
  to authenticated
  using (public.is_admin());

create policy "bikes_write_admin"
  on public.bikes for insert
  to authenticated
  with check (public.is_admin());

create policy "bikes_update_admin"
  on public.bikes for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No delete policy anywhere: bikes are deactivated (is_active = false
-- via update), never deleted, so booking history always has a valid
-- bike_id to reference.
