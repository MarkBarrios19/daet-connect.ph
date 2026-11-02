import { FAQS } from "@/lib/tours/assistant/knowledge";
import { FREE_CANCELLATION_HOURS } from "@/lib/tours/cancellation";
import { FAQ_ENTRIES, FAQ_GROUPS, HOME_FAQ, faqGroupsWithAnswers, faqJsonLd, resolveFaq } from "./faq";

/**
 * The page must not be a second, quieter copy of the assistant's answers: every
 * question the knowledge base can answer has to be on it, pulled from there.
 */
describe("FAQ content", () => {
  it("uses every answer the assistant has", () => {
    const linked = new Set(FAQ_ENTRIES.map((entry) => entry.faqId).filter((id): id is string => Boolean(id)));
    expect(FAQS.map((faq) => faq.id).filter((id) => !linked.has(id))).toEqual([]);
  });

  it("asks questions, in a stable order, with hash-safe ids", () => {
    const ids = FAQ_ENTRIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => !/^[a-z0-9-]+$/.test(id))).toEqual([]);
    expect(FAQ_ENTRIES.filter((entry) => !entry.question.trim().endsWith("?"))).toEqual([]);
    expect(FAQ_GROUPS.map((group) => group.id)).toEqual(["before", "paying", "getting", "day", "people"]);
  });

  it("says 48 hours because the app says 48 hours", () => {
    const cancel = resolveFaq(FAQ_ENTRIES.find((entry) => entry.id === "cancel")!);
    expect(cancel.answer).toContain(`${FREE_CANCELLATION_HOURS} hours`);
  });

  it("leaves nothing without an answer or a visible note", () => {
    for (const entry of FAQ_ENTRIES) {
      const resolved = resolveFaq(entry);
      expect(Boolean(resolved.answer) || Boolean(resolved.todo)).toBe(true);
      if (!resolved.answer) expect(resolved.todo).not.toBe("");
    }
  });

  it("fails loudly when an entry points at an answer that does not exist", () => {
    expect(() => resolveFaq({ id: "ghost", question: "?", faqId: "no-such-answer" })).toThrow(/no-such-answer/);
  });

  it("shows six answered questions on the home page", () => {
    expect(HOME_FAQ).toHaveLength(6);
    expect(HOME_FAQ.filter((item) => !item.answer)).toEqual([]);
  });

  it("puts only the page's answered questions into the schema", () => {
    const groups = faqGroupsWithAnswers();
    const jsonLd = faqJsonLd(groups.flatMap((group) => group.items));

    expect(jsonLd["@type"]).toBe("FAQPage");
    const answered = FAQ_ENTRIES.map(resolveFaq).filter((item) => item.answer);
    expect(jsonLd.mainEntity).toHaveLength(answered.length);

    // The markup must not say more than the page does.
    for (const question of jsonLd.mainEntity) {
      const item = answered.find((candidate) => candidate.question === question.name);
      expect(item).toBeDefined();
      expect(question.acceptedAnswer.text).toBe(item!.answer);
    }
  });

  it("links stay inside the site", () => {
    const hrefs = FAQ_ENTRIES.map(resolveFaq).flatMap((item) => item.links.map((link) => link.href));
    expect(hrefs.filter((href) => !href.startsWith("/"))).toEqual([]);
  });
});
