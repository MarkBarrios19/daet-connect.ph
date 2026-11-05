-- Profile settings: a photo for every account, and a name that reaches the table.
--
-- The page at /settings lets a signed-in person change their photo, their name
-- and their password (docs/PROFILE_SETTINGS_PLAN.md). Two things it needs from
-- the database:
--
--   1. somewhere to keep a photo, with the same own-folder rules the package
--      media bucket uses (20261102_package_media_bucket.sql);
--   2. a profiles.full_name that is actually filled in — handle_new_user()
--      dropped the name the sign-up form collected, so 7 of the 10 accounts had
--      none.
--
-- Re-running this file is safe: the bucket upserts, each policy is dropped
-- before it is recreated, and the backfill only touches blank names.

-- 1. The bucket -----------------------------------------------------------------
-- Public read: the header draws the photo on every page, so it is served by URL
-- (getPublicUrl) rather than by a signed URL per render. Object keys are
--   tours-avatars/<user id>/avatar-<epoch>.webp
-- and the stamp is what makes a replaced photo appear at once instead of after
-- a CDN cache expires.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tours-avatars',
  'tours-avatars',
  true,
  5242880, -- 5 MB, the cap the app enforces before it uploads
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Policies -------------------------------------------------------------------
-- Inside this bucket, storage.foldername(name) is:
--   [1] = 'tours-avatars'  (the literal prefix the app puts in the path)
--   [2] = the owner's user id

drop policy if exists "tours_avatars_read" on storage.objects;
create policy "tours_avatars_read" on storage.objects
  for select
  to public
  using (bucket_id = 'tours-avatars');

-- A person may only write into their own folder.
drop policy if exists "tours_avatars_insert" on storage.objects;
create policy "tours_avatars_insert" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'tours-avatars'
    and (storage.foldername(name))[1] = 'tours-avatars'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- Removing a photo (and replacing one, which deletes the old object) is the
-- owner's own act; an admin may clear one too. No UPDATE policy: uploads use
-- upsert: false, so a key is written once and then replaced by a new key.
drop policy if exists "tours_avatars_delete" on storage.objects;
create policy "tours_avatars_delete" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'tours-avatars'
    and (storage.foldername(name))[1] = 'tours-avatars'
    and (
      (storage.foldername(name))[2] = (select auth.uid())::text
      or (select public.get_my_role()) = 'admin'
    )
  );

-- 3. New accounts carry the name the sign-up form collected ---------------------
-- Same function, same security definer + search_path as before; the only change
-- is the third column.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, role, full_name)
  values (new.id, 'tourist', nullif(btrim(new.raw_user_meta_data->>'full_name'), ''));
  return new;
end;
$function$;

-- 4. Backfill the names that were collected but never stored --------------------
-- Sign-up has always written user_metadata.full_name; the profile row is what
-- bookings, rosters and messages read.

update public.profiles p
set full_name = nullif(btrim(u.raw_user_meta_data->>'full_name'), '')
from auth.users u
where u.id = p.id
  and (p.full_name is null or btrim(p.full_name) = '')
  and nullif(btrim(u.raw_user_meta_data->>'full_name'), '') is not null;

-- 5. Hardening found on the way -------------------------------------------------
-- INSERT was still granted on every column, role included; only the absence of
-- an INSERT policy kept it inert. Profile rows come from the trigger above, so
-- the grant goes. (UPDATE is already limited to full_name and avatar_url by
-- 20261103_f10_rewards.sql.)

revoke insert on public.profiles from anon, authenticated;

comment on column public.profiles.avatar_url is
  'Public URL of the account photo in the tours-avatars bucket; null means the initial letter.';
