/**
 * Test-only ES256 signing for the e2e suite. The key below is committed on
 * purpose and protects nothing: it only lets the mock Supabase serve a JWKS and
 * sign access tokens that the app verifies locally with auth.getClaims(), the
 * way it does against a project that uses asymmetric signing keys.
 */
const crypto = require("node:crypto");

const KID = "e2e-test-key";
const PRIVATE_JWK = {"kty":"EC","x":"UyXoGaIPkORrVEf7pgnh7tkVueEwLPmCK5IJ7RG5EKA","y":"eOXPazfiRpdgdo9ePtMmG2ZVAh_qnadmgOLAZSA2lqM","crv":"P-256","d":"545p59vGfqR0g1rAYLDUJqfKxIZ5NUEvc_9n3nqs_tU"};

const privateKey = crypto.createPrivateKey({ key: PRIVATE_JWK, format: "jwk" });
const { d: _d, ...publicJwk } = PRIVATE_JWK;
const JWKS = { keys: [{ ...publicJwk, kid: KID, alg: "ES256", use: "sig", key_ops: ["verify"] }] };

const b64 = (value) => Buffer.from(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).toString("base64url");

/** A signed access token for `role` (tourist | operator | guide | admin). */
function signAccessToken(role, { sub = "9b7e5a5e-0000-4000-8000-000000000001", email = "juan@example.ph", metadata = {}, expiresInSeconds = 3600 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const data = b64({ alg: "ES256", typ: "JWT", kid: KID }) + "." + b64({
    iss: "http://127.0.0.1:54329/auth/v1",
    aud: "authenticated",
    role: "authenticated",
    sub,
    email,
    iat: now,
    exp: now + expiresInSeconds,
    session_id: "e2e-session",
    aal: "aal1",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: metadata,
    e2e_role: role,
  });
  const signature = crypto.createSign("SHA256").update(data).sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
  return data + "." + b64(signature);
}

/** The e2e role a token stands for: a signed token's `e2e_role`, or a legacy "e2e-<role>" string. */
function roleOfToken(token) {
  const legacy = /^e2e-(tourist|operator|guide|admin)$/.exec(token);
  if (legacy) return legacy[1];
  const parts = token.split(".");
  if (parts.length !== 3) return "anon";
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    const ok = crypto.createVerify("SHA256").update(parts[0] + "." + parts[1]).verify({ key: crypto.createPublicKey({ key: publicJwk, format: "jwk" }), dsaEncoding: "ieee-p1363" }, Buffer.from(parts[2], "base64url"));
    if (ok && payload.exp > Date.now() / 1000 && /^(tourist|operator|guide|admin)$/.test(payload.e2e_role)) return payload.e2e_role;
  } catch {}
  return "anon";
}

module.exports = { JWKS, signAccessToken, roleOfToken };
