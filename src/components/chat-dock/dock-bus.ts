/**
 * Opening chats in the desktop dock. The dock marks itself active on wide
 * screens; "Message …" buttons and the assistant bubble then open chats
 * there instead of navigating away. "ai" is the Daet AI assistant.
 */

export const DOCK_OPEN_EVENT = "daet:dock-open";

/**
 * A chat window is on screen (not just a minimised head). The floating
 * assistant pill sits exactly where an open window lands, so it hides while
 * this is true: the assistant is already there, one minimise away.
 */
export const DOCK_BUSY_EVENT = "daet:dock-busy";
const ACTIVE_FLAG = "__daetDockActive";

type DockWindow = Window & { [ACTIVE_FLAG]?: boolean };

export function setDockActive(active: boolean) {
  (window as DockWindow)[ACTIVE_FLAG] = active;
}

export function setDockBusy(busy: boolean) {
  window.dispatchEvent(new CustomEvent(DOCK_BUSY_EVENT, { detail: { busy } }));
}

export function dockAvailable(): boolean {
  return typeof window !== "undefined" && Boolean((window as DockWindow)[ACTIVE_FLAG]);
}

/** Opens a chat in the dock; false when there is no dock (phones), so the caller navigates instead. */
export function openInDock(id: string): boolean {
  if (!dockAvailable()) return false;
  window.dispatchEvent(new CustomEvent(DOCK_OPEN_EVENT, { detail: { id } }));
  return true;
}

export const DOCK_MAX_OPEN = 2;

/** Opening a chat brings it to the front; older ones fold into chat heads. */
export function dockOpen(state: { open: string[]; heads: string[] }, id: string): { open: string[]; heads: string[] } {
  const open = [id, ...state.open.filter((x) => x !== id)];
  const overflow = open.slice(DOCK_MAX_OPEN);
  return { open: open.slice(0, DOCK_MAX_OPEN), heads: [...overflow, ...state.heads.filter((x) => x !== id && !overflow.includes(x))].slice(0, 6) };
}

export function dockMinimize(state: { open: string[]; heads: string[] }, id: string) {
  return { open: state.open.filter((x) => x !== id), heads: [id, ...state.heads.filter((x) => x !== id)].slice(0, 6) };
}

export function dockClose(state: { open: string[]; heads: string[] }, id: string) {
  return { open: state.open.filter((x) => x !== id), heads: state.heads.filter((x) => x !== id) };
}

/** The assistant finished a reply. The dock marks its minimised head unread when no window shows it. */
export const ASSISTANT_REPLY_EVENT = "daet:assistant-reply";

export function announceAssistantReply() {
  window.dispatchEvent(new Event(ASSISTANT_REPLY_EVENT));
}

/** Ids with an unread reply after the assistant answered: only a chat that is not open on screen collects one. */
export function unreadAfterReply(open: readonly string[], unread: readonly string[], id = "ai"): string[] {
  return open.includes(id) || unread.includes(id) ? [...unread] : [...unread, id];
}

/** Opening a chat reads it. */
export function markRead(unread: readonly string[], id: string): string[] {
  return unread.filter((x) => x !== id);
}
