/** @jest-environment jsdom */

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { PlanPanel, type PanelActions } from "@/components/planner/plan-panel";
import { moveInOrders } from "@/components/planner/plan-editor";
import type { ItineraryResult } from "@/lib/tours/assistant/plan-tool";

jest.mock("@/components/maps/route-map", () => ({ RouteMap: ({ title }: { title: string }) => <div data-testid="map">{title}</div> }));

const visit = (id: string, name: string, start: number, cost = 0, hoursConfirmed = true) => ({ kind: "visit" as const, attractionId: id, name, start, end: start + 60, travelMinutes: 10, cost, hoursConfirmed });
const itinerary: ItineraryResult = {
  plan: {
    days: [
      { date: "2026-11-10", blocks: [visit("bagasbas", "Bagasbas Beach", 480), { kind: "lunch", name: "Lunch break", start: 720, end: 780, travelMinutes: 0, cost: 0 }] },
      { date: "2026-11-11", blocks: [visit("park", "Daet Park", 540, 60, false)] },
    ],
    totals: { cost: 60, travelMinutes: 20, visits: 2 },
  },
  input: { startDate: "2026-11-10", days: 2, budgetPerDay: 500, interests: [], pace: "normal", groupSize: 3, dayStart: "08:00", dayEnd: "18:00" },
  stops: [
    { id: "bagasbas", name: "Bagasbas Beach", category: "beach", lat: 14.13, lng: 122.98, fee: null },
    { id: "park", name: "Daet Park", category: "park", lat: 14.11, lng: 122.95, fee: 20 },
  ],
  packages: [{ id: "pkg1", title: "Bagasbas Surf Lesson", coverImageUrl: null, matched: ["Bagasbas Beach"], price: { amount: 800, perPerson: true }, operatorName: "Coast Tours", verified: true, notIncluded: ["Lunch"] }],
  travelers: { adults: 2, children: [6] },
  gettingThere: null,
  generatedAt: "2026-11-05T00:00:00.000Z",
};
const noop: PanelActions = { regenerate: jest.fn(), swap: jest.fn(), remove: jest.fn(), change: jest.fn() };

