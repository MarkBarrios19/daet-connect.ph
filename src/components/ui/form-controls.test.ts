import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import baseline from "./form-controls.baseline.json";

/**
 * Form controls go through the Field kit (src/components/ui/field.tsx): it ties
 * the label, hint and error to the control, so screen readers name it and read
 * its errors. A file may not hold more raw <input>, <select> or <textarea>
 * than form-controls.baseline.json records. Convert a file, then lower its count
 * (delete the entry when it reaches 0). Wrapping-label forms keep their count.
 */
const RAW = /<(input|select|textarea)\b/g;
const counts: Record<string, number> = {};
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith(".tsx") && !name.endsWith(".test.tsx") && name !== "field.tsx") {
      const n = (readFileSync(path, "utf8").match(RAW) ?? []).length;
      if (n) counts[path.replace(process.cwd() + "/", "")] = n;
    }
  }
};
walk(join(process.cwd(), "src"));

describe("form controls", () => {
  it("adds no raw controls outside the Field kit", () => {
    const base = baseline as Record<string, number>;
    const over = Object.entries(counts)
      .filter(([file, n]) => n > (base[file] ?? 0))
      .map(([file, n]) => `${file}: ${n} raw controls, allowed ${base[file] ?? 0}. Use Field/Input/Select/Textarea from components/ui/field.tsx.`);
    expect(over).toEqual([]);
  });
});
