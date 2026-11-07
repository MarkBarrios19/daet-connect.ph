/** @jest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { Combobox } from "./combobox";

it("filters, navigates with keys, selects, and closes with Escape", () => {
  const select = jest.fn();
  render(<Combobox label="Attraction" options={[{ id: "1", label: "Bagasbas Beach" }, { id: "2", label: "Island" }]} onSelect={select} />);
  const input = screen.getByRole("combobox");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "bag" } });
  expect(screen.getAllByRole("option")).toHaveLength(1);
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(input).toHaveAttribute("aria-activedescendant", screen.getByRole("option").id);
  fireEvent.keyDown(input, { key: "Enter" });
  expect(select).toHaveBeenCalledWith({ id: "1", label: "Bagasbas Beach" });
  expect(input).toHaveAttribute("aria-expanded", "false");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "not found" } });
  expect(screen.getByText("No matches")).toBeInTheDocument();
  fireEvent.keyDown(input, { key: "Escape" });
  expect(input).toHaveAttribute("aria-expanded", "false");
});
