/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { signUpWithPassword } from "./actions";
import { SignupForm } from "./signup-form";

jest.mock("./actions", () => ({ signUpWithPassword: jest.fn() }));

const mockSignUp = signUpWithPassword as jest.MockedFunction<typeof signUpWithPassword>;

function submit() {
  const form = screen.getByRole("button", { name: "Create account" }).closest("form");
  expect(form).not.toBeNull();
  fireEvent.submit(form!);
}

describe("the sign-up form", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignUp.mockResolvedValue({ status: "idle" });
  });

  it("offers Google with the same destination as the form", () => {
    render(<SignupForm nextUrl="/tours/me" />);
    const google = screen.getByRole("link", { name: /continue with google/i });
    expect(google).toHaveAttribute("href", `/auth/oauth?next=${encodeURIComponent("/tours/me")}`);
  });

  it("asks for a name, an address and a password, with the browser's own help", () => {
    render(<SignupForm />);

    expect(screen.getByLabelText(/full name/i)).toHaveAttribute("autocomplete", "name");
    expect(screen.getByLabelText(/email address/i)).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText(/^password/i)).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByText(/your account stays inactive until you open it/i)).toBeInTheDocument();
  });

  it("stops at the confirmation step, and swaps the form for what to do next", async () => {
    mockSignUp.mockResolvedValue({
      status: "check-email",
      email: "juan@example.ph",
      message: "Open the link we sent to juan@example.ph to finish creating your account.",
    });
    render(<SignupForm nextUrl="/tours/me" />);

    submit();

    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument();
    // No second sign-up with the same address: the form is gone.
    expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument();
    const resend = screen.getByRole("link", { name: /send the link again/i });
    expect(resend).toHaveAttribute(
      "href",
      `/verify-email?email=${encodeURIComponent("juan@example.ph")}&next=${encodeURIComponent("/tours/me")}`,
    );
  });

  it("shows every field's complaint at once", async () => {
    mockSignUp.mockResolvedValue({
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: {
        fullName: "Enter your full name.",
        email: "Enter a valid email address, like juan@example.com.",
        password: "That password is on the list of the most common ones. Choose something only you would know.",
      },
    });
    render(<SignupForm />);

    submit();

    await waitFor(() => expect(screen.getByText(/Enter your full name/i)).toBeInTheDocument());
    expect(screen.getByText(/Valid email address/i)).toBeInTheDocument();
    expect(screen.getByText(/most common ones/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("says the project is misconfigured when confirmation is off, rather than pretending", async () => {
    mockSignUp.mockResolvedValue({
      status: "error",
      message:
        "Accounts on this site must confirm their email address first, but the project is not asking for that. Please tell the Daet Tourism Office (email confirmation is switched off in Supabase).",
    });
    render(<SignupForm />);

    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(/confirm their email address first/i);
  });
});
