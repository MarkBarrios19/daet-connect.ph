/** @jest-environment jsdom */

import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { StickySaveBar } from "./sticky-save-bar";

const renderBar = (overrides: Partial<Parameters<typeof StickySaveBar>[0]> = {}) => {
  const onSave = jest.fn();
  const onDiscard = jest.fn();
  render(<StickySaveBar changes={1} onSave={onSave} onDiscard={onDiscard} {...overrides} />);
  return { onSave, onDiscard };
};

describe("StickySaveBar", () => {
  it("is not drawn at all when there is nothing to save", () => {
    renderBar({ changes: 0 });
    expect(screen.queryByTestId("sticky-save-bar")).not.toBeInTheDocument();
  });

  it("counts the changes in words, including the singular", () => {
    const { unmount } = render(<StickySaveBar changes={1} onSave={jest.fn()} onDiscard={jest.fn()} />);
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();
    unmount();

    render(<StickySaveBar changes={3} onSave={jest.fn()} onDiscard={jest.fn()} />);
    // Announced as well as shown: the count is the bar's live region.
    expect(screen.getByRole("status")).toHaveTextContent("3 unsaved changes");
  });

  it("sits above the phone tab bar", () => {
    renderBar();
    const bar = screen.getByTestId("sticky-save-bar");
    expect(bar).toHaveStyle({ bottom: "var(--tab-bar-h, 0px)" });
    expect(bar.className).toContain("fixed");
    expect(bar.className).toContain("inset-x-0");
  });

  it("saves and discards through its own buttons", () => {
    const { onSave, onDiscard } = renderBar({ changes: 2 });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("shows the spinner and Saving… while a save is in flight, and blocks both buttons", () => {
    const { onSave } = renderBar({ saving: true });

    const saving = screen.getByRole("button", { name: "Saving…" });
    expect(saving).toBeDisabled();
    expect(saving).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Discard" })).toBeDisabled();
    fireEvent.click(saving);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("says what a save will do, and shows a failure as an alert", () => {
    render(
      <StickySaveBar
        changes={1}
        onSave={jest.fn()}
        onDiscard={jest.fn()}
        status="These changes go live when you save."
        error="Something went wrong while saving."
      />,
    );

    expect(screen.getByText("These changes go live when you save.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong while saving.");
  });

  it("pins to the foot of the screen when the page has something else to reach", () => {
    render(
      <StickySaveBar
        changes={0}
        pinned
        onSave={jest.fn()}
        onDiscard={jest.fn()}
        secondary={
          <button type="button" disabled={false}>
            Submit for review
          </button>
        }
      />,
    );

    const bar = screen.getByTestId("sticky-save-bar");
    expect(within(bar).getByText("All changes saved.")).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Submit for review" })).toBeEnabled();
    // Nothing to save: no Discard, and Save has nothing to do.
    expect(within(bar).queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
