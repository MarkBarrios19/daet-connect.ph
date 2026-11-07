"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/field";

export type ComboboxOption = { id: string; label: string };

/** Searchable single-choice list. Typing does not select an option. */
export function Combobox({ label, options, onSelect, onQueryChange }: {
  label: string;
  options: ComboboxOption[];
  onSelect: (option: ComboboxOption) => void;
  onQueryChange?: () => void;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const matches = options.filter((option) => option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()));
  function choose(option: ComboboxOption) {
    setQuery(option.label);
    setOpen(false);
    setActive(-1);
    onSelect(option);
  }
  return (
    <div className="relative">
      <label htmlFor={id} className="block text-sm font-bold text-daet-ink">{label}</label>
      <Input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId}
        aria-activedescendant={open && active >= 0 && matches[active] ? `${id}-option-${active}` : undefined}
        autoComplete="off" value={query} placeholder="Search attractions"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(-1); onQueryChange?.(); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setOpen(true);
            setActive((current) => matches.length ? (event.key === "ArrowDown" ? Math.min(current + 1, matches.length - 1) : current <= 0 ? matches.length - 1 : current - 1) : -1);
          } else if (event.key === "Enter" && open && active >= 0 && matches[active]) {
            event.preventDefault(); choose(matches[active]);
          } else if (event.key === "Enter") {
            event.preventDefault();
          } else if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
        }} />
      {open && <div className="absolute inset-x-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-2xl card-edge bg-surface">
        <ul id={listId} role="listbox" aria-label={label}>
          {matches.map((option, index) => <li id={`${id}-option-${index}`} role="option" aria-selected={index === active} key={option.id}
            onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}
            className={`min-h-11 cursor-pointer px-4 py-3 text-sm ${index === active ? "bg-muted" : "hover:bg-muted"}`}>
            {option.label}
          </li>)}
        </ul>
        {matches.length === 0 && <p className="px-4 py-3 text-sm text-daet-ink/70">No matches</p>}
      </div>}
    </div>
  );
}
