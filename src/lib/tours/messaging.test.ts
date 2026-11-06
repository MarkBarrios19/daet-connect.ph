import { attachmentPath, chatOperators, chatRpc, dayLabel, describeThread, inboxFilters, isConversationKind, mergeMessages, messageTime, parseMessageForm, presenceOf, senderLabel, type ChatMessage, type ChatTarget, type ConversationHeader } from "@/lib/tours/messaging";

function form(values: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}
const photo = (type = "image/png", size = 10) => new File([new Uint8Array(size)], "p", { type });

describe("parseMessageForm", () => {
  it("accepts text, a photo, or both", () => {
    expect(parseMessageForm(form({ text: "  Hello  " }))).toEqual({ ok: true, data: { text: "Hello", file: null, extension: null } });
    const onlyPhoto = parseMessageForm(form({ text: "", attachment: photo("image/webp") }));
    expect(onlyPhoto.ok && onlyPhoto.data.extension).toBe("webp");
    expect(onlyPhoto.ok && onlyPhoto.data.text).toBeNull();
  });

  it("rejects empty, too long, wrong type and too large", () => {
    expect(parseMessageForm(form({ text: "   " })).ok).toBe(false);
    expect(parseMessageForm(form({ text: "x".repeat(1001) })).ok).toBe(false);
    expect(parseMessageForm(form({ text: "x".repeat(1000) })).ok).toBe(true);
    expect(parseMessageForm(form({ attachment: photo("application/pdf") })).ok).toBe(false);
    expect(parseMessageForm(form({ attachment: photo("image/jpeg", 5 * 1024 * 1024 + 1) })).ok).toBe(false);
  });

  it("ignores an empty file input", () => {
    expect(parseMessageForm(form({ text: "hi", attachment: new File([], "") }))).toEqual({ ok: true, data: { text: "hi", file: null, extension: null } });
  });
});

describe("attachmentPath", () => {
  it("matches the database's expected shape", () => {
    const conv = "9b7e5a5e-0000-4000-8000-000000000001";
    const path = attachmentPath(conv, "jpg");
    expect(path).toMatch(new RegExp(`^${conv}/[0-9a-f-]{36}\\.jpg$`));
  });
});

describe("senderLabel", () => {
  const members = { touristId: "t", touristName: "Juan", operatorProfileId: "o", operatorName: "Bagasbas Tours", guideProfileId: "g" };
  it("labels each party", () => {
    expect(senderLabel("t", "t", members)).toBe("You");
    expect(senderLabel("t", "o", members)).toBe("Juan");
    expect(senderLabel("o", "t", members)).toBe("Bagasbas Tours");
    expect(senderLabel("g", "t", members)).toBe("Your guide");
    expect(senderLabel("x", "t", members)).toBe("CONNECT-Daet");
  });
});

