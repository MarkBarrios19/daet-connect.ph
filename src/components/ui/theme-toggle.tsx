"use client";

import { useEffect, useState } from "react";
import { LineIcon, type IconName } from "@/components/ui/icons";
import { nextTheme, parseTheme, THEME_CHOICES, THEME_LABELS, THEME_STORAGE_KEY, type ThemeChoice } from "@/lib/theme";

const ICONS: Record<ThemeChoice, IconName> = { light: "sun", dark: "moon", system: "monitor" };
const CHANGE_EVENT = "daet:theme";

function readTheme(): ThemeChoice {
  try {
    return parseTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return parseTheme(document.documentElement.getAttribute("data-theme"));
  }
}

function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  try {
    if (choice === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage blocked: the choice still applies to this page.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: choice }));
}

/** The current choice, kept in step across every toggle on the page and other tabs. */
function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [theme, setTheme] = useState<ThemeChoice>("system");
  useEffect(() => {
    const sync = () => setTheme(readTheme());
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return [theme, applyTheme];
}

/** Header button: cycles Light → Dark → System. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useTheme();
  const next = nextTheme(theme);
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${THEME_LABELS[theme]}. Switch to ${THEME_LABELS[next]}`}
      title={`Theme: ${THEME_LABELS[theme]}`}
      className={`grid min-h-11 min-w-11 place-items-center rounded-full text-daet-ink hover:bg-muted dark:text-white/85 dark:hover:bg-white/10 dark:hover:text-white ${className}`}
    >
      <LineIcon name={ICONS[theme]} className="h-5 w-5" />
    </button>
  );
}

/** Phone menu row: the three choices side by side. */
export function ThemeChoices() {
  const [theme, setTheme] = useTheme();
  return (
    <fieldset className="mt-3 px-3">
      <legend className="py-2 text-sm font-semibold text-daet-ink/70">Theme</legend>
      <div className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
        {THEME_CHOICES.map((choice) => (
          <label
            key={choice}
            className={`flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full text-sm font-bold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue-600 ${
              theme === choice ? "bg-surface text-daet-ink" : "text-daet-ink/70"
            }`}
          >
            <input type="radio" name="daet-theme" value={choice} checked={theme === choice} onChange={() => setTheme(choice)} className="sr-only" />
            <LineIcon name={ICONS[choice]} className="h-4 w-4" />
            {THEME_LABELS[choice]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Whether the page is dark right now: an explicit choice, else the device setting. */
function useDarkNow(theme: ThemeChoice): boolean {
  const [deviceDark, setDeviceDark] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setDeviceDark(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return theme === "dark" || (theme === "system" && deviceDark);
}

/** Account menu row: one switch between light and dark (saved as an explicit choice). */
export function DarkModeSwitch({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useTheme();
  const dark = useDarkNow(theme);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-4 text-left text-base text-daet-ink hover:bg-muted ${className}`}
    >
      Dark mode
      <span aria-hidden="true" className={`relative h-7 w-[3.25rem] shrink-0 rounded-full transition-colors motion-reduce:transition-none ${dark ? "bg-blue-600" : "bg-slate-500"}`}>
        <span
          className={`absolute left-0.5 top-0.5 grid h-6 w-6 place-items-center rounded-full bg-surface text-blue-700 dark:bg-white transition-transform motion-reduce:transition-none ${dark ? "translate-x-6" : "translate-x-0"}`}
        >
          <LineIcon name={dark ? "moon" : "sun"} className="h-4 w-4" />
        </span>
      </span>
    </button>
  );
}
