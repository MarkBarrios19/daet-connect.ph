import "server-only";
import { headers } from "next/headers";

export type HeaderLike = { get(name: string): string | null };

/**
 * Where this request came from, used to build email links. A link has to point
 * at the site the visitor is using (a preview host, localhost, production), so
 * the request's own host is the source of truth — but a `Host` header is
 * attacker-controlled, and a link built from it would send the visitor's
 * confirmation code to someone else. So:
 *
 * 1. An explicitly configured NEXT_PUBLIC_APP_URL always wins.
 * 2. Otherwise the host must look exactly like a host and nothing else.
 *
 * Supabase also refuses to redirect to a URL outside the project's allow list,
 * so a forged host fails there too — this is the first of the two locks.
 */
export function authOrigin(headerList: HeaderLike): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured && isSafeOrigin(configured)) return configured.replace(/\/+$/, "");

  const host = (headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "").split(",")[0].trim();
  const proto = headerList.get("x-forwarded-proto") ?? guessProtocol(host);

  if (!isHostname(host)) return "http://localhost:3000";
  return `${proto === "http" ? "http" : "https"}://${host}`;
}

const PRIVATE_HOST = /^(localhost|127\.|0\.0\.0\.0|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i;

/**
 * Which scheme a request without `x-forwarded-proto` arrived on. Localhost and
 * private addresses are being developed against (`next dev` speaks plain HTTP);
 * so is anything on a port other than 443. Everything else is a deployment
 * behind a TLS proxy that failed to say so, and HTTPS is the safe answer.
 */
function guessProtocol(host: string): "http" | "https" {
  if (PRIVATE_HOST.test(host)) return "http";
  const port = /:(\d{1,5})$/.exec(host)?.[1];
  if (port && port !== "443") return "http";
  return "https";
}

/** `https://daet.ph` yes; `https://evil.example/` with a path, no. */
function isSafeOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.search && !url.hash && isHostname(url.host);
  } catch {
    return false;
  }
}

const HOSTNAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*(:\d{1,5})?$/i;

export function isHostname(value: string): boolean {
  return value.length > 0 && value.length <= 253 && HOSTNAME.test(value);
}

/**
 * The caller's address, for the rate limiter. Behind Vercel or another proxy
 * the left-most `x-forwarded-for` entry is the client; without one, every
 * caller shares a bucket, which is the safe direction (stricter).
 */
export function clientIp(headerList: HeaderLike): string {
  const forwarded = headerList.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first && /^[0-9a-fA-F:.]{3,45}$/.test(first)) return first;
  const real = headerList.get("x-real-ip")?.trim();
  if (real && /^[0-9a-fA-F:.]{3,45}$/.test(real)) return real;
  return "unknown";
}

/** Both, read once, for the Server Actions. */
export async function authRequestContext(): Promise<{ ip: string; origin: string }> {
  const headerList = await headers();
  return { ip: clientIp(headerList), origin: authOrigin(headerList) };
}

/** `https://site/auth/callback`, with nothing else in it. */
export function authCallbackUrl(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/auth/callback`;
}
