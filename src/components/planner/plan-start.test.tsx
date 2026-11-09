/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { PlanStart, TRY_ASKING } from "@/components/planner/plan-start";
import { PlanChoices } from "@/components/planner/plan-choices";
import { BookSummary } from "@/components/planner/book-each-trip";
import { TravelChip } from "@/components/planner/plan-panel";
import type { DatedPackage } from "@/lib/tours/itinerary/bookable";

jest.mock("next/image", () => ({ __esModule: true, default: (props: { alt: string; src: string }) => <img alt={props.alt} src={props.src} /> }));
jest.mock("@/components/maps/route-map", () => ({ RouteMap: () => null }));

describe("PlanStart", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("sends what they type, and an example trip when tapped", () => {
    const onSend = jest.fn();
    render(<PlanStart signedIn={false} onSend={onSend} />);
    expect(screen.getByRole("heading", { level: 1, name: "Where to in Daet?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Ask the Daet AI assistant"), { target: { value: "  2 days of beaches  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenLastCalledWith("2 days of beaches");
    fireEvent.click(screen.getByRole("button", { name: new RegExp(TRY_ASKING[1].prompt.replace("?", "\\?")) }));
    expect(onSend).toHaveBeenLastCalledWith(TRY_ASKING[1].prompt);
    expect(screen.getByRole("link", { name: "Recents" })).toHaveAttribute("href", "/login?next=/tours/my-itineraries");
  });

  it("shows the saved dates and group on the chips, and Dates opens the trip form", () => {
    const keyInDays = (days: number) => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() + days);
      return date.toISOString().slice(0, 10);
    };
    const start = keyInDays(30);
    const end = keyInDays(32);
    const label = (key: string) => new Date(`${key}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });
    window.sessionStorage.setItem("daet-trip-context-v1", JSON.stringify({ dates: { start, end }, travelers: { adults: 2, children: [] }, origin: { city: "Manila" } }));
    render(<PlanStart signedIn onSend={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: `${label(start)} to ${label(end)}` }));
    expect(screen.getByRole("button", { name: "2 travelers" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Your trip" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Recents" })).toHaveAttribute("href", "/tours/my-itineraries");
  });
});

describe("PlanChoices", () => {
  it("marks the current pace and sends a new one; getting around is a separate choice", () => {
    const onPace = jest.fn();
    const onTransport = jest.fn();
    render(<PlanChoices pace="normal" transport={undefined} busy={false} status={null} onPace={onPace} onTransport={onTransport} />);
    expect(screen.getByRole("button", { name: "Balanced" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Balanced" }));
    expect(onPace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Relaxed" }));
    expect(onPace).toHaveBeenCalledWith("relaxed");
    expect(screen.getByRole("button", { name: "Decide later" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Motorbike" }));
    expect(onTransport).toHaveBeenCalledWith("motorbike");
  });

  it("disables the pace while a new plan is drafted", () => {
    render(<PlanChoices pace="relaxed" transport={null} busy status="Drafting the plan again at that pace…" onPace={jest.fn()} onTransport={jest.fn()} />);
    expect(screen.getByRole("button", { name: "Packed" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decide later" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Drafting the plan again");
  });
});

describe("TravelChip", () => {
  it("names how they get around", () => {
    const { rerender } = render(<TravelChip minutes={25} />);
    expect(screen.getByText(/By road · about 25 min/)).toBeInTheDocument();
    rerender(<TravelChip minutes={70} transport="tricycle" />);
    expect(screen.getByText(/By tricycle or van · about 1 h 10 min/)).toBeInTheDocument();
  });
});

describe("BookSummary", () => {
  const pkg: DatedPackage = { id: "pkg1", title: "Surf lesson", coverImageUrl: null, matched: ["Bagasbas Beach"], price: { amount: 1200, perPerson: true }, operatorName: "Coast Tours", verified: true, notIncluded: [], date: "2026-11-06" };
  it("lists each tour with the group price, the total and its own Book button", () => {
    render(<BookSummary packages={[pkg, { ...pkg, id: "pkg2", title: "Calaguas day trip", price: { amount: 2400, perPerson: true }, date: "2026-11-07" }]} group={2} canBook />);
    expect(screen.getByText("Total if you book both")).toBeInTheDocument();
    expect(screen.getByText("₱7,200.00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book Surf lesson · ₱2,400.00" })).toHaveAttribute("href", "/tours/packages/pkg1/book?date=2026-11-06&pax=2");
    expect(screen.getByText(/2 travelers · Sat, Nov 7/)).toBeInTheDocument();
  });
});
