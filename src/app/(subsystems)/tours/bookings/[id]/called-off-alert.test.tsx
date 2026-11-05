/** @jest-environment jsdom */

import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { CalledOffAlert } from "./called-off-alert";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const base = {
  bookingId: "b1",
  title: "Calaguas Island Hopping",
  tourDate: "2026-11-10",
  reason: "Rough sea. The Coast Guard stopped boat trips.",
  minDate: "2026-11-06",
  paid: 3000,
  operatorPhone: "0917 123 4567",
};

describe("CalledOffAlert", () => {
  beforeEach(() => refresh.mockClear());

  it("explains the call-off and offers a new date, a refund, and a call", () => {
    render(<CalledOffAlert {...base} openDates={[]} actions={{ reschedule: jest.fn(), refund: jest.fn() }} />);
    expect(screen.getByRole("heading", { name: "Your trip on Tue, Nov 10 is called off" })).toBeInTheDocument();
    expect(screen.getByText(/Rough sea\. The Coast Guard stopped boat trips\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get a full refund" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Call the operator" })).toHaveAttribute("href", "tel:09171234567");
    fireEvent.click(screen.getByRole("button", { name: "Pick a new date" }));
    expect(screen.getByText(/No open dates with enough seats yet/)).toBeInTheDocument();
  });

  it("moves the trip to an open date with seats", async () => {
    const reschedule = jest.fn().mockResolvedValue({ ok: true });
    const openDates = [{ date: "2026-11-12", seatsLeft: 4, full: false }, { date: "2026-11-14", seatsLeft: 1, full: false }];
    render(<CalledOffAlert {...base} openDates={openDates} actions={{ reschedule, refund: jest.fn() }} />);
    fireEvent.click(screen.getByRole("button", { name: "Pick a new date" }));
    expect(screen.getByRole("option", { name: "Thu, Nov 12 · 4 seats left" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("New date"), { target: { value: "2026-11-14" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Move my trip to this date" })));
    expect(reschedule).toHaveBeenCalledWith("b1", "2026-11-14", "2026-11-10");
    expect(refresh).toHaveBeenCalled();
  });

  it("asks before cancelling for a refund, and shows the database's reason when it fails", async () => {
    const refund = jest.fn().mockResolvedValue({ ok: false, error: "This booking has no called-off trip to refund." });
    render(<CalledOffAlert {...base} openDates={null} actions={{ reschedule: jest.fn(), refund }} />);
    fireEvent.click(screen.getByRole("button", { name: "Get a full refund" }));
    expect(screen.getByText(/the operator sends back everything you paid/)).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel and refund" })));
    expect(refund).toHaveBeenCalledWith("b1");
    expect(screen.getByText("This booking has no called-off trip to refund.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says plainly when nothing was paid", () => {
    render(<CalledOffAlert {...base} paid={0} openDates={null} actions={{ reschedule: jest.fn(), refund: jest.fn() }} />);
    expect(screen.getByRole("button", { name: "Cancel this trip" })).toBeInTheDocument();
    expect(screen.getByText(/you haven't paid anything yet/)).toBeInTheDocument();
  });
});
