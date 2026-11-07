/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { EditPackageForm } from "./EditPackageForm";
import { submitPackageForReview, updatePackageCore } from "./actions";
import type { EditPackageRecord, UpdatePackageResponse } from "./edit-types";

const push = jest.fn();
const refresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => refresh(), push: (href: string) => push(href) }),
  usePathname: () => "/tours/operator/packages/package-1/edit",
}));

jest.mock("./actions", () => ({
  updatePackageCore: jest.fn(),
  submitPackageForReview: jest.fn(),
}));

// jsdom has no <dialog>.showModal(); the shared Modal falls back to `open`.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

const mockedUpdate = updatePackageCore as jest.MockedFunction<typeof updatePackageCore>;
const mockedSubmit = submitPackageForReview as jest.MockedFunction<typeof submitPackageForReview>;

const record = (overrides: Partial<EditPackageRecord> = {}): EditPackageRecord => ({
  id: "package-1",
  status: "draft",
  rejectionReason: null,
  updatedAt: "2026-11-06T12:00:00.000Z",
  formData: {
    title: "Daet Heritage Tour",
    locationName: "Daet, Camarines Norte",
    description: "A local history tour.",
    durationValue: 1,
    durationType: "hours",
    coverImageUrl: null,
    priceVariants: [
      {
        id: "v1",
        variantName: "Standard",
        minPax: 1,
        maxPax: 8,
        pricePerPax: 500,
        flatPrice: null,
        isDefault: true,
      },
    ],
    inclusions: [{ id: "i1", text: "Guide", isIncluded: true, displayOrder: 1 }],
    stops: [
      {
        id: "s1",
        locationName: "Rizal Monument",
        description: null,
        latitude: 14.1131,
        longitude: 122.9545,
        estimatedDurationMinutes: 30,
        stopOrder: 1,
      },
    ],
    galleryImages: [],
  },
  ...overrides,
});

const titleField = () => screen.getByLabelText(/Package title/);

describe("editor section navigation", () => {
  it("lists every section as an anchor, with the phone dropdown beside it", () => {
    render(<EditPackageForm packageData={record()} />);

    const nav = screen.getByRole("navigation", { name: "Sections of this package" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Basics",
      "Photos",
      "Prices",
      "What's included",
      "Route & stops",
      "More photos",
    ]);
    for (const link of links) {
      expect(link.getAttribute("href")).toBe(`#${link.getAttribute("href")!.slice(1)}`);
      // 44px targets, and the anchor is a real one so it works without script.
      expect(link.className).toContain("min-h-11");
    }

    // A phone gets the same six sections as a picker rather than tabs.
    const jump = screen.getByLabelText("Jump to section");
    expect(within(jump).getAllByRole("option")).toHaveLength(6);
  });

  it("keeps the six section anchors on the page, so the links have somewhere to go", () => {
    render(<EditPackageForm packageData={record()} />);

    const anchors = ["basics-section", "photos-section", "prices-section", "included-section", "stops-section", "gallery-section"];
    for (const id of anchors) {
      const section = document.getElementById(id);
      expect(section).not.toBeNull();
      expect(section!.className).toContain("scroll-mt-");
    }
    const nav = screen.getByRole("navigation", { name: "Sections of this package" });
    expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(
      anchors.map((id) => `#${id}`),
    );
  });

  it("scrolls to a section and moves focus there when the picker changes", () => {
    const scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(<EditPackageForm packageData={record()} />);

    const jump = screen.getByLabelText("Jump to section");
    fireEvent.change(jump, { target: { value: "prices-section" } });

    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
    expect(document.activeElement).toBe(document.getElementById("prices-section"));
    expect(window.location.hash).toBe("#prices-section");
  });
});

