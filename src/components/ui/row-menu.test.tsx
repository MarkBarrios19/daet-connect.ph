/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { RowMenu } from "./row-menu";

const renderMenu = (items: { label: string; onSelect: jest.Mock; danger?: boolean }[] = [{ label: "Edit", onSelect: jest.fn() }]) => {
  const onSelect = jest.fn();
  render(
    <div>
      <RowMenu label="Standard price option" items={[{ label: "Edit", onSelect }, ...items.slice(1)]} />
      <button type="button">Somewhere else</button>
    </div>,
  );
  return { onSelect };
};

jest.mock("next/navigation", () => ({ usePathname: () => "/tours/operator/packages/package-1/edit" }));

describe("RowMenu", () => {
  it("starts closed, with the trigger named after its row", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "Standard price option options" });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens a menu and puts focus on its first item", () => {
    renderMenu([
      { label: "Edit", onSelect: jest.fn() },
      { label: "Delete", onSelect: jest.fn(), danger: true },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Standard price option options" }));

    const menu = screen.getByRole("menu", { name: "Standard price option options" });
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Standard price option options" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Edit" }));
  });

  it("runs the chosen action, closes, and returns focus to the trigger", () => {
    const deleteItem = jest.fn();
    render(
      <RowMenu
        label="Bagasbas Beach stop"
        items={[
          { label: "Edit", onSelect: jest.fn() },
          { label: "Delete", onSelect: deleteItem, danger: true },
        ]}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Bagasbas Beach stop options" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(deleteItem).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Escape with focus back on the trigger", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "Standard price option options" });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on a click outside", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Standard price option options" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "Somewhere else" }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("moves between items with the arrow keys, Home and End", () => {
    render(
      <RowMenu
        label="Item"
        items={[
          { label: "Edit", onSelect: jest.fn() },
          { label: "Move up", onSelect: jest.fn(), disabled: true },
          { label: "Delete", onSelect: jest.fn(), danger: true },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Item options" }));
    const menu = screen.getByRole("menu");

    // A disabled item is skipped, not focused.
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Delete" }));

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Edit" }));

    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Delete" }));

    fireEvent.keyDown(menu, { key: "Home" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Edit" }));
  });

  it("draws nothing when a row has no actions at all", () => {
    const { container } = render(<RowMenu label="Empty" items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
