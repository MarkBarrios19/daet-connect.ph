import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { PageBody } from "@/components/ui/signed-in-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { timed } from "@/lib/server-timing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedSession, getAuthUser } from "@/lib/tours/server-auth";
import { OpenChatButton } from "@/app/(subsystems)/tours/messages/open-chat-button";
import { inboxFilters, isConversationKind, type InboxRow } from "@/lib/tours/messaging";
import { InboxList } from "@/app/(subsystems)/tours/messages/inbox-list";
import { LiveInbox } from "@/app/(subsystems)/tours/messages/live-inbox";



type PageProps = { searchParams: Promise<{ kind?: string }> };

export default function MessagesInboxPage({ searchParams }: PageProps) {
  // The heading is the same for everyone, so it is in the prerendered shell;
  // the conversations wait for the person.
  return (
    <PageBody>
      <div className="mx-auto max-w-2xl">
        <h1 className="display-2 text-daet-ink">Messages</h1>
        <p className="mt-2 text-daet-ink">Booking chats, private chats with your guide or tourists, operator–guide chats and Tourism Office support. Only the people in a chat can read it.</p>
        <Suspense fallback={<InboxSkeleton />}>
          <Inbox searchParams={searchParams} />
        </Suspense>
      </div>
    </PageBody>
  );
}

function InboxSkeleton() {
  return (
    <div aria-busy="true" className="mt-6">
      <p role="status" className="sr-only">
        Loading your messages
      </p>
      <div aria-hidden="true" className="animate-pulse space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl card-edge bg-surface p-4">
            <div className="h-12 w-12 shrink-0 rounded-full bg-daet-ink/10" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-5 w-1/2 rounded-full bg-daet-ink/10" />
              <div className="h-4 w-3/4 rounded-full bg-daet-ink/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

async function Inbox({ searchParams }: PageProps) {
  if (!isSupabaseConfigured()) {
    return (
      <Notice variant="warning" title="Supabase setup needed" className="mt-6">Configure Supabase to use messages.</Notice>
    );
  }

  const user = await getAuthUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/tours/messages")}`);
  const supabase = await createSupabaseServerClient();

  const { kind: rawKind } = await searchParams;
  // The inbox and the role (only an admin gets the operator list) need only the
  // user, so they are asked for together.
  const [{ data, error }, session] = await Promise.all([
    timed("page:messages", async () => supabase.rpc("tours_chat_inbox")),
    getAuthenticatedSession(),
  ]);
  if (error) console.error("Inbox error:", error);
  const all = (data ?? []) as InboxRow[];
  const filters = inboxFilters(all.map((row) => row.kind));
  const kind = isConversationKind(rawKind) && filters.some((f) => f.kind === rawKind) ? rawKind : null;
  const rows = kind ? all.filter((row) => row.kind === kind) : all;

  // The Tourism Office can start a chat with any operator.
  const isAdmin = session.role === "admin";
  const { data: operatorList } = isAdmin
    ? await supabase.from("tours_operators").select("id, business_name, accreditation_status").order("business_name").limit(200)
    : { data: null };

  return (
    <>
    {filters.length > 0 ? (
      <nav aria-label="Filter conversations" className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {filters.map((filter) => {
          const active = filter.kind === kind;
          return (
            <Link
              key={filter.label}
              href={filter.kind ? `/tours/messages?kind=${filter.kind}` : "/tours/messages"}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-[15px] font-bold transition active:scale-[0.98] ${active ? "bg-blue-600 text-white" : "bg-surface text-daet-ink hover:bg-blue-50 dark:hover:bg-blue-950/40"}`}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>
    ) : null}

    {isAdmin ? (
      <details className="mt-4 rounded-2xl card-edge bg-surface p-4">
        <summary className="min-h-11 cursor-pointer content-center text-sm font-bold text-daet-forest dark:text-blue-300">Message an operator</summary>
        {(operatorList ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-daet-ink/70">No operators have registered yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-daet-ink/10">
            {(operatorList ?? []).map((operator) => (
              <li key={operator.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-sm font-bold text-daet-ink">
                  {operator.business_name} <span className="font-normal text-daet-ink/70">· {String(operator.accreditation_status)}</span>
                </span>
                <OpenChatButton target={{ kind: "operator_admin", operatorId: operator.id }} label="Message" variant="ghost" />
              </li>
            ))}
          </ul>
        )}
      </details>
    ) : null}

    {error ? <Notice variant="error" className="mt-6">Messages could not be loaded. Refresh to try again.</Notice> : null}
    <div className="mt-6">
      <LiveInbox viewerId={user.id}>
        <InboxList rows={rows} viewerId={user.id} />
      </LiveInbox>
    </div>
    </>
  );
}
