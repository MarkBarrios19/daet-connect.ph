# Handoff: fix package image uploads ("Failed to upload image. Please try again.")


---

## Context

The owner recorded a screen video of the Kalmado operator account (Kobe Mago,
`tellmemaya25.4@gmail.com`) editing the published package **"Calaguas camping, 3 days
2 nights"** at `/tours/operator/packages/[id]/edit` on the live site. Choosing a cover
photo shows "Uploading… 50%", then the red error **"Failed to upload image. Please try
again."** The same happens on every try. No package on the site can get a cover or
gallery photo through the editor.

The goal is that operators can upload a cover image (any editable status) and gallery
images (draft/rejected), the photo saves, and it shows on the public package page.

## Root cause (verified read-only on 2026-11-01)

1. `uploadPackageImage` in
   `src/app/(subsystems)/tours/operator/packages/[id]/edit/actions.ts` (around line 1594)
   uploads to the bucket `PACKAGE_STORAGE_BUCKET` from `src/lib/tours/package-contract.ts:83`:
   `process.env.TOURS_PACKAGE_MEDIA_BUCKET ?? "tours-package-media"`.
2. **Vercel has no `TOURS_PACKAGE_MEDIA_BUCKET` variable**, so the app uses
   `tours-package-media`.
3. **The live Supabase project (`ipglyuksxlshwsmxdxyl`) has no `tours-package-media`
   bucket.** The only package bucket is `package-images` (public, no size or type
   limit). Its policies come from the old hand-run files
   `supabase/migrations/create_package_images_storage.sql` and `APPLY_THIS_image_upload.sql`,
   and they only allow paths whose first folder is `packages/`. That doesn't match the
   code's path either.
4. The storage call fails, the action logs `Storage upload error:` and returns the
   generic message. The 50% shown is a fixed value set before the server call
   (`CoverImageStep.tsx:83`), not real upload progress.

It is **not** the request size limit: `next.config.ts` sets
`serverActions.bodySizeLimit: "18mb"`, and the action caps files at 5 MB.

Confirm before changing anything:
- Supabase: `select id from storage.buckets;` should show no `tours-package-media`.
- Vercel runtime logs for project `prj_lGGP9GgJPZ93TynAMibHEwq38SDq` (team
  `team_QEz3wRD9O78Ai9iHovpXLAhc`): search for `Storage upload error`. Expect
  "Bucket not found" or a row-level security (RLS) error.

## Ground rules

- **Plan first.** Show the owner the plan and get an OK before writing code.
- Read the Next.js 16 docs in `node_modules/next/dist/docs/` before touching code (see AGENTS.md).
- Work on a new branch, `claude/package-image-upload`, cut from the latest `origin/main`.
  **No pull request** unless the owner says "make PR".
- **Database changes go to production.** Show the migration SQL to the owner and get an
  explicit yes before running `apply_migration`. Also commit the same SQL as
  `supabase/migrations/20261102_package_media_bucket.sql`.
