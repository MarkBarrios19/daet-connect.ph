/** @jest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { SearchBox, searchTerm } from "./search-box";

describe("SearchBox", () => {
  it("is a GET search form that keeps the page's other filters", () => {
    render(<SearchBox action="/tours/attractions" label="Search places" placeholder="Search places" value="bagasbas" keep={{ category: "beach", open: undefined }} />);
    const form = screen.getByRole("search");
    expect(form).toHaveAttribute("action", "/tours/attractions");
    expect(form).toHaveAttribute("method", "get");
    expect(screen.getByRole("searchbox", { name: "Search places" })).toHaveValue("bagasbas");
    expect(form.querySelector('input[type="hidden"][name="category"]')).toHaveAttribute("value", "beach");
    expect(form.querySelector('input[name="open"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
  });

  it("strips the characters a PostgREST filter would read as syntax", () => {
    expect(searchTerm("  island, (hopping)%  ")).toBe("island hopping");
    expect(searchTerm(["x"])).toBe("");
    expect(searchTerm("a".repeat(200))).toHaveLength(80);
  });
});
