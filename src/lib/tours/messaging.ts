/**
 * Chat rules shared by the server actions and the thread UI. The
 * database trigger tours_messages_before_insert enforces the same limits.
 */

export const MESSAGE_MAX_LENGTH = 1000;
export const MESSAGE_ATTACHMENT_BUCKET = "tours-message-attachments";
export const MESSAGE_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const MESSAGE_PAGE_SIZE = 100;
export const MESSAGE_ATTACHMENT_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

type AttachmentType = keyof typeof MESSAGE_ATTACHMENT_TYPES;

export type MessageInput = {
  text: string | null;
  file: File | null;
  extension: (typeof MESSAGE_ATTACHMENT_TYPES)[AttachmentType] | null;
};

export function parseMessageForm(formData: FormData): { ok: true; data: MessageInput } | { ok: false; error: string } {
  const text = String(formData.get("text") ?? "").trim();
  const raw = formData.get("attachment");
  const file = raw instanceof File && raw.size > 0 ? raw : null;

  if (!text && !file) return { ok: false, error: "Write a message or attach a photo." };
  if (text.length > MESSAGE_MAX_LENGTH) return { ok: false, error: `Messages can be at most ${MESSAGE_MAX_LENGTH} characters.` };

  if (!file) return { ok: true, data: { text, file: null, extension: null } };
  if (!(file.type in MESSAGE_ATTACHMENT_TYPES)) return { ok: false, error: "Attach a JPG, PNG or WebP photo." };
  if (file.size > MESSAGE_ATTACHMENT_MAX_BYTES) return { ok: false, error: "Photos can be at most 5 MB." };
  return { ok: true, data: { text: text || null, file, extension: MESSAGE_ATTACHMENT_TYPES[file.type as AttachmentType] } };
}

export function attachmentPath(conversationId: string, extension: string, id: string = crypto.randomUUID()): string {
  return `${conversationId}/${id}.${extension}`;
}

export type ChatRole = "tourist" | "operator" | "guide" | "admin";

/**
 * booking: the booking's group chat (tourist, operator, assigned guide).
 * guide_tourist: the booking's tourist and assigned guide only.
 * operator_guide: one operator and one guide.
 * operator_admin: one operator and the Tourism Office (every admin).
 * tourist_office: one signed-in person and the Tourism Office (every admin).
 */
export const CONVERSATION_KINDS = ["booking", "guide_tourist", "operator_guide", "operator_admin", "tourist_office"] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

export const KIND_LABELS: Record<ConversationKind, string> = {
  booking: "Booking chats",
  guide_tourist: "Guide & tourist",
  operator_guide: "Operator & guide",
  operator_admin: "Tourism Office",
  tourist_office: "Tourism Office help",
};

export const TOURISM_OFFICE_NAME = "Daet Tourism Office";

export function isConversationKind(value: unknown): value is ConversationKind {
  return typeof value === "string" && (CONVERSATION_KINDS as readonly string[]).includes(value);
}

export type ChatMembers = {
  touristId: string | null;
  touristName: string;
  operatorProfileId: string | null;
  operatorName: string;
  guideProfileId: string | null;
  guideName?: string | null;
  /** Label for senders outside the members above (admins in a Tourism Office chat). */
  otherName?: string;
};

/** Who sent a message, for the bubble label ("You" for the viewer). */
export function senderLabel(senderId: string, viewerId: string, members: ChatMembers): string {
  if (senderId === viewerId) return "You";
  if (senderId === members.touristId) return members.touristName;
  if (senderId === members.operatorProfileId) return members.operatorName;
  if (senderId === members.guideProfileId) return members.guideName || "Your guide";
  return members.otherName ?? "CONNECT-Daet";
}

