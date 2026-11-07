/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { InclusionsStep } from "./InclusionsStep";
import type { EditInclusion, EditPackageStatus } from "./edit-types";

jest.mock("@/components/ui/feedback", () => ({
  useFeedback: () => ({ toast: jest.fn(), confirm: jest.fn().mockResolvedValue(true) }),
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

const item = (id: string, isIncluded: boolean, displayOrder = 1, text?: string): EditInclusion => ({
  id,
  text: text ?? (isIncluded ? "Guide service" : "Meals not included"),
  isIncluded,
  displayOrder,
});

const onUpdate = jest.fn();

/**
 * The real editor feeds onUpdate back in as new props. Mirror that here, so an
 * undo puts the item back into the list the component is reading.
 */
function Stateful({ initial, packageStatus }: { initial: EditInclusion[]; packageStatus: EditPackageStatus }) {
  const [data, setData] = React.useState(initial);
  return (
    <InclusionsStep
      data={data}
      originalData={initial}
      packageStatus={packageStatus}
      onUpdate={(next) => {
        onUpdate(next);
        setData(next);
      }}
      errors={{}}
      loading={false}
    />
  );
}

function renderStep({
  data = [],
  packageStatus = "draft" as EditPackageStatus,
}: {
  data?: EditInclusion[];
  originalData?: EditInclusion[];
  packageStatus?: EditPackageStatus;
} = {}) {
  onUpdate.mockReset();
  render(<Stateful initial={data} packageStatus={packageStatus} />);
  return { onUpdate };
}

/** The open modal, by its title. */
const dialog = (name: string) => screen.getByRole("dialog", { name });

describe("InclusionsStep", () => {
  it("lets a published package add an included item", () => {
    const { onUpdate } = renderStep({ packageStatus: "published", data: [], originalData: [] });

    fireEvent.click(screen.getByRole("button", { name: "Add an item" }));
    fireEvent.change(screen.getByLabelText(/What is it\?/), { target: { value: "Licensed local guide" } });
    fireEvent.click(within(dialog("Add an item")).getByRole("button", { name: "Add item" }));

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

    fireEvent.click(screen.getByRole("button", { name: "Add an item" }));
    fireEvent.change(screen.getByLabelText(/Is it included/), { target: { value: "no" } });
    fireEvent.change(screen.getByLabelText(/What is it\?/), { target: { value: "Meals not included" } });
    fireEvent.click(within(dialog("Add an item")).getByRole("button", { name: "Add item" }));

    expect(onUpdate).toHaveBeenCalledWith([
      included,
      expect.objectContaining({ text: "Meals not included", isIncluded: false, displayOrder: 2 }),
    ]);
  });

  it("stays open for the next item when Add another is used", () => {
    const { onUpdate } = renderStep({ data: [], originalData: [] });

    fireEvent.click(screen.getByRole("button", { name: "Add an item" }));
    fireEvent.change(screen.getByLabelText(/What is it\?/), { target: { value: "Boat transfer" } });
    fireEvent.click(within(dialog("Add an item")).getByRole("button", { name: "Add another" }));

    expect(onUpdate).toHaveBeenCalledWith([expect.objectContaining({ text: "Boat transfer" })]);
    // Still open, with the text cleared for the next one.
    expect(screen.getByRole("dialog", { name: "Add an item" })).toBeInTheDocument();
    expect(screen.getByLabelText(/What is it\?/)).toHaveValue("");
  });

  it("keeps the form untouched when Cancel is pressed", () => {
    const { onUpdate } = renderStep({ data: [], originalData: [] });

    fireEvent.click(screen.getByRole("button", { name: "Add an item" }));
    fireEvent.change(screen.getByLabelText(/What is it\?/), { target: { value: "Never mind" } });
    fireEvent.click(within(dialog("Add an item")).getByRole("button", { name: "Cancel" }));

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("will not add a blank item", () => {
    const { onUpdate } = renderStep({ data: [], originalData: [] });

    fireEvent.click(screen.getByRole("button", { name: "Add an item" }));
    fireEvent.click(within(dialog("Add an item")).getByRole("button", { name: "Add item" }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(within(dialog("Add an item")).getByRole("alert")).toBeInTheDocument();
  });

  it("keeps the normal add controls for draft packages", () => {
    renderStep({ packageStatus: "draft", data: [], originalData: [] });

    expect(screen.getByRole("button", { name: "Add an item" })).toBeEnabled();
    expect(screen.getByText(/List what the price covers/)).toBeInTheDocument();
  });

  it("collapses a long list behind Show all", () => {
    const many = Array.from({ length: 13 }, (_, index) => item(`i${index}`, true, index + 1, `Item ${index + 1}`));
    renderStep({ data: many, originalData: many });

    expect(screen.getByText("Item 5")).toBeInTheDocument();
    expect(screen.queryByText("Item 6")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Show all 13/ }));
    expect(screen.getByText("Item 13")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.queryByText("Item 13")).not.toBeInTheDocument();
  });

  it("removes a row with an undo rather than a dialog", () => {
    const first = item("i1", true, 1, "Boat transfer");
    const second = item("i2", true, 2, "Life vest");
    const { onUpdate } = renderStep({ data: [first, second], originalData: [first, second] });

    fireEvent.click(screen.getByRole("button", { name: "Boat transfer item options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));

    expect(onUpdate).toHaveBeenLastCalledWith([expect.objectContaining({ id: "i2", displayOrder: 1 })]);
    expect(screen.getByText(/Removed/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUpdate).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: "i1", displayOrder: 1 }),
      expect.objectContaining({ id: "i2", displayOrder: 2 }),
    ]);
  });

  it("edits an item through its menu", () => {
    const guide = item("i1", true, 1, "Guide");
    const { onUpdate } = renderStep({ data: [guide], originalData: [guide] });

    fireEvent.click(screen.getByRole("button", { name: "Guide item options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/What is it\?/), { target: { value: "Licensed guide" } });
    fireEvent.click(within(dialog("Edit item")).getByRole("button", { name: "Save item" }));

    expect(onUpdate).toHaveBeenCalledWith([expect.objectContaining({ id: "i1", text: "Licensed guide" })]);
  });

  it("shows a section-level error at the top of the card", () => {
    render(
      <InclusionsStep
        data={[]}
        originalData={[]}
        packageStatus="draft"
        onUpdate={jest.fn()}
        errors={{ inclusions: "Add at least one included item." }}
        loading={false}
      />,
    );

    expect(screen.getAllByText("Add at least one included item.").length).toBeGreaterThan(0);
  });
});
