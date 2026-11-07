# CONNECT-DAET.ph — Buong System Flowchart

Ipinapakita ng mga diagram ang pangunahing proseso ng kasalukuyang CONNECT-DAET system: pag-login at role routing, tour booking, package management, guide check-in, Tourism Office administration, at mga supporting feature. Naka-base ito sa routes, server actions, README at migrations ng repository.

**Recommended browser version:** [CONNECT_DAET_WHOLE_SYSTEM_FLOWCHART.html](./CONNECT_DAET_WHOLE_SYSTEM_FLOWCHART.html). I-download at buksan sa browser; hindi kailangan ng Draw.io import o internet connection para makita ang diagrams. May print / Save as PDF button din ito.

**Editable Draw.io source:** [CONNECT_DAET_SYSTEM_FLOWCHART.drawio](./CONNECT_DAET_SYSTEM_FLOWCHART.drawio). Buksan sa [app.diagrams.net](https://app.diagrams.net) gamit ang **File → Open From → Device**.

## Legend

- **Oval** — simula o katapusan
- **Rectangle** — proseso o system action
- **Diamond** — decision / Oo-Hindi
- **Cylinder** — database o shared data service
- Mga solidong arrow — normal na daloy ng proseso

> Naka-format ang diagrams sa Mermaid. Nari-render ang mga ito sa GitHub kapag binuksan ang Markdown file.

## 1. Pangkalahatang system at role routing

```mermaid
flowchart TD
    START([Simula: Buksan ang CONNECT-DAET]) --> HOME[Home page at public tourism content]
    HOME --> SESSION{May valid na login session?}

    SESSION -->|Wala| PUBLIC[Mag-browse ng published tours, attractions, events, merchandise at FAQ]
    PUBLIC --> PROTECTED{Protected action ba ang susunod?}
    PROTECTED -->|Hindi| PUBLIC
    PROTECTED -->|Oo| AUTH[Mag-sign up o mag-login gamit ang email o Google]

    SESSION -->|Meron| CHECK[Server-side session at account verification]
    AUTH --> VERIFIED{Valid at verified ang account?}
    VERIFIED -->|Hindi| RECOVER[Email verification, resend link o password recovery]
    RECOVER --> AUTH
    VERIFIED -->|Oo| CHECK

    CHECK --> AUTHDB[(Supabase Auth at profiles)]
    AUTHDB --> ROLE{Anong account role?}

    ROLE -->|Tourist| TOURIST[Tourist dashboard: bookings, planner, messages, notifications at rewards]
    ROLE -->|Operator| OPSTATUS{Operator accreditation status?}
    OPSTATUS -->|Wala pang application| OPAPPLY[Magsumite ng operator application]
    OPSTATUS -->|Pending| OPPENDING[Hintayin ang Tourism Office review]
    OPSTATUS -->|Rejected| OPRESUBMIT[Basahin ang dahilan at i-update ang application]
    OPSTATUS -->|Approved| OPDASH[Operator dashboard: packages, availability, bookings, payments at guides]
    OPAPPLY --> ADMINQUEUE[Admin accreditation queue]
    OPRESUBMIT --> ADMINQUEUE

    ROLE -->|Guide| GUIDESTATUS{Guide accreditation status?}
    GUIDESTATUS -->|Wala pang application| GUIDEAPPLY[Magsumite ng guide application at kinakailangang impormasyon]
    GUIDESTATUS -->|Pending| GUIDEPENDING[Hintayin ang Tourism Office review]
    GUIDESTATUS -->|Rejected| GUIDERESUBMIT[I-update o muling isumite ang application]
    GUIDESTATUS -->|Approved| GUIDEDASH[Guide dashboard: availability, assigned tours, roster at QR check-in]
    GUIDEAPPLY --> ADMINQUEUE
    GUIDERESUBMIT --> ADMINQUEUE

    ROLE -->|Admin| ADMINDASH[Tourism Office dashboard at analytics]

    TOURIST --> TDATA[(Supabase Postgres, RLS at RPCs)]
    OPDASH --> ODATA[(Supabase Postgres, RLS, Storage at RPCs)]
    GUIDEDASH --> GDATA[(Supabase Postgres, RLS at RPCs)]
    ADMINDASH --> ADATA[(Supabase Postgres, RLS, Storage at RPCs)]
```

## 2. Tourist tour-booking, payment at check-in flow

```mermaid
flowchart TD
    START([Simula: Tourist pumili ng tour]) --> PACKAGE[Buksan ang package details]
    PACKAGE --> PUBLISHED{Published ba ang package?}
    PUBLISHED -->|Hindi| UNAVAILABLE[Ipakita na hindi available sa booking]
    UNAVAILABLE --> BROWSE[Bumalik sa browse]
    PUBLISHED -->|Oo| SIGNED{Naka-login ba ang tourist?}
    SIGNED -->|Hindi| LOGIN[Mag-login o gumawa ng account]
    LOGIN --> SIGNED
    SIGNED -->|Oo| INPUT[Pumili ng price variant, petsa at bilang ng guests; ilagay ang contact details]
    INPUT --> VALIDATE[Server validates form at kinukuha ang presyo sa database]
    VALIDATE --> VALID{Valid ba ang request?}
    VALID -->|Hindi| FIX[Ipakita ang error at ipaayos ang input]
    FIX --> INPUT
    VALID -->|Oo| CAPACITY[Database locks availability row at sinusuri ang natitirang seats]
    CAPACITY --> SEATS{May sapat na capacity?}
    SEATS -->|Wala| FULL[Ipakita ang sold-out / kulang na seats]
    FULL --> INPUT
    SEATS -->|Meron| CREATE[Create booking na pending; bawasan/ireserba ang capacity nang ligtas]
    CREATE --> NOTIFYOP[Abisuhan ang operator]
    NOTIFYOP --> ACCEPT{I-confirm ba ng operator?}

    ACCEPT -->|Hindi| DECLINE[Markahang rejected o cancelled; abisuhan ang tourist]
    DECLINE --> ENDDECLINE([Katapusan: Booking hindi nakumpirma])
    ACCEPT -->|Oo| CONFIRM[Markahang confirmed; magpadala ng confirmation]
    CONFIRM --> TICKET[Gumawa/ipakita ang signed QR ticket]

    CONFIRM --> PAYMETHOD{Paano magbabayad?}
    PAYMETHOD -->|Online| CHECKOUT[Gumawa ng PayMongo Checkout]
    CHECKOUT --> PGM[Tourist magbayad sa PayMongo]
    PGM --> WEBHOOK[PayMongo webhook: verify signature at kunin muli ang checkout status]
    WEBHOOK --> PGPAID{Verified at successful ba ang payment?}
    PGPAID -->|Hindi| RETRY[Ipakita ang unpaid/pending status; maaaring subukang muli]
    RETRY --> PAYMETHOD
    PGPAID -->|Oo| LEDGER[Itala sa tours_payments; i-update ang payment status at balance]

    PAYMETHOD -->|Manual| RECEIPT[Mag-upload ng payment receipt sa private Storage]
    RECEIPT --> REVIEWPROOF[Operator mag-review ng receipt]
    REVIEWPROOF --> PROOFOK{Inaprubahan ba ang proof?}
    PROOFOK -->|Hindi| RESUBMIT[Abisuhan ang tourist; mag-upload ng bagong proof]
    RESUBMIT --> RECEIPT
    PROOFOK -->|Oo| LEDGER

    CONFIRM --> ASSIGN[Operator magtalaga ng approved at available na guide]
    ASSIGN --> TOURDATE[Hintayin ang araw ng tour]
    TICKET --> TOURDATE
    TOURDATE --> SCAN[Guide mag-scan ng QR o mag-check-in mula sa roster]
    SCAN --> QRVALID{Valid ang ticket, petsa, booking at guide assignment?}
    QRVALID -->|Hindi| REJECTSCAN[Tanggihan ang scan at ipakita ang dahilan]
    QRVALID -->|Oo| CHECKIN[Itala ang guest check-in; ulitin na scan ay harmless]
    CHECKIN --> COMPLETE[Operator markahang completed ang tour]
    COMPLETE --> REVIEW{Nagsumite ba ang tourist ng review?}
    REVIEW -->|Oo| POSTREVIEW[Itala ang review; i-update ang ratings at rewards]
    REVIEW -->|Hindi| ENDBOOK([Katapusan: Tour completed])
    POSTREVIEW --> ENDBOOK

    CREATE --> DB[(Supabase bookings, availability, participants at notifications)]
    LEDGER --> DB
    CHECKIN --> DB
```

## 3. Operator application at package lifecycle

```mermaid
flowchart TD
    START([Simula: Operator applicant mag-login]) --> ACCREDITED{Ano ang accreditation status?}
    ACCREDITED -->|Approved| DASH[Operator dashboard]
    ACCREDITED -->|Pending| WAIT[Hintayin ang Tourism Office review]
    ACCREDITED -->|Wala o rejected| APPLY[Magsumite o mag-update ng accreditation application]
    APPLY --> ADMINREVIEW[Tourism Office mag-review ng application]
    ADMINREVIEW --> APPROVE{Aprubahan?}
    APPROVE -->|Hindi| REJECT[Itala ang rejection at dahilan; abisuhan ang applicant]
    REJECT --> APPLY
    APPROVE -->|Oo| DASH

    DASH --> CREATE[Create tour package bilang draft]
    CREATE --> COMPLETE{Kumpleto at valid ba ang package?}
    COMPLETE -->|Hindi| EDITDRAFT[I-edit ang basic details, duration, prices, inclusions, stops at photos]
    EDITDRAFT --> COMPLETE
    COMPLETE -->|Oo| SUBMIT[Submit for Tourism Office review]
    SUBMIT --> PENDING[Status: pending_review; read-only habang sinusuri]
    PENDING --> PKGREVIEW[Admin mag-review ng package]
    PKGREVIEW --> PUBLISH{I-publish ba?}
    PUBLISH -->|Hindi| REJECTED[Status: rejected; ipakita ang review reason]
    REJECTED --> EDITDRAFT
    PUBLISH -->|Oo| LIVE[Status: published; makikita at mabo-book ng tourists]

    LIVE --> CHANGE{May gustong baguhin ang operator?}
    CHANGE -->|Wala| AVAIL[Mag-manage ng dates at capacity]
    CHANGE -->|Oo| EDITLIVE[I-edit ang lahat ng package fields, prices, inclusions, stops at photos]
    EDITLIVE --> VALIDATE[Server at database validate ownership, values at expected_updated_at]
    VALIDATE --> SAFE{Valid at walang protected booking conflict?}
    SAFE -->|Hindi| ERROR[Ibalik ang error; walang partial save]
    ERROR --> EDITLIVE
    SAFE -->|Oo| SAVE[Atomic save; agad na live, walang resubmission for review]
    SAVE --> LIVE

    PENDING --> LOCKED[Hindi mae-edit habang pending_review]
    ARCHIVE[Package status: archived] --> ARCHLOCK[Read-only]
    AVAIL --> BOOKINGS[Tingnan at pamahalaan ang bookings]
    BOOKINGS --> DECIDE[Confirm/decline, magtalaga ng guide, mag-review ng receipts]
    DECIDE --> OPS[Payments ledger, CSV export, reviews at live tour tools]

    LIVE --> PUBLIC[(Supabase package data at Storage)]
    SAVE --> PUBLIC
    BOOKINGS --> PUBLIC
```

## 4. Guide accreditation, assignment at tour-day flow

```mermaid
flowchart TD
    START([Simula: User mag-apply bilang guide]) --> APPLY[Isumite ang guide profile, consent at private ID documents]
    APPLY --> PENDING[Application status: pending]
    PENDING --> ADMIN[Tourism Office administrator mag-review]
    ADMIN --> DECISION{Aprubahan ang guide?}
    DECISION -->|Hindi| REJECTED[Status: rejected; ipakita ang reviewer notes]
    REJECTED --> APPLY
    DECISION -->|Oo| APPROVED[Set status approved at guide role]
    APPROVED --> DASH[Guide dashboard]
    DASH --> AVAIL[Itakda ang available dates at oras]
    AVAIL --> ASSIGN[Operator pumili ng approved, available guide para sa booking]
    ASSIGN --> NOTIFY[Guide makatanggap ng assignment notification]
    NOTIFY --> DAY[Sa araw ng confirmed tour, buksan ang check-in]
    DAY --> METHOD{Paraan ng check-in?}
    METHOD -->|QR| QR[Scan booking ticket]
    METHOD -->|Manual| ROSTER[Piliin ang guest sa roster]
    QR --> VERIFY[Verify ang signed token, expiry, booking, petsa at assigned guide]
    ROSTER --> VERIFY
    VERIFY --> VALID{Lahat ba ng kondisyon ay pasado?}
    VALID -->|Hindi| DENY[Tanggihan; huwag magtala ng check-in]
    VALID -->|Oo| SAVE[Itala ang check-in sa database]
    SAVE --> GUIDEEND([Katapusan: Guest checked in])
```

## 5. Tourism Office admin flow

```mermaid
flowchart TD
    START([Simula: Admin mag-login]) --> ROLE{Admin role verified?}
    ROLE -->|Hindi| DENY[Access denied]
    ROLE -->|Oo| DASH[Admin dashboard at analytics]
    DASH --> QUEUES{Anong admin task?}

    QUEUES -->|Operator applications| OPS[Review accreditation documents]
    QUEUES -->|Guide applications| GUIDES[Review guide details at ID request]
    QUEUES -->|Tour packages| PACKAGES[Review pending packages]
    QUEUES -->|Merchandise| MERCH[Review operator merchandise submissions]
    QUEUES -->|Public content| CONTENT[Manage attractions, events, fares at guide places]
    QUEUES -->|Safety and feedback| SAFETY[Manage emergency contacts, feedback at reports]
    QUEUES -->|Reviews| REVIEWS[Hide abusive reviews with a reason]

    OPS --> APPROVAL{Approve o reject?}
    GUIDES --> APPROVAL
    PACKAGES --> APPROVAL
    MERCH --> APPROVAL
    APPROVAL -->|Approve| ACCEPT[Update status; publish where appropriate; notify applicant]
    APPROVAL -->|Reject| REJECT[Record reason; notify applicant]
    CONTENT --> SAVE[Validate at save ang content]
    SAFETY --> SAVE
    REVIEWS --> HIDE[Hide review; tanggalin sa public averages]
    ACCEPT --> DATA[(Supabase database, private Storage at audit-safe server actions)]
    REJECT --> DATA
    SAVE --> DATA
    HIDE --> DATA
```

## 6. Planner, discovery, messaging at shared services

```mermaid
flowchart LR
    TOURIST[Tourist] --> DISCOVER[Browse attractions, tours, events at merchandise]
    DISCOVER --> PUBLICDATA[(Published Supabase data)]
    DISCOVER --> MAPS[Map / route display]
    MAPS --> MAPAPI{Google Maps API configured?}
    MAPAPI -->|Oo| GOOGLE[Google Maps / Routes]
    MAPAPI -->|Hindi| FALLBACK[Sketch map at estimated route distance]

    TOURIST --> PLAN[Maglagay ng interests, budget at trip length]
    PLAN --> ENGINE[Rule-based itinerary engine: schedule, hours, travel at budget]
    ENGINE --> CHECK[Server validates opening hours, overlaps, travel at budget]
    CHECK --> PLANOK{Valid ang itinerary?}
    PLANOK -->|Hindi| EDITPLAN[I-edit o i-regenerate]
    EDITPLAN --> ENGINE
    PLANOK -->|Oo| SAVEPLAN[Save, share read-only link o humanap ng matching tour]
    SAVEPLAN --> PUBLICDATA

    TOURIST --> AI[Mag-message sa travel assistant]
    AI --> CONTEXT[Read-only: live tourism data at sariling allowed booking data]
    CONTEXT --> LLM{AI provider enabled?}
    LLM -->|Oo| GEMINI[Gemini / configured model]
    LLM -->|Hindi| BASIC[Built-in basic assistant]
    GEMINI --> ANSWER[Magbigay ng sagot at links sa totoong system pages]
    BASIC --> ANSWER
    ANSWER -->|Book/pay/ticket action| BOOKFLOW[Tourist pupunta sa aktuwal na booking/payment/ticket flow]

    TOURIST --> MESSAGE[Magpadala ng message sa operator o Tourism Office]
    MESSAGE --> AUTHZ[Server checks login, role at conversation access]
    AUTHZ --> CHATDB[(Supabase conversations at messages)]

    BOOKFLOW --> EVENTS[Booking, payment, check-in, review at accreditation events]
    EVENTS --> TRIGGERS[Database triggers / server notifications]
    TRIGGERS --> NOTIFS[(Supabase notifications and rewards ledger)]
    NOTIFS --> REALTIME[In-app notification bell via Realtime]
    NOTIFS --> PUSH{Nag-opt in sa Web Push?}
    PUSH -->|Oo| WEBPUSH[Web Push sa device]
    PUSH -->|Hindi| NO_PUSH[In-app notifications pa rin]
```

## 7. Shared technical flow at safeguards

```mermaid
flowchart LR
    CLIENT[Browser / phone] --> APP[Vercel-hosted Next.js app]
    APP --> ROUTE[Pages, Server Actions at API routes]
    ROUTE --> SESSION[Verify Supabase session]
    SESSION --> AUTHZ[Role, accreditation, ownership at input validation]
    AUTHZ --> DB[(Supabase Postgres, RLS, RPCs, triggers at Realtime)]
    AUTHZ --> STORAGE[(Supabase Storage: public images o private documents/receipts)]

    ROUTE -->|Online payment| CHECKOUT[PayMongo Checkout]
    CHECKOUT --> WEBHOOK[PayMongo webhook]
    WEBHOOK --> SIG{Valid signature at confirmed amount?}
    SIG -->|Hindi| STOP[Reject event; walang payment write]
    SIG -->|Oo| LEDGER[Write payment ledger idempotently]
    LEDGER --> DB

    DB --> EMAIL[Booking / review emails]
    DB --> NOTIFICATION[In-app notifications]
    DB --> REWARDS[Rewards ledger triggers]
    ROUTE -->|Optional| MAP[Google Maps / Routes API]
    ROUTE -->|Optional| AI[Gemini or basic fallback]
    NOTIFICATION -->|Opt-in| PUSH[Web Push endpoint]
```

## Buod ng mahahalagang decision points

1. **Account at role:** protected actions require a valid Supabase session. Bawat server action ay nagche-check ng role, accreditation at ownership; database RLS at RPCs ang pangalawang enforcement layer.
2. **Package publication:** bagong package ay draft → pending review → published o rejected. Ang published package ay puwedeng i-edit at maging live agad; ang `pending_review` at `archived` ay read-only.
3. **Booking:** published package lang ang nabobook. Server/database ang nagva-validate ng price, petsa at capacity para maiwasan ang overbooking.
4. **Payments:** PayMongo ay kinukumpirma sa signed webhook; manual receipts ay inaaprubahan ng operator. Pareho silang itinatala sa payment ledger.
5. **Check-in:** kailangan ang valid booking ticket o roster entry, tamang tour date at awtorisadong assigned guide/operator/admin. Isang guest lang ang naitatala nang isang beses.
6. **Other content:** events at attractions ay public information; merchandise showcase ay nagpapakita ng seller contact at hindi app checkout.
