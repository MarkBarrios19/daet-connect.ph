/** @jest-environment jsdom */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ProcessRefundDialog } from "./process-refund-dialog";
import { getOnlineRefundAvailability, processRefund } from "./board-actions";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("./board-actions", () => ({ getOnlineRefundAvailability: jest.fn(), processRefund: jest.fn() }));

const props = {
  open: true, onClose: jest.fn(), bookingId: "booking", reference: "BK-TEST",
  packageTitle: "Tour", guestName: "Guest", refundable: 600,
  paymongoConfigured: true, paymongoLive: false, openBooking: false,
};

it("checks the actual PayMongo balance and defaults to the lower available amount", async () => {
  jest.mocked(getOnlineRefundAvailability).mockResolvedValue({ available: 350 });
  render(<ProcessRefundDialog {...props} />);
  expect(await screen.findByText("₱350.00 available through PayMongo.")).toBeInTheDocument();
  expect(screen.getByLabelText(/Amount \(₱\)/)).toHaveValue("350.00");
  fireEvent.change(screen.getByLabelText(/Reason for refund/), { target: { value: "guest" } });
  expect(screen.getByRole("button", { name: "Confirm PayMongo Refund" })).toBeEnabled();
  fireEvent.change(screen.getByLabelText(/Amount \(₱\)/), { target: { value: "600.00" } });
  expect(screen.getByRole("button", { name: "Confirm PayMongo Refund" })).toBeDisabled();
  expect(processRefund).not.toHaveBeenCalled();
});

it("blocks automatic refunds when the provider and ledger disagree", async () => {
  jest.mocked(getOnlineRefundAvailability).mockResolvedValue({ available: 0, error: "Refund history differs. Reconcile before retrying." });
  render(<ProcessRefundDialog {...props} />);
  expect(await screen.findByText(/Refund history differs/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "PayMongo (Auto)" })).toBeDisabled();
  expect(screen.queryByText(/Up to ₱0.00 online/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Reason for refund/), { target: { value: "guest" } });
  expect(screen.getByRole("button", { name: "Confirm PayMongo Refund" })).toBeDisabled();
});

it("defaults to manual when no online balance remains", async () => {
  jest.mocked(getOnlineRefundAvailability).mockResolvedValue({ available: 0 });
  render(<ProcessRefundDialog {...props} />);
  expect(await screen.findByRole("button", { name: "Record Manual Refund" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "PayMongo (Auto)" })).toBeDisabled();
});


it("a late availability response does not change a manual refund amount", async () => {
  let resolve!: (value: { available: number }) => void;
  jest.mocked(getOnlineRefundAvailability).mockReturnValue(new Promise((r) => { resolve = r; }));
  render(<ProcessRefundDialog {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Manual GCash" }));
  await act(async () => resolve({ available: 350 }));
  expect(screen.getByLabelText(/Amount \(₱\)/)).toHaveValue("600.00");
  expect(screen.getByRole("button", { name: "Manual GCash" })).toHaveAttribute("aria-pressed", "true");
});
