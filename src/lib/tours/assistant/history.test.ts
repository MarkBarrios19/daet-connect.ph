import type { SupabaseClient } from "@supabase/supabase-js";
import { savingReply } from "@/lib/tours/assistant/history";
import type { AssistantEvent } from "@/lib/tours/assistant/respond";

function stub() {
  const insert = jest.fn().mockResolvedValue({ error: null });
  return { supabase: { from: jest.fn(() => ({ insert })) } as unknown as SupabaseClient, insert };
}

async function* events(list: AssistantEvent[]) {
  for (const e of list) yield e;
}

async function drain(gen: AsyncGenerator<AssistantEvent>) {
  const out: AssistantEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe("saved assistant chats", () => {
  it("passes the reply through and saves the question and the finished answer", async () => {
    const { supabase, insert } = stub();
    const reply: AssistantEvent[] = [
      { t: "mode", mode: "basic" },
      { t: "text", v: "Food near " },
      { t: "text", v: "Bagasbas." },
      { t: "cards", cards: [{ type: "link", href: "/x", label: "X" }] },
      { t: "done" },
    ];
    expect(await drain(savingReply(events(reply), supabase, " Where to eat? "))).toEqual(reply);
    const rows = insert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toEqual([
      expect.objectContaining({ role: "user", content: "Where to eat?" }),
      expect.objectContaining({ role: "assistant", content: "Food near Bagasbas.", cards: [{ type: "link", href: "/x", label: "X" }], mode: "basic" }),
    ]);
    // The answer is stamped after the question, so the chat never loads them the other way round.
    expect(Date.parse(String(rows[1].created_at))).toBeGreaterThan(Date.parse(String(rows[0].created_at)));
  });

  it("saves nothing when the reply did not finish or was empty", async () => {
    const { supabase, insert } = stub();
    await drain(savingReply(events([{ t: "text", v: "Half" }]), supabase, "Q"));
    await drain(savingReply(events([{ t: "error", message: "Send a message" }, { t: "done" }]), supabase, "Q"));
    expect(insert).not.toHaveBeenCalled();
  });
});
