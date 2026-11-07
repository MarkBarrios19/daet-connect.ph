import { getAuthUser } from "@/lib/tours/server-auth";
import { notFound, redirect } from "next/navigation";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { describeThread, KIND_LABELS, MESSAGE_COLUMNS, MESSAGE_PAGE_SIZE, type ChatMessage, type ConversationHeader, type InboxRow } from "@/lib/tours/messaging";
import { ChatWindow } from "@/components/chat/chat-window";
import { InboxList } from "../inbox-list";
import { LiveInbox } from "../live-inbox";
import { isUuid } from "@/lib/tours/operator-access";
import { markConversationRead, readMarks, threadExtras } from "../actions";


type PageProps = { params: Promise<{ id: string }> };

export default async function ConversationPage({ params }: PageProps) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">Configure Supabase to use messages.</Notice>
      </PageFrame>
    );
  }

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const user = await getAuthUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/tours/messages/${id}`)}`);

  // Members (and admins) get the header; everyone else gets null.
  const { data: rawHeader, error: headerError } = await supabase.rpc("tours_conversation_header", { p_conversation_id: id });
  if (headerError) console.error("Conversation header error:", headerError);
  const header = rawHeader as ConversationHeader | null;
  if (!header) notFound();
  const view = describeThread(header, user.id, (await getAuthenticatedSession()).role);

  const [{ data: latest }, { data: inboxData }] = await Promise.all([
    supabase.from("tours_messages").select(MESSAGE_COLUMNS).eq("conversation_id", header.id).order("created_at", { ascending: false }).limit(MESSAGE_PAGE_SIZE),
    supabase.rpc("tours_chat_inbox"),
  ]);
  const messages = ((latest ?? []) as ChatMessage[]).reverse();
  const [extras, marks] = await Promise.all([threadExtras(header.id, messages), header.is_member ? readMarks(header.id) : Promise.resolve([])]);
  if (header.is_member) await markConversationRead(header.id);
  const inbox = (inboxData ?? []) as InboxRow[];

  return (
    <PageFrame>
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[22rem_1fr]">
        <aside aria-label="Your chats" className="hidden max-h-[calc(100dvh-11rem)] overflow-y-auto lg:block">
          <LiveInbox viewerId={user.id}>
            <InboxList rows={inbox} viewerId={user.id} activeId={header.id} />
          </LiveInbox>
        </aside>
        <div className="h-[calc(100dvh-11rem)] min-h-[30rem] overflow-hidden rounded-2xl card-edge bg-surface">
          <ChatWindow
            key={header.id}
            conversationId={header.id}
            viewerId={user.id}
            members={view.members}
            title={view.title}
            subtitle={[KIND_LABELS[header.kind] ?? "Chat", view.subtitle].filter(Boolean).join(" · ")}
            link={view.link}
            otherLastSeen={inbox.find((row) => row.conversation_id === header.id)?.other_last_seen ?? null}
            initialMessages={messages}
            initialAttachmentUrls={extras.attachmentUrls}
            initialReactions={extras.reactions}
            initialQuoted={extras.quoted}
            initialReadMarks={marks}
            canSend={view.canSend}
            closedReason={view.closedReason}
            emptyText={view.emptyText}
            backHref="/tours/messages"
            headingLevel={1}
          />
        </div>
      </div>
    </PageFrame>
  );
}
