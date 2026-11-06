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

The assistant's "Open the trip planner" link (`/tours/plan?describe=…`) puts the
traveller's words in the planner's message box; nothing is sent until they tap Send.

| Piece | Where |
|---|---|
| Trip context, the "Before I draft" rules | `src/lib/tours/assistant/context.ts`, `src/components/assistant/questions-card.tsx` |
| `plan_trip` tool and events | `src/lib/tours/assistant/plan-tool.ts`, `respond.ts`, `llm.ts`, `prompt.ts` |
| Plan panel, Book each trip, share link | `src/components/planner/` |
| Planner page | `src/app/(subsystems)/tours/plan/planner-v2.tsx`, `panel-actions.ts` |
| Booking emails (Gmail) | `src/lib/email/` |
| Call-offs | `src/lib/tours/call-off.ts`, `supabase/migrations/20261115_trip_call_off.sql` |
| Offline trip day | `public/sw.js`, `src/components/tours/save-trip-offline.tsx` |

## How visitors use it (decisions, 2026-11-05)

Settled in the design interview. Words follow `CONTEXT.md`.

| # | Question | Decision |
|---|---|---|
| 1 | Who we design for | Three visitors: a Filipino visitor from a big city on a phone writing Taglish; a foreign visitor writing English; a group organiser for 6 to 20 people. |
| 2 | When they use it | Mostly on the trip day in Daet, and when booking a tour they already want. Planning from scratch and dreaming come after. |
| 3 | Where they start | The floating assistant button on every page is the front door. |
| 4 | Assistant or planner | The assistant answers quick questions; a request for a plan moves to the planner. |
| 5 | Sign-in | Asked after 3 messages. |
| 6 | AI unavailable | Basic mode, without a notice to the visitor. |
| 7 | Success | A question answered on the site, then a tour booked. |
| 8 | Language | The assistant replies in Filipino or English, following the visitor. Pages stay English for now (see 23). No Bikol. |
| 10 | After 3 messages without signing in | Basic-mode answers continue; signing in gives full AI answers again. |
| 11 | Basic mode can't answer | Say plainly it can't check that, and give the operator's number or the right page. Never guess about weather, boats or times. |
| 12 | Trip-day questions | All of: what's open near me now, getting between towns and fares, is my tour on today, operator and meeting point, food nearby with prices, emergency numbers. |
| 13 | "Book X for 4 on Dec 20" | Open the tour's booking form with the date and guests filled in; the visitor confirms there. |
| 14 | Group larger than a tour allows | Say the limit and suggest messaging the operator for a private group. No automatic split. |
| 15 | Foreign visitors and money | Pesos with a rough amount in the visitor's currency; card payment as well as GCash and Maya (cards already exist). |
| 16 | Languages | Filipino and English only. |
| 17 | Opening the assistant on a tour page | A greeting about that tour with three suggested questions. |
| 18 | Counting the 3 messages | 3 a day; tapping a suggested question counts. |
| 19 | Who pays for a group | One person books and pays for everyone. No bill splitting. |
| 20 | Messaging the operator | In the site, after signing in. |
| 21 | Location | Asked only when the visitor asks a "near me" question; if refused, ask which town. |
| 22 | Emergency numbers | Kept by the Tourism Office in the admin pages, shown with a "last checked" date. |
| 23 | Filipino text | Only the assistant answers in Filipino; the pages stay English for now. |
| 24 | Other currencies | A rough amount in the visitor's currency (guessed from the phone), daily rate, USD if unknown; marked "approx.". |
| 25 | Returning visitor | A fresh chat that remembers the trip (dates, group, origin) for signed-in visitors; old chats under Recent. |
| 26 | Feedback | "Was this helpful? Yes / No" under each answer. |
| 27 | Operator's phone | Public: shown to visitors who are not signed in. Only messaging in the site needs sign-in. |
| 28 | Telling them about sign-in | After the 3rd answer, a small card "Sign in to keep getting full answers" with Google sign-in. Answers stay simple until they sign in. |
| 29 | After "No" | Recorded only. |
| 30 | "Is my tour on today?" when not signed in | Ask them to sign in to see their bookings. No lookup by reference. |
| 31 | Open near me now | Known-open places first, then "Hours not listed" ones marked "Check before you go"; within 3 km, closest first, at most 5. |
| 32 | Emergency numbers not yet entered | The national 911 hotline, plus "Tell the operator or your guide". |
| 33 | Suggested questions | Place and event pages get a greeting with three suggested questions too. |
| 34 | Trip memory when not signed in | Dates and group kept on that phone until cleared. |
| 35 | Planning without dates | "No dates yet" drafts a sample plan; dates are asked when saving or booking. |
| 36 | Questions not about Daet | Politely decline in one line and steer back to Daet. |
| 37 | Signed-in limit | 20 full AI answers a day (raise to 50 once Gemini is paid); simple answers after that. |
| 38 | Voice in the chat | A microphone in the assistant's message box, Filipino or English; hidden where the browser can't listen. |
| 39 | Photos in the chat | Allowed for signed-in visitors, AI answers only (not in basic mode). |
| 40 | Never | The assistant never: says a booking is confirmed or paid; promises a refund or new date; makes up a price, hours or boat schedule; gives medical or legal advice; shares another visitor's details, a booking or a child's age. |

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
- `supabase/migrations/20261117_ai_daily_usage.sql`: the assistant's daily count
  (`tours_ai_usage`, `tours_ai_count_message`). Applied 2026-11-05. Without
  `SUPABASE_SERVICE_ROLE_KEY` (or if the table is missing), messages are not
  counted and every visitor gets full answers (only the short burst limit applies).

