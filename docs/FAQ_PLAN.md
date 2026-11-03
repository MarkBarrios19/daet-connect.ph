# FAQ — integration plan

A plan for the two-column FAQ in `image-36` (large title and subline on the left, stacked
question cards on the right, `+` closed and `✕` open), fitted to what this repo already is
and to what people actually ask before they book a boat in Daet.

Status: **phases 1 and 2 are built** (`src/lib/faq.ts`, `src/components/ui/faq.tsx`,
`/tours/faq`, the six-question band on the home page, the footer link). Phases 3 and 4 are not.
Content marked **[sign-off]** is not in the repo and shows a visible placeholder until the Daet
Tourism Office writes it.

---

## 1. What the reference actually is

Anatomy of `image-36`, top to bottom:

| Part | Reference | In this repo's terms |
|---|---|---|
| Layout | Two columns: narrow title column (~30%), wide list (~57%), 8-col gutter, centred | `WRAP` (`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8`) + `lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] gap-8` |
| Title | "FAQ" in a very large bold sans | `display-1` or `display-2` (`docs/DESIGN_SYSTEM.md`) — **not** the word "FAQ" alone; see §4 |
| Subline | One sentence, sentence case, 16–18px | `text-lg text-daet-ink`, no eyebrow label (house rule) |
| Item (closed) | A rule between rows, bold question, chevron at the right | `<details data-faq>` + `<summary>`, `border-b border-hairline`, `py-5`, `LineIcon name="chevron-down"` |
| Item (open) | Same row, chevron turned over, answer on the page's own ground | `group-open:rotate-180`; the answer grows open via `details[data-faq]::details-content` in `globals.css` (Chromium/Safari; elsewhere it appears at once) |
| Answer | Paragraphs, bulleted lists, bold lead-ins, an underlined link, generous spacing | `space-y-3 text-base leading-relaxed`, `<ul className="list-disc pl-5">`, links `font-bold text-blue-700 underline dark:text-blue-300` |
| Rhythm | ~20px of padding either side of each rule, no shadows | One hairline list, no card fill (the owner's second reference, image-46) |

Two things in the reference we should **not** copy: it uses `✕` as "collapse" (fine, matches
"+" as "expand"), and it has no visible hint that the items are keyboard-operable. Native
`<details>` gives us both for free (§6).

---

## 2. What the repo already has

| Where | What | Reuse for FAQ |
|---|---|---|
| `src/lib/tours/assistant/knowledge.ts` | `FAQS`: 9 canonical policy answers (cancel, pay, ticket, status, book, rewards, plan, contact, account), each with keywords + links, **built from the app's own constants** | **The source of truth for policy answers.** The FAQ page should render these, not paraphrase them |
| `src/lib/tours/assistant/transport.ts` | `TRANSPORT_FAQS`: getting to Daet, getting around, boats; each with `TRANSPORT_SOURCE` and `TRANSPORT_CHECKED` date | Transport answers, with their "provisional" caveat intact |
| `src/lib/tours/cancellation.ts` | `FREE_CANCELLATION_HOURS = 48` | Interpolate into the answer: "48 hours" must never be typed twice |
| `src/lib/tours/payment-proof.ts`, `src/lib/rewards` | `PROOF_METHODS`, `TOURS_REWARD_RULES` | Payment and points answers |
| `src/components/home/getting-here.tsx` | Transport section on the home page, with a `<details>` "how to get here" | Same disclosure pattern; FAQ links here, not repeats fares |
| `src/components/home/ask-band.tsx`, `/tours/help` | The "just ask" band and the AI assistant page | The FAQ's "still stuck?" exit |
| `src/components/ui/icons.tsx` | `close` (✕) exists; **no `plus`/`minus`** | Add `plus` (one path), reuse `close` for open |
| `src/app/(subsystems)/tours/*` | Public tour routes: browse, plan, attractions, events, merch, help | `/tours/faq` sits beside `/tours/help` |
| `src/components/ui/site-footer.tsx` | "Help" column: AI assistant, My bookings, Sign in | Add "Common questions" here |
| `<details>` in nine files, e.g. `booking-payment-panel.tsx`, `mobile-menu.tsx` | The house disclosure pattern: no JS, `list-none`, `[&::-webkit-details-marker]:hidden` | Copy that pattern exactly |
| `docs/DESIGN_SYSTEM.md`, `design-rules.test.ts` | Tokens, 44px targets, no eyebrow labels, no resting shadows, no emoji icons | The FAQ must pass these unchanged |

Consequence: **most of the copy already exists** in a place the assistant reads. The job is to
present it, plus the few visitor questions nobody has written yet.

---

## 3. What visitors need (research)

Four sources, three conclusions:

1. **Answer the questions that block a booking**, not a checklist of legal ones. FAQs exist to
   "overcome objections" and reassure, and the best ones are built from the emails, DMs and
   booking messages people actually send — never invented ([Tourism Tribe](https://www.tourismtribe.com/how-to-write-faqs-for-tourism-websites/)).
2. **Group by moment, keep it short.** 8–12 strong questions on the main page, grouped by
   "Before you book / Paying / On the day", with fuller details living on the trip pages
   ([TicketingHub](https://www.ticketinghub.com/en-US/blog/how-to-craft-a-perfect-tourism-faqs-page),
   Tourism Tribe).
3. **A Philippine boat trip has its own questions.** The ones that decide a booking: which sites
   the route covers, **what the price excludes** (eco fees, island entry, terminal fees), whether
   gear and water are included, departure and return times, joined vs private, **what happens if
   weather cancels**, whether the boat is registered and insured, and who to call
   ([Yixing Travel](https://business.yixingtravel.com/en/guides/island-tour-pitfalls-ph/)).
4. **Structured data is for machines now, not snippets.** Since August 2023 Google shows FAQ rich
   results only for well-known government and health sites; the markup is still valid and still
   read by other engines and AI answer services, and costs nothing
   ([Google Search Central](https://developers.google.com/search/blog/2023/08/howto-faq-changes)).
   Rule that follows: `FAQPage` JSON-LD whose question and answer text is **identical to the
   visible text**, and no padding the page with questions just to feed the schema.

### The questions, grouped — and where each answer comes from

`[exists]` = already written in the repo, render it. `[sign-off]` = nobody has written it; show a
visible `[placeholder: …]` until the Tourism Office does. `[policy]` = derive from a constant.

**Before you book**
| Question | Answer source |
|---|---|
| How do I book a trip? | `[exists]` `FAQS.book` |
| What does the price include, and what do I pay on the island? | `[sign-off]` fees and inclusions per trip |
| Is the trip private or joined? | `[sign-off]` per trip |
| What happens if the weather turns? | `[sign-off]` operator policy + who decides |
| Do I need to bring cash, water, sun protection? | `[sign-off]` packing line, then link to the trip page |
| Is the boat registered, and are there life vests? | `[sign-off]` Tourism Office line |

**Paying and cancelling**
| Question | Answer source |
|---|---|
| How do I pay? | `[exists]` `FAQS.pay` (+ `PROOF_METHODS`) |
| Can I cancel, and is it refundable? | `[exists]` `FAQS.cancel`, interpolating `FREE_CANCELLATION_HOURS` |
| What do the booking statuses mean? | `[exists]` `FAQS.status` |
| How do I get my ticket? | `[exists]` `FAQS.ticket` |
| What are reward points worth? | `[exists]` `FAQS.rewards` |

**On the day**
| Question | Answer source |
|---|---|
| Where do we meet, and when? | `[sign-off]` — the trip page owns it; FAQ links there |
| How long does a Calaguas trip take? | `[exists]` transport copy (2–3 hours by boat from Paracale or Vinzons) |
| Can I bring children / elderly parents? | `[policy]` per-operator minimum age, `[sign-off]` for a general line |

**Getting here and around**
| Question | Answer source |
|---|---|
| How do I get to Daet from Manila? | `[exists]` `TRANSPORT_FAQS.getting_here` |
| How do I get around town and to Bagasbas? | `[exists]` `TRANSPORT_FAQS.getting_around` |
| How do I get to Calaguas / the Mercedes islands? | `[exists]` `TRANSPORT_FAQS.boats` |
| When is the best time to visit? | `[sign-off]` — seasons and fiesta (June 24 is already in `page.tsx`) |

**Operators, guides and the office**
| Question | Answer source |
|---|---|
| How do I become an operator or a guide? | `[exists]` `FAQS.contact` + link `/tours/operator/register`, `/tours/guide/register` |
| How do I reach a person? | `[exists]` `FAQS.contact` |
| Is my account / password question… | `[exists]` `FAQS.account` |

That is **three to four `[sign-off]` items per group**, and everything else is already written.
Starting with the `[exists]` rows means the page can ship without inventing a single fact.

---

## 4. Structure

### Route and placement

- **`/tours/faq`** — a real page, beside `/tours/help`, so the "Help" column in the footer has
  somewhere to point. Metadata: `title: "Common questions"`, a description written from the top
  three questions, `robots` default.
- **A home section** — the six strongest questions (book, pay, cancel, getting here, weather,
  Calaguas-how-long) in the compact form of the same component, ending with "All questions →
  `/tours/faq`". It closed the page from the start and still does: the owner moved it below the
  "Run tours in Daet?" band (image-88), which is where it sits now. The home page currently has no
  FAQ at all, and this is where the pre-booking doubt actually happens.
- **Not** a modal or a drawer: the content has to be indexable and linkable (`/tours/faq#cancel`).

### Page anatomy

```
PageFrame
  <div WRAP grid lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] gap-8 lg:gap-12>
    <div>                                            ← sticky on lg
      <h1 display-1>Common questions</h1>            (sentence case; not "FAQ")
      <p text-lg>Answers before you book a boat, pay for a trip, or come to Daet.</p>
      <nav aria-label="Jump to a group">             ← in-page group links (lg only)
      <a href="/tours/help">Ask the travel guide →</a>
    </div>
    <div>
      per group:
        <section aria-labelledby="faq-before-you-book">
          <h2 id=… text-2xl font-bold>Before you book</h2>
          <FaqList items={…} />
      foot: "Still not answered?" → assistant + Tourism Office
    </div>
  </div>
  <script type="application/ld+json"> FAQPage … </script>
```

### `FaqList` — one component, both places

```tsx
// src/components/ui/faq-list.tsx  (server component; no "use client")
export type FaqItem = {
  id: string;            // stable: used for the URL hash and the schema @id
  question: string;      // a full question, in the visitor's words
  answer: React.ReactNode; // paragraphs, lists, links — or a string
  links?: { href: string; label: string }[];
};

export function FaqList({ items, headingLevel = 3 }: { items: FaqItem[]; headingLevel?: 2 | 3 }) { … }
```

- `<details id={item.id} name="faq">` — the `name` attribute gives **native exclusive-open**
  behaviour in current Chrome/Safari (older browsers allow several open: harmless).
- `<summary>`: `flex min-h-14 cursor-pointer list-none items-center justify-between gap-4
  px-5 py-4 text-left [&::-webkit-details-marker]:hidden`, a `<h3>` inside it for the document
  outline, and both icons with one hidden by state:
  `plus` in `group-open:hidden`, `close` in `hidden group-open:block`, both `text-blue-700
  dark:text-blue-300` at `h-5 w-5` inside a 44px hit area.
- Card: `rounded-2xl bg-surface` closed, `open:bg-blue-50 dark:open:bg-blue-950/40` open — the
  reference's tint, using the repo's permitted tint pair. No border, no shadow.
- Answer wrapper: `px-5 pb-5 sm:px-6`, `space-y-3 text-base leading-relaxed text-daet-ink`.
- `scroll-mt-[calc(var(--header-h)+1.5rem)]` on each item so `/tours/faq#cancel` lands clear of
  the sticky header.
- No JavaScript: closed `<details>` still keeps the text in the DOM, so search and find-in-page
  work, and the content is in the HTML for anyone with scripts off.
- Reduced motion: nothing animates; if we later animate the icon, `motion-safe:` only.

### Icons

Add one path to `src/components/ui/icons.tsx`:

```ts
plus: "M12 5v14M5 12h14",
```

and reuse `close`. `ui-kit.test.tsx` / `design-rules.test.ts` already police the icon set, so the
addition is one line plus whatever the tests ask for.

### Content module

```ts
// src/lib/faq.ts
export type FaqGroup = { id: string; title: string; items: FaqEntry[] };
export type FaqEntry = { id: string; question: string; faqId?: string; placeholder?: string; extra?: string; links?... }
```

- Entries with a `faqId` pull their answer from `FAQS` / `TRANSPORT_FAQS`, so the FAQ page and the
  assistant can never disagree. A test asserts every `FAQS` and `TRANSPORT_FAQS` id is represented.
- Entries without one render `placeholder` (a visible `[placeholder: …]`, as the rest of the site
  does) until the copy lands — no invented policy.
- `FREE_CANCELLATION_HOURS`, `PROOF_METHODS`, `TOURS_REWARD_RULES` are imported, not retyped.
- One export for the page (`FAQ_GROUPS`) and one for the home section (`HOME_FAQ_IDS`), so the
  home page reuses the same objects.

### SEO

- `FAQPage` JSON-LD built from the same items, on `/tours/faq` only: question and answer text must
  match the visible text exactly — so generate both from the same module, and strip markup for the
  answer (plain text, first paragraph, ≤ ~300 words per answer).
- Do **not** put the schema on the home page for questions that are not visibly on it.
- Expect no Google snippet: since August 2023 it is government/health only. The markup is for
  other engines and answer engines, and costs one component.
- Canonical URL, `openGraph` title, and the trailing "still stuck?" link point at `/tours/help`.

---

## 5. Work, in phases

**Phase 1 — the component and the page (the deliverable that ships)**
1. `plus` icon; `FaqList` (`src/components/ui/faq-list.tsx`) + `FaqItem` type.
2. `src/lib/faq.ts`: groups, `[exists]` entries wired to `FAQS`/`TRANSPORT_FAQS`, `[sign-off]`
   entries as visible placeholders.
3. `/tours/faq/page.tsx`: two-column layout, group sections, jump links, "still stuck?" exit, JSON-LD.
4. Footer "Help" column + `/tours/help` cross-link ("Read the common questions", "Still stuck?").
5. Tests (§6).

**Phase 2 — home section**
6. `FaqSection` compact variant (same `FaqList`, six ids), placed before `AskBand`, with
   "All questions" link. Reuses Phase 1 entirely.

**Phase 3 — contextual FAQs, where the doubt actually is**
7. On `/tours/attractions/[slug]`, a "Before you go" list from the same module (per-place items:
   how long it takes to get there, what to bring, when to go). This is where the research says
   product-level questions belong.
8. On `/tours/packages/[id]`, the three questions that decide that trip (inclusions, private vs
   joined, weather). Needs per-trip fields first — a schema change, so a separate decision.

**Phase 4 — after launch**
9. Feed the questions people actually ask the assistant (it already logs intents) back into the
   module; the FAQ and the knowledge base stay one artefact.

---

## 6. Tests and gates

jsdom (`src/components/ui/faq-list.test.tsx`, `src/lib/faq.test.ts`):
- every `FAQS` and `TRANSPORT_FAQS` id appears in `faq.ts` (the drift guard);
- cancellation copy contains `48 hours` **derived from the constant**, not typed;
- a placeholder entry renders `[placeholder: …]`, and no entry ships empty;
- `<details>` opens and closes by click and by Enter/Space; the summary is at least 44px;
- question text is a heading, in document order, and every item has an `id` for its hash.

Page tests (`src/app/(subsystems)/tours/faq/page.test.tsx` or e2e):
- `/tours/faq` renders the five groups, with `h1` then `h2` per group;
- JSON-LD parses, and every `Question.name` equals the visible summary text;
- axe with a question open (`checkA11y`);
- 375px: single column, no horizontal overflow (`scripts/design/measure.mjs`).

e2e (`e2e/faq.spec.ts`):
- open `/tours/faq`, open a question with the keyboard, follow the answer's link, use Back;
- deep link `/tours/faq#cancel` scrolls to that item, clear of the header;
- home section opens one at a time (the `name` attribute) without JavaScript removed — the
  `<details>` version of "no-JS behaviour must survive".

Gates: `npx tsc --noEmit`, `npx jest`, `npx next build`, `npx jest src/components/ui/design-rules.test.ts`,
and the full CI run.

---

## 7. Decisions and open questions

Recommended, with the one-word alternatives:

1. **Where**: `/tours/faq` page **plus** a six-question home section. (Alt: page only; home only.)
2. **Copy**: render `FAQS` + `TRANSPORT_FAQS` as the backbone, add only the visitor questions in §3
   — the `[sign-off]` ones show a placeholder until written. (Alt: a hand-written FAQ that will
   drift from the assistant.)
3. **Title**: "Common questions" as `h1`, with "FAQ" nowhere visible — house style bans eyebrow
   labels and the reference's bare "FAQ" reads as a placeholder. (Alt: "FAQ".)
4. **Affordance**: blue `+` closed / blue `✕` open, exactly as the reference. (Alt: the house
   chevron, which every other disclosure uses.)
5. **One open at a time**: native `<details name="faq">`, no JavaScript. (Alt: allow many open.)

Still needed before content can go live: the six `[sign-off]` answers — inclusions and on-site
fees, private vs joined, weather policy, safety and licensing, best season, and a general line for
children and older visitors. Everything else is already in the repo.
