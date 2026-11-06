/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { signInWithPassword } from "./actions";
import { LoginForm } from "./login-form";

jest.mock("./actions", () => ({ signInWithPassword: jest.fn() }));

const mockSignIn = signInWithPassword as jest.MockedFunction<typeof signInWithPassword>;

function submit() {
  const form = screen.getByRole("button", { name: "Sign in" }).closest("form");
  expect(form).not.toBeNull();
  fireEvent.submit(form!);
}

describe("the sign-in form", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignIn.mockResolvedValue({ status: "idle" });
  });

  it("offers Google first, carrying the page the visitor came from", () => {
    render(<LoginForm nextUrl="/tours/me" />);

    const google = screen.getByRole("link", { name: /continue with google/i });
    expect(google).toHaveAttribute("href", `/auth/oauth?next=${encodeURIComponent("/tours/me")}`);
    // A link, so the browser can leave for Google and the Back button works.
    expect(google.tagName).toBe("A");
  });

  it("keeps the password method, under a plain divider", () => {
    render(<LoginForm nextUrl="/" />);

    expect(screen.getByText(/or use your email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText(/^password/i)).toHaveAttribute("autocomplete", "current-password");
  });

  it("lets the visitor show and hide the password", () => {
    render(<LoginForm nextUrl="/" />);
    const password = screen.getByLabelText(/^password/i);

    expect(password).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Show password" })).toHaveAttribute("aria-pressed", "false");
  });

  it("puts a field's error beside the field, and marks it invalid for a screen reader", async () => {
    mockSignIn.mockResolvedValue({
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: { email: "Enter a valid email address, like juan@example.com." },
    });
    render(<LoginForm nextUrl="/" />);

    submit();

    await waitFor(() => expect(screen.getByText(/Valid email address/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/email address/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("shows one vague sentence for a wrong password", async () => {
    mockSignIn.mockResolvedValue({ status: "error", message: "That email and password do not match an account." });
    render(<LoginForm nextUrl="/" />);

    submit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That email and password do not match an account.");
  });

  it("hands an unconfirmed visitor a way to get a new link, with their address in it", async () => {
    mockSignIn.mockResolvedValue({
      status: "unverified",
      email: "juan@example.ph",
      message: "This account has not confirmed its email address yet. Open the link we sent you, or ask for a new one.",
    });
    render(<LoginForm nextUrl="/tours/me" />);

    submit();

    const resend = await screen.findByRole("link", { name: /send a new verification email/i });
    expect(resend).toHaveAttribute(
      "href",
      `/verify-email?email=${encodeURIComponent("juan@example.ph")}&next=${encodeURIComponent("/tours/me")}`,
    );
  });
});
