"use client";

import { formatPeso } from "@/lib/money";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { openChat, sendMessage } from "@/app/(subsystems)/tours/messages/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LineIcon } from "@/components/ui/icons";
import type { AssistantEvent } from "@/lib/tours/assistant/respond";
import type { AssistantCard, HandoffCard } from "@/lib/tours/assistant/tools";
import type { CostCard, PlaceCard } from "@/lib/tours/assistant/guide-tools";
import { ASSISTANT_NAME } from "@/lib/tours/assistant/name";
import { pageSuggestions, type MissingInput, type TripContext } from "@/lib/tours/assistant/context";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { QuestionsCard } from "@/components/assistant/questions-card";
import { GoogleMark } from "@/components/ui/google-sign-in";
import { TransportCardView } from "@/components/assistant/transport-card";
import type { ItineraryResult } from "@/lib/tours/assistant/plan-tool";
import { loadTrip, saveTrip, type TripAnswers } from "@/components/assistant/trip-storage";

export { loadTrip, saveTrip, type TripAnswers };

/** Session storage key the widget uses to hand a drafted plan to /tours/plan. */
export const HANDOFF_KEY = "daet-plan-handoff-v1";

type Turn = { role: "user" | "assistant"; content: string; cards?: AssistantCard[]; mode?: "ai" | "basic"; questions?: { missing: MissingInput[]; prefill: TripContext | null }; status?: string; choices?: string[]; itinerary?: ItineraryResult; signIn?: boolean };
type PageRef = NonNullable<TripContext["page"]>;
type Point = { lat: number; lng: number };

const STORAGE_KEY = "daet-assistant-v1";
const MESSAGE_MAX = 1000;
export const ASSISTANT_EXAMPLES = [
  "Budget for 2 days in Calaguas?",
  "Where to eat near Bagasbas?",
  "Paano pumunta sa Daet from Manila?",
  "Where do we meet for my tour?",
  "Where is my ticket?",
];

function load(): Turn[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const turns = raw ? (JSON.parse(raw) as Turn[]) : [];
    return Array.isArray(turns) ? turns.slice(-30) : [];
  } catch {
    return [];
  }
}
function save(turns: Turn[]) {
  try {
    // An unanswered form is not kept: it would come back stale.
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(turns.slice(-30).map(({ questions: _questions, status: _status, itinerary: _itinerary, ...turn }) => turn)));
  } catch {
    // Private mode or storage full: the chat still works, it just isn't kept.
  }
}

/**
 * After a visitor's 3rd message of the day without an account (decision 28):
 * sign in to keep getting full answers. Answers stay simple until then.
 */
function SignInCard() {
  const [next, setNext] = useState("/");
  useEffect(() => setNext(`${window.location.pathname}${window.location.search}`), []);
  return (
    <section aria-labelledby="assistant-signin" className="space-y-3 rounded-2xl border border-blue-600 bg-blue-50 p-4 dark:bg-blue-950/40">
      <h3 id="assistant-signin" className="font-bold text-daet-ink">
        Sign in to keep getting full answers
      </h3>
      <p className="text-sm text-slate-700 dark:text-slate-300">It&apos;s free. Your chat and trip details are kept in your account.</p>
      <a
        href={`/auth/oauth?next=${encodeURIComponent(next)}`}
        rel="nofollow"
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-slate-500 bg-surface px-4 font-bold text-daet-ink hover:bg-muted"
      >
        <GoogleMark /> Continue with Google
      </a>
      <Link href={`/login?next=${encodeURIComponent(next)}`} className="block text-center text-sm font-semibold text-blue-700 underline dark:text-blue-300">
        Other ways to sign in
      </Link>
    </section>
  );
}

/** The browser's location, rounded to about 100 m. Asked only when the traveller taps the button. */
function askLocation(): Promise<Point> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("unsupported"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: Math.round(pos.coords.latitude * 1000) / 1000, lng: Math.round(pos.coords.longitude * 1000) / 1000 }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  });
}

