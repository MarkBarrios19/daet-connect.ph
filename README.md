# CONNECT-DAET.ph — tours subsystem starter

This repository contains the CONNECT-DAET tours subsystem, including operator and local-guide accreditation flows with admin approval queues. It uses the App Router, Server Actions, Supabase Auth/Storage/Postgres, and mobile-first Tailwind UI.

## Local setup

1. Install Node.js 20.9+ and run `npm install`.
2. Copy `.env.example` to `.env.local`; fill in the Supabase URL, anon/publishable key, and service-role key. Never commit `.env.local` or expose the service-role key to browser code.
3. Create a **private** Supabase Storage bucket named `tours-operator-documents` (or set `TOURS_OPERATOR_DOCUMENTS_BUCKET`). Set its maximum file size to at least 5 MB and allow `image/jpeg`, `image/png`, `image/webp`, and `application/pdf`. The service-role key uploads files from the server; private signed URLs are generated for admins and expire after 10 minutes.
4. Run `npm run dev`. Hot reloading is on: saved changes appear in the browser without a restart. If they don't (Windows, WSL with the project on the Windows drive, Docker, network drives), run `npm run dev:poll` instead, which watches files by polling. A hosted preview (such as the `*.e2b.app` one) must run `npm run dev`, not `npm start`, to hot-reload; `next.config.ts` already allows its origin.
5. Run `npm test` for unit/component/action tests. `npm run test:e2e` runs the Playwright mobile registration flow in Supabase preview mode; install the browser once with `npx playwright install chromium` if needed.

The app expects the existing `get_my_role()` RPC to return the signed-in user's `profiles.role` value. Registration is limited to `tourist`/`operator` accounts; the role is re-checked on the server. Admin approval sets `profiles.role = 'operator'` and the dashboard also requires an `approved` `tours_operators.accreditation_status` row. The platform-wide sign-in/profile-provisioning flow is not part of this feature; the pages link to `/login`, so wire that path to the shared Supabase Auth experience before launch.

The existing schema should enforce at most one operator application per `user_id` (including rejected applications, which are updated on resubmission). The action checks current status and uses a conditional update, but database uniqueness is still required to prevent simultaneous first submissions from creating duplicates.

## Sign in, sign up, Google and email verification

`/signup` creates an account that is **not usable until its email is confirmed**; `/login` signs in with a password or with Google, and `/verify-email` sends a confirmation link again. Every link in an email lands on `/auth/callback`, which exchanges it on the server and forwards the visitor to a same-site page. `/forgot-password` and `/reset-password` complete the set.

Three settings make this work, and none of them can live in this repository:

1. **Authentication → Sign In / Providers → Email → Confirm email: ON.** With it off, anyone can claim any address; the app detects that and refuses the session, but the project should be configured properly.
2. **Authentication → URL Configuration:** Site URL plus `/auth/callback` on every host you deploy to (`http://localhost:3000/auth/callback`, `https://<your-domain>/auth/callback`, and the Vercel preview wildcard).
3. **Authentication → SMTP Settings:** a transactional mail provider — Supabase's built-in service only delivers to your own team's addresses.
4. **Authentication → Providers → Google:** a Google Cloud OAuth client with `https://<project-ref>.supabase.co/auth/v1/callback` as its authorised redirect URI, pasted into Supabase. The client secret stays in the dashboard.

`docs/AUTH.md` has the full checklist (including the `{{ .TokenHash }}` email templates, leaked-password protection and rate limits), the audit that led here, the validation rules and the rate windows.

## Existing schema integration

No database tables, enums, or migrations are created by this feature. Because the repository started without generated Supabase types or the schema DDL, the field mapping is centralized in `src/lib/tours/operator-contract.ts` and currently expects:

- `tours_operators`: `id`, `user_id`, `business_name`, `contact_person`, `contact_email`, `contact_phone`, `business_address`, `dti_registration_url`, `business_permit_url`, `gcash_qr_url`, `accreditation_status`, `rejection_reason`, `reviewed_by`, `reviewed_at`, and `created_at`.
- `profiles`: `id` (same UUID as `auth.users.id`) and `role`.

