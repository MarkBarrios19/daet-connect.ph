/** @jest-environment jsdom */

import { createElement } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { PricingStep } from "./PricingStep";
import type { EditPackageStatus, EditPriceVariant } from "./edit-types";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

const variant = (overrides: Partial<EditPriceVariant> = {}): EditPriceVariant => ({
  id: "v1",
  variantName: "Standard",
  minPax: 1,
  maxPax: 8,
  pricePerPax: 500,
  flatPrice: null,
  isDefault: true,
  ...overrides,
});

const onUpdate = jest.fn();

function renderStep({
  data = [variant()],
  packageStatus = "draft" as EditPackageStatus,
  errors = {},
}: {
  data?: EditPriceVariant[];
  packageStatus?: EditPackageStatus;
  errors?: Record<string, string>;
} = {}) {
  onUpdate.mockReset();
  render(
    createElement(PricingStep, {
      data,
      originalData: data,
      packageStatus,
      onUpdate,
      errors,
      loading: false,
    }),
  );
}

const dialog = (name: string) => screen.getByRole("dialog", { name });

/** The value of the last change handed to the page. */
const lastUpdate = () => onUpdate.mock.calls.at(-1)?.[0] as EditPriceVariant[];

describe("PricingStep", () => {
  it("shows each price option as one readable row", () => {
    renderStep();

    expect(screen.getByText("Standard")).toBeInTheDocument();
    expect(screen.getByText("1–8 guests · ₱500.00 per guest")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
    // One menu per row, rather than a row of buttons.
    expect(screen.getByRole("button", { name: "Standard price option options" })).toBeInTheDocument();
  });

  it("adds a price option in the shared modal, without saving to the server", () => {
    renderStep({ data: [] });

    fireEvent.click(screen.getByRole("button", { name: "Add a price option" }));
    fireEvent.change(screen.getByLabelText(/What is this price called/), { target: { value: "Weekend" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("To (guests)"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText(/Price per guest/), { target: { value: "750" } });
    fireEvent.click(within(dialog("Add a price option")).getByRole("button", { name: "Add price option" }));

    expect(lastUpdate()).toHaveLength(1);
    expect(lastUpdate()[0]).toMatchObject({
      variantName: "Weekend",
      minPax: 2,
      maxPax: 6,
      pricePerPax: 750,
      flatPrice: null,
      // The first option is the one the package page shows.
      isDefault: true,
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("switches to one price for the whole group", () => {
    renderStep({ data: [] });

    fireEvent.click(screen.getByRole("button", { name: "Add a price option" }));
    fireEvent.change(screen.getByLabelText(/What is this price called/), { target: { value: "Barkada" } });
    fireEvent.change(screen.getByLabelText(/How is it priced/), { target: { value: "group" } });
    fireEvent.change(screen.getByLabelText(/Price for the group/), { target: { value: "5000" } });
    fireEvent.click(within(dialog("Add a price option")).getByRole("button", { name: "Add price option" }));

    expect(lastUpdate()[0]).toMatchObject({ flatPrice: 5000, pricePerPax: null });
  });

  it("refuses a price with no name, and says why in the modal", () => {
    renderStep({ data: [] });

    fireEvent.click(screen.getByRole("button", { name: "Add a price option" }));
    fireEvent.click(within(dialog("Add a price option")).getByRole("button", { name: "Add price option" }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(within(dialog("Add a price option")).getByRole("alert")).toHaveTextContent(/Name must be/);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("cannot be saved with no price at all", () => {
    renderStep({ data: [] });

    fireEvent.click(screen.getByRole("button", { name: "Add a price option" }));
    fireEvent.change(screen.getByLabelText(/What is this price called/), { target: { value: "Standard" } });
    fireEvent.click(within(dialog("Add a price option")).getByRole("button", { name: "Add price option" }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(within(dialog("Add a price option")).getByRole("alert")).toHaveTextContent(/price per pax or a flat price/i);
  });

  it("edits an existing option through its menu", () => {
    renderStep();

    fireEvent.click(screen.getByRole("button", { name: "Standard price option options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/What is this price called/), { target: { value: "Standard fare" } });
    fireEvent.click(within(dialog("Edit a price option")).getByRole("button", { name: "Save price option" }));

    expect(lastUpdate()[0]).toMatchObject({ id: "v1", variantName: "Standard fare" });
  });

  it("leaves the list alone when Cancel is pressed", () => {
    renderStep();

    fireEvent.click(screen.getByRole("button", { name: "Standard price option options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/What is this price called/), { target: { value: "Never mind" } });
    fireEvent.click(within(dialog("Edit a price option")).getByRole("button", { name: "Cancel" }));

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("hands the default to the next option when the default is deleted", () => {
    renderStep({
      data: [variant(), variant({ id: "v2", variantName: "Weekend", isDefault: false })],
    });

    fireEvent.click(screen.getByRole("button", { name: "Standard price option options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(lastUpdate()).toEqual([expect.objectContaining({ id: "v2", isDefault: true })]);
  });

  it("reorders and re-defaults from the menu", () => {
    renderStep({
      data: [variant(), variant({ id: "v2", variantName: "Weekend", isDefault: false })],
    });

    fireEvent.click(screen.getByRole("button", { name: "Weekend price option options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Make default" }));
    expect(lastUpdate().map((entry) => entry.isDefault)).toEqual([false, true]);

    fireEvent.click(screen.getByRole("button", { name: "Weekend price option options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Move up" }));
    expect(lastUpdate().map((entry) => entry.id)).toEqual(["v2", "v1"]);
  });

  it("collapses more than four options behind Show all", () => {
    const many = Array.from({ length: 6 }, (_, index) =>
      variant({ id: `v${index}`, variantName: `Option ${index + 1}`, isDefault: index === 0 }),
    );
    renderStep({ data: many });

    expect(screen.getByText("Option 4")).toBeInTheDocument();
    expect(screen.queryByText("Option 5")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Show all 6/ }));
    expect(screen.getByText("Option 6")).toBeInTheDocument();
  });

  it("shows the server's messages at the top of the section", () => {
    renderStep({ errors: { "priceVariants.0.minPax": "Min pax must be a whole number from 1 to 10,000." } });
    expect(screen.getByRole("alert")).toHaveTextContent("Min pax must be a whole number");
  });

  it("is read-only for a package in review: no add, no menu", () => {
    renderStep({ packageStatus: "pending_review" });

    expect(screen.queryByRole("button", { name: "Add a price option" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Standard price option options" })).not.toBeInTheDocument();
    // The section still says what is there.
    expect(screen.getByText("Standard")).toBeInTheDocument();
  });
});
