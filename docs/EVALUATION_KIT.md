# Evaluation kit: SOP 4 sessions (F12)

Print this for each session. Each role's walkthrough takes 10–15 minutes on a phone. The steps match the ISO/IEC 25010 items on the evaluation form (shown in brackets).

---

## Before the session (facilitator, about 30 minutes)

1. **Use a staging project, not the live one.** Copy the migrations to a separate Supabase project (or a branch) so test bookings and reviews don't mix with real data.
2. **Environment** (see `.env.example`):
   - `PAYMONGO_SECRET_KEY` must be a **test** key (`sk_test_…`). The login page then shows "Test environment: no real money".
   - `PAYMONGO_WEBHOOK_SECRET`: a webhook pointing at `https://<staging-url>/api/webhooks/paymongo`.
   - `QR_SIGNING_SECRET` (32+ characters), `NEXT_PUBLIC_APP_URL` = the staging URL.
   - Optional: VAPID keys (push), Google Maps keys (road routes), `GEMINI_API_KEY` (AI chat and trip planner). Without them the app falls back gracefully: in-app notifications only, estimated routes, rule-based plans.
3. **Demo data and accounts:**
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=<staging url> SUPABASE_SERVICE_ROLE_KEY=<staging service key> \
   DEMO_PASSWORD='<a long password>' DEMO_GROUPS=<number of groups> npm run seed:demo
   ```
   This creates, per group, `tourist<N>@demo.connect-daet.test`, `operator<N>@…`, `guide<N>@…` and `admin<N>@…`. Each group also gets an approved operator and guide, a published demo package and open weekend dates for the next month. Copy the printed list into the sheet below.

   **Or the realistic set (R4)** for a fuller demo, with the same variables plus `DEMO_PROFILE=realistic`:
   ```bash
   DEMO_PROFILE=realistic NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… DEMO_PASSWORD='…' npm run seed:demo
   ```
   - It creates 24 accounts:
     - 5 operators (Calaguas, Mercedes island hopping, Bagasbas surf, Daet heritage walk, Vinzons) with 6 published packages and 60 days of open dates;
     - 8 approved guides, each with a 60-day schedule;
     - 10 tourists;
     - 1 admin.
   - It also creates about 14 upcoming bookings: pending, confirmed with an assigned guide (paid in full or in part), and one cancelled.
   - Some guide days are deliberately unavailable or not set, so the schedule rules (R6) can be shown.
   - Past completed tours and reviews are **not** seeded: the booking rules don't allow past dates. Use the walkthroughs to create them.
   - Add `--dry-run` to print the plan without touching the project.
4. Run `psql "$STAGING_DB_URL" -f supabase/tests/integration.sql` and `supabase/tests/guide_swaps.sql`. Both must report `fail=0` (they roll themselves back).
5. Charge the phones, connect to Wi-Fi, and open the staging URL once on each phone.

---

## Credentials sheet (fill in by hand, never commit)

| Group | Role | Email | Password | Tester name |
|---|---|---|---|---|
|  | Tourist |  |  |  |
|  | Operator |  |  |  |
|  | Guide |  |  |  |
|  | Admin (Tourism Office) |  |  |  |

PayMongo sandbox: use the test cards and e-wallet flows listed at <https://developers.paymongo.com/docs/testing>. No real money moves.

---

## Walkthrough 1: Tourist (12 minutes)

| # | Do | Expect | ISO item |
|---|---|---|---|
| 1 | Open the site and tap **Plan a trip**. Choose dates and interests, then tap **Plan my trip**. | A day-by-day plan with travel times, lunch and suggested tours | Functional Correctness, Learnability |
| 2 | Remove one stop, then **Save**. | The plan updates and stays valid; "Saved to My itineraries." appears | User Error Protection |
| 3 | Open a suggested tour, then **Book this experience**. Pick an open date and the number of people. | Only open dates can be chosen; the price total updates | User Error Protection |
| 4 | Sign in as the **tourist** when asked; finish the booking. | Booking page: status "Waiting for operator" | Functional Completeness |
| 5 | Open **Messages** and send "Is pickup included?" | The message appears instantly | Functional Appropriateness |
| 6 | *(After the operator confirms, walkthrough 2 step 3)* On **Home** (`/tours/me`), tap **Pay ₱…** and pay with a PayMongo test method. | You return to the booking page and see "Payment received" within a minute (webhook) | Functional Correctness |
| 7 | Tap **Show ticket QR**. | A QR code with the booking reference | Functional Appropriateness |
| 8 | *(After the guide checks you in and the operator completes the tour)* Rate the tour 5★ with a comment. | "Thanks for your review"; points appear on Home | Functional Completeness |
| 10 | Tap **💬 Ask the assistant** and ask "Paano mag-cancel?", then "Where is my ticket?". | The cancellation policy (48 hours), then your booking with **Show ticket QR** | Functional Appropriateness, Learnability |
| 11 | Ask the assistant "I want to talk to a person". Edit the message and tap **Send to Tourism Office**. | "Sent"; the admin is notified and sees it in Messages | Functional Completeness |
| 9 | *(Once a guide is assigned)* On the booking page tap **Message your guide** and ask about the meeting point. | A private chat with the guide opens; the operator can't read it | Functional Appropriateness |

## Walkthrough 2: Operator (12 minutes)

| # | Do | Expect | ISO item |
|---|---|---|---|
| 1 | Sign in as the **operator**. | Operator dashboard: today's tours, calendar, revenue, occupancy, rating | Appropriateness Recognizability |
| 2 | Tap a date on the calendar. | That day's bookings are listed below it | Operability |
| 3 | **Bookings** → confirm the tourist's booking and assign the guide (available guides are listed first). | Status "Confirmed"; the tourist is notified | Functional Completeness |
| 4 | Reply to the tourist in **Messages**. | Delivered instantly | Functional Appropriateness |
| 5 | **Revenue** → check this month, then **Download CSV**. | The PayMongo payment is listed by package and method | Functional Correctness |
| 6 | After the tour, mark the booking **Completed**. | The tourist can now review | Functional Completeness |
| 7 | **Reviews** → reply to the review. | The reply shows on the package page | Functional Appropriateness |
| 8 | Optional: **Merchandise** → submit a product. | "Waiting for approval" | Functional Completeness |
| 9 | **Bookings** → on the booking with a guide, tap **Message guide**. | A private operator–guide chat opens | Functional Appropriateness |
| 10 | **Home** → **Contact Tourism Office** and send a question. | The admin gets a notification; the reply appears live | Functional Appropriateness |

## Walkthrough 3: Guide (10 minutes)

| # | Do | Expect | ISO item |
|---|---|---|---|
| 1 | Sign in as the **guide**. | Guide dashboard: today's tours, next tours, rating | Appropriateness Recognizability |
| 2 | Tap three future days on **Your availability**. | Days turn green ("available"), tap again for "not available" | Operability |
| 3 | **My QR badge** → show it to another tester, who scans it with their phone camera. | The public verify page shows the guide's name and "Accredited by the Daet Tourism Office through CONNECT-Daet." | Functional Correctness |
| 4 | On the tour day: **Scan** → scan the tourist's ticket QR (or use the roster's manual check-in). | "Checked in"; the roster count goes up; scanning again says "Already checked in" | User Error Protection |
| 5 | Roster → **Message tourist only** and reply to the tourist's question. | Delivered instantly in the private chat | Functional Appropriateness |
| 6 | Home → **Your operators** → **Message operator**. | The operator–guide chat from walkthrough 2 step 9 opens | Functional Appropriateness |

## Walkthrough 4: Tourism Office admin (12 minutes)

| # | Do | Expect | ISO item |
|---|---|---|---|
| 1 | Sign in as the **admin** → **Analytics**. | Check-ins per day, bookings, revenue, cancellation rate, top packages and attractions | Functional Completeness |
| 2 | Switch the range to **7 days**, then **Show as table** under the chart. | Numbers update; the table matches the chart | Accessibility |
| 3 | **Approvals** → open a pending operator application (create one first from a fresh account if none). | Documents open from short-lived links; approve with a note | Functional Correctness |
| 4 | **Reviews** → hide an abusive test review with a reason. | It disappears from the package page and the average | Functional Appropriateness |
| 5 | **Merchandise** → approve the operator's product. | It appears on the public merch page | Functional Completeness |
| 6 | **Events** → add an event linked to Bagasbas Beach. | Its page lists tours open during the event | Functional Correctness |
| 7 | **Messages** → open the operator's question and reply. (**Message an operator** starts a new chat.) | The operator sees the reply from "Daet Tourism Office" | Functional Appropriateness |

---

## After the session

- Collect the evaluation forms. Note any step that failed, with the time and the phone model.
- Optional clean-up on staging: delete the demo bookings, or reset the staging project.
- Don't reuse demo passwords. Change `DEMO_PASSWORD` and re-run the seed for the next session.

## What the automated checks already cover

| Check | Command | Covers |
|---|---|---|
| Unit and property tests | `npm test` | Business rules (capacity, lifecycle, itinerary validity, tokens, rewards, analytics) |
| Database integration | `supabase/tests/integration.sql` | Access rules per role, overbooking, booking rate limit, webhook replay |
| E2E + accessibility | `npm run test:e2e:tours` | Every role's pages at 375px; WCAG 2.1 AA (axe); the walkthrough screens |
| Seed script | `npm run test:scripts` | Demo seed planning and idempotency |

PayMongo checkout and the webhook can't run in automated tests without sandbox keys. That is why step 6 of walkthrough 1 is done by hand.