The three `*_url` columns contain **private Storage object paths**, not public URLs. If the verified schema uses different names, change the centralized contract and the select/update payloads to match it; do not add or recreate tables. The feature fails closed if an authenticated role cannot be read.

## Security notes

- Application documents are private. The browser sends them to a Server Action; the server checks the authenticated user, role, total/per-file size, MIME signature, and ownership path before upload.
- The action uses the service-role client only on the server and only after checking the user's Supabase session. Admin listing/review repeats a server-side `get_my_role() === 'admin'` check.
- Operator pages must continue checking both role and accreditation status in future Server Actions, not just hide dashboard links in the UI.
- Admin document links are short-lived signed URLs. Do not make this bucket public.
- Images are recompressed in the browser before upload (QR images retain lossless PNG output where possible); PDFs are uploaded unchanged.

## Guide accreditation

Guide registration adds `/tours/guide/register`, `/tours/guide/pending`, `/tours/guide/dashboard`, `/tours/guide/my-qr`, and the admin queue at `/tours/admin/guides`. The application stays pending until an admin approves it; the dashboard and downloadable/printable badge QR each re-check both `profiles.role = 'guide'` and the approved status on the server.

The guide ID document goes to a separate **private** Storage bucket named `tours-guide-sensitive-documents` (or `TOURS_GUIDE_SENSITIVE_BUCKET`). Configure it with a 5 MB max object size and `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Storage reads are not exposed to browser clients: an admin-only Server Action selects only the stored object path using service_role and returns a 3-minute signed download link. The QR payload contains only the public guide row UUID; it never includes ID numbers, document paths, or consent data. Sensitive-table reads and writes and private-link creation emit a minimal structured `guide-sensitive-audit` event to server logs containing actor ID, guide ID, operation, outcome, and timestamp—but no ID number, document path, URL, or file content. No audit table is assumed or added; configure the hosting platform’s server-log retention/access policy before production use.

No guide schema is created or migrated. The existing database should enforce at most one `tours_guides` row per `profile_id` to avoid concurrent duplicate first applications. Since the repository has no generated database types or DDL, `src/lib/tours/guide-contract.ts` centralizes the expected field names:

- `tours_guides`: `id`, `profile_id`, `contact_phone`, `bio`, `consent_full_id_display`, `consent_given_at`, `accreditation_status`, `accreditation_notes`, `reviewed_by`, `reviewed_at`, and `created_at`.
- `profiles`: `id`, `full_name`, and `role`; guide registration syncs the applicant’s public name here.
- `tours_guide_sensitive_info` (service_role only, with a unique `guide_id` for upsert): `guide_id`, `full_legal_name`, `id_type`, `id_number`, and `id_document_path`.

Verify those names against the existing locked schema before production use, and ensure the existing `profiles.role` type/policies already accept the `guide` role value. The Server Action rejects unchecked consent before upload or database writes, generates `consent_given_at` on the server, writes consent and the timestamp to the public guide row, and writes the full legal name and ID details only to the sensitive row via the server-side service-role client. No Client Component or Server Component queries the sensitive table. Existing RLS policies must allow an authenticated applicant to read their own status and insert/update their own guide row, allow the admin queue’s authenticated query to select pending public rows and their corresponding profile names, and prevent public readers from seeing unapproved profiles; the private sensitive table and private Storage bucket must remain inaccessible to browser clients. No policy or schema changes are bundled here.

## QR badges, tickets & check-in

Set `QR_SIGNING_SECRET` (server only, 32+ characters, e.g. `openssl rand -base64 48`). Without it, badges, tickets and scanning stay off. Changing it invalidates every QR already issued.

- QR codes are links to `/tours/verify/<token>`, where the token is `CD1.<guide|booking>.<id>.<exp>.<HMAC-SHA256 signature>` (`src/lib/tours/qr-token.ts`). Any phone camera can open them. The page shows green for an approved guide or a valid ticket, and red for forged, altered or expired codes. It always re-reads the current accreditation, so revoking a guide takes effect immediately.
- Guide badges (`/tours/guide/my-qr`) are valid for a year from approval. Signed-in scans are logged in `tours_qr_scan_logs`.
- Booking tickets (`/tours/bookings/[id]/ticket`) appear once the booking is confirmed and expire at the end of the tour day (Manila).
- Check-in happens at `/tours/guide/check-in` (camera scanner where the browser supports `BarcodeDetector`, otherwise the phone camera app or a pasted code) or from the guest list at `/tours/guide/tours/[bookingId]/roster`. The `tours_check_in` function only accepts the assigned approved guide (or the operator/admin), a confirmed booking, and today's date. Each guest is recorded once, so a repeat scan is harmless.

## Notifications (in-app + Web Push)

Database triggers write a `tours_notifications` row for each event:
- bookings: created, confirmed, declined, cancelled, completed;
- guide assigned;
- payments received and refunds;
- receipts submitted or rejected;
- cancellation requests and their outcome;
- check-in;
- new messages (one per thread every 10 minutes);
- accreditation and package review results;
- new reviews.

Nobody is notified about their own action. The header bell shows them live (Realtime), and `/tours/notifications` lists them with the push on/off switch.

To turn on push to phones and desktops:

1. `npx web-push generate-vapid-keys`, then set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and a random `NOTIFICATIONS_PUSH_SECRET` (32+ characters) in Vercel. `SUPABASE_SECRET_KEY` (or the legacy `SUPABASE_SERVICE_ROLE_KEY`) must also be set.
2. Tell the database where to send pushes (Supabase SQL editor; use your production URL and the same secret):
   ```sql
   select vault.create_secret('https://<your-domain>/api/notifications/push', 'tours_push_endpoint');
   select vault.create_secret('<NOTIFICATIONS_PUSH_SECRET>', 'tours_push_secret');
   ```
   For each new notification whose recipient has a device, the trigger `tours_notifications_dispatch_push` calls that URL through `pg_net` after the transaction commits. The route re-reads the notification with the service role, sends it with `web-push`, drops subscriptions that return 404/410, and marks it pushed so retries don't send twice.
3. Users opt in from the prompt on their booking page or from `/tours/notifications`. On iPhone, Web Push needs the site added to the Home Screen (iOS 16.4+).

## Attractions & maps

- **Directory:** `/tours/attractions` (filter by category or "Open now") and `/tours/attractions/[slug]` (hours in Manila time, fee, typical visit, map, Google Maps link, source). Admins manage the dataset at `/tours/admin/attractions`: add/edit/delete, photos, and a **CSV import** (template on the page; validates every row first, skips slugs that already exist).
- **Data:** the database (`tours_attractions`) is seeded only with places that have a citable public source (`supabase/seed/attractions.sql`). Every pin is marked unconfirmed until the Tourism Office checks it, and unknown hours or fees stay empty rather than guessed. **The team still needs to load the Municipal Tourism Office list (target: 30+ places) through the CSV import.**
- **Routes:** package pages draw the route through stops that have coordinates and show the distance and travel time. With `GOOGLE_MAPS_SERVER_KEY` (Routes API only), each leg comes from `computeRoutes` and is cached in `tours_route_cache` for 30 days. Without it, or when a call fails, legs are estimated as straight-line distance × 1.4 at 30 km/h and labelled "about".
- **Map display:** with `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` (Maps JavaScript API only, restricted to your domains by HTTP referrer), maps use Google Maps. Otherwise the page draws a sketch map. Set a monthly budget alert in Google Cloud.

## Trip planner

`/tours/plan` builds a 1–5 day plan from the attractions that have a map pin.
- **Rule-based engine** (`src/lib/tours/itinerary/`, pure TypeScript, always on):
  - filters by budget;
  - scores by interests, cost, category variety and travel;
  - fills each day greedily from the start time, only choosing places that are **open for the whole visit** (attractions without listed hours are assumed open 8 AM–5 PM and flagged);
  - adds travel time (straight-line × 1.4 at 30 km/h) and a lunch break between 11:30 and 12:30, which full-day trips cover;
  - keeps entrance fees within the per-person daily budget.
- **Validator:** `validate.ts` re-checks every plan (opening hours, overlaps, travel, budget, known places, no repeats). Property tests assert that every generated plan passes it.
- **Editing:** tourists can reorder, swap, remove and add stops. The day is re-timed and re-validated live, and saving re-validates on the server against the current dataset.
- **24/7 travel assistant** (`src/lib/tours/assistant/`, `/api/assistant`, `/tours/help`): a chat on every page that answers from live data (tours, open dates and seats, prices, places, events, policies) and, for signed-in tourists, their own bookings, payments and tickets. It only reads; buttons under each reply lead to the real booking, payment or ticket pages. For complaints or anything it can't answer, it offers an editable message to the booking's operator or the Daet Tourism Office. Gemini (streaming, own tool loop) when `GEMINI_API_KEY` is set; `ASSISTANT_LLM=off` disables it and `ASSISTANT_MODEL` overrides the model (default `gemini-flash-latest`; `ITINERARY_MODEL` for the planner). Without a key it answers in basic mode. 30 AI messages per person per 10 minutes.
- **AI trip assistant** (`assistant.ts`, `llm.ts`): "Describe your trip" fills the form from plain English or Taglish, and "Ask the assistant" edits a plan ("add Bagasbas Beach to day 2", "make it relaxed"). With `GEMINI_API_KEY` set, Gemini reads the request; without it, built-in rules do. Either way the result is re-validated before it is shown. `ITINERARY_LLM=off` turns the AI off. AI calls are limited to 20 per person per 10 minutes.
  - Claude (`claude-opus-5-5`, low effort, 15 s timeout, structured JSON output) sees only our attraction list and the draft. It may reorder stops and write tips.
  - Its order is re-timed by the engine and must pass the validator; any timeout, refusal or invalid plan keeps the rule-based draft.
  - Results are cached in memory per preference set.
- **Saved plans:** `/tours/my-itineraries` (view, share link, delete) and `/tours/itineraries/shared/[token]` (read-only, no owner details). After saving, "Book matching tours" lists published packages with a stop within 1.5 km of a planned place.

## Testing & evaluation

| What | Command |
|---|---|
| Unit and property tests | `npm test` |
| E2E + accessibility at 375px (mock Supabase) | `npm run test:e2e:tours` (set `PW_CHROMIUM_PATH` to use a local Chromium) |
| Database integration (rolls back) | `psql "$DATABASE_URL" -f supabase/tests/integration.sql` |
| Package RLS regression (offline, in-memory Postgres) | `node --test scripts/package-policies.test.mjs` |
| Package policy catalog (read-only; all rows must pass) | `psql "$DATABASE_URL" -f supabase/tests/package_policy_catalog.sql` |
| Demo accounts and data for a staging project | `DEMO_PASSWORD=… DEMO_GROUPS=3 npm run seed:demo` |
| Realistic demo set (5 operators, 8 guides, 10 tourists, bookings) | `DEMO_PROFILE=realistic DEMO_PASSWORD=… npm run seed:demo` |
| Guide schedule and swap checks (rolled back) | `psql "$DATABASE_URL" -f supabase/tests/guide_swaps.sql` |

- Evaluator walkthroughs and the credentials sheet: `docs/EVALUATION_KIT.md`.
- Security findings and what to do about them: `docs/SECURITY_REVIEW.md`.
- Package policy migration order, access matrix and drift verification: `docs/PACKAGE_POLICIES.md`.

## Rewards (CONNECT-Daet points)

- Points live in the shared `rewards_ledger` table. `UNIQUE (source, ref_id)` makes every award once-only.
- Tours awards come from database triggers: paid +50 (reversed on refund), checked in +30, completed +20, review +10, trip plan +5 (3 a day).
- Tourists see their balance on `/tours/me`.
- Other subsystems award points from server code with `addPoints(createSupabaseAdminClient(), …)` from `src/lib/rewards.ts`.
- Shared-table contract: `docs/SHARED_TABLES.md`.

## Dashboards

- `/dashboard` sends each user to their own dashboard:
  - tourists to `/tours/me`;
  - operators to `/tours/operator/dashboard`;
  - guides to `/tours/guide/dashboard`;
  - Tourism Office admins to `/tours/admin`, with KPIs at `/tours/admin/analytics`.
- On phones, signed-in users get a bottom tab bar for their role.
- Admin KPIs come from the `tours_admin_analytics(from, to)` database function, which only admins can run.
- Guides set their availability on their dashboard; operators see it when assigning a guide.

## Reviews & ratings

- A tourist can review a booking once, after the operator marks it **completed**. The form is on the booking page, and the "How was your tour?" notification links to it.
- Ratings come from the `tours_package_ratings`, `tours_operator_ratings` and `tours_guide_ratings` views. They are shown on browse cards and package pages.
- Operators post one public reply per review at `/tours/operator/reviews`.
- Tourism Office admins hide abusive reviews, with a reason, at `/tours/admin/reviews`. Hidden reviews leave the public pages and the averages.
- All writes go through the `tours_submit_review`, `tours_reply_to_review` and `tours_set_review_hidden` database functions.

## Events calendar & merchandise showcase

- Events can link to an attraction. Each event page lists tours with open dates during the event, nearby ones first.
- Accredited operators submit merchandise at `/tours/operator/merch`. The Tourism Office approves it at `/tours/admin/merch?show=pending` before it goes public.
- Public pages: `/tours/events` (monthly calendar, category filter, day view, "Add to my calendar" `.ics` download) and `/tours/merch` (t-shirts, mugs, souvenirs, pasalubong with seller contact). The home page shows upcoming events and featured products.
- Admin pages: `/tours/admin/events` and `/tours/admin/merch` (create, edit, publish/hide, feature, delete). Linked from the admin dashboard's Quick Actions.
- Setup: apply `supabase/migrations/20261023_create_tours_events_and_merchandise.sql`. It creates `tours_events` and `tours_merchandise` with RLS (the public reads published/active rows; only `get_my_role() = 'admin'` can write) and the public `tours-promo-images` Storage bucket (admin upload, public read, 5 MB, JPG/PNG/WebP).
- All event times are entered and shown in Philippine time (UTC+8); date logic lives in `src/lib/tours/events-calendar.ts`.
- Merchandise listings are advertisements only. Checkout belongs to the Shop subsystem (Team 7).

## Payments (PayMongo sandbox + manual receipts)

Tourists pay after the operator confirms a booking, from the booking page (`/tours/bookings/<id>`):

- **Online:** "Pay online" opens a PayMongo Checkout for the remaining balance (GCash, Maya, card). The amount is always read from the database.
- **Manual:** the tourist pays the operator's GCash/bank account (from Payment Settings) and uploads the receipt. The operator approves or rejects it on `/tours/operator/bookings`.
- Every payment lands in the `tours_payments` ledger. A trigger keeps `total_paid` / `payment_status` on the booking in sync. Operators see monthly totals and can download CSV at `/tours/operator/payments`.

### Sandbox setup

Quickest way: run the setup script from your machine (keys stay in your shell):

```bash
PAYMONGO_SECRET_KEY=sk_test_... APP_URL=https://<your-deployment> npm run paymongo:setup -- --test-checkout
```

It checks the key is a test key PayMongo accepts, registers (or reuses) the webhook for `/api/webhooks/paymongo`, prints the environment variables to set, and creates a ₱100 test checkout. Paying it should add a `tours_payment_events` row with outcome `unknown_booking`, which proves the webhook and its signature work. The manual steps below do the same by hand.


1. In the PayMongo dashboard (test mode), copy the **secret key** (`sk_test_...`) into `PAYMONGO_SECRET_KEY`.
2. Create a webhook pointing to `https://<your-deployment>/api/webhooks/paymongo` for the event `checkout_session.payment.paid`. Copy its secret into `PAYMONGO_WEBHOOK_SECRET`. PayMongo must be able to reach the URL, so use a Vercel preview/production URL or a tunnel when testing locally.
3. Set `NEXT_PUBLIC_APP_URL` to the same public base URL (used for the success/cancel redirects). Optionally set `PAYMONGO_PAYMENT_METHODS` to the methods enabled on your account.
4. Pay a confirmed booking with PayMongo's test GCash/card flow. Within seconds the booking shows **Paid** and the payment appears in the operator's ledger with its PayMongo reference.

Without `PAYMONGO_SECRET_KEY` the online button is hidden, and receipt upload still works. The webhook verifies `Paymongo-Signature` (HMAC-SHA256, 5-minute replay window), records each event once (`tours_payment_events`), and re-fetches the checkout session from PayMongo before writing to the ledger.
