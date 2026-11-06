/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { ShowOnMap, StopFocus, TripFocusProvider, TripMap } from "./trip-focus";

type MapProps = { focusId?: string | null; onReset?: () => void };
const routeMap = jest.fn((props: MapProps) => (
  <div>
    <p>map focus: {props.focusId ?? "none"}</p>
    <button type="button" onClick={props.onReset}>Show the whole trip</button>
  </div>
));
jest.mock("@/components/maps/route-map", () => ({ RouteMap: (props: MapProps) => routeMap(props) }));

beforeAll(() => {
  window.matchMedia = window.matchMedia ?? ((() => ({ matches: false })) as unknown as typeof window.matchMedia);
  Element.prototype.scrollIntoView = jest.fn();
});

const points = [{ lat: 14.1, lng: 122.9, label: "Plaza" }];

function Trip() {
  return (
    <TripFocusProvider>
      <StopFocus id="p0">
        <ShowOnMap id="p0" name="Plaza"><span>tile</span></ShowOnMap>
        <a href="/tours/attractions/plaza">Plaza</a>
      </StopFocus>
      <StopFocus id={null}><span>no coordinates</span></StopFocus>
      <TripMap points={points} />
    </TripFocusProvider>
  );
}

describe("trip focus", () => {
  it("flies the map to a stop when its card or photo is tapped", () => {
    render(<Trip />);
    expect(screen.getByText("map focus: none")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show Plaza on the map" }));
    expect(screen.getByText("map focus: p0")).toBeInTheDocument();
  });

  it("goes back to the whole trip", () => {
    render(<Trip />);
    fireEvent.click(screen.getByRole("button", { name: "Show Plaza on the map" }));
    expect(screen.getByText("map focus: p0")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show the whole trip" }));
    expect(screen.getByText("map focus: none")).toBeInTheDocument();
  });

  it("leaves the place's link alone", () => {
    render(<Trip />);
    fireEvent.click(screen.getByRole("link", { name: "Plaza" }));
    expect(screen.getByText("map focus: none")).toBeInTheDocument();
  });

  it("does nothing for a stop without coordinates", () => {
    render(<Trip />);
    fireEvent.click(screen.getByText("no coordinates"));
    expect(screen.getByText("map focus: none")).toBeInTheDocument();
  });
});
