# CONNECT-DAET.ph — Complete System Flowchart

This documentation package describes the current CONNECT-DAET application based on its routes, server actions, README, and database integrations.

## Recommended version: open directly in a browser

[Open or download the self-contained HTML/SVG flowchart](./CONNECT_DAET_WHOLE_SYSTEM_FLOWCHART.html). Download the file and open it in Chrome, Edge, Firefox, or another browser. It does not require Draw.io, an import step, or an internet connection. Use the page links to jump among the six diagrams; use **Print / Save as PDF** to export.

## Editable diagram source

[Open the editable Draw.io source](./CONNECT_DAET_SYSTEM_FLOWCHART.drawio) in diagrams.net using **File → Open From → Device**. The HTML version is provided if Draw.io import is unavailable.

## Diagrams included

1. **Overall system and role routing** — public browsing, sign-in, verification, authorization, and tourist/operator/guide/admin dashboards.
2. **Tourist booking, payment, and check-in** — package validation, date/capacity checks, operator confirmation, PayMongo or manual receipt payments, QR ticket, guide check-in, completion, reviews, and rewards.
3. **Operator accreditation and package lifecycle** — application review, package draft and moderation, published edits that go live immediately, read-only statuses, availability, and booking operations.
4. **Guide accreditation, assignment, and check-in** — application, approval, availability, operator assignment, QR or roster check-in, and database validation.
5. **Tourism Office administration** — operator, guide, package, and merchandise review; content management; safety and feedback; reviews; and analytics.
6. **Tourism content, planner, assistant, and integrations** — public discovery, trip planning, messaging, notifications, rewards, Supabase, PayMongo, maps, and AI services.

## Flowchart shape legend

- **Oval:** start or end
- **Rectangle:** process or system action
- **Diamond:** decision / yes-no check
- **Cylinder:** database or shared data service
- **Parallelogram:** external service

## Shared safeguards represented

Protected actions validate the Supabase session and relevant role, accreditation, ownership, and input. Database RLS, RPCs, constraints, and triggers enforce authorization and data integrity. Booking prices are read from the database; availability is checked transactionally; payment events are verified before they update the ledger; and private documents remain server-protected.
