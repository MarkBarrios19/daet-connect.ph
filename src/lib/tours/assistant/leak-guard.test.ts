import { createLeakGuard, LEAK_NOTICE } from "@/lib/tours/assistant/leak-guard";
import { assistantSystemPrompt } from "@/lib/tours/assistant/prompt";

const prompt = assistantSystemPrompt({ today: "2026-11-05", signedIn: false });

function run(chunks: string[]) {
  let out = "";
  const guard = createLeakGuard(prompt, (d) => (out += d));
  for (const c of chunks) guard(c);
  return out;
}

describe("leak guard", () => {
  it("passes a normal reply through untouched", () => {
    const reply = "Bagasbas Beach is a popular surf spot. Tap View tour to see open dates.";
    expect(run([reply])).toBe(reply);
  });

  it("cuts off a verbatim prompt dump", () => {
    const out = run([prompt.slice(0, 400), prompt.slice(400, 800)]);
    expect(out).toContain(LEAK_NOTICE);
    expect(out.length).toBeLessThan(prompt.slice(0, 800).length + LEAK_NOTICE.length);
  });

  it("catches a leak split across stream chunks", () => {
    const words = prompt.split(" ").slice(20, 60);
    const out = run(words.map((w) => `${w} `));
    expect(out).toContain(LEAK_NOTICE);
  });

  it("emits nothing after a leak", () => {
    const out = run([prompt.slice(0, 300), "more text after", " and more"]);
    expect(out.endsWith(LEAK_NOTICE)).toBe(true);
  });
});
