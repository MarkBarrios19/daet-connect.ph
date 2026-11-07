/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { EditPackageForm, Toast } from "./EditPackageForm";
import { updatePackageCore } from "./actions";
import type { EditPackageRecord, UpdatePackageResponse } from "./edit-types";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}));

jest.mock("./actions", () => ({
  updatePackageCore: jest.fn(),
  submitPackageForReview: jest.fn(),
}));

jest.mock("./BasicDetailsStep", () => ({ BasicDetailsStep: () => null }));
jest.mock("./CoverImageStep", () => ({ CoverImageStep: () => null }));
jest.mock("./PricingStep", () => ({ PricingStep: () => null }));
jest.mock("./StopsStep", () => ({ StopsStep: () => null }));
jest.mock("./GalleryStep", () => ({ GalleryStep: () => null }));
jest.mock("./InclusionsStep", () => ({
  InclusionsStep: ({ data, onUpdate }: {
    data: Array<{ id?: string; text: string; isIncluded: boolean; displayOrder: number }>;
    onUpdate: (value: Array<{ id?: string; text: string; isIncluded: boolean; displayOrder: number }>) => void;
  }) => {
    const React = require("react") as typeof import("react");
    return React.createElement(
      "div",
      null,
      React.createElement(
        "button",
        {
          type: "button",
          onClick: () =>
            onUpdate([
              ...data,
              { id: "new-1", text: "Licensed local guide", isIncluded: true, displayOrder: data.length + 1 },
            ]),
        },
        "Add first inclusion",
      ),
      React.createElement(
        "button",
        {
          type: "button",
          onClick: () =>
            onUpdate(data.map((item, index) => (index === 0 ? { ...item, text: "Updated guide" } : item))),
        },
        "Edit first inclusion",
      ),
    );
  },
}));

const mockedUpdatePackageCore = updatePackageCore as jest.MockedFunction<typeof updatePackageCore>;

const packageData: EditPackageRecord = {
  id: "package-1",
  status: "published",
  rejectionReason: null,
  updatedAt: "2026-11-06T12:00:00.000Z",
  formData: {
    title: "Daet Heritage Tour",
    locationName: "Daet, Camarines Norte",
    description: "A local history tour.",
    durationValue: 1,
    durationType: "days",
    coverImageUrl: null,
    priceVariants: [],
    inclusions: [],
    stops: [],
    galleryImages: [],
  },
};

