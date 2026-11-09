/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QrVerifyScanner } from "@/components/tours/qr-verify-scanner";
import { useRouter } from "next/navigation";

jest.mock("next/navigation", () => ({ useRouter: jest.fn() }));

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const token = (type: "guide" | "booking") =>
  `CD1.${type}.9b7e5a5e-0000-4000-8000-000000000001.1790000000.${"a".repeat(43)}`;

describe("QrVerifyScanner", () => {
  const push = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({ push } as never);
  });

  it("routes a guide badge to the server-side verification page", () => {
    render(<QrVerifyScanner expectedType="guide" />);
    fireEvent.change(screen.getByLabelText("Or paste the guide badge link or code"), { target: { value: token("guide") } });
    fireEvent.click(screen.getByRole("button", { name: "Verify QR" }));
    expect(push).toHaveBeenCalledWith(`/tours/verify/${token("guide")}`);
  });

  it("routes a tourist ticket to verification-only mode, without checking it in", () => {
    render(<QrVerifyScanner expectedType="booking" />);
    fireEvent.change(screen.getByLabelText("Or paste the tourist ticket link or code"), { target: { value: token("booking") } });
    fireEvent.click(screen.getByRole("button", { name: "Verify QR" }));
    expect(push).toHaveBeenCalledWith(`/tours/verify/${token("booking")}?mode=verify`);
  });

  it("rejects a QR with the wrong type without navigating", () => {
    render(<QrVerifyScanner expectedType="booking" />);
    fireEvent.change(screen.getByLabelText("Or paste the tourist ticket link or code"), { target: { value: token("guide") } });
    fireEvent.click(screen.getByRole("button", { name: "Verify QR" }));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("That QR is not a CONNECT-Daet booking ticket.");
  });
});
