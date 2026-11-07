import { getAuthUser } from "@/lib/tours/server-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AssistantPane } from "@/components/assistant/assistant-pane";
import { LineIcon } from "@/components/ui/icons";
import { PageFrame } from "@/components/ui/page-frame";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { InboxRow } from "@/lib/tours/messaging";
import { InboxList } from "../inbox-list";
import { LiveInbox } from "../live-inbox";

export const metadata = { title: "Daet AI assistant" };

/** The assistant as a pinned chat in Messages, like any other conversation. */
export default async function AiChatPage() {
  if (!isSupabaseConfigured()) redirect("/tours/help");
  const supabase = await createSupabaseServerClient();
  const user = await getAuthUser();
  if (!user) redirect("/tours/help");
  const { data: inboxData } = await supabase.rpc("tours_chat_inbox");
  const inbox = (inboxData ?? []) as InboxRow[];

  return (
    <PageFrame>
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[22rem_1fr]">
        <aside aria-label="Your chats" className="hidden max-h-[calc(100dvh-11rem)] overflow-y-auto lg:block">
          <LiveInbox viewerId={user.id}>
            <InboxList rows={inbox} viewerId={user.id} activeId="ai" />
          </LiveInbox>
        </aside>
        <div className="flex h-[calc(100dvh-11rem)] min-h-[30rem] flex-col overflow-hidden rounded-2xl card-edge bg-surface">
          <AssistantPane
            header={{
              tone: "plain",
              headingLevel: "h1",
              leading: (
                <Link href="/tours/messages" aria-label="All messages" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 lg:hidden">
                  <LineIcon name="arrowRight" className="h-5 w-5 rotate-180" />
                </Link>
              ),
            }}
            chat={{ signedIn: true }}
          />
        </div>
      </div>
    </PageFrame>
  );
}
