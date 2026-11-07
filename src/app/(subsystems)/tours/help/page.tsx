import type { Metadata } from "next";
import Link from "next/link";
import { AssistantChat } from "@/components/assistant/assistant-chat";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";

export const metadata: Metadata = { title: "Help", description: "Ask the Daet AI assistant, your 24/7 local guide: food, places to stay, directions, trip costs, tours and your bookings." };

export default async function HelpPage() {
  let signedIn = false;
  if (isSupabaseConfigured()) {
    try {
      signedIn = Boolean((await getAuthenticatedSession()).user);
    } catch {
      signedIn = false;
    }
  }
  return (
    <PageFrame>
      <div className="mx-auto max-w-2xl">
        <h1 className="display-2 text-daet-ink">Daet AI assistant</h1>
        <p className="mt-3 text-lg leading-relaxed text-daet-ink">
          Ask about tours, open dates and prices, places and events, how to pay or cancel, or your own bookings. The assistant only reads; you make bookings and payments yourself. For anything it can&apos;t answer, it passes you to the operator or the Daet Tourism Office.
        </p>
        <p className="mt-4 text-base text-daet-ink">
          In a hurry? The{" "}
          <Link href="/tours/faq" className="font-bold text-blue-700 underline underline-offset-2 dark:text-blue-300">
            common questions
          </Link>{" "}
          answer booking, paying, cancelling and getting here in one line each.
        </p>
        <div className="mt-6 flex h-[70dvh] min-h-[28rem] flex-col overflow-hidden rounded-2xl card-edge bg-surface">
          <AssistantChat signedIn={signedIn} />
        </div>
      </div>
    </PageFrame>
  );
}
