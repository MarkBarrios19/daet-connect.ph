import { loadGuideNotNeeded, loadGuideNotNeededFor } from "@/lib/tours/guide-not-needed-server";

jest.mock("server-only", () => ({}));

type Result = { data?: unknown; error?: { code: string; message: string } | null };

/** The builder these reads leave behind: select().in().not(), then awaited. */
function fakeClient(result: Result) {
  const calls: string[] = [];
  const query = {
    select(columns: string) {
      calls.push(`select ${columns}`);
      return query;
    },
    in(column: string, values: string[]) {
      calls.push(`in ${column}=${values.join(",")}`);
      return query;
    },
    not(column: string, operator: string, value: unknown) {
      calls.push(`not ${column} ${operator} ${String(value)}`);
      return query;
    },
    then(resolve: (value: unknown) => void) {
      resolve(result);
    },
  };
  return { client: { from: () => query } as never, calls };
}

describe("loadGuideNotNeeded", () => {
  it("reads the requests in one query, skipping bookings nobody asked about", async () => {
    const { client, calls } = fakeClient({
      data: [
        { id: "b1", guide_not_needed_at: "2026-11-09T02:00:00Z", guide_not_needed_note: "Guest asked in chat" },
        { id: "b2", guide_not_needed_at: "2026-11-09T03:00:00Z", guide_not_needed_note: null },
      ],
      error: null,
    });

    const flags = await loadGuideNotNeeded(client, ["b1", "b2", "b3", "b1"]);

    expect([...flags.entries()]).toEqual([
      ["b1", { at: "2026-11-09T02:00:00Z", note: "Guest asked in chat" }],
      ["b2", { at: "2026-11-09T03:00:00Z", note: null }],
    ]);
    // Deduplicated, and asked only for rows that carry a request.
    expect(calls[1]).toBe("in id=b1,b2,b3");
    expect(calls[2]).toBe("not guide_not_needed_at is null");
  });

  it("asks nothing when there are no bookings", async () => {
    const { client, calls } = fakeClient({ data: [], error: null });

    expect((await loadGuideNotNeeded(client, [])).size).toBe(0);
    expect(calls).toEqual([]);
  });

  it("treats a database without the migration as 'nobody asked'", async () => {
    // This is the state the Vercel preview was in: code deployed, SQL not run.
    const { client } = fakeClient({
      error: { code: "42703", message: "column tours_bookings.guide_not_needed_at does not exist" },
    });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const error = jest.spyOn(console, "error").mockImplementation(() => {});

    const flags = await loadGuideNotNeeded(client, ["b1"]);

    expect(flags.size).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("20261201_guide_not_needed.sql"));
    // Expected while the SQL is pending, so not an error.
    expect(error).not.toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
  });

  it("logs real failures and still returns an empty map", async () => {
    const { client } = fakeClient({ error: { code: "42501", message: "permission denied for table tours_bookings" } });
    const error = jest.spyOn(console, "error").mockImplementation(() => {});

    expect((await loadGuideNotNeeded(client, ["b1"])).size).toBe(0);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("loadGuideNotNeededFor", () => {
  it("returns the booking's own request, or null", async () => {
    const asked = fakeClient({
      data: [{ id: "b1", guide_not_needed_at: "2026-11-09T02:00:00Z", guide_not_needed_note: null }],
      error: null,
    });
    expect(await loadGuideNotNeededFor(asked.client, "b1")).toEqual({ at: "2026-11-09T02:00:00Z", note: null });

    const none = fakeClient({ data: [], error: null });
    expect(await loadGuideNotNeededFor(none.client, "b1")).toBeNull();
  });
});
