import { faqById, type Faq as KnowledgeFaq } from "@/lib/tours/assistant/knowledge";

/**
 * The FAQ page's content, in one place.
 *
 * Most answers are not written here: they are pulled by id out of the travel
 * assistant's knowledge base (`src/lib/tours/assistant/knowledge.ts`), which
 * builds them from the constants the app itself runs on. So the page and the
 * assistant cannot drift, and `FREE_CANCELLATION_HOURS` is 48 hours in both.
 *
 * The questions the knowledge base does not answer (inclusions, weather policy,
 * safety, the season, the day itself) carry a `todo`: they render a visible
 * `[placeholder: …]` until the Daet Tourism Office writes the answer. Nothing
 * here is invented on the office's behalf.
 */

export type FaqLink = { href: string; label: string };

export type FaqEntry = {
  /** Stable id: the URL hash (`/tours/faq#cancel`) and the schema key. */
  id: string;
  /** A full question, in the visitor's words. */
  question: string;
  /** Answer from the assistant's knowledge base. */
  faqId?: string;
  /** Answer written for the page, when the knowledge base has one in another voice. */
  answer?: string;
  /** What is still missing, shown as `[placeholder: …]` until it is written. */
  todo?: string;
  links?: FaqLink[];
};

export type FaqGroup = { id: string; title: string; items: FaqEntry[] };

export type ResolvedFaq = {
  id: string;
  question: string;
  answer: string | null;
  todo: string | null;
  links: FaqLink[];
};

export function resolveFaq(entry: FaqEntry): ResolvedFaq {
  const source: KnowledgeFaq | null = entry.faqId ? faqById(entry.faqId) : null;
  if (entry.faqId && !source) throw new Error(`FAQ "${entry.id}" points at unknown knowledge id "${entry.faqId}"`);
  const answer = entry.answer ?? source?.answer ?? null;
  return {
    id: entry.id,
    question: entry.question,
    answer,
    // An entry with neither an answer nor a note is a content bug, not a blank page.
    todo: answer ? null : (entry.todo ?? "This answer is being written."),
    links: entry.links ?? source?.links ?? [],
  };
}

