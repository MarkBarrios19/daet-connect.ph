/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { InclusionsStep } from "./InclusionsStep";
import type { EditInclusion, EditPackageStatus } from "./edit-types";

jest.mock("@/components/ui/feedback", () => ({
  useFeedback: () => ({ toast: jest.fn(), confirm: jest.fn().mockResolvedValue(true) }),
}));

const item = (id: string, isIncluded: boolean, displayOrder = 1): EditInclusion => ({
  id,
  text: isIncluded ? "Guide service" : "Meals not included",
  isIncluded,
  displayOrder,
});

function renderStep({
  data = [],
  originalData = data,
  packageStatus = "draft" as EditPackageStatus,
}: {
  data?: EditInclusion[];
  originalData?: EditInclusion[];
  packageStatus?: EditPackageStatus;
} = {}) {
  const onUpdate = jest.fn();
  render(
    <InclusionsStep
      data={data}
      originalData={originalData}
      packageStatus={packageStatus}
      onUpdate={onUpdate}
      errors={{}}
      loading={false}
    />,
  );
  return { onUpdate };
}

describe("InclusionsStep", () => {
  it("lets a published package add an included item", () => {
    const { onUpdate } = renderStep({ packageStatus: "published", data: [], originalData: [] });

    fireEvent.click(screen.getByRole("button", { name: "+ Add Item" }));
    fireEvent.change(screen.getByPlaceholderText("e.g., Hotel accommodation"), {
      target: { value: "Licensed local guide" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));

    expect(onUpdate).toHaveBeenCalledWith([
      expect.objectContaining({ text: "Licensed local guide", isIncluded: true, displayOrder: 1 }),
    ]);
  });

  it("lets a published package add exclusions and more items", () => {
    const included = item("included-1", true);
    const { onUpdate } = renderStep({
      packageStatus: "published",
      data: [included],
      originalData: [included],
    });

    fireEvent.click(screen.getByRole("button", { name: "+ Add Item" }));
    fireEvent.click(screen.getByLabelText("Excluded"));
    fireEvent.change(screen.getByPlaceholderText("e.g., Hotel accommodation"), {
      target: { value: "Meals not included" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));

    expect(onUpdate).toHaveBeenCalledWith([
      included,
      expect.objectContaining({ text: "Meals not included", isIncluded: false, displayOrder: 2 }),
    ]);
  });

  it("keeps the normal add controls for draft packages", () => {
    renderStep({ packageStatus: "draft", data: [], originalData: [] });

    fireEvent.click(screen.getByRole("button", { name: "+ Add Item" }));
    expect(screen.getByLabelText("Included")).toBeInTheDocument();
    expect(screen.getByLabelText("Excluded")).toBeInTheDocument();
  });
});
