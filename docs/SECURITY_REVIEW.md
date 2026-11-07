# Security review (F12)

Review date: 2026-10-23. Project `ipglyuksxlshwsmxdxyl` and repo `tellmemaya25-lang/daet-connect.ph` (public).

## 🔴 Critical: service-role key in public git history

Commit `eb23857` ("Add .env.local file", 2026-10-16) committed `.env.local` with the project's real `SUPABASE_SERVICE_ROLE_KEY`. The key's claims (`ref ipglyuksxlshwsmxdxyl`, `role service_role`) match this project. It was issued at the same time as the anon key that is live now, so it is still valid. Commit `d924879` deleted the file on 2026-10-21, but the key is still readable in the history of a **public** repository.

The service-role key bypasses all row-level security. Anyone holding it can read, change or delete every table and storage object.

**Status (2026-10-23): keys rotated.** The legacy JWT keys (anon and service_role, including the leaked one) are disabled in the project; the app now needs the new publishable/secret keys in every environment. Steps 2–4 below are still worth doing.

**What to do, in this order:**

1. **Rotate now.** Supabase Dashboard → Project Settings → API Keys. Move to the new API keys (publishable/secret) and disable the legacy JWT keys, or roll the legacy JWT secret; either invalidates the leaked key. Then update `SUPABASE_SERVICE_ROLE_KEY` (or the new secret key) and the anon/publishable key everywhere the app runs (hosting env, local `.env.local`, CI).
2. **Check for misuse.** In the Dashboard → Logs, look at API requests using the service role since 2026-10-16. Also check `profiles.role`, `tours_operators`/`tours_guides` accreditation changes and storage objects for anything unexpected. There is currently one admin account, created 2026-10-16 13:10 UTC with no name set: confirm it is yours.
3. **Optionally scrub history** (e.g. `git filter-repo --path .env.local --invert-paths`, then force-push and ask collaborators to re-clone). After rotation this is hygiene, not a fix: the old key is already public and must be treated as compromised.
4. Check whether the related public repo `tellmemaya25-lang/daet-connect` has the same file.

`.gitignore` already ignores `.env*` (except `.env.example`), so it can't happen again by accident. No key-like strings are in the current tree.

## 🔴 Critical: test account passwords published in the repo

The home page (`src/app/page.tsx`, shown in development only) and three archived docs listed sign-in details for:
- `admin.test@gmail.com`, the project's **only admin account**, last signed in 2026-10-23;
- the operator account `testguide2@gmail.com`;
- the guide account `testguide3@gmail.com`.

The repository is public, so anyone could sign in as the Tourism Office admin. F12 removes the passwords from the code and docs, but they remain in git history.

**What to do:** change the passwords of all three accounts now (Dashboard → Authentication → Users, or sign in and change them). Use the *Sign out of all sessions* option if offered. Keep evaluation credentials only in the printed sheet from `docs/EVALUATION_KIT.md`, never in the repo.

## Checks performed

