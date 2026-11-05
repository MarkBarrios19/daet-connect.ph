jest.mock("server-only", () => ({}));
const sendMail = jest.fn().mockResolvedValue({});
jest.mock("nodemailer", () => ({ __esModule: true, default: { createTransport: jest.fn(() => ({ sendMail })) } }));

import { isEmailConfigured, sendEmail } from "@/lib/email/send";

const message = { to: "guest@example.com", subject: "Hi", text: "Hello", html: "<p>Hello</p>" };

describe("sendEmail", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    sendMail.mockClear();
  });

  it("sends nothing without Gmail settings", async () => {
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    expect(isEmailConfigured()).toBe(false);
    await expect(sendEmail(message)).resolves.toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends through Gmail with the configured sender", async () => {
    process.env.GMAIL_USER = "connect.daet@gmail.com";
    process.env.GMAIL_APP_PASSWORD = "abcd efgh ijkl mnop";
    process.env.EMAIL_FROM = "CONNECT-Daet <connect.daet@gmail.com>";
    await expect(sendEmail(message)).resolves.toBe(true);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: "CONNECT-Daet <connect.daet@gmail.com>", to: "guest@example.com", subject: "Hi" }));
  });

  it("rejects a bad address and never throws when Gmail fails", async () => {
    process.env.GMAIL_USER = "a@gmail.com";
    process.env.GMAIL_APP_PASSWORD = "x";
    await expect(sendEmail({ ...message, to: "not an email" })).resolves.toBe(false);
    sendMail.mockRejectedValueOnce(new Error("535 auth"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendEmail(message)).resolves.toBe(false);
  });
});