export const FAQ_GROUPS: FaqGroup[] = [
  {
    id: "before",
    title: "Before you book",
    items: [
      { id: "book", question: "How do I book a trip?", faqId: "book" },
      {
        id: "included",
        question: "What does the price include, and what do I pay on the island?",
        todo: "inclusions and the fees you pay on the day (island entry, terminal, eco) are set trip by trip. The Tourism Office is confirming the standard list; until then the trip page and its operator have the answer.",
      },
      {
        id: "weather",
        question: "What happens if the weather turns?",
        todo: "whether a cancelled sailing is refunded, rescheduled or credited depends on the operator and the day's coast guard advisory. The Tourism Office is confirming the wording for this page.",
      },
      {
        id: "private",
        question: "Is the trip private, or will I join a group?",
        todo: "some trips are private and some are joined, and a joined boat can be merged on the day. Each trip page says which it is; the general rule is being confirmed.",
      },
      {
        id: "safety",
        question: "Is the boat registered, and are there life vests?",
        todo: "registration, insurance and life vests are checked per boat by the Tourism Office. How this page should state the requirement is being confirmed.",
      },
      { id: "plan", question: "How do I plan a day in Daet?", faqId: "plan" },
    ],
  },
  {
    id: "paying",
    title: "Paying, tickets and cancellations",
    items: [
      { id: "pay", question: "How do I pay?", faqId: "pay" },
      { id: "cancel", question: "Can I cancel, and will I get a refund?", faqId: "cancel" },
      { id: "status", question: "What does my booking status mean?", faqId: "status" },
      { id: "ticket", question: "How do I get my ticket and check in?", faqId: "ticket" },
      { id: "rewards", question: "What are reward points worth?", faqId: "rewards" },
    ],
  },
  {
    id: "getting",
    title: "Getting here and around",
    items: [
      { id: "getting-here", question: "How do I get to Daet from Manila?", faqId: "getting_here" },
      { id: "getting-around", question: "How do I get around Daet?", faqId: "getting_around" },
      { id: "islands", question: "How do I reach Calaguas or the Mercedes islands?", faqId: "boats" },
      {
        id: "season",
        question: "When is the best time to visit?",
        todo: "the dry months and the fiesta are the easy part; the month-by-month advice for boats is being confirmed with the Tourism Office.",
      },
    ],
  },
  {
    id: "day",
    title: "On the day",
    items: [
      {
        id: "meeting-point",
        question: "Where and when do we meet?",
        todo: "the meeting point and start time are on the trip page before you book, and on the booking once the operator confirms. A standing rule for late arrivals is being confirmed.",
        links: [{ href: "/tours/browse", label: "Browse trips" }],
      },
      {
        id: "bring",
        question: "What should I bring?",
        todo: "sun protection, cash in small notes, drinking water and a dry bag for the crossing; the full list for each trip is being confirmed.",
      },
      {
        id: "children",
        question: "Can I bring children or older parents?",
        todo: "minimum ages and life-vest sizes are set by each operator. The Tourism Office is confirming a general line for families, children and older visitors.",
      },
    ],
  },
  {
    id: "people",
    title: "Accounts and people",
    items: [
      {
        // The knowledge base answer is written in the assistant's voice ("I can
        // open either chat"), so the page says the same thing in its own.
        id: "contact",
        question: "How do I reach a person?",
        faqId: "contact",
        answer:
          "For anything about a booking, message its operator from the booking page. For general questions or a complaint, message the Daet Tourism Office. Outside the app, the operator's phone number is on the booking and on the trip page.",
        links: [
          { href: "/tours/messages", label: "Messages" },
          { href: "/tours/help", label: "Ask the travel guide" },
        ],
      },
      {
        id: "operators",
        question: "How do I become an operator or a guide?",
        answer:
          "Apply as an operator or as a local guide. The Tourism Office checks your permits and ID, then your trips go live and bookings come to your phone.",
        links: [
          { href: "/tours/operator/register", label: "Apply as an operator" },
          { href: "/tours/guide/register", label: "Apply as a guide" },
        ],
      },
      { id: "account", question: "How do I sign in or change my password?", faqId: "account" },
    ],
  },
];

/** Everything on the page, in reading order. */
export const FAQ_ENTRIES: FaqEntry[] = FAQ_GROUPS.flatMap((group) => group.items);

export function faqEntry(id: string): FaqEntry | null {
  return FAQ_ENTRIES.find((entry) => entry.id === id) ?? null;
}

/**
 * The six the home page shows: the ones that decide whether someone books at
 * all, all of them answered today, so the section never shows a placeholder.
 */
export const HOME_FAQ_IDS = ["book", "pay", "cancel", "getting-here", "islands", "ticket"] as const;

export const HOME_FAQ: ResolvedFaq[] = HOME_FAQ_IDS.map((id) => {
  const entry = faqEntry(id);
  if (!entry) throw new Error(`Home FAQ points at unknown entry "${id}"`);
  return resolveFaq(entry);
});

/** The page's questions, resolved (answers pulled from the knowledge base). */
export function faqGroupsWithAnswers(): { id: string; title: string; items: ResolvedFaq[] }[] {
  return FAQ_GROUPS.map((group) => ({ id: group.id, title: group.title, items: group.items.map(resolveFaq) }));
}

/**
 * `FAQPage` for the page's own questions only.
 *
 * Since August 2023 Google shows FAQ rich results for government and health
 * sites only, so this is for other search engines and answer engines rather
 * than a snippet: the question and answer text is generated from the same
 * objects the page renders, which is the one rule that matters (the markup
 * must not say more than the page does). Unanswered questions are left out.
 */
export function faqJsonLd(items: ResolvedFaq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items
      .filter((item): item is ResolvedFaq & { answer: string } => Boolean(item.answer))
      .map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
  };
}
