import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LiveTourBoard } from "@/components/tours/live/live-tour-board";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/tours/operator-access";
import { loadLiveTour } from "@/app/(subsystems)/tours/live/load-live-tour";
import { getAuthUser } from "@/lib/tours/server-auth";


type PageProps = { params: Promise<{ bookingId: string }> };

export default async function OperatorLiveTourPage({ params }: PageProps) {
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
  const user = await getAuthUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/tours/operator/live/${bookingId}`)}`);

  const tour = await loadLiveTour(bookingId, user.id);
  if (!tour || !tour.isOperator) notFound();

  return (
    <PageFrame>
      <div className="mx-auto max-w-6xl">
        <Link href="/tours/operator/live" className="mb-4 inline-flex min-h-11 items-center text-sm font-bold text-daet-ink/70 hover:text-daet-ink">
          ← Live now
        </Link>
        {!tour.hasGuide ? (
          <Notice variant="info" className="mb-4">
            {tour.guideNotNeeded
              ? "This tour goes ahead without a guide, as the guest asked. You can still share your location from here."
              : "Assign a guide on the bookings page so they can start the live tour."}
          </Notice>
        ) : null}
        <LiveTourBoard role="operator" {...tour} />
      </div>
    </PageFrame>
  );
}
