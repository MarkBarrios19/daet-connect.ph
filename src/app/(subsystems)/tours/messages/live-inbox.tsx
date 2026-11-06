"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { useLive } from "@/components/live/live-provider";

/**
 * Keeps the chat list current. The shared live poll reports when any of the
 * viewer's chats got a new message (Realtime makes that sooner); the list
 * then refreshes. A chat being read in this tab refreshes it too.
 */
export function LiveInbox({ children }: { viewerId?: string; children: ReactNode }) {
  const router = useRouter();
  const stamp = useLive()?.summary.chatStamp ?? null;
  const seen = useRef(stamp);
  useEffect(() => {
    if (stamp === seen.current) return;
    seen.current = stamp;
    const timer = window.setTimeout(() => router.refresh(), 300);
    return () => window.clearTimeout(timer);
  }, [stamp, router]);
  useEffect(() => {
    let timer: number | null = null;
    const onRead = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => router.refresh(), 400);
    };
    window.addEventListener("daet:chat-read", onRead);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("daet:chat-read", onRead);
    };
  }, [router]);
  return <>{children}</>;
}
