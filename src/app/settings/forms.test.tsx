/**
 * @jest-environment jsdom
 */

import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PasswordForm } from "./password-form";
import { PhotoForm } from "./photo-form";
import { ProfileForm } from "./profile-form";
import { changePassword, removeAvatar, saveAvatar, updateName } from "./actions";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }), usePathname: () => "/settings" }));
jest.mock("./actions", () => ({
  updateName: jest.fn(),
  changePassword: jest.fn(),
  sendPasswordReset: jest.fn(),
  saveAvatar: jest.fn(),
  removeAvatar: jest.fn(),
}));
jest.mock("@/lib/tours/compress-image", () => ({
  compressImageFile: jest.fn(async (file: File) => file),
}));

const updateNameMock = updateName as jest.MockedFunction<typeof updateName>;
const changePasswordMock = changePassword as jest.MockedFunction<typeof changePassword>;
const saveAvatarMock = saveAvatar as jest.MockedFunction<typeof saveAvatar>;
const removeAvatarMock = removeAvatar as jest.MockedFunction<typeof removeAvatar>;

const refreshMock = jest.fn();
/** jsdom has no object URLs; the preview only needs a string that looks like one. */
const createObjectURL = jest.fn(() => "blob:preview");
const revokeObjectURL = jest.fn();

beforeAll(() => {
  Object.defineProperty(URL, "createObjectURL", { writable: true, value: createObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { writable: true, value: revokeObjectURL });
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("the name form", () => {
  it("starts with the name the account already has", () => {
    render(<ProfileForm name="Juan Dela Cruz" />);
    expect(screen.getByLabelText(/full name/i)).toHaveValue("Juan Dela Cruz");
  });

  it("puts a field error beside the input and says the name was not saved", async () => {
    updateNameMock.mockResolvedValue({
      status: "error",
      message: "Check your name and try again.",
      fieldErrors: { fullName: "Use letters, spaces, hyphens, dots and commas for your name." },
    });

    render(<ProfileForm name="Juan Dela Cruz" />);
    const input = screen.getByLabelText(/full name/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: "J" } });
      fireEvent.submit(input.closest("form")!);
    });

    expect(await screen.findByText(/use letters, spaces, hyphens/i)).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    // The field's own message and the form's sentence are both announced.
    expect(screen.getAllByRole("alert").map((node) => node.textContent).join(" ")).toMatch(/check your name/i);
  });

  it("confirms a save", async () => {
    updateNameMock.mockResolvedValue({ status: "success", message: "Your name is saved." });

    render(<ProfileForm name="Juan Dela Cruz" />);
    await act(async () => {
      fireEvent.submit(screen.getByLabelText(/full name/i).closest("form")!);
    });

    expect(await screen.findByText("Your name is saved.")).toBeInTheDocument();
  });
});

describe("the password form", () => {
  it("offers the strength hint without making it a rule", async () => {
    render(<PasswordForm />);
    const next = screen.getByLabelText(/^new password\s*\*?$/i);
    await act(async () => {
      fireEvent.change(next, { target: { value: "Calaguas-Sunrise-2026" } });
    });
    expect(screen.getByText(/that one looks/i)).toBeInTheDocument();
  });

  it("shows the server's answer beside the field it belongs to", async () => {
    changePasswordMock.mockResolvedValue({
      status: "error",
      message: "That is not your current password.",
      fieldErrors: { current: "That is not your current password." },
    });

    render(<PasswordForm />);
    await act(async () => {
      fireEvent.submit(screen.getByLabelText(/current password/i).closest("form")!);
    });

    expect((await screen.findAllByText(/that is not your current password/i)).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/current password/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("asks for the three fields by name, autocompleting the way browsers expect", () => {
    render(<PasswordForm />);
    expect(screen.getByLabelText(/current password/i)).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByLabelText(/^new password\s*\*?$/i)).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText(/type the new password again/i)).toHaveAttribute("autocomplete", "new-password");
  });
});

describe("the photo form", () => {
  const photo = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], "me.jpg", { type: "image/jpeg" });

  it("draws the letter when there is no photo, and the photo when there is one", () => {
    const { unmount } = render(<PhotoForm initial="Juan Dela Cruz" avatarUrl={null} />);
    expect(screen.getByText("J")).toBeInTheDocument();
    unmount();

    const url = "https://project.supabase.co/storage/v1/object/public/tours-avatars/u/avatar-1.jpg";
    const { container } = render(<PhotoForm initial="Juan Dela Cruz" avatarUrl={url} />);
    expect(container.querySelector("img")).toHaveAttribute("src", url);
  });

  it("previews the pick, then saves it under the field's own name", async () => {
    saveAvatarMock.mockResolvedValue({ status: "success", message: "Your photo is saved." });
    const { container } = render(<PhotoForm initial="Juan Dela Cruz" avatarUrl={null} />);

    const input = screen.getByLabelText(/choose photo/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [photo()] } });
    });

    await waitFor(() => expect(container.querySelector('img[src="blob:preview"]')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /save photo/i }));
    });

    expect(saveAvatarMock).toHaveBeenCalledTimes(1);
    const sent = saveAvatarMock.mock.calls[0][0] as FormData;
    expect(sent.get("photo")).toBeInstanceOf(File);
    expect(await screen.findByText("Your photo is saved.")).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalled();
  });

  it("takes the photo away", async () => {
    removeAvatarMock.mockResolvedValue({ status: "success", message: "Your photo is removed." });
    render(
      <PhotoForm
        initial="Juan Dela Cruz"
        avatarUrl="https://project.supabase.co/storage/v1/object/public/tours-avatars/u/avatar-1.jpg"
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    });

    expect(removeAvatarMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Your photo is removed.")).toBeInTheDocument();
  });

  it("gives the picker a real label and says what it accepts", () => {
    render(<PhotoForm initial="Juan Dela Cruz" avatarUrl={null} />);
    const input = screen.getByLabelText(/choose photo/i);
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    expect(screen.getByText(/JPG, PNG or WebP, up to 5 MB/i)).toBeInTheDocument();
  });
});
