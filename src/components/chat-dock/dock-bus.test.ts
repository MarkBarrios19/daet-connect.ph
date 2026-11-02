/** @jest-environment jsdom */

import { DOCK_BUSY_EVENT, dockClose, dockMinimize, dockOpen, setDockBusy } from "@/components/chat-dock/dock-bus";

describe("chat dock", () => {
  it("keeps two chats open, newest first, and folds older ones into heads", () => {
    let s = { open: [] as string[], heads: [] as string[] };
    s = dockOpen(s, "a");
    s = dockOpen(s, "b");
    s = dockOpen(s, "c");
    expect(s).toEqual({ open: ["c", "b"], heads: ["a"] });
    s = dockOpen(s, "a");
    expect(s).toEqual({ open: ["a", "c"], heads: ["b"] });
  });

  it("announces whether a window is on screen, so the floating pill can stand down", () => {
    const heard: boolean[] = [];
    const listen = (event: Event) => heard.push(Boolean((event as CustomEvent<{ busy: boolean }>).detail.busy));
    window.addEventListener(DOCK_BUSY_EVENT, listen);
    setDockBusy(true);
    setDockBusy(false);
    window.removeEventListener(DOCK_BUSY_EVENT, listen);
    expect(heard).toEqual([true, false]);
  });

  it("minimizes to a head and closes completely", () => {
    let s = { open: ["a", "b"], heads: ["c"] };
    s = dockMinimize(s, "a");
    expect(s).toEqual({ open: ["b"], heads: ["a", "c"] });
    s = dockClose(s, "a");
    expect(s).toEqual({ open: ["b"], heads: ["c"] });
  });
});