/** What to open: maps a chat target to its RPC. Ids are checked again in the database. */
export type ChatTarget =
  | { kind: "booking"; bookingId: string }
  | { kind: "guide_tourist"; bookingId: string }
  | { kind: "operator_guide"; guideId?: string; operatorId?: string }
  | { kind: "operator_admin"; operatorId?: string }
  | { kind: "tourist_office"; touristId?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function chatRpc(target: ChatTarget): { fn: string; args: Record<string, string> } | null {
  const id = (value: string | undefined) => (value !== undefined && UUID.test(value) ? value : null);
  switch (target?.kind) {
    case "booking":
    case "guide_tourist": {
      const bookingId = id(target.bookingId);
      if (!bookingId) return null;
      const fn = target.kind === "booking" ? "tours_open_booking_conversation" : "tours_open_guide_tourist_conversation";
      return { fn, args: { p_booking_id: bookingId } };
    }
    case "operator_guide": {
      const guideId = id(target.guideId);
      const operatorId = id(target.operatorId);
      if (!guideId === !operatorId) return null; // exactly one side, the other is the caller
      return { fn: "tours_open_operator_guide_conversation", args: guideId ? { p_guide_id: guideId } : { p_operator_id: operatorId! } };
    }
    case "operator_admin": {
      if (target.operatorId === undefined) return { fn: "tours_open_operator_admin_conversation", args: {} };
      const operatorId = id(target.operatorId);
      return operatorId ? { fn: "tours_open_operator_admin_conversation", args: { p_operator_id: operatorId } } : null;
    }
    case "tourist_office": {
      if (target.touristId === undefined) return { fn: "tours_open_tourist_office_conversation", args: {} };
      const touristId = id(target.touristId);
      return touristId ? { fn: "tours_open_tourist_office_conversation", args: { p_tourist_id: touristId } } : null;
    }
    default:
      return null;
  }
}

/** Row of tours_conversation_header(). */
export type ConversationHeader = {
  id: string;
  kind: ConversationKind;
  is_member: boolean;
  booking_id: string | null;
  booking_reference: string | null;
  booking_status: string | null;
  tour_date: string | null;
  package_title: string | null;
  tourist_id: string | null;
  tourist_name: string | null;
  operator_id: string | null;
  operator_profile_id: string | null;
  operator_name: string | null;
  guide_id: string | null;
  guide_profile_id: string | null;
  guide_name: string | null;
};

export type ThreadView = {
  title: string;
  subtitle: string;
  members: ChatMembers;
  link: { href: string; label: string } | null;
  canSend: boolean;
  closedReason: string | null;
  emptyText: string;
};

/** Header text, sender labels and reply rules for one thread, as seen by the viewer. */
export function describeThread(header: ConversationHeader, viewerId: string, viewerRole: string | null): ThreadView {
  const operatorName = header.operator_name ?? "Operator";
  const guideName = header.guide_name ?? null;
  const members: ChatMembers = {
    touristId: header.tourist_id,
    touristName: header.tourist_name ?? "Tourist",
    operatorProfileId: header.operator_profile_id,
    operatorName,
    guideProfileId: header.guide_profile_id,
    guideName,
    otherName: header.kind === "operator_admin" || header.kind === "tourist_office" ? TOURISM_OFFICE_NAME : undefined,
  };
  const isTourist = viewerId === header.tourist_id;
  const isGuide = viewerId === header.guide_profile_id;
  const isOperator = viewerId === header.operator_profile_id;
  const ref = [header.booking_reference, header.tour_date ? tourDay(header.tour_date) : null].filter(Boolean).join(" · ");
  const bookingLink = (): ThreadView["link"] => {
    if (!header.booking_id) return null;
    if (isTourist) return { href: `/tours/bookings/${header.booking_id}`, label: "View booking" };
    if (isGuide) return { href: `/tours/guide/tours/${header.booking_id}/roster`, label: "View roster" };
    if (isOperator) return { href: "/tours/operator/bookings", label: "View bookings" };
    return null;
  };

  let title: string;
  let subtitle: string;
  let link = bookingLink();
  let emptyText = "No messages yet. Say hello and ask anything about the tour.";
  switch (header.kind) {
    case "guide_tourist":
      title = isTourist ? `Your guide${guideName ? `: ${guideName}` : ""}` : header.tourist_name ?? "Tourist";
      subtitle = [header.package_title ?? "Tour booking", ref, "Only you and the other person can read this"].filter(Boolean).join(" · ");
      emptyText = isTourist ? "Ask your guide about the meeting point, what to bring or the weather." : "Say hello and share meeting-point details with the tourist.";
      break;
    case "operator_guide":
      title = isOperator ? guideName ?? "Guide" : operatorName;
      subtitle = isOperator ? "Tour guide · private chat" : "Tour operator · private chat";
      emptyText = "No messages yet. Coordinate schedules, assignments and tour details here.";
      break;
    case "operator_admin":
      title = isOperator ? TOURISM_OFFICE_NAME : operatorName;
      subtitle = isOperator ? "Questions about accreditation, packages, events or payouts" : "Operator · Tourism Office support chat";
      link = !isOperator && viewerRole === "admin" && header.operator_id ? { href: "/tours/admin/operators", label: "Operator applications" } : null;
      emptyText = isOperator ? "Ask the Tourism Office about accreditation, packages, events or payouts." : "No messages yet.";
      break;
    case "tourist_office":
      title = isTourist ? TOURISM_OFFICE_NAME : header.tourist_name ?? "Tourist";
      subtitle = isTourist ? "Questions, requests and complaints · private chat" : "Tourist · help request";
      link = null;
      emptyText = isTourist ? "Ask the Daet Tourism Office anything about your visit." : "No messages yet.";
      break;
    default:
      title = header.package_title ?? "Tour booking";
      subtitle = [ref, operatorName, header.tourist_name, header.guide_profile_id ? "guide assigned" : null].filter(Boolean).join(" · ");
  }

  const closed = (header.kind === "booking" || header.kind === "guide_tourist") && (header.booking_status === "cancelled" || header.booking_status === "rejected");
  return {
    title,
    subtitle,
    members,
    link,
    canSend: header.is_member && !closed,
    closedReason: closed ? "This booking was cancelled, so the chat is read-only." : !header.is_member ? "Admins can read this chat but not reply." : null,
    emptyText,
  };
}

const tourDay = (dateKey: string) =>
  new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });

