# Profile settings — plan

A signed-in account page where anyone — tourist, operator, guide or admin — can change their
photo, change their name, change their password if they know it, or ask for a reset link if they
do not. It is the one page all four roles share, and nothing like it exists yet.

Status: **phases 0–3 are built** (`/settings`, the `tours-avatars` bucket and its policies, the
name and password actions, the photo picker, the header photo, the account-menu link). Phase 4 —
the `/tours/me` link and the `docs/AUTH.md` write-up — is not. The owner has answered the
questions in §12: staff may rename themselves freely, and a photo stays round in the header (no
forced square crop).

---

## 1. What exists today

| Piece | Current state | What the plan does with it |
|---|---|---|
| `public.profiles` | 10 rows for 10 auth users; **7 have no `full_name`**. Columns: `id`, `full_name`, `avatar_url`, `role`, `created_at` | Becomes the record of the name and the photo |
| Writing a name | Nothing writes it. Sign-up puts `full_name` in `user_metadata` only | Profile edit writes **both**; backfill makes the two agree |
| `handle_new_user()` | `insert into profiles (id, role) values (new.id, 'tourist')` — drops the name the form collected | Replaced so it copies `raw_user_meta_data->>'full_name'` |
| Column grants | `REVOKE UPDATE ON profiles`; `GRANT UPDATE (full_name, avatar_url)` — role escalation is already blocked | The Server Action writes through the user's own client, no service role |
| `avatar_url` | Defined, granted, **used nowhere in the UI** — every avatar is an initial letter drawn by `AccountMenu` | Bucket + picker + `<img>` with the initial as fallback |
| Header name | `PageFrame.signedInViewer()` reads `user_metadata.full_name ?? name ?? email` | Reads the profile row (one cached query) with the same fallbacks |
| Change password | Missing. `updateUser({ password })` is only used by `/reset-password`, after an email link | New action that re-authenticates with the current password first |
| Reset password | Exists: `/forgot-password` → email → `/auth/callback` → `/reset-password` → `signOut({ scope: "others" })` | Reused verbatim from settings, with the address fixed to the signed-in account |
| Validation | `fullNameSchema`, `passwordSchema`, `newPasswordSchema`, `fieldErrorsOf` in `src/lib/auth/validation.ts` | Reused; one new `changePasswordSchema` |
| Rate limits | `AUTH_LIMITS` in `src/lib/auth/rate-limit.ts` (sign-in, sign-up, resend, reset, oauth) | Two new windows: change-password, photo upload |
| Uploads | Client `compressImageFile()`, server re-validation in `src/lib/tours/validation.ts`, five buckets with per-folder policies (`20261102_package_media_bucket.sql` is the model) | New public bucket `tours-avatars`, own folder policy |
| Nav | `accountLinks()` (`src/lib/tours/dashboards.ts`) feeds both the header avatar menu and the phone You tab | Gains **Profile settings** for every role |
| Tests | Action tests mock `@/lib/supabase/server` + `next/headers`; e2e auth mock in `e2e/mock-supabase.cjs` | Both extended (see §9) |

---

## 2. Decisions

1. **Route: `/settings`** at the root, not `/tours/settings`.
   * It is account-level, not a tour-workspace page, and all four roles share it — so it cannot
     live under any one role's subtree.
   * Its neighbours are already root routes: `/login`, `/signup`, `/forgot-password`,
     `/reset-password`, `/verify-email`.
   * `/tours/operator/settings` keeps its own URL and gets the label **Payment settings**, so the
     two never read as the same page.
2. **The profile row is the record; metadata is the mirror.**
   Display order: `profiles.full_name` → `user_metadata.full_name` → the email's local part.
   A name change writes both, so nothing that reads metadata today goes stale, and
   `profiles.full_name` (used by bookings, guide rosters, messages) stops being blank.
