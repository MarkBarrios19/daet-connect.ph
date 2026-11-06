"use client";

import { useRef } from "react";
import { AssistantChat } from "@/components/assistant/assistant-chat";
import { AssistantHeader } from "@/components/assistant/assistant-header";
import type { ChatActions } from "@/components/assistant/chat-actions";

type HeaderProps = Omit<React.ComponentProps<typeof AssistantHeader>, "actionsRef">;
type ChatProps = Omit<React.ComponentProps<typeof AssistantChat>, "actionsRef">;

/** The assistant header and conversation wired together: the header's "⋯" menu acts on this chat. */
export function AssistantPane({ header, chat }: { header?: HeaderProps; chat: ChatProps }) {
  const actionsRef = useRef<ChatActions | null>(null);
  return (
    <>
      <AssistantHeader actionsRef={actionsRef} {...header} />
      <AssistantChat {...chat} actionsRef={actionsRef} />
    </>
  );
}
