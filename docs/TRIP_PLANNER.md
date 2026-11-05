# AI trip planner

The planner on `/tours/plan` (and the floating Daet AI assistant) turns a sentence like
"2 days of beaches for us" into a day-by-day Daet plan that people can book, share and
carry on the trip. Gemini only reads what the traveller wants and explains the plan;
every stop, time and price comes from the database through the rule-based planner.

## How it works

1. The traveller asks for a plan. If the app doesn't know the dates, who is coming
   (with each child's age) or where they travel from, it shows the **Before I draft**
   card first. No model call is made for that step.
2. The assistant calls `plan_trip` with interests, budget and pace read from their
   words. Dates and the group come from the card, never from the model.
3. The rule engine (`src/lib/tours/itinerary/`) builds the days; tours near the stops
   become **Book each trip** cards; Day 1 starts with **Getting there** from `tours_fares`.
4. The plan panel comes from the tool result (`itinerary` event), not from model text.
   Without Gemini (or when it fails) the same plan is drafted in basic mode.

| Piece | Where |
|---|---|
| Trip context, the "Before I draft" rules | `src/lib/tours/assistant/context.ts`, `src/components/assistant/questions-card.tsx` |
| `plan_trip` tool and events | `src/lib/tours/assistant/plan-tool.ts`, `respond.ts`, `llm.ts`, `prompt.ts` |
| Plan panel, Book each trip, share link | `src/components/planner/` |
| Planner page | `src/app/(subsystems)/tours/plan/planner-v2.tsx`, `panel-actions.ts` |
| Booking emails (Gmail) | `src/lib/email/` |
| Call-offs | `src/lib/tours/call-off.ts`, `supabase/migrations/20261115_trip_call_off.sql` |
| Offline trip day | `public/sw.js`, `src/components/tours/save-trip-offline.tsx` |

## Settings (Vercel environment variables)

| Name | What it does |
|---|---|
| `GEMINI_API_KEY` | Turns on AI answers. Without it the assistant runs in basic mode. |
| `ASSISTANT_MODEL`, `ITINERARY_MODEL` | Optional model override (default `gemini-flash-latest`). |
| `TRIP_PLANNER_V2` | `off` brings back the old planner form and turns off the "Before I draft" step. |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_FROM` | Booking emails. Without them nothing is sent. Free Gmail sends to about 500 people a day. |
| `NEXT_PUBLIC_APP_URL` | The site address used in email links. |

## Database

- `supabase/seed/fares_2026_11_transport.sql` and `fares_2026_11_towns.sql`: fares for
  Getting there. All rows are unverified estimates until the Tourism Office or the
  town LGU confirms them; edit them at `/tours/admin/fares`.
- `supabase/migrations/20261115_trip_call_off.sql`: call-offs (applied 2026-11-05).

## Operator: calling a trip off

1. Bookings → the confirmed trip → **Call off for weather**. Pick a reason or write one.
2. The traveller and the guide are told in the app, by push and by email.
3. The traveller picks a new date (seats are checked) or a full refund.
4. For a refund, the booking shows as cancelled with the call-off reason. Record the
   refund in the booking's refund panel once the money is sent.

## Privacy

- Children's ages and the travelling-from city are kept only with a saved trip.
- Shared links never show the owner, the travellers or their ages
  (`tours_shared_itinerary` returns only the plan).
- Trip pages and tickets saved on a phone are removed when the traveller signs out.

## Checks

- `npx jest` (includes `golden-prompts.test.ts`: 40+ planner prompts in English,
  Filipino and Taglish, checked in basic mode).
- `npm run test:e2e:tours` (phone width, with accessibility checks).
- With `GEMINI_API_KEY` on a preview: the planner rows (32–40) in `docs/ASSISTANT_EVAL.md`.
