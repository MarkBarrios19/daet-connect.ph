/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QuestionsCard } from "@/components/assistant/questions-card";
import { pageFromPath, sampleDates } from "@/lib/tours/assistant/context";

const TODAY = "2026-11-05";
const fill = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("sample plans (decision 35)", () => {
  it("stands in a weekend at least a week away, for the asked number of days", () => {
    expect(sampleDates("2026-11-05", 2)).toEqual({ start: "2026-11-14", end: "2026-11-15" });
    expect(sampleDates("2026-11-05", 9).end).toBe("2026-11-18");
  });

  it("No dates yet sends a sample trip without asking for dates", () => {
    const onSubmit = jest.fn();
    render(<QuestionsCard prefill={null} today={TODAY} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByLabelText(/No dates yet/));
    expect(screen.queryByLabelText("First day")).toBeNull();
    fill("How many days?", "3");
    fireEvent.click(screen.getByRole("button", { name: "Manila" }));
    fireEvent.click(screen.getByRole("button", { name: "Draft my plan" }));
    expect(onSubmit).toHaveBeenCalledWith({ dates: { start: "2026-11-14", end: "2026-11-16" }, travelers: { adults: 2, children: [] }, origin: { city: "Manila" }, sample: true });
  });
});

describe("QuestionsCard", () => {
  it("asks for dates, travellers and origin, and sends them together", () => {
    const onSubmit = jest.fn();
    render(<QuestionsCard prefill={null} today={TODAY} onSubmit={onSubmit} />);
    fill("First day", "2026-11-10");
    fill("Last day", "2026-11-12");
    fireEvent.click(screen.getByRole("button", { name: "More children" }));
    fill("Child 1 age", "6");
    fireEvent.click(screen.getByRole("button", { name: "Manila" }));
    fireEvent.click(screen.getByRole("button", { name: "Draft my plan" }));
    expect(onSubmit).toHaveBeenCalledWith({ dates: { start: "2026-11-10", end: "2026-11-12" }, travelers: { adults: 2, children: [6] }, origin: { city: "Manila" } });
  });

  it("will not draft without each child's age, a valid range, or an origin", () => {
    const onSubmit = jest.fn();
    render(<QuestionsCard prefill={null} today={TODAY} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Draft my plan" }));
    expect(screen.getByText("Pick your first and last day.")).toBeInTheDocument();
    expect(screen.getByText(/Choose a city/)).toBeInTheDocument();
    fill("First day", "2026-11-10");
    fill("Last day", "2026-11-20");
    fireEvent.click(screen.getByRole("button", { name: "More children" }));
    fireEvent.click(screen.getByRole("button", { name: "Draft my plan" }));
    expect(screen.getByText("Plans cover up to 5 days.")).toBeInTheDocument();
    expect(screen.getByText(/Add each child's age/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("uses typed text over a chip, and starts from what is already known", () => {
    const onSubmit = jest.fn();
    render(<QuestionsCard prefill={{ dates: { start: "2026-11-10", end: "2026-11-11" }, travelers: { adults: 3, children: [] } }} today={TODAY} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Cebu" }));
    fill("Somewhere else", "Davao");
    expect(screen.getByRole("button", { name: "Cebu" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Draft my plan" }));
    expect(onSubmit).toHaveBeenCalledWith({ dates: { start: "2026-11-10", end: "2026-11-11" }, travelers: { adults: 3, children: [] }, origin: { city: "Davao" } });
  });
});

describe("pageFromPath", () => {
  it("knows package and attraction pages only", () => {
    expect(pageFromPath("/tours/packages/abc-123")).toEqual({ kind: "package", id: "abc-123" });
    expect(pageFromPath("/tours/attractions/bagasbas-beach/")).toEqual({ kind: "attraction", id: "bagasbas-beach" });
    expect(pageFromPath("/tours/plan")).toBeNull();
    expect(pageFromPath("/tours/packages/abc/edit")).toBeNull();
  });
});
