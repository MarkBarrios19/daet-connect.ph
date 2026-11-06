/** "jeremiah@gmail.com" -> "j***@gmail.com": enough to recognise the inbox, not to expose it. */
export function maskEmail(email: string | null | undefined): string | null {
  const match = /^([^@\s])[^@\s]*(@[^@\s]+)$/.exec((email ?? "").trim());
  return match ? `${match[1]}***${match[2]}` : null;
}
