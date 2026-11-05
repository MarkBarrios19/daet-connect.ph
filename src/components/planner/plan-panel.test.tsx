/** @jest-environment jsdom */

import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { PlanPanel, type PanelActions } from "@/components/planner/plan-panel";
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
  generatedAt: "2026-11-05T00:00:00.000Z",
};
const noop: PanelActions = { regenerate: jest.fn(), swap: jest.fn(), remove: jest.fn(), change: jest.fn() };

describe("PlanPanel", () => {
  it("shows one day at a time with day pills, and all days on request", () => {
    render(<PlanPanel itinerary={itinerary} onChange={jest.fn()} onAsk={jest.fn()} actions={noop} />);
    expect(screen.getByRole("heading", { name: "Your 2-day plan" })).toBeInTheDocument();
    expect(screen.getByText("Bagasbas Beach")).toBeInTheDocument();
    expect(screen.queryByText("Daet Park")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Day 2/ }));
    expect(screen.getByText("Daet Park")).toBeInTheDocument();
    expect(screen.getByText("Opening hours not confirmed")).toBeInTheDocument();
    expect(screen.getByText(/₱60.00 for your group/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All days" }));
    expect(screen.getByText("Bagasbas Beach")).toBeInTheDocument();
    expect(screen.getByTestId("map")).toHaveTextContent("Map of all days");
  });

  it("shows the bookable tour with its database price for the group", () => {
    render(<PlanPanel itinerary={itinerary} onChange={jest.fn()} onAsk={jest.fn()} actions={noop} />);
    expect(screen.getByText("Verified by the Tourism Office")).toBeInTheDocument();
    expect(screen.getByText(/from ₱800.00 per person · about ₱2,400.00 for 3/)).toBeInTheDocument();
    expect(screen.getByText("Not included: Lunch")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View tour" })).toHaveAttribute("href", "/tours/packages/pkg1");
  });

  it("asks the chat about a stop, and swaps through the action", async () => {
    const onAsk = jest.fn();
    const onChange = jest.fn();
    const swapped = { ...itinerary.plan, days: [{ date: "2026-11-10", blocks: [visit("rizal", "First Rizal Monument", 480)] }, itinerary.plan.days[1]] };
    const actions: PanelActions = { ...noop, swap: jest.fn().mockResolvedValue({ ok: true, plan: swapped, stops: itinerary.stops, packages: [] }) };
    render(<PlanPanel itinerary={itinerary} onChange={onChange} onAsk={onAsk} actions={actions} />);
    fireEvent.click(screen.getByRole("button", { name: "Options for Bagasbas Beach" }));
    fireEvent.click(screen.getByRole("button", { name: "Ask about this place" }));
    expect(onAsk).toHaveBeenCalledWith("Tell me about Bagasbas Beach");
    fireEvent.click(screen.getByRole("button", { name: "Options for Bagasbas Beach" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Swap stop" })));
    expect(actions.swap).toHaveBeenCalledWith(itinerary, 0, "bagasbas");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ plan: swapped, packages: [] }));
    expect(screen.getByRole("status")).toHaveTextContent("Swapped Bagasbas Beach.");
  });

  it("shows the action's message when nothing fits", async () => {
    const actions: PanelActions = { ...noop, remove: jest.fn(), swap: jest.fn().mockResolvedValue({ ok: false, message: "No other place fits that time. Try removing it instead." }) };
    const onChange = jest.fn();
    render(<PlanPanel itinerary={itinerary} onChange={onChange} onAsk={jest.fn()} actions={actions} />);
    fireEvent.click(screen.getByRole("button", { name: "Options for Bagasbas Beach" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Swap stop" })));
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
});
