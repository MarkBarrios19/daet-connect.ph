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
  it("lets a published legacy package add its first required included item", () => {
    const { onUpdate } = renderStep({ packageStatus: "published", data: [], originalData: [] });

    fireEvent.click(screen.getByRole("button", { name: "+ Add Included Item" }));
    expect(screen.getByText("This first item must be marked Included so the package can be saved.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Excluded")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("e.g., Hotel accommodation"), {
      target: { value: "Licensed local guide" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));

    expect(onUpdate).toHaveBeenCalledWith([
      expect.objectContaining({ text: "Licensed local guide", isIncluded: true, displayOrder: 1 }),
    ]);
  });

  it("hides the repair button after the first included item has been added", () => {
    renderStep({
      packageStatus: "published",
      originalData: [],
      data: [item("new-first-inclusion", true)],
    });

    expect(screen.queryByRole("button", { name: "+ Add Included Item" })).not.toBeInTheDocument();
  });

  it("keeps published packages with existing inclusions from adding structural items", () => {
    const included = item("included-1", true);
    renderStep({ packageStatus: "published", data: [included], originalData: [included] });

    expect(screen.queryByRole("button", { name: /Add Item/ })).not.toBeInTheDocument();
  });

  it("keeps the normal add controls for draft packages", () => {
    renderStep({ packageStatus: "draft", data: [], originalData: [] });

    fireEvent.click(screen.getByRole("button", { name: "+ Add Item" }));
    expect(screen.getByLabelText("Included")).toBeInTheDocument();
    expect(screen.getByLabelText("Excluded")).toBeInTheDocument();
  });
});