## Daily allowance (decisions 5, 18, 28, 37)

- Not signed in: 3 messages a day with full answers, counted per device (cookie
  `daet_aid`, a random id). After the 3rd answer the chat shows "Sign in to keep
  getting full answers"; later messages get basic-mode answers.
- Signed in: 20 a day, then basic mode, no card.
- The day is the Manila day. Every message counts, a tapped suggestion too.
- Code: `src/lib/ai/daily-usage.ts`, used by `src/app/api/assistant/route.ts`.

## Honest answers (decisions 6, 11, 16, 36, 40)

- Basic mode shows no label in the chat.
- Basic mode answers "is the boat running / what time does it leave" with "I can't
  check that right now" and the operator (their booking for signed-in visitors,
  tour pages otherwise); weather points to PAGASA.
- Off-topic questions (school work, code, politics, other destinations) get one
  line: what the assistant helps with.
- The AI prompt carries the same rules, the five "never" rules, and replies in
  English or Filipino only.

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

## Screens

- **Start view** (`plan-start.tsx`, Main board): "Where to in Daet?", one message box,
  Dates / Travelers (the trip form, kept for the tab) and Recents, and four example
  trips. Sending opens the chat and plan view; a plan handed over from the widget or a
  saved trip skips it.
- **Chat and plan** (Desktop-Results): the chat is pinned on the left, a third of the
  width and the full screen height under the header; the plan scrolls beside it. Under
  the latest plan the chat asks the pace (drafts the plan again with `changePace`) and
  how they get around (labels the travel between stops; times stay road estimates).
- **Saved trip** (`/tours/my-itineraries/[id]`, Desktop-Trip): days on the left, map,
  Book each trip (one Book button and price per tour, and the total) and Share on the
  right. "Change with the assistant" rebuilds the saved order with `openSavedInPlanner`
  and opens it in the planner.

## Gemini keys and models

- Keys: `GEMINI_API_KEY`, and optionally `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3`
  (or a comma-separated `GEMINI_API_KEYS`). A call goes to the key that last worked
  and moves to the next key when Google rejects one (401, 403, 429, invalid key).
  Use keys from separate Google Cloud projects; this is failover, not a way round
  Google's rate limits. For steady quota problems, turn on billing.
- Models: `gemini-flash-latest` (`ASSISTANT_MODEL`, `ITINERARY_MODEL`). When Google
  says it is busy (503, 429, 500) the call is tried again, then on
  `GEMINI_FALLBACK_MODEL` (default `gemini-flash-lite-latest`), then basic mode.

## Checks

- `npx jest` (includes `golden-prompts.test.ts`: 40+ planner prompts in English,
  Filipino and Taglish, checked in basic mode).
