import "server-only";
import nodemailer from "nodemailer";

/**
 * Transactional email through a Gmail account (SMTP with an app password).
 * Set GMAIL_USER, GMAIL_APP_PASSWORD and optionally EMAIL_FROM. Without them
 * nothing is sent and the call logs once and returns false, so previews and
 * local runs never email real people. Callers never see an exception.
 * Gmail allows about 500 recipients a day on a free account; swap the
 * transport here for a provider when bookings outgrow that.
 */

export type EmailMessage = { to: string; subject: string; text: string; html: string };

export function isEmailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

let transport: nodemailer.Transporter | null = null;
function getTransport() {
  transport ??= nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: (process.env.GMAIL_APP_PASSWORD ?? "").replace(/\s+/g, "") },
  });
  return transport;
}

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export async function sendEmail(message: EmailMessage): Promise<boolean> {
  if (!isEmailConfigured()) {
    console.info(`Email not sent (GMAIL_USER / GMAIL_APP_PASSWORD not set): ${message.subject}`);
    return false;
  }
  if (!EMAIL.test(message.to)) {
    console.warn("Email not sent: invalid recipient address.");
    return false;
  }
  try {
    await getTransport().sendMail({
      from: process.env.EMAIL_FROM || `CONNECT-Daet <${process.env.GMAIL_USER}>`,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return true;
  } catch (error) {
    // Log without the address: it is personal data.
    console.error("Email send failed:", error instanceof Error ? error.message : error);
    return false;
  }
}
