/** @jest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { CreateStopsPicker } from "./stops-picker";
import type { CreateStop } from "./stops";

jest.mock("@/components/maps/free-map", () => ({ FreeMap: () => <div>Map preview</div> }));
jest.mock("@/components/maps/location-picker", () => ({ LocationPicker: ({ onChange }: { onChange: (lat: number, lng: number) => void }) => <button type="button" onClick={() => onChange(14.4, 122.8)}>Tap map</button> }));
const attractions = [{ id: "a", name: "Beach", description: "A beach", latitude: 14.1, longitude: 122.9 }, { id: "b", name: "Island", description: "An island", latitude: 14.2, longitude: 123.1 }, { id: "c", name: "No coordinates", description: null, latitude: null, longitude: null }];

it("fills an attraction's name, description and coordinates, and can pick a point", () => {
  const onChange = jest.fn();
  const { rerender } = render(<CreateStopsPicker attractions={attractions} stops={[]} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Add stop" }));
  fireEvent.click(screen.getByText("Save stop"));
  expect(screen.getByRole("alert")).toHaveTextContent("Choose an attraction");
  const search = screen.getByRole("combobox");
  fireEvent.focus(search);
  expect(screen.queryByText("No coordinates")).not.toBeInTheDocument();
  fireEvent.change(search, { target: { value: "Beach" } });
  fireEvent.click(screen.getByRole("option", { name: "Beach" }));
  expect(screen.getByText("Map preview")).toBeInTheDocument();
  expect(screen.getByLabelText("Description (optional)")).toHaveValue("A beach");
  fireEvent.click(screen.getByText("Save stop"));
  const beach: CreateStop = { locationName: "Beach", description: "A beach", latitude: 14.1, longitude: 122.9 };
  expect(onChange).toHaveBeenLastCalledWith([beach]);
  rerender(<CreateStopsPicker attractions={attractions} stops={[beach]} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Add stop" }));
  fireEvent.click(screen.getByText("Not in the list? Pick on the map"));
  fireEvent.change(screen.getByLabelText("Stop name"), { target: { value: "My stop" } });
  fireEvent.click(screen.getByText("Tap map"));
  fireEvent.click(screen.getByText("Save stop"));
  expect(onChange).toHaveBeenLastCalledWith([beach, { locationName: "My stop", description: "", latitude: 14.4, longitude: 122.8 }]);
});

it("keeps separately selected attractions distinct and does not save a cancelled edit", () => {
  const onChange = jest.fn();
  const first: CreateStop = { locationName: "Beach", description: "A beach", latitude: 14.1, longitude: 122.9 };
  const { rerender } = render(<CreateStopsPicker attractions={attractions} stops={[first]} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Add stop" }));
  fireEvent.focus(screen.getByRole("combobox"));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "Island" } });
  fireEvent.click(screen.getByRole("option", { name: "Island" }));
  fireEvent.click(screen.getByText("Save stop"));
  const second: CreateStop = { locationName: "Island", description: "An island", latitude: 14.2, longitude: 123.1 };
  expect(onChange).toHaveBeenLastCalledWith([first, second]);
  rerender(<CreateStopsPicker attractions={attractions} stops={[first, second]} onChange={onChange} />);
  onChange.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Edit Beach" }));
  fireEvent.change(screen.getByLabelText("Description (optional)"), { target: { value: "Changed" } });
  fireEvent.click(screen.getByText("Cancel"));
  expect(onChange).not.toHaveBeenCalled();
});

it("does not retain an old location when the attraction search is changed", () => {
  const onChange = jest.fn();
  render(<CreateStopsPicker attractions={attractions} stops={[]} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Add stop" }));
  const input = screen.getByRole("combobox");
  fireEvent.focus(input);
  fireEvent.click(screen.getByRole("option", { name: "Beach" }));
  fireEvent.change(input, { target: { value: "Island" } });
  fireEvent.click(screen.getByText("Save stop"));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("Choose an attraction");
});
