-- bike_images: metadata for photos stored in Supabase Storage.
-- Public read (photos must be visible to anonymous visitors),
-- admin-only write. The actual files live in the 'bike-images'
-- Storage bucket (created in 20261127100900_storage.sql); this table
-- just points at them and carries display metadata.

create table public.bike_images (
  id uuid primary key default gen_random_uuid(),
  bike_id uuid not null references public.bikes (id) on delete cascade,
  storage_path text not null,
  alt_text text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index bike_images_bike_id_idx on public.bike_images (bike_id);

alter table public.bike_images enable row level security;

create policy "bike_images_select_public"
  on public.bike_images for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.bikes b
      where b.id = bike_images.bike_id and b.is_active = true
    )
    or public.is_admin()
  );

create policy "bike_images_write_admin"
  on public.bike_images for insert
  to authenticated
  with check (public.is_admin());

create policy "bike_images_update_admin"
  on public.bike_images for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "bike_images_delete_admin"
  on public.bike_images for delete
  to authenticated
  using (public.is_admin());
