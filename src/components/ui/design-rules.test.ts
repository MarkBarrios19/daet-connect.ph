import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The redesign's rules, enforced (docs/DESIGN_SYSTEM.md): no emoji as icons,
 * no tiny uppercase letter-spaced labels, no resting shadows (only things that
 * float use --shadow-float), no eyebrow labels above headings, cards rounded-2xl,
 * and neutral backgrounds use the theme tokens so dark mode keeps working.
 */
const files: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    // gallery-schema-verification.ts is a CLI check that prints to a terminal, not UI.
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith("database.types.ts") && !name.endsWith("gallery-schema-verification.ts")) files.push(path);
  }
};
walk(join(process.cwd(), "src"));

const offenders = (test: (line: string) => boolean) =>
  files.flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => test(line))
      .map(({ i }) => `${file.replace(process.cwd() + "/", "")}:${i + 1}`),
  );

// Pictographic emoji only; typographic marks (★ ✓ ✕ → ·) are fine.
const EMOJI = /[\u{1F300}-\u{1FAFF}☕⚙⚠⛔✅⭐⏰-⏳✈✏✉❌]/u;

// The one line in free-map.tsx allowed a white background: the picked-stop pin
// (STOP_PIN). Prettier wraps that long class string onto the line after the
// `const`, so the licence follows the `bg-white` itself rather than the `const`.
const PIN_LINE = (() => {
  const lines = readFileSync(join(process.cwd(), "src/components/maps/free-map.tsx"), "utf8").split("\n");
  const start = lines.findIndex((line) => line.startsWith("const STOP_PIN ="));
  const end = lines.findIndex((line, index) => index > start && line.trim().endsWith('";'));
  const white = lines.slice(start, end + 1).findIndex((line) => line.includes("bg-white"));
  return start + white + 1;
})();

describe("design rules", () => {
  it("uses line icons, not emoji", () => {
    // Message reactions are emoji by nature; src/lib/tours/messenger.ts names them as escapes.
    expect(offenders((line) => EMOJI.test(line) && !line.includes("console.")).filter((at) => !at.startsWith("src/components/chat/reactions.tsx"))).toEqual([]);
  });

  it("has no uppercase letter-spaced labels", () => {
    expect(offenders((line) => /\buppercase\b[^"`]*\btracking-|\btracking-[^"`]*\buppercase\b/.test(line))).toEqual([]);
  });

  it("has no resting shadows", () => {
    expect(offenders((line) => /(?<![\w-])shadow(-(sm|md|lg|xl|2xl|card))?(?![\w-[])/.test(line) && !line.trim().startsWith("*") && !line.includes("print:shadow-none"))).toEqual([]);
  });

  it("uses theme surfaces, so dark mode can't regress", () => {
    // bg-surface / bg-canvas / bg-muted / bg-muted-strong / bg-line switch with the theme.
    // White stays white only on print and inside a data-theme="light" island.
    const LIGHT_ONLY = /(?<![\w:-])(?:[a-z-]+:)*bg-(?:white|slate-(?:50|100|200|300))(?![\w/-])/;
    const screenOnly = (line: string) => line.replace(/\b(?:print|dark):\S+/g, "");
    expect(offenders((line) => LIGHT_ONLY.test(screenOnly(line)) && !line.includes('data-theme="light"')).filter(
        // The QR badge is printed white; the itinerary's picked-stop pin sits on the map tiles, white on purpose.
        (at) => !at.startsWith("src/app/(subsystems)/tours/guide/guide-qr-badge.tsx") && at !== `src/components/maps/free-map.tsx:${PIN_LINE}`,
      ),
    ).toEqual([]);
  });

  it("keeps the display face behind one token", () => {
    // Swapping the display typeface is one line in globals.css (docs/FONTS.md).
    // If a second place names Fraunces, a swap leaves half the site behind.
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css.match(/--font-display\s*:/g) ?? []).toHaveLength(1);
    expect(css.replace(/--font-display\s*:[^;]*;/, "")).not.toContain("--font-fraunces");
    expect(css).toContain("font-family: var(--font-display)");
  });

  it("loads the display font's whole weight range, so 900 is not synthesised", () => {
    const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(layout).toContain("Fraunces-Variable.woff2");
    expect(layout).toContain('weight: "100 900"');
  });

  it("has no eyebrow labels and no rounded-3xl cards", () => {
    expect(offenders((line) => /\beyebrow\b|rounded-3xl/.test(line) && !line.trim().startsWith("*"))).toEqual([]);
  });

  it("pairs green and yellow fills with dark text, never white", () => {
    // docs/DESIGN_SYSTEM.md: green-500 and yellow-500 fills carry dark text
    // (text-slate-950); white on them fails contrast.
    const FILL = /(?<![\w:-])bg-(?:green|yellow)-500(?![\w/-])/;
    const DARK_INK = /\btext-slate-9[05]0\b/;
    const bad = files.flatMap((file) => {
      const lines = readFileSync(file, "utf8").split("\n");
      return lines
        .map((line, i) => ({ line, i }))
        .filter(({ line, i }) => {
          if (!FILL.test(line) || line.trim().startsWith("*")) return false;
          // Indicator dots and progress bars carry no text.
          const spanWindow = [lines[i - 1] ?? "", line, lines[i + 1] ?? ""].join(" ");
          if (/\bdot:\s*["`]/.test(line) || /<span\b[^>]*bg-(?:green|yellow)-500[^>]*\/>/.test(spanWindow)) return false;
          const quoted = line.match(/"[^"]*"|'[^']*'/g);
          if (quoted) {
            const fillLiterals = quoted.filter((lit) => FILL.test(lit));
            const outer = ((lines[i - 1]?.includes("${") ? lines[i - 1] : "") + " " + line).replace(/"[^"]*"|'[^']*'/g, "");
            return fillLiterals.length === 0 || fillLiterals.some((lit) => !DARK_INK.test(lit) || /\btext-white\b/.test(lit)) || /\btext-white\b/.test(outer);
          }
          return !DARK_INK.test(line) || /\btext-white\b/.test(line);
        })
        .map(({ i }) => `${file.replace(process.cwd() + "/", "")}:${i + 1}`);
    });
    expect(bad).toEqual([]);
  });
});
