/**
 * The proxy against the real Supabase client with only `fetch` faked: what it
 * sends to Supabase Auth, and the cookies it writes back.
 */
import { NextRequest } from "next/server";
import { generateKeyPairSync, createSign, randomBytes } from "node:crypto";
import { proxy } from "@/proxy";

const URL_BASE = "https://refproj.supabase.co";
const COOKIE = "sb-refproj-auth-token";
const b64 = (value: object | Buffer) => Buffer.from(value instanceof Buffer ? value : JSON.stringify(value)).toString("base64url");

function jwt(payload: object, header: object, sign?: (data: string) => Buffer) {
  const data = `${b64(header)}.${b64(payload)}`;
  return `${data}.${b64(sign ? sign(data) : Buffer.from("secret"))}`;
}

function sessionCookie(accessToken: string, expiresAt: number) {
  const session = {
    access_token: accessToken,
    refresh_token: "refresh-1",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    user: { id: "user-1", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" },
  };
  return `${COOKIE}=base64-${b64(session)}`;
}

function request(cookie: string) {
  return new NextRequest(new URL("/tours/me", "https://daet.test"), { headers: { host: "daet.test", cookie } });
}

const nowSec = () => Math.floor(Date.now() / 1000);
const claimsFor = (exp: number) => ({ sub: "user-1", aud: "authenticated", role: "authenticated", exp, iat: exp - 3600, iss: `${URL_BASE}/auth/v1`, session_id: "s", aal: "aal1" });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("the session refresher against Supabase Auth", () => {
  const realFetch = global.fetch;
  const env = process.env;
  let calls: string[];
  let handlers: Record<string, (init?: RequestInit) => Response>;

  beforeEach(() => {
    process.env = { ...env, NEXT_PUBLIC_SUPABASE_URL: URL_BASE, NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" };
    calls = [];
    handlers = {};
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const key = `${init?.method ?? "GET"} ${u.pathname}`;
      calls.push(key);
      const handler = handlers[key];
      if (!handler) throw new Error(`unexpected request: ${key}`);
      return handler(init);
    }) as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
    process.env = env;
  });

  it("refreshes an expired access token and writes the new session cookie", async () => {
    const fresh = jwt(claimsFor(nowSec() + 3600), { alg: "HS256", typ: "JWT" });
    handlers["POST /auth/v1/token"] = () =>
      json({ access_token: fresh, refresh_token: "refresh-2", token_type: "bearer", expires_in: 3600, expires_at: nowSec() + 3600, user: { id: "user-1", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" } });
    // HS256 token: getClaims falls back to asking Supabase Auth.
    handlers["GET /auth/v1/user"] = () => json({ id: "user-1", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" });

    const expired = jwt(claimsFor(nowSec() - 60), { alg: "HS256", typ: "JWT" });
    const response = await proxy(request(sessionCookie(expired, nowSec() - 60)));

    expect(calls[0]).toBe("POST /auth/v1/token");
    const written = response?.cookies.get(COOKIE)?.value ?? "";
    expect(written).toContain("base64-");
    expect(Buffer.from(written.replace("base64-", ""), "base64url").toString()).toContain("refresh-2");
  });

  it("verifies a valid asymmetric token locally: one cached key fetch, no user lookup", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const kid = randomBytes(4).toString("hex");
    const sign = (data: string) => createSign("SHA256").update(data).sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
    const token = jwt(claimsFor(nowSec() + 3000), { alg: "ES256", typ: "JWT", kid }, sign);
    handlers["GET /auth/v1/.well-known/jwks.json"] = () => json({ keys: [{ ...publicKey.export({ format: "jwk" }), kid, alg: "ES256", use: "sig", key_ops: ["verify"] }] });

    await proxy(request(sessionCookie(token, nowSec() + 3000)));
    await proxy(request(sessionCookie(token, nowSec() + 3000)));

    expect(calls).not.toContain("GET /auth/v1/user");
    expect(calls).not.toContain("POST /auth/v1/token");
    // Keys are cached across requests in one server process.
    expect(calls.filter((c) => c.endsWith("jwks.json")).length).toBeLessThanOrEqual(1);
  });

  it("does not trust a token whose signature does not verify", async () => {
    const { publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const { privateKey: other } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const kid = randomBytes(4).toString("hex");
    const forged = jwt(claimsFor(nowSec() + 3000), { alg: "ES256", typ: "JWT", kid }, (data) =>
      createSign("SHA256").update(data).sign({ key: other, dsaEncoding: "ieee-p1363" }),
    );
    handlers["GET /auth/v1/.well-known/jwks.json"] = () => json({ keys: [{ ...publicKey.export({ format: "jwk" }), kid, alg: "ES256", use: "sig", key_ops: ["verify"] }] });

    const response = await proxy(request(sessionCookie(forged, nowSec() + 3000)));
    expect(response).toBeDefined();
    expect(calls).not.toContain("GET /auth/v1/user");
  });
});