/** Filter chips for the inbox: "All" plus each kind the viewer has, in a fixed order. */
export function inboxFilters(kinds: string[]): Array<{ kind: ConversationKind | null; label: string }> {
  const present = CONVERSATION_KINDS.filter((kind) => kinds.includes(kind));
  if (present.length < 2) return [];
  return [{ kind: null, label: "All" }, ...present.map((kind) => ({ kind, label: KIND_LABELS[kind] }))];
}

export type ChatMessage = {
  id: string;
  sender_id: string;
  message_text: string | null;
  attachment_url: string | null;
  created_at: string;
  /** The message this one quotes, in the same chat. */
  reply_to_id?: string | null;
};

export const MESSAGE_COLUMNS = "id, sender_id, message_text, attachment_url, created_at, reply_to_id";

/**
 * Milliseconds for a timestamp from PostgREST (ISO) or Realtime, which can
 * send Postgres text form ("2026-10-23 13:49:50.767+00").
 */
export function messageTime(value: string): number {
  const iso = value.trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const time = Date.parse(iso);
  return Number.isNaN(time) ? 0 : time;
}

/** Adds messages (from the server or Realtime) once each, oldest first. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, { ...byId.get(message.id), ...message });
  return [...byId.values()].sort((a, b) => messageTime(a.created_at) - messageTime(b.created_at) || a.id.localeCompare(b.id));
}

/** Manila day label for grouping messages ("Today", "Yesterday", or a date). */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const key = (value: Date) => new Date(value.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const day = key(new Date(messageTime(iso)));
  if (day === key(now)) return "Today";
  if (day === key(new Date(now.getTime() - 86400000))) return "Yesterday";
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

type Embedded<T> = T | T[] | null | undefined;
const first = <T,>(value: Embedded<T>): T | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));

/** Distinct operators from rows embedding tours_packages ( tours_operators ( id, business_name ) ), by name. */
export function chatOperators(
  rows: Array<{ tours_packages: Embedded<{ tours_operators: Embedded<{ id: string; business_name: string }> }> }>,
): Array<{ id: string; business_name: string }> {
  const byId = new Map<string, { id: string; business_name: string }>();
  for (const row of rows) {
    const operator = first(first(row.tours_packages)?.tours_operators);
    if (operator?.id && !byId.has(operator.id)) byId.set(operator.id, { id: operator.id, business_name: operator.business_name });
  }
  return [...byId.values()].sort((a, b) => a.business_name.localeCompare(b.business_name));
}

/** One row of the inbox (tours_chat_inbox). */
export type InboxRow = {
  conversation_id: string;
  kind: string;
  title: string | null;
  subtitle: string | null;
  last_message_at: string;
  last_message: string | null;
  last_sender_id: string | null;
  unread: number;
  /** The person on the other end (null for the Tourism Office), their photo and last activity. */
  other_profile_id?: string | null;
  other_avatar_url?: string | null;
  other_last_seen?: string | null;
};

/** Online within this long of the last heartbeat; "recent" up to an hour. */
export const ONLINE_WINDOW_MS = 2 * 60 * 1000;
export const RECENT_WINDOW_MS = 60 * 60 * 1000;

export type Presence = { state: "online" | "recent" | "offline"; /** "13m" or "2h", only when recent */ label: string | null };

/** Messenger-style status from a last-seen time: online now, active Nm/Nh ago, or nothing. */
export function presenceOf(lastSeen: string | null | undefined, now: number = Date.now()): Presence {
  if (!lastSeen) return { state: "offline", label: null };
  const age = now - new Date(lastSeen).getTime();
  if (!Number.isFinite(age) || age > RECENT_WINDOW_MS) return { state: "offline", label: null };
  if (age <= ONLINE_WINDOW_MS) return { state: "online", label: null };
  const minutes = Math.round(age / 60000);
  return { state: "recent", label: minutes < 60 ? `${minutes}m` : "1h" };
}