describe("mergeMessages", () => {
  const m = (id: string, at: string): ChatMessage => ({ id, sender_id: "s", message_text: id, attachment_url: null, created_at: at });
  it("dedupes and orders by time", () => {
    const merged = mergeMessages([m("b", "2026-10-23T02:00:00Z"), m("a", "2026-10-23T01:00:00Z")], [m("b", "2026-10-23T02:00:00Z"), m("c", "2026-10-23T03:00:00Z")]);
    expect(merged.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("orders Realtime's Postgres timestamps together with ISO ones", () => {
    const merged = mergeMessages([m("iso", "2026-10-23T02:00:00.000Z")], [m("pg", "2026-10-23 01:30:00.5+00"), m("pg2", "2026-10-23 10:30:00+08")]);
    expect(merged.map((x) => x.id)).toEqual(["pg", "iso", "pg2"]);
  });
});

describe("messageTime", () => {
  it("parses ISO and Postgres text timestamps", () => {
    expect(messageTime("2026-10-23 13:49:50.767+00")).toBe(Date.parse("2026-10-23T13:49:50.767Z"));
    expect(messageTime("2026-10-23T13:49:50.767+00:00")).toBe(Date.parse("2026-10-23T13:49:50.767Z"));
    expect(messageTime("nonsense")).toBe(0);
  });
});

describe("dayLabel", () => {
  const now = new Date("2026-10-23T04:00:00Z"); // noon in Manila
  it("uses Manila days", () => {
    expect(dayLabel("2026-10-22T16:30:00Z", now)).toBe("Today"); // 00:30 Manila on the 23rd
    expect(dayLabel("2026-10-22T15:59:00Z", now)).toBe("Yesterday");
    expect(dayLabel("2026-10-01T04:00:00Z", now)).toContain("Oct");
  });
});

describe("chat channels", () => {
  const bookingId = "11111111-1111-4111-8111-111111111111";
  const otherId = "22222222-2222-4222-8222-222222222222";

  it("maps each chat target to its RPC and rejects bad ids", () => {
    expect(chatRpc({ kind: "booking", bookingId })).toEqual({ fn: "tours_open_booking_conversation", args: { p_booking_id: bookingId } });
    expect(chatRpc({ kind: "guide_tourist", bookingId })).toEqual({ fn: "tours_open_guide_tourist_conversation", args: { p_booking_id: bookingId } });
    expect(chatRpc({ kind: "operator_guide", guideId: otherId })).toEqual({ fn: "tours_open_operator_guide_conversation", args: { p_guide_id: otherId } });
    expect(chatRpc({ kind: "operator_guide", operatorId: otherId })).toEqual({ fn: "tours_open_operator_guide_conversation", args: { p_operator_id: otherId } });
    expect(chatRpc({ kind: "operator_admin" })).toEqual({ fn: "tours_open_operator_admin_conversation", args: {} });
    expect(chatRpc({ kind: "operator_admin", operatorId: otherId })).toEqual({ fn: "tours_open_operator_admin_conversation", args: { p_operator_id: otherId } });

    expect(chatRpc({ kind: "booking", bookingId: "nope" })).toBeNull();
    expect(chatRpc({ kind: "operator_guide" })).toBeNull();
    expect(chatRpc({ kind: "operator_guide", guideId: otherId, operatorId: otherId })).toBeNull();
    expect(chatRpc({ kind: "operator_admin", operatorId: "'; drop" })).toBeNull();
    expect(chatRpc({ kind: "other" } as unknown as ChatTarget)).toBeNull();
  });

  const base: ConversationHeader = {
    id: "c", kind: "booking", is_member: true, booking_id: "b", booking_reference: "TB-1", booking_status: "confirmed",
    tour_date: "2026-11-02", package_title: "Bagasbas Surf", tourist_id: "t", tourist_name: "Juan",
    operator_id: "op", operator_profile_id: "o", operator_name: "Bagasbas Tours", guide_id: "gd", guide_profile_id: "g", guide_name: "Maria",
  };

  it("describes a guide-tourist chat from both sides", () => {
    const header = { ...base, kind: "guide_tourist" as const, operator_profile_id: null };
    const tourist = describeThread(header, "t", "tourist");
    expect(tourist.title).toBe("Your guide: Maria");
    expect(tourist.link).toEqual({ href: "/tours/bookings/b", label: "View booking" });
    expect(tourist.canSend).toBe(true);
    const guide = describeThread(header, "g", "guide");
    expect(guide.title).toBe("Juan");
    expect(guide.link?.href).toBe("/tours/guide/tours/b/roster");
    expect(senderLabel("g", "t", tourist.members)).toBe("Maria");
  });

  it("closes booking chats when the booking is cancelled", () => {
    const view = describeThread({ ...base, kind: "guide_tourist", booking_status: "cancelled" }, "t", "tourist");
    expect(view.canSend).toBe(false);
    expect(view.closedReason).toMatch(/cancelled/);
  });

  it("describes operator-guide and Tourism Office chats", () => {
    const pair = { ...base, kind: "operator_guide" as const, booking_id: null, tourist_id: null, booking_status: null };
    expect(describeThread(pair, "o", "operator").title).toBe("Maria");
    expect(describeThread(pair, "g", "guide").title).toBe("Bagasbas Tours");
    expect(describeThread(pair, "g", "guide").link).toBeNull();

    const office = { ...pair, kind: "operator_admin" as const, guide_profile_id: null, guide_name: null };
    const operatorView = describeThread(office, "o", "operator");
    expect(operatorView.title).toBe("Daet Tourism Office");
    expect(senderLabel("admin-1", "o", operatorView.members)).toBe("Daet Tourism Office");
    const adminView = describeThread(office, "admin-1", "admin");
    expect(adminView.title).toBe("Bagasbas Tours");
    expect(adminView.canSend).toBe(true);
  });

  it("lets admins read but not reply in chats they are not in", () => {
    const view = describeThread({ ...base, is_member: false }, "admin-1", "admin");
    expect(view.canSend).toBe(false);
    expect(view.closedReason).toMatch(/Admins can read/);
  });

  it("offers inbox filters only when there is more than one kind", () => {
    expect(inboxFilters(["booking", "booking"])).toEqual([]);
    expect(inboxFilters(["operator_admin", "booking", "nonsense"]).map((f) => f.label)).toEqual(["All", "Booking chats", "Tourism Office"]);
    expect(isConversationKind("guide_tourist")).toBe(true);
    expect(isConversationKind("x")).toBe(false);
  });

  it("lists each operator once, by name", () => {
    const op = (id: string, business_name: string) => ({ tours_packages: { tours_operators: { id, business_name } } });
    expect(chatOperators([op("2", "Zeta"), op("1", "Alpha"), op("2", "Zeta"), { tours_packages: null }, { tours_packages: [{ tours_operators: [{ id: "3", business_name: "Mid" }] }] }]))
      .toEqual([{ id: "1", business_name: "Alpha" }, { id: "3", business_name: "Mid" }, { id: "2", business_name: "Zeta" }]);
  });
});

describe("tourist ↔ Tourism Office chat", () => {
  const touristId = "33333333-3333-4333-8333-333333333333";
  it("opens the caller's own chat, or a named tourist's for admins", () => {
    expect(chatRpc({ kind: "tourist_office" })).toEqual({ fn: "tours_open_tourist_office_conversation", args: {} });
    expect(chatRpc({ kind: "tourist_office", touristId })).toEqual({ fn: "tours_open_tourist_office_conversation", args: { p_tourist_id: touristId } });
    expect(chatRpc({ kind: "tourist_office", touristId: "nope" })).toBeNull();
  });
  it("shows the office to the tourist and the tourist to admins", () => {
    const header: ConversationHeader = {
      id: "c", kind: "tourist_office", is_member: true, booking_id: null, booking_reference: null, booking_status: null, tour_date: null, package_title: null,
      tourist_id: "t", tourist_name: "Juan", operator_id: null, operator_profile_id: null, operator_name: null, guide_id: null, guide_profile_id: null, guide_name: null,
    };
    const tourist = describeThread(header, "t", "tourist");
    expect(tourist.title).toBe("Daet Tourism Office");
    expect(tourist.link).toBeNull();
    expect(senderLabel("admin-1", "t", tourist.members)).toBe("Daet Tourism Office");
    expect(describeThread(header, "admin-1", "admin").title).toBe("Juan");
    expect(inboxFilters(["booking", "tourist_office"]).map((f) => f.label)).toEqual(["All", "Booking chats", "Tourism Office help"]);
  });
});

describe("presenceOf", () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();
  it("is online within two minutes, recent up to an hour, then nothing", () => {
    expect(presenceOf(ago(30_000), now)).toEqual({ state: "online", label: null });
    expect(presenceOf(ago(13 * 60_000), now)).toEqual({ state: "recent", label: "13m" });
    expect(presenceOf(ago(2 * 3600_000), now)).toEqual({ state: "offline", label: null });
    expect(presenceOf(null, now)).toEqual({ state: "offline", label: null });
  });
});
