-- Package photos: create the bucket the package editor already uploads to.
--
-- uploadPackageImage (src/app/(subsystems)/tours/operator/packages/[id]/edit/actions.ts)
-- writes to PACKAGE_STORAGE_BUCKET, which defaults to "tours-package-media"
-- (src/lib/tours/package-contract.ts). That bucket never existed in production,
-- so every cover and gallery upload failed with "Failed to upload image".
--
-- The older "package-images" bucket is left alone: its policies let any
-- signed-in user write anywhere under packages/, so it is not reused here.
--
-- Path written by the code: tours-package-media/{operatorId}/{packageId}/{imageId}.{ext}
-- Inside this bucket, storage.foldername(name) is therefore:
--   [1] = 'tours-package-media'  (the literal prefix the code puts in the path)
--   [2] = operator id
--   [3] = package id
--
-- Re-running this file is safe: the bucket upserts and each policy is dropped
-- before it is recreated.

-- 1. The bucket -----------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tours-package-media',
  'tours-package-media',
  true, -- package photos are public; the app uses getPublicUrl
  5242880, -- 5 MB, the same cap uploadPackageImage enforces
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Policies -------------------------------------------------------------------
-- Public bucket + getPublicUrl: files are served by URL, and this explicit read
-- policy keeps listing/reading through the API predictable.

drop policy if exists "tours_package_media_read" on storage.objects;
create policy "tours_package_media_read" on storage.objects
  for select
  to public
  using (bucket_id = 'tours-package-media');

-- Uploads: only an approved operator, only into their own folder, only for a
-- package they own. p.id::text avoids raising on a non-uuid folder name.

drop policy if exists "tours_package_media_insert" on storage.objects;
create policy "tours_package_media_insert" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'tours-package-media'
    and (storage.foldername(name))[1] = 'tours-package-media'
    and (storage.foldername(name))[2] = (select public.tours_my_approved_operator_id())::text
    and exists (
      select 1
      from public.tours_packages p
      where p.id::text = (storage.foldername(name))[3]
        and p.operator_id = public.tours_my_approved_operator_id()
    )
  );

-- Deletes: the owning operator, or an admin clearing a bad photo. No UPDATE
-- policy: uploads use upsert: false.

drop policy if exists "tours_package_media_delete" on storage.objects;
create policy "tours_package_media_delete" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'tours-package-media'
    and (storage.foldername(name))[1] = 'tours-package-media'
    and (
      (storage.foldername(name))[2] = (select public.tours_my_approved_operator_id())::text
      or (select public.get_my_role()) = 'admin'
    )
  );
