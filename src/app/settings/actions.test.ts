import { revalidatePath } from "next/cache";
import { clearAttempts } from "@/lib/auth/rate-limit";
import { rememberNextPath } from "@/lib/auth/next-cookie";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import {
  changePassword,
  removeAvatar,
  saveAvatar,
  sendPasswordReset,
  updateName,
} from "./actions";

jest.mock("server-only", () => ({}));
jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}));
jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));
jest.mock("@/lib/tours/server-auth", () => ({
  getAuthenticatedSession: jest.fn(),
}));
jest.mock("@/lib/auth/next-cookie", () => ({
  rememberNextPath: jest.fn(async () => {}),
}));
jest.mock("next/headers", () => ({
  headers: jest.fn(
    async () =>
      new Headers({
        host: "daet.test",
        "x-forwarded-proto": "https",
        "x-forwarded-for": "203.0.113.9",
      }),
  ),
  cookies: jest.fn(async () => ({
    set: jest.fn(),
    get: jest.fn(),
    getAll: jest.fn(() => []),
  })),
}));

const mockClient = createSupabaseServerClient as jest.MockedFunction<
  typeof createSupabaseServerClient
>;
const mockSession = getAuthenticatedSession as jest.MockedFunction<
  typeof getAuthenticatedSession
>;
const mockRevalidate = revalidatePath as jest.MockedFunction<
  typeof revalidatePath
>;

const USER = {
  id: "9b7e5a5e-0000-4000-8000-000000000001",
  email: "juan@example.ph",
};
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PREVIOUS = `https://project.supabase.co/storage/v1/object/public/tours-avatars/${USER.id}/avatar-1.jpg`;

const idle = { status: "idle" as const };

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

/** A PostgREST-shaped table: chainable, and awaitable at the end of an update. */
function table(
  options: {
    row?: Record<string, unknown> | null;
    updateRows?: unknown[];
    updateError?: unknown;
  } = {},
) {
  const {
    row = { avatar_url: null },
    updateRows = [{ id: USER.id }],
    updateError = null,
  } = options;
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    select: jest.fn(() => builder),
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    maybeSingle: jest.fn(async () => ({ data: row, error: null })),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: updateError ? null : updateRows,
        error: updateError,
      }).then(resolve),
  });
  return builder;
}

function client(
  options: Parameters<typeof table>[0] & {
    auth?: Record<string, jest.Mock>;
  } = {},
) {
  const builder = table(options);
  const upload = jest.fn(async () => ({ data: { path: "x" }, error: null }));
  const remove = jest.fn(async () => ({ data: [], error: null }));
  const getPublicUrl = jest.fn(() => ({
    data: {
      publicUrl: `https://project.supabase.co/storage/v1/object/public/tours-avatars/${USER.id}/avatar-2.jpg`,
    },
  }));
  const storage = { from: jest.fn(() => ({ upload, remove, getPublicUrl })) };
  const auth = {
    updateUser: jest.fn(async () => ({ data: { user: {} }, error: null })),
    signInWithPassword: jest.fn(async () => ({
      data: { user: {}, session: {} },
      error: null,
    })),
    signOut: jest.fn(async () => ({ error: null })),
    resetPasswordForEmail: jest.fn(async () => ({ data: {}, error: null })),
    ...options.auth,
  };
  const instance = { auth, from: jest.fn(() => builder), storage };
  mockClient.mockResolvedValue(instance as never);
  return { instance, builder, upload, remove, getPublicUrl, auth };
}

