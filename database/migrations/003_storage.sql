-- =====================================================================
-- 003_storage.sql — private bucket for progress photos
-- Files are stored as  <user-id>/<photo-id>.<ext>
-- A user can only list, read, upload or delete inside their own folder.
-- The bucket is NOT public: images are shown through short-lived signed URLs.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 8388608,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "photos owner read"   on storage.objects;
drop policy if exists "photos owner insert" on storage.objects;
drop policy if exists "photos owner update" on storage.objects;
drop policy if exists "photos owner delete" on storage.objects;

create policy "photos owner read" on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "photos owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "photos owner update" on storage.objects for update to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "photos owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
