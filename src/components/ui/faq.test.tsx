/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { HOME_FAQ, faqGroupsWithAnswers } from "@/lib/faq";
import { FaqList } from "./faq";

const group = (id: string) => faqGroupsWithAnswers().find((candidate) => candidate.id === id)!;

describe("FaqList", () => {
  it("renders one native disclosure per question, all in one group", () => {
    const { container } = render(<FaqList items={group("paying").items} />);
    const details = Array.from(container.querySelectorAll("details"));

    expect(details).toHaveLength(5);
    expect(details.map((element) => element.id)).toEqual(["pay", "cancel", "status", "ticket", "rewards"]);
    expect(details.filter((element) => element.getAttribute("name") !== "faq")).toEqual([]);
    // Closed by default: the visitor chooses what to read.
    expect(details.filter((element) => element.hasAttribute("open"))).toEqual([]);
  });

  it("keeps the answer in the HTML whether it is open or not", () => {
    render(<FaqList items={group("paying").items} />);
    // Find-in-page and search engines read a closed `<details>` too.
    expect(screen.getByText(/tap Pay to pay online with GCash, Maya or a card/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp("48 hours"))).toBeInTheDocument();
  });

  it("asks the question as a heading, inside the summary", () => {
    const { container } = render(<FaqList items={HOME_FAQ} />);
    const summaries = Array.from(container.querySelectorAll("summary"));

    expect(summaries).toHaveLength(6);
    expect(summaries.map((summary) => summary.querySelector("h3")?.textContent)).toEqual(HOME_FAQ.map((item) => item.question));
    // The whole row is the target, and 20px of padding either side puts it well
    // past 44px tall.
    expect(summaries[0].className).toContain("py-5");
  });

  it("marks each row with one chevron, and turns it as the row opens", () => {
    const { container } = render(<FaqList items={HOME_FAQ.slice(0, 1)} />);
    const details = container.querySelector("details") as HTMLElement;
    const icons = Array.from(container.querySelectorAll("summary svg"));

    // One icon, not the plus/close pair the card used to swap: the reference
    // (image-46) turns a single chevron over.
    expect(icons).toHaveLength(1);
    expect(icons[0].tagName.toLowerCase()).toBe("svg");
    const marker = container.querySelector("summary span") as HTMLElement;
    expect(marker.className).toContain("group-open:rotate-180");
    expect(marker.className).toContain("transition-transform");

    // A hairline row, not a card: the rule is on the element itself, so the
    // questions read as one list.
    expect(details.className).toContain("border-b");
    expect(details.className).toContain("border-hairline");
    expect(details).toHaveAttribute("data-faq");
  });

  it("shows a placeholder where the Tourism Office still owes an answer", () => {
    render(<FaqList items={group("day").items} />);
    expect(screen.getByText(/^\[placeholder: the meeting point and start time/)).toBeInTheDocument();
  });

  it("follows each answer with its links", () => {
    render(<FaqList items={group("people").items} />);
    expect(screen.getByRole("link", { name: "Apply as an operator" })).toHaveAttribute("href", "/tours/operator/register");
    expect(screen.getByRole("link", { name: "Apply as a guide" })).toHaveAttribute("href", "/tours/guide/register");
  });

  it("steps down to a level-2 heading when the list sits under a page title", () => {
    const { container } = render(<FaqList items={HOME_FAQ.slice(0, 1)} headingLevel={2} />);
    expect(container.querySelector("summary h2")).not.toBeNull();
    expect(container.querySelector("summary h3")).toBeNull();
  });
});
