/** @jest-environment jsdom */

import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { BookEachTrip } from "@/components/planner/book-each-trip";
import { ShareLink } from "@/components/planner/share-link";
import type { DatedPackage } from "@/lib/tours/itinerary/bookable";

const pkg: DatedPackage = { id: "pkg1", title: "Surf Lesson", coverImageUrl: null, matched: ["Bagasbas Beach"], price: { amount: 800, perPerson: true }, operatorName: "Coast Tours", verified: true, notIncluded: [], date: "2026-11-11" };

describe("BookEachTrip", () => {
  it("books for the group on the saved trip", () => {
    render(<BookEachTrip packages={[pkg]} group={3} />);
    expect(screen.getByRole("link", { name: "Book this trip" })).toHaveAttribute("href", "/tours/packages/pkg1/book?date=2026-11-11&pax=3");
    expect(screen.getByText(/about ₱2,400.00 for 3/)).toBeInTheDocument();
  });

  it("lets a viewer of a shared plan book for themselves, with no group total", () => {
    render(<BookEachTrip packages={[pkg, { ...pkg, id: "pkg2" }]} group={null} title="Book these tours yourself" />);
    expect(screen.getByRole("heading", { name: "Book these tours yourself" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Book this trip" })[0]).toHaveAttribute("href", "/tours/packages/pkg1/book?date=2026-11-11");
    expect(screen.queryByText(/for all 2 trips/)).not.toBeInTheDocument();
    expect(screen.queryByText(/about ₱/)).not.toBeInTheDocument();
  });
});

describe("ShareLink", () => {
  afterEach(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  });

  it("creates a link, shares it with the phone's share sheet, and can stop sharing", async () => {
    const setSharing = jest.fn().mockResolvedValueOnce({ token: "tok-1" }).mockResolvedValueOnce({ token: null });
    const share = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    render(<ShareLink id="it1" title="Daet trip, Nov 10–11" initialToken={null} baseUrl="https://daet.test" setSharing={setSharing} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Share a view-only link" })));
    expect(setSharing).toHaveBeenCalledWith("it1", true);
    expect(screen.getByLabelText("Share link")).toHaveValue("https://daet.test/tours/itineraries/shared/tok-1");
    expect(screen.getByText(/can't change it or see who is coming/)).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Share link" })));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: "https://daet.test/tours/itineraries/shared/tok-1", title: "Daet trip, Nov 10–11" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Stop sharing" })));
    expect(setSharing).toHaveBeenLastCalledWith("it1", false);
    expect(screen.queryByLabelText("Share link")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Sharing stopped. The old link no longer works.");
  });

  it("copies the link where there is no share sheet", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ShareLink id="it1" title="Trip" initialToken="tok-2" baseUrl="https://daet.test" setSharing={jest.fn()} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Share link" })));
    expect(writeText).toHaveBeenCalledWith("https://daet.test/tours/itineraries/shared/tok-2");
    expect(screen.getByRole("status")).toHaveTextContent("Link copied.");
  });

  it("shows the error when sharing can't be changed", async () => {
    render(<ShareLink id="it1" title="Trip" initialToken={null} baseUrl="https://daet.test" setSharing={jest.fn().mockResolvedValue({ token: null, error: "Sharing could not be changed." })} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Share a view-only link" })));
    expect(screen.getByRole("alert")).toHaveTextContent("Sharing could not be changed.");
  });
});