/** The Daet AI assistant conversation: used by the floating widget, the Messages pinned chat and /tours/help. */
export function AssistantChat({
  signedIn,
  onNavigate,
  autoFocus = false,
  page = null,
  onItinerary,
  onChoice,
  sendRef,
  initialText = "",
  startWith,
  afterPlan,
}: {
  signedIn: boolean;
  onNavigate?: () => void;
  autoFocus?: boolean;
  page?: PageRef | null;
  /** The planner page shows the plan beside the chat; without it, the chat shows a compact card. */
  onItinerary?: (itinerary: ItineraryResult) => void;
  /** Follow-up chips ("Make it more relaxed") edit the plan beside the chat; without it they are not shown. */
  onChoice?: (text: string) => void;
  /** Lets the plan panel send a message ("Tell me about …") into this chat. */
  sendRef?: React.MutableRefObject<((text: string) => void) | null>;
  /** Words to start the message box with (the assistant's "Open the trip planner" link carries them). Never sent on its own. */
  initialText?: string;
  /** A first message (typed on the planner's start view), sent once the saved chat has loaded. */
  startWith?: string;
  /** Shown under the latest plan in the chat (the planner's pace and getting-around chips). */
  afterPlan?: React.ReactNode;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState(initialText.slice(0, 500));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [here, setHere] = useState<Point | null>(null);
  const [locating, setLocating] = useState(false);
  const logRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [confirmClear, setConfirmClear] = useState(false);
  const [trip, setTrip] = useState<TripAnswers>({});
  useEffect(() => setTrip(loadTrip()), []);
  // The start view's message goes once, after the saved chat is in, so it is not overwritten.
  const startRef = useRef(startWith?.trim() || "");
  const sendFirst = (base: Turn[]) => {
    const first = startRef.current;
    startRef.current = "";
    if (first) void send(first, here, loadTrip(), base);
  };
  // Signed-in travellers keep their chat on their account; visitors keep it in this tab only.
  useEffect(() => {
    if (!signedIn) {
      const saved = load();
      setTurns(saved);
      sendFirst(saved);
      return;
    }
    let cancelled = false;
    fetch("/api/assistant", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { turns?: Turn[] }) => {
        if (cancelled) return;
        const saved = Array.isArray(body.turns) ? body.turns : [];
        setTurns(saved);
        sendFirst(saved);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Your saved chat could not be loaded. New messages still work.");
        sendFirst([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per sign-in state
  }, [signedIn]);
  const remember = (next: Turn[]) => {
    if (!signedIn) save(next);
  };
  useEffect(() => {
    logRef.current?.lastElementChild?.scrollIntoView({ block: "end" });
  }, [turns]);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  async function shareLocation(): Promise<Point | null> {
    setLocating(true);
    setError(null);
    try {
      const point = await askLocation();
      setHere(point);
      return point;
    } catch {
      setError("Your location isn't available. Allow location for this site, or type the area instead (e.g. near Bagasbas).");
      return null;
    } finally {
      setLocating(false);
    }
  }

  async function send(value: string, location: Point | null = here, answers: TripAnswers = trip, base: Turn[] = turns, datesConfirmed = false) {
    const question = value.trim().slice(0, MESSAGE_MAX);
    if (!question || busy) return;
    setError(null);
    setText("");
    setBusy(true);
    const history: Turn[] = [...base, { role: "user", content: question }];
    let reply: Turn = { role: "assistant", content: "" };
    setTurns([...history, reply]);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history.filter((t) => t.content).map((t) => ({ role: t.role, content: t.content })), location, context: { page, ...answers, ...(datesConfirmed ? { datesConfirmed: true } : {}) } }),
      });
      if (!response.ok || !response.body) throw new Error(String(response.status));
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as AssistantEvent;
          if (event.t === "mode") reply = { ...reply, mode: event.mode };
          else if (event.t === "text") reply = { ...reply, content: reply.content + event.v };
          else if (event.t === "cards") reply = { ...reply, cards: event.cards };
          else if (event.t === "status") reply = { ...reply, status: event.label };
          else if (event.t === "choices") reply = { ...reply, choices: event.options };
          else if (event.t === "signin") reply = { ...reply, signIn: true };
          else if (event.t === "itinerary") {
            reply = { ...reply, itinerary: event.itinerary };
            onItinerary?.(event.itinerary);
          } else if (event.t === "questions") reply = { ...reply, questions: { missing: event.missing, prefill: event.prefill } };
          else if (event.t === "error") reply = { ...reply, content: event.message };
          setTurns([...history, reply]);
        }
      }
      reply = { ...reply, status: undefined };
      if (!reply.content.trim()) reply = { ...reply, content: "Sorry, I couldn't answer that. Please try again." };
      const final = [...history, reply];
      setTurns(final);
      remember(final);
    } catch {
      setTurns(history);
      remember(history);
      setText(question);
      setError("The assistant couldn't be reached. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  /** "Use my location" inside an answer: share it, then ask the same question again. */
  async function shareAndRetry() {
    const point = await shareLocation();
    const lastQuestion = [...turns].reverse().find((t) => t.role === "user")?.content;
    if (point && lastQuestion) await send(lastQuestion, point);
  }

  /** The form was filled in: keep the answers and ask the same question again, without a second copy of it. */
  function answerQuestions(index: number, answers: TripAnswers) {
    const question = turns[index - 1]?.content;
    if (!question) return;
    setTrip(answers);
    saveTrip(answers);
    void send(question, here, answers, turns.slice(0, index - 1), true);
  }

  // Re-pointed after every render so the panel always sends with the latest chat.
  useEffect(() => {
    if (sendRef) sendRef.current = (value: string) => void send(value);
  });

  const lastMode = [...turns].reverse().find((t) => t.mode)?.mode;
  const lastPlanTurn = turns.reduce((at, t, i) => (t.itinerary ? i : at), -1);
  // On a tour, place or event page: a greeting about it and three questions (decisions 17, 33).
  const [pageName, setPageName] = useState<string | null>(null);
  useEffect(() => {
    if (!page) return setPageName(null);
    const h1 = document.querySelector("main h1")?.textContent?.replace(/\s+/g, " ").trim();
    setPageName(h1 && h1.length <= 80 ? h1 : null);
  }, [page]);
  const suggestions = page && pageName ? pageSuggestions(page.kind, pageName) : null;
  const lastSignIn = turns.reduce((at, t, i) => (t.signIn ? i : at), -1);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 bg-canvas px-4 py-1 text-sm text-slate-600 dark:text-slate-400">
        <span className="min-w-0">{/* Basic mode carries no notice (decision 6 in docs/TRIP_PLANNER.md). */}
          {lastMode === "ai" ? <Badge tone="info">AI</Badge> : "Answers come from CONNECT-Daet's own listings."}</span>
        {turns.length && !signedIn ? (
          <button
            type="button"
            onClick={() => {
              setTurns([]);
              save([]);
              inputRef.current?.focus();
            }}
            className="min-h-11 font-bold text-blue-700 dark:text-blue-300 underline"
          >
            New chat
          </button>
        ) : null}
        {turns.length && signedIn ? (
          confirmClear ? (
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={async () => {
                  const response = await fetch("/api/assistant", { method: "DELETE" }).catch(() => null);
                  setConfirmClear(false);
                  if (response?.ok) {
                    setTurns([]);
                    inputRef.current?.focus();
                  } else setError("Your chat could not be deleted. Please try again.");
                }}
                className="min-h-11 rounded-full bg-red-600 px-3 font-bold text-white"
              >
                Delete chat
              </button>
              <button type="button" onClick={() => setConfirmClear(false)} className="min-h-11 px-2 font-bold text-daet-ink">
                Keep
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmClear(true)} className="min-h-11 font-bold text-blue-700 dark:text-blue-300 underline">
              Delete chat history
            </button>
          )
        ) : null}
      </div>

      {onItinerary ? <TripLine trip={trip} onChange={(answers) => { setTrip(answers); saveTrip(answers); }} /> : null}

      <ol
        ref={logRef}
        tabIndex={0}
        aria-live="polite"
        aria-label="Conversation"
        className="scrollbar-quiet min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden px-3 py-4"
      >
        {turns.length === 0 && suggestions ? (
          <li className="space-y-3">
            <p className="max-w-[92%] rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-daet-ink">{suggestions.greeting}</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.questions.map((q) => (
                <button key={q} type="button" onClick={() => send(q)} className="min-h-11 rounded-full bg-blue-50 px-4 text-left text-sm font-semibold text-blue-800 transition hover:bg-blue-100 active:scale-[0.98] dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/40">
                  {q}
                </button>
              ))}
            </div>
          </li>
        ) : turns.length === 0 ? (
          <li className="space-y-3">
            <p className="max-w-[92%] rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-daet-ink">
              Hi! I&apos;m your local guide for Daet. Ask where to eat or stay, how to get somewhere and what it costs, where your tour meets, or about tours and events
              {signedIn ? ", your bookings, payments and tickets" : ""}. I can also pass you to a person.
            </p>
            <div className="flex flex-wrap gap-2">
              {signedIn ? (
                <Link href="/tours/my-itineraries" onClick={onNavigate} className="inline-flex min-h-11 items-center rounded-full bg-muted px-4 text-sm font-semibold text-daet-ink transition hover:bg-muted-strong">
                  My saved trips
                </Link>
              ) : null}
              {ASSISTANT_EXAMPLES.map((example) => (
                <button key={example} type="button" onClick={() => send(example)} className="min-h-11 rounded-full bg-blue-50 dark:bg-blue-950/40 px-4 text-left text-sm font-semibold text-blue-800 dark:text-blue-300 transition hover:bg-blue-100 dark:hover:bg-blue-900/40 active:scale-[0.98]">
                  {example}
                </button>
              ))}
            </div>
          </li>
        ) : null}
        {turns.map((turn, i) => (
          <li key={i} className={turn.role === "user" ? "flex justify-end" : ""}>
            {turn.role === "user" ? (
              <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-blue-600 px-3 py-2 text-white">{turn.content}</p>
            ) : (
              <div className="min-w-0 max-w-[92%] space-y-2">
                <p className="whitespace-pre-wrap break-words rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-daet-ink">
                  {turn.content || (busy && i === turns.length - 1 ? <TypingDots /> : null)}
                </p>
                {turn.status && busy && i === turns.length - 1 ? (
                  <p className="px-1 text-sm font-semibold text-slate-600 dark:text-slate-400">{turn.status}…</p>
                ) : null}
                {turn.itinerary && !onItinerary ? <PlanSummaryCard itinerary={turn.itinerary} onNavigate={onNavigate} /> : null}
                {afterPlan && i === lastPlanTurn && !(busy && i === turns.length - 1) ? afterPlan : null}
                {onChoice && turn.choices?.length && i === turns.length - 1 && !busy ? (
                  <div className="flex flex-wrap gap-2">
                    {/* The planner asks about pace with its own chips, so those follow-ups aren't repeated. */}
                    {turn.choices.filter((choice) => !(afterPlan && /relax|packed|rush|pace/i.test(choice))).map((choice) => (
                      <button key={choice} type="button" onClick={() => onChoice(choice)} className="min-h-11 rounded-full bg-blue-50 px-4 text-left text-sm font-semibold text-blue-800 transition hover:bg-blue-100 active:scale-[0.98] dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/40">
                        {choice}
                      </button>
                    ))}
                  </div>
                ) : null}
                {turn.questions && i === turns.length - 1 && !busy ? (
                  <QuestionsCard prefill={turn.questions.prefill} today={toManilaDateKey(new Date())} onSubmit={(answers) => answerQuestions(i, answers)} />
                ) : null}
                {turn.cards?.length ? <AssistantCards cards={turn.cards} signedIn={signedIn} onNavigate={onNavigate} onShareLocation={shareAndRetry} /> : null}
                {turn.signIn && !signedIn && i === lastSignIn ? <SignInCard /> : null}
              </div>
            )}
          </li>
        ))}
      </ol>

      <form
        className="bg-surface p-3 shadow-[var(--shadow-float)]"
        onSubmit={(event) => {
          event.preventDefault();
          void send(text);
        }}
      >
        {error ? (
          <p role="alert" className="mb-2 text-sm font-semibold text-red-600 dark:text-red-300">
            {error}
          </p>
        ) : null}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {here ? (
            <button type="button" onClick={() => setHere(null)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-green-500 px-4 text-sm font-bold text-slate-950">
              <LineIcon name="pin" className="h-4 w-4" /> Using your location <span aria-hidden="true">·</span> Stop
            </button>
          ) : (
            <button type="button" onClick={() => void shareLocation()} disabled={locating} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-muted px-4 text-sm font-bold text-daet-ink transition hover:bg-muted-strong disabled:opacity-60">
              <LineIcon name="pin" className="h-4 w-4" /> {locating ? "Finding you…" : "Use my location"}
            </button>
          )}
        </div>
        <label htmlFor="assistant-input" className="sr-only">
          Ask the {ASSISTANT_NAME}
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="assistant-input"
            ref={inputRef}
            rows={1}
            maxLength={MESSAGE_MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(text);
              }
            }}
            placeholder="Ask anything about your trip…"
            className="block min-h-11 w-full resize-none rounded-2xl bg-muted px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600/40"
          />
          <Button type="submit" loading={busy} loadingText="…" disabled={!text.trim()} aria-label="Send">
            Send
          </Button>
        </div>
        <p className="mt-2 text-xs leading-4 text-slate-600 dark:text-slate-400">
          {here ? "Your location is sent only with your next questions, never saved. " : ""}
          {signedIn ? "Saved to your account. Delete it anytime." : "Chats aren't saved on our servers."} Never share passwords or card numbers.
        </p>
      </form>
    </div>
  );
}

