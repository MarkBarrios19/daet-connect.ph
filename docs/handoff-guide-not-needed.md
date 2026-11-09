# Handoff: a tour that goes ahead without a guide

**For:** the owner and the next agent picking this up.
**Ask:** a guest asked the operator in chat, "hello po di namin kailangan ng tour guide". The operator's
bookings board could only clear the assigned guide, which looks identical to a guide they forgot to pick:
the row says "Unassigned", the dashboard says "no guide yet", the live page says "No guide assigned yet".
There was no way to say *this tour is guideless on purpose*.

**What this adds:** the guest's request is recorded on the booking. Clearing it is one action that also
unassigns whoever was leading, cancels their pending swap request, and tells both people. Every screen
then reads "no guide, as the guest asked" instead of nagging.

---

## 1. Apply the migration first

`supabase/migrations/20261201_guide_not_needed.sql` — paste it into the Supabase SQL editor (this repo
applies migrations by hand). It is idempotent and has no `DROP` statements.

It adds `tours_bookings.guide_not_needed_at` and `guide_not_needed_note` (≤300 chars) and three triggers:

| Trigger | When | What it does |
|---|---|---|
| `trg_tours_bookings_guide_request_guard` | BEFORE a guide or the flag changes | Naming a guide clears the flag; setting the flag clears the guide. The two can never be true together, whichever code path writes. |
| `trg_tours_bookings_guide_cleared` | AFTER the guide changes | Cancels the booking's pending swap request — a guide asking for a substitute is moot once nobody is leading. |
| `trg_tours_notify_booking_update` | AFTER status / guide / flag changes | Adds two notifications: "Tour taken off your schedule" to the guide who was removed, "No guide for this tour" to the guest. |

`supabase/tests/guide_not_needed.sql` is a self-rolling-back check for all of the above
(`psql "$DATABASE_URL" -f supabase/tests/guide_not_needed.sql`; read `REPORT pass=N fail=M`).

## 2. The rule, in one place

`src/lib/tours/guide-not-needed.ts` — `guideCoverage()` returns `assigned` | `waived` | `unassigned`,
`guideCoverageNote()` returns the " · no guide, as the guest asked" line for lists, and
`parseGuideNotNeededNote()` validates the note the same way the database does. Every screen uses these,
so the three states read the same everywhere.

## 3. Operator side

- **`bookings/actions.ts`**: new `setGuideNotNeeded(bookingId, notNeeded, note?)`. It signs the operator
  in, checks the booking is on one of their packages, refuses closed bookings, then writes the flag and
  `assigned_guide_id: null` in one update. `assignGuideToBooking` now clears a stale flag when a guide is
  named, and both actions revalidate the board, the dashboard, the live page and the tourist's page.
  The ownership check both actions share is now `requireOwnedBooking()`.
- **`bookings/guide-assignment.tsx`** — the "Guide & operations" panel:
  - unassigned → picker + Assign, and the quiet link **"Guest doesn't need a guide"**;
  - assigned → Unassign (asks first, naming the guide), or the same link, which warns that the guide is
    being taken off;
  - waived → "No guide for this tour" with the operator's note and **"Assign a guide after all"**.
  - The picker is now the `Select` kit from `components/ui/field.tsx` (raw controls are counted in
    `form-controls.baseline.json`; its entry for this file is gone).
- **`bookings/booking-row.tsx`**: "Assigned guide: None — as the guest asked" instead of "Unassigned".

## 4. Everywhere else

| Surface | Change |
|---|---|
| `operator/dashboard/operator-home.tsx` | Uses `guideCoverageNote()` — " · no guide yet" only when nobody has decided. |
| `operator/live/page.tsx`, `operator/live/[bookingId]/page.tsx` | "No guide: the guest asked to go without one." instead of "No guide assigned yet." |
| `live/load-live-tour.ts` | Carries `guideNotNeeded` for the operator's live page. |
| `bookings/[id]/page.tsx` (tourist) | "No guide for this tour — as you asked…" so the guest sees their request was heard. |
| `lib/tours/notifications.ts` | `guide_unassigned` and `guide_not_needed` get the guide icon. |

The guide's own dashboard, my-tours and check-in needed no change: their queries already filter on
`assigned_guide_id`, so a waived tour drops out of their list.

## 5. Tests

- `src/lib/tours/guide-not-needed.test.ts` — the three states, the note rules, the date label.
- `src/app/(subsystems)/tours/operator/bookings/actions.test.ts` — who may write, what is written,
  closed bookings refused, over-long note refused before the round trip.
- `src/app/(subsystems)/tours/operator/bookings/guide-assignment.test.tsx` — the panel in all three
  states: the request with a note, the warning when a guide is being removed, the undo.
- `e2e/operator-bookings-board.spec.ts` — the operator records the request and the row refreshes to it.
  The mock (`e2e/mock-supabase.cjs`) now keeps PATCHed rows for the run and has `/__reset_board`.

`npm run typecheck && npm test` are green. `npx next build` needs the Supabase env vars, as before.

## 6. Left alone, deliberately

- **The tourist's own request button.** The request arrives in chat today; the operator records it. A
  "we don't need a guide" button on the tourist's booking page would need its own migration column (or a
  `tours_cancellations`-style request table) so the operator can accept it rather than have it applied
  out of the blue.
- **Refunds.** A guide is not separately priced on a booking, so waiving one never changes money.