3. **A password change verifies the current password.** `updateUser({ password })` alone would let
   anyone at an unlocked laptop take the account. Supabase has no "verify password" call, so the
   action re-authenticates with `signInWithPassword` and only then updates.
4. **Reset is not a second way to do the same thing.** "Change password" is for someone who knows
   the current one. "Reset" is for someone who does not, and it is the only route for a
   Google-only account to *get* a password.
5. **The photo bucket is public**, like `tours-package-media` and `tours-promo-images`. The header
   draws the avatar on every page including signed-out ones, and signed URLs per render would be
   waste. The page says so in plain words; see §7.
6. **No email change in this round** — it needs a confirmation flow, a re-verification round trip
   and a decision about bookings tied to the old address. See §12.

---

## 3. Data and storage — one migration

`supabase/migrations/20261116_profile_settings.sql`

```sql
-- 1. Bucket: public read, 5 MB, jpeg/png/webp. Object keys are
--    tours-avatars/<user id>/avatar-<epoch>.webp  — the stamp is what makes a
--    replaced photo appear at once instead of after a CDN cache expires.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tours-avatars', 'tours-avatars', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2. Policies, same shape as tours_package_media_* :
--    read:   to public  using (bucket_id = 'tours-avatars')
--    insert: to authenticated with check (bucket_id = 'tours-avatars'
--              and (storage.foldername(name))[2] = auth.uid()::text)
--    delete: to authenticated using (… own folder … or get_my_role() = 'admin')
--    no update policy: uploads use upsert:false

-- 3. New accounts carry the name the sign-up form collected.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name)
  values (new.id, 'tourist', nullif(btrim(new.raw_user_meta_data->>'full_name'), ''));
  return new;
end $$;

-- 4. Backfill the 7 blank names from the metadata that already has them.
update public.profiles p
set full_name = nullif(btrim(u.raw_user_meta_data->>'full_name'), '')
from auth.users u
where u.id = p.id
  and (p.full_name is null or btrim(p.full_name) = '');

-- 5. Hardening found on the way: INSERT is still granted on every column,
--    role included, and only RLS keeps it inert (there is no INSERT policy).
revoke insert on public.profiles from anon, authenticated;
```

Re-running the file is safe: the bucket upserts, every policy is dropped first, and the backfill
only touches blank names.

---

## 4. The page

`src/app/settings/page.tsx` — Server Component, `dynamic = "force-dynamic"`, wrapped in
`PageFrame` (so the header, tab bar and footer are the same as everywhere else).

```
Settings                                   ← page heading (h1)
Signed in as juan@example.ph               ← the address, read-only, with why it is not editable
┌ Photo ─────────────────────────────┐
│  ⬤ (current photo or initial)      │   Card / CardHeader "Photo"
│  Change photo   Remove photo       │   input type=file, hidden behind a Button
│  JPG, PNG or WebP, up to 5 MB.     │
└────────────────────────────────────┘
┌ Your name ─────────────────────────┐
│  Full name  [ Juan Dela Cruz     ] │   Field + Input, hint "As it appears on your bookings."
│  Save name                         │
└────────────────────────────────────┘
┌ Change your password ──────────────┐
│  Current password [ •••• ]         │
│  New password     [ •••• ]         │  + the strength hint the sign-up form uses
│  Type it again    [ •••• ]         │
│  Save new password                 │  Notice: "Your other devices have been signed out."
└────────────────────────────────────┘
┌ Forgot your password? ─────────────┐
│  Email me a reset link             │   one button; explains it signs other devices out
└────────────────────────────────────┘
```

- Guests: `redirect("/login?next=%2Fsettings")`, the pattern the operator settings page uses.
- Google-only accounts: the change-password card is replaced by a sentence — "You sign in with
  Google. Set a password with a reset link if you want one." — with the reset button still live.
- Every card is one form with its own `useActionState`, so a failed password save never clears the
  name field. Success shows a `Notice variant="success"` and calls `router.refresh()` so the header
  picks up the new name or photo without a reload.
