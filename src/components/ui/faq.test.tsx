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
    // The whole row is the target, so it is comfortably past 44px tall.
    expect(summaries[0].className).toContain("min-h-14");
  });

  it("swaps the marker from plus to close as it opens", () => {
    const { container } = render(<FaqList items={HOME_FAQ.slice(0, 1)} />);
    const icons = Array.from(container.querySelectorAll("summary svg"));

    expect(icons).toHaveLength(2);
    expect(icons[0].getAttribute("class")).toContain("group-open:hidden");
    expect(icons[1].getAttribute("class")).toContain("group-open:block");
    // A circle, not a square: the sketch's quiet marker.
    expect(container.querySelector("summary span")?.className).toContain("rounded-full");
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
