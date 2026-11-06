const getUser = jest.fn();
jest.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser }, rpc: jest.fn().mockResolvedValue({ data: null }) }) }));
jest.mock("@/lib/live/server", () => ({ loadLiveSummary: jest.fn().mockResolvedValue({ chatUnread: 0 }) }));

import { GET } from "./route";

describe("GET /api/live/summary", () => {
  it("returns 401 and no data when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await GET(new Request("http://localhost/api/live/summary"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });
  it("returns the summary for a signed-in user", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const response = await GET(new Request("http://localhost/api/live/summary?visible=1"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ chatUnread: 0 });
  });
});
