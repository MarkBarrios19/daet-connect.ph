/** @jest-environment jsdom */

import { createElement } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { StopsStep } from "./StopsStep";
import type { EditPackageStatus, EditStop } from "./edit-types";

jest.mock("@/components/maps/location-picker", () => ({
  LocationPicker: ({ onChange }: { onChange: (lat: number, lng: number, place?: string) => void }) =>
    createElement(
      "button",
      { type: "button", onClick: () => onChange(14.1155, 122.9685, "Bagasbas Beach") },
      "Pick Bagasbas Beach on the map",
    ),
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

const stop = (overrides: Partial<EditStop> = {}): EditStop => ({
  id: "s1",
  locationName: "Rizal Monument",
  description: null,
  latitude: 14.1131,
  longitude: 122.9545,
  estimatedDurationMinutes: 30,
  stopOrder: 1,
  ...overrides,
});

const onUpdate = jest.fn();

function renderStep({
  data = [stop()],
  packageStatus = "draft" as EditPackageStatus,
} = {}) {
  onUpdate.mockReset();
  render(
    createElement(StopsStep, {
      data,
      originalData: data,
      packageStatus,
      onUpdate,
      errors: {},
      loading: false,
    }),
  );
}

const dialog = (name: string) => screen.getByRole("dialog", { name });
const lastUpdate = () => onUpdate.mock.calls.at(-1)?.[0] as EditStop[];

describe("StopsStep", () => {
  it("numbers the route and summarizes it in the card's summary line", () => {
    renderStep({
      data: [stop(), stop({ id: "s2", locationName: "Bagasbas Beach", stopOrder: 2 })],
    });

    expect(screen.getByText("Rizal Monument")).toBeInTheDocument();
    expect(screen.getByText("Rizal Monument → Bagasbas Beach")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("never asks for a typed coordinate up front", () => {
    renderStep();

    fireEvent.click(screen.getByRole("button", { name: "Add a stop" }));

    // Latitude and longitude exist, but inside a collapsed Advanced section.
    const advanced = screen.getByText(/Advanced: coordinates/).closest("details");
    expect(advanced).not.toHaveAttribute("open");
    expect(within(advanced as HTMLElement).getByLabelText("Latitude")).toBeInTheDocument();
  });

  it("adds a stop from the map picker, taking its name and point", () => {
    renderStep({ data: [] });

    fireEvent.click(screen.getByRole("button", { name: "Add a stop" }));
    fireEvent.click(screen.getByRole("button", { name: "Pick Bagasbas Beach on the map" }));

    expect(screen.getByLabelText(/Where does the tour stop/)).toHaveValue("Bagasbas Beach");

    fireEvent.click(within(dialog("Add a stop")).getByRole("button", { name: "Add stop" }));

    expect(lastUpdate()).toHaveLength(1);
    expect(lastUpdate()[0]).toMatchObject({
      locationName: "Bagasbas Beach",
      latitude: 14.1155,
      longitude: 122.9685,
      stopOrder: 1,
    });
  });

  it("keeps the name the operator typed when they also pick on the map", () => {
    renderStep({ data: [] });

    fireEvent.click(screen.getByRole("button", { name: "Add a stop" }));
    fireEvent.change(screen.getByLabelText(/Where does the tour stop/), { target: { value: "Kuwartel ni Rizal" } });
    fireEvent.click(screen.getByRole("button", { name: "Pick Bagasbas Beach on the map" }));
    fireEvent.click(within(dialog("Add a stop")).getByRole("button", { name: "Add stop" }));

    expect(lastUpdate()[0]).toMatchObject({ locationName: "Kuwartel ni Rizal", latitude: 14.1155 });
  });

  it("will not add a stop with no name", () => {
    renderStep({ data: [] });

    fireEvent.click(screen.getByRole("button", { name: "Add a stop" }));
    fireEvent.click(within(dialog("Add a stop")).getByRole("button", { name: "Add stop" }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(within(dialog("Add a stop")).getByRole("alert")).toHaveTextContent(/Stop name must be/);
  });

  it("leaves the route alone when Cancel is pressed", () => {
    renderStep();

    fireEvent.click(screen.getByRole("button", { name: "Rizal Monument stop options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/Where does the tour stop/), { target: { value: "Elsewhere" } });
    fireEvent.click(within(dialog("Edit stop")).getByRole("button", { name: "Cancel" }));

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("reorders the route and renumbers it", () => {
    renderStep({
      data: [stop(), stop({ id: "s2", locationName: "Bagasbas Beach", stopOrder: 2 })],
    });

    fireEvent.click(screen.getByRole("button", { name: "Bagasbas Beach stop options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Move up" }));

    expect(lastUpdate().map((entry) => [entry.id, entry.stopOrder])).toEqual([
      ["s2", 1],
      ["s1", 2],
    ]);
  });

  it("will not delete the last stop", () => {
    renderStep();

    fireEvent.click(screen.getByRole("button", { name: "Rizal Monument stop options" }));
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
  });

  it("is read-only for a package in review", () => {
    renderStep({ packageStatus: "pending_review" });

    expect(screen.queryByRole("button", { name: "Add a stop" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rizal Monument stop options" })).not.toBeInTheDocument();
  });
});
