import { authCallbackUrl, authOrigin, clientIp, isHostname } from "@/lib/auth/request";

function requestHeaders(values: Record<string, string>) {
  return { get: (name: string) => values[name.toLowerCase()] ?? null };
}

describe("the origin email links are built from", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterAll(() => {
    process.env = env;
  });

  it("uses the host the visitor is on", () => {
    expect(authOrigin(requestHeaders({ host: "daet.ph", "x-forwarded-proto": "https" }))).toBe("https://daet.ph");
  });

  it("believes x-forwarded-host behind a proxy", () => {
    const headers = requestHeaders({ host: "internal:3000", "x-forwarded-host": "preview.e2b.app", "x-forwarded-proto": "https" });
    expect(authOrigin(headers)).toBe("https://preview.e2b.app");
  });

  it("keeps a preview port", () => {
    const headers = requestHeaders({ host: "localhost:3101" });
    expect(authOrigin(headers)).toBe("http://localhost:3101");
  });

  it("reads a LAN address as the plain-HTTP development server it is", () => {
    // next dev speaks http; guessing https here built email links that 404'd.
    expect(authOrigin(requestHeaders({ host: "192.168.1.20:3000" }))).toBe("http://192.168.1.20:3000");
    expect(authOrigin(requestHeaders({ host: "10.0.0.7:3000" }))).toBe("http://10.0.0.7:3000");
  });

  it("still assumes TLS for a deployed host, and for the unusual port", () => {
    expect(authOrigin(requestHeaders({ host: "daet-connect.ph" }))).toBe("https://daet-connect.ph");
    expect(authOrigin(requestHeaders({ host: "daet-connect.ph:443" }))).toBe("https://daet-connect.ph:443");
  });

  it("refuses a host that is not only a host — no path, no credentials, no newline", () => {
    for (const host of ["evil.example/steal", "evil.example@daet.ph", "evil.example\nX: y", "a b", ""]) {
      expect(authOrigin(requestHeaders({ host, "x-forwarded-proto": "https" }))).toBe("http://localhost:3000");
    }
  });

  it("lets a configured site win, because that is the address the emails must use", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://daet-connect.ph";
    expect(authOrigin(requestHeaders({ host: "evil.example", "x-forwarded-proto": "https" }))).toBe("https://daet-connect.ph");
  });

  it("ignores a configured value that is not a bare origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://daet.ph/redirect?to=evil";
    expect(authOrigin(requestHeaders({ host: "daet.ph", "x-forwarded-proto": "https" }))).toBe("https://daet.ph");
  });

  it("accepts only https and http schemes from configuration", () => {
    process.env.NEXT_PUBLIC_APP_URL = "javascript:alert(1)";
    expect(authOrigin(requestHeaders({ host: "daet.ph", "x-forwarded-proto": "https" }))).toBe("https://daet.ph");
  });

  it("builds the callback on that origin and nothing else", () => {
    expect(authCallbackUrl("https://daet.ph/")).toBe("https://daet.ph/auth/callback");
    expect(authCallbackUrl("http://localhost:3101")).toBe("http://localhost:3101/auth/callback");
  });
});

describe("hostnames", () => {
  it.each(["daet.ph", "preview-3101.e2b.app", "localhost:3000", "127.0.0.1:54321", "xn--daet-ph-9ya.ph"])(
    "accepts %p",
    (value) => expect(isHostname(value)).toBe(true),
  );

  it.each(["", "daet.ph/x", "daet.ph?x=1", "user@daet.ph", "-daet.ph", "daet..ph", "daet .ph"])("rejects %p", (value) =>
    expect(isHostname(value)).toBe(false),
  );
});

describe("the caller's address", () => {
  it("takes the first forwarded address", () => {
    expect(clientIp(requestHeaders({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip, then to one shared bucket", () => {
    expect(clientIp(requestHeaders({ "x-real-ip": "203.0.113.10" }))).toBe("203.0.113.10");
    expect(clientIp(requestHeaders({}))).toBe("unknown");
  });

  it("refuses a value that is not an address, so a header cannot become a key of its choosing", () => {
    expect(clientIp(requestHeaders({ "x-forwarded-for": "../../etc/passwd" }))).toBe("unknown");
    expect(clientIp(requestHeaders({ "x-forwarded-for": "<script>" }))).toBe("unknown");
  });
});