export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" role="status" aria-label="Typing">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-slate-400 motion-reduce:animate-none" style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </span>
  );
}

const pill = "inline-flex min-h-11 items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-950/40 px-4 text-sm font-bold text-blue-700 dark:text-blue-300 transition hover:bg-blue-100 dark:hover:bg-blue-900/40 active:scale-[0.98]";

function AssistantCards({ cards, signedIn, onNavigate, onShareLocation }: { cards: AssistantCard[]; signedIn: boolean; onNavigate?: () => void; onShareLocation: () => void }) {
  const links = cards.filter((c) => c.type === "link");
  return (
    <div className="min-w-0 space-y-2">
      {cards.map((card, i) => {
        if (card.type === "tour") {
          return (
            <div key={i} className="rounded-2xl bg-canvas p-3">
              <p className="font-bold text-daet-ink">{card.title}</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">{[card.location, card.duration, card.priceFrom ? `from ${formatPeso(card.priceFrom)} per person` : null].filter(Boolean).join(" · ")}</p>
              <Link href={card.href} onClick={onNavigate} className={`${pill} mt-2`}>
                View tour
              </Link>
            </div>
          );
        }
        if (card.type === "booking") {
          return (
            <div key={i} className="rounded-2xl bg-canvas p-3">
              <p className="font-bold text-daet-ink">
                {card.title} <span className="font-normal text-slate-600 dark:text-slate-400">· {card.reference}</span>
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {card.date} · {card.statusLabel}
              </p>
              <p className="mt-1 text-sm text-daet-ink">{card.nextStep}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {card.links.map((link) => (
                  <Link key={link.href} href={link.href} onClick={onNavigate} className={pill}>
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          );
        }
        if (card.type === "place") return <PlaceCardView key={i} card={card} />;
        if (card.type === "cost") return <CostCardView key={i} card={card} />;
        if (card.type === "transport") return <TransportCardView key={i} card={card} />;
        if (card.type === "handoff") return <HandoffPanel key={i} card={card} signedIn={signedIn} onNavigate={onNavigate} />;
        return null;
      })}
      {links.length ? (
        <div className="flex flex-wrap gap-2">
          {links.map((card) =>
            card.type !== "link" ? null : card.href === "#share-location" ? (
              <button key={card.href} type="button" onClick={onShareLocation} className={pill}>
                <LineIcon name="pin" className="h-4 w-4" /> {card.label}
              </button>
            ) : card.external ? (
              <a key={card.href} href={card.href} target="_blank" rel="noopener noreferrer" className={pill}>
                <LineIcon name="pin" className="h-4 w-4" /> {card.label}
                <span className="sr-only"> (opens Google Maps)</span>
              </a>
            ) : (
              <Link key={card.href} href={card.href} onClick={onNavigate} className={pill}>
                {card.label}
              </Link>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

function PlaceCardView({ card }: { card: PlaceCard }) {
  return (
    <div className="rounded-2xl bg-canvas p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-daet-ink">{card.name}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">{[card.kind, card.area, card.distance].filter(Boolean).join(" · ")}</p>
        </div>
        {card.verified ? null : <Badge tone="warning">Verify locally</Badge>}
      </div>
      {card.price || card.status ? <p className="mt-1 text-sm font-semibold text-daet-ink">{[card.price, card.status].filter(Boolean).join(" · ")}</p> : null}
      {card.note ? <p className="mt-1 text-sm text-daet-ink">{card.note}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <a href={card.directionsHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700 active:scale-[0.98]">
          <LineIcon name="pin" className="h-4 w-4" /> Get directions
          <span className="sr-only"> to {card.name} (opens Google Maps)</span>
        </a>
        <a href={card.mapHref} target="_blank" rel="noopener noreferrer" className={pill}>
          View on map
          <span className="sr-only"> (opens Google Maps)</span>
        </a>
      </div>
    </div>
  );
}

function CostCardView({ card }: { card: CostCard }) {
  return (
    <div className="rounded-2xl bg-canvas p-3">
      <p className="font-bold text-daet-ink">Trip estimate</p>
      <p className="text-sm text-slate-600 dark:text-slate-400">{card.title}</p>
      <ul className="mt-2 space-y-1.5">
        {card.lines.map((line) => (
          <li key={line.label} className="text-sm">
            <span className="flex justify-between gap-3">
              <span className="text-daet-ink">{line.label}</span>
              <span className={`shrink-0 font-semibold ${line.amount === "Ask locally" ? "text-yellow-800 dark:text-yellow-200" : "text-daet-ink"}`}>{line.amount}</span>
            </span>
            <span className="block text-xs text-slate-600 dark:text-slate-400">{line.note}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex justify-between gap-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 px-3 py-2">
        <span className="font-bold text-daet-ink">Total</span>
        <span className="text-right font-bold text-blue-800 dark:text-blue-300">
          {card.total}
          <span className="block text-xs font-semibold">{card.perPerson} per person</span>
        </span>
      </p>
      <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
        Estimates from listed prices, not quotes.{card.unknown.length ? ` Not included (no price on record): ${card.unknown.join(", ")}.` : ""}
      </p>
    </div>
  );
}

/** Pre-filled message to a person; the tourist reads and edits it, then sends it themselves. */
function HandoffPanel({ card, signedIn, onNavigate }: { card: HandoffCard; signedIn: boolean; onNavigate?: () => void }) {
  const [message, setMessage] = useState(card.summary);
  const [state, setState] = useState<{ sent?: string; error?: string }>({});
  const [pending, startTransition] = useTransition();
  const who = card.target === "operator" ? (card.operatorName ?? "the operator") : "the Daet Tourism Office";
  const id = `handoff-${card.bookingId ?? "office"}`;

  if (!signedIn || !card.signedIn) {
    return (
      <div className="rounded-2xl bg-canvas p-3 text-sm">
        <p className="text-daet-ink">Sign in so {who} can reply to you.</p>
        <Link href="/login" onClick={onNavigate} className="mt-2 inline-flex min-h-11 items-center rounded-full bg-blue-600 px-4 text-sm font-bold text-white">
          Sign in to message
        </Link>
      </div>
    );
  }
  if (state.sent) {
    return (
      <div className="rounded-2xl bg-green-50 dark:bg-green-950/40 p-3 text-sm text-green-900 dark:text-green-300">
        Sent to {who}. They&apos;ll reply in Messages.{" "}
        <Link href={`/tours/messages/${state.sent}`} onClick={onNavigate} className="font-bold underline">
          Open the chat
        </Link>
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-canvas p-3">
      <label htmlFor={id} className="text-sm font-bold text-daet-ink">
        Message to {who} (edit before sending)
      </label>
      <textarea id={id} rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1 block w-full rounded-2xl card-edge bg-surface px-3 py-2 text-base" />
      {state.error ? (
        <p role="alert" className="mt-1 text-sm font-semibold text-red-600 dark:text-red-300">
          {state.error}
        </p>
      ) : null}
      <Button
        className="mt-2"
        loading={pending}
        loadingText="Sending…"
        disabled={!message.trim()}
        onClick={() =>
          startTransition(async () => {
            const opened = await openChat(card.bookingId ? { kind: "booking", bookingId: card.bookingId } : { kind: "tourist_office" });
            if (!opened.conversationId) {
              setState({ error: opened.error ?? "The chat could not be opened." });
              return;
            }
            const form = new FormData();
            form.set("conversationId", opened.conversationId);
            form.set("text", message.trim());
            const sent = await sendMessage(form);
            setState(sent.message ? { sent: opened.conversationId } : { error: sent.error ?? "The message could not be sent." });
          })
        }
      >
        Send to {card.target === "operator" ? "operator" : "Tourism Office"}
      </Button>
    </div>
  );
}

/** In the widget: a short view of the plan and a way into the full planner. */
function PlanSummaryCard({ itinerary, onNavigate }: { itinerary: ItineraryResult; onNavigate?: () => void }) {
  const { plan } = itinerary;
  return (
    <div className="rounded-2xl bg-canvas p-3">
      <p className="font-bold text-daet-ink">Your {plan.days.length}-day plan</p>
      <ol className="mt-1 space-y-0.5 text-sm text-daet-ink">
        {plan.days.map((d, i) => (
          <li key={d.date}>
            <span className="font-semibold">Day {i + 1}:</span>{" "}
            {d.blocks.flatMap((b) => (b.kind === "visit" ? [b.name] : [])).join(", ") || "nothing fits yet"}
          </li>
        ))}
      </ol>
      {itinerary.packages.length ? <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{itinerary.packages.length} bookable tour{itinerary.packages.length === 1 ? "" : "s"} nearby</p> : null}
      <Link
        href="/tours/plan"
        onClick={() => {
          try {
            window.sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(itinerary));
          } catch {
            // The planner page simply starts empty.
          }
          onNavigate?.();
        }}
        className={`${pill} mt-2`}
      >
        Open in planner
      </Link>
    </div>
  );
}

const tripDate = (key: string) => new Date(`${key}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * The planner's trip line (Desktop-Results board): the dates and group the
 * plan uses, tappable to change them, and the AI note.
 */
function TripLine({ trip, onChange }: { trip: TripAnswers; onChange: (answers: TripAnswers) => void }) {
  const [editing, setEditing] = useState(false);
  const group = trip.travelers ? trip.travelers.adults + trip.travelers.children.length : 0;
  const label = trip.dates
    ? [
        trip.dates.start === trip.dates.end ? tripDate(trip.dates.start) : `${tripDate(trip.dates.start)} to ${tripDate(trip.dates.end)}`,
        group ? `${group} traveler${group === 1 ? "" : "s"}` : null,
        trip.origin?.city ? `from ${trip.origin.city}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Add your dates and who is coming";
  return (
    <div className="space-y-2 px-3 pt-3">
      <button
        type="button"
        aria-expanded={editing}
        onClick={() => setEditing((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-full bg-blue-50 px-4 text-left text-sm font-bold text-blue-800 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/60"
      >
        <span className="flex min-w-0 items-center gap-2">
          <LineIcon name="calendar" className="h-4 w-4 shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <span className="shrink-0 font-semibold">{editing ? "Close" : "Change"}</span>
      </button>
      {editing ? (
        <QuestionsCard
          prefill={trip as TripContext}
          title="Your trip"
          submitLabel="Use these details"
          today={toManilaDateKey(new Date())}
          onSubmit={(answers) => {
            onChange(answers);
            setEditing(false);
          }}
        />
      ) : null}
      <p className="text-xs text-slate-600 dark:text-slate-400">The Daet AI assistant can make mistakes. Check details with the operator.</p>
    </div>
  );
}