function signedIn(user: { id: string; email?: string | null } = USER) {
  mockSession.mockResolvedValue({
    user: user as never,
    role: "tourist",
    error: null,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  clearAttempts();
  jest.spyOn(console, "error").mockImplementation(() => {});
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  signedIn();
});

describe("saving a name", () => {
  it("refuses a name the schema does not accept, before calling anything", async () => {
    const state = await updateName(idle, form({ fullName: "J" }));

    expect(state.status).toBe("error");
    expect(state.fieldErrors?.fullName).toMatch(/full name/i);
    expect(mockClient).not.toHaveBeenCalled();
  });

  it("refuses the hidden characters a name can carry", async () => {
    const state = await updateName(idle, form({ fullName: "Juan\u202eDela" }));
    expect(state.fieldErrors?.fullName).toMatch(/hidden characters/i);
  });

  it("writes both records and refreshes the header", async () => {
    const { auth } = client();

    const state = await updateName(
      idle,
      form({ fullName: "  Juan   Dela Cruz " }),
    );

    expect(state).toEqual({
      status: "success",
      message: "Your name is saved.",
    });
    expect(auth.updateUser).toHaveBeenCalledWith({
      data: { full_name: "Juan Dela Cruz" },
    });
    expect(mockRevalidate).toHaveBeenCalledWith("/", "layout");
  });

  it("says it failed when the profile row was not written", async () => {
    // An update that matches nothing is a silent no-op; the page must not claim
    // a save that did not happen.
    client({ updateRows: [] });

    const state = await updateName(idle, form({ fullName: "Juan Dela Cruz" }));

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/could not save/i);
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it("does nothing at all without a session", async () => {
    mockSession.mockResolvedValue({ user: null, role: null, error: null });

    const state = await updateName(idle, form({ fullName: "Juan Dela Cruz" }));

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/session has ended/i);
    expect(mockClient).not.toHaveBeenCalled();
  });
});

describe("changing a password", () => {
  const typed = {
    current: "Bagasbas-Waves-2026",
    password: "Calaguas-Sunrise-2026",
    confirm: "Calaguas-Sunrise-2026",
  };

  it("checks the two new fields against the shared policy", async () => {
    const state = await changePassword(
      idle,
      form({ ...typed, confirm: "something-else-entirely" }),
    );

    expect(state.fieldErrors?.confirm).toMatch(/do not match/i);
    expect(mockClient).not.toHaveBeenCalled();
  });

  it("refuses the password that is already there", async () => {
    const state = await changePassword(
      idle,
      form({ ...typed, password: typed.current, confirm: typed.current }),
    );
    expect(state.fieldErrors?.password).toMatch(/current password/i);
  });

  it("proves the current password before it saves anything", async () => {
    const { auth } = client({
      auth: {
        signInWithPassword: jest.fn(async () => ({
          data: {},
          error: {
            code: "invalid_credentials",
            message: "Invalid login credentials",
          },
        })),
      },
    });

    const state = await changePassword(idle, form(typed));

    expect(state.status).toBe("error");
    expect(state.message).toBe("That is not your current password.");
    expect(state.fieldErrors?.current).toBe(
      "That is not your current password.",
    );
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("saves the new password and ends every other session", async () => {
    const { auth } = client();

    const state = await changePassword(idle, form(typed));

    expect(state.status).toBe("success");
    expect(state.message).toMatch(/other devices have been signed out/i);
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: USER.email,
      password: typed.current,
    });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: typed.password });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("still saves when ending the other sessions does not work", async () => {
    const { auth } = client({
      auth: {
        signOut: jest.fn(async () => Promise.reject(new Error("offline"))),
      },
    });

    const state = await changePassword(idle, form(typed));

    expect(state.status).toBe("success");
    expect(auth.updateUser).toHaveBeenCalled();
  });

  it("stops after five wrong guesses in a quarter of an hour", async () => {
    const wrong = jest.fn(async () => ({
      data: {},
      error: { code: "invalid_credentials", message: "no" },
    }));
    client({ auth: { signInWithPassword: wrong } });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await changePassword(idle, form(typed));
    }
    const sixth = await changePassword(idle, form(typed));

    expect(sixth.status).toBe("error");
    expect(sixth.message).toMatch(/too many attempts/i);
    expect(wrong).toHaveBeenCalledTimes(5);
  });

  it("tells a Google account there is no password to change", async () => {
    signedIn({ id: USER.id, email: null });

    const state = await changePassword(idle, form(typed));

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/no email address/i);
    expect(mockClient).not.toHaveBeenCalled();
  });
});