| Area | Result |
|---|---|
| Secret scan of tracked files | No API keys or private keys. Hard-coded **test passwords** were found and removed (see above) |
| Secret scan of history | **Leak above** (`.env.local` in `eb23857`, `4c0c450`) |
| Client bundle | No server env names (`SUPABASE_SERVICE_ROLE_KEY`, `PAYMONGO_*`, `QR_SIGNING_SECRET`, `VAPID_PRIVATE_KEY`, `GEMINI_API_KEY`, `NOTIFICATIONS_PUSH_SECRET`) or the admin client in `.next/static` |
| Service-role usage | Created only in `src/lib/supabase/admin.ts` (`server-only`). Used by server code only: PayMongo webhook, push dispatch route, operator/guide accreditation review, notification actions, the route cache |
| Signed QR | HMAC-SHA256 tokens with expiry, verified server-side (`src/lib/tours/qr-token.ts`, tests) |
| Webhook | PayMongo signature verified with a timing-safe compare and timestamp tolerance (`src/lib/paymongo/signature.ts`, tests); replay-safe (event id primary key, unique `(provider, provider_ref)`), covered by `supabase/tests/integration.sql` |
| Private chats | Guide–tourist chats exclude the operator; operator–guide chats need both sides accredited; Tourism Office chats are the operator plus admins. Admins can read other chats but not post. Checked in `supabase/tests/integration.sql` | Messaging channels migration |
| Sign-up, sign-in, Google, email verification | Rebuilt on 2026-11-03: email confirmation is required (the app refuses a session issued without it), sign-up no longer reveals whether an address exists, input is validated with one shared schema, auth replies are rate-limited and time-flattened, and Google OAuth runs on the PKCE flow. Audit, decisions and the remaining dashboard steps are in `docs/AUTH.md` | `src/lib/auth/*`, `src/app/auth/*`, `e2e/auth.spec.ts` |
| Open redirect after login | Fixed in F12: `?next=` accepted any URL (`/login?next=https://evil.example`). Now only same-site paths, via `safeNextPath` (tests) |
| Privilege escalation | Fixed in F10: users could set their own `profiles.role`; browser updates are now limited to `full_name` and `avatar_url` |
| RLS per role | `supabase/tests/integration.sql`: 31 checks across anon, tourist, operator, guide and admin. **31 pass** on the live project (rolled back) |
| Package policy drift | The historical package migration's missing replacements are repaired by `20261128_reconcile_package_policies.sql`. Direct-table access is exercised offline by `scripts/package-policies.test.mjs`; `supabase/tests/package_policy_catalog.sql` is a read-only deployment check. See `docs/PACKAGE_POLICIES.md`. The reconciliation has **not** been applied to live Supabase by this repair |

## Rate limits

| Action | Limit | Where |
|---|---|---|
| Bookings | 5 per account per 10 minutes; at most 10 pending at once (pending bookings hold seats) | `tours_bookings_rate_limit` trigger (F12) |
| Messages | 20 per minute per sender; 1–1000 characters | F4 message trigger |
| Chats | One per booking per kind, per operator–guide pair and per operator; opened only through the `tours_open_*_conversation` RPCs | Messaging channels migration |
| Reviews | One per completed booking | F8 |
| Points | Once per `(source, ref_id)`; trip plans max 3 a day | F10 |
| Sign-up / sign-in / OTP | Supabase Auth's built-in rate limits, **plus** the app's own windows (sign-in 20/IP and 6/account per 10–15 min; sign-up 10/IP per hour; resend and reset 3/address and 10/IP per hour) | `src/lib/auth/rate-limit.ts` (2026-11-03 auth rework) |

## Supabase advisors

Security:
- **Fixed:** mutable `search_path` on `tours_peso`.
- **Intended:** RLS enabled with no policies on `tours_guide_sensitive_info`, `tours_payment_events` and `tours_route_cache`. These are service-role only, so no client policy is the point.
- **Intended:** security-definer functions callable by anon: `get_my_role` (used inside RLS policies), `tours_badge_lookup` (public badge verification), `tours_is_my_operator` (review visibility policy), `tours_shared_itinerary` (share links). Each returns only what its public page needs.
- **Intended:** 23 security-definer RPCs callable by signed-in users. Each checks the caller's role and ownership itself, and the integration suite exercises the important ones.
- **Action for you:** enable *Leaked password protection* (Dashboard → Authentication → Passwords).

Performance:
- **Fixed:** 51 policies re-evaluated `auth.uid()` per row; they now use `(select auth.uid())`. A rolled-back check confirmed identical visibility across 35 tables × 3 roles.
- **Fixed:** 19 foreign keys without an index.
- **Left for you:** two duplicate indexes. Drop `idx_tours_itinerary_items_itinerary` and `idx_tours_reviews_operator` in the SQL editor; this tooling can't run `DROP` statements.
- **Deferred:** 117 "multiple permissive policies" warnings. Merging overlapping policies is a larger refactor with little gain at the current data size.
- **Ignored:** 23 "unused index" notices; it's a new project with little traffic.

## Not covered

- A true concurrent-booking race needs two database sessions. The booking trigger locks the date's availability row (`SELECT … FOR UPDATE`) before counting seats, which serializes simultaneous bookings. The suite checks the sequential case (overbooking and full-date refusals).
- PayMongo sandbox end-to-end: it needs sandbox keys. See the walkthrough in `docs/EVALUATION_KIT.md`.
