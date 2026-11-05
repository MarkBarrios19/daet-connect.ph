"use client";

import { useEffect, useRef, useState } from "react";
import { LineIcon } from "@/components/ui/icons";

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;

const speechApi = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/**
 * A search bar: the field and its search button joined in one pill, and a round
 * voice button beside it where the browser can listen. It submits as a plain
 * GET form, so it works before the page's JavaScript loads. `keep` carries the
 * page's other filters along.
 */
export function SearchBox({
  action,
  label,
  placeholder,
  value = "",
  keep = {},
  className = "",
}: {
  action: string;
  label: string;
  placeholder: string;
  value?: string;
  keep?: Record<string, string | undefined>;
  className?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<Recognition | null>(null);
  const [canListen, setCanListen] = useState(false);
  const [listening, setListening] = useState(false);
  useEffect(() => setCanListen(speechApi() !== null), []);
  useEffect(() => () => recRef.current?.stop(), []);

  const listen = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Api = speechApi();
    if (!Api) return;
    const rec = new Api();
    rec.lang = "en-PH";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript?.trim();
      if (text && inputRef.current) {
        inputRef.current.value = text;
        formRef.current?.requestSubmit();
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  return (
    <form ref={formRef} role="search" action={action} method="get" className={`flex w-full max-w-2xl items-center gap-3 ${className}`}>
      {Object.entries(keep).map(([name, v]) => (v ? <input key={name} type="hidden" name={name} value={v} /> : null))}
      <div className="flex min-h-12 flex-1 overflow-hidden rounded-full border border-slate-500 bg-surface focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/30">
        <label className="flex-1">
          <span className="sr-only">{label}</span>
          <input
            ref={inputRef}
            type="search"
            name="q"
            defaultValue={value}
            maxLength={80}
            placeholder={placeholder}
            className="block h-full min-h-12 w-full bg-transparent pl-5 pr-3 text-base text-daet-ink placeholder:text-slate-500 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          aria-label="Search"
          className="grid w-16 shrink-0 place-items-center border-l border-slate-500 bg-muted text-daet-ink hover:bg-blue-50 dark:hover:bg-blue-950/40"
        >
          <LineIcon name="search" className="h-6 w-6" />
        </button>
      </div>
      {canListen ? (
        <button
          type="button"
          onClick={listen}
          aria-pressed={listening}
          aria-label={listening ? "Stop listening" : "Search by voice"}
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${
            listening ? "bg-red-600 text-white motion-safe:animate-pulse" : "bg-muted text-daet-ink hover:bg-blue-50 dark:hover:bg-blue-950/40"
          }`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </button>
      ) : null}
      <span role="status" className="sr-only">
        {listening ? "Listening. Say what you are looking for." : ""}
      </span>
    </form>
  );
}
