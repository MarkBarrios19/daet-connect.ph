import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LiveTourBoard } from "@/components/tours/live/live-tour-board";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/tours/operator-access";
import { loadLiveTour } from "@/app/(subsystems)/tours/live/load-live-tour";


type PageProps = { params: Promise<{ bookingId: string }> };

export default async function GuideLivePage({ params }: PageProps) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">Configure Supabase to use the live map.</Notice>
      </PageFrame>
    );
  }
  const { bookingId } = await params;
  if (!isUuid(bookingId)) notFound();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/tours/guide/tours/${bookingId}/live`)}`);

  const tour = await loadLiveTour(bookingId, user.id);
  if (!tour || !tour.isGuide) notFound();

  return (
    <PageFrame>
      <div className="mx-auto max-w-6xl">
        <Link href={`/tours/guide/tours/${bookingId}/roster`} className="mb-4 inline-flex min-h-11 items-center text-sm font-bold text-daet-ink/70 hover:text-daet-ink">
          ← Guest list
        </Link>
        {tour.status !== "confirmed" ? <Notice variant="info" className="mb-4">Live sharing is only for confirmed bookings.</Notice> : null}
        <LiveTourBoard role="guide" {...tour} />
      </div>
    </PageFrame>
  );
}