- `npm run test:e2e:tours` (phone width, with accessibility checks). The planner
  specs are `plan-start.spec.ts` (start view, pinned chat, chips, saved trip page), `trip-assistant.spec.ts` (Before I draft, remove a stop, Book links) and
  `trip-planner-a11y.spec.ts` (planner, shared trip and called-off trip at 375 and
  1440 px); `draftPlan()` in `e2e/fixtures.ts` walks the flow. In a sandbox without
  map tiles the Leaflet tests in `home-fan` and `messenger` fail because the sketch
  map is drawn instead; they pass where tiles load.
- With `GEMINI_API_KEY` on a preview: the planner rows (32–40) in `docs/ASSISTANT_EVAL.md`.

## Build plan for the decisions above (2026-11-05)

Each slice is one PR, tested at 375 and 1440 px with axe. Numbers refer to the decisions table.

1. **Daily limits and the sign-in card** (5, 10, 18, 28, 37). Today's limits live in one server's memory and reset whenever Vercel starts a new instance, so a daily count needs a table: `tours_ai_usage` (who, Manila date, count), written only by the server. Visitors who are not signed in are counted by a random device id in a cookie, because many Philippine phones share one IP through their carrier. After the 3rd message: the sign-in card, then basic mode. Signed in: 20 a day, then basic mode.
2. **Honest basic mode and the "never" rules** (11, 36, 40). Questions about weather, boats or today's times get "I can't check that" plus the operator's number or page. Off-topic questions get a one-line decline. The five "never" rules go in the prompt and in tests of the answers.
3. **Trip-day answers** (12, 21, 30, 31, 32). "Near me" asks for location only then (else asks the town); open places within 3 km, at most 5. "Is my tour on today?" reads the signed-in visitor's bookings and call-offs. Emergency numbers: an admin page for the Tourism Office with "last checked", 911 until filled.
4. **Page greetings and suggested questions** (17, 33). Tour, place and event pages open the assistant with a greeting and three questions answered from listings.
5. **Memory and feedback** (25, 26, 29, 34). Trip details move from the tab to the phone (localStorage) for visitors who are not signed in, and to the account for signed-in ones; a new chat keeps them. "Was this helpful? Yes / No" under each answer, recorded in a table.
6. **Sample plans** (35). "No dates yet" drafts a plan without dates; Save and Book ask for dates.
7. **Money for foreign visitors** (24). A rough amount in the visitor's currency, from a daily rate, USD if unknown, marked "approx.".
8. **Voice and photos in the chat** (38, 39). A microphone in the message box; photos for signed-in visitors with AI answers only, used for that answer and not kept.

## Trip-day answers (decisions 12, 21, 22, 30, 31, 32)

- Emergencies: 911 first, then the numbers the Tourism Office keeps at
  `/tours/admin/emergency` (with "last checked"), then "tell your guide or operator".
  Migration `20261118_emergency_contacts.sql` (applied 2026-11-06).
- "Is my tour on today?": the signed-in visitor's tours today and tomorrow, on /
  called off (reason and next step) / not confirmed. Not signed in: sign in.
- "What's open near me": needs Use my location; open places within 3 km first,
  then places with no hours ("check before you go"); at most 5; closed ones left out.
- Code: `src/lib/tours/assistant/trip-day.ts` (basic mode and AI tools
  `emergency_numbers`, `tour_today`, `open_near_me`).

## Page greetings (decisions 17, 33)

- Opened on a tour, place or event page, the assistant greets "Ask me about {name}."
  with three questions that name it, so basic mode answers them from the listings:
  tour: open dates, what's included, how to get there; place: how to get there,
  opening time, tours that go there; event: when and where, free or not, where to stay.
- On tour pages the chat button sits above the "Book this trip" bar on phones.

## Trip memory and feedback (decisions 25, 26, 29, 34)

- Dates, travellers and origin are kept on the phone (localStorage, key
  `daet-trip-context-v1`) across visits; dates that have passed are dropped. Not
  yet kept in the account for signed-in visitors (child ages stay off the server
  until a trip is saved).
- "Was this helpful? Yes / No" under each answer; the choice goes to
  `tours_ai_feedback` (question and answer excerpts, mode, page; no account).
  Migration `20261119_ai_feedback.sql` (applied 2026-11-06). Recorded only.
