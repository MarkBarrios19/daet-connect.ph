/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { EditPackageForm } from "./EditPackageForm";
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

describe("EditPackageForm validation state", () => {
  beforeEach(() => {
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
});
