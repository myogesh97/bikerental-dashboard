-- Storage bucket for bike photos. Public read (so bike-shop.html /
-- bike.html can display images to anonymous visitors), admin-only
-- write, matching the data-model.md note on bike_images.

insert into storage.buckets (id, name, public)
values ('bike-images', 'bike-images', true)
on conflict (id) do nothing;

create policy "bike_images_bucket_select_public"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'bike-images');

create policy "bike_images_bucket_write_admin"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'bike-images' and public.is_admin());

create policy "bike_images_bucket_update_admin"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'bike-images' and public.is_admin())
  with check (bucket_id = 'bike-images' and public.is_admin());

create policy "bike_images_bucket_delete_admin"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'bike-images' and public.is_admin());
