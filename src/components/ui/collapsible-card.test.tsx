/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { CollapsibleCard } from "./collapsible-card";

describe("CollapsibleCard", () => {
  it("starts closed, with the title as a heading inside the summary", () => {
    const { container } = render(<CollapsibleCard title="Messages">Body</CollapsibleCard>);
    const details = container.querySelector("details") as HTMLDetailsElement;

    expect(details).not.toHaveAttribute("open");
    const heading = screen.getByRole("heading", { level: 2, name: "Messages" });
    expect(heading.closest("summary")).not.toBeNull();
    expect(container.querySelector("summary svg")).not.toBeNull();
  });

  it("keeps the body in the HTML whether it is open or not", () => {
    render(<CollapsibleCard title="Messages">No unread messages.</CollapsibleCard>);

    // Find-in-page still reaches a closed <details>.
    expect(screen.getByText("No unread messages.")).toBeInTheDocument();
  });

  it("renders the header action outside the summary, so it is never a nested toggle", () => {
    const { container } = render(
      <CollapsibleCard title="Saved trip plans" action={<a href="/tours/my-itineraries">All plans</a>}>
        Body
      </CollapsibleCard>,
    );
    const link = screen.getByRole("link", { name: "All plans" });

    expect(link.closest("summary")).toBeNull();
    // The summary still keeps clear of the absolutely positioned action.
    expect(container.querySelector("summary")?.className).toContain("pr-36");
  });

  it("shows the hint in the header row", () => {
    const { container } = render(
      <CollapsibleCard title="Messages" hint="2 unread">
        Body
      </CollapsibleCard>,
    );
    const hint = screen.getByText("2 unread");

    expect(hint.closest("summary")).not.toBeNull();
    expect(container.querySelector("[data-collapsible-card]")).not.toBeNull();
  });

  it("opens by default only when defaultOpen is set", () => {
    const { container } = render(
      <CollapsibleCard title="Messages" defaultOpen>
        Body
      </CollapsibleCard>,
    );

    expect(container.querySelector("details")).toHaveAttribute("open");
  });
});
