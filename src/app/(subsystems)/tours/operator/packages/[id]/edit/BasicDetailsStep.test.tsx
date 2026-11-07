/** @jest-environment jsdom */

import { createElement, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { BasicDetailsStep, describeDuration } from "./BasicDetailsStep";
import type { BasicDetailsData, EditPackageStatus } from "./edit-types";

const data: BasicDetailsData = {
  title: "Daet Heritage Tour",
  locationName: "Daet, Camarines Norte",
  description: "A local history tour.",
  durationValue: 1,
  durationType: "hours",
};

const onUpdate = jest.fn();

/** The editor feeds every change back in as new props; this does the same. */
function Step({ initial, packageStatus, errors }: { initial: BasicDetailsData; packageStatus: EditPackageStatus; errors: Record<string, string> }) {
  const [value, setValue] = useState(initial);
  return createElement(BasicDetailsStep, {
    data: value,
    originalData: initial,
    packageStatus,
    onUpdate: (next) => {
      onUpdate(next);
      setValue(next);
    },
    errors,
    loading: false,
  });
}

function renderStep({
  packageStatus = "draft" as EditPackageStatus,
  errors = {},
  value = data,
}: {
  packageStatus?: EditPackageStatus;
  errors?: Record<string, string>;
  value?: BasicDetailsData;
} = {}) {
  onUpdate.mockReset();
  render(createElement(Step, { initial: value, packageStatus, errors }));
}

describe("describeDuration", () => {
  it("says hours and days in the right number", () => {
    expect(describeDuration(1, "hours")).toBe("1 hour");
    expect(describeDuration(3, "hours")).toBe("3 hours");
    expect(describeDuration(1, "days")).toBe("1 day");
    expect(describeDuration(3, "days")).toBe("3 days");
  });
});

describe("BasicDetailsStep", () => {
  it("edits the title in place, in the section card", () => {
    renderStep();

    const title = screen.getByLabelText(/Package title/);
    fireEvent.change(title, { target: { value: "Daet Heritage Walk" } });

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ title: "Daet Heritage Walk" }));
  });

  it("counts characters against the limit and says the duration back", () => {
    renderStep();
    expect(screen.getByText("18/150")).toBeInTheDocument();
    expect(screen.getByText("1 hour")).toBeInTheDocument();
  });

  it("checks a field when it is left, not on every keystroke", () => {
    renderStep();

    const title = screen.getByLabelText(/Package title/);
    fireEvent.change(title, { target: { value: "ab" } });
    // Half-typed: no complaint yet.
    expect(screen.queryByText("Title must be 3-150 characters.")).not.toBeInTheDocument();

    fireEvent.blur(title);
    expect(screen.getByText("Title must be 3-150 characters.")).toBeInTheDocument();
    expect(title).toHaveAttribute("aria-invalid", "true");
  });

  it("prefers the server's message for a field it names", () => {
    renderStep({ errors: { title: "Please write a clearer title." } });
    expect(screen.getByText("Please write a clearer title.")).toBeInTheDocument();
  });

  it("shows values as text, with the reason, when the status is read-only", () => {
    renderStep({ packageStatus: "pending_review" });

    expect(screen.queryByLabelText(/Package title/)).not.toBeInTheDocument();
    expect(screen.getByText("Daet Heritage Tour")).toBeInTheDocument();
    expect(screen.getByText(/under review/)).toBeInTheDocument();
  });

  it("offers the fields for a published package: text saves straight away", () => {
    renderStep({ packageStatus: "published" });
    expect(screen.getByLabelText(/Package title/)).toBeEnabled();
  });

  it("says when the package is archived and why nothing can change", () => {
    renderStep({ packageStatus: "archived" });
    expect(screen.queryByLabelText(/Package title/)).not.toBeInTheDocument();
    expect(screen.getByText(/Archived packages cannot be edited/)).toBeInTheDocument();
  });
});