- Phone width: single column, controls at 44px, the page's own `max-w-3xl`.

New files under `src/app/settings/`:

| File | Job |
|---|---|
| `page.tsx` | Session guard, loads profile + providers, lays out the cards |
| `actions.ts` | `updateName`, `saveAvatar`, `removeAvatar`, `changePassword`, `sendPasswordReset` |
| `profile-form.tsx` | client: name field, `useActionState`, success/error notices |
| `photo-picker.tsx` | client: file input, local preview, `compressImageFile()`, progress |
| `password-form.tsx` | client: three fields, strength hint, `useActionState` |
| `reset-card.tsx` | client: the one-button reset, "check your inbox" state |

---

## 5. Name

```ts
// src/app/settings/actions.ts
export async function updateName(prev: AuthActionState, formData: FormData): Promise<AuthActionState>
```

1. `fullNameSchema` (already rejects hidden characters, collapses whitespace, caps at 80).
2. Session required — read with `getAuthenticatedSession()`, never from the form.
3. `supabase.auth.updateUser({ data: { full_name: name } })` — keeps the metadata mirror honest.
4. `supabase.from("profiles").update({ full_name: name }).eq("id", user.id)` — allowed by the
   column grant; a 0-row result is a loud log line, not a silent success.
5. Failures go through one sentence: "We could not save your name. Please try again." Detail to
   the server log only, as `src/lib/auth/errors.ts` already does for auth.
6. `revalidatePath("/", "layout")` so the header, tab bar and every cached page show the new name.

Helper worth writing once, used by the header, the page and bookings:

```ts
// src/lib/profile/name.ts  (pure, no imports)
export function displayName(parts: { profileName?: string | null; metaName?: string | null; email?: string | null }): string
export function initials(name: string): string   // one letter, unicode-safe
```

---

## 6. Password

### 6a. Change, with the current password

```ts
export async function changePassword(prev: AuthActionState, formData: FormData): Promise<AuthActionState>
```

```
current, new, confirm
  → changePasswordSchema (current: 1..72 chars; new: passwordSchema; confirm matches)
  → session? no → { status: "error", message: "Your session has ended. Sign in again." }
  → rate limit  `change:user:<id>`  (5 / 15 min) and `change:ip:<ip>` (20 / 15 min)
  → verify current: auth.signInWithPassword({ email, password: current })
        fails → the same sentence for a wrong password and an expired session:
                "That is not your current password."   (+ log the code)
  → auth.updateUser({ password: new })
  → auth.signOut({ scope: "others" })   // everywhere else, including a stolen session
  → { status: "success", message: "Your password is changed. Other devices have been signed out." }
```

Notes:
- The re-authentication also refreshes this browser's session cookie; Server Actions can write
  cookies, so the visitor stays signed in.
- A successful re-auth with the *same* password as the new one is harmless; the update is a no-op
  and we still say it saved.
- Never echo Supabase's message: a weak password gets "Choose a longer one, or one that is not
  common." — the mapping in `src/lib/auth/errors.ts` grows one `passwordChangeMessage()`.

### 6b. Reset, without it

```ts
export async function sendPasswordReset(prev: AuthActionState, formData: FormData): Promise<AuthActionState>
```

Reuses the existing machinery exactly: `AUTH_LIMITS.resetIp` / `resetEmail` (keyed by user id here),
`rememberNextPath("/reset-password")`, `resetPasswordForEmail(user.email, { redirectTo:
authCallbackUrl(origin) })`, and the same "If that email has an account, a reset link is on its
way." sentence — no input field, so there is nothing to enumerate. `/reset-password` then ends
other sessions as it already does.

**No new reset page, no new email template.** The link the owner has today keeps working.

---

## 7. Photo

### Pipeline

