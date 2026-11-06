import {
  EMAIL_MAX,
  PASSWORD_MAX,
  emailSchema,
  fieldErrorsOf,
  formString,
  fullNameSchema,
  newPasswordSchema,
  passwordSchema,
  passwordScore,
  signInSchema,
  signUpSchema,
} from "@/lib/auth/validation";

function email(value: string) {
  return emailSchema.safeParse(value);
}

describe("email validation", () => {
  it.each([
    ["juan@example.ph", "juan@example.ph"],
    ["  Juan@Example.PH  ", "juan@example.ph"],
    ["maria.santos+tours@daet.gov.ph", "maria.santos+tours@daet.gov.ph"],
    ["a@b.co", "a@b.co"],
  ])("accepts %p and normalises it to %p", (input, expected) => {
    const result = email(input);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "juan",
    "juan@",
    "@example.ph",
    "juan@example",
    "juan@@example.ph",
    "juan@example..ph",
    "juan de la cruz@example.ph",
    "juan@exa mple.ph",
    "juan@example.ph\nBcc: evil@example.ph",
  ])("rejects %p", (input) => {
    expect(email(input).success).toBe(false);
  });

  it("caps the length at the SMTP maximum", () => {
    const local = "a".repeat(EMAIL_MAX);
    expect(email(`${local}@example.ph`).success).toBe(false);
    expect(email(`${"a".repeat(60)}@example.ph`).success).toBe(true);
  });

  it("says something a person can act on", () => {
    const result = email("not-an-email");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toMatch(/valid email address/i);
  });
});

describe("password validation", () => {
  it("accepts a long passphrase", () => {
    expect(passwordSchema.safeParse("bagasbas-waves-at-sunrise").success).toBe(true);
  });

  it.each(["", "short", "1234567"])("rejects %p as too short", (value) => {
    expect(passwordSchema.safeParse(value).success).toBe(false);
  });

  it("rejects the passwords at the top of every breach list", () => {
    for (const weak of ["password", "Password123", "qwerty123", "iloveyou"]) {
      expect(passwordSchema.safeParse(weak).success).toBe(false);
    }
  });

  it("refuses more than bcrypt keeps, so nothing is silently truncated", () => {
    expect(passwordSchema.safeParse("a1B".repeat(25)).success).toBe(false);
    expect(passwordSchema.safeParse("a1B".repeat(PASSWORD_MAX / 3)).success).toBe(true);
  });

  it("rejects whitespace-only and single-character passwords", () => {
    expect(passwordSchema.safeParse("        ").success).toBe(false);
    expect(passwordSchema.safeParse("aaaaaaaaaaaa").success).toBe(false);
  });

  it("does not trim a real password", () => {
    const parsed = passwordSchema.safeParse(" leading and trailing ");
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe(" leading and trailing ");
  });

  it("scores strength as advice, never as a gate", () => {
    expect(passwordScore("").score).toBe(0);
    expect(passwordScore("short").label).toBe("Weak");
    expect(passwordScore("Bagasbas-Waves-2026").score).toBeGreaterThanOrEqual(3);
  });
});

describe("full name validation", () => {
  it.each(["Juan Dela Cruz", "Ma. Cristina Santos", "Jose Rizal, Jr.", "Ana-Maria O'Neill", "José Peña"])(
    "accepts %p",
    (value) => {
      expect(fullNameSchema.safeParse(value).success).toBe(true);
    },
  );

  it("collapses runs of spaces", () => {
    const parsed = fullNameSchema.safeParse("  Juan    Dela   Cruz ");
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe("Juan Dela Cruz");
  });

  it.each(["J", "", "   ", "Juan 123", "<script>alert(1)</script>", "Juan\nDela Cruz", "Juan\u202eCruz"])(
    "rejects %p",
    (value) => {
      expect(fullNameSchema.safeParse(value).success).toBe(false);
    },
  );

  it("caps the length", () => {
    expect(fullNameSchema.safeParse("a".repeat(81)).success).toBe(false);
  });
});

describe("the form schemas", () => {
  it("trims and lower-cases what the browser sent", () => {
    const parsed = signUpSchema.safeParse({
      fullName: "  Juan Dela Cruz ",
      email: " Juan@Example.PH ",
      password: "bagasbas-waves-at-sunrise",
      confirm: "bagasbas-waves-at-sunrise",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({
        fullName: "Juan Dela Cruz",
        email: "juan@example.ph",
        password: "bagasbas-waves-at-sunrise",
        confirm: "bagasbas-waves-at-sunrise",
      });
    }
  });

  it("requires the sign-up password and confirmation to match", () => {
    const parsed = signUpSchema.safeParse({
      fullName: "Juan Dela Cruz",
      email: "juan@example.ph",
      password: "bagasbas-waves-at-sunrise",
      confirm: "another-password",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(fieldErrorsOf(parsed.error)).toEqual({ confirm: "The two passwords do not match." });
    }
  });

  it("sign-in only checks that a password is there — never its shape", () => {
    // A rule added today must not lock out an account created before it.
    const parsed = signInSchema.safeParse({ email: "juan@example.ph", password: "old" });
    expect(parsed.success).toBe(true);
  });

  it("matches the two password fields and blames the second one", () => {
    const parsed = newPasswordSchema.safeParse({ password: "bagasbas-waves-at-sunrise", confirm: "bagasbas" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(fieldErrorsOf(parsed.error)).toEqual({ confirm: "The two passwords do not match." });
    }
  });
});

describe("form helpers", () => {
  it("reads only strings, so a File in a text field is not one", () => {
    const data = new FormData();
    data.set("email", "juan@example.ph");
    data.set("photo", new File(["x"], "x.png", { type: "image/png" }));
    expect(formString(data, "email")).toBe("juan@example.ph");
    expect(formString(data, "photo")).toBe("");
    expect(formString(data, "missing")).toBe("");
  });

  it("keeps the first message per field", () => {
    const parsed = signUpSchema.safeParse({ fullName: "", email: "nope", password: "", confirm: "" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const fields = fieldErrorsOf(parsed.error);
      expect(Object.keys(fields).sort()).toEqual(["confirm", "email", "fullName", "password"]);
      expect(fields.email).toMatch(/valid email/i);
    }
  });
});
