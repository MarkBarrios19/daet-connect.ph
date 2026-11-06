import { z } from "zod";

/**
 * One definition of a good email address, name and password, used by the
 * Server Actions (which are the real gate) and by the forms (which only save a
 * round trip). Nothing here trusts the browser: the same schema parses what the
 * visitor typed, whether it arrived through the form or from a script that
 * posted the action directly.
 */

/** Longest address SMTP guarantees anywhere; Supabase enforces this too. */
export const EMAIL_MAX = 254;

/** bcrypt cuts a password at 72 bytes, so anything longer would be truncated. */
export const PASSWORD_MAX = 72;

/** Shortest password we accept. NIST SP 800-63B asks for at least 8. */
export const PASSWORD_MIN = 8;

/**
 * The passwords that fill the top of every breach list. Rejecting them costs
 * nothing and removes the most likely guess for any given account.
 */
const COMMON_PASSWORDS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "1234567890q",
  "password",
  "password1",
  "password12",
  "password123",
  "password1234",
  "passw0rd",
  "p@ssw0rd",
  "p@ssword",
  "qwertyui",
  "qwerty123",
  "qwertyuiop",
  "iloveyou",
  "admin123",
  "administrator",
  "letmein1",
  "welcome1",
  "welcome123",
  "monkey123",
  "dragon123",
  "sunshine",
  "princess",
  "football",
  "baseball",
  "superman",
  "trustno1",
  "abc12345",
  "abcd1234",
  "a1b2c3d4",
  "11111111",
  "00000000",
  "88888888",
  "asdfghjk",
  "asdf1234",
  "zxcvbnm1",
  "changeme",
  "secret123",
  "testtest",
  "daet1234",
  "daetconnect",
]);

const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const NAME_SHAPE = /^[\p{L}\p{M}][\p{L}\p{M}'.,\- ]*$/u;
/** Bidi overrides and other format characters have no place in a name. */
const INVISIBLE =
  /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/;

/**
 * Email: trimmed, lower-cased, and only what an address can be. Lower-casing is
 * the one normalisation that is safe across providers — plus-addressing and
 * Gmail's dots stay untouched, so a visitor keeps the mailbox they typed.
 */
export const emailSchema = z
  .string({ error: "Enter your email address." })
  .trim()
  .min(3, "Enter your email address.")
  .max(EMAIL_MAX, `That email address is longer than ${EMAIL_MAX} characters.`)
  .regex(EMAIL_SHAPE, "Enter a valid email address, like juan@example.com.")
  .refine(
    (value) => value.length - value.lastIndexOf("@") - 1 <= EMAIL_MAX,
    "Enter a valid email address.",
  )
  .transform((value) => value.toLowerCase());

/**
 * Password: length, the common list, and nothing that trims away. No character
 * rules — they push people towards `Password1!` — but a cap at bcrypt's limit
 * and a refusal of whitespace-only input, which is always a paste accident.
 */
export const passwordSchema = z
  .string({ error: "Choose a password." })
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Use ${PASSWORD_MAX} characters or fewer.`)
  .refine(
    (value) => value.trim().length > 0,
    "A password cannot be only spaces.",
  )
  .refine(
    (value) => new Set(value).size > 2,
    "Use a password with more than two different characters.",
  )
  .refine(
    (value) => !COMMON_PASSWORDS.has(value.toLowerCase()),
    "That password is on the list of the most common ones. Choose something only you would know.",
  );

/** A name as people write it: letters, marks, spaces, hyphens, apostrophes, dots. */
export const fullNameSchema = z
  .string({ error: "Enter your full name." })
  .trim()
  .min(2, "Enter your full name.")
  .max(80, "Keep your name to 80 characters or fewer.")
  .refine(
    (value) => !INVISIBLE.test(value),
    "Remove the hidden characters from your name.",
  )
  .refine(
    (value) => NAME_SHAPE.test(value),
    "Use letters, spaces, hyphens, dots and commas for your name.",
  )
  .transform((value) => value.replace(/\s+/g, " "));

/** The email-only forms: reset, resend, and the sign-in fallback. */
export const emailOnlySchema = z.object({ email: emailSchema });

/** The account page's name field: the same name rules the sign-up form uses. */
export const profileNameSchema = z.object({ fullName: fullNameSchema });

export const signInSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: "Enter your password." })
    .min(1, "Enter your password."),
});

export const signUpSchema = z
  .object({
    fullName: fullNameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirm: z.string({ error: "Type the password again." }).min(1, "Type the password again."),
  })
  .refine((value) => value.password === value.confirm, {
    path: ["confirm"],
    message: "The two passwords do not match.",
  });

export const newPasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string({ error: "Type the password again." }),
  })
  .refine((value) => value.password === value.confirm, {
    path: ["confirm"],
    message: "The two passwords do not match.",
  });

/**
 * Changing a password from the account page, where the person is already
 * signed in: the current one is typed again so an unlocked laptop cannot be
 * used to take the account, and the new one follows the same policy as sign-up
 * and reset.
 */
export const changePasswordSchema = z
  .object({
    current: z
      .string({ error: "Type your current password." })
      .min(1, "Type your current password.")
      .max(PASSWORD_MAX, `Passwords are at most ${PASSWORD_MAX} characters.`),
    password: passwordSchema,
    confirm: z.string({ error: "Type the new password again." }),
  })
  .refine((value) => value.password === value.confirm, {
    path: ["confirm"],
    message: "The two passwords do not match.",
  })
  .refine((value) => value.current !== value.password, {
    path: ["password"],
    message: "That is your current password. Choose a new one.",
  });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;

/** What a form field may hold, whatever the browser sent. */
export function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/**
 * The first message for each field, so a form can put it beside the input.
 * Extra keys in the payload are dropped: only the schema's fields are read.
 */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && issue.message && !(field in errors)) {
      errors[field] = issue.message;
    }
  }
  return errors;
}

/**
 * How strong the password looks, for the hint under the field. This is advice
 * for the visitor, never a gate: the schema above decides.
 */
export function passwordScore(password: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
} {
  if (!password) return { score: 0, label: "" };
  let score = 0;
  if (password.length >= PASSWORD_MIN) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;
  if (COMMON_PASSWORDS.has(password.toLowerCase())) score = Math.min(score, 1);
  const clamped = Math.max(0, Math.min(4, score)) as 0 | 1 | 2 | 3 | 4;
  return {
    score: clamped,
    label: ["Weak", "Weak", "Fair", "Good", "Strong"][clamped],
  };
}