```
<input type=file accept="image/jpeg,image/png,image/webp">
  → browser: validate, show preview, compressImageFile(file)      (~1600px, quality 0.82)
  → FormData to a Server Action (body limit is already 18 MB)
  → server, in this order, all of it again:
        size ≤ 5 MB · mime ∈ {jpeg,png,webp} · extension agrees
        magic bytes agree (FFD8FF / 89504E47 / RIFF…WEBP)   ← new, 20 lines, testable
  → storage.from("tours-avatars").upload(`tours-avatars/${user.id}/avatar-${Date.now()}.webp`, …)
  → getPublicUrl → profiles.update({ avatar_url }) on the own row
  → best-effort remove() of the previous object
  → revalidatePath("/", "layout")
```

- `removeAvatar` sets `avatar_url = null` and deletes the object.
- Nothing user-supplied reaches the object key: the id, the stamp and the extension are ours.
- Failure copy: "That photo could not be saved. Try a JPG, PNG or WebP under 5 MB."

### Display

`AccountMenu`'s `Avatar` draws the initial today; it gains an optional `src`:

```tsx
{src ? <img src={src} alt="" width={40} height={40} className="h-10 w-10 rounded-full object-cover" /> : <span …>{initial}</span>}
```

- `alt=""` — the button already carries the name in `title`/`aria-label`, so the photo is
  decoration, not a second announcement to a screen reader.
- A plain `<img>`, not `next/image`: the header is on every page, and the optimizer is one more
  thing between a visitor and a 4 KB face. `next.config.ts` already allow-lists the Supabase host
  if we ever want the optimizer.
- A broken URL falls back to the initial (`onError` → hide, the initial is rendered underneath).

Plumbing: `PageFrame` → `SiteHeader` → `AccountMenu`, and `PageFrame` → `RoleTabBar` →
`AccountMenu` (tab variant). `PageFrame` already has a per-request cached session; it gains a
cached `getMyProfile()` (`select full_name, avatar_url`) so the header costs one query per request,
not one per render.

---

## 8. Navigation

`accountLinks()` in `src/lib/tours/dashboards.ts` is the single place both the header menu and the
phone You tab read, so one line adds the page everywhere:

```ts
links.push({ href: "/settings", label: "Profile settings" });   // first, every role
if (role === "operator") links.push({ href: "/tours/operator/settings", label: "Payment settings" });
```

Today that operator entry is labelled plainly "Settings" — renaming it keeps the two from being
mistaken for each other.

Also: the `/tours/me` header gets a small "Profile settings" link for tourists who never open the
avatar menu, and the `sign out` test in `e2e/roles.spec.ts` keeps working because it looks for the
button by name, not by position.

---

## 9. Tests

**Unit — pure helpers** (`src/lib/profile/name.test.ts`, `avatar.test.ts`)
- `displayName`: profile → metadata → email local part → "Your account"; whitespace and empty
  strings never win.
- `initials`: keeps today's single letter (that is what the header draws, and the tab bar has no
  room for two), unicode-safe — the `Ñ` of "Ñina", a name that starts with an emoji, an empty
  name → `?`.
- Avatar validation: each mime accepted, each rejected (`image/gif`, `image/svg+xml` — SVG is a
  script carrier, `text/plain`), size boundary at exactly 5 MB, extension/mime disagreement,
  magic-byte mismatch (a `.jpg` that is really a PDF), and key building (a name with `../` never
  reaches the key).

**Unit — Server Actions** (`src/app/settings/actions.test.ts`, same mocking as
`src/app/login/actions.test.ts`)
- `updateName`: invalid name → field error and **no** client call; valid → metadata first, row
  second; no session → refused; a 0-row update is reported as a failure, not a success.
- `changePassword`: validation order; wrong current password → one generic sentence, `updateUser`
  never called, the attempt counted; correct → `updateUser` then `signOut({ scope: "others" })`;
  rate limit hit → `tooManyMessage` copy; Google-only → "no password to change".
- `sendPasswordReset`: same sentence whether or not the call succeeded; `redirectTo` from
  `authOrigin`; limits keyed per user.

