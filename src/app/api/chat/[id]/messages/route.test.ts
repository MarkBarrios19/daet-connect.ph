const getUser = jest.fn();
jest.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser }, from: jest.fn() }) }));
jest.mock("@/app/(subsystems)/tours/messages/actions", () => ({ threadExtras: jest.fn() }));

import { GET } from "./route";

const ID = "14f61887-1111-4222-8333-444455556666";
const call = (id: string, query: string) => GET(new Request(`http://localhost/api/chat/${id}/messages${query}`), { params: Promise.resolve({ id }) });

describe("GET /api/chat/[id]/messages", () => {
  it("rejects a bad id or a missing/invalid after", async () => {
    expect((await call("nope", "?after=2026-11-06T00:00:00Z")).status).toBe(400);
    expect((await call(ID, "")).status).toBe(400);
    expect((await call(ID, "?after=garbage")).status).toBe(400);
  });
  it("returns 401 when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call(ID, "?after=2026-11-06T00:00:00Z")).status).toBe(401);
  });
});