describe("asking for a reset link", () => {
  it("sends it to the address on the session, through the existing callback", async () => {
    const { auth } = client();

    const state = await sendPasswordReset(idle, new FormData());

    expect(state.status).toBe("success");
    expect(state.message).toContain(USER.email);
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(
      USER.email,
      expect.objectContaining({
        redirectTo: expect.stringMatching(/\/auth\/callback/),
      }),
    );
    expect(rememberNextPath).toHaveBeenCalledWith("/reset-password");
  });

  it("answers a rate-limited mailer with its own sentence", async () => {
    client({
      auth: {
        resetPasswordForEmail: jest.fn(async () => ({
          data: {},
          error: {
            code: "over_email_send_rate_limit",
            message: "email rate limit exceeded",
          },
        })),
      },
    });

    const state = await sendPasswordReset(idle, new FormData());

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/wait a little/i);
  });

  it("sends nothing without a session", async () => {
    mockSession.mockResolvedValue({ user: null, role: null, error: null });

    const state = await sendPasswordReset(idle, new FormData());

    expect(state.status).toBe("error");
    expect(mockClient).not.toHaveBeenCalled();
  });
});

describe("the account photo", () => {
  it("refuses an empty picker", async () => {
    const state = await saveAvatar(new FormData());
    expect(state.status).toBe("error");
    expect(state.message).toMatch(/choose a photo/i);
    expect(mockClient).not.toHaveBeenCalled();
  });

  it("refuses a file that is not really an image", async () => {
    client();
    const data = new FormData();
    data.set(
      "photo",
      new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "me.jpg", {
        type: "image/jpeg",
      }),
    );

    const state = await saveAvatar(data);

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/not a JPG, PNG or WebP photo/i);
  });

  it("uploads under the person's own id, then points the profile at it", async () => {
    const { upload, getPublicUrl, builder } = client({
      row: { avatar_url: PREVIOUS },
    });
    const data = new FormData();
    data.set("photo", new File([JPEG], "me.jpg", { type: "image/jpeg" }));

    const state = await saveAvatar(data);

    expect(state.status).toBe("success");
    const [key] = upload.mock.calls[0] as unknown as [string];
    expect(key).toMatch(
      new RegExp(`^tours-avatars/${USER.id}/avatar-\\d+\\.jpg$`),
    );
    expect(builder.update).toHaveBeenCalledWith({
      avatar_url: getPublicUrl().data.publicUrl,
    });
    expect(mockRevalidate).toHaveBeenCalledWith("/", "layout");
  });

  it("does not write the row without a session", async () => {
    mockSession.mockResolvedValue({ user: null, role: null, error: null });
    const data = new FormData();
    data.set("photo", new File([JPEG], "me.jpg", { type: "image/jpeg" }));

    const state = await saveAvatar(data);

    expect(state.status).toBe("error");
    expect(mockClient).not.toHaveBeenCalled();
  });

  it("takes the old file away when the row cannot be written", async () => {
    const { remove } = client({ updateError: { message: "denied" } });
    const data = new FormData();
    data.set("photo", new File([JPEG], "me.jpg", { type: "image/jpeg" }));

    const state = await saveAvatar(data);

    expect(state.status).toBe("error");
    // The uploaded file is an orphan without its row, so it goes too.
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("removes the photo and the file behind it", async () => {
    const { builder, remove } = client({ row: { avatar_url: PREVIOUS } });

    const state = await removeAvatar();

    expect(state.status).toBe("success");
    expect(builder.update).toHaveBeenCalledWith({ avatar_url: null });
    expect(remove).toHaveBeenCalledWith([
      `tours-avatars/${USER.id}/avatar-1.jpg`,
    ]);
    expect(mockRevalidate).toHaveBeenCalledWith("/", "layout");
  });
});