**Component** (`profile-form.test.tsx`, `password-form.test.tsx`, jsdom)
- Errors land beside their field (`aria-describedby`, `aria-invalid`), success shows a notice,
  the button is disabled while pending, the file input has a real label and a keyboard path.

**e2e** (`e2e/settings.spec.ts`, 375px, axe on every visit)
- Signed out, `/settings` → `/login?next=%2Fsettings`.
- Tourist opens Profile settings from the avatar menu, sees their own name and address.
- Rename → header shows the new name after `revalidatePath` (mock gains `PATCH /rest/v1/profiles`).
- Change password with a wrong current one → inline error; with the right one → success notice,
  and the auth log shows exactly one `PUT /auth/v1/user` (mock gains that endpoint).
- Reset → "check your inbox", and the auth log shows one `POST /auth/v1/recover` (the mock already
  answers that route).
- Upload a photo → the header avatar becomes an `<img>` with the bucket URL; remove → the initial
  returns (mock gains `POST /storage/v1/object/tours-avatars/...` and serves the bytes).
- `visit()` on the page: no horizontal scroll at 375px, no axe findings.

---

## 10. Phases

| # | Scope | Acceptance |
|---|---|---|
| 0 | Migration + `displayName`/`initials` + `getMyProfile()`; header reads the profile row | Header shows the 7 backfilled names; no visual change otherwise |
| 1 | `/settings` page skeleton + name form + nav entry | A tourist renames themselves and every page shows it |
| 2 | Change password + reset card + new rate limits | Wrong current password refused; right one works; other sessions ended |
| 3 | Photo: bucket policies, picker, upload action, header `<img>` | Upload, replace, remove all round-trip; initial returns after removal |
| 4 | Polish: `/tours/me` link, copy, `docs/AUTH.md` update, e2e sweep | Full gates green |

Gates each phase, as ever: `tsc --noEmit` → `npx jest` → `next build` → PR → `gh pr checks` green →
merge. Rough size: phases 0–2 are a day's work, phase 3 the better part of another (storage
policies are the risk), phase 4 an hour.

---

## 11. Security checklist

- [ ] Server Actions re-validate every field; the browser's checks are convenience only.
- [ ] Name: the shared schema, which already rejects control characters, bidi overrides, zero-width
      joiners, and caps at 80 characters.
- [ ] Photo: size, mime, extension **and** magic bytes, checked server-side; the object key is
      built by us.
- [ ] `profiles` writes go through the user's own client, so the column grant keeps `role`
      untouchable. The migration also closes the dormant INSERT grant.
- [ ] Password change requires the current password, is rate-limited per user and per IP, and never
      says which of "wrong password" or "session expired" happened.
- [ ] Reset answers identically for every account and is rate-limited per user and per IP.
- [ ] Session-bound data (`user.id`, `user.email`) is read from the session, never from the form.
- [ ] The page states plainly that the photo is public and the email address is not editable.

---

## 12. Open questions for the owner

1. **Can staff rename themselves freely?** Their name appears on bookings, rosters and permits.
   Options: everyone free (simplest), or staff name changes go to the Tourism Office for approval.
2. **Should the photo ever appear in public places** — the guide directory, booking pages — or only
   in the signed-in account chrome for now? (Recommendation: signed-in only this round.)
3. **Square crop, or the photo as uploaded?** (Recommendation: centre-crop square for the header,
   the original kept for later larger uses — one extra stored object.)
4. **Label**: "Profile settings" or just "Settings" in the account menu?

## 13. Out of scope, deliberately

- Changing the email address (needs a re-verification round trip and a decision about bookings
  already tied to the old address).
- Deleting an account, or exporting its data.
- Two-factor authentication, passkeys, "sign out of all devices" as its own button.
- Profile fields beyond name and photo (bio, phone, address) — the operator and guide profile forms
  already own their own business details.