- Never print, log or commit secrets. Don't decrypt Vercel environment values.
- Never skip, disable or quarantine a test.
- End every commit message with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01FH1Apt7Sb28d1BVdJ8Loxp
  ```

## Plan

### 1. Storage bucket and policies (migration; owner approval required)

Create the bucket the code already expects, rather than repointing the code at
`package-images`. The old bucket's policies let any signed-in user write anywhere under
`packages/`, so leave it alone and don't reuse it.

- **Bucket:** `tours-package-media`.
  - `public = true`: package photos are public, and the code uses `getPublicUrl`.
  - `file_size_limit = 5242880` (5 MB, the same as the action).
  - `allowed_mime_types = {image/jpeg,image/png,image/webp}`.
  - Use `ON CONFLICT (id) DO UPDATE` so re-running the migration is safe.
- **Path the code writes:** `tours-package-media/{operatorId}/{packageId}/{imageId}.{ext}`,
  inside the bucket of the same name. So in `storage.foldername(name)`:
  `[1]` is the literal `tours-package-media`, `[2]` is the operator id, `[3]` is the package id.
  - Keep this path. `deletePackageImage` and `image-actions.test.ts` parse it.
- **Policies on `storage.objects`.** Each has its own name and is scoped to
  `bucket_id = 'tours-package-media'`.
  - **SELECT:** public. Optional: a public bucket already serves files by URL without one.
  - **INSERT (`authenticated`):** `[1] = 'tours-package-media'`, and `[2]` must be the
    id of an **approved** operator whose `profile_id = (select auth.uid())`, and `[3]`
    must be a package owned by that operator.
    Check the operator through the existing helper `public.tours_my_approved_operator_id()`
    (already in the database), e.g. `(storage.foldername(name))[2] = (select public.tours_my_approved_operator_id())::text`.
  - **DELETE (`authenticated`):** the same ownership check. Optionally allow admins via
    `(select public.get_my_role()) = 'admin'`.
  - No UPDATE policy: uploads use `upsert: false`.
- **After applying:**
  - Run `get_advisors` (security) and confirm no new warnings.
  - Then test with SQL in a rolled-back transaction, as an authenticated user claim:
    - an insert into the operator's own folder succeeds;
    - an insert into another operator's folder fails;
    - an insert from an anonymous user fails.

### 2. Server action hardening (`actions.ts`, `uploadPackageImage`)

Today the action never checks that `packageId` belongs to this operator, or that the
package's status allows the change.

- Load the package by `id` and the signed-in operator's `operator_id`. Return
  "Package not found." when there's no match.
- Pass `kind: "cover" | "gallery"` from the callers: `CoverImageStep.tsx` sends `cover`,
  `GalleryStep.tsx` sends `gallery`.
- Gate with the shared rules in `permissions.ts` (`getEditPermissions` /
  `requireEditablePackageStatus`):
  - cover needs `permissions.coverImage`, which is true for draft, rejected and published;
  - gallery needs `permissions.gallery.add`, which is true for draft and rejected only.
  - Return the rule's own message (e.g. the published-gallery wording), not the generic one.
- Map storage failures to clearer messages, and keep `console.error` of the raw error:
  - Bucket not found: "Photo storage isn't set up yet. Please tell the Tourism Office."
  - RLS / 403: "You can only add photos to your own packages."
  - Anything else: the existing message.
- Remove the fake fixed `setUploadProgress(50)`. Show an indeterminate "Uploading…"
  state instead, so people aren't told it's half done. Keep the design rules in
  `src/components/ui/design-rules.test.ts` passing.

### 3. Optional: environment variable (owner decides)

Code and database will agree on `tours-package-media` without any variable. Only if the
owner wants it explicit: add `TOURS_PACKAGE_MEDIA_BUCKET=tours-package-media` to the
Vercel production and preview environments. Ask before changing Vercel settings.

### 4. Check that the photo is actually saved and shown

Uploading only stores the file. The URL is saved when the editor form is saved.

- Confirm that saving a **published** package with a new `cover_image_url` gets through
  the guards:
  - `findRestrictedChanges` in `permissions.ts` ignores cover changes, so the app layer
    should be fine;
  - `public.update_package_and_relations` in the database mentions `cover_image_url`.
    Read its body to make sure a published package can change it.
  - The video shows the save button reading **"Save as Draft"** and looking disabled on
    a published package. Check which button saves a published package, and that a new
    cover counts as a change in `change-detection.ts`.
- `next.config.ts` already allows Supabase Storage images (`/storage/v1/object/**` on the
  `NEXT_PUBLIC_SUPABASE_URL` host), so `next/image` previews will load.
- Removing a cover on a published package only clears the URL. `deletePackageImage`
  allows deleting files only for drafts, so leftover files are expected and fine.

### 5. Gallery on published packages (ask the owner; don't build it unasked)

The video also shows "Gallery images cannot be modified for this package status." That
is the current rule: published packages can only change captions. If the owner wants
operators to add photos to published packages without a new review, that's a product
change touching:
- `permissions.ts`;
- `findRestrictedChanges`;
- the database guard in `update_package_and_relations`.

Raise it as a question and leave the rule as it is unless they say otherwise.

## Tests

- `image-actions.test.ts`: cover the new ownership check, the status gating (published
  gallery denied, published cover allowed), and the error mapping for "Bucket not found"
  and 403.
- `requireEditablePackageStatus.test.ts` / permissions tests: only if the rules change.
- `CoverImageStep` / `GalleryStep` component tests, if present: no fake 50%, messages
  shown as returned.
- Run everything:
  - `npx tsc --noEmit`, `npm test` (Jest), and `npm run lint` if available.
  - Build:
    `rm -rf .next && NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build`.
  - e2e: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e`.
    The mock Supabase is `e2e/mock-supabase.cjs`. Add a storage upload route there if an
    e2e test covers uploads.

## Verification on the live site (after the owner approves the migration and the code is deployed)

1. Sign in as the Kalmado operator. Open Packages → "Calaguas camping, 3 days 2 nights" → Edit.
2. Upload a JPG under 5 MB as the cover. The preview appears, with no error.
3. Save. Open the public package page and check the cover shows there and on the package card.
4. Check the file is in Supabase Storage under
   `tours-package-media/tours-package-media/{operatorId}/{packageId}/`.
5. Try a 6 MB file or a GIF and confirm the clear error message.
6. Optional: on a draft package, add a gallery image and remove it.
7. Re-run `get_advisors` and confirm no new security warnings.

## Files to touch (summary)

- `supabase/migrations/20261102_package_media_bucket.sql` (new; apply only after the owner's yes)
- `src/app/(subsystems)/tours/operator/packages/[id]/edit/actions.ts` (`uploadPackageImage`)
- `src/app/(subsystems)/tours/operator/packages/[id]/edit/CoverImageStep.tsx`
- `src/app/(subsystems)/tours/operator/packages/[id]/edit/GalleryStep.tsx`
- `src/app/(subsystems)/tours/operator/packages/[id]/edit/image-actions.test.ts`
- Reuse, don't duplicate:
  - `permissions.ts` (`getEditPermissions`, `requireEditablePackageStatus`);
  - `PACKAGE_STORAGE_BUCKET` (`src/lib/tours/package-contract.ts`);
  - the database helpers `tours_my_approved_operator_id()` and `get_my_role()`.
