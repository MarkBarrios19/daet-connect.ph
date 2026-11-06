/** @jest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { act, fireEvent } from "@testing-library/react";
import { SearchBox } from "./search-box";
import { searchTerm } from "./search-term";

describe("SearchBox", () => {
  it("is a GET search form that keeps the page's other filters", () => {
    render(<SearchBox action="/tours/attractions" label="Search places" placeholder="Search places" value="bagasbas" keep={{ category: "beach", open: undefined }} />);
    const form = screen.getByRole("search");
    expect(form).toHaveAttribute("action", "/tours/attractions");
    expect(form).toHaveAttribute("method", "get");
    expect(screen.getByRole("searchbox", { name: "Search places" })).toHaveValue("bagasbas");
    expect(form.querySelector('input[type="hidden"][name="category"]')).toHaveAttribute("value", "beach");
    expect(form.querySelector('input[name="open"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Search" })).toHaveAttribute("type", "submit");
    // No voice button where the browser can't listen.
    expect(screen.queryByRole("button", { name: "Search by voice" })).toBeNull();
  });

  it("searches by voice where the browser can listen", () => {
    let rec: { onresult: (e: unknown) => void; onend: () => void; start: jest.Mock; stop: jest.Mock } | null = null;
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = function (this: typeof rec) {
      rec = Object.assign(this as object, { start: jest.fn(), stop: jest.fn() }) as typeof rec;
    };
    const submit = jest.fn();
    HTMLFormElement.prototype.requestSubmit = submit;
    render(<SearchBox action="/tours/browse" label="Search trips" placeholder="Search trips" />);
    fireEvent.click(screen.getByRole("button", { name: "Search by voice" }));
    expect(rec!.start).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Stop listening" })).toHaveAttribute("aria-pressed", "true");
    act(() => rec!.onresult({ results: [[{ transcript: " island hopping " }]] }));
    expect(screen.getByRole("searchbox", { name: "Search trips" })).toHaveValue("island hopping");
    expect(submit).toHaveBeenCalled();
    act(() => rec!.onend());
    expect(screen.getByRole("button", { name: "Search by voice" })).toHaveAttribute("aria-pressed", "false");
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  });

  it("strips the characters a PostgREST filter would read as syntax", () => {
    expect(searchTerm("  island, (hopping)%  ")).toBe("island hopping");
    expect(searchTerm(["x"])).toBe("");
    expect(searchTerm("a".repeat(200))).toHaveLength(80);
  });
});