describe("toast colors", () => {
  it.each([
    ["success", "bg-green-500", "text-slate-950"],
    ["error", "bg-red-600", "text-white"],
  ] as const)("uses the design-system colors for %s, including its icons", (type, background, foreground) => {
    const onClose = jest.fn();
    render(<Toast type={type} message="Notification" onClose={onClose} />);

    const toast = screen.getByText("Notification").parentElement!;
    expect(toast).toHaveClass(background, foreground);
    expect(toast).not.toHaveClass(type === "success" ? "text-white" : "text-slate-950");
    const dismiss = screen.getByRole("button", { name: "Dismiss notification" });
    expect(dismiss).toHaveClass("text-inherit");
    expect(dismiss).not.toHaveClass("text-white");
    expect(dismiss).not.toHaveClass("text-slate-950");
    const icons = toast.querySelectorAll('svg[fill="currentColor"]');
    expect(icons).toHaveLength(2);
    icons.forEach((icon) => {
      expect(icon).not.toHaveClass("text-white");
      expect(icon).not.toHaveClass("text-slate-950");
    });
    fireEvent.click(dismiss);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("EditPackageForm validation state", () => {
  beforeEach(() => {
    mockedUpdatePackageCore.mockReset();
    mockedUpdatePackageCore.mockResolvedValue({
      success: false,
      message: "Please add at least one inclusion.",
      errors: { inclusions: "At least one inclusion is required." },
    } satisfies UpdatePackageResponse);
  });

  it("clears server validation errors when the operator changes the form", async () => {
    render(<EditPackageForm packageData={packageData} />);

    fireEvent.click(screen.getByRole("button", { name: "Add first inclusion" }));
    const saveButton = screen.getByRole("button", { name: "Save changes" });
    expect(saveButton).toBeEnabled();

    fireEvent.click(saveButton);
    expect(await screen.findByText("Please add at least one inclusion.")).toBeInTheDocument();
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Edit first inclusion" }));

    await waitFor(() => expect(saveButton).toBeEnabled());
    expect(screen.queryByText("Please add at least one inclusion.")).not.toBeInTheDocument();
  });

  it("warns that published changes go live and may affect existing bookings", () => {
    render(<EditPackageForm packageData={packageData} />);

    expect(
      screen.getByText(/Saving updates the public listing immediately without a review step and may affect existing bookings/),
    ).toBeInTheDocument();
  });

  it("uses the server's new version timestamp for the next save", async () => {
    mockedUpdatePackageCore
      .mockResolvedValueOnce({
        success: true,
        message: "Package updated successfully.",
        updatedAt: "2026-11-06T12:05:00.000Z",
        data: { packageId: "package-1", status: "published" },
      } satisfies UpdatePackageResponse)
      .mockResolvedValueOnce({
        success: true,
        message: "Package updated successfully.",
        updatedAt: "2026-11-06T12:10:00.000Z",
        data: { packageId: "package-1", status: "published" },
      } satisfies UpdatePackageResponse);

    render(<EditPackageForm packageData={packageData} />);
    fireEvent.click(screen.getByRole("button", { name: "Add first inclusion" }));

    const saveButton = screen.getByRole("button", { name: "Save changes" });
    fireEvent.click(saveButton);
    await waitFor(() => expect(mockedUpdatePackageCore).toHaveBeenCalledTimes(1));
    expect(mockedUpdatePackageCore.mock.calls[0][2]).toBe(packageData.updatedAt);

    fireEvent.click(screen.getByRole("button", { name: "Edit first inclusion" }));
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() => expect(mockedUpdatePackageCore).toHaveBeenCalledTimes(2));
    expect(mockedUpdatePackageCore.mock.calls[1][2]).toBe("2026-11-06T12:05:00.000Z");
  });
});

describe("EditPackageForm toast contrast and accessibility", () => {
  beforeEach(() => {
    mockedUpdatePackageCore.mockReset();
  });

  it("renders the success toast with dark text on bg-green-500 and an accessible dismiss button", async () => {
    mockedUpdatePackageCore.mockResolvedValueOnce({
      success: true,
      message: "Package updated successfully.",
      updatedAt: "2026-11-06T12:05:00.000Z",
      data: { packageId: "package-1", status: "published" },
    } satisfies UpdatePackageResponse);

    render(<EditPackageForm packageData={packageData} />);
    fireEvent.click(screen.getByRole("button", { name: "Add first inclusion" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    const message = await screen.findByText("Changes saved.");
    const toast = message.closest('[role="status"]');
    expect(toast).not.toBeNull();
    expect(toast).toHaveClass("bg-green-500", "text-slate-950");
    expect(toast).not.toHaveClass("text-white");

    const dismissButton = within(toast as HTMLElement).getByRole("button", { name: "Dismiss notification" });
    expect(dismissButton).toHaveAttribute("type", "button");
    expect(dismissButton).toHaveClass("min-h-11", "min-w-11", "text-inherit");
    expect(dismissButton).not.toHaveClass("text-white");

    fireEvent.click(dismissButton);
    expect(screen.queryByText("Changes saved.")).not.toBeInTheDocument();
  });

  it("retains high-contrast white text on bg-red-600 for the error toast state", () => {
    const onClose = jest.fn();
    render(<Toast message="Unable to save package." type="error" onClose={onClose} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Unable to save package.");
    expect(alert).toHaveClass("bg-red-600", "text-white");
    expect(alert).not.toHaveClass("text-slate-950");
    expect(alert).not.toHaveClass("bg-red-500");

    const dismissButton = within(alert).getByRole("button", { name: "Dismiss notification" });
    expect(dismissButton).toHaveAttribute("type", "button");
    expect(dismissButton).toHaveClass("text-inherit");

    fireEvent.click(dismissButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
