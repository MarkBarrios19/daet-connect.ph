"use client";

import { useRef } from "react";
import { MIC_PATH, useSpeech } from "@/components/ui/use-speech";
import { LineIcon } from "@/components/ui/icons";

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
  const { supported: canListen, listening, toggle: listen } = useSpeech((text) => {
    if (inputRef.current) {
      inputRef.current.value = text;
      formRef.current?.requestSubmit();
    }
  });

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
            <path d={MIC_PATH} />
          </svg>
        </button>
      ) : null}
      <span role="status" className="sr-only">
        {listening ? "Listening. Say what you are looking for." : ""}
      </span>
    </form>
  );
}
