/**
 * @jest-environment jsdom
 */
import { act, render } from "@testing-library/react";
import { LiveProvider } from "./live-provider";

const refresh = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ refresh }),
}));
jest.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
jest.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => {
    const channel = { on: () => channel, subscribe: () => channel };
    return { channel: () => channel, removeChannel: jest.fn() };
  },
}));
jest.mock("@/app/(subsystems)/tours/notifications/actions", () => ({ markNotificationsRead: jest.fn() }));

const initial = { userId: "user-1", items: [], unread: 0 };

beforeEach(() => {
  jest.useFakeTimers();
  refresh.mockReset();
  global.fetch = jest.fn().mockResolvedValue({ status: 401, ok: false }) as unknown as typeof fetch;
});
afterEach(() => jest.useRealTimers());

describe("LiveProvider when the session has ended", () => {
  it("refreshes the route once, so a stale signed-in header is redrawn", async () => {
    render(<LiveProvider initial={initial}><p>page</p></LiveProvider>);
    await act(async () => { await Promise.resolve(); });
    expect(refresh).toHaveBeenCalledTimes(1);

    // Later polls keep getting 401; the route is not refreshed again.
    for (let i = 0; i < 3; i += 1) {
      await act(async () => { jest.advanceTimersByTime(60_000); });
    }
    expect((global.fetch as jest.Mock).mock.calls.length).toBeGreaterThan(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh while the session is good", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ notifications: { unread: 0, items: [] }, chatUnread: 0, chatStamp: null }),
    }) as unknown as typeof fetch;
    render(<LiveProvider initial={initial}><p>page</p></LiveProvider>);
    await act(async () => { await Promise.resolve(); });
    expect(refresh).not.toHaveBeenCalled();
  });
});