describe("unsaved changes", () => {
  beforeEach(() => {
    mockedUpdate.mockReset();
    mockedSubmit.mockReset();
    push.mockReset();
    refresh.mockReset();
  });

  it("has no save bar until something changes", () => {
    render(<EditPackageForm packageData={record()} />);

    // A draft keeps the bar for "Submit for review", with nothing to save.
    const bar = screen.getByTestId("sticky-save-bar");
    expect(within(bar).getByText("All changes saved.")).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(within(bar).queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
  });

  it("counts the sections that changed and says so in the bar", () => {
    render(<EditPackageForm packageData={record()} />);

    fireEvent.change(titleField(), { target: { value: "Daet Heritage Walk" } });
    expect(screen.getByTestId("sticky-save-bar")).toBeInTheDocument();

    // A second section: a price option is edited through its modal.
    fireEvent.click(screen.getByRole("button", { name: "Standard price option options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/What is this price called/), { target: { value: "Standard fare" } });
    fireEvent.click(screen.getByRole("button", { name: "Save price option" }));

    // And back to the loaded value: the section is clean again.
    fireEvent.change(titleField(), { target: { value: "Daet Heritage Tour" } });
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();

    // Both edits together are two changed sections.
    fireEvent.change(titleField(), { target: { value: "Daet Heritage Walk" } });
    expect(screen.getByText("2 unsaved changes")).toBeInTheDocument();
  });

  it("marks the changed section in the navigation, then clears the mark after a save", async () => {
    mockedUpdate.mockResolvedValue({
      success: true,
      message: "Package updated successfully.",
      updatedAt: "2026-11-06T12:05:00.000Z",
      data: { packageId: "package-1", status: "draft" },
    } satisfies UpdatePackageResponse);

    render(<EditPackageForm packageData={record()} />);
    fireEvent.change(titleField(), { target: { value: "Daet Heritage Walk" } });

    const nav = screen.getByRole("navigation", { name: "Sections of this package" });
    const bar = screen.getByTestId("sticky-save-bar");
    expect(within(nav).getByRole("link", { name: /Basics.*unsaved changes/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Basics" }).closest("section")).toHaveTextContent("Unsaved");

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(within(bar).getByText("All changes saved.")).toBeInTheDocument());
    expect(within(nav).queryByRole("link", { name: /unsaved changes/ })).not.toBeInTheDocument();
    // Announced in the live region and shown on the page.
    expect(screen.getAllByText("Changes saved.")).toHaveLength(2);
    // The next save sends the version the server just returned.
    expect(mockedUpdate.mock.calls[0][2]).toBe("2026-11-06T12:00:00.000Z");
  });

  it("puts the saved version timestamp into the next save", async () => {
    mockedUpdate.mockResolvedValueOnce({
      success: true,
      message: "Package updated successfully.",
      updatedAt: "2026-11-06T12:05:00.000Z",
      data: { packageId: "package-1", status: "draft" },
    } satisfies UpdatePackageResponse);
    mockedUpdate.mockResolvedValueOnce({
      success: true,
      message: "Package updated successfully.",
      updatedAt: "2026-11-06T12:10:00.000Z",
      data: { packageId: "package-1", status: "draft" },
    } satisfies UpdatePackageResponse);

    render(<EditPackageForm packageData={record()} />);
    fireEvent.change(titleField(), { target: { value: "First" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));

    fireEvent.change(titleField(), { target: { value: "Second" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(2));
    expect(mockedUpdate.mock.calls[1][2]).toBe("2026-11-06T12:05:00.000Z");
  });

  it("shows the saving state while the save is in flight", async () => {
    let settle: (value: UpdatePackageResponse) => void = () => {};
    mockedUpdate.mockReturnValue(
      new Promise<Awaited<ReturnType<typeof updatePackageCore>>>((resolve) => {
        settle = resolve as (value: UpdatePackageResponse) => void;
      }),
    );

    render(<EditPackageForm packageData={record()} />);
    fireEvent.change(titleField(), { target: { value: "A slower save" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getAllByText("Saving…").length).toBeGreaterThan(0);

    settle({ success: true, message: "ok", updatedAt: "2026-11-06T12:05:00.000Z" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Saving…" })).not.toBeInTheDocument());
  });

  it("restores the loaded values when Discard is confirmed", () => {
    render(<EditPackageForm packageData={record()} />);
    fireEvent.change(titleField(), { target: { value: "Throw this away" } });

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByRole("dialog", { name: "Discard your changes?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(titleField()).toHaveValue("Daet Heritage Tour");
    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
  });

  it("keeps the edits when the Discard question is answered with no", () => {
    render(<EditPackageForm packageData={record()} />);
    fireEvent.change(titleField(), { target: { value: "Keep this" } });

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(titleField()).toHaveValue("Keep this");
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();
  });

  it("says what a save will do, and reads the button for the status", () => {
    const { unmount } = render(<EditPackageForm packageData={record()} />);
    fireEvent.change(titleField(), { target: { value: "A draft" } });
    expect(screen.getByText("Nothing is saved until you press Save.")).toBeInTheDocument();
    unmount();

    render(<EditPackageForm packageData={record({ status: "published" })} />);
    fireEvent.change(titleField(), { target: { value: "A live package" } });
    expect(screen.getByText("These changes go live when you save.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("shows a server error in the bar and takes the person to the section with the problem", async () => {
    const scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    mockedUpdate.mockResolvedValue({
      success: false,
      message: "Please add at least one included item.",
      errors: { inclusions: "Add at least one included item." },
    } satisfies UpdatePackageResponse);

    render(<EditPackageForm packageData={record()} />);
    fireEvent.change(titleField(), { target: { value: "Needs work" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    const bar = screen.getByTestId("sticky-save-bar");
    expect(await within(bar).findByRole("alert")).toHaveTextContent("Please add at least one included item.");
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    // The section that owns the error is marked in the navigation.
    const nav = screen.getByRole("navigation", { name: "Sections of this package" });
    expect(within(nav).getByRole("link", { name: /What's included.*needs attention/ })).toBeInTheDocument();
  });

  it("explains a conflict in plain words and offers a reload", async () => {
    mockedUpdate.mockResolvedValue({
      success: false,
      status: 409,
      message: "conflict",
    } satisfies UpdatePackageResponse);

    render(<EditPackageForm packageData={record()} />);
    fireEvent.change(titleField(), { target: { value: "Stale" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByText(/This package was changed elsewhere/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });
});

describe("submitting for review", () => {
  beforeEach(() => {
    mockedUpdate.mockReset();
    mockedSubmit.mockReset();
  });

  it("is only offered once the package is saved", async () => {
    render(<EditPackageForm packageData={record()} />);

    expect(screen.getByRole("button", { name: "Submit for review" })).toBeEnabled();

    fireEvent.change(titleField(), { target: { value: "Unsaved again" } });
    expect(screen.getByRole("button", { name: "Submit for review" })).toBeDisabled();
  });

  it("asks before sending, then submits what is saved", async () => {
    mockedUpdate.mockResolvedValue({
      success: true,
      message: "Package updated successfully.",
      updatedAt: "2026-11-06T12:05:00.000Z",
      data: { packageId: "package-1", status: "draft" },
    } satisfies UpdatePackageResponse);
    mockedSubmit.mockResolvedValue({
      success: true,
      message: "Package submitted for review.",
      data: { packageId: "package-1", status: "pending_review" },
    } satisfies UpdatePackageResponse);

    render(<EditPackageForm packageData={record()} />);
    fireEvent.change(titleField(), { target: { value: "Ready now" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole("button", { name: "Submit for review" }));

    const dialog = screen.getByRole("dialog", { name: "Send this package to the Tourism Office?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send for review" }));

    await waitFor(() => expect(mockedSubmit).toHaveBeenCalledTimes(1));
    expect(mockedSubmit.mock.calls[0][1]).toMatchObject({ title: "Ready now" });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/tours/operator/packages/package-1"));
  });
});

describe("leaving with unsaved changes", () => {
  beforeEach(() => {
    mockedUpdate.mockReset();
  });

  /** Adds a link to another page, the way a page's own chrome would. */
  function renderWithLink() {
    const view = render(
      <div>
        <EditPackageForm packageData={record()} />
        <a href="/tours/operator/packages">All packages</a>
      </div>,
    );
    return view;
  }

  it("asks before an in-app link takes the person away", () => {
    renderWithLink();
    fireEvent.change(titleField(), { target: { value: "Half done" } });

    fireEvent.click(screen.getByRole("link", { name: "All packages" }));

    const dialog = screen.getByRole("dialog", { name: "Leave without saving?" });
    expect(dialog).toHaveTextContent("You have 1 unsaved change.");
    expect(push).not.toHaveBeenCalled();
  });

  it("leaves when the question is answered yes", () => {
    renderWithLink();
    fireEvent.change(titleField(), { target: { value: "Half done" } });
    fireEvent.click(screen.getByRole("link", { name: "All packages" }));

    fireEvent.click(screen.getByRole("button", { name: "Leave page" }));

    expect(push).toHaveBeenCalledWith("/tours/operator/packages");
  });

  it("lets the link through when there is nothing to lose", () => {
    renderWithLink();

    const link = screen.getByRole("link", { name: "All packages" });
    const notCancelled = fireEvent.click(link);

    // Not prevented: the browser (and Next's router) handles it.
    expect(notCancelled).toBe(true);
    expect(screen.queryByRole("dialog", { name: "Leave without saving?" })).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("ignores in-page anchors, which never leave the editor", () => {
    renderWithLink();
    fireEvent.change(titleField(), { target: { value: "Half done" } });

    const nav = screen.getByRole("navigation", { name: "Sections of this package" });
    const jump = within(nav).getByRole("link", { name: "Prices" });
    fireEvent.click(jump);

    // The section's own handler may run, but the leave guard never asks.
    expect(screen.queryByRole("dialog", { name: "Leave without saving?" })).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("asks the browser before a reload or a closed tab", () => {
    renderWithLink();
    fireEvent.change(titleField(), { target: { value: "Half done" } });

    const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("says nothing to the browser when the page is clean", () => {
    renderWithLink();

    const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("does not ask when the package cannot be edited at all", () => {
    // In review: read-only text instead of fields, so nothing can become unsaved.
    render(<EditPackageForm packageData={record({ status: "pending_review" })} />);
    expect(screen.queryByLabelText(/Package title/)).not.toBeInTheDocument();
    expect(screen.getByText(/under review/)).toBeInTheDocument();

    const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