describe("PlanPanel", () => {
  it("shows one day at a time with day pills, and all days on request", () => {
    render(<PlanPanel itinerary={itinerary} onChange={jest.fn()} onAsk={jest.fn()} actions={noop} />);
    expect(screen.getByRole("heading", { name: "Your 2-day Daet plan" })).toBeInTheDocument();
    expect(screen.getByText("Nov 10 to Nov 11 · 3 travelers · Balanced pace")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: /Bagasbas Beach$/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 4, name: /Daet Park$/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Day 2,/ }));
    expect(screen.getByRole("heading", { level: 4, name: /Daet Park$/ })).toBeInTheDocument();
    expect(screen.getByText("Opening hours not confirmed")).toBeInTheDocument();
    expect(screen.getByText(/₱60.00 for your group/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All days" }));
    expect(screen.getByRole("heading", { level: 4, name: /Bagasbas Beach$/ })).toBeInTheDocument();
    expect(screen.getByTestId("map")).toHaveTextContent("Map of all days");
  });

  it("shows the bookable tour with its database price for the group", () => {
    render(<PlanPanel itinerary={itinerary} onChange={jest.fn()} onAsk={jest.fn()} actions={noop} />);
    expect(screen.getByText("Verified by the Tourism Office")).toBeInTheDocument();
    expect(screen.getByText(/from ₱800.00 per person · about ₱2,400.00 for 3/)).toBeInTheDocument();
    expect(screen.getByText("Not included: Lunch.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See details" })).toHaveAttribute("href", "/tours/packages/pkg1");
    // The tour sits inside the stop it passes, as on the boards.
    expect(screen.getByRole("article", { name: undefined }).textContent).toContain("Bagasbas Surf Lesson");
  });

  it("asks the chat about a stop, and swaps through the action", async () => {
    const onAsk = jest.fn();
    const onChange = jest.fn();
    const swapped = { ...itinerary.plan, days: [{ date: "2026-11-10", blocks: [visit("rizal", "First Rizal Monument", 480)] }, itinerary.plan.days[1]] };
    const actions: PanelActions = { ...noop, swap: jest.fn().mockResolvedValue({ ok: true, plan: swapped, stops: itinerary.stops, packages: [] }) };
    render(<PlanPanel itinerary={itinerary} onChange={onChange} onAsk={onAsk} actions={actions} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask about this place" }));
    expect(onAsk).toHaveBeenCalledWith("Tell me about Bagasbas Beach");
    fireEvent.click(screen.getByRole("button", { name: "Options for Bagasbas Beach" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Swap this stop" })));
    expect(actions.swap).toHaveBeenCalledWith(itinerary, 0, "bagasbas");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ plan: swapped, packages: [] }));
    expect(screen.getByRole("status")).toHaveTextContent("Swapped Bagasbas Beach.");
  });

  it("shows the action's message when nothing fits", async () => {
    const actions: PanelActions = { ...noop, remove: jest.fn(), swap: jest.fn().mockResolvedValue({ ok: false, message: "No other place fits that time. Try removing it instead." }) };
    const onChange = jest.fn();
    render(<PlanPanel itinerary={itinerary} onChange={onChange} onAsk={jest.fn()} actions={actions} />);
    fireEvent.click(screen.getByRole("button", { name: "Options for Bagasbas Beach" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Swap this stop" })));
    expect(screen.getByRole("status")).toHaveTextContent(/No other place fits/);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("runs a follow-up chip's change once and shows the planner's reply", async () => {
    const relaxed = { ...itinerary.input, pace: "relaxed" };
    const actions: PanelActions = { ...noop, change: jest.fn().mockResolvedValue({ ok: true, plan: itinerary.plan, stops: itinerary.stops, packages: [], reply: "Made it more relaxed.", input: relaxed }) };
    const onChange = jest.fn();
    const request = { text: "Make it more relaxed", id: 1 };
    const { rerender } = render(<PlanPanel itinerary={itinerary} onChange={onChange} onAsk={jest.fn()} actions={actions} request={request} />);
    await act(async () => {});
    rerender(<PlanPanel itinerary={itinerary} onChange={onChange} onAsk={jest.fn()} actions={actions} request={request} />);
    await act(async () => {});
    expect(actions.change).toHaveBeenCalledTimes(1);
    expect(actions.change).toHaveBeenCalledWith(itinerary, "Make it more relaxed");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ input: relaxed }));
    expect(screen.getByRole("status")).toHaveTextContent("Made it more relaxed.");
  });

  it("starts day 1 with getting there, always labelled as an estimate", () => {
    const card = { type: "transport" as const, title: "Manila to Daet", options: [{ time: "8–9 h", legs: [{ mode: "Bus", from: "Manila (PITX)", to: "Daet", fare: "₱752.00–₱950.00 per person", time: "8–9 h", note: null, verified: false, boardHref: "https://maps.example" }] }] };
    render(<PlanPanel itinerary={{ ...itinerary, gettingThere: { from: "Manila", card, checkedOn: "2026-11-05" } }} onChange={jest.fn()} onAsk={jest.fn()} actions={noop} />);
    expect(screen.getByText("Getting there from Manila")).toBeInTheDocument();
    expect(screen.getByText(/One listed way, about 8–9 h/)).toBeInTheDocument();
    expect(screen.getByText(/Estimate\. Fares change; confirm with the driver or operator \(listed fares checked 2026-11-05\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByText("Bus: Manila (PITX) to Daet")).toBeInTheDocument();
  });

  it("says plainly when no fares are listed from their city", () => {
    render(<PlanPanel itinerary={{ ...itinerary, gettingThere: { from: "Davao", card: null, checkedOn: null } }} onChange={jest.fn()} onAsk={jest.fn()} actions={noop} />);
    expect(screen.getByText(/No fares listed from Davao yet/)).toBeInTheDocument();
  });

  it("books each trip on its plan day for the whole group, with a total", () => {
    const second = { ...itinerary.packages[0], id: "pkg2", title: "Daet Heritage Walk", matched: ["Daet Park"], price: { amount: 1000, perPerson: false } };
    render(<PlanPanel itinerary={{ ...itinerary, packages: [...itinerary.packages, second] }} canBook onChange={jest.fn()} onAsk={jest.fn()} actions={noop} />);
    fireEvent.click(screen.getByRole("button", { name: "All days" }));
    const books = screen.getAllByRole("link", { name: "Book this trip" });
    expect(books[0]).toHaveAttribute("href", "/tours/packages/pkg1/book?date=2026-11-10&pax=3");
    expect(books[1]).toHaveAttribute("href", "/tours/packages/pkg2/book?date=2026-11-11&pax=3");
    expect(screen.getByText(/About ₱3,400.00 for all 2 bookable trips\. Each one is booked and paid separately\./)).toBeInTheDocument();
  });

  it("closes the stop menu with Escape and returns focus to its button", () => {
    render(<PlanPanel itinerary={itinerary} onChange={jest.fn()} onAsk={jest.fn()} actions={noop} />);
    const button = screen.getByRole("button", { name: "Options for Bagasbas Beach" });
    fireEvent.click(button);
    const menu = screen.getByRole("group", { name: "Options for Bagasbas Beach" });
    expect(within(menu).getAllByRole("button").map((b) => b.textContent)).toEqual(["Ask about this place", "Find experiences nearby", "Swap this stop", "Remove from this day", "Cancel"]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Options for Bagasbas Beach" })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  describe("edit mode", () => {
    const editable = (overrides: Partial<PanelActions> = {}): PanelActions => ({
      ...noop,
      reorder: jest.fn().mockResolvedValue({ ok: true, plan: itinerary.plan, stops: itinerary.stops, packages: [] }),
      add: jest.fn(),
      choices: jest.fn().mockResolvedValue({ ok: true, choices: [{ id: "falls", name: "Mananap Falls", category: "nature", fee: 50, photoUrl: null }] }),
      ...overrides,
    });

    it("has no Edit button without the edit actions", () => {
      render(<PlanPanel itinerary={itinerary} onChange={jest.fn()} onAsk={jest.fn()} actions={noop} />);
      expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    });

    it("shows drag handles and remove buttons, and Cancel puts the plan back", () => {
      const onChange = jest.fn();
      render(<PlanPanel itinerary={itinerary} onChange={onChange} onAsk={jest.fn()} actions={editable()} />);
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      expect(screen.getByText(/^Editing · /)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Drag to reorder Bagasbas Beach" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Remove Bagasbas Beach" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Regenerate" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onChange).toHaveBeenCalledWith(itinerary);
      expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    });

    it("removes a stop with Undo", async () => {
      const without = { ...itinerary.plan, days: [{ date: "2026-11-10", blocks: [] }, itinerary.plan.days[1]] };
      const onChange = jest.fn();
      const actions = editable({ remove: jest.fn().mockResolvedValue({ ok: true, plan: without, stops: itinerary.stops, packages: [] }) });
      render(<PlanPanel itinerary={itinerary} onChange={onChange} onAsk={jest.fn()} actions={actions} />);
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Remove Bagasbas Beach" })));
      expect(actions.remove).toHaveBeenCalledWith(itinerary, 0, "bagasbas");
      expect(screen.getByText("Bagasbas Beach removed from your trip")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      expect(onChange).toHaveBeenLastCalledWith(itinerary);
    });

    it("adds a suggested stop to the day", async () => {
      const actions = editable({ add: jest.fn().mockResolvedValue({ ok: true, plan: itinerary.plan, stops: itinerary.stops, packages: [] }) });
      render(<PlanPanel itinerary={itinerary} onChange={jest.fn()} onAsk={jest.fn()} actions={actions} />);
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add a stop" })));
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add Mananap Falls to Day 1" })));
      expect(actions.add).toHaveBeenCalledWith(itinerary, 0, "falls");
    });
  });
});

describe("moveInOrders", () => {
  const orders = [["a", "b", "c"], ["d"]];
  it("moves a stop within a day onto another stop's place", () => {
    expect(moveInOrders(orders, "c", "a")).toEqual([["c", "a", "b"], ["d"]]);
    expect(moveInOrders(orders, "a", "c")).toEqual([["b", "c", "a"], ["d"]]);
  });
  it("moves a stop to another day, before the stop it lands on or at the end of the list", () => {
    expect(moveInOrders(orders, "b", "d")).toEqual([["a", "c"], ["b", "d"]]);
    expect(moveInOrders(orders, "b", "day-1")).toEqual([["a", "c"], ["d", "b"]]);
  });
  it("leaves the plan as it was for unknown stops", () => {
    expect(moveInOrders(orders, "x", "a")).toBe(orders);
  });
});
