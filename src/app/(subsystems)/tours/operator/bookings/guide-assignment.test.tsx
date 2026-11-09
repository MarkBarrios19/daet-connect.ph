/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { GuideAssignment } from "./guide-assignment";
import { assignGuideToBooking, setGuideNotNeeded } from "./actions";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}));

jest.mock("./actions", () => ({
  assignGuideToBooking: jest.fn(),
  setGuideNotNeeded: jest.fn(),
}));

// The provider's confirm dialog is a browser <dialog>; the question it asks is
// what matters here, so answer it directly.
const mockConfirm = jest.fn();
jest.mock("@/components/ui/feedback", () => ({
  useFeedback: () => ({ toast: jest.fn(), confirm: mockConfirm }),
}));

const mockAssign = assignGuideToBooking as jest.MockedFunction<typeof assignGuideToBooking>;
const mockSetGuideNotNeeded = setGuideNotNeeded as jest.MockedFunction<typeof setGuideNotNeeded>;

const bookingId = "4d2f0c2e-9d43-4f2a-9c9e-2a1b3c4d5e6f";
const guides = [
  { id: "g1", full_name: "Bianca Zabala", contact_phone: "09170000001" },
  { id: "g2", full_name: "Hazley Esplana", contact_phone: "09170000002" },
];

function renderAssignment(props: Partial<React.ComponentProps<typeof GuideAssignment>> = {}) {
  return render(
    <GuideAssignment bookingId={bookingId} currentGuideId={null} availableGuides={guides} {...props} />,
  );
}

beforeEach(() => {
  mockAssign.mockReset().mockResolvedValue({ success: true });
  mockSetGuideNotNeeded.mockReset().mockResolvedValue({ success: true });
  mockConfirm.mockReset().mockResolvedValue(true);
});

describe("GuideAssignment: a guest who doesn't need a guide", () => {
  it("records the request with a note, after a confirmation", async () => {
    renderAssignment();

    fireEvent.click(screen.getByRole("button", { name: /doesn't need a guide/i }));
    const note = await screen.findByLabelText(/What did the guest say/i);
    fireEvent.change(note, { target: { value: "Di namin kailangan ng tour guide" } });
    fireEvent.click(screen.getByRole("button", { name: "No guide needed" }));

    await waitFor(() => expect(mockSetGuideNotNeeded).toHaveBeenCalledWith(bookingId, true, "Di namin kailangan ng tour guide"));
    // Nothing is assigned: clearing is the action's own job, serverside.
    expect(mockAssign).not.toHaveBeenCalled();
  });

  it("sends an empty note when the operator types nothing", async () => {
    renderAssignment();

    fireEvent.click(screen.getByRole("button", { name: /doesn't need a guide/i }));
    fireEvent.click(await screen.findByRole("button", { name: "No guide needed" }));

    await waitFor(() => expect(mockSetGuideNotNeeded).toHaveBeenCalledWith(bookingId, true, ""));
  });

  it("warns that an assigned guide is being taken off", async () => {
    renderAssignment({ currentGuideId: "g1" });

    fireEvent.click(screen.getByRole("button", { name: /doesn't need a guide/i }));

    await screen.findByRole("heading", { name: "Take Bianca Zabala off this tour?" });
    expect(screen.getByText(/told they are no longer leading this tour/i)).toBeInTheDocument();
  });

  it("shows the recorded decision instead of the picker, and can undo it", async () => {
    renderAssignment({ guideNotNeeded: { at: "2026-11-09T02:00:00Z", note: "Guest asked in chat" } });

    expect(screen.getByText("No guide for this tour")).toBeInTheDocument();
    expect(screen.getByText("“Guest asked in chat”")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Assign a guide after all" }));

    await waitFor(() => expect(mockSetGuideNotNeeded).toHaveBeenCalledWith(bookingId, false));
  });

  it("still offers the request when no guide is approved yet", () => {
    renderAssignment({ availableGuides: [] });

    expect(screen.getByText(/No approved guides available/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /doesn't need a guide/i })).toBeInTheDocument();
  });

  it("keeps the picker for an ordinary unassigned booking", () => {
    renderAssignment();

    expect(screen.getByRole("combobox", { name: "Guide for this booking" })).toBeInTheDocument();
    expect(screen.queryByText("No guide for this tour")).not.toBeInTheDocument();
  });
});

describe("GuideAssignment: assigning and unassigning", () => {
  it("assigns the picked guide", async () => {
    renderAssignment();

    fireEvent.change(screen.getByRole("combobox", { name: "Guide for this booking" }), { target: { value: "g2" } });
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));

    await waitFor(() => expect(mockAssign).toHaveBeenCalledWith(bookingId, "g2"));
  });

  it("asks before taking the current guide off", async () => {
    mockConfirm.mockResolvedValue(false);
    renderAssignment({ currentGuideId: "g1" });

    fireEvent.click(screen.getByRole("button", { name: "Unassign" }));

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Take Bianca Zabala off this tour?" })));
    expect(mockAssign).not.toHaveBeenCalled();

    mockConfirm.mockResolvedValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Unassign" }));

    await waitFor(() => expect(mockAssign).toHaveBeenCalledWith(bookingId, null));
  });

  it("shows the error the server returned", async () => {
    mockAssign.mockResolvedValue({ success: false, error: "That guide is already on another tour that day." });
    renderAssignment({ currentGuideId: "g1" });

    fireEvent.click(screen.getByRole("button", { name: "Unassign" }));

    expect(await screen.findByText("That guide is already on another tour that day.")).toBeInTheDocument();
  });
});
