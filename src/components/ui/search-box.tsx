import { LineIcon } from "@/components/ui/icons";

/**
 * A search field that submits as a plain GET form, so it works before the page's
 * JavaScript loads. `keep` carries the page's other filters along.
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
  return (
    <form role="search" action={action} method="get" className={`flex w-full max-w-xl items-center gap-2 ${className}`}>
      {Object.entries(keep).map(([name, v]) => (v ? <input key={name} type="hidden" name={name} value={v} /> : null))}
      <label className="relative flex-1">
        <span className="sr-only">{label}</span>
        <LineIcon name="search" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
        <input
          type="search"
          name="q"
          defaultValue={value}
          maxLength={80}
          placeholder={placeholder}
          className="block min-h-12 w-full rounded-full border border-slate-500 bg-surface pl-11 pr-4 text-base text-daet-ink placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
        />
      </label>
      <button type="submit" className="inline-flex min-h-12 shrink-0 items-center rounded-full bg-blue-600 px-5 font-bold text-white hover:bg-blue-700">
        Search
      </button>
    </form>
  );
}

/** The search text, trimmed and stripped of the characters PostgREST filters treat as syntax. */
export function searchTerm(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[%_,()*\\:."']/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}
