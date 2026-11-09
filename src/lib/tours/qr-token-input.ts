export type ScannableQrType = "guide" | "booking";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_SEGMENT = /\/tours\/verify\/([^/?#]+)\/?$/;

/**
 * Pull the expected signed QR token out of a raw token or a verify URL.
 * This only checks its public shape; signature, expiry and current status are
 * verified on the server by /tours/verify/[token].
 */
export function extractQrTokenForType(scanned: string, expectedType: ScannableQrType): string | null {
  const text = scanned.trim();
  if (!text) return null;

  let token = text;
  if (!text.startsWith("CD1.")) {
    try {
      const url = text.startsWith("/tours/verify/")
        ? new URL(text, "https://connect-daet.invalid")
        : new URL(text);
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
      const match = TOKEN_SEGMENT.exec(url.pathname);
      if (!match) return null;
      token = decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  }

  const parts = token.split(".");
  if (parts.length !== 5) return null;
  const [version, type, id, exp, signature] = parts;
  if (version !== "CD1" || type !== expectedType || !UUID.test(id) || id !== id.toLowerCase()) return null;
  if (!/^\d{1,12}$/.test(exp) || Number(exp) <= 0 || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  return token;
}
