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

  it("has no eyebrow labels and no rounded-3xl cards", () => {
    expect(offenders((line) => /\beyebrow\b|rounded-3xl/.test(line) && !line.trim().startsWith("*"))).toEqual([]);
  });
});
