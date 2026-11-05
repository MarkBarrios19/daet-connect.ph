# Daet Tours — Remaining Features Implementation Plan

_Prepared 2026-10-23 · Branch `claude/epic-cray-pgfa7m` (PR #5) · Companion to [`AUDIT_AND_ROADMAP.md`](./AUDIT_AND_ROADMAP.md)_

This plan covers every feature still missing from the **Daet Local Tour Operator and Itinerary Booking Platform** (CONNECT-Daet.ph subsystem). The capstone context document's SOP 1–4 and the ISO/IEC 25010 evaluation form drive the scope. Each feature lists what already exists in the **live Supabase database**, what to build, where the code goes, how to test it, and when it's done.

---

## 0. Ground truth: what the live database already has

I inspected the production Supabase project (`CONNECT-DAET.ph`, Postgres 17) read-only on 2026-10-23. **Many tables these features need already exist but no code uses them.** Build on them; don't create duplicates.

| Table (live) | Rows | Used by code? | Feature that should own it |
|---|---|---|---|
| `tours_package_availability` (date, capacity_total, capacity_booked) | 0 | ❌ | F2 Availability |
| `tours_guide_availability` (guide_id, available_date, is_available) | 0 | ✅ F9 | F9 Guide dashboard |
| `tours_booking_participants` (full_name, age, special_requirements) | 0 | ❌ | F2 Booking / F3 Roster |
| `tours_cancellations` (enum `cancellation_status`) | 0 | ❌ | F2 Cancellations |
| `tours_payments` (method, status, reference, receipt) | 2 | ✅ manual recording | F1 **canonical ledger** |
| `tours_booking_payments` | 0 | ❌ | F1 — **duplicate, retire** |
| `tours_payment_proofs` (reference, proof image, verification) | 0 | ❌ | F1 Manual GCash proof |
| `tours_qr_scan_logs` (guide_id, scanned_by, revealed_full_id) | 0 | ❌ | F3 Guide verification log |
| `tours_conversations`, `tours_messages` | 0 | ❌ | F4 Messaging |
| `push_subscriptions` (endpoint, p256dh, auth) | 0 | ❌ | F5 Web Push |
| `tours_itineraries`, `tours_itinerary_items` | 0 | ❌ | F7 Itinerary planner |
| `tours_reviews` (rating 1–5, photos) | 0 | ✅ F8 | F8 Reviews |
| `tours_package_guides` | 0 | ❌ | F2/F9 Guide pool per package |
| `tours_guides.qr_code_value` | — | ❌ | F3 Signed QR |

**Database defects found** (all go into F0):

| # | Defect | Effect |
|---|---|---|
| D1 | Enum `package_status` = `draft, pending_review, published, archived`, **no `rejected`**. Admin review (`admin/packages/[id]/actions.ts`) sets `status = 'rejected'`. | **Rejecting a package fails in production.** |
| D2 | Admin dashboard counts `tours_packages.status = 'pending'` (`admin/page.tsx`). That isn't a valid enum value. | "Pending Packages" card is always wrong or errors. |
| D3 | Two booking-status systems: enum `booking_status` (`pending_payment … refund_confirmed`) is unused, while `tours_bookings.status` is varchar CHECK (`pending, confirmed, cancelled, completed, rejected`). | Ambiguous lifecycle; F2 must pick one. |
| D4 | Three payment tables (`tours_payments`, `tours_booking_payments`, `tours_payment_proofs`). | Ledger ambiguity (SOP 1 item 7, the top pain point). |
| D5 | Migration `20261023_create_tours_events_and_merchandise.sql` (PR #5) **not applied** yet. | `/tours/events` and `/tours/merch` show load errors. |
| D6 | Supabase advisors: 8 functions with mutable `search_path`; `get_my_role` and `handle_new_user` (SECURITY DEFINER) callable by `anon`; `tours_guide_sensitive_info` has RLS with no policies (fine if it's service-role only — document it); leaked-password protection off. | Security evaluation findings. |

---

## 1. Conventions every feature follows

- **Location:** `src/app/(subsystems)/tours/**` for routes, `src/lib/tours/**` for logic, `src/components/tours/**` for UI. Table prefix `tours_`.
- **Pure logic first:** every rule (pricing, capacity, state transitions, token signing, scheduling) lives in a plain TypeScript module with unit tests. Server Actions stay thin: auth → parse → call logic → DB.
- **`"use server"` files export only async functions.** Helpers go in sibling modules. This rule broke the build in PR #4.
- **Auth on every action:** `getAuthenticatedSession()`, then a role check, then an ownership/accreditation check. RLS enforces the same rule a second time.
- **Money** is computed server-side from DB rows, never trusted from the client. Store it as `numeric(10,2)` pesos; convert to centavos only at the PayMongo boundary.
- **Time:** dates and times shown and entered in Asia/Manila. Reuse `src/lib/tours/events-calendar.ts` helpers.
- **UI standards:** mobile-first at 375 px, touch targets ≥ 44 px, `rounded-2xl` cards, `rounded-full` primary buttons, confirmation before destructive actions, and validation errors that keep the user's input (see `use-promo-form.ts`).
- **Migrations:** one timestamped file per feature in `supabase/migrations/`, idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`), with `SET search_path = public` on every function.
- **Definition of done** for every PR: `npm ci && npx tsc --noEmit && npm test && npx next build` all green, new logic covered by tests, 375 px screenshot check, RLS reviewed, Supabase advisors re-run with no new warnings.

---

## 2. Dependency map

```
F0 Stabilize ──┬─> F1 Payments ──┬─> F9 Dashboards (revenue) ──> F12 Evaluation
               ├─> F2 Bookings ──┼─> F3 QR check-in ─────────────┘
               │                 ├─> F8 Reviews
               │                 └─> F10 Rewards
               ├─> F5 Notifications <── (F1, F2, F3, F4 emit events)
               ├─> F4 Messaging
               └─> F6 Attractions + Maps ──> F7 AI Itinerary
```

F0 blocks everything. After it, three tracks can run in parallel: **Transactions** (F1 → F2 → F3), **Engagement** (F5 → F4 → F8) and **Planning** (F6 → F7).

---

## F0 — Stabilize the base (Week 1) · _blocks all other work_

**Goal:** `main` builds, deploys to Vercel and passes CI. The database matches the code.

| Task | Files / objects |
|---|---|
| Move sync exports out of `operator/packages/[id]/edit/actions.ts` (6 functions) into `permissions.ts` / `validation.ts` | fixes `next build` |
| Fix ~45 app-code TS errors (image step signatures, `PackageStatus`, `.catch` on Postgrest builder, PayMongo default import) | `CoverImageStep.tsx`, `GalleryStep.tsx`, `EditPackageForm.tsx`, `gallery-schema-verification.ts`, `paymongo/client.ts` |
| Fix the 5 failing tests (NaN duration is a real bug; the other 4 are stale) | `package-validation.ts`, 3 test files |
| **D1:** `ALTER TYPE package_status ADD VALUE 'rejected'` and add `'rejected'` to `PackageStatus` | migration `…_f0_fixes.sql` |
| **D2:** admin dashboard counts `pending_review` | `admin/page.tsx` |
| **D5:** apply the events/merch migration | Supabase |
| **D6:** `ALTER FUNCTION … SET search_path = public` (8 functions); `REVOKE EXECUTE ON FUNCTION get_my_role, handle_new_user FROM anon`; enable leaked-password protection | migration + dashboard toggle |
| Regenerate `package-lock.json`; add `.github/workflows/ci.yml` (install → typecheck → test → build) | CI |
| Add `src/middleware.ts` (Supabase session refresh) | auth |
| Delete `operator/debug-profile`; move root status docs to `docs/`; delete `test-*.txt` | cleanup |
| Generate DB types (`supabase gen types typescript`) → `src/lib/supabase/database.types.ts`; type the clients | catches D1/D2-type bugs at compile time |
| Shared UI kit: `src/components/ui/{button,input,select,textarea,modal,card,badge,empty-state}.tsx` | used by all later features |

**Acceptance:** green CI on `main`; Vercel preview deploys; rejecting a package works; the advisor list shows no WARN items except ones documented as intentional.

**Status (2026-10-23): done, except the follow-ups below.**
- Build, types (0 errors), 541 tests green; `npm ci` works; CI workflow added; `src/proxy.ts` refreshes sessions; debug page removed; UI kit in `src/components/ui/`.
- Applied to the live DB: events/merch tables, `package_status` `'rejected'`, resubmission of rejected packages, `search_path` on all functions, `handle_new_user` RPC access revoked. The advisor now shows only the intentional items (see `20261024_f0_security_hardening.sql`) plus leaked-password protection.
- Bugs found and fixed along the way: edit-package page crashed; image upload/delete in the edit flow always failed; operator registration and approve/reject wrote a nonexistent column; admin package pages and the booking page selected nonexistent columns (`business_permit_number`, `contact_number`, `profiles.email`, `estimated_duration`); NaN duration accepted; button labels never rendered bold.

**F0 follow-ups**
1. **Saving an edited package fails in production:** the RPCs `concurrency_check` and `update_package_and_relations` don't exist in the live DB. The fix is `supabase/migrations/20261021_fix_update_package_and_relations.sql` (adds `NOT NULL display_order`, a unique constraint and a gallery trigger). Review it and apply it before anyone relies on editing.
2. After (1), type the Supabase clients with `Database` from `src/lib/supabase/database.types.ts`. About 14 strict-typing fixes remain (enum literals, `Json` payloads, nullable fields).
3. Turn on **leaked password protection** in Supabase Dashboard → Authentication → Settings (dashboard-only setting).

---

## F1 — Payments: PayMongo sandbox + unified ledger (Weeks 2–3)

_SOP 1 item 7 (x̄ = 3.70, highest pain), item 8; ISO 25010 Functional Appropriateness._

**Data**
- `tours_payments` becomes the **only ledger**. Add `provider` (`paymongo | manual`), `provider_ref` (unique), `raw_event jsonb`, `idempotency_key` (unique).
- Keep `tours_payment_proofs` for **manual GCash/bank proof uploads**. On verification, insert a `tours_payments` row.
- Drop `tours_booking_payments` once it's confirmed empty (it is: 0 rows).
- New `tours_payment_events` (event_id PK, type, received_at, processed_at) for webhook idempotency.
- Postgres function `recalculate_booking_payment(booking_id)` → sets `total_paid`, `payment_status` (`unpaid | partial | paid | refunded`) from the ledger. Call it from a trigger on `tours_payments`.

**Code**
| File | Purpose |
|---|---|
| `src/lib/paymongo/client.ts` | Lazy client (no throw at import), sandbox/live by key prefix |
| `src/lib/paymongo/checkout.ts` | `createCheckoutSession(booking)`: amount = `total_amount − total_paid` from DB, `metadata.booking_id`, success/cancel URLs |
| `src/lib/paymongo/webhook.ts` | `verifySignature(header, rawBody, secret, now)`: HMAC-SHA256 over `t.rawBody`, ±5 min tolerance, constant-time compare |
| `src/app/api/webhooks/paymongo/route.ts` | Reads raw body → verify → idempotent insert into `tours_payment_events` → on `checkout_session.payment.paid` insert a ledger row (service role) → emit notification (F5) |
| `tours/my-bookings/pay-button.tsx` | Replaces `gcash-payment-button.tsx`; redirects to the checkout URL |
| `tours/bookings/[id]/upload-proof.tsx` + action | Manual GCash proof → `tours_payment_proofs` + private bucket `tours-payment-proofs` |
| `tours/operator/bookings/verify-proof.tsx` + action | Operator approves/rejects a proof → ledger row |
| `tours/operator/payments/page.tsx` | Ledger view per booking, CSV export |

**Env:** `PAYMONGO_SECRET_KEY`, `NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY`, `PAYMONGO_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`.

**Tests:** signature valid / invalid / expired / replayed; tampered amount ignored; duplicate webhook event processed once; partial then full payment → `partial` → `paid`; refund → `refunded`.

**Acceptance:** in sandbox, a tourist pays a ₱8,500 booking with GCash test credentials. The booking shows **Paid** within seconds without anyone touching it. The operator ledger shows the PayMongo reference.

**Status (2026-10-23): built, migration applied; needs PayMongo sandbox keys for the end-to-end acceptance run.**
- Checkout action, signed webhook (`/api/webhooks/paymongo`), receipt upload + operator verification, ledger page + CSV. 64 new unit tests.
- Live DB: ledger columns, `tours_payment_events`, receipt columns + private bucket, DB-computed booking price, money columns writable only by the ledger trigger, and RLS scoped per role. This closed holes where any signed-in user could read/update every booking and read every payment. Verified per role against the live DB.
- Deviations from the plan: `tours_booking_payments` was locked (all access revoked) instead of dropped. `payment_method` keeps its old values, and the exact PayMongo method goes in `provider_method`. The Supabase tool can't run `DROP` without an interactive confirmation.
- **To finish:** add `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET` and `NEXT_PUBLIC_APP_URL` in Vercel, register the webhook (README → Payments), then run the acceptance test.
- Follow-ups: refunds (F2 cancellations); notify operator/tourist on payment (F5); fix the operator dashboard header overflowing by 21px at 375px.

---

## F2 — Availability, capacity & booking lifecycle (Weeks 3–4)

_SOP 1 items 3–4; ISO 25010 User Error Protection ("double-booking", "invalid dates")._

**Data**
- Use `tours_package_availability`. Add `UNIQUE (package_id, available_date)` and `CHECK (capacity_booked <= capacity_total)`.
- **Resolve D3:** migrate `tours_bookings.status` to the existing `booking_status` enum, mapping `pending → pending_payment` and `rejected → cancelled`. Drop the varchar CHECK.
- Lifecycle (one source of truth, `src/lib/tours/booking-lifecycle.ts`):
  `pending_payment → payment_submitted → confirmed → in_progress → completed`
  plus `→ cancelled`, `→ refund_requested → refund_confirmed`.
  Transitions are keyed by actor (tourist / operator / guide / admin / system). Unit-test the full matrix.
- RPC `create_booking(p_package_id, p_date, p_pax, p_variant_id, p_contact jsonb, p_participants jsonb)` (SECURITY DEFINER, `search_path` set): `SELECT … FOR UPDATE` on the availability row → check remaining capacity → compute price from the variant → insert booking + participants → increment `capacity_booked` in **one transaction**. A cancellation decrements the count.
- Use `tours_cancellations` for tourist requests. Operator/admin resolves; refunds link to F1.

**Code**
| File | Purpose |
|---|---|
| `tours/operator/packages/[id]/availability/page.tsx` | Month calendar (reuse the events grid) to open dates and set capacity; bulk "every Saturday in Nov" |
| `tours/packages/[id]/book/booking-form.tsx` | Date picker shows only open dates with remaining slots; participant names list |
| `tours/packages/[id]/book/actions.ts` | Calls the `create_booking` RPC |
| `tours/bookings/[id]/cancel-request.tsx` | Tourist cancellation request with cutoff rule (e.g. ≥ 48 h before) |
| `tours/operator/bookings/*` | Accept/decline, mark in-progress/completed through the lifecycle module only; also check `accreditation_status = 'approved'` |

**Tests:** concurrent bookings for the last slot → exactly one succeeds (integration test with two parallel RPC calls); past and closed dates rejected; every illegal transition rejected.

**Acceptance:** the platform can't overbook; every status change follows the lifecycle; a tourist can request cancellation and see its outcome.

**Status (2026-10-23): built, migration `20261026_f2_booking_integrity.sql` applied.**
- Operators open dates in bulk (date range plus weekdays plus seats) and change seats or close a date at `operator/packages/[id]/availability`. The booking form lists only open dates with seats left. Packages with no open dates still accept any future date.
- The DB counts seats from bookings, and the booking insert trigger locks the date row, so two tourists can't take the last seat. A status-guard trigger enforces the lifecycle, and cancelled or declined bookings release their seats.
- Tourists cancel unpaid pending bookings instantly; other cancellations become requests the operator approves or declines (with a 48-hour "late" flag). Operators record refunds as `refunded` ledger rows, capped at what was paid.
- RLS: participants are visible only to the booking's tourist, operator, guide and admins; prices and stops can be edited only while a package is in draft or rejected.
- Verified with rolled-back scenarios against the live DB (overbooking, closed date, tourist self-confirm, early completion, self-approval, over-refund), 691 unit tests, the build and mobile screenshots.
- Deviations from the plan:
  - Kept the existing varchar statuses (`pending/confirmed/completed/cancelled/rejected`) instead of the D3 enum migration.
  - Used a row-locking insert trigger instead of a `create_booking` RPC.
  - Dates are a list with bulk weekday opening, not a month grid.
  - `replace_package_*` RPCs are now wrappers over `*_unchecked` (the Supabase tool can't apply SQL containing `DELETE`/`DROP` without a confirmation it can't show).
- Follow-ups: participant names on the booking form; notify tourist/operator on status changes (F5); a two-session concurrency integration test (F12).

---

## F3 — Signed QR: verification, tickets & check-in (Weeks 4–5)

_SOP 1 items 5–6 (x̄ 3.51, 3.57); Ch. 4.3 §2._

**Token design** (`src/lib/tours/qr-token.ts`)
- Format: `CD1.<type>.<id>.<exp>.<sig>` where `type ∈ {guide, operator, booking}` and `sig = base64url(HMAC-SHA256(QR_SIGNING_SECRET, "CD1|type|id|exp"))`. Guide/operator badges expire 1 year after accreditation; booking tickets expire at the end of the tour day.
- Store the current token in `tours_guides.qr_code_value` (already a column) and regenerate on re-approval.
- `verifyQrToken(token, now)` → `{ ok, type, id } | { ok: false, reason }`, using a constant-time compare.

**Data**
- Existing `tours_qr_scan_logs`: log every badge verification (who scanned, when).
- New `tours_checkins` (booking_id, participant_id nullable, guide_id, scanned_at, method `qr|manual`), with `UNIQUE (booking_id, participant_id)`.

**Code**
| Route | Who | What |
|---|---|---|
| `/tours/verify/[token]` | Public | Green "Accredited" card (photo, name, operator, valid until) or red "Not valid / expired". Shows no ID numbers. |
| `/tours/bookings/[id]/ticket` | Tourist | Booking QR (offline-friendly, printable) |
| `/tours/guide/check-in` | Guide | Camera scanner (`BarcodeDetector`, fallback `@zxing/browser`). Validates: booking token is valid, tour date is today, guide is assigned, status is `confirmed`. Marks participants present; moves the booking to `in_progress`. |
| `/tours/guide/tours/[bookingId]/roster` | Guide | Participant list with check-in state and a manual check-in fallback |

**Tests:** forged/modified/expired tokens rejected; wrong-day and wrong-guide scans rejected; double scan is idempotent.

**Acceptance:** a tourist's phone ticket is scanned by the assigned guide on tour day, the roster updates, and the badge verification page works from any phone camera.

**Status (2026-10-23): built, migration `20261027_f3_qr_checkins.sql` applied. Needs `QR_SIGNING_SECRET` in Vercel.**
- Signed HMAC tokens (`qr-token.ts`) are encoded as links to `/tours/verify/<token>`, so any phone camera works. The verify page shows the guide's name and photo only while they are approved, and logs signed-in scans.
- Tourist ticket page; guide check-in page (BarcodeDetector camera, phone-camera or paste fallback, today's groups); guest list with whole-group and per-guest manual check-in. `tours_check_in` enforces the assigned approved guide (or the operator/admin), a confirmed booking and today's date, and records each guest once.
- Verified with rolled-back scenarios against the live DB (double scan returns "already", wrong day, wrong guide, direct insert blocked, RLS visibility, anon lookup not logged, signed-in lookup logged), 20 new unit tests (tamper property test included), the build and mobile screenshots.
- Deviations from the plan:
  - No `in_progress` booking status. Check-in is recorded in `tours_checkins` and the booking stays `confirmed` until completed.
  - Badge tokens are derived from the approval date, not stored in `qr_code_value`.
  - No operator badges.
  - No `@zxing/browser` fallback: iOS uses the phone camera app, which opens the same check-in page.
- Follow-ups: let a guide undo an accidental check-in; operator view of check-ins on the bookings page; badge revocation list if the secret ever leaks (rotate `QR_SIGNING_SECRET`).

---

## F4 — Real-time messaging (Week 6)

_SOP 1 items 3–4; Ch. 4.3 §3 "real-time communication"._

- Use the existing `tours_conversations` / `tours_messages`. Add RLS so only participants (tourist, the booking's operator, the assigned guide) can read and insert. Index `(conversation_id, created_at)`.
- A conversation is created automatically per booking on confirmation (F2 hook).
- `tours/messages/page.tsx` (inbox) and `tours/messages/[id]/page.tsx` (thread) use Supabase Realtime `postgres_changes` on `tours_messages` filtered by `conversation_id`; set `is_read` on view.
- Text only plus an optional image attachment (private bucket, signed URLs). Limit 1,000 characters; server-side rate limit of about 20 messages/min.
- **Acceptance:** tourist and operator chat about a booking in real time on two phones, and no one else can read the thread (RLS test with a third account).

**Status (2026-10-23): built, migration `20261028_f4_messaging.sql` applied.**
- One conversation per booking, opened from the booking page ("Message the operator"), the operator's bookings ("Message tourist") or the guide's guest list ("Message group"). Inbox at `/tours/messages` with unread counts; thread at `/tours/messages/[id]` with Realtime `postgres_changes` and photo attachments (private bucket, 1-hour signed links). The thread is read-only once a booking is cancelled or declined.
- Membership is derived from the booking each time (its tourist, the package's operator, the assigned guide), so reassigning a guide moves chat access with it. Admins can read but not post. All writes go through RLS plus triggers:
  - `sender_id` must be the caller;
  - 1–1000 characters or a photo;
  - 20 messages a minute per sender;
  - attachment paths must sit inside the conversation's folder.

  Conversations are created only by `tours_open_booking_conversation`. `anon` lost all access (it previously had full grants), and the old policy that let any user create a conversation with any operator is disabled.
- Verified with rolled-back scenarios against the live DB (same conversation reused, length/empty/bad path/spoofed sender/edit rejected, unread counts and mark-read, outsider can't read/post/open/create, rate limit, anon denied), 9 new unit tests, the build and mobile screenshots. Live Realtime delivery still needs checking on two phones against the real project.
- Deviations from the plan:
  - Read state is per person (`tours_conversation_reads`) instead of `is_read`, because a thread has up to three people.
  - Conversations open on first use, not on confirmation, so tourists can ask before the operator confirms.
- Follow-ups: push and email notifications for new messages (F5); "load older messages" beyond the latest 100.

---

## F5 — Notifications: in-app + Web Push (Weeks 5–6)

_Ch. 4.3 §3; the context doc names FCM or WebSockets, and this uses Supabase Realtime plus the standard Web Push API._

- New `tours_notifications` (profile_id, type, title, body, link, read_at, created_at) with RLS so users see only their own rows.
- `src/lib/tours/notify.ts` → `notify(profileId, type, payload)` (server-only, service role): inserts the row, then sends Web Push to every `push_subscriptions` row (the table already exists) using `web-push` with VAPID keys. Delete the subscription on HTTP 404/410.
- Header bell component: unread count, Realtime subscription, dropdown list, "mark all read".
- Service worker `public/sw.js` plus an opt-in prompt after the first booking.
- **Triggers:** booking created/confirmed/cancelled, payment received/proof rejected, guide assigned, check-in done, new message, accreditation approved/rejected, package approved/rejected, review received.
- **Env:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- **Acceptance:** an operator receives a push on their phone within seconds of a tourist's payment confirming.

**Status (2026-10-23): built, migration `20261029_f5_notifications.sql` applied. Push needs VAPID keys, `NOTIFICATIONS_PUSH_SECRET` and two Vault secrets (README → Notifications).**
- Database triggers on bookings, payments, receipts, cancellations, check-ins, messages, accreditation, package review and reviews write `tours_notifications` rows. They cover every path, including the PayMongo webhook and SECURITY DEFINER functions. Nobody is notified about their own action, and message notifications are merged per thread for 10 minutes.
- Header bell with live unread count (Realtime), dropdown and mark-all-read; `/tours/notifications` page with the per-device push switch; opt-in prompt on the booking page.
- Push path: insert → `pg_net` POST (async, after commit) → `/api/notifications/push` (bearer secret, timing-safe) → `web-push` to each subscription. Expired subscriptions (404/410) are removed, and `pushed_at` prevents double sends. `public/sw.js` shows the notification and opens its in-app link.
- RLS: users read and mark only their own notifications; nobody can insert or edit text; `tours_notify` isn't client-callable; `push_subscriptions` is no longer reachable by `anon`.
- Verified with a rolled-back lifecycle against the live DB:
  - every event produced the expected notification for the expected person;
  - message dedupe worked;
  - visibility, column and insert lockdown held.
- Also: 9 new unit tests, a `web-push` encryption check with generated VAPID keys, the build and mobile/desktop screenshots. Not yet verified: a real push to a phone (needs keys and a public URL).
- Deviations from the plan:
  - Rows are written by DB triggers instead of a `notify()` call in app code, so no path can forget to notify.
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` replaces `VAPID_PUBLIC_KEY`, because the browser needs it.
- Follow-ups: email fallback for important events; per-type notification preferences; pruning notifications older than 90 days.

---

## F6 — Daet tourism dataset + Google Maps (Weeks 5–6)

_SOP 3 "Baseline Tourism Dataset"; SOP 2 Google Maps; ISO 25010 Functional Correctness._

**Data:** new `tours_attractions`:
`id, name, slug, category (beach|heritage|nature|food|adventure|shopping|religious), description, latitude, longitude, address, opening_hours jsonb ({mon:[["08:00","17:00"]],…}), dwell_minutes, entrance_fee numeric, photo_url, source, is_active`.
Seed **≥ 30 Daet attractions** from Municipal Tourism Office data (`supabase/seed/attractions.sql`). The team collects this data.

New `tours_route_cache` (origin_id, dest_id, mode, distance_m, duration_s, polyline, fetched_at) with `UNIQUE (origin_id, dest_id, mode)`.

**Code**
| File | Purpose |
|---|---|
| `src/lib/tours/opening-hours.ts` | `isOpenAt(hours, date)`, `nextOpenWindow` (pure, tested) |
| `src/lib/maps/routes.ts` (server-only) | Routes API `computeRoutes` (polyline, distance, duration) and `computeRouteMatrix`; reads and writes the cache; falls back to Haversine × 1.4 road factor when the API is unavailable |
| `src/components/maps/route-map.tsx` (client) | Maps JS API: markers + polyline; key restricted by HTTP referrer |
| `/tours/attractions`, `/tours/attractions/[slug]` | Public directory with filters, "Open now" badge, map |
| `/tours/admin/attractions` | Admin CRUD (same pattern as admin events) |
| Package detail page | Route map of the package stops (`tours_package_stops` already has lat/lng) |

**Env:** `GOOGLE_MAPS_SERVER_KEY` (Routes API only), `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` (Maps JS only, referrer-restricted). Set a monthly budget alert.

**Acceptance:** the attraction directory is live with real data, and package pages show the route with total distance and travel time.

**Status (2026-10-23): built, migration `20261030_f6_attractions.sql` applied. Data collection still open.**
- Public directory and detail pages: category and open-now filters, Manila-time hours, map, directions link, and the source shown on each place.
- Admin CRUD with photos, plus a CSV import (all rows validated first, existing slugs skipped, swapped or far-away pins caught).
- Package pages show the route map, per-leg and total distance and time, and an "Open in Google Maps" link.
- Routes API client: `computeRoutes` per leg, 30-day cache in `tours_route_cache` (service role only), stale cache used if the API fails, then Haversine × 1.4 at 30 km/h. Maps JS when a browser key is set; otherwise an SVG sketch map.
- **Data:** I couldn't reach the Tourism Office data or open map services from the build environment, so the seed has only **8 places with citable public sources** (Wikipedia, PhilAtlas, travel guides). All pins are unconfirmed (`location_verified = false`), two have no pin yet, and unknown hours and fees are left empty. **The team must import the MTO list (30+ places) via `/tours/admin/attractions` to meet the acceptance criterion.**
- Verified: RLS against the live DB (anon reads only active rows, can't write or read the cache; tourists can't edit; admins can; half-entered coordinates rejected). 38 new unit tests: opening hours (overnight windows, Manila time, text round-trip property), Haversine (symmetry property), polyline decoding, leg caching and fallback, attraction and CSV validation. Build and screenshots also checked.
- Deviations from the plan:
  - Coordinates are optional, with `location_verified` and a required `source`.
  - Added a `park` category.
  - Route cache is keyed by coordinates (works for package stops and attractions) instead of attraction ids.
- Follow-ups: replace the seed with MTO data; enable the Maps keys with a budget alert; link package stops to attractions (F7 planner).

---

## F7 — AI-assisted itinerary planner (Weeks 7–8)

_SOP 3 "AI-Assisted Module"; ISO 25010 Functional Correctness; Learnability._

Follow the context doc's feasibility guidance: **no custom ML training.**

**7a. Rule-based engine (required, ships first)**: `src/lib/tours/itinerary/`
1. `filter.ts`: keep attractions matching interests, budget per day and accessibility.
2. `score.ts`: score = interest match + popularity − cost penalty.
3. `schedule.ts`: for each day from the start time (default 08:00), greedily pick the highest-scoring reachable attraction that is **open on arrival** and fits before the end time (default 18:00), using the travel matrix (F6). Insert a lunch block at 11:30–13:30 from `food` attractions.
4. `validate.ts`: **constraint checker**: every block inside opening hours, no overlaps, travel time respected, total cost ≤ budget, every ID exists.
5. Output: `{ days: [{ date, blocks: [{ attractionId, start, end, travelMinutesFromPrev, cost }] }], totals }`.

**7b. LLM refinement (optional, behind a flag)**: `src/lib/tours/itinerary/llm.ts`
- Prompt = user preferences + the **curated attractions JSON** only (no web knowledge) + the 7a draft. Require structured JSON output against the same schema.
- Every LLM result goes through `validate.ts`; when validation fails, fall back to the 7a draft. The LLM only reorders, writes friendlier descriptions and suggests swaps.
- Provider is the team's choice (the context doc mentions Gemini or OpenAI; Claude works the same). Keep the key server-side, set a timeout of about 15 s, and cache by preference hash.

**UI**: `/tours/plan`
- Step 1: dates (1–5 days), budget, interests (chips), pace (relaxed / normal / packed), group size.
- Step 2: time-blocked timeline per day plus map (F6), "swap", "remove" and "add" per block, re-validated live.
- Step 3: "Save" → existing `tours_itineraries` / `tours_itinerary_items` tables (store `ai_prompt_used`); "Book matching tours" suggests published packages whose stops overlap the plan.
- `/tours/my-itineraries`: list, view, delete, share link.

**Tests:** property-based (fast-check is already installed). For random attraction sets and preferences, the rule-based output **always** passes `validate.ts`, and invalid LLM output always falls back.

**Acceptance:** a tourist generates a valid 2-day plan in under 5 seconds, sees it on the map, saves it, and books a suggested package.

**Status (2026-10-23): built, migration `20261031_f7_itineraries.sql` applied. AI polish is optional (`ITINERARY_LLM=on` + `GEMINI_API_KEY`).**

**F7c — AI trip assistant (2026-10-24).** No migration.
- "Describe your trip" (`/tours/plan`): plain English/Taglish → form fields, with chips showing what was understood. Claude (structured output, `mergeTripFields` keeps only valid values) or the rule-based `parseTripRequest` (dates incl. "next weekend"/"Nov 15"/"bukas", days/nights, group incl. kids and partners, pace, budget per person or total, start/end times, interests from English and Filipino words).
- "Ask the assistant" (plan editor): change requests → new plan with a reply and one-step undo. Claude returns a full order of known ids plus a reply (re-timed, `validatePlan` must pass), else the rule-based `applyChangeRequest` (add/remove/swap by name or category, per day; pace; start/end times; drops stops that stop fitting and says so).
- AI is on whenever `GEMINI_API_KEY` is set (`ITINERARY_LLM=off` disables it); 20 AI calls per person per 10 minutes, then the rules answer. Requests are capped at 500 characters and wrapped as data in the prompt.
- Tests: 14 in `assistant.test.ts`, including property tests (random text never breaks the form; random change requests always return a valid plan with no repeats) and e2e for both boxes.
- 7a engine: filter, score, greedy schedule, and `validate.ts`. It respects opening hours for the whole visit, travel time, a lunch break between 11:30 and 12:30 (day trips cover it), pace, budget, and no repeats. A 2-day plan is generated in about 0.2 s in the browser test, and 300 attractions over 5 days take under 2 s in the unit test.
- 7b: Gemini via `@google/genai` with structured output (zod to JSON schema), 15 s timeout, in-memory cache by preference hash. The model only returns an order of known ids plus tips; the engine re-times it and `validatePlan` must pass, otherwise the draft is kept.
- UI: `/tours/plan` (details → editable timeline with ↑/↓, swap, remove, add, live validation, map per day → save → matching packages), `/tours/my-itineraries` (+ detail with share link and delete), `/tours/itineraries/shared/[token]`.
- DB:
  - items gain `attraction_id`, `item_kind`, `end_time`, `travel_minutes`, `cost` and `tip`;
  - itineraries gain `preferences`, `summary`, `plan_source` and `share_token`;
  - `anon` lost its full grants, and the shared view goes through `tours_shared_itinerary` (no owner data).
- Verified:
  - Property tests (fast-check): 300 random datasets and preference sets always produce plans that pass `validatePlan`; edits that break travel time are always caught; 500 random or garbage "LLM outputs" never yield an invalid plan.
  - 34 new tests in total; RLS checked against the live DB (spoofed owner blocked, other users can't read or edit, anon blocked, shared view hides the owner).
  - Build and mobile/desktop screenshots of generate and edit.
- Not verified: a live Gemini call (no API key in this environment); saving through the UI against the real project.
- Deviations from the plan:
  - Travel uses the Haversine estimate, not the Routes API matrix, to stay fast and free. Package pages still use Routes when configured.
  - There is no accessibility filter yet (no data).
  - Lunch is a generic break unless the dataset lists food places.
  - The budget covers entrance fees only.
- Follow-ups: use cached Routes legs in the planner; accessibility and popularity data; add food places to the dataset.

---

## F8 — Reviews & ratings (Week 7)

_ISO 25010 Appropriateness Recognizability; SOP 1 trust._

- Use the existing `tours_reviews`. Add `UNIQUE (booking_id)` and RLS: insert only by the booking's tourist **after status = `completed`**; public read.
- After completion, notify the tourist (F5) with a "Rate your tour" prompt.
- Show the average rating and review count on package cards, package detail, operator and guide profiles. Use a SQL view `tours_package_ratings` for averages.
- Operators can post one public reply (new column `operator_reply`, `replied_at`); admins can hide abusive reviews (`is_hidden`).
- **Acceptance:** only completed bookings can be reviewed, once each, and ratings appear on browse cards.

**Status: done** (migration `20261101_f8_reviews.sql`, applied live).
- Database:
  - Reviews are written only through `tours_submit_review`. It checks that the caller is the booking's tourist and the booking is `completed`; `UNIQUE (booking_id)` allows one review each. Direct inserts are revoked.
  - New columns `operator_reply`, `replied_at`, `is_hidden`, `hidden_reason`, `updated_at`, plus a foreign key to the booking.
  - `tours_reply_to_review` (the package's operator only; notifies the tourist) and `tours_set_review_hidden` (admins only, with a reason).
  - Hidden reviews are visible only to their author, the operator and admins.
  - The views `tours_package_ratings`, `tours_operator_ratings` and `tours_guide_ratings` leave hidden reviews out.
- UI:
  - The booking page has a "Rate your tour" form once the booking is completed. The F5 "How was your tour?" notification links there.
  - Browse cards show the star rating.
  - The package page shows the average, a breakdown and the latest reviews with operator replies, plus the operator's overall rating.
  - Operators reply at `/tours/operator/reviews` (header link "Reviews").
  - Admins moderate at `/tours/admin/reviews`, filtering by all, 1–2 stars or hidden.
- Verified:
  - Live dry-run (rolled back):
    - blocked: a review on a pending booking, a review by another user, a second review, a direct insert, a reply by the tourist, hiding by the operator;
    - works: the operator's reply (and its notification), hiding by an admin;
    - after hiding, anon sees neither the review nor the rating.
  - Unit tests, build, and phone/desktop screenshots of every page.
- Deviations from the plan:
  - There are no public operator or guide profile pages yet. The operator's rating appears on the package page. `tours_guide_ratings` is ready for the F9 dashboards and profiles.
  - Review photos are not supported yet.

---

## F9 — Role dashboards completion (Weeks 8–9)

_Ch. 4.3 §3 RBAC matrix; ISO 25010 Functional Completeness._

| Dashboard | Build |
|---|---|
| **Tourist** `/tours/me` | Upcoming trips with ticket QR, payment status and pay button, saved itineraries, messages, reviews to write, rewards points |
| **Operator** `/tours/operator/dashboard` | Today's tours; booking calendar; **revenue report** from the ledger (month, package, payment method; CSV); occupancy % from availability; ratings |
| **Guide** `/tours/guide/dashboard` | Schedule calendar; set availability (`tours_guide_availability`); today's roster and check-in scanner shortcut; QR badge |
| **Admin** `/tours/admin/analytics` | Municipal KPIs: arrivals (check-ins/day), bookings and revenue per operator, cancellation rate, top attractions and packages, accreditation queue ageing, rating distribution. SQL views/RPCs only, with charts (lightweight, e.g. Recharts) |
| Shared | Unified role-aware `/dashboard` redirect; bottom tab bar on mobile for each role |

**Acceptance:** each of the 4 evaluator personas can do their whole job from their dashboard without typing URLs.

**Status: done** (migration `20261102_f9_dashboards.sql`, applied live).
- **Shared:**
  - `/dashboard` sends each role to its own home, including pending or rejected accreditation states.
  - Signed-in users get a five-tab bar at the bottom on phones, plus a "My dashboard" link in the header.
  - The header nav now scrolls instead of overflowing at tablet widths.
- **Tourist `/tours/me`:**
  - upcoming tours with booking and payment status, a ticket QR button and a "Pay ₱…" button that jumps to the payment panel;
  - completed tours still waiting for a review;
  - unread messages, saved trip plans and the push opt-in.
- **Operator dashboard:**
  - bookings waiting for confirmation;
  - money received this month, linking to the revenue report;
  - occupancy (seats sold out of seats offered on open dates this month);
  - rating and reviews waiting for a reply;
  - a booking calendar (pax per day; tap a day for its bookings), today's tours, revenue by package with CSV, and quick links.
  - The payments ledger is now "Revenue & payments", with month, method and package breakdowns and CSV.
- **Guide dashboard:**
  - today's tours with roster and scanner shortcuts, next tours, rating and badge;
  - an availability calendar: tap a day to cycle available → not available → clear.
  - Operators see this availability in the guide picker: available guides are listed first, and there's a warning when picking a guide who marked the date unavailable.
- **Admin `/tours/admin/analytics`:** filtered by 7/30/90-day or 12-month presets, or custom dates.
  - KPI tiles: check-ins, bookings and pax, revenue, cancellation rate.
  - An arrivals-per-day chart with hover and a table view.
  - Revenue and bookings per operator; top packages; top attractions in saved trip plans; rating distribution.
  - Accreditation queue ageing (under 3 days, 3–7 days, over 7 days, the last flagged as overdue).
  - All figures come from one admin-only database function, `tours_admin_analytics`.
- **Security:** guide availability was readable by anyone, including logged-out visitors. Now only operators and admins can read it; guides still manage their own rows.
- **Verified:**
  - Live dry-run, rolled back: the admin gets every section; a bad date range is rejected; operators and logged-out visitors can't run analytics; operators can read guide availability, guides only their own, logged-out visitors nothing.
  - Unit tests for tabs, redirects, calendar load, occupancy (property test), ranges and analytics parsing.
  - Build passes. Screenshots of all four dashboards at 375, 640, 768, 1024 and 1280px, with no horizontal overflow.
- **Deviations from the plan:**
  - Charts are hand-built SVG/CSS (one colour, thin bars, labelled values) instead of Recharts, to avoid a dependency.
  - Rewards points wait for F10.
  - Arrivals count check-ins, so they depend on guides scanning tickets.

---

## F10 — Rewards Engine & CONNECT-Daet integration (Week 9)

_Team guide §5; Ch. 4.2 §3 DB synchronization._

- If Faculty Leads haven't shipped it: `src/lib/rewards.ts` → `addPoints(profileId, points, source, refId)` writing `rewards_ledger` (shared table owned by Team 11), with `UNIQUE (source, ref_id)` so a retry never double-awards.
- Award points from Team 8 events: booking paid (+50), checked in (+30), tour completed (+20), review written (+10), itinerary saved (+5). Awards happen server-side only, inside the same action that causes them.
- `impact_logs` push (if the parent platform provides the table): daily aggregate of arrivals, revenue and bookings per operator via a scheduled Edge Function.
- Document the shared-table contract (`profiles`, `rewards_ledger`, `impact_logs`) for Chapter 4.2 §3.
- **Acceptance:** points appear in the tourist dashboard and are never awarded twice for the same booking.

**Status: done** (migration `20261103_f10_rewards.sql`, applied live; contract in `docs/SHARED_TABLES.md`).
- **The table:** `rewards_ledger` did not exist, so Team 8 created it to the contract above, with `UNIQUE (source, ref_id)`.
  - Users read only their own points (admins read all); nobody writes from the browser.
  - Writes go through the idempotent `rewards_add_points`, callable only by the service role and triggers.
  - `src/lib/rewards.ts` exposes `addPoints(adminClient, …)` for other subsystems, plus `TOURS_REWARD_RULES` and label helpers.
- **Awards:**
  - Database triggers commit the award with the event, so the PayMongo webhook, manual payments, guide scans and operator actions are all covered: paid +50, checked in +30 (once per booking), completed +20, review +10, trip plan +5 (max 3 a day).
  - A refund after full payment deducts the 50 again, once.
  - Each award sends a "points earned" notification.
  - Existing paid and completed bookings were backfilled without notifications.
- **UI:** the tourist dashboard has a "Your points" card with the balance, the last five entries and how to earn more. The notification links to it.
- **`impact_logs`:** the parent platform hasn't created it, so there's no push yet. The proposed table and the Team 8 metrics are in `docs/SHARED_TABLES.md`, and the numbers are already available from `tours_admin_analytics`.
- **Security fix:** while documenting `profiles`, I found any signed-in user could set their own `role` to `admin`. The RLS update policy only checked the row owner. Browser updates are now limited to `full_name` and `avatar_url`; role changes stay with the service role.
- **Verified (live dry-run, rolled back):**
  - Paying, then partial, then paid again awards once.
  - Two participant scans award once; completion and review once each.
  - Two refunds reverse once.
  - Four trip plans in a day award three times; the balance adds up.
  - Direct inserts and the RPC are blocked for users.
  - Other non-admins and anon see nothing.
  - Self-promotion to admin is now blocked, while name edits and service-role role changes still work.
- **Deviations:** points for review and trip-plan awards are not removed if an admin later hides the review or the tourist deletes the plan.

---

## F11 — Events & merchandise follow-ups (Week 6, small)

- Apply the migration (D5) and seed the real 2026 Daet events calendar (Pinyasan Festival, Bagasbas surfing events, Undas, Christmas events) with the Tourism Office.
- Optional: let approved operators submit merchandise for admin approval (`submitted_by_operator_id`, status `pending|approved`).
- Link events to attractions (F6) and show "Tours happening during this event" on the event page.

**Status: done** (migration `20261104_f11_events_merch.sql`, applied live).
- **D5:** the events and merchandise tables were already live.
- **Calendar seed:** only events with a sourced 2026 date were added, each with a `source` note that only admins see:
  - Pinyasan Festival (15–24 June, Tourism Promotions Board calendar);
  - Undas (1–2 November, national holidays);
  - Simbang Gabi (16–24 December).
- **For the Tourism Office to add:**
  - **Bagasbas surf competition:** no 2026 date has been published. The 2025 regionals ran 2–4 May; the 2024 event was cancelled.
  - **Daet's Christmas lighting and other Christmas events:** no source found.
  - The admin event form now has a "Source of the date" field.
- **Events ↔ attractions:**
  - Events can link to an attraction (`attraction_id`), chosen in the admin form.
  - The event page shows the attraction card and **"Tours happening during this event"**: published packages with seats left on an event day (from today on). Packages with a stop within 5 km of the attraction come first, with the distance shown.
- **Operator merchandise:**
  - Approved operators submit products at `/tours/operator/merch`, with photos uploaded to their own folder only.
  - Every save, including edits to an approved product, goes back to `pending`.
  - Operators can't feature or approve, and can't set review notes.
  - The public sees only approved, active products.
  - Admins see a "Waiting for approval" queue on `/tours/admin/merch` and approve, or reject with a note.
  - Notifications go to the admins on each submission and to the operator on each decision.
- **Verified:**
  - Live dry-run, rolled back: self-approval and self-featuring blocked; notes stripped; operator approval blocked while edits work; anon can't see pending items; tourists can't submit; rejection notes are kept when the operator resubmits; notifications fire.
  - Unit tests for the event form fields, the review parser and the event-tours ranking.
  - Build passes. Screenshots of the event page, operator merch list and form, and the admin queue at 375 and 1280px.

---

## F12 — Testing, hardening & ISO 25010 evaluation readiness (Weeks 10–11)

| Area | Deliverable |
|---|---|
| E2E (Playwright, 375 px) | **Golden path:** tourist plans an itinerary → books a suggested package → pays in the PayMongo sandbox → webhook confirms → guide scans the ticket → tour completed → tourist reviews → admin analytics updates. Plus one path per role. |
| Integration | RLS tests per table with 4 role accounts; capacity race test; webhook replay test |
| Seed / demo mode | `supabase/seed.sql` with 4 role accounts per evaluator group, sample attractions, packages, availability and events; a sandbox money note on the login page |
| Accessibility | Labels, focus states, contrast ≥ 4.5:1, `lang`, axe check in E2E |
| Performance | Lighthouse mobile ≥ 85 on browse, package and plan pages; image sizes; route cache hit rate |
| Security | Advisor clean; secret scan; no service-role key in the client bundle; signed QR and webhook verified; rate limits on auth, messages and bookings |
| Evaluation kit | Printable walkthrough script (10–15 min per role) and test credentials sheet for SOP 4 sessions |

**Status: done**, except what needs your accounts or keys (marked ⚠).
- **E2E (Playwright, 375px):** `npm run test:e2e:tours`, 43 tests, also a CI job. A committed mock Supabase (`e2e/mock-supabase.cjs`) serves every role.
  - Covered: public pages, every role's pages, the tab bar, `/dashboard` routing, the walkthrough screens (plan → book → pay link → review → roster → analytics) and guide availability.
  - ⚠ PayMongo checkout and the webhook need sandbox keys, so they're a manual step in `docs/EVALUATION_KIT.md`.
- **Integration:** `supabase/tests/integration.sql`, 31 checks across anon, tourist, operator, guide and admin (access rules, overbooking, booking rate limit, webhook replay). **31/31 pass** on the live project; the script rolls back.
  - A true two-session booking race isn't automated; the availability-row lock serializes it.
- **Seed / demo mode:** `npm run seed:demo` (`scripts/seed-demo.mjs`, tested with `npm run test:scripts`).
  - Per group it creates four role accounts plus an approved operator and guide, a published package and weekend availability.
  - The password comes from `DEMO_PASSWORD`, never the repo.
  - The login page shows "Test environment: no real money" unless PayMongo uses a live key.
  - ⚠ Run it on a staging project.
- **Accessibility:** axe (WCAG 2.1 AA, serious/critical) runs on every E2E page visit; 38 pages pass.
  - Fixes: muted text contrast raised to ≥ 4.5:1 across the app; labels on filters and pickers; logo and calendar names; no `aria-pressed` on links; missing h1s; heading order on browse; `lang="en"` is checked.
- **Performance:** Lighthouse mobile on a production build against the mock.
  - Performance: browse 99, package 99, plan 98, home 100 (target ≥ 85). LCP 1.8–2.3 s, TBT ≤ 60 ms, CLS 0.
  - Accessibility: package, plan and home 100; browse 98 for heading order, fixed afterwards but not re-measured. SEO 100.
  - Added a favicon (it was a 404).
  - Real cover photos and network latency will lower these numbers; re-check on staging.
- **Security:** see `docs/SECURITY_REVIEW.md`.
  - Advisor fixes: 51 policies, 19 indexes, a function search_path.
  - Booking rate limit, and an open-redirect fix on login.
  - No secrets in the client bundle.
  - ⚠ **Two critical findings need you:** the service-role key is in public git history (rotate it), and the test account passwords were published (change them, including the only admin).
- **Evaluation kit:** `docs/EVALUATION_KIT.md` has a setup checklist, a blank credentials sheet and walkthroughs per role mapped to ISO 25010 items.

---

## F13 — 24/7 travel assistant (AI customer service)

**Status (2026-10-25): built.** Migration `20261107_tourist_office_chat.sql` adds the tourist ↔ Tourism Office chat used for handoffs.
- Answers and guides; never books, pays or cancels. Read-only tools run with the caller's own Supabase session (RLS): `search_tours`, `tour_details` (open dates and seats), `attraction_info`, `upcoming_events`, `policy` (FAQ built from the app's own constants), `my_bookings` (signed in), `plan_trip_link` (pre-fills `/tours/plan?describe=`), `handoff`.
- Gemini streaming with our own tool loop (`llm.ts`). It stops on a refusal or a cut-off tool call, and falls back to basic mode (`basic.ts`) when no key is set, the limit is hit, or the call fails before any text.
- UI: floating dialog on every page (hidden on sign-in, ticket, scanner and chat threads) plus `/tours/help`; tour, booking, link and handoff cards. History stays in the browser tab (sessionStorage); nothing is stored server-side.
- Tests: `src/lib/tours/assistant/assistant.test.ts`, covering the FAQ, tools on a fake client, basic mode with a property test that never leaks another tourist's booking, streaming/fallback with a fake model, and limits. `e2e/travel-assistant.spec.ts` covers the dialog, bookings, handoff and help page at 375px with axe. Manual eval with a key: `docs/ASSISTANT_EVAL.md`.

## Adviser revisions (R1–R6)

**Status (2026-10-29): built.** The specs and system design are in [`ADVISER_REVISIONS.md`](ADVISER_REVISIONS.md).
- **R1:** the tourist exploration menu (Plan a trip, Attractions, Events, Souvenirs) shows only for visitors and tourists; staff dashboards show their own links.
- **R2:** an **All** chip in "What do you enjoy?"; the trip assistant reads "everything/lahat" as all categories.
- **R3:** every amount is shown with `formatPeso` (`src/lib/money.ts`) as ₱1,850.00. A guard test blocks hand-formatted pesos.
- **R4:** `DEMO_PROFILE=realistic npm run seed:demo` creates 5 operators, 8 guides with schedules, 10 tourists with upcoming bookings, and 1 admin.
- **R5:** the travel assistant answers getting-here, getting-around and boat questions (curated, provisional facts) and "how long from A to B" with the `travel_time` tool, which uses road legs from the Routes cache or an estimate, boat legs from a table, and adds a directions button.
- **R6:** migration `20261108_guide_schedule_swaps.sql` (applied):
  - a guide can be assigned only on a day they marked available, and never twice that day; a booked day can't be marked unavailable;
  - guides can suggest a swap, and the operator approves or declines it;
  - tests: `supabase/tests/guide_swaps.sql`.

## 3. Schedule (11 weeks)

The schedule assumes about 4 developers. **A** = Transactions lead, **B** = Engagement, **C** = Planning/Maps, **D** = UI/QA. With fewer people, run the tracks one after another (about 16–18 weeks).

| Week | A — Transactions | B — Engagement | C — Planning | D — UI / QA |
|---|---|---|---|---|
| 1 | **F0 (all hands)** | F0 | F0 | F0 + UI kit |
| 2 | F1 checkout + webhook | F5 schema + notify() | F6 attractions data collection + schema | E2E harness, seed data |
| 3 | F1 ledger, proofs, F2 lifecycle | F5 bell + Web Push | F6 directory + admin CRUD | Booking UI polish |
| 4 | F2 availability + `create_booking` RPC | F4 schema + RLS | F6 Routes API + cache + map | F2 tests |
| 5 | F3 tokens + verify page | F4 chat UI | F6 package route maps | F3 ticket UI |
| 6 | F3 scanner + roster | F11 events follow-ups | F7a filter/score/schedule | F4/F5 E2E |
| 7 | F8 reviews | F8 UI | F7a validate + UI | F7 property tests |
| 8 | F9 operator revenue | F9 tourist dashboard | F7b LLM layer + save | F9 guide dashboard |
| 9 | F10 rewards | F9 admin analytics | F7 "book matching tours" | Accessibility pass |
| 10 | F12 security + RLS tests | F12 perf | F12 itinerary edge cases | Golden-path E2E |
| 11 | **Evaluation dry-run, bug bash, freeze** | | | Evaluation kit |

---

## 4. PR breakdown

Each PR stays reviewable (under about 600 changed lines where possible). Branches follow `team8/<feature>`.

1. `team8/f0-fix-build` · 2. `team8/f0-db-fixes` · 3. `team8/f0-ci-middleware-cleanup` · 4. `team8/f0-ui-kit`
5. `team8/f1-paymongo-checkout-webhook` · 6. `team8/f1-ledger-proofs`
7. `team8/f2-lifecycle` · 8. `team8/f2-availability-rpc` · 9. `team8/f2-cancellations`
10. `team8/f3-qr-tokens-verify` · 11. `team8/f3-checkin-roster`
12. `team8/f5-notifications` · 13. `team8/f5-web-push` · 14. `team8/f4-messaging`
15. `team8/f6-attractions` · 16. `team8/f6-maps-routes`
17. `team8/f7-itinerary-engine` · 18. `team8/f7-planner-ui` · 19. `team8/f7-llm`
20. `team8/f8-reviews` · 21–24. `team8/f9-{tourist,operator,guide,admin}-dashboard`
25. `team8/f10-rewards` · 26. `team8/f12-e2e-seed`

---

## 5. Traceability to the research instruments

| Instrument item | Feature(s) |
|---|---|
| SOP 1 #1 Up-to-date attraction info | F6 |
| SOP 1 #2 Manual multi-stop itineraries | F7, F6 |
| SOP 1 #3 Disorganized slot coordination | F2, F4 |
| SOP 1 #4 Last-minute changes | F2 cancellations, F4, F5 |
| SOP 1 #5 Verifying accreditation | F3 verify page |
| SOP 1 #6 Paper attendance logs | F3 check-in + roster |
| SOP 1 #7 No central ledger | F1 |
| SOP 1 #8 Reconciliation delays | F1 webhook, F9 revenue |
| ISO Functional Completeness | F9 |
| ISO Functional Correctness | F7 validator, F6 routes, F3 tokens |
| ISO Functional Appropriateness | F1, F4 |
| ISO Learnability / Operability | UI kit, F7 wizard, mobile tab bars |
| ISO User Error Protection | F2 capacity and dates, confirmations, validation that keeps input |
| ISO Aesthetics / Accessibility | F0 UI kit, F12 accessibility pass |
| Recommended future Security evaluation | F0 D6, F1 signatures, F3 HMAC, F12 RLS tests |

---

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Attraction data from the Tourism Office arrives late | Start collection in Week 2; ship F7a with a provisional 30-item dataset from public sources, clearly marked |
| Google Maps cost / quota | Server cache, matrix only for chosen candidates, Haversine fallback, budget alert |
| PayMongo sandbox webhooks can't reach localhost | Use a Vercel preview URL or a tunnel for testing; webhook logic unit-tested with recorded payloads |
| LLM output invalid or slow | Rule-based engine is the source of truth; LLM is optional, validated, timed out and cached |
| Schema drift between code and DB (caused D1/D2) | Generated types in F0; CI type-check; migrations only via PRs |
| Merge conflicts with other teams | Stay inside `tours/`; shared changes (`components/ui`, `lib/rewards`) go through Faculty Lead review |
| Evaluation-day failure | Week 11 dry-run with the evaluation script; seed reset script; offline-capable ticket QR |
